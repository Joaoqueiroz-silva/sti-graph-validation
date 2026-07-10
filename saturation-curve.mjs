#!/usr/bin/env node
/**
 * saturation-curve.mjs — Curva de saturação do ENSEMBLE de erros (P1-4 do parecer).
 *
 * Pergunta: quantas execuções do agente de misconceptions (3b) são necessárias
 * para saturar a cobertura do catálogo do especialista? A campanha 2 mostrou que
 * a união de 3 execuções eleva a cobertura de 47% para 64%; aqui a curva é medida
 * de forma controlada: K execuções independentes do 3b por exercício, cobertura
 * conceitual média para cada K = 1..K_MAX (média sobre permutações da ordem).
 *
 * Uso: node -r dotenv/config saturation-curve.mjs [K_MAX=5] [--out arquivo.json]
 */
import fs from "node:fs";
import { agent3b_atRiskStudent } from "./agents3-students.js";
import { parseBrdToExpertNeutral, parseBrdToRobotInput } from "./parse-ctat-brd.js";
import { canonAnswer, miscKey } from "./schema.js";

const K_MAX = parseInt(process.argv[2] || "5", 10);
const outIdx = process.argv.indexOf("--out");
const outPath = outIdx > 0 ? process.argv[outIdx + 1] : "saturation-curve.json";
const base = "cases/ctat-6.17";
const ids = fs.readdirSync(base).filter((d) => fs.existsSync(`${base}/${d}/expert.brd`)).sort();

function stateFor(iface) {
  return {
    seedProblems: [{
      problemId: 1, statement: iface.problem, correctAnswer: iface.correctAnswer,
      interface: { components: iface.components },
      instrucoes: "ESTA É UMA INSTÂNCIA CONCRETA. Use os VALORES CONCRETOS deste enunciado em wrongAnswer (valor atômico que iria no componente, ex.: '5','1/5'). Aja SOMENTE sobre os componentes listados.",
    }],
    discipline: "Matemática", topic: iface.problem?.slice(0, 60) || "—",
    difficulty: "medium", ageGroup: "11",
    knowledgeComponents: (iface.knowledgeComponents || []).map((kc) => ({ id: kc.id, name: kc.name || kc.id })),
    sessionId: null,
  };
}
function extractKeys(atRiskTrace) {
  const keys = new Set();
  for (const sol of atRiskTrace?.solutions || [])
    for (const att of sol.attempts || [])
      for (const t of att.solutionTrace || []) {
        const e = t && t.isCorrect === false ? t.error : null;
        if (e) { const k = miscKey({ wrongAnswer: e.wrongAnswer, description: e.description, id: e.misconceptionId }); if (k) keys.add(k); }
      }
  return keys;
}

const porExercicio = [];
for (const id of ids) {
  const brd = fs.readFileSync(`${base}/${id}/expert.brd`, "utf8");
  const expert = parseBrdToExpertNeutral(brd);
  const iface = parseBrdToRobotInput(brd, { id });
  const alvo = new Set(expert.misconceptions.filter((m) => !m.mechanical).map((m) => m.key));
  // K_MAX execuções independentes do 3b, em paralelo
  const runs = await Promise.all(Array.from({ length: K_MAX }, () =>
    agent3b_atRiskStudent(stateFor(iface)).then((r) => extractKeys(r.atRiskTrace)).catch(() => new Set())
  ));
  // cobertura acumulada média sobre K_MAX rotações da ordem (permutação circular)
  const cobertura = [];
  for (let k = 1; k <= K_MAX; k++) {
    let acc = 0;
    for (let rot = 0; rot < K_MAX; rot++) {
      const uniao = new Set();
      for (let j = 0; j < k; j++) for (const key of runs[(rot + j) % K_MAX]) uniao.add(key);
      const cobertos = [...alvo].filter((a) => uniao.has(a)).length;
      acc += alvo.size ? cobertos / alvo.size : 1;
    }
    cobertura.push(acc / K_MAX);
  }
  porExercicio.push({ id, alvo: alvo.size, cobertura });
  process.stdout.write(`${id}: ${cobertura.map((c) => (100 * c).toFixed(0) + "%").join(" → ")}\n`);
}
const media = Array.from({ length: K_MAX }, (_, i) =>
  porExercicio.reduce((s, e) => s + e.cobertura[i], 0) / porExercicio.length
);
console.log("\nCURVA DE SATURAÇÃO (média dos 24 exercícios, cobertura conceitual):");
media.forEach((c, i) => console.log(`  K=${i + 1}: ${(100 * c).toFixed(1)}%`));
fs.writeFileSync(outPath, JSON.stringify({ kMax: K_MAX, media, porExercicio }, null, 2));
console.log(`salvo em ${outPath}`);
