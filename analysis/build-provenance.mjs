#!/usr/bin/env node
/**
 * analysis/build-provenance.mjs — Manifesto de proveniência do corpus (gate G3).
 *
 * 2026-07-12 (Onda 2): nenhum exercício entra em campanha futura sem origem,
 * interface correspondente, hash e classificação de proveniência. Os campos que
 * dependem do pesquisador (autor do corpus, instituição, licença) ficam marcados
 * como PENDENTE, nunca inventados.
 *
 * Uso: node analysis/build-provenance.mjs  → corpus-provenance.json + PROVENANCE.md
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { parseBrdToExpertNeutral } from "../parse-ctat-brd.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CORPUS = path.join(ROOT, "cases", "ctat-6.17");
const sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");

const IFACE = path.join(CORPUS, "_interface");
const interfaceHashes = Object.fromEntries(
  fs
    .readdirSync(IFACE)
    .filter((f) => fs.statSync(path.join(IFACE, f)).isFile())
    .map((f) => [f, sha(path.join(IFACE, f))])
);

const exercises = fs
  .readdirSync(CORPUS)
  .filter((d) => fs.existsSync(path.join(CORPUS, d, "expert.brd")))
  .sort();

const items = exercises.map((id) => {
  const brdPath = path.join(CORPUS, id, "expert.brd");
  const xml = fs.readFileSync(brdPath, "utf8");
  const neutral = parseBrdToExpertNeutral(xml);
  const miscs = neutral.misconceptions || [];
  return {
    id,
    template: "frac-numberline-6.17",
    brd: { path: `cases/ctat-6.17/${id}/expert.brd`, sha256: sha(brdPath) },
    contagens: {
      passos: (neutral.steps || []).length,
      misconceptions: miscs.length,
      misconceptionsConceituais: miscs.filter((m) => !m.mechanical).length,
      misconceptionsMecanicas: miscs.filter((m) => m.mechanical).length,
      dicas: (neutral.hints || []).length,
      kcs: (neutral.knowledgeComponents || []).length,
    },
  };
});

const manifest = {
  geradoEm: "2026-07-12",
  corpus: "frac-numberline-6.17",
  dominio: "frações na reta numérica (6º ano)",
  idioma: "enunciados em inglês; subenunciado e dicas em português",
  ferramenta: "CTAT (Cognitive Tutor Authoring Tools, Carnegie Mellon) — tutores example-tracing",
  producao: "mass production sobre um único template (24 variações)",
  classificacaoProveniencia:
    "grafo de referência de autor único; ver campos pendentes abaixo",
  PENDENTE_autorDoCorpus: "PENDENTE: nome/formação/experiência do autor (informação do pesquisador)",
  PENDENTE_instituicao: "PENDENTE",
  PENDENTE_licencaRedistribuicao: "PENDENTE: confirmar direito de redistribuição dos .brd",
  PENDENTE_tempoAutoriaPorGrafo: "PENDENTE: coletar com o autor",
  interface: { arquivos: interfaceHashes },
  exercicios: items,
};

const OUT = path.join(ROOT, "corpus-provenance.json");
fs.writeFileSync(OUT, JSON.stringify(manifest, null, 2));

let md = `# Proveniência do corpus (gate G3)\n\nGerado por \`analysis/build-provenance.mjs\` em ${manifest.geradoEm}. Regra: nenhum exercício entra em campanha sem linha aqui; campos PENDENTE bloqueiam a alegação de "especialista identificado" no artigo (usar "grafo de referência").\n\n`;
md += `| Exercício | SHA-256 (12) | Passos | Misc. (conc.+mec.) | Dicas | KCs |\n|---|---|---|---|---|---|\n`;
for (const it of items) {
  const c = it.contagens;
  md += `| ${it.id} | \`${it.brd.sha256.slice(0, 12)}\` | ${c.passos} | ${c.misconceptionsConceituais}+${c.misconceptionsMecanicas} | ${c.dicas} | ${c.kcs} |\n`;
}
md += `\nInterface compartilhada: ${Object.entries(interfaceHashes)
  .map(([f, h]) => `\`${f}\` (${h.slice(0, 12)})`)
  .join(" · ")}\n`;
fs.writeFileSync(path.join(ROOT, "PROVENANCE.md"), md);

console.log(`✓ corpus-provenance.json (${items.length} exercícios) + PROVENANCE.md`);
