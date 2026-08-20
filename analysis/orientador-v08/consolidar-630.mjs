#!/usr/bin/env node
/**
 * Consolidação offline das 10 células / 630 runs do protocolo orientador v0.8.
 *
 * O módulo separa a agregação pura da casca de IO. Por padrão a CLI apenas lê
 * os runs e imprime um resumo; um arquivo só é criado quando `--json caminho`
 * é informado explicitamente.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { carregarReferencia } from "../validacao-v2/lib.mjs";
import { analisarRegistro } from "./index.mjs";

export const ESQUEMA_CONSOLIDADO_630 = "sti.orientador-v08.consolidado-630/1";

/** Lista fechada e explícita das dez células que compõem os 630 registros. */
export const CELULAS_630 = Object.freeze([
  Object.freeze({
    corpus: "6.17",
    dataset: "frac-numberline-6.17",
    braco: "custo-beneficio",
    esperados: 72,
    runsDir: "resultados/rodada4-interface-fixa-2026-08-15/materializado-v3-fixa-custo-beneficio/runs",
  }),
  Object.freeze({
    corpus: "6.17",
    dataset: "frac-numberline-6.17",
    braco: "estudantes-qwen",
    esperados: 72,
    runsDir: "resultados/rodada4-interface-fixa-2026-08-15/materializado-v3-fixa-estudantes-qwen/runs",
  }),
  Object.freeze({
    corpus: "6.18",
    dataset: "equiv-fractions-6.18",
    braco: "custo-beneficio",
    esperados: 60,
    runsDir: "resultados/bloco1-mathtutor-2026-08-16/6.18/materializado-v3-fixa-custo-beneficio/runs",
  }),
  Object.freeze({
    corpus: "6.18",
    dataset: "equiv-fractions-6.18",
    braco: "estudantes-qwen",
    esperados: 60,
    runsDir: "resultados/bloco1-mathtutor-2026-08-16/6.18/materializado-v3-fixa-estudantes-qwen/runs",
  }),
  Object.freeze({
    corpus: "6.19",
    dataset: "frac-estimates-6.19",
    braco: "custo-beneficio",
    esperados: 69,
    runsDir: "resultados/bloco1-mathtutor-2026-08-16/6.19/materializado-v3-fixa-custo-beneficio/runs",
  }),
  Object.freeze({
    corpus: "6.19",
    dataset: "frac-estimates-6.19",
    braco: "estudantes-qwen",
    esperados: 69,
    runsDir: "resultados/bloco1-mathtutor-2026-08-16/6.19/materializado-v3-fixa-estudantes-qwen/runs",
  }),
  Object.freeze({
    corpus: "6.20",
    dataset: "fraction-ordering-6.20",
    braco: "custo-beneficio",
    esperados: 57,
    runsDir: "resultados/bloco1-mathtutor-2026-08-16/6.20/materializado-v3-fixa-custo-beneficio/runs",
  }),
  Object.freeze({
    corpus: "6.20",
    dataset: "fraction-ordering-6.20",
    braco: "estudantes-qwen",
    esperados: 57,
    runsDir: "resultados/bloco1-mathtutor-2026-08-16/6.20/materializado-v3-fixa-estudantes-qwen/runs",
  }),
  Object.freeze({
    corpus: "8.12",
    dataset: "factors-scaling-8.12",
    braco: "custo-beneficio",
    esperados: 57,
    runsDir: "resultados/bloco1-mathtutor-2026-08-16/8.12/materializado-v3-fixa-custo-beneficio/runs",
  }),
  Object.freeze({
    corpus: "8.12",
    dataset: "factors-scaling-8.12",
    braco: "estudantes-qwen",
    esperados: 57,
    runsDir: "resultados/bloco1-mathtutor-2026-08-16/8.12/materializado-v3-fixa-estudantes-qwen/runs",
  }),
]);

export const NUMERO_CELULAS_ESPERADO = 10;
export const TOTAL_RUNS_ESPERADO = 630;

