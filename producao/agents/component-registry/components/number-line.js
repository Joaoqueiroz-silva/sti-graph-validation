/**
 * number_line - reta numerica clicavel.
 */

import { z } from "zod";

const componentPropsSchema = z
  .object({
    min: z.number().min(-1000).max(1000),
    max: z.number().min(-1000).max(1000),
    marker: z.number().optional(),
  })
  .refine((data) => data.min < data.max, { message: "min deve ser menor que max" })
  .passthrough();

export default {
  id: "number_line",
  rendererPath: "frontend/src/components/RichStep/NumberLine.jsx",

  description: "Reta numerica. Sem options, aluno clica para marcar um numero inteiro.",

  whenToUse: [
    "Localizar numero inteiro em reta numerica",
    "Comparar posicao de numeros pequenos",
    "Resposta esperada numerica inteira e visualizavel em uma escala",
  ],

  whenNotToUse: [
    "Calculo direto sem valor posicional/posicao (use numeric_keypad)",
    "Decimal fino ou valor com unidade",
    "Coordenada (use coordinate_plane)",
  ],

  schema: componentPropsSchema,

  answerContract: {
    accepts: ["numeric-pure"],
    rejects: ["boolean", "fraction", "time", "ok-token", "mapping-pairs"],
  },

  // 2026-08-16 (F0 do caderno): papel deste componente no modo worksheet;
  // ver SPEC-FORMAT.md secao `notebook` e NOTEBOOK_* em shared/component-sets.js.
  notebook: {
    roles: ["B", "C", "D"],
    targets: {
      kinds: ["marker"],
      answerKindByKind: { marker: "numeric-pure" },
    },
  },

  constraints: {
    expectedAnswer: {
      shape: "numeric-pure",
      type: "integer",
      reason: "Aluno clica em posição inteira na reta",
    },
    componentProps: {
      min: { type: "integer", min: -1000, max: 1000, required: true },
      max: {
        type: "integer",
        min: -1000,
        max: 1000,
        required: true,
        reason: "max > min obrigatório",
      },
      marker: { type: "integer", required: false },
    },
  },

  llmGuidance: {
    useWhen: [
      "EA é inteiro que cabe num intervalo visualizável (range ≤ ~50 unidades)",
      "Step ensina posição/ordem/comparação de números",
      "Reta tem min < max definidos no componentProps",
    ],
    avoidWhen: [
      "EA é decimal fino (use numeric_keypad)",
      "EA fora do range [min, max] dos componentProps (expandir o range OU usar numeric_keypad)",
      "Cálculo direto sem foco em posição (use numeric_keypad)",
      "Coordenada 2D (use coordinate_plane)",
    ],
    goodExamples: [
      {
        instruction: "Marque o número 7 na reta.",
        expectedAnswer: "7",
        componentProps: { min: 0, max: 10 },
      },
    ],
    badExamples: [
      {
        attempt: { expectedAnswer: "100", componentProps: { min: 0, max: 10 } },
        reason: "EA fora do range — 100 não está em [0, 10]",
        solution: "Expandir range para { min: 0, max: 100 } OU mudar pra numeric_keypad",
      },
    ],
  },

  repairs: {
    // 2026-08-04 (avaliação dos tutores publicados): `number_line` foi proposto
    // 7 vezes e sobreviveu 1. O modo de falha dominante não era range errado —
    // era `min`/`max` AUSENTES, que caem em "schema-fail" e não tinham reparo.
    // O passo ia inteiro para a recuperação genérica e o aluno, mandado
    // "marcar na reta", recebia um campo de digitação com um gráfico de barras
    // decorativo ao lado (medido em "Radar da Velocidade Média" e
    // "A Brinquedoteca do Pedro").
    //
    // A escala é derivável do próprio gabarito: é o dado que já estava ali.
    "schema-fail": (step) => {
      const n = Number(
        String(step.expectedAnswer ?? "")
          .replace(",", ".")
          .trim()
      );
      if (!Number.isInteger(n)) return null;
      const cp = step.componentProps || {};
      const minDeclarado = Number(cp.min);
      const maxDeclarado = Number(cp.max);
      // Ancora no zero quando a resposta é positiva (é como a criança lê a reta)
      // e deixa uma folga proporcional acima do gabarito, para ele não cair na
      // ponta da régua.
      const folga = Math.max(1, Math.round(Math.abs(n) * 0.2));
      const min = Number.isFinite(minDeclarado)
        ? Math.min(minDeclarado, n)
        : n >= 0
          ? 0
          : n - folga;
      const max = Math.max(
        Number.isFinite(maxDeclarado) ? Math.max(maxDeclarado, n) : n + folga,
        min + 1
      );
      // Uma reta com mais de ~50 marcas não ensina posição, ela vira ruído.
      // Nesse caso é honesto deixar a cascata trocar de componente.
      if (max - min > 50) return null;
      return { ...step, componentProps: { ...cp, min, max } };
    },
    "ea-out-of-range": (step) => {
      // 2026-08-05 (bateria números negativos): expandir SÓ o lado que faltava
      // mantinha o outro lado como o worker propôs — a instrução prometia
      // "reta de -5 a 3" e a interface mostrava -5..20 (max=20 residual em
      // TODOS os 6 passos do STI). O range que a PRÓPRIA instrução anuncia é
      // a fonte mais confiável; sem anúncio, um range compacto em volta de 0
      // e do gabarito. O range do worker não merece sobreviver aqui: se ele
      // fosse coerente, este reparo nem teria disparado.
      const n = Number(String(step.expectedAnswer || "").replace(",", "."));
      if (Number.isInteger(n)) {
        const cp = step.componentProps || {};
        const texto = `${step.instruction || ""} ${step.questionText || ""}`;
        const anunciado = texto.match(
          /(?:de|entre|desde)\s+(-?\d+)\s*(?:a|e|até|ate|y|to|hasta)\s+(-?\d+)/i
        );
        if (anunciado) {
          const a = Number(anunciado[1]);
          const b = Number(anunciado[2]);
          const min = Math.min(a, b);
          const max = Math.max(a, b);
          if (max > min && n >= min && n <= max) {
            return { ...step, componentProps: { ...cp, min, max } };
          }
        }
        const min = Math.min(0, n) - 2;
        const max = Math.max(0, n) + 2;
        return {
          ...step,
          componentProps: { ...cp, min, max },
        };
      }
      // EA não-inteiro — converte pra numeric_keypad
      return {
        ...step,
        renderAs: "numeric_keypad",
        componentProps: {},
        _repairedFrom: "number_line",
      };
    },
    "ea-not-integer": (step) => ({
      ...step,
      renderAs: "numeric_keypad",
      componentProps: {},
      _repairedFrom: "number_line",
    }),
  },

  pedagogicalGuard: ({ ea = "", componentProps = {} }) => {
    const n = Number(String(ea || "").replace(",", "."));
    if (!Number.isInteger(n))
      return { message: "number_line aceita apenas inteiro", errorCode: "ea-not-integer" };
    if (n < Number(componentProps.min) || n > Number(componentProps.max)) {
      return {
        message: "numero esperado fora do range da reta",
        errorCode: "ea-out-of-range",
      };
    }
    return null;
  },

  examples: [
    {
      context: "Matematica EF - reta numerica",
      instruction: "Marque o numero 7 na reta.",
      expectedAnswer: "7",
      componentProps: { min: 0, max: 10 },
    },
  ],
};
