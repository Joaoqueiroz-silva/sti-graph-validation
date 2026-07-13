/**
 * exec-manifest.js — Manifesto de execução, custo por chamada e trava de orçamento (G11).
 *
 * Exigências E4/Apêndice B do plano de análise: TODA chamada de LLM do experimento
 * fica registrada (modelo, temperatura, hash do prompt, tokens, latência, custo) num
 * JSONL append-only por corrida (runs/manifests/<runId>.jsonl), e o gasto acumulado
 * fica em runs/budget.json — com trava dura (assertBudget) para o experimento parar
 * ANTES de estourar o orçamento, nunca depois.
 *
 * 2026-07-13 (Onda 3): telemetria NUNCA derruba o experimento — quem chama recordCall
 * deve embrulhar em try/catch (llm.js faz isso). A trava de orçamento, ao contrário,
 * DEVE derrubar: BudgetExceededError propaga de propósito.
 *
 * Env:
 *   STI_RUN_ID      identificador da corrida (default "adhoc")
 *   STI_RUNS_DIR    redireciona a pasta runs/ (default: runs/ na raiz do repo; testes usam tmpdir)
 *   STI_BUDGET_USD  limite de gasto em USD (default 50)
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

// 2026-07-13 (Onda 3): tabela de preços CONGELADA nesta data, em USD por MILHÃO de
// tokens (input/output). Fonte: API pública da OpenRouter (https://openrouter.ai/api/v1/models),
// consultada em 2026-07-13. Congelar aqui (e não consultar ao vivo) garante que o custo
// reportado no artigo é reprodutível byte a byte a partir do manifesto.
// Modelo FORA da tabela: custo null + aviso no registro do manifesto — nunca trava.
export const PRICES = Object.freeze({
  "google/gemini-3.5-flash": Object.freeze({ input: 1.5, output: 9.0 }),
  "z-ai/glm-5.2": Object.freeze({ input: 0.93, output: 3.0 }),
  "deepseek/deepseek-v4-pro": Object.freeze({ input: 0.435, output: 0.87 }),
  "anthropic/claude-sonnet-5": Object.freeze({ input: 2.0, output: 10.0 }),
  "mistralai/mistral-large-2512": Object.freeze({ input: 0.5, output: 1.5 }),
  "qwen/qwen3.7-plus": Object.freeze({ input: 0.32, output: 1.28 }),
  "meta-llama/llama-4-maverick": Object.freeze({ input: 0.2, output: 0.8 }),
  // 2026-07-13 (Onda 3): preço do fallback é ESTIMATIVA (o fallback roda raramente e o
  // valor exato flutua na OpenRouter); fica anotado aqui de propósito.
  "deepseek/deepseek-chat": Object.freeze({ input: 0.3, output: 1.2 }),
});

const PRICES_FROZEN_AT = "2026-07-13";

/** Erro da trava de orçamento: o experimento PARA quando o gasto acumulado atinge o limite. */
export class BudgetExceededError extends Error {
  constructor(totalUsd, limitUsd) {
    super(
      `Orçamento estourado: US$ ${totalUsd.toFixed(4)} acumulados >= limite de US$ ${limitUsd.toFixed(2)} ` +
        `(ajuste STI_BUDGET_USD ou zere runs/budget.json conscientemente).`
    );
    this.name = "BudgetExceededError";
    this.totalUsd = totalUsd;
    this.limitUsd = limitUsd;
  }
}

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

/** Pasta runs/ ativa (STI_RUNS_DIR redireciona; default raiz do repo — testes usam tmpdir). */
export function runsDir() {
  const d = process.env.STI_RUNS_DIR;
  return d != null && d !== "" ? d : path.join(MODULE_DIR, "runs");
}

const budgetFile = () => path.join(runsDir(), "budget.json");

/** SHA-256 hexadecimal de um texto (hash de prompts/envelopes para auditoria sem vazar conteúdo). */
export function sha256(texto) {
  return crypto.createHash("sha256").update(String(texto ?? ""), "utf8").digest("hex");
}

/** Custo em USD de uma chamada, pela tabela congelada. Modelo fora da tabela → null (nunca trava). */
export function costOf(model, tokensIn, tokensOut) {
  const p = PRICES[model];
  if (!p) return null;
  const tin = Number.isFinite(tokensIn) ? tokensIn : 0;
  const tout = Number.isFinite(tokensOut) ? tokensOut : 0;
  return (tin / 1e6) * p.input + (tout / 1e6) * p.output;
}

