#!/usr/bin/env node
/**
 * run-campaign3.mjs — Runner da CAMPANHA 3 (Onda 3, G10/G11).
 *
 * Para cada réplica × exercício:
 *   a. Envelope A v2 (interface-input.js — fonte INDEPENDENTE do grafo; corpus
 *      cases/ctat-6.17), com sha256 do envelope nas metas do manifesto;
 *   b. autoria com os agentes REAIS 3a/3b/3c (simulate-students-real.js) por default;
 *      --single-call usa o shim consolidado (simulate-students.js);
 *   c. verificador de invariantes (intrinsicReport): grafo BARRADO conta como FALHA
 *      do exercício — registrado, nunca excluído (política de falhas §6.6);
 *   d. métricas por exercício: LEGADAS por valor (compareGraphs × parseBrdToExpertNeutral)
 *      E COMPORTAMENTAIS (traceConformance sobre a bateria congelada
 *      battery/frac-numberline-6.17-v1: R_bug, R_ok, agreement, κ, confusão);
 *   e. relatório <out>/report-c3-<condition>-<replica>.json (schemaVersion "c3-v1").
 *
 * Chaves de ablação (viram env; TODAS default = comportamento atual):
 *   --misc-db off          → STI_ABLATE_MISCDB=1 (3b sem o catálogo MISC_DB)
 *   --misc-limit 6|saturate→ STI_MISC_LIMIT (quantidade de erros pedida ao 3b)
 *   --repr dom|screenshot  → STI_REPRESENTATION (representação da interface)
 *   --discipline matematica→ disciplina SEM acento para o catálogo do 3b carregar
 *                            (gotcha do acento; ver agents3-students.js)
 *
 * Modelo: --model <slug openrouter> reutiliza GEN_MODEL do llm.js (NÃO reimplementa
 * cliente). 2026-07-13 (Onda 3): llm.js congela AGENTS no load, então os módulos que
 * importam llm.js são carregados DINAMICAMENTE depois de setar o env.
 *
 * Uso:
 *   node -r dotenv/config run-campaign3.mjs --model google/gemini-3.5-flash \
 *     --replicas 3 --condition baseline --out resultados/c3 [--limit N] [--single-call] \
 *     [--misc-db off] [--misc-limit 6|saturate] [--repr dom|screenshot] \
 *     [--corpus dir] [--discipline matematica]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildAllEnvelopesA2 } from "./interface-input.js";
import { parseBrdToExpertNeutral } from "./parse-ctat-brd.js";
import { parseBrdToNeutralV2 } from "./schema-v2.js";
import { compareGraphs } from "./metrics.js";
import { traceConformance } from "./trace-conformance.js";
import { neutralV1ToV2 } from "./neutral-v1-to-v2.js";
import { intrinsicReport } from "./graph-hallucination.js";
import { sha256 } from "./exec-manifest.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CORPUS = path.join(HERE, "cases/ctat-6.17");
const DEFAULT_BATTERY = path.join(HERE, "battery/frac-numberline-6.17-v1");

export const C3_SCHEMA_VERSION = "c3-v1";

// ───────────────────────── CLI ─────────────────────────

export function parseC3Args(argv) {
  const out = {
    model: null,
    replicas: 1,
    condition: null,
    out: null,
    limit: Infinity,
    singleCall: false,
    miscDb: "on",
    miscLimit: "3",
    repr: "text",
    corpus: null,
    discipline: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--model") out.model = argv[++i];
    else if (a === "--replicas") out.replicas = parseInt(argv[++i], 10) || 1;
    else if (a === "--condition") out.condition = argv[++i];
    else if (a === "--out") out.out = argv[++i];
    else if (a === "--limit") out.limit = parseInt(argv[++i], 10) || Infinity;
    else if (a === "--single-call") out.singleCall = true;
    else if (a === "--misc-db") out.miscDb = argv[++i];
    else if (a === "--misc-limit") out.miscLimit = argv[++i];
    else if (a === "--repr") out.repr = argv[++i];
    else if (a === "--corpus") out.corpus = argv[++i];
    else if (a === "--discipline") out.discipline = argv[++i];
  }
  return out;
}

// ───────────────────────── env das flags (com restauração) ─────────────────────────

/**
 * Aplica as chaves de ablação ao env e devolve um restaurador. Setamos SEMPRE um valor
 * explícito ("" = default nos leitores) para a corrida não herdar lixo do shell — o
 * relatório declara `flags` e o env DEVE espelhá-las.
 */
function applyFlagsToEnv(opts) {
  const keys = ["GEN_MODEL", "STI_ABLATE_MISCDB", "STI_MISC_LIMIT", "STI_REPRESENTATION", "STI_RUN_ID"];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  if (opts.model) process.env.GEN_MODEL = opts.model;
  process.env.STI_ABLATE_MISCDB = opts.miscDb === "off" ? "1" : "";
  process.env.STI_MISC_LIMIT = opts.miscLimit && opts.miscLimit !== "3" ? opts.miscLimit : "";
  process.env.STI_REPRESENTATION = opts.repr && opts.repr !== "text" ? opts.repr : "";
  return () => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  };
}

