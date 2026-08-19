/**
 * analysis/bancada-v2/regua-simetrica.mjs — REPAROS DE SIMETRIA da régua de
 * estados (2026-08-19). ADITIVO: não altera lib.mjs, comparar-caminho.mjs nem
 * linha-de-base.mjs, para que o caminho congelado continue reproduzível byte a
 * byte e as duas leituras possam ser publicadas lado a lado.
 *
 * O DEFEITO QUE ISTO CORRIGE. A régua tinha filtros aplicados a UM LADO SÓ:
 *
 *  1. TOKEN DE CONCLUSÃO. O `.brd` grava o clique em Done como
 *     `done | ButtonPressed | "-1"`, e `ehMecanico` já o retira do lado do
 *     ESPECIALISTA. O agente escreve o MESMO clique como "ok"/"done"/
 *     "concluído"/"convert" — e isso entrava no denominador da precisão como
 *     falso positivo garantido, porque o alvo correspondente havia sido
 *     removido. Medido: 439 de 4.469 estados de agente = 9,8 %, em todos os 5
 *     corpora (7,6 % a 11,6 %).
 *
 *  2. PROSA EM ERRO — HIPÓTESE REJEITADA PELO PRÓPRIO TESTE DE SIMETRIA,
 *     registrada aqui para que ninguém a reintroduza. A suspeita era que os
 *     850 de 6.021 valores de erro do agente que não são número/fração (14,1 %)
 *     fossem lixo, e que a régua já filtrasse prosa do lado humano via
 *     `ehValorUtilizavel`. AS DUAS PREMISSAS ESTAVAM ERRADAS:
 *       (a) `ehValorUtilizavel` NÃO é usada em `carregarReferencia` — só em
 *           analysis/validacao-v2/validar.mjs. O lado humano nunca filtrou prosa;
 *       (b) o gabarito humano tem os mesmos valores: no 8.12, 132 dos 209 erros
 *           do especialista são "*" (o operador, entrada legítima do combo).
 *     E os valores do agente também são legítimos: dos 850, 628 (73,9 %) são
 *     opções de combo box do 6.20 ("Miranda lives closer to the school."),
 *     220 (25,9 %) são símbolos curtos ("*", "/"), e apenas 2 (0,2 %) são lixo
 *     de serialização. NÃO HÁ PROBLEMA DE PROSA. O reparo foi descartado.
 *
 * NEUTRALIZAR, NÃO REMOVER. O passo do agente não é apagado do array: o seu
 * VALOR é zerado. Motivo: erros e dicas são ancorados por NÚMERO DE PASSO
 * (`e.passo`), e remover elementos deslocaria a numeração, alterando
 * `errosNoEstadoCerto` — que este reparo NÃO deve tocar. Com neutralização, o
 * passo continua ocupando a sua posição, some do casamento (canonAnswer vazio
 * nunca casa) e some do denominador da precisão (`.filter(Boolean)`).
 *
 * INVARIANTE, verificado por teste: o reparo pode mover APENAS a família da
 * precisão (precisaoEstados, f1Estados, e as contagens descritivas de estados
 * a mais). cobertura em ordem, cobertura sem ordem, caminho íntegro, erros no
 * estado certo e dicas no estado certo têm de sair IDÊNTICOS.
 */
import { ehValorUtilizavel } from "../validacao-v2/lib.mjs";

/** Lista CONGELADA — publicar literalmente no artigo. */
export const TOKENS_CONCLUSAO = Object.freeze([
  "ok", "done", "concluido", "concluida", "concluir", "completed", "complete",
  "finish", "finalizar", "pronto", "fim", "end", "terminar",
  "convert", "converted", "converter", "convertido", "converta",
]);
const CONCLUSAO = new Set(TOKENS_CONCLUSAO);

/** Normalização de rótulo: sem acento, minúsculo, espaços/underscores colapsados. */
export const normalizarRotulo = (s) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/[_\s]+/g, " ");

/** O rótulo é o clique de conclusão (o que o `.brd` grava como "-1")? */
export const ehTokenDeConclusao = (v) => CONCLUSAO.has(normalizarRotulo(v));

/**
 * REJEITADA. Mantida exportada só para que o teste de simetria continue
 * provando que ela é assimétrica — é o registro de uma regra que NÃO entrou.
 * Nunca usar em métrica.
 */
export const ehProsa = (v) => {
  const s = String(v ?? "").trim();
  if (!s) return false; // vazio já é tratado como mecânico
  return !ehValorUtilizavel(s) && !/^-?\d+([.,]\d+)?(\s*\/\s*-?\d+)?%?$/.test(s);
};

/**
 * Cópia do grafo do agente com os dois reparos aplicados. Passos são
 * NEUTRALIZADOS (valor zerado), nunca removidos — a numeração é preservada.
 * Devolve também a contagem do que foi neutralizado, para relatório.
 */
export function grafoSimetrico(grafo, { tokenDeConclusao = true } = {}) {
  const passos = (grafo?.passos || []).map((p) =>
    tokenDeConclusao && ehTokenDeConclusao(p.valor) ? { ...p, valor: "", neutralizado: "token-de-conclusao" } : p
  );
  // erros ficam INTACTOS: o reparo de prosa foi rejeitado pelo teste de simetria (ver cabeçalho).
  return {
    grafo: { ...grafo, passos },
    reparos: { passosNeutralizados: passos.filter((p) => p.neutralizado).length },
  };
}

/**
 * TESTE DE SIMETRIA — a barreira que faltava. Roda uma regra do agente contra
 * o caminho de VALOR do especialista e conta quantos estados ela atingiria.
 * Uma regra de reparo só é legítima se este número for ZERO: ela tem de
 * remover do agente exatamente aquilo que a régua já removia do especialista,
 * e nada além. Um número > 0 significa que a "correção" está apagando
 * evidência do lado humano — isto é, favorecendo o agente.
 */
export function verificarSimetria(REF, regra) {
  let total = 0;
  const atingidos = [];
  for (const [ex, r] of Object.entries(REF || {})) {
    for (const c of r.caminho || []) {
      if (c.sistema || c.mecanico || !c.valor) continue;
      total++;
      if (regra(c.bruto) || regra(c.valor)) atingidos.push({ ex, bruto: c.bruto, valor: c.valor });
    }
  }
  return { total, atingidos: atingidos.length, exemplos: atingidos.slice(0, 10), simetrica: atingidos.length === 0 };
}

/** Mesma verificação para os itens de ERRO do especialista. */
export function verificarSimetriaErros(REF, regra) {
  let total = 0;
  const atingidos = [];
  for (const [ex, r] of Object.entries(REF || {})) {
    for (const it of r.items || []) {
      total++;
      if (regra(it.bruto)) atingidos.push({ ex, bruto: it.bruto });
    }
  }
  return { total, atingidos: atingidos.length, exemplos: atingidos.slice(0, 10), simetrica: atingidos.length === 0 };
}
