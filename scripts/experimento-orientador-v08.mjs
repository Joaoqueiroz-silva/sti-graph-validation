#!/usr/bin/env node
/**
 * Orquestrador seguro do experimento prospectivo v0.8.
 *
 * Padrão: SOMENTE PLANO. Nenhum subprocesso pago é iniciado sem a combinação
 * explícita --executar --budget-usd N --out DIR. O plano estável é congelado
 * antes da primeira célula, e toda retomada compara esse arquivo byte a byte.
 *
 * Desenho fixo:
 *   5 corpora (105 problemas) × 3 modelos × 2 políticas × 10 réplicas
 *   = 6.300 grafos brutos + 6.300 materializados pareados.
 * Células: no máximo 5 problemas × 10 réplicas (50 pares) para limitar o raio
 * de falha, permitir checkpoint e checar o orçamento entre células.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, "..");

export const PROTOCOL_VERSION = "0.8";
export const REPLICAS = 10;
export const CHUNK_SIZE = 5;
export const MATERIALIZATION_MODEL = "openai/gpt-5.6-luna";

export const CORPORA = Object.freeze([
  { dataset: "frac-numberline-6.17", label: "6.17", n: 24 },
  { dataset: "equiv-fractions-6.18", label: "6.18", n: 20 },
  { dataset: "frac-estimates-6.19", label: "6.19", n: 23 },
  { dataset: "fraction-ordering-6.20", label: "6.20", n: 19 },
  { dataset: "factors-scaling-8.12", label: "8.12", n: 19 },
]);

export const POLICIES = Object.freeze(["historico-v1", "somente-enunciado-v1"]);

// Médias empíricas observadas nas três chamadas de geração por run. Para o
// modelo novo Gemini 3.5 usa-se o mesmo perfil de tokens do Flash-Lite, mas os
// preços próprios. Esses valores são estimativa de planejamento, não ledger.
export const MODELS = Object.freeze([
  {
    id: "google/gemini-3.1-flash-lite",
    slug: "gemini-3.1-flash-lite",
    price: { input: 0.25, output: 1.5 },
    tokensPerRun: { input: 7875, output: 3180 },
    callReserveUsd: 0.05,
  },
  {
    id: "qwen/qwen3-max",
    slug: "qwen3-max",
    price: { input: 0.78, output: 3.9 },
    tokensPerRun: { input: 8120, output: 8088 },
    callReserveUsd: 0.14,
  },
  {
    id: "google/gemini-3.5-flash",
    slug: "gemini-3.5-flash",
    price: { input: 1.5, output: 9.0 },
    tokensPerRun: { input: 7875, output: 3180 },
    callReserveUsd: 0.3,
  },
]);

const MATERIALIZATION_EXPECTED_USD_PER_RUN = 0.006;
const MATERIALIZATION_CALL_RESERVE_USD = 0.02;
const PROTOCOL_FILE = "docs/PROTOCOLO-REANALISE-ORIENTADOR-V0.8-2026-08-20.md";
const PROTOCOL_AMENDMENT_FILE = "docs/EMENDA-V0.8-01-ANCORAGEM-E-COLETA-2026-08-20.md";
const PLAN_SOFTWARE_FILES = Object.freeze([
  PROTOCOL_FILE,
  PROTOCOL_AMENDMENT_FILE,
  "scripts/experimento-orientador-v08.mjs",
  "scripts/reproduce-collect.mjs",
  "scripts/materializar-lote.mjs",
  "simulate-fluxo-plataforma.js",
  "materializar-registro.js",
  "input-policy.js",
  "exec-manifest.js",
  "config/modelos.json",
]);

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const round = (x, n = 6) => Number(x.toFixed(n));

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

function chunks(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function problemIds(repo, dataset) {
  const dir = path.join(repo, "datasets", dataset, "problems");
  if (!fs.existsSync(dir)) throw new Error(`preflight: corpus ausente: ${dir}`);
  return fs
    .readdirSync(dir)
    .filter((id) => fs.existsSync(path.join(dir, id, "envelope-a.json")))
    .sort();
}

function hashFiles(repo, files) {
  return Object.fromEntries(
    files.map((rel) => {
      const file = path.join(repo, rel);
      if (!fs.existsSync(file)) throw new Error(`preflight: arquivo de software ausente: ${file}`);
      return [rel, sha256(fs.readFileSync(file))];
    })
  );
}

function hashExecutionTree(repo) {
  const rels = [];
  const walk = (relDir) => {
    const abs = path.join(repo, relDir);
    for (const entry of fs.readdirSync(abs, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = path.posix.join(relDir.split(path.sep).join("/"), entry.name);
      if (entry.isDirectory()) walk(rel);
      else if (/\.(?:js|mjs|json)$/.test(entry.name)) rels.push(rel);
    }
  };
  for (const dir of ["config", "producao", "scripts"]) walk(dir);
  for (const entry of fs.readdirSync(repo, { withFileTypes: true })) {
    if (entry.isFile() && (/\.(?:js|mjs)$/.test(entry.name) || ["package.json", "package-lock.json"].includes(entry.name))) {
      rels.push(entry.name);
    }
  }
  rels.sort();
  const digest = crypto.createHash("sha256");
  for (const rel of rels) {
    digest.update(rel);
    digest.update("\0");
    digest.update(fs.readFileSync(path.join(repo, rel)));
    digest.update("\0");
  }
  return { sha256: digest.digest("hex"), files: rels.length };
}

/** Constrói o conteúdo científico do plano sem data/hora ou caminho absoluto. */
export function buildPlan({ repo = REPO } = {}) {
  const corpusPlan = CORPORA.map((corpus) => {
    const ids = problemIds(repo, corpus.dataset);
    if (ids.length !== corpus.n) {
      throw new Error(
        `preflight: ${corpus.dataset} deveria ter ${corpus.n} problemas, mas foram encontrados ${ids.length}`
      );
    }
    const envelopeHashes = Object.fromEntries(
      ids.map((id) => {
        const base = path.join(repo, "datasets", corpus.dataset, "problems", id);
        const a = path.join(base, "envelope-a.json");
        const b = path.join(base, "envelope-b.json");
        if (!fs.existsSync(b)) throw new Error(`preflight: envelope-b ausente: ${b}`);
        readJson(a);
        readJson(b);
        return [
          id,
          {
            envelopeA: sha256(fs.readFileSync(a)),
            envelopeB: sha256(fs.readFileSync(b)),
          },
        ];
      })
    );
    return { ...corpus, problemIds: ids, envelopeHashes };
  });

  const cells = [];
  let ordinal = 0;
  for (const corpus of corpusPlan) {
    const corpusChunks = chunks(corpus.problemIds, CHUNK_SIZE);
    for (const model of MODELS) {
      for (const policy of POLICIES) {
        for (const [chunkIndex, ids] of corpusChunks.entries()) {
          ordinal++;
          const cellId = `cell-${String(ordinal).padStart(3, "0")}-${corpus.label}-${model.slug}-${policy}-c${String(chunkIndex + 1).padStart(2, "0")}`;
          const relDir = path.join(
            "cells",
            corpus.dataset,
            model.slug,
            policy,
            `chunk-${String(chunkIndex + 1).padStart(2, "0")}`
          );
          const nRuns = ids.length * REPLICAS;
          // Limite de célula usa 50k tokens de entrada por chamada e os tetos
          // 16k/24k/16k dos agents 3a/3b/3c. É reserva de início de célula;
          // a trava por chamada continua ativa durante a execução.
          const maxGenerationPerRun =
            (150000 / 1e6) * model.price.input + ((16000 + 24000 + 16000) / 1e6) * model.price.output;
          const maxMaterializationPerRun =
            2 * (50000 / 1e6) * 0.1 + ((24000 + 12000) / 1e6) * 0.6;
          cells.push({
            id: cellId,
            dataset: corpus.dataset,
            corpus: corpus.label,
            model: model.id,
            modelSlug: model.slug,
            inputPolicy: policy,
            replicas: REPLICAS,
            problemIds: ids,
            nRuns,
            rawDir: path.join(relDir, "bruto"),
            materializedDir: path.join(relDir, "materializado"),
            reservesUsd: {
              generationCell: round(nRuns * maxGenerationPerRun),
              generationCall: model.callReserveUsd,
              materializationCell: round(nRuns * maxMaterializationPerRun),
              materializationCall: MATERIALIZATION_CALL_RESERVE_USD,
            },
          });
        }
      }
    }
  }

  const totalProblems = corpusPlan.reduce((s, x) => s + x.n, 0);
  const runsPerModel = totalProblems * POLICIES.length * REPLICAS;
  const generationByModel = MODELS.map((model) => {
    const expectedUsdPerRun =
      (model.tokensPerRun.input / 1e6) * model.price.input +
      (model.tokensPerRun.output / 1e6) * model.price.output;
    return {
      model: model.id,
      runs: runsPerModel,
      calls: runsPerModel * 3,
      tokensPerRun: model.tokensPerRun,
      expectedUsdPerRun: round(expectedUsdPerRun),
      expectedUsd: round(runsPerModel * expectedUsdPerRun, 2),
    };
  });
  const rawRuns = totalProblems * MODELS.length * POLICIES.length * REPLICAS;
  const generationUsd = generationByModel.reduce((s, x) => s + x.expectedUsd, 0);
  const materializationUsd = rawRuns * MATERIALIZATION_EXPECTED_USD_PER_RUN;
  const expectedTotalUsd = generationUsd + materializationUsd;
  const recommendedBudgetUsd = Math.ceil((expectedTotalUsd * 1.15) / 10) * 10;

  const core = {
    schema: "sti-experiment-plan-v08-v1",
    protocolVersion: PROTOCOL_VERSION,
    protocolFile: PROTOCOL_FILE,
    protocolAmendmentFile: PROTOCOL_AMENDMENT_FILE,
    design: {
      totalProblems,
      corpora: corpusPlan.length,
      models: MODELS.map((x) => x.id),
      inputPolicies: [...POLICIES],
      replicas: REPLICAS,
      chunkSize: CHUNK_SIZE,
      cells: cells.length,
      rawRuns,
      materializedRuns: rawRuns,
      pairedGraphArtifacts: rawRuns * 2,
      generationCalls: rawRuns * 3,
      materializationCalls: rawRuns * 2,
      logicalCalls: rawRuns * 5,
      topologia: "livre",
      temperatures: {
        agent3a_advanced: 0.2,
        agent3b_atrisk: 0.7,
        agent3c_average: 0.4,
        agent6_story: 0.5,
        agent6_worker: 0.35,
      },
      reasoning: { effort: "none", exclude: true, env: "STI_SEM_RACIOCINIO=1" },
      runtimeControls: {
        passosLivres: true,
        interfaceFixa: false,
        agent6WorkerMaxTokens: 12000,
        agent6WorkerTimeoutMs: 180000,
        misconceptionComponentBudget: 0.3,
        catalogoSemFiltro: false,
        payloadGuardDisabled: false,
      },
      stages: ["graphforge-bruto", "materializado-agent6-agent7"],
    },
    costEstimate: {
      currency: "USD",
      basis: "tokens médios observados; preços congelados no plano; materialização ~US$0.006/run",
      generationByModel,
      materialization: {
        model: MATERIALIZATION_MODEL,
        runs: rawRuns,
        calls: rawRuns * 2,
        expectedUsdPerRun: MATERIALIZATION_EXPECTED_USD_PER_RUN,
        expectedUsd: round(materializationUsd, 2),
      },
      expectedTotalUsd: round(expectedTotalUsd, 2),
      recommendedBudgetUsd,
      note: "Estimativa não é garantia de preço; o ledger usa usage real e a trava dura prevalece.",
    },
    corpora: corpusPlan,
    softwareSha256: hashFiles(repo, PLAN_SOFTWARE_FILES),
    executionTreeSha256: hashExecutionTree(repo),
    cells,
  };
  const coreText = JSON.stringify(core, null, 1) + "\n";
  return { ...core, planSha256: sha256(coreText) };
}

