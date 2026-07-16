#!/usr/bin/env node

/**
 * Runner real da Campanha 4 para ser montado em /app dentro da imagem congelada.
 *
 * Requisitos de execução:
 * - três fixtures em /pilot/input;
 * - diretório gravável /pilot/out;
 * - guardião montado em /app/c4-real-run-safety.mjs;
 * - credencial fornecida apenas em memória;
 * - retries internos e fallback de rede bloqueados pelo invólucro deste runner.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const RUNNER_VERSION = "educaoff-campaign4-real-runner-v2";
export const PREFLIGHT_VERSION = "educaoff-campaign4-offline-preflight-v2";
const INPUT_DIR = process.env.C4_INPUT_DIR || "/pilot/input";
const OUTPUT_DIR = process.env.C4_OUTPUT_DIR || "/pilot/out";
const OUTPUT_PATH = path.join(OUTPUT_DIR, "campaign4-real-pilot.json");
const PREFLIGHT_OUTPUT_PATH = path.join(OUTPUT_DIR, "campaign4-real-pilot-preflight.json");
export const EXPECTED_IMAGE =
  "sha256:15b29e8063099d40fc62899da2795db6e97d3e252e486315428a0690bb9abf5b";
export const EXPECTED_FIXTURE_MANIFEST_SHA256 =
  "f839ddff6963da0da48c2644562c32362faad74c4b29dee7ccf7256c02ac6e5b";
const INPUT_TOKEN_CEILING = 20_000;
const GOOGLE_INPUT_USD_PER_MILLION = 1.5;
const GOOGLE_OUTPUT_USD_PER_MILLION = 9;

export const EXPECTED_FILES = Object.freeze({
  agents3Students: {
    path: "/app/agents/nodes/agents3-students.js",
    sha256: "6cbea4691a9ce8100ef6f3bf50a1f02528f5950d265b98d694901a886440a966",
  },
  pipelineCore: {
    path: "/app/agents/pipeline-core.js",
    sha256: "4138d854488bc198b617c1cd37606602979159000f09df2af18b213c74484db9",
  },
  graphForge: {
    path: "/app/agents/graphforge.js",
    sha256: "dbe769fdf0066dd3bb76370f99d1fe1c24b84c8277eef72d4376e2454a196f51",
  },
  misconceptions: {
    path: "/app/data/misconceptions.json",
    sha256: "910f08b9b54a54574e56eb0b6e4baa346f4927995a427a587759b4ff2fa5f2c2",
  },
  misconceptionsLoader: {
    path: "/app/agents/misconceptions-db.js",
    sha256: "fac923adfbe24014cf5e939c10eecc130c35620596d82135c6e343e1a81f25f1",
  },
});

export const EXPECTED_CONFIGS = Object.freeze({
  agent3a: {
    registryKey: "agent3a_advanced",
    model: "google/gemini-3.5-flash",
    provider: "openrouter",
    temperature: 0.2,
    maxTokens: 16_000,
  },
  agent3b: {
    registryKey: "agent3b_atrisk",
    model: "google/gemini-3.5-flash",
    provider: "openrouter",
    temperature: 0.7,
    maxTokens: 24_000,
  },
  agent3c: {
    registryKey: "agent3c_average",
    model: "google/gemini-3.5-flash",
    provider: "openrouter",
    temperature: 0.4,
    maxTokens: 16_000,
  },
});

const FORBIDDEN_KEYS = new Set([
  "instrucoes",
  "components",
  "interfaceConfig",
  "llmMeta",
  "correctAnswer",
  "answerKey",
  "screenshotPath",
  "images",
  "expert",
  "expertGraph",
  "referenceGraph",
  "brd",
  "gold",
]);
const CREDENTIAL_ENV_KEYS = Object.freeze([
  "OPENROUTER_API_KEY_GOOGLE",
  "OPENROUTER_API_KEY",
  "OPENROUTER_API_KEY_DEEPSEEK",
  "OPENAI_API_KEY",
]);

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sha256File(filePath) {
  return sha256(fs.readFileSync(filePath));
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256Json(value) {
  return sha256(Buffer.from(stableStringify(value), "utf8"));
}

function durableJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  const fd = fs.openSync(temp, "wx", 0o600);
  try {
    fs.writeSync(fd, `${JSON.stringify(value, null, 2)}\n`, null, "utf8");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(temp, filePath);
  try {
    const dirFd = fs.openSync(path.dirname(filePath), "r");
    try {
      fs.fsyncSync(dirFd);
    } finally {
      fs.closeSync(dirFd);
    }
  } catch {
    // Alguns sistemas de arquivos não permitem fsync no diretório. O arquivo já foi fsyncado.
  }
}

function flattenContent(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === "string" ? part : typeof part?.text === "string" ? part.text : JSON.stringify(part)
      )
      .join("\n");
  }
  return content == null ? "" : JSON.stringify(content);
}

function messageType(message) {
  try {
    return message?._getType?.() || message?.getType?.() || message?.constructor?.name || "unknown";
  } catch {
    return "unknown";
  }
}

export function extractMessages(input) {
  const messages = Array.isArray(input) ? input : input?.messages || [];
  const normalized = messages.map((message) => ({
    type: messageType(message),
    content: flattenContent(message?.content),
  }));
  const system = normalized
    .filter((item) => /system/i.test(item.type))
    .map((item) => item.content)
    .join("\n\n");
  const user = normalized
    .filter((item) => /human|user/i.test(item.type))
    .map((item) => item.content)
    .join("\n\n");
  if (!normalized.length || !system || !user) {
    throw new Error("Envelope de prompt sem mensagens system/user capturáveis");
  }
  return {
    normalized,
    system,
    user,
    messagesSha256: sha256Json(normalized),
    systemSha256: sha256(Buffer.from(system, "utf8")),
    userSha256: sha256(Buffer.from(user, "utf8")),
  };
}

function runtimeClientConfig(client) {
  const retryLayers = {
    topLevel: client?.maxRetries ?? null,
    caller: client?.caller?.maxRetries ?? null,
    clientConfig: client?.clientConfig?.maxRetries ?? null,
    configuration: client?.configuration?.maxRetries ?? null,
    sdkClient: client?.client?.maxRetries ?? null,
  };
  const declaredRetries = Object.values(retryLayers).filter((value) => value != null);
  return {
    model: client?.model ?? client?.modelName ?? null,
    temperature: client?.temperature ?? null,
    maxTokens: client?.maxTokens ?? client?.maxOutputTokens ?? null,
    maxRetries: declaredRetries.length ? Math.max(...declaredRetries.map(Number)) : null,
    retryLayers,
  };
}

/**
 * O pipeline congelado usa `Number(env) || 2`, portanto LLM_MAX_RETRIES=0 sozinho
 * NÃO funciona. Esta função sobrescreve todas as camadas conhecidas do LangChain/
 * OpenAI SDK antes de `originalInvoke`, e falha fechada se alguma permanecer > 0.
 */