const ehObjeto = (valor) => Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);
const numeroFinito = (valor) => typeof valor === "number" && Number.isFinite(valor);
const razao = (numerador, denominador) => denominador ? numerador / denominador : null;

function f1(precision, recall) {
  if (precision === null || recall === null) return null;
  if (precision === 0 && recall === 0) return 0;
  return precision + recall ? (2 * precision * recall) / (precision + recall) : null;
}

/** Falha cedo se a lista fechada deixar de representar exatamente 10/630. */
export function validarDefinicaoCelulas(
  celulas,
  { numeroEsperado = NUMERO_CELULAS_ESPERADO, totalEsperado = TOTAL_RUNS_ESPERADO } = {},
) {
  if (!Array.isArray(celulas)) throw new TypeError("celulas deve ser um array");
  if (celulas.length !== numeroEsperado) {
    throw new Error(`esperadas ${numeroEsperado} células; recebidas ${celulas.length}`);
  }
  const ids = new Set();
  const dirs = new Set();
  let total = 0;
  for (const [indice, celula] of celulas.entries()) {
    for (const campo of ["corpus", "dataset", "braco", "runsDir"]) {
      if (!String(celula?.[campo] ?? "").trim()) {
        throw new Error(`célula ${indice + 1}: campo ${campo} ausente`);
      }
    }
    if (!Number.isInteger(celula.esperados) || celula.esperados <= 0) {
      throw new Error(`célula ${indice + 1}: esperados deve ser inteiro positivo`);
    }
    const id = `${celula.corpus}::${celula.braco}`;
    if (ids.has(id)) throw new Error(`célula duplicada: ${id}`);
    if (dirs.has(celula.runsDir)) throw new Error(`runsDir duplicado: ${celula.runsDir}`);
    ids.add(id);
    dirs.add(celula.runsDir);
    total += celula.esperados;
  }
  if (total !== totalEsperado) {
    throw new Error(`esperados ${totalEsperado} runs; definição soma ${total}`);
  }
  return { numeroCelulas: celulas.length, totalEsperado: total };
}

validarDefinicaoCelulas(CELULAS_630);

/**
 * Enumera somente JSONs regulares e valida a cardinalidade de cada célula.
 * Nenhum run é aberto ou modificado nesta etapa.
 */
export function enumerarArquivos630({ raiz = ".", celulas = CELULAS_630 } = {}) {
  validarDefinicaoCelulas(celulas);
  const enumeradas = celulas.map((celula) => {
    const runsDirAbsoluto = path.resolve(raiz, celula.runsDir);
    if (!fs.existsSync(runsDirAbsoluto)) {
      throw new Error(`diretório de runs ausente: ${celula.runsDir}`);
    }
    const arquivos = fs.readdirSync(runsDirAbsoluto, { withFileTypes: true })
      .filter((entrada) => entrada.isFile() && entrada.name.endsWith(".json"))
      .map((entrada) => path.join(runsDirAbsoluto, entrada.name))
      .sort((a, b) => a.localeCompare(b));
    if (arquivos.length !== celula.esperados) {
      throw new Error(
        `${celula.corpus}/${celula.braco}: esperados ${celula.esperados} runs JSON; encontrados ${arquivos.length}`,
      );
    }
    return { ...celula, arquivos };
  });
  const total = enumeradas.reduce((soma, celula) => soma + celula.arquivos.length, 0);
  if (enumeradas.length !== NUMERO_CELULAS_ESPERADO || total !== TOTAL_RUNS_ESPERADO) {
    throw new Error(
      `inventário inválido: ${enumeradas.length} células e ${total} runs; esperados 10 e 630`,
    );
  }
  return enumeradas;
}

/** Troca STI_DATASET apenas durante a leitura da referência e sempre restaura o ambiente. */
export function carregarReferenciaDoDataset(dataset, raiz = ".", carregar = carregarReferencia) {
  const anterior = process.env.STI_DATASET;
  process.env.STI_DATASET = dataset;
  try {
    return carregar(raiz);
  } finally {
    if (anterior === undefined) delete process.env.STI_DATASET;
    else process.env.STI_DATASET = anterior;
  }
}

