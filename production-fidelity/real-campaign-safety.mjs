/**
 * Guardião fail-closed da campanha completa: 6 estados × 3 réplicas.
 *
 * Mantém o piloto de três estados isolado em real-run-safety.mjs. Esta extensão
 * adiciona orçamento hierárquico, journal encadeado com snapshots e retomada sem
 * repetir chamada cujo resultado seja completo, incerto ou já contabilizado.
 * Não importa cliente LLM e não acessa rede/VPS.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  PilotBudgetExceededError,
  PilotInterruptedError,
  PilotMissingUsageError,
  PilotSafetyError,
  worstCaseCallCostUsd,
} from "./real-run-safety.mjs";
import { stableStringify } from "./equivalence-gate.mjs";

export const REAL_CAMPAIGN_CONFIRMATION =
  "EXECUTAR_CAMPANHA_REAL_6_ESTADOS_3_REPLICAS_USD_10_80";
export const REAL_CAMPAIGN_RESUME_CONFIRMATION =
  "RETOMAR_CAMPANHA_REAL_SEM_REEXECUTAR_CHAMADAS_INCERTAS";

export const FULL_CAMPAIGN_LIMITS = Object.freeze({
  stateCount: 6,
  replicaCount: 3,
  callsPerState: 3,
  maxCalls: 54,
  maxConcurrentCalls: 1,
  fallbackAllowed: false,
  inputTokenCeiling: 20_000,
  inputUsdPerMillion: 1.5,
  outputUsdPerMillion: 9,
  stateWorstCaseUsd: 0.594,
  stateBudgetUsd: 0.594,
  replicaWorstCaseUsd: 3.564,
  replicaBudgetUsd: 3.6,
  campaignWorstCaseUsd: 10.692,
  campaignBudgetUsd: 10.8,
  agents: Object.freeze({
    agent3a: Object.freeze({ model: "google/gemini-3.5-flash", outputTokenCeiling: 16_000 }),
    agent3b: Object.freeze({ model: "google/gemini-3.5-flash", outputTokenCeiling: 24_000 }),
    agent3c: Object.freeze({ model: "google/gemini-3.5-flash", outputTokenCeiling: 16_000 }),
  }),
});

const AGENT_ORDER = Object.freeze(["agent3a", "agent3b", "agent3c"]);
const EPSILON = 1e-10;
const HASH_RE = /^[a-f0-9]{64}$/;

const deepClone = (value) => JSON.parse(JSON.stringify(value));
const money = (value) => Math.round(value * 1e8) / 1e8;
const addMoney = (left, right) =>
  (Math.round(left * 1e8) + Math.round(right * 1e8)) / 1e8;
const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;
const sha256 = (value) =>
  crypto.createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");

function safeId(value, label) {
  const id = String(value || "");
  if (!/^[A-Za-z0-9._-]{1,120}$/.test(id)) {
    throw new PilotSafetyError(`${label} deve conter somente caracteres seguros`);
  }
  return id;
}

function uniqueIds(values, expectedLength, label) {
  if (
    !Array.isArray(values) ||
    values.length !== expectedLength ||
    values.some((value) => !nonEmpty(value)) ||
    new Set(values).size !== values.length
  ) {
    throw new PilotSafetyError(`${label} deve conter exatamente ${expectedLength} ids únicos`);
  }
  return values.map((value) => safeId(value, label));
}

function callKey({ replicaId, stateId, agentKey }) {
  return `${replicaId}::${stateId}::${agentKey}::1::primary`;
}

function stateKey(replicaId, stateId) {
  return `${replicaId}::${stateId}`;
}

function durableAppend(filePath, line) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const fd = fs.openSync(filePath, "a", 0o600);
  try {
    const data = Buffer.from(`${JSON.stringify(line)}\n`, "utf8");
    let offset = 0;
    while (offset < data.length) offset += fs.writeSync(fd, data, offset, data.length - offset);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function durableJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  const fd = fs.openSync(temp, "wx", 0o600);
  try {
    const data = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    let offset = 0;
    while (offset < data.length) offset += fs.writeSync(fd, data, offset, data.length - offset);
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
    // Alguns sistemas não oferecem fsync de diretório; o arquivo já foi fsyncado.
  }
}

function stateDigest(state) {
  const copy = deepClone(state);
  delete copy.journal;
  return sha256(stableStringify(copy));
}

function eventHash(core) {
  return sha256(stableStringify(core));
}

function readJournal(journalPath) {
  const raw = fs.readFileSync(journalPath, "utf8");
  const hasFinalNewline = raw.endsWith("\n");
  const parts = raw.split("\n");
  let tailRepair = null;
  if (parts.at(-1) === "") parts.pop();
  if (!hasFinalNewline && parts.length) {
    // Última gravação parcial: o chamador nunca recebeu confirmação do fsync, logo
    // nenhuma chamada externa poderia legitimamente começar a partir deste registro.
    try {
      JSON.parse(parts.at(-1));
      tailRepair = { appendNewline: true, truncateBytes: null };
    } catch {
      parts.pop();
      const lastNewline = raw.lastIndexOf("\n");
      const validPrefix = lastNewline >= 0 ? raw.slice(0, lastNewline + 1) : "";
      tailRepair = { appendNewline: false, truncateBytes: Buffer.byteLength(validPrefix, "utf8") };
    }
  }
  if (!parts.length) throw new PilotSafetyError("journal vazio; retomada bloqueada");

  let previousHash = null;
  let expectedSeq = 1;
  let lastState = null;
  for (const [index, line] of parts.entries()) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      throw new PilotSafetyError(`journal corrompido na linha ${index + 1}`);
    }
    if (event.seq !== expectedSeq || event.prevEventSha256 !== previousHash) {
      throw new PilotSafetyError(`cadeia do journal inválida na linha ${index + 1}`);
    }
    if (!event.stateAfter || stateDigest(event.stateAfter) !== event.stateDigest) {
      throw new PilotSafetyError(`snapshot adulterado na linha ${index + 1}`);
    }
    const core = {
      schemaVersion: event.schemaVersion,
      seq: event.seq,
      ts: event.ts,
      runId: event.runId,
      type: event.type,
      details: event.details,
      prevEventSha256: event.prevEventSha256,
      stateDigest: event.stateDigest,
    };
    if (eventHash(core) !== event.eventSha256) {
      throw new PilotSafetyError(`hash do journal inválido na linha ${index + 1}`);
    }
    if (
      event.stateAfter.journal?.lastSeq !== event.seq ||
      event.stateAfter.journal?.lastEventSha256 !== event.eventSha256
    ) {
      throw new PilotSafetyError(`ponteiro do snapshot inválido na linha ${index + 1}`);
    }
    previousHash = event.eventSha256;
    expectedSeq += 1;
    lastState = event.stateAfter;
  }
  return { state: deepClone(lastState), tailRepair };
}

function repairJournalTail(journalPath, repair) {
  if (!repair) return;
  if (Number.isInteger(repair.truncateBytes)) fs.truncateSync(journalPath, repair.truncateBytes);
  if (repair.appendNewline) {
    const fd = fs.openSync(journalPath, "a", 0o600);
    try {
      fs.writeSync(fd, Buffer.from("\n"));
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  }
}

function planSha256(plan) {
  return sha256(stableStringify(plan.map(({ status: _status, reservationId: _id, ...entry }) => entry)));
}

/** Plano estrito: 54 chamadas primárias, sem fallback, com os limites balanced congelados. */
export function validateFullCampaignPlan({
  callPlan,
  stateIds,
  replicaIds,
  stateBudgetUsd = FULL_CAMPAIGN_LIMITS.stateBudgetUsd,
  replicaBudgetUsd = FULL_CAMPAIGN_LIMITS.replicaBudgetUsd,
  campaignBudgetUsd = FULL_CAMPAIGN_LIMITS.campaignBudgetUsd,
} = {}) {
  const states = uniqueIds(stateIds, FULL_CAMPAIGN_LIMITS.stateCount, "stateIds");
  const replicas = uniqueIds(replicaIds, FULL_CAMPAIGN_LIMITS.replicaCount, "replicaIds");
  if (!(stateBudgetUsd > 0 && stateBudgetUsd <= FULL_CAMPAIGN_LIMITS.stateBudgetUsd + EPSILON)) {
    throw new PilotSafetyError("stateBudgetUsd deve ser positivo e no máximo US$ 0,594");
  }
  if (!(replicaBudgetUsd > 0 && replicaBudgetUsd <= FULL_CAMPAIGN_LIMITS.replicaBudgetUsd + EPSILON)) {
    throw new PilotSafetyError("replicaBudgetUsd deve ser positivo e no máximo US$ 3,60");
  }
  if (!(campaignBudgetUsd > 0 && campaignBudgetUsd <= FULL_CAMPAIGN_LIMITS.campaignBudgetUsd + EPSILON)) {
    throw new PilotSafetyError("campaignBudgetUsd deve ser positivo e no máximo US$ 10,80");
  }
  if (!Array.isArray(callPlan) || callPlan.length !== FULL_CAMPAIGN_LIMITS.maxCalls) {
    throw new PilotSafetyError("callPlan deve conter exatamente 54 chamadas");
  }

  const stateSet = new Set(states);
  const replicaSet = new Set(replicas);
  const seen = new Set();
  const normalized = callPlan.map((entry, index) => {
    if (!entry || typeof entry !== "object") throw new PilotSafetyError(`callPlan[${index}] inválido`);
    if (!replicaSet.has(entry.replicaId) || !stateSet.has(entry.stateId)) {
      throw new PilotSafetyError(`callPlan[${index}] referencia réplica/estado fora do protocolo`);
    }
    const expectedAgent = FULL_CAMPAIGN_LIMITS.agents[entry.agentKey];
    if (!expectedAgent) throw new PilotSafetyError(`callPlan[${index}] usa agente inválido`);
    if (entry.fallbackUsed === true || entry.attempt !== 1) {
      throw new PilotSafetyError("fallback/retry é proibido na campanha completa");
    }
    const exactConfig =
      entry.model === expectedAgent.model &&
      entry.inputTokenCeiling === FULL_CAMPAIGN_LIMITS.inputTokenCeiling &&
      entry.outputTokenCeiling === expectedAgent.outputTokenCeiling &&
      entry.inputUsdPerMillion === FULL_CAMPAIGN_LIMITS.inputUsdPerMillion &&
      entry.outputUsdPerMillion === FULL_CAMPAIGN_LIMITS.outputUsdPerMillion;
    if (!exactConfig) throw new PilotSafetyError(`limites/config divergentes em callPlan[${index}]`);
    const key = callKey(entry);
    if (seen.has(key)) throw new PilotSafetyError(`chamada duplicada: ${key}`);
    seen.add(key);
    return {
      key,
      replicaId: entry.replicaId,
      stateId: entry.stateId,
      agentKey: entry.agentKey,
      model: entry.model,
      attempt: 1,
      fallbackUsed: false,
      inputTokenCeiling: entry.inputTokenCeiling,
      outputTokenCeiling: entry.outputTokenCeiling,
      inputUsdPerMillion: entry.inputUsdPerMillion,
      outputUsdPerMillion: entry.outputUsdPerMillion,
      worstCaseUsd: worstCaseCallCostUsd(entry),
      status: "pending",
      reservationId: null,
    };
  });

  for (const replicaId of replicas) {
    for (const stateId of states) {
      for (const agentKey of AGENT_ORDER) {
        if (!seen.has(callKey({ replicaId, stateId, agentKey }))) {
          throw new PilotSafetyError(`chamada obrigatória ausente: ${replicaId}/${stateId}/${agentKey}`);
        }
      }
    }
  }

  const perState = {};
  const perReplica = {};
  for (const entry of normalized) {
    const sk = stateKey(entry.replicaId, entry.stateId);
    perState[sk] = addMoney(perState[sk] || 0, entry.worstCaseUsd);
    perReplica[entry.replicaId] = addMoney(
      perReplica[entry.replicaId] || 0,
      entry.worstCaseUsd
    );
  }
  const campaignWorstCaseUsd = normalized.reduce(
    (sum, entry) => addMoney(sum, entry.worstCaseUsd),
    0
  );
  if (Object.values(perState).some((value) => value > stateBudgetUsd + EPSILON)) {
    throw new PilotBudgetExceededError("pior caso de estado excede stateBudgetUsd");
  }
  if (Object.values(perReplica).some((value) => value > replicaBudgetUsd + EPSILON)) {
    throw new PilotBudgetExceededError("pior caso de réplica excede replicaBudgetUsd");
  }
  if (campaignWorstCaseUsd > campaignBudgetUsd + EPSILON) {
    throw new PilotBudgetExceededError("pior caso da campanha excede campaignBudgetUsd");
  }
  return {
    calls: normalized,
    perStateWorstCaseUsd: perState,
    perReplicaWorstCaseUsd: perReplica,
    campaignWorstCaseUsd,
    planSha256: planSha256(normalized),
  };
}

