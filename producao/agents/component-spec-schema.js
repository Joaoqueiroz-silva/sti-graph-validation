/**
 * component-spec-schema.js — Schema dos component specs self-extending (Arquitetura A).
 *
 * O LLM pode gerar componentes visuais on-demand via um JSON declarativo.
 * Um componente React genérico (<DynamicVisualComponent/>) interpreta esse JSON
 * em runtime e renderiza SVG. Specs são salvos + indexados por embedding pra reuso.
 *
 * Exportações:
 *  - SPEC_VERSION        → versão corrente do schema (bump quando mudar)
 *  - ALLOWED_ELEMENT_TYPES → whitelist de primitivas (proteção contra injection)
 *  - ALLOWED_INTERACTION_MODES
 *  - validateSpec(spec)  → { valid, errors[], normalized }
 *  - SCHEMA_DESCRIPTION  → string pro prompt do LLM (docs embutidas)
 *  - EXAMPLE_SPECS       → exemplos few-shot
 */

export const SPEC_VERSION = 2;

// Primitivas permitidas. Whitelist pra impedir que LLM injete tipos arbitrários.
export const ALLOWED_ELEMENT_TYPES = new Set([
  "body", // corpo central (rect + icon/label)
  "vector", // seta com origem, ângulo, magnitude, label
  "card", // cartao pedagogico clicavel/visual
  "timeline", // linha do tempo com eventos
  "thermometer", // termometro/escala vertical
  "bar", // barra quantitativa simples
  "axis", // eixos/grade 2D simples
  "particle", // particula/ion/atomo simplificado
  "table", // tabela pequena de dados
  "circle", // círculo simples
  "rect", // retângulo
  "ellipse", // elipse
  "line", // linha
  "polygon", // polígono (coords)
  "path", // SVG path (com sanitização)
  "label", // texto puro
  "zone", // área clicável invisível (bbox) com id
  "image", // emoji-based image (sem URL externa)
  "connector", // linha conectando 2 elementos (por id)
  "annotation", // texto com seta apontando pra elemento
]);

export const ALLOWED_INTERACTION_MODES = new Set([
  "display", // só mostra, sem interação
  "select-option", // botões de opção aparecem ao lado do spec
  "click-zone", // aluno clica em um zone pra responder
  "identify-element", // aluno clica em elemento pra identificá-lo
  "input-value", // aluno produz texto/numero dentro do proprio visual
  "drag-target", // drag-and-drop (futuro)
]);

const ALLOWED_VALIDATOR_TYPES = new Set(["exact", "contains", "zone-id", "number-range"]);

// -----------------------------------------------------------------------------
// Validação + normalização
// -----------------------------------------------------------------------------

function sanitizePathD(d) {
  // Aceita só commands SVG path seguros (M, L, H, V, C, S, Q, T, A, Z).
  // Remove qualquer coisa fora disso.
  if (typeof d !== "string") return "";
  return d.replace(/[^-MLHVCSQTAZmlhvcsqtaz0-9,.\s]/g, "").slice(0, 500);
}

function clampNumber(n, min, max, fallback = 0) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, v));
}

