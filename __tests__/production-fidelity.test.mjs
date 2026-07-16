import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  PRODUCTION_SOURCE_FILES,
  evaluateEquivalence,
  projectAgentState,
  sha256Json,
  stableStringify,
  validateProductionState,
} from "../production-fidelity/equivalence-gate.mjs";
import {
  RealExecutionDisabledError,
  assertRealModeAllowed,
  buildMockExpectedManifest,
  buildMockObservation,
  createExampleProductionState,
  runMockPreflight,
} from "../production-fidelity/preflight-runner.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const clone = (x) => JSON.parse(JSON.stringify(x));

describe("contrato do estado de produção", () => {
  it("congela a imagem auditada e usa os mesmos caminhos do gate", () => {
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(
          HERE,
          "../protocol/production-freeze-2026-07-15/production-image-manifest.json"
        ),
        "utf8"
      )
    );
    expect(manifest.container.imageId).toMatch(/^sha256:[a-f0-9]{64}$/);
    for (const [key, expectedPath] of Object.entries(PRODUCTION_SOURCE_FILES)) {
      expect(manifest.files[key].path).toBe(expectedPath);
      expect(manifest.files[key].sha256).toMatch(/^[a-f0-9]{64}$/);
    }
    expect(manifest.agentConfigs.agent3a.model).toBe("google/gemini-3.5-flash");
  });

  it("publica JSON Schema válido e fechado na raiz", () => {
    const schema = JSON.parse(
      fs.readFileSync(path.join(HERE, "../production-fidelity/production-state.schema.json"), "utf8")
    );
    expect(schema.$schema).toContain("2020-12");
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.seedProblems.minItems).toBe(4);
    expect(schema.properties.seedProblems.maxItems).toBe(4);
  });

  it("aceita fixture completa e projeta somente o state entregue aos agentes", () => {
    const state = createExampleProductionState();
    expect(validateProductionState(state)).toEqual({ valid: true, errors: [] });
    const projected = projectAgentState(state);
    expect(projected.schemaVersion).toBeUndefined();
    expect(projected.seedProblems).toHaveLength(4);
    expect(projected.seedProblems[0].solutionSteps[0]).toHaveProperty("kc");
  });

  it("rejeita entrada experimental, falta de KC e menos de quatro seeds", () => {
    const state = createExampleProductionState();
    state.seedProblems = state.seedProblems.slice(0, 3);
    state.seedProblems[0].instrucoes = "use números concretos";
    state.knowledgeComponents = [];
    const result = validateProductionState(state);
    expect(result.valid).toBe(false);
    expect(result.errors.map((e) => e.path)).toEqual(
      expect.arrayContaining([
        "$.seedProblems",
        "$.seedProblems[0].instrucoes",
        "$.knowledgeComponents",
      ])
    );
  });

  it("rejeita referência ao BRD/gold em qualquer profundidade", () => {
    const state = createExampleProductionState();
    state.masterGraphContext.gold = { brd: "conteúdo proibido" };
    const result = validateProductionState(state);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === "$.masterGraphContext.gold")).toBe(true);
    expect(result.errors.some((e) => e.path === "$.masterGraphContext.gold.brd")).toBe(true);
  });
});

describe("gates de equivalência", () => {
  it("preflight mockado passa o plumbing, mas nunca autoriza alegação de produção", () => {
    const report = runMockPreflight(createExampleProductionState());
    expect(report.networkCalls).toBe(0);
    expect(report.paidCalls).toBe(0);
    expect(report.equivalence.passed).toBe(true);
    expect(report.equivalence.productionEquivalent).toBe(false);
    expect(report.equivalence.productionClaimAllowed).toBe(false);
    expect(report.productionEquivalent).toBe(false);
  });

  it("não promove observação mockada mesmo que o chamador force mode=real", () => {
    const state = createExampleProductionState();
    const observed = buildMockObservation(state);
    const expected = buildMockExpectedManifest(state, observed);
    const report = evaluateEquivalence({ state, expected, observed, mode: "real" });
    expect(report.passed).toBe(true);
    expect(report.productionEquivalent).toBe(false);
    expect(report.productionClaimAllowed).toBe(false);
    expect(report.notice).toMatch(/mockado/);
  });

  it("mudança de hash de fonte falha em modo fail-closed", () => {
    const state = createExampleProductionState();
    const observed = buildMockObservation(state);
    const expected = buildMockExpectedManifest(state, observed);
    observed.files.graphForge.sha256 = "0".repeat(64);
    const report = evaluateEquivalence({ state, expected, observed, mode: "real" });
    expect(report.passed).toBe(false);
    expect(report.productionClaimAllowed).toBe(false);
    expect(report.gates.find((g) => g.id === "source-files").passed).toBe(false);
  });

  it("mudança de prompt ou configuração efetiva também bloqueia", () => {
    const state = createExampleProductionState();
    const observed = buildMockObservation(state);
    const expected = buildMockExpectedManifest(state, observed);
    observed.promptHashes.agent3b.userSha256 = "f".repeat(64);
    observed.agentConfigs.agent3a.temperature = 0.9;
    const report = evaluateEquivalence({ state, expected, observed, mode: "real" });
    expect(report.gates.find((g) => g.id === "prompt-hashes").passed).toBe(false);
    expect(report.gates.find((g) => g.id === "agent-configs").passed).toBe(false);
    expect(report.productionEquivalent).toBe(false);
  });

  it("detecta não determinismo do GraphForge", () => {
    const state = createExampleProductionState();
    const observed = buildMockObservation(state);
    const expected = buildMockExpectedManifest(state, observed);
    observed.graphForgeRunHashes[1] = "a".repeat(64);
    const report = evaluateEquivalence({ state, expected, observed, mode: "real" });
    expect(report.gates.find((g) => g.id === "graphforge-determinism").passed).toBe(false);
  });

  it("amarra o manifesto à fixture exata", () => {
    const state = createExampleProductionState();
    const observed = buildMockObservation(state);
    const expected = buildMockExpectedManifest(state, observed);
    const changed = clone(state);
    changed.topic = "outro tópico";
    const report = evaluateEquivalence({ state: changed, expected, observed, mode: "real" });
    expect(report.gates.find((g) => g.id === "state-hash").passed).toBe(false);
    expect(expected.stateSha256).toBe(sha256Json(state));
  });
});

describe("segurança operacional do runner", () => {
  it("modo real exige autorização explícita e continua sem implementação paga", () => {
    expect(() => assertRealModeAllowed()).toThrow(RealExecutionDisabledError);
    expect(() => assertRealModeAllowed({ allowReal: true })).toThrow(/não implementado/);
  });

  it("serialização canônica independe da ordem das chaves", () => {
    expect(stableStringify({ b: 2, a: { d: 4, c: 3 } })).toBe(
      stableStringify({ a: { c: 3, d: 4 }, b: 2 })
    );
  });

  it("mantém hints, diagnóstico, feedback e remediação nos artefatos mockados", () => {
    const report = runMockPreflight(createExampleProductionState());
    const { atRiskTrace, averageTrace } = report.artifacts.traces;
    const error = atRiskTrace.solutions[0].attempts[0].solutionTrace[0].error;
    expect(error).toMatchObject({
      diagnosticQuestion: expect.any(String),
      feedback: expect.any(String),
      howToFix: expect.any(String),
    });
    expect(averageTrace.solutions[0].solutionTrace[0].hintsNeeded).toHaveLength(2);
    expect(report.artifacts.slotManifest.hintsByStep[0]).toHaveLength(2);
  });
});
