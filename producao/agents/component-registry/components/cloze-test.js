/**
 * cloze_test - texto com lacunas digitaveis.
 */

import { z } from "zod";

const componentPropsSchema = z
  .object({
    text: z.string().min(8).max(1200),
    blanks: z.array(z.string().min(1).max(80)).min(1).max(8),
    acceptableVariations: z
      .record(z.string(), z.array(z.string().min(1).max(80)).min(1).max(8))
      .optional(),
    hint: z.string().max(180).optional(),
  })
  .refine(
    (data) => {
      const markers = String(data.text || "").match(/(_{3,}|\{\{\s*\d+\s*\}\})/g) || [];
      return markers.length >= 1 && markers.length === data.blanks.length;
    },
    { message: "Numero de lacunas no texto deve bater com blanks[]" }
  );

export default {
  id: "cloze_test",
  rendererPath: "frontend/src/components/RichStep/v2/ClozeTest.jsx",

  description: "Texto com lacunas: aluno digita 1-8 palavras/trechos curtos no contexto.",

  whenToUse: [
    "Completar frases, conjugacoes, vocabulário ou conceitos em contexto",
    "Retencao contextual quando MC entregaria a resposta",
    "Processos curtos com 1-4 termos faltando em um paragrafo",
  ],

  whenNotToUse: [
    "Resposta numerica pura (use numeric_keypad)",
    "Ordenacao de etapas (use image_sequence/drag_to_order)",
    "Classificacao multi-item (use card_sort_lab)",
  ],

  schema: componentPropsSchema,

  answerContract: {
    accepts: ["text-short", "text-long"],
    rejects: ["numeric-pure", "boolean", "ok-token", "mapping-pairs"],
  },

  // 2026-08-16 (F0 do caderno): papel deste componente no modo worksheet;
  // ver SPEC-FORMAT.md secao `notebook` e NOTEBOOK_* em shared/component-sets.js.
  notebook: {
    roles: ["A", "B"],
  },

  pedagogicalGuard: ({ componentProps = {} }) => {
    const text = String(componentProps.text || "");
    if (!/(_{3,}|\{\{\s*\d+\s*\}\})/.test(text)) return "cloze_test sem lacunas no texto";
    return null;
  },

  examples: [
    {
      context: "Portugues EF - concordancia verbal",
      instruction: "Complete a frase com a forma verbal correta.",
      expectedAnswer: "corre | brincam",
      componentProps: {
        text: "O cachorro ___ no parque e as criancas ___ no patio.",
        blanks: ["corre", "brincam"],
      },
    },
    {
      context: "Ciencias EF - fotossintese",
      instruction: "Complete os termos do processo.",
      expectedAnswer: "agua | gas carbonico | glicose",
      componentProps: {
        text: "A planta absorve ___ e ___ para produzir ___.",
        blanks: ["agua", "gas carbonico", "glicose"],
        acceptableVariations: { 1: ["dioxido de carbono", "co2"] },
      },
    },
  ],
};
