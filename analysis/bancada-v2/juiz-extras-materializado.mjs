#!/usr/bin/env node
/**
 * analysis/bancada-v2/juiz-extras-materializado.mjs — PRECISÃO JULGADA dos
 * extras no EXPERIMENTO CONSOLIDADO (5 corpora × 2 braços, 2026-08-19).
 *
 * Sucessor multi-corpus de juiz-cego.mjs, que rodou em 14/08 sobre os grafos
 * CRUS do estágio 3 de um corpus só (6.17), antes da interface fixa. Aqui o
 * objeto é o que o artigo reporta: `materializado.grafo.erros` dos registros
 * v3 (agentes espelhados da produção 5263488).
 *
 * Protocolo: reuso byte a byte de judge-misconceptions.js — juiz CEGO à origem,
 * calibração com os erros do PRÓPRIO especialista e controles negativos
 * (resposta correta, equivalente, impossível, absurdo).
 *
 * JUIZ PRIMÁRIO = z-ai/glm-4.5 (default do repo). O juiz de 14/08
 * (openai/gpt-5.6-luna) NÃO pode ser primário aqui: é o modelo que MATERIALIZA
 * o grafo (agent 6), e julgaria a si mesmo. Ver o pré-registro
 * docs/PRE-REGISTRO-JUIZ-E-DICAS-2026-08-19.md.
 *
 * Gates pré-declarados (idênticos aos de 14/08):
 *  - calibração: especialista >= 0,80 E rejeição de distratores >= 0,80;
 *    falhando, o resultado é "descalibrado" e NÃO há veredito;
 *  - riqueza: validadeExtras >= validadeEspecialista - 0,10.
 *
 * Uso: node -r dotenv/config analysis/bancada-v2/juiz-extras-materializado.mjs \
 *        [--corpus <prefixo>] [--braco <nome>] [--limit N] --saida <dir> --yes
 */
import fs from "node:fs";
import path from "node:path";
import { carregarReferencia, media } from "../validacao-v2/lib.mjs";
import { canonizarValor } from "./comparar-caminho.mjs";
import { buildJudgeItems, judgeItems, summarizeBySource, makeDistractors } from "../../judge-misconceptions.js";
import { wilsonCI } from "../../stats.js";
import { problemsDirRelativo } from "../../dataset-config.js";

export const GATE_CALIBRACAO = 0.8;
export const MARGEM_RIQUEZA = 0.1;

/** Corpora do experimento consolidado: rótulo curto → { dataset, pasta }. */
export const CORPORA_JUIZ = [
  { chave: "6.17", dataset: "frac-numberline-6.17", pasta: "resultados/rodada4-interface-fixa-2026-08-15" },
  { chave: "6.19", dataset: "frac-estimates-6.19", pasta: "resultados/bloco1-mathtutor-2026-08-16/6.19" },
  { chave: "6.18", dataset: "equiv-fractions-6.18", pasta: "resultados/bloco1-mathtutor-2026-08-16/6.18" },
  { chave: "6.20", dataset: "fraction-ordering-6.20", pasta: "resultados/bloco1-mathtutor-2026-08-16/6.20" },
  { chave: "8.12", dataset: "factors-scaling-8.12", pasta: "resultados/bloco1-mathtutor-2026-08-16/8.12" },
];
export const BRACOS = ["custo-beneficio", "estudantes-qwen"];

/**
 * Candidatos de UM exercício × braço: união das réplicas do grafo
 * MATERIALIZADO, deduplicados por valor canônico (mesma regra de 14/08).
 */
export function candidatosMaterializados(runsDir, REF) {
  const porEx = new Map();
  for (const f of fs.readdirSync(runsDir).filter((x) => x.endsWith(".json")).sort()) {
    const r = JSON.parse(fs.readFileSync(path.join(runsDir, f), "utf8"));
    const ex = r.exercicio ?? r.id;
    const g = r.materializado?.grafo;
    if (!REF[ex] || !g) continue;
    const m = porEx.get(ex) ?? new Map();
    for (const e of g.erros || []) {
      const valor = canonizarValor(e.valor);
      if (!valor) continue;
      if (!m.has(valor)) m.set(valor, { valor, bruto: String(e.valor), passo: Number(e.passo) || null });
    }
    porEx.set(ex, m);
  }
  return porEx;
}

