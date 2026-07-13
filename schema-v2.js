/**
 * schema-v2.js — Schema NEUTRO v2 do behavior graph (Onda 2, gate G5).
 *
 * O schema neutro v1 (schema.js) reduz o grafo a passos+misconceptions — suficiente
 * para o F1 estrutural, mas o parecer exige representar o COMPORTAMENTO completo:
 * estados, tripla SAI, transições buggy, dicas, feedback e remediação, de modo que
 * o grafo seja EXECUTÁVEL (ver trace-executor.js) e serializável de forma estável
 * (hash de round-trip).
 *
 * Shape do v2:
 *   {
 *     schemaVersion: 2,
 *     meta: { source, problem, startStateNodeName, ...meta },
 *     startState, finalStates[],
 *     states[]:      { id, name },
 *     transitions[]: { id, from, to, sai:{selection,action,input},
 *                      type: "correct"|"buggy"|"unknown",
 *                      matchRule: "exact"|"semantic",   ← conforme o matcher do .brd
 *                      actor,                           ← Student | Tutor | Tutor (unevaluated)
 *                      feedback: {buggyMessage?,successMessage?}|null,
 *                      hints[], kcs[] },
 *     skills[]:      catálogo global de KCs (productionRule) — preserva as dicas por KC,
 *     unsupportedConstructs[]: construtos CTAT presentes no XML e NÃO representados
 *   }
 *
 * 2026-07-12 (Onda 2): decisões registradas —
 *   - startState = RAIZ TOPOLÓGICA (nó que é origem mas nunca destino), não o atributo
 *     startStateNodeName: em 00bubble o atributo aponta para um nó INEXISTENTE ("state21"),
 *     e nos demais ele aponta para o meio do grafo (depois das arestas tutor-performed de
 *     setup 1→23→24→14), o que tornaria estados/transições iniciais inalcançáveis e
 *     quebraria a coerência com o caminho correto do v1 (orderCorrectPath ancora na raiz).
 *     O atributo declarado fica preservado em meta.startStateNodeName.
 *   - matchRule vem do <matcherType> do Input: ExpressionMatcher (algEval/equals) = a
 *     equivalência NUMÉRICA do CTAT → "semantic"; ExactMatcher/ausente → "exact" (default).
 *     matcherTypes desconhecidos entram em unsupportedConstructs como "matcherType:X".
 *   - EdgesGroups/group/link (restrições de ORDEM de travessia do example-tracer) têm
 *     semântica real que o executor mínimo não honra → ficam em unsupportedConstructs
 *     por construção (não estão no conjunto de tags representadas/ignoráveis).
 */

import { parse } from "node-html-parser";
import { canon, canonAnswer, normalizeNeutral } from "./schema.js";
import { parseBrd, isMisconceptionEdge, isMechanicalMisconception } from "./parse-ctat-brd.js";

// ───────────────────────── helpers de travessia (case-sensitive) ─────────────────────────
// Duplicação CONSCIENTE de parse-ctat-brd.js (findAll/findFirst não são exportados lá e
// este workstream não pode editar arquivos alheios). Manter em sincronia se o parser mudar.

function findAll(node, tag, acc = []) {
  for (const c of node.childNodes || []) {
    if (c.rawTagName === tag) acc.push(c);
    findAll(c, tag, acc);
  }
  return acc;
}

function findFirst(node, tag) {
  for (const c of node.childNodes || []) {
    if (c.rawTagName === tag) return c;
    const r = findFirst(c, tag);
    if (r) return r;
  }
  return null;
}

function textOf(node, tag) {
  if (!node) return null;
  const el = findFirst(node, tag);
  return el ? el.text.trim() : null;
}

// ───────────────────────── inventário de tags (unsupportedConstructs) ─────────────────────────

// Tags cuja INFORMAÇÃO está representada no v2 (direta ou como envelope de extração).
const REPRESENTED_TAGS = new Set([
  "stateGraph",
  "startNodeMessages",
  "message",
  "verb",
  "properties",
  "MessageType",
  "ProblemName",
  "transaction_id",
  "Selection",
  "Action",
  "Input",
  "value",
  "node",
  "text",
  "uniqueID",
  "edge",
  "actionLabel",
  "hintMessage",
  "buggyMessage",
  "successMessage",
  "actionType",
  "sourceID",
  "destID",
  "matchers",
  "matcher",
  "matcherType",
  "matcherParameter",
  "Actor",
  "rule", // <rule><text> vira kcs[] da transição
  "productionRule",
  "ruleName",
  "productionSet",
  "label",
]);

// Tags deliberadamente IGNORADAS por serem layout/contabilidade do editor CTAT,
// sem semântica tutorial (não entram em unsupportedConstructs).
const IGNORED_BOOKKEEPING_TAGS = new Set([
  "dimension",
  "x",
  "y",
  "traversalCount",
  "preCheckedStatus",
  "checkedStatus",
  "oldActionType",
  "callbackFn",
  "SimSt",
  "studentHintRequest",
  "stepSuccessfulCompletion",
  "stepStudentError",
  "indicator", // duplica o Input dentro de <rule>
]);

