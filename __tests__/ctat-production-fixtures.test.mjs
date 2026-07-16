import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildProductionStates,
  writeProductionFixtures,
} from "../production-fidelity/build-ctat-fixtures.mjs";
import { sha256Json, validateProductionState } from "../production-fidelity/equivalence-gate.mjs";
import { runFixturePreflight } from "../production-fidelity/run-fixture-preflight.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");
const ANSWER_KEY_PATH = path.join(REPO_ROOT, "answer-key/frac-numberline-6.17.json");

describe("fixtures CTAT no contrato real dos Agents3", () => {
  it("gera seis lotes de quatro e cobre os 24 exercícios uma única vez", () => {
    const answerKey = JSON.parse(fs.readFileSync(ANSWER_KEY_PATH, "utf8"));
    const states = buildProductionStates(answerKey);
    expect(states).toHaveLength(6);
    expect(states.every((state) => state.seedProblems.length === 4)).toBe(true);
    expect(states.every((state) => validateProductionState(state).valid)).toBe(true);

    const ids = states.flatMap((state) => state.seedProblems.map((seed) => seed.id));
    expect(ids).toHaveLength(24);
    expect(new Set(ids).size).toBe(24);
    expect(ids).toEqual(answerKey.exercises.map((exercise) => exercise.id));
  });

  it("preserva enunciado e resposta independente sem campos do adaptador/gold", () => {
    const answerKey = JSON.parse(fs.readFileSync(ANSWER_KEY_PATH, "utf8"));
    const states = buildProductionStates(answerKey);
    const seeds = states.flatMap((state) => state.seedProblems);
    for (const exercise of answerKey.exercises) {
      const seed = seeds.find((item) => item.id === exercise.id);
      expect(seed.statement).toBe(exercise.statement);
      expect(seed.expectedAnswer).toBe(exercise.correctAnswer);
      expect(seed).not.toHaveProperty("correctAnswer");
      expect(seed).not.toHaveProperty("components");
      expect(seed).not.toHaveProperty("interfaceConfig");
    }
  });

  it("publica hashes reproduzíveis e declara zero chamadas", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ctat-production-fixtures-"));
    try {
      const { manifest, states } = writeProductionFixtures({
        answerKeyPath: ANSWER_KEY_PATH,
        outputDir: tempDir,
      });
      expect(manifest.batching).toMatchObject({ batchSize: 4, batchCount: 6, exerciseCount: 24 });
      expect(manifest.provenance.basis).toMatch(/nenhum expert\.brd/);
      expect(manifest.fixtures.map((fixture) => fixture.stateSha256)).toEqual(
        states.map((state) => sha256Json(state))
      );
      expect(fs.readdirSync(tempDir)).toHaveLength(7);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("o construtor não contém caminho ou importação de BRD/envelopes", () => {
    const source = fs.readFileSync(
      path.join(REPO_ROOT, "production-fidelity/build-ctat-fixtures.mjs"),
      "utf8"
    );
    expect(source).not.toMatch(/datasets\/.*expert\.brd/);
    expect(source).not.toMatch(/readFileSync\([^\n]*(expert\.brd|envelope-[ab])/i);
  });

  it("executa o preflight das seis fixtures sem rede nem custo e sem alegação de produção", () => {
    const report = runFixturePreflight();
    expect(report).toMatchObject({
      mode: "mock",
      batches: 6,
      exercises: 24,
      plumbingPassed: true,
      productionEquivalent: false,
      productionClaimAllowed: false,
      networkCalls: 0,
      paidCalls: 0,
    });
    expect(report.cases.every((item) => item.gates.every((gate) => gate.passed))).toBe(true);
  });
});
