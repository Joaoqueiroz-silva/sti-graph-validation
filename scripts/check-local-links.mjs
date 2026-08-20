#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const SKIP = new Set([".git", "node_modules", "tmp"]);

function walk(directory, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute, output);
    else if (entry.isFile() && entry.name.endsWith(".md")) output.push(absolute);
  }
  return output;
}

function cleanTarget(raw) {
  const unwrapped = raw.trim().replace(/^<|>$/g, "").split(/\s+["']/)[0];
  return decodeURIComponent(unwrapped.split("#")[0].split("?")[0]);
}

function isExternal(target) {
  return /^(?:[a-z]+:|#|\/\/)/i.test(target) || target === "";
}

/**
 * EXCEÇÃO DECLARADA (2026-08-20). As figuras do manuscrito são binárias e vivem
 * FORA do repositório, junto com o .docx e o .pdf gerados — decisão registrada
 * em `artigo/LEIA-ME.md`, regra 2, com a observação de que o texto se sustenta
 * sem elas (toda figura tem legenda autocontida com as fontes). Os links
 * Links de `artigo/` para `figs/` são, portanto, esperados como ausentes.
 *
 * A exceção é ESTREITA de propósito: vale só para arquivos dentro de `artigo/`
 * apontando para `figs/`. Qualquer outro link quebrado continua reprovando, e
 * as ausências são CONTADAS e devolvidas em `externasDeclaradas` para que
 * ninguém as confunda com "nenhum problema".
 */
const ehFiguraExterna = (arquivoRelativo, alvo) =>
  arquivoRelativo.startsWith("artigo/") && /(^|\/)figs\//.test(alvo);

export function checkLocalLinks({ root = REPO } = {}) {
  const broken = [];
  const externasDeclaradas = [];
  let links = 0;
  for (const file of walk(root)) {
    const body = fs.readFileSync(file, "utf8");
    const candidates = [
      ...body.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g),
      ...body.matchAll(/<(?:a|img)\b[^>]*(?:href|src)=["']([^"']+)["'][^>]*>/gi),
    ];
    for (const match of candidates) {
      const raw = match[1];
      if (isExternal(raw.trim())) continue;
      const target = cleanTarget(raw);
      if (!target || isExternal(target)) continue;
      links++;
      const absolute = target.startsWith("/")
        ? path.resolve(root, target.slice(1))
        : path.resolve(path.dirname(file), target);
      if (!fs.existsSync(absolute)) {
        const rel = path.relative(root, file);
        (ehFiguraExterna(rel, target) ? externasDeclaradas : broken).push({
          file: rel,
          target: raw,
        });
      }
    }
  }
  if (broken.length) {
    throw new Error(
      `Links locais quebrados (${broken.length}):\n${broken
        .map((item) => `- ${item.file} -> ${item.target}`)
        .join("\n")}`
    );
  }
  return {
    status: "ok",
    markdownLinksChecked: links,
    filesChecked: walk(root).length,
    externasDeclaradas: externasDeclaradas.length,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(checkLocalLinks())}\n`);
}
