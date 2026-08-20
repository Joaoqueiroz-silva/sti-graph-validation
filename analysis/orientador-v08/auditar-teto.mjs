#!/usr/bin/env node
/**
 * Auditoria offline do teto de topologia — protocolo do orientador v0.8.
 *
 * Este módulo tem duas camadas deliberadamente separadas:
 *   1. funções puras que normalizam e consolidam telemetria já carregada;
 *   2. uma casca CLI somente-leitura, salvo quando `--json` é solicitado.
 *
 * A perda é CONTRAFACTUAL: nos registros do regime `livre`, compara-se o
 * número de passos preservados com o que o plano de produção aplicaria. Um
 * registro do regime `producao` já pode ter sido cortado antes de gravar
 * `passosGeradosPeloAgente`; por isso ele é censurado, nunca contado como
 * evidência de perda zero.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ESQUEMA_AUDITORIA_TETO = "sti.orientador-v08.auditoria-teto/1";

/** As dez células imutáveis que formam os 630 registros da Trilha E. */
export const CELULAS_630 = Object.freeze([
  {
    corpus: "6.17",
    dataset: "frac-numberline-6.17",
    braco: "custo-beneficio",
    esperados: 72,
    runsDir: "resultados/rodada4-interface-fixa-2026-08-15/materializado-v3-fixa-custo-beneficio/runs",
  },
  {
    corpus: "6.17",
    dataset: "frac-numberline-6.17",
    braco: "estudantes-qwen",
    esperados: 72,
    runsDir: "resultados/rodada4-interface-fixa-2026-08-15/materializado-v3-fixa-estudantes-qwen/runs",
  },
  ...[
    ["6.18", "equiv-fractions-6.18", 60],
    ["6.19", "frac-estimates-6.19", 69],
    ["6.20", "fraction-ordering-6.20", 57],
    ["8.12", "factors-scaling-8.12", 57],
  ].flatMap(([corpus, dataset, esperados]) =>
    ["custo-beneficio", "estudantes-qwen"].map((braco) => ({
      corpus,
      dataset,
      braco,
      esperados,
      runsDir: `resultados/bloco1-mathtutor-2026-08-16/${corpus}/materializado-v3-fixa-${braco}/runs`,
    })),
  ),
]);

export const TOTAL_ESPERADO_630 = CELULAS_630.reduce((soma, celula) => soma + celula.esperados, 0);

/**
 * Escopo estático fechado. Ele cobre o transporte Agents 3 → GraphForge →
 * Agents 6/7 → contrato de run e os limites técnicos das chamadas LLM.
 * Acrescentar/remover arquivo exige uma mudança explícita e revisável.
 */
export const ARQUIVOS_AUDITORIA_ESTATICA = Object.freeze([
  "agents3-students.js",
  "author-graph.js",
  "simulate-fluxo-plataforma.js",
  "materializar-registro.js",
  "scripts/registro-run-v2.mjs",
  "llm.js",
  "producao/agents/nodes/agents3-students.js",
  "producao/agents/graphforge.js",
  "producao/agents/nodes/agent6-story.js",
  "producao/agents/nodes/agent6-payload-guard.js",
  "producao/agents/nodes/agent7-adapter.js",
  "producao/agents/notebook/notebook-fallback.js",
  "producao/agents/patterns/quality-gate.js",
  "producao/agents/pipeline-core.js",
  "producao/agents/prompts/agent6-worker-prompt.js",
  "producao/agents/response-modality-planner.js",
]);

/**
 * Lista explícita dos padrões auditados. Um match é um CANDIDATO para revisão,
 * não prova automática de perda: `slice(0, 20)` pode encurtar apenas um rótulo,
 * enquanto `slice(0, targetCount)` pode censurar a espinha dorsal.
 */
