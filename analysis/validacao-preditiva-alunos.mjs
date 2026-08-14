/**
 * analysis/validacao-preditiva-alunos.mjs — VALIDADE PREDITIVA dos grafos de
 * comportamento do EducaOFF contra ERROS REAIS DE ALUNOS (2026-08-14).
 *
 * A pergunta que nem a comparação com especialista (CTAT) nem a régua
 * intrínseca respondem: os erros que o grafo prevê são os que alunos REAIS
 * cometem? Método padrão da literatura de bug catalogs / example-tracing
 * (Brown & Burton 1978; VanLehn 1990; Aleven et al.): confrontar o catálogo
 * com o log de comportamento real.
 *
 * Para cada resposta ERRADA real (interactions.json, com answer_given e
 * node_id), no tutor publicado correspondente:
 *   - ANTECIPADA NO PASSO: o nó do grafo onde o aluno errou tem uma
 *     misconception cujo wrongAnswer casa com a resposta dada (nível 2 com
 *     dados reais);
 *   - ANTECIPADA NO PROBLEMA: qualquer nó do grafo daquele problema;
 *   - DIAGNÓSTICO EM RUNTIME: o misconception_id que o motor atribuiu na hora
 *     (específico pela régua PR#27 / genérico / nenhum).
 * E, por tutor: UTILIZAÇÃO — % dos branches de misconception do grafo que
 * algum aluno real acionou (branch nunca acionado = previsão morta ou aluno
 * de menos; reportado junto com o volume de interações).
 *
 * Controles de leitura:
 *   - attempt==1 separado (1ª tentativa é o sinal mais limpo de misconception;
 *     tentativas seguintes misturam chute/slip — VanLehn; Norman 1981);
 *   - branches com marca de origem colheita (se marcados) contados à parte —
 *     erro real que virou diagnóstico não pode contar como "previsão".
 *
 * LEITURA SOMENTE; student_id/session_id JAMAIS entram na saída.
 *
 * Uso: node analysis/validacao-preditiva-alunos.mjs \
 *        --tutores <shared_tutors.json> --interacoes <interactions.json> \
 *        [--json saida.json]
 */

import fs from "node:fs";
import crypto from "node:crypto";
import { isSpecificMisconceptionId } from "../step-error-catalog.js";

const argv = process.argv.slice(2);
const opt = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : d;
};
const TUTORES = opt("--tutores", null);
const INTERACOES = opt("--interacoes", null);
const SAIDA = opt("--json", null);
if (!TUTORES || !INTERACOES) {
  console.error("uso: --tutores <shared_tutors.json> --interacoes <interactions.json> [--json out]");
  process.exit(2);
}

const sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const tutores = Object.values(JSON.parse(fs.readFileSync(TUTORES, "utf8")));
const porId = new Map(tutores.map((t) => [t.id, t]));
const interacoes = JSON.parse(fs.readFileSync(INTERACOES, "utf8"));

/** normalização de resposta: minúsculas, sem espaços; igualdade numérica quando ambas parseiam. */
const canon = (v) =>
  String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/,/g, ".");
function mesmaResposta(a, b) {
  const ca = canon(a);
  const cb = canon(b);
  if (!ca || !cb) return false;
  if (ca === cb) return true;
  const na = Number(ca);
  const nb = Number(cb);
  return Number.isFinite(na) && Number.isFinite(nb) && Math.abs(na - nb) < 1e-9;
}

const marcaColheita = (m) =>
  /colheita/i.test(String(m?.source ?? m?.graphDiagnosticSource ?? m?.origin ?? ""));

// ── varre os erros reais ────────────────────────────────────────────────────
const erros = interacoes.filter((i) => i.correct === false && String(i.answer_given ?? "") !== "");
const avaliaveis = [];
let semTutor = 0;
let semNo = 0;
for (const e of erros) {
  const t = porId.get(e.tutor_id);
  if (!t) {
    semTutor++;
    continue;
  }
  // problem_id é o ID do problema (numérico, mas NÃO é índice do array);
  // casa por id primeiro, índice como fallback (diagnóstico 2026-08-14:
  // 375 dos 549 erros só casam por id).
  const probs = t.problems || [];
  const prob =
    probs.find((p) => String(p?.id) === String(e.problem_id)) ??
    probs[Number(e.problem_id)] ??
    null;
  const bg = prob?.behaviorGraph;
  if (!bg) {
    semNo++;
    continue;
  }
  const nodes = bg.nodes || [];
  const no = nodes.find((n) => n.id === e.node_id) ?? null;
  const miscsNo = no?.misconceptions ?? [];
  const miscsProblema = nodes.filter((n) => n.type === "step").flatMap((n) => n.misconceptions || []);

  const casaNo = miscsNo.some((m) => !marcaColheita(m) && mesmaResposta(m.wrongAnswer, e.answer_given));
  const casaNoComColheita = miscsNo.some((m) => mesmaResposta(m.wrongAnswer, e.answer_given));
  const casaProblema = miscsProblema.some(
    (m) => !marcaColheita(m) && mesmaResposta(m.wrongAnswer, e.answer_given)
  );
  const runtimeId = e.misconception_id ? String(e.misconception_id) : null;

  avaliaveis.push({
    tutorId: e.tutor_id,
    mesTutor: t.sharedAt ? String(t.sharedAt).slice(0, 7) : "sem-data",
    attempt1: Number(e.attempt_number) === 1,
    noEncontrado: !!no,
    casaNo,
    casaNoComColheita,
    casaProblema,
    runtime: runtimeId
      ? isSpecificMisconceptionId(runtimeId)
        ? "especifica"
        : "generica"
      : "nenhuma",
  });
}

