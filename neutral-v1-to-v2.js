/**
 * neutral-v1-to-v2.js — Grafo neutro v1 do ROBÔ → schema neutro v2 executável (Onda 3, G10).
 *
 * O comparador comportamental (trace-conformance.js) executa traços em DOIS grafos v2:
 * o do especialista sai de parseBrdToNeutralV2 (schema-v2.js), mas o do robô só existe
 * no esquema neutro v1 (schema.js: steps + misconceptions + transitions de backbone).
 * Este módulo constrói o v2 do robô a partir do v1, sem inventar comportamento que o
 * v1 não declarou.
 *
 * Construção (2026-07-13, decisões registradas):
 *   - estados: "start" + um estado por passo ("step_i" = passo i CONCLUÍDO) + "goal".
 *     O estado EM QUE o passo i é executado é a ORIGEM da sua transição (start para o
 *     1º passo, step_{i-1} para os demais).
 *   - transições correct encadeiam os passos com sai { selection: componente do passo
 *     (quando o v1 o carrega) ou "resposta", action: "input", input: answer do passo },
 *     matchRule "semantic" (o robô responde por VALOR; a equivalência de fração/decimal
 *     de canonAnswer é a âncora do experimento).
 *   - cada misconception vira uma transição buggy saindo do estado onde o passo
 *     correspondente é executado (resolvido por stepKey; sem âncora → estado do
 *     primeiro passo), com input = wrongAnswer, feedback = feedback da misconception,
 *     matchRule "semantic". Destino = o próprio estado (o example-tracing não avança
 *     em erro; ver trace-executor.js).
 *   - dicas do v1 (hintsPerCorrectStep, quando presentes) viram hints[] da transição
 *     correct do passo correspondente.
 *   - finalStates = ["goal", <estado do último passo>]: o v1 não declara um SAI de
 *     fechamento (não há aresta "done" no neutro), então NADA é fabricado — "goal"
 *     fica declarado (contrato do schema v2) e a conclusão OPERACIONAL é o estado do
 *     último passo: executeTrace do caminho correto completa exatamente ao fim dele.
 */

import { canon, canonAnswer } from "./schema.js";

/** Chave canônica de um passo do v1 (mesma cadeia de fallback de normalizeNeutral). */
function stepKeyOf(s, i) {
  return s?.key || canonAnswer(s?.answer) || canon(s?.kc) || `step#${i + 1}`;
}

/** Componente (selection) declarado no passo/misconception do v1, ou "resposta". */
function selectionOf(entry) {
  const sel = entry?.selection ?? entry?.component;
  return sel != null && String(sel).trim() !== "" ? String(sel).trim() : "resposta";
}

/**
 * neutralV1ToV2(neutralV1, meta) → grafo no schema neutro v2 (schema-v2.js),
 * executável pelo trace-executor. Puro e determinístico.
 * @param {object} neutralV1  grafo neutro v1 ({ steps, misconceptions, ... })
 * @param {object} [meta]     campos extras para v2.meta (ex.: { source, exercise })
 */
export function neutralV1ToV2(neutralV1, meta = {}) {
  if (!neutralV1 || !Array.isArray(neutralV1.steps)) {
    throw new Error("neutralV1ToV2: esperado grafo neutro v1 (com steps[])");
  }
  const steps = neutralV1.steps;
  const miscs = neutralV1.misconceptions || [];
  const hintsPerStep = Array.isArray(neutralV1.hintsPerCorrectStep)
    ? neutralV1.hintsPerCorrectStep
    : [];

  const stateIdOf = (i) => `step_${i + 1}`; // estado "passo i concluído"
  const sourceOf = (i) => (i === 0 ? "start" : stateIdOf(i - 1)); // onde o passo i é executado

  const states = [
    { id: "start", name: "start" },
    ...steps.map((s, i) => ({ id: stateIdOf(i), name: `passo ${i + 1}: ${stepKeyOf(s, i)}` })),
    { id: "goal", name: "goal" },
  ];

  const transitions = steps.map((s, i) => ({
    id: `t_correct_${i + 1}`,
    from: sourceOf(i),
    to: stateIdOf(i),
    sai: { selection: selectionOf(s), action: "input", input: String(s.answer ?? "") },
    type: "correct",
    matchRule: "semantic",
    actor: "Student",
    feedback: null,
    hints: (hintsPerStep[i] || []).map(String),
    kcs: s.kc ? [String(s.kc)] : [],
  }));

  miscs.forEach((m, j) => {
    // Âncora: stepKey → índice do passo; sem âncora (null/não encontrado) → primeiro passo.
    const key = m?.stepKey != null ? String(m.stepKey) : null;
    let idx = key != null ? steps.findIndex((s, i) => stepKeyOf(s, i) === key) : -1;
    if (idx < 0) idx = 0;
    const anchor = steps.length ? sourceOf(idx) : "start";
    transitions.push({
      id: `t_buggy_${j + 1}`,
      from: anchor,
      to: anchor, // erro não avança (default do example-tracing)
      sai: {
        selection: m?.selection != null ? selectionOf(m) : selectionOf(steps[idx]),
        action: "input",
        input: String(m?.wrongAnswer ?? ""),
      },
      type: "buggy",
      matchRule: "semantic",
      actor: "Student",
      feedback: m?.feedback ? { buggyMessage: String(m.feedback) } : null,
      hints: [],
      kcs: [],
    });
  });

  const lastState = steps.length ? stateIdOf(steps.length - 1) : "start";

  return {
    schemaVersion: 2,
    meta: {
      source: neutralV1.meta?.source || "robo",
      problem: neutralV1.meta?.problem ?? null,
      derivedFrom: "neutral-v1",
      ...meta,
    },
    startState: "start",
    finalStates: ["goal", lastState],
    states,
    transitions,
    skills: (neutralV1.skills || []).map((s) => ({ ...s, hints: (s.hints || []).slice() })),
    unsupportedConstructs: [],
  };
}

/**
 * Traço do caminho correto do v1, no vocabulário SAI da conversão acima — a
 * contraparte do teste de sanidade (executeTrace(neutralV1ToV2(v1), correctTraceFromV1(v1))
 * deve completar). Mantido AQUI para que a construção do SAI tenha uma única fonte.
 */
export function correctTraceFromV1(neutralV1) {
  return (neutralV1?.steps || []).map((s) => ({
    selection: selectionOf(s),
    action: "input",
    input: String(s.answer ?? ""),
  }));
}
