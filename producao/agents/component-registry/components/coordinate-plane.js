/**
 * coordinate_plane - plano cartesiano clicavel.
 */

import { z } from "zod";

const componentPropsSchema = z
  .object({
    min: z.number().min(-100).max(100).optional(),
    max: z.number().min(-100).max(100).optional(),
    targetX: z.number().optional(),
    targetY: z.number().optional(),
  })
  .refine((data) => data.min == null || data.max == null || data.min < data.max, {
    message: "min deve ser menor que max",
  })
  .passthrough();

export default {
  id: "coordinate_plane",
  rendererPath: "frontend/src/components/RichStep/CoordinatePlane.jsx",

  description: "Plano cartesiano. Sem options, aluno clica para produzir uma coordenada (x, y).",

  whenToUse: [
    "Resposta esperada e par ordenado, como (3, 4)",
    "Localizar ponto no plano cartesiano",
    "Coordenadas inteiras em grade pequena",
  ],

  whenNotToUse: [
    "Resposta numerica unica (use number_line/numeric_keypad)",
    "Geometria de figuras (use geometry_shape)",
    "Grafico de funcao/parabola",
  ],

  schema: componentPropsSchema,

  answerContract: {
    accepts: ["coordinate"],
    rejects: ["numeric-pure", "boolean", "ok-token", "mapping-pairs", "fraction"],
  },

  // 2026-08-16 (F0 do caderno): papel deste componente no modo worksheet;
  // ver SPEC-FORMAT.md secao `notebook` e NOTEBOOK_* em shared/component-sets.js.
  notebook: {
    roles: ["B", "D"],
  },

  pedagogicalGuard: ({ ea = "", componentProps = {} }) => {
    const match = String(ea || "")
      .replace(/[()\s]/g, "")
      .match(/^(-?\d+(?:[.,]\d+)?)[,;](-?\d+(?:[.,]\d+)?)$/);
    if (!match) return "coordinate_plane precisa de expectedAnswer coordenada";
    const x = Number(match[1].replace(",", "."));
    const y = Number(match[2].replace(",", "."));
    const min = Number(componentProps.min ?? -5);
    const max = Number(componentProps.max ?? 5);
    if (x < min || x > max || y < min || y > max) {
      return "coordenada esperada fora do range do plano";
    }
    return null;
  },

  examples: [
    {
      context: "Matematica EF - plano cartesiano",
      instruction: "Marque o ponto (3, 4).",
      expectedAnswer: "(3, 4)",
      componentProps: { min: -5, max: 5 },
    },
  ],
};
