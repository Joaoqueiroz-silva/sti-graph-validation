/**
 * logger.js — logger mínimo (substitui o pino do backend). Quieto por padrão;
 * warn/error vão pro stderr. Defina STI_LOG=debug para ver info/debug.
 */
const verbose = process.env.STI_LOG === "debug";
const line = (level) => (obj, msg) => {
  const text = typeof obj === "string" ? obj : msg || "";
  if (text) process.stderr.write(`[${level}] ${text}\n`);
};
export const logger = {
  info: verbose ? line("info") : () => {},
  debug: verbose ? line("debug") : () => {},
  warn: line("warn"),
  error: line("error"),
};
