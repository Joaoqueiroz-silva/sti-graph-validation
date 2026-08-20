#!/usr/bin/env node
/**
 * analysis/bancada-v2/linha-de-base.mjs — CONTROLE DETERMINÍSTICO e PRECISÃO
 * para a régua de estados (2026-08-18, após auditoria adversarial).
 *
 * PROBLEMA QUE ISTO RESOLVE. `coberturaEstados` é RECALL puro: mede quantos
 * estados da referência aparecem no grafo do agente, e nada a penaliza por
 * gerar estados a mais. Um grafo "papagaio" — que só repete os números do
 * ENUNCIADO, sem nenhum conhecimento da decomposição — atinge cobertura alta
 * (0,52 no 6.17). Sem linha de base, "0,78 de cobertura" é ininterpretável.
 *
 * O QUE MEDIMOS AQUI, por registro:
 *  - baseCobertura: cobertura de um grafo NULO com o mesmo número de
 *    ocorrências comparáveis do agente, cujos valores são os números do
 *    enunciado + a resposta correta, em ordem cíclica. É o que se obtém
 *    sabendo APENAS o que o envelope A entrega, sem decompor.
 *  - coberturaAjustada = (obs − base) / (1 − base): a fração do que sobra
 *    acima do controle (forma de kappa; 0 = mesmo nível do papagaio, 1 = teto).
 *  - precisaoEstados: TP / estados comparáveis do agente, onde TP é o MESMO
 *    casamento LCS 1:1 usado no numerador da cobertura. Repetições e ordem
 *    contam; valores neutralizados pela régua simétrica ficam fora do
 *    denominador por não serem comparáveis.
 *  - f1Estados: média harmônica de cobertura (recall) e precisão.
 *
 * A base é DETERMINÍSTICA (sem sorteio): mesma capacidade comparável do agente,
 * mesmo vocabulário disponível no envelope A. Não é um adversário otimizado —
 * é um controle operacional de "quanto se acerta sem saber decompor".
 */
import fs from "node:fs";
import path from "node:path";
import { pontuarCaminho, caminhoDeReferencia, casarEstados, canonizarValor } from "./comparar-caminho.mjs";
import { grafoSimetrico } from "./regua-simetrica.mjs";
import { problemsDirRelativo } from "../../dataset-config.js";
import { carregarReferencia, intervalo, media, fmt } from "../validacao-v2/lib.mjs";

/** Vocabulário que o agente recebe no envelope A: números do enunciado + resposta. */
export function vocabularioDoEnvelopeA(envelopeA) {
  const nums = [...String(envelopeA.problem ?? "").matchAll(/-?\d+(?:[.,]\d+)?(?:\s*\/\s*-?\d+)?/g)].map((m) =>
    m[0].replace(/\s+/g, "")
  );
  const resp = String(envelopeA.correctAnswer ?? "").trim();
  const vocab = [...new Set([...nums, resp].filter(Boolean))];
  return vocab.length ? vocab : ["1"];
}

/** Grafo NULO: k estados com o vocabulário do envelope A em ordem cíclica. */
export function grafoPapagaio(envelopeA, k) {
  const vocab = vocabularioDoEnvelopeA(envelopeA);
  return {
    // k=0 é um controle vazio legítimo: forçar um passo inventaria capacidade
    // para um agente que não produziu nenhuma ocorrência comparável.
    passos: Array.from({ length: Math.max(0, k) }, (_, i) => ({ indice: i + 1, acao: "", kc: "", valor: vocab[i % vocab.length] })),
    erros: [],
    dicas: [],
  };
}

/**
 * Precisão de estados coerente com o recall: TP é o comprimento da LCS e o
 * denominador é o número de ocorrências comparáveis produzidas pelo agente.
 */
export function precisaoEstados(passosAgente, refEx) {
  const comparaveis = (passosAgente || []).filter((p) => canonizarValor(p.valor)).length;
  const refCaminho = caminhoDeReferencia(null, refEx);
  const avaliaveis = refCaminho.filter((r) => r.comResposta && r.estado).length;
  if (!avaliaveis) return null;
  // Convenção conservadora de zero-division: se há alvo de referência, mas
  // o agente não produziu nenhum estado comparável, a precisão/F1 do registro
  // é zero. Excluí-lo como N/A removeria do pool exatamente uma falha total.
  if (!comparaveis) return 0;
  const tp = casarEstados(refCaminho, passosAgente).filter((c) => c.avaliavel && c.agenteIdx !== null).length;
  return tp / comparaveis;
}

