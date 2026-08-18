/**
 * card_sort_lab — classificação de N items entre 2-6 categorias.
 */

import { z } from "zod";

const COLOR_PALETTE = [
  { color: "#0891b2", bgColor: "#ecfeff" },
  { color: "#d97706", bgColor: "#fffbeb" },
  { color: "#7c3aed", bgColor: "#f5f3ff" },
  { color: "#dc2626", bgColor: "#fef2f2" },
  { color: "#16a34a", bgColor: "#f0fdf4" },
  { color: "#0284c7", bgColor: "#f0f9ff" },
];

const categorySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(2).max(40),
  color: z.string().optional(),
  bgColor: z.string().optional(),
});

const itemSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(2).max(60),
  categoryId: z.string().min(1),
});

const componentPropsSchema = z
  .object({
    categories: z.array(categorySchema).min(2).max(6),
    items: z.array(itemSchema).min(3).max(20),
  })
  .refine(
    (data) => {
      const catIds = new Set(data.categories.map((c) => c.id));
      return data.items.every((it) => catIds.has(it.categoryId));
    },
    { message: "Todos os items devem referenciar um categoryId existente" }
  )
  .refine(
    (data) => {
      const itemTexts = data.items.map((i) => i.text.toLowerCase());
      const catNames = new Set(data.categories.map((c) => c.name.toLowerCase()));
      return !itemTexts.every((t) => catNames.has(t));
    },
    { message: "Items não podem ser idênticos às categorias (LLM bug comum)" }
  );

/**
 * rebuildCardSortFromAnswer — reconstrói categorias e itens a partir do gabarito.
 *
 * 2026-08-04 (STI de Sociologia "Planalto Central em Disputa"): o agente 6
 * escolheu card_sort_lab em 6 passos e não preencheu `categories` nem `items`
 * em nenhum. O sanitizer removeu os 6, um problema inteiro ficou sem passos e a
 * geração foi rejeitada por "perda catastrófica: planejados 16, entregues 7".
 *
 * Mas o gabarito É a classificação: "item:categoria,item:categoria". Os itens
 * são as chaves e as categorias são os valores — o mesmo padrão que já salvou
 * concept_map (arestas) e timeline_constructor (mapeamento).
 *
 * Exportada para o sanitizer poder reparar ANTES de remover: no caminho V9.2 o
 * sanitizer roda antes da validação do registry, então um reparo que só viva
 * aqui nunca chegaria a disparar.
 */
export function rebuildCardSortFromAnswer(step) {
  const bruto = String(step?.expectedAnswer ?? "").trim();
  if (!bruto) return null;

  // 2026-08-05 (STI "O Diario de Lucas", producao): o gabarito de classificacao
  // chega em MAIS DE UMA serializacao. Este reconstrutor so entendia ":" e por
  // isso quatro passos de "relacione cada substantivo ao artigo" morreram com
  // `rejects:mapping-pairs` — o `matching_pairs` recusa (e faz bem: e interface
  // 1:1 e "um" se repete em melao/abacaxi) e nao havia mais ninguem para pegar.
  // Mapeamento MUITOS-PARA-UM e exatamente classificacao em categorias, que e o
  // que este componente faz. Aceita as mesmas relacoes que parseMappingPairs.
  const rel = bruto.includes("<>")
    ? "<>"
    : bruto.includes("=>")
      ? "=>"
      : bruto.includes(":")
        ? ":"
        : bruto.includes("=")
          ? "="
          : null;
  if (!rel) return null;

  const pares = [];
  for (const parte of bruto.split(/[,;]/)) {
    const texto = parte.trim();
    if (!texto) continue;
    const corte = texto.indexOf(rel);
    if (corte <= 0 || corte >= texto.length - rel.length) return null;
    const item = texto.slice(0, corte).trim();
    const categoria = texto.slice(corte + rel.length).trim();
    if (!item || !categoria) return null;
    pares.push([item, categoria]);
  }

  const nomesCategorias = [...new Set(pares.map(([, categoria]) => categoria))];
  const chavesItens = [...new Set(pares.map(([item]) => item))];
  // Limites do schema: 2-6 categorias, 3-20 itens.
  if (nomesCategorias.length < 2 || nomesCategorias.length > 6) return null;
  if (chavesItens.length < 3 || chavesItens.length > 20) return null;
  // O bug clássico do LLM: os "itens" são as próprias categorias.
  if (chavesItens.every((item) => nomesCategorias.includes(item))) return null;

  const categories = nomesCategorias.map((nome, indice) => ({
    id: nome,
    name: humanizeCardLabel(nome).slice(0, 40),
    ...COLOR_PALETTE[indice % COLOR_PALETTE.length],
  }));
  const items = chavesItens.map((chave) => ({
    id: chave,
    text: humanizeCardLabel(chave).slice(0, 60),
    categoryId: pares.find(([item]) => item === chave)[1],
  }));
  if (categories.some((c) => c.name.length < 2) || items.some((i) => i.text.length < 2))
    return null;

  return {
    ...step,
    renderAs: "card_sort_lab",
    componentId: "card_sort_lab",
    // O contrato do componente aceita `ok-token`: a verdade da correção está em
    // items[].categoryId, e o gabarito é só o token de conclusão. A
    // classificação original fica entre as variações aceitas.
    expectedAnswer: "ok",
    acceptableVariations: [...new Set(["ok", bruto, ...(step?.acceptableVariations || [])])].filter(
      Boolean
    ),
    componentProps: { ...(step?.componentProps || {}), categories, items },
    _repairedFrom: "card_sort_lab:groups-from-answer",
  };
}

