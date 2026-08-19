#!/usr/bin/env node
/**
 * analysis/bancada-v2/juiz-dicas.mjs — JUIZ CEGO das ESCADAS DE DICAS
 * (2026-08-19). Pré-registro: docs/PRE-REGISTRO-JUIZ-E-DICAS-2026-08-19.md.
 *
 * POR QUE PONTUAÇÃO ABSOLUTA, E NÃO PREFERÊNCIA PAREADA. A escada do CTAT
 * termina entregando o valor (bottom-out) e a do agente é PROIBIDA de fazer
 * isso por gate de produção (decisão de produto de 02/08/2026, ver
 * producao/agents/patterns/quality-gate.js). Perguntar "qual é melhor" viraria
 * um referendo sobre essa política. Cada escada é julgada sozinha, cega à
 * origem, numa rubrica fixa.
 *
 * DIMENSÕES (0–3): especificidade, escalonamento, acionabilidade.
 * BOOLEANOS: correcao (nada matematicamente errado) e entregaResposta (a
 * escada declara o valor final) — este último é DESCRITIVO, não pontuado.
 *
 * CONTROLES NEGATIVOS no mesmo lote e cegos:
 *  - `controle-estrangeiro`: escada de OUTRO exercício do mesmo corpus, servida
 *    para este passo → tem de cair em `especificidade`;
 *  - `controle-embaralhado`: a escada real com os níveis fora de ordem → tem de
 *    cair em `escalonamento`.
 *
 * GATE (pré-declarado): especificidade(estrangeiro) <= média(real) − 0,5 E
 * escalonamento(embaralhado) < escalonamento(ordenado). Falhando qualquer um:
 * "juiz de dicas descalibrado", sem veredito.
 *
 * Uso: node -r dotenv/config analysis/bancada-v2/juiz-dicas.mjs --saida <dir> --yes
 */
import fs from "node:fs";
import path from "node:path";
import { callLLM, extractJson } from "../../llm.js";
import { llmDoJuiz, mapaResiliente, separarFalhas } from "./juiz-infra.mjs";
import { carregarReferencia, media, prng } from "../validacao-v2/lib.mjs";
import { pontuarDicas } from "./comparar-dicas.mjs";
import { problemsDirRelativo } from "../../dataset-config.js";
import { CORPORA_JUIZ, BRACOS } from "./juiz-extras-materializado.mjs";

export const MARGEM_ESTRANGEIRO = 0.5;
export const DIMENSOES = ["especificidade", "escalonamento", "acionabilidade"];

const SYSTEM = `Você é especialista em tutoria de matemática. Avalia uma ESCADA DE DICAS: a sequência de dicas que um tutor inteligente mostra, uma por vez, a um aluno que travou num passo do problema.

Você NÃO sabe quem escreveu a escada. Julgue só o que está escrito.

Pontue de 0 a 3:
- especificidade: a escada fala DESTE problema e DESTE passo (usa as quantidades, o contexto e o que se pede), em vez de conselho genérico que serviria a qualquer exercício. 0 = totalmente genérica; 3 = totalmente ancorada neste passo.
- escalonamento: cada dica acrescenta informação nova em relação à anterior, indo do mais geral ao mais concreto. 0 = repete ou está fora de ordem; 3 = progressão clara e útil.
- acionabilidade: depois da ÚLTIMA dica, um aluno travado sabe o que fazer em seguida. 0 = continua sem saber; 3 = sabe exatamente o próximo movimento.

E responda dois booleanos:
- correcao: true se NADA na escada está matematicamente errado para este passo.
- entregaResposta: true se a escada declara explicitamente o valor final esperado.

Retorne SOMENTE JSON puro:
{ "especificidade": 0-3, "escalonamento": 0-3, "acionabilidade": 0-3, "correcao": true|false, "entregaResposta": true|false, "razao": "1 frase curta" }`;

function buildUser(problema, valorEsperado, escada) {
  const niveis = escada.map((h, i) => `  ${i + 1}. ${h}`).join("\n");
  return `PROBLEMA: ${problema}
PASSO EM QUE O ALUNO TRAVOU — valor esperado: ${valorEsperado}

ESCADA DE DICAS (na ordem em que o aluno as veria):
${niveis}

Avalie esta escada.`;
}

/** Julga UMA escada. `opts.judge` injeta um juiz fake (testes offline). */
export async function julgarEscada(problema, valorEsperado, escada, opts = {}) {
  if (opts.judge) return opts.judge(problema, valorEsperado, escada, opts);
  const llm = llmDoJuiz();
  const raw = await callLLM(llm, SYSTEM, buildUser(problema, valorEsperado, escada));
  const j = extractJson(raw) || {};
  const nota = (x) => (Number.isFinite(Number(x)) ? Math.max(0, Math.min(3, Number(x))) : null);
  return {
    especificidade: nota(j.especificidade),
    escalonamento: nota(j.escalonamento),
    acionabilidade: nota(j.acionabilidade),
    correcao: j.correcao === true,
    entregaResposta: j.entregaResposta === true,
    razao: String(j.razao ?? "").slice(0, 200),
  };
}

