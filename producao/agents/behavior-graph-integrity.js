import {
  auditBehaviorGraphSemantics,
  canonicalGraphStepIds,
  countBehaviorGraphSemanticDefects,
  synchronizeBehaviorGraphSemantics,
  synchronizeBehaviorGraphStepContracts,
} from "./behavior-graph-semantics.js";

/**
 * behavior-graph-integrity.js — Invariantes estruturais dos behavior graphs
 * POR-PROBLEMA (problems[].behaviorGraph) entregues ao aluno.
 *
 * Motivação (auditoria 2026-06-04 sobre shared_tutors.json):
 *   - 18,7% dos grafos estavam DESCONEXOS (sem caminho start→goal usando só nós reais);
 *   - 11,1% tinham arestas apontando para nós FANTASMA (step_4, step_consolidate, step_3…);
 *   - 10% das misconceptions declaradas em passos não tinham scaffold de remediação.
 *
 * Causa: a adaptação do grafo na Fase 2 (agent7-adapter expand/collapse renumera
 * step_N; o caminho V10 sequencializava o consolidatorStep p/ step_N mas mantinha
 * arestas com `step_consolidate`). O validador determinístico (agent5) só valida o
 * genericGraph da Fase 1, NÃO os grafos por-problema entregues.
 *
 * Este módulo é a ÚLTIMA barreira estrutural: dado um grafo + os steps do problema,
 * audita (paridade exata com backend/scripts/audit-behavior-graphs.mjs) e REPARA:
 *   C1. Integridade referencial — toda aresta from/to aponta p/ nó existente.
 *   C2. Conectividade          — existe caminho start→goal só por nós reais (forward).
 *   C3. Cobertura de passos    — nenhum step final fica fora do grafo.
 *   C4. Semântica adaptativa   — cada erro reconhecido tem trigger, scaffold
 *                                correspondente e retorno ao passo de origem.
 *
 * Puro (sem I/O, sem logger) — trivialmente testável e reusável pela auditoria.
 */

// ============================================================
// Predicados — paridade com audit-behavior-graphs.mjs
// ============================================================

/** Aresta "para frente" (avança no fluxo). Misconception/struggle NÃO contam. */
export function isForwardCondition(condition) {
  return !/misconception|struggle/i.test(String(condition || ""));
}

/** Somente estas condições formam a cadeia canônica; skips são desvios adaptativos legítimos. */
function isBackboneCondition(condition) {
  return condition == null || condition === "default" || condition === "correct";
}

/** Sufixo numérico de um id de passo: "step_4" → 4, "s_3" → 3, "step_consolidate" → null. */
function numericSuffix(id) {
  const m = String(id ?? "").match(/(\d+)\s*$/);
  return m ? parseInt(m[1], 10) : null;
}

/** Heurística: o id parece um nó de passo (alvo redirecionável)? */
function looksLikeStepId(id) {
  return /^step[_-]/i.test(String(id ?? "")) || /^s_?\d+$/i.test(String(id ?? ""));
}

/**
 * Ordem canônica de um nó de passo. Os builders usam step_N (sufixo = ordem) e o
 * consolidatorStep deve ser o ÚLTIMO. Passos não-numéricos (que não o consolidate)
 * ficam perto do fim, mantendo ordem de array via tie-break do caller.
 */