/** Varre a árvore inteira e devolve o conjunto de rawTagName presentes. */
function collectTagNames(node, acc = new Set()) {
  for (const c of node.childNodes || []) {
    if (c.rawTagName) acc.add(c.rawTagName);
    collectTagNames(c, acc);
  }
  return acc;
}

// ───────────────────────── classificação e extração por aresta ─────────────────────────

/**
 * type da transição. Invariante com o v1: type === "buggy" ⟺ isMisconceptionEdge(edge),
 * para que neutralV2ToLegacy reproduza exatamente a partição correta/misconception do v1.
 * "unknown" = sem actionType reconhecível e sem successMessage (semântica não declarada).
 */
function classifyEdgeType(edge) {
  if (isMisconceptionEdge(edge)) return "buggy";
  const at = canon(edge.actionType);
  if (/correta|correct/.test(at)) return "correct";
  if (edge.success) return "correct";
  return "unknown";
}

/** Resolve o <rule><text> da aresta ("FindValueNumLine 6-17_...") para o ruleName do catálogo. */
function resolveKcs(ruleText, skills) {
  const rt = (ruleText || "").trim();
  if (!rt || rt === "unnamed") return [];
  const hit = skills.find((s) => s.ruleName && (rt === s.ruleName || rt.startsWith(s.ruleName + " ")));
  return [hit ? hit.ruleName : rt];
}

/**
 * Segundo passe no XML: campos que parseBrd NÃO extrai (matcherType do Input, Actor,
 * <rule><text> por aresta) + inventário de tags. As arestas saem NA MESMA ORDEM de
 * parseBrd (mesma travessia DFS por findAll), então o zip é por índice.
 */
function extractEdgeExtras(brdXml) {
  const root = parse(brdXml, { lowerCaseTagName: false, comment: false });
  const sg = findFirst(root, "stateGraph");
  if (!sg) throw new Error("parseBrdToNeutralV2: <stateGraph> não encontrado");

  const extras = findAll(sg, "edge").map((e) => {
    const al = findFirst(e, "actionLabel");
    const matchersEl = al ? findFirst(al, "matchers") : null;
    const inputHolder = matchersEl ? findFirst(matchersEl, "Input") : null;
    return {
      id: al ? textOf(al, "uniqueID") : null,
      inputMatcherType: inputHolder ? textOf(inputHolder, "matcherType") : null,
      actor: matchersEl ? textOf(matchersEl, "Actor") : null,
      ruleText: textOf(findFirst(e, "rule"), "text"),
    };
  });

  return { extras, tagNames: collectTagNames(root) };
}

// ───────────────────────── parser principal (v2) ─────────────────────────

/**
 * parseBrdToNeutralV2(brdXml, meta) → grafo de comportamento completo no schema neutro v2.
 * Reaproveita parseBrd (Envelope B bruto) e complementa com matchers/actor/KC por aresta.
 */
export function parseBrdToNeutralV2(brdXml, meta = {}) {
  const base = parseBrd(brdXml); // { startState (nome declarado), statement, nodes, edges, skills }
  const { extras, tagNames } = extractEdgeExtras(brdXml);

  const states = base.nodes.map((n) => ({ id: n.id, name: n.text }));
  const finalStates = base.nodes.filter((n) => n.done).map((n) => n.id);

  const unsupported = new Set(
    [...tagNames].filter((t) => !REPRESENTED_TAGS.has(t) && !IGNORED_BOOKKEEPING_TAGS.has(t))
  );

  const transitions = base.edges.map((e, i) => {
    const x = extras[i] || {};
    const mt = x.inputMatcherType;
    // matchRule conforme o que o .brd declara; default exact (ver cabeçalho).
    let matchRule = "exact";
    if (mt === "ExpressionMatcher") matchRule = "semantic";
    else if (mt && mt !== "ExactMatcher") unsupported.add(`matcherType:${mt}`);

    const fb = {};
    if (e.buggy) fb.buggyMessage = e.buggy;
    if (e.success) fb.successMessage = e.success;

    return {
      id: e.id,
      from: e.from,
      to: e.to,
      sai: { selection: e.selection ?? "", action: e.action ?? "", input: e.input ?? "" },
      type: classifyEdgeType(e),
      matchRule,
      actor: x.actor || "Student",
      feedback: Object.keys(fb).length ? fb : null,
      hints: e.hints.slice(),
      kcs: resolveKcs(x.ruleText, base.skills),
    };
  });

  // startState = raiz topológica (ver decisão datada no cabeçalho); fallbacks determinísticos.
  const destIds = new Set(transitions.map((t) => t.to));
  const srcIds = new Set(transitions.map((t) => t.from));
  const startState =
    states.find((s) => srcIds.has(s.id) && !destIds.has(s.id))?.id ??
    states.find((s) => s.name === base.startState)?.id ??
    states[0]?.id ??
    null;

  return {
    schemaVersion: 2,
    meta: {
      source: "ctat-brd",
      problem: base.statement,
      startStateNodeName: base.startState,
      ...meta,
    },
    startState,
    finalStates,
    states,
    transitions,
    skills: base.skills.map((s) => ({ ...s, hints: s.hints.slice() })),
    unsupportedConstructs: [...unsupported].sort(),
  };
}

