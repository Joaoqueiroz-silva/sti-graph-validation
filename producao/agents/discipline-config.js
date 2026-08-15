/**
 * discipline-config.js — Configuracao discipline-aware do pipeline V9
 *
 * Centraliza tudo que muda por area didatica:
 * - Deteccao de area
 * - Exemplos de KCs e lista negra
 * - Pool de emojis
 * - Formato de ilustracao
 * - Cenarios narrativos
 * - Exemplo CTAT discipline-aware
 * - Quality tier dinamico para gpt-image-1
 *
 * Usado por: pipeline-v8.js (Agent 0, Agent 1, Agent 6, Agent 6d)
 */

// ============================================================
// DETECTION
// ============================================================
export function detectDisciplineArea(discipline) {
  const d = (discipline || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (/matem|calcul|aritm|geom|alge|trigon/.test(d)) return "matematica";
  if (/fisic|astron/.test(d)) return "fisica";
  if (/quimic/.test(d)) return "quimica";
  if (/biolog|ciencia.*nat|ciencias$|botanic|zoolog|ecolog|anatom/.test(d)) return "ciencias";
  if (/histor/.test(d)) return "historia";
  if (/geograf/.test(d)) return "geografia";
  if (/portugu|gramatic|literatur|redac/.test(d)) return "portugues";
  if (/ingles|espanhol|frances|lingua.*estran/.test(d)) return "linguas";
  if (/arte|musica|teatro|danca/.test(d)) return "artes";
  if (/filosof|sociol/.test(d)) return "filosofia";
  if (/educacao.*fisic|esporte/.test(d)) return "ed_fisica";
  return "geral";
}

/**
 * 2026-04-27: detecta disciplina a partir do NOME DO ARQUIVO (heur\u00edstica).
 * Usado quando o user faz upload sem selecionar disciplina expl\u00edcita \u2014
 * em vez de cair no default 'matematica' (bug), tentamos inferir do filename
 * (ex: "Moderna-Plus-Fisica-Tecnologia.pdf" \u2192 "fisica").
 *
 * Retorna { area, label } ou null se nao bater nada.
 *   - area: chave can\u00f4nica usada internamente (matematica/fisica/etc)
 *   - label: r\u00f3tulo leg\u00edvel pra exibir (Matem\u00e1tica/F\u00edsica/etc)
 */
export function detectDisciplineFromFilename(filename) {
  if (!filename) return null;
  const f = String(filename)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  // Padr\u00f5es ordenados por especificidade (mais espec\u00edfico primeiro pra evitar
  // falsos positivos \u2014 ex: "fisico-quimica" deve bater quimica antes de fisica)
  const patterns = [
    { rx: /\b(quim|chemistry|chimie|quimic)\b/, area: "quimica", label: "Qu\u00edmica" },
    { rx: /\b(biolog|biology|biologie)\b/, area: "ciencias", label: "Biologia" },
    { rx: /\b(fisic|physics|physique|physik)\b/, area: "fisica", label: "F\u00edsica" },
    {
      rx: /\b(matem|math|mathematic|aritmet|geometr|algebr|esmate|calcul)\b/,
      area: "matematica",
      label: "Matem\u00e1tica",
    },
    { rx: /\b(histor|history|historia|histoire)\b/, area: "historia", label: "Hist\u00f3ria" },
    { rx: /\b(geograf|geography|geographie)\b/, area: "geografia", label: "Geografia" },
    {
      rx: /\b(portugu|gramatic|literatur|redac|lingua.portuguesa)\b/,
      area: "portugues",
      label: "L\u00edngua Portuguesa",
    },
    { rx: /\b(ingles|english|inglesa)\b/, area: "linguas", label: "Ingl\u00eas" },
    { rx: /\b(espanhol|espanol|spanish)\b/, area: "linguas", label: "Espanhol" },
    { rx: /\b(frances|french|francais)\b/, area: "linguas", label: "Franc\u00eas" },
    { rx: /\b(arte|music|teatro|danca|dance|art)\b/, area: "artes", label: "Artes" },
    { rx: /\b(filosof|philosophy|sociolog)\b/, area: "filosofia", label: "Filosofia" },
    {
      rx: /\b(educacao.fisic|esporte|sport|gym)\b/,
      area: "ed_fisica",
      label: "Educa\u00e7\u00e3o F\u00edsica",
    },
    { rx: /\b(ciencias|science|sciences)\b/, area: "ciencias", label: "Ci\u00eancias" },
  ];

  for (const p of patterns) {
    if (p.rx.test(f)) return { area: p.area, label: p.label };
  }
  return null;
}

// ============================================================
// KC EXAMPLES BY AREA (Agent 1)
// ============================================================
export const KC_EXAMPLES_BY_AREA = {
  matematica: `EXEMPLO para "Soma com reagrupamento" (repare como o bloomLevel SOBE):
  * kc_soma_unidades [apply]: "Somar os digitos da coluna das unidades"
  * kc_detectar_vai_um [understand]: "Identificar quando a soma excede 9 e precisa de reagrupamento"
  * kc_soma_dezenas_com_vai_um [apply]: "Somar digitos das dezenas incluindo o vai-um"
  * kc_compor_resultado [analyze]: "Combinar os resultados parciais no numero final"
EXEMPLO para "Equacoes do 1o grau":
  * kc_recordar_operacao_inversa [remember]: "Recordar qual operacao desfaz soma, subtracao, produto"
  * kc_isolar_termo_x [apply]: "Mover termos com x para um lado da igualdade"
  * kc_simplificar_termos_semelhantes [apply]: "Combinar coeficientes do mesmo tipo"
  * kc_dividir_pelo_coeficiente [apply]: "Dividir ambos lados pelo coeficiente de x"
  * kc_verificar_solucao [evaluate]: "Substituir a raiz encontrada e julgar se a igualdade se sustenta"`,
  fisica: `EXEMPLO para "Movimento Uniformemente Variado (MUV)" (repare como o bloomLevel SOBE):
  * kc_identificar_grandezas_dadas [understand]: "Listar as grandezas conhecidas (v0, a, t) no enunciado"
  * kc_escolher_equacao_horaria [analyze]: "Escolher entre S=S0+v0t+at2/2 e v=v0+at conforme variaveis dadas"
  * kc_substituir_unidades_si [apply]: "Converter unidades para SI antes de substituir"
  * kc_calcular_resultado_numerico [apply]: "Executar a operacao algebrica com os valores"
  * kc_interpretar_sinal_resultado [evaluate]: "Interpretar sinal positivo/negativo da resposta no contexto"`,
  quimica: `EXEMPLO para "Balanceamento de equacao quimica" (repare como o bloomLevel SOBE):
  * kc_recordar_simbolo_elemento [remember]: "Recuperar o simbolo do elemento a partir do nome"
  * kc_listar_atomos_reagentes [apply]: "Contar atomos de cada elemento no lado dos reagentes"
  * kc_listar_atomos_produtos [apply]: "Contar atomos de cada elemento no lado dos produtos"
  * kc_ajustar_coeficientes [analyze]: "Aplicar coeficientes inteiros ate igualar contagens"
  * kc_verificar_balanceamento [evaluate]: "Recontar atomos e julgar se a equacao esta balanceada"`,
  ciencias: `EXEMPLO para "Cadeia alimentar" (repare como o bloomLevel SOBE):
  * kc_classificar_produtor [understand]: "Identificar organismo que produz seu proprio alimento"
  * kc_classificar_consumidor_primario [understand]: "Identificar herbivoros que comem produtores"
  * kc_classificar_consumidor_secundario [apply]: "Identificar carnivoros que comem consumidores primarios"
  * kc_ordenar_fluxo_energia [analyze]: "Ordenar organismos do produtor ao consumidor de topo"
EXEMPLO para "Sistema solar":
  * kc_recordar_nome_planetas [remember]: "Recuperar os nomes dos planetas do Sistema Solar"
  * kc_ordenar_planetas_distancia [apply]: "Ordenar planetas conforme distancia ao Sol"
  * kc_distinguir_rochoso_gasoso [understand]: "Classificar planeta como rochoso ou gasoso"
  * kc_associar_caracteristica_planeta [analyze]: "Associar caracteristica unica ao planeta correto"`,
  historia: `EXEMPLO para "Brasil Colonia" (repare como o bloomLevel SOBE):
  * kc_localizar_evento_no_seculo [remember]: "Posicionar um evento no seculo correto"
  * kc_identificar_causa_evento [analyze]: "Identificar a causa de um evento historico especifico"
  * kc_identificar_consequencia_evento [analyze]: "Identificar a consequencia de um evento"
  * kc_distinguir_atores_historicos [understand]: "Diferenciar grupos sociais envolvidos no evento"
  * kc_relacionar_evento_contexto [evaluate]: "Julgar qual fator economico/politico melhor explica o evento"`,
  geografia: `EXEMPLO para "Relevo brasileiro" (repare como o bloomLevel SOBE):
  * kc_identificar_tipo_relevo [understand]: "Identificar planalto, planicie ou depressao por descricao"
  * kc_localizar_no_mapa [apply]: "Localizar formacao geografica no mapa do Brasil"
  * kc_relacionar_relevo_clima [analyze]: "Relacionar tipo de relevo a caracteristicas climaticas"
  * kc_distinguir_bacias_hidrograficas [analyze]: "Distinguir bacias hidrograficas pelos rios principais"`,
  portugues: `EXEMPLO para "Concordancia verbal" (repare como o bloomLevel SOBE):
  * kc_identificar_sujeito [understand]: "Localizar o sujeito da oracao"
  * kc_identificar_nucleo_sujeito [analyze]: "Identificar o nucleo do sujeito (ignorar adjuntos)"
  * kc_classificar_numero_pessoa [understand]: "Determinar numero (sing/plu) e pessoa do nucleo"
  * kc_flexionar_verbo [apply]: "Flexionar o verbo concordando com numero/pessoa"
EXEMPLO para "Interpretacao textual":
  * kc_localizar_informacao_explicita [apply]: "Encontrar informacao explicita no texto"
  * kc_inferir_informacao_implicita [analyze]: "Deduzir informacao nao dita diretamente"
  * kc_identificar_ideia_central [evaluate]: "Julgar qual enunciado resume melhor a ideia principal"`,
  linguas: `EXEMPLO para "Past Simple (ingles)" (repare como o bloomLevel SOBE):
  * kc_recordar_forma_irregular [remember]: "Recordar forma de passado para verbos irregulares"
  * kc_classificar_verbo_regular [understand]: "Classificar verbo como regular ou irregular"
  * kc_aplicar_regra_ed [apply]: "Aplicar regra de adicao de -ed para regulares"
  * kc_escolher_forma_no_contexto [analyze]: "Escolher a forma correta conforme o marcador temporal da frase"`,
  artes: `EXEMPLO para "Cores primarias e secundarias" (repare como o bloomLevel SOBE):
  * kc_identificar_primaria [remember]: "Recuperar quais sao as tres cores primarias"
  * kc_distinguir_quente_fria [understand]: "Classificar cor como quente ou fria"
  * kc_combinar_para_secundaria [apply]: "Combinar duas primarias para produzir secundaria"
  * kc_justificar_escolha_paleta [evaluate]: "Julgar qual paleta transmite melhor a sensacao pedida"`,
  filosofia: `EXEMPLO para "Tipos de argumento" (repare como o bloomLevel SOBE):
  * kc_distinguir_premissa_conclusao [understand]: "Identificar premissas e conclusao em um argumento"
  * kc_classificar_dedutivo_indutivo [apply]: "Classificar argumento como dedutivo ou indutivo"
  * kc_identificar_falacia [analyze]: "Identificar falacia logica em um argumento dado"
  * kc_avaliar_solidez_argumento [evaluate]: "Julgar se as premissas sustentam a conclusao"`,
  ed_fisica: `EXEMPLO para "Regras de basquete" (repare como o bloomLevel SOBE):
  * kc_identificar_falta [understand]: "Identificar tipo de falta (pessoal, tecnica, antidesportiva)"
  * kc_calcular_pontuacao_lance [apply]: "Calcular pontos por tipo de arremesso (1, 2, 3)"
  * kc_aplicar_regra_passos [analyze]: "Identificar violacao de passos (traveling) numa jogada descrita"`,
  geral: `EXEMPLO de KCs procedurais validos (repare como o bloomLevel SOBE):
  * kc_recuperar_termo_dominio [remember]: "Recuperar da memoria o termo tecnico correspondente"
  * kc_classificar_em_categoria [understand]: "Classificar elemento em uma categoria conhecida"
  * kc_aplicar_regra [apply]: "Aplicar uma regra do dominio a um caso novo"
  * kc_relacionar_causa_efeito [analyze]: "Identificar relacao causal entre dois elementos"
  * kc_julgar_melhor_opcao [evaluate]: "Escolher entre alternativas justificando pelo criterio do dominio"`,
};

export const KC_BLACKLIST_BY_AREA = {
  matematica: `  * kc_identificar_numeros: PROIBIDO. So leitura, zero cognicao
  * kc_determinar_operacao: PROIBIDO. Trivial quando topico ja diz operacao
  * kc_armar_operacao: PROIBIDO. So escrever "A + B" nao e cognicao
  * kc_alinhar_parcelas: PROIBIDO. Trivial`,
  fisica: `  * kc_identificar_dados: PROIBIDO. So leitura
  * kc_escrever_formula: PROIBIDO. So escolher entre 3 formulas e trivial sozinho — combinar com substituicao no mesmo KC`,
  quimica: `  * kc_escrever_formula: PROIBIDO. So copiar do livro
  * kc_nomear_elemento: PROIBIDO se topico nao for tabela periodica`,
  ciencias: `  * kc_definir_conceito: PROIBIDO. So memorizacao, nao e habilidade
  * kc_listar_partes: PROIBIDO. Memorizacao pura`,
  historia: `  * kc_memorizar_data: PROIBIDO. Datas isoladas nao sao habilidade
  * kc_listar_personagens: PROIBIDO. Memorizacao
  * kc_definir_termo_historico: PROIBIDO. So memoria`,
  geografia: `  * kc_memorizar_capital: PROIBIDO se topico nao for capitais
  * kc_listar_paises: PROIBIDO`,
  portugues: `  * kc_definir_classe_gramatical: PROIBIDO se nao envolver aplicacao
  * kc_memorizar_regra: PROIBIDO. So memoria`,
  linguas: `  * kc_traduzir_palavra: PROIBIDO se topico nao for vocabulario isolado
  * kc_memorizar_lista: PROIBIDO`,
  artes: `  * kc_nomear_artista: PROIBIDO se nao envolver analise
  * kc_definir_estilo: PROIBIDO sozinho`,
  filosofia: `  * kc_citar_filosofo: PROIBIDO. Memorizacao
  * kc_definir_corrente: PROIBIDO sozinho`,
  ed_fisica: `  * kc_listar_regras: PROIBIDO. Aplicacao de regra > listar regra`,
  geral: `  * kc_memorizar_x: PROIBIDO. Memorizacao nao e habilidade procedural
  * kc_definir_x: PROIBIDO sozinho — definir + aplicar pode virar 2 KCs`,
};

// ============================================================
// EMOJI BANK
// ============================================================
export const EMOJI_BANK = {
  fruits: ["🍎", "🍌", "🍊", "🍇", "🍓", "🍒"],
  animals: ["🐱", "🐶", "🐟", "🦋", "🐸", "🐰", "🐧", "🐢", "🦁", "🐘", "🦒"],
  toys: ["🎈", "🎾", "🧸", "🚗", "🎲", "🪀"],
  nature: ["🌻", "🌳", "🍃", "🌈", "☀️", "🌙", "⭐", "🌊", "🔥", "❄️"],
  body: ["🧠", "❤️", "🫁", "🦴", "👁️", "👃", "👂", "🦷"],
  space: ["🌍", "🌑", "☄️", "🪐", "🌠", "🌞"],
  lab: ["🧪", "🔬", "🧬", "⚗️", "🌡️"],
  geo: ["🏔️", "🌋", "🏝️", "🏜️", "🏞️", "🗺️"],
  hist: ["🏛️", "⚔️", "👑", "🏺", "📜", "⏳"],
  arts: ["🎨", "🖌️", "🎭", "🎵", "🎸", "🎹"],
  school: ["📚", "✏️", "📐", "📏", "🎒", "🖊️"],
};

export function emojiPoolForDiscipline(area) {
  switch (area) {
    case "ciencias":
      return [
        ...EMOJI_BANK.nature,
        ...EMOJI_BANK.animals,
        ...EMOJI_BANK.body,
        ...EMOJI_BANK.space,
        ...EMOJI_BANK.lab,
      ];
    case "geografia":
      return [...EMOJI_BANK.geo, ...EMOJI_BANK.nature];
    case "historia":
      return [...EMOJI_BANK.hist];
    case "artes":
      return [...EMOJI_BANK.arts];
    case "matematica":
    case "fisica":
    case "quimica":
      return [...EMOJI_BANK.fruits, ...EMOJI_BANK.animals, ...EMOJI_BANK.toys, ...EMOJI_BANK.lab];
    default:
      return [
        ...EMOJI_BANK.fruits,
        ...EMOJI_BANK.animals,
        ...EMOJI_BANK.toys,
        ...EMOJI_BANK.school,
      ];
  }
}

// ============================================================
// ILLUSTRATION FORMAT
// ============================================================
export function illustrationFormatForDiscipline(area, profile) {
  const isYoung = profile === "pre_literate" || profile === "early_reader";
  if (!isYoung) return "abstract";
  switch (area) {
    case "matematica":
    case "fisica":
    case "quimica":
      return "equation_visual";
    case "ciencias":
      return "labeled_diagram";
    case "geografia":
      return "map_pin";
    case "historia":
      return "timeline_card";
    case "artes":
      return "image_compare";
    case "portugues":
    case "linguas":
      return "word_card";
    default:
      return "concept_card";
  }
}

// ============================================================
// CTAT EXAMPLE BY AREA (Agent 6 system prompt)
// ============================================================
export function ctatExampleForArea(area) {
  switch (area) {
    case "matematica":
      return `   Exemplo "47 + 38" (soma com reagrupamento):
   - Step 1: "Some os digitos das unidades: 7 + 8 = ?" -> ea="15", kc="kc_soma_unidades"
   - Step 2: "O resultado e 15. Qual digito fica nas unidades da resposta?" -> ea="5", kc="kc_valor_posicional"
   - Step 3: "Quanto vai para as dezenas?" -> ea="1", kc="kc_detectar_vai_um"
   - Step 4: "Some as dezenas com o vai-um: 4 + 3 + 1 = ?" -> ea="8", kc="kc_soma_com_vai_um"
   - Step 5: "Qual e o resultado final de 47 + 38?" -> ea="85", kc="kc_compor_resultado"`;

    case "fisica":
      return `   Exemplo "Carro a 20 m/s, freia com a=-4 m/s2, quanto demora para parar?":
   - Step 1: "Quais grandezas o enunciado da?" -> ea="v0=20, a=-4, v=0", kc="kc_identificar_grandezas_dadas"
   - Step 2: "Qual equacao usar quando temos v0, a e v?" -> ea="v=v0+at", kc="kc_escolher_equacao_horaria"
   - Step 3: "Substituindo: 0 = 20 + (-4)*t. Quanto vale t?" -> ea="5", kc="kc_calcular_resultado_numerico"
   - Step 4: "Em qual unidade?" -> ea="segundos", kc="kc_interpretar_unidade"`;

    case "quimica":
      return `   Exemplo "Balancear H2 + O2 -> H2O":
   - Step 1: "Quantos H ha nos reagentes?" -> ea="2", kc="kc_listar_atomos_reagentes"
   - Step 2: "Quantos H ha nos produtos (com 1 H2O)?" -> ea="2", kc="kc_listar_atomos_produtos"
   - Step 3: "Quantos O ha nos reagentes (com 1 O2)?" -> ea="2", kc="kc_listar_atomos_reagentes"
   - Step 4: "Para balancear o O, qual coeficiente colocar antes de H2O?" -> ea="2", kc="kc_ajustar_coeficientes"
   - Step 5: "Agora rebalance o H ajustando H2. Qual o coeficiente?" -> ea="2", kc="kc_ajustar_coeficientes"`;

    case "ciencias":
      return `   Exemplo "Cadeia alimentar: capim, gafanhoto, sapo, cobra":
   - Step 1: "Qual organismo produz seu proprio alimento?" -> ea="capim", kc="kc_classificar_produtor"
   - Step 2: "Qual animal come o produtor diretamente?" -> ea="gafanhoto", kc="kc_classificar_consumidor_primario"
   - Step 3: "Qual animal come o gafanhoto?" -> ea="sapo", kc="kc_classificar_consumidor_secundario"
   - Step 4: "Quem esta no topo da cadeia?" -> ea="cobra", kc="kc_classificar_consumidor_terciario"`;

    case "historia":
      return `   Exemplo "Independencia do Brasil (1822)":
   - Step 1: "Em qual seculo ocorreu a Independencia do Brasil?" -> ea="seculo XIX", kc="kc_localizar_evento_no_seculo"
   - Step 2: "Qual fato pressionou D. Pedro a declarar independencia?" -> ea="cortes portuguesas", kc="kc_identificar_causa_evento"
   - Step 3: "Quem proclamou a independencia?" -> ea="Dom Pedro I", kc="kc_distinguir_atores_historicos"
   - Step 4: "O que aconteceu logo apos a proclamacao?" -> ea="formacao do Imperio", kc="kc_identificar_consequencia_evento"`;

    case "geografia":
      return `   Exemplo "Relevo do Nordeste":
   - Step 1: "Qual tipo de relevo predomina no sertao nordestino?" -> ea="depressao sertaneja", kc="kc_identificar_tipo_relevo"
   - Step 2: "Em qual regiao do Brasil esta?" -> ea="Nordeste", kc="kc_localizar_no_mapa"
   - Step 3: "Que clima esta associado a essa formacao?" -> ea="semiarido", kc="kc_relacionar_relevo_clima"
   - Step 4: "Qual o principal rio dessa regiao?" -> ea="Sao Francisco", kc="kc_distinguir_bacias_hidrograficas"`;

    case "portugues":
      return `   Exemplo "Concordancia em 'Os meninos correm no parque'":
   - Step 1: "Qual e o sujeito da oracao?" -> ea="os meninos", kc="kc_identificar_sujeito"
   - Step 2: "Qual o nucleo do sujeito?" -> ea="meninos", kc="kc_identificar_nucleo_sujeito"
   - Step 3: "Em qual numero esta o nucleo?" -> ea="plural", kc="kc_classificar_numero_pessoa"
   - Step 4: "Como o verbo 'correr' deve ficar no presente, 3a pessoa do plural?" -> ea="correm", kc="kc_flexionar_verbo"`;

    case "linguas":
      return `   Exemplo "Past simple de 'go'":
   - Step 1: "O verbo 'go' e regular ou irregular?" -> ea="irregular", kc="kc_classificar_verbo_regular"
   - Step 2: "Qual a forma de passado de 'go'?" -> ea="went", kc="kc_recordar_forma_irregular"
   - Step 3: "Como fica 'She ___ to school yesterday'?" -> ea="went", kc="kc_aplicar_forma_no_contexto"`;

    case "artes":
      return `   Exemplo "Misturando cores":
   - Step 1: "O vermelho e uma cor primaria?" -> ea="sim", kc="kc_identificar_primaria"
   - Step 2: "Vermelho misturado com amarelo da qual cor?" -> ea="laranja", kc="kc_combinar_para_secundaria"
   - Step 3: "Laranja e uma cor quente ou fria?" -> ea="quente", kc="kc_distinguir_quente_fria"`;

    case "filosofia":
      return `   Exemplo "Argumento dedutivo":
   - Step 1: "Quantas premissas tem 'Todo homem e mortal; Socrates e homem; logo Socrates e mortal'?" -> ea="2", kc="kc_distinguir_premissa_conclusao"
   - Step 2: "Esse argumento e dedutivo ou indutivo?" -> ea="dedutivo", kc="kc_classificar_dedutivo_indutivo"`;

    default:
      return `   Exemplo generico (adapte ao topico real):
   - Step 1: "Identifique a caracteristica X do conceito" -> resposta especifica, kc="kc_identificar_caracteristica"
   - Step 2: "Classifique o elemento Y" -> resposta especifica, kc="kc_classificar_em_categoria"
   - Step 3: "Aplique a regra Z ao caso novo" -> resposta especifica, kc="kc_aplicar_regra"`;
  }
}

// ============================================================
// INTERACTION TYPES BY AREA (Agent 6 prompt)
// ============================================================
export function interactionTypesForArea(area) {
  switch (area) {
    case "ciencias":
      return "identificacao, classificacao, causa-efeito, ordenacao de processos, associacao";
    case "historia":
      return "cronologia, causa-efeito, identificacao de atores, contextualizacao, comparacao de epocas";
    case "geografia":
      return "localizacao, classificacao de relevo/clima, causa-efeito, leitura de mapa";
    case "portugues":
      return "identificacao gramatical, interpretacao, classificacao, aplicacao de regra";
    case "linguas":
      return "traducao contextual, conjugacao, vocabulario aplicado, compreensao";
    case "artes":
      return "identificacao de estilo, classificacao de cor/forma, comparacao";
    case "filosofia":
      return "identificacao de argumento, classificacao logica, comparacao de correntes";
    default:
      return "identificacao, classificacao, aplicacao";
  }
}

// ============================================================
// CONTEXT SCENARIOS BY AREA
// ============================================================
export function contextScenariosForDiscipline(area) {
  switch (area) {
    case "ciencias":
      return ["laboratorio", "natureza", "horta", "zoologico", "praia"];
    case "geografia":
      return ["cidade", "campo", "montanha", "rio", "litoral"];
    case "historia":
      return ["museu", "vila colonial", "sitio arqueologico", "monumento"];
    case "artes":
      return ["atelie", "galeria", "palco", "estudio"];
    case "portugues":
    case "linguas":
      return ["sala de aula", "biblioteca", "casa", "parque"];
    case "matematica":
    case "fisica":
    case "quimica":
      return ["fazenda", "festa", "parque", "mercado", "escola"];
    default:
      return ["escola", "casa", "parque", "cidade"];
  }
}

// ============================================================
// QUALITY TIER FOR gpt-image-1 (Agent 6d)
// ============================================================
// V9.1: Quality tier dinamico para gpt-image-1.
// low ~$0.011, medium ~$0.042, high ~$0.167.
// Heuristica:
//   high: areas que dependem MUITO de detalhe visual fiel (anatomia, biologia, historia, artes)
//   low:  pre_literate (criancas) e areas onde imagem e simbolica/decorativa
//   medium: padrao (ciencias geral, geografia, linguas)
export function qualityTierForContext(area, profile) {
  // Forcar via env var: STI_IMAGE_QUALITY=low|medium|high
  if (process.env.STI_IMAGE_QUALITY) return process.env.STI_IMAGE_QUALITY;

  // Pre-literate: imagens grandes e simples — low e suficiente e mais barato
  if (profile === "pre_literate") return "low";

  // Areas que se beneficiam de alta fidelidade visual
  if (["biologia", "ciencias", "historia", "artes"].includes(area)) return "high";

  // Areas medias — geografia, linguas, filosofia
  if (["geografia", "linguas", "filosofia"].includes(area)) return "medium";

  // Default
  return "medium";
}
