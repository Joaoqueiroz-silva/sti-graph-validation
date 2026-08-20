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
  const caminhosEmProsa = [];
  const historicosDeclarados = [];
  const removidosDeclarados = [];
  let links = 0;
  for (const file of walk(root)) {
    const body = fs.readFileSync(file, "utf8");
    // SEGUNDO PASSE (2026-08-20): caminhos citados em PROSA, entre crases, fora
    // de sintaxe de link. A limpeza de 19-20/08 deixou dezenas deles apontando
    // para material removido, e o passe de links era cego a isso — um examinador
    // seguindo o texto batia no vazio sem que nenhum verificador acusasse.
    // Só conta o que PARECE caminho de arquivo do repositório: tem barra e
    // extensão conhecida, ou é um diretório sob uma raiz conhecida.
    const RAIZES = /^(resultados|docs|analysis|scripts|datasets|producao|artigo|cases|battery|protocol|production-fidelity|config|__tests__|runs)\//;
    const EXT = /\.(md|json|mjs|js|html|brd|png|svg|txt|sha256|jsonl|csv|cff|yml)$/;
    // Um caminho seguido da marcação de remoção é ausência DECLARADA no próprio
    // texto — o leitor é avisado ali mesmo de que o arquivo saiu da árvore e
    // está no histórico git. Conta à parte, não como quebra.
    // Formas aceitas de AUSÊNCIA DECLARADA logo após a citação. A ideia é que o
    // leitor seja avisado ali mesmo; a palavra exata não importa, a declaração sim.
    const MARCA_REMOVIDO = /^\s*\*?\((removido|n[ãa]o versionad|fora do reposit[óo]rio|no hist[óo]rico git)/i;
    const prosa = [...body.matchAll(/`([^`\n]+)`/g)]
      .filter((m) => {
        if (MARCA_REMOVIDO.test(body.slice(m.index + m[0].length, m.index + m[0].length + 20))) {
          removidosDeclarados.push({ file: path.relative(root, file), target: m[1].trim() });
          return false;
        }
        return true;
      })
      .map((m) => m[1].trim())
      .filter((t) => t.includes("/") && !isExternal(t) && !t.includes(" "))
      .map((t) => t.replace(/[.,;:)]+$/, ""))
      .filter((t) => RAIZES.test(t) || EXT.test(t));

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
    for (const alvo of prosa) {
      // tira âncora, barra final e sufixo de LINHA (`arquivo.js:556`,
      // `arquivo.js:1353-1357`), que é citação legítima, não caminho quebrado.
      const limpo = alvo
        .replace(/#.*$/, "")
        .replace(/:\d+([-\u2013]\d+)?$/, "") // sufixo de linha, com hífen ou travessão
        .replace(/\/$/, "");
      if (!limpo) continue;
      // reticências marcam caminho abreviado pelo autor: não é verificável
      if (limpo.includes("...")) continue;
      const abs = limpo.startsWith("/")
        ? path.resolve(root, limpo.slice(1))
        : (fs.existsSync(path.resolve(root, limpo)) ? path.resolve(root, limpo) : path.resolve(path.dirname(file), limpo));
      if (fs.existsSync(abs)) continue;
      // caminho com curinga ou placeholder não é verificável
      if (/[*<>{}]/.test(limpo)) continue;
      // Só cobra caminho cuja PRIMEIRA pasta existe neste repositório. Um
      // `backend/agents/...` ou `frontend/src/...` é citação do sistema de
      // produção (espelhado em producao/), não caminho local quebrado.
      const primeira = limpo.split("/")[0];
      if (primeira === ".." || primeira === ".") continue; // caminho relativo a outro projeto
      if (!fs.existsSync(path.resolve(root, primeira))) continue;
      // Documento que se declara HISTÓRICO no topo avisa o leitor, em texto, que
      // cita material removido da árvore (preservado no histórico git). A
      // ausência é esperada e fica CONTADA à parte, nunca somada a zero.
      if (body.includes("DOCUMENTO HISTÓRICO")) { historicosDeclarados.push({ file: path.relative(root, file), target: alvo }); continue; }
      const rel = path.relative(root, file);
      caminhosEmProsa.push({ file: rel, target: alvo });
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
    caminhosEmProsaQuebrados: caminhosEmProsa.length,
    historicosDeclarados: historicosDeclarados.length,
    removidosDeclarados: removidosDeclarados.length,
    prosa: caminhosEmProsa,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(checkLocalLinks())}\n`);
}
