import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildCampaign4CompletionManifest,
  loadCampaign4CompletionInputs,
  validateCampaign4CompletionInputs,
} from "../analysis/build-campaign4-completion-manifest.mjs";

describe("manifesto de conclusão da Campanha 4", () => {
  it("vincula exatamente plano, brutos, métricas, fixtures e três réplicas", () => {
    const inputs = loadCampaign4CompletionInputs();
    expect(validateCampaign4CompletionInputs(inputs).exerciseIds).toHaveLength(24);
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "c4-completion-"));
    try {
      const { manifest } = buildCampaign4CompletionManifest({
        inputs,
        outputPath: path.join(directory, "completion.json"),
      });
      expect(manifest.totals).toMatchObject({
        groupsObserved: 6,
        distinctExercises: 24,
        replicas: 3,
        exerciseReplicaUnits: 72,
      });
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejeita troca de estado e duplicação de exercício mesmo com totais preservados", () => {
    const wrongState = structuredClone(loadCampaign4CompletionInputs());
    [wrongState.observedGroups[0].result.cases[0], wrongState.observedGroups[0].result.cases[1]] = [
      wrongState.observedGroups[0].result.cases[1],
      wrongState.observedGroups[0].result.cases[0],
    ];
    expect(() => validateCampaign4CompletionInputs(wrongState)).toThrow(/não coincidem exatamente/);

    const duplicateExercise = structuredClone(loadCampaign4CompletionInputs());
    duplicateExercise.observedGroups[0].result.cases[0].exerciseIds[0] =
      duplicateExercise.observedGroups[0].result.cases[0].exerciseIds[1];
    expect(() => validateCampaign4CompletionInputs(duplicateExercise)).toThrow(
      /exercícios do estado divergem|duplicado/
    );
  });
});
