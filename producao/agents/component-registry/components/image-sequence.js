/**
 * image_sequence — ordenação cronológica de 3-7 etapas.
 */

import { z } from "zod";

const imageItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(2).max(60),
  emoji: z.string().min(1).max(8).optional(),
});

const componentPropsSchema = z
  .object({
    images: z.array(imageItemSchema).min(3).max(7),
  })
  .refine(
    (data) => {
      const ids = new Set(data.images.map((i) => i.id));
      return ids.size === data.images.length;
    },
    { message: "Cada image precisa de id único" }
  );

export default {
  id: "image_sequence",
  rendererPath: "frontend/src/components/RichStep/ImageSequence.jsx",

  description:
    "Ordenação cronológica de 3-7 etapas com emojis/imagens. Aluno arrasta pra ordem certa.",

  whenToUse: [
    "Ciclos naturais: água, vida da planta, fotossíntese, dia/noite",
    "Linha do tempo histórica: Brasil colônia → independência → república",
    "Etapas de processo: receitas, montagem, fluxo experimental",
    "3+ steps 'em qual ordem X acontece' / 'ordene as etapas' → fundir aqui",
  ],

  whenNotToUse: [
    "Classificação multi-categoria (use card_sort_lab)",
    "Pareamento 1:1 (use memory_game)",
    "Resposta numérica/booleana",
    "Quando não há ordem cronológica/sequencial real",
  ],

  schema: componentPropsSchema,

  answerContract: {
    accepts: ["sequence", "ok-token"],
    rejects: ["numeric-pure", "boolean", "shape-name"],
  },

  // 2026-08-16 (F0 do caderno): papel deste componente no modo worksheet;
  // ver SPEC-FORMAT.md secao `notebook` e NOTEBOOK_* em shared/component-sets.js.
  notebook: {
    roles: ["B", "D"],
  },

  pedagogicalGuard: ({ instruction = "", componentProps = {} }) => {
    const lower = String(instruction).toLowerCase();
    const imgs = componentProps.images || [];
    if (imgs.length < 3) return "image_sequence precisa de >=3 etapas";
    // Anti-pattern: instrução não sugere ordem
    const hasOrderKeyword =
      /\b(ordene|organize|sequência|sequencia|em ordem|primeiro|depois|antes|cronológic|cronologic|etapas?)\b/i.test(
        lower
      );
    if (!hasOrderKeyword) {
      return "instrução não menciona ordem/sequência — image_sequence pode estar errado aqui";
    }
    return null;
  },

  examples: [
    {
      context: "Ciências EF — ciclo da água",
      instruction: "Coloque em ordem as etapas do ciclo da água.",
      expectedAnswer: "ok",
      componentProps: {
        images: [
          { id: "evap", label: "Evaporação", emoji: "☀️" },
          { id: "cond", label: "Condensação", emoji: "☁️" },
          { id: "prec", label: "Precipitação", emoji: "🌧️" },
          { id: "infi", label: "Infiltração", emoji: "💧" },
        ],
      },
    },
    {
      context: "Ciências EF — ciclo de vida da borboleta",
      instruction: "Ordene as etapas do ciclo de vida da borboleta.",
      expectedAnswer: "ok",
      componentProps: {
        images: [
          { id: "ovo", label: "Ovo", emoji: "🥚" },
          { id: "larva", label: "Lagarta", emoji: "🐛" },
          { id: "casu", label: "Casulo", emoji: "🟫" },
          { id: "borb", label: "Borboleta", emoji: "🦋" },
        ],
      },
    },
  ],

  /**
   * Agregação: detecta 3+ steps com cardinalidade 1:1 onde:
   *  (a) instrução tem keyword de ordem, OR
   *  (b) ea pertence a sequência conhecida (etapas do ciclo da água, fases lunares, etc), OR
   *  (c) KC contém palavra-chave de processo/ciclo/etapa.
   */
  aggregationDetector(steps) {
    if (!Array.isArray(steps) || steps.length < 3) return null;
    const originalSteps = steps;

    // Dedup: se há eas duplicadas, mantém só primeira ocorrência de cada
    const seenEa = new Set();
    const dedupSteps = [];
    for (const s of steps) {
      const ea = String(s.expectedAnswer || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "");
      if (!ea || seenEa.has(ea)) continue;
      seenEa.add(ea);
      dedupSteps.push(s);
    }
    if (dedupSteps.length < 3 || dedupSteps.length > 7) return null;
    steps = dedupSteps;
    const eas = steps.map((s) => String(s.expectedAnswer || "").trim());
    const _uniqueEas = new Set(eas);

    const orderRegex =
      /\b(ordene|organize|sequência|sequencia|em\s+ordem|cronológic|cronologic|primeira|primeiro|depois|antes|\d+ª\s+etapa|etapa\s+\d+)\b/i;
    const kcOrderRegex = /(ciclo|etapa|fase|processo|sequenc|ordem|cronolog)/i;
    const KNOWN_SEQUENCES = [
      // ciclo da água
      ["evaporacao", "condensacao", "precipitacao", "infiltracao"],
      // ciclo de vida (borboleta)
      ["ovo", "larva", "lagarta", "casulo", "pupa", "borboleta"],
      // fases da lua
      ["nova", "crescente", "cheia", "minguante"],
      // estados da matéria (transição)
      ["solido", "liquido", "gasoso"],
    ];

    const easNorm = eas.map((e) => e.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""));
    const matchesKnownSeq = KNOWN_SEQUENCES.some((seq) =>
      easNorm.every((ea) => seq.some((s) => ea.includes(s) || s.includes(ea)))
    );

    const hasOrderInInstr = steps.some((s) => orderRegex.test(String(s.instruction || "")));
    const hasOrderInKc = steps.some((s) => kcOrderRegex.test(String(s.kc || "")));

    if (!hasOrderInInstr && !hasOrderInKc && !matchesKnownSeq) return null;

    // Se temos sequência conhecida, ordena os steps por essa sequência
    let ordered = steps;
    for (const seq of KNOWN_SEQUENCES) {
      if (easNorm.every((ea) => seq.some((s) => ea.includes(s) || s.includes(ea)))) {
        ordered = [...steps].sort((a, b) => {
          const aIdx = seq.findIndex((s) =>
            String(a.expectedAnswer).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(s)
          );
          const bIdx = seq.findIndex((s) =>
            String(b.expectedAnswer).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(s)
          );
          return aIdx - bIdx;
        });
        break;
      }
    }

    const images = ordered.map((s, i) => {
      const ea = String(s.expectedAnswer || "").trim();
      return {
        id: _slugify(ea) || `step_${i + 1}`,
        label: _capitalize(ea),
        emoji: "•",
      };
    });
    if (images.length < 3 || images.length > 7) return null;

    // Retorna TODOS os ids cuja ea bate com algum item agregado (incluindo duplicatas
    // dos steps originais que repetiam etapas do ciclo).
    const orderedEasNorm = new Set(
      ordered.map((s) =>
        String(s.expectedAnswer || "")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
      )
    );
    const allMatchingIds = originalSteps
      .filter((s) => {
        const ea = String(s.expectedAnswer || "")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "");
        return orderedEasNorm.has(ea);
      })
      .map((s) => s.id);

    return {
      componentId: "image_sequence",
      componentProps: { images },
      stepIds: allMatchingIds.length > 0 ? allMatchingIds : ordered.map((s) => s.id),
      instruction: "Coloque as etapas em ordem cronológica.",
      expectedAnswer: "ok",
    };
  },
};

function _slugify(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 24);
}

function _capitalize(s) {
  if (!s) return "";
  return String(s).charAt(0).toUpperCase() + String(s).slice(1);
}
