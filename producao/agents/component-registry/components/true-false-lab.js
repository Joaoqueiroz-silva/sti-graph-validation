/**
 * true_false_lab — quiz V/F com 3-5 afirmações em sequência.
 */

import { z } from "zod";

const statementSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(8).max(180),
  isTrue: z.boolean(),
  explanation: z.string().min(4).max(180).optional(),
});

const componentPropsSchema = z.object({
  statements: z
    .array(statementSchema)
    .min(3, "true_false_lab precisa de 3+ afirmações pra valer a pena vs MC binário")
    .max(8),
});

export default {
  id: "true_false_lab",
  rendererPath: "frontend/src/components/RichStep/TrueFalseLab.jsx",

  description:
    "Quiz Verdadeiro/Falso com 3-5 afirmações sequenciais e feedback explicativo por afirmação.",

  whenToUse: [
    "Revisão de conceitos com 3+ afirmações binárias V/F",
    "Mitos vs verdades: 4-5 afirmações sobre alimentação saudável, fenômenos naturais, etc",
    "3+ steps consecutivos do tipo 'X é V ou F?' com mesma KC → fundir aqui",
    "Conferir compreensão de fatos históricos/científicos antes de avançar",
  ],

  whenNotToUse: [
    "Pergunta única V/F (use renderAs=true_false básico)",
    "Resposta numérica, classificação, pareamento ou ordem",
    "Afirmações que precisam de cálculo (use componente numérico)",
  ],

  schema: componentPropsSchema,

  answerContract: {
    accepts: ["ok-token"],
    rejects: ["numeric-pure", "fraction", "sequence", "shape-name"],
  },

  // 2026-08-16 (F0 do caderno): papel deste componente no modo worksheet;
  // ver SPEC-FORMAT.md secao `notebook` e NOTEBOOK_* em shared/component-sets.js.
  notebook: {
    roles: ["B"],
  },

  pedagogicalGuard: ({ instruction = "", componentProps = {} }) => {
    const stmts = componentProps.statements || [];
    if (stmts.length === 0) return "true_false_lab sem afirmações";
    // Anti-bug: todas as statements iguais
    const texts = new Set(
      stmts.map((s) =>
        String(s.text || "")
          .toLowerCase()
          .trim()
      )
    );
    if (texts.size < stmts.length) return "afirmações duplicadas";
    return null;
  },

  examples: [
    {
      context: "Ciências EF — estados da matéria (revisão V/F)",
      instruction: "Avalie cada afirmação sobre os estados da matéria.",
      expectedAnswer: "ok",
      componentProps: {
        statements: [
          {
            id: "s1",
            text: "A água ferve a 100°C ao nível do mar.",
            isTrue: true,
            explanation: "Sim — ponto de ebulição da água em pressão atmosférica padrão.",
          },
          {
            id: "s2",
            text: "Gelo derrete porque perde matéria.",
            isTrue: false,
            explanation: "Não — gelo derrete por mudança de estado, sem perder matéria.",
          },
          {
            id: "s3",
            text: "Vapor de água é um gás.",
            isTrue: true,
            explanation: "Correto — vapor é água no estado gasoso.",
          },
          {
            id: "s4",
            text: "Líquidos não têm volume definido.",
            isTrue: false,
            explanation: "Líquidos têm volume definido; o que muda é o formato.",
          },
        ],
      },
    },
  ],

  /**
   * Agregação: 3+ steps com renderAs="true_false" + ea boolean (verdadeiro/falso/sim/não)
   * + mesma KC → vira true_false_lab unificado.
   */
  aggregationDetector(steps) {
    if (!Array.isArray(steps) || steps.length < 3) return null;
    const BOOL_EA = /^(verdadeiro|falso|true|false|sim|nao|não|certo|errado|correto|incorreto)$/i;
    const candidates = steps.filter((s) => {
      const ea = String(s.expectedAnswer || "").trim();
      return ea && BOOL_EA.test(ea);
    });
    if (candidates.length < 3) return null;

    const statements = candidates.map((s, i) => {
      const ea = String(s.expectedAnswer || "")
        .trim()
        .toLowerCase();
      const isTrue = /^(verdadeiro|true|sim|certo|correto)$/i.test(ea);
      const text = String(s.instruction || "")
        .trim()
        .replace(/\?$/, "")
        .slice(0, 160);
      const explanation = String(s.explanation || s.feedback || "").slice(0, 160) || undefined;
      return {
        id: `s${i + 1}`,
        text: text || `Afirmação ${i + 1}`,
        isTrue,
        ...(explanation ? { explanation } : {}),
      };
    });
    // Validação: pelo menos 1 verdadeira e 1 falsa pra ter graça
    const trueCount = statements.filter((s) => s.isTrue).length;
    const falseCount = statements.length - trueCount;
    if (trueCount === 0 || falseCount === 0) return null;

    return {
      componentId: "true_false_lab",
      componentProps: { statements },
      stepIds: candidates.map((s) => s.id),
      instruction: "Avalie cada afirmação como verdadeira ou falsa.",
      expectedAnswer: "ok",
    };
  },
};
