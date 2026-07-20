#!/usr/bin/env node
/**
 * analysis/reproduce-verify.mjs - verificação OFFLINE do benchmark da Campanha 5
 * (npm run reproduce:verify). Zero rede, zero chave, zero custo.
 *
 * Recomputa, direto do clone, quatro blocos e imprime um veredito por bloco:
 *
 *   A. agregados de TODOS os braços da Campanha 5 a partir dos 72 runs brutos
 *      de cada braço, com bootstrap por cluster (10k, seed 42), confrontados
 *      com os summary.json depositados;
 *   B. previsão teórica offline: invariantes do artefato preservado
 *      (previsao-recheck.json) e reexecução determinística do recheck
 *      pós-banimento (analysis/previsao-recheck-pos-banimento.mjs) comparada
 *      campo a campo com o JSON depositado (o arquivo depositado é restaurado
 *      byte a byte ao final; só o timestamp geradoEm difere entre execuções);
 *   C. validação do manuscrito v7 contra os artefatos canônicos
 *      (analysis/validate-article-v7.mjs, 121 fatos, inclui hashes SHA-256);
 *   D. hashes de proveniência do corpus: cada expert.brd e os arquivos da
 *      interface compartilhada contra a tabela de PROVENANCE.md.
 *
 * Tolerâncias declaradas (ver nota de fidelidade em reproduce-lib.mjs):
 *   - médias das seis métricas por run: |delta| <= 6e-4 (arredondamento);
 *   - limites de IC: |delta| <= 6e-3 (fluxo de RNG do bootstrap original);
 *   - recallMisconceptionsConceptual: a reconstrução conservadora deve ficar
 *     de 0 a 0,008 ABAIXO da média preservada (e nunca acima de +6e-4), com
 *     limites de IC a menos de 0,012.
 *
 * Sai com código 0 somente se todos os blocos passarem.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  REPO,
  C5_DIR,
  RUN_BACKED_KEYS,
  readJson,
  readRuns,
  aggregateRuns,
  listArms,
  fmt4,
} from "./reproduce-lib.mjs";
import { validateArticleV7 } from "./validate-article-v7.mjs";

const sha256File = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const line = "=".repeat(74);

const blocks = [];
function runBlock(name, fn) {
  const failures = [];
  const notes = [];
  try {
    fn({
      check: (cond, label) => {
        if (!cond) failures.push(label);
      },
      note: (msg) => notes.push(msg),
    });
  } catch (e) {
    failures.push(`exceção: ${e.message}`);
  }
  blocks.push({ name, failures, notes });
  const mark = failures.length ? "✗" : "✓";
  console.log(`\n${line}\n${mark} ${name}\n${line}`);
  for (const n of notes) console.log(`   ${n}`);
  for (const f of failures) console.log(`   ✗ ${f}`);
}

// ─── Bloco A: agregados de todos os braços a partir dos runs brutos ─────────
runBlock("A. Agregados por braço (runs brutos → bootstrap por cluster 10k seed 42)", (t) => {
  const TOL_MEAN = 6e-4;
  const TOL_CI = 6e-3;
  const TOL_RMC_BELOW = 8e-3;
  const TOL_RMC_ABOVE = 6e-4;
  const TOL_RMC_CI = 1.2e-2;
  const arms = listArms();
  t.check(arms.length === 6, `esperados 6 braços; encontrados ${arms.length}`);
  for (const arm of arms) {
    const armDir = path.join(C5_DIR, arm);
    const runs = readRuns(path.join(armDir, "runs"));
    const summary = readJson(path.join(armDir, "summary.json"));
    t.check(runs.length === 72, `${arm}: esperados 72 runs; encontrados ${runs.length}`);
    t.check(summary.n === 72, `${arm}: summary.n deveria ser 72`);
    t.check(
      String(summary.protocol).includes("bootstrap por cluster (10k, seed 42)"),
      `${arm}: protocolo do summary divergente`
    );
    const rec = aggregateRuns(runs);
    for (const key of RUN_BACKED_KEYS) {
      const a = rec[key];
      const s = summary.metrics[key];
      t.check(s && Number.isFinite(s.mean), `${arm}/${key}: ausente no summary`);
      if (!s) continue;
      t.check(s.nClusters === 24, `${arm}/${key}: nClusters deveria ser 24`);
      t.check(
        Math.abs(a.mean - s.mean) <= TOL_MEAN,
        `${arm}/${key}: média recomputada ${fmt4(a.mean)} difere do summary ${fmt4(s.mean)}`
      );
      t.check(
        Math.abs(a.lower - s.lower) <= TOL_CI && Math.abs(a.upper - s.upper) <= TOL_CI,
        `${arm}/${key}: IC recomputado [${fmt4(a.lower)}, ${fmt4(a.upper)}] fora da tolerância ` +
          `vs [${fmt4(s.lower)}, ${fmt4(s.upper)}]`
      );
    }
    const a = rec.recallMisconceptionsConceptual;
    const s = summary.metrics.recallMisconceptionsConceptual;
    t.check(s && s.nClusters === 24, `${arm}/rmc: summary ausente ou nClusters != 24`);
    if (s) {
      const delta = s.mean - a.mean; // preservado menos reconstruído
      t.check(
        delta >= -TOL_RMC_ABOVE && delta <= TOL_RMC_BELOW,
        `${arm}/recallMisconceptionsConceptual: reconstrução ${fmt4(a.mean)} vs preservado ` +
          `${fmt4(s.mean)} (delta ${fmt4(delta)} fora de [-0,0006, +0,008])`
      );
      t.check(
        Math.abs(a.lower - s.lower) <= TOL_RMC_CI && Math.abs(a.upper - s.upper) <= TOL_RMC_CI,
        `${arm}/recallMisconceptionsConceptual: IC reconstruído fora da tolerância`
      );
      t.note(
        `${arm}: rmc preservado ${fmt4(s.mean)} | reconstrução conservadora ${fmt4(a.mean)} ` +
          `(delta ${fmt4(delta)}) | seis métricas por run: médias exatas`
      );
    }
  }
  t.note("nota: o valor canônico de rmc é o summary.json depositado (hash no manuscrito v7);");
  t.note("a reconstrução por chaves canônicas é conservadora (nunca infla; ver reproduce-lib.mjs).");
});

// ─── Bloco B: previsão teórica offline + recheck pós-banimento ──────────────
runBlock("B. Previsão teórica offline (preservada) + recheck pós-banimento (reexecutado)", (t) => {
  const PT = path.join(C5_DIR, "previsao-teorica");
  const preserved = readJson(path.join(PT, "previsao-recheck.json"));
  t.check(preserved.backoutsValidados === "72/72", "preservado: back-outs deveriam ser 72/72");
  t.check(preserved.runs.length === 72, "preservado: deveriam existir 72 runs");
  t.check(
    preserved.runs.every((r) => r.backoutOk === true),
    "preservado: todo back-out deveria reproduzir o F1 conceitual (erro 0,000)"
  );
  t.check(
    preserved.previsao.conceitualSeAcertarTudoDerivavelEstrito === 0.609,
    "preservado: previsão pontual deveria ser 0,609"
  );
  t.check(
    preserved.coberturaFinal.faltasNaoMecanicas === 75,
    "preservado: deveriam ser 75 faltas não mecânicas"
  );
  t.note("preservado (pré-banimento): 75 faltas, back-outs 72/72, previsão pontual 0,609");

  const posbanPath = path.join(PT, "previsao-recheck-pos-banimento.json");
  const original = fs.readFileSync(posbanPath);
  let regenerated;
  try {
    const res = spawnSync(process.execPath, [path.join(REPO, "analysis", "previsao-recheck-pos-banimento.mjs")], {
      cwd: REPO,
      encoding: "utf8",
      timeout: 300000,
    });
    t.check(res.status === 0, `reexecução do recheck pós-banimento falhou: ${String(res.stderr).slice(0, 300)}`);
    regenerated = readJson(posbanPath);
  } finally {
    fs.writeFileSync(posbanPath, original); // restaura o depositado byte a byte
  }
  if (regenerated) {
    const dep = JSON.parse(original.toString("utf8"));
    const strip = (o) => {
      const { geradoEm, ...rest } = o;
      return rest;
    };
    t.check(
      JSON.stringify(strip(regenerated)) === JSON.stringify(strip(dep)),
      "recheck pós-banimento: reexecução diverge do JSON depositado (além de geradoEm)"
    );
    const cov = regenerated.coberturaFinal;
    t.check(cov.faltasNaoMecanicas === 75, "pós-banimento: 75 faltas não mecânicas");
    t.check(cov.derivaveisEstrito === 69, "pós-banimento: 69 deriváveis estritas");
    t.check(cov.viaEstadoDeEntrada === 3, "pós-banimento: 3 via estado de entrada");
    t.check(cov.naoDerivaveis === 3, "pós-banimento: 3 não deriváveis (17pencils:5/7)");
    t.check(regenerated.backoutsValidados === "72/72", "pós-banimento: back-outs 72/72");
    t.check(
      Math.abs(regenerated.previsao.tetoCompletudePosBanimento - 0.992) < 5e-4,
      "pós-banimento: teto de completude deveria ser 0,992"
    );
    t.check(
      Math.abs(regenerated.previsao.conceitualSeAcertarTudoDerivavelEstrito - 0.607) < 5e-4,
      "pós-banimento: previsão pontual deveria reproduzir 0,607"
    );
    t.note("pós-banimento reexecutado no pacote: 69/75 (92%), teto 0,992, previsão 0,607;");
    t.note("JSON regenerado idêntico ao depositado (exceto geradoEm); depósito restaurado.");
  }
});

// ─── Bloco C: manuscrito v7 contra os artefatos canônicos ───────────────────
runBlock("C. Manuscrito v7 (validate-article-v7: fatos + hashes)", (t) => {
  const out = validateArticleV7();
  t.check(out.status === "ok", "validador do artigo v7 não retornou ok");
  t.check(out.checkedFacts >= 121, `esperados >= 121 fatos; conferidos ${out.checkedFacts}`);
  t.check(out.externalCalls === 0, "o validador deveria ser 100% offline");
  t.note(`${out.checkedFacts} fatos do manuscrito conferidos contra os artefatos (0 chamadas externas)`);
});

// ─── Bloco D: hashes de proveniência do corpus ──────────────────────────────
runBlock("D. Proveniência do corpus (PROVENANCE.md vs hashes recomputados)", (t) => {
  const prov = fs.readFileSync(path.join(REPO, "PROVENANCE.md"), "utf8");
  const rows = [...prov.matchAll(/^\| (\w[\w]*) \| `([0-9a-f]{12})` \|/gm)];
  t.check(rows.length === 24, `esperadas 24 linhas de exercício na tabela; encontradas ${rows.length}`);
  for (const [, id, hash12] of rows) {
    const brd = path.join(REPO, "cases", "ctat-6.17", id, "expert.brd");
    t.check(fs.existsSync(brd), `expert.brd ausente para ${id}`);
    if (fs.existsSync(brd)) {
      t.check(
        sha256File(brd).slice(0, 12) === hash12,
        `hash divergente para ${id} (PROVENANCE.md diz ${hash12})`
      );
    }
  }
  const iface = [...prov.matchAll(/`([\w.]+)` \(([0-9a-f]{12})\)/g)];
  t.check(iface.length >= 4, "linha da interface compartilhada não encontrada em PROVENANCE.md");
  for (const [, name, hash12] of iface) {
    const p = path.join(REPO, "cases", "ctat-6.17", "_interface", name);
    t.check(fs.existsSync(p), `arquivo de interface ausente: ${name}`);
    if (fs.existsSync(p)) {
      t.check(sha256File(p).slice(0, 12) === hash12, `hash divergente para _interface/${name}`);
    }
  }
  t.note(`${rows.length} BRDs + ${iface.length} arquivos de interface conferidos por SHA-256`);
});

// ─── veredito final ─────────────────────────────────────────────────────────
const failed = blocks.filter((b) => b.failures.length);
console.log(`\n${line}`);
for (const b of blocks) console.log(` ${b.failures.length ? "✗" : "✓"} ${b.name}`);
console.log(line);
if (failed.length) {
  console.log(`✗ reproduce:verify FALHOU em ${failed.length} bloco(s).`);
  process.exit(1);
}
console.log("✓ reproduce:verify: todos os blocos passaram (offline, sem chamadas externas).");
