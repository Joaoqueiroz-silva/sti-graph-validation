/**
 * text - fallback textual padrao do TutorView.
 *
 * Nao e um RichStep, mas aparece como renderAs legado. O renderer trata
 * renderAs="text" como input digitado comum; este contrato existe para que
 * nenhum renderAs conhecido fique fora do registry.
 */

import { z } from "zod";

const componentPropsSchema = z.object({}).passthrough();

export default {
  id: "text",
  rendererPath: "frontend/src/pages/TutorView.jsx",

  description:
    "Input textual livre do TutorView; fallback seguro quando nao ha componente visual adequado.",

  whenToUse: [
    "Resposta curta digitada",
    "Nenhum componente visual registrado melhora o step",
    "Compatibilidade com renderAs=text legado",
  ],

  whenNotToUse: [
    "Quando o step tem alternatives/options",
    "Quando a resposta e token interno ok/acertou",
    "Quando existe componente deterministico mais especifico",
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

  pedagogicalGuard: ({ options = [] }) => {
    if (Array.isArray(options) && options.length > 0) {
      // 2026-08-05 ("Missão: Frações em Ação", modo simples): devolvia string
      // sem errorCode — sem repair mapeável, dois passos VÁLIDOS foram
      // REMOVIDOS só porque um estágio intermediário pendurou options num
      // step de digitação. Padrão-raiz do repo: conteúdo bom descartado por
      // condição trivialmente reparável.
      return { message: "text nao deve carregar options", errorCode: "text-com-options" };
    }
    return null;
  },

  repairs: {
    "text-com-options": (step) => {
      const chave = (v) =>
        String(v ?? "")
          .trim()
          .toLowerCase()
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "");
      const ea = chave(step.expectedAnswer);
      const options = Array.isArray(step.options) ? step.options : [];
      const valorDe = (o) => o?.value ?? o?.label ?? "";
      const semDuplicata = new Set(options.map((o) => chave(valorDe(o)))).size === options.length;
      const candidatas = options.filter((o) => chave(valorDe(o)) === ea);
      // Vira multiple_choice SÓ quando satisfaz o guard estrito do MC:
      // exatamente 1 option igual ao gabarito, 2-6 no total, sem duplicata.
      // Preserva os distratores diagnósticos em vez de jogá-los fora.
      if (ea && candidatas.length === 1 && semDuplicata && options.length >= 2) {
        let corrigidas = options.map((o) => ({ ...o, isCorrect: chave(valorDe(o)) === ea }));
        if (corrigidas.length > 6) {
          // Teto do guard do MC é 6 — corta distratores excedentes, nunca a correta.
          const correta = corrigidas.find((o) => o.isCorrect);
          corrigidas = [correta, ...corrigidas.filter((o) => !o.isCorrect).slice(0, 5)];
        }
        return {
          ...step,
          renderAs: "multiple_choice",
          componentId: "multiple_choice",
          options: corrigidas,
        };
      }
      // Options sem a resposta (ou ambíguas) são lista morta — remove e o
      // passo segue como digitação, que era a intenção original.
      return { ...step, options: [] };
    },
  },

  examples: [
    {
      context: "Resposta textual curta",
      instruction: "Escreva o nome do processo em que a agua vira vapor.",
      expectedAnswer: "evaporacao",
      componentProps: {},
    },
  ],
};
