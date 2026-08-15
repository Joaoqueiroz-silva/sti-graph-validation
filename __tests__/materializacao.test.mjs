/**
 * materializacao.test.mjs — port do agent 6 (+7) e reprocessamento de um
 * registro da rodada 3 (2026-08-15). TUDO OFFLINE: callLLM mockado no llm.js
 * (o adaptador pipeline-core reexporta dele; agentes byte a byte intocados).
 *
 * Trava: (1) agent6+agent7 carregam com o fecho espelhado (28 módulos + 1
 * adaptador no-op); (2) o harness materializa um registro a partir de
 * bruto.tracos SEM chamar os agents 3 (só planner + workers do 6);
 * (3) o grafo materializado tem passos com VALOR CONCRETO (expectedAnswer do
 * agent 6) — o que a régua de estados precisa; (4) o comparador de caminho
 * casa esses estados com o especialista.
 */
import { describe, it, expect, vi } from "vitest";

const calls = vi.hoisted(() => ({ list: [] }));
vi.mock("../llm.js", async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    createLLM: (cfg = {}) => ({ cfg }),
    callLLM: vi.fn(async (llm, system, user, meta = {}) => {
      calls.list.push({ agent: meta.agent, model: llm?.cfg?.model, user: String(user).slice(0, 20000) });
      if (meta.agent === "agent6_planner") {
        // casca alinhada ao backbone: nº de stepIntents = nº de steps do genericGraph
        const n = (user.match(/"step_\d+"/g) || []).length || 3;
        return JSON.stringify({
          tutorTitle: "Pão dividido",
          exercises: [
            {
              id: 1,
              title: "Pão para 5",
              statement: "Um pão foi dividido igualmente entre 5 pessoas. Marque a parte de cada uma.",
              difficulty: "medium",
              context: "cozinha",
              variables: { A: 1, B: 5 },
              stepIntents: Array.from({ length: n }, (_, i) => ({
                graphNodeId: `step_${i + 1}`,
                kc: i === 0 ? "IdenDenominator" : "FindValueNumLine",
                description: i === 0 ? "Identificar o denominador" : "Marcar 1/5 na reta",
              })),
            },
          ],
        });
      }
      // worker: um step por intent, com expectedAnswer CONCRETO
      const n = (user.match(/graphNodeId/g) || []).length || (user.match(/"step_\d+"/g) || []).length || 3;
      const valores = ["5", "1/5", "1", "1/5", "1", "1"];
      return JSON.stringify({
        steps: Array.from({ length: n }, (_, i) => ({
          id: `s${i + 1}`,
          kc: i === 0 ? "IdenDenominator" : "FindValueNumLine",
          instruction: i === 0 ? "Em quantas partes o pão foi dividido?" : "Marque na reta a parte de cada pessoa.",
          expectedAnswer: valores[i] ?? "1",
          renderAs: "text",
          explanation: "ok",
          hints: [{ level: 1, type: "conceptual", message: "Pense em quantas pessoas." }],
          options: [],
        })),
      });
    }),
  };
});

import { materializarRegistro } from "../materializar-registro.js";
import { pontuarCaminho, caminhoDeReferencia } from "../analysis/bancada-v2/comparar-caminho.mjs";
import { _resetModelosResolvidos } from "../producao/agents/pipeline-core.js";

const envelopeA = {
  id: "00bubble",
  problem: "Um pão foi dividido igualmente entre 5 pessoas. Marque a parte de cada uma na reta.",
  correctAnswer: "1/5",
  difficulty: "medium",
  profile: "reader",
  components: [{ id: "numline", label: "numline", type: "numberline" }],
  knowledgeComponents: [
    { id: "IdenDenominator", name: "Identifique o denominador" },
    { id: "FindValueNumLine", name: "Encontre um valor na reta numérica." },
  ],
};