/** Monta o plano de julgamento (sem chamar o juiz) — permite estimar custo antes. */
export function planejar({ raiz = ".", filtroCorpus = null, filtroBraco = null, limit = Infinity } = {}) {
  const plano = [];
  for (const c of CORPORA_JUIZ) {
    if (filtroCorpus && !c.chave.startsWith(filtroCorpus)) continue;
    process.env.STI_DATASET = c.dataset;
    const REF = carregarReferencia(raiz);
    const problemas = problemsDirRelativo();
    for (const braco of BRACOS) {
      if (filtroBraco && braco !== filtroBraco) continue;
      const runsDir = path.join(raiz, c.pasta, `materializado-v3-fixa-${braco}`, "runs");
      if (!fs.existsSync(runsDir)) continue;
      const porEx = candidatosMaterializados(runsDir, REF);
      let usados = 0;
      for (const [ex, m] of [...porEx.entries()].sort()) {
        if (usados++ >= limit) break;
        const ref = REF[ex];
        const cands = [...m.values()];
        const extras = cands.filter((c2) => !ref.values.has(c2.valor));
        const itens = buildJudgeItems({
          robotExtras: extras.map((c2) => c2.bruto),
          expertConceptual: ref.items.map((i) => i.bruto),
          distractors: makeDistractors(ref.resposta),
        });
        const envA = JSON.parse(fs.readFileSync(path.join(raiz, problemas, ex, "envelope-a.json"), "utf8"));
        plano.push({ corpus: c.chave, dataset: c.dataset, braco, ex, enunciado: envA.problem, resposta: ref.resposta, itens, cands, extras, refValues: ref.values });
      }
    }
  }
  return plano;
}

/** Custo estimado (GLM-4.5: US$0,93/M entrada, US$3,00/M saída; ~700 in / ~120 out por item). */
export const custoEstimado = (nItens) => (nItens * (700 * 0.93 + 120 * 3.0)) / 1e6;

export function consolidarVeredito(linhas, julgadosTodos) {
  const grupos = summarizeBySource(julgadosTodos);
  const taxa = (src) => {
    const g = grupos[src];
    if (!g) return { n: 0, rate: null, ci: [null, null] };
    const ci = wilsonCI(g.valid, g.n);
    return { n: g.n, rate: g.validRate, ci: [ci.lower, ci.upper] };
  };
  const tExp = taxa("especialista");
  const tExtra = taxa("robo-extra");
  const distratores = Object.entries(grupos).filter(([s]) => s.startsWith("distrator"));
  const nDist = distratores.reduce((s, [, g]) => s + g.n, 0);
  const rejeitados = distratores.reduce((s, [, g]) => s + (g.n - g.valid), 0);
  const taxaRejeicao = nDist ? rejeitados / nDist : null;
  const calibrado = (tExp.rate ?? 0) >= GATE_CALIBRACAO && (taxaRejeicao ?? 0) >= GATE_CALIBRACAO;
  const riqueza = calibrado && tExtra.rate !== null && tExtra.rate >= (tExp.rate ?? 1) - MARGEM_RIQUEZA;
  return {
    calibracao: { especialista: tExp, rejeicaoDistratores: { n: nDist, rate: taxaRejeicao } },
    extras: tExtra,
    calibrado,
    riqueza,
    precisaoBruta: media(linhas.map((l) => l.precisaoBruta)),
    precisaoJulgada: media(linhas.map((l) => l.precisaoJulgada)),
    porOrigem: grupos,
  };
}

