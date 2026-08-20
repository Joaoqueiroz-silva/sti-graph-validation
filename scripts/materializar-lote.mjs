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
 *   node -r dotenv/config scripts/materializar-lote.mjs --runs <dir> --out <dir> [--limit N]
 *     [--input-policy historico-v1|somente-enunciado-v1]
 *     [--modelo-materializacao <id>] [--resume] [--fail-fast]
 *     [--retry-orphans] [--yes] [--plano]
 */
import fs from "node:fs";
import path from "node:path";
import { resolverModelos } from "../config/resolver-modelos.js";
import {
  resolverInputPolicy,
  validarCompatibilidadeInputPolicy,
} from "../input-policy.js";
import { resolverPoliticaReasoning } from "../reasoning-policy.js";

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const RUNS = opt("--runs", null);
const OUT = opt("--out", null);
const LIMIT = parseInt(opt("--limit", "0"), 10) || 0;
const YES = argv.includes("--yes");
const PLANO = argv.includes("--plano");
const INTERFACE_FIXA = argv.includes("--interface-fixa");
const RESUME = argv.includes("--resume");
const FAIL_FAST = argv.includes("--fail-fast");
const RETRY_ORPHANS = argv.includes("--retry-orphans");
const INPUT_POLICY_OPT = opt("--input-policy", null);
const MODELO_MATERIALIZACAO = opt("--modelo-materializacao", null);
const inputPolicyIndex = argv.indexOf("--input-policy");
if (
  inputPolicyIndex >= 0 &&
  (!argv[inputPolicyIndex + 1] || argv[inputPolicyIndex + 1].startsWith("--"))
) {
  console.error("--input-policy exige historico-v1 ou somente-enunciado-v1");
  process.exit(2);
}
if (!RUNS || !OUT) { console.error("uso: --runs <dir> --out <dir> [--limit N] [--input-policy <id>] [--yes] [--plano]"); process.exit(2); }
if (RETRY_ORPHANS && !RESUME) { console.error("--retry-orphans exige --resume"); process.exit(2); }
if (!fs.existsSync(RUNS) || !fs.statSync(RUNS).isDirectory()) {
  console.error(`--runs não é um diretório: ${RUNS}`);
  process.exit(2);
}
if (fs.existsSync(OUT) && !fs.statSync(OUT).isDirectory()) {
  console.error(`--out não é um diretório: ${OUT}`);
  process.exit(2);
}
if (!RESUME && fs.existsSync(OUT) && fs.readdirSync(OUT).length) {
  console.error(`--out deve ser novo/vazio; use --resume para continuar com segurança: ${OUT}`);
  process.exit(2);
}

import { problemsDirRelativo } from "../dataset-config.js";
const DATASET = problemsDirRelativo();
const arquivos = fs.readdirSync(RUNS).filter((f) => f.endsWith(".json")).sort();
const alvo = LIMIT ? arquivos.slice(0, LIMIT) : arquivos;
if (!alvo.length) { console.error(`nenhum registro JSON encontrado em ${RUNS}`); process.exit(2); }
const politicaDoRegistro = (reg) =>
  resolverInputPolicy(INPUT_POLICY_OPT ?? reg.politicaInput?.id);
const preflight = alvo.map((f) => {
  const reg = JSON.parse(fs.readFileSync(path.join(RUNS, f), "utf8"));
  const interfaceFixa = INTERFACE_FIXA || reg.interfaceFixa === true;
  const politica = validarCompatibilidadeInputPolicy(politicaDoRegistro(reg), { interfaceFixa });
  const ex = reg.exercicio ?? reg.id;
  return { f, politica, ex };
});
const politicas = [...new Set(preflight.map((x) => x.politica))];
const resolucao = resolverModelos({
  argv: MODELO_MATERIALIZACAO
    ? ["--modelo", `materializacao=${MODELO_MATERIALIZACAO}`]
    : [],
});
const reasoningPolicy = resolverPoliticaReasoning().record;
// ~1 planner + 1 worker por registro; média observada ≈ US$ 0,006/run.
const estUsd = alvo.length * 0.006;
console.log(`MATERIALIZAÇÃO — ${alvo.length} registros de ${RUNS}`);
console.log(`  modelo do papel materializacao: ${resolucao.porAgente.materializacao} | estimativa ~US$ ${estUsd.toFixed(2)} (planner + worker por registro)`);
console.log(`  política(s) de input: ${politicas.join(", ")}`);
if (PLANO) { console.log("--plano: nada chamado."); process.exit(0); }
for (const item of preflight) {
  const envelopePath = path.join(DATASET, item.ex, "envelope-a.json");
  if (!fs.existsSync(envelopePath)) throw new Error(`preflight: envelope-a ausente: ${envelopePath}`);
  JSON.parse(fs.readFileSync(envelopePath, "utf8"));
}
if (!YES) { console.error("execução PAGA: confirme com --yes"); process.exit(1); }
if (!process.env.OPENROUTER_API_KEY) { console.error("OPENROUTER_API_KEY ausente"); process.exit(1); }