// ───────────────────────── compatibilidade v2 → v1 ─────────────────────────

/**
 * Encadeia transições corretas pela topologia (from→to); fallback = ordem do arquivo.
 * Clone de orderCorrectPath de parse-ctat-brd.js (não exportado lá) — mesmo algoritmo
 * para que a ordem dos passos do legacy seja IDÊNTICA à de parseBrdToExpertNeutral.
 */
function orderCorrectTransitions(correct) {
  if (correct.length <= 1) return correct.slice();
  const bySource = new Map();
  const dests = new Set();
  for (const t of correct) {
    if (!bySource.has(t.from)) bySource.set(t.from, t);
    dests.add(t.to);
  }
  const root = correct.find((t) => !dests.has(t.from));
  if (!root) return correct.slice();
  const ordered = [];
  const seen = new Set();
  let cur = root;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    ordered.push(cur);
    cur = bySource.get(cur.to);
  }
  for (const t of correct) if (!seen.has(t.id)) ordered.push(t);
  return ordered;
}

/**
 * neutralV2ToLegacy(v2) → schema neutro v1 (mesmo shape de parseBrdToExpertNeutral),
 * para provar que o v2 é um SUPERconjunto: steps/misconceptions/transitions/hints/skills
 * do v1 são deriváveis do v2 sem tocar no XML.
 * Partição espelha o v1: misconception ⟺ type === "buggy" ("unknown" fica no caminho
 * correto, como o fallback binário de isMisconceptionEdge faz no v1).
 */
export function neutralV2ToLegacy(v2) {
  if (!v2 || v2.schemaVersion !== 2) {
    throw new Error("neutralV2ToLegacy: esperado grafo com schemaVersion 2");
  }
  const correct = orderCorrectTransitions(v2.transitions.filter((t) => t.type !== "buggy"));
  const misc = v2.transitions.filter((t) => t.type === "buggy");

  const steps = correct.map((t, i) => ({ answer: t.sai.input, kc: null, order: i + 1 }));

  const misconceptions = misc.map((t) => ({
    wrongAnswer: t.sai.input,
    stepKey: null,
    feedback: t.feedback?.buggyMessage || "",
    mechanical: isMechanicalMisconception(t.sai.input),
  }));

  const transitions = [];
  let prev = "START";
  for (const t of correct) {
    const key = canonAnswer(t.sai.input) || canon(t.sai.selection);
    transitions.push({ from: prev, to: key, role: "correct" });
    prev = key;
  }
  if (correct.length) transitions.push({ from: prev, to: "GOAL", role: "correct" });

  const neutral = normalizeNeutral(
    {
      meta: { source: "ctat", problem: v2.meta?.problem ?? null },
      steps,
      misconceptions,
      transitions,
    },
    {}
  );
  neutral.hintsPerCorrectStep = correct.map((t) => (t.hints || []).slice());
  neutral.skills = (v2.skills || []).map((s) => ({ ...s, hints: (s.hints || []).slice() }));
  return neutral;
}

// ───────────────────────── serialização estável (para hash) ─────────────────────────

/** Ordena as chaves de objetos recursivamente (arrays preservam ordem). */
function sortKeysDeep(v) {
  if (Array.isArray(v)) return v.map(sortKeysDeep);
  if (v && typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = sortKeysDeep(v[k]);
    return out;
  }
  return v;
}

/**
 * serializeV2(v2) → JSON ESTÁVEL (chaves ordenadas em toda profundidade), de modo que
 * o mesmo grafo produz sempre o mesmo texto (e portanto o mesmo hash), independente
 * da ordem de inserção das chaves em memória.
 */
export function serializeV2(v2) {
  if (!v2 || v2.schemaVersion !== 2) {
    throw new Error("serializeV2: esperado grafo com schemaVersion 2");
  }
  return JSON.stringify(sortKeysDeep(v2), null, 2);
}

/** parseV2(json) → grafo v2 (valida a versão do schema; round-trip de serializeV2). */
export function parseV2(json) {
  const v2 = JSON.parse(json);
  if (!v2 || typeof v2 !== "object" || v2.schemaVersion !== 2) {
    throw new Error("parseV2: JSON não é um grafo neutro v2 (schemaVersion !== 2)");
  }
  return v2;
}
