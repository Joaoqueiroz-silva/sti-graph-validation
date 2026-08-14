/**
 * producao/lib/logger.js — ADAPTADOR do port 2026-08 (docs/PLANO-PORT-AGENTES-2026-08.md §3).
 *
 * Em produção, `backend/lib/logger.js` é um pino configurado. Aqui o mesmo
 * caminho relativo (`../lib/logger.js` visto de producao/agents/) entrega o
 * logger mínimo do experimento — mesma interface { info, debug, warn, error }.
 * Os arquivos de produção em producao/ ficam byte a byte; quem cede é este
 * adaptador, nunca o agente.
 */
export { logger } from "../../logger.js";
