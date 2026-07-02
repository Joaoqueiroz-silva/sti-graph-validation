/**
 * evaluation/simulate-students.js — os agentes-aluno resolvem a interface DADA.
 *
 * Reusa a infraestrutura REAL do pipeline (createLLM + getAgentConfig + callLLM +
 * extractJson). Diferente da geração normal, aqui a interface é EXTERNA e fixa, e
 * pedimos valores CONCRETOS (não genéricos), para casar com o grafo de um
 * especialista feito para a mesma interface.
 *
 * 2026-06-26 (Tarefa 2 do handoff de validação): RESTRIÇÃO DURA aos componentes.
 *   Os agentes só podem agir sobre `iface.components` (vocabulário SAI: cada ação tem
 *   um `selection` que DEVE ser um componente da interface). Isso vai (a) como regra
 *   forte no prompt E (b) como filtro programático pós-parse (defesa em profundidade —
 *   ver CLAUDE.md "compliance de prompt é estocástica"). Sem isso, o robô inventaria
 *   campos que o especialista (preso à mesma interface do CTAT) jamais usaria,
 *   inflando artificialmente a diferença entre os grafos.
 *
 * Saída: o contrato `traces` que `authorGraphForInterface` consome:
 *   { correctPath:[{kc,action,result,selection?}],
 *     misconceptions:[{step,id,type,wrongAnswer,description,feedback,selection?}],
 *     hints:[{step,text}] }
 */

import { createLLM, callLLM, extractJson, getAgentConfig } from "./llm.js";
import { canon } from "./schema.js";
import { logger } from "./logger.js";

const SYSTEM = `Você simula TRÊS alunos resolvendo um exercício numa INTERFACE JÁ DADA. NÃO invente outra interface nem outros campos: aja SOMENTE sobre os componentes listados.

- Aluno AVANÇADO → o caminho de solução CORRETO, passo a passo.
- Aluno EM RISCO → os ERROS típicos (misconceptions), cada um com a RESPOSTA ERRADA concreta que ele digitaria/clicaria.
- Aluno MEDIANO → onde ele hesita (vira dica).

REGRAS DURAS:
- VOCABULÁRIO FECHADO: cada passo e cada erro tem um campo "selection" que é o ID EXATO de um componente da lista. É PROIBIDO usar um componente fora da lista.
- Use VALORES CONCRETOS no "result"/"wrongAnswer" (ex.: "1/4", "0/4"), nunca variáveis genéricas.
- "wrongAnswer" é a resposta concreta do erro — é a ÂNCORA da avaliação, capriche e use o formato que o componente aceitaria.
- 1 a 6 passos no caminho correto; 2 a 8 misconceptions no total; numere "step" a partir de 1.
- Cada passo tem um "kc" curto em snake_case que você nomeia.

Retorne SOMENTE JSON puro:
{
  "correctPath": [{ "kc": "kc_...", "selection": "<id de componente>", "action": "o que o aluno faz", "result": "resultado concreto" }],
  "misconceptions": [{ "step": 1, "id": "misc_...", "selection": "<id de componente>", "type": "procedural|conceptual|factual", "wrongAnswer": "resposta errada concreta", "description": "...", "feedback": "..." }],
  "hints": [{ "step": 1, "text": "dica curta" }]
}`;

export function buildUserMessage(iface) {
  const comps = (iface.components || [])
    .map((c) => `- ${c.id} (${c.type})${c.label && c.label !== c.id ? ": " + c.label : ""}`)
    .join("\n");
  const ids = (iface.components || []).map((c) => c.id).join(", ");
  const screenshotNote = iface.screenshotPath
    ? "\n(Existe uma captura da interface; baseie-se na lista de componentes abaixo, que é a fonte da verdade.)"
    : "";
  return `PROBLEMA (enunciado da interface):
${iface.problem}
${screenshotNote}
RESPOSTA CORRETA: ${iface.correctAnswer || "(deduza a partir do enunciado)"}

COMPONENTES DA INTERFACE — VOCABULÁRIO PERMITIDO para "selection" (use SOMENTE estes IDs):
${comps || "(nenhum componente detectado — trate como resposta única)"}
${ids ? `\nIDs válidos: [${ids}]` : ""}

Simule os três alunos e gere o JSON, com "selection" ∈ IDs válidos em cada passo e cada erro.`;
}

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

/**
 * Filtra entradas cujo `selection` não é um componente da interface (defesa em profundidade).
 * Entradas SEM `selection` são mantidas (não super-podar; o prompt é a barreira primária).
 * @returns {{kept:Array, dropped:number}}
 */
export function restrictToComponents(entries, allowed) {
  if (!allowed.size) return { kept: entries, dropped: 0 };
  let dropped = 0;
  const kept = entries.filter((e) => {
    const sel = e && e.selection != null ? canon(e.selection) : null;
    if (!sel) return true; // sem selection declarado → mantém
    if (allowed.has(sel)) return true;
    dropped++;
    return false;
  });
  return { kept, dropped };
}

/** Roda a simulação e devolve os traces (restritos aos componentes). Lança se o LLM falhar de todo. */
export async function simulateStudents(iface, opts = {}) {
  const cfg = getAgentConfig(opts.configKey || "agent3b_atrisk");
  const llm = createLLM(cfg);
  const t0 = Date.now();
  const raw = await callLLM(llm, SYSTEM, buildUserMessage(iface), {
    agent: "eval_student_sim",
    sessionId: opts.sessionId || null,
  });
  const parsed = extractJson(raw) || {};

  // Conjunto de componentes permitidos (id e label, canônicos).
  const allowed = new Set();
  for (const c of iface.components || []) {
    if (c.id) allowed.add(canon(c.id));
    if (c.label) allowed.add(canon(c.label));
  }

  const cp = restrictToComponents(asArray(parsed.correctPath), allowed);
  const mc = restrictToComponents(asArray(parsed.misconceptions), allowed);
  const traces = {
    correctPath: cp.kept,
    misconceptions: mc.kept,
    hints: asArray(parsed.hints),
  };

  logger.info(
    {
      module: "eval-simulate",
      elapsedMs: Date.now() - t0,
      steps: traces.correctPath.length,
      miscs: traces.misconceptions.length,
      droppedSteps: cp.dropped,
      droppedMiscs: mc.dropped,
      nComponents: allowed.size,
      provider: cfg.provider,
      model: cfg.model,
    },
    "Student simulation done (restrito aos componentes)"
  );

  if (!traces.correctPath.length) {
    // fallback mínimo: 1 passo, sem erros, para o grafo ainda sair válido
    traces.correctPath = [
      { kc: "kc_solve", action: "Resolver o problema", result: iface.correctAnswer || "" },
    ];
  }
  return traces;
}
