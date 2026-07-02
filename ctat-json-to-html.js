/**
 * evaluation/ctat-json-to-html.js — Converte o JSON do EDITOR do CTAT em HTML.
 *
 * O CTAT salva a interface também como um JSON (árvore estilo GrapeJS):
 *   [{ tagName, classes:[{name}], attributes:{}, components:[...], type, content, void }, ...]
 *
 * Este conversor reconstrói o HTML a partir dessa árvore, para o sistema poder
 * consumir tanto o `.html` quanto o `.json` da interface.
 */

const HEAD_TAGS = new Set(["meta", "title", "link", "style", "base"]);

function classAttr(node) {
  const cls = (node.classes || [])
    .map((c) => (typeof c === "string" ? c : c && c.name))
    .filter(Boolean)
    .join(" ");
  return cls ? ` class="${esc(cls)}"` : "";
}

function attrsStr(node) {
  const a = node.attributes || {};
  let s = "";
  for (const k of Object.keys(a)) {
    if (a[k] === true || a[k] === "") s += ` ${k}`;
    else s += ` ${k}="${esc(String(a[k]))}"`;
  }
  return s;
}

function esc(s) {
  return String(s).replace(/"/g, "&quot;");
}

function nodeToHtml(node) {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (node.type === "textnode") return node.content != null ? String(node.content) : "";

  const tag = node.tagName || "div";
  const open = `<${tag}${classAttr(node)}${attrsStr(node)}`;
  if (node.void) return `${open}/>`;

  let inner = "";
  if (Array.isArray(node.components)) inner += node.components.map(nodeToHtml).join("");
  // type "text": content é HTML interno (ex.: o <span> do enunciado)
  if (node.content != null && node.type !== "textnode") inner += String(node.content);

  return `${open}>${inner}</${tag}>`;
}

/** Detecta se um valor parseado parece a árvore do editor CTAT. */
export function looksLikeEditorJson(data) {
  const arr = Array.isArray(data)
    ? data
    : data && Array.isArray(data.components)
      ? data.components
      : null;
  if (!arr || !arr.length) return false;
  return arr.some((n) => n && (n.tagName || n.classes || n.components || n.type));
}

/** Converte a árvore do editor (array ou objeto raiz) em um documento HTML. */
export function editorJsonToHtml(data) {
  const nodes = Array.isArray(data)
    ? data
    : data && Array.isArray(data.components)
      ? data.components
      : [data];
  const head = [];
  const body = [];
  for (const n of nodes) {
    const tag = (n && n.tagName ? n.tagName : "").toLowerCase();
    (HEAD_TAGS.has(tag) ? head : body).push(n);
  }
  return (
    `<!doctype html><html><head>` +
    head.map(nodeToHtml).join("") +
    `</head><body>` +
    body.map(nodeToHtml).join("") +
    `</body></html>`
  );
}
