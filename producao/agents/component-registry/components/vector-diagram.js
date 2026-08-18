/**
 * vector_diagram - escolha entre diagramas vetoriais.
 */

import { z } from "zod";

const vectorSchema = z
  .object({
    label: z.string().min(1).max(16),
    magnitude: z.number().min(0).max(5000).optional(),
    direction: z.union([
      z.enum(["right", "left", "up", "down", "up-right", "up-left", "down-right", "down-left"]),
      z.number().min(0).max(360),
    ]),
    color: z.string().max(24).optional(),
  })
  .passthrough();

const componentPropsSchema = z
  .object({
    body: z
      .object({
        label: z.string().max(40).optional(),
        icon: z.string().max(8).optional(),
      })
      .passthrough()
      .optional(),
    vectors: z.array(vectorSchema).optional(),
    optionVectors: z.record(z.array(vectorSchema)).optional(),
    question: z.string().max(180).optional(),
  })
  .passthrough();

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export default {
  id: "vector_diagram",
  rendererPath: "frontend/src/components/RichStep/VectorDiagram.jsx",

  description: "Aluno escolhe qual diagrama de vetores representa uma situacao.",

  whenToUse: [
    "Forcas, velocidade, deslocamento ou campo vetorial",
    "Escolha entre 2-4 diagramas com setas",
    "Resposta esperada e id de uma opcao visual",
  ],

  whenNotToUse: [
    "Calcular modulo numerico da resultante",
    "Diagrama unico apenas demonstrativo",
    "Sem vetores definidos para as opcoes",
  ],

  schema: componentPropsSchema,

  answerContract: {
    accepts: ["text-short"],
    rejects: [
      "numeric-pure",
      "fraction",
      "time",
      "coordinate",
      "boolean",
      "ok-token",
      "mapping-pairs",
    ],
  },

  // 2026-08-16 (F0 do caderno): papel deste componente no modo worksheet;
  // ver SPEC-FORMAT.md secao `notebook` e NOTEBOOK_* em shared/component-sets.js.
  notebook: {
    roles: ["A", "B", "D"],
  },

  pedagogicalGuard: ({ ea = "", componentProps = {}, options = [] }) => {
    if (!Array.isArray(options) || options.length < 2)
      return "vector_diagram precisa de 2+ options";
    const expected = normalize(ea);
    if (!options.some((opt) => normalize(opt.value ?? opt.label) === expected)) {
      return "options nao contem expectedAnswer";
    }
    const optionVectors = componentProps.optionVectors || {};
    for (const opt of options) {
      const value = String(opt.value ?? opt.label ?? "");
      const vectors = opt.vectors || optionVectors[value];
      if (!Array.isArray(vectors) || vectors.length < 1) return "cada option precisa de vectors";
    }
    return null;
  },

  examples: [
    {
      context: "Fisica - forcas",
      instruction: "Qual diagrama mostra peso para baixo e normal para cima?",
      expectedAnswer: "A",
      componentProps: {
        body: { label: "Caixa" },
        optionVectors: {
          A: [
            { label: "P", magnitude: 100, direction: "down" },
            { label: "N", magnitude: 100, direction: "up" },
          ],
          B: [{ label: "P", magnitude: 100, direction: "right" }],
        },
      },
      options: [
        { value: "A", label: "Diagrama A", isCorrect: true },
        { value: "B", label: "Diagrama B" },
      ],
    },
  ],
};
