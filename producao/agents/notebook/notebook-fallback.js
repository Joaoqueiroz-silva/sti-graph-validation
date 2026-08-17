/**
 * notebook-fallback.js: fallback DETERMINISTICO do caderno CTAT (worksheet).
 *
 * 2026-08-16 (caderno F2): o planner/worker (LLM) e quem desenha o caderno
 * (problem.notebook + step.cell), mas compliance de prompt e estocastica
 * (gotcha 4 do CLAUDE.md). Este modulo completa o que faltou de forma pura e
 * idempotente, para que TODO passo do modo worksheet chegue ao aluno com uma
 * celula bem formada (id canonico do no, label, papel, apresentacao) e para
 * que toda celula C aponte para um instrumento renderizavel. Nada aqui chama
 * LLM, le AsyncLocalStorage ou grava log: o chamador decide o modo e passa
 * `interfaceMode`; fora de "worksheet" a funcao devolve o problema intocado
 * (simple/rich continuam byte-identicos).
 *
 * Regras (na ordem em que rodam em applyNotebookFallback):
 *   (a) cell.id = id CANONICO do no (canonicalGraphStepIds), nunca step.id cru;
 *       step.graphNodeId e gravado quando ausente para a bijecao ficar estavel;
 *   (b) label = primeiras <= 8 palavras da instrucao sem pontuacao final;
 *   (c) role = papel autorado valido (A|B|C) ou notebookRoleForRenderAs;
 *   (d) presentation por renderAs FINAL, so quando ausente;
 *   (e) dependsOn DECORATIVO a partir de step.operation ("59 - 27 = 32");
 *   (f) givens extraidos dos numeros do enunciado quando o planner nao mandou;
 *   (g) instrumento: valida o do LLM (lista fechada NOTEBOOK_C_V1, targets,
 *       referencias das celulas C, forma da resposta) ou degrada C -> B; sem
 *       instrumento, tenta criar um por regra (fraction_bar, number_line,
 *       highlight_in_text) a partir das celulas SEM papel autorado ou C;
 *   (k) 2026-08-17 (stream L; roda entre (g) e (h)): celula A cuja instrucao
 *       manda manipular ("pinte", "clique", "arraste", "manipule", "marque na
 *       reta") e cujo gabarito o instrumento do problema sabe emitir vira
 *       celula C com um alvo NOVO do instrumento ("<kind>_<cellId>"); senao
 *       fica A e o quality-gate/auditor avisam. Visto em producao: celula A
 *       keypad com "Manipule as barras para encontrar o MMC" (o aluno le uma
 *       ordem que a caixa de digitacao nao cumpre);
 *   (h) toda celula C recebe renderAs/componentProps do instrumento + alvo,
 *       validos pelo schema Zod da spec do componente;
 *   (i) 2026-08-17 (stream L): layout da folha (notebook.layout.rows, linhas
 *       de conta com placeholders {cellId}) validado contra os steps FINAIS:
 *       linha com id inexistente ou de celula C some; sem linha, some o
 *       layout; sem layout do LLM e problema aritmetico (>= 2 celulas A com
 *       operation "lhs = rhs" e gabarito numerico/fracao), DERIVA
 *       "<lhs> = {cellId}" por celula (max 4).
 *
 * 2026-08-17 (stream M, "o caderno prefere digitar"; STI real de subtracao de
 * fracoes gerado em producao saiu com as 15 celulas em papel B: dynamic_spec
 * para "2/6", fraction_bar solta com denominador errado, keypad com options;
 * juiz LLM 62/100). Regras novas, na ordem em que rodam:
 *   (m4) MMC/denominador comum: celula cuja instrucao pede MMC/denominador
 *        comum de dois inteiros citados (ou das duas fracoes do problema) vira
 *        A numerica com EA = lcm, SO quando o EA atual e "D/D", vazio ou
 *        incoerente (visto: "MMC de 2 e 6" com gabarito "24/24"); guard
 *        aritmetico: EA numerico diferente do lcm so e sobrescrito quando a
 *        instrucao cita explicitamente os dois numeros. Roda ANTES de (g)
 *        para a celula nao ser recrutada como alvo "24/24" da barra;
 *   (f2) givens do planner/worker validados contra o enunciado: fica so o
 *        given cujo valor literal (fracao, numero ou palavras) esta no
 *        statement; os demais vao para notebook.discardedGivens (medicao do
 *        gate); sem sobrevivente, extrai do enunciado como em (f). Visto:
 *        "comeram 1/2 do bolo" com givens "7/8 do bolo" e "24 alunos";
 *   (g') celula B cujo renderAs ja e um instrumento (fraction_bar,
 *        number_line, highlight_in_text), cujo gabarito o instrumento emite
 *        E cuja instrucao manda manipular ("Pinte/Represente na barra") conta
 *        como candidata em (g): duas fraction_bar B "1/15" viram um
 *        instrumento fraction_bar D=15 com duas celulas C em vez de duas
 *        barras soltas; a barra cujo enunciado pede o valor vira caixinha;
 *   (m6) instrumento fraction_bar com denominator diferente do D comum a
 *        TODAS as celulas C "k/D": corrige o denominator (repair); D > 24
 *        (guard da spec) degrada as C para A fraction_input;
 *   (m1) "o caderno prefere digitar": celula B (ou sem papel) com gabarito
 *        ESCALAR (numeric-pure, fraction, boolean, text-short) e renderAs
 *        fora de ASSEMBLED_ANSWER_RENDER_AS, ou B ja em superficie simples
 *        (multiple_choice, text, keypad...), vira A com a superficie da forma
 *        (fraction_input, numeric_keypad, true_false, multiple_choice se ha
 *        >= 2 options com uma correta, senao text); celula A com superficie
 *        fora do conjunto A (cena da recuperacao rica, barra) tambem vai para
 *        a superficie da forma; a cena (spec/dynamic_spec) some; distratores
 *        das options migram para behaviorMisconceptions quando a superficie
 *        final nao usa options. EXCECAO: fraction_bar
 *        "k/D" com instrumento fraction_bar de denominator D vira C com alvo
 *        novo (mesmo helper de (k)). dynamic_spec NUNCA fica numa celula:
 *        forma escalar vira A; sequencia (>= 3 itens) vira B drag_to_order;
 *        o resto vira A text/multiple_choice. Gabarito conceitual (texto com
 *        >= 3 palavras) sem options: com wrongAnswers textuais nos
 *        behaviorMisconceptions sintetiza multiple_choice; senao fica A text
 *        e o gate avisa;
 *   (m3) options em superficie livre de celula A (numeric_keypad,
 *        fraction_input, text): migram para behaviorMisconceptions e options
 *        esvazia (o juiz apontou "options em step de input livre").
 * "renderAs rico que o roteador escolheria" para dynamic_spec nao escalar e
 * aproximado pela forma (drag_to_order para sequencia): o roteador e
 * assincrono e vive fora deste modulo puro; a fonte de dynamic_spec no caderno
 * (ui-designer, ramo worksheet) deixou de gerar cena para celula.
 *
 * Por que so celulas sem papel autorado (ou C, ou B ja com superficie de
 * instrumento) entram na criacao de instrumento: o papel escrito pelo planner
 * e autoritativo. Uma celula A ("copie o dado") com gabarito inteiro NAO pode
 * virar marcador de reta numerica so porque outra celula tambem tem gabarito
 * inteiro. O fallback preenche lacunas, nao redesenha o caderno; a excecao
 * (stream M) e a celula B cujo gabarito e escalar: no caderno ela e uma
 * caixinha de digitacao, nao uma cena.
 */

import { canonicalGraphStepIds } from "../behavior-graph-semantics.js";
import {
  ASSEMBLED_ANSWER_RENDER_AS,
  NOTEBOOK_C_V1,
  notebookRoleForRenderAs,
} from "../../shared/component-sets.js";
import { analyzeAnswerShape } from "../../lib/answer-shape.js";
import numberLineSpec from "../component-registry/components/number-line.js";
import fractionBarSpec from "../component-registry/components/fraction-bar.js";
import highlightInTextSpec from "../component-registry/components/highlight-in-text.js";
import tableSpec from "../component-registry/components/table.js";
import cellDiagramSpec from "../component-registry/components/cell-diagram.js";
// 2026-08-17 (stream L): mesma normalizacao de token do compilador
// (compileInstrument) e do HighlightInText.jsx, para a conversao A -> C so
// aceitar uma palavra que o instrumento de fato consegue destacar.
import { normalizeHighlightToken } from "../../evaluation/notebook-emitter-model.js";

/**
 * Specs dos instrumentos da lista fechada, importadas ESTATICAMENTE porque o
 * registro (component-registry/index.js) e assincrono e este modulo precisa
 * ser sincrono e puro (roda dentro do worker do agente 6 e do gate final).
 * O teste caderno-f2-notebook-fallback trava a paridade com NOTEBOOK_C_V1.
 */
export const NOTEBOOK_C_SPECS = Object.freeze({
  number_line: numberLineSpec,
  fraction_bar: fractionBarSpec,
  highlight_in_text: highlightInTextSpec,
  table: tableSpec,
  cell_diagram: cellDiagramSpec,
});

/**
 * Superficies permitidas numa celula A (dado / resposta curta). Tudo fora
 * disto numa celula A e coagido pelo gate final com o mesmo mecanismo do
 * clamp do modo simples (_fallbackRenderAs). Vive aqui e nao em
 * component-sets porque e uma regra do CADERNO, nao uma capacidade do
 * componente.
 */
export const WORKSHEET_A_RENDER_AS = new Set([
  "multiple_choice",
  "text",
  "numeric_keypad",
  "fraction_input",
  "true_false",
  "word_matcher",
]);

export const CELL_ROLES = Object.freeze(["A", "B", "C"]);

const PRESENTATION_BY_RENDER_AS = Object.freeze({
  multiple_choice: "dropdown",
  word_matcher: "dropdown",
  true_false: "radio",
  numeric_keypad: "keypad",
  text: "input",
  fraction_input: "input",
});

/** Apresentacao da celula por renderAs final ('inline' para tudo que e rico). */
export function presentationForRenderAs(renderAs) {
  return PRESENTATION_BY_RENDER_AS[String(renderAs || "")] || "inline";
}

