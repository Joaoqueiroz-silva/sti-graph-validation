/**
 * matching_pairs - conectar itens da coluna A com coluna B.
 */

import { z } from "zod";

const itemSchema = z.union([
  z.string().min(1).max(80),
  z.object({
    id: z.string().min(1).optional(),
    label: z.string().min(1).max(80).optional(),
    text: z.string().min(1).max(80).optional(),
  }),
]);

function itemId(item, prefix, index) {
  if (typeof item === "string") return `${prefix}_${index}`;
  return item.id || `${prefix}_${index}`;
}

/**
 * 2026-08-05: extrai pares de um gabarito serializado. Relacoes aceitas, na
 * ordem: "<>" (canonica do runtime), "=>" (workers antigos), "=" (workers
 * atuais). Pares separados por ";"; a "," so vale como separador quando TODAS
 * as partes tem exatamente uma relacao (licao do timeline em ac37462:
 * "Marco de Touros (1501), padrao de pedra" nao pode ser partido ao meio).
 */
function parseMappingPairs(expectedAnswer) {
  const bruto = String(expectedAnswer ?? "").trim();
  if (!bruto) return null;
  const rel = bruto.includes("<>") ? "<>" : bruto.includes("=>") ? "=>" : "=";
  if (!bruto.includes(rel)) return null;
  const separa = (sep) =>
    bruto
      .split(sep)
      .map((p) => p.trim())
      .filter(Boolean);
  let partes = separa(";");
  if (partes.length < 2 && bruto.includes(",")) {
    const porVirgula = separa(",");
    if (porVirgula.every((p) => p.split(rel).length === 2)) partes = porVirgula;
  }
  if (partes.length < 2) return null;
  const pares = [];
  for (const parte of partes) {
    const lados = parte.split(rel).map((s) => s.trim());
    if (lados.length !== 2 || !lados[0] || !lados[1]) return null;
    pares.push([lados[0], lados[1]]);
  }
  return pares;
}

/** Rotulo legivel: slug vira palavras ("marco_touros" -> "Marco touros"). */
function humanizePairToken(token) {
  const texto = String(token ?? "").trim();
  if (!/[a-z0-9]_[a-z0-9]/i.test(texto)) return texto;
  const limpo = texto.replace(/_/g, " ").trim();
  return limpo.charAt(0).toUpperCase() + limpo.slice(1);
}

const componentPropsSchema = z
  .object({
    leftColumn: z.array(itemSchema).min(2).max(8),
    rightColumn: z.array(itemSchema).min(2).max(8),
    correctPairs: z.record(z.string(), z.string()),
    hint: z.string().max(180).optional(),
  })
  .refine((data) => data.leftColumn.length === data.rightColumn.length, {
    message: "leftColumn e rightColumn devem ter o mesmo tamanho",
  })
  .refine(
    (data) => {
      const leftIds = new Set(data.leftColumn.map((it, i) => itemId(it, "L", i)));
      const rightIds = new Set(data.rightColumn.map((it, i) => itemId(it, "R", i)));
      const entries = Object.entries(data.correctPairs || {});
      return (
        entries.length === data.leftColumn.length &&
        entries.every(([l, r]) => leftIds.has(l) && rightIds.has(r)) &&
        new Set(entries.map(([, r]) => r)).size === entries.length
      );
    },
    { message: "correctPairs deve mapear cada item esquerdo para um item direito valido" }
  );

