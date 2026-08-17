/**
 * agent6-payload-guard.js — garante que a interação declarada tenha conteúdo.
 *
 * 2026-08-04. Por que existe:
 *
 * O worker do agente 6 não emite `componentProps` — ele emite `interactionIntent`
 * com uma `action` e o payload dela (`items`, `categories`, `pairs`, `slots`…).
 * Quem traduz intenção em props vem depois. Quando o worker declara
 * `action: "classify"` e manda `items: []` e `categories: []`, o componente
 * nasce vazio, o schema falha lá na frente e o passo morre — sete minutos depois.
 *
 * Foi essa a causa de:
 *   card_sort_lab .......... 6 passos removidos, 1 problema inteiro esvaziado
 *   hot_spot ............... 16 propostas, 0 sobreviventes
 *   concept_map ............ nodes/correctEdges vazios
 *   timeline_constructor ... slots/events/correctMapping vazios
 *
 * A correção fecha o laço no ponto onde o dado falta: detecta o payload vazio e
 * pede SÓ ele de volta, com saída estruturada (`json_schema` com `minItems`), em
 * que a própria API recusa a resposta se vier vazia de novo.
 *
 * POR QUE NÃO O PASSO INTEIRO: forçar schema no step completo exige
 * `additionalProperties:false` e enumerar os ~40 campos do contrato. Esquecer um
 * — `behaviorMisconceptions`, por exemplo — apagaria o diagnóstico do STI. O
 * ganho está concentrado no payload; o risco, espalhado por todo o resto.
 */

import { logger } from "../../lib/logger.js";

/**
 * O que cada ação PRECISA ter para o componente nascer preenchido.
 * Fonte: o contrato que o próprio worker-prompt documenta.
 */
/**
 * 2026-08-04 (2a correcao, e esta EU MEDI EM VEZ DE SUPOR): a 1a versao deste
 * mapa saiu do vocabulario documentado no worker-prompt, e ele NAO e o que o
 * compilador de contratos consome. Resultado na 1a geracao real: 6 chamadas
 * estruturadas preencheram `pairs` para `word_matcher`, campo que
 * `compileWordMatcher` nem le — dado gerado e descartado.
 *
 * Este mapa agora sai do PROPRIO compilador (as chaves que cada
 * `compileX(step, intent)` de fato le). Só entram acoes que o compilador
 * consegue compilar: pedir payload para componente sem rota de compilacao e
 * queimar chamada a toa.
 *
 * `doStep` diz onde o compilador tambem aceita o dado vindo do proprio step —
 * se ja estiver la, nada falta.
 */
export const PAYLOAD_POR_ACAO = Object.freeze({
  // compileCardSort/V2 le: expectedMapping, mapping, items
  classify: {
    chaves: ["items"],
    minimos: { items: 3 },
    propsCompiladas: ["groups", "cards", "correctMapping", "categories", "items"],
  },
  // compileMemoryGame / compileMatchingPairs leem: pairs, items
  match_pairs: {
    chaves: ["pairs"],
    minimos: { pairs: 2 },
    propsCompiladas: ["leftColumn", "rightColumn", "correctPairs", "pairs"],
  },
  // compileOrder le: items, sequence
  order_sequence: {
    chaves: ["items"],
    minimos: { items: 3 },
    propsCompiladas: ["items", "sequence"],
  },
  // compileTrueFalseLab le: statements, items
  true_false: {
    chaves: ["statements"],
    minimos: { statements: 2 },
    propsCompiladas: ["statements"],
  },
  // compileCloze le: blanks, answers, text, template
  cloze: {
    chaves: ["text", "blanks"],
    minimos: { blanks: 1 },
    propsCompiladas: ["text", "blanks"],
  },
  // compileSentenceBuilder le: wordBank, words, tokens
  sentence_builder: {
    chaves: ["wordBank"],
    minimos: { wordBank: 3 },
    propsCompiladas: ["wordBank"],
  },
  // compileWordMatcher le: options, choices, words — e cai em step.options
  word_matcher: {
    chaves: ["options"],
    minimos: { options: 2 },
    doStep: { options: "options" },
    propsCompiladas: ["options", "choices", "words"],
  },
  // compileHighlightInText le: text, passage, options, targets
  highlight_text: {
    chaves: ["text"],
    minimos: {},
    doStep: { text: "text" },
    propsCompiladas: ["text", "passage"],
  },
  // compileEquation le: expectedExpression, expression, tokens
  equation: {
    chaves: ["tokens"],
    minimos: { tokens: 3 },
    propsCompiladas: ["tokens", "expectedExpression"],
  },
});

