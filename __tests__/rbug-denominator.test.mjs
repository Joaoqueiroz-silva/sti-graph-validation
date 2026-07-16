import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  bugDenominators,
  reconstructFrozenRBug,
} from "../analysis/rbug-denominator.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BATTERY = path.join(ROOT, "battery", "frac-numberline-6.17-v1");
const C3 = path.join(ROOT, "resultados", "campanha3-2026-07-13");
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

describe("R_bug — denominador congelado", () => {
  it("a bateria contém 192 ações buggy; 150 são ancoráveis pela sensibilidade", () => {
    let all = 0;
    let anchorable = 0;
    for (const file of fs.readdirSync(BATTERY).filter((f) => f.endsWith(".json"))) {
      const den = bugDenominators(readJson(path.join(BATTERY, file)).items);
      all += den.all;
      anchorable += den.anchorable;
    }
    expect(all).toBe(192);
    expect(anchorable).toBe(150);
  });

  it("reconstrói apenas numeradores inteiros compatíveis com a taxa arredondada", () => {
    expect(reconstructFrozenRBug(0.167, { all: 8, anchorable: 6 })).toMatchObject({
      hits: 1,
      rate: 0.125,
    });
    expect(() =>
      reconstructFrozenRBug(0.1, { all: 8, anchorable: 6 })
    ).toThrow(/não foi possível reconstruir/);
  });

  it("reconstrói os 648 casos C3 e reproduz baseline estrito 0,054", () => {
    const denByEx = new Map();
    for (const file of fs.readdirSync(BATTERY).filter((f) => f.endsWith(".json"))) {
      const battery = readJson(path.join(BATTERY, file));
      denByEx.set(battery.exercise, bugDenominators(battery.items));
    }

    const files = fs
      .readdirSync(C3)
      .filter((f) => f.startsWith("report-c3-") && f.endsWith(".json"));
    const byExercise = new Map();
    let nCases = 0;
    for (const file of files) {
      for (const c of readJson(path.join(C3, file)).cases) {
        const rec = reconstructFrozenRBug(
          c.metrics.behavioral.rBug,
          denByEx.get(c.id)
        );
        if (file.startsWith("report-c3-base-gemini-")) {
          const rows = byExercise.get(c.id) || [];
          rows.push(rec.rate);
          byExercise.set(c.id, rows);
        }
        nCases++;
      }
    }
    const means = [...byExercise.values()].map(
      (rows) => rows.reduce((s, x) => s + x, 0) / rows.length
    );
    const macro = means.reduce((s, x) => s + x, 0) / means.length;
    expect(nCases).toBe(648);
    expect(Math.round(macro * 1000) / 1000).toBe(0.054);
  });
});
