/**
 * evaluation/simulate-students-real.js — autoria com os AGENTES REAIS de produção.
 *
 * Diferente de `simulate-students.js` (que consolida os 3 alunos numa única chamada
 * enxuta), este módulo invoca os MESMOS agentes 3a/3b/3c que rodam na pipeline de
 * produção (`agents/nodes/agents3-students.js`) — INALTERADOS, com os prompts, modelos
 * e configs reais. É a versão fiel ao produto para o experimento de validação.
 *
 * O DESAFIO: os agentes de produção foram feitos para `seedProblems` que são TEMPLATES
 * (produção em massa → usam variáveis genéricas {A},{B},{C}). O experimento usa uma
 * INSTÂNCIA CONCRETA por `.brd` e precisa de valores concretos para casar a âncora
 * (wrongAnswer/result) com o grafo do especialista. Resolvemos isso SEM tocar nos
 * agentes: aterramos pelo próprio canal que eles já leem — `state.seedProblems` —
 * passando um seed concreto + a instrução de usar números concretos e só os
 * componentes da interface. Código dos agentes = byte-a-byte o de produção.
 *
 * Saída: o MESMO contrato `traces` que `simulateStudents` devolve, para ser drop-in via
 * `opts.simulate` em `authorFromEnvelopeA`:
 *   { correctPath:[{kc,action,result}],
 *     misconceptions:[{step,id,type,wrongAnswer,description,feedback,severity}],
 *     hints:[{step,text}] }
 */

import {
  agent3a_advancedStudent,
  agent3b_atRiskStudent,
  agent3c_averageStudent,
} from "./agents3-students.js";
import { logger } from "./logger.js";

/** Monta o `state` que os agentes de produção esperam, a partir do Envelope A. */
function buildState(iface, opts) {
  const components = (iface.components || []).map((c) => ({
    id: c.id,
    type: c.type,
    label: c.label,
  }));
  // Seed CONCRETO (não-template): aterra os agentes na instância real da interface.
  // Isso entra no prompt deles (serializam state.seedProblems como JSON) e neutraliza
  // a regra de "variáveis genéricas" SEM editar o código dos agentes.
  const seed = {
    problemId: 1,
    statement: iface.problem || "",
    correctAnswer: iface.correctAnswer || "",
    interface: { components },
    // NOTA (defensibilidade): este aterramento ESTENDE a regra do agente para o caso
    // concreto — não a contradiz. A produção pede variáveis genéricas porque os problemas
    // são TEMPLATES; aqui o problema é uma única instância já fixada, então a regra natural
    // é instanciar. A instrução viaja como DADO (state.seedProblems), sem editar o prompt.
    instrucoes:
      "CONTEXTO: você normalmente resolveria um TEMPLATE com variáveis genéricas ({A},{B},{C}). " +
      "AQUI, porém, o problema é uma ÚNICA INSTÂNCIA CONCRETA já fixada (não um template de " +
      "produção em massa). Portanto, para ESTA instância: " +
      "(a) instancie — use os VALORES CONCRETOS reais deste enunciado (ex.: 5, 1, 1/5) no lugar " +
      "das variáveis genéricas; " +
      "(b) FORMATO (contrato da interface fixa): em 'result' de cada passo e 'wrongAnswer' de cada " +
      "erro, escreva APENAS o VALOR ATÔMICO que iria no componente (ex.: '5','1','1/5','0/4'), " +
      "não uma frase como 'Denominador identificado: 5'; " +
      "(c) aja SOMENTE sobre os componentes listados em interface.components (vocabulário fechado).",
  };
  return {
    seedProblems: [seed],
    discipline: opts.discipline || iface.discipline || "Matemática",
    topic: opts.topic || iface.topic || iface.problem?.slice(0, 60) || "—",
    difficulty: iface.difficulty || opts.difficulty || "medium",
    ageGroup: opts.ageGroup || iface.ageGroup || "11",
    knowledgeComponents: (iface.knowledgeComponents || []).map((kc) => ({
      id: kc.id,
      name: kc.name || kc.id,
    })),
    sessionId: opts.sessionId || null,
  };
}

