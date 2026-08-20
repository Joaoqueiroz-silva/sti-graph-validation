#!/usr/bin/env node
/**
 * Estabilidade das replicas do experimento consolidado (orientador, v0.8).
 *
 * Principios:
 * - a unidade inferencial e o exercicio, identificado por corpus + exercicio;
 * - replicas sao medidas aninhadas e nunca inflam o tamanho amostral;
 * - a decomposicao de variancia usa ANOVA de efeitos aleatorios de uma via,
 *   com correcao n0 para grupos eventualmente desbalanceados;
 * - a CLI e somente leitura e escreve o relatorio exclusivamente em stdout.
 *
 * O nucleo exportado abaixo e puro. A leitura dos dez arquivos que contem os
 * 630 registros vigentes fica isolada em carregarObservacoes630().
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { carregarReferencia } from "../validacao-v2/lib.mjs";
import { pontuarComBase } from "../bancada-v2/linha-de-base.mjs";
import { grafoSimetrico } from "../bancada-v2/regua-simetrica.mjs";

export const METRICAS_PADRAO = [
  "coberturaEstados",
  "precisaoEstados",
  "f1Estados",
  "coberturaSemOrdem",
  "caminhoIntegro",
  "igualdadeEstrita",
  "errosNoEstadoCerto",
  "dicasNoEstadoCerto",
];

/** Manifesto fechado dos dez arquivos v3 usados no agregado de 630 grafos. */
export const DATASET_POR_CORPUS = Object.freeze({
  "6.17": "frac-numberline-6.17",
  "6.18": "equiv-fractions-6.18",
  "6.19": "frac-estimates-6.19",
  "6.20": "fraction-ordering-6.20",
  "8.12": "factors-scaling-8.12",
});

export const ARQUIVOS_630 = [
  ["6.17", "flash-lite", "resultados/rodada4-interface-fixa-2026-08-15/materializado-v3-fixa-custo-beneficio.analise.json"],
  ["6.17", "qwen", "resultados/rodada4-interface-fixa-2026-08-15/materializado-v3-fixa-estudantes-qwen.analise.json"],
  ["6.19", "flash-lite", "resultados/bloco1-mathtutor-2026-08-16/6.19/materializado-v3-fixa-custo-beneficio.analise.json"],
  ["6.19", "qwen", "resultados/bloco1-mathtutor-2026-08-16/6.19/materializado-v3-fixa-estudantes-qwen.analise.json"],
  ["6.18", "flash-lite", "resultados/bloco1-mathtutor-2026-08-16/6.18/materializado-v3-fixa-custo-beneficio.analise.json"],
  ["6.18", "qwen", "resultados/bloco1-mathtutor-2026-08-16/6.18/materializado-v3-fixa-estudantes-qwen.analise.json"],
  ["6.20", "flash-lite", "resultados/bloco1-mathtutor-2026-08-16/6.20/materializado-v3-fixa-custo-beneficio.analise.json"],
  ["6.20", "qwen", "resultados/bloco1-mathtutor-2026-08-16/6.20/materializado-v3-fixa-estudantes-qwen.analise.json"],
  ["8.12", "flash-lite", "resultados/bloco1-mathtutor-2026-08-16/8.12/materializado-v3-fixa-custo-beneficio.analise.json"],
  ["8.12", "qwen", "resultados/bloco1-mathtutor-2026-08-16/8.12/materializado-v3-fixa-estudantes-qwen.analise.json"],
].map(([corpus, braco, arquivo]) => ({
  corpus,
  braco,
  arquivo,
  dataset: DATASET_POR_CORPUS[corpus],
  runsDir: arquivo.replace(/\.analise\.json$/, "/runs"),
}));

const media = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

const varianciaAmostral = (xs) => {
  if (xs.length < 2) return null;
  const m = media(xs);
  return xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
};

export const dpAmostral = (xs) => {
  const v = varianciaAmostral(xs);
  return v === null ? null : Math.sqrt(Math.max(0, v));
};

