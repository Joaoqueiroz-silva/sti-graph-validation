/**
 * card_sort - categorizacao v2 com cards e grupos.
 */

import { z } from "zod";

const groupSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(2).max(40),
  color: z.string().optional(),
});

const componentPropsSchema = z
  .object({
    groups: z.array(groupSchema).min(2).max(5),
    cards: z.array(z.string().min(1).max(80)).min(3).max(20),
    correctMapping: z.record(z.string(), z.string()),
    hint: z.string().max(180).optional(),
  })
  .refine(
    (data) => {
      const groupIds = new Set(data.groups.map((g) => g.id));
      const cardSet = new Set(data.cards);
      const entries = Object.entries(data.correctMapping || {});
      return (
        entries.length === data.cards.length &&
        entries.every(([card, groupId]) => cardSet.has(card) && groupIds.has(groupId))
      );
    },
    { message: "correctMapping deve mapear cada card para um group id valido" }
  )
  .refine(
    (data) => {
      const labels = new Set(data.groups.map((g) => g.label.toLowerCase()));
      return !data.cards.every((card) => labels.has(card.toLowerCase()));
    },
    { message: "cards nao podem ser apenas os nomes dos grupos" }
  );

export default {
  id: "card_sort",
  rendererPath: "frontend/src/components/RichStep/v2/CardSort.jsx",

  description:
    "Categorizacao v2: aluno arrasta cards para 2-5 grupos, com gabarito por mapeamento.",

  whenToUse: [
    "Classificar palavras, conceitos ou exemplos entre 2-5 grupos",
    "Categorizacao sem intersecao entre conjuntos",
    "Quando a resposta deve ser o mapeamento completo card->grupo",
  ],

  whenNotToUse: [
    "Pareamento 1:1 (use matching_pairs ou memory_game)",
    "Sequencia/ordem (use drag_to_order/image_sequence)",
    "Resposta numerica ou textual livre",
  ],

  schema: componentPropsSchema,

  answerContract: {
    accepts: ["mapping-pairs"],
    rejects: ["numeric-pure", "boolean", "ok-token", "fraction"],
  },

  // 2026-08-16 (F0 do caderno): papel deste componente no modo worksheet;
  // ver SPEC-FORMAT.md secao `notebook` e NOTEBOOK_* em shared/component-sets.js.
  notebook: {
    roles: ["B"],
  },

  pedagogicalGuard: ({ instruction = "", componentProps = {} }) => {
    const lower = String(instruction).toLowerCase();
    const groups = componentProps.groups || [];
    const affirmsGroup = groups.some((g) => {
      const label = String(g.label || "").toLowerCase();
      return label.length > 3 && new RegExp(`\\b(?:como|em)\\s+${label}s?\\b`, "i").test(lower);
    });
    if (affirmsGroup) return "instrucao afirma uma das categorias";
    return null;
  },

  examples: [
    {
      context: "Portugues EF - classes gramaticais",
      instruction: "Arraste cada palavra para a classe gramatical correta.",
      expectedAnswer: "correr=>verbo;casa=>subst;alegre=>adj",
      componentProps: {
        groups: [
          { id: "subst", label: "Substantivo" },
          { id: "verbo", label: "Verbo" },
          { id: "adj", label: "Adjetivo" },
        ],
        cards: ["correr", "casa", "alegre"],
        correctMapping: { correr: "verbo", casa: "subst", alegre: "adj" },
      },
    },
  ],
};
