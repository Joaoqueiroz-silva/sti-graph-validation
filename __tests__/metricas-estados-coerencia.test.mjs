import { describe, expect, it } from "vitest";
import { pontuarComBase, precisaoEstados } from "../analysis/bancada-v2/linha-de-base.mjs";
import { grafoSimetrico } from "../analysis/bancada-v2/regua-simetrica.mjs";

const refEx = (valores) => ({
  caminho: valores.map((valor, i) => ({
    ordem: i + 1,
    valor,
    bruto: valor,
    sistema: false,
    mecanico: false,
    dicas: 0,
  })),
  items: [],
});

const envB = (valores) => ({
  steps: valores.map((answer, i) => ({ key: answer, answer, order: i + 1 })),
  hintsPerCorrectStep: valores.map(() => []),
});

const run = (valores) => ({
  exercicio: "x",
  replica: 1,
  grafo: {
    passos: valores.map((valor, i) => ({ indice: i + 1, acao: "", kc: "k", valor })),
    erros: [],
    dicas: [],
  },
});

describe("precisão/F1 de estados — coerência algébrica e multiplicidade", () => {
  it("usa a mesma LCS como TP no recall e na precisão", () => {
    const referencia = ["a", "b", "a"];
    const r = run(["a", "a", "b", "x"]); // LCS=2; 4 estados comparáveis
    const p = pontuarComBase(r, { problem: "", correctAnswer: "" }, envB(referencia), refEx(referencia));
    expect(p.nEstadosCasados).toBe(2);
    expect(p.coberturaEstados).toBeCloseTo(2 / 3);
    expect(p.precisaoEstados).toBeCloseTo(2 / 4);
    expect(p.f1Estados).toBeCloseTo((2 * (2 / 3) * (2 / 4)) / ((2 / 3) + (2 / 4)));
  });

  it("repetir um valor correto não cria verdadeiros positivos ilimitados", () => {
    const referencia = ["5"];
    const passos = run(["5", "5", "5", "5"]).grafo.passos;
    expect(precisaoEstados(passos, refEx(referencia))).toBeCloseTo(1 / 4);
  });

  it("a régua simétrica exclui conclusão neutralizada do denominador comparável", () => {
    const referencia = ["5", "1"];
    const original = run(["5", "done", "1"]);
    const simetrico = {
      ...original,
      grafo: grafoSimetrico(original.grafo).grafo,
    };
    const p = pontuarComBase(simetrico, { problem: "5 1", correctAnswer: "1" }, envB(referencia), refEx(referencia));
    expect(p.nEstadosAgente).toBe(3); // ancoragem de passo preservada
    expect(p.nEstadosComparaveisAgente).toBe(2);
    expect(p.nEstadosCasados).toBe(2);
    expect(p.precisaoEstados).toBe(1);
    expect(p.coberturaEstados).toBe(1);
    expect(p.f1Estados).toBe(1);
  });

  it("passo fora de ordem reduz TP dos dois lados, em vez de só o recall", () => {
    const referencia = ["1", "2"];
    const r = run(["2", "1"]);
    const p = pontuarComBase(r, { problem: "1 2", correctAnswer: "2" }, envB(referencia), refEx(referencia));
    expect(p.nEstadosCasados).toBe(1);
    expect(p.coberturaEstados).toBe(0.5);
    expect(p.precisaoEstados).toBe(0.5);
    expect(p.f1Estados).toBe(0.5);
  });

  it("F1 de precisão=recall=0 é zero e permanece no pool", () => {
    const referencia = ["1"];
    const p = pontuarComBase(run(["9"]), { problem: "9", correctAnswer: "9" }, envB(referencia), refEx(referencia));
    expect(p.coberturaEstados).toBe(0);
    expect(p.precisaoEstados).toBe(0);
    expect(p.f1Estados).toBe(0);
  });

  it("falha total sem passo comparável recebe precisão e F1 zero", () => {
    const referencia = ["1"];
    const p = pontuarComBase(run([""]), { problem: "1", correctAnswer: "1" }, envB(referencia), refEx(referencia));
    expect(p.nEstadosComparaveisAgente).toBe(0);
    expect(p.coberturaEstados).toBe(0);
    expect(p.precisaoEstados).toBe(0);
    expect(p.f1Estados).toBe(0);
    expect(p.baseCobertura).toBe(0); // controle de capacidade também é vazio
  });

  it("dimensiona o papagaio por ocorrências comparáveis, não por passos brutos", () => {
    const referencia = ["5", "1", "9"];
    const original = run(["5", "done", "1"]);
    const simetrico = { ...original, grafo: grafoSimetrico(original.grafo).grafo };
    const p = pontuarComBase(
      simetrico,
      { problem: "5 1 9", correctAnswer: "9" },
      envB(referencia),
      refEx(referencia),
    );
    expect(p.nEstadosAgente).toBe(3);
    expect(p.nEstadosComparaveisAgente).toBe(2);
    // Com k=2, o papagaio emite 5,1; usar os 3 passos brutos emitiria também
    // 9 e inflaria artificialmente a cobertura de controle para 1.
    expect(p.baseCobertura).toBeCloseTo(2 / 3);
  });
});
