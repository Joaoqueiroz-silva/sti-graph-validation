/**
 * request-context.js — AsyncLocalStorage pra propagar tier + customOverrides.
 *
 * Por que AsyncLocalStorage e não threading explícito: getAgentConfig é chamado
 * por ~10 agentes em arquivos diferentes (nodes/agent*.js, patterns/planner.js,
 * fact-checker.js etc.). Threadar { tier } por todos os call sites multiplicaria
 * a área de mudança e geraria muito churn. AsyncLocalStorage propaga
 * automaticamente através de await/promise chains sem tocar nas assinaturas.
 *
 * Uso:
 *   import { runWithRequestContext, getRequestContext } from ".../request-context.js";
 *   await runWithRequestContext({ tier: "premium", customOverrides: {...} }, async () => {
 *     // tudo que rodar aqui dentro vê o contexto, inclusive nested awaits
 *     const tutor = await generateTutorV8({...});
 *   });
 */

import { AsyncLocalStorage } from "async_hooks";

const storage = new AsyncLocalStorage();

/**
 * Roda fn dentro de um contexto com { tier, customOverrides, outputLanguageDirective, outputLanguageCode }.
 * @param {{ tier?: string, customOverrides?: object, outputLanguageDirective?: string, outputLanguageCode?: string }} ctx
 * @param {() => Promise<any>} fn
 */
export function runWithRequestContext(ctx, fn) {
  const safe = {
    tier: ctx?.tier || "balanced",
    customOverrides: ctx?.customOverrides || {},
    outputLanguageDirective: ctx?.outputLanguageDirective || "",
    outputLanguageCode: ctx?.outputLanguageCode || "pt-BR",
    // 2026-04-28: imageModel selecionado pelo professor via imageQualityTier
    imageModel: ctx?.imageModel || null,
    autoRecoverCount: 0,
    disableImages: !!ctx?.disableImages,
    // 2026-08-02 (BYO-LLM): conexão LLM do usuário (platform|openrouter-byok|
    // openai-oauth|claude-oauth) resolvida em sti-generation.js. NUNCA logar
    // este campo — carrega segredos descriptografados em memória.
    userLlm: ctx?.userLlm || { mode: "platform", fallbackToPlatform: true },
    // Marcado true pelo oauth-chat-model quando a conta do usuário falha e o
    // fallback plataforma assume alguma chamada — vai pro _metadata.llmConnection
    // (transparência: o badge pós-geração diz se a conta dele foi usada 100%).
    byoPlatformFallbackUsed: !!ctx?.byoPlatformFallbackUsed,
    // 2026-08-02 (tela real): sessionId da geração — o cost-tracker usa pra
    // emitir SSE cost_update com tokens/custo REAIS por chamada (Loading.jsx
    // mostrava estimativas fake; agora mede de verdade).
    sessionId: ctx?.sessionId || null,
    // 2026-08-05 (modo simples): interface rica é OPT-IN do criador. Ausente
    // = true (retrocompatível: chamadores antigos, testes e baterias e2e
    // continuam no caminho rico); o formulário da plataforma manda `false`
    // por padrão. Consumidores usam isSimpleInterface(), nunca leem direto.
    richInterface: ctx?.richInterface !== false,
  };
  return storage.run(safe, fn);
}

/**
 * Retorna o contexto atual ou um default seguro se não estiver dentro de runWithRequestContext.
 */
export function getRequestContext() {
  return (
    storage.getStore() || {
      tier: "balanced",
      customOverrides: {},
      outputLanguageDirective: "",
      outputLanguageCode: "pt-BR",
      imageModel: null,
      autoRecoverCount: 0,
      disableImages: false,
      userLlm: { mode: "platform", fallbackToPlatform: true },
      byoPlatformFallbackUsed: false,
      sessionId: null,
      richInterface: true,
    }
  );
}

/**
 * 2026-08-05 (modo simples): true quando o criador NÃO marcou "interface rica".
 * Fora de runWithRequestContext (testes unitários, scripts) retorna false —
 * o comportamento histórico (rico) é o default em todo lugar.
 */
export function isSimpleInterface() {
  return getRequestContext().richInterface === false;
}

/**
 * Retorna true se estiver dentro de um contexto ativo (runWithRequestContext).
 */
export function hasRequestContext() {
  return storage.getStore() !== undefined;
}

/**
 * Atualiza valores específicos no contexto atual (mutação in-place no store ativo).
 * Usado pra adicionar idioma APÓS detect (que só acontece dentro do generateTutorV8).
 * Se chamado fora de runWithRequestContext, é no-op.
 */
export function updateRequestContext(patch) {
  const store = storage.getStore();
  if (!store || !patch) return;
  Object.assign(store, patch);
}
