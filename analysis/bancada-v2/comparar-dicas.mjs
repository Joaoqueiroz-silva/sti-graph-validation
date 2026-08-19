#!/usr/bin/env node
/**
 * analysis/bancada-v2/comparar-dicas.mjs — comparação de DICAS entre o grafo do
 * especialista e o grafo do agente (2026-08-19).
 *
 * PROBLEMA QUE ISTO RESOLVE. Até 18/08 a única métrica de dica da régua era
 * `dicasNoEstadoCerto`: PRESENÇA de dica no estado casado, com o texto NUNCA
 * comparado. Ela saturou em 1,000 em 9 das 10 células do experimento (única
 * exceção: flash-lite no 8.12, 0,754), porque o agent 6 escreve escada de
 * dicas em TODO passo. Uma métrica saturada não separa braço nenhum e não diz
 * se a dica ENSINA — mede só que existe alguma coisa escrita ali.
 *
 * UNIDADE DE ANÁLISE: o PAR (estado do especialista, passo do agente casado
 * com ele) — o mesmo casamento LCS da régua de estados (casarEstados). Só
 * estados casados entram: comparar a dica de um estado que o agente não criou
 * seria comparar com o vazio. Estados extras do agente ficam fora e são
 * contados à parte (`paresForaDaReferencia`).
 *
 * MÉTRICAS (calculadas IGUAIS para os dois lados, sobre os mesmos pares):
 *  - passosComDica ........ o lado escreveu >= 1 dica naquele estado
 *  - niveis ............... tamanho da escada (dicas por estado)
 *  - chars ................ comprimento médio da dica (caracteres)
 *  - bottomOutValor ....... a ÚLTIMA dica da escada contém o valor esperado do
 *                           passo (o "bottom-out" do CTAT: a dica que entrega o
 *                           que digitar). Regra léxica, casamento por token.
 *  - algumNivelValor ...... qualquer dica da escada contém o valor esperado
 *  - escadaCompleta ....... escada com >= 2 níveis em que a ÚLTIMA entrega o
 *                           valor e a PRIMEIRA não — a forma canônica da escada
 *                           de ajuda (orientação → bottom-out)
 *
 * SENSIBILIDADE DECLARADA: valores de 1 caractere ("1", "5") disparam
 * casamento léxico com facilidade; toda métrica de valor é reportada também
 * restrita a valores com >= 2 caracteres (sufixo `Val2`).
 *
 * PRÉ-REGISTRO: docs/PRE-REGISTRO-JUIZ-E-DICAS-2026-08-19.md. `bottomOutValor`
 * é POST HOC — nasceu de uma sondagem exploratória em 19/08; está declarada
 * como tal. As demais métricas foram fixadas antes de qualquer leitura.
 *
 * LIMITE DA RÉGUA LÉXICA: ela vê o valor escrito com dígitos. Uma dica que
 * entrega a resposta POR EXTENSO ("digite o número de irmãos") não é contada.
 * É por isso que existe o juiz pareado (juiz-dicas.mjs): o julgamento
 * pedagógico do conteúdo é dele, não desta contagem.
 *
 * Uso: node analysis/bancada-v2/comparar-dicas.mjs --mat <dir> [--rotulo x] [--json out]
 */
import fs from "node:fs";
import path from "node:path";
import { canonAnswer } from "../../schema.js";
import { carregarReferencia, intervalo, media } from "../validacao-v2/lib.mjs";
import { caminhoDeReferencia, casarEstados } from "./comparar-caminho.mjs";
import { problemsDirRelativo } from "../../dataset-config.js";

const escapar = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * O texto contém o valor como TOKEN? Fronteira exclui dígito, letra, ponto e
 * barra, para que "5" não case dentro de "1/5" nem de "15" nem de "0.5".
 * Formas aceitas: o valor bruto do `.brd` e a sua forma canônica (canonAnswer),
 * quando diferem.
 */
export function contemValor(texto, bruto) {
  const t = String(texto ?? "");
  const formas = [...new Set([String(bruto ?? "").trim(), canonAnswer(bruto)].filter((f) => f && f.length))];
  return formas.some((f) => new RegExp(`(?<![0-9A-Za-z./])${escapar(f)}(?![0-9A-Za-z./])`).test(t));
}

/** Escada do agente naquele passo (1-based), ordenada por nível. */
export function escadaDoAgente(grafo, passo1) {
  return (grafo?.dicas || [])
    .filter((d) => Number(d.passo) === passo1)
    .sort((a, b) => (Number(a.nivel) || 0) - (Number(b.nivel) || 0))
    .map((d) => String(d.texto ?? ""));
}

/** Métricas de UM lado sobre UMA escada. `bruto` = valor esperado do passo. */
export function medirEscada(escada, bruto) {
  const n = escada.length;
  const ultima = n ? escada[n - 1] : "";
  const primeira = n ? escada[0] : "";
  const bottomOut = n > 0 && contemValor(ultima, bruto);
  return {
    temDica: n > 0 ? 1 : 0,
    niveis: n,
    chars: n ? media(escada.map((h) => h.length)) : null,
    bottomOutValor: n > 0 ? (bottomOut ? 1 : 0) : null,
    algumNivelValor: n > 0 ? (escada.some((h) => contemValor(h, bruto)) ? 1 : 0) : null,
    escadaCompleta: n >= 2 ? (bottomOut && !contemValor(primeira, bruto) ? 1 : 0) : null,
  };
}

const LADOS = ["ref", "agente"];
const CAMPOS = ["temDica", "niveis", "chars", "bottomOutValor", "algumNivelValor", "escadaCompleta"];