// ───────────────────────── um exercício ─────────────────────────

const round = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : x);

async function runExercise(ctx) {
  const { envelope, corpusDir, batteryDir, runId, authorFromEnvelopeA, simFn, discipline } = ctx;
  const id = envelope.id;
  const envelopeSha256 = sha256(JSON.stringify(envelope));
  const rec = {
    id,
    status: "ok",
    envelopeSha256,
    metrics: null,
    robotMisconceptions: null,
    missing: null,
    extra: null,
  };

  let robot;
  try {
    robot = await authorFromEnvelopeA(envelope, {
      simulate: simFn, // undefined ⇒ shim consolidado (--single-call)
      corpusDir,
      exerciseId: id,
      envelopeSha256,
      runId,
      discipline: discipline || undefined,
      sessionId: `${runId}:${id}`,
    });
  } catch (e) {
    // Trava de orçamento é a ÚNICA exceção que derruba a campanha (G11).
    if (e && e.name === "BudgetExceededError") throw e;
    // §6.6: falha de LLM/parse ENTRA no relatório com metrics null — nunca some.
    rec.status = "falha-autoria";
    rec.error = String(e && e.message ? e.message : e);
    return rec;
  }

  rec.robotMisconceptions = (robot.neutral.misconceptions || []).map((m) => m.wrongAnswer);

  const intrinsic = intrinsicReport(robot.graph);
  rec.intrinsic = {
    hallucinationFlag: intrinsic.hallucinationFlag,
    hardViolations: intrinsic.hardViolations,
    softViolations: intrinsic.softViolations,
    violationRate: intrinsic.violationRate,
  };
  if (intrinsic.hallucinationFlag) {
    // §6.6: grafo barrado pelo verificador = FALHA do exercício (registrada, não excluída).
    rec.status = "barrado";
    return rec;
  }

  try {
    const brd = fs.readFileSync(path.join(corpusDir, id, "expert.brd"), "utf8");

    // LEGADAS por valor (comparabilidade histórica; expert = referência, robô = candidato).
    const expertNeutral = parseBrdToExpertNeutral(brd);
    const cmp = compareGraphs(expertNeutral, robot.neutral, { ref: "expert", cand: "robo" });

    // COMPORTAMENTAIS (coprimárias E4.3): bateria congelada nos dois grafos v2.
    const expertV2 = parseBrdToNeutralV2(brd, { exercise: id });
    const robotV2 = neutralV1ToV2(robot.neutral, { exercise: id });
    const battery = JSON.parse(fs.readFileSync(path.join(batteryDir, `${id}.json`), "utf8"));
    // 2026-07-13: lado gerado no nível 3 (âncora de input) — vocabulário SAI do robô
    // é conceitual; nível declarado no relatório (plano mestre §4.2).
    const tc = traceConformance(expertV2, robotV2, battery.items || [], { robotMatchLevel: "input" });

    rec.metrics = {
      legacy: {
        recallMisconceptions: cmp.recallMisconceptions,
        recallMisconceptionsConceptual: cmp.recallMisconceptionsConceptual,
        recallSteps: cmp.recallSteps,
        f1: cmp.similarity,
        f1Conceptual: cmp.nodeF1Conceptual,
        precision: cmp.precision,
        recall: cmp.recall,
      },
      behavioral: {
        rBug: tc.coverageBuggyRecognized,
        rOk: tc.coverageCorrectTraces,
        rOkCompleted: tc.coverageCorrectTracesCompleted,
        matchLevels: tc.matchLevels,
        skippedNonAnchorable: tc.skippedNonAnchorable,
        agreement: tc.agreement,
        kappa: tc.kappa,
        confusion: tc.confusion,
        n: tc.n,
      },
    };
    rec.missing = cmp.detail.missingMisconceptions;
    rec.extra = cmp.detail.extraMisconceptions;
  } catch (e) {
    rec.status = "falha-metricas";
    rec.error = String(e && e.message ? e.message : e);
    rec.metrics = null;
  }
  return rec;
}

// ───────────────────────── resumo por réplica ─────────────────────────

const fmt = (x) => (Number.isFinite(x) ? x.toFixed(3) : "n/a");

function printReplicaSummary(report) {
  const withMetrics = report.cases.filter((c) => c.metrics);
  const failures = report.cases.filter((c) => !c.metrics);
  const mean = (get) => {
    const xs = withMetrics.map(get).filter(Number.isFinite);
    return xs.length ? round(xs.reduce((s, x) => s + x, 0) / xs.length) : null;
  };
  console.log(
    `\n── ${report.condition} · réplica ${report.replica} · ${report.model} — ` +
      `${withMetrics.length}/${report.cases.length} exercícios com métricas` +
      (failures.length
        ? ` (falhas REGISTRADAS: ${failures.map((c) => `${c.id}=${c.status}`).join(", ")})`
        : "")
  );
  console.log(
    `   comportamentais (macro): R_bug=${fmt(mean((c) => c.metrics.behavioral.rBug))}  ` +
      `R_ok=${fmt(mean((c) => c.metrics.behavioral.rOk))}  ` +
      `concordância=${fmt(mean((c) => c.metrics.behavioral.agreement))}  ` +
      `κ=${fmt(mean((c) => c.metrics.behavioral.kappa))}`
  );
  console.log(
    `   legadas (macro): completude misc conceitual=${fmt(
      mean((c) => c.metrics.legacy.recallMisconceptionsConceptual)
    )}  (bruta=${fmt(mean((c) => c.metrics.legacy.recallMisconceptions))})  ` +
      `passos=${fmt(mean((c) => c.metrics.legacy.recallSteps))}  ` +
      `F1=${fmt(mean((c) => c.metrics.legacy.f1))}`
  );
}

