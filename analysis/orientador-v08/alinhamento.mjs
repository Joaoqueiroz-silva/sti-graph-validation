/** Alinhamento hierárquico e pareamento um-para-um de erros. */
import { FAMILIAS_ACAO, familiaDeAcao } from "./atomos.mjs";

const ZERO = Object.freeze([0, 0, 0]);

function compararScore(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

function somarTier(score, tier) {
  const out = [...score];
  out[3 - tier] += 1;
  return out;
}

const scoreIgual = (a, b) => compararScore(a, b) === 0;

export function tierDeCompatibilidade(ref, agent) {
  if (!ref?.value || !agent?.value || ref.value !== agent.value) return 0;
  const componentMatch = Boolean(ref.component && agent.component && ref.component === agent.component);
  const refFamily = ref.actionFamily ?? familiaDeAcao(ref.action);
  const agentFamily = agent.actionFamily ?? familiaDeAcao(agent.action);
  const actionFamilyMatch = Boolean(
    refFamily !== FAMILIAS_ACAO.UNKNOWN &&
    agentFamily !== FAMILIAS_ACAO.UNKNOWN &&
    refFamily === agentFamily,
  );
  if (componentMatch && actionFamilyMatch) return 3;
  if (componentMatch) return 2;
  return 1;
}

const nomeTier = (tier) => ({
  3: "component_action_family_value",
  2: "component_value",
  1: "value_only",
})[tier] || null;

function compararSequenciasDePares(a, b) {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i][0] !== b[i][0]) return a[i][0] - b[i][0];
    if (a[i][1] !== b[i][1]) return a[i][1] - b[i][1];
  }
  return a.length - b.length;
}

function melhorLcs(a, b) {
  if (a.length !== b.length) return a.length > b.length ? a : b;
  return compararSequenciasDePares(a, b) <= 0 ? a : b;
}

/**
 * LCS binária com desempate formal: entre todas as soluções de cardinalidade
 * máxima, devolve a menor sequência lexicográfica de pares [ref, gerado].
 */
export function alinharLcs(atomosCtat, atomosMaterializados, {
  name,
  predicate,
  referenceEligible = () => true,
  materializedEligible = () => true,
  tier = 1,
}) {
  if (typeof predicate !== "function") throw new TypeError("alinharLcs requer predicate");
  const refs = atomosCtat
    .map((atom, originalIndex) => ({ atom, originalIndex }))
    .filter(({ atom }) => referenceEligible(atom));
  const agents = atomosMaterializados
    .map((atom, originalIndex) => ({ atom, originalIndex }))
    .filter(({ atom }) => materializedEligible(atom));
  const n = refs.length;
  const m = agents.length;
  const dp = Array.from({ length: n + 1 }, () => Array.from({ length: m + 1 }, () => []));

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      let best = melhorLcs(dp[i + 1][j], dp[i][j + 1]);
      if (predicate(refs[i].atom, agents[j].atom)) {
        const matched = [[refs[i].originalIndex, agents[j].originalIndex], ...dp[i + 1][j + 1]];
        best = melhorLcs(best, matched);
      }
      dp[i][j] = best;
    }
  }

  const matches = dp[0][0].map(([refIndex, agentIndex]) => ({
    refIndex,
    agentIndex,
    refId: atomosCtat[refIndex].id,
    agentId: atomosMaterializados[agentIndex].id,
    tier,
    tierLabel: nomeTier(tier),
    ruler: name,
  }));
  const refsMatched = new Set(matches.map((p) => p.refIndex));
  const agentsMatched = new Set(matches.map((p) => p.agentIndex));
  const refEligibleIndices = new Set(refs.map((r) => r.originalIndex));
  const agentEligibleIndices = new Set(agents.map((a) => a.originalIndex));
  const precision = razao(matches.length, atomosMaterializados.length);
  const recall = razao(matches.length, atomosCtat.length);
  const eligiblePrecision = razao(matches.length, agents.length);
  const eligibleRecall = razao(matches.length, refs.length);

  return {
    name,
    matches,
    unmatchedReference: atomosCtat.map((_, index) => index).filter((index) => !refsMatched.has(index)),
    unmatchedMaterialized: atomosMaterializados.map((_, index) => index).filter((index) => !agentsMatched.has(index)),
    unmatchedEligibleReference: refs.map((r) => r.originalIndex).filter((index) => !refsMatched.has(index)),
    unmatchedEligibleMaterialized: agents.map((a) => a.originalIndex).filter((index) => !agentsMatched.has(index)),
    ineligibleReference: atomosCtat.map((_, index) => index).filter((index) => !refEligibleIndices.has(index)),
    ineligibleMaterialized: atomosMaterializados.map((_, index) => index).filter((index) => !agentEligibleIndices.has(index)),
    denominators: {
      reference: atomosCtat.length,
      materialized: atomosMaterializados.length,
      eligibleReference: refs.length,
      eligibleMaterialized: agents.length,
    },
    metrics: {
      matches: matches.length,
      precision,
      recall,
      f1: f1(precision, recall),
      eligiblePrecision,
      eligibleRecall,
      eligibleF1: f1(eligiblePrecision, eligibleRecall),
      referenceEligibilityRate: razao(refs.length, atomosCtat.length),
      materializedEligibilityRate: razao(agents.length, atomosMaterializados.length),
    },
  };
}

