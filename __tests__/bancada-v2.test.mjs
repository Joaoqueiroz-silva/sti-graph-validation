/**
 * bancada-v2.test.mjs — comparador JUSTO da bancada CTAT v2 (2026-08-14).
 *
 * Trava os quatro antídotos (tudo offline, determinístico):
 *   1. produto vs estágio: o catálogo stepDiagnostics concreto entra no
 *      conjunto candidato; template {A} fica de fora;
 *   2. posição justa: valor certo a ±20% do caminho casa mesmo com
 *      granularidades diferentes; fora da tolerância não casa;
 *   3. precision@k: o sem-teto não é punido além do orçamento do especialista;
 *   4. TOST: equivalência só com IC dentro da margem pré-declarada; pareamento
 *      é 1-para-1 (um candidato não cobre dois itens da referência).
 */

import { describe, it, expect } from "vitest";
import {
  candidatosDoRegistro,
  parear,
  pontuarRun,
  tostEquivalencia,
  TOLERANCIA_PRIMARIA,
  MARGEM_EQUIVALENCIA,
} from "../analysis/bancada-v2/comparar-justo.mjs";

const runSintetico = () => ({
  exercicio: "00bubble",
  grafo: {
    passos: [{ indice: 1 }, { indice: 2 }, { indice: 3 }, { indice: 4 }],
    erros: [
      { valor: "5", passo: 1 },
      { valor: "4/9", passo: 2 },
    ],
    dicas: [],
  },
  bruto: {
    tracos: {
      atRiskTrace: {
        solutions: [
          {
            stepDiagnostics: [
              {
                step: 3,
                errors: [
                  { wrongAnswerPattern: "40", buggyRule: "x" },
                  { wrongAnswerPattern: "{A}+{B}", buggyRule: "template" },
                  { wrongAnswerPattern: "5/1", buggyRule: "mesmo valor de 5, mas em OUTRO passo" },
                  { wrongAnswerPattern: "40", buggyRule: "duplicata exata (valor e passo)" },
                ],
              },
            ],
          },
        ],
      },
    },
  },
});

// referência com 9 passos (granularidade do especialista) — posições relativas
const refSintetica = () => ({
  items: [
    { valor: "5", passoRel: 0.0, passo: 0 }, // agente tem "5" em passoRel 0.0 → casa
    { valor: "40", passoRel: 0.55, passo: 5 }, // catálogo tem "40" em (3-1)/4=0.5 → dist 0.05 → casa
    { valor: "7", passoRel: 0.9, passo: 8 }, // ninguém previu → não casa
  ],
});

describe("bancada v2 — conjunto candidato (produto vs estágio)", () => {
  it("produto = grafo + catálogo concreto; template fora; dedup por (valor, passo)", () => {
    const { candidatos } = candidatosDoRegistro(runSintetico(), { conjunto: "produto" });
    const valores = candidatos.map((c) => c.valor);
    expect(valores).toContain("5");
    expect(valores).toContain("4/9");
    expect(valores).toContain("40"); // veio do catálogo
    expect(valores.some((v) => v.includes("{"))).toBe(false); // template não entra
    // "5/1" canoniza para "5" mas está em OUTRO passo → candidato posicional
    // distinto (dedup é por valor+passo, nunca só por valor)
    expect(valores.filter((v) => v === "5")).toHaveLength(2);
    // duplicata exata ("40" no mesmo passo 3) é descartada
    expect(valores.filter((v) => v === "40")).toHaveLength(1);
    expect(candidatos.find((c) => c.valor === "40").origem).toBe("catalogo");
  });

  it("estágio = só o grafo autorado", () => {
    const { candidatos } = candidatosDoRegistro(runSintetico(), { conjunto: "estagio" });
    expect(candidatos.map((c) => c.valor).sort()).toEqual(["4/9", "5"]);
  });
});

describe("bancada v2 — posição justa e pareamento 1-para-1", () => {
  it("valor certo dentro de ±20% casa; fora não casa", () => {
    const cand = [{ valor: "5", passoRel: 0.1, rank: 0 }];
    const perto = parear([{ valor: "5", passoRel: 0.25 }], cand, { tol: 0.2 });
    expect(perto.pares).toHaveLength(1);
    const longe = parear([{ valor: "5", passoRel: 0.5 }], cand, { tol: 0.2 });
    expect(longe.pares).toHaveLength(0);
  });

  it("um candidato não cobre dois itens da referência", () => {
    const cand = [{ valor: "5", passoRel: 0.1, rank: 0 }];
    const ref = [
      { valor: "5", passoRel: 0.05 },
      { valor: "5", passoRel: 0.15 },
    ];
    const r = parear(ref, cand, { tol: 0.2 });
    expect(r.pares).toHaveLength(1); // 1-para-1, o mais próximo vence
    expect(r.pares[0].ref.passoRel).toBe(0.05);
  });

  it("pontuarRun: cobertura justa imune à granularidade 9 vs 4", () => {
    const p = pontuarRun(runSintetico(), refSintetica(), { conjunto: "produto", tol: 0.2 });
    expect(p.coberturaJusta).toBeCloseTo(2 / 3); // "5" e "40" casam; "7" não
    expect(p.coberturaValor).toBeCloseTo(2 / 3);
    expect(p.nCandidatos).toBe(4); // 5@1, 4/9@2, 40@3, 5@3
    // simétrica: 2 dos 4 candidatos foram cobertos pelo especialista
    expect(p.expertCobreAgente).toBeCloseTo(2 / 4);
    // precision@k com k=3 (orçamento do especialista): top-3 = 5@1, 4/9@2, 40@3 → 2 casam
    expect(p.precisaoAtK).toBeCloseTo(2 / 3);
  });
});

describe("bancada v2 — equivalência TOST pré-declarada", () => {
  const linhas = (delta) =>
    Array.from({ length: 24 }, (_, i) => ({
      ex: `ex${i}`,
      a: 0.5 + (i % 3) * 0.01,
      b: 0.5 + (i % 3) * 0.01 - delta,
    }));

  it("diferença pequena e estável → equivalente dentro da margem", () => {
    const t = tostEquivalencia(linhas(0.02), "a", "b");
    expect(t.equivalente).toBe(true);
    expect(Math.abs(t.diferencaMedia - 0.02)).toBeLessThan(1e-9);
  });

  it("diferença maior que a margem → equivalência NÃO demonstrada", () => {
    const t = tostEquivalencia(linhas(0.25), "a", "b");
    expect(t.equivalente).toBe(false);
  });

  it("as regras pré-declaradas são as documentadas", () => {
    expect(TOLERANCIA_PRIMARIA).toBe(0.2);
    expect(MARGEM_EQUIVALENCIA).toBe(0.1);
  });
});
