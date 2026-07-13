/**
 * schema-v2.test.mjs — schema neutro v2: parse do corpus, coerência v2→v1 e round-trip (gate G5).
 *
 * O que este arquivo trava (Onda 2, 2026-07-12):
 *   1. os 24 expert.brd do corpus CTAT 6.17 parseiam SEM erro para o v2 completo;
 *   2. unsupportedConstructs é ESTÁVEL e documentado (snapshot): só EdgesGroups/group/link,
 *      as restrições de ordem de travessia que o executor mínimo não honra;
 *   3. COERÊNCIA v2→v1: neutralV2ToLegacy(parseBrdToNeutralV2(x)) reproduz
 *      parseBrdToExpertNeutral(x) nos campos comuns (mesmos miscKeys, mesmos passos,
 *      mesmo backbone, mesmas dicas e skills) — a prova de que o v2 é um SUPERconjunto;
 *   4. round-trip serializeV2→parseV2 idêntico e serialização ESTÁVEL (independe da
 *      ordem de inserção das chaves — é o que permite usar o texto como hash).
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { miscKey } from "../schema.js";
import { parseBrdToExpertNeutral } from "../parse-ctat-brd.js";
import { parseBrdToNeutralV2, neutralV2ToLegacy, serializeV2, parseV2 } from "../schema-v2.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CASES_DIR = path.join(HERE, "../cases/ctat-6.17");
const CASES = fs
  .readdirSync(CASES_DIR)
  .filter((d) => fs.existsSync(path.join(CASES_DIR, d, "expert.brd")))
  .sort();

const readBrd = (c) => fs.readFileSync(path.join(CASES_DIR, c, "expert.brd"), "utf8");

describe("parseBrdToNeutralV2 — corpus CTAT 6.17 completo", () => {
  it("encontra os 24 exercícios do corpus", () => {
    expect(CASES).toHaveLength(24);
  });

  it("parseia os 24 expert.brd sem erro, com estados/transições íntegros", () => {
    for (const c of CASES) {
      const v2 = parseBrdToNeutralV2(readBrd(c), { case: c });
      expect(v2.schemaVersion).toBe(2);
      expect(v2.meta.source).toBe("ctat-brd");
      expect(v2.meta.case).toBe(c);
      expect(typeof v2.meta.problem).toBe("string");

      const stateIds = new Set(v2.states.map((s) => s.id));
      expect(v2.states.length).toBeGreaterThan(0);
      expect(stateIds.has(v2.startState)).toBe(true);
      expect(v2.finalStates.length).toBeGreaterThan(0);
      for (const f of v2.finalStates) expect(stateIds.has(f)).toBe(true);

      expect(v2.transitions.length).toBeGreaterThan(0);
      for (const t of v2.transitions) {
        expect(stateIds.has(t.from)).toBe(true);
        expect(stateIds.has(t.to)).toBe(true);
        expect(t.sai).toEqual({
          selection: expect.any(String),
          action: expect.any(String),
          input: expect.any(String),
        });
        expect(["correct", "buggy", "unknown"]).toContain(t.type);
        expect(["exact", "semantic"]).toContain(t.matchRule);
        expect(Array.isArray(t.hints)).toBe(true);
        expect(Array.isArray(t.kcs)).toBe(true);
      }
    }
  });

  it("o corpus 6.17 é uniforme: 16 transições por grafo, 8 corretas / 8 buggy, 0 unknown", () => {
    for (const c of CASES) {
      const v2 = parseBrdToNeutralV2(readBrd(c));
      expect(v2.transitions).toHaveLength(16);
      expect(v2.transitions.filter((t) => t.type === "correct")).toHaveLength(8);
      expect(v2.transitions.filter((t) => t.type === "buggy")).toHaveLength(8);
      expect(v2.transitions.filter((t) => t.type === "unknown")).toHaveLength(0);
    }
  });

  it("01watermelon: startState topológico, estado final Done, actor/tutor e feedback preservados", () => {
    const v2 = parseBrdToNeutralV2(readBrd("01watermelon"));
    // raiz topológica = nó 1 (o atributo startStateNodeName aponta pro MEIO do grafo — ver
    // decisão datada em schema-v2.js); o declarado fica preservado em meta.
    expect(v2.startState).toBe("1");
    expect(v2.meta.startStateNodeName).toBe("showFrac");
    expect(v2.finalStates).toEqual(["4"]);

    // arestas tutor-performed de setup (1→23→24→14) entram com actor Tutor
    const tutorEdges = v2.transitions.filter((t) => /tutor/i.test(t.actor));
    expect(tutorEdges.length).toBe(3);

    // toda transição buggy carrega o buggyMessage como feedback (neste exercício)
    for (const t of v2.transitions.filter((t) => t.type === "buggy")) {
      expect(t.feedback?.buggyMessage).toBeTruthy();
    }
    // e a correta da reta numérica tem successMessage + 4 níveis de dica + KC resolvido
    const numline = v2.transitions.find(
      (t) => t.type === "correct" && t.sai.selection === "numline" && t.sai.action === "AddPoint"
    );
    expect(numline.feedback.successMessage).toMatch(/bom trabalho/i);
    expect(numline.hints).toHaveLength(4);
    expect(numline.kcs).toEqual(["FindValueNumLine"]);
  });

  it("matchRule vem do matcher declarado no .brd: ExpressionMatcher=semantic, ExactMatcher=exact", () => {
    const v2 = parseBrdToNeutralV2(readBrd("01watermelon"));
    const numline = v2.transitions.find(
      (t) => t.type === "correct" && t.sai.selection === "numline" && t.sai.action === "AddPoint"
    );
    expect(numline.matchRule).toBe("semantic"); // equals(algEval(input), algEval(showAnswer))
    const f1 = v2.transitions.find((t) => t.type === "correct" && t.sai.selection === "F1");
    expect(f1.matchRule).toBe("exact"); // ExactMatcher
  });

  it("carrega o catálogo global de KCs (productionRule) com dicas", () => {
    const v2 = parseBrdToNeutralV2(readBrd("01watermelon"));
    expect(v2.skills.map((s) => s.ruleName)).toContain("IdenDenominator");
    expect(v2.skills.some((s) => s.hints.length > 0)).toBe(true);
  });
});

describe("unsupportedConstructs — inventário estável do que o v2 NÃO representa", () => {
  // Único construto não representado no corpus: EdgesGroups/group/link (ordem de travessia).
  const KNOWN_UNSUPPORTED = new Set(["EdgesGroups", "group", "link"]);

  it("é estável nos 24 exercícios (snapshot) e não contém construto fora do documentado", () => {
    const byCase = {};
    for (const c of CASES) {
      const v2 = parseBrdToNeutralV2(readBrd(c));
      byCase[c] = v2.unsupportedConstructs;
      // qualquer tag NOVA no XML fora do mapeado/documentado quebra aqui, de propósito
      for (const u of v2.unsupportedConstructs) expect(KNOWN_UNSUPPORTED.has(u)).toBe(true);
      // e a lista sai ordenada (determinismo p/ hash)
      expect(v2.unsupportedConstructs).toEqual([...v2.unsupportedConstructs].sort());
    }
    expect(byCase).toMatchSnapshot();
  });
});

describe("COERÊNCIA v2→v1 — o v2 é um SUPERconjunto do schema neutro v1", () => {
  it("neutralV2ToLegacy(parseBrdToNeutralV2(x)) ≡ parseBrdToExpertNeutral(x) nos 24 exercícios", () => {
    for (const c of CASES) {
      const xml = readBrd(c);
      const v1 = parseBrdToExpertNeutral(xml);
      const legacy = neutralV2ToLegacy(parseBrdToNeutralV2(xml));

      // mesmos passos (resposta, ordem e chave canônica)
      expect(legacy.steps).toEqual(v1.steps);
      // mesmas misconceptions — inclusive os miscKeys (âncora objetiva do comparador)
      expect(legacy.misconceptions).toEqual(v1.misconceptions);
      expect(legacy.misconceptions.map(miscKey)).toEqual(v1.misconceptions.map(miscKey));
      // mesmo backbone START→…→GOAL
      expect(legacy.transitions).toEqual(v1.transitions);
      // mesmos metadados de inspeção (dicas por passo correto e skills/KCs)
      expect(legacy.hintsPerCorrectStep).toEqual(v1.hintsPerCorrectStep);
      expect(legacy.skills).toEqual(v1.skills);
      // mesmo problema
      expect(legacy.meta.problem).toBe(v1.meta.problem);
    }
  });

  it("rejeita entrada que não é v2", () => {
    expect(() => neutralV2ToLegacy({ schemaVersion: 1 })).toThrow(/schemaVersion 2/);
  });
});

describe("round-trip serializeV2 → parseV2", () => {
  it("parseV2(serializeV2(v2)) é idêntico ao v2 original, nos 24 exercícios", () => {
    for (const c of CASES) {
      const v2 = parseBrdToNeutralV2(readBrd(c), { case: c });
      const json = serializeV2(v2);
      expect(parseV2(json)).toEqual(v2);
      // e serializar de novo dá o MESMO texto (estável p/ hash)
      expect(serializeV2(parseV2(json))).toBe(json);
    }
  });

  it("a serialização é ESTÁVEL: independe da ordem de inserção das chaves", () => {
    const v2 = parseBrdToNeutralV2(readBrd("01watermelon"));
    // clone com as chaves inseridas em ordem INVERSA em toda profundidade
    const reverseKeys = (v) => {
      if (Array.isArray(v)) return v.map(reverseKeys);
      if (v && typeof v === "object") {
        const out = {};
        for (const k of Object.keys(v).sort().reverse()) out[k] = reverseKeys(v[k]);
        return out;
      }
      return v;
    };
    expect(serializeV2(reverseKeys(v2))).toBe(serializeV2(v2));
  });

  it("parseV2 rejeita JSON que não é um grafo v2", () => {
    expect(() => parseV2(JSON.stringify({ schemaVersion: 1 }))).toThrow(/schemaVersion/);
    expect(() => parseV2('"não é objeto"')).toThrow(/schemaVersion/);
    expect(() => serializeV2({ schemaVersion: 1 })).toThrow(/schemaVersion 2/);
  });
});