/** advancedTrace → correctPath[{kc,action,result}] */
function mapCorrectPath(advancedTrace) {
  const sol = advancedTrace?.solutions?.[0];
  const steps = sol?.solutionTrace || [];
  return steps.map((s) => ({
    kc: s.kcUsed || s.kc || "kc_step",
    action: s.action || "",
    result: s.result != null ? String(s.result) : "",
  }));
}

/** atRiskTrace → misconceptions[] (achata solutions[].attempts[].solutionTrace[].error) */
function mapMisconceptions(atRiskTrace) {
  const out = [];
  for (const sol of atRiskTrace?.solutions || []) {
    for (const att of sol.attempts || []) {
      for (const t of att.solutionTrace || []) {
        const e = t && t.isCorrect === false ? t.error : null;
        if (!e) continue;
        out.push({
          step: t.step || 1,
          id: e.misconceptionId || `misc_${out.length + 1}`,
          type: e.type || "conceptual_error",
          wrongAnswer: e.wrongAnswer != null ? String(e.wrongAnswer) : "",
          description: e.description || e.mistakeLocation || "",
          feedback: e.feedback || e.howToFix || "",
          severity: e.severity || "moderate",
        });
      }
    }
  }
  return out;
}

/** averageTrace → hints[] (achata os 4 níveis de hintsNeeded por passo com hesitação) */
function mapHints(averageTrace) {
  const out = [];
  for (const sol of averageTrace?.solutions || []) {
    for (const t of sol.solutionTrace || []) {
      if (!t || !Array.isArray(t.hintsNeeded)) continue;
      for (const h of t.hintsNeeded) {
        const text = typeof h === "string" ? h : h.message || "";
        if (text) out.push({ step: t.step || 1, text });
      }
    }
  }
  return out;
}

/**
 * Roda os 3 agentes REAIS sobre a interface fixa e devolve os `traces` no contrato
 * que `authorGraphForInterface` consome. Drop-in para `opts.simulate`.
 * @param {object} iface  Envelope A { problem, components, correctAnswer, knowledgeComponents }
 * @param {object} [opts] { discipline?, topic?, ageGroup?, difficulty?, sessionId? }
 */
export async function simulateStudentsReal(iface, opts = {}) {
  const state = buildState(iface, opts);
  const t0 = Date.now();
  const safe = (p, tag) =>
    p.catch((e) => {
      logger.error({ module: "eval-real", agent: tag, err: e.message }, `${tag} falhou`);
      return {};
    });

  // Orquestração ESPELHA a produção (pipeline-v8.js:420-453): 3a/3b em paralelo; 3c CONDICIONAL.
  const [adv, risk] = await Promise.all([
    safe(agent3a_advancedStudent(state), "3a"),
    safe(agent3b_atRiskStudent(state), "3b"),
  ]);

  // skip3c idêntico ao da produção: pula 3c se 3a vazio OU 3b já tem ≥3 misconceptions
  // (otimização de custo real do produto). opts.always3c força os 3 (estudo de capacidade plena).
  const advOk = !!adv.advancedTrace?.solutions?.length;
  const riskMiscCount = (risk.atRiskTrace?.solutions || []).reduce(
    (s, sol) =>
      s +
      (sol.attempts || []).reduce(
        (ss, a) => ss + (a.solutionTrace || []).filter((tr) => tr.error?.misconceptionId).length,
        0
      ),
    0
  );
  const skip3c = !opts.always3c && (!advOk || riskMiscCount >= 3);
  const avg = skip3c ? {} : await safe(agent3c_averageStudent(state), "3c");

  const traces = {
    correctPath: mapCorrectPath(adv.advancedTrace),
    misconceptions: mapMisconceptions(risk.atRiskTrace),
    hints: mapHints(avg.averageTrace),
  };

  if (!traces.correctPath.length) {
    // fallback mínimo: grafo ainda sai válido mesmo se 3a falhar/retornar vazio.
    traces.correctPath = [
      { kc: "kc_solve", action: "Resolver o problema", result: iface.correctAnswer || "" },
    ];
  }

  logger.info(
    {
      module: "eval-real",
      elapsedMs: Date.now() - t0,
      steps: traces.correctPath.length,
      miscs: traces.misconceptions.length,
      hints: traces.hints.length,
      ran3c: !skip3c,
      agents: skip3c ? "3a+3b (3c pulado, como produção)" : "3a+3b+3c (produção, inalterados)",
    },
    "Autoria com agentes reais concluída"
  );

  return traces;
}
