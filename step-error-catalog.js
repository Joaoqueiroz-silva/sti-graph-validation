/**
 * step-error-catalog.js — a RÉGUA de ids de misconception da PR #27 (excerto).
 *
 * 2026-07-19 (Campanha 5, adaptação standalone): no monorepo EducaOFF a fonte
 * única destas constantes é `backend/agents/diagnostics/step-error-catalog.js`
 * (módulo puro, spec docs/DIAGNOSTICO-AUTOSSUFICIENTE-2026-07-18.md §1). O
 * módulo completo puxa `behavior-graph-semantics.js` e `lib/text-normalize.js`,
 * que não existem neste pacote de reprodução — por isso este arquivo carrega
 * APENAS o que a avaliação usa (mesma estratégia do `misconceptions-db.js`
 * local): a gramática de id e os prefixos genéricos reservados, copiados
 * byte a byte do original. Se a régua mudar lá, este excerto deve mudar junto
 * — o teste simulate-sem-teto.test.mjs trava os valores.
 *
 * A régua é INTOCÁVEL: distrator sintético/genérico NUNCA conta como
 * diagnóstico específico.
 */

// Prefixos reservados que a PR #27 conta como genéricos — NUNCA usar em id específico.
export const GENERIC_MISC_ID_RE = /^misc_(generic|unclassified|numeric_near|text_confusion)(_|$)/;
export const MISC_ID_GRAMMAR_RE = /^[A-Za-z0-9_.:-]+$/;

const str = (value) => String(value ?? "").trim();

/** id específico bem-formado: gramática ok E fora dos prefixos genéricos reservados. */
export function isSpecificMisconceptionId(id) {
  const candidate = str(id);
  return (
    candidate.length > 0 &&
    MISC_ID_GRAMMAR_RE.test(candidate) &&
    !GENERIC_MISC_ID_RE.test(candidate)
  );
}
