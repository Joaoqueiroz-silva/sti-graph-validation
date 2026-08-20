/** Métricas de dicas ancoradas e ledger auditável de extras por ocorrência. */
import {
  extrairAtomosCtat,
  extrairAtomosMaterializados,
  extrairErrosCtat,
  extrairErrosMaterializados,
  coberturaResolucaoMaterializada,
  coberturaFamiliasAcao,
} from "./atomos.mjs";
import { alinharReguas, parearErrosUmParaUm } from "./alinhamento.mjs";
import { canonAnswer } from "../../schema.js";

const escaparRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function contemValorComoToken(texto, valor) {
  const bruto = String(valor ?? "").trim();
  const formas = [...new Set([bruto, canonAnswer(bruto)].filter(Boolean))];
  return formas.some((forma) =>
    new RegExp(`(?<![0-9A-Za-z./])${escaparRegex(forma)}(?![0-9A-Za-z./])`).test(String(texto ?? "")),
  );
}

function razao(numerador, denominador) {
  return denominador ? numerador / denominador : null;
}

function f1(precision, recall) {
  return precision !== null && recall !== null && precision + recall
    ? (2 * precision * recall) / (precision + recall)
    : precision === 0 && recall === 0
      ? 0
      : null;
}

function escada(atom) {
  return [...(atom?.hints || [])].sort((a, b) =>
    (Number(a.nivel) || 0) - (Number(b.nivel) || 0) || a.indice - b.indice,
  );
}

/** Compara somente escadas cujos estados foram alinhados um-para-um. */
export function medirDicasAncoradas(atomosCtat, atomosMaterializados, alinhamento) {
  const pairs = alinhamento.matches.map((match) => {
    const ref = atomosCtat[match.refIndex];
    const agent = atomosMaterializados[match.agentIndex];
    const referenceHints = escada(ref);
    const materializedHints = escada(agent);
    const value = ref.rawValue || ref.value;
    const first = materializedHints[0]?.texto || "";
    const last = materializedHints.at(-1)?.texto || "";
    return {
      refIndex: match.refIndex,
      agentIndex: match.agentIndex,
      refId: ref.id,
      agentId: agent.id,
      tier: match.tier,
      value: ref.value,
      referenceHints,
      materializedHints,
      referenceHintCount: referenceHints.length,
      materializedHintCount: materializedHints.length,
      referenceHasHints: referenceHints.length > 0,
      materializedHasHints: materializedHints.length > 0,
      anyMaterializedHintContainsValue: materializedHints.some((h) => contemValorComoToken(h.texto, value)),
      bottomOutContainsValue: materializedHints.length > 0 && contemValorComoToken(last, value),
      completeLadder:
        materializedHints.length >= 2 &&
        contemValorComoToken(last, value) &&
        !contemValorComoToken(first, value),
    };
  });

  const alignedAgent = new Set(alinhamento.matches.map((m) => m.agentIndex));
  const ineligibleAgent = new Set(alinhamento.ineligibleMaterialized || []);
  const refWithHints = atomosCtat.filter((a) => a.hints?.length).length;
  const agentWithHints = atomosMaterializados.filter((a) => a.hints?.length).length;
  const alignedRefWithHints = pairs.filter((p) => p.referenceHasHints).length;
  const alignedAgentWithHints = pairs.filter((p) => p.materializedHasHints).length;
  const bothWithHints = pairs.filter((p) => p.referenceHasHints && p.materializedHasHints).length;
  const precisionPresence = razao(bothWithHints, agentWithHints);
  const recallPresence = razao(bothWithHints, refWithHints);

  const extraHints = [];
  for (const atom of atomosMaterializados) {
    const hints = escada(atom);
    if (!alignedAgent.has(atom.index)) {
      const unresolved = ineligibleAgent.has(atom.index);
      hints.forEach((hint) => extraHints.push({
        atom,
        hint,
        reason: unresolved ? "unresolved_operational_state" : "unmatched_state",
        isExtra: !unresolved,
      }));
      continue;
    }
    const pair = pairs.find((p) => p.agentIndex === atom.index);
    const limiteReferencia = pair?.referenceHintCount ?? 0;
    hints.slice(limiteReferencia).forEach((hint) => extraHints.push({
      atom,
      hint,
      reason: limiteReferencia ? "beyond_reference_ladder" : "no_reference_hint",
      isExtra: true,
    }));
  }

  return {
    pairs,
    extraHints,
    metrics: {
      referenceStatesWithHints: refWithHints,
      materializedStatesWithHints: agentWithHints,
      alignedReferenceStatesWithHints: alignedRefWithHints,
      alignedMaterializedStatesWithHints: alignedAgentWithHints,
      alignedStatesWithHintsOnBothSides: bothWithHints,
      presencePrecision: precisionPresence,
      presenceRecall: recallPresence,
      presenceF1: f1(precisionPresence, recallPresence),
      referenceMessages: atomosCtat.reduce((n, a) => n + (a.hints?.length || 0), 0),
      materializedMessages: atomosMaterializados.reduce((n, a) => n + (a.hints?.length || 0), 0),
      extraMaterializedMessages: extraHints.filter((h) => h.isExtra).length,
      unresolvedMaterializedMessages: extraHints.filter((h) => !h.isExtra).length,
      alignedLaddersWithAnyValueLeakage: pairs.filter((p) => p.anyMaterializedHintContainsValue).length,
      alignedBottomOutsWithValue: pairs.filter((p) => p.bottomOutContainsValue).length,
      alignedCompleteLadders: pairs.filter((p) => p.completeLadder).length,
    },
  };
}