/** Papel autorado valido ('A'|'B'|'C') ou null. */
export function normalizeCellRole(role) {
  const up = String(role ?? "")
    .trim()
    .toUpperCase();
  return CELL_ROLES.includes(up) ? up : null;
}

const scalar = (v) => (v == null ? "" : String(v));

function stripAccentsLower(value) {
  return scalar(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** (b) label: primeiras <= 8 palavras da instrucao, sem pontuacao final. */
export function labelFromInstruction(instruction, maxWords = 8) {
  const words = scalar(instruction).trim().split(/\s+/).filter(Boolean).slice(0, maxWords);
  return words
    .join(" ")
    .replace(/[\s.:;,!?…]+$/u, "")
    .trim();
}

function parseNumberToken(token) {
  const n = Number(scalar(token).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Numeros de uma expressao ("59 - 27" -> [59, 27]); fracao "3/4" e um token so. */
function numbersIn(text) {
  const out = [];
  const re = /-?\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?/g;
  for (const m of scalar(text).matchAll(re)) out.push(m[0].replace(/\s+/g, ""));
  return out;
}

// ============================================================
// 2026-08-17 (stream L): layout da folha (expressao com caixinhas embutidas)
// ============================================================

/** Limites do layout: <= 4 linhas, cada uma <= 160 caracteres. */
export const NOTEBOOK_LAYOUT_MAX_ROWS = 4;
export const NOTEBOOK_LAYOUT_MAX_ROW_CHARS = 160;

/** Placeholder de celula numa linha do layout: "{step_1}" (espacos internos tolerados). */
const LAYOUT_PLACEHOLDER_RE = /\{\s*([^{}\s]+)\s*\}/g;

/** Ids de celula referenciados numa linha do layout ("{step_1}/{step_2}" -> [step_1, step_2]). */
export function layoutPlaceholderIds(row) {
  const ids = [];
  for (const m of scalar(row).matchAll(LAYOUT_PLACEHOLDER_RE)) ids.push(m[1]);
  return ids;
}

/**
 * Normaliza um layout vindo do LLM (planner ou worker) para { rows: string[] }
 * ou undefined (nada aproveitavel: NAO criar a chave). Tolerante na entrada:
 * { rows: [...] }, { template: "linha\nlinha" }, array de strings ou string.
 * Regras (o front renderiza cada linha como expressao com caixinhas):
 *   - linha e string nao vazia com <= 160 caracteres (linha maior e DESCARTADA,
 *     nao truncada: cortar podia partir um placeholder ao meio);
 *   - linha precisa de >= 1 placeholder {id}: linha so de texto nao e "linha
 *     de conta/preenchimento" (decisao da stream L);
 *   - com `validIds`, linha com placeholder de id fora do conjunto e
 *     DESCARTADA inteira (o id nao existe no caderno: caixinha sem celula);
 *   - com `excludeIds` (celulas C), linha que aponta uma delas e descartada
 *     (celula de instrumento nao entra no template);
 *   - <= 4 linhas (as primeiras). `source` ("fallback") e preservado.
 * Pura e idempotente: normalizar o resultado devolve o mesmo valor.
 */
/** Equacao/expressao com variavel ou operador ("14x + 30 = 128", "2 · 45 + 18"); fracao "a/b" nao conta. */
export function isEquationLikeAnswer(value) {
  const ea = scalar(value).trim();
  if (!ea || /^-?\d+\s*\/\s*\d+$/.test(ea)) return false;
  return /=|[a-z]\s*[+\-*/·×÷]|[+\-*/·×÷]\s*[a-z]|\d\s*[a-z]\b|\d\s*[+\-*·×÷]\s*\d/i.test(ea);
}

export function normalizeNotebookLayout(raw, { validIds = null, excludeIds = null } = {}) {
  if (raw === undefined || raw === null) return undefined;
  let rowsRaw;
  let source = null;
  if (typeof raw === "string") rowsRaw = raw.split(/\r?\n/);
  else if (Array.isArray(raw)) rowsRaw = raw;
  else if (typeof raw === "object") {
    if (Array.isArray(raw.rows)) rowsRaw = raw.rows;
    else if (typeof raw.template === "string") rowsRaw = raw.template.split(/\r?\n/);
    else if (typeof raw.rows === "string") rowsRaw = raw.rows.split(/\r?\n/);
    else rowsRaw = [];
    if (raw.source === "fallback") source = "fallback";
  } else return undefined;
  const valid = validIds ? new Set([...validIds].map((v) => scalar(v).trim())) : null;
  const excluded = excludeIds ? new Set([...excludeIds].map((v) => scalar(v).trim())) : null;
  const rows = [];
  for (const item of rowsRaw) {
    if (rows.length >= NOTEBOOK_LAYOUT_MAX_ROWS) break;
    if (typeof item !== "string" && typeof item !== "number") continue;
    // placeholders canonicos ("{ step_1 }" -> "{step_1}") antes de medir.
    const row = scalar(item)
      .replace(LAYOUT_PLACEHOLDER_RE, (_m, id) => `{${id}}`)
      .trim();
    if (!row || row.length > NOTEBOOK_LAYOUT_MAX_ROW_CHARS) continue;
    const ids = layoutPlaceholderIds(row);
    if (ids.length === 0) continue;
    if (valid && ids.some((id) => !valid.has(id))) continue;
    if (excluded && ids.some((id) => excluded.has(id))) continue;
    rows.push(row);
  }
  if (rows.length === 0) return undefined;
  return source ? { rows, source } : { rows };
}

/** Gabarito numerico ("5", "3,5", "-2") ou fracao ("3/6") de uma celula A aritmetica. */
function arithmeticAnswerToken(step) {
  const ea = scalar(step?.expectedAnswer).trim().replace(/\s+/g, "");
  if (/^-?\d+(?:[.,]\d+)?$/.test(ea) || /^-?\d+\/\d+$/.test(ea)) return ea;
  return null;
}

/** O lado direito de step.operation contem o gabarito? ("3 + 2 = 5 fatias", "5" -> true) */
function rhsMatchesAnswer(rhs, eaToken) {
  const eaNum = eaToken.includes("/") ? null : parseNumberToken(eaToken);
  for (const tok of numbersIn(rhs)) {
    if (tok === eaToken) return true;
    if (eaNum != null && !tok.includes("/") && parseNumberToken(tok) === eaNum) return true;
  }
  return false;
}

/**
 * (i, derivacao) Layout simples de um problema ARITMETICO: para cada celula A
 * com step.operation "lhs = rhs" cujo rhs contem o gabarito numerico/fracao,
 * a linha "<lhs> = {cellId}". So quando ha >= 2 dessas celulas (uma linha
 * sozinha nao e "folha de conta"); max 4 linhas; linha > 160 chars e pulada.
 * Devolve { rows, source: "fallback" } ou undefined.
 */
export function deriveArithmeticLayout(steps, ids) {
  const rows = [];
  (Array.isArray(steps) ? steps : []).forEach((step, index) => {
    if (rows.length >= NOTEBOOK_LAYOUT_MAX_ROWS) return;
    if (!step || typeof step !== "object") return;
    if (normalizeCellRole(step.cell?.role) !== "A") return;
    const op = scalar(step.operation).trim();
    const eq = op.indexOf("=");
    if (eq <= 0) return;
    const lhs = op.slice(0, eq).trim();
    const rhs = op.slice(eq + 1).trim();
    const ea = arithmeticAnswerToken(step);
    if (!lhs || !ea || !rhsMatchesAnswer(rhs, ea)) return;
    // lhs com placeholder de outra celula seria ambiguo: so texto literal.
    if (layoutPlaceholderIds(lhs).length) return;
    const row = `${lhs} = {${ids[index]}}`;
    if (row.length > NOTEBOOK_LAYOUT_MAX_ROW_CHARS) return;
    rows.push(row);
  });
  if (rows.length < 2) return undefined;
  return { rows, source: "fallback" };
}

// ============================================================
// 2026-08-17 (stream L): celula A cuja instrucao promete instrumento
// ============================================================

/**
 * Instrucao que manda MANIPULAR (pintar, clicar, arrastar, marcar na reta/
 * barra/tabela/diagrama). Numa celula A (digitacao/selecao) isso e uma
 * promessa que a caixa nao cumpre; so celula C manipula. Fonte unica para o
 * fallback (conversao A -> C), o quality-gate (warning) e o interface-audit
 * (STEP_PROMISES_INSTRUMENT_IN_TYPED_CELL). "clique" solto entra de proposito
 * (regua da stream L): numa celula A o aluno digita ou escolhe num dropdown,
 * nao clica numa superficie.
 */
// 2026-08-17 (stream M): + "represente na barra/reta" (visto no STI real de
// fracoes: "Represente na barra a diferenca entre 13/20 e 7/12").
export const TYPED_CELL_MANIPULATION_RE =
  /manipul|pinte|pintar|clique|arraste|(?:marque|represent[ea]r?)\s+na\s+(?:barra|reta|tabela|diagrama)/i;

/** A instrucao desta celula manda manipular algo? */
export function instructionPromisesManipulation(instruction) {
  return TYPED_CELL_MANIPULATION_RE.test(scalar(instruction));
}

/**
 * (k) O instrumento do problema consegue emitir o gabarito desta celula? Devolve
 * { kind, targetId } (kind = kind do alvo daquele instrumento) ou null. So os
 * tres instrumentos que o fallback sabe criar (fraction_bar, number_line,
 * highlight_in_text): table e cell_diagram exigem alvo com semantica propria
 * (linha/coluna, organela) que uma celula A nao carrega.
 */
export function instrumentTargetForTypedCell(instrument, step, cellId) {
  if (!instrument || typeof instrument !== "object") return null;
  const renderAs = scalar(instrument.renderAs).trim();
  const props = instrument.componentProps || {};
  if (renderAs === "fraction_bar") {
    const f = fractionOf(step);
    if (!f || f.den !== Number(props.denominator) || f.num > f.den) return null;
    return { kind: "bar", targetId: `bar_${cellId}` };
  }
  if (renderAs === "number_line") {
    const n = integerOf(step);
    const min = Number(props.min);
    const max = Number(props.max);
    if (n == null || !Number.isFinite(min) || !Number.isFinite(max) || n < min || n > max)
      return null;
    return { kind: "marker", targetId: `marker_${cellId}` };
  }
  if (renderAs === "highlight_in_text") {
    // UMA palavra que e token do texto (regra do compileInstrument): "gato"
    // dentro de "gatos" NAO conta, o clique no span nao emitiria "gato".
    const word = singleWordOf(step);
    if (!word || shapeOf(step).kind !== "text-short") return null;
    const tokens = scalar(props.text).split(/\s+/).map(normalizeHighlightToken).filter(Boolean);
    if (!tokens.includes(normalizeHighlightToken(word))) return null;
    return { kind: "span", targetId: `span_${cellId}` };
  }
  return null;
}

// ============================================================
// 2026-08-17 (stream M): helpers de "o caderno prefere digitar",
// givens literais, MMC e options em superficie livre
// ============================================================

/**
 * (g') Celula B cujo renderAs ja e um dos instrumentos que o fallback sabe
 * criar, cujo gabarito esse instrumento emite (fraction_bar com "k/D",
 * number_line com inteiro, highlight_in_text com uma palavra) E cuja
 * instrucao manda manipular ("Pinte na barra", "Represente na barra",
 * "Marque na reta"). So essas entram como candidatas na criacao do
 * instrumento: uma B fraction_bar cujo enunciado pede o VALOR ("qual e a
 * fracao equivalente?") e uma caixinha de digitacao (o caderno prefere
 * digitar), e uma B fraction_bar com gabarito inteiro nao vira marcador de
 * reta so por estar no problema.
 */
export function cellBAlreadyOnInstrumentSurface(step) {
  if (!instructionPromisesManipulation(step?.instruction)) return false;
  const renderAs = scalar(step?.renderAs).trim();
  if (renderAs === "fraction_bar") return !!fractionOf(step);
  if (renderAs === "number_line") return integerOf(step) != null;
  if (renderAs === "highlight_in_text")
    return !!singleWordOf(step) && shapeOf(step).kind === "text-short";
  return false;
}

/**
 * Formas de gabarito que cabem numa caixinha da celula A (digitar/selecionar).
 * Fonte unica para o fallback (m1), o quality-gate (medicao "celula B com
 * gabarito escalar") e os testes.
 */
export const SCALAR_ANSWER_KINDS = new Set(["numeric-pure", "fraction", "boolean", "text-short"]);

/** Superficies A cuja resposta e LIVRE (digitada): options nao fazem sentido nelas. */
export const FREE_TYPED_RENDER_AS = new Set(["numeric_keypad", "fraction_input", "text"]);

/** Superficies A que USAM options (o aluno seleciona). */
const OPTIONS_RENDER_AS = new Set(["multiple_choice", "true_false", "word_matcher"]);

/**
 * Regex de instrucao que pede MMC / denominador comum. Fonte unica para o
 * fallback (m4) e os testes.
 */
export const LCM_INSTRUCTION_RE = /(\bmmc\b|m[ií]nimo\s+m[uú]ltiplo\s+comum|denominador\s+comum)/i;

function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) [x, y] = [y, x % y];
  return x;
}

/** lcm(a, b) para inteiros positivos; null quando nao da para calcular. */
export function lcm(a, b) {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || a <= 0 || b <= 0) return null;
  const g = gcd(a, b);
  const out = (a / g) * b;
  return Number.isSafeInteger(out) ? out : null;
}

/** Tokens numericos de um texto separados em inteiros soltos e fracoes "a/b". */
function numericTokensOf(text) {
  const integers = [];
  const fractions = [];
  for (const tok of numbersIn(text)) {
    if (tok.includes("/")) {
      const m = /^(-?\d+)\/(\d+)$/.exec(tok);
      if (m) fractions.push({ raw: `${m[1]}/${m[2]}`, num: Number(m[1]), den: Number(m[2]) });
    } else if (/^-?\d+$/.test(tok)) integers.push(Number(tok));
  }
  return { integers, fractions };
}

/** Options uteis para multiple_choice: >= 2 e uma correta (isCorrect true ou value == EA). */
function usableOptions(step) {
  const options = Array.isArray(step?.options)
    ? step.options.filter((o) => o && typeof o === "object")
    : [];
  if (options.length < 2) return false;
  const eaKey = stripAccentsLower(scalar(step?.expectedAnswer).trim());
  return options.some(
    (o) => o.isCorrect === true || (eaKey && stripAccentsLower(o.value ?? o.label) === eaKey)
  );
}

/** Gabarito conceitual: texto (nao numero/fracao/booleano) com >= 3 palavras. */
export function isConceptualTextAnswer(expectedAnswer) {
  const ea = scalar(expectedAnswer).trim();
  if (!ea) return false;
  const kind = analyzeAnswerShape({ expectedAnswer: ea }).kind;
  if (!["text-short", "text-long"].includes(kind)) return false;
  return ea.split(/\s+/).filter(Boolean).length >= 3;
}

/**
 * Distratores TEXTUAIS dos behaviorMisconceptions (wrongAnswer que nao e
 * numero/fracao/booleano e difere do gabarito), sem duplicata. Servem para
 * sintetizar multiple_choice numa celula de gabarito conceitual.
 */
export function textualDistractorsOf(step) {
  const eaKey = stripAccentsLower(scalar(step?.expectedAnswer).trim());
  const seen = new Set();
  const out = [];
  for (const m of Array.isArray(step?.behaviorMisconceptions) ? step.behaviorMisconceptions : []) {
    const wrong = scalar(m?.wrongAnswer).trim();
    if (!wrong) continue;
    const kind = analyzeAnswerShape({ expectedAnswer: wrong }).kind;
    if (!["text-short", "text-long"].includes(kind)) continue;
    const key = stripAccentsLower(wrong);
    if (!key || key === eaKey || seen.has(key)) continue;
    seen.add(key);
    out.push({ wrongAnswer: wrong, misconceptionId: m.misconceptionId, feedback: m.feedback });
  }
  return out;
}

/**
 * Migra os distratores das options (isCorrect false com misconceptionId) para
 * behaviorMisconceptions sem duplicar e esvazia step.options. Helper unico
 * usado por (h) (instrumento nao usa options), (m1) (superficie A livre) e
 * (m3) (options em superficie livre autorada). Devolve true se options mudou.
 */
export function moveOptionsToMisconceptions(step) {
  if (!step || !Array.isArray(step.options) || step.options.length === 0) return false;
  const preserved = Array.isArray(step.behaviorMisconceptions) ? step.behaviorMisconceptions : [];
  const extra = step.options
    .filter((o) => o && o.isCorrect !== true && o.misconceptionId && scalar(o.value).trim())
    .map((o) => ({
      misconceptionId: o.misconceptionId,
      wrongAnswer: scalar(o.value).trim(),
      feedback: o.feedback || o.diagnosticInfo || "",
      misconceptionType: o.misconceptionType || "unclassified",
    }));
  const known = new Set(preserved.map((m) => `${m.misconceptionId}|${m.wrongAnswer}`));
  for (const m of extra) {
    const k = `${m.misconceptionId}|${m.wrongAnswer}`;
    if (!known.has(k)) {
      preserved.push(m);
      known.add(k);
    }
  }
  if (preserved.length) step.behaviorMisconceptions = preserved;
  step.options = [];
  if (step.visualConfig?.options) delete step.visualConfig.options;
  return true;
}

/**
 * (m1) Superficie A pela forma do gabarito. Devolve { renderAs, synthesize }
 * onde synthesize=true pede options sintetizadas dos behaviorMisconceptions
 * (gabarito conceitual sem options uteis).
 */
export function typedSurfaceForAnswer(step) {
  const kind = shapeOf(step).kind;
  if (kind === "fraction") return { renderAs: "fraction_input", synthesize: false };
  if (kind === "numeric-pure") return { renderAs: "numeric_keypad", synthesize: false };
  if (kind === "boolean") return { renderAs: "true_false", synthesize: false };
  if (usableOptions(step)) return { renderAs: "multiple_choice", synthesize: false };
  if (isConceptualTextAnswer(step?.expectedAnswer) && textualDistractorsOf(step).length >= 1) {
    return { renderAs: "multiple_choice", synthesize: true };
  }
  return { renderAs: "text", synthesize: false };
}

/** Sequencia de >= 3 itens ("a, b, c" / "a > b > c" / "a -> b -> c") ou null. */
function sequenceTokensOf(step) {
  const ea = scalar(step?.expectedAnswer).trim();
  if (!ea) return null;
  const separators = (ea.match(/(?:,|>|->|→)/g) || []).length;
  const tokens = ea
    .split(/(?:,|>|->|→)/)
    .map((s) => s.trim())
    .filter(Boolean);
  return separators >= 2 && tokens.length >= 3 ? tokens : null;
}

/** Limpa cena e payload rico que nao sobrevivem a troca de superficie. */
function dropSceneProps(step) {
  delete step.dynamicSpec;
  delete step.spec;
  if (step.visualConfig?.componentProps?.spec) delete step.visualConfig.componentProps.spec;
  if (step.composition) delete step.composition;
}

/** Troca renderAs registrando _originalRenderAs e soltando o contrato lockado. */
function switchRenderAs(step, renderAs) {
  const anterior = scalar(step.renderAs).trim();
  if (anterior === renderAs) return false;
  step._originalRenderAs = step._originalRenderAs || anterior;
  step.renderAs = renderAs;
  if (step.componentId) step.componentId = renderAs;
  if (step._componentContract && typeof step._componentContract === "object") {
    step._componentContract = {
      ...step._componentContract,
      locked: false,
      source: "notebook-fallback",
    };
  }
  return true;
}

/** Props minimas do numeric_keypad para o gabarito (o gate final realinha). */
function keypadPropsFor(expectedAnswer) {
  const ea = scalar(expectedAnswer).trim();
  const digits = (ea.match(/\d/g) || []).length;
  const props = { expectedAnswer: ea, maxDigits: Math.max(digits + 1, 3) };
  if (/\d[.,]\d/.test(ea)) props.allowDecimal = true;
  if (/^-/.test(ea)) props.allowNegative = true;
  return props;
}

/**
 * (m1) Aplica a superficie A `renderAs` numa celula: papel A, sem
 * instrumentRef/target, presentation por renderAs (a celula mudou de
 * natureza, entao "inline" autorado nao vale mais), cena removida,
 * componentProps coerentes com a superficie e options tratadas (migram para
 * behaviorMisconceptions quando a superficie e livre; sintetizadas dos
 * behaviorMisconceptions quando `synthesize`). Devolve true se a superficie
 * mudou.
 */
export function applyTypedSurfaceToCell(step, renderAs, { synthesize = false } = {}) {
  const cell = step.cell && typeof step.cell === "object" ? step.cell : (step.cell = {});
  cell.role = "A";
  delete cell.instrumentRef;
  delete cell.target;
  const mudou = switchRenderAs(step, renderAs);
  dropSceneProps(step);
  if (renderAs === "numeric_keypad") step.componentProps = keypadPropsFor(step.expectedAnswer);
  else delete step.componentProps;
  if (synthesize && renderAs === "multiple_choice") {
    const ea = scalar(step.expectedAnswer).trim();
    step.options = [
      { value: ea, label: ea, isCorrect: true, feedback: scalar(step.explanation).trim() },
      ...textualDistractorsOf(step).map((d) => ({
        value: d.wrongAnswer,
        label: d.wrongAnswer,
        isCorrect: false,
        misconceptionId: d.misconceptionId,
        feedback: scalar(d.feedback).trim(),
      })),
    ];
  } else if (!OPTIONS_RENDER_AS.has(renderAs)) {
    moveOptionsToMisconceptions(step);
  }
  // 2026-08-17 (auditor no container isolado: MISCONCEPTION_WRONGANSWER_NOT_
  // ANSWER_SHAPED): numa caixinha numerica o aluno nunca digita "7/12", e
  // numa caixinha de fracao nunca digita "12". Distrator com forma que a
  // superficie nao emite e rota morta no grafo; sai daqui (o gate mede).
  pruneMisconceptionsIncompatibleWith(step, renderAs);
  cell.presentation = presentationForRenderAs(renderAs);
  if (!step.interactionMode) step.interactionMode = "answer";
  return mudou;
}

/** Forma que a superficie A emite: numeric_keypad -> numeric-pure; fraction_input -> fraction. */
function pruneMisconceptionsIncompatibleWith(step, renderAs) {
  const emitted =
    renderAs === "numeric_keypad"
      ? "numeric-pure"
      : renderAs === "fraction_input"
        ? "fraction"
        : null;
  if (!emitted || !Array.isArray(step.behaviorMisconceptions)) return;
  const antes = step.behaviorMisconceptions.length;
  step.behaviorMisconceptions = step.behaviorMisconceptions.filter((bm) => {
    const wa = scalar(bm?.wrongAnswer).trim();
    if (!wa) return false;
    const kind = analyzeAnswerShape({ expectedAnswer: wa }).kind;
    return kind === emitted;
  });
  const removidos = antes - step.behaviorMisconceptions.length;
  if (removidos > 0) {
    step._notebookPrunedMisconceptions = (step._notebookPrunedMisconceptions || 0) + removidos;
  }
}

/**
 * (m1) Reaproveita o helper de (k): a celula vira C com um alvo NOVO do
 * instrumento (targets ganham o alvo se ainda nao existe).
 */
function promoteCellToInstrumentTarget(notebook, step, cellId, alvo) {
  const targets = Array.isArray(notebook.instrument.targets) ? notebook.instrument.targets : [];
  if (!targets.some((t) => scalar(t?.id).trim() === alvo.targetId)) {
    targets.push({ id: alvo.targetId, kind: alvo.kind, label: step.cell.label || cellId });
  }
  notebook.instrument.targets = targets;
  step.cell.role = "C";
  step.cell.instrumentRef = scalar(notebook.instrument.id).trim();
  step.cell.target = alvo.targetId;
}

/**
 * (f2) Um given tem valor LITERAL do enunciado? Regras (normalizacao sem
 * acento, minusculas): valor com fracao "a/b" exige a mesma fracao no
 * enunciado; valor com numero exige o mesmo numero (token inteiro, nao "2"
 * dentro de "24"; numerador/denominador de uma fracao do enunciado contam);
 * valor so texto exige que TODAS as palavras com >= 3 letras estejam no
 * enunciado ("celula da folha (vegetal)" passa se celula, folha e vegetal
 * aparecem). Valor vazio nunca passa.
 */
export function givenMatchesStatement(given, statement) {
  const value = scalar(given?.value).trim();
  if (!value) return false;
  const texto = stripAccentsLower(statement);
  const { fractions } = numericTokensOf(statement);
  // numeros soltos (com decimal normalizado) + numerador/denominador das fracoes
  const numerosDoEnunciado = new Set([
    ...numbersIn(statement)
      .filter((t) => !t.includes("/"))
      .map((t) => t.replace(",", ".")),
    ...fractions.flatMap((f) => [String(f.num), String(f.den)]),
  ]);
  const fracoesDoEnunciado = new Set(fractions.map((f) => f.raw));
  const doValor = numericTokensOf(value);
  if (doValor.fractions.length)
    return doValor.fractions.every((f) => fracoesDoEnunciado.has(f.raw));
  const numerosDoValor = numbersIn(value).map((t) => t.replace(",", "."));
  if (numerosDoValor.length) return numerosDoValor.every((n) => numerosDoEnunciado.has(n));
  const palavras = stripAccentsLower(value)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3);
  if (palavras.length === 0) return texto.includes(stripAccentsLower(value));
  return palavras.every((w) =>
    new RegExp(`(^|[^\\p{L}\\p{N}])${w}($|[^\\p{L}\\p{N}])`, "u").test(texto)
  );
}

