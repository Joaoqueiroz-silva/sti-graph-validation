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

// ── corpus 6.18 (2026-08-17): interface com DUAS retas; R1 do estado inicial carrega a RESPOSTA ──
describe("interface 6.18 — nenhum valor de campo entra na descrição (R1 = resposta)", () => {
  const DS18 = "datasets/equiv-fractions-6.18";
  const ids18 = fs.existsSync(`${DS18}/problems`) ? fs.readdirSync(`${DS18}/problems`) : [];
  it("dataset com 20 problemas, envelopes e interface-params", () => {
    expect(ids18.length).toBe(20);
    for (const id of ids18) expect(fs.existsSync(`${DS18}/problems/${id}/interface-params.json`)).toBe(true);
  });
  it("a descrição NÃO contém o valor de R1 (numerador da resposta), nem L1/L2/R2, nem dicas/feedback do .brd", async () => {
    const prev = process.env.STI_DATASET;
    process.env.STI_DATASET = "equiv-fractions-6.18";
    try {
      const { descreverInterface618, textoRequisitoInterface } = await import("../interface-ctat.js");
      let comR1 = 0;
      for (const id of ids18) {
        const A = JSON.parse(fs.readFileSync(`${DS18}/problems/${id}/envelope-a.json`, "utf8"));
        const B = JSON.parse(fs.readFileSync(`${DS18}/problems/${id}/envelope-b.json`, "utf8"));
        const P = JSON.parse(fs.readFileSync(`${DS18}/problems/${id}/interface-params.json`, "utf8"));
        const d = descreverInterface618(A);
        const texto = JSON.stringify(d) + textoRequisitoInterface(d);
        const r1 = (P.mensagens.find((m) => m.selection === "R1" && m.action === "UpdateTextArea") || {}).input;
        if (r1 && String(A.correctAnswer).includes(String(r1))) comR1++;
        // o numerador da resposta não pode aparecer como valor citado na descrição
        for (const campo of ["R1", "L1", "L2", "R2"]) {
          const v = (P.mensagens.find((m) => m.selection === campo && m.action === "UpdateTextArea") || {}).input;
          if (v) expect(texto).not.toMatch(new RegExp(`"${v}"|= *${v}\\b`));
        }
        for (const h of (B.hintsPerCorrectStep || []).flat()) if (String(h).length > 15) expect(texto.includes(String(h))).toBe(false);
        for (const m of B.misconceptions || []) if (m.feedback && String(m.feedback).length > 15) expect(texto.includes(String(m.feedback))).toBe(false);
        expect(texto).not.toContain("shield"); // controle interno não é oferecido ao agente
      }
      expect(comR1).toBe(20); // confirma o motivo da regra: R1 traz a resposta em todos
    } finally {
      if (prev === undefined) delete process.env.STI_DATASET; else process.env.STI_DATASET = prev;
    }
  });
});

// ── corpus 6.20 (2026-08-18): duas retas + seletor de comparação com alternativas visíveis ──
describe("interface 6.20 — alternativas do seletor entram (são da tela); nada do grafo entra", () => {
  const DS20 = "datasets/fraction-ordering-6.20";
  const ids20 = fs.existsSync(`${DS20}/problems`) ? fs.readdirSync(`${DS20}/problems`) : [];
  it("dataset com 19 problemas; enunciado inclui var1/var2/question (declarado em campos-enunciado.json)", () => {
    expect(ids20.length).toBe(19);
    const A = JSON.parse(fs.readFileSync(`${DS20}/problems/01book/envelope-a.json`, "utf8"));
    expect(A.problem).toMatch(/1\/4/);
    expect(A.problem).toMatch(/1\/5/);
    const decl = JSON.parse(fs.readFileSync("cases/ctat-6.20/_interface/campos-enunciado.json", "utf8"));
    expect(decl.campos).toContain("var1");
  });
  it("a descrição traz as alternativas visíveis do seletor, e nenhuma dica/feedback do .brd", async () => {
    const prev = process.env.STI_DATASET;
    process.env.STI_DATASET = "fraction-ordering-6.20";
    try {
      const { descreverInterface620, textoRequisitoInterface } = await import("../interface-ctat.js");
      for (const id of ids20) {
        const A = JSON.parse(fs.readFileSync(`${DS20}/problems/${id}/envelope-a.json`, "utf8"));
        const B = JSON.parse(fs.readFileSync(`${DS20}/problems/${id}/envelope-b.json`, "utf8"));
        const d = descreverInterface620(A);
        const texto = JSON.stringify(d) + textoRequisitoInterface(d);
        expect(d.componentes.map((c) => c.id)).toContain("compBox");
        for (const h of (B.hintsPerCorrectStep || []).flat()) if (String(h).length > 15) expect(texto.includes(String(h))).toBe(false);
        for (const m of B.misconceptions || []) if (m.feedback && String(m.feedback).length > 15) expect(texto.includes(String(m.feedback))).toBe(false);
      }
    } finally {
      if (prev === undefined) delete process.env.STI_DATASET; else process.env.STI_DATASET = prev;
    }
  });
});