// ── utilização dos branches (tutores com >= 5 erros reais) ──────────────────
const errosPorTutor = new Map();
for (const a of avaliaveis) {
  (errosPorTutor.get(a.tutorId) ?? errosPorTutor.set(a.tutorId, []).get(a.tutorId)).push(a);
}
const utilizacao = [];
for (const [tid, lista] of errosPorTutor) {
  if (lista.length < 5) continue;
  const t = porId.get(tid);
  const respostas = interacoes
    .filter((i) => i.tutor_id === tid && i.correct === false)
    .map((i) => i.answer_given);
  let branches = 0;
  let acionados = 0;
  for (const prob of t.problems || []) {
    for (const n of prob.behaviorGraph?.nodes || []) {
      if (n.type !== "step") continue;
      for (const m of n.misconceptions || []) {
        branches++;
        if (respostas.some((r) => mesmaResposta(m.wrongAnswer, r))) acionados++;
      }
    }
  }
  utilizacao.push({ tutorId: tid, errosReais: lista.length, branches, acionados });
}

// ── agregação ───────────────────────────────────────────────────────────────
const pct = (n, d) => (d ? (n / d) * 100 : null);
function agrega(lista, rotulo) {
  const comNo = lista.filter((a) => a.noEncontrado);
  return {
    rotulo,
    errosReais: lista.length,
    comNoNoGrafo: comNo.length,
    antecipadaNoPasso: pct(comNo.filter((a) => a.casaNo).length, comNo.length),
    antecipadaNoPassoInclColheita: pct(comNo.filter((a) => a.casaNoComColheita).length, comNo.length),
    antecipadaNoProblema: pct(lista.filter((a) => a.casaProblema).length, lista.length),
    runtimeEspecifica: pct(lista.filter((a) => a.runtime === "especifica").length, lista.length),
    runtimeGenerica: pct(lista.filter((a) => a.runtime === "generica").length, lista.length),
    runtimeNenhuma: pct(lista.filter((a) => a.runtime === "nenhuma").length, lista.length),
  };
}
const geral = agrega(avaliaveis, "todos os erros");
const primeira = agrega(avaliaveis.filter((a) => a.attempt1), "1ª tentativa");
const meses = [...new Set(avaliaveis.map((a) => a.mesTutor))].sort();
const porMes = meses
  .map((m) => agrega(avaliaveis.filter((a) => a.mesTutor === m), m))
  .filter((a) => a.errosReais >= 20);

const totBranches = utilizacao.reduce((s, u) => s + u.branches, 0);
const totAcionados = utilizacao.reduce((s, u) => s + u.acionados, 0);

const f1 = (x) => (x === null ? "  —" : x.toFixed(1).padStart(5));
function linha(a) {
  console.log(
    `  ${a.rotulo.padEnd(16)} n=${String(a.errosReais).padStart(4)} | antecipada no PASSO ${f1(a.antecipadaNoPasso)}% ` +
      `(incl. colheita ${f1(a.antecipadaNoPassoInclColheita)}%) | no PROBLEMA ${f1(a.antecipadaNoProblema)}% | ` +
      `runtime: específica ${f1(a.runtimeEspecifica)}% · genérica ${f1(a.runtimeGenerica)}% · nenhuma ${f1(a.runtimeNenhuma)}%`
  );
}
console.log("═".repeat(110));
console.log("VALIDADE PREDITIVA — erros REAIS de alunos vs grafos de comportamento dos STIs publicados");
console.log(
  `erros reais com resposta: ${erros.length} | avaliáveis (tutor publicado + grafo): ${avaliaveis.length} ` +
    `| sem tutor publicado: ${semTutor} | sem grafo/problema: ${semNo}`
);
console.log("═".repeat(110));
linha(geral);
linha(primeira);
console.log("─".repeat(110));
console.log("POR MÊS DE PUBLICAÇÃO DO TUTOR (n≥20):");
for (const a of porMes) linha(a);
console.log("─".repeat(110));
console.log(
  `UTILIZAÇÃO dos branches (tutores com ≥5 erros reais; ${utilizacao.length} tutores): ` +
    `${totAcionados}/${totBranches} = ${pct(totAcionados, totBranches)?.toFixed(1)}% dos branches previstos foram acionados por algum aluno`
);

if (SAIDA) {
  fs.writeFileSync(
    SAIDA,
    JSON.stringify(
      {
        geradoEm: new Date().toISOString(),
        fontes: {
          tutores: { arquivo: TUTORES, sha256: sha(TUTORES) },
          interacoes: { arquivo: INTERACOES, sha256: sha(INTERACOES) },
        },
        geral,
        primeiraTentativa: primeira,
        porMesDoTutor: porMes,
        utilizacao: { tutores: utilizacao.length, branches: totBranches, acionados: totAcionados },
        // por tutor, SEM ids de aluno/sessão
        porTutor: utilizacao,
      },
      null,
      1
    )
  );
  console.log(`\nsalvo em ${SAIDA} (sem student_id/session_id)`);
}
