/**
 * campaign3-runner.test.mjs — Onda 3 (G10/G11, B2): chaves de ablação flag-gated,
 * neutralV1ToV2 e runner da campanha 3.
 *
 * TUDO OFFLINE (regra do repo): callLLM é mockado via vi.mock de llm.js (captura
 * system/user/meta) e o runner recebe `simulate` injetado — nenhum teste toca rede.
 *
 * O que se trava aqui:
 *   1. FLAGS DEFAULT NÃO MUDAM O BASELINE: prompt do 3b byte a byte igual com e sem
 *      os envs (snapshot do prompt default = baseline congelado da campanha 3);
 *   2. STI_ABLATE_MISCDB=1 zera o catálogo MISC_DB no prompt;
 *   3. STI_MISC_LIMIT altera SÓ a linha de quantidade de erros;
 *   4. STI_REPRESENTATION dom/screenshot (DOM truncado no problem; meta.images);
 *   5. neutralV1ToV2: caminho correto completa; wrongAnswer conhecido dá buggy;
 *   6. run-campaign3 com simulate injetado produz report c3-v2, compatível com
 *      c3-v1, com métricas e artefatos estruturados de auditoria; falha de autoria
 *      entra registrada (§6.6).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const calls = vi.hoisted(() => ({ list: [] }));

vi.mock("../llm.js", async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    createLLM: (cfg = {}) => ({ cfg: cfg.model ? cfg : { key: "fake", model: "fake/model" } }),
    getAgentConfig: (key = "agent3b_atrisk") => ({
      key,
      role: "generator",
      provider: "test",
      model: "fake/model",
      temperature: 0.7,
      maxTokens: 1000,
    }),
    callLLM: vi.fn(async (llm, system, user, meta) => {
      calls.list.push({ system, user, meta });
      return JSON.stringify({ studentProfile: "x", solutions: [] });
    }),
  };
});

import { agent3b_atRiskStudent } from "../agents3-students.js";
import { simulateStudentsReal, applyRepresentation } from "../simulate-students-real.js";
import { neutralV1ToV2, correctTraceFromV1 } from "../neutral-v1-to-v2.js";
import { executeTrace } from "../trace-executor.js";
import { parseBrdToExpertNeutral } from "../parse-ctat-brd.js";
import {
  runCampaign3,
  C3_SCHEMA_VERSION,
  C3_SCHEMA_COMPATIBLE_WITH,
  C3_AUDIT_SCHEMA_VERSION,
  C3_RETENTION_POLICY,
} from "../run-campaign3.mjs";
import { sha256 } from "../exec-manifest.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CORPUS = path.join(HERE, "../cases/ctat-6.17");

// discipline SEM acento de propósito: as chaves do MISC_DB são "matematica:8-12"
// (gotcha do acento — ver comentário datado em agents3-students.js).
const baseState = () => ({
  seedProblems: [{ problemId: 1, statement: "Marque 1/4 na reta", correctAnswer: "1/4" }],
  discipline: "matematica",
  topic: "frações na reta",
  difficulty: "medium",
  ageGroup: "11",
  knowledgeComponents: [{ id: "kc_frac", name: "Frações" }],
  sessionId: null,
});

const lastPromptOf = (agent) => calls.list.filter((c) => c.meta?.agent === agent).at(-1);

beforeEach(() => {
  calls.list.length = 0;
  // Isola do shell: "" = default em todos os leitores de flag.
  vi.stubEnv("STI_ABLATE_MISCDB", "");
  vi.stubEnv("STI_MISC_LIMIT", "");
  vi.stubEnv("STI_REPRESENTATION", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ───────────────────── 1. flags default = baseline congelado ─────────────────────

describe("chaves de ablação — default não muda o baseline", () => {
  it("prompt do 3b é byte a byte o mesmo sem envs e com os valores-default explícitos", async () => {
    await agent3b_atRiskStudent(baseState());
    const semEnv = lastPromptOf("agent3b_atrisk");

    vi.stubEnv("STI_ABLATE_MISCDB", "0");
    vi.stubEnv("STI_MISC_LIMIT", "3");
    vi.stubEnv("STI_REPRESENTATION", "text");
    await agent3b_atRiskStudent(baseState());
    const comEnv = lastPromptOf("agent3b_atrisk");

    expect(comEnv.system).toBe(semEnv.system);
    expect(comEnv.user).toBe(semEnv.user);
    // meta default = exatamente o contrato anterior (sem chaves novas)
    expect(semEnv.meta).toEqual({ agent: "agent3b_atrisk", sessionId: null });
    // snapshot = o baseline congelado; se este snapshot mudar SEM flag, o default quebrou
    expect(semEnv.system).toMatchSnapshot("prompt-3b-default");
  });

  it("simulateStudentsReal default: seed inalterado e meta sem campos extras", async () => {
    await simulateStudentsReal(
      { problem: "Enunciado puro", correctAnswer: "1/4", components: [] },
      {}
    );
    const c = lastPromptOf("agent3b_atrisk");
    expect(c.meta).toEqual({ agent: "agent3b_atrisk", sessionId: null });
    expect(c.user).toContain("Enunciado puro");
    expect(c.user).not.toContain("INTERFACE (interface.html cru");
  });
});

// ───────────────────── 2. STI_ABLATE_MISCDB ─────────────────────

describe("STI_ABLATE_MISCDB", () => {
  it("default: o catálogo MISC_DB entra no prompt do 3b (matematica:8-12)", async () => {
    await agent3b_atRiskStudent(baseState());
    expect(lastPromptOf("agent3b_atrisk").system).toContain("MISCONCEPTIONS CONHECIDAS");
  });

  it("=1 zera o catálogo (bloco some do prompt)", async () => {
    vi.stubEnv("STI_ABLATE_MISCDB", "1");
    await agent3b_atRiskStudent(baseState());
    expect(lastPromptOf("agent3b_atrisk").system).not.toContain("MISCONCEPTIONS CONHECIDAS");
  });
});

// ───────────────────── 3. STI_MISC_LIMIT ─────────────────────

describe("STI_MISC_LIMIT", () => {
  /** linhas que diferem entre dois prompts (mesmo nº de linhas por construção). */
  const diffLines = (a, b) => {
    const A = a.split("\n");
    const B = b.split("\n");
    expect(A.length).toBe(B.length);
    return A.map((l, i) => [l, B[i]]).filter(([x, y]) => x !== y);
  };

  it('"6" e "saturate" alteram SÓ a linha de quantidade de erros', async () => {
    await agent3b_atRiskStudent(baseState());
    const def = lastPromptOf("agent3b_atrisk").system;
    expect(def).toContain("faca 2-3 TENTATIVAS");

    vi.stubEnv("STI_MISC_LIMIT", "6");
    await agent3b_atRiskStudent(baseState());
    const six = lastPromptOf("agent3b_atrisk").system;
    const d6 = diffLines(def, six);
    expect(d6).toHaveLength(1);
    expect(d6[0][1]).toContain("faca 6 TENTATIVAS");

    vi.stubEnv("STI_MISC_LIMIT", "saturate");
    await agent3b_atRiskStudent(baseState());
    const sat = lastPromptOf("agent3b_atrisk").system;
    const dSat = diffLines(def, sat);
    expect(dSat).toHaveLength(1);
    expect(dSat[0][1]).toContain("TODAS as respostas erradas plausiveis");
  });
});

