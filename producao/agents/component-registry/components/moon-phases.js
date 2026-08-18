/**
 * moon_phases - selecao de fase lunar (5 fases). Aluno escolhe a fase observada
 * da Terra; a resposta emitida pelo componente e o ID da fase.
 *
 * Contrato derivado de frontend/src/components/RichStep/MoonPhases.jsx (PHASES +
 * ALIASES + normalizePhaseId) e alinhado ao routing manifest moon_phases
 * (component-registry-lab-manifests.js): answerContract accepts text-short.
 */

import { z } from "zod";

// Espelha PHASES + ALIASES do componente.
const PHASE_IDS = ["nova", "crescente", "quarto_crescente", "cheia", "quarto_minguante"];
const ALIASES = {
  new: "nova",
  waxing: "crescente",
  first_quarter: "quarto_crescente",
  full: "cheia",
  last_quarter: "quarto_minguante",
  waning: "quarto_minguante",
};

function normalizePhaseId(raw) {
  if (!raw) return null;
  const s = String(raw).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "_");
  if (PHASE_IDS.includes(s)) return s;
  return ALIASES[s] || null;
}

const componentPropsSchema = z
  .object({
    mode: z.enum(["answer", "explore"]).optional(),
    prompt: z.string().optional(),
  })
  .passthrough();

export default {
  id: "moon_phases",
  rendererPath: "frontend/src/components/RichStep/MoonPhases.jsx",

  description:
    "Simulador Sol/Terra/Lua com 5 fases. Aluno seleciona a fase observada da Terra; a resposta e o id da fase (nova, crescente, quarto_crescente, cheia, quarto_minguante).",

  whenToUse: [
    "Identificar a fase lunar dada uma configuracao orbital",
    "Relacao Sol/Terra/Lua e ciclo lunar (BNCC EF08CI12)",
    "Substituir multipla escolha sobre fases por exploracao ativa",
  ],

  whenNotToUse: [
    "EA numerica, fracao, tempo ou coordenada",
    "Conteudo fora de fases da Lua / astronomia",
  ],

  schema: componentPropsSchema,

  answerContract: {
    accepts: ["text-short", "unknown"],
    rejects: ["numeric-pure", "numeric-with-unit", "fraction", "coordinate", "time", "expression"],
  },

  // 2026-08-16 (F0 do caderno): papel deste componente no modo worksheet;
  // ver SPEC-FORMAT.md secao `notebook` e NOTEBOOK_* em shared/component-sets.js.
  notebook: {
    roles: ["B", "D"],
  },

  constraints: {
    expectedAnswer: {
      shape: "text-short",
      enum: PHASE_IDS,
      reason: "EA deve ser uma das 5 fases lunares (ou um alias que normalize a uma)",
    },
    componentProps: {
      mode: { type: "enum", values: ["answer", "explore", null], required: false },
    },
  },

  llmGuidance: {
    useWhen: [
      "EA e uma fase lunar (nova/crescente/quarto_crescente/cheia/quarto_minguante)",
      "Step ensina identificacao de fases ou ciclo lunar",
    ],
    avoidWhen: ["EA numerica/fracao/tempo/coordenada", "KC fora de fases da Lua"],
    goodExamples: [
      {
        instruction: "Qual fase a Lua mostra quando esta alinhada do lado oposto ao Sol?",
        expectedAnswer: "cheia",
      },
    ],
    badExamples: [
      {
        attempt: { expectedAnswer: "42" },
        reason: "EA nao e uma fase lunar",
        solution: "Use multiple_choice ou numeric_keypad",
      },
    ],
  },

  repairs: {
    "ea-not-a-phase": (step) => ({
      ...step,
      renderAs: "multiple_choice",
      componentProps: {},
      _repairedFrom: "moon_phases",
      _repairReason: "EA nao e uma fase lunar valida",
    }),
  },

  pedagogicalGuard: ({ ea = "" }) => {
    if (!normalizePhaseId(ea)) {
      return {
        message:
          "moon_phases aceita apenas uma das 5 fases lunares (nova, crescente, quarto_crescente, cheia, quarto_minguante)",
        errorCode: "ea-not-a-phase",
      };
    }
    return null;
  },

  examples: [
    {
      context: "Ciencias EF - fases da Lua (EF08CI12)",
      instruction: "Qual fase a Lua mostra quando esta alinhada do lado oposto ao Sol?",
      expectedAnswer: "cheia",
      componentProps: {},
    },
  ],
};
