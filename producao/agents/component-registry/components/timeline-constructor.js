/**
 * timeline_constructor - encaixe de eventos em slots cronologicos.
 */

import { z } from "zod";

const slotSchema = z
  .object({
    id: z.string().min(1).max(48),
    label: z.string().min(1).max(80),
  })
  .passthrough();

const componentPropsSchema = z
  .object({
    slots: z.array(slotSchema).min(2).max(8),
    events: z.array(z.string().min(1).max(120)).min(2).max(8),
    correctMapping: z.record(z.string().min(1)),
    hint: z.string().max(180).optional(),
  })
  .passthrough();

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

/**
 * Lê os pares "chave=valor" do gabarito. Prefere ";" e só aceita "," quando
 * TODAS as partes têm exatamente um "=" — senão um evento como
 * "Marco de Touros (1501), padrão de pedra" seria partido ao meio.
 */
export function parseAssignmentPairs(expectedAnswer) {
  const bruto = String(expectedAnswer ?? "").trim();
  if (!bruto) return [];
  const tentar = (separador) => {
    const partes = bruto
      .split(separador)
      .map((parte) => parte.trim())
      .filter(Boolean);
    if (partes.length < 2) return null;
    if (!partes.every((parte) => /^[^=]+=[^=]+$/.test(parte))) return null;
    return partes.map((parte) => {
      const corte = parte.indexOf("=");
      return [parte.slice(0, corte).trim(), parte.slice(corte + 1).trim()];
    });
  };
  return tentar(";") || tentar(",") || [];
}

/** "inicio_colonial" -> "Inicio colonial" (o aluno lê o rótulo do slot). */
export function humanizeSlotId(id) {
  const texto = String(id ?? "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!texto) return "";
  return (texto[0].toUpperCase() + texto.slice(1)).slice(0, 80);
}

export default {
  id: "timeline_constructor",
  rendererPath: "frontend/src/components/RichStep/v2/TimelineConstructor.jsx",

  description: "Aluno arrasta eventos para slots de uma linha do tempo.",

  whenToUse: [
    "Ordenar eventos historicos/cientificos por ano ou etapa",
    "Associar evento a data/periodo",
    "Sequencia cronologica com 2-8 eventos",
  ],

  whenNotToUse: [
    "Sequencia sem datas/slots (use drag_to_order ou image_sequence)",
    "Pareamento conceitual nao temporal",
    "Resposta numerica unica",
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

  repairs: {
    // 2026-08-04 (STI "Guia do Forte", P3): o agente 6 escolheu
    // timeline_constructor e não preencheu slots/events/correctMapping. Schema
    // falhou, o passo foi re-roteado para `text` e acabou removido — com um
    // gabarito "inicio_colonial=Marco de Touros (1501)" que o aluno teria de
    // digitar. Mas esse gabarito É o mapeamento da linha do tempo: os slots são
    // as chaves e os eventos são os valores. Mesmo padrão do concept_map.
    "schema-fail": (step) => {
      const pares = parseAssignmentPairs(step?.expectedAnswer);
      if (pares.length < 2 || pares.length > 8) return null;

      const slots = pares.map(([chave]) => ({ id: chave, label: humanizeSlotId(chave) }));
      if (new Set(slots.map((s) => s.id)).size !== slots.length) return null;
      if (slots.some((s) => !s.id || s.id.length > 48 || !s.label)) return null;

      const events = pares.map(([, valor]) => valor);
      if (events.some((e) => !e || e.length > 120)) return null;
      if (new Set(events.map((e) => e.toLowerCase())).size !== events.length) return null;

      const correctMapping = Object.fromEntries(pares);
      const canonico = slots.map((s) => `${s.id}=${correctMapping[s.id]}`).join(";");
      const original = String(step?.expectedAnswer ?? "").trim();

      return {
        ...step,
        // O guard exige a serialização canônica com ";".
        expectedAnswer: canonico,
        acceptableVariations: [
          ...new Set([canonico, original, ...(step?.acceptableVariations || [])]),
        ].filter(Boolean),
        componentProps: { ...(step?.componentProps || {}), slots, events, correctMapping },
        _repairedFrom: "timeline_constructor:mapping-from-answer",
      };
    },
  },

  pedagogicalGuard: ({ ea = "", componentProps = {} }) => {
    const slots = componentProps.slots || [];
    const events = componentProps.events || [];
    const mapping = componentProps.correctMapping || {};
    if (slots.some((s) => !mapping[s.id])) return "todo slot precisa aparecer em correctMapping";
    const eventSet = new Set(events.map(normalize));
    for (const value of Object.values(mapping)) {
      if (!eventSet.has(normalize(value))) return "correctMapping usa evento fora de events";
    }
    const expected = slots.map((s) => `${s.id}=${mapping[s.id]}`).join(";");
    if (normalize(ea) !== normalize(expected)) return "expectedAnswer nao bate com correctMapping";
    return null;
  },

  examples: [
    {
      context: "Historia EF - cronologia",
      instruction: "Coloque cada evento no ano correto.",
      expectedAnswer: "1500=Chegada ao Brasil;1822=Independencia",
      componentProps: {
        slots: [
          { id: "1500", label: "1500" },
          { id: "1822", label: "1822" },
        ],
        events: ["Chegada ao Brasil", "Independencia"],
        correctMapping: { 1500: "Chegada ao Brasil", 1822: "Independencia" },
      },
    },
  ],
};
