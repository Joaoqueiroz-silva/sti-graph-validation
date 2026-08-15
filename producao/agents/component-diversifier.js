/**
 * component-diversifier.js — Safety net que garante variedade de componentes em cada STI.
 *
 * Problema: o pipeline (V10 e V9.2) tem múltiplos caminhos que escapam pra
 * `multiple_choice` quando regex KC falha, props estão incompletas, ou
 * dynamic_spec não conseguiu ser gerado. Resultado: 90%+ dos steps viram MC.
 *
 * Solução em duas camadas:
 *   1. inferComponentFromAnswer(step, ctx) — inferência determinística por shape
 *      do expectedAnswer (numérico → numeric_keypad, sequência → drag_to_order,
 *      frase → sentence_builder, etc). Plugado nos pontos onde MC seria
 *      escolhido, BEFORE caindo em MC.
 *   2. enforceComponentDiversity(tutor, opts) — post-processor global que olha
 *      a distribuição final do STI inteiro. Se MC > budget (default 30%),
 *      converte top-N steps MC com shape mais convertível.
 *
 * 100% determinístico, <5ms por STI. Não chama LLM.
 *
 * Plugado em:
 *   - backend/agents/ui-designer.js (V10): no fim do loop de decisões
 *   - backend/routes/sti-generation.js (V9.2): antes da telemetria final
 *   - backend/routes/sti-generation.js _finalStructuralGate: última checagem
 *
 * Telemetria:
 *   tutor._metadata.diversifier = { applied, before, after, changed, mcShare, budget, language }
 */

import { logger } from "../lib/logger.js";
import { isSimpleInterface } from "./config/request-context.js";
// 2026-06-10 (auditoria): conversões do diversifier revalidam answerContract —
// trocar componente por diversidade não pode instalar um incompatível com o EA.
import { analyzeAnswerShape, checkAnswerCompatibility } from "../lib/answer-shape.js";
import { getManifestSync } from "./component-registry.js";

function _contractAllowsConversion(candidate, step) {
  const manifest = getManifestSync(candidate);
  if (!manifest) return true; // registry ainda não carregado / componente legado
  const compat = checkAnswerCompatibility(manifest, step, analyzeAnswerShape(step));
  return compat.ok ? true : compat;
}

const DEFAULT_MC_BUDGET = 0.3;
const OPERATIONAL_MISCONCEPTION_ID_RX = /^[A-Za-z0-9_.:-]+$/;
const UNRESOLVED_DIAGNOSTIC_TEMPLATE_RX = /\{\{[^}]+\}\}|\$\{[^}]+\}/;

function _diagnosticScalar(value) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

/**
 * Preserva classificadores concretos antes de uma conversão MC -> componente
 * de resposta construída. `options` deixa de ser uma superfície visual, mas
 * os erros observáveis continuam sendo úteis para o grafo de comportamento.
 *
 * 2026-07-19: exportada — o final-gate também remove options de steps de
 * resposta construída (forceConstructedResponse / manipulativo rico) e
 * descartava os diagnósticos junto; na geração E2E de frações isso deixou
 * P3/P4 com 0 scaffolds e a cobertura específica em 42% (<50%).
 */
