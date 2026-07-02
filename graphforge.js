import { getPrerequisites, getRelationships, getMisconceptions } from "./ontology-stub.js";
import { logger } from "./logger.js";

/**
 * GraphForge V7 — Algoritmo Deterministico de Grafos Comportamentais
 *
 * Cria grafos COMPLETOS com garantias estruturais por construcao:
 * - Toda edge from/to aponta para node existente
 * - Caminho start->goal sempre existe (BFS verificado)
 * - Todo step tem edge "correct" saindo
 * - Todo scaffold tem edge "correct" retornando ao step pai
 * - Zero IDs duplicados
 *
 * LLMs preenchem CONTEUDO (slots) — NUNCA estrutura.
 */

// ============================================================
// TOPOLOGY CONFIG por perfil/dificuldade
// ============================================================
const TOPOLOGY = {
  pre_literate: {
    minSteps: 1,
    defaultSteps: 2,
    maxSteps: 3,
    scaffoldsPerMisc: 1,
    skipEdges: false,
    genericScaffold: true,
    defaultMaxAttempts: 2,
    defaultTimeThreshold: null,
    maxScaffoldDepth: 1,
  },
  early_reader: {
    minSteps: 2,
    defaultSteps: 3,
    maxSteps: 5,
    scaffoldsPerMisc: 1,
    skipEdges: false,
    genericScaffold: true,
    defaultMaxAttempts: 2,
    defaultTimeThreshold: 60,
    maxScaffoldDepth: 1,
  },
  reader: {
    minSteps: 2,
    defaultSteps: 4,
    maxSteps: 7,
    scaffoldsPerMisc: 1,
    skipEdges: true,
    genericScaffold: false,
    defaultMaxAttempts: 3,
    defaultTimeThreshold: 90,
    maxScaffoldDepth: 2,
  },
  advanced: {
    minSteps: 3,
    defaultSteps: 5,
    maxSteps: 10,
    scaffoldsPerMisc: 1,
    skipEdges: true,
    genericScaffold: false,
    defaultMaxAttempts: 3,
    defaultTimeThreshold: 120,
    maxScaffoldDepth: 2,
  },
};