/** Embaralhamento determinístico que NUNCA devolve a ordem original (n>=2). */
export function embaralharDeterminista(escada, semente = 7) {
  if (escada.length < 2) return null;
  const rnd = prng(semente);
  const a = escada.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  if (a.every((x, i) => x === escada[i])) return escada.slice().reverse();
  return a;
}

/**
 * Monta o lote de escadas a julgar. Amostragem declarada: UMA réplica por
 * exercício × braço (a primeira em ordem de arquivo), todos os estados casados
 * dela; a escada do especialista entra UMA vez por (corpus, exercício, estado).
 */
export function planejarDicas({ raiz = ".", filtroCorpus = null, limitEx = Infinity } = {}) {
  const itens = [];
  for (const c of CORPORA_JUIZ) {
    if (filtroCorpus && !c.chave.startsWith(filtroCorpus)) continue;
    process.env.STI_DATASET = c.dataset;
    const REF = carregarReferencia(raiz);
    const problemas = problemsDirRelativo();
    const escadasRefPorEx = new Map(); // ex → [escadas do especialista] (para o controle estrangeiro)
    const vistosRef = new Set();
    for (const braco of BRACOS) {
      const runsDir = path.join(raiz, c.pasta, `materializado-v3-fixa-${braco}`, "runs");
      if (!fs.existsSync(runsDir)) continue;
      const arquivos = fs.readdirSync(runsDir).filter((x) => x.endsWith(".json")).sort();
      const primeiraPorEx = new Map();
      for (const f of arquivos) {
        const r = JSON.parse(fs.readFileSync(path.join(runsDir, f), "utf8"));
        const ex = r.exercicio ?? r.id;
        if (!REF[ex] || !r.materializado?.grafo) continue;
        if (!primeiraPorEx.has(ex)) primeiraPorEx.set(ex, r);
      }
      let usados = 0;
      for (const [ex, r] of [...primeiraPorEx.entries()].sort()) {
        if (usados++ >= limitEx) break;
        const envA = JSON.parse(fs.readFileSync(path.join(raiz, problemas, ex, "envelope-a.json"), "utf8"));
        const envB = JSON.parse(fs.readFileSync(path.join(raiz, problemas, ex, "envelope-b.json"), "utf8"));
        const { pares } = pontuarDicas({ ...r, grafo: r.materializado.grafo }, envB, REF[ex]);
        for (const p of pares) {
          const base = { corpus: c.chave, ex, ordemRef: p.ordemRef, problema: envA.problem, valor: p.valor };
          if (p.escadaAgente.length) itens.push({ ...base, origem: `agente-${braco}`, escada: p.escadaAgente });
          const chaveRef = `${c.chave}|${ex}|${p.ordemRef}`;
          if (p.escadaRef.length && !vistosRef.has(chaveRef)) {
            vistosRef.add(chaveRef);
            itens.push({ ...base, origem: "especialista", escada: p.escadaRef });
            const lista = escadasRefPorEx.get(ex) || [];
            lista.push({ escada: p.escadaRef, ordemRef: p.ordemRef });
            escadasRefPorEx.set(ex, lista);
          }
        }
      }
    }
    // controles: um por exercício, derivados das escadas do ESPECIALISTA
    const exs = [...escadasRefPorEx.keys()].sort();
    exs.forEach((ex, i) => {
      const minhas = escadasRefPorEx.get(ex);
      if (!minhas?.length) return;
      const alvo = itens.find((it) => it.ex === ex && it.origem === "especialista");
      if (!alvo) return;
      // ESTRANGEIRO: escada do exercício seguinte (circular), servida para este passo
      const outro = escadasRefPorEx.get(exs[(i + 1) % exs.length]);
      if (outro?.length && exs.length > 1) {
        itens.push({ ...alvo, origem: "controle-estrangeiro", escada: outro[0].escada, escadaDe: exs[(i + 1) % exs.length] });
      }
      // EMBARALHADO: a própria escada, fora de ordem
      const emb = embaralharDeterminista(alvo.escada, 7 + i);
      if (emb) itens.push({ ...alvo, origem: "controle-embaralhado", escada: emb });
    });
  }
  return itens;
}

export const custoEstimadoDicas = (n) => (n * (900 * 0.93 + 160 * 3.0)) / 1e6;

