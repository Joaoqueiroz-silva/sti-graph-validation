/**
 * error-taxonomy.js — taxonomia de CLASSES de erro para eliciação dos simuladores.
 *
 * 2026-07-19 (EMENDA EXPLORATÓRIA — o pré-registro tem precedente de emenda):
 * a campanha de validação 2026-07-19 (n=72) mediu completude conceitual travada
 * em ~0.54 e a mineração das faltas não-mecânicas mostrou que o simulador de
 * alunos não CONCEBE classes clássicas de erro (inversão/recíproco de fração,
 * whole number bias, sinal). Este módulo semeia essas CLASSES como checklist de
 * eliciação nos prompts dos simuladores (3b de produção e robô do experimento).
 *
 * ANTI-LEAKAGE (científico) — leia antes de mexer:
 *  - As classes abaixo são formuladas a partir da LITERATURA de misconceptions
 *    (classes GERAIS por domínio), NÃO a partir do dataset do experimento. A
 *    mineração da campanha apenas CONFIRMOU a relevância das classes — nenhum
 *    número, resposta ou item do dataset aparece aqui.
 *  - A taxonomia semeia perguntas de eliciação — NUNCA respostas concretas. O
 *    simulador continua tendo que DERIVAR a wrongAnswer concreta sozinho;
 *    aterramento (buggyRule mecânica) e gates ficam intocados. Injetar exemplos
 *    com números literais do dataset = gaming, proibido (por isso os
 *    exemploGenerico usam APENAS placeholders {A}/{B}/... — o teste trava isso
 *    com regex).
 *  - SEM TETO: o checklist AMPLIA a eliciação, nunca restringe — o fecho do
 *    bloco declara explicitamente "checklist de partida, não um limite".
 *
 * Referências (por classe, ver campo id):
 *  - whole_number_bias: Ni & Zhou (2005), "Teaching and learning fraction and
 *    rational numbers: the origins and implications of whole number bias".
 *  - inversao_reciproco: Stafylidou & Vosniadou (2004); DeWolf & Vosniadou
 *    (2015) — inversão/recíproco e ordenação de frações por regras de inteiro.
 *  - gap_thinking_diferenca: Pearn & Stephens (2004) — comparar frações pela
 *    diferença numerador–denominador ("gap thinking").
 *  - sinal_negativo: Vlassis (2004) — dificuldades com a negatividade.
 *  - off_by_one_contagem / unidade_escala: Bright, Behr, Post & Wachsmuth
 *    (1988) — representação de frações na reta numérica (marcas × intervalos,
 *    leitura da escala/unidade).
 *  - ancora_referencia: Behr, Wachsmuth, Post & Lesh (1984) — frações de
 *    referência (benchmarks) na comparação/estimativa.
 *  - denominador_retido_soma_direta: Ashlock (2010), "Error Patterns in
 *    Computation" — soma direta de numeradores e denominadores.
 *  - inversao_operandos: Brown & Burton (1978) — buggy rules em aritmética
 *    (ex.: subtrair o menor do maior dígito a dígito).
 *  - multiplicacao_aumenta_divisao_diminui: Fischbein, Deri, Nello & Marino
 *    (1985) — modelos implícitos das operações.
 *  - ordem_por_atributo_errado: extensão do achado de Stafylidou & Vosniadou
 *    (2004) para sequências em geral — liga com o contrato diagnóstico de
 *    ordenação (buggyRule de reordenação por atributo).
 *  - palavra_chave_superficial: Hegarty, Mayer & Monk (1995) — estratégia de
 *    tradução literal/palavra-chave em problemas verbais.
 *
 * Módulo PURO: sem LLM, sem IO.
 */

/** Tags de contexto reconhecidas pelo filtro de aplicabilidade. */
export const TAXONOMY_TAGS = ["fracao", "numero", "sequencia", "texto", "qualquer"];

/**
 * Classes de erro. Cada classe:
 *  - id: kebab/snake estável (referenciado na docstring acima);
 *  - nome: rótulo curto PT-BR;
 *  - descricao: 1-2 frases GERAIS (sem números, sem itens de dataset);
 *  - perguntaEliciacao: pergunta socrática dirigida ao SIMULADOR ("o aluno
 *    poderia... ?") — elicia a classe sem dar resposta concreta;
 *  - aplicavel: tags de contexto (subset de TAXONOMY_TAGS); "qualquer" = sempre;
 *  - exemploGenerico: APENAS placeholders {A}/{B}/... — nunca números literais.
 */
