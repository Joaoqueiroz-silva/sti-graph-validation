#!/usr/bin/env node
/**
 * analysis/bancada-v2/consolidar-corpora.mjs — UM experimento, vários corpora
 * (2026-08-16). Junta, com as MESMAS métricas e a mesma régua, o corpus
 * original (Mathtutor 6.17, rodada 4 = problema + interface fixos) e os corpora
 * do bloco 1 (6.19, 6.18, …), produzindo:
 *   - tabela por corpus × braço (materializado, gate estrito): cobertura de
 *     estados em ordem (LCS), sem ordem, caminho íntegro, erros no estado
 *     certo, estados/grafo, gate;
 *   - estimativa AGREGADA por braço: pool de todos os grafos com bootstrap BCa
 *     em cluster de EXERCÍCIO (o corpus entra como estrato: reamostram-se
 *     exercícios dentro de cada corpus, preservando o peso de cada um) e
 *     também a média simples entre corpora (cada corpus com peso 1);
 *   - heterogeneidade: amplitude entre corpora e I² descritivo.
 * Entrada: lista de { corpus, rotulo, analise: <materializado-*.analise.json> }
 * (ver CORPORA abaixo — acrescente uma linha por corpus concluído).
 * Saída: JSON + markdown em resultados/EXPERIMENTO-CONSOLIDADO-2026-08/.
 */
import fs from "node:fs";
import path from "node:path";
import { prng } from "../validacao-v2/lib.mjs";

const METRICAS = ["coberturaEstados", "coberturaSemOrdem", "caminhoIntegro", "errosNoEstadoCerto"];
const BRACOS = { "custo-beneficio": "flash-lite (alunos)", "estudantes-qwen": "qwen (alunos)" };

/** Corpora do experimento consolidado — acrescentar conforme concluídos. */
export const CORPORA = [
  { corpus: "6.17 Fraction Identification (frac-numberline-6.17)", pasta: "resultados/rodada4-interface-fixa-2026-08-15", prefixo: "materializado-v2-fixa-" },
  { corpus: "6.19 Fractions and Estimates (frac-estimates-6.19)", pasta: "resultados/bloco1-mathtutor-2026-08-16/6.19", prefixo: "materializado-v2-fixa-" },
  { corpus: "6.18 Equivalent Fractions (equiv-fractions-6.18)", pasta: "resultados/bloco1-mathtutor-2026-08-16/6.18", prefixo: "materializado-v2-fixa-" },
  { corpus: "6.20 Fraction Ordering (fraction-ordering-6.20)", pasta: "resultados/bloco1-mathtutor-2026-08-16/6.20", prefixo: "materializado-v2-fixa-" },
  { corpus: "8.12 Factors, Scaling, and Percents (8.12)", pasta: "resultados/bloco1-mathtutor-2026-08-16/8.12", prefixo: "materializado-v2-fixa-" },
  { corpus: "7.12 Conversion Factors (7.12)", pasta: "resultados/bloco1-mathtutor-2026-08-16/7.12", prefixo: "materializado-v2-fixa-" },
];

const media = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

/** BCa estratificado por corpus, cluster = exercício. linhas: [{corpus, ex, v}] */
function intervaloEstratificado(linhas, { seed = 42, B = 10000 } = {}) {
  const porCorpus = {};
  for (const l of linhas) ((porCorpus[l.corpus] ||= {})[l.ex] ||= []).push(l.v);
  const obs = media(linhas.map((l) => l.v));
  const rnd = prng(seed);
  const boot = [];
  const estratos = Object.entries(porCorpus).map(([c, m]) => Object.keys(m));
  for (let b = 0; b < B; b++) {
    const acc = [];
    Object.entries(porCorpus).forEach(([c, m], si) => {
      const chaves = estratos[si];
      for (let i = 0; i < chaves.length; i++) {
        const e = chaves[Math.floor(rnd() * chaves.length)];
        for (const v of m[e]) acc.push(v);
      }
    });
    boot.push(media(acc));
  }
  boot.sort((a, b) => a - b);
  const q = (p) => boot[Math.min(boot.length - 1, Math.max(0, Math.floor((boot.length - 1) * p)))];
  return { estimativa: obs, percentil: [q(0.025), q(0.975)], n: linhas.length };
}

