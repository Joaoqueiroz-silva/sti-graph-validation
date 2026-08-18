/**
 * parabola_plotter - ajuste de coeficientes de y = ax^2 + bx + c.
 */

import { z } from "zod";

const componentPropsSchema = z
  .object({
    a: z.number().min(-5).max(5).optional(),
    b: z.number().min(-10).max(10).optional(),
    c: z.number().min(-10).max(10).optional(),
    highlightRoot: z.enum(["positive", "negative", "both"]).optional().nullable(),
    question: z.string().max(180).optional(),
  })
  .passthrough();

function parseCoefficients(value) {
  const parts = String(value || "")
    .split(",")
    .map((part) => Number(part.trim()));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  return { a: parts[0], b: parts[1], c: parts[2] };
}

export default {
  id: "parabola_plotter",
  rendererPath: "frontend/src/components/RichStep/ParabolaPlotter.jsx",

  description: "Plotter interativo de funcao quadratica. Aluno ajusta a, b e c e envia 'a,b,c'.",

  whenToUse: [
    "Construir uma parabola por coeficientes",
    "Relacionar raizes/vertice ao grafico de funcao quadratica",
    "Resposta esperada tem formato a,b,c",
  ],

  whenNotToUse: [
    "Calcular apenas uma raiz numerica (use numeric_keypad)",
    "Equacao simbolica sem grafico (use equation_builder)",
    "Funcoes nao quadraticas",
  ],

  schema: componentPropsSchema,

  answerContract: {
    accepts: ["sequence", "coordinate"],
    rejects: ["numeric-pure", "fraction", "time", "boolean", "ok-token", "assignment-map"],
  },

  // 2026-08-16 (F0 do caderno): papel deste componente no modo worksheet;
  // ver SPEC-FORMAT.md secao `notebook` e NOTEBOOK_* em shared/component-sets.js.
  notebook: {
    roles: ["B", "D"],
  },

  pedagogicalGuard: ({ ea = "" }) => {
    const parsed = parseCoefficients(ea);
    if (!parsed) return "expectedAnswer deve ter formato a,b,c";
    if (parsed.a === 0) return "coeficiente a nao pode ser zero";
    if (
      parsed.a < -5 ||
      parsed.a > 5 ||
      parsed.b < -10 ||
      parsed.b > 10 ||
      parsed.c < -10 ||
      parsed.c > 10
    ) {
      return "coeficientes fora do range dos sliders";
    }
    return null;
  },

  examples: [
    {
      context: "Matematica EM - funcao quadratica",
      instruction: "Ajuste a parabola para y = x^2 - 4.",
      expectedAnswer: "1,0,-4",
      componentProps: { question: "Ajuste os coeficientes para formar y = x^2 - 4." },
    },
  ],
};
