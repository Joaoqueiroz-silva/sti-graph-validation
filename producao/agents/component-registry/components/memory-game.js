/**
 * memory_game — pareamento 1:1 de 4-6 pares.
 *
 * Self-contained: schema, exemplos, detector de agregação, regras de uso.
 * Loader pega esse arquivo automaticamente. Pra adicionar componente novo:
 * basta criar arquivo similar em components/.
 */

import { z } from "zod";

const cardSchema = z.object({
  id: z.string().min(1),
  content: z.string().min(1).max(80),
  pairId: z.string().min(1),
});

const componentPropsSchema = z
  .object({
    cards: z
      .array(cardSchema)
      .min(6, "memory_game precisa de >=3 pares (6 cards)")
      .max(16, "memory_game não suporta mais que 8 pares"),
  })
  .refine(
    (data) => {
      const pairCounts = {};
      for (const c of data.cards) pairCounts[c.pairId] = (pairCounts[c.pairId] || 0) + 1;
      return Object.values(pairCounts).every((n) => n === 2);
    },
    { message: "Cada pairId deve aparecer exatamente 2 vezes" }
  );

export default {
  id: "memory_game",
  rendererPath: "frontend/src/components/RichStep/MemoryGameLab.jsx",

  description:
    "Jogo de memória com pareamento 1:1 entre 3-8 pares. Aluno vira cards e encontra os pares.",

  whenToUse: [
    "Associação 1:1 entre 2 conjuntos: capital↔país, palavra↔sinônimo, animal↔filhote, símbolo↔elemento",
    "Pareamento de termos em 2 idiomas: cachorro↔dog",
    "4+ steps de 'qual o X de Y?' com eas todas distintas → fundir num memory_game",
  ],

  whenNotToUse: [
    "Classificação multi-categoria (use card_sort_lab)",
    "Ordem temporal/cronológica (use image_sequence)",
    "Resposta única numérica ou booleana",
  ],

  schema: componentPropsSchema,

  answerContract: {
    accepts: ["ok-token"],
    rejects: ["numeric-pure", "boolean", "fraction"],
  },

  // 2026-08-16 (F0 do caderno): papel deste componente no modo worksheet;
  // ver SPEC-FORMAT.md secao `notebook` e NOTEBOOK_* em shared/component-sets.js.
  notebook: {
    roles: ["B"],
  },

  pedagogicalGuard: ({ instruction = "" }) => {
    const lower = String(instruction).toLowerCase();
    if (/qual\s+o\s+resultado|calcule|some|subtraia/i.test(lower)) {
      return "memory_game não serve pra cálculo numérico";
    }
    return null;
  },

  examples: [
    {
      context: "Geografia EF — pareamento país↔capital",
      instruction: "Encontre os pares: país e sua capital.",
      expectedAnswer: "ok",
      componentProps: {
        cards: [
          { id: "a0", content: "Brasil", pairId: "a" },
          { id: "a1", content: "Brasília", pairId: "a" },
          { id: "b0", content: "França", pairId: "b" },
          { id: "b1", content: "Paris", pairId: "b" },
          { id: "c0", content: "Japão", pairId: "c" },
          { id: "c1", content: "Tóquio", pairId: "c" },
          { id: "d0", content: "Alemanha", pairId: "d" },
          { id: "d1", content: "Berlim", pairId: "d" },
        ],
      },
    },
    {
      context: "Português EF — sinônimos",
      instruction: "Encontre os pares: palavra e seu sinônimo.",
      expectedAnswer: "ok",
      componentProps: {
        cards: [
          { id: "a0", content: "Feliz", pairId: "a" },
          { id: "a1", content: "Alegre", pairId: "a" },
          { id: "b0", content: "Triste", pairId: "b" },
          { id: "b1", content: "Melancólico", pairId: "b" },
          { id: "c0", content: "Rápido", pairId: "c" },
          { id: "c1", content: "Veloz", pairId: "c" },
        ],
      },
    },
  ],

  /**
   * Agregação: detecta padrão match-pairs em N steps com mesmas KC + eas distintas.
   * Recebe lista de steps (cross-problem ok), retorna { simpleSpec, stepIds } ou null.
   */
  aggregationDetector(steps) {
    if (!Array.isArray(steps) || steps.length < 3) return null;
    const eas = steps.map((s) =>
      String(s.expectedAnswer || "")
        .trim()
        .toLowerCase()
    );
    const uniqueEas = new Set(eas.filter(Boolean));
    if (uniqueEas.size !== steps.length) return null; // precisa cardinalidade 1:1
    if (uniqueEas.size < 3 || uniqueEas.size > 8) return null;

    // Rejeita quando KC ou eas indicam SEQUÊNCIA ordenada — image_sequence cuida disso.
    const kcOrderRegex = /(ciclo|etapa|fase|processo|sequenc|ordem|cronolog)/i;
    if (steps.some((s) => kcOrderRegex.test(String(s.kc || "")))) return null;
    const easNorm = eas.map((e) => e.normalize("NFD").replace(/[̀-ͯ]/g, ""));
    const KNOWN_SEQUENCES = [
      ["evaporacao", "condensacao", "precipitacao", "infiltracao"],
      ["ovo", "larva", "lagarta", "casulo", "borboleta"],
      ["nova", "crescente", "cheia", "minguante"],
    ];
    const matchesSeq = KNOWN_SEQUENCES.some((seq) =>
      easNorm.every((ea) => seq.some((s) => ea.includes(s) || s.includes(ea)))
    );
    if (matchesSeq) return null;

    const pairs = [];
    for (const s of steps) {
      const ea = String(s.expectedAnswer || "").trim();
      const item = _extractEntity(s.instruction, ea);
      if (!item || item.length < 2) return null;
      // 2026-08-05: par DEGENERADO — as duas metades sao a mesma palavra. E o
      // sintoma de que a extracao nao achou entidade nenhuma e devolveu um
      // pedaco do proprio gabarito ("Ponta" <-> "Ponta_onda"). Parear uma carta
      // com ela mesma nao ensina nada; melhor nao agregar.
      if (_ehPardegenerado(item, ea)) return null;
      pairs.push([_capitalize(item), _capitalize(ea)]);
    }
    return {
      componentId: "memory_game",
      componentProps: { cards: _pairsToCards(pairs) },
      stepIds: steps.map((s) => s.id),
      instruction: "Encontre os pares correspondentes.",
      expectedAnswer: "ok",
    };
  },
};

