/**
 * evaluation/interface-inventory.js — inventário DETERMINÍSTICO da interface.
 *
 * 2026-07-19 (Melhoria #1 — aterramento de interface no simulador): as 3
 * campanhas do dia mostraram que as faltas de whole_number_bias (50
 * não-mecânicas) resistem a eliciação E a materialização porque os inteiros
 * faltantes são VALORES DA INTERFACE ('12' = contagem de marcas daquela reta
 * específica). Prompting genérico não alcança esses números; o simulador
 * precisa de FATOS ESTRUTURADOS extraídos por código para poder computá-los.
 *
 * REGRA DE OURO (anti-vazamento): este módulo lê SOMENTE o Envelope A
 * (iface.components — já verificado por findLeaksInRobotInput) e a interface
 * compartilhada (HTML/DOM serializado). Ele NUNCA recebe nem produz
 * respostas do gabarito ou erros prontos — o simulador continua DERIVANDO as
 * wrongAnswers; daqui saem apenas contagens, labels e escalas que a
 * interface MOSTRA (fatos que um programa recomputa do mesmo input).
 *
 * 2026-07-19 (Fase B — interface reconstruída): a reta do dataset é desenhada
 * por JS — o HTML cru tem 0 ticks e 0 labels numéricos. `opts.renderedFacts`
 * (interface-reconstruction.js: template + tabela mass-production, NUNCA
 * envelope-b) injeta os fatos renderizados por problema; o inventário só
 * imprime a seção extra. Fallback silencioso: sem a tabela, nada muda.
 */

import { parse } from "node-html-parser";
import { formatRenderedFacts } from "./interface-reconstruction.js";

// Números "de interface": inteiro/decimal curto ou fração N/D (labels, ticks).
const NUM_RE = /^-?\d+(?:[.,]\d+)?$/;
const FRACTION_RE = /^-?\d+\/\d+$/;
// Elementos que são marcas de escala (ticks de reta numérica etc.).
const MARK_RE = /tick|mark|marca|ponto/i;
// Componentes que são escalas (a contagem de marcas/intervalos importa).
const SCALE_TYPE_RE = /number_?line|numline|slider|scale|reta/i;
// Tipos que NÃO recebem valor do aluno (ação/fluxo, não resposta).
const ACTION_TYPES = new Set(["button", "control"]);

function bump(map, key) {
  map[key] = (map[key] || 0) + 1;
}

