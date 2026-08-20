#!/usr/bin/env node
/** Orquestrador separado e idempotente do holdout confirmatório clean-room. */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  REPO,
  MODELS,
  MATERIALIZATION_MODEL,
  cleanChildEnv,
  reconcileBudget,
} from "./experimento-orientador-v08.mjs";
import {
  DATASET_NAME,
  DATASET_ROOT,
  SEED as DATASET_SEED,
  verificarDataset,
} from "./gerar-holdout-cleanroom-v08.mjs";
import {
  envDaPoliticaReasoning,
  politicaReasoningDoModeloV08,
  REASONING_BY_MODEL_V08,
} from "../reasoning-policy.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PROTOCOL_VERSION = "0.8-holdout-cleanroom";
export const REPLICAS = 10;
export const CHUNK_SIZE = 5;
export const INPUT_POLICY = "somente-enunciado-v1";
export const EXPECTED_MAIN_USD = 216.4;
export const EXPECTED_HOLDOUT_USD = 51.524025;
export const EXPECTED_COMBINED_USD = 267.924025;
export const RECOMMENDED_HOLDOUT_CAP_USD = 60;
export const HARD_CAP_COMBINED_USD = 310;
const MATERIALIZATION_EXPECTED_USD_PER_RUN = 0.006;
const MATERIALIZATION_CALL_RESERVE_USD = 0.02;
const AMENDMENT = "docs/EMENDA-V0.8-02-HOLDOUT-CLEANROOM-2026-08-20.md";

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const round = (value, digits = 6) => Number(value.toFixed(digits));
const json = (value) => JSON.stringify(value, null, 1) + "\n";
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

