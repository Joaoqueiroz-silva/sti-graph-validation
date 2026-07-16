/**
 * Metricas deterministicas da Campanha 4.
 *
 * Este modulo nao le arquivos, nao chama rede/LLM e nao executa o GraphForge. Ele
 * recebe artefatos ja congelados e mantem separados cinco estimandos:
 *  1. cobertura/contrato por problemId;
 *  2. coincidencia concreta exata versus conteudo generico ou nao pontuavel;
 *  3. qualidade operacional das cadeias de dicas do 3c, por problema;
 *  4. proxy ordinal do 3b (nunca chamado de concordancia de estado CTAT);
 *  5. transporte observavel raw -> config -> artefatos GraphForge.
 */

import { canon, canonAnswer } from "../schema.js";
import { hintLeaksAnswer, longestCommonSubsequenceLength } from "../metrics-agent3.mjs";
import {
  C4_CTAT_ACTION_POLICY_VERSION,
  C4_CTAT_REFERENCE_VERSION,
  assertCtatReferenceV2,
} from "./ctat-reference-v2.mjs";

export const C4_METRICS_VERSION = "educaoff-campaign4-metrics-v2";
export const C4_VALUE_CLASSIFIER_VERSION = "c4-value-concrete-generic-unscorable-v1";

const asArray = (value) => (Array.isArray(value) ? value : []);
const asText = (value) => String(value ?? "").trim();
const round = (value) => (Number.isFinite(value) ? Math.round(value * 1000) / 1000 : value);
const ratio = (numerator, denominator) => (denominator > 0 ? round(numerator / denominator) : null);
const mean = (values) => {
  const finite = values.filter(Number.isFinite);
  return finite.length ? round(finite.reduce((sum, value) => sum + value, 0) / finite.length) : null;
};

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function hasValue(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key) && object[key] !== undefined && object[key] !== null;
}

/**
 * O prompt congelado define placeholders entre chaves (`{A}`, `{B}`, `{C}`).
 * Somente essa sintaxe e classificada como generica; nao tentamos adivinhar que
 * uma letra solta seria variavel. Objetos/arrays e valores vazios sao
 * nao-pontuaveis. Strings/numeros sem placeholder sao concretos e comparados pela
 * chave canonica do valor INTEIRO, nunca por extracao oportunista de numeros de
 * uma frase.
 */
export function classifyCampaign4Value(value) {
  if (value === undefined || value === null) {
    return {
      classifierVersion: C4_VALUE_CLASSIFIER_VERSION,
      class: "unscorable",
      reason: "absent",
      raw: value ?? null,
      key: null,
      placeholders: [],
    };
  }
  if (!["string", "number", "bigint"].includes(typeof value)) {
    return {
      classifierVersion: C4_VALUE_CLASSIFIER_VERSION,
      class: "unscorable",
      reason: "non_scalar",
      raw: value,
      key: null,
      placeholders: [],
    };
  }
  const raw = asText(value);
  if (raw === "") {
    return {
      classifierVersion: C4_VALUE_CLASSIFIER_VERSION,
      class: "unscorable",
      reason: "empty",
      raw,
      key: null,
      placeholders: [],
    };
  }
  const placeholders = [...raw.matchAll(/\{[A-Za-z][A-Za-z0-9_]*\}/g)].map((match) => match[0]);
  if (placeholders.length) {
    return {
      classifierVersion: C4_VALUE_CLASSIFIER_VERSION,
      class: "generic",
      reason: "braced_placeholder",
      raw,
      key: null,
      placeholders: [...new Set(placeholders)],
    };
  }
  return {
    classifierVersion: C4_VALUE_CLASSIFIER_VERSION,
    class: "concrete",
    reason: null,
    raw,
    key: canonAnswer(raw),
    placeholders: [],
  };
}

function integerOrdinal(value) {
  if (Number.isInteger(value) && value >= 1) return value;
  if (typeof value === "string" && /^[1-9]\d*$/.test(value.trim())) return Number(value.trim());
  return null;
}

function buildProblemIndex(expectedProblemIds, solutions) {
  const expected = expectedProblemIds.map(String);
  const expectedSet = new Set(expected);
  const groups = new Map(expected.map((id) => [id, []]));
  const unresolved = [];

  asArray(solutions).forEach((solution, rawIndex) => {
    const rawId = solution?.problemId;
    const rawKey = rawId == null ? null : String(rawId);
    let targetProblemId = null;
    let resolution = null;
    if (rawKey != null && expectedSet.has(rawKey)) {
      targetProblemId = rawKey;
      resolution = "exact_problem_id";
    } else {
      const ordinal = integerOrdinal(rawId);
      if (ordinal != null && ordinal <= expected.length) {
        targetProblemId = expected[ordinal - 1];
        resolution = "ordinal_proxy";
      }
    }
    const row = { rawIndex, rawProblemId: rawId ?? null, targetProblemId, resolution, solution };
    if (targetProblemId == null) unresolved.push({ ...row, solution: undefined });
    else groups.get(targetProblemId).push(row);
  });

  const selected = new Map();
  const ambiguous = [];
  const mappings = [];
  for (const problemId of expected) {
    const rows = groups.get(problemId) || [];
    const exact = rows.filter((row) => row.resolution === "exact_problem_id");
    const ordinal = rows.filter((row) => row.resolution === "ordinal_proxy");
    let chosen = null;
    if (exact.length === 1) chosen = exact[0];
    else if (exact.length === 0 && ordinal.length === 1) chosen = ordinal[0];
    if (chosen) selected.set(problemId, chosen);
    if (exact.length > 1 || (exact.length === 0 && ordinal.length > 1)) {
      ambiguous.push({
        problemId,
        exactRawIndexes: exact.map((row) => row.rawIndex),
        ordinalProxyRawIndexes: ordinal.map((row) => row.rawIndex),
      });
    }
    mappings.push({
      problemId,
      selectedRawIndex: chosen?.rawIndex ?? null,
      selectedResolution: chosen?.resolution ?? null,
      exactRawIndexes: exact.map((row) => row.rawIndex),
      ordinalProxyRawIndexes: ordinal.map((row) => row.rawIndex),
      ignoredRawIndexes: rows.filter((row) => row !== chosen).map((row) => row.rawIndex),
    });
  }

  return {
    expected,
    selected,
    public: {
      expectedProblemIds: expected,
      emittedSolutions: asArray(solutions).length,
      exactUniqueProblemIds: [...selected.values()].filter(
        (row) => row.resolution === "exact_problem_id"
      ).length,
      ordinalProxyOnlyProblemIds: [...selected.values()].filter(
        (row) => row.resolution === "ordinal_proxy"
      ).length,
      scorableProblemIds: selected.size,
      exactCoverage: ratio(
        [...selected.values()].filter((row) => row.resolution === "exact_problem_id").length,
        expected.length
      ),
      scorableCoverageIncludingOrdinalProxy: ratio(selected.size, expected.length),
      missingOrAmbiguousProblemIds: expected.filter((id) => !selected.has(id)),
      ambiguous,
      unresolved: unresolved.map(({ solution: _solution, ...row }) => row),
      mappings,
      note:
        "ordinal_proxy usa problemId inteiro 1..N como posicao no vetor seedProblems; nao e identidade exata e e reportado separadamente",
    },
  };
}

