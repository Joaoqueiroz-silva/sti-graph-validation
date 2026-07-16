#!/usr/bin/env node

/**
 * Recalcula os seis derivados por grupo com timestamp canônico, mantendo
 * intocado o analisador congelado cujo hash é citado no protocolo.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeCampaign4Result } from "../production-fidelity/analyze-campaign4-result.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const PLAN = path.join(
  REPO,
  "protocol",
  "production-freeze-2026-07-15",
  "campaign4-full-execution-plan.json"
);

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;

function atomicWrite(file, text) {
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, text, { mode: 0o600 });
  fs.renameSync(temporary, file);
}

export function reanalyzeCampaign4Public({ write = false } = {}) {
  const plan = readJson(PLAN);
  const outputs = [];
  const mismatches = [];
  for (const group of plan.groups) {
    const directory = path.join(REPO, group.outputDir);
    const resultPath = path.join(directory, "campaign4-real-pilot.json");
    const outputPath = path.join(directory, "campaign4-real-pilot-metrics-v2.json");
    const source = readJson(resultPath);
    const artifact = analyzeCampaign4Result({ resultPath });
    artifact.createdAt = new Date(source.completedAt).toISOString();
    const expected = serialize(artifact);
    const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : null;
    if (current !== expected) mismatches.push(path.relative(REPO, outputPath));
    if (write) atomicWrite(outputPath, expected);
    outputs.push({ runId: source.runId, output: path.relative(REPO, outputPath) });
  }
  if (!write && mismatches.length) {
    throw new Error(`Derivados C4 divergentes (${mismatches.length}):\n- ${mismatches.join("\n- ")}`);
  }
  return { status: "ok", mode: write ? "write" : "check", groups: outputs.length, outputs };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
  if (!["--write", "--check"].includes(mode)) {
    process.stderr.write("Uso: node analysis/reanalyze-campaign4-public.mjs --write|--check\n");
    process.exitCode = 2;
  } else {
    process.stdout.write(
      `${JSON.stringify(reanalyzeCampaign4Public({ write: mode === "--write" }))}\n`
    );
  }
}
