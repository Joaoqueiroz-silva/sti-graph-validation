/**
 * misconceptions-db.js — Exporta o catálogo MISC_DB pra uso compartilhado.
 *
 * 2026-04-23: Extraído de pipeline-v8.js pra resolver bug "MISC_DB is not defined"
 * em agents3-students.js e agent6-story.js (extraídos "byte-a-byte" sem importar).
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { logger } from "./logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

let MISC_DB = {};
try {
  const p = join(__dirname, "misconceptions.json");
  if (existsSync(p)) MISC_DB = JSON.parse(readFileSync(p, "utf-8"));
} catch (e) {
  logger.warn({ module: "misconceptions-db", phase: "load", err: e.message }, "Failed to load");
}

export { MISC_DB };
export default MISC_DB;
