/**
 * fill_blanks - componente legacy de lacunas em VisualInputs.
 *
 * Mantido para compatibilidade. Para novos steps, o compilador prefere
 * cloze_test; este contrato valida steps legados que ainda chegam com
 * renderAs="fill_blanks" e step.config.
 */

import { z } from "zod";

const blankSchema = z
  .object({
    hint: z.string().max(120).optional(),
    answer: z.string().max(120).optional(),
  })
  .passthrough();

const componentPropsSchema = z
  .object({
    template: z.string().max(1200).optional(),
    blanks: z
      .array(z.union([z.string().min(1).max(120), blankSchema]))
      .max(8)
      .optional(),
  })
  .passthrough();

function markerCount(template) {
  return (String(template || "").match(/___/g) || []).length;
}

function configOf(componentProps = {}, step = {}) {
  return {
    ...(step.config || {}),
    ...(componentProps || {}),
  };
}

export default {
  id: "fill_blanks",
  rendererPath: "frontend/src/components/VisualInputs.jsx",

  description:
    "Componente legacy de preenchimento de lacunas com template contendo ___ e blanks[].",

  whenToUse: [
    "Compatibilidade com STIs antigos que usam VisualInputs/fill_blanks",
    "Uma frase curta com 1-8 lacunas em contexto",
  ],

  whenNotToUse: [
    "Novo step contract-first (prefira cloze_test via interactionIntent action=cloze)",
    "Sem template com ___",
    "Quando a resposta e apenas escolha entre alternativas",
  ],

  schema: componentPropsSchema,

  answerContract: {
    accepts: [
      "numeric-pure",
      "numeric-with-unit",
      "shape-name",
      "sequence",
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

  pedagogicalGuard: ({ componentProps = {}, step = {}, options = [] }) => {
    if (Array.isArray(options) && options.length > 0) return "fill_blanks nao deve usar options";
    const config = configOf(componentProps, step);
    const template = String(config.template || "");
    const blanks = Array.isArray(config.blanks) ? config.blanks : [];
    const markers = markerCount(template);
    if (markers < 1) return "fill_blanks precisa de template com ___";
    if (blanks.length < 1) return "fill_blanks precisa de blanks[]";
    if (markers !== blanks.length) return "numero de ___ nao bate com blanks.length";
    return null;
  },

  examples: [
    {
      context: "Matematica EF - lacuna numerica",
      instruction: "Complete a soma.",
      expectedAnswer: "3",
      componentProps: {
        template: "2 + ___ = 5",
        blanks: [{ hint: "numero que falta" }],
      },
    },
  ],
};