export function auditProblemIdCoverage(expectedProblemIds, solutions) {
  return buildProblemIndex(expectedProblemIds, solutions).public;
}

const SCHEMA_FIELDS = Object.freeze({
  agent3a: {
    root: ["studentProfile", "solutions"],
    solution: ["problemId", "solutionTrace", "finalAnswer", "totalTime"],
    traceStep: ["step", "action", "thinking", "result", "kcUsed", "timeEstimate", "isCorrect"],
  },
  agent3b: {
    root: ["studentProfile", "solutions"],
    solution: ["problemId", "attempts"],
    attempt: ["attemptNumber", "solutionTrace", "finalAnswer", "wasCorrect"],
    traceStep: ["step", "action", "thinking", "result", "kcUsed", "isCorrect", "error"],
    error: [
      "misconceptionId",
      "type",
      "wrongAnswer",
      "description",
      "mistakeLocation",
      "diagnosticQuestion",
      "severity",
      "feedback",
      "howToFix",
    ],
  },
  agent3c: {
    root: ["studentProfile", "solutions"],
    solution: ["problemId", "solutionTrace", "finalAnswer", "totalTime", "alternativeRoutes"],
    traceStep: [
      "step",
      "action",
      "thinking",
      "result",
      "kcUsed",
      "isCorrect",
      "hesitation",
      "hintsNeeded",
    ],
    hint: ["level", "type", "message"],
  },
});

function fieldAudit(label, objects, fields) {
  const rows = asArray(objects);
  const byField = Object.fromEntries(
    fields.map((field) => {
      const present = rows.filter((object) => hasValue(object, field)).length;
      return [field, { present, expected: rows.length, rate: ratio(present, rows.length) }];
    })
  );
  const expected = rows.length * fields.length;
  const present = Object.values(byField).reduce((sum, item) => sum + item.present, 0);
  return { label, objects: rows.length, requiredFields: expected, presentFields: present, completeness: ratio(present, expected), byField };
}

function schemaAudit(agentKey, root) {
  const definition = SCHEMA_FIELDS[agentKey];
  const solutions = asArray(root?.solutions);
  const groups = [fieldAudit("root", root && typeof root === "object" ? [root] : [], definition.root)];
  groups.push(fieldAudit("solution", solutions, definition.solution));

  if (agentKey === "agent3a") {
    groups.push(fieldAudit("traceStep", solutions.flatMap((solution) => asArray(solution?.solutionTrace)), definition.traceStep));
  } else if (agentKey === "agent3b") {
    const attempts = solutions.flatMap((solution) => asArray(solution?.attempts));
    const traceSteps = attempts.flatMap((attempt) => asArray(attempt?.solutionTrace));
    const errors = traceSteps.filter((step) => step?.error && step?.isCorrect === false).map((step) => step.error);
    groups.push(fieldAudit("attempt", attempts, definition.attempt));
    groups.push(fieldAudit("traceStep", traceSteps, definition.traceStep));
    groups.push(fieldAudit("error", errors, definition.error));
  } else {
    const traceSteps = solutions.flatMap((solution) => asArray(solution?.solutionTrace));
    const hints = traceSteps.flatMap((step) => asArray(step?.hintsNeeded)).filter((hint) => typeof hint === "object" && hint != null);
    groups.push(fieldAudit("traceStep", traceSteps, definition.traceStep));
    groups.push(fieldAudit("hint", hints, definition.hint));
  }

  const requiredFields = groups.reduce((sum, group) => sum + group.requiredFields, 0);
  const presentFields = groups.reduce((sum, group) => sum + group.presentFields, 0);
  return {
    contract: definition,
    groups,
    requiredFields,
    presentFields,
    completeness: ratio(presentFields, requiredFields),
    shape: {
      rootObject: !!root && typeof root === "object" && !Array.isArray(root),
      solutionsArray: Array.isArray(root?.solutions),
    },
  };
}

function agentRoot(agentKey, output) {
  if (agentKey === "agent3a") return output?.advancedTrace ?? output ?? null;
  if (agentKey === "agent3b") return output?.atRiskTrace ?? output ?? null;
  return output?.averageTrace ?? output ?? null;
}

function expectedIds(state) {
  return asArray(state?.seedProblems).map((seed) => String(seed?.id));
}

