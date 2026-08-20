#!/usr/bin/env node
/**
 * analysis/bancada-v2/consolidar-simetrico.mjs — as DUAS leituras lado a lado
 * (2026-08-19): a régua CONGELADA (reprodutível byte a byte com tudo o que já
 * foi publicado) e a régua SIMÉTRICA (a correta, depois do reparo do token de
 * conclusão). Bootstrap percentílico estratificado por corpus, cluster =
 * exercício — o mesmo estimador do resto do experimento.
 *
 * Por construção (garantido por teste em __tests__/regua-simetrica.test.mjs)
 * cobertura observada, cobertura sem ordem, caminho íntegro observado, erros
 * e dicas no estado certo são IDÊNTICOS nas duas leituras. Precisão/F1 e o
 * controle papagaio pareado por capacidade comparável (logo, a cobertura
 * ajustada) podem se mover.
 */
import fs from "node:fs";
import path from "node:path";
import { carregarReferencia, media, prng } from "../validacao-v2/lib.mjs";
import { pontuarComBase } from "./linha-de-base.mjs";
import { grafoSimetrico } from "./regua-simetrica.mjs";
import { CORPORA_JUIZ, BRACOS } from "./juiz-extras-materializado.mjs";

const CAMPOS = ["coberturaEstados", "baseCobertura", "coberturaAjustada", "precisaoEstados", "f1Estados"];

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
      const ks = estratos[si];
      for (let i = 0; i < ks.length; i++) for (const v of m[ks[Math.floor(rnd() * ks.length)]]) acc.push(v);
    });
    boot.push(media(acc));
  }
  boot.sort((a, b) => a - b);
  const q = (p) => boot[Math.min(boot.length - 1, Math.max(0, Math.floor((boot.length - 1) * p)))];
  return { estimativa: obs, ic: [q(0.025), q(0.975)], n: linhas.length };
}

export function consolidarSimetrico(raiz = ".") {
  const tabela = [];
  const pool = { congelada: {}, simetrica: {} };
  const poolPorBraco = {};
  let neutralizados = 0, passosTotais = 0;
  for (const c of CORPORA_JUIZ) {
    process.env.STI_DATASET = c.dataset;
    const REF = carregarReferencia(raiz);
    const probs = path.join(raiz, "datasets", c.dataset, "problems");
    for (const braco of BRACOS) {
      const d = path.join(raiz, c.pasta, `materializado-v3-fixa-${braco}`, "runs");
      if (!fs.existsSync(d)) continue;
      const linhas = { congelada: [], simetrica: [] };
      for (const f of fs.readdirSync(d).filter((x) => x.endsWith(".json")).sort()) {
        const r = JSON.parse(fs.readFileSync(path.join(d, f), "utf8"));
        const ex = r.exercicio ?? r.id;
        if (!REF[ex] || !r.materializado?.grafo) continue;
        const envA = JSON.parse(fs.readFileSync(path.join(probs, ex, "envelope-a.json"), "utf8"));
        const envB = JSON.parse(fs.readFileSync(path.join(probs, ex, "envelope-b.json"), "utf8"));
        const { grafo: gs, reparos } = grafoSimetrico(r.materializado.grafo);
        neutralizados += reparos.passosNeutralizados;
        passosTotais += (r.materializado.grafo.passos || []).length;
        const leituras = {
          congelada: pontuarComBase(r, envA, envB, REF[ex]),
          simetrica: pontuarComBase({ ...r, materializado: { ...r.materializado, grafo: gs } }, envA, envB, REF[ex]),
        };
        for (const [k, v] of Object.entries(leituras)) {
          linhas[k].push(v);
          for (const campo of CAMPOS) {
            if (v[campo] === null || v[campo] === undefined || !Number.isFinite(v[campo])) continue;
            ((pool[k][campo] ||= [])).push({ corpus: c.chave, ex, v: v[campo] });
            ((((poolPorBraco[braco] ||= {})[k] ||= {})[campo] ||= [])).push({ corpus: c.chave, ex, v: v[campo] });
          }
        }
      }
      const est = (k, campo) => {
        const vs = linhas[k].map((l) => l[campo]).filter((x) => x !== null && Number.isFinite(x));
        return vs.length ? media(vs) : null;
      };
      tabela.push({
        corpus: c.chave, braco, n: linhas.congelada.length,
        cobertura: est("congelada", "coberturaEstados"),
        baseCoberturaCongelada: est("congelada", "baseCobertura"),
        baseCoberturaSimetrica: est("simetrica", "baseCobertura"),
        coberturaAjustadaCongelada: est("congelada", "coberturaAjustada"),
        coberturaAjustadaSimetrica: est("simetrica", "coberturaAjustada"),
        precisaoCongelada: est("congelada", "precisaoEstados"),
        precisaoSimetrica: est("simetrica", "precisaoEstados"),
        f1Congelado: est("congelada", "f1Estados"),
        f1Simetrico: est("simetrica", "f1Estados"),
      });
    }
  }
  const agregado = {};
  for (const [k, campos] of Object.entries(pool)) {
    agregado[k] = Object.fromEntries(Object.entries(campos).map(([campo, ls]) => [campo, intervaloEstratificado(ls)]));
  }
  const agregadoPorBraco = {};
  for (const [braco, reguas] of Object.entries(poolPorBraco)) {
    agregadoPorBraco[braco] = {};
    for (const [regua, campos] of Object.entries(reguas)) {
      agregadoPorBraco[braco][regua] = Object.fromEntries(
        Object.entries(campos).map(([campo, ls]) => [campo, intervaloEstratificado(ls)])
      );
    }
  }
  return {
    gerado: new Date().toISOString(),
    metodologia: {
      unidade: "registro (grafo gerado)",
      verdadeiroPositivo: "comprimento da LCS 1:1 entre estados de valor da referência e passos comparáveis do agente",
      precisao: "TP / ocorrências comparáveis do agente (multiplicidade preservada; zero quando o agente não produz ocorrência comparável)",
      cobertura: "TP / ocorrências avaliáveis da referência",
      f1: "média harmônica da precisão e cobertura do mesmo registro; zero quando ambas são zero",
      intervalo: "bootstrap percentílico estratificado por corpus, cluster de exercício, 10000 reamostragens, seed 42",
    },
    reparo: { passosNeutralizados: neutralizados, passosTotais, taxa: neutralizados / passosTotais },
    tabela, agregado, agregadoPorBraco,
  };
}

