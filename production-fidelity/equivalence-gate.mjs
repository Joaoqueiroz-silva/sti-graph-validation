/**
 * Gates offline para o braço de fidelidade à produção.
 *
 * Este módulo não importa cliente LLM, não lê credenciais e não acessa a rede/VPS.
 * Ele valida um estado congelado e compara uma observação produzida por um runner
 * com um manifesto previamente congelado. Resultado mockado nunca é promovido a
 * evidência de equivalência com produção, mesmo quando todos os gates de plumbing passam.
 */

import crypto from "node:crypto";

export const PRODUCTION_STATE_SCHEMA_VERSION = "educaoff-agent3-state-v1";
export const EQUIVALENCE_MANIFEST_VERSION = "educaoff-agent3-equivalence-v1";

export const PRODUCTION_SOURCE_FILES = Object.freeze({
  agents3Students: "/app/agents/nodes/agents3-students.js",
  pipelineCore: "/app/agents/pipeline-core.js",
  graphForge: "/app/agents/graphforge.js",
  misconceptions: "/app/data/misconceptions.json",
});

export const REQUIRED_AGENT_KEYS = Object.freeze(["agent3a", "agent3b", "agent3c"]);

const ROOT_KEYS = new Set([
  "schemaVersion",
  "discipline",
  "topic",
  "difficulty",
  "ageGroup",
  "knowledgeComponents",
  "seedProblems",
  "interfaceSpec",
  "masterGraphContext",
  "sessionId",
]);
const KC_KEYS = new Set([
  "id",
  "name",
  "description",
  "difficulty",
  "prerequisites",
  "masteryThreshold",
]);
const SEED_KEYS = new Set([
  "id",
  "strategy",
  "statement",
  "expectedAnswer",
  "kcsInvolved",
  "solutionSteps",
  "difficulty",
  "context",
]);
const STEP_KEYS = new Set(["step", "action", "result", "kc"]);
const DIFFICULTIES = new Set(["easy", "medium", "hard"]);
const PROFILES = new Set(["pre_literate", "early_reader", "reader", "advanced"]);
const STRATEGIES = new Set([
  "polya",
  "exemplo_trabalhado",
  "problema_invertido",
  "descoberta_guiada",
]);

// Campos que identificam o adaptador experimental ou vazamento do padrão-ouro.
const FORBIDDEN_KEYS = new Set([
  "instrucoes",
  "interface",
  "components",
  "interfaceConfig",
  "affordance",
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

const HASH_RE = /^[a-f0-9]{64}$/;
const IMAGE_DIGEST_RE = /^sha256:[a-f0-9]{64}$/;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function push(errors, path, message) {
  errors.push({ path, message });
}

function rejectUnknownKeys(object, allowed, path, errors) {
  if (!isPlainObject(object)) return;
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) push(errors, `${path}.${key}`, "campo não pertence ao contrato congelado");
  }
}

function scanForbidden(value, path, errors) {
  if (Array.isArray(value)) {
    value.forEach((item, i) => scanForbidden(item, `${path}[${i}]`, errors));
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) {
      push(errors, `${path}.${key}`, "campo experimental ou de referência proibido no braço B");
    }
    scanForbidden(child, `${path}.${key}`, errors);
  }
}

/** Serialização canônica: ordena chaves de objetos recursivamente e preserva arrays. */
export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  return crypto.createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}

export function sha256Json(value) {
  return sha256(stableStringify(value));
}

export function fingerprintPrompt(systemPrompt, userPrompt) {
  const system = String(systemPrompt ?? "");
  const user = String(userPrompt ?? "");
  return {
    systemSha256: sha256(system),
    userSha256: sha256(user),
    combinedSha256: sha256(`${system}\n\u0000\n${user}`),
  };
}

/**
 * Validador deliberadamente estrito, sem dependência externa. O arquivo JSON Schema
 * é o contrato publicável; esta função é o gate executável usado pelo runner.
 */
