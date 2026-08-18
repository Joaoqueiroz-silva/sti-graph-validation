/**
 * concept_map - conexoes rotuladas entre conceitos.
 */

import { z } from "zod";

const nodeSchema = z
  .object({
    id: z.string().min(1).max(48),
    label: z.string().min(1).max(80),
    x: z.number().min(0).max(100),
    y: z.number().min(0).max(100),
  })
  .passthrough();

const edgeSchema = z
  .object({
    from: z.string().min(1).max(48),
    to: z.string().min(1).max(48),
    label: z.string().min(1).max(80).optional(),
  })
  .passthrough();

const componentPropsSchema = z
  .object({
    nodes: z.array(nodeSchema).min(3).max(10),
    relationLabels: z.array(z.string().min(1).max(80)).min(1).max(6).optional(),
    correctEdges: z.array(edgeSchema).min(2).max(12),
    hint: z.string().max(180).optional(),
  })
  .passthrough();

function edgeToString(edge) {
  return `${edge.from}--${edge.label || "relaciona"}-->${edge.to}`;
}

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

/**
 * Lê a lista de arestas do gabarito, nos dois formatos que aparecem na prática:
 *  - canônico do componente: "a--rel-->b;c--rel-->d"
 *  - simplificado do worker:  "a-b,c-d"  (também aceita ";" e "|")
 */
export function parseEdgesFromAnswer(expectedAnswer) {
  const bruto = String(expectedAnswer ?? "").trim();
  if (!bruto) return [];

  if (bruto.includes("-->")) {
    return bruto
      .split(";")
      .map((parte) => {
        const m = parte.trim().match(/^(.+?)--(.*?)-->(.+)$/);
        if (!m) return null;
        const from = m[1].trim();
        const to = m[3].trim();
        if (!from || !to || from === to) return null;
        return { from, to, label: m[2].trim() || "relaciona" };
      })
      .filter(Boolean);
  }

  return bruto
    .split(/[,;|]/)
    .map((par) => {
      const texto = par.trim();
      // Ids usam underscore; o hífen é o separador do par. Sem hífen interno,
      // o primeiro hífen é o ponto de corte.
      const corte = texto.indexOf("-");
      if (corte <= 0 || corte >= texto.length - 1) return null;
      const from = texto.slice(0, corte).trim();
      const to = texto.slice(corte + 1).trim();
      if (!from || !to || from === to) return null;
      return { from, to, label: "relaciona" };
    })
    .filter(Boolean);
}

/** "marco_touros" -> "Marco Touros" (o aluno lê o rótulo, não o id). */
export function humanizeNodeId(id) {
  return String(id ?? "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((palavra) => (palavra ? palavra[0].toUpperCase() + palavra.slice(1) : palavra))
    .join(" ")
    .slice(0, 80);
}

export default {
  id: "concept_map",
  rendererPath: "frontend/src/components/RichStep/v2/ConceptMap.jsx",

  description: "Aluno cria arestas rotuladas entre conceitos pre-posicionados.",

  whenToUse: [
    "Conectar conceitos por relacoes causais/sequenciais",
    "Mapa conceitual com 3-10 nos",
    "Bloom analisar/avaliar/criar",
  ],

  whenNotToUse: [
    "Aluno pequeno ou tarefa de baixa carga cognitiva",
    "Pareamento simples 1:1 (use matching_pairs/memory_game)",
    "Sequencia linear (use timeline_constructor ou drag_to_order)",
  ],

  schema: componentPropsSchema,

  answerContract: {
    accepts: ["edge-map"],
    rejects: [
      "numeric-pure",
      "fraction",
      "time",
      "coordinate",
      "boolean",
      "ok-token",
      "assignment-map",
    ],
  },

  // 2026-08-16 (F0 do caderno): papel deste componente no modo worksheet;
  // ver SPEC-FORMAT.md secao `notebook` e NOTEBOOK_* em shared/component-sets.js.
  notebook: {
    roles: ["B"],
  },

  repairs: {
    // 2026-08-04 (STI "Exploradores do Tempo Potiguar", passo 1): o agente 6
    // escolheu concept_map, escreveu o gabarito
    // "marco_touros-litoral_touros,marco_touros-posse_portuguesa" e NÃO
    // preencheu `nodes` nem `correctEdges`. Schema falhou, a recuperação
    // universal degradou para caixa de texto e o aluno recebeu a instrução
    // "Monte o mapa ligando o monumento ao lugar e ao evento" com um campo onde
    // teria de DIGITAR aquela string, com underscores, hífens e vírgula exatos.
    //
    // Mas o gabarito É a lista de arestas — os nós e as ligações estavam ali o
    // tempo todo. Reconstruir o mapa a partir dele devolve exatamente a
    // interação que a instrução promete.
    "schema-fail": (step) => {
      const arestas = parseEdgesFromAnswer(step?.expectedAnswer);
      if (arestas.length < 2 || arestas.length > 12) return null;

      const ids = [...new Set(arestas.flatMap((a) => [a.from, a.to]))];
      if (ids.length < 3 || ids.length > 10) return null;
      if (ids.some((id) => !id || id.length > 48)) return null;

      // Distribui os nós num círculo: posição estável, sem sobreposição, e
      // nenhuma pista sobre quais deles se ligam.
      const nodes = ids.map((id, indice) => {
        const angulo = -Math.PI / 2 + (indice * 2 * Math.PI) / ids.length;
        return {
          id,
          label: humanizeNodeId(id),
          x: Math.round(50 + Math.cos(angulo) * 32),
          y: Math.round(50 + Math.sin(angulo) * 32),
        };
      });

      const rotulos = [...new Set(arestas.map((a) => a.label))].slice(0, 6);
      const canonico = arestas.map(edgeToString).join(";");
      const original = String(step?.expectedAnswer ?? "").trim();

      return {
        ...step,
        // O guard exige que o gabarito seja a serialização canônica das arestas.
        // O formato original do worker continua aceito na correção.
        expectedAnswer: canonico,
        acceptableVariations: [
          ...new Set([canonico, original, ...(step?.acceptableVariations || [])]),
        ].filter(Boolean),
        componentProps: {
          ...(step?.componentProps || {}),
          nodes,
          relationLabels: rotulos.length ? rotulos : ["relaciona"],
          correctEdges: arestas,
        },
        _repairedFrom: "concept_map:edges-from-answer",
      };
    },
  },

  pedagogicalGuard: ({ ea = "", componentProps = {} }) => {
    const nodes = new Set((componentProps.nodes || []).map((node) => node.id));
    for (const edge of componentProps.correctEdges || []) {
      if (!nodes.has(edge.from) || !nodes.has(edge.to))
        return "correctEdges referencia node inexistente";
    }
    const expected = (componentProps.correctEdges || []).map(edgeToString).join(";");
    if (normalize(ea) !== normalize(expected)) return "expectedAnswer nao bate com correctEdges";
    return null;
  },

  examples: [
    {
      context: "Ciencias EF - ciclo da agua",
      instruction: "Conecte os conceitos do ciclo da agua.",
      expectedAnswer: "evap--leva a-->cond;cond--leva a-->prec",
      componentProps: {
        nodes: [
          { id: "evap", label: "Evaporacao", x: 20, y: 50 },
          { id: "cond", label: "Condensacao", x: 50, y: 25 },
          { id: "prec", label: "Precipitacao", x: 80, y: 50 },
        ],
        relationLabels: ["leva a"],
        correctEdges: [
          { from: "evap", to: "cond", label: "leva a" },
          { from: "cond", to: "prec", label: "leva a" },
        ],
      },
    },
  ],
};
