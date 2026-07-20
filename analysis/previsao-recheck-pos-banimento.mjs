#!/usr/bin/env node
/**
 * previsao-recheck-pos-banimento.mjs — reexecução DENTRO DO PACOTE (caminhos
 * relativos, offline, determinística) da cobertura da previsão teórica da
 * Campanha 5 contra a reconstrução de interface JÁ EXPURGADA.
 *
 * Contexto (parecer 2026-07): o artefato preservado previsao-recheck.json foi
 * computado contra o inventário implementado ATÉ ENTÃO, anterior ao banimento
 * de mfNum/badCount/doubleDiv — ele ainda contava 17pencils:5/7 como derivável
 * (72/75 = 96%). Este script reexecuta a mesma lógica contra o
 * interface-reconstruction.js DESTE pacote (que exclui os três parâmetros
 * banidos) e deposita previsao-recheck-pos-banimento.json com:
 *   - a cobertura pós-banimento (esperado: 69/75 = 92% deriváveis estritas;
 *     as 3 réplicas de 17pencils:5/7 tornam-se NÃO deriváveis);
 *   - o teto de completude derivado (cobrir tudo que é admissível pós-banimento:
 *     deriváveis estritas + estados de entrada), esperado ≈ 0,992.
 *
 * Zero chamadas de modelo. Envelopes-b e `missing` das campanhas entram apenas
 * como diagnóstico (nunca em prompt/inventário). Fórmulas idênticas às de
 * previsao-recheck.mjs (preservado como registro histórico com caminhos do
 * ambiente privado).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const DS = path.join(REPO, "datasets", "frac-numberline-6.17");
const C5 = path.join(REPO, "resultados", "campanha5-2026-07-19");
const CAMP = path.join(C5, "5-aterramento-interface-v1", "runs");
const CAMP_BASE = path.join(C5, "2-robo-sem-teto", "runs");
const OUT = path.join(C5, "previsao-teorica", "previsao-recheck-pos-banimento.json");

const { parseMassProductionTable, renderedFactsFromParams } = await import(
  path.join(REPO, "interface-reconstruction.js")
);
const { buildInterfaceInventory, formatInterfaceInventory } = await import(
  path.join(REPO, "interface-inventory.js")
);
const { canonAnswer } = await import(path.join(REPO, "schema.js"));

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const { paramsByProblem } = parseMassProductionTable(
  fs.readFileSync(path.join(DS, "_interface", "massproduction.txt"), "utf8")
);

// ── números visíveis num texto (dígitos + palavras-número, como o robô lê) ──
const WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, dozen: 12,
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6,
  sete: 7, oito: 8, nove: 9, dez: 10, duzia: 12, duzias: 12,
};
const FRACWORDS = { half: "1/2", metade: "1/2", quarter: "1/4", quarto: "1/4" };

function visibleValues(text, { words = false } = {}) {
  const t = String(text ?? "");
  const fr = new Set((t.match(/\d+\s*\/\s*\d+/g) || []).map((f) => canonAnswer(f.replace(/\s+/g, ""))));
  const ints = new Set((t.match(/(?<![\d/])\d+(?![\d/])/g) || []).map((n) => canonAnswer(n)));
  if (words) {
    const low = t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    for (const w of low.replace(/[^a-z]+/g, " ").split(/\s+/)) {
      if (WORDS[w] != null) ints.add(String(WORDS[w]));
      if (FRACWORDS[w]) fr.add(canonAnswer(FRACWORDS[w]));
    }
  }
  return { ints, fracs: fr };
}

/** Fecho derivável estrito a partir dos valores visíveis (L0 + L1 de 1 passo). */
function derivableStrict(visible) {
  const set = new Set([...visible.ints, ...visible.fracs]);
  for (const f of visible.fracs) {
    const m = /^(-?\d+)\/(-?\d+)$/.exec(f);
    if (!m) continue; // frações que canonizaram para inteiro já estão em ints
    const [n, d] = [m[1], m[2]];
    set.add(canonAnswer(n)); // numerador nu
    set.add(canonAnswer(d)); // denominador nu
    if (n !== "0") set.add(canonAnswer(`${d}/${n}`)); // recíproco
  }
  return set;
}

