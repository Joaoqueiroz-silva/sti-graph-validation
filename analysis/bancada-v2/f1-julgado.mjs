#!/usr/bin/env node
/**
 * analysis/bancada-v2/f1-julgado.mjs — PRECISÃO e F1 de estados JULGADOS
 * (2026-08-19). Converte o veredito do juiz de estados (juiz-estados.mjs) em
 * precisão e F1 por REGISTRO, para que a estimativa julgada passe pelo mesmo
 * bootstrap (cluster = exercício, estrato = corpus) do resto do experimento.
 *
 * ESTRUTURAL (o que o artigo tinha): estado do agente que não casa com nenhum
 * estado de valor do especialista é falso positivo. É um PISO — pune o passo de
 * decomposição legítimo que o especialista não modelou.
 * JULGADA: o estado extra deixa de ser falso positivo se o juiz cego o
 * considerou alvo legítimo de passo para aquele problema.
 *
 * A cobertura (recall) NÃO muda: o juiz não cria estado do especialista.
 * Muda só o denominador de erro da precisão — e, por consequência, o F1.
 */
import fs from "node:fs";
import path from "node:path";
import { canonizarValor } from "./comparar-caminho.mjs";
import { carregarReferencia, media, prng } from "../validacao-v2/lib.mjs";
import { pontuarComBase } from "./linha-de-base.mjs";
import { problemsDirRelativo } from "../../dataset-config.js";
import { CORPORA_JUIZ, BRACOS } from "./juiz-extras-materializado.mjs";

/** Mapa (corpus|ex|valor canônico) → true, dos extras que o juiz validou. */
export function veredictoDeEstados(juizJson) {
  const m = new Map();
  for (const j of juizJson.julgamentos || []) {
    if (j.source !== "robo-extra") continue;
    const v = canonizarValor(j.candidate);
    if (!v) continue;
    const k = `${j.corpus}|${j.ex}|${v}`;
    // um mesmo valor pode ter sido julgado nos dois braços: vale o veredito
    // POSITIVO se algum deles validou (o juiz é o mesmo e a pergunta idêntica;
    // divergência entre chamadas é ruído do modelo, não informação de braço).
    m.set(k, (m.get(k) || false) || j.valid === true);
  }
  return m;
}

/** Precisão de estados com o veredito do juiz aplicado aos extras. */
export function precisaoJulgadaEstados(passosAgente, refEx, ehValido) {
  const alvo = new Set((refEx?.caminho || []).filter((c) => !c.sistema && !c.mecanico && c.valor).map((c) => c.valor));
  const doAgente = [...new Set((passosAgente || []).map((p) => canonizarValor(p.valor)).filter(Boolean))];
  if (!doAgente.length || !alvo.size) return null;
  const bons = doAgente.filter((v) => alvo.has(v) || ehValido(v)).length;
  return bons / doAgente.length;
}

const harmonica = (r, p) => (p != null && r + p > 0 ? (2 * r * p) / (r + p) : null);

function intervaloEstratificado(linhas, { seed = 42, B = 10000 } = {}) {
  const porCorpus = {};
  for (const l of linhas) ((porCorpus[l.corpus] ||= {})[l.ex] ||= []).push(l.v);
  const obs = media(linhas.map((l) => l.v));
  const rnd = prng(seed);
  const boot = [];
  const estratos = Object.values(porCorpus).map((m) => Object.keys(m));
  for (let b = 0; b < B; b++) {
    const acc = [];
    Object.values(porCorpus).forEach((m, si) => {
      const chaves = estratos[si];
      for (let i = 0; i < chaves.length; i++) for (const v of m[chaves[Math.floor(rnd() * chaves.length)]]) acc.push(v);
    });
    boot.push(media(acc));
  }
  boot.sort((a, b) => a - b);
  const q = (p) => boot[Math.min(boot.length - 1, Math.max(0, Math.floor((boot.length - 1) * p)))];
  return { estimativa: obs, percentil: [q(0.025), q(0.975)], n: linhas.length };
}

