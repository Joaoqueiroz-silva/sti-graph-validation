/**
 * exec-manifest.test.mjs — manifesto de execução, custo por chamada, trava de orçamento
 * e entrada multimodal (G11, exigências E4/Apêndice B do plano de análise).
 *
 * SEM REDE: fetch é mockado globalmente; runs/ é redirecionada para um tmpdir por teste
 * via STI_RUNS_DIR (exigência do plano: telemetria testável sem sujar o repo).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  PRICES,
  sha256,
  costOf,
  recordCall,
  budget,
  assertBudget,
  budgetLimitUsd,
  BudgetExceededError,
  runsDir,
} from "../exec-manifest.js";
import { createLLM, callLLM } from "../llm.js";

let tmp;

/** Resposta de sucesso da OpenRouter com usage conhecido (1M in + 1M out). */
const okResponse = (content = "ok", usage = { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 }) => ({
  ok: true,
  json: async () => ({ choices: [{ message: { content } }], usage }),
});

const failResponse = { ok: false, status: 500, text: async () => "boom interno" };

const readManifest = (runId) =>
  fs
    .readFileSync(path.join(runsDir(), "manifests", `${runId}.jsonl`), "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "exec-manifest-"));
  vi.stubEnv("STI_RUNS_DIR", tmp);
  vi.stubEnv("STI_RUN_ID", "run-teste");
  vi.stubEnv("STI_BUDGET_USD", ""); // vazio → parseFloat NaN → default 50 (isola do shell)
  vi.stubEnv("OPENROUTER_API_KEY", "sk-fake-para-teste"); // nunca usada: fetch é mock
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("sha256 e tabela de preços", () => {
  it("sha256 devolve o hash hex conhecido", () => {
    // vetor conhecido: echo -n "abc" | sha256sum
    expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("costOf usa a tabela congelada (USD por milhão de tokens)", () => {
    expect(costOf("google/gemini-3.5-flash", 1_000_000, 1_000_000)).toBeCloseTo(10.5, 10);
    expect(costOf("deepseek/deepseek-chat", 2_000_000, 500_000)).toBeCloseTo(0.6 + 0.6, 10);
    expect(costOf("modelo/desconhecido", 1000, 1000)).toBeNull();
  });

  it("PRICES está congelada (não dá para adulterar preço em runtime)", () => {
    expect(Object.isFrozen(PRICES)).toBe(true);
    expect(Object.isFrozen(PRICES["z-ai/glm-5.2"])).toBe(true);
  });
});

describe("(a) manifesto JSONL com custo certo para tokens conhecidos", () => {
  it("callLLM grava a entrada completa e o custo bate com a tabela", async () => {
    const fetchMock = vi.fn(async () => okResponse("resposta do modelo"));
    vi.stubGlobal("fetch", fetchMock);

    const llm = createLLM({ model: "google/gemini-3.5-flash", temperature: 0.2, maxTokens: 1000 });
    const out = await callLLM(llm, "SYS", "USER", {
      agent: "agent3a_advanced",
      runId: "run-teste",
      exerciseId: "ex-01",
      envelopeSha256: "env-hash",
    });
    expect(out).toBe("resposta do modelo");

    const [rec] = readManifest("run-teste");
    expect(rec).toMatchObject({
      runId: "run-teste",
      exerciseId: "ex-01",
      agentKey: "agent3a_advanced",
      model: "google/gemini-3.5-flash",
      temperature: 0.2,
      attempt: 1,
      fallbackUsed: false,
      status: "ok",
      tokensIn: 1_000_000,
      tokensOut: 1_000_000,
      tokensEstimated: false,
      envelopeSha256: "env-hash",
    });
    // 1M in × $1.50/M + 1M out × $9.00/M = $10.50
    expect(rec.costUsd).toBeCloseTo(10.5, 10);
    expect(rec.promptSha256).toBe(sha256("SYS" + "USER"));
    expect(rec.latencyMs).toBeGreaterThanOrEqual(0);
    expect(typeof rec.ts).toBe("string");

    // o budget acumulou a chamada
    const b = budget();
    expect(b.totalUsd).toBeCloseTo(10.5, 10);
    expect(b.calls).toBe(1);
    expect(b.updatedAt).toBeTruthy();
  });

  it("sem usage na resposta, estima tokens = ceil(chars/4) e marca tokensEstimated", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => okResponse("12345678", null))); // null: sem usage (undefined ativaria o default do helper)
    const llm = createLLM({ model: "z-ai/glm-5.2", temperature: 0.1, maxTokens: 100 });
    await callLLM(llm, "abcd", "efghijkl", { runId: "run-teste" });

    const [rec] = readManifest("run-teste");
    expect(rec.tokensEstimated).toBe(true);
    expect(rec.tokensIn).toBe(Math.ceil(4 / 4) + Math.ceil(8 / 4)); // system + user
    expect(rec.tokensOut).toBe(Math.ceil(8 / 4));
  });

  it("modelo fora da tabela: costUsd null + aviso no manifesto, e NUNCA trava", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => okResponse()));
    const llm = createLLM({ model: "laboratorio/modelo-inexistente", temperature: 0.5, maxTokens: 10 });
    const out = await callLLM(llm, "S", "U", { runId: "run-teste" });
    expect(out).toBe("ok");

    const [rec] = readManifest("run-teste");
    expect(rec.costUsd).toBeNull();
    expect(rec.warning).toMatch(/sem preço na tabela PRICES/);
    // custo desconhecido conta como 0 no orçamento, mas a chamada é contada
    const b = budget();
    expect(b.totalUsd).toBe(0);
    expect(b.calls).toBe(1);
  });
});

