/**
 * Átomos comparáveis para a análise solicitada pelo orientador (v0.8).
 *
 * Este módulo é deliberadamente conservador: somente campos estruturados podem
 * resolver componente e ação. Descrições em linguagem natural são preservadas
 * como evidência, mas nunca usadas para fabricar uma âncora.
 */
import { canon, canonAnswer } from "../../schema.js";

const SENTINELAS = new Set(["", "-", "-1"]);
const CHAVES_ALVO_FORTES = new Set([
  "targetcomponent",
  "targetcomponents",
  "targetfield",
  "target",
  "targets",
  "targetcells",
  "selectiontargets",
  "factortargets",
  "fieldid",
  "field",
  "fields",
  "controlid",
  "fixedcomponent",
  "fixedcomponents",
  "fixedinterfacecell",
  "fixedcontrol",
  "fixedsurface",
  "editablefield",
  "editablefields",
  "editablecomponent",
  "editablecomponents",
  "activecell",
  "activecells",
  "componentids",
  "selection",
  // Papel semântico declarado pelo próprio candidato. É um campo fechado e
  // estruturado dos agents3/GraphForge; descrições, instruções e dicas não
  // entram nesta resolução.
  "targetrole",
]);

export const normalizarComponente = (valor) => canon(String(valor ?? "").trim());
export const normalizarAcao = (valor) => canon(String(valor ?? "").trim());
export const normalizarValor = (valor) => canonAnswer(String(valor ?? "").trim());

export const FAMILIAS_ACAO = Object.freeze({
  ENTRADA_TEXTO_NUMERO: "entrada_texto_numero",
  SELECAO: "selecao",
  MARCACAO_RETA: "marcacao_reta",
  BOTAO: "botao",
  UNKNOWN: "unknown",
});

/**
 * Vocabulário fechado. Ausência e qualquer ação não listada são `unknown`;
 * não há classificação por semelhança textual ou expressão regular aberta.
 */
const FAMILIA_POR_ACAO = new Map([
  ["updatetextfield", FAMILIAS_ACAO.ENTRADA_TEXTO_NUMERO],
  ["updatetextarea", FAMILIAS_ACAO.ENTRADA_TEXTO_NUMERO],
  ["update", FAMILIAS_ACAO.ENTRADA_TEXTO_NUMERO],
  ["entervalue", FAMILIAS_ACAO.ENTRADA_TEXTO_NUMERO],
  ["registerfraction", FAMILIAS_ACAO.ENTRADA_TEXTO_NUMERO],
  ["updatecombobox", FAMILIAS_ACAO.SELECAO],
  ["select", FAMILIAS_ACAO.SELECAO],
  ["selectmarkedvalue", FAMILIAS_ACAO.SELECAO],
  ["addpoint", FAMILIAS_ACAO.MARCACAO_RETA],
  ["markpoint", FAMILIAS_ACAO.MARCACAO_RETA],
  ["buttonpressed", FAMILIAS_ACAO.BOTAO],
  ["buttonclick", FAMILIAS_ACAO.BOTAO],
  ["submit", FAMILIAS_ACAO.BOTAO],
  ["complete", FAMILIAS_ACAO.BOTAO],
  ["completeproblem", FAMILIAS_ACAO.BOTAO],
]);

