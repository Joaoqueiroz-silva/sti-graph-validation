import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  FULL_CAMPAIGN_LIMITS,
  REAL_CAMPAIGN_CONFIRMATION,
  REAL_CAMPAIGN_RESUME_CONFIRMATION,
  RealCampaignSafetyGuard,
  validateFullCampaignPlan,
} from "../production-fidelity/real-campaign-safety.mjs";
import {
  buildFullCampaignCallPlan,
  createFullCampaignGuard,
  runFullCampaignWithAdapter,
  writeDurableCallReceipt,
} from "../production-fidelity/real-campaign-runner.mjs";
import { PilotBudgetExceededError, PilotSafetyError } from "../production-fidelity/real-run-safety.mjs";

const dirs = [];
const tempDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "real-campaign-"));
  dirs.push(dir);
  return dir;
};
const stateIds = ["s1", "s2", "s3", "s4", "s5", "s6"];
const replicaIds = ["r1", "r2", "r3"];
const promptHash = "a".repeat(64);

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function makeGuard(overrides = {}) {
  const runDir = overrides.runDir || tempDir();
  return createFullCampaignGuard({
    runId: overrides.runId || `c4-${Math.random().toString(16).slice(2)}`,
    runDir,
    stateIds,
    replicaIds,
    confirmation: REAL_CAMPAIGN_CONFIRMATION,
  });
}

function reserve(g, overrides = {}) {
  const agentKey = overrides.agentKey || "agent3a";
  const config = FULL_CAMPAIGN_LIMITS.agents[agentKey];
  return g.reserveCall({
    replicaId: overrides.replicaId || "r1",
    stateId: overrides.stateId || "s1",
    agentKey,
    promptSha256: overrides.promptSha256 || promptHash,
    model: config.model,
    attempt: 1,
    fallbackUsed: false,
    inputTokenCeiling: FULL_CAMPAIGN_LIMITS.inputTokenCeiling,
    outputTokenCeiling: config.outputTokenCeiling,
    inputUsdPerMillion: FULL_CAMPAIGN_LIMITS.inputUsdPerMillion,
    outputUsdPerMillion: FULL_CAMPAIGN_LIMITS.outputUsdPerMillion,
  });
}

const success = (rawResponse = "{}") => ({
  status: "ok",
  usage: { promptTokens: 100, completionTokens: 100, estimated: false },
  costUsd: 0.00105,
  latencyMs: 5,
  rawResponse,
});

describe("plano e limites técnicos da campanha", () => {
  it("congela 54 chamadas e os piores casos 0,594 / 3,564 / 10,692", () => {
    const plan = buildFullCampaignCallPlan({ stateIds, replicaIds });
    const approved = validateFullCampaignPlan({ callPlan: plan, stateIds, replicaIds });
    expect(plan).toHaveLength(54);
    expect(approved.perStateWorstCaseUsd["r1::s1"]).toBe(0.594);
    expect(approved.perReplicaWorstCaseUsd.r1).toBe(3.564);
    expect(approved.campaignWorstCaseUsd).toBe(10.692);
    expect(FULL_CAMPAIGN_LIMITS.campaignBudgetUsd).toBe(10.8);
    expect(FULL_CAMPAIGN_LIMITS.maxConcurrentCalls).toBe(1);
  });

  it("rejeita teto de campanha/replica insuficiente e qualquer fallback", () => {
    const plan = buildFullCampaignCallPlan({ stateIds, replicaIds });
    expect(() =>
      validateFullCampaignPlan({ callPlan: plan, stateIds, replicaIds, campaignBudgetUsd: 10 })
    ).toThrow(PilotBudgetExceededError);
    expect(() =>
      validateFullCampaignPlan({ callPlan: plan, stateIds, replicaIds, replicaBudgetUsd: 3.5 })
    ).toThrow(PilotBudgetExceededError);
    plan[0].fallbackUsed = true;
    plan[0].attempt = 2;
    expect(() => validateFullCampaignPlan({ callPlan: plan, stateIds, replicaIds })).toThrow(/fallback/);
  });

  it("mantém o piloto separado: confirmação da campanha não serve no guardião do piloto", async () => {
    const pilot = await import("../production-fidelity/real-run-safety.mjs");
    expect(pilot.REAL_PILOT_MAX_BUDGET_USD).toBe(2);
    expect(pilot.REAL_PILOT_STATE_COUNT).toBe(3);
    expect(pilot.REAL_PILOT_CONFIRMATION).not.toBe(REAL_CAMPAIGN_CONFIRMATION);
  });
});

