import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { C4_ATTESTED_KC_IDS } from "../production-fidelity/ontology-empty-bridge-v2.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));

describe("cobertura pós-auditoria dos KCs da Campanha 4", () => {
  it("a união das fixtures coincide exatamente com a atestação v2 e o snapshot v2", () => {
    const fixtureIds = new Set();
    for (let batch = 1; batch <= 6; batch++) {
      const file = `production-fidelity/fixtures/ctat-production-state-batch-${String(batch).padStart(2, "0")}.json`;
      for (const kc of readJson(file).knowledgeComponents) fixtureIds.add(kc.id);
    }
    const attestation = readJson(
      "protocol/production-freeze-2026-07-15/ontology-fixture-kc-attestation-v2.json"
    );
    const attestedIds = new Set(attestation.knowledgeComponents.map((kc) => kc.id));
    expect([...fixtureIds].sort()).toEqual([...attestedIds].sort());
    expect([...fixtureIds].sort()).toEqual([...C4_ATTESTED_KC_IDS].sort());
    expect(attestation.fixtureCoverage).toMatchObject({
      distinctFixtureKcIds: 4,
      attestedKcIds: 4,
      missing: [],
      extra: [],
    });
  });

  it("registra vetores vazios nos três endpoints de todos os KCs", () => {
    const attestation = readJson(
      "protocol/production-freeze-2026-07-15/ontology-fixture-kc-attestation-v2.json"
    );
    for (const kc of attestation.knowledgeComponents) {
      for (const endpoint of ["prerequisites", "relationships", "misconceptions"]) {
        expect(kc[endpoint]).toEqual({ httpStatus: 200, count: 0 });
      }
    }
  });
});
