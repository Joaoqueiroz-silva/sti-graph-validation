/**
 * Reparo determinístico de distratores numéricos em contagem geométrica.
 *
 * Um gabarito numérico não implica uma operação aritmética. Em passos como
 * "quantos lados/vértices?", o erro observável é omitir ou repetir elementos
 * durante o percurso da figura. Este módulo mantém essa distinção em um único
 * lugar para o reviewer e para o quality gate.
 */

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stepSemanticText(step) {
  return normalizeText(
    [
      step?.instruction,
      step?.questionText,
      step?.question,
      step?.operation,
      step?.kc,
      step?.componentProps?.question,
      step?.componentProps?.pedagogy?.action,
      step?.componentProps?.pedagogy?.rationale,
      step?.uiPedagogy?.action,
      step?.uiPedagogy?.rationale,
    ]
      .filter(Boolean)
      .join(" ")
  );
}

export function geometryCountingTarget(step) {
  const text = stepSemanticText(step);
  if (!text) return null;
  const asksForCount =
    /\b(quantos|quantas|conte|contar|contagem|numero de|how many|count|cuantos|cuantas)\b/.test(
      text
    );
  const hasGeometryContext =
    /\b(geometr|figura|forma|poligono|triangulo|quadrado|retangulo|pentagono|hexagono|octogono|circulo|contorno|segmento de reta|plane shape|geometric shape|polygon|triangle|square|rectangle|pentagon|hexagon)\w*/.test(
      text
    );
  if (!asksForCount || !hasGeometryContext) return null;

  if (/\b(vertice|vertices|canto|cantos|quina|quinas|vertex|corner|corners)\b/.test(text)) {
    return "vertices";
  }
  if (/\b(lado|lados|segmento|segmentos|side|sides)\b/.test(text)) return "lados";
  return null;
}

function numericValue(value) {
  const normalized = String(value ?? "")
    .trim()
    .replace(",", ".");
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function geometryCuePattern(target) {
  return target === "vertices"
    ? /\b(vertic|canto|quina|ponta|figura|poligono|contorno|marc|percorr|repet|recont|omit|ponto inicial)\w*/
    : /\b(lado|segmento|borda|figura|poligono|contorno|marc|percorr|repet|recont|omit|ponto inicial)\w*/;
}

export function geometryCountingFeedbackIsOutOfDomain(feedback) {
  const text = normalizeText(feedback);
  return /\b(ordem das operacoes|sinais?.{0,24}(?:operac|positivo|negativo)|positivo\s*\/\s*negativo|calculo passou de uma etapa|refaca a conta|operacao certa|todos os dados do enunciado)\b/.test(
    text
  );
}

export function geometryCountingFeedbackIsGeneric(feedback) {
  const text = normalizeText(feedback);
  return /^(boa tentativa|continue tentando|incorreto|nao e isso|nao e por ai|ops|quase|resposta incorreta|revise e tente novamente|tente novamente|tente outra vez|incorrect|not quite|try again)[.! ]*$/.test(
    text
  );
}

export function geometryCountingFeedbackForOption(step, expectedAnswer, optionValue, idx = 0) {
  const target = geometryCountingTarget(step);
  const expected = numericValue(expectedAnswer);
  const option = numericValue(optionValue);
  if (!target || expected == null || option == null || option === expected) return null;

  const magnitude = Math.max(1, Math.round(Math.abs(option - expected)));
  const direction = option < expected ? "omitted" : "repeated";
  const misconceptionId = `misc_geometry_count_${target}_${direction}_${magnitude}`;

  if (target === "vertices") {
    return {
      misconceptionId,
      misconceptionType: "procedural_error",
      feedback:
        option < expected
          ? "Boa tentativa! Percorra todos os vértices da figura e marque cada canto; confira se algum ficou sem contar."
          : "Quase! Marque o vértice inicial e pare ao voltar a ele, para não repetir nenhum canto na contagem.",
    };
  }

  const sideFeedbacks = [
    option < expected
      ? "Boa tentativa! Percorra todo o contorno lado a lado e marque cada segmento; confira se algum ficou sem contar."
      : "Quase! Marque o lado inicial e pare ao voltar a ele, para não repetir nenhum lado na contagem.",
    option < expected
      ? "Quase! Siga a borda da figura em um único sentido e marque os lados contados para não omitir nenhum segmento."
      : "Boa tentativa! Percorra o contorno uma só vez e marque cada lado; não conte novamente o segmento inicial.",
  ];
  return {
    misconceptionId,
    misconceptionType: "procedural_error",
    feedback: sideFeedbacks[Math.abs(idx) % sideFeedbacks.length],
  };
}

export function inspectGeometryCountingFeedbacks(step, targetOverride = null) {
  const target = targetOverride || geometryCountingTarget(step);
  if (!target) return { target: null, feedbacks: [], outOfDomain: [], genericOnly: false };
  const expected = numericValue(step?.expectedAnswer);
  if (expected == null) {
    return { target, feedbacks: [], outOfDomain: [], genericOnly: false };
  }

  const feedbacks = (Array.isArray(step?.options) ? step.options : [])
    .filter(
      (option) =>
        option?.isCorrect === false &&
        numericValue(option?.value ?? option?.label) != null &&
        option?.feedback
    )
    .map((option) => String(option.feedback));
  const geometryCue = geometryCuePattern(target);
  const outOfDomain = feedbacks.filter(
    (feedback) =>
      geometryCountingFeedbackIsOutOfDomain(feedback) && !geometryCue.test(normalizeText(feedback))
  );
  return {
    target,
    feedbacks,
    outOfDomain,
    genericOnly:
      feedbacks.length >= 2 &&
      feedbacks.every((feedback) => geometryCountingFeedbackIsGeneric(feedback)),
  };
}

export function repairGeometryCountingOptions(
  step,
  expectedAnswer = step?.expectedAnswer,
  { label = step?.id || "step", corrections = [] } = {}
) {
  const target = geometryCountingTarget(step);
  if (!target || !Array.isArray(step?.options)) return 0;

  let fixed = 0;
  const geometryCue = geometryCuePattern(target);
  for (const [idx, option] of step.options.entries()) {
    if (!option || option.isCorrect === true) continue;
    const remediation = geometryCountingFeedbackForOption(
      step,
      expectedAnswer,
      option.value ?? option.label,
      idx
    );
    if (!remediation) continue;

    let changed = false;
    if (
      !option.misconceptionId ||
      /^(misc_numeric_near|misc_unclassified|misc_generic_)/.test(option.misconceptionId)
    ) {
      option.misconceptionId = remediation.misconceptionId;
      option.misconceptionType = remediation.misconceptionType;
      changed = true;
    }

    const feedback = normalizeText(option.feedback);
    if (!feedback || geometryCountingFeedbackIsGeneric(feedback) || !geometryCue.test(feedback)) {
      option.feedback = remediation.feedback;
      changed = true;
    }

    if (changed) {
      corrections.push(`${label}: distrator de contagem geométrica reparado (${option.value})`);
      fixed++;
    }
  }
  return fixed;
}
