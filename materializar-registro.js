/**
 * materializar-registro.js — MATERIALIZAÇÃO de produção sobre um registro do
 * contrato v2 (port 2026-08-15): agent 6 (exercícios concretos) + agent 7
 * (GraphForge reexecutado sobre o artefato concreto) — as MESMAS peças byte a
 * byte da plataforma (producao/agents/nodes/agent6-story.js e
 * agent7-adapter.js), sem regenerar os alunos.
 *
 * Por que existe: a métrica de ESTADOS do orientador compara valores de
 * estado; no estágio graphforge o agent 3a rotula estados com placeholders
 * ({A}/{B}) por design do prompt de produção. Na plataforma, o agent 6
 * escreve o `expectedAnswer` concreto de cada passo e o agent 7 reexecuta o
 * GraphForge — é ESSE grafo que o aluno recebe. Aqui reproduzimos exatamente
 * esse trecho da cadeia a partir dos traces preservados em `bruto.tracos`.
 *
 * PROBLEMA FIXO: o agent 6 é o "story writer" de produção — por design
 * inventa história e números. Na bancada CTAT o problema é FIXO (o
 * especialista resolveu ESTE problema). Usamos o canal que o próprio agent 6
 * obedece em produção — `state.description`, injetado no planner como
 * "REQUISITOS DO PROFESSOR (OBRIGATÓRIOS)" — para exigir o enunciado e os
 * números do CTAT. Nenhum agente é editado. A obediência NÃO é presumida:
 * `verificarProblemaFixo` é GATE objetivo; registro reprovado não entra na
 * comparação de estados e é reportado à parte.
 *
 * Só a materialização custa LLM (papel "materializacao" do perfil). O
 * fallback dos workers é mapeado para o mesmo papel (nunca troca de modelo).
 */

import { agent6_exerciseGenerator } from "./producao/agents/nodes/agent6-story.js";
import { agent7_interfaceAdapter } from "./producao/agents/nodes/agent7-adapter.js";
import { extractGraphForgeConfig, graphForge } from "./graphforge.js";
import { buildMisconceptionCatalog } from "./step-error-catalog.js";
import { buildStateFromEnvelopeA } from "./simulate-fluxo-plataforma.js";
import { montarGrafo } from "./scripts/registro-run-v2.mjs";

/**
 * GATE de problema fixo — prova objetiva de que o agent 6 usou o problema do
 * CTAT, e não um inventado. Critérios verificáveis:
 *   1. a resposta correta do envelope A aparece entre os valores esperados dos
 *      passos materializados;
 *   2. nenhum passo tem valor numérico ESTRANHO ao problema: todo número que
 *      aparece nos valores dos passos ocorre no enunciado ou na resposta
 *      (numeradores e denominadores de frações do enunciado liberados) —
 *      regra conservadora: número que não ocorre reprova.
 */
export function verificarProblemaFixo(envelopeA, exercicio, grafoMaterializado) {
  const nums = (s) =>
    [...String(s ?? "").matchAll(/-?\d+(?:[.,]\d+)?/g)].map((m) => m[0].replace(",", "."));
  const permitidos = new Set([...nums(envelopeA.problem), ...nums(envelopeA.correctAnswer)]);
  for (const m of String(envelopeA.problem + " " + envelopeA.correctAnswer).matchAll(/(\d+)\s*\/\s*(\d+)/g)) {
    permitidos.add(m[1]);
    permitidos.add(m[2]);
  }
  const canon = (v) => String(v ?? "").trim().replace(/\s+/g, "");
  const valores = (grafoMaterializado?.passos || []).map((p) => canon(p.valor)).filter(Boolean);
  const resposta = canon(envelopeA.correctAnswer);
  const contemResposta = valores.some((v) => v === resposta || v.replace(",", ".") === resposta);
  const estranhos = [];
  for (const v of valores) for (const n of nums(v)) if (!permitidos.has(n)) estranhos.push(`${v}→${n}`);
  const numsEnunciadoGerado = nums(exercicio?.statement ?? "");
  return {
    aprovado: contemResposta && estranhos.length === 0,
    contemResposta,
    valoresEstranhos: estranhos,
    numerosEstranhosNoEnunciado: numsEnunciadoGerado.filter((n) => !permitidos.has(n)),
    valores,
  };
}

