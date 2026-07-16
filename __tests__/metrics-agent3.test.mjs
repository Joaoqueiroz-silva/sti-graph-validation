import { describe, expect, it } from "vitest";
import {
  evaluateAgent3a,
  evaluateAgent3b,
  evaluateAgent3c,
  hintLeaksAnswer,
  longestCommonSubsequenceLength,
} from "../metrics-agent3.mjs";

function referenceV2() {
  return {
    schemaVersion: 2,
    startState: "s0",
    finalStates: ["goal"],
    transitions: [
      {
        id: "c1",
        from: "s0",
        to: "s1",
        type: "correct",
        actor: "Student",
        sai: { selection: "a", action: "Update", input: "1" },
        hints: ["dica do primeiro passo"],
      },
      {
        id: "b1",
        from: "s0",
        to: "s0",
        type: "buggy",
        actor: "Student",
        sai: { selection: "a", action: "Update", input: "9" },
      },
      {
        id: "c2",
        from: "s1",
        to: "s2",
        type: "correct",
        actor: "Student",
        sai: { selection: "b", action: "Update", input: "2/4" },
        hints: ["dica do segundo passo"],
      },
      {
        id: "b2",
        from: "s1",
        to: "s1",
        type: "buggy",
        actor: "Student",
        sai: { selection: "b", action: "Update", input: "8" },
      },
      {
        id: "bm",
        from: "s1",
        to: "s1",
        type: "buggy",
        actor: "Student",
        sai: { selection: "b", action: "Update", input: "-1" },
      },
      {
        id: "c3",
        from: "s2",
        to: "s3",
        type: "correct",
        actor: "Student",
        sai: { selection: "c", action: "Update", input: "3" },
        hints: [],
      },
      {
        id: "done",
        from: "s3",
        to: "goal",
        type: "correct",
        actor: "Student",
        sai: { selection: "done", action: "ButtonPressed", input: "-1" },
        hints: [],
      },
    ],
  };
}

describe("LCS e métrica direta do agente 3a", () => {
  it("calcula a LCS preservando ordem e repetições", () => {
    expect(longestCommonSubsequenceLength(["a", "b", "a"], ["a", "a", "b"])).toBe(2);
  });

  it("usa equivalência canônica e não contabiliza o sentinela do botão done", () => {
    const output = {
      advancedTrace: {
        solutions: [
          {
            finalAnswer: "3",
            solutionTrace: [
              { step: 1, result: "1" },
              { step: 2, result: "3" },
              { step: 3, result: "0.5" },
            ],
          },
        ],
      },
    };
    const got = evaluateAgent3a(referenceV2(), output, { correctAnswer: "3" });
    // Referência canônica = [1, 1/2, 3], gerado = [1, 3, 1/2]; LCS = 2.
    expect(got.lcsLength).toBe(2);
    expect(got.orderedRecall).toBe(0.667);
    expect(got.orderedPrecision).toBe(0.667);
    expect(got.counts.referenceSteps).toBe(3);
    expect(got.finalAnswerCorrect).toBe(true);
  });

  it("saída vazia conta como recall zero, sem passar pelo GraphForge", () => {
    const got = evaluateAgent3a(referenceV2(), { advancedTrace: { solutions: [] } });
    expect(got.orderedRecall).toBe(0);
    expect(got.orderedPrecision).toBe(0);
    expect(got.counts.generatedSteps).toBe(0);
  });
});

