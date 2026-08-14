/**
 * contrato-run-v2.test.mjs — port 2026-08 (docs/PLANO-PORT-AGENTES-2026-08.md
 * §5-§6): o coletor precisa gravar o registro COMPLETO do
 * docs/CONTRATO-RUN-V2.md, com modelos.porAgente RESOLVIDO e o bloco custo.
 *
 * O que se trava aqui (tudo OFFLINE, nenhuma chamada de LLM):
 *   1. buildRunRecord grava TODOS os campos obrigatórios do contrato — se
 *      qualquer campo deixar de ser gravado, este teste falha;
 *   2. validarRegistro detecta a ausência de CADA campo obrigatório (a régua
 *      do coletor não é decorativa);
 *   3. o formato flat legado continua byte a byte no registro (readRuns,
 *      aggregateRuns e validar.mjs --legado não podem quebrar);
 *   4. resolução de modelos: precedência exata da docs/CONFIGURACAO-MODELOS.md
 *      (--modelo > --perfil > MODELO_<AGENTE> > PERFIL_MODELOS > perfilPadrao);
 *   5. --perfil muda o mapa resolvido INTEIRO e a mudança aparece no registro
 *      gravado; --modelo estudantes=<x> troca SÓ aquele agente;
 *   6. um registro completo passa em validar.mjs --runs com os níveis 2, 3 e 5
 *      CALCULADOS (não "indisponíveis") — o que a Campanha 5 não permitia.
 */

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CAMPOS_OBRIGATORIOS,
  CAMPOS_ERRO,
  buildRunRecord,
  validarRegistro,
  montarCusto,
  getCampo,
} from "../scripts/registro-run-v2.mjs";
import { resolverModelos, AGENTES } from "../config/resolver-modelos.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, "..");

// ── material sintético (formato real dos módulos do pacote) ─────────────────

const grafoSintetico = () => ({
  nodes: [
    { id: "start", type: "start" },
    {
      id: "step_1",
      type: "step",
      description: "Identificar o denominador",
      knowledgeComponents: ["kc_den"],
      expectedInput: { value: "5" },
      misconceptions: [
        {
          id: "misc_whole_number_confusion",
          wrongAnswer: "1/4",
          misconceptionType: "conceptual_error",
          description: "lê a fração como inteiro",
          feedback: "Você marcou o inteiro; conte as divisões da reta.",
        },
      ],
    },
    {
      id: "step_2",
      type: "step",
      description: "Marcar o ponto",
      knowledgeComponents: ["kc_ponto"],
      expectedInput: { value: "1/5" },
      misconceptions: [],
    },
    { id: "goal", type: "goal" },
  ],
  edges: [],
});

const tracesSinteticos = () => ({
  correctPath: [
    { kc: "kc_den", selection: "numline", action: "define o máximo", result: "5" },
    { kc: "kc_ponto", selection: "numline", action: "marca o ponto", result: "1/5" },
  ],
  misconceptions: [
    {
      step: 1,
      id: "misc_whole_number_confusion",
      selection: "numline",
      action: "AddPoint",
      type: "conceptual_error",
      wrongAnswer: "1/4",
      buggyRule: "ler o denominador como inteiro",
      description: "lê a fração como inteiro",
      feedback: "Você marcou o inteiro; conte as divisões da reta.",
    },
  ],
  hints: [
    { step: 1, text: "conte as divisões" },
    { step: 1, text: "o denominador diz em quantas partes" },
  ],
});

const chamadasSinteticas = () => [
  {
    promptSha256: "a".repeat(64),
    tokensIn: 1796,
    tokensOut: 2078,
    costUsd: 0.015,
    model: "google/gemini-3.1-flash-lite",
  },
];

const modelosSinteticos = (over = {}) => ({
  perfil: "custo-beneficio",
  porAgente: {
    dominio: "openai/gpt-5.6-luna",
    materializacao: "openai/gpt-5.6-luna",
    estudantes: "google/gemini-3.1-flash-lite",
    revisao: "google/gemini-3.1-flash-lite",
    checagem: "google/gemini-3.1-flash-lite",
  },
  temperatura: 0.7,
  provedor: "openrouter",
  resolvidoEm: "2026-08-14T00:00:00.000Z",
  ...over,
});

const registroCompleto = (over = {}) =>
  buildRunRecord({
    exercicio: "00bubble",
    replica: 1,
    envelopeA: { correctAnswer: "1/5" },
    robot: {
      graph: grafoSintetico(),
      neutral: { misconceptions: [{ wrongAnswer: "1/4" }] },
      traces: tracesSinteticos(),
    },
    audit: { ok: true, stepCount: 2 },
    cmp: {
      similarity: 0.5,
      nodeF1Conceptual: 0.6,
      precision: 0.5,
      recall: 0.5,
      detail: { missingMisconceptions: ["2/5"], extraMisconceptions: [] },
    },
    fe: { agreement: 0.4, kappa: 0.1 },
    modelos: modelosSinteticos(),
    chamadas: chamadasSinteticas(),
    respostaDoModelo: '{"correctPath":[...resposta bruta do modelo...]}',
    geradoEm: "2026-08-14T00:00:00.000Z",
    ...over,
  });

