#!/usr/bin/env node

/**
 * Constrói estados de entrada no contrato real dos Agents3 a partir da chave
 * independente de exercícios CTAT. Este módulo não lê expert.brd, envelopes,
 * saídas de agentes, credenciais ou rede.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256Json, validateProductionState } from "./equivalence-gate.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");
const DEFAULT_ANSWER_KEY = path.join(REPO_ROOT, "answer-key/frac-numberline-6.17.json");
const DEFAULT_OUTPUT_DIR = path.join(HERE, "fixtures");
const BATCH_SIZE = 4;

export const STRATEGIES = Object.freeze([
  "polya",
  "exemplo_trabalhado",
  "problema_invertido",
  "descoberta_guiada",
]);

const BASE_KCS = Object.freeze([
  {
    id: "kc_identificar_partes_fracao",
    name: "Identificar numerador e denominador",
    description: "Reconhecer quantas partes são consideradas e em quantas partes iguais o todo foi dividido.",
    difficulty: "easy",
    prerequisites: [],
    masteryThreshold: 0.8,
  },
  {
    id: "kc_particionar_reta",
    name: "Particionar a reta numérica",
    description: "Dividir cada unidade da reta numérica em partes iguais determinadas pelo denominador.",
    difficulty: "medium",
    prerequisites: ["kc_identificar_partes_fracao"],
    masteryThreshold: 0.8,
  },
  {
    id: "kc_localizar_fracao_reta",
    name: "Localizar a fração na reta numérica",
    description: "Contar partições a partir de zero e marcar a posição representada pela fração.",
    difficulty: "medium",
    prerequisites: ["kc_particionar_reta"],
    masteryThreshold: 0.8,
  },
]);

const IMPROPER_KC = Object.freeze({
  id: "kc_fracao_impropria_reta",
  name: "Representar fração imprópria na reta",
  description: "Ultrapassar uma unidade e localizar frações maiores que um na reta numérica.",
  difficulty: "medium",
  prerequisites: ["kc_localizar_fracao_reta"],
  masteryThreshold: 0.8,
});

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function assertAnswerKey(answerKey) {
  if (answerKey?.schemaVersion !== "answer-key-v1") {
    throw new Error("A chave de exercícios deve usar schemaVersion=answer-key-v1.");
  }
  if (!Array.isArray(answerKey.exercises) || answerKey.exercises.length === 0) {
    throw new Error("A chave de exercícios não contém exercícios.");
  }
  if (answerKey.exercises.length % BATCH_SIZE !== 0) {
    throw new Error(`A quantidade de exercícios deve ser múltipla de ${BATCH_SIZE}.`);
  }
}

function isImproper(exercise) {
  return Number(exercise.numerator) > Number(exercise.denominator);
}

function assertExercise(exercise) {
  const requiredStrings = ["id", "statement", "correctAnswer"];
  for (const key of requiredStrings) {
    if (typeof exercise?.[key] !== "string" || exercise[key].trim() === "") {
      throw new Error(`Exercício inválido: ${key} deve ser string não vazia.`);
    }
  }
  if (!Number.isInteger(exercise.numerator) || exercise.numerator < 1) {
    throw new Error(`Exercício ${exercise.id}: numerador inválido.`);
  }
  if (!Number.isInteger(exercise.denominator) || exercise.denominator < 2) {
    throw new Error(`Exercício ${exercise.id}: denominador inválido.`);
  }
  if (![1, 2].includes(exercise.interfaceConfig?.rBound)) {
    throw new Error(`Exercício ${exercise.id}: limite da reta inválido.`);
  }
  const expected = `${exercise.numerator}/${exercise.denominator}`;
  if (exercise.correctAnswer !== expected) {
    throw new Error(`Exercício ${exercise.id}: resposta ${exercise.correctAnswer} diverge de ${expected}.`);
  }
}

function buildSolutionSteps(exercise) {
  const { numerator, denominator, correctAnswer } = exercise;
  const steps = [
    {
      step: 1,
      action: "Identificar o número de partes selecionadas no enunciado.",
      result: numerator,
      kc: "kc_identificar_partes_fracao",
    },
    {
      step: 2,
      action: "Identificar em quantas partes iguais cada unidade deve ser dividida.",
      result: denominator,
      kc: "kc_identificar_partes_fracao",
    },
    {
      step: 3,
      action: `Particionar cada unidade da reta em ${denominator} partes iguais.`,
      result: `intervalos de 1/${denominator}`,
      kc: "kc_particionar_reta",
    },
    {
      step: 4,
      action: `Contar ${numerator} ${numerator === 1 ? "partição" : "partições"} a partir de zero e marcar o ponto.`,
      result: correctAnswer,
      kc: isImproper(exercise) ? "kc_fracao_impropria_reta" : "kc_localizar_fracao_reta",
    },
  ];
  return steps;
}

function buildSeed(exercise, position) {
  assertExercise(exercise);
  const improper = isImproper(exercise);
  const kcsInvolved = [
    "kc_identificar_partes_fracao",
    "kc_particionar_reta",
    "kc_localizar_fracao_reta",
  ];
  if (improper) kcsInvolved.push("kc_fracao_impropria_reta");

  return {
    id: exercise.id,
    strategy: STRATEGIES[position % STRATEGIES.length],
    statement: exercise.statement,
    expectedAnswer: exercise.correctAnswer,
    kcsInvolved,
    solutionSteps: buildSolutionSteps(exercise),
    difficulty: improper ? "medium" : "easy",
    context: `Reta numérica de 0 a ${exercise.interfaceConfig.rBound}; localizar a fração solicitada no enunciado.`,
  };
}

export function buildProductionStates(answerKey) {
  assertAnswerKey(answerKey);
  const ids = new Set();
  answerKey.exercises.forEach((exercise) => {
    if (ids.has(exercise.id)) throw new Error(`ID de exercício duplicado: ${exercise.id}.`);
    ids.add(exercise.id);
  });

  const states = [];
  for (let offset = 0; offset < answerKey.exercises.length; offset += BATCH_SIZE) {
    const exercises = answerKey.exercises.slice(offset, offset + BATCH_SIZE);
    const includesImproper = exercises.some(isImproper);
    const batch = offset / BATCH_SIZE + 1;
    const state = {
      schemaVersion: "educaoff-agent3-state-v1",
      discipline: "Matemática",
      topic: "Frações na reta numérica",
      difficulty: includesImproper ? "medium" : "easy",
      ageGroup: "11–14 anos",
      knowledgeComponents: [
        ...BASE_KCS.map((kc) => structuredClone(kc)),
        ...(includesImproper ? [structuredClone(IMPROPER_KC)] : []),
      ],
      seedProblems: exercises.map((exercise, index) => buildSeed(exercise, index)),
      interfaceSpec: { profile: "reader" },
      masterGraphContext: { relatedKCs: [], relatedGraphs: [] },
      sessionId: `campaign4-ctat-batch-${String(batch).padStart(2, "0")}`,
    };
    const validation = validateProductionState(state);
    if (!validation.valid) {
      throw new Error(`Fixture do lote ${batch} inválida: ${JSON.stringify(validation.errors)}`);
    }
    states.push(state);
  }
  return states;
}

export function writeProductionFixtures({ answerKeyPath = DEFAULT_ANSWER_KEY, outputDir = DEFAULT_OUTPUT_DIR } = {}) {
  const answerKey = JSON.parse(fs.readFileSync(answerKeyPath, "utf8"));
  const states = buildProductionStates(answerKey);
  fs.mkdirSync(outputDir, { recursive: true });

  const fixtures = states.map((state, index) => {
    const filename = `ctat-production-state-batch-${String(index + 1).padStart(2, "0")}.json`;
    const outputPath = path.join(outputDir, filename);
    fs.writeFileSync(outputPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    return {
      batch: index + 1,
      filename,
      exerciseIds: state.seedProblems.map((seed) => seed.id),
      stateSha256: sha256Json(state),
      fileSha256: sha256File(outputPath),
    };
  });

  const manifest = {
    schemaVersion: "educaoff-agent3-fixture-manifest-v1",
    generatedAt: "2026-07-15T00:00:00.000Z",
    dataset: answerKey.dataset,
    provenance: {
      basis: "answer-key independente; nenhum expert.brd, envelope ou resultado de agente foi lido",
      answerKeyPath: path.relative(REPO_ROOT, answerKeyPath),
      answerKeyFileSha256: sha256File(answerKeyPath),
      answerKeyDeclaredSource: answerKey.source,
      answerKeyDeclaredSourceSha256: answerKey.sourceSha256,
    },
    batching: {
      batchSize: BATCH_SIZE,
      batchCount: fixtures.length,
      exerciseCount: answerKey.exercises.length,
      unitOfAnalysis: "exerciseId dentro de cada saída multi-solução",
    },
    fixtures,
  };
  const manifestPath = path.join(outputDir, "manifest.json");
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { manifest, manifestPath, states };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = writeProductionFixtures();
  process.stdout.write(
    `${JSON.stringify(
      {
        outputDir: path.relative(REPO_ROOT, DEFAULT_OUTPUT_DIR),
        batches: result.states.length,
        exercises: result.manifest.batching.exerciseCount,
        paidCalls: 0,
        networkCalls: 0,
      },
      null,
      2
    )}\n`
  );
}
