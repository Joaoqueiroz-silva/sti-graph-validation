#!/usr/bin/env node

/**
 * Prova executável de tutoria pré-compilada e desacoplada do modelo.
 *
 * O programa instala primeiro um "tripwire" de rede (fetch, HTTP(S), HTTP/2,
 * sockets TCP/TLS/UDP, DNS e WebSocket) e somente depois importa o parser e o
 * executor do tutor. Em seguida, audita separadamente os 105 grafos CTAT de
 * referência e os 630 behaviorGraph finais materializados usados no artigo:
 *
 *   1. encontra deterministicamente um caminho correto até um estado final;
 *   2. executa e valida todas as transições buggy alcançáveis por caminho correto;
 *   3. pede dica em todos os estados do caminho canônico e prova que a dica não
 *      altera o estado nem impede a conclusão posterior;
 *   4. valida uma resposta sem correspondência;
 *   5. repete uma trajetória mista (acerto + erro + dica + no-match) e exige que
 *      todas as serializações e hashes sejam idênticos;
 *   6. exige zero tentativa de rede durante toda a execução.
 *
 * Uso:
 *   node analysis/orientador-v08/executar-tutoria-desacoplada.mjs
 *   node analysis/orientador-v08/executar-tutoria-desacoplada.mjs \
 *     --repeticoes 10 --saida resultados/orientador-v08/execucao-desacoplada.json
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { syncBuiltinESMExports } from "node:module";
import http from "node:http";
import https from "node:https";
import http2 from "node:http2";
import net from "node:net";
import tls from "node:tls";
import dgram from "node:dgram";
import dns from "node:dns";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../..");
const DEFAULT_CASES_ROOT = path.join(REPO_ROOT, "cases");
const DEFAULT_RESULTS_ROOT = path.join(REPO_ROOT, "resultados");
const DEFAULT_REPETITIONS = 10;
const DEFAULT_CORPORA = ["ctat-6.17", "ctat-6.18", "ctat-6.19", "ctat-6.20", "ctat-8.12"];

const sha256 = (value) =>
  crypto
    .createHash("sha256")
    .update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value))
    .digest("hex");

function invariant(condition, message) {
  if (!condition) throw new Error(`prova-desacoplada: ${message}`);
}

/**
 * Bloqueia e contabiliza os canais usuais de rede oferecidos pelo Node.js.
 * O retorno deve ser restaurado em finally para não contaminar outros testes.
 */
export function installNetworkTripwire() {
  const attempts = [];
  const restorers = [];

  const blocked = (channel) =>
    function networkForbidden() {
      attempts.push(channel);
      throw new Error(`Acesso de rede proibido durante a tutoria desacoplada: ${channel}`);
    };

  const patch = (owner, property, channel = property) => {
    if (!owner || typeof owner[property] !== "function") return;
    const original = owner[property];
    owner[property] = blocked(channel);
    restorers.push(() => {
      owner[property] = original;
    });
  };

  patch(globalThis, "fetch", "global.fetch");
  patch(http, "request", "http.request");
  patch(http, "get", "http.get");
  patch(https, "request", "https.request");
  patch(https, "get", "https.get");
  patch(http2, "connect", "http2.connect");
  patch(net, "connect", "net.connect");
  patch(net, "createConnection", "net.createConnection");
  patch(tls, "connect", "tls.connect");
  patch(dgram, "createSocket", "dgram.createSocket");

  for (const method of [
    "lookup",
    "resolve",
    "resolve4",
    "resolve6",
    "resolveAny",
    "resolveCaa",
    "resolveCname",
    "resolveMx",
    "resolveNaptr",
    "resolveNs",
    "resolvePtr",
    "resolveSoa",
    "resolveSrv",
    "resolveTxt",
    "reverse",
  ]) {
    patch(dns, method, `dns.${method}`);
  }

  if (typeof globalThis.WebSocket === "function") patch(globalThis, "WebSocket", "global.WebSocket");

  // Propaga as substituições feitas nos objetos CommonJS para imports ESM nomeados.
  syncBuiltinESMExports();

  let restored = false;
  return {
    attempts,
    restore() {
      if (restored) return;
      restored = true;
      for (const restore of restorers.reverse()) restore();
      syncBuiltinESMExports();
    },
  };
}

function listExpertBrds(root) {
  const found = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && entry.name === "expert.brd") found.push(absolute);
    }
  };
  visit(root);
  return found.sort((a, b) => a.localeCompare(b));
}

function listGeneratedArtifacts(root) {
  const found = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (
        entry.isFile() &&
        entry.name.endsWith(".json") &&
        path.basename(path.dirname(absolute)) === "runs" &&
        absolute.split(path.sep).some((segment) => segment.startsWith("materializado-v3-fixa-"))
      ) {
        found.push(absolute);
      }
    }
  };
  visit(root);
  return found.sort((a, b) => a.localeCompare(b));
}

