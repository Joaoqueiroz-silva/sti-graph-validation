#!/usr/bin/env node
/**
 * Preflight completamente offline do braço B.
 *
 * O modo padrão é `mock`: não importa llm.js/pipeline-core, não acessa a rede e
 * registra explicitamente zero chamadas pagas. O modo real é apenas uma trava de
 * interface para implementação futura: exige `--allow-real` e, mesmo autorizado,
 * encerra informando que nenhum adaptador pago foi implementado neste repositório.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  EQUIVALENCE_MANIFEST_VERSION,
  PRODUCTION_SOURCE_FILES,
  assertProductionState,
  evaluateEquivalence,
  fingerprintPrompt,
  projectAgentState,
  sha256,
  sha256Json,
} from "./equivalence-gate.mjs";

export class RealExecutionDisabledError extends Error {
  constructor(message) {
    super(message);
    this.name = "RealExecutionDisabledError";
  }
}

export function createExampleProductionState() {
  const kc = {
    id: "kc_fraction_unit",
    name: "Reconhecer fração unitária",
    description: "Relacionar uma parte ao total de partes iguais.",
    difficulty: "medium",
    prerequisites: [],
    masteryThreshold: 0.85,
  };
  const strategies = ["polya", "exemplo_trabalhado", "problema_invertido", "descoberta_guiada"];
  return {
    schemaVersion: "educaoff-agent3-state-v1",
    discipline: "matematica",
    topic: "frações unitárias",
    difficulty: "medium",
    ageGroup: "11",
    knowledgeComponents: [kc],
    seedProblems: strategies.map((strategy, i) => ({
      id: i + 1,
      strategy,
      statement: `Problema-semente ${i + 1} sobre uma parte de cinco partes iguais.`,
      expectedAnswer: "1/5",
      kcsInvolved: [kc.id],
      solutionSteps: [
        { step: 1, action: "Identificar a parte e o total", result: "1/5", kc: kc.id },
      ],
      difficulty: "medium",
      context: `contexto-${i + 1}`,
    })),
    interfaceSpec: { profile: "reader" },
    masterGraphContext: {},
    sessionId: "offline-preflight",
  };
}

function mockPrompts(agentState) {
  const seedJson = JSON.stringify(agentState.seedProblems);
  const kcList = agentState.knowledgeComponents.map((kc) => `${kc.id}:${kc.name}`).join("\n");
  const shared = [
    `Disciplina: ${agentState.discipline}`,
    `Tópico: ${agentState.topic}`,
    `Dificuldade: ${agentState.difficulty}`,
    `Faixa etária: ${agentState.ageGroup}`,
    `Seeds: ${seedJson}`,
    `KCs: ${kcList}`,
  ].join("\n");
  return {
    agent3a: {
      system: "MOCK OFFLINE — aluno avançado; não é o prompt de produção.",
      user: shared,
    },
    agent3b: {
      system: "MOCK OFFLINE — aluno em risco; não é o prompt de produção.",
      user: shared,
    },
    agent3c: {
      system: "MOCK OFFLINE — aluno médio; não é o prompt de produção.",
      user: shared,
    },
  };
}

function mockTraces(agentState) {
  const seed = agentState.seedProblems[0];
  const solutionTrace = seed.solutionSteps.map((step) => ({
    step: step.step,
    action: step.action,
    result: step.result,
    kcUsed: step.kc,
    isCorrect: true,
  }));
  return {
    advancedTrace: {
      studentProfile: "advanced-mock",
      solutions: [{ problemId: seed.id, solutionTrace }],
    },
    atRiskTrace: {
      studentProfile: "at-risk-mock",
      solutions: [
        {
          problemId: seed.id,
          attempts: [
            {
              solutionTrace: [
                {
                  step: 1,
                  kcUsed: solutionTrace[0].kcUsed,
                  isCorrect: false,
                  error: {
                    misconceptionId: "mock_misc_1",
                    type: "conceptual_error",
                    wrongAnswer: "5/1",
                    description: "Saída sintética para testar o encanamento.",
                    diagnosticQuestion: "Qual número representa o total?",
                    feedback: "Observe novamente a relação parte-total.",
                    howToFix: "Coloque o total no denominador.",
                    severity: "moderate",
                  },
                },
              ],
            },
          ],
        },
      ],
    },
    averageTrace: {
      studentProfile: "average-mock",
      solutions: [
        {
          problemId: seed.id,
          solutionTrace: [
            {
              step: 1,
              kcUsed: solutionTrace[0].kcUsed,
              hesitation: true,
              hintsNeeded: [
                { level: 1, message: "Pense em quantas partes iguais existem." },
                { level: 2, message: "Relacione uma parte ao total." },
              ],
            },
          ],
        },
      ],
    },
  };
}

function mockGraphForge(agentState, traces) {
  const steps = traces.advancedTrace.solutions[0].solutionTrace.map((step, i) => ({
    index: i + 1,
    kc: step.kcUsed,
    action: step.action,
    result: step.result,
  }));
  const config = {
    steps,
    misconceptions: [[{
      id: "mock_misc_1",
      type: "conceptual_error",
      wrongAnswer: "5/1",
      description: "Saída sintética para testar o encanamento.",
      feedback: "Observe novamente a relação parte-total.",
      severity: "moderate",
    }]],
    hints: [["Pense em quantas partes iguais existem.", "Relacione uma parte ao total."]],
    kcs: agentState.knowledgeComponents,
    profile: agentState.interfaceSpec.profile,
    difficulty: agentState.difficulty,
  };
  const graph = {
    nodes: [
      { id: "start", type: "start" },
      ...steps.map((step) => ({
        id: `step_${step.index}`,
        type: "step",
        knowledgeComponents: [step.kc],
        expectedInput: { value: step.result },
      })),
      { id: "goal", type: "goal" },
    ],
    edges: [
      { from: "start", to: "step_1", condition: "default" },
      ...steps.map((step, i) => ({
        from: `step_${step.index}`,
        to: i === steps.length - 1 ? "goal" : `step_${step.index + 1}`,
        condition: "correct",
      })),
    ],
  };
  return {
    config,
    graph,
    slotManifest: {
      mock: true,
      hintsByStep: config.hints,
      warning: "Artefato sintético; não foi produzido pelo GraphForge implantado.",
    },
    topology: {
      totalNodes: graph.nodes.length,
      edgeCount: graph.edges.length,
      scaffoldCount: 0,
    },
  };
}

function mockHash(label) {
  return sha256(`offline-mock:${label}`);
}

export function buildMockObservation(state) {
  const agentState = projectAgentState(state);
  const prompts = mockPrompts(agentState);
  const traces = mockTraces(agentState);
  const forged1 = mockGraphForge(agentState, traces);
  const forged2 = mockGraphForge(agentState, traces);
  const files = Object.fromEntries(
    Object.entries(PRODUCTION_SOURCE_FILES).map(([key, sourcePath]) => [
      key,
      { path: sourcePath, sha256: mockHash(key) },
    ])
  );
  const promptHashes = Object.fromEntries(
    Object.entries(prompts).map(([key, prompt]) => [
      key,
      fingerprintPrompt(prompt.system, prompt.user),
    ])
  );
  return {
    mode: "mock",
    imageDigest: `sha256:${mockHash("image")}`,
    files,
    agentConfigs: {
      agent3a: { provider: "mock", model: "offline/mock", temperature: 0.2, maxTokens: 16000 },
      agent3b: { provider: "mock", model: "offline/mock", temperature: 0.7, maxTokens: 24000 },
      agent3c: { provider: "mock", model: "offline/mock", temperature: 0.4, maxTokens: 16000 },
    },
    runtimeEnv: {
      qualityTier: "balanced",
      STI_ABLATE_MISCDB: null,
      STI_MISC_LIMIT: null,
      STI_SKIP_AGENT3C: null,
    },
    promptHashes,
    graphForgeConfigSha256: sha256Json(forged1.config),
    graphForgeRunHashes: [sha256Json(forged1.graph), sha256Json(forged2.graph)],
    agent3cPolicy: "production-conditional",
    artifacts: {
      traces,
      graphForgeConfig: forged1.config,
      genericGraph: forged1.graph,
      slotManifest: forged1.slotManifest,
      graphTopology: forged1.topology,
    },
  };
}

export function buildMockExpectedManifest(state, observation = buildMockObservation(state)) {
  // Manifesto é snapshot independente: mutar a observação depois do congelamento
  // deve necessariamente ser detectado pelos gates (sem referências compartilhadas).
  return JSON.parse(JSON.stringify({
    schemaVersion: EQUIVALENCE_MANIFEST_VERSION,
    stateSha256: sha256Json(state),
    imageDigest: observation.imageDigest,
    files: observation.files,
    agentConfigs: observation.agentConfigs,
    runtimeEnv: observation.runtimeEnv,
    promptHashes: observation.promptHashes,
    graphForgeConfigSha256: observation.graphForgeConfigSha256,
    agent3cPolicy: observation.agent3cPolicy,
    mockOnly: true,
  }));
}

export function runMockPreflight(state, { expectedManifest } = {}) {
  assertProductionState(state);
  const observation = buildMockObservation(state);
  const expected = expectedManifest || buildMockExpectedManifest(state, observation);
  const equivalence = evaluateEquivalence({ state, expected, observed: observation, mode: "mock" });
  return {
    schemaVersion: "educaoff-production-preflight-v1",
    mode: "mock",
    networkCalls: 0,
    paidCalls: 0,
    realExecutionAttempted: false,
    productionEquivalent: false,
    equivalence,
    artifacts: observation.artifacts,
  };
}

export function assertRealModeAllowed({ allowReal = false } = {}) {
  if (!allowReal) {
    throw new RealExecutionDisabledError(
      "Modo real bloqueado: seria necessário passar --allow-real de forma explícita. Nenhuma chamada foi feita."
    );
  }
  throw new RealExecutionDisabledError(
    "Modo real autorizado, porém não implementado neste repositório. Use futuramente um adaptador da imagem fixada; nenhuma chamada foi feita."
  );
}

function parseArgs(argv) {
  const out = { mode: "mock", allowReal: false, state: null, expected: null, output: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--mode") out.mode = argv[++i];
    else if (arg === "--allow-real") out.allowReal = true;
    else if (arg === "--state") out.state = argv[++i];
    else if (arg === "--expected") out.expected = argv[++i];
    else if (arg === "--out") out.output = argv[++i];
    else throw new Error(`Argumento desconhecido: ${arg}`);
  }
  return out;
}

export function runCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.mode === "real") return assertRealModeAllowed({ allowReal: args.allowReal });
  if (args.mode !== "mock") throw new Error(`Modo inválido: ${args.mode}`);

  const state = args.state
    ? JSON.parse(fs.readFileSync(path.resolve(args.state), "utf8"))
    : createExampleProductionState();
  const expectedManifest = args.expected
    ? JSON.parse(fs.readFileSync(path.resolve(args.expected), "utf8"))
    : undefined;
  const report = runMockPreflight(state, { expectedManifest });
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (args.output) {
    fs.mkdirSync(path.dirname(path.resolve(args.output)), { recursive: true });
    fs.writeFileSync(path.resolve(args.output), json);
  } else {
    process.stdout.write(json);
  }
  return report;
}

const THIS_FILE = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === THIS_FILE) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(`${error.name || "Error"}: ${error.message}\n`);
    process.exitCode = 1;
  }
}