function _ehPardegenerado(item, ea) {
  const a = _chaveVerbo(item).replace(/[_-]+/g, " ").trim();
  const b = _chaveVerbo(ea).replace(/[_-]+/g, " ").trim();
  if (!a || !b) return true;
  if (a === b) return true;
  // Uma metade contida na outra como PALAVRA inteira (evita casar "ave" em
  // "caverna", que sao entidades legitimamente distintas).
  const palavras = (t) => new Set(t.split(/\s+/).filter(Boolean));
  const pa = palavras(a);
  const pb = palavras(b);
  for (const w of pa) if (w.length >= 3 && pb.has(w)) return true;
  return false;
}

function _pairsToCards(pairs) {
  const cards = [];
  pairs.forEach((pair, i) => {
    const pairId = String.fromCharCode(97 + i); // a, b, c, ...
    cards.push({ id: `${pairId}0`, content: String(pair[0]), pairId });
    cards.push({ id: `${pairId}1`, content: String(pair[1]), pairId });
  });
  return cards;
}

function _capitalize(s) {
  if (!s) return "";
  return String(s).charAt(0).toUpperCase() + String(s).slice(1);
}

/**
 * 2026-08-05 (bateria de Artes): em português TODA frase começa com maiúscula,
 * então o regex de "nome próprio" casava com o VERBO DE COMANDO inicial. Um
 * passo "Clique na ponta da onda..." virava a carta `"Clique"`, e o jogo da
 * memória pedia ao aluno para parear `"Clique" ↔ "Ponta_onda"` e
 * `"Selecione" ↔ "Movimento e dinamismo"`. Não era só perda de passos: o
 * conteúdo entregue era lixo.
 *
 * Verbo de comando nunca é entidade. Quando sobra só ele, `_extractEntity`
 * devolve "" e o detector inteiro retorna null — melhor não agregar do que
 * agregar errado.
 */
const VERBOS_DE_COMANDO = new Set([
  "clique",
  "selecione",
  "observe",
  "identifique",
  "marque",
  "associe",
  "arraste",
  "ligue",
  "conecte",
  "escolha",
  "encontre",
  "complete",
  "relacione",
  "ordene",
  "indique",
  "aponte",
  "toque",
  "desenhe",
  "escreva",
  "digite",
  "calcule",
  "determine",
  "classifique",
  "compare",
  "analise",
  "monte",
  "construa",
  "descubra",
  "assinale",
  "preencha",
  "leia",
  "veja",
  "note",
  "considere",
]);

const _chaveVerbo = (t) =>
  String(t || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

// Palavras interrogativas e genéricas do enunciado. Estavam declaradas DENTRO
// de _extractEntity e só eram consultadas no fallback — o caminho principal (o
// regex de palavra capitalizada) nunca as via. Resultado medido: um passo
// "Qual é a capital do Ceará?" gerava o par `"Qual" ↔ "Fortaleza"`. Agora a
// lista é única e vale nos três caminhos.
const PALAVRAS_NAO_ENTIDADE = new Set([
  "qual",
  "quais",
  "como",
  "onde",
  "quando",
  "quem",
  "para",
  "esse",
  "essa",
  "este",
  "esta",
  "filhote",
  "filhotes",
  "capital",
  "sinonimo",
  "antonimo",
]);

const _ehComando = (t) => VERBOS_DE_COMANDO.has(_chaveVerbo(t));

/** Serve como metade de um par no jogo da memória? */
const _podeSerEntidade = (t) => {
  const chave = _chaveVerbo(t);
  return chave.length >= 3 && !VERBOS_DE_COMANDO.has(chave) && !PALAVRAS_NAO_ENTIDADE.has(chave);
};

function _extractEntity(instruction, ea) {
  const instr = String(instruction || "").trim();
  if (!instr) return "";
  // Remove a ea pra evitar usá-la como entidade
  const cleaned = ea
    ? instr.replace(new RegExp(ea.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "")
    : instr;
  // Procura nome próprio composto (ex: peixe-palhaço)
  const compound = cleaned.match(/\b([A-ZÁÉÍÓÚ][a-záéíóúâêôãõç]+(?:-[a-záéíóúâêôãõç]+)+)\b/);
  if (compound && _podeSerEntidade(compound[1])) return compound[1];
  // Nome próprio simples capitalizado — mas NUNCA o verbo de comando inicial.
  for (const m of cleaned.matchAll(/\b([A-ZÁÉÍÓÚ][a-záéíóúâêôãõç]{3,})\b/g)) {
    if (_podeSerEntidade(m[1])) return m[1];
  }
  // Fallback: primeira palavra >= 4 chars que possa ser entidade
  const tokens = cleaned.split(/[\s.,;:!?()]+/).filter(Boolean);
  for (const t of tokens) {
    const norm = t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (norm.length >= 4 && _podeSerEntidade(t)) return t;
  }
  return "";
}
