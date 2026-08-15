/**
 * Manifests retroativos dos 17 componentes que existiam antes do catálogo v2.
 *
 * Cada manifest declara: id, renderAs, inputType (REAL vs MC-visualizado),
 * disciplines, ageRange, bloom, props, fallback. Lido pelo component-registry
 * pra alimentar o roteador inteligente (Track C).
 *
 * inputType: identifica se o componente dá ao aluno UMA FORMA REAL de
 * responder (typed, drag, build) ou se é MC visualizado.
 *   - "typed-numeric": aluno digita número
 *   - "typed-text": aluno digita texto
 *   - "drag-order": aluno arrasta pra reordenar
 *   - "drag-build": aluno arrasta pra construir
 *   - "click-target": aluno clica num alvo único (não MC)
 *   - "mc-button": MC tradicional ou MC visualizado (input ainda é "clicar opção")
 */

export const LEGACY_MANIFESTS = {
  numeric_keypad: {
    id: "numeric_keypad",
    renderAs: "numeric_keypad",
    category: "v1",
    inputType: "typed-numeric", // Quando options=[] aluno digita; quando há options vira mc-button
    inputTypeWithOptions: "mc-button",
    displayName: {
      "pt-BR": "Teclado Numérico",
      en: "Numeric Keypad",
      es: "Teclado Numérico",
      fr: "Clavier Numérique",
    },
    description: "Aluno digita o número usando teclado virtual. Sem options, é input typed real.",
    disciplines: ["matematica", "fisica", "quimica", "ciencias"],
    ageRange: [6, 18],
    bloom: ["apply"],
    cognitiveLoad: "low",
    requiredProps: [],
    fallback: "text",
    // 2026-05-03: Answer Contract — keypad é o componente certo pra resposta numérica.
    // Inclui numeric-with-unit pra capturar "30 lados", "5 cm" (extrai número do ea).
    answerContract: {
      accepts: ["numeric-pure", "numeric-with-unit", "fraction"],
      rejects: ["shape-name", "boolean", "sequence", "text-long", "expression"],
    },
    interactionMode: "answer",
  },
  text: {
    id: "text",
    renderAs: "text",
    category: "v1",
    inputType: "typed-text",
    displayName: { "pt-BR": "Texto Livre", en: "Free Text", es: "Texto Libre", fr: "Texte Libre" },
    description: "Aluno digita resposta livre (equação, expressão, frase curta).",
    disciplines: ["*"],
    ageRange: [8, 18],
    bloom: ["apply", "create"],
    cognitiveLoad: "medium",
    requiredProps: [],
    fallback: "multiple_choice",
  },
  drag_to_order: {
    id: "drag_to_order",
    renderAs: "drag_to_order",
    category: "v1",
    inputType: "drag-order",
    displayName: {
      "pt-BR": "Arrastar pra Ordenar",
      en: "Drag to Order",
      es: "Arrastrar a Orden",
      fr: "Glisser pour Ordonner",
    },
    description: "Aluno reordena itens por arrasto/clique. Input genuíno.",
    disciplines: ["historia", "ciencias", "matematica", "geografia", "biologia"],
    ageRange: [8, 18],
    bloom: ["analyze"],
    cognitiveLoad: "medium",
    requiredProps: ["items"],
    fallback: "multiple_choice",
  },
  sentence_builder: {
    id: "sentence_builder",
    renderAs: "sentence_builder",
    category: "v1",
    inputType: "drag-build",
    displayName: {
      "pt-BR": "Construtor de Frase",
      en: "Sentence Builder",
      es: "Constructor de Oración",
      fr: "Constructeur de Phrase",
    },
    description: "Aluno arrasta palavras de uma bandeja pra montar a frase. Input genuíno.",
    disciplines: ["portugues", "english", "espanhol", "frances", "literatura"],
    ageRange: [7, 18],
    bloom: ["apply", "create"],
    cognitiveLoad: "medium",
    requiredProps: ["wordBank"],
    fallback: "text",
  },
  highlight_in_text: {
    id: "highlight_in_text",
    renderAs: "highlight_in_text",
    category: "v1",
    inputType: "click-target",
    displayName: {
      "pt-BR": "Destacar no Texto",
      en: "Highlight in Text",
      es: "Resaltar en Texto",
      fr: "Surligner dans le Texte",
    },
    description:
      "Aluno clica numa palavra/trecho do texto. Input parcialmente genuíno (escolha de tokens, não opções abstratas).",
    disciplines: ["portugues", "english", "espanhol", "frances", "literatura", "historia"],
    ageRange: [7, 18],
    bloom: ["analyze"],
    cognitiveLoad: "medium",
    requiredProps: ["text"],
    fallback: "word_matcher",
  },
  word_matcher: {
    id: "word_matcher",
    renderAs: "word_matcher",
    category: "v1",
    inputType: "mc-button", // É clicar em card → MC visualizado
    displayName: {
      "pt-BR": "Combinar Palavras",
      en: "Word Matcher",
      es: "Combinar Palabras",
      fr: "Combiner les Mots",
    },
    description:
      "Aluno clica num card de palavra. Internamente é MC visualizado. Para input real, considere matching_pairs ou highlight_in_text.",
    disciplines: ["portugues", "english", "espanhol", "frances"],
    ageRange: [6, 18],
    bloom: ["remember", "understand"],
    cognitiveLoad: "low",
    requiredProps: [],
    fallback: "multiple_choice",
  },
  fraction_bar: {
    id: "fraction_bar",
    renderAs: "fraction_bar",
    category: "v1+upgrade",
    inputType: "manipulate", // 2026-04-27: upgraded — sem options aluno CLICA nas partes pra colorir
    inputTypeWithOptions: "mc-button",
    displayName: {
      "pt-BR": "Barra de Fração",
      en: "Fraction Bar",
      es: "Barra de Fracción",
      fr: "Barre de Fraction",
    },
    description:
      "Barra fracionada. Sem options aluno CLICA nas partes da barra pra colorir e formar a fração (input genuíno). Com options ou mode especial, mostra MC visualizado.",
    disciplines: ["matematica"],
    ageRange: [7, 14],
    bloom: ["understand", "apply"],
    cognitiveLoad: "low",
    requiredProps: ["numerator", "denominator"],
    fallback: "numeric_keypad",
  },
  number_line: {
    id: "number_line",
    renderAs: "number_line",
    category: "v1+upgrade",
    inputType: "click-target", // 2026-04-27: upgraded — sem options vira clique direto
    inputTypeWithOptions: "mc-button",
    displayName: {
      "pt-BR": "Reta Numérica",
      en: "Number Line",
      es: "Recta Numérica",
      fr: "Droite Numérique",
    },
    description:
      "Reta numérica. Sem options aluno CLICA na reta pra colocar marcador (input genuíno). Com options, mostra botões legacy.",
    disciplines: ["matematica"],
    ageRange: [6, 14],
    bloom: ["understand", "apply"],
    cognitiveLoad: "low",
    requiredProps: ["min", "max"],
    fallback: "numeric_keypad",
  },
  place_value_blocks: {
    id: "place_value_blocks",
    renderAs: "place_value_blocks",
    category: "v1+upgrade",
    inputType: "manipulate", // 2026-04-27: upgraded — sem options aluno usa botões +/− pra montar número
    inputTypeWithOptions: "mc-button",
    displayName: {
      "pt-BR": "Blocos de Valor Posicional",
      en: "Place Value Blocks",
      es: "Bloques de Valor Posicional",
      fr: "Blocs de Valeur Positionnelle",
    },
    description:
      "Blocos base-10. Sem options aluno usa botões +/− pra adicionar dezenas e unidades, montando o número total (input genuíno). Com options/operands, mostra modo MC.",
    disciplines: ["matematica"],
    ageRange: [6, 12],
    bloom: ["understand", "apply"],
    cognitiveLoad: "low",
    requiredProps: ["operands"],
    fallback: "numeric_keypad",
    // 2026-05-03: Answer Contract — só aceita numérico (constrói o número via blocos)
    // pedagogicalGuard: igual ao abacus, evita perguntas de cálculo direto.
    answerContract: {
      accepts: ["numeric-pure"],
      rejects: ["shape-name", "boolean", "text-long", "expression"],
    },
    pedagogicalGuard: {
      notWhen: [
        {
          instructionMatches:
            /(quanto[s]?\s+(é|sao|são|fazem|valem)|qual\s+(o\s+)?(valor|resultado|total)|\b(some|subtraia|multiplique|divida|calcule)\b)/i,
          reason: "Cálculo direto — use numeric_keypad em vez de blocos.",
        },
      ],
    },
    interactionMode: "manipulate",
  },
  balance_scale: {
    id: "balance_scale",
    renderAs: "balance_scale",
    category: "v1+upgrade",
    inputType: "manipulate", // 2026-04-27: upgraded — sem options aluno usa botões +/− pra equilibrar
    inputTypeWithOptions: "mc-button",
    displayName: { "pt-BR": "Balança", en: "Balance Scale", es: "Balanza", fr: "Balance" },
    description:
      "Balança 2 pratos. Sem options aluno ajusta o peso direito (botões +/−) pra equilibrar com o esquerdo (input genuíno). Pratos viram verde quando equilibrados. Com options, modo MC.",
    disciplines: ["matematica", "fisica", "quimica"],
    ageRange: [9, 16],
    bloom: ["understand", "apply"],
    cognitiveLoad: "medium",
    requiredProps: [],
    fallback: "equation_builder",
  },
  clock_face: {
    id: "clock_face",
    renderAs: "clock_face",
    category: "v1+upgrade",
    inputType: "manipulate", // 2026-04-27: upgraded — arrastar ponteiros pra ajustar hora
    inputTypeWithOptions: "mc-button",
    displayName: {
      "pt-BR": "Relógio Analógico",
      en: "Clock Face",
      es: "Reloj Analógico",
      fr: "Horloge Analogique",
    },
    description:
      "Relógio analógico. Sem options aluno ARRASTA os ponteiros pra ajustar hora (input genuíno). Com options, mostra botões legacy.",
    disciplines: ["matematica", "ciencias"],
    ageRange: [6, 12],
    bloom: ["remember", "apply"],
    cognitiveLoad: "low",
    requiredProps: [],
    fallback: "numeric_keypad",
  },
  coordinate_plane: {
    id: "coordinate_plane",
    renderAs: "coordinate_plane",
    category: "v1+upgrade",
    inputType: "click-target", // 2026-04-27: upgraded — clique pra colocar ponto
    inputTypeWithOptions: "mc-button",
    displayName: {
      "pt-BR": "Plano Cartesiano",
      en: "Coordinate Plane",
      es: "Plano Cartesiano",
      fr: "Plan Cartésien",
    },
    description:
      "Plano XY. Sem options aluno CLICA no plano pra colocar o ponto (input genuíno). Com options, mostra botões legacy.",
    disciplines: ["matematica", "fisica"],
    ageRange: [10, 18],
    bloom: ["apply", "analyze"],
    cognitiveLoad: "medium",
    requiredProps: [],
    fallback: "numeric_keypad",
  },
  venn_diagram: {
    id: "venn_diagram",
    renderAs: "venn_diagram",
    category: "v1+upgrade",
    inputType: "drag-build", // 2026-04-27: upgraded — sem options aluno arrasta itens pras 3 regiões
    inputTypeWithOptions: "mc-button",
    displayName: {
      "pt-BR": "Diagrama de Venn",
      en: "Venn Diagram",
      es: "Diagrama de Venn",
      fr: "Diagramme de Venn",
    },
    description:
      "Venn 2 conjuntos com interseção. Sem options + items sem region, aluno ARRASTA cada item pra esquerda/intersecção/direita (input genuíno). Com options ou items pré-categorizados, modo MC/visual.",
    disciplines: ["matematica", "biologia", "ciencias", "portugues"],
    ageRange: [9, 18],
    bloom: ["analyze"],
    cognitiveLoad: "medium",
    requiredProps: [],
    fallback: "card_sort",
  },
  vector_diagram: {
    id: "vector_diagram",
    renderAs: "vector_diagram",
    category: "v1",
    inputType: "mc-button",
    inputTypeAfterUpgrade: "drag-build",
    displayName: {
      "pt-BR": "Diagrama Vetorial",
      en: "Vector Diagram",
      es: "Diagrama Vectorial",
      fr: "Diagramme Vectoriel",
    },
    description: "Vetores/forças (DCL). Input atual é MC; planejado arrastar vetores (Sprint 2A).",
    disciplines: ["fisica"],
    ageRange: [12, 18],
    bloom: ["apply", "analyze"],
    cognitiveLoad: "high",
    requiredProps: [],
    fallback: "multiple_choice",
  },
  parabola_plotter: {
    id: "parabola_plotter",
    renderAs: "parabola_plotter",
    category: "v1+upgrade",
    inputType: "manipulate", // 2026-04-27: upgraded — sem options aluno usa sliders pra a/b/c
    inputTypeWithOptions: "mc-button",
    displayName: {
      "pt-BR": "Plotador de Parábola",
      en: "Parabola Plotter",
      es: "Plotter de Parábola",
      fr: "Traceur de Parabole",
    },
    description:
      "Função quadrática y=ax²+bx+c. Sem options aluno ajusta sliders dos coeficientes a/b/c em tempo real, vendo a parábola se transformar (input genuíno). Com options, modo MC.",
    disciplines: ["matematica", "fisica"],
    ageRange: [13, 18],
    bloom: ["apply", "analyze"],
    cognitiveLoad: "high",
    requiredProps: [],
    fallback: "numeric_keypad",
  },
  cell_diagram: {
    id: "cell_diagram",
    renderAs: "cell_diagram",
    category: "v1+upgrade",
    inputType: "click-target", // 2026-04-27: upgraded — sem options aluno clica direto na organela
    inputTypeWithOptions: "mc-button",
    displayName: {
      "pt-BR": "Diagrama Celular",
      en: "Cell Diagram",
      es: "Diagrama Celular",
      fr: "Diagramme Cellulaire",
    },
    description:
      "Célula com organelas. Sem options aluno CLICA direto na organela correta (input genuíno, com confirmação). Com options, mostra MC textual abaixo.",
    disciplines: ["biologia"],
    ageRange: [11, 18],
    bloom: ["remember", "understand"],
    cognitiveLoad: "medium",
    requiredProps: [],
    fallback: "diagram_labeler",
  },
  dynamic_spec: {
    id: "dynamic_spec",
    renderAs: "dynamic_spec",
    category: "v1",
    inputType: "varies", // depende do interaction.mode do spec
    displayName: {
      "pt-BR": "Componente Dinâmico",
      en: "Dynamic Component",
      es: "Componente Dinámico",
      fr: "Composant Dynamique",
    },
    description:
      "Renderer genérico de specs LLM-generated. inputType depende do interaction.mode do spec (display/select-option/click-zone/identify-element).",
    disciplines: ["*"],
    ageRange: [6, 18],
    bloom: ["apply", "analyze"],
    cognitiveLoad: "varies",
    requiredProps: ["spec"],
    fallback: "multiple_choice",
  },
  multiple_choice: {
    id: "multiple_choice",
    renderAs: "multiple_choice",
    category: "v0",
    inputType: "mc-button",
    displayName: {
      "pt-BR": "Múltipla Escolha",
      en: "Multiple Choice",
      es: "Opción Múltiple",
      fr: "Choix Multiple",
    },
    description:
      "MC tradicional. Use SOMENTE quando KC é genuinamente categórico (V/F, definição, escolha entre termos linguísticos).",
    disciplines: ["*"],
    ageRange: [4, 18],
    bloom: ["remember", "understand"],
    cognitiveLoad: "low",
    requiredProps: ["options"],
    fallback: null,
  },
};