/**
 * (m4) Alvo do MMC de uma celula: { a, b, explicit } ou null. explicit=true
 * quando a instrucao cita os dois numeros (dois inteiros soltos, ou duas
 * fracoes cujos denominadores sao os numeros); implicit quando o problema
 * (givens + enunciado) tem exatamente duas fracoes distintas.
 */
export function lcmTargetForCell(step, problem) {
  if (!LCM_INSTRUCTION_RE.test(scalar(step?.instruction))) return null;
  const naInstrucao = numericTokensOf(step?.instruction);
  if (naInstrucao.integers.length === 2 && naInstrucao.fractions.length === 0) {
    const [a, b] = naInstrucao.integers;
    const v = lcm(a, b);
    return v ? { a, b, value: v, explicit: true } : null;
  }
  const fracsInstrucao = [...new Set(naInstrucao.fractions.map((f) => f.raw))];
  if (fracsInstrucao.length === 2 && naInstrucao.integers.length === 0) {
    const dens = fracsInstrucao.map((raw) => Number(raw.split("/")[1]));
    const v = lcm(dens[0], dens[1]);
    return v ? { a: dens[0], b: dens[1], value: v, explicit: true } : null;
  }
  const givens = Array.isArray(problem?.notebook?.givens) ? problem.notebook.givens : [];
  const doProblema = new Set(
    [
      ...numericTokensOf(problem?.statement).fractions,
      ...givens.flatMap((g) => numericTokensOf(g?.value).fractions),
    ].map((f) => f.raw)
  );
  if (doProblema.size === 2) {
    const dens = [...doProblema].map((raw) => Number(raw.split("/")[1]));
    const v = lcm(dens[0], dens[1]);
    return v ? { a: dens[0], b: dens[1], value: v, explicit: false } : null;
  }
  return null;
}

