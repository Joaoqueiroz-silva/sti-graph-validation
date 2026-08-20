import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CELULAS_630,
  TOTAL_RUNS_ESPERADO,
  carregarReferenciaDoDataset,
  enumerarArquivos630,
  interpretarArgumentos,
  reguasDoResultado,
  resumirMetricasNumericas,
  resumirResultadosCelula,
  validarDefinicaoCelulas,
} from "../analysis/orientador-v08/consolidar-630.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function alinhamento({ ref = 2, mat = 3, resolvable = 2, matches = 2, exact = 1 } = {}) {
  return {
    matches: Array.from({ length: matches }, (_, index) => ({ refIndex: index, agentIndex: index })),
    unmatchedReference: Array.from({ length: Math.max(0, ref - matches) }),
    unmatchedMaterialized: Array.from({ length: Math.max(0, mat - matches) }),
    denominators: { reference: ref, materialized: mat, resolvableMaterialized: resolvable },
    score: { componentActionValue: exact, componentValue: 0, valueOnly: matches - exact },
    metrics: {
      recallAny: ref ? matches / ref : null,
      precisionAny: mat ? matches / mat : null,
      nested: { diagnostic: 0.25 },
    },
  };
}

function lcs({ ref = 2, mat = 3, eligibleRef = 2, eligibleMat = 2, matches = 2, tier = 2 } = {}) {
  return {
    matches: Array.from({ length: matches }, (_, index) => ({
      refIndex: index,
      agentIndex: index,
      tier,
    })),
    unmatchedReference: Array.from({ length: Math.max(0, ref - matches) }),
    unmatchedMaterialized: Array.from({ length: Math.max(0, mat - matches) }),
    denominators: {
      reference: ref,
      materialized: mat,
      eligibleReference: eligibleRef,
      eligibleMaterialized: eligibleMat,
    },
    metrics: {
      matches,
      recall: ref ? matches / ref : null,
      precision: mat ? matches / mat : null,
      eligibleRecall: eligibleRef ? matches / eligibleRef : null,
      eligiblePrecision: eligibleMat ? matches / eligibleMat : null,
      nested: { diagnostic: 0.25 },
    },
  };
}

function resultadoBase({ plural = false, exercise = "ex1" } = {}) {
  const operational = alinhamento();
  const base = {
    metadata: { exercise },
    atoms: {
      materialized: [
        {
          id: "a1", status: "exact_target", statuses: ["exact_target"],
          component: "f1", action: "update", value: "3", compositeUnresolved: false,
        },
        {
          id: "a2", status: "unknown_action", statuses: ["exact_target", "unknown_action"],
          component: "f2", action: "", value: "5", compositeUnresolved: false,
        },
        {
          id: "a3", status: "composite_unresolved", statuses: ["composite_unresolved"],
          component: "", action: "", value: "1,2,3", compositeUnresolved: true,
        },
      ],
    },
    errors: {
      matching: {
        pairs: [{}],
        unmatchedReference: [{}],
        unmatchedMaterialized: [{}, {}],
        unanchoredReference: [{}],
        metrics: {
          matched: 1,
          referenceComparable: 2,
          referenceUnanchored: 1,
          materialized: 3,
          precision: 1 / 3,
          recall: 1 / 2,
          f1: 0.4,
        },
      },
    },
    hints: {
      metrics: {
        referenceStatesWithHints: 2,
        materializedStatesWithHints: 3,
        alignedStatesWithHintsOnBothSides: 1,
        referenceMessages: 3,
        materializedMessages: 12,
        extraMaterializedMessages: 9,
      },
    },
    extrasLedger: [
      { type: "state", reason: "unmatched_materialized_state", source: "agent6", judgment: "inventory_only" },
      { type: "error", reason: "unmatched_state", source: null, judgment: "inventory_only" },
      { type: "hint", reason: "beyond_reference_ladder", source: "agent6", judgment: "inventory_only" },
      { type: "state", reason: "unresolved_operational_state", source: "agent6", judgment: "inventory_only", isExtra: false },
    ],
  };
  if (plural) {
    base.alignments = {
      operational: lcs({ matches: 2, tier: 2 }),
      sai: lcs({ matches: 1, tier: 3 }),
      valueOnly: lcs({ matches: 2, tier: 1, eligibleMat: 3 }),
    };
    // O legado conflitante não pode substituir a régua plural operacional.
    base.alignment = alinhamento({ matches: 0, exact: 0 });
  } else base.alignment = operational;
  return base;
}

describe("manifesto fechado das 10 células / 630 runs", () => {
  it("declara dez células únicas e soma exatamente 630", () => {
    expect(validarDefinicaoCelulas(CELULAS_630)).toEqual({
      numeroCelulas: 10,
      totalEsperado: TOTAL_RUNS_ESPERADO,
    });
    expect(new Set(CELULAS_630.map((c) => `${c.corpus}/${c.braco}`)).size).toBe(10);
    expect(new Set(CELULAS_630.map((c) => c.runsDir)).size).toBe(10);
  });

  it("enumera no snapshot público exatamente 10 células e 630 JSONs", () => {
    const inventario = enumerarArquivos630({ raiz: repo });
    expect(inventario).toHaveLength(10);
    expect(inventario.reduce((soma, c) => soma + c.arquivos.length, 0)).toBe(630);
    expect(inventario.every((c) => c.arquivos.length === c.esperados)).toBe(true);
  });

  it("rejeita alteração silenciosa da cardinalidade", () => {
    expect(() => validarDefinicaoCelulas(CELULAS_630.slice(0, 9))).toThrow(/esperadas 10 células/);
    const adulteradas = CELULAS_630.map((c, i) => i === 0 ? { ...c, esperados: 71 } : c);
    expect(() => validarDefinicaoCelulas(adulteradas)).toThrow(/definição soma 629/);
  });
});

