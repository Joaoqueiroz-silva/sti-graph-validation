/**
 * analysis/bancada-v2/comparar-justo.mjs — BANCADA CTAT v2: comparação JUSTA
 * entre o grafo do agente e o grafo do especialista (2026-08-14).
 *
 * Complementar (não concorrente) à trilha de fidelidade da cadeia
 * (docs/PLANO-FIDELIDADE-PRODUCAO-2026-08.md): aquela melhora COMO os
 * candidatos são gerados; esta corrige COMO qualquer candidato é pontuado. O
 * comparador histórico (metrics.js / validacao-v2) fica intocado para
 * comparabilidade; este é um módulo novo, de reanálise pura (zero chamadas).
 *
 * Antídotos implementados (um por injustiça diagnosticada nos RESULTADOS.md
 * de resultados/comparacao-modelos-* e comparacao-fluxo-*):
 *  1. PRODUTO contra produto — o conjunto candidato pode incluir o catálogo
 *     stepDiagnostics preservado em bruto.tracos (o que a materialização
 *     entrega ao grafo final), não só os erros do estágio graphforge;
 *  2. posição JUSTA — o "passo certo" é posição RELATIVA no caminho com
 *     tolerância, imune à diferença de granularidade (9 vs 4 passos);
 *  3. precisão sem punir o sem-teto — precision@k no orçamento do
 *     especialista (k = nº de erros do gabarito), além da precisão bruta;
 *  4. simetria — cobertura MÚTUA (agente cobre especialista E especialista
 *     cobre agente) com teste de EQUIVALÊNCIA TOST: margem pré-declarada,
 *     IC 90% por bootstrap em cluster de exercício.
 *
 * REGRAS PRÉ-DECLARADAS (fixadas antes de qualquer resultado desta bancada;
 * mudá-las depois de olhar números é seleção pós-hoc):
 */
export const TOLERANCIA_PRIMARIA = 0.2; // posição relativa (0,10 e 0,15 descritivas)
export const MARGEM_EQUIVALENCIA = 0.1; // TOST: |Δ| < 0,10 com IC 90% dentro da margem
export const BETA = 2; // F-beta: faltar erro custa mais que sobrar (docs/VALIDACAO... §4.3)

import fs from "node:fs";
import path from "node:path";
import {
  carregarReferencia,
  intervalo,
  media,
  fmt,
  prng,
  canonAnswer,
} from "../validacao-v2/lib.mjs";

const temTemplate = (s) => /\{[^}]*\}/.test(String(s ?? ""));

/**
 * Conjunto candidato de um registro do contrato v2.
 * conjunto="estagio": só os erros que entraram no grafo autorado.
 * conjunto="produto": estágio + catálogo stepDiagnostics concreto (sem
 * template) preservado em bruto.tracos — o material que a materialização de
 * produção entrega ao grafo final (limite superior de entrega; a taxa real
 * medida na plataforma é ~59-86%, ver resultados/avaliacao-plataforma-*).
 *
 * Dedup por (valor canônico, passo) — NUNCA só por valor: o mesmo valor em
 * passos diferentes são candidatos posicionais distintos (auditoria
 * 2026-08-14: dedup por valor destruía a diversidade posicional e derrubava
 * a cobertura justa artificialmente).
 *
 * Convenção de posição: passoRel = (passo-1)/nPassos — a MESMA da referência
 * (idx do estado ANTES do passo em carregarReferencia). O 2b histórico do
 * validar.mjs usa passo/nPassos (estado depois); a diferença é 1/n e está
 * documentada aqui de propósito.
 */
