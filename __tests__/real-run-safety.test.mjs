import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  PilotBudgetExceededError,
  PilotInterruptedError,
  PilotMissingUsageError,
  PilotSafetyError,
  REAL_PILOT_CONFIRMATION,
  RealPilotSafetyGuard,
  validatePilotCallPlan,
  worstCaseCallCostUsd,
} from "../production-fidelity/real-run-safety.mjs";

const dirs = [];
const mkDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "real-pilot-safety-"));
  dirs.push(dir);
  return dir;
};
const hash = (c = "a") => c.repeat(64);
const stateIds = ["state-01", "state-02", "state-03"];

function guard(overrides = {}) {
  const allowFallback = overrides.allowFallback === true;
  const extraPlan = overrides.extraPlan || [];
  const callPlan = overrides.callPlan || [
    ...stateIds.flatMap((stateId) =>
      ["agent3a", "agent3b", "agent3c"].map((agentKey) => ({
        stateId,
        agentKey,
        model: "provider/model",
        attempt: 1,
        fallbackUsed: false,
        ...cheapPlan,
      }))
    ),
    ...extraPlan,
  ];
  const cleanOverrides = { ...overrides };
  delete cleanOverrides.extraPlan;
  return new RealPilotSafetyGuard({
    confirmation: REAL_PILOT_CONFIRMATION,
    budgetUsd: 1,
    stateIds,
    runId: `pilot-${Math.random().toString(16).slice(2)}`,
    runDir: mkDir(),
    allowFallback,
    callPlan,
    ...cleanOverrides,
  });
}

const cheapPlan = {
  inputTokenCeiling: 1000,
  outputTokenCeiling: 1000,
  inputUsdPerMillion: 1,
  outputUsdPerMillion: 9,
}; // US$ 0,01 no pior caso

function reserve(g, overrides = {}) {
  return g.reserveCall({
    stateId: "state-01",
    agentKey: "agent3a",
    model: "provider/model",
    attempt: 1,
    fallbackUsed: false,
    promptSha256: hash("a"),
    ...cheapPlan,
    ...overrides,
  });
}

function complete(g, ticket, overrides = {}) {
  return g.completeCall(ticket.id, {
    status: "ok",
    usage: { promptTokens: 100, completionTokens: 100, estimated: false },
    costUsd: 0.001,
    latencyMs: 10,
    ...overrides,
  });
}

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("confirmação e escopo obrigatório", () => {
  it("recusa confirmação ausente, orçamento ausente/acima de US$2 e plano diferente de 3 estados", () => {
    expect(() =>
      new RealPilotSafetyGuard({ budgetUsd: 1, stateIds, runId: "x", runDir: mkDir() })
    ).toThrow(/confirmação explícita/);
    expect(() =>
      new RealPilotSafetyGuard({
        confirmation: REAL_PILOT_CONFIRMATION,
        stateIds,
        runId: "x",
        runDir: mkDir(),
        callPlan: [],
      })
    ).toThrow(/budgetUsd é obrigatório/);
    expect(() => guard({ budgetUsd: 2.01 })).toThrow(/não pode exceder/);
    expect(() => guard({ stateIds: ["a", "b"] })).toThrow(/exatamente três/);
    expect(() => guard({ stateIds: ["a", "a", "b"] })).toThrow(/exatamente três/);
  });

  it("não permite reutilizar silenciosamente diretório de piloto", () => {
    const dir = mkDir();
    const args = {
      confirmation: REAL_PILOT_CONFIRMATION,
      budgetUsd: 1,
      stateIds,
      runId: "pilot-fixed",
      runDir: dir,
      callPlan: stateIds.flatMap((stateId) =>
        ["agent3a", "agent3b", "agent3c"].map((agentKey) => ({
          stateId,
          agentKey,
          model: "provider/model",
          attempt: 1,
          fallbackUsed: false,
          ...cheapPlan,
        }))
      ),
    };
    new RealPilotSafetyGuard(args);
    expect(() => new RealPilotSafetyGuard(args)).toThrow(/gasto duplicado/);
  });
});

