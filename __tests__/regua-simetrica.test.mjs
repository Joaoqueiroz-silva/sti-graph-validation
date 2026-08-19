import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { carregarReferencia } from "../analysis/validacao-v2/lib.mjs";
import { pontuarCaminho } from "../analysis/bancada-v2/comparar-caminho.mjs";
import { pontuarComBase } from "../analysis/bancada-v2/linha-de-base.mjs";
import {
  ehTokenDeConclusao, ehProsa, grafoSimetrico, verificarSimetria, verificarSimetriaErros, TOKENS_CONCLUSAO,
} from "../analysis/bancada-v2/regua-simetrica.mjs";

const CORPORA = [
  ["6.17", "frac-numberline-6.17", "resultados/rodada4-interface-fixa-2026-08-15"],
  ["6.19", "frac-estimates-6.19", "resultados/bloco1-mathtutor-2026-08-16/6.19"],
  ["6.18", "equiv-fractions-6.18", "resultados/bloco1-mathtutor-2026-08-16/6.18"],
  ["6.20", "fraction-ordering-6.20", "resultados/bloco1-mathtutor-2026-08-16/6.20"],
  ["8.12", "factors-scaling-8.12", "resultados/bloco1-mathtutor-2026-08-16/8.12"],
];

describe("reconhecedores", () => {
  it("token de conclusão ignora acento, caixa e underscore", () => {
    for (const t of ["ok", "OK", " Done ", "concluído", "CONCLUIDO", "converted"]) expect(ehTokenDeConclusao(t)).toBe(true);
    for (const v of ["3/4", "0", "-1", "1.25", "152%", "5"]) expect(ehTokenDeConclusao(v)).toBe(false);
  });
  it("prosa é o que não é número nem fração", () => {
    for (const p of ["undefined", "não concluído", "done_sem_revisao", "aproximadamente_0_8", "intervalo [0,5/8]"]) expect(ehProsa(p)).toBe(true);
    for (const v of ["3/4", "-2", "1.25", "0,5", "152%"]) expect(ehProsa(v)).toBe(false);
    expect(ehProsa("")).toBe(false); // vazio já é mecânico, não é prosa
  });
  it("a lista de tokens é congelada e publicável", () => {
    expect(Object.isFrozen(TOKENS_CONCLUSAO)).toBe(true);
    expect(TOKENS_CONCLUSAO).toContain("done");
  });
});

describe("grafoSimetrico NEUTRALIZA, não remove — a numeração de passo é sagrada", () => {
  const grafo = {
    passos: [{ valor: "3/4" }, { valor: "ok" }, { valor: "2" }],
    erros: [{ valor: "4/3", passo: 3 }, { valor: "undefined", passo: 2 }],
    dicas: [{ passo: 3, nivel: 1, texto: "x" }],
  };
  const { grafo: g, reparos } = grafoSimetrico(grafo);
  it("preserva o número de passos (índices intactos)", () => {
    expect(g.passos.length).toBe(3);
    expect(g.passos[2].valor).toBe("2"); // o passo 3 continua sendo o passo 3
  });
  it("zera o valor do token de conclusão em vez de apagar o passo", () => {
    expect(g.passos[1].valor).toBe("");
    expect(g.passos[1].neutralizado).toBe("token-de-conclusao");
    expect(reparos.passosNeutralizados).toBe(1);
  });
  it("não toca nos erros — o reparo de prosa foi rejeitado", () => {
    expect(g.erros.map((e) => e.valor)).toEqual(["4/3", "undefined"]);
  });
  it("o reparo pode ser desligado", () => {
    expect(grafoSimetrico(grafo, { tokenDeConclusao: false }).grafo.passos[1].valor).toBe("ok");
  });
});

