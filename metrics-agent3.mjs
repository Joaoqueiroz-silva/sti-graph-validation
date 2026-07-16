/**
 * Métricas DIRETAS dos agentes 3a/3b/3c, calculadas antes do GraphForge.
 *
 * Este módulo é deliberadamente puro: não importa cliente LLM, não monta grafo e
 * não chama juiz. Assim, seus resultados podem ser atribuídos ao conteúdo estruturado
 * devolvido por cada agente, e não à topologia determinística criada pelo GraphForge.
 *
 * Entradas aceitas:
 *   - referência: schema neutro v2 (preferido) ou neutro v1;
 *   - 3a: advancedTrace bruto, wrapper { advancedTrace } ou { correctPath };
 *   - 3b: atRiskTrace bruto, wrapper { atRiskTrace } ou { misconceptions };
 *   - 3c: averageTrace bruto, wrapper { averageTrace } ou { hints }.
 *
 * O schema v2 é necessário para recall contextual/por estado do 3b e para derivar
 * os passos com dicas da referência. Quando a localização não existe no formato v1,
 * a métrica contextual retorna null, em vez de fabricar um denominador.
 */

import { canon, canonAnswer } from "./schema.js";

export const AGENT3_METRICS_SCHEMA_VERSION = "agent3-direct-v1";

const round = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : x);
const asArray = (x) => (Array.isArray(x) ? x : []);
const text = (x) => String(x ?? "").trim();
const stepKey = (x) => text(x);

function ratio(num, den) {
  return den > 0 ? round(num / den) : null;
}

function f1(precision, recall) {
  if (!Number.isFinite(precision) || !Number.isFinite(recall)) return null;
  return precision + recall > 0 ? round((2 * precision * recall) / (precision + recall)) : 0;
}

function isCorrectTransition(t) {
  if (!t) return false;
  if (t.type != null) return t.type === "correct";
  if (t.isCorrect != null) return t.isCorrect === true;
  return t.role === "correct" || t.role === "default";
}

function isBuggyTransition(t) {
  if (!t) return false;
  if (t.type != null) return t.type === "buggy";
  if (t.isCorrect != null) return t.isCorrect === false;
  return t.role === "misconception" || t.role === "buggy";
}

function transitionInput(t) {
  return t?.sai?.input ?? t?.input ?? t?.wrongAnswer ?? "";
}

/**
 * Segue um caminho correto determinístico a partir do startState. Em grafos
 * ramificados, usa a primeira transição correta na ordem serializada, a mesma decisão
 * conservadora dos demais normalizadores deste repositório.
 */
function orderedCorrectTransitions(reference) {
  const transitions = asArray(reference?.transitions).filter(isCorrectTransition);
  if (!transitions.length) return [];

  const byFrom = new Map();
  const destinations = new Set();
  for (const t of transitions) {
    if (!byFrom.has(t.from)) byFrom.set(t.from, []);
    byFrom.get(t.from).push(t);
    if (t.to != null) destinations.add(t.to);
  }

  let state = reference?.startState;
  if (state == null) state = transitions.find((t) => !destinations.has(t.from))?.from;
  if (state == null) return transitions.slice();

  const ordered = [];
  const seenEdges = new Set();
  const seenStates = new Set();
  while (!seenStates.has(state)) {
    seenStates.add(state);
    const next = (byFrom.get(state) || []).find((t) => !seenEdges.has(t.id ?? t));
    if (!next) break;
    seenEdges.add(next.id ?? next);
    ordered.push(next);
    state = next.to;
  }
  return ordered;
}

function isStudentTransition(t) {
  if (t?.actor == null || text(t.actor) === "") return true;
  return /^student\b/.test(canon(t.actor)) || /^aluno\b/.test(canon(t.actor));
}

function isMechanicalCorrectTransition(t) {
  const input = text(transitionInput(t));
  if (input === "" || input === "-") return true;
  const selection = canon(t?.sai?.selection ?? t?.selection ?? "");
  const action = canon(t?.sai?.action ?? t?.action ?? "");
  // No corpus CTAT, -1 no botão done é sentinela de interface, não conteúdo.
  return input === "-1" && (/done|conclu/.test(selection) || /button|press|click/.test(action));
}

function isMechanicalBuggy(item) {
  if (item?.mechanical === true) return true;
  const input = canonAnswer(transitionInput(item));
  // Convenção corpus-específica, idêntica à usada pelo parser do estudo.
  return input === "" || input === "-" || input === "-1";
}

