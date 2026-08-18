#!/usr/bin/env node
/**
 * analysis/bancada-v2/analisar-materializado.mjs — régua de ESTADOS sobre os
 * registros MATERIALIZADOS (agent 6 + agent 7 de produção), conforme o
 * pré-registro da materialização (rodada 3, 2026-08-15) e da rodada 4.
 *
 * Para cada registro (exercício × réplica) calcula três leituras do MESMO
 * registro — cru (rótulos do estágio 3), mínima (valor extraído do rótulo) e
 * materializado (expectedAnswer do agent 6 via agent 7) — e:
 *   - taxa de aprovação do gate de problema fixo: ESTRITO (pré-registrado) e
 *     SENSIBILIDADE (constantes 0/1 do domínio; declarada antes da análise);
 *   - métricas da régua (LCS, sem ordem, íntegro, erros/dicas no estado certo,
 *     extras) só nos APROVADOS, com BCa em cluster de exercício e DP entre
 *     réplicas;
 *   - diferença PAREADA materializado − mínima nos mesmos registros aprovados.
 * Uso: node analysis/bancada-v2/analisar-materializado.mjs --mat <dir> [--rotulo x] [--json out]
 */
import fs from "node:fs";
import path from "node:path";
import { carregarReferencia, intervalo, media, fmt } from "../validacao-v2/lib.mjs";
import { pontuarCaminho, dpEntreReplicas } from "./comparar-caminho.mjs";
import { verificarProblemaFixo } from "../../materializar-registro.js";

import { problemsDirRelativo } from "../../dataset-config.js";
// resolvido em tempo de chamada (multi-corpus no mesmo processo)
const DATASET = () => problemsDirRelativo();
const METRICAS = ["coberturaEstados", "coberturaSemOrdem", "caminhoIntegro", "errosNoEstadoCerto", "dicasNoEstadoCerto"];

export function analisarMaterializado(dirMat, { raiz = ".", rotulo = path.basename(dirMat) } = {}) {
  const REF = carregarReferencia(raiz);
  const runsDir = path.join(dirMat, "runs");
  const registros = [];
  for (const f of fs.readdirSync(runsDir).filter((x) => x.endsWith(".json")).sort()) {
    const r = JSON.parse(fs.readFileSync(path.join(runsDir, f), "utf8"));
    const ex = r.exercicio ?? r.id;
    if (!REF[ex] || !r.materializado?.grafo) continue;
    const envA = JSON.parse(fs.readFileSync(path.join(raiz, DATASET(), ex, "envelope-a.json"), "utf8"));
    const envB = JSON.parse(fs.readFileSync(path.join(raiz, DATASET(), ex, "envelope-b.json"), "utf8"));
    const gateEstrito = r.materializado.problemaFixo?.aprovado === true;
    const gateSens = verificarProblemaFixo(envA, r.materializado.exercicio, r.materializado.grafo, { constantesDeDominio: true }).aprovado;
    // sensibilidade 2 (post hoc, 2026-08-16): 0/1 + equivalência canônica (1.25 ≡ 5/4)
    const gateSens2 = verificarProblemaFixo(envA, r.materializado.exercicio, r.materializado.grafo, { constantesDeDominio: true, equivalenciaCanonica: true }).aprovado;
    // sensibilidade 3 (2026-08-16): sens. 2 + números mistos ("2 3/4" ≡ 11/4)
    const gateSens3 = verificarProblemaFixo(envA, r.materializado.exercicio, r.materializado.grafo, { constantesDeDominio: true, equivalenciaCanonica: true, numerosMistos: true }).aprovado;
    // sensibilidade 4 (a priori para o 8.12, corpus de porcentagem): "152%" ≡ "152"
    const gateSens4 = verificarProblemaFixo(envA, r.materializado.exercicio, r.materializado.grafo, { constantesDeDominio: true, equivalenciaCanonica: true, numerosMistos: true, sufixoPercentual: true }).aprovado;
    const cru = pontuarCaminho(r, envB, REF[ex]);
    const minima = pontuarCaminho(r, envB, REF[ex], { materializar: true });
    const mat = pontuarCaminho({ ...r, grafo: r.materializado.grafo }, envB, REF[ex]);
    registros.push({ ex, replica: r.replica, gateEstrito, gateSens, gateSens2, gateSens3, gateSens4, cru, minima, mat, valores: r.materializado.grafo.passos.map((p) => p.valor) });
  }
  const n = registros.length;
  const agreg = (linhas) =>
    Object.fromEntries(METRICAS.map((c) => [c, { ...intervalo(linhas, c), dpEntreReplicas: dpEntreReplicas(linhas, c) }]));
  const extras = (linhas) => ({
    estados: media(linhas.map((l) => l.extras.estados)),
    erros: media(linhas.map((l) => l.extras.erros)),
    dicas: media(linhas.map((l) => l.extras.dicas)),
    estadosPorGrafo: media(linhas.map((l) => l.nEstadosAgente)),
  });
  const bloco = (sel) => {
    const rs = registros.filter(sel);
    if (!rs.length) return null;
    const L = (k) => rs.map((r) => ({ ...r[k], ex: r.ex }));
    // diferença pareada por registro: materializado − mínima
    const dif = rs.map((r) => Object.fromEntries([["ex", r.ex], ...METRICAS.map((c) => [c, r.mat[c] === null || r.minima[c] === null ? null : r.mat[c] - r.minima[c]])]));
    return {
      n: rs.length,
      exercicios: new Set(rs.map((r) => r.ex)).size,
      cru: { metricas: agreg(L("cru")), extras: extras(L("cru")) },
      minima: { metricas: agreg(L("minima")), extras: extras(L("minima")) },
      materializado: { metricas: agreg(L("mat")), extras: extras(L("mat")) },
      difMatMenosMinima: Object.fromEntries(METRICAS.map((c) => [c, intervalo(dif, c)])),
    };
  };
  return {
    rotulo,
    n,
    gate: {
      estrito: { aprovados: registros.filter((r) => r.gateEstrito).length, taxa: n ? registros.filter((r) => r.gateEstrito).length / n : 0 },
      sensibilidade: { aprovados: registros.filter((r) => r.gateSens).length, taxa: n ? registros.filter((r) => r.gateSens).length / n : 0 },
      sensibilidade2: { aprovados: registros.filter((r) => r.gateSens2).length, taxa: n ? registros.filter((r) => r.gateSens2).length / n : 0 },
      sensibilidade3: { aprovados: registros.filter((r) => r.gateSens3).length, taxa: n ? registros.filter((r) => r.gateSens3).length / n : 0 },
      sensibilidade4: { aprovados: registros.filter((r) => r.gateSens4).length, taxa: n ? registros.filter((r) => r.gateSens4).length / n : 0 },
    },
    todos: bloco(() => true),
    aprovadosEstrito: bloco((r) => r.gateEstrito),
    aprovadosSensibilidade: bloco((r) => r.gateSens),
    aprovadosSensibilidade2: bloco((r) => r.gateSens2),
    aprovadosSensibilidade3: bloco((r) => r.gateSens3),
    aprovadosSensibilidade4: bloco((r) => r.gateSens4),
    porRegistro: registros.map((r) => ({ ex: r.ex, replica: r.replica, gateEstrito: r.gateEstrito, gateSens: r.gateSens, gateSens2: r.gateSens2, gateSens3: r.gateSens3, gateSens4: r.gateSens4, valores: r.valores, mat: r.mat, minima: r.minima })),
  };
}

