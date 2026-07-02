/**
 * evaluation/graph-hallucination.js — Detecção de ALUCINAÇÃO ESTRUTURAL em behavior graphs.
 *
 * NÍVEL 1 da validação (handoff 2026-06-30): muita alucinação é detectável DE GRAÇA,
 * sem gabarito, só olhando a FORMA do grafo — ciclo patológico, nó órfão, beco sem
 * saída, over-branching. Literatura: Survey LLM-Generated Data (2601.17717, VR =
 * violações/checks), Continuous Monitoring (2509.03857, threshold dinâmico µ+λσ),
 * SentinelAgent (2505.24201, taxonomia nó/aresta/caminho), GraphEval (2407.10793,
 * julgar cada triple individualmente).
 *
 * DUROS (barram o grafo → hallucinationFlag=true; grafo inválido NÃO chega no aluno):
 *   backbone cíclico · ciclo patológico · nó inalcançável · beco sem saída ·
 *   scaffold órfão · aresta órfã.
 * MOLES (sinalizam revisão; alimentam hallucinationScore):
 *   over-branching · misconception sem scaffold · self-loop · aresta paralela.
 *
 * REGRA DE OURO (comparativos): um "extra" NÃO é alucinação por definição — é
 * CANDIDATO. A estrutura só sinaliza; quem decide (alucinação vs enriquecimento)
 * é o juiz cego cross-family (judge-misconceptions.js). Estrutura = detector;
 * juiz = veredito.
 *
 * Opera sobre o grafo de PRODUÇÃO do EducaOFF ({nodes,edges}, arestas com
 * `condition` classificada por bucketRole) — é onde os intrínsecos enxergam
 * scaffolds e arestas de erro, que o esquema neutro (só backbone) não carrega.
 * Os comparativos operam sobre o esquema NEUTRO (mesma construção nos dois
 * lados ⇒ comparável).
 *
 * Este módulo é PURO (só importa ./schema.js) — importável pelo agent5-validator
 * (agents/ → evaluation/) sem criar ciclo de dependência, pois evaluation nunca
 * importa o agent5.
 */

import { bucketRole, canonAnswer, toNeutral } from "./schema.js";

// ── Normalização interna ──────────────────────────────────────────────────────
// {nodes,edges} EducaOFF → forma de trabalho { nodes:Map, edges:[{from,to,role}] }.
// role ∈ correct|default|back|error (misconception/struggle → error).

function toWorkGraph(graph) {
  const nodes = new Map();
  for (const n of graph?.nodes || []) if (n && n.id != null) nodes.set(String(n.id), n);
  const edges = [];
  for (const e of graph?.edges || []) {
    if (!e) continue;
    const raw = e.role || bucketRole(e.condition);
    const role = raw === "misconception" || raw === "struggle" ? "error" : raw;
    edges.push({ from: String(e.from), to: String(e.to), role });
  }
  const byType = (t) => [...nodes.values()].filter((n) => n.type === t);
  const start = byType("start")[0] || nodes.get("start") || null;
  const goal = byType("goal")[0] || nodes.get("goal") || null;
  return {
    nodes,
    edges,
    startId: start ? String(start.id) : null,
    goalId: goal ? String(goal.id) : null,
  };
}

function adjacency(edges, { roles = null, reverse = false } = {}) {
  const adj = new Map();
  for (const e of edges) {
    if (roles && !roles.has(e.role)) continue;
    const [a, b] = reverse ? [e.to, e.from] : [e.from, e.to];
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a).push(b);
  }
  return adj;
}

/** BFS: conjunto de nós alcançáveis a partir de `from` (ids). */
export function reachableFrom(adj, from) {
  const seen = new Set(from == null ? [] : [from]);
  const queue = from == null ? [] : [from];
  while (queue.length) {
    const u = queue.shift();
    for (const v of adj.get(u) || []) {
      if (!seen.has(v)) {
        seen.add(v);
        queue.push(v);
      }
    }
  }
  return seen;
}