export function _preserveBehaviorMisconceptions(step) {
  const currentOptions = Array.isArray(step?.options) ? step.options : [];
  // Se choices atuais existem, elas são a fonte de verdade; não misture
  // classificadores históricos de uma versão anterior do exercício.
  const candidates =
    currentOptions.length > 0
      ? currentOptions
      : Array.isArray(step?.behaviorMisconceptions)
        ? step.behaviorMisconceptions
        : [];
  const expectedAnswer = _diagnosticScalar(step?.expectedAnswer).trim();
  const preserved = [];
  const seen = new Set();

  for (const candidate of candidates) {
    if (!candidate || candidate.isCorrect === true) continue;
    const id = _diagnosticScalar(candidate.misconceptionId ?? candidate.id).trim();
    const wrongAnswer = _diagnosticScalar(
      candidate.wrongAnswer ?? candidate.value ?? candidate.label ?? candidate.text
    ).trim();
    const type = _diagnosticScalar(candidate.misconceptionType ?? candidate.type).trim();
    const source = _diagnosticScalar(candidate.source ?? candidate.graphDiagnosticSource).trim();
    if (
      !id ||
      !OPERATIONAL_MISCONCEPTION_ID_RX.test(id) ||
      !wrongAnswer ||
      wrongAnswer === expectedAnswer ||
      !type ||
      type === "unclassified" ||
      /^misc_(?:generic|unclassified|numeric_near|text_confusion)(?:_|$)/.test(id) ||
      /^deterministic_.*fallback$/.test(source) ||
      UNRESOLVED_DIAGNOSTIC_TEMPLATE_RX.test(id) ||
      UNRESOLVED_DIAGNOSTIC_TEMPLATE_RX.test(wrongAnswer)
    ) {
      continue;
    }

    const feedback = _diagnosticScalar(
      candidate.feedback ?? candidate.howToFix ?? candidate.diagnosticInfo
    ).trim();
    const description = _diagnosticScalar(
      candidate.description ?? candidate.diagnosticInfo ?? candidate.feedback
    ).trim();
    const key = `${id}\u0000${wrongAnswer}`;
    if (seen.has(key)) continue;
    seen.add(key);
    preserved.push({
      id,
      misconceptionId: id,
      type,
      misconceptionType: type,
      wrongAnswer,
      feedback,
      description,
      diagnosticInfo: _diagnosticScalar(candidate.diagnosticInfo).trim(),
      remediationInstruction:
        _diagnosticScalar(candidate.remediationInstruction ?? candidate.howToFix).trim() ||
        feedback,
      severity: candidate.severity || "moderate",
      matcher: candidate.matcher || "exact",
      source: source || "multiple_choice_distractor_preserved_by_component_diversifier",
      originalOptionId: _diagnosticScalar(candidate.originalOptionId ?? candidate.optionId).trim(),
    });
  }

  if (preserved.length > 0) step.behaviorMisconceptions = preserved;
}

// Disciplinas-linguagem (PT/EN/ES/FR variantes)
// 2026-04-27: "espanhol" (PT) tem h; "español" (ES) tem ñ — cobertos por alternation.
const LANGUAGE_DISCIPLINE_RX =
  /portugu[êe]s|portuguese|english|ingl[êe]s|espanhol|espa[nñ][oó]l|spanish|fran[çc][êe]s|french|linguagem|literatura|gram[áa]tica|grammar|reda[çc][ãa]o|writing|literacy|alfabetiza[çc][ãa]o|fonetica|phonetic|leitura|reading|escrita/i;

// Disciplinas STEM (mat/fis/quim) — pra reforçar numeric_keypad
const STEM_DISCIPLINE_RX =
  /matem[áa]tica|math|f[íi]sica|physics|qu[íi]mica|chemistry|engenharia|engineering/i;

export function isLanguageDiscipline(discipline) {
  return LANGUAGE_DISCIPLINE_RX.test(String(discipline || ""));
}

export function isStemDiscipline(discipline) {
  return STEM_DISCIPLINE_RX.test(String(discipline || ""));
}

function hasTextContext(step) {
  const v = step?.componentProps || {};
  if (v?.text || v?.passage || v?.paragraph) return true;
  if (typeof step?.text === "string" && step.text.trim().length > 30) return true;
  if (Array.isArray(step?.contextLines) && step.contextLines.length > 0) return true;
  return false;
}

