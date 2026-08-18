/**
 * drag_order - ordenacao legacy em VisualInputs.
 *
 * Compatibilidade para renderAs="drag_order". Para novos steps ricos, o
 * contrato preferido continua sendo drag_to_order.
 */

import { z } from "zod";

const itemSchema = z.union([
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
    items: z.array(itemSchema).min(2).max(12).optional(),
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

function itemLabels(items) {
  return items.map((item) => {
    if (typeof item === "string") return item;
    return String(item?.label ?? item?.value ?? item?.text ?? "").trim();
  });
}

function answerTokens(ea) {
  return String(ea || "")
    .split(/\s*(?:,|;|->|→)\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export default {
  id: "drag_order",
  rendererPath: "frontend/src/components/VisualInputs.jsx",

  description:
    "Ordenacao legacy por arrastar itens. Usa config.items e expectedAnswer como sequencia.",

  whenToUse: [
    "Compatibilidade com STIs antigos que usam VisualInputs/drag_order",
    "Ordenar 2-12 etapas, eventos ou palavras",
  ],

  whenNotToUse: [
    "Novo step contract-first (prefira drag_to_order ou image_sequence)",
    "Selecionar todos os itens de uma categoria",
    "Classificacao, pareamento ou escolha unica",
  ],

  schema: componentPropsSchema,

  answerContract: {
    accepts: ["sequence", "text-short", "text-long", "unknown"],
    rejects: ["numeric-pure", "boolean", "ok-token", "mapping-pairs", "assignment-map", "edge-map"],
  },

  // 2026-08-16 (F0 do caderno): papel deste componente no modo worksheet;
  // ver SPEC-FORMAT.md secao `notebook` e NOTEBOOK_* em shared/component-sets.js.
  notebook: {
    roles: ["B"],
  },

  pedagogicalGuard: ({ ea = "", componentProps = {}, step = {}, options = [] }) => {
    if (Array.isArray(options) && options.length > 0) return "drag_order nao deve usar options";
    const config = configOf(componentProps, step);
    const items = Array.isArray(config.items) ? config.items : [];
    if (items.length < 2) return "drag_order precisa de 2+ items";
    const labels = itemLabels(items);
    if (labels.some((label) => !label)) return "item sem label/value/text";
    const normalizedLabels = labels.map(normalize);
    if (new Set(normalizedLabels).size !== normalizedLabels.length) return "items duplicados";

    const tokens = answerTokens(ea).map(normalize);
    if (tokens.length !== items.length) return "expectedAnswer deve listar todos os items na ordem";
    for (const token of tokens) {
      if (!normalizedLabels.includes(token))
        return "expectedAnswer contem item ausente de config.items";
    }
    return null;
  },

  examples: [
    {
      context: "Ciencias EF - ciclo da agua",
      instruction: "Ordene as etapas do ciclo da agua.",
      expectedAnswer: "evaporacao, condensacao, precipitacao",
      componentProps: {
        items: ["evaporacao", "condensacao", "precipitacao"],
      },
    },
  ],
};