// O fallback interno de callLLM é uma nova tentativa no MESMO modelo. Esta
// atribuição ocorre antes do import dinâmico de materializar-registro/llm.js.
process.env.MODELO_MATERIALIZACAO = resolucao.porAgente.materializacao;
process.env.FALLBACK_MODEL = resolucao.porAgente.materializacao;
process.env.STI_RUNS_DIR = OUT;
const { materializarRegistro } = await import("../materializar-registro.js");
// versão dos agentes espelhados (producao/COMMIT-FONTE.txt) gravada em cada registro
const ESPELHO_COMMIT = fs.existsSync("producao/COMMIT-FONTE.txt") ? fs.readFileSync("producao/COMMIT-FONTE.txt", "utf8").trim() : null;
const plano = {
  schema: "sti-materialization-cell-v1",
  dataset: process.env.STI_DATASET || "frac-numberline-6.17",
  files: alvo,
  inputPolicies: politicas,
  interfaceFixa: INTERFACE_FIXA,
  model: resolucao.porAgente.materializacao,
  temperatures: { agent6_story: 0.5, agent6_worker: 0.35 },
  reasoning: reasoningPolicy,
};
const planoText = JSON.stringify(plano, null, 1) + "\n";
const { sha256 } = await import("../exec-manifest.js");
const planoHash = sha256(planoText);
const planoPath = path.join(OUT, "materialization-plan.json");
if (fs.existsSync(planoPath)) {
  if (fs.readFileSync(planoPath, "utf8") !== planoText) {
    throw new Error(`--resume recusado: materialization-plan.json não corresponde ao plano solicitado em ${OUT}`);
  }
} else if (RESUME && fs.existsSync(OUT) && fs.readdirSync(OUT).length) {
  throw new Error(`--resume recusado: diretório não vazio sem materialization-plan.json: ${OUT}`);
}
fs.mkdirSync(path.join(OUT, "runs"), { recursive: true });
if (!fs.existsSync(planoPath)) fs.writeFileSync(planoPath, planoText);

const safe = (s) => String(s).replace(/[^A-Za-z0-9._-]/g, "-");
const runIdFor = (f) => `materializacao-${planoHash.slice(0, 16)}-${safe(f.replace(/\.json$/i, ""))}`;
const manifestPathFor = (f) => path.join(OUT, "manifests", `${runIdFor(f)}.jsonl`);
const writeJsonAtomic = (file, value) => {
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 1) + "\n");
  fs.renameSync(tmp, file);
};