// Modalidades declaradas no próprio artefato gerado. Esta tabela é fechada:
// não usa texto livre nem consulta a referência para completar a ação do
// candidato. Ela permite comparar a família da ação CTAT com a modalidade de
// interação que o grafo materializado realmente expõe ao estudante.
const FAMILIA_POR_MODALIDADE = new Map([
  ["inputvalue", FAMILIAS_ACAO.ENTRADA_TEXTO_NUMERO],
  ["numeric", FAMILIAS_ACAO.ENTRADA_TEXTO_NUMERO],
  ["number", FAMILIAS_ACAO.ENTRADA_TEXTO_NUMERO],
  ["text", FAMILIAS_ACAO.ENTRADA_TEXTO_NUMERO],
  ["numeric_keypad", FAMILIAS_ACAO.ENTRADA_TEXTO_NUMERO],
  ["fraction_input", FAMILIAS_ACAO.ENTRADA_TEXTO_NUMERO],
  ["currency_input", FAMILIAS_ACAO.ENTRADA_TEXTO_NUMERO],
  ["selectoption", FAMILIAS_ACAO.SELECAO],
  ["selection", FAMILIAS_ACAO.SELECAO],
  ["select", FAMILIAS_ACAO.SELECAO],
  ["multiple_choice", FAMILIAS_ACAO.SELECAO],
  ["true_false", FAMILIAS_ACAO.SELECAO],
  ["dropdown", FAMILIAS_ACAO.SELECAO],
  ["matching_pairs", FAMILIAS_ACAO.SELECAO],
  ["word_matcher", FAMILIAS_ACAO.SELECAO],
  ["markposition", FAMILIAS_ACAO.MARCACAO_RETA],
  ["number_line", FAMILIAS_ACAO.MARCACAO_RETA],
  ["coordinate_plane", FAMILIAS_ACAO.MARCACAO_RETA],
  ["pressbutton", FAMILIAS_ACAO.BOTAO],
  ["button", FAMILIAS_ACAO.BOTAO],
  ["done", FAMILIAS_ACAO.BOTAO],
]);

export function familiaDeAcao(acao) {
  const chave = normalizarAcao(acao).replace(/[_-]+/g, "");
  return FAMILIA_POR_ACAO.get(chave) ?? FAMILIAS_ACAO.UNKNOWN;
}

function familiaDeModalidade(valor) {
  const normal = normalizarAcao(valor);
  if (!normal) return FAMILIAS_ACAO.UNKNOWN;
  return (
    FAMILIA_POR_MODALIDADE.get(normal) ??
    FAMILIA_POR_MODALIDADE.get(normal.replace(/[_-]+/g, "")) ??
    FAMILIAS_ACAO.UNKNOWN
  );
}

function candidatosModalidadeEstruturada(node) {
  const input = node?.expectedInput || {};
  const compositionElements = [
    ...(input?.componentProps?.composition?.elements || []),
    ...(input?.visualConfig?.componentProps?.composition?.elements || []),
  ];
  return [
    { value: node?.actionFamily, source: "node.actionFamily", directFamily: true },
    { value: input?.actionFamily, source: "expectedInput.actionFamily", directFamily: true },
    { value: node?.interactionFamily, source: "node.interactionFamily" },
    { value: input?.interactionFamily, source: "expectedInput.interactionFamily" },
    { value: input?.interactionMode, source: "expectedInput.interactionMode" },
    { value: input?.componentProps?.spec?.interaction?.mode, source: "expectedInput.componentProps.spec.interaction.mode" },
    { value: input?.visualConfig?.componentProps?.spec?.interaction?.mode, source: "expectedInput.visualConfig.componentProps.spec.interaction.mode" },
    { value: input?.config?.interaction?.mode, source: "expectedInput.config.interaction.mode" },
    { value: input?.config?.inputType, source: "expectedInput.config.inputType" },
    ...compositionElements.map((element, index) => ({
      value: element?.component,
      source: `expectedInput.composition.elements[${index}].component`,
    })),
    { value: input?.renderAs, source: "expectedInput.renderAs" },
    { value: input?.componentId, source: "expectedInput.componentId" },
  ].filter((candidate) => String(candidate.value ?? "").trim());
}

/**
 * Resolve a família somente a partir de campos estruturados do candidato.
 * Candidatos conflitantes deixam a família desconhecida; a ordem da lista
 * serve apenas para registrar a fonte quando todos os reconhecidos concordam.
 */
export function familiaDeInteracaoEstruturada(node) {
  const reconhecidos = candidatosModalidadeEstruturada(node).map((candidate) => {
    const family = candidate.directFamily
      ? Object.values(FAMILIAS_ACAO).includes(String(candidate.value))
        ? String(candidate.value)
        : FAMILIAS_ACAO.UNKNOWN
      : familiaDeModalidade(candidate.value);
    return { ...candidate, family };
  }).filter((candidate) => candidate.family !== FAMILIAS_ACAO.UNKNOWN);
  const familias = [...new Set(reconhecidos.map((candidate) => candidate.family))];
  if (familias.length !== 1) {
    return {
      family: FAMILIAS_ACAO.UNKNOWN,
      source: familias.length > 1 ? "structured_conflict" : "structured_unknown",
      candidates: reconhecidos,
    };
  }
  return {
    family: familias[0],
    source: reconhecidos[0].source,
    candidates: reconhecidos,
  };
}

