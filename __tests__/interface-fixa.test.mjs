/**
 * interface-fixa.test.mjs — braço "interface fixa" (rodada 4, 2026-08-15):
 * a interface do CTAT entra no envelope A dos agentes por canais que o código
 * de produção já lê (seedProblems → agents 3; description → agent 6), sem
 * editar agente e SEM vazar nada do grafo do especialista.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import {
  CAMPOS_PERMITIDOS,
  CAMPOS_PROIBIDOS,
  lerParametrosInterface,
  descreverInterface,
  textoRequisitoInterface,
} from "../interface-ctat.js";
import { buildStateFromEnvelopeA } from "../simulate-fluxo-plataforma.js";

const DS = "datasets/frac-numberline-6.17";
const ids = fs.readdirSync(`${DS}/problems`).filter((d) => fs.existsSync(`${DS}/problems/${d}/envelope-a.json`));
const linhasMP = fs.readFileSync(`${DS}/_interface/massproduction.txt`, "utf8").split("\n").map((l) => l.split("\t"));
const cab = linhasMP[0];
const porCampo = Object.fromEntries(linhasMP.slice(1).filter((l) => l[0]).map((l) => [l[0], l]));

describe("interface-ctat — lista branca e ausência de vazamento", () => {
  it("lista branca e proibida são disjuntas e cobrem os campos sensíveis", () => {
    for (const c of CAMPOS_PERMITIDOS) expect(CAMPOS_PROIBIDOS).not.toContain(c);
    for (const c of ["%(div-h1)%", "%(goodjob)%", "%(badCount)%", "%(mfNum)%", "%(frac)%"]) expect(CAMPOS_PROIBIDOS).toContain(c);
  });
  it("para os 24 problemas: a descrição não contém nenhum texto de dica/feedback do massproduction", () => {
    for (const id of ids) {
      const A = JSON.parse(fs.readFileSync(`${DS}/problems/${id}/envelope-a.json`, "utf8"));
      const d = descreverInterface(A);
      const texto = JSON.stringify(d) + textoRequisitoInterface(d);
      const col = cab.indexOf(id);
      for (const campo of ["%(div-h1)%", "%(div-h2)%", "%(line-h)%", "%(num-h)%", "%(goodjob)%"]) {
        const v = (porCampo[campo]?.[col] || "").trim().replace(/^"|"$/g, "");
        if (v && v !== "-" && v.length > 12) expect(texto.includes(v)).toBe(false);
      }
      // nem contagens de erro (badCount) nem doubleDiv como número solto? (só checamos que não são citados literalmente com rótulo)
      expect(texto).not.toMatch(/badCount|doubleDiv|goodjob/);
    }
  });
  it("parâmetros por problema vêm da interface (reta 0–1 ou 0–2; caixa da fração conforme fracBox)", () => {
    expect(lerParametrosInterface("00bubble")).toMatchObject({ retaAte: 1, caixaFracaoExibida: true });
    expect(lerParametrosInterface("03summerBooks")).toMatchObject({ retaAte: 1, caixaFracaoExibida: false });
    expect(lerParametrosInterface("12apples")).toMatchObject({ retaAte: 2, caixaFracaoExibida: false });
    expect(lerParametrosInterface("15fishStick")).toMatchObject({ retaAte: 2, caixaNumeroMisto: true });
  });
  it("componentes vêm do envelope A (7 ids do CTAT) com papel de interface", () => {
    const A = JSON.parse(fs.readFileSync(`${DS}/problems/03summerBooks/envelope-a.json`, "utf8"));
    const d = descreverInterface(A);
    expect(d.componentes.map((c) => c.id)).toEqual(["numline", "F1", "F2", "denom", "showAnswer", "writeFractionStep", "done"]);
    expect(d.retaNumerica).toEqual({ de: 0, ate: 1, partesIniciais: 1 });
  });
});

describe("interface fixa — entra no estado dos agentes sem editar agente", () => {
  const A = JSON.parse(fs.readFileSync(`${DS}/problems/03summerBooks/envelope-a.json`, "utf8"));
  it("sem a flag, o problema-semente NÃO tem interface (rodadas 1–3 intactas)", () => {
    const st = buildStateFromEnvelopeA(A, { exerciseId: "03summerBooks" });
    expect(st.seedProblems[0].interface).toBeUndefined();
  });
  it("com interfaceFixa, o problema-semente carrega a interface (é o que os agents 3 serializam no prompt)", () => {
    const st = buildStateFromEnvelopeA(A, { exerciseId: "03summerBooks", interfaceFixa: true });
    expect(st.seedProblems[0].interface.componentes.length).toBe(7);
    expect(JSON.stringify(st.seedProblems)).toContain("reta numérica de 0 a 1");
    // o problema e a resposta continuam os do CTAT
    expect(st.seedProblems[0].statement).toBe(A.problem);
    expect(st.seedProblems[0].correctAnswer).toBe("3/5");
  });
});

// ── corpus 6.19 (bloco 1 dos pacotes públicos, 2026-08-16) ──
describe("interface 6.19 — descrição neutra sem vazamento do grafo do especialista", () => {
  const DS19 = "datasets/frac-estimates-6.19";
  const ids19 = fs.existsSync(`${DS19}/problems`) ? fs.readdirSync(`${DS19}/problems`) : [];
  it("existe o dataset 6.19 com 23 problemas, envelopes e interface-params por problema", () => {
    expect(ids19.length).toBe(23);
    for (const id of ids19) {
      expect(fs.existsSync(`${DS19}/problems/${id}/envelope-a.json`)).toBe(true);
      expect(fs.existsSync(`${DS19}/problems/${id}/interface-params.json`)).toBe(true);
    }
  });
  it("interface-params só contém mensagens de ESTADO INICIAL (ações de configuração), nunca arestas", () => {
    for (const id of ids19) {
      const P = JSON.parse(fs.readFileSync(`${DS19}/problems/${id}/interface-params.json`, "utf8"));
      for (const m of P.mensagens) expect(["UpdateTextArea", "setVisible", "setDisplay", "set_maximum", "set_denominator", "set_hide_denominator_ticks", "set_label_points"]).toContain(m.action);
    }
  });
  it("a descrição (STI_DATASET=frac-estimates-6.19) não contém dicas, feedback nem valores errados do .brd", async () => {
    const prev = process.env.STI_DATASET;
    process.env.STI_DATASET = "frac-estimates-6.19";
    try {
      const { descreverInterface619 } = await import("../interface-ctat.js");
      for (const id of ids19) {
        const A = JSON.parse(fs.readFileSync(`${DS19}/problems/${id}/envelope-a.json`, "utf8"));
        const B = JSON.parse(fs.readFileSync(`${DS19}/problems/${id}/envelope-b.json`, "utf8"));
        const texto = JSON.stringify(descreverInterface619(A));
        for (const h of (B.hintsPerCorrectStep || []).flat()) if (String(h).length > 15) expect(texto.includes(String(h))).toBe(false);
        for (const m of B.misconceptions || []) if (m.feedback && String(m.feedback).length > 15) expect(texto.includes(String(m.feedback))).toBe(false);
        expect(texto).not.toMatch(/buggyMessage|hintMessage/);
      }
    } finally {
      if (prev === undefined) delete process.env.STI_DATASET; else process.env.STI_DATASET = prev;
    }
  });
});
