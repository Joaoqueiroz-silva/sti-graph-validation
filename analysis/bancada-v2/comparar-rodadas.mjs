#!/usr/bin/env node
/**
 * analysis/bancada-v2/comparar-rodadas.mjs — diferença PAREADA (mesmo
 * exercício × réplica) entre duas análises de materializado
 * (analisar-materializado.mjs → *.analise.json): rodada B − rodada A, para o
 * grafo materializado e para a mínima, com BCa em cluster de exercício.
 * Uso: node analysis/bancada-v2/comparar-rodadas.mjs --a <analise A> --b <analise B> [--json out]
 */
import fs from "node:fs";
import { intervalo } from "../validacao-v2/lib.mjs";

const METRICAS = ["coberturaEstados", "coberturaSemOrdem", "caminhoIntegro", "errosNoEstadoCerto"];

export function compararRodadas(analiseA, analiseB) {
  const k = (r) => `${r.ex}#${r.replica}`;
  const mA = new Map(analiseA.porRegistro.map((r) => [k(r), r]));
  const pares = analiseB.porRegistro.filter((r) => mA.has(k(r))).map((r) => ({ b: r, a: mA.get(k(r)) }));
  const bloco = (P) => ({
    n: P.length,
    exercicios: new Set(P.map((p) => p.b.ex)).size,
    materializado: Object.fromEntries(METRICAS.map((c) => [c, intervalo(P.map((p) => ({ ex: p.b.ex, v: p.b.mat[c] - p.a.mat[c] })), "v")])),
    minima: Object.fromEntries(METRICAS.map((c) => [c, intervalo(P.map((p) => ({ ex: p.b.ex, v: p.b.minima[c] - p.a.minima[c] })), "v")])),
  });
  return {
    a: analiseA.rotulo,
    b: analiseB.rotulo,
    todosOsPares: bloco(pares),
    aprovadosNosDoisGates: bloco(pares.filter((p) => p.a.gateEstrito && p.b.gateEstrito)),
  };
}

const ehMain = process.argv[1] && new URL(import.meta.url).pathname.endsWith(process.argv[1].split("/").pop());
if (ehMain) {
  const argv = process.argv.slice(2);
  const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
  const A = JSON.parse(fs.readFileSync(opt("--a"), "utf8"));
  const B = JSON.parse(fs.readFileSync(opt("--b"), "utf8"));
  const R = compararRodadas(A, B);
  const f = (i) => `${i.estimativa >= 0 ? "+" : ""}${i.estimativa.toFixed(3)} [${i.bca[0].toFixed(3)}; ${i.bca[1].toFixed(3)}]`;
  console.log(`Δ pareado ${R.b} − ${R.a}`);
  for (const [nome, b] of [["todos os pares", R.todosOsPares], ["aprovados nos dois gates estritos", R.aprovadosNosDoisGates]]) {
    console.log(`  ${nome}: ${b.n} pares (${b.exercicios} exercícios)`);
    for (const c of METRICAS) console.log(`    ${c.padEnd(20)} materializado ${f(b.materializado[c]).padEnd(28)} | mínima ${f(b.minima[c])}`);
  }
  const out = opt("--json", null);
  if (out) fs.writeFileSync(out, JSON.stringify({ gerado: new Date().toISOString(), ...R }, null, 1));
}
