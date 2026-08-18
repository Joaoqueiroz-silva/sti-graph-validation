import {
  ASSEMBLED_ANSWER_RENDER_AS,
  PASSIVE_SELECTION,
  TYPED_ENTRY_RENDER_AS,
} from "../../shared/component-sets.js";
import { typedAnswerObstacle } from "../../shared/answer-shape.js";
import { explicacaoNaoEnunciaGabarito } from "../../shared/answer-coherence.js";
import {
  isSimpleInterface,
  isWorksheetInterface,
  INTERFACE_MODES,
} from "../config/request-context.js";
// 2026-08-16 (caderno F2): reguas do modo worksheet (paridade celula <-> no,
// instrumento das celulas C, figura sem gabarito, interacoes proibidas do
// perfil) e origem do instrumento: helpers do fallback deterministico.
// 2026-08-17 (stream L): + origem do layout da folha e a regua "celula A com
// instrucao de manipulacao" (mesma regex do fallback e do interface-audit).
// 2026-08-17 (stream M): + medicao de "o caderno prefere digitar" (formas
// escalares, superficies livres, gabarito conceitual), fonte unica no fallback.
import {
  FREE_TYPED_RENDER_AS,
  SCALAR_ANSWER_KINDS,
  instructionPromisesManipulation,
  isConceptualTextAnswer,
  normalizeCellRole,
  notebookInstrumentSource,
  notebookLayoutSource,
  joinAnswerFields,
  labelBelongsToAnotherCell,
  pendingDecompositionTautology,
  presentationForRenderAs,
  templateSegmentIsFalse,
} from "../notebook/notebook-fallback.js";
import { analyzeAnswerShape } from "../../lib/answer-shape.js";
import { NOTEBOOK_C_V1 } from "../../shared/component-sets.js";
import {
  CONTENT_AFFORDANCE_POLICIES,
  DISCIPLINE_AFFORDANCE_POLICIES,
  RESPONSE_MODALITIES,
} from "../../shared/affordance-policies.js";
import { isAnswerProducingDynamicSpec } from "../dynamic-spec-answerability.js";
import { inspectGeometryCountingFeedbacks } from "../geometry-counting-feedback.js";
import { hintRevealsExpectedAnswer } from "../hint-answer-guard.js";
import { auditBehaviorGraph } from "../behavior-graph-integrity.js";
import {
  canonicalGraphStepIds,
  countBehaviorGraphSemanticDefects,
  parseMisconceptionCondition,
} from "../behavior-graph-semantics.js";
// 2026-07-18 (diagnóstico autossuficiente §6): a mesma régua de id específico do
// catálogo por geração — importada, não replicada, para nunca divergir da PR #27.
import { isSpecificMisconceptionId } from "../diagnostics/step-error-catalog.js";
import { isGroundedWrongAnswer } from "../diagnostics/buggy-rules.js";
import { detectDisciplineArea } from "../discipline-config.js";
/**
 * quality-gate.js — Validador universal pos-geracao
 *
 * Roda APOS qualquer STI ser gerado (V10 Tool-First OU V9.2 legacy).
 * Se qualquer criterio crítico falhar, retorna {pass:false, issues:[...]} e o
 * endpoint /api/generate-v8 regenera (ate 2 tentativas).
 *
 * Criterios (configuraveis via GATE_THRESHOLDS):
 *   1. % de distratores genericos <= 30%
 *   2. Nenhuma pista anterior ao bottom-out contem o expectedAnswer
 *   3. Toda step tem kc definido (string nao-vazia)
 *   4. Nenhum step tem <2 distratores unicos
 *   5. Nenhum step tem expectedAnswer vazio
 *   6. Todo option tem isCorrect explicito (true|false)
 *   7. (D2) Monotonia passiva: 3+ steps todos em componente de seleção (MC/V-F)
 *   8. (D2) Perda catastrofica: designer planejou >=4 steps e pipeline entregou <= metade
 *
 * Medições NÃO-bloqueantes (warnings observáveis):
 *   - specificDistractorPct (§6 diagnóstico autossuficiente 2026-07-18, renomeada
 *     na revisão anti-inflação): proporção de distratores errados (options +
 *     behaviorMisconceptions) cujo misconceptionId PARECE específico (fora dos
 *     prefixos genéricos reservados). Warning < 50%. NOME HONESTO: a métrica NÃO
 *     verifica ancoragem real no catálogo do 3b (id existente + wrongAnswer
 *     correspondente) — essa verificação pode vir depois via opts (passar o
 *     catálogo da geração para o gate).
 */

const GATE_THRESHOLDS = {
  maxGenericDistractorPct: 0.4, // 40% max (relaxado: alguns fallbacks sao legitimos)
  minUniqueDistractorsPerStep: 2,
  minProblems: 1,
  minStepsPerProblem: 1,
};

const REQUESTED_STEP_WORDS = new Map([
  ["um", 1],
  ["uma", 1],
  ["dois", 2],
  ["duas", 2],
  ["tres", 3],
  ["quatro", 4],
  ["cinco", 5],
  ["seis", 6],
  ["sete", 7],
  ["oito", 8],
  ["nove", 9],
  ["dez", 10],
  ["three", 3],
  ["four", 4],
  ["five", 5],
  ["six", 6],
  ["seven", 7],
  ["eight", 8],
  ["tres", 3],
  ["cuatro", 4],
  ["cinco", 5],
  ["seis", 6],
  ["siete", 7],
  ["ocho", 8],
]);

function normalizeRequestText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function inferRequestedStepMinimum(value) {
  let text = normalizeRequestText(value);
  if (!text) return { minimum: 0, perProblem: false };
  const countToken =
    "(\\d{1,2}|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|three|four|five|six|seven|eight|cuatro|siete|ocho)";
  const excludedClause = new RegExp(
    `(?:no maximo|ate|maximum(?: of)?|at most|como maximo|nao (?:crie|use|gere|inclua)|do not (?:create|use|generate|include)|no (?:cree|use|genere|incluya))\\s*${countToken}\\s*(?:passos?|steps?|pasos?)\\b`,
    "gi"
  );
  text = text.replace(excludedClause, " ");
  const patterns = [
    new RegExp(
      `(?:>=|≥|pelo menos|ao menos|minimo(?: de)?|at least|minimum(?: of)?|al menos|como minimo)\\s*${countToken}\\s*(?:passos?|steps?|pasos?)\\b`,
      "i"
    ),
    new RegExp(`\\b${countToken}\\s*(?:passos?|steps?|pasos?)\\b`, "i"),
  ];
  let token = "";
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      token = match[1];
      break;
    }
  }
  if (!token) return { minimum: 0, perProblem: false };
  const numeric = Number(token);
  const minimum = Number.isFinite(numeric) ? numeric : REQUESTED_STEP_WORDS.get(token) || 0;
  const perProblem =
    /(?:cada|por) (?:problema|questao|atividade)|(?:passos?|steps?|pasos?) (?:em )?cada|per problem|each problem/.test(
      text
    );
  return { minimum: Math.min(Math.max(minimum, 0), 40), perProblem };
}

// So sao "realmente genericos" os que o LLM inventou sem base no catalogo.
// misc_numeric_near_* e fallback deterministico do engine = pedagogicamente valido.
// Rotas sintéticas mantêm o grafo executável, mas não demonstram que o erro foi
// diagnosticado. Vizinhos numéricos e oposições textuais automáticas contam como
// fallback genérico, nunca como cobertura pedagógica específica.
const GENERIC_MISC_PREFIXES = [
  "misc_generic_",
  "misc_unclassified",
  "misc_numeric_near",
  "misc_text_confusion",
];

function hasFallbackDiagnosticSource(record) {
  const source = String(record?.source || record?.graphDiagnosticSource || "").toLowerCase();
  return /^deterministic_.*fallback$/.test(source);
}

function isGenericMisc(option) {
  const id = String(option?.misconceptionId || "");
  const type = String(option?.misconceptionType || "").toLowerCase();
  if (!id || !type || type === "unclassified") return true;
  if (hasFallbackDiagnosticSource(option)) return true;
  return GENERIC_MISC_PREFIXES.some((prefix) => id.startsWith(prefix));
}

function isSpecificGraphMisconception(record) {
  const id = String(record?.id || record?.misconceptionId || "");
  const type = String(record?.misconceptionType || record?.type || "").toLowerCase();
  const source = String(record?.source || record?.graphDiagnosticSource || "").toLowerCase();
  return !!(
    id &&
    type &&
    type !== "unclassified" &&
    !/^misc_(?:generic|unclassified|numeric_near|text_confusion)(?:_|$)/.test(id) &&
    // 2026-08-09: espelha `isSpecificDiagnosticRecord` de behavior-graph-semantics.
    // A rota criada pelo motor de regras falsas CHEGA ao aluno; o que ela não
    // pode é contar como cobertura específica, porque esta métrica existe para
    // medir o que os AGENTES produziram. Se a rede de segurança determinística
    // alimentar o medidor, o gate para de conseguir reprovar um gerador que não
    // diagnostica nada — ele passaria a aprovar sempre, com conteúdo de máquina
    // por baixo.
    !/^(?:deterministic_.*fallback|regra_falsa_aterrada)$/.test(source)
  );
}

