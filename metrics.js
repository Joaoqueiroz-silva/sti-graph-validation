/**
 * evaluation/metrics.js — Semelhança entre dois grafos.
 *
 * Tokeniza cada grafo neutro em conjuntos de "itens" (nós) e "transições"
 * (arestas), alinha por chave canônica e calcula precisão/recall/F1, Jaccard e
 * uma distância de edição aproximada (GED).
 *
 * 2026-06-30 (handoff validação, T4/T9) — MÉTRICA PRIMÁRIA = RECALL (completude),
 * não mais o F1. Para uma ferramenta GENERATIVA (cujo valor é enriquecer a
 * cobertura de erros), a simetria do F1 é o defeito: precision pune o robô por
 * ter misconceptions a mais, conflando "extra válido não-catalogado" com "extra
 * errado" — é a função de perda errada (Tversky 1977: recall = contenção
 * direcional, α=0, β=1). Quem decide se um extra é alucinação ou enriquecimento
 * é o juiz cego (judge-misconceptions.js), nunca a precision. O F1 continua
 * CALCULADO e reportado ao lado (linha auditável), e recall é separado por TIPO
 * (passos vs misconceptions — falhas independentes, §3.6).
 *
 * Nota sobre a banda HH: recall é assimétrico (recall(Ei→Ej) ≠ recall(Ej→Ei)) —
 * a banda humano–humano deve ser computada NAS DUAS direções de cada par
 * (ver run-ctat-eval.mjs).
 */

import { toNeutral } from "./schema.js";

/**
 * Conjuntos de tokens de nós e de arestas a partir de um grafo neutro.
 * `opts.excludeMechanical` omite as misconceptions mecânicas de interface (-1, -) —
 * usado para o F1 CONCEITUAL (ver pré-registro §8). Aplicado simetricamente aos dois
 * lados; como só o especialista marca `mechanical`, na prática só afeta o lado dele.
 */
export function tokens(neutral, opts = {}) {
  const node = new Set();
  for (const s of neutral.steps) node.add("step|" + s.key);
  for (const m of neutral.misconceptions) {
    if (opts.excludeMechanical && m.mechanical) continue;
    node.add("misc|" + m.key);
  }
  const edge = new Set();
  for (const t of neutral.transitions) edge.add(t.from + ">" + t.to + "|" + t.role);
  return { node, edge };
}

/** Matriz de confusão entre dois conjuntos (ref = verdade, cand = candidato). */
export function confusion(ref, cand) {
  const matched = [];
  const refOnly = [];
  const candOnly = [];
  for (const x of ref) (cand.has(x) ? matched : refOnly).push(x);
  for (const x of cand) if (!ref.has(x)) candOnly.push(x);
  return {
    matched,
    refOnly,
    candOnly,
    tp: matched.length,
    fn: refOnly.length,
    fp: candOnly.length,
  };
}

/** Precisão, recall e F1 a partir de tp/fp/fn. Conjuntos vazios → 1 (iguais). */
export function prf({ tp, fp, fn }) {
  if (tp + fp + fn === 0) return { precision: 1, recall: 1, f1: 1 };
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1 };
}

/** Alinha dois grafos neutros e devolve as confusões de nós e arestas. */
export function align(refNeutral, candNeutral, opts = {}) {
  const R = tokens(refNeutral, opts);
  const C = tokens(candNeutral, opts);
  return { node: confusion(R.node, C.node), edge: confusion(R.edge, C.edge) };
}

/** Confusão restrita a um subconjunto de tokens de nó (por prefixo "step|"/"misc|"). */
function confusionOf(conf, prefix) {
  const has = (t) => t.startsWith(prefix);
  return {
    tp: conf.matched.filter(has).length,
    fn: conf.refOnly.filter(has).length,
    fp: conf.candOnly.filter(has).length,
  };
}

/**
 * Compara dois grafos (em qualquer formato aceito por toNeutral) e devolve as
 * métricas. PRIMÁRIA = `recallMisconceptions` (completude: quanto da referência o
 * candidato COBRE); `recallSteps` reportado separado (§3.6 — falhas independentes).
 * O F1 (`similarity`) segue calculado como linha auditável.
 */
export function compareGraphs(refInput, candInput, meta = {}) {
  const ref = toNeutral(refInput, { source: meta.ref || "ref" });
  const cand = toNeutral(candInput, { source: meta.cand || "cand" });
  const a = align(ref, cand);
  const nodeScore = prf(a.node);
  const edgeScore = prf(a.edge);
  const jaccard = a.node.tp / (a.node.tp + a.node.fp + a.node.fn || 1);
  const ged = a.node.fp + a.node.fn + a.edge.fp + a.edge.fn;

  // Recall SEPARADO por tipo (T9): cobrir os erros e cobrir os passos são falhas
  // independentes — um robô pode prever todos os erros e perder um passo, ou vice-versa.
  const stepsPrf = prf(confusionOf(a.node, "step|"));
  const miscPrf = prf(confusionOf(a.node, "misc|"));

  // CONCEITUAL: mesma comparação, omitindo as misconceptions mecânicas de interface
  // (-1, -) do especialista. Reportado AO LADO do cru (nunca o substitui) — auditável,
  // anti-gaming. Ver pré-registro §8.
  const aConc = align(ref, cand, { excludeMechanical: true });
  const nodeScoreConc = prf(aConc.node);
  const miscPrfConc = prf(confusionOf(aConc.node, "misc|"));

  const miscOf = (t) => t.startsWith("misc|");
  return {
    // ── PRIMÁRIAS (completude direcional: cand cobre ref) ──
    recallMisconceptions: round(miscPrf.recall),
    recallMisconceptionsConceptual: round(miscPrfConc.recall),
    recallSteps: round(stepsPrf.recall),
    // ── auditáveis ao lado ──
    similarity: round(nodeScore.f1),
    nodeF1: round(nodeScore.f1),
    nodeF1Conceptual: round(nodeScoreConc.f1),
    precisionConceptual: round(nodeScoreConc.precision),
    recallConceptual: round(nodeScoreConc.recall),
    edgeF1: round(edgeScore.f1),
    precision: round(nodeScore.precision),
    recall: round(nodeScore.recall),
    jaccard: round(jaccard),
    ged,
    counts: { node: { tp: a.node.tp, fp: a.node.fp, fn: a.node.fn } },
    detail: {
      node: a.node,
      edge: a.edge,
      // QUAL erro o candidato deixou de prever / inventou (relativo à referência)
      missingMisconceptions: a.node.refOnly.filter(miscOf).map((t) => t.slice(5)),
      extraMisconceptions: a.node.candOnly.filter(miscOf).map((t) => t.slice(5)),
    },
  };
}

function round(x) {
  return Math.round(x * 1000) / 1000;
}