export function candidatosDoRegistro(run, { conjunto = "produto" } = {}) {
  const nPassos = (run.grafo?.passos || []).length || 1;
  const vistos = new Map();
  let rank = 0;
  const push = (valorBruto, passo, origem) => {
    const valor = canonAnswer(String(valorBruto ?? "").trim());
    if (!valor) return;
    const p = Number(passo);
    const cand = {
      valor,
      bruto: String(valorBruto),
      passo: Number.isFinite(p) && p >= 1 ? p : null,
      passoRel: Number.isFinite(p) && p >= 1 ? (p - 1) / nPassos : null,
      origem,
      rank: rank++,
    };
    const chave = `${valor}@${cand.passo}`;
    if (!vistos.has(chave)) vistos.set(chave, cand);
  };
  for (const e of run.grafo?.erros || []) push(e.valor, e.passo, "grafo");
  if (conjunto === "produto") {
    for (const sol of run.bruto?.tracos?.atRiskTrace?.solutions || []) {
      for (const b of sol.stepDiagnostics || []) {
        for (const err of b.errors || []) {
          if (temTemplate(err.wrongAnswerPattern)) continue;
          push(err.wrongAnswerPattern, b.step, "catalogo");
        }
      }
    }
  }
  return { candidatos: [...vistos.values()], nPassos };
}

/**
 * Pareamento 1-para-1 (guloso por menor distância de posição): um item da
 * referência casa com um candidato se o VALOR canônico coincide e a posição
 * relativa difere no máximo `tol`. Candidato sem posição (catálogo sem step)
 * só casa quando tol = Infinity (nível valor).
 */
export function parear(refItems, candidatos, { tol = TOLERANCIA_PRIMARIA } = {}) {
  const usados = new Set();
  const pares = [];
  for (const r of refItems) {
    let melhor = null;
    let melhorDist = Infinity;
    for (const c of candidatos) {
      if (usados.has(c) || c.valor !== r.valor) continue;
      const dist =
        c.passoRel === null || r.passoRel === null || r.passoRel === undefined
          ? tol === Infinity
            ? 0
            : Infinity
          : Math.abs(c.passoRel - r.passoRel);
      if (dist <= tol && dist < melhorDist) {
        melhor = c;
        melhorDist = dist;
      }
    }
    if (melhor) {
      usados.add(melhor);
      pares.push({ ref: r, cand: melhor, dist: melhorDist });
    }
  }
  return { pares, casadosCand: usados };
}

const fbeta = (p, r, beta = BETA) => {
  const b2 = beta * beta;
  return b2 * p + r ? ((1 + b2) * p * r) / (b2 * p + r) : 0;
};

/** Pontua UM registro contra a referência do seu exercício. */
export function pontuarRun(run, refEx, { conjunto = "produto", tol = TOLERANCIA_PRIMARIA } = {}) {
  const { candidatos } = candidatosDoRegistro(run, { conjunto });
  const ref = refEx.items;
  const pos = parear(ref, candidatos, { tol });
  const valorSo = parear(ref, candidatos, { tol: Infinity });
  const k = ref.length;
  const topK = [...candidatos].sort((a, b) => a.rank - b.rank).slice(0, k);
  const atK = parear(ref, topK, { tol });

  const cobertura = ref.length ? pos.pares.length / ref.length : 0;
  const precisao = candidatos.length ? pos.pares.length / candidatos.length : 0;
  return {
    ex: run.exercicio ?? run.id,
    coberturaJusta: cobertura, // agente cobre especialista (valor + posição)
    coberturaValor: ref.length ? valorSo.pares.length / ref.length : 0,
    expertCobreAgente: precisao, // simétrico: mesmo pareamento, base = candidatos
    precisaoAtK: k ? atK.pares.length / k : 0,
    f2Justa: fbeta(precisao, cobertura),
    nCandidatos: candidatos.length,
    nRef: ref.length,
  };
}

/**
 * TOST por bootstrap em cluster de exercício: equivalência entre dois campos
 * pareados por run. Equivalente se o IC 90% da diferença média couber inteiro
 * em [-margem, +margem] (dois testes unilaterais a 5%).
 */
