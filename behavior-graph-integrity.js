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
 *   C3. misconception↔scaffold — todo erro reconhecido tem nó de remediação.
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

/** Reachability start→goal só por nós reais e arestas forward (idêntico ao audit). */
function reachForward(startId, goalId, edges, ids) {
  const seen = new Set([startId]);
  const stack = [startId];
  while (stack.length) {
    const cur = stack.pop();
    if (cur === goalId) return true;
    for (const e of edges) {
      if (e.from === cur && ids.has(e.to) && isForwardCondition(e.condition) && !seen.has(e.to)) {
        seen.add(e.to);
        stack.push(e.to);
      }
    }
  }
  return false;
}

// ============================================================
// AUDITORIA (read-only) — mesma semântica do script de auditoria
// ============================================================

/**
 * Audita um único behaviorGraph. Retorna {ok, dangling, phantomTargets, connected,
 * orphanMisconceptions, hasStart, hasGoal, stepCount}.
 */
export function auditBehaviorGraph(graph) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  const ids = new Set(nodes.map((n) => n.id));
  const stepNodes = nodes.filter((n) => n.type === "step");
  const scaffoldTargets = new Set(
    nodes.filter((n) => n.type === "scaffold").map((n) => n.targetMisconception)
  );
  const start = nodes.find((n) => n.type === "start");
  const goal = nodes.find((n) => n.type === "goal");

  const dangling = edges.filter((e) => !ids.has(e.from) || !ids.has(e.to));
  const phantomTargets = {};
  for (const e of dangling) {
    for (const x of [e.from, e.to])
      if (!ids.has(x)) phantomTargets[x] = (phantomTargets[x] || 0) + 1;
  }

  const connected = !!(start && goal && reachForward(start.id, goal.id, edges, ids));

  const orphanMisconceptions = [];
  for (const s of stepNodes) {
    for (const m of s.misconceptions || []) {
      const mid = m.id || m.misconceptionId;
      if (!mid) continue;
      if (!(ids.has("scaffold_" + mid) || scaffoldTargets.has(mid))) {
        orphanMisconceptions.push({ step: s.id, misconceptionId: mid });
      }
    }
  }

  return {
    ok: dangling.length === 0 && connected && orphanMisconceptions.length === 0,
    dangling,
    phantomTargets,
    connected,
    orphanMisconceptions,
    hasStart: !!start,
    hasGoal: !!goal,
    stepCount: stepNodes.length,
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

/** Garante UMA aresta forward from→to (não duplica se já houver caminho forward). */
function ensureForwardEdge(graph, from, to, condition, repairs, label) {
  if (from === to) return;
  const exists = graph.edges.some(
    (e) => e.from === from && e.to === to && isForwardCondition(e.condition)
  );
  if (!exists) {
    graph.edges.push({ from, to, condition });
    repairs.push(`${label}: aresta ${from}→${to} (${condition}) adicionada`);
  }
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

/**
 * Reforça as 3 invariantes estruturais sobre `graph` (mutativo). `steps` (opcional)
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
    return { repairs, fatal, audit: auditBehaviorGraph(graph) };
  }
  if (!Array.isArray(graph.nodes)) graph.nodes = [];
  if (!Array.isArray(graph.edges)) graph.edges = [];

  const before = auditBehaviorGraph(graph);
  // Fast-path: já íntegro — nada a fazer (evita churn em grafos saudáveis).
  if (before.ok) return { repairs, fatal, audit: before };

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

  // ---- 1. Ordem canônica dos passos reais ----
  const ids = new Set(graph.nodes.map((n) => n.id));
  const stepNodes = graph.nodes.filter((n) => n.type === "step");
  const orderedStepIds = stepNodes
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

  // ---- 2. Integridade referencial: redireciona/remove arestas fantasma ----
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

  // ---- 3. Conectividade: backbone canônico start→…→goal (só ADICIONA) ----
  if (orderedStepIds.length === 0) {
    ensureForwardEdge(graph, startNode.id, goalNode.id, "default", repairs, label);
  } else {
    ensureForwardEdge(graph, startNode.id, orderedStepIds[0], "default", repairs, label);
    for (let i = 0; i < orderedStepIds.length - 1; i++) {
      ensureForwardEdge(graph, orderedStepIds[i], orderedStepIds[i + 1], "correct", repairs, label);
    }
    ensureForwardEdge(
      graph,
      orderedStepIds[orderedStepIds.length - 1],
      goalNode.id,
      "correct",
      repairs,
      label
    );
  }

  // ---- 4. misconception ↔ scaffold ----
  const liveIds = new Set(graph.nodes.map((n) => n.id));
  const scaffoldTargets = new Set(
    graph.nodes.filter((n) => n.type === "scaffold").map((n) => n.targetMisconception)
  );
  for (const s of stepNodes) {
    if (!Array.isArray(s.misconceptions) || s.misconceptions.length === 0) continue;
    const keep = [];
    for (const m of s.misconceptions) {
      const mid = m.id || m.misconceptionId;
      if (!mid) {
        keep.push(m);
        continue;
      }
      const resolved = liveIds.has("scaffold_" + mid) || scaffoldTargets.has(mid);
      if (resolved) {
        keep.push(m);
        continue;
      }
      if (!synthesizeScaffolds) {
        repairs.push(`${label}: misconception "${mid}" sem scaffold — removida (passo ${s.id})`);
        continue; // descarta a misconception órfã
      }
      // Sintetiza scaffold de remediação (mesma forma do GraphForge).
      const scId = "scaffold_" + mid;
      if (!liveIds.has(scId)) {
        graph.nodes.push({
          id: scId,
          type: "scaffold",
          description: "Remediação: " + (m.description || mid),
          targetMisconception: mid,
          instruction: m.feedback || m.remediation || null,
          expectedInput: null,
          knowledgeComponents: Array.isArray(s.knowledgeComponents)
            ? s.knowledgeComponents.slice()
            : [],
          subSteps: [],
        });
        liveIds.add(scId);
        scaffoldTargets.add(mid);
      }
      ensureExactEdge(graph, s.id, scId, "misconception(" + mid + ")", repairs, label);
      ensureExactEdge(graph, scId, s.id, "correct", repairs, label);
      keep.push(m);
      repairs.push(`${label}: scaffold sintetizado p/ misconception "${mid}" (passo ${s.id})`);
    }
    s.misconceptions = keep;
  }

  // ---- 5. Verificação final ----
  const after = auditBehaviorGraph(graph);
  if (!after.connected) fatal.push(`${label}: grafo permanece DESCONEXO após reparo`);
  if (after.dangling.length)
    fatal.push(`${label}: ${after.dangling.length} aresta(s) solta(s) restante(s) após reparo`);
  if (after.orphanMisconceptions.length && synthesizeScaffolds)
    fatal.push(
      `${label}: ${after.orphanMisconceptions.length} misconception(s) sem scaffold após reparo`
    );

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