function validateElement(el, idx) {
  const errors = [];
  if (!el || typeof el !== "object") {
    return { valid: false, errors: [`element[${idx}] não é objeto`], normalized: null };
  }
  if (!ALLOWED_ELEMENT_TYPES.has(el.type)) {
    return {
      valid: false,
      errors: [`element[${idx}].type="${el.type}" não está no whitelist`],
      normalized: null,
    };
  }
  const n = { type: el.type };

  // Campos comuns
  if (el.id) n.id = String(el.id).slice(0, 60);
  if (el.label) n.label = String(el.label).slice(0, 80);
  if (el.color)
    n.color = String(el.color).match(
      /^#[0-9A-Fa-f]{3,8}$|^(red|blue|green|yellow|black|white|orange|purple|gray|pink|teal|cyan|magenta|brown)$/
    )
      ? el.color
      : "#333";
  if (el.opacity != null) n.opacity = clampNumber(el.opacity, 0, 1, 1);

  // Por tipo
  switch (el.type) {
    case "body":
      n.x = clampNumber(el.x, 0, 2000, 200);
      n.y = clampNumber(el.y, 0, 2000, 150);
      n.size = clampNumber(el.size, 10, 300, 44);
      if (el.icon) n.icon = String(el.icon).slice(0, 10); // emoji
      break;
    case "vector":
      n.x = clampNumber(el.x ?? el.fromX, 0, 2000, 200);
      n.y = clampNumber(el.y ?? el.fromY, 0, 2000, 150);
      n.angle = clampNumber(el.angle, -360, 720, 0);
      n.magnitude = clampNumber(el.magnitude, 0, 500, 50);
      if (el.labelOffset) n.labelOffset = clampNumber(el.labelOffset, 0, 80, 14);
      break;
    case "card":
      n.id = String(el.id || `card_${idx}`).slice(0, 60);
      n.x = clampNumber(el.x, 0, 2000, 0);
      n.y = clampNumber(el.y, 0, 2000, 0);
      n.w = clampNumber(el.w ?? el.width, 40, 800, 120);
      n.h = clampNumber(el.h ?? el.height, 30, 500, 70);
      n.title = String(el.title || el.label || "").slice(0, 90);
      n.text = String(el.text || "").slice(0, 160);
      if (el.icon) n.icon = String(el.icon).slice(0, 10);
      if (el.stroke) n.stroke = el.stroke;
      break;
    case "timeline":
      n.x = clampNumber(el.x, 0, 2000, 40);
      n.y = clampNumber(el.y, 0, 2000, 80);
      n.w = clampNumber(el.w ?? el.width, 80, 2000, 320);
      n.title = String(el.title || el.label || "").slice(0, 100);
      n.events = Array.isArray(el.events)
        ? el.events.slice(0, 8).map((ev, i) => ({
            id: String(ev.id || `event_${i}`).slice(0, 60),
            label: String(ev.label || "").slice(0, 80),
            caption: String(ev.caption || "").slice(0, 120),
          }))
        : [];
      break;
    case "thermometer":
      n.x = clampNumber(el.x, 0, 2000, 80);
      n.y = clampNumber(el.y, 0, 2000, 30);
      n.h = clampNumber(el.h ?? el.height, 80, 800, 180);
      n.min = clampNumber(el.min, -273, 10000, 0);
      n.max = clampNumber(el.max, -273, 10000, 100);
      n.value = clampNumber(el.value, -273, 10000, 50);
      n.label = String(el.label || "").slice(0, 80);
      break;
    case "bar":
      n.x = clampNumber(el.x, 0, 2000, 20);
      n.y = clampNumber(el.y, 0, 2000, 20);
      n.w = clampNumber(el.w ?? el.width, 20, 2000, 200);
      n.h = clampNumber(el.h ?? el.height, 8, 400, 24);
      n.value = clampNumber(el.value, 0, 1e9, 0);
      n.max = clampNumber(el.max, 1, 1e9, 100);
      n.label = String(el.label || "").slice(0, 100);
      break;
    case "axis":
      n.x = clampNumber(el.x, 0, 2000, 40);
      n.y = clampNumber(el.y, 0, 2000, 220);
      n.w = clampNumber(el.w ?? el.width, 80, 2000, 300);
      n.h = clampNumber(el.h ?? el.height, 60, 1200, 180);
      n.xLabel = String(el.xLabel || "").slice(0, 60);
      n.yLabel = String(el.yLabel || "").slice(0, 60);
      n.grid = el.grid !== false;
      break;
    case "particle":
      n.id = String(el.id || `particle_${idx}`).slice(0, 60);
      n.cx = clampNumber(el.cx ?? el.x, 0, 2000, 0);
      n.cy = clampNumber(el.cy ?? el.y, 0, 2000, 0);
      n.r = clampNumber(el.r ?? el.radius, 4, 120, 14);
      n.charge = String(el.charge || "").slice(0, 6);
      n.label = String(el.label || "").slice(0, 40);
      break;
    case "table":
      n.x = clampNumber(el.x, 0, 2000, 20);
      n.y = clampNumber(el.y, 0, 2000, 20);
      n.cellW = clampNumber(el.cellW, 30, 300, 80);
      n.cellH = clampNumber(el.cellH, 18, 120, 32);
      n.columns = Array.isArray(el.columns)
        ? el.columns.slice(0, 5).map((c) => String(c).slice(0, 40))
        : [];
      n.rows = Array.isArray(el.rows)
        ? el.rows
            .slice(0, 6)
            .map((row) =>
              Array.isArray(row) ? row.slice(0, 5).map((c) => String(c).slice(0, 50)) : []
            )
        : [];
      break;
    case "circle":
      n.cx = clampNumber(el.cx ?? el.x, 0, 2000, 0);
      n.cy = clampNumber(el.cy ?? el.y, 0, 2000, 0);
      n.r = clampNumber(el.r ?? el.radius, 0.5, 500, 10);
      if (el.stroke) n.stroke = el.stroke;
      if (el.strokeWidth) n.strokeWidth = clampNumber(el.strokeWidth, 0, 20, 1);
      break;
    case "rect":
      n.x = clampNumber(el.x, 0, 2000, 0);
      n.y = clampNumber(el.y, 0, 2000, 0);
      n.w = clampNumber(el.w ?? el.width, 1, 2000, 50);
      n.h = clampNumber(el.h ?? el.height, 1, 2000, 50);
      if (el.rx) n.rx = clampNumber(el.rx, 0, 50, 0);
      if (el.stroke) n.stroke = el.stroke;
      if (el.strokeWidth) n.strokeWidth = clampNumber(el.strokeWidth, 0, 20, 1);
      break;
    case "ellipse":
      n.cx = clampNumber(el.cx, 0, 2000, 0);
      n.cy = clampNumber(el.cy, 0, 2000, 0);
      n.rx = clampNumber(el.rx, 0.5, 500, 10);
      n.ry = clampNumber(el.ry, 0.5, 500, 10);
      if (el.stroke) n.stroke = el.stroke;
      if (el.strokeWidth) n.strokeWidth = clampNumber(el.strokeWidth, 0, 20, 1);
      break;
    case "line":
      n.x1 = clampNumber(el.x1, 0, 2000, 0);
      n.y1 = clampNumber(el.y1, 0, 2000, 0);
      n.x2 = clampNumber(el.x2, 0, 2000, 0);
      n.y2 = clampNumber(el.y2, 0, 2000, 0);
      n.strokeWidth = clampNumber(el.strokeWidth, 0.5, 20, 1.5);
      if (el.dash) n.dash = String(el.dash).slice(0, 20);
      break;
    case "polygon":
      if (!Array.isArray(el.points) || el.points.length < 3) {
        return {
          valid: false,
          errors: [`polygon[${idx}] precisa de >=3 points`],
          normalized: null,
        };
      }
      n.points = el.points
        .slice(0, 50)
        .map((p) => [clampNumber(p[0], 0, 2000, 0), clampNumber(p[1], 0, 2000, 0)]);
      break;
    case "path":
      n.d = sanitizePathD(el.d);
      if (!n.d)
        return {
          valid: false,
          errors: [`path[${idx}].d vazio ou só com chars inválidos`],
          normalized: null,
        };
      if (el.fill === "none" || (el.fill && typeof el.fill === "string"))
        n.fill = String(el.fill).slice(0, 20);
      if (el.stroke) n.stroke = el.stroke;
      if (el.strokeWidth) n.strokeWidth = clampNumber(el.strokeWidth, 0, 20, 1);
      break;
    case "label":
      n.x = clampNumber(el.x, 0, 2000, 0);
      n.y = clampNumber(el.y, 0, 2000, 0);
      n.text = String(el.text || el.label || "").slice(0, 200);
      n.fontSize = clampNumber(el.fontSize, 6, 48, 12);
      if (el.align)
        n.align = String(el.align).match(/^(start|middle|end|center)$/) ? el.align : "middle";
      if (el.bold) n.bold = !!el.bold;
      break;
    case "zone":
      n.id = String(el.id || `zone_${idx}`).slice(0, 60);
      n.x = clampNumber(el.x, 0, 2000, 0);
      n.y = clampNumber(el.y, 0, 2000, 0);
      n.w = clampNumber(el.w ?? el.width, 1, 2000, 50);
      n.h = clampNumber(el.h ?? el.height, 1, 2000, 50);
      if (el.tooltip) n.tooltip = String(el.tooltip).slice(0, 100);
      break;
    case "image":
      n.x = clampNumber(el.x, 0, 2000, 0);
      n.y = clampNumber(el.y, 0, 2000, 0);
      n.emoji = String(el.emoji || el.icon || "").slice(0, 10);
      n.size = clampNumber(el.size, 8, 200, 24);
      break;
    case "connector":
      n.fromId = String(el.fromId || "").slice(0, 60);
      n.toId = String(el.toId || "").slice(0, 60);
      if (el.style)
        n.style = String(el.style).match(/^(straight|curve|dashed)$/) ? el.style : "straight";
      break;
    case "annotation":
      n.x = clampNumber(el.x, 0, 2000, 0);
      n.y = clampNumber(el.y, 0, 2000, 0);
      n.text = String(el.text || "").slice(0, 120);
      if (el.targetId) n.targetId = String(el.targetId).slice(0, 60);
      break;
  }
  return { valid: true, errors: [], normalized: n };
}