// ───────────────────── 4. STI_REPRESENTATION ─────────────────────

describe("STI_REPRESENTATION", () => {
  it('"dom": o problem do seed ganha o interface.html cru, truncado a 8k chars', async () => {
    vi.stubEnv("STI_REPRESENTATION", "dom");
    // HTML injetado > 8k para exercitar a truncagem sem depender do tamanho do corpus
    const bigHtml = "<div class=\"CTATTextField\">" + "x".repeat(10000) + "</div>";
    const { iface, images } = applyRepresentation(
      { problem: "Enunciado X", correctAnswer: "1/4", components: [] },
      { interfaceHtml: bigHtml }
    );
    expect(images).toBeNull();
    expect(iface.problem).toContain("Enunciado X");
    expect(iface.problem).toContain("CTATTextField");
    const anexo = iface.problem.split("===\n")[1];
    expect(anexo.length).toBe(8192); // truncado exatamente no teto

    // e o anexo chega ao prompt dos agentes (viaja pelo seedProblems)
    await simulateStudentsReal(
      { problem: "Enunciado X", correctAnswer: "1/4", components: [] },
      { corpusDir: CORPUS }
    );
    expect(lastPromptOf("agent3b_atrisk").user).toContain("CTATTextField");
  });

  it('"screenshot": meta.images = screenshotPath do envelope resolvido contra o corpusDir', async () => {
    vi.stubEnv("STI_REPRESENTATION", "screenshot");
    await simulateStudentsReal(
      {
        problem: "p",
        correctAnswer: "1/5",
        components: [],
        screenshotPath: "_interface/screenshot.png",
      },
      { corpusDir: CORPUS, exerciseId: "00bubble", envelopeSha256: "sha-do-envelope" }
    );
    const c = lastPromptOf("agent3b_atrisk");
    expect(c.meta.images).toEqual([path.join(CORPUS, "_interface/screenshot.png")]);
    // metadados do manifesto (contrato do B1) chegam à meta do callLLM
    expect(c.meta.exerciseId).toBe("00bubble");
    expect(c.meta.envelopeSha256).toBe("sha-do-envelope");
  });
});

