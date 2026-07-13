/**
 * trace-executor.js — example-tracer MÍNIMO e determinístico sobre o schema neutro v2.
 *
 * Executa um traço de interações de aluno contra um grafo v2 (schema-v2.js) e devolve
 * o veredito passo a passo — é a prova de que o v2 representa COMPORTAMENTO (gate G5),
 * não só estrutura: dado o mesmo grafo e o mesmo traço, o resultado é sempre o mesmo.
 *
 * Semântica (deliberadamente mínima — sem EdgesGroups/min-maxTraversals, que estão em
 * unsupportedConstructs do v2):
 *   - estado corrente começa em graphV2.startState;
 *   - passo SAI: procura transição saindo do estado corrente com MESMA selection+action
 *     (comparação exata após trim) e input casando conforme o matchRule da transição:
 *       exact    = string idêntica após trim;
 *       semantic = mesma canonAnswer de schema.js (equivalência de fração/decimal:
 *                  "2/8" ≡ "1/4" ≡ "0.25" — espelha o ExpressionMatcher/algEval do CTAT);
 *   - match correct → verdict "correct" (+ feedback de sucesso, se houver) e avança para .to;
 *   - match buggy   → verdict "buggy" + feedback; PERMANECE no estado (comportamento padrão
 *     do example-tracing: erro não avança), salvo opts.followRemediation quando a transição
 *     buggy tem destino de remediação (to definido e ≠ estado corrente);
 *   - sem match → verdict "no-match", permanece;
 *   - { hintRequest: true } → verdict "hint" + hints[] das transições CORRETAS que saem do
 *     estado corrente (na ordem do grafo; [] quando não existirem).
 *
 * 2026-07-12 (Onda 2): decisões registradas —
 *   - prioridade de match correct > buggy (o example-tracer do CTAT tenta o caminho correto
 *     antes de marcar erro); dentro da mesma classe, a ordem das transições no grafo decide
 *     (determinismo por construção).
 *   - transições type "unknown" NÃO são casáveis: semântica não declarada no .brd; um
 *     executor determinístico não adivinha (o corpus 6.17 não tem nenhuma — é defesa).
 */

import { canonAnswer } from "./schema.js";

const trimmed = (v) => String(v ?? "").trim();

/** selection+action casam por igualdade exata após trim. */
function saiHeadMatches(t, ev) {
  return trimmed(t.sai?.selection) === trimmed(ev.selection) && trimmed(t.sai?.action) === trimmed(ev.action);
}

/** input casa conforme o matchRule DA TRANSIÇÃO (default exact). */
function inputMatches(t, ev) {
  if (t.matchRule === "semantic") return canonAnswer(ev.input) === canonAnswer(t.sai?.input);
  return trimmed(ev.input) === trimmed(t.sai?.input);
}

/**
 * executeTrace(graphV2, trace, opts) → { steps[], completed, endState }
 *   trace = [{ selection, action, input } | { hintRequest: true }, ...]
 *   steps[i] = { verdict: "correct"|"buggy"|"no-match"|"hint", feedback?, hints?, transitionId? }
 *   opts.followRemediation (default false): em match buggy com destino de remediação, segue .to.
 */
export function executeTrace(graphV2, trace, opts = {}) {
  if (!graphV2 || graphV2.schemaVersion !== 2) {
    throw new Error("executeTrace: esperado grafo no schema neutro v2 (schemaVersion 2)");
  }
  const { followRemediation = false } = opts;
  const finals = new Set(graphV2.finalStates || []);

  // Índice from → transições NA ORDEM do grafo (determinismo do desempate).
  const outgoing = new Map();
  for (const t of graphV2.transitions || []) {
    if (!outgoing.has(t.from)) outgoing.set(t.from, []);
    outgoing.get(t.from).push(t);
  }

  let state = graphV2.startState;
  const steps = [];

  for (const ev of trace || []) {
    const outs = outgoing.get(state) || [];

    if (ev && ev.hintRequest) {
      const hints = outs.filter((t) => t.type === "correct").flatMap((t) => t.hints || []);
      steps.push({ verdict: "hint", hints });
      continue;
    }

    const candidates = outs.filter(
      (t) => (t.type === "correct" || t.type === "buggy") && saiHeadMatches(t, ev) && inputMatches(t, ev)
    );
    const match = candidates.find((t) => t.type === "correct") || candidates[0];

    if (!match) {
      steps.push({ verdict: "no-match" });
      continue;
    }

    if (match.type === "buggy") {
      const step = { verdict: "buggy", transitionId: match.id };
      if (match.feedback?.buggyMessage) step.feedback = match.feedback.buggyMessage;
      steps.push(step);
      if (followRemediation && match.to && match.to !== state) state = match.to;
      continue;
    }

    const step = { verdict: "correct", transitionId: match.id };
    if (match.feedback?.successMessage) step.feedback = match.feedback.successMessage;
    steps.push(step);
    if (match.to) state = match.to;
  }

  return { steps, completed: finals.has(state), endState: state };
}