export function coberturaFamiliasAcao(atomos) {
  const counts = Object.fromEntries(Object.values(FAMILIAS_ACAO).map((familia) => [familia, 0]));
  for (const atom of atomos) {
    const familia = atom?.actionFamily ?? familiaDeAcao(atom?.action);
    counts[Object.values(FAMILIAS_ACAO).includes(familia) ? familia : FAMILIAS_ACAO.UNKNOWN] += 1;
  }
  const known = atomos.length - counts[FAMILIAS_ACAO.UNKNOWN];
  return {
    total: atomos.length,
    known,
    unknown: counts[FAMILIAS_ACAO.UNKNOWN],
    rate: atomos.length ? known / atomos.length : null,
    counts,
  };
}

export function coberturaResolucaoMaterializada(atomos) {
  const target = { exact_target: 0, ambiguous_target: 0, unknown_target: 0 };
  const primaryStatus = {
    exact_target: 0,
    ambiguous_target: 0,
    unknown_action: 0,
    composite_unresolved: 0,
  };
  for (const atom of atomos) {
    const targetKey = Object.hasOwn(target, atom?.targetResolution)
      ? atom.targetResolution
      : "unknown_target";
    target[targetKey] += 1;
    if (Object.hasOwn(primaryStatus, atom?.status)) primaryStatus[atom.status] += 1;
  }
  const total = atomos.length;
  const fullyResolvable = atomos.filter((atom) =>
    atom.component &&
    (atom.actionFamily ?? familiaDeAcao(atom.action)) !== FAMILIAS_ACAO.UNKNOWN &&
    !atom.compositeUnresolved,
  ).length;
  return {
    total,
    target,
    primaryStatus,
    exactTargetRate: total ? target.exact_target / total : null,
    fullyResolvable,
    fullyResolvableRate: total ? fullyResolvable / total : null,
    actionFamily: coberturaFamiliasAcao(atomos),
  };
}

const texto = (valor) => String(valor ?? "").trim();

function dicaNormalizada(dica, indice) {
  if (typeof dica === "string") {
    return { indice, nivel: indice + 1, tipo: null, texto: dica };
  }
  return {
    indice,
    nivel: Number.isFinite(Number(dica?.level ?? dica?.nivel))
      ? Number(dica?.level ?? dica?.nivel)
      : indice + 1,
    tipo: texto(dica?.type ?? dica?.tipo) || null,
    texto: texto(dica?.message ?? dica?.texto),
  };
}

/**
 * Extrai o caminho correto avaliável retornado por carregarReferencia().
 * `sourceIndex` continua apontando para a posição no caminho completo, o que
 * permite ancorar corretamente `items[].passo` mesmo após remover ações do tutor.
 */
