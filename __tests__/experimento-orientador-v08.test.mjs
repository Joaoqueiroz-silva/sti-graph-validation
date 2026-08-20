import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildPlan,
  acquireExecutionLock,
  cleanChildEnv,
  planText,
  reconcileBudget,
  REPO,
} from "../scripts/experimento-orientador-v08.mjs";

const temps = [];
const temp = (prefix) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temps.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("orquestrador v0.8 — plano puro e determinístico", () => {
  it("congela exatamente 105×3×2×10 pares em 132 células pequenas", () => {
    const a = buildPlan();
    const b = buildPlan();
    expect(planText(a)).toBe(planText(b));
    expect(a.design).toMatchObject({
      totalProblems: 105,
      corpora: 5,
      replicas: 10,
      cells: 132,
      rawRuns: 6300,
      materializedRuns: 6300,
      pairedGraphArtifacts: 12600,
      generationCalls: 18900,
      materializationCalls: 12600,
      logicalCalls: 31500,
    });
    expect(a.cells.every((cell) => cell.problemIds.length <= 5 && cell.nRuns <= 50)).toBe(true);
    expect(new Set(a.cells.map((cell) => cell.id)).size).toBe(132);
    expect(a.costEstimate.expectedTotalUsd).toBeCloseTo(216.4, 2);
    expect(a.costEstimate.recommendedBudgetUsd).toBe(250);
    expect(a.design.temperatures).toMatchObject({
      agent3a_advanced: 0.2,
      agent3b_atrisk: 0.7,
      agent3c_average: 0.4,
      agent6_story: 0.5,
      agent6_worker: 0.35,
    });
    expect(a.design.reasoning).toEqual({ effort: "none", exclude: true, env: "STI_SEM_RACIOCINIO=1" });
    expect(a.design.runtimeControls).toMatchObject({
      passosLivres: true,
      interfaceFixa: false,
      agent6WorkerMaxTokens: 12000,
      agent6WorkerTimeoutMs: 180000,
      misconceptionComponentBudget: 0.3,
    });
  });

  it("padrão imprime só o plano, não exige chave e não cria --out", () => {
    const root = temp("sti-v08-plan-");
    const out = path.join(root, "nao-criar");
    const env = { ...process.env, OPENROUTER_API_KEY: "" };
    const result = spawnSync(
      process.execPath,
      ["scripts/experimento-orientador-v08.mjs", "--out", out],
      { cwd: REPO, env, encoding: "utf8" }
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("SOMENTE PLANO");
    expect(result.stdout).toContain("NENHUMA CHAMADA FOI FEITA");
    expect(fs.existsSync(out)).toBe(false);
  });

  it("--executar sem budget explícito falha antes de criar saída", () => {
    const root = temp("sti-v08-no-budget-");
    const out = path.join(root, "nao-criar");
    const result = spawnSync(
      process.execPath,
      ["scripts/experimento-orientador-v08.mjs", "--executar", "--out", out],
      {
        cwd: REPO,
        env: {
          ...process.env,
          ["OPENROUTER" + "_API_KEY"]: "chave-falsa-comprida-para-preflight",
        },
        encoding: "utf8",
      }
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--budget-usd");
    expect(fs.existsSync(out)).toBe(false);
  });
});

describe("orquestrador v0.8 — ambiente hermético", () => {
  it("remove overrides host adversariais e aplica parâmetros congelados", () => {
    const hostile = {
      OPENROUTER_API_KEY: "preservar-chave",
      AGENT3A_TEMP: "1.9",
      AGENT3B_TEMP: "-5",
      AGENT3C_TEMP: "0",
      SHIM_TEMP: "2",
      STI_SEM_RACIOCINIO: "0",
      STI_PASSOS_LIVRES: "0",
      STI_INTERFACE_FIXA: "1",
      STI_INPUT_POLICY: "hostil-v9",
      STI_AGENT6_WORKER_MAX_TOKENS: "999999",
      STI_AGENT6_WORKER_TIMEOUT_MS: "1",
      STI_CATALOGO_SEM_FILTRO: "1",
      STI_DISABLE_PAYLOAD_GUARD: "1",
      STI_IMAGE_QUALITY: "ultra-hostil",
      STI_MC_BUDGET: "99",
      GEN_MODEL: "host/model",
      MODELO_ESTUDANTES: "host/outro",
      PERFIL_MODELOS: "hostil",
    };
    const env = cleanChildEnv(
      {
        AGENT3A_TEMP: "0.2",
        AGENT3B_TEMP: "0.7",
        AGENT3C_TEMP: "0.4",
        SHIM_TEMP: "0.7",
        STI_SEM_RACIOCINIO: "1",
        STI_PASSOS_LIVRES: "1",
        STI_INTERFACE_FIXA: "0",
        STI_AGENT6_WORKER_MAX_TOKENS: "12000",
        STI_AGENT6_WORKER_TIMEOUT_MS: "180000",
        STI_CATALOGO_SEM_FILTRO: "0",
        STI_DISABLE_PAYLOAD_GUARD: "0",
        STI_MC_BUDGET: "0.3",
      },
      hostile
    );
    expect(env).toMatchObject({
      OPENROUTER_API_KEY: "preservar-chave",
      AGENT3A_TEMP: "0.2",
      AGENT3B_TEMP: "0.7",
      AGENT3C_TEMP: "0.4",
      SHIM_TEMP: "0.7",
      STI_SEM_RACIOCINIO: "1",
      STI_PASSOS_LIVRES: "1",
      STI_INTERFACE_FIXA: "0",
      STI_AGENT6_WORKER_MAX_TOKENS: "12000",
      STI_AGENT6_WORKER_TIMEOUT_MS: "180000",
      STI_CATALOGO_SEM_FILTRO: "0",
      STI_DISABLE_PAYLOAD_GUARD: "0",
      STI_MC_BUDGET: "0.3",
    });
    expect(env.GEN_MODEL).toBeUndefined();
    expect(env.MODELO_ESTUDANTES).toBeUndefined();
    expect(env.PERFIL_MODELOS).toBeUndefined();
    expect(env.STI_INPUT_POLICY).toBeUndefined();
    expect(env.STI_IMAGE_QUALITY).toBeUndefined();
  });
});

describe("orquestrador v0.8 — ledger global conservador", () => {
  it("reconcilia para cima com manifests e nunca reduz gasto prévio", () => {
    const root = temp("sti-v08-budget-");
    const manifests = path.join(root, "cells", "x", "manifests");
    fs.mkdirSync(manifests, { recursive: true });
    fs.writeFileSync(
      path.join(manifests, "a.jsonl"),
      [
        JSON.stringify({ costUsd: 0.4 }),
        JSON.stringify({ costUsd: 0.6 }),
        "",
      ].join("\n")
    );
    let state = reconcileBudget(root);
    expect(state.totalUsd).toBeCloseTo(1, 12);
    expect(state.calls).toBe(2);

    fs.writeFileSync(
      path.join(root, "_budget", "budget.json"),
      JSON.stringify({ totalUsd: 1.5, calls: 3, updatedAt: "antes" })
    );
    state = reconcileBudget(root);
    expect(state.totalUsd).toBe(1.5);
    expect(state.calls).toBe(3);
  });

  it("bloqueia custo desconhecido em vez de tratá-lo como zero", () => {
    const root = temp("sti-v08-budget-unknown-");
    const manifests = path.join(root, "cells", "x", "manifests");
    fs.mkdirSync(manifests, { recursive: true });
    fs.writeFileSync(path.join(manifests, "a.jsonl"), `${JSON.stringify({ costUsd: null })}\n`);
    expect(() => reconcileBudget(root)).toThrow(/custo desconhecido/);
  });
});

describe("orquestrador v0.8 — exclusão mútua", () => {
  it("recusa lock vivo e remove somente o próprio lock", () => {
    const root = temp("sti-v08-lock-");
    const release = acquireExecutionLock(root, { retomar: false });
    expect(() => acquireExecutionLock(root, { retomar: true })).toThrow(/lock de execução ativo/);
    release();
    expect(fs.existsSync(path.join(root, ".execution.lock"))).toBe(false);
  });

  it("--retomar substitui lock local comprovadamente morto", () => {
    const root = temp("sti-v08-stale-lock-");
    fs.writeFileSync(
      path.join(root, ".execution.lock"),
      JSON.stringify({ pid: 999_999_999, host: os.hostname(), token: "antigo" })
    );
    const release = acquireExecutionLock(root, { retomar: true });
    expect(JSON.parse(fs.readFileSync(path.join(root, ".execution.lock"), "utf8")).token).not.toBe("antigo");
    release();
  });
});
