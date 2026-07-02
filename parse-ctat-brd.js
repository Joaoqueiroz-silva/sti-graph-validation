/**
 * evaluation/parse-ctat-brd.js — Parser do `.brd` do CTAT (Example-tracing v4.0).
 *
 * O `.brd` é um XML `<stateGraph>` que contém A INTERFACE e O GRAFO do especialista
 * juntos. Para o experimento de validação por não-inferioridade precisamos separá-lo
 * em DOIS ENVELOPES, e o robô só pode tocar no Envelope A (autora CEGO):
 *
 *   - Envelope A (→ agentes): { problem, components[], correctAnswer, knowledgeComponents[] }.
 *     NADA mais — sem caminho correto, sem misconceptions, sem dicas, sem arestas.
 *   - Envelope B (→ só comparação): grafo do especialista em esquema NEUTRO (schema.js):
 *     steps (passos corretos), misconceptions (com wrongAnswer = âncora), transitions, hints.
 *
 * Anatomia (ver docs/HANDOFF-VALIDACAO-GRAFOS.md):
 *   <stateGraph startStateNodeName=… tutorType="Example-tracing Tutor">
 *     <startNodeMessages> … Selection=statement, Action=UpdateTextArea, Input=<enunciado>
 *     <node><uniqueID><text>…           (estados; doneState="true" = goal)
 *     <edge><actionLabel><message><properties> Selection/Action/Input (a tripla SAI),
 *           <buggyMessage> <successMessage> <hintMessage>* <actionType>, e <sourceID>/<destID>
 *     <productionRule><ruleName>…<label>…  (os KCs / skills, num bloco GLOBAL no fim)
 *
 * 2026-06-26: GOTCHA — o classificador de misconception é o <actionType> da aresta
 *   ("Ação com erro" vs "Ação Correta"), NÃO a presença de <buggyMessage>: arestas
 *   CORRETAS também carregam buggyMessage (em 01watermelon, 15/16 têm, mas só 8 são erro).
 *   Usar buggyMessage como critério contaminaria o Envelope B com passos corretos.
 *   actionType é localizado (PT-BR aqui) → casamos /erro|incorrect|buggy/ vs /correta|correct/.
 */

import { parse } from "node-html-parser";
import { canon, canonAnswer, normalizeNeutral } from "./schema.js";

// ───────────────────────── helpers de travessia (case-sensitive) ─────────────────────────
// node-html-parser baixa caixa em seletores CSS; por isso navegamos por rawTagName na árvore.

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

