import { describe, it, expect, vi } from "vitest";
import { createLLM } from "../llm.js";
import { juizAtivo, comRetentativa, mapaResiliente, separarFalhas, JUIZ_DECLARADO } from "../analysis/bancada-v2/juiz-infra.mjs";

describe("guarda do juiz (incidente 1: juiz errado sem erro nenhum)", () => {
  it("createLLM com STRING cai no modelo DEFAULT — a armadilha que causou o incidente", () => {
    const errado = createLLM("agent9_review");
    expect(errado.cfg.model).not.toBe(JUIZ_DECLARADO());
  });
  it("juizAtivo() resolve exatamente o juiz declarado", () => {
    expect(juizAtivo().model).toBe(JUIZ_DECLARADO());
  });
  it("juizAtivo() ABORTA se o juiz declarado não for o que a config resolve", () => {
    const antes = process.env.JUDGE_MODEL;
    process.env.JUDGE_MODEL = "modelo/que-nao-existe";
    expect(() => juizAtivo()).toThrow(/juiz resolvido.*!=.*juiz declarado/);
    if (antes === undefined) delete process.env.JUDGE_MODEL; else process.env.JUDGE_MODEL = antes;
  });
});

describe("comRetentativa (incidente 3: ECONNRESET derrubava o lote)", () => {
  it("devolve o resultado quando a primeira tentativa passa", async () => {
    expect(await comRetentativa(async () => 42, { baseMs: 1 })).toBe(42);
  });
  it("insiste e vence uma falha transitória", async () => {
    let n = 0;
    const r = await comRetentativa(async () => { if (++n < 3) throw new Error("ECONNRESET"); return "ok"; }, { baseMs: 1 });
    expect(r).toBe("ok");
    expect(n).toBe(3);
  });
  it("lança o último erro quando esgota as tentativas", async () => {
    await expect(comRetentativa(async () => { throw new Error("morreu"); }, { tentativas: 2, baseMs: 1 })).rejects.toThrow("morreu");
  });
});

describe("mapaResiliente", () => {
  it("um item que falha não derruba os outros e fica MARCADO", async () => {
    const itens = [1, 2, 3, 4];
    const r = await mapaResiliente(itens, async (x) => { if (x === 3) throw new Error("falhou"); return { x, ok: true }; }, { concorrencia: 2, tentativas: 1 });
    const { ok, falhas, taxaFalha } = separarFalhas(r);
    expect(ok.length).toBe(3);
    expect(falhas.length).toBe(1);
    expect(taxaFalha).toBeCloseTo(0.25, 10);
    expect(falhas[0].__erro).toMatch(/falhou/);
  });
  it("preserva a ordem dos itens", async () => {
    const r = await mapaResiliente([1, 2, 3], async (x) => ({ x }), { concorrencia: 3 });
    expect(r.map((y) => y.x)).toEqual([1, 2, 3]);
  });
  it("respeita o limite de concorrência", async () => {
    let vivos = 0, pico = 0;
    await mapaResiliente(Array.from({ length: 20 }, (_, i) => i), async () => {
      vivos++; pico = Math.max(pico, vivos);
      await new Promise((r) => setTimeout(r, 5));
      vivos--; return 1;
    }, { concorrencia: 4 });
    expect(pico).toBeLessThanOrEqual(4);
  });
});