/** DFS 3-cores: arestas de retorno (back-edges) do subgrafo em `adj` — cada uma prova um ciclo. */
export function backEdges(adj, allNodes) {
  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
  const color = new Map([...allNodes].map((id) => [id, WHITE]));
  const found = [];
  const stack = [];
  const dfs = (u) => {
    color.set(u, GRAY);
    stack.push(u);
    for (const v of adj.get(u) || []) {
      if (color.get(v) === GRAY) {
        // ciclo: v ... u → v — recorta o trecho da pilha a partir de v
        const i = stack.indexOf(v);
        found.push({ from: u, to: v, cycle: [...stack.slice(i), v] });
      } else if (color.get(v) === WHITE) dfs(v);
    }
    stack.pop();
    color.set(u, BLACK);
  };
  for (const id of allNodes) if (color.get(id) === WHITE) dfs(id);
  return found;
}

/**
 * Ciclos simples representativos (um por back-edge do DFS). NÃO enumera todos os
 * ciclos (Johnson completo é exponencial); para o gate basta saber se EXISTE ciclo
 * e classificá-lo — cada ciclo elementar contém ≥1 back-edge, então nenhum ciclo
 * escapa da detecção (a lista é uma amostra representativa, não exaustiva).
 */
export function simpleCycles(edges, allNodes) {
  const adj = adjacency(edges);
  return backEdges(adj, allNodes).map((b) => b.cycle);
}

/** Grau de saída por nó (todas as arestas ou filtradas por roles). */
export function outDegrees(edges, { roles = null } = {}) {
  const deg = new Map();
  for (const e of edges) {
    if (roles && !roles.has(e.role)) continue;
    deg.set(e.from, (deg.get(e.from) || 0) + 1);
  }
  return deg;
}

const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// ── NÍVEL 1: indicadores INTRÍNSECOS (sem gabarito) ───────────────────────────

/**
 * Relatório intrínseco de um behavior graph EducaOFF ({nodes,edges}).
 * @returns {{ hard:object, soft:object, remediationCycles:number,
 *             hallucinationFlag:boolean, violationRate:number, checks:number }}
 */
