/**
 * evaluation/author-from-ctat.js — O robô autora o grafo CEGO a partir de um `.brd`.
 *
 * Costura as peças do experimento de validação (handoff, Tarefa 3):
 *   1. parseBrdToRobotInput(brd) → Envelope A (interface + enunciado + resposta + KCs). SÓ ISSO.
 *   2. simulateStudents(A)       → traces (restritos aos componentes de A).
 *   3. authorGraphForInterface(A, traces) → grafo do robô (formato EducaOFF).
 *   4. normalizeEducaoff(graph)  → grafo do robô em esquema NEUTRO (pronto p/ comparar).
 *
 * ⚠️ ANTI-CONTAMINAÇÃO (Regra 1 do handoff): esta função JAMAIS lê o Envelope B.
 *   Ela só chama `parseBrdToRobotInput` (Envelope A) — nunca `parseBrdToExpertNeutral`.
 *   O grafo do especialista entra no fluxo apenas no comparador (run-ctat-eval), nunca aqui.
 *
 * `opts.simulate` permite injetar um simulador (testes offline, sem LLM); o default é o real.
 */

import { parseBrdToRobotInput } from "./parse-ctat-brd.js";
import { buildEnvelopeA2 } from "./interface-input.js";
import { simulateStudents } from "./simulate-students.js";
import { authorGraphForInterface } from "./author-graph.js";
import { normalizeEducaoff } from "./schema.js";

/**
 * @param {string} brdXml  conteúdo do expert.brd
 * @param {{ html?:string, renderedFacts?:object, simulate?:Function, profile?:string,
 *           difficulty?:string, sessionId?:string, screenshotPath?:string }} opts
 *   `renderedFacts`: interface RENDERIZADA reconstruída do template mass-production
 *   (interface-reconstruction.js) — flui para o inventário do simulador (Fase B).
 * @returns {Promise<{ neutral:object, graph:object, envelopeA:object, traces:object }>}
 */
export async function authorFromBrd(brdXml, opts = {}) {
  // Envelope A — a ÚNICA coisa que o robô pode ver (extraída do .brd).
  const envelopeA = parseBrdToRobotInput(brdXml, opts);
  return authorFromEnvelopeA(envelopeA, opts);
}

/**
 * 2026-07-12 (W1/G4): autoria a partir da FONTE INDEPENDENTE do grafo — o Envelope A v2
 * vem de interface-input.js (interface.html + answer-key da mass production), NUNCA do
 * `.brd` do especialista. É o caminho que responde ao parecer externo (entrada dos
 * agentes não pode derivar do mesmo arquivo que contém o grafo-gold). O caminho legado
 * `authorFromBrd` permanece intocado para reproduzir a tag `legacy-campaigns-2026-07`.
 *
 * @param {string} exerciseId  ex.: "01watermelon"
 * @param {{ interfaceDir?:string, answerKeyPath?:string, simulate?:Function,
 *           sessionId?:string, screenshotPath?:string }} opts
 * @returns {Promise<{ neutral:object, graph:object, envelopeA:object, traces:object }>}
 */
export async function authorFromInterface(exerciseId, opts = {}) {
  const envelopeA = buildEnvelopeA2({
    exerciseId,
    interfaceDir: opts.interfaceDir,
    answerKeyPath: opts.answerKeyPath,
  });
  return authorFromEnvelopeA(envelopeA, opts);
}

/**
 * Autora o grafo a partir de um Envelope A JÁ PRONTO (ex.: `envelope-a.json` do dataset).
 * É como os agentes consomem a base de dados materializada — sem reparsear o `.brd`.
 * @param {object} envelopeA  { problem, components, correctAnswer, knowledgeComponents }
 * @param {{ simulate?:Function, screenshotPath?:string, sessionId?:string,
 *           renderedFacts?:object }} opts
 * @returns {Promise<{ neutral:object, graph:object, envelopeA:object, traces:object }>}
 */
export async function authorFromEnvelopeA(envelopeA, opts = {}) {
  const simulate = opts.simulate || simulateStudents;
  const A = opts.screenshotPath ? { ...envelopeA, screenshotPath: opts.screenshotPath } : envelopeA;

  const traces = await simulate(A, opts);
  const graph = authorGraphForInterface(A, traces); // já retorna o grafo (não {graph})
  const neutral = normalizeEducaoff(graph, { source: "robo" });

  return { neutral, graph, envelopeA: A, traces };
}
