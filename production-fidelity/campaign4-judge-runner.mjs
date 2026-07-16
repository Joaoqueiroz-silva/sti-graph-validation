#!/usr/bin/env node

/**
 * Painel cego auxiliar da Campanha 4.
 *
 * Preflight: materializa e congela as unidades, o mapa de reidentificacao, a
 * ordem por juiz, hashes de mensagens, precos e pior caso financeiro. Nao requer
 * credencial e nao faz chamada paga.
 *
 * Execute: usa somente OPENROUTER_API_KEY em memoria, uma primaria e no maximo
 * um reparo por unidade, sem fallback. Todas as tentativas entram em journal
 * fsyncado antes e depois da rede. A analise nunca imputa uma nota ausente.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const FREEZE_MANIFEST = path.join(
  REPO,
  "protocol",
  "production-freeze-2026-07-15",
  "campaign4-judge-protocol-v1-manifest.json"
);
const MODEL_ATTESTATION = path.join(
  REPO,
  "protocol",
  "production-freeze-2026-07-15",
  "judge-model-attestation-2026-07-15T144942Z.json"
);
const EXECUTION_PLAN = path.join(
  REPO,
  "protocol",
  "production-freeze-2026-07-15",
  "campaign4-full-execution-plan.json"
);
const FIXTURE_DIR = path.join(REPO, "production-fidelity", "fixtures");
const DEFAULT_OUT = path.join(
  REPO,
  "resultados",
  "campanha4-2026-07-15",
  "judge-panel-v5"
);
const ABORTED_PANEL_DIRS = ["judge-panel-v1", "judge-panel-v2", "judge-panel-v4"].map((name) =>
  path.join(REPO, "resultados", "campanha4-2026-07-15", name)
);
const TECHNICAL_AMENDMENTS = [
  "AMENDMENT-C4-JUDGES-V2-PORTABLE-SCHEMA-2026-07-15.md",
  "AMENDMENT-C4-JUDGES-V3-STABLE-GRAMMAR-2026-07-15.md",
  "AMENDMENT-C4-JUDGES-V4-QWEN-REPLACEMENT-2026-07-15.md",
  "AMENDMENT-C4-JUDGES-V5-GLM-REPLACEMENT-2026-07-15.md",
].map((name) => path.join(REPO, "protocol", "production-freeze-2026-07-15", name));
const FREEZE_SHA256 = "7637fae1e1704277989556278054d82c3c787855d6bd89beac99d185320906fd";
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const MODELS_ENDPOINT = "https://openrouter.ai/api/v1/models";
const MAX_OUTPUT_TOKENS = 2_000;
const INPUT_TOKEN_CEILING = 30_000;
const TECHNICAL_BUDGET_USD = 28;
const EXECUTION_COST_STOP_USD = 3;
const REQUEST_TIMEOUT_MS = 180_000;
const DEFAULT_CONCURRENCY = 12;

export const C4_JUDGE_MODELS = Object.freeze([
  {
    id: "z-ai/glm-5.2",
    family: "z-ai",
    promptUsdPerToken: 0.00000093,
    completionUsdPerToken: 0.000003,
    temperature: 0,
    disableReasoning: true,
  },
  {
    id: "qwen/qwen3.7-plus",
    family: "qwen",
    promptUsdPerToken: 0.00000032,
    completionUsdPerToken: 0.00000128,
    temperature: 0,
    disableReasoning: true,
  },
  {
    id: "deepseek/deepseek-v4-pro",
    family: "deepseek",
    promptUsdPerToken: 0.000000435,
    completionUsdPerToken: 0.00000087,
    temperature: 0,
    disableReasoning: true,
  },
]);

export const C4_JUDGE_ROLES = Object.freeze({
  agent3a: {
    role: "correct_trace",
    label: "traco de solucao correta",
    dimensions: [
      "correctness_coherence",
      "procedural_coverage_order",
      "kc_alignment",
      "generic_transfer",
      "actionability",
    ],
    rules:
      "Os placeholders {A}, {B} e {C} sao intencionais. Nao reduza a nota pela mera genericidade; avalie se as relacoes sao coerentes, completas e transferiveis.",
  },
  agent3b: {
    role: "misconceptions_remediation",
    label: "erros, diagnostico e remediacao",
    dimensions: [
      "error_plausibility",
      "causal_diagnosis",
      "feedback_quality",
      "remediation_actionability",
      "step_alignment",
    ],
    rules:
      "Um erro plausivel nao deve ser penalizado por nao constar em inventario de autor. Avalie plausibilidade cognitiva, diagnostico, feedback, remediacao e alinhamento ao passo.",
  },
  agent3c: {
    role: "hesitation_hints",
    label: "hesitacao e cadeias de dicas",
    dimensions: [
      "step_alignment",
      "scaffold_progression",
      "distinctness",
      "non_leakage",
      "clarity_actionability",
    ],
    rules:
      "A resposta esperada aparece somente para detectar revelacao prematura. Diferencie apoio progressivo de entrega antecipada da resposta.",
  },
});

export const C4_JUDGE_FLAGS = Object.freeze([
  "none",
  "mathematical_error",
  "missing_step",
  "kc_misalignment",
  "undefined_placeholder",
  "implausible_error",
  "answer_equals_key",
  "weak_diagnosis",
  "unsafe_feedback",
  "misaligned_step",
  "repetitive_hints",
  "premature_answer",
  "unclear",
  "insufficient_evidence",
  "language_issue",
]);

const MUTATION_POSITIONS_ONE_BASED = Object.freeze([1, 5, 9, 13, 17, 21]);
const MUTATION_DIMENSIONS = Object.freeze({
  correct_trace: ["correctness_coherence", "procedural_coverage_order"],
  misconceptions_remediation: [
    "error_plausibility",
    "causal_diagnosis",
    "remediation_actionability",
  ],
  hesitation_hints: ["scaffold_progression", "distinctness", "non_leakage"],
});

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const sha256File = (file) => sha256(fs.readFileSync(file));
const round = (value, digits = 6) =>
  Number.isFinite(value) ? Number(value.toFixed(digits)) : value ?? null;
const sum = (values) => values.reduce((acc, value) => acc + (Number(value) || 0), 0);
const mean = (values) => (values.length ? sum(values) / values.length : null);

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temp, file);
}

function appendJournal(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const fd = fs.openSync(file, "a", 0o600);
  try {
    fs.writeSync(fd, `${JSON.stringify(value)}\n`, null, "utf8");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(`Painel C4 bloqueado: ${message}`);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function agentRoot(agentKey, raw) {
  if (agentKey === "agent3a") return raw?.advancedTrace;
  if (agentKey === "agent3b") return raw?.atRiskTrace;
  return raw?.averageTrace;
}

function solutionFor(agentKey, raw, exerciseId) {
  return (agentRoot(agentKey, raw)?.solutions || []).find(
    (solution) => String(solution?.problemId) === String(exerciseId)
  );
}

function opaqueCode(identity) {
  return sha256(`${FREEZE_SHA256}|${stableStringify(identity)}`).slice(0, 20);
}

export function mutateCandidate(agentKey, candidate, expectedAnswer) {
  const mutated = clone(candidate);
  if (agentKey === "agent3a") {
    const trace = Array.isArray(mutated.solutionTrace) ? mutated.solutionTrace : [];
    if (trace.length) {
      trace[0].result = "Contradicao: {A} e ao mesmo tempo maior e menor que {B}";
      trace[0].thinking = "Assumo duas relacoes matematicas mutuamente incompatíveis.";
    }
    if (trace.length > 1) trace.pop();
    mutated.finalAnswer = "resultado contraditorio";
    return mutated;
  }
  if (agentKey === "agent3b") {
    for (const attempt of mutated.attempts || []) {
      for (const step of attempt.solutionTrace || []) {
        if (!step?.error) continue;
        step.error.wrongAnswer = String(expectedAnswer);
        delete step.error.diagnosticQuestion;
        delete step.error.howToFix;
        step.error.feedback = "Tente novamente.";
      }
      attempt.finalAnswer = String(expectedAnswer);
    }
    return mutated;
  }
  let changed = false;
  for (const step of mutated.solutionTrace || []) {
    if (changed || !Array.isArray(step.hintsNeeded) || !step.hintsNeeded.length) continue;
    const repeated = `A resposta e ${expectedAnswer}. Marque ${expectedAnswer}.`;
    step.hintsNeeded = [1, 2, 3, 4].map((level, index) => ({
      level,
      type: ["conceptual", "procedural", "specific", "bottom_out"][index],
      message: repeated,
    }));
    changed = true;
  }
  return mutated;
}

export function buildJudgeUnits() {
  assert(sha256File(FREEZE_MANIFEST) === FREEZE_SHA256, "hash do protocolo de juizes divergiu");
  const plan = readJson(EXECUTION_PLAN);
  const main = [];
  const exerciseIds = new Set();

  for (const group of plan.groups) {
    const resultPath = path.join(REPO, group.outputDir, "campaign4-real-pilot.json");
    const result = readJson(resultPath);
    for (const caseArtifact of result.cases) {
      if (!["agent3a", "agent3b", "agent3c"].every((key) => caseArtifact.rawAgentOutputs?.[key])) {
        continue;
      }
      const fixture = readJson(path.join(FIXTURE_DIR, caseArtifact.filename));
      const problems = new Map(fixture.seedProblems.map((problem) => [String(problem.id), problem]));
      for (const exerciseId of caseArtifact.exerciseIds) {
        exerciseIds.add(exerciseId);
        const problem = problems.get(exerciseId);
        assert(problem, `fixture nao contem ${exerciseId}`);
        for (const agentKey of ["agent3a", "agent3b", "agent3c"]) {
          const candidate = solutionFor(
            agentKey,
            caseArtifact.rawAgentOutputs[agentKey],
            exerciseId
          );
          assert(candidate, `saida ${agentKey}/${exerciseId}/r${group.replica} ausente`);
          const roleSpec = C4_JUDGE_ROLES[agentKey];
          const identity = {
            exerciseId,
            replica: group.replica,
            agentRole: roleSpec.role,
            variant: "main",
          };
          const context = {
            statement: problem.statement,
            expectedAnswer: problem.expectedAnswer,
            kcsInvolved: problem.kcsInvolved,
            solutionSteps: problem.solutionSteps,
          };
          main.push({
            unitCode: opaqueCode(identity),
            variant: "main",
            agentKey,
            agentRole: roleSpec.role,
            exerciseId,
            replica: group.replica,
            sourceRunId: result.runId,
            sourceStateId: caseArtifact.stateId,
            context,
            candidate,
            contentSha256: sha256(stableStringify({ context, candidate })),
          });
        }
      }
    }
  }
  main.sort(
    (a, b) =>
      a.exerciseId.localeCompare(b.exerciseId) ||
      a.replica - b.replica ||
      a.agentRole.localeCompare(b.agentRole)
  );
  assert(main.length === 204, `unidades principais observadas=${main.length}, esperado=204`);
  assert(exerciseIds.size === 24, `exercicios observados=${exerciseIds.size}, esperado=24`);

  const selectedExercises = [...exerciseIds]
    .sort()
    .filter((_id, index) => MUTATION_POSITIONS_ONE_BASED.includes(index + 1));
  const mutation = [];
  for (const exerciseId of selectedExercises) {
    for (const agentKey of ["agent3a", "agent3b", "agent3c"]) {
      const role = C4_JUDGE_ROLES[agentKey].role;
      const source = main.find(
        (unit) =>
          unit.exerciseId === exerciseId && unit.replica === 1 && unit.agentKey === agentKey
      );
      assert(source, `fonte da mutacao ausente ${exerciseId}/${agentKey}`);
      const identity = { exerciseId, replica: 1, agentRole: role, variant: "mutation" };
      const candidate = mutateCandidate(agentKey, source.candidate, source.context.expectedAnswer);
      mutation.push({
        ...source,
        unitCode: opaqueCode(identity),
        variant: "mutation",
        sourceUnitCode: source.unitCode,
        candidate,
        contentSha256: sha256(stableStringify({ context: source.context, candidate })),
      });
    }
  }
  mutation.sort(
    (a, b) => a.exerciseId.localeCompare(b.exerciseId) || a.agentRole.localeCompare(b.agentRole)
  );
  assert(mutation.length === 18, `mutacoes=${mutation.length}, esperado=18`);
  return { main, mutation, selectedExercises };
}

function responseSchema(unit) {
  const dimensions = C4_JUDGE_ROLES[unit.agentKey].dimensions;
  return {
    type: "object",
    additionalProperties: false,
    required: ["unitCode", "agentRole", "scores", "rationale", "evidence", "confidence", "flags"],
    properties: {
      // A identidade continua obrigatoria e e validada localmente. Nao a fixamos
      // no schema remoto: isso criaria uma gramatica diferente por unidade.
      unitCode: { type: "string" },
      agentRole: { type: "string", enum: [unit.agentRole] },
      scores: {
        type: "object",
        additionalProperties: false,
        required: dimensions,
        properties: Object.fromEntries(
          dimensions.map((dimension) => [
            dimension,
            { type: "integer", enum: [0, 1, 2, 3, 4] },
          ])
        ),
      },
      rationale: { type: "string" },
      evidence: {
        type: "array",
        items: { type: "string" },
      },
      confidence: { type: "number" },
      flags: {
        type: "array",
        items: { type: "string", enum: C4_JUDGE_FLAGS },
      },
    },
  };
}

export function buildJudgeMessages(unit) {
  const spec = C4_JUDGE_ROLES[unit.agentKey];
  const anchor =
    "Use cada dimensao independentemente: 0=ausente, contraditorio ou inutilizavel; 1=deficiencia grave; 2=parcial ou misto; 3=adequado com falha menor; 4=plenamente correto, especifico e utilizavel.";
  const system = [
    "Voce e um revisor independente de conteudo educacional.",
    "Avalie somente a unidade apresentada. Nao tente identificar modelo, agente, replica, lote ou experimento.",
    "Nao compare com outras saidas e nao avalie o GraphForge.",
    anchor,
    "Cada nota exige justificativa ancorada no conteudo. Responda apenas o JSON do schema.",
  ].join("\n");
  const user = [
    `CODIGO OPACO: ${unit.unitCode}`,
    `FUNCAO: ${spec.label} (${spec.role})`,
    `DIMENSOES: ${spec.dimensions.join(", ")}`,
    `REGRA ESPECIFICA: ${spec.rules}`,
    "CONTEXTO INDEPENDENTE DO EXERCICIO:",
    JSON.stringify(unit.context, null, 2),
    "SAIDA A AVALIAR:",
    JSON.stringify(unit.candidate, null, 2),
    "A rationale deve ter no maximo 80 palavras. Evidence deve conter no maximo duas passagens curtas. Use flags=['none'] quando nenhuma flag se aplicar.",
  ].join("\n\n");
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

function wordCount(text) {
  return String(text || "")
    .trim()
    .split(/\s+/u)
    .filter(Boolean).length;
}

export function validateJudgeResponse(value, unit) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("resposta nao e objeto");
  }
  const rootKeys = Object.keys(value).sort();
  const expectedRoot = [
    "agentRole",
    "confidence",
    "evidence",
    "flags",
    "rationale",
    "scores",
    "unitCode",
  ].sort();
  if (stableStringify(rootKeys) !== stableStringify(expectedRoot)) {
    throw new Error("campos raiz ausentes ou extras");
  }
  if (value.unitCode !== unit.unitCode) throw new Error("unitCode divergente");
  if (value.agentRole !== unit.agentRole) throw new Error("agentRole divergente");
  const dims = C4_JUDGE_ROLES[unit.agentKey].dimensions;
  if (
    !value.scores ||
    stableStringify(Object.keys(value.scores).sort()) !== stableStringify([...dims].sort())
  ) {
    throw new Error("dimensoes ausentes ou extras");
  }
  for (const dimension of dims) {
    const score = value.scores[dimension];
    if (!Number.isInteger(score) || score < 0 || score > 4) {
      throw new Error(`nota invalida em ${dimension}`);
    }
  }
  if (typeof value.rationale !== "string" || !value.rationale.trim() || wordCount(value.rationale) > 80) {
    throw new Error("rationale ausente ou acima de 80 palavras");
  }
  if (
    !Array.isArray(value.evidence) ||
    value.evidence.length > 2 ||
    value.evidence.some((item) => typeof item !== "string" || !item.trim())
  ) {
    throw new Error("evidence invalida");
  }
  if (!(Number.isFinite(value.confidence) && value.confidence >= 0 && value.confidence <= 1)) {
    throw new Error("confidence invalida");
  }
  if (
    !Array.isArray(value.flags) ||
    !value.flags.length ||
    new Set(value.flags).size !== value.flags.length ||
    value.flags.some((flag) => !C4_JUDGE_FLAGS.includes(flag)) ||
    (value.flags.includes("none") && value.flags.length > 1)
  ) {
    throw new Error("flags invalidas");
  }
  return value;
}

function contentFromResponse(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((item) => (typeof item === "string" ? item : item?.text || "")).join("");
  }
  throw new Error("provedor nao retornou message.content");
}

function parseJsonContent(content) {
  const text = String(content || "").trim();
  try {
    return JSON.parse(text);
  } catch {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) return JSON.parse(fenced[1]);
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error("JSON ausente na resposta");
  }
}

function orderForJudge(units, modelId, stage) {
  return units
    .slice()
    .sort((a, b) =>
      sha256(`${FREEZE_SHA256}|${modelId}|${stage}|${a.unitCode}`).localeCompare(
        sha256(`${FREEZE_SHA256}|${modelId}|${stage}|${b.unitCode}`)
      )
    );
}

async function currentModelAttestation() {
  const response = await fetch(MODELS_ENDPOINT, {
    headers: { "Cache-Control": "no-cache" },
    signal: AbortSignal.timeout(30_000),
  });
  assert(response.ok, `registro publico de modelos retornou HTTP ${response.status}`);
  const body = await response.json();
  return C4_JUDGE_MODELS.map((frozen) => {
    const rows = (body.data || []).filter((item) => item.id === frozen.id);
    assert(rows.length === 1, `modelo ${frozen.id} ausente ou duplicado no registro`);
    const row = rows[0];
    const observed = {
      id: row.id,
      family: frozen.family,
      promptUsdPerToken: Number(row.pricing?.prompt),
      completionUsdPerToken: Number(row.pricing?.completion),
      contextLength: row.context_length,
      supportedParameters: row.supported_parameters || [],
      reasoning: row.reasoning || null,
    };
    assert(
      observed.promptUsdPerToken <= frozen.promptUsdPerToken &&
        observed.completionUsdPerToken <= frozen.completionUsdPerToken,
      `preco de ${frozen.id} excedeu a trava congelada`
    );
    assert(observed.supportedParameters.includes("response_format"), `${frozen.id} sem response_format`);
    assert(observed.supportedParameters.includes("max_tokens"), `${frozen.id} sem max_tokens`);
    return observed;
  });
}

function auditAbortedPanel(panelDir) {
  const journal = path.join(panelDir, "calls.jsonl");
  if (!fs.existsSync(journal)) return null;
  const events = fs
    .readFileSync(journal, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map(JSON.parse);
  const started = events.filter((event) => event.event === "attempt_started");
  const completed = events.filter((event) => event.event === "attempt_completed");
  const completedKeys = new Set(
    completed.map((event) =>
      [event.stage, event.unitCode, event.model, event.attempt].join("|")
    )
  );
  const touched = new Set(
    started.map((event) => [event.stage, event.unitCode, event.model].join("|"))
  );
  const panelName = path.basename(panelDir);
  const reasons = {
    "judge-panel-v1": "non-portable JSON Schema keywords",
    "judge-panel-v2": "per-unit remote grammars exceeded provider compilation limits",
    "judge-panel-v4": "user-requested removal of GPT-5.4 for cost before panel completion",
  };
  return {
    status: "aborted-and-excluded-wholesale",
    reason: reasons[panelName] || "interrupted technical launch",
    journalPath: path.relative(REPO, journal),
    journalSha256: sha256File(journal),
    startedAttempts: started.length,
    completedAttempts: completed.length,
    touchedJudgeUnits: touched.size,
    validScoresObservedButExcluded: completed.filter((event) => event.valid).length,
    http400: completed.filter((event) => event.httpStatus === 400).length,
    noContent: completed.filter(
      (event) => event.error === "provedor nao retornou message.content"
    ).length,
    ambiguousInFlightAttempts: started.filter(
      (event) =>
        !completedKeys.has(
          [event.stage, event.unitCode, event.model, event.attempt].join("|")
        )
    ).length,
    reuseInAnalyticPanel: false,
  };
}

function unitPublic(unit) {
  return {
    unitCode: unit.unitCode,
    variant: unit.variant,
    agentRole: unit.agentRole,
    contentSha256: unit.contentSha256,
    sourceUnitCode: unit.sourceUnitCode || null,
  };
}

function reidentification(unit) {
  return {
    unitCode: unit.unitCode,
    variant: unit.variant,
    exerciseId: unit.exerciseId,
    replica: unit.replica,
    agentKey: unit.agentKey,
    agentRole: unit.agentRole,
    sourceRunId: unit.sourceRunId,
    sourceStateId: unit.sourceStateId,
    sourceUnitCode: unit.sourceUnitCode || null,
    contentSha256: unit.contentSha256,
  };
}

function buildPromptEntries(units, stage) {
  const entries = [];
  for (const model of C4_JUDGE_MODELS) {
    const order = orderForJudge(units, model.id, stage);
    order.forEach((unit, position) => {
      const messages = buildJudgeMessages(unit);
      const messagesSha256 = sha256(stableStringify(messages));
      entries.push({
        stage,
        model: model.id,
        family: model.family,
        position,
        unitCode: unit.unitCode,
        messagesSha256,
        inputCharacters: stableStringify(messages).length,
        responseSchemaSha256: sha256(stableStringify(responseSchema(unit))),
      });
    });
  }
  return entries;
}

export async function prepareJudgePanel({ outDir = DEFAULT_OUT } = {}) {
  assert(!fs.existsSync(path.join(outDir, "calls.jsonl")), "journal ja existe; preflight recusado");
  const { main, mutation, selectedExercises } = buildJudgeUnits();
  assert(TECHNICAL_AMENDMENTS.every((file) => fs.existsSync(file)), "emenda tecnica ausente");
  const observedModels = await currentModelAttestation();
  const promptEntries = [
    ...buildPromptEntries(main, "main"),
    ...buildPromptEntries(mutation, "mutation"),
  ];
  const schemaHashes = [...new Set(promptEntries.map((entry) => entry.responseSchemaSha256))];
  assert(schemaHashes.length === 3, `gramaticas remotas=${schemaHashes.length}, esperado=3 papeis`);
  const mainCalls = main.length * C4_JUDGE_MODELS.length;
  const mutationCalls = mutation.length * C4_JUDGE_MODELS.length;
  const primaryCalls = mainCalls + mutationCalls;
  const repairMaximum = primaryCalls;
  const maxCalls = primaryCalls + repairMaximum;
  const byModelFinance = C4_JUDGE_MODELS.map((model) => {
    const units = main.length + mutation.length;
    const maxModelCalls = units * 2;
    const worstCasePerCallUsd =
      INPUT_TOKEN_CEILING * model.promptUsdPerToken +
      MAX_OUTPUT_TOKENS * model.completionUsdPerToken;
    return {
      model: model.id,
      primaryUnits: units,
      repairMaximum: units,
      maximumCalls: maxModelCalls,
      inputTokenCeiling: INPUT_TOKEN_CEILING,
      outputTokenCeiling: MAX_OUTPUT_TOKENS,
      promptUsdPerToken: model.promptUsdPerToken,
      completionUsdPerToken: model.completionUsdPerToken,
      worstCasePerCallUsd: round(worstCasePerCallUsd, 9),
      worstCaseUsd: round(maxModelCalls * worstCasePerCallUsd, 6),
    };
  });
  const worstCaseUsd = round(sum(byModelFinance.map((item) => item.worstCaseUsd)), 6);
  assert(worstCaseUsd <= TECHNICAL_BUDGET_USD, `pior caso US$ ${worstCaseUsd} excede teto`);
  assert(promptEntries.every((entry) => entry.inputCharacters < INPUT_TOKEN_CEILING), "prompt excede teto conservador de entrada");

  const unitSnapshot = {
    schemaVersion: "educaoff-campaign4-judge-unit-snapshot-v5",
    createdAt: new Date().toISOString(),
    freezeManifestSha256: FREEZE_SHA256,
    main,
    mutation,
    selectedExercises,
  };
  const preflight = {
    schemaVersion: "educaoff-campaign4-judge-preflight-v5-glm",
    createdAt: new Date().toISOString(),
    timing:
      "after-generator-output-freeze-and-three-wholly-excluded-launches-before-first-v5-analytic-call",
    paidCalls: 0,
    protocol: {
      path: path.relative(REPO, FREEZE_MANIFEST),
      sha256: FREEZE_SHA256,
    },
    technicalAmendments: TECHNICAL_AMENDMENTS.map((file) => ({
      path: path.relative(REPO, file),
      sha256: sha256File(file),
    })),
    supersededLaunches: ABORTED_PANEL_DIRS.map(auditAbortedPanel),
    sourceArtifacts: {
      executionPlanSha256: sha256File(EXECUTION_PLAN),
      frozenModelAttestationSha256: sha256File(MODEL_ATTESTATION),
    },
    design: {
      plannedExerciseReplicaAgentUnits: 216,
      observedMainUnits: main.length,
      absentBecauseGenerationFailure: 12,
      mainJudgments: mainCalls,
      mutationUnits: mutation.length,
      mutationJudgments: mutationCalls,
      primaryCalls,
      repairMaximum,
      maximumCalls: maxCalls,
      maximumRepairsPerUnit: 1,
      fallback: false,
      requestPolicy: {
        portableJsonSchema: true,
        remoteGrammarCount: schemaHashes.length,
        unitCodeConstraint: "local-validation-only",
        providerRequireParameters: true,
        providerFallbacks: false,
        disabledReasoningModels: C4_JUDGE_MODELS.filter((model) => model.disableReasoning).map(
          (model) => model.id
        ),
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      },
    },
    observedModels,
    promptEntries,
    promptEntriesSha256: sha256(stableStringify(promptEntries)),
    unitPublicManifest: [...main, ...mutation].map(unitPublic),
    unitPublicManifestSha256: sha256(
      stableStringify([...main, ...mutation].map(unitPublic))
    ),
  };
  const finance = {
    schemaVersion: "educaoff-campaign4-judge-finance-freeze-v5",
    createdAt: new Date().toISOString(),
    timing: "before-first-paid-judge-call",
    technicalBudgetUsd: TECHNICAL_BUDGET_USD,
    executionCostStopUsd: EXECUTION_COST_STOP_USD,
    worstCaseUsd,
    primaryCalls,
    repairMaximum,
    maximumCalls: maxCalls,
    byModel: byModelFinance,
    automaticLimitIncrease: false,
  };
  fs.mkdirSync(outDir, { recursive: true, mode: 0o700 });
  writeJson(path.join(outDir, "judge-unit-snapshot.json"), unitSnapshot);
  writeJson(path.join(outDir, "judge-reidentification-map.json"), {
    schemaVersion: "educaoff-campaign4-judge-reidentification-v5",
    units: [...main, ...mutation].map(reidentification),
  });
  writeJson(path.join(outDir, "judge-preflight.json"), preflight);
  writeJson(path.join(outDir, "judge-finance-manifest.json"), finance);
  return { outDir, preflight, finance };
}

async function checkKeyReadiness(key) {
  const response = await fetch("https://openrouter.ai/api/v1/key", {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(30_000),
  });
  assert(response.ok, `credencial OpenRouter recusada (HTTP ${response.status})`);
  const data = await response.json();
  return {
    checkedAt: new Date().toISOString(),
    httpStatus: response.status,
    limit: data?.data?.limit ?? null,
    usage: data?.data?.usage ?? null,
    isFreeTier: data?.data?.is_free_tier ?? null,
  };
}

async function providerCall({ key, model, unit, messages, attempt, journalPath, stage }) {
  const repair = attempt === 2;
  const actualMessages = repair
    ? [
        ...messages,
        {
          role: "user",
          content:
            "A resposta anterior nao cumpriu o schema. Reavalie exatamente o mesmo conteudo com a mesma rubrica e devolva somente um JSON valido no schema exigido.",
        },
      ]
    : messages;
  const messagesSha256 = sha256(stableStringify(actualMessages));
  const startedAt = new Date().toISOString();
  appendJournal(journalPath, {
    event: "attempt_started",
    startedAt,
    stage,
    unitCode: unit.unitCode,
    model: model.id,
    family: model.family,
    attempt,
    repair,
    fallback: false,
    messagesSha256,
  });
  const body = {
    model: model.id,
    messages: actualMessages,
    max_tokens: MAX_OUTPUT_TOKENS,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: `campaign4_judge_${unit.agentRole}`,
        strict: true,
        schema: responseSchema(unit),
      },
    },
    provider: {
      require_parameters: true,
      allow_fallbacks: false,
    },
  };
  if (model.temperature != null) body.temperature = model.temperature;
  if (model.disableReasoning) {
    body.reasoning = { effort: "none", exclude: true };
  }
  const started = Date.now();
  let data = null;
  let content = null;
  let score = null;
  let error = null;
  let httpStatus = null;
  let usage = null;
  let costUsd = null;
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://educaoff.com",
        "X-Title": "EducaOFF Campaign 4 blind content-validity panel",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    httpStatus = response.status;
    data = await response.json().catch(async () => ({ error: { message: await response.text() } }));
    usage = {
      promptTokens: Number(data?.usage?.prompt_tokens),
      completionTokens: Number(data?.usage?.completion_tokens),
      totalTokens: Number(data?.usage?.total_tokens),
    };
    if (Number.isFinite(usage.promptTokens) && Number.isFinite(usage.completionTokens)) {
      assert(usage.promptTokens <= INPUT_TOKEN_CEILING, "usage de entrada excedeu teto");
      assert(usage.completionTokens <= MAX_OUTPUT_TOKENS, "usage de saida excedeu teto");
      costUsd = round(
        usage.promptTokens * model.promptUsdPerToken +
          usage.completionTokens * model.completionUsdPerToken,
        9
      );
    } else {
      usage = null;
    }
    if (!response.ok || data?.error) {
      const raw = data?.error?.metadata?.raw;
      throw new Error(
        `HTTP ${response.status}: ${String(raw || data?.error?.message || "erro do provedor").slice(0, 700)}`
      );
    }
    content = contentFromResponse(data);
    score = validateJudgeResponse(parseJsonContent(content), unit);
    if (!usage) throw new Error("usage de tokens ausente");
  } catch (caught) {
    error = String(caught?.message || caught);
    if (data?.usage) {
      const promptTokens = Number(data.usage.prompt_tokens);
      const completionTokens = Number(data.usage.completion_tokens);
      if (Number.isFinite(promptTokens) && Number.isFinite(completionTokens)) {
        usage = { promptTokens, completionTokens, totalTokens: Number(data.usage.total_tokens) };
        costUsd = round(
          promptTokens * model.promptUsdPerToken + completionTokens * model.completionUsdPerToken,
          9
        );
      }
    }
  }
  const record = {
    event: "attempt_completed",
    completedAt: new Date().toISOString(),
    stage,
    unitCode: unit.unitCode,
    model: model.id,
    family: model.family,
    attempt,
    repair,
    fallback: false,
    messagesSha256,
    httpStatus,
    latencyMs: Date.now() - started,
    usage,
    costUsd,
    finishReason: data?.choices?.[0]?.finish_reason ?? null,
    responseId: data?.id ?? null,
    rawContent: content,
    providerError: data?.error || null,
    score,
    valid: score != null,
    error,
  };
  appendJournal(journalPath, record);
  return record;
}

async function runTask({ key, model, unit, position, stage, journalPath }) {
  const messages = buildJudgeMessages(unit);
  const attempts = [];
  attempts.push(await providerCall({ key, model, unit, messages, attempt: 1, journalPath, stage }));
  if (!attempts[0].valid) {
    attempts.push(await providerCall({ key, model, unit, messages, attempt: 2, journalPath, stage }));
  }
  const selected = attempts.find((attempt) => attempt.valid) || attempts.at(-1);
  return {
    stage,
    unitCode: unit.unitCode,
    sourceUnitCode: unit.sourceUnitCode || null,
    variant: unit.variant,
    agentRole: unit.agentRole,
    model: model.id,
    family: model.family,
    position,
    valid: selected.valid,
    score: selected.score,
    selectedAttempt: selected.attempt,
    attempts: attempts.length,
    error: selected.valid ? null : selected.error,
    attemptRecords: attempts,
  };
}

async function runPool(tasks, concurrency, worker, onProgress) {
  const results = new Array(tasks.length);
  let next = 0;
  let completed = 0;
  async function loop() {
    while (true) {
      const index = next++;
      if (index >= tasks.length) return;
      results[index] = await worker(tasks[index]);
      completed++;
      onProgress?.(completed, tasks.length, results[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, loop));
  return results;
}

function quantile(values, p) {
  const xs = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!xs.length) return null;
  const index = p * (xs.length - 1);
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  return lo === hi ? xs[lo] : xs[lo] + (xs[hi] - xs[lo]) * (index - lo);
}

export function quadraticWeightedKappa(pairs) {
  const clean = pairs.filter(
    (pair) => Number.isInteger(pair?.[0]) && Number.isInteger(pair?.[1])
  );
  if (!clean.length) return { kappa: null, n: 0 };
  const matrix = Array.from({ length: 5 }, () => Array(5).fill(0));
  const a = Array(5).fill(0);
  const b = Array(5).fill(0);
  for (const [x, y] of clean) {
    matrix[x][y]++;
    a[x]++;
    b[y]++;
  }
  let observed = 0;
  let expected = 0;
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      const weight = 1 - ((i - j) ** 2) / 16;
      observed += weight * (matrix[i][j] / clean.length);
      expected += weight * ((a[i] * b[j]) / (clean.length ** 2));
    }
  }
  const kappa = Math.abs(1 - expected) < 1e-12 ? (Math.abs(1 - observed) < 1e-12 ? 1 : null) : (observed - expected) / (1 - expected);
  return { kappa: round(kappa), n: clean.length, weightedAgreement: round(observed) };
}

/** Krippendorff alpha ordinal pela matriz de coincidencias e distancia ordinal marginal. */
export function krippendorffAlphaOrdinal(ratingsByUnit) {
  const coincidence = Array.from({ length: 5 }, () => Array(5).fill(0));
  let n = 0;
  for (const ratings of ratingsByUnit) {
    const xs = ratings.filter((value) => Number.isInteger(value));
    if (xs.length < 2) continue;
    n += xs.length;
    for (let i = 0; i < xs.length; i++) {
      for (let j = 0; j < xs.length; j++) {
        if (i === j) continue;
        coincidence[xs[i]][xs[j]] += 1 / (xs.length - 1);
      }
    }
  }
  if (n < 2) return { alpha: null, nRatings: n, nUnits: 0 };
  const marginal = coincidence.map((row) => sum(row));
  const distance = (a, b) => {
    if (a === b) return 0;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    let between = 0;
    for (let category = lo; category <= hi; category++) between += marginal[category];
    between -= (marginal[lo] + marginal[hi]) / 2;
    return between ** 2;
  };
  let observed = 0;
  let expected = 0;
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      const d = distance(i, j);
      observed += coincidence[i][j] * d;
      expected += marginal[i] * marginal[j] * d;
    }
  }
  observed /= n;
  expected /= n * (n - 1);
  const alpha = expected === 0 ? (observed === 0 ? 1 : null) : 1 - observed / expected;
  return {
    alpha: round(alpha),
    nRatings: n,
    nUnits: ratingsByUnit.filter((ratings) => ratings.filter(Number.isInteger).length >= 2).length,
  };
}

