/**
 * numeric_keypad — entrada numérica via teclado virtual.
 *
 * componentProps simples: só carrega expectedAnswer pra validação client-side
 * (renderer puxa do step diretamente).
 */

import { z } from "zod";

const componentPropsSchema = z
  .object({
    expectedAnswer: z.union([z.string(), z.number()]).optional(),
    decimals: z.number().int().min(0).max(6).optional(),
    unit: z.string().max(12).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
  })
  .passthrough(); // tolera extras (theme, motionSpec, etc)

export default {
  id: "numeric_keypad",
  rendererPath: "frontend/src/components/RichStep/NumericKeypad.jsx",

  description:
    "Teclado numérico virtual pra entrada de respostas inteiras, decimais ou com unidade.",

  whenToUse: [
    "ea é número inteiro (12, -5, 100)",
    "ea é decimal (3.14, 2,5)",
    "ea é numérico com unidade (12 km/h, 25°C)",
    "Cálculo simples: 'Quanto é 7 + 5?' → ea=12",
  ],

  whenNotToUse: [
    "ea é texto, palavra ou frase",
    "ea é V/F (use true_false)",
    "Pergunta exige escolha de N opções (use multiple_choice)",
    "Resposta é fração visual (use fraction_bar)",
  ],

  schema: componentPropsSchema,

  answerContract: {
    accepts: ["numeric-pure", "numeric-with-unit"],
    rejects: ["text-short", "text-long", "boolean", "shape-name", "ok-token"],
  },

  // 2026-08-16 (F0 do caderno): papel deste componente no modo worksheet;
  // ver SPEC-FORMAT.md secao `notebook` e NOTEBOOK_* em shared/component-sets.js.
  notebook: {
    roles: ["A"],
  },

  pedagogicalGuard: ({ instruction = "" }) => {
    // Anti-pattern: instrução pede V/F mas componente é numérico
    if (/\b(verdadeiro|falso|sim|não|nao)\b/i.test(String(instruction))) {
      return "numeric_keypad usado em pergunta V/F — incompatível";
    }
    return null;
  },

  examples: [
    {
      context: "Matemática EF — soma simples",
      instruction: "Quanto é 7 + 5?",
      expectedAnswer: "12",
      componentProps: { expectedAnswer: "12" },
    },
    {
      context: "Física EF — temperatura",
      instruction: "A água ferveu a quantos graus Celsius?",
      expectedAnswer: "100",
      componentProps: { expectedAnswer: "100", unit: "°C", decimals: 0 },
    },
  ],

  /**
   * Sem aggregationDetector — numeric_keypad é por-step, não agregável.
   * O router já roteia steps com ea numérica pra esse componente.
   */
};
