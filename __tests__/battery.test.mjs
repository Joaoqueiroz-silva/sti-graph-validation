/**
 * battery.test.mjs — bateria congelada de traços + conformidade comportamental (gate G6).
 *
 * O que este arquivo trava (Onda 2, 2026-07-13, W4):
 *   1. DETERMINISMO do gerador: rodar battery-gen.mjs 2x produz MANIFESTs idênticos
 *      entre si E idênticos ao congelado em battery/frac-numberline-6.17-v1 (e os
 *      arquivos congelados conferem com os hashes do próprio MANIFEST);
 *   2. ESTRUTURA: a bateria de cada um dos 24 exercícios tem as 3 famílias
 *      (referencia/mutado/probe), itens no shape {id, family, trace[], expectedNote}
 *      e ids únicos;
 *   3. FAMÍLIA C é "probe de fora": regenerável SÓ do answer key (nunca do BRD) e
 *      garante verdadeiros negativos (valores fora do catálogo do especialista);
 *   4. AUTO-CONSISTÊNCIA: traceConformance(expert, expert, bateria) = concordância 1
 *      e kappa 1, com a célula no-match×no-match POVOADA (há verdadeiros negativos);
 *   5. o EXECUTOR não trava em nenhum item dos 24 exercícios (1 veredito por evento);
 *   6. SENSIBILIDADE: um robô degradado (sem uma transição buggy) derruba
 *      coverageBuggyRecognized/agreement/kappa — as métricas se movem de verdade.
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { canonAnswer } from "../schema.js";
import { parseBrdToNeutralV2 } from "../schema-v2.js";
import { executeTrace } from "../trace-executor.js";
import { generateProbes, BATTERY_VERSION } from "../battery-gen.mjs";
import { traceConformance } from "../trace-conformance.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const GEN = path.join(ROOT, "battery-gen.mjs");
const FROZEN_DIR = path.join(ROOT, "battery", BATTERY_VERSION);
const CASES_DIR = path.join(ROOT, "cases/ctat-6.17");
const KEY = JSON.parse(fs.readFileSync(path.join(ROOT, "answer-key/frac-numberline-6.17.json"), "utf8"));

const loadBattery = (exId) => JSON.parse(fs.readFileSync(path.join(FROZEN_DIR, `${exId}.json`), "utf8"));
const loadExpert = (exId) =>
  parseBrdToNeutralV2(fs.readFileSync(path.join(CASES_DIR, exId, "expert.brd"), "utf8"), { case: exId });

const EX_IDS = KEY.exercises.map((e) => e.id).sort();

// ───────── 1. determinismo e congelamento ─────────

describe("determinismo do battery-gen", () => {
  it("rodar 2x gera MANIFESTs idênticos entre si e iguais ao congelado no repositório", () => {
    const d1 = fs.mkdtempSync(path.join(os.tmpdir(), "battery-gen-a-"));
    const d2 = fs.mkdtempSync(path.join(os.tmpdir(), "battery-gen-b-"));
    try {
      execFileSync(process.execPath, [GEN, "--out", d1], { stdio: "pipe" });
      execFileSync(process.execPath, [GEN, "--out", d2], { stdio: "pipe" });
      const m1 = fs.readFileSync(path.join(d1, "MANIFEST.sha256"), "utf8");
      const m2 = fs.readFileSync(path.join(d2, "MANIFEST.sha256"), "utf8");
      const frozen = fs.readFileSync(path.join(FROZEN_DIR, "MANIFEST.sha256"), "utf8");
      expect(m1).toBe(m2); // determinismo do gerador
      expect(m1).toBe(frozen); // a bateria commitada É a que o gerador produz
    } finally {
      fs.rmSync(d1, { recursive: true, force: true });
      fs.rmSync(d2, { recursive: true, force: true });
    }
  }, 30000);

  it("cada arquivo congelado confere com o hash registrado no MANIFEST (integridade)", () => {
    const manifest = fs.readFileSync(path.join(FROZEN_DIR, "MANIFEST.sha256"), "utf8").trim();
    const lines = manifest.split("\n");
    expect(lines.length).toBe(EX_IDS.length + 1); // 24 exercícios + RULES.md
    for (const line of lines) {
      const [hash, name] = line.split(/\s{2}/);
      const real = crypto
        .createHash("sha256")
        .update(fs.readFileSync(path.join(FROZEN_DIR, name)))
        .digest("hex");
      expect(`${name}: ${real}`).toBe(`${name}: ${hash}`);
    }
  });
});

// ───────── 2. estrutura da bateria congelada ─────────

describe("estrutura da bateria congelada", () => {
  it("existe 1 arquivo por exercício do answer key (24) + RULES.md", () => {
    for (const exId of EX_IDS) {
      expect(fs.existsSync(path.join(FROZEN_DIR, `${exId}.json`)), exId).toBe(true);
    }
    expect(fs.existsSync(path.join(FROZEN_DIR, "RULES.md"))).toBe(true);
    expect(EX_IDS).toHaveLength(24);
  });

  it("a bateria de cada exercício tem as TRÊS famílias e itens no shape pactuado", () => {
    const idsGlobais = new Set();
    for (const exId of EX_IDS) {
      const b = loadBattery(exId);
      expect(b.battery).toBe(BATTERY_VERSION);
      expect(b.exercise).toBe(exId);

      const familias = new Set(b.items.map((i) => i.family));
      expect([...familias].sort()).toEqual(["mutado", "probe", "referencia"]);

      for (const item of b.items) {
        expect(typeof item.id).toBe("string");
        expect(["referencia", "mutado", "probe"]).toContain(item.family);
        expect(Array.isArray(item.trace)).toBe(true);
        expect(item.trace.length).toBeGreaterThan(0);
        expect(typeof item.expectedNote).toBe("string");
        expect(item.expectedNote.length).toBeGreaterThan(0);
        // ids globais únicos (prefixados pelo exercício)
        expect(idsGlobais.has(item.id), `id duplicado: ${item.id}`).toBe(false);
        idsGlobais.add(item.id);
        for (const ev of item.trace) {
          if (ev.hintRequest) continue;
          expect(typeof ev.selection).toBe("string");
          expect(typeof ev.action).toBe("string");
          expect(typeof ev.input).toBe("string");
        }
      }
    }
  });

  it("família A cobre o pactuado: 1 traço correto + 1 traço por transição buggy + 1 hint inicial", () => {
    for (const exId of EX_IDS) {
      const b = loadBattery(exId);
      const ref = b.items.filter((i) => i.family === "referencia");
      const buggiesNoGrafo = loadExpert(exId).transitions.filter((t) => t.type === "buggy").length;
      expect(ref.filter((i) => i.kind === "correta")).toHaveLength(1);
      expect(ref.filter((i) => i.kind === "buggy")).toHaveLength(buggiesNoGrafo);
      const hints = ref.filter((i) => i.kind === "hint");
      expect(hints).toHaveLength(1);
      expect(hints[0].trace).toEqual([{ hintRequest: true }]);
    }
  });
});

// ───────── 3. família C é probe DE FORA do especialista ─────────

describe("família C — probes independentes do especialista", () => {
  // 2026-07-13 (W4): a leitura literal "nenhum valor da família C está no catálogo do
  // especialista" é INSATISFAZÍVEL neste corpus: o distrator templatizado "badCount" do
  // especialista É exatamente (num−1)/den, uma das sondas de domínio pré-especificadas.
  // A independência que se pode (e se deve) travar é de PROVENIÊNCIA: a família C é
  // regenerável SÓ do answer key (nunca do BRD) — mais a garantia de que ela introduz
  // verdadeiros negativos (valores fora do catálogo) em todo exercício.
  it("é regenerável a partir SÓ do answer key (num/den/rBound) — nunca do BRD", () => {
    for (const ex of KEY.exercises) {
      // entrada MÍNIMA: se generateProbes usasse enunciado/BRD/etc., divergiria do congelado
      const dominioPuro = {
        id: ex.id,
        numerator: ex.numerator,
        denominator: ex.denominator,
        interfaceConfig: { rBound: ex.interfaceConfig.rBound, line_name: ex.interfaceConfig.line_name },
      };
      const congelados = loadBattery(ex.id).items.filter((i) => i.family === "probe");
      expect(generateProbes(dominioPuro)).toEqual(congelados);
    }
  });

  it("todo exercício ganha verdadeiros negativos: ≥3 probes fora do catálogo do especialista", () => {
    for (const exId of EX_IDS) {
      const expert = loadExpert(exId);
      const catalogo = new Set(expert.transitions.map((t) => canonAnswer(t.sai.input)));
      const probes = loadBattery(exId).items.filter((i) => i.family === "probe");
      const fora = probes.filter((p) => !catalogo.has(canonAnswer(p.trace.at(-1).input)));
      expect(fora.length, `${exId}: só ${fora.length} probes fora do catálogo`).toBeGreaterThanOrEqual(3);
      // a sonda negativa em particular NUNCA colide (o catálogo não tem frações negativas)
      expect(fora.map((p) => p.kind)).toContain("negativa");
    }
  });
});

// ───────── 4. auto-consistência do traceConformance ─────────

describe("traceConformance(expert, expert) — auto-consistência nos 24 exercícios", () => {
  it("concordância 1, kappa 1, coberturas 1 e matriz de confusão diagonal COM no-match×no-match > 0", () => {
    for (const exId of EX_IDS) {
      const expert = loadExpert(exId);
      const res = traceConformance(expert, expert, loadBattery(exId).items);

      expect(res.n).toBeGreaterThan(0);
      expect(res.agreement).toBe(1);
      expect(res.kappa).toBe(1);
      expect(res.coverageCorrectTraces).toBe(1);
      expect(res.coverageBuggyRecognized).toBe(1);

      // diagonal povoada nas 3 classes; fora da diagonal, zero
      for (const a of ["correct", "buggy", "no-match"]) {
        for (const b of ["correct", "buggy", "no-match"]) {
          if (a === b) continue;
          expect(res.confusion[a][b], `${exId}: confusão ${a}×${b}`).toBe(0);
        }
      }
      expect(res.confusion.correct.correct).toBeGreaterThan(0);
      expect(res.confusion.buggy.buggy).toBeGreaterThan(0);
      // os probes introduzem VERDADEIROS NEGATIVOS — a célula que a bateria v1 não tinha
      expect(res.confusion["no-match"]["no-match"], exId).toBeGreaterThan(0);
    }
  });
});

// ───────── 5. o executor não trava em nenhum item ─────────

describe("executabilidade — todos os itens dos 24 exercícios", () => {
  it("executeTrace devolve exatamente 1 veredito por evento, sem lançar, em todos os itens", () => {
    for (const exId of EX_IDS) {
      const expert = loadExpert(exId);
      for (const item of loadBattery(exId).items) {
        const res = executeTrace(expert, item.trace);
        expect(res.steps.length, item.id).toBe(item.trace.length);
        for (const s of res.steps) {
          expect(["correct", "buggy", "no-match", "hint"]).toContain(s.verdict);
        }
      }
    }
  });
});

// ───────── 6. sensibilidade: as métricas se movem com um robô degradado ─────────

describe("traceConformance — sensibilidade a divergência real", () => {
  it("robô sem UMA transição buggy: coverageBuggyRecognized cai, confusão buggy×no-match aparece", () => {
    const exId = "01watermelon";
    const expert = loadExpert(exId);
    const itens = loadBattery(exId).items;

    const robot = JSON.parse(JSON.stringify(expert));
    const removida = robot.transitions.find((t) => t.type === "buggy");
    robot.transitions = robot.transitions.filter((t) => t !== removida);

    const res = traceConformance(expert, robot, itens);
    const nBuggy = expert.transitions.filter((t) => t.type === "buggy").length;

    expect(res.coverageCorrectTraces).toBe(1); // o caminho correto não foi tocado
    expect(res.coverageBuggyRecognized).toBeCloseTo((nBuggy - 1) / nBuggy, 3);
    expect(res.confusion.buggy["no-match"]).toBeGreaterThanOrEqual(1);
    expect(res.agreement).toBeLessThan(1);
    expect(res.kappa).toBeLessThan(1);
  });

  it("sem itens de referência, as coberturas saem null (não estimável), nunca número fabricado", () => {
    const expert = loadExpert("01watermelon");
    const soProbes = loadBattery("01watermelon").items.filter((i) => i.family === "probe");
    const res = traceConformance(expert, expert, soProbes);
    expect(res.coverageCorrectTraces).toBeNull();
    expect(res.coverageBuggyRecognized).toBeNull();
    expect(res.agreement).toBe(1);
  });
});
