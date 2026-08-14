/**
 * step-error-catalog.js — reexport da raiz (port 2026-08,
 * docs/PLANO-PORT-AGENTES-2026-08.md §3: "mover para diagnostics/ e deixar um
 * reexport na raiz").
 *
 * Até o port, este arquivo era um EXCERTO (só a gramática de id e os prefixos
 * genéricos). Agora o módulo COMPLETO de produção — byte a byte igual a
 * `sti-unplugged:backend/agents/diagnostics/step-error-catalog.js` — vive em
 * producao/agents/diagnostics/, e diagnostics/step-error-catalog.js é o
 * destino declarado no plano. Os símbolos do excerto (GENERIC_MISC_ID_RE,
 * MISC_ID_GRAMMAR_RE, isSpecificMisconceptionId) continuam exportados com os
 * MESMOS valores — a régua é intocável.
 */
export * from "./diagnostics/step-error-catalog.js";
