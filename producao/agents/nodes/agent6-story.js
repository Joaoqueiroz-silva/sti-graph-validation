/**
 * agent6-story.js - Agent 6 Exercise Story Writer (Fan-Out Planner+Workers+Checker).
 * Extraido de pipeline-v8.js em 2026-04-22, preservado byte-a-byte.
 */

import { extractJson, callLLM, createLLM, getAgentConfig } from "../pipeline-core.js";
import { getWorkerSystemPrompt } from "../prompts/agent6-worker-prompt.js";
// import { buildComponentCatalogBrief } from "../patterns/interaction-catalog.js";
import { tryInferRichRenderForStep } from "../component-diversifier.js";
import { tStr } from "../i18n-strings.js";
import { misconceptionsFor } from "../misconceptions-db.js";
import { buildAdaptivePromptBlock } from "../../lib/student-profile.js";
import { createAgentLogger } from "../agent-stream-hub.js";
import { logger } from "../../lib/logger.js";
import { buildCatalogoRenderAs, buildRegrasDeComponente } from "./agent6-catalogo-renderas.js";
import { isSimpleInterface } from "../config/request-context.js";
import { detectDisciplineArea, contextScenariosForDiscipline } from "../discipline-config.js";
// 2026-05-04: catálogo de componentes interativos pra Agent6 gerar steps
// JÁ no formato que os componentes do registry esperam (anti-MC component-aware).
import { buildComponentCatalogBrief } from "../../lib/component-catalog-brief.js";
// 2026-05-23: catálogo enriquecido (SoT) — constraints+repairs+badExamples
import { buildLLMCatalog } from "../component-registry/index.js";
import { inferRequestedStepMinimum } from "../patterns/quality-gate.js";
// 2026-08-02 (auditoria de interface): interface-first. A modalidade de resposta
// de cada passo é decidida ANTES de o worker materializar, para que ele escreva
// a expectedAnswer em função do que a tela consegue produzir.
import { formatModalityContract, planProblemModalities } from "../response-modality-planner.js";
// 2026-07-18 (cobertura específica 7% + anti-inflação): behaviorMisconceptions
// do worker nascem aterrados (isGroundedDistractor) e a ROTULAGEM de option sem
// id só recebe id específico com evidência (catálogo casando por kc/stepIndex E
// wrongAnswer == value). O pad determinístico NUNCA emite id específico — a
// régua da PR #27 (distrator sintético NUNCA conta como específico) não é
// relaxada nem inflada aqui.
import {
  matchCatalogForStep,
  isGroundedDistractor,
  isSpecificMisconceptionId,
  MISC_ID_GRAMMAR_RE,
} from "../diagnostics/step-error-catalog.js";
// 2026-07-18 (anti-inflação): a MESMA chave "como o aluno vê" usada por
// isGroundedDistractor/agent9 — a evidência de aterramento compara
// wrongAnswer do catálogo com o value da option por esta normalização.
import { normalizeAnswerKey } from "../../lib/text-normalize.js";

function normalizeExpectedAnswerForLegacy(raw) {
  const value = String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ");
  if (!value) return "";
  // Pipe is used by some LLM responses as "partial|final"; keep the final atomic answer.
  if (value.includes("|")) {
    const parts = value
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean);
    return parts[parts.length - 1] || value;
  }
  // Commas are legitimate in decimal numbers and compound answers ("60, 2").
  return value;
}

function optionKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s*,\s*/g, ",")
    .replace(/\s+/g, " ");
}

function legacyDistractorsFor(expectedAnswer) {
  const ea = String(expectedAnswer ?? "").trim();
  const n = Number(ea.replace(",", "."));
  const out = [];
  const add = (v) => {
    const s = String(v).trim();
    if (s && optionKey(s) !== optionKey(ea) && !out.some((x) => optionKey(x) === optionKey(s)))
      out.push(s);
  };

  if (/^(verdadeiro|falso)$/i.test(ea)) {
    add(/^verdadeiro$/i.test(ea) ? "falso" : "verdadeiro");
  } else if (Number.isFinite(n) && /^-?\d+([.,]\d+)?$/.test(ea)) {
    for (const v of [n - 1, n + 1, n + 2, n - 2, n * 2, n + 3, Math.max(0, n - 3)]) {
      if (Number.isFinite(v) && v >= 0)
        add(Number.isInteger(v) ? v : v.toFixed(1).replace(".", ","));
      if (out.length >= 3) break;
    }
  } else if (/^-?\d+\s*\/\s*-?\d+$/.test(ea)) {
    const [num, den] = ea.split("/").map((s) => Number(String(s).trim()));
    if (Number.isFinite(num) && Number.isFinite(den) && den !== 0) {
      add(`${num + 1}/${den}`);
      if (num > 0) add(`${num - 1}/${den}`);
      add(`${num}/${den + 1}`);
      if (den > 2) add(`${num}/${den - 1}`);
    }
  } else if (ea.includes(",")) {
    const parts = ea
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts[0]) add(parts[0]);
    if (parts[1]) add(parts[1]);
    add("Apenas uma parte");
  }

  // 2026-04-24: par conceitual binário em vez de placeholders genéricos.
  if (out.length === 0) {
    const opp = _conceptualOppositeA6(ea);
    if (opp) add(opp);
  }
  return out.slice(0, 3);
}

function _conceptualOppositeA6(text) {
  const t = String(text || "")
    .trim()
    .toLowerCase();
  if (!t) return "";
  const PAIRS = [
    ["em movimento", "em repouso"],
    ["movimento", "repouso"],
    ["sim", "não"],
    ["sim", "nao"],
    ["verdadeiro", "falso"],
    ["certo", "errado"],
    ["maior", "menor"],
    ["mais", "menos"],
    ["aumenta", "diminui"],
    ["aumentou", "diminuiu"],
    ["subiu", "desceu"],
    ["sobe", "desce"],
    ["positivo", "negativo"],
    ["par", "ímpar"],
    ["par", "impar"],
    ["cheio", "vazio"],
    ["aberto", "fechado"],
    ["ganhou", "perdeu"],
    ["mesmo sentido", "sentido contrario"],
    ["mesmo sentido", "sentido contrário"],
    ["acelera", "freia"],
    ["presente", "ausente"],
    ["antes", "depois"],
  ];
  for (const [a, b] of PAIRS) {
    if (t === a) return _matchCaseA6(text, b);
    if (t === b) return _matchCaseA6(text, a);
  }
  return "";
}
function _matchCaseA6(source, target) {
  const s = String(source || "");
  if (!s) return target;
  if (s === s.toUpperCase()) return target.toUpperCase();
  if (s[0] === s[0].toUpperCase()) return target[0].toUpperCase() + target.slice(1);
  return target;
}

/**
 * 2026-04-24: safeFeedback contextual — varia o texto por idx + KC + tipo de
 * resposta esperada, pra evitar todos os distractors mostrarem o mesmo feedback
 * genérico ("Quase! Revise..."). 4 templates com pista pedagógica diferente.
 */
function safeFeedback(step, expectedAnswer, optionValue, idx = 0) {
  const kcLabel = String(step.kc || "")
    .replace(/^kc_/, "")
    .replace(/_/g, " ")
    .trim();
  const easHort = String(expectedAnswer || "")
    .trim()
    .slice(0, 40);
  const easNum = !isNaN(Number(easHort.replace(",", ".")));
  const ovNum = !isNaN(Number(String(optionValue).trim().replace(",", ".")));
  const bothNumeric = easNum && ovNum;

  const numericTemplates = [
    `Esse valor não bate. Refaça a conta com calma — observe ${kcLabel ? `'${kcLabel}'` : "cada operação"}.`,
    `Quase. Confira os sinais e a ordem das operações antes de calcular.`,
    `Não é por aí. Verifique se você usou todos os dados do enunciado.`,
    `Resultado próximo, mas o cálculo passou de uma etapa. Releia o passo a passo.`,
  ];
  const textTemplates = [
    `Não é essa. Pense novamente em ${kcLabel ? `'${kcLabel}'` : "o que o enunciado pede"} e tente outra alternativa.`,
    `Essa alternativa esconde uma confusão comum. Releia a pergunta e elimine o que não combina.`,
    `Quase lá. Volte ao trecho-chave do enunciado e veja qual ideia se encaixa.`,
    `Boa tentativa. Compare com a definição de ${kcLabel ? `'${kcLabel}'` : "o conceito do passo"} antes de seguir.`,
  ];
  const templates = bothNumeric ? numericTemplates : textTemplates;
  return templates[Math.abs(idx) % templates.length];
}

