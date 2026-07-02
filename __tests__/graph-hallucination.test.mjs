/**
 * Testes DIRIGIDOS do detector de alucinação estrutural (handoff 2026-06-30, T1).
 *
 * Cada detector precisa de um caso POSITIVO (grafo defeituoso → acusa) e do caso
 * NEGATIVO (grafo saudável → não acusa). Sem os positivos, os property tests só
 * provariam que o detector nunca dispara — não que detecta.
 */
import { describe, expect, it } from "vitest";
import {
  intrinsicReport,
  comparativeReport,
  hallucinationScore,
  simpleCycles,
  reachableFrom,
} from "../graph-hallucination.js";

// ── fixtures ──────────────────────────────────────────────────────────────────

/** Grafo saudável mínimo: start→s1→s2→goal + misc com scaffold e ciclo de remediação. */
function healthyGraph() {
  return {
    nodes: [
      { id: "start", type: "start" },
      {
        id: "s1",
        type: "step",
        misconceptions: [{ id: "misc_x", wrongAnswer: "5" }],
      },
      { id: "s2", type: "step" },
      { id: "scaffold_misc_x", type: "scaffold", targetMisconception: "misc_x" },
      { id: "goal", type: "goal" },
    ],
    edges: [
      { from: "start", to: "s1", condition: "default" },
      { from: "s1", to: "s2", condition: "correct" },
      { from: "s2", to: "goal", condition: "correct" },
      { from: "s1", to: "scaffold_misc_x", condition: "misconception:misc_x" },
      { from: "scaffold_misc_x", to: "s1", condition: "back" },
    ],
  };
}

describe("intrinsicReport — grafo saudável (controle negativo)", () => {
  it("não flaga nada DURO e reconhece o ciclo de remediação como legítimo", () => {
    const r = intrinsicReport(healthyGraph());
    expect(r.hallucinationFlag).toBe(false);
    expect(r.hardViolations).toBe(0);
    expect(r.remediationCycles).toBeGreaterThanOrEqual(1);
    expect(r.hard.pathologicalCycles).toHaveLength(0);
  });
});

describe("intrinsicReport — DUROS (cada um barra o grafo)", () => {
  it("backbone cíclico (raciocínio circular em arestas correct)", () => {
    const g = healthyGraph();
    g.edges.push({ from: "s2", to: "s1", condition: "correct" });
    const r = intrinsicReport(g);
    expect(r.hard.backboneCycles.length).toBeGreaterThan(0);
    expect(r.hallucinationFlag).toBe(true);
  });

  it("ciclo patológico (não passa por misconception/scaffold)", () => {
    const g = healthyGraph();
    g.nodes.push({ id: "s3", type: "step" });
    // ciclo s2→s3→s2 via arestas default — nada de remediação no caminho
    g.edges.push(
      { from: "s2", to: "s3", condition: "default" },
      { from: "s3", to: "s2", condition: "default" },
      { from: "s3", to: "goal", condition: "correct" }
    );
    const r = intrinsicReport(g);
    expect(r.hard.pathologicalCycles.length).toBeGreaterThan(0);
    expect(r.hallucinationFlag).toBe(true);
  });

  it("nó inalcançável (órfão de start)", () => {
    const g = healthyGraph();
    g.nodes.push({ id: "ilha", type: "step" });
    g.edges.push({ from: "ilha", to: "goal", condition: "correct" });
    const r = intrinsicReport(g);
    expect(r.hard.unreachableNodes).toContain("ilha");
    expect(r.hallucinationFlag).toBe(true);
  });

  it("beco sem saída (não co-alcança goal)", () => {
    const g = healthyGraph();
    g.nodes.push({ id: "beco", type: "step" });
    g.edges.push({ from: "s1", to: "beco", condition: "default" }); // entra, não sai
    const r = intrinsicReport(g);
    expect(r.hard.deadEndNodes).toContain("beco");
    expect(r.hallucinationFlag).toBe(true);
  });

  it("scaffold órfão (aponta para misconception inexistente)", () => {
    const g = healthyGraph();
    g.nodes.push({ id: "scaf_fantasma", type: "scaffold", targetMisconception: "misc_nao_existe" });
    g.edges.push(
      { from: "s1", to: "scaf_fantasma", condition: "misconception:misc_nao_existe" },
      { from: "scaf_fantasma", to: "s1", condition: "back" }
    );
    const r = intrinsicReport(g);
    expect(r.hard.scaffoldsWithoutMisc).toContain("scaf_fantasma");
    expect(r.hallucinationFlag).toBe(true);
  });

  it("aresta órfã (liga nó inexistente)", () => {
    const g = healthyGraph();
    g.edges.push({ from: "s1", to: "nó_que_não_existe", condition: "correct" });
    const r = intrinsicReport(g);
    expect(r.hard.orphanEdges.length).toBe(1);
    expect(r.hallucinationFlag).toBe(true);
  });
});