export function extrairAtomosCtat(fonte, { incluirSistema = false, incluirMecanico = false } = {}) {
  const caminho = Array.isArray(fonte) ? fonte : fonte?.caminho;
  if (!Array.isArray(caminho)) {
    throw new TypeError("extrairAtomosCtat requer um caminho CTAT ou um objeto com .caminho");
  }

  const atomos = [];
  for (let sourceIndex = 0; sourceIndex < caminho.length; sourceIndex++) {
    const passo = caminho[sourceIndex] || {};
    const bruto = texto(passo.bruto ?? passo.valor ?? passo.sai?.input);
    const ator = texto(passo.ator ?? passo.actor);
    const mecanico = passo.mecanico === true || SENTINELAS.has(bruto);
    const sistema =
      passo.sistema === true ||
      passo.variante === true ||
      /^tutor/i.test(ator);
    if (!incluirSistema && sistema) continue;
    if (!incluirMecanico && mecanico) continue;

    const component = normalizarComponente(passo.selecao ?? passo.selection ?? passo.sai?.selection);
    const action = normalizarAcao(passo.acao ?? passo.action ?? passo.sai?.action);
    const value = normalizarValor(passo.valor ?? bruto);
    if (!value && !incluirMecanico) continue;
    const hintsRaw = Array.isArray(passo.dicasTexto)
      ? passo.dicasTexto
      : Array.isArray(passo.hints)
        ? passo.hints
        : [];

    atomos.push({
      id: texto(passo.id ?? passo.transitionId) || `ctat:${sourceIndex + 1}`,
      index: atomos.length,
      sourceIndex,
      order: Number.isFinite(Number(passo.ordem)) ? Number(passo.ordem) : sourceIndex + 1,
      component,
      action,
      actionFamily: familiaDeAcao(action),
      actionFamilyResolution: familiaDeAcao(action) === FAMILIAS_ACAO.UNKNOWN
        ? "unknown_action"
        : "ctat_closed_vocabulary",
      value,
      rawValue: bruto,
      actor: ator,
      system: sistema,
      mechanical: mecanico,
      hints: hintsRaw.map(dicaNormalizada),
      source: "ctat",
    });
  }
  return atomos;
}

/** Erros buggy CTAT, ainda ligados à posição do estado no caminho completo. */
export function extrairErrosCtat(fonte, atomos = extrairAtomosCtat(fonte)) {
  const items = Array.isArray(fonte) ? fonte : fonte?.items;
  if (!Array.isArray(items)) {
    throw new TypeError("extrairErrosCtat requer um objeto de referência com .items");
  }
  const porSourceIndex = new Map(atomos.map((a) => [a.sourceIndex, a]));
  return items.map((item, index) => {
    const sourceIndex = Number.isInteger(item?.passo) ? item.passo : null;
    const parent = sourceIndex === null ? null : porSourceIndex.get(sourceIndex) ?? null;
    const value = normalizarValor(item?.valor ?? item?.bruto);
    const action = normalizarAcao(item?.acao);
    return {
      id: texto(item?.id) || `ctat-error:${index + 1}`,
      index,
      sourceIndex: index,
      parentRefId: parent?.id ?? null,
      parentRefIndex: parent?.index ?? null,
      parentSourceIndex: sourceIndex,
      anchored: Boolean(parent),
      indistinguishable: Boolean(parent && value && value === parent.value),
      component: normalizarComponente(item?.componente),
      action,
      actionFamily: familiaDeAcao(action),
      value,
      rawValue: texto(item?.bruto ?? item?.valor),
      feedback: texto(item?.devolutiva ?? item?.feedback),
      source: "ctat",
    };
  });
}

function registrarCandidato(saida, valor, path, rank) {
  if (Array.isArray(valor)) {
    valor.forEach((v, i) => registrarCandidato(saida, v, `${path}[${i}]`, rank));
    return;
  }
  if (valor === null || valor === undefined || typeof valor === "object") return;
  const raw = texto(valor);
  const normalized = normalizarComponente(raw);
  if (normalized) saida.push({ raw, normalized, path, rank });
}

function visitarCamposAlvo(valor, path, saida, vistos = new Set()) {
  if (!valor || typeof valor !== "object" || vistos.has(valor)) return;
  vistos.add(valor);
  for (const [chave, filho] of Object.entries(valor)) {
    const chaveCanon = canon(chave);
    const childPath = path ? `${path}.${chave}` : chave;
    if (CHAVES_ALVO_FORTES.has(chaveCanon)) {
      registrarCandidato(saida, filho, childPath, 0);
    } else if (
      chaveCanon === "id" &&
      /(?:elements|targetcells|cells|fields)(?:\.\d+|\[\])?\.id$/i.test(childPath)
    ) {
      // IDs de elementos/células/campos são âncoras estruturadas; um `id`
      // arbitrário fora desses contêineres não é tratado como alvo.
      registrarCandidato(saida, filho, childPath, 0);
    } else if (chaveCanon === "component") {
      // config.component costuma ser o alvo; elements[].component costuma ser o tipo visual.
      const rank = /(^|\.)config\.component$/i.test(childPath) ? 0 : 1;
      registrarCandidato(saida, filho, childPath, rank);
    } else if (chaveCanon === "componentid") {
      registrarCandidato(saida, filho, childPath, 2);
    }
    visitarCamposAlvo(filho, childPath, saida, vistos);
  }
}

