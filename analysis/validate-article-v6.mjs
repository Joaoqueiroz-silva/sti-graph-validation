#!/usr/bin/env node

/** Valida afirmações auditáveis do manuscrito v6 contra os artefatos canônicos. */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const DEFAULT_TEX = path.join(
  REPO,
  "docs",
  "manuscript",
  "v6.1",
  "artigo-validacao-agentes-comportamentais-v6.1.tex"
);
const DEFAULT_SUPPLEMENT = path.join(
  REPO,
  "docs",
  "manuscript",
  "v6.1",
  "suplemento-validacao-agentes-comportamentais-v6.1.tex"
);
const DEFAULT_REFERENCES = path.join(
  REPO,
  "docs",
  "manuscript",
  "v6.1",
  "referencias.tex"
);
const DEFAULT_FRONTMATTER = path.join(
  REPO,
  "docs",
  "manuscript",
  "v6.1",
  "frontmatter.tex"
);
const FINAL = path.join(
  REPO,
  "resultados",
  "campanha4-2026-07-15",
  "campaign4-final-analysis-v2.1.json"
);
const JUDGE = path.join(
  REPO,
  "resultados",
  "campanha4-2026-07-15",
  "judge-panel-v5",
  "judge-panel-analysis-v5.1.json"
);
const PLAN = path.join(
  REPO,
  "protocol",
  "production-freeze-2026-07-15",
  "campaign4-full-execution-plan.json"
);

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256File = (file) =>
  crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const approx = (actual, expected, tolerance = 1e-9) =>
  Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance;

function requireFact(condition, label, failures) {
  if (!condition) failures.push(label);
}

function requireText(tex, expression, label, failures) {
  requireFact(expression.test(tex), label, failures);
}

