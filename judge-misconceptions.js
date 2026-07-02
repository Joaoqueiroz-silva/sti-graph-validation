/**
 * evaluation/judge-misconceptions.js — Juiz CEGO de validade pedagógica das misconceptions.
 *
 * Responde a pergunta que separa "diferente" de "pior": os erros que o robô prevê e o
 * especialista NÃO catalogou ("a-mais") são misconceptions pedagogicamente VÁLIDAS, ou
 * invenções fora do alvo?
 *
 * Desenho anti-viés (o que torna a medição confiável):
 *   1. CEGO — o juiz recebe só {problema, resposta correta, resposta errada candidata};
 *      NUNCA sabe a origem (robô / especialista / distrator). Impossível torcer.
 *   2. CALIBRAÇÃO — junto dos erros "a-mais" do robô, o juiz avalia também:
 *      - os erros CONCEITUAIS do PRÓPRIO especialista → a régua do "válido" (deve dar alto);
 *      - DISTRATORES óbvios (a resposta correta; um valor absurdo) → controle negativo
 *        (deve dar baixo). Se o juiz não distinguir os distratores, ele é um carimbo e
 *        a medição não vale.
 *   3. JUIZ CROSS-FAMILY — usa agent9_review (GLM via Z.ai), modelo DIFERENTE do que gerou
 *      as misconceptions (gemini), evitando viés de auto-avaliação.
 *
 * Leitura: se taxa(robô-extra) ≈ taxa(especialista) ≫ taxa(distrator) → o robô cobre erros
 * válidos que o humano não listou ("complementar"). Se taxa(robô-extra) ≈ taxa(distrator) →
 * boa parte é ruído ("pior").
 */

import { createLLM, callLLM, extractJson, getAgentConfig } from "./llm.js";
import { canonAnswer } from "./schema.js";
import { logger } from "./logger.js";

const SYSTEM = `Você é um especialista em educação matemática. Avalia se uma RESPOSTA ERRADA de aluno é uma "misconception" pedagogicamente VÁLIDA para um problema.

VÁLIDA = um aluno real daria essa resposta errada por um raciocínio equivocado PLAUSÍVEL e identificável (ex.: inverteu numerador e denominador, somou em vez de dividir, ignorou a parte inteira, confundiu o total com a parte).

NÃO VÁLIDA se: for aleatória/sem raciocínio plausível ("implausivel"); for na verdade a resposta CERTA ("na_verdade_correta"); ou for impossível no contexto ("impossivel").

Avalie UMA resposta por vez, com rigor e imparcialidade. Você NÃO sabe de onde a resposta veio.

Retorne SOMENTE JSON puro:
{ "valid": true|false, "category": "valida_conceitual|implausivel|na_verdade_correta|impossivel", "misconceptionName": "nome curto do erro se válida, senão ''", "reason": "1 frase curta" }`;

function buildUser(problem, correctAnswer, candidate) {
  return `PROBLEMA: ${problem}
RESPOSTA CORRETA: ${correctAnswer}
RESPOSTA ERRADA DO ALUNO (avalie só esta): ${candidate}

Essa resposta errada é uma misconception pedagogicamente válida?`;
}

/** Juiz LLM (cross-family) para uma única resposta candidata. CEGO à origem. */
export async function judgeMisconception(problem, correctAnswer, candidate, opts = {}) {
  const cfg = getAgentConfig(opts.configKey || "agent9_review");
  const llm = createLLM(cfg);
  const raw = await callLLM(llm, SYSTEM, buildUser(problem, correctAnswer, candidate), {
    agent: "eval_judge_misc",
    sessionId: opts.sessionId || null,
  });
  const parsed = extractJson(raw) || {};
  return {
    candidate: String(candidate),
    valid: parsed.valid === true,
    category: parsed.category || "indefinido",
    misconceptionName: parsed.misconceptionName || "",
    reason: parsed.reason || "",
  };
}

// ── Juiz de IMPORTÂNCIA (para os erros que o robô PERDEU) ─────────────────────
// Separa "complementar" de "pior": dos erros do especialista que o robô NÃO cobriu,
// quantos eram CENTRAIS (um tutor PRECISA detectar) vs periféricos/mecânicos?
const SYSTEM_IMPORTANCE = `Você é um especialista em educação matemática. Para um problema dado, avalie quão IMPORTANTE é uma certa "misconception" (resposta errada típica de aluno) para um tutor inteligente endereçar.

- "central" = erro conceitual central deste problema; um bom tutor PRECISA detectar e remediar (alto impacto na aprendizagem).
- "periferico" = erro plausível, mas de baixa prioridade pedagógica (raro, ou consequência menor de outro erro).
- "mecanico" = artefato de interface (resposta em branco, ponto ligeiramente errado, sinal de menos sozinho) — não é um erro conceitual.

Você NÃO sabe se algum sistema cobriu ou não esse erro. Julgue SÓ a importância pedagógica, com imparcialidade.

Retorne SOMENTE JSON puro:
{ "importance": "central|periferico|mecanico", "reason": "1 frase curta" }`;

