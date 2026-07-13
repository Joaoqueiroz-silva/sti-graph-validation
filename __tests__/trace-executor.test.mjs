/**
 * trace-executor.test.mjs — EXECUTABILIDADE dos grafos v2 do especialista (gate G5).
 *
 * O que este arquivo trava (Onda 2, 2026-07-12):
 *   (i)   para cada um dos 24 grafos v2, o traço correto construído DO PRÓPRIO grafo
 *         executa com todos os passos "correct" e completed=true;
 *   (ii)  para cada transição buggy, navegar até o estado de origem e aplicar o SAI
 *         buggy dá verdict "buggy" com o feedback correto (e followRemediation segue
 *         o destino de remediação);
 *   (iii) hintRequest no primeiro estado devolve as dicas das transições corretas;
 *   e os traços sintéticos: equivalência semântica (2/8 ≡ 1/4), grafia diferente em
 *   matchRule exact (no-match), ação após o objetivo (no-match) e repetição de passo.
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseBrdToNeutralV2 } from "../schema-v2.js";
import { executeTrace } from "../trace-executor.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CASES_DIR = path.join(HERE, "../cases/ctat-6.17");
const CASES = fs
  .readdirSync(CASES_DIR)
  .filter((d) => fs.existsSync(path.join(CASES_DIR, d, "expert.brd")))
  .sort();

const loadV2 = (c) =>
  parseBrdToNeutralV2(fs.readFileSync(path.join(CASES_DIR, c, "expert.brd"), "utf8"), { case: c });

// ───────── helpers de construção de traço A PARTIR do grafo (não hard-coded) ─────────

/** Índice from → transições corretas, na ordem do grafo. */
function correctOutgoing(v2) {
  const byFrom = new Map();
  for (const t of v2.transitions) {
    if (t.type !== "correct") continue;
    if (!byFrom.has(t.from)) byFrom.set(t.from, []);
    byFrom.get(t.from).push(t);
  }
  return byFrom;
}

/** Traço correto: segue a 1ª transição correta de cada estado, do start até um final. */
function buildCorrectTrace(v2) {
  const finals = new Set(v2.finalStates);
  const byFrom = correctOutgoing(v2);
  const trace = [];
  let cur = v2.startState;
  const visited = new Set();
  while (!finals.has(cur) && !visited.has(cur)) {
    visited.add(cur);
    const outs = byFrom.get(cur) || [];
    if (!outs.length) break;
    trace.push({ ...outs[0].sai });
    cur = outs[0].to;
  }
  return { trace, expectedEnd: cur };
}

/** BFS pelas transições corretas: menor traço do start até `target` (ou null). */
function tracePathTo(v2, target) {
  const byFrom = correctOutgoing(v2);
  const queue = [[v2.startState, []]];
  const seen = new Set([v2.startState]);
  while (queue.length) {
    const [state, trace] = queue.shift();
    if (state === target) return trace;
    for (const t of byFrom.get(state) || []) {
      if (seen.has(t.to)) continue;
      seen.add(t.to);
      queue.push([t.to, [...trace, { ...t.sai }]]);
    }
  }
  return null;
}

// ───────── (i) traço correto completo ─────────

describe("(i) traço correto do próprio grafo — 24 exercícios", () => {
  it("executa com todos os passos 'correct' e completed=true", () => {
    for (const c of CASES) {
      const v2 = loadV2(c);
      const { trace, expectedEnd } = buildCorrectTrace(v2);
      expect(trace.length).toBeGreaterThan(0);

      const res = executeTrace(v2, trace);
      expect(res.steps.map((s) => s.verdict)).toEqual(trace.map(() => "correct"));
      expect(res.completed).toBe(true);
      expect(v2.finalStates).toContain(res.endState);
      expect(res.endState).toBe(expectedEnd);
    }
  });
});

// ───────── (ii) cada transição buggy dispara o feedback certo ─────────

describe("(ii) transições buggy — navegar até a origem e errar", () => {
  it("todo SAI buggy dá verdict 'buggy' com o feedback da transição, nos 24 exercícios", () => {
    for (const c of CASES) {
      const v2 = loadV2(c);
      const buggies = v2.transitions.filter((t) => t.type === "buggy");
      expect(buggies.length).toBeGreaterThan(0);

      for (const b of buggies) {
        const prefix = tracePathTo(v2, b.from);
        expect(prefix, `${c}: estado ${b.from} inalcançável pelo caminho correto`).not.toBeNull();

        const res = executeTrace(v2, [...prefix, { ...b.sai }]);
        const last = res.steps.at(-1);
        expect(last.verdict).toBe("buggy");
        // 02watermelon tem 1 aresta buggy sem buggyMessage no XML → feedback condicional
        if (b.feedback?.buggyMessage) {
          expect(last.feedback).toBe(b.feedback.buggyMessage);
        } else {
          expect(last.feedback).toBeUndefined();
        }
        // sem followRemediation, o erro NÃO avança: termina na origem do buggy
        expect(res.endState).toBe(b.from);
        expect(res.completed).toBe(false);
      }
    }
  });

  it("opts.followRemediation segue o destino de remediação da transição buggy", () => {
    const v2 = loadV2("01watermelon");
    const b = v2.transitions.find((t) => t.type === "buggy" && t.to && t.to !== t.from);
    const prefix = tracePathTo(v2, b.from);
    const res = executeTrace(v2, [...prefix, { ...b.sai }], { followRemediation: true });
    expect(res.steps.at(-1).verdict).toBe("buggy");
    expect(res.endState).toBe(b.to);
  });
});

