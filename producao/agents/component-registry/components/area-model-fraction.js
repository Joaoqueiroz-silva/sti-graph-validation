/**
 * area_model_fraction — modelo de ÁREA para multiplicação de frações.
 *
 * 2026-06-10 (Sprint 3 da auditoria): componente canônico de "fração DE
 * fração". Grid denA × denB; fração A tinge linhas, fração B tinge colunas;
 * o aluno PINTA a interseção e submete a fração produto (pintadas/total).
 */

import { z } from "zod";

const FRACTION_RE = /^\d+\s*\/\s*\d+$/;

/**
 * 2026-06-10 (Sprint 4A — repair-first): o worker às vezes autora o passo de
 * área com props ausentes/quebradas. Antes o validator DROPAVA o step (e o nó
 * dele sobrava no grafo — F13). Agora deriva as duas frações do próprio
 * enunciado e normaliza o EA pro produto NÃO simplificado (o que o componente
 * submete: pintadas/total). Sem par derivável → null (segue fluxo de drop/fallback).
 */
function repairFromInstruction(step) {
  const blob = `${step?.instruction || ""} ${step?.questionText || ""}`;
  const fracs = [];
  const re = /(\d+)\s*\/\s*(\d+)/g;
  let m;
  while ((m = re.exec(blob)) !== null && fracs.length < 2) {
    const n = Number(m[1]);
    const d = Number(m[2]);
    if (d > 0 && d <= 12 && n >= 0 && n <= d * 2) fracs.push([n, d]);
  }
  if (fracs.length < 2) return null;
  const [[n1, d1], [n2, d2]] = fracs;
  const product = `${n1 * n2}/${d1 * d2}`;
  return {
    ...step,
    expectedAnswer: product,
    acceptableVariations: [product],
    componentProps: {
      ...(step.componentProps || {}),
      fractionA: `${n1}/${d1}`,
      fractionB: `${n2}/${d2}`,
    },
  };
}

const componentPropsSchema = z
  .object({
    fractionA: z.string().regex(FRACTION_RE, "fractionA deve ser 'n/d'"),
    fractionB: z.string().regex(FRACTION_RE, "fractionB deve ser 'n/d'"),
    prompt: z.string().max(200).optional(),
  })
  .passthrough();

export default {
  id: "area_model_fraction",
  rendererPath: "frontend/src/components/RichStep/AreaModelFraction.jsx",
  description:
    "Modelo de area de multiplicacao de fracoes. Aluno pinta a intersecao das duas fracoes num grid e produz a fracao produto.",

  schema: componentPropsSchema,

  answerContract: {
    accepts: ["fraction"],
    rejects: ["numeric-pure", "boolean", "ok-token", "mapping-pairs", "text-long", "expression"],
  },

  // 2026-08-16 (F0 do caderno): papel deste componente no modo worksheet;
  // ver SPEC-FORMAT.md secao `notebook` e NOTEBOOK_* em shared/component-sets.js.
  notebook: {
    roles: ["B", "D"],
  },

  // 2026-06-10 (Sprint 4A): repair-first — props derivam do enunciado em vez
  // de dropar o step (drop gerava nó-fantasma no grafo, F13).
  repairs: {
    "missing-fractions": repairFromInstruction,
    "schema-fail": repairFromInstruction,
    "ea-shape-mismatch": repairFromInstruction,
  },

  constraints: {
    expectedAnswer: {
      shape: "fraction",
      regex: /^\d+\s*\/\s*\d+$/,
      examples: ["3/8", "1/6", "6/20"],
      reason:
        "o aluno submete pintadas/total — EA deve ser a fração produto NÃO simplificada (numA×numB / denA×denB)",
    },
    componentProps: {
      fractionA: {
        type: "string",
        required: true,
        reason: "primeira fração 'n/d' (tinge as linhas); denominador ≤ 12 pra grid legível",
      },
      fractionB: {
        type: "string",
        required: true,
        reason: "segunda fração 'n/d' (tinge as colunas); denominador ≤ 12 pra grid legível",
      },
    },
  },

  llmGuidance: {
    useWhen: [
      "O step pede pra REPRESENTAR/visualizar a multiplicação de duas frações (fração de fração)",
      "expectedAnswer é a fração PRODUTO no formato N/D (ex: 1/2 × 3/4 → EA '3/8')",
      "Denominadores das duas frações ≤ 12 (grid legível)",
    ],
    avoidWhen: [
      "Fração única de um inteiro (use fraction_bar)",
      "Soma/subtração de frações (use fraction_bar mode sum)",
      "O step pede a OPERAÇÃO em si ('qual operação representa') — use equation_builder",
      "Resposta numérica pura (use numeric_keypad)",
    ],
    goodExamples: [
      {
        instruction: "Pinte no modelo de área o produto de 1/2 × 3/4.",
        expectedAnswer: "3/8",
        componentProps: { fractionA: "1/2", fractionB: "3/4" },
      },
      {
        instruction: "Pedro comeu 1/3 de 1/2 do bolo. Pinte a área que ele comeu.",
        expectedAnswer: "1/6",
        componentProps: { fractionA: "1/3", fractionB: "1/2" },
      },
    ],
    badExamples: [
      {
        attempt: {
          expectedAnswer: "0.375",
          componentProps: { fractionA: "1/2", fractionB: "3/4" },
        },
        why: "EA decimal não casa com o que o componente submete (células/total, ex: '3/8')",
      },
      {
        attempt: {
          expectedAnswer: "3/8",
          componentProps: { fractionA: "1/2" },
        },
        why: "faltou fractionB — o modelo de área precisa das DUAS frações",
      },
    ],
  },
};
