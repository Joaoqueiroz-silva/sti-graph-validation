/**
 * dynamic_spec - renderer generico de specs SVG declarativos.
 *
 * Este componente e uma excecao controlada: permite visual novo quando nenhum
 * componente conhecido resolve, mas nao deve ser escolha livre para qualquer
 * step. O contrato exige spec validado e uma interacao que realmente submeta
 * uma resposta verificavel.
 */

import { z } from "zod";
import { validateSpec } from "../../component-spec-schema.js";

const componentPropsSchema = z
  .object({
    spec: z.any().optional(),
    question: z.string().max(240).optional(),
  })
  .passthrough();

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function optionValue(opt) {
  if (typeof opt === "string") return opt;
  return String(opt?.value ?? opt?.label ?? opt?.text ?? "").trim();
}

function idsByType(spec) {
  const ids = new Map();
  for (const el of spec?.elements || []) {
    if (!el?.id) continue;
    const list = ids.get(el.type) || [];
    list.push(el.id);
    ids.set(el.type, list);
  }
  return ids;
}

function validatedSpec(raw) {
  const result = validateSpec(raw);
  if (!result.valid) return { ok: false, reason: result.errors?.join("; ") || "spec invalido" };
  if (result.errors?.length) return { ok: false, reason: result.errors.join("; ") };
  return { ok: true, spec: result.spec };
}

export default {
  id: "dynamic_spec",
  rendererPath: "frontend/src/components/RichStep/DynamicVisualComponent.jsx",

  description:
    "Spec visual declarativo validado; usar apenas quando nenhum componente conhecido cobre o caso.",

  whenToUse: [
    "Caso raro sem componente hardcoded adequado",
    "Visual esquematico especifico com canvas/elements seguros",
    "Interacao click-zone, identify-element ou input-value claramente verificavel",
  ],

  whenNotToUse: [
    "Quando existe componente registrado equivalente",
    "Para substituir multiple_choice, word_matcher, card_sort ou hot_spot",
    "Spec apenas decorativo sem input real",
    "Resposta ok/acertou/completo",
  ],

  schema: componentPropsSchema,

  answerContract: {
    accepts: [
      "numeric-pure",
      "numeric-with-unit",
      "shape-name",
      "fraction",
      "expression",
      "time",
      "boolean",
      "text-short",
      // Texto longo é válido quando o próprio spec oferece input-value/text.
      // O pedagogicalGuard abaixo continua exigindo validator e input coerentes.
      "text-long",
    ],
    rejects: ["ok-token", "mapping-pairs", "assignment-map", "edge-map"],
  },

  // 2026-08-16 (F0 do caderno): papel deste componente no modo worksheet;
  // ver SPEC-FORMAT.md secao `notebook` e NOTEBOOK_* em shared/component-sets.js.
  notebook: {
    roles: ["B", "D"],
  },

  pedagogicalGuard: ({ ea = "", componentProps = {}, step = {}, options = [] }) => {
    const rawSpec = componentProps.spec || step.spec;
    const valid = validatedSpec(rawSpec);
    if (!valid.ok) return `spec invalido: ${valid.reason}`;

    const spec = valid.spec;
    const mode = spec.interaction?.mode || "display";
    if (mode === "drag-target")
      return "dynamic_spec drag-target ainda nao e suportado pelo renderer";

    const ids = idsByType(spec);
    const expected = String(spec.interaction?.validator?.expected ?? "").trim();
    const eaNorm = normalize(ea);

    if (mode === "click-zone") {
      if (!expected) return "click-zone precisa de interaction.validator.expected";
      if (normalize(expected) !== eaNorm) return "expectedAnswer deve bater com validator.expected";
      if (!(ids.get("zone") || []).some((id) => normalize(id) === eaNorm)) {
        return "validator.expected nao existe como zone.id";
      }
      return null;
    }

    if (mode === "identify-element") {
      if (!expected) return "identify-element precisa de interaction.validator.expected";
      if (normalize(expected) !== eaNorm) return "expectedAnswer deve bater com validator.expected";
      const allIds = [...ids.values()].flat();
      if (!allIds.some((id) => normalize(id) === eaNorm)) {
        return "validator.expected nao existe como element.id";
      }
      return null;
    }

    if (mode === "input-value") {
      if (!expected) return "input-value precisa de interaction.validator.expected";
      if (normalize(expected) !== eaNorm) return "expectedAnswer deve bater com validator.expected";
      // validateSpec preenche defaults para renderização segura; isso não pode
      // transformar um contrato incompleto do gerador em resposta válida.
      if (!rawSpec?.interaction?.input) return "input-value precisa de interaction.input";
      // 2026-08-05 (bateria Física/MRU): o guard só conferia AUTO-consistência
      // (expected == validator.expected). O worker escreveu, no mesmo passo,
      // a conta certa em componentProps.spec + o placeholder visível ao aluno
      // ("ex: 6000m, 1800s") — e mesmo assim expected virou "SI" (uma sigla
      // que nunca aparece na tela). O aluno que digita exatamente o que o
      // placeholder pediu era marcado errado; nada detectava a contradição
      // interna porque nenhuma outra camada compara expected ao placeholder.
      // Sinal minimo e seguro: se o placeholder tem digito e o gabarito nao
      // tem NENHUM, as duas formas nao podem vir do mesmo calculo.
      const placeholder = String(rawSpec.interaction.input?.placeholder ?? "");
      if (/\d/.test(placeholder) && !/\d/.test(expected)) {
        return "input-value: expected nao bate com o formato numerico sugerido pelo placeholder";
      }
      return null;
    }

    if (mode === "select-option" || mode === "display") {
      const opts = Array.isArray(options) ? options : [];
      if (opts.length < 2)
        return "dynamic_spec precisa de 2+ options para modos display/select-option";
      const values = opts.map(optionValue).map(normalize).filter(Boolean);
      if (values.length !== opts.length) return "option sem value/label/text";
      if (!values.includes(eaNorm)) return "options nao contem expectedAnswer";
      return null;
    }

    return `interaction.mode nao suportado: ${mode}`;
  },

  examples: [
    {
      context: "Biologia EF - clicar organela em diagrama customizado",
      instruction: "Clique no nucleo da celula.",
      expectedAnswer: "nucleo",
      componentProps: {
        spec: {
          canvas: { w: 240, h: 160, bg: "#FFFFFF" },
          elements: [
            { type: "ellipse", cx: 120, cy: 80, rx: 80, ry: 45, color: "#DDF7E8" },
            { type: "circle", id: "nucleo", cx: 120, cy: 80, r: 22, color: "#B8D8FF" },
            { type: "zone", id: "nucleo", x: 96, y: 56, w: 48, h: 48 },
          ],
          interaction: { mode: "click-zone", validator: { type: "zone-id", expected: "nucleo" } },
        },
      },
    },
  ],
};