// registro mínimo da rodada 3: grafo do estágio 3 (rótulos com placeholder) + traces
const registro = () => ({
  exercicio: "00bubble",
  replica: 1,
  grafo: {
    passos: [
      { indice: 1, acao: "Identificar o denominador", kc: "IdenDenominator", valor: "Denominador = {B}" },
      { indice: 2, acao: "Marcar na reta", kc: "FindValueNumLine", valor: "Posição = {A}/{B}" },
      { indice: 3, acao: "Conferir", kc: "FindValueNumLine", valor: "Valor = {A}/{B}" },
    ],
    erros: [],
    dicas: [],
  },
  bruto: {
    tracos: {
      advancedTrace: {
        solutions: [
          {
            problemId: "00bubble",
            solutionTrace: [
              { step: 1, action: "Identificar o denominador", result: "Denominador = {B}", kcUsed: "IdenDenominator", isCorrect: true },
              { step: 2, action: "Marcar na reta", result: "Posição = {A}/{B}", kcUsed: "FindValueNumLine", isCorrect: true },
              { step: 3, action: "Conferir", result: "Valor = {A}/{B}", kcUsed: "FindValueNumLine", isCorrect: true },
            ],
            finalAnswer: "1/5",
          },
        ],
      },
      atRiskTrace: {
        solutions: [
          {
            problemId: "00bubble",
            attempts: [
              {
                attemptNumber: 1,
                solutionTrace: [
                  {
                    step: 2, action: "Marcar", result: "5", kcUsed: "FindValueNumLine", isCorrect: false,
                    error: { misconceptionId: "misc_whole_number_confusion", type: "conceptual_error", wrongAnswer: "5", description: "lê 1/5 como 5", feedback: "Boa tentativa! O 5 é o número de partes.", howToFix: "dividir a reta" },
                  },
                ],
                finalAnswer: "5", wasCorrect: false,
              },
            ],
            stepDiagnostics: [
              { problemId: "00bubble", step: 2, kcUsed: "FindValueNumLine", errors: [
                { misconceptionId: "misc_whole_number_confusion", type: "conceptual_error", wrongAnswerPattern: "5", buggyRule: "ler o denominador como inteiro", description: "lê 1/5 como 5", mistakeLocation: "x", diagnosticQuestion: "y", feedback: "Boa tentativa! O 5 é o número de partes.", howToFix: "dividir a reta", severity: "high" },
              ] },
            ],
          },
        ],
      },
      averageTrace: { solutions: [{ problemId: "00bubble", solutionTrace: [] }] },
    },
  },
});

describe("materialização — agent 6 + agent 7 portados", () => {
  it("materializa um registro da rodada 3 sem regenerar os alunos; passos ganham valor CONCRETO", async () => {
    _resetModelosResolvidos({ argv: [], env: {} });
    calls.list.length = 0;
    const out = await materializarRegistro(registro(), envelopeA);
    // só planner + worker(s) do agent 6 foram chamados; nenhum agent 3
    const agentes = calls.list.map((c) => c.agent);
    expect(agentes).toContain("agent6_planner");
    expect(agentes.some((a) => String(a).startsWith("agent6") && a !== "agent6_planner")).toBe(true);
    expect(agentes.some((a) => String(a).startsWith("agent3"))).toBe(false);
    // modelo do papel materializacao (perfil padrão custo-beneficio = gpt-5.6-luna)
    expect(calls.list.find((c) => c.agent === "agent6_planner").model).toBe("openai/gpt-5.6-luna");

    const passos = out.grafoMaterializado.passos;
    expect(passos.length).toBeGreaterThan(0);
    expect(passos.map((p) => p.valor)).toEqual(["5", "1/5", "1"]); // concreto, do agent 6
    expect(out.telemetria.passosMaterializados).toBe(3);
    // dicas do worker do agent 6 chegam ao grafo materializado, ancoradas no passo (1 por passo no mock)
    expect(out.grafoMaterializado.dicas.map((d) => d.passo)).toEqual([1, 2, 3]);
    expect(out.telemetria.dicasMaterializadas).toBe(3);
  });

  it("a régua de estados casa o grafo MATERIALIZADO com o especialista (o que o estágio 3 não permitia)", async () => {
    _resetModelosResolvidos({ argv: [], env: {} });
    const out = await materializarRegistro(registro(), envelopeA);
    const envB = { steps: [{ key: "5", answer: "5", order: 1 }, { key: "1/5", answer: "1/5", order: 2 }, { key: "1", answer: "1", order: 3 }], hintsPerCorrectStep: [[], [], []] };
    const cru = pontuarCaminho(registro(), envB, []);
    const mat = pontuarCaminho({ ...registro(), grafo: out.grafoMaterializado }, envB, []);
    expect(cru.coberturaEstados).toBe(0); // placeholders não casam
    expect(mat.coberturaEstados).toBe(1); // materializado casa o caminho inteiro
    expect(mat.caminhoIntegro).toBe(1);
    expect(caminhoDeReferencia(envB).map((s) => s.estado)).toEqual(["5", "1/5", "1"]);
  });
});

