import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { batchClusterSensitivity } from "../analysis/campaign4-batch-cluster-sensitivity.mjs";

describe("sensibilidade C4 por cluster de batch", () => {
  it("preserva as medias e amplia a incerteza onde a chamada compartilhada importa", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "c4-batch-sensitivity-"));
    try {
      const { output } = batchClusterSensitivity({ outputPath: path.join(dir, "result.json") });
      expect(output.design).toMatchObject({ exercises: 24, batches: 6, exercisesPerBatch: 4 });
      expect(output.metrics.agent3aFinalAnswerExactConcreteMatchItt).toMatchObject({
        mean: 0.111,
        ci95PercentileBatchClusterBootstrap: { lower: 0, upper: 0.333, clusters: 6 },
      });
      expect(output.metrics.agent3bExactConcreteRecallByUniqueValueItt).toMatchObject({
        mean: 0.176,
        ci95PercentileBatchClusterBootstrap: { lower: 0.117, upper: 0.244, clusters: 6 },
      });
      expect(output.metrics.agent3cStrictProblemSuccessItt).toMatchObject({
        mean: 0.278,
        ci95PercentileBatchClusterBootstrap: { lower: 0.153, upper: 0.444, clusters: 6 },
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