function referenceFor(referencesByProblemId, problemId) {
  const reference = referencesByProblemId instanceof Map
    ? referencesByProblemId.get(problemId)
    : referencesByProblemId?.[problemId];
  return assertCtatReferenceV2(reference);
}

function valueCounts(values) {
  const classified = values.map(classifyCampaign4Value);
  return {
    classified,
    counts: {
      total: classified.length,
      concrete: classified.filter((item) => item.class === "concrete").length,
      generic: classified.filter((item) => item.class === "generic").length,
      unscorable: classified.filter((item) => item.class === "unscorable").length,
    },
  };
}

export function evaluateCampaign4Agent3a({ state, referencesByProblemId, agentOutput } = {}) {
  const ids = expectedIds(state);
  const root = agentRoot("agent3a", agentOutput);
  const index = buildProblemIndex(ids, root?.solutions);
  const byProblem = ids.map((problemId, problemIndex) => {
    const seed = state.seedProblems[problemIndex];
    const reference = referenceFor(referencesByProblemId, problemId);
    const selected = index.selected.get(problemId);
    const solution = selected?.solution ?? null;
    const generatedSteps = asArray(solution?.solutionTrace).filter((step) => step?.isCorrect !== false);
    const values = valueCounts(generatedSteps.map((step) => step?.result));
    const concreteKeys = values.classified
      .filter((item) => item.class === "concrete" && item.key !== "")
      .map((item) => item.key);
    const referenceKeys = reference.correctPath.comparable.map((item) => item.inputKey);
    const lcsLength = longestCommonSubsequenceLength(referenceKeys, concreteKeys);
    const finalAnswer = classifyCampaign4Value(solution?.finalAnswer);
    const expectedAnswerKey = canonAnswer(seed?.expectedAnswer);
    return {
      problemId,
      problemIdResolution: selected?.resolution ?? null,
      emitted: solution != null,
      referenceFilterPolicy: reference.filterPolicy.version,
      referenceCorrectActions: referenceKeys.length,
      generatedCorrectTraceSteps: generatedSteps.length,
      concreteResultSteps: values.counts.concrete,
      genericResultSteps: values.counts.generic,
      unscorableResultSteps: values.counts.unscorable,
      genericRate: ratio(values.counts.generic, values.counts.total),
      unscorableRate: ratio(values.counts.unscorable, values.counts.total),
      exactConcreteLcsLength: lcsLength,
      exactConcreteOrderedRecallItt: ratio(lcsLength, referenceKeys.length),
      exactConcreteOrderedPrecision: ratio(lcsLength, concreteKeys.length),
      exactConcreteOrderedMatch:
        referenceKeys.length === concreteKeys.length && referenceKeys.every((key, i) => key === concreteKeys[i]),
      finalAnswer: {
        classification: finalAnswer,
        expectedAnswerKey,
        exactConcreteMatch:
          finalAnswer.class === "concrete" && finalAnswer.key !== "" && finalAnswer.key === expectedAnswerKey,
      },
      comparability:
        "value-only: o trace do 3a nao emite Selection/Action nem state ID CTAT",
      detail: {
        reference: reference.correctPath.comparable,
        generated: generatedSteps.map((step, indexWithinSolution) => ({
          indexWithinSolution,
          step: step?.step ?? null,
          action: asText(step?.action),
          kcUsed: asText(step?.kcUsed),
          result: values.classified[indexWithinSolution],
        })),
        referenceKeys,
        concreteGeneratedKeys: concreteKeys,
      },
    };
  });

  return {
    schemaVersion: C4_METRICS_VERSION,
    agent: "3a",
    problemIdCoverage: index.public,
    schemaAudit: schemaAudit("agent3a", root),
    aggregate: {
      unit: "exercise",
      exercises: byProblem.length,
      macroExactConcreteOrderedRecallItt: mean(byProblem.map((row) => row.exactConcreteOrderedRecallItt)),
      macroExactConcreteOrderedPrecision: mean(byProblem.map((row) => row.exactConcreteOrderedPrecision)),
      totalConcreteResults: byProblem.reduce((sum, row) => sum + row.concreteResultSteps, 0),
      totalGenericResults: byProblem.reduce((sum, row) => sum + row.genericResultSteps, 0),
      totalUnscorableResults: byProblem.reduce((sum, row) => sum + row.unscorableResultSteps, 0),
    },
    byProblem,
  };
}

function generated3bItems(solution) {
  const rows = [];
  asArray(solution?.attempts).forEach((attempt, attemptIndex) => {
    asArray(attempt?.solutionTrace).forEach((step, traceIndex) => {
      if (step?.isCorrect === false && step?.error) {
        rows.push({
          attemptIndex,
          traceIndex,
          step: step?.step ?? null,
          error: step.error,
          value: classifyCampaign4Value(step.error.wrongAnswer),
        });
      }
    });
  });
  return rows;
}

function pairKey(left, right) {
  return left == null || right == null || right === "" ? null : `${left}\u0000${right}`;
}