const ehMain = process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (ehMain) {
  const argv = process.argv.slice(2);
  const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
  const saidaDir = opt("--saida", "resultados/juizo-2026-08-19");
  const yes = argv.includes("--yes");
  if (!process.env.OPENROUTER_API_KEY) { console.error("OPENROUTER_API_KEY ausente."); process.exit(1); }
  const plano = planejar({
    filtroCorpus: opt("--corpus", null),
    filtroBraco: opt("--braco", null),
    limit: parseInt(opt("--limit", "1000000"), 10),
  });
  const nItens = plano.reduce((s, p) => s + p.itens.length, 0);
  const nExtras = plano.reduce((s, p) => s + p.extras.length, 0);
  console.log(`JUIZ DOS EXTRAS (materializado) — ${plano.length} exercício×braço, ${nExtras} extras, ${nItens} itens a julgar`);
  console.log(`  juiz: ${process.env.JUDGE_MODEL || "z-ai/glm-4.5 (default)"} | custo estimado ~US$ ${custoEstimado(nItens).toFixed(2)}`);
  if (!yes) { console.error("Execução PAGA: confirme com --yes."); process.exit(1); }
  fs.mkdirSync(saidaDir, { recursive: true });

  const linhas = [];
  let julgadosTodos = [];
  let feitos = 0;
  // CONCORRÊNCIA entre células (2026-08-19): dentro de uma célula o judgeItems
  // já dispara os itens em paralelo (~17 em média); em série o lote levaria
  // ~5 h. Com 3 células simultâneas ficam ~50 chamadas em voo e ~1,7 h. O
  // resultado não depende da ordem: cada célula é independente e toda a
  // agregação é por chave (corpus/braço/exercício).
  const CELULAS_SIMULTANEAS = 3;
  let proxima = 0;
  const trabalhador = async () => {
    while (proxima < plano.length) {
      const p = plano[proxima++];
      const judged = await judgeItems(p.enunciado, p.resposta, p.itens, {});
      julgadosTodos = julgadosTodos.concat(judged.map((j) => ({ ...j, corpus: p.corpus, braco: p.braco, ex: p.ex })));
      const validos = new Set(judged.filter((j) => j.source === "robo-extra" && j.valid).map((j) => j.candidate));
      const casados = p.cands.filter((c) => p.refValues.has(c.valor)).length;
      const extrasValidos = p.extras.filter((c) => validos.has(c.bruto)).length;
      const linha = {
        corpus: p.corpus, braco: p.braco, ex: p.ex,
        candidatos: p.cands.length, extras: p.extras.length, extrasValidos,
        precisaoBruta: p.cands.length ? casados / p.cands.length : 0,
        precisaoJulgada: p.cands.length ? (casados + extrasValidos) / p.cands.length : 0,
      };
      linhas.push(linha);
      feitos++;
      console.log(`  [${feitos}/${plano.length}] ${p.corpus}/${p.braco}/${p.ex}: ${p.extras.length} extras, ${extrasValidos} válidos | precisão ${linha.precisaoBruta.toFixed(2)} → ${linha.precisaoJulgada.toFixed(2)}`);
      // salva incremental: uma queda no meio não perde o que já foi pago
      fs.writeFileSync(path.join(saidaDir, "juiz-extras-parcial.json"), JSON.stringify({ linhas, julgadosTodos }, null, 1));
    }
  };
  await Promise.all(Array.from({ length: CELULAS_SIMULTANEAS }, trabalhador));
  linhas.sort((a, b) => `${a.corpus}${a.braco}${a.ex}`.localeCompare(`${b.corpus}${b.braco}${b.ex}`));

  const geral = consolidarVeredito(linhas, julgadosTodos);
  const porCelula = {};
  for (const c of CORPORA_JUIZ) for (const b of BRACOS) {
    const sel = linhas.filter((l) => l.corpus === c.chave && l.braco === b);
    if (!sel.length) continue;
    const jd = julgadosTodos.filter((j) => j.corpus === c.chave && j.braco === b);
    porCelula[`${c.chave}/${b}`] = consolidarVeredito(sel, jd);
  }
  const saida = {
    gerado: new Date().toISOString(),
    juiz: process.env.JUDGE_MODEL || "z-ai/glm-4.5",
    preRegistro: "docs/PRE-REGISTRO-JUIZ-E-DICAS-2026-08-19.md",
    regras: { GATE_CALIBRACAO, MARGEM_RIQUEZA },
    geral, porCelula, porExercicio: linhas,
    julgamentos: julgadosTodos.map(({ corpus, braco, ex, candidate, source, valid, category }) => ({ corpus, braco, ex, candidate, source, valid, category })),
  };
  const nome = `juiz-extras-${(process.env.JUDGE_MODEL || "glm-4.5").replace(/[/.]/g, "-")}.json`;
  fs.writeFileSync(path.join(saidaDir, nome), JSON.stringify(saida, null, 1));
  console.log("─".repeat(74));
  console.log(`  especialista (calibração): ${geral.calibracao.especialista.rate} (n=${geral.calibracao.especialista.n})`);
  console.log(`  rejeição de distratores:   ${geral.calibracao.rejeicaoDistratores.rate?.toFixed(3)} (n=${geral.calibracao.rejeicaoDistratores.n})`);
  console.log(`  validade dos EXTRAS:       ${geral.extras.rate} (n=${geral.extras.n})`);
  console.log(`  GATE: ${geral.calibrado ? "APROVADO" : "REPROVADO — números não utilizáveis"}`);
  if (geral.calibrado) console.log(`  precisão bruta ${geral.precisaoBruta.toFixed(4)} → JULGADA ${geral.precisaoJulgada.toFixed(4)} | amplitude ${geral.riqueza ? "RIQUEZA" : "não demonstrada como riqueza"}`);
  console.log(`  salvo em ${path.join(saidaDir, nome)}`);
}
