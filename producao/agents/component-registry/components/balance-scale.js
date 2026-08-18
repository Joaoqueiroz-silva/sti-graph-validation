/**
 * balance_scale - balanca interativa para equivalencia numerica inteira.
 */

import { z } from "zod";

const componentPropsSchema = z
  .object({
    leftValue: z.number().int().min(1).max(50).optional(),
    rightValue: z.number().int().min(0).max(50).optional(),
    leftLabel: z.string().max(24).optional(),
    rightLabel: z.string().max(24).optional(),
  })
  .passthrough();

export default {
  id: "balance_scale",
  rendererPath: "frontend/src/components/RichStep/BalanceScale.jsx",

  description:
    "Balanca de dois pratos. Sem options, aluno ajusta o prato direito ate igualar um valor inteiro.",

  whenToUse: [
    "Equilibrar quantidade inteira pequena",
    "Comparar igualdade numerica com manipulacao visual",
    "Resposta esperada e um inteiro de 1 a 50",
  ],

  whenNotToUse: [
    "Resposta decimal ou fracao",
    "Problema de texto sem nocao de equivalencia/peso",
    "Valor grande que exigiria muitos cliques",
  ],

  schema: componentPropsSchema,

  answerContract: {
    accepts: ["numeric-pure"],
    rejects: [
      "fraction",
      "time",
      "coordinate",
      "boolean",
      "text-short",
      "ok-token",
      "mapping-pairs",
    ],
  },

  // 2026-08-16 (F0 do caderno): papel deste componente no modo worksheet;
  // ver SPEC-FORMAT.md secao `notebook` e NOTEBOOK_* em shared/component-sets.js.
  notebook: {
    roles: ["A", "B"],
  },

  pedagogicalGuard: ({ ea = "", componentProps = {} }) => {
    const n = Number(String(ea || "").replace(",", "."));
    if (!Number.isInteger(n)) return "balance_scale aceita apenas inteiro";
    if (n < 1 || n > 50) return "valor esperado fora do range ergonomico da balanca";
    if (componentProps.leftValue != null && Number(componentProps.leftValue) !== n) {
      return "leftValue deve bater com expectedAnswer";
    }
    return null;
  },

  examples: [
    {
      context: "Matematica EF - equivalencia",
      instruction: "Adicione peso ate equilibrar a balanca com 8.",
      expectedAnswer: "8",
      componentProps: { leftValue: 8 },
    },
  ],
};
