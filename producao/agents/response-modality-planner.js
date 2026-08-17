/**
 * Planejador de MODALIDADE DE RESPOSTA — interface-first, no padrão CTAT.
 *
 * 2026-08-02 (auditoria de interface): a pipeline decide a RESPOSTA antes da
 * INTERFACE. O agente 6 escreve `expectedAnswer` sem saber o que a tela vai
 * conseguir produzir, e o router só depois procura um componente. Quando o
 * worker escreve uma pergunta dissertativa, nenhum componente representa aquilo
 * e o passo vira um campo de texto com gabarito impossível:
 *
 *   "identifique a posição inicial e a final" -> "S₀ = 15 km e S = 96 km"
 *   "Monte a expressão da concentração"       -> "C = 5,0 / 2,0"
 *
 * Num example-tracing tutor do CTAT o autor constrói primeiro a interface do
 * tipo de problema; cada passo é uma AÇÃO nela e a resposta é o que a interface
 * emite. Este módulo faz a inversão sem reordenar o pipeline: em vez de escolher
 * o COMPONENTE antes (refactor grande no caminho crítico), escolhe a MODALIDADE
 * antes, e o worker materializa dentro dela.
 *
 * O conhecimento reusado já existia no quality-gate, do lado errado do fluxo:
 * `RESPONSE_MODALITIES` classificava a modalidade só para MEDIR diversidade no
 * fim, e `AFFORDANCE_POLICIES` declarava "conteúdo X exige affordance Y" só para
 * REPROVAR o resultado. Aqui esse mesmo conhecimento passa a DIRIGIR a geração.
 *
 * Módulo PURO e determinístico: nada de LLM, nada de I/O.
 */

import {
  AFFORDANCE_POLICY_MODALITY,
  COARSE_MODALITIES,
  CONTENT_AFFORDANCE_POLICIES,
  DISCIPLINE_AFFORDANCE_POLICIES,
  componentsForModality,
} from "../shared/affordance-policies.js";
// 2026-08-16 (caderno F2b): papeis do caderno derivados da modalidade coarse.
// component-sets e notebook-emitter-model sao modulos puros (sem LLM/I/O),
// entao este planejador continua puro; WORKSHEET_A_RENDER_AS vem do fallback
// do caderno porque e uma regra do CADERNO (nao capacidade de componente).
import {
  ASSEMBLED_ANSWER_RENDER_AS,
  NOTEBOOK_B,
  NOTEBOOK_C_V1,
  NOTEBOOK_ROLE_LABELS,
} from "../shared/component-sets.js";
import { NOTEBOOK_INSTRUMENT_TARGET_KIND } from "../evaluation/notebook-emitter-model.js";
import { WORKSHEET_A_RENDER_AS } from "./notebook/notebook-fallback.js";

/**
 * As quatro formas pelas quais um aluno produz uma resposta. Reexportadas da
 * fonte única para que a medição no gate e a diretriz na geração falem a mesma
 * língua — antes eram duas listas escritas à mão, que divergiram.
 */
export const MODALITIES = COARSE_MODALITIES;

/** Como cada modalidade é explicada ao worker, em português e em uma linha. */
const CONTRATO_POR_MODALIDADE = Object.freeze({
  manipulate:
    "MANIPULAR o modelo na tela (clicar/arrastar no próprio objeto). expectedAnswer = o valor que a manipulação emite.",
  select:
    "SELECIONAR um alvo entre alternativas visíveis. expectedAnswer = o texto EXATO de uma das options que você declara.",
  construct:
    "MONTAR/ORDENAR os itens que você declara. expectedAnswer = a sequência serializada desses itens.",
  type: "DIGITAR um valor curto (número, fração, unidade, uma palavra). Máximo 5 palavras.",
});

/** Verbos de contagem sobre objetos desenhados: contar é clicar nos contáveis. */
const CONTAGEM_VISUAL =
  /\b(quantos|quantas|conte|contar|qual\s+(?:é\s+)?(?:o\s+)?n[úu]mero\s+de)\b/i;

/** Pede o resultado de uma operação: o aluno produz um valor. */
const CALCULO =
  /\b(calcule|calcular|efetue|resolva|determine o valor|qual (?:é )?o (?:total|resultado|valor)|some|subtraia|multiplique|divida|converta)\b/i;

/** Pede ordem/sequência. */
const ORDENACAO =
  /\b(ordene|ordenar|coloque em ordem|sequ[eê]ncia|cronol[oó]gic|do mais (?:antigo|pr[oó]ximo|distante)|organize)\b/i;