function classify(key, correctFrac) {
  if (/^-?\d+$/.test(key)) return "whole_number_bias";
  const m = /^(-?\d+)\/(-?\d+)$/.exec(key);
  if (m) {
    const cm = /^(\d+)\/(\d+)$/.exec(correctFrac || "");
    if (cm && key === canonAnswer(`${cm[2]}/${cm[1]}`)) return "inversao_reciproco";
    return "fracao_outros";
  }
  return "outros";
}

function f1(tp, fp, fn) {
  if (tp + fp + fn === 0) return 1.0;
  const P = tp + fp === 0 ? 1.0 : tp / (tp + fp);
  const R = tp + fn === 0 ? 1.0 : tp / (tp + fn);
  return P + R === 0 ? 0.0 : (2 * P * R) / (P + R);
}
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

// ── inventários REAIS por problema (reconstrução PÓS-BANIMENTO do pacote) ──
const perProblem = {};
for (const pid of fs.readdirSync(path.join(DS, "problems")).sort()) {
  const envelopeA = readJson(path.join(DS, "problems", pid, "envelope-a.json"));
  const rf = renderedFactsFromParams(paramsByProblem[pid]);
  const invNew = formatInterfaceInventory(buildInterfaceInventory(envelopeA, { renderedFacts: rf }));
  const invOld = formatInterfaceInventory(buildInterfaceInventory(envelopeA));
  const base = visibleValues(`${envelopeA.problem} ${envelopeA.correctAnswer}`, { words: true });
  const addIn = (dst, src) => {
    for (const v of src.ints) dst.ints.add(v);
    for (const v of src.fracs) dst.fracs.add(v);
  };
  const visOld = { ints: new Set(base.ints), fracs: new Set(base.fracs) };
  addIn(visOld, visibleValues(invOld));
  const visNew = { ints: new Set(base.ints), fracs: new Set(base.fracs) };
  addIn(visNew, visibleValues(invNew));
  const derivOld = derivableStrict(visOld);
  const derivNew = derivableStrict(visNew);
  // L1e — estados de entrada parcial, SÓ quando o inventário anuncia o formato
  const entrada = new Set();
  if (rf && invNew.includes("entrada parcial registra")) {
    entrada.add(`-/${rf.alvoDen}`);
    entrada.add(`${rf.alvoNum}/-`);
  }
  perProblem[pid] = {
    envelopeA, rf, invNew, invOld, derivOld, derivNew, entrada,
    renderedChars: invNew.length - invOld.length,
  };
}

// ── cruzamento com as 72 runs do braço 5 (envelope-b = diagnóstico) ──
function expertSets(pid) {
  const eb = readJson(path.join(DS, "problems", pid, "envelope-b.json"));
  const stepsRef = new Set(eb.steps.map((s) => `step|${s.key}`));
  const key = (m) => canonAnswer(m.wrongAnswer ?? "") || canonAnswer(m.key ?? "");
  const miscRaw = new Set(eb.misconceptions.map(key));
  const miscConc = new Set(eb.misconceptions.filter((m) => !m.mechanical).map(key));
  const mechAll = new Set(eb.misconceptions.filter((m) => m.mechanical).map(key));
  const nonmech = new Set(eb.misconceptions.filter((m) => !m.mechanical).map(key));
  const mech = new Set([...mechAll].filter((k) => !nonmech.has(k)));
  return { stepsRef, miscRaw, miscConc, mech };
}

const perClass = {};
const bump = (cls, field, n = 1) => {
  perClass[cls] ??= { faltas: 0, derivaveis: 0, soViaReconstrucao: 0, viaEntrada: 0, naoDerivaveis: 0, chaves: {} };
  perClass[cls][field] += n;
};
const runs = [];
const concNow = [], concNew = [], concNewExt = [], rmcNow = [], rmcNew = [], rmcTeto = [];
let backoutsOk = 0;
const naoDerivaveis = {};

