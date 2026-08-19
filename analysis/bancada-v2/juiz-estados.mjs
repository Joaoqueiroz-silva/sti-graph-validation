#!/usr/bin/env node
/**
 * analysis/bancada-v2/juiz-estados.mjs — PRECISÃO JULGADA dos ESTADOS
 * (2026-08-19). Fecha a parte que o juiz de misconceptions não cobre.
 *
 * PROBLEMA. `precisaoEstados` (linha-de-base.mjs) é ESTRUTURAL: estado do
 * agente que não casa com nenhum estado de valor do especialista conta como
 * falso positivo, mesmo quando é um passo de decomposição legítimo que o
 * especialista simplesmente não modelou. Como o F1 usa essa precisão, o F1
 * publicado é um PISO. Aqui o piso vira estimativa julgada.
 *
 * PERGUNTA AO JUIZ (cega à origem): "num tutor passo a passo deste problema,
 * este valor é um alvo legítimo de algum passo?"
 *
 * CONTROLES — e por que são estes. O controle "valor de outro problema" NÃO
 * serve: um valor que não está nem no enunciado nem no caminho do especialista
 * é estruturalmente idêntico ao objeto de estudo (o passo intermediário não
 * planejado), e o controle rejeitaria justamente o que se quer medir. Usam-se:
 *  - `distrator-erro-do-especialista`: os wrongAnswer das misconceptions do
 *    próprio .brd — por construção valores que o aluno produz POR ENGANO, não
 *    alvos de passo. Juiz bom rejeita.
 *  - `distrator-absurdo`: valor fora de escala (×1000+7). Juiz bom rejeita.
 *  - `especialista`: os valores dos passos do próprio .brd. Juiz bom aceita.
 * LIMITAÇÃO DECLARADA: o controle negativo aqui é mais fraco que o do juiz de
 * misconceptions, pela razão acima. Está no pré-registro.
 *
 * Gates (mesmos limiares do juiz de extras): especialista >= 0,80 E rejeição
 * dos distratores >= 0,80; senão "descalibrado", sem veredito.
 *
 * Uso: node -r dotenv/config analysis/bancada-v2/juiz-estados.mjs --saida <dir> --yes
 */
import fs from "node:fs";
import path from "node:path";
import { createLLM, callLLM, extractJson } from "../../llm.js";
import { carregarReferencia, media } from "../validacao-v2/lib.mjs";
import { canonizarValor, caminhoDeReferencia } from "./comparar-caminho.mjs";
import { wilsonCI } from "../../stats.js";
import { problemsDirRelativo } from "../../dataset-config.js";
import { CORPORA_JUIZ, BRACOS, GATE_CALIBRACAO } from "./juiz-extras-materializado.mjs";

const SYSTEM = `Você é especialista em desenho de tutores inteligentes passo a passo (modelo CTAT: o aluno preenche um campo por vez até resolver o problema).

Avalia se um VALOR é alvo legítimo de algum passo do tutor para o problema dado — isto é, se faz sentido pedir ao aluno que produza esse valor em alguma etapa da resolução (resultado intermediário, parte da resposta, quantidade lida do enunciado, ou a própria resposta final).

LEGÍTIMO = existe uma etapa razoável da resolução deste problema em que se pede exatamente esse valor.
NÃO legítimo se: for um valor que só apareceria por ERRO do aluno ("erro_de_aluno"); estiver fora de escala ou não fizer sentido no contexto ("fora_de_contexto"); ou não tiver relação com o problema ("irrelevante").

Você NÃO sabe de onde o valor veio. Avalie UM valor por vez, com rigor.

Retorne SOMENTE JSON puro:
{ "valid": true|false, "category": "alvo_legitimo|erro_de_aluno|fora_de_contexto|irrelevante", "reason": "1 frase curta" }`;

const buildUser = (problema, resposta, candidato) => `PROBLEMA: ${problema}
RESPOSTA FINAL CORRETA: ${resposta}
VALOR A AVALIAR (só este): ${candidato}

Esse valor é alvo legítimo de algum passo do tutor para este problema?`;

export async function julgarEstado(problema, resposta, candidato, opts = {}) {
  if (opts.judge) return opts.judge(problema, resposta, candidato, opts);
  const llm = createLLM("agent9_review");
  const raw = await callLLM(llm, SYSTEM, buildUser(problema, resposta, candidato));
  const j = extractJson(raw) || {};
  return { candidate: String(candidato), valid: j.valid === true, category: String(j.category ?? "") };
}