const temValor = (atom) => Boolean(atom?.value);
const temComponente = (atom) => Boolean(atom?.component && atom?.value && !atom?.compositeUnresolved);
const temSai = (atom) => {
  const family = atom?.actionFamily ?? familiaDeAcao(atom?.action);
  return temComponente(atom) && family !== FAMILIAS_ACAO.UNKNOWN;
};

/** As três réguas do protocolo são LCS independentes, nunca um score misto. */
export function alinharReguas(atomosCtat, atomosMaterializados) {
  const operational = alinharLcs(atomosCtat, atomosMaterializados, {
    name: "operational_component_value",
    tier: 2,
    referenceEligible: temComponente,
    materializedEligible: temComponente,
    predicate: (ref, agent) => ref.component === agent.component && ref.value === agent.value,
  });
  const sai = alinharLcs(atomosCtat, atomosMaterializados, {
    name: "sai_component_action_family_value",
    tier: 3,
    referenceEligible: temSai,
    materializedEligible: temSai,
    predicate: (ref, agent) => {
      const refFamily = ref.actionFamily ?? familiaDeAcao(ref.action);
      const agentFamily = agent.actionFamily ?? familiaDeAcao(agent.action);
      return ref.component === agent.component && refFamily === agentFamily && ref.value === agent.value;
    },
  });
  const valueOnly = alinharLcs(atomosCtat, atomosMaterializados, {
    name: "value_only_sensitivity",
    tier: 1,
    referenceEligible: temValor,
    materializedEligible: temValor,
    predicate: (ref, agent) => ref.value === agent.value,
  });
  return { operational, sai, valueOnly };
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

/**
 * Alinha duas sequências preservando ordem e unicidade. O objetivo é
 * lexicográfico: maximiza primeiro triplas exatas, depois componente+valor e
 * por fim valor. Empates usam match > pular gerado > pular referência.
 */
export function alinharAtomos(atomosCtat, atomosMaterializados) {
  const n = atomosCtat.length;
  const m = atomosMaterializados.length;
  const dp = Array.from({ length: n + 1 }, () =>
    Array.from({ length: m + 1 }, () => [...ZERO]),
  );

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      let best = dp[i + 1][j];
      if (compararScore(dp[i][j + 1], best) > 0) best = dp[i][j + 1];
      const tier = tierDeCompatibilidade(atomosCtat[i], atomosMaterializados[j]);
      if (tier) {
        const matched = somarTier(dp[i + 1][j + 1], tier);
        if (compararScore(matched, best) > 0) best = matched;
      }
      dp[i][j] = [...best];
    }
  }

  const matches = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    const tier = tierDeCompatibilidade(atomosCtat[i], atomosMaterializados[j]);
    const matched = tier ? somarTier(dp[i + 1][j + 1], tier) : null;
    if (matched && scoreIgual(matched, dp[i][j])) {
      matches.push({
        refIndex: i,
        agentIndex: j,
        refId: atomosCtat[i].id,
        agentId: atomosMaterializados[j].id,
        tier,
        tierLabel: nomeTier(tier),
      });
      i += 1;
      j += 1;
      continue;
    }
    // Em empate, mantém a referência corrente e procura o gerado mais cedo.
    if (scoreIgual(dp[i][j + 1], dp[i][j])) {
      j += 1;
    } else {
      i += 1;
    }
  }

  const refsMatched = new Set(matches.map((p) => p.refIndex));
  const agentsMatched = new Set(matches.map((p) => p.agentIndex));
  const tier3 = matches.filter((p) => p.tier === 3).length;
  const tier2 = matches.filter((p) => p.tier === 2).length;
  const tier1 = matches.filter((p) => p.tier === 1).length;
  const resolvableAgents = atomosMaterializados.filter((a) => {
    const family = a.actionFamily ?? familiaDeAcao(a.action);
    return a.component && family !== FAMILIAS_ACAO.UNKNOWN && !a.compositeUnresolved;
  }).length;
  const precisionAny = razao(matches.length, m);
  const recallAny = razao(matches.length, n);
  const precisionExact = razao(tier3, m);
  const recallExact = razao(tier3, n);

  return {
    matches,
    unmatchedReference: atomosCtat.map((_, index) => index).filter((index) => !refsMatched.has(index)),
    unmatchedMaterialized: atomosMaterializados.map((_, index) => index).filter((index) => !agentsMatched.has(index)),
    score: { componentActionValue: tier3, componentValue: tier2, valueOnly: tier1 },
    denominators: { reference: n, materialized: m, resolvableMaterialized: resolvableAgents },
    metrics: {
      precisionAny,
      recallAny,
      f1Any: f1(precisionAny, recallAny),
      precisionExact,
      recallExact,
      f1Exact: f1(precisionExact, recallExact),
      precisionExactAmongResolvable: razao(tier3, resolvableAgents),
      resolvableRate: razao(resolvableAgents, m),
    },
  };
}

