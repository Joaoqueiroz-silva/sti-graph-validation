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
import { extractGraphForgeConfig, graphForge, resolveGraphForgeStepPlan } from "./graphforge.js";
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
 * MODO PASSOS-LIVRES (2026-08-14, decisão do pesquisador): em produção o
 * GraphForge CORTA a espinha dorsal pela topologia do perfil (reader/medium =
 * 4 passos; teto absoluto 12 mesmo com pedido do professor) — ver
 * resolveGraphForgeStepPlan. Isso responde a uma pergunta de PRODUTO
 * (adequação à faixa etária), mas esconde a pergunta do EXPERIMENTO: quantos
 * passos e estados os agentes de IA geram DE FATO quando o problema pede.
 *
 * Com `passosLivres` ligado (flag --passos-livres / STI_PASSOS_LIVRES=1), o
 * harness monta o config com TODOS os passos que o agente 3a produziu para o
 * trace representativo (mesma escolha de trace de produção), sem corte de
 * topologia. Todo o resto — filtro de misconceptions operacionais, scaffolds,
 * pulos, dicas — é o graphForge de produção intocado (ele não limita passos;
 * o corte vive só no extractGraphForgeConfig).
 *
 * Desligado, o comportamento é BYTE A BYTE o de produção. Os dois regimes são
 * braços comparáveis: o efeito do teto passa a ser MEDIDO, não assumido. O
 * registro grava `topologia: "producao" | "livre"` e o plano de passos que a
 * produção teria aplicado (para atribuição).
 */
function configPassosLivres(stateFull, configProducao) {
  // Reconstrói o caminho completo do agente 3a com a MESMA regra de produção
  // de escolha do trace representativo (mais longo; desempate por nº de KCs
  // distintos; depois pela ordem) — sem o corte de topologia.
  const kcs = configProducao.kcs || [];
  const advSolutions = stateFull.advancedTrace?.solutions || [];
  const candidatos = advSolutions
    .map((solution, solutionIndex) => ({
      solutionIndex,
      trace: (solution.solutionTrace || []).filter((item) => item.isCorrect !== false),
    }))
    .filter((c) => c.trace.length > 0)
    .sort(
      (a, b) =>
        b.trace.length - a.trace.length ||
        new Set(b.trace.map((i) => i.kcUsed).filter(Boolean)).size -
          new Set(a.trace.map((i) => i.kcUsed).filter(Boolean)).size ||
        a.solutionIndex - b.solutionIndex
    );
  const trace = candidatos[0]?.trace || [];
  const steps = trace.map((item, i) => ({
    index: item.step || i + 1,
    kc: item.kcUsed || kcs[0]?.id || "kc_default",
    action: item.action || "",
    result: item.result || "",
  }));
  if (steps.length <= (configProducao.steps || []).length) return configProducao; // nada a liberar

  // Realinha erros e dicas por passo, no MESMO formato de produção
  // (arrays indexados por passo 0-based), agora para todos os passos.
  const miscByStep = {};
  for (const sol of stateFull.atRiskTrace?.solutions || []) {
    for (const attempt of sol.attempts || []) {
      for (const t of attempt.solutionTrace || []) {
        if (t.isCorrect === false && t.error?.misconceptionId) {
          const idx = (t.step || 1) - 1;
          (miscByStep[idx] ||= []);
          if (!miscByStep[idx].some((m) => m.id === t.error.misconceptionId)) {
            miscByStep[idx].push({
              id: t.error.misconceptionId,
              type: t.error.type || "conceptual_error",
              wrongAnswer: t.error.wrongAnswer ?? t.result ?? "",
              description: t.error.description || "",
              feedback: t.error.howToFix || t.error.feedback || "",
              severity: t.error.severity || "moderate",
            });
          }
        }
      }
    }
  }
  const hintsByStep = {};
  for (const sol of stateFull.averageTrace?.solutions || []) {
    for (const t of sol.solutionTrace || []) {
      if (t.hesitation && Array.isArray(t.hintsNeeded)) {
        const idx = (t.step || 1) - 1;
        (hintsByStep[idx] ||= []).push(...t.hintsNeeded.map((h) => (typeof h === "string" ? h : h.message || h.hint || "")));
      }
    }
  }
  return {
    ...configProducao,
    steps,
    misconceptions: steps.map((_, i) => miscByStep[i] || []),
    hints: steps.map((_, i) => hintsByStep[i] || []),
  };
}

/**
 * Autora o grafo pelo fluxo da plataforma. Mesma forma de retorno do
 * authorFromEnvelopeA ({graph, neutral, traces, ...}), para o coletor tratar
 * os dois fluxos por igual.
 *
 * Os três agentes rodam em SEQUÊNCIA (3a → 3b → 3c), como nós do pipeline —
 * e isso mantém o fatiamento do manifesto por run determinístico.
 *
 * opts.passosLivres: ver configPassosLivres.
 */
export async function authorFluxoPlataforma(envelopeA, opts = {}) {
  const state = buildStateFromEnvelopeA(envelopeA, opts);

  const { advancedTrace } = await agent3a_advancedStudent(state);
  const { atRiskTrace } = await agent3b_atRiskStudent(state);
  const { averageTrace } = await agent3c_averageStudent(state);

  const stateFull = { ...state, advancedTrace, atRiskTrace, averageTrace };
  const configProducao = await extractGraphForgeConfig(stateFull);
  const passosLivres = opts.passosLivres === true || process.env.STI_PASSOS_LIVRES === "1";
  const config = passosLivres ? configPassosLivres(stateFull, configProducao) : configProducao;
  const planoProducao = resolveGraphForgeStepPlan({
    availableSteps: (advancedTrace?.solutions?.[0]?.solutionTrace || []).length,
    profile: state.interfaceSpec?.profile || "reader",
    difficulty: state.difficulty || "medium",
    description: state.description || "",
    numProblems: state.numProblems || 1,
  });
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
    topologia: {
      regime: passosLivres ? "livre" : "producao",
      passosGeradosPeloAgente: (config.steps || []).length,
      passosQueProducaoAplicaria: planoProducao.stepCount,
      tetoDinamicoProducao: planoProducao.dynamicMax,
    },
  };
}