describe("métricas diretas do agente 3b", () => {
  it("separa cobertura por valor de cobertura no estado correto", () => {
    const output = {
      atRiskTrace: {
        solutions: [
          {
            attempts: [
              {
                solutionTrace: [
                  {
                    step: 1,
                    isCorrect: false,
                    error: { misconceptionId: "m1", wrongAnswer: "9" },
                  },
                ],
              },
              {
                // O valor 8 existe na referência, mas pertence ao passo/estado 2.
                solutionTrace: [
                  {
                    step: 1,
                    isCorrect: false,
                    error: { misconceptionId: "m2", wrongAnswer: "8" },
                  },
                ],
              },
              {
                // Duplicata de valor para testar yield único.
                solutionTrace: [
                  {
                    step: 1,
                    isCorrect: false,
                    error: { misconceptionId: "m3", wrongAnswer: "9" },
                  },
                ],
              },
            ],
          },
        ],
      },
    };
    const got = evaluateAgent3b(referenceV2(), output);
    expect(got.recallByValue).toBe(1);
    expect(got.recallByState).toBe(0.5);
    expect(got.counts.referenceValues).toBe(2); // -1 mecânico foi excluído
    expect(got.counts.duplicateValues).toBe(1);
    expect(got.counts.matchedStatePairs).toBe(1);
  });

  it("retorna null para estado quando o formato v1 não preserva localização", () => {
    const refV1 = {
      steps: [{ answer: "3", order: 1 }],
      misconceptions: [{ wrongAnswer: "4", stepKey: null }],
    };
    const got = evaluateAgent3b(refV1, { misconceptions: [{ step: 1, wrongAnswer: "4" }] });
    expect(got.recallByValue).toBe(1);
    expect(got.recallByState).toBeNull();
    expect(got.stateMetricEstimable).toBe(false);
  });
});

describe("métricas diretas do agente 3c", () => {
  it("mede quatro níveis, duplicação e vazamento da resposta separadamente", () => {
    const output = {
      averageTrace: {
        solutions: [
          {
            solutionTrace: [
              {
                step: 1,
                hesitation: true,
                hintsNeeded: [
                  { level: 1, type: "conceptual", message: "Qual conceito devemos usar?" },
                  { level: 2, type: "procedural", message: "Separe numerador e denominador." },
                  { level: 3, type: "specific", message: "Localize o ponto na reta." },
                  { level: 4, type: "bottom_out", message: "Marque exatamente 3/4 na reta." },
                ],
              },
              {
                step: 2,
                hesitation: true,
                hintsNeeded: [
                  { level: 1, message: "Observe as partes." },
                  { level: 2, message: "Conte as partes iguais." },
                  { level: 2, message: "Conte as partes iguais." },
                  { level: 3, message: "Compare com a unidade." },
                ],
              },
            ],
          },
        ],
      },
    };
    const got = evaluateAgent3c(referenceV2(), output, { correctAnswer: "3/4" });
    expect(got.fourLevelCompleteness).toBe(0.5);
    expect(got.validFourLevelCompleteness).toBe(0);
    expect(got.counts.leakingHints).toBe(1);
    expect(got.counts.duplicateLevels).toBe(1);
    expect(got.counts.duplicateTexts).toBe(1);
  });

  it("dicas achatadas sem level não recebem crédito artificial de quatro níveis", () => {
    const got = evaluateAgent3c(referenceV2(), {
      hints: [
        { step: 1, text: "Primeira dica" },
        { step: 1, text: "Segunda dica" },
        { step: 1, text: "Terceira dica" },
        { step: 1, text: "Quarta dica" },
      ],
    });
    expect(got.fourLevelCompleteness).toBe(0);
    expect(got.counts.hintsWithoutLevel).toBe(4);
  });

  it("detecta equivalência numérica sem confundir o algarismo dentro de outra fração", () => {
    expect(hintLeaksAnswer("O ponto correto é 0,5.", ["1/2"])).toBe(true);
    expect(hintLeaksAnswer("Considere primeiro 1/20.", ["1/2"])).toBe(false);
  });

  it("detecta resposta textual completa sem casar mero fragmento de palavra", () => {
    expect(hintLeaksAnswer("A resposta seria quarenta e dois.", ["quarenta e dois"])).toBe(true);
    expect(hintLeaksAnswer("Use uma estratégia de quarentena.", ["quarenta"])).toBe(false);
  });

  it("agente não invocado recebe completude zero quando há passos elegíveis", () => {
    const got = evaluateAgent3c(referenceV2(), null, { invoked: false });
    expect(got.invoked).toBe(false);
    expect(got.fourLevelCompleteness).toBe(0);
    expect(got.counts.eligibleSteps).toBe(2);
  });
});
