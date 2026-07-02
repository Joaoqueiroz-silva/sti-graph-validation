/**
 * evaluation/ingest-ctat-html.js — HTML (interface CTAT) → descritor de interface.
 *
 * Lê o HTML de uma interface de tutor (exportada do CTAT) e extrai:
 *   - o enunciado do problema (preferindo o campo dentro da seção CTATProblem);
 *   - os componentes interativos: tanto os padrão (input/select/textarea/button)
 *     quanto os do CTAT, que são DIVs com classe (CTATTextField, CTATDoneButton,
 *     CTATNumericStepper, CTATComboBox, ...).
 *
 * Sem LLM — puro parsing. Serve de "interface fixa" pros agentes autorarem o grafo.
 */

import { parse } from "node-html-parser";

const PROBLEM_HINT = /(problem|question|prompt|instruction|enunciado|stem|task)/i;

// Componentes CTAT INTERATIVOS (classe → tipo + rótulo amigável).
const CTAT_INTERACTIVE = {
  ctattextfield: { type: "text", label: "campo de texto" },
  ctattextinput: { type: "text", label: "campo de texto" },
  ctattextarea: { type: "text", label: "área de texto" },
  ctatguppytextfield: { type: "math", label: "campo de fórmula" },
  ctatnumericstepper: { type: "numeric", label: "campo numérico" },
  ctatnumericfield: { type: "numeric", label: "campo numérico" },
  ctatcombobox: { type: "select", label: "lista suspensa" },
  ctatdropdown: { type: "select", label: "lista suspensa" },
  ctatradiobutton: { type: "choice", label: "opção (rádio)" },
  ctatcheckbox: { type: "choice", label: "caixa de seleção" },
  ctatbutton: { type: "button", label: "botão" },
  ctatdonebutton: { type: "button", label: "botão Concluir" },
  ctathintbutton: { type: "button", label: "botão Dica" },
  ctattable: { type: "table", label: "tabela" },
  ctatimage: { type: "image", label: "imagem" },
};

function classTokens(el) {
  return (el.getAttribute("class") || "").toLowerCase().split(/\s+/).filter(Boolean);
}

/** Rótulo de um componente padrão: <label for>, aria-label, placeholder, value ou texto. */
function labelFor(root, el, id) {
  if (id) {
    const lab = root.querySelector(`label[for="${id}"]`);
    if (lab && lab.text.trim()) return lab.text.trim();
  }
  return (
    el.getAttribute("aria-label") ||
    el.getAttribute("placeholder") ||
    el.getAttribute("value") ||
    (el.text || "").trim() ||
    ""
  );
}

function extractProblem(root) {
  // 1) seção específica do problema (CTATProblem, NÃO CTATProblemSolving)
  const probSection = root
    .querySelectorAll("[class]")
    .find((el) => /\bctatproblem\b/.test(classTokens(el).join(" ")));
  if (probSection) {
    const field =
      probSection.querySelector('[class*="TextField"]') || probSection.querySelector("span");
    const txt = (field || probSection).text.replace(/\s+/g, " ").trim();
    if (txt) return txt.slice(0, 600);
  }
  // 2) qualquer elemento com id/classe "de problema"
  const hinted = root
    .querySelectorAll("[id],[class]")
    .find(
      (el) =>
        PROBLEM_HINT.test(el.getAttribute("id") || "") ||
        PROBLEM_HINT.test(el.getAttribute("class") || "")
    );
  const txt = (hinted ? hinted.text : root.text).replace(/\s+/g, " ").trim();
  return txt.slice(0, 600);
}

/**
 * @param {string} html
 * @param {object} overrides  { id, problem, correctAnswer, profile, difficulty, knowledgeComponents }
 */
export function ingestCtatHtml(html, overrides = {}) {
  if (!html || typeof html !== "string") throw new Error("ingestCtatHtml: HTML vazio");
  const root = parse(html, { lowerCaseTagName: true, comment: false });
  root.querySelectorAll("script,style,noscript").forEach((n) => n.remove());

  const problem = overrides.problem || extractProblem(root);

  const seen = new Set();
  const components = [];
  const add = (id, type, label) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    components.push({ id, type, label: String(label || "").slice(0, 120) });
  };

  // a) componentes HTML padrão
  for (const el of root.querySelectorAll("input,select,textarea,button")) {
    const tag = (el.tagName || "").toLowerCase();
    if (tag === "input" && /hidden|submit|reset/i.test(el.getAttribute("type") || "")) continue;
    const id = el.getAttribute("id") || el.getAttribute("name") || `comp_${components.length + 1}`;
    const type = tag === "input" ? el.getAttribute("type") || "text" : tag;
    add(id, type, labelFor(root, el, id));
  }

  // b) componentes CTAT (DIVs com classe CTATxxx)
  for (const el of root.querySelectorAll("[class]")) {
    for (const cls of classTokens(el)) {
      const def = CTAT_INTERACTIVE[cls];
      if (!def) continue;
      const id = el.getAttribute("id") || cls; // ex.: "io6uy" ou "ctatdonebutton"
      add(id, def.type, def.label);
      break; // 1 componente por elemento
    }
  }

  // c) componentes CTAT custom via data-*
  for (const el of root.querySelectorAll("[data-ctat-component],[data-component]")) {
    const id =
      el.getAttribute("id") ||
      el.getAttribute("data-ctat-component") ||
      `ctat_${components.length}`;
    add(id, el.getAttribute("data-ctat-component") || "ctat-component", "");
  }

  return {
    id: overrides.id || "ctat-upload",
    problem,
    profile: overrides.profile || "reader",
    difficulty: overrides.difficulty || "medium",
    correctAnswer: overrides.correctAnswer || null,
    knowledgeComponents: overrides.knowledgeComponents || [],
    components,
    _meta: { nComponents: components.length, htmlLength: html.length },
  };
}
