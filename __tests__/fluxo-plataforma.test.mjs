/**
 * fluxo-plataforma.test.mjs — rodada 2 (2026-08-14): o harness que autora o
 * grafo pelo FLUXO DA PLATAFORMA (agents3a/3b/3c portados byte a byte +
 * extractGraphForgeConfig + graphForge de produção).
 *
 * TUDO OFFLINE: callLLM mockado via vi.mock de llm.js (o adaptador
 * producao/agents/pipeline-core.js reexporta dele, então os agentes portados
 * caem no mock sem tocar em nenhum agente).
 *
 * O que se trava:
 *   1. os TRÊS agentes rodam, na ordem 3a→3b→3c, com o modelo do papel
 *      "estudantes" resolvido pelo perfil (sem editar código);
 *   2. o state entregue aos agentes vem do envelope A (mesmo problema, mesmo
 *      enunciado, KCs do pacote) e o catálogo de misconceptions entra no
 *      prompt do 3b (chave sem acento, matematica:8-12);
 *   3. os traces atravessam o extractGraphForgeConfig de PRODUÇÃO e viram
 *      grafo: erro concreto sobrevive; erro com template {A} é DESCARTADO
 *      pelo graphForge (comportamento de produção pré-materialização) e o
 *      harness CONTA o descarte (gate do piloto);
 *   4. o registro do coletor montado deste robot passa no contrato v2.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const calls = vi.hoisted(() => ({ list: [] }));

const RESPOSTAS = vi.hoisted(() => ({
  agent3a_advanced: JSON.stringify({
    studentProfile: "advanced",
    solutions: [
      {
        problemId: "00bubble",
        solutionTrace: [
          {
            step: 1,
            action: "Identificar o denominador",
            interactionFamily: "input_value",
            targetRole: "denominador",
            thinking: "O pão foi dividido para 5 pessoas",
            result: "5",
            kcUsed: "IdenDenominator",
            timeEstimate: 5,
            isCorrect: true,
          },
          {
            step: 2,
            action: "Marcar 1/5 na reta",
            interactionFamily: "mark_position",
            targetRole: "ponto_reta_numerica",
            thinking: "Divido a reta em 5 partes e marco a primeira",
            result: "1/5",
            kcUsed: "FindValueNumLine",
            timeEstimate: 8,
            isCorrect: true,
          },
        ],
        finalAnswer: "1/5",
        totalTime: 13,
      },
    ],
  }),
  agent3b_atrisk: JSON.stringify({
    studentProfile: "at_risk",
    solutions: [
      {
        problemId: "00bubble",
        attempts: [
          {
            attemptNumber: 1,
            solutionTrace: [
              {
                step: 2,
                action: "Marcar na reta",
                thinking: "Vou marcar o 5",
                result: "5",
                kcUsed: "FindValueNumLine",
                isCorrect: false,
                error: {
                  misconceptionId: "misc_whole_number_confusion",
                  type: "conceptual_error",
                  wrongAnswer: "5",
                  description: "Lê a fração como o inteiro do denominador",
                  mistakeLocation: "Ao converter 1/5 em posição na reta",
                  diagnosticQuestion: "O 5 é o número de pedaços ou o tamanho de um pedaço?",
                  severity: "high",
                  feedback: "Boa tentativa! Você achou o 5 — agora pense no que ele representa.",
                  howToFix: "Dividir a reta em 5 partes antes de marcar",
                },
              },
            ],
            finalAnswer: "5",
            wasCorrect: false,
          },
          {
            attemptNumber: 2,
            solutionTrace: [
              {
                step: 2,
                action: "Marcar na reta",
                thinking: "Marco {A} direto",
                result: "{A}",
                kcUsed: "FindValueNumLine",
                isCorrect: false,
                error: {
                  misconceptionId: "misc_template_nao_resolvido",
                  type: "procedural_error",
                  wrongAnswer: "{A}/{B}",
                  description: "Erro genérico com variáveis não concretizadas",
                  mistakeLocation: "n/a",
                  diagnosticQuestion: "n/a",
                  severity: "low",
                  feedback: "n/a",
                  howToFix: "n/a",
                },
              },
            ],
            finalAnswer: "{A}/{B}",
            wasCorrect: false,
          },
        ],
        stepDiagnostics: [
          {
            problemId: "00bubble",
            step: 2,
            kcUsed: "FindValueNumLine",
            errors: [
              {
                misconceptionId: "misc_whole_number_confusion",
                type: "conceptual_error",
                wrongAnswerPattern: "5",
                buggyRule: "ler o denominador como um inteiro e marcar o proprio 5 na reta",
                description: "Lê a fração como o inteiro do denominador",
                mistakeLocation: "Ao converter 1/5 em posição na reta",
                diagnosticQuestion: "O 5 é o número de pedaços ou o tamanho de um pedaço?",
                feedback: "Boa tentativa! Você achou o 5 — agora pense no que ele representa.",
                howToFix: "Dividir a reta em 5 partes antes de marcar",
                severity: "high",
              },
            ],
          },
        ],
      },
    ],
  }),
  agent3c_average: JSON.stringify({
    studentProfile: "average",
    solutions: [
      {
        problemId: "00bubble",
        solutionTrace: [
          {
            step: 1,
            action: "Entender a fração",
            thinking: "Hmm, 1/5...",
            result: "ok",
            kcUsed: "IdenDenominator",
            isCorrect: true,
            hesitation: true,
            hintsNeeded: [
              { level: 1, type: "conceptual", message: "Em quantas partes o pão foi dividido?" },
              { level: 2, type: "procedural", message: "Divida a reta nesse número de partes." },
            ],
          },
        ],
        finalAnswer: "1/5",
        totalTime: 40,
        alternativeRoutes: [],
      },
    ],
  }),
}));

vi.mock("../llm.js", async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    createLLM: (cfg = {}) => ({ cfg }),
    callLLM: vi.fn(async (llm, system, user, meta) => {
      calls.list.push({ model: llm?.cfg?.model, system, user, meta });
      const resposta = RESPOSTAS[meta.agent] ?? "{}";
      if (!system.includes("REGIME SOMENTE-ENUNCIADO")) return resposta;
      const concreto = JSON.parse(resposta);
      const limpar = (valor) => {
        if (Array.isArray(valor)) return valor.map(limpar);
        if (valor && typeof valor === "object") {
          return Object.fromEntries(Object.entries(valor).map(([k, v]) => [
            k,
            k === "problemId" ? 1 : limpar(v),
          ]));
        }
        return typeof valor === "string"
          ? valor.replace(/\{[A-Za-z][A-Za-z0-9_.:-]*\}/g, "1")
          : valor;
      };
      return JSON.stringify(limpar(concreto));
    }),
  };
});

import { authorFluxoPlataforma, buildStateFromEnvelopeA } from "../simulate-fluxo-plataforma.js";
import { INPUT_POLICY_SOMENTE_ENUNCIADO } from "../input-policy.js";
import { _resetModelosResolvidos } from "../producao/agents/pipeline-core.js";
import { buildRunRecord, validarRegistro } from "../scripts/registro-run-v2.mjs";

const envelopeA = {
  id: "00bubble",
  problem: "Distribua um pão para 5 pessoas; cada uma recebe 1/5. Marque 1/5 na reta.",
  correctAnswer: "1/5",
  difficulty: "medium",
  profile: "reader",
  components: [{ id: "numline", label: "numline", type: "numberline" }],
  knowledgeComponents: [
    { id: "IdenDenominator", name: "Identifique o denominador" },
    { id: "FindValueNumLine", name: "Encontre um valor na reta numérica." },
  ],
};

beforeEach(() => {
  calls.list.length = 0;
  _resetModelosResolvidos({ argv: [], env: {} }); // perfilPadrao custo-beneficio
});

describe("fluxo-plataforma — state e resolução de modelos", () => {
  it("monta o state do pipeline a partir do envelope A (mesmo problema, mesmos KCs)", () => {
    const state = buildStateFromEnvelopeA(envelopeA, { exerciseId: "00bubble" });
    expect(state.discipline).toBe("matematica"); // sem acento — chave do catálogo
    expect(state.seedProblems).toEqual([
      { problemId: "00bubble", statement: envelopeA.problem, correctAnswer: "1/5" },
    ]);
    expect(state.knowledgeComponents).toHaveLength(2);
    expect(state.numProblems).toBe(1);
    expect(state.interfaceSpec.profile).toBe("reader");
  });

  it("roda 3a→3b→3c com o modelo do papel estudantes resolvido pelo perfil", async () => {
    await authorFluxoPlataforma(envelopeA, { exerciseId: "00bubble" });
    expect(calls.list.map((c) => c.meta.agent)).toEqual([
      "agent3a_advanced",
      "agent3b_atrisk",
      "agent3c_average",
    ]);
    // perfilPadrao custo-beneficio → estudantes = gemini-3.1-flash-lite nos TRÊS
    for (const c of calls.list) expect(c.model).toBe("google/gemini-3.1-flash-lite");
  });

  it("--modelo estudantes=<x> troca o modelo dos três agentes sem tocar em código", async () => {
    _resetModelosResolvidos({ argv: ["--modelo", "estudantes=qwen/qwen3-max"], env: {} });
    await authorFluxoPlataforma(envelopeA, { exerciseId: "00bubble" });
    for (const c of calls.list) expect(c.model).toBe("qwen/qwen3-max");
  });

  it("o prompt do 3b recebe o enunciado real e o catálogo de misconceptions (chave sem acento)", async () => {
    await authorFluxoPlataforma(envelopeA, { exerciseId: "00bubble" });
    const b = calls.list.find((c) => c.meta.agent === "agent3b_atrisk");
    expect(b.user).toContain("Distribua um pão para 5 pessoas");
    expect(b.system).toContain("MISCONCEPTIONS CONHECIDAS"); // matematica:8-12 existe
    expect(b.system).toContain("buggyRule");
    expect(b.meta.hardTimeoutMs).toBe(150_000); // fan-out por problema, contrato de produção
  });

  it("somente-enunciado-v1 entrega aos três agentes apenas o texto, sem segredos CTAT", async () => {
    const estrito = {
      id: "ID_CTAT_SUPER_SECRETO",
      problem: "Resolva este enunciado sem consultar um gabarito externo.",
      correctAnswer: "RESPOSTA_CTAT_SUPER_SECRETA",
      difficulty: "DIFICULDADE_CTAT_SUPER_SECRETA",
      profile: "PERFIL_CTAT_SUPER_SECRETO",
      components: [{ id: "COMPONENTE_CTAT_SUPER_SECRETO" }],
      knowledgeComponents: [
        { id: "KC_CTAT_SUPER_SECRETO", name: "NOME_KC_CTAT_SUPER_SECRETO" },
      ],
      metadata: { sourceFile: "ARQUIVO_CTAT_SUPER_SECRETO.brd" },
    };

    const robot = await authorFluxoPlataforma(estrito, {
      exerciseId: estrito.id,
      inputPolicy: INPUT_POLICY_SOMENTE_ENUNCIADO,
    });

    expect(calls.list.map((c) => c.meta.agent)).toEqual([
      "agent3a_advanced",
      "agent3b_atrisk",
      "agent3c_average",
    ]);
    const prompts = calls.list.map((c) => `${c.system}\n${c.user}`).join("\n");
    expect(prompts).toContain(estrito.problem);
    expect(prompts).toContain("VALORES CONCRETOS");
    expect(prompts).toContain("não use placeholders");
    for (const segredo of [
      estrito.id,
      estrito.correctAnswer,
      estrito.difficulty,
      estrito.profile,
      estrito.components[0].id,
      estrito.knowledgeComponents[0].id,
      estrito.knowledgeComponents[0].name,
      estrito.metadata.sourceFile,
    ]) {
      expect(prompts).not.toContain(segredo);
    }
    expect(robot.politicaInput).toMatchObject({
      id: INPUT_POLICY_SOMENTE_ENUNCIADO,
      geracao: {
        politica: INPUT_POLICY_SOMENTE_ENUNCIADO,
        etapa: "geracao",
        chavesRestritas: [],
      },
      saidaGeracao: {
        politica: INPUT_POLICY_SOMENTE_ENUNCIADO,
        placeholders: [],
        problemIdsInvalidos: [],
        violacoes: [],
      },
    });
    expect(robot.politicaInput.geracao.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejeita somente-enunciado-v1 + interface fixa antes de chamar qualquer agente", async () => {
    await expect(
      authorFluxoPlataforma(envelopeA, {
        exerciseId: envelopeA.id,
        interfaceFixa: true,
        inputPolicy: INPUT_POLICY_SOMENTE_ENUNCIADO,
      })
    ).rejects.toThrow(/incompatível com interface fixa/i);
    expect(calls.list).toHaveLength(0);
  });
});

describe("fluxo-plataforma — traces → extractGraphForgeConfig → graphForge", () => {
  it("erro concreto vira branch do grafo; template {A} é descartado E contado", async () => {
    const robot = await authorFluxoPlataforma(envelopeA, { exerciseId: "00bubble" });

    const stepNodes = robot.graph.nodes.filter((n) => n.type === "step");
    expect(stepNodes.length).toBeGreaterThan(0);
    expect(stepNodes[0]).toMatchObject({
      interactionFamily: "input_value",
      targetRole: "denominador",
    });
    expect(stepNodes[1]).toMatchObject({
      interactionFamily: "mark_position",
      targetRole: "ponto_reta_numerica",
    });
    const miscsNoGrafo = stepNodes.flatMap((n) => n.misconceptions || []);
    expect(miscsNoGrafo.map((m) => m.id)).toContain("misc_whole_number_confusion");
    // o graphForge de produção descarta wrongAnswer com template não resolvido
    expect(miscsNoGrafo.map((m) => m.id)).not.toContain("misc_template_nao_resolvido");

    expect(robot.fidelidade).toMatchObject({
      errosDoModelo: 2,
      errosEspecificos: 2,
      descartadosPorTemplate: 1,
    });
    expect(robot.fidelidade.errosNoGrafo).toBeGreaterThan(0);

    // resposta concreta do aluno avançado injetada no nó (substituto do lock pós-UI)
    expect(stepNodes[0].expectedInput.value).toBe("5");
    // neutro pronto para o comparador intocado
    expect(robot.neutral.misconceptions.map((m) => m.wrongAnswer)).toContain("5");
  });

  it("o registro montado deste robot passa no contrato v2 (com buggyRule do stepDiagnostics)", async () => {
    const robot = await authorFluxoPlataforma(envelopeA, { exerciseId: "00bubble" });
    const registro = buildRunRecord({
      exercicio: "00bubble",
      replica: 1,
      envelopeA,
      robot,
      audit: { ok: true, stepCount: 2 },
      cmp: {
        similarity: 0.5,
        nodeF1Conceptual: 0.5,
        precision: 0.5,
        recall: 0.5,
        detail: { missingMisconceptions: [], extraMisconceptions: [] },
      },
      fe: { agreement: 0.5, kappa: 0.1 },
      modelos: {
        perfil: "custo-beneficio",
        porAgente: { estudantes: "google/gemini-3.1-flash-lite" },
        temperatura: 0.7,
        provedor: "openrouter",
        resolvidoEm: "2026-08-14T00:00:00.000Z",
      },
      chamadas: [{ promptSha256: "b".repeat(64), tokensIn: 100, tokensOut: 200, costUsd: 0.001 }],
      respostaDoModelo: JSON.stringify([{ agent: "agent3a_advanced", content: "..." }]),
    });
    expect(validarRegistro(registro)).toEqual([]);
    const erro = registro.grafo.erros.find((e) => e.misconceptionId === "misc_whole_number_confusion");
    expect(erro).toBeTruthy();
    expect(erro.buggyRule).toContain("denominador"); // enriquecido do stepDiagnostics
    expect(erro.passo).toBeGreaterThanOrEqual(1);
    expect(registro.grafo.dicas.length).toBeGreaterThan(0);
  });
});

// ── regime de topologia: producao (corte do GraphForge) × livre (2026-08-14) ──
describe("fluxo-plataforma — modo passos-livres", () => {
  const traceLongo = () =>
    JSON.stringify({
      studentProfile: "advanced",
      solutions: [
        {
          problemId: "00bubble",
          solutionTrace: Array.from({ length: 7 }, (_, i) => ({
            step: i + 1,
            action: `Passo ${i + 1}`,
            thinking: "…",
            result: `r${i + 1}`,
            kcUsed: i % 2 ? "FindValueNumLine" : "IdenDenominator",
            timeEstimate: 5,
            isCorrect: true,
          })),
          finalAnswer: "1/5",
          totalTime: 35,
        },
      ],
    });

  it("regime produção: reader/medium corta a espinha dorsal em 4 passos (byte a byte com o forge)", async () => {
    RESPOSTAS.agent3a_advanced = traceLongo();
    const robot = await authorFluxoPlataforma(envelopeA, { exerciseId: "00bubble" });
    const stepNodes = robot.graph.nodes.filter((n) => n.type === "step");
    expect(stepNodes).toHaveLength(4);
    expect(robot.topologia).toMatchObject({ regime: "producao", passosGeradosPeloAgente: 4, tetoDinamicoProducao: 4 });
  });

  it("regime livre: TODOS os 7 passos do agente entram no grafo, e o plano de produção fica registrado", async () => {
    RESPOSTAS.agent3a_advanced = traceLongo();
    const robot = await authorFluxoPlataforma(envelopeA, { exerciseId: "00bubble", passosLivres: true });
    const stepNodes = robot.graph.nodes.filter((n) => n.type === "step");
    expect(stepNodes).toHaveLength(7);
    expect(robot.topologia).toMatchObject({
      regime: "livre",
      passosGeradosPeloAgente: 7,
      passosQueProducaoAplicaria: 4, // atribuição: o que produção teria cortado
    });
    // o erro do 3b (passo 2) continua ancorado no passo certo no regime livre
    const passo2 = stepNodes[1];
    expect((passo2.misconceptions || []).map((m) => m.id)).toContain("misc_whole_number_confusion");
  });

  it("STI_PASSOS_LIVRES=1 no ambiente liga o regime livre sem flag", async () => {
    RESPOSTAS.agent3a_advanced = traceLongo();
    process.env.STI_PASSOS_LIVRES = "1";
    try {
      const robot = await authorFluxoPlataforma(envelopeA, { exerciseId: "00bubble" });
      expect(robot.graph.nodes.filter((n) => n.type === "step")).toHaveLength(7);
    } finally {
      delete process.env.STI_PASSOS_LIVRES;
    }
  });
});
