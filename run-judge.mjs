#!/usr/bin/env node
/**
 * evaluation/run-judge.mjs — Juiz CEGO: os erros "a-mais" do robô são válidos? (separa "diferente" de "pior")
 *
 * Para cada problema: o robô autora cego → pegamos os erros que o robô previu e o
 * especialista NÃO listou ("a-mais"). Um juiz cross-family (GLM) avalia — CEGO à origem —
 * esses erros, MAIS os erros conceituais do próprio especialista (calibração) e distratores
 * óbvios (controle negativo). Agrega a taxa de validade por origem.
 *
 * Uso:
 *   DOTENV_CONFIG_PATH=../.env node -r dotenv/config evaluation/run-judge.mjs [caminho] [--limit N]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseBrdToExpertNeutral } from "./parse-ctat-brd.js";
import { authorFromBrd } from "./author-from-ctat.js";
import { simulateStudentsReal } from "./simulate-students-real.js";
import { canonAnswer } from "./schema.js";
import { wilsonCI } from "./stats.js";
import {
  buildJudgeItems,
  judgeItems,
  summarizeBySource,
  makeDistractors,
  judgeImportanceItems,
  summarizeImportance,
} from "./judge-misconceptions.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CAP = 5; // teto de itens por origem (custo)
const read = (p) => fs.readFileSync(p, "utf8");
const isProblemDir = (d) => fs.existsSync(path.join(d, "expert.brd"));
const sharedHtml = (root) => {
  const p = path.join(root, "_interface", "interface.html");
  return fs.existsSync(p) ? read(p) : undefined;
};

// Deduplica MISCONCEPTIONS pela chave do esquema neutro (m.key) — a MESMA âncora do
// metrics.js (2026-07-02, verificação adversarial: usar canonAnswer(wrongAnswer) aqui
// e key lá fazia a completude do 2D divergir do recallMisconceptions p/ o mesmo grafo).
function distinctByKey(miscs) {
  const seen = new Set();
  const out = [];
  for (const m of miscs) {
    const k = m.key;
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(m);
  }
  return out;
}

async function runProblem(dir, html, opts = {}) {
  const id = path.basename(dir);
  const brd = read(path.join(dir, "expert.brd"));
  const expert = parseBrdToExpertNeutral(brd);

  const robot = await authorFromBrd(brd, {
    html,
    simulate: opts.real ? simulateStudentsReal : undefined,
  });
  const problem = robot.envelopeA?.problem || "";
  const correctAnswer = robot.envelopeA?.correctAnswer || "";

  const expertAllKeys = new Set((expert.misconceptions || []).map((m) => m.key));
  const robotKeys = new Set((robot.neutral.misconceptions || []).map((m) => m.key));
  const expertConceptualAll = distinctByKey(
    (expert.misconceptions || []).filter((m) => !m.mechanical)
  );
  const expertConceptual = expertConceptualAll.map((m) => m.wrongAnswer).slice(0, CAP);
  // "a-mais" = erros do robô que NÃO casam nenhum erro do especialista (conceitual ou mecânico)
  const robotExtras = distinctByKey(
    (robot.neutral.misconceptions || []).filter((m) => !expertAllKeys.has(m.key))
  )
    .map((m) => m.wrongAnswer)
    .slice(0, CAP);
  // "perdidos" = erros CONCEITUAIS do especialista que o robô NÃO cobriu (testa "complementar")
  const missingAll = distinctByKey(
    (expert.misconceptions || []).filter((m) => !m.mechanical && !robotKeys.has(m.key))
  );
  const missing = missingAll.map((m) => m.wrongAnswer).slice(0, CAP);
  // COMPLETUDE desta MESMA autoria (eixo X do veredito 2D) — antes do CAP, sem viés.
  const completude = expertConceptualAll.length
    ? (expertConceptualAll.length - missingAll.length) / expertConceptualAll.length
    : 1;

  const items = buildJudgeItems({
    robotExtras,
    expertConceptual,
    distractors: makeDistractors(correctAnswer),
  });
  const judged = await judgeItems(problem, correctAnswer, items);
  // Juiz de IMPORTÂNCIA sobre os perdidos: central = robô deixou passar erro que importa.
  const missingJudged = await judgeImportanceItems(problem, correctAnswer, missing);
  const groups = summarizeBySource(judged);
  return {
    id,
    correctAnswer,
    judged,
    groups,
    missing: missingJudged,
    importance: summarizeImportance(missingJudged),
    // Veredito 2D da MESMA autoria (não mistura corridas): X=completude, Y=validade dos extras.
    point2D: {
      completude: Math.round(completude * 1000) / 1000,
      validadeExtras: groups["robo-extra"]?.validRate ?? null,
    },
  };
}

function pct(x) {
  return x == null ? "n/a" : (x * 100).toFixed(0) + "%";
}

function printProblem(res) {
  const g = res.groups;
  const line = (k) => (g[k] ? `${k}=${pct(g[k].validRate)} (${g[k].valid}/${g[k].n})` : `${k}=—`);
  console.log(`\n■ ${res.id}  resposta=${res.correctAnswer}`);
  const p2 = res.point2D;
  console.log(
    `   2D: (completude=${pct(p2.completude)}, validade-extras=${pct(p2.validadeExtras)})  — canto bom = (alto, alto)`
  );
  console.log(
    `   ${line("robo-extra")}  |  ${line("especialista")}  |  ${line("distrator-correta")}  |  ${line("distrator-absurdo")}`
  );
  const imp = res.importance;
  if (imp && imp.n)
    console.log(
      `   PERDIDOS pelo robô: ${imp.n} (central=${imp.central} periférico=${imp.periferico} mecânico=${imp.mecanico}) → %central=${pct(imp.centralRate)}`
    );
  const robo = (res.judged || []).filter((j) => j.source === "robo-extra");
  for (const j of robo) {
    console.log(
      `     robô "${j.candidate}": ${j.valid ? "✅ válido" : "❌"} [${j.category}] — ${j.reason}`
    );
  }
}

function parseArgs(argv) {
  const out = { target: "cases/ctat-6.17", limit: Infinity, real: false, outPath: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--limit") out.limit = parseInt(argv[++i], 10) || Infinity;
    else if (argv[i] === "--real") out.real = true;
    else if (argv[i] === "--out") out.outPath = argv[++i];
    else if (!argv[i].startsWith("--")) out.target = argv[i];
  }
  return out;
}

async function main() {
  const { target, limit, real, outPath } = parseArgs(process.argv.slice(2));
  const root = path.isAbsolute(target) ? target : path.join(HERE, target);
  const parent = isProblemDir(root) ? path.dirname(root) : root;
  const html = sharedHtml(parent);
  let dirs = isProblemDir(root)
    ? [root]
    : fs
        .readdirSync(root)
        .map((d) => path.join(root, d))
        .filter((d) => fs.statSync(d).isDirectory() && isProblemDir(d))
        .sort();
  dirs = dirs.slice(0, limit);
  if (!dirs.length) {
    console.error(`Nenhum problema (com expert.brd) em ${root}`);
    process.exit(1);
  }

  const mode = real ? "AGENTES REAIS 3a/3b/3c" : "shim consolidado";
  console.log(`Juiz CEGO (GLM cross-family) em ${dirs.length} problema(s) [robô=${mode}]…`);
  const results = [];
  for (const dir of dirs) {
    try {
      const res = await runProblem(dir, html, { real });
      printProblem(res);
      results.push(res);
    } catch (e) {
      console.log(`\n■ ${path.basename(dir)}  ❌ ERRO: ${e.message}`);
    }
  }

  // Agregado: junta todos os itens julgados e calcula a taxa por origem (pooled),
  // SEMPRE como proporção agregada com IC (Wilson) sobre o corpus — nunca por
  // exercício isolado (n≈3 por exercício é ruído; handoff §3.3).
  const allJudged = results.flatMap((r) => r.judged);
  const pooled = summarizeBySource(allJudged);
  const sourceLine = (k) => {
    const g = pooled[k];
    if (!g) return "—";
    const w = wilsonCI(g.valid, g.n);
    return `${pct(g.validRate)} válidos (${g.valid}/${g.n})  IC95%[${pct(w.lower)}, ${pct(w.upper)}]`;
  };

  const ln = "═".repeat(70);
  console.log(`\n${ln}\nAGREGADO — VALIDADE PEDAGÓGICA (juiz cego)\n${ln}`);
  console.log(`  robô (erros que o especialista NÃO listou) : ${sourceLine("robo-extra")}`);
  console.log(`  especialista (calibração: a régua do válido): ${sourceLine("especialista")}`);
  console.log(`  distrator = resposta correta (ctrl negativo): ${sourceLine("distrator-correta")}`);
  console.log(`  distrator = valor absurdo (ctrl negativo)   : ${sourceLine("distrator-absurdo")}`);

  // VEREDITO 2D agregado (mesma autoria em cada exercício): canto bom = (alto, alto).
  const completudes = results.map((r) => r.point2D?.completude).filter((x) => Number.isFinite(x));
  const meanCompletude = completudes.length
    ? completudes.reduce((s, x) => s + x, 0) / completudes.length
    : null;
  console.log(
    `\n  ➤ VEREDITO 2D agregado: (completude=${pct(meanCompletude)}, validade-extras=${pct(pooled["robo-extra"]?.validRate)})`
  );

  // Calibração do juiz contra amostra HUMANA (κ, Landis & Koch 1977), quando existir:
  // <corpus>/human-judge-labels.json = { "<respostaErrada>": true|false, ... }.
  const labelsPath = path.join(parent, "human-judge-labels.json");
  if (fs.existsSync(labelsPath)) {
    const human = JSON.parse(fs.readFileSync(labelsPath, "utf8"));
    const byKey = new Map(Object.entries(human).map(([k, v]) => [canonAnswer(k), !!v]));
    const rows = allJudged.filter((j) => byKey.has(canonAnswer(j.candidate)));
    if (rows.length) {
      const agree = rows.filter((j) => j.valid === byKey.get(canonAnswer(j.candidate))).length;
      const po = agree / rows.length;
      const pJ = rows.filter((j) => j.valid).length / rows.length;
      const pH = rows.filter((j) => byKey.get(canonAnswer(j.candidate))).length / rows.length;
      const pe = pJ * pH + (1 - pJ) * (1 - pH);
      const kappa = pe >= 1 ? 1 : (po - pe) / (1 - pe);
      const strength =
        kappa >= 0.81
          ? "quase perfeito"
          : kappa >= 0.61
            ? "substancial"
            : kappa >= 0.41
              ? "moderado"
              : "fraco";
      console.log(
        `  κ juiz×humano = ${kappa.toFixed(3)} (${strength}, Landis & Koch) sobre ${rows.length} itens rotulados`
      );
    }
  } else {
    console.log(
      "  (calibração humana pendente: crie human-judge-labels.json no corpus p/ logar o κ juiz×humano)"
    );
  }

  const re = pooled["robo-extra"]?.validRate;
  const ex = pooled["especialista"]?.validRate;
  console.log("");
  if (re != null && ex != null) {
    if (re >= ex - 0.1) {
      console.log(
        "  ➤ Leitura: erros do robô tão válidos quanto os do especialista → COMPLEMENTAR (diferente, não pior)."
      );
    } else if (re <= 0.4) {
      console.log("  ➤ Leitura: muitos erros do robô são ruído → parte é PIOR.");
    } else {
      console.log(
        "  ➤ Leitura: parcialmente válidos — robô cobre alguns erros reais, inventa outros."
      );
    }
  }
  console.log(
    "  ⚠️  Os distratores DEVEM ter taxa baixa; se não tiverem, o juiz é carimbo e o resultado não vale."
  );

  // PERDIDOS (importância): dos erros do especialista que o robô não cobriu, quantos CENTRAIS?
  const allMissing = results.flatMap((r) => r.missing || []);
  const missImp = summarizeImportance(allMissing);
  console.log(
    `\n${ln}\nERROS PERDIDOS PELO ROBÔ — IMPORTÂNCIA (separa complementar de pior)\n${ln}`
  );
  console.log(
    `  perdidos julgados=${missImp.n}: central=${missImp.central}  periférico=${missImp.periferico}  mecânico=${missImp.mecanico}`
  );
  console.log(`  %CENTRAL entre os perdidos = ${pct(missImp.centralRate)}`);
  if (missImp.n) {
    if (missImp.centralRate <= 0.34)
      console.log(
        "  ➤ Leitura: o robô perde sobretudo erros periféricos/mecânicos → tese COMPLEMENTAR se sustenta."
      );
    else if (missImp.centralRate >= 0.5)
      console.log(
        "  ➤ Leitura: o robô perde muitos erros CENTRAIS → há lacuna de recall que importa (parte é PIOR)."
      );
    else
      console.log("  ➤ Leitura: misto — o robô perde alguns erros centrais e muitos periféricos.");
  }

  const out = outPath
    ? path.isAbsolute(outPath)
      ? outPath
      : path.join(process.cwd(), outPath)
    : path.join(parent, "report-judge.json");
  fs.writeFileSync(
    out,
    JSON.stringify(
      {
        mode: real ? "real" : "shim",
        pooled,
        missingImportance: missImp,
        point2D: {
          completude: meanCompletude != null ? Math.round(meanCompletude * 1000) / 1000 : null,
          validadeExtras: pooled["robo-extra"]?.validRate ?? null,
        },
        cases: results.map((r) => ({
          id: r.id,
          groups: r.groups,
          importance: r.importance,
          point2D: r.point2D,
        })),
      },
      null,
      2
    )
  );
  console.log(`\nRelatório salvo em: ${path.relative(process.cwd(), out)}\n`);
}

main();
