/**
 * component-sets.js — FONTE ÚNICA dos conjuntos de capacidade de componentes.
 *
 * 2026-06-10 (auditoria de engenharia): adicionar um componente novo exigia
 * tocar 5+ whitelists espalhadas (ui-designer SUPPORTED, sti-generation
 * RICH/ACCEPTED e NON_OPTIONS, step-consistency SPECIAL/FREE_INPUT,
 * quality-gate PASSIVE) — esquecer UMA delas degradava o componente
 * silenciosamente (aconteceu 4× com o equation_builder na mesma sessão).
 *
 * Regras de manutenção:
 *  - Componente NOVO → adicione aqui (em TODOS os conjuntos que se aplicam) e
 *    siga docs/GUIA-NOVO-COMPONENTE.md.
 *  - O teste sentinela (backend/shared/__tests__/component-sets.test.js)
 *    compara estes conjuntos com o registry determinístico — componente no
 *    registry fora da taxonomia QUEBRA a suíte (de propósito).
 *  - O frontend mantém espelhos próprios (RICH_RENDER_AS no RichStepRenderer;
 *    RICH_MANIPULATIVE_RENDER_AS em frontend/src/lib/componentSets.js) — o
 *    sentinela de cobertura do registry (coverage.test.js) amarra
 *    frontend↔registry, e o teste de paridade do frontend
 *    (lib/__tests__/componentSets.parity.test.js) amarra o espelho a este arquivo.
 */

// ============================================================
// SELEÇÃO vs CONSTRUÇÃO (semântica pedagógica)
// ============================================================

/** Aluno SELECIONA entre opções prontas — monotonia destes é bloqueante no gate. */
export const PASSIVE_SELECTION = new Set([
  "multiple_choice",
  "true_false",
  "image_choice",
  "true_false_lab",
]);

// ============================================================
// PIPELINE DE GERAÇÃO (sti-generation)
// ============================================================

/** Componentes ricos que o loop de atribuição do designer pode materializar. */
export const RICH_COMPONENTS = new Set([
  "place_value_blocks",
  "fraction_bar",
  "area_model_fraction",
  "number_line",
  "numeric_keypad",
  "balance_scale",
  "clock_face",
  "coordinate_plane",
  "word_matcher",
  "highlight_in_text",
  "drag_to_order",
  "sentence_builder",
  "venn_diagram",
  "vector_diagram",
  "parabola_plotter",
  "cell_diagram",
  "dynamic_spec",
  "equation_builder",
  "cloze_test",
  "diagram_labeler",
  "timeline_constructor",
  "hot_spot",
  "card_sort",
  "matching_pairs",
  "concept_map",
  "image_sequence",
  "abacus",
  "geometry_shape",
  "card_sort_lab",
  "memory_game",
  "true_false_lab",
  "composition",
]);

/** Tudo que o loop de atribuição aceita gravar em step.renderAs. */
export const GENERATION_ACCEPTED = new Set([...RICH_COMPONENTS, "text", "multiple_choice"]);

/**
 * 2026-08-05 (modo simples, pedido do João/orientador): renderAs SEMPRE
 * respondíveis — corrigidos por comparação de texto (answersMatch/matchAnswer
 * com acceptableVariations), sem contrato de componente que possa rejeitar o
 * gabarito. Quando o criador NÃO marca "interface rica (experimental)", o
 * pipeline fica restrito a este conjunto. A trava dura é o clamp em
 * component-registry/validate.js; catálogo do agente 6, router, ui-designer,
 * diversifier e structural-gate respeitam o flag pra não produzir trabalho
 * que o clamp desfaria.
 */
export const SIMPLE_INTERFACE_RENDER_AS = new Set(["text", "multiple_choice"]);

/**
 * Componentes que NÃO usam options[] — o gate final NÃO deve auto-gerar
 * distratores pra eles (gerava e convertia card_sort_lab→text antes de 2026-05-04).
 */
export const NON_OPTIONS_COMPONENTS = new Set([
  "card_sort_lab",
  "memory_game",
  "true_false_lab",
  "abacus",
  "geometry_shape",
  "image_sequence",
  "fraction_bar",
  "area_model_fraction",
  "place_value_blocks",
  "number_line",
  "clock_face",
  "coordinate_plane",
  "balance_scale",
  "drag_to_order",
  "sentence_builder",
  "vector_diagram",
  "parabola_plotter",
  "cell_diagram",
  "venn_diagram",
  "equation_builder",
  "cloze_test",
  "diagram_labeler",
  "timeline_constructor",
  "hot_spot",
  "card_sort",
  "matching_pairs",
  "concept_map",
  "dynamic_spec",
  "highlight_in_text",
  "word_matcher",
  "numeric_keypad",
  "text",
  "composition",
]);

// ============================================================
// GATES & NORMALIZAÇÃO (final-gate, tutor-normalization, TutorView)
// ============================================================