describe("troca de dataset e contratos de alinhamento", () => {
  it("expõe STI_DATASET ao carregador e restaura o valor anterior mesmo em erro", () => {
    const anterior = process.env.STI_DATASET;
    process.env.STI_DATASET = "dataset-anterior";
    try {
      const visto = carregarReferenciaDoDataset("dataset-alvo", repo, () => process.env.STI_DATASET);
      expect(visto).toBe("dataset-alvo");
      expect(process.env.STI_DATASET).toBe("dataset-anterior");
      expect(() => carregarReferenciaDoDataset("dataset-erro", repo, () => {
        expect(process.env.STI_DATASET).toBe("dataset-erro");
        throw new Error("falha simulada");
      })).toThrow("falha simulada");
      expect(process.env.STI_DATASET).toBe("dataset-anterior");
    } finally {
      if (anterior === undefined) delete process.env.STI_DATASET;
      else process.env.STI_DATASET = anterior;
    }
  });

  it("aceita operational/sai/valueOnly e preserva fallback de alignment", () => {
    const plural = resultadoBase({ plural: true });
    expect(Object.keys(reguasDoResultado(plural))).toEqual(["operational", "sai", "valueOnly"]);
    expect(reguasDoResultado(plural).operational.matches).toHaveLength(2);
    expect(Object.keys(reguasDoResultado(resultadoBase()))).toEqual(["operational"]);
  });
});

describe("agregação pura por corpus e braço", () => {
  it("agrega resolução, todas as réguas, erros, dicas e extras por ocorrência", () => {
    const resumo = resumirResultadosCelula(
      [resultadoBase({ plural: true, exercise: "ex1" }), resultadoBase({ plural: true, exercise: "ex2" })],
      { corpus: "6.17", dataset: "frac-numberline-6.17", braco: "custo-beneficio", esperados: 2 },
    );

    expect(resumo).toMatchObject({
      corpus: "6.17",
      arm: "custo-beneficio",
      expectedRuns: 2,
      runs: 2,
      exercises: 2,
    });
    expect(resumo.resolutionCoverage).toMatchObject({
      materializedAtoms: 6,
      componentsResolved: 4,
      actionsResolved: 2,
      fullSaiResolved: 2,
      fullSaiResolutionRate: 1 / 3,
    });
    expect(resumo.resolutionCoverage.statusFlagCounts).toMatchObject({
      exact_target: 4,
      unknown_action: 2,
      composite_unresolved: 2,
    });
    expect(Object.keys(resumo.alignments)).toEqual(["operational", "sai", "valueOnly"]);
    expect(resumo.alignments.operational).toMatchObject({
      nRuns: 2,
      micro: {
        reference: 4,
        materialized: 6,
        matched: 4,
        exactComponentActionValue: 0,
        recallAny: 1,
        precisionAny: 2 / 3,
        eligibleReference: 4,
        eligibleMaterialized: 4,
        eligibleRecall: 1,
        eligiblePrecision: 1,
        materializedEligibilityRate: 2 / 3,
      },
    });
    expect(resumo.alignments.operational.metricsPerRun["nested.diagnostic"]).toEqual({
      n: 2,
      sum: 0.5,
      mean: 0.25,
      min: 0.25,
      max: 0.25,
    });
    expect(resumo.errors.micro).toMatchObject({
      matched: 2,
      referenceComparable: 4,
      materialized: 6,
      precision: 1 / 3,
      recall: 1 / 2,
      f1: 0.4,
    });
    expect(resumo.hints.micro).toMatchObject({
      referenceStatesWithHints: 4,
      materializedStatesWithHints: 6,
      alignedStatesWithHintsOnBothSides: 2,
      presencePrecision: 1 / 3,
      presenceRecall: 1 / 2,
      presenceF1: 0.4,
    });
    expect(resumo.extras).toMatchObject({
      occurrences: 6,
      inventoryOccurrences: 8,
      nonExtraInventoryOccurrences: 2,
      byType: { error: 2, hint: 2, state: 2 },
      byJudgment: { inventory_only: 6 },
      nonExtraInventoryByType: { state: 2 },
    });
  });

  it("preserva qualquer métrica numérica futura sem confundir null com zero", () => {
    expect(resumirMetricasNumericas([
      { recall: 0, futura: { cobertura: 0.75 }, ausente: null },
      { recall: 1, futura: { cobertura: 0.25 }, texto: "x" },
    ])).toEqual({
      "futura.cobertura": { n: 2, sum: 1, mean: 0.5, min: 0.25, max: 0.75 },
      recall: { n: 2, sum: 1, mean: 0.5, min: 0, max: 1 },
    });
  });

  it("interpreta somente os argumentos documentados", () => {
    expect(interpretarArgumentos(["--raiz", repo, "--json", "saida.json"])).toEqual({
      raiz: repo,
      json: "saida.json",
      help: false,
    });
    expect(interpretarArgumentos(["--help"]).help).toBe(true);
    expect(() => interpretarArgumentos(["--json"])).toThrow(/requer um caminho/);
    expect(() => interpretarArgumentos(["--desconhecido"])).toThrow(/argumento desconhecido/);
  });
});
