import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditProblemIdCoverage,
  classifyCampaign4Value,
  evaluateCampaign4Agent3a,
  evaluateCampaign4Agent3b,
  evaluateCampaign4Agent3c,
  evaluateCampaign4Transport,
} from "../production-fidelity/campaign4-metrics-v2.mjs";
import {
  C4_CTAT_ACTION_POLICY_VERSION,
  parseCtatReferenceV2,
} from "../production-fidelity/ctat-reference-v2.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CASES = path.join(HERE, "../cases/ctat-6.17");
const readReference = (problemId) =>
  parseCtatReferenceV2(
    fs.readFileSync(path.join(CASES, problemId, "expert.brd"), "utf8"),
    { problemId }
  );

const state = {
  knowledgeComponents: [{ id: "kc1" }],
  seedProblems: [
    { id: "01watermelon", expectedAnswer: "1/4" },
    { id: "02watermelon", expectedAnswer: "3/4" },
  ],
};
const references = {
  "01watermelon": readReference("01watermelon"),
  "02watermelon": readReference("02watermelon"),
};

describe("classificador concreto × generico × nao pontuavel", () => {
  it("nao instancia placeholders depois de ver a referencia", () => {
    expect(classifyCampaign4Value("{A} + 1")).toMatchObject({ class: "generic", key: null });
    expect(classifyCampaign4Value("1/4")).toMatchObject({ class: "concrete", key: "1/4" });
    expect(classifyCampaign4Value(0.25)).toMatchObject({ class: "concrete", key: "1/4" });
    expect(classifyCampaign4Value("")).toMatchObject({ class: "unscorable", reason: "empty" });
    expect(classifyCampaign4Value({ answer: "1/4" })).toMatchObject({
      class: "unscorable",
      reason: "non_scalar",
    });
  });
});

describe("cobertura por problemId", () => {
  it("separa ID exato, proxy ordinal, ambiguidade e ID desconhecido", () => {
    const got = auditProblemIdCoverage(
      ["pA", "pB", "pC", "pD"],
      [
        { problemId: "pA" },
        { problemId: 2 },
        { problemId: 3 },
        { problemId: "3" },
        { problemId: "desconhecido" },
        { problemId: "pD" },
        { problemId: 4 },
      ]
    );
    expect(got.exactUniqueProblemIds).toBe(2);
    expect(got.ordinalProxyOnlyProblemIds).toBe(1);
    expect(got.scorableProblemIds).toBe(3);
    expect(got.exactCoverage).toBe(0.5);
    expect(got.scorableCoverageIncludingOrdinalProxy).toBe(0.75);
    expect(got.missingOrAmbiguousProblemIds).toEqual(["pC"]);
    expect(got.ambiguous[0]).toMatchObject({ problemId: "pC" });
    expect(got.unresolved[0]).toMatchObject({ rawProblemId: "desconhecido" });
  });
});

