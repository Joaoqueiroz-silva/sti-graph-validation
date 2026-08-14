/**
 * validar.mjs — bateria de validação de qualidade dos grafos gerados.
 *
 * Uso:
 *   node analysis/validacao-v2/validar.mjs --runs <dir>            # formato novo (grafo completo)
 *   node analysis/validacao-v2/validar.mjs --legado <dir>          # formato antigo (só valores)
 *   node analysis/validacao-v2/validar.mjs --runs <dir> --json out.json
 *
 * Não faz chamada de rede e não custa nada.
 */
import fs from "node:fs";
import path from "node:path";
import {
  carregarReferencia, listarExercicios, canonAnswer, ehValorUtilizavel,
  media, intervalo, comparar, fmt,
} from "./lib.mjs";

const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const dirRuns = arg("--runs");
const dirLegado = arg("--legado");
const saidaJson = arg("--json");
const raiz = arg("--raiz", ".");

if (!dirRuns && !dirLegado) {
  console.error("informe --runs <dir> (formato novo) ou --legado <dir> (só valores)");
  process.exit(2);
}

const REF = carregarReferencia(raiz);
const exs = listarExercicios(raiz);

/** Contrato do formato novo. Ver docs/CONTRATO-RUN-V2.md. */
function lerRuns(dir) {
  const out = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    if (dirLegado) {
      out.push({
        ex: j.id ?? j.exercicio,
        completo: false,
        valores: new Set((j.robotMisconceptions || []).map((v) => canonAnswer(String(v).trim()))),
        auditoria: j.audit ?? null,
      });
      continue;
    }
    const g = j.grafo || {};
    const erros = (g.erros || []).map((e) => ({
      valor: canonAnswer(String(e.valor ?? "").trim()),
      bruto: String(e.valor ?? ""),
      passo: Number(e.passo),
      componente: String(e.componente || "").toLowerCase(),
      acao: String(e.acao || "").toLowerCase(),
      devolutiva: String(e.devolutiva || ""),
    }));
    out.push({
      ex: j.exercicio ?? j.id,
      completo: true,
      erros,
      nPassos: (g.passos || []).length,
      valores: new Set(erros.map((e) => e.valor)),
      auditoria: j.auditoria ?? j.audit ?? null,
    });
  }
  return out;
}

const runs = lerRuns(dirRuns || dirLegado).filter((r) => REF[r.ex]);
if (!runs.length) { console.error("nenhum run casou com o corpus"); process.exit(2); }

const rel = { gerado: new Date().toISOString(), runs: runs.length, exercicios: exs.length, niveis: {} };
const P = (s) => console.log(s);

P("=".repeat(70));
P("VALIDAÇÃO DE QUALIDADE DOS GRAFOS — " + runs.length + " registros");
P("=".repeat(70));

// ---------- NÍVEL 0 — estrutura ----------
const comAud = runs.filter((r) => r.auditoria && typeof r.auditoria.ok === "boolean");
if (comAud.length) {
  const ok = comAud.filter((r) => r.auditoria.ok).length;
  P("\nNÍVEL 0 — estrutura executável");
  P(`  aprovados na auditoria: ${ok} de ${comAud.length}`);
  rel.niveis.estrutura = { ok, total: comAud.length };
}

// ---------- NÍVEL 1 — valor ----------
const l1 = runs.map((r) => ({ ex: r.ex, ...comparar(REF[r.ex].values, r.valores, 2) }));
const icCob = intervalo(l1, "cobertura");
const icPre = intervalo(l1, "precisao");
const icF1 = intervalo(l1, "f1");
const icJac = intervalo(l1, "jaccard");
const totInter = l1.reduce((s, x) => s + x.inter, 0);
const totRef = runs.reduce((s, r) => s + REF[r.ex].values.size, 0);
const totGer = runs.reduce((s, r) => s + r.valores.size, 0);
P("\nNÍVEL 1 — o valor do erro coincide");
P(`  cobertura : ${fmt(icCob)}`);
P(`  precisão  : ${fmt(icPre)}`);
P(`  F1        : ${fmt(icF1)}`);
P(`  F2        : ${media(l1.map((x) => x.fbeta)).toFixed(4)}   (peso duplo na cobertura)`);
P(`  Jaccard   : ${fmt(icJac)}`);
P(`  micro     : cobertura ${(totInter / totRef).toFixed(4)} | precisão ${(totInter / totGer).toFixed(4)}`);
P(`  candidatos por registro: ${(totGer / runs.length).toFixed(2)} contra ${(totRef / runs.length).toFixed(2)} da referência`);
rel.niveis.valor = { cobertura: icCob, precisao: icPre, f1: icF1, jaccard: icJac,
  microCobertura: totInter / totRef, microPrecisao: totInter / totGer,
  candidatosPorRegistro: totGer / runs.length };

