/** Análise confirmatória congelada do holdout clean-room v0.8. */
import fs from "node:fs";
import path from "node:path";
import { analisarRegistro } from "./metricas.mjs";
import { criarPrng, DATASET_NAME } from "../../scripts/gerar-holdout-cleanroom-v08.mjs";

export const SEED_PERMUTACAO = 8042026;
export const SEED_BOOTSTRAP = 8042027;
export const N_PERMUTACOES = 100_000;
export const N_BOOTSTRAP = 10_000;

/** Converte a referência CC0 para o contrato caminho/items já usado pela v0.8. */
export function referenciaMetricaDoCleanRoom(reference) {
  if (!Array.isArray(reference?.correctPath) || !reference.correctPath.length) {
    throw new Error("referência clean-room sem correctPath");
  }
  const caminho = reference.correctPath.map((s, sourceIndex) => ({
    id: s.id,
    ordem: s.order,
    selecao: s.componentSemantic,
    acao: s.action,
    bruto: String(s.value),
    valor: String(s.value),
    ator: "Student",
    sistema: false,
    mecanico: false,
    dicasTexto: (s.hints || []).map((hint) => String(hint.text)),
    sourceIndex,
  }));
  const items = reference.correctPath.flatMap((s, sourceIndex) =>
    (s.predictableErrors || []).map((error) => ({
      id: error.id,
      valor: String(error.wrongValue),
      bruto: String(error.wrongValue),
      passo: sourceIndex,
      passoRel: sourceIndex / reference.correctPath.length,
      componente: s.componentSemantic,
      acao: s.action,
      devolutiva: String(error.feedback || ""),
    })),
  );
  return {
    id: reference.id,
    family: reference.family,
    resposta: String(reference.correctAnswer),
    nPassos: caminho.length,
    values: new Set(items.map((item) => item.valor)),
    caminho,
    items,
  };
}

export function carregarReferenciasCleanRoom({ raiz = ".", dataset = DATASET_NAME } = {}) {
  const problemsDir = path.resolve(raiz, "datasets", dataset, "problems");
  if (!fs.existsSync(problemsDir)) throw new Error(`holdout ausente: ${problemsDir}`);
  const out = {};
  for (const id of fs.readdirSync(problemsDir).sort()) {
    const file = path.join(problemsDir, id, "reference-v08.json");
    if (!fs.existsSync(file)) continue;
    const reference = JSON.parse(fs.readFileSync(file, "utf8"));
    if (reference.id !== id) throw new Error(`id divergente em ${file}`);
    out[id] = referenciaMetricaDoCleanRoom(reference);
  }
  if (Object.keys(out).length !== 50) throw new Error(`holdout deveria ter 50 referências; recebeu ${Object.keys(out).length}`);
  return out;
}

function f1Sai(resultado) {
  const value = resultado?.alignments?.sai?.metrics?.f1;
  return Number.isFinite(value) ? value : 0;
}

function behaviorGraphDoEstagio(run, stage) {
  if (stage === "bruto") return run?.bruto?.behaviorGraph ?? run?.behaviorGraphBruto ?? null;
  if (stage === "final") return run?.materializado?.behaviorGraph ?? null;
  throw new Error(`estágio desconhecido: ${stage}`);
}

/** Pontua os dois grafos do mesmo run; nenhuma referência é usada para construir o candidato. */
export function analisarParCleanRoom(run, referencia, metadata = {}) {
  const rawGraph = behaviorGraphDoEstagio(run, "bruto");
  const finalGraph = behaviorGraphDoEstagio(run, "final");
  if (!rawGraph || !finalGraph) throw new Error("run clean-room deve preservar behaviorGraph bruto e final");
  const common = {
    corpus: DATASET_NAME,
    arm: run?.modelos?.porAgente?.estudantes ?? metadata.model ?? null,
    exercise: run?.exercicio ?? run?.id,
    replica: run?.replica,
  };
  const bruto = analisarRegistro({ ...run, behaviorGraph: rawGraph }, referencia, {
    metadata: { ...common, stage: "graphforge-bruto" },
  });
  const final = analisarRegistro({ ...run, materializado: { ...(run.materializado || {}), behaviorGraph: finalGraph } }, referencia, {
    metadata: { ...common, stage: "materializado-agent6-agent7" },
  });
  const brutoSaiF1 = f1Sai(bruto);
  const finalSaiF1 = f1Sai(final);
  return {
    problemId: common.exercise,
    model: common.arm,
    replica: Number(run.replica),
    valid: true,
    brutoSaiF1,
    finalSaiF1,
    deltaSaiF1: finalSaiF1 - brutoSaiF1,
    bruto,
    final,
  };
}

const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

/**
 * Aplica intenção de coletar e colapsa as dez réplicas antes da inferência.
 * Um run ausente/inválido entra com F1=0 nos dois estágios e permanece no log.
 */