export function tostEquivalencia(
  linhas,
  campoA,
  campoB,
  { margem = MARGEM_EQUIVALENCIA, seed = 42, B = 10000 } = {}
) {
  const chaves = [...new Set(linhas.map((l) => l.ex))];
  const porEx = {};
  for (const l of linhas) (porEx[l.ex] = porEx[l.ex] || []).push(l[campoA] - l[campoB]);
  const obs = media(linhas.map((l) => l[campoA] - l[campoB]));
  const rnd = prng(seed);
  const boot = [];
  for (let b = 0; b < B; b++) {
    const acc = [];
    for (let i = 0; i < chaves.length; i++) {
      const e = chaves[Math.floor(rnd() * chaves.length)];
      for (const v of porEx[e]) acc.push(v);
    }
    boot.push(media(acc));
  }
  boot.sort((a, b) => a - b);
  const q = (p) => boot[Math.min(boot.length - 1, Math.max(0, Math.round((boot.length - 1) * p)))];
  const ci90 = [q(0.05), q(0.95)];
  return {
    diferencaMedia: obs,
    ci90,
    margem,
    equivalente: ci90[0] >= -margem && ci90[1] <= margem,
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────────
const ehMain = process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (ehMain) {
  const argv = process.argv.slice(2);
  const opt = (k, d) => {
    const i = argv.indexOf(k);
    return i >= 0 ? argv[i + 1] : d;
  };
  const dir = opt("--runs", null);
  const raiz = opt("--raiz", ".");
  const conjunto = opt("--conjunto", "produto");
  const tol = parseFloat(opt("--tol", String(TOLERANCIA_PRIMARIA)));
  const saida = opt("--json", null);
  const rotulo = opt("--rotulo", path.basename(path.dirname(dir || ".")));
  if (!dir) {
    console.error(
      "uso: node analysis/bancada-v2/comparar-justo.mjs --runs <dir> [--conjunto produto|estagio] [--tol 0.2] [--rotulo x] [--json out]"
    );
    process.exit(2);
  }
  const REF = carregarReferencia(raiz);
  const linhas = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
    const run = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const ex = run.exercicio ?? run.id;
    if (!REF[ex] || !run.grafo) continue;
    linhas.push(pontuarRun(run, REF[ex], { conjunto, tol }));
  }
  if (!linhas.length) {
    console.error("nenhum registro do contrato v2 casou com o corpus");
    process.exit(2);
  }
  const tost = tostEquivalencia(linhas, "coberturaJusta", "expertCobreAgente");
  const L = (t, campo) => console.log(`  ${t.padEnd(42)} ${fmt(intervalo(linhas, campo))}`);
  console.log("═".repeat(78));
  console.log(`BANCADA v2 — comparação justa | braço: ${rotulo} | conjunto: ${conjunto} | tol ±${tol}`);
  console.log(`  ${linhas.length} registros | candidatos/registro: ${media(linhas.map((l) => l.nCandidatos)).toFixed(2)} | referência: ${media(linhas.map((l) => l.nRef)).toFixed(2)}`);
  console.log("═".repeat(78));
  L("cobertura justa (valor + posição ±tol)", "coberturaJusta");
  L("cobertura por valor (sem posição)", "coberturaValor");
  L("simétrica: agente coberto pelo especialista", "expertCobreAgente");
  L("precisão@k (orçamento do especialista)", "precisaoAtK");
  L(`F${BETA} justa`, "f2Justa");
  console.log("─".repeat(78));
  console.log(
    `  EQUIVALÊNCIA (TOST, margem ±${MARGEM_EQUIVALENCIA}): Δ médio ${tost.diferencaMedia.toFixed(4)} ` +
      `IC90 [${tost.ci90[0].toFixed(4)}; ${tost.ci90[1].toFixed(4)}] → ` +
      (tost.equivalente ? "EQUIVALENTES dentro da margem" : "equivalência NÃO demonstrada")
  );
  if (saida) {
    fs.writeFileSync(
      saida,
      JSON.stringify(
        {
          gerado: new Date().toISOString(),
          rotulo,
          conjunto,
          tolerancia: tol,
          regrasPreDeclaradas: { TOLERANCIA_PRIMARIA, MARGEM_EQUIVALENCIA, BETA },
          metricas: Object.fromEntries(
            ["coberturaJusta", "coberturaValor", "expertCobreAgente", "precisaoAtK", "f2Justa"].map(
              (c) => [c, intervalo(linhas, c)]
            )
          ),
          tost,
          porExercicio: linhas,
        },
        null,
        1
      )
    );
    console.log(`  salvo em ${saida}`);
  }
}
