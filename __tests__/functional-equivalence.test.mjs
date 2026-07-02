/**
 * functional-equivalence.test.mjs — Tarefa 7 (equivalência funcional: concordância + κ).
 */

import { describe, it, expect } from "vitest";
import {
  functionalEquivalence,
  verdictFor,
  buildBattery,
  cohenKappa,
} from "../functional-equivalence.js";

const neutral = (steps, miscs) => ({
  steps: (steps || []).map((a, i) => ({ key: String(a), answer: String(a), order: i + 1 })),
  misconceptions: (miscs || []).map((m) =>
    typeof m === "string" ? { wrongAnswer: m, mechanical: false } : m
  ),
  transitions: [],
});

describe("verdictFor (player de example-tracing)", () => {
  const g = neutral(["1/4"], ["0/4", "3"]);
  it("misconception → erro-previsto; correta → correto; resto → surpresa", () => {
    expect(verdictFor(g, "0/4", ["1/4"])).toBe("erro-previsto");
    expect(verdictFor(g, "1/4", ["1/4"])).toBe("correto");
    expect(verdictFor(g, "9", ["1/4"])).toBe("surpresa");
  });
  it("tolera grafia equivalente (0.25 ≡ 1/4) via answerMatches", () => {
    expect(verdictFor(g, "0.25", ["1/4"])).toBe("correto");
  });
});

describe("buildBattery", () => {
  it("une respostas dos dois grafos, deduplica e respeita excludeMechanical", () => {
    const expert = neutral(
      ["1/4"],
      [
        { wrongAnswer: "3", mechanical: false },
        { wrongAnswer: "-1", mechanical: true },
      ]
    );
    const robot = neutral(["1/4"], ["7"]);
    const full = buildBattery(expert, robot, ["1/4"]);
    expect(full).toEqual(expect.arrayContaining(["1/4", "3", "-1", "7"]));
    const conc = buildBattery(expert, robot, ["1/4"], { excludeMechanical: true });
    expect(conc).not.toContain("-1");
  });
});

describe("functionalEquivalence", () => {
  it("grafos idênticos → concordância 1 e κ 1", () => {
    const a = neutral(["1/4"], ["0/4", "3"]);
    const b = neutral(["1/4"], ["0/4", "3"]);
    const fe = functionalEquivalence(a, b, { correctAnswers: ["1/4"] });
    expect(fe.agreement).toBe(1);
    expect(fe.kappa).toBe(1);
  });

  it("erro só no especialista → uma surpresa do robô, concordância cai", () => {
    const expert = neutral(["1/4"], ["0/4", "3"]);
    const robot = neutral(["1/4"], ["0/4"]); // não prevê o "3"
    const fe = functionalEquivalence(expert, robot, { correctAnswers: ["1/4"] });
    // bateria: 1/4(correto/correto), 0/4(erro/erro), 3(erro/surpresa) → 2/3
    expect(fe.n).toBe(3);
    expect(fe.agreement).toBeCloseTo(2 / 3, 3);
    expect(fe.kappa).toBeLessThan(1);
  });

  it("excludeMechanical tira o erro mecânico do especialista da bateria (sobe concordância)", () => {
    const expert = neutral(
      ["1/4"],
      [
        { wrongAnswer: "0/4", mechanical: false },
        { wrongAnswer: "-1", mechanical: true },
      ]
    );
    const robot = neutral(["1/4"], ["0/4"]); // não prevê o mecânico -1
    const cru = functionalEquivalence(expert, robot, { correctAnswers: ["1/4"] });
    const conc = functionalEquivalence(expert, robot, {
      correctAnswers: ["1/4"],
      excludeMechanical: true,
    });
    expect(conc.agreement).toBeGreaterThan(cru.agreement);
    expect(conc.agreement).toBe(1); // sem o -1, batem em tudo
  });
});

describe("cohenKappa", () => {
  it("concordância total → 1; corrige o acaso", () => {
    const rows = [
      { expert: "correto", robot: "correto" },
      { expert: "erro-previsto", robot: "erro-previsto" },
    ];
    expect(cohenKappa(rows)).toBe(1);
  });
});
