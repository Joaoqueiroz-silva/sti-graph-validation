/**
 * Parser da referencia CTAT da Campanha 4, criado antes das saidas reais e que
 * deve ser APLICADO somente depois do congelamento das saidas brutas. Ele
 * preserva o grafo neutro v2 original (estados e SAI) e acrescenta apenas
 * vistas derivadas, deterministicas e auditaveis.
 *
 * Importante: `step` emitido pelos Agents3 nao e um ID de estado CTAT. Por isso
 * a unica ligacao oferecida aqui e `sourceContentOrdinal`, explicitamente
 * rotulada como crosswalk ordinal. Ela serve a analises de sensibilidade e nao
 * transforma o passo do agente em estado observado.
 */

import { canonAnswer, canon } from "../schema.js";
import { parseBrdToNeutralV2 } from "../schema-v2.js";

export const C4_CTAT_REFERENCE_VERSION = "educaoff-campaign4-ctat-reference-v2";
export const C4_CTAT_ACTION_POLICY_VERSION = "ctat-6.17-content-filter-v2";

const asText = (value) => String(value ?? "").trim();

function isStudentActor(actor) {
  const key = canon(actor);
  return key === "student" || key.startsWith("student") || key === "aluno" || key.startsWith("aluno");
}

/**
 * Politica mecanica explicita e corpus-especifica.
 *
 * - Atores nao-estudantes sao excluidos por escopo, nao classificados como erro
 *   mecanico de estudante.
 * - Para acoes buggy do tutor CTAT 6.17, os inputs vazio, "-" e "-1" sao
 *   sentinelas de interacao do widget.
 * - No caminho correto, o clique final `done/ButtonPressed/-1` e controle de
 *   conclusao, nao conteudo matematico.
 *
 * Nenhuma regra usa somente o nome do estado; a decisao fica reproduzivel pela
 * tripla SAI, tipo e ator preservados.
 */
export function classifyCtatActionForCampaign4(transition) {
  const sai = transition?.sai || {};
  const input = asText(sai.input);
  const selection = canon(sai.selection);
  const action = canon(sai.action);
  const studentActor = isStudentActor(transition?.actor);
  const exclusionReasons = [];
  const mechanicalReasons = [];

  if (!studentActor) exclusionReasons.push("non_student_actor");

  if (transition?.type === "buggy") {
    if (input === "") mechanicalReasons.push("blank_input_sentinel");
    else if (input === "-") mechanicalReasons.push("dash_input_sentinel");
    else if (input === "-1") mechanicalReasons.push("minus_one_interface_sentinel");
  } else if (
    input === "-1" &&
    (/done|conclu/.test(selection) || /buttonpressed|press|click/.test(action))
  ) {
    mechanicalReasons.push("completion_control_sentinel");
  }

  if (mechanicalReasons.length) exclusionReasons.push(...mechanicalReasons);
  const comparableType = transition?.type === "buggy" || transition?.type === "correct";

  return {
    policyVersion: C4_CTAT_ACTION_POLICY_VERSION,
    actorClass: studentActor ? "student" : "non_student",
    mechanical: mechanicalReasons.length > 0,
    mechanicalReasons,
    comparable: comparableType && studentActor && mechanicalReasons.length === 0,
    exclusionReasons,
  };
}

function orderCorrectTransitions(graph) {
  const correct = (graph?.transitions || []).filter((transition) => transition.type !== "buggy");
  if (correct.length <= 1) return correct.slice();

  const sourceOrder = new Map();
  for (const transition of correct) {
    if (!sourceOrder.has(transition.from)) sourceOrder.set(transition.from, []);
    sourceOrder.get(transition.from).push(transition);
  }

  const ordered = [];
  const used = new Set();
  const visitedStates = new Set();
  let state = graph.startState;
  while (state != null && !visitedStates.has(state)) {
    visitedStates.add(state);
    const next = (sourceOrder.get(state) || []).find((transition) => !used.has(transition.id));
    if (!next) break;
    used.add(next.id);
    ordered.push(next);
    state = next.to;
  }
  for (const transition of correct) {
    if (!used.has(transition.id)) ordered.push(transition);
  }
  return ordered;
}

function actionView(transition, extra = {}) {
  const classification = classifyCtatActionForCampaign4(transition);
  return {
    transitionId: transition.id,
    sourceStateId: transition.from,
    destinationStateId: transition.to,
    sai: {
      selection: asText(transition?.sai?.selection),
      action: asText(transition?.sai?.action),
      input: asText(transition?.sai?.input),
    },
    inputKey: canonAnswer(transition?.sai?.input),
    type: transition.type,
    actor: transition.actor,
    matchRule: transition.matchRule,
    hints: Array.isArray(transition.hints) ? transition.hints.slice() : [],
    kcs: Array.isArray(transition.kcs) ? transition.kcs.slice() : [],
    feedback: transition.feedback == null ? null : structuredClone(transition.feedback),
    classification,
    ...extra,
  };
}

