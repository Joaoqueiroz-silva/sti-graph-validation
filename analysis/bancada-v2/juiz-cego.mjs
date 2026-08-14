/**
 * analysis/bancada-v2/juiz-cego.mjs — PRECISÃO JULGADA da bancada v2
 * (2026-08-14): os erros "a mais" dos agentes são riqueza ou ruído?
 *
 * Reutiliza BYTE A BYTE o protocolo de julgamento das campanhas
 * (judge-misconceptions.js): juiz cross-family (agent9_review = GLM, temp
 * 0,1), CEGO à origem, com calibração positiva (erros do próprio
 * especialista misturados) e controles negativos (resposta correta
 * disfarçada, equivalente e absurdo). Nenhuma geração nova: os candidatos
 * vêm dos registros já coletados (contrato v2).
 *
 * REGRAS PRÉ-DECLARADAS (antes de qualquer julgamento):
 *  - GATE DE CALIBRAÇÃO: o juiz precisa aprovar >= 80% dos itens do
 *    especialista E rejeitar >= 80% dos distratores; senão os números NÃO
 *    são usados (o resultado é "juiz descalibrado", nunca um veredito);
 *  - PRECISÃO JULGADA (por exercício, nível de valor):
 *    (valores casados com o especialista + extras julgados válidos) / valores candidatos;
 *  - AMPLITUDE = RIQUEZA se validadeExtras >= validadeEspecialista - 0,10.
 *
 * Uso:
 *   node -r dotenv/config analysis/bancada-v2/juiz-cego.mjs \
 *     --runs <dir> --rotulo <braço> [--limit N] [--json out] [--yes]
 */

import fs from "node:fs";
import path from "node:path";
import { carregarReferencia, media } from "../validacao-v2/lib.mjs";
import { candidatosDoRegistro } from "./comparar-justo.mjs";
import {
  buildJudgeItems,
  judgeItems,
  summarizeBySource,
  makeDistractors,
} from "../../judge-misconceptions.js";
import { wilsonCI } from "../../stats.js";

export const GATE_CALIBRACAO = 0.8;
export const MARGEM_RIQUEZA = 0.1;

const argv = process.argv.slice(2);
const opt = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : d;
};
const dir = opt("--runs", null);
const rotulo = opt("--rotulo", "braço");
const limit = parseInt(opt("--limit", "24"), 10);
const saida = opt("--json", null);
const yes = argv.includes("--yes");
if (!dir) {
  console.error("uso: node -r dotenv/config analysis/bancada-v2/juiz-cego.mjs --runs <dir> --rotulo x [--limit N] [--json out] --yes");
  process.exit(2);
}
if (!process.env.OPENROUTER_API_KEY) {
  console.error("OPENROUTER_API_KEY ausente (o julgamento é pago; copie o .env).");
  process.exit(1);
}

const REF = carregarReferencia(".");
const DATASET = "datasets/frac-numberline-6.17/problems";

// candidatos por exercício: união das réplicas, dedup por valor canônico
const porEx = new Map();
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
  const run = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  const ex = run.exercicio ?? run.id;
  if (!REF[ex] || !run.grafo) continue;
  const { candidatos } = candidatosDoRegistro(run, { conjunto: "produto" });
  const m = porEx.get(ex) ?? new Map();
  for (const c of candidatos) if (!m.has(c.valor)) m.set(c.valor, c);
  porEx.set(ex, m);
}
const exercicios = [...porEx.keys()].sort().slice(0, limit);

// plano e custo ANTES de julgar
let totalItens = 0;
const plano = [];
for (const ex of exercicios) {
  const ref = REF[ex];
  const cands = [...porEx.get(ex).values()];
  const extras = cands.filter((c) => !ref.values.has(c.valor));
  const itens = buildJudgeItems({
    robotExtras: extras.map((c) => c.bruto),
    expertConceptual: ref.items.map((i) => i.bruto),
    distractors: makeDistractors(ref.resposta),
  });
  totalItens += itens.length;
  plano.push({ ex, itens, cands, extras });
}
const estUsd = (totalItens * (700 * 0.6 + 120 * 2.2)) / 1e6;
console.log(
  `JUIZ CEGO — ${rotulo}: ${exercicios.length} exercício(s), ${totalItens} itens a julgar ` +
    `(extras + calibração + controles) | custo estimado ~US$ ${estUsd.toFixed(2)} (GLM-4.5)`
);
if (!yes) {
  console.error("Execução PAGA: confirme com --yes.");
  process.exit(1);
}

