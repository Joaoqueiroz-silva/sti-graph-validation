/**
 * interface-reconstruction.test.mjs — Fase B (campanha-interface 2026-07-19):
 * reconstrução determinística da interface renderizada via mass-production.
 *
 * ACHADO que este arquivo trava: 59% das faltas não-mecânicas restantes
 * (44/75) só existem na interface RENDERIZADA — a reta é desenhada por JS e o
 * HTML cru tem 0 ticks/0 labels. `_interface/massproduction.txt` (TSV
 * TRANSPOSTO: linha 1 = nomes dos 24 problemas; cada linha seguinte = uma
 * variável %(var)% do template) + o shell CTAT determinam TODOS esses valores.
 *
 * O que fica travado aqui:
 *  (a) parse da tabela REAL do dataset (24 problemas) + invariantes do template
 *      (badCount == num-1 nos 23 com valor; mfNum_box == num-den nas 6 caixas);
 *  (b) fatos de 02watermelon: labels [0,1]; marcas 0,1/4,1/2,3/4,1 (5 marcas /
 *      4 intervalos) — a MESMA redução canônica do canonAnswer de schema.js;
 *  (c) FIDELIDADE 17pencils: mfNum AS-IS "5/7" (o typo legado PROPAGOU ao .brd
 *      do especialista — "corrigir" para 5/12 quebraria o casamento);
 *  (d) REGRA DE OURO / anti-vazamento: o módulo é PURO (sem fs — recebe TEXTO),
 *      jamais toca envelope-b, e a saída passa findLeaksInRobotInput para os
 *      24 problemas (nomes de campo neutros).
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseMassProductionTable,
  renderedFactsFromParams,
  formatRenderedFacts,
  statementNumbers,
} from "../interface-reconstruction.js";
import { buildInterfaceInventory, formatInterfaceInventory } from "../interface-inventory.js";
import { findLeaksInRobotInput } from "../parse-ctat-brd.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATASET = path.join(HERE, "../datasets/frac-numberline-6.17");
const TABLE_TEXT = fs.readFileSync(path.join(DATASET, "_interface", "massproduction.txt"), "utf8");
const { problems, paramsByProblem } = parseMassProductionTable(TABLE_TEXT);

/** Componentes reais do envelope-a (idênticos nos 24 problemas do dataset). */
const IFACE_17 = {
  id: "17pencils",
  problem: "Amy comprou 2 dúzias de lápis, mas usou apenas 17 deles.",
  correctAnswer: "17/12",
  components: [
    { id: "numline", type: "numberline", label: "numline" },
    { id: "F1", type: "numeric", label: "F1" },
    { id: "F2", type: "numeric", label: "F2" },
    { id: "denom", type: "numeric", label: "denom" },
    { id: "showAnswer", type: "button", label: "showAnswer" },
    { id: "writeFractionStep", type: "control", label: "writeFractionStep" },
    { id: "done", type: "button", label: "done" },
  ],
};

// ---- (a) parse da tabela REAL + invariantes do template --------------------------

describe("parseMassProductionTable — tabela real do dataset (TSV transposto)", () => {
  it("extrai os 24 problemas na ordem das colunas", () => {
    expect(problems).toHaveLength(24);
    expect(problems[0]).toBe("00bubble");
    expect(problems[23]).toBe("23textbookPack");
    expect(Object.keys(paramsByProblem)).toHaveLength(24);
  });

  it("cada problema tem as variáveis do template com o valor da SUA coluna", () => {
    const p = paramsByProblem["02watermelon"];
    expect(p.rBound).toBe("1");
    expect(p.num).toBe("3");
    expect(p.den).toBe("4");
    expect(p.frac).toBe("3/4");
    // rBound divide o dataset ao meio: 00-11 → reta 0..1, 12-23 → reta 0..2
    expect(problems.filter((id) => paramsByProblem[id].rBound === "1")).toHaveLength(12);
    expect(problems.filter((id) => paramsByProblem[id].rBound === "2")).toHaveLength(12);
  });

  it("invariante do template: badCount == num-1 nos 23 problemas com valor", () => {
    let comValor = 0;
    for (const id of problems) {
      const p = paramsByProblem[id];
      if (!/^-?\d+$/.test(p.badCount)) continue; // 00bubble: "-"
      comValor++;
      expect(parseInt(p.badCount, 10)).toBe(parseInt(p.num, 10) - 1);
    }
    expect(comValor).toBe(23);
  });

  it("invariante do template: mfNum_box == num-den nas 6 caixas de número misto", () => {
    const mistos = problems.filter((id) => !["-", "", "0"].includes(paramsByProblem[id].mfNum_box));
    expect(mistos).toEqual([
      "15fishStick",
      "17pencils",
      "19Painting",
      "21mnm",
      "22biscuit",
      "23textbookPack",
    ]);
    for (const id of mistos) {
      const p = paramsByProblem[id];
      expect(parseInt(p.mfNum_box, 10)).toBe(parseInt(p.num, 10) - parseInt(p.den, 10));
    }
  });
});