export function validateProductionState(state) {
  const errors = [];
  if (!isPlainObject(state)) {
    return { valid: false, errors: [{ path: "$", message: "estado deve ser um objeto JSON" }] };
  }

  rejectUnknownKeys(state, ROOT_KEYS, "$", errors);
  scanForbidden(state, "$", errors);

  if (state.schemaVersion !== PRODUCTION_STATE_SCHEMA_VERSION) {
    push(errors, "$.schemaVersion", `deve ser ${PRODUCTION_STATE_SCHEMA_VERSION}`);
  }
  for (const key of ["discipline", "topic", "sessionId"]) {
    if (!nonEmptyString(state[key])) push(errors, `$.${key}`, "deve ser string não vazia");
  }
  if (!DIFFICULTIES.has(state.difficulty)) {
    push(errors, "$.difficulty", "deve ser easy, medium ou hard");
  }
  if (!(nonEmptyString(state.ageGroup) || (Number.isInteger(state.ageGroup) && state.ageGroup > 0))) {
    push(errors, "$.ageGroup", "deve ser string não vazia ou inteiro positivo");
  }

  const kcIds = new Set();
  if (!Array.isArray(state.knowledgeComponents) || state.knowledgeComponents.length === 0) {
    push(errors, "$.knowledgeComponents", "deve conter ao menos um KC");
  } else {
    state.knowledgeComponents.forEach((kc, i) => {
      const p = `$.knowledgeComponents[${i}]`;
      if (!isPlainObject(kc)) {
        push(errors, p, "KC deve ser objeto");
        return;
      }
      rejectUnknownKeys(kc, KC_KEYS, p, errors);
      if (!nonEmptyString(kc.id)) push(errors, `${p}.id`, "deve ser string não vazia");
      else if (kcIds.has(kc.id)) push(errors, `${p}.id`, "id de KC duplicado");
      else kcIds.add(kc.id);
      if (!nonEmptyString(kc.name)) push(errors, `${p}.name`, "deve ser string não vazia");
      if (kc.description != null && typeof kc.description !== "string") {
        push(errors, `${p}.description`, "deve ser string");
      }
      if (kc.difficulty != null && !DIFFICULTIES.has(kc.difficulty)) {
        push(errors, `${p}.difficulty`, "dificuldade inválida");
      }
      if (kc.prerequisites != null) {
        if (!Array.isArray(kc.prerequisites) || kc.prerequisites.some((x) => !nonEmptyString(x))) {
          push(errors, `${p}.prerequisites`, "deve ser lista de ids não vazios");
        } else if (new Set(kc.prerequisites).size !== kc.prerequisites.length) {
          push(errors, `${p}.prerequisites`, "não deve conter duplicatas");
        }
      }
      if (
        kc.masteryThreshold != null &&
        !(typeof kc.masteryThreshold === "number" && kc.masteryThreshold >= 0 && kc.masteryThreshold <= 1)
      ) {
        push(errors, `${p}.masteryThreshold`, "deve estar entre 0 e 1");
      }
    });
  }

  const seedIds = new Set();
  const coveredKcs = new Set();
  if (!Array.isArray(state.seedProblems) || state.seedProblems.length !== 4) {
    push(errors, "$.seedProblems", "deve conter exatamente quatro problemas-semente");
  } else {
    state.seedProblems.forEach((seed, i) => {
      const p = `$.seedProblems[${i}]`;
      if (!isPlainObject(seed)) {
        push(errors, p, "problema-semente deve ser objeto");
        return;
      }
      rejectUnknownKeys(seed, SEED_KEYS, p, errors);
      const idOk = (Number.isInteger(seed.id) && seed.id > 0) || nonEmptyString(seed.id);
      if (!idOk) push(errors, `${p}.id`, "deve ser inteiro positivo ou string não vazia");
      else if (seedIds.has(String(seed.id))) push(errors, `${p}.id`, "id de seed duplicado");
      else seedIds.add(String(seed.id));
      if (!STRATEGIES.has(seed.strategy)) push(errors, `${p}.strategy`, "estratégia inválida");
      for (const key of ["statement", "expectedAnswer", "context"]) {
        if (!nonEmptyString(seed[key])) push(errors, `${p}.${key}`, "deve ser string não vazia");
      }
      if (!DIFFICULTIES.has(seed.difficulty)) push(errors, `${p}.difficulty`, "dificuldade inválida");

      if (!Array.isArray(seed.kcsInvolved) || seed.kcsInvolved.length === 0) {
        push(errors, `${p}.kcsInvolved`, "deve conter ao menos um KC");
      } else {
        const unique = new Set();
        seed.kcsInvolved.forEach((id, j) => {
          if (!nonEmptyString(id)) push(errors, `${p}.kcsInvolved[${j}]`, "id deve ser não vazio");
          else if (!kcIds.has(id)) push(errors, `${p}.kcsInvolved[${j}]`, "KC não existe no estado");
          else coveredKcs.add(id);
          if (unique.has(id)) push(errors, `${p}.kcsInvolved[${j}]`, "KC duplicado no seed");
          unique.add(id);
        });
      }

      if (!Array.isArray(seed.solutionSteps) || seed.solutionSteps.length === 0) {
        push(errors, `${p}.solutionSteps`, "deve conter ao menos um passo");
      } else {
        const stepNumbers = new Set();
        seed.solutionSteps.forEach((step, j) => {
          const sp = `${p}.solutionSteps[${j}]`;
          if (!isPlainObject(step)) {
            push(errors, sp, "passo deve ser objeto");
            return;
          }
          rejectUnknownKeys(step, STEP_KEYS, sp, errors);
          if (!Number.isInteger(step.step) || step.step < 1) push(errors, `${sp}.step`, "deve ser inteiro positivo");
          else if (stepNumbers.has(step.step)) push(errors, `${sp}.step`, "número de passo duplicado");
          else stepNumbers.add(step.step);
          if (!nonEmptyString(step.action)) push(errors, `${sp}.action`, "deve ser string não vazia");
          if (step.result === undefined || step.result === null) push(errors, `${sp}.result`, "é obrigatório");
          if (!nonEmptyString(step.kc)) push(errors, `${sp}.kc`, "deve ser string não vazia");
          else if (!kcIds.has(step.kc)) push(errors, `${sp}.kc`, "KC não existe no estado");
          else coveredKcs.add(step.kc);
        });
      }
    });
  }

  for (const kcId of kcIds) {
    if (!coveredKcs.has(kcId)) push(errors, "$.seedProblems", `KC ${kcId} não é coberto por nenhum seed/passo`);
  }

  if (!isPlainObject(state.interfaceSpec) || !PROFILES.has(state.interfaceSpec.profile)) {
    push(errors, "$.interfaceSpec.profile", "perfil GraphForge inválido ou ausente");
  }
  if (!isPlainObject(state.masterGraphContext)) {
    push(errors, "$.masterGraphContext", "deve ser objeto, mesmo quando vazio");
  }

  return { valid: errors.length === 0, errors };
}

