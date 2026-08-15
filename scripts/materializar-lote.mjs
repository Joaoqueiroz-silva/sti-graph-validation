#!/usr/bin/env node
/**
 * scripts/materializar-lote.mjs — reprocessa os registros de uma pasta de
 * runs (rodada 3) pela MATERIALIZAÇÃO de produção (agent 6 + agent 7
 * portados) e grava, por registro, o grafo materializado ao lado do original.
 * Não regenera os alunos: usa bruto.tracos. Só a materialização custa LLM
 * (papel "materializacao" do perfil; ver config/modelos.json).
 *
 * Saída: <out>/runs/<mesmo nome>.json com o registro original + bloco
 * `materializado: { grafo, exercicio, telemetria, modelos }`, mais manifests/.
 * Uso:
 *   node -r dotenv/config scripts/materializar-lote.mjs --runs <dir> --out <dir> [--limit N] [--yes] [--plano]
 */
import fs from "node:fs";
import path from "node:path";
import { resolverModelos } from "../config/resolver-modelos.js";

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const RUNS = opt("--runs", null);
const OUT = opt("--out", null);
const LIMIT = parseInt(opt("--limit", "0"), 10) || 0;
const YES = argv.includes("--yes");
const PLANO = argv.includes("--plano");
if (!RUNS || !OUT) { console.error("uso: --runs <dir> --out <dir> [--limit N] [--yes] [--plano]"); process.exit(2); }

const DATASET = "datasets/frac-numberline-6.17/problems";
const arquivos = fs.readdirSync(RUNS).filter((f) => f.endsWith(".json")).sort();
const alvo = LIMIT ? arquivos.slice(0, LIMIT) : arquivos;
const resolucao = resolverModelos({ argv: [] });
// ~1 planner + 1 worker por registro; worker ~4-6k tokens
const estUsd = alvo.length * 0.02;
console.log(`MATERIALIZAÇÃO — ${alvo.length} registros de ${RUNS}`);
console.log(`  modelo do papel materializacao: ${resolucao.porAgente.materializacao} | estimativa ~US$ ${estUsd.toFixed(2)} (planner + worker por registro)`);
if (PLANO) { console.log("--plano: nada chamado."); process.exit(0); }
if (!YES) { console.error("execução PAGA: confirme com --yes"); process.exit(1); }
if (!process.env.OPENROUTER_API_KEY) { console.error("OPENROUTER_API_KEY ausente"); process.exit(1); }

process.env.STI_RUNS_DIR = OUT;
process.env.STI_RUN_ID = `materializacao-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const { materializarRegistro } = await import("../materializar-registro.js");
fs.mkdirSync(path.join(OUT, "runs"), { recursive: true });

let ok = 0; const falhas = [];
for (const [i, f] of alvo.entries()) {
  const reg = JSON.parse(fs.readFileSync(path.join(RUNS, f), "utf8"));
  const ex = reg.exercicio ?? reg.id;
  try {
    const envelopeA = JSON.parse(fs.readFileSync(path.join(DATASET, ex, "envelope-a.json"), "utf8"));
    const m = await materializarRegistro(reg, envelopeA);
    const saida = { ...reg, materializado: { grafo: m.grafoMaterializado, problemaFixo: m.problemaFixo, exercicio: m.exercicio, telemetria: m.telemetria, modelos: { materializacao: resolucao.porAgente.materializacao, perfil: resolucao.perfil } } };
    fs.writeFileSync(path.join(OUT, "runs", f), JSON.stringify(saida, null, 1));
    ok++;
    console.log(`[${i + 1}/${alvo.length}] ${f}: passos ${m.telemetria.passosGenericos}→${m.telemetria.passosMaterializados} | valores ${JSON.stringify(m.grafoMaterializado.passos.map((p) => p.valor))} | problema fixo: ${m.problemaFixo.aprovado ? 'APROVADO' : 'REPROVADO ' + JSON.stringify(m.problemaFixo.valoresEstranhos.slice(0,3))}`);
  } catch (e) {
    falhas.push({ f, erro: e.message.slice(0, 200) });
    console.log(`[${i + 1}/${alvo.length}] ${f}: FALHOU — ${e.message.slice(0, 120)}`);
  }
}
fs.writeFileSync(path.join(OUT, "meta.json"), JSON.stringify({ geradoEm: new Date().toISOString(), origem: RUNS, registros: alvo.length, ok, falhas, modelos: resolucao }, null, 1));
console.log(`✓ materialização: ${ok}/${alvo.length} registros em ${OUT}${falhas.length ? ` (${falhas.length} falhas)` : ""}`);