describe("metricas C4 por problema, antes do GraphForge", () => {
  it("3a pontua sequencia concreta exata e isola resultados genericos", () => {
    const output = {
      advancedTrace: {
        studentProfile: "advanced",
        solutions: [
          {
            problemId: "01watermelon",
            solutionTrace: [
              { step: 1, action: "F1", thinking: "", result: "1", kcUsed: "kc1", timeEstimate: 1, isCorrect: true },
              { step: 2, action: "F2", thinking: "", result: "4", kcUsed: "kc1", timeEstimate: 1, isCorrect: true },
              { step: 3, action: "denom", thinking: "", result: "4", kcUsed: "kc1", timeEstimate: 1, isCorrect: true },
              { step: 4, action: "point", thinking: "", result: "0.25", kcUsed: "kc1", timeEstimate: 1, isCorrect: true },
            ],
            finalAnswer: "1/4",
            totalTime: 4,
          },
          {
            problemId: 2,
            solutionTrace: [
              { step: 1, action: "a", thinking: "", result: "{A}", kcUsed: "kc1", timeEstimate: 1, isCorrect: true },
              { step: 2, action: "b", thinking: "", result: "{B}", kcUsed: "kc1", timeEstimate: 1, isCorrect: true },
              { step: 3, action: "c", thinking: "", result: "{B}", kcUsed: "kc1", timeEstimate: 1, isCorrect: true },
              { step: 4, action: "d", thinking: "", result: "{C}", kcUsed: "kc1", timeEstimate: 1, isCorrect: true },
            ],
            finalAnswer: "{C}",
            totalTime: 4,
          },
        ],
      },
    };
    const got = evaluateCampaign4Agent3a({ state, referencesByProblemId: references, agentOutput: output });
    expect(got.byProblem[0].exactConcreteOrderedRecallItt).toBe(1);
    expect(got.byProblem[0].finalAnswer.exactConcreteMatch).toBe(true);
    expect(got.byProblem[1].problemIdResolution).toBe("ordinal_proxy");
    expect(got.byProblem[1].exactConcreteOrderedRecallItt).toBe(0);
    expect(got.byProblem[1].genericResultSteps).toBe(4);
    expect(got.aggregate.macroExactConcreteOrderedRecallItt).toBe(0.5);
  });

  it("3b mantem estado/SAI como nao estimavel e nomeia passo apenas como proxy ordinal", () => {
    const output = {
      atRiskTrace: {
        studentProfile: "at_risk",
        solutions: [
          {
            problemId: "01watermelon",
            attempts: [
              {
                attemptNumber: 1,
                finalAnswer: "4",
                wasCorrect: false,
                solutionTrace: [
                  {
                    step: 1,
                    action: "errar",
                    thinking: "",
                    result: "4",
                    kcUsed: "kc1",
                    isCorrect: false,
                    error: {
                      misconceptionId: "m1",
                      type: "conceptual_error",
                      wrongAnswer: "4",
                      description: "d",
                      mistakeLocation: "l",
                      diagnosticQuestion: "q",
                      severity: "moderate",
                      feedback: "f",
                      howToFix: "h",
                    },
                  },
                  {
                    step: 2,
                    action: "errar",
                    thinking: "",
                    result: "1",
                    kcUsed: "kc1",
                    isCorrect: false,
                    error: {
                      misconceptionId: "m2",
                      type: "procedural_error",
                      wrongAnswer: "1",
                      description: "d",
                      mistakeLocation: "l",
                      diagnosticQuestion: "q",
                      severity: "moderate",
                      feedback: "f",
                      howToFix: "h",
                    },
                  },
                  {
                    step: 3,
                    action: "errar",
                    thinking: "",
                    result: "{A}+1",
                    kcUsed: "kc1",
                    isCorrect: false,
                    error: {
                      misconceptionId: "m3",
                      type: "procedural_error",
                      wrongAnswer: "{A}+1",
                      description: "d",
                      mistakeLocation: "l",
                      diagnosticQuestion: "q",
                      severity: "moderate",
                      feedback: "f",
                      howToFix: "h",
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    };
    const got = evaluateCampaign4Agent3b({ state, referencesByProblemId: references, agentOutput: output });
    const first = got.byProblem[0];
    expect(first.referenceFilterPolicy).toBe(C4_CTAT_ACTION_POLICY_VERSION);
    expect(first.referenceDenominators).toMatchObject({
      allBuggyStudentActions: 8,
      mechanicalBuggyExcluded: 4,
      comparableBuggyActions: 4,
      comparableUniqueValues: 3,
    });
    expect(first.exactConcreteRecallByUniqueValueItt).toBe(0.667);
    expect(first.ordinalProxy.exactConcreteRecall).toBe(0.5);
    expect(first.genericErrors).toBe(1);
    expect(first.ctatStateSaiRecall).toBeNull();
    expect(first.ctatStateSaiEstimable).toBe(false);
    expect(got.aggregate.ctatStateSaiRecall).toBeNull();
  });

  it("3c calcula quatro niveis por problemId, sem fundir steps homonimos do lote", () => {
    const fourHints = (bottomMessage) => [
      { level: 1, type: "conceptual", message: "Qual conceito ajuda aqui?" },
      { level: 2, type: "procedural", message: "Separe os dados e siga o processo." },
      { level: 3, type: "specific", message: "Observe a posicao na reta." },
      { level: 4, type: "bottom_out", message: bottomMessage },
    ];
    const output = {
      averageTrace: {
        studentProfile: "average",
        solutions: [
          {
            problemId: "01watermelon",
            finalAnswer: "1/4",
            totalTime: 1,
            alternativeRoutes: [],
            solutionTrace: [
              { step: 1, action: "a", thinking: "", result: "r", kcUsed: "kc1", isCorrect: true, hesitation: true, hintsNeeded: fourHints("Conte as partes e marque o ponto.") },
            ],
          },
          {
            problemId: "02watermelon",
            finalAnswer: "3/4",
            totalTime: 1,
            alternativeRoutes: [],
            solutionTrace: [
              { step: 1, action: "a", thinking: "", result: "r", kcUsed: "kc1", isCorrect: true, hesitation: true, hintsNeeded: fourHints("Marque exatamente 3/4.") },
            ],
          },
        ],
      },
    };
    const got = evaluateCampaign4Agent3c({ state, referencesByProblemId: references, agentOutput: output, invoked: true });
    expect(got.byProblem[0].strictFourLevelValidityConditional).toBe(1);
    expect(got.byProblem[0].counts.duplicateLevels).toBe(0);
    expect(got.byProblem[1].strictFourLevelValidityConditional).toBe(0);
    expect(got.byProblem[1].counts.finalAnswerLeakingHints).toBe(1);
    expect(got.aggregate.macroStrictProblemSuccessItt).toBe(0.5);
  });
});

describe("transporte raw -> config -> GraphForge", () => {
  it("quantifica concatenacao/truncamento e perdas de problemId, diagnostico, nivel e resultado", () => {
    const rawAgentOutputs = {
      agent3a: {
        advancedTrace: {
          solutions: [
            { problemId: "p1", solutionTrace: [
              { step: 1, action: "a1", result: "r1", kcUsed: "kc1", isCorrect: true },
              { step: 2, action: "a2", result: "r2", kcUsed: "kc1", isCorrect: true },
            ] },
            { problemId: "p2", solutionTrace: [
              { step: 1, action: "b1", result: "s1", kcUsed: "kc1", isCorrect: true },
              { step: 2, action: "b2", result: "s2", kcUsed: "kc1", isCorrect: true },
            ] },
          ],
        },
      },
      agent3b: {
        atRiskTrace: {
          solutions: ["p1", "p2"].map((problemId) => ({
            problemId,
            attempts: [{ solutionTrace: [{
              step: 1,
              isCorrect: false,
              result: "9",
              error: {
                misconceptionId: "same-id",
                type: "conceptual_error",
                wrongAnswer: "9",
                description: "d",
                feedback: "f",
                howToFix: "fix",
                diagnosticQuestion: "q",
                mistakeLocation: "l",
                severity: "moderate",
              },
            }] }],
          })),
        },
      },
      agent3c: {
        averageTrace: {
          solutions: ["p1", "p2"].map((problemId, solutionIndex) => ({
            problemId,
            solutionTrace: [{
              step: 1,
              hesitation: true,
              hintsNeeded: [
                { level: 1, type: "conceptual", message: `h${solutionIndex}a` },
                { level: 2, type: "procedural", message: `h${solutionIndex}b` },
              ],
            }],
          })),
        },
      },
    };
    const graphForgeConfig = {
      steps: [
        { index: 1, kc: "kc1", action: "a1", result: "r1" },
        { index: 2, kc: "kc1", action: "a2", result: "r2" },
        { index: 1, kc: "kc1", action: "b1", result: "s1" },
      ],
      misconceptions: [[{
        id: "same-id",
        type: "conceptual_error",
        wrongAnswer: "9",
        description: "d",
        feedback: "fix",
        severity: "moderate",
      }], [], []],
      hints: [["h0a", "h0b", "h1a", "h1b"], [], []],
    };
    const graphForgeArtifacts = {
      graph: {
        nodes: [
          {
            id: "step_1",
            type: "step",
            description: "a1",
            knowledgeComponents: ["kc1"],
            hints: [],
            misconceptions: [{
              id: "same-id",
              wrongAnswer: "9",
              misconceptionType: "conceptual_error",
              description: "d",
              feedback: "fix",
              severity: "moderate",
              matcher: "exact",
            }],
          },
          { id: "step_2", type: "step", description: "a2", knowledgeComponents: ["kc1"], hints: [], misconceptions: [] },
          { id: "step_3", type: "step", description: "b1", knowledgeComponents: ["kc1"], hints: [], misconceptions: [] },
        ],
      },
      slotManifest: [
        { nodeId: "step_1", field: "hints", existingHints: ["h0a", "h0b", "h1a", "h1b"] },
        { nodeId: "step_2", field: "hints", existingHints: [] },
        { nodeId: "step_3", field: "hints", existingHints: [] },
      ],
    };
    const got = evaluateCampaign4Transport({
      state: { knowledgeComponents: [{ id: "kc1" }] },
      rawAgentOutputs,
      graphForgeConfig,
      graphForgeArtifacts,
    });

    expect(got.agent3a).toMatchObject({ rawItems: 4, configItems: 3, truncationCount: 1 });
    expect(got.agent3a.problemIdentity).toMatchObject({ configCarriesProblemId: false, graphCarriesProblemId: false });
    expect(got.agent3a.configToGraphFields.result.rate).toBe(0);

    expect(got.agent3b).toMatchObject({ rawErrorItems: 2, configMisconceptionItems: 1 });
    expect(got.agent3b.exactItemsPreservedRawToConfig).toBe(1);
    expect(got.agent3b.rawToConfigFields.diagnosticQuestion.rate).toBe(0);
    expect(got.agent3b.rawToConfigFields.mistakeLocation.rate).toBe(0);
    expect(got.agent3b.exactItemPreservationRateConfigToGraph).toBe(1);

    expect(got.agent3c).toMatchObject({ rawHintItems: 4, configHintItems: 4, slotManifestExistingHints: 4 });
    expect(got.agent3c.rawToConfigFields.text.rate).toBe(1);
    expect(got.agent3c.rawToConfigFields.level.rate).toBe(0);
    expect(got.agent3c.rawToConfigFields.type.rate).toBe(0);
    expect(got.agent3c.exactHintPreservationRateConfigToSlotManifest).toBe(1);
    expect(got.agent3c.genericGraphNodeHints).toBe(0);
  });
});
