/**
 * evaluation/trace-answer.js — Teste FUNCIONAL do grafo (example-tracing em miniatura).
 *
 * Dada uma resposta de aluno, percorre o grafo e diz como o tutor reagiria:
 *   - "correto"        → bate com uma resposta correta
 *   - "erro-previsto"  → bate com uma misconception (devolve a dica/feedback)
 *   - "surpresa"       → o grafo não previu (fall-off) — sinal de cobertura incompleta
 *
 * É o que torna "testar o STI" concreto: você joga respostas e vê o tutor agir.
 * Puro/determinístico (sem LLM).
 */

import { canon } from "./schema.js";

/** Número no início da string (tolera vírgula decimal e unidade): "1,62 ml" → 1.62. */
function toNum(s) {
  const t = String(s ?? "")
    .trim()
    .replace(",", ".");
  const m = t.match(/^-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

/** Igualdade tolerante: numérica quando ambos são números, senão canônica. */
export function answerMatches(a, b) {
  const na = toNum(a);
  const nb = toNum(b);
  if (na !== null && nb !== null) return Math.abs(na - nb) <= 1e-6;
  const ca = canon(a);
  return ca !== "" && ca === canon(b);
}

/** Extrai do grafo o "gabarito": respostas corretas + erros previstos (com feedback). */
export function buildAnswerKey(graph, opts = {}) {
  const correct = (opts.correctAnswers || []).map(String).filter((s) => s !== "");
  const wrong = [];
  for (const n of graph?.nodes || []) {
    if (n.type !== "step") continue;
    for (const m of n.misconceptions || []) {
      if (m.wrongAnswer != null && String(m.wrongAnswer) !== "") {
        wrong.push({ wrongAnswer: String(m.wrongAnswer), feedback: m.feedback || "", step: n.id });
      }
    }
  }
  return { correct, wrong };
}

/**
 * Classifica cada resposta de aluno contra o grafo.
 * @param {object} graph  behaviorGraph (nodes/edges)
 * @param {string[]} answers  respostas digitadas
 * @param {{correctAnswers?: string[]}} opts
 */
export function traceStudentAnswers(graph, answers, opts = {}) {
  const key = buildAnswerKey(graph, opts);
  return (answers || []).map((ans) => {
    const hit = key.wrong.find((w) => answerMatches(w.wrongAnswer, ans));
    if (hit)
      return { answer: ans, verdict: "erro-previsto", feedback: hit.feedback, step: hit.step };
    if (key.correct.some((c) => answerMatches(c, ans))) return { answer: ans, verdict: "correto" };
    return { answer: ans, verdict: "surpresa" };
  });
}