function validateUsage(usage) {
  return (
    usage &&
    Number.isInteger(usage.promptTokens) &&
    usage.promptTokens >= 0 &&
    Number.isInteger(usage.completionTokens) &&
    usage.completionTokens >= 0 &&
    usage.estimated !== true
  );
}

function publicReservation(reservation) {
  const {
    id,
    callKey: key,
    replicaId,
    stateId,
    agentKey,
    model,
    promptSha256,
    reservedUsd,
    inputTokenCeiling,
    outputTokenCeiling,
    inputUsdPerMillion,
    outputUsdPerMillion,
  } = reservation;
  return {
    id,
    callKey: key,
    replicaId,
    stateId,
    agentKey,
    model,
    promptSha256,
    reservedUsd,
    inputTokenCeiling,
    outputTokenCeiling,
    inputUsdPerMillion,
    outputUsdPerMillion,
  };
}

export class RealCampaignSafetyGuard {
  constructor({
    confirmation,
    runId,
    runDir,
    stateIds,
    replicaIds,
    callPlan,
    stateBudgetUsd = FULL_CAMPAIGN_LIMITS.stateBudgetUsd,
    replicaBudgetUsd = FULL_CAMPAIGN_LIMITS.replicaBudgetUsd,
    campaignBudgetUsd = FULL_CAMPAIGN_LIMITS.campaignBudgetUsd,
    now = () => new Date().toISOString(),
  } = {}) {
    if (confirmation !== REAL_CAMPAIGN_CONFIRMATION) {
      throw new PilotSafetyError(`confirmação ausente; use ${REAL_CAMPAIGN_CONFIRMATION}`);
    }
    this.runId = safeId(runId, "runId");
    this.runDir = path.resolve(String(runDir || ""));
    if (!nonEmpty(runDir)) throw new PilotSafetyError("runDir explícito é obrigatório");
    this.journalPath = path.join(this.runDir, "campaign-journal.jsonl");
    this.checkpointPath = path.join(this.runDir, "campaign-checkpoint.json");
    this.receiptDir = path.join(this.runDir, "receipts");
    this.now = now;
    if (fs.existsSync(this.journalPath) || fs.existsSync(this.checkpointPath)) {
      throw new PilotSafetyError("campanha já existe; use resume() para evitar cobrança duplicada");
    }
    const approved = validateFullCampaignPlan({
      callPlan,
      stateIds,
      replicaIds,
      stateBudgetUsd,
      replicaBudgetUsd,
      campaignBudgetUsd,
    });
    const states = uniqueIds(stateIds, FULL_CAMPAIGN_LIMITS.stateCount, "stateIds");
    const replicas = uniqueIds(replicaIds, FULL_CAMPAIGN_LIMITS.replicaCount, "replicaIds");
    this.state = {
      schemaVersion: "educaoff-real-campaign-safety-v1",
      runId: this.runId,
      status: "running",
      stateOrder: states,
      replicaOrder: replicas,
      budgets: {
        stateBudgetUsd: money(stateBudgetUsd),
        replicaBudgetUsd: money(replicaBudgetUsd),
        campaignBudgetUsd: money(campaignBudgetUsd),
      },
      totals: { spentUsd: 0, reservedUsd: 0 },
      plan: {
        planSha256: approved.planSha256,
        campaignWorstCaseUsd: approved.campaignWorstCaseUsd,
        perReplicaWorstCaseUsd: approved.perReplicaWorstCaseUsd,
        perStateWorstCaseUsd: approved.perStateWorstCaseUsd,
        calls: approved.calls,
      },
      replicas: Object.fromEntries(
        replicas.map((replicaId) => [
          replicaId,
          {
            status: "pending",
            spentUsd: 0,
            reservedUsd: 0,
            states: Object.fromEntries(
              states.map((stateId) => [
                stateId,
                {
                  status: "pending",
                  spentUsd: 0,
                  reservedUsd: 0,
                  calls: [],
                  failure: null,
                },
              ])
            ),
          },
        ])
      ),
      reservations: {},
      resumeCount: 0,
      createdAt: this.now(),
      updatedAt: this.now(),
      abortReason: null,
      journal: { lastSeq: 0, lastEventSha256: null },
    };
    this._commit("campaign_started", {
      limits: FULL_CAMPAIGN_LIMITS,
      planSha256: approved.planSha256,
      campaignWorstCaseUsd: approved.campaignWorstCaseUsd,
    });
  }

