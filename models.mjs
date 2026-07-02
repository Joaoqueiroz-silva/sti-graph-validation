#!/usr/bin/env node
/**
 * models.mjs — Transparência e diagnóstico: `npm run models`
 *
 * Imprime a configuração ativa (agente → modelo → temperatura → função) e,
 * se houver OPENROUTER_API_KEY no .env, faz uma chamada mínima para validar
 * a chave e o acesso aos dois modelos (gerador e juiz).
 */
import "dotenv/config";
import { AGENTS, modelCard, createLLM, callLLM, getAgentConfig } from "./llm.js";

const line = "─".repeat(78);
console.log(line);
console.log("CONFIGURAÇÃO ATIVA DO EXPERIMENTO (modelos por agente)");
console.log(line);
for (const c of modelCard()) {
  console.log(
    `${c.agente.padEnd(20)} ${c.papel.padEnd(10)} ${c.modelo.padEnd(28)} temp=${String(c.temperatura).padEnd(5)}`
  );
  console.log(`${" ".repeat(20)} └ ${c.funcao}`);
}
console.log(line);
console.log("Para trocar qualquer modelo ou temperatura, edite o .env (veja o .env.example).");

if (!process.env.OPENROUTER_API_KEY) {
  console.log("\n⚠ OPENROUTER_API_KEY não definida. Copie o .env.example para .env e cole a sua chave.");
  process.exit(0);
}

console.log("\nValidando a chave com uma chamada mínima a cada papel…");
const ping = async (key) => {
  const t0 = Date.now();
  try {
    const llm = createLLM(getAgentConfig(key));
    const out = await callLLM(llm, "Responda apenas: ok", "ping", { agent: "models-check" });
    return `✓ ${getAgentConfig(key).model} respondeu em ${Date.now() - t0}ms ("${String(out).trim().slice(0, 20)}")`;
  } catch (e) {
    return `✗ ${getAgentConfig(key).model} FALHOU: ${e.message.slice(0, 120)}`;
  }
};
console.log("gerador :", await ping("agent3a_advanced"));
console.log("juiz    :", await ping("agent9_review"));
console.log("\nTudo certo? Então: npm run eval:real (avaliação) e npm run judge:real (juiz).");