export function pickLegacyMisconception(
  step,
  catalog = [],
  idx = 0,
  expectedAnswer = "",
  optionValue = "",
  ctx = {}
) {
  // 2026-07-18 (anti-inflação): id específico SÓ com EVIDÊNCIA de aterramento —
  // entrada casada por kc/stepIndex (allowPoolFallback=false: o tier
  // catálogo-inteiro devolvia erros de OUTROS passos/problemas) cujo
  // wrongAnswer normalizado == value da option. Antes o id específico era
  // colado em QUALQUER valor (inclusive offsets sintéticos), inflando a
  // cobertura da PR #27 com diagnóstico falso.
  const candidates = matchCatalogForStep(catalog, {
    kc: step.kc,
    stepIndex: ctx.stepIndex,
    allowPoolFallback: false,
  });
  const usedIds = ctx.usedMisconceptionIds instanceof Set ? ctx.usedMisconceptionIds : new Set();
  const valueKey = normalizeAnswerKey(String(optionValue ?? ""));
  const grounded = valueKey
    ? candidates.find(
        (entry) =>
          // Nunca duplicar o mesmo misconceptionId em 2 options do step.
          !usedIds.has(entry.id) &&
          normalizeAnswerKey(String(entry.wrongAnswer ?? "")) === valueKey &&
          isGroundedDistractor({
            misconceptionId: entry.id,
            value: String(optionValue ?? ""),
            expectedAnswer,
            // 2026-07-19 (Trilha B): em step de ordenação/pareamento o
            // aterramento exige permutação exata dos mesmos itens.
            renderAs: step.renderAs,
          })
      )
    : null;
  if (grounded) {
    return {
      id: grounded.id,
      type: grounded.type || "procedural_error",
      feedback: grounded.feedback || grounded.description || "",
      // wrongAnswer concreto do catálogo — por construção == value da option.
      wrongAnswer: String(grounded.wrongAnswer ?? "").trim(),
      source: "at_risk_trace_misconception_catalog",
    };
  }
  const ea = String(expectedAnswer || "");
  const val = String(optionValue || "");
  const numericLike = /^-?\d+([.,]\d+)?$/.test(ea) && /^-?\d+([.,]\d+)?$/.test(val);
  const prefix = numericLike ? "misc_numeric_near" : "misc_text_confusion";
  return {
    id: `${prefix}_${step.kc || "step"}_${idx + 1}`,
    type: numericLike ? "procedural_error" : "conceptual_error",
    feedback: "",
    source: "deterministic_synthetic_distractor_fallback",
  };
}

export function ensureLegacyOptions(step, misconceptionCatalog = [], ctx = {}) {
  // 2026-04-27: ANTES de assumir MC, tenta inferir um componente que dá ao
  // aluno UMA FORMA REAL de responder diferente de clicar opção (digitar
  // número, arrastar pra ordenar, construir frase, etc). Se a inferência
  // der match, seta renderAs e SAI sem fazer MC distractors.
  if (!step.renderAs && step.expectedAnswer) {
    const inferred = tryInferRichRenderForStep(step, ctx);
    if (inferred && inferred.renderAs && inferred.renderAs !== "multiple_choice") {
      step.renderAs = inferred.renderAs;
      step.componentProps = { ...(step.componentProps || {}), ...inferred.componentProps };
      // Limpa options pra não confundir o renderer rich (exceto componentes
      // que ainda usam options como cards clicáveis: word_matcher, highlight_in_text)
      if (inferred.renderAs !== "word_matcher" && inferred.renderAs !== "highlight_in_text") {
        step.options = [];
      }
      return 0;
    }
  }

  const renderAs = step.renderAs || (Array.isArray(step.options) ? "multiple_choice" : "");
  const shouldHaveOptions =
    renderAs === "multiple_choice" ||
    renderAs === "image_choice" ||
    (!renderAs && Array.isArray(step.options));
  if (!shouldHaveOptions || !step.expectedAnswer) return 0;

  let fixes = 0;
  const ea = normalizeExpectedAnswerForLegacy(step.expectedAnswer);
  if (ea !== step.expectedAnswer) {
    step.expectedAnswer = ea;
    fixes++;
  }

  if (!Array.isArray(step.options)) step.options = [];
  step.options = step.options
    .map((o) => ({
      ...o,
      value: String(o.value ?? o.label ?? "").trim(),
      label: String(o.label ?? o.value ?? "").trim(),
    }))
    .filter((o) => o.value && o.value !== "undefined" && o.value !== "null");

  const seen = new Set();
  step.options = step.options.filter((o) => {
    const key = optionKey(o.value);
    if (seen.has(key)) {
      fixes++;
      return false;
    }
    seen.add(key);
    return true;
  });

  let correct = step.options.find(
    (o) => optionKey(o.value) === optionKey(ea) || optionKey(o.label) === optionKey(ea)
  );
  if (!correct) {
    correct = step.options.find((o) => o.isCorrect === true);
    if (correct) {
      correct.value = ea;
      correct.label = ea;
      fixes++;
    } else {
      correct = { value: ea, label: ea, isCorrect: true, feedback: tStr("feedback.correct") };
      step.options.unshift(correct);
      fixes++;
    }
  }

  // 2026-07-18 (anti-inflação): nunca duplicar o mesmo misconceptionId
  // específico em 2 options do step — o grafo roteia por id e a métrica da
  // PR #27 contaria o mesmo diagnóstico duas vezes.
  const usedMisconceptionIds = new Set(
    step.options.map((o) => o.misconceptionId).filter((id) => isSpecificMisconceptionId(id))
  );

  for (const o of step.options) {
    o.isCorrect = o === correct;
    if (!o.label) o.label = String(o.value);
    if (o.isCorrect) {
      o.feedback = tStr("feedback.correct");
      delete o.misconceptionId;
    } else {
      const misc = pickLegacyMisconception(
        step,
        misconceptionCatalog,
        step.options.indexOf(o),
        ea,
        o.value,
        { ...ctx, usedMisconceptionIds }
      );
      // 2026-08-05 (bateria História/Inglês): quando o feedback do worker é
      // rejeitado (vazio ou boilerplate curto), o código caía direto em
      // `misc.feedback` — que vem de pickLegacyMisconception buscando por
      // VALOR no catálogo do agent3b. Para frase livre (inglês, texto corrido)
      // esse match por valor quase nunca bate byte-a-byte, então `misc` cai no
      // ramo sintético (feedback vazio) e o resultado final era sempre
      // safeFeedback() — um de 4 templates genéricos — mesmo quando
      // `o.misconceptionId` JÁ estava setado, específico e correto (o worker
      // escreveu o diagnóstico certo, só não escreveu um feedback bom pra ele).
      // Busca primeiro pelo id JÁ resolvido antes de aceitar o resultado da
      // busca por valor, mais fraca.
      const feedbackDoIdJaResolvido = isSpecificMisconceptionId(o.misconceptionId)
        ? (Array.isArray(misconceptionCatalog) ? misconceptionCatalog : []).find(
            (entry) => entry?.id === o.misconceptionId
          )
        : null;
      // 2026-04-24: safeFeedback contextual — varia por idx + KC pra evitar
      // todos os distractors mostrarem o mesmo "Quase! Revise..." genérico.
      //
      // 2026-08-05: a regex de boilerplate era ampla demais — "Não é essa
      // ideia, porque..." (feedback substantivo em português começa muito de
      // "Não") caía fora só por começar com "nao". Estreitada para só pegar
      // boilerplate PURO/curto.
      o.feedback =
        o.feedback && !/^(errado|incorreto)[.,!]?\s*$/i.test(o.feedback.trim())
          ? o.feedback
          : feedbackDoIdJaResolvido?.feedback ||
            feedbackDoIdJaResolvido?.description ||
            misc.feedback ||
            safeFeedback(step, ea, o.value, step.options.indexOf(o));
      // 2026-07-18: NUNCA sobrescrever misconceptionId existente — id
      // específico vindo do worker é diagnóstico legítimo (régua da PR #27).
      // Para option SEM id, pickLegacyMisconception só devolve id específico
      // com evidência (wrongAnswer do catálogo == value); senão rótulo
      // genérico honesto (anti-inflação 2026-07-18).
      if (!o.misconceptionId) {
        o.misconceptionId = misc.id;
        o.graphDiagnosticSource = misc.source;
        if (isSpecificMisconceptionId(misc.id)) usedMisconceptionIds.add(misc.id);
      }
      if (!o.misconceptionType) o.misconceptionType = misc.type;
    }
  }

  // 2026-08-05 (geração "adição" do João rejeitada 3× seguidas por "distratores
  // genéricos 42%/87% > 40%" e "cobertura adaptativa 20%"): o passo JÁ CARREGA
  // os erros que o worker computou das buggyRules em `behaviorMisconceptions` —
  // específicos, aterrados (sanitizeWorkerBehaviorMisconceptions só deixa passar
  // entrada com id específico e wrongAnswer concreto ≠ gabarito) e com feedback
  // próprio escrito. Só que num step COM options eles são ROTA MORTA: o runtime
  // roteia pelas options, e o quality-gate só conta bm quando options.length===0
  // (regra anti-gaming de 2026-07-19). O código então preenchia as alternativas
  // que faltavam com offsets sintéticos — `misc_numeric_near_*`, genérico por
  // definição — e deixava o diagnóstico real inalcançável para o aluno.
  //
  // Padrão-raiz do repo de novo: o dado bom já existia e era descartado.
  // Promover a bm aterrada a alternativa visível é o OPOSTO de inflar: o valor
  // foi computado PARA ESTE passo (não é entry do catálogo do 3b, que pode ter
  // sido computada para os números de outro problema — essa continua proibida),
  // o aluno passa a poder ESCOLHER o erro previsto, e recebe o feedback
  // específico que já estava escrito.
  //
  // Em modo simples o efeito é estrutural: com TODO passo em multiple_choice, a
  // fatia de pads sintéticos crescia sozinha até estourar o teto do gate.
  for (const bm of Array.isArray(step.behaviorMisconceptions) ? step.behaviorMisconceptions : []) {
    if (step.options.filter((o) => !o.isCorrect).length >= 3) break;
    const errado = String(bm?.wrongAnswer ?? "").trim();
    const bmId = normalizeWorkerMisconceptionId(bm?.misconceptionId ?? bm?.id);
    if (!errado || optionKey(errado) === optionKey(ea)) continue;
    if (step.options.some((o) => optionKey(o.value) === optionKey(errado))) continue;
    if (!isSpecificMisconceptionId(bmId) || usedMisconceptionIds.has(bmId)) continue;
    step.options.push({
      value: errado,
      label: errado,
      isCorrect: false,
      misconceptionId: bmId,
      misconceptionType: bm?.misconceptionType || bm?.type || "procedural_error",
      graphDiagnosticSource: "worker_behavior_misconception_promoted",
      feedback: bm?.feedback || safeFeedback(step, ea, errado, step.options.length),
    });
    usedMisconceptionIds.add(bmId);
    fixes++;
  }

  // 2026-07-18 (anti-inflação): o pad determinístico NUNCA emite id específico
  // — o offset é sintético e não corresponde a nenhum erro do catálogo; colar
  // id real nele inflaria a cobertura da PR #27 com diagnóstico falso. Também
  // NÃO inserimos entry.wrongAnswer do catálogo como valor de pad: o valor pode
  // ter sido computado para os números de OUTRO problema. Cobertura específica
  // só nasce do caminho worker/3b (distratores computados) e dos
  // behaviorMisconceptions aterrados.
  for (const d of legacyDistractorsFor(ea)) {
    // 2026-07-19: pad sintético é ruído pedagógico — completa só até o mínimo
    // viável (2 erradas, = minUniqueDistractorsPerStep do gate); riqueza
    // diagnóstica real vem do worker/3b, não de offsets.
    if (step.options.filter((o) => !o.isCorrect).length >= 2) break;
    if (step.options.some((o) => optionKey(o.value) === optionKey(d))) continue;
    const padIdx = step.options.length;
    const numericLike = /^-?\d+([.,]\d+)?$/.test(ea) && /^-?\d+([.,]\d+)?$/.test(d);
    step.options.push({
      value: d,
      label: d,
      isCorrect: false,
      misconceptionId: `${numericLike ? "misc_numeric_near" : "misc_text_confusion"}_${step.kc || "step"}_${padIdx + 1}`,
      misconceptionType: numericLike ? "procedural_error" : "conceptual_error",
      graphDiagnosticSource: "deterministic_synthetic_distractor_fallback",
      feedback: safeFeedback(step, ea, d, padIdx),
    });
    fixes++;
  }

  if (step.options.length > 4) {
    const wrong = step.options.filter((o) => !o.isCorrect).slice(0, 3);
    step.options = [correct, ...wrong];
    fixes++;
  }
  step.renderAs = renderAs || "multiple_choice";
  return fixes;
}

