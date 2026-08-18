#!/usr/bin/env node
/**
 * analysis/bancada-v2/linha-de-base.mjs — LINHA DE BASE DE ACASO e PRECISÃO
 * para a régua de estados (2026-08-18, após auditoria adversarial).
 *
 * PROBLEMA QUE ISTO RESOLVE. `coberturaEstados` é RECALL puro: mede quantos
 * estados da referência aparecem no grafo do agente, e nada a penaliza por
 * gerar estados a mais. Um grafo "papagaio" — que só repete os números do
 * ENUNCIADO, sem nenhum conhecimento da decomposição — atinge cobertura alta
 * (0,52 no 6.17). Sem linha de base, "0,78 de cobertura" é ininterpretável.
 *
 * O QUE MEDIMOS AQUI, por registro:
 *  - baseCobertura: cobertura de um grafo NULO de mesmo tamanho, cujos valores
 *    são os números do enunciado + a resposta correta, em ordem cíclica. É o
 *    que se obtém sabendo APENAS o que o envelope A entrega, sem decompor.
 *  - coberturaAjustada = (obs − base) / (1 − base): a fração do que sobra
 *    acima do acaso (forma de kappa; 0 = indistinguível do papagaio, 1 = teto).
 *  - precisaoEstados: dos estados do agente, quantos casam com ALGUM estado de
 *    valor da referência (dedup por valor) — o termo que faltava ao recall.
 *  - f1Estados: média harmônica de cobertura (recall) e precisão.
 *
 * A base é DETERMINÍSTICA (sem sorteio): mesmo tamanho do grafo do agente,
 * mesmo vocabulário disponível no envelope A. Não é um adversário otimizado —
 * é o piso honesto de "quanto se acerta sem saber decompor".
 */
import fs from "node:fs";
import path from "node:path";
import { pontuarCaminho, canonizarValor } from "./comparar-caminho.mjs";
import { problemsDirRelativo } from "../../dataset-config.js";

/** Vocabulário que o agente recebe no envelope A: números do enunciado + resposta. */
export function vocabularioDoEnvelopeA(envelopeA) {
  const nums = [...String(envelopeA.problem ?? "").matchAll(/-?\d+(?:[.,]\d+)?(?:\s*\/\s*-?\d+)?/g)].map((m) =>
    m[0].replace(/\s+/g, "")
  );
  const resp = String(envelopeA.correctAnswer ?? "").trim();
  const vocab = [...new Set([...nums, resp].filter(Boolean))];
  return vocab.length ? vocab : ["1"];
}

/** Grafo NULO: k estados com o vocabulário do envelope A em ordem cíclica. */
export function grafoPapagaio(envelopeA, k) {
  const vocab = vocabularioDoEnvelopeA(envelopeA);
  return {
    passos: Array.from({ length: Math.max(1, k) }, (_, i) => ({ indice: i + 1, acao: "", kc: "", valor: vocab[i % vocab.length] })),
    erros: [],
    dicas: [],
  };
}

/** Precisão de estados: estados distintos do agente que existem na referência. */
export function precisaoEstados(passosAgente, refEx) {
  const alvo = new Set((refEx?.caminho || []).filter((c) => !c.sistema && !c.mecanico && c.valor).map((c) => c.valor));
  const doAgente = [...new Set((passosAgente || []).map((p) => canonizarValor(p.valor)).filter(Boolean))];
  if (!doAgente.length || !alvo.size) return null;
  return doAgente.filter((v) => alvo.has(v)).length / doAgente.length;
}

/** Métricas de base/precisão para UM registro materializado. */
export function pontuarComBase(run, envelopeA, envelopeB, refEx) {
  const grafo = run.materializado?.grafo || run.grafo;
  const obs = pontuarCaminho({ ...run, grafo }, envelopeB, refEx);
  const base = pontuarCaminho(
    { exercicio: run.exercicio ?? run.id, grafo: grafoPapagaio(envelopeA, (grafo.passos || []).length) },
    envelopeB,
    refEx
  );
  const ajustada = base.coberturaEstados >= 1 ? null : (obs.coberturaEstados - base.coberturaEstados) / (1 - base.coberturaEstados);
  const prec = precisaoEstados(grafo.passos, refEx);
  const rec = obs.coberturaEstados;
  return {
    ex: obs.ex,
    replica: obs.replica,
    coberturaEstados: rec,
    baseCobertura: base.coberturaEstados,
    coberturaAjustada: ajustada,
    baseCaminhoIntegro: base.caminhoIntegro,
    caminhoIntegro: obs.caminhoIntegro,
    precisaoEstados: prec,
    f1Estados: prec != null && rec + prec > 0 ? (2 * rec * prec) / (rec + prec) : null,
    nEstadosAgente: obs.nEstadosAgente,
  };
}

const ehMain = process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (ehMain) {
  const argv = process.argv.slice(2);
  const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
  const dir = opt("--mat", null);
  if (!dir) { console.error("uso: --mat <dir materializado> [--json out]"); process.exit(2); }
  const { carregarReferencia, intervalo, media, fmt } = await import("../validacao-v2/lib.mjs");
  const REF = carregarReferencia(".");
  const DS = problemsDirRelativo();
  const linhas = [];
  for (const f of fs.readdirSync(path.join(dir, "runs")).filter((x) => x.endsWith(".json")).sort()) {
    const r = JSON.parse(fs.readFileSync(path.join(dir, "runs", f), "utf8"));
    const ex = r.exercicio ?? r.id;
    if (!REF[ex] || !(r.materializado?.grafo || r.grafo)) continue;
    const A = JSON.parse(fs.readFileSync(path.join(DS, ex, "envelope-a.json"), "utf8"));
    const B = JSON.parse(fs.readFileSync(path.join(DS, ex, "envelope-b.json"), "utf8"));
    linhas.push(pontuarComBase(r, A, B, REF[ex]));
  }
  const L = (c) => intervalo(linhas, c);
  const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : "N/A");
  console.log(`LINHA DE BASE — ${path.basename(dir)} — ${linhas.length} grafos`);
  console.log(`  cobertura observada .......... ${fmt(L("coberturaEstados"))}`);
  console.log(`  cobertura da BASE (papagaio) . ${fmt(L("baseCobertura"))}`);
  console.log(`  cobertura AJUSTADA ........... ${fmt(L("coberturaAjustada"))}`);
  console.log(`  precisão de estados .......... ${fmt(L("precisaoEstados"))}`);
  console.log(`  F1 de estados ................ ${fmt(L("f1Estados"))}`);
  console.log(`  caminho íntegro obs / base ... ${f3(L("caminhoIntegro").estimativa)} / ${f3(L("baseCaminhoIntegro").estimativa)}`);
  console.log(`  estados/grafo ................ ${media(linhas.map((l) => l.nEstadosAgente)).toFixed(2)}`);
  const out = opt("--json", null);
  if (out) fs.writeFileSync(out, JSON.stringify({ gerado: new Date().toISOString(), dir, linhas, agregado: Object.fromEntries(["coberturaEstados","baseCobertura","coberturaAjustada","precisaoEstados","f1Estados","caminhoIntegro","baseCaminhoIntegro"].map((c) => [c, L(c)])) }, null, 1));
}