// ---- (b) fatos renderizados — 02watermelon como caso de referência ----------------

describe("renderedFactsFromParams — reta e marcas com a redução canônica do schema.js", () => {
  it("02watermelon: reta 0..1, labels [0,1], marcas 0,1/4,1/2,3/4,1 (5 marcas/4 intervalos)", () => {
    const f = renderedFactsFromParams(paramsByProblem["02watermelon"]);
    expect(f.linha.rBound).toBe(1);
    expect(f.linha.labelsInteiros).toEqual([0, 1]);
    expect(f.linha.intervalosPorUnidade).toBe(4);
    expect(f.linha.intervalosTotais).toBe(4);
    expect(f.linha.marcasTotais).toBe(5);
    expect(f.linha.marcasInternas).toBe(3);
    // "2/4"→"1/2" e "4/4"→"1": mesma redução do canonAnswer (a âncora da métrica)
    expect(f.linha.valoresDasMarcas).toEqual(["0", "1/4", "1/2", "3/4", "1"]);
  });

  it("02watermelon: números RENDERIZADOS do enunciado (dígitos + palavras-número)", () => {
    const f = renderedFactsFromParams(paramsByProblem["02watermelon"]);
    for (const n of ["1", "3", "4"]) expect(f.enunciado.inteiros).toContain(n);
    expect(f.enunciado.fracoes).toContain("3/4");
  });

  it("statementNumbers: palavras-número EN/PT e frações-palavra (half/metade)", () => {
    const s = statementNumbers("Ela leu three livros, half do total; comprou duas dúzias.");
    expect(s.inteiros).toContain("3");
    expect(s.inteiros).toContain("2");
    expect(s.inteiros).toContain("12"); // dúzia
    expect(s.fracoes).toContain("1/2"); // half
  });

  it("04soccerSeason: label_aid aninhado %(frac)% resolve para a fração do problema", () => {
    const f = renderedFactsFromParams(paramsByProblem["04soccerSeason"]);
    expect(f.linha.labelAidVisivel).toBe(true);
    expect(f.linha.labelAidValor).toBe("3/4");
    // 00bubble: label_aid = "0" → sem rótulo de ajuda
    const f0 = renderedFactsFromParams(paramsByProblem["00bubble"]);
    expect(f0.linha.labelAidVisivel).toBe(false);
    expect(f0.linha.labelAidValor).toBeNull();
  });

  it("fallback silencioso: parâmetros nucleares ausentes → null (sem lançar)", () => {
    expect(renderedFactsFromParams({})).toBeNull();
    expect(renderedFactsFromParams(null)).toBeNull();
    expect(renderedFactsFromParams({ rBound: "x", den: "4" })).toBeNull();
  });
});

// ---- (c) fidelidade ao template: 17pencils usa mfNum AS-IS ------------------------

describe("17pencils — mfNum NÃO entra nos fatos (FISCAL 2026-07-19: vazamento)", () => {
  const f = renderedFactsFromParams(paramsByProblem["17pencils"]);

  it("a caixa de número misto NÃO existe na interface renderizada — mfNum/badCount/doubleDiv fora dos fatos", () => {
    // O parâmetro mfNum ("5/7") só materializa nas buggy edges do expert.brd
    // (= gabarito); interface.json/envelope-a/screenshot não têm a caixa.
    // Imprimi-lo no prompt seria colar — o 17pencils fica DESCOBERTO por
    // honestidade (número honesto da cobertura: 99,2%, não 100%).
    expect(f.caixas.numeroMisto).toBe(true);
    expect(f.caixas.mfNum).toBeUndefined();
    expect(f.template?.badCount).toBeUndefined();
    expect(f.template?.doubleDiv).toBeUndefined();
    const bloco = formatRenderedFacts(f);
    expect(bloco).not.toContain("5/7");
    expect(f.caixas.mfNumBox).toBe(5);
  });

  it("reta 0..2 com 12 divisões/unidade: 25 marcas; vizinha do alvo 17/12 é 4/3 (=16/12)", () => {
    expect(f.linha.rBound).toBe(2);
    expect(f.linha.marcasTotais).toBe(25);
    const marcas = f.linha.valoresDasMarcas;
    expect(marcas).toContain("17/12");
    expect(marcas[marcas.indexOf("17/12") - 1]).toBe("4/3"); // 16/12 reduzida
    expect(marcas[0]).toBe("0");
    expect(marcas[marcas.length - 1]).toBe("2");
  });

  it('fração do problema fica AS-IS como renderizada ("15/12" em 12apples, sem reduzir)', () => {
    const f12 = renderedFactsFromParams(paramsByProblem["12apples"]);
    expect(f12.fracaoDoProblema).toBe("15/12");
  });
});