// ── 1. todos os campos obrigatórios são gravados ────────────────────────────

describe("contrato v2 — buildRunRecord grava todos os campos obrigatórios", () => {
  it("nenhum campo obrigatório fica de fora (falha se o coletor parar de gravar algum)", () => {
    const registro = registroCompleto();
    for (const caminho of CAMPOS_OBRIGATORIOS) {
      expect(getCampo(registro, caminho), `campo obrigatório ausente: ${caminho}`).toBeDefined();
      expect(getCampo(registro, caminho), `campo obrigatório nulo: ${caminho}`).not.toBeNull();
    }
    expect(validarRegistro(registro)).toEqual([]);
  });

  it("cada erro do grafo carrega valor/passo/componente/acao/devolutiva/buggyRule/misconceptionId", () => {
    const registro = registroCompleto();
    expect(registro.grafo.erros.length).toBeGreaterThan(0);
    for (const erro of registro.grafo.erros) {
      for (const campo of CAMPOS_ERRO) {
        expect(erro[campo], `erro sem campo: ${campo}`).toBeDefined();
      }
    }
    const e = registro.grafo.erros[0];
    expect(e.valor).toBe("1/4");
    expect(e.passo).toBe(1); // 1-based, ancorado no passo do caminho gerado
    expect(e.componente).toBe("numline");
    expect(e.acao).toBe("AddPoint");
    expect(e.buggyRule).toBe("ler o denominador como inteiro");
    expect(e.misconceptionId).toBe("misc_whole_number_confusion");
    expect(e.devolutiva).toContain("Você");
  });

  it("modelos.porAgente traz o identificador RESOLVIDO e o custo soma o manifesto", () => {
    const registro = registroCompleto();
    expect(registro.modelos.porAgente.estudantes).toBe("google/gemini-3.1-flash-lite");
    expect(registro.custo).toMatchObject({ tokensEntrada: 1796, tokensSaida: 2078, usd: 0.015 });
    expect(registro.promptSha256).toBe("a".repeat(64));
    expect(registro.bruto.respostaDoModelo).toContain("resposta bruta");
    expect(registro.grafo.passos).toHaveLength(2);
    expect(registro.grafo.dicas).toEqual([
      { passo: 1, nivel: 1, texto: "conte as divisões" },
      { passo: 1, nivel: 2, texto: "o denominador diz em quantas partes" },
    ]);
  });

  it("o formato flat legado continua no registro (readRuns/aggregateRuns/--legado)", () => {
    const registro = registroCompleto();
    expect(registro).toMatchObject({
      id: "00bubble",
      correctAnswer: "1/5",
      audit: { ok: true, stepCount: 2 },
      f1: 0.5,
      conceptual: 0.6,
      precision: 0.5,
      recall: 0.5,
      functionalAgreement: 0.4,
      functionalKappa: 0.1,
      missing: ["2/5"],
      extra: [],
      robotMisconceptions: ["1/4"],
    });
  });

  it("custo com modelo fora da tabela congelada fica MARCADO desconhecido, nunca inventado", () => {
    const custo = montarCusto([{ tokensIn: 10, tokensOut: 20, costUsd: null }]);
    expect(custo).toEqual({ tokensEntrada: 10, tokensSaida: 20, usd: null, desconhecido: true });
  });
});

// ── 2. validarRegistro detecta a ausência de cada campo ─────────────────────

describe("contrato v2 — validarRegistro detecta cada ausência", () => {
  const apagar = (obj, caminho) => {
    const partes = caminho.split(".");
    const alvo = partes.slice(0, -1).reduce((o, k) => o[k], obj);
    delete alvo[partes.at(-1)];
  };

  it.each(CAMPOS_OBRIGATORIOS)("sem %s o registro é reprovado", (caminho) => {
    const registro = registroCompleto();
    apagar(registro, caminho);
    expect(validarRegistro(registro)).toContain(caminho);
  });

  it("erro do grafo sem passo/componente/devolutiva é reprovado", () => {
    const registro = registroCompleto();
    delete registro.grafo.erros[0].passo;
    delete registro.grafo.erros[0].devolutiva;
    const faltando = validarRegistro(registro);
    expect(faltando).toContain("grafo.erros[0].passo");
    expect(faltando).toContain("grafo.erros[0].devolutiva");
  });
});

// ── 3. resolução de modelos (docs/CONFIGURACAO-MODELOS.md) ──────────────────

