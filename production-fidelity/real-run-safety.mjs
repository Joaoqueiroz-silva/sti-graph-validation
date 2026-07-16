/**
 * Travas fail-closed para um futuro piloto REAL de fidelidade à produção.
 *
 * Escopo deliberado: três estados, teto técnico explícito de no máximo US$ 2,00.
 * Este módulo não importa cliente LLM, não lê credenciais e não faz rede. O runner
 * real deve reservar uma tentativa AQUI antes de chamar o provedor e deve concluir
 * a tentativa AQUI antes de iniciar qualquer retry/fallback.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const REAL_PILOT_CONFIRMATION = "EXECUTAR_PILOTO_REAL_3_ESTADOS_USD_2";
export const REAL_PILOT_MAX_BUDGET_USD = 2.0;
export const REAL_PILOT_STATE_COUNT = 3;

const AGENTS = new Set(["agent3a", "agent3b", "agent3c"]);
const HASH_RE = /^[a-f0-9]{64}$/;
const EPSILON = 1e-10;

export class PilotSafetyError extends Error {
  constructor(message) {
    super(message);
    this.name = "PilotSafetyError";
  }
}

export class PilotBudgetExceededError extends PilotSafetyError {
  constructor(message, details = {}) {
    super(message);
    this.name = "PilotBudgetExceededError";
    Object.assign(this, details);
  }
}

export class PilotMissingUsageError extends PilotSafetyError {
  constructor(message, details = {}) {
    super(message);
    this.name = "PilotMissingUsageError";
    Object.assign(this, details);
  }
}

export class PilotInterruptedError extends PilotSafetyError {
  constructor(message, details = {}) {
    super(message);
    this.name = "PilotInterruptedError";
    Object.assign(this, details);
  }
}

const finiteNonNegative = (x) => Number.isFinite(x) && x >= 0;
const positiveInteger = (x) => Number.isInteger(x) && x > 0;
const roundMoneyUp = (x) => Math.ceil((x - Number.EPSILON) * 1e8) / 1e8;
const roundMoney = (x) => Math.round(x * 1e8) / 1e8;

function safeRunId(value) {
  const id = String(value || "");
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(id)) {
    throw new PilotSafetyError("runId é obrigatório e deve conter apenas caracteres seguros");
  }
  return id;
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function randomId() {
  return crypto.randomBytes(12).toString("hex");
}

function planKey({ stateId, agentKey, attempt, fallbackUsed }) {
  return `${stateId}::${agentKey}::${attempt}::${fallbackUsed === true ? "fallback" : "primary"}`;
}

/** Reserva conservadora calculada somente de tetos de tokens e preços máximos. */
export function worstCaseCallCostUsd(plan = {}) {
  const {
    inputTokenCeiling,
    outputTokenCeiling,
    inputUsdPerMillion,
    outputUsdPerMillion,
  } = plan;
  if (!positiveInteger(inputTokenCeiling) || !positiveInteger(outputTokenCeiling)) {
    throw new PilotSafetyError("tetos de tokens de entrada e saída devem ser inteiros positivos");
  }
  if (!finiteNonNegative(inputUsdPerMillion) || !finiteNonNegative(outputUsdPerMillion)) {
    throw new PilotSafetyError("preços máximos por milhão de tokens são obrigatórios");
  }
  const value =
    (inputTokenCeiling / 1e6) * inputUsdPerMillion +
    (outputTokenCeiling / 1e6) * outputUsdPerMillion;
  if (!(value > 0)) throw new PilotSafetyError("reserva calculada deve ser maior que zero");
  return roundMoneyUp(value);
}

/**
 * Congela o pior caso do piloto inteiro ANTES da primeira chamada. Inclui 3c em
 * todos os estados, pois a decisão condicional só é conhecida depois de 3a/3b.
 * Fallbacks só podem existir se explicitamente listados no plano e habilitados.
 */
