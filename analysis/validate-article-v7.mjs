#!/usr/bin/env node

/**
 * Valida afirmações auditáveis do manuscrito v7 contra os artefatos canônicos.
 *
 * O manuscrito v7 apresenta SOMENTE o experimento final da campanha de
 * 2026-07-19 (configuração final do simulador de alunos) com a previsão
 * teórica offline. Este validador extrai todos os números citados no
 * v7.0.tex e os confere contra:
 *   - resultados/campanha5-2026-07-19/6-final-megabrain/summary.json e os
 *     72 runs brutos do experimento final;
 *   - previsao-teorica/previsao-recheck.json (previsão preservada) e
 *     previsao-teorica/previsao-recheck-pos-banimento.json (reexecução no
 *     pacote, pós-banimento);
 *   - resultados/campanha-2026-07-02/campaign-summary.json (baseline citado
 *     em uma única frase como configuração de partida);
 *   - docs/PROTOCOLO-CAMPANHA-5.md e docs/INVESTIGACAO-KAPPA-2026-07-19.md.
 *
 * Além disso, FALHA se houver qualquer travessão (em-dash U+2014, "---" ou
 * \textemdash) em qualquer linha do .tex: o texto do artigo não usa
 * travessões; o en-dash "--" é admitido apenas entre dígitos (intervalos
 * numéricos e páginas de referências). Toda divergência entre texto e dados
 * derruba a validação. Zero chamadas externas.
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
const C5 = path.join(REPO, "resultados", "campanha5-2026-07-19");
const FINAL_ARM = "6-final-megabrain";
const FINAL_DIR = path.join(C5, FINAL_ARM);
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
 * quanto à terceira casa e ambas as leituras são compatíveis com os dados,
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
/** 0.4239 -> ["0,424"] (formato pt-BR de três casas usado no texto). */
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
/** PABAK de três categorias: transformação linear da concordância bruta. */
const pabak = (po) => (3 * po - 1) / 2;

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
  const baseline = readJson(BASELINE);
  const recheck = readJson(RECHECK);
  const posban = readJson(POSBAN);
  const summary = readJson(path.join(FINAL_DIR, "summary.json"));
  const c5Readme = fs.readFileSync(C5_README, "utf8");
  const c5Protocol = fs.readFileSync(C5_PROTOCOL, "utf8");
  const kappaDoc = fs.readFileSync(KAPPA_DOC, "utf8");
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
  const requireAbsent = (expression, label) =>
    requireFact(
      !(typeof expression === "string"
        ? tex.includes(expression)
        : expression.test(tex)),
      `${label}: manuscrito ainda contém ${expression}`
    );
  const requireAnyText = (segments, label) => {
    const options = candidates(segments);
    requireFact(
      options.some((option) => tex.includes(option)),
      `${label}: manuscrito não contém nenhuma renderização admissível de "${options[0]}"`
    );
  };

  // ------------------------------------------------- travessões: proibição dura
  // Nenhuma linha de prosa do .tex pode conter em-dash (U+2014), o ligature
  // "---" ou \textemdash. O en-dash "--" é admitido apenas entre dígitos.
  const dashViolations = [];
  tex.split("\n").forEach((line, index) => {
    if (/—|---|\\textemdash/.test(line)) {
      dashViolations.push(`linha ${index + 1}: ${line.trim().slice(0, 80)}`);
    }
  });
  requireFact(
    dashViolations.length === 0,
    `travessão proibido (U+2014, "---" ou \\textemdash) em prosa: ${dashViolations.join(" | ")}`
  );
  {
    const badEnDash = [];
    tex.split("\n").forEach((line, index) => {
      for (const match of line.matchAll(/--/g)) {
        const before = line[match.index - 1] ?? "";
        const after = line[match.index + 2] ?? "";
        if (!(/[0-9]/.test(before) && /[0-9]/.test(after))) {
          badEnDash.push(`linha ${index + 1}`);
        }
      }
    });
    requireFact(
      badEnDash.length === 0,
      `en-dash "--" fora de intervalo numérico: ${badEnDash.join(", ")}`
    );
  }

  // ----------------------- enquadramento no objeto: título e mecânica declarada
  const TITLE =
    "Validação de grafos de comportamento gerados por agentes de IA contra grafos de especialistas CTAT: previsão teórica offline e aterramento na interface";
  requireText(
    `\\title{\\bfseries ${TITLE}}`,
    "título: \\title enquadrado no objeto (grafos de comportamento)"
  );
  requireText(`pdftitle={${TITLE}}`, "título: pdftitle idêntico ao \\title");
  requireAbsent(
    "Prever antes de medir: previsão teórica offline e validação de um simulador",
    "título antigo (simulador como protagonista) removido"
  );
  requireText(
    "agentes de IA conseguem construir grafos de comportamento com a qualidade dos grafos que especialistas humanos constroem à mão no CTAT",
    "introdução: pergunta de abertura sobre os grafos"
  );
  requireText(
    "compilador determinístico GraphForge",
    "mecanismo: traces dos alunos simulados viram o grafo via GraphForge"
  );
  requireText(
    "O simulador é o meio; o grafo é o fim",
    "enquadramento: simulador como mecanismo, grafo como objeto"
  );
  requireText(
    "grafo de comportamento feito à mão por um especialista CTAT: passos de resolução, respostas erradas previstas e remediações",
    "mecânica: .brd definido como grafo manual do especialista"
  );
  requireText(
    "O envelope A contém o que qualquer autor vê antes de autorar: o enunciado, a interface e a resposta correta",
    "mecânica: envelope A definido"
  );
  requireText(
    "O envelope B é o grafo completo do especialista, escondido como gabarito",
    "mecânica: envelope B definido como gabarito escondido"
  );
  requireText(
    "Os agentes autoram às cegas, somente com o envelope A; a nota compara o grafo deles com o envelope B",
    "mecânica: autoria cega e nota contra o envelope B"
  );

  // ------------------- método: subseção de justificativa e leitura das medidas
  requireText(/\\subsection\{Por que estas medidas\}/, "método: subseção Por que estas medidas");
  requireText(
    "assimetria de custo pedagógico: uma rota de erro ausente no grafo significa que o tutor não reconhece o erro do aluno",
    "medidas: justificativa da completude como primária"
  );
  requireText(
    "a estrita permanece como linha crua auditável",
    "medidas: completude estrita como linha crua anti-gaming"
  );
  requireText(
    "a precisão é acompanhamento, não veto",
    "medidas: precisão declarada assimétrica, sem veto"
  );
  requireText(
    "mistura dois custos assimétricos em um número só",
    "medidas: F1 não primária por misturar custos"
  );
  requireText(
    "as três réplicas do mesmo problema são correlacionadas",
    "medidas: cluster = problema justificado"
  );
  requireText(
    "dispensa suposição de normalidade, insustentável com apenas 24 clusters",
    "medidas: bootstrap justificado sem normalidade"
  );
  requireText(
    "a semente fixa (42) torna cada intervalo exatamente reprodutível",
    "medidas: semente fixa como reprodutibilidade"
  );
  requireText(
    "reamostrando os 24 problemas do corpus, a estimativa fica nessa faixa em 95\\% das reamostragens",
    "medidas: leitura do IC de 95%"
  );
  requireText(
    "paradoxo de prevalência com marginais endógenas",
    "medidas: kappa colapsa por marginais endógenas"
  );
  requireText(
    "não é alcançável por nenhum autor externo",
    "medidas: teto determinístico da completude de passos"
  );
  requireText(
    "hipótese falsificável",
    "medidas: previsão offline como hipótese falsificável"
  );
  requireText(
    "valida a calculadora antes de confiar na previsão",
    "medidas: back-out valida a calculadora"
  );
  requireText(
    "O resíduo é caracterizado, não especulativo",
    "medidas: resíduo do teto com causas nomeadas"
  );
  requireText(
    "de cada dez rotas de erro que o especialista desenhou no grafo dele, os agentes desenharam cerca de nove nas deles",
    "interpretação primária: nove em dez rotas de erro"
  );

  // --------------------------------- estrutura: só o experimento final no artigo
  requireText(/\\section\{Introdução\}/, "seção Introdução");
  requireText(/\\section\{Método\}/, "seção Método");
  requireText(/\\section\{Resultados\}/, "seção Resultados");
  requireText(/\\section\{Discussão\}/, "seção Discussão");
  requireText(/\\section\{Limitações\}/, "seção Limitações");
  requireText(/\\section\{Conclusão\}/, "seção Conclusão");
  requireAbsent(/\\appendix/, "sem apêndices");
  requireAbsent("tab:c5-arms", "sem tabela de braços");
  requireAbsent(/\\(sub)?section\{Campanha/, "sem seções de campanhas");
  requireAbsent(/\\(sub)?section\{[^}]*[Bb]raços/, "sem seção de braços");
  requireAbsent(/gemini-3\.5-flash/, "sem configurações intermediárias nomeadas");
  // resultados intermediários/negativos não ganham números no manuscrito
  for (const banned of ["0,543", "0,673", "0,740", "0,751", "0,704", "0,111", "0,176", "0,278"]) {
    requireAbsent(banned, `sem números de campanhas ou braços intermediários (${banned})`);
  }

  // ------------------------------------- experimento final: summary x runs brutos
  requireFact(summary.arm === FINAL_ARM, "experimento final: campo arm");
  requireFact(summary.n === 72, "experimento final: 72 runs");
  requireFact(
    summary.protocol.includes("bootstrap por cluster (10k, seed 42)"),
    "experimento final: protocolo bootstrap/seed"
  );
  requireFact(
    /qwen3-max/i.test(summary.description),
    "experimento final: summary declara Qwen3-Max"
  );
  const m = summary.metrics;
  for (const key of [
    "recallMisconceptionsConceptual",
    "conceptual",
    "recall",
    "precision",
    "functionalAgreement",
  ]) {
    requireFact(m[key]?.nClusters === 24, `experimento final: 24 clusters em ${key}`);
  }
  const resolved = {};
  for (const key of RUN_BACKED_KEYS) {
    const recomputed = macroMeanFromRuns(FINAL_DIR, key);
    resolved[key] = recomputed;
    requireFact(
      Number.isFinite(recomputed) && approx(recomputed, m[key].mean, 6e-4),
      `experimento final: média de ${key} do summary confere com os 72 runs`
    );
  }

  const rc = m.recallMisconceptionsConceptual;
  const f1c = m.conceptual;
  const rec = m.recall;
  const prec = m.precision;
  const fa = m.functionalAgreement;

  // --------------------------------------------- Tabela tab:final, célula a célula
  const rowsFinal = [
    ["Completude conceitual de misconceptions (primária)", rc, undefined],
    ["F1 conceitual", f1c, resolved.conceptual],
    ["Completude estrita", rec, resolved.recall],
    ["Precisão", prec, resolved.precision],
    ["Concordância funcional bruta", fa, resolved.functionalAgreement],
  ];
  for (const [label, metric, res] of rowsFinal) {
    requireAnyText(
      [
        `${label} & `,
        pt3(metric.mean, res),
        " & [",
        pt3(metric.lower),
        "; ",
        pt3(metric.upper),
        "]",
      ],
      `tabela final: linha "${label}"`
    );
  }
  requireAnyText(
    [
      "PABAK & ",
      pt3(pabak(fa.mean), Number.isFinite(resolved.functionalAgreement) ? pabak(resolved.functionalAgreement) : undefined),
      " & [",
      pt3(pabak(fa.lower)),
      "; ",
      pt3(pabak(fa.upper)),
      "]",
    ],
    "tabela final: linha PABAK (transformação (3po-1)/2 da concordância)"
  );

  // -------------------------------------------------- resumo pt e abstract en
  requireAnyText(
    [
      "A completude conceitual de misconceptions medida foi ",
      pt3(rc.mean),
      " (IC95\\% por cluster ",
      pt3(rc.lower),
      "--",
      pt3(rc.upper),
      "), com F1 conceitual ",
      pt3(f1c.mean, resolved.conceptual),
      " (",
      pt3(f1c.lower),
      "--",
      pt3(f1c.upper),
      "), completude estrita ",
      pt3(rec.mean, resolved.recall),
      " (",
      pt3(rec.lower),
      "--",
      pt3(rec.upper),
      ") e precisão ",
      pt3(prec.mean, resolved.precision),
      " (",
      pt3(prec.lower),
      "--",
      pt3(prec.upper),
      ")",
    ],
    "resumo pt: quatro desfechos com IC"
  );
  requireAnyText(
    [
      "The measured conceptual misconception completeness was ",
      en3(rc.mean),
      " (cluster 95\\% CI ",
      en3(rc.lower),
      "--",
      en3(rc.upper),
      "), with conceptual F1 ",
      en3(f1c.mean, resolved.conceptual),
      " (",
      en3(f1c.lower),
      "--",
      en3(f1c.upper),
      "), strict completeness ",
      en3(rec.mean, resolved.recall),
      " (",
      en3(rec.lower),
      "--",
      en3(rec.upper),
      "), and precision ",
      en3(prec.mean, resolved.precision),
      " (",
      en3(prec.lower),
      "--",
      en3(prec.upper),
      ")",
    ],
    "abstract en: quatro desfechos com IC"
  );
  requireAnyText(
    ["concordância bruta, ", pt3(fa.mean, resolved.functionalAgreement), " (", pt3(fa.lower), "--", pt3(fa.upper), "), e PABAK, ", pt3(pabak(fa.mean)), " (", pt3(pabak(fa.lower)), "--", pt3(pabak(fa.upper)), ")"],
    "resumo pt: concordância bruta e PABAK"
  );
  requireAnyText(
    ["raw agreement, ", en3(fa.mean, resolved.functionalAgreement), " (", en3(fa.lower), "--", en3(fa.upper), "), and PABAK, ", en3(pabak(fa.mean)), " (", en3(pabak(fa.lower)), "--", en3(pabak(fa.upper)), ")"],
    "abstract en: agreement e PABAK"
  );

  // ------------------------------------------------- resultados em texto corrido
  requireAnyText(
    [
      "os grafos gerados pelos agentes cobriram ",
      pt3(rc.mean),
      " (IC95\\% por cluster ",
      pt3(rc.lower),
      "--",
      pt3(rc.upper),
      ") das misconceptions conceituais",
    ],
    "resultados: completude conceitual em texto corrido (tom do objeto)"
  );
  requireAnyText(
    [
      "concordância funcional bruta de ",
      pt3(fa.mean, resolved.functionalAgreement),
      " (IC ",
      pt3(fa.lower),
      "--",
      pt3(fa.upper),
      ") e PABAK de ",
      pt3(pabak(fa.mean)),
      " (",
      pt3(pabak(fa.lower)),
      "--",
      pt3(pabak(fa.upper)),
      ")",
    ],
    "resultados: concordância funcional e PABAK em texto corrido"
  );
  requireAnyText(
    [
      "o $\\kappa$ medido no experimento final, ",
      pt3(m.functionalKappa.mean, resolved.functionalKappa),
      ", permanece nos artefatos como registro",
    ],
    "resultados: kappa citado apenas como registro"
  );

  // ------------------------------- baseline 2026-07-02: uma única frase, congelada
  const base = baseline.eval.real;
  requireFact(approx(base.recallMisconceptionsConceptual.mean, 0.376), "baseline conceitual 0,376 no artefato");
  requireAnyText(
    [
      "campanha de referência anterior (2026-07-02), que registrou completude conceitual de ",
      pt3(base.recallMisconceptionsConceptual.mean),
    ],
    "baseline: frase única da configuração de partida"
  );
  requireText(
    "essa é a única comparação com estado anterior citada neste artigo",
    "baseline: comparação declarada como única"
  );
  requireFact(
    (tex.match(/0,376/g) ?? []).length <= 2 && (tex.match(/0\.376/g) ?? []).length <= 1,
    "baseline: 0,376 citado de forma minimalista (resumo e uma frase nos resultados)"
  );

  // ----------------------------------------------- previsão teórica offline
  const prev = recheck.previsao;
  requireFact(approx(prev.conceitualSeAcertarTudoDerivavelEstrito, 0.609), "previsão preservada: F1 0,609");
  requireFact(recheck.backoutsValidados === "72/72", "previsão preservada: back-outs 72/72");
  requireFact(recheck.runs.length === 72, "previsão preservada: 72 runs");
  requireFact(
    recheck.runs.every((r) => r.backoutOk === true),
    "previsão preservada: erro 0,000 em todos os runs"
  );
  requireText(/back-out} exato dos 72 runs/, "manuscrito relata back-out dos 72 runs");
  requireText(/erro 0,000 em 72\/72/, "manuscrito relata erro 0,000");
  requireAnyText(
    ["o F1 conceitual esperado seria ", pt3(prev.conceitualSeAcertarTudoDerivavelEstrito)],
    "manuscrito relata F1 previsto 0,609"
  );

  // artefato pós-banimento computado no pacote
  requireFact(fs.existsSync(POSBAN_SCRIPT), "pós-banimento: script analysis/previsao-recheck-pos-banimento.mjs existe");
  const pcov = posban.coberturaFinal;
  requireFact(
    JSON.stringify(posban.parametrosBanidos) === JSON.stringify(["mfNum", "badCount", "doubleDiv"]),
    "pós-banimento: três parâmetros banidos declarados"
  );
  requireFact(posban.backoutsValidados === "72/72", "pós-banimento: back-outs 72/72");
  requireFact(pcov.faltasNaoMecanicas === 75, "pós-banimento: 75 faltas não mecânicas");
  requireFact(pcov.derivaveisEstrito === 69, "pós-banimento: 69 deriváveis estritas");
  requireFact(pcov.naoDerivaveis === 3, "pós-banimento: 3 faltas não deriváveis");
  requireFact(pcov.viaEstadoDeEntrada === 3, "pós-banimento: 3 via estado de entrada");
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
  const prevPosban = posban.previsao.conceitualSeAcertarTudoDerivavelEstrito;
  requireFact(approx(prevPosban, 0.607, 5e-4), "pós-banimento: previsão pontual reproduzida em 0,607");
  requireAnyText(
    [
      `${pcov.faltasNaoMecanicas} faltas conceituais não mecânicas`,
    ],
    "manuscrito relata as 75 faltas"
  );
  requireAnyText(
    [
      `${pcov.derivaveisEstrito}/${pcov.faltasNaoMecanicas} deriváveis estritas (`,
      String(Math.round((pcov.derivaveisEstrito / pcov.faltasNaoMecanicas) * 100)),
      "\\%)",
    ],
    "manuscrito relata 69/75 (92%)"
  );
  requireAnyText(
    ["teto de completude computado de ", pt3(teto)],
    "manuscrito cita o teto computado 0,992"
  );
  requireAnyText(
    ["reproduz a previsão pontual em ", pt3(prevPosban)],
    "manuscrito cita a reexecução pós-banimento 0,607"
  );
  requireAnyText(
    [", variação de ", pt3(Math.abs(prev.conceitualSeAcertarTudoDerivavelEstrito - prevPosban)), " em relação ao artefato preservado"],
    "manuscrito quantifica a variação 0,002 entre previsões"
  );
  // tabela tab:previsao, linha a linha
  requireAnyText(
    [`Faltas conceituais não mecânicas (configuração anterior) & ${pcov.faltasNaoMecanicas}`],
    "tabela previsão: 75 faltas"
  );
  requireAnyText(
    [
      `Deriváveis estritas dos fatos admissíveis pós-banimento & ${pcov.derivaveisEstrito} (`,
      String(Math.round((pcov.derivaveisEstrito / pcov.faltasNaoMecanicas) * 100)),
      "\\%)",
    ],
    "tabela previsão: 69 (92%)"
  );
  requireAnyText(
    [`Deriváveis apenas via estados de entrada parcial & ${pcov.viaEstadoDeEntrada}`],
    "tabela previsão: 3 via entrada"
  );
  requireAnyText(
    [`Não deriváveis (três réplicas de \\path{17pencils:5/7}) & ${pcov.naoDerivaveis}`],
    "tabela previsão: 3 não deriváveis"
  );
  requireAnyText(
    ["F1 conceitual previsto (previsão preservada, pré-banimento) & ", pt3(prev.conceitualSeAcertarTudoDerivavelEstrito)],
    "tabela previsão: F1 preservado 0,609"
  );
  requireAnyText(
    ["F1 conceitual previsto (reexecução pós-banimento) & ", pt3(prevPosban)],
    "tabela previsão: F1 pós-banimento 0,607"
  );
  requireAnyText(
    ["Teto de completude computado (pós-banimento) & ", pt3(teto)],
    "tabela previsão: teto 0,992"
  );

  // ------------------------------------------------------- previsto vs. medido
  requireAnyText(
    [
      "O experimento mediu F1 conceitual de ",
      pt3(f1c.mean, resolved.conceptual),
      " (IC ",
      pt3(f1c.lower),
      "--",
      pt3(f1c.upper),
      "), ",
      pt3(f1c.mean - prev.conceitualSeAcertarTudoDerivavelEstrito),
      " acima da previsão pontual de ",
      pt3(prev.conceitualSeAcertarTudoDerivavelEstrito),
    ],
    "previsto vs. medido: delta de F1"
  );
  requireAnyText(
    [
      "A completude conceitual medida, ",
      pt3(rc.mean),
      " (IC ",
      pt3(rc.lower),
      "--",
      pt3(rc.upper),
      "), fica ",
      pt3(teto - rc.mean),
      " abaixo do teto computado de ",
      pt3(teto),
    ],
    "previsto vs. medido: resíduo de completude"
  );

  // ------------------------------------------------------ registro de integridade
  requireText(
    /\\path\{mfNum\}, \\path\{badCount\} e \\path\{doubleDiv\}/,
    "manuscrito nomeia os três parâmetros banidos"
  );
  requireText(/vazamento de gabarito/, "manuscrito classifica o uso como vazamento");
  requireText(/17pencils/, "manuscrito nomeia o caso 17pencils");
  requireText(
    /teto honesto da previsão é 0,992, não 1,000/,
    "manuscrito declara o teto honesto 0,992 vs 1,000"
  );
  requireText(
    /\\path\{__tests__\/interface-reconstruction\.test\.mjs\}/,
    "manuscrito cita o teste que trava o banimento"
  );
  requireText(/trivia de protocolo/, "manuscrito recusa o passo done como trivia");
  requireText(
    /\\path\{recallSteps\} de 0,66 para 0,83/,
    "manuscrito quantifica a recusa do passo done"
  );
  requireText(
    "A análise preservada, portanto, ainda contém a fonte banida",
    "manuscrito declara a cronologia pré-banimento da previsão"
  );
  requireFact(c5Readme.includes("0,992"), "README C5 registra o teto 0,992");
  requireFact(c5Protocol.includes("0,992"), "protocolo C5 registra o teto 0,992");
  requireFact(
    c5Protocol.includes("0,66, não 0,83"),
    "protocolo C5 registra a recusa do passo done (0,66 vs 0,83)"
  );

  // ------------------------------------------------ emendas, confounder, kappa
  requireText(/leakage} de desenho/, "manuscrito declara leakage de desenho");
  requireText(/confounder declarado/, "manuscrito declara o confounder");
  requireText(/\\path\{qwen\/qwen3-max\}/, "manuscrito nomeia qwen3-max");
  requireText(/\\path\{tiers\.js\}/, "manuscrito atribui a recomendação a tiers.js");
  requireText(/\\path\{resolveEvalStudentConfig\}/, "manuscrito cita o espelho verificável");
  requireText(/\\path\{STI_EVAL_3B_MODEL\}/, "manuscrito cita o override de modelo");
  requireText(/\\path\{findLeaksInRobotInput\}/, "manuscrito cita a trava anti-vazamento");
  requireText(/Feinstein; Cicchetti, 1990/, "manuscrito cita Feinstein e Cicchetti");
  requireText(/Byrt; Bishop; Carlin, 1993/, "manuscrito cita a referência do PABAK");
  requireText(/PABAK/, "manuscrito adota PABAK");
  requireText(
    /kappa de Cohen foi abandonado/,
    "manuscrito declara o abandono do kappa"
  );
  requireText(
    /INVESTIGACAO-KAPPA-2026-07-19\.md/,
    "manuscrito aponta a investigação do kappa"
  );
  requireFact(
    kappaDoc.includes("PABAK") && kappaDoc.includes("Feinstein"),
    "investigação do kappa fundamenta PABAK e o paradoxo"
  );
  // intervenções intermediárias: mencionadas sem números, com ponteiro ao pacote
  requireText(
    /intervenções intermediárias de prompt e de compilação foram testadas/,
    "limitações: intervenções intermediárias mencionadas sem números"
  );
  requireText(
    /\\path\{docs\/PROTOCOLO-CAMPANHA-5\.md\}/,
    "limitações: ponteiro ao protocolo retrospectivo"
  );

  // 0,913 nunca vira "quase perfeito": toda ocorrência deve estar negada
  const ptOccur = (tex.match(/quase perfeito/g) ?? []).length;
  const ptNegated = (tex.match(/não é lido como quase perfeito/g) ?? []).length;
  requireFact(ptOccur > 0 && ptOccur === ptNegated, "pt: 'quase perfeito' aparece apenas negado");
  const enOccur = (tex.match(/near-perfect/g) ?? []).length;
  const enNegated = (tex.match(/is not read as near-perfect/g) ?? []).length;
  requireFact(enOccur > 0 && enOccur === enNegated, "en: 'near-perfect' aparece apenas negado");

  // --------------------------------------------------------- hashes e figuras
  const hashedArtifacts = [
    "resultados/campanha5-2026-07-19/6-final-megabrain/summary.json",
    "resultados/campanha5-2026-07-19/previsao-teorica/previsao-recheck.json",
    "resultados/campanha5-2026-07-19/previsao-teorica/previsao-recheck-pos-banimento.json",
    "analysis/previsao-recheck-pos-banimento.mjs",
    "resultados/campanha-2026-07-02/campaign-summary.json",
    "docs/PROTOCOLO-CAMPANHA-5.md",
    "docs/INVESTIGACAO-KAPPA-2026-07-19.md",
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