export function assertProductionState(state) {
  const result = validateProductionState(state);
  if (!result.valid) {
    const summary = result.errors.map((e) => `${e.path}: ${e.message}`).join("; ");
    const error = new Error(`Estado de produção inválido: ${summary}`);
    error.name = "ProductionStateValidationError";
    error.errors = result.errors;
    throw error;
  }
  return state;
}

/** Remove apenas metadado do artefato; não inventa nem transforma entrada pedagógica. */
export function projectAgentState(state) {
  assertProductionState(state);
  const { schemaVersion: _schemaVersion, ...agentState } = state;
  return JSON.parse(JSON.stringify(agentState));
}

function gate(id, passed, expected, observed, message) {
  return { id, passed: passed === true, expected, observed, message: passed ? null : message };
}

function same(a, b) {
  return stableStringify(a) === stableStringify(b);
}

function validSourceManifest(record) {
  if (!isPlainObject(record)) return false;
  return Object.entries(PRODUCTION_SOURCE_FILES).every(([key, requiredPath]) => {
    const item = record[key];
    return isPlainObject(item) && item.path === requiredPath && HASH_RE.test(item.sha256 || "");
  });
}

function validPromptHashes(record) {
  return REQUIRED_AGENT_KEYS.every((key) => {
    const item = record?.[key];
    return (
      isPlainObject(item) &&
      HASH_RE.test(item.systemSha256 || "") &&
      HASH_RE.test(item.userSha256 || "") &&
      HASH_RE.test(item.combinedSha256 || "")
    );
  });
}

function validAgentConfigs(record) {
  return REQUIRED_AGENT_KEYS.every((key) => {
    const cfg = record?.[key];
    return (
      isPlainObject(cfg) &&
      nonEmptyString(cfg.provider) &&
      nonEmptyString(cfg.model) &&
      typeof cfg.temperature === "number" &&
      Number.isInteger(cfg.maxTokens) &&
      cfg.maxTokens > 0
    );
  });
}

/**
 * Compara observação e manifesto congelado. `mode: "real"` deve ser atribuído apenas
 * por um runner externo que tenha usado a imagem fixada; este pacote não contém tal runner.
 */