// ───────────────────────── campanha ─────────────────────────

/**
 * runCampaign3(opts) → { reports: [{ replica, report, outPath }] }
 * opts: { model, replicas, condition, outDir, limit, singleCall, miscDb, miscLimit,
 *         repr, corpusDir, batteryDir, answerKeyPath, discipline, simulate? }
 * `opts.simulate` injeta um simulador fake (testes offline, sem LLM).
 */
export async function runCampaign3(opts = {}) {
  const condition = opts.condition || "adhoc-c3";
  const replicas = Math.max(1, opts.replicas || 1);
  const corpusDir = opts.corpusDir || DEFAULT_CORPUS;
  const batteryDir = opts.batteryDir || DEFAULT_BATTERY;
  const outDir = opts.outDir;
  if (!outDir) throw new Error("runCampaign3: outDir (--out) é obrigatório");

  const restoreEnv = applyFlagsToEnv(opts);
  try {
    // Imports DINÂMICOS depois do env: llm.js congela GEN_MODEL/AGENTS no load.
    const { authorFromEnvelopeA } = await import("./author-from-ctat.js");
    const { simulateStudentsReal } = await import("./simulate-students-real.js");

    const model = opts.model || process.env.GEN_MODEL || "google/gemini-3.5-flash";
    const flags = {
      model,
      singleCall: !!opts.singleCall,
      miscDb: opts.miscDb === "off" ? "off" : "on",
      miscLimit: opts.miscLimit || "3",
      representation: opts.repr || "text",
      discipline: opts.discipline || null,
    };

    const envelopes = buildAllEnvelopesA2(corpusDir, { answerKeyPath: opts.answerKeyPath }).slice(
      0,
      Number.isFinite(opts.limit) ? opts.limit : undefined
    );
    if (!envelopes.length) throw new Error(`runCampaign3: nenhum exercício no answer-key`);

    // Prioridade do simulador: injetado (teste) > shim consolidado (--single-call) >
    // agentes reais 3a/3b/3c (default da campanha).
    const simFn = opts.simulate || (opts.singleCall ? undefined : simulateStudentsReal);

    fs.mkdirSync(outDir, { recursive: true });
    const reports = [];

    for (let replica = 1; replica <= replicas; replica++) {
      const runId = `${condition}-r${replica}`;
      process.env.STI_RUN_ID = runId; // llm.js/exec-manifest usam como fallback do meta

      const cases = [];
      for (const envelope of envelopes) {
        cases.push(
          await runExercise({
            envelope,
            corpusDir,
            batteryDir,
            runId,
            authorFromEnvelopeA,
            simFn,
            discipline: opts.discipline,
          })
        );
      }

      const report = {
        schemaVersion: C3_SCHEMA_VERSION,
        condition,
        model,
        replica,
        flags,
        corpus: path.basename(corpusDir),
        battery: path.basename(batteryDir),
        manifestRunId: runId,
        generatedAt: new Date().toISOString(),
        cases,
      };
      const outPath = path.join(outDir, `report-c3-${condition}-${replica}.json`);
      fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
      printReplicaSummary(report);
      console.log(`   relatório: ${outPath}`);
      reports.push({ replica, report, outPath });
    }
    return { reports };
  } finally {
    restoreEnv();
  }
}

// ───────────────────────── main ─────────────────────────

async function main() {
  const a = parseC3Args(process.argv.slice(2));
  if (!a.out || !a.condition) {
    console.error(
      "uso: node -r dotenv/config run-campaign3.mjs --model <slug> --replicas N --condition <nome> --out <dir>\n" +
        "     [--limit N] [--single-call] [--misc-db off] [--misc-limit 6|saturate]\n" +
        "     [--repr dom|screenshot] [--corpus dir] [--discipline matematica]"
    );
    process.exit(1);
  }
  await runCampaign3({
    model: a.model,
    replicas: a.replicas,
    condition: a.condition,
    outDir: a.out,
    limit: a.limit,
    singleCall: a.singleCall,
    miscDb: a.miscDb,
    miscLimit: a.miscLimit,
    repr: a.repr,
    corpusDir: a.corpus || undefined,
    discipline: a.discipline || undefined,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => {
    console.error(`ERRO: ${e.message}`);
    process.exit(1);
  });
}
