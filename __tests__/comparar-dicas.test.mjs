import { describe, it, expect } from "vitest";
import { contemValor, medirEscada, escadaDoAgente, pontuarDicas } from "../analysis/bancada-v2/comparar-dicas.mjs";

describe("contemValor — casamento por token, não por substring", () => {
  it("não casa dígito solto dentro de outro número ou fração", () => {
    expect(contemValor("a fração 1/5 aparece", "5")).toBe(false);
    expect(contemValor("o total é 15", "5")).toBe(false);
    expect(contemValor("o valor 0.5", "5")).toBe(false);
    expect(contemValor("digite 5 na caixa", "5")).toBe(true);
  });
  it("casa o bottom-out do CTAT com o valor entre aspas", () => {
    expect(contemValor("Please enter '5000' in the highlighted field.", "5000")).toBe(true);
    expect(contemValor("Please enter '5000' in the highlighted field.", "500")).toBe(false);
  });
  it("aceita a forma canônica além da bruta", () => {
    // canonAnswer normaliza espaços/formatos; as duas formas valem
    expect(contemValor("escreva 3/4", " 3/4 ")).toBe(true);
  });
  it("valor vazio nunca casa", () => {
    expect(contemValor("qualquer texto", "")).toBe(false);
    expect(contemValor("qualquer texto", null)).toBe(false);
  });
});

describe("medirEscada", () => {
  it("escada vazia: temDica 0 e métricas de valor N/A (não zero)", () => {
    const m = medirEscada([], "3/4");
    expect(m.temDica).toBe(0);
    expect(m.niveis).toBe(0);
    expect(m.bottomOutValor).toBeNull();
    expect(m.algumNivelValor).toBeNull();
    expect(m.escadaCompleta).toBeNull();
  });
  it("escada completa = >=2 níveis, última entrega o valor, primeira não", () => {
    expect(medirEscada(["Pense na parte e no todo", "Digite 3/4"], "3/4").escadaCompleta).toBe(1);
    // primeira já entrega → não é escada, é resposta antecipada
    expect(medirEscada(["Digite 3/4", "Digite 3/4 agora"], "3/4").escadaCompleta).toBe(0);
    // um nível só não é escada
    expect(medirEscada(["Digite 3/4"], "3/4").escadaCompleta).toBeNull();
  });
  it("bottom-out olha a ÚLTIMA dica, algumNivel olha qualquer uma", () => {
    const m = medirEscada(["O valor é 3/4", "Confira o denominador"], "3/4");
    expect(m.bottomOutValor).toBe(0);
    expect(m.algumNivelValor).toBe(1);
  });
});

describe("escadaDoAgente", () => {
  it("filtra pelo passo e ordena por nível", () => {
    const g = { dicas: [
      { passo: 2, nivel: 2, texto: "b" },
      { passo: 1, nivel: 1, texto: "x" },
      { passo: 2, nivel: 1, texto: "a" },
    ] };
    expect(escadaDoAgente(g, 2)).toEqual(["a", "b"]);
    expect(escadaDoAgente(g, 3)).toEqual([]);
  });
});

describe("pontuarDicas — só estados casados entram", () => {
  const envB = {
    steps: [{ key: "3/4", answer: "3/4", order: 1 }, { key: "2", answer: "2", order: 2 }],
    hintsPerCorrectStep: [["Pense", "Digite 3/4"], ["Pense de novo", "Digite 2"]],
  };
  it("casa por valor e mede os dois lados no mesmo par", () => {
    const run = {
      exercicio: "ex1",
      grafo: {
        passos: [{ valor: "3/4" }, { valor: "99" }, { valor: "2" }],
        dicas: [
          { passo: 1, nivel: 1, texto: "Comece pela parte" },
          { passo: 1, nivel: 2, texto: "Escreva a fração 3/4" },
          { passo: 3, nivel: 1, texto: "Agora o inteiro" },
        ],
      },
    };
    const { linha, pares } = pontuarDicas(run, envB, null);
    expect(pares.length).toBe(2); // 3/4 e 2; o "99" do agente não é estado da referência
    expect(linha.paresForaDaReferencia).toBe(1);
    expect(linha.temDica_ref).toBe(1);
    expect(linha.temDica_agente).toBe(1);
    // especialista entrega o valor nos dois bottom-outs; o agente só no primeiro
    expect(linha.bottomOutValor_ref).toBe(1);
    expect(linha.bottomOutValor_agente).toBe(0.5);
    expect(linha.niveis_ref).toBe(2);
    expect(linha.niveis_agente).toBe(1.5);
  });
  it("estado da referência que o agente não criou fica fora do par", () => {
    const run = { exercicio: "ex1", grafo: { passos: [{ valor: "3/4" }], dicas: [] } };
    const { pares } = pontuarDicas(run, envB, null);
    expect(pares.length).toBe(1);
    expect(pares[0].valor).toBe("3/4");
  });
});