export function planText(plan) {
  return JSON.stringify(plan, null, 1) + "\n";
}

function parseArgs(argv) {
  const out = {
    executar: false,
    plano: true,
    out: null,
    budgetUsd: null,
    retomar: false,
    retryOrphans: false,
    manifesto: null,
    allowDirty: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--plano") out.plano = true;
    else if (arg === "--executar") { out.executar = true; out.plano = false; }
    else if (arg === "--out") out.out = argv[++i] ?? null;
    else if (arg === "--budget-usd") out.budgetUsd = Number(argv[++i]);
    else if (arg === "--retomar") out.retomar = true;
    else if (arg === "--autorizar-repetir-chamadas-orfas") out.retryOrphans = true;
    else if (arg === "--manifesto") out.manifesto = argv[++i] ?? null;
    else if (arg === "--allow-dirty") out.allowDirty = true;
    else throw new Error(`flag desconhecida: ${arg}`);
  }
  if (out.retomar && !out.executar) throw new Error("--retomar exige --executar");
  if (out.retryOrphans && !out.retomar) {
    throw new Error("--autorizar-repetir-chamadas-orfas exige --executar --retomar");
  }
  return out;
}

function printPlan(plan, { out = null } = {}) {
  console.log("EXPERIMENTO PROSPECTIVO V0.8 — SOMENTE PLANO (zero chamadas de rede)");
  console.log(`  plano sha256: ${plan.planSha256}`);
  console.log(
    `  ${plan.design.corpora} corpora · ${plan.design.totalProblems} problemas · ` +
      `${plan.design.models.length} modelos · ${plan.design.inputPolicies.length} políticas · ` +
      `${plan.design.replicas} réplicas`
  );
  console.log(
    `  ${plan.design.rawRuns} grafos brutos + ${plan.design.materializedRuns} materializados ` +
      `= ${plan.design.pairedGraphArtifacts} artefatos pareados`
  );
  console.log(`  ${plan.design.cells} células; máximo de ${CHUNK_SIZE * REPLICAS} runs por célula`);
  console.log(`  chamadas lógicas: ${plan.design.logicalCalls} (${plan.design.generationCalls} geração + ${plan.design.materializationCalls} materialização)`);
  console.log("\nCUSTO ESPERADO (usage real prevalece):");
  for (const row of plan.costEstimate.generationByModel) {
    console.log(
      `  ${row.model.padEnd(34)} ${String(row.runs).padStart(4)} runs · ` +
        `${String(row.calls).padStart(5)} chamadas · ~US$ ${row.expectedUsd.toFixed(2)}`
    );
  }
  console.log(
    `  ${MATERIALIZATION_MODEL.padEnd(34)} ${String(plan.costEstimate.materialization.runs).padStart(4)} runs · ` +
      `${String(plan.costEstimate.materialization.calls).padStart(5)} chamadas · ~US$ ${plan.costEstimate.materialization.expectedUsd.toFixed(2)}`
  );
  console.log(`  TOTAL esperado: ~US$ ${plan.costEstimate.expectedTotalUsd.toFixed(2)}`);
  console.log(`  teto recomendado (≈15% de margem, arredondado): US$ ${plan.costEstimate.recommendedBudgetUsd.toFixed(2)}`);
  console.log("\nNENHUMA CHAMADA FOI FEITA. Para execução futura, após autorização explícita:");
  const target = out || "resultados/experimento-orientador-v08";
  console.log(
    `  node -r dotenv/config scripts/experimento-orientador-v08.mjs --executar ` +
      `--budget-usd ${plan.costEstimate.recommendedBudgetUsd} --out ${target}`
  );
  console.log("Retomada idempotente:");
  console.log(
    `  node -r dotenv/config scripts/experimento-orientador-v08.mjs --executar --retomar ` +
      `--budget-usd ${plan.costEstimate.recommendedBudgetUsd} --out ${target}`
  );
}

