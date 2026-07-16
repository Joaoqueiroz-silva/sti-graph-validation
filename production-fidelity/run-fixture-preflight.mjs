#!/usr/bin/env node

/** Executa o preflight mockado sobre todas as fixtures congeladas, sem rede. */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256Json } from "./equivalence-gate.mjs";
import { runMockPreflight } from "./preflight-runner.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_FIXTURE_DIR = path.join(HERE, "fixtures");
const DEFAULT_OUTPUT = path.join(HERE, "reports/offline-fixture-preflight.json");

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

export function runFixturePreflight({ fixtureDir = DEFAULT_FIXTURE_DIR } = {}) {
  const manifestPath = path.join(fixtureDir, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest?.schemaVersion !== "educaoff-agent3-fixture-manifest-v1") {
    throw new Error("Manifesto de fixtures ausente ou incompatível.");
  }

  const cases = manifest.fixtures.map((fixture) => {
    const fixturePath = path.join(fixtureDir, fixture.filename);
    const actualFileSha256 = sha256File(fixturePath);
    if (actualFileSha256 !== fixture.fileSha256) {
      throw new Error(`Hash de arquivo divergente: ${fixture.filename}.`);
    }
    const state = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
    const actualStateSha256 = sha256Json(state);
    if (actualStateSha256 !== fixture.stateSha256) {
      throw new Error(`Hash de estado divergente: ${fixture.filename}.`);
    }
    const report = runMockPreflight(state);
    return {
      batch: fixture.batch,
      filename: fixture.filename,
      exerciseIds: fixture.exerciseIds,
      stateSha256: actualStateSha256,
      plumbingPassed: report.equivalence.passed,
      productionEquivalent: report.productionEquivalent,
      productionClaimAllowed: report.equivalence.productionClaimAllowed,
      gates: report.equivalence.gates.map(({ id, passed }) => ({ id, passed })),
      networkCalls: report.networkCalls,
      paidCalls: report.paidCalls,
    };
  });

  return {
    schemaVersion: "educaoff-offline-fixture-preflight-v1",
    executedAt: "2026-07-15T00:00:00.000Z",
    mode: "mock",
    fixtureManifest: "production-fidelity/fixtures/manifest.json",
    batches: cases.length,
    exercises: cases.reduce((total, item) => total + item.exerciseIds.length, 0),
    plumbingPassed: cases.every((item) => item.plumbingPassed),
    productionEquivalent: false,
    productionClaimAllowed: false,
    notice: "Preflight offline valida contrato, hashes e encanamento; não é evidência de execução em produção.",
    networkCalls: cases.reduce((total, item) => total + item.networkCalls, 0),
    paidCalls: cases.reduce((total, item) => total + item.paidCalls, 0),
    cases,
  };
}

export function writeFixturePreflightReport({ outputPath = DEFAULT_OUTPUT, ...options } = {}) {
  const report = runFixturePreflight(options);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = writeFixturePreflightReport();
  process.stdout.write(
    `${JSON.stringify(
      {
        mode: report.mode,
        batches: report.batches,
        exercises: report.exercises,
        plumbingPassed: report.plumbingPassed,
        productionEquivalent: report.productionEquivalent,
        networkCalls: report.networkCalls,
        paidCalls: report.paidCalls,
      },
      null,
      2
    )}\n`
  );
}
