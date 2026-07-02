/**
 * evaluation/stats.js — Teste de NÃO-INFERIORIDADE da semelhança.
 *
 * A pergunta: "a semelhança robô–humano é NÃO-INFERIOR à humano–humano?"
 *
 * Recebe uma lista de pares de semelhança rotulados por exercício e tipo:
 *   [{ value: 0.83, exercise: "ex1", pairType: "HH" | "RH" }, ...]
 *   HH = humano×humano (a régua) · RH = robô×humano
 *
 * Calcula a diferença de médias (RH − HH) e um IC 95% por BOOTSTRAP DE CLUSTER
 * (reamostra EXERCÍCIOS, não pares — porque pares do mesmo exercício/avaliador
 * não são independentes). Veredito vs a margem δ pré-registrada:
 *
 *   IC inteiro ≥ 0           → superior
 *   IC.lower  > −δ           → não-inferior   (é o que queremos: "tão bom quanto")
 *   IC.upper  < −δ           → inferior
 *   caso contrário           → inconclusivo (falta dado / poder)
 *
 * RNG semeado (mulberry32) → resultado reproduzível (não usa Math.random).
 */

/** Gerador pseudoaleatório determinístico (semeado). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);

export function percentile(sortedAsc, p) {
  if (!sortedAsc.length) return NaN;
  const i = p * (sortedAsc.length - 1);
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return lo === hi ? sortedAsc[lo] : sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (i - lo);
}

/**
 * @param {Array<{value:number,exercise:(string|number),pairType:'HH'|'RH'}>} data
 * @param {{margin?:number, iterations?:number, seed?:number}} opts
 */
export function nonInferiority(data, opts = {}) {
  const { margin = 0.1, iterations = 2000, seed = 12345 } = opts;
  const HH = data.filter((d) => d.pairType === "HH").map((d) => d.value);
  const RH = data.filter((d) => d.pairType === "RH").map((d) => d.value);
  const meanHH = mean(HH);
  const meanRH = mean(RH);
  const diff = meanRH - meanHH;

  const exercises = [...new Set(data.map((d) => d.exercise))];
  const byEx = new Map(exercises.map((e) => [e, data.filter((d) => d.exercise === e)]));
  const rng = mulberry32(seed);

  const diffs = [];
  for (let b = 0; b < iterations; b++) {
    const sample = [];
    for (let k = 0; k < exercises.length; k++) {
      const e = exercises[Math.floor(rng() * exercises.length)];
      sample.push(...byEx.get(e));
    }
    const hh = sample.filter((d) => d.pairType === "HH").map((d) => d.value);
    const rh = sample.filter((d) => d.pairType === "RH").map((d) => d.value);
    if (!hh.length || !rh.length) continue;
    diffs.push(mean(rh) - mean(hh));
  }
  diffs.sort((a, b) => a - b);
  const ci = { lower: percentile(diffs, 0.025), upper: percentile(diffs, 0.975) };

  let verdict;
  if (ci.lower >= 0) verdict = "superior";
  else if (ci.lower > -margin) verdict = "nao-inferior";
  else if (ci.upper < -margin) verdict = "inferior";
  else verdict = "inconclusivo";

  return {
    meanHH: r(meanHH),
    meanRH: r(meanRH),
    diff: r(diff),
    ci: { lower: r(ci.lower), upper: r(ci.upper) },
    margin,
    verdict,
    nExercises: exercises.length,
    nHH: HH.length,
    nRH: RH.length,
    // Inferência só é confiável com um nº razoável de exercícios (cluster bootstrap).
    reliable: exercises.length >= 10,
  };
}

function r(x) {
  return Number.isFinite(x) ? Math.round(x * 1000) / 1000 : x;
}

/**
 * IC bootstrap (percentil) da MÉDIA, com CLUSTER (reamostra clusters, não linhas —
 * porque medições do mesmo problema/corrida não são independentes). Reuso geral:
 * réplicas (cluster = problema) e diferença pareada real−shim (value = diff por problema).
 * @param {Array<{value:number, cluster:(string|number)}>} rows
 * @param {{iterations?:number, seed?:number, alpha?:number}} opts
 */
export function bootstrapCI(rows, opts = {}) {
  const { iterations = 2000, seed = 12345, alpha = 0.05 } = opts;
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
  return {
    mean: r(m),
    lower: r(percentile(means, alpha / 2)),
    upper: r(percentile(means, 1 - alpha / 2)),
    sd: r(Math.sqrt(mean(clean.map((d) => (d.value - m) ** 2)))),
    n: clean.length,
    nClusters: clusters.length,
  };
}

/** IC de Wilson para uma proporção (k/n) — bom p/ taxas do juiz com n pequeno. */
export function wilsonCI(k, n, z = 1.96) {
  if (!n) return { p: NaN, lower: NaN, upper: NaN, k, n };
  const p = k / n;
  const d = 1 + (z * z) / n;
  const center = p + (z * z) / (2 * n);
  const half = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { p: r(p), lower: r((center - half) / d), upper: r((center + half) / d), k, n };
}