export function intrinsicReport(graph) {
  const g = toWorkGraph(graph);
  const ids = new Set(g.nodes.keys());

  // aresta órfã: liga nó inexistente (checa ANTES de podar, sobre todas as arestas).
  const orphanEdges = g.edges.filter((e) => !ids.has(e.from) || !ids.has(e.to));
  const edges = g.edges.filter((e) => ids.has(e.from) && ids.has(e.to));

  // self-loops e arestas paralelas (ruído de geração).
  const selfLoops = edges.filter((e) => e.from === e.to);
  const seenPair = new Set();
  const parallelEdges = [];
  for (const e of edges) {
    const k = `${e.from}>${e.to}|${e.role}`;
    if (seenPair.has(k)) parallelEdges.push(k);
    else seenPair.add(k);
  }

  // backbone (só arestas `correct`) deve ser ACÍCLICO — raciocínio circular é alucinação.
  const backboneAdj = adjacency(edges, { roles: new Set(["correct"]) });
  const backboneCycles = backEdges(backboneAdj, ids).map((b) => b.cycle);

  // ciclos: passa por scaffold OU aresta de erro = REMEDIAÇÃO (saudável); ciclo que
  // não passa = PATOLÓGICO (alucinação). O teste do patológico é EXATO por construção:
  // removemos os nós de scaffold e as arestas de erro do grafo — qualquer ciclo que
  // sobreviver, por definição, NÃO passa por remediação. (Classificar amostras de
  // ciclos do DFS seria falível: o recorte da pilha pode incluir um scaffold que não
  // pertence ao ciclo mínimo, mascarando um patológico que compartilha nós com ele.)
  const scaffoldIds = new Set(
    [...g.nodes.values()].filter((n) => n.type === "scaffold").map((n) => String(n.id))
  );
  const nonRemediationEdges = edges.filter(
    (e) =>
      e.from !== e.to && e.role !== "error" && !scaffoldIds.has(e.from) && !scaffoldIds.has(e.to)
  );
  const pathologicalCycles = simpleCycles(nonRemediationEdges, ids);
  // remediationCycles (informativo): amostra de ciclos do grafo completo que tocam remediação.
  const errorEndpoints = new Set();
  for (const e of edges) {
    if (e.role === "error") {
      errorEndpoints.add(e.from);
      errorEndpoints.add(e.to);
    }
  }
  const allCycles = simpleCycles(
    edges.filter((e) => e.from !== e.to),
    ids
  );
  const remediationCycles = allCycles.filter((cyc) =>
    cyc.some((id) => scaffoldIds.has(id) || errorEndpoints.has(id))
  );

  // start/goal AUSENTE é violação DURA por si (2026-07-02, verificação adversarial:
  // sem eles os checks de alcançabilidade viravam no-op — fallback Set(ids) — e um
  // grafo com nó-ilha passava com flag=false). Um behavior graph sem start ou goal
  // é malformado por definição de example-tracing.
  const missingStartGoal = [];
  if (!g.startId) missingStartGoal.push("start");
  if (!g.goalId) missingStartGoal.push("goal");

  // alcançabilidade: órfão (não alcançável de start) e beco (não co-alcança goal).
  const fwd = adjacency(edges);
  const rev = adjacency(edges, { reverse: true });
  const fromStart = g.startId ? reachableFrom(fwd, g.startId) : new Set(ids);
  const toGoal = g.goalId ? reachableFrom(rev, g.goalId) : new Set(ids);
  const unreachableNodes = [...ids].filter((id) => !fromStart.has(id));
  const deadEndNodes = [...ids].filter((id) => !toGoal.has(id) && id !== g.goalId);

  // integridade referencial misconception↔scaffold.
  const miscIds = new Set();
  for (const n of g.nodes.values())
    for (const m of n.misconceptions || []) {
      const id = m.id || m.misconceptionId;
      if (id) miscIds.add(String(id));
    }
  const scaffoldsWithoutMisc = [...g.nodes.values()]
    .filter((n) => n.type === "scaffold")
    .filter((n) => {
      const target = String(n.targetMisconception ?? "").trim();
      return target && !miscIds.has(target);
    })
    .map((n) => String(n.id));
  const scaffoldTargets = new Set(
    [...g.nodes.values()]
      .filter((n) => n.type === "scaffold")
      .map((n) => String(n.targetMisconception ?? ""))
  );
  const miscWithoutScaffold = [...miscIds].filter(
    (id) => !scaffoldTargets.has(id) && !ids.has(`scaffold_${id}`)
  );

  // over-branching: grau de saída de STEP > mediana + 3·MAD (MAD com piso 1 para
  // não flagar variação trivial quando todos os graus são quase iguais).
  const stepIds = new Set(
    [...g.nodes.values()].filter((n) => n.type === "step").map((n) => String(n.id))
  );
  const deg = outDegrees(edges);
  const stepDegs = [...stepIds].map((id) => deg.get(id) || 0);
  const med = median(stepDegs);
  const mad = median(stepDegs.map((d) => Math.abs(d - med)));
  const threshold = med + 3 * Math.max(mad, 1);
  const overBranchingSteps = [...stepIds]
    .filter((id) => (deg.get(id) || 0) > threshold)
    .map((id) => ({ id, outDegree: deg.get(id) || 0, threshold }));

  const hard = {
    missingStartGoal,
    backboneCycles,
    pathologicalCycles,
    unreachableNodes,
    deadEndNodes,
    scaffoldsWithoutMisc,
    orphanEdges,
  };
  const soft = { overBranchingSteps, miscWithoutScaffold, selfLoops, parallelEdges };

  const hardViolations = Object.values(hard).reduce((s, v) => s + v.length, 0);
  const softViolations = Object.values(soft).reduce((s, v) => s + v.length, 0);
  // VR = violações/checks (Survey 2601.17717): fração das FAMÍLIAS de check violadas
  // (7 duras + 4 moles = 11) — comparável entre grafos de tamanhos diferentes.
  const families = [...Object.values(hard), ...Object.values(soft)];
  const violatedFamilies = families.filter((v) => v.length > 0).length;
  return {
    hard,
    soft,
    remediationCycles: remediationCycles.length,
    hallucinationFlag: hardViolations > 0,
    hardViolations,
    softViolations,
    violationRate: round(violatedFamilies / families.length),
    checks: families.length,
  };
}

