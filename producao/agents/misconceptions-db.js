/**
 * misconceptions-db.js — Exporta o catálogo MISC_DB pra uso compartilhado.
 *
 * 2026-04-23: Extraído de pipeline-v8.js pra resolver bug "MISC_DB is not defined"
 * em agents3-students.js e agent6-story.js (extraídos "byte-a-byte" sem importar).
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { logger } from "../lib/logger.js";
import { stripAccents } from "../lib/text-normalize.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

let MISC_DB = {};
try {
  const p = join(__dirname, "..", "data", "misconceptions.json");
  if (existsSync(p)) MISC_DB = JSON.parse(readFileSync(p, "utf-8"));
} catch (e) {
  logger.warn({ module: "misconceptions-db", phase: "load", err: e.message }, "Failed to load");
}

/** Faixa etária usada como sufixo das chaves do catálogo. */
export function misconceptionAgeKey(ageGroup) {
  const age = parseInt(ageGroup, 10) || 10;
  if (age <= 5) return "4-5";
  if (age <= 7) return "6-7";
  if (age <= 12) return "8-12";
  return "13+";
}

/**
 * Busca as misconceptions empíricas catalogadas para (disciplina, faixa etária).
 *
 * 2026-08-09 (auditoria de conformidade STI): as chaves do JSON são SEM acento
 * (`matematica:8-12`) e os dois call sites montavam a chave com
 * `discipline.toLowerCase()` apenas. Como a disciplina chega ACENTUADA da UI
 * ("Matemática" — gotcha 3 do CLAUDE.md), a chave virava `matemática:8-12`,
 * que não existe, e o prompt recebia "Nenhuma misconception empirica
 * catalogada." justamente na disciplina majoritária do corpus (156 dos 271
 * tutores publicados são de matemática). O único banco declarativo do modelo
 * de estudante estava morto no caso mais comum.
 *
 * A busca vive aqui, e não nos call sites, para não nascer uma terceira cópia
 * da normalização.
 */
export function misconceptionsFor(discipline, ageGroup, { fallbackDiscipline = "" } = {}) {
  const bruto = String(discipline ?? "").trim() || fallbackDiscipline;
  const chave = `${stripAccents(bruto).toLowerCase()}:${misconceptionAgeKey(ageGroup)}`;
  return MISC_DB[chave] || [];
}

export { MISC_DB };
export default MISC_DB;