function generatedArtifactIdentity(file, resultsRoot, record) {
  const relative = path.relative(resultsRoot, file).split(path.sep).join("/");
  const segments = relative.split("/");
  const materializedSegment = segments.find((segment) => segment.startsWith("materializado-v3-fixa-"));
  const arm = materializedSegment?.replace("materializado-v3-fixa-", "") || "unknown";
  const corpusSegment = segments.find((segment) => /^\d+\.\d+$/.test(segment));
  const corpus = relative.startsWith("rodada4-interface-fixa-")
    ? "ctat-6.17"
    : corpusSegment
      ? `ctat-${corpusSegment}`
      : "unknown";
  return {
    relative,
    corpus,
    arm,
    problem: String(record.exercicio ?? record.id ?? path.basename(file, ".json")),
    replica: Number(record.replica),
  };
}

function outgoingByState(graph, type = null) {
  const byState = new Map();
  for (const transition of graph.transitions || []) {
    if (type && transition.type !== type) continue;
    if (!byState.has(transition.from)) byState.set(transition.from, []);
    byState.get(transition.from).push(transition);
  }
  return byState;
}

/** Menor caminho correto, com desempate pela ordem original das transições. */
function correctPath(graph, origin = graph.startState, target = null) {
  const finals = new Set(target ? [target] : graph.finalStates || []);
  const outgoing = outgoingByState(graph, "correct");
  const queue = [{ state: origin, path: [] }];
  const seen = new Set([origin]);

  while (queue.length) {
    const current = queue.shift();
    if (finals.has(current.state)) return current.path;
    for (const transition of outgoing.get(current.state) || []) {
      if (seen.has(transition.to)) continue;
      seen.add(transition.to);
      queue.push({ state: transition.to, path: [...current.path, transition] });
    }
  }
  return null;
}

/**
 * Alguns BRDs encerram em um nó-sumidouro sem marcar esse nó com done=true.
 * Quando não há final declarado alcançável, aplica a regra fechada e auditável
 * "sumidouro alcançável somente por transições corretas". A regra não consulta
 * texto, resposta esperada nem modelo e não escolhe sumidouros de ramos buggy.
 */
function ensureReachableFinalStates(graph) {
  if (correctPath(graph)) return { graph, finalStateRule: "declared" };

  const correctOutgoing = outgoingByState(graph, "correct");
  const allOutgoing = outgoingByState(graph);
  const queue = [graph.startState];
  const reachableByCorrect = new Set([graph.startState]);
  while (queue.length) {
    const state = queue.shift();
    for (const transition of correctOutgoing.get(state) || []) {
      if (reachableByCorrect.has(transition.to)) continue;
      reachableByCorrect.add(transition.to);
      queue.push(transition.to);
    }
  }

  const inferred = (graph.states || [])
    .map((state) => state.id)
    .filter((state) => reachableByCorrect.has(state) && !(allOutgoing.get(state) || []).length);
  invariant(inferred.length > 0, "nenhum estado final declarado ou sumidouro correto alcançável");

  return {
    graph: { ...graph, finalStates: inferred },
    finalStateRule: "inferred-correct-sink",
  };
}

function trajectoryHash(result) {
  return sha256(result);
}

function asTrace(transitions) {
  return transitions.map((transition) => ({ ...transition.sai }));
}

function inputDigest(files, root) {
  return sha256(
    files.map((file) => ({
      file: path.relative(root, file).split(path.sep).join("/"),
      sha256: sha256(fs.readFileSync(file)),
    }))
  );
}

/**
 * Audita estaticamente o fecho de imports locais dos dois executores. Isso
 * complementa o tripwire: além de zero acesso de rede, o caminho executado não
 * possui adaptador/provedor de LLM em sua árvore de dependências do repositório.
 */
function auditExecutorDependencyBoundary() {
  const entries = [
    path.join(REPO_ROOT, "trace-executor.js"),
    path.join(REPO_ROOT, "schema-v2.js"),
    path.join(HERE, "executor-grafo-gerado.mjs"),
  ];
  const queue = [...entries];
  const visited = new Set();
  const externalImports = new Set();
  const importPattern = /\b(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g;

  while (queue.length) {
    const file = queue.shift();
    if (visited.has(file)) continue;
    invariant(fs.existsSync(file), `dependência local inexistente: ${file}`);
    visited.add(file);
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[1];
      if (!specifier.startsWith(".")) {
        externalImports.add(specifier);
        continue;
      }
      let resolved = path.resolve(path.dirname(file), specifier);
      if (!path.extname(resolved)) {
        const candidates = [`${resolved}.js`, `${resolved}.mjs`, path.join(resolved, "index.js")];
        resolved = candidates.find((candidate) => fs.existsSync(candidate)) || resolved;
      }
      queue.push(resolved);
    }
  }

  const localModules = [...visited]
    .map((file) => ({
      file: path.relative(REPO_ROOT, file).split(path.sep).join("/"),
      sha256: sha256(fs.readFileSync(file)),
    }))
    .sort((a, b) => a.file.localeCompare(b.file));
  const externals = [...externalImports].sort();
  const forbiddenPattern = /(?:^|[/_-])(llm|openrouter|openai|anthropic|gemini|qwen)(?:$|[/_.-])/i;
  const forbidden = [
    ...localModules.map((item) => item.file),
    ...externals,
  ].filter((item) => forbiddenPattern.test(item));
  invariant(forbidden.length === 0, `adaptador/provedor LLM presente no executor: ${forbidden.join(", ")}`);

  return {
    localModules,
    externalImports: externals,
    forbiddenLlmDependencies: forbidden.length,
    dependencyTreeSha256: sha256({ localModules, externalImports: externals }),
  };
}