function decodeEntities(s) {
  return String(s ?? "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Texto direto de uma tag filha (primeira ocorrência em DFS). */
function textOf(node, tag) {
  if (!node) return null;
  const el = findFirst(node, tag);
  return el ? decodeEntities(el.text.trim()) : null;
}

/** Valor da tripla SAI: <Selection|Action|Input><value>…</value>. Escopo = o bloco dado. */
function saiValue(scope, tag) {
  if (!scope) return null;
  const holder = findFirst(scope, tag);
  if (!holder) return null;
  const v = findFirst(holder, "value");
  return v ? decodeEntities(v.text.trim()) : null;
}

// ───────────────────────── classificação de aresta ─────────────────────────

/** True se a aresta é uma misconception (ação errada). Ver GOTCHA no topo. */
export function isMisconceptionEdge(edge) {
  const at = canon(edge.actionType);
  if (/erro|incorrect|buggy|bug/.test(at)) return true;
  if (/correta|correct/.test(at)) return false;
  // Fallback (actionType ausente/estranho): buggy preenchido e sem success = erro.
  return !!edge.buggy && !edge.success;
}

// Sentinelas de erro MECÂNICO de interface (não-conceitual) — ver pré-registro §8.
// Nos tutores "mass production" 6.17 o especialista templatiza, em todo problema,
// dois bugs de INTERAÇÃO (não de fração): clicar no ponto-sentinela errado da reta
// (input "-1") e deixar um campo em branco (input "-"/""). O robô cego, raciocinando
// conceitualmente, não os reproduz. Marcá-los permite reportar um F1 CONCEITUAL ao
// lado do cru. v1 ciente-do-corpus (no 6.17, -1 nunca é fração válida); refinar com
// regra de domínio quando entrarem outras interfaces (pré-registrado).
const MECHANICAL_SENTINELS = new Set(["", "-", "-1"]);

/** True se a misconception é um artefato de interação com o widget, não um erro conceitual. */
export function isMechanicalMisconception(wrongAnswer) {
  return MECHANICAL_SENTINELS.has(canonAnswer(wrongAnswer));
}

// ───────────────────────── parser bruto ─────────────────────────

/**
 * parseBrd(xml) → objeto intermediário (NÃO é separado em envelopes; é a matéria-prima).
 * @returns {{ startState, statement, nodes, edges, skills }}
 *   edge: { id, from, to, selection, action, input, hints[], buggy, success, actionType, isCorrect }
 *   skill: { ruleName, productionSet, label, hints[] }
 */
export function parseBrd(xml) {
  if (!xml || typeof xml !== "string") throw new Error("parseBrd: XML vazio");
  const root = parse(xml, { lowerCaseTagName: false, comment: false });
  const sg = findFirst(root, "stateGraph");
  if (!sg) throw new Error("parseBrd: <stateGraph> não encontrado (é um .brd do CTAT?)");

  const startState = sg.getAttribute("startStateNodeName") || null;

  // Enunciado: mensagem inicial com Selection=statement / Action=UpdateTextArea.
  let statement = null;
  const startBlock = findFirst(sg, "startNodeMessages");
  if (startBlock) {
    for (const msg of findAll(startBlock, "message")) {
      const props = findFirst(msg, "properties");
      const sel = canon(saiValue(props, "Selection"));
      if (sel === "statement" || sel === "statement2") {
        const input = saiValue(props, "Input");
        if (input) {
          statement = statement ? `${statement}\n${input}` : input;
        }
      }
    }
  }

  // Nós (estados).
  const nodes = findAll(sg, "node").map((n) => ({
    id: textOf(n, "uniqueID"),
    text: textOf(n, "text"),
    done: /true/i.test(n.getAttribute("doneState") || n.getAttribute("donestate") || ""),
  }));

  // Arestas (transições com a tripla SAI).
  const edges = findAll(sg, "edge").map((e) => {
    const al = findFirst(e, "actionLabel");
    const props = al ? findFirst(al, "properties") : null;
    const hints = al
      ? findAll(al, "hintMessage")
          .map((h) => decodeEntities(h.text.trim()))
          .filter(Boolean)
      : [];
    const edge = {
      id: textOf(al, "uniqueID"),
      from: textOf(e, "sourceID"),
      to: textOf(e, "destID"),
      selection: saiValue(props, "Selection"),
      action: saiValue(props, "Action"),
      input: saiValue(props, "Input") ?? "",
      hints,
      buggy: textOf(al, "buggyMessage") || "",
      success: textOf(al, "successMessage") || "",
      actionType: textOf(e, "actionType") || "",
    };
    edge.isCorrect = !isMisconceptionEdge(edge);
    return edge;
  });

  // KCs / skills (productionRule, bloco global).
  const skills = findAll(sg, "productionRule").map((p) => ({
    ruleName: textOf(p, "ruleName"),
    productionSet: textOf(p, "productionSet"),
    label: textOf(p, "label"),
    hints: findAll(p, "hintMessage")
      .map((h) => decodeEntities(h.text.trim()))
      .filter(Boolean),
  }));

  return { startState, statement, nodes, edges, skills };
}

// ───────────────────────── ordenação do caminho correto ─────────────────────────

/** Encadeia as arestas corretas pelo grafo (sourceID→destID); fallback = ordem do arquivo. */
function orderCorrectPath(correctEdges) {
  if (correctEdges.length <= 1) return correctEdges.slice();
  const bySource = new Map();
  const dests = new Set();
  for (const e of correctEdges) {
    if (!bySource.has(e.from)) bySource.set(e.from, e);
    dests.add(e.to);
  }
  // raiz = source que nunca é destino
  const root = correctEdges.find((e) => !dests.has(e.from));
  if (!root) return correctEdges.slice();
  const ordered = [];
  const seen = new Set();
  let cur = root;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    ordered.push(cur);
    cur = bySource.get(cur.to);
  }
  // se algum ficou de fora (grafo ramificado), anexa na ordem do arquivo
  for (const e of correctEdges) if (!seen.has(e.id)) ordered.push(e);
  return ordered;
}

// ───────────────────────── Envelope B (grafo do especialista, neutro) ─────────────────────────

/**
 * parseBrdToExpertNeutral(xml) → Envelope B no esquema NEUTRO (schema.js).
 * steps (arestas corretas, em ordem de caminho), misconceptions (arestas de erro;
 * wrongAnswer = Input = ÂNCORA), transitions (backbone correto START→…→GOAL).
 * Anexa `hints`/`skills` como metadados (o comparador ignora extras).
 */
export function parseBrdToExpertNeutral(xml, meta = {}) {
  const { statement, edges, skills } = parseBrd(xml);
  const correct = orderCorrectPath(edges.filter((e) => e.isCorrect));
  const misc = edges.filter((e) => !e.isCorrect);

  const steps = correct.map((e, i) => ({
    answer: e.input,
    kc: null,
    order: i + 1,
  }));

  const misconceptions = misc.map((e) => ({
    wrongAnswer: e.input,
    stepKey: null,
    feedback: e.buggy,
    mechanical: isMechanicalMisconception(e.input),
  }));

  // Backbone correto: START → s1 → … → sN → GOAL (role "correct"), como em normalizeEducaoff.
  const transitions = [];
  let prev = "START";
  for (const e of correct) {
    const key = canonAnswer(e.input) || canon(e.selection);
    transitions.push({ from: prev, to: key, role: "correct" });
    prev = key;
  }
  if (correct.length) transitions.push({ from: prev, to: "GOAL", role: "correct" });

  const neutral = normalizeNeutral(
    { meta: { source: "ctat", problem: statement, ...meta }, steps, misconceptions, transitions },
    {}
  );
  // Metadados (fora do esquema; o comparador os ignora) — para inspeção/relatório.
  neutral.hintsPerCorrectStep = correct.map((e) => e.hints);
  neutral.skills = skills;
  return neutral;
}

// ───────────────────────── Envelope A (entrada do robô — CEGO) ─────────────────────────

const ACTION_TYPE = [
  [/addpoint|set_?maximum|numberline|numline/i, "numberline"],
  [/updatetextfield|updatetextarea|update/i, "text"],
  [/buttonpressed|press|click/i, "button"],
  [/setvisible|visible|enable|disable/i, "control"],
];

function inferComponentType(actions, sampleInput) {
  for (const a of actions) {
    for (const [re, type] of ACTION_TYPE) {
      if (re.test(a)) {
        // refina text→numeric quando os inputs são numéricos
        if (type === "text" && /^-?\d+([./]\d+)?$/.test(String(sampleInput || "").trim())) {
          return "numeric";
        }
        return type;
      }
    }
  }
  return "text";
}

/** Deriva a resposta correta "principal" (o ponto na reta / fração), sem vazar o caminho. */
function deriveCorrectAnswer(correctEdges) {
  const point = correctEdges.find((e) => /addpoint/i.test(e.action) && e.input);
  if (point) return point.input;
  const frac = correctEdges.find((e) => /^-?\d+\/\d+$/.test(String(e.input).trim()));
  if (frac) return frac.input;
  const nonEmpty = correctEdges.filter((e) => String(e.input).trim() !== "");
  return nonEmpty.length ? nonEmpty[nonEmpty.length - 1].input : null;
}

/**
 * parseBrdToRobotInput(xml,{html}) → Envelope A. SÓ interface + enunciado + resposta + KCs.
 * NUNCA inclui misconceptions, dicas, caminho correto nem arestas (anti-contaminação).
 */
export function parseBrdToRobotInput(xml, opts = {}) {
  const { startState, statement, edges, skills } = parseBrd(xml);

  // Componentes = Selections interativos distintos (na ordem de 1ª aparição).
  const order = [];
  const actionsBySel = new Map();
  for (const e of edges) {
    const sel = e.selection;
    if (!sel) continue;
    if (!actionsBySel.has(sel)) {
      actionsBySel.set(sel, new Set());
      order.push(sel);
    }
    if (e.action) actionsBySel.get(sel).add(e.action);
  }
  const inputBySel = new Map();
  for (const e of edges)
    if (e.selection && !inputBySel.has(e.selection)) inputBySel.set(e.selection, e.input);

  const components = order.map((sel) => ({
    id: sel,
    type: inferComponentType([...actionsBySel.get(sel)], inputBySel.get(sel)),
    label: sel,
  }));

  const correctAnswer = deriveCorrectAnswer(edges.filter((e) => e.isCorrect));

  return {
    id: opts.id || startState || "ctat",
    problem: statement,
    profile: opts.profile || "reader",
    difficulty: opts.difficulty || "medium",
    correctAnswer,
    knowledgeComponents: skills
      .filter((s) => s.ruleName)
      .map((s) => ({ id: s.ruleName, name: s.label || s.ruleName })),
    components,
  };
}

// ───────────────────────── verificação da separação (anti-contaminação) ─────────────────────────

// Chaves PROIBIDAS no Envelope A (match EXATO, case-insensitive — não por substring, senão
// "knowledgeComponents" casaria "edge"). São os campos do Envelope B que não podem vazar.
const FORBIDDEN_IN_A = new Set([
  "misconception",
  "misconceptions",
  "wronganswer",
  "wronganswers",
  "hint",
  "hints",
  "hintmessage",
  "hintspercorrectstep",
  "buggy",
  "buggymessage",
  "transition",
  "transitions",
  "edge",
  "edges",
  "steps",
  "correctpath",
  "success",
  "successmessage",
  "feedback",
]);

/** Varre o Envelope A e devolve as chaves proibidas encontradas (deve ser []). */
export function findLeaksInRobotInput(envelopeA) {
  const leaks = [];
  const walk = (obj, path) => {
    if (obj == null || typeof obj !== "object") return;
    for (const [k, v] of Object.entries(obj)) {
      if (FORBIDDEN_IN_A.has(k.toLowerCase())) leaks.push(`${path}${k}`);
      walk(v, `${path}${k}.`);
    }
  };
  walk(envelopeA, "");
  return leaks;
}

// ───────────────────────── CLI ─────────────────────────

async function main() {
  const fs = await import("node:fs");
  const file = process.argv[2];
  if (!file) {
    console.error("uso: node evaluation/parse-ctat-brd.js <caminho-do-expert.brd>");
    process.exit(1);
  }
  const xml = fs.readFileSync(file, "utf8");
  const A = parseBrdToRobotInput(xml);
  const B = parseBrdToExpertNeutral(xml);
  const leaks = findLeaksInRobotInput(A);

  const line = "─".repeat(70);
  console.log(`\n${line}\nENVELOPE A — entrada do robô (CEGO)\n${line}`);
  console.log(`problema     : ${A.problem}`);
  console.log(`resposta     : ${A.correctAnswer}`);
  console.log(
    `KCs (${A.knowledgeComponents.length})      : ${A.knowledgeComponents.map((k) => k.id).join(", ")}`
  );
  console.log(`componentes  : ${A.components.map((c) => `${c.id}(${c.type})`).join(", ")}`);

  console.log(`\n${line}\nENVELOPE B — grafo do especialista (neutro)\n${line}`);
  console.log(
    `passos corretos : ${B.steps.length}  →  [${B.steps.map((s) => s.answer || "·").join(", ")}]`
  );
  console.log(
    `misconceptions  : ${B.misconceptions.length}  →  wrongAnswers [${B.misconceptions
      .map((m) => m.wrongAnswer || "·")
      .join(", ")}]`
  );
  console.log(`transições      : ${B.transitions.length} (backbone correto)`);
  console.log(
    `skills/KCs      : ${B.skills.length}  ·  dicas por passo: [${B.hintsPerCorrectStep.map((h) => h.length).join(", ")}]`
  );

  console.log(`\n${line}\nVERIFICAÇÃO ANTI-CONTAMINAÇÃO\n${line}`);
  if (leaks.length === 0) {
    console.log("✅ Envelope A NÃO contém misconceptions/dicas/arestas/caminho. Separação OK.");
  } else {
    console.log(`❌ VAZAMENTO no Envelope A: ${leaks.join(", ")}`);
    process.exitCode = 2;
  }
  console.log("");
}

import { fileURLToPath } from "node:url";
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
