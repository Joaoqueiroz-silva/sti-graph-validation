#!/usr/bin/env node
/**
 * evaluation/aggregate-campaign.mjs — Agrega as RÉPLICAS da campanha em médias com IC.
 *
 * Lê os reports gerados pela campanha (run-ctat-eval --out / run-judge --out):
 *   report-eval-real-*.json, report-eval-shim-*.json, report-judge-real-*.json
 * e produz:
 *   - por modo (real/shim): F1, F1 conceitual, equivalência funcional → MÉDIA ± IC95%
 *     (bootstrap de CLUSTER por problema, agrupando todas as réplicas);
 *   - diferença PAREADA real−shim por problema (média das réplicas) → IC95% bootstrap;
 *   - juiz: validade por origem (robô-extra, especialista, distratores) → IC de Wilson;
 *   - PERDIDOS: %central entre os erros que o robô não cobriu → IC de Wilson.
 *
 * Uso: node aggregate-campaign.mjs <dir-com-os-reports>
 */

import fs from "node:fs";
import path from "node:path";
import { bootstrapCI, wilsonCI, mean, holm } from "./stats.js";

const dir = process.argv[2] || ".";
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const list = (re) =>
  fs
    .readdirSync(dir)
    .filter((f) => re.test(f))
    .sort()
    .map((f) => readJson(path.join(dir, f)));

const fmt = (x) => (Number.isFinite(x) ? x.toFixed(3) : "n/a");
const ci = (c) => `${fmt(c.mean)}  IC95%[${fmt(c.lower)}, ${fmt(c.upper)}]  (±${fmt(c.sd)} sd)`;

// ── EVAL: réplicas por modo ───────────────────────────────────────────────────
// rows por métrica: cada par RH de cada réplica vira uma linha {value, cluster=problema}.
function evalRows(reports, field) {
  const rows = [];
  for (const rep of reports)
    for (const c of rep.cases || [])
      for (const p of c.pairs || [])
        if (p.pairType === "RH" && Number.isFinite(p[field]))
          rows.push({ value: p[field], cluster: c.id });
  return rows;
}

// média por problema (sobre as réplicas) de um campo — para a diferença pareada.
function perProblemMean(reports, field) {
  const acc = new Map();
  for (const rep of reports)
    for (const c of rep.cases || [])
      for (const p of c.pairs || [])
        if (p.pairType === "RH" && Number.isFinite(p[field])) {
          if (!acc.has(c.id)) acc.set(c.id, []);
          acc.get(c.id).push(p[field]);
        }
  const out = new Map();
  for (const [id, xs] of acc) out.set(id, mean(xs));
  return out;
}

const realEval = list(/^report-eval-real-.*\.json$/);
const shimEval = list(/^report-eval-shim-.*\.json$/);

// ── BRAÇOS MULTI-MODELO (campanha 2): report-eval-<braço>-N.json ─────────────
// Detecta os braços presentes na pasta (além de real/shim) e agrega cada um.
// Convenção de slug: gemini, glm52, dsv4pro, ... (sem hífen interno).
const armNames = [...new Set(
  fs.readdirSync(dir)
    .map((f) => f.match(/^report-eval-([a-z0-9]+)-\d+\.json$/))
    .filter(Boolean)
    .map((m) => m[1])
    .filter((a) => a !== "real" && a !== "shim")
)].sort();
const arms = Object.fromEntries(
  armNames.map((a) => [a, list(new RegExp(`^report-eval-${a}-.*\\.json$`))])
);

const line = "═".repeat(74);
console.log(
  `${line}\nCAMPANHA — RÉPLICAS (eval)  real=${realEval.length} corridas · shim=${shimEval.length} corridas\n${line}`
);

// PRIMÁRIA = completude (recall direcional de misconceptions); F1 auditável ao lado.
const METRICS = [
  ["recallMisconceptions", "COMPLETUDE misconceptions (PRIMÁRIA)"],
  ["recallMisconceptionsConceptual", "completude misc (conceitual)"],
  ["recallSteps", "completude de passos (separada, §3.6)"],
  ["functionalAgreement", "equivalência funcional (concordância)"],
  ["stepInclusion", "inclusão de traços (stutter-insensitive)"],
  ["f1", "F1 estrutural (auditável)"],
  ["f1Conceptual", "F1 conceitual (auditável)"],
];