export function validateArticleV6({
  texPath = DEFAULT_TEX,
  supplementPath = DEFAULT_SUPPLEMENT,
  referencesPath = DEFAULT_REFERENCES,
  frontmatterPath = DEFAULT_FRONTMATTER,
} = {}) {
  const articleTex = fs.readFileSync(texPath, "utf8");
  const supplementTex = fs.readFileSync(supplementPath, "utf8");
  const referencesTex = fs.readFileSync(referencesPath, "utf8");
  const frontmatterTex = fs.readFileSync(frontmatterPath, "utf8");
  const tex = `${articleTex}\n${frontmatterTex}\n${supplementTex}`;
  const final = readJson(FINAL);
  const judge = readJson(JUDGE);
  const plan = readJson(PLAN);
  const failures = [];

  requireFact(final.schemaVersion === "educaoff-campaign4-final-analysis-v2.1", "schema C4 v2.1", failures);
  requireFact(plan.model === "google/gemini-3.5-flash", "modelo gerador", failures);
  requireFact(final.design.exercises === 24, "24 exercícios", failures);
  requireFact(final.design.replicas === 3, "três réplicas", failures);
  requireFact(final.design.stateReplicaUnitsCompleted === 17, "17 estados completos", failures);
  requireFact(final.design.stateReplicaUnitsFailed === 1, "um estado falho", failures);
  requireFact(final.execution.providerResponses === 53, "53 respostas do provedor", failures);
  requireFact(final.execution.plannedCalls === 54, "54 chamadas planejadas", failures);
  requireFact(approx(final.execution.total.accountedCostUsd, 1.9539885), "custo de geração C4", failures);
  requireFact(final.execution.graphForgeDeterminism.identicalPairs === 34, "34 pares GraphForge", failures);

  const a3a = final.directMetrics.agent3a;
  const a3b = final.directMetrics.agent3b;
  const a3c = final.directMetrics.agent3cCapacityArm;
  requireFact(approx(a3a.exactConcreteOrderedRecallItt.mean, 0), "recall 3a", failures);
  requireFact(approx(a3a.finalAnswerExactConcreteMatchItt.mean, 0.111), "resposta final 3a", failures);
  requireFact(approx(a3b.exactConcreteRecallByUniqueValueItt.mean, 0.176), "recall 3b", failures);
  requireFact(approx(a3c.strictProblemSuccessItt.mean, 0.278), "sucesso estrito 3c", failures);
  requireFact(approx(a3c.strictFourLevelValidityConditional.mean, 0.382), "validade estrita 3c", failures);
  requireFact(approx(a3c.literalFinalAnswerLeakageRateConditional.mean, 0.226), "vazamento 3c", failures);

  requireFact(final.transport.capacityArm.agent3a.rawItems === 272, "272 itens 3a", failures);
  requireFact(final.transport.capacityArm.agent3a.configItems === 60, "60 itens 3a preservados", failures);
  requireFact(final.transport.capacityArm.agent3b.rawErrorItems === 136, "136 erros 3b", failures);
  requireFact(final.transport.capacityArm.agent3b.configMisconceptionItems === 117, "117 erros 3b preservados", failures);
  requireFact(final.transport.capacityArm.agent3c.rawHintItems === 328, "328 dicas 3c", failures);
  requireFact(final.transport.capacityArm.agent3c.configHintItems === 272, "272 dicas 3c preservadas", failures);

  requireFact(judge.execution.networkCalls === 768, "768 chamadas do painel", failures);
  requireFact(judge.execution.validJudgments === 601, "601 julgamentos válidos", failures);
  requireFact(judge.execution.invalidJudgments === 65, "65 julgamentos inválidos", failures);
  requireFact(approx(judge.execution.accountedCostUsd, 1.243231545), "custo do painel", failures);
  requireFact(
    JSON.stringify(judge.execution.models) ===
      JSON.stringify(["z-ai/glm-5.2", "qwen/qwen3.7-plus", "deepseek/deepseek-v4-pro"]),
    "modelos do painel final",
    failures
  );

  requireText(
    tex,
    /Campanha 4[^.]{0,100}estudo principal|estudo principal[^.]{0,100}Campanha 4/,
    "manuscrito identifica C4 como principal",
    failures
  );
  requireText(tex, /Dezessete (?:de|dos) 18 estados/, "manuscrito relata 17 de 18 estados", failures);
  requireText(tex, /google\/gemini-3\.5-flash/, "manuscrito relata modelo gerador", failures);
  requireText(tex, /0,111 \(IC95\\% 0,028--0,222\)/, "manuscrito relata 3a e IC", failures);
  requireText(tex, /0,176 \(0,113--0,242\)/, "manuscrito relata 3b e IC", failures);
  requireText(tex, /0,278 \(0,167--0,403\)/, "manuscrito relata 3c e IC", failures);
  requireText(tex, /34\/34 pares de reexecução/, "manuscrito relata determinismo", failures);
  requireText(tex, /quatro identificadores de KC|três dos quatro KCs/i, "manuscrito relata quatro KCs", failures);
  requireText(tex, /não (?:(?:constitui|é) )?um pré-registro integral/, "manuscrito declara cronologia exploratória", failures);
  requireText(
    tex,
    /coleta externa integral[^.]{0,160}(?:imagem|snapshot)|não permite[^.]{0,120}repetir integralmente a coleta/,
    "manuscrito limita reprodutibilidade externa",
    failures
  );
  requireFact(!/três identificadores de KC/i.test(tex), "manuscrito ainda afirma três KCs", failures);
  requireText(
    tex,
    /não (?:demonstra|estabelece|sustenta)[^.]{0,80}equivalência a especialistas/,
    "manuscrito limita equivalência a especialistas",
    failures
  );
  requireText(
    tex,
    /(?:não estão validados|não estão prontos|não sustentam[^.]{0,100}prontos)[^.]{0,100}uso autônomo/,
    "manuscrito explicita juízo global de qualidade",
    failures
  );
  requireText(
    tex,
    /rascunhos assistivos|gerador assistivo de candidatos/,
    "manuscrito limita o papel atual a autoria assistiva",
    failures
  );
  requireText(
    tex,
    /(?:adequação|validade) pedagógica/i,
    "manuscrito separa qualidade observável de validade pedagógica",
    failures
  );
  requireText(tex, /não estimável/, "manuscrito explicita dimensões não estimáveis", failures);

  const hashedArtifacts = [
    "protocol/production-freeze-2026-07-15/campaign4-full-execution-plan.json",
    "production-fidelity/campaign4-metrics-v2.mjs",
    "resultados/campanha4-2026-07-15/campaign4-final-analysis-v2.1.json",
    "resultados/campanha4-2026-07-15/campaign4-batch-cluster-sensitivity-v1.json",
    "resultados/campanha4-2026-07-15/campaign4-completion-manifest-v1.json",
    "protocol/publication-redactions-v6.0.json",
    "resultados/campanha4-2026-07-15/judge-panel-v5/judge-panel-analysis-v5.1.json",
  ];
  for (const relative of hashedArtifacts) {
    const hash = sha256File(path.join(REPO, relative));
    requireFact(tex.includes(hash), `hash ausente ou obsoleto no artigo: ${relative}`, failures);
  }

  for (const match of tex.matchAll(/\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/g)) {
    const target = path.resolve(path.dirname(texPath), match[1]);
    requireFact(fs.existsSync(target), `figura ausente: ${match[1]}`, failures);
  }

  requireText(
    supplementTex,
    /72 pares exercício--réplica[\s\S]{0,500}437/,
    "suplemento identifica corretamente a matriz pooled da C1",
    failures
  );
  requireText(supplementTex, /163\/437=0,373/, "suplemento relata concordância pooled", failures);
  requireText(supplementTex, /kappa é \$-0,033\$/, "suplemento relata kappa pooled", failures);
  requireText(
    supplementTex,
    /Surpresa--surpresa é não observável por construção/,
    "suplemento marca surpresa--surpresa como não observável",
    failures
  );
  requireText(
    supplementTex,
    /72 em correto--correto não demonstra geração do caminho correto/,
    "suplemento limita a célula correto--correto",
    failures
  );

  const citationKeys = new Set(
    [...articleTex.matchAll(/\\cite[tp]?\{([^}]+)\}/g)]
      .flatMap((match) => match[1].split(","))
      .map((key) => key.trim())
  );
  const referenceKeys = new Set(
    [...referencesTex.matchAll(/\\bibitem(?:\[[^\]]*\])?\{([^}]+)\}/g)].map((match) => match[1])
  );
  for (const key of citationKeys) {
    requireFact(referenceKeys.has(key), `citação sem referência: ${key}`, failures);
  }
  for (const key of referenceKeys) {
    requireFact(citationKeys.has(key), `referência não citada: ${key}`, failures);
  }
  requireFact(!/Checklist para submissão editorial/.test(tex), "checklist editorial ainda está no manuscrito", failures);
  requireFact(!/Execução dos geradores e painel auxiliar:/.test(tex), "data interna ainda está na capa", failures);

  if (failures.length) {
    throw new Error(`Validação do artigo v6 falhou (${failures.length}):\n- ${failures.join("\n- ")}`);
  }
  return {
    status: "ok",
    article: path.relative(REPO, texPath),
    checkedFacts: 61,
    externalCalls: 0,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(validateArticleV6())}\n`);
}
