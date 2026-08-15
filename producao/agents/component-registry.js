/**
 * component-registry.js — Catálogo centralizado de TODOS os componentes
 * disponíveis pra renderização de step (v1 legacy + v2 catálogo novo).
 *
 * Cada manifest descreve:
 *   - id, renderAs, category (v0/v1/v2)
 *   - inputType: tipo REAL de input ("typed-numeric", "typed-text", "drag-order",
 *     "drag-build", "drag-label", "drag-pair", "click-target", "manipulate",
 *     "mc-button"). Identifica se o componente dá input genuíno ou é MC visualizado.
 *   - displayName por idioma (PT/EN/ES/FR)
 *   - description: usado por buscador semântico
 *   - disciplines, ageRange, bloom, cognitiveLoad
 *   - requiredProps, fallback (componente alternativo se props insuficientes)
 *   - examples: few-shot pra LLM tie-breaker
 *   - pedagogyNotes: justificativa pedagógica curta
 *
 * Uso:
 *   import { listAllComponents, getManifest, listByInputType, listByDiscipline }
 *     from "./component-registry.js"
 */

import { LEGACY_MANIFESTS } from "./component-registry-legacy-manifests.js";
import { LAB_MANIFESTS } from "./component-registry-lab-manifests.js";
import { logger } from "../lib/logger.js";

// 2026-04-27: Manifests v2 — componentes novos com input genuíno
// 2026-05-21 Fix F: paths corrigidos. Antes apontava pro frontend que não
// está montado no container do backend (only /app/agents é visível). Agora os
// manifests vivem em uma cópia local ./component-registry/v2-manifests/, sincronizada
// no build/deploy. Em DEV (sem Docker), o backend pode rodar com link simbólico.
const V2_MANIFEST_PATHS = {
  area_model_fraction: "./component-registry/v2-manifests/AreaModelFraction.manifest.js",
  equation_builder: "./component-registry/v2-manifests/EquationBuilder.manifest.js",
  cloze_test: "./component-registry/v2-manifests/ClozeTest.manifest.js",
  diagram_labeler: "./component-registry/v2-manifests/DiagramLabeler.manifest.js",
  timeline_constructor: "./component-registry/v2-manifests/TimelineConstructor.manifest.js",
  hot_spot: "./component-registry/v2-manifests/HotSpot.manifest.js",
  card_sort: "./component-registry/v2-manifests/CardSort.manifest.js",
  matching_pairs: "./component-registry/v2-manifests/MatchingPairs.manifest.js",
  concept_map: "./component-registry/v2-manifests/ConceptMap.manifest.js",
};

const ALL_ANSWER_KINDS = [
  "numeric-pure",
  "numeric-with-unit",
  "shape-name",
  "sequence",
  "coordinate",
  "fraction",
  "expression",
  "time",
  "boolean",
  "text-short",
  "text-long",
  "unknown",
  // 2026-08-05 (auditoria Adjetivos): o detector lib/answer-shape.js emite
  // estes kinds desde as interfaces ricas, mas esta lista (2026-05-03) nunca
  // os recebeu — manifest sem answerContract proprio rejeitava TODO gabarito
  // de pareamento por omissao. "ok-token" fica DE FORA de proposito: passo
  // com gabarito "ok" nao tem resposta real e nao deve rotear para
  // componente rico.
  "mapping-pairs",
  "assignment-map",
  "edge-map",
];