export const ERROR_TAXONOMY = [
  {
    id: "whole_number_bias",
    nome: "Viés do número inteiro",
    descricao:
      "O aluno trata a fração como se fosse número inteiro e responde um inteiro isolado: o numerador sozinho, o denominador sozinho, ou a contagem de partes/marcas.",
    perguntaEliciacao:
      // 2026-07-19 (campanha da taxonomia): a classe ELICIAVA mas as faltas de
      // whole number bias PIORARAM (38→52) — o simulador concebia o erro e o
      // materializava como fração/outro formato, enquanto a resposta que o
      // aluno digitaria é o INTEIRO NU. Materialização explícita na pergunta.
      "Em cada passo que pede uma fração, o aluno poderia responder um número INTEIRO — o numerador sozinho, o denominador sozinho, ou a contagem de partes/marcas que ele vê? Se sim, qual é esse INTEIRO NU exatamente como ele digitaria (só o número, sem barra, sem denominador — nunca reescrito como fração)?",
    aplicavel: ["fracao"],
    exemploGenerico: "responder {A} (ou {B}) onde a resposta correta é a fração {A}/{B}",
  },
  {
    id: "inversao_reciproco",
    nome: "Inversão/recíproco da fração",
    descricao:
      "O aluno troca numerador e denominador de lugar, produzindo o recíproco da fração pedida ou de uma fração intermediária do cálculo.",
    perguntaEliciacao:
      "O aluno poderia trocar numerador e denominador de lugar — responder o RECÍPROCO da fração correta (ou inverter uma fração no meio do procedimento)?",
    aplicavel: ["fracao"],
    exemploGenerico: "responder {B}/{A} onde a resposta correta é {A}/{B}",
  },
  {
    id: "gap_thinking_diferenca",
    nome: "Comparação pela diferença (gap thinking)",
    descricao:
      "O aluno compara ou iguala frações pela diferença entre numerador e denominador, em vez do valor relativo (razão).",
    perguntaEliciacao:
      "Ao comparar ou posicionar frações, o aluno poderia julgá-las pela DIFERENÇA entre numerador e denominador (quanto falta para o inteiro) em vez do valor relativo?",
    aplicavel: ["fracao"],
    exemploGenerico:
      "julgar {A}/{B} equivalente a {C}/{D} porque a diferença {B}-{A} é igual à diferença {D}-{C}",
  },
  {
    id: "sinal_negativo",
    nome: "Erro de sinal/negativo",
    descricao:
      "O aluno perde ou troca o sinal: responde o simétrico do valor correto, ou posiciona o ponto do lado errado do zero.",
    perguntaEliciacao:
      "O aluno poderia perder ou trocar o sinal — responder o valor do lado ERRADO do zero, ou soltar o sinal negativo no meio do cálculo?",
    aplicavel: ["numero"],
    exemploGenerico: "responder {A} onde a correta é -{A}, ou marcar -{A} no ponto de {A} na reta",
  },
  {
    id: "off_by_one_contagem",
    nome: "Erro de um a mais/a menos na contagem",
    descricao:
      "O aluno conta marcas em vez de intervalos (ou vice-versa), ou começa a contagem do ponto errado, terminando um a mais ou um a menos.",
    perguntaEliciacao:
      "Ao contar marcas, intervalos ou posições, o aluno poderia terminar UM a mais ou UM a menos — por contar as marcas em vez dos intervalos, ou por começar do ponto errado?",
    aplicavel: ["numero", "fracao", "sequencia"],
    exemploGenerico:
      "responder o vizinho imediato da posição correta (uma marca antes ou depois de {A})",
  },
  {
    id: "ancora_referencia",
    nome: "Âncora em fração de referência",
    descricao:
      "O aluno arredonda para uma fração de referência familiar (como a metade) e responde a referência em vez do valor pedido.",
    perguntaEliciacao:
      "O aluno poderia confundir o valor pedido com uma fração de REFERÊNCIA familiar (como a metade ou o inteiro) e responder a referência, ou posicionar o ponto nela?",
    aplicavel: ["fracao", "numero"],
    exemploGenerico: "responder a referência {R} (ex.: a metade) em vez do valor exato {A}/{B}",
  },
  {
    id: "denominador_retido_soma_direta",
    nome: "Soma direta de numeradores e denominadores",
    descricao:
      "Ao operar frações, o aluno soma (ou subtrai) numeradores e denominadores separadamente, ou retém o denominador de uma das parcelas sem converter.",
    perguntaEliciacao:
      "Ao somar ou subtrair frações, o aluno poderia operar numeradores e denominadores SEPARADAMENTE, ou reter o denominador de uma das parcelas sem achar o comum?",
    aplicavel: ["fracao"],
    exemploGenerico: "responder ({A_num}+{B_num})/({A_den}+{B_den}) na soma de {A} com {B}",
  },
  {
    id: "inversao_operandos",
    nome: "Inversão de operandos",
    descricao:
      "O aluno aplica a operação com os operandos trocados — por exemplo, subtrai o maior do menor (ou o menor do maior) invertendo o que o enunciado pede.",
    perguntaEliciacao:
      "O aluno poderia aplicar a operação com os operandos TROCADOS — calcular na ordem inversa da pedida (ex.: sempre subtrair o menor do maior)?",
    aplicavel: ["numero", "fracao"],
    exemploGenerico: "calcular {B}-{A} (ou {B}/{A}) onde o pedido era {A}-{B} (ou {A}/{B})",
  },
  {
    id: "unidade_escala",
    nome: "Leitura errada da unidade/escala",
    descricao:
      "O aluno lê o intervalo da reta ou da escala com o valor errado — assume que cada intervalo vale uma unidade quando vale outra fração da unidade (ou vice-versa).",
    perguntaEliciacao:
      "O aluno poderia ler cada intervalo da reta/escala com o valor ERRADO — tratar cada marca como uma unidade inteira quando cada intervalo vale outra fração da unidade, ou confundir qual segmento é o inteiro?",
    aplicavel: ["numero", "fracao"],
    exemploGenerico: "marcar a posição de {A} intervalos quando cada intervalo vale {U}, não um",
  },
  {
    id: "multiplicacao_aumenta_divisao_diminui",
    nome: "Multiplicar sempre aumenta, dividir sempre diminui",
    descricao:
      "O aluno assume que multiplicar sempre aumenta e dividir sempre diminui, e rejeita ou corrige resultados corretos que contradizem esse modelo implícito.",
    perguntaEliciacao:
      "O aluno poderia assumir que multiplicar SEMPRE aumenta e dividir SEMPRE diminui — e distorcer o resultado (ou escolher a operação errada) para obedecer a essa intuição?",
    aplicavel: ["numero", "fracao"],
    exemploGenerico:
      "trocar o resultado de {A}×{F} (com {F} menor que um) por um valor maior que {A}",
  },
  {
    id: "ordem_por_atributo_errado",
    nome: "Ordenação pelo atributo errado",
    descricao:
      "Em passos de ordenação/sequência, o aluno ordena por um atributo saliente diferente do critério pedido, produzindo uma sequência completa mas errada.",
    perguntaEliciacao:
      "Em passos de ordenação ou sequência, o aluno poderia ordenar por um atributo saliente DIFERENTE do critério pedido (tamanho em vez de distância, aparência em vez de valor) — e qual sequência completa resultaria?",
    aplicavel: ["sequencia", "texto"],
    exemploGenerico:
      "ordenar os itens por {X} em vez de {Y}, produzindo a sequência completa resultante",
  },
  {
    id: "palavra_chave_superficial",
    nome: "Palavra-chave superficial",
    descricao:
      "O aluno escolhe a operação ou a resposta por uma palavra-chave do enunciado, sem modelar a relação descrita (tradução literal do texto).",
    perguntaEliciacao:
      "O aluno poderia decidir a operação (ou a resposta) por uma PALAVRA-CHAVE do enunciado, ignorando a relação que o texto realmente descreve?",
    aplicavel: ["texto", "qualquer"],
    exemploGenerico:
      "escolher a operação sugerida pela palavra {P} do enunciado, contrária à relação descrita",
  },
];