/** Agrega notas por origem e aplica o gate pré-declarado. */
export function consolidarDicas(julgados) {
  const porOrigem = {};
  for (const j of julgados) {
    const g = (porOrigem[j.origem] ||= { n: 0, notas: {}, correcao: 0, entregaResposta: 0 });
    g.n++;
    for (const d of DIMENSOES) (g.notas[d] ||= []).push(j[d]);
    if (j.correcao) g.correcao++;
    if (j.entregaResposta) g.entregaResposta++;
  }
  for (const g of Object.values(porOrigem)) {
    for (const d of DIMENSOES) g.notas[d] = media(g.notas[d].filter((x) => x !== null && x !== undefined));
    g.taxaCorrecao = g.n ? g.correcao / g.n : null;
    g.taxaEntregaResposta = g.n ? g.entregaResposta / g.n : null;
  }
  const reais = Object.entries(porOrigem).filter(([o]) => o === "especialista" || o.startsWith("agente-"));
  const espReal = reais.length ? media(reais.map(([, g]) => g.notas.especificidade)) : null;
  const estrangeiro = porOrigem["controle-estrangeiro"]?.notas.especificidade ?? null;
  const embaralhado = porOrigem["controle-embaralhado"]?.notas.escalonamento ?? null;
  const ordenado = porOrigem["especialista"]?.notas.escalonamento ?? null;
  const passaEstrangeiro = espReal !== null && estrangeiro !== null && estrangeiro <= espReal - MARGEM_ESTRANGEIRO;
  const passaEmbaralhado = embaralhado !== null && ordenado !== null && embaralhado < ordenado;
  return {
    porOrigem,
    controles: { especificidadeReal: espReal, especificidadeEstrangeiro: estrangeiro, escalonamentoOrdenado: ordenado, escalonamentoEmbaralhado: embaralhado },
    gate: { passaEstrangeiro, passaEmbaralhado, calibrado: passaEstrangeiro && passaEmbaralhado, margem: MARGEM_ESTRANGEIRO },
  };
}

const ehMain = process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (ehMain) {
  const argv = process.argv.slice(2);
  const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
  const saidaDir = opt("--saida", "resultados/juizo-2026-08-19");
  if (!process.env.OPENROUTER_API_KEY) { console.error("OPENROUTER_API_KEY ausente."); process.exit(1); }
  const lote = planejarDicas({ filtroCorpus: opt("--corpus", null), limitEx: parseInt(opt("--limit", "1000000"), 10) });
  const contagem = lote.reduce((m, i) => ({ ...m, [i.origem]: (m[i.origem] || 0) + 1 }), {});
  console.log(`JUIZ DE DICAS — ${lote.length} escadas | ${JSON.stringify(contagem)}`);
  console.log(`  juiz: ${process.env.JUDGE_MODEL || "z-ai/glm-4.5 (default)"} | custo estimado ~US$ ${custoEstimadoDicas(lote.length).toFixed(2)}`);
  if (!argv.includes("--yes")) { console.error("Execução PAGA: confirme com --yes."); process.exit(1); }
  fs.mkdirSync(saidaDir, { recursive: true });
  const brutosAteAqui = [];
  let feitos = 0;
  const brutos = await mapaResiliente(lote, async (it) => {
    const r = { ...it, ...(await julgarEscada(it.problema, it.valor, it.escada)) };
    delete r.problema;
    if (++feitos % 25 === 0) {
      console.log(`  [${feitos}/${lote.length}]`);
      fs.writeFileSync(path.join(saidaDir, "juiz-dicas-parcial.json"), JSON.stringify(brutosAteAqui, null, 1));
    }
    brutosAteAqui.push(r);
    return r;
  }, { concorrencia: 8 });
  const { ok: julgados, falhas, taxaFalha } = separarFalhas(brutos);
  console.log(`  itens sem veredito (falha de rede esgotada): ${falhas.length} (${(taxaFalha * 100).toFixed(2)}%)`);
  const R = { ...consolidarDicas(julgados), falhas: { n: falhas.length, taxa: taxaFalha } };
  fs.writeFileSync(path.join(saidaDir, "juiz-dicas.json"), JSON.stringify({
    gerado: new Date().toISOString(), juiz: process.env.JUDGE_MODEL || "z-ai/glm-4.5",
    preRegistro: "docs/PRE-REGISTRO-JUIZ-E-DICAS-2026-08-19.md", ...R, julgamentos: julgados,
  }, null, 1));
  console.log("─".repeat(74));
  for (const [o, g] of Object.entries(R.porOrigem)) {
    console.log(`  ${o.padEnd(24)} n=${String(g.n).padStart(4)} | esp ${g.notas.especificidade?.toFixed(2)} esc ${g.notas.escalonamento?.toFixed(2)} aci ${g.notas.acionabilidade?.toFixed(2)} | correta ${(g.taxaCorrecao * 100).toFixed(0)}% | entrega resposta ${(g.taxaEntregaResposta * 100).toFixed(0)}%`);
  }
  console.log(`  GATE: ${R.gate.calibrado ? "APROVADO" : "REPROVADO — números não utilizáveis"} (estrangeiro ${R.gate.passaEstrangeiro}, embaralhado ${R.gate.passaEmbaralhado})`);
}
