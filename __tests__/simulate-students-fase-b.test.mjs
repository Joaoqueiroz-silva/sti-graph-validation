/**
 * simulate-students-fase-b.test.mjs — Fase B do experimento (2026-07-19):
 * prompt de passos de interface + eliciação focada + override premium do 3b.
 *
 * ACHADOS que este arquivo trava:
 *  (a) recallSteps 0.51 é gap DETERMINÍSTICO de identidade de passos de
 *      interface: o robô casa {fração, numerador, denominador} e perde os
 *      passos de CONFIGURAÇÃO (set_maximum = rBound) e FINALIZAÇÃO. O teto
 *      antigo do prompt ("1 a 6 passos") não eliciava esses passos — a nova
 *      regra percorre a interface (tipicamente 5 a 8). A convenção done="-1"
 *      (constante CTAT) ficou FORA por decisão explícita (pendente de
 *      aprovação vs regra de ouro 1); "step#2" é irredutível sem mudar o
 *      protocolo congelado.
 *  (b) o prompt ganha os fatos da interface RENDERIZADA por problema
 *      (renderedFacts → inventário) — SEM tocar no protocolo de comparação.
 *  (c) o 3b do EXPERIMENTO roda no premium recomendado do repo
 *      (qwen/qwen3-max) por override LIMPO do caminho de avaliação
 *      (STI_EVAL_3B_MODEL/opts) — o registry de produção fica INTOCADO.
 */

import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildUserMessage, resolveEvalStudentConfig } from "../simulate-students.js";
import { parseMassProductionTable, renderedFactsFromParams } from "../interface-reconstruction.js";
// Adaptação standalone: getAgentConfig vem do cliente local (llm.js), não do
// pipeline-core do backend — mesma API; o default de agent3b_atrisk aqui é a
// bancada histórica (google/gemini-3.5-flash via GEN_MODEL).
import { getAgentConfig } from "../llm.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATASET = path.join(HERE, "../datasets/frac-numberline-6.17");
const { paramsByProblem } = parseMassProductionTable(
  fs.readFileSync(path.join(DATASET, "_interface", "massproduction.txt"), "utf8")
);

const source = fs.readFileSync(path.join(HERE, "../simulate-students.js"), "utf8");
const system = source.slice(
  source.indexOf("const SYSTEM"),
  source.indexOf("export function buildUserMessage")
);

/** Envelope A real de 17pencils (cópia literal do dataset). */
const IFACE_17 = JSON.parse(
  fs.readFileSync(path.join(DATASET, "problems", "17pencils", "envelope-a.json"), "utf8")
);

// ---- (a) passos do caminho correto percorrem a INTERFACE --------------------------

describe("(a) SYSTEM — passos de configuração/finalização da interface (Analista 2)", () => {
  it("substitui o teto '1 a 6 passos' pela regra de percorrer a interface", () => {
    expect(system).not.toContain("1 a 6 passos");
    expect(system).toContain("O caminho correto percorre a INTERFACE");
    expect(system).toContain("CADA componente interativo");
    expect(system).toContain("CONFIGURAÇÃO da interface e o de FINALIZAÇÃO");
    expect(system).toContain("(tipicamente 5 a 8 passos)");
  });

  it("NÃO adota a convenção done='-1' (opcional, pendente de aprovação) nem toca em kc", () => {
    // registro da decisão: constante de runtime CTAT ficou fora desta fase
    expect(system).not.toMatch(/result "-1"|done.*-1/);
    expect(system).toContain('Cada passo tem um "kc" curto em snake_case');
  });
});

// ---- (b) renderedFacts fluem para o prompt ----------------------------------------