function metadataDoRegistro(registro, override = {}) {
  return {
    corpus: override.corpus ?? registro?.corpus ?? registro?.dataset ?? null,
    arm: override.arm ?? registro?.modelos?.perfil ?? null,
    exercise: override.exercise ?? registro?.exercicio ?? registro?.id ?? null,
    replica: override.replica ?? registro?.replica ?? null,
    stage: override.stage ?? "materializado",
  };
}

function baseRow(meta, type, localId, extra = {}) {
  const occurrenceId = [
    meta.corpus ?? "corpus-na",
    meta.arm ?? "arm-na",
    meta.exercise ?? "exercise-na",
    `r${meta.replica ?? "na"}`,
    meta.stage,
    type,
    localId,
  ].join(":");
  return { ...meta, type, occurrenceId, judgment: "inventory_only", isExtra: true, ...extra };
}

/**
 * Um registro por ocorrência; nenhuma deduplicação entre réplicas. Dicas além
 * da escada especialista são extras apenas por cardinalidade, nunca por texto.
 */
export function construirLedgerExtras({
  registro,
  atomosCtat,
  atomosMaterializados,
  alinhamento,
  erros,
  dicas,
  metadata = {},
  incluirInventarioEstrutural = false,
}) {
  const meta = metadataDoRegistro(registro, metadata);
  const rows = [];
  const agentToRef = new Map(alinhamento.matches.map((m) => [m.agentIndex, m.refIndex]));
  const ineligibleAgent = new Set(alinhamento.ineligibleMaterialized || []);

  for (const agentIndex of alinhamento.unmatchedMaterialized) {
    const atom = atomosMaterializados[agentIndex];
    const unresolved = ineligibleAgent.has(agentIndex);
    rows.push(baseRow(meta, "state", atom.id, {
      agentStateId: atom.id,
      parentRefId: null,
      value: atom.value,
      text: atom.description,
      source: atom.source,
      reason: unresolved
        ? `unresolved_operational_state:${atom.status ?? atom.targetResolution ?? "unknown"}`
        : "unmatched_materialized_state",
      isExtra: !unresolved,
    }));
  }

  for (const error of erros.unmatchedMaterialized) {
    const mappedRefIndex = agentToRef.get(error.parentAgentIndex);
    const unresolved = ineligibleAgent.has(error.parentAgentIndex);
    rows.push(baseRow(meta, "error", `${error.parentAgentId}:${error.localIndex}`, {
      agentStateId: error.parentAgentId,
      parentRefId: Number.isInteger(mappedRefIndex) ? atomosCtat[mappedRefIndex]?.id ?? null : null,
      value: error.value,
      text: error.feedback || error.description,
      source: error.source,
      reason: Number.isInteger(mappedRefIndex)
        ? "unmatched_error_in_aligned_state"
        : unresolved
          ? "unresolved_operational_state"
          : "unmatched_state",
      isExtra: !unresolved,
    }));
  }

  for (const { atom, hint, reason, isExtra } of dicas.extraHints) {
    const mappedRefIndex = agentToRef.get(atom.index);
    rows.push(baseRow(meta, "hint", `${atom.id}:${hint.indice}`, {
      agentStateId: atom.id,
      parentRefId: Number.isInteger(mappedRefIndex) ? atomosCtat[mappedRefIndex]?.id ?? null : null,
      value: atom.value,
      text: hint.texto,
      source: atom.source,
      reason,
      hintLevel: hint.nivel,
      isExtra,
    }));
  }

  if (incluirInventarioEstrutural) {
    const graph = registro?.materializado?.behaviorGraph ?? registro?.behaviorGraph;
    const agentIndexById = new Map(atomosMaterializados.map((a) => [a.id, a.index]));
    const nodeTypeById = new Map((graph?.nodes || []).map((n) => [n.id, n.type]));
    for (const [edgeIndex, edge] of (graph?.edges || []).entries()) {
      const fromType = nodeTypeById.get(edge?.from);
      const toType = nodeTypeById.get(edge?.to);
      if (fromType === "scaffold" || toType === "scaffold") {
        rows.push(baseRow(meta, "scaffold_branch", String(edgeIndex), {
          agentStateId: fromType === "step" ? edge.from : toType === "step" ? edge.to : null,
          parentRefId: null,
          value: null,
          text: String(edge?.condition ?? ""),
          source: "behaviorGraph.edges",
          reason: "no_supported_ctat_topology_equivalence",
          isExtra: false,
          edge: { from: edge?.from ?? null, to: edge?.to ?? null, condition: edge?.condition ?? null },
        }));
        continue;
      }
      if (fromType !== "step" || toType !== "step") continue;
      const fromAgent = agentIndexById.get(edge.from);
      const toAgent = agentIndexById.get(edge.to);
      const fromRef = agentToRef.get(fromAgent);
      const toRef = agentToRef.get(toAgent);
      if (Number.isInteger(fromRef) && Number.isInteger(toRef) && toRef === fromRef + 1) continue;
      rows.push(baseRow(meta, "edge", String(edgeIndex), {
        agentStateId: edge.from,
        parentRefId: Number.isInteger(fromRef) ? atomosCtat[fromRef]?.id ?? null : null,
        value: null,
        text: String(edge?.condition ?? ""),
        source: "behaviorGraph.edges",
        reason: !Number.isInteger(fromRef) || !Number.isInteger(toRef)
          ? "unmatched_edge_endpoint"
          : "non_reference_adjacency",
        isExtra: true,
        edge: { from: edge.from, to: edge.to, condition: edge?.condition ?? null },
      }));
    }
  }

  return rows;
}