/** Pede classificação/identificação entre categorias. */
const CLASSIFICACAO =
  /\b(classifique|classificar|identifique|identificar|selecione|assinale|qual (?:das|dos)|escolha|relacione|associe)\b/i;

function texto(...partes) {
  return partes
    .map((parte) => String(parte ?? ""))
    .join(" ")
    .trim();
}

function politicaAplicavel(politicas, alvo) {
  return politicas.find((politica) => politica.match.test(alvo)) || null;
}

/**
 * Decide a modalidade alvo de UM passo, antes de o agente 6 materializá-lo.
 *
 * A ordem de precedência é deliberada: a política de conteúdo vence, porque é o
 * conhecimento mais específico que o sistema tem ("frações exigem manipulativo
 * fracionário"). Só quando nenhuma política casa é que a intenção verbal do
 * passo decide, e o último recurso é digitar.
 *
 * @returns {{modality: string, acceptedComponents: string[], contract: string, source: string, policyId: string|null}}
 */
export function planStepModality({ kc, stepIntent, instruction, topic, discipline } = {}) {
  const alvoConteudo = texto(topic, kc, stepIntent, instruction);
  const alvoDisciplina = texto(discipline, topic);
  const intencao = texto(stepIntent, instruction);

  const politicaConteudo = politicaAplicavel(CONTENT_AFFORDANCE_POLICIES, alvoConteudo);
  if (politicaConteudo) {
    return {
      modality: AFFORDANCE_POLICY_MODALITY[politicaConteudo.id] || "manipulate",
      acceptedComponents: [...politicaConteudo.accepted],
      contract:
        CONTRATO_POR_MODALIDADE[AFFORDANCE_POLICY_MODALITY[politicaConteudo.id] || "manipulate"],
      source: "content-policy",
      policyId: politicaConteudo.id,
    };
  }

  const politicaDisciplina = politicaAplicavel(DISCIPLINE_AFFORDANCE_POLICIES, alvoDisciplina);

  /**
   * 2026-08-02 (painel sênior): o verbo do enunciado curto-circuitava a política
   * da disciplina. "Identifique o sujeito da oração" batia em CLASSIFICACAO e
   * virava múltipla escolha genérica, embora `language-model` soubesse que a
   * ação certa é marcar o sujeito DENTRO da frase.
   *
   * A correção não inverte a precedência — o verbo continua decidindo a
   * MODALIDADE, e com razão: "calcule a velocidade média" é digitar um valor,
   * seja em Física ou em qualquer outra matéria. O que a disciplina faz agora é
   * ESTREITAR a lista de componentes quando as duas concordam. Se a interseção
   * é vazia, o verbo segue sozinho e nada muda.
   *
   * Português + "identifique"  -> select, mas via word_matcher (não MC genérica)
   * História  + "ordene"       -> construct, mas via timeline/drag (não table)
   * Física    + "calcule"      -> type; interseção vazia, o verbo manda sozinho
   */
  const porVerbo = (modality, source, contrato) => {
    const doVerbo = componentsForModality(modality);
    const daDisciplina = politicaDisciplina ? [...politicaDisciplina.accepted] : [];
    const intersecao = doVerbo.filter((componente) => daDisciplina.includes(componente));
    return {
      modality,
      acceptedComponents: intersecao.length ? intersecao : doVerbo,
      contract: contrato || CONTRATO_POR_MODALIDADE[modality],
      source: intersecao.length ? `${source}+discipline` : source,
      policyId: intersecao.length ? politicaDisciplina.id : null,
    };
  };

  // Contagem sobre objetos desenhados: no CTAT isso é um grupo não-ordenado de
  // cliques sobre os próprios contáveis, nunca um clique numa zona-número.
  if (CONTAGEM_VISUAL.test(intencao)) {
    return porVerbo(
      "manipulate",
      "counting-intent",
      `${CONTRATO_POR_MODALIDADE.manipulate} Para contagem, o aluno CONTA CLICANDO nos próprios objetos desenhados.`
    );
  }

  if (ORDENACAO.test(intencao)) return porVerbo("construct", "ordering-intent");

  // Cálculo vem antes de classificação: "calcule qual é o total" tem os dois
  // verbos, e o que manda é o aluno PRODUZIR o valor.
  if (CALCULO.test(intencao)) return porVerbo("type", "calculation-intent");

  if (CLASSIFICACAO.test(intencao)) return porVerbo("select", "classification-intent");

  if (politicaDisciplina) {
    return {
      modality: AFFORDANCE_POLICY_MODALITY[politicaDisciplina.id] || "select",
      acceptedComponents: [...politicaDisciplina.accepted],
      contract:
        CONTRATO_POR_MODALIDADE[AFFORDANCE_POLICY_MODALITY[politicaDisciplina.id] || "select"],
      source: "discipline-policy",
      policyId: politicaDisciplina.id,
    };
  }

  return {
    modality: "type",
    acceptedComponents: componentsForModality("type"),
    contract: CONTRATO_POR_MODALIDADE.type,
    source: "default",
    policyId: null,
  };
}