/** (f) givens do enunciado: cada numero/fracao distinto vira { id, label, value }. */
export function extractGivensFromStatement(statement) {
  const seen = new Set();
  const givens = [];
  for (const raw of numbersIn(statement)) {
    const value = raw.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    givens.push({ id: `g${givens.length + 1}`, label: `dado ${givens.length + 1}`, value });
  }
  return givens;
}

/**
 * (e) dependsOn decorativo: operandos de step.operation que igualam o
 * resultado (lado direito da operacao ou gabarito) de um passo ANTERIOR.
 */
export function inferDependsOn(steps, ids) {
  const results = [];
  const deps = [];
  steps.forEach((step, index) => {
    const op = scalar(step?.operation).trim();
    const eq = op.indexOf("=");
    const lhs = eq >= 0 ? op.slice(0, eq) : op;
    const rhs = eq >= 0 ? op.slice(eq + 1) : "";
    const operands =
      eq >= 0
        ? numbersIn(lhs)
            .map(parseNumberToken)
            .filter((n) => n != null)
        : [];
    const found = [];
    for (let j = 0; j < index; j++) {
      if (operands.some((n) => results[j].has(n))) found.push(ids[j]);
    }
    deps.push(found);
    const mine = new Set(
      numbersIn(rhs)
        .map(parseNumberToken)
        .filter((n) => n != null)
    );
    const ea = parseNumberToken(scalar(step?.expectedAnswer).trim());
    if (ea != null && /^-?\d+(?:[.,]\d+)?$/.test(scalar(step?.expectedAnswer).trim())) mine.add(ea);
    results.push(mine);
  });
  return deps;
}

function shapeOf(step) {
  return analyzeAnswerShape({ expectedAnswer: step?.expectedAnswer });
}

/**
 * Valida um instrumento existente contra as celulas C do problema. Devolve
 * { ok, reason }. Repara SO o trivial: celula C sem instrumentRef ganha o id
 * do unico instrumento; qualquer outra divergencia invalida o conjunto.
 */
