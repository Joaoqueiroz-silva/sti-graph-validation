/**
 * clock_face - relogio analogico interativo.
 */

import { z } from "zod";

const componentPropsSchema = z
  .object({
    hours: z.number().int().min(1).max(12).optional(),
    minutes: z.number().int().min(0).max(59).optional(),
  })
  .passthrough();

export default {
  id: "clock_face",
  rendererPath: "frontend/src/components/RichStep/ClockFace.jsx",

  description: "Relogio analogico. Sem options, aluno arrasta ponteiros e produz uma hora HH:MM.",

  whenToUse: [
    "Ler ou montar horas em relogio analogico",
    "Resposta esperada em formato HH:MM",
    "Atividades de tempo para anos iniciais",
  ],

  whenNotToUse: [
    "Duracao/calculo numerico de tempo (use numeric_keypad)",
    "Linha do tempo historica (use timeline_constructor/image_sequence)",
    "Resposta textual",
  ],

  schema: componentPropsSchema,

  answerContract: {
    accepts: ["time"],
    rejects: ["numeric-pure", "boolean", "ok-token", "mapping-pairs"],
  },

  // 2026-08-16 (F0 do caderno): papel deste componente no modo worksheet;
  // ver SPEC-FORMAT.md secao `notebook` e NOTEBOOK_* em shared/component-sets.js.
  notebook: {
    roles: ["B"],
  },

  pedagogicalGuard: ({ ea = "" }) => {
    if (!/^\d{1,2}\s*[:hH]\s*\d{2}$/.test(String(ea || ""))) {
      return "clock_face precisa de expectedAnswer em hora HH:MM";
    }
    return null;
  },

  examples: [
    {
      context: "Matematica EF - leitura de horas",
      instruction: "Ajuste o relogio para 03:30.",
      expectedAnswer: "03:30",
      componentProps: {},
    },
  ],
};
