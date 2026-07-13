#!/usr/bin/env node
/**
 * run-ensemble-v2.mjs — Ensemble do agente 3b sobre o Envelope A v2 (Onda 3, G10).
 *
 * K execuções INDEPENDENTES só do agente de misconceptions (3b) por exercício,
 * sobre o Envelope A v2 (interface-input.js — fonte independente do grafo).
 * Adaptado de saturation-curve.mjs, que usa o envelope v1 derivado do `.brd`
 * (parseBrdToRobotInput) — aqui a entrada é a mesma da campanha 3.
 *
 * 2026-07-13 (Onda 3): este script SÓ COLETA — grava por exercício as K listas de
 * wrongAnswers (cruas + chaves canônicas miscKey) e as uniões por K com rotação
 * (permutação circular, como na curva original). NENHUMA análise estatística aqui:
 * cobertura/curva de saturação ficam no reanalyze (analysis/), sobre este JSON.
 *
 * Política de falhas (§6.6): execução que falha (LLM/parse) entra como
 * { error } — registrada, nunca excluída; contribui conjunto vazio às uniões.
 *
 * Uso: node -r dotenv/config run-ensemble-v2.mjs [corpus] --k 10 --out ensemble-v2.json [--limit N]
 * Modelo via env (GEN_MODEL/AGENT3B_MODEL — llm.js); manifesto via STI_RUN_ID.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildAllEnvelopesA2 } from "./interface-input.js";
import { agent3b_atRiskStudent } from "./agents3-students.js";
import { miscKey } from "./schema.js";
import { sha256 } from "./exec-manifest.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = { corpus: path.join(HERE, "cases/ctat-6.17"), k: 10, out: "ensemble-v2.json", limit: Infinity };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--k") out.k = parseInt(argv[++i], 10) || 10;
    else if (a === "--out") out.out = argv[++i];
    else if (a === "--limit") out.limit = parseInt(argv[++i], 10) || Infinity;
    else if (!a.startsWith("--")) out.corpus = a;
  }
  return out;
}

/** state dos agentes de produção para o Envelope A v2 (espelha o stateFor da curva v1). */
function stateFor(envelope, meta) {
  return {
    seedProblems: [
      {
        problemId: 1,
        statement: envelope.problem,
        correctAnswer: envelope.correctAnswer,
        interface: { components: (envelope.components || []).map((c) => ({ id: c.id, type: c.type, label: c.label })) },
        instrucoes:
          "ESTA É UMA INSTÂNCIA CONCRETA. Use os VALORES CONCRETOS deste enunciado em wrongAnswer " +
          "(valor atômico que iria no componente, ex.: '5','1/5'). Aja SOMENTE sobre os componentes listados.",
      },
    ],
    discipline: "Matemática",
    topic: envelope.problem?.slice(0, 60) || "—",
    difficulty: "medium",
    ageGroup: "11",
    // Envelope A v2 NÃO carrega KCs (decisão E4.1 — só existiam no grafo do especialista).
    knowledgeComponents: [],
    sessionId: null,
    llmMeta: meta, // manifesto: exerciseId + envelopeSha256 por chamada (G11)
  };
}

/** wrongAnswers crus (na ordem) + chaves canônicas de uma execução do 3b. */
function extractWrong(atRiskTrace) {
  const wrongAnswers = [];
  const keys = [];
  for (const sol of atRiskTrace?.solutions || [])
    for (const att of sol.attempts || [])
      for (const t of att.solutionTrace || []) {
        const e = t && t.isCorrect === false ? t.error : null;
        if (!e) continue;
        wrongAnswers.push(e.wrongAnswer != null ? String(e.wrongAnswer) : "");
        const k = miscKey({ wrongAnswer: e.wrongAnswer, description: e.description, id: e.misconceptionId });
        if (k) keys.push(k);
      }
  return { wrongAnswers, keys };
}

/** Uniões acumuladas por K com rotação circular (mesma varredura da curva original). */
function unionsWithRotation(runKeys, K) {
  const out = [];
  for (let k = 1; k <= K; k++) {
    const rotacoes = [];
    for (let rot = 0; rot < K; rot++) {
      const uniao = new Set();
      for (let j = 0; j < k; j++) for (const key of runKeys[(rot + j) % K]) uniao.add(key);
      rotacoes.push([...uniao].sort());
    }
    out.push({ k, rotacoes });
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const K = args.k;
  if (!process.env.STI_RUN_ID) process.env.STI_RUN_ID = `ensemble-v2-k${K}`; // nome do manifesto

  const envelopes = buildAllEnvelopesA2(args.corpus).slice(
    0,
    Number.isFinite(args.limit) ? args.limit : undefined
  );
  console.log(`Ensemble v2: ${envelopes.length} exercício(s) × K=${K} execuções do 3b…`);

  const exercises = [];
  for (const envelope of envelopes) {
    const envelopeSha256 = sha256(JSON.stringify(envelope));
    // K execuções independentes, em paralelo (como na curva v1); falha vira { error }.
    const runs = await Promise.all(
      Array.from({ length: K }, () =>
        agent3b_atRiskStudent(stateFor(envelope, { exerciseId: envelope.id, envelopeSha256 }))
          .then((r) => extractWrong(r.atRiskTrace))
          .catch((e) => ({ error: String(e && e.message ? e.message : e) }))
      )
    );
    const runKeys = runs.map((r) => r.keys || []);
    exercises.push({
      id: envelope.id,
      envelopeSha256,
      runs,
      unioes: unionsWithRotation(runKeys, K),
    });
    const sizes = runs.map((r) => (r.error ? "ERR" : String((r.wrongAnswers || []).length)));
    process.stdout.write(`${envelope.id}: [${sizes.join(", ")}] wrongAnswers por execução\n`);
  }

  const doc = {
    schemaVersion: "ensemble-v2-v1",
    k: K,
    model: process.env.AGENT3B_MODEL || process.env.GEN_MODEL || "google/gemini-3.5-flash",
    corpus: path.basename(args.corpus),
    envelope: "envelope-a-v2",
    manifestRunId: process.env.STI_RUN_ID,
    generatedAt: new Date().toISOString(),
    exercises,
  };
  fs.writeFileSync(args.out, JSON.stringify(doc, null, 2));
  console.log(`salvo em ${args.out} (análise estatística fica no reanalyze — nada calculado aqui)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => {
    console.error(`ERRO: ${e.message}`);
    process.exit(1);
  });
}
