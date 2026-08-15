/**
 * Fonte unica para decidir se um dynamic_spec realmente pode receber a
 * resposta do aluno. Mantem o portao estrutural e o quality gate alinhados ao
 * mesmo contrato usado pelo registro do componente.
 */

import dynamicSpecComponent from "./component-registry/components/dynamic-spec.js";

const DIRECT_ANSWER_MODES = new Set(["click-zone", "identify-element", "input-value"]);

export function dynamicSpecGuardReason(step) {
  if (step?.renderAs !== "dynamic_spec") return "renderAs nao e dynamic_spec";
  return dynamicSpecComponent.pedagogicalGuard({
    ea: step.expectedAnswer,
    componentProps: step.componentProps || {},
    step,
    options: step.options || [],
  });
}

export function isAnswerableDynamicSpec(step) {
  return dynamicSpecGuardReason(step) == null;
}

export function isAnswerProducingDynamicSpec(step) {
  const mode = step?.componentProps?.spec?.interaction?.mode;
  return DIRECT_ANSWER_MODES.has(mode) && isAnswerableDynamicSpec(step);
}
