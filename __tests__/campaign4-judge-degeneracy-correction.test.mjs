import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { correctJudgeDegeneracy } from "../analysis/correct-campaign4-judge-degeneracy.mjs";

describe("correcao de confiabilidade degenerada do painel C4", () => {
  it("marca dimensoes constantes e preserva dimensoes com variacao", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "c4-judge-degeneracy-"));
    try {
      const { corrected } = correctJudgeDegeneracy({ outputPath: path.join(dir, "analysis.json") });
      expect(corrected.correction).toMatchObject({
        alphaDegenerateDimensions: 10,
        kappaDegeneratePairs: 33,
      });
      expect(corrected.agreement.correct_trace.correctness_coherence).toMatchObject({
        alpha: null,
        interpretation: "nao_estimavel",
        alphaDegenerate: true,
      });
      expect(corrected.agreement.hesitation_hints.non_leakage).toMatchObject({
        alpha: 0.329407,
        alphaDegenerate: false,
      });
      expect(corrected.execution.validJudgments).toBe(601);
      expect(corrected.calibration.misconceptions_remediation.error_plausibility.negativeRate).toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
