/**
 * affordance-policies.js — FONTE ÚNICA de "que conteúdo exige que interface".
 *
 * 2026-08-02 (auditoria de interface): estas tabelas viviam dentro do
 * quality-gate e só serviam para REPROVAR o resultado no fim do pipeline
 * ("conteúdo de frações sem input fracionário manipulável"). O sistema já sabia
 * dizer qual interface cada conteúdo exige — só nunca usava esse conhecimento
 * para DIRIGIR a geração. `agents/response-modality-planner.js` passa a
 * consumi-las antes de o agente 6 materializar os passos.
 *
 * Os `dynamicPredicate` continuam no quality-gate, anexados por id: dependem de
 * helpers que inspecionam a spec já materializada, o que não faz sentido no
 * planejamento (a spec ainda não existe).
 */

/**
 * Taxonomia GRANULAR — a ação real que o aluno executa. É uma PARTIÇÃO: cada
 * componente aparece em exatamente um balde. Serve para MEDIR diversidade, onde
 * granularidade importa: trocar `hot_spot` por `fraction_bar` é variedade real,
 * trocar múltipla escolha por V/F não é.
 *
 * 2026-08-02 (painel sênior): esta tabela existia em TRÊS cópias divergentes —
 * aqui com 4 baldes, no quality-gate com 6 e no structural-gate com 7. O planner
 * classificava `hot_spot` como "manipulate" e o gate como "inspect-locate", ou
 * seja, o planejamento e a medição da mesma pipeline falavam línguas diferentes.
 * A partição canônica é a do quality-gate (a mais fina), com a qual o
 * structural-gate já concordava em 4 dos 6 baldes.
 */
export const RESPONSE_MODALITIES = {
  select: new Set([
    "dropdown",
    "image_choice",
    "multiple_choice",
    "true_false",
    "true_false_lab",
    "word_matcher",
  ]),
  type: new Set([
    "cloze_test",
    "fill_blanks",
    "fraction_input",
    "long_division",
    "numeric_keypad",
    "text",
  ]),
  construct: new Set([
    "concept_map",
    "diagram_labeler",
    "equation_builder",
    "matching_pairs",
    "memory_game",
    "sentence_builder",
    "table",
  ]),
  manipulate: new Set([
    "abacus",
    "area_model_fraction",
    "balance_scale",
    "cell_diagram",
    "clock_face",
    "composition",
    "coordinate_plane",
    "decimal_grid",
    "fraction_bar",
    "geometry_shape",
    "moon_phases",
    "number_line",
    "parabola_plotter",
    "place_value_blocks",
    "vector_diagram",
  ]),
  "order-classify": new Set([
    "card_sort",
    "card_sort_lab",
    "drag_order",
    "drag_to_order",
    "image_sequence",
    "timeline_constructor",
    "venn_diagram",
  ]),
  "inspect-locate": new Set(["highlight_in_text", "hot_spot"]),
};

/**
 * Vista GROSSEIRA — as quatro formas pedagógicas pelas quais um aluno produz
 * uma resposta, que é o vocabulário do contrato dado ao agente 6.
 *
 * Ao contrário da granular, NÃO é uma partição: é a lista de componentes com
 * que o worker pode cumprir cada modalidade, e um mesmo componente serve a duas
 * (um diagrama de Venn tanto se arrasta quanto se clica). `dynamic_spec` entra
 * em `manipulate` porque uma cena sob medida é sempre manipulável — mas fica
 * fora da partição granular, onde os gates o tratam à parte (`custom-interact`)
 * para poder exigir que ele de fato produza resposta.
 */
const COARSE_EXTRAS = Object.freeze({
  manipulate: ["dynamic_spec", "venn_diagram"],
});

export const COARSE_MODALITIES = Object.freeze(["manipulate", "select", "construct", "type"]);

const COARSE_SOURCES = Object.freeze({
  select: ["select"],
  type: ["type"],
  construct: ["construct", "order-classify"],
  manipulate: ["manipulate", "inspect-locate"],
});

