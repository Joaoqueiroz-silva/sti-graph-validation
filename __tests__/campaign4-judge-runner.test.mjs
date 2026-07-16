import { describe, expect, it } from "vitest";
import {
  C4_JUDGE_MODELS,
  C4_JUDGE_ROLES,
  buildJudgeMessages,
  buildJudgeUnits,
  krippendorffAlphaOrdinal,
  mutateCandidate,
  quadraticWeightedKappa,
  validateJudgeResponse,
} from "../production-fidelity/campaign4-judge-runner.mjs";

describe("painel cego auxiliar da Campanha 4", () => {
  it("congela somente o painel economico sem OpenAI ou Anthropic", () => {
    expect(C4_JUDGE_MODELS.map((model) => model.id)).toEqual([
      "z-ai/glm-5.2",
      "qwen/qwen3.7-plus",
      "deepseek/deepseek-v4-pro",
    ]);
    expect(C4_JUDGE_MODELS.every((model) => model.disableReasoning)).toBe(true);
    expect(
      C4_JUDGE_MODELS.every(
        (model) => !model.id.startsWith("openai/") && !model.id.startsWith("anthropic/")
      )
    ).toBe(true);
  });

  it("materializa 204 unidades observadas e 18 mutacoes predeclaradas", () => {
    const units = buildJudgeUnits();
    expect(units.main).toHaveLength(204);
    expect(units.mutation).toHaveLength(18);
    expect(units.selectedExercises).toEqual([
      "00bubble",
      "04soccerSeason",
      "08dentists",
      "12apples",
      "16bonusQuestion",
      "20birthday",
    ]);
    expect(new Set(units.main.map((unit) => unit.unitCode)).size).toBe(204);
    expect(units.main.every((unit) => !buildJudgeMessages(unit)[1].content.includes(unit.sourceRunId))).toBe(true);
  });

  it("as mutacoes degradam os tres papeis sem alterar a fonte", () => {
    const units = buildJudgeUnits();
    for (const agentKey of ["agent3a", "agent3b", "agent3c"]) {
      const source = units.main.find((unit) => unit.agentKey === agentKey);
      const before = JSON.stringify(source.candidate);
      const mutated = mutateCandidate(agentKey, source.candidate, source.context.expectedAnswer);
      expect(JSON.stringify(source.candidate)).toBe(before);
      expect(mutated).not.toEqual(source.candidate);
    }
  });

  it("aceita somente notas inteiras 0--4 e contrato exato", () => {
    const unit = buildJudgeUnits().main[0];
    const dimensions = C4_JUDGE_ROLES[unit.agentKey].dimensions;
    const response = {
      unitCode: unit.unitCode,
      agentRole: unit.agentRole,
      scores: Object.fromEntries(dimensions.map((dimension) => [dimension, 3])),
      rationale: "A saida e adequada, com pequena limitacao claramente observavel.",
      evidence: ["trecho curto"],
      confidence: 0.8,
      flags: ["none"],
    };
    expect(validateJudgeResponse(response, unit)).toEqual(response);
    expect(() =>
      validateJudgeResponse(
        { ...response, scores: { ...response.scores, [dimensions[0]]: 4.5 } },
        unit
      )
    ).toThrow(/nota invalida/);
    expect(() => validateJudgeResponse({ ...response, extra: true }, unit)).toThrow(/campos raiz/);
  });

  it("alfa ordinal e kappa ponderado recuperam concordancia perfeita", () => {
    expect(krippendorffAlphaOrdinal([[4, 4, 4], [3, 3, 3]])).toMatchObject({
      alpha: 1,
      nRatings: 6,
      nUnits: 2,
    });
    expect(quadraticWeightedKappa([[4, 4], [3, 3]])).toMatchObject({
      kappa: 1,
      n: 2,
    });
  });
});
