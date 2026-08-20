/**
 * agent7-adapter.js - Agent 7 Interface Adapter + buildFallbackGraph helper.
 * Extraido de pipeline-v8.js em 2026-04-22, preservado byte-a-byte.
 */

import { createAgentLogger as _createAgentLogger } from "../agent-stream-hub.js";
import { logger } from "../../lib/logger.js";
import { tStr } from "../i18n-strings.js";
import { enforceBehaviorGraphIntegrity } from "../behavior-graph-integrity.js";
import { graphForge } from "../graphforge.js";
import {
  normalizeStepDistractorMetadata,
  cellExpectedInputFields,
} from "../behavior-graph-semantics.js";
import { getInterfaceMode, INTERFACE_MODES } from "../config/request-context.js";
import { applyNotebookFallback } from "../notebook/notebook-fallback.js";

/**
 * 2026-08-16 (caderno F2): modo de interface visto pelo adapter, com a mesma
 * escada de ancoras do gate (resolveGateInterfaceMode): valor explicito no
 * state > metadata do state > AsyncLocalStorage (aqui o contexto ainda esta
 * vivo, ao contrario do gate final). Fora de contexto devolve "rich".
 */
export function resolveAdapterInterfaceMode(state = {}) {
  const valido = (v) => typeof v === "string" && INTERFACE_MODES.includes(v);
  if (valido(state?.interfaceMode)) return state.interfaceMode;
  if (valido(state?._metadata?.interfaceMode)) return state._metadata.interfaceMode;
  if (valido(state?.metadata?.interfaceMode)) return state.metadata.interfaceMode;
  return getInterfaceMode();
}

function buildExpectedInputFromStep(step = {}) {
  const visualConfig = {};
  if (step.options) visualConfig.options = step.options;
  if (step.componentProps) visualConfig.componentProps = step.componentProps;
  if (step.config) visualConfig.config = step.config;
  if (step.visualConfig) Object.assign(visualConfig, step.visualConfig);

  return {
    value: step.expectedAnswer ?? "",
    validator: step._componentContract?.locked ? "component_contract" : "exact",
    acceptableVariations: step.acceptableVariations || [],
    renderAs: step.renderAs || null,
    componentId: step.renderAs || null,
    componentProps: step.componentProps || null,
    config: step.config || null,
    interactionMode: step.interactionMode || null,
    contractVersion: step._componentContract?.version || null,
    visualConfig: Object.keys(visualConfig).length ? visualConfig : null,
    // 2026-08-16 (caderno F0): espelha buildCanonicalExpectedInput: cellId /
    // cellRole / instrumentRef / target copiados de step.cell SO quando definidos.
    ...cellExpectedInputFields(step),
  };
}

/**
 * Reexecuta o GraphForge sobre o artefato concreto do Agent 6/9. O grafo
 * genérico dos Agents 3 continua útil como plano cognitivo, mas não pode ser o
 * matcher operacional de valores que só existem depois da materialização.
 */
export function buildConcreteGraphWithGraphForge(exercise, state = {}) {
  const steps = exercise?.steps || [];
  if (steps.length === 0) return null;
  normalizeStepDistractorMetadata(steps, {
    label: `ex:${exercise?.id ?? "?"}`,
    outputLanguageCode: state.outputLanguageCode || state.outputLanguage,
  });

  const kcs = (state.knowledgeComponents || []).map((kc) => ({
    id: kc.id,
    name: kc.name,
    difficulty: kc.difficulty || "medium",
    prerequisites: kc.prerequisites || [],
    masteryThreshold: kc.masteryThreshold || 0.85,
  }));
  const knownKcs = new Set(kcs.map((kc) => kc.id));
  for (const step of steps) {
    if (step.kc && !knownKcs.has(step.kc)) {
      kcs.push({ id: step.kc, name: step.kc, masteryThreshold: 0.85 });
      knownKcs.add(step.kc);
    }
  }

  const misconceptions = steps.map((step) =>
    (step.options || [])
      .filter((option) => option && option.isCorrect !== true && option.misconceptionId)
      .map((option) => ({
        id: option.misconceptionId,
        type: option.misconceptionType || "unclassified",
        wrongAnswer: option.value ?? option.label ?? "",
        description: option.diagnosticInfo || option.description || "",
        feedback: option.feedback || option.diagnosticInfo || "",
        severity: option.severity || "moderate",
      }))
  );

  return graphForge({
    steps: steps.map((step, index) => ({
      index: index + 1,
      kc: step.kc || kcs[0]?.id || "kc_default",
      action: step.instruction || `Passo ${index + 1}`,
      interactionFamily:
        step.interactionFamily ||
        step.interactionIntent?.action ||
        step.interactionMode ||
        step.renderAs ||
        "",
      targetRole: step.targetRole || step.cell?.target || step.cell?.role || "",
      result: step.expectedAnswer ?? "",
    })),
    misconceptions,
    hints: steps.map((step) => step.hints || []),
    kcs,
    profile: state.interfaceSpec?.profile || "reader",
    difficulty: exercise.difficulty || state.difficulty || "medium",
  }).graph;
}

