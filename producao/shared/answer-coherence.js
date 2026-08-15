/**
 * shared/answer-coherence.js — a explicação do passo enuncia o gabarito?
 *
 * 2026-08-09 (auditoria de conformidade STI). Achado que motivou o módulo, numa
 * geração REAL de produção:
 *
 *   instrução  : "Use os blocos para trocar uma dezena de 74 por 10 unidades.
 *                 Quantas dezenas ficam?"
 *   gabarito   : "74"
 *   explicação : "Uma das 7 dezenas foi trocada... permanecem 6 dezenas..."
 *
 * O gabarito contradiz a explicação do próprio passo: quem responder 6, que é o
 * certo segundo a explicação, é marcado como errado. Isso passou por TODOS os
 * gates, porque o fact-checker só verifica aritmética de dois operandos
 * derivada do enunciado e nada olhava a coerência interna do passo.
 *
 * A régua aqui é deliberadamente CONSERVADORA e não tenta julgar matemática.
 * Ela só pergunta: numa pergunta de quantidade com gabarito numérico, o número
 * do gabarito aparece na explicação? Se não aparece, ou a explicação é de outro
 * passo, ou ela não responde à pergunta.
 *
 * Precisão medida sobre os 2.891 passos publicados: 271 candidatos, e a versão
 * ingênua (só dígitos) acusava 28 com ~60% de falso positivo. Cada forma de
 * escrever o mesmo número que aparecia nos falsos positivos virou uma regra de
 * equivalência abaixo — sinal unicode, número por extenso, "nenhum", e
 * decomposição posicional ("1 dezena e 5 unidades" = 15). Sobram ~8 casos, e a
 * inspeção manual deles mostrou defeito real em todos: explicação de
 * multiplicação colada em passo de subtração, explicação tautológica que nunca
 * diz o valor, explicação que descreve a coluna errada.
 */

/** Números por extenso que aparecem de fato em explicações do corpus (0-20). */
const POR_EXTENSO = Object.freeze({
  nenhum: 0,
  nenhuma: 0,
  zero: 0,
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  quatorze: 14,
  catorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezessete: 17,
  dezoito: 18,
  dezenove: 19,
  vinte: 20,
  // es / en / fr, porque o corpus é multilíngue
  ninguno: 0,
  ninguna: 0,
  uno: 1,
  cero: 0,
  none: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  aucun: 0,
  aucune: 0,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
  sept: 7,
  huit: 8,
  neuf: 9,
  dix: 10,
});

/** Pergunta que espera uma QUANTIDADE como resposta. */
const PERGUNTA_DE_QUANTIDADE =
  /quant[oa]s?\b|qual (?:e|é) o (?:total|numero|número|valor|resultado)|cu[aá]nt[oa]s?\b|how many\b|combien\b/i;

function semAcento(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** O sinal de menos tipográfico (U+2212) e os travessões quebram parseFloat. */
function comMenosAscii(value) {
  return String(value ?? "").replace(/[−–—]/g, "-");
}

/** Converte para número apenas se a string INTEIRA for um escalar. */
export function escalarNumerico(value) {
  const texto = comMenosAscii(value).trim().replace(",", ".");
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(texto)) return null;
  const numero = Number(texto);
  return Number.isFinite(numero) ? numero : null;
}

export function ehPerguntaDeQuantidade(instruction) {
  return PERGUNTA_DE_QUANTIDADE.test(String(instruction ?? ""));
}

/**
 * Todos os números que a explicação enuncia, em qualquer forma que o corpus
 * usa: dígito, extenso, e decomposição posicional.
 */
export function numerosEnunciados(explanation) {
  const bruto = comMenosAscii(explanation);
  const normalizado = semAcento(bruto);
  const encontrados = new Set();

  for (const m of bruto.matchAll(/-?\d+(?:[.,]\d+)?/g)) {
    const n = Number(m[0].replace(",", "."));
    if (Number.isFinite(n)) encontrados.add(n);
  }

  for (const palavra of normalizado.split(/[^a-z]+/)) {
    if (palavra && Object.hasOwn(POR_EXTENSO, palavra)) encontrados.add(POR_EXTENSO[palavra]);
  }

  // "1 dezena e 5 unidades" descreve 15 sem nunca escrever 15.
  for (const m of normalizado.matchAll(/(\d+)\s*dezenas?\s*(?:e\s+)?(\d+)\s*unidades?/g)) {
    encontrados.add(Number(m[1]) * 10 + Number(m[2]));
  }
  for (const m of normalizado.matchAll(
    /(\d+)\s*centenas?[^.]{0,24}?(\d+)\s*dezenas?[^.]{0,24}?(\d+)\s*unidades?/g
  )) {
    encontrados.add(Number(m[1]) * 100 + Number(m[2]) * 10 + Number(m[3]));
  }

  return encontrados;
}

/**
 * Verdadeiro quando o passo é AUDITÁVEL por esta régua e a explicação NÃO
 * enuncia o gabarito. Retorna false para tudo que estiver fora do escopo
 * (sem explicação, gabarito não numérico, pergunta que não é de quantidade):
 * a régua prefere calar a acusar.
 */
export function explicacaoNaoEnunciaGabarito(step) {
  const explicacao = String(step?.explanation ?? "").trim();
  if (!explicacao) return false;
  if (!ehPerguntaDeQuantidade(step?.instruction)) return false;

  const gabarito = escalarNumerico(step?.expectedAnswer);
  if (gabarito === null) return false;

  return !numerosEnunciados(explicacao).has(gabarito);
}