export function evaluateEquivalence({ state, expected, observed, mode = "mock" }) {
  const stateValidation = validateProductionState(state);
  const gates = [
    gate("state-schema", stateValidation.valid, "valid", stateValidation, "estado fora do contrato"),
  ];

  const expectedHeaderOk = expected?.schemaVersion === EQUIVALENCE_MANIFEST_VERSION;
  gates.push(
    gate(
      "manifest-version",
      expectedHeaderOk,
      EQUIVALENCE_MANIFEST_VERSION,
      expected?.schemaVersion ?? null,
      "manifesto esperado ausente ou incompatível"
    )
  );

  const expectedStateHash = expected?.stateSha256;
  const observedStateHash = sha256Json(state);
  gates.push(
    gate(
      "state-hash",
      HASH_RE.test(expectedStateHash || "") && expectedStateHash === observedStateHash,
      expectedStateHash ?? null,
      observedStateHash,
      "fixture difere daquela congelada no manifesto"
    )
  );

  gates.push(
    gate(
      "image-digest",
      IMAGE_DIGEST_RE.test(expected?.imageDigest || "") && expected.imageDigest === observed?.imageDigest,
      expected?.imageDigest ?? null,
      observed?.imageDigest ?? null,
      "imagem não é a imagem congelada"
    )
  );

  const expectedSourcesOk = validSourceManifest(expected?.files);
  const observedSourcesOk = validSourceManifest(observed?.files);
  gates.push(
    gate(
      "source-files",
      expectedSourcesOk && observedSourcesOk && same(expected.files, observed.files),
      expected?.files ?? null,
      observed?.files ?? null,
      "path ou hash de fonte/catálogo divergente"
    )
  );

  const configShapeOk = validAgentConfigs(expected?.agentConfigs) && validAgentConfigs(observed?.agentConfigs);
  gates.push(
    gate(
      "agent-configs",
      configShapeOk && same(expected.agentConfigs, observed.agentConfigs),
      expected?.agentConfigs ?? null,
      observed?.agentConfigs ?? null,
      "configuração efetiva de agente divergente"
    )
  );

  gates.push(
    gate(
      "runtime-env",
      isPlainObject(expected?.runtimeEnv) && same(expected.runtimeEnv, observed?.runtimeEnv),
      expected?.runtimeEnv ?? null,
      observed?.runtimeEnv ?? null,
      "flags de execução divergentes"
    )
  );

  const promptShapeOk = validPromptHashes(expected?.promptHashes) && validPromptHashes(observed?.promptHashes);
  gates.push(
    gate(
      "prompt-hashes",
      promptShapeOk && same(expected.promptHashes, observed.promptHashes),
      expected?.promptHashes ?? null,
      observed?.promptHashes ?? null,
      "prompts efetivos divergentes"
    )
  );

  gates.push(
    gate(
      "graphforge-config",
      HASH_RE.test(expected?.graphForgeConfigSha256 || "") &&
        expected.graphForgeConfigSha256 === observed?.graphForgeConfigSha256,
      expected?.graphForgeConfigSha256 ?? null,
      observed?.graphForgeConfigSha256 ?? null,
      "config entregue ao GraphForge divergiu"
    )
  );

  const runHashes = observed?.graphForgeRunHashes;
  const deterministic =
    Array.isArray(runHashes) &&
    runHashes.length >= 2 &&
    runHashes.every((h) => HASH_RE.test(h)) &&
    new Set(runHashes).size === 1;
  gates.push(
    gate(
      "graphforge-determinism",
      deterministic,
      "dois ou mais hashes idênticos",
      runHashes ?? null,
      "GraphForge não foi repetido ou produziu resultados diferentes"
    )
  );

  gates.push(
    gate(
      "agent3c-policy",
      expected?.agent3cPolicy === "production-conditional" &&
        observed?.agent3cPolicy === expected.agent3cPolicy,
      expected?.agent3cPolicy ?? null,
      observed?.agent3cPolicy ?? null,
      "política de execução do agente 3c divergente"
    )
  );

  const passed = gates.every((g) => g.passed);
  // `mode` é parâmetro do chamador, portanto não basta sozinho. Evidência real
  // também precisa vir marcada pelo adaptador real e de manifesto não-mockado.
  const realEvidenceAttested =
    mode === "real" && observed?.mode === "real" && expected?.mockOnly === false;
  const productionEquivalent = passed && realEvidenceAttested;
  return {
    schemaVersion: "educaoff-equivalence-gate-report-v1",
    mode,
    passed,
    productionEquivalent,
    productionClaimAllowed: productionEquivalent,
    notice:
      productionEquivalent
        ? null
        : mode === "mock" || observed?.mode === "mock" || expected?.mockOnly !== false
          ? "Preflight mockado valida somente contrato e plumbing; não constitui evidência de equivalência com produção."
          : "Os gates não foram integralmente satisfeitos; alegação de equivalência com produção bloqueada.",
    gates,
  };
}
