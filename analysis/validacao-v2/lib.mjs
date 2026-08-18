/**
 * lib.mjs — utilitários compartilhados da validação de qualidade de grafos (v2).
 *
 * Tudo aqui é offline, determinístico e sem chamada de rede.
 * Escrito em 2026-08-12 a partir da auditoria da metodologia de comparação.
 */
import fs from "node:fs";
import path from "node:path";
import { parseBrdToExpertNeutral, parseBrdToRobotInput } from "../../parse-ctat-brd.js";
import { parseBrdToNeutralV2 } from "../../schema-v2.js";
import { canonAnswer } from "../../schema.js";
import { casesDirDataset } from "../../dataset-config.js";

// multi-corpus (2026-08-16): cases/<…> do dataset selecionado por STI_DATASET
// (default 6.17). Resolvido em TEMPO DE CHAMADA (corpusAtual()) para que um
// mesmo processo possa ler mais de um corpus (testes, consolidação); a
// constante CORPUS fica para compatibilidade com o chamador antigo.
export const corpusAtual = () => casesDirDataset();
export const CORPUS = casesDirDataset();

/** Lista os exercícios do corpus congelado. */
export function listarExercicios(raiz = ".") {
  const dir = path.join(raiz, corpusAtual());
  return fs.readdirSync(dir).filter((d) => fs.existsSync(path.join(dir, d, "expert.brd")));
}

/**
 * Referência por exercício, em dois níveis de detalhe.
 *  - values: conjunto de valores canônicos, não mecânicos (o que a métrica antiga usa)
 *  - items : cada erro com posição no caminho, componente, ação e devolutiva
 */
export function carregarReferencia(raiz = ".") {
  const dir = path.join(raiz, corpusAtual());
  const out = {};
  for (const ex of listarExercicios(raiz)) {
    const xml = fs.readFileSync(path.join(dir, ex, "expert.brd"), "utf8");
    const g = parseBrdToNeutralV2(xml, { id: ex });

    // indexa os estados ao longo do caminho correto: estado -> posição
    const idx = {};
    let cur = g.startState;
    let n = 0;
    let guard = 0;
    // caminho de referência com SAI (2026-08-16, multi-corpus): cada aresta
    // correta do caminho, com seleção/ação/entrada, dicas, e as flags
    // `sistema` (ação executada pelo TUTOR, não pelo aluno — setDisplay,
    // SetVisible, set_maximum, No_Action…) e `mecanico` (entrada sentinela).
    // Estado de VALOR = !sistema && !mecanico. É esse caminho que a régua de
    // estados usa quando disponível (comparar-caminho.mjs).
    const caminho = [];
    while (cur && guard++ < 200) {
      idx[cur] = n++;
      const saindo = (g.transitions || []).filter((t) => t.type === "correct" && t.from === cur);
      const prox = saindo[0];
      if (!prox) break;
      // SELETOR DE VARIANTE (2026-08-17): duas ou mais arestas corretas saindo
      // do MESMO estado pelo MESMO componente, com entradas diferentes, são
      // bifurcação de variante do problema (autoria), não um passo do aluno.
      // No 6.18 é o `shield` (componente que sequer existe no HTML da tela;
      // "1frac"/"tf" escolhem o modo do problema) em 20/20 problemas; no 6.17 e
      // no 6.19 a regra não marca nada. Não conta como estado de valor.
      const variante =
        saindo.filter((t) => String(t.sai?.selection || "") === String(prox.sai?.selection || "")).length > 1 &&
        new Set(saindo.map((t) => String(t.sai?.input ?? ""))).size > 1;
      const bruto = String(prox.sai?.input ?? "").trim();
      const acao = String(prox.sai?.action || "");
      caminho.push({
        ordem: caminho.length + 1,
        selecao: String(prox.sai?.selection || ""),
        acao,
        bruto,
        valor: canonAnswer(bruto),
        // 2026-08-16 (2ª revisão): o .brd marca o ATOR de cada aresta
        // (<Actor>: Student / Tutor / Tutor (unevaluated)). Ação do tutor =
        // sistema, seja qual for o nome da ação (ex.: 6.17 showAnswer é
        // ButtonPressed executado pelo TUTOR). Sem Actor → aluno.
        ator: String(prox.actor || ""),
        variante,
        sistema: ehAcaoDeSistema(acao) || /^tutor/i.test(String(prox.actor || "")) || variante,
        mecanico: ehMecanico(bruto),
        dicas: (prox.hints || []).length,
      });
      cur = prox.to;
    }

    const items = [];
    for (const t of g.transitions || []) {
      if (t.type !== "buggy") continue;
      const bruto = String(t.sai?.input ?? "").trim();
      if (ehMecanico(bruto)) continue;
      items.push({
        valor: canonAnswer(bruto),
        bruto,
        passo: idx[t.from],
        passoRel: n > 0 ? idx[t.from] / n : 0,
        componente: String(t.sai?.selection || "").toLowerCase(),
        acao: String(t.sai?.action || "").toLowerCase(),
        devolutiva: String(t.feedback?.buggyMessage || ""),
      });
    }

    let resposta = null;
    try {
      resposta = String(parseBrdToRobotInput(xml).correctAnswer ?? "").trim();
    } catch {
      resposta = null;
    }

    out[ex] = { items, values: new Set(items.map((i) => i.valor)), nPassos: n, resposta, caminho };
  }
  return out;
}