// ── Score de alucinação (µ + λσ, Continuous Monitoring 2509.03857) ────────────

/**
 * Score dos MOLES (soma ponderada) + flag dos DUROS. `opts.band = {mean, sd, lambda}`
 * é a banda histórica (quando existir); anomalous = score > µ + λσ.
 */
export function hallucinationScore(intrinsic, opts = {}) {
  const w = {
    overBranchingSteps: 2,
    miscWithoutScaffold: 1,
    selfLoops: 1,
    parallelEdges: 0.5,
    ...opts.weights,
  };
  const s = Object.entries(intrinsic.soft).reduce((acc, [k, v]) => acc + (w[k] ?? 1) * v.length, 0);
  const band = opts.band || null;
  const lambda = band?.lambda ?? 2;
  const threshold = band ? band.mean + lambda * band.sd : null;
  return {
    score: round(s),
    flag: intrinsic.hallucinationFlag,
    threshold: threshold != null ? round(threshold) : null,
    anomalous: threshold != null ? s > threshold : null,
  };
}

// ── NÍVEL 2: indicadores COMPARATIVOS (contra especialista, esquema neutro) ───

// Adjacência 0/1 do neutro com construção IDÊNTICA nos dois lados: nós = steps
// (por key) + misconceptions (por key) + START/GOAL; arestas = transitions do
// backbone + (stepKey → misc) para cada misconception ancorada.
function neutralMatrix(neutral) {
  const labels = [];
  const index = new Map();
  const addNode = (label) => {
    if (!index.has(label)) {
      index.set(label, labels.length);
      labels.push(label);
    }
  };
  addNode("START");
  addNode("GOAL");
  for (const s of neutral.steps || []) addNode("step|" + s.key);
  for (const m of neutral.misconceptions || []) addNode("misc|" + m.key);
  const n = labels.length;
  const A = Array.from({ length: n }, () => new Array(n).fill(0));
  const idx = (label) => index.get(label);
  for (const t of neutral.transitions || []) {
    const f = index.has("step|" + t.from)
      ? idx("step|" + t.from)
      : index.has(t.from)
        ? idx(t.from)
        : null;
    const g = index.has("step|" + t.to) ? idx("step|" + t.to) : index.has(t.to) ? idx(t.to) : null;
    if (f != null && g != null) A[f][g] = 1;
  }
  for (const m of neutral.misconceptions || []) {
    const f = m.stepKey != null && index.has("step|" + m.stepKey) ? idx("step|" + m.stepKey) : null;
    if (f != null) A[f][idx("misc|" + m.key)] = 1;
  }
  return { A, labels };
}

// Autovalores de matriz SIMÉTRICA via Jacobi (suficiente para grafos pequenos).
function jacobiEigenvalues(S, { maxSweeps = 50, tol = 1e-10 } = {}) {
  const n = S.length;
  const a = S.map((row) => [...row]);
  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] * a[i][j];
    if (off < tol) break;
    for (let p = 0; p < n; p++)
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-14) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k][p],
            akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k],
            aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
      }
  }
  return a.map((row, i) => row[i]);
}

/** Valores singulares da adjacência = sqrt(autovalores de AᵀA), decrescentes. */
export function singularValues(A) {
  const n = A.length;
  if (!n) return [];
  const AtA = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      let s = 0;
      for (let k = 0; k < n; k++) s += A[k][i] * A[k][j];
      return s;
    })
  );
  return jacobiEigenvalues(AtA)
    .map((x) => Math.sqrt(Math.max(0, x)))
    .sort((a, b) => b - a);
}

