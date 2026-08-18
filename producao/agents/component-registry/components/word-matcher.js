/**
 * word_matcher - cards de palavras/opcoes curtas.
 */

import { z } from "zod";

const componentPropsSchema = z
  .object({
    prompt: z.string().max(180).optional(),
  })
  .passthrough();

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export default {
  id: "word_matcher",
  rendererPath: "frontend/src/components/RichStep/WordMatcher.jsx",

  description: "Cards grandes de palavras/opcoes curtas. Usa step.options como fonte dos cards.",

  whenToUse: [
    "Escolher uma palavra curta entre alternativas",
    "Ortografia, sinonimo/antonimo, classe gramatical ou vocabulario",
    "Pergunta categorica textual com 2-6 opcoes curtas",
  ],

  whenNotToUse: [
    "Pareamento 1:1 (use matching_pairs/memory_game)",
    "Texto com lacunas (use cloze_test)",
    "Resposta numerica, fracao, hora ou coordenada",
  ],

  schema: componentPropsSchema,

  answerContract: {
    accepts: ["text-short"],
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
    roles: ["A"],
  },

  // 2026-08-05 (auditoria Adjetivos): 3 passos morreram em "word_matcher
  // precisa de 2+ options (repair: no-repair-defined)". O material para as
  // options JA ESTAVA no passo: o gabarito + os wrongAnswer dos erros
  // previstos (behaviorMisconceptions/options autorais). errorCode
  // estruturado no guard para o repair-first do validador poder despachar.
  repairs: {
    "missing-options": (step) => {
      const ea = String(step?.expectedAnswer ?? "").trim();
      if (!ea || ea.length > 80) return null;
      const vistos = new Set([normalize(ea)]);
      const distratores = [];
      const fontes = [
        ...(step?.behaviorMisconceptions || []).map((m) => m?.wrongAnswer),
        ...(step?.options || []).filter((o) => !o?.isCorrect).map((o) => o?.value ?? o?.label),
      ];
      for (const bruto of fontes) {
        const valor = String(bruto ?? "").trim();
        if (!valor || valor.length > 80) continue;
        const chave = normalize(valor);
        if (!chave || vistos.has(chave)) continue;
        vistos.add(chave);
        distratores.push(valor);
        if (distratores.length >= 3) break;
      }
      // Sem pelo menos 1 distrator REAL nao ha carta honesta a montar —
      // devolve null e o passo segue para as outras redes (builder/rich).
      if (distratores.length < 1) return null;
      const options = [
        { value: ea, label: ea, isCorrect: true },
        ...distratores.map((d) => ({ value: d, label: d })),
      ];
      // Rotacao deterministica: a correta nao fica sempre em primeiro.
      const giro = options.length > 2 ? ea.length % options.length : 1;
      const embaralhadas = [...options.slice(giro), ...options.slice(0, giro)];
      return { ...step, options: embaralhadas, _repairedFrom: "word_matcher:options-from-step" };
    },
  },

  pedagogicalGuard: ({ ea = "", options = [] }) => {
    if (!Array.isArray(options) || options.length < 2)
      return { message: "word_matcher precisa de 2+ options", errorCode: "missing-options" };
    const expected = normalize(ea);
    const values = options.map((opt) => normalize(opt?.value ?? opt?.label)).filter(Boolean);
    if (!values.includes(expected))
      return { message: "options nao contem expectedAnswer", errorCode: "missing-options" };
    if (new Set(values).size !== values.length) return "options duplicadas";
    return null;
  },

  examples: [
    {
      context: "Portugues EF - classe gramatical",
      instruction: "Qual palavra e um verbo?",
      expectedAnswer: "correr",
      componentProps: { prompt: "Escolha a palavra correta." },
      options: [
        { value: "correr", label: "correr", isCorrect: true },
        { value: "casa", label: "casa" },
        { value: "azul", label: "azul" },
      ],
    },
  ],
};