function validateInteraction(interaction) {
  if (!interaction || typeof interaction !== "object") {
    return { valid: true, errors: [], normalized: { mode: "display" } };
  }
  const mode = ALLOWED_INTERACTION_MODES.has(interaction.mode) ? interaction.mode : "display";
  const n = { mode };
  if (interaction.validator) {
    const v = interaction.validator;
    if (ALLOWED_VALIDATOR_TYPES.has(v.type)) {
      n.validator = { type: v.type };
      if (v.expected != null)
        n.validator.expected =
          typeof v.expected === "object"
            ? JSON.parse(JSON.stringify(v.expected).slice(0, 2000))
            : String(v.expected).slice(0, 200);
      if (v.tolerance != null) n.validator.tolerance = clampNumber(v.tolerance, 0, 1000, 0);
    }
  }
  if (mode === "input-value") {
    const input = interaction.input || {};
    n.input = {
      kind: ["text", "number", "decimal"].includes(input.kind) ? input.kind : "text",
      placeholder: String(input.placeholder || "").slice(0, 80),
      buttonLabel: String(input.buttonLabel || "OK").slice(0, 30),
    };
  }
  return { valid: true, errors: [], normalized: n };
}

/**
 * Valida + normaliza um spec completo. Retorna:
 *  - { valid: true, spec: normalized } se OK
 *  - { valid: false, errors: [...] } se rejeitado
 *
 * Cada campo sofre coerção segura (clamps, whitelists, truncates).
 * Nunca lança exception — sempre retorna objeto estruturado.
 */
export function validateSpec(rawSpec) {
  const errors = [];
  if (!rawSpec || typeof rawSpec !== "object") {
    return { valid: false, errors: ["spec não é objeto"] };
  }

  const canvas = rawSpec.canvas || {};
  const normalized = {
    version: SPEC_VERSION,
    id: String(rawSpec.id || "").slice(0, 64) || null,
    name: String(rawSpec.name || "").slice(0, 100),
    disciplina: String(rawSpec.disciplina || "").slice(0, 40),
    tags: Array.isArray(rawSpec.tags)
      ? rawSpec.tags.slice(0, 12).map((t) => String(t).slice(0, 40))
      : [],
    kcTags: Array.isArray(rawSpec.kcTags)
      ? rawSpec.kcTags.slice(0, 8).map((t) => String(t).slice(0, 80))
      : [],
    canvas: {
      w: clampNumber(canvas.w, 100, 1200, 400),
      h: clampNumber(canvas.h, 100, 900, 300),
      bg: typeof canvas.bg === "string" ? canvas.bg.slice(0, 20) : "#FFFFFF",
    },
    elements: [],
    interaction: { mode: "display" },
    pedagogy: rawSpec.pedagogy
      ? {
          action: String(rawSpec.pedagogy.action || "").slice(0, 80),
          subjectModel: String(rawSpec.pedagogy.subjectModel || "").slice(0, 120),
          evidence: String(rawSpec.pedagogy.evidence || "").slice(0, 160),
        }
      : null,
    createdBy: ["llm", "human", "seed"].includes(rawSpec.createdBy) ? rawSpec.createdBy : "llm",
    createdAt: rawSpec.createdAt || new Date().toISOString(),
    usageCount: clampNumber(rawSpec.usageCount, 0, 1e9, 0),
  };

  if (!Array.isArray(rawSpec.elements) || rawSpec.elements.length === 0) {
    return { valid: false, errors: ["spec.elements vazio ou não é array"] };
  }
  if (rawSpec.elements.length > 60) {
    errors.push("muitos elementos (max 60) — truncando");
  }

  for (let i = 0; i < Math.min(rawSpec.elements.length, 60); i++) {
    const res = validateElement(rawSpec.elements[i], i);
    if (res.valid) normalized.elements.push(res.normalized);
    else errors.push(...res.errors);
  }

  if (normalized.elements.length === 0) {
    return { valid: false, errors: ["nenhum elemento válido após validação", ...errors] };
  }

  const interRes = validateInteraction(rawSpec.interaction);
  normalized.interaction = interRes.normalized;

  return { valid: true, errors, spec: normalized };
}

// -----------------------------------------------------------------------------
// Docs embutidas (injetadas no prompt do LLM ao gerar specs novos)
// -----------------------------------------------------------------------------

