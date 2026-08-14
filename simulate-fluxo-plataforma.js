/**
 * simulate-fluxo-plataforma.js — autoria de grafo pelo FLUXO DA PLATAFORMA
 * (rodada 2 do experimento, 2026-08-14).
 *
 * Reproduz, dentro da bancada, o caminho que o EducaOFF usa para criar o grafo
 * de comportamento, usando SOMENTE peças portadas byte a byte de produção:
 *
 *   state (montado do envelope A)
 *     → agent3a_advancedStudent   (caminho correto)
 *     → agent3b_atRiskStudent     (erros; fan-out por problema, stepDiagnostics)
 *     → agent3c_averageStudent    (dicas)
 *     → extractGraphForgeConfig   (ponte de produção: traces → config)
 *     → graphForge                (determinístico, de produção)
 *
 * O que este fluxo mede é o grafo NO ESTÁGIO graphforgeNode do pipeline-v8 —
 * antes da materialização (agent6/agent7), da revisão (agent9) e do quality
 * gate com regeneração, que não existem sobre uma interface CTAT fixa. Duas
 * consequências documentadas:
 *   1. os agentes de produção NÃO recebem inventário de componentes (na
 *      plataforma a interface nasce depois) — o nível 3 (componente/ação) não
 *      se aplica a este fluxo e é reportado como tal;
 *   2. os prompts de produção pedem variáveis genéricas ({A}, {B}) porque a
 *      concretização acontece na materialização; o graphForge descarta erros
 *      com template não resolvido. Este harness CONTA esses descartes
 *      (`fidelidade.descartadosPorTemplate`) — é o gate do piloto: taxa alta
 *      significa que a bancada estaria sendo injusta com a plataforma.
 *
 * Como sempre: o robô só vê o envelope A. O envelope B jamais entra aqui.
 */

import {
  agent3a_advancedStudent,
  agent3b_atRiskStudent,
  agent3c_averageStudent,
} from "./agents3-students.js";
import { extractGraphForgeConfig, graphForge } from "./graphforge.js";
import { hasUnresolvedGraphTemplate } from "./producao/agents/behavior-graph-semantics.js";
import { isSpecificMisconceptionId } from "./step-error-catalog.js";
import { normalizeEducaoff } from "./schema.js";
import { injectStepAnswers } from "./author-graph.js";

/**
 * Constantes do corpus, CONGELADAS no pré-registro da rodada
 * (resultados/comparacao-fluxo-2026-08-14/DECLARACAO-PRE-REGISTRO.md):
 * o corpus frac-numberline-6.17 é matemática (frações na reta), faixa 8-12.
 * `discipline` sem acento de propósito (gotcha do catálogo — a normalização de
 * produção aceita acentuada, mas aqui não há UI para acentuar).
 */
export const CORPUS_STATE = Object.freeze({
  discipline: "matematica",
  topic: "frações na reta numérica",
  ageGroup: "11",
});

/**
 * Monta o `state` que o pipeline-v8 entrega aos agents3 — a partir do envelope
 * A, como o desenho do experimento exige: mesmo problema, mesmo enunciado,
 * mesmos KCs do pacote CTAT. `agent2_seed` não roda (o problema é fixo por
 * premissa); o problema do exercício É a semente.
 */
export function buildStateFromEnvelopeA(envelopeA, { exerciseId } = {}) {
  return {
    ...CORPUS_STATE,
    difficulty: envelopeA.difficulty || "medium",
    interfaceSpec: { profile: envelopeA.profile || "reader" },
    seedProblems: [
      {
        problemId: exerciseId || envelopeA.id || 1,
        statement: envelopeA.problem,
        correctAnswer: envelopeA.correctAnswer,
      },
    ],
    knowledgeComponents: envelopeA.knowledgeComponents || [],
    sessionId: null,
    numProblems: 1,
    description: "",
  };
}

