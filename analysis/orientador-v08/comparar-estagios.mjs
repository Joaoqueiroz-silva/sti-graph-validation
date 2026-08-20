#!/usr/bin/env node
/**
 * Contraste pareado entre o grafo genérico do GraphForge e o grafo final
 * materializado pelos agentes 6/7. Cada par vem do MESMO registro; nenhuma
 * réplica ou estágio é tratado como unidade independente.
 */
import fs from "node:fs";
import path from "node:path";
import { carregarReferencia, intervalo, media } from "../validacao-v2/lib.mjs";
import { pontuarCaminho } from "../bancada-v2/comparar-caminho.mjs";
import { pontuarComBase } from "../bancada-v2/linha-de-base.mjs";
import { grafoSimetrico } from "../bancada-v2/regua-simetrica.mjs";
import { BRACOS, CORPORA_JUIZ } from "../bancada-v2/juiz-extras-materializado.mjs";

export const METRICAS_ESTAGIO = Object.freeze([
  "coberturaEstados",
  "coberturaSemOrdem",
  "caminhoIntegro",
  "errosNoEstadoCerto",
  "dicasNoEstadoCerto",
  "precisaoEstados",
  "f1Estados",
  "nEstadosAgente",
  "nEstadosComparaveisAgente",
  "nErrosAgente",
  "nDicasAgente",
]);

const sub = (a, b) =>
  a === null || b === null || a === undefined || b === undefined ||
  !Number.isFinite(a) || !Number.isFinite(b)
    ? null
    : a - b;

/** Pontua um estágio sob a mesma régua simétrica e o mesmo TP LCS 1:1. */
export function pontuarEstagio({ run, grafo, envelopeA, envelopeB, referencia }) {
  const simetrico = grafoSimetrico(grafo || {}).grafo;
  const baseRun = {
    id: run.id,
    exercicio: run.exercicio,
    replica: run.replica,
    grafo: simetrico,
  };
  const caminho = pontuarCaminho(baseRun, envelopeB, referencia);
  const base = pontuarComBase(baseRun, envelopeA, envelopeB, referencia);
  return {
    ...caminho,
    precisaoEstados: base.precisaoEstados,
    f1Estados: base.f1Estados,
    baseCobertura: base.baseCobertura,
    coberturaAjustada: base.coberturaAjustada,
    nErrosAgente: (simetrico.erros || []).length,
    nDicasAgente: (simetrico.dicas || []).length,
  };
}

/** Produz um contraste final − bruto para um registro. */
export function compararPar({ run, envelopeA, envelopeB, referencia, corpus = null, braco = null }) {
  if (!run?.grafo || !run?.materializado?.grafo) {
    throw new Error("registro deve conter grafo bruto e materializado.grafo");
  }
  const bruto = pontuarEstagio({ run, grafo: run.grafo, envelopeA, envelopeB, referencia });
  const final = pontuarEstagio({ run, grafo: run.materializado.grafo, envelopeA, envelopeB, referencia });
  const delta = Object.fromEntries(METRICAS_ESTAGIO.map((campo) => [campo, sub(final[campo], bruto[campo])]));
  return {
    corpus,
    braco,
    ex: run.exercicio ?? run.id,
    replica: run.replica ?? null,
    bruto,
    final,
    delta,
  };
}

function estimar(linhas, seletor) {
  return intervalo(
    linhas.map((linha) => ({ ex: linha.ex, valor: seletor(linha) })),
    "valor",
  );
}