describe("intrinsicReport — MOLES (sinalizam sem barrar)", () => {
  it("self-loop e aresta paralela contam como moles, não flagam", () => {
    const g = healthyGraph();
    g.edges.push(
      { from: "s2", to: "s2", condition: "default" }, // self-loop
      { from: "s1", to: "s2", condition: "correct" } // paralela (mesma rota+papel)
    );
    const r = intrinsicReport(g);
    expect(r.soft.selfLoops.length).toBe(1);
    expect(r.soft.parallelEdges.length).toBe(1);
    expect(r.hallucinationFlag).toBe(false); // moles não barram
  });

  it("misconception sem scaffold é mole", () => {
    const g = healthyGraph();
    g.nodes.find((n) => n.id === "s2").misconceptions = [{ id: "misc_sem_scaf", wrongAnswer: "7" }];
    const r = intrinsicReport(g);
    expect(r.soft.miscWithoutScaffold).toContain("misc_sem_scaf");
    expect(r.hallucinationFlag).toBe(false);
  });

  it("over-branching: step com grau de saída desproporcional (o conta1 do Anexo A)", () => {
    const g = healthyGraph();
    // 6 saídas extras no s1 (grau 8) vs mediana ~2 dos outros steps
    for (let i = 0; i < 6; i++) {
      g.nodes.push({ id: `alvo${i}`, type: "step" });
      g.edges.push(
        { from: "s1", to: `alvo${i}`, condition: "default" },
        { from: `alvo${i}`, to: "goal", condition: "correct" }
      );
    }
    const r = intrinsicReport(g);
    expect(r.soft.overBranchingSteps.length).toBeGreaterThan(0);
    expect(r.soft.overBranchingSteps[0].id).toBe("s1");
  });
});

describe("hallucinationScore (µ+λσ)", () => {
  it("flag segue os DUROS; anomalous compara com a banda", () => {
    const g = healthyGraph();
    g.edges.push({ from: "s2", to: "s2", condition: "default" }); // 1 mole (self-loop)
    const r = intrinsicReport(g);
    const s = hallucinationScore(r, { band: { mean: 0, sd: 0.1, lambda: 2 } });
    expect(s.flag).toBe(false);
    expect(s.score).toBeGreaterThan(0);
    expect(s.anomalous).toBe(true); // score 1 > 0 + 2·0.1
    const calm = hallucinationScore(intrinsicReport(healthyGraph()), {
      band: { mean: 0, sd: 0.1, lambda: 2 },
    });
    expect(calm.anomalous).toBe(false);
  });

  it("sem banda histórica, anomalous é null (não inventa veredito)", () => {
    const s = hallucinationScore(intrinsicReport(healthyGraph()));
    expect(s.anomalous).toBeNull();
  });
});

describe("comparativeReport (contra especialista — extras são CANDIDATOS)", () => {
  const expert = {
    steps: [{ key: "1/4", answer: "1/4", kc: "find_value", order: 1 }],
    misconceptions: [
      { key: "3/4", wrongAnswer: "3/4", stepKey: "1/4" },
      { key: "1/2", wrongAnswer: "1/2", stepKey: "1/4" },
      { key: "4", wrongAnswer: "4", stepKey: "1/4" },
      { key: "0", wrongAnswer: "0", stepKey: "1/4" },
    ],
    transitions: [
      { from: "START", to: "1/4", role: "default" },
      { from: "1/4", to: "GOAL", role: "correct" },
    ],
  };

  it("grafo idêntico → distâncias 0 e completude 1", () => {
    const r = comparativeReport(expert, expert);
    expect(r.gedApprox).toBe(0);
    expect(r.spectralDistance).toBe(0);
    expect(r.degreeDistL1).toBe(0);
    expect(r.miscRecallCompletude).toBe(1);
    expect(r.extraMisconceptions).toHaveLength(0);
  });

  it("robô cobre 3/4 e traz extras → completude 0.75, extras viram candidatos (não veredito)", () => {
    const robot = {
      steps: expert.steps,
      misconceptions: [
        { key: "3/4", wrongAnswer: "3/4", stepKey: "1/4" },
        { key: "1/2", wrongAnswer: "1/2", stepKey: "1/4" },
        { key: "4", wrongAnswer: "4", stepKey: "1/4" },
        { key: "1/3", wrongAnswer: "1/3", stepKey: "1/4" }, // extra real
        { key: "1/5", wrongAnswer: "1/5", stepKey: "1/4" }, // extra real
        { key: "7", wrongAnswer: "7", stepKey: "1/4" }, // extra lixo — quem decide é o juiz
      ],
      transitions: expert.transitions,
    };
    const r = comparativeReport(expert, robot);
    expect(r.miscRecallCompletude).toBe(0.75); // perdeu o "0"
    expect(r.missingMisconceptions).toEqual(["0"]);
    expect(r.extraMisconceptions.sort()).toEqual(["1/3", "1/5", "7"]);
    expect(r.gedApprox).toBeGreaterThan(0);
  });

  it("âncora semântica: 2/8 do robô casa 1/4 do especialista (não é extra)", () => {
    const e2 = { ...expert, misconceptions: [{ key: "1/4", wrongAnswer: "1/4", stepKey: "1/4" }] };
    const r2 = {
      ...expert,
      misconceptions: [{ key: "2/8", wrongAnswer: "2/8", stepKey: "1/4" }],
    };
    const r = comparativeReport(e2, r2);
    expect(r.miscRecallCompletude).toBe(1);
    expect(r.extraMisconceptions).toHaveLength(0);
  });
});

describe("primitivas de grafo", () => {
  it("simpleCycles acha ciclo e reachableFrom é BFS correto", () => {
    const edges = [
      { from: "a", to: "b", role: "correct" },
      { from: "b", to: "c", role: "correct" },
      { from: "c", to: "a", role: "correct" },
    ];
    const cycles = simpleCycles(edges, new Set(["a", "b", "c"]));
    expect(cycles.length).toBeGreaterThan(0);
    const adj = new Map([
      ["a", ["b"]],
      ["b", ["c"]],
    ]);
    expect([...reachableFrom(adj, "a")].sort()).toEqual(["a", "b", "c"]);
  });
});
