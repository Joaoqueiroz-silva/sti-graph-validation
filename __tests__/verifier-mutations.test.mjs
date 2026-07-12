/**
 * Mutation testing do verificador de invariantes (W3, gate G8 — 2026-07-12).
 *
 * O parecer externo: "encontrar zero violações demonstra principalmente que o construtor
 * respeita as próprias regras". Esta suíte fecha a lacuna provando a OUTRA direção:
 * quando o defeito EXISTE (injetado por operador de mutação determinístico), o
 * intrinsicReport o acusa (sensibilidade) — e acusa EXATAMENTE o sinal correspondente,
 * sem disparar os demais sinais duros (especificidade por mutação). O controle negativo
 * (grafos-base intactos limpos) dá a especificidade global.
 *
 * Fonte única dos operadores e dos grafos-base: analysis/mutation-report.mjs (o mesmo
 * código que gera analysis/derived/MUTATION-TESTING.md — teste e relatório nunca divergem).
 *
 * Grafos-base: construídos pelo graphforge.js standalone do repo (existe na raiz; não
 * importamos nada do backend), com topologia derivada do Envelope B dos 24 casos do
 * corpus CTAT 6.17 + 2 sintéticos de forma diferente. Saudáveis POR CONSTRUÇÃO — e
 * verificados como tal no primeiro describe.
 */
import { describe, expect, it } from "vitest";

import { intrinsicReport, hallucinationScore } from "../graph-hallucination.js";
import {
  HARD_SIGNALS,
  MUTATION_OPERATORS,
  buildBaseGraphs,
  evaluateMutant,
} from "../analysis/mutation-report.mjs";

// Construído uma vez: determinístico (ordem alfabética dos casos) e sem LLM.
const bases = buildBaseGraphs();

describe("conjunto-base — pré-condições da campanha", () => {
  it("tem os 24 casos do corpus + 2 sintéticos (26 grafos-base)", () => {
    expect(bases.filter((b) => b.source === "corpus")).toHaveLength(24);
    expect(bases.filter((b) => b.source === "sintetico")).toHaveLength(2);
  });

  it("todo operador é aplicável a todo grafo-base (nenhum mutante null)", () => {
    // Se algum caso do corpus vier sem scaffold ou com <2 steps, o operador devolve
    // null e a campanha perderia cobertura silenciosamente — este teste trava isso.
    const inaplicaveis = [];
    for (const op of MUTATION_OPERATORS)
      for (const b of bases) if (op.apply(b.graph) === null) inaplicaveis.push(`${op.id}@${b.id}`);
    expect(inaplicaveis).toEqual([]);
  });
});

describe("especificidade GLOBAL — grafos-base intactos passam limpos (controle negativo)", () => {
  it("cada grafo-base tem 0 violações duras, flag=false e score mole 0", () => {
    // Requisito do handoff: base que não passasse limpa seria excluída com registro.
    // Aqui nenhuma exclusão foi necessária — o assert cobre o conjunto INTEIRO.
    const sujos = bases
      .map((b) => {
        const r = intrinsicReport(b.graph);
        const s = hallucinationScore(r);
        return { id: b.id, hard: r.hardViolations, flag: r.hallucinationFlag, score: s.score };
      })
      .filter((x) => x.hard !== 0 || x.flag || x.score !== 0);
    expect(sujos).toEqual([]);
  });
});

describe("operadores de mutação — pureza e determinismo", () => {
  it("nenhum operador muta o grafo de entrada e duas aplicações dão o mesmo mutante", () => {
    const base = bases[0];
    const antes = JSON.stringify(base.graph);
    for (const op of MUTATION_OPERATORS) {
      const m1 = op.apply(base.graph);
      const m2 = op.apply(base.graph);
      expect(JSON.stringify(base.graph), `${op.id} mutou a entrada`).toBe(antes);
      expect(JSON.stringify(m1), `${op.id} não é determinístico`).toBe(JSON.stringify(m2));
    }
  });
});

describe("sensibilidade × especificidade POR MUTAÇÃO — operador × grafo-base", () => {
  // Para cada operador × cada grafo-base: o mutante dispara EXATAMENTE os sinais duros
  // esperados (missing=[] → sensibilidade; spurious=[] → especificidade da mutação).
  // Conjuntos com 2 sinais são implicação por definição, não espúrio (notas nos operadores).
  const duros = MUTATION_OPERATORS.filter((op) => !op.expectSoftScore);

  for (const op of duros) {
    it(`${op.id} (${op.defectClass}) → acusa exatamente [${op.expectedHard.join(", ")}] e barra o grafo, nos ${bases.length} grafos-base`, () => {
      for (const b of bases) {
        const mutant = op.apply(b.graph);
        const r = intrinsicReport(mutant);
        const ev = evaluateMutant(op, r);
        // objeto único no assert → uma falha diz o operador, a base e os sinais errados
        expect({
          base: b.id,
          missing: ev.missing,
          spurious: ev.spurious,
          flag: r.hallucinationFlag,
        }).toEqual({ base: b.id, missing: [], spurious: [], flag: true });
      }
    });
  }

  it(`m10_transicaoDuplicada (sinal MOLE) → score > 0 sem disparar NENHUM sinal duro nem barrar o grafo, nos ${bases.length} grafos-base`, () => {
    const op = MUTATION_OPERATORS.find((o) => o.id === "m10_transicaoDuplicada");
    for (const b of bases) {
      const r = intrinsicReport(op.apply(b.graph));
      const s = hallucinationScore(r);
      const firedHard = HARD_SIGNALS.filter((k) => r.hard[k].length > 0);
      expect({
        base: b.id,
        firedHard,
        flag: r.hallucinationFlag,
        parallelEdges: r.soft.parallelEdges.length,
        scorePositivo: s.score > 0,
      }).toEqual({
        base: b.id,
        firedHard: [],
        flag: false, // mole NÃO barra — é sinal de revisão, não veto
        parallelEdges: 1,
        scorePositivo: true,
      });
    }
  });
});

describe("cobertura da taxonomia de sinais duros", () => {
  it("os 10 operadores, juntos, exercitam os 7 sinais duros do intrinsicReport", () => {
    // Garante que nenhuma família de check dura fica sem mutante que a prove — se um
    // sinal novo entrar no verificador sem operador correspondente, este teste acusa.
    const cobertos = new Set(MUTATION_OPERATORS.flatMap((op) => op.expectedHard));
    expect([...HARD_SIGNALS].sort()).toEqual([...cobertos].sort());
  });
});
