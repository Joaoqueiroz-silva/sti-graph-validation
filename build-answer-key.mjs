#!/usr/bin/env node
/**
 * build-answer-key.mjs — Gabarito INDEPENDENTE do grafo (gate G4 do plano mestre).
 *
 * 2026-07-12 (W1/G4): o parecer externo apontou que o Envelope A (entrada dos agentes)
 * era derivado do MESMO `.brd` que contém o grafo do especialista — logo, não era uma
 * fonte independente. Este script materializa a fonte que É independente e ANTERIOR ao
 * grafo: a tabela de mass production do CTAT (`_interface/massproduction.txt`), a planilha
 * TSV (variáveis × 24 exercícios) que o autor humano preencheu ANTES de exemplificar o
 * grafo no Example-tracing Tutor. Dela extraímos, por exercício: enunciado, gabarito
 * (%(frac)%), numerador/denominador e a configuração da interface.
 *
 * Saída (determinística — rodar de novo gera JSON idêntico):
 *   answer-key/frac-numberline-6.17.json  — gabarito + config de interface por exercício
 *   answer-key/PROVENIENCIA.md            — fonte, data, sha256, regra de exclusão
 *
 * Uso: node build-answer-key.mjs
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.join(HERE, "cases/ctat-6.17/_interface/massproduction.txt");
const OUT_DIR = path.join(HERE, "answer-key");
const DATASET = "frac-numberline-6.17";

// ───────────────────────── lista de exclusão EXPLÍCITA ─────────────────────────
// 2026-07-12 (W1/G4): estas variáveis da mass production NÃO entram no gabarito,
// porque contaminariam o Envelope A com material do grafo do especialista:
export const EXCLUDED_VARIABLES = {
  // Referencia um NÓ/ESTADO do grafo do especialista (ex.: "showFrac") — é um
  // artefato do grafo, não da interface; incluí-lo recriaria a dependência.
  startStateNodeName: "referencia estado do grafo do especialista",
  // DICAS por passo — são material do Envelope B (só comparação), jamais entrada.
  "div-h1": "dica (material do Envelope B)",
  "div-h2": "dica (material do Envelope B)",
  "line-h": "dica (material do Envelope B)",
  "num-h": "dica (material do Envelope B)",
  // FEEDBACK de sucesso — idem: mensagem pedagógica do grafo, não interface.
  goodjob: "feedback de sucesso (material do Envelope B)",
  // KCs/skills só existem NO GRAFO (bloco <productionRule> do especialista).
  // Ficam FORA do Envelope A v2 — uma ablação futura medirá o impacto de tê-los.
  skillName: "KC — só existe no grafo; fora do Envelope A v2 (ablação futura)",
  skillLabel: "KC — só existe no grafo; fora do Envelope A v2 (ablação futura)",
};

// Variáveis que ENTRAM (tudo que descreve o problema e a interface, pré-grafo).
const STATEMENT_FIELDS = ["statement", "statement2"];
const ANSWER_FIELDS = { frac: "correctAnswer", num: "numerator", den: "denominator" };
const INTERFACE_CONFIG_FIELDS = [
  "rBound",
  "label_aid",
  "line_name",
  "fracBox",
  "mfNum_box",
  "mfNum",
  "doubleDiv",
  "badCount",
  "divorunit",
];

// ───────────────────────── parser do TSV ─────────────────────────

/** Desfaz o quoting estilo CSV que o export aplica em células com aspas/vírgulas. */
function unquote(cell) {
  const s = String(cell ?? "").trim();
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1).replace(/""/g, '"').trim();
  }
  return s;
}

/**
 * Normaliza uma célula: "-" (célula vazia da planilha) → null; inteiro puro → Number;
 * o resto fica string ("1/4", "divisions", "%(frac)%"...). Regra única e documentada
 * também em PROVENIENCIA.md — sem casos especiais por coluna.
 */
function normalizeValue(cell) {
  if (cell === "-" || cell === "") return null;
  if (/^-?\d+$/.test(cell)) return Number(cell);
  return cell;
}

/**
 * parseMassProduction(tsv) → { ids, rows } onde rows = Map(nomeDaVariável → [24 células]).
 * Nome da variável vem sem os delimitadores %(...)%.
 */
