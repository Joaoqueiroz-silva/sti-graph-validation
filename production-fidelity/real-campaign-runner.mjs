/**
 * Orquestrador injetável e sem cliente de rede da campanha 6 × 3.
 *
 * `adapter.invoke()` é fornecido externamente. Os testes usam adapter local; este
 * arquivo não importa OpenAI/OpenRouter nem lê credenciais. A ordem é serial para
 * tornar cada reserva/recibo recuperável sem depender de idempotência do provedor.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  FULL_CAMPAIGN_LIMITS,
  RealCampaignSafetyGuard,
} from "./real-campaign-safety.mjs";

const AGENT_ORDER = Object.freeze(["agent3a", "agent3b", "agent3c"]);
const sha256 = (value) =>
  crypto.createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");

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
}

export function buildFullCampaignCallPlan({ stateIds, replicaIds }) {
  return replicaIds.flatMap((replicaId) =>
    stateIds.flatMap((stateId) =>
      AGENT_ORDER.map((agentKey) => {
        const agent = FULL_CAMPAIGN_LIMITS.agents[agentKey];
        return {
          replicaId,
          stateId,
          agentKey,
          model: agent.model,
          attempt: 1,
          fallbackUsed: false,
          inputTokenCeiling: FULL_CAMPAIGN_LIMITS.inputTokenCeiling,
          outputTokenCeiling: agent.outputTokenCeiling,
          inputUsdPerMillion: FULL_CAMPAIGN_LIMITS.inputUsdPerMillion,
          outputUsdPerMillion: FULL_CAMPAIGN_LIMITS.outputUsdPerMillion,
        };
      })
    )
  );
}

export function createFullCampaignGuard({ runId, runDir, stateIds, replicaIds, confirmation } = {}) {
  const callPlan = buildFullCampaignCallPlan({ stateIds, replicaIds });
  return new RealCampaignSafetyGuard({
    // Sem default: autorização precisa chegar explicitamente do invocador/CLI.
    confirmation,
    runId,
    runDir,
    stateIds,
    replicaIds,
    callPlan,
    stateBudgetUsd: FULL_CAMPAIGN_LIMITS.stateBudgetUsd,
    replicaBudgetUsd: FULL_CAMPAIGN_LIMITS.replicaBudgetUsd,
    campaignBudgetUsd: FULL_CAMPAIGN_LIMITS.campaignBudgetUsd,
  });
}

/** Recibo gravado antes de completeCall; permite retomada sem reinvocar o provedor. */
export function writeDurableCallReceipt({ guard, ticket, result }) {
  if (!(guard instanceof RealCampaignSafetyGuard)) throw new Error("guard inválido");
  if (typeof result?.rawResponse !== "string" || result.rawResponse.trim() === "") {
    throw new Error("rawResponse real e não vazia é obrigatória no recibo");
  }
  const rawResponse = result.rawResponse;
  const status = result.status || "ok";
  if (status !== "ok" && status !== "error") throw new Error("status do recibo deve ser ok ou error");
  const receipt = {
    schemaVersion: "educaoff-real-campaign-call-receipt-v1",
    reservationId: ticket.id,
    callKey: ticket.callKey,
    promptSha256: ticket.promptSha256,
    status,
    usage: result.usage,
    costUsd: result.costUsd,
    latencyMs: result.latencyMs ?? null,
    outputSha256: sha256(rawResponse),
    rawResponse,
    writtenAt: new Date().toISOString(),
  };
  const receiptPath = path.join(guard.receiptDir, `${ticket.id}.json`);
  durableJson(receiptPath, receipt);
  return receipt;
}

function activeReplicaId(snapshot) {
  return snapshot.replicaOrder.find((id) => snapshot.replicas[id].status === "active") || null;
}

function nextReplicaId(snapshot) {
  return snapshot.replicaOrder.find((id) => snapshot.replicas[id].status === "pending") || null;
}

function activeStateId(snapshot, replicaId) {
  return snapshot.stateOrder.find(
    (id) => snapshot.replicas[replicaId].states[id].status === "active"
  ) || null;
}

function nextStateId(snapshot, replicaId) {
  return snapshot.stateOrder.find(
    (id) => snapshot.replicas[replicaId].states[id].status === "pending"
  ) || null;
}

/**
 * Executa/retoma somente trabalho ainda pendente. Um adapter deve devolver:
 * {status, usage real, costUsd real, rawResponse, latencyMs}. Nenhum retry é feito.
 */
export async function runFullCampaignWithAdapter({ guard, adapter, promptFactory }) {
  if (!(guard instanceof RealCampaignSafetyGuard)) throw new Error("guard inválido");
  if (!adapter || typeof adapter.invoke !== "function") throw new Error("adapter.invoke é obrigatório");
  if (typeof promptFactory !== "function") throw new Error("promptFactory é obrigatório");

  while (true) {
    let snapshot = guard.snapshot();
    if (["completed", "completed-with-failures"].includes(snapshot.status)) return snapshot;
    if (snapshot.status !== "running") throw new Error(`campanha não executável: ${snapshot.status}`);

    let replicaId = activeReplicaId(snapshot);
    if (!replicaId) {
      replicaId = nextReplicaId(snapshot);
      if (!replicaId) return guard.completeCampaign();
      guard.startReplica(replicaId);
      snapshot = guard.snapshot();
    }

    let stateId = activeStateId(snapshot, replicaId);
    if (!stateId) {
      stateId = nextStateId(snapshot, replicaId);
      if (!stateId) {
        guard.completeReplica(replicaId);
        continue;
      }
      guard.startState(replicaId, stateId);
      snapshot = guard.snapshot();
    }

    const stateRecord = snapshot.replicas[replicaId].states[stateId];
    if (stateRecord.status === "failed") continue;
    const nextPlan = snapshot.plan.calls.find(
      (entry) =>
        entry.replicaId === replicaId &&
        entry.stateId === stateId &&
        entry.status === "pending"
    );
    if (!nextPlan) {
      guard.completeState(replicaId, stateId);
      continue;
    }

    const prompts = await promptFactory({ replicaId, stateId, agentKey: nextPlan.agentKey });
    const systemPrompt = String(prompts?.systemPrompt ?? "");
    const userPrompt = String(prompts?.userPrompt ?? "");
    if (!systemPrompt.trim() || !userPrompt.trim()) {
      throw new Error("systemPrompt e userPrompt não vazios são obrigatórios");
    }
    const promptSha256 = sha256(`${systemPrompt}\n\u0000\n${userPrompt}`);
    const ticket = guard.reserveCall({
      replicaId,
      stateId,
      agentKey: nextPlan.agentKey,
      promptSha256,
      model: nextPlan.model,
      attempt: 1,
      fallbackUsed: false,
      inputTokenCeiling: nextPlan.inputTokenCeiling,
      outputTokenCeiling: nextPlan.outputTokenCeiling,
      inputUsdPerMillion: nextPlan.inputUsdPerMillion,
      outputUsdPerMillion: nextPlan.outputUsdPerMillion,
    });

    let result;
    try {
      result = await adapter.invoke({
        replicaId,
        stateId,
        agentKey: nextPlan.agentKey,
        systemPrompt,
        userPrompt,
        ticket,
      });
    } catch (error) {
      guard.pause(`adapter-threw:${error.message}`);
      throw error;
    }
    try {
      const receipt = writeDurableCallReceipt({ guard, ticket, result });
      guard.completeCall(ticket.id, receipt);
    } catch (error) {
      if (guard.snapshot().status === "running") guard.pause(`receipt-or-accounting-error:${error.message}`);
      throw error;
    }
  }
}
