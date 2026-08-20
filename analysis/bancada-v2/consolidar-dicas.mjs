#!/usr/bin/env node
/**
 * analysis/bancada-v2/consolidar-dicas.mjs — tabela única da comparação
 * DETERMINÍSTICA de dicas (2026-08-19), nos mesmos moldes de
 * consolidar-corpora.mjs: por corpus × braço, e agregado por braço com
 * bootstrap PERCENTÍLICO estratificado por corpus, cluster = exercício.
 * Entrada: os `dicas-<braço>.json` gerados por comparar-dicas.mjs.
 */
import fs from "node:fs";
import path from "node:path";
import { prng } from "../validacao-v2/lib.mjs";
import { CORPORA_JUIZ, BRACOS } from "./juiz-extras-materializado.mjs";

const CAMPOS = ["temDica", "niveis", "chars", "bottomOutValor", "algumNivelValor", "escadaCompleta"];
const media = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

function intervaloEstratificado(linhas, { seed = 42, B = 10000 } = {}) {
  const porCorpus = {};
  for (const l of linhas) ((porCorpus[l.corpus] ||= {})[l.ex] ||= []).push(l.v);
  const obs = media(linhas.map((l) => l.v));
  const rnd = prng(seed);
  const boot = [];
  const estratos = Object.entries(porCorpus).map(([, m]) => Object.keys(m));
  for (let b = 0; b < B; b++) {
    const acc = [];
    Object.values(porCorpus).forEach((m, si) => {
      const chaves = estratos[si];
      for (let i = 0; i < chaves.length; i++) {
        const e = chaves[Math.floor(rnd() * chaves.length)];
        for (const v of m[e]) acc.push(v);
      }
    });
    boot.push(media(acc));
  }
  boot.sort((a, b) => a - b);
  const q = (p) => boot[Math.min(boot.length - 1, Math.max(0, Math.floor((boot.length - 1) * p)))];
  return { estimativa: obs, percentil: [q(0.025), q(0.975)], n: linhas.length };
}

export function consolidarDicas(raiz = ".") {
  const tabela = [];
  const pool = {}; // braço → campo → lado → linhas
  for (const c of CORPORA_JUIZ) {
    for (const braco of BRACOS) {
      const f = path.join(raiz, c.pasta, `dicas-${braco}.json`);
      if (!fs.existsSync(f)) continue;
      const A = JSON.parse(fs.readFileSync(f, "utf8"));
      const linha = { corpus: c.chave, braco, n: A.n, exercicios: A.exercicios, paresPorGrafo: A.paresPorGrafo };
      for (const campo of CAMPOS) for (const lado of ["ref", "agente"]) {
        linha[`${campo}_${lado}`] = A.agregado[`${campo}_${lado}`];
      }
      tabela.push(linha);
      for (const r of A.porRegistro) {
        for (const campo of CAMPOS) for (const lado of ["ref", "agente"]) {
          const v = r[`${campo}_${lado}`];
          if (v === null || v === undefined) continue;
          (((pool[braco] ||= {})[campo] ||= {})[lado] ||= []).push({ corpus: c.chave, ex: r.ex, v });
        }
      }
    }
  }
  const agregado = {};
  for (const [braco, campos] of Object.entries(pool)) {
    agregado[braco] = {};
    for (const [campo, lados] of Object.entries(campos)) {
      agregado[braco][campo] = Object.fromEntries(
        Object.entries(lados).map(([lado, linhas]) => [lado, intervaloEstratificado(linhas)])
      );
    }
  }
  return { gerado: new Date().toISOString(), tabela, agregado };
}

const ehMain = process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (ehMain) {
  const R = consolidarDicas(".");
  const f = (x) => (x?.estimativa === null || x?.estimativa === undefined || Number.isNaN(x?.estimativa) ? "N/A" : x.estimativa.toFixed(3));
  console.log("\ncorpus | braço | pares/grafo | bottomOut esp | bottomOut ag | escadaCompleta esp | ag | níveis esp | ag");
  for (const l of R.tabela) {
    console.log([l.corpus, l.braco.slice(0, 14), l.paresPorGrafo.toFixed(2), f(l.bottomOutValor_ref), f(l.bottomOutValor_agente), f(l.escadaCompleta_ref), f(l.escadaCompleta_agente), f(l.niveis_ref), f(l.niveis_agente)].join(" | "));
  }
  console.log("\nAGREGADO (pool, bootstrap percentílico estratificado por corpus, cluster = exercício)");
  for (const [braco, campos] of Object.entries(R.agregado)) {
    console.log(`  ${braco}:`);
    for (const campo of CAMPOS) {
      const e = campos[campo]?.ref, a = campos[campo]?.agente;
      const ic = (x) => (x ? `${x.estimativa.toFixed(3)} [${x.percentil[0].toFixed(3)}; ${x.percentil[1].toFixed(3)}]` : "N/A");
      console.log(`    ${campo.padEnd(18)} especialista ${ic(e).padEnd(28)} agente ${ic(a)}`);
    }
  }
  // somente leitura por padrão (2026-08-20): este comando está no README e
  // não deve sujar a árvore de quem só quer conferir. Use --escrever.
  const escrever = process.argv.includes("--escrever");
  const out = "resultados/juizo-2026-08-19/dicas-consolidado.json";
  if (escrever) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(R, null, 1));
    console.log(`\n  salvo em ${out}`);
  } else {
    console.log(`\n  (somente leitura: ${out} não foi tocado. Para regravar, rode com --escrever.)`);
  }
}
