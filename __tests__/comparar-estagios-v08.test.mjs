import { describe, expect, it } from "vitest";
import { compararPar, resumirPares } from "../analysis/orientador-v08/comparar-estagios.mjs";

const referencia = {
  caminho: [
    { ordem: 1, valor: "1", bruto: "1", mecanico: false, sistema: false, dicas: 0 },
    { ordem: 2, valor: "2", bruto: "2", mecanico: false, sistema: false, dicas: 0 },
  ],
  items: [],
};
const envelopeA = { problem: "Use 1 e 2.", correctAnswer: "2" };
const envelopeB = {};

describe("contraste pareado bruto versus materializado v0.8", () => {
  it("usa exatamente o mesmo registro e calcula final menos bruto", () => {
    const run = {
      id: "p1",
      exercicio: "p1",
      replica: 1,
      grafo: { passos: [{ valor: "1" }, { valor: "3" }, { valor: "done" }], erros: [], dicas: [] },
      materializado: {
        grafo: { passos: [{ valor: "1" }, { valor: "2" }, { valor: "done" }], erros: [], dicas: [] },
      },
    };
    const par = compararPar({ run, envelopeA, envelopeB, referencia, corpus: "x", braco: "y" });
    expect(par.bruto.coberturaEstados).toBe(0.5);
    expect(par.final.coberturaEstados).toBe(1);
    expect(par.delta.coberturaEstados).toBe(0.5);
    expect(par.bruto.nEstadosComparaveisAgente).toBe(2);
    expect(par.final.nEstadosComparaveisAgente).toBe(2);
    expect(par.delta.precisaoEstados).toBe(0.5);
  });

  it("preserva N/A em diferenças de métricas não avaliáveis", () => {
    const run = {
      id: "p1",
      exercicio: "p1",
      replica: 1,
      grafo: { passos: [{ valor: "1" }], erros: [], dicas: [] },
      materializado: { grafo: { passos: [{ valor: "1" }], erros: [], dicas: [] } },
    };
    const par = compararPar({ run, envelopeA, envelopeB, referencia });
    expect(par.bruto.errosNoEstadoCerto).toBeNull();
    expect(par.delta.errosNoEstadoCerto).toBeNull();
  });

  it("resume pares sem tratar estágios como observações independentes", () => {
    const pares = [1, 2, 3].map((replica) => ({
      corpus: "x",
      ex: "p1",
      replica,
      bruto: { coberturaEstados: 0.5, coberturaSemOrdem: 0.5, caminhoIntegro: 0, errosNoEstadoCerto: null, dicasNoEstadoCerto: 0, precisaoEstados: 0.5, f1Estados: 0.5, nEstadosAgente: 2, nEstadosComparaveisAgente: 2, extras: { caminhosBifurcacoes: 0 } },
      final: { coberturaEstados: 1, coberturaSemOrdem: 1, caminhoIntegro: 1, errosNoEstadoCerto: null, dicasNoEstadoCerto: 0, precisaoEstados: 1, f1Estados: 1, nEstadosAgente: 2, nEstadosComparaveisAgente: 2, extras: { caminhosBifurcacoes: 0 } },
      delta: { coberturaEstados: 0.5, coberturaSemOrdem: 0.5, caminhoIntegro: 1, errosNoEstadoCerto: null, dicasNoEstadoCerto: 0, precisaoEstados: 0.5, f1Estados: 0.5, nEstadosAgente: 0, nEstadosComparaveisAgente: 0 },
    }));
    for (const par of pares) {
      Object.assign(par.bruto, { nErrosAgente: 0, nDicasAgente: 0 });
      Object.assign(par.final, { nErrosAgente: 1, nDicasAgente: 2 });
      Object.assign(par.delta, { nErrosAgente: 1, nDicasAgente: 2 });
    }
    const resumo = resumirPares(pares);
    expect(resumo.nPares).toBe(3);
    expect(resumo.nExercicios).toBe(1);
    expect(resumo.porMetrica.f1Estados.deltaFinalMenosBruto.estimativa).toBe(0.5);
    expect(resumo.mudancas.errosMudaram).toBe(3);
    expect(resumo.mudancas.dicasMudaram).toBe(3);
  });
});