export function forceAndAttestSingleAttempt(client) {
  const before = runtimeClientConfig(client).retryLayers;
  const targets = [
    [client, "maxRetries"],
    [client?.caller, "maxRetries"],
    [client?.clientConfig, "maxRetries"],
    [client?.configuration, "maxRetries"],
    [client?.client, "maxRetries"],
  ];
  let touched = 0;
  for (const [target, key] of targets) {
    if (!target || (typeof target !== "object" && typeof target !== "function")) continue;
    try {
      target[key] = 0;
      if (target[key] === 0) touched += 1;
    } catch {
      // A atestação abaixo falha se uma camada imutável continuar permitindo retries.
    }
  }
  const afterConfig = runtimeClientConfig(client);
  const declaredAfter = Object.values(afterConfig.retryLayers).filter((value) => value != null);
  const callerLayerObserved = afterConfig.retryLayers.caller != null;
  const sdkLayerObserved = ["clientConfig", "configuration", "sdkClient"].some(
    (key) => afterConfig.retryLayers[key] != null
  );
  if (
    !touched ||
    !callerLayerObserved ||
    !sdkLayerObserved ||
    !declaredAfter.length ||
    declaredAfter.some((value) => Number(value) !== 0)
  ) {
    throw new Error(`C4_RETRY_POLICY_NOT_ENFORCEABLE: ${JSON.stringify(afterConfig.retryLayers)}`);
  }
  return { before, after: afterConfig.retryLayers, forcedLayers: touched };
}

function assertRuntimeClientConfig(client, expected, { requireRetriesZero = true } = {}) {
  const observed = runtimeClientConfig(client);
  for (const field of ["model", "temperature", "maxTokens"]) {
    if (observed[field] !== expected[field]) {
      throw new Error(`Cliente LLM divergente ${field}: ${observed[field]} != ${expected[field]}`);
    }
  }
  if (requireRetriesZero && observed.maxRetries !== 0) {
    throw new Error(`Cliente LLM deve ter maxRetries=0; observado ${observed.maxRetries}`);
  }
  return observed;
}

export function extractUsage(response) {
  const candidates = [
    ["AIMessage.usage_metadata", response?.usage_metadata],
    ["AIMessage.response_metadata.tokenUsage", response?.response_metadata?.tokenUsage],
    ["AIMessage.response_metadata.usage", response?.response_metadata?.usage],
    ["AIMessage.response_metadata.estimatedTokenUsage", response?.response_metadata?.estimatedTokenUsage],
  ].filter(([, usage]) => Boolean(usage));
  for (const [source, usage] of candidates) {
    const promptTokens = Number(
      usage.input_tokens ?? usage.promptTokens ?? usage.prompt_tokens ?? usage.inputTokens
    );
    const completionTokens = Number(
      usage.output_tokens ?? usage.completionTokens ?? usage.completion_tokens ?? usage.outputTokens
    );
    if (Number.isInteger(promptTokens) && promptTokens >= 0 && Number.isInteger(completionTokens) && completionTokens >= 0) {
      const providerCostRaw =
        usage.cost ??
        usage.costUsd ??
        usage.cost_usd ??
        response?.response_metadata?.usage?.cost ??
        response?.response_metadata?.tokenUsage?.cost ??
        response?.response_metadata?.cost;
      const providerCost = Number(providerCostRaw);
      return {
        promptTokens,
        completionTokens,
        estimated: false,
        providerCostUsd: Number.isFinite(providerCost) && providerCost >= 0 ? providerCost : null,
        source,
      };
    }
  }
  return null;
}

export function costFromUsage(usage) {
  return (
    (usage.promptTokens / 1_000_000) * GOOGLE_INPUT_USD_PER_MILLION +
    (usage.completionTokens / 1_000_000) * GOOGLE_OUTPUT_USD_PER_MILLION
  );
}

function scanForbidden(value, currentPath = "$") {
  const errors = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => errors.push(...scanForbidden(item, `${currentPath}[${index}]`)));
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key)) errors.push(`${currentPath}.${key}`);
      errors.push(...scanForbidden(child, `${currentPath}.${key}`));
    }
  }
  return errors;
}

export function validateState(state) {
  const errors = [];
  if (state?.schemaVersion !== "educaoff-agent3-state-v1") errors.push("schemaVersion");
  if (!Array.isArray(state?.seedProblems) || state.seedProblems.length !== 4) errors.push("seedProblems");
  if (!Array.isArray(state?.knowledgeComponents) || state.knowledgeComponents.length === 0) {
    errors.push("knowledgeComponents");
  }
  errors.push(...scanForbidden(state));
  if (errors.length) throw new Error(`Estado inválido/proibido: ${errors.join(", ")}`);
}

function projectAgentState(state) {
  const { schemaVersion: _schemaVersion, ...agentState } = state;
  return JSON.parse(JSON.stringify(agentState));
}

function countMisconceptions(atRiskTrace) {
  return (atRiskTrace?.solutions || []).reduce(
    (sum, solution) =>
      sum +
      (solution.attempts || []).reduce(
        (attemptSum, attempt) =>
          attemptSum +
          (attempt.solutionTrace || []).filter((trace) => trace.error?.misconceptionId).length,
        0
      ),
    0
  );
}

function summarizeOutput(agentKey, output) {
  if (agentKey === "agent3a") {
    return { solutions: output?.advancedTrace?.solutions?.length || 0 };
  }
  if (agentKey === "agent3b") {
    return {
      solutions: output?.atRiskTrace?.solutions?.length || 0,
      misconceptions: countMisconceptions(output?.atRiskTrace),
    };
  }
  return { solutions: output?.averageTrace?.solutions?.length || 0 };
}

function publicKeyData(data) {
  const record = data?.data || data || {};
  const allowed = [
    "usage",
    "usage_daily",
    "usage_weekly",
    "usage_monthly",
    "limit",
    "limit_remaining",
    "is_free_tier",
  ];
  return Object.fromEntries(
    allowed
      .filter((key) => Object.prototype.hasOwnProperty.call(record, key))
      .map((key) => [key, record[key]])
  );
}

async function keySnapshots() {
  const candidates = [
    ["google", process.env.OPENROUTER_API_KEY_GOOGLE],
    ["default", process.env.OPENROUTER_API_KEY],
    ["deepseek", process.env.OPENROUTER_API_KEY_DEEPSEEK],
  ];
  const unique = new Map();
  for (const [label, key] of candidates) if (key && !unique.has(key)) unique.set(key, label);
  const snapshots = [];
  for (const [key, label] of unique.entries()) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/key", {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(15_000),
      });
      const body = await response.json().catch(() => ({}));
      snapshots.push({ label, ok: response.ok, status: response.status, ...publicKeyData(body) });
    } catch (error) {
      snapshots.push({ label, ok: false, error: error.message });
    }
  }
  return snapshots;
}

/**
 * Gate sanitizado da credencial dos geradores. Nunca devolve, persiste, compara
 * ou inclui o valor/hash da chave; usa somente qual variável foi fornecida e o
 * snapshot público retornado por /api/v1/key.
 */