const ehMain = process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (ehMain) {
  const argv = process.argv.slice(2);
  const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
  const dir = opt("--mat", null);
  if (!dir) { console.error("uso: --mat <dir> [--rotulo x] [--json out]"); process.exit(2); }
  const R = analisarMaterializado(dir, { rotulo: opt("--rotulo", path.basename(dir)) });
  const linha = (nome, b) => {
    if (!b) return console.log(`  ${nome}: (vazio)`);
    console.log(`  ${nome} — n=${b.n} grafos (${b.exercicios} exercícios)`);
    for (const c of METRICAS) {
      const m = b.materializado.metricas[c];
      const mi = b.minima.metricas[c];
      const d = b.difMatMenosMinima[c];
      const n3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : "N/A");
      console.log(
        `    ${c.padEnd(20)} mat ${(m.estimativa === null ? "N/A (não avaliável)" : fmt(m)).padEnd(40)} | mínima ${n3(mi.estimativa)} | Δ ${n3(d.estimativa)} [${n3(d.bca?.[0])}; ${n3(d.bca?.[1])}] | DP ${n3(m.dpEntreReplicas ?? 0)}`
      );
    }
    console.log(`    estados/grafo ${b.materializado.extras.estadosPorGrafo.toFixed(2)} | extras: estados ${b.materializado.extras.estados.toFixed(2)} erros ${b.materializado.extras.erros.toFixed(2)} dicas ${b.materializado.extras.dicas.toFixed(2)}`);
  };
  console.log("═".repeat(100));
  console.log(`MATERIALIZADO — ${R.rotulo} — ${R.n} registros`);
  console.log(`  gate estrito: ${R.gate.estrito.aprovados}/${R.n} = ${(R.gate.estrito.taxa * 100).toFixed(1)}% | sensibilidade (0/1): ${R.gate.sensibilidade.aprovados}/${R.n} = ${(R.gate.sensibilidade.taxa * 100).toFixed(1)}% | sensibilidade 2 (+equivalência canônica): ${R.gate.sensibilidade2.aprovados}/${R.n} = ${(R.gate.sensibilidade2.taxa * 100).toFixed(1)}% | sensibilidade 3 (+números mistos): ${R.gate.sensibilidade3.aprovados}/${R.n} = ${(R.gate.sensibilidade3.taxa * 100).toFixed(1)}% | sensibilidade 4 (+sufixo %): ${R.gate.sensibilidade4.aprovados}/${R.n} = ${(R.gate.sensibilidade4.taxa * 100).toFixed(1)}%`);
  console.log("═".repeat(100));
  linha("APROVADOS gate estrito (primário)", R.aprovadosEstrito);
  linha("APROVADOS gate sensibilidade", R.aprovadosSensibilidade);
  linha("APROVADOS gate sensibilidade 2 (post hoc)", R.aprovadosSensibilidade2);
  linha("APROVADOS gate sensibilidade 3 (+números mistos)", R.aprovadosSensibilidade3);
  linha("APROVADOS gate sensibilidade 4 (+sufixo %)", R.aprovadosSensibilidade4);
  linha("TODOS (descritivo, inclui reprovados)", R.todos);
  const out = opt("--json", null);
  if (out) { fs.writeFileSync(out, JSON.stringify({ gerado: new Date().toISOString(), ...R }, null, 1)); console.log(`  salvo em ${out}`); }
}
