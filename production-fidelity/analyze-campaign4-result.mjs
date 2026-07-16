#!/usr/bin/env node

/**
 * Aplica, somente depois do fechamento das saidas brutas, a referencia CTAT e as
 * metricas pre-registradas da Campanha 4. Nao faz rede nem chama LLM.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateCampaign4Batch,
  evaluateCampaign4Transport,
} from "./campaign4-metrics-v2.mjs";
import { parseCtatReferenceV2 } from "./ctat-reference-v2.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

export function analyzeCampaign4Result({
  resultPath,
  fixtureDir = path.join(REPO, "production-fidelity", "fixtures"),
  corpusDir = path.join(REPO, "datasets", "frac-numberline-6.17", "problems"),
} = {}) {
  if (!resultPath) throw new Error("resultPath obrigatorio");
  const absoluteResult = path.resolve(resultPath);
  const result = readJson(absoluteResult);
  if (result.schemaVersion !== "educaoff-campaign4-real-runner-v2") {
    throw new Error("Resultado nao pertence ao runner real v2");
  }
  if (!Array.isArray(result.cases) || !result.cases.length) {
    throw new Error("Resultado sem casos congelados");
  }

  const referenceCache = new Map();
  const referencesFor = (state) =>
    Object.fromEntries(
      state.seedProblems.map((problem) => {
        const problemId = String(problem.id);
        if (!referenceCache.has(problemId)) {
          const brdPath = path.join(corpusDir, problemId, "expert.brd");
          const brdXml = fs.readFileSync(brdPath, "utf8");
          referenceCache.set(problemId, {
            reference: parseCtatReferenceV2(brdXml, { problemId }),
            brdPath: path.relative(REPO, brdPath),
            brdSha256: sha256File(brdPath),
          });
        }
        return [problemId, referenceCache.get(problemId).reference];
      })
    );

  const cases = result.cases.map((caseArtifact) => {
    const fixturePath = path.join(fixtureDir, caseArtifact.filename);
    const state = readJson(fixturePath);
    const referencesByProblemId = referencesFor(state);
    const capacityConfig = caseArtifact.graphForge?.capacity3c?.config;
    const capacityArtifacts = caseArtifact.graphForge?.capacity3c?.artifacts;
    const operationalConfig = caseArtifact.graphForge?.operational?.config;
    const operationalArtifacts = caseArtifact.graphForge?.operational?.artifacts;
    const directAndCapacity = evaluateCampaign4Batch({
      state,
      referencesByProblemId,
      rawAgentOutputs: caseArtifact.rawAgentOutputs,
      graphForgeConfig: capacityConfig,
      graphForgeArtifacts: capacityArtifacts,
      agent3cInvoked: caseArtifact.rawAgentOutputs?.agent3c != null,
    });
    const operationalTransport = evaluateCampaign4Transport({
      state,
      rawAgentOutputs: caseArtifact.rawAgentOutputs,
      graphForgeConfig: operationalConfig,
      graphForgeArtifacts: operationalArtifacts,
    });
    return {
      stateId: caseArtifact.stateId,
      filename: caseArtifact.filename,
      fixtureSha256: sha256File(fixturePath),
      exerciseIds: caseArtifact.exerciseIds,
      operationalPolicy: caseArtifact.operationalPolicy,
      metrics: directAndCapacity,
      transportOperational: operationalTransport,
    };
  });

  return {
    schemaVersion: "educaoff-campaign4-analysis-v1",
    createdAt: new Date(result.completedAt).toISOString(),
    source: {
      resultPath: path.relative(REPO, absoluteResult),
      resultSha256: sha256File(absoluteResult),
      runId: result.runId,
      runnerSchemaVersion: result.schemaVersion,
      runnerStatus: result.status,
    },
    analysisTiming: "after-raw-output-freeze",
    networkCalls: 0,
    llmCalls: 0,
    costUsdAccounted: result.safety?.spentUsd ?? null,
    referenceFiles: Object.fromEntries(
      [...referenceCache.entries()].map(([problemId, value]) => [
        problemId,
        { path: value.brdPath, sha256: value.brdSha256 },
      ])
    ),
    cases,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [resultPath, outputPath] = process.argv.slice(2);
  if (!resultPath || !outputPath) {
    process.stderr.write("Uso: node analyze-campaign4-result.mjs RESULT.json OUTPUT.json\n");
    process.exitCode = 2;
  } else {
    const artifact = analyzeCampaign4Result({ resultPath });
    writeJson(path.resolve(outputPath), artifact);
    process.stdout.write(
      `${JSON.stringify({
        status: "completed",
        runId: artifact.source.runId,
        cases: artifact.cases.length,
        exercises: artifact.cases.reduce((sum, item) => sum + item.exerciseIds.length, 0),
        output: path.resolve(outputPath),
      })}\n`
    );
  }
}
