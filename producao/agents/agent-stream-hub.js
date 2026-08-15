/**
 * producao/agents/agent-stream-hub.js — ADAPTADOR (port da materialização,
 * 2026-08-15). Em produção este módulo publica eventos SSE por sessão para a
 * UI de agentes. Na bancada não há sessão nem UI: o logger de agente vira
 * no-op com a MESMA interface usada por agent6-story e agent7-adapter
 * (createAgentLogger(sessionId, agentName) → { log, warn, error, info, debug,
 * ... }). Nenhum agente é editado; quem cede é este adaptador.
 */
const noop = () => {};
export function createAgentLogger() {
  return new Proxy(
    {},
    { get: () => noop }
  );
}
export function publishAgentEvent() {}
export function getAgentStreamHub() {
  return { publish: noop, subscribe: noop, close: noop };
}
export default { createAgentLogger, publishAgentEvent, getAgentStreamHub };