export function validatePilotCallPlan({ callPlan, stateIds, budgetUsd, allowFallback = false } = {}) {
  if (!(Number.isFinite(budgetUsd) && budgetUsd > 0 && budgetUsd <= REAL_PILOT_MAX_BUDGET_USD)) {
    throw new PilotSafetyError("budgetUsd válido e de no máximo US$ 2,00 é obrigatório no callPlan");
  }
  if (!Array.isArray(callPlan) || callPlan.length === 0) {
    throw new PilotSafetyError("callPlan completo e explícito é obrigatório antes da primeira chamada");
  }
  const stateSet = new Set(stateIds || []);
  const keys = new Set();
  const normalized = callPlan.map((entry, i) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new PilotSafetyError(`callPlan[${i}] deve ser objeto`);
    }
    if (!stateSet.has(entry.stateId)) throw new PilotSafetyError(`callPlan[${i}] usa stateId fora do piloto`);
    if (!AGENTS.has(entry.agentKey)) throw new PilotSafetyError(`callPlan[${i}] usa agente inválido`);
    if (!nonEmptyString(entry.model)) throw new PilotSafetyError(`callPlan[${i}].model é obrigatório`);
    if (!positiveInteger(entry.attempt)) throw new PilotSafetyError(`callPlan[${i}].attempt é inválido`);
    const fallbackUsed = entry.fallbackUsed === true;
    if (fallbackUsed && !allowFallback) {
      throw new PilotSafetyError("callPlan contém fallback, mas allowFallback=false");
    }
    if ((!fallbackUsed && entry.attempt !== 1) || (fallbackUsed && entry.attempt !== 2)) {
      throw new PilotSafetyError("plano aceita somente primária attempt=1 e fallback attempt=2");
    }
    const key = planKey({ ...entry, fallbackUsed });
    if (keys.has(key)) throw new PilotSafetyError(`chamada duplicada no callPlan: ${key}`);
    keys.add(key);
    return {
      key,
      stateId: entry.stateId,
      agentKey: entry.agentKey,
      model: entry.model,
      attempt: entry.attempt,
      fallbackUsed,
      inputTokenCeiling: entry.inputTokenCeiling,
      outputTokenCeiling: entry.outputTokenCeiling,
      inputUsdPerMillion: entry.inputUsdPerMillion,
      outputUsdPerMillion: entry.outputUsdPerMillion,
      worstCaseUsd: worstCaseCallCostUsd(entry),
      status: "pending",
    };
  });

  for (const stateId of stateSet) {
    for (const agentKey of AGENTS) {
      const key = planKey({ stateId, agentKey, attempt: 1, fallbackUsed: false });
      if (!keys.has(key)) {
        throw new PilotSafetyError(
          `callPlan deve reservar a primária de ${agentKey} em ${stateId}; 3c entra pelo pior caso condicional`
        );
      }
    }
  }
  const worstCaseUsd = roundMoneyUp(normalized.reduce((sum, entry) => sum + entry.worstCaseUsd, 0));
  if (worstCaseUsd > budgetUsd + EPSILON) {
    throw new PilotBudgetExceededError(
      `plano completo bloqueado antes da rede: pior caso US$ ${worstCaseUsd.toFixed(8)} > orçamento US$ ${Number(budgetUsd).toFixed(8)}`,
      { worstCaseUsd, budgetUsd }
    );
  }
  return { calls: normalized, worstCaseUsd };
}