/** "parque_tecnologico" -> "Parque tecnologico" (o aluno lê o cartão). */
function humanizeCardLabel(valor) {
  const texto = String(valor ?? "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return texto ? texto[0].toUpperCase() + texto.slice(1) : "";
}

export default {
  id: "card_sort_lab",
  rendererPath: "frontend/src/components/RichStep/CardSortLab.jsx",

  description:
    "Sorting/classificação visual: aluno arrasta N items entre 2-6 categorias coloridas.",

  whenToUse: [
    "Classificar 4-12 items entre 2-4 categorias semânticas: vertebrado/invertebrado, sólido/líquido/gás, mamífero/ave/réptil",
    "Diferenciar membros de 2-3 conjuntos (ex: meses do ano em estações)",
    "3+ steps de classificação com mesma KC e eas repetindo entre 2-4 valores → fundir aqui",
  ],

  whenNotToUse: [
    "Pareamento 1:1 (use memory_game)",
    "Ordem temporal/cronológica (use image_sequence)",
    "Resposta numérica ou textual livre",
  ],

  schema: componentPropsSchema,

  answerContract: {
    accepts: ["ok-token"],
    rejects: ["numeric-pure", "boolean", "fraction"],
  },

  // 2026-08-16 (F0 do caderno): papel deste componente no modo worksheet;
  // ver SPEC-FORMAT.md secao `notebook` e NOTEBOOK_* em shared/component-sets.js.
  notebook: {
    roles: ["B"],
  },

  pedagogicalGuard: ({ instruction = "", componentProps = {} }) => {
    const lower = String(instruction).toLowerCase();
    const cats = componentProps.categories || [];
    const catNames = cats.map((c) => String(c.name || "").toLowerCase());
    // Anti-pattern: instrução afirma 1 das categorias
    const affirmsCat = catNames.some(
      (cn) =>
        cn.length > 3 &&
        new RegExp(`\\b(?:como|em)\\s+${cn.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}s?\\b`, "i").test(
          lower
        )
    );
    if (affirmsCat) return "instrução afirma uma das categorias — use forma neutra";
    return null;
  },

  examples: [
    {
      context: "Ciências EF — classificar animais em vertebrados/invertebrados",
      instruction: "Classifique cada animal como vertebrado ou invertebrado.",
      expectedAnswer: "ok",
      componentProps: {
        categories: [
          { id: "vert", name: "Vertebrados", color: "#0891b2", bgColor: "#ecfeff" },
          { id: "inv", name: "Invertebrados", color: "#d97706", bgColor: "#fffbeb" },
        ],
        items: [
          { id: "i1", text: "Cachorro", categoryId: "vert" },
          { id: "i2", text: "Minhoca", categoryId: "inv" },
          { id: "i3", text: "Sapo", categoryId: "vert" },
          { id: "i4", text: "Polvo", categoryId: "inv" },
          { id: "i5", text: "Pássaro", categoryId: "vert" },
          { id: "i6", text: "Borboleta", categoryId: "inv" },
        ],
      },
    },
    {
      context: "Ciências EF — estados da matéria",
      instruction: "Classifique cada substância em sólido, líquido ou gás.",
      expectedAnswer: "ok",
      componentProps: {
        categories: [
          { id: "sol", name: "Sólido" },
          { id: "liq", name: "Líquido" },
          { id: "gas", name: "Gás" },
        ],
        items: [
          { id: "i1", text: "Pedra", categoryId: "sol" },
          { id: "i2", text: "Água", categoryId: "liq" },
          { id: "i3", text: "Oxigênio", categoryId: "gas" },
          { id: "i4", text: "Madeira", categoryId: "sol" },
          { id: "i5", text: "Suco", categoryId: "liq" },
          { id: "i6", text: "Vapor", categoryId: "gas" },
        ],
      },
    },
  ],

  /**
   * Agregação: 3+ steps com mesma KC + eas em 2-4 valores que SE REPETEM.
   */
  aggregationDetector(steps) {
    if (!Array.isArray(steps) || steps.length < 3) return null;
    const eas = steps.map((s) =>
      String(s.expectedAnswer || "")
        .trim()
        .toLowerCase()
    );
    const uniqueEas = [...new Set(eas.filter(Boolean))];
    if (uniqueEas.length < 2 || uniqueEas.length > 4) return null;
    if (uniqueEas.length >= steps.length) return null; // cardinalidade 1:1 = match-pairs
    // Rejeita V/F booleanas — true_false_lab cuida disso
    const BOOL = /^(verdadeiro|falso|true|false|sim|nao|não|certo|errado|correto|incorreto)$/i;
    if (uniqueEas.every((e) => BOOL.test(e))) return null;
    // Rejeita quando KC ou instr indicam SEQUÊNCIA — image_sequence cuida disso
    const seqRegex = /(ciclo|etapa|fase|processo|sequenc|cronolog|ordem)/i;
    if (steps.some((s) => seqRegex.test(String(s.kc || "")))) return null;
    // Rejeita quando uniqueEas batem com sequência conhecida (etapas do ciclo da água, etc)
    const easNorm = uniqueEas.map((e) => e.normalize("NFD").replace(/[̀-ͯ]/g, ""));
    const KNOWN_SEQUENCES = [
      ["evaporacao", "condensacao", "precipitacao", "infiltracao"],
      ["ovo", "larva", "lagarta", "casulo", "borboleta"],
      ["nova", "crescente", "cheia", "minguante"],
    ];
    if (
      KNOWN_SEQUENCES.some((seq) =>
        easNorm.every((ea) => seq.some((s) => ea.includes(s) || s.includes(ea)))
      )
    ) {
      return null;
    }

    const categories = uniqueEas.map((ea, i) => ({
      id: _slugify(ea) || `cat${i}`,
      name: _capitalize(ea),
      color: COLOR_PALETTE[i % COLOR_PALETTE.length].color,
      bgColor: COLOR_PALETTE[i % COLOR_PALETTE.length].bgColor,
    }));
    const catIdByEa = Object.fromEntries(uniqueEas.map((ea, i) => [ea, categories[i].id]));

    const items = [];
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      const ea = String(s.expectedAnswer || "")
        .trim()
        .toLowerCase();
      const itemText = _extractEntity(s.instruction, s.expectedAnswer);
      if (!itemText) return null;
      items.push({
        id: `item_${i}_${_slugify(itemText)}`.slice(0, 40),
        text: _capitalize(itemText),
        categoryId: catIdByEa[ea],
      });
    }

    return {
      componentId: "card_sort_lab",
      componentProps: { categories, items },
      stepIds: steps.map((s) => s.id),
      instruction: "Classifique cada item na categoria correta.",
      expectedAnswer: "ok",
    };
  },
};

