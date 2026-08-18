/**
 * place_value_blocks - dezenas e unidades manipulaveis.
 */

import { z } from "zod";

const operandSchema = z
  .object({
    tens: z.number().int().min(0).max(9).optional(),
    units: z.number().int().min(0).max(9).optional(),
    label: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();

const componentPropsSchema = z
  .object({
    operands: z.array(operandSchema).max(2).optional(),
    focus: z.enum(["tens", "units"]).optional().nullable(),
  })
  .passthrough();

export default {
  id: "place_value_blocks",
  rendererPath: "frontend/src/components/RichStep/PlaceValueBlocks.jsx",

  description: "Blocos de dezenas e unidades. Sem options, aluno monta um numero de 0 a 99.",

  whenToUse: [
    "Valor posicional com dezenas e unidades",
    "Montar numero inteiro pequeno a partir de blocos",
    "Comparar composicao de numero ate 99",
  ],

  whenNotToUse: [
    "Numeros acima de 99 (use abacus ou numeric_keypad)",
    "Decimal, fracao ou coordenada",
    "Calculo direto sem objetivo de valor posicional",
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

  constraints: {
    expectedAnswer: {
      shape: "numeric-pure",
      regex: /^\d{1,2}$/,
      range: { min: 0, max: 99 },
      reason: "Blocos representam dezenas+unidades; só números inteiros 0-99",
    },
    componentProps: {
      operands: {
        type: "array",
        maxLength: 2,
        reason: "Suporta 1-2 operandos (compare/transform)",
      },
      focus: { type: "enum", values: ["tens", "units", null], required: false },
    },
  },

  llmGuidance: {
    useWhen: [
      "EA é inteiro entre 0 e 99 (dezenas + unidades)",
      "Step ensina valor posicional ou composição decimal",
      "Aluno precisa manipular blocos pra construir o número",
    ],
    avoidWhen: [
      "EA > 99 (use abacus que suporta até 9999, ou numeric_keypad)",
      "EA decimal ou fracionário (use numeric_keypad/fraction_bar)",
      "Cálculo direto sem ensino de valor posicional (use numeric_keypad)",
    ],
    goodExamples: [
      {
        instruction: "Monte 47 usando dezenas e unidades.",
        expectedAnswer: "47",
        componentProps: { focus: "tens" },
      },
    ],
    badExamples: [
      {
        attempt: { expectedAnswer: "126", componentProps: {} },
        reason: "EA > 99 — blocos não suportam centenas",
        solution: "Use abacus (até 9999) ou numeric_keypad",
      },
    ],
  },

  repairs: {
    "ea-not-numeric": (step) => ({
      ...step,
      renderAs: "text",
      componentProps: {},
      _repairedFrom: "place_value_blocks",
    }),
    "ea-out-of-range": (step) => {
      // EA > 99 → upgrade pra abacus (suporta até 9999)
      const n = Number(String(step.expectedAnswer || "").replace(",", "."));
      if (Number.isInteger(n) && n >= 0 && n <= 9999) {
        return {
          ...step,
          renderAs: "abacus",
          componentProps: {},
          _repairedFrom: "place_value_blocks",
          _repairReason: "EA > 99, abacus suporta até 9999",
        };
      }
      return {
        ...step,
        renderAs: "numeric_keypad",
        componentProps: {},
        _repairedFrom: "place_value_blocks",
      };
    },
  },

  pedagogicalGuard: ({ ea = "" }) => {
    const n = Number(String(ea || "").replace(",", "."));
    if (!Number.isInteger(n))
      return { message: "place_value_blocks aceita apenas inteiro", errorCode: "ea-not-numeric" };
    if (n < 0 || n > 99)
      return { message: "place_value_blocks cobre apenas 0..99", errorCode: "ea-out-of-range" };
    return null;
  },

  examples: [
    {
      context: "Matematica EF - valor posicional",
      instruction: "Monte o numero 47 usando dezenas e unidades.",
      expectedAnswer: "47",
      componentProps: { focus: "tens" },
    },
  ],
};
