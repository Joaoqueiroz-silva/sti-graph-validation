import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { aggregateCampaign4 } from "../analysis/aggregate-campaign4.mjs";

describe("consolidacao final da Campanha 4", () => {
  it("reconcilia desenho, chamadas, custo, falha ITT e transporte", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "c4-final-"));
    try {
      const outputPath = path.join(dir, "analysis.json");
      const { aggregate } = aggregateCampaign4({ outputPath });

      expect(aggregate.design).toMatchObject({
        exercises: 24,
        replicas: 3,
        stateReplicaUnitsPlanned: 18,
        stateReplicaUnitsCompleted: 17,
        exerciseReplicaUnitsPlannedPerAgent: 72,
        exerciseReplicaUnitsObservedPerAgent: 68,
      });
      expect(aggregate.execution.providerResponses).toBe(53);
      expect(aggregate.execution.total.accountedCostUsd).toBe(1.9539885);
      expect(aggregate.execution.total.retries).toBe(0);
      expect(aggregate.execution.graphForgeDeterminism.rate).toBe(1);
      expect(aggregate.failedUnit).toMatchObject({
        replica: 3,
        stateId: "campaign4-ctat-batch-03",
        parserFailureAgent: "agent3b",
        retry: false,
        imputation: false,
      });

      expect(aggregate.directMetrics.agent3a.exactConcreteOrderedRecallItt.mean).toBe(0);
      expect(aggregate.directMetrics.agent3b.ctatStateSaiEstimable).toBe(false);
      expect(
        aggregate.directMetrics.agent3cCapacityArm.fourLevelCompletenessConditional.mean
      ).toBe(1);
      expect(aggregate.transport.capacityArm.agent3a.rawToConfigFields.action.rate).toBe(
        aggregate.transport.capacityArm.agent3a.exactItemPreservationRateRawToConfig
      );
      expect(aggregate.transport.operationalArm.agent3c.configHintItems).toBe(0);
      expect(aggregate.transport.capacityArm.agent3c.configHintItems).toBeGreaterThan(0);
      expect(fs.existsSync(outputPath)).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