describe("(b) trava de orçamento", () => {
  it("assertBudget lança BudgetExceededError quando budget.json já está no limite", () => {
    fs.writeFileSync(path.join(tmp, "budget.json"), JSON.stringify({ totalUsd: 50, updatedAt: null, calls: 7 }));
    expect(() => assertBudget()).toThrow(BudgetExceededError); // default 50
    expect(() => assertBudget(100)).not.toThrow();
  });

  it("callLLM para ANTES de chamar a rede (fetch nunca dispara) e não tenta fallback", async () => {
    fs.writeFileSync(path.join(tmp, "budget.json"), JSON.stringify({ totalUsd: 99, updatedAt: null, calls: 1 }));
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal("fetch", fetchMock);

    const llm = createLLM({ model: "google/gemini-3.5-flash", temperature: 0.2, maxTokens: 10 });
    await expect(callLLM(llm, "S", "U", { runId: "run-teste" })).rejects.toThrow(BudgetExceededError);
    expect(fetchMock).not.toHaveBeenCalled();
    // nada registrado: nenhuma chamada aconteceu
    expect(fs.existsSync(path.join(tmp, "manifests", "run-teste.jsonl"))).toBe(false);
  });

  it("STI_BUDGET_USD ajusta o limite (default 50)", () => {
    expect(budgetLimitUsd()).toBe(50);
    vi.stubEnv("STI_BUDGET_USD", "0.25");
    expect(budgetLimitUsd()).toBe(0.25);
    fs.writeFileSync(path.join(tmp, "budget.json"), JSON.stringify({ totalUsd: 0.3, updatedAt: null, calls: 1 }));
    expect(() => assertBudget()).toThrow(BudgetExceededError);
  });
});

describe("(c) fallback registra 2 entradas (falha + sucesso)", () => {
  it("primária falha (attempt 1) e fallback deepseek entra como attempt 2, fallbackUsed true", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(failResponse)
      .mockResolvedValueOnce(okResponse("salvou"));
    vi.stubGlobal("fetch", fetchMock);

    const llm = createLLM({ model: "google/gemini-3.5-flash", temperature: 0.2, maxTokens: 10 });
    const out = await callLLM(llm, "S", "U", { runId: "run-teste", exerciseId: "ex-02" });
    expect(out).toBe("salvou");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const recs = readManifest("run-teste");
    expect(recs).toHaveLength(2);

    expect(recs[0]).toMatchObject({
      model: "google/gemini-3.5-flash",
      attempt: 1,
      fallbackUsed: false,
      status: "error",
      tokensOut: 0,
      tokensEstimated: true,
      exerciseId: "ex-02",
    });
    expect(recs[0].error).toMatch(/OpenRouter 500/);

    expect(recs[1]).toMatchObject({
      model: "deepseek/deepseek-chat", // AGENTS.fallback_emergency
      attempt: 2,
      fallbackUsed: true,
      status: "ok",
    });
    // as duas entradas contam no budget
    expect(budget().calls).toBe(2);
  });
});