function adaptiveCoverageForProblem(problem) {
  const nodes = Array.isArray(problem?.behaviorGraph?.nodes) ? problem.behaviorGraph.nodes : [];
  const edges = Array.isArray(problem?.behaviorGraph?.edges) ? problem.behaviorGraph.edges : [];
  const nodeById = new Map(nodes.map((node) => [node?.id, node]));
  const graphSteps = nodes.filter((node) => node?.type === "step");
  const stepNodeById = new Map();
  for (const node of graphSteps) {
    if (node?.id != null && !stepNodeById.has(node.id)) stepNodeById.set(node.id, node);
  }
  // 2026-07-19 (E2E frações, pareamento posicional): o nó do passo é resolvido
  // pelo id canônico (graphNodeId ?? id, fallback step_{i+1}) — a MESMA régua de
  // canonicalGraphStepIds/behavior-graph-semantics. O pareamento posicional
  // (graphSteps[index], ordem do array de nodes) desalinhava a atribuição quando
  // a ordem dos nós step divergia da ordem dos steps (nó sintetizado apendado,
  // reviewer inserindo step): rotas específicas e "constructed" eram creditados
  // ao passo errado. O posicional permanece só como último fallback.
  const canonicalIds = canonicalGraphStepIds(problem?.steps || []);
  const result = {
    specific: 0,
    genericOnly: 0,
    missing: 0,
    constructed: 0,
    constructedWithoutSpecific: 0,
  };

  for (let index = 0; index < (problem?.steps || []).length; index++) {
    const step = problem.steps[index];
    const graphStep =
      stepNodeById.get(canonicalIds[index]) ??
      stepNodeById.get(`step_${index + 1}`) ??
      graphSteps[index];
    const outgoing = graphStep ? edges.filter((edge) => edge.from === graphStep.id) : [];
    const hasReturn = (scaffoldId) =>
      !!graphStep &&
      edges.some(
        (edge) =>
          edge.from === scaffoldId &&
          edge.to === graphStep.id &&
          (edge.condition === "correct" || edge.condition === "default")
      );
    // 2026-07-19 (E2E frações 6 — rejeição "1 steps sem rota adaptativa" SEM
    // "behaviorGraph inválido", /root/pr27-qa/e2e-fracoes6.json): um passo cuja
    // única rota é misconception DECLARADA porém não-específica (ex.:
    // misc_numeric_near_* preservada de fallback) com scaffold dedicado e
    // retorno válidos passa no audit (que aceita qualquer rota declarada
    // roteada), mas aqui caía em "missing" — bloqueio injusto e intermitente.
    // Rota roteada não-específica é REMEDIAÇÃO honesta: conta como genericOnly.
    // A régua de evidência não afrouxa — ela nunca vira "specific" e continua
    // rebaixando a cobertura específica bloqueante (requireSpecificAdaptiveCoverage).
    let hasSpecific = false;
    let hasRoutedRemediation = false;
    for (const edge of outgoing) {
      const misconceptionId = parseMisconceptionCondition(edge.condition);
      if (!misconceptionId) continue;
      const target = nodeById.get(edge.to);
      const declared = (graphStep?.misconceptions || []).find(
        (record) => String(record?.id || record?.misconceptionId) === misconceptionId
      );
      // 2026-08-05 (bateria Ciências/cadeia-alimentar): node.misconceptions é
      // construído CEDO por agent7-adapter.js a partir de step.options — antes
      // do diversifier migrar o diagnóstico para step.behaviorMisconceptions
      // (com misconceptionType correto) quando o passo vira dynamic_spec/
      // drag_to_order/equation_builder. O cache do nó nunca é avisado dessa
      // migração e fica "unclassified" mesmo com o MESMO id classificado
      // corretamente do lado, no próprio step. Em vez de forçar um resync
      // estrutural do grafo (tentado e revertido — derrubava diagnóstico
      // genérico LEGÍTIMO como se fosse o mesmo defeito, 6 testes quebrados),
      // este é o ponto de consumo: se o registro do nó está obsoleto, procura
      // o mesmo id em step.behaviorMisconceptions (fonte mais fresca) antes de
      // decidir "específico ou genérico".
      const effectiveDeclared =
        declared && !isSpecificGraphMisconception(declared)
          ? ((Array.isArray(step?.behaviorMisconceptions) ? step.behaviorMisconceptions : []).find(
              (bm) => String(bm?.id || bm?.misconceptionId) === misconceptionId
            ) ?? declared)
          : declared;
      const routed =
        !!declared &&
        target?.type === "scaffold" &&
        target.targetMisconception === misconceptionId &&
        hasReturn(target.id);
      if (!routed) continue;
      hasRoutedRemediation = true;
      if (isSpecificGraphMisconception(effectiveDeclared)) hasSpecific = true;
    }
    const hasGeneric = outgoing.some((edge) => {
      if (!/^struggles(?:\(|$)/i.test(String(edge.condition || "").trim())) return false;
      const target = nodeById.get(edge.to);
      return (
        target?.type === "scaffold" &&
        target.targetMisconception === "generic_struggle" &&
        hasReturn(target.id)
      );
    });
    const constructed = !Array.isArray(step?.options) || step.options.length === 0;

    if (hasSpecific) result.specific++;
    else if (hasGeneric || hasRoutedRemediation) result.genericOnly++;
    else result.missing++;
    if (constructed) {
      result.constructed++;
      if (!hasSpecific) result.constructedWithoutSpecific++;
    }
  }
  return result;
}

// Componentes "passivos": o aluno SELECIONA, não constrói/digita/arrasta/desenha.
// Monotonia destes é bloqueante — diversidade significa MODO DE INPUT real, não
// decoração visual com múltipla escolha por baixo (ver memory feedback_input_diversity).
const PASSIVE_RENDER_AS = PASSIVE_SELECTION; // fonte única: backend/shared/component-sets.js

// Surfaces em que o aluno manipula a representacao do conceito, e nao apenas
// digita/seleciona um resultado. A metrica separa "input construido" de
// "manipulativo semanticamente alinhado" (pedido da auditoria 2026-08-01).
//
// 2026-08-06 (auditoria inner/outer loop, Tier 1.8): esta era uma lista
// hardcoded PRÓPRIA (30 ids) em vez de derivada de RESPONSE_MODALITIES — a
// mesma "partição canônica" que este arquivo já importa de
// affordance-policies.js e usa noutro lugar. Drift real medido: `moon_phases`
// está em RESPONSE_MODALITIES.manipulate (registry canônico) mas NUNCA esteve
// nesta lista — um STI de Ciências apoiado em moon_phases não contava como
// "interação semântica" mesmo sendo, pela própria fonte única do projeto, um
// componente manipulativo. Deriva agora dos 4 baldes não-passivos da
// partição (tudo exceto select/type) — não pode mais divergir em silêncio.
const SEMANTIC_MANIPULATIVES = new Set(
  ["construct", "manipulate", "order-classify", "inspect-locate"].flatMap((balde) =>
    Array.from(RESPONSE_MODALITIES[balde] || [])
  )
);

// Agrupa surfaces pela ação real executada pelo aluno. Só trocar o nome do
// componente (por exemplo, MC por V/F) não conta como diversidade pedagógica.
// A taxonomia é transversal: não depende da disciplina ou de palavras-chave.

function dynamicElementTypes(step) {
  return (step?.componentProps?.spec?.elements || []).map((element) => String(element?.type || ""));
}

const GEOMETRY_SURFACES = new Set(["geometry_shape", "diagram_labeler", "hot_spot"]);
const GEOMETRY_VISIBLE_PRIMITIVES = new Set(["circle", "ellipse", "path", "polygon", "rect"]);
const GEOMETRY_DIRECT_TARGETS = new Set([...GEOMETRY_VISIBLE_PRIMITIVES, "line", "zone"]);

function dynamicSpecHasGeometryPrimitives(step) {
  const types = dynamicElementTypes(step);
  return (
    types.some((type) => GEOMETRY_VISIBLE_PRIMITIVES.has(type)) ||
    types.filter((type) => type === "line").length >= 3
  );
}

function dynamicSpecTargetsGeometry(step) {
  if (!isAnswerProducingDynamicSpec(step) || !dynamicSpecHasGeometryPrimitives(step)) return false;
  const spec = step?.componentProps?.spec || {};
  const mode = spec.interaction?.mode;
  if (mode !== "click-zone" && mode !== "identify-element") return false;

  const expected = normalizeRequestText(spec.interaction?.validator?.expected);
  if (!expected) return false;
  const targets = (spec.elements || []).filter(
    (element) => normalizeRequestText(element?.id) === expected
  );
  if (!targets.length) return false;

  // click-zone usa uma camada invisível sobre a figura. identify-element, por
  // outro lado, precisa apontar para uma primitiva geométrica — clicar em um
  // card textual ao lado do desenho não é interação com a figura.
  if (mode === "click-zone") return targets.some((target) => target.type === "zone");
  return targets.some(
    (target) => GEOMETRY_DIRECT_TARGETS.has(String(target.type || "")) && target.type !== "zone"
  );
}

function dynamicSpecHasGeometry(step) {
  return dynamicSpecTargetsGeometry(step);
}

function geometryStepIntent(step, tutorContext = "") {
  const text = normalizeRequestText(
    [
      step?.instruction,
      step?.questionText,
      step?.question,
      step?.componentProps?.question,
      step?.kc,
    ]
      .filter(Boolean)
      .join(" ")
  );
  if (!text) return null;

  const context = `${text} ${tutorContext}`;
  const hasGeometryContext =
    /\b(geometr|figura plana|figura geometrica|forma geometrica|poligono|triangulo|quadrado|retangulo|pentagono|hexagono|octogono|circulo|circunferencia|contorno|segmento de reta|plane shape|geometric shape|polygon|triangle|square|rectangle|pentagon|hexagon)\w*/.test(
      context
    );
  if (!hasGeometryContext) return null;

  const hasStructuralObject =
    /\b(lado|lados|vertice|vertices|quina|quinas|canto|cantos|figura|figuras|forma|formas|poligono|poligonos|triangulo|triangulos|quadrado|quadrados|retangulo|retangulos|pentagono|pentagonos|hexagono|hexagonos|circulo|circulos|side|sides|vertex|vertices|corner|corners|shape|shapes|polygon|polygons)\b/.test(
      text
    );
  if (!hasStructuralObject) return null;

  // 2026-08-05 (bateria Matemática/polígonos): passos-irmãos estruturalmente
  // idênticos ("Quantos lados possui a placa?" vs "Clique uma vez em cada
  // lado do logotipo e registre a quantidade total.") só divergiam porque o
  // worker (Luna) narrou o de contagem com "clique" — "quantidade total" não
  // batia em nenhuma palavra da lista. "kc_contar_*" é sinal mais forte que
  // qualquer verbo da instrução (o worker nomeia o KC de forma mais estável).
  const isCount =
    /\b(quantos|quantas|conte|contar|contagem|numero de|quantidade|how many|count|cuantos|cuantas)\b/.test(
      text
    ) || /^kc_contar_/.test(String(step?.kc || "").toLowerCase());
  const isIdentify =
    /\b(identifi(?:c|qu)\w*|reconhec\w*|classifi(?:c|qu)\w*|selec\w*|cliqu\w*|marqu\w*|aponte\w*|localiz\w*|escolh\w*|toqu\w*|assinal\w*|qual figura|qual forma|which shape|identify|recognize|classify|select|click|mark|locate|choose|tap)\b/.test(
      text
    );
  const isDefinition =
    /\b(o que (?:e|representa|significa)|conceito de|defin\w*|what is|what does|define)\b/.test(
      text
    );
  if (!isCount && !isIdentify && !isDefinition) return null;

  const countingTarget = isCount
    ? /\b(vertice|vertices|canto|cantos|quina|quinas|vertex|corner|corners)\b/.test(text)
      ? "vertices"
      : /\b(lado|lados|segmento|segmentos|side|sides)\b/.test(text)
        ? "lados"
        : null
    : null;

  // 2026-08-05: requiresDirectTarget amarrado ao "kind" JÁ RESOLVIDO, não ao
  // isIdentify bruto — antes, um passo que batia em "quantos" E também em um
  // verbo de "identify" (ex.: "clique") virava kind="count" mas continuava
  // EXIGINDO alvo geométrico direto (regra de identify), porque a linha nunca
  // consultava kind. Passo de contagem por campo numérico é affordance válida;
  // só passo de kind="identify" de fato precisa de alvo clicável na figura.
  const kind = isCount ? "count" : isIdentify ? "identify" : "definition";
  return {
    kind,
    requiresDirectTarget: kind === "identify",
    countingTarget,
  };
}

function geometryAffordanceFailure(step, intent) {
  const renderAs = String(step?.renderAs || "");
  if (GEOMETRY_SURFACES.has(renderAs)) return null;
  if (renderAs !== "dynamic_spec") return "missing-model";
  if (!isAnswerProducingDynamicSpec(step) || !dynamicSpecHasGeometryPrimitives(step)) {
    return "missing-model";
  }
  if (intent.requiresDirectTarget && !dynamicSpecTargetsGeometry(step))
    return "missing-direct-target";
  return null;
}

function dynamicSpecHasMeasuredContainer(step) {
  if (!isAnswerProducingDynamicSpec(step)) return false;
  const types = dynamicElementTypes(step);
  const hasContainerPrimitive = ["path", "rect", "polygon"].some((type) => types.includes(type));
  const hasDataTable = types.includes("table");
  const spec = step?.componentProps?.spec || {};
  const visible = normalizeRequestText(
    JSON.stringify({
      name: spec.name,
      tags: spec.tags,
      pedagogy: spec.pedagogy,
      elements: (spec.elements || []).map((element) => ({
        label: element?.label,
        text: element?.text,
        title: element?.title,
        tooltip: element?.tooltip,
        columns: element?.columns,
        rows: element?.rows,
      })),
    })
  );
  const hasMass = /(massa|grama|\bg\b)/.test(visible);
  const hasVolume = /(volume|litro|\bl\b)/.test(visible);
  const hasConcentrationUnit = /g\s*\/\s*l/.test(visible);
  const identifiesContainer = /(bequer|proveta|recipiente|solucao|concentr)/.test(visible);
  return (
    (hasContainerPrimitive && identifiesContainer && hasMass && hasVolume) ||
    (hasDataTable && hasMass && hasVolume && hasConcentrationUnit)
  );
}

function dynamicSpecHasClock(step) {
  if (!isAnswerProducingDynamicSpec(step)) return false;
  const types = dynamicElementTypes(step);
  return types.includes("circle") && types.filter((type) => type === "line").length >= 2;
}

function responseModalityFor(step) {
  const renderAs = String(step?.renderAs || "text");
  if (renderAs === "dynamic_spec") {
    return isAnswerProducingDynamicSpec(step) ? "custom-interact" : "invalid-custom";
  }
  for (const [modality, surfaces] of Object.entries(RESPONSE_MODALITIES)) {
    if (surfaces.has(renderAs)) return modality;
  }
  return "other";
}

// Os predicados dinamicos vivem AQUI, e nao na fonte unica, porque inspecionam
// a spec ja materializada — conhecimento que so existe depois da geracao. Sao
// anexados por id a tabela compartilhada.
const DYNAMIC_PREDICATES = {
  "shape-selection": dynamicSpecHasGeometry,
  "concentration-model": dynamicSpecHasMeasuredContainer,
  "time-model": dynamicSpecHasClock,
};

const AFFORDANCE_POLICIES = CONTENT_AFFORDANCE_POLICIES.map((policy) =>
  DYNAMIC_PREDICATES[policy.id]
    ? { ...policy, dynamicPredicate: DYNAMIC_PREDICATES[policy.id] }
    : policy
);

/**
 * 2026-08-16 (caderno F2): interacao proibida do perfil (interfaceSpec.
 * constraints.forbiddenInteractions: text_input | fill_blanks | dropdown |
 * table) cruzada com a celula. A apresentacao vale quando o autor a
 * definiu; senao deriva do renderAs (mesma tabela do fallback).
 */
function forbiddenInteractionOfCell(step, forbidden) {
  const renderAs = String(step?.renderAs || "");
  const presentation =
    String(step?.cell?.presentation || "").trim() || presentationForRenderAs(renderAs);
  const hits = [];
  for (const rule of forbidden) {
    const r = String(rule || "").trim();
    if (r === "dropdown" && presentation === "dropdown") hits.push(r);
    else if (r === "table" && (renderAs === "table" || presentation === "table")) hits.push(r);
    else if (r === "text_input" && (presentation === "input" || renderAs === "text")) hits.push(r);
    else if (r === "fill_blanks" && (renderAs === "cloze_test" || presentation === "fill_blanks"))
      hits.push(r);
  }
  return hits;
}

/**
 * 2026-08-16 (caderno F2): auditoria do caderno. Puro: devolve { issues,
 * warnings, metrics } e nao muta o tutor. Regras:
 *   - paridade celula <-> no BLOQUEANTE: todo step COM cell tem cell.id igual
 *     ao id canonico do no e o no correspondente tem expectedInput.cellId
 *     igual (o sync do grafo copiou); step SEM cell e so warning (o fallback
 *     nao rodou: medicao);
 *   - figura (notebook.figure) com expectedAnswer BLOQUEANTE: figura e apoio
 *     readOnly, nao responde;
 *   - celula C sem instrumento/alvo valido BLOQUEANTE (depois do fallback so
 *     bug de codigo chega aqui): instrumento presente, na lista fechada
 *     NOTEBOOK_C_V1, instrumentRef/target existentes e renderAs do passo igual
 *     ao do instrumento;
 *   - forbiddenInteractions do perfil: BLOQUEANTE em pre_literate, warning nos
 *     demais;
 *   - origem do instrumento por problema (llm|fallback|ausente): warning de
 *     medicao;
 *   - problema so com celulas A quando o perfil permite B/C: warning;
 *   - 2026-08-17 (stream L): celula A cuja instrucao manda manipular (pintar,
 *     clicar, arrastar, marcar na reta/barra/tabela/diagrama) e que o
 *     fallback NAO conseguiu converter em C: warning de medicao (o aluno le
 *     uma ordem que a caixa de digitacao nao cumpre; visto em producao:
 *     keypad com "Manipule as barras para encontrar o MMC");
 *   - 2026-08-17 (stream L): origem do layout da folha por problema
 *     (llm|fallback|ausente): warning de medicao, como o instrumento.
 *   - 2026-08-17 (stream M, "o caderno prefere digitar"; medicao do que o
 *     fallback deveria ter consertado, gotcha 4 do CLAUDE.md):
 *       . celula B (nao C) com gabarito escalar e superficie fora de
 *         "montar/ordenar/parear": warning "celula B com gabarito escalar";
 *       . dynamic_spec em celula do caderno: warning (nunca deveria sobrar);
 *       . fraction_bar fora do instrumento (celula A/B): warning;
 *       . options em superficie livre (numeric_keypad, fraction_input, text,
 *         fraction_bar) que sobraram: warning "options em superficie livre";
 *       . givens descartados pelo fallback (notebook.discardedGivens): warning
 *         com a contagem;
 *       . celula A `text` com gabarito conceitual (>= 3 palavras) sem
 *         alternativas: warning (o aluno teria de digitar uma frase exata).
 */
export function auditWorksheetTutor(tutor) {
  const issues = [];
  const warnings = [];
  const metrics = {
    worksheetStepsWithoutCell: 0,
    worksheetParityIssues: 0,
    worksheetCellsC: 0,
    worksheetCellsCWithoutInstrument: 0,
    worksheetInstrumentSources: {},
    worksheetForbiddenInteractionHits: 0,
    worksheetProblemsOnlyA: 0,
    worksheetTypedCellsPromisingInstrument: 0,
    worksheetLayoutSources: {},
    worksheetScalarCellsB: 0,
    worksheetDynamicSpecCells: 0,
    worksheetLooseFractionBars: 0,
    worksheetOptionsOnFreeSurface: 0,
    worksheetGivensDiscarded: 0,
    worksheetConceptualTypedCells: 0,
    worksheetDecompositionWithNumericAnswer: 0,
    worksheetTemplateFalseEquality: 0,
    worksheetTemplateRepeatedCell: 0,
    worksheetCellsWithFields: 0,
    worksheetIncoherentFields: 0,
    worksheetLabelsDescribingAnotherCell: 0,
    worksheetLabelsWithoutTheNumber: 0,
    worksheetOrphanInstrumentTargets: 0,
    worksheetLongInstructions: 0,
    worksheetCellsWithGivenRefs: 0,
    // 2026-08-18 (fase 7, catalogo por conteudo): RIQUEZA do caderno. Estas
    // reguas existiam no gate universal e sao desligadas no worksheet por
    // `richnessRulesOff` (a troca prometida em 2026-08-16 foi "entram as
    // reguas proprias do caderno", mas as que entraram medem ESTRUTURA, nao
    // riqueza). Sem substituto, o corpus de producao derivou para 42,4% de
    // celulas de selecao passiva e um tutor inteiro (geopolitica) com 12/12
    // multiple_choice. Aqui a riqueza volta a ser medida na lingua do caderno:
    // papel da celula + superficie, por tutor.
    worksheetPassiveCells: 0,
    worksheetPassiveShare: 0,
    worksheetCells: 0,
    worksheetCellsA: 0,
    worksheetCellsB: 0,
    worksheetTutorAllPassive: 0,
    worksheetProblemsWithoutInstrument: 0,
    worksheetDistinctSurfaces: 0,
    // Rotulo de opcao que e um identificador de codigo ("rota_artica"): fossil
    // de um componente rico (hot_spot) que foi rebaixado para selecao sem que
    // ninguem traduzisse os alvos para texto que o aluno le.
    worksheetOptionsLookingLikeIds: 0,
  };
  // Superficies distintas usadas no tutor inteiro (variedade real da folha).
  const superficiesDoTutor = new Set();
  const profile = String(tutor?.interfaceSpec?.profile || "reader");
  const forbidden = Array.isArray(tutor?.interfaceSpec?.constraints?.forbiddenInteractions)
    ? tutor.interfaceSpec.constraints.forbiddenInteractions
    : [];
  const perfilPermiteBC = profile !== "pre_literate";

  for (const [pi, p] of (tutor?.problems || []).entries()) {
    const label = `P${pi + 1}`;
    const steps = Array.isArray(p?.steps) ? p.steps : [];
    const ids = canonicalGraphStepIds(steps);
    const nodes = Array.isArray(p?.behaviorGraph?.nodes) ? p.behaviorGraph.nodes : [];
    const nodeById = new Map(nodes.filter((n) => n?.type === "step").map((n) => [n.id, n]));
    const instrument = p?.notebook?.instrument;
    const targets = new Set(
      (Array.isArray(instrument?.targets) ? instrument.targets : [])
        .map((t) => String(t?.id ?? "").trim())
        .filter(Boolean)
    );
    let temBC = false;
    let temCell = false;

    steps.forEach((step, si) => {
      const stepLabel = `${label}S${si + 1}`;
      const cell = step?.cell;
      if (!cell || typeof cell !== "object") {
        metrics.worksheetStepsWithoutCell++;
        return;
      }
      temCell = true;
      const id = ids[si];
      if (String(cell.id ?? "").trim() !== id) {
        metrics.worksheetParityIssues++;
        issues.push(`${stepLabel}: cell.id "${cell.id}" difere do id canonico do no "${id}"`);
      }
      const node = nodeById.get(id);
      if (!node) {
        metrics.worksheetParityIssues++;
        issues.push(`${stepLabel}: no "${id}" da celula nao existe no behaviorGraph`);
      } else if (String(node?.expectedInput?.cellId ?? "").trim() !== id) {
        metrics.worksheetParityIssues++;
        issues.push(
          `${stepLabel}: expectedInput.cellId do no "${id}" (${node?.expectedInput?.cellId ?? "ausente"}) nao bate com a celula`
        );
      }
      const role = normalizeCellRole(cell.role);
      if (role === "B" || role === "C") temBC = true;
      // 2026-08-17 (stream M): medicao de "o caderno prefere digitar".
      const renderAsDoPasso = String(step?.renderAs || "").trim();

      // (fase 7) riqueza: papel, superficie e selecao passiva por celula.
      metrics.worksheetCells++;
      if (role === "A") metrics.worksheetCellsA++;
      if (role === "B") metrics.worksheetCellsB++;
      if (renderAsDoPasso) superficiesDoTutor.add(renderAsDoPasso);
      if (PASSIVE_RENDER_AS.has(renderAsDoPasso)) metrics.worksheetPassiveCells++;
      // Um rotulo so conta como identificador quando TODAS as opcoes sao
      // identificadores: uma unica opcao em snake_case pode ser um termo
      // tecnico legitimo, o conjunto inteiro nao e.
      const rotulos = (Array.isArray(step?.options) ? step.options : []).map((o) =>
        String(o?.label ?? o?.value ?? "").trim()
      );
      if (rotulos.length >= 2 && rotulos.every((r) => /^[a-z0-9]+(_[a-z0-9]+)+$/.test(r))) {
        metrics.worksheetOptionsLookingLikeIds++;
        warnings.push(
          `${stepLabel}: as opcoes sao identificadores de codigo (${rotulos.slice(0, 3).join(", ")}), nao texto que o aluno le`
        );
      }
      const kindDoGabarito = analyzeAnswerShape(step).kind;
      if (renderAsDoPasso === "dynamic_spec") {
        metrics.worksheetDynamicSpecCells++;
        warnings.push(`${stepLabel}: dynamic_spec em celula do caderno (cena nunca e celula)`);
      }
      if (
        role === "B" &&
        SCALAR_ANSWER_KINDS.has(kindDoGabarito) &&
        !ASSEMBLED_ANSWER_RENDER_AS.has(renderAsDoPasso)
      ) {
        metrics.worksheetScalarCellsB++;
        warnings.push(
          `${stepLabel}: celula B com gabarito escalar (${kindDoGabarito}, "${renderAsDoPasso || "ausente"}"): o caderno prefere digitar (celula A)`
        );
      }
      if (role !== "C" && renderAsDoPasso === "fraction_bar") {
        metrics.worksheetLooseFractionBars++;
        warnings.push(
          `${stepLabel}: fraction_bar fora do instrumento (celula ${role || "?"}): a barra so vale como instrumento (papel C)`
        );
      }
      if (
        role !== "C" &&
        (FREE_TYPED_RENDER_AS.has(renderAsDoPasso) || renderAsDoPasso === "fraction_bar") &&
        Array.isArray(step?.options) &&
        step.options.length > 0
      ) {
        metrics.worksheetOptionsOnFreeSurface++;
        warnings.push(
          `${stepLabel}: options em superficie livre (${renderAsDoPasso}, ${step.options.length} option(s)): erros previstos vao em behaviorMisconceptions`
        );
      }
      if (
        role === "A" &&
        renderAsDoPasso === "text" &&
        isConceptualTextAnswer(step?.expectedAnswer) &&
        !(Array.isArray(step?.options) && step.options.length >= 2)
      ) {
        metrics.worksheetConceptualTypedCells++;
        warnings.push(
          `${stepLabel}: celula A com gabarito conceitual sem alternativas ("${String(step.expectedAnswer).trim().slice(0, 60)}"): o aluno teria de digitar a frase exata`
        );
      }
      // 2026-08-17 (visto em producao: "Decomponha o numeral MDCCCLXXXIV em
      // blocos" com gabarito "1884"): a instrucao pede uma DECOMPOSICAO ou
      // REPRESENTACAO e o gabarito e um numero puro; o aluno escreve a
      // decomposicao certa e e recusado. Medicao (warning) + regra no worker.
      if (
        role === "A" &&
        /\b(decomponha|decompor|represente como|escreva como|reescreva|expresse como|monte a (soma|expressao|equacao))\b/i.test(
          String(step?.instruction || "")
        ) &&
        /^-?\d+(?:[.,]\d+)?$/.test(String(step?.expectedAnswer ?? "").trim())
      ) {
        metrics.worksheetDecompositionWithNumericAnswer =
          (metrics.worksheetDecompositionWithNumericAnswer || 0) + 1;
        warnings.push(
          `${stepLabel}: instrucao pede decomposicao/representacao mas o gabarito e um numero ("${String(step.expectedAnswer).trim()}"): incoerencia instrucao x gabarito`
        );
      }
      // 2026-08-17: SENTINELA da tautologia de decomposicao por valor
      // posicional ("decomponha 12 em dezenas e unidades" com gabarito "12").
      // Usa o MESMO predicado do reparo (m7), que roda no structural-gate
      // ANTES daqui: em pipeline saudavel isto e inalcancavel. Se disparar, o
      // reparo nao rodou e a celula e uma pegadinha (o unico valor aceito e o
      // numero que o aluno foi mandado decompor) — a regua do repo classifica
      // isso como "gabarito que o aluno nao consegue digitar", bloqueante.
      // 2026-08-18 (fase 2): celula com caixinhas. A juncao das parcelas TEM
      // de reproduzir o gabarito, senao a folha desenha um campo que nunca
      // casa — "gabarito que o aluno nao consegue digitar" pela regua do repo,
      // logo bloqueante. A metrica de adocao existe para saber se o pedido do
      // professor esta chegando ao aluno (e para acusar regressao da passada
      // (m8), que roda antes daqui).
      if (Array.isArray(cell.fields) && cell.fields.length >= 2) {
        metrics.worksheetCellsWithFields++;
        const remonta = joinAnswerFields(
          cell.fields,
          cell.fields.map((f) => f?.expected)
        );
        const semEspaco = (v) => String(v ?? "").replace(/\s+/g, "");
        const coerente =
          semEspaco(remonta) === semEspaco(step?.expectedAnswer) &&
          role === "A" &&
          !(Array.isArray(step?.options) && step.options.length >= 2);
        if (!coerente) {
          metrics.worksheetIncoherentFields++;
          issues.push(
            `${stepLabel}: caixinhas nao reproduzem o gabarito ("${remonta}" x "${String(step?.expectedAnswer ?? "").trim()}")`
          );
        }
      }
      // 2026-08-18 (fase 3 do foco): o ROTULO curto e o que a trilha de passos
      // promove a leitura primaria — ela esconde a instrucao, entao um rotulo
      // que descreve outra celula vira a unica coisa que o aluno le sobre
      // aquele passo. Medido nos 139 rotulos de producao: 61% sincronizados,
      // 12% descrevendo outro passo, 27% abstracao legitima do subobjetivo.
      // So MEDICAO (warning): reescrever automaticamente degradaria rotulo bom
      // (a heuristica acusa "Capital politica" num tutor de capitais), e a
      // fonte que se usaria (`operation`) esta dessincronizada nas mesmas
      // celulas. A trilha se defende sozinha quando a regua nao passa.
      const outraCelula = labelBelongsToAnotherCell(steps, si);
      if (outraCelula >= 0) {
        metrics.worksheetLabelsDescribingAnotherCell++;
        warnings.push(
          `${stepLabel}: rotulo "${String(cell.label).trim()}" descreve o passo ${outraCelula + 1}, nao este`
        );
      }
      // 2026-08-18 (fase 5): instrucao comprida na celula. Medido: 5% acima de
      // 120 caracteres. So warning — o texto longo nao impede responder, mas
      // compete com o campo pela atencao e estoura a linha do cartao.
      // 2026-08-18 (fase 6): cobertura de givenRefs. O campo existia no
      // contrato desde o inicio e nunca foi emitido (0 de 112); o fallback
      // agora deriva por casamento de valor literal (81% das celulas). A
      // metrica existe para acompanhar a cobertura quando o planner comecar a
      // emitir — e para acusar se a derivacao regredir.
      if (Array.isArray(cell.givenRefs) && cell.givenRefs.length) {
        metrics.worksheetCellsWithGivenRefs++;
      }
      const tamanhoInstrucao = String(step?.instruction ?? "").trim().length;
      if (tamanhoInstrucao > 120) {
        metrics.worksheetLongInstructions++;
        warnings.push(`${stepLabel}: instrucao com ${tamanhoInstrucao} caracteres (meta: ate 120)`);
      }
      const numerosDaInstrucao = String(step?.instruction ?? "").match(/\d+(?:\/\d+)?/g) || [];
      if (numerosDaInstrucao.length && !/\d/.test(String(cell.label ?? ""))) {
        metrics.worksheetLabelsWithoutTheNumber++;
      }
      const tautologia = pendingDecompositionTautology(step);
      if (tautologia) {
        issues.push(
          `${stepLabel}: celula pede a decomposicao de ${tautologia.number} mas o gabarito e o proprio ${tautologia.number} (esperado "${tautologia.value}")`
        );
      }
      if (role === "A" && instructionPromisesManipulation(step?.instruction)) {
        metrics.worksheetTypedCellsPromisingInstrument++;
        warnings.push(
          `${stepLabel}: celula A com instrucao de manipulacao ("${String(step.instruction).trim().slice(0, 60)}"): a caixa de digitacao/selecao nao cumpre a ordem`
        );
      }
      if (role === "C") {
        metrics.worksheetCellsC++;
        const targetId =
          typeof cell.target === "object"
            ? String(cell.target?.id ?? "")
            : String(cell.target ?? "");
        const instrumentOk =
          instrument &&
          typeof instrument === "object" &&
          NOTEBOOK_C_V1.has(String(instrument.renderAs || "")) &&
          String(cell.instrumentRef ?? "").trim() === String(instrument.id ?? "").trim() &&
          targets.has(targetId.trim()) &&
          String(step.renderAs || "") === String(instrument.renderAs || "");
        if (!instrumentOk) {
          metrics.worksheetCellsCWithoutInstrument++;
          issues.push(`${stepLabel}: celula C sem instrumento/alvo valido apos o fallback`);
        }
      }
      const hits = forbidden.length ? forbiddenInteractionOfCell(step, forbidden) : [];
      if (hits.length) {
        metrics.worksheetForbiddenInteractionHits += hits.length;
        const msg = `${stepLabel}: interacao proibida para o perfil ${profile} (${hits.join(", ")})`;
        if (profile === "pre_literate") issues.push(msg);
        else warnings.push(msg);
      }
    });

    const figure = p?.notebook?.figure;
    if (
      figure &&
      typeof figure === "object" &&
      figure.expectedAnswer != null &&
      String(figure.expectedAnswer).trim() !== ""
    ) {
      issues.push(`${label}: figura do caderno (readOnly) nao pode ter expectedAnswer`);
    }

    // 2026-08-17 (stream M): givens que o fallback descartou por nao terem
    // valor literal no enunciado (alucinacao do planner: "24 alunos").
    const descartados = Array.isArray(p?.notebook?.discardedGivens)
      ? p.notebook.discardedGivens.length
      : 0;
    if (descartados > 0) {
      metrics.worksheetGivensDiscarded += descartados;
      warnings.push(
        `${label}: ${descartados} given(s) descartado(s) por nao ter valor literal no enunciado`
      );
    }

    // 2026-08-18 (fase 5): SENTINELA de alvo orfao. O fallback ((m10)) poda os
    // alvos que nenhuma celula aponta — um alvo orfao vira um chip "pendente"
    // que fica a atividade inteira sem poder ser respondido. Aqui deve dar
    // zero; se subir, a poda tem buraco.
    const listaDeAlvos = Array.isArray(instrument?.targets) ? instrument.targets : null;
    if (instrument && listaDeAlvos) {
      const apontados = new Set(
        (p.steps || [])
          .map((step) => {
            const alvo = step?.cell?.target;
            return typeof alvo === "object"
              ? String(alvo?.id ?? "").trim()
              : String(alvo ?? "").trim();
          })
          .filter(Boolean)
      );
      const orfaos = listaDeAlvos.filter((t) => !apontados.has(String(t?.id ?? "").trim()));
      if (orfaos.length) {
        metrics.worksheetOrphanInstrumentTargets += orfaos.length;
        warnings.push(
          `${label}: ${orfaos.length} alvo(s) do instrumento sem celula (${orfaos.map((t) => t?.id).join(", ")})`
        );
      }
    }

    const source = notebookInstrumentSource(p);
    metrics.worksheetInstrumentSources[label] = source;
    warnings.push(`${label}: origem do instrumento do caderno = ${source}`);
    const layoutSource = notebookLayoutSource(p);
    metrics.worksheetLayoutSources[label] = layoutSource;
    warnings.push(`${label}: origem do layout do caderno = ${layoutSource}`);

    // 2026-08-17 (visto em producao, "Multiplicacoes em Aventuras do Dia a
    // Dia"): a linha do template trazia "{step_3} = {step_4}", que com os
    // gabaritos oficiais e a igualdade FALSA "20 = 24". O fallback poda esses
    // trechos ((i2) de notebook-fallback.js); estas metricas existem para
    // acusar se algum escapar (devem ficar em zero) e para medir quantas
    // linhas repetem a mesma celula (renderizada como eco somente leitura).
    const linhasDoLayout = Array.isArray(p?.notebook?.layout?.rows) ? p.notebook.layout.rows : [];
    const gabaritoPorCelula = {};
    for (const step of Array.isArray(p?.steps) ? p.steps : []) {
      const id = String(step?.cell?.id ?? step?.graphNodeId ?? step?.id ?? "").trim();
      if (id) gabaritoPorCelula[id] = String(step?.expectedAnswer ?? "").trim();
    }
    for (const linha of linhasDoLayout) {
      const refs = [...String(linha).matchAll(/\{\s*([^{}\s]+)\s*\}/g)].map((m) => m[1]);
      if (new Set(refs).size !== refs.length) {
        metrics.worksheetTemplateRepeatedCell++;
        warnings.push(
          `${label}: linha do caderno repete a mesma celula ("${String(linha).slice(0, 70)}")`
        );
      }
      for (const trecho of String(linha).split(";")) {
        const substituido = trecho.replace(/\{\s*([^{}\s]+)\s*\}/g, (m, id) => {
          const v = gabaritoPorCelula[String(id).trim()];
          if (!v) return m;
          return /[+\-*/·×÷]/.test(v) ? `(${v})` : v;
        });
        if (templateSegmentIsFalse(substituido) === true) {
          // SENTINELA: o fallback ((i2)) ja poda esses trechos com o MESMO
          // detector, entao aqui a metrica deve ficar em zero; se subir, e
          // porque a poda tem um buraco. Warning, nao issue: rejeitar a
          // geracao inteira por uma linha DECORATIVA e pior para o professor
          // do que entregar (politica "reparar > dropar > rejeitar").
          metrics.worksheetTemplateFalseEquality++;
          warnings.push(
            `${label}: linha do caderno afirma uma igualdade FALSA sob os gabaritos ("${substituido.trim().slice(0, 70)}")`
          );
        }
      }
    }

    if (temCell && !temBC && perfilPermiteBC) {
      metrics.worksheetProblemsOnlyA++;
      warnings.push(`${label}: caderno so com celulas A (nenhuma celula B ou C)`);
    }
    if (temCell && !instrument) metrics.worksheetProblemsWithoutInstrument++;
  }
  if (metrics.worksheetStepsWithoutCell > 0) {
    warnings.push(`${metrics.worksheetStepsWithoutCell} passo(s) do caderno sem cell`);
  }

  // (fase 7) Agregacao de riqueza no nivel do TUTOR. Por que no tutor e nao no
  // problema: um problema de 3 celulas com 3 multiple_choice e legitimo (uma
  // rodada de classificacao); um TUTOR inteiro em que o aluno so escolhe entre
  // alternativas prontas nao e um caderno, e um questionario. A regua so vale a
  // partir de 4 celulas para nao reprovar caderno curto.
  //
  // 2026-08-18: entra como AVISO, nao como reprovacao. A politica do repo e
  // "reparar > dropar > rejeitar", e o reparo (roteamento por conteudo) ainda
  // nao existe: bloquear agora pararia a geracao em producao sem oferecer
  // saida. Quando o reparo estiver no ar, `worksheetTutorAllPassive` vira
  // issue.
  metrics.worksheetDistinctSurfaces = superficiesDoTutor.size;
  metrics.worksheetPassiveShare =
    metrics.worksheetCells > 0 ? metrics.worksheetPassiveCells / metrics.worksheetCells : 0;
  if (metrics.worksheetCells >= 4) {
    if (metrics.worksheetPassiveCells === metrics.worksheetCells) {
      metrics.worksheetTutorAllPassive = 1;
      warnings.push(
        `caderno inteiro em selecao passiva: ${metrics.worksheetCells}/${metrics.worksheetCells} celulas em MC/V-F (o aluno nunca constroi nem manipula nada)`
      );
    } else if (metrics.worksheetPassiveShare > 0.5) {
      warnings.push(
        `caderno com ${(metrics.worksheetPassiveShare * 100).toFixed(0)}% de celulas em selecao passiva (${metrics.worksheetPassiveCells}/${metrics.worksheetCells})`
      );
    }
    if (metrics.worksheetDistinctSurfaces <= 1) {
      warnings.push(
        `caderno com uma unica superficie em todas as celulas (zero variedade de resposta)`
      );
    }
  }
  return { issues, warnings, metrics };
}

/**
 * Gate universal — retorna { pass, issues, metrics }
 * opts.requestedProblems: quantos problemas o professor pediu (F9 — under-delivery).
 */
export function runQualityGate(tutor, opts = {}) {
  // 2026-08-05 (modo simples): o criador desligou a interface rica — as
  // réguas que MEDEM riqueza de interface (interação semântica, variedade de
  // modalidade, teto de seleção passiva, monotonia passiva, modelo da
  // disciplina) não se aplicam: um STI 100% multiple_choice/text é o
  // COMPORTAMENTO PEDIDO, não um defeito. Todas as réguas de CONTEÚDO
  // (gabarito vazio, hints que entregam, distratores, perda de steps,
  // under-delivery) continuam valendo integralmente.
  // opts.simpleInterface permite teste unitário sem AsyncLocalStorage.
  const simpleInterfaceMode = opts.simpleInterface ?? isSimpleInterface();
  // 2026-08-16 (caderno F2): modo tri-estado com a mesma escada de ancoras dos
  // gates (opts > _metadata > AsyncLocalStorage). No worksheet as reguas que
  // MEDEM riqueza de interface por passo (interacao semantica, variedade de
  // modalidade, teto/monotonia de selecao passiva, modelo da disciplina) nao se
  // aplicam: o caderno e uma unica superficie rica (celulas + instrumento) e
  // uma celula A "dado" e por definicao seleção/digitacao. Em troca entram as
  // reguas proprias do caderno (bloco "caderno" mais abaixo). O clamp de
  // simple continua exclusivo do modo simples: worksheet nunca e simples.
  const modoValido = (v) => typeof v === "string" && INTERFACE_MODES.includes(v);
  const interfaceMode = modoValido(opts.interfaceMode)
    ? opts.interfaceMode
    : modoValido(tutor?._metadata?.interfaceMode)
      ? tutor._metadata.interfaceMode
      : simpleInterfaceMode
        ? "simple"
        : isWorksheetInterface()
          ? "worksheet"
          : "rich";
  const worksheetMode = !simpleInterfaceMode && interfaceMode === "worksheet";
  // As reguas de riqueza por passo sao desligadas em simple E em worksheet.
  const richnessRulesOff = simpleInterfaceMode || worksheetMode;
  const issues = [];
  const metrics = {
    problems: 0,
    totalSteps: 0,
    totalDistractors: 0,
    genericDistractors: 0,
    visualStepsWithoutInterfaceBm: 0,
    // §6 diagnóstico autossuficiente (2026-07-18): contadores brutos da medição
    // de distratores com id específico (pct formatado sai no retorno, como os
    // demais "%"). Anti-inflação: conta id que PARECE específico, não ancoragem
    // real no catálogo — ver comentário no cabeçalho.
    specificDistractors: 0,
    behaviorMisconceptionDistractors: 0,
    numericWrongAnswers: 0,
    groundedWrongAnswers: 0,
    ungroundedWrongAnswerSteps: [],
    stepsWithoutKc: 0,
    stepsWithEmptyAnswer: 0,
    stepsWithPlaceholderAnswer: 0,
    hintsRevealingAnswer: 0,
    // 2026-08-09: explicação do passo que não enuncia o gabarito (ver
    // shared/answer-coherence.js). A lista nomeia os passos para o professor
    // e para o auditor offline não terem que recomputar.
    stepsWithIncoherentExplanation: 0,
    incoherentExplanationSteps: [],
    // Auditoria de interface 2026-08-02: o passo é uma pergunta dissertativa
    // disfarçada de interação? E a sequência avança ou repete a mesma resposta?
    stepsWithUnproducibleAnswer: 0,
    maxConsecutiveSameAnswer: 0,
    // 2026-08-04 (avaliação dos tutores): a corrida acima só vê passos VIZINHOS.
    // A redundância apontada em "A Brinquedoteca do Pedro" era à distância — os
    // passos 1 e 3 do mesmo problema pediam a mesma soma (gabarito "11"), e o
    // passo 3 do problema seguinte repetia "17". O aluno resolve a mesma conta
    // duas vezes e o relatório do professor credita duas oportunidades de
    // prática onde houve uma.
    repeatedAnswerInProblem: 0,
    // Duas misconceptions com o MESMO wrongAnswer colidem no runtime: a segunda
    // nunca dispara e o scaffold dela fica órfão.
    stepsWithDuplicateWrongAnswer: 0,
    stepsWithLowDistractorCount: 0,
    optionsMissingIsCorrect: 0,
    // D1 (2026-04-22): Diversidade
    renderAsDistinctCount: 0,
    bloomLevelDistinctCount: 0,
    problemSignatureCollision: false,
    problemsShareSignature: 0,
    duplicateKcSequenceProblemPairs: 0,
    // D2 (2026-05-28): Monotonia passiva + perda de steps (destruction cascade)
    passiveSteps: 0,
    passiveShare: 0,
    designedSteps: null,
    stepLossRatio: null,
    semanticManipulativeSteps: 0,
    semanticManipulativeShare: 0,
    maxSameRenderShare: 0,
    responseModalities: [],
    responseModalityDistinctCount: 0,
    disciplinePolicyMatched: null,
    disciplinePolicyMissing: false,
    affordancePoliciesMatched: [],
    affordancePoliciesMissing: [],
    geometryModelRequiredSteps: 0,
    geometryModelMissingSteps: 0,
    geometryDirectTargetMissingSteps: 0,
    geometryGenericNumericFeedbackSteps: 0,
    geometryOutOfDomainFeedbackSteps: 0,
    requestedMinSteps: 0,
    requestedMinStepsPerProblem: false,
    problemsWithoutBehaviorGraph: 0,
    invalidBehaviorGraphs: 0,
    graphSemanticViolations: 0,
    unclassifiedDiagnosticMisconceptions: 0,
    specificAdaptiveSteps: 0,
    genericOnlyAdaptiveSteps: 0,
    stepsWithoutAdaptiveCoverage: 0,
    constructedResponseSteps: 0,
    constructedStepsWithoutSpecificDiagnosis: 0,
  };
  const warnings = [];

  if (!tutor || !tutor.problems) {
    return { pass: false, issues: ["tutor sem campo problems"], metrics };
  }
  if (tutor.problems.length < GATE_THRESHOLDS.minProblems) {
    issues.push(`menos que ${GATE_THRESHOLDS.minProblems} problems (tem ${tutor.problems.length})`);
  }
  metrics.problems = tutor.problems.length;

  const inferredStepRequest = inferRequestedStepMinimum(opts.requestDescription || "");
  const requestedMinSteps = Number(opts.requestedMinSteps) || inferredStepRequest.minimum || 0;
  const requestedMinStepsPerProblem =
    opts.requestedMinStepsPerProblem === true || inferredStepRequest.perProblem;
  metrics.requestedMinSteps = requestedMinSteps;
  metrics.requestedMinStepsPerProblem = requestedMinStepsPerProblem;
  const geometryTutorContext = normalizeRequestText(
    [
      tutor.title,
      tutor.topic,
      tutor.description,
      tutor.discipline,
      opts.requestTopic,
      opts.requestDescription,
    ]
      .filter(Boolean)
      .join(" ")
  );
  // 2026-08-05 (bateria Artes/elementos visuais): geometryStepIntent foi
  // desenhado para Matemática (contar/identificar lados-vértices de polígono),
  // mas nunca checava a disciplina — só palavra-chave no texto. Um STI de
  // Artes sobre "forma geométrica vs. orgânica" (vocabulário curricular
  // correto, BNCC) batia nas mesmas palavras e era rejeitado inteiro. A prova
  // de que é viés estrutural, não acaso: o MESMO STI classificava "forma
  // orgânica" (fora do dicionário) como válido e só punia o lado geométrico
  // do próprio conteúdo pedido.
  //
  // Lista de EXCLUSÃO, não de permissão: `tutor.discipline` costuma vir
  // vazio/indefinido em geração de teste e em parte do fluxo legado — exigir
  // "=== matematica" desligaria o gate por padrão sempre que a disciplina não
  // fosse setada, incluindo os STIs de geometria que ele foi feito para
  // proteger. Só desliga para as disciplinas onde já ficou provado que o
  // vocabulário geométrico é conteúdo curricular legítimo, não sinal de
  // tarefa matemática.
  const GEOMETRY_EXCLUDED_DISCIPLINE_AREAS = new Set([
    "artes",
    "portugues",
    "linguas",
    "filosofia",
    "historia",
    "geografia",
    "ed_fisica",
  ]);
  const geometryDisciplineArea = detectDisciplineArea(tutor.discipline);
  const geometryAppliesToDiscipline =
    !GEOMETRY_EXCLUDED_DISCIPLINE_AREAS.has(geometryDisciplineArea);

  // F9 (benchmark 2026-06-10): under-delivery de problemas. O pipeline chegou a
  // entregar 1 de 3 problemas pedidos (judge deu 45 no STI mirrado) e o gate só
  // checava minProblems=1. Piso: 2/3 do pedido (3→2, 4→3). Abaixo do piso
  // bloqueia; entre o piso e o pedido vira warning observável.
  const requestedProblems = Number(opts.requestedProblems) || 0;
  if (requestedProblems >= 2) {
    metrics.requestedProblems = requestedProblems;
    const floor = Math.ceil((requestedProblems * 2) / 3);
    if (metrics.problems < floor) {
      issues.push(
        `pipeline entregou ${metrics.problems}/${requestedProblems} problemas pedidos (mínimo ${floor})`
      );
    } else if (metrics.problems < requestedProblems) {
      warnings.push(`entregou ${metrics.problems}/${requestedProblems} problemas pedidos`);
    }
  }

  for (const [pi, p] of (tutor.problems || []).entries()) {
    if (!p.steps || p.steps.length < GATE_THRESHOLDS.minStepsPerProblem) {
      issues.push(`P${pi + 1} sem steps`);
      continue;
    }

    if (!p.behaviorGraph?.nodes?.length) {
      metrics.problemsWithoutBehaviorGraph++;
      issues.push(`P${pi + 1} sem behaviorGraph`);
    } else {
      const graphAudit = auditBehaviorGraph(p.behaviorGraph, p.steps || []);
      metrics.unclassifiedDiagnosticMisconceptions +=
        graphAudit.unclassifiedDiagnosticMisconceptions?.length || 0;
      if (!graphAudit.ok) {
        metrics.invalidBehaviorGraphs++;
        const semanticViolations = countBehaviorGraphSemanticDefects(graphAudit);
        metrics.graphSemanticViolations += semanticViolations;
        issues.push(
          `P${pi + 1} behaviorGraph inválido (${graphAudit.dangling.length} dangling, ${semanticViolations} violações semânticas)`
        );
      }
    }
    const coverage = adaptiveCoverageForProblem(p);
    metrics.specificAdaptiveSteps += coverage.specific;
    metrics.genericOnlyAdaptiveSteps += coverage.genericOnly;
    metrics.stepsWithoutAdaptiveCoverage += coverage.missing;
    metrics.constructedResponseSteps += coverage.constructed;
    metrics.constructedStepsWithoutSpecificDiagnosis += coverage.constructedWithoutSpecific;
    for (const [si, step] of p.steps.entries()) {
      metrics.totalSteps++;
      const label = `P${pi + 1}S${si + 1}`;

      // (3) kc presente
      if (!step.kc || String(step.kc).trim() === "") {
        metrics.stepsWithoutKc++;
      }

      // 2026-08-09 (auditoria de conformidade STI): a explicação do passo
      // precisa enunciar o gabarito. Achado numa geração REAL de produção:
      // "Quantas dezenas ficam?" com gabarito 74 e explicação dizendo
      // "permanecem 6 dezenas" — quem responde 6, que é o certo segundo a
      // explicação, é marcado como errado. Passou por todos os gates porque
      // nada olhava a coerência INTERNA do passo.
      //
      // Entra como WARNING de propósito, seguindo o padrão do repo (regra forte
      // no worker-prompt + warning de medição aqui): a régua é nova e a taxa de
      // rejeição não deve se mexer antes de haver série histórica. Medido em
      // 10 de 1.759 passos publicados com explicação e gabarito (0,6%).
      if (explicacaoNaoEnunciaGabarito(step)) {
        metrics.stepsWithIncoherentExplanation++;
        metrics.incoherentExplanationSteps.push(label);
      }
      // (5) expectedAnswer nao-vazio
      const ea = step.expectedAnswer != null ? String(step.expectedAnswer).trim() : "";
      if (!ea) {
        metrics.stepsWithEmptyAnswer++;
        issues.push(`${label}: expectedAnswer vazio`);
      }

      // (6) Todo option tem isCorrect explicito
      const options = Array.isArray(step.options) ? step.options : [];
      for (const o of options) {
        if (o && typeof o.isCorrect !== "boolean") {
          metrics.optionsMissingIsCorrect++;
        }
      }

      if (/^(?:[—–-]|n\/?a|not applicable|tbd|placeholder)$/i.test(ea)) {
        metrics.stepsWithPlaceholderAnswer++;
        issues.push(`${label}: expectedAnswer sentinela "${ea}"`);
      }

      // (1) distratores genericos
      const distractors = options.filter((o) => o && o.isCorrect === false);
      for (const d of distractors) {
        metrics.totalDistractors++;
        if (isGenericMisc(d)) metrics.genericDistractors++;
        if (isSpecificMisconceptionId(d?.misconceptionId)) metrics.specificDistractors++;
      }

      // 2026-07-19 (revisão anti-gaming da união): bm só conta na superfície
      // medida quando o runtime realmente roteia por ela — options.length === 0
      // (contrato sourceMisconceptions da PR #27). bm em step COM options é
      // rota morta: não soma, não dilui, não pontua (mata a diluição em MC e a
      // dupla contagem estruturalmente — as duas superfícies são exclusivas).
      // "Específico" para bm exige o registro completo (id+type+source), como
      // no grafo: id específico com source de fallback conta como genérico.
      const behaviorMiscs =
        options.length === 0 && Array.isArray(step.behaviorMisconceptions)
          ? step.behaviorMisconceptions
          : [];
      // 2026-07-19 (verificação da regra de leitura de interface — gotcha 4b):
      // a REGRA FORTE do worker manda componentes visuais/de escala nascerem com
      // behaviorMisconceptions de leitura da própria config; sem MEDIÇÃO a
      // compliance estocástica é invisível. Warning, nunca issue.
      const VISUAL_SCALE_RENDER_AS = new Set([
        "fraction_bar",
        "number_line",
        "abacus",
        "place_value_blocks",
        "clock_face",
      ]);
      if (
        VISUAL_SCALE_RENDER_AS.has(String(step.renderAs || "")) &&
        options.length === 0 &&
        behaviorMiscs.length === 0
      ) {
        metrics.visualStepsWithoutInterfaceBm++;
      }

      for (const bm of behaviorMiscs) {
        metrics.behaviorMisconceptionDistractors++;
        if (isSpecificGraphMisconception(bm)) metrics.specificDistractors++;
        else metrics.genericDistractors++;
      }

      // 2026-08-09 (gotcha 4 — regra forte precisa de medição): o prompt do
      // agent3b passou a exigir que a resposta errada seja DERIVADA DOS DADOS
      // do passo, nunca uma perturbação do gabarito. Compliance de prompt é
      // estocástica; sem contador, a regra vira decoração e ninguém percebe a
      // regressão. Aqui só se mede o que os AGENTES escreveram — o que veio do
      // motor determinístico não entra, porque a métrica existe para vigiar a
      // geração, não para se auto-aprovar.
      //
      // Linha de base do dia em que a regra entrou: das respostas erradas
      // numéricas publicadas, apenas parte era derivável dos dados. Warning,
      // nunca issue — a série histórica é que autoriza promover a bloqueante.
      for (const bm of Array.isArray(step.behaviorMisconceptions)
        ? step.behaviorMisconceptions
        : []) {
        if (String(bm?.source ?? "") === "regra_falsa_aterrada") continue;
        const aterrada = isGroundedWrongAnswer(step, p, bm?.wrongAnswer);
        if (aterrada === null) continue;
        metrics.numericWrongAnswers++;
        if (aterrada) metrics.groundedWrongAnswers++;
        else metrics.ungroundedWrongAnswerSteps.push(`${label}:"${bm?.wrongAnswer}"`);
      }

      // (4) distratores unicos minimos — exceto perguntas booleanas e
      // steps de resposta construída (sem alternativas / renderAs != multiple_choice).
      // 2026-04-25: pergunta booleana (verdadeiro/falso, sim/nao) tem natureza
      // 2-opções; não é bug ter <2 distractors. Antes pipeline preenchia com
      // "Outro valor" e "Nao sei" — pedagogicamente ruim. Agora respeita.
      // 2026-05-20: steps de resposta construída (text_input, numeric_input, etc.)
      // não possuem alternativas por design — não penalizar.
      const isBooleanStep = /^(verdadeiro|falso|sim|n[aã]o|certo|errado)$/i.test(String(ea).trim());
      const isConstructedResponse =
        options.length === 0 || (step.renderAs && step.renderAs !== "multiple_choice");
      const uniqueMiscs = new Set(distractors.map((d) => d.misconceptionId).filter(Boolean));
      if (
        !isBooleanStep &&
        !isConstructedResponse &&
        uniqueMiscs.size < GATE_THRESHOLDS.minUniqueDistractorsPerStep
      ) {
        metrics.stepsWithLowDistractorCount++;
      }

      // (2) NENHUMA pista revela a resposta — decisão do usuário em 2026-08-02.
      //
      // A versão anterior isentava a última pista, tratando-a como bottom-out do
      // CTAT (o tutor entrega a resposta depois do scaffolding). O produto seguiu
      // o caminho oposto: a dica orienta até o fim, e quem conclui o passo é o
      // aluno. Portanto fiscalizamos TODOS os níveis, sem exceção de posição.
      const hints = Array.isArray(step.hints) ? step.hints : [];
      if (ea) {
        const progressiveHints = hints;
        for (const h of progressiveHints) {
          const msg = typeof h === "string" ? h : h?.message || h?.text || "";
          if (!msg) continue;
          if (hintRevealsExpectedAnswer(msg, ea)) {
            metrics.hintsRevealingAnswer++;
            break;
          }
        }
      }

      // O gate de tópico só garante que exista ALGUM manipulativo no STI. A
      // auditoria de geometria mostrou que isso permitia três passos
      // axis+bar+cards passarem porque um quarto passo usava geometry_shape.
      // Aqui a affordance é verificada por passo e pela ação pedida ao aluno.
      const geometryIntent = geometryAppliesToDiscipline
        ? geometryStepIntent(step, geometryTutorContext)
        : null;
      if (geometryIntent) {
        metrics.geometryModelRequiredSteps++;
        const geometryFailure = geometryAffordanceFailure(step, geometryIntent);
        if (geometryFailure === "missing-model") {
          metrics.geometryModelMissingSteps++;
          const types = dynamicElementTypes(step);
          const dashboardOnly =
            step?.renderAs === "dynamic_spec" &&
            types.length > 0 &&
            types.every((type) =>
              ["annotation", "axis", "bar", "card", "label", "table"].includes(type)
            );
          issues.push(
            dashboardOnly
              ? `${label}: tarefa geométrica usa custom apenas com cartões/eixo/barra, sem figura, lados ou vértices`
              : `${label}: tarefa geométrica sem representação visual da figura, lados ou vértices`
          );
        } else if (geometryFailure === "missing-direct-target") {
          metrics.geometryDirectTargetMissingSteps++;
          issues.push(
            `${label}: identificação geométrica responde por cartão/campo em vez de alvo na própria figura`
          );
        }

        const feedbackAudit =
          geometryIntent.kind === "count"
            ? inspectGeometryCountingFeedbacks(step, geometryIntent.countingTarget)
            : { genericOnly: false, outOfDomain: [] };
        if (feedbackAudit.genericOnly) {
          metrics.geometryGenericNumericFeedbackSteps++;
          issues.push(`${label}: feedback numérico genérico não remedia a contagem geométrica`);
        }
        if (feedbackAudit.outOfDomain.length > 0) {
          metrics.geometryOutOfDomainFeedbackSteps++;
          issues.push(
            `${label}: feedback de contagem geométrica fala em sinais, ordem das operações ou cálculo fora do domínio`
          );
        }
      }
    }
  }

  // ============================================================
  // D1: Checagens de diversidade (warnings, nao bloqueantes)
  // ============================================================
  const allRenderAs = new Set();
  const renderCounts = new Map();
  const responseModalities = new Set();
  const allSteps = [];
  const problemSignatures = [];
  const kcOnlySignatures = [];
  for (const p of tutor.problems || []) {
    const sig = [];
    const kcSeq = [];
    // Corrida de gabaritos iguais em passos consecutivos dentro do problema.
    let corridaAtual = 0;
    let gabaritoAnterior = null;
    // Repetição À DISTÂNCIA no mesmo problema (passo 1 e passo 3).
    const gabaritosVistos = new Set();
    for (const step of p.steps || []) {
      allSteps.push(step);

      // (1) O aluno consegue PRODUZIR este gabarito nesta superfície?
      const gabarito = String(step?.expectedAnswer ?? "").trim();
      const componente = String(step?.renderAs || "");
      const modoSpec = String(step?.componentProps?.spec?.interaction?.mode || "");
      const digitado =
        TYPED_ENTRY_RENDER_AS.has(componente) ||
        (componente === "dynamic_spec" && modoSpec === "input-value");
      if (
        digitado &&
        !ASSEMBLED_ANSWER_RENDER_AS.has(componente) &&
        typedAnswerObstacle(gabarito)
      ) {
        metrics.stepsWithUnproducibleAnswer++;
      }

      // (2) Passos consecutivos com o mesmo gabarito.
      const chaveGabarito = gabarito.toLowerCase();
      if (chaveGabarito && chaveGabarito === gabaritoAnterior) {
        corridaAtual += 1;
      } else {
        corridaAtual = 1;
        gabaritoAnterior = chaveGabarito || null;
      }
      // A corrida já cobre o caso vizinho; aqui só conta a repetição a
      // distância, para as duas medidas não se somarem sobre o mesmo passo.
      if (chaveGabarito && corridaAtual === 1) {
        if (gabaritosVistos.has(chaveGabarito)) metrics.repeatedAnswerInProblem++;
        else gabaritosVistos.add(chaveGabarito);
      }
      if (corridaAtual > metrics.maxConsecutiveSameAnswer) {
        metrics.maxConsecutiveSameAnswer = corridaAtual;
      }

      // (3) Dois erros previstos DIFERENTES com a MESMA resposta errada.
      // 2026-08-06: a medida somava behaviorMisconceptions + options e comparava
      // só o VALOR, mas as duas listas são ESPELHOS — o mesmo erro aparece nas
      // duas (a option carrega o misconceptionId, o bm carrega o diagnóstico
      // completo). Isso contava espelho como colisão: em 3 STIs reais, 7 dos 9
      // casos acusados tinham UM único id, ou seja, nada colidia. O dano real de
      // runtime é outro — DOIS ids distintos na mesma resposta errada, aí o
      // _checkMisconceptions casa o primeiro e o scaffold do segundo fica órfão.
      // Agrupa por resposta e só conta quando há mais de um id de fato.
      const errosPrevistos = [
        ...(Array.isArray(step?.behaviorMisconceptions) ? step.behaviorMisconceptions : []),
        ...(Array.isArray(step?.options) ? step.options.filter((o) => o && !o.isCorrect) : []),
      ];
      const idsPorRespostaErrada = new Map();
      for (const erro of errosPrevistos) {
        const resposta = String(erro?.wrongAnswer ?? erro?.value ?? "")
          .trim()
          .toLowerCase();
        if (!resposta) continue;
        // Distrator sem id não é diagnóstico concorrente: não pode gerar
        // scaffold órfão, então não conta como colisão.
        const id = String(erro?.id ?? erro?.misconceptionId ?? "").trim();
        if (!id) continue;
        if (!idsPorRespostaErrada.has(resposta)) idsPorRespostaErrada.set(resposta, new Set());
        idsPorRespostaErrada.get(resposta).add(id);
      }
      if ([...idsPorRespostaErrada.values()].some((ids) => ids.size > 1)) {
        metrics.stepsWithDuplicateWrongAnswer++;
      }
      responseModalities.add(responseModalityFor(step));
      if (step.renderAs) {
        const renderAs = String(step.renderAs);
        allRenderAs.add(renderAs);
        renderCounts.set(renderAs, (renderCounts.get(renderAs) || 0) + 1);
        if (PASSIVE_RENDER_AS.has(renderAs)) metrics.passiveSteps++;
        if (
          SEMANTIC_MANIPULATIVES.has(renderAs) ||
          (renderAs === "dynamic_spec" && isAnswerProducingDynamicSpec(step))
        ) {
          metrics.semanticManipulativeSteps++;
        }
      }
      sig.push((step.kc || "?") + ":" + (step.renderAs || "?"));
      kcSeq.push(step.kc || "?");
    }
    problemSignatures.push(sig.join("|"));
    kcOnlySignatures.push(kcSeq.join(">"));
  }
  metrics.renderAsDistinctCount = allRenderAs.size;
  metrics.passiveShare = metrics.totalSteps > 0 ? metrics.passiveSteps / metrics.totalSteps : 0;
  metrics.semanticManipulativeShare =
    metrics.totalSteps > 0 ? metrics.semanticManipulativeSteps / metrics.totalSteps : 0;
  metrics.maxSameRenderShare =
    metrics.totalSteps > 0 ? Math.max(0, ...renderCounts.values()) / metrics.totalSteps : 0;
  metrics.responseModalities = [...responseModalities].sort();
  metrics.responseModalityDistinctCount = metrics.responseModalities.length;
  const singleRenderAs = metrics.renderAsDistinctCount === 1 ? [...allRenderAs][0] : null;

  // 2026-08-02 (auditoria): subentrega de UM passo deixa de rejeitar a geração.
  //
  // "Concentração comum" falhou 2/2 vezes com 4/5 passos. A cadeia era honesta:
  // o Agent 6 materializou um passo com expectedAnswer "ok", o sanitizer o
  // removeu (correto — não há resposta recuperável) e o gate derrubava o STI
  // inteiro. O professor perdia 5 minutos de geração e ~US$0,15 para receber
  // "tente novamente", enquanto os 4 passos entregues estavam perfeitos.
  //
  // Um passo a menos vira aviso registrado; falta maior continua bloqueando,
  // porque aí o pipeline realmente não entendeu o pedido.
  const TOLERANCIA_SUBENTREGA = 1;
  if (requestedMinSteps > 0) {
    if (requestedMinStepsPerProblem) {
      const shortProblems = (tutor.problems || [])
        .map((problem, index) => ({ index: index + 1, count: problem?.steps?.length || 0 }))
        .filter((problem) => problem.count < requestedMinSteps);
      // Sem tolerância aqui de propósito: quando o professor fixa um mínimo POR
      // problema e os problemas saem curtos, o pipeline leu o pedido errado —
      // é falha sistemática, não um passo perdido no caminho.
      if (shortProblems.length) {
        issues.push(
          `passos insuficientes por problema: mínimo solicitado ${requestedMinSteps}; ${shortProblems
            .map((problem) => `P${problem.index}=${problem.count}`)
            .join(", ")}`
        );
      }
    } else if (metrics.totalSteps < requestedMinSteps) {
      const falta = requestedMinSteps - metrics.totalSteps;
      const detalhe = `pipeline entregou ${metrics.totalSteps}/${requestedMinSteps} passos mínimos solicitados`;
      if (falta <= TOLERANCIA_SUBENTREGA && metrics.totalSteps >= 3) {
        metrics.stepShortfallTolerated = falta;
        warnings.push(`${detalhe} (tolerado: falta ${falta})`);
      } else {
        issues.push(detalhe);
      }
    }
  }

  // designed-vs-shipped: o uiDesigner registra quantos steps PLANEJOU. Se o
  // pipeline entregou muito menos, é destruição (delete-instead-of-repair).
  const designed = Number(tutor._metadata?.uiDesigner?.totalSteps) || null;
  metrics.designedSteps = designed;
  if (designed && designed > 0) {
    metrics.stepLossRatio = Math.max(0, (designed - metrics.totalSteps) / designed);
  }
  const bloomLevels = new Set();
  const kcs = Array.isArray(tutor.knowledgeComponents) ? tutor.knowledgeComponents : [];
  for (const k of kcs) if (k && k.bloomLevel) bloomLevels.add(String(k.bloomLevel));
  metrics.bloomLevelDistinctCount = bloomLevels.size;
  // 2026-08-06: auditoria de 96 geracoes mostrou 63% dos KCs rotulados "apply" e
  // ZERO "remember"/"create" — o agente 1 escolhia UM nivel para o topico inteiro
  // e o planner do agente 6 nao tinha de onde variar. Medimos duas coisas que o
  // contador de niveis distintos nao pega: se a escada SOBE junto com o DAG de
  // prerequisitos, e se a amplitude acompanha o tamanho do conjunto de KCs.
  metrics.bloomMonotonicityViolations = 0;
  if (kcs.length >= 2) {
    const ordem = ["remember", "understand", "apply", "analyze", "evaluate", "create"];
    const rank = (kc) => ordem.indexOf(String(kc?.bloomLevel || "").toLowerCase());
    const porId = new Map(kcs.filter((k) => k?.id).map((k) => [k.id, k]));
    for (const kc of kcs) {
      const meu = rank(kc);
      if (meu < 0) continue;
      for (const pid of Array.isArray(kc.prerequisites) ? kc.prerequisites : []) {
        const pre = porId.get(pid);
        if (!pre) continue;
        const dele = rank(pre);
        if (dele >= 0 && dele > meu) metrics.bloomMonotonicityViolations += 1;
      }
    }
  }
  if (problemSignatures.length >= 2) {
    const first = problemSignatures[0];
    const allSame = problemSignatures.every((s) => s === first);
    metrics.problemSignatureCollision = allSame;
    metrics.problemsShareSignature = allSame ? problemSignatures.length : 0;
  }
  // 2026-08-07: `problemSignatureCollision` só acende quando TODOS os
  // problemas colidem — não pega o caso parcial (2 de 4). Jogado ao vivo, um
  // STI real ("Desafios do Reagrupamento", BFZ9JW) tinha o problema fácil e o
  // difícil com a MESMA sequência ordenada de KCs (regra 5 do planner —
  // "exercicios NAO podem exercitar a mesma combinacao de KCs" — violada
  // silenciosamente: cada assinatura individualmente era única o bastante
  // pra não bater no allSame acima, porque o renderAs de um passo diferia).
  // A comparação aqui ignora renderAs de propósito: a mesma sequência de KCs
  // é o MESMO problema pedagógico, mesmo com renderAs ou números diferentes.
  const kcSeqContagem = new Map();
  for (const s of kcOnlySignatures) {
    if (!s) continue;
    kcSeqContagem.set(s, (kcSeqContagem.get(s) || 0) + 1);
  }
  metrics.duplicateKcSequenceProblemPairs = [...kcSeqContagem.values()]
    .filter((n) => n > 1)
    .reduce((soma, n) => soma + (n * (n - 1)) / 2, 0);

  // A interface precisa materializar a habilidade quando o próprio tópico tem
  // uma affordance canônica. Isso é bloqueante: a tentativa seguinte recebe o
  // issue e regenera os steps, em vez de publicar um STI só com MC/keypad.
  const affordanceBlob = [
    tutor.title,
    tutor.topic,
    tutor.description,
    opts.requestTopic,
    opts.requestDescription,
  ]
    .filter(Boolean)
    .join(" ");
  // (modo simples: as affordances canônicas são superfícies ricas por
  // definição — exigi-las contradiria a escolha do criador.)
  if (!simpleInterfaceMode && metrics.totalSteps >= 3) {
    for (const policy of AFFORDANCE_POLICIES) {
      if (!policy.match.test(affordanceBlob)) continue;
      metrics.affordancePoliciesMatched.push(policy.id);
      const satisfied = allSteps.some((step) => {
        const renderAs = String(step?.renderAs || "");
        if (!policy.accepted.has(renderAs)) return false;
        if (renderAs === "dynamic_spec" && policy.dynamicPredicate) {
          return policy.dynamicPredicate(step);
        }
        return true;
      });
      if (!satisfied) {
        metrics.affordancePoliciesMissing.push(policy.id);
        issues.push(policy.message);
      }
    }
  }

  // Contexto concreto e surface precisam coincidir. Uma pizza desenhada ao
  // lado de uma resposta abstrata nao conta: o aluno deve clicar nas fatias.
  for (const step of allSteps) {
    const instruction = `${step?.instruction || ""} ${step?.questionText || ""}`;
    if (/\bpizza(s)?\b/i.test(instruction) && step?.renderAs === "fraction_bar") {
      if (step?.componentProps?.visualModel !== "pizza") {
        issues.push("fração em contexto de pizza sem visualModel='pizza'");
        break;
      }
    }
  }

  // Garantias UNIVERSAIS de riqueza pedagógica. As policies acima escolhem a
  // surface canônica em casos conhecidos; estes gates cobrem conteúdos novos e
  // interdisciplinares sem depender do nome da matéria ou do tópico.
  // (caderno F2: as tres reguas abaixo tambem nao valem no worksheet: ver
  // richnessRulesOff no topo.)
  if (!richnessRulesOff && metrics.totalSteps >= 3 && metrics.semanticManipulativeSteps === 0) {
    issues.push(
      "STI sem interação semântica: nenhum step materializa a ação cognitiva do conteúdo"
    );
  }
  const requiredSemanticSteps =
    metrics.totalSteps >= 4 ? Math.max(2, Math.ceil(metrics.totalSteps * 0.35)) : 1;
  if (
    !richnessRulesOff &&
    metrics.totalSteps >= 4 &&
    metrics.semanticManipulativeSteps < requiredSemanticSteps
  ) {
    issues.push(
      `riqueza interativa insuficiente: ${metrics.semanticManipulativeSteps}/${metrics.totalSteps} steps usam interface semântica (mínimo ${requiredSemanticSteps}, 35%)`
    );
  }
  if (!richnessRulesOff && metrics.totalSteps >= 4 && metrics.responseModalityDistinctCount < 2) {
    issues.push(
      `baixa variedade de resposta: ${metrics.totalSteps} steps usam apenas a modalidade "${metrics.responseModalities[0] || "?"}"`
    );
  }
  const disciplineBlob = `${tutor.discipline || ""} ${tutor.topic || ""} ${tutor.title || ""}`;
  const disciplinePolicy = DISCIPLINE_AFFORDANCE_POLICIES.find((policy) =>
    policy.match.test(disciplineBlob)
  );
  if (disciplinePolicy && metrics.totalSteps >= 3) {
    metrics.disciplinePolicyMatched = disciplinePolicy.id;
    const aligned = allSteps.some(
      (step) =>
        disciplinePolicy.accepted.has(String(step?.renderAs || "")) ||
        isAnswerProducingDynamicSpec(step)
    );
    if (!aligned && !richnessRulesOff) {
      metrics.disciplinePolicyMissing = true;
      issues.push(
        `interface sem modelo da disciplina: ${disciplinePolicy.id} exige representação própria do conteúdo`
      );
    }
  }

  // F11 (benchmark 2026-06-10): conteúdo sequencial/cronológico deveria ter
  // pelo menos UM passo de ordenação real (drag_to_order/timeline/image_sequence).
  // Warning observável — fecha o loop de medição da regra do agent2/worker.
  const seqBlob =
    `${tutor.topic || ""} ${tutor.description || ""} ${opts.requestTopic || ""} ${opts.requestDescription || ""}`.toLowerCase();
  if (
    /(sequ[eê]nc|cronolog|linha do tempo|etapas d|ciclo d|ordem dos|fases d)/.test(seqBlob) &&
    metrics.totalSteps > 0
  ) {
    const ORDERING_RENDERAS = new Set([
      "drag_to_order",
      "drag_order",
      "timeline_constructor",
      "image_sequence",
    ]);
    const hasOrdering = (tutor.problems || []).some((p) =>
      (p.steps || []).some((s) => ORDERING_RENDERAS.has(s.renderAs))
    );
    if (!hasOrdering) {
      const explicitlyRequestedOrdering =
        /(orden[ae]|ordene|ordenar|sequencie|sequenciar|drag|arrast|order the|put in order)/i.test(
          String(opts.requestDescription || "")
        ) || tutor?._metadata?.pattern === "SequencingOrdering";
      // (modo simples: drag_to_order/timeline não existem — nunca bloqueia.)
      if (explicitlyRequestedOrdering && !simpleInterfaceMode) {
        issues.push("conteúdo sequencial sem passo de ordenação real (F11)");
      } else {
        warnings.push("conteúdo sequencial sem passo de ordenação real (F11)");
      }
    }
  }

  // Sprint 3 (area_model): tópico de multiplicação de frações deveria ter o
  // passo visual canônico. Warning observável — mede a compliance da REGRA
  // FORTE do worker ao longo do tempo (mesma estratégia do F11).
  if (
    /(multiplica[çc][aã]o|multiplicar|produto)[^.]{0,30}fra[çc]|fra[çc][aã]o de (uma )?fra[çc]/i.test(
      seqBlob
    ) &&
    metrics.totalSteps > 0
  ) {
    const hasAreaModel = (tutor.problems || []).some((p) =>
      (p.steps || []).some((s) => s.renderAs === "area_model_fraction")
    );
    if (!hasAreaModel) {
      warnings.push("multiplicação de frações sem passo visual de modelo de área (Sprint 3)");
    }
  }

  // Soft warnings — nao bloqueiam, mas sao expostos em _metadata.qualityGate.warnings
  // Monotonia ATIVA (numeric_keypad, sentence_builder, drag_to_order...) só avisa:
  // o aluno ainda CONSTRÓI a resposta. Monotonia PASSIVA (só MC) bloqueia — ver gates abaixo.
  if (
    metrics.totalSteps >= 6 &&
    metrics.renderAsDistinctCount <= 1 &&
    !(singleRenderAs && PASSIVE_RENDER_AS.has(singleRenderAs))
  ) {
    warnings.push(
      `baixa diversidade de renderAs: todos os ${metrics.totalSteps} steps usam "${singleRenderAs || "?"}"`
    );
  }
  // A seleção passiva não pode dominar uma sequência que se apresenta como
  // interface rica; o structural gate converte deterministicamente o excesso.
  // (caderno F2: no worksheet as celulas A sao selecao/digitacao por contrato.)
  if (!richnessRulesOff && metrics.totalSteps >= 4 && metrics.passiveShare > 0.35) {
    issues.push(
      `excesso de seleção passiva: ${(metrics.passiveShare * 100).toFixed(0)}% dos steps usam MC/V-F/imagem (máximo 35%)`
    );
  }
  if (metrics.totalSteps >= 6 && metrics.maxSameRenderShare > 0.6) {
    warnings.push(
      `baixa variedade de input: ${(metrics.maxSameRenderShare * 100).toFixed(0)}% dos steps repetem o mesmo renderAs`
    );
  }
  if (kcs.length >= 3 && metrics.bloomLevelDistinctCount <= 1) {
    warnings.push(`baixa diversidade Bloom: ${kcs.length} KCs em nivel unico`);
  } else if (kcs.length >= 5 && metrics.bloomLevelDistinctCount === 2) {
    warnings.push(
      `escada Bloom curta: ${kcs.length} KCs em apenas 2 niveis (meta: 3+ a partir de 5 KCs)`
    );
  }
  if (metrics.bloomMonotonicityViolations > 0) {
    warnings.push(
      `escada Bloom inconsistente: ${metrics.bloomMonotonicityViolations} KC(s) exigem MENOS cognicao que seus prerequisitos`
    );
  }
  if (metrics.problemSignatureCollision && (tutor.problems || []).length >= 2) {
    warnings.push(
      `repeticao estrutural: ${metrics.problemsShareSignature} problemas compartilham assinatura de steps`
    );
  }
  if (metrics.duplicateKcSequenceProblemPairs > 0) {
    warnings.push(
      `repeticao de competencia entre problemas: ${metrics.duplicateKcSequenceProblemPairs} par(es) de problemas exercitam a MESMA sequencia de KCs (regra 5 do planner) — dificuldade pode ter escalado nos numeros sem escalar na competencia exercitada`
    );
  }

  // Gates criticos
  // 2026-07-19 (E2E frações): com a preservação de diagnósticos do final-gate,
  // steps construídos carregam seus erros em behaviorMisconceptions e as
  // options visíveis restantes tendem a ser só os pads honestos de MC — medir
  // "genérico" só sobre options passou a superestimar (artefato com cobertura
  // específica ≥50% media 100% e era bloqueado). A superfície diagnóstica REAL
  // do runtime é options erradas + behaviorMisconceptions (o graphEngine roteia
  // por ambos quando options.length===0 — contrato da PR #27), então o share
  // genérico é medido sobre a união. A intenção do gate não muda: bounded
  // share de rotas sintéticas na superfície de reconhecimento de erro.
  const diagnosticSurface = metrics.totalDistractors + metrics.behaviorMisconceptionDistractors;
  const genericPct = diagnosticSurface > 0 ? metrics.genericDistractors / diagnosticSurface : 0;
  if (genericPct > GATE_THRESHOLDS.maxGenericDistractorPct) {
    issues.push(
      `distratores genericos ${(genericPct * 100).toFixed(0)}% > ${(GATE_THRESHOLDS.maxGenericDistractorPct * 100).toFixed(0)}% max`
    );
  }

  // §6 diagnóstico autossuficiente (2026-07-18): compliance de prompt é
  // estocástica (gotcha 4 do CLAUDE.md) — a REGRA FORTE do worker ("compute os
  // distratores aplicando as buggyRule do catálogo do 3b") só é auditável se o
  // gate MEDIR, geração a geração, quantos distratores errados chegam com
  // misconceptionId específico. Warning observável, NUNCA issue: o bloqueio
  // continua sendo a cobertura adaptativa específica existente (régua da PR #27).
  // Anti-inflação (revisão 2026-07-18): a métrica mede id que PARECE específico;
  // ancoragem REAL no catálogo (id existe no 3b e o value corresponde ao
  // wrongAnswer) pode virar medição futura via opts (catálogo da geração).
  const measuredDiagnosticDistractors =
    metrics.totalDistractors + metrics.behaviorMisconceptionDistractors;
  const specificDistractorShare =
    measuredDiagnosticDistractors > 0
      ? metrics.specificDistractors / measuredDiagnosticDistractors
      : 0;
  if (metrics.visualStepsWithoutInterfaceBm > 0) {
    warnings.push(
      `${metrics.visualStepsWithoutInterfaceBm} step(s) visuais/escala sem behaviorMisconceptions de leitura de interface — workers ignorando a regra de erros da própria config`
    );
  }
  if (measuredDiagnosticDistractors > 0 && specificDistractorShare < 0.5) {
    warnings.push(
      `distratores com misconceptionId específico ${(specificDistractorShare * 100).toFixed(0)}% < 50% — catálogo do 3b insuficiente ou workers ignorando buggyRules`
    );
  }
  if (metrics.stepsWithIncoherentExplanation > 0) {
    warnings.push(
      `${metrics.stepsWithIncoherentExplanation} step(s) com explicação que não enuncia o gabarito (${metrics.incoherentExplanationSteps.join(", ")}) — ou a explicação é de outro passo, ou o gabarito contradiz o que ela ensina`
    );
  }
  if (metrics.stepsWithoutKc > 0) {
    issues.push(`${metrics.stepsWithoutKc} steps sem kc`);
  }
  if (metrics.hintsRevealingAnswer > 0) {
    issues.push(`${metrics.hintsRevealingAnswer} steps com hint revelando resposta`);
  }

  // Auditoria de interface 2026-08-02. Ambas as réguas nasceram de STIs que
  // PASSARAM neste gate: gabaritos como "S₀ = 15 km e S = 96 km" num campo de
  // digitação, e três passos seguidos respondidos com "6" no STI de geometria.
  // Compliance de prompt é estocástica (gotcha 4 do CLAUDE.md): a regra forte no
  // worker só é auditável se o gate medir, geração a geração.
  if (metrics.stepsWithUnproducibleAnswer > 0) {
    issues.push(
      `${metrics.stepsWithUnproducibleAnswer} steps com gabarito que o aluno não consegue digitar (pergunta dissertativa disfarçada de interação)`
    );
  }
  if (metrics.maxConsecutiveSameAnswer >= 3) {
    issues.push(
      `${metrics.maxConsecutiveSameAnswer} passos consecutivos com o mesmo gabarito — o aluno avança repetindo a resposta`
    );
  } else if (metrics.maxConsecutiveSameAnswer === 2) {
    warnings.push("2 passos consecutivos com o mesmo gabarito");
  }
  // WARNING e não bloqueio, de propósito: repetir um gabarito não é sempre
  // redundância — "5" pode ser a contagem de dois objetos diferentes no mesmo
  // problema. O que a medição resolve é tornar a redundância visível geração a
  // geração (gotcha 4 do CLAUDE.md: regra de prompt precisa de régua no gate),
  // sem mexer na taxa de rejeição.
  if (metrics.repeatedAnswerInProblem > 0) {
    warnings.push(
      `${metrics.repeatedAnswerInProblem} passo(s) repetem um gabarito já usado antes no mesmo problema (redundância à distância)`
    );
  }
  if (metrics.stepsWithDuplicateWrongAnswer > 0) {
    // Warning, não bloqueio: o STI continua jogável e diagnosticando pelo erro
    // que casa primeiro. 2026-08-06: o texto antigo dizia que o scaffold da 2ª
    // ficava órfão — inspecionei os 2 casos reais de produção e NÃO fica: a poda
    // do grafo já remove o scaffold do perdedor. O que de fato se perde é o
    // feedback dele, e por isso normalizeStepDistractorMetadata agora funde os
    // dois textos. O warning permanece porque a fusão mitiga, não elimina: dois
    // erros distintos continuam disputando a mesma resposta errada, e quem
    // escreve o prompt do worker precisa ver isso acontecendo.
    warnings.push(
      `${metrics.stepsWithDuplicateWrongAnswer} step(s) com dois diagnósticos distintos para a mesma resposta errada — só o primeiro dispara (feedback do segundo é fundido nele)`
    );
  }
  if (metrics.stepsWithLowDistractorCount > 0) {
    // 2026-05-21: rebaixado de bloqueante para warning.
    // O _finalStructuralGate (que roda antes) auto-gera distratores onde possível.
    // Se ainda faltam, é componente manipulativo que legitimamente não usa options.
    warnings.push(`${metrics.stepsWithLowDistractorCount} steps com <2 distratores unicos`);
  }
  if (metrics.optionsMissingIsCorrect > 0) {
    issues.push(`${metrics.optionsMissingIsCorrect} options com isCorrect ausente ou não booleano`);
  }
  if (metrics.stepsWithoutAdaptiveCoverage > 0) {
    issues.push(
      `${metrics.stepsWithoutAdaptiveCoverage} steps sem rota adaptativa específica nem remediação genérica`
    );
  }

  // 2026-08-09: aterramento da resposta errada. Mede a regra forte do agent3b
  // ("derive dos dados, nunca do gabarito") sobre o que os AGENTES escreveram.
  // Warning por enquanto: promover a bloqueante exige série histórica, senão a
  // primeira geração ruim derruba a plataforma inteira.
  if (metrics.numericWrongAnswers > 0) {
    const naoAterradas = metrics.numericWrongAnswers - metrics.groundedWrongAnswers;
    if (naoAterradas > 0) {
      warnings.push(
        `${naoAterradas} de ${metrics.numericWrongAnswers} respostas erradas numéricas não são deriváveis dos dados do passo (provável perturbação do gabarito): ${metrics.ungroundedWrongAnswerSteps.slice(0, 5).join(", ")}`
      );
    }
  }

  const specificCoverage =
    metrics.totalSteps > 0 ? metrics.specificAdaptiveSteps / metrics.totalSteps : 0;
  if (metrics.genericOnlyAdaptiveSteps > 0) {
    warnings.push(
      `${metrics.genericOnlyAdaptiveSteps} steps têm somente remediação genérica, sem diagnóstico específico`
    );
  }
  if (metrics.constructedStepsWithoutSpecificDiagnosis > 0) {
    warnings.push(
      `${metrics.constructedStepsWithoutSpecificDiagnosis}/${metrics.constructedResponseSteps} respostas construídas sem classificador específico de erro`
    );
  }
  if (opts.requireSpecificAdaptiveCoverage === true && metrics.totalSteps > 0) {
    const configured = Number(opts.minSpecificAdaptiveCoveragePct);
    const minimum = Number.isFinite(configured) ? Math.min(1, Math.max(0, configured)) : 0.5;
    if (specificCoverage < minimum) {
      issues.push(
        `cobertura adaptativa específica ${(specificCoverage * 100).toFixed(0)}% < ${(minimum * 100).toFixed(0)}% mínimo`
      );
    }
  }

  // (D2) Monotonia PASSIVA é bloqueante: 3+ steps, todos no mesmo componente de
  // seleção → o aluno nunca digita/constrói/arrasta. Regenera para forçar
  // diversidade de INPUT (ver memory feedback_input_diversity).
  // (caderno F2: idem no worksheet.)
  if (
    !richnessRulesOff &&
    metrics.totalSteps >= 3 &&
    singleRenderAs &&
    PASSIVE_RENDER_AS.has(singleRenderAs)
  ) {
    issues.push(
      `monotonia passiva: todos os ${metrics.totalSteps} steps usam "${singleRenderAs}" (zero input construído)`
    );
  }

  // ============================================================
  // CADERNO (worksheet): 2026-08-16 (F2). So roda no modo worksheet; em
  // simple/rich nem os contadores entram no metrics (campos novos so aparecem
  // quando definidos). Bloqueante = o aluno nao consegue jogar o caderno
  // (celula sem no, no sem celula, celula C sem instrumento renderizavel,
  // figura que "responde", interacao proibida para quem nao le). Warning =
  // medicao (passo sem cell, origem do instrumento, so celulas A, interacao
  // proibida em perfil leitor).
  // ============================================================
  if (worksheetMode) {
    const worksheet = auditWorksheetTutor(tutor);
    issues.push(...worksheet.issues);
    warnings.push(...worksheet.warnings);
    Object.assign(metrics, worksheet.metrics);
  }

  // (D2) Perda catastrófica de steps: designer planejou >=4 e o pipeline entregou
  // <= metade → destruição downstream (ver memory sti-destruction-cascade-2026-05-28).
  if (designed && designed >= 4 && metrics.totalSteps <= designed * 0.5) {
    issues.push(
      `perda catastrofica de steps: planejados ${designed}, entregues ${metrics.totalSteps} (${((metrics.stepLossRatio || 0) * 100).toFixed(0)}% perdidos)`
    );
  }

  // 2026-08-06 (ARQUITETURA — 4 rejeicoes seguidas do mesmo professor, 29 STIs
  // rejeitados arquivados): o gate tratava TUDO como fatal e devolvia 422,
  // jogando fora 4 problemas / ~2-4 min / ~$0.15 em tokens. Mas os `issues`
  // misturam duas coisas categoricamente diferentes:
  //
  //   BLOQUEANTE  — o aluno literalmente NAO consegue jogar: sem steps, sem
  //                 behaviorGraph, expectedAnswer vazio/sentinela, gabarito que
  //                 nao da pra digitar, hint entregando a resposta.
  //   DEGRADANTE  — o STI FUNCIONA (resposta certa, dicas, feedback), so tem
  //                 menos riqueza diagnostica que a meta. Ex.: "distratores
  //                 genericos 48% > 40%".
  //
  // Rejeitar a geracao inteira por DEGRADANTE e estritamente pior para o
  // professor do que entregar: ele fica sem STI nenhum e paga de novo pra
  // tentar. A politica declarada do repo e "reparar > dropar > rejeitar"
  // (validate.js) — aqui ela passa a valer tambem para o veredito final.
  // `pass` segue significando "atingiu a meta de qualidade" (usado pelo retry
  // e pelo judge); quem decide entregar/rejeitar e `playable`.
  const { bloqueantes, degradantes } = classificarIssues(issues);
  const pass = issues.length === 0;
  return {
    pass,
    playable: bloqueantes.length === 0,
    blockingIssues: bloqueantes,
    degradingIssues: degradantes,
    issues,
    warnings,
    metrics: {
      ...metrics,
      genericDistractorPct: (genericPct * 100).toFixed(1) + "%",
      specificDistractorPct: (specificDistractorShare * 100).toFixed(1) + "%",
      // 2026-08-09: quanto do modelo de erro ESCRITO PELOS AGENTES sai dos
      // dados do passo. É o número que diz se a regra forte do agent3b pegou.
      groundedWrongAnswerPct:
        metrics.numericWrongAnswers > 0
          ? ((metrics.groundedWrongAnswers / metrics.numericWrongAnswers) * 100).toFixed(1) + "%"
          : "n/a",
      adaptiveCoveragePct:
        metrics.totalSteps > 0
          ? (
              ((metrics.specificAdaptiveSteps + metrics.genericOnlyAdaptiveSteps) /
                metrics.totalSteps) *
              100
            ).toFixed(1) + "%"
          : "0.0%",
      specificAdaptiveCoveragePct: (specificCoverage * 100).toFixed(1) + "%",
    },
  };
}

/**
 * 2026-08-06: metricas de RIQUEZA diagnostica. O STI com um destes defeitos e
 * plenamente jogavel — tem gabarito certo, dicas em 4 niveis e feedback; so
 * oferece menos rota de diagnostico especifico do que a meta. Lista explicita e
 * conservadora: o que NAO estiver aqui continua bloqueante (fail-closed).
 *
 * NAO incluir aqui, por serem defeitos de JOGABILIDADE:
 *   - "gabarito que o aluno nao consegue digitar" (passo irrespondivel)
 *   - "hint revelando resposta" (destroi o proposito do tutor)
 *   - "behaviorGraph invalido" (o grafo roteia o runtime do aluno)
 *   - "expectedAnswer vazio/sentinela", "sem steps", "sem behaviorGraph"
 */
const PADROES_DEGRADANTES = [
  /^distratores genericos \d+% >/,
  /^cobertura adaptativa espec[ií]fica \d+% </,
  /passos consecutivos com o mesmo gabarito/,
  /steps com <2 distratores unicos/,
];

export function classificarIssues(issues = []) {
  const bloqueantes = [];
  const degradantes = [];
  for (const issue of issues) {
    const texto = String(issue ?? "");
    if (PADROES_DEGRADANTES.some((padrao) => padrao.test(texto))) degradantes.push(texto);
    else bloqueantes.push(texto);
  }
  return { bloqueantes, degradantes };
}

export { GATE_THRESHOLDS };
