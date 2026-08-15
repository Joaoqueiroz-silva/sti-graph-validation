/**
 * component-disciplines.js — a que disciplinas cada componente serve.
 *
 * 2026-08-05. Por que este arquivo existe, e por que ele é UM só:
 *
 * O filtro por disciplina do catálogo (`buildLLMCatalog`, index.js) sempre
 * existiu e sempre foi chamado com a disciplina certa — mas era INERTE, porque
 * nenhuma das 44 specs do registro declarava `disciplines`. Um interruptor
 * ligado sem fio: o catálogo entregue ao Agente 6 era byte a byte idêntico
 * para Matemática e para Artes.
 *
 * O dado existia, só que no lugar errado: o registro LEGADO
 * (`agents/component-registry.js` + manifests) declara `disciplines` para 34
 * dos 44, e alimenta apenas o component-router — nunca o Agente 6 nem a
 * validação de contrato.
 *
 * A tentação seria copiar o campo para os 44 arquivos de componente. Este repo
 * já pagou caro por isso: a taxonomia de modalidade chegou a existir em TRÊS
 * cópias divergentes (`hot_spot` era "manipulate" para quem planejava e
 * "inspect-locate" para quem media), e o incidente de 2026-08-03 nasceu de
 * sync e auditoria com réguas diferentes. Uma segunda cópia de "que disciplina
 * usa que componente" seria a mesma armadilha de novo. Por isso: um módulo,
 * uma fonte, e um teste-sentinela que quebra se um componente novo nascer sem
 * classificação.
 *
 * VOCABULÁRIO: as áreas canônicas de `detectDisciplineArea`
 * (agents/discipline-config.js) — matematica, fisica, quimica, ciencias,
 * historia, geografia, portugues, linguas, artes, filosofia, ed_fisica.
 * NÃO usar as strings cruas do legado ("mathematics", "matemática", "math",
 * "english"): elas misturam idioma e acento, e o casamento por substring que o
 * filtro fazia nunca ligaria "Inglês" a "linguas".
 *
 * "*" = primitivo universal (serve qualquer disciplina). São os componentes de
 * entrada genérica — múltipla escolha, texto, tabela, dropdown — que precisam
 * continuar disponíveis em TODA matéria, senão o catálogo filtrado deixaria
 * disciplinas sem nenhuma opção de fallback.
 */

export const TODAS_DISCIPLINAS = "*";

/**
 * id do componente → áreas canônicas que ele serve.
 * 34 entradas derivadas do registro legado (normalizadas pela taxonomia
 * canônica); 10 classificadas pela própria `description` da spec.
 */
export const COMPONENT_DISCIPLINES = Object.freeze({
  // --- Matemática pura -----------------------------------------------------
  abacus: ["matematica"],
  area_model_fraction: ["matematica"],
  fraction_bar: ["matematica"],
  geometry_shape: ["matematica"],
  number_line: ["matematica"],
  place_value_blocks: ["matematica"],
  // Classificados pela description: composition compõe só componentes de
  // matemática (whitelist place_value_blocks/fraction_bar/number_line/
  // numeric_keypad); os outros três são aritmética explícita.
  composition: ["matematica"],
  decimal_grid: ["matematica"],
  fraction_input: ["matematica"],
  long_division: ["matematica"],

  // --- Exatas (matemática + física/química) --------------------------------
  balance_scale: ["matematica", "fisica", "quimica"],
  coordinate_plane: ["matematica", "fisica"],
  equation_builder: ["matematica", "fisica", "quimica"],
  parabola_plotter: ["matematica", "fisica"],
  numeric_keypad: ["matematica", "fisica", "quimica", "ciencias"],
  vector_diagram: ["fisica"],

  // --- Ciências da natureza ------------------------------------------------
  cell_diagram: ["ciencias"],
  moon_phases: ["ciencias", "fisica", "geografia"],
  clock_face: ["matematica", "ciencias"],

  // --- Humanas e linguagens ------------------------------------------------
  sentence_builder: ["portugues", "linguas"],
  word_matcher: ["portugues", "linguas"],
  cloze_test: ["portugues", "linguas", "historia", "ciencias"],

  // --- Transversais com recorte (servem várias, mas não todas) -------------
  diagram_labeler: ["ciencias", "quimica", "historia", "geografia"],
  hot_spot: ["artes", "ciencias", "historia", "geografia"],
  venn_diagram: ["matematica", "ciencias", "portugues"],

  // --- Operações de raciocínio que não pertencem a matéria nenhuma --------
  // 2026-08-05, ao medir o catálogo filtrado de Artes: com estes marcados por
  // matéria, Artes ficava com 11 componentes e SEM parear obra↔movimento, sem
  // ordenar períodos e sem mapa conceitual. Filtrar demais é pior que não
  // filtrar: o objetivo da Alavanca 2 é tirar parabola_plotter de Artes, não
  // tirar de uma matéria a operação de classificar. Parear, classificar,
  // ordenar, mapear conceito, sequenciar e destacar em texto são operações de
  // RACIOCÍNIO — existem em toda disciplina.
  card_sort: [TODAS_DISCIPLINAS],
  concept_map: [TODAS_DISCIPLINAS],
  drag_to_order: [TODAS_DISCIPLINAS],
  highlight_in_text: [TODAS_DISCIPLINAS],
  image_sequence: [TODAS_DISCIPLINAS],
  matching_pairs: [TODAS_DISCIPLINAS],
  timeline_constructor: [TODAS_DISCIPLINAS],

  // --- Primitivos universais ----------------------------------------------
  // Entrada genérica: precisam existir em toda disciplina, senão o catálogo
  // filtrado deixa a matéria sem rota de fallback.
  card_sort_lab: [TODAS_DISCIPLINAS],
  drag_order: [TODAS_DISCIPLINAS],
  dropdown: [TODAS_DISCIPLINAS],
  dynamic_spec: [TODAS_DISCIPLINAS],
  fill_blanks: [TODAS_DISCIPLINAS],
  image_choice: [TODAS_DISCIPLINAS],
  memory_game: [TODAS_DISCIPLINAS],
  multiple_choice: [TODAS_DISCIPLINAS],
  table: [TODAS_DISCIPLINAS],
  text: [TODAS_DISCIPLINAS],
  true_false: [TODAS_DISCIPLINAS],
  true_false_lab: [TODAS_DISCIPLINAS],
});

/**
 * disciplinesFor — áreas de um componente.
 *
 * Componente desconhecido devolve ["*"] de propósito: um componente novo, ou
 * um id legado fora do registro, tem de continuar VISÍVEL até alguém
 * classificá-lo. O teste-sentinela é que cobra a classificação; o runtime
 * nunca esconde componente por esquecimento.
 */
export function disciplinesFor(id) {
  return COMPONENT_DISCIPLINES[id] || [TODAS_DISCIPLINAS];
}

/**
 * serveDisciplina — o componente serve esta área canônica?
 * Espera a área JÁ normalizada por `detectDisciplineArea`.
 */
export function serveDisciplina(id, area) {
  const areas = disciplinesFor(id);
  if (areas.includes(TODAS_DISCIPLINAS)) return true;
  if (!area || area === "geral") return true; // sem disciplina conhecida, não filtra
  return areas.includes(area);
}
