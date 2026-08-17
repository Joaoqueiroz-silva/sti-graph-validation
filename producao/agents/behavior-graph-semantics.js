/**
 * Contrato semântico executável dos behavior graphs por problema.
 *
 * A estrutura start→steps→goal não é suficiente para um STI adaptativo. Para
 * cada resposta errada concreta, a cadeia abaixo precisa representar o MESMO
 * erro e voltar ao passo que o originou:
 *
 * option.value → option.misconceptionId → node.misconceptions[].id
 * → edge misconception(id) → scaffold.targetMisconception → step de origem
 *
 * Este módulo é puro e não chama LLM. Os steps finais são a fonte de verdade
 * quando possuem options; dados genéricos do GraphForge nunca vencem conteúdo
 * concreto produzido/revisado pelos agentes finais.
 */

import { PASSIVE_SELECTION } from "../shared/component-sets.js";

export const OPERATIONAL_MISCONCEPTION_ID_RE = /^[A-Za-z0-9_.:-]+$/;
const MISCONCEPTION_EDGE_RE = /^misconception\(([A-Za-z0-9_.:-]+)\)$/;

export const SEMANTIC_DEFECT_KEYS = Object.freeze([
  "canonicalBackboneViolations",
  "duplicateNodeIds",
  "missingGraphStepNodes",
  "extraGraphStepNodes",
  "graphStepIdentityMismatches",
  "stepContractMismatches",
  "malformedMisconceptionConditions",
  "unknownMisconceptionTriggers",
  "misroutedMisconceptionTriggers",
  "missingMisconceptionTriggers",
  "duplicateMisconceptionTriggers",
  "misroutedStruggleTriggers",
  "duplicateStruggleTriggers",
  "wrongScaffoldReturns",
  "sharedScaffolds",
  // 2026-08-03: "duplicateMisconceptionIds" SAIU da lista de defeitos fatais.
  // Várias respostas erradas roteando para a MESMA misconception é o mapeamento
  // clássico de CTAT (N erros → 1 buggy rule) e é executável: o runtime casa a
  // option pelo valor e emite o id, cuja rota existe. Tratar isso como fatal
  // rejeitava STIs legítimos — inclusive os produzidos pelo próprio reparo, que
  // reaponta options de wrongAnswer colidente para o id sobrevivente. A
  // auditoria CONTINUA populando `audit.duplicateMisconceptionIds` como métrica
  // de qualidade (quality gate e scripts offline podem ler).
  "desynchronizedMisconceptions",
  "unclassifiedDistractors",
  "unusableDistractors",
  "unresolvedPlaceholders",
  "scaffoldNodesMismatches",
  "missingScaffoldTriggers",
  "stepsWithoutAdaptiveCoverage",
  "unreachableScaffolds",
]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function scalar(value) {
  if (value == null) return "";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function cloneJson(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function jsonEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * IDs canônicos dos nós de passo. O vínculo explícito `graphNodeId` vence o
 * id editorial do passo; ambos vencem o fallback posicional. IDs reservados e
 * duplicados recebem um fallback determinístico para manter a bijeção 1:1.
 */
export function canonicalGraphStepIds(steps = []) {
  const used = new Set(["start", "goal"]);
  return asArray(steps).map((step, index) => {
    const preferred = scalar(step?.graphNodeId ?? step?.id).trim();
    let candidate = preferred && !used.has(preferred) ? preferred : `step_${index + 1}`;
    const base = candidate;
    let suffix = 2;
    while (used.has(candidate)) candidate = `${base}__${suffix++}`;
    used.add(candidate);
    return candidate;
  });
}

function normalizedVariations(step) {
  const values = Array.isArray(step?.acceptableVariations) ? step.acceptableVariations : [];
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const normalized = scalar(value).trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

/**
 * Contrato executável derivado exclusivamente do step final. Todos os campos
 * relevantes são materializados (inclusive `null`/`[]`) para que uma mutação
 * tardia também LIMPE configuração obsoleta no behavior graph.
 */
export function buildCanonicalExpectedInput(step = {}) {
  const visualConfig = cloneJson(step.visualConfig || {}) || {};
  if (Array.isArray(step.options) && step.options.length > 0) {
    visualConfig.options = cloneJson(step.options);
  } else {
    delete visualConfig.options;
  }
  if (step.componentProps != null) visualConfig.componentProps = cloneJson(step.componentProps);
  else delete visualConfig.componentProps;
  if (step.config != null) visualConfig.config = cloneJson(step.config);
  else delete visualConfig.config;

  const lockedContract = step?._componentContract?.locked === true;
  const validator =
    (lockedContract && "component_contract") ||
    scalar(step?.expectedInput?.validator ?? step?.validator ?? "exact").trim() ||
    "exact";
  const renderAs = step.renderAs ?? null;
  const dynamicMode = step?.componentProps?.spec?.interaction?.mode;
  const dynamicExpected =
    renderAs === "dynamic_spec" &&
    (dynamicMode === "click-zone" || dynamicMode === "identify-element")
      ? step?.componentProps?.spec?.interaction?.validator?.expected
      : null;

  const expectedInput = {
    value: scalar(dynamicExpected ?? step.expectedAnswer ?? "").trim(),
    validator,
    tolerance: step?.expectedInput?.tolerance ?? step.tolerance ?? null,
    pattern: step?.expectedInput?.pattern ?? step.pattern ?? null,
    acceptableVariations: normalizedVariations(step),
    renderAs,
    componentId: step?._componentContract?.componentId ?? step.componentId ?? renderAs ?? null,
    componentProps: step.componentProps != null ? cloneJson(step.componentProps) : null,
    config: step.config != null ? cloneJson(step.config) : null,
    interactionMode: step.interactionMode ?? step?._componentContract?.interactionMode ?? null,
    contractVersion: step?._componentContract?.version ?? step.contractVersion ?? null,
    visualConfig: Object.keys(visualConfig).length > 0 ? visualConfig : null,
  };
  // 2026-08-16 (caderno F0): a celula do caderno (step.cell) e copiada por
  // VALOR para o contrato do no, de forma que o grafo saiba em qual celula /
  // instrumento / alvo o aluno responde. So adiciona chaves quando o step as
  // definiu: em simple/rich (sem cell) o expectedInput continua identico, e o
  // contractFieldMismatches, que itera as chaves deste objeto, passa a comparar
  // esses campos automaticamente quando presentes.
  Object.assign(expectedInput, cellExpectedInputFields(step));
  return expectedInput;
}

/**
 * 2026-08-16 (caderno F0): campos de expectedInput derivados de step.cell
 * (contrato aditivo do modo worksheet). Retorna {} quando o step nao tem cell
 * ou quando nenhum dos campos esta definido; cellId cai no id canonico da
 * celula (que por contrato e o id canonico do no).
 */
export function cellExpectedInputFields(step = {}) {
  const cell = step?.cell;
  if (!cell || typeof cell !== "object") return {};
  const out = {};
  if (cell.id !== undefined && cell.id !== null) out.cellId = scalar(cell.id).trim();
  if (cell.role !== undefined && cell.role !== null) out.cellRole = scalar(cell.role).trim();
  if (cell.instrumentRef !== undefined && cell.instrumentRef !== null)
    out.instrumentRef = scalar(cell.instrumentRef).trim();
  if (cell.target !== undefined && cell.target !== null) out.target = cloneJson(cell.target);
  return out;
}

function desiredKnowledgeComponents(step) {
  if (step?.kc != null && scalar(step.kc).trim()) return [scalar(step.kc).trim()];
  return asArray(step?.knowledgeComponents)
    .map((kc) => scalar(kc).trim())
    .filter(Boolean);
}

function contractFieldMismatches(node, step) {
  const expectedInput = buildCanonicalExpectedInput(step);
  const actualInput = node?.expectedInput || {};
  const fields = Object.keys(expectedInput).filter(
    (field) => !jsonEqual(actualInput[field] ?? null, expectedInput[field] ?? null)
  );
  const expectedKcs = desiredKnowledgeComponents(step);
  if (!jsonEqual(asArray(node?.knowledgeComponents), expectedKcs)) {
    fields.push("knowledgeComponents");
  }
  return { fields, expectedInput, expectedKcs };
}

/** Detecta slots ainda não materializados, como {A}, {B/C} ou {valor esperado}. */
export function hasUnresolvedGraphTemplate(value) {
  return /\{[^{}]*[A-Za-zÀ-ÿ][^{}]*\}/.test(scalar(value));
}

export function parseMisconceptionCondition(condition) {
  const match = MISCONCEPTION_EDGE_RE.exec(String(condition || "").trim());
  return match ? match[1].trim() : null;
}

export function isOperationalMisconceptionId(value) {
  return OPERATIONAL_MISCONCEPTION_ID_RE.test(scalar(value).trim());
}

export function normalizeMisconceptionId(value, fallback = "") {
  const normalized = scalar(value)
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9_.:-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (normalized && isOperationalMisconceptionId(normalized)) return normalized;
  return scalar(fallback).trim();
}

export function countBehaviorGraphSemanticDefects(audit) {
  return SEMANTIC_DEFECT_KEYS.reduce(
    (total, key) => total + (Array.isArray(audit?.[key]) ? audit[key].length : 0),
    0
  );
}

/**
 * Normaliza os IDs das alternativas incorretas antes de o GraphForge compilar
 * as condições. IDs ausentes continuam explicitamente marcados como
 * `misc_unclassified_*`: a rota fica executável, mas o Quality Gate ainda pode
 * distinguir fallback operacional de diagnóstico pedagógico real.
 */
/** Chave de comparação "como o aluno vê": sem acento, caixa ou espaço extra. */
function normalizeAnswerValue(value) {
  return scalar(value)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Ids que a pipeline cunha quando não sabe qual é o erro: não vencem aterramento. */
const GENERIC_ID_RE = /^misc_(?:unclassified|generic|numeric_near|text_confusion|fallback)/i;
function isSpecificEnough(id) {
  return !GENERIC_ID_RE.test(scalar(id).trim());
}

export function normalizeStepDistractorMetadata(steps = [], opts = {}) {
  const repairs = [];
  const label = opts.label || "steps";
  const language = String(opts.outputLanguageCode || "pt-BR").toLowerCase();
  const fallbackFeedback = language.startsWith("en")
    ? "Review the concept used in this step and try the reasoning again."
    : language.startsWith("es")
      ? "Revisa el concepto usado en este paso y vuelve a intentar el razonamiento."
      : language.startsWith("fr")
        ? "Revoyez le concept utilisé dans cette étape et reprenez le raisonnement."
        : "Revise o conceito usado neste passo e refaça o raciocínio.";

  for (let stepIndex = 0; stepIndex < asArray(steps).length; stepIndex++) {
    const step = steps[stepIndex];
    if (!step || typeof step !== "object") continue;
    if (!Array.isArray(step.options) || step.options.length === 0) {
      const nestedOptions = [
        step?.visualConfig?.options,
        step?.componentProps?.options,
        step?.config?.options,
      ].find(
        (candidate) =>
          Array.isArray(candidate) &&
          candidate.length > 0 &&
          candidate.every(
            (option) =>
              option &&
              typeof option === "object" &&
              Object.hasOwn(option, "isCorrect") &&
              (option.value != null || option.label != null)
          )
      );
      if (nestedOptions) {
        step.options = nestedOptions.map((option) => ({ ...option }));
        repairs.push(
          `${label}/${step.id || `step_${stepIndex + 1}`}: options aninhadas promovidas`
        );
      }
    }
    mergeStepMisconceptionCollisions(step, repairs, label, stepIndex);
    normalizeBehaviorMisconceptionIds(step, repairs, label, stepIndex);
    if (!Array.isArray(step.options)) continue;
    const expectedAnswer = scalar(step.expectedAnswer).trim();
    const canonicalCorrectIndex = expectedAnswer
      ? step.options.findIndex(
          (option) => option && scalar(option.value ?? option.label).trim() === expectedAnswer
        )
      : -1;
    let correctnessRepairs = 0;
    for (let optionIndex = 0; optionIndex < step.options.length; optionIndex++) {
      const option = step.options[optionIndex];
      if (!option || typeof option !== "object") continue;
      const original = option.isCorrect;
      if (canonicalCorrectIndex >= 0) {
        option.isCorrect = optionIndex === canonicalCorrectIndex;
      } else if (typeof original !== "boolean") {
        const normalized = scalar(original).trim().toLowerCase();
        option.isCorrect = normalized === "true" || normalized === "1";
      }
      if (original !== option.isCorrect) correctnessRepairs++;
    }
    if (correctnessRepairs > 0) {
      repairs.push(
        `${label}/${step.id || `step_${stepIndex + 1}`}: ${correctnessRepairs} flag(s) isCorrect normalizada(s)`
      );
    }

    // 2026-08-06 (rejeicao "P1: 1 violacao semantica no behavior graph", causa
    // raiz verificada): o loop acima normalizava `isCorrect` SO em
    // `step.options`. As colecoes-espelho (`componentProps.options`,
    // `visualConfig.options`) ficavam com a polaridade ANTIGA — no artefato real
    // `step.options` dizia que "a" era a correta e `componentProps.options`
    // dizia que era "an". Como behavior-graph-integrity.js varre 12 colecoes e
    // este modulo usa so `step.options`, os dois discordavam sobre quem era o
    // distrator: um criava contrato para uma misconception que o outro nao
    // reconhecia. `pruneInfeasibleAdaptiveLayer` entao podava o id orfao APENAS
    // da copia do no (behavior-graph-integrity.js:937), depois do ultimo sync —
    // e o contrato node<->step divergia, virando defeito FATAL. Rodar o reparo
    // 4x dava o mesmo fatal: ponto fixo, nenhuma regeneracao resolvia.
    //
    // Aqui a polaridade passa a ser unica para o step inteiro, e a option que
    // virou correta perde o diagnostico obsoleto (uma resposta certa nao tem
    // misconception). Sem isso, so re-sincronizar depois da poda nao resolve —
    // medido: o id volta pro no e o orfao reaparece.
    const espelhos = [
      step.componentProps?.options,
      step.visualConfig?.options,
      step.config?.options,
    ];
    for (const espelho of espelhos) {
      if (!Array.isArray(espelho)) continue;
      for (const option of espelho) {
        if (!option || typeof option !== "object") continue;
        const valor = scalar(option.value ?? option.label).trim();
        if (!expectedAnswer || !valor) continue;
        const deveSerCorreta = valor === expectedAnswer;
        if (option.isCorrect !== deveSerCorreta) {
          option.isCorrect = deveSerCorreta;
          correctnessRepairs++;
        }
        if (deveSerCorreta && (option.misconceptionId || option.misconceptionType)) {
          delete option.misconceptionId;
          delete option.misconceptionType;
        }
      }
    }
    // A mesma limpeza na lista canonica: o loop de isCorrect acima podia
    // PROMOVER uma option a correta sem tirar o misconceptionId que ela tinha
    // como distrator (linha ~329 pula `isCorrect === true`), deixando o orfao
    // que dispara toda a cadeia.
    for (const option of step.options) {
      if (option?.isCorrect === true && (option.misconceptionId || option.misconceptionType)) {
        delete option.misconceptionId;
        delete option.misconceptionType;
        repairs.push(
          `${label}/${step.id || `step_${stepIndex + 1}`}: diagnostico obsoleto removido da alternativa correta`
        );
      }
    }
    const stepToken = normalizeMisconceptionId(step.id, `step_${stepIndex + 1}`);

    // 2026-08-02 (forja local): ATERRAMENTO por valor antes de cunhar genérico.
    //
    // O step declarava o diagnóstico específico em `behaviorMisconceptions` com o
    // wrongAnswer IDÊNTICO ao value da option, e mesmo assim a option recebia
    // `misc_unclassified_*`. O vínculo existia no dado e era jogado fora:
    //
    //   behaviorMisconceptions: misc_confunde_nucleo_com_verbo -> "organizaram"
    //   options:                value "organizaram"            -> misc_unclassified_step_1_2
    //
    // Consequência medida: o quality gate contava 78% de "distratores genéricos"
    // num STI cujos diagnósticos eram todos específicos, e rejeitava a geração
    // por cobertura adaptativa baixa. Foi o motivo das rejeições de `money` e
    // `portugues` na bateria.
    //
    // Isto NÃO inventa classificação: só usa o id que o autor já escreveu, quando
    // a resposta errada bate exatamente. Sem casamento, o fallback genérico segue
    // valendo — a régua da PR #27 (sintético nunca conta como específico) fica
    // intacta.
    const diagnosticosDeclarados = new Map();
    for (const bm of asArray(step.behaviorMisconceptions)) {
      const id = normalizeMisconceptionId(scalar(bm?.misconceptionId ?? bm?.id).trim());
      const chave = normalizeAnswerValue(bm?.wrongAnswer);
      if (id && chave && !diagnosticosDeclarados.has(chave)) {
        diagnosticosDeclarados.set(chave, {
          id,
          misconceptionType: scalar(bm?.misconceptionType ?? bm?.type).trim(),
          feedback: scalar(bm?.feedback).trim(),
        });
      }
    }

    const used = new Set();
    for (let optionIndex = 0; optionIndex < step.options.length; optionIndex++) {
      const option = step.options[optionIndex];
      if (!option || option.isCorrect === true) continue;
      const rawId = scalar(option.misconceptionId).trim();
      let normalizedExisting = normalizeMisconceptionId(rawId);

      const aterrado = diagnosticosDeclarados.get(
        normalizeAnswerValue(option.value ?? option.label)
      );
      if (aterrado && (!normalizedExisting || !isSpecificEnough(normalizedExisting))) {
        normalizedExisting = aterrado.id;
        // O tipo e o feedback vêm JUNTO. Sem isso o aterramento é inútil: o
        // quality gate classifica por `misconceptionType`, e um distrator com id
        // específico mas type "unclassified" continua contando como genérico.
        if (aterrado.misconceptionType) option.misconceptionType = aterrado.misconceptionType;
        if (aterrado.feedback && !scalar(option.feedback).trim()) {
          option.feedback = aterrado.feedback;
        }
        repairs.push(
          `${label}/${step.id || stepToken}: distrator "${scalar(option.value ?? option.label).slice(0, 24)}" aterrado em ${aterrado.id}`
        );
      }

      const generated = !normalizedExisting;
      const baseId =
        normalizedExisting || `misc_unclassified_${stepToken}_${String(optionIndex + 1)}`;
      let finalId = baseId;
      let suffix = 2;
      // 2026-07-18 (anti-inflação rodada 2, item c): o sufixo __N de dedup NÃO
      // pode "promover" um distrator — base GENÉRICA (misc_generic_/
      // misc_unclassified/misc_numeric_near/misc_text_confusion) continua
      // casando os prefixos genéricos da PR #27 depois de sufixada (o sufixo é
      // appendado, os regexes ancoram no prefixo), e o graphDiagnosticSource
      // original da option é PRESERVADO (este loop só escreve source quando o
      // id foi gerado do zero). Travado por teste "anti-inflação rodada 2" em
      // final-gate-distractor-grounding.test.js (caso v).
      while (used.has(finalId)) finalId = `${baseId}__${suffix++}`;
      used.add(finalId);

      if (rawId !== finalId) {
        option.misconceptionId = finalId;
        repairs.push(
          `${label}/${step.id || stepToken}: misconceptionId normalizado para ${finalId}`
        );
      }
      if (!option.misconceptionType) option.misconceptionType = "unclassified";
      if (!option.feedback) option.feedback = fallbackFeedback;
      if (generated) option.graphDiagnosticSource = "deterministic_unclassified_fallback";
    }
  }
  return repairs;
}

function stepOptions(step) {
  const direct = step?.options;
  if (Array.isArray(direct) && direct.length > 0) return { present: true, options: direct };

  const nested = [
    step?.visualConfig?.options,
    step?.componentProps?.options,
    step?.config?.options,
  ];
  const hasChoiceSemantics = (candidate) =>
    Array.isArray(candidate) &&
    candidate.length > 0 &&
    candidate.some(
      (option) =>
        option &&
        typeof option === "object" &&
        (Object.hasOwn(option, "isCorrect") || Object.hasOwn(option, "misconceptionId"))
    );
  const nestedChoice = nested.find(hasChoiceSemantics);
  const selectionRenderAs = new Set([
    "multiple_choice",
    "true_false",
    "image_choice",
    "true_false_lab",
  ]);
  if (nestedChoice && (!Array.isArray(direct) || selectionRenderAs.has(step?.renderAs))) {
    return { present: true, options: nestedChoice };
  }
  if (Array.isArray(direct)) return { present: true, options: direct };
  if (nestedChoice) return { present: true, options: nestedChoice };
  return { present: false, options: [] };
}

function buildStepLookup(steps) {
  const lookup = new Map();
  for (let i = 0; i < steps.length; i++) {
    if (!lookup.has(`step_${i + 1}`)) lookup.set(`step_${i + 1}`, steps[i]);
    if (!lookup.has(`s${i + 1}`)) lookup.set(`s${i + 1}`, steps[i]);
  }
  // IDs reais sempre vencem os palpites posicionais.
  for (const step of steps) {
    if (step?.id) lookup.set(step.id, step);
    if (step?.graphNodeId) lookup.set(step.graphNodeId, step);
  }
  return lookup;
}

function matchStep(node, index, steps, lookup) {
  return lookup.get(node?.id) || steps[index] || null;
}

function sourceMisconceptions(step) {
  const finalChoices = stepOptions(step);
  // Componentes ricos não exibem `options`, mas o diversifier preserva os
  // classificadores concretos que existiam antes da conversão. Eles só podem
  // ser fonte do grafo quando a superfície final já não enumera escolhas.
  const preserved = asArray(step?.behaviorMisconceptions);

  // 2026-08-02 (painel sênior, P0.2): a guarda testava "não há options" e
  // deveria testar "não há options INCORRETAS".
  //
  // Quando o passo termina com uma única option — a CORRETA — `options.length`
  // é 1, então `usesPreserved` era false, o laço abaixo pulava a correta por
  // `isCorrect === true`, `records` saía vazio e o nó do grafo era gravado com
  // `misconceptions: []`. Medido em geometry step_5: 4 diagnósticos escritos
  // pelo autor, zero no grafo. No total, 15 diagnósticos autorais eram apagados
  // assim — incluindo `misc_esquecer_conversao_unidades` (o erro nº1 de mL→L) e
  // o `misc_nomear_hexagono_como_pentagono` com o feedback "pense no HEXA!".
  //
  // A superfície diagnóstica REAL é a união: as options erradas que a interface
  // enumera MAIS os classificadores preservados pelo diversifier. `dedupRecords`
  // remove a sobreposição adiante.
  //
  // 2026-08-09 (auditoria de conformidade STI): a união do parágrafo acima só
  // vale onde o aluno CONSEGUE produzir uma resposta fora do conjunto
  // enumerado. Medição sobre os 271 tutores publicados, nos 50 passos que têm
  // options erradas E `behaviorMisconceptions` (109 classificadores):
  //   - 70 já repetem uma resposta que está nas options (dedup os removeria);
  //   - 39 têm resposta FORA das options, e destes **32 estão em superfície
  //     enumerada** (41 dos 50 passos são multiple_choice), onde a resposta
  //     simplesmente não é emitível: injetá-los no grafo criaria rota morta;
  //   - só 7 estão em superfície aberta (dynamic_spec / sem renderAs), onde o
  //     aluno digita e o diagnóstico autoral se perdia de verdade.
  //
  // Por isso a união é condicionada à superfície, e não cega. `PASSIVE_SELECTION`
  // é a partição canônica já existente (shared/component-sets.js) — não criar
  // outra cópia da taxonomia de modalidade.
  //
  // A ordem importa: options primeiro, porque o runtime casa a resposta pelas
  // options antes de olhar `node.misconceptions`; quem a interface enumera tem
  // que vencer o desempate de `dedupRecords`.
  const opcoesIncorretas = finalChoices.options.filter((option) => option?.isCorrect !== true);
  const superficieEnumerada = PASSIVE_SELECTION.has(scalar(step?.renderAs).trim());

  // Sem nenhuma option incorreta a fonte é o preservado (P0.2, 2026-08-02):
  // um passo que termina só com a option CORRETA saía com `misconceptions: []`.
  const usesPreserved = opcoesIncorretas.length === 0 && preserved.length > 0;
  const options = usesPreserved
    ? preserved
    : superficieEnumerada
      ? finalChoices.options
      : [...finalChoices.options, ...preserved];
  const present =
    finalChoices.present || usesPreserved || (!superficieEnumerada && preserved.length > 0);
  const records = [];
  const unclassified = [];
  const unusable = [];

  for (let index = 0; index < options.length; index++) {
    const option = options[index];
    if (!option || option.isCorrect === true) continue;
    const id = scalar(option.misconceptionId ?? option.id).trim();
    const wrongAnswer = scalar(option.wrongAnswer ?? option.value ?? option.label).trim();
    if (!id) {
      unclassified.push({ optionIndex: index, wrongAnswer });
      continue;
    }
    // 2026-08-02 (auditoria): além do slot não materializado, barra o wrongAnswer
    // que é DESCRIÇÃO do erro em vez da resposta errada ("Resultado desalinhado
    // em ordens de grandeza" para um passo cujo gabarito é "12,75"). Entrava no
    // grafo e só disparava se o aluno digitasse a frase inteira, ou seja, nunca:
    // catálogo morto que inflava a contagem de diagnósticos sem diagnosticar.
    if (
      !isOperationalMisconceptionId(id) ||
      !wrongAnswer ||
      hasUnresolvedGraphTemplate(id) ||
      hasUnresolvedGraphTemplate(wrongAnswer)
    ) {
      unusable.push({ optionIndex: index, misconceptionId: id, wrongAnswer });
      continue;
    }

    // 2026-08-02: o descarte por FORMATO foi TENTADO aqui e REVERTIDO.
    //
    // Descartar a misconception dos records do step sem removê-la do nó deixa o
    // grafo com um diagnóstico órfão, e o audit acusa `stale_graph_misconception`
    // + `missingMisconceptionTriggers`. Reproduzido: 4 defeitos semânticos, que
    // é fatal — o final-gate rejeita o STI inteiro. Um STI de cinco passos caiu
    // assim por causa de um único diagnóstico malformado.
    //
    // A régua de formato continua valendo, mas como MEDIÇÃO (auditor pós-geração
    // e quality gate), onde ela informa sem criar estado inconsistente. Nas três
    // rodadas medidas o descarte nunca rendeu nada — `malformedDiagnostics` = 0 —
    // então era risco sem ganho.

    const diagnostic = scalar(
      option.diagnosticInfo || option.description || option.feedback || ""
    ).trim();
    let feedback = scalar(option.feedback || diagnostic).trim();
    if (!feedback || hasUnresolvedGraphTemplate(feedback)) {
      feedback = "Revise o conceito deste passo e refaça o raciocínio com calma.";
    }
    records.push({
      id,
      wrongAnswer,
      misconceptionType: option.misconceptionType || option.type || "unclassified",
      description:
        diagnostic && !hasUnresolvedGraphTemplate(diagnostic)
          ? diagnostic
          : `Resposta incorreta recorrente: ${wrongAnswer}`,
      feedback,
      severity: option.severity || "moderate",
      matcher: option.matcher || "exact",
      remediationInstruction:
        scalar(
          option.remediationInstruction ||
            option.feedback ||
            option.howToFix ||
            option.diagnosticInfo ||
            ""
        ).trim() || feedback,
      source: scalar(option.source || option.graphDiagnosticSource || "").trim(),
    });
  }

  return { present, records, unclassified, unusable };
}

/**
 * Misconceptions declaradas nas OPTIONS do próprio nó.
 *
 * 2026-08-02: quando não há steps (replay de artefato, reparo pós-geração), a
 * única fonte lida era `node.misconceptions` — e os distratores que declaram
 * `misconceptionId` dentro de `expectedInput.visualConfig.options` ficavam de
 * fora. O audit os via como órfãos (`source: "options"`), o reparo não criava
 * scaffold para eles, e o final-gate rejeitava o STI por "contrato adaptativo
 * permanece inexequível". Foi o que derrubou o P2 do STI de dinheiro.
 *
 * Pior que a rejeição: o `_checkMisconceptions` do engine LÊ essas options, então
 * o aluno que clica no distrator tem a misconception detectada e não tem
 * remediação nenhuma para onde ir.
 */
function optionDeclaredMisconceptions(node) {
  const colecoes = [
    node?.expectedInput?.visualConfig?.options,
    node?.expectedInput?.visualConfig?.componentProps?.options,
    node?.expectedInput?.config?.options,
    node?.expectedInput?.componentProps?.options,
    node?.expectedInput?.options,
    node?.options,
  ];
  return colecoes.flatMap(asArray).map((option) => ({
    id: scalar(option?.misconceptionId).trim(),
    wrongAnswer: scalar(option?.value ?? option?.id ?? option?.label).trim(),
    misconceptionType: option?.misconceptionType || "unclassified",
    description: scalar(option?.diagnosticInfo || option?.description || "").trim(),
    feedback: scalar(option?.feedback || "").trim(),
    severity: option?.severity || "moderate",
    matcher: option?.matcher || "exact",
    isCorrect: option?.isCorrect === true,
  }));
}

function existingOperationalMisconceptions(node) {
  const declaradasEmOptions = optionDeclaredMisconceptions(node)
    .filter(
      (item) =>
        !item.isCorrect &&
        item.id &&
        item.wrongAnswer &&
        !hasUnresolvedGraphTemplate(item.id) &&
        !hasUnresolvedGraphTemplate(item.wrongAnswer)
    )
    .map((item) => ({
      id: item.id,
      wrongAnswer: item.wrongAnswer,
      misconceptionType: item.misconceptionType,
      // Mesma guarda anti-template do caminho de node.misconceptions abaixo.
      description:
        item.description && !hasUnresolvedGraphTemplate(item.description)
          ? item.description
          : `Resposta incorreta: ${item.wrongAnswer}`,
      feedback:
        item.feedback && !hasUnresolvedGraphTemplate(item.feedback)
          ? item.feedback
          : "Revise o conceito deste passo e refaça o raciocínio com calma.",
      severity: item.severity,
      matcher: item.matcher,
    }));

  return (
    asArray(node?.misconceptions)
      .map((misc) => {
        const id = scalar(misc?.id || misc?.misconceptionId).trim();
        const wrongAnswer = scalar(misc?.wrongAnswer).trim();
        if (
          !id ||
          !isOperationalMisconceptionId(id) ||
          !wrongAnswer ||
          hasUnresolvedGraphTemplate(id) ||
          hasUnresolvedGraphTemplate(wrongAnswer)
        ) {
          return null;
        }
        let feedback = scalar(misc.feedback || misc.remediation || "").trim();
        if (!feedback || hasUnresolvedGraphTemplate(feedback)) {
          feedback = "Revise o conceito deste passo e refaça o raciocínio com calma.";
        }
        // 2026-08-03 (verificação adversarial, 6 casos vivos no caminho
        // V10/skeleton): description e remediationInstruction com slot {A}/{B}
        // não filtrado voltavam para node.misconceptions e propagavam para o
        // scaffold — unresolvedPlaceholders que NENHUM reparo zera (loop
        // fatal). Mesma guarda que o caminho gêmeo em sourceMisconceptions.
        let description = scalar(misc.description || "").trim();
        if (!description || hasUnresolvedGraphTemplate(description)) {
          description = `Resposta incorreta: ${wrongAnswer}`;
        }
        let remediationInstruction = scalar(misc.remediation || misc.feedback || "").trim();
        if (!remediationInstruction || hasUnresolvedGraphTemplate(remediationInstruction)) {
          remediationInstruction = feedback;
        }
        return {
          id,
          wrongAnswer,
          misconceptionType: misc.misconceptionType || misc.type || "unclassified",
          description,
          feedback,
          severity: misc.severity || "moderate",
          matcher: misc.matcher || "exact",
          remediationInstruction,
          source: scalar(misc.source || "").trim(),
        };
      })
      .filter(Boolean)
      // As declaradas em `node.misconceptions` vencem; as das options entram só
      // para os ids que ainda não têm contrato (dedupRecords remove o resto).
      .concat(
        declaradasEmOptions.map((item) => ({
          ...item,
          remediationInstruction: item.feedback,
          source: "expectedInput.options",
        }))
      )
  );
}

/**
 * 2026-08-02 (painel sênior, P0.4): dedup por ID **e** por wrongAnswer
 * NORMALIZADO, com a mesma normalização que o runtime usa.
 *
 * Duas misconceptions de ids diferentes com a mesma resposta errada colidem: o
 * `_checkMisconceptions` do engine casa a primeira, a segunda nunca dispara e o
 * scaffold dela fica órfão. Medido em 4 nós (water step_1 e step_2, geometry
 * step_1, fracoes step_5) — e o caso de água é pior, porque a colisão só aparece
 * DEPOIS de normalizar: "condensação" e "condensacão" são ids distintos com
 * grafias distintas que o runtime achata no mesmo valor.
 *
 * A primeira vence: é a que o runtime acionaria de qualquer forma — isso
 * continua valendo pro id/scaffold que sobrevive (não mudar aqui, é
 * comportamento verificado do runtime). 2026-08-06 (auditoria inner/outer
 * loop, achado ao vivo em 4/8 passos de uma geração real): o que MUDA é que
 * a 2ª misconception não é mais descartada em silêncio — seu feedback é
 * FUNDIDO no record sobrevivente (mergeCollidingFeedback), porque o aluno
 * que chegou nessa resposta errada pelo raciocínio B (não A) hoje recebe um
 * feedback que não fala do erro dele. Fundir cobre as duas leituras em vez
 * de escolher 1 e apagar a outra. Pendência documentada desde 2026-08-04
 * (memória do projeto): "fecha com buggy rule único cobrindo as duas
 * leituras, ou desambiguação por trajetória" — trajetória é trabalho de
 * runtime bem maior; buggy rule único é o que este merge implementa.
 */
function dedupRecords(records) {
  const idsVistos = new Set();
  const sobreviventePorResposta = new Map(); // chaveResposta -> record sobrevivente
  const out = [];
  for (const record of records) {
    if (idsVistos.has(record.id)) continue;
    const chaveResposta = normalizeRuntimeAnswer(record.wrongAnswer);
    if (chaveResposta && sobreviventePorResposta.has(chaveResposta)) {
      mergeCollidingFeedback(sobreviventePorResposta.get(chaveResposta), record);
      idsVistos.add(record.id);
      continue;
    }
    idsVistos.add(record.id);
    if (chaveResposta) sobreviventePorResposta.set(chaveResposta, record);
    out.push(record);
  }
  return out;
}

/**
 * Funde o feedback/description do duplicado descartado no record que
 * sobrevive a dedupRecords — sem trocar id/scaffold (só o texto que o aluno
 * lê). Capado em 1 fusão por record (3+ colisões na mesma resposta são raras
 * e um feedback com 3 "ou" vira ruído); colisões extras seguem descartadas
 * como antes.
 */
function mergeCollidingFeedback(survivor, duplicate) {
  if (survivor._mergedFrom) return;
  const dupFeedback = scalar(duplicate.feedback).trim();
  if (dupFeedback && dupFeedback !== scalar(survivor.feedback).trim()) {
    survivor.feedback = `${survivor.feedback} (Ou, se foi por outro motivo: ${dupFeedback})`;
  }
  const dupDescription = scalar(duplicate.description).trim();
  if (dupDescription && dupDescription !== scalar(survivor.description).trim()) {
    survivor.description = scalar(survivor.description).trim()
      ? `${survivor.description} | ${dupDescription}`
      : dupDescription;
  }
  survivor._mergedFrom = duplicate.id;
}

/**
 * Colisão de wrongAnswer DENTRO do step — 2026-08-06.
 *
 * `dedupRecords` já resolve a colisão nos registros do GRAFO (o perdedor sai e
 * seu feedback é fundido no sobrevivente). Mas `step.behaviorMisconceptions` é
 * outra lista e nunca passou por lá: medido em 2 gerações reais de produção
 * (equações step_4 resposta "8"; capitais step_3 resposta "interiorana"), o
 * step seguia com DOIS diagnósticos para a mesma resposta errada.
 *
 * O dano NÃO é scaffold órfão — nos dois casos o perdedor sequer tinha
 * scaffold, porque a poda do grafo já o havia removido. O dano é o aluno que
 * chegou naquela resposta pelo raciocínio B ler a explicação do raciocínio A:
 * o runtime casa o PRIMEIRO registro e o feedback do segundo se perde.
 *
 * Funde o texto do perdedor no primeiro (mesma semântica de
 * `mergeCollidingFeedback`) e NÃO remove o registro: apagar aqui mexeria no
 * contrato nó<->step que `enforceBehaviorGraphIntegrity` valida, e foi
 * justamente uma dessincronização desse contrato que produziu o defeito fatal
 * em ponto fixo de 2026-08-05. Fundir cobre as duas leituras sem tocar na
 * topologia.
 */
/**
 * 2026-08-17 (rejeicao em producao, 1a geracao do caderno): o worker escreveu
 * `misconceptionId: "misc_viés_numero_inteiro"` (acento) num passo de superficie
 * ABERTA (fraction_bar). Este modulo so normalizava ids de `step.options`; o
 * registro em `behaviorMisconceptions` seguia acentuado, entrava no grafo como
 * distrator "unusable" (OPERATIONAL_MISCONCEPTION_ID_RE) e virava defeito
 * semantico FATAL: STI inteiro rejeitado por um acento. Latente tambem no modo
 * rico (mesma superficie), so mais provavel no caderno porque quase todo passo
 * de instrumento e superficie aberta. Normaliza no lugar (id e misconceptionId)
 * ANTES de o agente 7 montar arestas, entao no/aresta/scaffold nascem com o id
 * canonico e o registro no step continua identico ao do no.
 */
function normalizeBehaviorMisconceptionIds(step, repairs, label, stepIndex) {
  const misconceptions = step?.behaviorMisconceptions;
  if (!Array.isArray(misconceptions)) return;
  let fixed = 0;
  for (const record of misconceptions) {
    if (!record || typeof record !== "object") continue;
    for (const key of ["misconceptionId", "id"]) {
      const raw = scalar(record[key]).trim();
      if (!raw || isOperationalMisconceptionId(raw)) continue;
      const canonical = normalizeMisconceptionId(raw);
      if (canonical && canonical !== raw) {
        record[key] = canonical;
        fixed++;
      }
    }
    if (record.misconceptionId && record.id && record.misconceptionId !== record.id) {
      // Os dois campos sao espelho um do outro em todo o pipeline; se so um
      // estava acentuado, o normalizado vence para nao criar dois ids.
      const a = scalar(record.misconceptionId).trim();
      const b = scalar(record.id).trim();
      if (isOperationalMisconceptionId(a) && !isOperationalMisconceptionId(b)) record.id = a;
      else if (isOperationalMisconceptionId(b) && !isOperationalMisconceptionId(a))
        record.misconceptionId = b;
    }
  }
  if (fixed > 0) {
    repairs.push(
      `${label}/${step.id || `step_${stepIndex + 1}`}: ${fixed} id(s) de misconception normalizado(s) (acento/caractere invalido)`
    );
  }
}

function mergeStepMisconceptionCollisions(step, repairs, label, stepIndex) {
  const misconceptions = step?.behaviorMisconceptions;
  if (!Array.isArray(misconceptions) || misconceptions.length < 2) return;
  const primeiroPorResposta = new Map();
  for (const record of misconceptions) {
    if (!record || typeof record !== "object") continue;
    const chave = normalizeRuntimeAnswer(record.wrongAnswer);
    if (!chave) continue;
    const id = scalar(record.id).trim();
    const anterior = primeiroPorResposta.get(chave);
    if (!anterior) {
      primeiroPorResposta.set(chave, record);
      continue;
    }
    // Mesmo id nas duas pontas é espelho, não colisão: nada a fundir.
    if (id && id === scalar(anterior.id).trim()) continue;
    mergeCollidingFeedback(anterior, record);
    repairs.push(
      `${label}/${step.id || `step_${stepIndex + 1}`}: feedback de ${id || "misconception sem id"} fundido em ${scalar(anterior.id).trim() || "sobrevivente"} (mesma resposta errada)`
    );
  }
}

/** Mesma normalização de `normalizeExactText` do graphEngine (runtime real).
 *
 * 2026-08-09 (colheita): exportada. A colheita de erros reais precisa decidir
 * se a resposta que o aluno digitou JÁ tem rota no grafo, e essa decisão só
 * vale se usar exatamente a mesma chave que o runtime usa para casar. Uma
 * segunda normalização "parecida" faria a colheita propor diagnóstico
 * duplicado para uma resposta que já era roteada. */
export function normalizeRuntimeAnswer(value) {
  // 2026-08-03: paridade BYTE A BYTE com normalizeExactText do graphEngine
  // (frontend/src/lib/graphEngine.js). Faltava o colapso de espaços internos:
  // "12  cm" e "12 cm" não dedupavam aqui, mas são indistinguíveis no runtime —
  // sub-dedup silencioso que deixava rota pedagógica morta sem nenhum gate ver.
  return scalar(value)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function publicRecord(record) {
  return {
    id: record.id,
    wrongAnswer: record.wrongAnswer,
    misconceptionType: record.misconceptionType,
    description: record.description,
    feedback: record.feedback,
    severity: record.severity,
    matcher: record.matcher,
    source: record.source || undefined,
  };
}

function isSpecificDiagnosticRecord(record) {
  const id = scalar(record?.id || record?.misconceptionId).trim();
  const type = scalar(record?.misconceptionType || record?.type)
    .trim()
    .toLowerCase();
  const source = scalar(record?.source || record?.graphDiagnosticSource)
    .trim()
    .toLowerCase();
  return !!(
    id &&
    type &&
    type !== "unclassified" &&
    !/^misc_(?:generic|unclassified|numeric_near|text_confusion)(?:_|$)/.test(id) &&
    // 2026-08-09: `regra_falsa_aterrada` entra na mesma exclusão que o fallback
    // determinístico, e por um motivo que não é sobre qualidade do texto.
    //
    // O motor de regras falsas (agents/diagnostics/buggy-rules.js) acerta 3,3x
    // mais erro real de aluno que o modelo de erro escrito pelos agentes, e a
    // rota que ele cria é entregue ao aluno normalmente — isso continua valendo.
    // O que NÃO pode acontecer é ela contar como cobertura adaptativa
    // ESPECÍFICA: essa métrica é o instrumento que mede o que os AGENTES
    // produziram. Deixar a rede de segurança alimentar o instrumento cegaria o
    // gate justamente quando o gerador falhasse — ele passaria a aprovar um STI
    // sem diagnóstico nenhum, porque a máquina completaria por baixo.
    // Rede de segurança para o aluno e evidência de qualidade de geração são
    // coisas diferentes e não podem compartilhar contador.
    !/^(?:deterministic_.*fallback|regra_falsa_aterrada)$/.test(source)
  );
}

function safeIdToken(value) {
  return normalizeMisconceptionId(value, "unknown");
}

function canonicalScaffoldId(stepId, misconceptionId, repeated) {
  const misc = safeIdToken(misconceptionId);
  return repeated ? `scaffold_${misc}__${safeIdToken(stepId)}` : `scaffold_${misc}`;
}

function genericRemediationCopy(outputLanguageCode = "pt-BR") {
  const language = String(outputLanguageCode || "pt-BR").toLowerCase();
  if (language.startsWith("en")) {
    return {
      description: "Generic remediation after repeated difficulty",
      instruction:
        "Let's revisit this step. Identify the key concept, work through it in smaller parts, and try again.",
    };
  }
  if (language.startsWith("es")) {
    return {
      description: "Remediación general tras una dificultad repetida",
      instruction:
        "Revisemos este paso. Identifica el concepto principal, resuélvelo en partes más pequeñas e inténtalo de nuevo.",
    };
  }
  if (language.startsWith("fr")) {
    return {
      description: "Remédiation générale après une difficulté répétée",
      instruction:
        "Reprenons cette étape. Identifiez le concept principal, décomposez le raisonnement et réessayez.",
    };
  }
  return {
    description: "Remediação geral após dificuldade repetida",
    instruction:
      "Vamos retomar este passo. Identifique o conceito principal, divida o raciocínio em partes menores e tente novamente.",
  };
}

function dedupEdges(edges) {
  const seen = new Set();
  const out = [];
  for (const edge of edges) {
    const key = `${edge.from}→${edge.to}:${edge.condition ?? "default"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(edge);
  }
  return out;
}

function reachableFrom(startId, edges, nodeIds) {
  if (!startId || !nodeIds.has(startId)) return new Set();
  const seen = new Set([startId]);
  const stack = [startId];
  while (stack.length) {
    const current = stack.pop();
    for (const edge of edges) {
      if (edge.from !== current || !nodeIds.has(edge.to) || seen.has(edge.to)) continue;
      seen.add(edge.to);
      stack.push(edge.to);
    }
  }
  return seen;
}

function semanticFingerprint(graph) {
  return JSON.stringify({
    nodes: asArray(graph?.nodes)
      .filter((node) => node.type === "step" || node.type === "scaffold")
      .map((node) => ({
        id: node.id,
        type: node.type,
        misconceptions: node.misconceptions,
        scaffoldNodes: node.scaffoldNodes,
        targetMisconception: node.targetMisconception,
        instruction: node.instruction,
        description: node.description,
        knowledgeComponents: node.knowledgeComponents,
        scaffoldTrigger: node.scaffoldTrigger,
      })),
    edges: asArray(graph?.edges).filter(
      (edge) =>
        parseMisconceptionCondition(edge.condition) ||
        /^misconception\s*\(/i.test(String(edge.condition || "").trim()) ||
        /struggle/i.test(String(edge.condition || "")) ||
        String(edge.from || "").startsWith("scaffold_") ||
        String(edge.to || "").startsWith("scaffold_")
    ),
  });
}

/**
 * Audita a semântica adaptativa. Não altera o grafo.
 * `steps` permite comparar o grafo com as opções finais realmente mostradas.
 */
export function auditBehaviorGraphSemantics(graph, steps = []) {
  const nodes = asArray(graph?.nodes);
  const edges = asArray(graph?.edges);
  const finalSteps = asArray(steps);
  const stepNodes = nodes.filter((node) => node.type === "step");
  const scaffolds = nodes.filter((node) => node.type === "scaffold");
  const nodeIds = new Set(nodes.map((node) => node.id));
  const scaffoldById = new Map(scaffolds.map((node) => [node.id, node]));
  const lookup = buildStepLookup(finalSteps);

  const duplicateNodeIds = [];
  // `steps=[]` também é usado por auditorias estruturais sem o artefato final;
  // nesse modo não inferimos cardinalidade. Quando há finalSteps, porém, a
  // relação é estritamente bijetiva: nem ausência nem sobra são toleradas.
  const hasFinalStepContract = finalSteps.length > 0;
  const expectedStepIds = canonicalGraphStepIds(finalSteps);
  const missingGraphStepNodes =
    hasFinalStepContract && finalSteps.length > stepNodes.length
      ? [{ expectedSteps: finalSteps.length, graphSteps: stepNodes.length }]
      : [];
  const extraGraphStepNodes =
    hasFinalStepContract && stepNodes.length > finalSteps.length
      ? [{ expectedSteps: finalSteps.length, graphSteps: stepNodes.length }]
      : [];
  const graphStepIdentityMismatches = hasFinalStepContract
    ? stepNodes.flatMap((node, index) => {
        const expectedId = expectedStepIds[index];
        if (expectedId == null || node?.id === expectedId) return [];
        return [{ index, expectedId, graphId: node?.id ?? null }];
      })
    : [];
  const stepContractMismatches = [];
  const malformedMisconceptionConditions = edges
    .filter(
      (edge) =>
        /^misconception\s*\(/i.test(String(edge?.condition || "").trim()) &&
        !parseMisconceptionCondition(edge.condition)
    )
    .map((edge) => ({ from: edge.from, to: edge.to, condition: edge.condition }));
  const unknownMisconceptionTriggers = [];
  const misroutedMisconceptionTriggers = [];
  const missingMisconceptionTriggers = [];
  const duplicateMisconceptionTriggers = [];
  const misroutedStruggleTriggers = [];
  const duplicateStruggleTriggers = [];
  const wrongScaffoldReturns = [];
  const sharedScaffolds = [];
  const duplicateMisconceptionIds = [];
  const desynchronizedMisconceptions = [];
  const unclassifiedDistractors = [];
  const unusableDistractors = [];
  const unclassifiedDiagnosticMisconceptions = [];
  const unresolvedPlaceholders = [];
  const scaffoldNodesMismatches = [];
  const missingScaffoldTriggers = [];
  const stepsWithoutAdaptiveCoverage = [];
  const specificAdaptiveSteps = [];
  const genericOnlyAdaptiveSteps = [];
  const constructedStepsWithoutSpecificDiagnosis = [];
  const scaffoldOwners = new Map();

  const nodeIdCounts = new Map();
  for (const node of nodes) {
    const id = scalar(node?.id).trim();
    if (!id) continue;
    const count = (nodeIdCounts.get(id) || 0) + 1;
    nodeIdCounts.set(id, count);
    if (count === 2) duplicateNodeIds.push(id);
  }

  for (let stepIndex = 0; stepIndex < stepNodes.length; stepIndex++) {
    const stepNode = stepNodes[stepIndex];
    const declared = asArray(stepNode.misconceptions);
    const declaredById = new Map();
    for (let miscIndex = 0; miscIndex < declared.length; miscIndex++) {
      const misc = declared[miscIndex];
      const id = scalar(misc?.id || misc?.misconceptionId).trim();
      if (!id) continue;
      if (declaredById.has(id)) {
        duplicateMisconceptionIds.push({ step: stepNode.id, misconceptionId: id });
      } else {
        declaredById.set(id, misc);
      }
      const type = scalar(misc?.misconceptionType || misc?.type)
        .trim()
        .toLowerCase();
      if (
        !type ||
        type === "unclassified" ||
        /^misc_(?:generic|unclassified|numeric_near|text_confusion)(?:_|$)/.test(id) ||
        /^deterministic_.*fallback$/.test(
          scalar(misc?.source || misc?.graphDiagnosticSource)
            .trim()
            .toLowerCase()
        )
      ) {
        unclassifiedDiagnosticMisconceptions.push({
          step: stepNode.id,
          misconceptionId: id,
          misconceptionType: type || null,
        });
      }
      for (const field of ["id", "wrongAnswer", "description", "feedback"]) {
        if (hasUnresolvedGraphTemplate(misc?.[field])) {
          unresolvedPlaceholders.push({
            path: `${stepNode.id}.misconceptions[${miscIndex}].${field}`,
            value: scalar(misc?.[field]),
          });
        }
      }
    }

    // A ordem do array final é o contrato. Lookup por id só é fallback para a
    // auditoria legada sem cardinalidade final explícita.
    const matchedStep = hasFinalStepContract
      ? finalSteps[stepIndex] || null
      : matchStep(stepNode, stepIndex, finalSteps, lookup);
    if (matchedStep) {
      const contractDiff = contractFieldMismatches(stepNode, matchedStep);
      if (contractDiff.fields.length > 0) {
        stepContractMismatches.push({
          step: stepNode.id,
          expectedStep: expectedStepIds[stepIndex] || matchedStep.id || null,
          fields: contractDiff.fields,
        });
      }
      const source = sourceMisconceptions(matchedStep);
      unclassifiedDistractors.push(
        ...source.unclassified.map((item) => ({ step: stepNode.id, ...item }))
      );
      unusableDistractors.push(...source.unusable.map((item) => ({ step: stepNode.id, ...item })));

      if (source.present) {
        // A detecção de id duplicado continua olhando os records CRUS — é uma
        // propriedade da fonte, não do grafo.
        const rawIds = new Set();
        for (const record of source.records) {
          if (rawIds.has(record.id)) {
            duplicateMisconceptionIds.push({
              step: stepNode.id,
              misconceptionId: record.id,
              source: "options",
            });
          }
          rawIds.add(record.id);
        }
        // 2026-08-03 (produção rejeitando 100% das gerações): a DEMANDA de
        // presença no nó usa a MESMA régua canônica com que o sync escreve
        // (dedupRecords). O runtime casa por valor normalizado e só a primeira
        // rota por wrongAnswer é executável; o sync (P0.4) descarta a segunda
        // ao gravar o nó. Exigir aqui o id descartado criava um
        // `missing_in_graph_node` que NENHUM reparo consegue satisfazer — duas
        // misconceptions com a mesma resposta errada ("contar lado inicial duas
        // vezes" e "off-by-one" → ambas '7') derrubavam o STI inteiro no
        // final-gate. Reproduzido com geometry (rodada e2e "final").
        const sourceIds = new Set();
        for (const record of dedupRecords(source.records)) {
          sourceIds.add(record.id);
          const graphRecord = declaredById.get(record.id);
          if (!graphRecord) {
            desynchronizedMisconceptions.push({
              step: stepNode.id,
              misconceptionId: record.id,
              reason: "missing_in_graph_node",
            });
          } else if (scalar(graphRecord.wrongAnswer).trim() !== record.wrongAnswer) {
            desynchronizedMisconceptions.push({
              step: stepNode.id,
              misconceptionId: record.id,
              reason: "wrong_answer_mismatch",
              optionValue: record.wrongAnswer,
              graphValue: scalar(graphRecord.wrongAnswer).trim(),
            });
          }
        }
        for (const id of declaredById.keys()) {
          if (!sourceIds.has(id)) {
            desynchronizedMisconceptions.push({
              step: stepNode.id,
              misconceptionId: id,
              reason: "stale_graph_misconception",
            });
          }
        }
      }
    }

    const exactTargetsById = new Map();
    let validSpecificRouteCount = 0;
    let validDiagnosticRouteCount = 0;
    for (const edge of edges.filter((item) => item.from === stepNode.id)) {
      const triggerId = parseMisconceptionCondition(edge.condition);
      if (!triggerId) continue;
      if (!declaredById.has(triggerId)) {
        unknownMisconceptionTriggers.push({
          step: stepNode.id,
          misconceptionId: triggerId,
          to: edge.to,
        });
      }
      const target = scaffoldById.get(edge.to);
      if (!target || target.targetMisconception !== triggerId) {
        misroutedMisconceptionTriggers.push({
          step: stepNode.id,
          misconceptionId: triggerId,
          to: edge.to,
          targetMisconception: target?.targetMisconception ?? null,
        });
        continue;
      }
      const targets = exactTargetsById.get(triggerId) || [];
      targets.push(target.id);
      exactTargetsById.set(triggerId, targets);
      const owners = scaffoldOwners.get(target.id) || new Set();
      owners.add(stepNode.id);
      scaffoldOwners.set(target.id, owners);

      const returnsToOrigin = edges.some(
        (item) =>
          item.from === target.id &&
          item.to === stepNode.id &&
          (item.condition === "correct" || item.condition === "default")
      );
      if (!returnsToOrigin) {
        wrongScaffoldReturns.push({
          step: stepNode.id,
          misconceptionId: triggerId,
          scaffold: target.id,
        });
      } else {
        validSpecificRouteCount++;
        if (isSpecificDiagnosticRecord(declaredById.get(triggerId))) {
          validDiagnosticRouteCount++;
        }
      }
    }

    for (const id of declaredById.keys()) {
      const targets = exactTargetsById.get(id) || [];
      if (targets.length === 0) {
        missingMisconceptionTriggers.push({ step: stepNode.id, misconceptionId: id });
      } else if (targets.length > 1) {
        duplicateMisconceptionTriggers.push({
          step: stepNode.id,
          misconceptionId: id,
          targets,
        });
      }
    }

    const validGenericTargets = [];
    for (const edge of edges.filter(
      (item) =>
        item.from === stepNode.id && /^struggles(?:\(|$)/i.test(String(item.condition || "").trim())
    )) {
      const target = scaffoldById.get(edge.to);
      if (!target || target.targetMisconception !== "generic_struggle") {
        misroutedStruggleTriggers.push({
          step: stepNode.id,
          to: edge.to,
          targetMisconception: target?.targetMisconception ?? null,
        });
        continue;
      }
      const owners = scaffoldOwners.get(target.id) || new Set();
      owners.add(stepNode.id);
      scaffoldOwners.set(target.id, owners);
      const returnsToOrigin = edges.some(
        (item) =>
          item.from === target.id &&
          item.to === stepNode.id &&
          (item.condition === "correct" || item.condition === "default")
      );
      if (!returnsToOrigin) {
        wrongScaffoldReturns.push({
          step: stepNode.id,
          misconceptionId: "generic_struggle",
          scaffold: target.id,
        });
        continue;
      }
      validGenericTargets.push(target.id);
    }
    if (validGenericTargets.length > 1) {
      duplicateStruggleTriggers.push({
        step: stepNode.id,
        targets: [...validGenericTargets],
      });
    }

    const desiredRefs = new Set();
    for (const targets of exactTargetsById.values()) {
      for (const target of targets) desiredRefs.add(target);
    }
    for (const target of validGenericTargets) desiredRefs.add(target);

    if (validDiagnosticRouteCount > 0) {
      specificAdaptiveSteps.push({ step: stepNode.id, routes: validDiagnosticRouteCount });
    } else if (validGenericTargets.length > 0) {
      genericOnlyAdaptiveSteps.push({ step: stepNode.id, routes: validGenericTargets.length });
    }
    if (hasFinalStepContract && validSpecificRouteCount === 0 && validGenericTargets.length === 0) {
      stepsWithoutAdaptiveCoverage.push({ step: stepNode.id });
    }
    if (matchedStep) {
      const finalChoices = stepOptions(matchedStep);
      if (finalChoices.options.length === 0 && validDiagnosticRouteCount === 0) {
        constructedStepsWithoutSpecificDiagnosis.push({ step: stepNode.id });
      }
    }
    const actualRefs = new Set(asArray(stepNode.scaffoldNodes));
    const refsDiffer =
      desiredRefs.size !== actualRefs.size || [...desiredRefs].some((id) => !actualRefs.has(id));
    if (refsDiffer) {
      scaffoldNodesMismatches.push({
        step: stepNode.id,
        expected: [...desiredRefs],
        actual: [...actualRefs],
      });
    }

    const trigger = stepNode.scaffoldTrigger;
    const hasExecutableTrigger =
      trigger &&
      ((Number(trigger.maxAttempts) || 0) > 0 ||
        (Number(trigger.timeThresholdSeconds) || 0) > 0 ||
        trigger.prerequisiteMasteryBelow != null);
    if (desiredRefs.size > 0 && !hasExecutableTrigger) {
      missingScaffoldTriggers.push({ step: stepNode.id });
    }
  }

  for (const [scaffold, owners] of scaffoldOwners.entries()) {
    if (owners.size > 1) sharedScaffolds.push({ scaffold, steps: [...owners] });
  }

  for (let index = 0; index < scaffolds.length; index++) {
    const scaffold = scaffolds[index];
    for (const field of ["targetMisconception", "instruction", "description"]) {
      if (hasUnresolvedGraphTemplate(scaffold?.[field])) {
        unresolvedPlaceholders.push({
          path: `${scaffold.id || `scaffold[${index}]`}.${field}`,
          value: scalar(scaffold?.[field]),
        });
      }
    }
  }

  const start = nodes.find((node) => node.type === "start");
  const reachable = start ? reachableFrom(start.id, edges, nodeIds) : null;
  const unreachableScaffolds = reachable
    ? scaffolds.filter((node) => !reachable.has(node.id)).map((node) => node.id)
    : [];

  // 2026-08-03: `ok` deriva da MESMA lista exportada (SEMANTIC_DEFECT_KEYS)
  // que o resto do sistema usa para CONTAR defeitos. Existia aqui uma segunda
  // cópia hardcoded da régua, e as duas divergiram no momento em que
  // duplicateMisconceptionIds deixou de ser fatal: o quality gate reprovava o
  // STI com a mensagem "0 dangling, 0 violações semânticas" — inválido segundo
  // uma régua, limpo segundo a outra. Uma lista só, para nunca mais.
  const result = {
    duplicateNodeIds,
    missingGraphStepNodes,
    extraGraphStepNodes,
    graphStepIdentityMismatches,
    stepContractMismatches,
    malformedMisconceptionConditions,
    unknownMisconceptionTriggers,
    misroutedMisconceptionTriggers,
    missingMisconceptionTriggers,
    duplicateMisconceptionTriggers,
    misroutedStruggleTriggers,
    duplicateStruggleTriggers,
    wrongScaffoldReturns,
    sharedScaffolds,
    duplicateMisconceptionIds,
    desynchronizedMisconceptions,
    unclassifiedDistractors,
    unusableDistractors,
    unclassifiedDiagnosticMisconceptions,
    unresolvedPlaceholders,
    scaffoldNodesMismatches,
    missingScaffoldTriggers,
    stepsWithoutAdaptiveCoverage,
    specificAdaptiveSteps,
    genericOnlyAdaptiveSteps,
    constructedStepsWithoutSpecificDiagnosis,
    unreachableScaffolds,
  };
  result.ok = SEMANTIC_DEFECT_KEYS.every(
    (key) => !Array.isArray(result[key]) || result[key].length === 0
  );
  return result;
}

/**
 * Materializa a bijeção finalStep[i] ↔ graphStep[i] e copia o contrato de
 * execução completo. A renomeação das arestas é simultânea, logo também é
 * segura quando dois IDs trocam de posição. Steps excedentes são removidos;
 * steps ausentes são sintetizados e depois recebem o mesmo contrato canônico.
 */
export function synchronizeBehaviorGraphStepContracts(graph, steps = [], opts = {}) {
  const repairs = [];
  const label = opts.label || "graph";
  const finalSteps = asArray(steps);
  if (!graph || typeof graph !== "object" || finalSteps.length === 0) {
    return { repairs, audit: auditBehaviorGraphSemantics(graph, steps) };
  }
  if (!Array.isArray(graph.nodes)) graph.nodes = [];
  if (!Array.isArray(graph.edges)) graph.edges = [];

  const expectedIds = canonicalGraphStepIds(finalSteps);
  const expectedIdSet = new Set(expectedIds);
  const oldStepNodes = graph.nodes.filter((node) => node?.type === "step");
  const oldToNew = new Map();
  const seenOldIds = new Set();
  const canonicalSteps = [];

  for (let index = 0; index < finalSteps.length; index++) {
    const step = finalSteps[index];
    const oldNode = oldStepNodes[index];
    const expectedId = expectedIds[index];
    if (oldNode?.id != null && !seenOldIds.has(oldNode.id)) {
      oldToNew.set(oldNode.id, expectedId);
      seenOldIds.add(oldNode.id);
    }

    const node = oldNode ? { ...oldNode } : { type: "step", misconceptions: [], scaffoldNodes: [] };
    node.id = expectedId;
    node.type = "step";
    node.instruction = scalar(step?.instruction ?? "").trim();
    node.expectedInput = buildCanonicalExpectedInput(step);
    node.knowledgeComponents = desiredKnowledgeComponents(step);
    canonicalSteps.push(node);
  }

  const oldIdsThatRemain = new Set(
    oldStepNodes.slice(0, finalSteps.length).map((node) => node?.id)
  );
  const removedStepIds = new Set(
    oldStepNodes
      .slice(finalSteps.length)
      .map((node) => node?.id)
      .filter((id) => id != null && !oldIdsThatRemain.has(id))
  );

  // Um scaffold com o mesmo id de um passo torna `find(node.id)` ambíguo. Ele
  // é descartado aqui; a sincronização semântica logo abaixo o recompila com
  // um id livre caso ainda seja necessário.
  const conflictingScaffoldIds = new Set(
    graph.nodes
      .filter((node) => node?.type === "scaffold" && expectedIdSet.has(node.id))
      .map((node) => node.id)
  );

  const nonStepNodes = graph.nodes.filter(
    (node) => node?.type !== "step" && !conflictingScaffoldIds.has(node?.id)
  );
  const firstStepIndex = graph.nodes.findIndex((node) => node?.type === "step");
  const goalIndex = nonStepNodes.findIndex((node) => node?.type === "goal");
  const insertionIndex =
    firstStepIndex >= 0
      ? graph.nodes
          .slice(0, firstStepIndex)
          .filter((node) => node?.type !== "step" && !conflictingScaffoldIds.has(node?.id)).length
      : goalIndex >= 0
        ? goalIndex
        : nonStepNodes.length;
  graph.nodes = [
    ...nonStepNodes.slice(0, insertionIndex),
    ...canonicalSteps,
    ...nonStepNodes.slice(insertionIndex),
  ];

  graph.edges = graph.edges
    .map((edge) => ({
      ...edge,
      from: oldToNew.get(edge.from) || edge.from,
      to: oldToNew.get(edge.to) || edge.to,
    }))
    .filter(
      (edge) =>
        !removedStepIds.has(edge.from) &&
        !removedStepIds.has(edge.to) &&
        !conflictingScaffoldIds.has(edge.from) &&
        !conflictingScaffoldIds.has(edge.to)
    );

  const cardinalityChanged = oldStepNodes.length !== finalSteps.length;
  const identityChanged = oldStepNodes.some(
    (node, index) => expectedIds[index] != null && node?.id !== expectedIds[index]
  );
  const contractChanged = canonicalSteps.some((node, index) => {
    const old = oldStepNodes[index];
    if (!old) return true;
    return contractFieldMismatches(old, finalSteps[index]).fields.length > 0;
  });
  if (cardinalityChanged || identityChanged) {
    repairs.push(
      `${label}: bijeção steps↔grafo recompilada (${oldStepNodes.length}→${finalSteps.length} nós)`
    );
  }
  if (conflictingScaffoldIds.size > 0) {
    repairs.push(`${label}: ${conflictingScaffoldIds.size} scaffold(s) com id de step removido(s)`);
  }
  if (contractChanged) {
    repairs.push(`${label}: KC e expectedInput sincronizados com os steps finais`);
  }

  return { repairs, audit: auditBehaviorGraphSemantics(graph, steps) };
}

/**
 * Recompila deterministicamente a camada adaptativa a partir dos steps finais.
 * Não altera respostas corretas, componentes nem KCs. Nos steps, a ÚNICA
 * mutação permitida (2026-08-03) é reapontar option.misconceptionId quando duas
 * options colidem no mesmo wrongAnswer normalizado — o id descartado pelo dedup
 * é substituído pelo sobrevivente, mantendo step e nó no MESMO contrato.
 */
export function synchronizeBehaviorGraphSemantics(graph, steps = [], opts = {}) {
  const repairs = [];
  const label = opts.label || "graph";
  const synthesizeScaffolds = opts.synthesizeScaffolds !== false;
  const ensureAdaptiveCoverage = synthesizeScaffolds && opts.ensureAdaptiveCoverage !== false;
  const genericCopy = genericRemediationCopy(opts.outputLanguageCode);

  // 2026-08-02 (painel sênior): o `scaffoldBank` do tutor traz a DECOMPOSIÇÃO
  // que o autor escreveu para cada erro — perguntas socráticas que quebram o
  // raciocínio em partes. Ela nunca chegava ao grafo: os 88 nós scaffold dos
  // STIs auditados tinham `subSteps: []`, então a "remediação" era só o feedback
  // repetido, sem decomposição nenhuma. Em geometry havia 38 entradas de banco
  // com conteúdo e 15 scaffolds vazios no grafo.
  const decomposicaoPorMisconception = new Map();
  for (const entrada of asArray(opts.scaffoldBank)) {
    const alvo = scalar(entrada?.misconceptionId ?? entrada?.targetMisconception).trim();
    const passos = asArray(entrada?.subSteps).filter(
      (sub) => sub && scalar(sub.instruction).trim() && !hasUnresolvedGraphTemplate(sub.instruction)
    );
    if (alvo && passos.length && !decomposicaoPorMisconception.has(alvo)) {
      decomposicaoPorMisconception.set(alvo, passos);
    }
  }
  const subStepsPara = (alvo, existentes) => {
    const jaTem = asArray(existentes);
    if (jaTem.length) return jaTem;
    return decomposicaoPorMisconception.get(scalar(alvo).trim()) || [];
  };
  if (!graph || typeof graph !== "object")
    return { repairs, audit: auditBehaviorGraphSemantics(graph, steps) };
  if (!Array.isArray(graph.nodes)) graph.nodes = [];
  if (!Array.isArray(graph.edges)) graph.edges = [];

  const beforeAudit = auditBehaviorGraphSemantics(graph, steps);
  if (beforeAudit.ok) return { repairs, audit: beforeAudit };
  const beforeFingerprint = semanticFingerprint(graph);

  const stepContractSync = synchronizeBehaviorGraphStepContracts(graph, steps, { label });
  repairs.push(...stepContractSync.repairs);

  const finalSteps = asArray(steps);
  const stepNodes = graph.nodes.filter((node) => node.type === "step");
  const stepIds = new Set(stepNodes.map((node) => node.id));
  const lookup = buildStepLookup(finalSteps);
  const recordsByStep = new Map();

  for (let index = 0; index < stepNodes.length; index++) {
    const node = stepNodes[index];
    const matchedStep =
      finalSteps.length > 0
        ? finalSteps[index] || null
        : matchStep(node, index, finalSteps, lookup);
    const source = matchedStep
      ? sourceMisconceptions(matchedStep)
      : { present: false, records: [] };
    const records = dedupRecords(
      source.present ? source.records : existingOperationalMisconceptions(node)
    );
    // 2026-08-03: options cuja misconception foi dedupada por COLISÃO de
    // wrongAnswer normalizado são REAPONTADAS para o id sobrevivente — no step,
    // que é a fonte do contrato. O runtime casa por valor: duas options com a
    // mesma resposta normalizada são indistinguíveis para o grafo, então rotear
    // ambas para a remediação sobrevivente é o único contrato executável.
    // Sem isso, o id órfão na option disparava missingMisconceptionTriggers, o
    // prune neutralizava só a CÓPIA do nó, e o re-audit acusava
    // stepContractMismatches(visualConfig) — fatal que rejeitava o STI inteiro.
    if (source.present && matchedStep) {
      const sobreviventePorResposta = new Map(
        records.map((record) => [normalizeRuntimeAnswer(record.wrongAnswer), record])
      );
      const idsMantidos = new Set(records.map((record) => record.id));
      for (const record of source.records) {
        if (idsMantidos.has(record.id)) continue;
        const survivor = sobreviventePorResposta.get(normalizeRuntimeAnswer(record.wrongAnswer));
        if (!survivor || survivor.id === record.id) continue;
        const colecoes = [
          matchedStep.options,
          matchedStep.visualConfig?.options,
          matchedStep.componentProps?.options,
          matchedStep.config?.options,
        ];
        let retargeted = false;
        for (const option of colecoes.flatMap(asArray)) {
          if (!option || option.isCorrect === true) continue;
          if (scalar(option.misconceptionId).trim() !== record.id) continue;
          option.misconceptionId = survivor.id;
          if (survivor.misconceptionType) option.misconceptionType = survivor.misconceptionType;
          retargeted = true;
        }
        if (retargeted) {
          node.expectedInput = buildCanonicalExpectedInput(matchedStep);
          repairs.push(
            `${label}/${node.id}: option de ${record.id} reapontada para ${survivor.id} (mesma resposta errada normalizada)`
          );
        }
      }
    }
    recordsByStep.set(node.id, { records, matchedStep });
    node.misconceptions = records.map(publicRecord);
    if (matchedStep) node.knowledgeComponents = desiredKnowledgeComponents(matchedStep);
  }

  const usageCounts = new Map();
  for (const { records } of recordsByStep.values()) {
    for (const record of records) usageCounts.set(record.id, (usageCounts.get(record.id) || 0) + 1);
  }

  const oldScaffolds = graph.nodes.filter((node) => node.type === "scaffold");
  const oldScaffoldById = new Map(oldScaffolds.map((node) => [node.id, node]));
  const genericScaffoldIds = new Set(
    oldScaffolds
      .filter(
        (node) =>
          node.targetMisconception === "generic_struggle" ||
          (!node.targetMisconception && String(node.id || "").startsWith("scaffold_generic"))
      )
      .map((node) => node.id)
  );
  const incomingGenericEdges = graph.edges.filter(
    (edge) =>
      stepIds.has(edge.from) &&
      genericScaffoldIds.has(edge.to) &&
      /struggle/i.test(String(edge.condition || ""))
  );
  const liveGenericIds = new Set(incomingGenericEdges.map((edge) => edge.to));

  const desiredScaffolds = [];
  const desiredEdges = [];
  const desiredGenericScaffolds = [];
  const desiredGenericEdges = [];
  const usedGenericIds = new Set();
  // IDs de nós preservados já estão ocupados. Sem esta reserva, uma
  // misconception `generic_s1` poderia criar outro `scaffold_generic_s1` e o
  // runtime resolveria o primeiro nó por `find()`, possivelmente o errado.
  const desiredIds = new Set([
    ...graph.nodes.filter((node) => node.type !== "scaffold").map((node) => node.id),
    ...liveGenericIds,
  ]);
  const desiredRefsByStep = new Map();

  for (const stepNode of stepNodes) {
    const stepState = recordsByStep.get(stepNode.id);
    let records = stepState.records;
    const matchedStep = stepState.matchedStep;

    if (!synthesizeScaffolds) {
      records = records.filter((record) => {
        const condition = `misconception(${record.id})`;
        return graph.edges.some((edge) => {
          if (edge.from !== stepNode.id || edge.condition !== condition) return false;
          const target = oldScaffoldById.get(edge.to);
          if (!target || target.targetMisconception !== record.id) return false;
          return graph.edges.some(
            (back) =>
              back.from === target.id &&
              back.to === stepNode.id &&
              (back.condition === "correct" || back.condition === "default")
          );
        });
      });
      stepNode.misconceptions = records.map(publicRecord);
    }

    const refs = [];
    for (let index = 0; index < records.length; index++) {
      const record = records[index];
      const condition = `misconception(${record.id})`;
      const exactExistingEdge = graph.edges.find((edge) => {
        if (edge.from !== stepNode.id || edge.condition !== condition) return false;
        const target = oldScaffoldById.get(edge.to);
        if (!target || target.targetMisconception !== record.id || desiredIds.has(target.id)) {
          return false;
        }
        return graph.edges.some(
          (back) =>
            back.from === target.id &&
            back.to === stepNode.id &&
            (back.condition === "correct" || back.condition === "default")
        );
      });

      if (!synthesizeScaffolds && !exactExistingEdge) continue;
      let scaffoldId = exactExistingEdge?.to;
      if (!scaffoldId) {
        scaffoldId = canonicalScaffoldId(
          stepNode.id,
          record.id,
          (usageCounts.get(record.id) || 0) > 1
        );
      }
      let collision = 2;
      const baseId = scaffoldId;
      while (desiredIds.has(scaffoldId)) scaffoldId = `${baseId}__${collision++}`;
      desiredIds.add(scaffoldId);

      const existing =
        oldScaffoldById.get(scaffoldId) || oldScaffoldById.get(exactExistingEdge?.to);
      const knowledgeComponents = matchedStep?.kc
        ? [matchedStep.kc]
        : asArray(stepNode.knowledgeComponents).slice();
      let instruction = scalar(record.remediationInstruction).trim();
      if (!instruction || hasUnresolvedGraphTemplate(instruction)) {
        instruction = scalar(existing?.instruction).trim();
      }
      if (!instruction || hasUnresolvedGraphTemplate(instruction)) instruction = record.feedback;

      desiredScaffolds.push({
        ...(existing || {}),
        id: scaffoldId,
        type: "scaffold",
        description:
          record.description || scalar(existing?.description).trim() || `Remediação: ${record.id}`,
        targetMisconception: record.id,
        instruction,
        expectedInput: existing?.expectedInput ?? null,
        knowledgeComponents,
        subSteps: subStepsPara(record.id, existing?.subSteps),
      });
      desiredEdges.push(
        {
          from: stepNode.id,
          to: scaffoldId,
          condition,
          priority: 2 + index,
        },
        { from: scaffoldId, to: stepNode.id, condition: "correct", priority: 1 }
      );
      refs.push(scaffoldId);
    }

    // Resposta construída sem classificador concreto ainda precisa de uma
    // saída adaptativa executável. Este fallback NÃO é contado como diagnóstico
    // específico; ele só impede que o grafo se reduza a uma sequência linear.
    //
    // 2026-08-02 (painel sênior, P0.1): o scaffold genérico passa a existir em
    // TODO passo, não só nos que não têm diagnóstico específico.
    //
    // A condição antiga (`!records.some(isSpecificDiagnosticRecord)`) partia do
    // princípio de que um passo com diagnóstico específico não precisa de rota
    // genérica. Mas o aluno erra de MUITAS formas além das previstas, e para
    // esse erro não catalogado o runtime não tinha para onde ir: em 20 dos 24
    // nós auditados não havia aresta `struggles`, e o engine caía no
    // `scaffoldNodes[0]` — o scaffold de um erro que o aluno não cometeu.
    //
    // Agora que o engine recusa scaffold de outro erro (a trava do P0.1), deixar
    // o passo sem rota genérica significaria erro não catalogado SEM remediação
    // nenhuma. As duas metades andam juntas: a trava só é segura porque existe
    // sempre um destino honesto.
    if (ensureAdaptiveCoverage) {
      const existingGenericEdge = incomingGenericEdges.find(
        (edge) => edge.from === stepNode.id && !usedGenericIds.has(edge.to)
      );
      let scaffoldId = existingGenericEdge?.to;
      if (!scaffoldId) {
        scaffoldId = `scaffold_generic_${safeIdToken(stepNode.id)}`;
        const baseId = scaffoldId;
        let collision = 2;
        while (desiredIds.has(scaffoldId)) scaffoldId = `${baseId}__${collision++}`;
        desiredIds.add(scaffoldId);
      }
      usedGenericIds.add(scaffoldId);
      const existing = oldScaffoldById.get(scaffoldId);
      const existingInstruction = scalar(existing?.instruction).trim();
      const existingDescription = scalar(existing?.description).trim();
      desiredGenericScaffolds.push({
        ...(existing || {}),
        id: scaffoldId,
        type: "scaffold",
        description:
          existingDescription && !hasUnresolvedGraphTemplate(existingDescription)
            ? existingDescription
            : genericCopy.description,
        targetMisconception: "generic_struggle",
        instruction:
          existingInstruction && !hasUnresolvedGraphTemplate(existingInstruction)
            ? existingInstruction
            : genericCopy.instruction,
        expectedInput: existing?.expectedInput ?? null,
        knowledgeComponents: asArray(stepNode.knowledgeComponents).slice(),
        subSteps: subStepsPara("generic_struggle", existing?.subSteps),
        source: existing?.source || "deterministic_generic_safety_net",
      });
      desiredGenericEdges.push(
        {
          from: stepNode.id,
          to: scaffoldId,
          condition: "struggles",
          priority: 10,
        },
        { from: scaffoldId, to: stepNode.id, condition: "correct", priority: 1 }
      );
      refs.push(scaffoldId);
    }
    desiredRefsByStep.set(stepNode.id, refs);
  }

  const nonScaffoldNodes = graph.nodes.filter((node) => node.type !== "scaffold");
  const keptScaffoldIds = new Set([
    ...desiredGenericScaffolds.map((node) => node.id),
    ...desiredScaffolds.map((node) => node.id),
  ]);
  graph.nodes = [...nonScaffoldNodes, ...desiredGenericScaffolds, ...desiredScaffolds];

  graph.edges = graph.edges.filter((edge) => {
    if (
      parseMisconceptionCondition(edge.condition) ||
      /^misconception\s*\(/i.test(String(edge.condition || "").trim())
    )
      return false;
    const touchesOldScaffold = oldScaffoldById.has(edge.from) || oldScaffoldById.has(edge.to);
    if (!touchesOldScaffold) return true;
    return (
      (!oldScaffoldById.has(edge.from) || keptScaffoldIds.has(edge.from)) &&
      (!oldScaffoldById.has(edge.to) || keptScaffoldIds.has(edge.to))
    );
  });
  graph.edges.push(...desiredEdges, ...desiredGenericEdges);

  for (const stepNode of stepNodes) {
    const refs = desiredRefsByStep.get(stepNode.id) || [];
    stepNode.scaffoldNodes = refs;
    const trigger = stepNode.scaffoldTrigger;
    const hasExecutableTrigger =
      trigger &&
      ((Number(trigger.maxAttempts) || 0) > 0 ||
        (Number(trigger.timeThresholdSeconds) || 0) > 0 ||
        trigger.prerequisiteMasteryBelow != null);
    if (refs.length > 0 && !hasExecutableTrigger) {
      stepNode.scaffoldTrigger = {
        maxAttempts: Number(opts.defaultMaxAttempts) || 3,
        timeThresholdSeconds: Number(opts.defaultTimeThresholdSeconds) || 90,
        prerequisiteMasteryBelow: null,
      };
    }
  }
  graph.edges = dedupEdges(graph.edges);

  const afterFingerprint = semanticFingerprint(graph);
  if (beforeFingerprint !== afterFingerprint) {
    repairs.push(`${label}: camada adaptativa recompilada (opção→misconception→scaffold→retorno)`);
  }
  return {
    repairs,
    audit: auditBehaviorGraphSemantics(graph, steps),
    before: beforeAudit,
  };
}
