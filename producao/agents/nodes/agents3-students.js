/**
 * agents3-students.js - Student Simulators (Agents 3a/3b/3c).
 * Extraido de pipeline-v8.js em 2026-04-22, preservado byte-a-byte.
 */

import { createLLM, callLLM, extractJson, getAgentConfig } from "../pipeline-core.js";
import { misconceptionsFor } from "../misconceptions-db.js";
// 2026-07-18 (diagnóstico autossuficiente): o 3b passa a emitir stepDiagnostics
// (buggy rules por passo, modelo CTAT) e a normalização vive no módulo puro
// compartilhado — entradas malformadas/genéricas são descartadas AQUI, para que
// o pipeline (que extrai o catálogo de atRiskTrace) nunca veja lixo.
import { normalizeStepDiagnostics } from "../diagnostics/step-error-catalog.js";
// 2026-07-19 (emenda exploratória — completude conceitual ~0.54 na campanha
// n=72): o 3b recebe um CHECKLIST de classes de erro da literatura para
// eliciação (perguntas socráticas, nunca respostas concretas — anti-leakage na
// docstring de error-taxonomy.js). O checklist AMPLIA a produção, nunca limita.
import { taxonomyChecklistBlock } from "../diagnostics/error-taxonomy.js";
import { logger } from "../../lib/logger.js";

export async function agent3a_advancedStudent(state) {
  const cfg = getAgentConfig("agent3a_advanced");
  logger.debug(
    { module: "agent3a", phase: "start", provider: cfg.provider, model: cfg.model },
    "Advanced Student"
  );
  const t0 = Date.now();
  const llm = createLLM(cfg);

  const seedProblems = JSON.stringify(state.seedProblems || [], null, 2);

  const systemPrompt = `Voce e um ALUNO AVANCADO simulado resolvendo problemas educacionais.
Voce e excepcional: resolve tudo CORRETAMENTE, sem erros, sem hesitacoes.

Seu papel e gerar a TRACE DE SOLUCAO IDEAL — o caminho perfeito que todo aluno deveria seguir.

Para CADA problema fornecido, gere uma trace detalhada mostrando:
1. Cada passo da resolucao com pensamento explicito
2. O Knowledge Component (KC) usado em cada passo
3. O resultado de cada passo
4. Tempo estimado (em segundos) para cada passo

REGRAS:
- NUNCA erre. Voce e o aluno ideal.
- Use as variaveis genericas ({A}, {B}, {C}) nos resultados — NAO substitua por numeros concretos
- Cada passo deve mapear para exatamente 1 KC
- A trace deve ser sequencial e completa (do inicio ao resultado final)

Retorne JSON puro:
{
  "studentProfile": "advanced",
  "solutions": [
    {
      "problemId": 1,
      "solutionTrace": [
        {
          "step": 1,
          "action": "Ler e interpretar o enunciado",
          "thinking": "Preciso identificar os valores {A} e {B} e a operacao",
          "result": "Valores identificados: {A} e {B}",
          "kcUsed": "kc_identificacao",
          "timeEstimate": 5,
          "isCorrect": true
        }
      ],
      "finalAnswer": "{A} + {B}",
      "totalTime": 15
    }
  ]
}`;

  const userMessage = `Disciplina: ${state.discipline} | Topico: ${state.topic} | Dificuldade: ${state.difficulty} | Idade: ${state.ageGroup || "?"}

=== PROBLEMAS PARA RESOLVER ===
${seedProblems}

=== KNOWLEDGE COMPONENTS DISPONIVEIS ===
${(state.knowledgeComponents || []).map((kc) => `- ${kc.id}: ${kc.name}`).join("\n")}

Resolva TODOS os problemas com perfeicao. Gere traces detalhadas.`;

  const raw = await callLLM(llm, systemPrompt, userMessage, {
    agent: "agent3a_advanced",
    sessionId: state.sessionId,
  });
  const parsed = extractJson(raw);

  logger.info({ module: "agent3a", phase: "done", elapsedMs: Date.now() - t0 }, "Advanced trace");
  return {
    advancedTrace: parsed,
    agentLogs: [
      {
        agent: "agent3a_advanced",
        provider: cfg.provider,
        model: cfg.model,
        solutions: parsed.solutions?.length || 0,
        elapsed: Date.now() - t0,
      },
    ],
  };
}

