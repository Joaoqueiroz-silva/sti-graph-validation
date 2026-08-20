#!/usr/bin/env node
/**
 * Planejador OFFLINE do painel automatizado v0.8.
 *
 * Não há modo de execução paga neste arquivo. Uma futura coleta deve usar os
 * envelopes cegos congelados, autorização explícita e ledger/trava de orçamento.
 */
import fs from "node:fs";
import path from "node:path";
import {
  COTAS_POR_ESTRATO,
  GATES,
  JUIZES_CONGELADOS,
  TRILHAS_PLANEJADAS,
  construirControlesFixos,
  estimarOrcamentoPainel,
  prepararPlanoPainel,
} from "../analysis/orientador-v08/painel-automatizado.mjs";

function argsOf(argv) {
  const args = { help: false, frame: null, json: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--plano") continue;
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--frame") args.frame = argv[++i] ?? null;
    else if (arg === "--json") args.json = argv[++i] ?? null;
    else if (arg === "--executar" || arg === "--yes") {
      throw new Error("este comando é somente offline; chamadas pagas exigem runner e autorização separados");
    } else throw new Error(`argumento desconhecido: ${arg}`);
  }
  if (args.json && !args.frame) throw new Error("--json exige --frame <arquivo>");
  return args;
}

function usage() {
  return `Uso:
  node scripts/painel-automatizado-v08.mjs --plano
  node scripts/painel-automatizado-v08.mjs --frame frame.json [--json plano-congelado.json]

O primeiro comando calcula somente o desenho máximo e o orçamento. O segundo
seleciona offline uma amostra a partir de um array JSON (ou {"items": [...]}) e,
se pedido, grava o plano servidor. Nenhuma opção faz chamada de rede.`;
}

function readFrame(file) {
  const parsed = JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
  const frame = Array.isArray(parsed) ? parsed : parsed?.items;
  if (!Array.isArray(frame)) throw new Error("frame deve ser array JSON ou objeto com items[]");
  return frame;
}

function atomicWrite(file, value) {
  const absolute = path.resolve(file);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  const tmp = `${absolute}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmp, absolute);
  return absolute;
}

export function resumoDryRun() {
  const strata = TRILHAS_PLANEJADAS.reduce((sum, track) => sum + track.strata, 0);
  const quotaPerStratum = Object.values(COTAS_POR_ESTRATO).reduce((a, b) => a + b, 0);
  return {
    mode: "offline-plan-only",
    networkCalls: 0,
    paidCalls: 0,
    evidenceLabel: "evidência automatizada exploratória; não é validação pedagógica",
    design: {
      strata,
      tracks: TRILHAS_PLANEJADAS,
      quotaPerStratum,
      maxStudyItems: strata * quotaPerStratum,
      controlItems: construirControlesFixos().length,
      judges: JUIZES_CONGELADOS,
      gates: GATES,
    },
    budget: estimarOrcamentoPainel(),
  };
}

export function main(argv = process.argv.slice(2)) {
  const args = argsOf(argv);
  if (args.help) {
    console.log(usage());
    return null;
  }
  if (!args.frame) {
    const summary = resumoDryRun();
    console.log("PAINEL AUTOMATIZADO V0.8 — SOMENTE PLANO OFFLINE");
    console.log("  chamadas de rede: 0 · chamadas pagas: 0");
    console.log(`  ${summary.design.strata} estratos · até ${summary.design.maxStudyItems} itens de estudo · ${summary.design.controlItems} controles`);
    console.log(`  ${summary.design.judges.length} juízes cross-family · ${summary.budget.primaryCalls} chamadas primárias planejadas`);
    console.log(`  custo esperado: ~US$ ${summary.budget.expectedUsd.toFixed(2)}`);
    console.log(`  reserva de pior caso (1 retentativa): US$ ${summary.budget.reservedWorstCaseUsd.toFixed(2)}`);
    console.log(`  teto separado sugerido: US$ ${summary.budget.recommendedHardCapUsd.toFixed(2)}`);
    console.log(`  rótulo obrigatório: ${summary.evidenceLabel}`);
    return summary;
  }
  const plan = prepararPlanoPainel(readFrame(args.frame));
  console.log("PAINEL AUTOMATIZADO V0.8 — AMOSTRA PREPARADA OFFLINE");
  console.log("  chamadas de rede: 0 · chamadas pagas: 0");
  console.log(`  plano sha256: ${plan.planSha256}`);
  console.log(`  estudo=${plan.sample.studyItems} · controles=${plan.sample.controlItems} · total/juiz=${plan.sample.totalItemsPerJudge}`);
  console.log(`  células com escassez=${plan.sample.shortfallCells.length}`);
  if (args.json) console.log(`  plano gravado: ${atomicWrite(args.json, plan)}`);
  return plan;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    console.error(`ERRO: ${error.message}`);
    process.exitCode = 1;
  }
}
