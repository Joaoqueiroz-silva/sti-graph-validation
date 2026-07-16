import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  C4_CTAT_ACTION_POLICY_VERSION,
  C4_CTAT_REFERENCE_VERSION,
  classifyCtatActionForCampaign4,
  parseCtatReferenceV2,
} from "../production-fidelity/ctat-reference-v2.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CASES_DIR = path.join(HERE, "../cases/ctat-6.17");
const CASES = fs
  .readdirSync(CASES_DIR)
  .filter((name) => fs.existsSync(path.join(CASES_DIR, name, "expert.brd")))
  .sort();
const parseCase = (problemId) =>
  parseCtatReferenceV2(
    fs.readFileSync(path.join(CASES_DIR, problemId, "expert.brd"), "utf8"),
    { problemId }
  );

describe("referencia CTAT C4 v2", () => {
  it("preserva estados e SAI originais e cria crosswalk ordinal explicito", () => {
    const reference = parseCase("01watermelon");
    expect(reference.schemaVersion).toBe(C4_CTAT_REFERENCE_VERSION);
    expect(reference.graph.schemaVersion).toBe(2);
    expect(reference.graph.states).toHaveLength(16);
    expect(reference.graph.transitions).toHaveLength(16);
    expect(reference.filterPolicy.version).toBe(C4_CTAT_ACTION_POLICY_VERSION);
    expect(reference.correctPath.comparable.map((item) => item.sai.selection)).toEqual([
      "F1",
      "F2",
      "denom",
      "numline",
    ]);
    expect(reference.stateOrdinalCrosswalk).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          contentOrdinal: 4,
          sourceStateId: "2",
          sai: { selection: "numline", action: "AddPoint", input: "1/4" },
        }),
      ])
    );
    expect(reference.buggyActions.comparable.every((item) => item.sourceContentOrdinal != null)).toBe(true);
  });

  it("torna filtros mecanicos observaveis, sem apagar acoes excluidas", () => {
    const reference = parseCase("01watermelon");
    expect(reference.counts).toMatchObject({
      correctAll: 8,
      correctComparable: 4,
      correctMechanical: 1,
      correctNonStudent: 3,
      buggyAll: 8,
      buggyComparable: 4,
      buggyMechanical: 4,
    });
    expect(reference.buggyActions.mechanical.map((item) => item.sai.input).sort()).toEqual([
      "-",
      "-",
      "-1",
      "-1",
    ]);
    expect(reference.buggyActions.mechanical.every((item) => item.classification.exclusionReasons.length > 0)).toBe(true);
  });

  it("mantem sentinela composta '-/5' como comparavel na regra primaria", () => {
    const reference = parseCase("00bubble");
    const compound = reference.buggyActions.all.find((item) => item.sai.input === "-/5");
    expect(compound).toBeTruthy();
    expect(compound.classification).toMatchObject({ mechanical: false, comparable: true });
    expect(reference.buggyActions.sensitivityCompoundSentinelCandidates).toContain(compound);
  });

  it("fixa os denominadores do corpus completo sem regra silenciosa", () => {
    const totals = CASES.map(parseCase).reduce(
      (sum, reference) => {
        for (const key of Object.keys(sum)) sum[key] += reference.counts[key];
        return sum;
      },
      {
        transitions: 0,
        correctComparable: 0,
        correctMechanical: 0,
        correctNonStudent: 0,
        buggyAll: 0,
        buggyComparable: 0,
        buggyMechanical: 0,
        buggyCompoundSentinelCandidates: 0,
      }
    );
    expect(CASES).toHaveLength(24);
    expect(totals).toEqual({
      transitions: 384,
      correctComparable: 96,
      correctMechanical: 24,
      correctNonStudent: 72,
      buggyAll: 192,
      buggyComparable: 110,
      buggyMechanical: 82,
      buggyCompoundSentinelCandidates: 1,
    });
  });
});

describe("classificador de acao CTAT", () => {
  it("distingue exclusao por ator de sentinela mecanica de estudante", () => {
    const tutor = classifyCtatActionForCampaign4({
      type: "correct",
      actor: "Tutor",
      sai: { selection: "showAnswer", action: "ButtonPressed", input: "1/4" },
    });
    expect(tutor).toMatchObject({ actorClass: "non_student", mechanical: false, comparable: false });
    expect(tutor.exclusionReasons).toContain("non_student_actor");

    const buggy = classifyCtatActionForCampaign4({
      type: "buggy",
      actor: "Student",
      sai: { selection: "denom", action: "Update", input: "-1" },
    });
    expect(buggy).toMatchObject({ actorClass: "student", mechanical: true, comparable: false });
    expect(buggy.mechanicalReasons).toContain("minus_one_interface_sentinel");
  });
});