function agreementLabel(alpha) {
  if (!Number.isFinite(alpha)) return "nao_estimavel";
  if (alpha < 0.667) return "fraca";
  if (alpha < 0.8) return "provisoria";
  return "forte";
}

export function analyzeJudgeResults({ units, judgments, execution }) {
  const unitByCode = new Map([...units.main, ...units.mutation].map((unit) => [unit.unitCode, unit]));
  const mainJudgments = judgments.filter((item) => item.stage === "main");
  const mutationJudgments = judgments.filter((item) => item.stage === "mutation");
  const validByUnitModel = new Map(
    judgments
      .filter((item) => item.valid)
      .map((item) => [`${item.unitCode}|${item.model}`, item])
  );
  const consensus = [];
  for (const unit of units.main) {
    const rows = C4_JUDGE_MODELS.map((model) =>
      validByUnitModel.get(`${unit.unitCode}|${model.id}`)
    ).filter(Boolean);
    const dimensions = C4_JUDGE_ROLES[unit.agentKey].dimensions;
    const scores = {};
    for (const dimension of dimensions) {
      const values = rows.map((row) => row.score.scores[dimension]);
      scores[dimension] = {
        median: values.length >= 2 ? round(quantile(values, 0.5)) : null,
        q1: values.length >= 2 ? round(quantile(values, 0.25)) : null,
        q3: values.length >= 2 ? round(quantile(values, 0.75)) : null,
        valuesByModel: Object.fromEntries(
          rows.map((row) => [row.model, row.score.scores[dimension]])
        ),
      };
    }
    consensus.push({
      unitCode: unit.unitCode,
      agentRole: unit.agentRole,
      validJudges: rows.length,
      consensusAvailable: rows.length >= 2,
      scores,
    });
  }

  const agreement = {};
  const distribution = {};
  const roleSummary = {};
  for (const [agentKey, spec] of Object.entries(C4_JUDGE_ROLES)) {
    agreement[spec.role] = {};
    distribution[spec.role] = {};
    roleSummary[spec.role] = {};
    const roleUnits = units.main.filter((unit) => unit.agentKey === agentKey);
    for (const dimension of spec.dimensions) {
      const matrices = roleUnits.map((unit) =>
        C4_JUDGE_MODELS.map(
          (model) =>
            validByUnitModel.get(`${unit.unitCode}|${model.id}`)?.score?.scores?.[dimension]
        )
      );
      const alpha = krippendorffAlphaOrdinal(matrices);
      const kappas = [];
      for (let i = 0; i < C4_JUDGE_MODELS.length; i++) {
        for (let j = i + 1; j < C4_JUDGE_MODELS.length; j++) {
          const pairs = matrices
            .filter((values) => Number.isInteger(values[i]) && Number.isInteger(values[j]))
            .map((values) => [values[i], values[j]]);
          kappas.push({
            a: C4_JUDGE_MODELS[i].id,
            b: C4_JUDGE_MODELS[j].id,
            ...quadraticWeightedKappa(pairs),
          });
        }
      }
      const ranges = matrices
        .map((values) => values.filter(Number.isInteger))
        .filter((values) => values.length >= 2)
        .map((values) => Math.max(...values) - Math.min(...values));
      agreement[spec.role][dimension] = {
        ...alpha,
        interpretation: agreementLabel(alpha.alpha),
        pairwiseQuadraticWeightedKappa: kappas,
        unitsWithAtLeastTwoJudges: ranges.length,
        unitsWithDifferenceGreaterThanOne: ranges.filter((value) => value > 1).length,
        differenceGreaterThanOneRate: round(
          ranges.length ? ranges.filter((value) => value > 1).length / ranges.length : null
        ),
      };
      distribution[spec.role][dimension] = Object.fromEntries(
        C4_JUDGE_MODELS.map((model) => {
          const values = roleUnits
            .map(
              (unit) =>
                validByUnitModel.get(`${unit.unitCode}|${model.id}`)?.score?.scores?.[dimension]
            )
            .filter(Number.isInteger);
          return [
            model.id,
            {
              n: values.length,
              counts: Object.fromEntries([0, 1, 2, 3, 4].map((score) => [score, values.filter((value) => value === score).length])),
              median: round(quantile(values, 0.5)),
              q1: round(quantile(values, 0.25)),
              q3: round(quantile(values, 0.75)),
            },
          ];
        })
      );
      const unitMedians = consensus
        .filter((row) => row.agentRole === spec.role && row.scores[dimension].median != null)
        .map((row) => row.scores[dimension].median);
      roleSummary[spec.role][dimension] = {
        nConsensusUnits: unitMedians.length,
        medianOfUnitMedians: round(quantile(unitMedians, 0.5)),
        q1OfUnitMedians: round(quantile(unitMedians, 0.25)),
        q3OfUnitMedians: round(quantile(unitMedians, 0.75)),
        meanOfUnitMedians: round(mean(unitMedians)),
      };
    }
  }

  const calibration = {};
  for (const [role, dimensions] of Object.entries(MUTATION_DIMENSIONS)) {
    calibration[role] = {};
    const mutationUnits = units.mutation.filter((unit) => unit.agentRole === role);
    for (const dimension of dimensions) {
      const deltas = [];
      for (const unit of mutationUnits) {
        for (const model of C4_JUDGE_MODELS) {
          const mutated = validByUnitModel.get(`${unit.unitCode}|${model.id}`);
          const original = validByUnitModel.get(`${unit.sourceUnitCode}|${model.id}`);
          if (!mutated || !original) continue;
          deltas.push({
            exerciseId: unit.exerciseId,
            model: model.id,
            delta: mutated.score.scores[dimension] - original.score.scores[dimension],
          });
        }
      }
      const negative = deltas.filter((item) => item.delta < 0).length;
      const ties = deltas.filter((item) => item.delta === 0).length;
      const positive = deltas.filter((item) => item.delta > 0).length;
      const negativeRate = deltas.length ? negative / deltas.length : null;
      calibration[role][dimension] = {
        nPairs: deltas.length,
        meanDelta: round(mean(deltas.map((item) => item.delta))),
        negative,
        ties,
        positive,
        negativeRate: round(negativeRate),
        calibratedAt80Percent: Number.isFinite(negativeRate) ? negativeRate >= 0.8 : false,
      };
    }
  }

  return {
    schemaVersion: "educaoff-campaign4-judge-analysis-v5-glm",
    createdAt: new Date().toISOString(),
    design: {
      plannedMainUnitsIncludingFailedGeneration: 216,
      observedMainUnits: units.main.length,
      absentMainUnitsBecauseGenerationFailure: 12,
      plannedMainJudgmentsOnObservedUnits: units.main.length * C4_JUDGE_MODELS.length,
      validMainJudgments: mainJudgments.filter((item) => item.valid).length,
      missingMainJudgments: mainJudgments.filter((item) => !item.valid).length,
      unitsWithConsensus: consensus.filter((item) => item.consensusAvailable).length,
      unitsWithoutConsensus: consensus.filter((item) => !item.consensusAvailable).length,
      mutationUnits: units.mutation.length,
      validMutationJudgments: mutationJudgments.filter((item) => item.valid).length,
    },
    execution,
    roleSummary,
    distribution,
    agreement,
    calibration,
    consensus,
    limitations: [
      "juizes LLM nao substituem especialistas humanos",
      "concordancia entre modelos nao demonstra validade pedagogica",
      "o painel avalia saidas dos agentes, nao o grafo transformado pelo GraphForge",
      "mutacoes sinteticas calibram sensibilidade a degradacoes obvias, nao validade externa",
    ],
  };
}