/**
 * Ações de SISTEMA do CTAT (2026-08-16): executadas pelo tutor no caminho do
 * especialista, não pelo aluno — setDisplay/SetVisible/setVisible, set_*
 * (set_maximum, set_denominator, set_label_points…), No_Action. Complementa a
 * marca <Actor> do .brd (Tutor / Tutor (unevaluated)), que é a regra primária.
 * Ações de ALUNO: UpdateTextField, Update, addPoint/AddPoint, UpdateComboBox,
 * ButtonPressed, UpdateTextArea (quando o ator é o aluno)…
 */
export function ehAcaoDeSistema(acao) {
  const a = String(acao ?? "").trim();
  // UpdateTextArea NÃO entra: em alguns tutores (8.12) é entrada de texto do aluno.
  return /^set(_|[A-Z]|visible$|display$|dsiplay$)/i.test(a) || /^no_action$/i.test(a);
}

/**
 * Sentinelas de interface do CTAT: não são respostas de aluno.
 * Regra congelada no commit 94ce1f7 (2026-07-02), anterior à campanha final.
 */
export function ehMecanico(bruto) {
  const v = String(bruto ?? "").trim();
  return v === "" || v === "-" || v === "-1";
}

/** Um wrongAnswer é utilizável se for número ou fração; prosa não casa com ação de aluno. */
export function ehValorUtilizavel(bruto) {
  return /^-?\d+(\s*\/\s*\d+)?$/.test(String(bruto ?? "").trim());
}

export const media = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

/** PRNG determinístico (mulberry32) — mesma família usada no resto do pacote. */
export function prng(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function erfinv(x) {
  const a = 0.147;
  const ln = Math.log(1 - x * x);
  const t = 2 / (Math.PI * a) + ln / 2;
  return Math.sign(x) * Math.sqrt(Math.sqrt(t * t - ln / a) - t);
}
const qnorm = (p) => Math.SQRT2 * erfinv(2 * p - 1);
const pnorm = (z) => {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
};

/**
 * Bootstrap agrupado por exercício, com intervalo percentílico E BCa.
 *
 * O agrupamento é obrigatório: as réplicas do mesmo exercício compartilham
 * enunciado, interface e grafo de referência, e não são independentes.
 * O BCa existe porque a distribuição encosta no teto (muitos exercícios em 1,000),
 * situação em que o percentil simples é o pior estimador disponível.
 */
export function intervalo(linhas, campo, { seed = 42, B = 10000 } = {}) {
  // 2026-08-18: métrica N/A (null) para um registro — ex.: "erros no estado
  // certo" quando TODOS os erros do especialista são indistinguíveis por valor
  // (6.18) — sai da amostra; se nenhum registro tem valor, devolve null.
  linhas = linhas.filter((l) => l[campo] !== null && l[campo] !== undefined);
  if (!linhas.length) return { estimativa: null, percentil: [null, null], bca: [null, null] };
  const chaves = [...new Set(linhas.map((l) => l.ex))];
  const porEx = {};
  for (const l of linhas) (porEx[l.ex] = porEx[l.ex] || []).push(l[campo]);

  const obs = media(linhas.map((l) => l[campo]));
  const rnd = prng(seed);
  const boot = [];
  for (let b = 0; b < B; b++) {
    const acc = [];
    for (let i = 0; i < chaves.length; i++) {
      const e = chaves[Math.floor(rnd() * chaves.length)];
      for (const v of porEx[e]) acc.push(v);
    }
    boot.push(media(acc));
  }
  boot.sort((a, b) => a - b);
  const q = (p) => {
    const i = (boot.length - 1) * p;
    const lo = Math.floor(i);
    const hi = Math.ceil(i);
    return boot[lo] + (boot[hi] - boot[lo]) * (i - lo);
  };

  const abaixo = boot.filter((v) => v < obs).length / B;
  const z0 = qnorm(Math.min(Math.max(abaixo, 1e-6), 1 - 1e-6));
  const jack = chaves.map((fora) => {
    const acc = [];
    for (const e of chaves) {
      if (e === fora) continue;
      for (const v of porEx[e]) acc.push(v);
    }
    return media(acc);
  });
  const jm = media(jack);
  const num = jack.reduce((s, v) => s + Math.pow(jm - v, 3), 0);
  const den = 6 * Math.pow(jack.reduce((s, v) => s + Math.pow(jm - v, 2), 0), 1.5);
  const a = den === 0 ? 0 : num / den;
  const ajusta = (p) => {
    const z = qnorm(p);
    return pnorm(z0 + (z0 + z) / (1 - a * (z0 + z)));
  };

  return {
    estimativa: obs,
    percentil: [q(0.025), q(0.975)],
    bca: [q(Math.min(Math.max(ajusta(0.025), 0), 1)), q(Math.min(Math.max(ajusta(0.975), 0), 1))],
  };
}

/** Precisão, cobertura e F-beta a partir de dois conjuntos. */
export function comparar(R, C, beta = 1) {
  const inter = [...C].filter((v) => R.has(v)).length;
  const p = C.size ? inter / C.size : 0;
  const r = R.size ? inter / R.size : 0;
  const b2 = beta * beta;
  return {
    inter,
    precisao: p,
    cobertura: r,
    f1: p + r ? (2 * p * r) / (p + r) : 0,
    fbeta: b2 * p + r ? ((1 + b2) * p * r) / (b2 * p + r) : 0,
    jaccard: new Set([...R, ...C]).size ? inter / new Set([...R, ...C]).size : 0,
  };
}

export const fmt = (ic) =>
  `${ic.estimativa.toFixed(4)}  BCa [${ic.bca[0].toFixed(4)}; ${ic.bca[1].toFixed(4)}]`;

export { canonAnswer, parseBrdToExpertNeutral };