export function validateNotebookInstrument(problem) {
  const instrument = problem?.notebook?.instrument;
  if (!instrument || typeof instrument !== "object") return { ok: false, reason: "ausente" };
  const renderAs = scalar(instrument.renderAs).trim();
  if (!NOTEBOOK_C_V1.has(renderAs))
    return { ok: false, reason: `renderAs "${renderAs}" fora de NOTEBOOK_C_V1` };
  const spec = NOTEBOOK_C_SPECS[renderAs];
  if (!spec) return { ok: false, reason: `spec de ${renderAs} desconhecida` };
  // 2026-08-17 (validacao no container isolado): o instrumento fraction_bar
  // vindo do LLM trazia mode "identify" (e as vezes options/numerator); a copia
  // para a celula ja tirava, mas o proprio instrumento seguia com mode e o
  // modelo de emissor (e o InstrumentHost) o tratam como barra de exibicao:
  // 3 celulas C "nao emissiveis". O instrumento do caderno e SEMPRE a barra
  // interativa: sem mode/options/numerator no proprio instrumento.
  if (
    renderAs === "fraction_bar" &&
    instrument.componentProps &&
    typeof instrument.componentProps === "object"
  ) {
    delete instrument.componentProps.mode;
    delete instrument.componentProps.options;
    delete instrument.componentProps.numerator;
  }
  const kinds = spec?.notebook?.targets?.answerKindByKind || {};
  const propsOk = spec.schema?.safeParse
    ? spec.schema.safeParse(instrument.componentProps || {})
    : { success: true };
  if (!propsOk.success)
    return {
      ok: false,
      reason: `componentProps do instrumento nao passam no schema de ${renderAs}`,
    };
  const targets = Array.isArray(instrument.targets) ? instrument.targets : [];
  if (targets.length === 0) return { ok: false, reason: "instrumento sem targets" };
  const targetById = new Map();
  for (const t of targets) {
    const id = scalar(t?.id).trim();
    if (!id) return { ok: false, reason: "target sem id" };
    targetById.set(id, t);
  }
  const instrumentId = scalar(instrument.id).trim();
  if (!instrumentId) return { ok: false, reason: "instrumento sem id" };
  const incompatible = [];
  let compatible = 0;
  // Barra: se TODAS as celulas C sao "k/D" com o mesmo D (<= 24) diferente do
  // denominator do instrumento, quem esta errado e o instrumento e (m6) o
  // corrige logo depois; a checagem de valor usa esse D efetivo.
  let effectiveDen = Number(instrument.componentProps?.denominator);
  if (renderAs === "fraction_bar") {
    const dens = new Set();
    for (const st of problem.steps || []) {
      if (normalizeCellRole(st?.cell?.role) !== "C") continue;
      const m = /^(\d+)\s*\/\s*(\d+)$/.exec(scalar(st.expectedAnswer).trim());
      if (m) dens.add(Number(m[2]));
    }
    if (dens.size === 1) {
      // D unico entre as C: e o D efetivo (se > 24, (m6) degrada depois com a
      // mensagem certa; aqui nao e o lugar de decidir isso).
      const [d] = [...dens];
      if (d >= 2) effectiveDen = d;
    }
  }
  for (const step of problem.steps || []) {
    const cell = step?.cell;
    if (normalizeCellRole(cell?.role) !== "C") continue;
    if (cell.instrumentRef == null || scalar(cell.instrumentRef).trim() === "") {
      cell.instrumentRef = instrumentId;
    }
    if (scalar(cell.instrumentRef).trim() !== instrumentId) {
      return { ok: false, reason: `celula ${cell.id} aponta instrumentRef inexistente` };
    }
    const targetId =
      typeof cell.target === "object" ? scalar(cell.target?.id) : scalar(cell.target);
    const target = targetById.get(targetId.trim());
    if (!target) return { ok: false, reason: `celula ${cell.id} aponta target inexistente` };
    const expectedKind = kinds[scalar(target.kind).trim()];
    if (!expectedKind) return { ok: false, reason: `target ${targetId} de kind desconhecido` };
    const kind = shapeOf(step).kind;
    // 2026-08-17 (caderno F2b, achado da stream F): o alvo declara UM kind
    // canonico (table: text-short) mas a spec aceita outros (table aceita
    // numeric-pure); o compileInstrument ja aceitava, o fallback rejeitava e
    // degradava C -> B numa tabela numerica. Vale a uniao dos dois.
    const aceitos = new Set([expectedKind, ...(spec?.answerContract?.accepts || [])]);
    if (!aceitos.has(kind)) {
      incompatible.push({ step, reason: `gabarito ${kind} incompativel com alvo ${target.kind}` });
      continue;
    }
    // 2026-08-17 (visto em producao: EA "10/7" numa barra de 7 partes, aluno
    // travado): alem do kind, o VALOR tem que ser emissivel pelo instrumento.
    const ea = scalar(step.expectedAnswer).trim();
    if (renderAs === "fraction_bar") {
      const D = effectiveDen;
      const m = /^(\d+)\s*\/\s*(\d+)$/.exec(ea);
      const a = m ? Number(m[1]) : NaN;
      const b = m ? Number(m[2]) : NaN;
      if (m && b !== D && b > 0 && D % b === 0 && (a * D) / b <= D) {
        // "1/6" numa barra de 24: o aluno pinta 4 partes e a barra emite
        // "4/24". O gabarito passa a ser o que a barra emite; o original fica
        // como variacao aceita (a caixinha do modo legado continua casando).
        const k = (a * D) / b;
        const novo = `${k}/${D}`;
        step.acceptableVariations = Array.from(new Set([...(step.acceptableVariations || []), ea]));
        step.expectedAnswer = novo;
      } else if (!m || b !== D || a < 0 || a > D) {
        incompatible.push({ step, reason: `gabarito "${ea}" nao e pintavel numa barra de ${D}` });
        continue;
      }
    } else if (renderAs === "number_line") {
      const min = Number(instrument.componentProps?.min);
      const max = Number(instrument.componentProps?.max);
      const v = /^-?\d+$/.test(ea) ? Number(ea) : NaN;
      if (!Number.isInteger(v) || v < min || v > max) {
        incompatible.push({ step, reason: `gabarito "${ea}" fora da reta [${min}, ${max}]` });
        continue;
      }
    }
    compatible += 1;
  }
  if (compatible === 0 && incompatible.length > 0) {
    const why = incompatible[0]?.reason || "nenhuma celula C compativel";
    return { ok: false, reason: `celula ${incompatible[0]?.step?.cell?.id || "?"}: ${why}` };
  }
  return { ok: true, reason: "", incompatible };
}

/**
 * Degrada uma celula C para B: some a referencia ao instrumento; renderAs e
 * componentProps ficam como estao (o chamador revalida ou coage). Usado pelo
 * validate.js quando a celula C e invalida e pelo proprio fallback quando o
 * instrumento nao se sustenta.
 */
export function degradeCellToB(step) {
  if (!step || typeof step !== "object") return step;
  const cell = step.cell && typeof step.cell === "object" ? step.cell : (step.cell = {});
  cell.role = "B";
  delete cell.instrumentRef;
  delete cell.target;
  return step;
}

function integerOf(step) {
  const ea = scalar(step?.expectedAnswer).trim();
  if (!/^-?\d+$/.test(ea)) return null;
  const n = Number(ea);
  return Number.isSafeInteger(n) && Math.abs(n) <= 1000 ? n : null;
}

function fractionOf(step) {
  const m = scalar(step?.expectedAnswer)
    .trim()
    .match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!m) return null;
  const den = Number(m[2]);
  const num = Number(m[1]);
  // 2026-08-17 (visto em producao: "10/7" numa barra de 7 partes, celula
  // impossivel de responder): a barra so emite k/D com k <= D.
  if (den < 2 || den > 24 || num > den) return null;
  return { num, den };
}