/** Passos corretos diretamente observáveis na referência. */
export function referenceCorrectSteps(reference, opts = {}) {
  const studentOnly = opts.studentOnly !== false;
  const excludeMechanical = opts.excludeMechanical !== false;

  if (asArray(reference?.transitions).length) {
    return orderedCorrectTransitions(reference)
      .filter((t) => !studentOnly || isStudentTransition(t))
      .filter((t) => !excludeMechanical || !isMechanicalCorrectTransition(t))
      .map((t, i) => ({
        index: i + 1,
        state: t.from == null ? null : text(t.from),
        input: text(transitionInput(t)),
        inputKey: canonAnswer(transitionInput(t)),
        selection: text(t?.sai?.selection ?? t?.selection),
        action: text(t?.sai?.action ?? t?.action),
        hints: asArray(t?.hints).map(text).filter(Boolean),
        transition: t,
      }))
      .filter((s) => s.inputKey !== "");
  }

  return asArray(reference?.steps)
    .map((s, i) => ({
      index: Number(s?.order ?? s?.step ?? i + 1),
      state: s?.state == null ? null : text(s.state),
      input: text(s?.answer ?? s?.result ?? s?.input),
      inputKey: canonAnswer(s?.answer ?? s?.result ?? s?.input),
      selection: text(s?.selection),
      action: text(s?.action),
      hints: asArray(s?.hints).map(text).filter(Boolean),
      transition: s,
    }))
    .filter((s) => s.inputKey !== "");
}

/** Comprimento da maior subsequência comum, preservando repetições e ordem. */
export function longestCommonSubsequenceLength(a, b, equals = (x, y) => x === y) {
  const left = asArray(a);
  const right = asArray(b);
  const previous = new Array(right.length + 1).fill(0);
  const current = new Array(right.length + 1).fill(0);
  for (let i = 1; i <= left.length; i++) {
    current.fill(0);
    for (let j = 1; j <= right.length; j++) {
      current[j] = equals(left[i - 1], right[j - 1])
        ? previous[j - 1] + 1
        : Math.max(previous[j], current[j - 1]);
    }
    for (let j = 0; j <= right.length; j++) previous[j] = current[j];
  }
  return previous[right.length];
}

export function extractAgent3a(agentOutput) {
  if (Array.isArray(agentOutput)) {
    return { steps: agentOutput, finalAnswer: null, source: "array" };
  }
  const root = agentOutput?.advancedTrace ?? agentOutput ?? {};
  if (Array.isArray(root.correctPath)) {
    return { steps: root.correctPath, finalAnswer: root.finalAnswer ?? null, source: "correctPath" };
  }
  const solutions = asArray(root.solutions);
  const solution = solutions[0] || {};
  return {
    steps: asArray(solution.solutionTrace),
    finalAnswer: solution.finalAnswer ?? null,
    source: "advancedTrace",
  };
}

/**
 * 3a: cobertura ordenada por LCS dos valores corretos, antes da montagem do grafo.
 * Precisão é secundária: um passo adicional pode ser pedagogicamente válido.
 */
export function evaluateAgent3a(reference, agentOutput, opts = {}) {
  const refSteps = referenceCorrectSteps(reference, opts);
  const extracted = extractAgent3a(agentOutput);
  const generated = extracted.steps.map((s, i) => ({
    index: Number(s?.step ?? i + 1),
    result: text(s?.result ?? s?.answer ?? s?.input),
    resultKey: canonAnswer(s?.result ?? s?.answer ?? s?.input),
    action: text(s?.action),
    kc: text(s?.kcUsed ?? s?.kc),
  }));
  const generatedAnchored = generated.filter((s) => s.resultKey !== "");
  const refKeys = refSteps.map((s) => s.inputKey);
  const generatedKeys = generatedAnchored.map((s) => s.resultKey);
  const lcs = longestCommonSubsequenceLength(refKeys, generatedKeys);
  const recall = refKeys.length ? round(lcs / refKeys.length) : null;
  const precision = generatedKeys.length
    ? round(lcs / generatedKeys.length)
    : refKeys.length
      ? 0
      : null;

  const expectedFinal = opts.correctAnswer;
  const finalAnswerKey = canonAnswer(extracted.finalAnswer);
  const finalAnswerCorrect =
    expectedFinal == null || finalAnswerKey === ""
      ? null
      : finalAnswerKey === canonAnswer(expectedFinal);

  return {
    schemaVersion: AGENT3_METRICS_SCHEMA_VERSION,
    agent: "3a",
    orderedRecall: recall,
    orderedPrecision: precision,
    orderedF1: f1(precision, recall),
    lcsLength: lcs,
    exactOrderedMatch:
      refKeys.length === generatedKeys.length &&
      refKeys.every((value, i) => value === generatedKeys[i]),
    finalAnswerCorrect,
    counts: {
      referenceSteps: refKeys.length,
      generatedSteps: generated.length,
      generatedAnchoredSteps: generatedKeys.length,
      generatedEmptyResults: generated.length - generatedKeys.length,
    },
    detail: {
      reference: refSteps,
      generated,
      referenceKeys: refKeys,
      generatedKeys,
      extractionSource: extracted.source,
      finalAnswer: extracted.finalAnswer,
    },
  };
}