export const SCHEMA_DESCRIPTION = `
Schema v${SPEC_VERSION} de componente visual dinâmico (JSON declarativo).

TOP-LEVEL:
{
  "name": "slug curto descritivo",        // ex: "fbd-basic-3forces"
  "disciplina": "fisica|matematica|biologia|quimica|historia|geografia|portugues|ciencias",
  "tags": ["termos buscáveis", "..."],
  "kcTags": ["kc_ids relacionados"],
  "canvas": { "w": 400, "h": 300, "bg": "#FFFFFF" },
  "elements": [ ...primitivas... ],        // array, max 60 elementos
  "interaction": { "mode": "display|select-option|click-zone|identify-element|input-value" },
  "pedagogy": { "action": "ação do aluno", "subjectModel": "modelo específico do conteúdo", "evidence": "como a interação demonstra aprendizagem" }
}

PRIMITIVAS (type):
- body:        corpo central. Props: x, y, size, icon (emoji), label, color
- vector:      seta com origem (x,y), angle (graus, 0=direita), magnitude, label, color
- card:        cartao visual/clicavel. Props: id, x, y, w, h, title, text, icon, color, stroke
- timeline:    linha do tempo. Props: x, y, w, title, events[{id,label,caption}]
- thermometer: termometro/escala. Props: x, y, h, min, max, value, label, color
- bar:         barra quantitativa. Props: x, y, w, h, value, max, label, color
- axis:        eixos/grade. Props: x, y, w, h, xLabel, yLabel, grid
- particle:    particula/ion/atomo simples. Props: id, cx, cy, r, charge, label, color
- table:       tabela pequena. Props: x, y, columns[], rows[][], cellW, cellH
- circle:      cx, cy, r, color, stroke, strokeWidth
- rect:        x, y, w, h, rx, color, stroke
- ellipse:     cx, cy, rx, ry, color, stroke
- line:        x1, y1, x2, y2, color, strokeWidth, dash ("4,3")
- polygon:     points [[x,y], [x,y], ...] (>=3), color, stroke
- path:        d (SVG path seguro), fill, stroke, strokeWidth
- label:       x, y, text, fontSize, align (start|middle|end), bold, color
- zone:        id, x, y, w, h, tooltip (áreas clicáveis, invisíveis)
- image:       x, y, emoji, size (só emoji, sem URL externa)
- connector:   fromId, toId, style (straight|curve|dashed) — conecta elementos
- annotation:  x, y, text, targetId — texto com seta apontando pra elemento

REGRAS DE SEGURANÇA:
- NUNCA use <script>, event handlers, ou URLs externas.
- path.d é sanitizado pra aceitar só chars de SVG path (M,L,C,H,V,A,Z + números).
- color aceita: #RGB, #RRGGBB, nomes CSS comuns (red, blue, ...). Outros valores viram fallback cinza.
- Números são clampados pra ranges seguros (x/y: 0-2000, size/r: limites razoáveis).

INTERACTION:
- "display":          só mostra (sem resposta)
- "select-option":    botões de resposta aparecem abaixo (usa step.options)
- "click-zone":       aluno clica em um <zone id="..."> — resposta é o id do zone
- "identify-element": aluno clica em qualquer element — identifica o que clicou
- "input-value":      aluno digita texto/número DENTRO do visual. Use interaction.input
  { "kind":"text|number|decimal", "placeholder":"...", "buttonLabel":"OK" }

INTERACTION.validator (opcional):
- { "type": "exact", "expected": "valor" } — match exato
- { "type": "contains", "expected": "substring" }
- { "type": "zone-id", "expected": "id_do_zone_correto" }
- { "type": "number-range", "expected": 42, "tolerance": 0.5 }

CONTRATO DE RESPOSTA:
- Para click-zone/identify-element, validator.expected DEVE ser exatamente o id do zone/card/element correto.
- Para select-option, mantenha as alternativas em step.options e use o spec apenas para contextualizar visualmente.

COBERTURA POR DISCIPLINA:
- Fisica: vector, thermometer, axis, bar, body, annotation.
- Quimica: particle, clusters com circle/particle, escala pH com bar/rect, table.
- Biologia: card/zone para organelas, ciclos com timeline/connector, classificacao com cards.
- Historia: timeline, card de evidencia, mapas esquematicos com rect/line/zone.
- Geografia: mapas esquematicos com zones, fluxos com vector/connector, climogramas com axis/bar.
- Portugues/Idiomas: cards de palavras, destaque por zones, table de classes, timeline narrativa.
- Matematica: axis, bar, table, formas geometricas, alem dos componentes hardcoded existentes.

ANTES DE GERAR UM SPEC NOVO, sempre verifique se um spec existente serve. Reutilização > geração.
`.trim();