// ============================================================
// EXTRACT CONFIG from pipeline state
// ============================================================
export async function extractGraphForgeConfig(state) {
  const profile = state.interfaceSpec?.profile || "reader";
  const difficulty = state.difficulty || "medium";
  const kcs = (state.knowledgeComponents || []).map((kc) => ({
    id: kc.id,
    name: kc.name,
    difficulty: kc.difficulty || "medium",
    prerequisites: kc.prerequisites || [],
    masteryThreshold: 0.85,
  }));

  // Extract steps from advancedTrace (correct path)
  const advSolutions = state.advancedTrace?.solutions || [];
  const steps = [];

  for (const sol of advSolutions) {
    const trace = sol.solutionTrace || [];
    for (const t of trace) {
      if (t.isCorrect !== false) {
        steps.push({
          index: t.step || steps.length + 1,
          kc: t.kcUsed || kcs[0]?.id || "kc_default",
          action: t.action || "",
          result: t.result || "",
        });
      }
    }
  }

  // Extract misconceptions from atRiskTrace
  const riskSolutions = state.atRiskTrace?.solutions || [];
  const misconceptionsByStep = {};

  for (const sol of riskSolutions) {
    for (const attempt of sol.attempts || []) {
      for (const t of attempt.solutionTrace || []) {
        if (t.isCorrect === false && t.error) {
          const stepIdx = (t.step || 1) - 1;
          if (!misconceptionsByStep[stepIdx]) misconceptionsByStep[stepIdx] = [];
          const existing = misconceptionsByStep[stepIdx].find(
            (m) => m.id === t.error.misconceptionId
          );
          if (!existing && t.error.misconceptionId) {
            misconceptionsByStep[stepIdx].push({
              id: t.error.misconceptionId,
              type: t.error.type || "conceptual_error",
              wrongAnswer: t.error.wrongAnswer || t.result || "",
              description: t.error.description || "",
              feedback: t.error.howToFix || t.error.feedback || "",
              severity: t.error.severity || "moderate",
            });
          }
        }
      }
    }
  }

  // Extract hints from averageTrace (hesitation points)
  const avgSolutions = state.averageTrace?.solutions || [];
  const hintsByStep = {};

  for (const sol of avgSolutions) {
    for (const t of sol.solutionTrace || []) {
      const stepIdx = (t.step || 1) - 1;
      if (t.hesitation || (t.hintsNeeded && t.hintsNeeded.length > 0)) {
        if (!hintsByStep[stepIdx]) hintsByStep[stepIdx] = [];
        for (const h of t.hintsNeeded || []) {
          hintsByStep[stepIdx].push(typeof h === "string" ? h : h.message || h.hint || "");
        }
      }
    }
  }

  // Dynamic step limit: adapts to difficulty and what Agent 3a generated
  const topo = TOPOLOGY[profile] || TOPOLOGY.reader;

  // Calculate dynamic limit based on difficulty
  let dynamicMax;
  if (difficulty === "easy") {
    dynamicMax = topo.minSteps + 1; // easy: closer to minimum
  } else if (difficulty === "hard") {
    dynamicMax = topo.maxSteps; // hard: use full maximum
  } else {
    dynamicMax = topo.defaultSteps; // medium: use default
  }

  // Use what Agent 3a generated, but cap at dynamic max and floor at minSteps
  const stepCount = Math.max(topo.minSteps, Math.min(steps.length, dynamicMax));
  const limitedSteps = steps.slice(0, stepCount);

  logger.info(
    {
      module: "graphforge",
      phase: "steps",
      generated: steps.length,
      profile,
      minSteps: topo.minSteps,
      maxSteps: topo.maxSteps,
      difficulty,
      used: limitedSteps.length,
    },
    "Steps configuration"
  );

  // Build per-step arrays
  const miscArr = limitedSteps.map((_, i) => misconceptionsByStep[i] || []);
  const hintArr = limitedSteps.map((_, i) => hintsByStep[i] || []);

  // Extract masterGraphContext data for richer graph building
  const masterCtx = state.masterGraphContext || {};
  const masterKCs = masterCtx.relatedKCs || [];

  // Enrich KC mastery thresholds from Master Graph
  for (const kc of kcs) {
    const masterKc = masterKCs.find((mk) => mk.id === kc.id);
    if (masterKc) {
      kc.masteryThreshold = masterKc.mastery_threshold || kc.masteryThreshold || 0.85;
      // Merge known prerequisites from Master Graph
      if (masterKc.prerequisites?.length && !kc.prerequisites?.length) {
        kc.prerequisites = masterKc.prerequisites;
      }
    }
  }

  // V9.2: Enrich with ontology prerequisites and relationships (non-blocking)
  try {
    const withTimeout = (promise, ms) =>
      Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
      ]);
    const ontEnrichPromises = kcs.map(async (kc) => {
      const [prereqs, rels, miscs] = await Promise.all([
        withTimeout(getPrerequisites(kc.id), 2000).catch(() => []),
        withTimeout(getRelationships(kc.id), 2000).catch(() => []),
        withTimeout(getMisconceptions(kc.id), 2000).catch(() => []),
      ]);
      if (prereqs.length > 0 && (!kc.prerequisites || kc.prerequisites.length === 0)) {
        kc.prerequisites = prereqs.map((p) => p.prereqId);
        logger.debug(
          { module: "graphforge", phase: "ontology-enrich", kcId: kc.id, prereqs: prereqs.length },
          "Ontology enriched"
        );
      }
      if (rels.length > 0) {
        kc.ontologyRelationships = rels;
      }
      if (miscs.length > 0) {
        kc.ontologyMisconceptions = miscs;
      }
    });
    await Promise.all(ontEnrichPromises);
    logger.info(
      { module: "graphforge", phase: "ontology-enrich-done", kcCount: kcs.length },
      "Ontology enrichment complete"
    );
  } catch (e) {
    logger.warn(
      { module: "graphforge", phase: "ontology-enrich", err: e.message },
      "Ontology enrichment falhou (non-fatal)"
    );
  }

  // Extract known misconceptions from Master Graph for steps that lack them
  const masterMisconceptions = {};
  if (masterCtx.relatedGraphs?.length) {
    for (const mg of masterCtx.relatedGraphs) {
      for (const node of mg.nodes || []) {
        if (node.misconceptions?.length) {
          for (const misc of node.misconceptions) {
            if (misc.id && !masterMisconceptions[misc.id]) {
              masterMisconceptions[misc.id] = misc;
            }
          }
        }
      }
    }
  }

  // Enrich steps that have no misconceptions with Master Graph misconceptions
  for (let i = 0; i < limitedSteps.length; i++) {
    if (miscArr[i].length === 0) {
      // Try to find misconceptions from Master Graph for this KC
      const stepKc = limitedSteps[i].kc;
      const masterMiscs = Object.values(masterMisconceptions).filter(
        (m) => m.kcId === stepKc || m.prerequisiteGap === stepKc
      );
      if (masterMiscs.length > 0) {
        miscArr[i] = masterMiscs.slice(0, 2).map((m) => ({
          id: m.id,
          type: m.misconceptionType || m.type || "conceptual_error",
          wrongAnswer: m.wrongAnswer || "",
          description: m.description || "",
          feedback: m.feedback || "",
          severity: m.severity || "moderate",
        }));
        logger.debug(
          {
            module: "graphforge",
            phase: "step-misc-enrich",
            stepIndex: i + 1,
            misconceptions: miscArr[i].length,
          },
          "Step enriched com misconceptions"
        );
      }
    }
  }

  return { steps: limitedSteps, misconceptions: miscArr, hints: hintArr, kcs, profile, difficulty };
}

