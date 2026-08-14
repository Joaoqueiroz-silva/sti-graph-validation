/**
 * step-error-catalog.js — catálogo diagnóstico por passo, construído por geração.
 *
 * 2026-07-18 (diagnóstico autossuficiente): a geração de frações pós-PR #27 mediu
 * 7% de cobertura adaptativa específica (mínimo 50%) porque o Agent 3b produzia
 * 2-3 erros POR PROBLEMA (não por passo) e os pads determinísticos nasciam
 * genéricos. Este módulo é a fonte única do catálogo de misconceptions da
 * geração: unifica o formato legado (solutions[].attempts[].solutionTrace[].error,
 * antes extraído por um loop manual no graphforgeNode do pipeline-v8) com o novo
 * bloco solutions[].stepDiagnostics[] (buggy rules por passo, modelo CTAT).
 *
 * Módulo PURO: sem LLM, sem IO. A régua da PR #27 é INTOCÁVEL — distrator
 * sintético/genérico NUNCA conta como diagnóstico específico; os prefixos
 * genéricos reservados aqui espelham GENERIC_MISC_PREFIXES do quality-gate.
 *
 * Spec: docs/DIAGNOSTICO-AUTOSSUFICIENTE-2026-07-18.md §1.
 */

// 2026-07-18: mesma noção de "template não resolvido" da PR #27 ({A}, {B/C},
// {{x}}, ${x}) — importada, não replicada, para que a régua nunca divirja.
import { hasUnresolvedGraphTemplate } from "../behavior-graph-semantics.js";
// 2026-07-18: normalizeAnswerKey é a comparação "como o aluno vê" (fonte única
// desde a auditoria 2026-06-11) — a MESMA usada pelo agent9 para dedup/EA.
import { normalizeAnswerKey } from "../../lib/text-normalize.js";

// Prefixos reservados que a PR #27 conta como genéricos — NUNCA usar em id específico.
export const GENERIC_MISC_ID_RE = /^misc_(generic|unclassified|numeric_near|text_confusion)(_|$)/;
export const MISC_ID_GRAMMAR_RE = /^[A-Za-z0-9_.:-]+$/;

const str = (value) => String(value ?? "").trim();

/** id específico bem-formado: gramática ok E fora dos prefixos genéricos reservados. */
export function isSpecificMisconceptionId(id) {
  const candidate = str(id);
  return (
    candidate.length > 0 &&
    MISC_ID_GRAMMAR_RE.test(candidate) &&
    !GENERIC_MISC_ID_RE.test(candidate)
  );
}

/**
 * Coage step/stepIndex para número finito ou null. O Agent 3b devolve `step`
 * como número 1-based, mas LLMs às vezes mandam string ("1") ou omitem.
 */