/**
 * 2026-08-04 (achado do teste e2e, que provou a 1a versao INERTE): a guarda
 * original so agia quando `interactionIntent` EXISTIA e estava incompleto.
 * Medido: o worker emite esse campo em 38 de 2522 passos publicados (1,5%), e em
 * ZERO do artefato que falhou. Ou seja, ela nunca disparava.
 *
 * A cadeia real e esta:
 *   compileStepFromIntent() -> `if (!intent) return {reason:"no-intent"}`
 * O compilador que preenche `componentProps` SO roda se houver intent. Sem
 * intent, o componente rico e escolhido a jusante e nasce com props vazias.
 *
 * Entao o gatilho certo nao e "intent incompleto" — e "COMPONENTE que precisa de
 * payload, com props vazias e sem intent". Este mapa liga o componente escolhido
 * a acao e ao payload que o compilador espera receber.
 */
export const ACAO_POR_COMPONENTE = Object.freeze({
  card_sort_lab: "classify",
  card_sort: "classify",
  matching_pairs: "match_pairs",
  memory_game: "match_pairs",
  drag_to_order: "order_sequence",
  image_sequence: "order_sequence",
  true_false_lab: "true_false",
  cloze_test: "cloze",
  sentence_builder: "sentence_builder",
  word_matcher: "word_matcher",
  highlight_in_text: "highlight_text",
  equation_builder: "equation",
  // hot_spot, diagram_labeler, concept_map, timeline_constructor, cell_diagram e
  // venn_diagram NAO entram: o compilador de contratos nao tem rota para eles,
  // entao preencher o intent nao viraria componentProps. Esses sao cobertos por
  // shape-builders.js (quando a resposta sustenta a estrutura) e pela
  // recuperacao rica. Pedir payload aqui seria queimar chamada a toa.
});

const propsVazias = (step) => {
  const cp = step?.componentProps;
  return !cp || typeof cp !== "object" || Object.keys(cp).length === 0;
};

const tamanho = (valor) => {
  if (Array.isArray(valor)) return valor.length;
  if (typeof valor === "string") return valor.trim() ? 1 : 0;
  if (valor && typeof valor === "object") return Object.keys(valor).length;
  return 0;
};

const normalizarAcao = (intent) =>
  String(intent?.action || intent?.type || "")
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, "_");

/**
 * payloadFaltante — devolve as chaves que a ação exige e que vieram vazias.
 * Array vazio significa "o passo está completo" (ou a ação não tem exigência).
 */
export function payloadFaltante(step) {
  const acao = acaoDoPasso(step);
  if (!acao) return [];
  const regra = PAYLOAD_POR_ACAO[acao];
  if (!regra) return [];
  const intent = step?.interactionIntent || {};
  return regra.chaves.filter((chave) => {
    const minimo = regra.minimos[chave] ?? 1;
    if (tamanho(intent[chave]) >= minimo) return false;
    // O compilador tambem aceita o dado vindo do proprio step (ex.: word_matcher
    // cai em step.options). Se ja esta la, nada falta — foi assim que a 1a
    // versao queimou 6 chamadas pedindo o que o passo ja tinha.
    const campoDoStep = regra.doStep?.[chave];
    return campoDoStep ? tamanho(step?.[campoDoStep]) < minimo : true;
  });
}

/**
 * 2026-08-05 (auditoria Adjetivos): props NAO-vazias porem INUTEIS deixavam a
 * guarda muda. O worker preencheu componentProps com chaves que o schema nao
 * reconhece; propsVazias() dava false, a guarda pulava o passo e ele morria
 * 90s depois no validador com "leftColumn undefined". Props so contam como
 * "preenchidas" se alguma chave que o COMPILADOR produz existir com tamanho
 * minimo — senao o estado e o mesmo de vazio: o componente vai morrer.
 */
function propsAlimentamComponente(step, acao) {
  if (propsVazias(step)) return false;
  const regra = PAYLOAD_POR_ACAO[acao];
  if (!regra?.propsCompiladas) return true;
  const cp = step.componentProps || {};
  return regra.propsCompiladas.some((chave) => tamanho(cp[chave]) >= 1);
}

/**
 * 2026-08-05: predicado exportado para o final-gate. True quando o passo usa
 * componente que exige payload e as props atuais nao o alimentam — ou seja, o
 * validador ainda vai precisar reconstruir este passo, e destruir material
 * (ex.: apagar options) antes disso e queimar a materia-prima do reparo.
 */
export function componenteRicoSemPayload(step) {
  const acao =
    ACAO_POR_COMPONENTE[
      String(step?.renderAs || "")
        .trim()
        .toLowerCase()
    ] || "";
  if (!acao) return false;
  return !propsAlimentamComponente(step, acao);
}

/**
 * A ação do passo vem do intent quando ele existe; senão, do COMPONENTE que foi
 * escolhido — mas só quando as props não alimentam o componente, que é o estado
 * em que ele morreria. Componente já preenchido não é assunto desta guarda.
 */
