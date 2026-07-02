import { describe, it, expect } from "vitest";
import { compareGraphs, prf, tokens } from "../metrics.js";

const g = (miscs, steps = ["kc_a", "kc_b"]) => ({
  steps: steps.map((kc, i) => ({ key: kc, kc, order: i + 1 })),
  misconceptions: miscs.map((w) => ({ wrongAnswer: String(w), stepKey: "kc_a" })),
  transitions: [
    { from: "START", to: steps[0], role: "default" },
    { from: steps[0], to: steps[1], role: "correct" },
    { from: steps[1], to: "GOAL", role: "correct" },
  ],
});

describe("prf", () => {
  it("conjuntos vazios → tudo 1 (iguais)", () => {
    expect(prf({ tp: 0, fp: 0, fn: 0 })).toEqual({ precision: 1, recall: 1, f1: 1 });
  });
  it("F1 é a média harmônica", () => {
    const s = prf({ tp: 5, fp: 1, fn: 1 });
    expect(s.precision).toBeCloseTo(5 / 6, 5);
    expect(s.recall).toBeCloseTo(5 / 6, 5);
    expect(s.f1).toBeCloseTo(5 / 6, 5);
  });
});

describe("compareGraphs", () => {
  it("grafos idênticos → similaridade 1.0", () => {
    const r = compareGraphs(g(["32", "312", "41"]), g(["32", "312", "41"]));
    expect(r.similarity).toBe(1);
    expect(r.precision).toBe(1);
    expect(r.recall).toBe(1);
  });

  it("candidato com 1 erro a MENOS → recall cai, precisão fica 1", () => {
    // ref tem 4 erros, cand tem 3 (faltou o "24")
    const r = compareGraphs(g(["32", "312", "41", "24"]), g(["32", "312", "41"]));
    expect(r.precision).toBe(1); // tudo que o cand tem está na ref
    expect(r.recall).toBeCloseTo(5 / 6, 3); // 2 steps + 3/4 miscs
    expect(r.similarity).toBeCloseTo(10 / 11, 3); // = 0.909
    expect(r.detail.missingMisconceptions).toEqual(["24"]);
  });

  it("candidato com 1 erro a MAIS → precisão cai", () => {
    const r = compareGraphs(g(["32", "312"]), g(["32", "312", "999"]));
    expect(r.recall).toBe(1);
    expect(r.precision).toBeCloseTo(4 / 5, 3); // 2 steps + 2/3 miscs do cand
    expect(r.detail.extraMisconceptions).toEqual(["999"]);
  });

  it("similaridade é SIMÉTRICA (F1)", () => {
    const a = g(["32", "312", "41", "24"]);
    const b = g(["32", "312"]);
    expect(compareGraphs(a, b).similarity).toBe(compareGraphs(b, a).similarity);
  });

  it("normaliza acento/espaço/caixa na âncora (wrongAnswer)", () => {
    const r = compareGraphs(g(["Quarenta e Dois "]), g(["quarenta e dois"]));
    expect(r.similarity).toBe(1);
  });

  it("tokeniza nós e arestas separadamente", () => {
    const t = tokens(compareGraphsNeutral(g(["32"])));
    expect([...t.node]).toContain("misc|32");
    expect([...t.node]).toContain("step|kc_a");
  });

  it("F1 CONCEITUAL ignora misconception mecânica do especialista (A2)", () => {
    // ref (especialista) tem 1 erro conceitual ("3") + 1 mecânico ("-1"); cand (robô) só o conceitual
    const ref = {
      steps: [{ key: "1/4", answer: "1/4", order: 1 }],
      misconceptions: [
        { key: "3", wrongAnswer: "3", mechanical: false },
        { key: "-1", wrongAnswer: "-1", mechanical: true },
      ],
      transitions: [],
    };
    const cand = {
      steps: [{ key: "1/4", answer: "1/4", order: 1 }],
      misconceptions: [{ key: "3", wrongAnswer: "3" }],
      transitions: [],
    };
    const r = compareGraphs(ref, cand);
    expect(r.nodeF1).toBeLessThan(1); // cru: penaliza por não prever o mecânico "-1"
    expect(r.nodeF1Conceptual).toBe(1); // conceitual: o "-1" sai → casa perfeito
    expect(r.nodeF1Conceptual).toBeGreaterThan(r.nodeF1);
  });
});

// helper: normaliza via compareGraphs internamente não exposto; recria tokens a partir do neutro
import { toNeutral } from "../schema.js";
function compareGraphsNeutral(x) {
  return toNeutral(x);
}
