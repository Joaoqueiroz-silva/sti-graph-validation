#!/usr/bin/env node

/**
 * Valida afirmações auditáveis do manuscrito v7 contra os artefatos canônicos.
 *
 * Além das verificações herdadas da Campanha 4 (mesmos derivados do v6), este
 * validador extrai TODOS os números da Campanha 5 citados no v7.0.tex e os
 * confere contra resultados/campanha5-2026-07-19/<braço>/summary.json, os 72
 * runs brutos de cada braço, previsao-teorica/*.json e o resumo congelado do
 * baseline 2026-07-02. Toda divergência entre texto e dados derruba a validação.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const DEFAULT_TEX = path.join(
  REPO,
  "docs",
  "manuscript",
  "v7.0",
  "artigo-validacao-agentes-comportamentais-v7.0.tex"
);
const FINAL = path.join(
  REPO,
  "resultados",
  "campanha4-2026-07-15",
  "campaign4-final-analysis-v2.1.json"
);
const JUDGE = path.join(
  REPO,
  "resultados",
  "campanha4-2026-07-15",
  "judge-panel-v5",
  "judge-panel-analysis-v5.1.json"
);
const PLAN = path.join(
  REPO,
  "protocol",
  "production-freeze-2026-07-15",
  "campaign4-full-execution-plan.json"
);
const C5 = path.join(REPO, "resultados", "campanha5-2026-07-19");
const C5_ARMS = [
  "1-compilador-pr28",
  "2-robo-sem-teto",
  "3-taxonomia-v1",
  "4-taxonomia-v2-materializacao",
  "5-aterramento-interface-v1",
  "6-final-megabrain",
];
const RUN_BACKED_KEYS = [
  "f1",
  "conceptual",
  "recall",
  "precision",
  "functionalAgreement",
  "functionalKappa",
];
const BASELINE = path.join(
  REPO,
  "resultados",
  "campanha-2026-07-02",
  "campaign-summary.json"
);
const RECHECK = path.join(C5, "previsao-teorica", "previsao-recheck.json");
const COBERTURA = path.join(C5, "previsao-teorica", "previsao-cobertura.json");
const POSBAN = path.join(C5, "previsao-teorica", "previsao-recheck-pos-banimento.json");
const POSBAN_SCRIPT = path.join(HERE, "previsao-recheck-pos-banimento.mjs");
const C5_README = path.join(C5, "README.md");
const C5_PROTOCOL = path.join(REPO, "docs", "PROTOCOLO-CAMPANHA-5.md");
const KAPPA_DOC = path.join(REPO, "docs", "INVESTIGACAO-KAPPA-2026-07-19.md");

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256File = (file) =>
  crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const approx = (actual, expected, tolerance = 1e-9) =>
  Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance;

/**
 * Renderizações de três casas admitidas por um valor de quatro casas dos
 * summaries. Quando o valor cai exatamente na fronteira de arredondamento
 * (quarta casa igual a 5, p.ex. 0,4185), o artefato de quatro casas é ambíguo
 * quanto à terceira casa e ambas as leituras são compatíveis com os dados —
 * a menos que `resolved` (média recomputada dos runs brutos) desambigue.
 */
function variants3(x, resolved) {
  const scaled = Number((x * 1000).toPrecision(12));
  const floor = Math.floor(scaled);
  const boundary = Math.abs(scaled - floor - 0.5) < 1e-9;
  let thousandths;
  if (!boundary) thousandths = [Math.round(scaled)];
  else if (Number.isFinite(resolved)) {
    thousandths = [Math.round(Number((resolved * 1000).toPrecision(12)))];
  } else thousandths = [floor, floor + 1];
  return thousandths.map((v) => (v / 1000).toFixed(3));
}
/** 0.4239 -> ["0,424"] (formato pt-BR de três casas usado nas tabelas). */
const pt3 = (x, resolved) => variants3(x, resolved).map((s) => s.replace(".", ","));
/** 0.4239 -> ["0.424"] (abstract em inglês). */
const en3 = (x, resolved) => variants3(x, resolved);
/** Produto cartesiano de segmentos (string ou lista de alternativas). */
function candidates(segments) {
  let acc = [""];
  for (const segment of segments) {
    const options = Array.isArray(segment) ? segment : [segment];
    acc = acc.flatMap((prefix) => options.map((option) => prefix + option));
  }
  return acc;
}
/** segmentos da célula "média [inferior; superior]" da Tabela tab:c5-arms. */
const cellPt = (m, resolvedMean) => [
  pt3(m.mean, resolvedMean),
  " [",
  pt3(m.lower),
  "; ",
  pt3(m.upper),
  "]",
];
/** Média macro (média das réplicas por exercício, depois média dos exercícios). */
function macroMeanFromRuns(armDir, key) {
  const byExercise = new Map();
  for (const file of fs.readdirSync(path.join(armDir, "runs"))) {
    if (!file.endsWith(".json")) continue;
    const run = readJson(path.join(armDir, "runs", file));
    if (!Number.isFinite(run[key])) return undefined;
    if (!byExercise.has(run.id)) byExercise.set(run.id, []);
    byExercise.get(run.id).push(run[key]);
  }
  const perExercise = [...byExercise.values()].map(
    (values) => values.reduce((a, b) => a + b, 0) / values.length
  );
  return perExercise.reduce((a, b) => a + b, 0) / perExercise.length;
}