// ============================================================
// GRAPHFORGE — Main algorithm
// ============================================================
export function graphForge(config) {
  const { steps, misconceptions, hints, kcs, profile, difficulty } = config;
  const topo = TOPOLOGY[profile] || TOPOLOGY.reader;

  const nodeRegistry = new Map();
  const edges = [];

  // Helper: create and register a node
  function createNode(id, type, extra = {}) {
    if (nodeRegistry.has(id)) {
      logger.warn(
        { module: "graphforge", phase: "duplicate-node", nodeId: id },
        "Duplicate node ID — skipping"
      );
      return nodeRegistry.get(id);
    }
    const node = { id, type, description: "", instruction: null, ...extra };
    nodeRegistry.set(id, node);
    return node;
  }

  // Helper: add edge (guaranteed valid)
  function addEdge(from, to, condition, priority) {
    if (!nodeRegistry.has(from) || !nodeRegistry.has(to)) {
      logger.warn(
        { module: "graphforge", phase: "skip-edge", from, to },
        "Skipping edge — missing node"
      );
      return;
    }
    // Avoid duplicate edges
    const dup = edges.find((e) => e.from === from && e.to === to && e.condition === condition);
    if (dup) return;
    edges.push({ from, to, condition, priority: priority || 0 });
  }

  // ======================================
  // PHASE A: Create all nodes
  // ======================================

  // A1. Start and Goal
  createNode("start", "start", { description: "Inicio do exercicio" });
  createNode("goal", "goal", { description: "Exercicio completo" });

  // A2. Step nodes
  const stepNodes = [];
  const effectiveSteps =
    steps.length > 0
      ? steps
      : [{ index: 1, kc: kcs[0]?.id || "kc_default", action: "Resolver", result: "" }];

  for (let i = 0; i < effectiveSteps.length; i++) {
    const step = effectiveSteps[i];
    const kcId = step.kc || kcs[Math.min(i, kcs.length - 1)]?.id || "kc_default";

    const node = createNode("step_" + (i + 1), "step", {
      description: step.action || "Passo " + (i + 1),
      instruction: null,
      expectedInput: {
        value: null,
        validator: "exact",
        acceptableVariations: [],
        renderAs: null,
        visualConfig: null,
      },
      knowledgeComponents: [kcId],
      cognitiveLoad: estimateCognitiveLoad(i, effectiveSteps.length, difficulty),
      hints: [],
      misconceptions: [],
      scaffoldTrigger: {
        maxAttempts: topo.defaultMaxAttempts,
        timeThresholdSeconds: topo.defaultTimeThreshold,
        prerequisiteMasteryBelow: null,
      },
      scaffoldNodes: [],
      craStage: getCraStage(profile),
      illustration: null,
      audioNarration: null,
      guideMessage: null,
      soundEffect: null,
    });
    stepNodes.push(node);
  }

  // A3. Scaffold nodes (from atRiskTrace misconceptions)
  for (let si = 0; si < stepNodes.length; si++) {
    const stepMiscs = misconceptions[si] || [];

    for (let mi = 0; mi < stepMiscs.length; mi++) {
      const misc = stepMiscs[mi];
      const miscId = misc.id || "misc_s" + (si + 1) + "_" + (mi + 1);
      const scaffoldId = "scaffold_" + miscId;

      createNode(scaffoldId, "scaffold", {
        description: "Remediacao: " + (misc.description || miscId),
        targetMisconception: miscId,
        instruction: null,
        expectedInput: null,
        knowledgeComponents: stepNodes[si].knowledgeComponents.slice(),
        subSteps: [],
      });

      // Add misconception data to step node
      stepNodes[si].misconceptions.push({
        id: miscId,
        wrongAnswer: String(misc.wrongAnswer || ""),
        misconceptionType: misc.type || "conceptual_error",
        description: misc.description || "",
        feedback: misc.feedback || "Tente novamente com cuidado.",
        severity: misc.severity || "moderate",
        matcher: "exact",
      });

      stepNodes[si].scaffoldNodes.push(scaffoldId);
    }

    // A3b. Generic "struggles" scaffold if configured and no specific misconceptions
    const needsGeneric = topo.genericScaffold && stepMiscs.length === 0;
    if (needsGeneric) {
      const genericId = "scaffold_generic_s" + (si + 1);
      createNode(genericId, "scaffold", {
        description: "Scaffold generico para passo " + (si + 1),
        targetMisconception: "generic_struggle",
        instruction: null,
        expectedInput: null,
        knowledgeComponents: stepNodes[si].knowledgeComponents.slice(),
        subSteps: [],
      });
      stepNodes[si].scaffoldNodes.push(genericId);
    }
  }

  // ======================================
  // PHASE B: Create all edges (GUARANTEED VALID)
  // ======================================

  // B1. Linear backbone: start -> step_1 -> step_2 -> ... -> goal
  addEdge("start", stepNodes[0].id, "default", 0);
  for (let i = 0; i < stepNodes.length - 1; i++) {
    addEdge(stepNodes[i].id, stepNodes[i + 1].id, "correct", 1);
  }
  addEdge(stepNodes[stepNodes.length - 1].id, "goal", "correct", 1);

  // B2. Misconception edges: step -> scaffold -> step (loop back)
  for (let si = 0; si < stepNodes.length; si++) {
    const stepMiscs = misconceptions[si] || [];

    for (let mi = 0; mi < stepMiscs.length; mi++) {
      const misc = stepMiscs[mi];
      const miscId = misc.id || "misc_s" + (si + 1) + "_" + (mi + 1);
      const scaffoldId = "scaffold_" + miscId;

      if (nodeRegistry.has(scaffoldId)) {
        addEdge(stepNodes[si].id, scaffoldId, "misconception(" + miscId + ")", 2 + mi);
        addEdge(scaffoldId, stepNodes[si].id, "correct", 1);
      }
    }

    // B2b. Struggles edge to generic scaffold
    const genericId = "scaffold_generic_s" + (si + 1);
    if (nodeRegistry.has(genericId)) {
      addEdge(stepNodes[si].id, genericId, "struggles", 10);
      addEdge(genericId, stepNodes[si].id, "correct", 1);
    }
  }

  // B3. Skip edges (if profile allows)
  const shouldSkip = topo.skipEdges || (profile === "early_reader" && difficulty === "easy");
  if (shouldSkip) {
    for (let si = 0; si < stepNodes.length; si++) {
      const kcId = stepNodes[si].knowledgeComponents[0];
      const kcObj = kcs.find((k) => k.id === kcId);
      if (kcObj) {
        const skipTarget = si < stepNodes.length - 1 ? stepNodes[si + 1].id : "goal";
        addEdge(
          stepNodes[si].id,
          skipTarget,
          "skip_if_mastered(" + kcId + ", " + (kcObj.masteryThreshold || 0.85) + ")",
          0
        );
      }
    }
  }

  // ======================================
  // PHASE C: Validation (assertions)
  // ======================================
  const allNodes = [...nodeRegistry.values()];

  for (const e of edges) {
    if (!nodeRegistry.has(e.from) || !nodeRegistry.has(e.to)) {
      logger.error(
        { module: "graphforge", phase: "invariant", from: e.from, to: e.to },
        "INVARIANT VIOLATED — edge dangling"
      );
    }
  }

  if (!isReachable("start", "goal", edges)) {
    logger.error(
      { module: "graphforge", phase: "invariant" },
      "INVARIANT VIOLATED — goal not reachable from start, forcing linear"
    );
    // Emergency fix: add direct edges
    for (let i = 0; i < stepNodes.length; i++) {
      const from = i === 0 ? "start" : stepNodes[i - 1].id;
      const to = stepNodes[i].id;
      if (!edges.find((e) => e.from === from && e.to === to)) {
        edges.push({ from, to, condition: i === 0 ? "default" : "correct", priority: 1 });
      }
    }
    if (stepNodes.length > 0) {
      const last = stepNodes[stepNodes.length - 1].id;
      if (!edges.find((e) => e.from === last && e.to === "goal")) {
        edges.push({ from: last, to: "goal", condition: "correct", priority: 1 });
      }
    }
  }

  // ======================================
  // PHASE D: Build slot manifest
  // ======================================
  const slotManifest = buildSlotManifest(allNodes, hints);

  const topology = {
    totalNodes: allNodes.length,
    stepCount: stepNodes.length,
    scaffoldCount: allNodes.filter((n) => n.type === "scaffold").length,
    edgeCount: edges.length,
    hasSkipEdges: edges.some((e) => e.condition.startsWith("skip_if_mastered")),
    hasMisconceptionEdges: edges.some((e) => e.condition.startsWith("misconception")),
    hasStrugglesEdges: edges.some((e) => e.condition === "struggles"),
    profile,
    difficulty,
  };

  logger.info(
    {
      module: "graphforge",
      phase: "built",
      nodes: topology.totalNodes,
      edges: topology.edgeCount,
      scaffolds: topology.scaffoldCount,
      hasSkip: topology.hasSkipEdges,
      hasMisc: topology.hasMisconceptionEdges,
    },
    "Graph built"
  );

  return {
    graph: { nodes: allNodes, edges },
    slotManifest,
    topology,
  };
}