/** Componentes que cumprem uma modalidade grosseira, sem repetição. */
export function componentsForModality(coarse) {
  const baldes = COARSE_SOURCES[coarse];
  if (!baldes) return [];
  const reivindicados = new Set(
    Object.entries(COARSE_EXTRAS)
      .filter(([alvo]) => alvo !== coarse)
      .flatMap(([, componentes]) => componentes)
  );
  const saida = [];
  for (const balde of baldes) {
    for (const componente of RESPONSE_MODALITIES[balde] || []) {
      if (!reivindicados.has(componente)) saida.push(componente);
    }
  }
  for (const componente of COARSE_EXTRAS[coarse] || []) saida.push(componente);
  return [...new Set(saida)];
}

/** Política por CONTEÚDO — o conhecimento mais específico que o sistema tem. */
export const CONTENT_AFFORDANCE_POLICIES = [
  {
    id: "fraction-model",
    match: /(fra[cç][aã]o|fra[cç][oõ]es|parte[- ]?todo|pizza.*part|part.*pizza)/i,
    accepted: new Set(["fraction_bar", "area_model_fraction", "fraction_input", "composition"]),
    message: "conteúdo de frações sem input fracionário manipulável",
  },
  {
    id: "shape-selection",
    match:
      /(identifica[çc][aã]o|reconhecimento|classifica[çc][aã]o).{0,40}(figura|forma|pol[ií]gono)|(figura|forma|pol[ií]gono).{0,40}(identifica[çc][aã]o|reconhecimento|classifica[çc][aã]o)/i,
    accepted: new Set(["geometry_shape", "diagram_labeler", "hot_spot", "dynamic_spec"]),
    message: "identificação de figuras sem seleção visual da própria figura",
  },
  {
    id: "concentration-model",
    match: /(concentra[çc][aã]o|massa.{0,24}volume|volume.{0,24}massa|\bg\s*\/\s*l\b)/i,
    accepted: new Set(["table", "dynamic_spec"]),
    message: "concentração sem recipiente/escala que materialize massa e volume",
  },
  {
    id: "time-model",
    match: /(leitura de horas?|rel[oó]gio anal[oó]gico|ponteiros|horas? e minutos?)/i,
    accepted: new Set(["clock_face", "timeline_constructor", "dynamic_spec"]),
    message: "leitura de horas sem relógio manipulável",
  },
  {
    id: "place-value-model",
    match: /(valor posicional|unidades? e dezenas?|dezenas? e centenas?|sistema decimal)/i,
    accepted: new Set(["place_value_blocks", "abacus", "decimal_grid"]),
    message: "valor posicional sem ábaco, blocos ou malha decimal",
  },
  {
    id: "chronology-model",
    match: /(linha do tempo|cronolog|ordem dos eventos|sequ[eê]ncia hist[oó]rica)/i,
    accepted: new Set(["timeline_constructor", "drag_to_order", "drag_order", "image_sequence"]),
    message: "cronologia sem construção/ordenação temporal",
  },
];

