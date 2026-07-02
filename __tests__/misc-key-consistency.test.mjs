/**
 * Regressão da verificação adversarial 2026-07-02: a ÂNCORA de misconception
 * divergia entre metrics.js (m.key = canonAnswer(wrongAnswer) || canon(description)
 * || canon(id)) e run-judge.mjs (só canonAnswer(wrongAnswer)) — para o MESMO grafo,
 * a completude do 2D dava 1.0 num fluxo e 0.5 no outro quando uma misconception
 * tinha wrongAnswer vazio e description preenchida (repro do crítico).
 *
 * Agora existe UMA fonte de verdade: miscKey() em schema.js, usada pelo normalizador
 * (metrics) e pelo run-judge (via m.key do neutro). Este teste trava a equivalência.
 */
import { describe, expect, it } from "vitest";
import { miscKey, normalizeNeutral } from "../schema.js";
import { compareGraphs } from "../metrics.js";
import { intrinsicReport } from "../graph-hallucination.js";

const neutralWith = (miscs) => ({
  steps: [{ key: "1/4", answer: "1/4", kc: "kc_a", order: 1 }],
  misconceptions: miscs,
  transitions: [
    { from: "START", to: "1/4", role: "default" },
    { from: "1/4", to: "GOAL", role: "correct" },
  ],
});

describe("âncora única de misconception (miscKey)", () => {
  it("wrongAnswer vazio cai para description — mesma chave nos dois fluxos", () => {
    const m = { wrongAnswer: "", description: "inverte num e denom" };
    expect(miscKey(m)).toBe("invertenumedenom");
    // o normalizador (usado pelo metrics) resolve a MESMA chave
    const neutral = normalizeNeutral(neutralWith([m]));
    expect(neutral.misconceptions[0].key).toBe(miscKey(m));
  });

  it("repro do crítico: completude idêntica por compareGraphs e por m.key (run-judge)", () => {
    const expert = neutralWith([
      { wrongAnswer: "", description: "inverte num e denom" },
      { wrongAnswer: "42", description: "soma em vez de dividir" },
    ]);
    const robot = neutralWith([
      { wrongAnswer: "", description: "inverte num e denom" }, // cobre a 1ª por description
      { wrongAnswer: "42" }, // cobre a 2ª por wrongAnswer
    ]);
    // fluxo 1: metrics
    const cmp = compareGraphs(expert, robot);
    expect(cmp.recallMisconceptions).toBe(1);
    // fluxo 2: a lógica do run-judge (cobertura por m.key do neutro)
    const e = normalizeNeutral(expert);
    const r = normalizeNeutral(robot);
    const robotKeys = new Set(r.misconceptions.map((m) => m.key));
    const covered = e.misconceptions.filter((m) => robotKeys.has(m.key)).length;
    expect(covered / e.misconceptions.length).toBe(cmp.recallMisconceptions);
  });
});

describe("start/goal ausente = violação DURA (não no-op)", () => {
  it("grafo sem start/goal com nó-ilha é BARRADO (antes passava com flag=false)", () => {
    const g = {
      nodes: [
        { id: "s1", type: "step" },
        { id: "ilha", type: "step" },
      ],
      edges: [{ from: "s1", to: "s1", condition: "correct" }],
    };
    const r = intrinsicReport(g);
    expect(r.hard.missingStartGoal).toEqual(["start", "goal"]);
    expect(r.hallucinationFlag).toBe(true);
  });

  it("grafo saudável com start/goal não flaga missingStartGoal", () => {
    const g = {
      nodes: [
        { id: "start", type: "start" },
        { id: "s1", type: "step" },
        { id: "goal", type: "goal" },
      ],
      edges: [
        { from: "start", to: "s1", condition: "default" },
        { from: "s1", to: "goal", condition: "correct" },
      ],
    };
    const r = intrinsicReport(g);
    expect(r.hard.missingStartGoal).toEqual([]);
    expect(r.hallucinationFlag).toBe(false);
  });
});
