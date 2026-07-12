#!/usr/bin/env node
/**
 * analysis/reanalyze.mjs — Reanálise G2 (plano mestre 2026-07-12) sobre os dados
 * BRUTOS das campanhas congeladas na tag legacy-campaigns-2026-07.
 *
 * Princípios (parecer de 2026-07-12):
 *   1. Unidade inferencial = EXERCÍCIO (24). As 3 réplicas são agregadas por média
 *      dentro de cada exercício ANTES de qualquer comparação.
 *   2. Comparações entre condições são PAREADAS por exercício: teste de permutação
 *      por troca de sinais, EXATO (2^24 enumerado), com Holm na família primária.
 *   3. κ aparece junto da concordância bruta, com matriz de confusão agregada,
 *      recomputada deterministicamente (verdictFor não usa LLM) e VALIDADA contra
 *      os κ gravados nos relatórios (qualquer divergência aborta).
 *   4. Julgamentos do juiz são DEDUPLICADOS (exercício + âncora canônica) antes dos
 *      ICs; decisão agregada = maioria entre réplicas; IC por bootstrap de cluster
 *      no exercício; autoconsistência do juiz reportada separadamente.
 *   5. Todos os números públicos do relatório saem DAQUI (nenhuma transcrição manual):
 *      derived/reanalise.json + derived/TABELAS.md.
 *
 * Uso: node analysis/reanalyze.mjs   (sem argumentos; caminhos relativos ao repo)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseBrdToExpertNeutral } from "../parse-ctat-brd.js";
import { functionalEquivalence } from "../functional-equivalence.js";
import { canonAnswer } from "../schema.js";
import { signFlipTest, holm, mulberry32 } from "../stats.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "analysis", "derived");
fs.mkdirSync(OUT, { recursive: true });

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const r3 = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);

// ─── Fontes de dados congeladas ─────────────────────────────────────────────
const C1 = path.join(ROOT, "resultados", "campanha-2026-07-02");
const C2 = path.join(ROOT, "resultados", "campanha-2026-07-08-multimodelo");
const CORPUS = path.join(ROOT, "cases", "ctat-6.17");
const DATASET = path.join(ROOT, "datasets", "frac-numberline-6.17", "problems");

// Grafos do especialista (Envelope B) direto do corpus — determinístico.
const exercises = fs
  .readdirSync(CORPUS)
  .filter((d) => fs.existsSync(path.join(CORPUS, d, "expert.brd")))
  .sort();
const expertNeutral = new Map(
  exercises.map((id) => [
    id,
    parseBrdToExpertNeutral(fs.readFileSync(path.join(CORPUS, id, "expert.brd"), "utf8")),
  ])
);
const correctAnswerOf = new Map(
  exercises.map((id) => [id, readJson(path.join(DATASET, id, "meta.json")).correctAnswer])
);

// ─── Utilidades de agregação ────────────────────────────────────────────────

/** Percentil com interpolação linear (type-7, o mesmo de stats.js) — o índice
 *  ⌊p·B⌋ puro pega a estatística de ordem errada (verificação V5, 2026-07-12). */
