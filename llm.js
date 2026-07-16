/**
 * llm.js — Cliente de IA do experimento (substitui o pipeline-core do backend EducaOFF).
 *
 * A tabela AGENTS abaixo pertence à bancada histórica das Campanhas 1--3. Ela não é
 * prova de identidade com a implantação auditada; a Campanha 4 usa o runner e os
 * hashes em production-fidelity/. Rode `npm run models` para inspecionar a bancada
 * sem rede. Somente `npm run models:ping` autoriza chamadas de diagnóstico.
 *
 * Todos os modelos são acessados pela OpenRouter (API compatível com OpenAI), então
 * UMA chave cobre tudo: OPENROUTER_API_KEY (https://openrouter.ai/keys).
 *
 * Papéis e famílias:
 *   - GERADOR (os 3 alunos simulados): Google Gemini 3.5 Flash. As temperaturas
 *     diferem de propósito: o aluno avançado é quase determinístico (0.2), o aluno
 *     com dificuldades precisa de diversidade para os erros emergirem (0.7) e o
 *     mediano fica no meio (0.4).
 *   - JUIZ histórico (validade e importância): GLM-4.5, da Z.ai. FAMÍLIA DIFERENTE do gerador,
 *     de propósito: modelos tendem a aprovar a produção da própria família
 *     (viés de autopreferência, Panickssery et al. 2024). Temperatura 0.1 para
 *     julgamento estável.
 *   - FALLBACK histórico: DeepSeek, usado uma única vez se a chamada primária falhar.
 *
 * O painel final da Campanha 4 usou GLM-5.2, Qwen 3.7 Plus e DeepSeek V4 Pro,
 * sem fallback. Não altere este cliente retroativamente para simular esse painel.
 *
 * Para uma nova execução deliberada da bancada histórica, use o .env:
 *   GEN_MODEL       troca o modelo dos 3 alunos de uma vez
 *   AGENT3A_MODEL / AGENT3B_MODEL / AGENT3C_MODEL   trocam um aluno específico
 *   JUDGE_MODEL     troca o juiz (mantenha família ≠ do gerador!)
 *   FALLBACK_MODEL  troca o fallback
 *   *_TEMP          trocam a temperatura correspondente (ex.: AGENT3B_TEMP=0.9)
 *
 * 2026-07-13 (Onda 3, G11): toda chamada desta bancada fica registrada no manifesto de execução
 * (runs/manifests/<runId>.jsonl, ver exec-manifest.js) com custo por chamada, e uma
 * trava de orçamento (STI_BUDGET_USD, default US$ 50) para o experimento ANTES de
 * estourar o gasto. STI_RUN_ID nomeia a corrida; STI_RUNS_DIR redireciona a pasta.
 */

import fs from "node:fs";
import { logger } from "./logger.js";
import { recordCall, assertBudget, sha256 } from "./exec-manifest.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const env = (k, dflt) => (process.env[k] != null && process.env[k] !== "" ? process.env[k] : dflt);
const envNum = (k, dflt) => (process.env[k] != null && process.env[k] !== "" ? parseFloat(process.env[k]) : dflt);

const GEN = env("GEN_MODEL", "google/gemini-3.5-flash");
const JUDGE = env("JUDGE_MODEL", "z-ai/glm-4.5");
const FALLBACK = env("FALLBACK_MODEL", "deepseek/deepseek-chat");

/**
 * CONFIGURAÇÃO DA BANCADA HISTÓRICA, por agente; não é o congelamento de produção C4.
 * papel: generator = autora o grafo · judge = avalia às cegas · fallback = contingência.
 */
