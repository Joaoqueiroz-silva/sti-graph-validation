/**
 * cell_diagram - selecao de organela em celula animal/vegetal.
 */

import { z } from "zod";

const componentPropsSchema = z
  .object({
    cellType: z.enum(["animal", "plant"]).optional(),
    highlightOrganelle: z.string().max(48).optional().nullable(),
    question: z.string().max(180).optional(),
  })
  .passthrough();

const ORGANELLES = {
  animal: new Set([
    "membrana_plasmatica",
    "citoplasma",
    "nucleo",
    "nucleolo",
    "mitocondria",
    "reticulo",
    "ribossomo",
    "golgi",
    "lisossomo",
  ]),
  plant: new Set([
    "parede_celular",
    "membrana_plasmatica",
    "citoplasma",
    "nucleo",
    "cloroplasto",
    "vacuolo",
    "mitocondria",
    "reticulo",
    "ribossomo",
  ]),
};

export default {
  id: "cell_diagram",
  rendererPath: "frontend/src/components/RichStep/CellDiagram.jsx",

  description: "Diagrama de celula animal/vegetal. Aluno clica na organela correta.",

  whenToUse: [
    "Identificar organelas em celula animal ou vegetal",
    "Localizacao visual de parte celular",
    "Resposta esperada e id de organela conhecida",
  ],

  whenNotToUse: [
    "Rotular varias organelas ao mesmo tempo (use diagram_labeler)",
    "Comparar celula animal vs vegetal por texto",
    "Organela que nao existe no desenho atual",
  ],

  schema: componentPropsSchema,

  answerContract: {
    accepts: ["text-short"],
    rejects: [
      "numeric-pure",
      "fraction",
      "time",
      "coordinate",
      "boolean",
      "ok-token",
      "mapping-pairs",
    ],
  },

  // 2026-08-16 (F0 do caderno): papel deste componente no modo worksheet;
  // ver SPEC-FORMAT.md secao `notebook` e NOTEBOOK_* em shared/component-sets.js.
  notebook: {
    roles: ["B", "C", "D"],
    targets: {
      kinds: ["organelle"],
      answerKindByKind: { organelle: "text-short" },
    },
  },

  pedagogicalGuard: ({ ea = "", componentProps = {}, step = {} }) => {
    const cellType = componentProps.cellType || "animal";
    const expected = String(ea || "").trim();
    if (!ORGANELLES[cellType]?.has(expected))
      return "expectedAnswer nao e organela conhecida para cellType";
    // 2026-08-16 (caderno F4, tarefa 3): highlightOrganelle NUNCA e exigido.
    // O front (CellDiagram.jsx) pinta essa organela de laranja e amplia 1.1x,
    // entao um highlight igual ao gabarito e pista por construcao. Regra:
    //  - papel C (instrumento compartilhado) ou D (figura): highlight tem de
    //    estar AUSENTE, porque o mesmo desenho serve a varias celulas com
    //    gabaritos diferentes (destacar uma organela contradiz as outras);
    //  - demais (B ou sem cell): ausente OU igual ao EA (o compilador ainda
    //    grava igual ao EA; trocar isso e do compilador, fora desta stream).
    //    Diferente do EA e pista contraditoria (o mesmo motivo de sempre),
    //    agora com errorCode para o reparo remover o highlight em vez de
    //    dropar o passo.
    const highlight = componentProps.highlightOrganelle;
    const role = String(step?.cell?.role || "")
      .trim()
      .toUpperCase();
    if (highlight && (role === "C" || role === "D")) {
      return {
        message: `highlightOrganelle nao pode existir no papel ${role} (instrumento/figura compartilhado destacaria o gabarito de uma celula)`,
        errorCode: "highlight-in-instrument",
      };
    }
    if (highlight && highlight !== expected) {
      return {
        message: "highlightOrganelle deve bater com expectedAnswer para evitar pista contraditoria",
        errorCode: "highlight-mismatch",
      };
    }
    return null;
  },

  // 2026-08-16 (caderno F4, tarefa 3): reparar > dropar. Nos dois codigos o
  // conserto e o mesmo e nao inventa nada: tira o highlight (a organela
  // gabarito continua no desenho e na lista acessivel; so deixa de ser
  // destacada). Antes, um highlight divergente mandava o passo para a cascata
  // (dynamic_spec/MC/drop) por causa de um campo puramente decorativo.
  repairs: {
    "highlight-mismatch": (step) => removeHighlight(step),
    "highlight-in-instrument": (step) => removeHighlight(step),
  },

  examples: [
    {
      context: "Ciencias EF - organelas",
      instruction: "Clique no nucleo da celula animal.",
      expectedAnswer: "nucleo",
      // 2026-08-16 (caderno F4): sem highlightOrganelle; destacar o nucleo
      // seria entregar a resposta.
      componentProps: { cellType: "animal" },
    },
  ],
};

function removeHighlight(step) {
  const cp = { ...(step?.componentProps || {}) };
  if (!Object.hasOwn(cp, "highlightOrganelle")) return null;
  delete cp.highlightOrganelle;
  const ea = String(step?.expectedAnswer || "").trim();
  return {
    ...step,
    componentProps: cp,
    acceptableVariations: [...new Set([ea, ...(step?.acceptableVariations || [])])].filter(Boolean),
    _repairedFrom: "cell_diagram:highlight-removed",
    _repairReason: "highlightOrganelle divergente ou em instrumento/figura; removido",
  };
}