/** Distrator absurdo determinístico: número fora de escala; não numérico → sentinela. */
export function absurdo(valor) {
  const n = Number(String(valor).replace(",", "."));
  if (Number.isFinite(n) && n !== 0) return String(Math.round(Math.abs(n) * 1000 + 7));
  return "999999";
}

export function planejarEstados({ raiz = ".", filtroCorpus = null, limitEx = Infinity } = {}) {
  const plano = [];
  for (const c of CORPORA_JUIZ) {
    if (filtroCorpus && !c.chave.startsWith(filtroCorpus)) continue;
    process.env.STI_DATASET = c.dataset;
    const REF = carregarReferencia(raiz);
    const problemas = problemsDirRelativo();
    for (const braco of BRACOS) {
      const runsDir = path.join(raiz, c.pasta, `materializado-v3-fixa-${braco}`, "runs");
      if (!fs.existsSync(runsDir)) continue;
      const porEx = new Map();
      for (const f of fs.readdirSync(runsDir).filter((x) => x.endsWith(".json")).sort()) {
        const r = JSON.parse(fs.readFileSync(path.join(runsDir, f), "utf8"));
        const ex = r.exercicio ?? r.id;
        const g = r.materializado?.grafo;
        if (!REF[ex] || !g) continue;
        const m = porEx.get(ex) ?? new Map();
        for (const p of g.passos || []) {
          const v = canonizarValor(p.valor);
          if (v && !m.has(v)) m.set(v, String(p.valor));
        }
        porEx.set(ex, m);
      }
      let usados = 0;
      for (const [ex, m] of [...porEx.entries()].sort()) {
        if (usados++ >= limitEx) break;
        const ref = REF[ex];
        const envA = JSON.parse(fs.readFileSync(path.join(raiz, problemas, ex, "envelope-a.json"), "utf8"));
        const envB = JSON.parse(fs.readFileSync(path.join(raiz, problemas, ex, "envelope-b.json"), "utf8"));
        const refCaminho = caminhoDeReferencia(envB, ref).filter((r) => r.comResposta && r.estado);
        const estadosRef = new Set(refCaminho.map((r) => r.estado));
        const cands = [...m.entries()].map(([valor, bruto]) => ({ valor, bruto }));
        const extras = cands.filter((x) => !estadosRef.has(x.valor));
        const itens = [
          ...extras.map((x) => ({ candidate: x.bruto, source: "robo-extra" })),
          ...refCaminho.map((r) => ({ candidate: r.bruto || r.estado, source: "especialista" })),
          ...(ref.items || []).slice(0, 3).map((i) => ({ candidate: i.bruto, source: "distrator-erro-do-especialista" })),
          { candidate: absurdo(ref.resposta), source: "distrator-absurdo" },
        ].filter((i) => String(i.candidate ?? "").trim().length > 0);
        plano.push({ corpus: c.chave, braco, ex, enunciado: envA.problem, resposta: ref.resposta, itens, cands, extras, estadosRef });
      }
    }
  }
  return plano;
}

export function consolidarEstados(linhas, julgados) {
  const grupos = {};
  for (const j of julgados) {
    const g = (grupos[j.source] ||= { n: 0, valid: 0 });
    g.n++;
    if (j.valid) g.valid++;
  }
  for (const g of Object.values(grupos)) g.validRate = g.n ? g.valid / g.n : null;
  const taxa = (s) => {
    const g = grupos[s];
    if (!g) return { n: 0, rate: null, ci: [null, null] };
    const ci = wilsonCI(g.valid, g.n);
    return { n: g.n, rate: g.validRate, ci: [ci.lower, ci.upper] };
  };
  const tExp = taxa("especialista");
  const tExtra = taxa("robo-extra");
  const dist = Object.entries(grupos).filter(([s]) => s.startsWith("distrator"));
  const nDist = dist.reduce((s, [, g]) => s + g.n, 0);
  const rej = dist.reduce((s, [, g]) => s + (g.n - g.valid), 0);
  const taxaRejeicao = nDist ? rej / nDist : null;
  const calibrado = (tExp.rate ?? 0) >= GATE_CALIBRACAO && (taxaRejeicao ?? 0) >= GATE_CALIBRACAO;
  return {
    calibracao: { especialista: tExp, rejeicaoDistratores: { n: nDist, rate: taxaRejeicao }, porDistrator: Object.fromEntries(dist) },
    extras: tExtra,
    calibrado,
    precisaoEstruturalMedia: media(linhas.map((l) => l.precisaoEstrutural)),
    precisaoJulgadaMedia: media(linhas.map((l) => l.precisaoJulgada)),
    porOrigem: grupos,
  };
}

