#!/usr/bin/env node

/**
 * Consolidacao final da Campanha 4.
 *
 * A unidade primaria e o exercicio: primeiro promediamos as tres replicas dentro
 * de cada exercicio e depois fazemos a media macro dos 24 exercicios. O bootstrap
 * reamostra exercicios, nunca chamadas ou juizes. O estado falho permanece no ITT
 * com os zeros/ausencias produzidos pelas metricas congeladas.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bootstrapCI } from "../stats.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const PLAN_PATH = path.join(
  REPO,
  "protocol",
  "production-freeze-2026-07-15",
  "campaign4-full-execution-plan.json"
);
const DEFAULT_OUTPUT = path.join(
  REPO,
  "resultados",
  "campanha4-2026-07-15",
  "campaign4-final-analysis-v2.1.json"
);
const BOOTSTRAP_ITERATIONS = 20_000;
const BOOTSTRAP_SEED = 20260715;

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256File = (file) =>
  crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const finite = (value) => Number.isFinite(value);
const sum = (values) => values.filter(finite).reduce((acc, value) => acc + value, 0);
const mean = (values) => {
  const xs = values.filter(finite);
  return xs.length ? sum(xs) / xs.length : null;
};
const round = (value, digits = 6) =>
  finite(value) ? Number(value.toFixed(digits)) : value ?? null;
const ratio = (numerator, denominator) =>
  denominator > 0 ? round(numerator / denominator) : null;
const quantile = (values, p) => {
  const xs = values.filter(finite).sort((a, b) => a - b);
  if (!xs.length) return null;
  const i = p * (xs.length - 1);
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return round(lo === hi ? xs[lo] : xs[lo] + (xs[hi] - xs[lo]) * (i - lo));
};

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temp, file);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Falha de consistencia C4: ${message}`);
}

function deterministicTimestamp(sourceTimestamps) {
  const milliseconds = sourceTimestamps.map((value) => Date.parse(value));
  assert(
    milliseconds.length > 0 && milliseconds.every(Number.isFinite),
    "completedAt ausente ou invalido nas fontes"
  );
  return new Date(Math.max(...milliseconds)).toISOString();
}

function meanByExercise(rows, accessor, { completeOnly = false } = {}) {
  const selected = completeOnly ? rows.filter((row) => row.completeState) : rows;
  const byExercise = new Map();
  for (const row of selected) {
    const value = accessor(row);
    if (!finite(value)) continue;
    const values = byExercise.get(row.exerciseId) || [];
    values.push(value);
    byExercise.set(row.exerciseId, values);
  }
  return [...byExercise.entries()]
    .map(([exerciseId, values]) => ({ exerciseId, value: mean(values), nReplicas: values.length }))
    .sort((a, b) => a.exerciseId.localeCompare(b.exerciseId));
}

function summarizeMetric(rows, accessor, opts = {}) {
  const perExercise = meanByExercise(rows, accessor, opts);
  const bootstrap = bootstrapCI(
    perExercise.map((row) => ({ value: row.value, cluster: row.exerciseId })),
    {
      iterations: BOOTSTRAP_ITERATIONS,
      seed: BOOTSTRAP_SEED + (opts.seedOffset || 0),
      alpha: 0.05,
    }
  );
  const selected = opts.completeOnly ? rows.filter((row) => row.completeState) : rows;
  return {
    estimand: opts.estimand || "media das replicas por exercicio, seguida de media macro dos exercicios",
    mean: bootstrap.mean,
    ci95PercentileClusterBootstrap: {
      lower: bootstrap.lower,
      upper: bootstrap.upper,
      iterations: BOOTSTRAP_ITERATIONS,
      seed: BOOTSTRAP_SEED + (opts.seedOffset || 0),
      cluster: "exerciseId",
    },
    sdAcrossExerciseMeans: bootstrap.sd,
    nExercises: perExercise.length,
    nExerciseReplicaFinite: selected.filter((row) => finite(accessor(row))).length,
    replicaCountsByExercise: Object.fromEntries(
      perExercise.map((row) => [row.exerciseId, row.nReplicas])
    ),
  };
}

function summarizeSchema(rows, key) {
  const stateSeen = new Set();
  let requiredFields = 0;
  let presentFields = 0;
  for (const row of rows) {
    const stateKey = `${row.replica}|${row.stateId}`;
    if (stateSeen.has(stateKey)) continue;
    stateSeen.add(stateKey);
    const schema = row.stateMetrics?.metrics?.[key]?.schemaAudit;
    requiredFields += schema?.requiredFields || 0;
    presentFields += schema?.presentFields || 0;
  }
  const emitted = rows.filter((row) => row[key]?.emitted).length;
  const exactId = rows.filter((row) => row[key]?.problemIdResolution === "exact_problem_id").length;
  return {
    exerciseReplicaOutputsEmitted: emitted,
    exerciseReplicaOutputsPlanned: rows.length,
    outputAvailabilityItt: ratio(emitted, rows.length),
    exactProblemIdResolved: exactId,
    exactProblemIdCoverageItt: ratio(exactId, rows.length),
    exactProblemIdCoverageCompleteStates: ratio(exactId, rows.filter((row) => row.completeState).length),
    requiredFieldsInObservedOutputs: requiredFields,
    presentFieldsInObservedOutputs: presentFields,
    observedOutputFieldCompleteness: ratio(presentFields, requiredFields),
  };
}

function sumFields(objects, key) {
  const names = new Set(objects.flatMap((object) => Object.keys(object?.[key] || {})));
  return Object.fromEntries(
    [...names].sort().map((name) => {
      const items = objects.map((object) => object?.[key]?.[name]).filter(Boolean);
      const sourcePresent = sum(items.map((item) => item.sourcePresent || 0));
      const preserved = sum(items.map((item) => item.preserved || 0));
      return [name, { sourcePresent, preserved, rate: ratio(preserved, sourcePresent) }];
    })
  );
}

function aggregateTransportAgent(objects, agentKey) {
  if (agentKey === "agent3a") {
    const rawItems = sum(objects.map((item) => item.rawItems || 0));
    const configItems = sum(objects.map((item) => item.configItems || 0));
    const graphStepNodes = sum(objects.map((item) => item.graphStepNodes || 0));
    const exact = sum(objects.map((item) => item.exactItemsPreservedRawToConfig || 0));
    return {
      rawItems,
      configItems,
      graphStepNodes,
      exactItemsPreservedRawToConfig: exact,
      exactItemPreservationRateRawToConfig: ratio(exact, rawItems),
      truncationCount: sum(objects.map((item) => item.truncationCount || 0)),
      rawToConfigFields: sumFields(objects, "rawToConfigFields"),
      configToGraphFields: sumFields(objects, "configToGraphFields"),
      problemIdPreservedRawToConfig: 0,
    };
  }
  if (agentKey === "agent3b") {
    const rawItems = sum(objects.map((item) => item.rawErrorItems || 0));
    const configItems = sum(objects.map((item) => item.configMisconceptionItems || 0));
    const graphItems = sum(objects.map((item) => item.graphMisconceptionItems || 0));
    const rawToConfig = sum(objects.map((item) => item.exactItemsPreservedRawToConfig || 0));
    const configToGraph = sum(objects.map((item) => item.exactItemsPreservedConfigToGraph || 0));
    return {
      rawErrorItems: rawItems,
      configMisconceptionItems: configItems,
      graphMisconceptionItems: graphItems,
      exactItemsPreservedRawToConfig: rawToConfig,
      exactItemPreservationRateRawToConfig: ratio(rawToConfig, rawItems),
      exactItemsPreservedConfigToGraph: configToGraph,
      exactItemPreservationRateConfigToGraph: ratio(configToGraph, configItems),
      droppedByMissingIdDedupOrStepTruncation: sum(
        objects.map((item) => item.droppedByMissingIdDedupOrStepTruncation || 0)
      ),
      rawToConfigFields: sumFields(objects, "rawToConfigFields"),
      configToGraphFields: sumFields(objects, "configToGraphFields"),
      problemIdPreservedRawToConfig: 0,
    };
  }
  const rawItems = sum(objects.map((item) => item.rawHintItems || 0));
  const configItems = sum(objects.map((item) => item.configHintItems || 0));
  const slotItems = sum(objects.map((item) => item.slotManifestExistingHints || 0));
  const graphHints = sum(objects.map((item) => item.genericGraphNodeHints || 0));
  const rawToConfig = sum(objects.map((item) => item.exactHintsPreservedRawToConfig || 0));
  const configToSlot = sum(
    objects.map((item) => item.exactHintsPreservedConfigToSlotManifest || 0)
  );
  return {
    rawHintItems: rawItems,
    configHintItems: configItems,
    slotManifestExistingHints: slotItems,
    genericGraphNodeHints: graphHints,
    exactHintsPreservedRawToConfig: rawToConfig,
    exactHintPreservationRateRawToConfig: ratio(rawToConfig, rawItems),
    exactHintsPreservedConfigToSlotManifest: configToSlot,
    exactHintPreservationRateConfigToSlotManifest: ratio(configToSlot, configItems),
    rawToConfigFields: sumFields(objects, "rawToConfigFields"),
    configToGraphFields: sumFields(objects, "configToGraphFields"),
    problemIdPreservedRawToConfig: 0,
  };
}

function aggregateTransport(stateMetrics, selector) {
  const transports = stateMetrics.map(selector).filter(Boolean);
  return {
    stateReplicaUnitsPlanned: stateMetrics.length,
    stateReplicaUnitsWithRawOutputs: stateMetrics.filter((item) => item.completeState).length,
    stateCoverage: ratio(
      stateMetrics.filter((item) => item.completeState).length,
      stateMetrics.length
    ),
    agent3a: aggregateTransportAgent(
      transports.map((item) => item.agent3a).filter(Boolean),
      "agent3a"
    ),
    agent3b: aggregateTransportAgent(
      transports.map((item) => item.agent3b).filter(Boolean),
      "agent3b"
    ),
    agent3c: aggregateTransportAgent(
      transports.map((item) => item.agent3c).filter(Boolean),
      "agent3c"
    ),
    interpretation:
      "taxas ponderadas por itens observados; o estado falho permanece na cobertura de estados, mas nao cria denominadores de campo inexistentes",
  };
}

function summarizeInvocations(invocations) {
  const summarize = (items) => {
    const latencies = items.map((item) => item.latencyMs).filter(finite);
    return {
      calls: items.length,
      promptTokens: sum(items.map((item) => item.usage?.promptTokens || 0)),
      completionTokens: sum(items.map((item) => item.usage?.completionTokens || 0)),
      accountedCostUsd: round(sum(items.map((item) => item.costUsd || 0)), 7),
      latencyMs: {
        mean: round(mean(latencies)),
        median: quantile(latencies, 0.5),
        p95: quantile(latencies, 0.95),
      },
      transportStatusOk: items.filter((item) => item.status === "ok").length,
      retries: items.filter((item) => Number(item.attempt) > 1).length,
      fallbacks: items.filter((item) => item.fallbackUsed).length,
    };
  };
  const agents = ["agent3a", "agent3b", "agent3c"];
  return {
    total: summarize(invocations),
    byAgent: Object.fromEntries(
      agents.map((agent) => [agent, summarize(invocations.filter((item) => item.agentKey === agent))])
    ),
  };
}

export function aggregateCampaign4({ outputPath = DEFAULT_OUTPUT, write = true } = {}) {
  const plan = readJson(PLAN_PATH);
  const rows = [];
  const stateMetrics = [];
  const invocations = [];
  const provenance = [];
  const failures = [];

  for (const group of plan.groups) {
    const dir = path.join(REPO, group.outputDir);
    const resultPath = path.join(dir, "campaign4-real-pilot.json");
    const metricPath = path.join(dir, "campaign4-real-pilot-metrics-v2.json");
    const result = readJson(resultPath);
    const analysis = readJson(metricPath);
    const metricsByState = new Map(analysis.cases.map((item) => [item.stateId, item]));
    invocations.push(...result.invocations.map((item) => ({ ...item, replica: group.replica })));
    provenance.push({
      order: group.order,
      replica: group.replica,
      runId: result.runId,
      status: result.status,
      completedAt: result.completedAt,
      outputDir: group.outputDir,
      resultSha256: sha256File(resultPath),
      metricsV21Sha256: sha256File(metricPath),
      accountedCostUsd: result.safety?.spentUsd ?? null,
    });
    if (result.failure) failures.push({ replica: group.replica, runId: result.runId, ...result.failure });

    for (const caseArtifact of result.cases) {
      const stateAnalysis = metricsByState.get(caseArtifact.stateId);
      assert(stateAnalysis, `metricas ausentes para ${result.runId}/${caseArtifact.stateId}`);
      const completeState = ["agent3a", "agent3b", "agent3c"].every(
        (key) => caseArtifact.rawAgentOutputs?.[key] != null
      );
      stateMetrics.push({
        replica: group.replica,
        stateId: caseArtifact.stateId,
        completeState,
        resultCase: caseArtifact,
        analysisCase: stateAnalysis,
      });
      const byProblem = {
        agent3a: new Map(
          stateAnalysis.metrics.agent3a.byProblem.map((item) => [item.problemId, item])
        ),
        agent3b: new Map(
          stateAnalysis.metrics.agent3b.byProblem.map((item) => [item.problemId, item])
        ),
        agent3c: new Map(
          stateAnalysis.metrics.agent3c.byProblem.map((item) => [item.problemId, item])
        ),
      };
      for (const exerciseId of caseArtifact.exerciseIds) {
        rows.push({
          exerciseId,
          replica: group.replica,
          stateId: caseArtifact.stateId,
          runId: result.runId,
          completeState,
          stateMetrics: stateAnalysis,
          agent3a: byProblem.agent3a.get(exerciseId),
          agent3b: byProblem.agent3b.get(exerciseId),
          agent3c: byProblem.agent3c.get(exerciseId),
        });
      }
    }
  }

  const exerciseIds = [...new Set(rows.map((row) => row.exerciseId))].sort();
  const completedStates = stateMetrics.filter((item) => item.completeState);
  const failedStates = stateMetrics.filter((item) => !item.completeState);
  const completeRows = rows.filter((row) => row.completeState);
  const invocationSummary = summarizeInvocations(invocations);
  const plannedCalls = stateMetrics.length * 3;
  const parserFailures = failures.length;
  const parserAccepted = invocations.length - parserFailures;
  const failedStateIds = new Set(
    failedStates.map((item) => `${item.replica}|${item.stateId}`)
  );
  const invocationsInFailedStates = invocations.filter((item) =>
    failedStateIds.has(`${item.replica}|${item.stateId}`)
  ).length;
  const acceptedButNotIntegrated = Math.max(0, invocationsInFailedStates - parserFailures);

  assert(plan.groups.length === 6, "eram esperados seis grupos");
  assert(stateMetrics.length === 18, `estados=${stateMetrics.length}, esperado=18`);
  assert(completedStates.length === 17, `estados completos=${completedStates.length}, esperado=17`);
  assert(failedStates.length === 1, `estados falhos=${failedStates.length}, esperado=1`);
  assert(exerciseIds.length === 24, `exercicios=${exerciseIds.length}, esperado=24`);
  assert(rows.length === 72, `unidades exercicio-replica=${rows.length}, esperado=72`);
  assert(completeRows.length === 68, `unidades completas=${completeRows.length}, esperado=68`);
  assert(invocations.length === 53, `chamadas=${invocations.length}, esperado=53`);
  assert(plannedCalls === 54, `chamadas planejadas=${plannedCalls}, esperado=54`);
  assert(parserAccepted === 52, `respostas aceitas pelo parser=${parserAccepted}, esperado=52`);
  assert(acceptedButNotIntegrated === 1, `respostas nao integradas=${acceptedButNotIntegrated}, esperado=1`);
  assert(
    Math.abs(invocationSummary.total.accountedCostUsd - 1.9539885) < 1e-7,
    `custo=${invocationSummary.total.accountedCostUsd}, esperado=1.9539885`
  );
  assert(
    completedStates.every((item) =>
      [item.resultCase.graphForge?.operational, item.resultCase.graphForge?.capacity3c].every(
        (arm) => arm?.runHashes?.length === 2 && arm.runHashes[0] === arm.runHashes[1]
      )
    ),
    "GraphForge nao foi deterministico em algum estado completo"
  );

  const direct = {
    agent3a: {
      exactConcreteOrderedRecallItt: summarizeMetric(
        rows,
        (row) => row.agent3a.exactConcreteOrderedRecallItt,
        { seedOffset: 1 }
      ),
      exactConcreteOrderedRecallCompleteStateSensitivity: summarizeMetric(
        rows,
        (row) => row.agent3a.exactConcreteOrderedRecallItt,
        { completeOnly: true, seedOffset: 2 }
      ),
      finalAnswerExactConcreteMatchItt: summarizeMetric(
        rows,
        (row) => Number(row.agent3a.finalAnswer.exactConcreteMatch),
        { seedOffset: 3 }
      ),
      genericResultRateConditionalOnEmittedOutput: summarizeMetric(
        rows,
        (row) => row.agent3a.genericRate,
        {
          seedOffset: 4,
          estimand: "media macro entre exercicios com resultado emitido; diagnostico do contrato generico",
        }
      ),
      schemaAndIdentity: summarizeSchema(rows, "agent3a"),
      interpretation:
        "o prompt ordena placeholders genericos; recall concreto zero diagnostica incompatibilidade entre contrato e referencia concreta, nao erro matematico por si so",
    },
    agent3b: {
      exactConcreteRecallByUniqueValueItt: summarizeMetric(
        rows,
        (row) => row.agent3b.exactConcreteRecallByUniqueValueItt,
        { seedOffset: 5 }
      ),
      exactConcreteRecallCompleteStateSensitivity: summarizeMetric(
        rows,
        (row) => row.agent3b.exactConcreteRecallByUniqueValueItt,
        { completeOnly: true, seedOffset: 6 }
      ),
      ordinalStepValueProxySensitivity: summarizeMetric(
        rows,
        (row) => row.agent3b.ordinalProxy.exactConcreteRecall,
        { seedOffset: 7 }
      ),
      generatedWrongAnswerEqualToCorrectAnswer: {
        count: sum(rows.map((row) => row.agent3b.generatedWrongAnswersEqualCorrectAnswer || 0)),
        generatedConcreteErrors: sum(rows.map((row) => row.agent3b.concreteErrors || 0)),
      },
      ctatStateSaiRecall: null,
      ctatStateSaiEstimable: false,
      ctatStateSaiReason:
        "o contrato nao emite state ID + Selection + Action CTAT; o proxy ordinal nao e concordancia de estado",
      schemaAndIdentity: summarizeSchema(rows, "agent3b"),
    },
    agent3cCapacityArm: {
      strictProblemSuccessItt: summarizeMetric(
        rows,
        (row) => row.agent3c.strictProblemSuccessItt,
        { seedOffset: 8 }
      ),
      strictProblemSuccessCompleteStateSensitivity: summarizeMetric(
        rows,
        (row) => row.agent3c.strictProblemSuccessItt,
        { completeOnly: true, seedOffset: 9 }
      ),
      fourLevelCompletenessConditional: summarizeMetric(
        rows,
        (row) => row.agent3c.fourLevelCompletenessConditional,
        {
          seedOffset: 10,
          estimand: "media macro por exercicio entre replicas com ao menos um passo elegivel",
        }
      ),
      strictFourLevelValidityConditional: summarizeMetric(
        rows,
        (row) => row.agent3c.strictFourLevelValidityConditional,
        {
          seedOffset: 11,
          estimand: "media macro por exercicio entre replicas com ao menos um passo elegivel",
        }
      ),
      literalFinalAnswerLeakageRateConditional: summarizeMetric(
        rows,
        (row) => row.agent3c.finalAnswerLeakageRate,
        {
          seedOffset: 12,
          estimand: "media macro por exercicio entre replicas com dicas emitidas",
        }
      ),
      pooledCountsObserved: {
        eligibleGeneratedSteps: sum(rows.map((row) => row.agent3c.eligibleGeneratedSteps || 0)),
        hints: sum(rows.map((row) => row.agent3c.counts.hints || 0)),
        stepsFourLevelsComplete: sum(
          rows.map((row) => row.agent3c.counts.stepsFourLevelsComplete || 0)
        ),
        stepsStrictValid: sum(rows.map((row) => row.agent3c.counts.stepsStrictValid || 0)),
        finalAnswerLeakingHints: sum(
          rows.map((row) => row.agent3c.counts.finalAnswerLeakingHints || 0)
        ),
      },
      schemaAndIdentity: summarizeSchema(rows, "agent3c"),
      interpretation:
        "proxy operacional intrinseco; nao mede aprendizagem, progressividade validada por humanos ou eficacia pedagogica",
    },
  };
  direct.agent3b.generatedWrongAnswerEqualToCorrectAnswer.rate = ratio(
    direct.agent3b.generatedWrongAnswerEqualToCorrectAnswer.count,
    direct.agent3b.generatedWrongAnswerEqualToCorrectAnswer.generatedConcreteErrors
  );
  const c3counts = direct.agent3cCapacityArm.pooledCountsObserved;
  c3counts.fourLevelCompletenessPooled = ratio(
    c3counts.stepsFourLevelsComplete,
    c3counts.eligibleGeneratedSteps
  );
  c3counts.strictValidityPooled = ratio(c3counts.stepsStrictValid, c3counts.eligibleGeneratedSteps);
  c3counts.literalFinalAnswerLeakagePooled = ratio(
    c3counts.finalAnswerLeakingHints,
    c3counts.hints
  );

  const operationalPolicies = completedStates.map((item) => item.resultCase.operationalPolicy);
  const graphDeterminismPairs = completedStates.length * 2;
  const aggregate = {
    schemaVersion: "educaoff-campaign4-final-analysis-v2.1",
    createdAt: deterministicTimestamp(provenance.map((item) => item.completedAt)),
    analysisTiming: "after-raw-output-freeze-and-after-transparent-v2.1-erratum",
    generationModel: plan.model,
    design: {
      exercises: exerciseIds.length,
      replicas: 3,
      stateReplicaUnitsPlanned: stateMetrics.length,
      stateReplicaUnitsCompleted: completedStates.length,
      stateReplicaUnitsFailed: failedStates.length,
      stateCompletionRate: ratio(completedStates.length, stateMetrics.length),
      exerciseReplicaUnitsPlannedPerAgent: rows.length,
      exerciseReplicaUnitsObservedPerAgent: completeRows.length,
      exerciseReplicaAvailability: ratio(completeRows.length, rows.length),
      primaryUnitOfAnalysis: "exerciseId",
      replicaAggregation: "mean within exercise before corpus macro mean",
      failurePolicy: "ITT zero/absence; no retry, no repair, no imputation",
    },
    execution: {
      ...invocationSummary,
      providerResponses: invocations.length,
      productionParserAcceptedResponses: parserAccepted,
      productionStateIntegratedAgentOutputs: completedStates.length * 3,
      parseFailures: parserFailures,
      unintegratedButParserReturnedBeforeAtomicFailure: acceptedButNotIntegrated,
      plannedCalls,
      skippedBecauseFailStop: plannedCalls - invocations.length,
      graphForgeDeterminism: {
        rerunPairsChecked: graphDeterminismPairs,
        identicalPairs: graphDeterminismPairs,
        rate: 1,
      },
      operationalPolicy: {
        completedStates: operationalPolicies.length,
        agent3cSkipped: operationalPolicies.filter((item) => item?.skip3c).length,
        agent3cSkipRate: ratio(
          operationalPolicies.filter((item) => item?.skip3c).length,
          operationalPolicies.length
        ),
        capacityArmForced: operationalPolicies.filter((item) => item?.capacityArmForced).length,
      },
    },
    directMetrics: direct,
    transport: {
      capacityArm: aggregateTransport(stateMetrics, (item) => item.analysisCase.metrics.transport),
      operationalArm: aggregateTransport(stateMetrics, (item) => item.analysisCase.transportOperational),
      erratum:
        "v2.1 corrige somente as quatro taxas por campo step/action/result/kcUsed de raw para config do 3a; contagens exatas e demais estimandos nao mudaram",
    },
    failedUnit: {
      replica: failedStates[0].replica,
      stateId: failedStates[0].stateId,
      exerciseIds: failedStates[0].resultCase.exerciseIds,
      generatorCallsReceived: ["agent3a", "agent3b"],
      agent3cCalled: false,
      parserFailureAgent: "agent3b",
      retry: false,
      imputation: false,
      rawMalformedResponseSha256:
        "97a7cf19cd6379a4807e44e0082b0e0f06b5ace8d1e1ce4240ab99f078603207",
    },
    provenance: {
      productionImage: plan.image,
      executionPlan: {
        path: path.relative(REPO, PLAN_PATH),
        sha256: sha256File(PLAN_PATH),
      },
      metricsFreeze: {
        version: "educaoff-campaign4-metrics-v2",
        codeSha256: "4f8ae7d374bb08fe9ac59cedc622fde92f40379f635b47a05fc69d9044dfd6fa",
      },
      metricsErratum: {
        version: "educaoff-campaign4-metrics-v2.1-erratum",
        path:
          "protocol/production-freeze-2026-07-15/AMENDMENT-C4-METRICS-V2.1-ERRATUM-2026-07-15.md",
        codeSha256: sha256File(
          path.join(REPO, "production-fidelity", "campaign4-metrics-v2.mjs")
        ),
        testsSha256: sha256File(
          path.join(REPO, "__tests__", "campaign4-metrics-v2.test.mjs")
        ),
      },
      groups: provenance,
    },
    inferentialLimits: [
      "BRDs sao referencias de autor CTAT, nao verdade pedagogica universal",
      "recall concreto do 3a e incompatibilidade de contrato porque o prompt exige placeholders",
      "o 3b nao permite estimar concordancia direta de estado/SAI CTAT",
      "as metricas do 3c sao proxies operacionais e nao demonstram aprendizagem",
      "transporte de campo nao e qualidade pedagogica",
      "um unico dominio, um unico modelo gerador e 24 exercicios limitam generalizacao",
      "o painel LLM auxiliar, se executado, nao substitui avaliadores humanos especialistas",
    ],
  };

  if (write) writeJson(outputPath, aggregate);
  return { outputPath, aggregate };
}

const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;

export function checkCampaign4Aggregate({ outputPath = DEFAULT_OUTPUT } = {}) {
  const { aggregate } = aggregateCampaign4({ outputPath, write: false });
  if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, "utf8") !== serialize(aggregate)) {
    throw new Error(
      `Analise final C4 ausente ou divergente: ${path.relative(REPO, outputPath)}`
    );
  }
  return { status: "ok", mode: "check", outputPath, aggregate };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const mode = args[0]?.startsWith("--") ? args.shift() : "--write";
  if (!["--write", "--check"].includes(mode) || args.length > 1) {
    process.stderr.write("Uso: node analysis/aggregate-campaign4.mjs --write|--check [OUTPUT.json]\n");
    process.exitCode = 2;
  } else {
    const outputPath = args[0] ? path.resolve(args[0]) : DEFAULT_OUTPUT;
    const { aggregate } =
      mode === "--check"
        ? checkCampaign4Aggregate({ outputPath })
        : aggregateCampaign4({ outputPath, write: true });
    process.stdout.write(
      `${JSON.stringify({
        status: mode === "--check" ? "ok" : "completed",
        mode,
        output: outputPath,
        exercises: aggregate.design.exercises,
        statesCompleted: aggregate.design.stateReplicaUnitsCompleted,
        calls: aggregate.execution.providerResponses,
        costUsd: aggregate.execution.total.accountedCostUsd,
      })}\n`
    );
  }
}