/**
 * 2026-07-18 (cobertura específica 7%): normaliza um misconceptionId vindo do
 * worker LLM para a gramática oficial (^[A-Za-z0-9_.:-]+$): tira acentos,
 * espaços viram "_", o resto fora da gramática é descartado. NÃO inventa id —
 * se depois da limpeza sobrar vazio ou algo não-específico, o chamador filtra
 * via isGroundedDistractor.
 */
export function normalizeWorkerMisconceptionId(raw) {
  const id = String(raw ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_.:-]/g, "");
  return MISC_ID_GRAMMAR_RE.test(id) ? id : "";
}

/**
 * 2026-07-18 (cobertura específica 7%, spec §4): sanitiza os
 * step.behaviorMisconceptions que o worker LLM devolveu para steps de resposta
 * construída (sem options visíveis). Compliance de prompt é estocástica
 * (CLAUDE.md gotcha 4), então o contrato é garantido aqui:
 *  - só entram entradas ATERRADAS (isGroundedDistractor: id específico,
 *    wrongAnswer concreto sem placeholder, wrongAnswer ≠ expectedAnswer) —
 *    id genérico NUNCA entra em behaviorMisconceptions (na superfície MC
 *    visível ele ainda pode existir como rota, mas nunca conta como
 *    diagnóstico específico — régua da PR #27);
 *  - dedup por misconceptionId+wrongAnswer (mesma chave do diversifier);
 *  - SEM teto de quantidade — o grafo roteia TODAS as respostas erradas
 *    aterradas (princípio CTAT: quantos erros forem necessários);
 *  - shape final carrega os aliases (id/type) que _preserveBehaviorMisconceptions
 *    e sourceMisconceptions consomem downstream.
 */
export function sanitizeWorkerBehaviorMisconceptions(step, catalog = []) {
  if (!step || typeof step !== "object") return step;
  const raw = Array.isArray(step.behaviorMisconceptions) ? step.behaviorMisconceptions : [];
  if (raw.length === 0) {
    delete step.behaviorMisconceptions;
    return step;
  }
  const expectedAnswer = String(step.expectedAnswer ?? "").trim();
  const kept = [];
  const seen = new Set();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const id = normalizeWorkerMisconceptionId(entry.misconceptionId ?? entry.id);
    const wrongAnswer = String(entry.wrongAnswer ?? entry.value ?? "").trim();
    // 2026-07-19 (Trilha B — fronteira de ordenação): renderAs ativa o
    // aterramento ciente de sequência — em drag_to_order/sentence_builder/
    // matching_pairs etc., wrongAnswer só aterra se for permutação exata dos
    // mesmos itens (mesma serialização); item inventado/faltando é descartado.
    if (
      !isGroundedDistractor({
        misconceptionId: id,
        value: wrongAnswer,
        expectedAnswer,
        renderAs: step.renderAs,
      })
    ) {
      continue;
    }
    // 2026-07-19 (revisão anti-gaming da união): forma não basta — o id DEVE
    // existir no catálogo da geração (erros do 3b). Sem essa âncora, o worker
    // LLM (o ator estocástico que o gate audita) poderia fabricar ids
    // específicos-na-gramática sem lastro e diluir o denominador do gate de
    // genéricos. Catálogo vazio (3b falhou) ⇒ nenhum bm sobrevive: fail-closed.
    const catalogEntry = (Array.isArray(catalog) ? catalog : []).find((c) => c?.id === id);
    if (!catalogEntry) continue;
    const dedupKey = `${id}\u0000${optionKey(wrongAnswer)}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    // Enriquecimento pelo catálogo: type/feedback ausentes no output do worker
    // são resgatados da entrada do Agent 3b (catalogEntry garantido acima pela
    // âncora anti-gaming) — o diversifier descarta entradas sem type, e perder
    // um erro aterrado por campo cosmético seria regredir a cobertura.
    const type =
      String(entry.misconceptionType ?? entry.type ?? "").trim() ||
      catalogEntry?.type ||
      "conceptual_error";
    const feedback =
      String(entry.feedback ?? "").trim() ||
      catalogEntry?.feedback ||
      catalogEntry?.description ||
      "";
    kept.push({
      misconceptionId: id,
      id,
      misconceptionType: type,
      type,
      wrongAnswer,
      feedback,
      description: String(entry.description ?? "").trim() || catalogEntry?.description || "",
      severity: entry.severity || catalogEntry?.severity || "moderate",
      matcher: entry.matcher || "exact",
      source: "agent6_worker_behavior_misconceptions",
    });
  }
  if (kept.length > 0) step.behaviorMisconceptions = kept;
  else delete step.behaviorMisconceptions;
  return step;
}

function maskAnswerInHints(step) {
  const ea = String(step.expectedAnswer || "").trim();
  if (!ea || ea.length < 2 || !Array.isArray(step.hints)) return 0;
  let fixes = 0;
  const escaped = ea.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(escaped, "gi");
  for (let i = 0; i < step.hints.length; i++) {
    const h = step.hints[i];
    const msg = String(typeof h === "string" ? h : h?.message || "");
    if (msg && re.test(msg)) {
      const safe = msg.replace(re, "...");
      if (typeof h === "string") step.hints[i] = safe;
      else h.message = safe;
      fixes++;
    }
  }
  return fixes;
}

function gcd(a, b) {
  let x = Math.abs(Number(a) || 0);
  let y = Math.abs(Number(b) || 0);
  while (y) [x, y] = [y, x % y];
  return x || 1;
}

function lcm(a, b) {
  const x = Math.abs(Number(a) || 0);
  const y = Math.abs(Number(b) || 0);
  if (!x || !y) return 0;
  return (x * y) / gcd(x, y);
}

function parseFractionsFromText(text) {
  const out = [];
  const seen = new Set();
  const re = /(-?\d+)\s*\/\s*(-?\d+)/g;
  let match;
  while ((match = re.exec(String(text || "")))) {
    const num = Number(match[1]);
    const den = Number(match[2]);
    if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) continue;
    const key = `${num}/${den}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ num, den });
  }
  return out;
}

function fmtFraction(num, den) {
  return `${num}/${den}`;
}

function simplifyFraction(num, den) {
  const div = gcd(num, den);
  return { num: num / div, den: den / div };
}

function makeFallbackStep({ id, instruction, expectedAnswer, operation, kc, explanation, hints }) {
  const step = {
    id,
    instruction,
    expectedAnswer: String(expectedAnswer),
    operation,
    kc,
    explanation,
    hints: hints.map((message, idx) => ({
      level: idx + 1,
      type: ["conceptual", "procedural", "specific", "bottom_out"][idx] || "procedural",
      message,
    })),
    renderAs: "multiple_choice",
    audioNarration: instruction,
    options: [{ value: String(expectedAnswer), label: String(expectedAnswer), isCorrect: true }],
  };
  ensureLegacyOptions(step, []);
  maskAnswerInHints(step);
  return step;
}

/**
 * 2026-08-06 (auditoria divisão longa — caso real "87 ÷ 6"): o worker LLM
 * escreve a sequência de passos da divisão armada (quociente → produto →
 * subtração parcial) mas, quando o enunciado pede o RESTO ("quantas sobrarão?"),
 * frequentemente encerra sem computar o resto final — o STI nasce sem responder
 * a própria pergunta. Este reparo determinístico garante o passo final de resto
 * (D - q×d = r) sempre que: (a) o exercício tem divisão inteira com resto; e
 * (b) o enunciado pede o que sobra; e (c) nenhum step existente já o computa.
 */
