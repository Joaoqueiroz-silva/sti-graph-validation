/** Detecção conservadora de gabarito exposto em pistas progressivas. */

function normalize(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[−–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function canonicalNumberToken(value) {
  let token = String(value || "").replace(/\s+/g, "");
  const comma = token.lastIndexOf(",");
  const dot = token.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? "," : ".";
    const thousands = decimal === "," ? "." : ",";
    token = token.split(thousands).join("");
    if (decimal === ",") token = token.replace(",", ".");
  } else if (comma >= 0) {
    token = token.replace(",", ".");
  }
  const number = Number(token);
  return Number.isFinite(number) ? number : null;
}

export function hintRevealsExpectedAnswer(message, expectedAnswer) {
  const hint = normalize(message);
  const answer = normalize(expectedAnswer);
  if (!hint || !answer) return false;

  const expectedNumbers = answer.match(/[+-]?(?:\d[\d.,]*\d|\d|[.,]\d+)/g) || [];
  if (expectedNumbers.length === 1) {
    const expectedNumber = canonicalNumberToken(expectedNumbers[0]);
    const hintNumbers = hint.match(/[+-]?(?:\d[\d.,]*\d|\d|[.,]\d+)/g) || [];
    if (
      expectedNumber !== null &&
      hintNumbers.some((token) => canonicalNumberToken(token) === expectedNumber)
    ) {
      return true;
    }
  }

  // Palavras muito curtas/ambíguas aparecem naturalmente em frases ("assim",
  // "no modelo"). Só contam como vazamento quando há uma marca explícita de
  // resposta, evitando falsos positivos que degradariam boas pistas.
  // 2026-08-06 (STI de ingles "a/an" rejeitado): a regra abaixo so cobria
  // sim/nao/yes, mas o mesmo falso positivo vale para QUALQUER gabarito curto
  // que tambem seja palavra comum do idioma da pista. Caso real: gabarito "a"
  // (o artigo em ingles) e pista em portugues "identifique A relacao conceitual
  // que ele pede" — a pista nao revela nada, mas o casamento por palavra
  // acusava vazamento e o quality-gate REJEITAVA a geracao inteira.
  // Gabarito numerico nao passa por aqui: o ramo de numeros acima ja decidiu.
  const AMBIGUO_EM_PROSA = new Set([
    "sim",
    "nao",
    "no",
    "si",
    "yes",
    "a",
    "an",
    "o",
    "os",
    "as",
    "e",
    "de",
    "da",
    "do",
    "um",
    "uma",
    "the",
  ]);
  if (AMBIGUO_EM_PROSA.has(answer) || answer.length <= 2) {
    const cue =
      /(?:resposta|gabarito|answer|respuesta|correto|correcta?|correta?)\s*(?:e|is|es)?\s*:?\s*$/;
    const prefix = hint.slice(0, Math.max(0, hint.lastIndexOf(answer)));
    return cue.test(prefix);
  }

  const pattern = new RegExp(`(?:^|[^a-z0-9])${escapeRegex(answer)}(?=$|[^a-z0-9])`, "i");
  return pattern.test(hint);
}
