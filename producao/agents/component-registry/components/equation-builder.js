/**
 * equation_builder - montagem de expressao/equacao com tokens.
 */

import { z } from "zod";

const componentPropsSchema = z
  .object({
    tokens: z.array(z.string().min(1).max(24)).min(3).max(24),
    expectedExpression: z.string().min(1).max(120),
    hint: z.string().max(180).optional(),
  })
  .refine((data) => data.tokens.some((tok) => String(data.expectedExpression).includes(tok)), {
    message: "tokens devem conter ao menos uma peca da expressao esperada",
  });

export default {
  id: "equation_builder",
  rendererPath: "frontend/src/components/RichStep/v2/EquationBuilder.jsx",

  description:
    "Construtor de equacao/expressao: aluno monta a resposta selecionando tokens em ordem.",

  whenToUse: [
    "Montar equacao a partir de enunciado verbal",
    "Construir expressao algebrica, formula ou igualdade",
    "Resposta esperada tem variaveis, operadores ou sinal de igual",
  ],

  whenNotToUse: [
    "Calculo com resposta numerica final (use numeric_keypad)",
    "Expressao longa aberta com varias respostas equivalentes difíceis de normalizar",
    "Pergunta conceitual/textual",
  ],

  schema: componentPropsSchema,

  answerContract: {
    accepts: ["expression"],
    rejects: ["numeric-pure", "boolean", "ok-token", "mapping-pairs"],
  },

  // 2026-08-16 (F0 do caderno): papel deste componente no modo worksheet;
  // ver SPEC-FORMAT.md secao `notebook` e NOTEBOOK_* em shared/component-sets.js.
  notebook: {
    roles: ["B"],
  },

  pedagogicalGuard: ({ instruction = "", ea = "", componentProps = {} }) => {
    const expected = String(componentProps.expectedExpression || ea || "");
    if (!/[=+\-*/^²√]|[a-z]/i.test(expected)) {
      return "equation_builder sem expressao matematica clara";
    }
    if (/verdadeiro|falso|sim|nao|não/i.test(String(instruction))) {
      return "equation_builder usado em pergunta booleana";
    }
    return null;
  },

  examples: [
    {
      context: "Matematica EF - equacao de primeiro grau",
      instruction: "Monte a equacao: a soma de x com 5 e igual a 10.",
      expectedAnswer: "x+5=10",
      componentProps: {
        tokens: ["x", "+", "5", "=", "10", "-", "3"],
        expectedExpression: "x+5=10",
      },
    },
    {
      context: "Matematica EF - discriminante",
      instruction: "Monte a expressao do discriminante.",
      expectedAnswer: "b²-4ac",
      componentProps: {
        tokens: ["b", "²", "-", "4", "a", "c", "+", "="],
        expectedExpression: "b²-4ac",
      },
    },
  ],
};
