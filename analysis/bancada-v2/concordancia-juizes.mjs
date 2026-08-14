/**
 * analysis/bancada-v2/concordancia-juizes.mjs — concordância entre os dois
 * juízes do painel (kappa de Cohen), item a item (2026-08-14).
 *
 * Pareia os julgamentos por (exercício, candidato, origem) entre os JSONs dos
 * dois juízes e reporta: kappa geral, kappa por origem, e os desacordos.
 * Kappa lê-se pela régua usual (Landis & Koch): <0,20 fraco; 0,21-0,40
 * razoável; 0,41-0,60 moderado; 0,61-0,80 substancial; >0,80 quase perfeito.
 *
 * Uso: node analysis/bancada-v2/concordancia-juizes.mjs juiz-A.json juiz-B.json [...]
 *      (pares na ordem: A1 B1 A2 B2 ...)
 */
import fs from "node:fs";

export function kappaCohen(pares) {
  const n = pares.length;
  if (!n) return { n: 0, po: null, kappa: null };
  const a = pares.filter((p) => p.a && p.b).length;
  const d = pares.filter((p) => !p.a && !p.b).length;
  const po = (a + d) / n;
  const pA = pares.filter((p) => p.a).length / n;
  const pB = pares.filter((p) => p.b).length / n;
  const pe = pA * pB + (1 - pA) * (1 - pB);
  return { n, po, kappa: pe === 1 ? 1 : (po - pe) / (1 - pe) };
}

const args = process.argv.slice(2);
if (args.length < 2 || args.length % 2 !== 0) {
  console.error("uso: concordancia-juizes.mjs A1.json B1.json [A2.json B2.json ...]");
  process.exit(2);
}

const todosPares = [];
for (let i = 0; i < args.length; i += 2) {
  const A = JSON.parse(fs.readFileSync(args[i], "utf8"));
  const Bj = JSON.parse(fs.readFileSync(args[i + 1], "utf8"));
  const chave = (j) => `${j.ex}|${j.candidate}|${j.source}`;
  const mapaB = new Map((Bj.julgamentos || []).map((j) => [chave(j), j]));
  for (const ja of A.julgamentos || []) {
    const jb = mapaB.get(chave(ja));
    if (jb) todosPares.push({ rotulo: A.rotulo, source: ja.source, ex: ja.ex, candidate: ja.candidate, a: ja.valid, b: jb.valid });
  }
}
const geral = kappaCohen(todosPares);
console.log("═".repeat(74));
console.log(`CONCORDÂNCIA ENTRE JUÍZES — ${todosPares.length} itens pareados`);
console.log(`  acordo bruto: ${(geral.po * 100).toFixed(1)}% | kappa de Cohen: ${geral.kappa.toFixed(3)}`);
for (const src of [...new Set(todosPares.map((p) => p.source))].sort()) {
  const k = kappaCohen(todosPares.filter((p) => p.source === src));
  console.log(`  ${src.padEnd(22)} n=${String(k.n).padStart(4)} acordo ${(k.po * 100).toFixed(1)}% kappa ${k.kappa.toFixed(3)}`);
}
const desacordos = todosPares.filter((p) => p.a !== p.b);
console.log(`  desacordos: ${desacordos.length} (${((desacordos.length / todosPares.length) * 100).toFixed(1)}%)`);
for (const d of desacordos.slice(0, 6))
  console.log(`    ${d.ex} [${d.source}] ${JSON.stringify(d.candidate).slice(0, 40)} → juiz1=${d.a} juiz2=${d.b}`);
