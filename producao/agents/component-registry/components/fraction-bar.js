/**
 * fraction_bar — barra fracionada interativa.
 *
 * Spec enriquecida (SPEC-FORMAT.md). Constraints declarados explicitamente
 * pra que Agent 6 LEIA antes de gerar e respeite por construção.
 */

import { z } from "zod";

const componentPropsSchema = z
  .object({
    numerator: z.number().int().min(0).max(24).optional(),
    denominator: z.number().int().min(2).max(24),
    mode: z.enum(["identify", "equivalence", "sum"]).optional(),
    visualModel: z.enum(["bar", "circle", "pizza"]).optional(),
    contextLabel: z.string().max(100).optional(),
    label: z.string().max(80).optional(),
    targetDenominator: z.number().int().min(2).max(24).optional(),
    secondaryFraction: z.any().optional(),
    operand1: z.any().optional(),
    operand2: z.any().optional(),
  })
  .passthrough();

export default {
  id: "fraction_bar",
  rendererPath: "frontend/src/components/RichStep/FractionBar.jsx",
  description: "Barra de fracao. Sem options, aluno clica nas partes para produzir uma fracao.",

  schema: componentPropsSchema,

  answerContract: {
    accepts: ["fraction"],
    rejects: ["numeric-pure", "boolean", "ok-token", "mapping-pairs", "text-long"],
  },

  // 2026-08-16 (F0 do caderno): papel deste componente no modo worksheet;
  // ver SPEC-FORMAT.md secao `notebook` e NOTEBOOK_* em shared/component-sets.js.
  notebook: {
    roles: ["B", "C", "D"],
    targets: {
      kinds: ["bar"],
      answerKindByKind: { bar: "fraction" },
    },
  },

  // CONSTRAINTS declarados (SoT — Agent 6 lê isso no prompt)
  constraints: {
    expectedAnswer: {
      shape: "fraction",
      regex: /^\d+\s*\/\s*\d+$/,
      examples: ["1/2", "3/4", "2/5", "5/8"],
      reason: "fraction_bar visualiza N/D — EA precisa ser fracionário",
    },
    componentProps: {
      denominator: {
        type: "integer",
        min: 2,
        max: 24,
        required: true,
        reason:
          "Visibilidade da barra: denominador > 24 = células microscópicas, ilegível pro aluno",
      },
      numerator: {
        type: "integer",
        min: 0,
        max: 24,
        required: false,
        reason: "Quando informado, deve casar com numerador do EA",
      },
      mode: {
        type: "enum",
        values: ["identify", "equivalence", "sum"],
        required: false,
      },
      visualModel: {
        type: "enum",
        values: ["bar", "circle", "pizza"],
        required: false,
        reason:
          "A representacao deve acompanhar o contexto: pizza para pizza, circle para bolo/disco e bar para parte-todo abstrato",
      },
    },
  },

  // LLM GUIDANCE estruturada (substitui whenToUse/whenNotToUse vagos)
  llmGuidance: {
    useWhen: [
      "expectedAnswer é fração simples (N/D) com denominador ≤ 24",
      "Aluno precisa visualizar a fração ou pintar partes pra representá-la",
      "Use visualModel='pizza' quando a narrativa fala em pizza; 'circle' para bolo/torta/disco; 'bar' para representação abstrata",
      "Modos: identify (parte da fração), equivalence (fração equivalente), sum (somar frações)",
      "mode SO com options: identify/equivalence/sum desenham a fracao pronta e o aluno ESCOLHE entre alternativas; sem mode (e sem options) o aluno CLICA nas partes e produz N/D sozinho",
    ],
    avoidWhen: [
      "expectedAnswer numérico puro (use numeric_keypad)",
      "Denominador > 24 — barra fica ilegível (use renderAs='text' com EA fracionário, OU simplifique a fração primeiro)",
      "Equação algébrica ou expressão com fração (use equation_builder ou text)",
      "Pergunta 'Identifique o numerador/denominador de N/D' — vaza resposta na visualização (use multiple_choice)",
      "mode (identify/equivalence/sum) SEM options: a barra vira so ilustracao e o aluno nao tem onde responder (passo impossivel)",
    ],
    goodExamples: [
      {
        instruction: "Pinte 1 parte de 2 para representar metade.",
        expectedAnswer: "1/2",
        componentProps: { denominator: 2, visualModel: "bar" },
      },
      {
        instruction: "Marque na pizza as três das oito fatias que foram servidas.",
        expectedAnswer: "3/8",
        componentProps: {
          denominator: 8,
          visualModel: "pizza",
          contextLabel: "Pizza dividida em 8 fatias",
        },
      },
      {
        // 2026-08-16 (caderno F4): mode exige options; sem elas este exemplo
        // era um passo sem input (ver pedagogicalGuard mode-without-input).
        instruction: "Escolha a fração equivalente a 1/3 com denominador 6.",
        expectedAnswer: "2/6",
        componentProps: { denominator: 6, mode: "equivalence", targetDenominator: 6 },
        options: [
          { value: "2/6", isCorrect: true },
          { value: "1/6", isCorrect: false },
          { value: "3/6", isCorrect: false },
        ],
      },
    ],
    badExamples: [
      {
        attempt: {
          expectedAnswer: "25/30",
          componentProps: { denominator: 30 },
        },
        reason: "denominator > 24 — vai falhar no schema Zod e ser dropado",
        solution:
          "Simplifique pra '5/6' (denominator: 6) OU use renderAs='text' OU use numeric_keypad com EA decimal equivalente",
      },
      {
        attempt: { expectedAnswer: "0.5", componentProps: { denominator: 2 } },
        reason: "expectedAnswer decimal — fraction_bar espera fração N/D",
        solution: "Mude EA pra '1/2' OU mude renderAs pra numeric_keypad",
      },
      {
        attempt: {
          expectedAnswer: "2/6",
          componentProps: { denominator: 6, mode: "equivalence" },
        },
        reason:
          "mode sem options: o renderer desenha a equivalencia pronta e nao oferece input (nem clique nas partes, nem alternativas)",
        solution:
          "Remova mode (aluno clica nas partes e produz 2/6) OU mantenha mode e forneca options com a fracao correta e distratores",
      },
    ],
  },

  // REPAIRS — estratégias de conversão quando validate falha (antes de drop)
  repairs: {
    "denominator-too-big": (step) => {
      // Tenta simplificar primeiro
      const match = String(step.expectedAnswer || "").match(/^(\d+)\s*\/\s*(\d+)$/);
      if (match) {
        const num = Number(match[1]);
        const den = Number(match[2]);
        const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
        const g = gcd(num, den);
        if (g > 1 && den / g <= 24) {
          return {
            ...step,
            expectedAnswer: `${num / g}/${den / g}`,
            componentProps: { ...step.componentProps, denominator: den / g, numerator: num / g },
          };
        }
      }
      // Não simplifica — converte pra text input (preserva EA fracionário)
      return {
        ...step,
        renderAs: "text",
        componentProps: {},
        _repairedFrom: "fraction_bar",
        _repairReason: "denominator > 24",
      };
    },
    "denominator-mismatch": (step) => {
      const match = String(step.expectedAnswer || "").match(/^\d+\s*\/\s*(\d+)$/);
      if (!match) return null;
      const den = Number(match[1]);
      if (den < 2 || den > 24) return null;
      return {
        ...step,
        componentProps: { ...(step.componentProps || {}), denominator: den },
      };
    },
    // 2026-08-16 (caderno F4, tarefa 2): mode sem options e passo IMPOSSIVEL
    // (ver pedagogicalGuard). O reparo mais fiel a intencao do autor e tirar o
    // mode: a barra volta ao modo interativo (aluno clica nas partes e produz
    // N/D), com denominator, visualModel e contextLabel preservados. Nao
    // inventa options nem troca de componente.
    "mode-without-input": (step) => {
      const cp = { ...(step.componentProps || {}) };
      if (!Object.hasOwn(cp, "mode")) return null;
      delete cp.mode;
      const ea = String(step.expectedAnswer || "").trim();
      return {
        ...step,
        componentProps: cp,
        acceptableVariations: [...new Set([ea, ...(step.acceptableVariations || [])])].filter(
          Boolean
        ),
        _repairedFrom: "fraction_bar:mode-without-input",
        _repairReason: "mode sem options nao oferece input; mode removido",
      };
    },
    "ea-not-fractional": (step) => {
      // EA não é fração — converte pra numeric_keypad ou text
      const ea = String(step.expectedAnswer || "").trim();
      if (/^-?\d+([.,]\d+)?$/.test(ea)) {
        return {
          ...step,
          renderAs: "numeric_keypad",
          componentProps: {},
          _repairedFrom: "fraction_bar",
          _repairReason: "EA numérico, não fracionário",
        };
      }
      return {
        ...step,
        renderAs: "text",
        componentProps: {},
        _repairedFrom: "fraction_bar",
        _repairReason: "EA não-fracionário",
      };
    },
  },

  pedagogicalGuard: ({ ea = "", componentProps = {}, kc = "", instruction = "", options = [] }) => {
    // Anti-leak: pergunta de identificação vaza resposta na visualização
    const k = String(kc).toLowerCase();
    if (
      /identific|qual[_-]?(o|e|a)/.test(k) &&
      /(numerador|denominador|numerator|denominator)/.test(k)
    ) {
      return "anti-leak: identificar numerador/denominador com fraction_bar vaza resposta";
    }
    // 2026-08-16 (caderno F4, tarefa 2): FractionBar.jsx so e interativo
    // (aluno clica nas partes) quando NAO ha mode; com mode
    // identify/equivalence/sum ele desenha a fracao pronta e espera options
    // para o aluno escolher. mode sem options = visual sem nenhum input =
    // passo impossivel. errorCode proprio para o reparo (remove o mode) rodar
    // antes de qualquer troca de componente. Vale nos dois modos: e o
    // contrato do renderer, nao politica de interface.
    if (componentProps.mode && (!Array.isArray(options) || options.length === 0)) {
      return {
        message: `fraction_bar com mode=${componentProps.mode} exige options (sem options o aluno nao tem onde responder)`,
        errorCode: "mode-without-input",
      };
    }
    // Coerência: EA precisa ser fração
    const match = String(ea || "").match(/^\s*(-?\d+)\s*\/\s*(\d+)\s*$/);
    if (!match) {
      return {
        message: "fraction_bar precisa de expectedAnswer fracionario",
        errorCode: "ea-not-fractional",
      };
    }
    // Coerência: denominator dos props bate com EA
    const den = Number(match[2]);
    if (componentProps.denominator != null && Number(componentProps.denominator) !== den) {
      return {
        message: "denominator do componente nao bate com expectedAnswer",
        errorCode: "denominator-mismatch",
      };
    }
    return null;
  },

  // Retrocompatibilidade — derivados de llmGuidance
  whenToUse: [
    "expectedAnswer é fração simples (denominador ≤ 24)",
    "Identificar numerador/denominador visualmente",
    "Construir fração clicando em partes iguais",
  ],
  whenNotToUse: [
    "Resposta decimal ou número inteiro (use numeric_keypad/number_line)",
    "Denominador > 24 (use text ou simplifique a fração)",
    "Equação algébrica com frações (use equation_builder ou text)",
  ],

  examples: [
    {
      context: "Matematica EF - representar fração",
      instruction: "Pinte a barra para formar três quartos.",
      expectedAnswer: "3/4",
      componentProps: { denominator: 4 },
    },
  ],
};