// ---------- NÍVEIS 2 a 4 — só com grafo completo ----------
const completos = runs.filter((r) => r.completo);
if (!completos.length) {
  P("\nNÍVEIS 2 a 4 — indisponíveis: os registros não preservam o grafo completo.");
  P("  Use o coletor v2 (docs/CONTRATO-RUN-V2.md) para habilitar.");
} else {
  const l2 = [], l3 = [], l4 = [];
  let pares = 0, tol10 = 0, tol15 = 0, tol20 = 0;
  const desvios = [];
  for (const r of completos) {
    const R = REF[r.ex];
    const nG = r.nPassos || Math.max(1, ...r.erros.map((e) => e.passo || 1));
    const chaveVP = new Set(r.erros.map((e) => e.valor + "@" + e.passo));
    const refVP = new Set(R.items.map((i) => i.valor + "@" + i.passo));
    const chaveVPC = new Set(r.erros.map((e) => e.valor + "@" + e.passo + "@" + e.componente));
    const refVPC = new Set(R.items.map((i) => i.valor + "@" + i.passo + "@" + i.componente));
    l2.push({ ex: r.ex, cobertura: refVP.size ? [...refVP].filter((k) => chaveVP.has(k)).length / refVP.size : 0 });
    l3.push({ ex: r.ex, cobertura: refVPC.size ? [...refVPC].filter((k) => chaveVPC.has(k)).length / refVPC.size : 0 });
    // posição relativa, que corrige diferença de granularidade
    let acertos = 0;
    for (const ri of R.items) {
      const cands = r.erros.filter((e) => e.valor === ri.valor);
      if (!cands.length) continue;
      pares++;
      const d = Math.min(...cands.map((c) => Math.abs(c.passo / nG - ri.passoRel)));
      desvios.push(d);
      if (d <= 0.1) tol10++;
      if (d <= 0.15) { tol15++; acertos++; }
      if (d <= 0.2) tol20++;
    }
    l4.push({ ex: r.ex, cobertura: R.items.length ? acertos / R.items.length : 0 });
  }
  P("\nNÍVEL 2 — valor no passo certo (índice bruto)");
  P(`  cobertura : ${fmt(intervalo(l2, "cobertura"))}`);
  P("\nNÍVEL 3 — valor, passo e componente da interface");
  P(`  cobertura : ${fmt(intervalo(l3, "cobertura"))}`);
  P("\nNÍVEL 2b — posição relativa (corrige granularidade)");
  if (pares) {
    P(`  pares com valor coincidente: ${pares}`);
    P(`  dentro de ±10% do caminho: ${(tol10 / pares * 100).toFixed(1)}%`);
    P(`  dentro de ±15%           : ${(tol15 / pares * 100).toFixed(1)}%`);
    P(`  dentro de ±20%           : ${(tol20 / pares * 100).toFixed(1)}%`);
    P(`  desvio mediano de posição: ${([...desvios].sort((a, b) => a - b)[Math.floor(desvios.length / 2)] * 100).toFixed(1)}% do caminho`);
  }
  const granR = media(exs.map((e) => REF[e].nPassos));
  const granG = media(completos.map((r) => r.nPassos || 0));
  P("\nGRANULARIDADE");
  P(`  passos do especialista: ${granR.toFixed(1)} | do agente: ${granG.toFixed(1)} | razão: ${(granR / (granG || 1)).toFixed(2)}x`);
  rel.niveis.posicao = { l2: intervalo(l2, "cobertura"), l3: intervalo(l3, "cobertura"),
    relativa: { pares, tol10: tol10 / pares, tol15: tol15 / pares, tol20: tol20 / pares },
    granularidadeRef: granR, granularidadeGerado: granG };

  // ---------- NÍVEL 5 — devolutiva ----------
  const dg = completos.flatMap((r) => r.erros);
  const dr = exs.flatMap((e) => REF[e].items);
  const analisa = (fb, valor) => {
    const t = String(fb || "").toLowerCase();
    return {
      vazia: !String(fb || "").trim(),
      mencionaValor: valor ? t.includes(String(valor).toLowerCase()) : false,
      falaComAluno: /\bvoc[eê]\b|\bsua\b|\bseu\b|tente|observe|note|lembre|verifique|clique|conte|vamos/.test(t),
      instruiProfessor: /^\s*(utilizar|usar|revisar|explicar|mostrar|apresentar|reforçar|trabalhar|propor|aplicar)/i.test(String(fb || "").trim()),
    };
  };
  const ag = dg.map((m) => analisa(m.devolutiva, m.bruto));
  const rf = dr.map((m) => analisa(m.devolutiva, m.bruto));
  const pct = (a, k) => (a.length ? (a.filter((x) => x[k]).length / a.length) * 100 : 0);
  P("\nNÍVEL 5 — qualidade da devolutiva          ESPECIALISTA   AGENTE");
  P(`  menciona o valor que o aluno errou       ${pct(rf, "mencionaValor").toFixed(1)}%${" ".repeat(9)}${pct(ag, "mencionaValor").toFixed(1)}%`);
  P(`  fala com o aluno                         ${pct(rf, "falaComAluno").toFixed(1)}%${" ".repeat(9)}${pct(ag, "falaComAluno").toFixed(1)}%`);
  P(`  é instrução para o professor             ${pct(rf, "instruiProfessor").toFixed(1)}%${" ".repeat(9)}${pct(ag, "instruiProfessor").toFixed(1)}%`);
  P(`  vazia                                    ${pct(rf, "vazia").toFixed(1)}%${" ".repeat(9)}${pct(ag, "vazia").toFixed(1)}%`);
  const mal = dg.filter((m) => !ehValorUtilizavel(m.bruto));
  P(`\n  respostas não utilizáveis (prosa em vez de valor): ${mal.length} de ${dg.length} = ${(mal.length / dg.length * 100).toFixed(1)}%`);
  if (mal.length) P(`  exemplos: ${[...new Set(mal.map((m) => m.bruto))].slice(0, 5).map((s) => JSON.stringify(s)).join(", ")}`);
  rel.niveis.devolutiva = {
    especialista: { mencionaValor: pct(rf, "mencionaValor"), falaComAluno: pct(rf, "falaComAluno"), instruiProfessor: pct(rf, "instruiProfessor") },
    agente: { mencionaValor: pct(ag, "mencionaValor"), falaComAluno: pct(ag, "falaComAluno"), instruiProfessor: pct(ag, "instruiProfessor") },
    naoUtilizaveis: mal.length / dg.length,
  };
}

