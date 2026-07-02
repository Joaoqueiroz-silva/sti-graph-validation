import { describe, it, expect } from "vitest";
import { canon, canonAnswer, bucketRole, normalizeEducaoff, toNeutral } from "../schema.js";

describe("canon", () => {
  it("tira acento, espaço, caixa e pontuação final", () => {
    expect(canon("Quarenta e Dois. ")).toBe("quarentaedois");
    expect(canon(" 42 ")).toBe("42");
    expect(canon(null)).toBe("");
  });
});

describe("canonAnswer (âncora semântica de frações/decimais)", () => {
  it("reduz frações e casa equivalentes", () => {
    expect(canonAnswer("0/4")).toBe("0");
    expect(canonAnswer("2/8")).toBe("1/4");
    expect(canonAnswer("1/4")).toBe("1/4");
    expect(canonAnswer("4/2")).toBe("2");
    expect(canonAnswer("-1/4")).toBe("-1/4");
  });
  it("casa decimal com fração (0.25 ≡ 1/4) e aceita vírgula", () => {
    expect(canonAnswer("0.25")).toBe(canonAnswer("1/4"));
    expect(canonAnswer("1,5")).toBe(canonAnswer("3/2"));
  });
  it("inteiros e texto não mudam (idêntico a canon) — não quebra casos existentes", () => {
    expect(canonAnswer("42")).toBe("42");
    expect(canonAnswer("-1")).toBe("-1");
    expect(canonAnswer("nova")).toBe(canon("nova"));
    expect(canonAnswer("")).toBe("");
  });
});

describe("bucketRole", () => {
  it("classifica condições", () => {
    expect(bucketRole("correct")).toBe("correct");
    expect(bucketRole("misconception_no_carry")).toBe("misconception");
    expect(bucketRole("struggle")).toBe("struggle");
    expect(bucketRole("default")).toBe("default");
  });
});

describe("normalizeEducaoff", () => {
  const graph = {
    nodes: [
      { id: "start", type: "start" },
      {
        id: "step_1",
        type: "step",
        knowledgeComponents: ["kc_add_units"],
        misconceptions: [
          { id: "m1", wrongAnswer: "32" },
          { id: "m2", wrongAnswer: "312" },
        ],
      },
      {
        id: "step_2",
        type: "step",
        knowledgeComponents: ["kc_add_tens"],
        misconceptions: [{ id: "m3", wrongAnswer: "41" }],
      },
      { id: "scaffold_m1", type: "scaffold", targetMisconception: "m1" },
      { id: "goal", type: "goal" },
    ],
    edges: [
      { from: "start", to: "step_1", condition: "default" },
      { from: "step_1", to: "step_2", condition: "correct" },
      { from: "step_2", to: "goal", condition: "correct" },
      { from: "step_1", to: "scaffold_m1", condition: "misconception_m1" },
    ],
  };

  it("extrai passos pelo KC", () => {
    const n = normalizeEducaoff(graph);
    expect(n.steps.map((s) => s.key)).toEqual(["kc_add_units", "kc_add_tens"]);
  });

  it("extrai misconceptions pela wrongAnswer (âncora)", () => {
    const n = normalizeEducaoff(graph);
    expect(n.misconceptions.map((m) => m.key).sort()).toEqual(["312", "32", "41"]);
  });

  it("mantém só o backbone nas transições (exclui arestas de misconception)", () => {
    const n = normalizeEducaoff(graph);
    expect(n.transitions).toHaveLength(3);
    expect(n.transitions.every((t) => t.role !== "misconception")).toBe(true);
    expect(n.transitions[0]).toEqual({ from: "START", to: "kc_add_units", role: "default" });
  });
});

describe("toNeutral", () => {
  it("detecta formato EducaOFF ({nodes,edges})", () => {
    const n = toNeutral({ nodes: [{ id: "start", type: "start" }], edges: [] });
    expect(n.meta.source).toBe("educaoff");
  });
  it("detecta formato neutro ({steps})", () => {
    const n = toNeutral({ steps: [], misconceptions: [], transitions: [] });
    expect(n.meta.source).toBe("neutral");
  });
  it("rejeita formato desconhecido", () => {
    expect(() => toNeutral({ foo: 1 })).toThrow();
  });
});