function nearestExistingParent(target) {
  let p = path.resolve(target);
  while (!fs.existsSync(p)) {
    const parent = path.dirname(p);
    if (parent === p) break;
    p = parent;
  }
  return p;
}

function gitStatus(repo, ignoredOutput = null) {
  const r = spawnSync("git", ["status", "--porcelain"], { cwd: repo, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`preflight git falhou: ${r.stderr || r.stdout}`);
  const ignoredRel = ignoredOutput
    ? path.relative(repo, path.resolve(repo, ignoredOutput)).split(path.sep).join("/")
    : null;
  return r.stdout
    .split("\n")
    .filter(Boolean)
    .filter((line) => {
      if (!ignoredRel || ignoredRel.startsWith("../") || path.isAbsolute(ignoredRel)) return true;
      const changed = line.slice(3).replace(/^"|"$/g, "");
      return changed !== ignoredRel && !changed.startsWith(`${ignoredRel}/`);
    })
    .join("\n");
}

function executionPreflight(args, plan) {
  if (!args.out) throw new Error("--executar exige --out <diretório explícito>");
  if (!Number.isFinite(args.budgetUsd) || args.budgetUsd <= 0) {
    throw new Error("--executar exige --budget-usd <valor positivo>");
  }
  if (!process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY.length < 20) {
    throw new Error("preflight: OPENROUTER_API_KEY ausente ou inválida; nenhuma chamada foi feita");
  }
  if (Number(process.versions.node.split(".")[0]) < 20) {
    throw new Error(`preflight: Node >=20 requerido; atual ${process.version}`);
  }
  fs.accessSync(nearestExistingParent(args.out), fs.constants.W_OK);
  if (!args.allowDirty) {
    const dirty = gitStatus(REPO, args.out);
    if (dirty) {
      throw new Error(
        "preflight: worktree suja; faça commit do protocolo/código antes da coleta " +
          "(ou use --allow-dirty conscientemente, que ficará registrado no checkpoint)"
      );
    }
  }
  if (args.budgetUsd < plan.costEstimate.expectedTotalUsd) {
    console.warn(
      `AVISO: budget US$ ${args.budgetUsd.toFixed(2)} é menor que a estimativa ` +
        `US$ ${plan.costEstimate.expectedTotalUsd.toFixed(2)}; a trava pode parar antes de 6.300 pares.`
    );
  }
}

async function remoteCredentialPreflight(args, plan) {
  const headers = { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` };
  const request = async (url, authenticated = true) => {
    const response = await fetch(url, {
      headers: authenticated ? headers : {},
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      throw new Error(`preflight remoto falhou (${response.status}) em ${url}; nenhuma chamada paga foi iniciada`);
    }
    return response.json();
  };
  const [creditsPayload, modelsPayload] = await Promise.all([
    request("https://openrouter.ai/api/v1/credits", true),
    request("https://openrouter.ai/api/v1/models", false),
  ]);
  const ids = new Set((modelsPayload?.data || []).map((item) => item?.id).filter(Boolean));
  const missing = [...plan.design.models, MATERIALIZATION_MODEL].filter((id) => !ids.has(id));
  if (missing.length) {
    throw new Error(`preflight remoto: modelo(s) indisponível(is) na OpenRouter: ${missing.join(", ")}`);
  }
  const totalCredits =
    typeof creditsPayload?.data?.total_credits === "number"
      ? creditsPayload.data.total_credits
      : Number.NaN;
  const totalUsage =
    typeof creditsPayload?.data?.total_usage === "number"
      ? creditsPayload.data.total_usage
      : Number.NaN;
  const remaining = totalCredits - totalUsage;
  if (Number.isFinite(remaining) && remaining < Math.min(args.budgetUsd, plan.costEstimate.expectedTotalUsd)) {
    throw new Error(
      `preflight remoto: saldo estimado US$ ${remaining.toFixed(2)} abaixo do necessário ` +
        `US$ ${Math.min(args.budgetUsd, plan.costEstimate.expectedTotalUsd).toFixed(2)}`
    );
  }
  console.log(
    `preflight remoto: credencial aceita; 4 modelos disponíveis` +
      (Number.isFinite(remaining) ? `; saldo informado US$ ${remaining.toFixed(2)}` : "")
  );
}

function readBudget(dir) {
  const file = path.join(dir, "budget.json");
  try {
    const b = readJson(file);
    return {
      totalUsd: Number.isFinite(b.totalUsd) ? b.totalUsd : 0,
      calls: Number.isFinite(b.calls) ? b.calls : 0,
      updatedAt: b.updatedAt ?? null,
    };
  } catch {
    return { totalUsd: 0, calls: 0, updatedAt: null };
  }
}

function listFilesRecursive(root, predicate, out = []) {
  if (!fs.existsSync(root)) return out;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) listFilesRecursive(full, predicate, out);
    else if (predicate(full)) out.push(full);
  }
  return out;
}

/** Reconcilia conservadoramente: nunca reduz o ledger, apenas corrige para cima. */
export function reconcileBudget(outputRoot) {
  const budgetDir = path.join(outputRoot, "_budget");
  const manifests = listFilesRecursive(
    path.join(outputRoot, "cells"),
    (file) => file.endsWith(".jsonl") && path.basename(path.dirname(file)) === "manifests"
  ).sort();
  let manifestUsd = 0;
  let manifestCalls = 0;
  for (const file of manifests) {
    for (const line of fs.readFileSync(file, "utf8").split("\n").filter(Boolean)) {
      const call = JSON.parse(line);
      manifestCalls++;
      if (!Number.isFinite(call.costUsd)) {
        throw new Error(`budget global: custo desconhecido em ${file}; execução bloqueada`);
      }
      manifestUsd += call.costUsd;
    }
  }
  const current = readBudget(budgetDir);
  const reconciled = {
    totalUsd: Math.max(current.totalUsd, manifestUsd),
    calls: Math.max(current.calls, manifestCalls),
    updatedAt: current.updatedAt,
    reconciledManifestUsd: manifestUsd,
    reconciledManifestCalls: manifestCalls,
  };
  if (reconciled.totalUsd !== current.totalUsd || reconciled.calls !== current.calls) {
    reconciled.updatedAt = new Date().toISOString();
    writeAtomic(path.join(budgetDir, "budget.json"), JSON.stringify(reconciled, null, 2) + "\n");
  }
  return reconciled;
}

function expectedRunNames(cell) {
  return cell.problemIds.flatMap((id) =>
    Array.from({ length: cell.replicas }, (_, i) => `${id}_rep${i + 1}.json`)
  ).sort();
}

function phaseComplete(cell, outputRoot, phase) {
  const rel = phase === "raw" ? cell.rawDir : cell.materializedDir;
  const runsDir = path.join(outputRoot, rel, "runs");
  const expected = expectedRunNames(cell);
  if (!fs.existsSync(runsDir)) return false;
  const actual = fs.readdirSync(runsDir).filter((f) => f.endsWith(".json")).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) return false;
  for (const file of actual) {
    const reg = readJson(path.join(runsDir, file));
    if (reg?.politicaInput?.id !== cell.inputPolicy) return false;
    if (reg?.modelos?.porAgente?.estudantes !== cell.model) return false;
    if (phase === "materialized") {
      if (!reg?.materializado?.behaviorGraph) return false;
      if (reg?.materializado?.modelos?.materializacao !== MATERIALIZATION_MODEL) return false;
    }
  }
  return true;
}

function assertGlobalBudget(outputRoot, limitUsd, reserveUsd, label) {
  const budget = reconcileBudget(outputRoot);
  if (budget.totalUsd > limitUsd + 1e-9) {
    throw new Error(
      `TRAVA GLOBAL (${label}): gasto US$ ${budget.totalUsd.toFixed(4)} excedeu teto US$ ${limitUsd.toFixed(2)}`
    );
  }
  if (budget.totalUsd + reserveUsd > limitUsd + 1e-9) {
    throw new Error(
      `TRAVA GLOBAL (${label}): não inicia célula; gasto US$ ${budget.totalUsd.toFixed(4)} + ` +
        `reserva US$ ${reserveUsd.toFixed(4)} > teto US$ ${limitUsd.toFixed(2)}`
    );
  }
  return budget;
}

export function cleanChildEnv(overrides, hostEnv = process.env) {
  const env = { ...hostEnv };
  for (const key of [
    "PERFIL_MODELOS",
    "MODELO_DOMINIO",
    "MODELO_MATERIALIZACAO",
    "MODELO_ESTUDANTES",
    "MODELO_REVISAO",
    "MODELO_CHECAGEM",
    "GEN_MODEL",
    "AGENT3A_MODEL",
    "AGENT3B_MODEL",
    "AGENT3C_MODEL",
    "AGENT3A_TEMP",
    "AGENT3B_TEMP",
    "AGENT3C_TEMP",
    "SHIM_TEMP",
    "STI_SEM_RACIOCINIO",
    "STI_REASONING_EFFORT",
    "STI_REASONING_EXCLUDE",
    "STI_PASSOS_LIVRES",
    "STI_INTERFACE_FIXA",
    "STI_INPUT_POLICY",
    "STI_AGENT6_WORKER_MAX_TOKENS",
    "STI_AGENT6_WORKER_TIMEOUT_MS",
    "STI_CATALOGO_SEM_FILTRO",
    "STI_DISABLE_PAYLOAD_GUARD",
    "STI_IMAGE_QUALITY",
    "STI_MC_BUDGET",
    "STI_EVAL_3B_MODEL",
    "FALLBACK_MODEL",
    "STI_RUNS_DIR",
    "STI_RUN_ID",
    "STI_BUDGET_DIR",
    "STI_BUDGET_USD",
    "STI_BUDGET_RESERVE_USD",
    "STI_MANIFEST_STRICT",
    "STI_DATASET",
  ]) delete env[key];
  return { ...env, ...overrides };
}

function runPaidSubprocess(args, env) {
  const shown = [process.execPath, "-r", "dotenv/config", ...args].join(" ");
  console.log(`\n$ ${shown}`);
  const result = spawnSync(process.execPath, ["-r", "dotenv/config", ...args], {
    cwd: REPO,
    env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`subprocesso falhou com exit ${result.status}: ${shown}`);
}

function auditManifestModels(phaseRoot, expectedModel, expectedRuns, minOkPerRun) {
  const files = listFilesRecursive(
    path.join(phaseRoot, "manifests"),
    (file) => file.endsWith(".jsonl")
  ).sort();
  if (files.length !== expectedRuns) {
    throw new Error(
      `integridade de manifests: ${phaseRoot} tem ${files.length}, esperado ${expectedRuns} (um por run)`
    );
  }
  for (const file of files) {
    let okCalls = 0;
    for (const line of fs.readFileSync(file, "utf8").split("\n").filter(Boolean)) {
      const call = JSON.parse(line);
      if (call.model !== expectedModel) {
        throw new Error(`sem fallback de modelo: ${file} registrou ${call.model}; esperado ${expectedModel}`);
      }
      if (call.status === "ok") okCalls++;
    }
    if (okCalls < minOkPerRun) {
      throw new Error(
        `integridade de manifests: ${file} tem ${okCalls} chamada(s) ok, mínimo ${minOkPerRun}`
      );
    }
  }
}

function updateCheckpoint(outputRoot, plan, patch) {
  const file = path.join(outputRoot, "checkpoint.json");
  let current = {};
  try { current = readJson(file); } catch { /* novo */ }
  const next = {
    schema: "sti-experiment-checkpoint-v08-v1",
    planSha256: plan.planSha256,
    startedAt: current.startedAt || new Date().toISOString(),
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  writeAtomic(file, JSON.stringify(next, null, 1) + "\n");
}

export function acquireExecutionLock(outputRoot, { retomar }) {
  const file = path.join(outputRoot, ".execution.lock");
  const token = crypto.randomUUID();
  const payload = { pid: process.pid, host: os.hostname(), token, acquiredAt: new Date().toISOString() };
  const tryCreate = () => fs.writeFileSync(file, JSON.stringify(payload, null, 1) + "\n", { flag: "wx" });
  try {
    tryCreate();
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    let prior = null;
    try { prior = readJson(file); } catch { /* lock corrompido continua conservador */ }
    let alive = true;
    if (prior?.host === os.hostname() && Number.isInteger(prior?.pid)) {
      try { process.kill(prior.pid, 0); } catch (probe) { alive = probe.code === "EPERM"; }
    }
    if (alive || !retomar) {
      throw new Error(
        `lock de execução ativo/indeterminado em ${file}` +
          (prior?.pid ? ` (pid ${prior.pid}, host ${prior.host})` : "")
      );
    }
    fs.unlinkSync(file);
    tryCreate();
  }
  return () => {
    try {
      const current = readJson(file);
      if (current?.token === token) fs.unlinkSync(file);
    } catch {
      /* nunca remove lock alheio/corrompido */
    }
  };
}

async function execute(args, plan) {
  executionPreflight(args, plan);
  await remoteCredentialPreflight(args, plan);
  const outputRoot = path.resolve(REPO, args.out);
  const manifestFile = path.join(outputRoot, "manifesto-plano-v08.json");
  const frozen = planText(plan);
  if (fs.existsSync(outputRoot) && fs.readdirSync(outputRoot).length) {
    if (!args.retomar) throw new Error(`destino não vazio; use --retomar: ${outputRoot}`);
    if (!fs.existsSync(manifestFile) || fs.readFileSync(manifestFile, "utf8") !== frozen) {
      throw new Error("retomada recusada: manifesto congelado ausente ou diferente");
    }
  } else {
    fs.mkdirSync(outputRoot, { recursive: true });
    writeAtomic(manifestFile, frozen);
  }
  const releaseLock = acquireExecutionLock(outputRoot, { retomar: args.retomar });
  try {
    updateCheckpoint(outputRoot, plan, {
      status: "running",
      budgetUsd: args.budgetUsd,
      worktreeDirtyAuthorized: args.allowDirty,
      temperatures: plan.design.temperatures,
      reasoning: plan.design.reasoning,
      runtimeControls: plan.design.runtimeControls,
    });

    for (const [index, cell] of plan.cells.entries()) {
    const rawRoot = path.join(outputRoot, cell.rawDir);
    const matRoot = path.join(outputRoot, cell.materializedDir);
    console.log(`\n[${index + 1}/${plan.cells.length}] ${cell.id}`);

    if (!phaseComplete(cell, outputRoot, "raw")) {
      const before = assertGlobalBudget(
        outputRoot,
        args.budgetUsd,
        cell.reservesUsd.generationCell,
        `${cell.id}/antes-geração`
      );
      console.log(`budget global antes da geração: US$ ${before.totalUsd.toFixed(4)} / ${args.budgetUsd.toFixed(2)}`);
      const childEnv = cleanChildEnv({
        STI_DATASET: cell.dataset,
        STI_BUDGET_DIR: path.join(outputRoot, "_budget"),
        STI_BUDGET_USD: String(args.budgetUsd),
        STI_BUDGET_RESERVE_USD: String(cell.reservesUsd.generationCall),
        STI_MANIFEST_STRICT: "1",
        AGENT3A_TEMP: "0.2",
        AGENT3B_TEMP: "0.7",
        AGENT3C_TEMP: "0.4",
        SHIM_TEMP: "0.7",
        STI_SEM_RACIOCINIO: "1",
        STI_PASSOS_LIVRES: "1",
        STI_INTERFACE_FIXA: "0",
        STI_AGENT6_WORKER_MAX_TOKENS: "12000",
        STI_AGENT6_WORKER_TIMEOUT_MS: "180000",
        STI_CATALOGO_SEM_FILTRO: "0",
        STI_DISABLE_PAYLOAD_GUARD: "0",
        STI_MC_BUDGET: "0.3",
        FALLBACK_MODEL: cell.model,
      });
      runPaidSubprocess(
        [
          "scripts/reproduce-collect.mjs",
          "--fluxo", "plataforma",
          "--passos-livres",
          "--input-policy", cell.inputPolicy,
          "--modelo", `estudantes=${cell.model}`,
          "--problem-ids", cell.problemIds.join(","),
          "--replicas", String(cell.replicas),
          "--out", rawRoot,
          "--yes",
          "--resume",
          "--fail-fast",
          ...(args.retryOrphans ? ["--retry-orphans"] : []),
        ],
        childEnv
      );
      if (!phaseComplete(cell, outputRoot, "raw")) throw new Error(`${cell.id}: geração incompleta`);
      auditManifestModels(rawRoot, cell.model, cell.nRuns, 3);
      const after = assertGlobalBudget(outputRoot, args.budgetUsd, 0, `${cell.id}/depois-geração`);
      updateCheckpoint(outputRoot, plan, {
        lastCompletedPhase: `${cell.id}/raw`,
        cellsCompleted: index,
        spentUsd: after.totalUsd,
        calls: after.calls,
      });
    } else {
      auditManifestModels(rawRoot, cell.model, cell.nRuns, 3);
      console.log("  ↷ geração já completa e validada");
    }

    if (!phaseComplete(cell, outputRoot, "materialized")) {
      const before = assertGlobalBudget(
        outputRoot,
        args.budgetUsd,
        cell.reservesUsd.materializationCell,
        `${cell.id}/antes-materialização`
      );
      console.log(`budget global antes da materialização: US$ ${before.totalUsd.toFixed(4)} / ${args.budgetUsd.toFixed(2)}`);
      const childEnv = cleanChildEnv({
        STI_DATASET: cell.dataset,
        STI_BUDGET_DIR: path.join(outputRoot, "_budget"),
        STI_BUDGET_USD: String(args.budgetUsd),
        STI_BUDGET_RESERVE_USD: String(cell.reservesUsd.materializationCall),
        STI_MANIFEST_STRICT: "1",
        AGENT3A_TEMP: "0.2",
        AGENT3B_TEMP: "0.7",
        AGENT3C_TEMP: "0.4",
        SHIM_TEMP: "0.7",
        STI_SEM_RACIOCINIO: "1",
        STI_PASSOS_LIVRES: "1",
        STI_INTERFACE_FIXA: "0",
        STI_AGENT6_WORKER_MAX_TOKENS: "12000",
        STI_AGENT6_WORKER_TIMEOUT_MS: "180000",
        STI_CATALOGO_SEM_FILTRO: "0",
        STI_DISABLE_PAYLOAD_GUARD: "0",
        STI_MC_BUDGET: "0.3",
        FALLBACK_MODEL: MATERIALIZATION_MODEL,
      });
      runPaidSubprocess(
        [
          "scripts/materializar-lote.mjs",
          "--runs", path.join(rawRoot, "runs"),
          "--out", matRoot,
          "--input-policy", cell.inputPolicy,
          "--modelo-materializacao", MATERIALIZATION_MODEL,
          "--yes",
          "--resume",
          "--fail-fast",
          ...(args.retryOrphans ? ["--retry-orphans"] : []),
        ],
        childEnv
      );
      if (!phaseComplete(cell, outputRoot, "materialized")) {
        throw new Error(`${cell.id}: materialização incompleta`);
      }
      auditManifestModels(matRoot, MATERIALIZATION_MODEL, cell.nRuns, 2);
      const after = assertGlobalBudget(outputRoot, args.budgetUsd, 0, `${cell.id}/depois-materialização`);
      updateCheckpoint(outputRoot, plan, {
        lastCompletedPhase: `${cell.id}/materialized`,
        cellsCompleted: index + 1,
        spentUsd: after.totalUsd,
        calls: after.calls,
      });
    } else {
      auditManifestModels(matRoot, MATERIALIZATION_MODEL, cell.nRuns, 2);
      console.log("  ↷ materialização já completa e validada");
    }
    }

    const finalBudget = assertGlobalBudget(outputRoot, args.budgetUsd, 0, "fim");
    updateCheckpoint(outputRoot, plan, {
      status: "complete",
      cellsCompleted: plan.cells.length,
      spentUsd: finalBudget.totalUsd,
      calls: finalBudget.calls,
      completedAt: new Date().toISOString(),
    });
    console.log(
      `\n✓ experimento v0.8 completo: ${plan.design.rawRuns} pares; ` +
        `US$ ${finalBudget.totalUsd.toFixed(4)} em ${finalBudget.calls} chamadas registradas.`
    );
  } catch (error) {
    try {
      const budget = reconcileBudget(outputRoot);
      updateCheckpoint(outputRoot, plan, {
        status: "failed",
        error: String(error.message || error).slice(0, 500),
        spentUsd: budget.totalUsd,
        calls: budget.calls,
      });
    } catch {
      /* preserva o erro original se até o checkpoint falhar */
    }
    throw error;
  } finally {
    releaseLock();
  }
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const plan = buildPlan();
  if (!args.executar) {
    printPlan(plan, { out: args.out });
    if (args.manifesto) {
      const target = path.resolve(REPO, args.manifesto);
      writeAtomic(target, planText(plan));
      console.log(`Manifesto determinístico gravado em: ${target}`);
    }
    return;
  }
  await execute(args, plan);
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  main().catch((error) => {
    console.error(`ERRO: ${error.message}`);
    process.exitCode = 1;
  });
}
