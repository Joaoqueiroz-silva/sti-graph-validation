import { describe, it, expect } from "vitest";
import { veredictoDeEstados, precisaoJulgadaEstados } from "../analysis/bancada-v2/f1-julgado.mjs";

const refEx = { caminho: [
  { valor: "3/5", sistema: false, mecanico: false },
  { valor: "1", sistema: false, mecanico: false },
  { valor: "-1", sistema: false, mecanico: true },   // sentinela: fora do alvo
  { valor: "x", sistema: true, mecanico: false },    // ação do tutor: fora do alvo
] };

describe("veredictoDeEstados", () => {
  it("só lê os itens do robô e canoniza o valor", () => {
    const m = veredictoDeEstados({ julgamentos: [
      { source: "robo-extra", corpus: "6.17", ex: "a", candidate: " 2/4 ", valid: true },
      { source: "especialista", corpus: "6.17", ex: "a", candidate: "9", valid: true },
      { source: "distrator-absurdo", corpus: "6.17", ex: "a", candidate: "9007", valid: false },
    ] });
    expect(m.size).toBe(1);
    expect([...m.values()][0]).toBe(true);
  });
  it("o mesmo valor julgado nos dois braços vale como válido se algum validou", () => {
    const m = veredictoDeEstados({ julgamentos: [
      { source: "robo-extra", corpus: "6.17", ex: "a", candidate: "7", valid: false },
      { source: "robo-extra", corpus: "6.17", ex: "a", candidate: "7", valid: true },
    ] });
    expect(m.get("6.17|a|7")).toBe(true);
  });
});

describe("precisaoJulgadaEstados", () => {
  const passos = (vs) => vs.map((v) => ({ valor: v }));
  it("sem juiz (nada validado) reproduz a precisão estrutural", () => {
    const p = precisaoJulgadaEstados(passos(["3/5", "1", "7"]), refEx, () => false);
    expect(p).toBeCloseTo(2 / 3, 10);
  });
  it("o extra julgado válido deixa de ser falso positivo", () => {
    const p = precisaoJulgadaEstados(passos(["3/5", "1", "7"]), refEx, (v) => v === "7");
    expect(p).toBe(1);
  });
  it("estado do tutor e sentinela não entram no alvo", () => {
    const p = precisaoJulgadaEstados(passos(["-1", "x"]), refEx, () => false);
    expect(p).toBe(0);
  });
  it("deduplica os estados do agente antes de pontuar", () => {
    const p = precisaoJulgadaEstados(passos(["3/5", "3/5", "3/5", "9"]), refEx, () => false);
    expect(p).toBe(0.5); // {3/5, 9}: um casa, outro não
  });
  it("grafo sem estado comparável devolve N/A, não zero", () => {
    expect(precisaoJulgadaEstados([], refEx, () => false)).toBeNull();
    expect(precisaoJulgadaEstados(passos(["3/5"]), { caminho: [] }, () => false)).toBeNull();
  });
});