// ---------- BASELINES ----------
const frac = (a) => { const m = /^(\d+)\s*\/\s*(\d+)$/.exec(a || ""); return m ? { num: +m[1], den: +m[2] } : null; };
function B1(a) { const f = frac(a), s = new Set(); if (!f) return s;
  s.add(canonAnswer(String(f.num))); s.add(canonAnswer(String(f.den))); s.add(canonAnswer(f.den + "/" + f.num)); return s; }
function B2(a) { const f = frac(a), s = new Set(B1(a)); if (!f) return s;
  for (let k = 0; k <= f.den; k++) s.add(canonAnswer(k + "/" + f.den)); return s; }
function B3(a) { const f = frac(a), s = new Set(B2(a)); if (!f) return s;
  for (let k = 0; k <= Math.max(f.den, f.num); k++) s.add(canonAnswer(String(k)));
  s.add(canonAnswer(f.den + "/" + f.num));
  s.add(canonAnswer((f.num - 1) + "/" + f.den)); s.add(canonAnswer((f.num + 1) + "/" + f.den));
  s.add(canonAnswer(f.num + "/" + (f.den - 1))); s.add(canonAnswer(f.num + "/" + (f.den + 1))); return s; }

P("\n" + "=".repeat(70));
P("LINHA DE BASE — enumeradores sem IA, com a mesma informação de entrada");
P("=".repeat(70));
rel.baselines = {};
for (const [nome, fn] of [["tímido", B1], ["médio", B2], ["amplo", B3]]) {
  const linhas = runs.map((r) => ({ ex: r.ex, ...comparar(REF[r.ex].values, fn(REF[r.ex].resposta)) }));
  const c = intervalo(linhas, "cobertura"), p = intervalo(linhas, "precisao");
  const cand = media(runs.map((r) => fn(REF[r.ex].resposta).size));
  P(`  ${nome.padEnd(8)} cobertura ${c.estimativa.toFixed(3)} [${c.bca[0].toFixed(3)};${c.bca[1].toFixed(3)}] | precisão ${p.estimativa.toFixed(3)} | candidatos ${cand.toFixed(1)}`);
  rel.baselines[nome] = { cobertura: c, precisao: p, candidatos: cand };
}
P("\n  Leitura: o agente só tem mérito onde supera estes enumeradores.");
P("  Nenhum deles usa modelo de linguagem.");

if (saidaJson) { fs.writeFileSync(saidaJson, JSON.stringify(rel, null, 2)); P(`\nrelatório salvo em ${saidaJson}`); }