export const AGENTS = {
  agent3a_advanced: {
    papel: "generator",
    descricao: "aluno AVANÇADO simulado: produz o caminho de resolução correto",
    model: env("AGENT3A_MODEL", GEN),
    temperature: envNum("AGENT3A_TEMP", 0.2),
    maxTokens: 16000,
  },
  agent3b_atrisk: {
    papel: "generator",
    descricao: "aluno COM DIFICULDADES simulado: produz as misconceptions (erros)",
    model: env("AGENT3B_MODEL", GEN),
    temperature: envNum("AGENT3B_TEMP", 0.7),
    maxTokens: 24000,
  },
  agent3c_average: {
    papel: "generator",
    descricao: "aluno MEDIANO simulado: produz as dicas em 4 níveis",
    model: env("AGENT3C_MODEL", GEN),
    temperature: envNum("AGENT3C_TEMP", 0.4),
    maxTokens: 16000,
  },
  eval_student_sim: {
    papel: "generator",
    descricao: "modo simplificado (os 3 alunos numa chamada; só para iteração rápida)",
    model: GEN,
    temperature: envNum("SHIM_TEMP", 0.7),
    maxTokens: 24000,
  },
  agent9_review: {
    papel: "judge",
    descricao: "JUIZ CEGO cross-family: validade dos extras e importância dos perdidos",
    model: JUDGE,
    temperature: envNum("JUDGE_TEMP", 0.1),
    maxTokens: 32000,
  },
  fallback_emergency: {
    papel: "fallback",
    descricao: "contingência: 1 nova tentativa se a chamada primária falhar",
    model: FALLBACK,
    temperature: 0.3,
    maxTokens: 16000,
  },
};

/** Devolve a config de um agente (compatível com getAgentConfig do backend). */
export function getAgentConfig(key = "agent3b_atrisk") {
  const a = AGENTS[key] || AGENTS.agent3b_atrisk;
  return { key, role: a.papel, provider: "openrouter", model: a.model, temperature: a.temperature, maxTokens: a.maxTokens };
}

/** "Cria" um LLM (guarda a config; a chamada real acontece em callLLM). */
export function createLLM(cfg = {}) {
  return { cfg: cfg.model ? cfg : getAgentConfig() };
}

/** Tabela da configuração ativa (transparência; usada por `npm run models`). */
export function modelCard() {
  return Object.entries(AGENTS).map(([key, a]) => ({
    agente: key,
    papel: a.papel,
    modelo: a.model,
    temperatura: a.temperature,
    maxTokens: a.maxTokens,
    funcao: a.descricao,
  }));
}

// 2026-07-13 (Onda 3, G11): entrada multimodal — imagens PNG locais viram data-URI
// no formato de partes da OpenRouter/OpenAI. Sem imagens, o content segue string pura
// (comportamento idêntico ao anterior, byte a byte no payload).
function buildUserContent(user, images) {
  if (!Array.isArray(images) || images.length === 0) return user;
  const parts = [{ type: "text", text: user }];
  for (const img of images) {
    const b64 = fs.readFileSync(img).toString("base64");
    parts.push({ type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } });
  }
  return parts;
}

const estimateTokens = (text) => Math.ceil(String(text ?? "").length / 4);

async function openrouter(model, system, user, { temperature = 0.3, maxTokens = 16000, images } = {}) {
  const t0 = Date.now();
  try {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) throw new Error("Defina OPENROUTER_API_KEY no arquivo .env (copie o .env.example).");
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: buildUserContent(user, images) },
        ],
        temperature,
        max_tokens: maxTokens,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`OpenRouter ${res.status} (${model}): ${body.slice(0, 200)}`);
    }
    const json = await res.json();
    const content = json.choices?.[0]?.message?.content;
    if (!content || !content.trim()) throw new Error(`Resposta vazia (${model})`);
    // 2026-07-13 (Onda 3, G11): usage real quando a OpenRouter devolve; senão estimativa
    // conservadora chars/4, MARCADA como estimada (o manifesto nunca finge precisão).
    const usage = json.usage || {};
    let tokensIn = usage.prompt_tokens;
    let tokensOut = usage.completion_tokens;
    let tokensEstimated = false;
    if (!Number.isFinite(tokensIn)) {
      tokensIn = estimateTokens(system) + estimateTokens(user);
      tokensEstimated = true;
    }
    if (!Number.isFinite(tokensOut)) {
      tokensOut = estimateTokens(content);
      tokensEstimated = true;
    }
    return { content, tokensIn, tokensOut, tokensEstimated, latencyMs: Date.now() - t0 };
  } catch (err) {
    err.latencyMs = Date.now() - t0; // latência também na falha (vai pro manifesto)
    throw err;
  }
}

