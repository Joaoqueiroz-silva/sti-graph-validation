/**
 * materialize.test.mjs — builder do dataset (buildProblemRecord) + consumo (authorFromEnvelopeA).
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildProblemRecord } from "../materialize-dataset.mjs";
import { authorFromEnvelopeA } from "../author-from-ctat.js";
import { findLeaksInRobotInput } from "../parse-ctat-brd.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BRD = fs.readFileSync(path.join(HERE, "../cases/ctat-6.17/01watermelon/expert.brd"), "utf8");

describe("buildProblemRecord (1 .brd → 3 artefatos)", () => {
  const { envelopeA, envelopeB, meta } = buildProblemRecord(BRD, "01watermelon");

  it("envelope-a é CEGO (0 vazamentos) e tem interface + resposta", () => {
    expect(findLeaksInRobotInput(envelopeA)).toEqual([]);
    expect(envelopeA.correctAnswer).toBe("1/4");
    expect(envelopeA.components.length).toBeGreaterThan(0);
    expect(envelopeA.knowledgeComponents.length).toBe(5);
  });

  it("envelope-b é o gold do especialista (passos + misconceptions)", () => {
    expect(envelopeB.steps.length).toBeGreaterThan(0);
    expect(envelopeB.misconceptions.length).toBe(8);
  });

  it("meta resume o problema e confirma leaks=[]", () => {
    expect(meta.id).toBe("01watermelon");
    expect(meta.leaks).toEqual([]);
    expect(meta.brdSha256).toMatch(/^[0-9a-f]{16}$/);
    expect(meta.counts.misconceptions).toBe(8);
    expect(meta.knowledgeComponents).toContain("IdenDenominator");
  });

  it("é determinístico: mesmo .brd → mesmo hash e mesmas contagens", () => {
    const again = buildProblemRecord(BRD, "01watermelon");
    expect(again.meta.brdSha256).toBe(meta.brdSha256);
    expect(again.meta.counts).toEqual(meta.counts);
  });
});

describe("authorFromEnvelopeA (agentes consomem o dataset)", () => {
  it("autora o grafo a partir do envelope-a, sem reparsear o .brd", async () => {
    const { envelopeA } = buildProblemRecord(BRD, "01watermelon");
    const fake = async () => ({
      correctPath: [{ kc: "k", selection: "numline", result: "1/4" }],
      misconceptions: [{ selection: "numline", wrongAnswer: "0/4" }],
      hints: [],
    });
    const res = await authorFromEnvelopeA(envelopeA, { simulate: fake });
    expect(res.graph).toBeTruthy();
    expect(res.neutral.steps.length).toBeGreaterThan(0);
    expect(res.envelopeA.correctAnswer).toBe("1/4");
  });
});