/** Política por DISCIPLINA — usada quando nenhuma política de conteúdo casa. */
export const DISCIPLINE_AFFORDANCE_POLICIES = [
  {
    id: "music-model",
    match: /(m[uú]sica|ritmo|s[ií]ncope|contratempo|pulsa[çc][aã]o|compasso|melodia|harmonia)/i,
    accepted: new Set(["hot_spot", "image_sequence", "drag_to_order", "drag_order", "table"]),
  },
  {
    id: "visual-arts-model",
    match: /(?:^|[^\p{L}])(?:artes?|pintura|escultura|fotografia|teatro|dan[çc]a)(?=$|[^\p{L}])/iu,
    accepted: new Set(["hot_spot", "diagram_labeler", "image_choice", "image_sequence"]),
  },
  {
    id: "humanities-model",
    match: /(filosofia|sociologia|argumenta[çc][aã]o|dilema [eé]tico)/i,
    accepted: new Set([
      "concept_map",
      "highlight_in_text",
      "card_sort",
      "card_sort_lab",
      "venn_diagram",
    ]),
  },
  {
    id: "computing-model",
    match: /(computa[çc][aã]o|tecnologia|algoritmo|programa[çc][aã]o|c[oó]digo)/i,
    accepted: new Set(["drag_to_order", "drag_order", "table", "concept_map", "diagram_labeler"]),
  },
  {
    id: "physical-education-model",
    match: /(educa[çc][aã]o f[ií]sica|esporte|movimento corporal|sa[uú]de)/i,
    accepted: new Set([
      "diagram_labeler",
      "hot_spot",
      "image_sequence",
      "card_sort",
      "card_sort_lab",
    ]),
  },
  {
    id: "geography-model",
    match: /(geografia|territ[oó]rio|cartografia|mapas?|climograma|relevo)/i,
    accepted: new Set([
      "hot_spot",
      "diagram_labeler",
      "table",
      "timeline_constructor",
      "concept_map",
    ]),
  },
  {
    id: "history-model",
    match: /(hist[oó]ria|cronologia|processo hist[oó]rico|fontes? hist[oó]ricas?)/i,
    accepted: new Set([
      "timeline_constructor",
      "drag_to_order",
      "drag_order",
      "highlight_in_text",
      "concept_map",
    ]),
  },
  // 2026-08-02 (painel sênior): estas três — as disciplinas MAIS comuns da
  // plataforma — existiam só na cópia do quality-gate. O planejador não as via,
  // então um STI de Português caía no default `type` e o worker materializava
  // campo de texto em todo passo; o gate, com a tabela completa, então reprovava
  // o mesmo STI por "interface sem modelo da disciplina". As duas pontas da
  // pipeline trabalhavam uma contra a outra.
  {
    id: "language-model",
    match: /(portugu[eê]s|l[ií]ngua|idioma|literatura|gram[aá]tica|ingl[eê]s|espanhol|franc[eê]s)/i,
    accepted: new Set([
      "highlight_in_text",
      "cloze_test",
      "sentence_builder",
      "matching_pairs",
      "word_matcher",
    ]),
  },
  {
    id: "science-model",
    match: /(ci[eê]ncias?|biologia|qu[ií]mica|f[ií]sica|ecologia|astronomia)/i,
    accepted: new Set([
      "cell_diagram",
      "vector_diagram",
      "diagram_labeler",
      "hot_spot",
      "image_sequence",
      "balance_scale",
      "table",
    ]),
  },
  {
    id: "mathematics-model",
    match: /(matem[aá]tica|geometria|[aá]lgebra|fra[çc][aã]o|n[uú]mero)/i,
    accepted: new Set([
      "fraction_bar",
      "area_model_fraction",
      "geometry_shape",
      "number_line",
      "abacus",
      "place_value_blocks",
      "balance_scale",
      "coordinate_plane",
      "equation_builder",
      "decimal_grid",
    ]),
  },
];

/**
 * Modalidade que cada política implica. Derivado do conjunto `accepted`: uma
 * política cujos componentes aceitos são todos de montagem pede "construct",
 * e assim por diante. Explícito em vez de inferido para que a intenção
 * pedagógica de cada política fique legível.
 */
export const AFFORDANCE_POLICY_MODALITY = Object.freeze({
  "fraction-model": "manipulate",
  "shape-selection": "manipulate",
  "concentration-model": "manipulate",
  "time-model": "manipulate",
  "place-value-model": "manipulate",
  "chronology-model": "construct",
  "music-model": "manipulate",
  "visual-arts-model": "manipulate",
  "humanities-model": "construct",
  "computing-model": "construct",
  "physical-education-model": "manipulate",
  "geography-model": "manipulate",
  "history-model": "construct",
  "language-model": "manipulate",
  "science-model": "manipulate",
  "mathematics-model": "manipulate",
});

/**
 * Modalidade de um componente concreto.
 *
 * `granular: true` devolve o balde da partição (inclusive `order-classify` e
 * `inspect-locate`), que é o que os gates medem. O default dobra para as quatro
 * formas pedagógicas, que é o vocabulário do contrato com o agente 6.
 */
export function modalityForRenderAs(renderAs, { granular = false } = {}) {
  const componente = String(renderAs || "");
  // As exceções são consultadas ANTES do balde granular: são exatamente os
  // componentes cujo balde da partição não descreve a modalidade que o worker
  // deve cumprir. Sem isso, `modalityForRenderAs` e `componentsForModality`
  // discordariam sobre `venn_diagram`.
  if (!granular) {
    for (const coarse of COARSE_MODALITIES) {
      if ((COARSE_EXTRAS[coarse] || []).includes(componente)) return coarse;
    }
  }
  for (const [modalidade, superficies] of Object.entries(RESPONSE_MODALITIES)) {
    if (!superficies.has(componente)) continue;
    if (granular) return modalidade;
    return (
      COARSE_MODALITIES.find((coarse) => COARSE_SOURCES[coarse].includes(modalidade)) || "other"
    );
  }
  return "other";
}