// 2026-07-13 (Onda 3, G11): telemetria NUNCA derruba o experimento — se o manifesto
// falhar ao gravar (disco, permissão), a chamada de LLM segue e fica só um warn.
function safeRecord(entry) {
  try {
    recordCall(entry);
  } catch (err) {
    logger.warn({ err: err.message }, "falha ao gravar o manifesto de execução (telemetria ignorada)");
  }
}

/**
 * Chama o modelo do agente (system + user). Tenta o fallback uma vez se falhar.
 * meta opcional: { agent, sessionId, runId, exerciseId, envelopeSha256, images }.
 * 2026-07-13 (Onda 3, G11): trava de orçamento ANTES de cada chamada (BudgetExceededError
 * propaga de propósito — é a única exceção que não tenta fallback) e registro no
 * manifesto em sucesso E em falha (fallback = attempt 2, fallbackUsed true).
 */
export async function callLLM(llm, system, user, meta = {}) {
  const cfg = llm?.cfg || getAgentConfig();
  const base = {
    runId: meta.runId,
    exerciseId: meta.exerciseId ?? null,
    agentKey: meta.agent ?? cfg.key ?? null,
    promptSha256: sha256(String(system ?? "") + String(user ?? "")),
    envelopeSha256: meta.envelopeSha256 ?? null,
  };
  const attempt = async (model, temperature, opts, n, fallbackUsed) => {
    assertBudget(); // trava dura: para ANTES de gastar (limite via STI_BUDGET_USD, default 50)
    try {
      const out = await openrouter(model, system, user, { ...opts, images: meta.images });
      safeRecord({
        ...base,
        model,
        temperature,
        attempt: n,
        fallbackUsed,
        status: "ok",
        latencyMs: out.latencyMs,
        tokensIn: out.tokensIn,
        tokensOut: out.tokensOut,
        tokensEstimated: out.tokensEstimated,
      });
      return out.content;
    } catch (err) {
      // Na falha, o prompt em geral FOI processado (custa input): estimamos tokensIn
      // para o orçamento não subestimar o gasto; tokensOut = 0.
      safeRecord({
        ...base,
        model,
        temperature,
        attempt: n,
        fallbackUsed,
        status: "error",
        latencyMs: err.latencyMs ?? null,
        tokensIn: estimateTokens(system) + estimateTokens(user),
        tokensOut: 0,
        tokensEstimated: true,
        error: err.message,
      });
      throw err;
    }
  };
  try {
    return await attempt(cfg.model, cfg.temperature, cfg, 1, false);
  } catch (err) {
    if (err && err.name === "BudgetExceededError") throw err; // orçamento estourado: sem fallback
    logger.warn(
      { agent: meta.agent, model: cfg.model, err: err.message },
      "chamada primária falhou; tentando o fallback"
    );
    const fb = AGENTS.fallback_emergency;
    return await attempt(fb.model, fb.temperature, fb, 2, true);
  }
}

/** Extrai um objeto JSON do texto do modelo (tolerante a code fences, lixo e truncamento). */
export function extractJson(text) {
  const cleaned = String(text || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim();
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1].trim() : cleaned;
  const i = raw.indexOf("{");
  if (i === -1) return null;
  const s = raw.substring(i);
  try {
    return JSON.parse(s);
  } catch {
    /* tenta reparar abaixo */
  }
  const j = s.lastIndexOf("}");
  if (j > 0) {
    const trunc = s.substring(0, j + 1);
    try {
      return JSON.parse(trunc);
    } catch {
      /* limpezas comuns */
    }
    const clean = trunc
      .replace(/,\s*}/g, "}")
      .replace(/,\s*]/g, "]")
      .replace(/([{,]\s*)(\w+):/g, '$1"$2":')
      .replace(/:\s*'([^']*)'/g, ': "$1"');
    try {
      return JSON.parse(clean);
    } catch {
      /* desiste */
    }
  }
  return null;
}