// ---- formatação para o prompt -----------------------------------------------------

describe("formatRenderedFacts — linhas de fatos (pistas de formato, sem checklist paralelo)", () => {
  const f17 = renderedFactsFromParams(paramsByProblem["17pencils"]);

  it("emite o limite direito da escala (fato que o passo set_maximum do aluno usa)", () => {
    const text = formatRenderedFacts(f17, { scaleId: "numline" });
    expect(text).toContain('escala "numline" RECONSTRUÍDA do template');
    expect(text).toContain("limite direito visível da escala = 2");
    expect(text).toContain("12 divisões por unidade");
    expect(text).toContain('stepper "Number of parts" começa em 1');
  });

  it("lista TODOS os valores de marca (a vizinha do alvo é adjacente na lista)", () => {
    const text = formatRenderedFacts(f17);
    expect(text).toContain("valores das marcas da reta, em ordem: 0, 1/12, 1/6");
    expect(text).toContain("4/3, 17/12, 3/2"); // vizinhas do alvo 17/12
    expect(text).toContain("marca VIZINHA");
  });

  it("valores renderizados: fração do problema e entrada parcial — SEM a caixa mista (vazamento removido)", () => {
    const text = formatRenderedFacts(f17);
    expect(text).toContain('fração do problema "17/12"');
    // FISCAL 2026-07-19: mfNum é parâmetro de buggy edge, não fato renderizado.
    expect(text).not.toContain("5/7");
    expect(text).toContain('entrada parcial registra "N/-" ou "-/D"');
  });

  it("sem fatos → string vazia (fallback silencioso do inventário)", () => {
    expect(formatRenderedFacts(null)).toBe("");
    expect(formatRenderedFacts({})).toBe("");
  });
});

// ---- (d) REGRA DE OURO: pureza + anti-vazamento nos 24 problemas ------------------

describe("REGRA DE OURO — módulo puro, envelope-b jamais, nomes de campo neutros", () => {
  it("o módulo NÃO importa fs/path (recebe o TEXTO da tabela; IO é do chamador)", () => {
    // Sem IO, ler envelope-b é IMPOSSÍVEL por construção (os comentários do
    // módulo citam "envelope-b" só para PROIBI-lo — por isso o trava é nos imports).
    const src = fs.readFileSync(path.join(HERE, "../interface-reconstruction.js"), "utf8");
    expect(src).not.toMatch(/from\s+["']node:fs["']/);
    expect(src).not.toMatch(/from\s+["']fs["']/);
    expect(src).not.toMatch(/from\s+["']node:path["']/);
    expect(src).not.toMatch(/require\s*\(/);
    const imports = src.match(/^import[^;]+;/gm) || [];
    expect(imports).toEqual(['import { canonAnswer } from "./schema.js";']);
  });

  it("findLeaksInRobotInput([fatos]) == [] para os 24 problemas (nomes neutros)", () => {
    for (const id of problems) {
      const f = renderedFactsFromParams(paramsByProblem[id]);
      expect(f).not.toBeNull();
      expect(findLeaksInRobotInput(f)).toEqual([]);
    }
  });

  it("inventário COMPLETO (com renderedFacts) continua sem nenhuma chave proibida", () => {
    const inv = buildInterfaceInventory(IFACE_17, {
      renderedFacts: renderedFactsFromParams(paramsByProblem["17pencils"]),
    });
    expect(findLeaksInRobotInput(inv)).toEqual([]);
  });

  it("é determinístico byte a byte e o formatInterfaceInventory imprime a seção extra", () => {
    const build = () =>
      buildInterfaceInventory(IFACE_17, {
        renderedFacts: renderedFactsFromParams(paramsByProblem["17pencils"]),
      });
    expect(JSON.stringify(build())).toBe(JSON.stringify(build()));
    const text = formatInterfaceInventory(build());
    expect(text).toContain('escala "numline" RECONSTRUÍDA do template');
    expect(text).toContain("valores das marcas da reta, em ordem: 0, 1/12");
    // sem renderedFacts, o inventário fica EXATAMENTE como antes (fallback)
    const before = formatInterfaceInventory(buildInterfaceInventory(IFACE_17));
    expect(before).not.toContain("RECONSTRUÍDA");
    expect(text.startsWith(before)).toBe(true);
  });
});
