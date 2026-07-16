#!/usr/bin/env node

/**
 * Materializa o estado final observado da Campanha 4 sem alterar o plano
 * prospectivo. A separação evita reescrever como "completed" um documento que
 * foi congelado antes das chamadas restantes.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const PLAN = path.join(
  REPO,
  "protocol",
  "production-freeze-2026-07-15",
  "campaign4-full-execution-plan.json"
);
const DEFAULT_OUTPUT = path.join(
  REPO,
  "resultados",
  "campanha4-2026-07-15",
  "campaign4-completion-manifest-v1.json"
);
const FIXTURE_DIR = path.join(REPO, "production-fidelity", "fixtures");
const FIXTURE_MANIFEST = path.join(FIXTURE_DIR, "manifest.json");

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256File = (file) =>
  crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const sum = (values) => values.reduce((total, value) => total + value, 0);
const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sameArray = (left, right) =>
  Array.isArray(left) &&
  Array.isArray(right) &&
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

function assert(condition, message) {
  if (!condition) throw new Error(`Manifesto de conclusão C4 bloqueado: ${message}`);
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, file);
}

function timestampFromSources(values) {
  const milliseconds = values.map(Date.parse);
  assert(milliseconds.length > 0 && milliseconds.every(Number.isFinite), "completedAt inválido");
  return new Date(Math.max(...milliseconds)).toISOString();
}

export function loadCampaign4CompletionInputs() {
  const plan = readJson(PLAN);
  const fixtureManifest = readJson(FIXTURE_MANIFEST);
  const fixtures = fixtureManifest.fixtures.map((declared) => {
    const fixturePath = path.join(FIXTURE_DIR, declared.filename);
    const fixture = readJson(fixturePath);
    return {
      ...declared,
      actualFileSha256: sha256File(fixturePath),
      documentExerciseIds: fixture.seedProblems.map((item) => String(item.id)),
    };
  });
  const observedGroups = plan.groups.map((planned) => {
    const directory = path.join(REPO, planned.outputDir);
    const resultPath = path.join(directory, "campaign4-real-pilot.json");
    const metricsPath = path.join(directory, "campaign4-real-pilot-metrics-v2.json");
    return {
      planned,
      resultPath,
      metricsPath,
      resultRelative: path.relative(REPO, resultPath),
      metricsRelative: path.relative(REPO, metricsPath),
      resultSha256: sha256File(resultPath),
      metricsSha256: sha256File(metricsPath),
      result: readJson(resultPath),
      metrics: readJson(metricsPath),
    };
  });
  return {
    plan,
    planPath: PLAN,
    planSha256: sha256File(PLAN),
    fixtureManifest,
    fixtureManifestSha256: sha256File(FIXTURE_MANIFEST),
    fixtures,
    observedGroups,
  };
}

export function validateCampaign4CompletionInputs(inputs) {
  const {
    plan,
    fixtureManifest,
    fixtureManifestSha256,
    fixtures,
    observedGroups,
  } = inputs;
  assert(Array.isArray(plan.groups), "plano sem grupos");
  assert(observedGroups.length === plan.groups.length, "quantidade observada de grupos diverge");
  assert(
    sameArray(
      plan.groups.map((group) => group.order),
      plan.groups.map((_, index) => index + 1)
    ),
    "ordem dos grupos do plano não é exatamente 1..N"
  );
  assert(
    fixtureManifest.schemaVersion === "educaoff-agent3-fixture-manifest-v1",
    "schema inesperado no manifesto de fixtures"
  );
  assert(fixtures.length === fixtureManifest.fixtures.length, "inventário de fixtures incompleto");

  const fixtureByFilename = new Map();
  for (const fixture of fixtures) {
    assert(!fixtureByFilename.has(fixture.filename), `fixture duplicada: ${fixture.filename}`);
    assert(
      fixture.actualFileSha256 === fixture.fileSha256,
      `hash do arquivo de fixture diverge: ${fixture.filename}`
    );
    assert(
      sameArray(fixture.documentExerciseIds, fixture.exerciseIds.map(String)),
      `exercícios do arquivo divergem do manifesto: ${fixture.filename}`
    );
    fixtureByFilename.set(fixture.filename, fixture);
  }

  const expectedExerciseIds = [...new Set(fixtures.flatMap((item) => item.exerciseIds.map(String)))].sort();
  const observedExerciseIds = new Set();
  const exerciseCounts = new Map();
  const exerciseReplicaKeys = new Set();
  const stateReplicaKeys = new Set();
  const plannedStateReplicaKeys = new Set();

  observedGroups.forEach((observed, index) => {
    const planned = plan.groups[index];
    const { result, metrics } = observed;
    assert(observed.planned.order === planned.order, `${planned.order}: vínculo posicional do grupo`);
    assert(result.runId === planned.runId, `${planned.order}: runId diverge do plano`);
    assert(metrics.source?.runId === result.runId, `${planned.order}: métricas de outro runId`);
    assert(
      metrics.source?.resultPath === observed.resultRelative,
      `${planned.order}: caminho-fonte das métricas diverge`
    );
    assert(
      metrics.source?.resultSha256 === observed.resultSha256,
      `${planned.order}: hash-fonte das métricas diverge do bruto`
    );
    assert(
      metrics.source?.runnerSchemaVersion === result.schemaVersion &&
        metrics.source?.runnerStatus === result.status,
      `${planned.order}: metadados-fonte das métricas divergem do bruto`
    );
    assert(
      result.fixtureManifestSha256 === fixtureManifestSha256,
      `${planned.order}: manifesto de fixtures diverge`
    );

    const observedFiles = result.cases.map((item) => item.filename);
    assert(
      sameArray(observedFiles, planned.stateFiles),
      `${planned.order}: arquivos de estado não coincidem exatamente com o plano`
    );
    assert(
      new Set(observedFiles).size === observedFiles.length,
      `${planned.order}: arquivo de estado duplicado`
    );
    assert(
      sameArray(
        metrics.cases.map((item) => item.stateId),
        result.cases.map((item) => item.stateId)
      ),
      `${planned.order}: estados das métricas não coincidem exatamente com o bruto`
    );

    for (const stateFile of planned.stateFiles) {
      const key = `${planned.replica}|${stateFile}`;
      assert(!plannedStateReplicaKeys.has(key), `estado planejado duplicado na réplica: ${key}`);
      plannedStateReplicaKeys.add(key);
    }

    result.cases.forEach((item, caseIndex) => {
      const fixture = fixtureByFilename.get(item.filename);
      const metricCase = metrics.cases[caseIndex];
      assert(fixture, `${planned.order}: fixture fora do inventário: ${item.filename}`);
      assert(metricCase.filename === item.filename, `${planned.order}: filename das métricas diverge`);
      assert(metricCase.fixtureSha256 === fixture.fileSha256, `${planned.order}: hash da fixture nas métricas`);
      assert(item.stateSha256 === fixture.stateSha256, `${planned.order}: hash lógico do estado diverge`);
      assert(
        sameArray(item.exerciseIds.map(String), fixture.exerciseIds.map(String)),
        `${planned.order}: exercícios do estado divergem da fixture`
      );

      const stateKey = `${planned.replica}|${item.stateId}`;
      assert(!stateReplicaKeys.has(stateKey), `estado×réplica duplicado: ${stateKey}`);
      stateReplicaKeys.add(stateKey);
      for (const rawExerciseId of item.exerciseIds) {
        const exerciseId = String(rawExerciseId);
        const replicaKey = `${planned.replica}|${exerciseId}`;
        assert(!exerciseReplicaKeys.has(replicaKey), `exercício×réplica duplicado: ${replicaKey}`);
        exerciseReplicaKeys.add(replicaKey);
        observedExerciseIds.add(exerciseId);
        exerciseCounts.set(exerciseId, (exerciseCounts.get(exerciseId) || 0) + 1);
      }
    });
  });

  assert(
    sameArray([...observedExerciseIds].sort(), expectedExerciseIds),
    "conjunto observado de exercícios diverge das fixtures"
  );
  for (const exerciseId of expectedExerciseIds) {
    assert(exerciseCounts.get(exerciseId) === 3, `${exerciseId}: esperado exatamente em três réplicas`);
    for (const replica of [1, 2, 3]) {
      assert(exerciseReplicaKeys.has(`${replica}|${exerciseId}`), `${exerciseId}: ausente na réplica ${replica}`);
    }
  }
  return { exerciseIds: expectedExerciseIds };
}

export function buildCampaign4CompletionManifest({
  outputPath = DEFAULT_OUTPUT,
  write = true,
  inputs = loadCampaign4CompletionInputs(),
} = {}) {
  const { plan, planPath, planSha256, observedGroups } = inputs;
  const { exerciseIds } = validateCampaign4CompletionInputs(inputs);
  const groups = observedGroups.map(({ planned, result, resultRelative, metricsRelative, resultSha256, metricsSha256 }) => {
    assert(result.runId === planned.runId, `${planned.order}: runId diverge do plano`);
    const completedStates = result.cases.filter((item) =>
      ["agent3a", "agent3b", "agent3c"].every((key) => item.rawAgentOutputs?.[key] != null)
    ).length;
    return {
      order: planned.order,
      replica: planned.replica,
      batchRange: planned.batchRange,
      plannedStatusAtFreeze: planned.status,
      observedStatus: result.status,
      runId: result.runId,
      startedAt: result.startedAt,
      completedAt: result.completedAt,
      stateUnits: result.cases.length,
      completedStateUnits: completedStates,
      failedStateUnits: result.cases.length - completedStates,
      exerciseReplicaUnits: sum(result.cases.map((item) => item.exerciseIds?.length || 0)),
      providerCalls: result.invocations.length,
      accountedCostUsd: result.safety?.spentUsd ?? null,
      result: {
        path: resultRelative,
        sha256: resultSha256,
      },
      metricsV21: {
        path: metricsRelative,
        sha256: metricsSha256,
      },
    };
  });

  const totals = {
    groupsPlanned: plan.groups.length,
    groupsObserved: groups.length,
    distinctExercises: exerciseIds.length,
    replicas: new Set(groups.map((group) => group.replica)).size,
    stateReplicaUnitsPlanned: plan.design.stateReplicaUnits,
    stateReplicaUnitsObserved: sum(groups.map((group) => group.stateUnits)),
    stateReplicaUnitsCompleted: sum(groups.map((group) => group.completedStateUnits)),
    stateReplicaUnitsFailed: sum(groups.map((group) => group.failedStateUnits)),
    exerciseReplicaUnits: sum(groups.map((group) => group.exerciseReplicaUnits)),
    generationCallsPlanned: plan.design.totalGenerationCalls,
    providerCallsObserved: sum(groups.map((group) => group.providerCalls)),
    callsSkippedAfterFailStop:
      plan.design.totalGenerationCalls - sum(groups.map((group) => group.providerCalls)),
    accountedCostUsd: Number(
      sum(groups.map((group) => Number(group.accountedCostUsd || 0))).toFixed(7)
    ),
  };

  assert(totals.groupsObserved === 6, `grupos=${totals.groupsObserved}, esperado=6`);
  assert(totals.distinctExercises === 24, `exercícios=${totals.distinctExercises}, esperado=24`);
  assert(totals.replicas === 3, `réplicas=${totals.replicas}, esperado=3`);
  assert(totals.stateReplicaUnitsObserved === 18, "eram esperadas 18 unidades estado-réplica");
  assert(totals.stateReplicaUnitsCompleted === 17, "eram esperadas 17 unidades completas");
  assert(totals.stateReplicaUnitsFailed === 1, "era esperada uma unidade falha");
  assert(totals.exerciseReplicaUnits === 72, "eram esperadas 72 unidades exercício-réplica");
  assert(totals.providerCallsObserved === 53, "eram esperadas 53 chamadas observadas");
  assert(totals.callsSkippedAfterFailStop === 1, "era esperada uma chamada não realizada");
  assert(Math.abs(totals.accountedCostUsd - 1.9539885) < 1e-7, "custo total diverge");

  const manifest = {
    schemaVersion: "educaoff-campaign4-completion-manifest-v1",
    createdAt: timestampFromSources(groups.map((group) => group.completedAt)),
    status: "completed-with-one-retained-failed-state-no-retry",
    chronology: {
      planStatusWasNotRewritten: true,
      explanation:
        "the prospective plan remains byte-preserved; this separate artifact records what was subsequently observed",
    },
    sourcePlan: {
      path: path.relative(REPO, planPath),
      sha256: planSha256,
      frozenAt: plan.frozenAt,
      timing: plan.timing,
    },
    totals,
    groups,
  };
  if (write) writeJson(outputPath, manifest);
  return { outputPath, manifest };
}

export function checkCampaign4CompletionManifest({ outputPath = DEFAULT_OUTPUT } = {}) {
  const { manifest } = buildCampaign4CompletionManifest({ outputPath, write: false });
  if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, "utf8") !== serialize(manifest)) {
    throw new Error(
      `Manifesto de conclusão C4 ausente ou divergente: ${path.relative(REPO, outputPath)}`
    );
  }
  return { status: "ok", mode: "check", outputPath, manifest };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const mode = args[0]?.startsWith("--") ? args.shift() : "--write";
  if (!["--write", "--check"].includes(mode) || args.length > 1) {
    process.stderr.write(
      "Uso: node analysis/build-campaign4-completion-manifest.mjs --write|--check [OUTPUT.json]\n"
    );
    process.exitCode = 2;
  } else {
    const outputPath = args[0] ? path.resolve(args[0]) : DEFAULT_OUTPUT;
    const { manifest } =
      mode === "--check"
        ? checkCampaign4CompletionManifest({ outputPath })
        : buildCampaign4CompletionManifest({ outputPath, write: true });
    process.stdout.write(
      `${JSON.stringify({
        status: mode === "--check" ? "ok" : manifest.status,
        mode,
        outputPath,
        totals: manifest.totals,
      })}\n`
    );
  }
}