describe("reservas hierárquicas e journal", () => {
  it("persiste reserva antes da chamada e impede concorrência maior que 1", () => {
    const g = makeGuard();
    g.startReplica("r1");
    g.startState("r1", "s1");
    const ticket = reserve(g);
    expect(ticket.reservedUsd).toBe(0.174);
    expect(() => reserve(g, { agentKey: "agent3b" })).toThrow(/uma chamada em voo/);
    const journal = fs.readFileSync(g.journalPath, "utf8");
    expect(journal).toContain('"type":"call_reserved"');
    expect(g.snapshot().totals.reservedUsd).toBe(0.174);
  });

  it("falha fechada se config divergir do plano", () => {
    const g = makeGuard();
    g.startReplica("r1");
    g.startState("r1", "s1");
    expect(() =>
      g.reserveCall({
        replicaId: "r1",
        stateId: "s1",
        agentKey: "agent3a",
        promptSha256: promptHash,
        model: "outro/modelo",
        attempt: 1,
        fallbackUsed: false,
        inputTokenCeiling: 20_000,
        outputTokenCeiling: 16_000,
        inputUsdPerMillion: 1.5,
        outputUsdPerMillion: 9,
      })
    ).toThrow(/divergiu/);
    expect(g.snapshot().status).toBe("aborted");
  });
});

describe("retomada sem duplicar cobrança", () => {
  it("recupera recibo durável e não invoca adapter novamente", async () => {
    const runDir = tempDir();
    const runId = "resume-with-receipt";
    const g = makeGuard({ runDir, runId });
    g.startReplica("r1");
    g.startState("r1", "s1");
    const ticket = reserve(g);
    writeDurableCallReceipt({ guard: g, ticket, result: success("resposta-retida") });
    g.pause("simulated-crash-after-receipt");

    const planHash = g.snapshot().plan.planSha256;
    const resumed = RealCampaignSafetyGuard.resume({
      confirmation: REAL_CAMPAIGN_RESUME_CONFIRMATION,
      runId,
      runDir,
      expectedPlanSha256: planHash,
    });
    const calls = resumed.snapshot().replicas.r1.states.s1.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ agentKey: "agent3a", status: "ok", costUsd: 0.00105 });
    expect(resumed.snapshot().reservations).toEqual({});
    expect(resumed.snapshot().totals.spentUsd).toBe(0.00105);
  });

  it("sem recibo cobra o pior caso uma vez, falha o estado e nunca libera reexecução", () => {
    const runDir = tempDir();
    const runId = "resume-without-receipt";
    const g = makeGuard({ runDir, runId });
    g.startReplica("r1");
    g.startState("r1", "s1");
    reserve(g);
    g.pause("simulated-power-loss");
    const planHash = g.snapshot().plan.planSha256;
    const resumed = RealCampaignSafetyGuard.resume({
      confirmation: REAL_CAMPAIGN_RESUME_CONFIRMATION,
      runId,
      runDir,
      expectedPlanSha256: planHash,
    });
    const snapshot = resumed.snapshot();
    expect(snapshot.replicas.r1.states.s1.status).toBe("failed");
    expect(snapshot.replicas.r1.states.s1.calls[0].status).toBe("unknown-charged-no-retry");
    expect(snapshot.totals.spentUsd).toBe(0.174);
    expect(() => reserve(resumed)).toThrow(/já contabilizada|não está ativo|repetida/);
  });

  it("rejeita plan hash divergente e adulteração do journal", () => {
    const runDir = tempDir();
    const runId = "resume-integrity";
    const g = makeGuard({ runDir, runId });
    g.pause("clean-stop");
    expect(() =>
      RealCampaignSafetyGuard.resume({
        confirmation: REAL_CAMPAIGN_RESUME_CONFIRMATION,
        runId,
        runDir,
        expectedPlanSha256: "0".repeat(64),
      })
    ).toThrow(/planSha256/);

    const lines = fs.readFileSync(g.journalPath, "utf8").trim().split("\n");
    const last = JSON.parse(lines.at(-1));
    last.details.reason = "adulterado";
    lines[lines.length - 1] = JSON.stringify(last);
    fs.writeFileSync(g.journalPath, `${lines.join("\n")}\n`);
    expect(() =>
      RealCampaignSafetyGuard.resume({
        confirmation: REAL_CAMPAIGN_RESUME_CONFIRMATION,
        runId,
        runDir,
        expectedPlanSha256: g.snapshot().plan.planSha256,
      })
    ).toThrow(/hash do journal/);
  });

  it("journal é fonte de verdade: repara checkpoint adulterado e ignora cauda parcial", () => {
    const runDir = tempDir();
    const runId = "resume-repairs-checkpoint";
    const g = makeGuard({ runDir, runId });
    g.pause("clean-stop");
    const planHash = g.snapshot().plan.planSha256;
    fs.writeFileSync(g.checkpointPath, JSON.stringify({ adulterado: true }));
    fs.appendFileSync(g.journalPath, '{"registro":"parcial"');
    const resumed = RealCampaignSafetyGuard.resume({
      confirmation: REAL_CAMPAIGN_RESUME_CONFIRMATION,
      runId,
      runDir,
      expectedPlanSha256: planHash,
    });
    expect(resumed.snapshot().status).toBe("running");
    const repaired = JSON.parse(fs.readFileSync(g.checkpointPath, "utf8"));
    expect(repaired.runId).toBe(runId);
    expect(repaired.adulterado).toBeUndefined();
  });

  it("recibo adulterado bloqueia retomada em vez de confiar no output", () => {
    const runDir = tempDir();
    const runId = "resume-receipt-tamper";
    const g = makeGuard({ runDir, runId });
    g.startReplica("r1");
    g.startState("r1", "s1");
    const ticket = reserve(g);
    const receipt = writeDurableCallReceipt({ guard: g, ticket, result: success("original") });
    receipt.rawResponse = "alterado";
    fs.writeFileSync(path.join(g.receiptDir, `${ticket.id}.json`), JSON.stringify(receipt));
    g.pause("stop");
    expect(() =>
      RealCampaignSafetyGuard.resume({
        confirmation: REAL_CAMPAIGN_RESUME_CONFIRMATION,
        runId,
        runDir,
        expectedPlanSha256: g.snapshot().plan.planSha256,
      })
    ).toThrow(/recibo diverge/);
  });
});