/** Orquestra a análise de um registro, sem gravar consolidados ou chamar rede. */
export function analisarRegistro(registro, referencia, options = {}) {
  const atomosCtat = extrairAtomosCtat(referencia, options.ctat);
  const atomosMaterializados = extrairAtomosMaterializados(registro, atomosCtat);
  const resolution = coberturaResolucaoMaterializada(atomosMaterializados);
  resolution.ctatActionFamily = coberturaFamiliasAcao(atomosCtat);
  const alignments = alinharReguas(atomosCtat, atomosMaterializados);
  // Componente+valor é a definição operacional primária do protocolo.
  const alinhamento = alignments.operational;
  const errosCtat = extrairErrosCtat(referencia, atomosCtat);
  const errosMaterializados = extrairErrosMaterializados(atomosMaterializados);
  const erros = parearErrosUmParaUm(errosCtat, errosMaterializados, alinhamento);
  const dicas = medirDicasAncoradas(atomosCtat, atomosMaterializados, alinhamento);
  const ledger = construirLedgerExtras({
    registro,
    atomosCtat,
    atomosMaterializados,
    alinhamento,
    erros,
    dicas,
    metadata: options.metadata,
    incluirInventarioEstrutural: options.incluirInventarioEstrutural === true,
  });
  return {
    metadata: metadataDoRegistro(registro, options.metadata),
    atoms: { ctat: atomosCtat, materialized: atomosMaterializados },
    resolution,
    alignments,
    // Alias temporário para consumidores criados antes da separação das réguas.
    alignment: alinhamento,
    errors: { ctat: errosCtat, materialized: errosMaterializados, matching: erros },
    hints: dicas,
    extrasLedger: ledger,
  };
}
