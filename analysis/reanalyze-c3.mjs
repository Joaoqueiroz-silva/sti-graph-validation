#!/usr/bin/env node
/**
 * analysis/reanalyze-c3.mjs — Análise da CAMPANHA 3 (Onda 3, 2026-07-13).
 *
 * Segue o protocolo congelado ANTES da campanha (EMENDA 4 + docs/METRICAS-V2.md):
 *   - unidade = exercício (24); réplicas agregadas por média antes de qualquer teste;
 *   - testes pareados por permutação exata de troca de sinais; Holm POR FAMÍLIA:
 *       F1 (coprimárias comportamentais, braços × baseline): R_bug e R_ok,
 *           glm52/dsv4pro vs gemini → m=4;
 *       F2 (ablações × baseline, desfecho = completude conceitual histórica): m=6;
 *       F3 (exploratória: comportamentais das ablações + demais): reportada com Holm próprio;
 *   - curva de ensemble K=1..10 por rotação (cobertura conceitual vs referência);
 *   - painel de juízes: lido de painel/panel-summary.json (κ par a par já computado);
 *   - custo por condição a partir dos manifestos.
 * Saída: analysis/derived/reanalise-c3.json + analysis/derived/TABELAS-C3.md.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseBrdToExpertNeutral } from "../parse-ctat-brd.js";
import { canonAnswer } from "../schema.js";
import { signFlipTest, holm, mulberry32 } from "../stats.js";
import { bugDenominators, reconstructFrozenRBug } from "./rbug-denominator.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const C3 = path.join(ROOT, "resultados", "campanha3-2026-07-13");
const CORPUS = path.join(ROOT, "cases", "ctat-6.17");
const BATTERY = path.join(ROOT, "battery", "frac-numberline-6.17-v1");
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const r3 = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);

const exercises = fs
  .readdirSync(CORPUS)
  .filter((d) => fs.existsSync(path.join(CORPUS, d, "expert.brd")))
  .sort();

// O protocolo congelado define R_bug sobre TODAS as ações buggy da referência.
// O runner C3 armazenou uma versão que exclui ações sem âncora de input; a
// reanálise preserva essa taxa como sensibilidade e reconstrói o numerador
// inteiro para recolocar as ações excluídas no denominador congelado.
const rBugDenByExercise = new Map();
for (const ex of exercises) {
  const battery = readJson(path.join(BATTERY, `${ex}.json`));
  rBugDenByExercise.set(ex, bugDenominators(battery.items || []));
}

function frozenRBug(c) {
  const den = rBugDenByExercise.get(c?.id);
  if (!den) return NaN;
  return reconstructFrozenRBug(c.metrics?.behavioral?.rBug, den).rate;
}

// ─── carga dos relatórios por condição ───
const CONDS = [
  "base-gemini", "base-glm52", "base-dsv4pro",
  "miscdb-on", "limite-6", "saturacao", "repr-dom", "repr-screenshot", "chamada-unica",
];
const METRICS = {
  conceitual: (c) => c.metrics?.legacy?.recallMisconceptionsConceptual,
  bruta: (c) => c.metrics?.legacy?.recallMisconceptions,
  passos: (c) => c.metrics?.legacy?.recallSteps,
  f1: (c) => c.metrics?.legacy?.f1,
  // R_bug oficial: denominador congelado, com as 192 ações de referência.
  rBug: frozenRBug,
  // Sensibilidade implementada pelo runner: apenas ações ancoráveis por input.
  rBugAnchorable: (c) => c.metrics?.behavioral?.rBug,
  rOk: (c) => c.metrics?.behavioral?.rOk,
  rOkCompleted: (c) => c.metrics?.behavioral?.rOkCompleted,
  concordancia: (c) => c.metrics?.behavioral?.agreement,
  kappaComp: (c) => c.metrics?.behavioral?.kappa,
};

const arms = {};
for (const cond of CONDS) {
  const files = fs.readdirSync(C3).filter((f) => f.startsWith(`report-c3-${cond}-`)).sort();
  arms[cond] = files.map((f) => {
    const rep = readJson(path.join(C3, f));
    return { file: f, byEx: new Map(rep.cases.map((c) => [c.id, c])), flags: rep.flags, model: rep.model };
  });
}

function structuralSummary(cond) {
  const out = {
    grafos: 0,
    grafosComViolacaoDura: 0,
    violacoesDuras: 0,
    grafosComSinalMole: 0,
    sinaisMoles: 0,
    grafosBarrados: 0,
  };
  for (const run of arms[cond]) {
    for (const c of run.byEx.values()) {
      const intrinsic = c.intrinsic || {};
      const hard = Number(intrinsic.hardViolations) || 0;
      const soft = Number(intrinsic.softViolations) || 0;
      out.grafos++;
      out.violacoesDuras += hard;
      out.sinaisMoles += soft;
      if (hard > 0) out.grafosComViolacaoDura++;
      if (soft > 0) out.grafosComSinalMole++;
      if (intrinsic.hallucinationFlag || c.status === "barrado") out.grafosBarrados++;
    }
  }
  return out;
}

function rBugCounts(cond) {
  const out = {
    reconhecidas: 0,
    avaliacoesDenominadorCongelado: 0,
    avaliacoesAncoraveis: 0,
    maiorErroReconstrucao: 0,
  };
  for (const run of arms[cond]) {
    for (const c of run.byEx.values()) {
      if (c.status !== "ok") continue;
      const den = rBugDenByExercise.get(c.id);
      const rec = reconstructFrozenRBug(c.metrics?.behavioral?.rBug, den);
      out.reconhecidas += rec.hits;
      out.avaliacoesDenominadorCongelado += den.all;
      out.avaliacoesAncoraveis += den.anchorable;
      out.maiorErroReconstrucao = Math.max(
        out.maiorErroReconstrucao,
        rec.reconstructionError
      );
    }
  }
  out.taxaMicroCongelada = r3(
    out.reconhecidas / out.avaliacoesDenominadorCongelado
  );
  out.taxaMicroAncoravel = r3(out.reconhecidas / out.avaliacoesAncoraveis);
  out.maiorErroReconstrucao = Math.round(out.maiorErroReconstrucao * 1e6) / 1e6;
  return out;
}

const estruturaPorCondicao = Object.fromEntries(
  CONDS.map((cond) => [cond, structuralSummary(cond)])
);
const rBugContagensPorCondicao = Object.fromEntries(
  CONDS.map((cond) => [cond, rBugCounts(cond)])
);

function perExercise(cond, metricFn) {
  const vals = [];
  for (const ex of exercises) {
    const per = arms[cond]
      .map((run) => {
        const c = run.byEx.get(ex);
        return c && c.status === "ok" ? metricFn(c) : NaN;
      })
      .filter(Number.isFinite);
    if (per.length) vals.push(mean(per));
  }
  return vals;
}

function bootstrapMeanCI(values, { iterations = 2000, seed = 20260713 } = {}) {
  const rng = mulberry32(seed);
  const n = values.length;
  const means = [];
  for (let b = 0; b < iterations; b++) {
    let s = 0;
    for (let k = 0; k < n; k++) s += values[Math.floor(rng() * n)];
    means.push(s / n);
  }
  means.sort((a, b) => a - b);
  const pct = (p) => {
    const i = (means.length - 1) * p;
    const lo = Math.floor(i), hi = Math.ceil(i);
    return lo === hi ? means[lo] : means[lo] + (means[hi] - means[lo]) * (i - lo);
  };
  return { mean: r3(mean(values)), lower: r3(pct(0.025)), upper: r3(pct(0.975)), n };
}

function paired(condA, condB, metricFn) {
  const a = new Map(), b = new Map();
  for (const ex of exercises) {
    const va = arms[condA].map((r) => { const c = r.byEx.get(ex); return c?.status === "ok" ? metricFn(c) : NaN; }).filter(Number.isFinite);
    const vb = arms[condB].map((r) => { const c = r.byEx.get(ex); return c?.status === "ok" ? metricFn(c) : NaN; }).filter(Number.isFinite);
    if (va.length && vb.length) { a.set(ex, mean(va)); b.set(ex, mean(vb)); }
  }
  const diffs = [...a.keys()].map((ex) => a.get(ex) - b.get(ex));
  const t = signFlipTest(diffs);
  const ci = bootstrapMeanCI(diffs);
  return { meanDiff: t.meanDiff, ci: { lower: ci.lower, upper: ci.upper }, p: t.p, exact: t.exact, n: t.n };
}

// ─── sumário por condição ───
const sumario = {};
for (const cond of CONDS) {
  sumario[cond] = { model: arms[cond][0]?.model, replicas: arms[cond].length };
  for (const [k, fn] of Object.entries(METRICS)) sumario[cond][k] = bootstrapMeanCI(perExercise(cond, fn));
  sumario[cond].falhas = arms[cond].reduce(
    (s, run) => s + [...run.byEx.values()].filter((c) => c.status !== "ok").length, 0);
}

// ─── F1: coprimárias comportamentais, braços × baseline (m=4) ───
const f1Tests = [];
for (const m of ["rBug", "rOk"]) {
  for (const arm of ["base-glm52", "base-dsv4pro"]) {
    const cmp = paired(arm, "base-gemini", METRICS[m]);
    f1Tests.push({ label: `${arm} vs base-gemini · ${m}`, p: cmp.p, cmp });
  }
}
const f1Holm = holm(f1Tests.map(({ label, p }) => ({ label, p })));

// ─── F2: ablações × baseline, completude conceitual (m=6) ───
const ABL = ["miscdb-on", "limite-6", "saturacao", "repr-dom", "repr-screenshot", "chamada-unica"];
const f2Tests = ABL.map((cond) => {
  const cmp = paired(cond, "base-gemini", METRICS.conceitual);
  return { label: `${cond} vs base-gemini · conceitual`, p: cmp.p, cmp };
});
const f2Holm = holm(f2Tests.map(({ label, p }) => ({ label, p })));

// ─── F3 exploratória: comportamentais das ablações (m=12) ───
const f3Tests = [];
for (const m of ["rBug", "concordancia"]) {
  for (const cond of ABL) {
    const cmp = paired(cond, "base-gemini", METRICS[m]);
    f3Tests.push({ label: `${cond} vs base-gemini · ${m}`, p: cmp.p, cmp });
  }
}
const f3Holm = holm(f3Tests.map(({ label, p }) => ({ label, p })));

// ─── F4 POST-HOC exploratória (parecer v3.2): braços × baseline em cobertura
// conceitual — comparação NÃO prevista nas famílias congeladas; declarada
// post-hoc com Holm próprio (m=2) para substituir "n.s." sem teste na Tabela 8b.
const f4Tests = ["base-glm52", "base-dsv4pro"].map((arm) => {
  const cmp = paired(arm, "base-gemini", METRICS.conceitual);
  return { label: `${arm} vs base-gemini · conceitual (post-hoc)`, p: cmp.p, cmp };
});
const f4Holm = holm(f4Tests.map(({ label, p }) => ({ label, p })));

// κ comportamental AGRUPADO (pooled da matriz de confusão somada; o 0,037 é a
// média macro por exercício — as duas leituras são publicadas).
function pooledKappa(cond) {
  const CATS = ["correct", "buggy", "no-match"];
  const M = {}; for (const a of CATS) { M[a] = {}; for (const b of CATS) M[a][b] = 0; }
  for (const run of arms[cond]) for (const c of run.byEx.values()) {
    const cf = c.metrics?.behavioral?.confusion; if (!cf) continue;
    for (const a of CATS) for (const b of CATS) M[a][b] += cf[a]?.[b] || 0;
  }
  const N = CATS.reduce((s,a)=>s+CATS.reduce((t,b)=>t+M[a][b],0),0);
  const po = CATS.reduce((s,a)=>s+M[a][a],0)/N;
  let pe = 0;
  for (const c of CATS) pe += (CATS.reduce((s,b)=>s+M[c][b],0)/N)*(CATS.reduce((s,a)=>s+M[a][c],0)/N);
  return r3((po-pe)/(1-pe));
}

// ─── curva de ensemble K=1..10 ───
const expertKeys = new Map(
  exercises.map((id) => {
    const n = parseBrdToExpertNeutral(fs.readFileSync(path.join(CORPUS, id, "expert.brd"), "utf8"));
    const ks = new Set((n.misconceptions || []).filter((m) => !m.mechanical).map((m) => canonAnswer(m.wrongAnswer)));
    return [id, ks];
  })
);
const ens = readJson(path.join(C3, "ensemble-v2-k10.json"));
const curva = [];
for (let k = 1; k <= (ens.k || 10); k++) {
  const per = [];
  for (const e of ens.exercises || []) {
    const ref = expertKeys.get(e.id);
    // NOTA (verificação V2, 2026-07-13): exercício sem misconception conceitual
    // seria EXCLUÍDO daqui mas contaria recall=1,0 no sumário (prf de conjuntos
    // vazios). Não ocorre no corpus congelado (todos têm 3-5 chaves); se um corpus
    // futuro tiver, alinhar as duas convenções antes de comparar curva × sumário.
    if (!ref || !ref.size) continue;
    const uni = (e.unioes || []).find((u) => u.k === k);
    if (!uni) continue;
    const covs = uni.rotacoes.map((keys) => {
      const set = new Set(keys);
      let cov = 0;
      for (const kk of ref) if (set.has(kk)) cov++;
      return cov / ref.size;
    });
    per.push(mean(covs));
  }
  curva.push({ k, cobertura: r3(mean(per)) });
}

// ─── painel de juízes ───
const painel = readJson(path.join(C3, "painel", "panel-summary.json"));
const painelFontes = {};
for (const item of painel.items || [])
  painelFontes[item.source] = (painelFontes[item.source] || 0) + 1;
const painelComposicao = {
  total: (painel.items || []).length,
  porFonte: painelFontes,
  especialista: painelFontes.especialista || 0,
  distratores: Object.entries(painelFontes)
    .filter(([source]) => source.startsWith("distrator"))
    .reduce((sum, [, n]) => sum + n, 0),
  roboExtra: painelFontes["robo-extra"] || 0,
};
painelComposicao.avaliaSaidasAdicionaisDoSistema = painelComposicao.roboExtra > 0;

// ─── custo por condição (manifestos) ───
const custo = {};
for (const f of fs.readdirSync(path.join(C3, "manifests")).sort()) {
  const cond = f.replace(/\.jsonl$/, "").replace(/-r\d+$/, "");
  let usd = 0, calls = 0;
  for (const line of fs.readFileSync(path.join(C3, "manifests", f), "utf8").split("\n").filter(Boolean)) {
    const e = JSON.parse(line);
    usd += e.costUsd || 0;
    calls++;
  }
  custo[cond] = custo[cond] || { usd: 0, calls: 0 };
  custo[cond].usd += usd;
  custo[cond].calls += calls;
}
for (const c of Object.values(custo)) c.usd = r3(c.usd);

// ─── saída ───
const derived = {
  geradoEm: "2026-07-13",
  protocolo: "EMENDA 4 + docs/METRICAS-V2.md (congelados antes da campanha)",
  envelope: "envelope-a-v2 (fonte independente)",
  sumario,
  rBugDenominadorCongelado: {
    definicao:
      "ações buggy reconhecidas no contexto / todas as ações buggy registradas na referência",
    exercicios: exercises.length,
    acoesUnicasPorReplica: [...rBugDenByExercise.values()].reduce((s, d) => s + d.all, 0),
    acoesAncoraveisPorReplica: [...rBugDenByExercise.values()].reduce(
      (s, d) => s + d.anchorable,
      0
    ),
    replicasPorCondicao: arms[CONDS[0]]?.length || 0,
    nota:
      "R_bug é o estimando congelado; rBugAnchorable preserva a implementação filtrada como sensibilidade.",
  },
  rBugContagensPorCondicao,
  estruturaPorCondicao,
  familiaF1_coprimarias_bracos: f1Holm.map((h, i) => ({ ...h, ...f1Tests[i].cmp })),
  familiaF2_ablacoes_conceitual: f2Holm.map((h, i) => ({ ...h, ...f2Tests[i].cmp })),
  familiaF3_exploratoria: f3Holm.map((h, i) => ({ ...h, ...f3Tests[i].cmp })),
  familiaF4_posthoc_bracos_conceitual: f4Holm.map((h, i) => ({ ...h, ...f4Tests[i].cmp })),
  kappaPooledPorCondicao: Object.fromEntries(CONDS.map((c) => [c, pooledKappa(c)])),
  curvaEnsembleK10: curva,
  painel: {
    composicao: painelComposicao,
    porJuiz: painel.groups,
    kappaParAPar: painel.kappaPairwise,
    pendencias: painel.pendencias,
  },
  custoPorCondicao: custo,
};
const OUT = path.join(ROOT, "analysis", "derived");
fs.writeFileSync(path.join(OUT, "reanalise-c3.json"), JSON.stringify(derived, null, 2));

const fmtP = (p) => (p == null ? "n/a" : p < 0.001 ? p.toExponential(2) : p.toFixed(4));
let md = `# Tabelas geradas — campanha 3 (2026-07-13)\n\nProtocolo congelado (Emenda 4). Unidade = exercício; permutação exata; Holm por família. Gerado por \`analysis/reanalyze-c3.mjs\`.\n\n## Sumário por condição (média por exercício, IC95%)\n\n| Condição | Modelo | Conceitual | R_bug (denominador congelado) | R_bug ancorável (sensibilidade) | R_ok | rOkCompleted (explorat.) | Concordância | Falhas | Custo |\n|---|---|---|---|---|---|---|---|---|---|\n`;
for (const cond of CONDS) {
  const s = sumario[cond];
  const f = (m) => `${s[m].mean} [${s[m].lower}; ${s[m].upper}]`;
  md += `| ${cond} | ${s.model} | ${f("conceitual")} | ${f("rBug")} | ${f("rBugAnchorable")} | ${f("rOk")} | ${f("rOkCompleted")} | ${f("concordancia")} | ${s.falhas} | US$ ${custo[cond]?.usd ?? "?"} |\n`;
}
md += `\n**Denominador de R_bug.** O estimando congelado inclui 8 ações buggy por exercício: 192 ações únicas por réplica e 576 avaliações por condição nas três réplicas. A coluna ancorável preserva, como sensibilidade, o filtro implementado no runner (150 ações únicas por réplica; 450 avaliações por condição). O numerador reconhecido permanece o mesmo; as ações anteriormente excluídas voltam ao denominador como não reconhecidas sob a regra executada. O numerador foi reconstruído da taxa ancorável armazenada, com erro máximo de arredondamento de ${Math.max(...Object.values(rBugContagensPorCondicao).map((x) => x.maiorErroReconstrucao)).toFixed(3)} ação.\n`;
md += `\n| Condição | Reconhecidas | Denominador congelado | R_bug micro | Denominador ancorável | Sensibilidade micro |\n|---|---:|---:|---:|---:|---:|\n`;
for (const cond of CONDS) {
  const c = rBugContagensPorCondicao[cond];
  md += `| ${cond} | ${c.reconhecidas} | ${c.avaliacoesDenominadorCongelado} | ${c.taxaMicroCongelada} | ${c.avaliacoesAncoraveis} | ${c.taxaMicroAncoravel} |\n`;
}
md += `\n## Integridade estrutural observada na campanha 3\n\n| Condição | Grafos | Grafos com violação dura | Violações duras | Grafos com sinal mole | Sinais moles | Barrados |\n|---|---:|---:|---:|---:|---:|---:|\n`;
for (const cond of CONDS) {
  const e = estruturaPorCondicao[cond];
  md += `| ${cond} | ${e.grafos} | ${e.grafosComViolacaoDura} | ${e.violacoesDuras} | ${e.grafosComSinalMole} | ${e.sinaisMoles} | ${e.grafosBarrados} |\n`;
}
const estruturaTotal = Object.values(estruturaPorCondicao).reduce(
  (acc, e) => {
    for (const key of Object.keys(acc)) acc[key] += e[key];
    return acc;
  },
  {
    grafos: 0,
    grafosComViolacaoDura: 0,
    violacoesDuras: 0,
    grafosComSinalMole: 0,
    sinaisMoles: 0,
    grafosBarrados: 0,
  }
);
md += `| **Total** | **${estruturaTotal.grafos}** | **${estruturaTotal.grafosComViolacaoDura}** | **${estruturaTotal.violacoesDuras}** | **${estruturaTotal.grafosComSinalMole}** | **${estruturaTotal.sinaisMoles}** | **${estruturaTotal.grafosBarrados}** |\n`;
md += `\nOs relatórios C3 preservam a contagem, mas não a classe de cada sinal mole; portanto não é possível distinguir retrospectivamente over-branching, ausência de scaffold, self-loop ou aresta paralela sem reter o grafo autorado.\n`;
md += `\n## F1 — coprimárias comportamentais, braços × baseline (Holm m=4)\n\n| Comparação | Δ | IC95% | p exato | p-Holm | Rejeita |\n|---|---|---|---|---|---|\n`;
for (const t of derived.familiaF1_coprimarias_bracos)
  md += `| ${t.label} | ${t.meanDiff} | [${t.ci.lower}; ${t.ci.upper}] | ${fmtP(t.p)} | ${fmtP(t.pAdj)} | ${t.reject ? "sim" : "não"} |\n`;
md += `\n## F2 — ablações × baseline, completude conceitual (Holm m=6)\n\n| Comparação | Δ | IC95% | p exato | p-Holm | Rejeita |\n|---|---|---|---|---|---|\n`;
for (const t of derived.familiaF2_ablacoes_conceitual)
  md += `| ${t.label} | ${t.meanDiff} | [${t.ci.lower}; ${t.ci.upper}] | ${fmtP(t.p)} | ${fmtP(t.pAdj)} | ${t.reject ? "sim" : "não"} |\n`;
md += `\n## F3 — exploratória (comportamentais das ablações; Holm m=12)\n\n| Comparação | Δ | IC95% | p exato | p-Holm | Rejeita |\n|---|---|---|---|---|---|\n`;
for (const t of derived.familiaF3_exploratoria)
  md += `| ${t.label} | ${t.meanDiff} | [${t.ci.lower}; ${t.ci.upper}] | ${fmtP(t.p)} | ${fmtP(t.pAdj)} | ${t.reject ? "sim" : "não"} |\n`;
md += `\n## F4 — pós-hoc exploratória, braços × baseline em cobertura conceitual (Holm m=2)\n\n| Comparação | Δ | IC95% não ajustado | p exato | p-Holm | Rejeita |\n|---|---|---|---|---|---|\n`;
for (const t of derived.familiaF4_posthoc_bracos_conceitual)
  md += `| ${t.label} | ${t.meanDiff} | [${t.ci.lower}; ${t.ci.upper}] | ${fmtP(t.p)} | ${fmtP(t.pAdj)} | ${t.reject ? "sim" : "não"} |\n`;
md += `\n## Curva de ensemble (K=1..10, envelope v2, rotação)\n\n| K | Cobertura conceitual |\n|---|---|\n`;
for (const c of curva) md += `| ${c.k} | ${(c.cobertura * 100).toFixed(1)}% |\n`;
md += `\n## Painel de juízes (${painelComposicao.total} itens congelados dos braços multimodelo)\n\nComposição efetivamente julgada: ${painelComposicao.especialista} itens do especialista, ${painelComposicao.distratores} distratores e ${painelComposicao.roboExtra} extras do robô. Como não há extras do robô neste artefato, o painel mede concordância sobre calibração e controles, NÃO sobre as saídas adicionais do sistema; essa avaliação requer nova execução do painel com o extrator corrigido.\n\nκ par a par: ${JSON.stringify(painel.kappaPairwise)}\n\nPendências (itens sem veredito de algum juiz): ${JSON.stringify(painel.pendencias)}\n`;
fs.writeFileSync(path.join(OUT, "TABELAS-C3.md"), md);

console.log("✓ reanalise-c3.json + TABELAS-C3.md");
console.log("\nF2 (ablações, Holm):");
for (const t of derived.familiaF2_ablacoes_conceitual)
  console.log(` ${t.label}: Δ=${t.meanDiff} pHolm=${fmtP(t.pAdj)} ${t.reject ? "REJEITA" : ""}`);
console.log("\nEnsemble:", curva.map((c) => `K${c.k}=${(c.cobertura * 100).toFixed(0)}%`).join(" "));
