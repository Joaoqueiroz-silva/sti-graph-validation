/**
 * simulate-sem-teto.test.mjs — Trilha A: o robô do experimento adota a
 * filosofia do 3b de produção (achado "completude 0.400 [0.366,0.436] —
 * campanha 2026-07-19: teto de 8 misconceptions no prompt do robô").
 *
 * O prompt de simulate-students.js tinha teto explícito ("2 a 8 misconceptions
 * no total") enquanto o especialista CTAT cria quantos buggy paths forem
 * necessários — o teto era suspeito de limitar a completude por construção.
 * O 3b de produção (agents3-students.js) já é dirigido por cobertura POR
 * PASSO, sem máximo, com buggyRule mecânica.
 *
 * Compliance de prompt é estocástica (CLAUDE.md gotcha 4) — não dá para testar
 * a saída do LLM aqui. O que ESTE arquivo trava:
 *  (a) o TEXTO do prompt: sem o teto antigo, com a direção por-passo + buggyRule
 *      + gramática de id, SEM perder as âncoras do experimento (vocabulário
 *      fechado de selection, wrongAnswer concreta);
 *  (b) o pós-parse (defesa em profundidade): id genérico-reservado cai,
 *      duplicata por (id, wrongAnswer canônica) cai;
 *  (c) buildGraphForgeConfig não tem teto próprio: 15 erros num passo → 15.
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sanitizeMisconceptions } from "../simulate-students.js";
import { buildGraphForgeConfig } from "../author-graph.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(HERE, "../simulate-students.js"), "utf8");

// Isola o SYSTEM prompt (o comentário de cabeçalho do arquivo CITA o teto antigo
// como registro histórico — não pode poluir os asserts de ausência).
const start = source.indexOf("const SYSTEM");
const end = source.indexOf("export function buildUserMessage");
expect(start).toBeGreaterThan(-1);
expect(end).toBeGreaterThan(start);
const system = source.slice(start, end);

describe("(a) prompt do robô — dirigido por cobertura, sem teto (campanha 2026-07-19)", () => {
  it("não contém mais o teto '2 a 8 misconceptions no total'", () => {
    expect(system).not.toMatch(/2 a 8 misconceptions/i);
    expect(system).not.toMatch(/misconceptions no total/i);
  });

  it("dirige a produção POR PASSO: todos os erros plausíveis, mínimo 2, SEM máximo", () => {
    expect(system).toMatch(/CADA passo/i);
    expect(system).toMatch(/TODOS os erros plaus/i);
    expect(system).toMatch(/M[ÍI]NIMO 2 por passo/i);
    expect(system).toMatch(/SEM m[áa]ximo/i);
  });

  it("exige buggyRule mecânica (com exemplo BOM/RUIM, estilo 3b de produção)", () => {
    expect(system).toMatch(/"buggyRule"/);
    expect(system).toMatch(/MEC[ÂA]NICA/i);
    expect(system).toMatch(/BOM:/);
    expect(system).toMatch(/RUIM:/);
  });

  it("declara a gramática de id e proíbe os 4 prefixos genéricos reservados", () => {
    expect(system).toContain("^[A-Za-z0-9_.:-]+$");
    for (const prefix of [
      "misc_generic",
      "misc_unclassified",
      "misc_numeric_near",
      "misc_text_confusion",
    ]) {
      expect(system).toContain(prefix);
    }
  });

  it("NÃO mexe nas âncoras do experimento: vocabulário fechado de selection e wrongAnswer concreta", () => {
    expect(system).toMatch(/VOCABULÁRIO FECHADO/);
    expect(system).toMatch(/PROIBIDO usar um componente fora da lista/);
    expect(system).toMatch(/VALORES CONCRETOS/);
    expect(system).toMatch(/ÂNCORA da avaliação/);
  });
});

describe("(b) pós-parse sanitizeMisconceptions — defesa em profundidade", () => {
  const base = { step: 1, selection: "numline", type: "procedural", feedback: "f" };

  it("descarta id com prefixo genérico reservado (a régua da PR #27 nunca afrouxa)", () => {
    const { kept, droppedInvalidId } = sanitizeMisconceptions([
      { ...base, id: "misc_generic_1", wrongAnswer: "0/4" },
      { ...base, id: "misc_numeric_near_x", wrongAnswer: "3/4" },
      { ...base, id: "misc_ponto_no_zero", wrongAnswer: "0/4" },
    ]);
    expect(kept.map((m) => m.id)).toEqual(["misc_ponto_no_zero"]);
    expect(droppedInvalidId).toBe(2);
  });

  it("normaliza id fora da gramática (acento/espaço) em vez de perder o erro", () => {
    const { kept } = sanitizeMisconceptions([
      { ...base, id: "misc conta então", wrongAnswer: "2/4" },
    ]);
    expect(kept).toHaveLength(1);
    expect(kept[0].id).toBe("misc_conta_entao");
  });

  it("dedupa por (id, wrongAnswer canônica) — '2/8' ≡ '1/4' conta UMA vez", () => {
    const { kept, droppedDup } = sanitizeMisconceptions([
      { ...base, id: "misc_metade_da_metade", wrongAnswer: "1/4" },
      { ...base, id: "misc_metade_da_metade", wrongAnswer: "2/8" },
      { ...base, id: "misc_metade_da_metade", wrongAnswer: "3/4" },
    ]);
    expect(kept).toHaveLength(2);
    expect(droppedDup).toBe(1);
  });

  it("mantém entrada SEM id (âncora é a wrongAnswer; não super-podar) mas dedupa entre elas", () => {
    const { kept } = sanitizeMisconceptions([
      { ...base, wrongAnswer: "0/4" },
      { ...base, wrongAnswer: "0/4" },
      { ...base, wrongAnswer: "3/4" },
    ]);
    expect(kept).toHaveLength(2);
  });
});

describe("(c) buildGraphForgeConfig — sem teto próprio na autoria", () => {
  it("15 misconceptions num MESMO passo entram as 15 no config (nenhum slice)", () => {
    const iface = { problem: "p", correctAnswer: "1/4", knowledgeComponents: [{ id: "kc_x" }] };
    const traces = {
      correctPath: [{ kc: "kc_x", action: "a", result: "1/4" }],
      misconceptions: Array.from({ length: 15 }, (_, i) => ({
        step: 1,
        id: `misc_causa_${i + 1}`,
        wrongAnswer: `${i + 2}/40`, // canônicas distintas (frações irredutíveis diferentes entre si)
        buggyRule: `receita ${i + 1}`,
      })),
      hints: [],
    };
    const config = buildGraphForgeConfig(iface, traces);
    expect(config.misconceptions[0]).toHaveLength(15);
    expect(new Set(config.misconceptions[0].map((m) => m.id)).size).toBe(15);
  });

  it("buggyRule preenche description ausente (material do robô, não sintético) e é preservada", () => {
    const iface = { problem: "p", correctAnswer: "1/4", knowledgeComponents: [{ id: "kc_x" }] };
    const traces = {
      correctPath: [{ kc: "kc_x", action: "a", result: "1/4" }],
      misconceptions: [
        { step: 1, id: "misc_sem_desc", wrongAnswer: "0/4", buggyRule: "colocar o ponto no zero" },
        { step: 1, id: "misc_com_desc", wrongAnswer: "3/4", buggyRule: "inverter", description: "já tinha" },
      ],
      hints: [],
    };
    const [a, b] = buildGraphForgeConfig(iface, traces).misconceptions[0];
    expect(a.description).toBe("colocar o ponto no zero");
    expect(a.buggyRule).toBe("colocar o ponto no zero");
    expect(b.description).toBe("já tinha");
  });
});
