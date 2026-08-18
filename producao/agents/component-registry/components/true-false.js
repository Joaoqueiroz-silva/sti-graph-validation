/**
 * true_false - pergunta booleana unica.
 *
 * O renderer legacy le step.config para labels/valores; componentProps existe
 * aqui apenas para o registry validar a intencao sem acoplar ao frontend.
 */

import { z } from "zod";

const componentPropsSchema = z
  .object({
    statement: z.string().min(4).max(220).optional(),
    trueValue: z.string().min(1).max(24).optional(),
    falseValue: z.string().min(1).max(24).optional(),
    trueLabel: z.string().min(1).max(40).optional(),
    falseLabel: z.string().min(1).max(40).optional(),
  })
  .passthrough();

const TRUE_VALUES = new Set([
  "verdadeiro",
  "true",
  "yes",
  "sim",
  "si",
  "verdadero",
  "verdadera",
  "vrai",
  "v",
]);
const FALSE_VALUES = new Set(["falso", "false", "no", "nao", "faux", "f"]);

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function boolOf(value) {
  const norm = normalize(value);
  if (TRUE_VALUES.has(norm)) return true;
  if (FALSE_VALUES.has(norm)) return false;
  return null;
}

export default {
  id: "true_false",
  rendererPath: "frontend/src/components/VisualInputs.jsx",

  description: "Pergunta unica de verdadeiro/falso, com valores idioma-aware para PT/EN/ES/FR.",

  whenToUse: [
    "Uma afirmacao unica que o aluno deve marcar como verdadeira ou falsa",
    "Checagem binaria curta antes de seguir para uma atividade maior",
  ],

  whenNotToUse: [
    "Tres ou mais afirmacoes V/F sobre a mesma KC (use true_false_lab)",
    "Pergunta com mais de duas alternativas (use multiple_choice)",
    "Resposta numerica, textual, classificacao ou pareamento",
  ],

  schema: componentPropsSchema,

  answerContract: {
    accepts: ["boolean"],
    rejects: [
      "numeric-pure",
      "numeric-with-unit",
      "fraction",
      "time",
      "coordinate",
      "expression",
      "ok-token",
      "mapping-pairs",
      "assignment-map",
      "edge-map",
    ],
  },

  // 2026-08-16 (F0 do caderno): papel deste componente no modo worksheet;
  // ver SPEC-FORMAT.md secao `notebook` e NOTEBOOK_* em shared/component-sets.js.
  notebook: {
    roles: ["A"],
  },

  pedagogicalGuard: ({ ea = "", options = [], componentProps = {}, step = {} }) => {
    if (boolOf(ea) === null) return "expectedAnswer nao e booleano";
    const config = step.config || {};
    const trueValue = normalize(componentProps.trueValue || config.trueValue || "verdadeiro");
    const falseValue = normalize(componentProps.falseValue || config.falseValue || "falso");
    if (trueValue === falseValue) return "trueValue e falseValue iguais";
    // 2026-08-16 (caderno F4, tarefa 1): o gate estrutural (structural-gate.js,
    // bloco "dedup SEMANTICO de T/F") GRAVA step.options = [lexema correto,
    // lexema oposto] em todo true_false, e este guard rejeitava QUALQUER
    // options. Resultado: validate pos-gate reprovava o passo e a cascata o
    // convertia em dynamic_spec (passo V/F virava cena). A menor mudanca
    // segura e aceitar options SE E SOMENTE SE forem exatamente os dois
    // lexemas booleanos (um verdadeiro, um falso; lexicos TRUE_VALUES /
    // FALSE_VALUES ou os trueValue/falseValue configurados). Tres ou mais
    // alternativas, ou alternativas nao booleanas, continuam rejeitadas
    // (isso e multiple_choice, nao true_false). Vale nos dois modos: o
    // contrato nao muda por interfaceMode.
    if (Array.isArray(options) && options.length > 0) {
      const optionBool = (option) => {
        const raw = normalize(option?.value ?? option?.label ?? "");
        if (raw === trueValue) return true;
        if (raw === falseValue) return false;
        return boolOf(raw);
      };
      if (options.length !== 2) return "true_false so aceita options com os dois lexemas booleanos";
      const classes = options.map(optionBool);
      if (classes.some((c) => c === null)) return "true_false nao aceita options nao booleanas";
      if (classes[0] === classes[1]) return "true_false precisa de um lexema verdadeiro e um falso";
    }
    return null;
  },

  examples: [
    {
      context: "Ciencias EF - afirmacao unica",
      instruction: "A minhoca possui coluna vertebral.",
      expectedAnswer: "falso",
      componentProps: { statement: "A minhoca possui coluna vertebral." },
    },
  ],
};