function achatarNumeros(valor, prefixo = "", saida = {}) {
  if (!ehObjeto(valor)) return saida;
  for (const [chave, filho] of Object.entries(valor)) {
    const caminho = prefixo ? `${prefixo}.${chave}` : chave;
    if (numeroFinito(filho)) saida[caminho] = filho;
    else if (ehObjeto(filho)) achatarNumeros(filho, caminho, saida);
  }
  return saida;
}

/** Resume todos os campos numéricos expostos, inclusive métricas futuras. */
export function resumirMetricasNumericas(objetos) {
  const porCampo = new Map();
  for (const objeto of objetos || []) {
    for (const [campo, valor] of Object.entries(achatarNumeros(objeto))) {
      if (!porCampo.has(campo)) porCampo.set(campo, []);
      porCampo.get(campo).push(valor);
    }
  }
  return Object.fromEntries([...porCampo.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([campo, valores]) => {
    const sum = valores.reduce((soma, valor) => soma + valor, 0);
    return [campo, {
      n: valores.length,
      sum,
      mean: sum / valores.length,
      min: Math.min(...valores),
      max: Math.max(...valores),
    }];
  }));
}

function somarCamposNumericos(objetos) {
  const saida = {};
  for (const objeto of objetos || []) {
    for (const [campo, valor] of Object.entries(achatarNumeros(objeto))) {
      saida[campo] = (saida[campo] || 0) + valor;
    }
  }
  return Object.fromEntries(Object.entries(saida).sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * Aceita o contrato plural novo e o contrato singular legado. Se ambos
 * existirem, `alignments.operational` prevalece e `alignment` apenas completa
 * a régua operacional ausente.
 */
export function reguasDoResultado(resultado) {
  const saida = {};
  const plurais = ehObjeto(resultado?.alignments) ? resultado.alignments : {};
  const preferidas = ["operational", "sai", "valueOnly"];
  for (const nome of [...preferidas, ...Object.keys(plurais).filter((nome) => !preferidas.includes(nome)).sort()]) {
    if (ehObjeto(plurais[nome])) saida[nome] = plurais[nome];
  }
  if (!saida.operational && ehObjeto(resultado?.alignment)) saida.operational = resultado.alignment;
  return saida;
}

function valorContagem(objeto, caminhos, fallback = 0) {
  for (const caminho of caminhos) {
    let atual = objeto;
    for (const parte of caminho.split(".")) atual = atual?.[parte];
    if (numeroFinito(atual)) return atual;
  }
  return fallback;
}

function resumirRegua(resultados, nome) {
  const reguas = resultados.map((resultado) => reguasDoResultado(resultado)[nome]).filter(ehObjeto);
  const matches = reguas.reduce((soma, regua) => soma + (
    Array.isArray(regua.matches)
      ? regua.matches.length
      : valorContagem(regua, ["metrics.matched", "matched"], 0)
  ), 0);
  const referencias = reguas.reduce((soma, regua) => soma + valorContagem(
    regua,
    ["denominators.reference", "metrics.reference", "reference"],
    0,
  ), 0);
  const materializados = reguas.reduce((soma, regua) => soma + valorContagem(
    regua,
    ["denominators.materialized", "metrics.materialized", "materialized"],
    0,
  ), 0);
  const temElegibilidade = reguas.some((regua) =>
    numeroFinito(regua?.denominators?.eligibleReference) &&
    numeroFinito(regua?.denominators?.eligibleMaterialized)
  );
  const referenciasElegiveis = reguas.reduce((soma, regua) => soma + valorContagem(
    regua,
    ["denominators.eligibleReference", "metrics.eligibleReference", "eligibleReference"],
    0,
  ), 0);
  const materializadosElegiveis = reguas.reduce((soma, regua) => soma + valorContagem(
    regua,
    ["denominators.eligibleMaterialized", "metrics.eligibleMaterialized", "eligibleMaterialized"],
    0,
  ), 0);
  const reguasComResolutiveis = reguas.filter((regua) => numeroFinito(
    regua?.denominators?.resolvableMaterialized ??
    regua?.metrics?.resolvableMaterialized ??
    regua?.resolvableMaterialized,
  ));
  const resolviveis = reguasComResolutiveis.length === reguas.length && reguas.length > 0
    ? reguasComResolutiveis.reduce((soma, regua) => soma + valorContagem(
      regua,
      ["denominators.resolvableMaterialized", "metrics.resolvableMaterialized", "resolvableMaterialized"],
      0,
    ), 0)
    : null;
  const tierCounts = { componentActionValue: 0, componentValue: 0, valueOnly: 0 };
  for (const regua of reguas) {
    for (const match of regua.matches || []) {
      if (match?.tier === 3) tierCounts.componentActionValue += 1;
      else if (match?.tier === 2) tierCounts.componentValue += 1;
      else if (match?.tier === 1) tierCounts.valueOnly += 1;
    }
  }
  const exatos = reguas.reduce((soma, regua) => {
    const explicito = regua?.score?.componentActionValue ?? regua?.metrics?.componentActionValue;
    if (numeroFinito(explicito)) return soma + explicito;
    return soma + (regua.matches || []).filter((match) => match?.tier === 3).length;
  }, 0);
  const precisionAny = razao(matches, materializados);
  const recallAny = razao(matches, referencias);
  const eligiblePrecision = temElegibilidade ? razao(matches, materializadosElegiveis) : null;
  const eligibleRecall = temElegibilidade ? razao(matches, referenciasElegiveis) : null;
  const precisionExact = razao(exatos, materializados);
  const recallExact = razao(exatos, referencias);
  return {
    nRuns: reguas.length,
    totals: {
      matches,
      unmatchedReference: reguas.reduce((soma, r) => soma + (r.unmatchedReference?.length || 0), 0),
      unmatchedMaterialized: reguas.reduce((soma, r) => soma + (r.unmatchedMaterialized?.length || 0), 0),
      denominators: somarCamposNumericos(reguas.map((r) => r.denominators)),
      score: somarCamposNumericos(reguas.map((r) => r.score)),
      tierCounts,
    },
    micro: {
      reference: referencias,
      materialized: materializados,
      eligibleReference: temElegibilidade ? referenciasElegiveis : null,
      eligibleMaterialized: temElegibilidade ? materializadosElegiveis : null,
      resolvableMaterialized: resolviveis,
      matched: matches,
      exactComponentActionValue: exatos,
      precision: precisionAny,
      recall: recallAny,
      f1: f1(precisionAny, recallAny),
      precisionAny,
      recallAny,
      f1Any: f1(precisionAny, recallAny),
      eligiblePrecision,
      eligibleRecall,
      eligibleF1: f1(eligiblePrecision, eligibleRecall),
      referenceEligibilityRate: temElegibilidade ? razao(referenciasElegiveis, referencias) : null,
      materializedEligibilityRate: temElegibilidade ? razao(materializadosElegiveis, materializados) : null,
      precisionExact,
      recallExact,
      f1Exact: f1(precisionExact, recallExact),
      resolvableRate: razao(resolviveis, materializados),
      precisionExactAmongResolvable: razao(exatos, resolviveis),
    },
    metricsPerRun: resumirMetricasNumericas(reguas.map((r) => r.metrics)),
  };
}

function contarPor(itens, seletor) {
  const contagens = {};
  for (const item of itens || []) {
    const chave = String(seletor(item) ?? "(ausente)");
    contagens[chave] = (contagens[chave] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(contagens).sort(([a], [b]) => a.localeCompare(b)));
}

function resumirResolucao(resultados) {
  const resolucoes = resultados.map((resultado) => {
    if (ehObjeto(resultado?.resolution)) return resultado.resolution;
    const atomos = resultado?.atoms?.materialized || [];
    const target = {
      exact_target: atomos.filter((a) =>
        a?.targetResolution === "exact_target" || a?.status === "exact_target" || a?.statuses?.includes("exact_target")
      ).length,
      ambiguous_target: atomos.filter((a) =>
        a?.targetResolution === "ambiguous_target" || a?.statuses?.includes("ambiguous_target")
      ).length,
      unknown_target: atomos.filter((a) =>
        !["exact_target", "ambiguous_target"].includes(a?.targetResolution) && !a?.component
      ).length,
    };
    const fullyResolvable = atomos.filter((a) => {
      const familiaConhecida = a?.actionFamily && a.actionFamily !== "unknown";
      return Boolean(a?.component) && Boolean(familiaConhecida || a?.action) && !a?.compositeUnresolved;
    }).length;
    return {
      total: atomos.length,
      target,
      primaryStatus: contarPor(atomos, (a) => a?.status),
      fullyResolvable,
      actionFamily: {
        total: atomos.length,
        known: atomos.filter((a) => a?.actionFamily && a.actionFamily !== "unknown" || a?.action).length,
        unknown: atomos.filter((a) => !(a?.actionFamily && a.actionFamily !== "unknown" || a?.action)).length,
      },
    };
  });
  const atomos = resultados.flatMap((r) => r?.atoms?.materialized || []);
  const total = resolucoes.reduce((soma, r) => soma + valorContagem(r, ["total"], 0), 0);
  const target = somarCamposNumericos(resolucoes.map((r) => r.target));
  const primaryStatus = somarCamposNumericos(resolucoes.map((r) => r.primaryStatus));
  const actionFamily = somarCamposNumericos(resolucoes.map((r) => r.actionFamily));
  const componentesResolvidos = target.exact_target || 0;
  const acoesResolvidas = actionFamily.known || 0;
  const saiCompleto = resolucoes.reduce((soma, r) => soma + valorContagem(r, ["fullyResolvable"], 0), 0);
  const flags = atomos.flatMap((atomo) => {
    const statuses = Array.isArray(atomo?.statuses) ? atomo.statuses : [];
    return [...new Set([atomo?.status, ...statuses].filter(Boolean))].map((status) => ({ status }));
  });
  return {
    materializedAtoms: total,
    componentsResolved: componentesResolvidos,
    actionsResolved: acoesResolvidas,
    fullSaiResolved: saiCompleto,
    componentResolutionRate: razao(componentesResolvidos, total),
    actionResolutionRate: razao(acoesResolvidas, total),
    fullSaiResolutionRate: razao(saiCompleto, total),
    target,
    primaryStatus,
    actionFamily,
    primaryStatusCounts: contarPor(atomos, (a) => a?.status),
    statusFlagCounts: contarPor(flags, (item) => item.status),
  };
}

function resumirErros(resultados) {
  const matchings = resultados.map((r) => r?.errors?.matching).filter(ehObjeto);
  const metrics = matchings.map((m) => m.metrics || {});
  const matched = matchings.reduce((soma, m) => soma + (
    Array.isArray(m.pairs) ? m.pairs.length : valorContagem(m, ["metrics.matched"], 0)
  ), 0);
  const referenceComparable = matchings.reduce((soma, m) =>
    soma + valorContagem(m, ["metrics.referenceComparable"], 0), 0);
  const materialized = matchings.reduce((soma, m) =>
    soma + valorContagem(m, ["metrics.materialized"], 0), 0);
  const precision = razao(matched, materialized);
  const recall = razao(matched, referenceComparable);
  return {
    nRuns: matchings.length,
    totals: somarCamposNumericos(metrics),
    unmatchedReference: matchings.reduce((soma, m) => soma + (m.unmatchedReference?.length || 0), 0),
    unmatchedMaterialized: matchings.reduce((soma, m) => soma + (m.unmatchedMaterialized?.length || 0), 0),
    unanchoredReference: matchings.reduce((soma, m) => soma + (m.unanchoredReference?.length || 0), 0),
    micro: { matched, referenceComparable, materialized, precision, recall, f1: f1(precision, recall) },
    metricsPerRun: resumirMetricasNumericas(metrics),
  };
}

function resumirDicas(resultados) {
  const metricas = resultados.map((r) => r?.hints?.metrics).filter(ehObjeto);
  const totais = somarCamposNumericos(metricas);
  const ref = totais.referenceStatesWithHints || 0;
  const materialized = totais.materializedStatesWithHints || 0;
  const ambos = totais.alignedStatesWithHintsOnBothSides || 0;
  const precision = razao(ambos, materialized);
  const recall = razao(ambos, ref);
  return {
    nRuns: metricas.length,
    totals: totais,
    micro: {
      referenceStatesWithHints: ref,
      materializedStatesWithHints: materialized,
      alignedStatesWithHintsOnBothSides: ambos,
      presencePrecision: precision,
      presenceRecall: recall,
      presenceF1: f1(precision, recall),
    },
    metricsPerRun: resumirMetricasNumericas(metricas),
  };
}

function ledgerDoResultado(resultado) {
  if (Array.isArray(resultado?.extrasLedger)) return resultado.extrasLedger;
  if (Array.isArray(resultado?.extras?.ledger)) return resultado.extras.ledger;
  return [];
}

function resumirExtras(resultados) {
  const ledger = resultados.flatMap(ledgerDoResultado);
  const extras = ledger.filter((row) => row?.isExtra !== false);
  const inventarioNaoExtra = ledger.filter((row) => row?.isExtra === false);
  return {
    occurrences: extras.length,
    inventoryOccurrences: ledger.length,
    nonExtraInventoryOccurrences: inventarioNaoExtra.length,
    byType: contarPor(extras, (row) => row?.type),
    byReason: contarPor(extras, (row) => row?.reason),
    bySource: contarPor(extras, (row) => row?.source),
    byJudgment: contarPor(extras, (row) => row?.judgment),
    inventoryByType: contarPor(ledger, (row) => row?.type),
    nonExtraInventoryByType: contarPor(inventarioNaoExtra, (row) => row?.type),
  };
}

/** Agregação pura de uma célula já analisada. */
export function resumirResultadosCelula(resultados, celula = {}) {
  if (!Array.isArray(resultados)) throw new TypeError("resultados deve ser um array");
  const nomesReguas = [...new Set(resultados.flatMap((r) => Object.keys(reguasDoResultado(r))))];
  const exercicios = new Set(resultados.map((r) =>
    r?.metadata?.exercise ?? r?.exercise ?? r?.exercicio ?? null
  ).filter((x) => x !== null));
  return {
    corpus: celula.corpus ?? null,
    dataset: celula.dataset ?? null,
    arm: celula.braco ?? celula.arm ?? null,
    expectedRuns: celula.esperados ?? null,
    runs: resultados.length,
    exercises: exercicios.size,
    resolutionCoverage: resumirResolucao(resultados),
    alignments: Object.fromEntries(nomesReguas.map((nome) => [nome, resumirRegua(resultados, nome)])),
    errors: resumirErros(resultados),
    hints: resumirDicas(resultados),
    extras: resumirExtras(resultados),
  };
}

/**
 * Lê e analisa exatamente os 630 runs. Dependências são injetáveis apenas para
 * testes; a CLI usa carregarReferencia/analisarRegistro reais.
 */
export function consolidar630({
  raiz = ".",
  incluirInventarioEstrutural = true,
  carregarReferenciaFn = carregarReferencia,
  analisarRegistroFn = analisarRegistro,
} = {}) {
  const inventario = enumerarArquivos630({ raiz });
  const referencias = new Map();
  const celulas = [];
  const chavesRuns = new Set();
  let totalRuns = 0;

  for (const celula of inventario) {
    if (!referencias.has(celula.dataset)) {
      referencias.set(
        celula.dataset,
        carregarReferenciaDoDataset(celula.dataset, raiz, carregarReferenciaFn),
      );
    }
    const referencia = referencias.get(celula.dataset);
    const resultados = [];
    for (const arquivo of celula.arquivos) {
      const run = JSON.parse(fs.readFileSync(arquivo, "utf8"));
      const exercise = run?.exercicio ?? run?.id;
      if (!exercise) throw new Error(`run sem exercício: ${arquivo}`);
      if (!referencia?.[exercise]) {
        throw new Error(`${celula.corpus}/${celula.braco}: referência ausente para ${exercise}`);
      }
      const replica = run?.replica ?? null;
      const chave = `${celula.corpus}::${celula.braco}::${exercise}::${replica}`;
      if (chavesRuns.has(chave)) throw new Error(`run duplicado: ${chave}`);
      chavesRuns.add(chave);
      resultados.push(analisarRegistroFn(run, referencia[exercise], {
        metadata: {
          corpus: celula.corpus,
          arm: celula.braco,
          exercise,
          replica,
          stage: "materializado",
        },
        incluirInventarioEstrutural,
      }));
    }
    if (resultados.length !== celula.esperados) {
      throw new Error(
        `${celula.corpus}/${celula.braco}: analisados ${resultados.length}; esperados ${celula.esperados}`,
      );
    }
    totalRuns += resultados.length;
    celulas.push(resumirResultadosCelula(resultados, celula));
  }

  if (celulas.length !== NUMERO_CELULAS_ESPERADO || totalRuns !== TOTAL_RUNS_ESPERADO) {
    throw new Error(`consolidação incompleta: ${celulas.length} células e ${totalRuns} runs`);
  }
  return {
    schema: ESQUEMA_CONSOLIDADO_630,
    readOnlyByDefault: true,
    expectedCells: NUMERO_CELULAS_ESPERADO,
    expectedRuns: TOTAL_RUNS_ESPERADO,
    cellsAnalyzed: celulas.length,
    runsAnalyzed: totalRuns,
    cells: celulas,
  };
}

export function interpretarArgumentos(argv) {
  const opcoes = { raiz: ".", json: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") opcoes.help = true;
    else if (arg === "--raiz" || arg === "--json") {
      const valor = argv[++i];
      if (!valor || valor.startsWith("--")) throw new Error(`${arg} requer um caminho`);
      if (arg === "--raiz") opcoes.raiz = valor;
      else opcoes.json = valor;
    } else throw new Error(`argumento desconhecido: ${arg}`);
  }
  return opcoes;
}

function formatarTaxa(valor) {
  return numeroFinito(valor) ? valor.toFixed(4) : "N/A";
}

export function imprimirResumo(resultado, escrever = console.log) {
  escrever(`ORIENTADOR V0.8 — ${resultado.runsAnalyzed} runs em ${resultado.cellsAnalyzed} células`);
  for (const celula of resultado.cells) {
    const reguas = Object.entries(celula.alignments).map(([nome, regua]) =>
      `${nome}:R=${formatarTaxa(regua.micro.recallAny)},P=${formatarTaxa(regua.micro.precisionAny)}`
    ).join("; ");
    escrever(
      `${celula.corpus}/${celula.arm}: n=${celula.runs}; ` +
      `SAI resolvido=${formatarTaxa(celula.resolutionCoverage.fullSaiResolutionRate)}; ` +
      `${reguas || "sem régua"}; erros R=${formatarTaxa(celula.errors.micro.recall)}; ` +
      `dicas R=${formatarTaxa(celula.hints.micro.presenceRecall)}; extras=${celula.extras.occurrences}`,
    );
  }
}

const ehMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (ehMain) {
  try {
    const opcoes = interpretarArgumentos(process.argv.slice(2));
    if (opcoes.help) {
      console.log("uso: node analysis/orientador-v08/consolidar-630.mjs [--raiz caminho] [--json caminho]");
    } else {
      const resultado = consolidar630({ raiz: opcoes.raiz });
      imprimirResumo(resultado);
      if (opcoes.json) {
        const destino = path.resolve(opcoes.json);
        fs.mkdirSync(path.dirname(destino), { recursive: true });
        fs.writeFileSync(destino, `${JSON.stringify(resultado, null, 2)}\n`);
        console.log(`salvo em ${destino}`);
      } else {
        console.log("(somente leitura; use --json <arquivo> para gravar o consolidado)");
      }
    }
  } catch (erro) {
    console.error(`erro: ${erro?.message || erro}`);
    process.exitCode = 1;
  }
}