export function assertKeyReady({ snapshots, env = process.env, requiredWorstCaseUsd } = {}) {
  if (!Array.isArray(snapshots)) throw new Error("Snapshots de chave são obrigatórios");
  if (!(Number.isFinite(requiredWorstCaseUsd) && requiredWorstCaseUsd > 0)) {
    throw new Error("Pior caso financeiro positivo do callPlan é obrigatório");
  }
  const hasGoogle = typeof env.OPENROUTER_API_KEY_GOOGLE === "string" && env.OPENROUTER_API_KEY_GOOGLE.length > 0;
  const hasDefault = typeof env.OPENROUTER_API_KEY === "string" && env.OPENROUTER_API_KEY.length > 0;
  const credentialLabel = hasGoogle ? "google" : hasDefault ? "default" : null;
  if (!credentialLabel) {
    throw new Error("Nenhuma credencial OpenRouter aplicável aos Agents3 foi fornecida");
  }
  const snapshot = snapshots.find((item) => item?.label === credentialLabel);
  if (!snapshot) throw new Error(`Snapshot da credencial ${credentialLabel} não foi obtido`);
  const httpStatusOk =
    snapshot.ok === true &&
    (snapshot.status == null || (Number.isInteger(snapshot.status) && snapshot.status >= 200 && snapshot.status < 300));
  if (!httpStatusOk) {
    throw new Error(
      `Credencial ${credentialLabel} não aprovada por /api/v1/key (HTTP ${snapshot.status ?? "indisponível"})`
    );
  }

  const remainingReported = Object.prototype.hasOwnProperty.call(snapshot, "limit_remaining");
  const rawRemaining = snapshot.limit_remaining;
  let limitRemainingUsd = null;
  let limitCoverage = "not-reported";
  if (remainingReported && rawRemaining != null) {
    const numericType =
      typeof rawRemaining === "number" ||
      (typeof rawRemaining === "string" && rawRemaining.trim().length > 0);
    const parsed = numericType ? Number(rawRemaining) : Number.NaN;
    if (!(Number.isFinite(parsed) && parsed >= 0)) {
      throw new Error(`limit_remaining inválido para a credencial ${credentialLabel}`);
    }
    limitRemainingUsd = parsed;
    if (parsed + 1e-10 < requiredWorstCaseUsd) {
      throw new Error(
        `Saldo técnico insuficiente na credencial ${credentialLabel}: disponível US$ ${parsed.toFixed(8)}, necessário US$ ${requiredWorstCaseUsd.toFixed(8)}`
      );
    }
    limitCoverage = "sufficient";
  }

  return {
    schemaVersion: "educaoff-campaign4-key-readiness-v1",
    status: "ready",
    credentialLabel,
    httpOk: true,
    httpStatus: snapshot.status ?? null,
    requiredWorstCaseUsd,
    limitRemainingReported: remainingReported,
    limitRemainingUsd,
    limitCoverage,
    note:
      limitCoverage === "not-reported"
        ? "A API não informou limite restante numérico; nenhum saldo foi presumido."
        : "O limite restante informado cobre o pior caso congelado do callPlan.",
  };
}

export function sourceEvidence(expectedFiles = EXPECTED_FILES) {
  return Object.fromEntries(
    Object.entries(expectedFiles).map(([key, expected]) => {
      if (!expected || typeof expected.path !== "string" || !/^[a-f0-9]{64}$/.test(expected.sha256 || "")) {
        throw new Error(`Especificação de hash inválida: ${key}`);
      }
      const stat = fs.lstatSync(expected.path);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        throw new Error(`Fonte deve ser arquivo regular, não symlink: ${key}`);
      }
      const observed = sha256File(expected.path);
      if (observed !== expected.sha256) throw new Error(`Hash de produção divergente: ${key}`);
      return [key, { ...expected, observedSha256: observed, passed: true }];
    })
  );
}

export function assertNoRuntimeOverrides(env = process.env) {
  const keys = Object.keys(env).filter((key) =>
    /^STI_AGENT3[ABC]_(ADVANCED|ATRISK|AVERAGE)_(PROVIDER|MODEL|TEMPERATURE|MAX_TOKENS)$/.test(key)
  );
  if (keys.length) throw new Error(`Overrides de Agents3 proibidos: ${keys.join(",")}`);
  const ablationKeys = ["STI_ABLATE_MISCDB", "STI_MISC_LIMIT"].filter(
    (key) => env[key] != null && env[key] !== ""
  );
  if (ablationKeys.length) throw new Error(`Ablations de Agents3 proibidas: ${ablationKeys.join(",")}`);
  if (env.STI_SKIP_AGENT3C === "1") throw new Error("STI_SKIP_AGENT3C=1 é incompatível");
  if (String(env.LLM_MAX_RETRIES ?? "") !== "0") {
    throw new Error("LLM_MAX_RETRIES=0 é obrigatório para bloquear requests automáticos não planejados");
  }
  if (String(env.STI_DISABLE_GENERATION_CACHE ?? "") !== "1") {
    throw new Error("STI_DISABLE_GENERATION_CACHE=1 é obrigatório para impedir reutilização de geração");
  }
}

function assertSafeFixtureFilename(filename) {
  if (
    typeof filename !== "string" ||
    filename.length === 0 ||
    path.basename(filename) !== filename ||
    !/^ctat-production-state-batch-[0-9]{2}\.json$/.test(filename)
  ) {
    throw new Error(`Nome de fixture inseguro/inválido: ${String(filename)}`);
  }
}

function assertContainedRegularFile(baseDir, filename) {
  assertSafeFixtureFilename(filename);
  const baseReal = fs.realpathSync(baseDir);
  const filePath = path.join(baseDir, filename);
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`Fixture deve ser arquivo regular, não symlink: ${filename}`);
  }
  const fileReal = fs.realpathSync(filePath);
  if (!fileReal.startsWith(`${baseReal}${path.sep}`)) {
    throw new Error(`Fixture escapa do mount de entrada: ${filename}`);
  }
  return filePath;
}

export function assertMountContract({ inputDir = INPUT_DIR, outputDir = OUTPUT_DIR } = {}) {
  const inputStat = fs.statSync(inputDir);
  const outputStat = fs.statSync(outputDir);
  if (!inputStat.isDirectory()) throw new Error("C4_INPUT_DIR deve ser um diretório montado");
  if (!outputStat.isDirectory()) throw new Error("C4_OUTPUT_DIR deve ser um diretório montado");
  fs.accessSync(inputDir, fs.constants.R_OK | fs.constants.X_OK);
  fs.accessSync(outputDir, fs.constants.R_OK | fs.constants.W_OK | fs.constants.X_OK);

  const inputReal = fs.realpathSync(inputDir);
  const outputReal = fs.realpathSync(outputDir);
  if (inputReal === outputReal || outputReal.startsWith(`${inputReal}${path.sep}`)) {
    throw new Error("C4_OUTPUT_DIR não pode coincidir com/estar dentro do mount de entrada");
  }
  try {
    fs.accessSync(inputDir, fs.constants.W_OK);
    throw new Error("C4_INPUT_DIR deve estar montado somente para leitura");
  } catch (error) {
    if (/somente para leitura/.test(error.message)) throw error;
    if (!["EACCES", "EPERM", "EROFS"].includes(error.code)) throw error;
  }

  const probe = path.join(outputDir, `.c4-preflight-${process.pid}-${crypto.randomBytes(6).toString("hex")}.tmp`);
  const fd = fs.openSync(probe, "wx", 0o600);
  try {
    fs.writeSync(fd, "offline-preflight\n", null, "utf8");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
    fs.unlinkSync(probe);
  }
  return {
    input: { path: inputDir, realPath: inputReal, readable: true, writable: false },
    output: { path: outputDir, realPath: outputReal, readable: true, writable: true, durableProbe: true },
  };
}

