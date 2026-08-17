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

// 2026-08-16 (F0 do caderno): affordance-policies.js e um modulo folha (nao
// importa nada), entao importar daqui NAO fecha ciclo. Se algum dia ele passar
// a importar component-sets, mova os conjuntos NOTEBOOK_* para um
// notebook-roles.js proprio e reexporte daqui.
import { RESPONSE_MODALITIES } from "./affordance-policies.js";

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
  // 2026-08-16 (caderno F4, tarefa 4): fraction_input e digitacao pura
  // (VisualInputs.FractionInput nao renderiza options) e o proprio guard da
  // spec rejeita options. Fora deste conjunto o gate final auto-gerava
  // distratores e depois convertia o passo. NAO entra em RICH_COMPONENTS /
  // GENERATION_ACCEPTED / DESIGNER_SUPPORTED aqui: isso muda roteamento
  // (pendencia F3).
  "fraction_input",
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
  // 2026-08-16 (caderno F4, tarefa 5): o aluno MONTA o numero com os blocos
  // (PlaceValueBlocks.jsx sem options e interativo). Fora deste conjunto o
  // TutorView/stepPresentation mantinha as options do step e o componente
  // caia no modo MC (revisao do plano do caderno, item place_value_blocks).
  // Ja estava em RICH_COMPONENTS e NON_OPTIONS_COMPONENTS, entao os
  // invariantes do sentinela continuam validos. Espelho no frontend:
  // frontend/src/lib/componentSets.js (teste de paridade obriga os dois).
  "place_value_blocks",
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

// ============================================================
// CADERNO CTAT (interfaceMode = worksheet): papel de cada componente
// ============================================================

/**
 * 2026-08-16 (F0 do caderno): no modo worksheet cada no do grafo vira uma
 * CELULA de um caderno e cada componente precisa saber que papel pode fazer
 * nesse caderno. Os papeis:
 *
 *   A = celula simples: o aluno digita ou seleciona (input compacto, cabe numa
 *       linha do caderno);
 *   B = celula rica inline: o componente inteiro e renderizado dentro da celula
 *       (o aluno constroi, manipula, ordena ou localiza);
 *   C = instrumento: componente compartilhado por varias celulas, com ALVOS
 *       (targets) que as celulas referenciam via instrumentRef/target;
 *   D = figura: o mesmo componente renderizado readOnly como apoio visual.
 *
 * A e B sao DERIVADOS da taxonomia granular RESPONSE_MODALITIES (a acao real
 * do aluno), e nao uma terceira tabela paralela: este repo ja se queimou com
 * a mesma classificacao vivendo em copias divergentes (auditoria 2026-08-02).
 * O teste taxonomia-modalidade-unica.test.js trava a particao granular; o
 * sentinela em component-sets.test.js trava que todo id do registro cai em
 * A ou B; coverage.test.js trava a coerencia entre estes conjuntos e o campo
 * `notebook.roles` declarado em cada spec.
 *
 * `dynamic_spec` entra em B por fora porque fica de proposito fora da particao
 * granular (ver COARSE_EXTRAS em affordance-policies.js): uma cena sob medida
 * e sempre renderizavel inline.
 */
const uniaoDeBaldes = (...baldes) => new Set(baldes.flatMap((balde) => [...balde]));

/** Papel A: o aluno seleciona ou digita (select U type). */
export const NOTEBOOK_A = uniaoDeBaldes(RESPONSE_MODALITIES.select, RESPONSE_MODALITIES.type);

/** Papel B: o componente vive inteiro dentro da celula (tudo que nao e A). */
export const NOTEBOOK_B = uniaoDeBaldes(
  RESPONSE_MODALITIES.construct,
  RESPONSE_MODALITIES.manipulate,
  RESPONSE_MODALITIES["order-classify"],
  RESPONSE_MODALITIES["inspect-locate"],
  ["dynamic_spec"]
);

/**
 * Papel C, versao 1: lista FECHADA dos instrumentos que o caderno sabe montar
 * (cada um declara `notebook.targets` na spec do registro). Todos sao tambem
 * B (subconjunto de A U B): um instrumento e sempre um componente rico que
 * poderia viver sozinho numa celula; C so diz que ele TAMBEM pode ser
 * compartilhado entre celulas. Abrir a lista exige ensinar o frontend a
 * resolver o target novo, por isso e fechada e versionada.
 */
export const NOTEBOOK_C_V1 = new Set([
  "number_line",
  "fraction_bar",
  "highlight_in_text",
  "table",
  "cell_diagram",
]);

/** Papel D: figura readOnly. Tudo que e renderizavel inline (B) tambem e figura. */
export const NOTEBOOK_D = new Set(NOTEBOOK_B);

/** Rotulos legiveis dos papeis (catalogo do agente 6 com includeNotebook, docs). */
export const NOTEBOOK_ROLE_LABELS = Object.freeze({
  A: "celula simples",
  B: "celula rica inline",
  C: "instrumento",
  D: "figura",
});

/**
 * Papel PRINCIPAL de um renderAs no caderno: 'A' | 'B' | null.
 * A e B sao disjuntos por construcao (a granular e particao), entao a
 * resposta e unica. null = id fora do registro (ou lacuna, ver o sentinela).
 */
export function notebookRoleForRenderAs(renderAs) {
  if (NOTEBOOK_A.has(renderAs)) return "A";
  if (NOTEBOOK_B.has(renderAs)) return "B";
  return null;
}