export function consolidar(raiz = ".") {
  const porBraco = {};
  const tabela = [];
  for (const c of CORPORA) {
    for (const braco of Object.keys(BRACOS)) {
      // v2 = agentes espelhados da PRODUÇÃO atual (132c645); cai para a v1
      // (b7ae8780) só se o corpus ainda não foi rematerializado.
      let f = path.join(raiz, c.pasta, `${c.prefixo}${braco}.analise.json`);
      if (!fs.existsSync(f)) f = path.join(raiz, c.pasta, `materializado-fixa-${braco}.analise.json`);
      if (!fs.existsSync(f)) continue;
      const versaoAgentes = f.includes("materializado-v2-") ? "producao-132c645" : "b7ae8780";
      const A = JSON.parse(fs.readFileSync(f, "utf8"));
      // RECORTE do consolidado: aprovados na sensibilidade 3 (todas as
      // sensibilidades declaradas: 0/1, equivalência canônica, números mistos).
      // O gate estrito é conservador contra grafias legítimas que variam por
      // interface (0 do número misto, decimais, "2 3/4"); as taxas dos dois
      // gates e a coluna "todos" ficam na tabela para robustez.
      const b = A.aprovadosSensibilidade3 || A.aprovadosEstrito;
      const recorte = A.aprovadosSensibilidade3 ? "sens3" : "estrito";
      if (!b) continue;
      const linha = {
        corpus: c.corpus,
        braco,
        versaoAgentes,
        recorte,
        n: b.n,
        nTodos: A.todos?.n ?? null,
        exercicios: b.exercicios,
        gateEstrito: A.gate.estrito.taxa,
        gateSens3: A.gate.sensibilidade3?.taxa ?? null,
        estadosPorGrafo: b.materializado.extras.estadosPorGrafo,
        todos: Object.fromEntries(METRICAS.map((m) => [m, A.todos?.materializado.metricas[m]?.estimativa ?? null])),
      };
      for (const m of METRICAS) linha[m] = b.materializado.metricas[m];
      tabela.push(linha);
      for (const r of A.porRegistro.filter((r) => (recorte === "sens3" ? r.gateSens3 : r.gateEstrito))) {
        for (const m of METRICAS) {
        if (r.mat[m] === null || r.mat[m] === undefined) continue; // N/A não entra no pool
        ((porBraco[braco] ||= {})[m] ||= []).push({ corpus: c.corpus, ex: r.ex, v: r.mat[m] });
      }
      }
    }
  }
  const agregado = {};
  for (const [braco, ms] of Object.entries(porBraco)) {
    agregado[braco] = {};
    for (const [m, linhas] of Object.entries(ms)) {
      // corpora em que a métrica é N/A (ex.: erros no 6.18, todos indistinguíveis
      // por valor) ficam fora da média/amplitude entre corpora.
      const porCorpus = tabela.filter((t) => t.braco === braco).map((t) => t[m].estimativa).filter((x) => Number.isFinite(x));
      agregado[braco][m] = {
        pool: intervaloEstratificado(linhas),
        mediaEntreCorpora: media(porCorpus),
        amplitudeEntreCorpora: porCorpus.length ? [Math.min(...porCorpus), Math.max(...porCorpus)] : null,
        nCorpora: porCorpus.length,
      };
    }
  }
  return { gerado: new Date().toISOString(), corporaIncluidos: [...new Set(tabela.map((t) => t.corpus))], tabela, agregado };
}

