import { describe, expect, it } from "vitest";
import {
  NIVEIS,
  pontuarSobFiltro,
  resumirContrafactual,
} from "../analysis/bancada-v2/contrafactual-regua.mjs";

const refEx = {
  caminho: [
    { ordem: 1, valor: "5", mecanico: false, sistema: false, variante: false },
    { ordem: 2, valor: "-1", mecanico: true, sistema: false, variante: false },
    { ordem: 3, valor: "7", mecanico: false, sistema: true, variante: false },
    { ordem: 4, valor: "8", mecanico: false, sistema: true, variante: true },
  ],
};

const grafo = (valores) => ({
  passos: valores.map((valor, i) => ({ indice: i + 1, valor })),
});

describe("contrafactual R0–R3", () => {
  it("aplica exclusões encaixadas e reduz nRef monotonicamente", () => {
    const resultados = NIVEIS.map((nivel) => pontuarSobFiltro(
      grafo(["5", "-1", "7", "8"]),
      refEx,
      nivel.filtro,
    ));
    expect(resultados.map((r) => r.nRef)).toEqual([4, 3, 2, 1]);
    expect(resultados.map((r) => r.cobertura)).toEqual([1, 1, 1, 1]);
    expect(resultados.map((r) => r.integro)).toEqual([1, 1, 1, 1]);
  });

  it("distingue recall de contenção integral em cada nível", () => {
    const resultados = NIVEIS.map((nivel) => pontuarSobFiltro(grafo(["5"]), refEx, nivel.filtro));
    expect(resultados.map((r) => r.cobertura)).toEqual([1 / 4, 1 / 3, 1 / 2, 1]);
    expect(resultados.map((r) => r.integro)).toEqual([0, 0, 0, 1]);
  });

  it("materializa nRef, recall e contenção no agregado auditável", () => {
    const linhas = [1, 2].map((replica) => {
      const linha = { ex: "x", replica };
      for (const nivel of NIVEIS) {
        const p = pontuarSobFiltro(grafo(replica === 1 ? ["5"] : ["5", "-1", "7", "8"]), refEx, nivel.filtro);
        linha[`cob_${nivel.id}`] = p.cobertura;
        linha[`int_${nivel.id}`] = p.integro;
        linha[`nref_${nivel.id}`] = p.nRef;
      }
      return linha;
    });
    const agregado = resumirContrafactual(linhas);
    expect(agregado.R0.nRef).toEqual({ media: 4, minimo: 4, maximo: 4 });
    expect(agregado.R0.recall.estimativa).toBeCloseTo(0.625);
    expect(agregado.R0.contencao.estimativa).toBeCloseTo(0.5);
    expect(agregado.R3.recall.estimativa).toBe(1);
    expect(agregado.R3.contencao.estimativa).toBe(1);
  });
});
