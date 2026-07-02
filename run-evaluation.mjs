#!/usr/bin/env node
/**
 * evaluation/run-evaluation.mjs — Roda o experimento da "interface fixa".
 *
 * Uso:
 *   node evaluation/run-evaluation.mjs [caminho-do-caso]
 *   node evaluation/run-evaluation.mjs cases/soma-27-mais-15      (caso único)
 *   node evaluation/run-evaluation.mjs cases                      (vários casos → agrega)
 *
 * Para cada caso: o robô AUTORA o grafo para a interface, audita a integridade,
 * compara com cada grafo de especialista (F1), e (com vários casos) roda o teste
 * de NÃO-INFERIORIDADE da semelhança robô–humano vs humano–humano.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { authorGraphForInterface } from "./author-graph.js";
import { compareGraphs } from "./metrics.js";
import { nonInferiority } from "./stats.js";
import { auditBehaviorGraph } from "./behavior-graph-integrity.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const loadJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const isCaseDir = (d) => fs.existsSync(path.join(d, "interface.json"));

function runCase(dir) {
  const iface = loadJson(path.join(dir, "interface.json"));
  const traces = loadJson(path.join(dir, "traces.json"));
  const experts = fs
    .readdirSync(dir)
    .filter((f) => /^expert.*\.json$/.test(f))
    .sort()
    .map((f) => ({ name: f.replace(/\.json$/, ""), graph: loadJson(path.join(dir, f)) }));

  const robotGraph = authorGraphForInterface(iface, traces);
  const audit = auditBehaviorGraph(robotGraph);
  const caseId = iface.id || path.basename(dir);

  const pairs = [];
  for (let i = 0; i < experts.length; i++) {
    for (let j = i + 1; j < experts.length; j++) {
      const cmp = compareGraphs(experts[i].graph, experts[j].graph);
      pairs.push({
        exercise: caseId,
        pairType: "HH",
        a: experts[i].name,
        b: experts[j].name,
        value: cmp.similarity,
        cmp,
      });
    }
  }
  for (const e of experts) {
    const cmp = compareGraphs(e.graph, robotGraph, { ref: e.name, cand: "robo" });
    pairs.push({
      exercise: caseId,
      pairType: "RH",
      a: "robo",
      b: e.name,
      value: cmp.similarity,
      cmp,
    });
  }
  return { caseId, iface, robotGraph, audit, experts, pairs };
}

function printCase(res) {
  const line = "─".repeat(64);
  console.log(`\n${line}\nCASO: ${res.caseId}  —  "${res.iface.problem}"\n${line}`);

  const a = res.audit;
  console.log(
    `Grafo do robô: ${a.stepCount} passos · integridade=${a.ok ? "OK ✅" : "FALHA ❌"} ` +
      `(dangling=${a.dangling.length}, conexo=${a.connected}, órfãs=${a.orphanMisconceptions.length})`
  );

  const robotMiscs = res.robotGraph.nodes
    .filter((n) => n.type === "step")
    .flatMap((n) => (n.misconceptions || []).map((m) => m.wrongAnswer))
    .filter(Boolean);
  console.log(`Erros previstos pelo robô (wrongAnswer): [${robotMiscs.join(", ")}]`);

  const HH = res.pairs.filter((p) => p.pairType === "HH");
  const RH = res.pairs.filter((p) => p.pairType === "RH");

  console.log("\n  Humano × Humano (a régua):");
  for (const p of HH) console.log(`    ${pad(p.a)} ↔ ${pad(p.b)}  F1=${fmt(p.value)}`);

  console.log("\n  Robô × Humano:");
  for (const p of RH) {
    const miss = p.cmp.detail.missingMisconceptions;
    const extra = p.cmp.detail.extraMisconceptions;
    let note = "";
    if (miss.length) note += `  faltou: [${miss.join(",")}]`;
    if (extra.length) note += `  a mais: [${extra.join(",")}]`;
    console.log(
      `    robo  ↔ ${pad(p.b)}  F1=${fmt(p.value)} (P=${fmt(p.cmp.precision)} R=${fmt(p.cmp.recall)})${note}`
    );
  }
}

function pad(s) {
  return String(s).padEnd(10);
}
function fmt(x) {
  return x.toFixed(3);
}

function main() {
  const arg = process.argv[2] || "cases/soma-27-mais-15";
  const root = path.isAbsolute(arg) ? arg : path.join(HERE, arg);
  if (!fs.existsSync(root)) {
    console.error(`Caminho não encontrado: ${root}`);
    process.exit(1);
  }

  const caseDirs = isCaseDir(root)
    ? [root]
    : fs
        .readdirSync(root)
        .map((d) => path.join(root, d))
        .filter((d) => fs.statSync(d).isDirectory() && isCaseDir(d));

  if (!caseDirs.length) {
    console.error(`Nenhum caso (com interface.json) encontrado em ${root}`);
    process.exit(1);
  }

  const results = caseDirs.map(runCase);
  results.forEach(printCase);

  // Agrega todos os pares para a não-inferioridade
  const data = results.flatMap((r) =>
    r.pairs.map((p) => ({ value: p.value, exercise: p.exercise, pairType: p.pairType }))
  );
  const ni = nonInferiority(data, { margin: 0.1 });

  const line = "═".repeat(64);
  console.log(`\n${line}\nTESTE DE NÃO-INFERIORIDADE (margem δ = ${ni.margin})\n${line}`);
  console.log(`Casos (exercícios): ${ni.nExercises}  ·  pares HH=${ni.nHH}  RH=${ni.nRH}`);
  console.log(`média Humano×Humano = ${ni.meanHH}   |   média Robô×Humano = ${ni.meanRH}`);
  console.log(`diferença (RH − HH) = ${ni.diff}   |   IC 95% = [${ni.ci.lower}, ${ni.ci.upper}]`);
  console.log(`\n  ➤ VEREDITO: ${ni.verdict.toUpperCase()}`);
  if (!ni.reliable) {
    console.log(
      `\n  ⚠️  Inferência ILUSTRATIVA: só ${ni.nExercises} exercício(s). ` +
        `Para conclusão real, use ~20+ exercícios (cálculo de poder).`
    );
  }

  // Salva o relatório
  const report = {
    generatedFrom: caseDirs.map((d) => path.relative(HERE, d)),
    cases: results.map((r) => ({
      caseId: r.caseId,
      audit: { ok: r.audit.ok, stepCount: r.audit.stepCount, connected: r.audit.connected },
      pairs: r.pairs.map((p) => ({
        pairType: p.pairType,
        a: p.a,
        b: p.b,
        f1: p.value,
        precision: p.cmp.precision,
        recall: p.cmp.recall,
        missing: p.cmp.detail.missingMisconceptions,
        extra: p.cmp.detail.extraMisconceptions,
      })),
    })),
    nonInferiority: ni,
  };
  const out = path.join(isCaseDir(root) ? root : root, "report.json");
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`\nRelatório salvo em: ${path.relative(process.cwd(), out)}\n`);
}

main();