for (const fp of fs.readdirSync(CAMP).filter((f) => f.endsWith(".json")).sort()) {
  const d = readJson(path.join(CAMP, fp));
  const pid = d.id;
  const P = perProblem[pid];
  const { stepsRef, miscRaw, miscConc, mech } = expertSets(pid);
  const missing = (d.missing || []).map(String);
  const missNonmech = missing.filter((k) => !mech.has(k));

  let derivHits = 0, soRecHits = 0, entradaHits = 0;
  for (const k of new Set(missNonmech)) {
    const cls = classify(k, paramsByProblem[pid].frac);
    bump(cls, "faltas");
    perClass[cls].chaves[`${pid}:${k}`] = (perClass[cls].chaves[`${pid}:${k}`] || 0) + 1;
    if (P.derivNew.has(k)) {
      bump(cls, "derivaveis");
      derivHits++;
      if (!P.derivOld.has(k)) {
        bump(cls, "soViaReconstrucao");
        soRecHits++;
      }
    } else if (P.entrada.has(k)) {
      bump(cls, "viaEntrada");
      entradaHits++;
    } else {
      bump(cls, "naoDerivaveis");
      naoDerivaveis[`${pid}:${k}:${cls}`] = (naoDerivaveis[`${pid}:${k}:${cls}`] || 0) + 1;
    }
  }

  // back-out do F1 conceitual (fórmulas do metrics.js, idênticas ao recheck original)
  const refRaw = stepsRef.size + miscRaw.size;
  const tpAll = Math.round(d.recall * refRaw);
  const fpAll = d.precision > 0 ? Math.round(tpAll / d.precision - tpAll) : 0;
  const miscTpRaw = miscRaw.size - new Set(missing).size;
  const stepTp = tpAll - miscTpRaw;
  const robotKeys = new Set((d.robotMisconceptions || []).map((w) => canonAnswer(w)));
  const mechOnlyHits = [...robotKeys].filter((k) => mech.has(k)).length;
  const miscTpConc = miscConc.size - new Set(missNonmech).size;
  const tpConc = stepTp + miscTpConc;
  const fpConc = fpAll + mechOnlyHits;
  const refConc = stepsRef.size + miscConc.size;
  const f1Backout = f1(tpConc, fpConc, refConc - tpConc);
  const ok = Math.abs(f1Backout - d.conceptual) < 2e-3;
  backoutsOk += ok ? 1 : 0;

  const dcount = derivHits;
  const ecount = derivHits + entradaHits;
  concNow.push(d.conceptual);
  concNew.push(f1(tpConc + dcount, fpConc, refConc - tpConc - dcount));
  concNewExt.push(f1(tpConc + ecount, fpConc, refConc - tpConc - ecount));
  rmcNow.push(miscConc.size ? miscTpConc / miscConc.size : 1.0);
  rmcNew.push(miscConc.size ? (miscTpConc + dcount) / miscConc.size : 1.0);
  // TETO pós-banimento: cobrir TUDO que é admissível (deriváveis estritas +
  // estados de entrada); só as faltas não deriváveis permanecem descobertas.
  rmcTeto.push(miscConc.size ? (miscTpConc + ecount) / miscConc.size : 1.0);
  runs.push({ run: fp, backoutOk: ok, conceptual: d.conceptual, faltasNaoMec: missNonmech.length,
    derivaveis: dcount, soViaReconstrucao: soRecHits, viaEntrada: entradaHits });
}

const baseConc = fs.existsSync(CAMP_BASE)
  ? fs.readdirSync(CAMP_BASE).filter((f) => f.endsWith(".json"))
      .map((f) => { try { return readJson(path.join(CAMP_BASE, f)).conceptual; } catch { return null; } })
      .filter((x) => x != null)
  : [];

const tot = Object.values(perClass).reduce((s, v) => s + v.faltas, 0);
const totD = Object.values(perClass).reduce((s, v) => s + v.derivaveis, 0);
const totR = Object.values(perClass).reduce((s, v) => s + v.soViaReconstrucao, 0);
const totE = Object.values(perClass).reduce((s, v) => s + v.viaEntrada, 0);
const totN = Object.values(perClass).reduce((s, v) => s + v.naoDerivaveis, 0);
const renderedChars = Object.values(perProblem).map((p) => p.renderedChars);