/** Reconstrói o genericGraph do estágio 3 (mesma ponte de produção), respeitando o nº de passos do registro (regime livre). */
async function genericGraphFromTraces(state, tracos, passosNoRegistro) {
  const stateFull = { ...state, ...tracos };
  const config = await extractGraphForgeConfig(stateFull);
  if (passosNoRegistro && (config.steps || []).length < passosNoRegistro) {
    const adv = tracos.advancedTrace?.solutions || [];
    const trace =
      adv.map((s) => (s.solutionTrace || []).filter((t) => t.isCorrect !== false)).sort((a, b) => b.length - a.length)[0] || [];
    const steps = trace.slice(0, passosNoRegistro).map((item, i) => ({
      index: item.step || i + 1,
      kc: item.kcUsed || config.kcs?.[0]?.id || "kc_default",
      action: item.action || "",
      result: item.result || "",
    }));
    return graphForge({
      ...config,
      steps,
      misconceptions: steps.map((_, i) => (config.misconceptions || [])[i] || []),
      hints: steps.map((_, i) => (config.hints || [])[i] || []),
    }).graph;
  }
  return graphForge(config).graph;
}

/**
 * Materializa um registro. Devolve { grafoMaterializado, problemaFixo, behaviorGraph, exercicio, telemetria }.
 * opts.fixarProblema (default true): injeta o problema do CTAT como requisito obrigatório do professor.
 */
export async function materializarRegistro(registro, envelopeA, opts = {}) {
  const tracos = registro.bruto?.tracos || {};
  if (!tracos.advancedTrace || !tracos.atRiskTrace) {
    throw new Error("registro sem bruto.tracos completos (advancedTrace/atRiskTrace) — não materializável");
  }
  const state = buildStateFromEnvelopeA(envelopeA, { exerciseId: registro.exercicio ?? registro.id });
  const genericGraph = await genericGraphFromTraces(state, tracos, (registro.grafo?.passos || []).length);
  const misconceptionCatalog = buildMisconceptionCatalog(tracos.atRiskTrace);

  const requisitoProblemaFixo =
    opts.fixarProblema === false
      ? ""
      : `Use EXATAMENTE este problema, sem alterar história, quantidades nem a resposta:
"${String(envelopeA.problem || "").trim()}"
Resposta correta final do problema: ${String(envelopeA.correctAnswer ?? "").trim()}.
Não crie outro cenário nem outros números. Todos os passos e respostas esperadas devem usar os valores deste enunciado.`;

  const state6 = {
    ...state,
    ...tracos,
    genericGraph,
    misconceptionCatalog,
    numProblems: opts.numProblems ?? 1,
    seedProblems: state.seedProblems,
    description: requisitoProblemaFixo,
  };
  const t0 = Date.now();
  const out6 = await agent6_exerciseGenerator(state6);
  const exercises = out6.exercises || [];
  const out7 = agent7_interfaceAdapter({ ...state6, exercises });
  const exercicio = (out7.exercises || [])[0] || null;
  const graph = exercicio?.behaviorGraph || null;
  if (!graph) throw new Error("agent 7 não produziu behaviorGraph");

  const traces = {
    misconceptions: (misconceptionCatalog || []).map((m) => ({
      id: m.id ?? m.misconceptionId,
      wrongAnswer: m.wrongAnswer,
      buggyRule: m.buggyRule || "",
      feedback: m.feedback || "",
      selection: "",
      action: "",
    })),
    hints: [],
  };
  const grafoMaterializado = montarGrafo(graph, traces);
  const problemaFixo = verificarProblemaFixo(envelopeA, exercicio, grafoMaterializado);
  return {
    grafoMaterializado,
    problemaFixo,
    behaviorGraph: graph,
    exercicio: {
      id: exercicio.id,
      statement: exercicio.statement,
      steps: (exercicio.steps || []).map((s) => ({
        id: s.id,
        instruction: s.instruction,
        expectedAnswer: s.expectedAnswer,
        renderAs: s.renderAs,
        kc: s.kc,
        nOptions: (s.options || []).length,
      })),
    },
    telemetria: {
      elapsedMs: Date.now() - t0,
      exerciciosGerados: exercises.length,
      passosGenericos: (genericGraph.nodes || []).filter((n) => n.type === "step").length,
      passosMaterializados: (graph.nodes || []).filter((n) => n.type === "step").length,
    },
  };
}
