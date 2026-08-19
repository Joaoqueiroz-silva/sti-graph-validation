import { describe, it, expect } from "vitest";
import { embaralharDeterminista, consolidarDicas, planejarDicas, MARGEM_ESTRANGEIRO } from "../analysis/bancada-v2/juiz-dicas.mjs";

describe("embaralharDeterminista", () => {
  it("escada de 0 ou 1 nível não tem ordem para embaralhar", () => {
    expect(embaralharDeterminista([])).toBeNull();
    expect(embaralharDeterminista(["só uma"])).toBeNull();
  });
  it("nunca devolve a ordem original", () => {
    for (let s = 0; s < 30; s++) {
      for (const n of [2, 3, 4, 5]) {
        const orig = Array.from({ length: n }, (_, i) => `d${i}`);
        const emb = embaralharDeterminista(orig, s);
        expect(emb).not.toEqual(orig);
        expect([...emb].sort()).toEqual([...orig].sort()); // é permutação
      }
    }
  });
  it("é determinístico para a mesma semente", () => {
    expect(embaralharDeterminista(["a", "b", "c", "d"], 3)).toEqual(embaralharDeterminista(["a", "b", "c", "d"], 3));
  });
});

const julg = (origem, n, esp, esc) =>
  Array.from({ length: n }, () => ({ origem, especificidade: esp, escalonamento: esc, acionabilidade: 2, correcao: true, entregaResposta: false }));

describe("consolidarDicas — gate pré-declarado", () => {
  it("APROVA quando o estrangeiro cai em especificidade e o embaralhado cai em escalonamento", () => {
    const R = consolidarDicas([
      ...julg("especialista", 10, 3, 3),
      ...julg("agente-custo-beneficio", 10, 3, 3),
      ...julg("controle-estrangeiro", 5, 1, 3),
      ...julg("controle-embaralhado", 5, 3, 1),
    ]);
    expect(R.gate.passaEstrangeiro).toBe(true);
    expect(R.gate.passaEmbaralhado).toBe(true);
    expect(R.gate.calibrado).toBe(true);
  });
  it("REPROVA o juiz que dá nota alta à escada de outro problema", () => {
    const R = consolidarDicas([
      ...julg("especialista", 10, 3, 3),
      ...julg("agente-custo-beneficio", 10, 3, 3),
      ...julg("controle-estrangeiro", 5, 3, 3), // não distinguiu
      ...julg("controle-embaralhado", 5, 3, 1),
    ]);
    expect(R.gate.passaEstrangeiro).toBe(false);
    expect(R.gate.calibrado).toBe(false);
  });
  it("REPROVA o juiz que não percebe a escada fora de ordem", () => {
    const R = consolidarDicas([
      ...julg("especialista", 10, 3, 3),
      ...julg("controle-estrangeiro", 5, 1, 3),
      ...julg("controle-embaralhado", 5, 3, 3), // igual ao ordenado
    ]);
    expect(R.gate.passaEmbaralhado).toBe(false);
    expect(R.gate.calibrado).toBe(false);
  });
  it("a margem do estrangeiro é exatamente a pré-declarada (limite inclusivo)", () => {
    const R = consolidarDicas([
      ...julg("especialista", 10, 3, 3),
      ...julg("controle-estrangeiro", 5, 3 - MARGEM_ESTRANGEIRO, 3),
      ...julg("controle-embaralhado", 5, 3, 1),
    ]);
    expect(R.gate.passaEstrangeiro).toBe(true);
    const R2 = consolidarDicas([
      ...julg("especialista", 10, 3, 3),
      ...julg("controle-estrangeiro", 5, 3 - MARGEM_ESTRANGEIRO + 0.01, 3),
      ...julg("controle-embaralhado", 5, 3, 1),
    ]);
    expect(R2.gate.passaEstrangeiro).toBe(false);
  });
  it("reporta entregaResposta por origem sem pontuá-la", () => {
    const R = consolidarDicas([
      { origem: "especialista", especificidade: 3, escalonamento: 3, acionabilidade: 3, correcao: true, entregaResposta: true },
      { origem: "agente-x", especificidade: 3, escalonamento: 3, acionabilidade: 3, correcao: true, entregaResposta: false },
    ]);
    expect(R.porOrigem.especialista.taxaEntregaResposta).toBe(1);
    expect(R.porOrigem["agente-x"].taxaEntregaResposta).toBe(0);
  });
});

describe("planejarDicas — amostragem declarada", () => {
  const lote = planejarDicas({ filtroCorpus: "6.17", limitEx: 4 });
  it("a escada do especialista entra UMA vez por (corpus, exercício, estado)", () => {
    const chaves = lote.filter((i) => i.origem === "especialista").map((i) => `${i.corpus}|${i.ex}|${i.ordemRef}`);
    expect(new Set(chaves).size).toBe(chaves.length);
  });
  it("inclui os dois braços e os dois controles", () => {
    const origens = new Set(lote.map((i) => i.origem));
    expect(origens.has("agente-custo-beneficio")).toBe(true);
    expect(origens.has("agente-estudantes-qwen")).toBe(true);
    expect(origens.has("controle-estrangeiro")).toBe(true);
    expect(origens.has("controle-embaralhado")).toBe(true);
  });
  it("o controle estrangeiro traz escada de OUTRO exercício", () => {
    for (const it of lote.filter((i) => i.origem === "controle-estrangeiro")) {
      expect(it.escadaDe).toBeDefined();
      expect(it.escadaDe).not.toBe(it.ex);
    }
  });
  it("nenhuma escada vazia é enviada ao juiz", () => {
    expect(lote.every((i) => i.escada.length > 0)).toBe(true);
  });
});