  static resume({
    confirmation,
    runId,
    runDir,
    expectedPlanSha256,
    now = () => new Date().toISOString(),
  } = {}) {
    if (confirmation !== REAL_CAMPAIGN_RESUME_CONFIRMATION) {
      throw new PilotSafetyError(`retomada exige ${REAL_CAMPAIGN_RESUME_CONFIRMATION}`);
    }
    const instance = Object.create(RealCampaignSafetyGuard.prototype);
    instance.runId = safeId(runId, "runId");
    instance.runDir = path.resolve(String(runDir || ""));
    instance.journalPath = path.join(instance.runDir, "campaign-journal.jsonl");
    instance.checkpointPath = path.join(instance.runDir, "campaign-checkpoint.json");
    instance.receiptDir = path.join(instance.runDir, "receipts");
    instance.now = now;
    if (!fs.existsSync(instance.journalPath)) throw new PilotSafetyError("journal não encontrado");
    const journal = readJournal(instance.journalPath);
    instance.state = journal.state;
    repairJournalTail(instance.journalPath, journal.tailRepair);
    if (instance.state.runId !== instance.runId) throw new PilotSafetyError("runId diverge do journal");
    if (instance.state.plan.planSha256 !== expectedPlanSha256) {
      throw new PilotSafetyError("planSha256 diverge; retomada bloqueada");
    }
    if (["completed", "completed-with-failures", "aborted"].includes(instance.state.status)) {
      throw new PilotSafetyError(`campanha terminal não pode ser retomada: ${instance.state.status}`);
    }

    // Journal é a fonte de verdade; repara checkpoint incompleto/atrasado sem
    // reexecutar nenhuma chamada.
    durableJson(instance.checkpointPath, instance.state);
    const priorStatus = instance.state.status;
    instance.state.status = "reconciling";
    instance.state.resumeCount += 1;
    instance._commit("campaign_resume_started", {
      priorStatus,
      reservations: Object.keys(instance.state.reservations).length,
    });
    instance._reconcileReservations();
    instance.state.status = "running";
    instance._commit("campaign_resumed", { resumeCount: instance.state.resumeCount });
    return instance;
  }

