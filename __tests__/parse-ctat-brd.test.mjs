/**
 * parse-ctat-brd.test.mjs — parser do .brd do CTAT + invariante de SEPARAÇÃO dos envelopes.
 *
 * Caso de referência: cases/ctat-6.17/01watermelon (frações na reta numérica, resposta 1/4).
 *
 * Nota (2026-06-26): o HANDOFF dizia "16 misconceptions"; o número REAL é 8. A causa é o
 * GOTCHA do classificador — misconception é definido pelo <actionType> ("Ação com erro"),
 * não pela presença de <buggyMessage> (arestas corretas também têm buggyMessage). Os testes
 * abaixo fixam os números reais e travam essa regressão.
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseBrd,
  parseBrdToExpertNeutral,
  parseBrdToRobotInput,
  findLeaksInRobotInput,
  isMisconceptionEdge,
  isMechanicalMisconception,
} from "../parse-ctat-brd.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BRD = fs.readFileSync(path.join(HERE, "../cases/ctat-6.17/01watermelon/expert.brd"), "utf8");

describe("parseBrd (matéria-prima)", () => {
  const g = parseBrd(BRD);

  it("extrai 16 arestas, 16 nós e 5 skills/KCs", () => {
    expect(g.edges).toHaveLength(16);
    expect(g.nodes).toHaveLength(16);
    expect(g.skills).toHaveLength(5);
  });

  it("classifica 8 corretas / 8 misconceptions pelo actionType (não pelo buggyMessage)", () => {
    const correct = g.edges.filter((e) => e.isCorrect);
    const misc = g.edges.filter((e) => !e.isCorrect);
    expect(correct).toHaveLength(8);
    expect(misc).toHaveLength(8);
    // prova do gotcha: existe aresta CORRETA que carrega buggyMessage não-vazio
    expect(correct.some((e) => e.buggy && e.buggy.length > 0)).toBe(true);
  });

  it("lê o enunciado e os KCs nomeados", () => {
    expect(g.statement).toMatch(/melancia/i);
    expect(g.skills.map((s) => s.ruleName)).toContain("IdenDenominator");
  });
});

describe("isMisconceptionEdge (classificador robusto a idioma)", () => {
  it("PT-BR e EN", () => {
    expect(isMisconceptionEdge({ actionType: "Ação com erro" })).toBe(true);
    expect(isMisconceptionEdge({ actionType: "Ação Correta" })).toBe(false);
    expect(isMisconceptionEdge({ actionType: "Incorrect Action" })).toBe(true);
    expect(isMisconceptionEdge({ actionType: "Correct Action" })).toBe(false);
  });
  it("fallback sem actionType: buggy sem success = erro", () => {
    expect(isMisconceptionEdge({ actionType: "", buggy: "x", success: "" })).toBe(true);
    expect(isMisconceptionEdge({ actionType: "", buggy: "", success: "ok" })).toBe(false);
  });
});

describe("Envelope B — grafo do especialista (neutro)", () => {
  const B = parseBrdToExpertNeutral(BRD);

  it("tem 8 misconceptions reais (não 16) com wrongAnswer como âncora", () => {
    expect(B.misconceptions).toHaveLength(8);
    const wrongs = B.misconceptions.map((m) => m.wrongAnswer);
    expect(wrongs).toContain("0/4"); // erro conhecido do 01watermelon
    expect(B.misconceptions.every((m) => typeof m.wrongAnswer === "string")).toBe(true);
  });

  it("tem 8 passos corretos e backbone START→…→GOAL", () => {
    expect(B.steps).toHaveLength(8);
    expect(B.transitions.some((t) => t.from === "START")).toBe(true);
    expect(B.transitions.some((t) => t.to === "GOAL")).toBe(true);
    expect(B.transitions.every((t) => t.role === "correct")).toBe(true);
  });

  it("carrega ≥1 KC e as dicas por passo (metadados)", () => {
    expect(B.skills.length).toBeGreaterThanOrEqual(1);
    expect(B.hintsPerCorrectStep).toHaveLength(8);
  });

  it("marca as misconceptions MECÂNICAS de interface (-1, -) — A2", () => {
    const mech = B.misconceptions.filter((m) => m.mechanical);
    const conc = B.misconceptions.filter((m) => !m.mechanical);
    expect(mech.length).toBeGreaterThan(0); // 01watermelon tem -1 e - (mecânicos)
    expect(conc.length).toBeGreaterThan(0); // e erros conceituais reais
    expect(mech.every((m) => ["-1", "-"].includes(m.wrongAnswer))).toBe(true);
  });
});

describe("isMechanicalMisconception (conceitual × mecânico)", () => {
  it("sentinelas de interface = mecânico; frações/números reais = conceitual", () => {
    for (const w of ["-1", "-", ""]) expect(isMechanicalMisconception(w)).toBe(true);
    for (const w of ["1/4", "0", "3", "0/4"]) expect(isMechanicalMisconception(w)).toBe(false);
  });
});

describe("Envelope A — entrada do robô (CEGO)", () => {
  const A = parseBrdToRobotInput(BRD);

  it("tem enunciado, resposta, KCs e componentes da interface", () => {
    expect(A.problem).toMatch(/melancia/i);
    expect(A.correctAnswer).toBe("1/4");
    expect(A.knowledgeComponents).toHaveLength(5);
    const ids = A.components.map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(["numline", "F1", "F2", "denom", "done"]));
  });

  it("INVARIANTE: não contém nenhum campo do Envelope B (anti-contaminação)", () => {
    expect(findLeaksInRobotInput(A)).toEqual([]);
  });

  it("CONTROLE NEGATIVO: o detector PEGA contaminação se ela existir", () => {
    const contaminado = {
      ...A,
      misconceptions: [{ wrongAnswer: "0/4" }],
      hints: ["dica vazada"],
    };
    const leaks = findLeaksInRobotInput(contaminado);
    expect(leaks).toContain("misconceptions");
    expect(leaks).toContain("hints");
  });
});