// ───────────────────── 5. neutralV1ToV2 ─────────────────────

describe("neutralV1ToV2 — sanidade comportamental", () => {
  const v1 = {
    meta: { problem: "marque 1/4" },
    steps: [
      { answer: "4", kc: "kc_den", order: 1 },
      { answer: "1/4", kc: "kc_ponto", order: 2 },
    ],
    misconceptions: [
      { wrongAnswer: "3/4", stepKey: "1/4", feedback: "olhe o numerador" }, // ancorada no passo 2
      { wrongAnswer: "4/4", stepKey: null, feedback: "sem âncora" }, // → estado do 1º passo
    ],
    transitions: [],
    hintsPerCorrectStep: [["conte as divisões"], []],
  };

  it("executeTrace do caminho correto completa", () => {
    const v2 = neutralV1ToV2(v1, { source: "robo" });
    expect(v2.schemaVersion).toBe(2);
    const res = executeTrace(v2, correctTraceFromV1(v1));
    expect(res.steps.map((s) => s.verdict)).toEqual(["correct", "correct"]);
    expect(res.completed).toBe(true);
    // dicas do v1 viram hints[] da transição correct do passo correspondente
    const t1 = v2.transitions.find((t) => t.id === "t_correct_1");
    expect(t1.hints).toEqual(["conte as divisões"]);
    expect(t1.matchRule).toBe("semantic");
  });

  it("wrongAnswer conhecido dá veredito buggy no contexto do passo ancorado", () => {
    const v2 = neutralV1ToV2(v1);
    const res = executeTrace(v2, [
      { selection: "resposta", action: "input", input: "4" }, // passo 1 correto
      { selection: "resposta", action: "input", input: "3/4" }, // erro catalogado do passo 2
    ]);
    expect(res.steps.at(-1).verdict).toBe("buggy");
    expect(res.steps.at(-1).feedback).toBe("olhe o numerador");
  });

  it("misconception sem âncora é reconhecida no estado do primeiro passo", () => {
    const v2 = neutralV1ToV2(v1);
    const res = executeTrace(v2, [{ selection: "resposta", action: "input", input: "4/4" }]);
    expect(res.steps[0].verdict).toBe("buggy");
  });

  it("round-trip com um grafo REAL: expert v1 → v2 executa o próprio caminho correto", () => {
    const brd = fs.readFileSync(path.join(CORPUS, "00bubble/expert.brd"), "utf8");
    const expertV1 = parseBrdToExpertNeutral(brd);
    const v2 = neutralV1ToV2(expertV1, { exercise: "00bubble" });
    const res = executeTrace(v2, correctTraceFromV1(expertV1));
    expect(res.completed).toBe(true);
    expect(res.steps.every((s) => s.verdict === "correct")).toBe(true);
    // e um wrongAnswer conceitual do catálogo do especialista é reconhecido
    const conceptual = expertV1.misconceptions.find((m) => !m.mechanical);
    expect(conceptual).toBeTruthy();
    const bug = executeTrace(v2, [
      { selection: "resposta", action: "input", input: conceptual.wrongAnswer },
    ]);
    expect(bug.steps[0].verdict).toBe("buggy");
  });
});

