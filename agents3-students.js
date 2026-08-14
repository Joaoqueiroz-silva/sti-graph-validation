/**
 * agents3-students.js — PORTA DE ENTRADA para os agentes-aluno DE PRODUÇÃO
 * (port 2026-08, docs/PLANO-PORT-AGENTES-2026-08.md §2).
 *
 * O arquivo portado, byte a byte igual a
 * `sti-unplugged:backend/agents/nodes/agents3-students.js` (origin/main,
 * commit em producao/COMMIT-FONTE.txt), vive em producao/agents/nodes/ — os
 * imports relativos dele resolvem pelo espelho producao/ e pelos adaptadores
 * (producao/agents/pipeline-core.js resolve o MODELO por agente conforme
 * docs/CONFIGURACAO-MODELOS.md).
 *
 * A versão anterior deste arquivo — a bancada com chaves de ablação das
 * Campanhas 1-3 — está preservada em bancada-historica/agents3-students-c3.js
 * e continua sendo o que run-campaign3/run-ensemble-v2/saturation-curve e o
 * caminho `--real` reproduzem.
 */
export {
  agent3a_advancedStudent,
  agent3b_atRiskStudent,
  agent3c_averageStudent,
} from "./producao/agents/nodes/agents3-students.js";