const report = {
  geradoEm: new Date().toISOString(),
  fonteDosFatos:
    "reconstrução PÓS-BANIMENTO do pacote (interface-reconstruction.js + interface-inventory.js deste repositório; mfNum/badCount/doubleDiv excluídos)",
  parametrosBanidos: ["mfNum", "badCount", "doubleDiv"],
  backoutsValidados: `${backoutsOk}/${runs.length}`,
  mediaConceitualCampanhaInterface: +mean(concNow).toFixed(3),
  mediaConceitualBaselineRoboNovo: +mean(baseConc).toFixed(3),
  coberturaFinal: {
    faltasNaoMecanicas: tot,
    derivaveisEstrito: totD,
    coberturaEstrita: +(totD / tot).toFixed(3),
    soViaReconstrucao: totR,
    viaEstadoDeEntrada: totE,
    naoDerivaveis: totN,
    coberturaComEntrada: +((totD + totE) / tot).toFixed(3),
  },
  porClasse: Object.fromEntries(Object.entries(perClass).sort().map(([c, v]) => [c, {
    faltas: v.faltas, derivaveis: v.derivaveis,
    cobertura: v.faltas ? +(v.derivaveis / v.faltas).toFixed(3) : null,
    soViaReconstrucao: v.soViaReconstrucao, viaEntrada: v.viaEntrada,
    naoDerivaveis: v.naoDerivaveis,
    chaves: Object.entries(v.chaves).sort((a, b) => b[1] - a[1]),
  }])),
  previsao: {
    conceitualSeAcertarTudoDerivavelEstrito: +mean(concNew).toFixed(3),
    conceitualDerivavelMaisEntrada: +mean(concNewExt).toFixed(3),
    recallMiscConceitualAtual: +mean(rmcNow).toFixed(3),
    recallMiscConceitualSeDerivar: +mean(rmcNew).toFixed(3),
    tetoCompletudePosBanimento: +mean(rmcTeto).toFixed(3),
  },
  custoDePrompt: {
    charsExtrasPorProblema: { min: Math.min(...renderedChars), max: Math.max(...renderedChars),
      media: Math.round(mean(renderedChars)) },
    aproxTokensExtras: Math.round(mean(renderedChars) / 3.4),
  },
  faltasNaoDerivaveis: Object.entries(naoDerivaveis).sort((a, b) => b[1] - a[1]),
  runs,
};
fs.writeFileSync(OUT, JSON.stringify(report, null, 1));

console.log("== PREVISÃO — cobertura PÓS-BANIMENTO (reconstrução do pacote) ==");
console.log(`back-out do F1 conceitual reproduz 'conceptual': ${report.backoutsValidados}`);
console.log(`média conceitual braço 5: ${report.mediaConceitualCampanhaInterface} (braço 2: ${report.mediaConceitualBaselineRoboNovo})`);
console.log("");
for (const [c, v] of Object.entries(report.porClasse)) {
  console.log(`  ${c.padEnd(22)} faltas=${String(v.faltas).padStart(3)} deriváveis=${String(v.derivaveis).padStart(3)} (${v.cobertura == null ? "—" : Math.round(v.cobertura * 100) + "%"}) | só-via-reconstrução=${v.soViaReconstrucao}${v.viaEntrada ? ` | +${v.viaEntrada} via estado-de-entrada` : ""}${v.naoDerivaveis ? ` | NÃO deriváveis=${v.naoDerivaveis}` : ""}`);
}
const cf = report.coberturaFinal;
console.log(`  ${"TOTAL".padEnd(22)} faltas=${cf.faltasNaoMecanicas} deriváveis=${cf.derivaveisEstrito} (${Math.round(cf.coberturaEstrita * 100)}%) | só-via-reconstrução=${cf.soViaReconstrucao} | +${cf.viaEstadoDeEntrada} entrada | NÃO deriváveis=${cf.naoDerivaveis}`);
console.log("");
console.log("== NÃO deriváveis (pós-banimento) ==");
for (const [k, n] of report.faltasNaoDerivaveis) console.log(`  ${n}× ${k}`);
console.log("");
console.log(`F1 conceitual atual → se derivar tudo (estrito, pós-banimento): ${report.mediaConceitualCampanhaInterface} → ${report.previsao.conceitualSeAcertarTudoDerivavelEstrito}`);
console.log(`recall misc conceitual atual → se derivar (estrito):            ${report.previsao.recallMiscConceitualAtual} → ${report.previsao.recallMiscConceitualSeDerivar}`);
console.log(`TETO de completude pós-banimento (deriváveis + entrada):        ${report.previsao.tetoCompletudePosBanimento}`);
console.log(`\nRelatório: ${OUT}`);