function _slugify(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 24);
}

function _capitalize(s) {
  if (!s) return "";
  return String(s).charAt(0).toUpperCase() + String(s).slice(1);
}

function _extractEntity(instruction, ea) {
  const instr = String(instruction || "").trim();
  if (!instr) return "";
  const cleaned = ea
    ? instr.replace(new RegExp(String(ea).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "")
    : instr;
  const compound = cleaned.match(/\b([A-ZÁÉÍÓÚ][a-záéíóúâêôãõç]+(?:-[a-záéíóúâêôãõç]+)+)\b/);
  if (compound) return compound[1];
  const cap = cleaned.match(/\b([A-ZÁÉÍÓÚ][a-záéíóúâêôãõç]{3,})\b/);
  if (cap) return cap[1];
  const STOP = new Set([
    "qual",
    "como",
    "onde",
    "quando",
    "quem",
    "para",
    "esse",
    "essa",
    "este",
    "esta",
    "classificamos",
    "consideramos",
    "chamamos",
    "grupo",
    "categoria",
    "tipo",
    "classe",
  ]);
  const tokens = cleaned.split(/[\s.,;:!?()]+/).filter(Boolean);
  for (const t of tokens) {
    const norm = t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (norm.length >= 4 && !STOP.has(norm)) return t;
  }
  return "";
}
