/** Política explícita de reasoning para payloads OpenRouter. Sem rede. */
export const REASONING_EFFORTS = Object.freeze(["none", "minimal", "low", "medium", "high"]);

export const REASONING_BY_MODEL_V08 = Object.freeze({
  "google/gemini-3.1-flash-lite": Object.freeze({ effort: "minimal", exclude: true }),
  "qwen/qwen3-max": Object.freeze({ omit: true }),
  "google/gemini-3.5-flash": Object.freeze({ effort: "minimal", exclude: true }),
  "openai/gpt-5.6-luna": Object.freeze({ effort: "none", exclude: true }),
});

export function politicaReasoningDoModeloV08(model) {
  const policy = REASONING_BY_MODEL_V08[String(model)];
  if (!policy) throw new Error(`modelo sem política de reasoning v0.8 congelada: ${model}`);
  return { ...policy };
}

export function envDaPoliticaReasoning(policy) {
  if (policy?.omit === true) {
    return { STI_REASONING_EFFORT: "omit", STI_REASONING_EXCLUDE: "1" };
  }
  if (!REASONING_EFFORTS.includes(String(policy?.effort))) {
    throw new Error(`effort de reasoning inválido: ${policy?.effort}`);
  }
  return {
    STI_REASONING_EFFORT: String(policy.effort),
    STI_REASONING_EXCLUDE: policy.exclude === false ? "0" : "1",
  };
}

/**
 * Resolve o payload sem inventar suporte do provedor. `omit` significa que a
 * chave `reasoning` não é enviada. O env legado permanece aceito somente para
 * reprodução histórica e equivale a none+exclude.
 */
export function resolverPoliticaReasoning(env = process.env) {
  const explicit = String(env.STI_REASONING_EFFORT || "").trim().toLowerCase();
  if (explicit === "omit") {
    return {
      request: null,
      record: { mode: "omitted", effort: null, exclude: null, source: "STI_REASONING_EFFORT" },
    };
  }
  if (explicit) {
    if (!REASONING_EFFORTS.includes(explicit)) {
      throw new Error(`STI_REASONING_EFFORT inválido: ${explicit}`);
    }
    const exclude = String(env.STI_REASONING_EXCLUDE ?? "1") !== "0";
    return {
      request: { effort: explicit, exclude },
      record: { mode: "explicit", effort: explicit, exclude, source: "STI_REASONING_EFFORT" },
    };
  }
  if (env.STI_SEM_RACIOCINIO === "1") {
    return {
      request: { effort: "none", exclude: true },
      record: { mode: "legacy-explicit", effort: "none", exclude: true, source: "STI_SEM_RACIOCINIO" },
    };
  }
  return {
    request: null,
    record: { mode: "provider-default", effort: null, exclude: null, source: null },
  };
}
