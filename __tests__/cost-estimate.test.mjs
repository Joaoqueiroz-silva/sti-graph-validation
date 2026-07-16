import { describe, expect, it } from "vitest";
import { projectCampaign, summarizeCalls } from "../production-fidelity/cost-estimate.mjs";

const rows = [
  { agentKey: "agent3a_advanced", costUsd: 1, tokensIn: 100, tokensOut: 10 },
  { agentKey: "agent3a_advanced", costUsd: 3, tokensIn: 300, tokensOut: 30 },
  { agentKey: "agent3b_atrisk", costUsd: 2, tokensIn: 200, tokensOut: 20 },
  { agentKey: "agent3b_atrisk", costUsd: 4, tokensIn: 400, tokensOut: 40 },
  { agentKey: "agent3c_average", costUsd: 0.5, tokensIn: 50, tokensOut: 5 },
];

describe("estimativa offline de custo", () => {
  it("resume custos e tokens observados por agente", () => {
    const summary = summarizeCalls(rows);
    expect(summary.agent3a_advanced).toMatchObject({
      calls: 2,
      costUsd: 4,
      meanCostUsd: 2,
      meanTokensIn: 200,
    });
  });

  it("projeta todos os agentes sem realizar chamadas", () => {
    const result = projectCampaign({
      baselineRows: rows,
      exercises: 4,
      replicas: 1,
      judgeRows: [{ costUsd: 0.25 }],
      productionSeedMultiplier: 4,
      batchSize: 4,
      pilotStates: 1,
    });
    expect(result.projection.controlledOneSeedForcedAllAgentsUsd).toBe(22);
    expect(result.projection.productionBatchedFourSeedForcedAllAgentsUsd).toBe(22);
    expect(result.projection.pilotThreeStatesForcedAllAgentsUsd).toBe(22);
    expect(result.projection.upperUngroupedFourSeedForcedAllAgentsUsd).toBe(88);
    expect(result.projection.historicalThreeJudgePanelUsd).toBe(0.25);
    expect(result.networkCalls).toBe(0);
    expect(result.paidCalls).toBe(0);
  });
});