function _wordTokens(s) {
  return String(s || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Inferência por shape do expectedAnswer.
 * Retorna o renderAs sugerido OU null quando nada bate (nesse caso o caller
 * mantém a decisão atual — geralmente MC).
 *
 * Ordem: do mais específico/seguro pro mais genérico.
 */
export function inferComponentFromAnswer(step, ctx = {}) {
  const ea = String(step?.expectedAnswer ?? "").trim();
  if (!ea) return null;
  const textBlob =
    `${step?.kc || ""} ${step?.instruction || ""} ${step?.questionText || ""}`.toLowerCase();

  if (
    /^-?\d+([.,]\d+)?$/.test(ea) &&
    /(abaco|ábaco|valor[_-]?posicional|place[_-]?value|base[_-]?(10|dez|ten)|dezenas?[_-]?(e[_-]?)?unidades?|centenas?[_-]?(dezenas?[_-]?)?unidades?|milhares?[_-]?(centenas?[_-]?)?(dezenas?[_-]?)?unidades?|(unidades?|dezenas?|centenas?|milhares?).*(numero|número|decimal|posicional))/.test(
      textBlob
    )
  ) {
    return "abacus";
  }

  if (
    /(figuras?[_-]?geometricas?|figuras?[_-]?geométricas?|geometric[_-]?shapes?|v[eé]rtices?|vertices?|lados?|arestas?|quadrado|triangulo|triângulo|circulo|círculo|hexagono|hexágono)/.test(
      textBlob
    )
  ) {
    return "geometry_shape";
  }

  // 2026-05-21 Fix A: Fração tem prioridade sobre numérico quando o KC/topic
  // indica domínio de fração. Antes, MMC/numerador novo (resposta numérica como
  // "12", "3") caía em numeric_keypad e o aluno perdia a visualização da fração.
  // Agora: se o KC/instruction mencionar fração/numerador/denominador/MMC/MDC,
  // o step recebe fraction_bar mesmo com expectedAnswer numérico.
  const isFractionDomain =
    /(fra[cç][aã]o|fracci[oó]n|fraction|numerador|denominador|numerator|denominator|mmc|mdc|lcm|gcd|m[ií]nimo[_-]?m[uú]ltiplo|m[aá]ximo[_-]?divisor)/i.test(
      textBlob
    );

  // 1. Numérico puro com unidade opcional — keypad
  // Aceita: "42", "3,14", "-5", "100%", "30°", "12 km", "0,5 L"
  if (/^-?\d+([.,]\d+)?(\s*(%|°|km|m|cm|mm|kg|g|s|h|min|L|ml|°C|°F))?$/.test(ea)) {
    if (isFractionDomain) {
      return "fraction_bar";
    }
    return "numeric_keypad";
  }

  // 2. Fração — fraction_bar
  if (/^\d+\s*\/\s*\d+$/.test(ea)) {
    return "fraction_bar";
  }

  // 3. Hora HH:MM — clock_face
  if (/^\d{1,2}:\d{2}$/.test(ea)) {
    return "clock_face";
  }

  // 4. Coordenada (x, y) — coordinate_plane
  if (/^\(?-?\d+(?:[.,]\d+)?\s*,\s*-?\d+(?:[.,]\d+)?\)?$/.test(ea)) {
    return "coordinate_plane";
  }

  // 5. Equação ("x + 5 = 10") — input construído
  // Se o KC/instruction sugere "montar/construir" → equation_builder (drag-build)
  // Caso contrário → text (input livre)
  if (/^[^=]+=[^=]+$/.test(ea) && /[a-zA-Z]/.test(ea)) {
    const blob = `${step?.kc || ""} ${step?.instruction || ""}`.toLowerCase();
    // Não usa \b porque kc tipo "kc_construir_X" tem _ que é \w
    if (
      /(monte|montar|construa|construir|escreva|escrever|build|construct|construire|construya|escriba)/.test(
        blob
      )
    ) {
      return "equation_builder";
    }
    return "text";
  }

  // 6. Sequência (3+ tokens separados por vírgula, > ou →) — drag_to_order
  // Mas NÃO confundir com listas curtas tipo "a, b". Exigir 3+ separadores OU 3+ tokens claros.
  const seqSeparators = (ea.match(/(?:,|>|->|→)/g) || []).length;
  const seqTokens = ea
    .split(/(?:,|>|->|→)/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (
    seqSeparators >= 2 &&
    seqTokens.length >= 3 &&
    /(ciclo|etapas?|processo|sequencia[_-]?visual|sequência[_-]?visual)/.test(textBlob)
  ) {
    return "image_sequence";
  }
  if (seqSeparators >= 2 && seqTokens.length >= 3) {
    return "drag_to_order";
  }

  // 7. Frase com 3-12 palavras (não numérica) — sentence_builder
  const words = _wordTokens(ea);
  const onlyLetters = /^[A-Za-zÀ-ÿ\s.,;:!?'"()-]+$/.test(ea);
  if (words.length >= 3 && words.length <= 12 && onlyLetters) {
    return "sentence_builder";
  }

  // 8. Palavra única em disciplina-linguagem — word_matcher / highlight_in_text
  if (words.length === 1 && /^[A-Za-zÀ-ÿ-]+$/.test(ea) && isLanguageDiscipline(ctx.discipline)) {
    return hasTextContext(step) ? "highlight_in_text" : "word_matcher";
  }

  // 9. Booleano (V/F, sim/não) — fica em MC mesmo (categórico genuíno)
  return null;
}

/**
 * Confiança da conversão (0..1). Quanto maior, mais seguro converter de MC pro inferido.
 */
function scoreCandidate(step, candidate, ctx) {
  if (!candidate) return 0;
  const ea = String(step?.expectedAnswer ?? "").trim();
  if (!ea) return 0;

  // Shape exatamente compatível? +0.5
  let s = 0.5;

  // KC bate com a expectativa do componente? +0.3
  const kc = String(step.kc || "").toLowerCase();
  const KC_HINTS = {
    numeric_keypad:
      /(calcul|comput|valor|resultado|quanto|how[_-]?much|how[_-]?many|cu[áa]nto|combien)/,
    fraction_bar: /(fra[cç][aã]o|fraction|fracci[oó]n|numerador|denominador)/,
    clock_face: /(hora|hour|heure|tempo|time|reloj|relogio)/,
    coordinate_plane: /(coordenad|plano|cartesian|axis|eixo)/,
    drag_to_order: /(ordenar|order|orden|ordre|sequenc|sequence|cronolog|chronolog|ordem)/,
    sentence_builder: /(frase|sentence|oracion|oration|phrase|construir|monta|build)/,
    word_matcher: /(palavra|word|palabra|mot|classe[_-]?gramat|sin[oô]nimo|antonimo)/,
    highlight_in_text: /(texto|text|passage|trecho|grifar|destacar|highlight|marcar)/,
    text: /(equa[cç][aã]o|equation|equacion|expr|express)/,
    equation_builder:
      /(montar|monte|construir|construa|build|construct|construire|equa[cç][aã]o|equation|ecuaci[oó]n|expression|expressao)/,
    cloze_test:
      /(completar|complete|cloze|preencher|fill|llenar|remplir|lacuna|blank|espacio|trou|conjuga[cç][aã]o|conjugation)/,
    diagram_labeler:
      /(rotular|label|etiquetar|nomear|partes?|regioes?|continentes?|organela|countries|regions|parties|r[ée]gions|organite)/,
    image_sequence: /(ciclo|etapas?|processo|sequencia|sequência|visual|ordenar)/,
    abacus:
      /(abaco|ábaco|valor[_-]?posicional|place[_-]?value|base[_-]?(10|dez|ten)|dezenas?[_-]?(e[_-]?)?unidades?|centenas?[_-]?(dezenas?[_-]?)?unidades?|milhares?[_-]?(centenas?[_-]?)?(dezenas?[_-]?)?unidades?|(unidades?|dezenas?|centenas?|milhares?).*(numero|número|decimal|posicional))/,
    geometry_shape:
      /(figuras?[_-]?geometricas?|figuras?[_-]?geométricas?|v[eé]rtices?|vertices?|lados?|arestas?|quadrado|triangulo|triângulo|circulo|círculo|hexagono|hexágono)/,
  };
  if (KC_HINTS[candidate] && KC_HINTS[candidate].test(kc)) s += 0.3;

  // Disciplina coerente? +0.2
  const disc = String(ctx.discipline || "").toLowerCase();
  if (candidate === "numeric_keypad" && isStemDiscipline(disc)) s += 0.2;
  else if (
    (candidate === "word_matcher" ||
      candidate === "highlight_in_text" ||
      candidate === "sentence_builder") &&
    isLanguageDiscipline(disc)
  )
    s += 0.2;
  else s += 0.1; // neutro

  return Math.min(s, 1);
}

/**
 * Builders mínimos pra construir props quando o diversifier decide converter.
 * Pequenos espelhos dos builders em ui-designer.js, mas tolerantes a vars=undefined.
 */
function _buildPropsForComponent(component, step, ctx) {
  const ea = step?.expectedAnswer;
  switch (component) {
    case "numeric_keypad": {
      const eaStr = String(ea ?? "");
      return {
        maxDigits: Math.max(eaStr.replace(/[^\d.,-]/g, "").length + 1, 3),
        allowDecimal: /[.,]/.test(eaStr),
        allowNegative: eaStr.trim().startsWith("-"),
        expectedAnswer: ea,
      };
    }
    case "fraction_bar": {
      const m = String(ea || "").match(/^(\d+)\s*\/\s*(\d+)$/);
      const context =
        `${step?.instruction || ""} ${step?.questionText || ""} ${step?.statement || ""}`
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
      const visualModel = /\b(pizza|pizzas|calabresa|mussarela)\b/.test(context)
        ? "pizza"
        : /\b(bolo|torta|circulo|circular|disco|roda)\b/.test(context)
          ? "circle"
          : "bar";
      return {
        numerator: m ? Number(m[1]) : null,
        denominator: m ? Number(m[2]) : null,
        visualModel,
        expectedAnswer: ea,
      };
    }
    case "clock_face": {
      const m = String(ea || "").match(/^(\d{1,2}):(\d{2})$/);
      return {
        hours: m ? Number(m[1]) : 3,
        minutes: m ? Number(m[2]) : 0,
        expectedAnswer: ea,
      };
    }
    case "coordinate_plane": {
      const m = String(ea || "")
        .replace(/[()]/g, "")
        .match(/^(-?\d+(?:[.,]\d+)?)\s*,\s*(-?\d+(?:[.,]\d+)?)$/);
      const x = m ? Number(String(m[1]).replace(",", ".")) : null;
      const y = m ? Number(String(m[2]).replace(",", ".")) : null;
      const range = Math.max(Math.abs(x ?? 5), Math.abs(y ?? 5)) + 2;
      return {
        targetX: x,
        targetY: y,
        min: -range,
        max: range,
        expectedAnswer: ea,
      };
    }
    case "drag_to_order": {
      const tokens = String(ea || "")
        .split(/(?:,|>|->|→)/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (tokens.length < 3) return null;
      return {
        items: tokens.map((t) => ({ value: t, label: t })),
        // 2026-07-19 (verificação EA canônico): o componente submete
        // values.join(",") — manter o EA cru ('ovo > larva > pupa') criava
        // step irrespondível que a canonicalização por vírgula não pegava.
        expectedAnswer: tokens.join(","),
      };
    }
    case "image_sequence": {
      const tokens = String(ea || "")
        .split(/(?:,|>|->|→)/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (tokens.length < 3) return null;
      return {
        title: "Sequencia visual",
        instruction: step?.instruction || "Organize as etapas na ordem correta.",
        images: tokens.map((label, index) => ({ id: `seq_${index + 1}`, label, emoji: "•" })),
        expectedAnswer: tokens.join(","), // 2026-07-19: idem drag_to_order
      };
    }
    case "abacus": {
      const parsed = Number(String(ea ?? "").replace(/[^\d.-]/g, ""));
      return { targetValue: Number.isFinite(parsed) ? parsed : null, expectedAnswer: ea };
    }
    case "geometry_shape": {
      const blob = `${step?.kc || ""} ${step?.instruction || ""} ${ea || ""}`.toLowerCase();
      let targetShape = null;
      if (/triangulo|triângulo|triangle/.test(blob)) targetShape = "triangle";
      else if (/quadrado|square/.test(blob)) targetShape = "square";
      else if (/circulo|círculo|circle/.test(blob)) targetShape = "circle";
      else if (/hexagono|hexágono|hexagon/.test(blob)) targetShape = "hexagon";
      return { targetShape, expectedAnswer: ea };
    }
    case "sentence_builder": {
      const target = String(ea || "").trim();
      const words = target.split(/\s+/).filter(Boolean);
      if (words.length < 3) return null;
      // Embaralha + adiciona 1-2 distratores curtos pra não vazar resposta
      const shuffled = [...words].sort(() => Math.random() - 0.5);
      // 2026-08-02 (painel sênior): este filtro era RAMO MORTO. As options deste
      // pipeline são objetos ({value, isCorrect}), nunca strings, então
      // `typeof o === "string"` jamais casava e `distractors` saía sempre vazio.
      // Resultado medido em historia P1S4: o wordBank era EXATAMENTE as palavras
      // do gabarito embaralhadas — o aluno não precisa saber o conteúdo, basta
      // ordenar o que está na tela, e nenhuma das 3 misconceptions declaradas
      // podia ser produzida (não há palavra errada para escolher).
      const chaveGabarito = new Set(words.map((w) => String(w).toLowerCase()));
      const opcoes = Array.isArray(ctx?.options) ? ctx.options : [];
      const valorDaOpcao = (o) => (typeof o === "string" ? o : String(o?.value ?? o?.label ?? ""));
      const distractors = opcoes
        .filter((o) => !o?.isCorrect)
        .flatMap((o) => valorDaOpcao(o).split(/\s+/))
        .map((palavra) => palavra.trim())
        .filter((palavra) => palavra && !chaveGabarito.has(palavra.toLowerCase()))
        .filter((palavra, i, todas) => todas.indexOf(palavra) === i)
        .slice(0, 2);
      return {
        wordBank: [...shuffled, ...distractors],
        targetLength: words.length,
        expectedAnswer: ea,
      };
    }
    case "word_matcher": {
      return {
        prompt: step?.questionText || step?.instruction || "",
        expectedAnswer: ea,
        // mantém options se houver — o componente WordMatcher mostra cards clicáveis
        options: Array.isArray(step?.options) ? step.options : [],
      };
    }
    case "highlight_in_text": {
      const text = step?.componentProps?.text || step?.componentProps?.passage || step?.text || "";
      if (!text || text.length < 20) return null; // sem contexto não dá
      return {
        text,
        prompt: step?.questionText || step?.instruction || "",
        expectedAnswer: ea,
        options: Array.isArray(step?.options) ? step.options : [],
      };
    }
    case "text": {
      // Input livre — frontend renderiza um campo de texto
      return {
        expectedAnswer: ea,
        placeholder:
          ctx?.outputLanguageCode === "en"
            ? "Type your answer..."
            : ctx?.outputLanguageCode === "es"
              ? "Escribe tu respuesta..."
              : ctx?.outputLanguageCode === "fr"
                ? "Écris ta réponse..."
                : "Digite sua resposta...",
      };
    }
    case "equation_builder": {
      // Tokeniza a equação esperada em peças individuais + adiciona distractors
      const expr = String(ea || "").replace(/\s+/g, "");
      if (!expr || !/[a-zA-Z]/.test(expr) || !expr.includes("=")) return null;
      // Tokeniza: separa números, letras (variáveis), e operadores
      const tokens = [];
      let i = 0;
      while (i < expr.length) {
        const c = expr[i];
        if (/\d/.test(c)) {
          let j = i;
          while (j < expr.length && /[\d.,]/.test(expr[j])) j++;
          tokens.push(expr.slice(i, j));
          i = j;
        } else if (/[a-zA-Z]/.test(c)) {
          // Variáveis tipo "x", "ab" — agrupa letras consecutivas
          let j = i;
          while (j < expr.length && /[a-zA-Z]/.test(expr[j])) j++;
          tokens.push(expr.slice(i, j));
          i = j;
        } else {
          // Operador (+, -, *, /, =, ², √, etc)
          tokens.push(c);
          i++;
        }
      }
      if (tokens.length < 3) return null;
      // Distractors: dobra alguns operadores e adiciona números próximos
      const distractors = [];
      const numTokens = tokens.filter((t) => /^\d/.test(t)).map(Number);
      if (numTokens.length > 0) {
        const maxN = Math.max(...numTokens);
        if (maxN > 1) distractors.push(String(maxN - 1));
        if (maxN < 99) distractors.push(String(maxN + 1));
      }
      if (tokens.includes("+")) distractors.push("-");
      if (tokens.includes("-")) distractors.push("+");
      // Embaralha tokens corretos com distractors
      const finalTokens = [...tokens, ...distractors].sort(() => Math.random() - 0.5);
      return {
        tokens: finalTokens,
        expectedExpression: expr,
      };
    }
    default:
      return null;
  }
}

/**
 * Coleta todos os steps do tutor com referência ao problema.
 */
function _collectAllSteps(tutor) {
  const out = [];
  for (const prob of tutor?.problems || []) {
    for (const step of prob?.steps || []) {
      out.push({ prob, step });
    }
  }
  return out;
}

function _countByRender(refs) {
  const counts = {};
  for (const { step } of refs) {
    const r = step?.renderAs || "multiple_choice";
    counts[r] = (counts[r] || 0) + 1;
  }
  return counts;
}

/**
 * Detecta se o STI é majoritariamente V/F semântico — caso em que MC é honesto
 * e o budget deve ser relaxado.
 */
function _isMostlyTrueFalse(refs) {
  if (refs.length === 0) return false;
  let tfCount = 0;
  for (const { step } of refs) {
    const opts = Array.isArray(step?.options) ? step.options : [];
    if (opts.length !== 2) continue;
    const labels = opts.map((o) => {
      if (typeof o === "string") return o.toLowerCase().trim();
      const v = o?.label || o?.text || o?.value || "";
      return String(v).toLowerCase().trim();
    });
    const isTF =
      labels.some((l) => /^(verdadeiro|true|verdadero|vrai)$/.test(l)) &&
      labels.some((l) => /^(falso|false|faux)$/.test(l));
    if (isTF) tfCount++;
  }
  return tfCount / refs.length > 0.5;
}

/**
 * Post-processor que aplica o budget de MC e converte excesso pra componentes
 * cuja inferência shape-based dá match.
 *
 * @param {object} tutor - STI completo (com problems[].steps[])
 * @param {object} opts
 * @param {number} [opts.mcBudget=0.30] - máximo de MC permitido (0..1)
 * @param {string} [opts.outputLanguageCode] - "pt-BR"|"en"|"es"|"fr"
 * @param {string} [opts.discipline] - disciplina (sobrescreve tutor.discipline)
 * @returns {object} relatório { applied, changed, before, after, mcShare, budget }
 */
export function enforceComponentDiversity(tutor, opts = {}) {
  // 2026-08-05 (modo simples): a função deste diversifier é converter MC em
  // componente rico quando o orçamento estoura — o OPOSTO do modo simples.
  // Guard central aqui cobre os 3 call sites (ui-designer, rota, structural-gate).
  // 2026-08-07 (R9BKU7, validação com participantes): este guard SOZINHO não
  // basta. Ele lia só o AsyncLocalStorage, e na geração real o contexto já
  // estava perdido quando o structural-gate chamou esta função — o diversifier
  // rebalanceou {text:2, multiple_choice:12} para
  // {geometry_shape:1, sentence_builder:2, numeric_keypad:4, ...} num STI que o
  // criador pediu simples. Agora aceita a flag EXPLÍCITA do caller (que a tem
  // de forma confiável) e o metadado do tutor como âncoras que sobrevivem à
  // perda de contexto; o ALS fica como último recurso.
  const modoSimples =
    opts.simpleInterface ?? (tutor?._metadata?.interfaceMode === "simple" || isSimpleInterface());
  if (modoSimples) {
    return { applied: false, reason: "simple-interface-mode", changed: 0, total: 0 };
  }
  const budget = Number(opts.mcBudget ?? process.env.STI_MC_BUDGET ?? DEFAULT_MC_BUDGET);
  const discipline = opts.discipline || tutor?.discipline || "";
  const outputLanguageCode = opts.outputLanguageCode || tutor?.outputLanguage || "pt-BR";

  const refs = _collectAllSteps(tutor);
  const total = refs.length;
  if (total === 0) {
    return { applied: false, reason: "no-steps", changed: 0, total: 0 };
  }

  const before = _countByRender(refs);
  const mcCount = before.multiple_choice || 0;
  const mcShareBefore = mcCount / total;

  // STIs majoritariamente V/F: relaxa budget pra 50%
  const isTfHeavy = _isMostlyTrueFalse(refs);
  const effectiveBudget = isTfHeavy ? Math.max(budget, 0.5) : budget;

  if (mcShareBefore <= effectiveBudget) {
    return {
      applied: true,
      changed: 0,
      total,
      before,
      after: before,
      mcShareBefore,
      mcShareAfter: mcShareBefore,
      budget: effectiveBudget,
      tfHeavy: isTfHeavy,
      reason: "within-budget",
    };
  }

  const targetMc = Math.floor(total * effectiveBudget);
  const toConvert = Math.max(0, mcCount - targetMc);

  // 2026-05-23: threshold adaptativo. Em STIs muito acima do budget (ex: 80% MC
  // com meta 30%), aceita candidatos com confidence menor pra forçar diversidade.
  // Lógica:
  //   - distance ≤ 0.10 (perto do budget): threshold 0.60 (estrito)
  //   - distance ≤ 0.25: threshold 0.50
  //   - distance > 0.25 (muito acima): threshold 0.40 (agressivo)
  const distance = mcShareBefore - effectiveBudget;
  let confidenceThreshold = 0.6;
  if (distance > 0.25) confidenceThreshold = 0.4;
  else if (distance > 0.1) confidenceThreshold = 0.5;

  // Ranqueia steps MC por convertibilidade (shape compatível + KC compatível + disciplina coerente)
  const ctx = { discipline, outputLanguageCode };
  const mcRefs = refs.filter((r) => (r.step?.renderAs || "multiple_choice") === "multiple_choice");
  const evaluated = mcRefs.map((r) => {
    const candidate = inferComponentFromAnswer(r.step, ctx);
    const confidence = candidate ? scoreCandidate(r.step, candidate, ctx) : 0;
    return { ...r, candidate, confidence };
  });
  const ranked = evaluated
    .filter((r) => r.candidate && r.confidence >= confidenceThreshold)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, toConvert);

  // 2026-05-23: KCs que NÃO conseguiram inferência alguma — sinaliza oportunidade
  // de criar regra nova no shape-inference ou KC_COMPONENT_RULES.
  const unconvertible = evaluated
    .filter((r) => !r.candidate || r.confidence < confidenceThreshold)
    .map((r) => ({
      kc: r.step.kc,
      expectedAnswer: String(r.step.expectedAnswer || "").slice(0, 30),
      candidate: r.candidate,
      confidence: r.confidence,
    }))
    .slice(0, 5);
  if (unconvertible.length > 0 && distance > 0.1) {
    logger.info(
      {
        module: "diversifier",
        phase: "unconvertible-mc",
        thresholdUsed: confidenceThreshold,
        unconvertible,
      },
      "MCs que não conseguiram conversão — candidatos pra novas regras de inferência"
    );
  }

  let changed = 0;
  for (const { step, candidate } of ranked) {
    const props = _buildPropsForComponent(candidate, step, ctx);
    if (!props) continue;
    const allowed = _contractAllowsConversion(candidate, step);
    if (allowed !== true) {
      logger.info(
        {
          module: "diversifier",
          phase: "contract-reject",
          candidate,
          stepId: step.id,
          kc: step.kc,
          reason: allowed.reason,
        },
        "Conversão abortada — answerContract incompatível com o EA"
      );
      continue;
    }
    step.renderAs = candidate;
    // preserva componentProps existente + sobrescreve com inferidos
    step.componentProps = { ...(step.componentProps || {}), ...props };
    // pra rich/text que não usam options, esvazia (evita contaminação visual)
    if (
      candidate !== "multiple_choice" &&
      candidate !== "word_matcher" &&
      candidate !== "highlight_in_text"
    ) {
      _preserveBehaviorMisconceptions(step);
      step.options = [];
    }
    changed++;
  }

  const after = _countByRender(refs);
  const mcShareAfter = (after.multiple_choice || 0) / total;

  logger.info(
    {
      module: "diversifier",
      mcSharePctBefore: Math.round(mcShareBefore * 100),
      mcSharePctAfter: Math.round(mcShareAfter * 100),
      changed,
      toConvert,
      budget: effectiveBudget,
      tfHeavy: isTfHeavy,
      confidenceThreshold,
      distanceFromBudget: Math.round(distance * 100) / 100,
    },
    "Diversifier applied"
  );

  return {
    applied: true,
    changed,
    total,
    before,
    after,
    mcShareBefore,
    mcShareAfter,
    budget: effectiveBudget,
    tfHeavy: isTfHeavy,
    reason: changed > 0 ? "rebalanced" : "no-convertible-candidates",
  };
}

/**
 * Helper conveniente pra usar nos pontos de fallback do pipeline. Se receber
 * um step e ele iria virar MC, tenta inferir um componente melhor PRIMEIRO.
 *
 * @returns {{ renderAs: string, componentProps: object } | null}
 */
export function tryInferRichRenderForStep(step, ctx = {}) {
  // 2026-08-05 (modo simples): inferir rico pela forma da resposta é
  // reintrodução — ensureLegacyOptions (agent6-story) e os demais chamadores
  // devem seguir direto pro caminho MC/text.
  if (isSimpleInterface()) return null;
  const candidate = inferComponentFromAnswer(step, ctx);
  if (!candidate) return null;
  const props = _buildPropsForComponent(candidate, step, ctx);
  if (!props) return null;
  if (_contractAllowsConversion(candidate, step) !== true) return null;
  return { renderAs: candidate, componentProps: props };
}
