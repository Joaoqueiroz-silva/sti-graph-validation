#!/usr/bin/env node
/**
 * evaluation/materialize-dataset.mjs — Constrói um DATASET estruturado a partir dos `.brd`.
 *
 * Roda os parsers em CADA `expert.brd` do corpus e materializa, por problema:
 *   problems/<id>/envelope-a.json  — a INTERFACE (o que os AGENTES consomem p/ autorar, CEGO)
 *   problems/<id>/envelope-b.json  — o grafo do ESPECIALISTA (neutro) = gold p/ comparação
 *   problems/<id>/meta.json        — id, hash do .brd, resposta, KCs, contagens, vazamentos(=[])
 * + manifest.json                  — índice do dataset (versão, fonte, lista de problemas)
 *
 * É 100% DETERMINÍSTICO (sem LLM): rodar de novo gera arquivos idênticos. Os agentes depois
 * leem `envelope-a.json` direto (via authorFromEnvelopeA), sem reparsear o XML.
 *
 * ⚠️ Separação: `envelope-a.json` é o que o robô pode ler; `envelope-b.json` é só para a
 *   comparação. O builder verifica que o Envelope A não vazou (campo `leaks` deve ser []).
 *
 * Uso:
 *   node evaluation/materialize-dataset.mjs [corpusDir] [--out <dir>] [--name <nome>]
 *   node evaluation/materialize-dataset.mjs cases/ctat-6.17 --name frac-numberline-6.17
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  parseBrdToRobotInput,
  parseBrdToExpertNeutral,
  findLeaksInRobotInput,
} from "./parse-ctat-brd.js";

const SCHEMA_VERSION = 1;
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);

/**
 * Transforma UM `.brd` nos três artefatos do dataset. Pura e determinística (sem I/O, sem LLM).
 * @returns {{ envelopeA, envelopeB, meta }}
 */
export function buildProblemRecord(brdXml, id) {
  const envelopeA = parseBrdToRobotInput(brdXml, { id });
  const envelopeB = parseBrdToExpertNeutral(brdXml);
  const leaks = findLeaksInRobotInput(envelopeA); // anti-contaminação: deve ser []

  const meta = {
    id,
    source: "ctat-brd",
    brdSha256: sha256(brdXml),
    correctAnswer: envelopeA.correctAnswer,
    knowledgeComponents: envelopeA.knowledgeComponents.map((k) => k.id),
    counts: {
      components: envelopeA.components.length,
      steps: envelopeB.steps.length,
      misconceptions: envelopeB.misconceptions.length,
      mechanicalMisconceptions: envelopeB.misconceptions.filter((m) => m.mechanical).length,
    },
    leaks,
  };
  return { envelopeA, envelopeB, meta };
}

// ───────────────────────── CLI ─────────────────────────

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(p, "utf8");
const writeJson = (p, obj) => fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n");
const isProblemDir = (d) => fs.existsSync(path.join(d, "expert.brd"));

function parseArgs(argv) {
  const out = { corpus: "cases/ctat-6.17", outDir: null, name: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out") out.outDir = argv[++i];
    else if (argv[i] === "--name") out.name = argv[++i];
    else if (!argv[i].startsWith("--")) out.corpus = argv[i];
  }
  return out;
}

