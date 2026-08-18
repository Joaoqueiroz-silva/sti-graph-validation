/**
 * venn_diagram - classificacao em duas categorias e interseccao.
 */

import { z } from "zod";

const itemSchema = z
  .object({
    label: z.string().min(1).max(80),
    value: z.string().max(80).optional(),
  })
  .passthrough();

const componentPropsSchema = z
  .object({
    leftLabel: z.string().min(1).max(60),
    rightLabel: z.string().min(1).max(60),
    items: z.array(itemSchema).min(2).max(10),
    highlight: z.string().max(24).optional().nullable(),
  })
  .passthrough();

const REGIONS = new Set(["left", "both", "right"]);

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function _expectedFromItems(items) {
  return items.map((item) => `${item.label || item.value}=${item.region}`).join(";");
}

export default {
  id: "venn_diagram",
  rendererPath: "frontend/src/components/RichStep/VennDiagram.jsx",

  description:
    "Diagrama de Venn interativo. Aluno coloca itens em esquerda, interseccao ou direita.",

  whenToUse: [
    "Comparar duas categorias com possivel interseccao",
    "Classificacao left/both/right",
    "Itens podem pertencer a A, B ou ambos",
  ],

  whenNotToUse: [
    "Mais de duas categorias (use card_sort/card_sort_lab)",
    "Sequencia ou cronologia",
    "Pareamento 1:1",
  ],

  schema: componentPropsSchema,

  answerContract: {
    accepts: ["assignment-map"],
    rejects: ["numeric-pure", "fraction", "time", "coordinate", "boolean", "ok-token", "edge-map"],
  },

  // 2026-08-16 (F0 do caderno): papel deste componente no modo worksheet;
  // ver SPEC-FORMAT.md secao `notebook` e NOTEBOOK_* em shared/component-sets.js.
  notebook: {
    roles: ["B"],
  },

  pedagogicalGuard: ({ ea = "", componentProps = {} }) => {
    const items = componentProps.items || [];
    if (items.some((item) => item.region)) {
      return "contract-first usa venn_diagram em modo interativo sem region nos items";
    }
    const mapping = componentProps.correctMapping || {};
    const expected = items.map((item) => {
      const key = item.label || item.value;
      const region = mapping[key] || mapping[item.id];
      return `${key}=${region}`;
    });
    if (expected.some((part) => !REGIONS.has(part.split("=")[1])))
      return "mapping deve usar left/both/right";
    if (normalize(ea) !== normalize(expected.join(";")))
      return "expectedAnswer nao bate com correctMapping";
    return null;
  },

  examples: [
    {
      context: "Ciencias EF - vertebrados/aquaticos",
      instruction: "Coloque cada animal na regiao correta do diagrama.",
      expectedAnswer: "Peixe=both;Sapo=left;Agua-viva=right",
      componentProps: {
        leftLabel: "Vertebrados",
        rightLabel: "Aquaticos",
        items: [{ label: "Peixe" }, { label: "Sapo" }, { label: "Agua-viva" }],
        correctMapping: { Peixe: "both", Sapo: "left", "Agua-viva": "right" },
      },
    },
  ],
};