// ── corpus 8.12 (2026-08-18): tabela de razões/porcentagem; 24 estados de valor ──
describe("interface 8.12 — descrição estrutural da tabela, sem valores do problema", () => {
  const DS = "datasets/factors-scaling-8.12";
  const ids = fs.existsSync(`${DS}/problems`) ? fs.readdirSync(`${DS}/problems`) : [];
  it("dataset com 19 problemas; enunciado vem de problemstatement + problemstatementparts", () => {
    expect(ids.length).toBe(19);
    const decl = JSON.parse(fs.readFileSync("cases/ctat-8.12/_interface/campos-enunciado.json", "utf8"));
    expect(decl.campos).toContain("problemstatement");
    expect(decl.campos).toContain("problemstatementparts");
    const A = JSON.parse(fs.readFileSync(`${DS}/problems/animal shelter/envelope-a.json`, "utf8"));
    expect(A.problem).toMatch(/Part 1/);
  });
  it("a descrição é estrutural: não cita nenhum valor do problema nem dicas/feedback do .brd", async () => {
    const prev = process.env.STI_DATASET;
    process.env.STI_DATASET = "factors-scaling-8.12";
    try {
      const { descreverInterface812, textoRequisitoInterface } = await import("../interface-ctat.js");
      for (const id of ids) {
        const A = JSON.parse(fs.readFileSync(`${DS}/problems/${id}/envelope-a.json`, "utf8"));
        const B = JSON.parse(fs.readFileSync(`${DS}/problems/${id}/envelope-b.json`, "utf8"));
        const d = descreverInterface812(A);
        const texto = JSON.stringify(d) + textoRequisitoInterface(d);
        // nenhuma resposta correta do caminho aparece na descrição
        for (const st of B.steps || []) {
          const v = String(st.answer ?? "").trim();
          if (v && v.length >= 3 && !["100"].includes(v)) expect(texto).not.toMatch(new RegExp(`\\b${v.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\b`));
        }
        for (const h of (B.hintsPerCorrectStep || []).flat()) if (String(h).length > 15) expect(texto.includes(String(h))).toBe(false);
      }
    } finally {
      if (prev === undefined) delete process.env.STI_DATASET; else process.env.STI_DATASET = prev;
    }
  });
});

// ── corpus 7.12 (2026-08-19): tabela de conversão de 2 linhas ──
describe("interface 7.12 — rótulos da tabela entram; valores da razão ficam no enunciado", () => {
  const DS = "datasets/conversion-factors-7.12";
  const ids = fs.existsSync(`${DS}/problems`) ? fs.readdirSync(`${DS}/problems`) : [];
  it("dataset com 18 problemas; enunciado de statement + final_statement", () => {
    expect(ids.length).toBe(18);
    const decl = JSON.parse(fs.readFileSync("cases/ctat-7.12/_interface/campos-enunciado.json", "utf8"));
    expect(decl.campos).toContain("final_statement");
  });
  it("a descrição não traz valores de resposta do caminho nem dicas/feedback, e omite o _root", async () => {
    const prev = process.env.STI_DATASET;
    process.env.STI_DATASET = "conversion-factors-7.12";
    try {
      const { descreverInterface712, textoRequisitoInterface } = await import("../interface-ctat.js");
      for (const id of ids) {
        const A = JSON.parse(fs.readFileSync(`${DS}/problems/${id}/envelope-a.json`, "utf8"));
        const B = JSON.parse(fs.readFileSync(`${DS}/problems/${id}/envelope-b.json`, "utf8"));
        const d = descreverInterface712(A);
        const texto = JSON.stringify(d) + textoRequisitoInterface(d);
        expect(texto).not.toContain("_root");
        for (const h of (B.hintsPerCorrectStep || []).flat()) if (String(h).length > 15) expect(texto.includes(String(h))).toBe(false);
        for (const m of B.misconceptions || []) if (m.feedback && String(m.feedback).length > 15) expect(texto.includes(String(m.feedback))).toBe(false);
      }
    } finally {
      if (prev === undefined) delete process.env.STI_DATASET; else process.env.STI_DATASET = prev;
    }
  });
});
