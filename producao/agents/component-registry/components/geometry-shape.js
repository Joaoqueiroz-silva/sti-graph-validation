/**
 * geometry_shape - selecao de figuras planas.
 */

import { z } from "zod";

const shapeSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    sides: z.number().int().min(0).max(20).optional(),
    vertices: z.number().int().min(0).max(20).optional(),
    css: z.record(z.any()).optional(),
  })
  .passthrough();

const componentPropsSchema = z
  .object({
    shapes: z.array(shapeSchema).min(2).max(8).optional(),
    targetShape: z.string().min(1),
    mode: z.enum(["answer", "explore"]).optional(),
  })
  .passthrough();

const SHAPE_IDS = new Set(["circle", "triangle", "square", "rectangle", "pentagon", "hexagon"]);

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export default {
  id: "geometry_shape",
  rendererPath: "frontend/src/components/RichStep/GeometryShape.jsx",

  description: "Selecao visual de figura plana. Em modo answer, aluno escolhe a forma correta.",

  whenToUse: [
    "Identificar figura plana por nome, lados ou vertices",
    "Resposta esperada e uma forma conhecida como square, triangle ou circle",
    "Reconhecimento visual de geometria basica",
  ],

  whenNotToUse: [
    "Calcular area/perimetro numerico",
    "Geometria 3D",
    "Resposta textual que nao e nome de forma",
  ],

  schema: componentPropsSchema,

  answerContract: {
    accepts: ["shape-name"],
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
    roles: ["A", "B"],
  },

  pedagogicalGuard: ({ ea = "", componentProps = {} }) => {
    const target = normalize(componentProps.targetShape || ea);
    if (!target) return "geometry_shape precisa de targetShape";
    if (componentProps.mode && componentProps.mode !== "answer") {
      return "geometry_shape contract-first deve usar modo answer";
    }
    if (!SHAPE_IDS.has(target) && !componentProps.shapes?.some((s) => normalize(s.id) === target)) {
      return "targetShape fora do conjunto conhecido";
    }
    return null;
  },

  examples: [
    {
      context: "Matematica EF - figuras planas",
      instruction: "Qual figura tem quatro lados iguais?",
      expectedAnswer: "square",
      acceptableVariations: ["quadrado"],
      componentProps: { targetShape: "square", mode: "answer" },
    },
  ],
};
