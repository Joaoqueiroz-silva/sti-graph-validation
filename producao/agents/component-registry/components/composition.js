/**
 * composition - layout controlado de componentes rich conhecidos.
 *
 * ComposedStep aceita apenas um subconjunto hardcoded:
 * place_value_blocks, fraction_bar, number_line, numeric_keypad.
 * Sem options, o renderer mostra NumericKeypad como input unificado; com
 * options, mostra botoes de escolha. O contrato reflete exatamente isso.
 */

import { z } from "zod";

const elementSchema = z
  .object({
    component: z.enum(["place_value_blocks", "fraction_bar", "number_line", "numeric_keypad"]),
    label: z.string().max(80).optional(),
    props: z.record(z.any()).optional(),
  })
  .passthrough();

const compositionSchema = z
  .object({
    layout: z.enum(["single", "compare", "transform", "equation"]).optional(),
    separator: z.string().max(12).optional(),
    separators: z.array(z.string().max(12)).max(4).optional(),
    elements: z.array(elementSchema).min(1).max(4),
  })
  .passthrough();

const componentPropsSchema = z
  .object({
    composition: compositionSchema.optional(),
  })
  .passthrough();

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function optionValue(opt) {
  if (typeof opt === "string") return opt;
  return String(opt?.value ?? opt?.label ?? opt?.text ?? "").trim();
}

export default {
  id: "composition",
  rendererPath: "frontend/src/components/RichStep/ComposedStep.jsx",

  description:
    "Composicao visual de 1-4 componentes rich conhecidos, com input numerico ou opcoes externas.",

  whenToUse: [
    "Comparar ou transformar representacoes matematicas pequenas",
    "Combinar fraction_bar/number_line/place_value_blocks com input unico",
    "A composicao tem papel instrucional real, nao decorativo",
  ],

  whenNotToUse: [
    "Qualquer componente fora do whitelist do ComposedStep",
    "Classificacao, pareamento ou resposta aberta longa",
    "Quando um unico componente registrado resolve o step",
  ],

  schema: componentPropsSchema,

  answerContract: {
    accepts: ["numeric-pure", "fraction", "text-short", "shape-name"],
    rejects: [
      "numeric-with-unit",
      "expression",
      "time",
      "boolean",
      "text-long",
      "ok-token",
      "mapping-pairs",
      "assignment-map",
      "edge-map",
    ],
  },

  // 2026-08-16 (F0 do caderno): papel deste componente no modo worksheet;
  // ver SPEC-FORMAT.md secao `notebook` e NOTEBOOK_* em shared/component-sets.js.
  notebook: {
    roles: ["B", "D"],
  },

  constraints: {
    componentProps: {
      composition: {
        type: "object",
        required: true,
        reason: "composition OBRIGATÓRIO com {layout, elements, separator?}",
        fields: {
          layout: { values: ["single", "compare", "transform", "equation"] },
          elements: {
            type: "array",
            min: 1,
            max: 4,
            allowedComponents: [
              "place_value_blocks",
              "fraction_bar",
              "number_line",
              "numeric_keypad",
            ],
          },
        },
      },
    },
    expectedAnswer: {
      shape: "numeric-pure|fraction|text-short",
      reason: "Sem options: numérico (digitado no keypad). Com options: bate com value",
    },
  },

  llmGuidance: {
    useWhen: [
      "Step COMPARA, TRANSFORMA ou RELACIONA 2+ representações matemáticas",
      "KC menciona equivalência, fator, antes/depois, conversão (layout compare/transform)",
      "Combinar fraction_bar + number_line, ou fraction_bar duplo, etc.",
    ],
    avoidWhen: [
      "Step é sobre UM único objeto isolado (use o componente direto, não composition)",
      "Você não pode preencher componentProps.composition com {layout, elements} — sem isso, falha",
      "Componente desejado fora do whitelist [place_value_blocks, fraction_bar, number_line, numeric_keypad]",
    ],
    goodExamples: [
      {
        instruction: "Qual o numerador equivalente a 1/2 com denominador 4?",
        expectedAnswer: "2",
        componentProps: {
          composition: {
            layout: "compare",
            separator: "=",
            elements: [
              {
                component: "fraction_bar",
                label: "Original",
                props: { numerator: 1, denominator: 2 },
              },
              { component: "fraction_bar", label: "Equivalente", props: { denominator: 4 } },
            ],
          },
        },
      },
    ],
    badExamples: [
      {
        attempt: { renderAs: "composition", componentProps: {} },
        reason: "componentProps.composition ausente — sem isso, registry rejeita",
        solution:
          "Preencher composition com {layout, elements} OU mudar renderAs pra componente único",
      },
    ],
  },

  repairs: {
    "composition-invalid": (step) => {
      // composition ausente/inválido — converte pra componente único
      const opts = Array.isArray(step.options) ? step.options : [];
      if (opts.length >= 2) {
        return {
          ...step,
          renderAs: "multiple_choice",
          componentProps: {},
          _repairedFrom: "composition",
        };
      }
      // Sem options — tentar componente único baseado no EA
      const ea = String(step.expectedAnswer || "").trim();
      if (/^\d+\/\d+$/.test(ea)) {
        const match = ea.match(/^(\d+)\/(\d+)$/);
        const den = Number(match[2]);
        if (den >= 2 && den <= 24) {
          return {
            ...step,
            renderAs: "fraction_bar",
            componentProps: { denominator: den },
            _repairedFrom: "composition",
          };
        }
      }
      if (/^-?\d+([.,]\d+)?$/.test(ea)) {
        return {
          ...step,
          renderAs: "numeric_keypad",
          componentProps: {},
          _repairedFrom: "composition",
        };
      }
      return {
        ...step,
        renderAs: "text",
        componentProps: {},
        _repairedFrom: "composition",
      };
    },
  },

  pedagogicalGuard: ({ ea = "", componentProps = {}, step = {}, options = [] }) => {
    const composition = step.composition || componentProps.composition;
    const parsed = compositionSchema.safeParse(composition);
    if (!parsed.success)
      return {
        message: "composition ausente ou invalida",
        errorCode: "composition-invalid",
      };

    const opts = Array.isArray(options) ? options : [];
    if (opts.length > 0) {
      if (opts.length < 2) return "composition com options precisa de 2+ options";
      const values = opts.map(optionValue).map(normalize).filter(Boolean);
      if (values.length !== opts.length) return "option sem value/label/text";
      if (!values.includes(normalize(ea))) return "options nao contem expectedAnswer";
      return null;
    }

    if (!/^-?\d+(?:[.,]\d+)?$/.test(String(ea || "").trim())) {
      return "composition sem options usa NumericKeypad e exige expectedAnswer numerico";
    }
    return null;
  },

  examples: [
    {
      context: "Matematica EF - comparar fracao e reta numerica",
      instruction: "Digite o numerador que falta.",
      expectedAnswer: "3",
      componentProps: {
        composition: {
          layout: "compare",
          separator: "=",
          elements: [
            { component: "fraction_bar", label: "Fracao", props: { numerator: 3, denominator: 4 } },
            { component: "number_line", label: "Reta", props: { min: 0, max: 1, marker: 0.75 } },
          ],
        },
      },
    },
  ],
};
