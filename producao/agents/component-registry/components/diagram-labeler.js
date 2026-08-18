/**
 * diagram_labeler - rotulagem espacial de alvos em diagrama.
 */

import { z } from "zod";

const targetSchema = z
  .object({
    id: z.string().min(1).max(48),
    x: z.number().min(0).max(100),
    y: z.number().min(0).max(100),
    label: z.string().max(80).optional(),
  })
  .passthrough();

const componentPropsSchema = z
  .object({
    imageUrl: z.string().max(500).optional(),
    svgInline: z.string().max(20000).optional(),
    targets: z.array(targetSchema).min(2).max(8),
    labels: z.array(z.string().min(1).max(80)).min(2).max(8),
    correctMapping: z.record(z.string().min(1)),
    hint: z.string().max(180).optional(),
  })
  .refine((data) => data.imageUrl || data.svgInline, {
    message: "diagram_labeler precisa de imageUrl ou svgInline",
  })
  .passthrough();

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export default {
  id: "diagram_labeler",
  rendererPath: "frontend/src/components/RichStep/v2/DiagramLabeler.jsx",

  description: "Aluno arrasta rotulos para alvos posicionados em uma imagem ou SVG.",

  whenToUse: [
    "Rotular partes de um diagrama",
    "Associar nomes a regioes visuais conhecidas",
    "Tarefa de localizacao espacial com 2-8 alvos",
  ],

  whenNotToUse: [
    "Sem imagem/SVG de fundo",
    "Apenas escolher uma palavra entre opcoes",
    "Mapa conceitual com relacoes entre conceitos",
  ],

  schema: componentPropsSchema,

  answerContract: {
    accepts: ["assignment-map"],
    rejects: ["numeric-pure", "fraction", "time", "coordinate", "boolean", "ok-token", "edge-map"],
  },

  // 2026-08-16 (F0 do caderno): papel deste componente no modo worksheet;
  // ver SPEC-FORMAT.md secao `notebook` e NOTEBOOK_* em shared/component-sets.js.
  notebook: {
    roles: ["B", "D"],
  },

  pedagogicalGuard: ({ ea = "", componentProps = {} }) => {
    const targets = componentProps.targets || [];
    const labels = componentProps.labels || [];
    const mapping = componentProps.correctMapping || {};
    if (targets.some((t) => !mapping[t.id]))
      return "todo target precisa aparecer em correctMapping";
    const labelSet = new Set(labels.map(normalize));
    for (const value of Object.values(mapping)) {
      if (!labelSet.has(normalize(value))) return "correctMapping usa label fora de labels";
    }
    const expected = targets.map((t) => `${t.id}=${mapping[t.id]}`).join(";");
    if (normalize(ea) !== normalize(expected)) return "expectedAnswer nao bate com correctMapping";
    return null;
  },

  examples: [
    {
      context: "Ciencias EF - organelas",
      instruction: "Arraste cada rotulo para a parte correta da celula.",
      expectedAnswer: "nucleo=Nucleo;membrana=Membrana",
      componentProps: {
        svgInline:
          "<svg viewBox='0 0 100 60'><ellipse cx='50' cy='30' rx='40' ry='22' fill='#eef'/></svg>",
        targets: [
          { id: "nucleo", x: 50, y: 45 },
          { id: "membrana", x: 15, y: 50 },
        ],
        labels: ["Nucleo", "Membrana"],
        correctMapping: { nucleo: "Nucleo", membrana: "Membrana" },
      },
    },
  ],
};