export function consolidarF1Julgado(juizJson, { raiz = "." } = {}) {
  const mapa = veredictoDeEstados(juizJson);
  const tabela = [];
  const pool = {};
  for (const c of CORPORA_JUIZ) {
    process.env.STI_DATASET = c.dataset;
    const REF = carregarReferencia(raiz);
    const problemas = problemsDirRelativo();
    for (const braco of BRACOS) {
      const runsDir = path.join(raiz, c.pasta, `materializado-v3-fixa-${braco}`, "runs");
      if (!fs.existsSync(runsDir)) continue;
      const linhas = [];
      for (const f of fs.readdirSync(runsDir).filter((x) => x.endsWith(".json")).sort()) {
        const r = JSON.parse(fs.readFileSync(path.join(runsDir, f), "utf8"));
        const ex = r.exercicio ?? r.id;
        if (!REF[ex] || !r.materializado?.grafo) continue;
        const envA = JSON.parse(fs.readFileSync(path.join(raiz, problemas, ex, "envelope-a.json"), "utf8"));
        const envB = JSON.parse(fs.readFileSync(path.join(raiz, problemas, ex, "envelope-b.json"), "utf8"));
        const base = pontuarComBase(r, envA, envB, REF[ex]);
        const ehValido = (v) => mapa.get(`${c.chave}|${ex}|${v}`) === true;
        const precJ = precisaoJulgadaEstados(r.materializado.grafo.passos, REF[ex], ehValido);
        linhas.push({
          ex, replica: r.replica ?? null,
          cobertura: base.coberturaEstados,
          precisaoEstrutural: base.precisaoEstados,
          precisaoJulgada: precJ,
          f1Estrutural: base.f1Estados,
          f1Julgado: harmonica(base.coberturaEstados, precJ),
        });
      }
      const est = (campo) => {
        const vs = linhas.map((l) => l[campo]).filter((x) => x !== null && x !== undefined);
        return vs.length ? media(vs) : null;
      };
      tabela.push({
        corpus: c.chave, braco, n: linhas.length,
        cobertura: est("cobertura"),
        precisaoEstrutural: est("precisaoEstrutural"), precisaoJulgada: est("precisaoJulgada"),
        f1Estrutural: est("f1Estrutural"), f1Julgado: est("f1Julgado"),
      });
      for (const l of linhas) for (const campo of ["cobertura", "precisaoEstrutural", "precisaoJulgada", "f1Estrutural", "f1Julgado"]) {
        if (l[campo] === null || l[campo] === undefined) continue;
        ((pool[braco] ||= {})[campo] ||= []).push({ corpus: c.chave, ex: l.ex, v: l[campo] });
      }
    }
  }
  const agregado = {};
  for (const [braco, campos] of Object.entries(pool)) {
    agregado[braco] = Object.fromEntries(Object.entries(campos).map(([k, v]) => [k, intervaloEstratificado(v)]));
  }
  return { gerado: new Date().toISOString(), juiz: juizJson.juiz, tabela, agregado };
}

const ehMain = process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (ehMain) {
  const argv = process.argv.slice(2);
  const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
  const fj = opt("--juiz", "resultados/juizo-2026-08-19/juiz-estados.json");
  const J = JSON.parse(fs.readFileSync(fj, "utf8"));
  if (!J.geral?.calibrado) {
    console.error("JUIZ DESCALIBRADO — pela regra pré-declarada não há veredito; nada a consolidar.");
    process.exit(3);
  }
  const R = consolidarF1Julgado(J);
  const f = (x) => (x === null || x === undefined ? " N/A " : x.toFixed(3));
  console.log("\ncorpus | braço | cobertura | precisão estrut. → julgada | F1 estrut. → julgado");
  for (const l of R.tabela) console.log([l.corpus, l.braco.slice(0, 14), f(l.cobertura), `${f(l.precisaoEstrutural)} → ${f(l.precisaoJulgada)}`, `${f(l.f1Estrutural)} → ${f(l.f1Julgado)}`].join(" | "));
  console.log("\nAGREGADO (pool, bootstrap percentílico estratificado por corpus, cluster = exercício)");
  for (const [braco, campos] of Object.entries(R.agregado)) {
    console.log(`  ${braco}:`);
    for (const [k, v] of Object.entries(campos)) console.log(`    ${k.padEnd(20)} ${v.estimativa.toFixed(3)} [${v.percentil[0].toFixed(3)}; ${v.percentil[1].toFixed(3)}]`);
  }
  const out = opt("--json", "resultados/juizo-2026-08-19/f1-julgado.json");
  fs.writeFileSync(out, JSON.stringify(R, null, 1));
  console.log(`\n  salvo em ${out}`);
}