export function loadAndValidateFixtures({
  inputDir = INPUT_DIR,
  requestedFiles,
  expectedManifestSha256 = EXPECTED_FIXTURE_MANIFEST_SHA256,
} = {}) {
  const manifestPath = path.join(inputDir, "manifest.json");
  const manifestStat = fs.lstatSync(manifestPath);
  if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) {
    throw new Error("manifest.json deve ser arquivo regular, não symlink");
  }
  const manifestHash = sha256File(manifestPath);
  if (manifestHash !== expectedManifestSha256) {
    throw new Error(`Hash do manifesto de fixtures divergente: ${manifestHash}`);
  }
  const fixtureManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (fixtureManifest.schemaVersion !== "educaoff-agent3-fixture-manifest-v1") {
    throw new Error("schemaVersion do manifesto de fixtures divergente");
  }
  if (!Array.isArray(fixtureManifest.fixtures) || fixtureManifest.fixtures.length !== 6) {
    throw new Error("Manifesto deve congelar exatamente seis fixtures");
  }
  if (
    fixtureManifest.batching?.batchSize !== 4 ||
    fixtureManifest.batching?.batchCount !== 6 ||
    fixtureManifest.batching?.exerciseCount !== 24
  ) {
    throw new Error("Plano de batching do manifesto divergente de 6 × 4 = 24");
  }
  const manifestFilenames = new Set();
  const allExerciseIds = new Set();
  for (const declared of fixtureManifest.fixtures) {
    assertSafeFixtureFilename(declared.filename);
    if (manifestFilenames.has(declared.filename)) throw new Error(`Fixture duplicada: ${declared.filename}`);
    manifestFilenames.add(declared.filename);
    if (!Array.isArray(declared.exerciseIds) || declared.exerciseIds.length !== 4) {
      throw new Error(`Fixture ${declared.filename} deve declarar quatro exerciseIds`);
    }
    for (const exerciseId of declared.exerciseIds) {
      if (typeof exerciseId !== "string" || !exerciseId) throw new Error("exerciseId inválido no manifesto");
      if (allExerciseIds.has(exerciseId)) throw new Error(`exerciseId duplicado no manifesto: ${exerciseId}`);
      allExerciseIds.add(exerciseId);
    }
  }
  if (allExerciseIds.size !== 24) throw new Error("Manifesto não contém 24 exerciseIds únicos");

  if (!Array.isArray(requestedFiles) || requestedFiles.length !== 3 || new Set(requestedFiles).size !== 3) {
    throw new Error("C4_STATE_FILES deve conter exatamente três fixtures únicas");
  }
  const fixtures = requestedFiles.map((filename) => {
    assertSafeFixtureFilename(filename);
    const declared = fixtureManifest.fixtures.find((item) => item.filename === filename);
    if (!declared) throw new Error(`Fixture fora do manifesto: ${filename}`);
    const fixturePath = assertContainedRegularFile(inputDir, filename);
    if (sha256File(fixturePath) !== declared.fileSha256) throw new Error(`Hash de arquivo divergente: ${filename}`);
    const state = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
    validateState(state);
    if (sha256Json(state) !== declared.stateSha256) throw new Error(`Hash canônico divergente: ${filename}`);
    const observedExerciseIds = state.seedProblems.map((seed) => seed?.id);
    if (stableStringify(observedExerciseIds) !== stableStringify(declared.exerciseIds)) {
      throw new Error(`exerciseIds da fixture divergem do manifesto: ${filename}`);
    }
    if (typeof state.sessionId !== "string" || !state.sessionId) {
      throw new Error(`sessionId ausente: ${filename}`);
    }
    return { declared, state, agentState: projectAgentState(state) };
  });
  const sessionIds = fixtures.map((fixture) => fixture.state.sessionId);
  if (new Set(sessionIds).size !== sessionIds.length) throw new Error("sessionIds duplicados no piloto");
  return { fixtureManifest, manifestHash, fixtures };
}

export function validateEffectiveConfigs(registry, expectedConfigs = EXPECTED_CONFIGS) {
  if (typeof registry?.getAgentConfig !== "function") {
    throw new Error("Módulo de registry não exporta getAgentConfig");
  }
  return Object.fromEntries(
    Object.entries(expectedConfigs).map(([agentKey, expected]) => {
      const observed = registry.getAgentConfig(expected.registryKey);
      for (const field of ["provider", "model", "temperature", "maxTokens"]) {
        if (observed?.[field] !== expected[field]) {
          throw new Error(`Config divergente ${agentKey}.${field}: ${observed?.[field]} != ${expected[field]}`);
        }
      }
      return [agentKey, { ...observed, passed: true }];
    })
  );
}

function syntheticAgentResponse(agentKey, state) {
  const problemIds = (state.seedProblems || []).map((seed, index) => seed?.id ?? index + 1);
  if (agentKey === "agent3a") {
    return {
      studentProfile: "advanced",
      solutions: problemIds.map((problemId) => ({ problemId, solutionTrace: [], finalAnswer: "{C}", totalTime: 0 })),
    };
  }
  if (agentKey === "agent3b") {
    return {
      studentProfile: "at_risk",
      solutions: problemIds.map((problemId) => ({ problemId, attempts: [] })),
    };
  }
  return {
    studentProfile: "average",
    solutions: problemIds.map((problemId) => ({
      problemId,
      solutionTrace: [],
      finalAnswer: "{C}",
      totalTime: 0,
      alternativeRoutes: [],
    })),
  };
}

/**
 * Percorre as funções REAIS dos Agents3 com ChatOpenAI.invoke substituído por um
 * retorno JSON sintético. A construção dos prompts, o request-context e a ordem
 * 3a+3b → 3c são reais; somente o transporte é substituído antes de qualquer rede.
 */
