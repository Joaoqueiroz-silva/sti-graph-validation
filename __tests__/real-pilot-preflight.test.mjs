import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import { afterEach, describe, expect, it } from "vitest";
import {
  EXPECTED_CONFIGS,
  EXPECTED_FIXTURE_MANIFEST_SHA256,
  assertKeyReady,
  captureProductionPromptManifest,
  costFromUsage,
  extractUsage,
  forceAndAttestSingleAttempt,
  runOfflinePreflight,
  verifyDurablePromptManifest,
} from "../production-fidelity/real-pilot-runner.mjs";

const dirs = [];
const fixtureSource = path.resolve("production-fidelity/fixtures");
const stateFiles = [
  "ctat-production-state-batch-01.json",
  "ctat-production-state-batch-02.json",
  "ctat-production-state-batch-03.json",
];

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function tempLayout({ readOnlyInput = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "c4-preflight-"));
  dirs.push(root);
  const inputDir = path.join(root, "input");
  const outputDir = path.join(root, "output");
  const appDir = path.join(root, "app");
  fs.mkdirSync(inputDir);
  fs.mkdirSync(outputDir);
  fs.mkdirSync(appDir);
  for (const filename of ["manifest.json", ...fs.readdirSync(fixtureSource).filter((name) => name.endsWith(".json"))]) {
    fs.copyFileSync(path.join(fixtureSource, filename), path.join(inputDir, filename));
  }
  const sourcePath = path.join(appDir, "frozen-source.js");
  fs.writeFileSync(sourcePath, "export const frozen = true;\n", { mode: 0o600 });
  if (readOnlyInput) {
    for (const filename of fs.readdirSync(inputDir)) fs.chmodSync(path.join(inputDir, filename), 0o444);
    fs.chmodSync(inputDir, 0o555);
  }
  return {
    root,
    inputDir,
    outputDir,
    sourcePath,
    expectedFiles: { frozenSource: { path: sourcePath, sha256: sha256File(sourcePath) } },
  };
}

function testDependencies({ doubleInvokeAgent = null } = {}) {
  const requestStorage = new AsyncLocalStorage();
  class FakeChatOpenAI {
    constructor(config) {
      this.model = config.model;
      this.temperature = config.temperature;
      this.maxTokens = config.maxTokens;
      // Reproduz o bug congelado: o pipeline transforma env 0 em 2.
      this.maxRetries = 2;
      this.caller = { maxRetries: 2 };
      this.configuration = { maxRetries: 2 };
    }

    async invoke() {
      throw new Error("o invoke original jamais deve alcançar transporte no pré-flight");
    }
  }

  const invokeFor = (agentKey) => async (state) => {
    const config = EXPECTED_CONFIGS[agentKey];
    const client = new FakeChatOpenAI(config);
    const context = requestStorage.getStore();
    const messages = [
      { _getType: () => "system", content: `system:${agentKey}:${context.outputLanguageDirective}` },
      { _getType: () => "human", content: `user:${state.sessionId}:${state.seedProblems.length}` },
    ];
    const response = await client.invoke(messages);
    if (doubleInvokeAgent === agentKey) await client.invoke(messages);
    return JSON.parse(response.content);
  };

  return {
    ChatOpenAI: FakeChatOpenAI,
    agents: {
      agent3a_advancedStudent: invokeFor("agent3a"),
      agent3b_atRiskStudent: invokeFor("agent3b"),
      agent3c_averageStudent: invokeFor("agent3c"),
    },
    requestContext: {
      runWithRequestContext: (context, fn) => requestStorage.run(context, fn),
    },
    languageConfig: {
      resolveOutputLanguage: () => ({ code: "pt-BR", name: "Português", directive: "RESPONDA EM PT-BR" }),
    },
  };
}

function options(layout, overrides = {}) {
  const env = {
    C4_EXPECTED_IMAGE: "sha256:test-image",
    C4_STATE_FILES: stateFiles.join(","),
    LLM_MAX_RETRIES: "0",
    STI_DISABLE_GENERATION_CACHE: "1",
  };
  return {
    env,
    inputDir: layout.inputDir,
    outputDir: layout.outputDir,
    expectedImage: "sha256:test-image",
    expectedFiles: layout.expectedFiles,
    expectedConfigs: EXPECTED_CONFIGS,
    expectedManifestSha256: EXPECTED_FIXTURE_MANIFEST_SHA256,
    registryModule: {
      getAgentConfig: (key) => {
        const expected = Object.values(EXPECTED_CONFIGS).find((item) => item.registryKey === key);
        return { ...expected };
      },
    },
    promptDependencies: testDependencies(),
    ...overrides,
  };
}

