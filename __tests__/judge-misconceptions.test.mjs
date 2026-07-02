/**
 * judge-misconceptions.test.mjs — juiz CEGO de validade pedagógica (partes puras + cegueira).
 * O juiz LLM em si (judgeMisconception) não é unit-testado; aqui injetamos um juiz fake.
 */

import { describe, it, expect } from "vitest";
import {
  buildJudgeItems,
  judgeItems,
  summarizeBySource,
  makeDistractors,
} from "../judge-misconceptions.js";

describe("makeDistractors (controle negativo)", () => {
  it("inclui a resposta correta e um valor absurdo", () => {
    const d = makeDistractors("1/4");
    expect(d.map((x) => x.source)).toEqual(["distrator-correta", "distrator-absurdo"]);
    expect(d[0].candidate).toBe("1/4");
  });
});

describe("buildJudgeItems", () => {
  it("marca a origem e deduplica por âncora (1ª origem vence)", () => {
    const items = buildJudgeItems({
      robotExtras: ["3", "3/4"],
      expertConceptual: ["3", "0"], // "3" colide com robô → fica como robo-extra
      distractors: makeDistractors("1/4"),
    });
    const bySource = Object.fromEntries(items.map((i) => [i.candidate, i.source]));
    expect(bySource["3"]).toBe("robo-extra"); // 1ª origem vence
    expect(bySource["0"]).toBe("especialista");
    expect(bySource["1/4"]).toBe("distrator-correta");
    expect(items.filter((i) => i.candidate === "3")).toHaveLength(1); // dedup
  });
});

describe("judgeItems — CEGUEIRA", () => {
  it("o juiz NUNCA recebe a origem (só problema/resposta/candidato)", async () => {
    const seenArgs = [];
    const fakeJudge = async (problem, correctAnswer, candidate) => {
      seenArgs.push({ problem, correctAnswer, candidate });
      return { valid: candidate !== "987654", category: "x", reason: "r" };
    };
    const items = buildJudgeItems({
      robotExtras: ["3"],
      expertConceptual: ["0"],
      distractors: makeDistractors("1/4"),
    });
    const judged = await judgeItems("P", "1/4", items, { judge: fakeJudge });
    // o juiz recebeu apenas candidatos — nenhuma string de origem
    for (const a of seenArgs) {
      expect(["3", "0", "1/4", "987654"]).toContain(a.candidate);
      expect(JSON.stringify(a)).not.toMatch(/robo-extra|especialista|distrator/);
    }
    // os itens julgados preservam a origem (para a análise, não para o juiz)
    expect(judged.find((j) => j.candidate === "3").source).toBe("robo-extra");
  });
});

describe("summarizeBySource", () => {
  it("calcula a taxa de validade por origem", () => {
    const judged = [
      { source: "robo-extra", candidate: "3", valid: true, category: "valida_conceitual" },
      { source: "robo-extra", candidate: "5", valid: false, category: "implausivel" },
      { source: "especialista", candidate: "0", valid: true, category: "valida_conceitual" },
      { source: "distrator-absurdo", candidate: "987654", valid: false, category: "impossivel" },
    ];
    const g = summarizeBySource(judged);
    expect(g["robo-extra"].validRate).toBe(0.5);
    expect(g["especialista"].validRate).toBe(1);
    expect(g["distrator-absurdo"].validRate).toBe(0);
  });
});