export function evaluateCampaign4Agent3b({ state, referencesByProblemId, agentOutput } = {}) {
  const ids = expectedIds(state);
  const root = agentRoot("agent3b", agentOutput);
  const index = buildProblemIndex(ids, root?.solutions);
  const byProblem = ids.map((problemId, problemIndex) => {
    const seed = state.seedProblems[problemIndex];
    const reference = referenceFor(referencesByProblemId, problemId);
    const selected = index.selected.get(problemId);
    const generated = generated3bItems(selected?.solution);
    const concrete = generated.filter((item) => item.value.class === "concrete" && item.value.key !== "");
    const generic = generated.filter((item) => item.value.class === "generic");
    const unscorable = generated.filter((item) => item.value.class === "unscorable");
    const referenceItems = reference.buggyActions.comparable;
    const referenceValueKeys = new Set(referenceItems.map((item) => item.inputKey).filter(Boolean));
    const generatedValueKeys = new Set(concrete.map((item) => item.value.key));
    const matchedValues = [...referenceValueKeys].filter((key) => generatedValueKeys.has(key));

    const referenceOrdinalPairs = new Set(
      referenceItems
        .map((item) => pairKey(item.sourceContentOrdinal, item.inputKey))
        .filter(Boolean)
    );
    const generatedOrdinalPairs = new Set(
      concrete
        .map((item) => {
          const ordinal = Number(item.step);
          return Number.isInteger(ordinal) && ordinal >= 1 ? pairKey(ordinal, item.value.key) : null;
        })
        .filter(Boolean)
    );
    const matchedOrdinalPairs = [...referenceOrdinalPairs].filter((key) => generatedOrdinalPairs.has(key));
    const expectedAnswerKey = canonAnswer(seed?.expectedAnswer);

    return {
      problemId,
      problemIdResolution: selected?.resolution ?? null,
      emitted: selected?.solution != null,
      referenceFilterPolicy: reference.filterPolicy.version,
      referenceDenominators: {
        allBuggyStudentActions: reference.buggyActions.all.filter(
          (item) => item.classification.actorClass === "student"
        ).length,
        mechanicalBuggyExcluded: reference.buggyActions.mechanical.length,
        comparableBuggyActions: referenceItems.length,
        comparableUniqueValues: referenceValueKeys.size,
      },
      generatedErrors: generated.length,
      concreteErrors: concrete.length,
      genericErrors: generic.length,
      unscorableErrors: unscorable.length,
      genericRate: ratio(generic.length, generated.length),
      unscorableRate: ratio(unscorable.length, generated.length),
      exactConcreteRecallByUniqueValueItt: ratio(matchedValues.length, referenceValueKeys.size),
      generatedWrongAnswersEqualCorrectAnswer: concrete.filter(
        (item) => item.value.key === expectedAnswerKey
      ).length,
      ctatStateSaiRecall: null,
      ctatStateSaiEstimable: false,
      ctatStateSaiReason:
        "O contrato do 3b emite numero de passo interno, mas nao state ID + Selection + Action CTAT; concordancia direta de estado/SAI nao e identificavel.",
      ordinalProxy: {
        label: "analise de sensibilidade; nao e concordancia de estado CTAT",
        estimable: referenceOrdinalPairs.size > 0,
        exactConcreteRecall: ratio(matchedOrdinalPairs.length, referenceOrdinalPairs.size),
        referencePairs: referenceOrdinalPairs.size,
        generatedPairs: generatedOrdinalPairs.size,
        matchedPairs: matchedOrdinalPairs.length,
      },
      detail: {
        reference: referenceItems,
        generated,
        matchedValues,
        missingValues: [...referenceValueKeys].filter((key) => !generatedValueKeys.has(key)),
        additionalConcreteValues: [...generatedValueKeys].filter((key) => !referenceValueKeys.has(key)),
        matchedOrdinalPairs,
      },
    };
  });

  return {
    schemaVersion: C4_METRICS_VERSION,
    agent: "3b",
    problemIdCoverage: index.public,
    schemaAudit: schemaAudit("agent3b", root),
    aggregate: {
      unit: "exercise",
      exercises: byProblem.length,
      macroExactConcreteRecallByUniqueValueItt: mean(
        byProblem.map((row) => row.exactConcreteRecallByUniqueValueItt)
      ),
      macroOrdinalProxyRecall: mean(byProblem.map((row) => row.ordinalProxy.exactConcreteRecall)),
      ctatStateSaiRecall: null,
      ctatStateSaiEstimable: false,
      totalConcreteErrors: byProblem.reduce((sum, row) => sum + row.concreteErrors, 0),
      totalGenericErrors: byProblem.reduce((sum, row) => sum + row.genericErrors, 0),
      totalUnscorableErrors: byProblem.reduce((sum, row) => sum + row.unscorableErrors, 0),
    },
    byProblem,
  };
}

function hintLevel(hint) {
  const raw = hint?.level ?? hint?.hintLevel ?? hint?.nivel;
  const numeric = Number(raw);
  if (Number.isInteger(numeric)) return numeric;
  const match = asText(raw).match(/\b([1-4])\b/);
  return match ? Number(match[1]) : null;
}

function hintText(hint) {
  return asText(typeof hint === "string" ? hint : hint?.message ?? hint?.text ?? hint?.hint);
}