describe("reserva antes da rede e teto total", () => {
  it("calcula reserva pelo pior caso e persiste antes de devolver o ticket", () => {
    expect(worstCaseCallCostUsd(cheapPlan)).toBe(0.01);
    const g = guard();
    g.startState("state-01");
    const ticket = reserve(g);
    expect(ticket.reservedUsd).toBe(0.01);
    const checkpoint = JSON.parse(fs.readFileSync(g.checkpointPath, "utf8"));
    expect(checkpoint.reservedUsd).toBe(0.01);
    const journal = fs.readFileSync(g.journalPath, "utf8");
    expect(journal).toContain('"type":"call_reserved"');
    expect(journal).not.toContain("prompt secreto");
  });

  it("bloqueia plano cujo pior caso não cabe antes de qualquer callback de rede", () => {
    let networkCalls = 0;
    expect(() => {
      guard({ budgetUsd: 0.089 }); // nove primárias × US$0,01 = US$0,09
      networkCalls += 1;
    }).toThrow(PilotBudgetExceededError);
    expect(networkCalls).toBe(0);
  });

  it("contabiliza usage/custo reais e libera a diferença da reserva", () => {
    const g = guard();
    g.startState("state-01");
    const ticket = reserve(g);
    const call = complete(g, ticket);
    expect(call.usage.estimated).toBe(false);
    expect(g.snapshot()).toMatchObject({ spentUsd: 0.001, reservedUsd: 0 });
    expect(fs.readFileSync(g.journalPath, "utf8")).toContain('"type":"call_completed"');
  });
});

describe("usage/custo obrigatório, fallback e interrupção", () => {
  it("usage ausente cobra reserva conservadora, aborta e impede fallback", () => {
    const g = guard({
      allowFallback: true,
      extraPlan: [{
        stateId: "state-01",
        agentKey: "agent3a",
        model: "provider/fallback",
        attempt: 2,
        fallbackUsed: true,
        ...cheapPlan,
      }],
    });
    g.startState("state-01");
    const ticket = reserve(g);
    expect(() => g.completeCall(ticket.id, { status: "error", costUsd: 0.001 })).toThrow(
      PilotMissingUsageError
    );
    expect(g.snapshot()).toMatchObject({ status: "aborted", spentUsd: 0.01, reservedUsd: 0 });
    expect(() =>
      reserve(g, { attempt: 2, fallbackUsed: true, model: "provider/fallback" })
    ).toThrow(PilotInterruptedError);
  });

  it("não aceita usage estimado", () => {
    const g = guard();
    g.startState("state-01");
    const ticket = reserve(g);
    expect(() =>
      complete(g, ticket, {
        usage: { promptTokens: 100, completionTokens: 100, estimated: true },
      })
    ).toThrow(PilotMissingUsageError);
  });

  it("fallback é desabilitado por padrão", () => {
    const g = guard();
    g.startState("state-01");
    expect(() =>
      reserve(g, { attempt: 2, fallbackUsed: true, model: "provider/fallback" })
    ).toThrow(PilotInterruptedError);
    expect(g.snapshot().status).toBe("aborted");
  });

  it("bloqueia tentativa duplicada do mesmo agente", () => {
    const g = guard();
    g.startState("state-01");
    reserve(g);
    expect(() => reserve(g)).toThrow(/reservada\/em voo/);
  });

  it("fallback habilitado exige falha contabilizada e constar do plano congelado", () => {
    const fallbackPlan = {
      stateId: "state-01",
      agentKey: "agent3a",
      model: "provider/fallback",
      attempt: 2,
      fallbackUsed: true,
      ...cheapPlan,
    };
    const g = guard({ allowFallback: true, budgetUsd: 0.2, extraPlan: [fallbackPlan] });
    g.startState("state-01");
    expect(() =>
      reserve(g, { attempt: 2, fallbackUsed: true, model: "provider/fallback" })
    ).toThrow(/tentativa anterior falha/);
    const primary = reserve(g);
    complete(g, primary, {
      status: "error",
      usage: { promptTokens: 100, completionTokens: 0, estimated: false },
      costUsd: 0.001,
    });
    const fallback = reserve(g, {
      attempt: 2,
      fallbackUsed: true,
      model: "provider/fallback",
      promptSha256: hash("b"),
    });
    expect(fallback.fallbackUsed).toBe(true);
    expect(g.snapshot().spentUsd).toBe(0.001);
    expect(g.snapshot().status).toBe("running");
  });

  it("SIGINT/abort lógico cobra reservas em voo e bloqueia qualquer continuação", () => {
    const g = guard();
    g.startState("state-01");
    reserve(g);
    const stopped = g.interrupt("signal:SIGINT");
    expect(stopped).toMatchObject({ status: "aborted", spentUsd: 0.01, reservedUsd: 0 });
    expect(() => g.startState("state-02")).toThrow(PilotInterruptedError);
    expect(fs.readFileSync(g.journalPath, "utf8")).toContain('"type":"pilot_aborted"');
  });

  it("uso/custo acima da reserva interrompe imediatamente", () => {
    const g = guard();
    g.startState("state-01");
    const ticket = reserve(g);
    expect(() =>
      complete(g, ticket, {
        usage: { promptTokens: 2000, completionTokens: 100, estimated: false },
        costUsd: 0.02,
      })
    ).toThrow(PilotBudgetExceededError);
    expect(g.snapshot().status).toBe("aborted");
  });
});

