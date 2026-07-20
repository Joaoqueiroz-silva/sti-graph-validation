import { afterEach, describe, expect, it, vi } from "vitest";
import { checkCampaign4Aggregate } from "../analysis/aggregate-campaign4.mjs";
import { checkBatchClusterSensitivity } from "../analysis/campaign4-batch-cluster-sensitivity.mjs";
import { checkCampaign4CompletionManifest } from "../analysis/build-campaign4-completion-manifest.mjs";
import { checkJudgeDegeneracy } from "../analysis/correct-campaign4-judge-degeneracy.mjs";
import { reanalyzeCampaign4Public } from "../analysis/reanalyze-campaign4-public.mjs";

afterEach(() => vi.unstubAllEnvs());

describe("checks byte a byte dos derivados C4", () => {
  // timeout explícito: os 5 checks recomputam bootstraps e manifestos inteiros e
  // passam de 5 s (default do vitest) em hardware modesto (falso negativo de
  // reprodução observado no teste ácido de 2026-07-20).
  it("ignora SOURCE_DATE_EPOCH externo e reproduz todos os canônicos", { timeout: 120000 }, () => {
    vi.stubEnv("SOURCE_DATE_EPOCH", "0");
    expect(reanalyzeCampaign4Public()).toMatchObject({ status: "ok", groups: 6 });
    expect(checkCampaign4Aggregate()).toMatchObject({ status: "ok", mode: "check" });
    expect(checkBatchClusterSensitivity()).toMatchObject({ status: "ok", mode: "check" });
    expect(checkJudgeDegeneracy()).toMatchObject({ status: "ok", mode: "check" });
    expect(checkCampaign4CompletionManifest()).toMatchObject({ status: "ok", mode: "check" });
  });
});