function durableAppend(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const fd = fs.openSync(file, "a", 0o600);
  try {
    fs.writeSync(fd, `${JSON.stringify(value)}\n`, null, "utf8");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function durableJsonReplace(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${randomId()}.tmp`;
  const fd = fs.openSync(tmp, "wx", 0o600);
  try {
    fs.writeSync(fd, `${JSON.stringify(value, null, 2)}\n`, null, "utf8");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
  // Persistência do rename no diretório, quando suportada pelo sistema operacional.
  try {
    const dirFd = fs.openSync(path.dirname(file), "r");
    try {
      fs.fsyncSync(dirFd);
    } finally {
      fs.closeSync(dirFd);
    }
  } catch {
    // O arquivo em si já foi fsyncado; alguns sistemas não permitem fsync em diretório.
  }
}

function publicReservation(r) {
  return {
    id: r.id,
    planKey: r.planKey,
    stateId: r.stateId,
    agentKey: r.agentKey,
    model: r.model,
    attempt: r.attempt,
    fallbackUsed: r.fallbackUsed,
    promptSha256: r.promptSha256,
    inputTokenCeiling: r.inputTokenCeiling,
    outputTokenCeiling: r.outputTokenCeiling,
    inputUsdPerMillion: r.inputUsdPerMillion,
    outputUsdPerMillion: r.outputUsdPerMillion,
    reservedUsd: r.reservedUsd,
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

/**
 * Guardião síncrono de orçamento/retencão. O sincronismo é intencional: a chamada
 * externa só pode começar depois que a reserva foi confirmada em disco.
 */
export class RealPilotSafetyGuard {
  constructor({
    confirmation,
    budgetUsd,
    stateIds,
    runId,
    runDir,
    callPlan,
    allowFallback = false,
    now = () => new Date().toISOString(),
  } = {}) {
    if (confirmation !== REAL_PILOT_CONFIRMATION) {
      throw new PilotSafetyError(
        `confirmação explícita ausente; use exatamente ${REAL_PILOT_CONFIRMATION}`
      );
    }
    if (!(Number.isFinite(budgetUsd) && budgetUsd > 0 && budgetUsd <= REAL_PILOT_MAX_BUDGET_USD)) {
      throw new PilotSafetyError("budgetUsd é obrigatório, positivo e não pode exceder US$ 2,00");
    }
    if (
      !Array.isArray(stateIds) ||
      stateIds.length !== REAL_PILOT_STATE_COUNT ||
      stateIds.some((x) => !nonEmptyString(x)) ||
      new Set(stateIds).size !== stateIds.length
    ) {
      throw new PilotSafetyError("o piloto deve declarar exatamente três stateIds únicos");
    }
    if (!nonEmptyString(runDir)) throw new PilotSafetyError("runDir explícito é obrigatório");

    this.runId = safeRunId(runId);
    this.runDir = path.resolve(runDir);
    this.journalPath = path.join(this.runDir, "calls.jsonl");
    this.checkpointPath = path.join(this.runDir, "checkpoint.json");
    this.now = now;
    this.allowFallback = allowFallback === true;

    const approvedPlan = validatePilotCallPlan({
      callPlan,
      stateIds,
      budgetUsd,
      allowFallback: this.allowFallback,
    });

    if (fs.existsSync(this.checkpointPath) || fs.existsSync(this.journalPath)) {
      throw new PilotSafetyError(
        "runDir já contém um piloto; continuação implícita é bloqueada para evitar gasto duplicado"
      );
    }

    this.state = {
      schemaVersion: "educaoff-real-pilot-safety-v1",
      runId: this.runId,
      status: "running",
      budgetUsd: roundMoney(budgetUsd),
      spentUsd: 0,
      reservedUsd: 0,
      allowFallback: this.allowFallback,
      planWorstCaseUsd: approvedPlan.worstCaseUsd,
      callPlan: approvedPlan.calls,
      stateOrder: [...stateIds],
      states: Object.fromEntries(
        stateIds.map((id) => [id, { status: "pending", calls: [], skippedAgents: {} }])
      ),
      reservations: {},
      createdAt: this.now(),
      updatedAt: this.now(),
      abortReason: null,
    };
    this.#persist("pilot_started", {
      budgetUsd: this.state.budgetUsd,
      stateIds,
      allowFallback: this.allowFallback,
      planWorstCaseUsd: approvedPlan.worstCaseUsd,
      planSha256: crypto
        .createHash("sha256")
        .update(JSON.stringify(approvedPlan.calls), "utf8")
        .digest("hex"),
    });
  }

  #event(type, details = {}) {
    return {
      schemaVersion: "educaoff-real-pilot-journal-v1",
      ts: this.now(),
      runId: this.runId,
      type,
      ...details,
    };
  }

  #persist(type, details = {}) {
    this.state.updatedAt = this.now();
    // O journal vem antes: se o checkpoint falhar, o runner recebe exceção e para,
    // mas a última intenção permanece retida para auditoria.
    durableAppend(this.journalPath, this.#event(type, details));
    durableJsonReplace(this.checkpointPath, this.state);
  }

  #assertRunning() {
    if (this.state.status !== "running") {
      throw new PilotInterruptedError(`piloto não está executável: ${this.state.status}`, {
        status: this.state.status,
        reason: this.state.abortReason,
      });
    }
  }

  #stateRecord(stateId) {
    const rec = this.state.states[stateId];
    if (!rec) throw new PilotSafetyError(`stateId fora do plano: ${stateId}`);
    return rec;
  }

  snapshot() {
    return JSON.parse(JSON.stringify(this.state));
  }

  startState(stateId) {
    this.#assertRunning();
    const rec = this.#stateRecord(stateId);
    if (rec.status !== "pending") throw new PilotSafetyError(`estado ${stateId} não está pendente`);
    const active = Object.entries(this.state.states).find(([, s]) => s.status === "active");
    if (active) throw new PilotSafetyError(`estado ${active[0]} ainda está ativo; piloto é sequencial`);
    const firstPending = this.state.stateOrder.find((id) => this.state.states[id].status === "pending");
    if (firstPending !== stateId) {
      throw new PilotSafetyError(`ordem congelada violada: próximo estado deve ser ${firstPending}`);
    }
    rec.status = "active";
    rec.startedAt = this.now();
    this.#persist("state_started", { stateId });
  }

  reserveCall({
    stateId,
    agentKey,
    model,
    attempt = 1,
    fallbackUsed = false,
    promptSha256,
    inputTokenCeiling,
    outputTokenCeiling,
    inputUsdPerMillion,
    outputUsdPerMillion,
  } = {}) {
    this.#assertRunning();
    const stateRec = this.#stateRecord(stateId);
    if (stateRec.status !== "active") throw new PilotSafetyError(`estado ${stateId} não está ativo`);
    if (!AGENTS.has(agentKey)) throw new PilotSafetyError("agentKey deve ser agent3a, agent3b ou agent3c");
    if (!nonEmptyString(model)) throw new PilotSafetyError("model é obrigatório");
    if (!positiveInteger(attempt)) throw new PilotSafetyError("attempt deve ser inteiro positivo");
    if (!HASH_RE.test(promptSha256 || "")) throw new PilotSafetyError("promptSha256 válido é obrigatório");

    const sameAgentReservations = Object.values(this.state.reservations).filter(
      (r) => r.stateId === stateId && r.agentKey === agentKey
    );
    if (sameAgentReservations.length) {
      throw new PilotSafetyError(`${agentKey} já possui tentativa reservada/em voo neste estado`);
    }
    if (stateRec.calls.some((c) => c.agentKey === agentKey && c.status === "ok")) {
      throw new PilotSafetyError(`${agentKey} já concluiu com sucesso neste estado`);
    }
    if (stateRec.calls.some((c) => c.agentKey === agentKey && c.attempt === attempt)) {
      throw new PilotSafetyError(`attempt ${attempt} de ${agentKey} já foi contabilizado`);
    }

    if (agentKey === "agent3c") {
      const prerequisiteAgentsSucceeded = ["agent3a", "agent3b"].every((required) =>
        stateRec.calls.some((c) => c.agentKey === required && c.status === "ok")
      );
      if (!prerequisiteAgentsSucceeded) {
        throw new PilotSafetyError("agent3c só pode iniciar depois de 3a e 3b concluírem");
      }
    }

    if (fallbackUsed) {
      if (!this.allowFallback) {
        this.interrupt("fallback-disabled", { stateId, agentKey, attempt });
        throw new PilotInterruptedError("fallback bloqueado para este piloto");
      }
      if (attempt !== 2) throw new PilotSafetyError("o único fallback permitido deve usar attempt=2");
      const priorError = stateRec.calls.some(
        (c) => c.agentKey === agentKey && c.status === "error" && c.attempt < attempt
      );
      if (!priorError) throw new PilotSafetyError("fallback exige tentativa anterior falha e contabilizada");
    } else if (attempt !== 1) {
      throw new PilotSafetyError("tentativa não-fallback deve usar attempt=1");
    }

    const plan = {
      inputTokenCeiling,
      outputTokenCeiling,
      inputUsdPerMillion,
      outputUsdPerMillion,
    };
    const reservedUsd = worstCaseCallCostUsd(plan);
    const requestedPlanKey = planKey({ stateId, agentKey, attempt, fallbackUsed });
    const planned = this.state.callPlan.find((entry) => entry.key === requestedPlanKey);
    const planMatches =
      planned &&
      planned.status === "pending" &&
      planned.model === model &&
      planned.inputTokenCeiling === inputTokenCeiling &&
      planned.outputTokenCeiling === outputTokenCeiling &&
      planned.inputUsdPerMillion === inputUsdPerMillion &&
      planned.outputUsdPerMillion === outputUsdPerMillion &&
      planned.worstCaseUsd === reservedUsd;
    if (!planMatches) {
      this.interrupt("unplanned-or-mutated-call", {
        stateId,
        agentKey,
        attempt,
        fallbackUsed: fallbackUsed === true,
      });
      throw new PilotInterruptedError("tentativa não consta exatamente do callPlan congelado");
    }
    const availableUsd = roundMoney(
      this.state.budgetUsd - this.state.spentUsd - this.state.reservedUsd
    );
    if (reservedUsd > availableUsd + EPSILON) {
      this.interrupt("budget-reservation-refused", {
        stateId,
        agentKey,
        attempt,
        fallbackUsed: fallbackUsed === true,
        requestedUsd: reservedUsd,
        availableUsd,
      });
      throw new PilotBudgetExceededError(
        `tentativa bloqueada antes da rede: reserva US$ ${reservedUsd.toFixed(8)} > saldo US$ ${availableUsd.toFixed(8)}`,
        { requestedUsd: reservedUsd, availableUsd }
      );
    }

    const reservation = {
      id: randomId(),
      planKey: requestedPlanKey,
      stateId,
      agentKey,
      model,
      attempt,
      fallbackUsed: fallbackUsed === true,
      promptSha256,
      ...plan,
      reservedUsd,
      createdAt: this.now(),
    };
    this.state.reservations[reservation.id] = reservation;
    planned.status = "reserved";
    planned.reservationId = reservation.id;
    this.state.reservedUsd = roundMoney(this.state.reservedUsd + reservedUsd);
    this.#persist("call_reserved", publicReservation(reservation));
    return JSON.parse(JSON.stringify(publicReservation(reservation)));
  }

  completeCall(reservationId, { status = "ok", usage, costUsd, latencyMs = null } = {}) {
    this.#assertRunning();
    const reservation = this.state.reservations[reservationId];
    if (!reservation) throw new PilotSafetyError("reserva inexistente ou já concluída");
    if (status !== "ok" && status !== "error") throw new PilotSafetyError("status deve ser ok ou error");

    const usageOk = validateUsage(usage);
    const costOk = finiteNonNegative(costUsd);
    if (!usageOk || !costOk) {
      // Se a resposta não permite contabilização exata, consome-se conservadoramente
      // toda a reserva e o piloto termina. Nunca há retry/fallback nessa condição.
      delete this.state.reservations[reservationId];
      this.state.reservedUsd = roundMoney(this.state.reservedUsd - reservation.reservedUsd);
      this.state.spentUsd = roundMoney(this.state.spentUsd + reservation.reservedUsd);
      const stateRec = this.#stateRecord(reservation.stateId);
      const planned = this.state.callPlan.find((entry) => entry.key === reservation.planKey);
      if (planned) {
        planned.status = "invalid";
        planned.reservationId = null;
      }
      stateRec.calls.push({
        ...publicReservation(reservation),
        status: "invalid-missing-usage-or-cost",
        usage: usageOk ? usage : null,
        costUsd: costOk ? costUsd : null,
        chargedConservativelyUsd: reservation.reservedUsd,
      });
      this.#persist("call_invalid_charged_conservatively", {
        ...publicReservation(reservation),
        usagePresent: usageOk,
        costPresent: costOk,
        chargedConservativelyUsd: reservation.reservedUsd,
      });
      this.interrupt("missing-exact-usage-or-cost", {
        stateId: reservation.stateId,
        agentKey: reservation.agentKey,
      });
      throw new PilotMissingUsageError(
        "usage real e costUsd real são obrigatórios; reserva integral contabilizada e piloto interrompido",
        { reservationId }
      );
    }

    const exceedsDeclaredCeiling =
      usage.promptTokens > reservation.inputTokenCeiling ||
      usage.completionTokens > reservation.outputTokenCeiling ||
      costUsd > reservation.reservedUsd + EPSILON;

    delete this.state.reservations[reservationId];
    this.state.reservedUsd = roundMoney(this.state.reservedUsd - reservation.reservedUsd);
    this.state.spentUsd = roundMoney(this.state.spentUsd + costUsd);
    const stateRec = this.#stateRecord(reservation.stateId);
    const planned = this.state.callPlan.find((entry) => entry.key === reservation.planKey);
    if (planned) {
      planned.status = status === "ok" ? "completed" : "error";
      planned.reservationId = null;
    }
    const call = {
      ...publicReservation(reservation),
      status,
      usage: {
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        estimated: false,
      },
      costUsd: roundMoney(costUsd),
      latencyMs: finiteNonNegative(latencyMs) ? latencyMs : null,
      completedAt: this.now(),
    };
    stateRec.calls.push(call);
    this.#persist("call_completed", call);

    if (exceedsDeclaredCeiling || this.state.spentUsd > this.state.budgetUsd + EPSILON) {
      this.interrupt("provider-cost-or-usage-exceeded-reservation", {
        stateId: reservation.stateId,
        agentKey: reservation.agentKey,
        reservationUsd: reservation.reservedUsd,
        costUsd,
      });
      throw new PilotBudgetExceededError(
        "provedor reportou uso/custo acima do teto reservado; piloto interrompido",
        { reservationId, costUsd, reservedUsd: reservation.reservedUsd }
      );
    }

    if (status === "error" && !this.allowFallback) {
      this.interrupt("primary-call-failed-fallback-disabled", {
        stateId: reservation.stateId,
        agentKey: reservation.agentKey,
      });
      throw new PilotInterruptedError("chamada primária falhou e fallback está desabilitado");
    }
    return JSON.parse(JSON.stringify(call));
  }

  markAgent3cSkipped(stateId, reason) {
    this.#assertRunning();
    const rec = this.#stateRecord(stateId);
    if (rec.status !== "active") throw new PilotSafetyError(`estado ${stateId} não está ativo`);
    if (!nonEmptyString(reason) || !reason.startsWith("production-conditional-")) {
      throw new PilotSafetyError("skip do 3c exige motivo da política production-conditional-*");
    }
    const prerequisiteAgentsSucceeded = ["agent3a", "agent3b"].every((required) =>
      rec.calls.some((c) => c.agentKey === required && c.status === "ok")
    );
    if (!prerequisiteAgentsSucceeded) {
      throw new PilotSafetyError("skip condicional do 3c exige 3a e 3b contabilizados");
    }
    const has3cCall = rec.calls.some((c) => c.agentKey === "agent3c");
    if (has3cCall) throw new PilotSafetyError("agent3c já possui tentativa registrada");
    rec.skippedAgents.agent3c = reason;
    const primaryPlan = this.state.callPlan.find(
      (entry) =>
        entry.stateId === stateId &&
        entry.agentKey === "agent3c" &&
        entry.attempt === 1 &&
        entry.fallbackUsed === false
    );
    if (primaryPlan) primaryPlan.status = "skipped-conditional";
    this.#persist("agent_skipped", { stateId, agentKey: "agent3c", reason });
  }

  completeState(stateId) {
    this.#assertRunning();
    const rec = this.#stateRecord(stateId);
    if (rec.status !== "active") throw new PilotSafetyError(`estado ${stateId} não está ativo`);
    const reservations = Object.values(this.state.reservations).filter((r) => r.stateId === stateId);
    if (reservations.length) throw new PilotSafetyError("estado possui chamada ainda reservada/em voo");
    for (const agentKey of ["agent3a", "agent3b"]) {
      if (!rec.calls.some((c) => c.agentKey === agentKey && c.status === "ok")) {
        throw new PilotSafetyError(`estado não possui sucesso obrigatório de ${agentKey}`);
      }
    }
    const agent3cDone = rec.calls.some((c) => c.agentKey === "agent3c" && c.status === "ok");
    if (!agent3cDone && !rec.skippedAgents.agent3c) {
      throw new PilotSafetyError("agent3c deve concluir ou ser pulado pela política real");
    }
    rec.status = "completed";
    rec.completedAt = this.now();
    this.#persist("state_completed", { stateId });
  }

  completePilot() {
    this.#assertRunning();
    if (Object.keys(this.state.reservations).length) {
      throw new PilotSafetyError("há chamadas reservadas/em voo");
    }
    if (Object.values(this.state.states).some((s) => s.status !== "completed")) {
      throw new PilotSafetyError("os três estados precisam estar concluídos");
    }
    if (this.state.spentUsd > this.state.budgetUsd + EPSILON) {
      throw new PilotBudgetExceededError("gasto final ultrapassou o orçamento");
    }
    this.state.status = "completed";
    this.#persist("pilot_completed", { spentUsd: this.state.spentUsd });
    return this.snapshot();
  }

  /**
   * Interrompe de forma durável. Reservas em voo são cobradas pelo pior caso,
   * pois o cliente pode ter enviado a requisição sem receber usage de volta.
   */
  interrupt(reason, details = {}) {
    if (this.state.status !== "running") return this.snapshot();
    const inFlight = Object.values(this.state.reservations);
    for (const reservation of inFlight) {
      const stateRec = this.#stateRecord(reservation.stateId);
      stateRec.calls.push({
        ...publicReservation(reservation),
        status: "interrupted-unknown-usage",
        chargedConservativelyUsd: reservation.reservedUsd,
      });
      this.state.spentUsd = roundMoney(this.state.spentUsd + reservation.reservedUsd);
      const planned = this.state.callPlan.find((entry) => entry.key === reservation.planKey);
      if (planned) {
        planned.status = "interrupted";
        planned.reservationId = null;
      }
    }
    this.state.reservations = {};
    this.state.reservedUsd = 0;
    this.state.status = "aborted";
    this.state.abortReason = String(reason || "interrupted");
    this.#persist("pilot_aborted", {
      reason: this.state.abortReason,
      inFlightChargedConservatively: inFlight.map(publicReservation),
      spentUsd: this.state.spentUsd,
      ...details,
    });
    return this.snapshot();
  }
}

/** Instala handlers que persistem a interrupção antes de devolver controle ao processo. */
export function installPilotSignalHandlers(guard, { exitProcess = false } = {}) {
  if (!(guard instanceof RealPilotSafetyGuard)) {
    throw new PilotSafetyError("guard inválido para handlers de sinal");
  }
  const handlers = new Map();
  for (const signal of ["SIGINT", "SIGTERM"]) {
    const handler = () => {
      try {
        guard.interrupt(`signal:${signal}`);
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
