/**
 * hot_spot - clique em area especifica de imagem/SVG.
 */

import { z } from "zod";

const hotspotSchema = z
  .object({
    id: z.string().min(1).max(48),
    x: z.number().min(0).max(100),
    y: z.number().min(0).max(100),
    radius: z.number().min(1).max(20).optional(),
  })
  .passthrough();

const componentPropsSchema = z
  .object({
    imageUrl: z.string().max(500).optional(),
    svgInline: z.string().max(20000).optional(),
    hotspots: z.array(hotspotSchema).min(2).max(12),
    expectedHotspot: z.string().min(1).max(48),
    hint: z.string().max(180).optional(),
  })
  .refine((data) => data.imageUrl || data.svgInline, {
    message: "hot_spot precisa de imageUrl ou svgInline",
  })
  .passthrough();

export default {
  id: "hot_spot",
  rendererPath: "frontend/src/components/RichStep/v2/HotSpot.jsx",

  description: "Aluno clica uma area especifica de uma imagem ou SVG.",

  whenToUse: [
    "Localizar um ponto/regiao visual",
    "Clique em parte anatomica, mapa, objeto ou imagem",
    "Resposta esperada e o id de um hotspot",
  ],

  whenNotToUse: [
    "Sem imagem/SVG de fundo",
    "Rotular varios alvos (use diagram_labeler)",
    "Classificacao textual",
  ],

  schema: componentPropsSchema,

  answerContract: {
    accepts: ["text-short"],
    rejects: [
      "numeric-pure",
      "fraction",
      "time",
      "coordinate",
      "boolean",
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
    const expected = String(componentProps.expectedHotspot || "").trim();
    if (!expected || String(ea || "").trim() !== expected)
      return "expectedAnswer deve ser expectedHotspot";
    if (!(componentProps.hotspots || []).some((hs) => hs.id === expected)) {
      return "expectedHotspot nao existe em hotspots";
    }
    return null;
  },

  examples: [
    {
      context: "Geografia EF - mapa simples",
      instruction: "Clique na regiao norte do mapa.",
      expectedAnswer: "norte",
      componentProps: {
        svgInline: "<svg viewBox='0 0 100 60'><rect width='100' height='60' fill='#e0f2fe'/></svg>",
        hotspots: [
          { id: "norte", x: 40, y: 20, radius: 6 },
          { id: "sul", x: 45, y: 48, radius: 6 },
        ],
        expectedHotspot: "norte",
      },
    },
  ],
};