  _commit(type, details = {}) {
    this.state.updatedAt = this.now();
    const seq = this.state.journal.lastSeq + 1;
    const previousHash = this.state.journal.lastEventSha256;
    const digest = stateDigest(this.state);
    const core = {
      schemaVersion: "educaoff-real-campaign-journal-v1",
      seq,
      ts: this.now(),
      runId: this.runId,
      type,
      details: deepClone(details),
      prevEventSha256: previousHash,
      stateDigest: digest,
    };
    const hash = eventHash(core);
    this.state.journal = { lastSeq: seq, lastEventSha256: hash };
    const event = { ...core, eventSha256: hash, stateAfter: deepClone(this.state) };
    durableAppend(this.journalPath, event);
    durableJson(this.checkpointPath, this.state);
  }

  _assertRunning() {
    if (this.state.status !== "running") {
      throw new PilotInterruptedError(`campanha não está executável: ${this.state.status}`);
    }
  }

  _records(replicaId, stateId) {
    const replica = this.state.replicas[replicaId];
    const state = replica?.states?.[stateId];
    if (!replica || !state) throw new PilotSafetyError("réplica/estado fora do protocolo");
    return { replica, state };
  }

  snapshot() {
    return deepClone(this.state);
  }

  startReplica(replicaId) {
    this._assertRunning();
    const replica = this.state.replicas[replicaId];
    if (!replica || replica.status !== "pending") throw new PilotSafetyError("réplica não está pendente");
    const next = this.state.replicaOrder.find((id) => this.state.replicas[id].status === "pending");
    if (next !== replicaId) throw new PilotSafetyError(`próxima réplica deve ser ${next}`);
    if (Object.values(this.state.replicas).some((r) => r.status === "active")) {
      throw new PilotSafetyError("outra réplica ainda está ativa");
    }
    replica.status = "active";
    replica.startedAt = this.now();
    this._commit("replica_started", { replicaId });
  }

