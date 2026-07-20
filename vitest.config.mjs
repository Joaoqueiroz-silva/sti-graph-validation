import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "protocol/archive/**"],
    // 2026-07-20: o default de 5 s do vitest dava falso negativo de reprodução em
    // hardware modesto (VPS pequena) — a suíte é 100% offline, então tempo extra
    // nunca mascara chamada de rede. Os dois testes realmente pesados
    // (campaign4-derived-checks: bootstraps; graph-hallucination.property:
    // 10.000 grafos) declaram timeouts próprios ainda maiores no arquivo.
    testTimeout: 30000,
  },
});
