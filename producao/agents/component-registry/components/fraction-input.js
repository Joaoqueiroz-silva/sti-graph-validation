/**
 * fraction_input - entrada textual de fracao simples.
 */

import { z } from "zod";

const componentPropsSchema = z.object({}).passthrough();

function isFraction(value) {
  const match = String(value || "").match(/^\s*-?\d+\s*\/\s*[1-9]\d*\s*$/);
  return Boolean(match);
}

export default {
  id: "fraction_input",
  rendererPath: "frontend/src/components/VisualInputs.jsx",

  description: "Entrada de numerador/denominador para o aluno digitar uma fracao simples.",

  whenToUse: [
    "Resposta esperada e uma fracao simples como 3/4",
    "Quer avaliar escrita da fracao, sem apoio visual de barra",
    "O aluno deve informar numerador e denominador diretamente",
  ],

  whenNotToUse: [
    "Aluno deve construir visualmente a fracao (use fraction_bar)",
    "Resposta decimal, porcentagem ou numero inteiro",
    "Operacao com fracoes que precisa montar expressao (use equation_builder)",
  ],

  schema: componentPropsSchema,

  answerContract: {
    accepts: ["fraction"],
    rejects: [
      "numeric-pure",
      "numeric-with-unit",
      "boolean",
      "ok-token",
      "mapping-pairs",
      "assignment-map",
      "edge-map",
    ],
  },

  // 2026-08-16 (F0 do caderno): papel deste componente no modo worksheet;
  // ver SPEC-FORMAT.md secao `notebook` e NOTEBOOK_* em shared/component-sets.js.
  notebook: {
    roles: ["A"],
  },

  pedagogicalGuard: ({ ea = "", options = [] }) => {
    if (!isFraction(ea)) return "fraction_input precisa de expectedAnswer fracionario";
    if (Array.isArray(options) && options.length > 0) return "fraction_input nao deve usar options";
    return null;
  },

  examples: [
    {
      context: "Matematica EF - escrita de fracao",
      instruction: "Digite a fracao que representa tres de quatro partes.",
      expectedAnswer: "3/4",
      componentProps: {},
    },
  ],
};