/**
 * Plano do problema inteiro. Além de decidir passo a passo, garante que a
 * sequência não seja monótona: se TODOS os passos caírem em "type", o STI vira
 * uma lista de contas sem interface nenhuma (foi exatamente o STI de física, com
 * 3 de 5 passos em numeric_keypad e zero alvos clicáveis). Nesse caso o primeiro
 * passo é promovido para a modalidade rica que o conteúdo aceita.
 */
export function planProblemModalities({ steps, topic, discipline, worksheet = false } = {}) {
  const lista = Array.isArray(steps) ? steps : [];
  const planos = lista.map((step) =>
    planStepModality({
      kc: step?.kc,
      stepIntent: step?.stepIntent ?? step?.intent,
      instruction: step?.instruction,
      topic,
      discipline,
    })
  );

  // 2026-08-16 (caderno F2b): no caderno a anti-monotonia NAO promove o passo
  // 1 a "manipulate" a forca. Um caderno feito de celulas simples (digitar /
  // selecionar) e legitimo (e o CTAT classico); a variedade vem do
  // instrumento compartilhado, nao de um manipulativo forcado no primeiro
  // passo. Fora do worksheet (worksheet=false, o default) nada muda.
  const todosDigitados =
    !worksheet && planos.length >= 3 && planos.every((plano) => plano.modality === "type");
  if (todosDigitados) {
    const rico = planStepModality({ kc: lista[0]?.kc, topic, discipline });
    planos[0] =
      rico.modality === "type"
        ? {
            modality: "manipulate",
            acceptedComponents: componentsForModality("manipulate"),
            contract: CONTRATO_POR_MODALIDADE.manipulate,
            source: "anti-monotony",
            policyId: null,
          }
        : { ...rico, source: "anti-monotony" };
  }

  return planos;
}

/**
 * 2026-08-16 (caderno F2b): apresentacao padrao de uma celula por papel e
 * modalidade. A (select) e um dropdown compacto; A (type) e um input de uma
 * linha; B e C sao renderizados inline (o componente inteiro dentro da celula
 * ou o alvo do instrumento). O fallback do caderno refina por renderAs FINAL
 * (keypad, radio) quando o worker nao manda presentation.
 */
function presentationForRole(role, modality) {
  if (role === "A") return modality === "select" ? "dropdown" : "input";
  return "inline";
}

/**
 * 2026-08-16 (caderno F2b): planeja o PAPEL de cada celula do caderno a partir
 * da modalidade coarse ja decidida para o passo (interface-first, mesma
 * ordem: modalidade -> papel -> worker). Regras:
 *   select / type -> A (celula simples: o aluno seleciona ou digita);
 *   construct     -> A por padrao; B SO quando os componentes aceitos do passo
 *                    incluem algum de ASSEMBLED_ANSWER_RENDER_AS (ordenar,
 *                    montar, parear: a resposta e MONTADA, nao digitada).
 *                    2026-08-17 (stream M, "o caderno prefere digitar"): um
 *                    "construct" cujo aceito e table/diagram_labeler/
 *                    memory_game nao e celula rica no caderno; a resposta
 *                    escalar vai numa caixinha (o STI real de fracoes saiu com
 *                    15/15 celulas B e o juiz LLM reprovou a interface);
 *   manipulate    -> C (instrumento compartilhado) SO quando o problema tem
 *                    instrumentHint E os componentes aceitos do passo cruzam
 *                    NOTEBOOK_C_V1 (lista fechada v1); senao B.
 * `policy` e a lista devolvida por planProblemModalities (um plano por passo,
 * mesma ordem dos stepIntents); `acceptedComponentsByStep` sobrescreve os
 * componentes aceitos de um passo (mesma ordem; entrada ausente = usa a do
 * plano). Cada saida traz cellId (= graphNodeId do stepIntent), role,
 * presentation e, para C, targetHint (kind do alvo no instrumento) e os
 * acceptedComponents ja restritos ao papel (A: WORKSHEET_A_RENDER_AS; B:
 * NOTEBOOK_B; C: o proprio instrumento). Modulo puro: nada le o modo de
 * interface; quem chama decide se e caderno.
 */
