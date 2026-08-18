/**
 * drag_to_order — ordenação genérica por drag-and-drop.
 *
 * Diferente de image_sequence (cronológico/ciclos): drag_to_order serve pra
 * qualquer ordenação (alfabética, numérica, hierárquica, lógica).
 */

import { z } from "zod";

const itemSchema = z.union([
  z.string().min(1).max(80),
  z.object({
    id: z.string().optional(),
    label: z.string().min(1).max(80),
    value: z.string().optional(),
  }),
]);

const componentPropsSchema = z
  .object({
    items: z.array(itemSchema).min(3).max(10),
  })
  .passthrough();

// Gabaritos de agregação ("acertou tudo") não descrevem sequência nenhuma.
const OK_TOKENS = new Set(["ok", "acertou", "completo", "concluido", "pronto"]);

const _chaveSimples = (v) =>
  String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

const _valorDaPeca = (item) =>
  typeof item === "string" ? item.trim() : String(item?.value ?? item?.label ?? "").trim();

/**
 * _segmentarSequencia — parte o gabarito na sequência de peças que o produz.
 *
 * Split ingênuo em "," não serve: valor de peça PODE conter vírgula (decimal
 * pt-BR, "6,5"), e aí "6,5,7,0" é ambíguo entre ["6,5","7,0"] e ["6","5","7","0"].
 * Resolve casando contra o vocabulário real das peças, do maior para o menor,
 * com backtracking. Retorna a lista de peças na ordem do gabarito, ou null se
 * o gabarito não for produzível por elas.
 */
function _segmentarSequencia(ea, valores) {
  const alvo = String(ea ?? "").trim();
  if (!alvo) return null;
  const vocab = [...new Set(valores.map((v) => String(v).trim()).filter(Boolean))].sort(
    (a, b) => b.length - a.length
  );
  if (!vocab.length) return null;

  // O autor escreve "Banana, Laranja" (com espaço) e o runtime junta sem
  // espaço — os dois são a MESMA resposta, então a segmentação ignora espaço
  // em volta do separador. Sem isso os próprios exemplos do componente
  // seriam acusados de irrespondíveis.
  const pularEspacos = (i) => {
    let p = i;
    while (p < alvo.length && /\s/.test(alvo[p])) p++;
    return p;
  };

  const semSaida = new Set(); // posições já provadas sem continuação
  const busca = (posBruta) => {
    const pos = pularEspacos(posBruta);
    if (pos === alvo.length) return [];
    if (semSaida.has(pos)) return null;
    for (const v of vocab) {
      if (!alvo.startsWith(v, pos)) continue;
      const fim = pularEspacos(pos + v.length);
      if (fim === alvo.length) return [v];
      if (alvo[fim] !== ",") continue;
      const resto = busca(fim + 1);
      if (resto) return [v, ...resto];
    }
    semSaida.add(pos);
    return null;
  };
  return busca(0);
}

function _mesmoMulticonjunto(a, b) {
  if (a.length !== b.length) return false;
  const conta = (lista) => {
    const m = new Map();
    for (const v of lista) m.set(v, (m.get(v) || 0) + 1);
    return m;
  };
  const ma = conta(a);
  const mb = conta(b);
  if (ma.size !== mb.size) return false;
  for (const [k, n] of ma) if (mb.get(k) !== n) return false;
  return true;
}

function _reconstruirPecas(step) {
  const cp = step.componentProps || {};
  const originais = cp.items || [];
  const seq = _segmentarSequencia(step.expectedAnswer, originais.map(_valorDaPeca));
  // Sem segmentação não há como saber o que o autor quis: devolver null é mais
  // honesto que inventar peças, e deixa a cascata trocar de componente.
  if (!seq || seq.length < 3 || seq.length > 10) return null;

  // Preserva id/label originais de cada valor quando existirem.
  const molde = new Map();
  for (const it of originais) {
    const v = _valorDaPeca(it);
    if (v && !molde.has(v)) molde.set(v, it);
  }
  const items = seq.map((v, i) => {
    const base = molde.get(v);
    if (base && typeof base === "object") return { ...base, value: v, label: base.label ?? v };
    return { id: `peca_${i + 1}`, label: v, value: v };
  });
  return { ...step, componentProps: { ...cp, items } };
}

