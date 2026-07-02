/**
 * evaluation/preview-html.js — Prepara o HTML do CTAT para PREVIEW (iframe).
 *
 * Problema: o HTML do CTAT (a) tem <script> que, ao rodar, limpam/substituem o
 * conteúdo estático (some o enunciado e os campos); (b) referencia CSS/imagens
 * LOCAIS (pasta Assets) que não existem no servidor.
 *
 * Solução: remove os <script> e EMBUTE inline os assets locais enviados (CSS como
 * <style>, imagens como data URI). Mantém URLs absolutas (CDN do CTAT) intactas.
 * Assim o iframe mostra a interface "de fato", como autorada.
 */

const MIME = {
  css: "text/css",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  bmp: "image/bmp",
};

function ext(name) {
  const m = String(name)
    .toLowerCase()
    .match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

/** Basename minúsculo, sem query/hash: "Assets/6.17.css?v=2" → "6.17.css". */
export function assetKey(p) {
  return String(p).split(/[\\/]/).pop().split(/[?#]/)[0].toLowerCase();
}

function dataUri(buf, mime) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf));
  return `data:${mime};base64,${b.toString("base64")}`;
}

function isExternal(url) {
  return /^(https?:)?\/\//i.test(url) || /^data:/i.test(url) || /^#/.test(url);
}

/** Inline url(...) de CSS que aponta para assets locais. */
function inlineCssUrls(css, assets) {
  return css.replace(/url\(\s*["']?([^"')]+)["']?\s*\)/gi, (full, url) => {
    if (isExternal(url)) return full;
    const a = assets[assetKey(url)];
    const e = ext(url);
    if (!a || !MIME[e]) return full;
    return `url("${dataUri(a.content, MIME[e])}")`;
  });
}

/**
 * @param {string} html
 * @param {Object<string,{content: Buffer|string}>} assets  mapa basename→conteúdo
 * @returns {string} HTML pronto para preview em iframe
 */
export function buildPreviewHtml(html, assets = {}, opts = {}) {
  let out = String(html || "");

  // 1) remove scripts (senão o JS do CTAT limpa o conteúdo estático) — a menos que keepScripts
  if (!opts.keepScripts) {
    out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<script\b[^>]*\/>/gi, "");
  }

  // 2) inline <link rel=stylesheet href=LOCAL> → <style>
  out = out.replace(/<link\b[^>]*>/gi, (tag) => {
    const m = tag.match(/href\s*=\s*["']([^"']+)["']/i);
    if (!m || isExternal(m[1])) return tag;
    const a = assets[assetKey(m[1])];
    if (!a || ext(m[1]) !== "css") return tag;
    return `<style>${inlineCssUrls(a.content.toString("utf8"), assets)}</style>`;
  });

  // 3) src/href LOCAL de imagens → data URI
  out = out.replace(/\b(src|href)\s*=\s*["']([^"']+)["']/gi, (full, attr, url) => {
    if (isExternal(url)) return full;
    const a = assets[assetKey(url)];
    const e = ext(url);
    if (!a || !MIME[e] || e === "css") return full;
    return `${attr}="${dataUri(a.content, MIME[e])}"`;
  });

  return out;
}