function summarizeByCorpus(cases) {
  const summary = {};
  for (const item of cases) {
    if (!summary[item.corpus]) {
      summary[item.corpus] = {
        graphs: 0,
        correctSteps: 0,
        reachableBuggyTransitions: 0,
        executableBuggyTransitions: 0,
        shadowedBuggyTransitions: 0,
        hintChecks: 0,
        deterministicExecutions: 0,
      };
    }
    const row = summary[item.corpus];
    row.graphs += 1;
    row.correctSteps += item.correctSteps;
    row.reachableBuggyTransitions += item.reachableBuggyTransitions;
    row.executableBuggyTransitions += item.executableBuggyTransitions;
    row.shadowedBuggyTransitions += item.shadowedBuggyTransitions;
    row.hintChecks += item.hintChecks;
    row.deterministicExecutions += item.deterministicExecutions;
  }
  return summary;
}

function summarizeGenerated(cases) {
  const summary = {};
  for (const item of cases) {
    const key = `${item.corpus}/${item.arm}`;
    if (!summary[key]) {
      summary[key] = {
        graphs: 0,
        steps: 0,
        hints: 0,
        misconceptions: 0,
        observableBuggyInputs: 0,
        hintChecks: 0,
        deterministicExecutions: 0,
      };
    }
    const row = summary[key];
    row.graphs += 1;
    row.steps += item.steps;
    row.hints += item.hints;
    row.misconceptions += item.misconceptions;
    row.observableBuggyInputs += item.observableBuggyInputs;
    row.hintChecks += item.hintChecks;
    row.deterministicExecutions += item.deterministicExecutions;
  }
  return summary;
}

/**
 * Executa a prova completa. Não faz chamadas LLM e instala o bloqueio antes dos
 * imports dos módulos do tutor, cobrindo também efeitos colaterais de importação.
 */