/** Limite ativo de orçamento (env STI_BUDGET_USD, default 50 USD). */
export function budgetLimitUsd() {
  const v = parseFloat(process.env.STI_BUDGET_USD);
  return Number.isFinite(v) ? v : 50;
}

/**
 * Lê (e opcionalmente acumula em) runs/budget.json: { totalUsd, updatedAt, calls }.
 * Sem argumento: só lê (arquivo ausente/corrompido → estado zerado, nunca lança).
 * Com addUsd numérico: acumula o gasto de UMA chamada (calls++) e persiste.
 * 2026-07-13 (Onda 3): leitura+escrita síncronas simples de propósito — as corridas do
 * experimento são sequenciais; não há corrida concorrente a proteger aqui.
 */
export function budget(addUsd = null) {
  let b;
  try {
    b = JSON.parse(fs.readFileSync(budgetFile(), "utf8"));
  } catch {
    b = null;
  }
  if (!b || typeof b !== "object" || !Number.isFinite(b.totalUsd)) {
    b = { totalUsd: 0, updatedAt: null, calls: 0 };
  }
  if (!Number.isFinite(b.calls)) b.calls = 0;
  if (typeof addUsd === "number" && Number.isFinite(addUsd)) {
    b.totalUsd += addUsd;
    b.calls += 1;
    b.updatedAt = new Date().toISOString();
    fs.mkdirSync(runsDir(), { recursive: true });
    fs.writeFileSync(budgetFile(), JSON.stringify(b, null, 2) + "\n");
  }
  return b;
}

/** Trava de orçamento: lança BudgetExceededError se o gasto acumulado já atingiu o limite. */
export function assertBudget(limitUsd = budgetLimitUsd()) {
  const b = budget();
  if (b.totalUsd >= limitUsd) throw new BudgetExceededError(b.totalUsd, limitUsd);
  return b;
}

// runId vira nome de arquivo: só caracteres seguros (evita path traversal e nomes inválidos).
const safeRunId = (runId) => String(runId).replace(/[^A-Za-z0-9._-]/g, "-");

/**
 * Registra UMA chamada de LLM no manifesto JSONL da corrida e acumula o custo no budget.
 * Campos calculados aqui: costUsd (pela tabela PRICES, se ausente na entrada) e ts.
 * Devolve o registro gravado. Lança se o disco falhar — quem chama decide se engole
 * (llm.js engole com warn: telemetria nunca derruba experimento).
 */
export function recordCall(entry = {}) {
  const runId = entry.runId || process.env.STI_RUN_ID || "adhoc";
  const model = entry.model ?? null;
  const tokensIn = Number.isFinite(entry.tokensIn) ? entry.tokensIn : null;
  const tokensOut = Number.isFinite(entry.tokensOut) ? entry.tokensOut : null;
  const costUsd = entry.costUsd !== undefined ? entry.costUsd : costOf(model, tokensIn, tokensOut);

  const rec = {
    ts: entry.ts || new Date().toISOString(),
    runId,
    exerciseId: entry.exerciseId ?? null,
    agentKey: entry.agentKey ?? null,
    model,
    temperature: entry.temperature ?? null,
    promptSha256: entry.promptSha256 ?? null,
    envelopeSha256: entry.envelopeSha256 ?? null,
    attempt: entry.attempt ?? 1,
    fallbackUsed: entry.fallbackUsed === true,
    status: entry.status || "ok",
    latencyMs: entry.latencyMs ?? null,
    tokensIn,
    tokensOut,
    tokensEstimated: entry.tokensEstimated === true,
    costUsd,
    pricesFrozenAt: PRICES_FROZEN_AT,
  };
  if (costUsd == null) {
    rec.warning = `modelo "${model}" sem preço na tabela PRICES (${PRICES_FROZEN_AT}); custo desconhecido, orçamento não incrementado`;
  }
  if (entry.error) rec.error = String(entry.error);

  const file = path.join(runsDir(), "manifests", `${safeRunId(runId)}.jsonl`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Append de UMA linha por chamada: atômico o suficiente para o nosso uso sequencial.
  fs.appendFileSync(file, JSON.stringify(rec) + "\n");

  // Acumula TODAS as chamadas no budget (custo desconhecido conta como 0, mas calls++).
  budget(Number.isFinite(costUsd) ? costUsd : 0);
  return rec;
}
