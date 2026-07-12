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

// ─── Regressões do parecer 2026-07-12 (plano mestre §5.4 e §5.6) ────────────

import { signFlipTest } from "../stats.js";

describe("nHH=0 → não estimável (regressão do parecer 2026-07-12)", () => {
  const soRH = Array.from({ length: 24 }, (_, i) => ({
    value: 0.4,
    exercise: `ex${i}`,
    pairType: "RH",
  }));

  it("sem pares HH: verdict=nao_estimavel, reliable=false, sem IC fabricado", () => {
    const r = nonInferiority(soRH, { margin: 0.1 });
    expect(r.verdict).toBe("nao_estimavel");
    expect(r.reliable).toBe(false);
    expect(r.ci).toBeNull();
    expect(r.diff).toBeNull();
    expect(r.nHH).toBe(0);
    expect(r.reason).toMatch(/nHH=0/);
  });

  it("antes: 24 exercícios sem HH saíam reliable=true — nunca mais", () => {
    const r = nonInferiority(soRH, { margin: 0.1 });
    expect(r.reliable).not.toBe(true);
  });
});

describe("signFlipTest: permutação pareada construída sob H0", () => {
  it("diferenças todas positivas e grandes → p exato mínimo (2/2^n)", () => {
    const diffs = Array.from({ length: 10 }, () => 0.2);
    const r = signFlipTest(diffs);
    expect(r.exact).toBe(true);
    // só a identidade e a inversão total empatam |média| ≥ obs
    expect(r.p).toBeCloseTo(2 / 2 ** 10, 10);
    expect(r.meanDiff).toBeCloseTo(0.2, 10);
  });

  it("diferenças simétricas em torno de zero → p alto (sem efeito)", () => {
    const diffs = [0.1, -0.1, 0.05, -0.05, 0.02, -0.02, 0.08, -0.08];
    const r = signFlipTest(diffs);
    expect(r.p).toBeGreaterThan(0.5);
  });

  it("nunca produz p=0 (piso natural da enumeração/add-one)", () => {
    const r = signFlipTest([0.5, 0.5, 0.5]);
    expect(r.p).toBeGreaterThan(0);
  });

  it("n=24 (o corpus real) ainda é exato", () => {
    const diffs = Array.from({ length: 24 }, (_, i) => (i % 2 ? 0.01 : 0.012));
    const r = signFlipTest(diffs);
    expect(r.exact).toBe(true);
    expect(r.n).toBe(24);
  });

  it("determinístico na variante amostrada (n>24)", () => {
    const diffs = Array.from({ length: 30 }, (_, i) => (i % 3 ? 0.05 : -0.02));
    const a = signFlipTest(diffs, { iterations: 20000, seed: 7 });
    const b = signFlipTest(diffs, { iterations: 20000, seed: 7 });
    expect(a.exact).toBe(false);
    expect(a.p).toBe(b.p);
  });
});