export default {
  id: "matching_pairs",
  rendererPath: "frontend/src/components/RichStep/v2/MatchingPairs.jsx",

  description:
    "Conecta pares 1:1 em duas colunas: termo-definicao, pais-capital, palavra-traducao.",

  whenToUse: [
    "Associacao 1:1 explicita entre dois conjuntos",
    "Termo e definicao, palavra e sinonimo, pais e capital",
    "Quando o aluno deve construir o pareamento, nao apenas memorizar cartas",
  ],

  whenNotToUse: [
    "Classificacao multi-categoria (use card_sort_lab/card_sort)",
    "Ordem temporal ou sequencial (use image_sequence)",
    "Resposta unica textual/numerica",
  ],

  schema: componentPropsSchema,

  answerContract: {
    accepts: ["mapping-pairs"],
    rejects: ["numeric-pure", "boolean", "ok-token", "fraction"],
  },

  // 2026-08-16 (F0 do caderno): papel deste componente no modo worksheet;
  // ver SPEC-FORMAT.md secao `notebook` e NOTEBOOK_* em shared/component-sets.js.
  notebook: {
    roles: ["B"],
  },

  repairs: {
    // 2026-08-05 (auditoria Adjetivos): 7 passos de pareamento gramatical
    // morreram com "leftColumn undefined [schema-fail] (repair:
    // no-repair-defined)" — mas o gabarito "animado<>alunos;criativo<>..."
    // JA E o pareamento completo: lados esquerdos, direitos e o mapa. Mesmo
    // padrao do timeline_constructor/concept_map. Aceita "<>" (forma canonica
    // que MatchingPairs.jsx emite) e "=" (forma que os workers tambem
    // escrevem); os ids ficam EXATAMENTE iguais aos tokens do gabarito para a
    // emissao do runtime reproduzir o expectedAnswer byte a byte.
    "schema-fail": (step) => {
      let pares = parseMappingPairs(step?.expectedAnswer);
      if (!pares || pares.length < 2) return null;
      // 2026-08-05 (Geografia r2b): o Nordeste tem 9 estados e o schema aceita
      // no maximo 8 pares — o reparo devolvia null e TRES passos morreram pela
      // mesma porta. Ate 12 pares, corta para os 8 primeiros e re-serializa o
      // gabarito de forma consistente (perder 1 par e melhor que perder o
      // passo). Acima de 12 e conteudo degenerado: null honesto.
      if (pares.length > 12) return null;
      if (pares.length > 8) pares = pares.slice(0, 8);

      const leftIds = pares.map(([l]) => l);
      const rightIds = pares.map(([, r]) => r);
      if (new Set(leftIds).size !== leftIds.length) return null;
      // rightColumn precisa de ids unicos (schema exige injetividade).
      if (new Set(rightIds).size !== rightIds.length) return null;
      if ([...leftIds, ...rightIds].some((t) => !t || t.length > 80)) return null;

      const leftColumn = leftIds.map((id) => ({ id, label: humanizePairToken(id) }));
      // Embaralha a coluna direita de forma DETERMINISTICA (rotacao pelo
      // tamanho): resposta correta nunca e "ligar na mesma altura", e testes
      // permanecem estaveis sem Math.random.
      const giro = leftIds.length > 2 ? 1 + (leftIds.length % (rightIds.length - 1)) : 1;
      const rightShuffled = [...rightIds.slice(giro), ...rightIds.slice(0, giro)];
      const rightColumn = rightShuffled.map((id) => ({ id, label: humanizePairToken(id) }));

      const correctPairs = Object.fromEntries(pares);
      // Canonico na ORDEM da leftColumn — a mesma ordem em que o runtime
      // serializa (MatchingPairs.jsx percorre a coluna esquerda).
      const canonico = leftIds.map((l) => `${l}<>${correctPairs[l]}`).join(";");
      const original = String(step?.expectedAnswer ?? "").trim();

      return {
        ...step,
        expectedAnswer: canonico,
        acceptableVariations: [
          ...new Set([canonico, original, ...(step?.acceptableVariations || [])]),
        ].filter(Boolean),
        componentProps: {
          ...(step?.componentProps || {}),
          leftColumn,
          rightColumn,
          correctPairs,
        },
        _repairedFrom: "matching_pairs:pairs-from-answer",
      };
    },
  },

  pedagogicalGuard: ({ componentProps = {} }) => {
    const left = componentProps.leftColumn || [];
    const right = componentProps.rightColumn || [];
    if (left.length !== right.length) return "colunas com tamanhos diferentes";
    return null;
  },

  examples: [
    {
      context: "Geografia EF - paises e capitais",
      instruction: "Conecte cada pais com sua capital.",
      expectedAnswer: "br<>brasilia;fr<>paris;jp<>tokyo",
      componentProps: {
        leftColumn: [
          { id: "br", label: "Brasil" },
          { id: "fr", label: "Franca" },
          { id: "jp", label: "Japao" },
        ],
        rightColumn: [
          { id: "tokyo", label: "Toquio" },
          { id: "brasilia", label: "Brasilia" },
          { id: "paris", label: "Paris" },
        ],
        correctPairs: { br: "brasilia", fr: "paris", jp: "tokyo" },
      },
    },
  ],
};