let ok = 0; const falhas = [];
for (const [i, f] of alvo.entries()) {
  const reg = JSON.parse(fs.readFileSync(path.join(RUNS, f), "utf8"));
  const ex = reg.exercicio ?? reg.id;
  const outputFile = path.join(OUT, "runs", f);
  if (fs.existsSync(outputFile)) {
    const existente = JSON.parse(fs.readFileSync(outputFile, "utf8"));
    if (
      (existente.exercicio ?? existente.id) !== ex ||
      existente?.politicaInput?.id !== politicaDoRegistro(reg) ||
      existente?.materializado?.modelos?.materializacao !== resolucao.porAgente.materializacao ||
      !existente?.materializado?.behaviorGraph
    ) {
      throw new Error(`--resume recusado: saída incompatível/corrompida ${outputFile}`);
    }
    ok++;
    console.log(`[${i + 1}/${alvo.length}] ${f}: ↷ já materializado; nenhuma chamada repetida`);
    continue;
  }
  const manifestPath = manifestPathFor(f);
  if (fs.existsSync(manifestPath) && fs.statSync(manifestPath).size > 0 && !RETRY_ORPHANS) {
    throw new Error(
      `retomada segura bloqueou ${f}: há recibos pagos sem saída final em ${manifestPath}; ` +
        `só repita conscientemente com --resume --retry-orphans`
    );
  }
  try {
    process.env.STI_RUN_ID = runIdFor(f);
    const envelopeA = JSON.parse(fs.readFileSync(path.join(DATASET, ex, "envelope-a.json"), "utf8"));
    const inputPolicy = politicaDoRegistro(reg);
    const m = await materializarRegistro(reg, envelopeA, {
      interfaceFixa: INTERFACE_FIXA || reg.interfaceFixa === true,
      inputPolicy,
    });
    // behaviorGraph bruto do agent 7 (auditoria: é DELE que passos/erros/dicas são extraídos)
    const behaviorGraph = {
      nodes: (m.behaviorGraph.nodes || []).map((n) => ({
        id: n.id, type: n.type, description: n.description, instruction: n.instruction,
        action: n.action ?? null, interactionFamily: n.interactionFamily ?? null,
        targetRole: n.targetRole ?? null,
        expectedInput: n.expectedInput ?? null, knowledgeComponents: n.knowledgeComponents ?? [],
        hints: n.hints ?? [], misconceptions: n.misconceptions ?? [], scaffoldNodes: n.scaffoldNodes ?? [],
        targetMisconception: n.targetMisconception,
      })),
      edges: m.behaviorGraph.edges || [],
    };
    const saida = {
      ...reg,
      politicaInput: {
        ...(reg.politicaInput || {}),
        id: m.politicaInput.id,
        materializacao: m.politicaInput.materializacao,
      },
      materializado: { grafo: m.grafoMaterializado, problemaFixo: m.problemaFixo, exercicio: m.exercicio, telemetria: m.telemetria, behaviorGraph, modelos: { materializacao: resolucao.porAgente.materializacao, perfil: resolucao.perfil, temperaturas: { agent6_story: 0.5, agent6_worker: 0.35 }, reasoning: reasoningPolicy }, espelho: ESPELHO_COMMIT },
    };
    writeJsonAtomic(outputFile, saida);
    ok++;
    console.log(`[${i + 1}/${alvo.length}] ${f}: passos ${m.telemetria.passosGenericos}→${m.telemetria.passosMaterializados} | dicas ${m.telemetria.dicasMaterializadas} | erros ${m.grafoMaterializado.erros.length} | valores ${JSON.stringify(m.grafoMaterializado.passos.map((p) => p.valor))} | problema fixo: ${m.problemaFixo.aprovado ? 'APROVADO' : 'REPROVADO ' + JSON.stringify(m.problemaFixo.valoresEstranhos.slice(0,3))}`);
  } catch (e) {
    falhas.push({ f, erro: e.message.slice(0, 200) });
    console.log(`[${i + 1}/${alvo.length}] ${f}: FALHOU — ${e.message.slice(0, 120)}`);
    if (FAIL_FAST) break;
  }
}
const manifestDir = path.join(OUT, "manifests");
const manifestFiles = fs.existsSync(manifestDir)
  ? fs.readdirSync(manifestDir).filter((f) => f.endsWith(".jsonl")).sort()
  : [];
const calls = manifestFiles.flatMap((f) =>
  fs.readFileSync(path.join(manifestDir, f), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
);
const wrongModel = calls.filter((c) => c.model !== resolucao.porAgente.materializacao);
if (wrongModel.length) {
  falhas.push({
    f: "manifests/",
    erro: `${wrongModel.length} chamada(s) usaram modelo diferente de ${resolucao.porAgente.materializacao}`,
  });
}
writeJsonAtomic(path.join(OUT, "meta.json"), { geradoEm: new Date().toISOString(), origem: RUNS, registros: alvo.length, ok, falhas, inputPolicies: politicas, modelos: { ...resolucao, temperaturas: { agent6_story: 0.5, agent6_worker: 0.35 }, reasoning: reasoningPolicy }, espelho: ESPELHO_COMMIT, manifestos: manifestFiles.length });
console.log(`✓ materialização: ${ok}/${alvo.length} registros em ${OUT}${falhas.length ? ` (${falhas.length} falhas)` : ""}`);
if (falhas.length || ok !== alvo.length) process.exitCode = 1;
