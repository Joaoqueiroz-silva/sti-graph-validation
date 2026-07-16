#!/usr/bin/env node

import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const MANIFEST = path.join(REPO, "protocol", "frozen", "MANIFEST-v6.0.sha256");
const MANUSCRIPT_DIR = path.join(REPO, "docs", "manuscript", "v6.0");
const MANUSCRIPT_SUMS = path.join(MANUSCRIPT_DIR, "SHA256SUMS");

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

function walkRelativeFiles(directory, base = directory, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walkRelativeFiles(absolute, base, output);
    else if (entry.isFile()) output.push(path.relative(base, absolute));
  }
  return output;
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

function writeManifests() {
  const manuscriptFiles = walkRelativeFiles(MANUSCRIPT_DIR)
    .filter((relative) => relative !== "SHA256SUMS")
    .sort((a, b) => a.localeCompare(b));
  const manuscriptText = `${manuscriptFiles
    .map((relative) => `${sha256File(path.join(MANUSCRIPT_DIR, relative))}  ${relative}`)
    .join("\n")}\n`;
  atomicWrite(MANUSCRIPT_SUMS, manuscriptText);
  const files = repositoryFiles();
  atomicWrite(MANIFEST, formatLines(files));
  return { repositoryFiles: files.length, manuscriptFiles: manuscriptFiles.length };
}

function verifyManifests() {
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
  const manuscriptCount = verifyFile(MANUSCRIPT_SUMS, { base: MANUSCRIPT_DIR });
  return { repositoryFiles: repositoryCount, manuscriptFiles: manuscriptCount };
}

const mode = process.argv[2];
if (!['--write', '--verify'].includes(mode)) {
  process.stderr.write("Uso: node scripts/verify-manifest-v6.mjs --write|--verify\n");
  process.exitCode = 2;
} else {
  const counts = mode === "--write" ? writeManifests() : verifyManifests();
  process.stdout.write(`${JSON.stringify({ status: "ok", mode, ...counts })}\n`);
}
