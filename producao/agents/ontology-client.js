/**
 * producao/agents/ontology-client.js — ADAPTADOR do port 2026-08
 * (docs/PLANO-PORT-AGENTES-2026-08.md §3).
 *
 * Em produção, `ontology-client.js` consulta o serviço de ontologia (SPARQL)
 * e cai para vazio quando ele está fora do ar. O experimento é OFFLINE por
 * regra: o stub da raiz devolve exatamente o mesmo formato do caminho de
 * fallback de produção (arrays vazios), que é também o comportamento efetivo
 * quando o serviço não responde. Assinaturas idênticas às três funções que o
 * graphforge.js de produção importa.
 */
export { getPrerequisites, getRelationships, getMisconceptions } from "../../ontology-stub.js";