const quantil = (xs, p) => {
  if (!xs.length) return null;
  const ys = [...xs].sort((a, b) => a - b);
  const h = (ys.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return lo === hi ? ys[lo] : ys[lo] + (h - lo) * (ys[hi] - ys[lo]);
};

const chaveUnidade = (o) => `${o.corpus}\u0000${o.exercicio}`;

const agrupar = (xs, chave) => {
  const out = new Map();
  for (const x of xs) {
    const k = chave(x);
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(x);
  }
  return out;
};

function validarObservacoes(observacoes) {
  if (!Array.isArray(observacoes) || !observacoes.length) {
    throw new Error("observacoes deve ser um array nao vazio");
  }
  const vistos = new Set();
  for (const [i, o] of observacoes.entries()) {
    if (!o || typeof o !== "object") throw new Error(`observacao ${i} invalida`);
    for (const k of ["corpus", "braco", "exercicio", "replica"])
      if (o[k] === null || o[k] === undefined || o[k] === "") throw new Error(`observacao ${i} sem ${k}`);
    if (!Number.isFinite(o.valor)) throw new Error(`observacao ${i} sem valor numerico finito`);
    const id = `${chaveUnidade(o)}\u0000${o.braco}\u0000${o.replica}`;
    if (vistos.has(id)) throw new Error(`observacao duplicada: ${id.replaceAll("\u0000", " / ")}`);
    vistos.add(id);
  }
}

/** DP amostral entre replicas, calculado separadamente por exercicio e braco. */
export function dpIntraproblema(observacoes) {
  validarObservacoes(observacoes);
  const grupos = agrupar(observacoes, (o) => `${chaveUnidade(o)}\u0000${o.braco}`);
  const porProblema = [...grupos.values()]
    .map((g) => ({
      corpus: g[0].corpus,
      exercicio: g[0].exercicio,
      braco: g[0].braco,
      nReplicas: g.length,
      media: media(g.map((o) => o.valor)),
      dp: dpAmostral(g.map((o) => o.valor)),
    }))
    .sort((a, b) => a.corpus.localeCompare(b.corpus) || a.exercicio.localeCompare(b.exercicio) || a.braco.localeCompare(b.braco));

  const porBraco = {};
  for (const [braco, linhas] of agrupar(porProblema, (x) => x.braco)) {
    const dps = linhas.map((x) => x.dp).filter(Number.isFinite);
    porBraco[braco] = {
      exercicios: linhas.length,
      exerciciosComDp: dps.length,
      mediaDp: media(dps),
      medianaDp: quantil(dps, 0.5),
      q25Dp: quantil(dps, 0.25),
      q75Dp: quantil(dps, 0.75),
      raizMediaQuadraticaDp: dps.length ? Math.sqrt(media(dps.map((x) => x ** 2))) : null,
    };
  }
  return { porProblema, porBraco };
}

/**
 * Componentes de variancia por ANOVA de efeitos aleatorios de uma via.
 * Para grupos desbalanceados usa n0 = [N - sum(n_i^2)/N] / (J - 1), o
 * coeficiente de Searle para o estimador de momentos de sigma_entre^2.
 */
export function decomporVarianciaICC(observacoes) {
  validarObservacoes(observacoes);
  const resultado = {};
  for (const [braco, linhasBraco] of agrupar(observacoes, (o) => o.braco)) {
    const grupos = [...agrupar(linhasBraco, chaveUnidade).values()];
    const J = grupos.length;
    const N = linhasBraco.length;
    if (J < 2 || N <= J) {
      resultado[braco] = {
        exercicios: J,
        observacoes: N,
        estimavel: false,
        motivo: "sao necessarios >=2 exercicios e ao menos um grau de liberdade intraproblema",
      };
      continue;
    }
    const medias = grupos.map((g) => media(g.map((o) => o.valor)));
    const ns = grupos.map((g) => g.length);
    const grande = linhasBraco.reduce((s, o) => s + o.valor, 0) / N;
    const ssEntre = grupos.reduce((s, g, i) => s + g.length * (medias[i] - grande) ** 2, 0);
    const ssDentro = grupos.reduce(
      (s, g, i) => s + g.reduce((a, o) => a + (o.valor - medias[i]) ** 2, 0),
      0,
    );
    const glEntre = J - 1;
    const glDentro = N - J;
    const qmEntre = ssEntre / glEntre;
    const qmDentro = ssDentro / glDentro;
    const n0 = (N - ns.reduce((s, n) => s + n ** 2, 0) / N) / glEntre;
    const varianciaDentro = qmDentro;
    const varianciaEntreBruta = (qmEntre - qmDentro) / n0;
    // Variancia negativa e admissivel no estimador nao restrito, mas nao e
    // componente fisicamente interpretavel. Preservamos a bruta e usamos a
    // estimativa restrita a zero para ICC e projecoes.
    const varianciaEntre = Math.max(0, varianciaEntreBruta);
    const total = varianciaEntre + varianciaDentro;
    resultado[braco] = {
      exercicios: J,
      observacoes: N,
      replicasMin: Math.min(...ns),
      replicasMax: Math.max(...ns),
      estimavel: true,
      metodo: "ANOVA de efeitos aleatorios de uma via; estimador de momentos com n0 de Searle",
      mediaGeral: grande,
      glEntre,
      glDentro,
      qmEntre,
      qmDentro,
      n0,
      varianciaEntreBruta,
      varianciaEntre,
      varianciaDentro,
      dpEntre: Math.sqrt(varianciaEntre),
      dpDentro: Math.sqrt(varianciaDentro),
      icc1: total > 0 ? varianciaEntre / total : null,
    };
  }
  return resultado;
}

function combinacoes(xs, k, inicio = 0, atual = [], out = []) {
  if (atual.length === k) {
    out.push([...atual]);
    return out;
  }
  for (let i = inicio; i <= xs.length - (k - atual.length); i++) {
    atual.push(xs[i]);
    combinacoes(xs, k, i + 1, atual, out);
    atual.pop();
  }
  return out;
}

function mapasMedias(observacoes, replicas) {
  const alvo = new Set(replicas.map(String));
  const porBraco = new Map();
  for (const [braco, linhas] of agrupar(observacoes, (o) => o.braco)) {
    const mapa = new Map();
    for (const [unidade, g] of agrupar(linhas.filter((o) => alvo.has(String(o.replica))), chaveUnidade)) {
      const reps = new Set(g.map((o) => String(o.replica)));
      if (reps.size === alvo.size && [...alvo].every((r) => reps.has(r))) mapa.set(unidade, media(g.map((o) => o.valor)));
    }
    porBraco.set(braco, mapa);
  }
  return porBraco;
}

function intersecaoUnidades(mapas) {
  const ms = [...mapas.values()];
  if (!ms.length) return [];
  return [...ms[0].keys()].filter((u) => ms.every((m) => m.has(u))).sort();
}

function mediasPareadasPorBraco(mapas) {
  const unidades = intersecaoUnidades(mapas);
  const medias = {};
  for (const [braco, m] of mapas) medias[braco] = media(unidades.map((u) => m.get(u)));
  return { unidades, medias };
}

function correlacaoPearson(xs, ys) {
  if (xs.length !== ys.length || xs.length < 2) return null;
  const mx = media(xs);
  const my = media(ys);
  const sx = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  const sy = ys.reduce((s, y) => s + (y - my) ** 2, 0);
  if (sx === 0 || sy === 0) return null;
  const cov = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
  return cov / Math.sqrt(sx * sy);
}

function ordenarBracos(medias, tolerancia = 1e-12) {
  return Object.entries(medias)
    .sort((a, b) => (Math.abs(b[1] - a[1]) <= tolerancia ? a[0].localeCompare(b[0]) : b[1] - a[1]))
    .map(([braco]) => braco);
}

function acordoOrdem(medias, referencia, tolerancia = 1e-12) {
  const bracos = Object.keys(referencia).sort();
  let comparaveis = 0;
  let acordos = 0;
  let inversoes = 0;
  let empatesNovos = 0;
  for (let i = 0; i < bracos.length; i++) for (let j = i + 1; j < bracos.length; j++) {
    const a = bracos[i];
    const b = bracos[j];
    const sr = Math.sign(Math.abs(referencia[a] - referencia[b]) <= tolerancia ? 0 : referencia[a] - referencia[b]);
    if (sr === 0) continue;
    comparaveis++;
    const sc = Math.sign(Math.abs(medias[a] - medias[b]) <= tolerancia ? 0 : medias[a] - medias[b]);
    if (sc === sr) acordos++;
    else if (sc === 0) empatesNovos++;
    else inversoes++;
  }
  return {
    paresComparaveis: comparaveis,
    acordos,
    inversoes,
    empatesNovos,
    proporcaoAcordo: comparaveis ? acordos / comparaveis : null,
  };
}

/** Estabilidade ao usar exatamente k=1,2,3 replicas, enumerando subconjuntos. */
export function estabilidadePorK(observacoes, { ks = [1, 2, 3], toleranciaEmpate = 1e-12 } = {}) {
  validarObservacoes(observacoes);
  const replicas = [...new Set(observacoes.map((o) => o.replica))].sort((a, b) => Number(a) - Number(b));
  const mapasFull = mapasMedias(observacoes, replicas);
  const full = mediasPareadasPorBraco(mapasFull);
  const ordemFull = ordenarBracos(full.medias, toleranciaEmpate);
  const configuracoes = [];

  for (const k of ks) {
    if (!Number.isInteger(k) || k < 1 || k > replicas.length) continue;
    for (const subset of combinacoes(replicas, k)) {
      const mapas = mapasMedias(observacoes, subset);
      const pareado = mediasPareadasPorBraco(mapas);
      const correlacaoPorBraco = {};
      const deltaFullPorBraco = {};
      for (const [braco, mapa] of mapas) {
        const base = mapasFull.get(braco);
        const unidades = [...mapa.keys()].filter((u) => base?.has(u));
        correlacaoPorBraco[braco] = correlacaoPearson(unidades.map((u) => mapa.get(u)), unidades.map((u) => base.get(u)));
        deltaFullPorBraco[braco] = pareado.medias[braco] - full.medias[braco];
      }
      const ordem = ordenarBracos(pareado.medias, toleranciaEmpate);
      configuracoes.push({
        k,
        replicas: subset,
        nExerciciosPareados: pareado.unidades.length,
        mediasPorBraco: pareado.medias,
        deltaFullPorBraco,
        correlacaoProblemasComFull: correlacaoPorBraco,
        ordem,
        mesmaOrdemDoFull: ordem.join("\u0000") === ordemFull.join("\u0000"),
        mesmoPrimeiroDoFull: ordem[0] === ordemFull[0],
        acordoOrdem: acordoOrdem(pareado.medias, full.medias, toleranciaEmpate),
      });
    }
  }

  const resumoPorK = {};
  for (const [k, cfgs] of agrupar(configuracoes, (x) => x.k)) {
    const bracos = Object.keys(full.medias);
    resumoPorK[k] = {
      configuracoes: cfgs.length,
      taxaMesmaOrdem: media(cfgs.map((c) => Number(c.mesmaOrdemDoFull))),
      taxaMesmoPrimeiro: media(cfgs.map((c) => Number(c.mesmoPrimeiroDoFull))),
      acordoPareadoMedio: media(cfgs.map((c) => c.acordoOrdem.proporcaoAcordo).filter(Number.isFinite)),
      maxAbsDeltaPorBraco: Object.fromEntries(bracos.map((b) => [b, Math.max(...cfgs.map((c) => Math.abs(c.deltaFullPorBraco[b])))])),
      faixaMediaPorBraco: Object.fromEntries(bracos.map((b) => [b, [Math.min(...cfgs.map((c) => c.mediasPorBraco[b])), Math.max(...cfgs.map((c) => c.mediasPorBraco[b]))]])),
    };
  }

  return {
    replicasDisponiveis: replicas,
    referenciaFull: { nExerciciosPareados: full.unidades.length, mediasPorBraco: full.medias, ordem: ordemFull },
    configuracoes,
    resumoPorK,
  };
}

/** Leave-one-replica-out: caso especial explicito de k=R-1. */
export function leaveOneReplicaOut(observacoes, { toleranciaEmpate = 1e-12 } = {}) {
  const estabilidade = estabilidadePorK(observacoes, {
    ks: [[...new Set(observacoes.map((o) => o.replica))].length - 1],
    toleranciaEmpate,
  });
  const todas = estabilidade.replicasDisponiveis;
  return {
    referenciaFull: estabilidade.referenciaFull,
    exclusoes: estabilidade.configuracoes.map((c) => ({
      replicaExcluida: todas.find((r) => !c.replicas.includes(r)),
      replicasMantidas: c.replicas,
      nExerciciosPareados: c.nExerciciosPareados,
      mediasPorBraco: c.mediasPorBraco,
      deltaFullPorBraco: c.deltaFullPorBraco,
      ordem: c.ordem,
      mesmaOrdemDoFull: c.mesmaOrdemDoFull,
      acordoOrdem: c.acordoOrdem,
    })),
  };
}

/** Projeta a precisao da media de r replicas a partir dos componentes ANOVA. */
export function projetarReplicas(componentes, { rs = [3, 5, 10], z = 1.96 } = {}) {
  const out = {};
  for (const [braco, c] of Object.entries(componentes)) {
    if (!c.estimavel) {
      out[braco] = { estimavel: false, motivo: c.motivo };
      continue;
    }
    out[braco] = {
      estimavel: true,
      exercicios: c.exercicios,
      cenarios: rs.map((r) => {
        if (!Number.isFinite(r) || r <= 0) throw new Error(`numero de replicas invalido: ${r}`);
        const varianciaMediaProblema = c.varianciaEntre + c.varianciaDentro / r;
        const erroPadraoMediaBraco = Math.sqrt(varianciaMediaProblema / c.exercicios);
        return {
          replicas: r,
          dpRuidoNaMediaDoProblema: Math.sqrt(c.varianciaDentro / r),
          dpEntreMediasDeProblema: Math.sqrt(varianciaMediaProblema),
          confiabilidadeMediaReplicas: varianciaMediaProblema > 0 ? c.varianciaEntre / varianciaMediaProblema : null,
          erroPadraoMediaBraco,
          meiaLarguraIC95Normal: z * erroPadraoMediaBraco,
        };
      }),
    };
  }
  return out;
}

/** Analise completa de uma metrica. Nao le nem grava arquivos. */
export function analisarEstabilidade(observacoes, { ks = [1, 2, 3], projecoes = [3, 5, 10] } = {}) {
  validarObservacoes(observacoes);
  const componentes = decomporVarianciaICC(observacoes);
  return {
    unidadeInferencial: "exercicio (corpus + exercicio); replicas aninhadas",
    nObservacoes: observacoes.length,
    nExercicios: new Set(observacoes.map(chaveUnidade)).size,
    bracos: [...new Set(observacoes.map((o) => o.braco))].sort(),
    dpIntraproblema: dpIntraproblema(observacoes),
    componentesVariancia: componentes,
    estabilidadeK: estabilidadePorK(observacoes, { ks }),
    leaveOneReplicaOut: leaveOneReplicaOut(observacoes),
    projecaoReplicas: projetarReplicas(componentes, { rs: projecoes }),
  };
}

/**
 * Le uma metrica dos 630 registros. Valores null/undefined nao viram zero:
 * sao contabilizados em naoAvaliaveis e ficam fora daquela metrica.
 */
export function carregarObservacoes630(raiz, metrica = "coberturaEstados") {
  const observacoes = [];
  let totalRegistros = 0;
  let naoAvaliaveis = 0;
  const porArquivo = [];
  const requerReguaSimetrica = new Set(["precisaoEstados", "f1Estados", "igualdadeEstrita"]);
  const datasetAnterior = process.env.STI_DATASET;
  for (const item of ARQUIVOS_630) {
    const arquivo = path.resolve(raiz, item.arquivo);
    if (!fs.existsSync(arquivo)) throw new Error(`arquivo do manifesto nao encontrado: ${item.arquivo}`);
    const doc = JSON.parse(fs.readFileSync(arquivo, "utf8"));
    if (!Array.isArray(doc.porRegistro)) throw new Error(`porRegistro ausente: ${item.arquivo}`);
    let simetricas = null;
    if (requerReguaSimetrica.has(metrica)) {
      process.env.STI_DATASET = item.dataset;
      const referencia = carregarReferencia(raiz);
      const runsDir = path.resolve(raiz, item.runsDir);
      const problemsDir = path.resolve(raiz, "datasets", item.dataset, "problems");
      simetricas = new Map();
      for (const nome of fs.readdirSync(runsDir).filter((x) => x.endsWith(".json")).sort()) {
        const run = JSON.parse(fs.readFileSync(path.join(runsDir, nome), "utf8"));
        const ex = String(run.exercicio ?? run.id);
        const replica = Number(run.replica);
        if (!referencia[ex] || !Number.isFinite(replica)) continue;
        const envelopeA = JSON.parse(fs.readFileSync(path.join(problemsDir, ex, "envelope-a.json"), "utf8"));
        const envelopeB = JSON.parse(fs.readFileSync(path.join(problemsDir, ex, "envelope-b.json"), "utf8"));
        const grafoOriginal = run.materializado?.grafo ?? run.grafo;
        if (!grafoOriginal) continue;
        const grafo = grafoSimetrico(grafoOriginal).grafo;
        const entrada = run.materializado?.grafo
          ? { ...run, materializado: { ...run.materializado, grafo } }
          : { ...run, grafo };
        const score = pontuarComBase(entrada, envelopeA, envelopeB, referencia[ex]);
        score.igualdadeEstrita = Number(
          score.nEstadosRef === score.nEstadosComparaveisAgente &&
          score.nEstadosCasados === score.nEstadosRef,
        );
        simetricas.set(`${ex}\u0000${replica}`, score);
      }
    }
    totalRegistros += doc.porRegistro.length;
    let avaliaveisArquivo = 0;
    for (const r of doc.porRegistro) {
      const mat = r.mat ?? {};
      const valor = simetricas
        ? simetricas.get(`${String(r.ex)}\u0000${Number(r.replica)}`)?.[metrica]
        : mat[metrica];
      if (!Number.isFinite(valor)) {
        naoAvaliaveis++;
        continue;
      }
      avaliaveisArquivo++;
      observacoes.push({
        corpus: item.corpus,
        braco: item.braco,
        exercicio: String(r.ex),
        replica: Number(r.replica),
        valor,
      });
    }
    porArquivo.push({ ...item, registros: doc.porRegistro.length, avaliaveis: avaliaveisArquivo });
  }
  if (datasetAnterior === undefined) delete process.env.STI_DATASET;
  else process.env.STI_DATASET = datasetAnterior;
  if (totalRegistros !== 630) throw new Error(`manifesto deveria conter 630 registros; encontrou ${totalRegistros}`);
  return { metrica, totalRegistros, avaliaveis: observacoes.length, naoAvaliaveis, porArquivo, observacoes };
}

function argumentos(argv) {
  const valor = (nome, padrao) => {
    const i = argv.indexOf(nome);
    return i >= 0 ? argv[i + 1] : padrao;
  };
  return {
    raiz: valor("--raiz", "."),
    metrica: valor("--metrica", "todas"),
    compacto: argv.includes("--compacto"),
  };
}

function executarCli() {
  const args = argumentos(process.argv.slice(2));
  const metricas = args.metrica === "todas" ? METRICAS_PADRAO : args.metrica.split(",").map((x) => x.trim()).filter(Boolean);
  const saida = {
    contrato: "somente leitura; nenhum arquivo de resultado foi gravado",
    manifesto: "10 arquivos v3; 630 registros; unidade exercicio",
    metricas: {},
  };
  for (const metrica of metricas) {
    const carga = carregarObservacoes630(args.raiz, metrica);
    saida.metricas[metrica] = {
      fonte: {
        totalRegistros: carga.totalRegistros,
        avaliaveis: carga.avaliaveis,
        naoAvaliaveis: carga.naoAvaliaveis,
        porArquivo: carga.porArquivo,
      },
      analise: analisarEstabilidade(carga.observacoes),
    };
  }
  process.stdout.write(`${JSON.stringify(saida, null, args.compacto ? 0 : 2)}\n`);
}

const ehMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (ehMain) executarCli();
