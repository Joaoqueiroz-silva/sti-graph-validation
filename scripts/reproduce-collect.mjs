#!/usr/bin/env node
/**
 * scripts/reproduce-collect.mjs - RE-COLETA paga do experimento final da
 * experimento com chamadas novas (npm run reproduce:collect). Este é o ÚNICO
 * caminho de reprodução que gera custo; verify:offline é grátis e offline.
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
 *   4. agrega com bootstrap por cluster (10k, seed 42). Uma comparação com
 *      outro summary é opcional via --reference-summary; sem essa flag, o
 *      coletor não depende de artefatos históricos removidos da árvore.
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
 * O caminho informado deve existir e exportar `simulate` (ou `default`).
 *
 * Uso:
 *   npm run reproduce:collect -- --yes                     (24 x 3, ~US$ 4)
 *   npm run reproduce:collect -- --problems 1 --replicas 1 --yes   (smoke)
 *   Flags: --problems N  --replicas R  --yes  --adapter caminho.mjs
 *          --out DIR  --reference-summary summary.json --allow-model-override
 *          --perfil <nome>          troca TODOS os modelos (config/modelos.json)
 *          --modelo <agente>=<id>   troca UM agente (repetível)
 *          --input-policy <id>      historico-v1 (default) | somente-enunciado-v1
 *          --problem-ids a,b,c      subconjunto explícito (ordem canônica)
 *          --resume                 retoma sem repetir runs concluídos
 *          --fail-fast              para na primeira falha
 *          --retry-orphans          autoriza repetir run pago sem JSON final
 *          --plano                  só imprime o plano/custo/mapa resolvido e sai
 *
 * CONFIGURAÇÃO DE MODELOS (port 2026-08, docs/CONFIGURACAO-MODELOS.md):
 * --perfil/--modelo (ou PERFIL_MODELOS / MODELO_<AGENTE> no ambiente) engajam a
 * resolução por perfil; o modelo resolvido para "estudantes" passa a reger o
 * simulador (e o fallback é fixado nele — retry nunca troca de modelo). SEM
 * essas fontes, o caminho é a réplica histórica do braço final da Campanha 5
 * (qwen/qwen3-max via STI_EVAL_3B_MODEL, exatamente como antes). Em ambos os
 * casos, cada run grava o registro COMPLETO do docs/CONTRATO-RUN-V2.md, com
 * modelos.porAgente RESOLVIDO e o bloco custo somado do manifesto.
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  REPO,
  DATASET_DIR,
  readJson,
  readRuns,
  aggregateRuns,
  ciOverlap,
  fmt3,
} from "../analysis/reproduce-lib.mjs";
import { resolverModelos, AGENTES } from "../config/resolver-modelos.js";
import { buildRunRecord, validarRegistro } from "./registro-run-v2.mjs";
import { PRICES, sha256 } from "../exec-manifest.js";
import {
  INPUT_POLICY_SOMENTE_ENUNCIADO,
  auditarInputAgentes,
  projetarEnvelopeParaAgentes,
  resolverInputPolicy,
  validarCompatibilidadeInputPolicy,
} from "../input-policy.js";
import { resolverPoliticaReasoning } from "../reasoning-policy.js";

const FINAL_MODEL = "qwen/qwen3-max";
// Fallback de reserva para modelos sem preço congelado. Nos três modelos v0.8,
// a reserva é calculada por preço × limites máximos de tokens logo abaixo.
const EST_USD_PER_CALL_FALLBACK = 0.3;
const line = "=".repeat(74);

function parseArgs(argv) {
  const out = {
    problems: 24,
    replicas: 3,
    yes: false,
    adapter: null,
    out: null,
    allowModelOverride: false,
    perfil: null,
    modelo: [],
    plano: false,
    fluxo: "campanha5",
    passosLivres: false,
    interfaceFixa: false,
    inputPolicy: null,
    problemIds: null,
    resume: false,
    failFast: false,
    retryOrphans: false,
    referenceSummary: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--problems") out.problems = parseInt(argv[++i], 10);
    else if (a === "--replicas") out.replicas = parseInt(argv[++i], 10);
    else if (a === "--yes") out.yes = true;
    else if (a === "--adapter") out.adapter = argv[++i];
    else if (a === "--out") out.out = argv[++i];
    else if (a === "--allow-model-override") out.allowModelOverride = true;
    else if (a === "--perfil") out.perfil = argv[++i];
    else if (a === "--modelo") out.modelo.push(argv[++i]);
    else if (a === "--plano") out.plano = true;
    else if (a === "--fluxo") out.fluxo = argv[++i];
    else if (a === "--passos-livres") out.passosLivres = true;
    else if (a === "--interface-fixa") out.interfaceFixa = true;
    else if (a === "--problem-ids") {
      const valor = argv[++i];
      if (!valor || valor.startsWith("--")) {
        console.error("--problem-ids exige uma lista separada por vírgulas");
        process.exit(1);
      }
      out.problemIds = [...new Set(valor.split(",").map((x) => x.trim()).filter(Boolean))].sort();
    }
    else if (a === "--resume") out.resume = true;
    else if (a === "--fail-fast") out.failFast = true;
    else if (a === "--retry-orphans") out.retryOrphans = true;
    else if (a === "--input-policy") {
      const valor = argv[++i];
      if (!valor || valor.startsWith("--")) {
        console.error("--input-policy exige historico-v1 ou somente-enunciado-v1");
        process.exit(1);
      }
      out.inputPolicy = valor;
    } else if (a === "--reference-summary") out.referenceSummary = argv[++i];
    else {
      console.error(`Flag desconhecida: ${a}`);
      process.exit(1);
    }
  }
  if (!["campanha5", "plataforma"].includes(out.fluxo)) {
    console.error(`--fluxo deve ser "campanha5" (default) ou "plataforma"; recebi "${out.fluxo}"`);
    process.exit(1);
  }
  if (out.fluxo === "plataforma" && out.adapter) {
    console.error("--fluxo plataforma e --adapter são mutuamente exclusivos");
    process.exit(1);
  }
  if (!Number.isInteger(out.problems) || out.problems < 1 || out.problems > 24) {
    console.error("--problems deve estar entre 1 e 24");
    process.exit(1);
  }
  if (!Number.isInteger(out.replicas) || out.replicas < 1 || out.replicas > 10) {
    console.error("--replicas deve estar entre 1 e 10");
    process.exit(1);
  }
  if (out.problemIds && (out.problemIds.length < 1 || out.problemIds.length > 24)) {
    console.error("--problem-ids deve selecionar entre 1 e 24 problemas");
    process.exit(1);
  }
  if (out.retryOrphans && !out.resume) {
    console.error("--retry-orphans só pode ser usado junto com --resume");
    process.exit(1);
  }
  return out;
}

function resolveOutDir(base, resume = false) {
  const stamp = new Date().toISOString().slice(0, 10);
  let dir = base ? path.resolve(process.cwd(), base) : path.join(REPO, "resultados", `reproducao-${stamp}`);
  if (base) {
    if (fs.existsSync(dir) && !fs.statSync(dir).isDirectory()) {
      throw new Error(`--out deve apontar para um diretório: ${dir}`);
    }
    if (!resume && fs.existsSync(dir) && fs.readdirSync(dir).length) {
      throw new Error(`--out deve apontar para diretório novo ou vazio; recusando sobrescrever ${dir}`);
    }
    return dir;
  }
  let n = 2;
  while (fs.existsSync(dir)) dir = path.join(REPO, "resultados", `reproducao-${stamp}-${n++}`);
  return dir;
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 1) + "\n");
  fs.renameSync(tmp, file);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const interfaceFixaAtiva =
    args.interfaceFixa || process.env.STI_INTERFACE_FIXA === "1";
  const inputPolicy = validarCompatibilidadeInputPolicy(
    resolverInputPolicy(args.inputPolicy),
    { interfaceFixa: interfaceFixaAtiva }
  );
  const reasoningPolicy = resolverPoliticaReasoning().record;

  // ── resolução de modelos por perfil (docs/CONFIGURACAO-MODELOS.md) ───────
  // --perfil/--modelo (e PERFIL_MODELOS/MODELO_<AGENTE> no ambiente) engajam a
  // resolução; sem nenhuma dessas fontes, o caminho é a réplica histórica do
  // braço final da Campanha 5, exatamente como antes do port.
  const resolucao = resolverModelos({
    argv: [
      ...(args.perfil ? ["--perfil", args.perfil] : []),
      ...args.modelo.flatMap((m) => ["--modelo", m]),
    ],
  });
  // No fluxo-plataforma a resolução por perfil SEMPRE se aplica (não existe a
  // réplica histórica de uma chamada; sem flags, vale o perfilPadrao).
  const modoPerfil = (resolucao.engajado || args.fluxo === "plataforma") && !args.adapter;

  // ── modelo resolvido ANTES de importar o cliente LLM ─────────────────────
  // Caminho histórico: precedência de resolveEvalStudentConfig (env
  // STI_EVAL_3B_MODEL > qwen/qwen3-max). Caminho por perfil: o modelo
  // resolvido para "estudantes" entra por STI_EVAL_3B_MODEL (o MESMO mecanismo
  // auditado). Em ambos, o fallback de emergência é fixado no MESMO modelo
  // ANTES do import (a tabela AGENTS lê o env na carga do módulo): um retry
  // jamais troca de modelo em silêncio.
  const intendedModel = modoPerfil
    ? resolucao.porAgente.estudantes
    : process.env.STI_EVAL_3B_MODEL || FINAL_MODEL;
  if (!args.adapter) {
    process.env.FALLBACK_MODEL = intendedModel;
    if (modoPerfil && args.fluxo === "campanha5") process.env.STI_EVAL_3B_MODEL = intendedModel;
  }

  const { authorFromEnvelopeA } = await import(path.join(REPO, "author-from-ctat.js"));
  const { authorFluxoPlataforma } = await import(path.join(REPO, "simulate-fluxo-plataforma.js"));
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
      console.error("O adaptador deve exportar uma função assíncrona `simulate` (ou default).");
      process.exit(1);
    }
    const crypto = await import("node:crypto");
    adapterSha = crypto.createHash("sha256").update(fs.readFileSync(adapterPath)).digest("hex");
    console.log(`Simulador: ADAPTADOR externo ${path.relative(process.cwd(), adapterPath)} (sha256 ${adapterSha.slice(0, 12)})`);
  } else {
    // No fluxo-plataforma o simulador de uma chamada NÃO roda; o modelo efetivo
    // dos três agents3 é o papel "estudantes" resolvido, e todo o resto
    // (pinagem do fallback, auditoria do manifesto, bloco modelos) deve olhar
    // para ele — nunca para resolveEvalStudentConfig, que é do fluxo antigo.
    resolved =
      args.fluxo === "plataforma"
        ? { provider: "openrouter", model: intendedModel, temperature: resolucao.temperatura }
        : resolveEvalStudentConfig();
    console.log(
      args.fluxo === "plataforma"
        ? `Simulador: FLUXO-PLATAFORMA (agents3a/3b/3c portados + extractGraphForgeConfig + ` +
            `graphForge de produção) | estudantes=${intendedModel}`
        : `Simulador: default do pacote (simulate-students.js) | provider=${resolved.provider} ` +
            `model=${resolved.model} temperature=${resolved.temperature}`
    );
    if (modoPerfil) {
      console.log(
        `Configuração de modelos ENGAJADA (perfil "${resolucao.perfil}"): braço deliberado de ` +
          `comparação — NÃO é uma replicação do braço final da Campanha 5.`
      );
      for (const a of AGENTES) {
        console.log(`  ${a.padEnd(14)} ${resolucao.porAgente[a]}  (${resolucao.origem[a]})`);
      }
    } else if (resolved.model !== FINAL_MODEL && !args.allowModelOverride) {
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
    if (!process.env.OPENROUTER_API_KEY && !args.plano) {
      console.error(
        "\nERRO: OPENROUTER_API_KEY ausente. Copie .env.example para .env e preencha a chave " +
          "(https://openrouter.ai/keys). npm run verify:offline continua disponível sem chave e sem custo."
      );
      process.exit(1);
    }
  }

  // ── bloco `modelos` do registro (docs/CONTRATO-RUN-V2.md): identificador
  // RESOLVIDO, nunca o apelido do perfil. No caminho por perfil, o mapa
  // completo dos cinco papéis; no histórico, o único agente que roda nesta
  // coleta (estudantes) sob o rótulo "campanha5-final"; no adaptador, o hash
  // do simulador externo. ────────────────────────────────────────────────────
  const blocoModelos = args.adapter
    ? {
        perfil: "adaptador-externo",
        porAgente: { estudantes: `adaptador:${adapterSha.slice(0, 12)}` },
        temperatura: null,
        provedor: "adaptador",
        resolvidoEm: resolucao.resolvidoEm,
      }
    : modoPerfil
      ? {
          perfil: resolucao.perfil,
          porAgente: { ...resolucao.porAgente, estudantes: resolved.model },
          temperatura: resolved.temperature,
          // No fluxo-plataforma os três agents3 usam as temperaturas do
          // registry de produção (adaptador pipeline-core); ficam registradas
          // para o resultado ser atribuível sem abrir o manifesto.
          ...(args.fluxo === "plataforma"
            ? {
                temperaturasProducao: {
                  agent3a_advanced: 0.2,
                  agent3b_atrisk: 0.7,
                  agent3c_average: 0.4,
                },
              }
            : {}),
          provedor: "openrouter",
          resolvidoEm: resolucao.resolvidoEm,
        }
      : {
          perfil: "campanha5-final",
          porAgente: { estudantes: resolved.model },
          temperatura: resolved.temperature,
          provedor: "openrouter",
          resolvidoEm: resolucao.resolvidoEm,
        };
  blocoModelos.reasoning = reasoningPolicy;

  // ── plano e aviso de custo ANTES de começar ──────────────────────────────
  const availableProblemIds = fs
    .readdirSync(path.join(DATASET_DIR, "problems"))
    .filter((d) => fs.existsSync(path.join(DATASET_DIR, "problems", d, "envelope-a.json")))
    .sort();
  const problemIds = args.problemIds || availableProblemIds.slice(0, args.problems);
  const unknownProblemIds = problemIds.filter((id) => !availableProblemIds.includes(id));
  if (unknownProblemIds.length) {
    throw new Error(`--problem-ids contém problema(s) ausente(s) no corpus: ${unknownProblemIds.join(", ")}`);
  }
  if (!problemIds.length) {
    throw new Error(`nenhum problema com envelope-a encontrado em ${path.join(DATASET_DIR, "problems")}`);
  }
  // PREFLIGHT COMPLETO antes de qualquer chamada paga. Envelope B e arquivos
  // de saída são usados apenas depois da resposta da API; verificá-los aqui
  // evita gastar e descobrir uma dependência local ausente somente no final.
  for (const id of problemIds) {
    for (const nome of ["envelope-a.json", "envelope-b.json"]) {
      const arquivo = path.join(DATASET_DIR, "problems", id, nome);
      if (!fs.existsSync(arquivo)) throw new Error(`preflight: dependência ausente ${arquivo}`);
      readJson(arquivo); // valida também a sintaxe JSON
    }
  }
  const outDir = resolveOutDir(args.out, args.resume);
  const referencePath = args.referenceSummary ? path.resolve(process.cwd(), args.referenceSummary) : null;
  let deposited = null;
  if (referencePath) {
    if (!fs.existsSync(referencePath)) throw new Error(`preflight: --reference-summary ausente: ${referencePath}`);
    deposited = readJson(referencePath);
    if (!deposited?.metrics || typeof deposited.metrics !== "object") {
      throw new Error(`preflight: --reference-summary não contém objeto metrics: ${referencePath}`);
    }
  }
  const totalRuns = problemIds.length * args.replicas;
  const chamadasPorRun = args.fluxo === "plataforma" ? 3 : 1;
  console.log(`\n${line}\nPLANO DA COLETA`);
  console.log(`  política de input: ${inputPolicy}`);
  console.log(
    `  ${problemIds.length} problema(s) x ${args.replicas} réplica(s) = ${totalRuns} run(s); ` +
      (args.fluxo === "plataforma"
        ? `3 chamadas de LLM por run (agents 3a, 3b e 3c de produção)`
        : `1 chamada de LLM por run no caminho default`)
  );
  if (!args.adapter) {
    const price = PRICES[resolved.model];
    const est =
      args.fluxo === "plataforma" && price
        ? totalRuns * ((150000 / 1e6) * price.input + ((16000 + 24000 + 16000) / 1e6) * price.output)
        : totalRuns * EST_USD_PER_CALL_FALLBACK * chamadasPorRun;
    console.log(
      `  RESERVA CONSERVADORA DA CÉLULA: até US$ ${est.toFixed(2)} ` +
        `(limites máximos de saída + teto conservador de entrada; ` +
        `o custo esperado é menor e o usage real fica no manifesto)`
    );
    console.log(`  trava de orçamento: STI_BUDGET_USD=${process.env.STI_BUDGET_USD || "50 (default)"}`);
    if (args.plano) {
      console.log(`\nMAPA DE MODELOS RESOLVIDO (registro: modelos.porAgente) — perfil "${blocoModelos.perfil}"`);
      for (const [agente, modelo] of Object.entries(blocoModelos.porAgente)) {
        console.log(`  ${agente.padEnd(14)} ${modelo}`);
      }
      console.log(`  temperatura     ${blocoModelos.temperatura}  |  provedor  ${blocoModelos.provedor}`);
      console.log("\n--plano: nada foi chamado, nada foi gravado. Remova --plano (e confirme com --yes) para coletar.");
      process.exit(0);
    }
    if (!args.yes) {
      console.error(
        `\nColeta NÃO iniciada: esta execução é PAGA. Confirme com --yes, por exemplo:\n` +
          `  npm run reproduce:collect -- --problems ${args.problems} --replicas ${args.replicas} --yes`
      );
      process.exit(1);
    }
  } else {
    console.log("  custo do harness: zero (o custo, se houver, é do adaptador externo)");
    if (args.plano) {
      console.log("\n--plano: nada foi chamado, nada foi gravado (adaptador externo; sem modelos a resolver).");
      process.exit(0);
    }
  }
  console.log(line);

  // ── plano estável + saída/manifestos ─────────────────────────────────────
  // Este arquivo é escrito ANTES da primeira chamada. Em retomadas, a
  // comparação byte a byte impede misturar corpus, modelo, política ou regime.
  const collectionPlan = {
    schema: "sti-collection-cell-v1",
    dataset: process.env.STI_DATASET || "frac-numberline-6.17",
    problemIds,
    replicas: args.replicas,
    fluxo: args.fluxo,
    passosLivres: args.passosLivres || process.env.STI_PASSOS_LIVRES === "1",
    interfaceFixa: interfaceFixaAtiva,
    inputPolicy,
    model: args.adapter ? `adaptador:${adapterSha}` : resolved.model,
    temperatures:
      args.fluxo === "plataforma"
        ? { agent3a_advanced: 0.2, agent3b_atrisk: 0.7, agent3c_average: 0.4 }
        : { default: resolved?.temperature ?? null },
    reasoning: reasoningPolicy,
  };
  const collectionPlanText = JSON.stringify(collectionPlan, null, 1) + "\n";
  const collectionPlanHash = sha256(collectionPlanText);
  const collectionPlanPath = path.join(outDir, "collection-plan.json");
  if (fs.existsSync(collectionPlanPath)) {
    if (fs.readFileSync(collectionPlanPath, "utf8") !== collectionPlanText) {
      throw new Error(`--resume recusado: collection-plan.json não corresponde ao plano solicitado em ${outDir}`);
    }
  } else if (args.resume && fs.existsSync(outDir) && fs.readdirSync(outDir).length) {
    throw new Error(`--resume recusado: diretório não vazio sem collection-plan.json: ${outDir}`);
  }
  fs.mkdirSync(path.join(outDir, "runs"), { recursive: true });
  if (!fs.existsSync(collectionPlanPath)) fs.writeFileSync(collectionPlanPath, collectionPlanText);
  const runId = `coleta-${collectionPlanHash.slice(0, 16)}`;
  if (!args.adapter) {
    process.env.STI_RUNS_DIR = outDir;
  }
  console.log(`Saída: ${outDir}`);
  console.log(`Política de input: ${inputPolicy}\n`);

  // ── fatos renderizados por problema (mesma fonte do braço final) ─────────
  // multi-corpus (2026-08-16): a tabela de mass production só existe no 6.17
  // (e só o fluxo antigo/campanha5 a usa, para renderedFacts); nos outros
  // datasets ela é opcional.
  const mpPath = path.join(DATASET_DIR, "_interface", "massproduction.txt");
  const { paramsByProblem } = fs.existsSync(mpPath)
    ? parseMassProductionTable(fs.readFileSync(mpPath, "utf8"))
    : { paramsByProblem: {} };
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
  // `sink` (contrato v2): recebe promptSha256 (hash do input entregue ao
  // adaptador) e respostaDoModelo (retorno bruto do adaptador) para o registro.
  const makeAdapterSimulate = (sink = {}) => async (iface, opts = {}) => {
    const inventory = buildInterfaceInventory(iface, { renderedFacts: opts.renderedFacts });
    const adapterInput = inputPolicy === INPUT_POLICY_SOMENTE_ENUNCIADO
      ? { envelopeA: iface }
      : {
          envelopeA: iface,
          renderedFacts: opts.renderedFacts ?? null,
          interfaceInventory: { ...inventory, texto: formatInterfaceInventory(inventory) },
        };
    const leaks = findLeaksInRobotInput(adapterInput);
    if (leaks.length) {
      throw new Error(`input do adaptador REPROVADO no gate anti-vazamento: ${leaks.join(", ")}`);
    }
    sink.promptSha256 = sha256(JSON.stringify(adapterInput));
    sink.politicaInput = {
      id: inputPolicy,
      geracao: auditarInputAgentes(adapterInput, {
        politica: inputPolicy,
        etapa: "geracao",
      }),
    };
    const raw = (await adapter(adapterInput)) || {};
    sink.respostaDoModelo = JSON.stringify(raw);
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
  // Manifesto por run (contrato v2, bloco custo): o JSONL é append-only e a
  // coleta é sequencial — as linhas novas entre o antes e o depois de um run
  // são as chamadas DAQUELE run.
  const runIdFor = (tag) => `${runId}-${String(tag).replace(/[^A-Za-z0-9._-]/g, "-")}`;
  const manifestPathFor = (tag) => path.join(outDir, "manifests", `${runIdFor(tag)}.jsonl`);
  const lerManifesto = (tag) => {
    const manifestPath = manifestPathFor(tag);
    return fs.existsSync(manifestPath)
      ? fs
          .readFileSync(manifestPath, "utf8")
          .split("\n")
          .filter(Boolean)
          .map((l) => JSON.parse(l))
      : [];
  };

  const failures = [];
  let done = 0;
  for (const id of problemIds) {
    const problemDir = path.join(DATASET_DIR, "problems", id);
    const envelopeA = readJson(path.join(problemDir, "envelope-a.json"));
    const renderedFacts = renderedFactsFor(id);
    const envelopeAgentes = projetarEnvelopeParaAgentes(envelopeA, inputPolicy);
    const renderedFactsAgentes =
      inputPolicy === INPUT_POLICY_SOMENTE_ENUNCIADO ? undefined : renderedFacts;
    const inputGeracao = renderedFactsAgentes === undefined
      ? { envelopeA: envelopeAgentes }
      : { envelopeA: envelopeAgentes, renderedFacts: renderedFactsAgentes ?? null };
    // Gate anti-vazamento também no caminho default (defesa em profundidade;
    // o mesmo input flui para o prompt do simulador).
    const leaks = findLeaksInRobotInput(inputGeracao);
    if (leaks.length) {
      console.error(`✗ ${id}: envelope-a reprovado no gate anti-vazamento: ${leaks.join(", ")}`);
      process.exit(1);
    }
    for (let rep = 1; rep <= args.replicas; rep++) {
      const tag = `${id}_rep${rep}`;
      const runFile = path.join(outDir, "runs", `${tag}.json`);
      if (fs.existsSync(runFile)) {
        const existente = readJson(runFile);
        const faltando = args.adapter ? [] : validarRegistro(existente);
        const modeloExistente = existente?.modelos?.porAgente?.estudantes;
        if (
          existente.exercicio !== id ||
          Number(existente.replica) !== rep ||
          existente?.politicaInput?.id !== inputPolicy ||
          (!args.adapter && modeloExistente !== resolved.model) ||
          faltando.length
        ) {
          throw new Error(
            `--resume recusado: run existente incompatível/corrompido ${runFile}` +
              (faltando.length ? ` (falta ${faltando.join(", ")})` : "")
          );
        }
        done++;
        console.log(`[${done}/${totalRuns}] ${tag}  ↷ já concluído; nenhuma chamada repetida`);
        continue;
      }
      const chamadasOrfas = args.adapter ? [] : lerManifesto(tag);
      if (chamadasOrfas.length && !args.retryOrphans) {
        throw new Error(
          `retomada segura bloqueou ${tag}: há ${chamadasOrfas.length} recibo(s) de chamada, ` +
            `mas não há run final. Inspecione ${manifestPathFor(tag)}; só repita conscientemente ` +
            `com --resume --retry-orphans.`
        );
      }
      try {
        if (!args.adapter) process.env.STI_RUN_ID = runIdFor(tag);
        const chamadasAntes = args.adapter ? 0 : lerManifesto(tag).length;
        const sink = {}; // bruto/hash do caminho adaptador OU captureRaw do default
        let robot;
        if (args.adapter) {
          const simulate = makeAdapterSimulate(sink);
          const traces = await simulate(envelopeAgentes, { renderedFacts: renderedFactsAgentes });
          const graph = authorGraphForInterface(envelopeAgentes, traces);
          robot = { graph, neutral: normalizeEducaoff(graph, { source: "robo" }), traces };
        } else if (args.fluxo === "plataforma") {
          // Fluxo da plataforma: 3 chamadas (3a/3b/3c). O sink de bruto vem do
          // cliente LLM (setRawSink) porque os agentes portados não expõem o
          // texto cru; guardamos as três respostas para bruto.respostaDoModelo.
          const raws = [];
          llmMod.setRawSink((r) => raws.push(r));
          try {
            robot = await authorFluxoPlataforma(envelopeAgentes, {
              exerciseId: id,
              passosLivres: args.passosLivres || process.env.STI_PASSOS_LIVRES === "1",
              interfaceFixa: interfaceFixaAtiva,
              inputPolicy,
            });
          } finally {
            llmMod.setRawSink(null);
          }
          sink.respostaDoModelo = JSON.stringify(raws);
        } else {
          sink.politicaInput = {
            id: inputPolicy,
            geracao: auditarInputAgentes(inputGeracao, {
              politica: inputPolicy,
              etapa: "geracao",
            }),
          };
          robot = await authorFromEnvelopeA(envelopeAgentes, {
            renderedFacts: renderedFactsAgentes,
            captureRaw: (raw) => {
              sink.respostaDoModelo = raw;
            },
          });
        }
        const chamadas = args.adapter ? [] : lerManifesto(tag).slice(chamadasAntes);
        if (args.fluxo === "plataforma" && !sink.promptSha256) {
          // promptSha256 do registro = o da chamada do 3b (é o prompt que
          // produz os erros — o objeto da métrica); as três ficam no manifesto.
          sink.promptSha256 =
            chamadas.find((c) => c.agentKey === "agent3b_atrisk")?.promptSha256 ?? null;
        }
        const envelopeB = readJson(path.join(problemDir, "envelope-b.json"));
        const audit = auditBehaviorGraph(robot.graph);
        const cmp = compareGraphs(envelopeB, robot.neutral, { ref: "especialista", cand: "robo" });
        const fe = functionalEquivalence(envelopeB, robot.neutral, {
          correctAnswers: [envelopeA.correctAnswer].filter(Boolean),
          excludeMechanical: true,
        });
        // Registro COMPLETO (docs/CONTRATO-RUN-V2.md): superset do formato flat
        // legado — readRuns/aggregateRuns/--legado continuam lendo os mesmos
        // campos; validar.mjs --runs ganha grafo/modelos/custo/bruto.
        const run = buildRunRecord({
          exercicio: id,
          replica: rep,
          envelopeA,
          robot,
          audit,
          cmp,
          fe,
          modelos: blocoModelos,
          chamadas,
          respostaDoModelo: sink.respostaDoModelo ?? null,
          promptSha256: sink.promptSha256 ?? null,
        });
        run.politicaInput = robot.politicaInput || sink.politicaInput || {
          id: inputPolicy,
          geracao: auditarInputAgentes(inputGeracao, {
            politica: inputPolicy,
            etapa: "geracao",
          }),
        };
        if (args.fluxo === "plataforma") {
          run.fluxo = "plataforma";
          // Preserva o artefato GraphForge anterior aos agentes 6/7. O grafo
          // neutral `grafo` continua existindo para compatibilidade, mas não
          // contém targetRole/família de interação e, portanto, não permite o
          // contraste SAI pareado exigido pelo holdout confirmatório.
          run.bruto.behaviorGraph = {
            nodes: (robot.graph?.nodes || []).map((node) => ({
              id: node.id,
              type: node.type,
              description: node.description,
              instruction: node.instruction,
              action: node.action ?? null,
              interactionFamily: node.interactionFamily ?? null,
              targetRole: node.targetRole ?? null,
              expectedInput: node.expectedInput ?? null,
              knowledgeComponents: node.knowledgeComponents ?? [],
              hints: node.hints ?? [],
              misconceptions: node.misconceptions ?? [],
              scaffoldNodes: node.scaffoldNodes ?? [],
              targetMisconception: node.targetMisconception,
            })),
            edges: robot.graph?.edges || [],
          };
          // Gate do piloto: quantos erros específicos do 3b o graphForge
          // descartou por template não resolvido ({A}/{B}) — na plataforma
          // eles seriam concretizados na materialização; taxa alta = bancada
          // injusta com o fluxo (parar e reavaliar, não coletar).
          run.fidelidadeEstagio = robot.fidelidade;
          // Regime de topologia (2026-08-14): "producao" = corte do GraphForge por
          // perfil/dificuldade; "livre" = todos os passos gerados pelos agentes.
          run.topologia = robot.topologia;
          // Braço "interface fixa" (rodada 4): a interface do CTAT entrou no
          // problema-semente dos agents 3 (ver interface-ctat.js).
          run.interfaceFixa = robot.interfaceFixa === true;
          run.dataset = process.env.STI_DATASET || "frac-numberline-6.17";
          if (robot.interfaceCtat) run.interfaceCtat = robot.interfaceCtat;
          // Traces completos dos três agentes (advancedTrace/atRiskTrace/
          // averageTrace) — mais ricos que o resumo usado no bloco grafo.
          run.bruto.tracos = robot.tracesCompletos;
        }
        if (!args.adapter) {
          const faltando = validarRegistro(run);
          if (faltando.length) {
            throw new Error(`registro incompleto (contrato v2): falta ${faltando.join(", ")}`);
          }
        }
        writeJsonAtomic(runFile, run);
        done++;
        console.log(
          `[${done}/${totalRuns}] ${tag}  f1=${fmt3(run.f1)} conceptual=${fmt3(run.conceptual)} ` +
            `recall=${fmt3(run.recall)} miscs=${run.robotMisconceptions.length}`
        );
      } catch (e) {
        failures.push({ run: tag, error: e.message });
        console.error(`[${done}/${totalRuns}] ${tag}  ✗ FALHOU: ${e.message}`);
        if (args.failFast || (done === 0 && failures.length === 1 && !args.adapter)) {
          console.error(
            "\nColeta interrompida no primeiro erro da célula. A retomada nunca repete " +
              "recibos órfãos sem autorização explícita."
          );
          throw e;
        }
      }
    }
  }

  // ── auditoria do manifesto: nenhum modelo diferente do resolvido ─────────
  let manifestNote = "adaptador externo: manifesto de chamadas fica a cargo do adaptador";
  if (!args.adapter) {
    const manifestDir = path.join(outDir, "manifests");
    const manifestFiles = fs.existsSync(manifestDir)
      ? fs.readdirSync(manifestDir).filter((f) => f.endsWith(".jsonl")).sort()
      : [];
    const calls = manifestFiles.flatMap((f) =>
      fs.readFileSync(path.join(manifestDir, f), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
    );
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
      `tokens in/out = ${tokensIn}/${tokensOut}; ${manifestFiles.length} manifesto(s) por run em manifests/`;
    console.log(`\n✓ manifesto auditado: ${manifestNote}`);
  }

  // ── agregação + comparação opcional com referência ──────────────────────
  const runs = readRuns(path.join(outDir, "runs"));
  if (!runs.length) {
    console.error("\nNenhum run coletado com sucesso; nada a agregar.");
    process.exit(1);
  }
  const metrics = aggregateRuns(runs);
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
        // contrato v2: o MESMO bloco `modelos` gravado em cada run, mais a
        // origem da resolução (auditoria: qual fonte venceu por agente).
        fluxo: args.fluxo,
        topologia: args.fluxo === "plataforma" ? (args.passosLivres || process.env.STI_PASSOS_LIVRES === "1" ? "livre" : "producao") : null,
        interfaceFixa: args.fluxo === "plataforma" ? (args.interfaceFixa || process.env.STI_INTERFACE_FIXA === "1") : null,
        inputPolicy,
        dataset: process.env.STI_DATASET || "frac-numberline-6.17",
        modelos: blocoModelos,
        resolucaoModelos: { engajada: modoPerfil, origem: modoPerfil ? resolucao.origem : null },
        problems: problemIds,
        replicas: args.replicas,
        runsOk: runs.length,
        falhas: failures,
        manifesto: manifestNote,
        referencia: referencePath ? path.relative(REPO, referencePath) : null,
      },
      null,
      1
    )
  );

  const LABELS = {
    recallMisconceptionsConceptual: "completude conceitual",
    conceptual: "F1 conceitual",
    recall: "completude estrita",
    precision: "precisão",
    f1: "F1 estrutural",
    functionalAgreement: "concordância funcional bruta",
    functionalKappa: "kappa funcional (registro)",
  };
  if (deposited) {
    console.log(`\n${line}\nCOMPARAÇÃO COM ${referencePath}`);
    console.log("critério descritivo para LLM estocástico: sobreposição dos IC95% por cluster, não igualdade pontual");
    console.log(line);
    let overlaps = 0;
    const comparable = Object.keys(LABELS).filter((key) => deposited.metrics[key]);
    for (const key of comparable) {
      const a = metrics[key];
      const d = deposited.metrics[key];
      const ok = ciOverlap(a, d);
      if (ok) overlaps++;
      console.log(
        ` ${(ok ? "✓" : "✗").padEnd(1)} ${LABELS[key].padEnd(34)} nova ${fmt3(a.mean)} [${fmt3(a.lower)}; ${fmt3(a.upper)}]` +
          `  vs referência ${fmt3(d.mean)} [${fmt3(d.lower)}; ${fmt3(d.upper)}]  ${ok ? "ICs se sobrepõem" : "SEM sobreposição"}`
      );
    }
    console.log(line);
    console.log(`${overlaps}/${comparable.length} métricas comparáveis com sobreposição de IC.`);
  } else {
    console.log("\nSem --reference-summary: summary novo calculado; nenhuma comparação histórica foi presumida.");
  }
  if (runs.length < 72) {
    console.log(
      `nota: n=${runs.length} run(s) (${problemIds.length} problema(s) x ${args.replicas}); ` +
        "com menos de 24 problemas x 3 réplicas a comparação é ILUSTRATIVA, não uma replicação."
    );
  }
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