function singleWordOf(step) {
  const ea = scalar(step?.expectedAnswer).trim();
  if (!/^[\p{L}\p{M}][\p{L}\p{M}'-]*$/u.test(ea)) return null;
  return ea;
}

/** Maior subconjunto de inteiros cujo intervalo cabe em 50 unidades. */
function widestIntegerWindow(entries) {
  const sorted = [...entries].sort((a, b) => a.value - b.value);
  let best = [];
  for (let i = 0; i < sorted.length; i++) {
    const win = [];
    for (let j = i; j < sorted.length && sorted[j].value - sorted[i].value <= 50; j++) {
      win.push(sorted[j]);
    }
    if (win.length > best.length) best = win;
  }
  return best;
}

/**
 * (g, sem instrumento) tenta criar UM instrumento a partir das celulas
 * candidatas. Devolve { instrument, cellIndexes, targetByIndex } ou null.
 */
function inferInstrument(problem, steps, ids, candidateIndexes) {
  const cand = candidateIndexes.map((i) => ({ i, step: steps[i], id: ids[i] }));

  // 1) fracoes com o MESMO denominador -> fraction_bar
  const byDen = new Map();
  for (const c of cand) {
    const f = fractionOf(c.step);
    if (!f) continue;
    if (!byDen.has(f.den)) byDen.set(f.den, []);
    byDen.get(f.den).push(c);
  }
  let bestFraction = null;
  for (const [den, group] of byDen) {
    if (group.length < 2) continue;
    if (!bestFraction || group.length > bestFraction.group.length) bestFraction = { den, group };
  }
  if (bestFraction) {
    const targets = bestFraction.group.map((c) => ({
      id: `bar_${c.id}`,
      kind: "bar",
      label: c.step.cell?.label || c.id,
    }));
    // A representacao acompanha o contexto (llmGuidance da spec fraction_bar e
    // regua do quality-gate "fracao em contexto de pizza sem visualModel=pizza"):
    // pizza -> pizza; bolo/torta/disco -> circle; senao a barra abstrata.
    const contexto = stripAccentsLower(
      [problem?.statement, ...bestFraction.group.map((c) => c.step?.instruction)].join(" ")
    );
    const visualModel = /\bpizza/.test(contexto)
      ? "pizza"
      : /\b(bolo|torta|disco)/.test(contexto)
        ? "circle"
        : null;
    return {
      instrument: {
        id: "inst_fraction_bar",
        renderAs: "fraction_bar",
        componentProps: {
          denominator: bestFraction.den,
          ...(visualModel ? { visualModel } : {}),
        },
        targets,
        source: "fallback",
      },
      cells: bestFraction.group.map((c, k) => ({ index: c.i, target: targets[k].id })),
    };
  }

  // 2) inteiros numa faixa de ate 50 -> number_line
  const ints = cand.map((c) => ({ ...c, value: integerOf(c.step) })).filter((c) => c.value != null);
  const window = widestIntegerWindow(ints);
  if (window.length >= 2) {
    const lo = window[0].value;
    const hi = window[window.length - 1].value;
    const min = lo >= 0 && hi <= 50 ? 0 : lo;
    let max = hi;
    if (max - min < 10) max = Math.min(1000, min + 10);
    if (max <= min) max = min + 1;
    const targets = window.map((c) => ({
      id: `marker_${c.id}`,
      kind: "marker",
      label: c.step.cell?.label || c.id,
    }));
    return {
      instrument: {
        id: "inst_number_line",
        renderAs: "number_line",
        componentProps: { min, max },
        targets,
        source: "fallback",
      },
      cells: window.map((c, k) => ({ index: c.i, target: targets[k].id })),
    };
  }

  // 3) palavra unica presente no enunciado -> highlight_in_text
  const statement = scalar(problem?.statement).trim();
  if (statement.length >= 12 && statement.length <= 1600) {
    const haystack = stripAccentsLower(statement);
    const words = cand
      .map((c) => ({ ...c, word: singleWordOf(c.step) }))
      .filter(
        (c) =>
          c.word &&
          shapeOf(c.step).kind === "text-short" &&
          haystack.includes(stripAccentsLower(c.word))
      );
    if (words.length >= 2) {
      const targets = words.map((c) => ({
        id: `span_${c.id}`,
        kind: "span",
        label: c.step.cell?.label || c.id,
      }));
      const spans = [];
      const seen = new Set();
      for (const c of words) {
        const key = stripAccentsLower(c.word);
        if (seen.has(key)) continue;
        seen.add(key);
        spans.push({ value: c.word, label: c.word });
      }
      return {
        instrument: {
          id: "inst_highlight_in_text",
          renderAs: "highlight_in_text",
          componentProps: { text: statement, spans },
          targets,
          source: "fallback",
        },
        cells: words.map((c, k) => ({ index: c.i, target: targets[k].id })),
      };
    }
  }
  return null;
}

/**
 * (h) componentProps de uma celula C a partir do instrumento: os props que a
 * celula precisa para se desenhar sozinha, sem os que sao por-alvo (marker,
 * numerator). Para highlight_in_text a lista COMPLETA de spans clicaveis vai em
 * componentProps.spans (o InstrumentHost do front le dali); step.options fica
 * SO com o gabarito + as options originais do worker (que carregam
 * misconceptionId). Achado da stream de medicao (golden portugues-classes-
 * gramaticais, 2026-08-16): espelhar os 7 spans em options sem misconceptionId
 * fazia o quality-gate ler 18 distratores nao classificados e bloquear o
 * caderno ("behaviorGraph invalido", "distratores genericos 83%"). Span de
 * instrumento nao e distrator pedagogico. O pedagogicalGuard da spec so exige
 * que options contenha o gabarito.
 */
/** Alvo de tabela "r2c3", "cell_2_3" ou "2,3" -> {row, col}; senao null. */
function parseTableTargetId(id) {
  const m = /(\d+)\D+(\d+)/.exec(scalar(id));
  if (!m) return null;
  return { row: Number(m[1]), col: Number(m[2]) };
}

function applyInstrumentToCell(step, instrument, allCSteps) {
  const renderAs = scalar(instrument.renderAs).trim();
  const base = { ...(instrument.componentProps || {}) };
  let props;
  if (renderAs === "number_line") {
    delete base.marker;
    props = { ...base, min: Number(base.min), max: Number(base.max) };
  } else if (renderAs === "fraction_bar") {
    delete base.numerator;
    // 2026-08-17 (rejeicao em producao): o instrumento vindo do LLM trazia
    // `mode: "identify"`; copiado para a celula, o FractionBar fica SEM input
    // (mode sem options = estatico) e o guard mode-without-input reprova. O
    // instrumento do caderno e sempre a barra interativa: sem mode/options.
    delete base.mode;
    delete base.options;
    props = { ...base, denominator: Number(base.denominator) };
    // 2026-08-17: a barra de D partes so emite k/D com 0 <= k <= D; distrator
    // "5", "5/0", "-5/12" ou "1/7" nunca e clicavel nela (rota morta).
    if (Array.isArray(step.behaviorMisconceptions)) {
      const D = Number(base.denominator);
      const vistos = new Set([scalar(step.expectedAnswer).trim()]);
      const mantidos = [];
      for (const bm of step.behaviorMisconceptions) {
        const m = /^(\d+)\s*\/\s*(\d+)$/.exec(scalar(bm?.wrongAnswer).trim());
        if (!m) continue;
        const a = Number(m[1]);
        const b = Number(m[2]);
        // fracao equivalente com denominador que cabe na barra ("1/4" numa
        // barra de 12) vira o que o aluno de fato pinta ("3/12"): o erro
        // continua diagnosticavel em vez de virar rota morta.
        if (b <= 0 || D % b !== 0) continue;
        const k = (a * D) / b;
        if (!Number.isInteger(k) || k < 0 || k > D) continue;
        const wa = `${k}/${D}`;
        if (vistos.has(wa)) continue;
        vistos.add(wa);
        mantidos.push(wa === scalar(bm.wrongAnswer).trim() ? bm : { ...bm, wrongAnswer: wa });
      }
      step.behaviorMisconceptions = mantidos;
    }
  } else if (renderAs === "highlight_in_text") {
    const text = scalar(base.text).trim();
    const seen = new Set();
    const spans = [];
    const push = (value, label) => {
      const v = scalar(value).trim();
      const key = stripAccentsLower(v);
      if (!v || seen.has(key)) return;
      seen.add(key);
      spans.push({ value: v, label: scalar(label).trim() || v });
    };
    // spans do instrumento (spans; `options` como alias vindo do LLM) + os
    // gabaritos de todas as celulas C, para que cada alvo seja clicavel.
    for (const o of Array.isArray(base.spans) ? base.spans : [])
      push(o?.value ?? o?.label, o?.label);
    for (const o of Array.isArray(base.options) ? base.options : [])
      push(o?.value ?? o?.label, o?.label);
    for (const s of allCSteps) push(s?.expectedAnswer, s?.expectedAnswer);
    delete base.options;
    props = { ...base, text, spans };
    // options: gabarito + originais do worker (nao os spans). Garante UMA
    // opcao correta igual ao gabarito; o resto fica como o autor escreveu.
    const ea = scalar(step.expectedAnswer).trim();
    const eaKey = stripAccentsLower(ea);
    const originais = (Array.isArray(step.options) ? step.options : []).filter(
      (o) => o && typeof o === "object" && stripAccentsLower(o.value ?? o.label) !== eaKey
    );
    const correta = (Array.isArray(step.options) ? step.options : []).find(
      (o) => o && typeof o === "object" && stripAccentsLower(o.value ?? o.label) === eaKey
    ) || { value: ea, label: ea };
    step.options = [{ ...correta, value: ea, isCorrect: true }, ...originais];
  } else if (renderAs === "table") {
    // 2026-08-17 (caderno F2b, achado da stream F): a celula C de tabela so
    // pode ter a SUA celula em editableCells. Copiar todas fazia o
    // pedagogicalGuard da spec ("1 token por editableCell") falhar e o gate
    // final degradar C -> B, desfazendo a copia correta do compileInstrument.
    const cell = step.cell || {};
    const targetId =
      typeof cell.target === "object" ? scalar(cell.target?.id) : scalar(cell.target);
    const target = (Array.isArray(instrument.targets) ? instrument.targets : []).find(
      (t) => scalar(t?.id).trim() === targetId.trim()
    );
    const rc =
      target && Number.isInteger(target.row) && Number.isInteger(target.col)
        ? { row: target.row, col: target.col }
        : parseTableTargetId(targetId);
    const editaveis = Array.isArray(base.editableCells) ? base.editableCells : [];
    const own = rc
      ? editaveis.find((c) => Number(c?.row) === rc.row && Number(c?.col) === rc.col) || rc
      : null;
    props = { ...base, editableCells: own ? [own] : editaveis };
  } else {
    props = base;
  }
  const mudouSuperficie = step.renderAs !== renderAs;
  if (mudouSuperficie) step._originalRenderAs = step._originalRenderAs || step.renderAs;
  step.renderAs = renderAs;
  if (step.componentId) step.componentId = renderAs;
  step.componentProps = props;
  if (!step.interactionMode) step.interactionMode = "answer";
  if (mudouSuperficie && step._componentContract && typeof step._componentContract === "object") {
    // O contrato lockado pelo compiler descrevia a superficie antiga; solta
    // para o compileTutorContracts revalidar e re-lockar sobre a nova.
    step._componentContract = {
      ...step._componentContract,
      locked: false,
      source: "notebook-fallback",
    };
  }
  if (renderAs !== "highlight_in_text") {
    // Instrumento manipulativo nao usa options; os diagnosticos ficam nos
    // behaviorMisconceptions (contrato da PR #27). 2026-08-17 (stream M):
    // helper unico com (m1)/(m3).
    moveOptionsToMisconceptions(step);
  }
}

/**
 * Aplica o fallback do caderno num problema (mutacao in-place; devolve o
 * mesmo objeto). No-op fora de interfaceMode === "worksheet". Idempotente:
 * aplicar duas vezes produz o mesmo resultado (teste caderno-f2-notebook-fallback).
 *
 * @param {object} problem  { statement, steps[], notebook? }
 * @param {{ interfaceMode?: string, report?: string[] }} opts
 */
export function applyNotebookFallback(problem, opts = {}) {
  if (opts?.interfaceMode !== "worksheet") return problem;
  if (!problem || typeof problem !== "object" || !Array.isArray(problem.steps)) return problem;
  const report = Array.isArray(opts.report) ? opts.report : null;
  const note = (msg) => report && report.push(msg);
  const steps = problem.steps.filter((s) => s && typeof s === "object");
  if (steps.length === 0) return problem;
  const ids = canonicalGraphStepIds(problem.steps);

  // (a), (b), (c): identidade, label e papel.
  const authoredRole = [];
  problem.steps.forEach((step, index) => {
    if (!step || typeof step !== "object") {
      authoredRole.push(null);
      return;
    }
    const id = ids[index];
    if (scalar(step.graphNodeId).trim() === "") step.graphNodeId = id;
    const cell = step.cell && typeof step.cell === "object" ? step.cell : {};
    step.cell = cell;
    cell.id = id;
    if (scalar(cell.label).trim() === "") cell.label = labelFromInstruction(step.instruction) || id;
    const authored = normalizeCellRole(cell.role);
    authoredRole.push(authored);
    cell.role = authored || notebookRoleForRenderAs(step.renderAs) || "B";
  });

  // (f) givens.
  if (!problem.notebook || typeof problem.notebook !== "object") problem.notebook = {};
  if (Array.isArray(problem.notebook.givens)) {
    // (f2) 2026-08-17 (stream M): so given com valor LITERAL do enunciado
    // sobrevive; os demais sao alucinacao do planner ("24 alunos" num
    // enunciado sem 24) e vao para discardedGivens (medicao do gate). Idempotente:
    // na 2a passada todos os sobreviventes passam de novo.
    const antes = problem.notebook.givens.filter((g) => g && typeof g === "object");
    const mantidos = antes.filter((g) => givenMatchesStatement(g, problem.statement));
    const descartados = antes.filter((g) => !givenMatchesStatement(g, problem.statement));
    if (descartados.length) {
      const lista = Array.isArray(problem.notebook.discardedGivens)
        ? problem.notebook.discardedGivens
        : [];
      const known = new Set(lista.map((g) => `${g?.id}|${g?.value}`));
      for (const g of descartados) {
        const k = `${g.id}|${g.value}`;
        if (!known.has(k)) {
          lista.push({ id: g.id, label: g.label, value: g.value });
          known.add(k);
        }
      }
      problem.notebook.discardedGivens = lista;
      note(
        `caderno: ${descartados.length} given(s) sem valor literal no enunciado descartado(s) (${descartados
          .map((g) => scalar(g.value))
          .join(", ")})`
      );
    }
    if (mantidos.length) problem.notebook.givens = mantidos;
    else {
      problem.notebook.givens = extractGivensFromStatement(problem.statement);
      if (antes.length)
        note(
          `caderno: nenhum given literal; ${problem.notebook.givens.length} extraido(s) do enunciado`
        );
    }
  } else {
    problem.notebook.givens = extractGivensFromStatement(problem.statement);
    note(`caderno: ${problem.notebook.givens.length} given(s) extraido(s) do enunciado`);
  }

  // (m4) 2026-08-17 (stream M): MMC / denominador comum e um NUMERO. Roda
  // antes de (g) para a celula nao entrar como alvo "24/24" de uma barra.
  problem.steps.forEach((step, index) => {
    if (!step || typeof step !== "object") return;
    const alvo = lcmTargetForCell(step, problem);
    if (!alvo) return;
    const ea = scalar(step.expectedAnswer).trim();
    const fr = /^(\d+)\s*\/\s*(\d+)$/.exec(ea);
    const eaNum = /^-?\d+$/.test(ea) ? Number(ea) : null;
    const jaCerto = eaNum === alvo.value;
    const dSobreD = !!fr && Number(fr[1]) === Number(fr[2]);
    // 2026-08-17 (visto na validacao do container isolado): "6/1" para o MMC de
    // 6 e 2 e o mesmo truque de "D/D" (numero disfarcado de fracao). So conta
    // quando k == lcm, para nao tocar numa fracao a/1 legitima de outra conta.
    const kSobreUm = !!fr && Number(fr[2]) === 1 && Number(fr[1]) === alvo.value;
    // Guard aritmetico (gotcha 6 do CLAUDE.md: corrigir-para-errado e pior):
    //  - "D/D" (o "24/24" visto em producao) e EA vazio sao trocados sempre;
    //  - EA fracao a/b (a != b) e EA textual NUNCA sao trocados: pode ser a
    //    fracao equivalente ou o passo conceitual ("Encontrar um denominador
    //    comum") de uma instrucao que so MENCIONA denominador comum;
    //  - EA numerico diferente do lcm so cai quando a instrucao cita
    //    explicitamente os dois numeros E (pede o MINIMO ou o EA nem e
    //    multiplo comum dos dois): "denominador comum de 5/6 e 1/3" com EA
    //    12 e um denominador comum legitimo e fica.
    const pedeMinimo =
      /(\bmmc\b|m[ií]nimo\s+m[uú]ltiplo\s+comum|menor\s+denominador\s+comum)/i.test(
        scalar(step.instruction)
      );
    const multiploComum =
      eaNum != null && eaNum > 0 && eaNum % alvo.a === 0 && eaNum % alvo.b === 0;
    let podeTrocar = false;
    if (dSobreD || kSobreUm || ea === "") podeTrocar = true;
    else if (eaNum != null && !jaCerto)
      podeTrocar = alvo.explicit && (pedeMinimo || !multiploComum);
    if (!jaCerto && !podeTrocar) return;
    if (!jaCerto) {
      step.expectedAnswer = String(alvo.value);
      note(
        `caderno: celula ${ids[index]} pede MMC/denominador comum de ${alvo.a} e ${alvo.b}: gabarito "${ea}" -> "${alvo.value}"`
      );
    }
    if (normalizeCellRole(step.cell?.role) !== "A" || step.renderAs !== "numeric_keypad") {
      applyTypedSurfaceToCell(step, "numeric_keypad");
      note(`caderno: celula ${ids[index]} de MMC/denominador comum garantida como A numerica`);
    }
  });

  // (g) instrumento.
  const notebook = problem.notebook;
  const cIndexes = () =>
    problem.steps
      .map((s, i) => (s && normalizeCellRole(s.cell?.role) === "C" ? i : -1))
      .filter((i) => i >= 0);
  if (notebook.instrument !== undefined && notebook.instrument !== null) {
    const check = validateNotebookInstrument(problem);
    if (!check.ok) {
      for (const i of cIndexes()) degradeCellToB(problem.steps[i]);
      delete notebook.instrument;
      note(`caderno: instrumento invalido (${check.reason}); celulas C degradadas para B`);
    } else if (Array.isArray(check.incompatible) && check.incompatible.length) {
      // 2026-08-17: so a celula cujo gabarito o instrumento nao emite sai do
      // instrumento (vira B e, por (m1), A digitada); as demais continuam C.
      // Antes o instrumento inteiro caia ou, pior, a celula ficava C sem
      // resposta possivel ("10/7" numa barra de 7).
      const targets = Array.isArray(notebook.instrument.targets) ? notebook.instrument.targets : [];
      for (const { step, reason } of check.incompatible) {
        const targetId =
          typeof step.cell?.target === "object"
            ? scalar(step.cell.target?.id)
            : scalar(step.cell?.target);
        degradeCellToB(step);
        const idx = targets.findIndex((t) => scalar(t?.id).trim() === targetId.trim());
        if (idx >= 0) targets.splice(idx, 1);
        note(`caderno: celula ${step.cell?.id} saiu do instrumento (${reason})`);
      }
    }
  }
  if (notebook.instrument === undefined || notebook.instrument === null) {
    // (g') 2026-08-17 (stream M): celula B cujo renderAs JA e um instrumento
    // (fraction_bar/number_line/highlight_in_text) tambem e candidata: duas
    // fraction_bar B "1/15" soltas viram UM instrumento D=15 com duas C.
    const candidates = problem.steps
      .map((s, i) =>
        s &&
        (authoredRole[i] === null ||
          authoredRole[i] === "C" ||
          (normalizeCellRole(s.cell?.role) === "B" && cellBAlreadyOnInstrumentSurface(s)))
          ? i
          : -1
      )
      .filter((i) => i >= 0);
    const inferred =
      candidates.length >= 2 ? inferInstrument(problem, problem.steps, ids, candidates) : null;
    if (inferred) {
      notebook.instrument = inferred.instrument;
      const chosen = new Set(inferred.cells.map((c) => c.index));
      for (const { index, target } of inferred.cells) {
        const cell = problem.steps[index].cell;
        cell.role = "C";
        cell.instrumentRef = inferred.instrument.id;
        cell.target = target;
      }
      for (const i of cIndexes()) {
        if (!chosen.has(i)) degradeCellToB(problem.steps[i]);
      }
      note(
        `caderno: instrumento ${inferred.instrument.renderAs} criado pelo fallback para ${inferred.cells.length} celula(s)`
      );
    } else {
      const orfas = cIndexes();
      for (const i of orfas) degradeCellToB(problem.steps[i]);
      if (orfas.length)
        note(`caderno: ${orfas.length} celula(s) C sem instrumento degradada(s) para B`);
    }
  }

  // (m6) 2026-08-17 (stream M): instrumento fraction_bar cujo denominator nao
  // e o D comum a TODAS as celulas C "k/D" (visto em producao: barra de 24
  // para celulas de sextos). Corrige o instrumento; D > 24 nao cabe na spec e
  // as C viram A fraction_input. Roda antes de (m1) e (h) para as C receberem
  // a barra certa.
  if (notebook.instrument && scalar(notebook.instrument.renderAs).trim() === "fraction_bar") {
    const cIdx = cIndexes();
    const fracoes = cIdx.map((i) => {
      const m = /^(\d+)\s*\/\s*(\d+)$/.exec(scalar(problem.steps[i].expectedAnswer).trim());
      return m ? { num: Number(m[1]), den: Number(m[2]) } : null;
    });
    const dens = new Set(fracoes.map((f) => (f ? f.den : null)));
    const props = notebook.instrument.componentProps || (notebook.instrument.componentProps = {});
    const atual = Number(props.denominator);
    if (cIdx.length && dens.size === 1 && !dens.has(null)) {
      const [D] = [...dens];
      if (D !== atual) {
        if (D >= 2 && D <= 24) {
          props.denominator = D;
          note(
            `caderno: instrumento fraction_bar com denominator ${Number.isFinite(atual) ? atual : "ausente"} corrigido para ${D} (denominador comum das celulas C)`
          );
        } else {
          for (const i of cIdx) applyTypedSurfaceToCell(problem.steps[i], "fraction_input");
          delete notebook.instrument;
          note(
            `caderno: celulas C com denominador ${D} fora da spec da barra (2..24): degradadas para A fraction_input e instrumento removido`
          );
        }
      }
    }
  }

  // (m1) 2026-08-17 (stream M): "o caderno prefere digitar". Celula B (ou
  // sem papel autorado) com gabarito escalar e superficie fora do conjunto
  // "montar/ordenar/parear" vira A com a superficie da forma. Excecao:
  // fraction_bar "k/D" com instrumento fraction_bar de denominator D vira C
  // (alvo novo, helper de (k)). dynamic_spec nunca fica numa celula.
  // Idempotente: na 2a passada a celula ja e A (ou C) e nada casa.
  problem.steps.forEach((step, index) => {
    if (!step || typeof step !== "object") return;
    const role = normalizeCellRole(step.cell?.role);
    if (role === "C") return;
    const renderAs = scalar(step.renderAs).trim();
    const kind = shapeOf(step).kind;
    if (role === "A") {
      // Celula A com superficie fora do conjunto A (cena da recuperacao rica,
      // barra solta, componente do worker): superficie pela forma. A rede
      // final do gate faria o mesmo, mas por _fallbackRenderAs (fracao viraria
      // keypad); aqui fracao vira fraction_input.
      if (WORKSHEET_A_RENDER_AS.has(renderAs)) return;
      const { renderAs: destino, synthesize } = typedSurfaceForAnswer(step);
      applyTypedSurfaceToCell(step, destino, { synthesize });
      note(
        `caderno: celula A ${ids[index]} com superficie "${renderAs || "ausente"}" fora do conjunto A -> ${destino}`
      );
      return;
    }
    const escalar = SCALAR_ANSWER_KINDS.has(kind);
    const cena = renderAs === "dynamic_spec";
    // B com superficie SIMPLES (multiple_choice, text, keypad...) e uma celula
    // A com o papel errado, seja qual for a forma do gabarito: no caderno o
    // papel segue a superficie (visto no gate: B multiple_choice com gabarito
    // conceitual de 5 palavras ficava "inline").
    const superficieSimples =
      WORKSHEET_A_RENDER_AS.has(renderAs) && !ASSEMBLED_ANSWER_RENDER_AS.has(renderAs);
    if (!escalar && !cena && !superficieSimples) return;
    if (!cena && ASSEMBLED_ANSWER_RENDER_AS.has(renderAs)) return;
    // Excecao: barra solta cujo gabarito o instrumento do problema emite.
    if (renderAs === "fraction_bar" && notebook.instrument) {
      const alvo = instrumentTargetForTypedCell(notebook.instrument, step, ids[index]);
      if (alvo) {
        promoteCellToInstrumentTarget(notebook, step, ids[index], alvo);
        note(
          `caderno: celula B ${ids[index]} (fraction_bar solta) convertida em C (alvo ${alvo.targetId})`
        );
        return;
      }
    }
    if (cena && !escalar) {
      const tokens = sequenceTokensOf(step);
      if (tokens) {
        // Sequencia: o roteador escolheria drag_to_order (mesma construcao do
        // diversifier: items = tokens, EA serializado por virgula).
        switchRenderAs(step, "drag_to_order");
        dropSceneProps(step);
        step.componentProps = {
          items: tokens.map((t) => ({ value: t, label: t })),
          expectedAnswer: tokens.join(","),
        };
        step.expectedAnswer = tokens.join(",");
        step.cell.role = "B";
        step.cell.presentation = "inline";
        moveOptionsToMisconceptions(step);
        note(`caderno: celula ${ids[index]} dynamic_spec com sequencia -> B drag_to_order`);
        return;
      }
    }
    const { renderAs: destino, synthesize } = typedSurfaceForAnswer(step);
    applyTypedSurfaceToCell(step, destino, { synthesize });
    note(
      `caderno: celula ${role || "sem papel"} ${ids[index]} com gabarito ${cena ? "em cena (dynamic_spec)" : escalar ? `escalar (${kind})` : `${kind} em superficie simples`} "${renderAs || "ausente"}" -> A ${destino}${synthesize ? " (options sintetizadas dos behaviorMisconceptions)" : ""}`
    );
  });

  // (m3) 2026-08-17 (stream M): options em superficie LIVRE de celula A
  // (numeric_keypad, fraction_input, text) migram para behaviorMisconceptions
  // e options esvazia; gabarito conceitual em `text` com distratores textuais
  // vira multiple_choice (mesma sintese de (m1)). Idempotente.
  problem.steps.forEach((step, index) => {
    if (!step || typeof step !== "object") return;
    if (normalizeCellRole(step.cell?.role) !== "A") return;
    const renderAs = scalar(step.renderAs).trim();
    if (!FREE_TYPED_RENDER_AS.has(renderAs)) return;
    if (renderAs === "text" && isConceptualTextAnswer(step.expectedAnswer)) {
      const { renderAs: destino, synthesize } = typedSurfaceForAnswer(step);
      if (destino === "multiple_choice") {
        applyTypedSurfaceToCell(step, destino, { synthesize });
        note(
          `caderno: celula A ${ids[index]} com gabarito conceitual -> multiple_choice${synthesize ? " (options sintetizadas dos behaviorMisconceptions)" : ""}`
        );
        return;
      }
    }
    if (Array.isArray(step.options) && step.options.length) {
      moveOptionsToMisconceptions(step);
      note(
        `caderno: celula A ${ids[index]} (${renderAs}) tinha options: migradas para behaviorMisconceptions`
      );
    }
    // 2026-08-17: distrator com forma que a caixinha nao emite (fracao numa
    // celula numerica, numero numa celula de fracao) e rota morta; sai
    // tambem quando a celula JA nasceu A (nao so na conversao B -> A).
    const antes = Array.isArray(step.behaviorMisconceptions)
      ? step.behaviorMisconceptions.length
      : 0;
    pruneMisconceptionsIncompatibleWith(step, renderAs);
    const depois = Array.isArray(step.behaviorMisconceptions)
      ? step.behaviorMisconceptions.length
      : 0;
    if (depois < antes) {
      note(
        `caderno: celula A ${ids[index]} (${renderAs}): ${antes - depois} distrator(es) com forma incompativel removido(s)`
      );
    }
  });

  // (k) 2026-08-17 (stream L): celula A com instrucao de manipulacao cujo
  // gabarito o instrumento (ja validado/criado em (g)) sabe emitir vira C
  // com um alvo NOVO. Roda ANTES de (h) para a celula convertida receber a
  // superficie como qualquer C. Idempotente: na 2a passada a celula ja e C.
  if (notebook.instrument) {
    problem.steps.forEach((step, index) => {
      if (!step || typeof step !== "object") return;
      if (normalizeCellRole(step.cell?.role) !== "A") return;
      if (!instructionPromisesManipulation(step.instruction)) return;
      const alvo = instrumentTargetForTypedCell(notebook.instrument, step, ids[index]);
      if (!alvo) return;
      promoteCellToInstrumentTarget(notebook, step, ids[index], alvo);
      note(
        `caderno: celula A ${ids[index]} com instrucao de manipulacao convertida em C (alvo ${alvo.targetId})`
      );
    });
  }

  // (h) celulas C recebem a superficie do instrumento.
  if (notebook.instrument) {
    const cSteps = cIndexes().map((i) => problem.steps[i]);
    for (const step of cSteps) applyInstrumentToCell(step, notebook.instrument, cSteps);
  }

  // (i) 2026-08-17 (stream L): layout da folha, validado contra os steps
  // FINAIS (papeis ja decididos): linha com id inexistente ou de celula C
  // some; sem linha, a chave some. Sem layout do LLM, deriva o aritmetico.
  // Idempotente: o derivado passa na validacao e nao e re-derivado.
  const cIds = cIndexes().map((i) => ids[i]);
  // 2026-08-17 (visto em producao: template "14x = {step_1}" com gabarito
  // "14x + 30 = 128"): celula cujo gabarito e equacao/expressao nao cabe numa
  // caixinha do template; a linha que a referencia e descartada como a de C.
  const equationIds = problem.steps
    .map((s, i) => (isEquationLikeAnswer(s?.expectedAnswer) ? ids[i] : null))
    .filter(Boolean);
  const excluidas = [...cIds, ...equationIds];
  if (notebook.layout !== undefined && notebook.layout !== null) {
    const layout = normalizeNotebookLayout(notebook.layout, {
      validIds: ids,
      excludeIds: excluidas,
    });
    if (layout) notebook.layout = layout;
    else {
      delete notebook.layout;
      note("caderno: layout do LLM sem linha valida (ids inexistentes ou de celula C); descartado");
    }
  }
  if (notebook.layout === undefined || notebook.layout === null) {
    delete notebook.layout;
    const derivado = deriveArithmeticLayout(problem.steps, ids);
    if (derivado) {
      notebook.layout = derivado;
      note(`caderno: layout aritmetico derivado pelo fallback (${derivado.rows.length} linha(s))`);
    }
  }

  // (d) presentation por renderAs FINAL (depois de (h)), so se ausente.
  problem.steps.forEach((step) => {
    if (!step || typeof step !== "object") return;
    if (scalar(step.cell.presentation).trim() === "") {
      step.cell.presentation = presentationForRenderAs(step.renderAs);
    }
  });

  // (e) dependsOn decorativo, so quando ausente e quando houver o que ligar.
  const deps = inferDependsOn(problem.steps, ids);
  problem.steps.forEach((step, index) => {
    if (!step || typeof step !== "object") return;
    if (step.cell.dependsOn === undefined && deps[index].length > 0) {
      step.cell.dependsOn = deps[index];
    }
  });

  return problem;
}

/**
 * Origem do instrumento de um problema para a metrica do quality-gate:
 * "fallback" (criado aqui), "llm" (veio do planner/worker) ou "ausente".
 */
export function notebookInstrumentSource(problem) {
  const instrument = problem?.notebook?.instrument;
  if (!instrument || typeof instrument !== "object") return "ausente";
  return instrument.source === "fallback" ? "fallback" : "llm";
}

/**
 * 2026-08-17 (stream L): origem do layout da folha para a metrica do
 * quality-gate: "fallback" (derivado aqui), "llm" (planner/worker) ou
 * "ausente" (sem linha valida).
 */
export function notebookLayoutSource(problem) {
  const layout = problem?.notebook?.layout;
  if (!layout || typeof layout !== "object" || !Array.isArray(layout.rows) || !layout.rows.length)
    return "ausente";
  return layout.source === "fallback" ? "fallback" : "llm";
}
