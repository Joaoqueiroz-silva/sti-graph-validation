/**
 * step-consistency-sanitizer.js — GATE de consistência aplicado a CADA step
 * gerado por qualquer agente (agent6-story worker, agent6-followup, agent6-scaffold,
 * agent6-alternative-strategy).
 *
 * Garante INVARIANTES estruturais antes de qualquer step ir pro frontend:
 *
 *  1. renderAs+options coerentes:
 *     - Se renderAs é componente ESPECIAL (fraction_bar, number_line, etc) e
 *       options contém valores GENÉRICOS de fallback (verdadeiro/falso/ninguno),
 *       OU CONVERTE renderAs pra "multiple_choice" + gera distractors numéricos,
 *       OU REMOVE options (deixa o componente especial validar diretamente).
 *
 *  2. Pelo menos UMA option marcada isCorrect:true cujo value === expectedAnswer.
 *     Se não houver, INJETA a opção correta. Se options vazias mas renderAs precisa,
 *     gera 3 distractors plausíveis baseados em expectedAnswer.
 *
 *  3. expectedAnswer obrigatório e não-vazio. Se faltar, marca step como inválido
 *     (caller decide: regenerar ou descartar).
 *
 *  4. Para componentes especiais, expectedAnswer deve estar no formato que o
 *     componente sabe interpretar (fraction_bar: "n/d"; numeric_keypad: número;
 *     clock_face: "hh:mm"; etc).
 *
 * NOTE: Não substitui o agent9_review (que faz revisão pedagógica via LLM) — esse
 * sanitizer é determinístico, rápido (<1ms por step), e roda SEMPRE.
 *
 * Criado em 2026-05-22 — root fix bug "STIs com respostas inconsistentes".
 */

import { logger } from "../lib/logger.js";
import {
  SPECIAL_INPUT,
  NEUTRAL_INPUT,
  FREE_INPUT,
  TYPED_ENTRY_RENDER_AS,
} from "../shared/component-sets.js";
// 2026-08-06: régua única de "o aluno consegue digitar este gabarito?" — a
// MESMA que o quality-gate usa para reprovar. Ver bloco 2.4 abaixo.
import { typedAnswerObstacle } from "../shared/answer-shape.js";
// 2026-07-19 (EA canônico de sequência): fonte única do split/trim/join — o
// mesmo módulo que define a régua de aterramento de sequência da Trilha B.
import {
  canonicalizeSequenceStepAnswers,
  isGroundedDistractor,
} from "./diagnostics/step-error-catalog.js";
// 2026-08-06: o modo simples precisa de ENFORCEMENT, não só de regra no prompt.
// Ver bloco 2.35 abaixo.
// 2026-08-16 (caderno F4): isWorksheetInterface gateia o bloco 2.37
// (drag_order legado -> drag_to_order) so no modo caderno.
import { isSimpleInterface, isWorksheetInterface } from "./config/request-context.js";

// As DUAS únicas superfícies do modo simples — as mesmas que o prompt do worker
// autoriza em `agent6-story.js` ("APENAS multiple_choice ou text"). Manter esta
// lista alinhada com aquele prompt: oferecer uma e exigir outra é o defeito.
const SIMPLE_INTERFACE_RENDER_AS = new Set(["multiple_choice", "text"]);

// Valores que indicam distractors fallback (não fazem sentido pedagógico)
const FALLBACK_VALUES = new Set([
  "verdadeiro",
  "falso",
  "true",
  "false",
  "v",
  "f",
  "ninguno",
  "los dos",
  "no corresponde",
  "ningún",
  "ningun",
  "sim",
  "não",
  "nao",
  "yes",
  "no",
  "nenhuma das anteriores",
  "todas as anteriores",
  "todas",
  "nenhuma",
  "n/a",
  "n.a.",
  "na",
  "outro",
  "outra",
  "otra",
  "other",
  "opção 1",
  "opcao 1",
  "opção a",
  "opcao a",
  "opcao 2",
  "opção b",
  "a",
  "b",
  "c",
  "d",
]);