const summary = { eval: { real: {}, shim: {}, paired: {} }, judge: {}, missing: {} };
for (const [field, label] of METRICS) {
  // Guard (2026-07-02): reports presentes mas campo ausente = mistura de formatos
  // (reports pré-handoff) — avisar ALTO em vez de agregar n=0 em silêncio.
  if (realEval.length && evalRows(realEval, field).length === 0)
    console.warn(
      `⚠️  campo "${field}" ausente nos reports REAL — formato antigo? Regenere os reports.`
    );
  if (shimEval.length && evalRows(shimEval, field).length === 0)
    console.warn(
      `⚠️  campo "${field}" ausente nos reports SHIM — formato antigo? Regenere os reports.`
    );
  const cReal = realEval.length ? bootstrapCI(evalRows(realEval, field)) : null;
  const cShim = shimEval.length ? bootstrapCI(evalRows(shimEval, field)) : null;
  if (cReal) summary.eval.real[field] = cReal;
  if (cShim) summary.eval.shim[field] = cShim;
  console.log(`\n▸ ${label}`);
  if (cReal) console.log(`   REAL : ${ci(cReal)}  n=${cReal.n} (${cReal.nClusters} problemas)`);
  if (cShim) console.log(`   SHIM : ${ci(cShim)}  n=${cShim.n}`);

  // diferença PAREADA real−shim por problema (média das réplicas de cada lado).
  if (realEval.length && shimEval.length) {
    const mr = perProblemMean(realEval, field);
    const ms = perProblemMean(shimEval, field);
    const diffRows = [];
    for (const [id, vr] of mr)
      if (ms.has(id)) diffRows.push({ value: vr - ms.get(id), cluster: id });
    const cd = bootstrapCI(diffRows);
    summary.eval.paired[field] = cd;
    const eqv = cd.lower > -0.05 && cd.upper < 0.05 ? "≈ equivalente (|Δ|<0.05)" : "Δ relevante";
    console.log(`   Δ(real−shim) : ${ci(cd)} → ${eqv}`);
  }
}

// ── TABELA MULTI-MODELO (uma linha por braço, por métrica) ───────────────────
if (armNames.length) {
  console.log(`\n${line}\nCOMPARAÇÃO ENTRE MODELOS GERADORES (braços: ${armNames.join(", ")})\n${line}`);
  summary.arms = {};
  const pairedTests = [];
  for (const [field, label] of METRICS) {
    console.log(`\n▸ ${label}`);
    for (const a of armNames) {
      const rows = evalRows(arms[a], field);
      if (!rows.length) continue;
      const c = bootstrapCI(rows);
      (summary.arms[a] ||= {})[field] = c;
      console.log(`   ${a.padEnd(10)}: ${ci(c)}  n=${c.n}`);
    }
    // diferença pareada de cada braço vs o primeiro (baseline alfabético ou 'gemini' se existir)
    const base = armNames.includes("gemini") ? "gemini" : armNames[0];
    for (const a of armNames.filter((x) => x !== base)) {
      const mb = perProblemMean(arms[base], field);
      const ma = perProblemMean(arms[a], field);
      const diffRows = [];
      for (const [id, vb] of mb) if (ma.has(id)) diffRows.push({ value: ma.get(id) - vb, cluster: id });
      if (diffRows.length) {
        const cd = bootstrapCI(diffRows);
        pairedTests.push({ label: `${field}: ${a}−${base}`, p: cd.pBoot, ci: cd });
        console.log(`   Δ(${a}−${base}): ${ci(cd)}  p=${cd.pBoot}${cd.lower > 0 || cd.upper < 0 ? "  ← IC exclui 0" : ""}`);
      }
    }
  }

  // ── CORREÇÃO DE MÚLTIPLAS COMPARAÇÕES (Holm) sobre TODOS os testes pareados ──
  // (P1-2 do parecer: 7 métricas × braços = família de testes; sem correção,
  //  ~1 falso positivo esperado a cada 20 testes.)
  if (pairedTests.length) {
    const adj = holm(pairedTests.map((t) => ({ label: t.label, p: t.p })));
    console.log(`\n▸ correção de Holm sobre as ${adj.length} comparações pareadas (α=0,05):`);
    const survivors = adj.filter((t) => t.reject);
    for (const t of adj) {
      if (t.reject) console.log(`   SOBREVIVE  ${t.label}  (p=${t.p}, p-Holm=${t.pAdj})`);
    }
    if (!survivors.length) console.log("   nenhuma comparação sobrevive à correção");
    for (const t of adj.filter((x) => !x.reject && x.p <= 0.05))
      console.log(`   cai        ${t.label}  (p=${t.p} → p-Holm=${t.pAdj})`);
    summary.holm = adj;
  }
  // juiz por braço: report-judge-<braço>-N.json
  for (const a of armNames) {
    const judgeArm = list(new RegExp(`^report-judge-${a}-.*\\.json$`));
    if (!judgeArm.length) continue;
    let k = 0, n = 0, central = 0, nMiss = 0;
    for (const rep of judgeArm) {
      const g = rep.pooled?.["robo-extra"];
      if (g) { k += g.valid; n += g.n; }
      const mi = rep.missingImportance;
      if (mi) { central += mi.central; nMiss += mi.n; }
    }
    const wv = wilsonCI(k, n);
    const wc = wilsonCI(central, nMiss);
    (summary.arms[a] ||= {}).judge = { validadeExtras: wv, perdidosCentrais: wc };
    console.log(
      `\n▸ juiz [${a}]: extras válidos = ${(wv.p * 100).toFixed(0)}% [${(wv.lower * 100).toFixed(0)}, ${(wv.upper * 100).toFixed(0)}] (${k}/${n})` +
      `  ·  perdidos centrais = ${(wc.p * 100).toFixed(0)}% [${(wc.lower * 100).toFixed(0)}, ${(wc.upper * 100).toFixed(0)}] (${central}/${nMiss})`
    );
  }
}

