/**
 * analysis/reproduce-lib.mjs - biblioteca comum dos caminhos de reprodução da
 * Campanha 5 como benchmark (reproduce:verify e reproduce:collect).
 *
 * Tudo aqui é OFFLINE e determinístico. Três responsabilidades:
 *
 *   1. leitura dos runs brutos no formato flat depositado em
 *      resultados/campanha5-2026-07-19/<braço>/runs/*.json;
 *   2. agregação com bootstrap por CLUSTER (exercício), 10.000 reamostragens,
 *      seed 42, o mesmo protocolo declarado nos summary.json depositados;
 *   3. reconstrução por chaves canônicas do recallMisconceptionsConceptual a
 *      partir dos campos `missing` dos runs + envelope-b do dataset.
 *
 * NOTA DE FIDELIDADE (2026-07-20): as seis métricas gravadas POR RUN (recall,
 * conceptual, f1, precision, functionalAgreement, functionalKappa) recomputam
 * as médias dos summary.json exatamente (diferença máxima observada 5e-5, que
 * é o arredondamento de 4 casas). O recallMisconceptionsConceptual NÃO é um
 * campo por run: foi derivado no ambiente de coleta. A reconstrução daqui
 * (cobertura das chaves não mecânicas do envelope-b pelas chaves canônicas do
 * robô) reproduz cada média de braço com diferença de 0,003 a 0,006, SEMPRE
 * igual ou abaixo do valor preservado (reconstrução conservadora). O valor
 * canônico segue sendo o summary.json depositado, ancorado por hash no
 * manuscrito v7 (analysis/validate-article-v7.mjs). Os limites do IC são
 * estimativas de Monte Carlo: com outro fluxo de RNG os limites variam menos
 * de 0,006 mesmo com a mesma semente declarada.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mulberry32, mean, percentile } from "../stats.js";
import { miscKey } from "../schema.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, "..");
export const C5_DIR = path.join(REPO, "resultados", "campanha5-2026-07-19");
export const DATASET_DIR = path.join(REPO, "datasets", "frac-numberline-6.17");
export const FINAL_ARM_DIR = path.join(C5_DIR, "6-final-megabrain");

/** Campos gravados POR RUN nos JSONs flat (recomputáveis com exatidão). */
export const RUN_BACKED_KEYS = [
  "recall",
  "conceptual",
  "f1",
  "precision",
  "functionalAgreement",
  "functionalKappa",
];

export const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

/** Lê os runs flat de um diretório runs/ (ordenados por nome de arquivo). */
export function readRuns(runsDir) {
  return fs
    .readdirSync(runsDir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => ({ file: f, ...readJson(path.join(runsDir, f)) }));
}

/**
 * Bootstrap por CLUSTER da média: reamostra exercícios inteiros (não linhas),
 * porque réplicas do mesmo problema não são independentes. Percentil com a
 * mesma interpolação de stats.js. Arredonda a 4 casas, como os summary.json.
 */
export function bootstrapClusterCI(rows, { iterations = 10000, seed = 42, alpha = 0.05 } = {}) {
  const clean = rows.filter((d) => Number.isFinite(d.value));
  const m = mean(clean.map((d) => d.value));
  const clusters = [...new Set(clean.map((d) => d.cluster))];
  const byC = new Map(clusters.map((c) => [c, clean.filter((d) => d.cluster === c)]));
  const rng = mulberry32(seed);
  const means = [];
  for (let b = 0; b < iterations; b++) {
    const sample = [];
    for (let k = 0; k < clusters.length; k++) {
      const c = clusters[Math.floor(rng() * clusters.length)];
      sample.push(...byC.get(c));
    }
    if (sample.length) means.push(mean(sample.map((d) => d.value)));
  }
  means.sort((a, b) => a - b);
  const r4 = (x) => (Number.isFinite(x) ? Math.round(x * 10000) / 10000 : x);
  return {
    mean: r4(m),
    lower: r4(percentile(means, alpha / 2)),
    upper: r4(percentile(means, 1 - alpha / 2)),
    nClusters: clusters.length,
  };
}

/** Chaves canônicas NÃO mecânicas do envelope-b de um problema do dataset. */
export function nonMechanicalKeys(problemId, datasetDir = DATASET_DIR) {
  const eb = readJson(path.join(datasetDir, "problems", problemId, "envelope-b.json"));
  return new Set(eb.misconceptions.filter((m) => !m.mechanical).map((m) => miscKey(m)));
}

/**
 * Reconstrução conservadora do recallMisconceptionsConceptual de UM run flat:
 * cobertura = chaves não mecânicas do envelope-b que NÃO constam de `missing`.
 * Referência vazia segue a convenção de prf(): recall 1.
 */
export function reconstructRmc(run, datasetDir = DATASET_DIR) {
  const nonmech = nonMechanicalKeys(run.id, datasetDir);
  const missing = new Set((run.missing || []).map(String));
  if (!nonmech.size) return 1;
  const covered = [...nonmech].filter((k) => !missing.has(k)).length;
  return covered / nonmech.size;
}

/**
 * Agrega um diretório de runs flat: as seis métricas por run + a reconstrução
 * do recallMisconceptionsConceptual, todas com bootstrap por cluster.
 */
export function aggregateRuns(runs, { datasetDir = DATASET_DIR, bootstrap = {} } = {}) {
  const metrics = {};
  for (const key of RUN_BACKED_KEYS) {
    metrics[key] = bootstrapClusterCI(
      runs.map((r) => ({ value: r[key], cluster: r.id })),
      bootstrap
    );
  }
  metrics.recallMisconceptionsConceptual = bootstrapClusterCI(
    runs.map((r) => ({ value: reconstructRmc(r, datasetDir), cluster: r.id })),
    bootstrap
  );
  return metrics;
}

/** Os seis braços depositados da Campanha 5, em ordem. */
export function listArms(c5Dir = C5_DIR) {
  return fs
    .readdirSync(c5Dir)
    .filter((d) => /^\d-/.test(d) && fs.existsSync(path.join(c5Dir, d, "summary.json")))
    .sort();
}

/** Dois intervalos [lower, upper] se sobrepõem? */
export function ciOverlap(a, b) {
  return a.lower <= b.upper && b.lower <= a.upper;
}

export const fmt3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : "n/a");
export const fmt4 = (x) => (Number.isFinite(x) ? x.toFixed(4) : "n/a");
