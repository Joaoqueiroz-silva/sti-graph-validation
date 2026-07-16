#!/usr/bin/env node

/**
 * Correcao analitica v5.1 do painel C4.
 *
 * O runner v5 representou Do=De=0 como alpha/kappa=1. Quando todas as notas de
 * uma dimensao (ou de um par) usam a mesma categoria, nao ha variacao para
 * estimar confiabilidade corrigida pelo acaso. Este pos-processamento preserva
 * contagens, escores, concordancia bruta, calibracao e resultados originais,
 * mas troca o coeficiente degenerado por null/nao_estimavel.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const SOURCE = path.join(
  REPO,
  "resultados",
  "campanha4-2026-07-15",
  "judge-panel-v5",
  "judge-panel-analysis.json"
);
const DEFAULT_OUTPUT = path.join(
  REPO,
  "resultados",
  "campanha4-2026-07-15",
  "judge-panel-v5",
  "judge-panel-analysis-v5.1.json"
);

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256File = (file) =>
  crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temp, file);
}

function nonzeroCategories(modelDistribution) {
  return Object.entries(modelDistribution?.counts || {})
    .filter(([, count]) => Number(count) > 0)
    .map(([category]) => Number(category));
}

function sameSingleCategory(distributions) {
  const categories = distributions.flatMap(nonzeroCategories);
  return categories.length > 0 && new Set(categories).size === 1;
}

export function correctJudgeDegeneracy({
  sourcePath = SOURCE,
  outputPath = DEFAULT_OUTPUT,
  write = true,
} = {}) {
  const source = readJson(sourcePath);
  const corrected = JSON.parse(JSON.stringify(source));
  corrected.schemaVersion = "educaoff-campaign4-judge-analysis-v5.1-degeneracy-correction";
  corrected.createdAt = source.createdAt;
  corrected.correction = {
    timing: "post-hoc-after-independent-statistical-audit",
    sourcePath: path.relative(REPO, sourcePath),
    sourceSha256: sha256File(sourcePath),
    scope:
      "only chance-corrected agreement coefficients with a single observed category; scores, raw agreement, calibration and execution unchanged",
    rule:
      "if all valid ratings in a dimension or model pair use one category, alpha/kappa is null and marked non-estimable",
  };

  let alphaDegenerate = 0;
  let kappaDegenerate = 0;
  for (const [role, dimensions] of Object.entries(corrected.agreement)) {
    for (const [dimension, agreement] of Object.entries(dimensions)) {
      const distribution = corrected.distribution[role][dimension];
      const modelDistributions = Object.values(distribution);
      if (sameSingleCategory(modelDistributions)) {
        agreement.alpha = null;
        agreement.interpretation = "nao_estimavel";
        agreement.alphaDegenerate = true;
        agreement.alphaDegenerateReason = "single_observed_category_zero_expected_disagreement";
        alphaDegenerate++;
      } else {
        agreement.alphaDegenerate = false;
      }

      for (const pair of agreement.pairwiseQuadraticWeightedKappa) {
        const pairDistributions = [distribution[pair.a], distribution[pair.b]];
        if (sameSingleCategory(pairDistributions)) {
          pair.kappa = null;
          pair.kappaDegenerate = true;
          pair.kappaDegenerateReason = "same_single_observed_category_in_both_marginals";
          kappaDegenerate++;
        } else {
          pair.kappaDegenerate = false;
        }
      }
    }
  }
  corrected.correction.alphaDegenerateDimensions = alphaDegenerate;
  corrected.correction.kappaDegeneratePairs = kappaDegenerate;
  corrected.correction.expectedAlphaDegenerateDimensions = 10;
  corrected.correction.expectedKappaDegeneratePairs = 33;
  if (alphaDegenerate !== 10 || kappaDegenerate !== 33) {
    throw new Error(
      `Correcao de degenerescencia bloqueada: alpha=${alphaDegenerate}/10, kappa=${kappaDegenerate}/33`
    );
  }
  corrected.limitations = [
    ...new Set([
      ...corrected.limitations,
      "dez de quinze dimensoes usam uma unica categoria e nao permitem estimar confiabilidade corrigida pelo acaso",
      "nas cinco dimensoes com variacao, o alfa ordinal foi fraco",
    ]),
  ];
  if (write) writeJson(outputPath, corrected);
  return { outputPath, corrected };
}

const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;

export function checkJudgeDegeneracy({ sourcePath = SOURCE, outputPath = DEFAULT_OUTPUT } = {}) {
  const { corrected } = correctJudgeDegeneracy({ sourcePath, outputPath, write: false });
  if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, "utf8") !== serialize(corrected)) {
    throw new Error(
      `Correcao do painel C4 ausente ou divergente: ${path.relative(REPO, outputPath)}`
    );
  }
  return { status: "ok", mode: "check", outputPath, corrected };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const mode = args[0]?.startsWith("--") ? args.shift() : "--write";
  if (!["--write", "--check"].includes(mode) || args.length > 1) {
    process.stderr.write(
      "Uso: node analysis/correct-campaign4-judge-degeneracy.mjs --write|--check [OUTPUT.json]\n"
    );
    process.exitCode = 2;
  } else {
    const outputPath = args[0] ? path.resolve(args[0]) : DEFAULT_OUTPUT;
    const { corrected } =
      mode === "--check"
        ? checkJudgeDegeneracy({ outputPath })
        : correctJudgeDegeneracy({ outputPath, write: true });
    process.stdout.write(
      `${JSON.stringify({
        status: mode === "--check" ? "ok" : "completed",
        mode,
        outputPath,
        alphaDegenerateDimensions: corrected.correction.alphaDegenerateDimensions,
        kappaDegeneratePairs: corrected.correction.kappaDegeneratePairs,
      })}\n`
    );
  }
}
