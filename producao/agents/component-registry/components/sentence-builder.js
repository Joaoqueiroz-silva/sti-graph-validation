/**
 * sentence_builder - montar frase clicando em palavras.
 */

import { z } from "zod";

const componentPropsSchema = z
  .object({
    wordBank: z.array(z.string().min(1).max(40)).min(2).max(18),
    targetLength: z.number().int().min(1).max(18).optional(),
    joiner: z.string().max(4).optional(),
  })
  .passthrough();

export default {
  id: "sentence_builder",
  rendererPath: "frontend/src/components/RichStep/SentenceBuilder.jsx",

  description: "Aluno monta frase ou sequencia textual clicando nas palavras em ordem.",

  whenToUse: [
    "Montar frase curta com 2-12 palavras",
    "Ordenar palavras para formar uma sentenca gramatical",
    "Rimas/frases em linguagem quando MC ficaria passivo demais",
  ],

  whenNotToUse: [
    "Sequencia de etapas conceituais (use drag_to_order/image_sequence)",
    "Completar lacunas em texto corrido (use cloze_test)",
    "Resposta numerica ou simbolica",
  ],

  schema: componentPropsSchema,

  answerContract: {
    accepts: ["text-short", "text-long"],
    rejects: [
      "numeric-pure",
      "numeric-with-unit",
      "fraction",
      "time",
      "coordinate",
      "expression",
      "ok-token",
      "mapping-pairs",
    ],
  },

  // 2026-08-16 (F0 do caderno): papel deste componente no modo worksheet;
  // ver SPEC-FORMAT.md secao `notebook` e NOTEBOOK_* em shared/component-sets.js.
  notebook: {
    roles: ["B"],
  },

  pedagogicalGuard: ({ ea = "", componentProps = {} }) => {
    const expectedWords = String(ea || "")
      .split(/\s+/)
      .filter(Boolean);
    const bank = componentProps.wordBank || [];
    if (expectedWords.length < 2) return "sentence_builder precisa de resposta com 2+ palavras";
    const bankLower = new Set(bank.map((w) => String(w).toLowerCase()));
    if (!expectedWords.every((w) => bankLower.has(w.toLowerCase()))) {
      return "wordBank nao contem todas as palavras do expectedAnswer";
    }
    return null;
  },

  examples: [
    {
      context: "Portugues EF - ordenar frase",
      instruction: "Monte a frase correta.",
      expectedAnswer: "O cachorro correu",
      componentProps: {
        wordBank: ["cachorro", "O", "correu"],
        targetLength: 3,
      },
    },
  ],
};