// Exemplos few-shot pra ajudar o LLM a gerar specs de qualidade
export const EXAMPLE_SPECS = [
  {
    name: "fbd-3-forces",
    disciplina: "fisica",
    tags: ["forças", "DCL", "diagrama de corpo livre", "newton", "peso", "normal"],
    kcTags: ["kc_desenhar_diagrama_corpo_livre"],
    canvas: { w: 400, h: 300, bg: "#FFFFFF" },
    elements: [
      { type: "body", x: 200, y: 150, size: 48, icon: "📦", label: "Corpo" },
      { type: "vector", x: 200, y: 150, angle: 0, magnitude: 80, label: "T", color: "#2B7FFF" },
      { type: "vector", x: 200, y: 150, angle: 90, magnitude: 80, label: "P", color: "#D0021B" },
      { type: "vector", x: 200, y: 150, angle: 270, magnitude: 80, label: "N", color: "#00AA66" },
    ],
    interaction: { mode: "display" },
  },
  {
    name: "ph-scale-color",
    disciplina: "quimica",
    tags: ["pH", "ácido", "base", "escala"],
    kcTags: ["kc_identificar_ph"],
    canvas: { w: 400, h: 120, bg: "#FFFFFF" },
    elements: [
      {
        type: "rect",
        x: 30,
        y: 40,
        w: 340,
        h: 30,
        rx: 6,
        color: "#E74C3C",
        stroke: "#333",
        strokeWidth: 1,
      },
      { type: "rect", x: 30, y: 40, w: 240, h: 30, rx: 6, color: "#F39C12" },
      { type: "rect", x: 30, y: 40, w: 140, h: 30, rx: 6, color: "#F1C40F" },
      { type: "rect", x: 180, y: 40, w: 190, h: 30, rx: 6, color: "#2ECC71" },
      { type: "rect", x: 270, y: 40, w: 100, h: 30, rx: 6, color: "#3498DB" },
      { type: "rect", x: 330, y: 40, w: 40, h: 30, rx: 6, color: "#9B59B6" },
      { type: "label", x: 30, y: 90, text: "0", fontSize: 14, align: "middle" },
      { type: "label", x: 200, y: 90, text: "7", fontSize: 14, align: "middle", bold: true },
      { type: "label", x: 370, y: 90, text: "14", fontSize: 14, align: "middle" },
      {
        type: "label",
        x: 200,
        y: 25,
        text: "Escala de pH",
        fontSize: 13,
        align: "middle",
        bold: true,
      },
    ],
    interaction: { mode: "select-option" },
  },
  {
    name: "historia-timeline-causas",
    disciplina: "historia",
    tags: ["linha do tempo", "cronologia", "causa", "processo historico"],
    kcTags: ["kc_ordenar_eventos_historicos"],
    canvas: { w: 460, h: 190, bg: "#FFFDF7" },
    elements: [
      {
        type: "timeline",
        x: 45,
        y: 92,
        w: 370,
        title: "Processo historico",
        events: [
          { id: "inicio", label: "Inicio", caption: "primeira pista" },
          { id: "mudanca", label: "Mudanca", caption: "evento-chave" },
          { id: "consequencia", label: "Consequencia", caption: "resultado" },
        ],
      },
      { type: "annotation", x: 230, y: 165, text: "Leia como sequencia de causas e efeitos." },
    ],
    interaction: { mode: "select-option" },
  },
  {
    name: "biologia-celula-zonas",
    disciplina: "biologia",
    tags: ["celula", "organela", "nucleo", "citoplasma", "membrana"],
    kcTags: ["kc_identificar_organela"],
    canvas: { w: 420, h: 280, bg: "#F8FFF9" },
    elements: [
      {
        type: "ellipse",
        cx: 210,
        cy: 145,
        rx: 145,
        ry: 86,
        color: "#DDF7E8",
        stroke: "#2E7D50",
        strokeWidth: 2,
      },
      {
        type: "circle",
        cx: 205,
        cy: 145,
        r: 36,
        color: "#B8D8FF",
        stroke: "#2B5C9E",
        strokeWidth: 2,
      },
      { type: "label", x: 210, y: 45, text: "Celula esquematica", fontSize: 15, bold: true },
      { type: "zone", id: "nucleo", x: 168, y: 108, w: 74, h: 74, tooltip: "estrutura central" },
      { type: "zone", id: "membrana", x: 66, y: 66, w: 288, h: 160, tooltip: "limite da celula" },
    ],
    interaction: { mode: "click-zone", validator: { type: "zone-id", expected: "nucleo" } },
  },
  {
    name: "geografia-bacia-fluxo",
    disciplina: "geografia",
    tags: ["bacia hidrografica", "rio", "afluente", "fluxo", "relevo"],
    kcTags: ["kc_identificar_fluxo_hidrografico"],
    canvas: { w: 440, h: 260, bg: "#F7FBFF" },
    elements: [
      {
        type: "path",
        d: "M80 55 C120 100, 150 120, 205 145 C260 170, 300 190, 360 215",
        fill: "none",
        stroke: "#2B7FFF",
        strokeWidth: 5,
      },
      {
        type: "path",
        d: "M130 70 C150 105, 175 115, 205 145",
        fill: "none",
        stroke: "#74B9FF",
        strokeWidth: 3,
      },
      {
        type: "vector",
        x: 215,
        y: 150,
        angle: 25,
        magnitude: 80,
        label: "fluxo",
        color: "#0B6FB3",
      },
      { type: "label", x: 220, y: 35, text: "Rede de drenagem", fontSize: 15, bold: true },
    ],
    interaction: { mode: "select-option" },
  },
  {
    name: "fisica-termometro-comparacao",
    disciplina: "fisica",
    tags: ["temperatura", "calor", "termometro", "comparacao"],
    kcTags: ["kc_distinguir_temperatura_calor"],
    canvas: { w: 420, h: 250, bg: "#FFF9F2" },
    elements: [
      {
        type: "thermometer",
        x: 120,
        y: 35,
        h: 165,
        min: 0,
        max: 100,
        value: 70,
        label: "corpo quente",
        color: "#E24A33",
      },
      {
        type: "thermometer",
        x: 290,
        y: 35,
        h: 165,
        min: 0,
        max: 100,
        value: 20,
        label: "corpo frio",
        color: "#2077B4",
      },
      { type: "vector", x: 160, y: 115, angle: 0, magnitude: 90, label: "calor", color: "#EA7A00" },
      {
        type: "label",
        x: 210,
        y: 230,
        text: "Energia flui do mais quente para o mais frio.",
        fontSize: 13,
        bold: true,
      },
    ],
    interaction: { mode: "select-option" },
  },
  {
    name: "portugues-classes-palavras",
    disciplina: "portugues",
    tags: ["classe gramatical", "substantivo", "verbo", "adjetivo", "palavra"],
    kcTags: ["kc_identificar_classe_gramatical"],
    canvas: { w: 430, h: 210, bg: "#FFFCF7" },
    elements: [
      {
        type: "card",
        id: "substantivo",
        x: 35,
        y: 58,
        w: 110,
        h: 80,
        title: "Substantivo",
        text: "nomeia seres e ideias",
        color: "#FDE68A",
      },
      {
        type: "card",
        id: "verbo",
        x: 160,
        y: 58,
        w: 110,
        h: 80,
        title: "Verbo",
        text: "indica acao ou estado",
        color: "#BFDBFE",
      },
      {
        type: "card",
        id: "adjetivo",
        x: 285,
        y: 58,
        w: 110,
        h: 80,
        title: "Adjetivo",
        text: "caracteriza um nome",
        color: "#BBF7D0",
      },
      {
        type: "label",
        x: 215,
        y: 178,
        text: "Compare a funcao da palavra na frase.",
        fontSize: 13,
        bold: true,
      },
    ],
    interaction: { mode: "select-option" },
  },
  {
    name: "matematica-plano-area-retangulo",
    disciplina: "matematica",
    tags: ["area", "retangulo", "geometria", "base", "altura", "grade"],
    kcTags: ["kc_calcular_area_retangulo"],
    canvas: { w: 430, h: 280, bg: "#F8FAFC" },
    elements: [
      { type: "axis", x: 70, y: 225, w: 280, h: 170, xLabel: "base", yLabel: "altura", grid: true },
      {
        type: "rect",
        x: 110,
        y: 105,
        w: 180,
        h: 90,
        rx: 4,
        color: "#BFDBFE",
        stroke: "#1D4ED8",
        strokeWidth: 2,
        opacity: 0.8,
      },
      {
        type: "label",
        x: 200,
        y: 151,
        text: "A = base x altura",
        fontSize: 15,
        bold: true,
        color: "#0F172A",
      },
      { type: "bar", x: 110, y: 238, w: 180, h: 14, value: 6, max: 6, label: "base = 6" },
      {
        type: "bar",
        x: 310,
        y: 105,
        w: 90,
        h: 14,
        value: 3,
        max: 3,
        label: "altura = 3",
        color: "#F97316",
      },
      {
        type: "annotation",
        x: 215,
        y: 42,
        text: "Conte os quadradinhos ou multiplique as dimensoes.",
      },
    ],
    interaction: { mode: "select-option" },
  },
  {
    name: "matematica-fracao-comparacao-visual",
    disciplina: "matematica",
    tags: ["fracao", "comparacao", "numerador", "denominador", "barra"],
    kcTags: ["kc_comparar_fracoes"],
    canvas: { w: 430, h: 220, bg: "#FFFBEB" },
    elements: [
      {
        type: "label",
        x: 215,
        y: 32,
        text: "Compare a parte pintada",
        fontSize: 16,
        bold: true,
        color: "#1F2937",
      },
      {
        type: "rect",
        x: 70,
        y: 75,
        w: 120,
        h: 36,
        rx: 8,
        color: "#DBEAFE",
        stroke: "#2563EB",
        strokeWidth: 2,
      },
      { type: "rect", x: 70, y: 75, w: 60, h: 36, rx: 8, color: "#2563EB" },
      { type: "label", x: 130, y: 133, text: "1/2", fontSize: 15, bold: true },
      {
        type: "rect",
        x: 240,
        y: 75,
        w: 120,
        h: 36,
        rx: 8,
        color: "#DCFCE7",
        stroke: "#16A34A",
        strokeWidth: 2,
      },
      { type: "rect", x: 240, y: 75, w: 80, h: 36, rx: 8, color: "#16A34A" },
      { type: "label", x: 300, y: 133, text: "2/3", fontSize: 15, bold: true },
      {
        type: "label",
        x: 215,
        y: 180,
        text: "A maior fracao ocupa mais espaco da mesma barra.",
        fontSize: 12,
        bold: true,
      },
    ],
    interaction: { mode: "select-option" },
  },
  {
    name: "matematica-reta-numerica-operacao",
    disciplina: "matematica",
    tags: ["reta numerica", "adicao", "subtracao", "salto", "inteiros"],
    kcTags: ["kc_usar_reta_numerica"],
    canvas: { w: 460, h: 190, bg: "#F8FAFC" },
    elements: [
      { type: "line", x1: 50, y1: 105, x2: 410, y2: 105, color: "#334155", strokeWidth: 3 },
      { type: "vector", x: 95, y: 105, angle: 0, magnitude: 170, label: "+4", color: "#2563EB" },
      {
        type: "circle",
        id: "inicio",
        cx: 95,
        cy: 105,
        r: 8,
        color: "#FDE68A",
        stroke: "#92400E",
        strokeWidth: 2,
      },
      {
        type: "circle",
        id: "fim",
        cx: 265,
        cy: 105,
        r: 9,
        color: "#BBF7D0",
        stroke: "#15803D",
        strokeWidth: 2,
      },
      { type: "label", x: 95, y: 132, text: "2", fontSize: 14, bold: true },
      { type: "label", x: 265, y: 132, text: "6", fontSize: 14, bold: true },
      {
        type: "label",
        x: 230,
        y: 42,
        text: "O salto mostra a operacao na reta.",
        fontSize: 14,
        bold: true,
      },
    ],
    interaction: { mode: "select-option" },
  },
  {
    name: "matematica-balanca-equacao",
    disciplina: "matematica",
    tags: ["equacao", "balanca", "igualdade", "incognita", "algebra"],
    kcTags: ["kc_resolver_equacao_primeiro_grau"],
    canvas: { w: 460, h: 270, bg: "#FFFDF7" },
    elements: [
      { type: "line", x1: 230, y1: 70, x2: 230, y2: 205, color: "#334155", strokeWidth: 4 },
      { type: "line", x1: 115, y1: 115, x2: 345, y2: 115, color: "#334155", strokeWidth: 4 },
      {
        type: "rect",
        x: 65,
        y: 160,
        w: 125,
        h: 38,
        rx: 10,
        color: "#DBEAFE",
        stroke: "#2563EB",
        strokeWidth: 2,
      },
      {
        type: "rect",
        x: 270,
        y: 160,
        w: 125,
        h: 38,
        rx: 10,
        color: "#DCFCE7",
        stroke: "#16A34A",
        strokeWidth: 2,
      },
      { type: "label", x: 127, y: 184, text: "x + 3", fontSize: 18, bold: true },
      { type: "label", x: 332, y: 184, text: "8", fontSize: 18, bold: true },
      {
        type: "label",
        x: 230,
        y: 35,
        text: "Mantenha os dois lados equilibrados.",
        fontSize: 14,
        bold: true,
      },
    ],
    interaction: { mode: "select-option" },
  },
  {
    name: "matematica-angulo-transferidor",
    disciplina: "matematica",
    tags: ["angulo", "geometria", "medida", "transferidor", "graus"],
    kcTags: ["kc_medir_angulos"],
    canvas: { w: 430, h: 250, bg: "#F8FAFC" },
    elements: [
      {
        type: "path",
        d: "M95 190 A120 120 0 0 1 335 190",
        fill: "none",
        stroke: "#CBD5E1",
        strokeWidth: 10,
      },
      { type: "line", x1: 215, y1: 190, x2: 330, y2: 190, color: "#1F2937", strokeWidth: 4 },
      { type: "line", x1: 215, y1: 190, x2: 275, y2: 89, color: "#2563EB", strokeWidth: 4 },
      {
        type: "path",
        d: "M245 190 A30 30 0 0 0 230 164",
        fill: "none",
        stroke: "#F97316",
        strokeWidth: 4,
      },
      {
        type: "label",
        x: 250,
        y: 155,
        text: "60 graus",
        fontSize: 14,
        bold: true,
        color: "#C2410C",
      },
      {
        type: "label",
        x: 215,
        y: 35,
        text: "Compare a abertura entre as semirretas.",
        fontSize: 14,
        bold: true,
      },
    ],
    interaction: { mode: "select-option" },
  },
  {
    name: "fisica-circuito-serie",
    disciplina: "fisica",
    tags: ["circuito", "corrente eletrica", "serie", "bateria", "lampada"],
    kcTags: ["kc_identificar_circuito_serie"],
    canvas: { w: 460, h: 280, bg: "#F8FAFC" },
    elements: [
      {
        type: "rect",
        x: 90,
        y: 80,
        w: 280,
        h: 130,
        rx: 12,
        color: "#FFFFFF",
        stroke: "#334155",
        strokeWidth: 3,
      },
      { type: "line", x1: 105, y1: 145, x2: 145, y2: 145, color: "#334155", strokeWidth: 4 },
      { type: "line", x1: 155, y1: 122, x2: 155, y2: 168, color: "#334155", strokeWidth: 5 },
      { type: "line", x1: 170, y1: 132, x2: 170, y2: 158, color: "#334155", strokeWidth: 3 },
      {
        type: "circle",
        cx: 295,
        cy: 145,
        r: 28,
        color: "#FEF3C7",
        stroke: "#D97706",
        strokeWidth: 3,
      },
      { type: "label", x: 295, y: 151, text: "L", fontSize: 20, bold: true },
      { type: "vector", x: 200, y: 82, angle: 0, magnitude: 95, label: "i", color: "#2563EB" },
      {
        type: "label",
        x: 230,
        y: 45,
        text: "A corrente percorre um unico caminho.",
        fontSize: 14,
        bold: true,
      },
    ],
    interaction: { mode: "select-option" },
  },
  {
    name: "fisica-onda-amplitude-comprimento",
    disciplina: "fisica",
    tags: ["onda", "amplitude", "comprimento de onda", "frequencia"],
    kcTags: ["kc_identificar_elementos_onda"],
    canvas: { w: 470, h: 260, bg: "#F7FBFF" },
    elements: [
      {
        type: "axis",
        x: 45,
        y: 150,
        w: 370,
        h: 85,
        xLabel: "posicao",
        yLabel: "deslocamento",
        grid: true,
      },
      {
        type: "path",
        d: "M45 150 C75 80, 115 80, 145 150 C175 220, 215 220, 245 150 C275 80, 315 80, 345 150 C375 220, 415 220, 445 150",
        fill: "none",
        stroke: "#2563EB",
        strokeWidth: 4,
      },
      {
        type: "line",
        x1: 145,
        y1: 150,
        x2: 145,
        y2: 91,
        color: "#F97316",
        strokeWidth: 3,
        dash: "4,3",
      },
      {
        type: "label",
        x: 176,
        y: 113,
        text: "amplitude",
        fontSize: 12,
        bold: true,
        color: "#C2410C",
      },
      { type: "line", x1: 145, y1: 229, x2: 345, y2: 229, color: "#16A34A", strokeWidth: 3 },
      {
        type: "label",
        x: 245,
        y: 247,
        text: "comprimento de onda",
        fontSize: 12,
        bold: true,
        color: "#15803D",
      },
    ],
    interaction: { mode: "select-option" },
  },
  {
    name: "quimica-molecula-agua-polaridade",
    disciplina: "quimica",
    tags: ["molecula", "agua", "polaridade", "ligacao covalente", "atomos"],
    kcTags: ["kc_reconhecer_molecula_agua"],
    canvas: { w: 430, h: 260, bg: "#F8FAFC" },
    elements: [
      {
        type: "particle",
        id: "oxigenio",
        cx: 215,
        cy: 120,
        r: 34,
        label: "O",
        charge: "δ-",
        color: "#FCA5A5",
      },
      {
        type: "particle",
        id: "hidrogenio_1",
        cx: 145,
        cy: 180,
        r: 23,
        label: "H",
        charge: "δ+",
        color: "#BFDBFE",
      },
      {
        type: "particle",
        id: "hidrogenio_2",
        cx: 285,
        cy: 180,
        r: 23,
        label: "H",
        charge: "δ+",
        color: "#BFDBFE",
      },
      { type: "line", x1: 190, y1: 143, x2: 160, y2: 166, color: "#64748B", strokeWidth: 5 },
      { type: "line", x1: 240, y1: 143, x2: 270, y2: 166, color: "#64748B", strokeWidth: 5 },
      { type: "label", x: 215, y: 45, text: "H2O: geometria angular", fontSize: 15, bold: true },
      {
        type: "zone",
        id: "oxigenio",
        x: 178,
        y: 82,
        w: 74,
        h: 76,
        tooltip: "atomo mais eletronegativo",
      },
    ],
    interaction: { mode: "click-zone", validator: { type: "zone-id", expected: "oxigenio" } },
  },
  {
    name: "quimica-tabela-periodica-familias",
    disciplina: "quimica",
    tags: ["tabela periodica", "familia", "metais alcalinos", "halogenios", "gases nobres"],
    kcTags: ["kc_identificar_familias_periodicas"],
    canvas: { w: 470, h: 250, bg: "#FFFCF7" },
    elements: [
      {
        type: "table",
        x: 50,
        y: 55,
        cellW: 70,
        cellH: 34,
        columns: ["1", "2", "...", "17", "18"],
        rows: [
          ["Li", "Be", "", "F", "Ne"],
          ["Na", "Mg", "", "Cl", "Ar"],
          ["K", "Ca", "", "Br", "Kr"],
        ],
      },
      {
        type: "rect",
        x: 50,
        y: 89,
        w: 70,
        h: 102,
        rx: 4,
        color: "#FDE68A",
        stroke: "#D97706",
        strokeWidth: 2,
        opacity: 0.45,
      },
      {
        type: "rect",
        x: 260,
        y: 89,
        w: 70,
        h: 102,
        rx: 4,
        color: "#BFDBFE",
        stroke: "#2563EB",
        strokeWidth: 2,
        opacity: 0.45,
      },
      {
        type: "rect",
        x: 330,
        y: 89,
        w: 70,
        h: 102,
        rx: 4,
        color: "#BBF7D0",
        stroke: "#16A34A",
        strokeWidth: 2,
        opacity: 0.45,
      },
      {
        type: "label",
        x: 235,
        y: 30,
        text: "Colunas indicam familias quimicas.",
        fontSize: 14,
        bold: true,
      },
    ],
    interaction: { mode: "select-option" },
  },
  {
    name: "biologia-ciclo-agua-evaporacao",
    disciplina: "biologia",
    tags: ["ciclo", "agua", "evaporacao", "condensacao", "precipitacao"],
    kcTags: ["kc_ordenar_ciclo_agua"],
    canvas: { w: 470, h: 300, bg: "#F0F9FF" },
    elements: [
      {
        type: "ellipse",
        cx: 125,
        cy: 235,
        rx: 80,
        ry: 24,
        color: "#7DD3FC",
        stroke: "#0284C7",
        strokeWidth: 2,
      },
      { type: "image", x: 125, y: 210, emoji: "☀️", size: 30 },
      {
        type: "vector",
        x: 145,
        y: 205,
        angle: -65,
        magnitude: 78,
        label: "evapora",
        color: "#F97316",
      },
      {
        type: "ellipse",
        cx: 270,
        cy: 85,
        rx: 76,
        ry: 26,
        color: "#E0F2FE",
        stroke: "#38BDF8",
        strokeWidth: 2,
      },
      {
        type: "vector",
        x: 300,
        y: 112,
        angle: 70,
        magnitude: 83,
        label: "chove",
        color: "#2563EB",
      },
      {
        type: "polygon",
        points: [
          [330, 230],
          [390, 145],
          [450, 230],
        ],
        color: "#CBD5E1",
        stroke: "#64748B",
        strokeWidth: 2,
      },
      {
        type: "label",
        x: 235,
        y: 35,
        text: "Ciclo da agua: a materia circula.",
        fontSize: 15,
        bold: true,
      },
    ],
    interaction: { mode: "select-option" },
  },
  {
    name: "historia-fonte-evidencia-cartoes",
    disciplina: "historia",
    tags: ["fonte historica", "evidencia", "documento", "interpretacao"],
    kcTags: ["kc_ler_evidencias_historicas"],
    canvas: { w: 470, h: 260, bg: "#FFF8ED" },
    elements: [
      {
        type: "card",
        id: "fonte",
        x: 45,
        y: 62,
        w: 130,
        h: 118,
        title: "Fonte",
        text: "documento, mapa, relato ou imagem",
        color: "#FEF3C7",
        stroke: "#D97706",
      },
      {
        type: "card",
        id: "pista",
        x: 195,
        y: 62,
        w: 110,
        h: 118,
        title: "Pista",
        text: "informacao observavel",
        color: "#DBEAFE",
        stroke: "#2563EB",
      },
      {
        type: "card",
        id: "interpretacao",
        x: 325,
        y: 62,
        w: 110,
        h: 118,
        title: "Conclusao",
        text: "explicacao historica",
        color: "#DCFCE7",
        stroke: "#16A34A",
      },
      { type: "connector", fromId: "fonte", toId: "pista", style: "straight" },
      { type: "connector", fromId: "pista", toId: "interpretacao", style: "straight" },
      {
        type: "label",
        x: 235,
        y: 222,
        text: "Boa leitura historica separa evidencia de opiniao.",
        fontSize: 13,
        bold: true,
      },
    ],
    interaction: { mode: "select-option" },
  },
  {
    name: "geografia-climograma-barras",
    disciplina: "geografia",
    tags: ["climograma", "chuva", "temperatura", "clima", "grafico"],
    kcTags: ["kc_interpretar_climograma"],
    canvas: { w: 470, h: 290, bg: "#F8FAFC" },
    elements: [
      { type: "axis", x: 60, y: 220, w: 340, h: 155, xLabel: "meses", yLabel: "chuva", grid: true },
      {
        type: "bar",
        x: 85,
        y: 178,
        w: 34,
        h: 42,
        value: 80,
        max: 80,
        label: "Jan",
        color: "#38BDF8",
      },
      {
        type: "bar",
        x: 140,
        y: 148,
        w: 34,
        h: 72,
        value: 80,
        max: 80,
        label: "Mar",
        color: "#38BDF8",
      },
      {
        type: "bar",
        x: 195,
        y: 200,
        w: 34,
        h: 20,
        value: 80,
        max: 80,
        label: "Jun",
        color: "#38BDF8",
      },
      {
        type: "bar",
        x: 250,
        y: 190,
        w: 34,
        h: 30,
        value: 80,
        max: 80,
        label: "Set",
        color: "#38BDF8",
      },
      {
        type: "bar",
        x: 305,
        y: 158,
        w: 34,
        h: 62,
        value: 80,
        max: 80,
        label: "Dez",
        color: "#38BDF8",
      },
      {
        type: "path",
        d: "M85 126 C140 116, 195 145, 250 138 C305 122, 350 118, 390 126",
        fill: "none",
        stroke: "#F97316",
        strokeWidth: 4,
      },
      {
        type: "label",
        x: 235,
        y: 35,
        text: "Barras mostram chuva; linha mostra temperatura.",
        fontSize: 14,
        bold: true,
      },
    ],
    interaction: { mode: "select-option" },
  },
  {
    name: "portugues-periodo-sujeito-predicado",
    disciplina: "portugues",
    tags: ["sujeito", "predicado", "frase", "periodo", "sintaxe"],
    kcTags: ["kc_identificar_sujeito_predicado"],
    canvas: { w: 470, h: 220, bg: "#FFFCF7" },
    elements: [
      {
        type: "label",
        x: 235,
        y: 35,
        text: "A menina leu o livro.",
        fontSize: 20,
        bold: true,
        color: "#111827",
      },
      {
        type: "rect",
        id: "sujeito",
        x: 72,
        y: 60,
        w: 125,
        h: 42,
        rx: 8,
        color: "#DBEAFE",
        stroke: "#2563EB",
        strokeWidth: 2,
      },
      { type: "label", x: 134, y: 87, text: "A menina", fontSize: 14, bold: true },
      {
        type: "rect",
        id: "predicado",
        x: 214,
        y: 60,
        w: 185,
        h: 42,
        rx: 8,
        color: "#DCFCE7",
        stroke: "#16A34A",
        strokeWidth: 2,
      },
      { type: "label", x: 306, y: 87, text: "leu o livro", fontSize: 14, bold: true },
      {
        type: "zone",
        id: "sujeito",
        x: 72,
        y: 60,
        w: 125,
        h: 42,
        tooltip: "quem pratica ou sofre a acao",
      },
      {
        type: "zone",
        id: "predicado",
        x: 214,
        y: 60,
        w: 185,
        h: 42,
        tooltip: "o que se declara sobre o sujeito",
      },
      { type: "annotation", x: 235, y: 175, text: "Pergunte: de quem a frase fala?" },
    ],
    interaction: { mode: "click-zone", validator: { type: "zone-id", expected: "sujeito" } },
  },
];