function chaveGrupoErro(error, parentRefIndex) {
  return `${parentRefIndex ?? "NA"}\u0000${error.value || ""}`;
}

function retirarPrimeiro(lista, predicado) {
  const index = lista.findIndex(predicado);
  return index < 0 ? null : lista.splice(index, 1)[0];
}

/**
 * Pareia erros somente quando valor e estado coincidem. Dentro de cada grupo,
 * maximiza estavelmente ação+componente, depois componente, depois apenas valor.
 * Como todos os elementos do grupo já compartilham estado+valor, as três
 * passagens preservam a cardinalidade máxima sem reutilizar ocorrências.
 */
export function parearErrosUmParaUm(errosCtat, errosMaterializados, alinhamento) {
  const agentToRef = new Map(alinhamento.matches.map((p) => [p.agentIndex, p.refIndex]));
  const refsComparaveis = errosCtat.filter((e) => e.anchored && e.value);
  const refsNaoAncorados = errosCtat.filter((e) => !e.anchored || !e.value);
  const agentsEnriched = errosMaterializados.map((error) => ({
    ...error,
    mappedRefIndex: agentToRef.has(error.parentAgentIndex)
      ? agentToRef.get(error.parentAgentIndex)
      : null,
  }));

  const refGroups = new Map();
  const agentGroups = new Map();
  for (const error of refsComparaveis) {
    const key = chaveGrupoErro(error, error.parentRefIndex);
    if (!refGroups.has(key)) refGroups.set(key, []);
    refGroups.get(key).push(error);
  }
  for (const error of agentsEnriched) {
    const key = chaveGrupoErro(error, error.mappedRefIndex);
    if (!agentGroups.has(key)) agentGroups.set(key, []);
    agentGroups.get(key).push(error);
  }

  const pairs = [];
  const matchedRef = new Set();
  const matchedAgent = new Set();
  for (const [key, refGroup] of refGroups) {
    const agentGroup = [...(agentGroups.get(key) || [])];
    const refsRemaining = [...refGroup];
    const createPair = (ref, agent, tier) => {
      matchedRef.add(ref.index);
      matchedAgent.add(agent.index);
      pairs.push({
        refErrorIndex: ref.index,
        agentErrorIndex: agent.index,
        refErrorId: ref.id,
        agentErrorId: agent.id,
        parentRefIndex: ref.parentRefIndex,
        parentAgentIndex: agent.parentAgentIndex,
        tier,
        tierLabel: nomeTier(tier),
      });
    };

    // 3: componente + ação + valor no mesmo estado.
    for (let r = 0; r < refsRemaining.length;) {
      const ref = refsRemaining[r];
      const refFamily = ref.actionFamily ?? familiaDeAcao(ref.action);
      const agent = ref.component && refFamily !== FAMILIAS_ACAO.UNKNOWN
        ? retirarPrimeiro(agentGroup, (a) => {
          const agentFamily = a.actionFamily ?? familiaDeAcao(a.action);
          return a.component === ref.component && agentFamily === refFamily;
        })
        : null;
      if (agent) {
        refsRemaining.splice(r, 1);
        createPair(ref, agent, 3);
      } else r += 1;
    }
    // 2: componente + valor no mesmo estado.
    for (let r = 0; r < refsRemaining.length;) {
      const ref = refsRemaining[r];
      const agent = ref.component
        ? retirarPrimeiro(agentGroup, (a) => a.component === ref.component)
        : null;
      if (agent) {
        refsRemaining.splice(r, 1);
        createPair(ref, agent, 2);
      } else r += 1;
    }
    // 1: valor no mesmo estado; ordem de ocorrência resolve o empate.
    while (refsRemaining.length && agentGroup.length) {
      createPair(refsRemaining.shift(), agentGroup.shift(), 1);
    }
  }

  pairs.sort((a, b) => a.refErrorIndex - b.refErrorIndex || a.agentErrorIndex - b.agentErrorIndex);
  const unmatchedReference = refsComparaveis.filter((e) => !matchedRef.has(e.index));
  const unmatchedMaterialized = agentsEnriched.filter((e) => !matchedAgent.has(e.index));
  const precision = razao(pairs.length, agentsEnriched.length);
  const recall = razao(pairs.length, refsComparaveis.length);
  return {
    pairs,
    unmatchedReference,
    unmatchedMaterialized,
    unanchoredReference: refsNaoAncorados,
    metrics: {
      matched: pairs.length,
      referenceComparable: refsComparaveis.length,
      referenceUnanchored: refsNaoAncorados.length,
      materialized: agentsEnriched.length,
      precision,
      recall,
      f1: f1(precision, recall),
      componentActionValue: pairs.filter((p) => p.tier === 3).length,
      componentValue: pairs.filter((p) => p.tier === 2).length,
      valueOnly: pairs.filter((p) => p.tier === 1).length,
    },
  };
}