export function planNotebookRoles(
  stepIntents,
  { policy = [], acceptedComponentsByStep = null, instrumentHint = null } = {}
) {
  const intents = Array.isArray(stepIntents) ? stepIntents : [];
  const planos = Array.isArray(policy) ? policy : [];
  const hint = NOTEBOOK_C_V1.has(String(instrumentHint || "")) ? String(instrumentHint) : null;
  return intents.map((intent, index) => {
    const plano = planos[index] || null;
    const modality = String(plano?.modality || "type");
    const aceitosBase = Array.isArray(acceptedComponentsByStep?.[index])
      ? acceptedComponentsByStep[index]
      : Array.isArray(plano?.acceptedComponents)
        ? plano.acceptedComponents
        : componentsForModality(modality);
    const cellId = String(intent?.graphNodeId || intent?.id || `step_${index + 1}`);
    let role;
    if (modality === "select" || modality === "type") role = "A";
    else if (modality === "construct") {
      // 2026-08-17 (stream M): B so quando ha componente de resposta MONTADA
      // entre os aceitos (drag_to_order, sentence_builder, matching_pairs...);
      // senao a celula e A (digitar/selecionar), o padrao do caderno.
      role = aceitosBase.some((componente) => ASSEMBLED_ANSWER_RENDER_AS.has(componente))
        ? "B"
        : "A";
    } else if (modality === "manipulate") {
      // "acceptedComponents ∩ NOTEBOOK_C_V1 nao vazio E ha instrumentHint" na
      // forma util: o instrumento do problema (hint, ja em NOTEBOOK_C_V1) tem
      // que ser um dos componentes que a modalidade deste passo aceita. Uma
      // celula de fracao (aceita fraction_bar) nunca vira alvo de um
      // number_line so porque o problema tem uma reta.
      // 2026-08-17 (visto em producao: STI de subtracao de fracoes saiu com
      // 15/15 celulas B porque a politica fraction-model planeja "manipulate"
      // e nao havia instrumentHint): sem instrumento compativel, manipulate
      // vira B SO se ha componente de resposta MONTADA entre os aceitos;
      // senao e A, o padrao do caderno (a mesma regra do construct).
      if (!!hint && aceitosBase.includes(hint)) role = "C";
      else
        role = aceitosBase.some((componente) => ASSEMBLED_ANSWER_RENDER_AS.has(componente))
          ? "B"
          : "A";
    } else role = "B";

    let acceptedComponents;
    if (role === "A") {
      const restritos = aceitosBase.filter((componente) => WORKSHEET_A_RENDER_AS.has(componente));
      acceptedComponents = restritos.length
        ? restritos
        : modality === "select"
          ? ["multiple_choice", "true_false", "word_matcher"]
          : ["text", "numeric_keypad", "fraction_input"];
    } else if (role === "C") {
      acceptedComponents = [hint];
    } else {
      const restritos = aceitosBase.filter((componente) => NOTEBOOK_B.has(componente));
      acceptedComponents = restritos.length ? restritos : aceitosBase;
    }

    const saida = {
      cellId,
      role,
      presentation: presentationForRole(role, modality),
      acceptedComponents,
    };
    if (role === "C") saida.targetHint = NOTEBOOK_INSTRUMENT_TARGET_KIND[hint] || null;
    return saida;
  });
}

/**
 * Bloco pronto para injetar no prompt do worker do agente 6.
 *
 * 2026-08-16 (caderno F2b): o terceiro argumento (celula planejada por
 * planNotebookRoles) SO e passado no modo worksheet; com ele o bloco ganha a
 * linha da celula (id, papel, apresentacao, alvo) e a lista de componentes
 * fica restrita ao papel. Sem ele, o texto e byte-identico ao de antes.
 */
export function formatModalityContract(plano, ordem, celula = null) {
  if (!plano) return "";
  const aceitos =
    celula && Array.isArray(celula.acceptedComponents) && celula.acceptedComponents.length
      ? celula.acceptedComponents
      : plano.acceptedComponents;
  const componentes = aceitos.slice(0, 8).join(", ");
  const linhas = [
    `- Passo ${ordem}: modalidade OBRIGATÓRIA = ${plano.modality.toUpperCase()}`,
    `  Como o aluno responde: ${plano.contract}`,
    `  Componentes válidos para este passo: ${componentes}`,
  ];
  if (celula) {
    const rotulo = NOTEBOOK_ROLE_LABELS[celula.role] || "?";
    const alvo = celula.role === "C" && celula.targetHint ? `, alvo=${celula.targetHint}` : "";
    linhas.push(
      `  Celula do caderno: id=${celula.cellId}, papel=${celula.role} (${rotulo}), apresentacao=${celula.presentation}${alvo}`
    );
  }
  return linhas.join("\n");
}

export const _internals = { CONTRATO_POR_MODALIDADE };