// 2026-05-03: Answer Contract retroativo para os componentes legacy que ainda
// não tinham contrato explícito. Mantemos aqui, junto dos manifests legacy, para
// que todo componente exponha claramente que formato de resposta consegue coletar.
const LEGACY_ANSWER_CONTRACTS = {
  text: {
    answerContract: {
      accepts: ["text-short", "text-long", "expression", "unknown"],
      rejects: [
        "numeric-pure",
        "numeric-with-unit",
        "shape-name",
        "boolean",
        "sequence",
        "coordinate",
        "fraction",
        "time",
      ],
    },
    interactionMode: "answer",
  },
  drag_to_order: {
    answerContract: {
      accepts: ["sequence", "unknown"],
      rejects: [
        "numeric-pure",
        "numeric-with-unit",
        "shape-name",
        "boolean",
        "fraction",
        "coordinate",
      ],
    },
    interactionMode: "answer",
  },
  sentence_builder: {
    answerContract: {
      accepts: ["text-short", "text-long", "unknown"],
      rejects: [
        "numeric-pure",
        "numeric-with-unit",
        "shape-name",
        "boolean",
        "sequence",
        "coordinate",
        "fraction",
        "time",
      ],
    },
    interactionMode: "answer",
  },
  highlight_in_text: {
    answerContract: {
      accepts: ["text-short", "text-long", "unknown"],
      rejects: [
        "numeric-pure",
        "numeric-with-unit",
        "shape-name",
        "boolean",
        "sequence",
        "coordinate",
        "fraction",
        "time",
      ],
    },
    interactionMode: "answer",
  },
  word_matcher: {
    answerContract: {
      accepts: ["text-short", "boolean", "unknown"],
      rejects: [
        "numeric-pure",
        "numeric-with-unit",
        "shape-name",
        "sequence",
        "coordinate",
        "fraction",
        "time",
        "text-long",
      ],
    },
    interactionMode: "answer",
  },
  fraction_bar: {
    answerContract: {
      accepts: ["fraction", "unknown"],
      rejects: [
        "numeric-pure",
        "numeric-with-unit",
        "shape-name",
        "boolean",
        "sequence",
        "coordinate",
        "time",
        "text-long",
      ],
    },
    pedagogicalGuard: {
      notWhen: [
        {
          instructionMatches: /(numerador|denominador|qual\s+(o|é)\s+(n[uú]mero|valor))/i,
          // 2026-08-03: quando o gabarito É a fração completa, a barra não
          // entrega a resposta — o aluno a constrói pintando partes. O guard
          // continua valendo para respostas numéricas ("qual o denominador?"),
          // que de resto o answerContract já rejeita por numeric-pure.
          unlessAnswerKind: ["fraction"],
          reason: "Pergunta pede parte/valor textual da fração — a barra pode entregar a resposta.",
        },
      ],
    },
    interactionMode: "manipulate",
  },
  number_line: {
    answerContract: {
      accepts: ["numeric-pure", "numeric-with-unit", "fraction", "unknown"],
      rejects: ["shape-name", "boolean", "sequence", "coordinate", "text-long"],
    },
    interactionMode: "answer",
  },
  balance_scale: {
    answerContract: {
      accepts: ["numeric-pure", "numeric-with-unit", "fraction", "expression", "unknown"],
      rejects: ["shape-name", "boolean", "sequence", "coordinate", "text-long"],
    },
    interactionMode: "manipulate",
  },
  clock_face: {
    answerContract: {
      accepts: ["time", "numeric-pure", "numeric-with-unit", "unknown"],
      rejects: [
        "shape-name",
        "boolean",
        "sequence",
        "coordinate",
        "fraction",
        "expression",
        "text-long",
      ],
    },
    interactionMode: "manipulate",
  },
  coordinate_plane: {
    answerContract: {
      accepts: ["coordinate", "unknown"],
      rejects: [
        "numeric-pure",
        "numeric-with-unit",
        "shape-name",
        "boolean",
        "sequence",
        "fraction",
        "time",
        "text-long",
      ],
    },
    interactionMode: "answer",
  },
  venn_diagram: {
    answerContract: {
      accepts: ["text-short", "sequence", "boolean", "unknown"],
      rejects: [
        "numeric-pure",
        "numeric-with-unit",
        "shape-name",
        "coordinate",
        "fraction",
        "time",
        "expression",
      ],
    },
    interactionMode: "manipulate",
  },
  vector_diagram: {
    answerContract: {
      accepts: ["numeric-pure", "numeric-with-unit", "text-short", "unknown"],
      rejects: ["shape-name", "boolean", "sequence", "fraction", "time", "text-long"],
    },
    interactionMode: "explore",
  },
  parabola_plotter: {
    answerContract: {
      accepts: ["expression", "coordinate", "numeric-pure", "unknown"],
      rejects: ["shape-name", "boolean", "sequence", "fraction", "time", "text-long"],
    },
    interactionMode: "manipulate",
  },
  cell_diagram: {
    answerContract: {
      accepts: ["text-short", "unknown"],
      rejects: [
        "numeric-pure",
        "numeric-with-unit",
        "shape-name",
        "boolean",
        "sequence",
        "coordinate",
        "fraction",
        "time",
        "expression",
      ],
    },
    interactionMode: "answer",
  },
  dynamic_spec: {
    answerContract: {
      accepts: [
        "numeric-pure",
        "numeric-with-unit",
        "shape-name",
        "sequence",
        "coordinate",
        "fraction",
        "expression",
        "time",
        "boolean",
        "text-short",
        "text-long",
        "unknown",
      ],
      rejects: [],
    },
    interactionMode: "manipulate",
  },
  multiple_choice: {
    answerContract: {
      accepts: [
        "numeric-pure",
        "numeric-with-unit",
        "shape-name",
        "sequence",
        "coordinate",
        "fraction",
        "expression",
        "time",
        "boolean",
        "text-short",
        "text-long",
        "unknown",
      ],
      rejects: [],
    },
    interactionMode: "answer",
  },
};

for (const [id, contract] of Object.entries(LEGACY_ANSWER_CONTRACTS)) {
  if (!LEGACY_MANIFESTS[id]) continue;
  LEGACY_MANIFESTS[id] = { ...LEGACY_MANIFESTS[id], ...contract };
}
