/**
 * author-from-ctat.test.mjs — Tarefas 2 e 3 (robô CEGO + restrição a componentes).
 *
 * Tudo OFFLINE: injetamos um `simulate` fake (sem LLM). O ponto central é a
 * INVARIANTE DE CEGUEIRA — authorFromBrd só pode entregar ao simulador o Envelope A
 * (sem misconceptions/dicas/arestas do especialista).
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { authorFromBrd } from "../author-from-ctat.js";
import { findLeaksInRobotInput } from "../parse-ctat-brd.js";
import { buildUserMessage, restrictToComponents } from "../simulate-students.js";
import { canon } from "../schema.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BRD = fs.readFileSync(path.join(HERE, "../cases/ctat-6.17/01watermelon/expert.brd"), "utf8");

describe("Tarefa 3 — authorFromBrd (robô CEGO)", () => {
  it("só entrega o Envelope A ao simulador (sem vazar o grafo do especialista)", async () => {
    let received = null;
    const fakeSimulate = async (iface) => {
      received = iface;
      return {
        correctPath: [{ kc: "kc_x", selection: "numline", action: "põe ponto", result: "1/4" }],
        misconceptions: [{ step: 1, selection: "numline", wrongAnswer: "0/4", feedback: "f" }],
        hints: [{ step: 1, text: "dica" }],
      };
    };
    const res = await authorFromBrd(BRD, { simulate: fakeSimulate });

    // o que o simulador VIU não pode conter nenhum campo do Envelope B
    expect(received).toBeTruthy();
    expect(findLeaksInRobotInput(received)).toEqual([]);
    expect(received.correctAnswer).toBe("1/4");
    expect(received.components.length).toBeGreaterThan(0);

    // produz grafo + neutro utilizáveis
    expect(res.graph).toBeTruthy();
    expect(res.neutral.steps.length).toBeGreaterThan(0);
    expect(Array.isArray(res.neutral.misconceptions)).toBe(true);
  });

  it("A1: injeta o `result` do trace no nó (steps não ficam null)", async () => {
    const fake = async () => ({
      correctPath: [
        { kc: "k1", selection: "numline", action: "põe ponto", result: "1/4" },
        { kc: "k2", selection: "denom", action: "denominador", result: "4" },
      ],
      misconceptions: [],
      hints: [],
    });
    const res = await authorFromBrd(BRD, { simulate: fake });
    const answers = res.neutral.steps.map((s) => s.answer);
    expect(answers).not.toContain(null); // antes do A1, todos eram null
    expect(answers).toEqual(expect.arrayContaining(["1/4", "4"]));
  });

  it("é determinístico/offline (não chama LLM quando simulate é injetado)", async () => {
    const fixed = async () => ({
      correctPath: [{ kc: "k", result: "1/4" }],
      misconceptions: [],
      hints: [],
    });
    const res = await authorFromBrd(BRD, { simulate: fixed });
    expect(res.envelopeA.problem).toMatch(/melancia/i);
  });
});

describe("Tarefa 2 — restrição aos componentes da interface", () => {
  const iface = {
    problem: "p",
    correctAnswer: "1/4",
    components: [
      { id: "numline", type: "numberline", label: "numline" },
      { id: "denom", type: "numeric", label: "denom" },
    ],
  };

  it("o prompt injeta o vocabulário permitido (IDs dos componentes)", () => {
    const msg = buildUserMessage(iface);
    expect(msg).toMatch(/VOCABULÁRIO PERMITIDO/);
    expect(msg).toContain("numline");
    expect(msg).toContain("denom");
  });

  it("filtra entradas cujo selection está FORA da interface; mantém as válidas e as sem selection", () => {
    const allowed = new Set(iface.components.flatMap((c) => [canon(c.id), canon(c.label)]));
    const entries = [
      { selection: "numline", wrongAnswer: "0/4" }, // válido
      { selection: "campoInventado", wrongAnswer: "9" }, // FORA → cai
      { wrongAnswer: "7" }, // sem selection → mantém (prompt é a barreira)
    ];
    const { kept, dropped } = restrictToComponents(entries, allowed);
    expect(dropped).toBe(1);
    expect(kept.map((e) => e.wrongAnswer)).toEqual(["0/4", "7"]);
  });

  it("sem componentes declarados, não filtra nada", () => {
    const { kept, dropped } = restrictToComponents([{ selection: "x" }], new Set());
    expect(dropped).toBe(0);
    expect(kept).toHaveLength(1);
  });
});