/** Gera o README do dataset (para publicação). */
function buildReadme(name, index) {
  const rows = index
    .map(
      (p) =>
        `| \`${p.id}\` | ${p.correctAnswer ?? ""} | ${p.counts.steps} | ${p.counts.misconceptions} | ${p.knowledgeComponents.length} |`
    )
    .join("\n");
  return `# Dataset \`${name}\` — Grafos de comportamento (CTAT × EducaOFF)

Dataset para validação de grafos de comportamento autorados automaticamente. Cada STI traz a
interface fixa de um problema, o grafo do especialista (autorado no CTAT, *Example-tracing Tutor*)
e a sua forma dividida em **dois envelopes**.

## Estrutura

\`\`\`
${name}/
├── manifest.json          índice do dataset (lista de STIs + contagens)
├── _interface/            a interface compartilhada (screenshot, HTML, assets)
└── problems/<id>/
    ├── expert.brd         grafo do especialista (XML original do CTAT)
    ├── envelope-a.json    ENTRADA (interface CEGA): enunciado, componentes, resposta, KCs
    ├── envelope-b.json    GOLD (grafo do especialista, esquema neutro): passos, misconceptions, transições
    └── meta.json          id, hash do .brd, resposta, KCs, contagens
\`\`\`

## Os dois envelopes (a ideia central)

- **\`envelope-a.json\`** é o que um agente/sistema recebe para autorar o grafo — **só a interface**,
  sem o caminho correto nem os erros do especialista (autoria CEGA, anti-contaminação).
- **\`envelope-b.json\`** é o **gold**: o grafo do especialista normalizado, usado **apenas na
  comparação** (F1 de nós, equivalência funcional, etc.). A âncora dos erros é o \`wrongAnswer\`.

## Como usar

1. Dê o \`envelope-a.json\` ao seu sistema → ele autora um grafo de comportamento.
2. Normalize-o ao mesmo esquema neutro do \`envelope-b.json\`.
3. Compare (F1 de nós, equivalência funcional, validade pedagógica por juiz).

## Problemas (${index.length})

| id | resposta | passos | misconceptions | KCs |
| -- | -------- | ------ | -------------- | --- |
${rows}

## Procedência e citação

Os \`expert.brd\` são exports do CTAT (Carnegie Learning / Carnegie Mellon). Dataset organizado pela
equipe EducaOFF. Ao usar, cite o artigo correspondente (referência a preencher).
`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const corpusRoot = path.isAbsolute(args.corpus) ? args.corpus : path.join(HERE, args.corpus);
  if (!fs.existsSync(corpusRoot)) {
    console.error(`Corpus não encontrado: ${corpusRoot}`);
    process.exit(1);
  }
  const name = args.name || path.basename(corpusRoot);
  const outDir = args.outDir
    ? path.isAbsolute(args.outDir)
      ? args.outDir
      : path.join(HERE, args.outDir)
    : path.join(HERE, "datasets", name);

  const dirs = fs
    .readdirSync(corpusRoot)
    .map((d) => path.join(corpusRoot, d))
    .filter((d) => fs.statSync(d).isDirectory() && isProblemDir(d))
    .sort();
  if (!dirs.length) {
    console.error(`Nenhum problema (com expert.brd) em ${corpusRoot}`);
    process.exit(1);
  }

  fs.mkdirSync(path.join(outDir, "problems"), { recursive: true });
  console.log(
    `Materializando ${dirs.length} problema(s) → ${path.relative(process.cwd(), outDir)}`
  );

  const index = [];
  let totalLeaks = 0;
  for (const dir of dirs) {
    const id = path.basename(dir);
    const { envelopeA, envelopeB, meta } = buildProblemRecord(
      read(path.join(dir, "expert.brd")),
      id
    );
    const probDir = path.join(outDir, "problems", id);
    fs.mkdirSync(probDir, { recursive: true });
    writeJson(path.join(probDir, "envelope-a.json"), envelopeA);
    writeJson(path.join(probDir, "envelope-b.json"), envelopeB);
    writeJson(path.join(probDir, "meta.json"), meta);
    fs.copyFileSync(path.join(dir, "expert.brd"), path.join(probDir, "expert.brd")); // .brd original junto
    totalLeaks += meta.leaks.length;
    index.push({
      id,
      correctAnswer: meta.correctAnswer,
      knowledgeComponents: meta.knowledgeComponents,
      counts: meta.counts,
      brdSha256: meta.brdSha256,
    });
    const c = meta.counts;
    console.log(
      `  ✓ ${id.padEnd(18)} resp=${String(meta.correctAnswer).padEnd(6)} ` +
        `KCs=${meta.knowledgeComponents.length} passos=${c.steps} erros=${c.misconceptions} ` +
        `${meta.leaks.length ? "❌ VAZOU" : "ok"}`
    );
  }

  // Interface compartilhada (se houver): COPIA pra dentro do dataset (auto-contido p/ preview).
  const ifaceSrc = path.join(corpusRoot, "_interface");
  let sharedInterface = null;
  if (fs.existsSync(ifaceSrc)) {
    const ifaceDst = path.join(outDir, "_interface");
    fs.cpSync(ifaceSrc, ifaceDst, { recursive: true });
    sharedInterface = { dir: "_interface", files: fs.readdirSync(ifaceDst) };
  }

  const manifest = {
    name,
    schemaVersion: SCHEMA_VERSION,
    source: `CTAT .brd (${path.relative(HERE, corpusRoot)})`,
    note: "Derivado de expert.brd via parse-ctat-brd.js — determinístico, sem LLM. envelope-a.json = entrada CEGA dos agentes; envelope-b.json = gold (só comparação).",
    problemCount: index.length,
    sharedInterface,
    problems: index,
  };
  writeJson(path.join(outDir, "manifest.json"), manifest);
  fs.writeFileSync(path.join(outDir, "README.md"), buildReadme(name, index));

  console.log(`\nmanifest: ${index.length} problemas · vazamentos totais: ${totalLeaks}`);
  if (totalLeaks > 0) {
    console.error("❌ HOUVE VAZAMENTO em algum Envelope A — abortar uso até investigar.");
    process.exitCode = 2;
  } else {
    console.log(
      "✅ Dataset materializado, 0 vazamentos. Os agentes podem consumir envelope-a.json."
    );
  }
  console.log(`Saída: ${path.relative(process.cwd(), outDir)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