const chunks = (items, size) => {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

function problemInventory(repo = REPO) {
  verificarDataset({ root: path.join(repo, "datasets", DATASET_NAME), seed: DATASET_SEED });
  const dir = path.join(repo, "datasets", DATASET_NAME, "problems");
  const ids = fs.readdirSync(dir).filter((id) => {
    const base = path.join(dir, id);
    return ["envelope-a.json", "envelope-b.json", "reference-v08.json"].every((name) => fs.existsSync(path.join(base, name)));
  }).sort();
  if (ids.length !== 50) throw new Error(`holdout deveria ter 50 problemas; encontrou ${ids.length}`);
  return ids.map((id) => {
    const base = path.join(dir, id);
    const envelopeA = readJson(path.join(base, "envelope-a.json"));
    const reference = readJson(path.join(base, "reference-v08.json"));
    if (JSON.stringify(Object.keys(envelopeA).sort()) !== JSON.stringify(["id", "problem"])) {
      throw new Error(`${id}: envelope-a deve conter exclusivamente id e problem`);
    }
    return {
      id,
      family: reference.family,
      hashes: Object.fromEntries(["envelope-a.json", "envelope-b.json", "reference-v08.json"].map((name) => [name, sha256(fs.readFileSync(path.join(base, name)))])),
    };
  });
}

export function buildHoldoutPlan({ repo = REPO } = {}) {
  const problems = problemInventory(repo);
  const problemIds = problems.map((problem) => problem.id);
  const cells = [];
  let ordinal = 0;
  for (const model of MODELS) {
    for (const [chunkIndex, ids] of chunks(problemIds, CHUNK_SIZE).entries()) {
      ordinal++;
      const nRuns = ids.length * REPLICAS;
      const maxGenerationPerRun =
        (150000 / 1e6) * model.price.input + ((16000 + 24000 + 16000) / 1e6) * model.price.output;
      const maxMaterializationPerRun =
        2 * (50000 / 1e6) * 0.1 + ((24000 + 12000) / 1e6) * 0.6;
      const rel = path.join("cells", DATASET_NAME, model.slug, INPUT_POLICY, `chunk-${String(chunkIndex + 1).padStart(2, "0")}`);
      cells.push({
        id: `holdout-${String(ordinal).padStart(2, "0")}-${model.slug}-c${String(chunkIndex + 1).padStart(2, "0")}`,
        dataset: DATASET_NAME,
        model: model.id,
        modelSlug: model.slug,
        inputPolicy: INPUT_POLICY,
        reasoning: politicaReasoningDoModeloV08(model.id),
        problemIds: ids,
        replicas: REPLICAS,
        nRuns,
        rawDir: path.join(rel, "bruto"),
        materializedDir: path.join(rel, "materializado"),
        reservesUsd: {
          generationCell: round(nRuns * maxGenerationPerRun),
          generationCall: model.callReserveUsd,
          materializationCell: round(nRuns * maxMaterializationPerRun),
          materializationCall: MATERIALIZATION_CALL_RESERVE_USD,
        },
      });
    }
  }
  const runsPerModel = problemIds.length * REPLICAS;
  const generationByModel = MODELS.map((model) => {
    const expectedUsdPerRun =
      (model.tokensPerRun.input / 1e6) * model.price.input +
      (model.tokensPerRun.output / 1e6) * model.price.output;
    return {
      model: model.id,
      reasoning: politicaReasoningDoModeloV08(model.id),
      runs: runsPerModel,
      calls: runsPerModel * 3,
      expectedUsdPerRun: round(expectedUsdPerRun, 8),
      expectedUsd: round(runsPerModel * expectedUsdPerRun, 6),
    };
  });
  const rawRuns = problemIds.length * MODELS.length * REPLICAS;
  const generationUsd = generationByModel.reduce((sum, row) => sum + row.expectedUsd, 0);
  const materializationUsd = rawRuns * MATERIALIZATION_EXPECTED_USD_PER_RUN;
  const holdoutExpected = generationUsd + materializationUsd;
  const manifestFile = path.join(repo, "datasets", DATASET_NAME, "manifest.json");
  const softwareFiles = [
    AMENDMENT,
    "reasoning-policy.js",
    "input-policy.js",
    "llm.js",
    "scripts/gerar-holdout-cleanroom-v08.mjs",
    "scripts/experimento-holdout-cleanroom-v08.mjs",
    "scripts/reproduce-collect.mjs",
    "scripts/materializar-lote.mjs",
    "analysis/orientador-v08/atomos.mjs",
    "analysis/orientador-v08/holdout-cleanroom.mjs",
  ];
  const softwareSha256 = Object.fromEntries(softwareFiles.map((rel) => {
    const file = path.join(repo, rel);
    if (!fs.existsSync(file)) throw new Error(`arquivo do plano ausente: ${rel}`);
    return [rel, sha256(fs.readFileSync(file))];
  }));
  const core = {
    schema: "sti.holdout-cleanroom-v08.experiment-plan/1",
    protocolVersion: PROTOCOL_VERSION,
    amendment: AMENDMENT,
    createdBeforeFirstCall: true,
    dataset: {
      name: DATASET_NAME,
      seed: DATASET_SEED,
      license: "CC0-1.0",
      manifestSha256: sha256(fs.readFileSync(manifestFile)),
      contentSha256: readJson(manifestFile).contentSha256,
      problems,
    },
    design: {
      problems: problemIds.length,
      families: 5,
      models: MODELS.map((model) => model.id),
      inputPolicies: [INPUT_POLICY],
      replicas: REPLICAS,
      cells: cells.length,
      chunkSize: CHUNK_SIZE,
      rawRuns,
      materializedRuns: rawRuns,
      pairedGraphArtifacts: rawRuns * 2,
      generationCalls: rawRuns * 3,
      materializationCalls: rawRuns * 2,
      logicalCalls: rawRuns * 5,
      topology: "livre",
      primaryInferentialUnit: "problem (n=50), after averaging replicas within model and models within problem",
      reasoningByModel: REASONING_BY_MODEL_V08,
    },
    costEstimate: {
      currency: "USD",
      generationByModel,
      materialization: {
        model: MATERIALIZATION_MODEL,
        reasoning: politicaReasoningDoModeloV08(MATERIALIZATION_MODEL),
        runs: rawRuns,
        calls: rawRuns * 2,
        expectedUsdPerRun: MATERIALIZATION_EXPECTED_USD_PER_RUN,
        expectedUsd: round(materializationUsd, 6),
      },
      holdoutExpectedUsd: round(holdoutExpected, 6),
      holdoutRecommendedCapUsd: RECOMMENDED_HOLDOUT_CAP_USD,
      mainExpectedUsd: EXPECTED_MAIN_USD,
      combinedExpectedUsd: round(EXPECTED_MAIN_USD + holdoutExpected, 6),
      combinedHardCapUsd: HARD_CAP_COMBINED_USD,
      basis: "same frozen token profiles/prices as v0.8; provider completion usage includes any billed minimal reasoning",
    },
    softwareSha256,
    cells,
  };
  const coreText = json(core);
  return { ...core, planSha256: sha256(coreText) };
}

export const planText = (plan) => json(plan);

function parseArgs(argv) {
  const args = { execute: false, out: null, budgetUsd: null, resume: false, retryOrphans: false, manifest: null, allowDirty: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--plano") args.execute = false;
    else if (arg === "--executar") args.execute = true;
    else if (arg === "--out") args.out = argv[++i] || null;
    else if (arg === "--budget-usd") args.budgetUsd = Number(argv[++i]);
    else if (arg === "--retomar") args.resume = true;
    else if (arg === "--autorizar-repetir-chamadas-orfas") args.retryOrphans = true;
    else if (arg === "--manifesto") args.manifest = argv[++i] || null;
    else if (arg === "--allow-dirty") args.allowDirty = true;
    else throw new Error(`flag desconhecida: ${arg}`);
  }
  if (args.resume && !args.execute) throw new Error("--retomar exige --executar");
  if (args.retryOrphans && !args.resume) throw new Error("repetir chamadas órfãs exige --retomar");
  return args;
}

function printPlan(plan, out) {
  console.log("HOLDOUT CLEAN-ROOM V0.8 — SOMENTE PLANO (zero chamadas de rede)");
  console.log(`  plano sha256: ${plan.planSha256}`);
  console.log(`  ${plan.design.problems} problemas · 5 famílias · 3 modelos · 10 réplicas · política estrita`);
  console.log(`  ${plan.design.rawRuns} brutos + ${plan.design.materializedRuns} finais = ${plan.design.pairedGraphArtifacts} grafos`);
  console.log(`  ${plan.design.cells} células · ${plan.design.logicalCalls} chamadas lógicas`);
  for (const row of plan.costEstimate.generationByModel) {
    console.log(`  ${row.model.padEnd(34)} ${String(row.runs).padStart(4)} runs · ~US$ ${row.expectedUsd.toFixed(2)}`);
  }
  console.log(`  ${MATERIALIZATION_MODEL.padEnd(34)} ${String(plan.costEstimate.materialization.runs).padStart(4)} runs · ~US$ ${plan.costEstimate.materialization.expectedUsd.toFixed(2)}`);
  console.log(`  holdout esperado: ~US$ ${plan.costEstimate.holdoutExpectedUsd.toFixed(2)}; teto isolado recomendado: US$ ${plan.costEstimate.holdoutRecommendedCapUsd.toFixed(2)}`);
  console.log(`  principal + holdout esperado: ~US$ ${plan.costEstimate.combinedExpectedUsd.toFixed(2)}; TETO DURO GLOBAL: US$ ${plan.costEstimate.combinedHardCapUsd.toFixed(2)}`);
  console.log("\nNENHUMA CHAMADA FOI FEITA. Após autorização expressa do teto combinado:");
  console.log(`  node -r dotenv/config scripts/experimento-completo-v08.mjs --executar --budget-usd ${HARD_CAP_COMBINED_USD} --out ${out || "resultados/experimento-completo-v08"}`);
}

function gitStatus(repo, ignoredOutput) {
  const result = spawnSync("git", ["status", "--porcelain"], { cwd: repo, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`preflight git falhou: ${result.stderr || result.stdout}`);
  const ignored = ignoredOutput ? path.relative(repo, path.resolve(repo, ignoredOutput)).split(path.sep).join("/") : null;
  return result.stdout.split("\n").filter(Boolean).filter((line) => {
    if (!ignored || ignored.startsWith("../")) return true;
    const changed = line.slice(3).replace(/^"|"$/g, "");
    return changed !== ignored && !changed.startsWith(`${ignored}/`);
  }).join("\n");
}

function executionPreflight(args, plan) {
  if (!args.out) throw new Error("--executar exige --out explícito");
  if (!Number.isFinite(args.budgetUsd) || args.budgetUsd <= 0) throw new Error("--executar exige --budget-usd positivo");
  if (args.budgetUsd > HARD_CAP_COMBINED_USD) throw new Error(`protocolo recusa teto acima de US$ ${HARD_CAP_COMBINED_USD}`);
  if (!process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY.length < 20) throw new Error("OPENROUTER_API_KEY ausente/inválida; nenhuma chamada feita");
  if (Number(process.versions.node.split(".")[0]) < 20) throw new Error(`Node >=20 requerido; atual ${process.version}`);
  verificarDataset();
  if (!args.allowDirty) {
    const dirty = gitStatus(REPO, args.out);
    if (dirty) throw new Error("worktree suja; faça commit antes da coleta (ou use --allow-dirty conscientemente)");
  }
  if (args.budgetUsd < plan.costEstimate.holdoutExpectedUsd) {
    console.warn(`AVISO: teto US$ ${args.budgetUsd.toFixed(2)} abaixo do esperado do holdout US$ ${plan.costEstimate.holdoutExpectedUsd.toFixed(2)}`);
  }
}

async function remotePreflight(args, plan) {
  const headers = { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` };
  const request = async (url, auth) => {
    const response = await fetch(url, { headers: auth ? headers : {}, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`preflight remoto falhou (${response.status}) em ${url}; nenhuma chamada paga iniciada`);
    return response.json();
  };
  const [credits, models] = await Promise.all([
    request("https://openrouter.ai/api/v1/credits", true),
    request("https://openrouter.ai/api/v1/models", false),
  ]);
  const available = new Set((models?.data || []).map((row) => row?.id).filter(Boolean));
  const missing = [...plan.design.models, MATERIALIZATION_MODEL].filter((model) => !available.has(model));
  if (missing.length) throw new Error(`modelo(s) indisponível(is): ${missing.join(", ")}`);
  const remaining = Number(credits?.data?.total_credits) - Number(credits?.data?.total_usage);
  const spent = reconcileBudget(path.resolve(REPO, args.out)).totalUsd;
  const required = Math.min(args.budgetUsd - spent, plan.costEstimate.holdoutExpectedUsd);
  if (Number.isFinite(remaining) && remaining < required) throw new Error(`saldo US$ ${remaining.toFixed(2)} abaixo do necessário US$ ${required.toFixed(2)}`);
}

function expectedNames(cell) {
  return cell.problemIds.flatMap((id) => Array.from({ length: cell.replicas }, (_, index) => `${id}_rep${index + 1}.json`)).sort();
}

function phaseComplete(cell, root, phase) {
  const dir = path.join(root, phase === "raw" ? cell.rawDir : cell.materializedDir, "runs");
  if (!fs.existsSync(dir)) return false;
  const actual = fs.readdirSync(dir).filter((name) => name.endsWith(".json")).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expectedNames(cell))) return false;
  for (const name of actual) {
    const run = readJson(path.join(dir, name));
    if (run?.politicaInput?.id !== INPUT_POLICY || run?.modelos?.porAgente?.estudantes !== cell.model) return false;
    if (!run?.bruto?.behaviorGraph) return false;
    if (phase === "materialized" && (!run?.materializado?.behaviorGraph || run?.materializado?.modelos?.materializacao !== MATERIALIZATION_MODEL)) return false;
  }
  return true;
}

function recursiveFiles(root, predicate, out = []) {
  if (!fs.existsSync(root)) return out;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) recursiveFiles(full, predicate, out);
    else if (predicate(full)) out.push(full);
  }
  return out;
}

function expectedReasoningRecord(policy) {
  return policy.omit
    ? { mode: "omitted", effort: null, exclude: null }
    : { mode: "explicit", effort: policy.effort, exclude: policy.exclude !== false };
}

function auditManifests(phaseRoot, model, runs, minOk, policy) {
  const files = recursiveFiles(path.join(phaseRoot, "manifests"), (file) => file.endsWith(".jsonl")).sort();
  if (files.length !== runs) throw new Error(`${phaseRoot}: ${files.length} manifests; esperado ${runs}`);
  const expected = expectedReasoningRecord(policy);
  for (const file of files) {
    let ok = 0;
    for (const line of fs.readFileSync(file, "utf8").split("\n").filter(Boolean)) {
      const call = JSON.parse(line);
      if (call.model !== model) throw new Error(`${file}: modelo ${call.model}; esperado ${model}`);
      if (call.reasoning?.mode !== expected.mode || call.reasoning?.effort !== expected.effort || call.reasoning?.exclude !== expected.exclude) {
        throw new Error(`${file}: política reasoning divergente`);
      }
      if (call.status === "ok") ok++;
    }
    if (ok < minOk) throw new Error(`${file}: ${ok} chamadas ok; mínimo ${minOk}`);
  }
}

function assertBudget(root, limit, reserve, label) {
  const budget = reconcileBudget(root);
  if (budget.totalUsd > limit + 1e-9 || budget.totalUsd + reserve > limit + 1e-9) {
    throw new Error(`TRAVA GLOBAL ${label}: gasto US$ ${budget.totalUsd.toFixed(4)} + reserva US$ ${reserve.toFixed(4)} > teto US$ ${limit.toFixed(2)}`);
  }
  return budget;
}

function runChild(args, env) {
  const result = spawnSync(process.execPath, ["-r", "dotenv/config", ...args], { cwd: REPO, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`subprocesso falhou (exit ${result.status}): ${args.join(" ")}`);
}

function acquireLock(root, resume) {
  const file = path.join(root, ".holdout-cleanroom.lock");
  const token = crypto.randomUUID();
  const payload = { pid: process.pid, host: os.hostname(), token, acquiredAt: new Date().toISOString() };
  const create = () => fs.writeFileSync(file, json(payload), { flag: "wx" });
  try { create(); } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const prior = (() => { try { return readJson(file); } catch { return null; } })();
    let alive = true;
    if (prior?.host === os.hostname() && Number.isInteger(prior?.pid)) {
      try { process.kill(prior.pid, 0); } catch (probe) { alive = probe.code === "EPERM"; }
    }
    if (alive || !resume) throw new Error(`lock holdout ativo/indeterminado: ${file}`);
    fs.unlinkSync(file);
    create();
  }
  return () => {
    try { if (readJson(file)?.token === token) fs.unlinkSync(file); } catch { /* não remove lock alheio */ }
  };
}

function checkpoint(root, plan, patch) {
  const file = path.join(root, "checkpoint-holdout-cleanroom-v08.json");
  let current = {};
  try { current = readJson(file); } catch { /* novo */ }
  writeAtomic(file, json({ schema: "sti.holdout-cleanroom-v08.checkpoint/1", planSha256: plan.planSha256, startedAt: current.startedAt || new Date().toISOString(), ...current, ...patch, updatedAt: new Date().toISOString() }));
}

async function execute(args, plan) {
  executionPreflight(args, plan);
  await remotePreflight(args, plan);
  const root = path.resolve(REPO, args.out);
  fs.mkdirSync(root, { recursive: true });
  const manifest = path.join(root, "manifesto-plano-holdout-cleanroom-v08.json");
  const frozen = planText(plan);
  if (fs.existsSync(manifest)) {
    if (!args.resume) throw new Error("holdout já inicializado; use --retomar");
    if (fs.readFileSync(manifest, "utf8") !== frozen) throw new Error("retomada recusada: plano holdout divergiu");
  } else {
    const holdoutCells = path.join(root, "cells", DATASET_NAME);
    if (fs.existsSync(holdoutCells)) throw new Error("células holdout existem sem manifesto congelado");
    writeAtomic(manifest, frozen);
  }
  const release = acquireLock(root, args.resume);
  try {
    checkpoint(root, plan, { status: "running", budgetUsd: args.budgetUsd, dirtyAuthorized: args.allowDirty });
    for (const [index, cell] of plan.cells.entries()) {
      const rawRoot = path.join(root, cell.rawDir);
      const materializedRoot = path.join(root, cell.materializedDir);
      const reasoningEnv = envDaPoliticaReasoning(cell.reasoning);
      console.log(`\n[holdout ${index + 1}/${plan.cells.length}] ${cell.id}`);
      if (!phaseComplete(cell, root, "raw")) {
        assertBudget(root, args.budgetUsd, cell.reservesUsd.generationCell, `${cell.id}/geração`);
        const env = cleanChildEnv({
          STI_DATASET: DATASET_NAME,
          STI_BUDGET_DIR: path.join(root, "_budget"),
          STI_BUDGET_USD: String(args.budgetUsd),
          STI_BUDGET_RESERVE_USD: String(cell.reservesUsd.generationCall),
          STI_MANIFEST_STRICT: "1",
          AGENT3A_TEMP: "0.2", AGENT3B_TEMP: "0.7", AGENT3C_TEMP: "0.4", SHIM_TEMP: "0.7",
          STI_PASSOS_LIVRES: "1", STI_INTERFACE_FIXA: "0",
          STI_AGENT6_WORKER_MAX_TOKENS: "12000", STI_AGENT6_WORKER_TIMEOUT_MS: "180000",
          STI_CATALOGO_SEM_FILTRO: "0", STI_DISABLE_PAYLOAD_GUARD: "0", STI_MC_BUDGET: "0.3",
          FALLBACK_MODEL: cell.model,
          ...reasoningEnv,
        });
        runChild(["scripts/reproduce-collect.mjs", "--fluxo", "plataforma", "--passos-livres", "--input-policy", INPUT_POLICY, "--modelo", `estudantes=${cell.model}`, "--problem-ids", cell.problemIds.join(","), "--replicas", String(REPLICAS), "--out", rawRoot, "--yes", "--resume", "--fail-fast", ...(args.retryOrphans ? ["--retry-orphans"] : [])], env);
        if (!phaseComplete(cell, root, "raw")) throw new Error(`${cell.id}: geração incompleta`);
      }
      auditManifests(rawRoot, cell.model, cell.nRuns, 3, cell.reasoning);
      if (!phaseComplete(cell, root, "materialized")) {
        assertBudget(root, args.budgetUsd, cell.reservesUsd.materializationCell, `${cell.id}/materialização`);
        const materializationPolicy = politicaReasoningDoModeloV08(MATERIALIZATION_MODEL);
        const env = cleanChildEnv({
          STI_DATASET: DATASET_NAME,
          STI_BUDGET_DIR: path.join(root, "_budget"),
          STI_BUDGET_USD: String(args.budgetUsd),
          STI_BUDGET_RESERVE_USD: String(cell.reservesUsd.materializationCall),
          STI_MANIFEST_STRICT: "1",
          STI_AGENT6_WORKER_MAX_TOKENS: "12000", STI_AGENT6_WORKER_TIMEOUT_MS: "180000",
          STI_CATALOGO_SEM_FILTRO: "0", STI_DISABLE_PAYLOAD_GUARD: "0", STI_MC_BUDGET: "0.3",
          FALLBACK_MODEL: MATERIALIZATION_MODEL,
          ...envDaPoliticaReasoning(materializationPolicy),
        });
        runChild(["scripts/materializar-lote.mjs", "--runs", path.join(rawRoot, "runs"), "--out", materializedRoot, "--input-policy", INPUT_POLICY, "--modelo-materializacao", MATERIALIZATION_MODEL, "--yes", "--resume", "--fail-fast", ...(args.retryOrphans ? ["--retry-orphans"] : [])], env);
        if (!phaseComplete(cell, root, "materialized")) throw new Error(`${cell.id}: materialização incompleta`);
      }
      auditManifests(materializedRoot, MATERIALIZATION_MODEL, cell.nRuns, 2, politicaReasoningDoModeloV08(MATERIALIZATION_MODEL));
      const budget = assertBudget(root, args.budgetUsd, 0, `${cell.id}/fim`);
      checkpoint(root, plan, { status: "running", cellsCompleted: index + 1, lastCompletedCell: cell.id, spentUsd: budget.totalUsd, calls: budget.calls });
    }
    const budget = assertBudget(root, args.budgetUsd, 0, "fim-holdout");
    checkpoint(root, plan, { status: "complete", cellsCompleted: plan.cells.length, spentUsd: budget.totalUsd, calls: budget.calls, completedAt: new Date().toISOString() });
    console.log(`\n✓ holdout completo: ${plan.design.rawRuns} pares; ledger global US$ ${budget.totalUsd.toFixed(4)} / ${args.budgetUsd.toFixed(2)}`);
  } catch (error) {
    try { const budget = reconcileBudget(root); checkpoint(root, plan, { status: "failed", error: String(error.message || error).slice(0, 500), spentUsd: budget.totalUsd, calls: budget.calls }); } catch { /* preserva erro */ }
    throw error;
  } finally {
    release();
  }
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const plan = buildHoldoutPlan();
  if (!args.execute) {
    printPlan(plan, args.out);
    if (args.manifest) {
      const target = path.resolve(REPO, args.manifest);
      writeAtomic(target, planText(plan));
      console.log(`manifesto gravado: ${target}`);
    }
    return;
  }
  await execute(args, plan);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`\nERRO: ${error.message || error}`); process.exitCode = 1; });
}