  startState(replicaId, stateId) {
    this._assertRunning();
    const { replica, state } = this._records(replicaId, stateId);
    if (replica.status !== "active" || state.status !== "pending") {
      throw new PilotSafetyError("réplica/estado não está pronto");
    }
    const next = this.state.stateOrder.find((id) => replica.states[id].status === "pending");
    if (next !== stateId) throw new PilotSafetyError(`próximo estado deve ser ${next}`);
    if (Object.values(replica.states).some((item) => item.status === "active")) {
      throw new PilotSafetyError("outro estado ainda está ativo");
    }
    state.status = "active";
    state.startedAt = this.now();
    this._commit("state_started", { replicaId, stateId });
  }

  reserveCall({ replicaId, stateId, agentKey, promptSha256, ...config } = {}) {
    this._assertRunning();
    if (Object.keys(this.state.reservations).length >= FULL_CAMPAIGN_LIMITS.maxConcurrentCalls) {
      throw new PilotSafetyError("campanha permite no máximo uma chamada em voo");
    }
    if (!HASH_RE.test(promptSha256 || "")) throw new PilotSafetyError("promptSha256 é obrigatório");
    const { replica, state } = this._records(replicaId, stateId);
    if (replica.status !== "active" || state.status !== "active") {
      throw new PilotSafetyError("réplica/estado não está ativo");
    }
    const key = callKey({ replicaId, stateId, agentKey });
    const planned = this.state.plan.calls.find((entry) => entry.key === key);
    if (!planned || planned.status !== "pending") {
      throw new PilotSafetyError("chamada ausente, repetida ou já contabilizada");
    }
    const expectedAgent = FULL_CAMPAIGN_LIMITS.agents[agentKey];
    const exact =
      expectedAgent &&
      config.model === expectedAgent.model &&
      config.attempt === 1 &&
      config.fallbackUsed === false &&
      config.inputTokenCeiling === FULL_CAMPAIGN_LIMITS.inputTokenCeiling &&
      config.outputTokenCeiling === expectedAgent.outputTokenCeiling &&
      config.inputUsdPerMillion === FULL_CAMPAIGN_LIMITS.inputUsdPerMillion &&
      config.outputUsdPerMillion === FULL_CAMPAIGN_LIMITS.outputUsdPerMillion;
    if (!exact) {
      this.state.status = "aborted";
      this.state.abortReason = "call-config-diverged";
      this._commit("campaign_aborted", { reason: this.state.abortReason, key });
      throw new PilotInterruptedError("configuração de chamada divergiu do plano congelado");
    }
    const order = AGENT_ORDER.find((agent) => {
      const item = this.state.plan.calls.find(
        (entry) => entry.replicaId === replicaId && entry.stateId === stateId && entry.agentKey === agent
      );
      return item?.status === "pending";
    });
    if (order !== agentKey) throw new PilotSafetyError(`próximo agente deve ser ${order}`);
    const reserveUsd = planned.worstCaseUsd;
    const campaignAvailable = money(
      this.state.budgets.campaignBudgetUsd - this.state.totals.spentUsd - this.state.totals.reservedUsd
    );
    const replicaAvailable = money(
      this.state.budgets.replicaBudgetUsd - replica.spentUsd - replica.reservedUsd
    );
    const stateAvailable = money(
      this.state.budgets.stateBudgetUsd - state.spentUsd - state.reservedUsd
    );
    if ([campaignAvailable, replicaAvailable, stateAvailable].some((value) => reserveUsd > value + EPSILON)) {
      this.state.status = "aborted";
      this.state.abortReason = "hierarchical-budget-refused";
      this._commit("campaign_aborted", {
        reason: this.state.abortReason,
        key,
        reserveUsd,
        campaignAvailable,
        replicaAvailable,
        stateAvailable,
      });
      throw new PilotBudgetExceededError("reserva recusada por teto hierárquico");
    }
    const reservation = {
      id: crypto.randomBytes(12).toString("hex"),
      callKey: key,
      replicaId,
      stateId,
      agentKey,
      promptSha256,
      reservedUsd: reserveUsd,
      ...config,
      createdAt: this.now(),
    };
    this.state.reservations[reservation.id] = reservation;
    planned.status = "reserved";
    planned.reservationId = reservation.id;
    this.state.totals.reservedUsd = money(this.state.totals.reservedUsd + reserveUsd);
    replica.reservedUsd = money(replica.reservedUsd + reserveUsd);
    state.reservedUsd = money(state.reservedUsd + reserveUsd);
    this._commit("call_reserved", publicReservation(reservation));
    return publicReservation(reservation);
  }

