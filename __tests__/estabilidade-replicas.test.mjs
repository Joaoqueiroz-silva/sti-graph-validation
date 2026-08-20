import { describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  analisarEstabilidade,
  carregarObservacoes630,
  decomporVarianciaICC,
  dpAmostral,
  dpIntraproblema,
  estabilidadePorK,
  leaveOneReplicaOut,
  projetarReplicas,
} from "../analysis/orientador-v08/estabilidade-replicas.mjs";

const obs = ({ bracos = ["a", "b"], exercicios = ["p1", "p2", "p3"], valores } = {}) => {
  const out = [];
  for (const braco of bracos) for (const exercicio of exercicios) for (const replica of [1, 2, 3]) {
    out.push({
      corpus: "c",
      braco,
      exercicio,
      replica,
      valor: valores ? valores({ braco, exercicio, replica }) : (braco === "a" ? 1 : 0) + replica / 100,
    });
  }
  return out;
};

describe("estatisticas puras de replicas", () => {
  it("calcula DP amostral intraproblema, sem tratar replicas como exercicios", () => {
    expect(dpAmostral([1, 2, 3])).toBeCloseTo(1);
    const linhas = obs({
      bracos: ["a"],
      exercicios: ["p"],
      valores: ({ replica }) => replica,
    });
    const d = dpIntraproblema(linhas);
    expect(d.porProblema).toHaveLength(1);
    expect(d.porProblema[0]).toMatchObject({ nReplicas: 3, media: 2 });
    expect(d.porProblema[0].dp).toBeCloseTo(1);
  });

  it("decompoe variancia por ANOVA de uma via e calcula ICC", () => {
    const linhas = [
      { corpus: "c", braco: "a", exercicio: "p1", replica: 1, valor: 0 },
      { corpus: "c", braco: "a", exercicio: "p1", replica: 2, valor: 2 },
      { corpus: "c", braco: "a", exercicio: "p2", replica: 1, valor: 2 },
      { corpus: "c", braco: "a", exercicio: "p2", replica: 2, valor: 4 },
    ];
    const c = decomporVarianciaICC(linhas).a;
    expect(c.estimavel).toBe(true);
    expect(c.varianciaDentro).toBeCloseTo(2);
    expect(c.varianciaEntre).toBeCloseTo(1);
    expect(c.icc1).toBeCloseTo(1 / 3);
    expect(c.exercicios).toBe(2);
  });

  it("preserva a estimativa bruta negativa e restringe o componente interpretavel a zero", () => {
    const linhas = [
      { corpus: "c", braco: "a", exercicio: "p1", replica: 1, valor: 0 },
      { corpus: "c", braco: "a", exercicio: "p1", replica: 2, valor: 2 },
      { corpus: "c", braco: "a", exercicio: "p2", replica: 1, valor: 0 },
      { corpus: "c", braco: "a", exercicio: "p2", replica: 2, valor: 2 },
    ];
    const c = decomporVarianciaICC(linhas).a;
    expect(c.varianciaEntreBruta).toBeLessThan(0);
    expect(c.varianciaEntre).toBe(0);
    expect(c.icc1).toBe(0);
  });
});

describe("estabilidade k e ordem dos bracos", () => {
  it("enumera 3 subconjuntos para k=1, 3 para k=2 e 1 para k=3", () => {
    const e = estabilidadePorK(obs());
    expect(e.configuracoes.filter((x) => x.k === 1)).toHaveLength(3);
    expect(e.configuracoes.filter((x) => x.k === 2)).toHaveLength(3);
    expect(e.configuracoes.filter((x) => x.k === 3)).toHaveLength(1);
    expect(e.referenciaFull.nExerciciosPareados).toBe(3);
    expect(e.referenciaFull.ordem).toEqual(["a", "b"]);
    expect(e.resumoPorK[1].taxaMesmaOrdem).toBe(1);
  });

  it("detecta inversao da ordem em uma replica instavel", () => {
    const linhas = obs({
      exercicios: ["p1", "p2"],
      valores: ({ braco, replica }) => {
        if (replica === 1) return braco === "a" ? 0 : 1;
        return braco === "a" ? 1 : 0;
      },
    });
    const e = estabilidadePorK(linhas);
    const r1 = e.configuracoes.find((x) => x.k === 1 && x.replicas[0] === 1);
    expect(e.referenciaFull.ordem).toEqual(["a", "b"]);
    expect(r1.ordem).toEqual(["b", "a"]);
    expect(r1.mesmaOrdemDoFull).toBe(false);
    expect(r1.acordoOrdem.inversoes).toBe(1);
  });

  it("leave-one-replica-out produz uma exclusao por replica", () => {
    const loo = leaveOneReplicaOut(obs());
    expect(loo.exclusoes).toHaveLength(3);
    expect(loo.exclusoes.map((x) => x.replicaExcluida).sort()).toEqual([1, 2, 3]);
    expect(loo.exclusoes.every((x) => x.replicasMantidas.length === 2)).toBe(true);
  });
});

describe("projecao e integracao com os 630 registros", () => {
  it("projeta menor ruido e menor meia-largura para r=5 e r=10", () => {
    const c = decomporVarianciaICC(obs({ bracos: ["a"] }));
    const p = projetarReplicas(c, { rs: [3, 5, 10] }).a.cenarios;
    expect(p[1].dpRuidoNaMediaDoProblema).toBeLessThan(p[0].dpRuidoNaMediaDoProblema);
    expect(p[2].meiaLarguraIC95Normal).toBeLessThan(p[1].meiaLarguraIC95Normal);
    expect(p[2].confiabilidadeMediaReplicas).toBeGreaterThanOrEqual(p[1].confiabilidadeMediaReplicas);
  });

  it("carrega exatamente 630 registros v3 e mantem exercicio como unidade", () => {
    const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const carga = carregarObservacoes630(raiz, "coberturaEstados");
    expect(carga.totalRegistros).toBe(630);
    expect(carga.avaliaveis).toBe(630);
    expect(carga.naoAvaliaveis).toBe(0);
    const a = analisarEstabilidade(carga.observacoes);
    expect(a.nObservacoes).toBe(630);
    expect(a.nExercicios).toBe(105);
    expect(a.bracos).toEqual(["flash-lite", "qwen"]);
    expect(a.estabilidadeK.referenciaFull.nExerciciosPareados).toBe(105);
  });

  it("nao converte erros N/A em zero", () => {
    const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const carga = carregarObservacoes630(raiz, "errosNoEstadoCerto");
    expect(carga.totalRegistros).toBe(630);
    expect(carga.naoAvaliaveis).toBeGreaterThan(0);
    expect(carga.avaliaveis + carga.naoAvaliaveis).toBe(630);
    expect(carga.observacoes.every((x) => Number.isFinite(x.valor))).toBe(true);
  });

  it("deriva precisao, F1 e igualdade estrita sem excluir falhas vazias", () => {
    const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    for (const metrica of ["precisaoEstados", "f1Estados", "igualdadeEstrita"]) {
      const carga = carregarObservacoes630(raiz, metrica);
      expect(carga.totalRegistros).toBe(630);
      expect(carga.avaliaveis).toBe(630);
      expect(carga.naoAvaliaveis).toBe(0);
      expect(carga.observacoes.every((x) => x.valor >= 0 && x.valor <= 1)).toBe(true);
    }
  });
});