export function acaoDoPasso(step) {
  const doIntent = normalizarAcao(step?.interactionIntent);
  if (doIntent) return doIntent;
  const candidata =
    ACAO_POR_COMPONENTE[
      String(step?.renderAs || "")
        .trim()
        .toLowerCase()
    ] || "";
  if (!candidata) return "";
  if (propsAlimentamComponente(step, candidata)) return "";
  return candidata;
}

/** Schema estruturado só do payload que falta — a API recusa vazio de novo. */
export function schemaDoPayload(acao, faltantes) {
  const regra = PAYLOAD_POR_ACAO[normalizarAcao({ action: acao })];
  if (!regra) return null;
  const properties = {};
  for (const chave of faltantes) {
    const minimo = regra.minimos[chave] ?? 1;
    properties[chave] =
      chave === "text"
        ? { type: "string", minLength: 10 }
        : chave === "correctMapping"
          ? { type: "object", additionalProperties: { type: "string" } }
          : { type: "array", minItems: minimo, items: { type: "string", minLength: 1 } };
  }
  return {
    type: "object",
    additionalProperties: false,
    required: faltantes,
    properties,
  };
}

/**
 * completarPayloadFaltante — fecha o laço no passo, não no tutor.
 *
 * Para cada passo com payload vazio, faz UMA chamada estruturada pedindo só o
 * que falta. Nunca lança: se a chamada falhar, o passo segue como está e a
 * cascata de reparos a jusante continua valendo — nunca fica pior que hoje.
 *
 * Retorna { corrigidos, tentados, falhas } para telemetria.
 */
export async function completarPayloadFaltante(steps, { llm, contexto = {}, sessionId } = {}) {
  const relatorio = { tentados: 0, corrigidos: 0, falhas: 0 };
  if (!Array.isArray(steps) || !llm?.withStructuredOutput) return relatorio;

  const { SystemMessage, HumanMessage } = await import("@langchain/core/messages");

  for (const step of steps) {
    const faltantes = payloadFaltante(step);
    if (!faltantes.length) continue;
    relatorio.tentados++;

    const acao = acaoDoPasso(step);
    const schema = schemaDoPayload(acao, faltantes);
    if (!schema) continue;

    try {
      const estruturado = llm.withStructuredOutput(schema, {
        name: "payload_da_interacao",
        method: "jsonSchema",
      });
      const sistema =
        "Voce completa o conteudo de uma interacao pedagogica ja planejada. " +
        "Responda SOMENTE com os campos pedidos, no idioma do enunciado, " +
        "coerentes com a resposta correta. Nao invente conteudo fora do tema.";
      const humano = [
        `Disciplina: ${contexto.discipline || "-"} | Topico: ${contexto.topic || "-"}`,
        `Enunciado do problema: ${contexto.statement || "-"}`,
        `Instrucao do passo: ${step.instruction || "-"}`,
        `Resposta correta: ${step.expectedAnswer ?? "-"}`,
        `Tipo de interacao: ${acao}`,
        `Preencha: ${faltantes.join(", ")}`,
      ].join("\n");

      const preenchido = await estruturado.invoke([
        new SystemMessage(sistema),
        new HumanMessage(humano),
      ]);

      const aindaFalta = faltantes.filter((chave) => tamanho(preenchido?.[chave]) === 0);
      if (aindaFalta.length) {
        relatorio.falhas++;
        continue;
      }
      // Sem intent, o compilador de contratos nem roda — por isso a ação entra
      // junto, e não só o payload.
      step.interactionIntent = { action: acao, ...(step.interactionIntent || {}), ...preenchido };
      relatorio.corrigidos++;
      logger.info(
        { module: "agent6-payload-guard", phase: "completado", stepId: step.id, acao, faltantes },
        "Payload da interacao completado por saida estruturada"
      );
    } catch (erro) {
      relatorio.falhas++;
      logger.warn(
        {
          module: "agent6-payload-guard",
          phase: "falhou",
          stepId: step.id,
          acao,
          err: String(erro?.message || erro).slice(0, 160),
        },
        "Nao consegui completar o payload — segue para a cascata de reparos"
      );
    }
  }

  // 2026-08-05: loga SEMPRE, mesmo com zero tentativas. Na geracao de
  // Adjetivos o silencio total custou caro no diagnostico: nao dava para
  // distinguir "nao precisou" de "nao rodou".
  const elegiveis = (Array.isArray(steps) ? steps : []).filter((s) => acaoDoPasso(s)).length;
  logger.info(
    { module: "agent6-payload-guard", phase: "resumo", ...relatorio, elegiveis, sessionId },
    relatorio.tentados
      ? "Guarda de payload da interacao"
      : "Guarda de payload: nenhum passo precisou de completacao"
  );
  return relatorio;
}