/**
 * 2026-07-19: deriva tags de contexto SIMPLES para o checklist de classes de
 * erro, a partir de discipline/topic. Disciplina chega ACENTUADA da UI
 * ("Matemática") — normaliza acento antes de comparar (CLAUDE.md gotcha 3).
 * Matemática/frações/números → classes numéricas; qualquer outro contexto →
 * guarda-chuva geral (qualquer + texto/sequência). Mantido propositalmente
 * simples: o filtro só decide QUAIS perguntas de eliciação entram no prompt.
 */
function taxonomyContextTags(state) {
  const contexto = `${state.discipline || ""} ${state.topic || ""}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const ehMatematica = /matematic|frac|numer|aritmetic|algebr|geometri/.test(contexto);
  // 2026-07-19 (verificação): matemática TAMBÉM ordena/pareia (comparar e
  // ordenar frações é o cenário canônico de Stafylidou & Vosniadou 2004) — sem
  // "sequencia" aqui, a classe de ordenação sumia do checklist de produção.
  return ehMatematica
    ? ["fracao", "numero", "sequencia", "qualquer"]
    : ["qualquer", "texto", "sequencia"];
}

// ============================================================
// AGENT 3b: At-Risk Student Simulator (NOVO PROMPT)
// Provider: MiniMax M2.7
// 2026-07-18: produção dirigida por cobertura (achado "cobertura específica 7%"):
// caiu o teto "2-3 tentativas"; além das attempts (compat), cada solution traz
// stepDiagnostics — TODOS os erros plausíveis POR PASSO, com buggyRule mecânica
// (modelo CTAT). Spec: docs/DIAGNOSTICO-AUTOSSUFICIENTE-2026-07-18.md §2.
// ============================================================
export async function agent3b_atRiskStudent(state) {
  const cfg = getAgentConfig("agent3b_atrisk");
  logger.debug(
    { module: "agent3b", phase: "start", provider: cfg.provider, model: cfg.model },
    "At-Risk Student"
  );
  const t0 = Date.now();
  const llm = createLLM(cfg);

  // 2026-08-09: a chave do catálogo é SEM acento; a disciplina chega acentuada
  // da UI. A normalização vive em misconceptions-db.js (ver misconceptionsFor).
  const knownMisconceptions = misconceptionsFor(state.discipline, state.ageGroup, {
    fallbackDiscipline: "matematica",
  });

  // 2026-07-19 (emenda exploratória): checklist de CLASSES de erro da literatura,
  // filtrado pelo contexto — só perguntas de eliciação; a wrongAnswer concreta
  // continua sendo derivada pelo proprio simulador (aterramento/gates intocados).
  const taxonomyBlock = taxonomyChecklistBlock({ contextTags: taxonomyContextTags(state) });

  // 2026-08-09 — EXPERIMENTO QUE NÃO DEU CERTO, registrado para ninguém repetir.
  //
  // A medição mostrou que este agente prevê 7,6% dos erros reais de aluno porque
  // deriva a resposta errada do GABARITO em vez dos DADOS (ver
  // agents/diagnostics/buggy-rules.js). A hipótese óbvia era corrigir isso no
  // prompt: entrou um bloco grande de REGRA FORTE, com os casos reais como ✅/❌,
  // a lista das origens mais frequentes e um teste obrigatório antes de escrever
  // cada wrongAnswer.
  //
  // Testado com 3 gerações reais por braço, MESMOS tópicos (adição com
  // reagrupamento, soma de frações, divisão com resto), medindo com
  // `groundedWrongAnswerPct`:
  //
  //     prompt antigo ....... 19/30 = 63,3%
  //     prompt com a regra .. 20/34 = 58,8%
  //
  // Não melhorou; por ponto estimado, piorou — e produziu MAIS respostas erradas
  // com fração menor de reconhecíveis, ou seja, mais volume e menos qualidade. A
  // amostra é pequena demais para condenar a ideia, e grande demais para
  // publicá-la como ganho. Sobrou só a dica curta abaixo e o exemplo corrigido
  // (o canônico ensinava `wrongAnswer: "{A} + 1"`, que é perturbação do gabarito
  // — esse era defeito real, independente do experimento).
  //
  // Quem for tentar de novo: use `scripts/medir-modelo-de-erro.mjs` e a métrica
  // `groundedWrongAnswerPct` do quality-gate, com braço de controle pareado por
  // tópico, e mais de 3 gerações por braço.

  const systemPrompt = `Voce e um ALUNO COM DIFICULDADES simulado resolvendo problemas educacionais.
Voce comete ERROS REALISTAS baseados em misconceptions educacionais documentadas.

Seu papel e gerar traces que mostrem COMO alunos reais erram, para que o sistema possa detectar e remediar esses erros.

PRODUCAO DIRIGIDA POR COBERTURA (SEM teto de quantidade):
Para CADA PASSO da solucao de CADA problema, liste TODOS os erros plausiveis e
DISTINTOS que um aluno real cometeria naquele passo — no MINIMO 2 por passo
quando existirem, SEM maximo. Crie quantos forem necessarios, como um
especialista CTAT criaria buggy paths. Erros DISTINTOS = causas diferentes
(nao o mesmo erro com numeros diferentes).

${taxonomyBlock}

RESPOSTA ERRADA VEM DOS DADOS DO PASSO, nao de mexer no gabarito. Casos reais
do EducaOFF: "quantas vezes o 4 cabe no 8?" (gabarito 2) -> aluno responde "8",
o dividendo; "quantos grupos?" com 4 caixas de 6 macas (gabarito 4) -> responde
"6", o outro operando. Prefira sempre uma resposta que voce consiga CALCULAR a
partir dos numeros do enunciado.

Voce produz DUAS coisas por problema:
1. "attempts": 2 ou mais tentativas completas com erros diferentes (formato abaixo, inalterado)
2. "stepDiagnostics": o catalogo COMPLETO de erros POR PASSO (novo bloco, cobertura total)

CADA ERRO deve ter:
- Um misconceptionId unico (ex: "misc_contagem_pular", "misc_inversao_operandos")
- Tipo: count_error | procedural_error | conceptual_error | off_by_one | operation_confusion | magnitude_error
- O que o aluno fez de errado (wrongAnswer com variaveis genericas)
- buggyRule (OBRIGATORIO em stepDiagnostics): receita MECANICA de como computar a
  resposta errada a partir dos dados do problema. Outra pessoa (ou um programa)
  deve conseguir CALCULAR o valor errado seguindo a receita, sem adivinhar.
  BOM: "somar numeradores e somar denominadores diretamente: {A_num}+{B_num} sobre {A_den}+{B_den}"
  RUIM: "o aluno se confunde com fracoes" (nao e computavel)
- Em passos de ORDENACAO/SEQUENCIA/PAREAMENTO, buggyRule de reordenacao e valida: "ordenar por X
  em vez de Y → sequencia resultante completa" (ex: "ordenar planetas por tamanho em vez de distancia
  ao Sol → terra,venus,marte,mercurio"). O wrongAnswer e a sequencia/associacao COMPLETA resultante.
- Severidade: low | moderate | high

REGRAS DE misconceptionId (OBRIGATORIAS — IDs invalidos sao DESCARTADOS pelo sistema):
- Deve casar a gramatica ^[A-Za-z0-9_.:-]+$ (letras, numeros, _ . : - ; SEM espacos, SEM acentos)
- Deve ser DESCRITIVO da causa do erro (ex: "misc_soma_denominadores_direto"), nunca vago ou numerado
- PROIBIDO comecar com os prefixos genericos reservados: misc_generic, misc_unclassified,
  misc_numeric_near, misc_text_confusion — eles NUNCA contam como diagnostico especifico
- LOCALIZACAO DO ERRO (mistakeLocation): ONDE exatamente no raciocinio o erro ocorreu.
  Exemplo: "Ao somar as unidades, o aluno esqueceu de reagrupar o vai-um para as dezenas"
  Exemplo: "O aluno confundiu o sinal de subtracao com adicao no segundo passo"
  NUNCA diga apenas "errou a conta". Aponte o PASSO EXATO e o CONCEITO EXATO onde o erro aconteceu.
- PERGUNTA DIAGNOSTICA (diagnosticQuestion): Uma pergunta que o tutor pode fazer para ajudar o aluno a IDENTIFICAR SEU PROPRIO ERRO sem revelar a resposta.
  Exemplo: "Quando voce somou 7+8, qual resultado obteve? Vamos conferir juntos?"
  Exemplo: "Voce lembrou de levar o vai-um para a proxima casa decimal?"
  A pergunta deve ser SOCRATICA — leva o aluno a pensar, nao da a resposta.
- Feedback corretivo ENCORAJADOR (feedback): Comece com reconhecimento positivo, depois guie.
  BOM: "Boa tentativa! Voce acertou a primeira parte. Vamos olhar com mais cuidado para o segundo passo..."
  RUIM: "Errado. A resposta correta e X."
  O feedback NUNCA revela a resposta final. Aponta ONDE o erro esta e guia o aluno.
- Como remediar (howToFix): Estrategia pratica e acionavel

${
  knownMisconceptions.length > 0
    ? `
MISCONCEPTIONS CONHECIDAS para esta faixa etaria (USE como referencia):
${JSON.stringify(knownMisconceptions, null, 2)}`
    : ""
}

Retorne JSON puro:
{
  "studentProfile": "at_risk",
  "solutions": [
    {
      "problemId": 1,
      "attempts": [
        {
          "attemptNumber": 1,
          "solutionTrace": [
            {
              "step": 1,
              "action": "Tentar contar os objetos",
              "thinking": "Vou contar... 1, 2, 3... acho que sao {A}+1",
              "result": "Resultado errado",
              "kcUsed": "kc_contagem",
              "isCorrect": false,
              "error": {
                "misconceptionId": "misc_responde_com_um_dos_grupos",
                "type": "conceptual_error",
                "wrongAnswer": "{B}",
                "description": "Aluno responde com a quantidade de UM dos grupos em vez do total",
                "mistakeLocation": "Ao juntar os dois grupos, o aluno parou no segundo grupo e nao contou o primeiro",
                "diagnosticQuestion": "Voce contou os dois grupos ou so um deles? Vamos apontar cada um.",
                "severity": "moderate",
                "feedback": "Boa tentativa! Voce contou um dos grupos direitinho. Agora falta juntar com o outro — aponte os dois enquanto conta.",
                "howToFix": "Usar material concreto e contar os dois grupos juntos, apontando cada objeto"
              }
            }
          ],
          "finalAnswer": "{B}",
          "wasCorrect": false
        }
      ],
      "stepDiagnostics": [
        {
          "problemId": 1,
          "step": 1,
          "kcUsed": "kc_soma_fracoes",
          "errors": [
            {
              "misconceptionId": "misc_soma_denominadores_direto",
              "type": "procedural_error",
              "wrongAnswerPattern": "({A_num}+{B_num})/({A_den}+{B_den})",
              "buggyRule": "Somar numeradores e somar denominadores diretamente: numerador = {A_num}+{B_num}; denominador = {A_den}+{B_den}",
              "description": "Aluno soma numeradores e denominadores como se fossem numeros independentes, sem achar denominador comum",
              "mistakeLocation": "Ao somar as fracoes, o aluno aplicou a soma em cima e embaixo separadamente",
              "diagnosticQuestion": "Se voce soma 1/2 + 1/2, o resultado deveria ser maior ou menor que 1/2? O que a sua conta deu?",
              "feedback": "Boa tentativa! Voce somou os numeros certos, mas fracoes so podem ser somadas quando os denominadores sao iguais. Vamos olhar os denominadores primeiro...",
              "howToFix": "Praticar equivalencia de fracoes antes de somar: reescrever ambas com o mesmo denominador",
              "severity": "high"
            },
            {
              "misconceptionId": "misc_mantem_denominador_maior",
              "type": "conceptual_error",
              "wrongAnswerPattern": "({A_num}+{B_num})/max({A_den},{B_den})",
              "buggyRule": "Somar os numeradores e manter o MAIOR denominador sem converter as fracoes: numerador = {A_num}+{B_num}; denominador = max({A_den},{B_den})",
              "description": "Aluno soma numeradores e escolhe o maior denominador, sem converter as fracoes para equivalentes",
              "mistakeLocation": "Na escolha do denominador do resultado, antes de somar os numeradores",
              "diagnosticQuestion": "As duas fracoes estao divididas em pedacos do mesmo tamanho? Podemos somar pedacos de tamanhos diferentes direto?",
              "feedback": "Voce ja percebeu que o denominador importa — otimo! Agora falta um passo: antes de somar, as duas fracoes precisam ter pedacos do MESMO tamanho.",
              "howToFix": "Mostrar com desenhos que 1/2 e 1/4 sao pedacos de tamanhos diferentes e nao podem ser somados direto",
              "severity": "moderate"
            }
          ]
        }
      ]
    }
  ]
}

O EXEMPLO de stepDiagnostics acima e o PADRAO DE QUALIDADE: cada passo da solucao
aparece com step + kcUsed e uma lista errors com TODOS os erros distintos plausiveis
(minimo 2 quando existirem). wrongAnswerPattern pode usar variaveis genericas ({A},
{A_num}...); a buggyRule e sempre uma receita mecanica computavel.

Repare que TODOS os wrongAnswerPattern do exemplo sao expressoes dos DADOS
({A_num}, {B_den}, max(...)) — nenhum deles e o gabarito mexido. Esse e o
formato. Se voce escrever algo como "gabarito + 1" ou "gabarito / 2", voce saiu
do que aluno faz e entrou no que e facil de inventar.`;

  // 2026-07-19 (fan-out por problema): a produção por passo SEM teto não cabe
  // de forma confiável numa ÚNICA resposta — no E2E o JSON de 4 problemas
  // truncou mesmo com maxTokens=24000 ("Failed to parse JSON (truncated?)") e
  // o catálogo inteiro virou pó, com fail-closed honesto em cascata (workers
  // sem âncora, Agent 9 re-rotulando tudo). Mesma engenharia dos workers do
  // Agent 6: UMA chamada POR problema, em paralelo — payload ~4x menor por
  // chamada, e a falha de um problema não zera o catálogo dos demais.
  // hardTimeoutMs 150s por chamada: os 75s globais também estouravam (pior
  // caso observado no formato antigo: 76s para o lote inteiro).
  const kcList = (state.knowledgeComponents || []).map((kc) => `- ${kc.id}: ${kc.name}`).join("\n");
  const seedList = Array.isArray(state.seedProblems) ? state.seedProblems : [];
  const lotes = seedList.length > 0 ? seedList.map((p) => [p]) : [[]];
  const solutionsPorLote = await Promise.all(
    lotes.map(async (lote, idx) => {
      const userMessage = `Disciplina: ${state.discipline} | Topico: ${state.topic} | Dificuldade: ${state.difficulty} | Idade: ${state.ageGroup || "?"}

=== PROBLEMA PARA RESOLVER (ERRANDO!) ===
${JSON.stringify(lote, null, 2)}

=== KNOWLEDGE COMPONENTS ===
${kcList}

Resolva ERRANDO de formas REALISTAS e DIVERSAS. Cada tentativa deve ter um erro DIFERENTE.
E preencha stepDiagnostics com TODOS os erros plausiveis de CADA passo (minimo 2 por passo quando existirem, sem maximo).
Use o problemId EXATO do problema fornecido.`;
      try {
        const raw = await callLLM(llm, systemPrompt, userMessage, {
          agent: "agent3b_atrisk",
          sessionId: state.sessionId,
          hardTimeoutMs: 150_000,
        });
        const parsedLote = extractJson(raw);
        return Array.isArray(parsedLote?.solutions) ? parsedLote.solutions : [];
      } catch (err) {
        logger.warn(
          { module: "agent3b", phase: "problem-fail", problemIndex: idx, err: err.message },
          "3b falhou num problema — os demais seguem (catálogo parcial >> vazio)"
        );
        return [];
      }
    })
  );
  const parsed = { studentProfile: "at_risk", solutions: solutionsPorLote.flat() };

  // 2026-07-18 (diagnóstico autossuficiente): normaliza stepDiagnostics IN PLACE,
  // solution a solution, via módulo compartilhado — entradas malformadas ou com id
  // genérico reservado são descartadas antes de atRiskTrace entrar no estado. O
  // catálogo unificado é extraído de atRiskTrace pelo pipeline (spec §3); por isso
  // NÃO criamos chave nova no retorno do nó.
  let stepDiagnosticsCount = 0;
  if (Array.isArray(parsed?.solutions)) {
    for (const sol of parsed.solutions) {
      if (!sol || typeof sol !== "object") continue;
      const blocks = normalizeStepDiagnostics({ solutions: [sol] });
      sol.stepDiagnostics = blocks;
      stepDiagnosticsCount += blocks.reduce((sum, block) => sum + block.errors.length, 0);
    }
  }

  logger.info(
    {
      module: "agent3b",
      phase: "done",
      elapsedMs: Date.now() - t0,
      stepDiagnostics: stepDiagnosticsCount,
    },
    "At-risk trace"
  );
  return {
    atRiskTrace: parsed,
    agentLogs: [
      {
        agent: "agent3b_atrisk",
        provider: cfg.provider,
        model: cfg.model,
        solutions: parsed.solutions?.length || 0,
        elapsed: Date.now() - t0,
      },
    ],
  };
}

// ============================================================
// AGENT 3c: Average Student Simulator (NOVO PROMPT)
// Provider: MiniMax M2.7
// ============================================================
export async function agent3c_averageStudent(state) {
  const cfg = getAgentConfig("agent3c_average");
  logger.debug(
    { module: "agent3c", phase: "start", provider: cfg.provider, model: cfg.model },
    "Average Student"
  );
  const t0 = Date.now();
  const llm = createLLM(cfg);

  const seedProblems = JSON.stringify(state.seedProblems || [], null, 2);

  const systemPrompt = `Voce e um ALUNO MEDIANO simulado resolvendo problemas educacionais.
Voce CONSEGUE resolver corretamente, mas HESITA em pontos-chave e precisa de DICAS para prosseguir.

Seu papel e identificar exatamente ONDE alunos medianos ficam perdidos e que tipo de dica os ajudaria.

Para CADA problema:
1. Resolva CORRETAMENTE (voce nao erra, apenas hesita)
2. Marque exatamente ONDE voce hesitou (hesitation: true)
3. Para cada hesitacao, indique que DICA seria necessaria

As dicas devem ser em 4 niveis progressivos (NUNCA revelando a resposta):
- Nivel 1 (conceitual): Relembre o conceito com uma PERGUNTA SOCRATICA. Exemplo: "Quando juntamos dois grupos, que operacao usamos?" NAO de a resposta.
- Nivel 2 (procedimental): Mostre o PROCESSO passo a passo sem dar o resultado. Exemplo: "Primeiro conte o grupo A, depois continue contando mais B a partir de onde parou."
- Nivel 3 (especifico): De uma pista FORTE que reduza as opcoes. Exemplo: "O resultado esta entre 10 e 15. Conte nos dedos para confirmar."
- Nivel 4 (bottom_out): Guie ate MUITO perto da resposta mas NUNCA revele. Exemplo: "Pense: voce tem 7, e precisa somar mais 4. Conte: 8, 9, 10... quanto falta?"

REGRAS CRITICAS PARA DICAS:
- NENHUMA dica em NENHUM nivel pode conter a resposta exata
- Cada dica deve ser ACIONAVEL: diz O QUE o aluno deve FAZER
- Cada dica deve ter TOM ENCORAJADOR: "Voce esta no caminho certo!", "Quase la!"
- PROIBIDO: "A resposta e X", "O resultado e Y", "Voce deveria responder Z"
- PROIBIDO dicas vagas: "Pense melhor", "Tente de novo", "Releia o enunciado"

Tambem identifique ROTAS ALTERNATIVAS: caminhos corretos mas nao ideais (ex: resolver por tentativa e erro em vez de formula).

Retorne JSON puro:
{
  "studentProfile": "average",
  "solutions": [
    {
      "problemId": 1,
      "solutionTrace": [
        {
          "step": 1,
          "action": "Ler o enunciado",
          "thinking": "Hmm, preciso somar {A} com {B}... mas como faco isso?",
          "result": "Entendi o que preciso fazer",
          "kcUsed": "kc_interpretacao",
          "isCorrect": true,
          "hesitation": true,
          "hintsNeeded": [
            {"level": 1, "type": "conceptual", "message": "Boa pergunta! Quando juntamos dois grupos, que operacao usamos? Pense em juntar coisas..."},
            {"level": 2, "type": "procedural", "message": "Voce esta indo bem! Conte primeiro o grupo {A}, depois continue contando mais {B} a partir de onde parou."},
            {"level": 3, "type": "specific", "message": "Quase la! O resultado esta perto de {C}. Conte nos dedos para confirmar."},
            {"level": 4, "type": "bottom_out", "message": "Voce esta muito perto! Pense: {A} mais {B}... comece em {A} e conte mais {B} nos dedos: {A}+1, {A}+2..."}
          ]
        }
      ],
      "finalAnswer": "{A} + {B}",
      "totalTime": 45,
      "alternativeRoutes": [
        {"description": "Resolver contando nos dedos em vez de calculo mental", "steps": ["Mostrar {A} dedos", "Contar mais {B}"], "efficiency": "low"}
      ]
    }
  ]
}`;

  const userMessage = `Disciplina: ${state.discipline} | Topico: ${state.topic} | Dificuldade: ${state.difficulty} | Idade: ${state.ageGroup || "?"}

=== PROBLEMAS PARA RESOLVER (COM HESITACOES) ===
${seedProblems}

=== KNOWLEDGE COMPONENTS ===
${(state.knowledgeComponents || []).map((kc) => `- ${kc.id}: ${kc.name}`).join("\n")}

Resolva CORRETAMENTE mas marque ONDE voce hesitaria e que dicas seriam necessarias.`;

  const raw = await callLLM(llm, systemPrompt, userMessage, {
    agent: "agent3c_average",
    sessionId: state.sessionId,
  });
  const parsed = extractJson(raw);

  logger.info({ module: "agent3c", phase: "done", elapsedMs: Date.now() - t0 }, "Average trace");
  return {
    averageTrace: parsed,
    agentLogs: [
      {
        agent: "agent3c_average",
        provider: cfg.provider,
        model: cfg.model,
        solutions: parsed.solutions?.length || 0,
        elapsed: Date.now() - t0,
      },
    ],
  };
}