/**
 * Monta o bloco de checklist PT-BR pronto para prompt, filtrado por contexto.
 *
 * Uma classe entra se tiver a tag "qualquer" OU se alguma de suas tags estiver
 * em contextTags. O fecho anti-teto é OBRIGATÓRIO e inseparável do bloco: o
 * checklist amplia a eliciação, nunca a restringe.
 *
 * @param {{contextTags?: string[]}} opts
 * @returns {string}
 */
export function taxonomyChecklistBlock({ contextTags } = {}) {
  const tags = new Set(
    Array.isArray(contextTags) && contextTags.length > 0 ? contextTags : ["qualquer"]
  );
  const aplicaveis = ERROR_TAXONOMY.filter(
    (cls) => cls.aplicavel.includes("qualquer") || cls.aplicavel.some((tag) => tags.has(tag))
  );
  return [
    "CHECKLIST DE CLASSES DE ERRO (misconceptions clássicas da literatura — ao listar os erros de cada passo, PERCORRA todas as classes abaixo e pergunte-se cada pergunta):",
    ...aplicaveis.map((cls) => `- ${cls.nome}: ${cls.perguntaEliciacao}`),
    // 2026-07-19 (campanha da taxonomia): regra geral de materialização — o
    // ganho da classe de inversão (faltas 42→10) veio de wrongAnswers no
    // formato natural; as perdas vieram de formato trocado.
    "MATERIALIZAÇÃO: cada erro vira a wrongAnswer EXATAMENTE no formato que o aluno digitaria/clicaria naquele passo (inteiro nu se ele digitaria um inteiro; fração se fração; a sequência completa se ordenação) — nunca convertida para outro formato.",
    "Estas classes são um CHECKLIST DE PARTIDA, não um limite — inclua também erros fora delas.",
  ].join("\n");
}
