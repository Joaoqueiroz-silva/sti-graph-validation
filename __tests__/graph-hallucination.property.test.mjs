/**
 * Property tests P1–P7 (handoff 2026-06-30, T2): os sinais DUROS do detector de
 * alucinação são INVARIANTES do graphForge — para QUALQUER config válida, o grafo
 * gerado não pode ter ciclo patológico, nó órfão, beco sem saída, scaffold órfão
 * nem aresta órfã.
 *
 * fast-check gera configs aleatórias → graphForge (determinístico) → intrinsicReport.
 * Se alguma config produzir violação DURA, o fast-check imprime o contraexemplo
 * minimizado (shrinking) — vira caso de regressão dirigido.
 *
 * Nº de grafos: STI_PROPTEST_RUNS (default 10 000, como pede o handoff). Para
 * iteração local rápida: STI_PROPTEST_RUNS=500 npx vitest run …
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { graphForge } from "../graphforge.js";
import { intrinsicReport } from "../graph-hallucination.js";

const RUNS = parseInt(process.env.STI_PROPTEST_RUNS || "10000", 10);

const shortStr = fc.string({ minLength: 1, maxLength: 12 });
const kcId = fc.constantFrom("kc_a", "kc_b", "kc_c", "kc_contagem", "kc_fracao");

const misconceptionArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 10 }).map((s) => "misc_" + s.replace(/\W/g, "_")),
  type: fc.constantFrom("conceptual_error", "procedural_error", "off_by_one"),
  wrongAnswer: shortStr,
  description: shortStr,
  feedback: shortStr,
  severity: fc.constantFrom("low", "moderate", "high"),
});

/** Config aleatória no contrato do graphForge (steps + misconceptions/hints por índice). */
const configArb = fc
  .integer({ min: 1, max: 8 })
  .chain((nSteps) =>
    fc.record({
      steps: fc.constant(nSteps),
      stepData: fc.array(fc.record({ kc: kcId, action: shortStr, result: shortStr }), {
        minLength: nSteps,
        maxLength: nSteps,
      }),
      miscAt: fc.array(
        fc.record({
          idx: fc.integer({ min: 0, max: nSteps - 1 }),
          miscs: fc.array(misconceptionArb, { minLength: 1, maxLength: 3 }),
        }),
        { minLength: 0, maxLength: 4 }
      ),
      hintAt: fc.array(
        fc.record({
          idx: fc.integer({ min: 0, max: nSteps - 1 }),
          hints: fc.array(shortStr, { minLength: 1, maxLength: 2 }),
        }),
        { minLength: 0, maxLength: 3 }
      ),
      profile: fc.constantFrom("reader", "pre_reader"),
      difficulty: fc.constantFrom("easy", "medium", "hard"),
    })
  )
  .map(({ steps, stepData, miscAt, hintAt, profile, difficulty }) => {
    const config = {
      steps: stepData.map((s, i) => ({ index: i + 1, ...s })),
      misconceptions: {},
      hints: {},
      kcs: [
        { id: "kc_a", name: "KC A" },
        { id: "kc_b", name: "KC B" },
      ],
      profile,
      difficulty,
    };
    for (const { idx, miscs } of miscAt) {
      config.misconceptions[idx] = (config.misconceptions[idx] || []).concat(miscs);
    }
    for (const { idx, hints } of hintAt) {
      config.hints[idx] = (config.hints[idx] || []).concat(hints);
    }
    return config;
  });

describe(`P1–P7: DUROS = invariantes do graphForge (${RUNS} grafos aleatórios)`, () => {
  it("nenhuma config produz violação DURA", () => {
    fc.assert(
      fc.property(configArb, (config) => {
        const { graph } = graphForge(config);
        const r = intrinsicReport(graph);
        // P1 conectividade: todo nó alcançável de start
        expect(r.hard.unreachableNodes).toEqual([]);
        // P2 co-alcance: nenhum beco sem saída (todo nó chega ao goal)
        expect(r.hard.deadEndNodes).toEqual([]);
        // P3 integridade referencial: nenhum scaffold órfão
        expect(r.hard.scaffoldsWithoutMisc).toEqual([]);
        // P4 backbone (arestas correct) acíclico
        expect(r.hard.backboneCycles).toEqual([]);
        // P5 ciclo patológico = 0 (todo ciclo passa por remediação)
        expect(r.hard.pathologicalCycles).toEqual([]);
        // P6 nenhuma aresta órfã
        expect(r.hard.orphanEdges).toEqual([]);
        // P7 flag consolidada: grafo do gerador nunca é barrado
        expect(r.hallucinationFlag).toBe(false);
      }),
      { numRuns: RUNS }
    );
  });
});