// ───────── (iii) pedido de dica ─────────

describe("(iii) hintRequest", () => {
  it("no primeiro estado devolve as dicas das transições corretas, nos 24 exercícios", () => {
    for (const c of CASES) {
      const v2 = loadV2(c);
      const expected = (correctOutgoing(v2).get(v2.startState) || []).flatMap((t) => t.hints);
      const res = executeTrace(v2, [{ hintRequest: true }]);
      expect(res.steps[0].verdict).toBe("hint");
      expect(res.steps[0].hints).toEqual(expected);
      // pedir dica não move o estado nem completa o problema
      expect(res.endState).toBe(v2.startState);
      expect(res.completed).toBe(false);
    }
  });

  it("01watermelon: dica no meio do caminho devolve os níveis do passo corrente (F1)", () => {
    const v2 = loadV2("01watermelon");
    const { trace } = buildCorrectTrace(v2);
    // após os 3 passos de setup (tutor-performed), o estado corrente é o do numerador F1
    const res = executeTrace(v2, [...trace.slice(0, 3), { hintRequest: true }]);
    const hint = res.steps.at(-1);
    const f1 = v2.transitions.find((t) => t.type === "correct" && t.sai.selection === "F1");
    expect(hint.verdict).toBe("hint");
    expect(hint.hints).toHaveLength(3);
    expect(hint.hints).toEqual(f1.hints);
  });
});

// ───────── traços sintéticos sobre o corpus ─────────

describe("traços sintéticos — 01watermelon", () => {
  const v2 = loadV2("01watermelon");
  const { trace: full } = buildCorrectTrace(v2);
  // caminho correto: showAnswer → setVisible → set_maximum → F1 → F2 → denom → numline → done
  const idxNumline = full.findIndex((s) => s.selection === "numline" && s.action === "AddPoint");

  it("matchRule semantic: '2/8' e '0.25' casam a transição correta '1/4' da reta numérica", () => {
    for (const equivalente of ["2/8", "0.25"]) {
      const trace = [
        ...full.slice(0, idxNumline),
        { selection: "numline", action: "AddPoint", input: equivalente },
        ...full.slice(idxNumline + 1),
      ];
      const res = executeTrace(v2, trace);
      expect(res.steps.map((s) => s.verdict)).toEqual(trace.map(() => "correct"));
      expect(res.completed).toBe(true);
    }
  });

  it("matchRule exact NÃO aceita grafia diferente: F1='01' (≡1 semanticamente) dá no-match", () => {
    const idxF1 = full.findIndex((s) => s.selection === "F1");
    const res = executeTrace(v2, [...full.slice(0, idxF1), { selection: "F1", action: "UpdateTextField", input: "01" }]);
    expect(res.steps.at(-1).verdict).toBe("no-match");
    expect(res.completed).toBe(false);
  });

  it("ação após o objetivo: no-match, e o problema continua completo", () => {
    const res = executeTrace(v2, [...full, { selection: "done", action: "ButtonPressed", input: "-1" }]);
    expect(res.steps.at(-1).verdict).toBe("no-match");
    expect(res.completed).toBe(true); // o estado final não muda com um no-match
  });

  it("repetição de um passo correto: a 2ª ocorrência dá no-match e o traço se recupera", () => {
    const idxF1 = full.findIndex((s) => s.selection === "F1");
    const trace = [...full.slice(0, idxF1 + 1), { ...full[idxF1] }, ...full.slice(idxF1 + 1)];
    const res = executeTrace(v2, trace);
    const verdicts = res.steps.map((s) => s.verdict);
    expect(verdicts[idxF1]).toBe("correct");
    expect(verdicts[idxF1 + 1]).toBe("no-match"); // repetiu: o estado já avançou
    expect(verdicts.filter((v) => v === "no-match")).toHaveLength(1);
    expect(res.completed).toBe(true); // o resto do traço segue normal
  });
});

// ───────── grafo sintético mínimo: semântica fina do executor ─────────