/**
 * Converte um expert.brd em referencia C4 v2. O `graph` retornado e o schema
 * neutro v2 sem reducao; as vistas `correctPath` e `buggyActions` nunca removem
 * silenciosamente uma transicao: itens excluidos permanecem em `all` e recebem
 * motivo versionado.
 */
export function parseCtatReferenceV2(brdXml, meta = {}) {
  const graph = parseBrdToNeutralV2(brdXml, meta);
  const orderedCorrect = orderCorrectTransitions(graph);
  const correctAll = orderedCorrect.map((transition, index) =>
    actionView(transition, { correctPathOrdinal: index + 1 })
  );
  const correctComparable = correctAll
    .filter((item) => item.classification.comparable)
    .map((item, index) => ({ ...item, contentOrdinal: index + 1 }));

  const ordinalBySourceState = new Map(
    correctComparable.map((item) => [String(item.sourceStateId), item.contentOrdinal])
  );
  const buggyAll = graph.transitions
    .filter((transition) => transition.type === "buggy")
    .map((transition) =>
      actionView(transition, {
        sourceContentOrdinal: ordinalBySourceState.get(String(transition.from)) ?? null,
      })
    );
  const buggyComparable = buggyAll.filter((item) => item.classification.comparable);

  const mechanicalCorrect = correctAll.filter((item) => item.classification.mechanical);
  const mechanicalBuggy = buggyAll.filter((item) => item.classification.mechanical);
  const compoundSentinelCandidates = buggyComparable.filter((item) =>
    /^-\s*\/\s*\d+$/.test(item.sai.input)
  );
  const excludedNonStudentCorrect = correctAll.filter(
    (item) => item.classification.actorClass !== "student"
  );

  return {
    schemaVersion: C4_CTAT_REFERENCE_VERSION,
    problemId: meta.problemId ?? meta.case ?? meta.exercise ?? null,
    graph,
    filterPolicy: {
      version: C4_CTAT_ACTION_POLICY_VERSION,
      scope: "CTAT frac-numberline 6.17; nao generalizar sentinelas a outros widgets sem nova emenda",
      comparableCorrect:
        "type=correct, actor=Student e nao completion_control_sentinel",
      comparableBuggy:
        "type=buggy, actor=Student e input diferente das sentinelas exatas '', '-' e '-1'",
      nonStudentTreatment: "excluido por escopo; nao contado como erro mecanico do estudante",
      stateCrosswalk:
        "sourceContentOrdinal e a ordem do passo correto de conteudo que sai do mesmo estado CTAT; e proxy ordinal, nao equivalencia de estado com o passo do agente",
      sensitivityOnly:
        "inputs compostos do tipo '-/D' permanecem comparaveis na regra primaria; compound_missing_numerator_v1 os exclui somente em sensibilidade declarada",
    },
    correctPath: {
      all: correctAll,
      comparable: correctComparable,
      mechanical: mechanicalCorrect,
      excludedNonStudent: excludedNonStudentCorrect,
    },
    buggyActions: {
      all: buggyAll,
      comparable: buggyComparable,
      mechanical: mechanicalBuggy,
      sensitivityCompoundSentinelCandidates: compoundSentinelCandidates,
    },
    stateOrdinalCrosswalk: correctComparable.map((item) => ({
      contentOrdinal: item.contentOrdinal,
      sourceStateId: item.sourceStateId,
      destinationStateId: item.destinationStateId,
      transitionId: item.transitionId,
      sai: structuredClone(item.sai),
    })),
    counts: {
      states: graph.states.length,
      transitions: graph.transitions.length,
      correctAll: correctAll.length,
      correctComparable: correctComparable.length,
      correctMechanical: mechanicalCorrect.length,
      correctNonStudent: excludedNonStudentCorrect.length,
      buggyAll: buggyAll.length,
      buggyComparable: buggyComparable.length,
      buggyMechanical: mechanicalBuggy.length,
      buggyCompoundSentinelCandidates: compoundSentinelCandidates.length,
      buggyWithoutOrdinalCrosswalk: buggyComparable.filter(
        (item) => item.sourceContentOrdinal == null
      ).length,
    },
  };
}

export function assertCtatReferenceV2(reference) {
  if (reference?.schemaVersion !== C4_CTAT_REFERENCE_VERSION) {
    throw new Error(`Referencia CTAT invalida: esperado ${C4_CTAT_REFERENCE_VERSION}`);
  }
  if (reference?.graph?.schemaVersion !== 2) {
    throw new Error("Referencia CTAT invalida: graph deve preservar schema neutro v2");
  }
  if (!Array.isArray(reference?.correctPath?.comparable)) {
    throw new Error("Referencia CTAT invalida: correctPath.comparable ausente");
  }
  if (!Array.isArray(reference?.buggyActions?.comparable)) {
    throw new Error("Referencia CTAT invalida: buggyActions.comparable ausente");
  }
  return reference;
}