function normalizeHintText(value) {
  return asText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9/+-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const EXPECTED_HINT_TYPES = Object.freeze({
  1: "conceptual",
  2: "procedural",
  3: "specific",
  4: "bottom_out",
});

function canonicalHintType(value) {
  return asText(value).toLowerCase().replace(/[\s-]+/g, "_");
}

export function evaluateCampaign4Agent3c({ state, referencesByProblemId, agentOutput, invoked } = {}) {
  const ids = expectedIds(state);
  const root = agentRoot("agent3c", agentOutput);
  const index = buildProblemIndex(ids, root?.solutions);
  const byProblem = ids.map((problemId, problemIndex) => {
    const seed = state.seedProblems[problemIndex];
    const reference = referenceFor(referencesByProblemId, problemId);
    const selected = index.selected.get(problemId);
    const solution = selected?.solution ?? null;
    const forbiddenFinalAnswer = [seed?.expectedAnswer].filter((value) => value != null);
    const forbiddenReferenceInputs = reference.correctPath.comparable.map((item) => item.sai.input);
    const eligibleSteps = asArray(solution?.solutionTrace).filter(
      (step) => step?.hesitation === true || asArray(step?.hintsNeeded).length > 0
    );
    const rows = eligibleSteps.map((step, stepIndex) => {
      const hints = asArray(step?.hintsNeeded).map((hint, hintIndex) => {
        const level = hintLevel(hint);
        const type = canonicalHintType(typeof hint === "string" ? "" : hint?.type);
        const message = hintText(hint);
        return {
          hintIndex,
          level,
          type,
          message,
          messageKey: normalizeHintText(message),
          finalAnswerLeakage: hintLeaksAnswer(message, forbiddenFinalAnswer),
          anyReferenceInputLeakage: hintLeaksAnswer(message, forbiddenReferenceInputs),
          expectedType: EXPECTED_HINT_TYPES[level] ?? null,
          typeConforms: EXPECTED_HINT_TYPES[level] != null && type === EXPECTED_HINT_TYPES[level],
        };
      });
      const levels = hints.map((hint) => hint.level).filter(Number.isInteger);
      const levelSet = new Set(levels);
      const nonEmptyTexts = hints.map((hint) => hint.messageKey).filter(Boolean);
      const fourLevelsComplete = [1, 2, 3, 4].every((level) => levelSet.has(level));
      const duplicateLevels = levels.length - levelSet.size;
      const duplicateTexts = nonEmptyTexts.length - new Set(nonEmptyTexts).size;
      const finalAnswerLeakage = hints.some((hint) => hint.finalAnswerLeakage);
      const strictValid =
        hints.length === 4 &&
        fourLevelsComplete &&
        duplicateLevels === 0 &&
        nonEmptyTexts.length === 4 &&
        duplicateTexts === 0 &&
        hints.every((hint) => hint.typeConforms) &&
        !finalAnswerLeakage;
      return {
        stepIndex,
        emittedStep: step?.step ?? null,
        hintCount: hints.length,
        levels: [...levelSet].sort((left, right) => left - right),
        fourLevelsComplete,
        duplicateLevels,
        duplicateTexts,
        typesConform: hints.length > 0 && hints.every((hint) => hint.typeConforms),
        finalAnswerLeakage,
        anyReferenceInputLeakage: hints.some((hint) => hint.anyReferenceInputLeakage),
        strictValid,
        hints,
      };
    });
    const complete = rows.filter((row) => row.fourLevelsComplete).length;
    const strict = rows.filter((row) => row.strictValid).length;
    const allHints = rows.flatMap((row) => row.hints);
    return {
      problemId,
      problemIdResolution: selected?.resolution ?? null,
      emitted: solution != null,
      invoked: typeof invoked === "boolean" ? invoked : agentOutput != null,
      eligibilityDefinition:
        "passo emitido com hesitation=true ou hintsNeeded nao vazio; nao e alinhamento a estado/passo CTAT",
      eligibleGeneratedSteps: rows.length,
      fourLevelCompletenessConditional: ratio(complete, rows.length),
      strictFourLevelValidityConditional: ratio(strict, rows.length),
      strictProblemSuccessItt: rows.length > 0 && strict === rows.length ? 1 : 0,
      finalAnswerLeakageRate: ratio(
        allHints.filter((hint) => hint.finalAnswerLeakage).length,
        allHints.length
      ),
      anyReferenceInputLeakageRateSensitivity: ratio(
        allHints.filter((hint) => hint.anyReferenceInputLeakage).length,
        allHints.length
      ),
      counts: {
        hints: allHints.length,
        stepsFourLevelsComplete: complete,
        stepsStrictValid: strict,
        hintsWithoutLevel: allHints.filter((hint) => !Number.isInteger(hint.level)).length,
        hintsWrongType: allHints.filter((hint) => !hint.typeConforms).length,
        finalAnswerLeakingHints: allHints.filter((hint) => hint.finalAnswerLeakage).length,
        anyReferenceInputLeakingHints: allHints.filter((hint) => hint.anyReferenceInputLeakage).length,
        duplicateLevels: rows.reduce((sum, row) => sum + row.duplicateLevels, 0),
        duplicateTexts: rows.reduce((sum, row) => sum + row.duplicateTexts, 0),
      },
      comparability:
        "proxy operacional intrinseco a saida 3c; nao demonstra progressividade pedagogica nem alinhamento com dicas CTAT",
      detail: { steps: rows, forbiddenFinalAnswerKeys: forbiddenFinalAnswer.map(canonAnswer) },
    };
  });

  return {
    schemaVersion: C4_METRICS_VERSION,
    agent: "3c",
    invoked: typeof invoked === "boolean" ? invoked : agentOutput != null,
    problemIdCoverage: index.public,
    schemaAudit: schemaAudit("agent3c", root),
    aggregate: {
      unit: "exercise",
      exercises: byProblem.length,
      macroFourLevelCompletenessConditional: mean(
        byProblem.map((row) => row.fourLevelCompletenessConditional)
      ),
      macroStrictFourLevelValidityConditional: mean(
        byProblem.map((row) => row.strictFourLevelValidityConditional)
      ),
      macroStrictProblemSuccessItt: mean(byProblem.map((row) => row.strictProblemSuccessItt)),
      totalEligibleGeneratedSteps: byProblem.reduce(
        (sum, row) => sum + row.eligibleGeneratedSteps,
        0
      ),
      totalHints: byProblem.reduce((sum, row) => sum + row.counts.hints, 0),
    },
    byProblem,
  };
}

function fieldRate(sourceRows, predicate, preserved) {
  const eligible = sourceRows.filter(predicate);
  return {
    sourcePresent: eligible.length,
    preserved: eligible.filter(preserved).length,
    rate: ratio(eligible.filter(preserved).length, eligible.length),
  };
}

function flattenRaw3a(state, root) {
  const firstKc = state?.knowledgeComponents?.[0]?.id || "kc_default";
  const rows = [];
  asArray(root?.solutions).forEach((solution, solutionIndex) => {
    asArray(solution?.solutionTrace).forEach((step, traceIndex) => {
      if (step?.isCorrect !== false) {
        rows.push({
          solutionIndex,
          traceIndex,
          problemId: solution?.problemId ?? null,
          raw: step,
          transformed: {
            index: step?.step || rows.length + 1,
            kc: step?.kcUsed || firstKc,
            action: step?.action || "",
            result: step?.result || "",
          },
        });
      }
    });
  });
  return rows;
}

function stepNodes(artifacts) {
  return asArray(artifacts?.graph?.nodes)
    .filter((node) => node?.type === "step")
    .sort((left, right) => Number(String(left.id).replace("step_", "")) - Number(String(right.id).replace("step_", "")));
}

function transport3a(state, root, config, artifacts) {
  const raw = flattenRaw3a(state, root);
  const configSteps = asArray(config?.steps);
  const graphSteps = stepNodes(artifacts);
  const rows = raw.map((item, index) => ({
    ...item,
    configIndex: index < configSteps.length ? index : null,
    preservedRawToConfig:
      index < configSteps.length && stableStringify(item.transformed) === stableStringify(configSteps[index]),
  }));
  const configRows = configSteps.map((step, index) => {
    const node = graphSteps[index];
    return {
      configIndex: index,
      step,
      nodeId: node?.id ?? null,
      positionEncodedInNodeId: node?.id === `step_${index + 1}`,
      actionPreserved: node?.description === step?.action,
      kcPreserved: node?.knowledgeComponents?.[0] === step?.kc,
      resultPreserved: false,
      originalIndexPreserved: false,
    };
  });
  const problemIdsInConfigPrefix = [...new Set(rows.filter((row) => row.configIndex != null).map((row) => String(row.problemId)))];
  const problemIdsTruncated = [...new Set(rows.filter((row) => row.configIndex == null).map((row) => String(row.problemId)))];
  return {
    rawItems: raw.length,
    configItems: configSteps.length,
    graphStepNodes: graphSteps.length,
    exactItemsPreservedRawToConfig: rows.filter((row) => row.preservedRawToConfig).length,
    exactItemPreservationRateRawToConfig: ratio(
      rows.filter((row) => row.preservedRawToConfig).length,
      raw.length
    ),
    truncationCount: Math.max(0, raw.length - configSteps.length),
    problemIdentity: {
      rawCarriesProblemId: true,
      configCarriesProblemId: configSteps.some((step) => hasValue(step, "problemId")),
      graphCarriesProblemId: graphSteps.some((node) => hasValue(node, "problemId")),
      reconstructedProblemIdsInConfigPrefix: problemIdsInConfigPrefix,
      reconstructedProblemIdsFullyTruncated: problemIdsTruncated.filter(
        (id) => !problemIdsInConfigPrefix.includes(id)
      ),
      warning: "GraphForge concatena solutions em ordem e corta o prefixo global; problemId nao e transportado",
    },
    rawToConfigFields: {
      problemId: { sourcePresent: raw.filter((row) => row.problemId != null).length, preserved: 0, rate: 0 },
      stepToIndex: fieldRate(raw, (row) => hasValue(row.raw, "step"), (row) => row.preservedRawToConfig),
      action: fieldRate(raw, (row) => hasValue(row.raw, "action"), (row) => row.preservedRawToConfig),
      result: fieldRate(raw, (row) => hasValue(row.raw, "result"), (row) => row.preservedRawToConfig),
      kcUsedToKc: fieldRate(raw, (row) => hasValue(row.raw, "kcUsed"), (row) => row.preservedRawToConfig),
    },
    configToGraphFields: {
      positionToNodeId: fieldRate(configRows, () => true, (row) => row.positionEncodedInNodeId),
      actionToDescription: fieldRate(configRows, (row) => hasValue(row.step, "action"), (row) => row.actionPreserved),
      kcToKnowledgeComponents: fieldRate(configRows, (row) => hasValue(row.step, "kc"), (row) => row.kcPreserved),
      result: fieldRate(configRows, (row) => hasValue(row.step, "result"), () => false),
      originalStepIndex: fieldRate(configRows, (row) => hasValue(row.step, "index"), () => false),
    },
    detail: { rawToConfig: rows, configToGraph: configRows },
  };
}

function flattenRaw3b(root) {
  const rows = [];
  asArray(root?.solutions).forEach((solution, solutionIndex) => {
    asArray(solution?.attempts).forEach((attempt, attemptIndex) => {
      asArray(attempt?.solutionTrace).forEach((step, traceIndex) => {
        if (step?.isCorrect === false && step?.error) {
          const error = step.error;
          rows.push({
            solutionIndex,
            attemptIndex,
            traceIndex,
            problemId: solution?.problemId ?? null,
            step: step?.step ?? null,
            bucket: (step?.step || 1) - 1,
            error,
            transformed: error?.misconceptionId
              ? {
                  id: error.misconceptionId,
                  type: error.type || "conceptual_error",
                  wrongAnswer: error.wrongAnswer || step?.result || "",
                  description: error.description || "",
                  feedback: error.howToFix || error.feedback || "",
                  severity: error.severity || "moderate",
                }
              : null,
          });
        }
      });
    });
  });
  return rows;
}

function flattenConfigMisconceptions(config) {
  return asArray(config?.misconceptions).flatMap((items, bucket) =>
    asArray(items).map((item, indexWithinBucket) => ({ bucket, indexWithinBucket, item }))
  );
}

function greedyExactMatches(source, target, sourceFingerprint, targetFingerprint) {
  const used = new Set();
  return source.map((sourceRow) => {
    const key = sourceFingerprint(sourceRow);
    const targetIndex = key == null
      ? -1
      : target.findIndex((targetRow, index) => !used.has(index) && targetFingerprint(targetRow) === key);
    if (targetIndex >= 0) used.add(targetIndex);
    return { ...sourceRow, matchedTargetIndex: targetIndex >= 0 ? targetIndex : null };
  });
}

function flattenGraphMisconceptions(artifacts) {
  return stepNodes(artifacts).flatMap((node, bucket) =>
    asArray(node?.misconceptions).map((item, indexWithinBucket) => ({ bucket, indexWithinBucket, item }))
  );
}

function transport3b(root, config, artifacts) {
  const raw = flattenRaw3b(root);
  const configItems = flattenConfigMisconceptions(config);
  const matchedRaw = greedyExactMatches(
    raw,
    configItems,
    (row) => row.transformed == null ? null : `${row.bucket}\u0000${stableStringify(row.transformed)}`,
    (row) => `${row.bucket}\u0000${stableStringify(row.item)}`
  );
  const graphItems = flattenGraphMisconceptions(artifacts);
  const expectedGraphItem = (item) => ({
    id: item.id,
    wrongAnswer: String(item.wrongAnswer || ""),
    misconceptionType: item.type || "conceptual_error",
    description: item.description || "",
    feedback: item.feedback || "Tente novamente com cuidado.",
    severity: item.severity || "moderate",
    matcher: "exact",
  });
  const matchedConfig = greedyExactMatches(
    configItems,
    graphItems,
    (row) => `${row.bucket}\u0000${stableStringify(expectedGraphItem(row.item))}`,
    (row) => `${row.bucket}\u0000${stableStringify(row.item)}`
  );
  const isMatched = (row) => row.matchedTargetIndex != null;
  const matchedProblemOrigins = new Map();
  for (const row of matchedRaw.filter(isMatched)) {
    const key = row.matchedTargetIndex;
    if (!matchedProblemOrigins.has(key)) matchedProblemOrigins.set(key, new Set());
    matchedProblemOrigins.get(key).add(String(row.problemId));
  }
  return {
    rawErrorItems: raw.length,
    configMisconceptionItems: configItems.length,
    graphMisconceptionItems: graphItems.length,
    exactItemsPreservedRawToConfig: matchedRaw.filter(isMatched).length,
    exactItemPreservationRateRawToConfig: ratio(matchedRaw.filter(isMatched).length, raw.length),
    exactItemsPreservedConfigToGraph: matchedConfig.filter(isMatched).length,
    exactItemPreservationRateConfigToGraph: ratio(matchedConfig.filter(isMatched).length, configItems.length),
    droppedByMissingIdDedupOrStepTruncation: raw.length - matchedRaw.filter(isMatched).length,
    problemIdentity: {
      rawCarriesProblemId: true,
      configCarriesProblemId: configItems.some((row) => hasValue(row.item, "problemId")),
      graphCarriesProblemId: graphItems.some((row) => hasValue(row.item, "problemId")),
      reconstructedOriginsPerConfigItem: configItems.map((row, index) => ({
        bucket: row.bucket,
        indexWithinBucket: row.indexWithinBucket,
        problemIds: [...(matchedProblemOrigins.get(index) || [])],
      })),
      warning: "misconceptions de solutions diferentes sao agrupadas pelo numero de passo e deduplicadas por id sem problemId",
    },
    rawToConfigFields: {
      problemId: { sourcePresent: raw.filter((row) => row.problemId != null).length, preserved: 0, rate: 0 },
      stepToArrayBucket: fieldRate(matchedRaw, (row) => row.step != null, isMatched),
      misconceptionIdToId: fieldRate(matchedRaw, (row) => hasValue(row.error, "misconceptionId"), isMatched),
      type: fieldRate(matchedRaw, (row) => hasValue(row.error, "type"), isMatched),
      wrongAnswer: fieldRate(matchedRaw, (row) => hasValue(row.error, "wrongAnswer"), isMatched),
      description: fieldRate(matchedRaw, (row) => hasValue(row.error, "description"), isMatched),
      severity: fieldRate(matchedRaw, (row) => hasValue(row.error, "severity"), isMatched),
      howToFixToFeedback: fieldRate(matchedRaw, (row) => hasValue(row.error, "howToFix"), isMatched),
      feedbackWhenNoHowToFix: fieldRate(
        matchedRaw,
        (row) => !row.error?.howToFix && hasValue(row.error, "feedback"),
        isMatched
      ),
      diagnosticQuestion: fieldRate(matchedRaw, (row) => hasValue(row.error, "diagnosticQuestion"), () => false),
      mistakeLocation: fieldRate(matchedRaw, (row) => hasValue(row.error, "mistakeLocation"), () => false),
    },
    configToGraphFields: {
      fullMisconceptionRecord: fieldRate(matchedConfig, () => true, isMatched),
    },
    detail: { rawToConfig: matchedRaw, configToGraph: matchedConfig },
  };
}

function flattenRaw3c(root) {
  const rows = [];
  asArray(root?.solutions).forEach((solution, solutionIndex) => {
    asArray(solution?.solutionTrace).forEach((step, traceIndex) => {
      const hints = asArray(step?.hintsNeeded);
      if (step?.hesitation || hints.length > 0) {
        hints.forEach((hint, hintIndex) => {
          rows.push({
            solutionIndex,
            traceIndex,
            hintIndex,
            problemId: solution?.problemId ?? null,
            step: step?.step ?? null,
            bucket: (step?.step || 1) - 1,
            level: hintLevel(hint),
            type: canonicalHintType(typeof hint === "string" ? "" : hint?.type),
            text: hintText(hint),
          });
        });
      }
    });
  });
  return rows;
}

function flattenConfigHints(config) {
  return asArray(config?.hints).flatMap((items, bucket) =>
    asArray(items).map((text, indexWithinBucket) => ({ bucket, indexWithinBucket, text: asText(text) }))
  );
}

function flattenSlotHints(artifacts) {
  return asArray(artifacts?.slotManifest).flatMap((slot) => {
    if (slot?.field !== "hints") return [];
    const match = String(slot.nodeId || "").match(/^step_(\d+)$/);
    if (!match) return [];
    const bucket = Number(match[1]) - 1;
    return asArray(slot?.existingHints).map((text, indexWithinBucket) => ({
      bucket,
      indexWithinBucket,
      text: asText(text),
    }));
  });
}

function transport3c(root, config, artifacts) {
  const raw = flattenRaw3c(root);
  const configHints = flattenConfigHints(config);
  const matchedRaw = greedyExactMatches(
    raw,
    configHints,
    (row) => `${row.bucket}\u0000${row.text}`,
    (row) => `${row.bucket}\u0000${row.text}`
  );
  const slotHints = flattenSlotHints(artifacts);
  const matchedConfig = greedyExactMatches(
    configHints,
    slotHints,
    (row) => `${row.bucket}\u0000${row.text}`,
    (row) => `${row.bucket}\u0000${row.text}`
  );
  const isMatched = (row) => row.matchedTargetIndex != null;
  const graphNodeHintCount = stepNodes(artifacts).reduce(
    (sum, node) => sum + asArray(node?.hints).length,
    0
  );
  return {
    rawHintItems: raw.length,
    configHintItems: configHints.length,
    slotManifestExistingHints: slotHints.length,
    genericGraphNodeHints: graphNodeHintCount,
    exactHintsPreservedRawToConfig: matchedRaw.filter(isMatched).length,
    exactHintPreservationRateRawToConfig: ratio(matchedRaw.filter(isMatched).length, raw.length),
    exactHintsPreservedConfigToSlotManifest: matchedConfig.filter(isMatched).length,
    exactHintPreservationRateConfigToSlotManifest: ratio(
      matchedConfig.filter(isMatched).length,
      configHints.length
    ),
    problemIdentity: {
      rawCarriesProblemId: true,
      configCarriesProblemId: false,
      graphCarriesProblemId: false,
      warning: "dicas de solutions diferentes sao fundidas por numero de passo; nivel e tipo sao removidos",
    },
    rawToConfigFields: {
      problemId: { sourcePresent: raw.filter((row) => row.problemId != null).length, preserved: 0, rate: 0 },
      stepToArrayBucket: fieldRate(matchedRaw, (row) => row.step != null, isMatched),
      text: fieldRate(matchedRaw, (row) => row.text !== "", isMatched),
      level: fieldRate(matchedRaw, (row) => Number.isInteger(row.level), () => false),
      type: fieldRate(matchedRaw, (row) => row.type !== "", () => false),
    },
    configToGraphFields: {
      textToSlotManifestExistingHints: fieldRate(matchedConfig, () => true, isMatched),
      textToGenericGraphNodeHints: fieldRate(configHints, () => true, () => false),
    },
    detail: { rawToConfig: matchedRaw, configToSlotManifest: matchedConfig },
  };
}

export function evaluateCampaign4Transport({ state, rawAgentOutputs, graphForgeConfig, graphForgeArtifacts } = {}) {
  const root3a = agentRoot("agent3a", rawAgentOutputs?.agent3a);
  const root3b = agentRoot("agent3b", rawAgentOutputs?.agent3b);
  const root3c = agentRoot("agent3c", rawAgentOutputs?.agent3c);
  return {
    schemaVersion: C4_METRICS_VERSION,
    estimand: "field-level preservation under the observed production transformation",
    noCompositeScore: true,
    agent3a: transport3a(state, root3a, graphForgeConfig, graphForgeArtifacts),
    agent3b: transport3b(root3b, graphForgeConfig, graphForgeArtifacts),
    agent3c: transport3c(root3c, graphForgeConfig, graphForgeArtifacts),
    limitations: [
      "preservacao mede igualdade deterministica de campos, nao qualidade pedagogica",
      "problemId ausente na config/GraphForge impede atribuir o grafo final a cada seed sem reconstruir a ordem bruta",
      "result do 3a nao chega aos nos do genericGraph; dicas do 3c chegam somente como existingHints do slotManifest",
    ],
  };
}

export function evaluateCampaign4Batch({
  state,
  referencesByProblemId,
  rawAgentOutputs,
  graphForgeConfig,
  graphForgeArtifacts,
  agent3cInvoked,
} = {}) {
  const ids = expectedIds(state);
  if (!ids.length || new Set(ids).size !== ids.length) {
    throw new Error("Estado C4 deve conter problemIds unicos");
  }
  for (const problemId of ids) referenceFor(referencesByProblemId, problemId);
  return {
    schemaVersion: C4_METRICS_VERSION,
    referenceVersion: C4_CTAT_REFERENCE_VERSION,
    referenceActionPolicyVersion: C4_CTAT_ACTION_POLICY_VERSION,
    unitOfAnalysis: "exercise/problemId",
    agent3a: evaluateCampaign4Agent3a({
      state,
      referencesByProblemId,
      agentOutput: rawAgentOutputs?.agent3a,
    }),
    agent3b: evaluateCampaign4Agent3b({
      state,
      referencesByProblemId,
      agentOutput: rawAgentOutputs?.agent3b,
    }),
    agent3c: evaluateCampaign4Agent3c({
      state,
      referencesByProblemId,
      agentOutput: rawAgentOutputs?.agent3c,
      invoked: agent3cInvoked,
    }),
    transport:
      graphForgeConfig && graphForgeArtifacts
        ? evaluateCampaign4Transport({ state, rawAgentOutputs, graphForgeConfig, graphForgeArtifacts })
        : null,
    fixedInterpretiveLimits: [
      "saidas genericas com placeholders nao sao instanciadas post hoc e nao recebem credito em exact-concrete",
      "step do agente 3b nao identifica state ID/SAI CTAT; somente proxy ordinal e reportado",
      "metricas do 3c avaliam contrato de quatro niveis e vazamento literal/numerico, nao eficacia pedagogica",
      "nenhum escore composto de qualidade e calculado",
    ],
  };
}