const ehMain = process.argv[1] && new URL(import.meta.url).pathname.endsWith(process.argv[1].split("/").pop());
if (ehMain) {
  const R = consolidar(".");
  const out = "resultados/EXPERIMENTO-CONSOLIDADO-2026-08";
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "consolidado.json"), JSON.stringify(R, null, 1));
  const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : "—");
  const ic = (m) =>
    m.estimativa === null || m.estimativa === undefined
      ? "N/A (não avaliável)"
      : `${f3(m.estimativa)} [${f3(m.bca?.[0] ?? m.percentil?.[0])}; ${f3(m.bca?.[1] ?? m.percentil?.[1])}]`;
  let md = `# Experimento consolidado — validação de grafos de comportamento contra especialistas do CTAT/Mathtutor\n\n`;
  md += `Gerado em ${R.gerado.slice(0, 16)} por \`analysis/bancada-v2/consolidar-corpora.mjs\`. Um único desenho\n(problema + interface do especialista → agents 3 → GraphForge passos-livres → agent 6/7 espelhados da PRODUÇÃO\natual, commit 132c645; régua de estados por Actor/LCS) aplicado a **${R.corporaIncluidos.length} corpus/corpora**: ${R.corporaIncluidos.join("; ")}.\n\n`;
  md += `## Por corpus × braço (grafo materializado; recorte = aprovados na sensibilidade 3 do gate; BCa 95 % em cluster de exercício; entre parênteses, o valor em TODOS os grafos)\n\n| corpus | braço | n grafos (ex.) / todos | gate estrito · sens. 3 | cobertura em ordem (LCS) | sem ordem | caminho íntegro | erros no estado certo | estados/grafo |\n|---|---|---|---|---|---|---|---|---|\n`;
  const t3 = (t, m) => (Number.isFinite(t.todos?.[m]) ? ` (${f3(t.todos[m])})` : "");
  for (const t of R.tabela) md += `| ${t.corpus} | ${BRACOS[t.braco]} | ${t.n} (${t.exercicios}) / ${t.nTodos ?? "—"} | ${(t.gateEstrito * 100).toFixed(0)} % · ${t.gateSens3 != null ? (t.gateSens3 * 100).toFixed(0) + " %" : "—"} | ${ic(t.coberturaEstados)}${t3(t, "coberturaEstados")} | ${ic(t.coberturaSemOrdem)}${t3(t, "coberturaSemOrdem")} | ${ic(t.caminhoIntegro)}${t3(t, "caminhoIntegro")} | ${ic(t.errosNoEstadoCerto)}${t3(t, "errosNoEstadoCerto")} | ${t.estadosPorGrafo.toFixed(2)} |\n`;
  md += `\n## Agregado por braço (pool de todos os grafos aprovados; bootstrap estratificado por corpus, cluster = exercício, 10k, seed 42; percentil)\n\n| braço | métrica | pool [IC 95 %] | n grafos | média entre corpora | amplitude entre corpora | corpora |\n|---|---|---|---|---|---|---|\n`;
  for (const [braco, ms] of Object.entries(R.agregado)) for (const [m, v] of Object.entries(ms)) md += `| ${BRACOS[braco]} | ${m} | ${f3(v.pool.estimativa)} [${f3(v.pool.percentil[0])}; ${f3(v.pool.percentil[1])}] | ${v.pool.n} | ${f3(v.mediaEntreCorpora)} | ${v.amplitudeEntreCorpora ? v.amplitudeEntreCorpora.map(f3).join(" – ") : "—"} | ${v.nCorpora} |\n`;
  md += `\nFontes primárias: \`materializado-*.analise.json\` de cada pasta listada em \`CORPORA\` (consolidar-corpora.mjs). Corpora ainda não concluídos não aparecem; a tabela é regenerada a cada corpus fechado.\n`;
  fs.writeFileSync(path.join(out, "RESULTADOS.md"), md);
  console.log(md);
}
