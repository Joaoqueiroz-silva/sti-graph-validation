#!/usr/bin/env node

/**
 * Sensibilidade pos-hoc da Campanha 4 para dependencia intra-chamada.
 *
 * O plano primario reamostra os 24 exercicios. Como quatro exercicios foram
 * gerados juntos em cada estado, esta analise agrega replicas por exercicio e
 * reamostra os seis batches. Ela nao substitui o IC primario: com apenas seis
 * clusters, serve para mostrar quanto a incerteza muda sob o agrupamento mais
 * conservador.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bootstrapCI } from "../stats.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const PLAN = path.join(
  REPO,
  "protocol",
  "production-freeze-2026-07-15",
  "campaign4-full-execution-plan.json"
);
const PRIMARY = path.join(
  REPO,
  "resultados",
  "campanha4-2026-07-15",
  "campaign4-final-analysis-v2.1.json"
);
const DEFAULT_OUTPUT = path.join(
  REPO,
  "resultados",
  "campanha4-2026-07-15",
  "campaign4-batch-cluster-sensitivity-v1.json"
);
const ITERATIONS = 20_000;
const SEED = 20260750;

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const finite = Number.isFinite;
const mean = (values) => {
  const xs = values.filter(finite);
  return xs.length ? xs.reduce((sum, value) => sum + value, 0) / xs.length : null;
};
const round = (value, digits = 6) =>
  finite(value) ? Number(value.toFixed(digits)) : value ?? null;

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temp, file);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Sensibilidade batch C4 bloqueada: ${message}`);
}

function loadRows() {
  const plan = readJson(PLAN);
  const rows = [];
  for (const group of plan.groups) {
    const dir = path.join(REPO, group.outputDir);
    const result = readJson(path.join(dir, "campaign4-real-pilot.json"));
    const metrics = readJson(path.join(dir, "campaign4-real-pilot-metrics-v2.json"));
    const byState = new Map(metrics.cases.map((item) => [item.stateId, item]));
    for (const caseArtifact of result.cases) {
      const state = byState.get(caseArtifact.stateId);
      assert(state, `metricas ausentes para ${group.order}/${caseArtifact.stateId}`);
      const byProblem = {
        agent3a: new Map(state.metrics.agent3a.byProblem.map((item) => [item.problemId, item])),
        agent3b: new Map(state.metrics.agent3b.byProblem.map((item) => [item.problemId, item])),
        agent3c: new Map(state.metrics.agent3c.byProblem.map((item) => [item.problemId, item])),
      };
      for (const exerciseId of caseArtifact.exerciseIds) {
        rows.push({
          exerciseId,
          batch: caseArtifact.stateId,
          replica: group.replica,
          agent3a: byProblem.agent3a.get(exerciseId),
          agent3b: byProblem.agent3b.get(exerciseId),
          agent3c: byProblem.agent3c.get(exerciseId),
        });
      }
    }
  }
  assert(rows.length === 72, `linhas=${rows.length}, esperado=72`);
  return rows;
}

function perExercise(rows, accessor) {
  const grouped = new Map();
  for (const row of rows) {
    const value = accessor(row);
    if (!finite(value)) continue;
    const item = grouped.get(row.exerciseId) || { batch: row.batch, values: [] };
    assert(item.batch === row.batch, `exercicio ${row.exerciseId} mudou de batch`);
    item.values.push(value);
    grouped.set(row.exerciseId, item);
  }
  return [...grouped.entries()]
    .map(([exerciseId, item]) => ({
      exerciseId,
      batch: item.batch,
      value: mean(item.values),
      replicas: item.values.length,
    }))
    .sort((a, b) => a.exerciseId.localeCompare(b.exerciseId));
}

function leaveOneBatchOut(items) {
  const batches = [...new Set(items.map((item) => item.batch))].sort();
  const estimates = batches.map((batch) => ({
    omittedBatch: batch,
    mean: round(mean(items.filter((item) => item.batch !== batch).map((item) => item.value))),
  }));
  return {
    estimates,
    minimum: round(Math.min(...estimates.map((item) => item.mean))),
    maximum: round(Math.max(...estimates.map((item) => item.mean))),
  };
}

function summarize(rows, accessor, primaryMetric, seedOffset) {
  const items = perExercise(rows, accessor);
  assert(items.length === 24, `exercicios finitos=${items.length}, esperado=24`);
  const batches = [...new Set(items.map((item) => item.batch))];
  assert(batches.length === 6, `batches=${batches.length}, esperado=6`);
  const result = bootstrapCI(
    items.map((item) => ({ value: item.value, cluster: item.batch })),
    { iterations: ITERATIONS, seed: SEED + seedOffset, alpha: 0.05 }
  );
  return {
    mean: result.mean,
    ci95PercentileBatchClusterBootstrap: {
      lower: result.lower,
      upper: result.upper,
      iterations: ITERATIONS,
      seed: SEED + seedOffset,
      clusters: 6,
      cluster: "stateId/batch shared by four exercises",
    },
    registeredExerciseClusterInterval: {
      lower: primaryMetric.ci95PercentileClusterBootstrap.lower,
      upper: primaryMetric.ci95PercentileClusterBootstrap.upper,
      clusters: 24,
    },
    leaveOneBatchOut: leaveOneBatchOut(items),
  };
}

export function batchClusterSensitivity({ outputPath = DEFAULT_OUTPUT, write = true } = {}) {
  const rows = loadRows();
  const primary = readJson(PRIMARY);
  const output = {
    schemaVersion: "educaoff-campaign4-batch-cluster-sensitivity-v1",
    createdAt: primary.createdAt,
    timing: "post-hoc-after-independent-statistical-audit",
    status: "sensitivity-not-a-replacement-for-registered-exercise-bootstrap",
    design: {
      exercises: 24,
      batches: 6,
      exercisesPerBatch: 4,
      replicas: 3,
      rationale:
        "four exercise outputs share each generator call; batch bootstrap preserves this grouping",
    },
    metrics: {
      agent3aFinalAnswerExactConcreteMatchItt: summarize(
        rows,
        (row) => Number(row.agent3a.finalAnswer.exactConcreteMatch),
        primary.directMetrics.agent3a.finalAnswerExactConcreteMatchItt,
        1
      ),
      agent3bExactConcreteRecallByUniqueValueItt: summarize(
        rows,
        (row) => row.agent3b.exactConcreteRecallByUniqueValueItt,
        primary.directMetrics.agent3b.exactConcreteRecallByUniqueValueItt,
        2
      ),
      agent3cStrictProblemSuccessItt: summarize(
        rows,
        (row) => row.agent3c.strictProblemSuccessItt,
        primary.directMetrics.agent3cCapacityArm.strictProblemSuccessItt,
        3
      ),
    },
    limitations: [
      "only six batches make percentile bootstrap coarse and unstable",
      "fixtures within a batch share a call but still differ in content",
      "analysis was added after results and is descriptive sensitivity only",
    ],
  };
  if (write) writeJson(outputPath, output);
  return { outputPath, output };
}

const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;

export function checkBatchClusterSensitivity({ outputPath = DEFAULT_OUTPUT } = {}) {
  const { output } = batchClusterSensitivity({ outputPath, write: false });
  if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, "utf8") !== serialize(output)) {
    throw new Error(
      `Sensibilidade por batch C4 ausente ou divergente: ${path.relative(REPO, outputPath)}`
    );
  }
  return { status: "ok", mode: "check", outputPath, output };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const mode = args[0]?.startsWith("--") ? args.shift() : "--write";
  if (!["--write", "--check"].includes(mode) || args.length > 1) {
    process.stderr.write(
      "Uso: node analysis/campaign4-batch-cluster-sensitivity.mjs --write|--check [OUTPUT.json]\n"
    );
    process.exitCode = 2;
  } else {
    const outputPath = args[0] ? path.resolve(args[0]) : DEFAULT_OUTPUT;
    const { output } =
      mode === "--check"
        ? checkBatchClusterSensitivity({ outputPath })
        : batchClusterSensitivity({ outputPath, write: true });
    process.stdout.write(
      `${JSON.stringify({
        status: mode === "--check" ? "ok" : "completed",
        mode,
        outputPath,
        metrics: output.metrics,
      })}\n`
    );
  }
}