export async function captureProductionPromptManifest({
  fixtures,
  expectedConfigs = EXPECTED_CONFIGS,
  dependencies = null,
} = {}) {
  if (!Array.isArray(fixtures) || fixtures.length !== 3) {
    throw new Error("Captura de prompts exige exatamente três fixtures validadas");
  }
  const loaded = dependencies || (await (async () => {
    const [{ ChatOpenAI }, agents, requestContext, languageConfig] = await Promise.all([
      import("@langchain/openai"),
      import(pathToFileURL("/app/agents/nodes/agents3-students.js").href),
      import(pathToFileURL("/app/agents/config/request-context.js").href),
      import(pathToFileURL("/app/agents/language-config.js").href),
    ]);
    return { ChatOpenAI, agents, requestContext, languageConfig };
  })());
  const { ChatOpenAI, agents, requestContext, languageConfig } = loaded;
  if (typeof ChatOpenAI?.prototype?.invoke !== "function") throw new Error("ChatOpenAI.invoke indisponível");
  for (const exportName of ["agent3a_advancedStudent", "agent3b_atRiskStudent", "agent3c_averageStudent"]) {
    if (typeof agents?.[exportName] !== "function") throw new Error(`Export real ausente: ${exportName}`);
  }
  if (typeof requestContext?.runWithRequestContext !== "function") {
    throw new Error("runWithRequestContext indisponível");
  }
  if (typeof languageConfig?.resolveOutputLanguage !== "function") {
    throw new Error("resolveOutputLanguage indisponível");
  }

  const invocationContext = new AsyncLocalStorage();
  const captured = new Map();
  const originalInvoke = ChatOpenAI.prototype.invoke;
  // Alguns construtores validam apenas a presença de uma chave antes de `invoke`.
  // A sentinela não é credencial e nunca pode sair do processo: o transporte já
  // está substituído. Apenas variáveis originalmente ausentes são tocadas/removidas.
  const placeholderKeys = CREDENTIAL_ENV_KEYS.filter(
    (key) => !Object.prototype.hasOwnProperty.call(process.env, key)
  );
  for (const key of placeholderKeys) process.env[key] = "C4_OFFLINE_NO_CREDENTIAL_TRANSPORT_BLOCKED";
  ChatOpenAI.prototype.invoke = async function offlinePromptCapture(input) {
    const context = invocationContext.getStore();
    if (!context) throw new Error("C4_OFFLINE_PROMPT_INVOKE_OUTSIDE_CONTEXT");
    context.invokeCount += 1;
    if (context.invokeCount > 1) throw new Error("C4_OFFLINE_FALLBACK_OR_EXTRA_INVOKE_BLOCKED");
    const prompts = extractMessages(input);
    const expected = expectedConfigs[context.agentKey];
    const retryAttestation = forceAndAttestSingleAttempt(this);
    const clientConfig = assertRuntimeClientConfig(this, expected, { requireRetriesZero: true });
    const key = `${context.stateId}::${context.agentKey}`;
    if (captured.has(key)) throw new Error(`Prompt duplicado no pré-flight: ${key}`);
    captured.set(key, {
      stateId: context.stateId,
      filename: context.filename,
      stateSha256: context.stateSha256,
      agentKey: context.agentKey,
      registryKey: expected.registryKey,
      executionPhase: context.agentKey === "agent3c" ? "after-3a-3b" : "parallel-3a-3b",
      outputLanguageCode: context.outputLanguageCode,
      clientConfig,
      retryAttestation,
      messages: prompts.normalized,
      systemPrompt: prompts.system,
      userPrompt: prompts.user,
      messagesSha256: prompts.messagesSha256,
      systemSha256: prompts.systemSha256,
      userSha256: prompts.userSha256,
    });
    return { content: JSON.stringify(syntheticAgentResponse(context.agentKey, context.state)) };
  };

  const runAgent = (fixture, agentKey, fn, outputLanguageCode) => {
    const context = {
      stateId: fixture.state.sessionId,
      filename: fixture.declared.filename,
      stateSha256: fixture.declared.stateSha256,
      agentKey,
      outputLanguageCode,
      state: fixture.agentState,
      invokeCount: 0,
    };
    return invocationContext.run(context, async () => {
      await fn(fixture.agentState);
      if (context.invokeCount !== 1) {
        throw new Error(`${agentKey} deve emitir exatamente um invoke no pré-flight`);
      }
    });
  };

  try {
    for (const fixture of fixtures) {
      const language = languageConfig.resolveOutputLanguage(
        fixture.state.topic,
        fixture.state.seedProblems.map((seed) => seed.statement).join(" "),
        "pt-BR"
      );
      await requestContext.runWithRequestContext(
        {
          tier: "balanced",
          customOverrides: {},
          outputLanguageDirective: language.directive,
          outputLanguageCode: language.code,
          disableImages: true,
        },
        async () => {
          await Promise.all([
            runAgent(fixture, "agent3a", agents.agent3a_advancedStudent, language.code),
            runAgent(fixture, "agent3b", agents.agent3b_atRiskStudent, language.code),
          ]);
          await runAgent(fixture, "agent3c", agents.agent3c_averageStudent, language.code);
        }
      );
    }
  } finally {
    ChatOpenAI.prototype.invoke = originalInvoke;
    for (const key of placeholderKeys) delete process.env[key];
  }

  const entries = fixtures.flatMap((fixture) =>
    ["agent3a", "agent3b", "agent3c"].map((agentKey) => {
      const entry = captured.get(`${fixture.state.sessionId}::${agentKey}`);
      if (!entry) throw new Error(`Prompt não capturado: ${fixture.state.sessionId}/${agentKey}`);
      return entry;
    })
  );
  if (entries.length !== fixtures.length * 3) throw new Error("Contagem de prompts do pré-flight divergente");
  return {
    schemaVersion: "educaoff-campaign4-prompt-manifest-v1",
    transport: "ChatOpenAI.invoke substituído antes da execução dos agentes",
    invocationCount: entries.length,
    executionOrder: "estados sequenciais; agent3a+agent3b em Promise.all; agent3c após ambos",
    entries,
    entriesSha256: sha256Json(entries),
  };
}

export function verifyDurablePromptManifest({
  manifestPath,
  currentPromptManifest,
  expectedFileSha256 = null,
} = {}) {
  if (typeof manifestPath !== "string" || !manifestPath) throw new Error("C4_PROMPT_MANIFEST é obrigatório");
  const stat = fs.lstatSync(manifestPath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error("Manifesto de prompts deve ser arquivo regular, não symlink");
  }
  const fileSha256 = sha256File(manifestPath);
  if (expectedFileSha256 && fileSha256 !== expectedFileSha256) {
    throw new Error("Hash externo do manifesto de prompts divergente");
  }
  const artifact = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (
    artifact.schemaVersion !== PREFLIGHT_VERSION ||
    artifact.mode !== "offline-preflight" ||
    artifact.status !== "passed"
  ) {
    throw new Error("Artefato de pré-flight de prompts inválido/não aprovado");
  }
  const durable = artifact.promptManifest;
  if (!durable || durable.schemaVersion !== "educaoff-campaign4-prompt-manifest-v1") {
    throw new Error("Manifesto durável não contém identidade de prompts válida");
  }
  if (durable.entriesSha256 !== sha256Json(durable.entries)) {
    throw new Error("Hash interno do manifesto durável de prompts divergente");
  }
  if (durable.entriesSha256 !== currentPromptManifest.entriesSha256) {
    throw new Error("Identidade de prompt divergiu entre pré-flight durável e caminho atual");
  }
  return { artifact, promptManifest: durable, fileSha256 };
}