export async function runDecoupledTutorProof({
  casesRoot = DEFAULT_CASES_ROOT,
  resultsRoot = DEFAULT_RESULTS_ROOT,
  repetitions = DEFAULT_REPETITIONS,
  corpora = DEFAULT_CORPORA,
} = {}) {
  invariant(Number.isInteger(repetitions) && repetitions >= 2, "repetitions deve ser inteiro >= 2");
  invariant(fs.existsSync(casesRoot), `diretório de casos inexistente: ${casesRoot}`);
  invariant(fs.existsSync(resultsRoot), `diretório de resultados inexistente: ${resultsRoot}`);

  const tripwire = installNetworkTripwire();
  try {
    const dependencyBoundary = auditExecutorDependencyBoundary();
    const [
      { parseBrdToNeutralV2 },
      { executeTrace },
      { compileGeneratedBehaviorGraph, executeGeneratedTrace, canonicalGeneratedTrace },
    ] = await Promise.all([
      import("../../schema-v2.js"),
      import("../../trace-executor.js"),
      import("./executor-grafo-gerado.mjs"),
    ]);

    const selectedCorpora = new Set(corpora);
    const files = listExpertBrds(casesRoot).filter((file) => {
      const corpus = path.relative(casesRoot, file).split(path.sep)[0];
      return selectedCorpora.has(corpus);
    });
    invariant(files.length > 0, "nenhum expert.brd encontrado");
    const caseResults = [];

    for (const file of files) {
      const relative = path.relative(casesRoot, file).split(path.sep).join("/");
      const [corpus, problem] = relative.split("/");
      const parsedGraph = parseBrdToNeutralV2(fs.readFileSync(file, "utf8"), { corpus, problem });
      const { graph, finalStateRule } = ensureReachableFinalStates(parsedGraph);
      const canonical = correctPath(graph);

      invariant(canonical, `${relative}: nenhum caminho correto alcança um estado final`);
      invariant(canonical.length > 0, `${relative}: caminho correto vazio`);

      const canonicalTrace = asTrace(canonical);
      const canonicalResult = executeTrace(graph, canonicalTrace);
      invariant(canonicalResult.completed, `${relative}: caminho correto não completou o grafo`);
      invariant(
        canonicalResult.steps.every((step) => step.verdict === "correct"),
        `${relative}: caminho correto produziu veredito não correto`
      );

      // Todas as transições buggy cuja origem é alcançável apenas por passos corretos.
      let reachableBuggyTransitions = 0;
      let executableBuggyTransitions = 0;
      let shadowedBuggyTransitions = 0;
      let buggyFeedbackChecks = 0;
      let firstRecoverableBuggy = null;
      for (const buggy of (graph.transitions || []).filter((transition) => transition.type === "buggy")) {
        const prefix = correctPath(graph, graph.startState, buggy.from);
        if (!prefix) continue;
        reachableBuggyTransitions += 1;
        const result = executeTrace(graph, [...asTrace(prefix), { ...buggy.sai }]);
        const last = result.steps.at(-1);
        // A política documentada do executor dá prioridade a uma transição correta
        // quando correto e buggy casam o mesmo SAI. Esse buggy é alcançável no XML,
        // mas não observável como erro sob a política; contamos o sombreamento.
        if (last?.verdict === "correct") {
          shadowedBuggyTransitions += 1;
          continue;
        }
        invariant(last?.verdict === "buggy", `${relative}: transição ${buggy.id} produziu ${last?.verdict || "nenhum veredito"}`);
        executableBuggyTransitions += 1;
        invariant(result.endState === buggy.from, `${relative}: erro ${buggy.id} avançou o estado sem remediação`);
        const suffix = correctPath(graph, buggy.from);
        if (!firstRecoverableBuggy && suffix) firstRecoverableBuggy = { buggy, prefix, suffix };
        if (buggy.feedback?.buggyMessage) {
          invariant(last.feedback === buggy.feedback.buggyMessage, `${relative}: feedback incorreto em ${buggy.id}`);
          buggyFeedbackChecks += 1;
        }
      }

      // Em cada estado do caminho canônico, a dica não move o estado; o restante
      // do mesmo caminho ainda deve concluir o problema.
      let hintChecks = 0;
      for (let index = 0; index <= canonical.length; index += 1) {
        const prefix = canonical.slice(0, index);
        const suffix = canonical.slice(index);
        const state = index === 0 ? graph.startState : canonical[index - 1].to;
        const expectedHints = (graph.transitions || [])
          .filter((transition) => transition.from === state && transition.type === "correct")
          .flatMap((transition) => transition.hints || []);
        const result = executeTrace(graph, [...asTrace(prefix), { hintRequest: true }, ...asTrace(suffix)]);
        const hint = result.steps[index];
        invariant(hint?.verdict === "hint", `${relative}: pedido de dica não retornou verdict=hint no estado ${state}`);
        invariant(JSON.stringify(hint.hints) === JSON.stringify(expectedHints), `${relative}: dicas divergentes no estado ${state}`);
        invariant(result.completed, `${relative}: pedir dica no estado ${state} impediu a conclusão`);
        hintChecks += 1;
      }

      // Uma trajetória mista exerce os quatro resultados relevantes. Se houver
      // buggy alcançável, erra e continua pelo caminho correto a partir da origem.
      let mixedTrace;
      if (firstRecoverableBuggy) {
        const { buggy, prefix, suffix } = firstRecoverableBuggy;
        mixedTrace = [
          ...asTrace(prefix),
          { hintRequest: true },
          { ...buggy.sai },
          { selection: "__offline_probe__", action: "__no_match__", input: "__offline_probe__" },
          ...asTrace(suffix),
        ];
      } else {
        mixedTrace = [
          { hintRequest: true },
          { selection: "__offline_probe__", action: "__no_match__", input: "__offline_probe__" },
          ...canonicalTrace,
        ];
      }

      const serializedTrajectories = [];
      for (let repetition = 0; repetition < repetitions; repetition += 1) {
        const result = executeTrace(graph, mixedTrace);
        invariant(result.completed, `${relative}: trajetória mista não completou na repetição ${repetition + 1}`);
        invariant(result.steps.some((step) => step.verdict === "hint"), `${relative}: trajetória mista sem dica`);
        invariant(result.steps.some((step) => step.verdict === "no-match"), `${relative}: trajetória mista sem no-match`);
        if (firstRecoverableBuggy) {
          invariant(result.steps.some((step) => step.verdict === "buggy"), `${relative}: trajetória mista sem erro buggy`);
        }
        serializedTrajectories.push(JSON.stringify(result));
      }
      invariant(new Set(serializedTrajectories).size === 1, `${relative}: mesma entrada produziu trajetórias diferentes`);

      caseResults.push({
        corpus,
        problem,
        graphSha256: sha256(fs.readFileSync(file)),
        canonicalTrajectorySha256: trajectoryHash(canonicalResult),
        mixedTrajectorySha256: sha256(serializedTrajectories[0]),
        correctSteps: canonical.length,
        reachableBuggyTransitions,
        executableBuggyTransitions,
        shadowedBuggyTransitions,
        buggyFeedbackChecks,
        hintChecks,
        noMatchChecks: 1,
        deterministicExecutions: repetitions,
        finalStateRule,
        unsupportedConstructs: graph.unsupportedConstructs || [],
      });
    }

    // ── 630 grafos finais gerados/materializados usados no artigo ──────────
    const generatedFiles = listGeneratedArtifacts(resultsRoot);
    invariant(
      generatedFiles.length === 630,
      `esperados 630 artefatos materializado-v3; observados ${generatedFiles.length}`
    );
    const generatedResults = [];

    for (const file of generatedFiles) {
      const record = JSON.parse(fs.readFileSync(file, "utf8"));
      const identity = generatedArtifactIdentity(file, resultsRoot, record);
      const label = `${identity.corpus}/${identity.arm}/${identity.problem}/rep${identity.replica}`;
      invariant(corpora.includes(identity.corpus), `${label}: corpus fora do protocolo v0.8`);
      invariant(
        identity.arm === "custo-beneficio" || identity.arm === "estudantes-qwen",
        `${label}: braço desconhecido`
      );
      invariant(Number.isInteger(identity.replica) && identity.replica >= 1, `${label}: réplica inválida`);

      const behaviorGraph = record?.materializado?.behaviorGraph;
      invariant(behaviorGraph, `${label}: materializado.behaviorGraph ausente`);
      const compiled = compileGeneratedBehaviorGraph(behaviorGraph);
      const canonical = canonicalGeneratedTrace(compiled);
      invariant(
        canonical.states.length === behaviorGraph.nodes.filter((node) => node.type === "step").length,
        `${label}: há step fora do backbone correto`
      );
      const canonicalResult = executeGeneratedTrace(compiled, canonical.trace);
      invariant(canonicalResult.completed, `${label}: caminho correto não alcançou goal`);
      invariant(
        canonicalResult.steps.every((step) => step.verdict === "correct"),
        `${label}: caminho correto produziu veredito não correto`
      );

      const stepNodes = canonical.states.map((state) => compiled.nodes.get(state));
      const steps = stepNodes.length;
      const hints = stepNodes.reduce((total, node) => total + (node.hints || []).length, 0);
      const stepsWithoutHints = stepNodes.filter((node) => !(node.hints || []).length).length;
      const stepsWithoutMisconceptions = stepNodes.filter((node) => !(node.misconceptions || []).length).length;

      // Dica é testada em cada passo realmente presente e também no goal. Não
      // sintetiza escadas ausentes: o esperado é exatamente o array materializado.
      let hintChecks = 0;
      for (let index = 0; index <= canonical.trace.length; index += 1) {
        const prefix = canonical.trace.slice(0, index);
        const suffix = canonical.trace.slice(index);
        const node = index < stepNodes.length ? stepNodes[index] : compiled.nodes.get(compiled.goalState);
        const expectedHints = node?.type === "step" ? (node.hints || []) : [];
        const result = executeGeneratedTrace(compiled, [...prefix, { hintRequest: true }, ...suffix]);
        const hint = result.steps[index];
        invariant(hint?.verdict === "hint", `${label}/${node?.id}: pedido não retornou hint`);
        invariant(JSON.stringify(hint.hints) === JSON.stringify(expectedHints), `${label}/${node?.id}: dicas divergentes`);
        invariant(result.completed, `${label}/${node?.id}: dica impediu conclusão`);
        hintChecks += 1;
      }

      // Cada valor errado distinto é exercido. Duplicatas e colisões com uma
      // resposta correta são contadas, pois não são distinguíveis na interação.
      let misconceptions = 0;
      let validatedMisconceptionRoutes = 0;
      let observableBuggyInputs = 0;
      let misconceptionsShadowedByCorrect = 0;
      let misconceptionsShadowedByDuplicateInput = 0;
      let buggyFeedbackChecks = 0;
      let firstObservableBuggy = null;

      for (let stepIndex = 0; stepIndex < stepNodes.length; stepIndex += 1) {
        const node = stepNodes[stepIndex];
        const prefix = canonical.trace.slice(0, stepIndex);
        const groupedByInput = new Map();
        for (const misconception of node.misconceptions || []) {
          misconceptions += 1;
          validatedMisconceptionRoutes += 1; // compileGeneratedBehaviorGraph validou ida, scaffold e retorno.
          const wrongAnswer = String(misconception.wrongAnswer).trim();
          if (!groupedByInput.has(wrongAnswer)) groupedByInput.set(wrongAnswer, []);
          groupedByInput.get(wrongAnswer).push(misconception);
        }

        for (const [wrongAnswer, group] of groupedByInput) {
          const result = executeGeneratedTrace(compiled, [...prefix, { input: wrongAnswer }]);
          const last = result.steps.at(-1);
          if (last?.verdict === "correct") {
            misconceptionsShadowedByCorrect += group.length;
            continue;
          }
          invariant(last?.verdict === "buggy", `${label}/${node.id}: erro '${wrongAnswer}' produziu ${last?.verdict}`);
          invariant(result.endState === node.id, `${label}/${node.id}: remediação não retornou ao passo`);
          invariant(last.feedback === group[0].feedback, `${label}/${node.id}: feedback divergente`);
          invariant(last.remediation?.returnTo === node.id, `${label}/${node.id}: scaffold sem retorno ao passo`);
          invariant(
            JSON.stringify(last.shadowedMisconceptionIds) === JSON.stringify(group.slice(1).map((item) => item.id)),
            `${label}/${node.id}: desempate de misconceptions duplicadas divergente`
          );
          observableBuggyInputs += 1;
          misconceptionsShadowedByDuplicateInput += group.length - 1;
          buggyFeedbackChecks += 1;
          if (!firstObservableBuggy) {
            firstObservableBuggy = { stepIndex, wrongAnswer };
          }
        }
      }
      invariant(
        observableBuggyInputs + misconceptionsShadowedByCorrect + misconceptionsShadowedByDuplicateInput === misconceptions,
        `${label}: partição de misconceptions inconsistente`
      );

      let mixedTrace;
      if (firstObservableBuggy) {
        const { stepIndex, wrongAnswer } = firstObservableBuggy;
        mixedTrace = [
          ...canonical.trace.slice(0, stepIndex),
          { hintRequest: true },
          { input: wrongAnswer },
          { input: "__offline_probe_no_match__" },
          ...canonical.trace.slice(stepIndex),
        ];
      } else {
        mixedTrace = [
          { hintRequest: true },
          { input: "__offline_probe_no_match__" },
          ...canonical.trace,
        ];
      }

      const serializedTrajectories = [];
      for (let repetition = 0; repetition < repetitions; repetition += 1) {
        const result = executeGeneratedTrace(compiled, mixedTrace);
        invariant(result.completed, `${label}: trajetória mista não concluiu na repetição ${repetition + 1}`);
        invariant(result.steps.some((step) => step.verdict === "hint"), `${label}: trajetória mista sem hint`);
        invariant(result.steps.some((step) => step.verdict === "no-match"), `${label}: trajetória mista sem no-match`);
        if (firstObservableBuggy) {
          invariant(result.steps.some((step) => step.verdict === "buggy"), `${label}: trajetória mista sem buggy`);
        }
        serializedTrajectories.push(JSON.stringify(result));
      }
      invariant(new Set(serializedTrajectories).size === 1, `${label}: mesma entrada produziu trajetórias diferentes`);

      const edges = behaviorGraph.edges || [];
      generatedResults.push({
        ...identity,
        artifactSha256: sha256(fs.readFileSync(file)),
        behaviorGraphSha256: sha256(behaviorGraph),
        canonicalTrajectorySha256: trajectoryHash(canonicalResult),
        mixedTrajectorySha256: sha256(serializedTrajectories[0]),
        steps,
        hints,
        stepsWithoutHints,
        stepsWithoutMisconceptions,
        misconceptions,
        validatedMisconceptionRoutes,
        observableBuggyInputs,
        misconceptionsShadowedByCorrect,
        misconceptionsShadowedByDuplicateInput,
        buggyFeedbackChecks,
        hintChecks,
        noMatchChecks: 1,
        deterministicExecutions: repetitions,
        scaffoldNodes: behaviorGraph.nodes.filter((node) => node.type === "scaffold").length,
        strugglesEdges: edges.filter((edge) => edge.condition === "struggles").length,
        masterySkipEdges: edges.filter((edge) => String(edge.condition).startsWith("skip_if_mastered(")).length,
      });
    }

    invariant(tripwire.attempts.length === 0, `foram observadas ${tripwire.attempts.length} tentativas de rede`);

    const referenceTotals = caseResults.reduce(
      (acc, item) => {
        acc.graphs += 1;
        acc.correctSteps += item.correctSteps;
        acc.reachableBuggyTransitions += item.reachableBuggyTransitions;
        acc.executableBuggyTransitions += item.executableBuggyTransitions;
        acc.shadowedBuggyTransitions += item.shadowedBuggyTransitions;
        acc.buggyFeedbackChecks += item.buggyFeedbackChecks;
        acc.hintChecks += item.hintChecks;
        acc.noMatchChecks += item.noMatchChecks;
        acc.deterministicExecutions += item.deterministicExecutions;
        if (item.finalStateRule === "inferred-correct-sink") acc.graphsWithInferredFinalState += 1;
        if (item.unsupportedConstructs.length) acc.graphsWithUnsupportedConstructs += 1;
        return acc;
      },
      {
        graphs: 0,
        correctSteps: 0,
        reachableBuggyTransitions: 0,
        executableBuggyTransitions: 0,
        shadowedBuggyTransitions: 0,
        buggyFeedbackChecks: 0,
        hintChecks: 0,
        noMatchChecks: 0,
        deterministicExecutions: 0,
        graphsWithInferredFinalState: 0,
        graphsWithUnsupportedConstructs: 0,
      }
    );

    const generatedTotals = generatedResults.reduce(
      (acc, item) => {
        acc.graphs += 1;
        acc.steps += item.steps;
        acc.hints += item.hints;
        acc.stepsWithoutHints += item.stepsWithoutHints;
        acc.stepsWithoutMisconceptions += item.stepsWithoutMisconceptions;
        acc.misconceptions += item.misconceptions;
        acc.validatedMisconceptionRoutes += item.validatedMisconceptionRoutes;
        acc.observableBuggyInputs += item.observableBuggyInputs;
        acc.misconceptionsShadowedByCorrect += item.misconceptionsShadowedByCorrect;
        acc.misconceptionsShadowedByDuplicateInput += item.misconceptionsShadowedByDuplicateInput;
        acc.buggyFeedbackChecks += item.buggyFeedbackChecks;
        acc.hintChecks += item.hintChecks;
        acc.noMatchChecks += item.noMatchChecks;
        acc.deterministicExecutions += item.deterministicExecutions;
        acc.scaffoldNodes += item.scaffoldNodes;
        acc.strugglesEdges += item.strugglesEdges;
        acc.masterySkipEdges += item.masterySkipEdges;
        if (item.misconceptions === 0) acc.graphsWithoutMisconceptions += 1;
        return acc;
      },
      {
        graphs: 0,
        steps: 0,
        hints: 0,
        stepsWithoutHints: 0,
        stepsWithoutMisconceptions: 0,
        misconceptions: 0,
        validatedMisconceptionRoutes: 0,
        observableBuggyInputs: 0,
        misconceptionsShadowedByCorrect: 0,
        misconceptionsShadowedByDuplicateInput: 0,
        buggyFeedbackChecks: 0,
        hintChecks: 0,
        noMatchChecks: 0,
        deterministicExecutions: 0,
        scaffoldNodes: 0,
        strugglesEdges: 0,
        masterySkipEdges: 0,
        graphsWithoutMisconceptions: 0,
      }
    );

    const report = {
      schema: "sti-graph-validation/decoupled-tutor-proof/v2",
      claim: "Grafos finais pré-compilados executados localmente, sem LLM e sem rede",
      safeguards: {
        importedExecutorsOnlyAfterNetworkBlock: true,
        blockedChannels: [
          "fetch",
          "http",
          "https",
          "http2",
          "tcp",
          "tls",
          "udp",
          "dns",
          "websocket",
        ],
        observedNetworkAttempts: tripwire.attempts.length,
        llmCalls: 0,
        llmDependencyBoundary: dependencyBoundary,
      },
      referenceCtat: {
        role: "Referência especialista; teste do executor de transições do schema neutro v2",
        executorScope: "Semântica representada pelo schema neutro v2; construtos CTAT não representados são inventariados por caso",
        scope: {
          casesRoot: path.relative(REPO_ROOT, casesRoot).split(path.sep).join("/"),
          repetitionsPerGraph: repetitions,
          corpora: [...new Set(caseResults.map((item) => item.corpus))],
          excludedAvailableCorpora: [...new Set(
            listExpertBrds(casesRoot)
              .map((file) => path.relative(casesRoot, file).split(path.sep)[0])
              .filter((corpus) => !selectedCorpora.has(corpus))
          )],
        },
        assertions: {
          allGraphsReachFinalState: true,
          allCanonicalStepsAccepted: true,
          allObservableBuggyTransitionsRecognized: true,
          correctOverBuggyPrecedenceAudited: true,
          hintsPreserveExecution: true,
          sameInputSameTrajectory: true,
        },
        totals: referenceTotals,
        byCorpus: summarizeByCorpus(caseResults),
        anomalies: {
          inferredFinalStates: caseResults
            .filter((item) => item.finalStateRule === "inferred-correct-sink")
            .map((item) => `${item.corpus}/${item.problem}`),
          shadowedBuggyTransitions: caseResults
            .filter((item) => item.shadowedBuggyTransitions > 0)
            .map((item) => ({
              case: `${item.corpus}/${item.problem}`,
              count: item.shadowedBuggyTransitions,
            })),
          missingBuggyFeedback: caseResults
            .filter((item) => item.executableBuggyTransitions > item.buggyFeedbackChecks)
            .map((item) => ({
              case: `${item.corpus}/${item.problem}`,
              count: item.executableBuggyTransitions - item.buggyFeedbackChecks,
            })),
        },
        digests: {
          inputsSha256: inputDigest(files, casesRoot),
          trajectoriesSha256: sha256(
            caseResults.map(({ corpus, problem, canonicalTrajectorySha256, mixedTrajectorySha256 }) => ({
              corpus,
              problem,
              canonicalTrajectorySha256,
              mixedTrajectorySha256,
            }))
          ),
        },
        cases: caseResults,
      },
      generatedFinal: {
        role: "Artefato executável sob a semântica declarada; 630 behaviorGraph finais materializados usados no artigo",
        executorScope: "Semântica materializada de expectedInput exact, dicas, misconception→scaffold→retorno, correct e no-match",
        untriggeredPolicies: {
          skipIfMastered: "inventariada, não acionada sem modelo externo de domínio",
          struggles: "inventariada, não acionada sem política externa de contagem de tentativas",
        },
        scope: {
          resultsRoot: path.relative(REPO_ROOT, resultsRoot).split(path.sep).join("/"),
          repetitionsPerGraph: repetitions,
          corpora: [...new Set(generatedResults.map((item) => item.corpus))],
          arms: [...new Set(generatedResults.map((item) => item.arm))],
          replicas: [...new Set(generatedResults.map((item) => item.replica))].sort((a, b) => a - b),
        },
        assertions: {
          allMaterializedGraphsCompile: true,
          allExpectedInputContractsAreNonEmptyAndExact: true,
          allStepNodesBelongToCanonicalBackbone: true,
          allGraphsReachGoal: true,
          allCanonicalStepsAccepted: true,
          everyMaterializedMisconceptionRouteValidated: true,
          everyObservableWrongInputReturnsFeedbackAndRetriesSameStep: true,
          absentHintsOrMisconceptionsNeverSynthesized: true,
          hintsPreserveExecution: true,
          sameInputSameTrajectory: true,
        },
        totals: generatedTotals,
        byCorpusAndArm: summarizeGenerated(generatedResults),
        anomalies: {
          artifactsWithCorrectShadowing: generatedResults
            .filter((item) => item.misconceptionsShadowedByCorrect > 0)
            .map((item) => ({
              artifact: item.relative,
              count: item.misconceptionsShadowedByCorrect,
            })),
          artifactsWithDuplicateWrongInputs: generatedResults
            .filter((item) => item.misconceptionsShadowedByDuplicateInput > 0)
            .map((item) => ({
              artifact: item.relative,
              count: item.misconceptionsShadowedByDuplicateInput,
            })),
          artifactsWithoutMisconceptions: generatedResults
            .filter((item) => item.misconceptions === 0)
            .map((item) => item.relative),
          artifactsWithStepsWithoutHints: generatedResults
            .filter((item) => item.stepsWithoutHints > 0)
            .map((item) => ({ artifact: item.relative, count: item.stepsWithoutHints })),
        },
        digests: {
          artifactsSha256: inputDigest(generatedFiles, resultsRoot),
          behaviorGraphsSha256: sha256(
            generatedResults.map(({ relative, behaviorGraphSha256 }) => ({ relative, behaviorGraphSha256 }))
          ),
          trajectoriesSha256: sha256(
            generatedResults.map(({ relative, canonicalTrajectorySha256, mixedTrajectorySha256 }) => ({
              relative,
              canonicalTrajectorySha256,
              mixedTrajectorySha256,
            }))
          ),
        },
        artifacts: generatedResults,
      },
    };

    return report;
  } finally {
    tripwire.restore();
  }
}