function toFiniteOrNull(value) {
  if (value == null || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

/**
 * Normaliza um erro bruto do stepDiagnostics para ErrorSpec, ou null se inválido.
 *
 * Descarta: id malformado/genérico, sem description ou sem buggyRule — a
 * buggyRule é o coração do desenho (receita MECÂNICA que o Agent 6 computa com
 * números concretos); sem ela o erro não é materializável e viraria mais um
 * distrator sintético. NÃO exige wrongAnswer concreto: na fase de design os
 * problemas ainda são genéricos ({A}+{B}) por contrato.
 */
function normalizeErrorSpec(raw) {
  if (!raw || typeof raw !== "object") return null;
  const misconceptionId = str(raw.misconceptionId);
  if (!isSpecificMisconceptionId(misconceptionId)) return null;
  const description = str(raw.description);
  const buggyRule = str(raw.buggyRule);
  if (!description || !buggyRule) return null;
  return {
    misconceptionId,
    type: str(raw.type) || "conceptual_error",
    // 2026-07-18: aceita os dois nomes — o prompt do 3b fala "wrongAnswer"
    // (compat com o formato legado), o módulo padroniza em wrongAnswerPattern.
    wrongAnswerPattern: str(raw.wrongAnswerPattern) || str(raw.wrongAnswer),
    buggyRule,
    description,
    mistakeLocation: str(raw.mistakeLocation),
    diagnosticQuestion: str(raw.diagnosticQuestion),
    feedback: str(raw.feedback),
    howToFix: str(raw.howToFix),
    severity: str(raw.severity) || "moderate",
  };
}

/**
 * Normaliza/valida o bloco stepDiagnostics do Agent 3b
 * (parsed.solutions[].stepDiagnostics). Retorna somente blocos com pelo menos
 * um erro válido: [{ problemId, step, kcUsed, errors: [ErrorSpec] }].
 */
export function normalizeStepDiagnostics(atRiskTrace) {
  const solutions = Array.isArray(atRiskTrace?.solutions) ? atRiskTrace.solutions : [];
  const blocks = [];
  for (const sol of solutions) {
    const stepDiagnostics = Array.isArray(sol?.stepDiagnostics) ? sol.stepDiagnostics : [];
    for (const diag of stepDiagnostics) {
      const rawErrors = Array.isArray(diag?.errors) ? diag.errors : [];
      const errors = rawErrors.map(normalizeErrorSpec).filter(Boolean);
      if (errors.length === 0) continue; // bloco sem erro aterrável não agrega nada
      blocks.push({
        problemId: diag?.problemId ?? sol?.problemId ?? null,
        step: toFiniteOrNull(diag?.step),
        kcUsed: str(diag?.kcUsed),
        errors,
      });
    }
  }
  return blocks;
}

/**
 * Constrói o catálogo unificado da geração: erros das attempts (formato legado,
 * mesmos campos do loop que existia no graphforgeNode de pipeline-v8.js) + erros
 * de stepDiagnostics. Dedup por misconceptionId — a entrada de stepDiagnostics
 * VENCE a legada por ser mais rica (tem buggyRule/diagnosticQuestion por passo).
 */
export function buildMisconceptionCatalog(atRiskTrace) {
  const byId = new Map();
  // ids que já chegaram via stepDiagnostics — nunca são rebaixados pra legado.
  const fromStepDiagnostics = new Set();

  // --- Formato legado: solutions[].attempts[].solutionTrace[].error ---------
  const solutions = Array.isArray(atRiskTrace?.solutions) ? atRiskTrace.solutions : [];
  for (const sol of solutions) {
    for (const attempt of Array.isArray(sol?.attempts) ? sol.attempts : []) {
      for (const t of Array.isArray(attempt?.solutionTrace) ? attempt.solutionTrace : []) {
        if (t?.isCorrect !== false || !t?.error?.misconceptionId) continue;
        const id = str(t.error.misconceptionId);
        if (!id || byId.has(id)) continue; // primeiro visto vence (paridade com o loop legado)
        byId.set(id, {
          id,
          kcId: str(t.kcUsed),
          stepIndex: toFiniteOrNull(t.step),
          type: str(t.error.type) || "conceptual_error",
          description: str(t.error.description),
          wrongAnswer: str(t.error.wrongAnswer),
          buggyRule: str(t.error.buggyRule), // legado normalmente não tem → ""
          diagnosticQuestion: str(t.error.diagnosticQuestion),
          // 2026-07-18: howToFix antes de feedback = paridade com o loop do
          // graphforgeNode que este módulo substitui (spec §3) — não mudar
          // silenciosamente o conteúdo que o Agent 6 já recebia.
          feedback: str(t.error.howToFix) || str(t.error.feedback),
          severity: str(t.error.severity) || "moderate",
          frequency: "common",
        });
      }
    }
  }

  // --- Formato novo: solutions[].stepDiagnostics[].errors[] -----------------
  for (const block of normalizeStepDiagnostics(atRiskTrace)) {
    for (const err of block.errors) {
      const id = err.misconceptionId;
      // Entre dois stepDiagnostics com o mesmo id, o primeiro vence; sobre o
      // legado, stepDiagnostics sempre vence (mais rico).
      if (fromStepDiagnostics.has(id)) continue;
      fromStepDiagnostics.add(id);
      byId.set(id, {
        id,
        kcId: block.kcUsed,
        stepIndex: block.step,
        type: err.type,
        description: err.description,
        wrongAnswer: err.wrongAnswerPattern,
        buggyRule: err.buggyRule,
        diagnosticQuestion: err.diagnosticQuestion,
        // Aqui feedback vem antes de howToFix: no formato novo o feedback já é
        // o texto encorajador voltado ao aluno; howToFix é só o plano B.
        feedback: err.feedback || err.howToFix,
        severity: err.severity,
        frequency: "common",
      });
    }
  }

  return [...byId.values()];
}

/**
 * Seleciona do catálogo os erros aplicáveis a um step final: match por kc exato,
 * depois por stepIndex, depois catálogo inteiro como fallback. NUNCA retorna
 * entradas com id genérico — mesmo no fallback, senão o pad "ancorado no
 * catálogo" recontaminaria a métrica da PR #27.
 *
 * 2026-07-18 (anti-inflação): opts.allowPoolFallback=false DESLIGA o tier
 * catálogo-inteiro. Caminhos que atribuem id específico a um value existente
 * exigem evidência local (kc/stepIndex) — o fallback global devolvia erros de
 * OUTROS passos/problemas e o id acabava colado em valor que não corresponde
 * ao erro, inflando a cobertura específica da PR #27.
 */
export function matchCatalogForStep(catalog, { kc, stepIndex, allowPoolFallback = true } = {}) {
  const pool = (Array.isArray(catalog) ? catalog : []).filter((entry) =>
    isSpecificMisconceptionId(entry?.id)
  );
  const kcKey = str(kc);
  if (kcKey) {
    const byKc = pool.filter((entry) => str(entry.kcId) === kcKey);
    if (byKc.length > 0) return byKc;
  }
  const index = toFiniteOrNull(stepIndex);
  if (index != null) {
    const byStep = pool.filter((entry) => toFiniteOrNull(entry.stepIndex) === index);
    if (byStep.length > 0) return byStep;
  }
  return allowPoolFallback ? pool : [];
}

// ---------------------------------------------------------------------------
// 2026-07-19 (Trilha B — fronteira de ordenação): o E2E do Sistema Solar
// mostrou steps drag_to_order/word_matcher/sentence_builder sem diagnóstico
// específico porque o modelo wrongAnswer-string não sabia o que é uma
// "resposta errada plausível" para uma SEQUÊNCIA. Serializações canônicas que
// os componentes submetem ao runtime (matcher exact do graphEngine compara a
// string submetida — outra serialização é rota morta):
//  - drag_to_order: values dos items unidos por vírgula ("a,b,c" — DragToOrder.jsx
//    join(",")); drag_order legado: labels unidos por ", " (VisualInputs.jsx);
//  - sentence_builder: palavras unidas por espaço (joiner default " ");
//  - matching_pairs: "l0<>r1;l1<>r0"; timeline_constructor/diagram_labeler:
//    "slotId=Evento;slotId=Evento" (compiler expectedAssignmentString).
// ---------------------------------------------------------------------------

/**
 * renderAs cuja resposta é sequência/pareamento serializado. O aterramento
 * ciente de sequência é GATED por renderAs de propósito: sem esse contexto,
 * um EA escalar como "3,5" (decimal pt-BR) seria reinterpretado como sequência
 * de 2 itens e derrubaria distratores escalares legítimos ("3,6").
 */
export const SEQUENCE_AWARE_RENDER_AS = new Set([
  "drag_to_order",
  "drag_order",
  "sentence_builder",
  "image_sequence",
  "matching_pairs",
  "timeline_constructor",
  "diagram_labeler",
]);

const PAIR_CONNECTORS = ["<>", "="];

function splitByDelimiter(raw, delimiter) {
  const s = str(raw);
  if (!s) return [];
  const parts = delimiter === " " ? s.split(/\s+/) : s.split(delimiter);
  return parts.map((part) => part.trim()).filter(Boolean);
}

/**
 * Detecta se um expectedAnswer é uma sequência (2+ itens delimitados) e com
 * qual delimitador. Prioridade ";" > "," > espaço: pareamentos usam ";" entre
 * pares (e os eventos podem conter vírgula), listas usam vírgula (e os itens
 * podem conter espaço), frases usam espaço.
 */
function parseSequenceAnswer(raw) {
  const s = str(raw);
  if (!s) return null;
  for (const delimiter of [";", ","]) {
    if (!s.includes(delimiter)) continue;
    const items = splitByDelimiter(s, delimiter);
    if (items.length >= 2) return { delimiter, items };
  }
  const words = splitByDelimiter(s, " ");
  if (words.length >= 2) return { delimiter: " ", items: words };
  return null;
}

/**
 * 2026-07-19 (EA canônico de sequência): serialização CANÔNICA de uma resposta
 * de sequência — split pelo delimitador detectado, trim de cada item, join SEM
 * espaço em volta do delimitador (frases: espaço único). É EXATAMENTE o que os
 * componentes submetem em runtime (DragToOrder/ImageSequence: join(",");
 * MatchingPairs/Timeline/DiagramLabeler: join(";"); SentenceBuilder: join(" ")).
 * EA autorado "a, b, c" cria step IRRESPONDÍVEL: o aluno submete "a,b,c" e o
 * matcher exact do graphEngine preserva a diferença de espaço.
 * Retorna null quando raw NÃO é sequência (0-1 item) — caller mantém o valor.
 * O GATING por renderAs é responsabilidade do caller (ou use
 * canonicalizeSequenceStepAnswers): sem contexto de componente, "3,5" decimal
 * pt-BR seria reinterpretado como sequência.
 * Fronteira conhecida: espaços INTERNOS de item de pareamento ("a <> b") não
 * são tocados — mexer neles quebraria drag_to_order cujos values contêm "=".
 */
export function canonicalizeSequenceAnswer(raw) {
  const parsed = parseSequenceAnswer(raw);
  if (!parsed) return null;
  const joiner = parsed.delimiter === " " ? " " : parsed.delimiter;
  return parsed.items.join(joiner);
}

/**
 * 2026-07-19 (EA canônico de sequência): canonicaliza IN-PLACE as respostas de
 * um step de sequência/pareamento: expectedAnswer, acceptableVariations e
 * behaviorMisconceptions[].wrongAnswer na MESMA passada (bm não-canônica é a
 * mesma rota morta — matcher exact do runtime preserva espaços).
 * GATED por SEQUENCE_AWARE_RENDER_AS: fora dele NADA é tocado (trava o caso
 * "3,5" decimal pt-BR em step numérico). Fonte única — sanitizer e
 * structural-gate chamam ESTA função, nunca reimplementam o split/join.
 * Retorna a lista de mudanças (strings) para o trace do caller.
 */
export function canonicalizeSequenceStepAnswers(step) {
  const changes = [];
  if (!step || typeof step !== "object") return changes;
  if (!SEQUENCE_AWARE_RENDER_AS.has(str(step.renderAs))) return changes;

  const ea = str(step.expectedAnswer);
  const canonicalEa = canonicalizeSequenceAnswer(ea);
  if (canonicalEa && canonicalEa !== ea) {
    step.expectedAnswer = canonicalEa;
    changes.push(`seq_ea_canonicalized:"${ea}"->"${canonicalEa}"`);
  }

  if (Array.isArray(step.acceptableVariations)) {
    step.acceptableVariations = step.acceptableVariations.map((variation) => {
      if (typeof variation !== "string") return variation;
      const canonical = canonicalizeSequenceAnswer(variation);
      if (canonical && canonical !== variation) {
        changes.push(`seq_variation_canonicalized:"${variation}"->"${canonical}"`);
        return canonical;
      }
      return variation;
    });
  }

  if (Array.isArray(step.behaviorMisconceptions)) {
    for (const misc of step.behaviorMisconceptions) {
      if (!misc || typeof misc !== "object") continue;
      const wrong = str(misc.wrongAnswer);
      const canonical = canonicalizeSequenceAnswer(wrong);
      if (canonical && canonical !== wrong) {
        misc.wrongAnswer = canonical;
        changes.push(`seq_bm_canonicalized:${str(misc.misconceptionId) || "(sem id)"}`);
      }
    }
  }

  return changes;
}

/** Itens "l<>r"/"slot=evento" → pares [esq, dir]; null se algum item não parseia. */
function parsePairItems(items) {
  for (const connector of PAIR_CONNECTORS) {
    const pairs = items.map((item) => {
      const at = item.indexOf(connector);
      if (at <= 0 || at + connector.length >= item.length) return null;
      return [item.slice(0, at).trim(), item.slice(at + connector.length).trim()];
    });
    if (pairs.every(Boolean)) return pairs;
  }
  return null;
}

// 2026-07-19 (verificação da Trilha B): a chave de item ESPELHA o matcher do
// runtime (normalizeExactText do graphEngine REMOVE acentos), porque aterrado
// significa ROTEÁVEL: "Vênus" e "Venus" são o mesmo item para quem roteia a
// resposta do aluno. normalizeAnswerKey sozinha preservava acentos e criava
// assimetria (permutação legítima acentuada não aterrava; ordem diferente só
// por acento contava como distrator — ambos errados frente ao runtime).
// Separadores de chave sao U+0000/U+0001: itens podem conter espaco ("Idade Media"),
// então join(" ") colidiria ["a b","c"] com ["a","b c"]; controle nunca aparece
// em resposta de aluno.
const sequenceItemKey = (item) =>
  normalizeAnswerKey(item)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
const multisetKey = (items) =>
  items
    .map((item) => sequenceItemKey(item))
    .sort()
    .join("\u0000");
const orderKey = (items) => items.map((item) => sequenceItemKey(item)).join("\u0000");
const pairSetKey = (pairs) =>
  pairs
    .map(([left, right]) => `${sequenceItemKey(left)}\u0001${sequenceItemKey(right)}`)
    .sort()
    .join("\u0000");

/**
 * 2026-07-19 (Trilha B): decide se `value` é um distrator de sequência
 * ATERRADO contra `expectedAnswer`:
 *  - sequência: PERMUTAÇÃO EXATA — mesmo multiconjunto de itens, ordem
 *    diferente, MESMA serialização (mesmo delimitador do EA; item novo,
 *    item faltando ou delimitador trocado ⇒ false);
 *  - pareamento ("l<>r"/"slot=evento" unidos por ";"): mesmos elementos dos
 *    dois lados, ASSOCIAÇÃO diferente (a ordem de listagem dos pares é
 *    irrelevante — listar os MESMOS pares em outra ordem é a resposta certa
 *    e ⇒ false).
 * Retorna false quando expectedAnswer não é sequência (2+ itens delimitados).
 * Determinístico, sem LLM.
 */
export function isSequencePermutationDistractor({ value, expectedAnswer } = {}) {
  const expected = parseSequenceAnswer(expectedAnswer);
  if (!expected) return false;
  // 2026-07-19 (verificação da Trilha B): a serialização precisa ser a
  // CANÔNICA que o componente submete (join sem espaços em volta do
  // delimitador) — "terra, venus, marte" passa no split/trim mas é ROTA MORTA
  // em runtime (o aluno submete "terra,venus,marte" e o matcher exact do
  // graphEngine preserva a diferença de espaço). Aterrado = roteável; vale
  // para o wrongAnswer E para o próprio EA (EA não-canônico = step quebrado,
  // nada aterra nele).
  const joiner = expected.delimiter === " " ? " " : expected.delimiter;
  const canonical = (rawSeq, items) => str(rawSeq).trim() === items.join(joiner);
  if (!canonical(expectedAnswer, expected.items)) return false;
  const wrongItems = splitByDelimiter(value, expected.delimiter);
  if (wrongItems.length !== expected.items.length) return false;
  if (!canonical(value, wrongItems)) return false;

  const expectedPairs = parsePairItems(expected.items);
  if (expectedPairs) {
    const wrongPairs = parsePairItems(wrongItems);
    if (!wrongPairs) return false;
    if (multisetKey(expectedPairs.map((p) => p[0])) !== multisetKey(wrongPairs.map((p) => p[0])))
      return false;
    if (multisetKey(expectedPairs.map((p) => p[1])) !== multisetKey(wrongPairs.map((p) => p[1])))
      return false;
    return pairSetKey(expectedPairs) !== pairSetKey(wrongPairs);
  }

  if (multisetKey(wrongItems) !== multisetKey(expected.items)) return false;
  return orderKey(wrongItems) !== orderKey(expected.items);
}

/**
 * Valida um distrator CONCRETO contra a régua da PR #27:
 *  - id específico (gramática ok, fora dos prefixos genéricos reservados);
 *  - value concreto: não-vazio e sem template não resolvido ({A}, {B/C},
 *    {{x}}, ${x} — mesma detecção do GraphForge/PR #27);
 *  - value !== expectedAnswer sob normalizeAnswerKey (um "distrator" igual à
 *    resposta certa como o aluno a vê ensinaria o erro como acerto).
 *
 * 2026-07-19 (Trilha B): `renderAs` opcional. Quando o step é de sequência/
 * pareamento (SEQUENCE_AWARE_RENDER_AS) e o EA é de fato uma sequência, o
 * aterramento EXIGE adicionalmente permutação exata dos mesmos itens
 * (isSequencePermutationDistractor). Isso só ENDURECE: o caso escalar
 * (renderAs ausente/escalar, ou EA não-sequência como o "ok" dos labs)
 * mantém exatamente as três checagens originais.
 */
export function isGroundedDistractor({ misconceptionId, value, expectedAnswer, renderAs } = {}) {
  if (!isSpecificMisconceptionId(misconceptionId)) return false;
  const concrete = str(value);
  if (!concrete || hasUnresolvedGraphTemplate(concrete)) return false;
  if (normalizeAnswerKey(concrete) === normalizeAnswerKey(expectedAnswer)) return false;
  if (SEQUENCE_AWARE_RENDER_AS.has(str(renderAs)) && parseSequenceAnswer(expectedAnswer)) {
    return isSequencePermutationDistractor({ value: concrete, expectedAnswer });
  }
  return true;
}