// ───────────────────── 6. run-campaign3 ─────────────────────

describe("run-campaign3 — runner com simulate injetado (offline)", () => {
  const fakeSimulate = async (iface) => ({
    correctPath: [
      { kc: "kc_setup", selection: "numline", action: "define o máximo", result: "1" },
      { kc: "kc_ponto", selection: "numline", action: "marca o ponto", result: iface.correctAnswer },
    ],
    misconceptions: [
      {
        step: 2,
        id: "misc_inverte",
        selection: "numline",
        type: "conceptual",
        wrongAnswer: "2/5",
        description: "confundiu numerador e denominador",
        feedback: "olhe de novo o numerador",
      },
    ],
    hints: [{ step: 2, text: "conte as divisões da reta" }],
  });

  it("produz report c3-v2 auditável e compatível com c3-v1 (1 exercício)", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "c3-"));
    const { reports } = await runCampaign3({
      condition: "teste",
      replicas: 1,
      limit: 1,
      outDir: tmp,
      model: "fake/model",
      simulate: fakeSimulate,
    });

    expect(reports).toHaveLength(1);
    const rep = reports[0].report;
    expect(rep.schemaVersion).toBe(C3_SCHEMA_VERSION);
    expect(rep.schemaCompatibleWith).toEqual([...C3_SCHEMA_COMPATIBLE_WITH]);
    expect(rep.retentionPolicy).toEqual(C3_RETENTION_POLICY);
    expect(rep.retentionPolicy.rawModelResponseTextRetained).toBe(false);
    expect(rep.condition).toBe("teste");
    expect(rep.model).toBe("fake/model");
    expect(rep.manifestRunId).toBe("teste-r1");
    expect(rep.flags).toEqual({
      model: "fake/model",
      singleCall: false,
      miscDb: "on",
      miscLimit: "3",
      representation: "text",
      discipline: null,
    });

    expect(rep.cases).toHaveLength(1);
    const c = rep.cases[0];
    expect(c.id).toBe("00bubble"); // 1º exercício do answer-key
    expect(c.status).toBe("ok");
    expect(c.envelopeSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(c.robotMisconceptions).toContain("2/5");
    expect(c.intrinsic.hallucinationFlag).toBe(false);

    // legadas por valor (compareGraphs contra o Envelope B)
    const L = c.metrics.legacy;
    for (const k of ["recallMisconceptions", "recallMisconceptionsConceptual", "recallSteps", "f1"]) {
      expect(L[k]).toBeGreaterThanOrEqual(0);
      expect(L[k]).toBeLessThanOrEqual(1);
    }
    expect(Array.isArray(c.missing)).toBe(true);
    expect(Array.isArray(c.extra)).toBe(true);
    expect(c.extra).toContain("2/5"); // o erro do robô não está no catálogo do especialista

    // comportamentais (traceConformance sobre a bateria congelada)
    const B = c.metrics.behavioral;
    expect(B.n).toBeGreaterThan(0);
    for (const k of ["rBug", "rOk", "agreement"]) {
      expect(B[k]).toBeGreaterThanOrEqual(0);
      expect(B[k]).toBeLessThanOrEqual(1);
    }
    expect(B.confusion.correct).toBeDefined();
    expect(B.confusion["no-match"]).toBeDefined();

    // c3-v2 retém os artefatos estruturados necessários para recomputar as métricas.
    const A = c.audit;
    expect(A.schemaVersion).toBe(C3_AUDIT_SCHEMA_VERSION);
    expect(A.robot.graph.nodes.length).toBeGreaterThan(0);
    expect(A.robot.graph.edges.length).toBeGreaterThan(0);
    expect(A.robot.neutral.steps.length).toBeGreaterThan(0);
    expect(A.robot.traces.correctPath).toHaveLength(2);
    expect(A.robot.traces.misconceptions[0].wrongAnswer).toBe("2/5");
    expect(A.robot.neutralV2.schemaVersion).toBe(2);
    expect(A.reference.neutralV2.schemaVersion).toBe(2);
    expect(A.traceConformance.items.length).toBeGreaterThan(0);
    expect(A.traceConformance.items[0]).toEqual(
      expect.objectContaining({ id: expect.any(String), expert: expect.any(Array), robot: expect.any(Array) })
    );
    expect(A.intrinsic.hard).toEqual(expect.objectContaining({ orphanEdges: expect.any(Array) }));
    expect(A.intrinsic.soft).toEqual(expect.objectContaining({ overBranchingSteps: expect.any(Array) }));
    for (const digest of Object.values(A.hashes)) expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(A.hashes.robotGraphSha256).toBe(sha256(JSON.stringify(A.robot.graph)));
    expect(A.hashes.traceConformanceSha256).toBe(
      sha256(JSON.stringify(A.traceConformance))
    );
    expect(A).not.toHaveProperty("rawModelResponse");
    expect(A).not.toHaveProperty("systemPrompt");

    // relatório persistido no formato combinado
    const onDisk = JSON.parse(
      fs.readFileSync(path.join(tmp, "report-c3-teste-1.json"), "utf8")
    );
    expect(onDisk.schemaVersion).toBe(C3_SCHEMA_VERSION);
    expect(onDisk.schemaCompatibleWith).toEqual(["c3-v1"]);
    expect(onDisk.cases[0].audit.robot.traces).toEqual(A.robot.traces);
    expect(onDisk.cases[0].audit.traceConformance.items.length).toBe(A.traceConformance.items.length);
    expect(onDisk.cases[0].id).toBe("00bubble");
  });

  it("falha de autoria entra REGISTRADA com metrics null (§6.6 — nunca some)", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "c3-falha-"));
    const boom = async () => {
      throw new Error("LLM caiu");
    };
    const { reports } = await runCampaign3({
      condition: "falha",
      replicas: 1,
      limit: 2,
      outDir: tmp,
      model: "fake/model",
      simulate: boom,
    });
    const cases = reports[0].report.cases;
    expect(cases).toHaveLength(2); // nenhum exercício excluído
    for (const c of cases) {
      expect(c.status).toBe("falha-autoria");
      expect(c.metrics).toBeNull();
      expect(c.audit).toBeNull();
      expect(c.error).toContain("LLM caiu");
    }
  });

  it("falha posterior preserva os artefatos produzidos antes dela", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "c3-falha-metricas-"));
    const { reports } = await runCampaign3({
      condition: "falha-metricas",
      replicas: 1,
      limit: 1,
      outDir: tmp,
      batteryDir: path.join(tmp, "bateria-ausente"),
      model: "fake/model",
      simulate: fakeSimulate,
    });

    const c = reports[0].report.cases[0];
    expect(c.status).toBe("falha-metricas");
    expect(c.metrics).toBeNull();
    expect(c.audit.robot.graph.nodes.length).toBeGreaterThan(0);
    expect(c.audit.robot.traces.correctPath).toHaveLength(2);
    expect(c.audit.robot.neutralV2.schemaVersion).toBe(2);
    expect(c.audit.reference.neutralV2.schemaVersion).toBe(2);
    expect(c.audit.traceConformance).toBeNull();
    expect(c.audit.hashes.traceConformanceSha256).toBeNull();
  });
});