export default {
  id: "drag_to_order",
  rendererPath: "frontend/src/components/RichStep/DragToOrder.jsx",

  description: "Ordenação genérica por drag-and-drop: alfabética, numérica, hierárquica, lógica.",

  whenToUse: [
    "Ordenar 3-7 items por critério explícito (do menor pro maior, ordem alfabética, hierarquia)",
    "Reorganizar palavras numa frase (alternativa: sentence_builder)",
    "Sequência lógica que NÃO é cronológica/ciclo (esses vão pra image_sequence)",
  ],

  whenNotToUse: [
    "Ciclos naturais ou processos cronológicos (use image_sequence)",
    "Seleção / classificação (use card_sort_lab ou multiple_choice)",
    "Pareamento 1:1 (use memory_game)",
    "Resposta única (use word_matcher / multiple_choice / numeric_keypad)",
  ],

  schema: componentPropsSchema,

  answerContract: {
    accepts: ["sequence", "ok-token"],
    rejects: ["numeric-pure", "boolean", "shape-name", "text-long"],
  },

  // 2026-08-16 (F0 do caderno): papel deste componente no modo worksheet;
  // ver SPEC-FORMAT.md secao `notebook` e NOTEBOOK_* em shared/component-sets.js.
  notebook: {
    roles: ["A", "B"],
  },

  pedagogicalGuard: ({ instruction = "", ea = "", componentProps = {} }) => {
    const items = componentProps.items || [];
    if (items.length < 3) return "drag_to_order precisa de >=3 items";
    // Anti-pattern: instrução de SELEÇÃO ("selecione todos os X") em vez de ordem
    const lower = String(instruction).toLowerCase();
    const isSelection =
      /\b(selecione|marque|escolha|identifique)\b/.test(lower) &&
      !/\b(ordem|ordene|sequenc|primeira|primeiro|crescente|decrescente)\b/.test(lower);
    if (isSelection) {
      return "drag_to_order com instrução de seleção — use card_sort_lab ou multiple_choice";
    }

    // 2026-08-05 (bateria de Matemática, "média/moda/mediana"): o contrato
    // checava quantidade de peças e verbo da instrução, mas NUNCA a única
    // coisa que decide se o passo é respondível — as peças da tela conseguem
    // produzir o gabarito? O runtime emite
    // `items.map(v => v.value ?? v.label).join(",")` (DragToOrder.jsx), logo o
    // gabarito TEM de ser uma permutação das peças unida por vírgula.
    // Caso real: "Organize as sete notas..." com gabarito
    // "6,5,7,0,7,0,7,0,8,5,8,5,9,0" (7 notas decimais) e só 6 peças na tela —
    // faltava uma peça "7,0", e o aluno não tinha como acertar nunca.
    // Mesma família do number_line com gabarito fora da reta.
    const alvo = String(ea ?? "").trim();
    if (alvo && !OK_TOKENS.has(_chaveSimples(alvo))) {
      const valores = items.map(_valorDaPeca).filter(Boolean);
      const seq = _segmentarSequencia(alvo, valores);
      if (!seq) {
        return {
          message: "gabarito de ordenação não é produzível pelas peças da tela",
          errorCode: "sequencia-nao-produzivel",
        };
      }
      if (!_mesmoMulticonjunto(seq, valores)) {
        return {
          message: `peças não batem com o gabarito (gabarito pede ${seq.length}, tela tem ${valores.length})`,
          errorCode: "itens-nao-batem-com-gabarito",
        };
      }
    }
    return null;
  },

  repairs: {
    // O gabarito é autoritativo: é contra ele que a resposta do aluno é
    // comparada, e a instrução ("as sete notas") concorda com ele. Quem está
    // errado é a lista de peças. Reconstrói as peças a partir da segmentação
    // do gabarito pelo VOCABULÁRIO que o autor já escreveu — nunca por split
    // ingênuo em vírgula, que picotaria "6,5" em "6" e "5" e transformaria uma
    // atividade de ordenar notas numa de ordenar algarismos.
    "itens-nao-batem-com-gabarito": (step) => _reconstruirPecas(step),
    "sequencia-nao-produzivel": (step) => _reconstruirPecas(step),
  },

  examples: [
    {
      context: "Português EF — ordem alfabética",
      instruction: "Ordene as palavras em ordem alfabética.",
      expectedAnswer: "Banana, Laranja, Maçã, Uva",
      componentProps: {
        items: [
          { id: "banana", label: "Banana" },
          { id: "laranja", label: "Laranja" },
          { id: "maca", label: "Maçã" },
          { id: "uva", label: "Uva" },
        ],
      },
    },
    {
      context: "Matemática EF — ordem crescente",
      instruction: "Ordene os números do menor para o maior.",
      expectedAnswer: "3, 7, 12, 25",
      componentProps: {
        items: ["12", "3", "25", "7"],
      },
    },
  ],

  /**
   * Sem aggregationDetector — drag_to_order é tipicamente 1 step,
   * não agregável de N word_matchers (esses são image_sequence se houver ordem cronológica).
   */
};