/**
 * Manipulativos ricos: o aluno responde MANIPULANDO o componente (montar,
 * arrastar, marcar) — gates e normalização NUNCA devem auto-gerar options[]
 * pra eles nem convertê-los pra seleção.
 *
 * 2026-06-11 (auditoria de organização): vivia triplicado (final-gate,
 * tutor-normalization e TutorView) e as cópias do backend já tinham
 * divergido — ficaram sem o area_model_fraction promovido em 2026-06-10.
 * Unificado aqui; o espelho do frontend é amarrado por teste de paridade.
 */
export const RICH_MANIPULATIVE_RENDER_AS = new Set([
  "fraction_bar",
  "area_model_fraction",
  "abacus",
  "number_line",
  "balance_scale",
  "clock_face",
  "coordinate_plane",
  "sentence_builder",
  "drag_to_order",
  "image_sequence",
  "card_sort_lab",
  "card_sort",
  "memory_game",
  "true_false_lab",
  "cloze_test",
  "equation_builder",
  "diagram_labeler",
  "timeline_constructor",
  "matching_pairs",
  "concept_map",
  "hot_spot",
  "venn_diagram",
]);

// ============================================================
// UI-DESIGNER (escolha de componente por step)
// ============================================================

/** Componentes que o ui-designer sabe atribuir/decorar (fora daqui → regex fallback). */
export const DESIGNER_SUPPORTED = new Set([
  "place_value_blocks",
  "fraction_bar",
  "area_model_fraction",
  "number_line",
  "numeric_keypad",
  "balance_scale",
  "clock_face",
  "coordinate_plane",
  "word_matcher",
  "highlight_in_text",
  "drag_to_order",
  "sentence_builder",
  "venn_diagram",
  "multiple_choice",
  "text",
  "composition",
  "vector_diagram",
  "parabola_plotter",
  "cell_diagram",
  "image_sequence",
  "abacus",
  "geometry_shape",
  "dynamic_spec",
  "equation_builder",
]);

// ============================================================
// STEP-CONSISTENCY-SANITIZER (coerência renderAs↔options)
// ============================================================

/** Precisam de input específico do componente (incompatíveis com options genéricas). */
export const SPECIAL_INPUT = new Set([
  "fraction_bar",
  "area_model_fraction",
  "fraction_input",
  "number_line",
  "clock_face",
  "coordinate_plane",
  "equation_builder",
  "abacus",
  "place_value_blocks",
  "balance_scale",
  "parabola_plotter",
  "geometry_shape",
  "vector_diagram",
  "venn_diagram",
  "diagram_labeler",
  "hot_spot",
  "timeline_constructor",
  "image_sequence",
  "map_outline",
  "card_sort",
  "concept_map",
  "sentence_builder",
  "highlight_in_text",
  "word_matcher",
  "matching_pairs",
  "cloze_test",
  "drag_to_order",
  "drag_order",
  "long_division",
  "decimal_grid",
  "cell_diagram",
  "memory_game_lab",
  "true_false_lab",
]);
// NOTA: memory_game, dynamic_spec, composition, moon_phases e table ficam FORA
// de SPECIAL_INPUT de propósito — o CASO B do consistency-sanitizer converteria
// p/ multiple_choice ao ver options-lixo, perdendo o componente. Lacunas
// rastreadas no snapshot do teste sentinela (component-sets.test.js).

/** Aceitam options simples (texto/número) sem quebrar. */
export const NEUTRAL_INPUT = new Set([
  "multiple_choice",
  "image_choice",
  "true_false",
  "fill_blanks",
  "numeric_keypad",
  "text",
  "dropdown",
]);

/** Valor LIVRE validado direto contra expectedAnswer (não usam options[]). */
export const FREE_INPUT = new Set([
  "fraction_bar",
  "area_model_fraction",
  "fraction_input",
  "number_line",
  "clock_face",
  "coordinate_plane",
  "numeric_keypad",
  "text",
  "fill_blanks",
  "abacus",
  "place_value_blocks",
  "equation_builder",
]);

// ============================================================
// PRODUZIBILIDADE DA RESPOSTA (auditoria de interface 2026-08-02)
// ============================================================

/**
 * A resposta é DIGITADA caractere a caractere pelo aluno.
 *
 * Nestes componentes um gabarito longo é irrespondível na prática: ninguém
 * digita "Afastou os cafeicultores escravistas e retirou a sustentação do
 * Império". Quando o gabarito não é digitável, a resposta precisa ser
 * SELECIONADA ou MONTADA — ver `typedAnswerObstacle` em shared/answer-shape.js.
 */
export const TYPED_ENTRY_RENDER_AS = new Set([
  "text",
  "short_answer",
  "numeric_keypad",
  "currency_input",
  "fraction_input",
  "math_input",
]);

/**
 * A resposta longa é MONTADA por manipulação (arrastar, ordenar, encaixar), e
 * não digitada — aqui o comprimento do gabarito é legítimo.
 */
export const ASSEMBLED_ANSWER_RENDER_AS = new Set([
  "drag_to_order",
  "sentence_builder",
  "timeline_constructor",
  "matching_pairs",
  "word_matcher",
  "card_sort",
  "card_sort_lab",
  "concept_map",
  "equation_builder",
  "cloze_test",
  "image_sequence",
]);
