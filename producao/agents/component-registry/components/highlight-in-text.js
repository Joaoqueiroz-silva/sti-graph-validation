/**
 * highlight_in_text - selecionar palavra/trecho dentro de um texto.
 */

import { z } from "zod";

const componentPropsSchema = z
  .object({
    text: z.string().min(12).max(1600),
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
  id: "highlight_in_text",
  rendererPath: "frontend/src/components/RichStep/HighlightInText.jsx",

  description: "Aluno seleciona uma palavra ou trecho curto dentro de um texto fornecido.",

  whenToUse: [
    "Identificar palavra, termo, evidência ou trecho dentro de um paragrafo",
    "Compreensao textual com resposta presente no texto",
    "Gramática em contexto, como localizar verbo/adjetivo no periodo",
  ],

  whenNotToUse: [
    "Completar lacuna digitando (use cloze_test)",
    "Resposta que nao aparece no texto",
    "Resposta numerica ou visual",
  ],

  schema: componentPropsSchema,

  answerContract: {
    accepts: ["text-short", "text-long"],
    rejects: ["numeric-pure", "fraction", "time", "coordinate", "ok-token", "mapping-pairs"],
  },

  // 2026-08-16 (F0 do caderno): papel deste componente no modo worksheet;
  // ver SPEC-FORMAT.md secao `notebook` e NOTEBOOK_* em shared/component-sets.js.
  notebook: {
    roles: ["B", "C"],
    targets: {
      kinds: ["span"],
      answerKindByKind: { span: "text-short" },
    },
  },

  pedagogicalGuard: ({ ea = "", componentProps = {}, options = [] }) => {
    const text = normalize(componentProps.text);
    const expected = normalize(ea);
    if (!text.includes(expected)) return "expectedAnswer nao aparece no texto";
    if (!Array.isArray(options) || options.length < 1) {
      return "highlight_in_text precisa de options com trechos clicaveis";
    }
    const optionValues = options.map((opt) => normalize(opt?.value ?? opt?.label)).filter(Boolean);
    if (!optionValues.includes(expected)) return "options nao contem expectedAnswer";
    return null;
  },

  examples: [
    {
      context: "Portugues EF - identificar verbo",
      instruction: "Clique no verbo da frase.",
      expectedAnswer: "correu",
      componentProps: {
        text: "O cachorro correu pelo parque durante a tarde.",
        prompt: "Selecione o verbo.",
      },
      options: [{ value: "correu", label: "correu", isCorrect: true }],
    },
  ],
};
