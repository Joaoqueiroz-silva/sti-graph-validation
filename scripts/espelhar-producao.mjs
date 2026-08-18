#!/usr/bin/env node
/**
 * scripts/espelhar-producao.mjs — ESPELHO byte a byte dos agentes de produção
 * (docs/PLANO-PORT-AGENTES-2026-08.md §3; multi-versão desde 2026-08-17).
 *
 * A partir do repositório/worktree de produção (--fonte <dir do repo>) calcula
 * o FECHO de imports relativos das entradas (agents 3, GraphForge, catálogo de
 * erros, agent 6, agent 7), exceto os módulos substituídos por ADAPTADORES
 * (pipeline-core, lib/logger, ontology-client, agent-stream-hub — nunca
 * sobrescritos), e:
 *   --write   copia cada arquivo do fecho para producao/<caminho relativo a
 *             backend/> e grava producao/COMMIT-FONTE.txt (commit) e
 *             producao/ESPELHO.sha256 (hash de cada arquivo espelhado);
 *   --verify  confere que cada arquivo em producao/ listado em ESPELHO.sha256
 *             tem o hash gravado (integridade local) e, se --fonte for dado,
 *             que bate com a fonte (integridade contra a produção).
 * Nunca edita agente: só copia.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const FONTE = opt("--fonte", null);
const WRITE = argv.includes("--write");
const VERIFY = argv.includes("--verify");
const RAIZ = process.cwd();
const ESPELHO = path.join(RAIZ, "producao");
const ADAPTADORES = new Set(["agents/pipeline-core.js", "lib/logger.js", "agents/ontology-client.js", "agents/agent-stream-hub.js"]);
// Arquivos de DADOS lidos por fs (não por import) — entram no espelho e no hash.
const DADOS = ["data/misconceptions.json"];
// DIRETÓRIOS varridos em tempo de execução (readdirSync + import dinâmico), que
// o fecho de imports estáticos NÃO alcança (2026-08-18, auditoria): o registro
// de componentes descobre cada manifesto por varredura — com 6 dos 44
// componentes o CATÁLOGO no prompt do worker do agent 6 fica menor que o de
// produção. Todo .js destes diretórios entra no espelho.
const DIRETORIOS_VARRIDOS = ["agents/component-registry/components"];
const ENTRADAS = [
  // 2026-08-17: os dois módulos OPCIONAIS do agent 6 (import dinâmico em
  // try/catch) que RODAM em produção fora do modo caderno — guarda de payload
  // e sanitizer de consistência — entram como entradas explícitas (fecho
  // pequeno: logger, answer-shape, request-context). Antes ficavam de fora e o
  // agente "seguia sem eles" (fidelidade menor). component-router é só do
  // caderno (célula C) e fica fora.
  "agents/nodes/agent6-payload-guard.js",
  "agents/step-consistency-sanitizer.js",
  "agents/nodes/agents3-students.js",
  "agents/graphforge.js",
  "agents/misconceptions-db.js",
  "agents/diagnostics/step-error-catalog.js",
  "agents/nodes/agent6-story.js",
  "agents/nodes/agent7-adapter.js",
  "agents/patterns/quality-gate.js",
];
const sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");

function fecho(backendDir) {
  const vistos = new Set();
  const fila = [...ENTRADAS];
  while (fila.length) {
    const rel = fila.shift();
    if (vistos.has(rel) || ADAPTADORES.has(rel)) continue;
    const abs = path.join(backendDir, rel);
    if (!fs.existsSync(abs)) { console.warn("  (fecho) não existe na fonte:", rel); continue; }
    vistos.add(rel);
    const src = fs.readFileSync(abs, "utf8");
    // Só imports ESTÁTICOS no fecho; os dinâmicos que importam em produção
    // (payload-guard, sanitizer) estão em ENTRADAS; component-router (só
    // caderno) fica fora por decisão declarada (docs/GUIA-DO-ARTIGO.md §11).
    for (const m of src.matchAll(/(?:import|export)[^"'`;]*?from\s*["'](\.[^"']+)["']|^\s*import\s+["'](\.[^"']+)["']/gm)) {
      const spec = m[1] || m[2];
      let alvo = path.normalize(path.join(path.dirname(rel), spec)).replace(/\\/g, "/");
      if (!/\.(m?js|json)$/.test(alvo)) alvo += fs.existsSync(path.join(backendDir, alvo + ".js")) ? ".js" : "";
      if (fs.existsSync(path.join(backendDir, alvo)) && fs.statSync(path.join(backendDir, alvo)).isFile()) fila.push(alvo);
      else if (fs.existsSync(path.join(backendDir, alvo, "index.js"))) fila.push(alvo + "/index.js");
    }
  }
  return [...vistos].sort();
}

if (WRITE) {
  if (!FONTE) { console.error("--write exige --fonte <repo de produção>"); process.exit(2); }
  const backend = path.join(FONTE, "backend");
  const commit = execSync("git rev-parse HEAD", { cwd: FONTE }).toString().trim();
  const varridos = DIRETORIOS_VARRIDOS.flatMap((d) => {
    const abs = path.join(backend, d);
    return fs.existsSync(abs) ? fs.readdirSync(abs).filter((f) => f.endsWith(".js")).map((f) => `${d}/${f}`) : [];
  });
  const arquivos = [...new Set([...fecho(backend), ...DADOS, ...varridos])].sort();
  let copiados = 0, iguais = 0;
  const linhas = [];
  for (const rel of arquivos) {
    const src = path.join(backend, rel), dst = path.join(ESPELHO, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    if (fs.existsSync(dst) && sha(dst) === sha(src)) iguais++;
    else { fs.copyFileSync(src, dst); copiados++; }
    linhas.push(`${sha(dst)}  ${rel}`);
  }
  fs.writeFileSync(path.join(ESPELHO, "COMMIT-FONTE.txt"), commit + "\n");
  fs.writeFileSync(path.join(ESPELHO, "ESPELHO.sha256"), linhas.join("\n") + "\n");
  console.log(`espelho: ${arquivos.length} arquivos no fecho | copiados/atualizados ${copiados} | já idênticos ${iguais} | commit-fonte ${commit.slice(0, 12)}`);
}
if (VERIFY) {
  const lista = fs.readFileSync(path.join(ESPELHO, "ESPELHO.sha256"), "utf8").trim().split("\n").map((l) => l.split(/\s+/));
  let falhas = 0;
  for (const [h, rel] of lista) {
    const p = path.join(ESPELHO, rel);
    if (!fs.existsSync(p) || sha(p) !== h) { console.error("  ✗ espelho alterado:", rel); falhas++; continue; }
    if (FONTE) { const q = path.join(FONTE, "backend", rel); if (!fs.existsSync(q) || sha(q) !== h) { console.error("  ✗ difere da fonte:", rel); falhas++; } }
  }
  console.log(`verify espelho: ${lista.length} arquivos, ${falhas} falha(s)`);
  if (falhas) process.exit(1);
}
