/**
 * table - preencher uma ou mais celulas editaveis em tabela simples.
 *
 * VisualInputs concatena as celulas editaveis na ordem de editableCells:
 *   editableCells.map(({ row, col }) => values[`${row}-${col}`]).join(", ")
 *
 * Por isso o contrato e propositalmente estrito: a resposta esperada precisa
 * ter exatamente um token por celula editavel, evitando tabelas "decorativas"
 * que nao batem com a validacao de resposta.
 */

import { z } from "zod";

const scalarSchema = z.union([z.string().max(160), z.number()]);

const editableCellSchema = z
  .object({
    row: z.number().int().min(0).max(20),
    col: z.number().int().min(0).max(20),
    answer: scalarSchema.optional(),
  })
  .passthrough();

const componentPropsSchema = z
  .object({
    headers: z.array(z.string().max(80)).max(12).optional(),
    rows: z.array(z.array(scalarSchema).min(1).max(12)).max(20).optional(),
    editableCells: z.array(editableCellSchema).min(1).max(8).optional(),
  })
  .passthrough();

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function configOf(componentProps = {}, step = {}) {
  return {
    ...(step.config || {}),
    ...(componentProps || {}),
  };
}

function answerTokens(value) {
  return String(value || "")
    .split(/\s*,\s*/)
    .map((token) => token.trim())
    .filter(Boolean);
}

export default {
  id: "table",
  rendererPath: "frontend/src/components/VisualInputs.jsx",

  description:
    "Tabela simples com 1-8 celulas editaveis; a resposta e a lista das celulas preenchidas.",

  whenToUse: [
    "Compatibilidade com VisualInputs/table",
    "Completar uma tabela pequena com valores pontuais",
    "Cada celula editavel tem um valor esperado claro",
  ],

  whenNotToUse: [
    "Tabela apenas explicativa ou decorativa",
    "Classificacao multi-item (prefira card_sort/card_sort_lab)",
    "Resposta aberta longa ou justificativa textual",
    "Mais de 8 celulas editaveis",
  ],

  schema: componentPropsSchema,

  answerContract: {
    accepts: [
      "numeric-pure",
      "numeric-with-unit",
      "shape-name",
      "sequence",
      "coordinate",
      "fraction",
      "expression",
      "time",
      "boolean",
      "text-short",
    ],
    rejects: ["text-long", "ok-token", "mapping-pairs", "assignment-map", "edge-map"],
  },

  // 2026-08-16 (F0 do caderno): papel deste componente no modo worksheet;
  // ver SPEC-FORMAT.md secao `notebook` e NOTEBOOK_* em shared/component-sets.js.
  notebook: {
    roles: ["A", "C"],
    targets: {
      kinds: ["cell"],
      answerKindByKind: { cell: "text-short" },
    },
  },

  pedagogicalGuard: ({ ea = "", componentProps = {}, step = {}, options = [] }) => {
    if (Array.isArray(options) && options.length > 0) return "table nao deve usar options";
    const config = configOf(componentProps, step);
    const rows = Array.isArray(config.rows) ? config.rows : [];
    const editableCells = Array.isArray(config.editableCells) ? config.editableCells : [];
    const headers = Array.isArray(config.headers) ? config.headers : [];

    if (rows.length < 1) return "table precisa de rows[]";
    if (editableCells.length < 1) return "table precisa de editableCells[]";

    const width = rows[0]?.length || 0;
    if (width < 1) return "table precisa de linhas com colunas";
    if (headers.length > 0 && headers.length !== width) {
      return "headers.length precisa bater com numero de colunas";
    }
    if (rows.some((row) => !Array.isArray(row) || row.length !== width)) {
      return "todas as rows precisam ter o mesmo numero de colunas";
    }

    const seen = new Set();
    for (const cell of editableCells) {
      const key = `${cell.row}-${cell.col}`;
      if (seen.has(key)) return "editableCells duplicadas";
      seen.add(key);
      if (!rows[cell.row] || cell.col >= width) return "editableCell fora dos limites da tabela";
    }

    const tokens = answerTokens(ea);
    if (tokens.length !== editableCells.length) {
      return "expectedAnswer precisa ter 1 token por editableCell, separado por virgula";
    }

    for (let i = 0; i < editableCells.length; i++) {
      const declared = editableCells[i]?.answer;
      if (declared != null && normalize(declared) !== normalize(tokens[i])) {
        return "editableCells[].answer nao bate com expectedAnswer";
      }
    }

    return null;
  },

  examples: [
    {
      context: "Matematica EF - completar tabela",
      instruction: "Complete a linha do dobro.",
      expectedAnswer: "8",
      componentProps: {
        headers: ["Numero", "Dobro"],
        rows: [
          [4, ""],
          [5, 10],
        ],
        editableCells: [{ row: 0, col: 1, answer: "8" }],
      },
    },
  ],
};
