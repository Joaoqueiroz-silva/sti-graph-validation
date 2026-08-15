/**
 * lib/student-profile.js — Constrói o perfil adaptativo de um aluno a partir
 * de `interactions` (Supabase). Usado por:
 *
 *   - GET /api/student/:studentId/profile (frontend popular card de preview)
 *   - POST /api/generate-v8 com adaptive=true (injeção em prompts V10 + V9.2)
 *   - (depois) GET /api/student/:studentId/mastery consertado pra delegar aqui
 *
 * Privacy: o `studentId` que sai do módulo é SHA-256 truncado em 8 chars.
 * O id original NUNCA é incluído no retorno nem propagado pros prompts LLM.
 *
 * Plano em docs/adaptive-sti-plan.md §4.1.
 */

import { createHash } from "crypto";
import { logger } from "./logger.js";
import { bktPosterior, BKT_DEFAULT_PARAMS } from "./bkt-core.js";
// supabase é carregado sob demanda dentro de buildStudentProfile — permite que
// as funções puras (hashStudentId, buildAdaptivePromptBlock) sejam testadas
// sem dep do @supabase/supabase-js instalado.

const DEFAULT_WINDOW_DAYS = parseInt(process.env.STI_ADAPTIVE_WINDOW_DAYS || "90", 10);
const COLD_START_THRESHOLD = 5;
const MIN_INTERACTIONS_FOR_KC = 3;
const WEAK_KC_PL_THRESHOLD = 0.5;
const MAX_WEAK_KCS = 3;
const MAX_MISC_PER_KC = 2;
const MIN_RECURRENT_COUNT = 2;

// 2026-08-06: BKT_DEFAULTS era uma cópia à mão de BKT_DEFAULT_PARAMS
// (lib/bkt-core.js) — apontando pro mesmo objeto agora, não pode mais divergir.
const BKT_DEFAULTS = BKT_DEFAULT_PARAMS;

export function hashStudentId(studentId) {
  return createHash("sha256").update(String(studentId)).digest("hex").slice(0, 8);
}

function humanizeKCName(kcId) {
  if (!kcId) return "";
  return kcId.replace(/^kc_/, "").replace(/_/g, " ");
}

// Sample de wrong answer só passa se for curto e sem caracteres "arriscados"
// (previne vazar texto livre do aluno pro prompt LLM — bloqueia HTML, aspas,
// comandos, etc.). Exportado pra testabilidade.
export function safeSample(answer) {
  const s = String(answer || "").trim();
  if (!s || s.length > 50) return null;
  if (!/^[a-zA-ZÀ-ÿ0-9\s.,:;!?()\-+*/=%]+$/.test(s)) return null;
  return s;
}

// 2026-08-06 (Tier 2.9): fórmula movida pro núcleo único, ver lib/bkt-core.js.
const runBKTUpdate = (prevPL, correct) => bktPosterior(prevPL, correct);

/**
 * Constrói o perfil adaptativo de um aluno.
 *
 * @param {string} studentId - id original do aluno (será hasheado no retorno)
 * @param {object} options
 * @param {number} [options.windowDays=90] - janela de recência das interações
 * @returns {Promise<StudentProfile>}
 */