describe("grafo sintético — semântica determinística do executor", () => {
  const SYNTH = {
    schemaVersion: 2,
    meta: { source: "synthetic" },
    startState: "A",
    finalStates: ["F"],
    states: [
      { id: "A", name: "inicio" },
      { id: "B", name: "meio" },
      { id: "R", name: "remediacao" },
      { id: "F", name: "fim" },
    ],
    transitions: [
      {
        id: "t-correct",
        from: "A",
        to: "B",
        sai: { selection: "resp", action: "Update", input: "1/2" },
        type: "correct",
        matchRule: "semantic",
        actor: "Student",
        feedback: { successMessage: "boa!" },
        hints: ["h1", "h2"],
        kcs: ["K1"],
      },
      {
        // buggy com o MESMO input da correta (exact): prova a prioridade correct > buggy
        id: "t-buggy-mesmo-input",
        from: "A",
        to: "R",
        sai: { selection: "resp", action: "Update", input: "1/2" },
        type: "buggy",
        matchRule: "exact",
        actor: "Student",
        feedback: { buggyMessage: "não era pra casar" },
        hints: ["hb0"],
        kcs: [],
      },
      {
        id: "t-buggy",
        from: "A",
        to: "R",
        sai: { selection: "resp", action: "Update", input: "1/3" },
        type: "buggy",
        matchRule: "exact",
        actor: "Student",
        feedback: { buggyMessage: "errou" },
        hints: ["hb1"],
        kcs: [],
      },
      {
        id: "t-unknown",
        from: "A",
        to: "F",
        sai: { selection: "atalho", action: "Update", input: "?" },
        type: "unknown",
        matchRule: "exact",
        actor: "Student",
        feedback: null,
        hints: [],
        kcs: [],
      },
      {
        id: "t-done",
        from: "B",
        to: "F",
        sai: { selection: "done", action: "Press", input: "-1" },
        type: "correct",
        matchRule: "exact",
        actor: "Student",
        feedback: null,
        hints: [],
        kcs: [],
      },
    ],
    skills: [],
    unsupportedConstructs: [],
  };

  it("semantic aceita 2/4 ≡ 1/2 e devolve o feedback de sucesso; done exact fecha", () => {
    const res = executeTrace(SYNTH, [
      { selection: "resp", action: "Update", input: "2/4" },
      { selection: "done", action: "Press", input: "-1" },
    ]);
    expect(res.steps[0]).toEqual({ verdict: "correct", transitionId: "t-correct", feedback: "boa!" });
    expect(res.completed).toBe(true);
    expect(res.endState).toBe("F");
  });

  it("prioridade correct > buggy quando ambos casam o mesmo SAI", () => {
    const res = executeTrace(SYNTH, [{ selection: "resp", action: "Update", input: "1/2" }]);
    expect(res.steps[0].verdict).toBe("correct");
    expect(res.steps[0].transitionId).toBe("t-correct");
  });

  it("buggy permanece no estado por padrão; followRemediation segue o destino", () => {
    const errar = [{ selection: "resp", action: "Update", input: "1/3" }];
    const fica = executeTrace(SYNTH, errar);
    expect(fica.steps[0]).toEqual({ verdict: "buggy", transitionId: "t-buggy", feedback: "errou" });
    expect(fica.endState).toBe("A");
    const segue = executeTrace(SYNTH, errar, { followRemediation: true });
    expect(segue.endState).toBe("R");
  });

  it("comparação com trim: ' 1/3 ' casa o buggy exact '1/3'", () => {
    const res = executeTrace(SYNTH, [{ selection: " resp ", action: "Update", input: " 1/3 " }]);
    expect(res.steps[0].verdict).toBe("buggy");
  });

  it("transição 'unknown' não é casável (semântica não declarada → no-match)", () => {
    const res = executeTrace(SYNTH, [{ selection: "atalho", action: "Update", input: "?" }]);
    expect(res.steps[0].verdict).toBe("no-match");
    expect(res.endState).toBe("A");
  });

  it("hintRequest lista só as dicas de transições CORRETAS (não as de buggy)", () => {
    const res = executeTrace(SYNTH, [{ hintRequest: true }]);
    expect(res.steps[0]).toEqual({ verdict: "hint", hints: ["h1", "h2"] });
  });

  it("hintRequest em estado sem transições corretas devolve []", () => {
    const res = executeTrace(SYNTH, [
      { selection: "resp", action: "Update", input: "1/2" },
      { selection: "done", action: "Press", input: "-1" },
      { hintRequest: true }, // estado F: sem saídas
    ]);
    expect(res.steps.at(-1)).toEqual({ verdict: "hint", hints: [] });
  });

  it("rejeita grafo que não é v2", () => {
    expect(() => executeTrace({ schemaVersion: 1 }, [])).toThrow(/schemaVersion 2/);
    expect(() => executeTrace(null, [])).toThrow(/schemaVersion 2/);
  });

  it("traço vazio: nenhum passo, completed reflete o startState", () => {
    const res = executeTrace(SYNTH, []);
    expect(res.steps).toEqual([]);
    expect(res.completed).toBe(false);
    expect(res.endState).toBe("A");
  });
});