function pct(sortedAsc, p) {
  if (!sortedAsc.length) return NaN;
  const i = (sortedAsc.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return lo === hi ? sortedAsc[lo] : sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (i - lo);
}

/** IC bootstrap percentil (2000 réplicas, semente fixa) sobre valores POR EXERCÍCIO. */
function bootstrapMeanCI(values, { iterations = 2000, seed = 20260712, alpha = 0.05 } = {}) {
  const rng = mulberry32(seed);
  const n = values.length;
  const means = [];
  for (let b = 0; b < iterations; b++) {
    let s = 0;
    for (let k = 0; k < n; k++) s += values[Math.floor(rng() * n)];
    means.push(s / n);
  }
  means.sort((a, b) => a - b);
  return { mean: r3(mean(values)), lower: r3(pct(means, alpha / 2)), upper: r3(pct(means, 1 - alpha / 2)), n };
}

/** Carrega os relatórios de avaliação de um braço: [{exercise → pares RH}] por réplica. */
function loadEvalRuns(dir, slugRe) {
  const files = fs
    .readdirSync(dir)
    .filter((f) => slugRe.test(f))
    .sort();
  return files.map((f) => {
    const rep = readJson(path.join(dir, f));
    const byEx = new Map();
    for (const c of rep.cases) {
      const rh = c.pairs.filter((p) => p.pairType === "RH");
      byEx.set(c.id, { rh, robotMisconceptions: c.robotMisconceptions || [] });
    }
    return { file: f, byEx };
  });
}

/** Métrica de um exercício numa réplica (média sobre os pares RH; aqui 1 especialista → 1 par). */
function metricOf(run, ex, field) {
  const e = run.byEx.get(ex);
  if (!e || !e.rh.length) return NaN;
  return mean(e.rh.map((p) => p[field]).filter(Number.isFinite));
}

/** Agrega por exercício (média das réplicas) → { perExercise: Map, values: number[] } */
function perExercise(runs, field) {
  const m = new Map();
  for (const ex of exercises) {
    const v = mean(runs.map((r) => metricOf(r, ex, field)).filter(Number.isFinite));
    m.set(ex, v);
  }
  return { perExercise: m, values: exercises.map((e) => m.get(e)).filter(Number.isFinite) };
}

// ─── 1. Campanha 1: sumário por métrica + κ recomputado com matriz ──────────

const c1Real = loadEvalRuns(C1, /^report-eval-real-\d+\.json$/);
const c1Shim = loadEvalRuns(C1, /^report-eval-shim-\d+\.json$/);

const METRICS = [
  ["recallMisconceptionsConceptual", "completude conceitual (PRIMÁRIA)"],
  ["recallMisconceptions", "completude bruta (sensibilidade)"],
  ["recallSteps", "completude de passos"],
  ["stepInclusion", "inclusão de traços"],
  ["f1", "F1 estrutural (auditável)"],
  ["f1Conceptual", "F1 conceitual (auditável)"],
  ["functionalAgreement", "concordância de classificação (bruta)"],
  ["functionalKappa", "concordância de classificação (κ)"],
];

function armSummary(runs) {
  const out = {};
  for (const [field] of METRICS) {
    const { values } = perExercise(runs, field);
    out[field] = bootstrapMeanCI(values);
  }
  return out;
}

const c1Summary = { real: armSummary(c1Real), shim: armSummary(c1Shim) };

// κ + matriz de confusão: recomputa deterministicamente por par e VALIDA contra o gravado.
function rebuildConfusion(runs, campaignLabel) {
  const CATS = ["correto", "erro-previsto", "surpresa"];
  const pooled = {};
  for (const a of CATS) {
    pooled[a] = {};
    for (const b of CATS) pooled[a][b] = 0;
  }
  let divergences = 0;
  let pairs = 0;
  const kappas = [];
  const agreements = [];
  for (const run of runs) {
    for (const ex of exercises) {
      const e = run.byEx.get(ex);
      if (!e) continue;
      const robotStub = {
        misconceptions: e.robotMisconceptions.map((w) => ({ wrongAnswer: w })),
      };
      const fe = functionalEquivalence(expertNeutral.get(ex), robotStub, {
        correctAnswers: [correctAnswerOf.get(ex)].filter(Boolean),
        excludeMechanical: true,
      });
      const stored = e.rh[0];
      // validação: κ e concordância recomputados batem com os gravados (tolerância de arredondamento)
      if (
        Number.isFinite(stored.functionalKappa) &&
        Math.abs(fe.kappa - stored.functionalKappa) > 0.0011
      )
        divergences++;
      if (
        Number.isFinite(stored.functionalAgreement) &&
        Math.abs(fe.agreement - stored.functionalAgreement) > 0.0011
      )
        divergences++;
      for (const a of CATS) for (const b of CATS) pooled[a][b] += fe.confusion[a][b];
      kappas.push(fe.kappa);
      agreements.push(fe.agreement);
      pairs++;
    }
  }
  if (divergences > 0)
    throw new Error(
      `${campaignLabel}: ${divergences} divergências entre κ/concordância recomputados e gravados — reconstrução NÃO é fiel, abortando.`
    );
  // κ pooled da matriz agregada (além da média dos κ por par): as baterias por
  // par são pequenas (5-8 itens) e o κ por par é instável — reportar os dois
  // (recomendação da verificação V3, 2026-07-12).
  const CATS3 = ["correto", "erro-previsto", "surpresa"];
  const N = CATS3.reduce((s, a) => s + CATS3.reduce((t, b) => t + pooled[a][b], 0), 0);
  const po = CATS3.reduce((s, a) => s + pooled[a][a], 0) / N;
  let pe = 0;
  for (const c of CATS3) {
    const rowSum = CATS3.reduce((s, b) => s + pooled[c][b], 0) / N;
    const colSum = CATS3.reduce((s, a) => s + pooled[a][c], 0) / N;
    pe += rowSum * colSum;
  }
  const kappaPooled = pe >= 1 ? (po >= 1 ? 1 : 0) : (po - pe) / (1 - pe);
  return {
    pairs,
    kappaMean: r3(mean(kappas)),
    kappaPooled: r3(kappaPooled),
    kappaMin: r3(Math.min(...kappas)),
    kappaMax: r3(Math.max(...kappas)),
    agreementMean: r3(mean(agreements)),
    confusion: pooled,
    validatedAgainstStored: true,
  };
}

const c1Confusion = rebuildConfusion(c1Real, "campanha1-real");

// ─── 2. Pareado real × shim (campanha 1) ────────────────────────────────────

function pairedComparison(runsA, runsB, field) {
  const a = perExercise(runsA, field).perExercise;
  const b = perExercise(runsB, field).perExercise;
  const diffs = exercises
    .map((e) => a.get(e) - b.get(e))
    .filter(Number.isFinite);
  const test = signFlipTest(diffs);
  const ci = bootstrapMeanCI(diffs);
  return {
    meanDiff: test.meanDiff,
    ci: { lower: ci.lower, upper: ci.upper },
    p: test.p,
    exact: test.exact,
    nExercises: test.n,
    perExerciseDiffs: Object.fromEntries(
      exercises.map((e) => [e, r3(a.get(e) - b.get(e))])
    ),
  };
}

const realVsShim = {
  conceptual: pairedComparison(c1Real, c1Shim, "recallMisconceptionsConceptual"),
  steps: pairedComparison(c1Real, c1Shim, "recallSteps"),
  f1: pairedComparison(c1Real, c1Shim, "f1"),
};

// ─── 3. Campanha 2: braços × baseline, permutação exata + Holm ──────────────

const ARM_LABELS = { gemini: "Gemini 3.5 Flash", glm52: "GLM-5.2", dsv4pro: "DeepSeek V4 Pro", sonnet5: "Claude Sonnet 5" };
const arms = {};
for (const slug of Object.keys(ARM_LABELS))
  arms[slug] = loadEvalRuns(C2, new RegExp(`^report-eval-${slug}-\\d+\\.json$`));

const c2Summary = Object.fromEntries(
  Object.entries(arms).map(([slug, runs]) => [slug, armSummary(runs)])
);
const c2Confusion = Object.fromEntries(
  Object.entries(arms).map(([slug, runs]) => [slug, rebuildConfusion(runs, `campanha2-${slug}`)])
);

// Família PRIMÁRIA (Holm, m=3): completude conceitual, cada braço vs baseline gemini.
const primaryFamily = [];
for (const slug of ["glm52", "dsv4pro", "sonnet5"]) {
  const cmp = pairedComparison(arms[slug], arms.gemini, "recallMisconceptionsConceptual");
  primaryFamily.push({ label: `${slug} vs gemini · completude conceitual`, p: cmp.p, cmp });
}
const primaryHolm = holm(primaryFamily.map(({ label, p }) => ({ label, p })));

// Família SECUNDÁRIA/EXPLORATÓRIA (Holm, m=12): demais métricas.
const secondaryFamily = [];
for (const field of ["recallMisconceptions", "recallSteps", "stepInclusion", "f1"]) {
  for (const slug of ["glm52", "dsv4pro", "sonnet5"]) {
    const cmp = pairedComparison(arms[slug], arms.gemini, field);
    secondaryFamily.push({ label: `${slug} vs gemini · ${field}`, p: cmp.p, cmp });
  }
}
const secondaryHolm = holm(secondaryFamily.map(({ label, p }) => ({ label, p })));

// ─── 4. Juiz: deduplicação, decisão por maioria, IC por exercício ───────────

/**
 * Carrega réplicas do juiz e reduz a ITENS ÚNICOS (exercício + âncora canônica),
 * com decisão agregada por MAIORIA entre réplicas e autoconsistência reportada.
 */
function judgeReanalysis(dir, slugRe) {
  const files = fs
    .readdirSync(dir)
    .filter((f) => slugRe.test(f))
    .sort();
  if (!files.length) return null;
  const reps = files.map((f) => readJson(path.join(dir, f)));
  const groups = {};
  const GROUPS = ["robo-extra", "especialista", "distrator-correta", "distrator-absurdo"];
  for (const g of GROUPS) {
    // item único = exercício + âncora canônica do candidato
    const byItem = new Map(); // key → {exercise, candidate, verdicts: []}
    for (const rep of reps) {
      for (const c of rep.cases) {
        const items = c.groups?.[g] || [];
        const arr = Array.isArray(items) ? items : items.items || [];
        for (const it of arr) {
          const key = `${c.id}::${canonAnswer(it.candidate)}`;
          if (!byItem.has(key)) byItem.set(key, { exercise: c.id, candidate: it.candidate, verdicts: [] });
          byItem.get(key).verdicts.push(!!it.valid);
        }
      }
    }
    const items = [...byItem.values()].map((it) => {
      const nValid = it.verdicts.filter(Boolean).length;
      return {
        ...it,
        nJudgments: it.verdicts.length,
        majorityValid: nValid * 2 > it.verdicts.length,
        tie: nValid * 2 === it.verdicts.length,
        unanimous: new Set(it.verdicts).size === 1,
      };
    });
    // Empates (item julgado nº par de vezes, 50/50): regra DECLARADA (verificação
    // V5, 2026-07-12) — a taxa principal EXCLUI empates; sensibilidade com
    // empate=inválido e empate=válido reportada ao lado.
    const decided = items.filter((i) => !i.tie);
    const nTies = items.length - decided.length;
    // autoconsistência: proporção de itens julgados ≥2 vezes com veredito unânime
    const multi = items.filter((i) => i.nJudgments >= 2);
    const selfConsistency = multi.length ? mean(multi.map((i) => (i.unanimous ? 1 : 0))) : null;
    // taxa de validade sobre itens únicos DECIDIDOS + IC por bootstrap de cluster (exercício)
    const byEx = new Map();
    for (const it of decided) {
      if (!byEx.has(it.exercise)) byEx.set(it.exercise, []);
      byEx.get(it.exercise).push(it.majorityValid ? 1 : 0);
    }
    const exs = [...byEx.keys()];
    const rng = mulberry32(20260712);
    const rates = [];
    for (let b = 0; b < 2000; b++) {
      const sample = [];
      for (let k = 0; k < exs.length; k++)
        sample.push(...byEx.get(exs[Math.floor(rng() * exs.length)]));
      if (sample.length) rates.push(mean(sample));
    }
    rates.sort((a, b) => a - b);
    groups[g] = {
      nUniqueItems: items.length,
      nJudgments: items.reduce((s, i) => s + i.nJudgments, 0),
      nExercises: exs.length,
      nTies,
      validRateMajority: r3(mean(decided.map((i) => (i.majorityValid ? 1 : 0)))),
      sensibilidadeEmpate: {
        empateInvalido: r3(mean(items.map((i) => (i.majorityValid ? 1 : 0)))),
        empateValido: r3(mean(items.map((i) => (i.majorityValid || i.tie ? 1 : 0)))),
      },
      ci: { lower: r3(pct(rates, 0.025)), upper: r3(pct(rates, 0.975)) },
      judgeSelfConsistency: r3(selfConsistency),
    };
  }
  // importância dos perdidos: dedup por exercício+categoria da MESMA forma
  const missAgg = { central: 0, periferico: 0, mecanico: 0 };
  const missByItem = new Map();
  for (const rep of reps) {
    const mi = rep.missingImportance || {};
    // sem itens por-caso detalhados no pooled: usa os cases
    for (const c of rep.cases) {
      const imp = c.importance;
      if (!imp) continue;
      const key = c.id;
      if (!missByItem.has(key)) missByItem.set(key, []);
      missByItem.get(key).push(imp);
    }
  }
  // média entre réplicas das contagens por exercício (importância é por-exercício nos cases)
  let totalN = 0;
  for (const [ex, imps] of missByItem) {
    totalN += mean(imps.map((i) => i.n));
    missAgg.central += mean(imps.map((i) => i.central));
    missAgg.periferico += mean(imps.map((i) => i.periferico));
    missAgg.mecanico += mean(imps.map((i) => i.mecanico));
  }
  const centralRate = totalN ? missAgg.central / totalN : null;
  return {
    files,
    groups,
    missingImportance: {
      nMissedMeanAcrossReplicas: r3(totalN),
      central: r3(missAgg.central),
      periferico: r3(missAgg.periferico),
      mecanico: r3(missAgg.mecanico),
      centralRate: r3(centralRate),
    },
  };
}

const judgeC1 = judgeReanalysis(C1, /^report-judge-real-\d+\.json$/);
const judgeC2 = Object.fromEntries(
  Object.keys(ARM_LABELS).map((slug) => [
    slug,
    judgeReanalysis(C2, new RegExp(`^report-judge-${slug}-\\d+\\.json$`)),
  ])
);

// ─── 5. Reconciliação formal dos números públicos ───────────────────────────

// União de cobertura entre réplicas: por exercício, misconceptions do especialista
// (conceituais) cobertas por QUALQUER réplica ÷ total do especialista; média macro.
function unionCoverage(runs, { conceptualOnly = true } = {}) {
  const per = [];
  for (const ex of exercises) {
    const expert = expertNeutral.get(ex);
    const expertMiscs = (expert.misconceptions || []).filter(
      (m) => !conceptualOnly || !m.mechanical
    );
    if (!expertMiscs.length) continue;
    // Chaves ÚNICAS no numerador E no denominador (verificação V5, 2026-07-12:
    // denominador com duplicatas deprimia a união — 0,484 no lugar de 0,645).
    const expertKeys = [...new Set(expertMiscs.map((m) => canonAnswer(m.wrongAnswer)))];
    const covered = new Set();
    for (const run of runs) {
      const e = run.byEx.get(ex);
      if (!e) continue;
      const robotKeys = new Set(e.robotMisconceptions.map((w) => canonAnswer(w)));
      for (const k of expertKeys) if (robotKeys.has(k)) covered.add(k);
    }
    per.push(covered.size / expertKeys.length);
  }
  return r3(mean(per));
}

// Agregação MICRO (média sobre todos os pares, sem agregar por exercício) — é a
// agregação que o relatório v2.1 usava. A MACRO (por exercício) é a nova oficial.
function microMean(runs, field) {
  const vals = [];
  for (const run of runs)
    for (const ex of exercises) {
      const v = metricOf(run, ex, field);
      if (Number.isFinite(v)) vals.push(v);
    }
  return r3(mean(vals));
}

const reconciliation = {
  "0,368 (v2.1, campanha 1)": {
    definicao:
      "completude CONCEITUAL, média MICRO sobre os 72 pares robô-especialista (24 exercícios × 3 réplicas SEM agregação prévia por exercício) — era a agregação da v2.1",
    recomputado: microMean(c1Real, "recallMisconceptionsConceptual"),
    oficialNovo: `macro por exercício: ${c1Summary.real.recallMisconceptionsConceptual.mean} [${c1Summary.real.recallMisconceptionsConceptual.lower}; ${c1Summary.real.recallMisconceptionsConceptual.upper}]`,
  },
  "0,376 (v2.1, campanha 2 baseline)": {
    definicao: "idem, braço gemini da campanha 2 (mesma configuração, infra nova)",
    recomputado: microMean(arms.gemini, "recallMisconceptionsConceptual"),
    oficialNovo: `macro por exercício: ${c2Summary.gemini.recallMisconceptionsConceptual.mean}`,
  },
  "completude BRUTA (sensibilidade)": {
    definicao:
      "completude incluindo erros mecânicos de interface, macro por exercício, campanha 1 real (micro entre parênteses)",
    recomputado: `${c1Summary.real.recallMisconceptions.mean} (micro ${microMean(c1Real, "recallMisconceptions")})`,
  },
  "união de 3 réplicas (K=3 do pipeline completo)": {
    definicao:
      "por exercício: misconceptions conceituais do especialista cobertas por QUALQUER uma das 3 réplicas reais ÷ total; média macro (campanha 1)",
    recomputado: unionCoverage(c1Real),
  },
  "união de 3 réplicas BRUTA": {
    definicao: "idem incluindo misconceptions mecânicas de interface",
    recomputado: unionCoverage(c1Real, { conceptualOnly: false }),
  },
  "curva de saturação 31,3%…55,6%": {
    definicao:
      "cobertura por K (rotação de uniões) do agente 3b amostrado 5× por exercício — experimento separado, arquivo resultados/saturation-curve-2026-07-10.json",
    recomputado: "ver arquivo fonte (não recalculado aqui; K e amostrador distintos das réplicas)",
  },
  "72 vs 144 grafos": {
    definicao:
      "72 = grafos autorados nas 3 réplicas de AVALIAÇÃO reais (3×24, campanha 1). 144 = 72 + 72 autorados nas 3 réplicas do JULGAMENTO (que autoram de novo para julgar a MESMA autoria no 2D). Os 72 do shim são a variante simplificada e ficam fora dos resultados principais.",
    recomputado: {
      evalReal: c1Real.length * exercises.length,
      evalMaisJuiz: (c1Real.length + (judgeC1?.files.length || 0)) * exercises.length,
      shim: c1Shim.length * exercises.length,
    },
  },
  "6 corridas vs 9 relatórios": {
    definicao:
      "9 arquivos = 3 avaliações reais + 3 avaliações shim + 3 julgamentos. As '6 corridas' do texto eram 3 reais + 3 julgamentos (o shim é baseline interno).",
    recomputado: {
      evalReal: c1Real.length,
      evalShim: c1Shim.length,
      judge: judgeC1?.files.length || 0,
    },
  },
  "83 (+1 outro) vs soma 82": {
    definicao:
      "83 = itens de calibração do especialista julgados por réplica (denominador da Tabela 7; confere). A alocação da v2.1 (29 fração + 24 + 24 + 5 + 1 'outro' = 83) diferia da taxonomia auditada, que classifica o item atípico '-/5' na classe fração pela regra sintática (contém '/'), fechando 30 + 24 + 24 + 5 = 83 SEM residual. Mesmo denominador; a diferença era a alocação manual de um item. A Tabela 7 auditada substitui a da v2.1.",
    recomputado: { itensJulgadosPorReplica: judgeC1?.groups?.especialista ? readJson(path.join(C1, judgeC1.files[0])).pooled["especialista"].items.length : null, taxonomiaAuditada: "30+24+24+5=83, residual 0" },
  },
  "47% (total '1 execução' da Tabela 7 na v2.1) — NÃO REPRODUZÍVEL": {
    definicao:
      "nenhuma definição testada (micro/macro, por réplica, união parcial) reproduz 47% a partir dos dados brutos. O valor auditado da cobertura micro em execução única (média das 3 réplicas, baseline C2) é o desta reanálise; a união de 3 réplicas (64%) confere. Registrado como inconsistência da v2.1, resolvida pela geração automática da tabela.",
    recomputado: "ver Tabela 7 reconstruída",
  },
};

// ─── 5b. Tabela 7 reconstruída: cobertura MICRO por tipo de erro ─────────────
// Definição da v2.1: instâncias conceituais do especialista (pooled, 83), braço
// baseline da campanha 2; "1 execução" = média das 3 execuções isoladas; "união
// de 3" = coberta por qualquer réplica. Taxonomia determinística a partir do
// wrongAnswer e da resposta correta (a/b) do exercício.
function table7() {
  const classify = (w, correct) => {
    const [num, den] = String(correct).split("/");
    const s = String(w).trim();
    if (s.includes("/")) return "Fração incorreta";
    if (s === num) return "Numerador isolado";
    if (s === den) return "Denominador isolado";
    if (/^-?\d+$/.test(s)) return "Outros inteiros";
    return "Outro (residual)"; // decimais e formas atípicas
  };
  const rows = new Map(); // categoria → {n, coveredSingle: [por réplica], coveredUnion}
  const cats = ["Fração incorreta", "Numerador isolado", "Denominador isolado", "Outros inteiros", "Outro (residual)"];
  for (const c of cats) rows.set(c, { n: 0, coveredSingle: [0, 0, 0], coveredUnion: 0 });
  const runs = arms.gemini;
  for (const ex of exercises) {
    const correct = correctAnswerOf.get(ex);
    // instância = misconception ÚNICA por âncora canônica dentro do exercício
    // (mesma unidade dos 83 itens da bateria do juiz; arestas duplicadas com o
    // mesmo valor contam uma vez)
    const seen = new Set();
    const ms = (expertNeutral.get(ex).misconceptions || []).filter((m) => {
      if (m.mechanical) return false;
      const k = canonAnswer(m.wrongAnswer);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const robotSets = runs.map(
      (run) => new Set((run.byEx.get(ex)?.robotMisconceptions || []).map(canonAnswer))
    );
    for (const m of ms) {
      const cat = classify(m.wrongAnswer, correct);
      const row = rows.get(cat);
      row.n++;
      const key = canonAnswer(m.wrongAnswer);
      robotSets.forEach((rs, i) => {
        if (rs.has(key)) row.coveredSingle[i]++;
      });
      if (robotSets.some((rs) => rs.has(key))) row.coveredUnion++;
    }
  }
  const out = [];
  let totN = 0,
    totSingle = 0,
    totUnion = 0;
  for (const c of cats) {
    const r0 = rows.get(c);
    if (!r0.n) continue;
    const single = mean(r0.coveredSingle) / r0.n;
    out.push({
      tipo: c,
      ocorrencias: r0.n,
      cobertura1exec: r3(single),
      coberturaUniao3: r3(r0.coveredUnion / r0.n),
    });
    totN += r0.n;
    totSingle += mean(r0.coveredSingle);
    totUnion += r0.coveredUnion;
  }
  out.push({
    tipo: "Total",
    ocorrencias: totN,
    cobertura1exec: r3(totSingle / totN),
    coberturaUniao3: r3(totUnion / totN),
  });
  return out;
}
const tabela7 = table7();

// ─── 6. Saída ────────────────────────────────────────────────────────────────

const derived = {
  geradoEm: "2026-07-12",
  fonte: "tag legacy-campaigns-2026-07 (dados brutos intocados)",
  unidadeInferencial: "exercício (24); réplicas agregadas por média antes de qualquer teste",
  testes: "permutação pareada por troca de sinais, EXATA (2^24); Holm por família",
  campanha1: {
    sumario: c1Summary,
    confusao: c1Confusion,
    realVsShim,
    juiz: judgeC1,
  },
  campanha2: {
    sumario: c2Summary,
    confusao: c2Confusion,
    familiaPrimaria: primaryHolm.map((h, i) => ({ ...h, ...primaryFamily[i].cmp })),
    familiaSecundaria: secondaryHolm.map((h, i) => ({ ...h, ...secondaryFamily[i].cmp })),
    juiz: judgeC2,
  },
  reconciliacao: reconciliation,
  tabela7,
};

fs.writeFileSync(path.join(OUT, "reanalise.json"), JSON.stringify(derived, null, 2));

// TABELAS.md — as tabelas do artigo, geradas (G2: nenhuma transcrição manual).
const fmtP = (p) => (p == null ? "n/a" : p < 0.001 ? p.toExponential(2) : p.toFixed(4));
let md = `# Tabelas geradas — reanálise de 2026-07-12\n\n`;
md += `Fonte: dados brutos da tag \`legacy-campaigns-2026-07\`. Unidade = exercício (n=24; réplicas agregadas por média). Testes pareados por permutação exata de troca de sinais; Holm por família. Gerado por \`analysis/reanalyze.mjs\` — NÃO editar à mão.\n\n`;

md += `## Sumário campanha 1 (agentes reais, 3 réplicas)\n\n| Métrica | Média | IC 95% |\n|---|---|---|\n`;
for (const [field, label] of METRICS) {
  const s = c1Summary.real[field];
  md += `| ${label} | ${s.mean} | [${s.lower}; ${s.upper}] |\n`;
}

md += `\n## Concordância de classificação de respostas (ex-"equivalência funcional")\n\n`;
md += `Campanha 1: concordância bruta média ${c1Confusion.agreementMean}, κ médio ${c1Confusion.kappaMean} (faixa ${c1Confusion.kappaMin} a ${c1Confusion.kappaMax}; κ pooled da matriz agregada ${c1Confusion.kappaPooled}), ${c1Confusion.pairs} pares. κ recomputado e validado contra os relatórios gravados; verificação independente V3 de 2026-07-12 reproduziu matriz e médias exatamente.\n\n`;
md += `Matriz de confusão agregada (linhas = especialista, colunas = robô):\n\n| | correto | erro-previsto | surpresa |\n|---|---|---|---|\n`;
for (const a of ["correto", "erro-previsto", "surpresa"]) {
  md += `| **${a}** | ${c1Confusion.confusion[a]["correto"]} | ${c1Confusion.confusion[a]["erro-previsto"]} | ${c1Confusion.confusion[a]["surpresa"]} |\n`;
}
md += `\nκ por braço (campanha 2): ${Object.entries(c2Confusion)
  .map(([s, c]) => `${ARM_LABELS[s]} ${c.kappaMean}`)
  .join(" · ")}\n`;

md += `\n## Campanha 2 — família primária (completude conceitual vs baseline; Holm m=3)\n\n| Comparação | Δ médio | IC 95% | p exato | p-Holm | rejeita H0 |\n|---|---|---|---|---|---|\n`;
for (const t of derived.campanha2.familiaPrimaria) {
  md += `| ${t.label} | ${t.meanDiff} | [${t.ci.lower}; ${t.ci.upper}] | ${fmtP(t.p)} | ${fmtP(t.pAdj)} | ${t.reject ? "sim" : "não"} |\n`;
}
md += `\n## Campanha 2 — família secundária/exploratória (Holm m=12)\n\n| Comparação | Δ médio | IC 95% | p exato | p-Holm | rejeita H0 |\n|---|---|---|---|---|---|\n`;
for (const t of derived.campanha2.familiaSecundaria) {
  md += `| ${t.label} | ${t.meanDiff} | [${t.ci.lower}; ${t.ci.upper}] | ${fmtP(t.p)} | ${fmtP(t.pAdj)} | ${t.reject ? "sim" : "não"} |\n`;
}

md += `\n## Juiz (itens únicos, decisão por maioria, IC por exercício)\n\n| Campanha/braço | Grupo | Itens únicos | Julgamentos | Empates | Validade (maioria, sem empates) | IC 95% | Autoconsistência |\n|---|---|---|---|---|---|---|---|\n`;
const judgeRow = (label, j) => {
  if (!j) return "";
  let s = "";
  for (const [g, v] of Object.entries(j.groups)) {
    s += `| ${label} | ${g} | ${v.nUniqueItems} | ${v.nJudgments} | ${v.nTies} | ${v.validRateMajority} | [${v.ci.lower}; ${v.ci.upper}] | ${v.judgeSelfConsistency ?? "n/a"} |\n`;
  }
  return s;
};
md += judgeRow("C1 (juiz GLM-4.5)", judgeC1);
for (const [slug, j] of Object.entries(judgeC2)) md += judgeRow(`C2 ${ARM_LABELS[slug]} (juiz Mistral)`, j);

md += `\n## Importância dos erros perdidos (média entre réplicas, por exercício)\n\n| Campanha/braço | Perdidos | Centrais | Periféricos | Mecânicos | Taxa central |\n|---|---|---|---|---|---|\n`;
const missRow = (label, j) => {
  if (!j?.missingImportance) return "";
  const m = j.missingImportance;
  return `| ${label} | ${m.nMissedMeanAcrossReplicas} | ${m.central} | ${m.periferico} | ${m.mecanico} | ${m.centralRate} |\n`;
};
md += missRow("C1 (juiz GLM-4.5)", judgeC1);
for (const [slug, j] of Object.entries(judgeC2)) md += missRow(`C2 ${ARM_LABELS[slug]} (juiz Mistral)`, j);

md += `\n## Nota estrutural sobre a bateria (motivação da bateria independente)\n\nA bateria atual é a união das respostas dos dois grafos: todo item pertence ao catálogo de pelo menos um lado, então a célula surpresa×surpresa é IMPOSSÍVEL por construção (verificável na matriz acima). Sem verdadeiros negativos, a concordância esperada por acaso é alta e o κ fica estruturalmente deprimido. Este é o achado negativo que motiva a bateria independente congelada (G6 do plano mestre).\n`;

md += `\n## Real × shim (campanha 1; Δ = produção − simplificado)\n\n`;
for (const [k, v] of Object.entries(realVsShim))
  md += `- ${k}: Δ ${v.meanDiff}, IC 95% [${v.ci.lower}; ${v.ci.upper}], p exato ${fmtP(v.p)} (n=${v.nExercises})\n`;

md += `\n## Tabela 7 reconstruída — cobertura micro por tipo de erro (baseline C2)\n\nInstâncias conceituais do especialista (pooled); "1 execução" = média das 3 execuções isoladas; "união de 3" = coberta por qualquer réplica.\n\n| Tipo de erro | Ocorrências | Cobertura (1 exec) | Cobertura (união de 3) |\n|---|---|---|---|\n`;
for (const t of tabela7)
  md += `| ${t.tipo} | ${t.ocorrencias} | ${(t.cobertura1exec * 100).toFixed(0)}% | ${(t.coberturaUniao3 * 100).toFixed(0)}% |\n`;

md += `\n## Reconciliação dos números públicos\n\n| Número no relatório | Definição formal | Recomputado |\n|---|---|---|\n`;
for (const [num, r] of Object.entries(reconciliation)) {
  md += `| ${num} | ${r.definicao} | ${typeof r.recomputado === "object" ? JSON.stringify(r.recomputado) : r.recomputado} |\n`;
}

fs.writeFileSync(path.join(OUT, "TABELAS.md"), md);

console.log("✓ analysis/derived/reanalise.json");
console.log("✓ analysis/derived/TABELAS.md");
console.log("\n─── Destaques ───");
console.log(
  `C1 completude conceitual: ${c1Summary.real.recallMisconceptionsConceptual.mean} [${c1Summary.real.recallMisconceptionsConceptual.lower}; ${c1Summary.real.recallMisconceptionsConceptual.upper}]`
);
console.log(`C1 κ médio: ${c1Confusion.kappaMean} (validado contra gravados: ${c1Confusion.validatedAgainstStored})`);
console.log("Família primária (Holm):");
for (const t of derived.campanha2.familiaPrimaria)
  console.log(`  ${t.label}: Δ=${t.meanDiff} p=${fmtP(t.p)} pHolm=${fmtP(t.pAdj)} ${t.reject ? "REJEITA" : "—"}`);