function stepRank(id) {
  const suf = numericSuffix(id);
  if (suf != null) return suf;
  if (/consolidat/i.test(String(id ?? ""))) return 1e6;
  return 1e5;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function nonEmptyString(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

/** Extrai o id de `misconception(id)` sem aceitar condições parecidas/stale. */
function misconceptionIdFromCondition(condition) {
  return (
    String(condition || "")
      .trim()
      .match(/^misconception\s*\(\s*([^)]*?)\s*\)$/i)?.[1]
      ?.trim() || null
  );
}

function isStrugglesCondition(condition) {
  return /^struggles?(?:\(|$)/i.test(String(condition || "").trim());
}

function isRemediationCondition(condition) {
  return misconceptionIdFromCondition(condition) != null || isStrugglesCondition(condition);
}

/**
 * As misconceptions emitíveis podem vir do modelo cognitivo do nó OU das
 * opções finais da interface. O frontend consulta exatamente estas coleções;
 * portanto o gate precisa enxergar as mesmas fontes para não validar um grafo
 * que o runtime executará de outra maneira.
 */
function misconceptionOptionCollections(source) {
  return [
    source?.options,
    source?.expectedInput?.visualConfig?.options,
    source?.expectedInput?.visualConfig?.componentProps?.options,
    source?.expectedInput?.config?.options,
    source?.expectedInput?.config?.componentProps?.options,
    source?.expectedInput?.componentProps?.options,
    source?.expectedInput?.options,
    source?.componentProps?.options,
    source?.visualConfig?.options,
    source?.visualConfig?.componentProps?.options,
    source?.config?.options,
    source?.config?.componentProps?.options,
  ];
}

function collectMisconceptionContracts(node, sourceStep = null) {
  const byId = new Map();
  const add = (raw, source) => {
    if (!raw || typeof raw !== "object") return;
    // 2026-08-02 (CAUSA RAIZ do STI rejeitado em produção): o runtime
    // (graphEngine._checkMisconceptions) SEMPRE emite `option.misconceptionId`
    // ao clicar num distrator — nunca o id da option. O contrato aqui usava
    // `raw.id || raw.misconceptionId`, então uma option com id="opt_1" +
    // misconceptionId="misc_x" exigia rota misconception(opt_1) que o runtime
    // jamais dispara → órfão fantasma → "contrato adaptativo inexequível" →
    // 500. Options agora chaveiam por misconceptionId PRIMEIRO (alinhado com
    // runtime e com o semantic sync); entradas de misconceptions[] mantêm id
    // primeiro (o runtime emite misc.id nesse caminho).
    const id = nonEmptyString(
      source === "options" ? raw.misconceptionId || raw.id : raw.id || raw.misconceptionId
    );
    if (!id) return;
    const previous = byId.get(id) || { id, source, wrongAnswers: [] };
    const wrongAnswer = raw.wrongAnswer ?? raw.value ?? raw.answer ?? raw.label;
    if (
      wrongAnswer != null &&
      String(wrongAnswer).trim() &&
      !previous.wrongAnswers.some((item) => String(item) === String(wrongAnswer))
    ) {
      previous.wrongAnswers.push(wrongAnswer);
    }
    previous.description ||= raw.description || raw.diagnosticInfo || null;
    previous.feedback ||= raw.feedback || raw.remediation || raw.diagnosticInfo || null;
    previous.misconceptionType ||= raw.misconceptionType || null;
    byId.set(id, previous);
  };

  for (const source of [node, sourceStep].filter(Boolean)) {
    for (const misconception of asArray(source?.misconceptions)) {
      add(misconception, "misconceptions");
    }
    for (const option of misconceptionOptionCollections(source).flatMap(asArray)) {
      if (!option || option.isCorrect || !option.misconceptionId) continue;
      add(option, "options");
    }
  }
  return [...byId.values()];
}

function scaffoldMatchesMisconception(scaffold, misconceptionId) {
  if (!scaffold || scaffold.type !== "scaffold" || !misconceptionId) return false;
  const target = nonEmptyString(scaffold.targetMisconception);
  return target
    ? target === misconceptionId
    : String(scaffold.id || "") === `scaffold_${misconceptionId}`;
}

function hasScaffoldTrigger(stepNode) {
  const trigger = stepNode?.scaffoldTrigger;
  if (!trigger || typeof trigger !== "object") return false;
  return (
    Number(trigger.maxAttempts) > 0 ||
    Number(trigger.timeThresholdSeconds) > 0 ||
    Number(trigger.prerequisiteMasteryBelow) > 0
  );
}

/** Reachability start→goal só por nós reais e arestas forward (idêntico ao audit). */
function reachForward(startId, goalId, edges, ids) {
  return reachableFromForward(startId, edges, ids).has(goalId);
}

function reachableFromForward(startId, edges, ids) {
  const seen = new Set(startId ? [startId] : []);
  if (!startId) return seen;
  const stack = [startId];
  while (stack.length) {
    const cur = stack.pop();
    for (const e of edges) {
      if (e.from === cur && ids.has(e.to) && isForwardCondition(e.condition) && !seen.has(e.to)) {
        seen.add(e.to);
        stack.push(e.to);
      }
    }
  }
  return seen;
}

function reachableFromBackbone(startId, edges, ids) {
  const seen = new Set(startId ? [startId] : []);
  if (!startId) return seen;
  const stack = [startId];
  while (stack.length) {
    const current = stack.pop();
    for (const edge of edges) {
      if (
        edge.from === current &&
        ids.has(edge.to) &&
        isBackboneCondition(edge.condition) &&
        !seen.has(edge.to)
      ) {
        seen.add(edge.to);
        stack.push(edge.to);
      }
    }
  }
  return seen;
}

// ============================================================
// AUDITORIA (read-only) — mesma semântica do script de auditoria
// ============================================================

/**
 * Audita um único behaviorGraph. Além das invariantes estruturais, valida o
 * contrato adaptativo EXECUTÁVEL pelo frontend:
 *   - cada misconception declarada/opção emitível tem edge exata;
 *   - a edge chega num scaffold semanticamente alinhado;
 *   - cada scaffold tem entrada acionável e retorno ao step de origem;
 *   - scaffoldNodes não referencia nó inexistente.
 */
export function auditBehaviorGraph(graph, steps = []) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  const ids = new Set(nodes.map((n) => n.id));
  const stepNodes = nodes.filter((n) => n.type === "step");
  const scaffoldNodes = nodes.filter((n) => n.type === "scaffold");
  const nodeById = new Map(nodes.map((node) => [String(node.id), node]));
  const start = nodes.find((n) => n.type === "start");
  const goal = nodes.find((n) => n.type === "goal");

  const dangling = edges.filter((e) => !ids.has(e.from) || !ids.has(e.to));
  const phantomTargets = {};
  for (const e of dangling) {
    for (const x of [e.from, e.to])
      if (!ids.has(x)) phantomTargets[x] = (phantomTargets[x] || 0) + 1;
  }

  const connected = !!(start && goal && reachForward(start.id, goal.id, edges, ids));

  const contractsByStep = new Map(
    stepNodes.map((step) => [
      String(step.id),
      new Map(collectMisconceptionContracts(step).map((contract) => [contract.id, contract])),
    ])
  );
  const orphanMisconceptions = [];
  const nonEmittableMisconceptions = [];
  const misalignedMisconceptionEdges = [];
  const staleMisconceptionEdges = [];
  const invalidScaffoldRefs = [];
  const untriggerableStruggles = [];
  const validEntries = [];

  for (const step of stepNodes) {
    const contracts = contractsByStep.get(String(step.id)) || new Map();
    for (const contract of contracts.values()) {
      if (contract.wrongAnswers.length === 0) {
        nonEmittableMisconceptions.push({
          step: step.id,
          misconceptionId: contract.id,
          source: contract.source,
        });
      }
      const matchingEdge = edges.find((edge) => {
        if (String(edge.from) !== String(step.id)) return false;
        if (misconceptionIdFromCondition(edge.condition) !== contract.id) return false;
        return scaffoldMatchesMisconception(nodeById.get(String(edge.to)), contract.id);
      });
      if (!matchingEdge) {
        orphanMisconceptions.push({
          step: step.id,
          misconceptionId: contract.id,
          source: contract.source,
        });
      }
    }
    for (const scaffoldId of asArray(step.scaffoldNodes)) {
      if (nodeById.get(String(scaffoldId))?.type !== "scaffold") {
        invalidScaffoldRefs.push({ step: step.id, scaffoldId });
      }
    }
  }

  for (const edge of edges) {
    const sourceStep = nodeById.get(String(edge.from));
    const targetScaffold = nodeById.get(String(edge.to));
    if (sourceStep?.type !== "step" || targetScaffold?.type !== "scaffold") continue;

    const mid = misconceptionIdFromCondition(edge.condition);
    if (mid) {
      const contract = contractsByStep.get(String(sourceStep.id))?.get(mid);
      if (!contract) {
        staleMisconceptionEdges.push({
          from: edge.from,
          to: edge.to,
          misconceptionId: mid,
        });
        continue;
      }
      if (!scaffoldMatchesMisconception(targetScaffold, mid)) {
        misalignedMisconceptionEdges.push({
          from: edge.from,
          to: edge.to,
          misconceptionId: mid,
          targetMisconception: targetScaffold.targetMisconception || null,
        });
        continue;
      }
      validEntries.push(edge);
      continue;
    }

    if (isStrugglesCondition(edge.condition)) {
      if (hasScaffoldTrigger(sourceStep)) validEntries.push(edge);
      else untriggerableStruggles.push({ from: edge.from, to: edge.to });
    }
  }

  const validEntryTargets = new Set(validEntries.map((edge) => String(edge.to)));
  const scaffoldsWithoutEntry = scaffoldNodes
    .filter((scaffold) => !validEntryTargets.has(String(scaffold.id)))
    .map((scaffold) => scaffold.id);
  const scaffoldReturnMismatches = validEntries
    .filter(
      (entry) =>
        !edges.some(
          (candidate) =>
            String(candidate.from) === String(entry.to) &&
            String(candidate.to) === String(entry.from) &&
            !isRemediationCondition(candidate.condition)
        )
    )
    .map((entry) => ({
      fromStep: entry.from,
      scaffold: entry.to,
      condition: entry.condition,
    }));

  const adaptiveOk =
    orphanMisconceptions.length === 0 &&
    nonEmittableMisconceptions.length === 0 &&
    misalignedMisconceptionEdges.length === 0 &&
    staleMisconceptionEdges.length === 0 &&
    invalidScaffoldRefs.length === 0 &&
    untriggerableStruggles.length === 0 &&
    scaffoldsWithoutEntry.length === 0 &&
    scaffoldReturnMismatches.length === 0;

  const semantics = auditBehaviorGraphSemantics(graph, steps);

  const orderedStepIds =
    Array.isArray(steps) && steps.length > 0
      ? canonicalGraphStepIds(steps)
      : stepNodes
          .map((node, index) => ({ id: node.id, rank: stepRank(node.id), index }))
          .sort((a, b) => a.rank - b.rank || a.index - b.index)
          .map((item) => item.id);
  const canonicalBackboneViolations = [];
  if (start && goal) {
    const firstTarget = orderedStepIds[0] || goal.id;
    // `start` não representa uma tentativa do aluno e, portanto, não pode
    // disparar misconception/struggle/skip. A única saída válida é a entrada
    // canônica default; qualquer outra permitiria pulo sem avaliação.
    const startForward = edges.filter((edge) => edge.from === start.id);
    if (
      startForward.length !== 1 ||
      startForward[0]?.to !== firstTarget ||
      String(startForward[0]?.condition || "default") !== "default"
    ) {
      canonicalBackboneViolations.push({
        from: start.id,
        expectedTo: firstTarget,
        expectedCondition: "default",
        actual: startForward.map((edge) => ({ to: edge.to, condition: edge.condition })),
      });
    }

    for (let index = 0; index < orderedStepIds.length; index++) {
      const from = orderedStepIds[index];
      const expectedTo = orderedStepIds[index + 1] || goal.id;
      const forward = edges.filter(
        (edge) => edge.from === from && isBackboneCondition(edge.condition)
      );
      if (
        forward.length !== 1 ||
        forward[0]?.to !== expectedTo ||
        forward[0]?.condition !== "correct"
      ) {
        canonicalBackboneViolations.push({
          from,
          expectedTo,
          expectedCondition: "correct",
          actual: forward.map((edge) => ({ to: edge.to, condition: edge.condition })),
        });
      }
    }

    const reachable = reachableFromBackbone(start.id, edges, ids);
    for (const stepId of orderedStepIds) {
      if (!reachable.has(stepId)) {
        canonicalBackboneViolations.push({ step: stepId, reason: "unreachable_from_start" });
      }
    }
  }

  return {
    ...semantics,
    // 2026-08-02 (merge #27-#33 + interfaces ricas): `ok` exige as DUAS
    // barreiras. A adaptativa (scaffold alcancavel, misconception roteavel,
    // retorno ao step de origem) vinha do trabalho de interfaces; a canonica
    // (backbone + semantica do compilador) vinha das PRs. Cair para so uma
    // delas reabriria exatamente os defeitos que cada lado fechou.
    ok:
      dangling.length === 0 &&
      connected &&
      adaptiveOk &&
      canonicalBackboneViolations.length === 0 &&
      semantics.ok,
    dangling,
    phantomTargets,
    connected,
    orphanMisconceptions,
    nonEmittableMisconceptions,
    misalignedMisconceptionEdges,
    staleMisconceptionEdges,
    invalidScaffoldRefs,
    untriggerableStruggles,
    scaffoldsWithoutEntry,
    scaffoldReturnMismatches,
    adaptiveOk,
    hasStart: !!start,
    hasGoal: !!goal,
    stepCount: stepNodes.length,
    canonicalBackboneViolations,
  };
}

// ============================================================
// REPARO (mutativo) — auto-repara, devolve {repairs, fatal, audit}
// ============================================================

function dedupEdges(edges) {
  const seen = new Set();
  const out = [];
  for (const e of edges) {
    const k = `${e.from}→${e.to}:${e.condition ?? "default"}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}

/** Garante uma aresta exata from→to:condition (usado p/ misconception/loopback). */
function ensureExactEdge(graph, from, to, condition, repairs, label, note) {
  const exists = graph.edges.some(
    (e) => e.from === from && e.to === to && (e.condition ?? "default") === condition
  );
  if (!exists) {
    graph.edges.push({ from, to, condition });
    if (note) repairs.push(`${label}: ${note}`);
  }
}

function sourceStepForNode(stepNode, nodeIndex, steps) {
  return (
    asArray(steps).find(
      (step) =>
        String(step?.id || "") === String(stepNode.id) ||
        String(step?.graphNodeId || "") === String(stepNode.id)
    ) ||
    asArray(steps)[nodeIndex] ||
    null
  );
}

function removeMisconceptionContract(source, misconceptionId) {
  if (!source || typeof source !== "object") return;
  if (Array.isArray(source.misconceptions)) {
    source.misconceptions = source.misconceptions.filter(
      (item) => nonEmptyString(item?.id || item?.misconceptionId) !== misconceptionId
    );
  }
  for (const option of misconceptionOptionCollections(source).flatMap(asArray)) {
    if (nonEmptyString(option?.misconceptionId) === misconceptionId) {
      delete option.misconceptionId;
      delete option.misconceptionType;
    }
  }
}

function scaffoldIdBase(misconceptionId) {
  const raw = String(misconceptionId || "").trim();
  const safe = raw.replace(/[^\p{L}\p{N}_.-]+/gu, "_").replace(/^_+|_+$/g, "");
  return `scaffold_${safe || "remediation"}`;
}

function allocateScaffoldId(misconceptionId, nodeById) {
  const base = scaffoldIdBase(misconceptionId);
  if (!nodeById.has(base)) return base;
  const existing = nodeById.get(base);
  if (scaffoldMatchesMisconception(existing, misconceptionId)) return base;
  let suffix = 2;
  while (nodeById.has(`${base}__${suffix}`)) suffix += 1;
  return `${base}__${suffix}`;
}

/**
 * Fecha o contrato adaptativo de ponta a ponta. A função é deliberadamente
 * conservadora com conteúdo: reaproveita scaffolds semanticamente compatíveis,
 * sintetiza apenas quando não há um, remove somente ligações inexequíveis e
 * nunca altera o backbone correto do tutor.
 */
function normalizeAdaptiveScaffolds(graph, stepNodes, steps, opts, repairs, label) {
  const synthesizeScaffolds = opts.synthesizeScaffolds !== false;
  let nodeById = new Map(graph.nodes.map((node) => [String(node.id), node]));
  const stepById = new Map(stepNodes.map((node) => [String(node.id), node]));
  const sourceStepById = new Map();
  const contractsByStep = new Map();
  const originalRefsByStep = new Map();

  for (let index = 0; index < stepNodes.length; index += 1) {
    const node = stepNodes[index];
    const sourceStep = sourceStepForNode(node, index, steps);
    sourceStepById.set(String(node.id), sourceStep);
    originalRefsByStep.set(String(node.id), asArray(node.scaffoldNodes).map(String));

    // A função também é usada antes/fora do late sync. Traga para o nó as
    // fontes emitíveis mais novas de steps[] para que a edge criada abaixo já
    // seja executável imediatamente, e não apenas depois de outra fase.
    if (sourceStep && Array.isArray(sourceStep.options)) {
      node.expectedInput = node.expectedInput || {};
      node.expectedInput.visualConfig = node.expectedInput.visualConfig || {};
      if (
        JSON.stringify(node.expectedInput.visualConfig.options || []) !==
        JSON.stringify(sourceStep.options)
      ) {
        node.expectedInput.visualConfig.options = sourceStep.options;
        repairs.push(`${label}: options finais sincronizadas em ${node.id} antes da remediação`);
      }
    }
    if (sourceStep && Array.isArray(sourceStep.misconceptions)) {
      const currentIds = new Set(
        asArray(node.misconceptions)
          .map((item) => nonEmptyString(item?.id || item?.misconceptionId))
          .filter(Boolean)
      );
      const missing = sourceStep.misconceptions.filter((item) => {
        const id = nonEmptyString(item?.id || item?.misconceptionId);
        return id && !currentIds.has(id);
      });
      if (missing.length) {
        node.misconceptions = [...asArray(node.misconceptions), ...missing];
        repairs.push(
          `${label}: ${missing.length} misconception(s) finais sincronizada(s) em ${node.id}`
        );
      }
    }

    // Declarações sem resposta errada nem option.value não podem ser emitidas
    // pelo BehaviorGraphEngine. Mantê-las criaria um scaffold inalcançável.
    const allContracts = collectMisconceptionContracts(node, sourceStep);
    const nonEmittable = allContracts.filter((contract) => contract.wrongAnswers.length === 0);
    for (const contract of nonEmittable) {
      removeMisconceptionContract(node, contract.id);
      removeMisconceptionContract(sourceStep, contract.id);
      repairs.push(
        `${label}: misconception não emitível "${contract.id}" removida (passo ${node.id})`
      );
    }
    contractsByStep.set(
      String(node.id),
      new Map(
        collectMisconceptionContracts(node, sourceStep)
          .filter((contract) => contract.wrongAnswers.length > 0)
          .map((contract) => [contract.id, contract])
      )
    );
  }

  // Edges produzidas pelo sanitizer por round-robin podiam associar
  // misconception(X) a scaffold(Y). Também remove condições que o runtime não
  // consegue emitir porque X já não existe no nó/opções finais.
  const cleanedAdaptiveEdges = [];
  let removedStale = 0;
  let removedMisaligned = 0;
  for (const edge of graph.edges) {
    const source = stepById.get(String(edge.from));
    const mid = misconceptionIdFromCondition(edge.condition);
    if (!source || !mid) {
      cleanedAdaptiveEdges.push(edge);
      continue;
    }
    const contract = contractsByStep.get(String(source.id))?.get(mid);
    const target = nodeById.get(String(edge.to));
    if (!contract) {
      // 2026-08-02 (merge): "obsoleta" exige EVIDÊNCIA de que o erro sumiu.
      //
      // Com `steps` em mãos a ausência de contrato É evidência (a option deixou
      // de ser emitível) e a remoção continua valendo. Sem `steps`, porém, não
      // dá para concluir nada: se o próprio grafo mantém um scaffold declarado
      // para essa misconception, a rota segue legítima. Remover nesse caso
      // derrubava em cascata a aresta, o scaffold e o contrato adaptativo.
      const semEvidenciaDeSteps = !Array.isArray(steps) || steps.length === 0;
      // Se o nó-origem DECLARA misconceptions e essa não está entre os contratos
      // válidos, isso é evidência de invalidez (ex.: erro sem resposta emitível)
      // e a remoção continua. A preservação vale só para o silêncio total.
      const fonteNaoDeclara =
        !Array.isArray(source?.misconceptions) || source.misconceptions.length === 0;
      const semQualquerEvidencia = semEvidenciaDeSteps && fonteNaoDeclara;
      if (!semQualquerEvidencia || !scaffoldMatchesMisconception(target, mid)) {
        removedStale += 1;
        continue;
      }
    }
    if (!scaffoldMatchesMisconception(target, mid)) {
      removedMisaligned += 1;
      continue;
    }
    cleanedAdaptiveEdges.push(edge);
  }
  graph.edges = cleanedAdaptiveEdges;
  if (removedStale) {
    repairs.push(`${label}: ${removedStale} edge(s) de misconception obsoleta(s) removida(s)`);
  }
  if (removedMisaligned) {
    repairs.push(
      `${label}: ${removedMisaligned} edge(s) misconception→scaffold semanticamente incorreta(s) removida(s)`
    );
  }

  const assignedByStep = new Map(stepNodes.map((node) => [String(node.id), new Set()]));

  for (const stepNode of stepNodes) {
    const contracts = contractsByStep.get(String(stepNode.id)) || new Map();
    for (const contract of contracts.values()) {
      const edge = graph.edges.find(
        (candidate) =>
          String(candidate.from) === String(stepNode.id) &&
          misconceptionIdFromCondition(candidate.condition) === contract.id &&
          scaffoldMatchesMisconception(nodeById.get(String(candidate.to)), contract.id)
      );
      let scaffold = edge ? nodeById.get(String(edge.to)) : null;
      if (!scaffold) {
        scaffold = graph.nodes.find((node) => scaffoldMatchesMisconception(node, contract.id));
      }

      if (!scaffold && !synthesizeScaffolds) {
        removeMisconceptionContract(stepNode, contract.id);
        removeMisconceptionContract(sourceStepById.get(String(stepNode.id)), contract.id);
        repairs.push(
          `${label}: misconception "${contract.id}" sem scaffold — removida (passo ${stepNode.id})`
        );
        continue;
      }

      if (!scaffold) {
        const scaffoldId = allocateScaffoldId(contract.id, nodeById);
        scaffold = {
          id: scaffoldId,
          type: "scaffold",
          description: `Remediação: ${contract.description || contract.id}`,
          targetMisconception: contract.id,
          instruction:
            contract.feedback ||
            contract.description ||
            "Vamos revisar este raciocínio passo a passo antes de tentar novamente.",
          expectedInput: null,
          knowledgeComponents: asArray(stepNode.knowledgeComponents).slice(),
          subSteps: [],
        };
        graph.nodes.push(scaffold);
        nodeById.set(String(scaffold.id), scaffold);
        repairs.push(
          `${label}: scaffold ${scaffold.id} sintetizado para "${contract.id}" (passo ${stepNode.id})`
        );
      } else if (!nonEmptyString(scaffold.targetMisconception)) {
        scaffold.targetMisconception = contract.id;
        repairs.push(`${label}: ${scaffold.id}.targetMisconception alinhado a "${contract.id}"`);
      }

      const condition = `misconception(${contract.id})`;
      ensureExactEdge(
        graph,
        stepNode.id,
        scaffold.id,
        condition,
        repairs,
        label,
        `edge ${stepNode.id}→${scaffold.id} (${condition}) adicionada`
      );
      assignedByStep.get(String(stepNode.id)).add(String(scaffold.id));
    }
  }

  // Preserva no máximo um scaffold genérico explicitamente listado por step.
  // Mais de um `struggles` é inexequível: o runtime sempre escolheria o primeiro.
  for (const stepNode of stepNodes) {
    const assigned = assignedByStep.get(String(stepNode.id));
    const existingStruggles = graph.edges.filter(
      (edge) =>
        String(edge.from) === String(stepNode.id) &&
        isStrugglesCondition(edge.condition) &&
        nodeById.get(String(edge.to))?.type === "scaffold"
    );
    let genericTarget = existingStruggles[0]?.to || null;
    if (!genericTarget) {
      genericTarget = originalRefsByStep
        .get(String(stepNode.id))
        ?.find(
          (id) =>
            !assigned.has(String(id)) &&
            nodeById.get(String(id))?.type === "scaffold" &&
            !nonEmptyString(nodeById.get(String(id))?.targetMisconception)
        );
    }
    if (genericTarget) {
      ensureExactEdge(
        graph,
        stepNode.id,
        genericTarget,
        "struggles",
        repairs,
        label,
        `edge genérica ${stepNode.id}→${genericTarget} (struggles) adicionada`
      );
      assigned.add(String(genericTarget));
      if (!hasScaffoldTrigger(stepNode)) {
        stepNode.scaffoldTrigger = { ...(stepNode.scaffoldTrigger || {}), maxAttempts: 2 };
        repairs.push(`${label}: scaffoldTrigger.maxAttempts=2 adicionado ao passo ${stepNode.id}`);
      }
    }
  }

  // Deduplica `struggles` por step; caminhos específicos misconception(X)
  // continuam todos preservados.
  const firstStrugglesByStep = new Set();
  graph.edges = graph.edges.filter((edge) => {
    if (!stepById.has(String(edge.from)) || !isStrugglesCondition(edge.condition)) return true;
    const key = String(edge.from);
    if (firstStrugglesByStep.has(key)) return false;
    firstStrugglesByStep.add(key);
    return true;
  });

  // Scaffolds sem entrada adaptativa são conteúdo morto. Só estes nós são
  // removidos; scaffolds ligados a qualquer contrato válido são preservados.
  const liveScaffoldIds = new Set(
    graph.edges
      .filter(
        (edge) =>
          stepById.has(String(edge.from)) &&
          isRemediationCondition(edge.condition) &&
          nodeById.get(String(edge.to))?.type === "scaffold"
      )
      .map((edge) => String(edge.to))
  );
  const deadScaffoldIds = new Set(
    graph.nodes
      .filter((node) => node.type === "scaffold" && !liveScaffoldIds.has(String(node.id)))
      .map((node) => String(node.id))
  );
  if (deadScaffoldIds.size) {
    graph.nodes = graph.nodes.filter((node) => !deadScaffoldIds.has(String(node.id)));
    graph.edges = graph.edges.filter(
      (edge) => !deadScaffoldIds.has(String(edge.from)) && !deadScaffoldIds.has(String(edge.to))
    );
    repairs.push(
      `${label}: ${deadScaffoldIds.size} scaffold(s) sem entrada executável removido(s)`
    );
    nodeById = new Map(graph.nodes.map((node) => [String(node.id), node]));
  }

  // Cada entrada tem retorno explícito ao seu próprio step. Um scaffold pode
  // ser compartilhado por duas ocorrências da mesma misconception; nesse caso
  // há um retorno por origem e o stack do frontend seleciona o correto.
  const remediationEntries = graph.edges.filter(
    (edge) =>
      stepById.has(String(edge.from)) &&
      nodeById.get(String(edge.to))?.type === "scaffold" &&
      isRemediationCondition(edge.condition)
  );
  for (const entry of remediationEntries) {
    ensureExactEdge(
      graph,
      entry.to,
      entry.from,
      "correct",
      repairs,
      label,
      `retorno ${entry.to}→${entry.from} adicionado`
    );
  }

  // scaffoldNodes passa a refletir exatamente as arestas que o runtime pode
  // seguir, eliminando referências históricas/fantasmas.
  for (const stepNode of stepNodes) {
    const liveRefs = [];
    for (const edge of graph.edges) {
      if (
        String(edge.from) === String(stepNode.id) &&
        isRemediationCondition(edge.condition) &&
        nodeById.get(String(edge.to))?.type === "scaffold" &&
        !liveRefs.includes(String(edge.to))
      ) {
        liveRefs.push(String(edge.to));
      }
    }
    const beforeRefs = asArray(stepNode.scaffoldNodes).map(String);
    if (JSON.stringify(beforeRefs) !== JSON.stringify(liveRefs)) {
      stepNode.scaffoldNodes = liveRefs;
      repairs.push(`${label}: scaffoldNodes de ${stepNode.id} sincronizado (${liveRefs.length})`);
    }
  }

  graph.edges = dedupEdges(graph.edges);
}

// ============================================================
// 2026-08-02 — Degradação graceful da camada adaptativa
// ============================================================
// Diretriz do produto: "o sistema deve SEMPRE ser capaz de criar STIs".
// Antes desta poda, um contrato adaptativo inexequível após o reparo semântico
// derrubava o STI INTEIRO com 500 ("inconsistencia estrutural — retente") —
// observado em produção no STI "soma de fracoes" (P3 com 1 misconception sem
// scaffold + 8 violações semânticas nos 3 problemas). Agora o gate poda as
// misconceptions inexequíveis e cobre os passos com a safety-net genérica
// (mesmo padrão scaffold_generic + struggles que o semantic sync já usa).
// O aluno perde a remediação ESPECÍFICA daquele erro, mas mantém dicas do
// passo + remediação genérica — nunca perde o STI.

/** true quando a auditoria pós-reparo ainda tem defeito adaptativo podável. */
function adaptiveLayerNeedsPrune(after) {
  return (
    (after.orphanMisconceptions?.length || 0) > 0 ||
    (after.nonEmittableMisconceptions?.length || 0) > 0 ||
    (after.misalignedMisconceptionEdges?.length || 0) > 0 ||
    (after.staleMisconceptionEdges?.length || 0) > 0 ||
    (after.unknownMisconceptionTriggers?.length || 0) > 0 ||
    (after.misroutedMisconceptionTriggers?.length || 0) > 0 ||
    (after.missingMisconceptionTriggers?.length || 0) > 0 ||
    (after.duplicateMisconceptionTriggers?.length || 0) > 0 ||
    (after.misroutedStruggleTriggers?.length || 0) > 0 ||
    (after.unreachableScaffolds?.length || 0) > 0 ||
    !after.adaptiveOk
  );
}

/**
 * Poda misconceptions inexequíveis do grafo (mutativo) e garante safety-net
 * genérica nos passos afetados. Retorna { repairs, pruned }.
 */
function pruneInfeasibleAdaptiveLayer(graph, steps, audit, label) {
  const repairs = [];
  const infeasibleIds = new Set();
  const collect = (entries, key = "misconceptionId") => {
    for (const entry of entries || []) {
      const id = entry?.[key] ?? entry?.id;
      if (id && id !== "generic_struggle") infeasibleIds.add(String(id));
    }
  };
  collect(audit.orphanMisconceptions);
  collect(audit.nonEmittableMisconceptions);
  collect(audit.misalignedMisconceptionEdges);
  collect(audit.staleMisconceptionEdges);
  collect(audit.unknownMisconceptionTriggers);
  collect(audit.misroutedMisconceptionTriggers);
  collect(audit.missingMisconceptionTriggers);
  collect(audit.duplicateMisconceptionTriggers);
  if (!infeasibleIds.size) return { repairs, pruned: [] };

  // 1. Scaffolds mirando as misconceptions podadas saem do grafo (com as arestas)
  const removedScaffoldIds = new Set(
    graph.nodes
      .filter(
        (node) =>
          node.type === "scaffold" && infeasibleIds.has(String(node.targetMisconception || ""))
      )
      .map((node) => String(node.id))
  );
  // Scaffolds inalcançáveis da auditoria também saem (são lixo pós-poda)
  for (const entry of audit.unreachableScaffolds || []) {
    const id = entry?.scaffold ?? entry?.id ?? entry?.to;
    if (id) removedScaffoldIds.add(String(id));
  }
  graph.nodes = graph.nodes.filter((node) => !removedScaffoldIds.has(String(node.id)));

  // 2. Arestas: fora as que disparam as misconceptions podadas ou tocam scaffolds removidos
  const beforeEdges = graph.edges.length;
  graph.edges = graph.edges.filter((edge) => {
    const mid = misconceptionIdFromCondition(edge.condition);
    if (mid && infeasibleIds.has(String(mid))) return false;
    if (removedScaffoldIds.has(String(edge.from)) || removedScaffoldIds.has(String(edge.to)))
      return false;
    return true;
  });
  const removedEdges = beforeEdges - graph.edges.length;

  // 3. Step nodes: limpa contratos podados (misconceptions, refs, options)
  const affectedStepIds = new Set();
  for (const node of graph.nodes.filter((n) => n.type === "step")) {
    if (Array.isArray(node.misconceptions)) {
      const kept = node.misconceptions.filter(
        (m) => !infeasibleIds.has(String(m?.id || m?.misconceptionId || ""))
      );
      if (kept.length !== node.misconceptions.length) {
        node.misconceptions = kept;
        affectedStepIds.add(String(node.id));
      }
    }
    if (Array.isArray(node.scaffoldNodes)) {
      node.scaffoldNodes = node.scaffoldNodes.filter((id) => !removedScaffoldIds.has(String(id)));
    }
    for (const collection of misconceptionOptionCollections(node)) {
      for (const option of asArray(collection)) {
        if (!option) continue;
        // 2026-08-02: mesma chave do contrato — options são identificadas por
        // misconceptionId PRIMEIRO (é o que o runtime emite ao clicar)
        const contractKey = String(option.misconceptionId || option.id || "");
        if (infeasibleIds.has(contractKey)) {
          delete option.misconceptionId; // distrator vira neutro (sem remediação específica)
          affectedStepIds.add(String(node.id));
        }
      }
    }
  }

  // 4. Safety-net: passo que perdeu TODA rota específica e não tem saída
  // genérica ganha um scaffold_generic próprio (contrato que o audit aceita:
  // struggles → scaffold(target=generic_struggle) → retorno correct/default).
  for (const node of graph.nodes.filter((n) => n.type === "step")) {
    const stepId = String(node.id);
    const hasSpecificRoute = graph.edges.some((edge) => {
      if (String(edge.from) !== stepId) return false;
      const mid = misconceptionIdFromCondition(edge.condition);
      return mid && !infeasibleIds.has(String(mid));
    });
    const hasGenericRoute = graph.edges.some(
      (edge) => String(edge.from) === stepId && /struggles/i.test(String(edge.condition || ""))
    );
    if (hasSpecificRoute || hasGenericRoute) continue;
    const scaffoldId = `scaffold_pruned_${stepId}`;
    if (!graph.nodes.some((n) => String(n.id) === scaffoldId)) {
      graph.nodes.push({
        id: scaffoldId,
        type: "scaffold",
        description:
          "Vamos reconstruir o raciocínio passo a passo, começando pelo que você já sabe.",
        targetMisconception: "generic_struggle",
        instruction:
          "Releia o enunciado com calma e tente identificar o que está sendo perguntado. Depois, divida o problema em partes menores e resolva uma de cada vez.",
        expectedInput: null,
        knowledgeComponents: asArray(node.knowledgeComponents).slice(),
        subSteps: [],
        source: "pruned_adaptive_safety_net",
      });
    }
    graph.edges.push({ from: stepId, to: scaffoldId, condition: "struggles" });
    graph.edges.push({ from: scaffoldId, to: stepId, condition: "correct" });
    affectedStepIds.add(stepId);
  }

  graph.edges = dedupEdges(graph.edges);
  repairs.push(
    `${label}: camada adaptativa degradada — ${infeasibleIds.size} misconception(s) inexequível(eis) podada(s), ${removedEdges} aresta(s) removida(s), ${affectedStepIds.size} passo(s) coberto(s) por safety-net genérica`
  );
  return { repairs, pruned: [...infeasibleIds] };
}

/**
 * Reforça as invariantes estruturais e semânticas sobre `graph` (mutativo). `steps` (opcional)
 * são os steps[] reais do problema — usados só p/ contexto; a ordem do backbone é
 * derivada dos próprios nós (sufixo step_N, consolidator por último).
 *
 * @returns {{repairs: string[], fatal: string[], audit: object}}
 */
export function enforceBehaviorGraphIntegrity(graph, steps = [], opts = {}) {
  const repairs = [];
  const fatal = [];
  const label = opts.label || "graph";
  const synthesizeScaffolds = opts.synthesizeScaffolds !== false; // default: sintetiza

  if (!graph || typeof graph !== "object") {
    return { repairs, fatal, audit: auditBehaviorGraph(graph, steps) };
  }
  if (!Array.isArray(graph.nodes)) graph.nodes = [];
  if (!Array.isArray(graph.edges)) graph.edges = [];

  // Normaliza a semântica adaptativa: `A -> B skip_if_mastered(KC)` significa
  // "ao chegar em B, pule B se a KC DE B já estiver dominada". Vários agentes
  // geravam a KC de outro passo (e até skip para goal), fazendo o frontend
  // saltar etapas erradas. Corrige antes do fast-path estrutural.
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const normalizedAdaptiveEdges = [];
  for (const edge of graph.edges) {
    const match = String(edge.condition || "").match(/^skip_if_mastered\(([^,]+),\s*([\d.]+)\)$/);
    if (!match) {
      normalizedAdaptiveEdges.push(edge);
      continue;
    }
    const target = nodeById.get(edge.to);
    const targetKc = target?.type === "step" ? target.knowledgeComponents?.[0] : null;
    if (!targetKc) {
      // 2026-08-02 (merge): remover so quando da pra PROVAR que o alvo esta
      // errado. Um passo que sequer declara knowledgeComponents nao autoriza
      // concluir isso, e derrubar a aresta arrastava junto a misconception
      // ("obsoleta") e o scaffold ("sem entrada executavel") — o grafo
      // adaptativo inteiro desaparecia por falta de metadado.
      const alvoEhPasso = target?.type === "step";
      const alvoDeclaraKcs = Array.isArray(target?.knowledgeComponents);
      if (alvoEhPasso && !alvoDeclaraKcs) {
        normalizedAdaptiveEdges.push(edge);
        continue;
      }
      repairs.push(`${label}: skip adaptativo ${edge.from}→${edge.to} sem KC-alvo removido`);
      continue;
    }
    const normalizedCondition = `skip_if_mastered(${targetKc}, ${match[2]})`;
    if (normalizedCondition !== edge.condition) {
      repairs.push(`${label}: skip adaptativo ${edge.from}→${edge.to} alinhado à KC "${targetKc}"`);
    }
    normalizedAdaptiveEdges.push({ ...edge, condition: normalizedCondition });
  }
  graph.edges = dedupEdges(normalizedAdaptiveEdges);

  // Não há fast-path aqui: `steps[]` pode conter options/misconceptionIds mais
  // recentes que ainda não foram copiados para os nós. O antigo retorno por
  // `before.ok` foi justamente o que deixou os artefatos auditados escaparem.
  // As rotinas abaixo são idempotentes, então grafos saudáveis continuam com
  // zero repairs sem sacrificar a conferência cruzada graph↔steps.
  // 2026-08-02 (merge): mantida a REMOÇÃO do fast-path (decisão verificada na
  // auditoria) e adotada a assinatura (graph, steps) das PRs #27-#33, que dá ao
  // auditor o lado dos steps para a conferência cruzada.
  const before = auditBehaviorGraph(graph, steps);

  // ---- 0. Garante nós start e goal ----
  if (!graph.nodes.find((n) => n.type === "start")) {
    graph.nodes.unshift({ id: "start", type: "start", description: "Inicio" });
    repairs.push(`${label}: nó start ausente — adicionado`);
  }
  if (!graph.nodes.find((n) => n.type === "goal")) {
    graph.nodes.push({ id: "goal", type: "goal", description: "Conclusão" });
    repairs.push(`${label}: nó goal ausente — adicionado`);
  }
  const startNode = graph.nodes.find((n) => n.type === "start");
  const goalNode = graph.nodes.find((n) => n.type === "goal");

  // ---- 1. Bijeção e contrato step final ↔ nó executável ----
  const stepContractSync = synchronizeBehaviorGraphStepContracts(graph, steps, { label });
  repairs.push(...stepContractSync.repairs);

  // ---- 2. Ordem canônica dos passos reais ----
  const ids = new Set(graph.nodes.map((n) => n.id));
  const stepNodes = graph.nodes.filter((n) => n.type === "step");
  const orderedStepIds =
    Array.isArray(steps) && steps.length > 0
      ? canonicalGraphStepIds(steps)
      : stepNodes
          .map((n, arrIdx) => ({ id: n.id, rank: stepRank(n.id), arrIdx }))
          .sort((a, b) => a.rank - b.rank || a.arrIdx - b.arrIdx)
          .map((x) => x.id);

  // Alvo real p/ uma aresta forward que apontava p/ um passo-fantasma:
  // o menor passo real com sufixo >= sufixo do fantasma; senão o próximo passo
  // depois de `from`; senão goal.
  function redirectTargetFor(phantomId, fromId) {
    const want = numericSuffix(phantomId);
    if (want != null) {
      let best = null;
      let bestSuffix = Infinity;
      for (const sid of orderedStepIds) {
        const suf = numericSuffix(sid);
        if (suf != null && suf >= want && suf < bestSuffix) {
          best = sid;
          bestSuffix = suf;
        }
      }
      if (best) return best;
    }
    const fi = orderedStepIds.indexOf(fromId);
    if (fi >= 0 && fi + 1 < orderedStepIds.length) return orderedStepIds[fi + 1];
    return goalNode.id;
  }

  // ---- 3. Integridade referencial: redireciona/remove arestas fantasma ----
  const cleaned = [];
  let redirected = 0;
  let dropped = 0;
  for (const e of graph.edges) {
    const fromOk = ids.has(e.from);
    const toOk = ids.has(e.to);
    if (fromOk && toOk) {
      cleaned.push(e);
      continue;
    }
    if (!fromOk) {
      // Origem inexistente — aresta órfã, descarta.
      dropped++;
      continue;
    }
    // from existe, to é fantasma:
    if (isForwardCondition(e.condition) && looksLikeStepId(e.to)) {
      const redirect = redirectTargetFor(e.to, e.from);
      if (redirect && redirect !== e.from && ids.has(redirect)) {
        cleaned.push({ ...e, to: redirect });
        redirected++;
      } else {
        dropped++;
      }
    } else {
      // Forward p/ não-passo, ou misconception/struggle p/ scaffold fantasma:
      // descarta (backbone garante conectividade; scaffold é re-sintetizado em C3).
      dropped++;
    }
  }
  graph.edges = dedupEdges(cleaned);
  if (redirected)
    repairs.push(`${label}: ${redirected} aresta(s) p/ nó-fantasma redirecionada(s) p/ passo real`);
  if (dropped) repairs.push(`${label}: ${dropped} aresta(s) inválida(s) removida(s)`);

  // ---- 4. Backbone canônico EXATO start→todos os steps→goal ----
  // Remove atalhos/duplicatas/defaults concorrentes. Arestas adaptativas
  // (misconception/struggle) e retornos de scaffold permanecem intactos.
  const backboneOrigins = new Set([startNode.id, ...orderedStepIds]);
  const beforeBackbone = graph.edges.length;
  const invalidStartEdges = graph.edges.filter(
    (edge) => edge.from === startNode.id && edge.condition !== "default"
  );
  graph.edges = graph.edges.filter((edge) => edge.from !== startNode.id);
  if (invalidStartEdges.length > 0) {
    repairs.push(
      `${label}: ${invalidStartEdges.length} desvio(s) inválido(s) saindo de start removido(s)`
    );
  }

  // ---- 4. misconception/opção emitível ↔ scaffold ↔ retorno ao step ----
  normalizeAdaptiveScaffolds(
    graph,
    stepNodes,
    steps,
    { ...opts, synthesizeScaffolds },
    repairs,
    label
  );
  graph.edges = graph.edges.filter(
    (edge) => !(backboneOrigins.has(edge.from) && isBackboneCondition(edge.condition))
  );
  const canonicalBackbone = [];
  if (orderedStepIds.length === 0) {
    canonicalBackbone.push({ from: startNode.id, to: goalNode.id, condition: "default" });
  } else {
    canonicalBackbone.push({
      from: startNode.id,
      to: orderedStepIds[0],
      condition: "default",
    });
    for (let index = 0; index < orderedStepIds.length; index++) {
      canonicalBackbone.push({
        from: orderedStepIds[index],
        to: orderedStepIds[index + 1] || goalNode.id,
        condition: "correct",
      });
    }
  }
  graph.edges.push(...canonicalBackbone);
  graph.edges = dedupEdges(graph.edges);
  const previousForwardCount = beforeBackbone - graph.edges.length + canonicalBackbone.length;
  if (
    before.canonicalBackboneViolations?.length > 0 ||
    previousForwardCount !== canonicalBackbone.length
  ) {
    repairs.push(`${label}: backbone canônico recompilado sem atalhos concorrentes`);
  }

  // ---- 5. Semântica adaptativa executável ----
  // Os steps finais vencem o template genérico: para cada distrator concreto,
  // recompila a cadeia 1:1 option→misconception→scaffold→mesmo step.
  const semanticSync = synchronizeBehaviorGraphSemantics(graph, steps, {
    label,
    synthesizeScaffolds,
    ensureAdaptiveCoverage: opts.ensureAdaptiveCoverage,
    outputLanguageCode: opts.outputLanguageCode,
    // 2026-08-02: a decomposição que o autor escreveu por erro vive no
    // scaffoldBank do tutor; sem repassá-la, o scaffold vira feedback repetido.
    scaffoldBank: opts.scaffoldBank,
  });
  repairs.push(...semanticSync.repairs);

  // ---- 6. Verificação final ----
  let after = auditBehaviorGraph(graph, steps);

  // 2026-08-02 (degradação graceful — "o sistema deve SEMPRE criar STIs"):
  // se a camada adaptativa ficou inexequível MESMO após o reparo semântico,
  // poda os contratos quebrados (misconception sem rota executável) e cobre os
  // passos com a safety-net genérica. Um STI com remediação genérica é jogável
  // e pedagogicamente válido; um STI rejeitado não serve a ninguém. Fatal fica
  // reservado pra falha ESTRUTURAL (desconexo/aresta solta/backbone).
  if (synthesizeScaffolds && adaptiveLayerNeedsPrune(after)) {
    const prune = pruneInfeasibleAdaptiveLayer(graph, steps, after, label);
    if (prune.pruned.length > 0) {
      repairs.push(...prune.repairs);
      after = auditBehaviorGraph(graph, steps);
    }
  }

  if (!after.connected) fatal.push(`${label}: grafo permanece DESCONEXO após reparo`);
  if (after.dangling.length)
    fatal.push(`${label}: ${after.dangling.length} aresta(s) solta(s) restante(s) após reparo`);
  if (after.orphanMisconceptions.length && synthesizeScaffolds)
    fatal.push(
      `${label}: ${after.orphanMisconceptions.length} misconception(s) sem scaffold após reparo`
    );
  if (!after.adaptiveOk) {
    fatal.push(`${label}: contrato adaptativo permanece inexequível após reparo`);
  }
  if (after.canonicalBackboneViolations.length) {
    fatal.push(
      `${label}: ${after.canonicalBackboneViolations.length} violação(ões) do backbone canônico`
    );
  }
  if (!after.ok && after.connected && after.dangling.length === 0) {
    const semanticCount = countBehaviorGraphSemanticDefects(after);
    if (semanticCount > 0) {
      fatal.push(`${label}: ${semanticCount} violação(ões) semântica(s) no behavior graph`);
    }
  }

  return { repairs, fatal, audit: after, before };
}

/**
 * Conveniência: aplica enforceBehaviorGraphIntegrity em TODOS os problems[].behaviorGraph
 * de um tutor. Devolve {repairs, fatal} agregados. Não toca em tutor.behaviorGraph
 * (grafo de nível-tutor) — só nos por-problema, que são os entregues ao aluno.
 */
export function enforceTutorBehaviorGraphs(tutor, opts = {}) {
  const repairs = [];
  const fatal = [];
  const problems = Array.isArray(tutor?.problems) ? tutor.problems : [];
  for (let pi = 0; pi < problems.length; pi++) {
    const prob = problems[pi];
    const bg = prob?.behaviorGraph;
    if (!bg || !Array.isArray(bg.nodes) || bg.nodes.length === 0) continue;
    const r = enforceBehaviorGraphIntegrity(bg, prob.steps || [], {
      ...opts,
      label: opts.label ? `${opts.label} P${prob.id ?? pi + 1}` : `P${prob.id ?? pi + 1}`,
    });
    repairs.push(...r.repairs);
    fatal.push(...r.fatal);
  }
  return { repairs, fatal };
}
