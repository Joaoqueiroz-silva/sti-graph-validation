/**
 * diagnostics/step-error-catalog.js — destino do port
 * (docs/PLANO-PORT-AGENTES-2026-08.md §2). O arquivo byte a byte de produção
 * vive em producao/agents/diagnostics/ (os imports relativos dele —
 * ../behavior-graph-semantics.js e ../../lib/text-normalize.js — resolvem
 * dentro do espelho producao/).
 */
export * from "../producao/agents/diagnostics/step-error-catalog.js";