export function agent7_interfaceAdapter(state) {
  logger.debug({ module: "agent7", phase: "start" }, "Interface Adapter (GraphForge Merge)");
  const exercises = state.exercises || [];
  const graphTemplate = state.genericGraph;
  let enriched = 0;
  // 2026-08-16 (caderno F2): no worksheet o fallback do caderno roda ANTES de
  // montar os nos, para que expectedInput.cellId/cellRole/instrumentRef/target
  // (buildExpectedInputFromStep) nascam do estado FINAL da celula, inclusive
  // quando o agent 9 reescreveu o passo. Idempotente: se o worker ja aplicou,
  // nada muda. Em simple/rich e um no-op.
  const modoInterface = resolveAdapterInterfaceMode(state);

  for (const exercise of exercises) {
    if (modoInterface === "worksheet") {
      applyNotebookFallback(exercise, { interfaceMode: "worksheet" });
    }
    const steps = exercise.steps || [];
    let concreteGraph = null;
    try {
      concreteGraph = buildConcreteGraphWithGraphForge(exercise, state);
    } catch (error) {
      logger.warn(
        {
          module: "agent7",
          phase: "concrete-graphforge",
          exerciseId: exercise.id,
          err: error.message,
        },
        "GraphForge concreto falhou; usando template validado"
      );
    }
    if (
      concreteGraph?.nodes?.length > 2 ||
      (graphTemplate && graphTemplate.nodes && graphTemplate.nodes.length > 2)
    ) {
      // Preferir GraphForge recompilado com steps/options finais. O template
      // genérico é fallback compatível para estados legados incompletos.
      const graph = concreteGraph || JSON.parse(JSON.stringify(graphTemplate));

      for (const node of graph.nodes) {
        if (node.type !== "step") continue;
        const stepIdx = parseInt((node.id || "").replace("step_", "")) - 1;
        if (stepIdx < 0 || stepIdx >= steps.length) continue;
        const step = steps[stepIdx];

        // Fill content slots from exercise step
        node.instruction = step.instruction || node.instruction || "";
        node.expectedInput = buildExpectedInputFromStep(step);
        if (step.kc) node.knowledgeComponents = [step.kc];
        node.hints = (step.hints || []).map(function (h, hi) {
          return {
            level: hi + 1,
            type: (typeof h === "object" ? h.type : "conceptual") || "conceptual",
            message: typeof h === "string" ? h : h.message || "",
          };
        });
        // Merge misconceptions from step options
        if (step.options) {
          const miscOpts = step.options.filter(function (o) {
            return !o.isCorrect && o.misconceptionId;
          });
          // As opções finais são a fonte de verdade. Misconceptions genéricas
          // do template nunca podem esconder os IDs/valores vistos pelo aluno.
          node.misconceptions = miscOpts.map(function (o) {
            // Pedagogical feedback: encouraging + mistake location + actionable
            let baseFeedback = o.feedback || "";
            if (!baseFeedback || baseFeedback === "Tente novamente." || baseFeedback.length < 15) {
              // V9.2: Generate context-aware fallback instead of generic
              const optLabel = (o.label || o.value || "").slice(0, 20);
              let correctLabel = "";
              const correctOpt = step.options
                ? step.options.find(function (op) {
                    return op.isCorrect;
                  })
                : null;
              if (correctOpt)
                correctLabel = (correctOpt.label || correctOpt.value || "").slice(0, 20);
              baseFeedback = tStr(
                "feedback.misconception.fallback",
                { optLabel },
                state?.outputLanguageCode || state?.outputLanguage || "pt-BR"
              );
            }
            // Ensure feedback doesn't start with negative words
            if (/^(errado|incorreto|nao|resposta errada)/i.test(baseFeedback)) {
              baseFeedback =
                "Quase la! " +
                baseFeedback.replace(/^(errado|incorreto|nao|resposta errada)[.,!]?\s*/i, "");
            }
            return {
              id: o.misconceptionId,
              wrongAnswer: String(o.value ?? ""),
              misconceptionType: o.misconceptionType || "unclassified",
              description: o.diagnosticInfo || o.description || "",
              feedback: baseFeedback,
              severity: o.severity || "moderate",
              matcher: "exact",
            };
          });
        }
        if (step.illustration) node.illustration = step.illustration;
        if (step.audioNarration) node.audioNarration = step.audioNarration;
        if (step.guideMessage) node.guideMessage = step.guideMessage;
        if (step.soundEffect) node.soundEffect = step.soundEffect;
        // 2026-08-09 (auditoria de conformidade STI): `explanation` é a
        // justificativa do passo VÁLIDO — a informação complementar que a
        // literatura ancora no passo correto. Ela existia em 60,8% dos 2.891
        // passos publicados, era paga na geração, e NUNCA saía daqui: o modo
        // grafo do TutorView renderiza a partir do NÓ (gotcha 2 do CLAUDE.md) e
        // este bloco copiava 10 campos sem copiar este. No aluno, o acerto
        // virava "Muito bem! Resposta correta." em 808 dos 968 casos.
        if (step.explanation) node.explanation = step.explanation;
        // V9: Preserva imagem gerada pelo Agent 6d
        if (step.imageUrl) node.imageUrl = step.imageUrl;
        // 2026-04-27: preserva imagem conceitual didática (Agent 6e — 1 por KC)
        if (step.conceptImageUrl) node.conceptImageUrl = step.conceptImageUrl;
        if (step.conceptImageKc) node.conceptImageKc = step.conceptImageKc;
        // V9.2: Ensure all step nodes have scaffoldTrigger for adaptive scaffolding
        if (!node.scaffoldTrigger) {
          node.scaffoldTrigger = { maxAttempts: 3, timeThresholdSeconds: 120 };
        }
        if (step.imagePrompt) node.imagePrompt = step.imagePrompt;
      }

      // Fill scaffold instruction from misconceptionCatalog
      // D4: Filter scaffolds — only keep scaffolds linked to this problem's step KCs
      const problemKCs = new Set(
        steps
          .map(function (s) {
            return s.kc;
          })
          .filter(Boolean)
      );
      for (const node of graph.nodes) {
        if (node.type !== "scaffold") continue;
        if (!node.instruction) {
          const miscData = (state.misconceptionCatalog || []).find(function (m) {
            return m.id === node.targetMisconception;
          });
          if (miscData) {
            // V9.2: Build rich scaffold instruction from Agent 3b data
            const parts = [];
            if (miscData.diagnosticQuestion) parts.push(miscData.diagnosticQuestion);
            else if (miscData.feedback) parts.push(miscData.feedback);
            if (miscData.howToFix) parts.push("Dica: " + miscData.howToFix);
            if (miscData.description && !miscData.diagnosticQuestion)
              parts.push("Vamos revisar: " + miscData.description);
            node.instruction =
              parts.length > 0
                ? parts.join(" ")
                : "Vamos revisar: " + (miscData.description || "este conceito");
          } else {
            // V9.2: Better generic scaffold based on step context
            const stepKC = node.knowledgeComponents?.[0] || "";
            const kcName =
              (state.knowledgeComponents || []).find((k) => k.id === stepKC)?.name || "";
            node.instruction = kcName
              ? "Vamos simplificar! Pense no conceito de " +
                kcName +
                ". Qual seria o primeiro passo?"
              : "Vamos dividir em partes menores. Qual e a primeira coisa que voce precisa descobrir?";
          }
        }
        // D5: Ensure scaffold KC matches step KC
        if (node.knowledgeComponents?.length && problemKCs.size > 0) {
          const scaffoldKC = node.knowledgeComponents[0];
          if (!problemKCs.has(scaffoldKC)) {
            // Reassign to the closest step KC
            node.knowledgeComponents = [problemKCs.values().next().value];
          }
        }
      }
      // Remove unreachable scaffolds (no edge pointing to them)
      const reachableNodes = new Set(["start", "goal"]);
      for (const edge of graph.edges) {
        reachableNodes.add(edge.from);
        reachableNodes.add(edge.to);
      }
      graph.nodes = graph.nodes.filter(function (n) {
        return n.type !== "scaffold" || reachableNodes.has(n.id);
      });

      // V9.4: Expand — se Agent 6 gerou MAIS steps que o template, adicionar nodes + edges extras.
      const templateStepIds = graph.nodes
        .filter(function (n) {
          return n.type === "step";
        })
        .map(function (n) {
          return n.id;
        });
      const templateStepCount = templateStepIds.length;
      if (steps.length > templateStepCount) {
        // Remover edge do ultimo step do template para goal (sera reencadeado)
        const lastTemplateId = "step_" + templateStepCount;
        graph.edges = graph.edges.filter(function (e) {
          return !(e.from === lastTemplateId && e.to === "goal");
        });
        // Clonar proto de step node (do ultimo step do template) para reutilizar shape
        const protoStep = graph.nodes.find(function (n) {
          return n.id === lastTemplateId;
        }) || { type: "step" };
        for (let k = templateStepCount + 1; k <= steps.length; k++) {
          const extraStep = steps[k - 1];
          const nodeId = "step_" + k;
          const newNode = JSON.parse(JSON.stringify(protoStep));
          newNode.id = nodeId;
          // Nunca herdar a semântica adaptativa do passo protótipo.
          newNode.misconceptions = [];
          newNode.scaffoldNodes = [];
          newNode.instruction = extraStep.instruction || "";
          newNode.expectedInput = buildExpectedInputFromStep(extraStep);
          if (extraStep.kc) newNode.knowledgeComponents = [extraStep.kc];
          newNode.hints = (extraStep.hints || []).map(function (h, hi) {
            return {
              level: hi + 1,
              type: (typeof h === "object" ? h.type : "conceptual") || "conceptual",
              message: typeof h === "string" ? h : h.message || "",
            };
          });
          if (extraStep.options) {
            const xMiscs = extraStep.options.filter(function (o) {
              return !o.isCorrect && o.misconceptionId;
            });
            if (xMiscs.length > 0) {
              newNode.misconceptions = xMiscs.map(function (o) {
                return {
                  id: o.misconceptionId,
                  wrongAnswer: String(o.value ?? ""),
                  misconceptionType: o.misconceptionType || "unclassified",
                  description: o.diagnosticInfo || o.description || "",
                  feedback:
                    o.feedback ||
                    tStr(
                      "feedback.misconception.fallback",
                      { optLabel: o.label || o.value || "" },
                      state?.outputLanguageCode || state?.outputLanguage || "pt-BR"
                    ),
                  severity: o.severity || "moderate",
                  matcher: "exact",
                };
              });
            }
          }
          if (extraStep.illustration) newNode.illustration = extraStep.illustration;
          if (extraStep.audioNarration) newNode.audioNarration = extraStep.audioNarration;
          if (extraStep.imageUrl) newNode.imageUrl = extraStep.imageUrl;
          if (extraStep.imagePrompt) newNode.imagePrompt = extraStep.imagePrompt;
          // 2026-04-27: preserva imagem conceitual (Agent 6e)
          if (extraStep.conceptImageUrl) newNode.conceptImageUrl = extraStep.conceptImageUrl;
          if (extraStep.conceptImageKc) newNode.conceptImageKc = extraStep.conceptImageKc;
          if (!newNode.scaffoldTrigger)
            newNode.scaffoldTrigger = { maxAttempts: 3, timeThresholdSeconds: 120 };

          graph.nodes.push(newNode);
          const prevId = "step_" + (k - 1);
          graph.edges.push({ from: prevId, to: nodeId, condition: "correct", priority: 1 });
          // A barreira semântica abaixo cria scaffolds exatos. Não existe
          // fallback round-robin: um erro jamais reutiliza o scaffold de outro.
        }
        // Ultimo step (real) -> goal
        const finalStepId = "step_" + steps.length;
        graph.edges.push({ from: finalStepId, to: "goal", condition: "correct", priority: 1 });
      }

      // Collapse: remove step nodes beyond exercise steps count (Agent 6 gerou MENOS steps que template)
      const stepNodeIds = graph.nodes
        .filter(function (n) {
          return n.type === "step";
        })
        .map(function (n) {
          return n.id;
        });
      const validStepIds = new Set(
        steps.map(function (_, i) {
          return "step_" + (i + 1);
        })
      );
      const toRemove = new Set();
      for (const sid of stepNodeIds) {
        if (!validStepIds.has(sid)) toRemove.add(sid);
      }
      if (toRemove.size > 0) {
        graph.nodes = graph.nodes.filter(function (n) {
          return !toRemove.has(n.id);
        });
        graph.edges = graph.edges.filter(function (e) {
          return !toRemove.has(e.from) && !toRemove.has(e.to);
        });
        const lastValid = "step_" + steps.length;
        if (
          !graph.edges.find(function (e) {
            return e.from === lastValid && e.to === "goal";
          })
        ) {
          graph.edges.push({ from: lastValid, to: "goal", condition: "correct", priority: 1 });
        }
      }

      exercise.behaviorGraph = graph;
      enriched++;
    } else {
      // Fallback: build minimal linear graph
      exercise.behaviorGraph = buildFallbackGraph(exercise);
    }

    // 2026-06-04: corrige na ORIGEM o desync de renumeração da adaptação acima
    // (template step_N do GraphForge vs steps gerados pelo Agent 6 → arestas p/
    // step_3/step_5/step_consolidate que nunca viraram nó). Redireciona arestas
    // fantasma, garante caminho start→goal só por nós reais e misconception↔scaffold.
    const _integrity = enforceBehaviorGraphIntegrity(exercise.behaviorGraph, exercise.steps || [], {
      label: `ex:${exercise.id ?? "?"}`,
      outputLanguageCode: state?.outputLanguageCode || state?.outputLanguage || "pt-BR",
    });
    if (_integrity.repairs.length) {
      logger.debug(
        {
          module: "agent7",
          phase: "graph-integrity",
          exerciseId: exercise.id,
          repairs: _integrity.repairs.length,
        },
        "BehaviorGraph reparado estruturalmente na origem"
      );
    }
  }

  logger.info(
    { module: "agent7", phase: "done", graphs: exercises.length, enriched },
    "Graphs built"
  );
  return {
    exercises: exercises,
    agentLogs: [{ agent: "agent7_adapter", graphsGenerated: exercises.length, enriched: enriched }],
  };
}

/**
 * Build minimal linear fallback graph
 */
export function buildFallbackGraph(exercise) {
  const nodes = [{ id: "start", type: "start" }];
  const edges = [];

  (exercise.steps || []).forEach((s, i) => {
    const sid = "step_" + (i + 1);
    nodes.push({
      id: sid,
      type: "step",
      instruction: s.instruction || "",
      expectedInput: buildExpectedInputFromStep(s),
      knowledgeComponents: s.kc ? [s.kc] : [],
      hints: (s.hints || []).map((h, hi) => ({
        level: hi + 1,
        type: h.type || "conceptual",
        message: typeof h === "string" ? h : h.message || "",
      })),
      misconceptions: [],
      scaffoldTrigger: { maxAttempts: 3 },
    });
    edges.push(
      i === 0
        ? { from: "start", to: sid, condition: "default" }
        : { from: "step_" + i, to: sid, condition: "correct" }
    );
  });

  nodes.push({ id: "goal", type: "goal" });
  if (exercise.steps?.length)
    edges.push({ from: "step_" + exercise.steps.length, to: "goal", condition: "correct" });
  return { nodes, edges };
}