const ehMain = process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (ehMain) {
  const R = consolidarSimetrico(".");
  const f = (x) => (x === null || x === undefined ? " N/A " : x.toFixed(4));
  console.log(`\nREPARO: ${R.reparo.passosNeutralizados} de ${R.reparo.passosTotais} passos neutralizados (${(100 * R.reparo.taxa).toFixed(1)}%)\n`);
  console.log("corpus | braço          | cobertura | controle cong.→sim. | ajustada cong.→sim. | precisão cong.→sim. | F1 cong.→sim.");
  for (const l of R.tabela)
    console.log(`${l.corpus}   | ${l.braco.padEnd(14)} | ${f(l.cobertura)} | ${f(l.baseCoberturaCongelada)} → ${f(l.baseCoberturaSimetrica)} | ${f(l.coberturaAjustadaCongelada)} → ${f(l.coberturaAjustadaSimetrica)} | ${f(l.precisaoCongelada)} → ${f(l.precisaoSimetrica)} | ${f(l.f1Congelado)} → ${f(l.f1Simetrico)}`);
  console.log("\nAGREGADO (pool, bootstrap percentílico estratificado, cluster = exercício)");
  for (const campo of CAMPOS) {
    const a = R.agregado.congelada[campo], b = R.agregado.simetrica[campo];
    const ic = (x) => (x ? `${x.estimativa.toFixed(4)} [${x.ic[0].toFixed(4)}; ${x.ic[1].toFixed(4)}]` : "N/A");
    const igual = a && b && Math.abs(a.estimativa - b.estimativa) < 1e-12;
    console.log(`  ${campo.padEnd(20)} congelada ${ic(a).padEnd(30)} simétrica ${ic(b)}${igual ? "   (idênticas)" : ""}`);
  }
  console.log("\nPOR BRAÇO (régua simétrica)");
  for (const braco of BRACOS) {
    const a = R.agregadoPorBraco[braco]?.simetrica;
    if (!a) continue;
    const ic = (x) => (x ? `${x.estimativa.toFixed(4)} [${x.ic[0].toFixed(4)}; ${x.ic[1].toFixed(4)}]` : "N/A");
    console.log(`  ${braco.padEnd(20)} precisão ${ic(a.precisaoEstados)} | F1 ${ic(a.f1Estados)}`);
  }
  // somente leitura por padrão (2026-08-20): este comando está no README e
  // não deve sujar a árvore de quem só quer conferir. Use --escrever.
  const escrever = process.argv.includes("--escrever");
  const out = "resultados/juizo-2026-08-19/consolidado-simetrico.json";
  if (escrever) {
    fs.writeFileSync(out, JSON.stringify(R, null, 1));
    console.log(`\n  salvo em ${out}`);
  } else {
    console.log(`\n  (somente leitura: ${out} não foi tocado. Para regravar, rode com --escrever.)`);
  }
}