export function construirBlocosConfirmatorios({ pares = [], problemIds, models, replicas = 10 }) {
  if (!Array.isArray(problemIds) || problemIds.length !== 50) throw new Error("problemIds deve conter os 50 problemas congelados");
  if (!Array.isArray(models) || models.length !== 3) throw new Error("models deve conter os três modelos congelados");
  if (!Number.isInteger(replicas) || replicas !== 10) throw new Error("o protocolo exige exatamente 10 réplicas");
  const byKey = new Map();
  for (const pair of pares) {
    const key = `${pair.problemId}\u0000${pair.model}\u0000${Number(pair.replica)}`;
    if (byKey.has(key)) throw new Error(`run duplicado: ${key}`);
    byKey.set(key, pair);
  }
  const runs = [];
  for (const problemId of problemIds) {
    for (const model of models) {
      for (let replica = 1; replica <= replicas; replica++) {
        const key = `${problemId}\u0000${model}\u0000${replica}`;
        const pair = byKey.get(key);
        runs.push(pair
          ? { ...pair, missing: false }
          : { problemId, model, replica, valid: false, missing: true, brutoSaiF1: 0, finalSaiF1: 0, deltaSaiF1: 0 });
      }
    }
  }
  const unexpected = [...byKey.keys()].filter((key) => !runs.some((run) => `${run.problemId}\u0000${run.model}\u0000${run.replica}` === key));
  if (unexpected.length) throw new Error(`runs fora do plano: ${unexpected.slice(0, 3).join(", ")}`);
  const modelBlocks = [];
  for (const problemId of problemIds) {
    for (const model of models) {
      const selected = runs.filter((run) => run.problemId === problemId && run.model === model);
      const raw = mean(selected.map((run) => Number.isFinite(run.brutoSaiF1) ? run.brutoSaiF1 : 0));
      const final = mean(selected.map((run) => Number.isFinite(run.finalSaiF1) ? run.finalSaiF1 : 0));
      modelBlocks.push({
        problemId,
        model,
        replicas,
        runsValidos: selected.filter((run) => run.valid).length,
        runsAusentes: selected.filter((run) => run.missing).length,
        brutoSaiF1: raw,
        finalSaiF1: final,
        deltaSaiF1: final - raw,
      });
    }
  }
  // Unidade primária: problema. Os três modelos compartilham exatamente os
  // mesmos 50 itens, portanto são agregados antes da inferência confirmatória.
  const problemBlocks = problemIds.map((problemId) => {
    const selected = modelBlocks.filter((block) => block.problemId === problemId);
    return {
      problemId,
      models: selected.length,
      brutoSaiF1: mean(selected.map((block) => block.brutoSaiF1)),
      finalSaiF1: mean(selected.map((block) => block.finalSaiF1)),
      deltaSaiF1: mean(selected.map((block) => block.deltaSaiF1)),
    };
  });
  return { runs, modelBlocks, problemBlocks };
}

export function testePermutacaoSinais(blocks, { iterations = N_PERMUTACOES, seed = SEED_PERMUTACAO } = {}) {
  if (!blocks.length) throw new Error("teste requer blocos");
  const deltas = blocks.map((block) => Number(block.deltaSaiF1));
  if (deltas.some((value) => !Number.isFinite(value))) throw new Error("delta não finito");
  const observed = mean(deltas);
  const threshold = Math.abs(observed) - 1e-15;
  const rng = criarPrng(seed);
  let extreme = 0;
  for (let iteration = 0; iteration < iterations; iteration++) {
    let sum = 0;
    for (const delta of deltas) sum += (rng() < 0.5 ? -1 : 1) * delta;
    if (Math.abs(sum / deltas.length) >= threshold) extreme++;
  }
  return {
    method: "paired_sign_flip_monte_carlo_two_sided",
    estimand: "mean(final_sai_f1 - raw_sai_f1) over problems after averaging replicas and models",
    blocks: deltas.length,
    observedMeanDelta: observed,
    iterations,
    seed,
    pValue: (extreme + 1) / (iterations + 1),
  };
}

const percentile = (sorted, p) => {
  const position = (sorted.length - 1) * p;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  if (low === high) return sorted[low];
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
};

export function bootstrapProblemas(blocks, { iterations = N_BOOTSTRAP, seed = SEED_BOOTSTRAP } = {}) {
  if (blocks.length !== 50 || new Set(blocks.map((block) => block.problemId)).size !== 50) {
    throw new Error(`bootstrap exige exatamente 50 blocos de problema; recebeu ${blocks.length}`);
  }
  const rng = criarPrng(seed);
  const estimates = [];
  for (let iteration = 0; iteration < iterations; iteration++) {
    const sampled = [];
    for (let i = 0; i < blocks.length; i++) sampled.push(blocks[Math.floor(rng() * blocks.length)].deltaSaiF1);
    estimates.push(mean(sampled));
  }
  estimates.sort((a, b) => a - b);
  return {
    method: "cluster_percentile_bootstrap_by_problem",
    iterations,
    seed,
    estimate: mean(blocks.map((block) => block.deltaSaiF1)),
    confidenceLevel: 0.95,
    lower: percentile(estimates, 0.025),
    upper: percentile(estimates, 0.975),
  };
}

export function resumirConfirmatorio({ pares, problemIds, models }) {
  const { runs, modelBlocks, problemBlocks } = construirBlocosConfirmatorios({ pares, problemIds, models, replicas: 10 });
  return {
    schema: "sti.holdout-cleanroom-v08.confirmatory-analysis/1",
    protocol: "docs/EMENDA-V0.8-02-HOLDOUT-CLEANROOM-2026-08-20.md",
    design: { problems: 50, models: 3, replicas: 10, expectedRuns: 1500, inferentialBlocks: 50 },
    completeness: {
      validRuns: runs.filter((run) => run.valid).length,
      missingRuns: runs.filter((run) => run.missing).length,
    },
    primary: {
      permutation: testePermutacaoSinais(problemBlocks),
      confidenceInterval: bootstrapProblemas(problemBlocks),
    },
    problemBlocks,
    modelBlocks,
  };
}