describe("runner injetável offline", () => {
  it("conclui 6×3, exatamente 54 chamadas, com checkpoints e sem retry", async () => {
    const g = makeGuard({ runId: "offline-full" });
    let calls = 0;
    const adapter = {
      invoke: async ({ replicaId, stateId, agentKey }) => {
        calls += 1;
        return success(`${replicaId}/${stateId}/${agentKey}`);
      },
    };
    const result = await runFullCampaignWithAdapter({
      guard: g,
      adapter,
      promptFactory: ({ replicaId, stateId, agentKey }) => ({
        systemPrompt: `system:${agentKey}`,
        userPrompt: `user:${replicaId}:${stateId}`,
      }),
    });
    expect(calls).toBe(54);
    expect(result.status).toBe("completed");
    expect(result.totals.spentUsd).toBeCloseTo(54 * 0.00105, 8);
    expect(result.resumeCount).toBe(0);
    expect(fs.existsSync(g.checkpointPath)).toBe(true);
    expect(fs.readdirSync(g.receiptDir)).toHaveLength(54);
  }, 20_000);

  it("adapter que falha pausa com uma reserva; retomada não chama novamente aquela unidade", async () => {
    const runDir = tempDir();
    const runId = "offline-crash";
    const g = makeGuard({ runDir, runId });
    let firstCalls = 0;
    await expect(
      runFullCampaignWithAdapter({
        guard: g,
        adapter: {
          invoke: async () => {
            firstCalls += 1;
            throw new Error("crash simulado");
          },
        },
        promptFactory: () => ({ systemPrompt: "s", userPrompt: "u" }),
      })
    ).rejects.toThrow(/crash simulado/);
    expect(firstCalls).toBe(1);
    const resumed = RealCampaignSafetyGuard.resume({
      confirmation: REAL_CAMPAIGN_RESUME_CONFIRMATION,
      runId,
      runDir,
      expectedPlanSha256: g.snapshot().plan.planSha256,
    });
    let resumedCalls = 0;
    const result = await runFullCampaignWithAdapter({
      guard: resumed,
      adapter: {
        invoke: async () => {
          resumedCalls += 1;
          return success("ok");
        },
      },
      promptFactory: () => ({ systemPrompt: "s", userPrompt: "u" }),
    });
    expect(result.status).toBe("completed-with-failures");
    expect(resumedCalls).toBe(51); // duas chamadas restantes do estado falho também são puladas
    expect(result.replicas.r1.states.s1.status).toBe("failed");
  }, 20_000);
});

describe("validação básica", () => {
  it("exige confirmação própria e ids 6×3", () => {
    const callPlan = buildFullCampaignCallPlan({ stateIds, replicaIds });
    expect(() =>
      new RealCampaignSafetyGuard({
        confirmation: "errada",
        runId: "x",
        runDir: tempDir(),
        stateIds,
        replicaIds,
        callPlan,
      })
    ).toThrow(PilotSafetyError);
    expect(() =>
      createFullCampaignGuard({
        runId: "sem-confirmacao",
        runDir: tempDir(),
        stateIds,
        replicaIds,
      })
    ).toThrow(/confirmação/);
    expect(() =>
      validateFullCampaignPlan({ callPlan, stateIds: stateIds.slice(0, 5), replicaIds })
    ).toThrow(/seis|6 ids|exatamente 6/);
  });
});