afterEach(() => {
  for (const root of dirs.splice(0)) {
    try {
      const input = path.join(root, "input");
      if (fs.existsSync(input)) {
        fs.chmodSync(input, 0o755);
        for (const filename of fs.readdirSync(input)) fs.chmodSync(path.join(input, filename), 0o644);
      }
    } catch {
      // limpeza best-effort
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("C4_PREFLIGHT_ONLY offline", () => {
  it("valida fontes/config/fixtures/mounts e congela nove prompts sem credencial, fetch ou chamada real", async () => {
    const layout = tempLayout();
    let fetchCalls = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      throw new Error("rede proibida no teste");
    };
    try {
      const result = await runOfflinePreflight(options(layout));
      expect(fetchCalls).toBe(0);
      expect(result.artifact).toMatchObject({
        mode: "offline-preflight",
        status: "passed",
        guarantees: {
          credentialRequired: false,
          credentialRead: false,
          networkAttempted: false,
          mockedInvokeCount: 9,
          realLlmInvocationCount: 0,
          paidCallCount: 0,
        },
      });
      expect(result.promptManifest.entries).toHaveLength(9);
      expect(result.promptManifest.entries.map((entry) => entry.agentKey)).toEqual([
        "agent3a", "agent3b", "agent3c",
        "agent3a", "agent3b", "agent3c",
        "agent3a", "agent3b", "agent3c",
      ]);
      expect(result.promptManifest.entries.every((entry) => entry.messagesSha256.length === 64)).toBe(true);
      expect(result.promptManifest.entries.every((entry) => entry.retryAttestation.after.caller === 0)).toBe(true);
      expect(fs.existsSync(result.outputPath)).toBe(true);
      expect(fs.readdirSync(layout.inputDir).some((name) => name.startsWith(".c4-preflight"))).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("falha antes de importar/executar agentes quando a entrada está gravável", async () => {
    const layout = tempLayout({ readOnlyInput: false });
    let agentCalls = 0;
    const deps = testDependencies();
    const original = deps.agents.agent3a_advancedStudent;
    deps.agents.agent3a_advancedStudent = async (...args) => {
      agentCalls += 1;
      return original(...args);
    };
    await expect(runOfflinePreflight(options(layout, { promptDependencies: deps }))).rejects.toThrow(
      /somente para leitura/
    );
    expect(agentCalls).toBe(0);
  });

  it("bloqueia manifesto de fixtures alterado antes da captura de prompts", async () => {
    const layout = tempLayout({ readOnlyInput: false });
    const manifestPath = path.join(layout.inputDir, "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    manifest.dataset = "adulterado";
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);
    for (const filename of fs.readdirSync(layout.inputDir)) fs.chmodSync(path.join(layout.inputDir, filename), 0o444);
    fs.chmodSync(layout.inputDir, 0o555);
    await expect(runOfflinePreflight(options(layout))).rejects.toThrow(/Hash do manifesto/);
  });

  it("bloqueia segundo invoke/fallback ainda no caminho sintético", async () => {
    const layout = tempLayout();
    await expect(
      runOfflinePreflight(
        options(layout, { promptDependencies: testDependencies({ doubleInvokeAgent: "agent3a" }) })
      )
    ).rejects.toThrow(/C4_OFFLINE_FALLBACK_OR_EXTRA_INVOKE_BLOCKED/);
  });
});

describe("identidade durável e retry", () => {
  it("aceita o manifesto recém-gravado e rejeita identidade de prompt divergente", async () => {
    const layout = tempLayout();
    const result = await runOfflinePreflight(options(layout));
    expect(
      verifyDurablePromptManifest({
        manifestPath: result.outputPath,
        currentPromptManifest: result.promptManifest,
      }).fileSha256
    ).toHaveLength(64);
    const divergent = {
      ...result.promptManifest,
      entriesSha256: "0".repeat(64),
    };
    expect(() =>
      verifyDurablePromptManifest({
        manifestPath: result.outputPath,
        currentPromptManifest: divergent,
      })
    ).toThrow(/Identidade de prompt divergiu/);
  });

  it("força todas as camadas conhecidas a zero e uma falha gera exatamente uma tentativa de transporte", async () => {
    const client = {
      maxRetries: 2,
      caller: { maxRetries: 2 },
      clientConfig: { maxRetries: 2 },
    };
    const attestation = forceAndAttestSingleAttempt(client);
    expect(attestation.before).toMatchObject({ topLevel: 2, caller: 2, clientConfig: 2 });
    expect(attestation.after).toMatchObject({ topLevel: 0, caller: 0, clientConfig: 0 });
    let transportAttempts = 0;
    const failingTransportWithCallerPolicy = async () => {
      for (let attempt = 0; attempt <= client.caller.maxRetries; attempt += 1) {
        transportAttempts += 1;
        try {
          throw new Error("falha simulada");
        } catch (error) {
          if (attempt === client.caller.maxRetries) throw error;
        }
      }
    };
    await expect(failingTransportWithCallerPolicy()).rejects.toThrow(/falha simulada/);
    expect(transportAttempts).toBe(1);
  });

  it("captura usage real e custo aninhado do provedor sem cair em estimativa", () => {
    const usage = extractUsage({
      usage_metadata: { input_tokens: 1234, output_tokens: 567 },
      response_metadata: { usage: { cost: "0.01234567" } },
    });
    expect(usage).toEqual({
      promptTokens: 1234,
      completionTokens: 567,
      estimated: false,
      providerCostUsd: 0.01234567,
      source: "AIMessage.usage_metadata",
    });
    expect(costFromUsage(usage)).toBeCloseTo((1234 * 1.5 + 567 * 9) / 1_000_000, 12);
    expect(extractUsage({ response_metadata: { estimatedTokenUsage: { promptTokens: "?" } } })).toBeNull();
  });
});

describe("readiness sanitizado da chave", () => {
  const requiredWorstCaseUsd = 1.782;

  it("aprova a chave Google correspondente quando HTTP está ok e o saldo cobre o plano", () => {
    const secret = "segredo-que-nao-pode-sair";
    const readiness = assertKeyReady({
      snapshots: [{ label: "google", ok: true, status: 200, limit_remaining: 2.25 }],
      env: { OPENROUTER_API_KEY_GOOGLE: secret, OPENROUTER_API_KEY: "outra" },
      requiredWorstCaseUsd,
    });
    expect(readiness).toMatchObject({
      status: "ready",
      credentialLabel: "google",
      httpOk: true,
      limitRemainingUsd: 2.25,
      limitCoverage: "sufficient",
    });
    expect(JSON.stringify(readiness)).not.toContain(secret);
  });

  it("usa default somente quando a chave específica Google não foi fornecida", () => {
    expect(
      assertKeyReady({
        snapshots: [{ label: "default", ok: true, status: 200, limit_remaining: "2.00" }],
        env: { OPENROUTER_API_KEY: "default-secreta" },
        requiredWorstCaseUsd,
      })
    ).toMatchObject({ credentialLabel: "default", limitRemainingUsd: 2, limitCoverage: "sufficient" });
  });

  it("bloqueia 401/erro e não aceita snapshot de outra chave", () => {
    const secret = "nao-vazar-401";
    let failure;
    try {
      assertKeyReady({
        snapshots: [{ label: "google", ok: false, status: 401 }],
        env: { OPENROUTER_API_KEY_GOOGLE: secret },
        requiredWorstCaseUsd,
      });
    } catch (error) {
      failure = error;
    }
    expect(failure?.message).toMatch(/não aprovada.*HTTP 401/);
    expect(failure?.message).not.toContain(secret);
    expect(() =>
      assertKeyReady({
        snapshots: [{ label: "default", ok: true, status: 200, limit_remaining: 10 }],
        env: { OPENROUTER_API_KEY_GOOGLE: secret },
        requiredWorstCaseUsd,
      })
    ).toThrow(/Snapshot da credencial google não foi obtido/);
  });

  it("bloqueia saldo numérico insuficiente pelo pior caso congelado", () => {
    expect(() =>
      assertKeyReady({
        snapshots: [{ label: "google", ok: true, status: 200, limit_remaining: 1.781999 }],
        env: { OPENROUTER_API_KEY_GOOGLE: "x" },
        requiredWorstCaseUsd,
      })
    ).toThrow(/Saldo técnico insuficiente/);
  });

  it("quando limit_remaining é ausente ou null, registra a ausência sem presumir saldo", () => {
    for (const snapshot of [
      { label: "google", ok: true, status: 200 },
      { label: "google", ok: true, status: 200, limit_remaining: null },
    ]) {
      const readiness = assertKeyReady({
        snapshots: [snapshot],
        env: { OPENROUTER_API_KEY_GOOGLE: "x" },
        requiredWorstCaseUsd,
      });
      expect(readiness).toMatchObject({
        status: "ready",
        limitRemainingUsd: null,
        limitCoverage: "not-reported",
      });
      expect(readiness.note).toMatch(/nenhum saldo foi presumido/);
    }
  });

  it("falha fechado para limit_remaining presente porém não numérico", () => {
    expect(() =>
      assertKeyReady({
        snapshots: [{ label: "google", ok: true, status: 200, limit_remaining: "desconhecido" }],
        env: { OPENROUTER_API_KEY_GOOGLE: "x" },
        requiredWorstCaseUsd,
      })
    ).toThrow(/limit_remaining inválido/);
  });
});