export function buildLongDivisionRemainderStep(ex) {
  const steps = Array.isArray(ex?.steps) ? ex.steps : [];
  if (steps.length === 0) return null;

  let dividend = null;
  let divisor = null;
  for (const s of steps) {
    const op = String(s.operation || "").replace(/÷/g, "/");
    const m = op.match(/(-?\d+(?:[.,]\d+)?)\s*\/\s*(-?\d+(?:[.,]\d+)?)/);
    if (m) {
      const a = parseFloat(m[1].replace(",", "."));
      const b = parseFloat(m[2].replace(",", "."));
      if (Number.isInteger(a) && Number.isInteger(b) && b > 0 && a > 0) {
        dividend = a;
        divisor = b;
      }
      break;
    }
  }
  if (dividend === null || dividend % divisor === 0) return null;

  const story = String(ex.statement || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const asksRemainder = /\bsobr|\bresto\b|\bresta\b/.test(story);
  if (!asksRemainder) return null;

  const remainder = dividend % divisor;
  const target = String(remainder);
  const alreadyComputed = steps.some((s) => {
    if (String(s.expectedAnswer ?? "").trim() !== target) return false;
    const instr = String(s.instruction || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const sOp = String(s.operation || "").replace(/÷/g, "/");
    const product = Math.floor(dividend / divisor) * divisor;
    return (
      /\bsobr|\bresto\b|\bresta\b|\bfinal\b/.test(instr) &&
      (sOp.includes(`${product}`) || sOp.includes(`${dividend}`))
    );
  });
  if (alreadyComputed) return null;

  const quotient = Math.floor(dividend / divisor);
  const product = quotient * divisor;
  const kcs = (ex.stepIntents || []).map((s) => s.kc).filter(Boolean);
  const kc = kcs[steps.length] || kcs[kcs.length - 1] || "kc_divisao_resto";
  const messages = [
    `Depois de repartir ${dividend} em grupos de ${divisor}, verifique o que sobra.`,
    `Calcule ${quotient} × ${divisor} para saber quantas unidades foram repartidas.`,
    `Subtraia ${product} de ${dividend}.`,
    `O resto da divisão ${dividend} ÷ ${divisor} é ${remainder}.`,
  ];

  return {
    id: `step_${steps.length + 1}`,
    instruction: `Para finalizar a divisão ${dividend} ÷ ${divisor}, calcule o resto: quantas unidades sobram?`,
    expectedAnswer: String(remainder),
    operation: `${dividend} - ${product}`,
    kc,
    renderAs: "dynamic_spec",
    explanation: `Repartimos ${quotient} unidades em cada grupo (${quotient} × ${divisor} = ${product}). Do total de ${dividend}, sobram ${remainder} unidades — esse é o resto da divisão.`,
    hints: messages.map((message, idx) => ({
      level: idx + 1,
      type: ["conceptual", "procedural", "specific", "bottom_out"][idx],
      message,
    })),
    options: [],
    audioNarration: `Calcule o resto da divisão de ${dividend} por ${divisor}: quantas unidades sobram?`,
    acceptableVariations: [target],
  };
}

function buildFractionAdditionFallbackSteps(ex, state) {
  const text = `${ex?.statement || ""} ${state?.topic || ""}`;
  const fractions = parseFractionsFromText(text);
  const topicLooksFraction = /fra[cç][aãa]o|frac|denominador|numerador/i.test(text);
  if (fractions.length < 2 && !topicLooksFraction) return [];

  const a = fractions[0] || { num: 1, den: 3 };
  const b = fractions[1] || { num: 1, den: 4 };
  const commonDen = lcm(a.den, b.den) || a.den * b.den;
  const aFactor = commonDen / a.den;
  const bFactor = commonDen / b.den;
  const aEq = { num: a.num * aFactor, den: commonDen };
  const bEq = { num: b.num * bFactor, den: commonDen };
  const sum = { num: aEq.num + bEq.num, den: commonDen };
  const simplified = simplifyFraction(sum.num, sum.den);
  const kcs = (ex?.stepIntents || []).map((s) => s.kc).filter(Boolean);
  const kcAt = (i, fallback) => kcs[i] || fallback;

  return [
    makeFallbackStep({
      id: "step_1",
      instruction: `Identifique os denominadores de ${fmtFraction(a.num, a.den)} e ${fmtFraction(b.num, b.den)}.`,
      expectedAnswer: `${a.den},${b.den}`,
      operation: `denominadores(${fmtFraction(a.num, a.den)}, ${fmtFraction(b.num, b.den)})`,
      kc: kcAt(0, "kc_identificar_numerador_denominador"),
      explanation:
        "O denominador e o numero de baixo da fracao; ele indica em quantas partes iguais o todo foi dividido.",
      hints: [
        "Observe o numero de baixo em cada fracao.",
        "Leia cada fracao como parte de um mesmo todo dividido em partes iguais.",
        "Compare apenas os numeros abaixo da barra.",
        "Escreva primeiro o denominador da primeira fracao e depois o da segunda.",
      ],
    }),
    makeFallbackStep({
      id: "step_2",
      instruction: "Escolha o menor denominador comum para somar as fracoes.",
      expectedAnswer: commonDen,
      operation: `mmc(${a.den}, ${b.den})`,
      kc: kcAt(1, "kc_calcular_mmc"),
      explanation:
        "Para somar fracoes com denominadores diferentes, primeiro usamos um denominador comum.",
      hints: [
        "Procure um numero que apareca na tabuada dos dois denominadores.",
        "Liste alguns multiplos de cada denominador e encontre o primeiro em comum.",
        "Use o menor multiplo comum para manter a conta simples.",
        "Escolha o menor numero que serve para dividir em partes iguais nos dois casos.",
      ],
    }),
    makeFallbackStep({
      id: "step_3",
      instruction: `Transforme ${fmtFraction(a.num, a.den)} para denominador ${commonDen}.`,
      expectedAnswer: fmtFraction(aEq.num, aEq.den),
      operation: `${fmtFraction(a.num, a.den)} x ${aFactor}/${aFactor}`,
      kc: kcAt(2, "kc_transformar_fracoes_para_denominador_comum"),
      explanation:
        "Multiplicamos numerador e denominador pelo mesmo fator para obter uma fracao equivalente.",
      hints: [
        "A fracao deve continuar representando a mesma quantidade.",
        "Multiplique o denominador pelo fator que chega ao denominador comum.",
        "Use o mesmo fator no numerador para manter equivalencia.",
        "Escreva a fracao equivalente com o denominador comum.",
      ],
    }),
    makeFallbackStep({
      id: "step_4",
      instruction: `Transforme ${fmtFraction(b.num, b.den)} para denominador ${commonDen}.`,
      expectedAnswer: fmtFraction(bEq.num, bEq.den),
      operation: `${fmtFraction(b.num, b.den)} x ${bFactor}/${bFactor}`,
      kc: kcAt(3, "kc_transformar_fracoes_para_denominador_comum"),
      explanation: "A segunda fracao tambem precisa ter o mesmo denominador para poder ser somada.",
      hints: [
        "Use a mesma ideia da fracao anterior.",
        "Descubra qual fator leva o denominador ao denominador comum.",
        "Multiplique o numerador pelo mesmo fator.",
        "Escreva a segunda fracao equivalente com denominador comum.",
      ],
    }),
    makeFallbackStep({
      id: "step_5",
      instruction: "Agora some apenas os numeradores.",
      expectedAnswer: fmtFraction(sum.num, sum.den),
      operation: `${fmtFraction(aEq.num, aEq.den)} + ${fmtFraction(bEq.num, bEq.den)}`,
      kc: kcAt(4, "kc_adicionar_numeradores_fracoes_equivalentes"),
      explanation: "Com denominadores iguais, mantemos o denominador e somamos os numeradores.",
      hints: [
        "Os denominadores ja sao iguais.",
        "Mantenha o denominador comum.",
        "Some somente os numeros de cima.",
        "Escreva a soma como uma unica fracao.",
      ],
    }),
    makeFallbackStep({
      id: "step_6",
      instruction: "Simplifique a fracao final se for possivel.",
      expectedAnswer: fmtFraction(simplified.num, simplified.den),
      operation: `simplificar ${fmtFraction(sum.num, sum.den)}`,
      kc: kcAt(5, "kc_simplificar_fracao_resultante"),
      explanation:
        "Simplificar significa dividir numerador e denominador pelo mesmo divisor comum.",
      hints: [
        "Veja se numerador e denominador tem divisor comum.",
        "Divida os dois pelo mesmo numero.",
        "A fracao simplificada deve representar a mesma quantidade.",
        "Use a forma mais simples da fracao.",
      ],
    }),
  ];
}

export function alignDeterministicFallbackToBlueprint(steps, stepIntents) {
  const source = Array.isArray(steps) ? steps : [];
  const blueprint = Array.isArray(stepIntents) ? stepIntents : [];

  if (source.length < blueprint.length) {
    const error = new Error(
      `deterministic fallback solved ${source.length}/${blueprint.length} GraphForge slots; refusing unsolved placeholders`
    );
    error.code = "AGENT6_UNSOLVED_BLUEPRINT_SLOT";
    throw error;
  }

  return blueprint.map((intent, index) => {
    const step = source[index];
    const answer = String(step?.expectedAnswer ?? "").trim();
    if (!answer || /^(?:[—–-]|n\/?a|not applicable|tbd|placeholder)$/i.test(answer)) {
      const error = new Error(
        `deterministic fallback slot ${index + 1} has no concrete solved answer`
      );
      error.code = "AGENT6_UNSOLVED_BLUEPRINT_SLOT";
      throw error;
    }

    return {
      ...step,
      graphNodeId: intent.graphNodeId || step.graphNodeId || `step_${index + 1}`,
      kc: intent.kc || step.kc || "kc_default",
    };
  });
}

export function assertExactWorkerStepCount(steps, stepIntents, source = "worker") {
  const actual = Array.isArray(steps) ? steps.length : 0;
  const expected = Array.isArray(stepIntents) ? stepIntents.length : 0;
  if (actual !== expected) {
    const error = new Error(
      `${source} returned ${actual} steps; GraphForge blueprint requires exactly ${expected}`
    );
    error.code = "AGENT6_WORKER_STEP_COUNT_MISMATCH";
    throw error;
  }
  return steps;
}

function buildDeterministicFallbackSteps(ex, state) {
  const fractionSteps = buildFractionAdditionFallbackSteps(ex, state);
  if (fractionSteps.length === 0) {
    const error = new Error(
      "no deterministic solver is available for this exercise; generation must retry"
    );
    error.code = "AGENT6_NO_DETERMINISTIC_SOLVER";
    throw error;
  }

  return alignDeterministicFallbackToBlueprint(fractionSteps, ex.stepIntents);
}

export function buildGraphForgeBlueprint(state) {
  return (state?.genericGraph?.nodes || [])
    .filter((node) => node.type === "step")
    .map((node, index) => ({
      graphNodeId: node.id || `step_${index + 1}`,
      kc: node.knowledgeComponents?.[0] || state?.knowledgeComponents?.[index]?.id || "kc_default",
      cognitiveAction: node.description || `Passo ${index + 1}`,
    }));
}

/**
 * 2026-08-06 (STI "Capitais pelo Mundo", achado do professor): o blueprint do
 * GraphForge define ESTRUTURA (quantos passos, quais graphNodeId — o grafo do
 * runtime depende dessa bijecao, gotchas 1 e 2 do CLAUDE.md). Ele NAO deveria
 * definir PEDAGOGIA.
 *
 * O que acontecia: esta funcao aplicava o MESMO blueprint em todo exercicio e
 * sobrescrevia o `kc` que o planner tinha proposto por exercicio. Resultado
 * medido naquele STI: Agent 1 modelou 4 KCs distintos, o aluno recebeu 4
 * problemas exercitando SEMPRE os mesmos 2 ("Qual a capital da Australia?" 4x,
 * "Em que continente fica Canberra?" 4x) e 2 KCs nunca chegaram a ser
 * ensinados. O cenario mudava (cidade/campo/montanha/rio), a pergunta nao.
 *
 * Agora: estrutura vem do blueprint, KC vem do planner quando ele propos um KC
 * valido do dominio. A rede de cobertura abaixo e SEGURANCA, nao mecanismo — a
 * variedade deve nascer do planner (ver plannerSystemPrompt), nao de rotacao
 * deterministica.
 */
export function alignExerciseIntentsWithGraphForge(
  exercises,
  graphBlueprint,
  knowledgeComponents = []
) {
  if (!Array.isArray(graphBlueprint) || graphBlueprint.length === 0) return exercises || [];
  const idsValidos = new Set(
    (Array.isArray(knowledgeComponents) ? knowledgeComponents : [])
      .map((kc) => kc?.id)
      .filter(Boolean)
  );

  const alinhados = (exercises || []).map((exercise) => {
    const proposed = Array.isArray(exercise.stepIntents) ? exercise.stepIntents : [];
    return {
      ...exercise,
      stepIntents: graphBlueprint.map((slot, index) => {
        const kcProposto = proposed[index]?.kc;
        // Só aceita o KC do planner se ele existir no dominio modelado pelo
        // Agent 1 — LLM as vezes inventa id. Sem KC valido, o slot manda.
        const kc = idsValidos.has(kcProposto) ? kcProposto : slot.kc;
        return {
          graphNodeId: slot.graphNodeId,
          kc,
          description:
            proposed[index]?.description ||
            slot.cognitiveAction ||
            `Materializar ${kc} neste contexto`,
        };
      }),
    };
  });

  // Rede de cobertura: se sobrou KC do dominio que NENHUM exercicio exercita,
  // e existe slot ocupado por um KC ja repetido em outro exercicio, realoca.
  // Nao reordena nem muda a quantidade de passos (estrutura fica intacta).
  if (idsValidos.size > 0 && alinhados.length > 0) {
    const contagem = new Map();
    for (const ex of alinhados) {
      for (const intent of ex.stepIntents) {
        contagem.set(intent.kc, (contagem.get(intent.kc) || 0) + 1);
      }
    }
    const naoCobertos = [...idsValidos].filter((id) => !contagem.has(id));
    for (const kcOrfao of naoCobertos) {
      // procura, de tras pra frente, um slot cujo KC aparece mais de uma vez
      let realocado = false;
      for (let e = alinhados.length - 1; e >= 0 && !realocado; e--) {
        const intents = alinhados[e].stepIntents;
        for (let i = intents.length - 1; i >= 0; i--) {
          if ((contagem.get(intents[i].kc) || 0) > 1) {
            contagem.set(intents[i].kc, contagem.get(intents[i].kc) - 1);
            intents[i] = {
              ...intents[i],
              kc: kcOrfao,
              description: `Aplicar ${String(kcOrfao).replace(/^kc_/, "").replace(/_/g, " ")} neste contexto`,
            };
            contagem.set(kcOrfao, 1);
            realocado = true;
            break;
          }
        }
      }
    }
  }

  return alinhados;
}

/**
 * Regras de diversidade/estrutura injetadas no prompt do planner (Agent 6a)
 * quando ha um blueprint do GraphForge. So retorna algo se `graphNodeIds` nao
 * estiver vazio — sem blueprint, a ESTRUTURA (regra 4) nao faz sentido.
 *
 * Extraida de dentro de agent6_exerciseGenerator em 2026-08-07 para ficar
 * testavel sem precisar chamar LLM: as regras 9-10 (enredo com peso cognitivo
 * e complexidade estrutural escalando dentro do conjunto) nasceram de jogar um
 * STI real ate o fim e achar dois defeitos que nenhum gate media — enunciados
 * que so entregavam numeros prontos e os 4 problemas sempre com a mesma
 * complexidade estrutural (so a historia mudava). Ver [[educaoff-...]] em memoria.
 */
export function buildStructuralPlannerRules(graphNodeIds, numProblems) {
  const ids = Array.isArray(graphNodeIds) ? graphNodeIds : [];
  if (ids.length === 0) return "";
  // 2026-08-06: esta regra pedia "os mesmos graphNodeId/KC do blueprint" —
  // ou seja, mandava o planner repetir a MESMA competencia em todos os
  // exercicios. Combinada com "diversidade de CENARIOS", produzia
  // exatamente o defeito que o professor apontou: 4 problemas com cenario
  // diferente e a mesma pergunta ("Qual a capital da Australia?" 4x), com
  // KCs modelados pelo Agent 1 que nunca chegavam ao aluno. A ESTRUTURA
  // (quantidade, ordem, graphNodeId) continua obrigatoria porque o grafo do
  // runtime depende dela; a PEDAGOGIA (qual KC cada passo exercita) volta a
  // ser decisao do planner.
  return `\n4. ESTRUTURA OBRIGATORIA: cada exercicio deve conter exatamente ${ids.length} stepIntents, na mesma ordem e com os mesmos graphNodeId do blueprint (${ids.join(", ")}). Nao invente, remova ou reordene slots.
5. COMPETENCIAS DIFERENTES POR EXERCICIO (decisao sua, nao do blueprint): os exercicios NAO podem exercitar a mesma combinacao de KCs. Distribua os KCs disponiveis entre os exercicios de modo que TODOS sejam exercitados ao menos uma vez ao longo do tutor. Um tutor onde todo problema faz a mesma pergunta com outro cenario esta ERRADO — variar o cenario nao substitui variar a competencia. ATENCAO (2026-08-07): dificuldade diferente NAO desculpa a mesma sequencia de KCs — jogado ao vivo, um STI real teve o exercicio "easy" e o "hard" testando exatamente os mesmos 4 KCs, na mesma ordem, so com numeros maiores no dificil. Isso e o MESMO problema pedagogico duas vezes, mesmo com numeros diferentes. Ao escalar a dificuldade de um exercicio (regra 10), troque tambem PELO MENOS 1 KC do conjunto ou a ordem em que aparecem — nao so os valores.
6. PROGRESSAO COGNITIVA: os exercicios devem escalar em exigencia mental, nao so em numero. Comece por reconhecer/identificar e avance para comparar, inferir, decidir entre alternativas plausiveis e justificar. Pelo menos um exercicio deve exigir que o aluno RACIOCINE sobre o conteudo (comparar dois casos, escolher com criterio, explicar por que), nao apenas recuperar um fato memorizado.
7. CASO CONCRETO DIFERENTE POR EXERCICIO: cada exercicio deve tratar de um caso concreto DISTINTO (outro pais, outra substancia, outro conjunto de numeros, outro personagem em outra situacao). E ERRO grave dois exercicios usarem o mesmo caso — ex.: dois exercicios sobre a Bolivia/Sucre, ou dois com os mesmos valores. Liste mentalmente os casos antes de escrever e confirme que nao ha repeticao.
8. NENHUM PASSO PODE TER A MESMA RESPOSTA QUE OUTRO DO MESMO EXERCICIO: se dois stepIntents levariam o aluno a digitar/escolher a mesma coisa (ex.: "a qual pais pertence Quito?" e "qual pais corresponde a Quito?" — ambos respondem "Equador"), eles sao o MESMO passo escrito duas vezes. Reformule um deles para exigir outra operacao mental sobre o conteudo, ou troque o KC daquele slot.
9. ENREDO COM PESO COGNITIVO, NAO ROTULO DE NUMEROS (2026-08-07): jogado ao vivo, um STI real saiu com "statement" de UMA frase que ja entregava os dois numeros prontos e rotulados ("Camila organizou 63 caixas com 5 garrafas em cada uma") — decoracao, nao enredo; o aluno nunca precisa ler de verdade, so copiar dois numeros que ja estao na ordem certa. O statement deve ter PELO MENOS 2 frases que estabelecam a cena (quem, o que esta acontecendo, por que precisa calcular) ANTES de expor os numeros — nao abra a primeira frase ja com os operandos. A partir de ~9-10 anos (nao vale para pre_literate/early_reader, que exigem enunciado direto), pelo menos 1 dos ${numProblems} exercicios deve exigir que o aluno IDENTIFIQUE quais numeros do enunciado importam: inclua uma informacao numerica A MAIS que nao entra na conta (um preco, uma data, uma quantidade de outro item), deixando claro pelo contexto que ela e irrelevante — sem tornar ambiguo qual numero o worker deve usar na expectedAnswer.
10. COMPLEXIDADE ESTRUTURAL ESCALA DENTRO DO CONJUNTO (2026-08-07): quando os exercicios compartilham o mesmo procedimento (ex.: todos multiplicacao com reagrupamento), NAO repita a MESMA complexidade estrutural em todos so trocando a historia. Jogado ao vivo, os 4 exercicios de um STI real sempre tinham exatamente 1 reagrupamento e numeros da mesma ordem de grandeza (36x7, 58x4, 74x6, 63x5) — o aluno resolvia o mesmo problema 4 vezes com nomes diferentes. O campo "difficulty" tem que corresponder a uma diferenca REAL na estrutura: "hard" precisa de mais digitos, mais de um reagrupamento, ou um passo extra de raciocinio que "easy" nao exige — nao so um numero maior dentro da mesma estrutura. CUIDADO COM O ORCAMENTO FIXO DE STEPINTENTS (regra 4): se voce aumentar digitos, TODAS as colunas do algoritmo (unidades, dezenas, centenas se houver) precisam ficar cobertas dentro do MESMO numero de passos do blueprint. Jogado ao vivo, um exercicio pediu 503-278 (3 digitos) mas o worker parou na coluna das dezenas e nunca perguntou a coluna das centenas nem o resultado final — o exercicio tinha o mesmo numero de passos que um problema de 2 digitos e nao coube. Se aumentar digitos deixaria uma coluna sem passo correspondente, PREFIRA escalar pelo caminho do passo extra de raciocinio (verificar o resultado, comparar dois registros e decidir qual e consistente) em vez de aumentar digitos — esse caminho cabe no mesmo orcamento de passos sem deixar o algoritmo pela metade.`;
}

export async function agent6_exerciseGenerator(state) {
  logger.debug(
    { module: "agent6", phase: "start", strategy: "fan-out-v11" },
    "Exercise Generator (Story→Solver→Checker)"
  );
  const log = createAgentLogger(state.sessionId, "agent6_exercises");
  log.start({
    model: "gpt-4.1-mini",
    provider: "openai",
    role: "Exercise Story Writer",
    purpose:
      "Materializa o backbone do GraphForge em exercicios pedagogicos finais usando arquitetura Fan-Out",
  });
  const t0 = Date.now();

  const profile = state.interfaceSpec?.profile || "reader";
  const age = parseInt(state.ageGroup) || 10;
  const numProblems = Math.max(1, Math.min(10, Number(state.numProblems) || 3));
  const teacherRequirements = String(state.description || "")
    .trim()
    .slice(0, 4000);
  const requestedStepPlan = inferRequestedStepMinimum(teacherRequirements);
  const requestedStepsPerProblem = requestedStepPlan.minimum
    ? requestedStepPlan.perProblem
      ? requestedStepPlan.minimum
      : Math.ceil(requestedStepPlan.minimum / numProblems)
    : 0;
  const graphStepNodes = (state.genericGraph?.nodes || []).filter((node) => node?.type === "step");
  // GraphForge é a fonte estrutural; o requisito textual serve como proteção
  // adicional caso um estado legado/cacheado ainda traga um grafo mais curto.
  const targetStepIntents = Math.max(graphStepNodes.length, requestedStepsPerProblem);
  const teacherRequirementsBlock = teacherRequirements
    ? `\n\n=== REQUISITOS DO PROFESSOR (OBRIGATÓRIOS) ===\n${teacherRequirements}\nPreserve quantidade de passos, tipos de interação, dados, contexto e restrições. Não substitua uma interação pedida por múltipla escolha genérica.`
    : "";

  const blueprintIntentAt = (index) => {
    const graphNode = graphStepNodes[index];
    const kcId =
      graphNode?.knowledgeComponents?.[0] ||
      state.knowledgeComponents?.[index % Math.max(state.knowledgeComponents?.length || 0, 1)]
        ?.id ||
      "kc_default";
    const kc = (state.knowledgeComponents || []).find((item) => item?.id === kcId);
    return {
      kc: kcId,
      description:
        graphNode?.description ||
        `Aplicar ${kc?.name || String(kcId).replace(/^kc_/, "").replace(/_/g, " ")} no contexto específico deste exercício`,
    };
  };
  // 2026-04-25 v3: hardcode removido — modelo agora vem do tier system
  // (balanced default = DeepSeek V4 Pro via phase2.js; premium = Claude Opus 4.7
  // via tiers.js; custom = escolha do user). Logamos o que foi efetivamente
  // resolvido pra rastreabilidade.
  const cfg6 = getAgentConfig("agent6_story");
  logger.debug(
    { module: "agent6", phase: "config", provider: cfg6.provider, model: cfg6.model },
    "Exercise Generator config"
  );
  const llm = createLLM(cfg6);
  const workerMaxTokens = Number(process.env.STI_AGENT6_WORKER_MAX_TOKENS || 12000);
  const workerTimeoutMs = Number(process.env.STI_AGENT6_WORKER_TIMEOUT_MS || 180000);
  const workerCfg = getAgentConfig("agent6_worker");
  const workerLLM = createLLM({
    ...workerCfg,
    maxTokens: Math.min(Number(workerCfg.maxTokens || workerMaxTokens), workerMaxTokens),
    timeout: workerTimeoutMs,
  });
  const workerFallbackCfg = getAgentConfig("fallback_emergency");
  const workerFallbackLLM = createLLM({
    ...workerFallbackCfg,
    maxTokens: Math.min(Number(workerFallbackCfg.maxTokens || workerMaxTokens), workerMaxTokens),
    timeout: workerTimeoutMs,
  });
  logger.debug(
    {
      module: "agent6b",
      phase: "worker-config",
      provider: workerCfg.provider,
      model: workerCfg.model,
    },
    "Agent6 worker config"
  );
  logger.debug(
    {
      module: "agent6b",
      phase: "worker-fallback-config",
      provider: workerFallbackCfg.provider,
      model: workerFallbackCfg.model,
    },
    "Agent6 worker fallback config"
  );

  // V9: Detecta area didatica
  const area = state.interfaceSpec?.disciplineArea || detectDisciplineArea(state.discipline);
  const isExactDisc = ["matematica", "fisica", "quimica"].includes(area);
  const cenarios = contextScenariosForDiscipline(area).join(", ");

  // =========================================================
  // FASE 1: PLANNER (Agent 6a) - Gera a casca dos exercicios
  // =========================================================
  logger.debug(
    { module: "agent6a", phase: "planner-start", provider: cfg6.provider, model: cfg6.model },
    "Problem Planner"
  );

  const graphBlueprint = buildGraphForgeBlueprint(state);
  const graphBlueprintRule = buildStructuralPlannerRules(
    graphBlueprint.map((s) => s.graphNodeId),
    numProblems
  );

  const plannerInstRules = isExactDisc
    ? `Gere ${numProblems} exercicios CONCRETOS de ${area.toUpperCase()}.
REGRAS CRITICAS:
1. Escolha valores CONCRETOS (numeros reais). PROIBIDO usar {A}, {B}, {C} no output.
2. Dificuldade progressiva adaptada a faixa etaria (${age} anos).
3. DIVERSIDADE DE CENARIOS obrigatoria: cada exercicio deve ter "context" diferente (escolha de: ${cenarios}).${graphBlueprintRule}`
    : `Gere ${numProblems} exercicios sobre "${state.topic}" (disciplina: ${state.discipline}).
REGRAS CRITICAS:
1. PROIBIDO usar placeholders. Use conteudo REAL, FACTUAL e ESPECIFICO.
2. Dificuldade progressiva.
3. DIVERSIDADE DE CENARIOS: cada exercicio deve ter "context" diferente (${cenarios}).${graphBlueprintRule}`;
  const plannerStepRule =
    targetStepIntents > 0
      ? `\n4. Cada exercício DEVE conter pelo menos ${targetStepIntents} stepIntents distintos. Não funda ações cognitivas para reduzir essa quantidade.`
      : "";

  const plannerSystemPrompt = `Voce e um planejador arquitetural para Sistemas de Tutoria Inteligente.
${plannerInstRules}${plannerStepRule}

SUA TAREFA EXCLUSIVA:
Voce DEVE apenas PLANEJAR a "casca" dos ${numProblems} exercicios. VOCE NAO DEVE GERAR OS PASSOS DETALHADOS AINDA.
Para CADA exercicio, voce deve definir a sequencia logica de acoes que o aluno tomara, mapeando cada acao a UM dos Knowledge Components (KCs) fornecidos.
Cada stepIntent deve testar UMA acao cognitiva e produzir UMA resposta atomica. Se a situacao pedir duas quantidades, duas classificacoes ou duas justificativas, crie DOIS stepIntents separados.

Retorne JSON PURO neste exato formato:
{
  "tutorTitle": "Titulo do tutor (criativo e atrativo)",
  "exercises": [
    {
      "id": 1,
      "title": "Titulo curto e chamativo (ex: 'Pizza da Ana')",
      "statement": "Enunciado completo do problema com valores reais e historia contextual",
      "difficulty": "easy|medium|hard",
      "context": "fazenda",
      "variables": { "A": 3, "B": 2 },
      "stepIntents": [
        { "graphNodeId": "step_1", "kc": "kc_id_aqui", "description": "Descricao do que o aluno deve fazer neste passo (ex: 'Isolar o X', 'Identificar a capital')" }
      ]
    }
  ]
}`;

  const adaptiveBlock = buildAdaptivePromptBlock(state.adaptiveProfile);
  const plannerUserMessage = `Disciplina: ${state.discipline} | Topico: ${state.topic} | Idade: ${age}
${teacherRequirementsBlock}

=== KNOWLEDGE COMPONENTS (Mapeie seus stepIntents a partir daqui) ===
${JSON.stringify(state.knowledgeComponents || [], null, 2)}

=== BACKBONE COGNITIVO CONGELADO PELO GRAPHFORGE ===
${JSON.stringify(graphBlueprint, null, 2)}${adaptiveBlock}`;

  const rawPlanner = await callLLM(llm, plannerSystemPrompt, plannerUserMessage, {
    agent: "agent6_planner",
    sessionId: state.sessionId,
  });
  const parsedPlanner = extractJson(rawPlanner);
  // 2026-08-02 (merge): primeiro alinha os intents ao backbone do GraphForge
  // (#27-#33) e SO DEPOIS completa ate targetStepIntents. A ordem importa:
  // completar antes do alinhamento sobrescreveria intents especificos por pad.
  let exercisesBase = parsedPlanner.exercises || [];
  if (graphBlueprint.length > 0) {
    exercisesBase = alignExerciseIntentsWithGraphForge(
      exercisesBase,
      graphBlueprint,
      state.knowledgeComponents
    );
  }

  let repairedPlannerIntents = 0;
  exercisesBase = exercisesBase.map((exercise) => {
    const stepIntents = Array.isArray(exercise?.stepIntents) ? [...exercise.stepIntents] : [];
    while (stepIntents.length < targetStepIntents) {
      stepIntents.push(blueprintIntentAt(stepIntents.length));
      repairedPlannerIntents++;
    }
    return { ...exercise, stepIntents };
  });
  if (repairedPlannerIntents > 0) {
    logger.warn(
      {
        module: "agent6a",
        phase: "step-intents-completed",
        targetStepIntents,
        repairedPlannerIntents,
      },
      "Planner subentregou intents; backbone específico do GraphForge completou a sequência"
    );
  }
  const tutorTitle = parsedPlanner.tutorTitle || `${state.discipline}: ${state.topic}`;

  logger.info(
    {
      module: "agent6a",
      phase: "planner-done",
      exercises: exercisesBase.length,
      targetStepIntents,
      repairedPlannerIntents,
    },
    "Planner gerou casca"
  );

  // =========================================================
  // FASE 2: WORKERS (Agent 6b) - Fan-Out Paralelo
  // =========================================================
  logger.debug(
    { module: "agent6b", phase: "fan-out-start", workers: exercisesBase.length },
    "Disparando workers em paralelo"
  );

  const profileInstructions =
    profile === "pre_literate"
      ? `REGRAS RIGIDAS PARA pre_literate (4-5 anos):
- instruction MUITO CURTA: max 6 palavras, frase unica, sem virgulas.
- audioNarration: max 10 palavras, UMA pergunta direta, linguagem natural de crianca.
- PROIBIDO revelar a resposta na pergunta.
- PROIBIDO usar palavras como "ULTIMO", "PRIMEIRO", "QUAL NUMERO".
- renderAs: "image_choice" ou "multiple_choice" (Max 3 options com emojis grandes).
- option.value DEVE ser palavra simples ou numero (NUNCA emoji puro).`
      : profile === "early_reader"
        ? `REGRAS RIGIDAS PARA early_reader (6-7 anos):
- instruction CURTA: max 10 palavras, frase unica.
- audioNarration: max 15 palavras, UMA tarefa por step, frase clara.
- PROIBIDO revelar a resposta na pergunta.
- renderAs: "multiple_choice" ou "image_choice" (Max 4 options).`
        : isSimpleInterface()
          ? // 2026-08-05 (modo simples): mesmo desenho dos perfis pre_literate/
            // early_reader — catálogo NEM entra no prompt. O criador não marcou
            // "interface rica"; todo passo é seleção ou digitação, sempre
            // corrigível por comparação de texto.
            `REGRAS RIGIDAS PARA MODO SIMPLES (interface rica DESLIGADA pelo criador):
- Instrucoes normais (max 30 palavras).
- renderAs: APENAS "multiple_choice" (3-4 options, exatamente 1 isCorrect: true) ou "text" (aluno digita; expectedAnswer CURTO e digitavel, com acceptableVariations).
- PROIBIDO qualquer outro renderAs (nada de dynamic_spec, card_sort, memory_game, fraction_bar etc.).
- Se a resposta e um numero ou palavra curta → "text". Se e conceito/frase/classificacao → "multiple_choice" com distratores vindos dos ERROS REAIS previstos.

🎯 PIVOTAL STEPS (Chi 1989 — self-explanation):
Marque com "isPivotal": true os steps onde a COMPREENSAO conceitual e mais importante que o calculo (geralmente o 1o e o ultimo step de cada problema, OU steps de DECISAO chave). Esses steps acionarao self-explanation prompt automatico ao acertar.`
          : `- Instrucoes normais (max 30 palavras).
- ESCOLHA O renderAs CORRETO PELO TIPO DE RACIOCINIO. Multiple_choice eh fallback, NAO default.

${buildCatalogoRenderAs(state.discipline)}

${buildRegrasDeComponente(state.discipline)}

🎯 PIVOTAL STEPS (Chi 1989 — self-explanation):
Marque com "isPivotal": true os steps onde a COMPREENSAO conceitual e mais importante que o calculo (geralmente o 1o e o ultimo step de cada problema, OU steps de DECISAO chave). Esses steps acionarao self-explanation prompt automatico ao acertar.

- SEMPRE envie a estrutura "config" correta de acordo com o renderAs escolhido.
- Em ultimo caso, multiple_choice — mas PREFIRA componente rico quando o domain casar.`;

  const empiricalMisconceptionsBlock = (() => {
    // 2026-08-09: a chave do catálogo é SEM acento e a disciplina chega
    // acentuada da UI. Ver misconceptionsFor em agents/misconceptions-db.js.
    const known = misconceptionsFor(state.discipline, state.ageGroup);
    if (known.length === 0) return "Nenhuma misconception empirica catalogada.";
    return (
      "Use estas misconceptions REAIS:\n" +
      known.map((m) => "- " + m.kcPattern + ": " + m.description).join("\n")
    );
  })();

  const callWorkerJson = async ({
    llmClient,
    agentName,
    ex,
    workerUserMessage,
    provider,
    model,
  }) => {
    const rawWorker = await callLLM(llmClient, workerSystemPrompt, workerUserMessage, {
      agent: agentName,
      sessionId: state.sessionId,
    });
    if (!String(rawWorker || "").trim()) {
      throw new Error(`${provider}/${model} returned empty response`);
    }
    const parsedWorker = extractJson(rawWorker);
    let steps = Array.isArray(parsedWorker.steps) ? parsedWorker.steps : [];
    if (steps.length === 0) {
      throw new Error(`${provider}/${model} returned JSON without playable steps`);
    }
    assertExactWorkerStepCount(steps, ex.stepIntents, `${provider}/${model}`);
    // 2026-08-04: laço fechado no PASSO. Se o worker declarou uma interação e
    // deixou o payload vazio (`classify` com items:[] e categories:[]), o
    // componente nasceria vazio e o passo morreria sete minutos depois, no
    // sanitizer. Aqui pede-se de volta SÓ o que falta, com saída estruturada em
    // que a API recusa vazio. Nunca lança: se falhar, segue como está e a
    // cascata de reparos a jusante continua valendo.
    if (process.env.STI_DISABLE_PAYLOAD_GUARD !== "1") {
      try {
        const { completarPayloadFaltante } = await import("./agent6-payload-guard.js");
        await completarPayloadFaltante(steps, {
          llm: llmClient,
          sessionId: state.sessionId,
          contexto: {
            discipline: state.discipline,
            topic: state.topic,
            statement: ex?.statement || ex?.context || "",
          },
        });
      } catch (guardErr) {
        logger.warn(
          { module: "agent6-story", phase: "payload-guard-fail", err: guardErr.message },
          "Guarda de payload indisponível — seguindo sem ela"
        );
      }
    }
    // 2026-05-22 ROOT FIX: passa cada step pelo sanitizer de consistência ANTES
    // de devolver. Garante: renderAs↔options coerentes, expectedAnswer presente,
    // 1 opção isCorrect que bate exato com expectedAnswer, sem fallback junk.
    try {
      const { sanitizeStepsArray } = await import("../step-consistency-sanitizer.js");
      steps = sanitizeStepsArray(steps, { source: `agent6_worker_${agentName}` });
      assertExactWorkerStepCount(steps, ex.stepIntents, `${provider}/${model} after sanitize`);
    } catch (sanErr) {
      if (sanErr?.code === "AGENT6_WORKER_STEP_COUNT_MISMATCH") throw sanErr;
      // Se sanitizer falhar, continua com steps originais (não bloqueia)
      logger.warn(
        { module: "agent6-story", phase: "sanitize-fail", err: sanErr.message },
        "Sanitizer falhou — continuando com steps originais"
      );
    }
    assertExactWorkerStepCount(steps, ex.stepIntents, `${provider}/${model} final`);
    // Preserva a proveniência GraphForge mesmo após o worker materializar o
    // conteúdo. O KC/slot congelado vence eventual deriva do modelo.
    steps = steps.map((step, index) => {
      const intent = ex.stepIntents?.[index];
      if (!intent) return step;
      return {
        ...step,
        graphNodeId: intent.graphNodeId || step.graphNodeId || `step_${index + 1}`,
        kc: intent.kc || step.kc,
      };
    });
    // 2026-07-18 (cobertura específica 7%, spec §4): o prompt agora PEDE
    // behaviorMisconceptions em steps de resposta construída, mas compliance
    // é estocástica (CLAUDE.md gotcha 4) — aqui o contrato vira determinístico:
    // só sobrevivem entradas aterradas (id específico normalizado, wrongAnswer
    // concreto ≠ EA), dedup por id+wrongAnswer, SEM teto de quantidade.
    for (const step of steps) {
      sanitizeWorkerBehaviorMisconceptions(step, state.misconceptionCatalog || []);
    }
    return {
      ...ex,
      steps,
    };
  };

  // 2026-05-23: pré-computa catálogo enriquecido com constraints+repairs
  // Roda 1x por geração (todos os workers compartilham). Falha silenciosa: se
  // buildLLMCatalog falhar, Agent 6 segue com o brief legacy.
  let enrichedCatalog = null;
  // 2026-08-05 (modo simples): o catálogo enriquecido só oferece componentes
  // ricos — no modo simples ele NEM entra no prompt (coerência: oferecer e
  // proibir ao mesmo tempo é compliance de cara ou coroa).
  if (!isSimpleInterface()) {
    try {
      enrichedCatalog = await buildLLMCatalog({ discipline: state.discipline });
    } catch (catalogErr) {
      enrichedCatalog = null;
    }
  }

  const workerSystemPrompt = getWorkerSystemPrompt({
    isExactDisc,
    discipline: state.discipline,
    buildComponentCatalogBrief,
    profileInstructions,
    enrichedCatalog,
    simpleInterface: isSimpleInterface(),
  });

  const workerPromises = exercisesBase.map(async (ex, index) => {
    // Interface-first: a modalidade sai das políticas de affordance que o
    // quality-gate já usava para REPROVAR no fim — aqui elas DIRIGEM a geração.
    // (modo simples: o contrato de modalidade empurra superfícies ricas —
    // não entra; as regras do modo simples no system prompt decidem.)
    const planosModalidade = isSimpleInterface()
      ? []
      : planProblemModalities({
          steps: (ex.stepIntents || []).map((slot) => ({
            kc: slot?.kc,
            stepIntent: slot?.description,
          })),
          topic: state.topic,
          discipline: state.discipline,
        });
    const blocoModalidade = planosModalidade.length
      ? `\n=== CONTRATO DE INTERFACE POR PASSO (OBRIGATORIO) ===
Cada passo abaixo JA TEM a modalidade de resposta decidida. Materialize DENTRO dela:
a expectedAnswer e o que o aluno PRODUZ naquela superficie, nao a resposta de uma
pergunta dissertativa. Se a resposta que voce pensou nao cabe na modalidade do passo,
reescreva o passo — nao troque a modalidade.
${planosModalidade.map((plano, i) => formatModalityContract(plano, i + 1)).join("\n")}\n`
      : "";

    const workerUserMessage = `Gere os DETALHES (steps, hints, options) APENAS para este exercicio (Exercicio ${index + 1}):
Titulo: ${ex.title}
Enunciado: ${ex.statement}
Variaveis: ${JSON.stringify(ex.variables)}
Contexto: ${ex.context}

=== STEP INTENTS (KCs a testar) ===
${JSON.stringify(ex.stepIntents || [])}
${blocoModalidade}

=== KNOWLEDGE COMPONENTS ===
${JSON.stringify(state.knowledgeComponents || [], null, 2)}

=== CATALOGO DE MISCONCEPTIONS (do Agent 3b) ===
${JSON.stringify(state.misconceptionCatalog || [], null, 2)}

=== MISCONCEPTIONS EMPIRICAS ===
${empiricalMisconceptionsBlock}${teacherRequirementsBlock}

Materialize TODOS os ${ex.stepIntents?.length || 0} stepIntents acima, um por step, mantendo as interações exigidas pelo professor.
${adaptiveBlock}`;

    try {
      return await callWorkerJson({
        llmClient: workerLLM,
        agentName: "agent6_worker_" + index,
        ex,
        workerUserMessage,
        provider: workerCfg.provider,
        model: workerCfg.model,
      });
    } catch (e) {
      logger.warn(
        { module: "agent6b", phase: "worker-fail", exId: ex.id, err: e.message },
        "Worker primario falhou; tentando fallback"
      );
      try {
        const fallbackResult = await callWorkerJson({
          llmClient: workerFallbackLLM,
          agentName: "agent6_worker_fallback_" + index,
          ex,
          workerUserMessage,
          provider: workerFallbackCfg.provider,
          model: workerFallbackCfg.model,
        });
        logger.warn(
          {
            module: "agent6b",
            phase: "worker-fallback-success",
            exId: ex.id,
            provider: workerFallbackCfg.provider,
            model: workerFallbackCfg.model,
            steps: fallbackResult.steps.length,
          },
          "Worker recuperado com fallback"
        );
        return fallbackResult;
      } catch (fallbackErr) {
        logger.error(
          {
            module: "agent6b",
            phase: "worker-fallback-fail",
            exId: ex.id,
            primaryErr: e.message,
            err: fallbackErr.message,
          },
          "Worker fallback falhou"
        );
      }
      const fallbackSteps = buildDeterministicFallbackSteps(ex, state);
      if (fallbackSteps.length > 0) {
        logger.warn(
          {
            module: "agent6b",
            phase: "fallback-deterministic",
            exId: ex.id,
            steps: fallbackSteps.length,
          },
          "Fallback deterministico aplicado"
        );
      }
      return { ...ex, steps: fallbackSteps }; // Evita tutor vazio quando o LLM retorna JSON truncado
    }
  });

  const exercisesCompleted = await Promise.all(workerPromises);
  const exercises = exercisesCompleted.filter((e) => e.steps && e.steps.length > 0);

  logger.debug(
    { module: "agent6c", phase: "checker-start", workers: exercises.length },
    "Workers concluidos — Consistency Checker"
  );

  // ==============================
  // STEP 6c - Consistency Checker (DETERMINISTIC)
  // Fix instructions, options, audioNarration
  // ==============================
  let consistencyFixes = 0;
  for (const ex of exercises) {
    for (const [stepPosition, step] of (ex.steps || []).entries()) {
      if (step.expectedAnswer !== undefined && step.expectedAnswer !== null) {
        const normalizedEa = normalizeExpectedAnswerForLegacy(step.expectedAnswer);
        if (normalizedEa !== String(step.expectedAnswer)) {
          step.expectedAnswer = normalizedEa;
          consistencyFixes++;
        }
      }

      if (!step.instruction || String(step.instruction).trim() === "") {
        if (step.audioNarration && String(step.audioNarration).trim() !== "") {
          step.instruction = step.audioNarration;
          consistencyFixes++;
        } else if (ex.statement) {
          step.instruction = ex.statement;
          consistencyFixes++;
        }
      }

      // 2026-07-18: stepIndex 1-based — mesmo referencial do campo `step` do
      // stepDiagnostics do Agent 3b, que pickLegacyMisconception usa como 2º
      // critério (depois de kc) na EVIDÊNCIA de rotulagem de option sem id
      // (anti-inflação: o pad em si nunca recebe id específico).
      consistencyFixes += ensureLegacyOptions(step, state.misconceptionCatalog || [], {
        stepIndex: stepPosition + 1,
      });
      consistencyFixes += maskAnswerInHints(step);

      // FIX: Exactly 1 option with isCorrect=true matching expectedAnswer
      if (
        (step.renderAs === "multiple_choice" ||
          step.renderAs === "image_choice" ||
          (!step.renderAs && step.options)) &&
        step.options &&
        step.options.length > 0 &&
        step.expectedAnswer !== undefined
      ) {
        const expectedStr = optionKey(step.expectedAnswer);

        for (const opt of step.options) {
          opt.isCorrect = false;
        }

        let exactMatch = step.options.find((o) => optionKey(o.value) === expectedStr);
        if (!exactMatch) {
          exactMatch = step.options.find((o) => optionKey(o.label) === expectedStr);
        }

        if (exactMatch) {
          exactMatch.isCorrect = true;
        } else {
          step.options[0].value = step.expectedAnswer;
          step.options[0].label = String(step.expectedAnswer);
          step.options[0].isCorrect = true;
          step.options[0].misconceptionId = null;
          consistencyFixes++;
        }
      }
    }

    // 2026-08-06 (auditoria divisão longa): garante o passo final de resto
    // quando o enunciado pergunta "quanto sobra" e a sequência do worker não
    // computou o resto (caso real: 87 ÷ 6 terminava em 8 - 6 = 2).
    const remainderStep = buildLongDivisionRemainderStep(ex);
    if (remainderStep) {
      ex.steps.push(remainderStep);
      consistencyFixes++;
    }
  }

  const elapsedA6 = Date.now() - t0;
  logger.info(
    {
      module: "agent6",
      phase: "done",
      exercises: exercises.length,
      elapsedMs: elapsedA6,
      consistencyFixes,
    },
    "Exercicios materializados via FAN-OUT"
  );
  log.end({
    durationMs: elapsedA6,
    summary: `${exercises.length} exercicios materializados via Fan-Out`,
    exercises: exercises.length,
    consistencyFixes,
  });

  return {
    exercises,
    tutorTitle,
    agentLogs: [
      {
        agent: "agent6_story_fanout",
        count: exercises.length,
        consistencyFixes,
        elapsed: elapsedA6,
      },
    ],
  };
}
