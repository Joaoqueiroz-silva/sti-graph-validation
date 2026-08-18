/**
 * abacus - abaco decimal manipulavel.
 */

import { z } from "zod";

const initialStateSchema = z
  .object({
    thousands: z.number().int().min(0).max(9).optional(),
    hundreds: z.number().int().min(0).max(9).optional(),
    tens: z.number().int().min(0).max(9).optional(),
    units: z.number().int().min(0).max(9).optional(),
    ones: z.number().int().min(0).max(9).optional(),
  })
  .passthrough();

const componentPropsSchema = z
  .object({
    targetValue: z.number().int().min(0).max(9999).optional(),
    expectedAnswer: z.union([z.string(), z.number()]).optional(),
    mode: z.enum(["manipulate", "thousands", "hundreds", "tens", "units", "ones"]).optional(),
    initialState: initialStateSchema.optional(),
  })
  .passthrough();

export default {
  id: "abacus",
  rendererPath: "frontend/src/components/RichStep/Abacus.jsx",

  description:
    "Abaco decimal para construir numeros inteiros ate 9999 por milhares, centenas, dezenas e unidades.",

  whenToUse: [
    "Representar numero no abaco decimal",
    "Valor posicional com centenas/milhares",
    "Resposta esperada e inteiro de 0 a 9999",
  ],

  whenNotToUse: [
    "Fracao, decimal ou unidade fisica",
    "Numero maior que 9999",
    "Pergunta de calculo simples sem representacao posicional",
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
    roles: ["B", "D"],
  },

  pedagogicalGuard: ({ ea = "", componentProps = {} }) => {
    const n = Number(String(ea || "").replace(",", "."));
    if (!Number.isInteger(n)) return "abacus aceita apenas inteiro";
    if (n < 0 || n > 9999) return "valor esperado fora do range do abaco";
    if (componentProps.targetValue != null && Number(componentProps.targetValue) !== n) {
      return "targetValue deve bater com expectedAnswer";
    }
    if (componentProps.mode && componentProps.mode !== "manipulate") {
      return "contract-first usa abacus apenas em modo manipulate para evitar mismatch de coluna";
    }
    return null;
  },

  examples: [
    {
      context: "Matematica EF - valor posicional",
      instruction: "Represente 326 no abaco.",
      expectedAnswer: "326",
      componentProps: { targetValue: 326, mode: "manipulate" },
    },
  ],
};
