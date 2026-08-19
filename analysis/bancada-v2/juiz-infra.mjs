/**
 * analysis/bancada-v2/juiz-infra.mjs — infraestrutura comum dos juízes cegos
 * (2026-08-19). Nasceu de DOIS incidentes de execução reais, ambos detectados
 * antes de qualquer número ser publicado. Estão documentados aqui porque a
 * armadilha é silenciosa e voltaria.
 *
 * INCIDENTE 1 — juiz errado, sem erro nenhum. `createLLM(cfg = {})` devolve
 * `cfg.model ? cfg : getAgentConfig()`. Passar a STRING "agent9_review" (em vez
 * do objeto de configuração) não lança: `"agent9_review".model` é undefined, e
 * a chamada cai no agente DEFAULT — google/gemini-3.5-flash. Na primeira versão
 * de juiz-dicas.mjs isso fez 904 escadas serem julgadas pelo gemini, que é a
 * MESMA FAMÍLIA do braço flash-lite (auto-avaliação) e não é o juiz declarado.
 * Os 904 julgamentos foram descartados, não corrigidos a posteriori.
 * Forma certa: `createLLM(getAgentConfig("agent9_review"))` — e `juizAtivo()`
 * abaixo falha alto se o modelo resolvido não for o declarado.
 *
 * INCIDENTE 2 — fallback silencioso para modelo REPROVADO. Em falha da chamada
 * primária, `callLLM` tenta `fallback_emergency`, cujo default é
 * deepseek/deepseek-chat. DeepSeek é exatamente a família que REPROVOU no gate
 * de calibração em 14/08. Sete chamadas saíram por lá antes da detecção. Um
 * juiz não pode ter fallback de modelo: ou responde o juiz declarado, ou o item
 * fica sem veredito. `pinarFallbackNoJuiz()` iguala o FALLBACK_MODEL ao juiz,
 * de modo que a "contingência" seja nova tentativa no MESMO modelo.
 *
 * INCIDENTE 3 — um ECONNRESET derrubava o lote inteiro (`Promise.all` rejeita
 * no primeiro erro): o juiz dos extras morreu na célula 14 de 210. Aqui a
 * unidade de falha é o ITEM: retentativa com espera exponencial e, esgotadas as
 * tentativas, o item vira `{ __falhou: true }`, é CONTADO e reportado — nunca
 * silenciosamente somado como 0 nem como veredito.
 */
import { createLLM, getAgentConfig } from "../../llm.js";

export const JUIZ_DECLARADO = () => process.env.JUDGE_MODEL || "z-ai/glm-4.5";

/**
 * Config do juiz, com GUARDA: se o modelo resolvido não for o declarado, aborta.
 * É a barreira contra o incidente 1.
 */
export function juizAtivo() {
  const cfg = getAgentConfig("agent9_review");
  const esperado = JUIZ_DECLARADO();
  if (!cfg || cfg.model !== esperado) {
    throw new Error(
      `juiz resolvido (${cfg?.model}) != juiz declarado (${esperado}) — execução abortada para não publicar veredito de modelo errado`
    );
  }
  return cfg;
}

/** LLM do juiz, sempre pela config certa (nunca pela string). */
export const llmDoJuiz = () => createLLM(juizAtivo());

/**
 * Iguala o modelo de fallback ao juiz: contingência vira nova tentativa no
 * MESMO modelo. Barreira contra o incidente 2. Chamar ANTES de qualquer import
 * que congele a config — llm.js lê FALLBACK_MODEL no carregamento, então este
 * pino só vale se o env já estiver setado no lançamento do processo; a função
 * existe para o caso de uso programático e para deixar a intenção explícita.
 */
export function fallbackPinado() {
  return process.env.FALLBACK_MODEL === JUIZ_DECLARADO();
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/** Retentativa com espera exponencial. Devolve o resultado ou lança o último erro. */
export async function comRetentativa(fn, { tentativas = 5, baseMs = 1500 } = {}) {
  let ultimo;
  for (let i = 0; i < tentativas; i++) {
    try {
      return await fn();
    } catch (err) {
      ultimo = err;
      if (i < tentativas - 1) await espera(baseMs * 2 ** i);
    }
  }
  throw ultimo;
}

/**
 * Aplica `fn` a todos os itens com concorrência limitada. Falha de UM item
 * nunca derruba o lote: ele vira `{ ...item, __falhou: true, __erro: msg }`.
 * Barreira contra o incidente 3.
 */
export async function mapaResiliente(itens, fn, { concorrencia = 8, tentativas = 5 } = {}) {
  const saida = new Array(itens.length);
  let proximo = 0;
  const trabalhador = async () => {
    while (proximo < itens.length) {
      const i = proximo++;
      try {
        saida[i] = await comRetentativa(() => fn(itens[i], i), { tentativas });
      } catch (err) {
        saida[i] = { ...itens[i], __falhou: true, __erro: String(err?.message ?? err).slice(0, 200) };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concorrencia) }, trabalhador));
  return saida;
}

/** Separa os itens julgados dos que falharam, para que a falha seja REPORTADA. */
export function separarFalhas(resultados) {
  const ok = resultados.filter((r) => r && !r.__falhou);
  const falhas = resultados.filter((r) => r && r.__falhou);
  return { ok, falhas, taxaFalha: resultados.length ? falhas.length / resultados.length : 0 };
}
