#!/usr/bin/env node
/**
 * evaluation/run-ctat-eval.mjs — Avaliação CTAT × EducaOFF a partir de `.brd` REAIS.
 *
 * Para cada problema em cases/ctat-6.17/<problema>/expert.brd:
 *   - Envelope B: parseBrdToExpertNeutral(brd)           → grafo do especialista (neutro)
 *   - Robô CEGO: authorFromBrd(brd)                      → grafo do robô (neutro) [chama LLM]
 *   - compareGraphs(expertNeutral, robotNeutral)         → F1 (nós/arestas), P/R, faltou/a-mais
 *   - se houver ≥2 expert*.brd para a MESMA interface    → pares HH (a régua humano×humano)
 * Agrega todos os pares e roda nonInferiority(margin: δ). Salva report.json + imprime.
 *
 * ⚠️ O robô é CEGO: authorFromBrd só toca o Envelope A. O especialista (Envelope B) só
 *    entra no comparador. Ver author-from-ctat.js e parse-ctat-brd.js.
 *
 * Uso:
 *   DOTENV_CONFIG_PATH=../.env node -r dotenv/config evaluation/run-ctat-eval.mjs [caminho] [--limit N]
 *   node evaluation/run-ctat-eval.mjs cases/ctat-6.17                 (todos)
 *   node evaluation/run-ctat-eval.mjs cases/ctat-6.17/01watermelon    (um problema)
 *   node evaluation/run-ctat-eval.mjs cases/ctat-6.17 --limit 1       (smoke: só o 1º)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseBrdToExpertNeutral } from "./parse-ctat-brd.js";
import { authorFromBrd } from "./author-from-ctat.js";
import { parseMassProductionTable, renderedFactsFromParams } from "./interface-reconstruction.js";
import { simulateStudentsReal } from "./simulate-students-real.js";
import { compareGraphs } from "./metrics.js";
import { functionalEquivalence } from "./functional-equivalence.js";
import { nonInferiority } from "./stats.js";
import { auditBehaviorGraph } from "./behavior-graph-integrity.js";
import { intrinsicReport, hallucinationScore } from "./graph-hallucination.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_MARGIN = 0.1; // δ provisório; derivar da banda HH quando houver ≥2 especialistas
const read = (p) => fs.readFileSync(p, "utf8");
const isProblemDir = (d) => fs.existsSync(path.join(d, "expert.brd"));

function expertBrdsIn(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => /^expert.*\.brd$/i.test(f))
    .sort()
    .map((f) => ({ name: f.replace(/\.brd$/i, ""), xml: read(path.join(dir, f)) }));
}

function sharedHtml(root) {
  const p = path.join(root, "_interface", "interface.html");
  return fs.existsSync(p) ? read(p) : undefined;
}

/**
 * 2026-07-19 (Fase B): fatos da interface RENDERIZADA por problema, reconstruídos
 * da tabela mass-production compartilhada (`_interface/massproduction.txt`).
 * Retorna uma função id→fatos; fallback silencioso (sem tabela → sempre undefined).
 * O módulo de reconstrução é PURO — o IO fica aqui, e envelope-b jamais entra.
 */
function sharedRenderedFacts(root) {
  const p = path.join(root, "_interface", "massproduction.txt");
  if (!fs.existsSync(p)) return () => undefined;
  try {
    const { paramsByProblem } = parseMassProductionTable(read(p));
    return (id) => {
      const params = paramsByProblem[id];
      if (!params) return undefined;
      try {
        return renderedFactsFromParams(params) || undefined;
      } catch {
        return undefined;
      }
    };
  } catch {
    return () => undefined;
  }
}

/** Banda histórica do hallucination_score (T11): µ+λσ persistido pela campanha. */
function hallucinationBand(root) {
  const p = path.join(root, "hallucination-band.json");
  try {
    return fs.existsSync(p) ? JSON.parse(read(p)) : null;
  } catch {
    return null;
  }
}