describe("conclusão controlada dos três estados", () => {
  it("não conclui estado sem 3a/3b e 3c executado ou skip real", () => {
    const g = guard();
    g.startState("state-01");
    expect(() => g.completeState("state-01")).toThrow(/agent3a/);
    expect(() => g.markAgent3cSkipped("state-01", "motivo livre")).toThrow(/production-conditional/);
  });

  it("conclui piloto somente após os três estados e todos os eventos persistidos", () => {
    const g = guard({ budgetUsd: 0.2 });
    for (const stateId of stateIds) {
      g.startState(stateId);
      for (const agentKey of ["agent3a", "agent3b"]) {
        const ticket = reserve(g, { stateId, agentKey, promptSha256: hash(agentKey === "agent3a" ? "a" : "b") });
        complete(g, ticket);
      }
      g.markAgent3cSkipped(stateId, "production-conditional-risk-sufficient");
      g.completeState(stateId);
    }
    const final = g.completePilot();
    expect(final.status).toBe("completed");
    expect(final.spentUsd).toBe(0.006);
    expect(fs.readFileSync(g.journalPath, "utf8")).toContain('"type":"pilot_completed"');
  });
});

describe("erros de plano", () => {
  it("rejeita preços/tetos ausentes em vez de assumir custo zero", () => {
    expect(() => worstCaseCallCostUsd({ inputTokenCeiling: 1, outputTokenCeiling: 1 })).toThrow(
      PilotSafetyError
    );
  });

  it("inclui 3c condicional no pior caso e rejeita fallback que faria o plano exceder", () => {
    const primaries = stateIds.flatMap((stateId) =>
      ["agent3a", "agent3b", "agent3c"].map((agentKey) => ({
        stateId,
        agentKey,
        model: "provider/model",
        attempt: 1,
        fallbackUsed: false,
        ...cheapPlan,
      }))
    );
    const fallback = {
      stateId: "state-01",
      agentKey: "agent3a",
      model: "provider/fallback",
      attempt: 2,
      fallbackUsed: true,
      ...cheapPlan,
    };
    expect(() =>
      validatePilotCallPlan({
        callPlan: [...primaries, fallback],
        stateIds,
        budgetUsd: 0.095,
        allowFallback: true,
      })
    ).toThrow(PilotBudgetExceededError);
  });

  it("documenta que os maxTokens balanced atuais não cabem em US$1, mas cabem na emenda de US$2", () => {
    const maxOutput = { agent3a: 16000, agent3b: 24000, agent3c: 16000 };
    const currentBalancedPlan = stateIds.flatMap((stateId) =>
      ["agent3a", "agent3b", "agent3c"].map((agentKey) => ({
        stateId,
        agentKey,
        model: "google/gemini-3.5-flash",
        attempt: 1,
        fallbackUsed: false,
        inputTokenCeiling: 1,
        outputTokenCeiling: maxOutput[agentKey],
        inputUsdPerMillion: 1.5,
        outputUsdPerMillion: 9,
      }))
    );
    expect(() =>
      validatePilotCallPlan({
        callPlan: currentBalancedPlan,
        stateIds,
        budgetUsd: 1,
        allowFallback: false,
      })
    ).toThrow(/pior caso US\$ 1\.512/);
    expect(
      validatePilotCallPlan({
        callPlan: currentBalancedPlan,
        stateIds,
        budgetUsd: 2,
        allowFallback: false,
      }).worstCaseUsd
    ).toBe(1.5120135);
  });
});
