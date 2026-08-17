/**
 * Component Registry — descobre automaticamente todos os componentes em components/.
 *
 * Pra adicionar componente novo: criar arquivo em components/<id>.js exportando default
 * com { id, schema, examples, ... }. O loader pega na próxima inicialização.
 */

import { readdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { logger } from "../../lib/logger.js";
import { detectDisciplineArea } from "../discipline-config.js";
import { disciplinesFor, serveDisciplina } from "./component-disciplines.js";
import { NOTEBOOK_ROLE_LABELS } from "../../shared/component-sets.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMPONENTS_DIR = join(__dirname, "components");

let _registry = null;
let _loadPromise = null;

export async function loadRegistry() {
  if (_registry) return _registry;
  if (_loadPromise) return _loadPromise;
  _loadPromise = (async () => {
    const files = readdirSync(COMPONENTS_DIR).filter((f) => f.endsWith(".js"));
    const registry = {};
    for (const f of files) {
      try {
        const mod = await import(pathToFileURL(join(COMPONENTS_DIR, f)).href);
        const entry = mod.default;
        if (!entry || !entry.id || !entry.schema) {
          logger.warn(
            { module: "component-registry", file: f },
            "Entry inválido — falta id ou schema, pulando"
          );
          continue;
        }
        // 2026-08-05: a classificação por disciplina mora num módulo único
        // (component-disciplines.js) e é anexada aqui, em vez de repetida em
        // 44 arquivos de spec — este repo já se queimou com a mesma taxonomia
        // vivendo em cópias divergentes. A spec PODE declarar `disciplines`
        // por conta própria; nesse caso a declaração local vence.
        registry[entry.id] = entry.disciplines
          ? entry
          : { ...entry, disciplines: disciplinesFor(entry.id) };
      } catch (err) {
        logger.error(
          { module: "component-registry", file: f, err: err.message },
          "Falha ao carregar entry do registry"
        );
      }
    }
    _registry = registry;
    logger.info(
      {
        module: "component-registry",
        count: Object.keys(registry).length,
        ids: Object.keys(registry),
      },
      "Registry carregado"
    );
    return registry;
  })();
  return _loadPromise;
}

export async function getEntry(id) {
  const registry = await loadRegistry();
  return registry[id] || null;
}

/**
 * buildCatalogBrief — gera texto curto do catálogo pra Agent6 selecionar componente.
 * Lista cada componente com description + whenToUse + whenNotToUse.
 *
 * 2026-05-23: legacy — mantido pra retrocompatibilidade. Prefira buildLLMCatalog
 * que emite constraints+repairs+exemplos ruins (mais completo).
 */
export async function buildCatalogBrief() {
  const registry = await loadRegistry();
  const lines = ["## CATÁLOGO DE COMPONENTES (registry-driven, schema-validated)", ""];
  for (const entry of Object.values(registry)) {
    lines.push(`### ${entry.id}`);
    lines.push(`Descrição: ${entry.description}`);
    if (entry.whenToUse?.length) {
      lines.push("Use quando:");
      entry.whenToUse.forEach((u) => lines.push(`  - ${u}`));
    }
    if (entry.whenNotToUse?.length) {
      lines.push("NÃO use quando:");
      entry.whenNotToUse.forEach((u) => lines.push(`  - ${u}`));
    }
    if (entry.examples?.length) {
      const ex = entry.examples[0];
      lines.push(`Exemplo (${ex.context}):`);
      lines.push(
        `  { renderAs: "${entry.id}", expectedAnswer: "${ex.expectedAnswer}", componentProps: ${JSON.stringify(ex.componentProps).slice(0, 200)}... }`
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * formatConstraint — converte 1 constraint declarado em string LLM-legível.
 * Exemplo:
 *   { type: "integer", min: 2, max: 24, required: true, reason: "..." }
 *   → "inteiro 2..24 OBRIGATÓRIO (Visibilidade da barra)"
 */
function formatConstraint(c) {
  if (!c || typeof c !== "object") return null;
  const parts = [];
  if (c.type) parts.push(c.type);
  if (c.values?.length) parts.push(`∈ {${c.values.filter((v) => v !== null).join(", ")}}`);
  if (c.range) parts.push(`em [${c.range.min}, ${c.range.max}]`);
  else if (c.min != null && c.max != null) parts.push(`${c.min}..${c.max}`);
  else if (c.min != null) parts.push(`≥ ${c.min}`);
  else if (c.max != null) parts.push(`≤ ${c.max}`);
  if (c.maxLength != null) parts.push(`maxLen=${c.maxLength}`);
  if (c.required) parts.push("OBRIGATÓRIO");
  if (c.regex) parts.push(`regex=${c.regex.source}`);
  if (c.shape) parts.push(`shape=${c.shape}`);
  const head = parts.join(" ");
  return c.reason ? `${head} — ${c.reason}` : head;
}

/**
 * formatNotebookRole — 1 linha "Papel no caderno: ..." a partir de spec.notebook.
 *
 * 2026-08-16 (F0 do caderno): o worker do modo worksheet precisa saber, por
 * componente, se ele cabe numa celula simples (A), numa celula rica (B), se e
 * instrumento compartilhado (C, com os alvos que as celulas podem referenciar)
 * ou figura readOnly (D). Devolve null quando a spec nao declara notebook,
 * para nunca inventar papel.
 */
function formatNotebookRole(notebook) {
  const roles = Array.isArray(notebook?.roles) ? notebook.roles : [];
  if (roles.length === 0) return null;
  const partes = roles.map((papel) => {
    const rotulo = NOTEBOOK_ROLE_LABELS[papel] || "?";
    if (papel === "C" && Array.isArray(notebook?.targets?.kinds) && notebook.targets.kinds.length) {
      const alvos = notebook.targets.kinds
        .map((kind) => {
          const answerKind = notebook.targets.answerKindByKind?.[kind];
          return answerKind ? `${kind}→${answerKind}` : kind;
        })
        .join(", ");
      return `${papel} (${rotulo}; alvos: ${alvos})`;
    }
    return `${papel} (${rotulo})`;
  });
  const compacto = notebook?.compact ? "; compacto" : "";
  return `Papel no caderno: ${partes.join(", ")}${compacto}`;
}

/**
 * buildLLMCatalog — gera catálogo enriquecido pro Agent 6 / UI Designer agents.
 *
 * Diferente de buildCatalogBrief, EMITE:
 *  - constraints declarados (range, type, required) por prop
 *  - llmGuidance.useWhen/avoidWhen (estruturado)
 *  - llmGuidance.goodExamples + badExamples (com solution)
 *  - repairs disponíveis (sinaliza pro LLM que erros podem ser recuperados)
 *
 * Opções:
 *  - disciplines: filtra componentes por disciplina (passa adiante)
 *  - ids: lista de IDs específicos a incluir
 *  - includeRepairs: emite seção de repairs (default true)
 *  - includeNotebook: emite a linha "Papel no caderno" por componente a partir
 *    de spec.notebook (default false). 2026-08-16 (F0 do caderno): so o modo
 *    worksheet liga isso; com false o texto e byte-identico ao anterior, e ha
 *    testes de prompt dos modos simple/rich que dependem disso.
 *
 * O LLM lê isso ANTES de gerar e gera por construção dentro dos limites.
 */
export async function buildLLMCatalog(opts = {}) {
  const {
    ids = null,
    includeRepairs = true,
    includeLegacy = false,
    discipline = null,
    includeNotebook = false,
  } = opts;
  const registry = await loadRegistry();
  const lines = [
    "## CATÁLOGO DE COMPONENTES — CONSTRAINTS RÍGIDOS",
    "",
    "Cada componente abaixo declara constraints técnicas. **Violar = step será descartado** (ou no melhor caso convertido pra um componente fallback). Gere DENTRO dos limites.",
    "",
  ];

  // Filtro por disciplina (se a spec declara disciplines, deve incluir a alvo).
  //
  // 2026-08-05: antes daqui saía o MESMO catálogo para toda disciplina — o
  // filtro existia e era chamado com a disciplina certa, mas nenhuma spec
  // declarava `disciplines` (o campo agora vem de component-disciplines.js,
  // anexado no loadRegistry). Medido na época: catálogo de Artes byte a byte
  // igual ao de Matemática, descrevendo fraction_bar e place_value_blocks.
  //
  // A normalização passa por detectDisciplineArea nos DOIS lados. O casamento
  // por substring anterior era sutilmente quebrado: "linguas" não contém
  // "ingles" nem o contrário, então Inglês perderia word_matcher e
  // sentence_builder — justamente os componentes da matéria.
  const areaAlvo = detectDisciplineArea(discipline || "");

  const entries = Object.values(registry).filter((e) => {
    if (ids && !ids.includes(e.id)) return false;
    // Skip componentes legacy sem constraints declarados (a menos que includeLegacy)
    if (!includeLegacy && !e.constraints && !e.llmGuidance) return false;
    if (discipline && !serveDisciplina(e.id, areaAlvo)) return false;
    return true;
  });

  // Cabeçalho órfão é pior que seção ausente: hoje só 6 dos 44 componentes
  // declaram constraints/llmGuidance, e todos os 6 são de exatas — então
  // disciplinas como Artes ficam sem nenhuma entrada depois do filtro. Emitir
  // "CATÁLOGO — CONSTRAINTS RÍGIDOS" seguido de nada sugeriria ao modelo que
  // não existe componente disponível, que é falso (o catálogo geral do prompt
  // do agente 6 continua listando todos). Melhor não dizer nada.
  if (entries.length === 0) return "";

  for (const entry of entries) {
    lines.push(`### ${entry.id}`);
    if (entry.description) lines.push(entry.description);
    if (includeNotebook) {
      const papel = formatNotebookRole(entry.notebook);
      if (papel) lines.push(papel);
    }
    lines.push("");

    // Constraints — output declarado
    if (entry.constraints) {
      const c = entry.constraints;
      if (c.expectedAnswer) {
        const ea = formatConstraint(c.expectedAnswer);
        if (ea) lines.push(`**expectedAnswer**: ${ea}`);
      }
      if (c.componentProps) {
        lines.push(`**componentProps**:`);
        for (const [key, spec] of Object.entries(c.componentProps)) {
          const desc = formatConstraint(spec);
          if (desc) lines.push(`  - \`${key}\`: ${desc}`);
        }
      }
      lines.push("");
    }

    // LLM Guidance
    if (entry.llmGuidance) {
      const g = entry.llmGuidance;
      if (g.useWhen?.length) {
        lines.push("**USE quando**:");
        g.useWhen.forEach((u) => lines.push(`  - ${u}`));
      }
      if (g.avoidWhen?.length) {
        lines.push("**EVITE quando**:");
        g.avoidWhen.forEach((u) => lines.push(`  - ${u}`));
      }
      if (g.goodExamples?.length) {
        lines.push("**Exemplos corretos**:");
        for (const ex of g.goodExamples) {
          lines.push(`  ✓ ${JSON.stringify(ex).slice(0, 220)}`);
        }
      }
      if (g.badExamples?.length) {
        lines.push("**Exemplos ERRADOS (não faça)**:");
        for (const ex of g.badExamples) {
          lines.push(`  ✗ ${JSON.stringify(ex.attempt).slice(0, 160)}`);
          if (ex.reason) lines.push(`     motivo: ${ex.reason}`);
          if (ex.solution) lines.push(`     correção: ${ex.solution}`);
        }
      }
      lines.push("");
    } else {
      // Fallback pra specs ainda não migradas — usa whenToUse legacy
      if (entry.whenToUse?.length) {
        lines.push("USE quando:");
        entry.whenToUse.forEach((u) => lines.push(`  - ${u}`));
      }
      if (entry.whenNotToUse?.length) {
        lines.push("EVITE quando:");
        entry.whenNotToUse.forEach((u) => lines.push(`  - ${u}`));
      }
      if (entry.examples?.length) {
        const ex = entry.examples[0];
        lines.push(
          `Exemplo: { renderAs: "${entry.id}", ea: "${ex.expectedAnswer}", componentProps: ${JSON.stringify(ex.componentProps).slice(0, 140)} }`
        );
      }
      lines.push("");
    }

    // Repairs disponíveis — sinaliza pro LLM que sistema tenta corrigir
    if (includeRepairs && entry.repairs && Object.keys(entry.repairs).length > 0) {
      lines.push(`*Auto-repair: ${Object.keys(entry.repairs).join(", ")}*`);
      lines.push("");
    }
  }

  return lines.join("\n");
}

/**
 * buildLLMCatalogIndex — versão CURTA do catálogo (1 linha por componente).
 * Pra prompts onde o full catalog é demais. Mostra id + 1 frase + use/avoid.
 */
export async function buildLLMCatalogIndex() {
  const registry = await loadRegistry();
  const lines = ["## CATÁLOGO RESUMIDO", ""];
  for (const entry of Object.values(registry)) {
    const useFirst = entry.llmGuidance?.useWhen?.[0] || entry.whenToUse?.[0] || "?";
    lines.push(`- **${entry.id}**: ${useFirst}`);
  }
  return lines.join("\n");
}