async function runProblem(dir, html, opts = {}) {
  const id = path.basename(dir);
  const experts = expertBrdsIn(dir).map((e) => ({
    name: e.name,
    xml: e.xml,
    neutral: parseBrdToExpertNeutral(e.xml),
  }));

  // Robô autora CEGO a partir do .brd primário (expert.brd, o primeiro).
  // --real → usa os agentes 3a/3b/3c de PRODUÇÃO (inalterados); default = shim consolidado.
  const robot = await authorFromBrd(experts[0].xml, {
    html,
    simulate: opts.real ? simulateStudentsReal : undefined,
    renderedFacts: opts.renderedFactsFor ? opts.renderedFactsFor(id) : undefined,
  });
  const audit = auditBehaviorGraph(robot.graph);
  // NÍVEL 1 (T5): intrínsecos do grafo do robô — DUROS barram; MOLES vão pro relatório.
  // opts.band (T11): banda histórica µ+λσ → anomalous deixa de ser null quando existir.
  const hallu = intrinsicReport(robot.graph);
  const halluScore = hallucinationScore(hallu, { band: opts.band || null });

  const pairs = [];
  // HH — régua humano×humano (só quando há ≥2 expert*.brd para a mesma interface).
  // Recall é DIRECIONAL (T8): computa NAS DUAS direções de cada par (Ei cobre Ej ≠
  // Ej cobre Ei) — a banda HH precisa das duas para estimar a variação humana.
  for (let i = 0; i < experts.length; i++) {
    for (let j = 0; j < experts.length; j++) {
      if (i === j) continue;
      const cmp = compareGraphs(experts[i].neutral, experts[j].neutral, {
        ref: experts[i].name,
        cand: experts[j].name,
      });
      pairs.push({ exercise: id, pairType: "HH", a: experts[i].name, b: experts[j].name, cmp });
    }
  }
  // RH — robô×humano (um por especialista): completude (robô cobre especialista) +
  // equivalência FUNCIONAL (vereditos + inclusão de traços stutter-insensitive).
  const correctAnswers = [robot.envelopeA?.correctAnswer].filter(Boolean);
  for (const e of experts) {
    const cmp = compareGraphs(e.neutral, robot.neutral, { ref: e.name, cand: "robo" });
    const fe = functionalEquivalence(e.neutral, robot.neutral, {
      correctAnswers,
      excludeMechanical: true,
    });
    pairs.push({ exercise: id, pairType: "RH", a: "robo", b: e.name, cmp, fe });
  }

  return { id, experts, robot, audit, hallu, halluScore, pairs };
}

function fmt(x) {
  return Number.isFinite(x) ? x.toFixed(3) : "n/a";
}

function printProblem(res) {
  const a = res.audit;
  const RH = res.pairs.filter((p) => p.pairType === "RH");
  const HH = res.pairs.filter((p) => p.pairType === "HH");
  const robotMiscs = (res.robot.neutral.misconceptions || []).map((m) => m.wrongAnswer);
  const halluNote = res.hallu?.hallucinationFlag
    ? " ⚠️ ALUCINAÇÃO ESTRUTURAL (DURO)"
    : res.halluScore?.score > 0
      ? ` moles=${res.halluScore.score}`
      : "";
  console.log(
    `\n■ ${res.id}  (integridade robô: ${a.ok ? "OK" : "FALHA"}, passos=${a.stepCount}${halluNote})`
  );
  console.log(`   robô previu erros: [${robotMiscs.join(", ") || "—"}]`);
  for (const p of RH) {
    const d = p.cmp.detail;
    let note = "";
    if (d.missingMisconceptions.length) note += `  faltou:[${d.missingMisconceptions.join(",")}]`;
    if (d.extraMisconceptions.length) note += `  a-mais:[${d.extraMisconceptions.join(",")}]`;
    // PRIMÁRIO = completude (recall direcional); F1 ao lado, auditável.
    console.log(
      `   RH robo cobre ${p.b}: COMPLETUDE misc=${fmt(p.cmp.recallMisconceptions)} ` +
        `(conceitual=${fmt(p.cmp.recallMisconceptionsConceptual)}) passos=${fmt(p.cmp.recallSteps)} ` +
        `| F1=${fmt(p.cmp.similarity)}${note}`
    );
    if (p.fe) {
      console.log(
        `        ↳ funcional: concordância=${fmt(p.fe.agreement)} κ=${fmt(p.fe.kappa)} ` +
          `inclusão-de-traços=${fmt(p.fe.stepInclusion)} (n=${p.fe.n})`
      );
    }
  }
  for (const p of HH)
    console.log(
      `   HH ${p.b} cobre ${p.a}: completude=${fmt(p.cmp.recallMisconceptions)} | F1=${fmt(p.cmp.similarity)}`
    );
}