  completeCall(reservationId, { status = "ok", usage, costUsd, latencyMs = null, outputSha256 } = {}) {
    this._assertRunning();
    const reservation = this.state.reservations[reservationId];
    if (!reservation) throw new PilotSafetyError("reserva inexistente ou já contabilizada");
    if (status !== "ok" && status !== "error") throw new PilotSafetyError("status inválido");
    if (!validateUsage(usage) || !Number.isFinite(costUsd) || costUsd < 0 || !HASH_RE.test(outputSha256 || "")) {
      this._chargeUnknown(reservation, "missing-real-usage-cost-or-output-hash");
      this.state.status = "paused";
      this._commit("campaign_paused", { reason: "invalid-call-receipt" });
      throw new PilotMissingUsageError("usage/custo/hash reais são obrigatórios; chamada não será repetida");
    }
    this._finalizeKnownCall(reservation, { status, usage, costUsd, latencyMs, outputSha256 });
    if (status === "error") {
      this._failState(reservation.replicaId, reservation.stateId, "provider-call-error");
      this.state.status = "paused";
      this._commit("campaign_paused", { reason: "provider-call-error" });
      throw new PilotInterruptedError("chamada falhou; estado registrado como falha e campanha pausada");
    }
    return deepClone(
      this._records(reservation.replicaId, reservation.stateId).state.calls.at(-1)
    );
  }

