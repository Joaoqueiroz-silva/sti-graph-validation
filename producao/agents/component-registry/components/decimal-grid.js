/**
 * decimal_grid - grade de alinhamento decimal em VisualInputs.
 *
 * O componente atual submete a ultima linha como string concatenada
 * (grid[rows - 1].join("").trim()). Ele nao injeta "."/"," automaticamente,
 * entao o registry so aceita respostas digits-only para evitar mismatch
 * entre UI e expectedAnswer.
 */

import { z } from "zod";

const prefilledCellSchema = z
  .object({
    row: z.number().int().min(0).max(12),
    col: z.number().int().min(0).max(12),
    value: z.union([z.string().max(4), z.number()]),
  })
  .passthrough();

const componentPropsSchema = z
  .object({
    rows: z.number().int().min(2).max(8).optional(),
    cols: z.number().int().min(2).max(12).optional(),
    prefilled: z.array(prefilledCellSchema).max(80).optional(),
    decimalCol: z.number().int().min(0).max(11).optional(),
  })
  .passthrough();

function configOf(componentProps = {}, step = {}) {
  return {
    ...(step.config || {}),
    ...(componentProps || {}),
  };
}

function numberFrom(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) ? n : fallback;
}

export default {
  id: "decimal_grid",
  rendererPath: "frontend/src/components/VisualInputs.jsx",

  description:
    "Grade para alinhar algarismos em operacoes decimais; submete a ultima linha como digitos.",

  whenToUse: [
    "Compatibilidade com VisualInputs/decimal_grid",
    "Alinhamento de algarismos em conta decimal simples",
    "Resposta final pode ser validada como string de digitos sem separador decimal",
  ],

  whenNotToUse: [
    "Resposta esperada contem ponto ou virgula decimal",
    "O aluno precisa digitar sinal, unidade ou expressao",
    "Atividade conceitual de valor posicional (prefira place_value_blocks/number_line)",
  ],

  schema: componentPropsSchema,

  answerContract: {
    accepts: ["numeric-pure"],
    rejects: [
      "numeric-with-unit",
      "fraction",
      "expression",
      "time",
      "boolean",
      "text-short",
      "text-long",
      "ok-token",
      "mapping-pairs",
      "assignment-map",
      "edge-map",
    ],
    answerSchema: /^\d+$/,
  },

  // 2026-08-16 (F0 do caderno): papel deste componente no modo worksheet;
  // ver SPEC-FORMAT.md secao `notebook` e NOTEBOOK_* em shared/component-sets.js.
  notebook: {
    roles: ["B"],
  },

  pedagogicalGuard: ({ ea = "", componentProps = {}, step = {}, options = [] }) => {
    if (Array.isArray(options) && options.length > 0) return "decimal_grid nao deve usar options";
    if (!/^\d+$/.test(String(ea || "").trim())) {
      return "decimal_grid atual so aceita expectedAnswer digits-only";
    }

    const config = configOf(componentProps, step);
    const rows = numberFrom(config.rows, 3);
    const cols = numberFrom(config.cols, 6);
    const decimalCol = numberFrom(config.decimalCol, 3);
    const prefilled = Array.isArray(config.prefilled) ? config.prefilled : [];

    if (rows < 2 || rows > 8) return "rows fora do intervalo 2-8";
    if (cols < 2 || cols > 12) return "cols fora do intervalo 2-12";
    if (decimalCol < 0 || decimalCol >= cols) return "decimalCol fora dos limites";
    if (String(ea).trim().length > cols) {
      return "expectedAnswer tem mais digitos que cols";
    }

    const seen = new Set();
    for (const cell of prefilled) {
      const key = `${cell.row}-${cell.col}`;
      if (seen.has(key)) return "prefilled duplicado";
      seen.add(key);
      if (cell.row < 0 || cell.row >= rows || cell.col < 0 || cell.col >= cols) {
        return "prefilled fora dos limites da grade";
      }
      if (cell.row === rows - 1) {
        return "ultima linha deve ficar livre para resposta do aluno";
      }
      if (!/^[\d.,+-]$/.test(String(cell.value))) {
        return "prefilled.value deve ser um unico caractere numerico/sinal/separador";
      }
    }

    return null;
  },

  examples: [
    {
      context: "Matematica EF - alinhamento decimal",
      instruction: "Some os algarismos alinhados e digite o resultado sem virgula.",
      expectedAnswer: "575",
      componentProps: {
        rows: 3,
        cols: 5,
        decimalCol: 2,
        prefilled: [
          { row: 0, col: 1, value: 2 },
          { row: 0, col: 2, value: 5 },
          { row: 1, col: 1, value: 3 },
          { row: 1, col: 2, value: 2 },
          { row: 1, col: 3, value: 5 },
        ],
      },
    },
  ],
};
