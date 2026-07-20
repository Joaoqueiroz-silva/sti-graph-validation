/**
 * evaluation/author-graph.js — O robô AUTORA o grafo para uma interface DADA.
 *
 * É o "desacoplamento" que o experimento exige: hoje o pipeline gera interface +
 * grafo juntos; aqui ele ACEITA uma interface externa (fixa) e autora SÓ o grafo.
 *
 * Fluxo (idêntico em espírito ao pipeline real):
 *   interface + traces dos 3 alunos-simulados → config → graphForge (determinístico)
 *
 * `traces` é o que os 3 agentes-aluno produzem ao "resolver" a interface:
 *   {
 *     correctPath:    [{ kc, action, result }],                // aluno avançado
 *     misconceptions: [{ step, id, type, wrongAnswer, buggyRule?, description, feedback, severity }], // em-risco
 *     hints:          [{ step, text }]                          // mediano (hesitações)
 *   }
 *
 * Para o caminho com LLM de verdade, gere `traces` com os agentes-aluno e passe
 * aqui (veja simulateStudentsLLM no README). graphForge é puro e síncrono.
 */

import { graphForge } from "./graphforge.js";

/** interface + traces → config do graphForge. */
export function buildGraphForgeConfig(iface, traces) {
  const profile = iface.profile || "reader";
  const difficulty = iface.difficulty || "medium";
  const kcs = (iface.knowledgeComponents || []).map((kc) => ({
    id: kc.id,
    name: kc.name || kc.id,
    difficulty: kc.difficulty || "medium",
    prerequisites: kc.prerequisites || [],
    masteryThreshold: 0.85,
  }));

  const steps = (traces.correctPath || []).map((s, i) => ({
    index: i + 1,
    kc: s.kc || kcs[Math.min(i, kcs.length - 1)]?.id || "kc_default",
    action: s.action || "",
    result: s.result || "",
  }));

  const misconceptions = {}; // { [stepIndex0based]: [...] }
  // 2026-07-19 (Trilha A — sem teto, filosofia do 3b): NENHUM slice/limite aqui,
  // de propósito — o robô produz quantos erros por passo forem necessários
  // (princípio CTAT) e TODOS entram no grafo. Qualquer teto voltaria a mascarar
  // a completude que o experimento mede.
  for (const m of traces.misconceptions || []) {
    const idx = Math.max(0, (m.step || 1) - 1);
    (misconceptions[idx] ||= []).push({
      id: m.id,
      type: m.type || "conceptual_error",
      wrongAnswer: m.wrongAnswer ?? "",
      // 2026-07-19: buggyRule (receita mecânica, estilo 3b de produção) enriquece
      // a description quando ela faltar — é material do próprio robô, não sintético.
      description: m.description || m.buggyRule || "",
      buggyRule: m.buggyRule || "",
      feedback: m.feedback || m.howToFix || "",
      severity: m.severity || "moderate",
    });
  }

  const hints = {}; // { [stepIndex0based]: [...] }
  for (const h of traces.hints || []) {
    const idx = Math.max(0, (h.step || 1) - 1);
    (hints[idx] ||= []).push(typeof h === "string" ? h : h.text || "");
  }

  return { steps, misconceptions, hints, kcs, profile, difficulty };
}

/** Autora o behaviorGraph (formato EducaOFF) para a interface dada. */
export function authorGraphForInterface(iface, traces) {
  const config = buildGraphForgeConfig(iface, traces);
  const { graph } = graphForge(config);
  injectStepAnswers(graph, config);
  return graph;
}

/**
 * 2026-06-26 (A1, SÓ avaliação): o graphForge grava `expectedInput.value = null`
 * (graphforge.js:344) porque em PRODUÇÃO esse campo é preenchido depois, no lock
 * pós-UI (gotcha #1 do CLAUDE.md). Na avaliação não há esse lock, então a resposta
 * concreta que o aluno-simulado produziu (`config.steps[i].result`, preservada acima)
 * nunca chegava ao nó — e `schema.js` chaveava o passo por KC, não pela resposta,
 * zerando o recall de passos por construção. Aqui injetamos o `result` no nó `step_{i+1}`
 * correspondente. NÃO altera o graphForge de produção (a mutação é local ao grafo de eval).
 */
function injectStepAnswers(graph, config) {
  const byId = new Map((graph.nodes || []).map((n) => [n.id, n]));
  (config.steps || []).forEach((step, i) => {
    const node = byId.get("step_" + (i + 1));
    if (!node || node.type !== "step" || !node.expectedInput) return;
    const r = step.result;
    if (
      (node.expectedInput.value == null || node.expectedInput.value === "") &&
      r != null &&
      String(r).trim() !== ""
    ) {
      node.expectedInput.value = String(r);
    }
  });
}
