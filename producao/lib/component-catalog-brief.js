/**
 * component-catalog-brief.js — gera um "brief" textual dos componentes
 * pedagógicos disponíveis pra ser injetado no prompt do Agent6 (Exercise
 * Generator).
 *
 * Por que existe: o Agent6 hoje só conhece 6 tipos de renderAs
 * (multiple_choice, fill_blanks, true_false, drag_order, fraction_input,
 * long_division). Os 20 componentes ricos do registry — fraction_bar, abacus,
 * geometry_shape, image_sequence, sentence_builder, place_value_blocks,
 * clock_face, coordinate_plane, etc. — só aparecem DEPOIS no ui-designer-legacy.
 *
 * Resultado: o Agent6 gera ea em formato genérico (numérico decimal, frase
 * pronta) que não casa com o que os componentes ricos esperam. Mesmo que o
 * router queira escolher fraction_bar, o ea está em formato errado e contract
 * rejeita.
 *
 * Solução: passar este brief pro Agent6 pra ele JÁ gerar ea no formato dos
 * componentes ricos. Filtra por disciplina pra reduzir cognitive load do LLM.
 */

const COMPONENTS_BY_DISCIPLINE = {
  matematica: [
    {
      id: "fraction_bar",
      shortDesc: "Barra fracionada — aluno PINTA partes pra representar a fração",
      eaFormat: '"N/D" (ex: "1/2", "3/4", "2/5")',
      goodExample:
        '{ instruction: "Pinte 1 parte de 2 para representar metade.", expectedAnswer: "1/2", renderAs: "fraction_bar" }',
      badExample: '"Identifique o denominador de 1/2" (ea numérico → use numeric_keypad)',
    },
    {
      id: "abacus",
      shortDesc: "Ábaco — aluno levanta bolinhas em cada haste pra construir um número",
      eaFormat:
        'numérico inteiro 0-9999 (ex: "243"). Pode usar mode + initialState pra steps progressivos',
      goodExample:
        '{ instruction: "Represente o número 125 no ábaco.", expectedAnswer: "125", renderAs: "abacus" }',
      badExample: '"Quanto é 5+3?" (cálculo direto → use numeric_keypad)',
    },
    {
      id: "place_value_blocks",
      shortDesc: "Blocos base 10 — aluno usa +/− pra adicionar dezenas e unidades",
      eaFormat: 'numérico inteiro 0-99 (ex: "47")',
      goodExample:
        '{ instruction: "Construa o número 47 usando dezenas e unidades.", expectedAnswer: "47", renderAs: "place_value_blocks" }',
      badExample: '"Qual é a metade de 47?" (cálculo → use numeric_keypad)',
    },
    {
      id: "number_line",
      shortDesc: "Reta numérica — aluno CLICA na posição correta",
      eaFormat: 'numérico (ex: "5", "-3", "2.5")',
      goodExample:
        '{ instruction: "Clique no número 5 na reta.", expectedAnswer: "5", renderAs: "number_line" }',
      badExample: '"Quanto é 2+3?" (cálculo → use numeric_keypad)',
    },
    {
      id: "geometry_shape",
      shortDesc: "Figuras geométricas planas — aluno CLICA na figura pelo nome",
      eaFormat: 'NOME da figura (ex: "triangulo", "quadrado", "pentagono", "hexagono", "circulo")',
      goodExample:
        '{ instruction: "Qual é a figura com 6 lados?", expectedAnswer: "hexagono", renderAs: "geometry_shape" }',
      badExample: '"Quantos lados tem um hexágono?" (ea numérico → use numeric_keypad)',
    },
    {
      id: "clock_face",
      shortDesc: "Relógio analógico — aluno arrasta ponteiros",
      eaFormat: '"hh:mm" (ex: "10:30", "08:15")',
      goodExample:
        '{ instruction: "Mostre 10:30 no relógio.", expectedAnswer: "10:30", renderAs: "clock_face" }',
      badExample: '"Quantas horas tem um dia?" (numérico → use numeric_keypad)',
    },
    {
      id: "coordinate_plane",
      shortDesc: "Plano cartesiano — aluno CLICA no ponto",
      eaFormat: '"(x,y)" (ex: "(3,4)", "(-2,5)")',
      goodExample:
        '{ instruction: "Marque o ponto (3, 4) no plano.", expectedAnswer: "(3,4)", renderAs: "coordinate_plane" }',
      badExample: '"Some 3+4" (numérico → use numeric_keypad)',
    },
    {
      id: "balance_scale",
      shortDesc: "Balança de 2 pratos — aluno equilibra com pesos",
      eaFormat: 'numérico inteiro (peso a adicionar) ou "=" / ">" / "<"',
      goodExample:
        '{ instruction: "Adicione pesos no prato direito até equilibrar 5 kg.", expectedAnswer: "5", renderAs: "balance_scale" }',
    },
  ],

  ciencias: [
    {
      id: "image_sequence",
      shortDesc: "Sequência visual com imagens/emojis — aluno arrasta cards pra ordenar",
      eaFormat:
        'CSV ordenado dos ids/labels (ex: "evaporacao,condensacao,precipitacao,escoamento")',
      goodExample:
        '{ instruction: "Ordene as etapas do ciclo da água.", expectedAnswer: "evaporacao,condensacao,precipitacao,escoamento", renderAs: "image_sequence" }',
      badExample:
        '"O que é evaporação?" (definição conceitual → use card_sort_lab ou true_false_lab)',
    },
    {
      id: "drag_to_order",
      shortDesc: "Ordenar items genéricos por arrastar",
      eaFormat: 'CSV ordenado (ex: "passo1,passo2,passo3")',
      goodExample:
        '{ instruction: "Ordene as fases da germinação.", expectedAnswer: "semente,broto,planta,fruto", renderAs: "drag_to_order" }',
    },
    {
      id: "cell_diagram",
      shortDesc: "Diagrama de célula — aluno CLICA na organela",
      eaFormat: 'NOME da organela (ex: "nucleo", "mitocondria", "cloroplasto")',
      goodExample:
        '{ instruction: "Clique no núcleo da célula.", expectedAnswer: "nucleo", renderAs: "cell_diagram" }',
    },
    {
      id: "card_sort_lab",
      shortDesc:
        "Classificador — aluno move items pra categorias certas (ex: vertebrados/invertebrados)",
      eaFormat: 'token de marca: ea="ok" funciona; aceita também text-short/text-long/boolean',
      goodExample:
        '{ instruction: "Classifique cada animal como vertebrado ou invertebrado.", expectedAnswer: "ok", renderAs: "card_sort_lab", componentProps: { categories: [{id:"v",name:"Vertebrados",color:"#0891b2",bgColor:"#ecfeff"},{id:"i",name:"Invertebrados",color:"#d97706",bgColor:"#fffbeb"}], items: [{id:"a1",text:"Cachorro",categoryId:"v"},{id:"a2",text:"Aranha",categoryId:"i"},{id:"a3",text:"Peixe",categoryId:"v"},{id:"a4",text:"Caracol",categoryId:"i"}] } }',
      note: "OBRIGATÓRIO: cada item tem categoryId que aponta pro id da categoria correta. Use sempre que houver 2-4 grupos com 4-8 items.",
    },
    {
      id: "true_false_lab",
      shortDesc:
        "Quiz V/F com 3-5 afirmações em sequência + feedback. Substitui múltiplas MC binárias",
      eaFormat: 'token: ea="acertou" funciona; aceita boolean/text-short',
      goodExample:
        '{ instruction: "Avalie cada afirmação sobre estados da matéria.", expectedAnswer: "acertou", renderAs: "true_false_lab", componentProps: { statements: [{id:"s1",text:"A água ferve a 100°C ao nível do mar.",isTrue:true,explanation:"Ponto de ebulição padrão."},{id:"s2",text:"O gelo é menos denso que a água.",isTrue:true,explanation:"Por isso flutua."},{id:"s3",text:"Vapor é água sólida.",isTrue:false,explanation:"Vapor é estado gasoso."}] } }',
      note: "Cada statement TEM explanation pedagógica. Use 3-5 afirmações por step.",
    },
    {
      id: "memory_game",
      shortDesc:
        "Jogo da memória — aluno vira pares pra encontrar associações (palavra-imagem, conceito-definição)",
      eaFormat: 'token: ea="ok" funciona quando aluno completa todos os pares',
      goodExample:
        '{ instruction: "Encontre os pares: animal e seu habitat.", expectedAnswer: "ok", renderAs: "memory_game", componentProps: { cards: [{id:"a0",content:"🐟",pairId:"a"},{id:"a1",content:"Mar",pairId:"a"},{id:"b0",content:"🐦",pairId:"b"},{id:"b1",content:"Floresta",pairId:"b"}] } }',
      note: "Cada par tem 2 cards com mesmo pairId. Mínimo 3 pares (6 cards), ideal 4-6 pares.",
    },
  ],

  portugues: [
    {
      id: "sentence_builder",
      shortDesc: "Construtor de frase — aluno arrasta palavras de um banco EMBARALHADO",
      eaFormat: "frase completa montada (ex: 'O gato dorme no sofá')",
      goodExample:
        '{ instruction: "Monte a frase com as palavras dadas.", expectedAnswer: "o gato dorme no sofá", renderAs: "sentence_builder", componentProps: { wordBank: ["dorme", "o", "gato", "sofá", "no"] } }',
      badExample:
        "\"Monte a frase 'O gato dorme'\" (ea com a frase pronta + sem wordBank → vira text livre, perde a interatividade)",
      note: "OBRIGATÓRIO: gere componentProps.wordBank com as palavras EMBARALHADAS (ordem ≠ frase final).",
    },
    {
      id: "word_matcher",
      shortDesc: "Cards de palavras grandes — aluno clica em UMA palavra escolhida",
      eaFormat: 'a palavra escolhida (ex: "verbo", "substantivo", "adjetivo")',
      goodExample:
        '{ instruction: "Entre \\"correr\\", \\"casa\\", \\"azul\\" — qual é o verbo?", expectedAnswer: "correr", renderAs: "word_matcher" }',
    },
    {
      id: "highlight_in_text",
      shortDesc: "Aluno clica numa palavra dentro de um texto pra destacá-la",
      eaFormat: "a palavra escolhida do texto",
      goodExample:
        '{ instruction: "No texto \\"O cão dormia na varanda\\", clique no SUBSTANTIVO.", expectedAnswer: "cão", renderAs: "highlight_in_text", componentProps: { text: "O cão dormia na varanda" } }',
    },
    {
      id: "cloze_test",
      shortDesc: "Preencher lacunas (fill_blanks) — aluno digita o que falta",
      eaFormat: "valor do blank (ou último blank se múltiplos)",
      goodExample:
        '{ instruction: "Complete: \\"O gato ___ no sofá.\\"", expectedAnswer: "dorme", renderAs: "fill_blanks", config: { template: "O gato ___ no sofá.", blanks: [{ hint: "verbo no presente" }] } }',
    },
    {
      id: "card_sort_lab",
      shortDesc:
        "Classificador — aluno move palavras pra categorias (ex: substantivo/verbo/adjetivo)",
      eaFormat: 'token: ea="ok"',
      goodExample:
        '{ instruction: "Classifique cada palavra pela classe gramatical.", expectedAnswer: "ok", renderAs: "card_sort_lab", componentProps: { categories: [{id:"sub",name:"Substantivos",color:"#0891b2",bgColor:"#ecfeff"},{id:"verb",name:"Verbos",color:"#d97706",bgColor:"#fffbeb"},{id:"adj",name:"Adjetivos",color:"#7c3aed",bgColor:"#f5f3ff"}], items: [{id:"p1",text:"casa",categoryId:"sub"},{id:"p2",text:"correr",categoryId:"verb"},{id:"p3",text:"azul",categoryId:"adj"},{id:"p4",text:"livro",categoryId:"sub"}] } }',
    },
    {
      id: "memory_game",
      shortDesc: "Pares (vocabulário PT-EN, sinônimos, palavra-imagem)",
      eaFormat: 'token: ea="ok"',
      goodExample:
        '{ instruction: "Encontre os pares: animais em português e inglês.", expectedAnswer: "ok", renderAs: "memory_game", componentProps: { cards: [{id:"a0",content:"Cachorro",pairId:"a"},{id:"a1",content:"Dog",pairId:"a"},{id:"b0",content:"Gato",pairId:"b"},{id:"b1",content:"Cat",pairId:"b"}] } }',
    },
    {
      id: "true_false_lab",
      shortDesc: "Quiz V/F sobre regras gramaticais ou afirmações sobre textos",
      eaFormat: 'token: ea="acertou"',
      goodExample:
        '{ instruction: "Avalie cada afirmação sobre concordância.", expectedAnswer: "acertou", renderAs: "true_false_lab", componentProps: { statements: [{id:"s1",text:"\\"Os meninos correm\\" tem concordância correta.",isTrue:true,explanation:"Sujeito plural concorda com verbo plural."}] } }',
    },
  ],

  historia: [
    {
      id: "drag_to_order",
      shortDesc: "Ordenar eventos históricos cronologicamente",
      eaFormat: 'CSV em ordem cronológica (ex: "1500,1822,1888,1889")',
      goodExample:
        '{ instruction: "Ordene os eventos do Brasil colônia.", expectedAnswer: "descobrimento,capitanias,colonia,reino", renderAs: "drag_to_order" }',
    },
    {
      id: "image_sequence",
      shortDesc: "Linha do tempo visual com imagens/símbolos",
      eaFormat: "CSV ordenado",
      goodExample:
        '{ instruction: "Ordene as fases da Idade Média.", expectedAnswer: "alta,plena,baixa", renderAs: "image_sequence" }',
    },
  ],

  geografia: [
    {
      id: "drag_to_order",
      shortDesc: "Ordenar fases/etapas de processos geográficos",
      eaFormat: "CSV ordenado",
      goodExample:
        '{ instruction: "Ordene as etapas da formação de uma rocha sedimentar.", expectedAnswer: "intemperismo,erosao,deposicao,litificacao", renderAs: "drag_to_order" }',
    },
  ],
};

