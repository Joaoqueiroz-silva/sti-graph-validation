/**
 * agents3-students.js - Student Simulators (Agents 3a/3b/3c).
 * Extraido de pipeline-v8.js em 2026-04-22, preservado byte-a-byte.
 *
 * 2026-07-13 (Onda 3, G10): chaves de ablação FLAG-GATED da campanha 3. Com os envs
 * ausentes/vazios o comportamento (prompts e metas) é byte a byte o anterior — o
 * baseline congelado não muda sem flag (teste: campaign3-runner.test.mjs).
 */

import { createLLM, callLLM, extractJson, getAgentConfig } from "./llm.js";
import { MISC_DB } from "./misconceptions-db.js";
import { logger } from "./logger.js";

// ─── Chaves de ablação da campanha 3 (2026-07-13, Onda 3/G10) ───────────────────

/**
 * STI_MISC_LIMIT ("3" default | "6" | "saturate") → parametriza SÓ a linha de
 * QUANTIDADE de tentativas/erros do prompt do 3b; o resto do prompt (exemplos de
 * tipos de erro, contrato JSON) é idêntico nas três condições. Default = o texto
 * atual, byte a byte.
 */
function miscQuantityLine() {
  const lim = process.env.STI_MISC_LIMIT || "3";
  if (lim === "saturate")
    return "Para CADA problema, liste TODAS as respostas erradas plausiveis que voce conseguir, cada uma como uma TENTATIVA com um ERRO DIFERENTE:";
  if (lim === "6") return "Para CADA problema, faca 6 TENTATIVAS, cada uma com um ERRO DIFERENTE:";
  return "Para CADA problema, faca 2-3 TENTATIVAS, cada uma com um ERRO DIFERENTE:";
}

/**
 * 2026-07-13 (Onda 3, G10): metadados do manifesto de execução (runId/exerciseId/
 * envelopeSha256/images) viajam por `state.llmMeta` até o callLLM (contrato do B1).
 * Sem llmMeta (produção/baseline), o meta é EXATAMENTE o de antes: { agent, sessionId }.
 */
function llmMeta(state, agent) {
  return { agent, sessionId: state.sessionId, ...(state.llmMeta || {}) };
}

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

  const raw = await callLLM(llm, systemPrompt, userMessage, llmMeta(state, "agent3a_advanced"));
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

// ============================================================
// AGENT 3b: At-Risk Student Simulator (NOVO PROMPT)
// Provider: MiniMax M2.7
// ============================================================
export async function agent3b_atRiskStudent(state) {
  const cfg = getAgentConfig("agent3b_atrisk");
  logger.debug(
    { module: "agent3b", phase: "start", provider: cfg.provider, model: cfg.model },
    "At-Risk Student"
  );
  const t0 = Date.now();
  const llm = createLLM(cfg);

  const seedProblems = JSON.stringify(state.seedProblems || [], null, 2);
  const age = parseInt(state.ageGroup) || 10;
  const ageKey = age <= 5 ? "4-5" : age <= 7 ? "6-7" : age <= 12 ? "8-12" : "13+";
  const miscKey = `${(state.discipline || "matematica").toLowerCase()}:${ageKey}`;
  // 2026-07-13 (Onda 3, G10): STI_ABLATE_MISCDB=1 → o 3b roda SEM o catálogo MISC_DB
  // (mede a contribuição do catálogo). Default (env ausente/vazio) = linha original.
  // GOTCHA (CLAUDE.md #3): a disciplina chega ACENTUADA da UI ("Matemática") e as chaves
  // do MISC_DB são SEM acento ("matematica:8-12") — com o default acentuado o catálogo já
  // sai vazio; para a condição "com catálogo" ser não-vácua, o runner precisa passar
  // discipline sem acento (run-campaign3 --discipline matematica).
  const knownMisconceptions =
    process.env.STI_ABLATE_MISCDB === "1" ? [] : MISC_DB[miscKey] || [];

  const systemPrompt = `Voce e um ALUNO COM DIFICULDADES simulado resolvendo problemas educacionais.
Voce comete ERROS REALISTAS baseados em misconceptions educacionais documentadas.

Seu papel e gerar traces que mostrem COMO alunos reais erram, para que o sistema possa detectar e remediar esses erros.

${miscQuantityLine()}
- Tentativa 1: Erro de concepcao (ex: achar que 2+3=6 porque somou errado)
- Tentativa 2: Erro procedimental (ex: pular um passo, inverter operandos)
- Tentativa 3: Acerto parcial (se aplicavel — acerta parte mas erra outra)

CADA ERRO deve ter:
- Um misconceptionId unico (ex: "misc_contagem_pular", "misc_inversao_operandos")
- Tipo: count_error | procedural_error | conceptual_error | off_by_one | operation_confusion | magnitude_error
- O que o aluno fez de errado (wrongAnswer com variaveis genericas)
- Severidade: low | moderate | high
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
                "misconceptionId": "misc_off_by_one",
                "type": "off_by_one",
                "wrongAnswer": "{A} + 1",
                "description": "Aluno conta um a mais que o correto",
                "mistakeLocation": "Na contagem do segundo grupo, o aluno comecou do numero errado em vez de continuar de onde parou",
                "diagnosticQuestion": "Quando voce juntou os dois grupos, de qual numero voce comecou a contar o segundo grupo?",
                "severity": "moderate",
                "feedback": "Boa tentativa! Voce esta quase la. Vamos contar de novo com calma, um por um, apontando cada objeto.",
                "howToFix": "Usar material concreto e contar devagar apontando cada objeto"
              }
            }
          ],
          "finalAnswer": "{A} + 1",
          "wasCorrect": false
        }
      ]
    }
  ]
}`;

  const userMessage = `Disciplina: ${state.discipline} | Topico: ${state.topic} | Dificuldade: ${state.difficulty} | Idade: ${state.ageGroup || "?"}

=== PROBLEMAS PARA RESOLVER (ERRANDO!) ===
${seedProblems}

=== KNOWLEDGE COMPONENTS ===
${(state.knowledgeComponents || []).map((kc) => `- ${kc.id}: ${kc.name}`).join("\n")}

Resolva ERRANDO de formas REALISTAS e DIVERSAS. Cada tentativa deve ter um erro DIFERENTE.`;

  const raw = await callLLM(llm, systemPrompt, userMessage, llmMeta(state, "agent3b_atrisk"));
  const parsed = extractJson(raw);

  logger.info({ module: "agent3b", phase: "done", elapsedMs: Date.now() - t0 }, "At-risk trace");
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

  const raw = await callLLM(llm, systemPrompt, userMessage, llmMeta(state, "agent3c_average"));
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