/**
 * Pontua UM registro: devolve, por lado, a média das métricas sobre os pares
 * casados, e o detalhe par a par (para o juiz pareado consumir).
 */
export function pontuarDicas(run, envelopeB, refEx, { materializar = false } = {}) {
  const refCaminho = caminhoDeReferencia(envelopeB, refEx);
  const grafo = run.grafo || {};
  const passos = grafo.passos || [];
  const cas = casarEstados(refCaminho, passos, { materializar });
  const pares = [];
  for (const c of cas) {
    if (!c.avaliavel || c.agenteIdx === null) continue;
    const bruto = c.ref.bruto || c.ref.estado || "";
    const escadaRef = c.ref.dicasTexto || [];
    const escadaAg = escadaDoAgente(grafo, c.agenteIdx + 1);
    pares.push({
      ordemRef: c.ref.ordem,
      passoAgente: c.agenteIdx + 1,
      valor: bruto,
      valorLongo: String(bruto).trim().length >= 2,
      escadaRef,
      escadaAgente: escadaAg,
      ref: medirEscada(escadaRef, bruto),
      agente: medirEscada(escadaAg, bruto),
    });
  }
  const agregar = (lado, filtro = () => true) => {
    const sel = pares.filter(filtro);
    const out = {};
    for (const campo of CAMPOS) {
      const vs = sel.map((p) => p[lado][campo]).filter((v) => v !== null && v !== undefined);
      out[campo] = vs.length ? media(vs) : null;
    }
    return out;
  };
  const linha = { ex: run.exercicio ?? run.id, replica: run.replica ?? null, nPares: pares.length };
  for (const lado of LADOS) {
    const a = agregar(lado);
    const b = agregar(lado, (p) => p.valorLongo);
    for (const campo of CAMPOS) {
      linha[`${campo}_${lado}`] = a[campo];
      if (["bottomOutValor", "algumNivelValor", "escadaCompleta"].includes(campo)) {
        linha[`${campo}Val2_${lado}`] = b[campo];
      }
    }
  }
  // dicas do agente em passos que NÃO casaram com estado do especialista
  const casadosIdx = new Set(cas.filter((c) => c.agenteIdx !== null).map((c) => c.agenteIdx));
  linha.paresForaDaReferencia = passos.filter((_, i) => !casadosIdx.has(i)).length;
  return { linha, pares };
}

const COLUNAS = [];
for (const campo of CAMPOS) for (const lado of LADOS) COLUNAS.push(`${campo}_${lado}`);
for (const campo of ["bottomOutValor", "algumNivelValor", "escadaCompleta"]) for (const lado of LADOS) COLUNAS.push(`${campo}Val2_${lado}`);

export function analisarDicas(dirMat, { raiz = ".", rotulo = path.basename(dirMat) } = {}) {
  const REF = carregarReferencia(raiz);
  const runsDir = path.join(dirMat, "runs");
  const linhas = [];
  const paresTodos = [];
  for (const f of fs.readdirSync(runsDir).filter((x) => x.endsWith(".json")).sort()) {
    const r = JSON.parse(fs.readFileSync(path.join(runsDir, f), "utf8"));
    const ex = r.exercicio ?? r.id;
    if (!REF[ex] || !r.materializado?.grafo) continue;
    const envB = JSON.parse(fs.readFileSync(path.join(raiz, problemsDirRelativo(), ex, "envelope-b.json"), "utf8"));
    const { linha, pares } = pontuarDicas({ ...r, grafo: r.materializado.grafo }, envB, REF[ex]);
    linhas.push(linha);
    paresTodos.push({ ex, replica: r.replica ?? null, pares });
  }
  const agregado = Object.fromEntries(COLUNAS.map((c) => [c, intervalo(linhas, c)]));
  // diferença PAREADA agente − especialista, no mesmo par de estados
  const dif = linhas.map((l) => {
    const o = { ex: l.ex };
    for (const campo of CAMPOS) {
      o[campo] = l[`${campo}_agente`] === null || l[`${campo}_ref`] === null ? null : l[`${campo}_agente`] - l[`${campo}_ref`];
    }
    return o;
  });
  return {
    rotulo,
    n: linhas.length,
    exercicios: new Set(linhas.map((l) => l.ex)).size,
    paresPorGrafo: media(linhas.map((l) => l.nPares)),
    agregado,
    difAgenteMenosEspecialista: Object.fromEntries(CAMPOS.map((c) => [c, intervalo(dif, c)])),
    porRegistro: linhas,
    pares: paresTodos,
  };
}

const ehMain = process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (ehMain) {
  const argv = process.argv.slice(2);
  const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
  const dir = opt("--mat", null);
  if (!dir) { console.error("uso: --mat <dir> [--rotulo x] [--json out]"); process.exit(2); }
  const R = analisarDicas(dir, { rotulo: opt("--rotulo", path.basename(dir)) });
  const f = (x) => (x?.estimativa === null || x?.estimativa === undefined ? "  N/A" : x.estimativa.toFixed(3));
  console.log(`\nDICAS — ${R.rotulo}: ${R.n} grafos, ${R.exercicios} exercícios, ${R.paresPorGrafo.toFixed(2)} pares casados/grafo`);
  console.log("  métrica                        especialista   agente");
  for (const campo of CAMPOS) {
    console.log(`  ${campo.padEnd(30)} ${f(R.agregado[`${campo}_ref`]).padStart(8)}   ${f(R.agregado[`${campo}_agente`]).padStart(8)}`);
  }
  const saida = opt("--json", null);
  if (saida) { fs.writeFileSync(saida, JSON.stringify(R, null, 1)); console.log(`  salvo em ${saida}`); }
}
