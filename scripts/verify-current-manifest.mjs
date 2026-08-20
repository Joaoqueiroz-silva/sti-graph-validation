#!/usr/bin/env node

/**
 * Manifesto de integridade da versão auditada atual (v0.7).
 *
 * Cobre exatamente os arquivos vistos pelo Git, incluindo arquivos ainda não
 * adicionados durante `--write`, e exclui apenas o próprio manifesto para
 * evitar autorreferência. Manifestos antigos continuam cobertos como artefatos
 * históricos, mas não descrevem a árvore atual.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const MANIFEST_REL = "protocol/MANIFEST-v0.7.sha256";
const MANIFEST = path.join(REPO, MANIFEST_REL);
const WRITE = process.argv.includes("--write");

const sha256 = (arquivo) => crypto.createHash("sha256").update(fs.readFileSync(arquivo)).digest("hex");

function arquivosPublicaveis() {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: REPO })
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .filter((rel) => rel !== MANIFEST_REL && fs.existsSync(path.join(REPO, rel)))
    .sort();
}

function gerar() {
  return arquivosPublicaveis().map((rel) => `${sha256(path.join(REPO, rel))}  ${rel}`).join("\n") + "\n";
}

if (WRITE) {
  fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
  fs.writeFileSync(MANIFEST, gerar());
  console.log(`Manifesto atual gravado: ${MANIFEST_REL} (${arquivosPublicaveis().length} arquivos; o próprio manifesto é excluído).`);
  process.exit(0);
}

if (!fs.existsSync(MANIFEST)) {
  console.error(`Manifesto atual ausente: ${MANIFEST_REL}. Rode npm run manifest:write e revise o diff.`);
  process.exit(1);
}
const esperado = fs.readFileSync(MANIFEST, "utf8");
const atual = gerar();
if (atual !== esperado) {
  const parse = (texto) => new Map(texto.trim().split("\n").filter(Boolean).map((linha) => {
    const m = linha.match(/^([a-f0-9]{64})  (.+)$/);
    return m ? [m[2], m[1]] : [linha, null];
  }));
  const a = parse(esperado);
  const b = parse(atual);
  const ausentes = [...a.keys()].filter((p) => !b.has(p));
  const novos = [...b.keys()].filter((p) => !a.has(p));
  const alterados = [...a.keys()].filter((p) => b.has(p) && a.get(p) !== b.get(p));
  console.error(`Manifesto atual diverge: ${alterados.length} alterado(s), ${novos.length} novo(s), ${ausentes.length} ausente(s).`);
  for (const [rotulo, xs] of [["alterado", alterados], ["novo", novos], ["ausente", ausentes]]) {
    for (const p of xs.slice(0, 20)) console.error(`- ${rotulo}: ${p}`);
  }
  console.error("Rode npm run manifest:write somente depois de revisar e aceitar as mudanças.");
  process.exit(1);
}
console.log(`Manifesto atual verificado: ${arquivosPublicaveis().length} arquivos íntegros e cobertura exata da árvore publicável.`);