export function validateArticleV7({ texPath = DEFAULT_TEX } = {}) {
  const tex = fs.readFileSync(texPath, "utf8");
  const final = readJson(FINAL);
  const judge = readJson(JUDGE);
  const plan = readJson(PLAN);
  const baseline = readJson(BASELINE);
  const recheck = readJson(RECHECK);
  const cobertura = readJson(COBERTURA);
  const posban = fs.existsSync(POSBAN) ? readJson(POSBAN) : null;
  const c5Readme = fs.readFileSync(C5_README, "utf8");
  const c5Protocol = fs.readFileSync(C5_PROTOCOL, "utf8");
  const kappaDoc = fs.readFileSync(KAPPA_DOC, "utf8");
  const arms = Object.fromEntries(
    C5_ARMS.map((arm) => [arm, readJson(path.join(C5, arm, "summary.json"))])
  );
  const failures = [];
  let checkedFacts = 0;

  const requireFact = (condition, label) => {
    checkedFacts += 1;
    if (!condition) failures.push(label);
  };
  const requireText = (expression, label) =>
    requireFact(
      typeof expression === "string" ? tex.includes(expression) : expression.test(tex),
      `${label}: manuscrito não contém ${expression}`
    );
  const requireAnyText = (segments, label) => {
    const options = candidates(segments);
    requireFact(
      options.some((option) => tex.includes(option)),
      `${label}: manuscrito não contém nenhuma renderização admissível de "${options[0]}"`
    );
  };

  // ---------------------------------------------------------------- C4 (herdado)
  requireFact(final.schemaVersion === "educaoff-campaign4-final-analysis-v2.1", "schema C4 v2.1");
  requireFact(plan.model === "google/gemini-3.5-flash", "modelo gerador C4");
  requireFact(final.design.exercises === 24, "24 exercícios");
  requireFact(final.design.replicas === 3, "três réplicas");
  requireFact(final.design.stateReplicaUnitsCompleted === 17, "17 estados completos");
  requireFact(final.design.stateReplicaUnitsFailed === 1, "um estado falho");
  requireFact(final.execution.graphForgeDeterminism.identicalPairs === 34, "34 pares GraphForge");

  const a3a = final.directMetrics.agent3a;
  const a3b = final.directMetrics.agent3b;
  const a3c = final.directMetrics.agent3cCapacityArm;
  requireFact(approx(a3a.finalAnswerExactConcreteMatchItt.mean, 0.111), "resposta final 3a");
  requireFact(approx(a3b.exactConcreteRecallByUniqueValueItt.mean, 0.176), "recall 3b");
  requireFact(approx(a3c.strictProblemSuccessItt.mean, 0.278), "sucesso estrito 3c");
  requireFact(approx(a3c.strictFourLevelValidityConditional.mean, 0.382), "validade estrita 3c");
  requireFact(approx(a3c.literalFinalAnswerLeakageRateConditional.mean, 0.226), "vazamento 3c");
  requireFact(judge.execution.invalidJudgments === 65, "65 julgamentos inválidos");
  requireFact(
    JSON.stringify(judge.execution.models) ===
      JSON.stringify(["z-ai/glm-5.2", "qwen/qwen3.7-plus", "deepseek/deepseek-v4-pro"]),
    "modelos do painel final"
  );

  requireText(/Campanha 4, estudo principal/, "manuscrito identifica C4 como principal");
  requireText(/Dezessete de 18 estados/, "manuscrito relata 17 de 18 estados");
  requireText(/google\/gemini-3\.5-flash/, "manuscrito relata modelo gerador");
  requireText(/0,111 \(IC95\\% 0,028--0,222\)/, "manuscrito relata 3a e IC");
  requireText(/0,176 \(0,113--0,242\)/, "manuscrito relata 3b e IC");
  requireText(/0,278 \(0,167--0,403\)/, "manuscrito relata 3c e IC");
  requireText(/34\/34 pares de reexecução/, "manuscrito relata determinismo");
  requireText(/não constitui um pré-registro integral/, "manuscrito declara cronologia exploratória");
  requireText(
    /não permite a terceiros repetir integralmente a coleta/,
    "manuscrito limita reprodutibilidade externa"
  );
  requireText(/não equivalência a especialistas/, "manuscrito limita equivalência a especialistas");
  requireText(
    /os dados não sustentam classificá-los como artefatos completos e prontos para uso autônomo/,
    "manuscrito explicita juízo global de qualidade"
  );
  requireText(/gerador assistivo de candidatos/, "manuscrito limita o papel atual a autoria assistiva");
  requireText(
    /Adequação pedagógica[\s\S]{0,400}não estimável/,
    "manuscrito separa qualidade observável de validade pedagógica"
  );

  // -------------------------------------------------- C5: estrutura dos braços
  const resolvedMeans = {};
  for (const arm of C5_ARMS) {
    const s = arms[arm];
    requireFact(s.arm === arm, `braço ${arm}: campo arm`);
    requireFact(s.n === 72, `braço ${arm}: 72 runs`);
    requireFact(
      s.protocol.includes("bootstrap por cluster (10k, seed 42)"),
      `braço ${arm}: protocolo bootstrap/seed`
    );
    for (const key of ["recallMisconceptionsConceptual", "conceptual", "recall", "precision"]) {
      requireFact(s.metrics[key]?.nClusters === 24, `braço ${arm}: 24 clusters em ${key}`);
    }
    // coerência summary x runs brutos (runs guardam três casas; tolerância 6e-4)
    resolvedMeans[arm] = {};
    for (const key of RUN_BACKED_KEYS) {
      const recomputed = macroMeanFromRuns(path.join(C5, arm), key);
      resolvedMeans[arm][key] = recomputed;
      requireFact(
        Number.isFinite(recomputed) && approx(recomputed, s.metrics[key].mean, 6e-4),
        `braço ${arm}: média de ${key} do summary confere com os 72 runs`
      );
    }
  }
  requireFact(
    /qwen3-max/i.test(arms["6-final-megabrain"].description),
    "braço 6 declara Qwen3-Max no summary"
  );

  // ------------------------------------ C5: Tabela tab:c5-arms, célula a célula
  const row = (arm) => {
    const m = arms[arm].metrics;
    const r = resolvedMeans[arm];
    return [
      cellPt(m.recallMisconceptionsConceptual),
      cellPt(m.conceptual, r.conceptual),
      cellPt(m.recall, r.recall),
      cellPt(m.precision, r.precision),
    ];
  };
  for (const arm of C5_ARMS.slice(0, 5)) {
    const [rc, f1c, rec, prec] = row(arm);
    requireAnyText(
      [...rc, " & ", ...f1c, " & ", ...rec, " & ", ...prec],
      `tabela C5, linha do braço ${arm}`
    );
  }
  {
    const m = arms["6-final-megabrain"].metrics;
    const r = resolvedMeans["6-final-megabrain"];
    const bold = (metric, resolved) => [
      "\\textbf{",
      pt3(metric.mean, resolved),
      "} [",
      pt3(metric.lower),
      "; ",
      pt3(metric.upper),
      "]",
    ];
    requireAnyText(
      [
        ...bold(m.recallMisconceptionsConceptual),
        " & ",
        ...bold(m.conceptual, r.conceptual),
        " & ",
        ...bold(m.recall, r.recall),
        " & ",
        ...cellPt(m.precision, r.precision),
      ],
      "tabela C5, linha do braço 6"
    );
  }

  // --------------------------------------- C5: baseline 2026-07-02 (congelado)
  const base = baseline.eval.real;
  requireFact(approx(base.recallMisconceptionsConceptual.mean, 0.376), "baseline conceitual 0,376");
  requireFact(approx(base.recallMisconceptions.mean, 0.234), "baseline estrito 0,234");
  requireAnyText(cellPt(base.recallMisconceptionsConceptual), "tabela C5, baseline conceitual com IC");
  requireAnyText(cellPt(base.recallMisconceptions), "tabela C5, baseline estrito com IC");
  requireAnyText(
    ["\\path{f1Conceptual} ", pt3(base.f1Conceptual.mean)],
    "nota de rodapé: f1Conceptual do baseline"
  );
  requireText(
    `\\path{recallSteps} estagnado em ${base.recallSteps.mean.toFixed(2).replace(".", ",")}`,
    "recallSteps 0,51 do baseline"
  );

  // ------------------------------------------- C5: braço final em texto corrido
  const m6 = arms["6-final-megabrain"].metrics;
  const r6 = resolvedMeans["6-final-megabrain"];
  const rc6 = m6.recallMisconceptionsConceptual;
  const f1c6 = m6.conceptual;
  const rec6 = m6.recall;
  // resumo (pt)
  requireAnyText(
    [
      pt3(base.recallMisconceptionsConceptual.mean),
      " no baseline para ",
      pt3(rc6.mean),
      " (IC95\\% por cluster ",
      pt3(rc6.lower),
      "--",
      pt3(rc6.upper),
      ")",
    ],
    "resumo pt: salto do baseline ao braço final"
  );
  requireAnyText(
    ["F1 conceitual ", pt3(f1c6.mean, r6.conceptual), " (", pt3(f1c6.lower), "--", pt3(f1c6.upper), ")"],
    "resumo pt: F1 conceitual com IC"
  );
  requireAnyText(
    ["recall estrito ", pt3(rec6.mean, r6.recall), " (", pt3(rec6.lower), "--", pt3(rec6.upper), ")"],
    "resumo pt: recall estrito com IC"
  );
  requireAnyText(["precisão ", pt3(m6.precision.mean, r6.precision)], "resumo pt: precisão");
  // abstract (en)
  requireAnyText(
    [
      en3(base.recallMisconceptionsConceptual.mean),
      " at baseline to ",
      en3(rc6.mean),
      " (cluster 95\\% CI ",
      en3(rc6.lower),
      "--",
      en3(rc6.upper),
      ")",
    ],
    "abstract en: salto do baseline ao braço final"
  );
  requireAnyText(
    ["conceptual F1 ", en3(f1c6.mean, r6.conceptual), " (", en3(f1c6.lower), "--", en3(f1c6.upper), ")"],
    "abstract en: conceptual F1"
  );
  requireAnyText(
    ["strict recall ", en3(rec6.mean, r6.recall), " (", en3(rec6.lower), "--", en3(rec6.upper), ")"],
    "abstract en: strict recall"
  );
  requireAnyText(["precision ", en3(m6.precision.mean, r6.precision)], "abstract en: precision");
  // seção de limites e conclusão
  requireAnyText(
    [
      "alcançou ",
      pt3(rc6.mean),
      " (IC ",
      pt3(rc6.lower),
      "--",
      pt3(rc6.upper),
      "), com F1 conceitual ",
      pt3(f1c6.mean, r6.conceptual),
      " e recall estrito ",
      pt3(rec6.mean, r6.recall),
      ", contra ",
      pt3(base.recallMisconceptionsConceptual.mean),
      " e ",
      pt3(base.recallMisconceptions.mean),
      " no baseline",
    ],
    "limites C5: alegação (i) com os cinco números"
  );
  requireAnyText(
    [
      "de ",
      pt3(base.recallMisconceptionsConceptual.mean),
      " para ",
      pt3(rc6.mean),
      " (IC por cluster ",
      pt3(rc6.lower),
      "--",
      pt3(rc6.upper),
      "), com F1 conceitual ",
      pt3(f1c6.mean, r6.conceptual),
      " e recall estrito ",
      pt3(rec6.mean, r6.recall),
    ],
    "conclusão: números do braço final"
  );

  // -------------------------------------- C5: braços 2-5 citados na Subseção 3-4
  const m2 = arms["2-robo-sem-teto"].metrics;
  const m3 = arms["3-taxonomia-v1"].metrics;
  const m4 = arms["4-taxonomia-v2-materializacao"].metrics;
  const m5 = arms["5-aterramento-interface-v1"].metrics;
  const r2 = resolvedMeans["2-robo-sem-teto"];
  const r3 = resolvedMeans["3-taxonomia-v1"];
  const r4 = resolvedMeans["4-taxonomia-v2-materializacao"];
  const r5 = resolvedMeans["5-aterramento-interface-v1"];
  requireAnyText(
    [
      "subiu de ",
      pt3(m2.recallMisconceptionsConceptual.mean),
      " para ",
      pt3(m3.recallMisconceptionsConceptual.mean),
    ],
    "braço 3: completude 0,673 -> 0,740"
  );
  requireAnyText(
    [
      "caiu de ",
      pt3(m2.conceptual.mean, r2.conceptual),
      " para ",
      pt3(m3.conceptual.mean, r3.conceptual),
      " e a precisão de ",
      pt3(m2.precision.mean, r2.precision),
      " para ",
      pt3(m3.precision.mean, r3.precision),
    ],
    "braço 3: queda de F1 e precisão"
  );
  requireAnyText(
    [
      "completude ",
      pt3(m4.recallMisconceptionsConceptual.mean),
      ", F1 conceitual ",
      pt3(m4.conceptual.mean, r4.conceptual),
      " e recall estrito de volta a ",
      pt3(m4.recall.mean, r4.recall),
    ],
    "braço 4: números do resultado negativo"
  );
  requireAnyText(
    ["recall estrito (", pt3(m5.recall.mean, r5.recall), ")"],
    "braço 5: recall estrito 0,455"
  );
  requireAnyText(
    ["reduziu a completude para ", pt3(m5.recallMisconceptionsConceptual.mean)],
    "braço 5: completude 0,704"
  );

  // ----------------------------------------------- C5: previsão teórica offline
  const cov = recheck.coberturaFinal;
  requireFact(cov.faltasNaoMecanicas === 75, "previsão: 75 faltas não mecânicas");
  requireFact(cov.derivaveisEstrito === 72, "previsão: 72 deriváveis estritas");
  requireFact(cov.viaEstadoDeEntrada === 3, "previsão: 3 via estado de entrada");
  requireFact(
    Math.round((cov.derivaveisEstrito / cov.faltasNaoMecanicas) * 100) === 96,
    "previsão: 96% deriváveis"
  );
  requireFact(
    Math.round((cov.soViaReconstrucao / cov.faltasNaoMecanicas) * 100) === 59,
    "previsão: 59% invisíveis sem reconstrução"
  );
  requireText(
    `${cov.faltasNaoMecanicas} faltas não mecânicas do braço 5, a previsão \\emph{tal como preservada} --- anterior ao banimento do parâmetro \\path{mfNum}`,
    "previsão: 96% escopado como pré-banimento no manuscrito (parecer #1)"
  );
  requireText("classificou 96\\% como deriváveis", "previsão: 96% no manuscrito");
  requireText(
    `(${cov.derivaveisEstrito}/${cov.faltasNaoMecanicas}, derivação estrita)`,
    "previsão: 72/75 no manuscrito"
  );
  requireText(
    `59\\% como invisíveis ao simulador sem a reconstrução (${cov.soViaReconstrucao}/${cov.faltasNaoMecanicas})`,
    "previsão: 44/75 no manuscrito"
  );

  const prev = recheck.previsao;
  requireFact(approx(prev.conceitualSeAcertarTudoDerivavelEstrito, 0.609), "previsão: F1 0,609");
  requireFact(approx(prev.conceitualDerivavelMaisEntrada, 0.613), "previsão: F1 0,613 com entrada");
  requireFact(
    approx(cobertura.previsao.conceitualSeAcertarTudoDerivavel, prev.conceitualSeAcertarTudoDerivavelEstrito),
    "previsão original e recheck concordam no F1"
  );
  requireAnyText(
    [
      "o F1 conceitual esperado seria ",
      pt3(prev.conceitualSeAcertarTudoDerivavelEstrito),
      " (",
      pt3(prev.conceitualDerivavelMaisEntrada),
      " incluindo os estados de entrada)",
    ],
    "previsão: F1 esperado no manuscrito"
  );
  requireFact(
    prev.recallMiscConceitualAtual.toFixed(2) === "0.70",
    "previsão: nível atual arredonda para 0,70"
  );
  requireAnyText(
    ["de cerca de 0,70 para ", pt3(prev.recallMiscConceitualSeDerivar)],
    "previsão: completude 0,70 -> 0,986 no manuscrito"
  );

  // back-out exato dos 72 runs
  requireFact(recheck.backoutsValidados === "72/72", "recheck: back-outs 72/72");
  requireFact(recheck.runs.length === 72, "recheck: 72 runs");
  requireFact(recheck.runs.every((r) => r.backoutOk === true), "recheck: erro 0,000 em todos os runs");
  requireText(/back-out} exato dos 72 runs/, "manuscrito relata back-out dos 72 runs");
  requireText(/erro 0,000 em 72\/72/, "manuscrito relata erro 0,000");

  // teto honesto 0,992 (narrativo, cruzado com README e protocolo da campanha)
  requireText(/teto honesto da previsão é 0,992, não 1,000/, "teto honesto 0,992 vs 1,000");
  requireFact(c5Readme.includes("0,992"), "README C5 registra o teto 0,992");
  requireFact(c5Protocol.includes("0,992"), "protocolo C5 registra o teto 0,992");
  requireFact(
    prev.recallMiscConceitualSeDerivar < 0.992 && 0.992 < 1,
    "teto 0,992 é coerente (acima de 0,986, abaixo de 1,000)"
  );

  // ---------------- C5: artefato pós-banimento computado no pacote (parecer #3)
  requireFact(fs.existsSync(POSBAN_SCRIPT), "pós-banimento: script analysis/previsao-recheck-pos-banimento.mjs existe");
  requireFact(posban !== null, "pós-banimento: previsao-recheck-pos-banimento.json depositado");
  if (posban) {
    const pcov = posban.coberturaFinal;
    requireFact(
      JSON.stringify(posban.parametrosBanidos) === JSON.stringify(["mfNum", "badCount", "doubleDiv"]),
      "pós-banimento: três parâmetros banidos declarados"
    );
    requireFact(posban.backoutsValidados === "72/72", "pós-banimento: back-outs 72/72");
    requireFact(pcov.faltasNaoMecanicas === cov.faltasNaoMecanicas, "pós-banimento: mesmas 75 faltas");
    requireFact(pcov.derivaveisEstrito === 69, "pós-banimento: 69 deriváveis estritas");
    requireFact(pcov.naoDerivaveis === 3, "pós-banimento: 3 faltas não deriváveis");
    requireFact(pcov.viaEstadoDeEntrada === 3, "pós-banimento: 3 via estado de entrada");
    requireFact(
      cov.derivaveisEstrito - pcov.derivaveisEstrito === 3,
      "pós-banimento: exatamente 3/72 dependiam de mfNum"
    );
    requireFact(
      Math.round((pcov.derivaveisEstrito / pcov.faltasNaoMecanicas) * 100) === 92,
      "pós-banimento: 92% deriváveis estritas"
    );
    requireFact(
      JSON.stringify(posban.faltasNaoDerivaveis) ===
        JSON.stringify([["17pencils:5/7:fracao_outros", 3]]),
      "pós-banimento: as não deriváveis são as 3 réplicas de 17pencils:5/7"
    );
    const teto = posban.previsao.tetoCompletudePosBanimento;
    requireFact(approx(teto, 0.992, 5e-4), "pós-banimento: teto computado é 0,992");
    // O COMPUTADO MANDA: as frases do manuscrito citam o teto no valor do artefato.
    requireAnyText(
      ["teto de completude computado de ", pt3(teto)],
      "pós-banimento: §5.5 cita o teto computado"
    );
    requireAnyText(
      [
        `${pcov.derivaveisEstrito}/${pcov.faltasNaoMecanicas} deriváveis estritas (`,
        String(Math.round((pcov.derivaveisEstrito / pcov.faltasNaoMecanicas) * 100)),
        "\\%)",
      ],
      "pós-banimento: §5.5 cita 69/75 (92%)"
    );
  }
  // frases re-escopadas do parecer (#1 e #2) — reverter derruba a validação
  requireText(
    "69/75 = 92\\% permanecem estritamente deriváveis do que o aluno vê",
    "parecer #1: 69/75 = 92% no manuscrito"
  );
  requireText(
    "dependiam exclusivamente de \\path{mfNum} e caíram com o banimento",
    "parecer #1: 3/72 dependiam de mfNum"
  );
  requireText(
    "o banimento veio \\emph{depois} desta análise",
    "parecer #1: regra de ouro reescrita (banimento posterior à análise)"
  );
  requireText(
    "a análise preservada, portanto, ainda contém a fonte banida",
    "parecer #1: análise preservada contém a fonte banida, declarada"
  );
  requireText(
    "nos termos da previsão tal como preservada (pré-banimento)",
    "parecer #1: 0,609/0,986 escopados como pré-banimento"
  );
  requireText(
    "contra o inventário implementado até então, anterior ao banimento",
    "parecer #2: reexecução datada como pré-banimento"
  );
  requireText(
    "ainda contava \\path{17pencils:5/7} como derivável",
    "parecer #2: previsao-recheck.json declarado como pré-banimento"
  );
  requireText(
    "\\path{analysis/previsao-recheck-pos-banimento.mjs}",
    "parecer #3: script pós-banimento citado no manuscrito"
  );
  requireFact(
    (tex.match(/previsao-recheck-pos-banimento\.json/g) || []).length >= 2,
    "parecer #3: artefato pós-banimento citado no §5.5 e na Disponibilidade"
  );
  requireText(
    "\\path{reconstruir_interface.py} e \\path{previsao-recheck.mjs} referenciam caminhos absolutos do ambiente privado",
    "parecer #4: ressalva dos lançadores estendida aos artefatos da previsão"
  );
  requireText(
    "\\path{tiers.js}, que não integra este pacote de replicação",
    "parecer #5: tiers.js atribuído ao repositório implantado, fora do pacote"
  );
  requireText(
    "\\path{resolveEvalStudentConfig}",
    "parecer #5: espelho verificável resolveEvalStudentConfig citado"
  );
  requireText("\\path{STI_EVAL_3B_MODEL}", "parecer #5: variável STI_EVAL_3B_MODEL citada");
  requireText(
    "mudando um único fator por braço nos braços 1--5; o braço final combinou as intervenções diagnosticadas e a troca de modelo (confounder declarado)",
    "parecer #6: resumo pt qualifica mudança única (braços 1--5)"
  );
  requireText(
    "changing one factor per arm in arms 1--5; the final arm combined the diagnosed interventions with the model swap (declared confounder)",
    "parecer #6: abstract en qualifica mudança única (braços 1--5)"
  );
  requireText(
    "sob mudanças unitárias por braço nos braços 1--5",
    "parecer #6: QP7 qualifica mudança única"
  );
  requireText(
    "Mudança do braço (única nos braços 1--5)",
    "parecer #6: cabeçalho da tab:c5-arms não chama o braço 6 de mudança única"
  );
  requireText(
    "o teto honesto de completude, 0,992, é o valor após a recusa de três parâmetros que vazariam o gabarito",
    "parecer #2: resumo pt liga a recusa somente ao teto 0,992"
  );
  requireText(
    "the honest completeness ceiling of 0.992 is the value after three answer-key-leaking parameters were refused",
    "parecer #2: abstract en liga a recusa somente ao teto 0,992"
  );
  requireText(
    "porque provêm de bootstraps distintos --- reanálise por exercício lá, resumo congelado por cluster aqui --- sobre os mesmos dados",
    "parecer #7: nota cruzada sobre ICs do baseline"
  );

  // previsto vs. medido
  requireAnyText(
    [
      "F1 conceitual de ",
      pt3(f1c6.mean, r6.conceptual),
      " (IC ",
      pt3(f1c6.lower),
      "--",
      pt3(f1c6.upper),
      "), ",
      pt3(f1c6.mean - prev.conceitualSeAcertarTudoDerivavelEstrito),
      " acima da previsão pontual de ",
      pt3(prev.conceitualSeAcertarTudoDerivavelEstrito),
    ],
    "previsto vs. medido: delta de F1"
  );
  const headroom =
    (rc6.mean - m5.recallMisconceptionsConceptual.mean) /
    (0.992 - m5.recallMisconceptionsConceptual.mean);
  requireFact(headroom >= 0.7 && headroom <= 0.78, "headroom capturado é ~3/4");
  requireText(/cerca de três quartos do headroom/, "manuscrito relata ~3/4 do headroom");
  requireAnyText(
    [
      "estimou F1 conceitual de ",
      pt3(prev.conceitualSeAcertarTudoDerivavelEstrito),
      "; o teto honesto de completude, 0,992",
    ],
    "resumo pt: previsão teórica"
  );
  requireAnyText(
    ["estimated a conceptual F1 of ", en3(prev.conceitualSeAcertarTudoDerivavelEstrito)],
    "abstract en: previsão teórica"
  );

  // --------------------------------------- C5: kappa abandonado (números citados)
  const a1 = arms["1-compilador-pr28"].metrics;
  const r1 = resolvedMeans["1-compilador-pr28"];
  requireAnyText(
    [
      "concordância ",
      ...cellPt(a1.functionalAgreement, r1.functionalAgreement),
      " com $\\kappa=0{,}",
      pt3(a1.functionalKappa.mean, r1.functionalKappa).map((s) => s.slice(2)),
      "$",
    ],
    "kappa: braço 1 (concordância e kappa)"
  );
  requireAnyText(
    [
      "a concordância fica em ",
      pt3(m6.functionalAgreement.mean, r6.functionalAgreement),
      " e o $\\kappa$ em ",
      pt3(m6.functionalKappa.mean, r6.functionalKappa),
    ],
    "kappa: braço final (concordância e kappa)"
  );
  requireAnyText(
    [
      "no baseline, ",
      pt3(base.functionalAgreement.mean),
      " com $\\kappa$ médio por run de 0,007",
    ],
    "kappa: baseline (concordância e kappa por run)"
  );
  requireFact(kappaDoc.includes("0.007"), "investigação: kappa 0,007 do baseline");
  requireText(/\$p_e\$ médio 0,441/, "kappa: pe médio 0,441");
  requireFact(kappaDoc.includes("0.441"), "investigação: pe 0,441");
  requireText(/\$\\kappa\$ agrupado 0,046/, "kappa: pooled 0,046");
  requireFact(kappaDoc.includes("0.046"), "investigação: pooled 0,046");
  requireText(
    /bateria mediana de sete itens, mínimo cinco, máximo doze/,
    "kappa: tamanho da bateria"
  );
  requireFact(
    /n mediano = 7, min 5, max 12/.test(kappaDoc),
    "investigação: bateria mediana 7 (5-12)"
  );
  requireText(/0,227 no braço 1 contra 0,093 no baseline/, "kappa: PABAK 0,227 vs 0,093");
  requireFact(
    kappaDoc.includes("0.227") && kappaDoc.includes("0.093"),
    "investigação: PABAK 0,227/0,093"
  );
  requireText(/PABAK/, "manuscrito adota PABAK");
  requireText(/Kappa funcional abandonado como métrica/, "manuscrito declara abandono do kappa");

  // ------------------------------------------------ C5: registro de integridade
  requireText(
    /\\path\{mfNum\}, \\path\{badCount\} e \\path\{doubleDiv\}/,
    "manuscrito nomeia os três parâmetros banidos"
  );
  requireText(/vazamento de gabarito/, "manuscrito classifica o uso como vazamento");
  requireText(/17pencils/, "manuscrito nomeia o caso 17pencils");
  requireText(/trivia de protocolo/, "manuscrito recusa o passo done como trivia");
  requireText(
    /\\path\{recallSteps\} de 0,66 para 0,83/,
    "manuscrito quantifica a recusa do passo done"
  );
  requireText(/resultados negativos mantidos no registro/, "braços negativos preservados");
  requireText(/confounder (é )?declarado/, "confounder modelo-prompt declarado");
  requireText(/\\path\{qwen\/qwen3-max\}/, "manuscrito nomeia qwen3-max");
  requireText(/44 faltas rotuladas como inversão/, "manuscrito relata as 44 inversões");
  requireFact(c5Protocol.includes("44 faltas"), "protocolo C5 registra as 44 inversões");

  // 0,913 nunca vira "quase perfeito": toda ocorrência deve estar negada
  const ptOccur = (tex.match(/quase perfeito/g) ?? []).length;
  const ptNegated = (tex.match(/não é lido como quase perfeito/g) ?? []).length;
  requireFact(ptOccur > 0 && ptOccur === ptNegated, "pt: 'quase perfeito' aparece apenas negado");
  const enOccur = (tex.match(/near-perfect/g) ?? []).length;
  const enNegated = (tex.match(/is not read as near-perfect/g) ?? []).length;
  requireFact(enOccur > 0 && enOccur === enNegated, "en: 'near-perfect' aparece apenas negado");

  // --------------------------------------------------------- hashes e figuras
  const hashedArtifacts = [
    "protocol/production-freeze-2026-07-15/campaign4-full-execution-plan.json",
    "production-fidelity/campaign4-metrics-v2.mjs",
    "resultados/campanha4-2026-07-15/campaign4-final-analysis-v2.1.json",
    "resultados/campanha4-2026-07-15/campaign4-batch-cluster-sensitivity-v1.json",
    "resultados/campanha4-2026-07-15/campaign4-completion-manifest-v1.json",
    "protocol/publication-redactions-v6.0.json",
    "production-fidelity/campaign4-judge-runner.mjs",
    "resultados/campanha4-2026-07-15/judge-panel-v5/judge-panel-results.json",
    "resultados/campanha4-2026-07-15/judge-panel-v5/judge-panel-analysis.json",
    "resultados/campanha4-2026-07-15/judge-panel-v5/judge-panel-analysis-v5.1.json",
    "resultados/campanha4-2026-07-15/judge-panel-v5/calls.jsonl",
  ];
  for (const relative of hashedArtifacts) {
    const hash = sha256File(path.join(REPO, relative));
    requireFact(tex.includes(hash), `hash ausente ou obsoleto no artigo: ${relative}`);
  }

  for (const match of tex.matchAll(/\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/g)) {
    const target = path.resolve(path.dirname(texPath), match[1]);
    requireFact(fs.existsSync(target), `figura ausente: ${match[1]}`);
  }

  if (failures.length) {
    throw new Error(
      `Validação do artigo v7 falhou (${failures.length}):\n- ${failures.join("\n- ")}`
    );
  }
  return {
    status: "ok",
    article: path.relative(REPO, texPath),
    checkedFacts,
    externalCalls: 0,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(validateArticleV7())}\n`);
}