export function extractAgent3b(agentOutput) {
  if (Array.isArray(agentOutput)) return agentOutput;
  const root = agentOutput?.atRiskTrace ?? agentOutput ?? {};
  if (Array.isArray(root.misconceptions)) return root.misconceptions;

  const out = [];
  for (const solution of asArray(root.solutions)) {
    for (const attempt of asArray(solution?.attempts)) {
      for (const traceStep of asArray(attempt?.solutionTrace)) {
        const error = traceStep?.error;
        if (!error || traceStep?.isCorrect === true) continue;
        out.push({
          ...error,
          step: traceStep?.step ?? error?.step ?? null,
          state:
            error?.state ?? error?.stateId ?? error?.from ?? error?.sourceState ?? traceStep?.state,
        });
      }
    }
  }
  return out;
}

function referenceBuggyItems(reference, opts = {}) {
  const excludeMechanical = opts.excludeMechanical !== false;
  if (asArray(reference?.transitions).length) {
    return reference.transitions
      .filter(isBuggyTransition)
      .filter((t) => !excludeMechanical || !isMechanicalBuggy(t))
      .map((t) => ({
        state: t.from == null ? null : text(t.from),
        wrongAnswer: text(transitionInput(t)),
        answerKey: canonAnswer(transitionInput(t)),
        transition: t,
      }))
      .filter((x) => x.answerKey !== "");
  }

  return asArray(reference?.misconceptions)
    .filter((m) => !excludeMechanical || !isMechanicalBuggy(m))
    .map((m) => ({
      state:
        m?.state ?? m?.stateId ?? m?.from ?? m?.sourceState ?? m?.stepKey ??
        (m?.step != null ? `step:${m.step}` : null),
      wrongAnswer: text(m?.wrongAnswer),
      answerKey: canonAnswer(m?.wrongAnswer),
      transition: m,
    }))
    .filter((x) => x.answerKey !== "");
}

function explicitState(item) {
  const value = item?.state ?? item?.stateId ?? item?.from ?? item?.sourceState;
  return value == null || text(value) === "" ? null : text(value);
}

function resolveCandidateState(item, correctSteps) {
  const explicit = explicitState(item);
  if (explicit != null) return explicit;
  const n = Number(item?.step ?? item?.stepNumber ?? item?.mistakeStep);
  if (!Number.isInteger(n) || n < 1) return null;
  return correctSteps[n - 1]?.state ?? null;
}

function pairKey(state, answerKey) {
  return state == null || answerKey === "" ? null : `${state}\u0000${answerKey}`;
}

/** 3b: recall por valor e recall contextual por estado/passo. */
export function evaluateAgent3b(reference, agentOutput, opts = {}) {
  const refItems = referenceBuggyItems(reference, opts);
  const correctSteps = referenceCorrectSteps(reference, opts);
  const generatedRaw = extractAgent3b(agentOutput);
  const generated = generatedRaw.map((m) => {
    const answerKey = canonAnswer(m?.wrongAnswer);
    const state = resolveCandidateState(m, correctSteps);
    return {
      step: m?.step ?? null,
      state,
      wrongAnswer: text(m?.wrongAnswer),
      answerKey,
      id: text(m?.misconceptionId ?? m?.id),
      type: text(m?.type),
      raw: m,
    };
  });

  const refValues = new Set(refItems.map((x) => x.answerKey));
  const generatedValues = new Set(generated.map((x) => x.answerKey).filter(Boolean));
  const matchedValues = [...refValues].filter((x) => generatedValues.has(x));

  const refPairs = new Set(refItems.map((x) => pairKey(x.state, x.answerKey)).filter(Boolean));
  const generatedPairs = new Set(
    generated.map((x) => pairKey(x.state, x.answerKey)).filter(Boolean)
  );
  const matchedPairs = [...refPairs].filter((x) => generatedPairs.has(x));
  const nonEmptyGenerated = generated.filter((x) => x.answerKey !== "");

  return {
    schemaVersion: AGENT3_METRICS_SCHEMA_VERSION,
    agent: "3b",
    recallByValue: ratio(matchedValues.length, refValues.size),
    recallByState: ratio(matchedPairs.length, refPairs.size),
    stateMetricEstimable: refPairs.size > 0,
    counts: {
      referenceValues: refValues.size,
      referenceStatePairs: refPairs.size,
      generatedRaw: generated.length,
      generatedNonEmpty: nonEmptyGenerated.length,
      generatedUniqueValues: generatedValues.size,
      generatedUniqueStatePairs: generatedPairs.size,
      duplicateValues: Math.max(0, nonEmptyGenerated.length - generatedValues.size),
      emptyWrongAnswers: generated.length - nonEmptyGenerated.length,
      unresolvedGeneratedStates: generated.filter((x) => x.answerKey && x.state == null).length,
      matchedValues: matchedValues.length,
      matchedStatePairs: matchedPairs.length,
    },
    detail: {
      reference: refItems,
      generated,
      matchedValues,
      missingValues: [...refValues].filter((x) => !generatedValues.has(x)),
      extraValues: [...generatedValues].filter((x) => !refValues.has(x)),
      matchedStatePairs: matchedPairs,
      missingStatePairs: [...refPairs].filter((x) => !generatedPairs.has(x)),
    },
  };
}