function requestedFixtureFiles(env = process.env) {
  return String(env.C4_STATE_FILES || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

async function collectOfflinePreflight({
  env = process.env,
  inputDir = INPUT_DIR,
  outputDir = OUTPUT_DIR,
  expectedImage = EXPECTED_IMAGE,
  expectedFiles = EXPECTED_FILES,
  expectedConfigs = EXPECTED_CONFIGS,
  expectedManifestSha256 = EXPECTED_FIXTURE_MANIFEST_SHA256,
  registryPath = "/app/agents/config/agent-registry.js",
  registryModule = null,
  promptDependencies = null,
  requestedFiles = requestedFixtureFiles(env),
} = {}) {
  const startedAt = new Date().toISOString();
  const credentialEnvKeysPresent = CREDENTIAL_ENV_KEYS.filter((key) =>
    Object.prototype.hasOwnProperty.call(env, key)
  );
  if (env.C4_PREFLIGHT_ONLY === "1" && credentialEnvKeysPresent.length) {
    throw new Error(
      `C4_PREFLIGHT_ONLY deve iniciar sem credenciais: remova ${credentialEnvKeysPresent.join(",")}`
    );
  }
  assertNoRuntimeOverrides(env);
  if (env.C4_EXPECTED_IMAGE !== expectedImage) throw new Error("Digest de imagem não atestado");
  const mounts = assertMountContract({ inputDir, outputDir });
  const sourceFiles = sourceEvidence(expectedFiles);
  const { fixtureManifest, manifestHash, fixtures } = loadAndValidateFixtures({
    inputDir,
    requestedFiles,
    expectedManifestSha256,
  });
  const registry = registryModule || (await import(pathToFileURL(registryPath).href));
  const effectiveConfigs = validateEffectiveConfigs(registry, expectedConfigs);
  const promptManifest = await captureProductionPromptManifest({
    fixtures,
    expectedConfigs,
    dependencies: promptDependencies,
  });
  const completedAt = new Date().toISOString();
  return {
    artifact: {
      schemaVersion: PREFLIGHT_VERSION,
      mode: "offline-preflight",
      status: "passed",
      startedAt,
      completedAt,
      guarantees: {
        credentialRequired: false,
        credentialRead: false,
        credentialEnvKeysPresentAtStart: credentialEnvKeysPresent,
        networkAttempted: false,
        llmClientImported: true,
        llmTransportReplacedBeforeAgentExecution: true,
        mockedInvokeCount: promptManifest.invocationCount,
        realLlmInvocationCount: 0,
        paidCallCount: 0,
      },
      environment: {
        expectedImageDigest: expectedImage,
        hostAttestedImageDigest: env.C4_EXPECTED_IMAGE,
        attestationLimitation: "O digest é atestado pelo comando hospedeiro; o processo no contêiner não observa seu próprio image ID.",
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        llmMaxRetries: env.LLM_MAX_RETRIES,
        generationCacheDisabled: env.STI_DISABLE_GENERATION_CACHE,
        sourceFiles,
        effectiveConfigs,
        mounts,
      },
      fixtures: {
        manifestSha256: manifestHash,
        manifestSchemaVersion: fixtureManifest.schemaVersion,
        requestedFiles: fixtures.map((fixture) => fixture.declared.filename),
        stateIds: fixtures.map((fixture) => fixture.state.sessionId),
        stateSha256: fixtures.map((fixture) => fixture.declared.stateSha256),
      },
      promptManifest,
    },
    fixtures,
    fixtureManifest,
    sourceFiles,
    effectiveConfigs,
    registry,
    promptManifest,
  };
}

export async function runOfflinePreflight(options = {}) {
  const result = await collectOfflinePreflight(options);
  const outputPath = options.outputPath || path.join(options.outputDir || OUTPUT_DIR, "campaign4-real-pilot-preflight.json");
  durableJson(outputPath, result.artifact);
  return { ...result, outputPath };
}

function computeKeyUsageDelta(before, after) {
  const byLabel = new Map(before.map((item) => [item.label, item]));
  return after.map((item) => {
    const prior = byLabel.get(item.label) || {};
    const currentUsage = Number(item.usage);
    const priorUsage = Number(prior.usage);
    return {
      label: item.label,
      usageDeltaUsd:
        Number.isFinite(currentUsage) && Number.isFinite(priorUsage)
          ? Number((currentUsage - priorUsage).toFixed(8))
          : null,
      note: "Delta da chave pode incluir tráfego concorrente externo ao piloto.",
    };
  });
}

async function main() {
  if (process.env.C4_PREFLIGHT_ONLY === "1") {
    const result = await runOfflinePreflight({ outputPath: PREFLIGHT_OUTPUT_PATH });
    process.stdout.write(
      `${JSON.stringify({
        mode: result.artifact.mode,
        status: result.artifact.status,
        states: result.fixtures.length,
        paidCalls: 0,
        output: result.outputPath,
      })}\n`
    );
    return;
  }

  const startedAt = new Date().toISOString();
  // Todos os gates offline precedem credenciais, cliente LLM e qualquer acesso de rede.
  const preflight = await collectOfflinePreflight();
  const { fixtures, sourceFiles, effectiveConfigs } = preflight;
  const durablePromptEvidence = verifyDurablePromptManifest({
    manifestPath: process.env.C4_PROMPT_MANIFEST || PREFLIGHT_OUTPUT_PATH,
    currentPromptManifest: preflight.promptManifest,
    expectedFileSha256: process.env.C4_PROMPT_MANIFEST_SHA256 || null,
  });
  const expectedPrompts = new Map(
    durablePromptEvidence.promptManifest.entries.map((entry) => [
      `${entry.stateId}::${entry.agentKey}`,
      entry,
    ])
  );
  const safetyPath = process.env.C4_SAFETY_MODULE || "/app/c4-real-run-safety.mjs";
  const {
    REAL_PILOT_CONFIRMATION,
    RealPilotSafetyGuard,
    installPilotSignalHandlers,
  } = await import(pathToFileURL(safetyPath).href);

  const stateIds = fixtures.map((fixture) => fixture.state.sessionId);
  const callPlan = fixtures.flatMap((fixture) =>
    Object.entries(EXPECTED_CONFIGS).map(([agentKey, config]) => ({
      stateId: fixture.state.sessionId,
      agentKey,
      model: config.model,
      attempt: 1,
      fallbackUsed: false,
      inputTokenCeiling: INPUT_TOKEN_CEILING,
      outputTokenCeiling: config.maxTokens,
      inputUsdPerMillion: GOOGLE_INPUT_USD_PER_MILLION,
      outputUsdPerMillion: GOOGLE_OUTPUT_USD_PER_MILLION,
    }))
  );

  const runId = process.env.C4_RUN_ID || `c4-pilot-${Date.now()}`;
  const guard = new RealPilotSafetyGuard({
    confirmation: process.env.C4_CONFIRMATION,
    budgetUsd: Number(process.env.C4_BUDGET_USD),
    stateIds,
    runId,
    runDir: path.join(OUTPUT_DIR, "safety"),
    callPlan,
    allowFallback: false,
  });
  if (process.env.C4_CONFIRMATION !== REAL_PILOT_CONFIRMATION) {
    throw new Error("Confirmação do runner não corresponde ao guardião carregado");
  }
  const removeSignalHandlers = installPilotSignalHandlers(guard, { exitProcess: true });

  const keyReadinessPath = path.join(OUTPUT_DIR, "campaign4-real-pilot-key-readiness.json");
  let keyUsageBefore = [];
  let keyReadiness = null;
  try {
    keyUsageBefore = await keySnapshots();
    keyReadiness = assertKeyReady({
      snapshots: keyUsageBefore,
      env: process.env,
      requiredWorstCaseUsd: guard.snapshot().planWorstCaseUsd,
    });
    durableJson(keyReadinessPath, {
      ...keyReadiness,
      runId,
      checkedAt: new Date().toISOString(),
      snapshots: keyUsageBefore,
    });
  } catch (error) {
    try {
      guard.interrupt("key-readiness-failed", { error: error.message });
      durableJson(keyReadinessPath, {
        schemaVersion: "educaoff-campaign4-key-readiness-v1",
        status: "blocked",
        runId,
        checkedAt: new Date().toISOString(),
        snapshots: keyUsageBefore,
        failure: { name: error.name, message: error.message },
      });
    } finally {
      removeSignalHandlers();
    }
    throw error;
  }

  const [{ ChatOpenAI }, agents, graphforgeModule, requestContext, languageConfig] = await Promise.all([
    import("@langchain/openai"),
    import(pathToFileURL("/app/agents/nodes/agents3-students.js").href),
    import(pathToFileURL("/app/agents/graphforge.js").href),
    import(pathToFileURL("/app/agents/config/request-context.js").href),
    import(pathToFileURL("/app/agents/language-config.js").href),
  ]);

  const artifact = {
    schemaVersion: RUNNER_VERSION,
    mode: "real",
    runId,
    status: "running",
    startedAt,
    completedAt: null,
    authorization: {
      scope: "três estados, uma réplica, Agents3 e GraphForge, sem juízes",
      technicalBudgetUsd: Number(process.env.C4_BUDGET_USD),
      confirmationSha256: sha256(Buffer.from(process.env.C4_CONFIRMATION || "", "utf8")),
      amendment: "protocol/production-freeze-2026-07-15/AMENDMENT-PILOT-BUDGET-2026-07-15.md",
    },
    environment: {
      expectedImageDigest: EXPECTED_IMAGE,
      attestedImageDigest: process.env.C4_EXPECTED_IMAGE,
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      llmMaxRetries: process.env.LLM_MAX_RETRIES,
      generationCacheDisabled: process.env.STI_DISABLE_GENERATION_CACHE || null,
      sourceFiles,
      effectiveConfigs,
      durablePromptManifest: {
        path: process.env.C4_PROMPT_MANIFEST || PREFLIGHT_OUTPUT_PATH,
        fileSha256: durablePromptEvidence.fileSha256,
        entriesSha256: durablePromptEvidence.promptManifest.entriesSha256,
        entries: durablePromptEvidence.promptManifest.invocationCount,
      },
    },
    fixtureManifestSha256: preflight.artifact.fixtures.manifestSha256,
    keyReadiness,
    keyUsageBefore,
    keyUsageAfter: null,
    keyUsageDelta: null,
    invocations: [],
    cases: [],
    safety: guard.snapshot(),
    failure: null,
  };
  durableJson(OUTPUT_PATH, artifact);

  const invocationContext = new AsyncLocalStorage();
  const originalInvoke = ChatOpenAI.prototype.invoke;
  ChatOpenAI.prototype.invoke = async function patchedInvoke(input, options) {
    const context = invocationContext.getStore();
    if (!context) throw new Error("Invocação LLM fora do contexto auditável da Campanha 4");
    context.invokeCount += 1;
    if (context.invokeCount > 1) {
      throw new Error("C4_FALLBACK_OR_EXTRA_INVOKE_BLOCKED");
    }
    const prompts = extractMessages(input);
    const expectedPrompt = expectedPrompts.get(`${context.stateId}::${context.agentKey}`);
    if (!expectedPrompt) throw new Error("C4_PROMPT_IDENTITY_MISSING");
    if (
      prompts.messagesSha256 !== expectedPrompt.messagesSha256 ||
      prompts.systemSha256 !== expectedPrompt.systemSha256 ||
      prompts.userSha256 !== expectedPrompt.userSha256
    ) {
      throw new Error("C4_PROMPT_IDENTITY_MISMATCH");
    }
    const combinedPromptSha256 = sha256(Buffer.from(`${prompts.system}\n\u0000\n${prompts.user}`, "utf8"));
    const config = EXPECTED_CONFIGS[context.agentKey];
    const retryAttestation = forceAndAttestSingleAttempt(this);
    const clientConfig = assertRuntimeClientConfig(this, config, { requireRetriesZero: true });
    const ticket = guard.reserveCall({
      stateId: context.stateId,
      agentKey: context.agentKey,
      model: config.model,
      attempt: 1,
      fallbackUsed: false,
      promptSha256: combinedPromptSha256,
      inputTokenCeiling: INPUT_TOKEN_CEILING,
      outputTokenCeiling: config.maxTokens,
      inputUsdPerMillion: GOOGLE_INPUT_USD_PER_MILLION,
      outputUsdPerMillion: GOOGLE_OUTPUT_USD_PER_MILLION,
    });
    const invocation = {
      stateId: context.stateId,
      agentKey: context.agentKey,
      attempt: 1,
      fallbackUsed: false,
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      clientConfig,
      retryAttestation,
      messages: prompts.normalized,
      messagesSha256: prompts.messagesSha256,
      systemPrompt: prompts.system,
      userPrompt: prompts.user,
      systemSha256: prompts.systemSha256,
      userSha256: prompts.userSha256,
      combinedPromptSha256,
      startedAt: new Date().toISOString(),
      completedAt: null,
      latencyMs: null,
      usage: null,
      costUsd: null,
      costBasis: null,
      rawResponse: null,
      rawResponseSha256: null,
      status: "in_flight",
      error: null,
    };
    artifact.invocations.push(invocation);
    artifact.safety = guard.snapshot();
    durableJson(OUTPUT_PATH, artifact);
    const t0 = Date.now();
    try {
      const response = await originalInvoke.call(this, input, options);
      const usage = extractUsage(response);
      if (!usage) throw new Error("C4_MISSING_REAL_USAGE");
      const calculatedCostUsd = costFromUsage(usage);
      const costUsd = usage.providerCostUsd ?? calculatedCostUsd;
      guard.completeCall(ticket.id, {
        status: "ok",
        usage,
        costUsd,
        latencyMs: Date.now() - t0,
      });
      const rawResponse = flattenContent(response?.content);
      Object.assign(invocation, {
        completedAt: new Date().toISOString(),
        latencyMs: Date.now() - t0,
        usage,
        costUsd,
        costBasis: usage.providerCostUsd != null ? "provider_usage_cost" : "actual_tokens_x_frozen_price",
        rawResponse,
        rawResponseSha256: sha256(Buffer.from(rawResponse, "utf8")),
        status: "ok",
      });
      artifact.safety = guard.snapshot();
      durableJson(OUTPUT_PATH, artifact);
      return response;
    } catch (error) {
      invocation.completedAt = new Date().toISOString();
      invocation.latencyMs = Date.now() - t0;
      invocation.status = "error";
      invocation.error = error.message;
      try {
        guard.completeCall(ticket.id, {
          status: "error",
          usage: null,
          costUsd: null,
          latencyMs: invocation.latencyMs,
        });
      } catch (guardError) {
        invocation.guardError = guardError.message;
      }
      artifact.safety = guard.snapshot();
      durableJson(OUTPUT_PATH, artifact);
      throw error;
    }
  };

  const runAgent = (stateId, agentKey, fn, state) =>
    invocationContext.run({ stateId, agentKey, invokeCount: 0 }, () => fn(state));

  try {
    for (const fixture of fixtures) {
      const stateId = fixture.state.sessionId;
      guard.startState(stateId);
      const caseArtifact = {
        stateId,
        filename: fixture.declared.filename,
        exerciseIds: fixture.declared.exerciseIds,
        stateSha256: fixture.declared.stateSha256,
        startedAt: new Date().toISOString(),
        completedAt: null,
        outputLanguage: null,
        rawAgentOutputs: { agent3a: null, agent3b: null, agent3c: null },
        operationalPolicy: null,
        graphForge: null,
        failure: null,
      };
      artifact.cases.push(caseArtifact);
      durableJson(OUTPUT_PATH, artifact);

      const language = languageConfig.resolveOutputLanguage(
        fixture.state.topic,
        fixture.state.seedProblems.map((seed) => seed.statement).join(" "),
        "pt-BR"
      );
      caseArtifact.outputLanguage = { code: language.code, name: language.name, directive: language.directive };

      await requestContext.runWithRequestContext(
        {
          tier: "balanced",
          customOverrides: {},
          outputLanguageDirective: language.directive,
          outputLanguageCode: language.code,
          disableImages: true,
        },
        async () => {
          const [advanced, atRisk] = await Promise.all([
            runAgent(stateId, "agent3a", agents.agent3a_advancedStudent, fixture.agentState),
            runAgent(stateId, "agent3b", agents.agent3b_atRiskStudent, fixture.agentState),
          ]);
          caseArtifact.rawAgentOutputs.agent3a = advanced;
          caseArtifact.rawAgentOutputs.agent3b = atRisk;
          durableJson(OUTPUT_PATH, artifact);

          const advOk = Boolean(advanced?.advancedTrace?.solutions?.length);
          const riskMiscCount = countMisconceptions(atRisk?.atRiskTrace);
          const operationalSkip3c = !advOk || riskMiscCount >= 3;
          caseArtifact.operationalPolicy = {
            advOk,
            riskMiscCount,
            skip3c: operationalSkip3c,
            reason: !advOk ? "agent3a-empty" : operationalSkip3c ? "risk-misc-sufficient" : "agent3c-required",
            capacityArmForced: true,
          };

          const average = await runAgent(
            stateId,
            "agent3c",
            agents.agent3c_averageStudent,
            fixture.agentState
          );
          caseArtifact.rawAgentOutputs.agent3c = average;
          durableJson(OUTPUT_PATH, artifact);

          const operationalAverage = operationalSkip3c
            ? { studentProfile: "average", solutions: [] }
            : average.averageTrace;
          const commonState = {
            ...fixture.agentState,
            advancedTrace: advanced.advancedTrace,
            atRiskTrace: atRisk.atRiskTrace,
          };
          const operationalConfig = await graphforgeModule.extractGraphForgeConfig({
            ...commonState,
            averageTrace: operationalAverage,
          });
          const capacityConfig = await graphforgeModule.extractGraphForgeConfig({
            ...commonState,
            averageTrace: average.averageTrace,
          });
          const operationalRun1 = graphforgeModule.graphForge(operationalConfig);
          const operationalRun2 = graphforgeModule.graphForge(operationalConfig);
          const capacityRun1 = graphforgeModule.graphForge(capacityConfig);
          const capacityRun2 = graphforgeModule.graphForge(capacityConfig);
          const operationalHashes = [sha256Json(operationalRun1), sha256Json(operationalRun2)];
          const capacityHashes = [sha256Json(capacityRun1), sha256Json(capacityRun2)];
          if (new Set(operationalHashes).size !== 1 || new Set(capacityHashes).size !== 1) {
            throw new Error("GraphForge não determinístico");
          }
          caseArtifact.graphForge = {
            operational: {
              config: operationalConfig,
              artifacts: operationalRun1,
              runHashes: operationalHashes,
            },
            capacity3c: {
              config: capacityConfig,
              artifacts: capacityRun1,
              runHashes: capacityHashes,
            },
          };
        }
      );

      guard.completeState(stateId);
      caseArtifact.agentSummaries = {
        agent3a: summarizeOutput("agent3a", caseArtifact.rawAgentOutputs.agent3a),
        agent3b: summarizeOutput("agent3b", caseArtifact.rawAgentOutputs.agent3b),
        agent3c: summarizeOutput("agent3c", caseArtifact.rawAgentOutputs.agent3c),
      };
      caseArtifact.completedAt = new Date().toISOString();
      artifact.safety = guard.snapshot();
      durableJson(OUTPUT_PATH, artifact);
    }

    artifact.safety = guard.completePilot();
    artifact.keyUsageAfter = await keySnapshots();
    artifact.keyUsageDelta = computeKeyUsageDelta(artifact.keyUsageBefore, artifact.keyUsageAfter);
    artifact.status = "completed";
    artifact.completedAt = new Date().toISOString();
    durableJson(OUTPUT_PATH, artifact);
  } catch (error) {
    guard.interrupt("runner-error", { error: error.message });
    artifact.safety = guard.snapshot();
    artifact.keyUsageAfter = await keySnapshots().catch(() => []);
    artifact.keyUsageDelta = computeKeyUsageDelta(artifact.keyUsageBefore, artifact.keyUsageAfter);
    artifact.status = "failed";
    artifact.completedAt = new Date().toISOString();
    artifact.failure = { name: error.name, message: error.message, stack: error.stack };
    durableJson(OUTPUT_PATH, artifact);
    throw error;
  } finally {
    ChatOpenAI.prototype.invoke = originalInvoke;
    removeSignalHandlers();
  }

  process.stdout.write(
    `${JSON.stringify({
      runId: artifact.runId,
      status: artifact.status,
      cases: artifact.cases.length,
      invocations: artifact.invocations.length,
      spentUsd: artifact.safety.spentUsd,
      output: OUTPUT_PATH,
    })}\n`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`Campaign4RealRunnerError: ${error.message}\n`);
    process.exitCode = 1;
  });
}
