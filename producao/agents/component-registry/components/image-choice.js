/**
 * image_choice - escolha unica por imagem/emoji em VisualInputs.
 */

import { z } from "zod";

const imageSchema = z.union([
  z.string().min(1).max(300),
  z
    .object({
      src: z.string().max(500).optional(),
      url: z.string().max(500).optional(),
      value: z.union([z.string(), z.number()]).optional(),
      label: z.string().max(120).optional(),
      text: z.string().max(120).optional(),
      isCorrect: z.boolean().optional(),
      misconceptionId: z.string().max(80).optional(),
    })
    .passthrough(),
]);

const componentPropsSchema = z
  .object({
    images: z.array(imageSchema).min(2).max(6).optional(),
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

function imageValue(img, index) {
  if (typeof img === "string") return img;
  return String(img?.value ?? img?.label ?? img?.text ?? index + 1).trim();
}

export default {
  id: "image_choice",
  rendererPath: "frontend/src/components/VisualInputs.jsx",

  description: "Escolha unica com imagens, URLs ou emojis. Usa config.images, nao step.options.",

  whenToUse: [
    "Aluno pequeno ou pre-leitor precisa escolher por imagem/emoji",
    "Alternativas visuais concretas com uma resposta correta",
    "Compatibilidade com VisualInputs/image_choice",
  ],

  whenNotToUse: [
    "Sem imagens/emoji reais para cada alternativa",
    "Quando as alternativas sao apenas texto (use multiple_choice ou dropdown)",
    "Classificacao, ordenacao ou pareamento",
  ],

  schema: componentPropsSchema,

  answerContract: {
    accepts: ["numeric-pure", "shape-name", "boolean", "text-short", "unknown"],
    rejects: [
      "ok-token",
      "mapping-pairs",
      "assignment-map",
      "edge-map",
      "text-long",
      "fraction",
      "expression",
      "coordinate",
    ],
  },

  // 2026-08-16 (F0 do caderno): papel deste componente no modo worksheet;
  // ver SPEC-FORMAT.md secao `notebook` e NOTEBOOK_* em shared/component-sets.js.
  notebook: {
    roles: ["B"],
  },

  pedagogicalGuard: ({ ea = "", componentProps = {}, step = {}, options = [] }) => {
    if (Array.isArray(options) && options.length > 0)
      return "image_choice deve usar config.images, nao step.options";
    const config = configOf(componentProps, step);
    const images = Array.isArray(config.images) ? config.images : [];
    if (images.length < 2) return "image_choice precisa de 2+ images";
    const values = images.map(imageValue).map(normalize).filter(Boolean);
    if (values.length !== images.length) return "image sem value/label/src";
    if (new Set(values).size !== values.length) return "images duplicadas";
    if (!values.includes(normalize(ea))) return "images nao contem expectedAnswer";

    const explicit = images.filter((img) => typeof img === "object" && img?.isCorrect === true);
    if (explicit.length > 0) {
      if (explicit.length !== 1) return "precisa de no maximo 1 image isCorrect=true";
      if (normalize(imageValue(explicit[0], 0)) !== normalize(ea)) {
        return "image correta nao bate com expectedAnswer";
      }
    }
    return null;
  },

  examples: [
    {
      context: "Ciencias EF - animais",
      instruction: "Toque no animal vertebrado.",
      expectedAnswer: "sapo",
      componentProps: {
        images: [
          { src: "🐸", value: "sapo", label: "Sapo", isCorrect: true },
          { src: "🪱", value: "minhoca", label: "Minhoca" },
        ],
      },
    },
  ],
};
