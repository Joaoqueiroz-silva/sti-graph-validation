/**
 * graphforge.js — PORTA DE ENTRADA para o GraphForge DE PRODUÇÃO
 * (port 2026-08, docs/PLANO-PORT-AGENTES-2026-08.md §2; diff conferido antes
 * do port, como o plano exige).
 *
 * O arquivo portado, byte a byte igual a
 * `sti-unplugged:backend/agents/graphforge.js` (origin/main, commit em
 * producao/COMMIT-FONTE.txt), vive em producao/agents/. Mudanças relevantes
 * vindas de produção: plano de passos que honra o mínimo pedido pelo professor
 * (resolveGraphForgeStepPlan + completeDeterministicStepPlan), trace
 * representativo por problema no extractGraphForgeConfig, e filtro de
 * misconceptions OPERACIONAIS (id na gramática, wrongAnswer não-vazio, sem
 * template {A}/{B} não resolvido) antes de virarem branches do grafo.
 */
export {
  graphForge,
  extractGraphForgeConfig,
  resolveGraphForgeStepPlan,
} from "./producao/agents/graphforge.js";