export async function executeJudgePanel({ outDir = DEFAULT_OUT, concurrency = DEFAULT_CONCURRENCY } = {}) {
  const key = process.env.OPENROUTER_API_KEY;
  assert(typeof key === "string" && key.length >= 20, "OPENROUTER_API_KEY ausente");
  const journalPath = path.join(outDir, "calls.jsonl");
  assert(!fs.existsSync(journalPath), "journal ja existe; execucao automatica nao repete chamadas");
  const preflightPath = path.join(outDir, "judge-preflight.json");
  const financePath = path.join(outDir, "judge-finance-manifest.json");
  const snapshotPath = path.join(outDir, "judge-unit-snapshot.json");
  assert(fs.existsSync(preflightPath) && fs.existsSync(financePath) && fs.existsSync(snapshotPath), "preflight ausente");
  const preflight = readJson(preflightPath);
  const finance = readJson(financePath);
  const snapshot = readJson(snapshotPath);
  assert(preflight.protocol.sha256 === FREEZE_SHA256, "preflight nao corresponde ao protocolo");
  assert(finance.technicalBudgetUsd === TECHNICAL_BUDGET_USD, "teto financeiro divergente");
  assert(
    finance.executionCostStopUsd === EXECUTION_COST_STOP_USD,
    "trava de custo observado divergente"
  );
  const rebuilt = buildJudgeUnits();
  assert(
    sha256(stableStringify([...rebuilt.main, ...rebuilt.mutation].map(unitPublic))) ===
      preflight.unitPublicManifestSha256,
    "unidades mudaram depois do preflight"
  );
  assert(
    sha256(stableStringify([...snapshot.main, ...snapshot.mutation].map(unitPublic))) ===
      preflight.unitPublicManifestSha256,
    "snapshot de unidades divergiu"
  );

  const keyBefore = await checkKeyReadiness(key);
  writeJson(path.join(outDir, "judge-key-readiness-before.json"), keyBefore);
  const startedAt = new Date().toISOString();
  const allResults = [];
  let completedNetworkCalls = 0;
  let actualCostUsd = 0;
  const progress = (stage) => (completed, total, result) => {
    for (const attempt of result.attemptRecords) {
      completedNetworkCalls++;
      actualCostUsd += attempt.costUsd || 0;
    }
    assert(completedNetworkCalls <= finance.maximumCalls, "numero de chamadas excedeu plano");
    assert(
      actualCostUsd <= finance.executionCostStopUsd + 1e-9,
      "custo contabilizado excedeu trava de execucao"
    );
    if (completed % 20 === 0 || completed === total) {
      process.stdout.write(
        `${JSON.stringify({ stage, completed, total, networkCalls: completedNetworkCalls, costUsd: round(actualCostUsd, 6), lastValid: result.valid })}\n`
      );
    }
  };

  for (const [stage, units] of [
    ["main", snapshot.main],
    ["mutation", snapshot.mutation],
  ]) {
    const tasks = [];
    for (const model of C4_JUDGE_MODELS) {
      orderForJudge(units, model.id, stage).forEach((unit, position) =>
        tasks.push({ key, model, unit, position, stage, journalPath })
      );
    }
    // Intercalacao por posicao evita que uma familia inteira seja sempre julgada primeiro.
    tasks.sort((a, b) => a.position - b.position || a.model.id.localeCompare(b.model.id));
    const results = await runPool(
      tasks,
      concurrency,
      (task) => runTask(task),
      progress(stage)
    );
    allResults.push(...results);
  }

  const keyAfter = await checkKeyReadiness(key);
  writeJson(path.join(outDir, "judge-key-readiness-after.json"), keyAfter);
  const attempts = allResults.flatMap((result) => result.attemptRecords);
  const execution = {
    schemaVersion: "educaoff-campaign4-judge-results-v5-glm",
    startedAt,
    completedAt: new Date().toISOString(),
    status: "completed",
    concurrency,
    primaryUnits: allResults.length,
    networkCalls: attempts.length,
    repairs: attempts.filter((item) => item.repair).length,
    fallbacks: 0,
    validJudgments: allResults.filter((item) => item.valid).length,
    invalidJudgments: allResults.filter((item) => !item.valid).length,
    promptTokens: sum(attempts.map((item) => item.usage?.promptTokens || 0)),
    completionTokens: sum(attempts.map((item) => item.usage?.completionTokens || 0)),
    accountedCostUsd: round(sum(attempts.map((item) => item.costUsd || 0)), 9),
    technicalBudgetUsd: finance.technicalBudgetUsd,
    executionCostStopUsd: finance.executionCostStopUsd,
    worstCaseUsd: finance.worstCaseUsd,
    models: C4_JUDGE_MODELS.map((model) => model.id),
  };
  const resultsArtifact = {
    ...execution,
    judgments: allResults.map(({ attemptRecords, ...result }) => result),
  };
  writeJson(path.join(outDir, "judge-panel-results.json"), resultsArtifact);
  const analysis = analyzeJudgeResults({
    units: { main: snapshot.main, mutation: snapshot.mutation },
    judgments: allResults,
    execution,
  });
  writeJson(path.join(outDir, "judge-panel-analysis.json"), analysis);
  return { outDir, results: resultsArtifact, analysis };
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args.includes("--preflight") ? "preflight" : args.includes("--execute") ? "execute" : null;
  const outIndex = args.indexOf("--out");
  const outDir = outIndex >= 0 ? path.resolve(args[outIndex + 1]) : DEFAULT_OUT;
  const concurrencyIndex = args.indexOf("--concurrency");
  const concurrency = concurrencyIndex >= 0 ? Number(args[concurrencyIndex + 1]) : DEFAULT_CONCURRENCY;
  assert(mode, "use --preflight ou --execute");
  if (mode === "preflight") {
    const { preflight, finance } = await prepareJudgePanel({ outDir });
    process.stdout.write(
      `${JSON.stringify({ status: "ready", outDir, mainJudgments: preflight.design.mainJudgments, mutationJudgments: preflight.design.mutationJudgments, maximumCalls: finance.maximumCalls, worstCaseUsd: finance.worstCaseUsd, executionCostStopUsd: finance.executionCostStopUsd })}\n`
    );
  } else {
    assert(Number.isInteger(concurrency) && concurrency >= 1 && concurrency <= 24, "concurrency invalida");
    const { results } = await executeJudgePanel({ outDir, concurrency });
    process.stdout.write(
      `${JSON.stringify({ status: results.status, outDir, networkCalls: results.networkCalls, validJudgments: results.validJudgments, costUsd: results.accountedCostUsd })}\n`
    );
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error?.stack || error}\n`);
    process.exitCode = 1;
  });
}
