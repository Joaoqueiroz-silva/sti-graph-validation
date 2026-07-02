import { describe, it, expect } from "vitest";
import { nonInferiority, mean, percentile, mulberry32 } from "../stats.js";

// Gera dados de N exercícios com jitter determinístico INDEPENDENTE em HH e RH
// (para o bootstrap de cluster ter variância real entre exercícios).
function dataset(n, hhVal, rhVal, jitter = 0.02) {
  const data = [];
  for (let i = 0; i < n; i++) {
    const jHH = (((i % 5) - 2) / 2) * jitter;
    const jRH = (((i % 3) - 1) / 1) * jitter;
    data.push({ exercise: `ex${i}`, pairType: "HH", value: hhVal + jHH });
    data.push({ exercise: `ex${i}`, pairType: "RH", value: rhVal + jRH });
  }
  return data;
}

describe("helpers", () => {
  it("mean", () => expect(mean([1, 2, 3])).toBe(2));
  it("percentile (mediana)", () => expect(percentile([1, 2, 3, 4], 0.5)).toBeCloseTo(2.5, 5));
  it("mulberry32 é determinístico", () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    expect(a()).toBe(b());
  });
});

describe("nonInferiority", () => {
  it("RH ≈ HH (dentro da margem) → NÃO-INFERIOR e confiável (≥10 exercícios)", () => {
    const r = nonInferiority(dataset(12, 0.8, 0.78), { margin: 0.1 });
    expect(r.verdict).toBe("nao-inferior");
    expect(r.reliable).toBe(true);
    expect(r.ci.lower).toBeGreaterThan(-0.1); // IC inteiro à direita de −δ
    expect(r.ci.lower).toBeLessThan(r.ci.upper); // IC não-degenerado
  });

  it("RH bem mais baixo → INFERIOR (IC inteiro à esquerda de −δ)", () => {
    const r = nonInferiority(dataset(12, 0.8, 0.55), { margin: 0.1 });
    expect(r.verdict).toBe("inferior");
    expect(r.ci.upper).toBeLessThan(-0.1);
  });

  it("RH claramente acima → SUPERIOR (IC inteiro ≥ 0)", () => {
    const r = nonInferiority(dataset(12, 0.7, 0.85), { margin: 0.1 });
    expect(r.verdict).toBe("superior");
    expect(r.ci.lower).toBeGreaterThanOrEqual(0);
  });

  it("poucos exercícios → reliable=false (inferência ilustrativa)", () => {
    const r = nonInferiority(dataset(3, 0.8, 0.78), { margin: 0.1 });
    expect(r.reliable).toBe(false);
  });

  it("determinístico: mesma semente → mesmo IC", () => {
    const d = dataset(12, 0.8, 0.78);
    const a = nonInferiority(d, { margin: 0.1, seed: 99 });
    const b = nonInferiority(d, { margin: 0.1, seed: 99 });
    expect(a.ci).toEqual(b.ci);
  });
});
