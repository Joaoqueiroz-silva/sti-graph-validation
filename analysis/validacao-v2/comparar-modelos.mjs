/**
 * comparar-modelos.mjs — compara braços (modelos/perfis) NOS MESMOS exercícios.
 *
 * Por que existe: comparar dois intervalos de confiança que se sobrepõem NÃO
 * autoriza dizer que não há diferença. Quando os dois braços rodaram nos mesmos
 * exercícios, a comparação correta é pareada: calcula-se a diferença dentro de
 * cada exercício e reamostram-se os exercícios. Isso cancela a dificuldade do
 * exercício, que é a maior fonte de variação, e o intervalo encolhe muito.
 *
 * Demonstração com dados sintéticos: com uma diferença real de +0,05 entre dois
 * braços, os intervalos marginais foram [0,473; 0,677] e [0,523; 0,723] —
 * sobreposição quase total, que levaria à conclusão errada de "sem diferença".
 * O intervalo pareado foi [+0,037; +0,050].
 *
 * ATENÇÃO (corrigido em 2026-08-14): `porExercicio` traz uma linha POR RUN, e
 * não por exercício. As réplicas precisam ser promediadas dentro do exercício
 * antes do pareamento. A versão anterior indexava com Object.fromEntries e
 * ficava só com a última réplica, descartando dois terços dos dados em silêncio.
 *
 * Uso:
 *   node analysis/validacao-v2/comparar-modelos.mjs a.json b.json c.json
 *   node analysis/validacao-v2/comparar-modelos.mjs a.json b.json --metrica cobertura --ref 0
 */
import fs from "node:fs";
import path from "node:path";
import { intervalo, media } from "./lib.mjs";

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const metrica = opt("--metrica", "f1");
const iRef = Number(opt("--ref", "0"));
const saida = opt("--json", null);
const arquivos = argv.filter((a) => a.endsWith(".json") && a !== saida);

if (arquivos.length < 2) {
  console.error("informe pelo menos dois relatórios JSON gerados por validar.mjs --json");
  process.exit(2);
}

const CAMPOS = ["cobertura", "precisao", "f1", "fbeta", "jaccard", "passoCerto", "passoEComponente", "posicaoRelativa"];

/** Uma linha por exercício, com as réplicas promediadas. */
function porExercicio(linhas) {
  const g = {};
  for (const r of linhas) (g[r.ex] = g[r.ex] || []).push(r);
  const out = {};
  for (const [ex, rs] of Object.entries(g)) {
    const o = { ex, replicas: rs.length };
    for (const c of CAMPOS) {
      const vs = rs.map((r) => r[c]).filter((v) => typeof v === "number" && Number.isFinite(v));
      o[c] = vs.length ? media(vs) : null;
    }
    out[ex] = o;
  }
  return out;
}

const bracos = arquivos.map((f) => {
  const j = JSON.parse(fs.readFileSync(f, "utf8"));
  if (!Array.isArray(j.porExercicio)) {
    console.error(`${f} não tem o bloco porExercicio. Regere com validar.mjs --json.`);
    process.exit(2);
  }
  return {
    rotulo: j.rotulo || j.perfilModelos || path.basename(f, ".json"),
    modelos: j.modelos || null,
    linhas: j.porExercicio.length,
    por: porExercicio(j.porExercicio),
  };
});

// só exercícios presentes em TODOS os braços — pareamento exige isso
const comuns = Object.keys(bracos[0].por).filter((e) => bracos.every((b) => e in b.por)).sort();
if (!comuns.length) { console.error("nenhum exercício em comum entre os braços"); process.exit(2); }

const P = (s) => console.log(s);
const sinal = (x) => (x >= 0 ? "+" : "");

P("=".repeat(74));
P(`COMPARAÇÃO PAREADA DE BRAÇOS — métrica: ${metrica}`);
P(`${comuns.length} exercícios em comum entre ${bracos.length} braços`);
for (const b of bracos) {
  const reps = [...new Set(comuns.map((e) => b.por[e].replicas))];
  P(`  ${b.rotulo.padEnd(24)} ${b.linhas} registros, ${reps.length === 1 ? reps[0] : reps.join("/")} réplica(s) por exercício (promediadas)`);
}
const perdidos = new Set(bracos.flatMap((b) => Object.keys(b.por))).size - comuns.length;
if (perdidos > 0) P(`AVISO: ${perdidos} exercícios não estão em todos os braços e ficaram de fora.`);
P("=".repeat(74));

P("\nDESEMPENHO DE CADA BRAÇO (no conjunto comum)");
for (const b of bracos) {
  const linhas = comuns.map((e) => ({ ex: e, v: b.por[e][metrica] }));
  const ic = intervalo(linhas, "v");
  P(`  ${b.rotulo.padEnd(26)} ${ic.estimativa.toFixed(4)}  BCa [${ic.bca[0].toFixed(4)}; ${ic.bca[1].toFixed(4)}]`);
  if (b.modelos) for (const [ag, m] of Object.entries(b.modelos)) P(`      ${ag.padEnd(22)} ${m}`);
}
P("\n  Cuidado: estes intervalos podem se sobrepor mesmo havendo diferença real.");
P("  A leitura válida é a diferença pareada abaixo, não a sobreposição acima.");

const ref = bracos[iRef];
P(`\nDIFERENÇA CONTRA "${ref.rotulo}" (pareada por exercício)`);
P("  Um intervalo que NÃO cruza zero é evidência de diferença real.");
const resultados = [];
for (let i = 0; i < bracos.length; i++) {
  if (i === iRef) continue;
  const b = bracos[i];
  const linhas = comuns.map((e) => ({ ex: e, d: b.por[e][metrica] - ref.por[e][metrica] }));
  const ic = intervalo(linhas, "d");
  const ganha = linhas.filter((l) => l.d > 1e-12).length;
  const perde = linhas.filter((l) => l.d < -1e-12).length;
  const empata = linhas.length - ganha - perde;
  const cruzaZero = ic.bca[0] <= 0 && ic.bca[1] >= 0;
  P(`\n  ${b.rotulo}`);
  P(`    Δ = ${sinal(ic.estimativa)}${ic.estimativa.toFixed(4)}  BCa [${sinal(ic.bca[0])}${ic.bca[0].toFixed(4)}; ${sinal(ic.bca[1])}${ic.bca[1].toFixed(4)}]`);
  P(`    vence em ${ganha}, empata em ${empata}, perde em ${perde} dos ${linhas.length} exercícios`);
  P(`    veredito: ${cruzaZero ? "o intervalo cruza zero — não dá para afirmar diferença" : (ic.estimativa > 0 ? "supera a referência" : "fica abaixo da referência")}`);
  resultados.push({ rotulo: b.rotulo, delta: ic.estimativa, bca: ic.bca, cruzaZero, ganha, empata, perde });
}

if (bracos.length > 2) {
  P("\n" + "-".repeat(74));
  P("AVISO DE COMPARAÇÕES MÚLTIPLAS");
  P(`  Foram feitas ${bracos.length - 1} comparações contra a referência. Cada intervalo`);
  P("  isolado tem 95% de cobertura, mas o conjunto tem menos. Escolher o melhor");
  P("  braço depois de ver os resultados e reportar o número dele como se fosse");
  P("  uma medição única superestima o desempenho.");
  P("  Declare o braço principal ANTES de olhar, ou reporte todos os braços.");
}

if (saida) {
  fs.writeFileSync(saida, JSON.stringify({ metrica, referencia: ref.rotulo, exercicios: comuns.length, resultados }, null, 2));
  P(`\nsalvo em ${saida}`);
}
