/**
 * bkt-core.js — Núcleo do update Bayesian Knowledge Tracing (Corbett & Anderson 1995).
 *
 * Fórmula ÚNICA para o update bayesiano P(L) a partir de uma resposta
 * correct/incorrect. Usada por todo ponto do backend que agrega mastery em
 * lote a partir de uma lista de interações.
 *
 * 2026-08-06 (auditoria inner/outer loop, Tier 2.9): a mesma fórmula estava
 * reimplementada à mão em pelo menos 4 lugares do backend —
 * lib/student-profile.js, routes/tutor/sti-adaptive.js, e DUAS vezes dentro
 * de routes/student/student-analytics.js (/mastery e /mastery-detail) —
 * todas com os mesmos defaults (pL0=0.15, pT=0.15, pG=0.15, pS=0.1) copiados
 * à mão. Uma delas (/mastery-detail) tinha perdido a guarda de divisão por
 * zero E o clamp [0,1] que as outras 3 têm — bug real corrigido de graça por
 * esta unificação.
 *
 * NÃO inclui o frontend (frontend/src/lib/bkt.js, BktEngine) de propósito:
 * roda no browser, é módulo separado sem build compartilhado com o backend, e
 * é deliberadamente MAIS rico (forget rate, ajuste por hints/tentativas)
 * porque serve o inner loop em tempo real — não a mesma coisa que estas 4
 * rotas fazem (agregação em lote pós-hoc a partir de `interactions`).
 */

export const BKT_DEFAULT_PARAMS = Object.freeze({ pL0: 0.15, pT: 0.15, pG: 0.15, pS: 0.1 });

/**
 * Um passo de update bayesiano. Retorna o novo P(L), sempre clampado em [0,1].
 *
 * @param {number} priorPL - P(L) antes desta observação.
 * @param {boolean} correct - a resposta foi certa?
 * @param {{pT?:number, pG?:number, pS?:number}} [params] - sobrescreve defaults.
 */
export function bktPosterior(priorPL, correct, params) {
  const { pT, pG, pS } = { ...BKT_DEFAULT_PARAMS, ...params };
  const pCorrect = priorPL * (1 - pS) + (1 - priorPL) * pG;
  let post;
  if (correct) {
    post = pCorrect > 1e-9 ? (priorPL * (1 - pS)) / pCorrect : priorPL;
  } else {
    post = 1 - pCorrect > 1e-9 ? (priorPL * pS) / (1 - pCorrect) : priorPL;
  }
  return Math.max(0, Math.min(1, post + (1 - post) * pT));
}