const linhas = [];
let judgedAll = [];
for (const { ex, itens, cands, extras } of plano) {
  const ref = REF[ex];
  const enunciado = JSON.parse(
    fs.readFileSync(path.join(DATASET, ex, "envelope-a.json"), "utf8")
  ).problem;
  const judged = await judgeItems(enunciado, ref.resposta, itens, {});
  judgedAll = judgedAll.concat(judged.map((j) => ({ ...j, ex })));
  const validosPorCanon = new Set(
    judged.filter((j) => j.source === "robo-extra" && j.valid).map((j) => j.candidate)
  );
  const casados = cands.filter((c) => ref.values.has(c.valor)).length;
  const extrasValidos = extras.filter((c) => validosPorCanon.has(c.bruto)).length;
  linhas.push({
    ex,
    precisaoJulgada: cands.length ? (casados + extrasValidos) / cands.length : 0,
    precisaoBruta: cands.length ? casados / cands.length : 0,
    extras: extras.length,
    extrasValidos,
  });
  console.log(
    `  ${ex}: ${extras.length} extras, ${extrasValidos} válidos | precisão ${linhas.at(-1).precisaoBruta.toFixed(2)} → julgada ${linhas.at(-1).precisaoJulgada.toFixed(2)}`
  );
}

const grupos = summarizeBySource(judgedAll);
const taxa = (src) => {
  const g = grupos[src];
  if (!g) return { n: 0, rate: null, ci: [null, null] };
  const ci = wilsonCI(g.valid, g.n);
  return { n: g.n, rate: g.validRate, ci: [ci.lower, ci.upper] };
};
const tExp = taxa("especialista");
const tExtra = taxa("robo-extra");
const distratores = Object.entries(grupos).filter(([s]) => s.startsWith("distrator"));
const nDist = distratores.reduce((s, [, g]) => s + g.n, 0);
const rejeitados = distratores.reduce((s, [, g]) => s + (g.n - g.valid), 0);
const taxaRejeicao = nDist ? rejeitados / nDist : null;

const calibrado = (tExp.rate ?? 0) >= GATE_CALIBRACAO && (taxaRejeicao ?? 0) >= GATE_CALIBRACAO;
const riqueza = calibrado && tExtra.rate !== null && tExtra.rate >= (tExp.rate ?? 1) - MARGEM_RIQUEZA;

console.log("─".repeat(74));
console.log(`  validade dos itens do ESPECIALISTA (calibração): ${tExp.rate} (n=${tExp.n})`);
console.log(`  rejeição dos DISTRATORES (controle negativo):    ${taxaRejeicao?.toFixed(3)} (n=${nDist})`);
console.log(`  validade dos EXTRAS dos agentes:                 ${tExtra.rate} (n=${tExtra.n})`);
console.log(`  GATE de calibração (>= ${GATE_CALIBRACAO} ambos): ${calibrado ? "APROVADO" : "REPROVADO — números não utilizáveis"}`);
if (calibrado) {
  console.log(
    `  precisão bruta ${media(linhas.map((l) => l.precisaoBruta)).toFixed(4)} → JULGADA ${media(linhas.map((l) => l.precisaoJulgada)).toFixed(4)}`
  );
  console.log(
    `  amplitude é ${riqueza ? "RIQUEZA" : "não demonstrada como riqueza"} (regra: validadeExtras >= validadeEspecialista - ${MARGEM_RIQUEZA})`
  );
}
if (saida) {
  fs.writeFileSync(
    saida,
    JSON.stringify(
      {
        gerado: new Date().toISOString(),
        rotulo,
        regras: { GATE_CALIBRACAO, MARGEM_RIQUEZA },
        calibracao: { especialista: tExp, rejeicaoDistratores: { n: nDist, rate: taxaRejeicao } },
        extras: tExtra,
        calibrado,
        riqueza,
        porExercicio: linhas,
        porOrigem: grupos,
        // detalhe item a item (ex + candidato + veredito) — necessário para a
        // concordância entre juízes (kappa) no desenho de painel duplo
        julgamentos: judgedAll.map(({ ex, candidate, source, valid, category }) => ({
          ex,
          candidate,
          source,
          valid,
          category,
        })),
      },
      null,
      1
    )
  );
  console.log(`  salvo em ${saida}`);
}