export async function buildStudentProfile(studentId, options = {}) {
  const windowDays = options.windowDays || DEFAULT_WINDOW_DAYS;
  const cutoffIso = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  let interactions = [];
  try {
    const { default: supabase } = await import("../db.js");
    const { data } = await supabase
      .from("interactions")
      .select(
        "kc_id, correct, misconception_type, misconception_id, answer_given, timestamp, hints_used, attempt_number"
      )
      .eq("student_id", studentId)
      .gte("timestamp", cutoffIso)
      .order("timestamp", { ascending: true });
    if (data) interactions = data;
  } catch (e) {
    logger.warn({ module: "student-profile", phase: "supabase", err: e.message }, "Supabase fail");
  }

  const totalInteractions = interactions.length;
  const baseProfile = {
    studentId: hashStudentId(studentId),
    totalInteractions,
    overallMastery: 0,
    totalKCs: 0,
    weakKCs: [],
    recurrentMisconceptions: [],
    coldStart: totalInteractions < COLD_START_THRESHOLD,
    dataFreshness: { oldestMs: null, newestMs: null },
  };

  if (totalInteractions === 0) {
    return { ...baseProfile, displayHint: "Aluno sem histórico de interações" };
  }

  const kcState = {};
  for (const i of interactions) {
    const kc = i.kc_id;
    if (!kc) continue;
    if (!kcState[kc]) {
      kcState[kc] = {
        id: kc,
        pL: BKT_DEFAULTS.pL0,
        interactions: 0,
        correct: 0,
        incorrect: 0,
        misconceptions: [],
        lastSeen: null,
      };
    }
    const s = kcState[kc];
    s.interactions++;
    s.lastSeen = i.timestamp;
    const correct = !!i.correct;
    if (correct) s.correct++;
    else s.incorrect++;
    if (i.misconception_type) {
      s.misconceptions.push({
        type: i.misconception_type,
        id: i.misconception_id,
        answer: i.answer_given,
      });
    }
    s.pL = runBKTUpdate(s.pL, correct);
  }

  const weakKCs = Object.values(kcState)
    .filter((s) => s.pL < WEAK_KC_PL_THRESHOLD && s.interactions >= MIN_INTERACTIONS_FOR_KC)
    .sort((a, b) => a.pL - b.pL)
    .slice(0, MAX_WEAK_KCS)
    .map((s) => ({
      id: s.id,
      name: humanizeKCName(s.id),
      pL: Math.round(s.pL * 1000) / 1000,
      interactions: s.interactions,
      accuracy: Math.round((s.correct / s.interactions) * 100),
      lastSeen: s.lastSeen,
    }));

  const recurrentMisconceptions = [];
  for (const kc of weakKCs) {
    const miscMap = {};
    for (const m of kcState[kc.id].misconceptions || []) {
      if (!m.type) continue;
      if (!miscMap[m.type]) miscMap[m.type] = { count: 0, samples: [] };
      miscMap[m.type].count++;
      const sample = safeSample(m.answer);
      if (sample && miscMap[m.type].samples.length < 2) {
        miscMap[m.type].samples.push(sample);
      }
    }
    const top = Object.entries(miscMap)
      .filter(([, d]) => d.count >= MIN_RECURRENT_COUNT)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, MAX_MISC_PER_KC);
    for (const [type, data] of top) {
      recurrentMisconceptions.push({
        kcId: kc.id,
        misconceptionType: type,
        count: data.count,
        sampleWrongAnswer: data.samples[0] || null,
      });
    }
  }

  const totalKCs = Object.keys(kcState).length;
  const overallMastery =
    totalKCs > 0 ? Object.values(kcState).reduce((sum, s) => sum + s.pL, 0) / totalKCs : 0;

  const displayHint = weakKCs.length
    ? "dificuldades em " +
      weakKCs
        .map((k) => k.name)
        .slice(0, 3)
        .join(", ")
    : baseProfile.coldStart
      ? "histórico insuficiente"
      : "sem dificuldades marcantes no período";

  return {
    ...baseProfile,
    overallMastery: Math.round(overallMastery * 1000) / 1000,
    totalKCs,
    weakKCs,
    recurrentMisconceptions,
    displayHint,
    dataFreshness: {
      oldestMs: interactions[0]?.timestamp || null,
      newestMs: interactions[interactions.length - 1]?.timestamp || null,
    },
  };
}

/**
 * Gera o bloco de contexto adaptativo pra injeção em prompts LLM.
 * Entrada: adaptiveProfile (retorno de buildStudentProfile).
 * Saída: string pronta pra concatenar em userMessage. Retorna "" se
 * o perfil estiver vazio/cold-start (não vale gastar token).
 */
export function buildAdaptivePromptBlock(profile) {
  if (!profile || profile.coldStart || !profile.weakKCs?.length) return "";

  const weak = profile.weakKCs
    .map(
      (k) =>
        `  - ${k.name} (KC id: ${k.id}) — mastery atual ${Math.round(k.pL * 100)}%, ${k.interactions} interações, ${k.accuracy}% acerto`
    )
    .join("\n");

  const miscByKC = {};
  for (const m of profile.recurrentMisconceptions || []) {
    if (!miscByKC[m.kcId]) miscByKC[m.kcId] = [];
    miscByKC[m.kcId].push(
      `${m.misconceptionType}${m.sampleWrongAnswer ? ` (ex: "${m.sampleWrongAnswer}")` : ""} × ${m.count}`
    );
  }
  const miscBlock =
    Object.keys(miscByKC).length > 0
      ? Object.entries(miscByKC)
          .map(([kc, list]) => `  - ${kc}: ${list.join("; ")}`)
          .join("\n")
      : "  (nenhum erro recorrente identificado no período)";

  return `\n=== CONTEXTO ADAPTATIVO (aluno ${profile.studentId}) ===
Este STI será usado por um aluno específico com histórico de interações.

KCs com mastery baixo (priorize):
${weak}

Misconceptions recorrentes observadas:
${miscBlock}

DIRETRIZES:
- PRIORIZE exercícios que envolvam os KCs acima (ao menos 60% dos problemas).
- Nos DISTRATORES dos steps que tocam esses KCs, inclua ao menos uma opção que
  reflita uma das misconceptions observadas (use os mesmos misconceptionType
  listados acima no campo misconceptionId/misconceptionType das options).
- NÃO revele as dificuldades ao aluno nos enunciados; trate como contexto
  pedagógico silencioso.
- Calibre dificuldade: se mastery atual é < 30% em algum KC, comece com 1
  problema de reforço do nível atual ANTES de subir a complexidade.`;
}
