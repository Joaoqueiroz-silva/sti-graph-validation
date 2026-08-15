/**
 * answer-shape.js — classifica o "shape lógico" da resposta esperada de um step.
 *
 * Usado pelo component-router pra validar se um componente é compatível com a
 * pergunta (via answerContract no manifest). Sem isso, o router pode escolher
 * geometry_shape pra step com expectedAnswer="5" — comparação sempre falsa.
 *
 * Output:
 *   { kind: "...", confidence: 0..1, metadata: {...} }
 *
 * Kinds reconhecidos (mantém em sync com answerContract.accepts dos manifests):
 *   numeric-pure         — só dígitos, opcional sinal/decimal. Ex: "5", "12.5", "-3"
 *   numeric-with-unit    — número com unidade. Ex: "30 lados", "5 cm"
 *   shape-name           — nome de figura geométrica. Ex: "hexagono", "triangulo"
 *   sequence             — lista ordenada (CSV ou ordenado por |). Ex: "1,2,3", "A->B->C"
 *   coordinate           — par (x,y). Ex: "(3,4)", "3;4"
 *   fraction             — fração. Ex: "1/2", "3/4"
 *   expression           — expressão matemática. Ex: "2x+3=11", "x=4"
 *   time                 — hora. Ex: "10:30", "08h15"
 *   boolean              — verdadeiro/falso, sim/não.
 *   ok-token             — token interno de conclusão para labs. Ex: "ok", "acertou"
 *   mapping-pairs        — mapeamento de pares/categorias. Ex: "a<>b;c<>d", "card=>grupo"
 *   text-short           — texto curto (1-3 palavras), não numérico, não shape.
 *   text-long            — texto livre (>3 palavras).
 *   unknown              — não identificado.
 */

const SHAPE_NAMES = new Set([
  "circulo",
  "círculo",
  "triangulo",
  "triângulo",
  "quadrado",
  "retangulo",
  "retângulo",
  "pentagono",
  "pentágono",
  "hexagono",
  "hexágono",
  "heptagono",
  "heptágono",
  "octogono",
  "octógono",
  "losango",
  "trapezio",
  "trapézio",
  "paralelogramo",
  "circle",
  "triangle",
  "square",
  "rectangle",
  "pentagon",
  "hexagon",
]);

const BOOLEAN_VALUES = new Set([
  "verdadeiro",
  "falso",
  "sim",
  "nao",
  "si",
  "sí",
  "verdadero",
  "verdadera",
  "vrai",
  "faux",
  "não",
  "true",
  "false",
  "yes",
  "no",
  "v",
  "f",
]);

const OK_TOKEN_VALUES = new Set([
  "ok",
  "okay",
  "acertou",
  "completo",
  "concluido",
  "concluído",
  "complete",
  "completed",
  "done",
]);