const ehMain = process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (ehMain) {
  const argv = process.argv.slice(2);
  const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
  const saidaDir = opt("--saida", "resultados/juizo-2026-08-19");
  if (!process.env.OPENROUTER_API_KEY) { console.error("OPENROUTER_API_KEY ausente."); process.exit(1); }
  const plano = planejarEstados({ filtroCorpus: opt("--corpus", null), limitEx: parseInt(opt("--limit", "1000000"), 10) });
  const nItens = plano.reduce((s, p) => s + p.itens.length, 0);
  console.log(`JUIZ DE ESTADOS — ${plano.length} exercício×braço, ${plano.reduce((s, p) => s + p.extras.length, 0)} estados extras, ${nItens} itens`);
  console.log(`  juiz: ${process.env.JUDGE_MODEL || "z-ai/glm-4.5 (default)"} | custo estimado ~US$ ${((nItens * (700 * 0.93 + 120 * 3.0)) / 1e6).toFixed(2)}`);
  if (!argv.includes("--yes")) { console.error("Execução PAGA: confirme com --yes."); process.exit(1); }
  fs.mkdirSync(saidaDir, { recursive: true });
  const linhas = [];
  let julgados = [];
  let feitos = 0;
  let proxima = 0;
  const trabalhador = async () => {
    while (proxima < plano.length) {
      const p = plano[proxima++];
      const r = await Promise.all(p.itens.map(async (it) => ({ ...it, ...(await julgarEstado(p.enunciado, p.resposta, it.candidate)) })));
      julgados = julgados.concat(r.map((j) => ({ ...j, corpus: p.corpus, braco: p.braco, ex: p.ex })));
      const validos = new Set(r.filter((j) => j.source === "robo-extra" && j.valid).map((j) => j.candidate));
      const casados = p.cands.filter((c) => p.estadosRef.has(c.valor)).length;
      const extrasValidos = p.extras.filter((c) => validos.has(c.bruto)).length;
      linhas.push({
        corpus: p.corpus, braco: p.braco, ex: p.ex,
        candidatos: p.cands.length, extras: p.extras.length, extrasValidos,
        precisaoEstrutural: p.cands.length ? casados / p.cands.length : 0,
        precisaoJulgada: p.cands.length ? (casados + extrasValidos) / p.cands.length : 0,
      });
      feitos++;
      console.log(`  [${feitos}/${plano.length}] ${p.corpus}/${p.braco}/${p.ex}: ${p.extras.length} extras, ${extrasValidos} válidos | precisão ${linhas.at(-1).precisaoEstrutural.toFixed(2)} → ${linhas.at(-1).precisaoJulgada.toFixed(2)}`);
      fs.writeFileSync(path.join(saidaDir, "juiz-estados-parcial.json"), JSON.stringify({ linhas, julgados }, null, 1));
    }
  };
  await Promise.all(Array.from({ length: 3 }, trabalhador));
  linhas.sort((a, b) => `${a.corpus}${a.braco}${a.ex}`.localeCompare(`${b.corpus}${b.braco}${b.ex}`));
  const geral = consolidarEstados(linhas, julgados);
  const porCelula = {};
  for (const c of CORPORA_JUIZ) for (const b of BRACOS) {
    const sel = linhas.filter((l) => l.corpus === c.chave && l.braco === b);
    if (sel.length) porCelula[`${c.chave}/${b}`] = consolidarEstados(sel, julgados.filter((j) => j.corpus === c.chave && j.braco === b));
  }
  fs.writeFileSync(path.join(saidaDir, "juiz-estados.json"), JSON.stringify({
    gerado: new Date().toISOString(), juiz: process.env.JUDGE_MODEL || "z-ai/glm-4.5",
    preRegistro: "docs/PRE-REGISTRO-JUIZ-E-DICAS-2026-08-19.md",
    geral, porCelula, porExercicio: linhas,
    julgamentos: julgados.map(({ corpus, braco, ex, candidate, source, valid, category }) => ({ corpus, braco, ex, candidate, source, valid, category })),
  }, null, 1));
  console.log("─".repeat(74));
  console.log(`  especialista: ${geral.calibracao.especialista.rate} (n=${geral.calibracao.especialista.n}) | rejeição distratores: ${geral.calibracao.rejeicaoDistratores.rate?.toFixed(3)} (n=${geral.calibracao.rejeicaoDistratores.n})`);
  console.log(`  validade dos ESTADOS extras: ${geral.extras.rate} (n=${geral.extras.n})`);
  console.log(`  GATE: ${geral.calibrado ? "APROVADO" : "REPROVADO"} | precisão estrutural ${geral.precisaoEstruturalMedia.toFixed(4)} → julgada ${geral.precisaoJulgadaMedia.toFixed(4)}`);
}