export const PADROES_TETO_ESTATICO = Object.freeze([
  {
    id: "slice-prefixo",
    familia: "truncamento",
    descricao: "recorte de prefixo por slice(0, limite)",
    expressao: /\.slice\s*\(\s*0\s*,/,
  },
  {
    id: "substring-prefixo",
    familia: "truncamento",
    descricao: "recorte de prefixo textual por substring/substr",
    expressao: /\.(?:substring|substr)\s*\(\s*0\s*,/,
  },
  {
    id: "limite-passos",
    familia: "passos",
    descricao: "teto, piso ou contagem dinâmica de passos",
    expressao: /\b(?:minSteps|defaultSteps|maxSteps|dynamicMax|requestedMinimum|requestedPerProblemMinimum)\b/,
  },
  {
    id: "limite-nos",
    familia: "nos-arestas",
    descricao: "limite nomeado de nós ou arestas",
    expressao: /\b(?:maxNodes|maxNodeCount|nodeLimit|maxEdges|edgeLimit|MAX_NODES|MAX_EDGES)\b/i,
  },
  {
    id: "limite-erros",
    familia: "erros",
    descricao: "limite nomeado de erros, misconceptions, opções erradas ou scaffolds",
    expressao: /\b(?:maxErrors|maxMisconceptions|misconceptionLimit|maxWrongOptions|scaffoldsPerMisc)\b/i,
  },
  {
    id: "limite-dicas",
    familia: "dicas",
    descricao: "limite nomeado de dicas ou níveis de ajuda",
    expressao: /\b(?:maxHints|maxHintLevels|hintLimit|hintsPerStep|MAX_HINTS)\b/i,
  },
  {
    id: "max-items-schema",
    familia: "colecoes",
    descricao: "tamanho máximo declarado em schema/validador",
    expressao: /\b(?:maxItems|MAX_ITEMS|MAX_OPTIONS|MAX_ROWS)\b/,
  },
  {
    id: "math-min",
    familia: "clamp",
    descricao: "clamp por Math.min que requer classificação manual",
    expressao: /\bMath\.min\s*\(/,
  },
  {
    id: "teto-tokens",
    familia: "tokens",
    descricao: "teto de tokens de saída da chamada LLM",
    expressao: /\b(?:maxTokens|max_tokens|[A-Z][A-Z0-9_]*MAX_TOKENS)\b/,
  },
  {
    id: "timeout",
    familia: "tempo",
    descricao: "timeout que pode produzir censura ou falha de geração",
    expressao: /\b(?:timeout|setTimeout|AbortSignal\.timeout)\b/i,
  },
  {
    id: "corte-por-comprimento",
    familia: "colecoes",
    descricao: "break/return condicionado ao comprimento máximo de uma coleção",
    expressao: /\b(?:break|return)\b.*\b(?:length|size|count)\b.*(?:>=|>)|\bif\b.*\b(?:length|size|count)\b.*(?:>=|>).*\b(?:MAX|max)/,
  },
]);

const compararTexto = (a, b) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);
const celulaId = (corpus, braco) => `${String(corpus ?? "?")}::${String(braco ?? "?")}`;
const inteiroNaoNegativo = (valor) => Number.isInteger(valor) && valor >= 0;

function chaveRegistro(linha) {
  return [linha.corpus ?? "?", linha.braco ?? "?", linha.exercicio ?? "?", linha.replica ?? "?"].join("::");
}

/** Normaliza um registro sem IO e sem lançar por telemetria ausente/inválida. */
export function extrairTopologia(item) {
  const registro = item?.registro ?? item ?? {};
  const meta = item?.registro ? item : {};
  const topologia = registro?.topologia;
  const base = {
    corpus: meta.corpus ?? registro.corpus ?? null,
    dataset: meta.dataset ?? registro.dataset ?? null,
    braco: meta.braco ?? registro.braco ?? null,
    exercicio: registro.exercicio ?? registro.id ?? meta.exercicio ?? null,
    replica: registro.replica ?? meta.replica ?? null,
    arquivo: meta.arquivo ?? null,
  };
  const passosReferencia = meta.passosReferencia ?? registro.passosReferencia ?? null;

  if (!topologia || typeof topologia !== "object" || Array.isArray(topologia)) {
    return {
      ...base,
      chave: chaveRegistro(base),
      status: "ausente",
      motivo: "bloco topologia ausente",
      passosReferencia: inteiroNaoNegativo(passosReferencia) ? passosReferencia : null,
    };
  }

  const obrigatorios = [
    ["regime", topologia.regime],
    ["passosGeradosPeloAgente", topologia.passosGeradosPeloAgente],
    ["passosQueProducaoAplicaria", topologia.passosQueProducaoAplicaria],
    ["tetoDinamicoProducao", topologia.tetoDinamicoProducao],
  ];
  const ausentes = obrigatorios.filter(([, valor]) => valor === undefined || valor === null).map(([campo]) => campo);
  if (ausentes.length) {
    return {
      ...base,
      chave: chaveRegistro(base),
      status: "ausente",
      motivo: `campos de topologia ausentes: ${ausentes.join(", ")}`,
      camposAusentes: ausentes,
      passosReferencia: inteiroNaoNegativo(passosReferencia) ? passosReferencia : null,
    };
  }

  const gerados = topologia.passosGeradosPeloAgente;
  const aplicaria = topologia.passosQueProducaoAplicaria;
  const teto = topologia.tetoDinamicoProducao;
  const regime = String(topologia.regime).trim();
  if (!regime || ![gerados, aplicaria, teto].every(inteiroNaoNegativo)) {
    return {
      ...base,
      chave: chaveRegistro(base),
      status: "invalida",
      motivo: "regime deve ser não vazio e contagens devem ser inteiros não negativos",
      valoresRecebidos: { regime: topologia.regime, gerados, aplicaria, teto },
      passosReferencia: inteiroNaoNegativo(passosReferencia) ? passosReferencia : null,
    };
  }

  const contrafactualMensuravel = regime === "livre";
  const perda = contrafactualMensuravel ? Math.max(0, gerados - aplicaria) : null;
  const alertas = [];
  if (aplicaria > teto) alertas.push("passosQueProducaoAplicaria excede tetoDinamicoProducao");
  if (contrafactualMensuravel && perda > 0 && aplicaria !== teto) {
    alertas.push("há perda contrafactual sem ativação exata do teto dinâmico");
  }
  const referenciaValida = inteiroNaoNegativo(passosReferencia) && passosReferencia > 0;

  return {
    ...base,
    chave: chaveRegistro(base),
    status: "ok",
    regime,
    passosGeradosPeloAgente: gerados,
    passosQueProducaoAplicaria: aplicaria,
    tetoDinamicoProducao: teto,
    contrafactualMensuravel,
    censurado: !contrafactualMensuravel,
    truncamentoPotencial: perda === null ? null : perda > 0,
    passosPotencialmentePerdidos: perda,
    passosPotencialmenteSintetizados: Math.max(0, aplicaria - gerados),
    tetoAtivado: perda === null ? null : perda > 0 && aplicaria === teto,
    passosReferencia: referenciaValida ? passosReferencia : null,
    perdaSobreReferencia: referenciaValida && perda !== null ? perda / passosReferencia : null,
    alertas,
  };
}

function histogramaInteiros(valores) {
  const mapa = new Map();
  for (const valor of valores) mapa.set(valor, (mapa.get(valor) ?? 0) + 1);
  return Object.fromEntries([...mapa.entries()].sort((a, b) => a[0] - b[0]).map(([valor, n]) => [String(valor), n]));
}

function descreverInteiros(valores) {
  const xs = valores.filter(Number.isFinite).sort((a, b) => a - b);
  if (!xs.length) return { n: 0, soma: 0, minimo: null, maximo: null, media: null, mediana: null, histograma: {} };
  const soma = xs.reduce((a, b) => a + b, 0);
  const meio = Math.floor(xs.length / 2);
  const mediana = xs.length % 2 ? xs[meio] : (xs[meio - 1] + xs[meio]) / 2;
  return {
    n: xs.length,
    soma,
    minimo: xs[0],
    maximo: xs[xs.length - 1],
    media: soma / xs.length,
    mediana,
    histograma: histogramaInteiros(xs),
  };
}

function resumirLinhas(linhas) {
  const ok = linhas.filter((linha) => linha.status === "ok");
  const mensuraveis = ok.filter((linha) => linha.contrafactualMensuravel);
  const truncados = mensuraveis.filter((linha) => linha.truncamentoPotencial);
  const comReferencia = mensuraveis.filter(
    (linha) => Number.isFinite(linha.passosReferencia) && linha.passosReferencia > 0,
  );
  const perdaComReferencia = comReferencia.reduce((soma, linha) => soma + linha.passosPotencialmentePerdidos, 0);
  const totalReferencia = comReferencia.reduce((soma, linha) => soma + linha.passosReferencia, 0);
  const regimes = {};
  for (const linha of ok) regimes[linha.regime] = (regimes[linha.regime] ?? 0) + 1;

  return {
    registros: linhas.length,
    analisaveis: ok.length,
    telemetriaAusente: linhas.filter((linha) => linha.status === "ausente").length,
    telemetriaInvalida: linhas.filter((linha) => linha.status === "invalida").length,
    comAlertaSemantico: ok.filter((linha) => linha.alertas.length > 0).length,
    regimes: Object.fromEntries(Object.entries(regimes).sort(([a], [b]) => compararTexto(a, b))),
    contrafactual: {
      mensuraveis: mensuraveis.length,
      censurados: ok.length - mensuraveis.length,
      grafosComTruncamentoPotencial: truncados.length,
      taxaEntreMensuraveis: mensuraveis.length ? truncados.length / mensuraveis.length : null,
      passosPotencialmentePerdidos: mensuraveis.reduce(
        (soma, linha) => soma + linha.passosPotencialmentePerdidos,
        0,
      ),
      grafosComSintesePotencial: mensuraveis.filter((linha) => linha.passosPotencialmenteSintetizados > 0).length,
      passosPotencialmenteSintetizados: mensuraveis.reduce(
        (soma, linha) => soma + linha.passosPotencialmenteSintetizados,
        0,
      ),
      tetosAtivados: mensuraveis.filter((linha) => linha.tetoAtivado).length,
    },
    distribuicoes: {
      passosGeradosPeloAgente: descreverInteiros(ok.map((linha) => linha.passosGeradosPeloAgente)),
      passosQueProducaoAplicaria: descreverInteiros(ok.map((linha) => linha.passosQueProducaoAplicaria)),
      tetoDinamicoProducao: descreverInteiros(ok.map((linha) => linha.tetoDinamicoProducao)),
      passosPotencialmentePerdidos: descreverInteiros(
        mensuraveis.map((linha) => linha.passosPotencialmentePerdidos),
      ),
    },
    relacaoComReferencia: {
      registrosComReferencia: comReferencia.length,
      passosReferencia: totalReferencia || null,
      passosPerdidos: comReferencia.length ? perdaComReferencia : null,
      razaoAgregada: totalReferencia ? perdaComReferencia / totalReferencia : null,
    },
  };
}

function agrupar(linhas, campos) {
  const grupos = new Map();
  for (const linha of linhas) {
    const chave = campos.map((campo) => String(linha[campo] ?? "?")).join("\u0000");
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(linha);
  }
  return [...grupos.values()]
    .map((grupo) => ({
      ...Object.fromEntries(campos.map((campo) => [campo, grupo[0][campo] ?? null])),
      ...resumirLinhas(grupo),
    }))
    .sort((a, b) => {
      for (const campo of campos) {
        const cmp = compararTexto(a[campo], b[campo]);
        if (cmp) return cmp;
      }
      return 0;
    });
}

function auditarCobertura(linhas, celulasEsperadas) {
  if (!Array.isArray(celulasEsperadas)) return null;
  const porCelula = celulasEsperadas.map((celula) => {
    const encontrados = linhas.filter(
      (linha) => linha.corpus === celula.corpus && linha.braco === celula.braco,
    ).length;
    return {
      corpus: celula.corpus,
      dataset: celula.dataset,
      braco: celula.braco,
      esperados: celula.esperados,
      encontrados,
      diferenca: encontrados - celula.esperados,
      completa: encontrados === celula.esperados,
    };
  });
  const idsEsperados = new Set(celulasEsperadas.map((celula) => celulaId(celula.corpus, celula.braco)));
  const inesperadas = agrupar(
    linhas.filter((linha) => !idsEsperados.has(celulaId(linha.corpus, linha.braco))),
    ["corpus", "braco"],
  ).map(({ corpus, braco, registros }) => ({ corpus, braco, registros }));
  const porChave = new Map();
  for (const linha of linhas) {
    if (!porChave.has(linha.chave)) porChave.set(linha.chave, []);
    porChave.get(linha.chave).push(linha.arquivo);
  }
  const duplicadas = [...porChave.entries()]
    .filter(([, arquivos]) => arquivos.length > 1)
    .map(([chave, arquivos]) => ({ chave, ocorrencias: arquivos.length, arquivos }))
    .sort((a, b) => compararTexto(a.chave, b.chave));
  const esperado = celulasEsperadas.reduce((soma, celula) => soma + celula.esperados, 0);
  return {
    esperado,
    encontrado: linhas.length,
    diferenca: linhas.length - esperado,
    celulas: porCelula,
    celulasInesperadas: inesperadas,
    chavesDuplicadas: duplicadas,
    completa:
      linhas.length === esperado &&
      porCelula.every((celula) => celula.completa) &&
      inesperadas.length === 0 &&
      duplicadas.length === 0,
  };
}

/** Consolida qualquer coleção injetada; não lê nem grava arquivos. */
export function consolidarTopologia(itens, { celulasEsperadas = null, incluirRegistros = true } = {}) {
  if (!Array.isArray(itens)) throw new TypeError("itens deve ser um array");
  const linhas = itens.map(extrairTopologia).sort((a, b) =>
    compararTexto(a.chave, b.chave) || compararTexto(a.arquivo, b.arquivo),
  );
  const resultado = {
    cobertura: auditarCobertura(linhas, celulasEsperadas),
    geral: resumirLinhas(linhas),
    porCorpus: agrupar(linhas, ["corpus"]),
    porBraco: agrupar(linhas, ["braco"]),
    porCorpusEBraco: agrupar(linhas, ["corpus", "braco"]),
  };
  if (incluirRegistros) resultado.porRegistro = linhas;
  return resultado;
}

/** Atalho puro que ativa o denominador esperado de 630 registros. */
export function consolidarTopologia630(itens, opcoes = {}) {
  return consolidarTopologia(itens, { ...opcoes, celulasEsperadas: CELULAS_630 });
}

function tipoLinhaPorNumero(conteudo) {
  let emBloco = false;
  return String(conteudo).split(/\r?\n/).map((linha) => {
    const t = linha.trim();
    const iniciouEmBloco = emBloco;
    if (!emBloco && t.startsWith("/*")) emBloco = true;
    const comentario = iniciouEmBloco || emBloco || t.startsWith("//") || t.startsWith("*");
    if (emBloco && t.includes("*/")) emBloco = false;
    return comentario ? "comentario" : "codigo";
  });
}

/**
 * Busca estática pura em fontes já carregadas.
 * `fontes`: [{ arquivo, conteudo }]. Regexes são clonadas, logo não há estado
 * `lastIndex` compartilhado entre execuções ou propriedades.
 */
export function auditarTetosEstaticos(fontes, padroes = PADROES_TETO_ESTATICO) {
  if (!Array.isArray(fontes)) throw new TypeError("fontes deve ser um array");
  if (!Array.isArray(padroes)) throw new TypeError("padroes deve ser um array");
  const achados = [];
  for (const fonte of [...fontes].sort((a, b) => compararTexto(a.arquivo, b.arquivo))) {
    const conteudo = String(fonte.conteudo ?? "");
    const tipos = tipoLinhaPorNumero(conteudo);
    for (const padrao of padroes) {
      if (!(padrao.expressao instanceof RegExp)) throw new TypeError(`padrão ${padrao.id} sem RegExp`);
      const flags = [...new Set(`${padrao.expressao.flags}g`.split(""))].join("");
      const regex = new RegExp(padrao.expressao.source, flags);
      for (let match = regex.exec(conteudo); match; match = regex.exec(conteudo)) {
        const prefixo = conteudo.slice(0, match.index);
        const linha = prefixo.split(/\r?\n/).length;
        const inicioLinha = Math.max(prefixo.lastIndexOf("\n"), prefixo.lastIndexOf("\r")) + 1;
        const fimLinhaBruto = conteudo.indexOf("\n", match.index);
        const fimLinha = fimLinhaBruto < 0 ? conteudo.length : fimLinhaBruto;
        achados.push({
          padrao: padrao.id,
          familia: padrao.familia,
          arquivo: fonte.arquivo,
          linha,
          coluna: match.index - inicioLinha + 1,
          tipoLinha: tipos[linha - 1] ?? "codigo",
          trecho: conteudo.slice(inicioLinha, fimLinha).trim().slice(0, 500),
          correspondencia: match[0].slice(0, 200),
        });
        if (match[0].length === 0) regex.lastIndex += 1;
      }
    }
  }
  achados.sort(
    (a, b) =>
      compararTexto(a.arquivo, b.arquivo) ||
      a.linha - b.linha ||
      a.coluna - b.coluna ||
      compararTexto(a.padrao, b.padrao),
  );
  const resumoPadroes = padroes.map((padrao) => {
    const doPadrao = achados.filter((achado) => achado.padrao === padrao.id);
    return {
      id: padrao.id,
      familia: padrao.familia,
      descricao: padrao.descricao,
      regex: padrao.expressao.source,
      ocorrencias: doPadrao.length,
      ocorrenciasEmCodigo: doPadrao.filter((achado) => achado.tipoLinha === "codigo").length,
      ocorrenciasEmComentarios: doPadrao.filter((achado) => achado.tipoLinha === "comentario").length,
    };
  });
  const porFamilia = {};
  for (const achado of achados) {
    if (achado.tipoLinha !== "codigo") continue;
    porFamilia[achado.familia] = (porFamilia[achado.familia] ?? 0) + 1;
  }
  return {
    natureza: "busca de candidatos; cada ocorrência requer classificação manual de impacto",
    arquivosAuditados: [...new Set(fontes.map((fonte) => fonte.arquivo))].sort(compararTexto),
    padroesAuditados: resumoPadroes,
    ocorrencias: achados.length,
    ocorrenciasEmCodigo: achados.filter((achado) => achado.tipoLinha === "codigo").length,
    ocorrenciasEmComentarios: achados.filter((achado) => achado.tipoLinha === "comentario").length,
    porFamilia: Object.fromEntries(Object.entries(porFamilia).sort(([a], [b]) => compararTexto(a, b))),
    achados,
  };
}

/** Monta o objeto final a partir de entradas injetadas; continua 100% puro. */
export function montarAuditoriaTeto({ itens, fontes, arquivosFonteAusentes = [], incluirRegistros = true }) {
  const telemetria = consolidarTopologia630(itens, { incluirRegistros });
  const codigo = auditarTetosEstaticos(fontes);
  const ok =
    telemetria.cobertura?.completa === true &&
    telemetria.geral.telemetriaAusente === 0 &&
    telemetria.geral.telemetriaInvalida === 0 &&
    arquivosFonteAusentes.length === 0;
  return {
    esquema: ESQUEMA_AUDITORIA_TETO,
    estatuto: "reanálise exploratória offline dos registros congelados",
    interpretacao: {
      truncamentoPotencial:
        "passosGeradosPeloAgente − passosQueProducaoAplicaria, limitado inferiormente a zero, somente no regime livre",
      censura:
        "regime de produção não permite recuperar do campo agregado quantos passos existiam antes do corte",
      buscaEstatica:
        "ocorrência textual é candidato para revisão; não implica automaticamente perda topológica",
    },
    ok,
    telemetria,
    codigoEstatico: {
      escopoEsperado: ARQUIVOS_AUDITORIA_ESTATICA,
      arquivosAusentes: [...arquivosFonteAusentes].sort(compararTexto),
      escopoCompleto: arquivosFonteAusentes.length === 0,
      ...codigo,
    },
  };
}

/** IO somente-leitura dos 630 JSON; não altera os artefatos congelados. */
export function carregarRegistros630({ raiz = "." } = {}) {
  const itens = [];
  for (const celula of CELULAS_630) {
    const runsDir = path.resolve(raiz, celula.runsDir);
    if (!fs.existsSync(runsDir)) throw new Error(`diretório esperado ausente: ${runsDir}`);
    const arquivos = fs.readdirSync(runsDir).filter((nome) => nome.endsWith(".json")).sort(compararTexto);
    for (const nome of arquivos) {
      const absoluto = path.join(runsDir, nome);
      let registro;
      try {
        registro = JSON.parse(fs.readFileSync(absoluto, "utf8"));
      } catch (erro) {
        throw new Error(`JSON inválido em ${absoluto}: ${erro.message}`);
      }
      itens.push({
        registro,
        corpus: celula.corpus,
        dataset: celula.dataset,
        braco: celula.braco,
        arquivo: path.relative(path.resolve(raiz), absoluto),
      });
    }
  }
  return itens;
}

/** IO somente-leitura das fontes explicitamente declaradas. */
export function carregarFontesEstaticas({ raiz = ".", arquivos = ARQUIVOS_AUDITORIA_ESTATICA } = {}) {
  const fontes = [];
  const ausentes = [];
  for (const arquivo of arquivos) {
    const absoluto = path.resolve(raiz, arquivo);
    if (!fs.existsSync(absoluto)) {
      ausentes.push(arquivo);
      continue;
    }
    fontes.push({ arquivo, conteudo: fs.readFileSync(absoluto, "utf8") });
  }
  return { fontes, ausentes };
}

export function parseArgs(argv) {
  const opcoes = { raiz: ".", json: null, incluirRegistros: true, ajuda: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--ajuda" || arg === "--help" || arg === "-h") opcoes.ajuda = true;
    else if (arg === "--sem-detalhes") opcoes.incluirRegistros = false;
    else if (arg === "--raiz" || arg === "--json") {
      if (!argv[i + 1] || argv[i + 1].startsWith("--")) throw new Error(`${arg} exige um valor`);
      opcoes[arg.slice(2)] = argv[++i];
    } else throw new Error(`opção desconhecida: ${arg}`);
  }
  return opcoes;
}

export const AJUDA = `uso: node analysis/orientador-v08/auditar-teto.mjs [opções]

opções:
  --raiz <dir>       raiz do repositório (default: .)
  --json <arquivo>   grava o relatório derivado; sem esta opção, nada é gravado
  --sem-detalhes     omite a lista por registro do JSON/objeto
  --ajuda            mostra esta mensagem
`;

/** Casca CLI injetável para teste; retorna o relatório e o código sugerido. */
export function executarCli(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout ?? ((texto) => process.stdout.write(String(texto)));
  const opcoes = parseArgs(argv);
  if (opcoes.ajuda) {
    stdout(AJUDA);
    return { codigo: 0, resultado: null };
  }
  const itens = carregarRegistros630({ raiz: opcoes.raiz });
  const { fontes, ausentes } = carregarFontesEstaticas({ raiz: opcoes.raiz });
  const resultado = montarAuditoriaTeto({
    itens,
    fontes,
    arquivosFonteAusentes: ausentes,
    incluirRegistros: opcoes.incluirRegistros,
  });
  const g = resultado.telemetria.geral;
  stdout(
    `AUDITORIA DE TETO — ${g.registros}/${TOTAL_ESPERADO_630} registros; ` +
      `${g.contrafactual.grafosComTruncamentoPotencial} truncamentos potenciais; ` +
      `${g.contrafactual.passosPotencialmentePerdidos} passos potencialmente perdidos\n`,
  );
  stdout(
    `Telemetria ausente=${g.telemetriaAusente}; inválida=${g.telemetriaInvalida}; ` +
      `censurada=${g.contrafactual.censurados}; candidatos estáticos em código=${resultado.codigoEstatico.ocorrenciasEmCodigo}\n`,
  );
  if (opcoes.json) {
    const destino = path.resolve(opcoes.raiz, opcoes.json);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, `${JSON.stringify(resultado, null, 2)}\n`);
    stdout(`salvo em ${destino}\n`);
  } else {
    stdout("(somente leitura; use --json <arquivo> para gravar um artefato derivado)\n");
  }
  return { codigo: resultado.ok ? 0 : 1, resultado };
}

const ehMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (ehMain) {
  try {
    const { codigo } = executarCli();
    process.exitCode = codigo;
  } catch (erro) {
    console.error(`erro: ${erro.message}`);
    process.exitCode = 2;
  }
}
