/**
 * dropdown - selecao textual compacta em VisualInputs.
 */

import { z } from "zod";

const optionSchema = z.union([
  z.string().min(1).max(160),
  z
    .object({
      value: z.union([z.string(), z.number()]).optional(),
      label: z.string().max(160).optional(),
      text: z.string().max(160).optional(),
    })
    .passthrough(),
]);

const componentPropsSchema = z
  .object({
    options: z.array(optionSchema).min(2).max(20).optional(),
    placeholder: z.string().max(80).optional(),
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

function optionValue(opt) {
  if (typeof opt === "string") return opt;
  return String(opt?.value ?? opt?.label ?? opt?.text ?? "").trim();
}

export default {
  id: "dropdown",
  rendererPath: "frontend/src/components/VisualInputs.jsx",

  description: "Dropdown compacto para escolher uma resposta entre alternativas textuais.",

  whenToUse: [
    "Compatibilidade com VisualInputs/dropdown",
    "Escolha unica textual quando botoes ocupariam espaco demais",
  ],

  whenNotToUse: [
    "Novo step com distratores pedagogicos (prefira multiple_choice)",
    "Classificacao multi-item, ordenacao ou pareamento",
    "Quando precisa de imagens ou manipulativo visual",
  ],

  schema: componentPropsSchema,

  answerContract: {
    accepts: [
      "numeric-pure",
      "numeric-with-unit",
      "shape-name",
      "fraction",
      "expression",
      "time",
      "boolean",
      "text-short",
      "text-long",
      "unknown",
    ],
    rejects: ["ok-token", "mapping-pairs", "assignment-map", "edge-map"],
  },

  // 2026-08-16 (F0 do caderno): papel deste componente no modo worksheet;
  // ver SPEC-FORMAT.md secao `notebook` e NOTEBOOK_* em shared/component-sets.js.
  notebook: {
    roles: ["A"],
  },

  pedagogicalGuard: ({ ea = "", componentProps = {}, step = {}, options = [] }) => {
    if (Array.isArray(options) && options.length > 0)
      return "dropdown deve usar config.options, nao step.options";
    const config = configOf(componentProps, step);
    const opts = Array.isArray(config.options) ? config.options : [];
    if (opts.length < 2) return "dropdown precisa de 2+ options";
    const values = opts.map(optionValue).map(normalize).filter(Boolean);
    if (values.length !== opts.length) return "option sem value/label/text";
    if (new Set(values).size !== values.length) return "options duplicadas";
    if (!values.includes(normalize(ea))) return "config.options nao contem expectedAnswer";
    return null;
  },

  examples: [
    {
      context: "Geografia EF - regiao brasileira",
      instruction: "Escolha a regiao onde fica o Amazonas.",
      expectedAnswer: "Norte",
      componentProps: {
        options: ["Norte", "Nordeste", "Sul"],
        placeholder: "Selecione uma regiao",
      },
    },
  ],
};
