#!/usr/bin/env node

/**
 * verify-manifest-v7.mjs — manifesto de integridade da versão 7.0 do pacote.
 *
 * Desenho da casa (docs/VERSOES.md, regra 4; protocol/frozen/README.md): manifestos
 * são POR VERSÃO. `MANIFEST-v6.0.sha256` descreve o estado consolidado da v6.0
 * (merge do PR #1) e fica CONGELADO como histórico — os arquivos evoluíram com a
 * Campanha 5/v7.0 e regravar o manifesto v6 em cima esconderia essa divergência.
 * Este script mantém o manifesto VIVO da versão atual, `MANIFEST-v7.0.sha256`,
 * que é o gate `manifest:v7:verify` do `verify:offline` (decisão de 2026-07-20,
 * após o teste ácido de reprodutibilidade apontar 8 hashes divergentes no v6).
 *
 * Escopo: todo arquivo do depósito visto pelo git (rastreado ou não ignorado),
 * exceto o próprio manifesto — inclui, de propósito, os 432 runs brutos da
 * Campanha 5 em resultados/campanha5-2026-07-19/<braço>/runs/.
 *
 * Manuscritos:
 *   - docs/manuscript/v6.0/SHA256SUMS é histórico: só VERIFICADO, nunca regravado.
 *   - docs/manuscript/v7.0/ pertence ao fluxo do manuscrito (os hashes citados no
 *     próprio artigo são conferidos por analysis/validate-article-v7.mjs); este
 *     script NÃO grava nada lá dentro. Se um SHA256SUMS existir no diretório, ele
 *     é verificado; os arquivos em si já entram no manifesto do depósito.
 *
 * Uso: node scripts/verify-manifest-v7.mjs --write|--verify
 */

import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const MANIFEST = path.join(REPO, "protocol", "frozen", "MANIFEST-v7.0.sha256");
const MANUSCRIPT_V6_SUMS = path.join(REPO, "docs", "manuscript", "v6.0", "SHA256SUMS");
const MANUSCRIPT_V7_SUMS = path.join(REPO, "docs", "manuscript", "v7.0", "SHA256SUMS");

const sha256File = (file) =>
  crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

function atomicWrite(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, text, "utf8");
  fs.renameSync(temporary, file);
}

function repositoryFiles() {
  const output = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: REPO }
  ).toString("utf8");
  return output
    .split("\0")
    .filter(Boolean)
    .filter((relative) => relative !== path.relative(REPO, MANIFEST))
    .filter((relative) => !relative.endsWith(".tmp"))
    .filter((relative) => fs.existsSync(path.join(REPO, relative)))
    .sort((a, b) => a.localeCompare(b));
}

function formatLines(relativeFiles) {
  return `${relativeFiles
    .map((relative) => `${sha256File(path.join(REPO, relative))}  ${relative}`)
    .join("\n")}\n`;
}

function parseManifest(file) {
  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      const match = line.match(/^([a-f0-9]{64})  (.+)$/);
      if (!match) throw new Error(`${path.relative(REPO, file)}:${index + 1}: linha inválida`);
      return { expected: match[1], relative: match[2] };
    });
}

function verifyFile(file, { base = REPO } = {}) {
  const errors = [];
  const entries = parseManifest(file);
  for (const entry of entries) {
    const absolute = path.resolve(base, entry.relative);
    if (!absolute.startsWith(`${base}${path.sep}`) && absolute !== base) {
      errors.push(`${entry.relative}: caminho fora do depósito`);
    } else if (!fs.existsSync(absolute)) {
      errors.push(`${entry.relative}: ausente`);
    } else {
      const actual = sha256File(absolute);
      if (actual !== entry.expected) errors.push(`${entry.relative}: ${actual} != ${entry.expected}`);
    }
  }
  if (errors.length) throw new Error(`Falhas de integridade (${errors.length}):\n- ${errors.join("\n- ")}`);
  return entries.length;
}

function verifyManuscripts() {
  // v6.0: congelado — só verificação (regravação proibida; ver verify-manifest-v6.mjs).
  const v6Count = verifyFile(MANUSCRIPT_V6_SUMS, { base: path.dirname(MANUSCRIPT_V6_SUMS) });
  // v7.0: SHA256SUMS é opcional e mantido pelo fluxo do manuscrito, nunca por aqui.
  const v7Count = fs.existsSync(MANUSCRIPT_V7_SUMS)
    ? verifyFile(MANUSCRIPT_V7_SUMS, { base: path.dirname(MANUSCRIPT_V7_SUMS) })
    : 0;
  return { manuscriptV6Files: v6Count, manuscriptV7Files: v7Count };
}

function writeManifest() {
  const files = repositoryFiles();
  atomicWrite(MANIFEST, formatLines(files));
  return { repositoryFiles: files.length, ...verifyManuscripts() };
}

function verifyManifest() {
  const repositoryEntries = parseManifest(MANIFEST);
  const repositoryCount = verifyFile(MANIFEST);
  const listed = repositoryEntries.map((entry) => entry.relative).sort((a, b) => a.localeCompare(b));
  const current = repositoryFiles();
  const unlisted = current.filter((relative) => !listed.includes(relative));
  const obsolete = listed.filter((relative) => !current.includes(relative));
  if (unlisted.length || obsolete.length) {
    throw new Error(
      `Escopo do manifesto diverge: ${unlisted.length} arquivo(s) não listado(s), ` +
        `${obsolete.length} entrada(s) obsoleta(s)\n` +
        unlisted.map((relative) => `+ ${relative}`).join("\n") +
        (unlisted.length && obsolete.length ? "\n" : "") +
        obsolete.map((relative) => `- ${relative}`).join("\n")
    );
  }
  return { repositoryFiles: repositoryCount, ...verifyManuscripts() };
}

const mode = process.argv[2];
if (!["--write", "--verify"].includes(mode)) {
  process.stderr.write("Uso: node scripts/verify-manifest-v7.mjs --write|--verify\n");
  process.exitCode = 2;
} else {
  const counts = mode === "--write" ? writeManifest() : verifyManifest();
  process.stdout.write(`${JSON.stringify({ status: "ok", mode, ...counts })}\n`);
}