describe("(d) imagens viram content array multimodal", () => {
  it("meta.images=[png] → user vira [{text},{image_url data:image/png;base64,...}]", async () => {
    const pngPath = path.join(tmp, "recorte.png");
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    fs.writeFileSync(pngPath, pngBytes);

    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal("fetch", fetchMock);

    const llm = createLLM({ model: "google/gemini-3.5-flash", temperature: 0.2, maxTokens: 10 });
    await callLLM(llm, "S", "Descreva a reta numérica.", { runId: "run-teste", images: [pngPath] });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const userMsg = body.messages[1];
    expect(userMsg.role).toBe("user");
    expect(Array.isArray(userMsg.content)).toBe(true);
    expect(userMsg.content[0]).toEqual({ type: "text", text: "Descreva a reta numérica." });
    expect(userMsg.content[1].type).toBe("image_url");
    const url = userMsg.content[1].image_url.url;
    expect(url.startsWith("data:image/png;base64,")).toBe(true);
    // o base64 decodifica exatamente para os bytes do arquivo
    expect(Buffer.from(url.slice("data:image/png;base64,".length), "base64").equals(pngBytes)).toBe(true);
    // e a mensagem de system continua string pura
    expect(typeof body.messages[0].content).toBe("string");
  });

  it("sem meta.images, o content do user continua string (payload idêntico ao legado)", async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal("fetch", fetchMock);
    const llm = createLLM({ model: "google/gemini-3.5-flash", temperature: 0.2, maxTokens: 10 });
    await callLLM(llm, "S", "U", { runId: "run-teste" });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(typeof body.messages[1].content).toBe("string");
    expect(body.messages[1].content).toBe("U");
  });
});

describe("(e) telemetria quebrada NUNCA derruba a chamada", () => {
  it("STI_RUNS_DIR inutilizável (embaixo de um ARQUIVO) → callLLM ainda devolve o content", async () => {
    // um arquivo no lugar do diretório: mkdirSync recursivo falha com ENOTDIR
    const blocker = path.join(tmp, "bloqueio");
    fs.writeFileSync(blocker, "sou um arquivo, não um diretório");
    vi.stubEnv("STI_RUNS_DIR", path.join(blocker, "runs"));

    vi.stubGlobal("fetch", vi.fn(async () => okResponse("sobrevivi")));
    const llm = createLLM({ model: "google/gemini-3.5-flash", temperature: 0.2, maxTokens: 10 });
    const out = await callLLM(llm, "S", "U", { runId: "run-teste" });
    expect(out).toBe("sobrevivi"); // a falha de gravação virou só um warn
  });

  it("recordCall direto continua lançando (é o llm.js que decide engolir)", () => {
    const blocker = path.join(tmp, "bloqueio2");
    fs.writeFileSync(blocker, "arquivo");
    vi.stubEnv("STI_RUNS_DIR", path.join(blocker, "runs"));
    expect(() => recordCall({ model: "google/gemini-3.5-flash", tokensIn: 1, tokensOut: 1 })).toThrow();
  });
});

describe("budget.json — leitura tolerante e runId default", () => {
  it("arquivo ausente ou corrompido → estado zerado (nunca lança)", () => {
    expect(budget()).toEqual({ totalUsd: 0, updatedAt: null, calls: 0 });
    fs.writeFileSync(path.join(tmp, "budget.json"), "{lixo");
    expect(budget().totalUsd).toBe(0);
    expect(() => assertBudget()).not.toThrow();
  });

  it("runId vem do env STI_RUN_ID e, sem env, cai para 'adhoc'", () => {
    recordCall({ model: "z-ai/glm-5.2", tokensIn: 10, tokensOut: 10, status: "ok" });
    expect(fs.existsSync(path.join(tmp, "manifests", "run-teste.jsonl"))).toBe(true);

    vi.stubEnv("STI_RUN_ID", "");
    delete process.env.STI_RUN_ID; // garante ausência real
    recordCall({ model: "z-ai/glm-5.2", tokensIn: 10, tokensOut: 10, status: "ok" });
    expect(fs.existsSync(path.join(tmp, "manifests", "adhoc.jsonl"))).toBe(true);
  });

  it("runId com caracteres perigosos é sanitizado no nome do arquivo", () => {
    recordCall({ runId: "../fuga/run 1", model: "z-ai/glm-5.2", tokensIn: 1, tokensOut: 1 });
    expect(fs.existsSync(path.join(tmp, "manifests", "..-fuga-run-1.jsonl"))).toBe(true);
  });
});