// ── braço interface fixa (rodada 4) ──
describe("materialização — interface fixa entra no requisito do agent 6", () => {
  it("sem opts.interfaceFixa o planner NÃO recebe a interface; com ela, recebe (canal REQUISITOS DO PROFESSOR)", async () => {
    _resetModelosResolvidos({ argv: [], env: {} });
    calls.list.length = 0;
    await materializarRegistro(registro(), envelopeA);
    const semIface = calls.list.find((c) => c.agent === "agent6_planner").user;
    expect(semIface).toContain("REQUISITOS DO PROFESSOR");
    expect(semIface).not.toContain("Interface FIXA");
    calls.list.length = 0;
    const out = await materializarRegistro(registro(), { ...envelopeA, id: "03summerBooks", components: [{ id: "numline", type: "numberline", label: "numline" }, { id: "F1", type: "numeric", label: "F1" }] }, { interfaceFixa: true });
    const comIface = calls.list.find((c) => c.agent === "agent6_planner").user;
    expect(comIface).toContain("Interface FIXA");
    expect(comIface).toContain("- numline (numberline)");
    expect(out.telemetria.interfaceFixa).toBe(true);
  });
  it("registro coletado com interfaceFixa=true liga o modo sozinho", async () => {
    _resetModelosResolvidos({ argv: [], env: {} });
    calls.list.length = 0;
    await materializarRegistro({ ...registro(), interfaceFixa: true }, { ...envelopeA, id: "03summerBooks" });
    expect(calls.list.find((c) => c.agent === "agent6_planner").user).toContain("Interface FIXA");
  });
});

// ── gate de problema fixo (2026-08-15) ──
import { verificarProblemaFixo } from "../materializar-registro.js";
describe("materialização — gate de problema fixo (obediência do agent 6 provada, não presumida)", () => {
  const envA = { problem: "Distribua um pão para 5 pessoas; cada uma recebe 1/5.", correctAnswer: "1/5" };
  it("aprova quando os valores usam só números do enunciado/resposta e contêm a resposta", () => {
    const g = { passos: [{ valor: "1/5" }, { valor: "5" }, { valor: "1" }] };
    expect(verificarProblemaFixo(envA, { statement: "…" }, g).aprovado).toBe(true);
  });
  it("reprova problema inventado (números estranhos ao enunciado)", () => {
    const g = { passos: [{ valor: "3/8" }, { valor: "8" }, { valor: "3" }] };
    const r = verificarProblemaFixo(envA, { statement: "Lúcia na fazenda dividiu em 8" }, g);
    expect(r.aprovado).toBe(false);
    expect(r.contemResposta).toBe(false);
    expect(r.valoresEstranhos.length).toBeGreaterThan(0);
  });
  it("reprova quando falta a resposta correta entre os estados, mesmo sem números estranhos", () => {
    const g = { passos: [{ valor: "5" }, { valor: "1" }] };
    expect(verificarProblemaFixo(envA, {}, g).aprovado).toBe(false);
  });

  it("sensibilidade (não pré-registrada): constantesDeDominio libera 0 e 1 (0/5, 1/5), mas segue reprovando números estranhos", () => {
    const g = { passos: [{ valor: "0/5" }, { valor: "1/5" }, { valor: "1" }, { valor: "1/5" }] };
    expect(verificarProblemaFixo(envA, {}, g).aprovado).toBe(false); // gate estrito (primário)
    expect(verificarProblemaFixo(envA, {}, g, { constantesDeDominio: true }).aprovado).toBe(true);
    const g2 = { passos: [{ valor: "1/5" }, { valor: "3/8" }] };
    expect(verificarProblemaFixo(envA, {}, g2, { constantesDeDominio: true }).aprovado).toBe(false);
  });
});