/**
 * Lista candidatos estruturados de alvo e conserva o caminho JSON de origem.
 * Se houver referência, apenas IDs que existem no CTAT podem resolver o alvo.
 */
export function coletarCandidatosAlvo(expectedInput, atomosCtat = [], interfaceCtat = null, node = null) {
  const encontrados = [];
  visitarCamposAlvo(expectedInput || {}, "expectedInput", encontrados);
  registrarCandidato(encontrados, node?.targetRole, "node.targetRole", 0);
  const componentesRef = new Set(atomosCtat.map((a) => a.component).filter(Boolean));
  const componentesInterface = new Set(
    (interfaceCtat?.componentes || []).map((c) => normalizarComponente(c?.id)).filter(Boolean),
  );
  const universo = componentesRef.size ? componentesRef : componentesInterface;
  const reconhecidos = universo.size
    ? encontrados.filter((c) => universo.has(c.normalized))
    : encontrados;
  if (!reconhecidos.length) return { all: encontrados, recognized: [], selected: [] };
  const melhorRank = Math.min(...reconhecidos.map((c) => c.rank));
  const noMelhorRank = reconhecidos.filter((c) => c.rank === melhorRank);
  const porValor = new Map();
  for (const candidato of noMelhorRank) {
    if (!porValor.has(candidato.normalized)) porValor.set(candidato.normalized, candidato);
  }
  return { all: encontrados, recognized: reconhecidos, selected: [...porValor.values()] };
}

function pareceValorComposto(valor) {
  if (Array.isArray(valor)) return valor.length > 1;
  if (valor && typeof valor === "object") return Object.keys(valor).length > 1;
  const s = texto(valor);
  if (!s) return false;
  if (/[;|]/.test(s)) return s.split(/[;|]/).filter((x) => x.trim()).length > 1;
  const virgulas = (s.match(/,/g) || []).length;
  // Uma única vírgula entre dígitos é tratada como separador decimal pt-BR.
  return virgulas >= 2;
}

function primeiraAcaoEstruturada(node) {
  const candidatos = [
    node?.action,
    node?.acao,
    node?.expectedInput?.action,
    node?.expectedInput?.acao,
    node?.expectedInput?.config?.action,
    node?.expectedInput?.config?.acao,
  ];
  return candidatos.map(normalizarAcao).find(Boolean) || "";
}