/** Achata os stepDiagnostics do 3b num formato de enriquecimento do registro. */
function flattenStepDiagnostics(atRiskTrace) {
  const out = [];
  for (const sol of atRiskTrace?.solutions || []) {
    for (const block of sol.stepDiagnostics || []) {
      for (const err of block.errors || []) {
        out.push({
          step: block.step ?? null,
          id: err.misconceptionId,
          wrongAnswer: err.wrongAnswerPattern,
          buggyRule: err.buggyRule || "",
          description: err.description || "",
          feedback: err.feedback || err.howToFix || "",
          selection: "", // neste fluxo os agentes não veem componentes (ver cabeçalho)
          action: "",
        });
      }
    }
  }
  return out;
}

/** Dicas do 3c no formato {step, text} usado pelo registro (grafo.dicas). */
function flattenHints(averageTrace) {
  const hints = [];
  for (const sol of averageTrace?.solutions || []) {
    for (const t of sol.solutionTrace || []) {
      for (const h of t.hintsNeeded || []) {
        hints.push({ step: t.step || 1, text: h.message || "" });
      }
    }
  }
  return hints;
}

/**
 * Estatísticas de fidelidade do estágio: quantos erros específicos o 3b
 * produziu, quantos entraram no grafo, e quantos o graphForge descartou por
 * template não resolvido (o que na plataforma seria concretizado depois).
 */
function fidelidadeDoEstagio(atRiskTrace, graph) {
  const doModelo = [];
  for (const sol of atRiskTrace?.solutions || []) {
    for (const attempt of sol.attempts || []) {
      for (const t of attempt.solutionTrace || []) {
        if (t.isCorrect === false && t.error?.misconceptionId) {
          doModelo.push({
            id: String(t.error.misconceptionId),
            wrongAnswer: String(t.error.wrongAnswer ?? t.result ?? ""),
          });
        }
      }
    }
  }
  const especificos = doModelo.filter((e) => isSpecificMisconceptionId(e.id));
  const comTemplate = especificos.filter(
    (e) => hasUnresolvedGraphTemplate(e.id) || hasUnresolvedGraphTemplate(e.wrongAnswer)
  );
  let noGrafo = 0;
  for (const n of graph?.nodes || []) {
    if (n.type === "step") noGrafo += (n.misconceptions || []).length;
  }
  return {
    errosDoModelo: doModelo.length,
    errosEspecificos: especificos.length,
    descartadosPorTemplate: comTemplate.length,
    errosNoGrafo: noGrafo,
  };
}

/**
 * Autora o grafo pelo fluxo da plataforma. Mesma forma de retorno do
 * authorFromEnvelopeA ({graph, neutral, traces, ...}), para o coletor tratar
 * os dois fluxos por igual.
 *
 * Os três agentes rodam em SEQUÊNCIA (3a → 3b → 3c), como nós do pipeline —
 * e isso mantém o fatiamento do manifesto por run determinístico.
 */
export async function authorFluxoPlataforma(envelopeA, opts = {}) {
  const state = buildStateFromEnvelopeA(envelopeA, opts);

  const { advancedTrace } = await agent3a_advancedStudent(state);
  const { atRiskTrace } = await agent3b_atRiskStudent(state);
  const { averageTrace } = await agent3c_averageStudent(state);

  const stateFull = { ...state, advancedTrace, atRiskTrace, averageTrace };
  const config = await extractGraphForgeConfig(stateFull);
  const { graph } = graphForge(config);
  // Mesma substituição documentada do lock pós-UI da avaliação (author-graph.js):
  // sem a UI da plataforma, a resposta concreta do aluno avançado vai ao nó.
  injectStepAnswers(graph, config);
  const neutral = normalizeEducaoff(graph, { source: "robo" });

  const traces = {
    correctPath: (config.steps || []).map((s) => ({
      kc: s.kc,
      action: s.action,
      result: s.result,
    })),
    misconceptions: flattenStepDiagnostics(atRiskTrace),
    hints: flattenHints(averageTrace),
  };

  return {
    graph,
    neutral,
    traces,
    tracesCompletos: { advancedTrace, atRiskTrace, averageTrace },
    fidelidade: fidelidadeDoEstagio(atRiskTrace, graph),
  };
}
