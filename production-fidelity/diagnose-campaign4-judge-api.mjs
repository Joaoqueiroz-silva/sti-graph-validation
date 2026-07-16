#!/usr/bin/env node

/** Diagnostico isolado da camada OpenRouter; nao produz notas e nao entra no painel. */

const key = process.env.OPENROUTER_API_KEY;
const model = process.argv[2];
const variant = process.argv[3] || "const";
if (!key || !model) throw new Error("OPENROUTER_API_KEY e modelo obrigatorios");

const identity = variant === "const" ? { const: "diagnostic" } : { enum: ["diagnostic"] };
const schema = variant.startsWith("full-portable") ? {
  type: "object",
  additionalProperties: false,
  required: ["unitCode", "agentRole", "scores", "rationale", "evidence", "confidence", "flags"],
  properties: {
    unitCode: { type: "string", enum: ["diagnostic"] },
    agentRole: { type: "string", enum: ["correct_trace"] },
    scores: {
      type: "object",
      additionalProperties: false,
      required: ["correctness_coherence"],
      properties: { correctness_coherence: { type: "integer", enum: [0, 1, 2, 3, 4] } },
    },
    rationale: { type: "string" },
    evidence: { type: "array", items: { type: "string" } },
    confidence: { type: "number" },
    flags: { type: "array", items: { type: "string", enum: ["none", "mathematical_error"] } },
  },
} : {
  type: "object",
  additionalProperties: false,
  required: ["unitCode", "score"],
  properties: {
    unitCode: { type: "string", ...identity },
    score: { type: "integer", minimum: 0, maximum: 4 },
  },
};
const body = {
  model,
  messages: [
    { role: "system", content: "Responda somente o JSON exigido." },
    { role: "user", content: variant.startsWith("full-portable") ? "Use unitCode diagnostic, agentRole correct_trace, score 4, rationale curto, evidence vazia, confidence 1 e flags none." : "Use unitCode diagnostic e score 4." },
  ],
  max_tokens: 300,
  response_format: {
    type: "json_schema",
    json_schema: { name: "diagnostic_schema", strict: true, schema },
  },
  provider: { require_parameters: true, allow_fallbacks: false },
};
if (variant === "portable-low-reasoning") {
  body.reasoning = { effort: "low", exclude: true };
}
if (variant === "full-portable-no-reasoning") {
  body.reasoning = { effort: "none", exclude: true };
}
if (model.startsWith("deepseek/")) body.temperature = 0;

const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(90_000),
});
const data = await response.json();
const message = data?.choices?.[0]?.message;
process.stdout.write(
  `${JSON.stringify({
    model,
    variant,
    httpStatus: response.status,
    error: data?.error || null,
    responseId: data?.id || null,
    finishReason: data?.choices?.[0]?.finish_reason || null,
    nativeFinishReason: data?.choices?.[0]?.native_finish_reason || null,
    messageKeys: message ? Object.keys(message) : [],
    content: typeof message?.content === "string" ? message.content : message?.content ?? null,
    reasoningLength: typeof message?.reasoning === "string" ? message.reasoning.length : null,
    usage: data?.usage || null,
  })}\n`
);
