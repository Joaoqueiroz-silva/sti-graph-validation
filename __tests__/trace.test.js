import { describe, it, expect } from "vitest";
import { traceStudentAnswers, answerMatches } from "../trace-answer.js";

const graph = {
  nodes: [
    { type: "start" },
    {
      type: "step",
      id: "step_1",
      misconceptions: [
        { wrongAnswer: "32", feedback: "Esqueceu o vai-um." },
        { wrongAnswer: "312", feedback: "Não alinhou as colunas." },
      ],
    },
    { type: "goal" },
  ],
};

describe("answerMatches", () => {
  it("numérico tolera vírgula e unidade", () => {
    expect(answerMatches("1,62 ml", "1.62")).toBe(true);
    expect(answerMatches("42", "42")).toBe(true);
    expect(answerMatches("42", "43")).toBe(false);
  });
  it("texto canônico", () => {
    expect(answerMatches("Cheia ", "cheia")).toBe(true);
    expect(answerMatches("nova", "cheia")).toBe(false);
  });
});

describe("traceStudentAnswers", () => {
  it("resposta correta → correto", () => {
    const [r] = traceStudentAnswers(graph, ["42"], { correctAnswers: ["42"] });
    expect(r.verdict).toBe("correto");
  });
  it("erro previsto → erro-previsto + feedback", () => {
    const [r] = traceStudentAnswers(graph, ["32"], { correctAnswers: ["42"] });
    expect(r.verdict).toBe("erro-previsto");
    expect(r.feedback).toContain("vai-um");
  });
  it("não previsto → surpresa (fall-off)", () => {
    const [r] = traceStudentAnswers(graph, ["999"], { correctAnswers: ["42"] });
    expect(r.verdict).toBe("surpresa");
  });
  it("classifica uma lista inteira", () => {
    const rs = traceStudentAnswers(graph, ["42", "32", "7"], { correctAnswers: ["42"] });
    expect(rs.map((r) => r.verdict)).toEqual(["correto", "erro-previsto", "surpresa"]);
  });
});
