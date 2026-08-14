/**
 * misconceptions-db.js — PORTA DE ENTRADA para o banco de misconceptions DE
 * PRODUÇÃO (port 2026-08, docs/PLANO-PORT-AGENTES-2026-08.md §2; diff
 * conferido antes do port).
 *
 * O arquivo portado, byte a byte igual a
 * `sti-unplugged:backend/agents/misconceptions-db.js` (origin/main, commit em
 * producao/COMMIT-FONTE.txt), vive em producao/agents/ e carrega
 * producao/data/misconceptions.json (byte-idêntico ao misconceptions.json da
 * raiz, conferido no port). Novidade de produção: `misconceptionsFor`, a busca
 * com normalização de acentos ("Matemática" → chave `matematica:8-12`) que
 * corrigiu o catálogo morto na disciplina majoritária.
 */
export {
  MISC_DB,
  misconceptionsFor,
  misconceptionAgeKey,
} from "./producao/agents/misconceptions-db.js";
export { default } from "./producao/agents/misconceptions-db.js";