function _normalize(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// Formatos localizados aceitos: 36,75; 36.75; 1.234,56; 1,234.56 e 1 234,56.
// A classificação só precisa reconhecer o shape; a equivalência numérica final
// é tratada pelo parser locale-aware do frontend.
const LOCALIZED_NUMBER_COMPACT_RE =
  /^[+-]?(?:\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d{1,3}(?:\s\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)$/;
const CURRENCY_TOKEN_RE = /(?:R\$|US\$|CA\$|A\$|BRL|USD|EUR|GBP|JPY|[$€£¥₽₹])/i;

function _isLocalizedNumber(value) {
  return LOCALIZED_NUMBER_COMPACT_RE.test(String(value || "").trim());
}

function _parseLocalizedNumber(value) {
  let compact = String(value || "")
    .trim()
    .replace(/\s+/g, "");
  const lastComma = compact.lastIndexOf(",");
  const lastDot = compact.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) compact = compact.replace(/\./g, "").replace(",", ".");
    else compact = compact.replace(/,/g, "");
  } else if (lastComma >= 0) {
    compact = compact.replace(",", ".");
  }
  const parsed = Number(compact);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Classifica o shape do expectedAnswer do step.
 * @param {Object} step — { expectedAnswer, instruction, kc, ... }
 * @returns {{ kind: string, confidence: number, metadata: Object }}
 */
export function analyzeAnswerShape(step) {
  const ea = step?.expectedAnswer;
  const eaStr = ea == null ? "" : String(ea).trim();

  // Vazio / null → unknown
  if (!eaStr) {
    return { kind: "unknown", confidence: 0, metadata: { reason: "empty-ea" } };
  }

  const norm = _normalize(eaStr);

  // 0. ok-token: internal completion token used by lab components.
  if (OK_TOKEN_VALUES.has(norm)) {
    return { kind: "ok-token", confidence: 1.0, metadata: { value: norm } };
  }

  // 1. boolean (V/F, sim/não)
  if (BOOLEAN_VALUES.has(norm)) {
    return { kind: "boolean", confidence: 0.95, metadata: { value: norm } };
  }

  // 1.5. mapping-pairs: answer strings emitted by v2 matching/card-sort.
  if (
    /(?:<>|=>)/.test(eaStr) &&
    eaStr
      .split(/\s*;\s*/)
      .filter(Boolean)
      .every((part) => /^[^<>;=]+(?:<>|=>)[^<>;=]+$/.test(part.trim()))
  ) {
    const relation = eaStr.includes("<>") ? "pair" : "category";
    const count = eaStr.split(/\s*;\s*/).filter(Boolean).length;
    return { kind: "mapping-pairs", confidence: 1.0, metadata: { relation, count } };
  }

  // 2. numeric-pure: só dígitos, sinal opcional, ponto/vírgula decimal
  // 1.6. assignment-map: answer strings emitted by diagram_labeler/timeline_constructor.
  // Requires 2+ assignments to avoid confusing simple equations such as x=5.
  if (
    eaStr.includes("=") &&
    eaStr.includes(";") &&
    eaStr
      .split(/\s*;\s*/)
      .filter(Boolean)
      .every((part) => /^[^<>;=]+=[^<>;=]+$/.test(part.trim()))
  ) {
    const count = eaStr.split(/\s*;\s*/).filter(Boolean).length;
    return { kind: "assignment-map", confidence: 1.0, metadata: { count } };
  }

  // 1.7. edge-map: answer strings emitted by concept_map.
  if (
    /--.+?-->/.test(eaStr) &&
    eaStr
      .split(/\s*;\s*/)
      .filter(Boolean)
      .every((part) => /^[^;]+--[^;]+-->[^;]+$/.test(part.trim()))
  ) {
    const count = eaStr.split(/\s*;\s*/).filter(Boolean).length;
    return { kind: "edge-map", confidence: 1.0, metadata: { count } };
  }

  // Moeda também é resposta numérica com unidade, mesmo quando o símbolo vem
  // antes do valor ("R$ 36,75", "$36.75", "EUR 12,50"). Deve ser detectada
  // antes de text-short para o router escolher numeric_keypad.
  const currencyToken = eaStr.match(CURRENCY_TOKEN_RE)?.[0] || null;
  if (currencyToken) {
    const numericPart = eaStr.replace(currencyToken, "").replace(/\s+/g, "");
    if (_isLocalizedNumber(numericPart)) {
      return {
        kind: "numeric-with-unit",
        confidence: 0.98,
        metadata: {
          value: _parseLocalizedNumber(numericPart),
          unit: currencyToken,
          unitPosition: eaStr.indexOf(currencyToken) < eaStr.search(/\d/) ? "prefix" : "suffix",
        },
      };
    }
  }

  if (_isLocalizedNumber(eaStr)) {
    const num = _parseLocalizedNumber(eaStr);
    return {
      kind: "numeric-pure",
      confidence: 1.0,
      metadata: { value: num, isInteger: Number.isInteger(num) },
    };
  }

  // 3. coordinate: (x,y) ou (x;y)
  if (/^\(?\s*-?\d+([.,]\d+)?\s*[,;]\s*-?\d+([.,]\d+)?\s*\)?$/.test(eaStr)) {
    return { kind: "coordinate", confidence: 0.95, metadata: {} };
  }

  // 4. fraction: a/b
  if (/^-?\d+\s*\/\s*\d+$/.test(eaStr)) {
    return { kind: "fraction", confidence: 0.95, metadata: {} };
  }

  // 5. time: hh:mm ou hh"h"mm
  if (/^\d{1,2}\s*[:hH]\s*\d{2}$/.test(eaStr)) {
    return { kind: "time", confidence: 0.95, metadata: {} };
  }

  // 6. shape-name: bate com whitelist
  if (SHAPE_NAMES.has(norm)) {
    return { kind: "shape-name", confidence: 0.95, metadata: { canonical: norm } };
  }

  // 7. numeric-with-unit: começa com número e termina com UMA unidade
  //    "30 lados", "5 cm", "12 km", "5 m/s"
  //
  // 2026-08-05 (bateria Química, "Detetives do pH" P4/step_2): a regra aceitava
  // QUALQUER cauda ("10,5 acima de 7" → numeric-with-unit → numeric_keypad),
  // e o aluno recebia um teclado numérico incapaz de digitar o gabarito — o
  // passo era impossível de acertar. Unidade real é UM token ("cm", "lados",
  // "m/s"); cauda com 2+ palavras é prosa e segue pra text-short.
  if (/^-?\d+([.,]\d+)?\s+\S+/.test(eaStr) && eaStr.length < 30) {
    const cauda = eaStr.replace(/^-?\d+([.,]\d+)?\s+/, "").trim();
    const tokensDaCauda = cauda.split(/\s+/).filter(Boolean);
    if (tokensDaCauda.length === 1) {
      const numMatch = eaStr.match(/^(-?\d+([.,]\d+)?)/);
      return {
        kind: "numeric-with-unit",
        confidence: 0.85,
        metadata: { value: numMatch ? parseFloat(numMatch[1].replace(",", ".")) : null },
      };
    }
  }

  // 8. expression: operador matemático usado de forma matemática (não prosa).
  //    Aceita "2x+3=11", "x=4", "y > 5", "b²-4ac"; rejeita substantivos compostos
  //    ("lobos-guará", "couve-flor") e frases que só contêm hífen/vírgula.
  //    O hífen NÃO entra na classe de operadores: em pt-BR ele é hífen de composto
  //    com muito mais frequência do que sinal de menos. Só conta como menos quando
  //    está adjacente a um dígito ("b²-4ac", "5-3").
  {
    const hasEquality = /[=<>]/.test(eaStr);
    const hasHardOp = /[+*/^²√]/.test(eaStr);
    const hasNumericMinus = /\d\s*-|-\s*\d/.test(eaStr);
    const isLetterHyphenCompound = /[a-zà-ÿ]-[a-zà-ÿ]/i.test(eaStr) && !/\d/.test(eaStr);
    const wordCount = eaStr.split(/\s+/).filter(Boolean).length;
    if (
      (hasEquality || hasHardOp || hasNumericMinus) &&
      /[a-z0-9]/i.test(eaStr) &&
      wordCount <= 5 &&
      !isLetterHyphenCompound
    ) {
      return { kind: "expression", confidence: 0.8, metadata: {} };
    }
  }

  // 9. sequence: vírgulas ou seta entre tokens
  //    "1,2,3", "evaporacao,condensacao,precipitacao", "A -> B -> C"
  if (/(.+?[,;]\s*){2,}/.test(eaStr) || /\s*(->|→)\s*/.test(eaStr)) {
    const tokens = eaStr.split(/\s*(?:,|;|->|→)\s*/).filter(Boolean);
    if (tokens.length >= 2) {
      return { kind: "sequence", confidence: 0.85, metadata: { length: tokens.length } };
    }
  }

  // 10. text-short vs text-long
  const wordCount = eaStr.split(/\s+/).filter(Boolean).length;
  if (wordCount <= 3) {
    return { kind: "text-short", confidence: 0.7, metadata: { wordCount } };
  }
  return { kind: "text-long", confidence: 0.7, metadata: { wordCount } };
}

/**
 * Verifica se um componente é compatível com a resposta esperada do step.
 * Retorna { ok, reason } pra o router rejeitar candidatos incompatíveis.
 *
 * @param {Object} manifest — entrada do registry com answerContract opcional
 * @param {Object} step — step do STI
 * @param {Object} [shapeCache] — resultado de analyzeAnswerShape (evita recomputar)
 */
export function checkAnswerCompatibility(manifest, step, shapeCache) {
  const contract = manifest?.answerContract;
  // Sem contrato declarado → assume compatível (não bloqueia componentes legados)
  if (!contract) return { ok: true, reason: "no-contract" };

  const shape = shapeCache || analyzeAnswerShape(step);

  // Reject explícito → bloqueia
  if (Array.isArray(contract.rejects) && contract.rejects.includes(shape.kind)) {
    return { ok: false, reason: `rejects:${shape.kind}` };
  }
  // Accept lista declarada → precisa estar nela
  if (Array.isArray(contract.accepts) && contract.accepts.length > 0) {
    if (!contract.accepts.includes(shape.kind)) {
      return { ok: false, reason: `not-in-accepts:${shape.kind}` };
    }
  }
  // answerSchema regex → testa o ea contra
  if (contract.answerSchema instanceof RegExp) {
    if (!contract.answerSchema.test(String(step.expectedAnswer || ""))) {
      return { ok: false, reason: "schema-mismatch" };
    }
  }

  // pedagogicalGuard.notWhen → bloqueia em contextos específicos
  const guards = manifest?.pedagogicalGuard?.notWhen;
  if (Array.isArray(guards)) {
    const blob = `${step.kc || ""} ${step.instruction || ""}`;
    for (const g of guards) {
      // 2026-08-03: um guard textual pode declarar formas de resposta ISENTAS.
      // Caso real: o guard do fraction_bar dispara com a palavra "denominador"
      // na instrução ("Monte a fração equivalente a 1/2 com o denominador 6"),
      // mas quando o gabarito É a fração inteira a barra CONSTRÓI a resposta —
      // não a entrega. Sem a isenção, skeletons de fração saíam 20/20 em
      // numeric_keypad e o quality gate exigia a interface que o router recusou.
      if (Array.isArray(g.unlessAnswerKind) && g.unlessAnswerKind.includes(shape.kind)) {
        continue;
      }
      if (g.instructionMatches instanceof RegExp && g.instructionMatches.test(blob)) {
        return { ok: false, reason: `guard:${g.reason || "matched"}` };
      }
    }
  }

  return { ok: true, reason: `accepted:${shape.kind}` };
}