function hintLevel(h) {
  const raw = h?.level ?? h?.hintLevel ?? h?.nivel;
  const direct = Number(raw);
  if (Number.isInteger(direct)) return direct;
  const match = text(raw).match(/\b([1-4])\b/);
  return match ? Number(match[1]) : null;
}

function hintText(h) {
  return text(typeof h === "string" ? h : h?.message ?? h?.text ?? h?.hint);
}

export function extractAgent3c(agentOutput) {
  if (Array.isArray(agentOutput)) {
    return {
      hints: agentOutput.map((h) => ({
        step: stepKey(h?.step ?? 1),
        level: hintLevel(h),
        type: text(h?.type),
        text: hintText(h),
      })),
      hesitationSteps: [],
      source: "array",
    };
  }

  const root = agentOutput?.averageTrace ?? agentOutput ?? {};
  if (Array.isArray(root.hints)) {
    return {
      hints: root.hints.map((h) => ({
        step: stepKey(h?.step ?? 1),
        level: hintLevel(h),
        type: text(h?.type),
        text: hintText(h),
      })),
      hesitationSteps: [],
      source: "hints",
    };
  }

  const hints = [];
  const hesitationSteps = [];
  for (const solution of asArray(root.solutions)) {
    for (const [i, traceStep] of asArray(solution?.solutionTrace).entries()) {
      const step = stepKey(traceStep?.step ?? i + 1);
      if (traceStep?.hesitation === true) hesitationSteps.push(step);
      for (const h of asArray(traceStep?.hintsNeeded)) {
        hints.push({
          step,
          level: hintLevel(h),
          type: text(h?.type),
          text: hintText(h),
        });
      }
    }
  }
  return { hints, hesitationSteps, source: "averageTrace" };
}

function referenceHintStepKeys(reference, opts = {}) {
  return referenceCorrectSteps(reference, opts)
    .filter((s) => s.hints.length > 0)
    .map((s) => stepKey(s.index));
}

function normalizeHintText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9/+-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function numericTokens(value) {
  return text(value).match(/-?\d+(?:\s*\/\s*-?\d+|[.,]\d+)?/g) || [];
}

/** Detecção básica e determinística; não substitui julgamento pedagógico. */
export function hintLeaksAnswer(hint, forbiddenAnswers = []) {
  const body = text(hint);
  if (!body) return false;
  const forbidden = asArray(forbiddenAnswers)
    .map((x) => ({ raw: text(x), key: canonAnswer(x) }))
    .filter((x) => x.key !== "");
  if (!forbidden.length) return false;

  const numeric = numericTokens(body).map(canonAnswer);
  const normalized = ` ${normalizeHintText(body)} `;
  return forbidden.some(({ raw, key }) => {
    if (numeric.includes(key)) return true;
    // Para respostas textuais, exige a expressão completa com fronteira de espaço.
    if (!/\d/.test(raw)) {
      const phrase = normalizeHintText(raw);
      return phrase !== "" && normalized.includes(` ${phrase} `);
    }
    return false;
  });
}