  _finalizeKnownCall(reservation, { status, usage, costUsd, latencyMs = null, outputSha256 }) {
    const { replica, state } = this._records(reservation.replicaId, reservation.stateId);
    const planned = this.state.plan.calls.find((entry) => entry.key === reservation.callKey);
    const exceeds =
      usage.promptTokens > reservation.inputTokenCeiling ||
      usage.completionTokens > reservation.outputTokenCeiling ||
      costUsd > reservation.reservedUsd + EPSILON;
    delete this.state.reservations[reservation.id];
    this.state.totals.reservedUsd = money(this.state.totals.reservedUsd - reservation.reservedUsd);
    replica.reservedUsd = money(replica.reservedUsd - reservation.reservedUsd);
    state.reservedUsd = money(state.reservedUsd - reservation.reservedUsd);
    this.state.totals.spentUsd = money(this.state.totals.spentUsd + costUsd);
    replica.spentUsd = money(replica.spentUsd + costUsd);
    state.spentUsd = money(state.spentUsd + costUsd);
    planned.status = status === "ok" ? "completed" : "error";
    planned.reservationId = null;
    const call = {
      ...publicReservation(reservation),
      status,
      usage: { ...usage, estimated: false },
      costUsd: money(costUsd),
      outputSha256,
      latencyMs: Number.isFinite(latencyMs) && latencyMs >= 0 ? latencyMs : null,
      completedAt: this.now(),
    };
    state.calls.push(call);
    this._commit("call_completed", call);
    if (
      exceeds ||
      state.spentUsd > this.state.budgets.stateBudgetUsd + EPSILON ||
      replica.spentUsd > this.state.budgets.replicaBudgetUsd + EPSILON ||
      this.state.totals.spentUsd > this.state.budgets.campaignBudgetUsd + EPSILON
    ) {
      this.state.status = "aborted";
      this.state.abortReason = "reported-cost-exceeded-reservation";
      this._commit("campaign_aborted", { reason: this.state.abortReason, call });
      throw new PilotBudgetExceededError("uso/custo reportado excedeu reserva ou teto hierárquico");
    }
  }

  _chargeUnknown(reservation, reason) {
    const { replica, state } = this._records(reservation.replicaId, reservation.stateId);
    const planned = this.state.plan.calls.find((entry) => entry.key === reservation.callKey);
    delete this.state.reservations[reservation.id];
    this.state.totals.reservedUsd = money(this.state.totals.reservedUsd - reservation.reservedUsd);
    replica.reservedUsd = money(replica.reservedUsd - reservation.reservedUsd);
    state.reservedUsd = money(state.reservedUsd - reservation.reservedUsd);
    this.state.totals.spentUsd = money(this.state.totals.spentUsd + reservation.reservedUsd);
    replica.spentUsd = money(replica.spentUsd + reservation.reservedUsd);
    state.spentUsd = money(state.spentUsd + reservation.reservedUsd);
    planned.status = "unknown-charged-no-retry";
    planned.reservationId = null;
    state.calls.push({
      ...publicReservation(reservation),
      status: "unknown-charged-no-retry",
      chargedConservativelyUsd: reservation.reservedUsd,
      reason,
    });
    this._commit("call_unknown_charged_no_retry", {
      ...publicReservation(reservation),
      reason,
      chargedConservativelyUsd: reservation.reservedUsd,
    });
    this._failState(reservation.replicaId, reservation.stateId, reason);
  }

  _failState(replicaId, stateId, reason) {
    const { state } = this._records(replicaId, stateId);
    state.status = "failed";
    state.failure = { reason, at: this.now() };
    for (const entry of this.state.plan.calls) {
      if (
        entry.replicaId === replicaId &&
        entry.stateId === stateId &&
        entry.status === "pending"
      ) {
        entry.status = "skipped-after-failure";
      }
    }
    this._commit("state_failed", { replicaId, stateId, reason });
  }