function parseArgs(argv) {
  const out = { target: "cases/ctat-6.17", limit: Infinity, real: false, outPath: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--limit") out.limit = parseInt(argv[++i], 10) || Infinity;
    else if (argv[i] === "--real") out.real = true;
    else if (argv[i] === "--out") out.outPath = argv[++i];
    else if (!argv[i].startsWith("--")) out.target = argv[i];
  }
  return out;
}

async function main() {
  const { target, limit, real, outPath } = parseArgs(process.argv.slice(2));
  const root = path.isAbsolute(target) ? target : path.join(HERE, target);
  if (!fs.existsSync(root)) {
    console.error(`Caminho não encontrado: ${root}`);
    process.exit(1);
  }

  // Um problema, ou a pasta-pai com vários.
  const parentForHtml = isProblemDir(root) ? path.dirname(root) : root;
  const html = sharedHtml(parentForHtml);
  let problemDirs = isProblemDir(root)
    ? [root]
    : fs
        .readdirSync(root)
        .map((d) => path.join(root, d))
        .filter((d) => fs.statSync(d).isDirectory() && isProblemDir(d))
        .sort();
  problemDirs = problemDirs.slice(0, limit);

  if (!problemDirs.length) {
    console.error(`Nenhum problema (com expert.brd) em ${root}`);
    process.exit(1);
  }

  const mode = real ? "AGENTES REAIS 3a/3b/3c (produção)" : "shim consolidado";
  const band = hallucinationBand(parentForHtml);
  const renderedFactsFor = sharedRenderedFacts(parentForHtml);
  console.log(
    `Avaliando ${problemDirs.length} problema(s) — robô autora CEGO via LLM [${mode}]` +
      (band ? ` [banda alucinação: µ=${band.mean} σ=${band.sd}]` : "") +
      `…`
  );
  const results = [];
  for (const dir of problemDirs) {
    try {
      const res = await runProblem(dir, html, { real, band, renderedFactsFor });
      printProblem(res);
      results.push(res);
    } catch (e) {
      console.log(`\n■ ${path.basename(dir)}  ❌ ERRO: ${e.message}`);
    }
  }

  // Agrega os pares para a não-inferioridade — métrica PRIMÁRIA = COMPLETUDE
  // CONCEITUAL (recall de misconceptions excluindo erros mecânicos de interface),
  // como definido na EMENDA 1 do plano de análise. 2026-07-12: o revisor flagrou
  // que aqui entrava a completude BRUTA, divergindo do desfecho declarado; a bruta
  // segue no registro como análise de sensibilidade (campo `raw`).
  const data = results.flatMap((r) =>
    r.pairs.map((p) => ({
      value: p.cmp.recallMisconceptionsConceptual ?? p.cmp.recallMisconceptions,
      raw: p.cmp.recallMisconceptions,
      steps: p.cmp.recallSteps,
      f1: p.cmp.similarity,
      exercise: p.exercise,
      pairType: p.pairType,
    }))
  );
  const ni = nonInferiority(data, { margin: DEFAULT_MARGIN });
  const meanOf = (pred, field) => {
    const xs = data.filter(pred).map((d) => d[field]);
    return xs.length ? (xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(3) : "n/a";
  };

  const line = "═".repeat(70);
  console.log(`\n${line}\nAGREGADO — NÃO-INFERIORIDADE sobre COMPLETUDE (δ=${ni.margin})\n${line}`);
  console.log(`problemas=${ni.nExercises}  pares HH (direcionais)=${ni.nHH}  RH=${ni.nRH}`);
  const isRH = (d) => d.pairType === "RH";
  console.log(
    `COMPLETUDE misc CONCEITUAL RH = ${meanOf(isRH, "value")} (bruta=${meanOf(isRH, "raw")})  |  ` +
      `passos RH = ${meanOf(isRH, "steps")}  |  banda HH = ${fmt(ni.meanHH)}  |  [F1 auditável = ${meanOf(isRH, "f1")}]`
  );
  const feRows = results.flatMap((r) =>
    r.pairs.filter((p) => p.pairType === "RH" && p.fe).map((p) => p.fe)
  );
  const feMean = (f) =>
    feRows.length ? (feRows.reduce((s, x) => s + x[f], 0) / feRows.length).toFixed(3) : "n/a";
  console.log(
    `equivalência FUNCIONAL média (RH): concordância=${feMean("agreement")}  κ=${feMean("kappa")}  ` +
      `inclusão-de-traços=${feMean("stepInclusion")}`
  );
  console.log(
    `diferença (RH−HH) = ${fmt(ni.diff)}   |   IC95% = [${fmt(ni.ci.lower)}, ${fmt(ni.ci.upper)}]`
  );
  console.log(`➤ VEREDITO: ${String(ni.verdict).toUpperCase()}`);
  // VEREDITO 2D (T5): eixo X = completude CONCEITUAL (definição OFICIAL do X — a mesma
  // do point2D do run-judge, que filtra as mecânicas; o cru fica auditável ao lado.
  // 2026-07-02: sem essa unificação, os dois runners emitiam X com definições
  // diferentes e o par (X,Y) era incomensurável). Eixo Y = validade dos extras
  // (juiz cego, run-judge.mjs). O canto bom é (alto, alto).
  const nHallu = results.filter((r) => r.hallu?.hallucinationFlag).length;
  const softTotal = results.reduce((s, r) => s + (r.halluScore?.score || 0), 0);
  console.log(
    `veredito 2D: X=completude CONCEITUAL ${meanOf(isRH, "value")} (bruta=${meanOf(isRH, "raw")}) · Y=validade dos extras → run-judge.mjs (juiz cego)`
  );
  console.log(
    `alucinação estrutural: DUROS=${nHallu}/${results.length} grafos barrados · score MOLES total=${softTotal}`
  );
  if (ni.nHH === 0) {
    console.log(
      "⚠️  Sem pares HH (só 1 especialista por interface): a não-inferioridade fica INCONCLUSIVA " +
        "até entrar ≥2 expert*.brd (ideal ≥3 — G-theory). Por ora o sinal é a completude por problema."
    );
  } else if (!ni.reliable) {
    console.log(`⚠️  Inferência ilustrativa: ${ni.nExercises} problema(s) (alvo ~20+).`);
  }

  // Salva relatório.
  const report = {
    mode: real ? "real" : "shim",
    margin: ni.margin,
    nonInferiority: ni,
    cases: results.map((r) => ({
      id: r.id,
      audit: { ok: r.audit.ok, stepCount: r.audit.stepCount, connected: r.audit.connected },
      hallucination: {
        flag: r.hallu?.hallucinationFlag ?? null,
        hardViolations: r.hallu?.hardViolations ?? null,
        softScore: r.halluScore?.score ?? null,
        soft: r.hallu
          ? Object.fromEntries(Object.entries(r.hallu.soft).map(([k, v]) => [k, v.length]))
          : null,
      },
      robotMisconceptions: (r.robot.neutral.misconceptions || []).map((m) => m.wrongAnswer),
      pairs: r.pairs.map((p) => ({
        pairType: p.pairType,
        a: p.a,
        b: p.b,
        recallMisconceptions: p.cmp.recallMisconceptions,
        recallMisconceptionsConceptual: p.cmp.recallMisconceptionsConceptual,
        recallSteps: p.cmp.recallSteps,
        f1: p.cmp.similarity,
        f1Conceptual: p.cmp.nodeF1Conceptual,
        precision: p.cmp.precision,
        recall: p.cmp.recall,
        functionalAgreement: p.fe ? p.fe.agreement : null,
        functionalKappa: p.fe ? p.fe.kappa : null,
        stepInclusion: p.fe ? p.fe.stepInclusion : null,
        missing: p.cmp.detail.missingMisconceptions,
        extra: p.cmp.detail.extraMisconceptions,
      })),
    })),
  };
  const outDir = isProblemDir(root) ? path.dirname(root) : root;
  const out = outPath
    ? path.isAbsolute(outPath)
      ? outPath
      : path.join(process.cwd(), outPath)
    : path.join(outDir, "report-ctat.json");
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`\nRelatório salvo em: ${path.relative(process.cwd(), out)}\n`);
}

main();
