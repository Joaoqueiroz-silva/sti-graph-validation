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

  // 2026-07-12 (plano mestre §5.6): sem banda humano-humano o estimando NÃO É
  // IDENTIFICADO. Antes este caso saía como "inconclusivo" com reliable=true e
  // diff/IC nulos, como se um teste tivesse sido executado. Agora: não estimável,
  // sem números fabricados.
  if (HH.length === 0 || RH.length === 0) {
    return {
      meanHH: HH.length ? r(mean(HH)) : null,
      meanRH: RH.length ? r(mean(RH)) : null,
      diff: null,
      ci: null,
      margin,
      verdict: "nao_estimavel",
      reason: HH.length === 0 ? "sem pares humano-humano (nHH=0)" : "sem pares robo-humano (nRH=0)",
      nExercises: [...new Set(data.map((d) => d.exercise))].length,
      nHH: HH.length,
      nRH: RH.length,
      reliable: false,
    };
  }

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
    // 2026-07-12: confiável exige (a) exercícios suficientes pro cluster bootstrap
    // E (b) banda humano-humano presente — nHH=0 nunca chega aqui (guard acima),
    // mas a regra fica explícita por defesa em profundidade.
    reliable: exercises.length >= 10 && HH.length > 0,
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
  // DEPRECIADO 2026-07-12 (plano mestre §5.4): este p-valor conta estimativas
  // bootstrap que cruzam zero SEM construir a distribuição sob H0, e o piso 1/B
  // produz p-valores idênticos artificiais após Holm (os três p=0,0105 da v2.1).
  // Para teste de hipótese pareado use signFlipTest(); pBoot permanece só para
  // reproduzir os números legados da tag legacy-campaigns-2026-07.
  const B = means.length || 1;
  const propBelow = means.filter((x) => x <= 0).length / B;
  const propAbove = means.filter((x) => x >= 0).length / B;
  const pBoot = Math.max(1 / B, 2 * Math.min(propBelow, propAbove));
  return {
    mean: r(m),
    lower: r(percentile(means, alpha / 2)),
    upper: r(percentile(means, 1 - alpha / 2)),
    sd: r(Math.sqrt(mean(clean.map((d) => (d.value - m) ** 2)))),
    n: clean.length,
    nClusters: clusters.length,
    pBoot: Math.round(Math.min(1, pBoot) * 10000) / 10000,
  };
}

/**
 * Teste de permutação pareado por troca de sinais (sign-flip), construído sob H0.
 *
 * 2026-07-12 (plano mestre §5.4): o teste canônico para "condição A difere da
 * condição B?" com pareamento por exercício. Recebe as DIFERENÇAS por exercício
 * (uma por exercício, réplicas já agregadas), estatística = média. Sob H0 a
 * diferença de cada exercício tem sinal simétrico, então a distribuição nula é
 * gerada trocando sinais aleatoriamente. p bicaudal com correção add-one
 * ((c+1)/(B+1), Phipson & Smyth 2010), que nunca produz p=0 artificial.
 *
 * Para ≤ 24 exercícios (2^24 ≈ 16,7M, alguns segundos) enumera TODAS as 2^n
 * trocas: p EXATO, sem Monte Carlo — cobre o corpus atual (24 exercícios).
 * Acima disso, amostra `iterations` trocas com semente fixa.
 *
 * @param {number[]} diffs diferenças pareadas, uma por exercício
 * @param {{iterations?:number, seed?:number}} opts
 */
export function signFlipTest(diffs, opts = {}) {
  const { iterations = 100000, seed = 20260712 } = opts;
  const clean = diffs.filter((d) => Number.isFinite(d));
  const n = clean.length;
  if (n === 0) return { meanDiff: null, p: null, n: 0, exact: false };
  const obs = Math.abs(mean(clean));

  let count = 0;
  let total = 0;
  let exact = false;
  if (n <= 24) {
    // Enumeração completa das 2^n atribuições de sinal em ORDEM DE GRAY:
    // máscaras consecutivas diferem em 1 bit, então a soma é atualizada em O(1)
    // (2^24 vira ~17M passos leves, sub-segundo, em vez de 2^24 × n).
    // Contra deriva de ponto flutuante, a soma é recomputada do zero a cada 2^16.
    exact = true;
    total = 2 ** n;
    const sign = new Int8Array(n).fill(1);
    let s = clean.reduce((a, x) => a + x, 0);
    if (Math.abs(s / n) >= obs - 1e-12) count++;
    for (let mask = 1; mask < total; mask++) {
      const b = 31 - Math.clz32(mask & -mask); // bit que muda no código de Gray
      sign[b] = -sign[b];
      s += 2 * sign[b] * clean[b];
      if ((mask & 0xffff) === 0) {
        s = 0;
        for (let i = 0; i < n; i++) s += sign[i] * clean[i];
      }
      if (Math.abs(s / n) >= obs - 1e-12) count++;
    }
  } else {
    const rng = mulberry32(seed);
    total = iterations;
    for (let b = 0; b < total; b++) {
      let s = 0;
      for (let i = 0; i < n; i++) s += rng() < 0.5 ? -clean[i] : clean[i];
      if (Math.abs(s / n) >= obs - 1e-12) count++;
    }
  }
  // add-one só na variante amostrada; na enumeração completa a identidade
  // (mask=0) já está contada e o p é exato.
  // p sem arredondamento: precisão importa no step-down de Holm; quem exibe, arredonda.
  const p = exact ? count / total : (count + 1) / (total + 1);
  return { meanDiff: r(mean(clean)), p, n, exact };
}

/**
 * Correção de Holm (step-down) para múltiplas comparações.
 * @param {Array<{label:string, p:number}>} tests
 * @returns mesma lista com pAdj (Holm) e reject (α=0.05), ordem original preservada.
 */
export function holm(tests, alpha = 0.05) {
  const idx = tests.map((t, i) => ({ ...t, i })).sort((a, b) => a.p - b.p);
  const m = tests.length;
  let prev = 0;
  for (let k = 0; k < idx.length; k++) {
    const adj = Math.min(1, (m - k) * idx[k].p);
    idx[k].pAdj = Math.max(adj, prev); // monotonicidade
    prev = idx[k].pAdj;
    idx[k].reject = idx[k].pAdj <= alpha;
  }
  const out = new Array(m);
  // 2026-07-13: pAdj SEM arredondamento — p exatos da permutação chegam a 1e-7
  // e o arredondamento a 4 casas colapsava em 0 (quem exibe, arredonda).
  for (const t of idx) out[t.i] = { label: t.label, p: t.p, pAdj: t.pAdj, reject: t.reject };
  return out;
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