/** Métricas de base/precisão para UM registro materializado. */
export function pontuarComBase(run, envelopeA, envelopeB, refEx) {
  const grafo = run.materializado?.grafo || run.grafo;
  const obs = pontuarCaminho({ ...run, grafo }, envelopeB, refEx);
  const base = pontuarCaminho(
    // Pareamento de capacidade: o controle recebe exatamente o mesmo número
    // de ocorrências que entram no denominador da precisão. Passos de sistema,
    // conclusão neutralizada ou valor vazio não podem aumentar o papagaio.
    { exercicio: run.exercicio ?? run.id, grafo: grafoPapagaio(envelopeA, obs.nEstadosComparaveisAgente) },
    envelopeB,
    refEx
  );
  const ajustada = base.coberturaEstados >= 1 ? null : (obs.coberturaEstados - base.coberturaEstados) / (1 - base.coberturaEstados);
  // Usa diretamente as contagens da mesma chamada que produziu o recall. Isso
  // impede que precisão e cobertura voltem a divergir em TP por mudança futura
  // de canonização ou casamento.
  const prec = obs.nEstadosRef <= 0
    ? null
    : obs.nEstadosComparaveisAgente > 0
      ? obs.nEstadosCasados / obs.nEstadosComparaveisAgente
      : 0;
  const rec = obs.coberturaEstados;
  return {
    ex: obs.ex,
    replica: obs.replica,
    coberturaEstados: rec,
    baseCobertura: base.coberturaEstados,
    coberturaAjustada: ajustada,
    baseCaminhoIntegro: base.caminhoIntegro,
    caminhoIntegro: obs.caminhoIntegro,
    precisaoEstados: prec,
    // Se precisão e recall são ambos zero, F1 é zero (não N/A). Excluir
    // esses registros do pool infla a média justamente nos piores grafos.
    f1Estados: prec == null ? null : rec + prec > 0 ? (2 * rec * prec) / (rec + prec) : 0,
    nEstadosRef: obs.nEstadosRef,
    nEstadosAgente: obs.nEstadosAgente,
    nEstadosComparaveisAgente: obs.nEstadosComparaveisAgente,
    nEstadosCasados: obs.nEstadosCasados,
  };
}

/** Recalcula, sem efeitos externos, o artefato versionado de um corpus × braço. */
export function analisarLinhaDeBase({ raiz = ".", dir, usarReguaSimetrica = true }) {
  if (!dir) throw new Error("dir materializado é obrigatório");
  const REF = carregarReferencia(raiz);
  const problems = path.join(raiz, problemsDirRelativo());
  const runs = path.join(path.isAbsolute(dir) ? dir : path.join(raiz, dir), "runs");
  const linhas = [];
  for (const f of fs.readdirSync(runs).filter((x) => x.endsWith(".json")).sort()) {
    const r = JSON.parse(fs.readFileSync(path.join(runs, f), "utf8"));
    const ex = r.exercicio ?? r.id;
    if (!REF[ex] || !(r.materializado?.grafo || r.grafo)) continue;
    const A = JSON.parse(fs.readFileSync(path.join(problems, ex, "envelope-a.json"), "utf8"));
    const B = JSON.parse(fs.readFileSync(path.join(problems, ex, "envelope-b.json"), "utf8"));
    const g = r.materializado?.grafo || r.grafo;
    const entrada = usarReguaSimetrica
      ? r.materializado?.grafo
        ? { ...r, materializado: { ...r.materializado, grafo: grafoSimetrico(g).grafo } }
        : { ...r, grafo: grafoSimetrico(g).grafo }
      : r;
    linhas.push(pontuarComBase(entrada, A, B, REF[ex]));
  }
  const L = (c) => intervalo(linhas, c);
  return {
    metodologia: {
      regua: usarReguaSimetrica ? "simétrica (tokens de conclusão neutralizados; vigente)" : "congelada (histórica; solicitada por --regua-congelada)",
      controle: "papagaio determinístico: números do enunciado + resposta correta, repetidos ciclicamente até o número de ocorrências comparáveis do agente (zero permitido)",
      verdadeiroPositivo: "comprimento da LCS 1:1; o mesmo numerador é usado na cobertura e na precisão",
      precisao: "TP / ocorrências comparáveis do agente, com multiplicidade preservada; zero em falha total diante de referência não vazia",
      f1: "média harmônica por registro; zero se precisão e cobertura forem zero",
    },
    dir,
    linhas,
    agregado: Object.fromEntries(["coberturaEstados","baseCobertura","coberturaAjustada","precisaoEstados","f1Estados","caminhoIntegro","baseCaminhoIntegro"].map((c) => [c, L(c)])),
  };
}

const ehMain = process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (ehMain) {
  const argv = process.argv.slice(2);
  const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
  const dir = opt("--mat", null);
  if (!dir) { console.error("uso: --mat <dir materializado> [--json out] [--regua-congelada]"); process.exit(2); }
  // A leitura científica vigente é simétrica. A régua congelada permanece
  // acessível só para auditoria histórica e comparação no consolidador duplo.
  const usarReguaSimetrica = !argv.includes("--regua-congelada");
  const R = analisarLinhaDeBase({ dir, usarReguaSimetrica });
  const { linhas, agregado } = R;
  const L = (c) => agregado[c];
  const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : "N/A");
  console.log(`CONTROLE DETERMINÍSTICO — ${path.basename(dir)} — ${linhas.length} grafos — régua ${usarReguaSimetrica ? "simétrica" : "congelada"}`);
  console.log(`  cobertura observada .......... ${fmt(L("coberturaEstados"))}`);
  console.log(`  cobertura do CONTROLE (papagaio) ${fmt(L("baseCobertura"))}`);
  console.log(`  cobertura AJUSTADA ........... ${fmt(L("coberturaAjustada"))}`);
  console.log(`  precisão de estados .......... ${fmt(L("precisaoEstados"))}`);
  console.log(`  F1 de estados ................ ${fmt(L("f1Estados"))}`);
  console.log(`  caminho íntegro obs / base ... ${f3(L("caminhoIntegro").estimativa)} / ${f3(L("baseCaminhoIntegro").estimativa)}`);
  console.log(`  estados/grafo ................ ${media(linhas.map((l) => l.nEstadosAgente)).toFixed(2)}`);
  const out = opt("--json", null);
  if (out) fs.writeFileSync(out, JSON.stringify({ gerado: new Date().toISOString(), ...R }, null, 1));
}