/** Nós `type=step` do behaviorGraph, com resolução conservadora de SAI. */
export function extrairAtomosMaterializados(registro, atomosCtat = []) {
  const behaviorGraph = registro?.materializado?.behaviorGraph ?? registro?.behaviorGraph;
  if (!Array.isArray(behaviorGraph?.nodes)) {
    throw new TypeError("extrairAtomosMaterializados requer materializado.behaviorGraph.nodes[]");
  }
  const interfaceCtat = registro?.interfaceCtat ?? null;
  const acoesPorComponente = new Map();
  for (const ref of atomosCtat) {
    if (!ref.component || !ref.action) continue;
    if (!acoesPorComponente.has(ref.component)) acoesPorComponente.set(ref.component, new Set());
    acoesPorComponente.get(ref.component).add(ref.action);
  }

  const stepNodes = behaviorGraph.nodes.filter((node) => node?.type === "step");
  return stepNodes.map((node, index) => {
    const input = node?.expectedInput || {};
    const candidatos = coletarCandidatosAlvo(input, atomosCtat, interfaceCtat, node);
    const componentCandidates = candidatos.selected.map((c) => c.normalized);
    const component = componentCandidates.length === 1 ? componentCandidates[0] : "";
    const explicitAction = primeiraAcaoEstruturada(node);
    const referenceActions = component ? [...(acoesPorComponente.get(component) || [])].sort() : [];
    // A referência nunca completa um campo ausente no lado do agente. Mesmo
    // quando um componente CTAT admite uma única ação conhecida, copiá-la para
    // o átomo materializado transformaria conhecimento do gabarito em evidência
    // de especificidade do candidato. A régua SAI só usa ação explicitamente
    // registrada no próprio behaviorGraph.
    const action = explicitAction;
    const actionResolution = explicitAction ? "explicit_action" : "unknown_action";
    const explicitActionFamily = familiaDeAcao(explicitAction);
    const structuredInteraction = familiaDeInteracaoEstruturada(node);
    const actionFamily = explicitActionFamily !== FAMILIAS_ACAO.UNKNOWN
      ? explicitActionFamily
      : structuredInteraction.family;
    const actionFamilyResolution = explicitActionFamily !== FAMILIAS_ACAO.UNKNOWN
      ? "explicit_action_closed_vocabulary"
      : structuredInteraction.family !== FAMILIAS_ACAO.UNKNOWN
        ? `explicit_interaction:${structuredInteraction.source}`
        : "unknown_action";
    const targetResolution = componentCandidates.length === 1
      ? "exact_target"
      : componentCandidates.length > 1
        ? "ambiguous_target"
        : "unknown_target";
    const renderMode = canon(input?.renderAs ?? input?.componentId);
    const compositeUnresolved =
      pareceValorComposto(input?.value) ||
      (componentCandidates.length > 1 && /composition|fractioninput/.test(renderMode));
    const statuses = [];
    if (targetResolution === "exact_target") statuses.push("exact_target");
    if (targetResolution === "ambiguous_target") statuses.push("ambiguous_target");
    if (!component || actionFamily === FAMILIAS_ACAO.UNKNOWN) statuses.push("unknown_action");
    if (compositeUnresolved) statuses.push("composite_unresolved");
    const status = compositeUnresolved
      ? "composite_unresolved"
      : targetResolution === "ambiguous_target"
        ? "ambiguous_target"
        : !component || actionFamily === FAMILIAS_ACAO.UNKNOWN
          ? "unknown_action"
          : "exact_target";

    const hints = (Array.isArray(node?.hints) ? node.hints : []).map(dicaNormalizada);
    const errors = (Array.isArray(node?.misconceptions) ? node.misconceptions : []).map((m, errorIndex) => ({
      id: texto(m?.id ?? m?.misconceptionId) || `materialized-error:${node?.id ?? index}:${errorIndex + 1}`,
      localIndex: errorIndex,
      value: normalizarValor(m?.wrongAnswer ?? m?.valor),
      rawValue: texto(m?.wrongAnswer ?? m?.valor),
      feedback: texto(m?.feedback ?? m?.devolutiva),
      description: texto(m?.description ?? m?.descricao),
      source: texto(m?.source) || null,
      matcher: texto(m?.matcher) || null,
      severity: texto(m?.severity) || null,
    }));

    return {
      id: texto(node?.id) || `materialized:${index + 1}`,
      index,
      sourceIndex: behaviorGraph.nodes.indexOf(node),
      component,
      componentCandidates,
      targetCandidates: candidatos.selected,
      allStructuredTargetCandidates: candidatos.all,
      action,
      referenceActions,
      actionFamily,
      actionFamilyEvidence: structuredInteraction.candidates,
      value: normalizarValor(input?.value),
      rawValue: input?.value ?? "",
      targetResolution,
      actionResolution,
      actionFamilyResolution,
      status,
      statuses,
      compositeUnresolved,
      description: texto(node?.description ?? node?.instruction),
      hints,
      errors,
      source: "materialized_behavior_graph",
    };
  });
}

/** Erros materializados herdam componente/ação e âncora do nó pai. */
export function extrairErrosMaterializados(atomos) {
  const erros = [];
  for (const atom of atomos) {
    for (const error of atom.errors || []) {
      erros.push({
        ...error,
        index: erros.length,
        parentAgentId: atom.id,
        parentAgentIndex: atom.index,
        component: atom.component,
        action: atom.action,
        actionFamily: atom.actionFamily,
        source: error.source,
      });
    }
  }
  return erros;
}
