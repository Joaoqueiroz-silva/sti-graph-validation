/**
 * evaluation/functional-equivalence.js — Equivalência FUNCIONAL entre dois grafos (Tarefa 7).
 *
 * Métrica SECUNDÁRIA do experimento (ver pré-registro §5). Em vez de comparar a TOPOLOGIA
 * (node-F1, sensível à granularidade), compara o COMPORTAMENTO: dada a MESMA resposta de
 * aluno, os dois tutores reagem igual?
 *
 * Para cada resposta da bateria, cada grafo dá um veredito (player de example-tracing,
 * base em trace-answer.js):
 *   - "erro-previsto" → bate com uma misconception do grafo (devolveria a dica)
 *   - "correto"       → bate com a resposta correta do problema
 *   - "surpresa"      → o grafo não previu (fall-off)
 * Concordância = % de respostas com mesmo veredito nos dois grafos; κ de Cohen corrige o acaso.
 *
 * Robusta à granularidade: não importa em quantos micro-passos cada grafo decompõe — importa
 * se, diante de uma resposta, ambos a tratam da mesma forma. `excludeMechanical` tira os erros
 * mecânicos de interface do especialista (-1, -) da bateria, alinhado ao F1 conceitual.
 */

import { canonAnswer } from "./schema.js";

const CATS = ["correto", "erro-previsto", "surpresa"];

// Igualdade semântica de resposta = mesma âncora canônica (reduz frações/decimais:
// 0.25≡1/4, 2/8≡1/4). NÃO usamos o answerMatches do trace-answer.js aqui porque ele
// mal-parseia fração (toNum("1/4")→1), o que faria "1/4" casar com "1/3". canonAnswer
// é a mesma âncora do F1 → veredito coerente com a comparação estrutural.
const sameAnswer = (a, b) => canonAnswer(a) === canonAnswer(b);

/** Veredito de um grafo neutro para uma resposta (misconception tem prioridade, como no tutor). */
export function verdictFor(neutral, answer, correctAnswers = [], opts = {}) {
  const miscs = (neutral.misconceptions || []).filter(
    (m) => !(opts.excludeMechanical && m.mechanical)
  );
  if (miscs.some((m) => sameAnswer(m.wrongAnswer, answer))) return "erro-previsto";
  if ((correctAnswers || []).some((c) => sameAnswer(c, answer))) return "correto";
  return "surpresa";
}

/** Bateria = união (resposta correta) ∪ (wrongAnswers de ambos os grafos), deduplicada por âncora. */
export function buildBattery(expert, robot, correctAnswers = [], opts = {}) {
  const vals = new Map(); // canonAnswer → forma original
  const add = (a) => {
    if (a == null || String(a).trim() === "") return;
    vals.set(canonAnswer(a), String(a));
  };
  for (const c of correctAnswers) add(c);
  for (const m of expert.misconceptions || [])
    if (!(opts.excludeMechanical && m.mechanical)) add(m.wrongAnswer);
  for (const m of robot.misconceptions || []) add(m.wrongAnswer);
  return [...vals.values()];
}

/** κ de Cohen sobre as linhas {expert, robot} em CATS. */
export function cohenKappa(rows) {
  const n = rows.length;
  if (!n) return 1;
  const po = rows.filter((r) => r.expert === r.robot).length / n;
  let pe = 0;
  for (const c of CATS) {
    const pa = rows.filter((r) => r.expert === c).length / n;
    const pb = rows.filter((r) => r.robot === c).length / n;
    pe += pa * pb;
  }
  if (pe >= 1) return po >= 1 ? 1 : 0;
  return (po - pe) / (1 - pe);
}

/**
 * Equivalência funcional entre o grafo do especialista e o do robô.
 * @param {object} expert  grafo neutro do especialista (Envelope B)
 * @param {object} robot   grafo neutro do robô
 * @param {{correctAnswers?:string[], battery?:string[], excludeMechanical?:boolean}} opts
 * @returns {{ n, agreement, kappa, confusion, rows }}
 */
export function functionalEquivalence(expert, robot, opts = {}) {
  const correctAnswers = opts.correctAnswers || [];
  const battery = opts.battery || buildBattery(expert, robot, correctAnswers, opts);
  const rows = battery.map((answer) => ({
    answer,
    expert: verdictFor(expert, answer, correctAnswers, opts),
    robot: verdictFor(robot, answer, correctAnswers, opts),
  }));
  const n = rows.length;
  const agree = rows.filter((r) => r.expert === r.robot).length;
  const agreement = n ? agree / n : 1;

  // matriz de confusão expert(linha) × robot(coluna)
  const confusion = {};
  for (const a of CATS) {
    confusion[a] = {};
    for (const b of CATS)
      confusion[a][b] = rows.filter((r) => r.expert === a && r.robot === b).length;
  }

  return {
    n,
    agreement: round(agreement),
    kappa: round(cohenKappa(rows)),
    stepInclusion: round(traceInclusion(expert, robot)),
    confusion,
    rows,
  };
}

// ── Inclusão de traços STUTTER-INSENSITIVE (handoff 2026-06-30, T7) ───────────
// "O caminho do especialista cabe no robô?" — medir SEM punir granularidade:
// colapsamos os nós no-op (passo sem âncora de resposta, ex.: um "verifica"
// intermediário que o robô insere) e duplicatas consecutivas ANTES de medir a
// inclusão. Senão mede-se granularidade, não comportamento (van Glabbeek:
// inclusão de traços; stutter-equivalence). Projeção: âncora semântica da
// resposta do passo (canonAnswer); fallback = KC quando o passo não tem resposta.

/** Sequência projetada do caminho correto: âncoras de resposta (ou KC), sem no-ops/stutter. */
export function projectedPath(neutral) {
  const seq = [];
  for (const s of neutral.steps || []) {
    const anchor = canonAnswer(s.answer ?? "") || (s.kc ? "kc:" + String(s.kc) : "");
    if (!anchor) continue; // no-op (sem resposta nem KC) → colapsa
    if (seq[seq.length - 1] === anchor) continue; // stutter (repetição consecutiva) → colapsa
    seq.push(anchor);
  }
  return seq;
}

/**
 * Fração da sequência do ESPECIALISTA coberta como SUBSEQUÊNCIA (ordem preservada,
 * lacunas permitidas) da sequência do robô — direcional: "o essencial do especialista
 * cabe no robô", extras do robô não punem. 1 = caminho inteiro contido.
 */
export function traceInclusion(expert, robot) {
  const E = projectedPath(expert);
  const R = projectedPath(robot);
  if (!E.length) return 1;
  // LCS clássico O(|E|·|R|) — sequências curtas (passos de um exercício).
  const dp = Array.from({ length: E.length + 1 }, () => new Array(R.length + 1).fill(0));
  for (let i = 1; i <= E.length; i++)
    for (let j = 1; j <= R.length; j++)
      dp[i][j] =
        E[i - 1] === R[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  return dp[E.length][R.length] / E.length;
}

function round(x) {
  return Number.isFinite(x) ? Math.round(x * 1000) / 1000 : x;
}