function parseCliArgs(argv) {
  const options = {
    repetitions: DEFAULT_REPETITIONS,
    casesRoot: DEFAULT_CASES_ROOT,
    resultsRoot: DEFAULT_RESULTS_ROOT,
    output: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--repeticoes" || token === "--repetitions") {
      options.repetitions = Number(argv[++index]);
    } else if (token === "--casos" || token === "--cases") {
      options.casesRoot = path.resolve(argv[++index]);
    } else if (token === "--resultados" || token === "--results") {
      options.resultsRoot = path.resolve(argv[++index]);
    } else if (token === "--saida" || token === "--output") {
      options.output = path.resolve(argv[++index]);
    } else if (token === "--help" || token === "-h") {
      options.help = true;
    } else {
      throw new Error(`Argumento desconhecido: ${token}`);
    }
  }
  return options;
}

function help() {
  return [
    "Uso: node analysis/orientador-v08/executar-tutoria-desacoplada.mjs [opções]",
    "",
    "  --repeticoes N   repetições idênticas por grafo (padrão: 10; mínimo: 2)",
    "  --casos DIR      raiz que contém os corpora em cases/",
    "  --resultados DIR raiz que contém os 630 materializado-v3 em resultados/",
    "  --saida ARQUIVO  grava também o relatório JSON neste caminho",
  ].join("\n");
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const options = parseCliArgs(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(`${help()}\n`);
    } else {
      const report = await runDecoupledTutorProof(options);
      const json = `${JSON.stringify(report, null, 2)}\n`;
      if (options.output) {
        fs.mkdirSync(path.dirname(options.output), { recursive: true });
        fs.writeFileSync(options.output, json, "utf8");
      }
      process.stdout.write(json);
    }
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}