// 2026-05-03: Answer Contract para manifests v2 importados do frontend.
// Mantemos o contrato no registry backend para não obrigar o frontend a conhecer
// a semântica completa de expectedAnswer.
const V2_ANSWER_CONTRACTS = {
  area_model_fraction: {
    answerContract: {
      accepts: ["fraction"],
      rejects: ["numeric-pure", "boolean", "ok-token", "mapping-pairs", "text-long", "expression"],
    },
    interactionMode: "answer",
  },
  equation_builder: {
    answerContract: {
      accepts: ["expression", "unknown"],
      rejects: ["shape-name", "boolean", "sequence", "coordinate", "time", "text-long"],
    },
    interactionMode: "answer",
  },
  cloze_test: {
    answerContract: {
      accepts: ["text-short", "text-long", "unknown"],
      rejects: [
        "numeric-pure",
        "numeric-with-unit",
        "shape-name",
        "boolean",
        "coordinate",
        "fraction",
        "time",
      ],
    },
    interactionMode: "answer",
  },
  diagram_labeler: {
    answerContract: {
      accepts: ["text-short", "sequence", "unknown"],
      rejects: [
        "numeric-pure",
        "numeric-with-unit",
        "shape-name",
        "boolean",
        "coordinate",
        "fraction",
        "time",
        "expression",
      ],
    },
    interactionMode: "answer",
  },
  timeline_constructor: {
    answerContract: {
      // 2026-08-05: "assignment-map" espelha components/timeline-constructor.js
      // (accepts: ["assignment-map"]) — o router rejeitava o kind que o proprio
      // registry validador aceita, e a cascata esgotava com 0 candidatos.
      accepts: ["sequence", "time", "text-short", "unknown", "assignment-map"],
      rejects: [
        "numeric-pure",
        "numeric-with-unit",
        "shape-name",
        "boolean",
        "coordinate",
        "fraction",
        "expression",
      ],
    },
    interactionMode: "answer",
  },
  hot_spot: {
    answerContract: {
      accepts: ["coordinate", "text-short", "unknown"],
      rejects: [
        "numeric-pure",
        "numeric-with-unit",
        "shape-name",
        "boolean",
        "sequence",
        "fraction",
        "time",
        "expression",
        "text-long",
      ],
    },
    interactionMode: "answer",
  },
  card_sort: {
    answerContract: {
      // 2026-08-05: "mapping-pairs" espelha components/card-sort.js.
      accepts: ["sequence", "text-short", "text-long", "unknown", "mapping-pairs"],
      rejects: [
        "numeric-pure",
        "numeric-with-unit",
        "shape-name",
        "coordinate",
        "fraction",
        "time",
        "expression",
      ],
    },
    interactionMode: "manipulate",
  },
  matching_pairs: {
    answerContract: {
      // 2026-08-05: "mapping-pairs" espelha components/matching-pairs.js.
      // Sem isso, o pedagogical-index propunha matching_pairs para gabarito
      // "a<>b;c<>d" e o proprio router o descartava (not-in-accepts).
      accepts: ["sequence", "text-short", "unknown", "mapping-pairs"],
      rejects: [
        "numeric-pure",
        "numeric-with-unit",
        "shape-name",
        "coordinate",
        "fraction",
        "time",
        "expression",
        "text-long",
      ],
    },
    interactionMode: "answer",
  },
  concept_map: {
    answerContract: {
      // 2026-08-05: "edge-map" espelha components/concept-map.js.
      accepts: ["text-short", "text-long", "sequence", "unknown", "edge-map"],
      rejects: [
        "numeric-pure",
        "numeric-with-unit",
        "shape-name",
        "coordinate",
        "fraction",
        "time",
        "boolean",
      ],
    },
    interactionMode: "manipulate",
  },
};

const V2_FALLBACK_META = {
  area_model_fraction: {
    inputType: "paint-grid",
    disciplines: ["matematica"],
    fallback: "fraction_bar",
    description:
      "Aluno pinta a intersecao de duas fracoes num grid (modelo de area de multiplicacao).",
  },
  equation_builder: {
    inputType: "drag-build",
    disciplines: ["matematica", "fisica", "quimica"],
    fallback: "text",
    description: "Aluno monta uma equacao ou expressao selecionando tokens em ordem.",
  },
  cloze_test: {
    inputType: "typed-text",
    disciplines: ["portugues", "english", "espanhol", "frances", "ciencias", "historia"],
    fallback: "text",
    description: "Aluno preenche lacunas digitando respostas curtas no contexto.",
  },
  diagram_labeler: {
    inputType: "drag-label",
    disciplines: ["biologia", "geografia", "ciencias"],
    fallback: "hot_spot",
    description: "Aluno rotula partes de um diagrama arrastando etiquetas para alvos.",
  },
  timeline_constructor: {
    inputType: "drag-order",
    disciplines: ["historia", "ciencias", "geografia"],
    fallback: "drag_to_order",
    description: "Aluno organiza eventos em uma linha do tempo.",
  },
  hot_spot: {
    inputType: "click-target",
    disciplines: ["*"],
    fallback: "multiple_choice",
    description: "Aluno responde clicando em uma area especifica de uma imagem ou mapa.",
  },
  card_sort: {
    inputType: "drag-build",
    disciplines: [
      "biologia",
      "ciencias",
      "portugues",
      "english",
      "geografia",
      "historia",
      "quimica",
    ],
    fallback: "venn_diagram",
    description: "Aluno categoriza cards arrastando itens para grupos.",
  },
  matching_pairs: {
    inputType: "drag-pair",
    disciplines: ["*"],
    fallback: "word_matcher",
    description: "Aluno conecta pares correspondentes entre duas colunas.",
  },
  concept_map: {
    inputType: "drag-build",
    disciplines: ["ciencias", "biologia", "historia", "geografia", "portugues"],
    fallback: "sentence_builder",
    description: "Aluno constrói um mapa conceitual conectando conceitos por relações.",
  },
};

function _fallbackV2Manifest(id) {
  const meta = V2_FALLBACK_META[id];
  if (!meta) return null;
  return {
    id,
    renderAs: id,
    category: "v2",
    displayName: { "pt-BR": id, en: id, es: id, fr: id },
    ageRange: [6, 18],
    bloom: ["apply", "analyze"],
    cognitiveLoad: "medium",
    requiredProps: [],
    ...meta,
    ...(V2_ANSWER_CONTRACTS[id] || {}),
  };
}