  _reconcileReservations() {
    for (const reservation of Object.values({ ...this.state.reservations })) {
      const receiptPath = path.join(this.receiptDir, `${reservation.id}.json`);
      if (!fs.existsSync(receiptPath)) {
        this._chargeUnknown(reservation, "resume-without-durable-receipt");
        continue;
      }
      let receipt;
      try {
        receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
      } catch {
        this.state.status = "aborted";
        this.state.abortReason = "malformed-receipt";
        this._commit("campaign_aborted", { reason: this.state.abortReason, reservationId: reservation.id });
        throw new PilotSafetyError("recibo durável inválido; retomada bloqueada");
      }
      const validIdentity =
        receipt.schemaVersion === "educaoff-real-campaign-call-receipt-v1" &&
        receipt.reservationId === reservation.id &&
        receipt.callKey === reservation.callKey &&
        receipt.promptSha256 === reservation.promptSha256 &&
        (receipt.status === "ok" || receipt.status === "error") &&
        typeof receipt.rawResponse === "string" &&
        sha256(receipt.rawResponse) === receipt.outputSha256;
      if (!validIdentity || !validateUsage(receipt.usage) || !Number.isFinite(receipt.costUsd) || !HASH_RE.test(receipt.outputSha256 || "")) {
        this.state.status = "aborted";
        this.state.abortReason = "receipt-integrity-failed";
        this._commit("campaign_aborted", { reason: this.state.abortReason, reservationId: reservation.id });
        throw new PilotSafetyError("identidade/usage do recibo diverge; retomada bloqueada");
      }
      this._finalizeKnownCall(reservation, receipt);
      if (receipt.status === "error") this._failState(reservation.replicaId, reservation.stateId, "provider-call-error");
      this._commit("call_recovered_from_receipt", { reservationId: reservation.id, callKey: reservation.callKey });
    }
  }

  completeState(replicaId, stateId) {
    this._assertRunning();
    const { replica, state } = this._records(replicaId, stateId);
    if (replica.status !== "active" || state.status !== "active") throw new PilotSafetyError("estado não está ativo");
    if (Object.values(this.state.reservations).some((r) => r.replicaId === replicaId && r.stateId === stateId)) {
      throw new PilotSafetyError("estado possui chamada em voo");
    }
    for (const agentKey of AGENT_ORDER) {
      if (!state.calls.some((call) => call.agentKey === agentKey && call.status === "ok")) {
        throw new PilotSafetyError(`sucesso ausente de ${agentKey}`);
      }
    }
    state.status = "completed";
    state.completedAt = this.now();
    this._commit("state_completed", { replicaId, stateId });
  }

  completeReplica(replicaId) {
    this._assertRunning();
    const replica = this.state.replicas[replicaId];
    if (!replica || replica.status !== "active") throw new PilotSafetyError("réplica não está ativa");
    const states = Object.values(replica.states);
    if (states.some((state) => !["completed", "failed"].includes(state.status))) {
      throw new PilotSafetyError("réplica ainda possui estados não terminais");
    }
    replica.status = states.some((state) => state.status === "failed")
      ? "completed-with-failures"
      : "completed";
    replica.completedAt = this.now();
    this._commit("replica_completed", { replicaId, status: replica.status, spentUsd: replica.spentUsd });
  }

  completeCampaign() {
    this._assertRunning();
    if (Object.keys(this.state.reservations).length) throw new PilotSafetyError("há chamada em voo");
    const replicas = Object.values(this.state.replicas);
    if (replicas.some((replica) => !["completed", "completed-with-failures"].includes(replica.status))) {
      throw new PilotSafetyError("campanha ainda possui réplicas não terminais");
    }
    this.state.status = replicas.some((replica) => replica.status === "completed-with-failures")
      ? "completed-with-failures"
      : "completed";
    this.state.completedAt = this.now();
    this._commit("campaign_completed", { status: this.state.status, spentUsd: this.state.totals.spentUsd });
    return this.snapshot();
  }

  pause(reason = "operator-request") {
    this._assertRunning();
    this.state.status = "paused";
    this._commit("campaign_paused", {
      reason,
      reservationsLeftForResume: Object.keys(this.state.reservations).length,
    });
    return this.snapshot();
  }
}

export function installCampaignSignalHandlers(guard, { exitProcess = false } = {}) {
  if (!(guard instanceof RealCampaignSafetyGuard)) throw new PilotSafetyError("guard inválido");
  const handlers = new Map();
  for (const signal of ["SIGINT", "SIGTERM"]) {
    const handler = () => {
      try {
        guard.pause(`signal:${signal}`);
      } finally {
        if (exitProcess) process.exit(signal === "SIGINT" ? 130 : 143);
      }
    };
    handlers.set(signal, handler);
    process.once(signal, handler);
  }
  return () => {
    for (const [signal, handler] of handlers) process.removeListener(signal, handler);
  };
}
