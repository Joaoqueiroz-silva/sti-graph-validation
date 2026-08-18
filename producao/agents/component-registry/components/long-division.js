/**
 * long_division - divisao armada com quociente digitado.
 *
 * VisualInputs le step.config.dividend/divisor; componentProps espelha os
 * mesmos campos para o registry e para o compilador deterministico.
 */

import { z } from "zod";

const componentPropsSchema = z
  .object({
    dividend: z.number().int().min(1).max(99999).optional(),
    divisor: z.number().int().min(1).max(999).optional(),
  })
  .passthrough();

function numberFrom(value) {
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

export default {
  id: "long_division",
  rendererPath: "frontend/src/components/VisualInputs.jsx",

  description: "Divisao armada: mostra dividendo/divisor e o aluno digita o quociente.",

  whenToUse: [
    "Treino de divisao inteira com algoritmo armado",
    "dividend/divisor sao conhecidos e o quociente e inteiro",
    "O foco pedagogico e procedimento de divisao, nao escolha entre alternativas",
  ],

  whenNotToUse: [
    "Divisao com resto quando o STI nao pede resto explicitamente",
    "Resposta decimal aproximada",
    "Problema de multiplicacao, fracao ou proporcao",
  ],

  schema: componentPropsSchema,

  answerContract: {
    accepts: ["numeric-pure"],
    rejects: ["fraction", "time", "coordinate", "boolean", "ok-token", "mapping-pairs"],
  },

  // 2026-08-16 (F0 do caderno): papel deste componente no modo worksheet;
  // ver SPEC-FORMAT.md secao `notebook` e NOTEBOOK_* em shared/component-sets.js.
  notebook: {
    roles: ["B"],
  },

  pedagogicalGuard: ({ ea = "", componentProps = {}, step = {}, options = [] }) => {
    if (Array.isArray(options) && options.length > 0) return "long_division nao deve usar options";
    const config = step.config || {};
    const dividend = numberFrom(componentProps.dividend ?? config.dividend);
    const divisor = numberFrom(componentProps.divisor ?? config.divisor);
    const quotient = numberFrom(ea);
    if (!dividend || !divisor || !quotient)
      return "long_division precisa de dividend, divisor e ea inteiros";
    if (divisor === 0) return "divisor nao pode ser zero";
    if (dividend / divisor !== quotient) return "expectedAnswer nao bate com dividend/divisor";
    return null;
  },

  examples: [
    {
      context: "Matematica EF - divisao armada",
      instruction: "Resolva a divisao 144 por 12.",
      expectedAnswer: "12",
      componentProps: { dividend: 144, divisor: 12 },
    },
  ],
};