// Cache lazy-loaded — primeiro acesso carrega todos os v2.
let _registryCache = null;

async function _loadV2Manifests() {
  const out = {};
  for (const [id, path] of Object.entries(V2_MANIFEST_PATHS)) {
    try {
      const mod = await import(path);
      out[id] = mod.default || mod;
    } catch (e) {
      const fallback = _fallbackV2Manifest(id);
      if (fallback) {
        out[id] = fallback;
      }
      logger.warn(
        {
          module: "component-registry",
          phase: "v2-load",
          id,
          err: e.message,
          fallback: !!fallback,
        },
        fallback
          ? "Failed to load v2 manifest — using backend fallback"
          : "Failed to load v2 manifest"
      );
    }
  }
  return out;
}

async function _ensureRegistry() {
  if (_registryCache) return _registryCache;
  const v2 = await _loadV2Manifests();
  const registry = { ...LEGACY_MANIFESTS, ...v2, ...LAB_MANIFESTS };
  for (const [id, contract] of Object.entries(V2_ANSWER_CONTRACTS)) {
    if (!registry[id] || registry[id].answerContract) continue;
    registry[id] = { ...registry[id], ...contract };
  }
  for (const manifest of Object.values(registry)) {
    if (manifest.id === "multiple_choice" && !manifest.answerContract) {
      manifest.answerContract = { accepts: ALL_ANSWER_KINDS, rejects: [] };
      manifest.interactionMode = "answer";
    }
  }
  _registryCache = registry;
  return _registryCache;
}

/**
 * Retorna manifest único pelo id.
 */
export async function getManifest(id) {
  const reg = await _ensureRegistry();
  return reg[id] || null;
}

/**
 * 2026-06-10 (auditoria): acesso SÍNCRONO best-effort — pro diversifier revalidar
 * answerContract sem virar async. Retorna null se o registry ainda não foi
 * carregado (na pipeline real o router já o carregou antes do diversifier).
 */
export function getManifestSync(id) {
  return _registryCache ? _registryCache[id] || null : null;
}

/**
 * Retorna todos os manifests como objeto { id: manifest }.
 */
export async function listAllComponents() {
  return await _ensureRegistry();
}

/**
 * Filtra por inputType (ex: "drag-build", "typed-numeric").
 */
export async function listByInputType(inputType) {
  const reg = await _ensureRegistry();
  return Object.values(reg).filter((m) => m.inputType === inputType);
}

/**
 * Filtra por disciplina compatível. "*" no manifest = todas as disciplinas.
 */
export async function listByDiscipline(discipline) {
  const reg = await _ensureRegistry();
  const d = String(discipline || "").toLowerCase();
  return Object.values(reg).filter((m) => {
    if (!Array.isArray(m.disciplines)) return false;
    if (m.disciplines.includes("*")) return true;
    return m.disciplines.some((md) => d.includes(md.toLowerCase()) || md.toLowerCase().includes(d));
  });
}

/**
 * Filtra por idade compatível.
 */
export async function listByAge(age) {
  const reg = await _ensureRegistry();
  const n = Number(age);
  if (!Number.isFinite(n)) return [];
  return Object.values(reg).filter((m) => {
    if (!Array.isArray(m.ageRange) || m.ageRange.length !== 2) return true;
    return n >= m.ageRange[0] && n <= m.ageRange[1];
  });
}

/**
 * Componentes com input GENUÍNO (não MC visualizado). Esses são os
 * preferidos quando o objetivo é diversificar a forma de responder.
 */
export async function listGenuineInputComponents() {
  const GENUINE_INPUT_TYPES = new Set([
    "typed-numeric",
    "typed-text",
    "drag-order",
    "drag-build",
    "drag-label",
    "drag-pair",
    "click-target",
    "manipulate",
  ]);
  const reg = await _ensureRegistry();
  return Object.values(reg).filter((m) => GENUINE_INPUT_TYPES.has(m.inputType));
}

/**
 * Estatísticas do catálogo (pra telemetria/debug).
 */
export async function getCatalogStats() {
  const reg = await _ensureRegistry();
  const all = Object.values(reg);
  const byInputType = {};
  const byCategory = {};
  for (const m of all) {
    byInputType[m.inputType] = (byInputType[m.inputType] || 0) + 1;
    byCategory[m.category || "unknown"] = (byCategory[m.category || "unknown"] || 0) + 1;
  }
  return {
    total: all.length,
    byInputType,
    byCategory,
    genuineInputCount: all.filter((m) => {
      const t = m.inputType;
      return t && t !== "mc-button" && t !== "varies";
    }).length,
  };
}
