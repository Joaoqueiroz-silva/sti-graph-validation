/**
 * Régua de FORMATO DE RESPOSTA, compartilhada entre a pipeline e o auditor.
 *
 * 2026-08-02 (auditoria): a pipeline vinha aceitando `wrongAnswer` preenchido com
 * a DESCRIÇÃO do erro em vez da resposta errada que o aluno digitaria:
 *
 *   expectedAnswer: "12,75"
 *   wrongAnswer:    "Resultado desalinhado em ordens de grandeza na coluna decimal"
 *   wrongAnswer:    "Comparou apenas R$ {B} com R$ {A}"
 *
 * O diagnóstico só dispara se a string literal for submetida, o que nenhum aluno
 * faz — então o STI carregava um catálogo de misconceptions que na prática nunca
 * diagnosticava nada. Pior: uma sonda de runtime ingênua APROVA esses casos, porque
 * submeter a própria string sempre casa.
 *
 * A raiz é conhecida e não tem conserto programático: os seeds do agente 2 são
 * templates com slots {A}..{E}, e o problema materializado é REESCRITO pelo LLM
 * (o cenário muda de "cadernos e canetas" para "farinha e leite"), sem mapa de
 * bindings. Não dá para resolver {B} depois do fato. O que dá é não deixar o
 * diagnóstico morto entrar no grafo, e MEDIR quanto disso a geração produziu —
 * o padrão que o CLAUDE.md prescreve para compliance estocástica de prompt:
 * regra forte no prompt do worker MAIS medição no gate.
 *
 * Este módulo é a única definição da régua, de propósito: o auditor precisa medir
 * exatamente aquilo que o compilador impõe.
 */

const UNIDADES =
  /r\$|\breais?\b|\bcentavos?\b|%|°|\bcm\b|\bmm\b|\bm\b|\bkm\b|\bg\b|\bkg\b|\bl\b|\bml\b|\bh\b|\bmin\b|\bs\b/g;

export function normalizeShapeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function contaPalavras(value) {
  return normalizeShapeText(value).split(/\s+/).filter(Boolean).length;
}

/** Um valor que o aluno digitaria num campo numérico, com ou sem unidade. */
export function isNumericAnswer(value) {
  const limpo = normalizeShapeText(value).replace(UNIDADES, "").trim();
  return limpo !== "" && /^[+-]?\d[\d.,\s]*$/.test(limpo);
}

/**
 * Devolve o motivo pelo qual `wrongAnswer` não tem o formato de uma resposta ao
 * mesmo passo que espera `expectedAnswer`, ou null quando está alinhado.
 *
 * A régua é RELATIVA ao gabarito: uma sequência de ordenação tem muitas palavras
 * e é legítima quando o gabarito também é uma sequência; a mesma cadeia é prosa
 * quando o gabarito é "12,75".
 */
export function answerShapeMismatch(wrongAnswer, expectedAnswer) {
  const wrong = String(wrongAnswer ?? "").trim();
  const expected = String(expectedAnswer ?? "").trim();
  if (!wrong || !expected) return null;

  if (isNumericAnswer(expected) && !isNumericAnswer(wrong)) {
    return "o gabarito é um valor numérico, mas o erro previsto não é um valor que o aluno digitaria";
  }

  const teto = Math.max(6, contaPalavras(expected) * 2);
  if (contaPalavras(wrong) > teto) {
    return "o erro previsto é uma descrição em prosa, não uma resposta que o aluno produziria";
  }

  return null;
}

/** Atalho booleano para os guards da pipeline. */
export function isAnswerShaped(wrongAnswer, expectedAnswer) {
  return answerShapeMismatch(wrongAnswer, expectedAnswer) == null;
}

/**
 * O aluno consegue DIGITAR este gabarito?
 *
 * 2026-08-02 (auditoria de interface): a pipeline decide a resposta antes da
 * interface, então o agente 6 às vezes escreve uma pergunta dissertativa e o
 * passo cai num campo de texto livre com um gabarito impossível de produzir:
 *
 *   "S₀ = 15 km e S = 96 km"  (expressão a transcrever)
 *   "Afastou os cafeicultores escravistas e retirou a sustentação..." (frase)
 *
 * Ninguém digita isso caractere a caractere. Quando o gabarito não é digitável,
 * a resposta tem que ser SELECIONADA ou MONTADA — que é o que o CTAT faz.
 *
 * Devolve o motivo da impossibilidade, ou null quando o gabarito é digitável.
 */
export function typedAnswerObstacle(expectedAnswer, { maxPalavras = 5 } = {}) {
  const expected = String(expectedAnswer ?? "").trim();
  if (!expected) return null;

  const n = normalizeShapeText(expected).split(/\s+/).filter(Boolean).length;
  // A expressão transcrita é o diagnóstico MAIS específico: checa antes, senão
  // "S₀ = 15 km e S = 96 km" (8 palavras) seria reportado só como dissertativo.
  if (/[=:]/.test(expected) && /\d/.test(expected) && n > 2) {
    return "o gabarito é uma expressão a ser transcrita: o aluno teria de acertar a formatação exata do autor";
  }
  // 2026-08-04: a régua contava PALAVRAS e por isso era cega para identificador
  // interno. O STI "Exploradores do Tempo Potiguar" entregou ao aluno um campo
  // de texto pedindo
  // "marco_touros-litoral_touros,marco_touros-posse_portuguesa": sem um único
  // espaço, contava como UMA palavra e passava como digitável. Ninguém digita um
  // slug com underscore, e no conteúdo escolar em português ele nunca é resposta
  // legítima — é sempre id que vazou do sistema.
  //
  // Medido nos tutores publicados: 3 de 757 passos de digitação (0,4%), os três
  // genuinamente irrespondíveis. Quem age sobre isto é o reparo do final-gate
  // (RULE 1b), que tenta seleção antes de qualquer rejeição.
  if (/[a-zA-Z]_|_[a-zA-Z]/.test(expected)) {
    return "o gabarito é um identificador interno (underscore): o aluno teria de digitar um id do sistema";
  }
  // 2026-08-17 (reparo (m7) do caderno, "decomponha 1884 em milhares,
  // centenas, dezenas e unidades" -> "1000 + 800 + 80 + 4"): SOMA pura de
  // inteiros e um valor que se digita numa caixinha (18 caracteres), nao uma
  // resposta dissertativa. A regua de palavras contava 7 e o gate bloqueava a
  // geracao inteira por "gabarito que o aluno nao consegue digitar".
  if (/^\d+(?:\s*\+\s*\d+){1,4}$/.test(expected) && expected.length <= 24) return null;
  if (n > maxPalavras) {
    return `o gabarito tem ${n} palavras: é uma resposta dissertativa, não um valor que o aluno digita`;
  }
  return null;
}

/** Atalho booleano. */
export function isTypableAnswer(expectedAnswer, opts) {
  return typedAnswerObstacle(expectedAnswer, opts) == null;
}