/** Juiz LLM (cross-family) da IMPORTÂNCIA de uma misconception. CEGO à cobertura. */
export async function judgeImportance(problem, correctAnswer, candidate, opts = {}) {
  const cfg = getAgentConfig(opts.configKey || "agent9_review");
  const llm = createLLM(cfg);
  const user = `PROBLEMA: ${problem}
RESPOSTA CORRETA: ${correctAnswer}
MISCONCEPTION (resposta errada) a avaliar: ${candidate}

Quão importante é endereçar essa misconception?`;
  const raw = await callLLM(llm, SYSTEM_IMPORTANCE, user, {
    agent: "eval_judge_importance",
    sessionId: opts.sessionId || null,
  });
  const parsed = extractJson(raw) || {};
  const importance = ["central", "periferico", "mecanico"].includes(parsed.importance)
    ? parsed.importance
    : "periferico";
  return { candidate: String(candidate), importance, reason: parsed.reason || "" };
}

/** Julga a importância de uma lista de candidatos (paralelo). `opts.judgeImp` injeta fake (testes). */
export async function judgeImportanceItems(problem, correctAnswer, candidates, opts = {}) {
  const judge = opts.judgeImp || judgeImportance;
  return Promise.all(candidates.map((c) => judge(problem, correctAnswer, c, opts)));
}

/** Agrega importância: fração central/periferico/mecanico. */
export function summarizeImportance(judged) {
  const n = judged.length;
  const count = (k) => judged.filter((j) => j.importance === k).length;
  const central = count("central");
  const periferico = count("periferico");
  const mecanico = count("mecanico");
  return {
    n,
    central,
    periferico,
    mecanico,
    centralRate: n ? Math.round((central / n) * 1000) / 1000 : null,
  };
}

/** Distratores (controle negativo): a resposta correta + um valor absurdo. */
export function makeDistractors(correctAnswer) {
  const out = [];
  if (correctAnswer != null && String(correctAnswer).trim() !== "") {
    out.push({ candidate: String(correctAnswer), source: "distrator-correta" }); // espera-se na_verdade_correta
  }
  out.push({ candidate: "987654", source: "distrator-absurdo" }); // espera-se implausivel/impossivel
  return out;
}

/**
 * Monta a lista CEGA de itens a julgar (com a origem marcada SÓ para a análise, nunca enviada ao juiz).
 * Deduplica por âncora canônica (não julgar a mesma resposta duas vezes; 1ª origem vence).
 */
export function buildJudgeItems({ robotExtras = [], expertConceptual = [], distractors = [] }) {
  const seen = new Set();
  const items = [];
  const add = (candidate, source) => {
    const k = canonAnswer(candidate);
    if (k === "" || seen.has(k)) return;
    seen.add(k);
    items.push({ candidate: String(candidate), source });
  };
  for (const w of robotExtras) add(w, "robo-extra");
  for (const w of expertConceptual) add(w, "especialista");
  for (const d of distractors) add(d.candidate, d.source);
  return items;
}

/** Julga todos os itens (em paralelo). `opts.judge` injeta um juiz fake (testes offline). */
export async function judgeItems(problem, correctAnswer, items, opts = {}) {
  const judge = opts.judge || judgeMisconception;
  const judged = await Promise.all(
    items.map(async (it) => ({
      ...it,
      ...(await judge(problem, correctAnswer, it.candidate, opts)),
    }))
  );
  return judged;
}

/** Agrega taxa de validade por origem. */
export function summarizeBySource(judged) {
  const groups = {};
  for (const j of judged) {
    const g = (groups[j.source] ||= { n: 0, valid: 0, items: [] });
    g.n++;
    if (j.valid) g.valid++;
    g.items.push({ candidate: j.candidate, valid: j.valid, category: j.category });
  }
  for (const g of Object.values(groups))
    g.validRate = g.n ? Math.round((g.valid / g.n) * 1000) / 1000 : null;
  return groups;
}

/** Conveniência: loga o resumo de um problema. */
export function logProblemSummary(id, groups) {
  logger.info({ module: "eval-judge", problem: id, groups }, "Judge summary");
}