// ============================================================
// SLOT MANIFEST builder
// ============================================================
function buildSlotManifest(nodes, hintsByStep) {
  hintsByStep = hintsByStep || [];
  const slots = [];

  for (const node of nodes) {
    if (node.type === "step") {
      const stepIdx = parseInt((node.id || "").replace("step_", "")) - 1;
      const stepHints = hintsByStep[stepIdx] || [];

      slots.push(
        { nodeId: node.id, field: "instruction", type: "text", required: true },
        { nodeId: node.id, field: "expectedInput.value", type: "answer", required: true },
        {
          nodeId: node.id,
          field: "expectedInput.renderAs",
          type: "enum",
          options: ["image_choice", "multiple_choice", "text_input"],
        },
        {
          nodeId: node.id,
          field: "expectedInput.visualConfig.options",
          type: "options_array",
          required: true,
        },
        { nodeId: node.id, field: "hints", type: "hint_array", count: 3, existingHints: stepHints },
        { nodeId: node.id, field: "illustration", type: "illustration" },
        { nodeId: node.id, field: "audioNarration", type: "audio_text" },
        { nodeId: node.id, field: "guideMessage", type: "short_text" },
        {
          nodeId: node.id,
          field: "soundEffect",
          type: "enum",
          options: ["pop", "ding", "magic", "chime"],
        }
      );
    }
    if (node.type === "scaffold") {
      slots.push(
        { nodeId: node.id, field: "instruction", type: "text", required: true },
        { nodeId: node.id, field: "expectedInput", type: "answer_object" }
      );
    }
  }
  return slots;
}

// ============================================================
// HELPERS
// ============================================================

function isReachable(fromId, toId, edges) {
  const visited = new Set();
  const queue = [fromId];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === toId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const e of edges) {
      if (e.from === current && !visited.has(e.to)) {
        queue.push(e.to);
      }
    }
  }
  return false;
}

function estimateCognitiveLoad(stepIndex, totalSteps, difficulty) {
  if (difficulty === "easy") return stepIndex === 0 ? "low" : "medium";
  if (difficulty === "hard") return stepIndex >= totalSteps - 1 ? "high" : "medium";
  return "medium";
}

function getCraStage(profile) {
  switch (profile) {
    case "pre_literate":
      return "concrete";
    case "early_reader":
      return "representational";
    default:
      return "abstract";
  }
}