function requestedEligibleSteps(reference, extracted, opts) {
  if (Array.isArray(opts.eligibleSteps)) return opts.eligibleSteps.map(stepKey);
  if (Number.isInteger(opts.eligibleSteps) && opts.eligibleSteps >= 0) {
    return Array.from({ length: opts.eligibleSteps }, (_, i) => stepKey(i + 1));
  }
  const fromReference = referenceHintStepKeys(reference, opts);
  if (fromReference.length) return fromReference;
  return [...new Set([...extracted.hesitationSteps, ...extracted.hints.map((h) => h.step)])];
}

/**
 * 3c: completude dos quatro níveis, duplicação e vazamento literal/numérico.
 * `opts.correctAnswer` e `opts.forbiddenAnswers` definem o material proibido. Não
 * inferimos automaticamente toda resposta intermediária, para evitar falsos positivos.
 */
export function evaluateAgent3c(reference, agentOutput, opts = {}) {
  const extracted = extractAgent3c(agentOutput);
  const eligible = [...new Set(requestedEligibleSteps(reference, extracted, opts))];
  const forbiddenAnswers = [
    ...(opts.correctAnswer == null ? [] : [opts.correctAnswer]),
    ...asArray(opts.forbiddenAnswers),
  ];
  const hints = extracted.hints.map((h) => ({
    ...h,
    leakage: hintLeaksAnswer(h.text, forbiddenAnswers),
    textKey: normalizeHintText(h.text),
  }));

  const allStepKeys = [...new Set([...eligible, ...hints.map((h) => h.step)])];
  const rows = allStepKeys.map((step) => {
    const stepHints = hints.filter((h) => h.step === step);
    const levels = stepHints.map((h) => h.level).filter((x) => Number.isInteger(x));
    const levelSet = new Set(levels);
    const texts = stepHints.map((h) => h.textKey).filter(Boolean);
    const textSet = new Set(texts);
    const duplicateLevels = levels.length - levelSet.size;
    const duplicateTexts = texts.length - textSet.size;
    const fourLevelsComplete = [1, 2, 3, 4].every((level) => levelSet.has(level));
    const hasLeakage = stepHints.some((h) => h.leakage);
    return {
      step,
      eligible: eligible.includes(step),
      hintCount: stepHints.length,
      levels: [...levelSet].sort((a, b) => a - b),
      fourLevelsComplete,
      duplicateLevels,
      duplicateTexts,
      hasLeakage,
      validFourLevelChain:
        fourLevelsComplete && duplicateLevels === 0 && duplicateTexts === 0 && !hasLeakage,
      hints: stepHints,
    };
  });
  const eligibleRows = rows.filter((r) => r.eligible);
  const complete = eligibleRows.filter((r) => r.fourLevelsComplete).length;
  const valid = eligibleRows.filter((r) => r.validFourLevelChain).length;
  const leakingHints = hints.filter((h) => h.leakage).length;
  const duplicateLevels = rows.reduce((sum, row) => sum + row.duplicateLevels, 0);
  const duplicateTexts = rows.reduce((sum, row) => sum + row.duplicateTexts, 0);

  return {
    schemaVersion: AGENT3_METRICS_SCHEMA_VERSION,
    agent: "3c",
    invoked: typeof opts.invoked === "boolean" ? opts.invoked : agentOutput != null,
    fourLevelCompleteness: ratio(complete, eligibleRows.length),
    validFourLevelCompleteness: ratio(valid, eligibleRows.length),
    leakageRate: ratio(leakingHints, hints.length),
    counts: {
      eligibleSteps: eligibleRows.length,
      generatedHintSteps: new Set(hints.map((h) => h.step)).size,
      completeFourLevelSteps: complete,
      validFourLevelSteps: valid,
      hints: hints.length,
      hintsWithoutLevel: hints.filter((h) => !Number.isInteger(h.level)).length,
      leakingHints,
      duplicateLevels,
      duplicateTexts,
    },
    detail: {
      eligibleSteps: eligible,
      steps: rows,
      extractionSource: extracted.source,
      forbiddenAnswerKeys: forbiddenAnswers.map(canonAnswer).filter(Boolean),
    },
  };
}

/** Conveniência para produzir um registro único sem misturar os estimandos. */
export function evaluateAgent3Suite({
  reference,
  agent3a,
  agent3b,
  agent3c,
  correctAnswer,
  agent3aOptions = {},
  agent3bOptions = {},
  agent3cOptions = {},
} = {}) {
  return {
    schemaVersion: AGENT3_METRICS_SCHEMA_VERSION,
    agent3a: evaluateAgent3a(reference, agent3a, { correctAnswer, ...agent3aOptions }),
    agent3b: evaluateAgent3b(reference, agent3b, agent3bOptions),
    agent3c: evaluateAgent3c(reference, agent3c, { correctAnswer, ...agent3cOptions }),
  };
}
