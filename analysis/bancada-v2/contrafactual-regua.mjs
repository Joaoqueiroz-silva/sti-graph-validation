#!/usr/bin/env node
/**
 * analysis/bancada-v2/contrafactual-regua.mjs — TABELA CONTRAFACTUAL da régua
 * (2026-08-18, exigido pela auditoria adversarial).
 *
 * POR QUE EXISTE. O caminho de referência do especialista foi redefinido três
 * vezes DEPOIS de ver dados (sentinelas 15/08; ações do tutor via <Actor>
 * 16/08; seletor de variante 17/08) e a régua de erros ganhou duas exclusões
 * (18/08). Nenhuma dessas decisões pode ficar implícita: um revisor precisa ver
 * o que os MESMOS grafos dariam sob cada definição. Este script recomputa os
 * registros já materializados sob quatro definições encaixadas do denominador:
 *
 *   R0 "tudo"      — toda aresta correta do .brd é estado de valor (nenhuma
 *                    exclusão): a régua ingênua, antes de qualquer decisão.
 *   R1 +mecânicas  — fora as entradas sentinela do CTAT ("", "-", "-1").
 *   R2 +tutor      — fora também as arestas cujo <Actor> é o tutor / ações de
 *                    sistema (setDisplay, set_maximum, No_Action…).
 *   R3 +variante   — fora também o seletor de variante do problema (shield).
 *                    É a RÉGUA VIGENTE.
 *
 * Cada nível é um SUPERCONJUNTO de exclusões do anterior; a tabela mostra o
 * quanto cada decisão moveu o resultado, no mesmo dado. Nada aqui recoleta.
 */
import fs from "node:fs";
import path from "node:path";
import { carregarReferencia, intervalo, fmt } from "../validacao-v2/lib.mjs";
import { casarEstados } from "./comparar-caminho.mjs";

export const NIVEIS = [
  { id: "R0", nome: "tudo (sem exclusão)", filtro: () => true },
  { id: "R1", nome: "+ mecânicas fora", filtro: (c) => !c.mecanico },
  { id: "R2", nome: "+ ações do tutor fora", filtro: (c) => !c.mecanico && !(c.sistema && !c.variante) },
  { id: "R3", nome: "+ seletor de variante fora (VIGENTE)", filtro: (c) => !c.mecanico && !c.sistema },
];

/** Pontua cobertura/íntegro de um grafo sob um filtro de estado de valor. */
export function pontuarSobFiltro(grafo, refEx, filtro) {
  const refCaminho = (refEx.caminho || []).map((c) => ({
    ordem: c.ordem,
    estado: c.valor,
    comResposta: filtro(c) && !!c.valor,
    dicas: c.dicas || 0,
  }));
  const cas = casarEstados(refCaminho, grafo.passos || []);
  const avaliaveis = cas.filter((c) => c.avaliavel);
  const casados = avaliaveis.filter((c) => c.agenteIdx !== null);
  return {
    nRef: avaliaveis.length,
    cobertura: avaliaveis.length ? casados.length / avaliaveis.length : null,
    integro: avaliaveis.length && casados.length === avaliaveis.length ? 1 : 0,
  };
}

export function contrafactual(dirMat, raiz = ".") {
  const REF = carregarReferencia(raiz);
  const runs = path.join(path.isAbsolute(dirMat) ? dirMat : path.join(raiz, dirMat), "runs");
  const linhas = [];
  for (const f of fs.readdirSync(runs).filter((x) => x.endsWith(".json")).sort()) {
    const r = JSON.parse(fs.readFileSync(path.join(runs, f), "utf8"));
    const ex = r.exercicio ?? r.id;
    const grafo = r.materializado?.grafo || r.grafo;
    if (!REF[ex] || !grafo) continue;
    const linha = { ex, replica: r.replica };
    for (const n of NIVEIS) {
      const p = pontuarSobFiltro(grafo, REF[ex], n.filtro);
      linha[`cob_${n.id}`] = p.cobertura;
      linha[`int_${n.id}`] = p.integro;
      linha[`nref_${n.id}`] = p.nRef;
    }
    linhas.push(linha);
  }
  return linhas;
}

/** Resume os registros com a mesma unidade/reamostragem das demais tabelas. */
export function resumirContrafactual(linhas) {
  return Object.fromEntries(NIVEIS.map((nivel) => {
    const nrefs = linhas.map((linha) => linha[`nref_${nivel.id}`]).filter(Number.isFinite);
    return [nivel.id, {
      n: linhas.length,
      exercicios: new Set(linhas.map((linha) => linha.ex)).size,
      nRef: {
        media: nrefs.length ? nrefs.reduce((s, x) => s + x, 0) / nrefs.length : null,
        minimo: nrefs.length ? Math.min(...nrefs) : null,
        maximo: nrefs.length ? Math.max(...nrefs) : null,
      },
      recall: intervalo(linhas, `cob_${nivel.id}`),
      contencao: intervalo(linhas, `int_${nivel.id}`),
    }];
  }));
}

/** Artefato determinístico completo, sem o carimbo de geração. */
export function analisarContrafactual({ dirMat, raiz = "." }) {
  const linhas = contrafactual(dirMat, raiz);
  const versao = path.basename(dirMat).match(/^materializado-(v\d+)-/)?.[1] ?? "não identificada";
  return {
    metodologia: {
      unidade: "registro (grafo materializado)",
      intervalo: "BCa 95% em cluster de exercício, 10000 reamostragens, seed 42",
      recall: "comprimento da LCS 1:1 / estados de referência admitidos no nível",
      contencao: "1 quando todos os estados admitidos no nível aparecem em ordem; 0 caso contrário",
      nRef: "número de estados de referência admitidos no nível (média e amplitude entre registros)",
      niveis: Object.fromEntries(NIVEIS.map((n) => [n.id, n.nome])),
    },
    fonte: { dir: dirMat, versaoMaterializacao: versao },
    niveis: NIVEIS.map((n) => n.id),
    linhas,
    agregado: resumirContrafactual(linhas),
  };
}

const ehMain = process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (ehMain) {
  const argv = process.argv.slice(2);
  const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
  const dir = opt("--mat", null);
  if (!dir) { console.error("uso: --mat <dir materializado> [--json out]"); process.exit(2); }
  const R = analisarContrafactual({ dirMat: dir });
  const { linhas, agregado } = R;
  console.log(`CONTRAFACTUAL DA RÉGUA — ${path.basename(dir)} — ${linhas.length} grafos`);
  console.log("nível                                    nRef média [min–máx]   recall                    contenção do caminho");
  for (const n of NIVEIS) {
    const a = agregado[n.id];
    const nref = `${a.nRef.media.toFixed(1)} [${a.nRef.minimo}–${a.nRef.maximo}]`;
    console.log(
      `  ${n.id} ${n.nome.padEnd(36)} ${nref.padStart(18)}   ${fmt(a.recall).padEnd(26)} ${fmt(a.contencao)}`
    );
  }
  const out = opt("--json", null);
  if (out) fs.writeFileSync(out, JSON.stringify({ gerado: new Date().toISOString(), ...R }, null, 1));
}
