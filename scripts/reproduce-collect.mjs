#!/usr/bin/env node
/**
 * scripts/reproduce-collect.mjs - RE-COLETA paga do experimento final da
 * Campanha 5 como benchmark (npm run reproduce:collect). Este é o ÚNICO
 * caminho de reprodução que gera custo; reproduce:verify é grátis e offline.
 *
 * O que ele faz, na mesma régua do experimento depositado:
 *   1. lê o dataset congelado datasets/frac-numberline-6.17 (24 problemas);
 *   2. para cada problema x réplica, autora o grafo CEGO com a CONFIGURAÇÃO
 *      FINAL EXATA do braço 6: authorFromEnvelopeA(envelopeA, { renderedFacts })
 *      com o simulador simulate-students.js resolvido por
 *      resolveEvalStudentConfig (default qwen/qwen3-max, uma chamada por run);
 *   3. compara com o envelope-b (compareGraphs + functionalEquivalence,
 *      intocados) e grava cada run no MESMO formato flat de
 *      resultados/campanha5-2026-07-19/<braço>/runs/;
 *   4. agrega com bootstrap por cluster (10k, seed 42) e imprime a comparação
 *      com o summary.json depositado do braço final, métrica a métrica, com o
 *      critério de replicação: os ICs por cluster se sobrepõem?
 *
 * SEM FALLBACK SILENCIOSO DE MODELO: o fallback de emergência do cliente LLM é
 * fixado no MESMO modelo resolvido (retry, nunca troca de modelo) e, ao final,
 * o manifesto de chamadas é auditado; qualquer chamada com modelo diferente do
 * resolvido derruba a coleta com erro claro. Se a chave não suportar o modelo,
 * o erro HTTP da OpenRouter é propagado com o nome do modelo na mensagem.
 *
 * BENCHMARK PLUGÁVEL (--adapter caminho.mjs): pontua QUALQUER simulador na
 * mesma régua. O adaptador exporta uma função assíncrona
 * simulate({ envelopeA, renderedFacts, interfaceInventory }) que retorna
 * { correctPath, misconceptions, hints } no schema do pacote. O harness aplica
 * findLeaksInRobotInput sobre o input entregue ao adaptador (envelope-b JAMAIS
 * entra) e os mesmos filtros pós-parse do simulador default. Ver
 * benchmark/ADAPTADOR.md.
 *
 * Uso:
 *   npm run reproduce:collect -- --yes                     (24 x 3, ~US$ 4)
 *   npm run reproduce:collect -- --problems 1 --replicas 1 --yes   (smoke)
 *   npm run reproduce:collect -- --adapter benchmark/adapter-exemplo.mjs
 *   Flags: --problems N  --replicas R  --yes  --adapter caminho.mjs
 *          --out DIR  --allow-model-override
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  REPO,
  DATASET_DIR,
  FINAL_ARM_DIR,
  readJson,
  readRuns,
  aggregateRuns,
  ciOverlap,
  fmt3,
} from "../analysis/reproduce-lib.mjs";

const FINAL_MODEL = "qwen/qwen3-max";
// TETO conservador por run (uma chamada qwen3-max, prompt com inventário
// reconstruído + saída sem teto de misconceptions). A chamada de certificação
// de 2026-07-20 usou 1796 tokens de entrada e 2078 de saída, cerca de
// US$ 0,015; o teto cobre respostas longas. O custo real fica no manifesto.
const EST_USD_PER_RUN = 0.05;
const line = "=".repeat(74);

function parseArgs(argv) {
  const out = {
    problems: 24,
    replicas: 3,
    yes: false,
    adapter: null,
    out: null,
    allowModelOverride: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--problems") out.problems = parseInt(argv[++i], 10);
    else if (a === "--replicas") out.replicas = parseInt(argv[++i], 10);
    else if (a === "--yes") out.yes = true;
    else if (a === "--adapter") out.adapter = argv[++i];
    else if (a === "--out") out.out = argv[++i];
    else if (a === "--allow-model-override") out.allowModelOverride = true;
    else {
      console.error(`Flag desconhecida: ${a}`);
      process.exit(1);
    }
  }
  if (!Number.isInteger(out.problems) || out.problems < 1 || out.problems > 24) {
    console.error("--problems deve estar entre 1 e 24");
    process.exit(1);
  }
  if (!Number.isInteger(out.replicas) || out.replicas < 1 || out.replicas > 10) {
    console.error("--replicas deve estar entre 1 e 10");
    process.exit(1);
  }
  return out;
}

function freshOutDir(base) {
  const stamp = new Date().toISOString().slice(0, 10);
  let dir = base || path.join(REPO, "resultados", `reproducao-${stamp}`);
  if (base) return dir;
  let n = 2;
  while (fs.existsSync(dir)) dir = path.join(REPO, "resultados", `reproducao-${stamp}-${n++}`);
  return dir;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // ── modelo resolvido ANTES de importar o cliente LLM ─────────────────────
  // Mesma precedência de resolveEvalStudentConfig (simulate-students.js):
  // env STI_EVAL_3B_MODEL > premium recomendado (qwen/qwen3-max). O fallback de
  // emergência é fixado no MESMO modelo ANTES do import (a tabela AGENTS lê o
  // env na carga do módulo): um retry jamais troca de modelo em silêncio.
  const intendedModel = process.env.STI_EVAL_3B_MODEL || FINAL_MODEL;
  if (!args.adapter) {
    process.env.FALLBACK_MODEL = intendedModel;
  }

  const { authorFromEnvelopeA } = await import(path.join(REPO, "author-from-ctat.js"));
  const { resolveEvalStudentConfig, restrictToComponents, sanitizeMisconceptions } = await import(
    path.join(REPO, "simulate-students.js")
  );
  const llmMod = await import(path.join(REPO, "llm.js"));
  const { compareGraphs } = await import(path.join(REPO, "metrics.js"));
  const { functionalEquivalence } = await import(path.join(REPO, "functional-equivalence.js"));
  const { auditBehaviorGraph } = await import(path.join(REPO, "behavior-graph-integrity.js"));
  const { parseMassProductionTable, renderedFactsFromParams } = await import(
    path.join(REPO, "interface-reconstruction.js")
  );
  const { buildInterfaceInventory, formatInterfaceInventory } = await import(
    path.join(REPO, "interface-inventory.js")
  );
  const { findLeaksInRobotInput } = await import(path.join(REPO, "parse-ctat-brd.js"));
  const { authorGraphForInterface } = await import(path.join(REPO, "author-graph.js"));
  const { normalizeEducaoff } = await import(path.join(REPO, "schema.js"));

  // ── config final e travas ────────────────────────────────────────────────
  let resolved = null;
  let adapter = null;
  let adapterSha = null;
  if (args.adapter) {
    const adapterPath = path.isAbsolute(args.adapter)
      ? args.adapter
      : path.resolve(process.cwd(), args.adapter);
    if (!fs.existsSync(adapterPath)) {
      console.error(`Adaptador não encontrado: ${adapterPath}`);
      process.exit(1);
    }
    const mod = await import(pathToFileURL(adapterPath).href);
    adapter = mod.simulate || mod.default;
    if (typeof adapter !== "function") {
      console.error("O adaptador deve exportar uma função `simulate` (ou default). Ver benchmark/ADAPTADOR.md.");
      process.exit(1);
    }
    const crypto = await import("node:crypto");
    adapterSha = crypto.createHash("sha256").update(fs.readFileSync(adapterPath)).digest("hex");
    console.log(`Simulador: ADAPTADOR externo ${path.relative(process.cwd(), adapterPath)} (sha256 ${adapterSha.slice(0, 12)})`);
  } else {
    resolved = resolveEvalStudentConfig();
    console.log(
      `Simulador: default do pacote (simulate-students.js) | provider=${resolved.provider} ` +
        `model=${resolved.model} temperature=${resolved.temperature}`
    );
    if (resolved.model !== FINAL_MODEL && !args.allowModelOverride) {
      console.error(
        `\nERRO: o modelo resolvido (${resolved.model}) difere da configuração final do ` +
          `experimento (${FINAL_MODEL}).\nHá um override via STI_EVAL_3B_MODEL no ambiente. ` +
          `Remova-o para reproduzir o braço final, ou passe --allow-model-override para ` +
          `medir OUTRO modelo de propósito (a comparação deixa de ser uma replicação).`
      );
      process.exit(1);
    }
    // Defesa em profundidade: além do env pré-import, trava a tabela em memória.
    llmMod.AGENTS.fallback_emergency.model = resolved.model;
    llmMod.AGENTS.fallback_emergency.temperature = resolved.temperature;
    if (!process.env.OPENROUTER_API_KEY) {
      console.error(
        "\nERRO: OPENROUTER_API_KEY ausente. Copie .env.example para .env e preencha a chave " +
          "(https://openrouter.ai/keys). reproduce:verify continua disponível sem chave e sem custo."
      );
      process.exit(1);
    }
  }

  // ── plano e aviso de custo ANTES de começar ──────────────────────────────
  const problemIds = fs
    .readdirSync(path.join(DATASET_DIR, "problems"))
    .filter((d) => fs.existsSync(path.join(DATASET_DIR, "problems", d, "envelope-a.json")))
    .sort()
    .slice(0, args.problems);
  const totalRuns = problemIds.length * args.replicas;
  console.log(`\n${line}\nPLANO DA COLETA`);
  console.log(
    `  ${problemIds.length} problema(s) x ${args.replicas} réplica(s) = ${totalRuns} run(s); ` +
      `1 chamada de LLM por run no caminho default`
  );
  if (!args.adapter) {
    const est = totalRuns * EST_USD_PER_RUN;
    console.log(
      `  CUSTO ESTIMADO (teto conservador): até ~US$ ${est.toFixed(2)} ` +
        `(teto de US$ ${EST_USD_PER_RUN.toFixed(2)}/run; a chamada típica custa cerca de um ` +
        `terço disso; o custo real por chamada fica no manifesto)`
    );
    console.log(`  trava de orçamento: STI_BUDGET_USD=${process.env.STI_BUDGET_USD || "50 (default)"}`);
    if (!args.yes) {
      console.error(
        `\nColeta NÃO iniciada: esta execução é PAGA. Confirme com --yes, por exemplo:\n` +
          `  npm run reproduce:collect -- --problems ${args.problems} --replicas ${args.replicas} --yes`
      );
      process.exit(1);
    }
  } else {
    console.log("  custo do harness: zero (o custo, se houver, é do adaptador externo)");
  }
  console.log(line);

  // ── saída datada + manifesto de chamadas dentro dela ─────────────────────
  const outDir = freshOutDir(args.out);
  fs.mkdirSync(path.join(outDir, "runs"), { recursive: true });
  const runId = `reproducao-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  if (!args.adapter) {
    process.env.STI_RUNS_DIR = outDir; // manifesto: <out>/manifests/<runId>.jsonl
    process.env.STI_RUN_ID = runId;
  }
  console.log(`Saída: ${outDir}\n`);

  // ── fatos renderizados por problema (mesma fonte do braço final) ─────────
  const { paramsByProblem } = parseMassProductionTable(
    fs.readFileSync(path.join(DATASET_DIR, "_interface", "massproduction.txt"), "utf8")
  );
  const renderedFactsFor = (id) => {
    const params = paramsByProblem[id];
    if (!params) return undefined;
    try {
      return renderedFactsFromParams(params) || undefined;
    } catch {
      return undefined;
    }
  };

  // ── wrapper do adaptador: mesma régua, mesmo gate anti-vazamento ─────────
  const makeAdapterSimulate = () => async (iface, opts = {}) => {
    const inventory = buildInterfaceInventory(iface, { renderedFacts: opts.renderedFacts });
    const adapterInput = {
      envelopeA: iface,
      renderedFacts: opts.renderedFacts ?? null,
      interfaceInventory: { ...inventory, texto: formatInterfaceInventory(inventory) },
    };
    const leaks = findLeaksInRobotInput(adapterInput);
    if (leaks.length) {
      throw new Error(`input do adaptador REPROVADO no gate anti-vazamento: ${leaks.join(", ")}`);
    }
    const raw = (await adapter(adapterInput)) || {};
    const allowed = new Set();
    const { canon } = await import(path.join(REPO, "schema.js"));
    for (const c of iface.components || []) {
      if (c.id) allowed.add(canon(c.id));
      if (c.label) allowed.add(canon(c.label));
    }
    const asArray = (x) => (Array.isArray(x) ? x : []);
    const cp = restrictToComponents(asArray(raw.correctPath), allowed);
    const mc = restrictToComponents(asArray(raw.misconceptions), allowed);
    const sane = sanitizeMisconceptions(mc.kept);
    const traces = { correctPath: cp.kept, misconceptions: sane.kept, hints: asArray(raw.hints) };
    if (!traces.correctPath.length) {
      traces.correctPath = [
        { kc: "kc_solve", action: "Resolver o problema", result: iface.correctAnswer || "" },
      ];
    }
    return traces;
  };

  // ── coleta ───────────────────────────────────────────────────────────────
  const failures = [];
  let done = 0;
  for (const id of problemIds) {
    const problemDir = path.join(DATASET_DIR, "problems", id);
    const envelopeA = readJson(path.join(problemDir, "envelope-a.json"));
    const renderedFacts = renderedFactsFor(id);
    // Gate anti-vazamento também no caminho default (defesa em profundidade;
    // o mesmo input flui para o prompt do simulador).
    const leaks = findLeaksInRobotInput({ envelopeA, renderedFacts: renderedFacts ?? null });
    if (leaks.length) {
      console.error(`✗ ${id}: envelope-a reprovado no gate anti-vazamento: ${leaks.join(", ")}`);
      process.exit(1);
    }
    for (let rep = 1; rep <= args.replicas; rep++) {
      const tag = `${id}_rep${rep}`;
      try {
        const robot = args.adapter
          ? await (async () => {
              const simulate = makeAdapterSimulate();
              const traces = await simulate(envelopeA, { renderedFacts });
              const graph = authorGraphForInterface(envelopeA, traces);
              return { graph, neutral: normalizeEducaoff(graph, { source: "robo" }) };
            })()
          : await authorFromEnvelopeA(envelopeA, { renderedFacts });
        const envelopeB = readJson(path.join(problemDir, "envelope-b.json"));
        const audit = auditBehaviorGraph(robot.graph);
        const cmp = compareGraphs(envelopeB, robot.neutral, { ref: "especialista", cand: "robo" });
        const fe = functionalEquivalence(envelopeB, robot.neutral, {
          correctAnswers: [envelopeA.correctAnswer].filter(Boolean),
          excludeMechanical: true,
        });
        const run = {
          id,
          correctAnswer: envelopeA.correctAnswer,
          audit: { ok: audit.ok, stepCount: audit.stepCount },
          f1: cmp.similarity,
          conceptual: cmp.nodeF1Conceptual,
          precision: cmp.precision,
          recall: cmp.recall,
          functionalAgreement: fe.agreement,
          functionalKappa: fe.kappa,
          missing: cmp.detail.missingMisconceptions,
          extra: cmp.detail.extraMisconceptions,
          robotMisconceptions: (robot.neutral.misconceptions || []).map((m) => m.wrongAnswer),
        };
        fs.writeFileSync(path.join(outDir, "runs", `${tag}.json`), JSON.stringify(run, null, 1));
        done++;
        console.log(
          `[${done}/${totalRuns}] ${tag}  f1=${fmt3(run.f1)} conceptual=${fmt3(run.conceptual)} ` +
            `recall=${fmt3(run.recall)} miscs=${run.robotMisconceptions.length}`
        );
      } catch (e) {
        failures.push({ run: tag, error: e.message });
        console.error(`[${done}/${totalRuns}] ${tag}  ✗ FALHOU: ${e.message}`);
        if (done === 0 && failures.length === 1 && !args.adapter) {
          console.error(
            "\nA PRIMEIRA chamada falhou: interrompendo antes de acumular custo. " +
              "Verifique a chave/modelo acima (nenhum fallback de modelo foi tentado)."
          );
          process.exit(1);
        }
      }
    }
  }

  // ── auditoria do manifesto: nenhum modelo diferente do resolvido ─────────
  let manifestNote = "adaptador externo: manifesto de chamadas fica a cargo do adaptador";
  if (!args.adapter) {
    const manifestPath = path.join(outDir, "manifests", `${runId}.jsonl`);
    let calls = [];
    if (fs.existsSync(manifestPath)) {
      calls = fs
        .readFileSync(manifestPath, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l));
    }
    const wrongModel = calls.filter((c) => c.model !== resolved.model);
    if (wrongModel.length) {
      console.error(
        `\n✗ INTEGRIDADE: ${wrongModel.length} chamada(s) usaram modelo diferente de ` +
          `${resolved.model} (${[...new Set(wrongModel.map((c) => c.model))].join(", ")}). ` +
          `A coleta NÃO é uma replicação da configuração final; descarte ${outDir}.`
      );
      process.exit(1);
    }
    const tokensIn = calls.reduce((s, c) => s + (c.tokensIn || 0), 0);
    const tokensOut = calls.reduce((s, c) => s + (c.tokensOut || 0), 0);
    manifestNote =
      `${calls.length} chamada(s), todas em ${resolved.model}; ` +
      `tokens in/out = ${tokensIn}/${tokensOut}; manifesto: manifests/${runId}.jsonl`;
    console.log(`\n✓ manifesto auditado: ${manifestNote}`);
  }

  // ── agregação + comparação com o depositado ──────────────────────────────
  const runs = readRuns(path.join(outDir, "runs"));
  if (!runs.length) {
    console.error("\nNenhum run coletado com sucesso; nada a agregar.");
    process.exit(1);
  }
  const metrics = aggregateRuns(runs);
  const deposited = readJson(path.join(FINAL_ARM_DIR, "summary.json"));
  const summary = {
    arm: path.basename(outDir),
    description: args.adapter
      ? `re-coleta via adaptador externo (sha256 ${adapterSha}); harness idêntico ao braço final`
      : `re-coleta da configuração final do braço 6 (${resolved.model}); nota: recallMisconceptionsConceptual reconstruído por chaves canônicas (reproduce-lib.mjs)`,
    n: runs.length,
    protocol: `${problemIds.length} problemas × ${args.replicas} réplicas; bootstrap por cluster (10k, seed 42)`,
    metrics,
  };
  fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 1));
  fs.writeFileSync(
    path.join(outDir, "meta.json"),
    JSON.stringify(
      {
        geradoEm: new Date().toISOString(),
        node: process.version,
        simulador: args.adapter
          ? { tipo: "adapter", caminho: args.adapter, sha256: adapterSha }
          : { tipo: "default", provider: resolved.provider, model: resolved.model, temperature: resolved.temperature },
        problems: problemIds,
        replicas: args.replicas,
        runsOk: runs.length,
        falhas: failures,
        manifesto: manifestNote,
        referencia: "resultados/campanha5-2026-07-19/6-final-megabrain/summary.json",
      },
      null,
      1
    )
  );

  console.log(`\n${line}\nCOMPARAÇÃO COM O DEPOSITADO (braço 6-final-megabrain, 24 x 3)`);
  console.log(
    "critério de replicação (LLM estocástico): sobreposição dos IC95% por cluster, não igualdade pontual"
  );
  console.log(line);
  const LABELS = {
    recallMisconceptionsConceptual: "completude conceitual (primária)*",
    conceptual: "F1 conceitual",
    recall: "completude estrita",
    precision: "precisão",
    f1: "F1 estrutural",
    functionalAgreement: "concordância funcional bruta",
    functionalKappa: "kappa funcional (registro)",
  };
  let overlaps = 0;
  const comparable = Object.keys(LABELS);
  for (const key of comparable) {
    const a = metrics[key];
    const d = deposited.metrics[key];
    const ok = ciOverlap(a, d);
    if (ok) overlaps++;
    console.log(
      ` ${(ok ? "✓" : "✗").padEnd(1)} ${LABELS[key].padEnd(34)} nova ${fmt3(a.mean)} [${fmt3(a.lower)}; ${fmt3(a.upper)}]` +
        `  vs depositada ${fmt3(d.mean)} [${fmt3(d.lower)}; ${fmt3(d.upper)}]  ${ok ? "ICs se sobrepõem" : "SEM sobreposição"}`
    );
  }
  console.log(line);
  console.log(
    "* na coluna nova, a completude conceitual é a reconstrução por chaves canônicas do pacote;"
  );
  console.log(
    "  na depositada, o valor preservado da coleta (a reconstrução fica até 0,006 abaixo dele; ver docs/REPRODUCAO-V7.md)."
  );
  if (runs.length < 72) {
    console.log(
      `nota: n=${runs.length} run(s) (${problemIds.length} problema(s) x ${args.replicas}); ` +
        "com menos de 24 problemas x 3 réplicas a comparação é ILUSTRATIVA, não uma replicação."
    );
  }
  console.log(`\n${overlaps}/${comparable.length} métricas com sobreposição de IC.`);
  if (failures.length) {
    console.error(`\n✗ ${failures.length} run(s) falharam (listados em meta.json).`);
    process.exit(1);
  }
  console.log(`\n✓ coleta concluída: ${runs.length} runs em ${outDir}`);
}

main().catch((e) => {
  console.error(`ERRO FATAL: ${e.message}`);
  process.exit(1);
});
