/**
 * producao/agents/pipeline-core.js — ADAPTADOR do port 2026-08
 * (docs/PLANO-PORT-AGENTES-2026-08.md §3-§4).
 *
 * Os agentes portados em producao/ importam `../pipeline-core.js` byte a byte
 * como em produção. Aqui, createLLM/callLLM/extractJson vêm do cliente do
 * experimento (llm.js: OpenRouter + manifesto de execução + trava de
 * orçamento), e getAgentConfig é O PONTO onde o modelo de cada agente é
 * resolvido conforme docs/CONFIGURACAO-MODELOS.md — sem tocar nos agentes.
 *
 * O mapa papel→agente vem do levantamento do pipeline de produção
 * (sti-unplugged origin/main b7ae8780; registry em backend/agents/config/):
 *   dominio         agent1_domain
 *   materializacao  agent6_story, agent6_worker
 *   estudantes      agent3a_advanced, agent3b_atrisk, agent3c_average
 *   revisao         agent9_review
 *   checagem        factchecker_l2
 *
 * Temperatura e maxTokens por agente reproduzem os DEFAULTS do registry de
 * produção (backend/agents/config/registry/{phase1,phase2,post-pipeline}.js) —
 * a configuração de modelos troca só o MODELO, que é o fator do experimento;
 * segurar temperatura/teto iguais entre braços é a regra §4.1 da doc.
 */

import { createLLM, callLLM, extractJson } from "../../llm.js";
import { resolverModelos, AGENTES } from "../../config/resolver-modelos.js";

export { createLLM, callLLM, extractJson };

/** papel de cada chave de agente de produção no pipeline de geração. */
export const PAPEL_POR_AGENTE = Object.freeze({
  agent1_domain: "dominio",
  agent6_story: "materializacao",
  agent6_worker: "materializacao",
  agent3a_advanced: "estudantes",
  agent3b_atrisk: "estudantes",
  agent3c_average: "estudantes",
  agent9_review: "revisao",
  factchecker_l2: "checagem",
});

/** defaults do registry de produção (temperatura/maxTokens por agente). */
const DEFAULTS = Object.freeze({
  agent1_domain: { temperature: 0.3, maxTokens: 24000 },
  agent6_story: { temperature: 0.5, maxTokens: 24000 },
  agent6_worker: { temperature: 0.35, maxTokens: 16000 },
  agent3a_advanced: { temperature: 0.2, maxTokens: 16000 },
  agent3b_atrisk: { temperature: 0.7, maxTokens: 24000 },
  agent3c_average: { temperature: 0.4, maxTokens: 16000 },
  agent9_review: { temperature: 0.1, maxTokens: 32000 },
  factchecker_l2: { temperature: 0.1, maxTokens: 16000 },
});

// Resolvido UMA vez por processo: a configuração de um braço não muda no meio
// de uma coleta (docs/CONFIGURACAO-MODELOS.md §4.1 — segure tudo o mais).
let _resolvido = null;

/** Mapa resolvido { papel → modelo } desta execução (vai para o registro). */
export function modelosResolvidos() {
  if (!_resolvido) _resolvido = resolverModelos();
  return _resolvido;
}

/** Só para testes: força nova resolução com fontes explícitas. */
export function _resetModelosResolvidos(opts) {
  _resolvido = opts ? resolverModelos(opts) : null;
  return _resolvido;
}

/**
 * Config efetiva de um agente portado (assinatura do pipeline-core do backend).
 * @param {string} agentKey ex.: "agent3b_atrisk"
 * @param {object} stateOverrides provider/model/temperature/maxTokens opcionais
 */
export function getAgentConfig(agentKey, stateOverrides = {}) {
  const papel = PAPEL_POR_AGENTE[agentKey];
  if (!papel) {
    throw new Error(
      `[pipeline-core adapter] Unknown agent key: ${agentKey} (conhecidos: ${Object.keys(PAPEL_POR_AGENTE).join(", ")})`
    );
  }
  const base = DEFAULTS[agentKey];
  const resolvido = modelosResolvidos();
  return {
    provider: resolvido.provedor,
    model: resolvido.porAgente[papel],
    temperature: base.temperature,
    maxTokens: base.maxTokens,
    papel,
    agentKey,
    key: agentKey, // compat com o getAgentConfig histórico do llm.js
    ...(stateOverrides.provider ? { provider: stateOverrides.provider } : {}),
    ...(stateOverrides.model ? { model: stateOverrides.model } : {}),
    ...(Number.isFinite(stateOverrides.temperature)
      ? { temperature: stateOverrides.temperature }
      : {}),
    ...(Number.isFinite(stateOverrides.maxTokens) ? { maxTokens: stateOverrides.maxTokens } : {}),
  };
}

export { AGENTES };
