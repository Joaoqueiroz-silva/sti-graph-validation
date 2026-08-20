import { afterEach, describe, expect, it } from "vitest";
import https from "node:https";
import {
  installNetworkTripwire,
  runDecoupledTutorProof,
} from "../analysis/orientador-v08/executar-tutoria-desacoplada.mjs";

let activeTripwire = null;

afterEach(() => {
  activeTripwire?.restore();
  activeTripwire = null;
});

describe("tutoria pré-compilada e desacoplada do modelo", () => {
  it("o tripwire intercepta fetch e HTTPS antes que alcancem a rede", () => {
    activeTripwire = installNetworkTripwire();

    expect(() => globalThis.fetch("https://example.invalid/proibido")).toThrow(/Acesso de rede proibido/);
    expect(() => https.request("https://example.invalid/proibido")).toThrow(/Acesso de rede proibido/);
    expect(activeTripwire.attempts).toEqual(["global.fetch", "https.request"]);
  });

  it("executa 105 referências e os 630 grafos finais, cobrindo acerto, erro, dica e determinismo", async () => {
    const report = await runDecoupledTutorProof({ repetitions: 3 });

    expect(report.schema).toBe("sti-graph-validation/decoupled-tutor-proof/v2");
    const reference = report.referenceCtat;
    expect(reference.totals.graphs).toBe(105);
    expect(reference.scope.corpora).toHaveLength(5);
    expect(reference.totals.correctSteps).toBe(1154);
    expect(reference.totals.reachableBuggyTransitions).toBe(747);
    expect(reference.totals.executableBuggyTransitions).toBe(746);
    expect(reference.totals.shadowedBuggyTransitions).toBe(1);
    expect(reference.totals.executableBuggyTransitions + reference.totals.shadowedBuggyTransitions)
      .toBe(reference.totals.reachableBuggyTransitions);
    expect(reference.totals.buggyFeedbackChecks).toBe(745);
    expect(reference.totals.hintChecks).toBe(1259);
    expect(reference.totals.deterministicExecutions).toBe(105 * 3);
    expect(reference.totals.graphsWithInferredFinalState).toBe(42);
    expect(reference.totals.graphsWithUnsupportedConstructs).toBe(105);
    expect(reference.anomalies.shadowedBuggyTransitions).toEqual([
      { case: "ctat-6.20/12charity", count: 1 },
    ]);

    const generated = report.generatedFinal;
    expect(generated.totals).toMatchObject({
      graphs: 630,
      steps: 4469,
      hints: 17876,
      stepsWithoutHints: 0,
      stepsWithoutMisconceptions: 1476,
      misconceptions: 6021,
      validatedMisconceptionRoutes: 6021,
      observableBuggyInputs: 6021,
      misconceptionsShadowedByCorrect: 0,
      misconceptionsShadowedByDuplicateInput: 0,
      buggyFeedbackChecks: 6021,
      hintChecks: 5099,
      noMatchChecks: 630,
      deterministicExecutions: 630 * 3,
      scaffoldNodes: 10490,
      strugglesEdges: 4469,
      masterySkipEdges: 3839,
      graphsWithoutMisconceptions: 11,
    });
    expect(generated.scope.corpora).toHaveLength(5);
    expect(new Set(generated.scope.arms)).toEqual(new Set(["custo-beneficio", "estudantes-qwen"]));
    expect(generated.scope.replicas).toEqual([1, 2, 3]);
    expect(generated.anomalies.artifactsWithCorrectShadowing).toEqual([]);
    expect(generated.anomalies.artifactsWithDuplicateWrongInputs).toEqual([]);
    expect(generated.anomalies.artifactsWithoutMisconceptions).toHaveLength(11);
    expect(generated.anomalies.artifactsWithStepsWithoutHints).toEqual([]);

    expect(report.safeguards.importedExecutorsOnlyAfterNetworkBlock).toBe(true);
    expect(report.safeguards.observedNetworkAttempts).toBe(0);
    expect(report.safeguards.llmCalls).toBe(0);
    expect(report.safeguards.llmDependencyBoundary.forbiddenLlmDependencies).toBe(0);
    expect(report.safeguards.llmDependencyBoundary.localModules.map((item) => item.file)).toContain(
      "analysis/orientador-v08/executor-grafo-gerado.mjs"
    );
    expect(Object.values(reference.assertions).every(Boolean)).toBe(true);
    expect(Object.values(generated.assertions).every(Boolean)).toBe(true);

    expect(reference.cases).toHaveLength(105);
    for (const item of reference.cases) {
      expect(item.correctSteps).toBeGreaterThan(0);
      expect(item.hintChecks).toBe(item.correctSteps + 1);
      expect(item.deterministicExecutions).toBe(3);
      expect(item.canonicalTrajectorySha256).toMatch(/^[a-f0-9]{64}$/);
      expect(item.mixedTrajectorySha256).toMatch(/^[a-f0-9]{64}$/);
    }

    expect(generated.artifacts).toHaveLength(630);
    for (const item of generated.artifacts) {
      expect(item.steps).toBeGreaterThan(0);
      expect(item.hintChecks).toBe(item.steps + 1);
      expect(item.validatedMisconceptionRoutes).toBe(item.misconceptions);
      expect(item.deterministicExecutions).toBe(3);
      expect(item.canonicalTrajectorySha256).toMatch(/^[a-f0-9]{64}$/);
      expect(item.mixedTrajectorySha256).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it("duas auditorias independentes produzem os mesmos digests", async () => {
    const first = await runDecoupledTutorProof({ repetitions: 2 });
    const second = await runDecoupledTutorProof({ repetitions: 2 });

    expect(second.referenceCtat.digests).toEqual(first.referenceCtat.digests);
    expect(second.referenceCtat.byCorpus).toEqual(first.referenceCtat.byCorpus);
    expect(second.referenceCtat.totals).toEqual(first.referenceCtat.totals);
    expect(second.generatedFinal.digests).toEqual(first.generatedFinal.digests);
    expect(second.generatedFinal.byCorpusAndArm).toEqual(first.generatedFinal.byCorpusAndArm);
    expect(second.generatedFinal.totals).toEqual(first.generatedFinal.totals);
  });
});