// ── JUIZ: validade por origem + importância dos perdidos ──────────────────────
const realJudge = list(/^report-judge-real-.*\.json$/);
if (realJudge.length) {
  console.log(`\n${line}\nCAMPANHA — JUIZ (real)  ${realJudge.length} corridas\n${line}`);
  const sources = ["robo-extra", "especialista", "distrator-correta", "distrator-absurdo"];
  for (const s of sources) {
    let k = 0,
      n = 0;
    for (const rep of realJudge) {
      const g = rep.pooled?.[s];
      if (g) {
        k += g.valid;
        n += g.n;
      }
    }
    const w = wilsonCI(k, n);
    summary.judge[s] = w;
    console.log(
      `   ${s.padEnd(20)} válidos = ${(w.p * 100).toFixed(0)}%  IC95%[${(w.lower * 100).toFixed(0)}%, ${(w.upper * 100).toFixed(0)}%]  (${k}/${n})`
    );
  }
  // PERDIDOS: %central agregando réplicas.
  let central = 0,
    nMiss = 0,
    perif = 0,
    mec = 0;
  for (const rep of realJudge) {
    const mi = rep.missingImportance;
    if (mi) {
      central += mi.central;
      perif += mi.periferico;
      mec += mi.mecanico;
      nMiss += mi.n;
    }
  }
  const wc = wilsonCI(central, nMiss);
  summary.missing = { central, periferico: perif, mecanico: mec, n: nMiss, centralRate: wc };
  console.log(
    `\n▸ ERROS PERDIDOS pelo robô (n=${nMiss}): central=${central} periférico=${perif} mecânico=${mec}`
  );
  console.log(
    `   %CENTRAL = ${(wc.p * 100).toFixed(0)}%  IC95%[${(wc.lower * 100).toFixed(0)}%, ${(wc.upper * 100).toFixed(0)}%]`
  );
  console.log(
    wc.upper <= 0.34
      ? "   ➤ Mesmo no teto do IC, o robô perde sobretudo erros NÃO-centrais → COMPLEMENTAR se sustenta."
      : wc.lower >= 0.5
        ? "   ➤ Mesmo no piso do IC, o robô perde muitos erros CENTRAIS → lacuna de recall que importa."
        : "   ➤ IC largo/misto — precisa de mais dados ou banda HH para concluir."
  );
}

// ── BANDA HISTÓRICA do hallucination_score (T11, µ+λσ) ───────────────────────
// Persiste (µ, σ) dos scores MOLES observados nos grafos do robô da campanha —
// é a banda que run-ctat-eval passa a hallucinationScore (anomalous = score > µ+λσ).
const softScores = [...realEval, ...shimEval].flatMap((rep) =>
  (rep.cases || []).map((c) => c.hallucination?.softScore).filter((x) => Number.isFinite(x))
);
if (softScores.length) {
  const mu = mean(softScores);
  const sd = Math.sqrt(mean(softScores.map((x) => (x - mu) ** 2)));
  const band = {
    mean: Math.round(mu * 1000) / 1000,
    sd: Math.round(sd * 1000) / 1000,
    lambda: 2,
    n: softScores.length,
    generatedAt: "campanha " + path.basename(dir),
  };
  summary.hallucinationBand = band;
  fs.writeFileSync(path.join(dir, "hallucination-band.json"), JSON.stringify(band, null, 2));
  console.log(
    `\nbanda do hallucination_score: µ=${band.mean} σ=${band.sd} (n=${band.n}) → hallucination-band.json` +
      `\n(copie p/ o corpus — cases/<corpus>/hallucination-band.json — para o run-ctat-eval usar como threshold µ+λσ)`
  );
}

const outPath = path.join(dir, "campaign-summary.json");
fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
console.log(`\n${line}\nResumo salvo em: ${outPath}\n${line}`);
