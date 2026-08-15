/**
 * component-registry-lab-manifests.js — componentes promovidos do edu-components-lab.
 *
 * A PR #21 adicionou tools/edu-components-lab/src/components/components.registry.json.
 * O backend Docker copia apenas /backend, entao mantemos estes manifests runtime-safe
 * dentro do backend enquanto o JSON do lab continua sendo a fonte editorial.
 */

export const LAB_MANIFESTS = {
  image_sequence: {
    id: "image_sequence",
    renderAs: "image_sequence",
    category: "lab+runtime",
    inputType: "drag-order",
    displayName: {
      "pt-BR": "Sequencia de imagens",
      en: "Image Sequence",
      es: "Secuencia de imagenes",
      fr: "Sequence d'images",
    },
    description:
      "Sequenciacao visual de etapas, ciclos naturais, processos e eventos com imagens, emojis ou textos curtos.",
    disciplines: ["science", "ciencias", "ciências", "portugues", "historia", "geografia"],
    ageRange: [5, 10],
    bloom: ["understand", "apply", "analyze"],
    cognitiveLoad: "medium",
    requiredProps: [],
    fallback: "drag_to_order",
    bnccCodes: ["EF05CI01"],
    sourceRegistry: "tools/edu-components-lab/src/components/components.registry.json",
    examples: [
      { kc: "kc_ciclo_de_vida", instruction: "Organize as etapas do ciclo de vida da planta." },
      { kc: "kc_ordem_de_processo", instruction: "Coloque as etapas do processo em ordem." },
    ],
    pedagogyNotes:
      "Use quando o objetivo depende de ordenar etapas com apoio visual, nao apenas texto.",
    // 2026-05-03: Answer Contract — só faz sentido quando ea é uma SEQUÊNCIA ordenada.
    answerContract: {
      accepts: ["sequence"],
      rejects: ["numeric-pure", "boolean", "shape-name", "text-long"],
    },
    interactionMode: "answer", // aluno arrasta pra ordenar
  },
  abacus: {
    id: "abacus",
    renderAs: "abacus",
    category: "lab+runtime",
    inputType: "manipulate",
    displayName: { "pt-BR": "Abaco", en: "Abacus", es: "Abaco", fr: "Boulier" },
    description:
      "Abaco interativo para representar numeros, valor posicional, unidades, dezenas, centenas e milhares.",
    disciplines: ["mathematics", "matematica", "matemática", "math"],
    ageRange: [5, 10],
    bloom: ["understand", "apply"],
    cognitiveLoad: "medium",
    requiredProps: [],
    fallback: "place_value_blocks",
    bnccCodes: ["EF01MA01", "EF01MA02", "EF01MA03", "EF01MA04"],
    sourceRegistry: "tools/edu-components-lab/src/components/components.registry.json",
    examples: [
      { kc: "kc_valor_posicional", instruction: "Represente 243 no abaco." },
      {
        kc: "kc_dezenas_unidades",
        instruction: "Monte o numero usando centenas, dezenas e unidades.",
      },
    ],
    pedagogyNotes:
      "Use quando o aluno precisa manipular casas decimais em vez de apenas digitar o resultado.",
    // 2026-05-03: Answer Contract — ábaco aceita números, mas só faz sentido pra
    // CONSTRUIR/REPRESENTAR um número (manipulate). Se a pergunta é "quanto é 5+3?",
    // numeric_keypad é mais honesto. Por isso o pedagogicalGuard rejeita instruções
    // de cálculo direto.
    answerContract: {
      accepts: ["numeric-pure"],
      rejects: ["shape-name", "boolean", "text-long", "expression"],
    },
    pedagogicalGuard: {
      notWhen: [
        {
          instructionMatches:
            /(quanto[s]?\s+(é|sao|são|fazem|valem)|qual\s+(o\s+)?(valor|resultado|total)|\b(some|subtraia|multiplique|divida|calcule)\b)/i,
          reason: "Cálculo direto — use numeric_keypad em vez de manipular o ábaco",
        },
      ],
    },
    interactionMode: "manipulate", // aluno move bolinhas pra construir o número
  },
  geometry_shape: {
    id: "geometry_shape",
    renderAs: "geometry_shape",
    category: "lab+runtime",
    inputType: "click-target",
    displayName: {
      "pt-BR": "Figuras geometricas",
      en: "Geometry Shape",
      es: "Figura geometrica",
      fr: "Figure geometrique",
    },
    description:
      "Exploracao e classificacao de figuras planas por lados, vertices, formas e propriedades visuais.",
    disciplines: ["mathematics", "matematica", "matemática", "geometry", "geometria"],
    ageRange: [5, 10],
    bloom: ["understand", "apply", "analyze"],
    cognitiveLoad: "medium",
    requiredProps: [],
    fallback: "coordinate_plane",
    bnccCodes: ["EF01MA14"],
    sourceRegistry: "tools/edu-components-lab/src/components/components.registry.json",
    examples: [
      {
        kc: "kc_figuras_geometricas",
        instruction: "Identifique a figura com 4 lados e 4 vertices.",
      },
      { kc: "kc_propriedades_das_formas", instruction: "Compare as formas pelo numero de lados." },
    ],
    pedagogyNotes:
      "Use para reconhecimento visual de formas e propriedades, especialmente anos iniciais.",
    // 2026-05-03: Answer Contract — só pra perguntas onde ea é o NOME da figura
    // ("Qual figura tem 6 lados?" → "hexagono"). Se ea é numérico ("Quantos lados
    // tem um hexagono?" → "6"), o componente vira spoiler porque mostra atributos
    // pré-computados. Roteia pra numeric_keypad nesses casos.
    answerContract: {
      accepts: ["shape-name"],
      rejects: ["numeric-pure", "numeric-with-unit", "boolean", "sequence", "text-long"],
    },
    pedagogicalGuard: {
      notWhen: [
        {
          instructionMatches:
            /^\s*quantos?\s+(lados?|v[eé]rtices?|arestas?|graus?|faces?|cantos?)/i,
          reason: "Pergunta de contagem → componente entrega resposta. Use numeric_keypad.",
        },
      ],
    },
    interactionMode: "answer", // aluno clica na figura pra responder
  },

  // 2026-05-04: 3 componentes Transversal do lab promovidos pro runtime.
  // card_sort_lab evita colisão com card_sort do catálogo v2 (semântica diferente).
  card_sort_lab: {
    id: "card_sort_lab",
    renderAs: "card_sort_lab",
    category: "lab+runtime",
    inputType: "drag-build",
    displayName: {
      "pt-BR": "Classificador de cards",
      en: "Card Sort",
      es: "Clasificación de tarjetas",
      fr: "Tri de cartes",
    },
    description:
      "Aluno classifica items em categorias clicando. Cada item tem categoryId; aluno move pra coluna certa.",
    disciplines: ["*"],
    ageRange: [6, 16],
    bloom: ["understand", "analyze"],
    cognitiveLoad: "medium",
    requiredProps: ["categories", "items"],
    fallback: "multiple_choice",
    bnccCodes: [],
    sourceRegistry: "tools/edu-components-lab/.../Transversal/CardSort.tsx",
    examples: [
      {
        kc: "kc_classificar_seres_vivos",
        instruction: "Classifique: animais vertebrados x invertebrados.",
      },
      {
        kc: "kc_classes_gramaticais",
        instruction: "Classifique cada palavra como substantivo, verbo ou adjetivo.",
      },
    ],
    pedagogyNotes:
      "Use sempre que houver 2-4 grupos com 4-8 items pra distribuir. Substitui MC com >2 grupos.",
    answerContract: {
      // Aceita ea como token de marca (componente envia "ok" ou "errou:N/M") OU
      // text-short genérico. Não aceita formatos numéricos puros.
      accepts: ["text-short", "text-long", "boolean", "unknown"],
      rejects: [
        "numeric-pure",
        "numeric-with-unit",
        "fraction",
        "coordinate",
        "shape-name",
        "time",
      ],
    },
    interactionMode: "answer",
  },
  memory_game: {
    id: "memory_game",
    renderAs: "memory_game",
    category: "lab+runtime",
    inputType: "click-target",
    displayName: {
      "pt-BR": "Jogo da memória",
      en: "Memory Game",
      es: "Juego de memoria",
      fr: "Jeu de mémoire",
    },
    description:
      "Aluno vira pares de cartas pra encontrar associações. Cada par tem o mesmo pairId.",
    disciplines: ["*"],
    ageRange: [5, 14],
    bloom: ["remember", "understand"],
    cognitiveLoad: "low",
    requiredProps: ["cards"],
    fallback: "word_matcher",
    bnccCodes: [],
    sourceRegistry: "tools/edu-components-lab/.../Transversal/MemoryGame.tsx",
    examples: [
      {
        kc: "kc_associar_palavra_imagem",
        instruction: "Encontre os pares: animal e seu nome em inglês.",
      },
      {
        kc: "kc_associar_capital_pais",
        instruction: "Encontre os pares: capital e país.",
      },
    ],
    pedagogyNotes:
      "Use pra associação de pares (palavra-imagem, conceito-definição, capital-país, etc.). Concluído quando todos os pares foram encontrados.",
    answerContract: {
      accepts: ["text-short", "text-long", "boolean", "unknown"],
      rejects: [
        "numeric-pure",
        "numeric-with-unit",
        "fraction",
        "coordinate",
        "shape-name",
        "time",
      ],
    },
    interactionMode: "answer",
  },
  true_false_lab: {
    id: "true_false_lab",
    renderAs: "true_false_lab",
    category: "lab+runtime",
    inputType: "click-target",
    displayName: {
      "pt-BR": "Verdadeiro ou Falso (revisão)",
      en: "True/False Quiz",
      es: "Verdadero o Falso",
      fr: "Vrai ou Faux",
    },
    description:
      "Quiz V/F com 3-5 afirmações em sequência + feedback animado. Diferente do true_false legacy (uma afirmação só).",
    disciplines: ["*"],
    ageRange: [7, 16],
    bloom: ["remember", "understand", "evaluate"],
    cognitiveLoad: "low",
    requiredProps: ["statements"],
    fallback: "multiple_choice",
    bnccCodes: [],
    sourceRegistry: "tools/edu-components-lab/.../Transversal/TrueFalse.tsx",
    examples: [
      {
        kc: "kc_revisar_fatos_historicos",
        instruction: "Avalie cada afirmação sobre o Brasil colônia.",
      },
      {
        kc: "kc_revisar_propriedades_fisicas",
        instruction: "Avalie cada afirmação sobre estados da matéria.",
      },
    ],
    pedagogyNotes:
      "Use pra revisão de conceitos com 3-5 afirmações. Substitui múltiplas MC binárias seguidas. Sempre forneça explanation pedagógica em cada statement.",
    answerContract: {
      accepts: ["boolean", "text-short", "unknown"],
      rejects: [
        "numeric-pure",
        "numeric-with-unit",
        "fraction",
        "coordinate",
        "shape-name",
        "time",
        "sequence",
        "expression",
      ],
    },
    interactionMode: "answer",
  },

  // 2026-05-23: Astronomia (EF08CI12) — simulador orbital Sol/Terra/Lua com fases.
  // Resposta esperada: id de fase ("nova", "crescente", "quarto_crescente",
  // "cheia", "quarto_minguante") OU nome em PT/EN normalizado.
  moon_phases: {
    id: "moon_phases",
    renderAs: "moon_phases",
    category: "lab+runtime",
    inputType: "click-target",
    displayName: {
      "pt-BR": "Fases da Lua",
      en: "Moon Phases",
      es: "Fases de la Luna",
      fr: "Phases de la Lune",
    },
    description:
      "Simulador orbital Sol/Terra/Lua com 5 fases (nova, crescente, quarto crescente, cheia, quarto minguante). Aluno seleciona a fase observada da Terra dada uma configuração orbital.",
    disciplines: ["ciencias", "ciências", "geografia", "astronomia", "science"],
    ageRange: [10, 14],
    bloom: ["understand", "apply", "analyze"],
    cognitiveLoad: "medium",
    requiredProps: [],
    fallback: "multiple_choice",
    bnccCodes: ["EF08CI12"],
    sourceRegistry: "tools/edu-components-lab/src/components/bncc/EF69/MoonPhases.tsx",
    examples: [
      {
        kc: "kc_fases_da_lua",
        instruction: "Qual fase a Lua mostra quando está alinhada do lado oposto ao Sol?",
      },
      {
        kc: "kc_ciclo_lunar",
        instruction: "Identifique a fase observada quando metade da Lua aparece iluminada.",
      },
    ],
    pedagogyNotes:
      "Use sempre que o KC envolver identificação de fases lunares ou relação Sol/Terra/Lua. Componente é manipulável: aluno gira a órbita pra ver a fase resultante na visão da Terra. Substitui MC sobre fases por exploração ativa.",
    answerContract: {
      accepts: ["text-short", "unknown"],
      rejects: [
        "numeric-pure",
        "numeric-with-unit",
        "fraction",
        "coordinate",
        "time",
        "expression",
      ],
    },
    interactionMode: "answer",
  },
};
