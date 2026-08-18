/**
 * multiple_choice - fallback estavel para escolha unica.
 *
 * O renderer usa step.options como fonte principal. O schema fica pequeno; as
 * invariantes importantes vivem no pedagogicalGuard porque dependem de
 * expectedAnswer + options.
 */

import { z } from "zod";

const componentPropsSchema = z.object({}).passthrough();

const FILLER_OPTIONS = new Set([
  "outro valor",
  "outro",
  "nao sei",
  "não sei",
  "i don't know",
  "dont know",
  "do not know",
]);

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function optionValue(opt) {
  return String(opt?.value ?? opt?.label ?? opt?.text ?? "").trim();
}

export default {
  id: "multiple_choice",
  rendererPath: "frontend/src/pages/TutorView.jsx",

  description:
    "Escolha unica com 2-6 alternativas. Deve ser fallback seguro quando nenhum componente interativo especifico cabe.",

  whenToUse: [
    "Pergunta categorica com uma unica resposta correta entre alternativas",
    "Fallback quando nao ha componente visual apropriado e a resposta cabe numa opcao curta",
    "Distraidores pedagogicos ligados a misconceptions via misconceptionId",
  ],

  whenNotToUse: [
    "Classificacao de varios itens (use card_sort_lab/card_sort)",
    "Pareamento 1:1 (use matching_pairs/memory_game)",
    "Ordenacao, lacunas, diagramas, mapa conceitual ou entrada numerica direta",
    "Token interno ok/acertou/completo de laboratorio",
  ],

  schema: componentPropsSchema,

  answerContract: {
    accepts: [
      "numeric-pure",
      "numeric-with-unit",
      "shape-name",
      "sequence",
      "coordinate",
      "fraction",
      "expression",
      "time",
      "boolean",
      "text-short",
      "text-long",
      "unknown",
    ],
    rejects: ["ok-token", "mapping-pairs", "assignment-map", "edge-map"],
  },

  // 2026-08-16 (F0 do caderno): papel deste componente no modo worksheet;
  // ver SPEC-FORMAT.md secao `notebook` e NOTEBOOK_* em shared/component-sets.js.
  notebook: {
    roles: ["A"],
  },

  pedagogicalGuard: ({ ea = "", options = [] }) => {
    if (!Array.isArray(options) || options.length < 2)
      return "multiple_choice precisa de 2+ options";
    if (options.length > 6) return "multiple_choice deve ter no maximo 6 options";

    const expected = normalize(ea);
    if (!expected) return "expectedAnswer vazio";

    const values = options.map(optionValue).map(normalize).filter(Boolean);
    if (values.length !== options.length) return "option sem value/label";
    if (new Set(values).size !== values.length) return "options duplicadas";

    const fillers = values.filter((value) => FILLER_OPTIONS.has(value));
    if (fillers.length > 0) return "options contem filler generico";

    const explicitCorrect = options.filter((opt) => opt?.isCorrect === true);
    if (explicitCorrect.length !== 1) return "precisa de exatamente 1 option isCorrect=true";

    const correctValue = normalize(optionValue(explicitCorrect[0]));
    if (correctValue !== expected) return "option correta nao bate com expectedAnswer";
    if (!values.includes(expected)) return "options nao contem expectedAnswer";

    return null;
  },

  examples: [
    {
      context: "Ciencias EF - escolha categorica",
      instruction: "Qual animal e vertebrado?",
      expectedAnswer: "sapo",
      componentProps: {},
      options: [
        { value: "sapo", label: "Sapo", isCorrect: true },
        {
          value: "minhoca",
          label: "Minhoca",
          isCorrect: false,
          misconceptionId: "misc_sem_coluna",
        },
        { value: "caracol", label: "Caracol", isCorrect: false, misconceptionId: "misc_concha" },
      ],
    },
  ],
};
