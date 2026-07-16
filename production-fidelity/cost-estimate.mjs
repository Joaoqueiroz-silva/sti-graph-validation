#!/usr/bin/env node
/**
 * Estimativa offline da Campanha 4 a partir dos manifestos realmente observados.
 *
 * Não consulta o OpenRouter, não lê credenciais e não dispara chamadas. A projeção
 * mantém o custo médio observado por agente e distingue o desenho agrupado real
 * (seis estados de quatro seeds) do cenário superior não agrupado.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const DEFAULT_MANIFEST_DIR = path.join(
  ROOT,
  "resultados",
  "campanha3-2026-07-13",
  "manifests"
);

function readJsonl(file) {
  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function round(value, digits = 6) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function sum(rows, field) {
  return rows.reduce((total, row) => total + Number(row[field] || 0), 0);
}

export function summarizeCalls(rows) {
  const byAgent = {};
  for (const row of rows) (byAgent[row.agentKey] ||= []).push(row);
  return Object.fromEntries(
    Object.entries(byAgent).map(([agent, calls]) => {
      const costUsd = sum(calls, "costUsd");
      const tokensIn = sum(calls, "tokensIn");
      const tokensOut = sum(calls, "tokensOut");
      return [
        agent,
        {
          calls: calls.length,
          costUsd: round(costUsd),
          tokensIn,
          tokensOut,
          meanCostUsd: round(costUsd / calls.length, 8),
          meanTokensIn: round(tokensIn / calls.length, 2),
          meanTokensOut: round(tokensOut / calls.length, 2),
        },
      ];
    })
  );
}

export function projectCampaign({
  baselineRows,
  exercises = 24,
  replicas = 3,
  forceAllAgents = true,
  judgeRows = [],
  productionSeedMultiplier = 4,
  batchSize = 4,
  pilotStates = 3,
  pilotReplicas = 1,
}) {
  const summary = summarizeCalls(baselineRows);
  const targetPerAgent = exercises * replicas;
  const required = ["agent3a_advanced", "agent3b_atrisk", "agent3c_average"];
  for (const key of required) {
    if (!summary[key]) throw new Error(`Manifestos não contêm observações de ${key}`);
  }

  const projectedByAgent = Object.fromEntries(
    required.map((key) => {
      const calls = forceAllAgents ? targetPerAgent : summary[key].calls;
      return [
        key,
        {
          calls,
          costUsd: round(calls * summary[key].meanCostUsd),
          tokensIn: Math.round(calls * summary[key].meanTokensIn),
          tokensOut: Math.round(calls * summary[key].meanTokensOut),
        },
      ];
    })
  );

  const agentProjectionUsd = round(
    Object.values(projectedByAgent).reduce((total, item) => total + item.costUsd, 0)
  );
  const historicalJudgePanelUsd = round(sum(judgeRows, "costUsd"));
  const projectedWithHistoricalPanelUsd = round(agentProjectionUsd + historicalJudgePanelUsd);
  if (!Number.isInteger(batchSize) || batchSize < 1 || exercises % batchSize !== 0) {
    throw new Error("exercises deve ser divisível por batchSize");
  }
  const stateRuns = (exercises / batchSize) * replicas;
  const perSeedForcedAllUsd = required.reduce(
    (total, key) => total + summary[key].meanCostUsd,
    0
  );
  const operational3cRate = Math.min(
    1,
    summary.agent3c_average.calls /
      Math.max(summary.agent3a_advanced.calls, summary.agent3b_atrisk.calls)
  );
  const perSeedConditionalUsd =
    summary.agent3a_advanced.meanCostUsd +
    summary.agent3b_atrisk.meanCostUsd +
    operational3cRate * summary.agent3c_average.meanCostUsd;

  // No desenho escolhido, cada chamada processa quatro exercícios e a quantidade
  // de estados cai de 24 para seis. A hipótese linear de quatro vezes o conteúdo
  // por chamada cancela a redução de quatro vezes na quantidade de chamadas.
  const batchedConditionalUsd = round(stateRuns * batchSize * perSeedConditionalUsd);
  const batchedForcedAllUsd = round(stateRuns * batchSize * perSeedForcedAllUsd);
  const batchedForcedAllWithPanelUsd = round(batchedForcedAllUsd + historicalJudgePanelUsd);
  const pilotConditionalUsd = round(
    pilotStates * pilotReplicas * batchSize * perSeedConditionalUsd
  );
  const pilotForcedAllUsd = round(
    pilotStates * pilotReplicas * batchSize * perSeedForcedAllUsd
  );

  // Limite superior deliberadamente conservador: 24 estados, cada um contendo o
  // alvo e três fillers. Não corresponde às seis fixtures hoje materializadas.
  const ungroupedConditionalUsd = round(sum(baselineRows, "costUsd") * productionSeedMultiplier);
  const ungroupedForcedAllUsd = round(agentProjectionUsd * productionSeedMultiplier);
  const ungroupedForcedAllWithPanelUsd = round(ungroupedForcedAllUsd + historicalJudgePanelUsd);

  return {
    schemaVersion: "educaoff-campaign4-cost-estimate-v1",
    basis: {
      model: "google/gemini-3.5-flash",
      exercises,
      replicas,
      observedCalls: baselineRows.length,
      observedCostUsd: round(sum(baselineRows, "costUsd")),
      observedTokensIn: sum(baselineRows, "tokensIn"),
      observedTokensOut: sum(baselineRows, "tokensOut"),
      note: "Projeção por médias observadas; não é cotação nem garantia de custo futuro.",
    },
    observedByAgent: summary,
    projectedByAgent,
    projection: {
      controlledOneSeedForcedAllAgentsUsd: agentProjectionUsd,
      historicalThreeJudgePanelUsd: historicalJudgePanelUsd,
      controlledOneSeedPlusHistoricalPanelUsd: projectedWithHistoricalPanelUsd,
      productionBatchedFourSeedConditional3cUsd: batchedConditionalUsd,
      productionBatchedFourSeedForcedAllAgentsUsd: batchedForcedAllUsd,
      productionBatchedFourSeedForcedAllPlusHistoricalPanelUsd: batchedForcedAllWithPanelUsd,
      pilotThreeStatesConditional3cUsd: pilotConditionalUsd,
      pilotThreeStatesForcedAllAgentsUsd: pilotForcedAllUsd,
      upperUngroupedFourSeedConditional3cUsd: ungroupedConditionalUsd,
      upperUngroupedFourSeedForcedAllAgentsUsd: ungroupedForcedAllUsd,
      upperUngroupedFourSeedForcedAllPlusHistoricalPanelUsd: ungroupedForcedAllWithPanelUsd,
      recommendedHardCapWithoutJudgesUsd: 10,
      recommendedHardCapWithHistoricalPanelUsd: 12,
      rationale: [
        "A projeção principal usa as seis fixtures materializadas, quatro seeds por estado e pontuação por problemId.",
        "A hipótese linear mantém o custo total próximo ao histórico: chamadas quatro vezes maiores, porém quatro vezes menos numerosas.",
        "O cenário upperUngrouped supõe 24 estados de quatro seeds e não corresponde ao desenho agrupado escolhido.",
        "Os tetos cobrem entrada mais longa, variação de saída, smoke test e retries sem aumento automático."
      ],
      assumptions: {
        batchSize,
        stateRuns,
        pilotStates,
        pilotReplicas,
        operationalAgent3cCallRate: round(operational3cRate, 8),
        withinCallCostScalesLinearlyWithSeedCount: true
      }
    },
    networkCalls: 0,
    paidCalls: 0,
  };
}

export function loadHistoricalRows(manifestDir = DEFAULT_MANIFEST_DIR) {
  const baselineFiles = [1, 2, 3].map((replica) =>
    path.join(manifestDir, `base-gemini-r${replica}.jsonl`)
  );
  const judgeFiles = [
    "painel-llama-4-maverick.jsonl",
    "painel-mistral-large-2512.jsonl",
    "painel-qwen3-7-plus.jsonl",
  ].map((name) => path.join(manifestDir, name));
  return {
    baselineRows: baselineFiles.flatMap(readJsonl),
    judgeRows: judgeFiles.filter(fs.existsSync).flatMap(readJsonl),
  };
}

function main() {
  const { baselineRows, judgeRows } = loadHistoricalRows();
  process.stdout.write(`${JSON.stringify(projectCampaign({ baselineRows, judgeRows }), null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