/** Agregação por exercício (o bootstrap de intervalo() reamostra clusters). */
export function resumirPares(pares) {
  const porMetrica = {};
  for (const campo of METRICAS_ESTAGIO) {
    porMetrica[campo] = {
      bruto: estimar(pares, (p) => p.bruto[campo]),
      final: estimar(pares, (p) => p.final[campo]),
      deltaFinalMenosBruto: estimar(pares, (p) => p.delta[campo]),
    };
  }
  const mudancas = {
    passosIguais: pares.filter((p) => p.bruto.nEstadosAgente === p.final.nEstadosAgente).length,
    passosAumentaram: pares.filter((p) => p.final.nEstadosAgente > p.bruto.nEstadosAgente).length,
    passosDiminuiram: pares.filter((p) => p.final.nEstadosAgente < p.bruto.nEstadosAgente).length,
    errosMudaram: pares.filter((p) => p.bruto.nErrosAgente !== p.final.nErrosAgente).length,
    dicasMudaram: pares.filter((p) => p.bruto.nDicasAgente !== p.final.nDicasAgente).length,
  };
  return {
    nPares: pares.length,
    nExercicios: new Set(pares.map((p) => `${p.corpus ?? ""}/${p.ex}`)).size,
    porMetrica,
    mudancas,
  };
}

/** Recalcula os 630 pares sem escrever em disco. */
export function compararEstagios({ raiz = "." } = {}) {
  const pares = [];
  const celulas = [];
  for (const corpus of CORPORA_JUIZ) {
    process.env.STI_DATASET = corpus.dataset;
    const referencia = carregarReferencia(raiz);
    const problemas = path.join(raiz, "datasets", corpus.dataset, "problems");
    for (const braco of BRACOS) {
      const runsDir = path.join(raiz, corpus.pasta, `materializado-v3-fixa-${braco}`, "runs");
      if (!fs.existsSync(runsDir)) continue;
      const destaCelula = [];
      for (const nome of fs.readdirSync(runsDir).filter((f) => f.endsWith(".json")).sort()) {
        const run = JSON.parse(fs.readFileSync(path.join(runsDir, nome), "utf8"));
        const ex = run.exercicio ?? run.id;
        if (!referencia[ex] || !run.grafo || !run.materializado?.grafo) continue;
        const envelopeA = JSON.parse(fs.readFileSync(path.join(problemas, ex, "envelope-a.json"), "utf8"));
        const envelopeB = JSON.parse(fs.readFileSync(path.join(problemas, ex, "envelope-b.json"), "utf8"));
        const par = compararPar({
          run,
          envelopeA,
          envelopeB,
          referencia: referencia[ex],
          corpus: corpus.chave,
          braco,
        });
        pares.push(par);
        destaCelula.push(par);
      }
      celulas.push({ corpus: corpus.chave, braco, ...resumirPares(destaCelula) });
    }
  }
  return {
    metodologia: {
      estimando: "diferença pareada final materializado − bruto GraphForge no mesmo registro",
      unidadeInferencial: "exercício; réplicas aninhadas e estágios pareados",
      regua: "simétrica, LCS 1:1; token de conclusão neutralizado dos dois estágios",
      intervalo: "BCa por cluster de exercício, 10000 reamostragens, seed 42",
      interpretacao: "associação com o estágio conjunto agentes 6/7; não identifica o efeito causal de cada agente interno",
    },
    nPares: pares.length,
    resumoGeral: resumirPares(pares),
    celulas,
    pares,
  };
}

const ehMain = process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (ehMain) {
  const argv = process.argv.slice(2);
  const opt = (flag, padrao = null) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : padrao;
  };
  const resultado = compararEstagios({ raiz: opt("--raiz", ".") });
  const f = (x) => Number.isFinite(x) ? x.toFixed(4) : "N/A";
  console.log(`CONTRASTE DE ESTÁGIO — ${resultado.nPares} pares`);
  for (const celula of resultado.celulas) {
    const r = celula.porMetrica;
    console.log(
      `${celula.corpus}/${celula.braco}: n=${celula.nPares}; ` +
      `Δ recall=${f(r.coberturaEstados.deltaFinalMenosBruto.estimativa)}; ` +
      `Δ precisão=${f(r.precisaoEstados.deltaFinalMenosBruto.estimativa)}; ` +
      `Δ F1=${f(r.f1Estados.deltaFinalMenosBruto.estimativa)}`,
    );
  }
  const saida = opt("--json", null);
  if (saida) {
    fs.writeFileSync(saida, JSON.stringify({ gerado: new Date().toISOString(), ...resultado }, null, 1));
    console.log(`salvo em ${saida}`);
  } else {
    console.log("(somente leitura; use --json <arquivo> para gravar)");
  }
}