function stripTags(s) {
  return String(s ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ");
}

/** Coleta um texto CURTO que é um número/fração por inteiro (evita capturar números do enunciado). */
function collectNumericText(raw, facts) {
  const t = String(raw ?? "").trim();
  if (!t || t.length > 12) return;
  if (NUM_RE.test(t) || FRACTION_RE.test(t)) facts.numericTexts.push(t);
}

// ───────────────────── walkers (HTML string / DOM serializado) ─────────────────────
// Os dois produzem o MESMO shape de fatos: { elements, numericTexts, markCount }.

function walkHtml(node, facts) {
  for (const child of node.childNodes || []) {
    if (child.nodeType === 3) {
      collectNumericText(child.rawText, facts);
      continue;
    }
    if (child.nodeType !== 1) continue;
    const classes = String((child.getAttribute && child.getAttribute("class")) || "")
      .split(/\s+/)
      .filter(Boolean);
    for (const name of classes) if (name.startsWith("CTAT")) bump(facts.elements, name);
    const id = (child.getAttribute && child.getAttribute("id")) || "";
    if (classes.some((c) => MARK_RE.test(c)) || MARK_RE.test(id)) facts.markCount++;
    walkHtml(child, facts);
  }
}

/** DOM serializado no formato do `_interface/interface.json` dos datasets (nós {tagName,type,classes,components}). */
function walkDom(node, facts) {
  if (node == null) return;
  if (Array.isArray(node)) {
    for (const n of node) walkDom(n, facts);
    return;
  }
  if (typeof node !== "object") return;
  if (node.type === "textnode") {
    collectNumericText(node.content, facts);
    return;
  }
  const classes = Array.isArray(node.classes)
    ? node.classes.map((c) => (typeof c === "string" ? c : c && c.name)).filter(Boolean)
    : [];
  for (const name of classes) if (String(name).startsWith("CTAT")) bump(facts.elements, name);
  if (typeof node.type === "string" && node.type.startsWith("CTAT") && !classes.includes(node.type))
    bump(facts.elements, node.type);
  const id = (node.attributes && node.attributes.id) || "";
  if (classes.some((c) => MARK_RE.test(c)) || MARK_RE.test(String(id))) facts.markCount++;
  if (typeof node.content === "string") collectNumericText(stripTags(node.content), facts);
  walkDom(node.components, facts);
}

function extractSharedFacts({ html, dom }) {
  const facts = { elements: {}, numericTexts: [], markCount: 0 };
  if (dom != null) {
    walkDom(dom, facts);
  } else if (typeof html === "string" && html.trim()) {
    walkHtml(parse(html, { lowerCaseTagName: false, comment: false }), facts);
  } else {
    return null;
  }
  // dedup determinístico dos textos numéricos (ordem por valor; frações no fim, lexical)
  const uniq = [...new Set(facts.numericTexts)];
  const nums = uniq.filter((v) => NUM_RE.test(v)).sort((a, b) => parseFloat(a) - parseFloat(b));
  const fracs = uniq.filter((v) => !NUM_RE.test(v)).sort();
  facts.numericTexts = [...nums, ...fracs];
  return facts;
}

function integerStats(values) {
  const ints = values
    .filter((v) => NUM_RE.test(v) && Number.isInteger(parseFloat(String(v).replace(",", "."))))
    .map((v) => parseInt(v, 10));
  if (!ints.length) return null;
  return { min: Math.min(...ints), max: Math.max(...ints), count: ints.length };
}

// ───────────────────── builder puro ─────────────────────

/**
 * buildInterfaceInventory(iface, { html?, dom?, renderedFacts? }) → fatos DETERMINÍSTICOS.
 * @param {object} iface  Envelope A ({ components:[{id,type,label}] }) — NADA além dele é lido.
 * @param {{html?:string, dom?:object|Array, renderedFacts?:object}} opts  interface
 *   compartilhada (opcional) e/ou fatos da interface RENDERIZADA reconstruídos do
 *   template mass-production (interface-reconstruction.js — jamais envelope-b).
 * @returns {object} inventário: contagens por tipo, ids de resposta/ação, labels
 *   numéricos (com min/máx de inteiros), grupos de elementos repetidos (prefixo+N)
 *   e escalas com marcas→intervalos quando deriváveis. SEM nenhum campo de resposta.
 */
export function buildInterfaceInventory(iface, opts = {}) {
  const comps = Array.isArray(iface && iface.components) ? iface.components : [];

  // Contagem por tipo (ordem alfabética de tipo = determinística).
  const byTypeMap = new Map();
  for (const c of comps) {
    const t = String(c.type || "text");
    if (!byTypeMap.has(t)) byTypeMap.set(t, []);
    byTypeMap.get(t).push(String(c.id));
  }
  const byType = [...byTypeMap.entries()]
    .map(([type, ids]) => ({ type, count: ids.length, ids }))
    .sort((a, b) => a.type.localeCompare(b.type));

  const responseComponentIds = comps
    .filter((c) => !ACTION_TYPES.has(String(c.type)))
    .map((c) => String(c.id));
  const actionComponentIds = comps
    .filter((c) => ACTION_TYPES.has(String(c.type)))
    .map((c) => String(c.id));

  // Labels numéricos dos componentes (ticks rotulados, valores fixos na tela).
  const labelValues = [];
  for (const c of comps) {
    const l = String(c.label ?? "").trim();
    if (l && l !== String(c.id) && (NUM_RE.test(l) || FRACTION_RE.test(l))) labelValues.push(l);
  }
  const numericLabels = { values: labelValues, integers: integerStats(labelValues) };

  // Grupos de ids "prefixo+número" (tick0..tick12): a CONTAGEM é um fato da interface.
  const groupsMap = new Map();
  for (const c of comps) {
    const m = /^(.*?)(\d+)$/.exec(String(c.id));
    if (!m || !m[1]) continue;
    if (!groupsMap.has(m[1])) groupsMap.set(m[1], []);
    groupsMap.get(m[1]).push(parseInt(m[2], 10));
  }
  const idGroups = [...groupsMap.entries()]
    .filter(([, ns]) => ns.length >= 3)
    .map(([prefix, ns]) => ({
      prefix,
      count: ns.length,
      min: Math.min(...ns),
      max: Math.max(...ns),
    }))
    .sort((a, b) => a.prefix.localeCompare(b.prefix));

  const shared = extractSharedFacts(opts) || null;

  // Escalas: marcas deriváveis de (a) grupo de ids tick/mark, (b) marcas no HTML/DOM.
  const markGroup = idGroups.find((g) => MARK_RE.test(g.prefix)) || null;
  const sharedMarks = shared && shared.markCount >= 2 ? shared.markCount : 0;
  const scales = comps
    .filter((c) => SCALE_TYPE_RE.test(`${c.type || ""} ${c.id || ""}`))
    .map((c) => {
      const marks = markGroup ? markGroup.count : sharedMarks || null;
      return {
        id: String(c.id),
        type: String(c.type || ""),
        marks,
        intervals: marks != null && marks >= 2 ? marks - 1 : null,
      };
    });

  return {
    totalComponents: comps.length,
    byType,
    responseComponentIds,
    actionComponentIds,
    numericLabels,
    idGroups,
    scales,
    sharedFacts: shared,
    // Fase B (2026-07-19): fatos renderizados reconstruídos do template — nomes
    // neutros, verificados por findLeaksInRobotInput no teste de regressão.
    rendered: opts.renderedFacts || null,
  };
}

// ───────────────────── formatação para o prompt ─────────────────────

/** Renderiza o inventário como linhas de FATOS (só o que existe); "" se não houver nada. */
export function formatInterfaceInventory(inv) {
  if (!inv) return "";
  const lines = [];
  if (inv.totalComponents > 0) {
    lines.push(
      `- ${inv.totalComponents} componentes por tipo: ${inv.byType
        .map((t) => `${t.type}×${t.count} (${t.ids.join(", ")})`)
        .join("; ")}`
    );
  }
  if (inv.responseComponentIds.length) {
    lines.push(
      `- componentes de RESPOSTA (recebem valor do aluno): ${inv.responseComponentIds.join(", ")}`
    );
  }
  if (inv.actionComponentIds.length) {
    lines.push(
      `- componentes de AÇÃO (botão/controle, sem valor): ${inv.actionComponentIds.join(", ")}`
    );
  }
  if (inv.numericLabels.values.length) {
    const ints = inv.numericLabels.integers;
    lines.push(
      `- labels numéricos visíveis nos componentes: ${inv.numericLabels.values.join(", ")}` +
        (ints ? ` (inteiros: mín ${ints.min}, máx ${ints.max})` : "")
    );
  }
  for (const g of inv.idGroups) {
    lines.push(
      `- grupo de elementos repetidos: "${g.prefix}" ×${g.count} (numerados ${g.min}..${g.max})`
    );
  }
  for (const s of inv.scales) {
    if (s.marks != null && s.intervals != null) {
      lines.push(`- escala "${s.id}": ${s.marks} marcas visíveis → ${s.intervals} intervalos`);
    }
  }
  if (inv.rendered) {
    // Interface RENDERIZADA (template + mass-production): destrava os valores de
    // marca/rótulos que o HTML cru não tem (a reta é desenhada por JS).
    const renderedText = formatRenderedFacts(inv.rendered, {
      scaleId: inv.scales.length ? inv.scales[0].id : null,
    });
    if (renderedText) lines.push(renderedText);
  }
  if (inv.sharedFacts) {
    const els = Object.entries(inv.sharedFacts.elements).sort((a, b) => a[0].localeCompare(b[0]));
    if (els.length) {
      lines.push(
        `- elementos no HTML da interface: ${els.map(([k, v]) => `${k}×${v}`).join(", ")}`
      );
    }
    if (inv.sharedFacts.numericTexts.length) {
      const ints = integerStats(inv.sharedFacts.numericTexts);
      lines.push(
        `- textos numéricos curtos no HTML (rótulos na tela): ${inv.sharedFacts.numericTexts.join(", ")}` +
          (ints ? ` (inteiros: mín ${ints.min}, máx ${ints.max})` : "")
      );
    }
    if (inv.sharedFacts.markCount > 0 && !inv.scales.some((s) => s.marks != null)) {
      lines.push(`- marcas/ticks detectadas no HTML: ${inv.sharedFacts.markCount}`);
    }
  }
  return lines.join("\n");
}