// renderAs que precisam de input específico do componente (não compatíveis com opções genéricas)
const SPECIAL_RENDERAS = SPECIAL_INPUT; // fonte única: backend/shared/component-sets.js

// renderAs "neutros" que aceitam options simples (text/number)
const _NEUTRAL_RENDERAS = NEUTRAL_INPUT; // fonte única: backend/shared/component-sets.js

// renderAs que aceitam VALOR LIVRE (não usa options[]), validação direta com expectedAnswer
const FREE_INPUT_RENDERAS = FREE_INPUT; // fonte única: backend/shared/component-sets.js

function _normalize(v) {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function _isFallbackValue(v) {
  return FALLBACK_VALUES.has(_normalize(v));
}

function _isNumeric(v) {
  const s = String(v ?? "").trim();
  return s !== "" && /^-?\d+([.,]\d+)?$/.test(s);
}

function _isFraction(v) {
  return /^-?\d+\s*\/\s*-?\d+$/.test(String(v ?? "").trim());
}

/**
 * Gera 3 distractors plausíveis baseados em expectedAnswer.
 * - Se numérico: ±1, ±2, ±halfvalue
 * - Se fração "a/b": (a+1)/b, a/(b+1), (a-1)/b
 * - Se texto: só pares binários óbvios (sim/não, V/F). LIMITAÇÃO conhecida:
 *   distrator de texto livre exige semântica (misconception-based) — quem cobre
 *   isso é o agent9/worker; este fallback determinístico não tenta inventar.
 */
function _generateDistractors(expectedAnswer) {
  const ea = String(expectedAnswer ?? "").trim();
  if (!ea) return [];
  const out = new Set();

  // Numérico
  if (_isNumeric(ea)) {
    const n = parseFloat(ea.replace(",", "."));
    if (!isNaN(n)) {
      const candidates = [n + 1, n - 1, n + 2, n - 2, Math.max(0, Math.floor(n / 2)), n * 2];
      for (const c of candidates) {
        if (c < 0) continue;
        const s = Number.isInteger(c) ? String(c) : c.toFixed(1).replace(".", ",");
        if (_normalize(s) !== _normalize(ea)) out.add(s);
        if (out.size >= 3) break;
      }
    }
  }
  // Fração
  else if (_isFraction(ea)) {
    const [num, den] = ea.split("/").map((x) => parseInt(x.trim()));
    if (Number.isFinite(num) && Number.isFinite(den) && den !== 0) {
      const candidates = [
        `${num + 1}/${den}`,
        `${num}/${den + 1}`,
        `${Math.max(0, num - 1)}/${den}`,
        `${num}/${Math.max(1, den - 1)}`,
      ];
      for (const c of candidates) {
        if (_normalize(c) !== _normalize(ea)) out.add(c);
        if (out.size >= 3) break;
      }
    }
  }
  // Texto curto — par binário (sim/não, V/F)
  else if (/^(sim|s[ií]m?)$/i.test(ea)) out.add("Não");
  else if (/^(n[aã]o|no)$/i.test(ea)) out.add("Sim");
  else if (/^verdadeiro$/i.test(ea)) out.add("Falso");
  else if (/^falso$/i.test(ea)) out.add("Verdadeiro");

  return [...out].slice(0, 3);
}

/**
 * 2026-08-16 (caderno F4, tarefa 6): drag_order legado -> drag_to_order.
 * Muta o step in-place e devolve uma string curta descrevendo a conversao,
 * ou null quando NAO e seguro converter (o step fica como drag_order e o
 * guard do registro decide, exatamente como hoje).
 *
 * Contratos envolvidos:
 *  - drag_order (VisualInputs): items em step.config.items ou componentProps
 *    .items (string ou {value,label,text}); EA lista TODOS os itens na ordem,
 *    separados por ",", ";", "->" ou "→".
 *  - drag_to_order (DragToOrder.jsx): componentProps.items 3..10 pecas
 *    ({id,label,value} ou string, label <= 80); o runtime emite
 *    items.map(v => v.value ?? v.label).join(","), entao o EA canonico e a
 *    lista de VALUES na ordem correta unida por virgula sem espaco.
 * Exportada so para teste (prefixo _).
 */
export function _dragOrderParaDragToOrder(step) {
  const cp =
    step.componentProps && typeof step.componentProps === "object" ? step.componentProps : {};
  const cfg = step.config && typeof step.config === "object" ? step.config : {};
  const brutos = Array.isArray(cp.items) ? cp.items : Array.isArray(cfg.items) ? cfg.items : [];
  if (brutos.length < 3 || brutos.length > 10) return null;

  const rotulos = brutos.map((item) =>
    typeof item === "string"
      ? item.trim()
      : String(item?.label ?? item?.value ?? item?.text ?? "").trim()
  );
  if (rotulos.some((r) => !r || r.length > 80)) return null;
  const chaves = rotulos.map(_normalize);
  if (new Set(chaves).size !== chaves.length) return null;

  const tokens = String(step.expectedAnswer ?? "")
    .split(/\s*(?:,|;|->|→)\s*/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (tokens.length !== rotulos.length) return null;
  const ordem = tokens.map((t) => chaves.indexOf(_normalize(t)));
  if (ordem.some((i) => i < 0) || new Set(ordem).size !== ordem.length) return null;

  // Preserva um id/value ja existente na peca; senao value = label (e o que
  // o DragToOrder emite, e o que o EA canonico precisa casar).
  const pecas = brutos.map((item, i) => {
    const label = rotulos[i];
    const base = item && typeof item === "object" ? item : {};
    const value = String(base.value ?? label).trim() || label;
    const id = String(base.id ?? `peca_${i + 1}`);
    return { id, label, value };
  });
  const eaAntes = String(step.expectedAnswer ?? "");
  const eaCanonico = ordem.map((i) => pecas[i].value).join(",");

  step.renderAs = "drag_to_order";
  if (step.componentId === "drag_order") step.componentId = "drag_to_order";
  step.componentProps = { ...cp, items: pecas };
  if (Array.isArray(cfg.items)) {
    const { items: _ignorado, ...restoConfig } = cfg;
    if (Object.keys(restoConfig).length > 0) step.config = restoConfig;
    else delete step.config;
  }
  step.expectedAnswer = eaCanonico;
  const variacoes = new Set([eaCanonico, eaAntes.trim()].filter(Boolean));
  for (const v of Array.isArray(step.acceptableVariations) ? step.acceptableVariations : []) {
    if (typeof v === "string" && v.trim()) variacoes.add(v.trim());
  }
  step.acceptableVariations = [...variacoes];
  return `${pecas.length}_pecas,ea="${eaCanonico}"`;
}

/**
 * Sanitiza UM step. Retorna { step, changes: [...], valid: bool }.
 *
 * @param {object} step - step input mutável (será modificado in-place)
 * @param {object} [ctx] - { logger?, source? } pra trace
 */
export function sanitizeStep(step, ctx = {}) {
  const src = ctx.source || "unknown";
  const changes = [];

  if (!step || typeof step !== "object") {
    return { step: null, changes: ["null_step"], valid: false };
  }

  // 1. expectedAnswer obrigatório
  let ea = String(step.expectedAnswer ?? "").trim();
  if (!ea) {
    return { step, changes: ["no_expected_answer"], valid: false };
  }
  step.expectedAnswer = ea;

  // 2. renderAs default
  if (!step.renderAs) {
    step.renderAs =
      Array.isArray(step.options) && step.options.length > 0
        ? "multiple_choice"
        : _isNumeric(ea)
          ? "numeric_keypad"
          : "text";
    changes.push(`renderAs_default:${step.renderAs}`);
  }

  // 2.35 (2026-08-06) MODO SIMPLES É CONTRATO, NÃO SUGESTÃO.
  //
  // Achado ao vivo (tutor CBTZHW, gerado pelo João sem marcar "interface rica"):
  // 5 passos saíram com renderAs "dynamic_spec" e um spec de MOLDE
  // (`createdBy: "seed"`) — um gráfico com eixos x/y e uma barra rotulada
  // "subtração" numa conta de 10 - 6. Nada daquilo representava o conteúdo.
  //
  // Os guardas de modo simples ESTAVAM todos funcionando (logs da geração:
  // ui-designer "skip-simple-interface", router "skip-simple-interface", e o
  // spec-generator por LLM sequer foi chamado). O prompt do worker também já
  // PROIBIA explicitamente: "PROIBIDO qualquer outro renderAs (nada de
  // dynamic_spec...)". O buraco é o gotcha 4 do CLAUDE.md: compliance de prompt
  // é ESTOCÁSTICA e a regra tinha só o lado (a), a regra forte — faltava (b),
  // o enforcement. O worker desobedeceu e ninguém corrigiu, então o passo
  // seguia rico e algum reparo de baixo preenchia o spec com o molde
  // determinístico.
  //
  // Aqui o modo simples vira invariante: quem escolheu interface simples
  // recebe SÓ seleção ou digitação. Isto não é código determinístico ocupando
  // o lugar do agente — é honrar a escolha explícita do criador, que o agente
  // não tinha direito de reverter. O conteúdo (enunciado, gabarito, erros
  // previstos) continua sendo inteiro do LLM; só a SUPERFÍCIE é coagida.
  if (isSimpleInterface() && !SIMPLE_INTERFACE_RENDER_AS.has(String(step.renderAs || ""))) {
    const anterior = step.renderAs;
    const temAlternativas =
      Array.isArray(step.options) &&
      step.options.length >= 2 &&
      step.options.some((o) => o && o.isCorrect === true);
    step.renderAs = temAlternativas ? "multiple_choice" : "text";
    // O payload rico não pode sobreviver à coerção: se ficar, o front volta a
    // tentar desenhar o molde (foi assim que o gráfico x/y chegou na tela).
    if (step.componentProps?.spec) delete step.componentProps.spec;
    if (step.visualConfig?.componentProps?.spec) delete step.visualConfig.componentProps.spec;
    for (const chave of ["dynamicSpec", "spec"]) {
      if (step[chave]) delete step[chave];
    }
    changes.push(`modo_simples_renderAs:${anterior || "ausente"}->${step.renderAs}`);
  }

  // 2.37 (2026-08-16, caderno F4, tarefa 6) drag_order LEGADO -> drag_to_order,
  // SO no modo caderno (isWorksheetInterface()). drag_order e o contrato de
  // compatibilidade do VisualInputs (config.items, EA "a, b, c" com labels) e
  // continua REGISTRADO e renderizavel (3 sentinelas travam a entry e o
  // VisualInputs); mas uma celula do caderno gerada agora deve nascer no
  // contrato rico (componentProps.items + EA CSV canonico, o que o
  // DragToOrder.jsx emite: values unidos por virgula). Sem isto a celula B
  // cairia no renderer legado, sem readOnly e sem instrumento. Em simple/rich
  // NADA muda (gate por modo). So converte quando a conversao e segura:
  // 3..10 pecas (schema do drag_to_order), labels ate 80 chars, e o EA lista
  // exatamente as pecas (senao o guard do drag_order decide, como hoje).
  if (isWorksheetInterface() && step.renderAs === "drag_order") {
    const convertido = _dragOrderParaDragToOrder(step);
    if (convertido) changes.push(`caderno_drag_order->drag_to_order:${convertido}`);
  }

  // 2.4 (2026-08-06) INVARIANTE DE RESPONDIBILIDADE — enforcement na ORIGEM.
  //
  // Auditoria dos 29 STIs rejeitados arquivados: 235 passos saíram com
  // alternativa fraca/genérica e, em 150 deles (64%), o worker JÁ tinha
  // computado o erro real, específico e aterrado em `behaviorMisconceptions` —
  // e o código determinístico descartava. As duas assinaturas de rejeição mais
  // frequentes ("distratores genericos > 40%" 12x, "cobertura adaptativa
  // específica < 50%" 10x) e a terceira ("gabarito que o aluno não consegue
  // digitar" 6x) são TODAS a mesma falha vista de ângulos diferentes.
  //
  // A causa não é a LLM: o worker entrega o diagnóstico certo. A causa é
  // arquitetural — esta invariante ("o aluno consegue PRODUZIR este gabarito
  // nesta superfície?") era verificada só TARDE, em 4 gates diferentes
  // (final-gate RULE 1b, structural-gate, quality-gate, spec-generator), cada
  // um reparando de um jeito, e quando o reparo falhava a geração INTEIRA
  // (4 problemas, ~2-4 min, ~$0.16) era rejeitada por causa de 1-8 passos.
  //
  // Aqui é o primeiro checkpoint determinístico depois do worker materializar
  // (agent6-story.js chama sanitizeStepsArray logo após o parse). Corrigindo
  // AQUI, o artefato nasce válido e os gates de baixo viram confirmação em vez
  // de conserto. Não inventa nada: só promove o erro que o worker já previu.
  if (TYPED_ENTRY_RENDER_AS.has(String(step.renderAs))) {
    const obstaculo = typedAnswerObstacle(ea);
    if (obstaculo) {
      const vistos = new Set([_normalize(ea)]);
      const alternativas = [{ value: ea, isCorrect: true, feedback: "Correto!" }];
      for (const bm of Array.isArray(step.behaviorMisconceptions)
        ? step.behaviorMisconceptions
        : []) {
        const errado = String(bm?.wrongAnswer ?? "").trim();
        const bmId = String(bm?.misconceptionId ?? bm?.id ?? "").trim();
        if (!errado || vistos.has(_normalize(errado))) continue;
        if (
          !isGroundedDistractor({
            misconceptionId: bmId,
            value: errado,
            expectedAnswer: ea,
            renderAs: step.renderAs,
          })
        )
          continue;
        vistos.add(_normalize(errado));
        alternativas.push({
          value: errado,
          isCorrect: false,
          misconceptionId: bmId,
          misconceptionType: bm?.misconceptionType || bm?.type || "procedural_error",
          graphDiagnosticSource: "agent6_worker_behavior_misconceptions",
          feedback: bm?.feedback || bm?.description || "Quase! Revise os passos e tente novamente.",
        });
      }
      if (alternativas.length >= 2) {
        step.options = alternativas;
        step.renderAs = "multiple_choice";
        step.componentId = "multiple_choice";
        step.interactionMode = "answer";
        delete step.componentProps;
        changes.push(
          `gabarito_nao_digitavel→multiple_choice(${alternativas.length - 1}_erros_reais)`
        );
      } else {
        // Sem erro previsto aterrado: registra para o gate decidir. Não
        // convertemos às cegas — inventar alternativa aqui seria pior que o
        // defeito (o aluno escolheria entre chutes sem diagnóstico nenhum).
        changes.push(`gabarito_nao_digitavel_sem_reparo:${obstaculo.slice(0, 40)}`);
      }
    }
  }

  // 2.5 (2026-07-19): EA canônico de sequência — worker que autora EA
  // "a, b, c" (espaço pós-vírgula) criava step IRRESPONDÍVEL em runtime: o
  // DragToOrder submete values.join(",") e o matcher exact do graphEngine
  // preserva a diferença de espaço (o caminho via contracts compiler já era
  // canônico; o buraco era EA autorado direto). Canonicaliza EA +
  // acceptableVariations + behaviorMisconceptions[].wrongAnswer na MESMA
  // passada, GATED por renderAs de sequência — "3,5" decimal pt-BR em step
  // numérico NUNCA é tocado. Roda AQUI (pós-worker, pré-GraphForge) para o
  // grafo já nascer com valores roteáveis.
  const seqChanges = canonicalizeSequenceStepAnswers(step);
  if (seqChanges.length > 0) {
    changes.push(...seqChanges);
    ea = String(step.expectedAnswer ?? "").trim();
  }

  // 3. Normaliza options (se houver)
  let opts = Array.isArray(step.options) ? step.options.slice() : [];
  opts = opts
    .map((o) => ({
      ...o,
      value: String(o.value ?? "").trim(),
      isCorrect: o.isCorrect === true,
    }))
    .filter((o) => o.value.length > 0);

  // 4. DETECTA inconsistência crítica: renderAs ESPECIAL + options FALLBACK
  const isSpecial = SPECIAL_RENDERAS.has(step.renderAs);
  const isFreeInput = FREE_INPUT_RENDERAS.has(step.renderAs);
  const fallbackCount = opts.filter((o) => _isFallbackValue(o.value)).length;
  const hasInconsistency =
    isSpecial && opts.length > 0 && fallbackCount >= Math.max(2, opts.length - 1);

  if (hasInconsistency) {
    // CASO A: componente ACEITA input direto (fraction_bar, numeric_keypad etc)
    //         → REMOVE options (componente valida via expectedAnswer diretamente)
    if (isFreeInput) {
      opts = [];
      changes.push(`removed_fallback_options_for_${step.renderAs}`);
    } else {
      // CASO B: componente especial mas não free-input (drag_to_order, etc)
      //         → CONVERTE pra multiple_choice + gera distractors plausíveis
      step.renderAs = "multiple_choice";
      const distractors = _generateDistractors(ea);
      opts = [
        { value: ea, isCorrect: true, feedback: "Correto!" },
        ...distractors.map((d) => ({
          value: d,
          isCorrect: false,
          feedback: "Tente outra alternativa.",
        })),
      ];
      changes.push(`converted_to_mc_with_distractors`);
    }
  }

  // 4.5 (2026-05-24): MC com distractors lixo (ninguno/los dos/no corresponde/etc)
  // → regenera distractors plausíveis OU converte pra true_false/text.
  // Antes, este caso passava direto porque MC é "neutral" não "special".
  if (step.renderAs === "multiple_choice" && opts.length >= 2) {
    const mcGarbageCount = opts.filter((o) => _isFallbackValue(o.value)).length;
    // Maioria garbage (≥ length-1) → distractors são lixo, mesmo que EA esteja entre opts
    if (mcGarbageCount >= Math.max(2, opts.length - 1)) {
      const correctOpt =
        opts.find((o) => o.isCorrect === true) ||
        opts.find((o) => _normalize(o.value) === _normalize(ea));
      const correctVal = correctOpt?.value || ea;
      const isBool = /^(verdadeiro|falso|true|false|sim|n[aã]o)$/i.test(_normalize(correctVal));

      if (isBool) {
        step.renderAs = "true_false";
        const isTrue = /^(verdadeiro|true|sim)$/i.test(_normalize(correctVal));
        opts = [
          {
            value: "Verdadeiro",
            isCorrect: isTrue,
            feedback: isTrue ? "Correto!" : "Tente novamente.",
          },
          {
            value: "Falso",
            isCorrect: !isTrue,
            feedback: !isTrue ? "Correto!" : "Tente novamente.",
          },
        ];
        step.expectedAnswer = isTrue ? "Verdadeiro" : "Falso";
        changes.push("mc_garbage→true_false");
      } else {
        const distractors = _generateDistractors(correctVal);
        if (distractors.length >= 2) {
          opts = [
            { value: correctVal, isCorrect: true, feedback: "Correto!" },
            ...distractors.map((d) => ({
              value: d,
              isCorrect: false,
              feedback: "Tente outra alternativa.",
            })),
          ];
          changes.push("mc_garbage→regenerated_distractors");
        } else {
          // Texto sem distractors plausíveis → converte pra input livre
          step.renderAs = "text";
          opts = [];
          step.interactionMode = "answer";
          changes.push("mc_garbage→text_free_input");
        }
      }
    }
  }

  // 5. Se renderAs é multiple_choice/image_choice e tem options, GARANTE 1 correct == expectedAnswer
  if (
    (step.renderAs === "multiple_choice" || step.renderAs === "image_choice") &&
    opts.length > 0
  ) {
    const eaKey = _normalize(ea);
    let correctOpt = opts.find((o) => _normalize(o.value) === eaKey);
    if (correctOpt) {
      if (correctOpt.value !== ea) {
        step.expectedAnswer = correctOpt.value;
        changes.push("aligned_ea_to_correct_value");
      }
      opts.forEach((o) => {
        o.isCorrect = o === correctOpt;
      });
    } else {
      // Tenta usar a opção que tem isCorrect:true (vinda do LLM) e alinha o value
      correctOpt = opts.find((o) => o.isCorrect);
      if (correctOpt) {
        correctOpt.value = ea;
        changes.push("aligned_correct_value_to_ea");
      } else {
        // Injeta correta no início
        correctOpt = { value: ea, isCorrect: true, feedback: "Correto!" };
        opts.unshift(correctOpt);
        changes.push("injected_correct_option");
      }
      opts.forEach((o) => {
        if (o !== correctOpt) o.isCorrect = false;
      });
    }
    // Dedup + limit 4
    const seen = new Set();
    opts = opts
      .filter((o) => {
        const k = _normalize(o.value);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, 4);
    // Se sobrou só 1 opção (a correta), injeta distractors plausíveis
    if (opts.length === 1) {
      const distractors = _generateDistractors(ea);
      for (const d of distractors) {
        opts.push({ value: d, isCorrect: false, feedback: "Tente outra alternativa." });
        if (opts.length >= 4) break;
      }
      changes.push("padded_distractors");
    }
    // Garante feedback em todas
    opts = opts.map((o) => ({
      ...o,
      feedback: o.feedback || (o.isCorrect ? "Correto!" : "Tente outra alternativa."),
    }));
  }

  // 6. Se renderAs é FREE_INPUT (fraction_bar, numeric_keypad etc) → SEM options
  //    O componente valida diretamente via expectedAnswer.
  if (isFreeInput && step.renderAs !== "multiple_choice" && step.renderAs !== "image_choice") {
    if (opts.length > 0) {
      // só remove se NÃO for um fallback intencional do agent (manter se opts são bons)
      const hasGoodOpts = opts.every((o) => !_isFallbackValue(o.value));
      if (!hasGoodOpts || fallbackCount > 0) {
        opts = [];
        changes.push(`stripped_options_for_${step.renderAs}`);
      }
    }
  }

  step.options = opts;

  // 7. acceptableVariations sempre inclui expectedAnswer
  const variations = new Set([ea]);
  for (const v of step.acceptableVariations || []) {
    if (typeof v === "string" && v.trim()) variations.add(v.trim());
  }
  // Expansão automática pra binárias
  const eaLow = ea.toLowerCase();
  const BIN = {
    não: ["não", "nao", "no", "falso", "false", "f", "n"],
    nao: ["não", "nao", "no", "falso", "false", "f", "n"],
    sim: ["sim", "yes", "verdadeiro", "true", "v", "s"],
    verdadeiro: ["verdadeiro", "true", "v", "sim"],
    falso: ["falso", "false", "f", "não", "nao", "no"],
  };
  if (BIN[eaLow]) BIN[eaLow].forEach((v) => variations.add(v));
  step.acceptableVariations = [...variations];

  // 8. Final validation
  const valid = !!ea && (!opts.length || opts.some((o) => o.isCorrect));

  if (changes.length > 0) {
    logger.info(
      { module: "step-sanitizer", source: src, stepId: step.id, renderAs: step.renderAs, changes },
      "Step sanitized"
    );
  }

  return { step, changes, valid };
}

/**
 * Sanitiza array de steps de UM problema. Retorna nova lista (sem steps inválidos).
 */
export function sanitizeStepsArray(steps, ctx = {}) {
  if (!Array.isArray(steps)) return [];
  const out = [];
  for (const s of steps) {
    const { step, valid } = sanitizeStep(s, ctx);
    if (valid && step) out.push(step);
  }
  return out;
}

/**
 * Sanitiza um STI inteiro. Aplicar após Agent 6 / antes de Agent 7/8.
 */
export function sanitizeStiSteps(sti, ctx = {}) {
  if (!sti?.problems) return sti;
  let totalChanges = 0;
  for (const p of sti.problems) {
    p.steps = sanitizeStepsArray(p.steps || [], { source: ctx.source || "sti", ...ctx });
    totalChanges += p.steps?.length || 0;
  }
  return sti;
}