describe("(b) buildUserMessage — interface RENDERIZADA no inventário (Fase B)", () => {
  const renderedFacts = renderedFactsFromParams(paramsByProblem["17pencils"]);

  it("com renderedFacts: escala reconstruída, valores das marcas no prompt (caixa mista FORA — vazamento)", () => {
    const msg = buildUserMessage(IFACE_17, { renderedFacts });
    expect(msg).toContain('escala "numline" RECONSTRUÍDA do template');
    expect(msg).toContain("limite direito visível da escala = 2");
    expect(msg).toContain("4/3, 17/12, 3/2"); // marcas vizinhas do alvo, invisíveis no HTML cru
    // FISCAL 2026-07-19: mfNum removido dos fatos (vazamento de buggy edge).
    expect(msg).not.toContain("5/7"); // typo legado AS-IS
    expect(msg).toContain('entrada parcial registra "N/-" ou "-/D"');
  });

  it("ordem do bloco: fatos → passo de configuração → 3 causas → autochecagem no FIM", () => {
    const msg = buildUserMessage(IFACE_17, { renderedFacts });
    const iInv = msg.indexOf("INVENTÁRIO DA INTERFACE");
    const iCfg = msg.indexOf("Se a interface tem reta numérica");
    const iErr = msg.indexOf("ERROS DE LEITURA DESTA INTERFACE");
    const iChk = msg.indexOf("AUTOCHECAGEM DE FORMA");
    expect(iInv).toBeGreaterThan(-1);
    expect(iCfg).toBeGreaterThan(iInv);
    expect(iErr).toBeGreaterThan(iCfg);
    expect(iChk).toBeGreaterThan(iErr);
    // autochecagem vive COLADA na produção de erros (não nas REGRAS DURAS do SYSTEM)
    expect(system).not.toContain("AUTOCHECAGEM");
  });

  it("sem renderedFacts o prompt fica como antes (fallback silencioso p/ outros datasets)", () => {
    const msg = buildUserMessage(IFACE_17, {});
    expect(msg).not.toContain("RECONSTRUÍDA");
    expect(msg).toContain("INVENTÁRIO DA INTERFACE"); // inventário base continua
  });
});

// ---- (c) override premium do 3b — SÓ no caminho da avaliação ----------------------

describe("(c) resolveEvalStudentConfig — premium recomendado sem tocar o registry", () => {
  const saved = {
    model: process.env.STI_EVAL_3B_MODEL,
    provider: process.env.STI_EVAL_3B_PROVIDER,
  };
  afterEach(() => {
    if (saved.model === undefined) delete process.env.STI_EVAL_3B_MODEL;
    else process.env.STI_EVAL_3B_MODEL = saved.model;
    if (saved.provider === undefined) delete process.env.STI_EVAL_3B_PROVIDER;
    else process.env.STI_EVAL_3B_PROVIDER = saved.provider;
  });

  it("default do EXPERIMENTO: qwen/qwen3-max via openrouter (recomendado em tiers.js)", () => {
    delete process.env.STI_EVAL_3B_MODEL;
    delete process.env.STI_EVAL_3B_PROVIDER;
    const cfg = resolveEvalStudentConfig({});
    expect(cfg.provider).toBe("openrouter");
    expect(cfg.model).toBe("qwen/qwen3-max");
    // o resto da config (maxTokens/temperature) continua herdado do registry
    expect(cfg.maxTokens).toBe(getAgentConfig("agent3b_atrisk").maxTokens);
  });

  it("env STI_EVAL_3B_MODEL vence o default; opts.modelOverride vence o env", () => {
    process.env.STI_EVAL_3B_MODEL = "provider/modelo-do-env";
    expect(resolveEvalStudentConfig({}).model).toBe("provider/modelo-do-env");
    expect(resolveEvalStudentConfig({ modelOverride: "provider/modelo-do-opts" }).model).toBe(
      "provider/modelo-do-opts"
    );
  });

  it("a config base fica intocada (getAgentConfig puro não muda)", () => {
    delete process.env.STI_EVAL_3B_MODEL;
    const producao = getAgentConfig("agent3b_atrisk");
    expect(producao.model).not.toBe("qwen/qwen3-max"); // default histórico preservado
    expect(resolveEvalStudentConfig({}).model).toBe("qwen/qwen3-max");
  });

  it("configKey customizado NÃO é o 3b do experimento: sai intocado do registry", () => {
    process.env.STI_EVAL_3B_MODEL = "provider/nao-deve-aplicar";
    const cfg = resolveEvalStudentConfig({ configKey: "agent3a_advanced" });
    expect(cfg.model).toBe(getAgentConfig("agent3a_advanced").model);
    expect(cfg.model).not.toBe("provider/nao-deve-aplicar");
  });
});
