#!/usr/bin/env node

/** Congela a reanálise C3 corrigida sem alterar os 65 artefatos históricos. */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const RESULTS = path.join(REPO, "resultados", "campanha3-2026-07-13");
const OUTPUT = path.join(REPO, "protocol", "frozen", "campaign3-correction-v2.2-manifest.json");

const sha256File = (file) =>
  crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

function walk(directory, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute, output);
    else if (entry.isFile()) output.push(absolute);
  }
  return output;
}

function fileEntry(relative) {
  return { path: relative, sha256: sha256File(path.join(REPO, relative)) };
}

function build() {
  const resultFiles = walk(RESULTS)
    .map((file) => path.relative(REPO, file))
    .sort((a, b) => a.localeCompare(b))
    .map(fileEntry);
  if (resultFiles.length !== 65) {
    throw new Error(`Freeze C3 bloqueado: ${resultFiles.length} resultados, esperado=65`);
  }
  return {
    schemaVersion: "educaoff-campaign3-correction-freeze-v2.2",
    recordedOn: "2026-07-15",
    status: "post-hoc-correction-frozen",
    classification:
      "C3 is historical secondary evidence; corrected R_bug uses the registered all-buggy denominator and reconstructs its numerator from retained rounded anchorable rates",
    sources: [
      "analysis/reanalyze-c3.mjs",
      "analysis/rbug-denominator.mjs",
      "metrics-agent3.mjs",
      "docs/METRICAS-V2.md",
      "battery/frac-numberline-6.17-v1/MANIFEST.sha256",
    ].map(fileEntry),
    derived: [
      "analysis/derived/reanalise-c3.json",
      "analysis/derived/TABELAS-C3.md",
    ].map(fileEntry),
    historicalResults: resultFiles,
    limitations: [
      "the primary R_bug numerator was reconstructed from retained anchorable rates rounded to three decimals",
      "the maximum reconstruction error is reported in the derived artifact and is at most 0.003 action",
      "DOM and screenshot arms are preserved but invalid for multimodal inference",
      "the historical judge package contained no system extras and is not evidence of their validity",
    ],
  };
}

const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;
const mode = process.argv[2];
if (!['--write', '--check'].includes(mode)) {
  process.stderr.write("Uso: node analysis/build-c3-correction-manifest.mjs --write|--check\n");
  process.exitCode = 2;
} else {
  const expected = serialize(build());
  if (mode === "--write") {
    const temporary = `${OUTPUT}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, expected, "utf8");
    fs.renameSync(temporary, OUTPUT);
  } else if (!fs.existsSync(OUTPUT) || fs.readFileSync(OUTPUT, "utf8") !== expected) {
    throw new Error("Manifesto C3 corrigido ausente ou divergente; execute c3:freeze:write após auditoria");
  }
  process.stdout.write(
    `${JSON.stringify({ status: "ok", mode, output: path.relative(REPO, OUTPUT), resultFiles: 65 })}\n`
  );
}