export function parseMassProduction(tsv) {
  const lines = String(tsv)
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "");
  const header = lines[0].split("\t").map(unquote);
  if (header[0] !== "Problem Name") {
    throw new Error(`massproduction: header inesperado ("${header[0]}" ≠ "Problem Name")`);
  }
  const ids = header.slice(1);

  const rows = new Map();
  for (const line of lines.slice(1)) {
    const cells = line.split("\t").map(unquote);
    const name = cells[0].replace(/^%\(/, "").replace(/\)%$/, "");
    if (!name) continue;
    rows.set(name, cells.slice(1));
  }
  return { ids, rows };
}

/** Monta o gabarito completo (objeto pronto para serializar). Puro e determinístico. */
export function buildAnswerKey(tsv) {
  const { ids, rows } = parseMassProduction(tsv);
  const cell = (varName, i) => {
    const r = rows.get(varName);
    return r ? (r[i] ?? "") : "";
  };

  const exercises = ids.map((id, i) => {
    const interfaceConfig = {};
    for (const f of INTERFACE_CONFIG_FIELDS) interfaceConfig[f] = normalizeValue(cell(f, i));
    const ex = {
      id,
      statement: normalizeValue(cell("statement", i)),
      statement2: normalizeValue(cell("statement2", i)),
    };
    for (const [src, dst] of Object.entries(ANSWER_FIELDS)) ex[dst] = normalizeValue(cell(src, i));
    ex.interfaceConfig = interfaceConfig;
    return ex;
  });

  return {
    schemaVersion: "answer-key-v1",
    dataset: DATASET,
    source: "cases/ctat-6.17/_interface/massproduction.txt",
    sourceSha256: crypto.createHash("sha256").update(tsv).digest("hex"),
    excludedVariables: Object.keys(EXCLUDED_VARIABLES),
    exercises,
  };
}

// ───────────────────────── PROVENIENCIA.md ─────────────────────────

function buildProveniencia(key, extractionDate) {
  const excl = Object.entries(EXCLUDED_VARIABLES)
    .map(([name, why]) => `| \`%(${name})%\` | ${why} |`)
    .join("\n");
  return `# Proveniência — \`${DATASET}.json\`

## Fonte

- **Arquivo**: \`${key.source}\` — tabela de *mass production* do CTAT
  (TSV: variáveis × ${key.exercises.length} exercícios), preenchida pelo autor humano ANTES da
  exemplificação do grafo no *Example-tracing Tutor*. É, portanto, uma fonte
  INDEPENDENTE e ANTERIOR ao grafo do especialista (\`expert.brd\`).
- **sha256 do arquivo-fonte**: \`${key.sourceSha256}\`
- **Data da extração**: ${extractionDate}
- **Gerado por**: \`build-answer-key.mjs\` (determinístico; rodar de novo reproduz o JSON byte a byte)

## Regra de exclusão

Variáveis da mass production que NÃO entram no gabarito, porque pertencem ao
grafo do especialista (Envelope B) e contaminariam a entrada dos agentes:

| variável | motivo |
| -------- | ------ |
${excl}

Os KCs (\`skillName\`/\`skillLabel\`) ficam fora do Envelope A **v2** por decisão
registrada: só existem no grafo do especialista; uma ablação futura medirá o
impacto de fornecê-los.

## Regra de normalização de células

- \`"-"\` (célula vazia da planilha) → \`null\`
- inteiro puro (\`/^-?\\d+$/\`) → número
- resto → string (frações como \`"1/4"\` permanecem strings; \`statement\`/\`statement2\` idem)
- células com quoting CSV (aspas externas, \`""\` internas) são desfeitas e aparadas
`;
}

// ───────────────────────── CLI ─────────────────────────

function main() {
  const tsv = fs.readFileSync(SOURCE, "utf8");
  const key = buildAnswerKey(tsv);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const jsonPath = path.join(OUT_DIR, `${DATASET}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(key, null, 2) + "\n");
  fs.writeFileSync(
    path.join(OUT_DIR, "PROVENIENCIA.md"),
    buildProveniencia(key, new Date().toISOString().slice(0, 10))
  );

  console.log(`✓ ${path.relative(process.cwd(), jsonPath)} — ${key.exercises.length} exercícios`);
  console.log(`  sha256(fonte) = ${key.sourceSha256}`);
  const missing = key.exercises.filter((e) => !e.correctAnswer);
  if (missing.length) {
    console.error(`❌ ${missing.length} exercício(s) sem correctAnswer: ${missing.map((e) => e.id)}`);
    process.exitCode = 2;
  } else {
    console.log("✓ todos os exercícios têm correctAnswer (coluna %(frac)%)");
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