describe("SIMETRIA — a barreira que faltava (roda a regra do agente contra o gabarito humano)", () => {
  for (const [rotulo, ds] of CORPORA.map(([r, d]) => [r, d])) {
    it(`${rotulo}: a regra de token de conclusão não atinge NENHUM estado de valor do especialista`, () => {
      process.env.STI_DATASET = ds;
      const s = verificarSimetria(carregarReferencia("."), ehTokenDeConclusao);
      expect(s.total).toBeGreaterThan(0);
      expect(s.exemplos).toEqual([]);
      expect(s.simetrica).toBe(true);
    });

  }
});

describe("a regra de PROSA foi REJEITADA — este teste impede que ela volte", () => {
  it("no 8.12 ela atingiria erros do PRÓPRIO especialista (\"*\" é entrada legítima do combo)", () => {
    process.env.STI_DATASET = "factors-scaling-8.12";
    const s = verificarSimetriaErros(carregarReferencia("."), ehProsa);
    expect(s.simetrica).toBe(false);
    expect(s.atingidos).toBeGreaterThan(100);
  });
  it("grafoSimetrico NÃO mexe nos erros", () => {
    const g = { passos: [{ valor: "ok" }], erros: [{ valor: "undefined", passo: 1 }, { valor: "*", passo: 1 }] };
    expect(grafoSimetrico(g).grafo.erros).toEqual(g.erros);
  });
});

describe("INVARIANTE — o reparo só pode mover a família da precisão", () => {
  // amostra determinística: 3 primeiros registros de cada corpus × braço
  const casos = [];
  for (const [rotulo, ds, pasta] of CORPORA) {
    process.env.STI_DATASET = ds;
    const REF = carregarReferencia(".");
    const probs = path.join("datasets", ds, "problems");
    for (const b of ["custo-beneficio", "estudantes-qwen"]) {
      const d = path.join(pasta, `materializado-v3-fixa-${b}`, "runs");
      if (!fs.existsSync(d)) continue;
      for (const f of fs.readdirSync(d).filter((x) => x.endsWith(".json")).sort().slice(0, 3)) {
        const r = JSON.parse(fs.readFileSync(path.join(d, f), "utf8"));
        const ex = r.exercicio ?? r.id;
        if (!REF[ex] || !r.materializado?.grafo) continue;
        casos.push({
          rotulo, ex, r, ref: REF[ex],
          envA: JSON.parse(fs.readFileSync(path.join(probs, ex, "envelope-a.json"), "utf8")),
          envB: JSON.parse(fs.readFileSync(path.join(probs, ex, "envelope-b.json"), "utf8")),
        });
      }
    }
  }
  it("a amostra não está vazia", () => expect(casos.length).toBeGreaterThan(20));

  for (const m of ["coberturaEstados", "coberturaSemOrdem", "caminhoIntegro", "errosNoEstadoCerto", "dicasNoEstadoCerto"]) {
    it(`${m} sai IDÊNTICO antes e depois do reparo`, () => {
      for (const c of casos) {
        const antes = pontuarCaminho({ ...c.r, grafo: c.r.materializado.grafo }, c.envB, c.ref);
        const depois = pontuarCaminho({ ...c.r, grafo: grafoSimetrico(c.r.materializado.grafo).grafo }, c.envB, c.ref);
        expect(depois[m], `${c.rotulo}/${c.ex}`).toEqual(antes[m]);
      }
    });
  }

  it("precisaoEstados NÃO piora em nenhum registro (o reparo só remove falso positivo)", () => {
    for (const c of casos) {
      const antes = pontuarComBase(c.r, c.envA, c.envB, c.ref).precisaoEstados;
      const rep = { ...c.r, materializado: { ...c.r.materializado, grafo: grafoSimetrico(c.r.materializado.grafo).grafo } };
      const depois = pontuarComBase(rep, c.envA, c.envB, c.ref).precisaoEstados;
      if (antes === null || depois === null) continue;
      expect(depois, `${c.rotulo}/${c.ex}`).toBeGreaterThanOrEqual(antes - 1e-12);
    }
  });
});