const DEFAULT_DISCIPLINE_KEY = "matematica";

function _normalizeDiscipline(d) {
  const norm = String(d || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  if (/(matem|math)/.test(norm)) return "matematica";
  if (/(cienc|science|biolog|fisic|quimic)/.test(norm)) return "ciencias";
  if (/(portug|portuguese|lingu|literat|english|frances|espanhol|french|spanish)/.test(norm))
    return "portugues";
  if (/(histor|history)/.test(norm)) return "historia";
  if (/(geograf|geography)/.test(norm)) return "geografia";
  return DEFAULT_DISCIPLINE_KEY;
}

/**
 * 2026-08-16 (caderno F2b): no modo worksheet a REGRA DE AGREGAÇÃO ("N steps
 * -> 1 lab") e o CONTRARIO do caderno: cada no do grafo e UMA celula e o que
 * "junta" celulas e o instrumento compartilhado (problem.notebook.instrument),
 * nao um lab agregado. Este bloco substitui a regra de agregacao SO quando
 * buildComponentCatalogBrief e chamado com { worksheet: true }; a chamada
 * antiga (um argumento) continua byte-identica.
 */
const REGRA_CADERNO_SEM_AGREGACAO = `🔥🔥🔥 REGRA DO CADERNO (worksheet): NAO AGREGUE — uma acao cognitiva = uma celula 🔥🔥🔥

Neste STI cada step e UMA celula do caderno (bijecao com o no do grafo). NAO junte
N steps parecidos num unico lab (card_sort_lab, memory_game, true_false_lab,
image_sequence): isso destroi a celula. Se varias celulas pedem a MESMA
representacao (varias fracoes de mesmo denominador, varios inteiros numa faixa,
varias palavras do mesmo texto, varias celulas de uma tabela, varias organelas da
mesma celula), declare UM instrumento compartilhado em "notebook.instrument" e
faca cada celula (role C) apontar um alvo (target) dele.

❌ ERRADO (caderno): 5 classificacoes viram 1 card_sort_lab com expectedAnswer "ok"
✅ CERTO (caderno): 5 celulas A (word_matcher/multiple_choice), uma por classificacao,
   ou 5 celulas C apontando 5 alvos de UM instrumento table

Padroes equivalentes no caderno:
- N celulas "qual a fracao de X?" com o MESMO denominador → 1 instrumento fraction_bar com N alvos (kind "bar")
- N celulas "marque o numero" numa faixa de ate 50 → 1 instrumento number_line com N alvos (kind "marker")
- N celulas "qual palavra do texto e X?" → 1 instrumento highlight_in_text com N alvos (kind "span")
- N celulas "qual organela faz X?" → 1 instrumento cell_diagram com N alvos (kind "organelle")`;

/**
 * Constrói o catalog brief pra ser injetado no prompt do Agent6.
 * @param {string} discipline — nome da disciplina (qualquer idioma)
 * @param {{ worksheet?: boolean }} [opts] — 2026-08-16 (caderno F2b): worksheet=true
 *   troca a REGRA DE AGREGAÇÃO pela regra do caderno; default false = texto anterior
 * @returns {string} brief textual pronto pra concatenar no system prompt
 */
export function buildComponentCatalogBrief(discipline, { worksheet = false } = {}) {
  const key = _normalizeDiscipline(discipline);
  const components =
    COMPONENTS_BY_DISCIPLINE[key] || COMPONENTS_BY_DISCIPLINE[DEFAULT_DISCIPLINE_KEY];

  const lines = components.map((c) => {
    let entry = `• **${c.id}** — ${c.shortDesc}\n  ea formato: ${c.eaFormat}\n  ✅ ${c.goodExample}`;
    if (c.badExample) entry += `\n  ❌ ${c.badExample}`;
    if (c.note) entry += `\n  ⚠️ ${c.note}`;
    return entry;
  });

  if (worksheet) {
    return `

🎯 COMPONENTES INTERATIVOS DISPONÍVEIS (USE PREFERENCIALMENTE — anti-MC):

Antes de gerar um step com renderAs="multiple_choice", VERIFIQUE se ele cabe em um destes componentes interativos. Se sim, USE o componente e formate expectedAnswer NO FORMATO que ele aceita. Se a pergunta natural não cabe, REFORMULE a pergunta pra caber.

${lines.join("\n\n")}

${REGRA_CADERNO_SEM_AGREGACAO}

🎯 REGRA DE OURO: prefira SEMPRE um componente interativo da lista acima a multiple_choice quando o KC permite. multiple_choice é o ÚLTIMO recurso, não o primeiro. STIs pedagogicamente fortes têm 3-5 tipos diferentes de renderAs distribuídos ao longo dos steps, não tudo MC ou tudo numeric_keypad.

⚠️ FORMATO DA expectedAnswer É CRÍTICO: o componente compara a resposta do aluno contra a expectedAnswer literalmente. Se você pedir "qual figura tem 6 lados?" e ea="hexagono" → geometry_shape valida correto. Se você pedir mas ea="6" → vira numeric_keypad. Se você pedir "Pinte 1/2" e ea="0.5" → contract rejeita fraction_bar e cai em numeric_keypad. NÃO MISTURE FORMATOS.
`;
  }

  return `

🎯 COMPONENTES INTERATIVOS DISPONÍVEIS (USE PREFERENCIALMENTE — anti-MC):

Antes de gerar um step com renderAs="multiple_choice", VERIFIQUE se ele cabe em um destes componentes interativos. Se sim, USE o componente e formate expectedAnswer NO FORMATO que ele aceita. Se a pergunta natural não cabe, REFORMULE a pergunta pra caber.

${lines.join("\n\n")}

🔥🔥🔥 REGRA DE AGREGAÇÃO (CRÍTICA — siga ANTES de decompor steps) 🔥🔥🔥

Antes de criar UM step novo, pergunte: "este exercício tem MÚLTIPLOS items
do mesmo tipo (palavras pra classificar, animais pra agrupar, afirmações
V/F pra avaliar, pares pra associar)?" SE SIM, agregue tudo em UM ÚNICO
step com o componente apropriado da lista, em vez de criar N steps
parecidos.

❌ ERRADO (5 steps repetitivos):
  step_1: "Classifique o cachorro" → word_matcher  ea="vertebrado"
  step_2: "Classifique o polvo" → word_matcher  ea="invertebrado"
  step_3: "Classifique o peixe" → word_matcher  ea="vertebrado"
  step_4: "Classifique a aranha" → word_matcher  ea="invertebrado"
  step_5: "Classifique o sapo" → word_matcher  ea="vertebrado"

✅ CERTO (1 step só, com componente do lab):
  step_1: { instruction: "Classifique cada animal como vertebrado ou invertebrado.",
            expectedAnswer: "ok",
            renderAs: "card_sort_lab",
            componentProps: {
              categories: [
                { id: "v", name: "Vertebrados", color: "#0891b2", bgColor: "#ecfeff" },
                { id: "i", name: "Invertebrados", color: "#d97706", bgColor: "#fffbeb" }
              ],
              items: [
                { id: "a1", text: "Cachorro", categoryId: "v" },
                { id: "a2", text: "Polvo", categoryId: "i" },
                { id: "a3", text: "Peixe", categoryId: "v" },
                { id: "a4", text: "Aranha", categoryId: "i" },
                { id: "a5", text: "Sapo", categoryId: "v" }
              ]
            } }

Padrões equivalentes:
- N steps "associe X com Y" / "qual o significado de X?" → 1 step memory_game (4-6 pares)
- N steps "X é verdadeiro?" / "Y é falso?" sobre mesmo tema → 1 step true_false_lab (3-5 statements)
- N steps "ordene X-Y-Z?" → 1 step image_sequence ou drag_to_order
- N steps "qual a fração de X?" pintando partes diferentes → 1 step fraction_bar (se mesma barra) ou múltiplos (se barras distintas)

A REGRA DE AGREGAÇÃO VALE QUANDO os N items pertencem ao MESMO tema e são
do MESMO tipo cognitivo. Se forem temas diferentes (ex: 1 step de
classificar animais + 1 step de ordenar etapas), MANTENHA separados.

🎯 REGRA DE OURO: prefira SEMPRE um componente interativo da lista acima a multiple_choice quando o KC permite. multiple_choice é o ÚLTIMO recurso, não o primeiro. STIs pedagogicamente fortes têm 3-5 tipos diferentes de renderAs distribuídos ao longo dos steps, não tudo MC ou tudo numeric_keypad.

⚠️ FORMATO DA expectedAnswer É CRÍTICO: o componente compara a resposta do aluno contra a expectedAnswer literalmente. Se você pedir "qual figura tem 6 lados?" e ea="hexagono" → geometry_shape valida correto. Se você pedir mas ea="6" → vira numeric_keypad. Se você pedir "Pinte 1/2" e ea="0.5" → contract rejeita fraction_bar e cai em numeric_keypad. NÃO MISTURE FORMATOS.
`;
}

export const COMPONENT_CATALOG_DISCIPLINES = Object.keys(COMPONENTS_BY_DISCIPLINE);