describe("resolução de modelos — precedência e efeito no registro", () => {
  const semEnv = {};

  it("sem overrides: perfilPadrao custo-beneficio, mapa exato do exemplo", () => {
    const r = resolverModelos({ argv: [], env: semEnv });
    expect(r.perfil).toBe("custo-beneficio");
    expect(r.engajado).toBe(false);
    expect(r.porAgente).toEqual({
      dominio: "openai/gpt-5.6-luna",
      materializacao: "openai/gpt-5.6-luna",
      estudantes: "google/gemini-3.1-flash-lite",
      revisao: "google/gemini-3.1-flash-lite",
      checagem: "google/gemini-3.1-flash-lite",
    });
  });

  it("--perfil turbo troca TODOS os modelos e a mudança aparece no registro gravado", () => {
    const r = resolverModelos({ argv: ["--perfil", "turbo"], env: semEnv });
    expect(r.engajado).toBe(true);
    for (const a of AGENTES) expect(r.porAgente[a]).toBe("google/gemini-3.5-flash");

    // o mapa resolvido É o que o coletor grava em modelos.porAgente:
    const registro = registroCompleto({
      modelos: { perfil: r.perfil, porAgente: r.porAgente, temperatura: r.temperatura, provedor: r.provedor, resolvidoEm: r.resolvidoEm },
    });
    expect(registro.modelos.perfil).toBe("turbo");
    expect(registro.modelos.porAgente.estudantes).toBe("google/gemini-3.5-flash");
    expect(registro.modelos.porAgente.dominio).toBe("google/gemini-3.5-flash");
    expect(validarRegistro(registro)).toEqual([]);
  });

  it("--modelo estudantes=<x> troca SÓ aquele agente; os demais ficam no perfil", () => {
    const r = resolverModelos({ argv: ["--modelo", "estudantes=qwen/qwen3-max"], env: semEnv });
    expect(r.engajado).toBe(true);
    expect(r.porAgente.estudantes).toBe("qwen/qwen3-max");
    expect(r.porAgente.dominio).toBe("openai/gpt-5.6-luna");
    expect(r.porAgente.revisao).toBe("google/gemini-3.1-flash-lite");
    expect(r.origem.estudantes).toBe("--modelo");
  });

  it("ambiente: MODELO_ESTUDANTES e PERFIL_MODELOS funcionam sem editar código", () => {
    const r = resolverModelos({
      argv: [],
      env: { PERFIL_MODELOS: "turbo", MODELO_ESTUDANTES: "qwen/qwen3-max" },
    });
    expect(r.perfil).toBe("turbo");
    expect(r.porAgente.estudantes).toBe("qwen/qwen3-max"); // MODELO_* vence PERFIL_MODELOS
    expect(r.porAgente.dominio).toBe("google/gemini-3.5-flash");
  });

  it("precedência da doc: --modelo > --perfil > MODELO_<AGENTE> > PERFIL_MODELOS", () => {
    const r = resolverModelos({
      argv: ["--modelo", "estudantes=a/b", "--perfil", "qualidade-maxima"],
      env: { MODELO_ESTUDANTES: "c/d", MODELO_REVISAO: "e/f", PERFIL_MODELOS: "turbo" },
    });
    expect(r.porAgente.estudantes).toBe("a/b"); // --modelo vence tudo
    expect(r.porAgente.revisao).toBe("anthropic/claude-opus-5"); // --perfil vence MODELO_REVISAO
    expect(r.porAgente.dominio).toBe("xiaomi/mimo-v2.5-pro"); // --perfil vence PERFIL_MODELOS
    expect(r.perfil).toBe("qualidade-maxima");
  });

  it("agente ou perfil desconhecido é ERRO, nunca um chute de modelo parecido", () => {
    expect(() => resolverModelos({ argv: ["--perfil", "nao-existe"], env: semEnv })).toThrow(
      /perfil desconhecido/
    );
    expect(() => resolverModelos({ argv: ["--modelo", "aluno=x/y"], env: semEnv })).toThrow(
      /agente desconhecido/
    );
    expect(() => resolverModelos({ argv: ["--modelo", "estudantes"], env: semEnv })).toThrow(
      /--modelo espera/
    );
  });
});

// ── 4. o registro passa em validar.mjs --runs com níveis 2, 3 e 5 calculados ─

describe("contrato v2 — validar.mjs --runs calcula os níveis 2, 3 e 5", () => {
  it("um diretório de registros completos NÃO cai em 'indisponíveis'", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "runs-v2-"));
    const registro = registroCompleto();
    fs.writeFileSync(path.join(tmp, "00bubble_rep1.json"), JSON.stringify(registro, null, 1));

    const saida = execFileSync(
      process.execPath,
      [path.join(REPO, "analysis/validacao-v2/validar.mjs"), "--runs", tmp, "--raiz", REPO],
      { encoding: "utf8" }
    );
    expect(saida).not.toContain("indisponíveis");
    expect(saida).toContain("NÍVEL 2"); // valor no passo certo — calculado
    expect(saida).toContain("NÍVEL 3"); // componente/ação — calculado
    expect(saida).toContain("NÍVEL 5"); // qualidade da devolutiva — calculado
  }, 60000);
});