const l2 = (xs, ys) => {
  const n = Math.max(xs.length, ys.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += ((xs[i] || 0) - (ys[i] || 0)) ** 2;
  return Math.sqrt(s);
};

const l1Norm = (xs) => {
  const total = xs.reduce((s, x) => s + x, 0) || 1;
  return xs.map((x) => x / total);
};

/** Distribuição de grau (out) normalizada, como histograma por grau 0..max. */
function degreeHistogram(A) {
  const degs = A.map((row) => row.reduce((s, x) => s + x, 0));
  const max = Math.max(0, ...degs);
  const h = new Array(max + 1).fill(0);
  for (const d of degs) h[d]++;
  return l1Norm(h);
}

/**
 * Relatório COMPARATIVO ref (especialista) × cand (robô), sobre o esquema neutro.
 * miscRecallCompletude = recall direcional (Tversky α=0, β=1): quanto do
 * especialista o robô COBRE. Extras são CANDIDATOS para o juiz, nunca veredito.
 */
export function comparativeReport(refInput, candInput) {
  const ref = toNeutral(refInput, { source: "ref" });
  const cand = toNeutral(candInput, { source: "cand" });
  const { A: Ar } = neutralMatrix(ref);
  const { A: Ac } = neutralMatrix(cand);

  // GED aproximada: nós + arestas que faltam/sobram (Sanfeliu & Fu 1983).
  const nodeSet = (nl) =>
    new Set([
      ...(nl.steps || []).map((s) => "step|" + s.key),
      ...(nl.misconceptions || []).map((m) => "misc|" + m.key),
    ]);
  const edgeSet = (nl) => new Set((nl.transitions || []).map((t) => `${t.from}>${t.to}|${t.role}`));
  const diff = (a, b) => [...a].filter((x) => !b.has(x)).length;
  const Rn = nodeSet(ref),
    Cn = nodeSet(cand),
    Re = edgeSet(ref),
    Ce = edgeSet(cand);
  const gedApprox = diff(Rn, Cn) + diff(Cn, Rn) + diff(Re, Ce) + diff(Ce, Re);

  // recall direcional das misconceptions por âncora semântica (canonAnswer).
  const refMisc = new Map(
    (ref.misconceptions || []).map((m) => [canonAnswer(m.wrongAnswer) || m.key, m])
  );
  const candMiscKeys = new Set(
    (cand.misconceptions || []).map((m) => canonAnswer(m.wrongAnswer) || m.key)
  );
  const covered = [...refMisc.keys()].filter((k) => candMiscKeys.has(k));
  const missingMisconceptions = [...refMisc.entries()]
    .filter(([k]) => !candMiscKeys.has(k))
    .map(([, m]) => m.wrongAnswer);
  const extraMisconceptions = (cand.misconceptions || [])
    .filter((m) => !refMisc.has(canonAnswer(m.wrongAnswer) || m.key))
    .map((m) => m.wrongAnswer);
  const miscRecallCompletude = refMisc.size ? covered.length / refMisc.size : 1;

  const hr = degreeHistogram(Ar);
  const hc = degreeHistogram(Ac);
  let degreeDistL1 = 0;
  for (let i = 0; i < Math.max(hr.length, hc.length); i++)
    degreeDistL1 += Math.abs((hr[i] || 0) - (hc[i] || 0));

  return {
    gedApprox,
    spectralDistance: round(l2(singularValues(Ar), singularValues(Ac))),
    degreeDistL1: round(degreeDistL1),
    miscRecallCompletude: round(miscRecallCompletude),
    missingMisconceptions,
    extraMisconceptions, // CANDIDATOS p/ o juiz cego — não veredito (regra de ouro)
  };
}

function round(x) {
  return Number.isFinite(x) ? Math.round(x * 1000) / 1000 : x;
}
