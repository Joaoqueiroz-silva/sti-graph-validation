/**
 * envelope-independence.test.mjs — W1/G4: o Envelope A v2 é INDEPENDENTE do grafo.
 *
 * O parecer externo apontou que o Envelope A v1 derivava do MESMO `.brd` que contém
 * o grafo do especialista. Esta suíte trava a propriedade central do v2: o envelope
 * é construído SÓ de `_interface/` + answer-key (mass production), e portanto
 * (a) funciona sem nenhum `.brd`, (b) é insensível a mutações nos `.brd` (metamórfico),
 * (c) não absorve um canário injetado no `.brd`, (d) o módulo nem menciona o parser
 * do grafo, (e) não vaza campos proibidos e (f) concorda com o gabarito antigo.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildEnvelopeA2, buildAllEnvelopesA2 } from "../interface-input.js";
// findLeaksInRobotInput só pode ser importado AQUI (no teste) — nunca em interface-input.js.
import { findLeaksInRobotInput } from "../parse-ctat-brd.js";
import { canonAnswer } from "../schema.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const CORPUS = path.join(ROOT, "cases/ctat-6.17");
const ANSWER_KEY = path.join(ROOT, "answer-key/frac-numberline-6.17.json");
const DATASET_PROBLEMS = path.join(ROOT, "datasets/frac-numberline-6.17/problems");

const tmpdirs = [];
function mkTmp(prefix) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpdirs.push(d);
  return d;
}
afterAll(() => {
  for (const d of tmpdirs) fs.rmSync(d, { recursive: true, force: true });
});

/** Lista recursiva de arquivos sob um diretório. */
function listFiles(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listFiles(p, acc);
    else acc.push(p);
  }
  return acc;
}

/** Cópia do corpus real (24 problemas + _interface) para um tmpdir. */
function copyCorpus(prefix) {
  const dst = path.join(mkTmp(prefix), "ctat-6.17");
  fs.cpSync(CORPUS, dst, { recursive: true });
  return dst;
}

describe("a) SEM REFERÊNCIA — constrói sem NENHUM .brd no disco", () => {
  let root;
  beforeAll(() => {
    // Estrutura mínima: só _interface/ + answer-key. Nenhum expert.brd em lugar algum.
    root = mkTmp("env-a2-sem-brd-");
    fs.mkdirSync(path.join(root, "corpus/_interface"), { recursive: true });
    fs.copyFileSync(
      path.join(CORPUS, "_interface/interface.html"),
      path.join(root, "corpus/_interface/interface.html")
    );
    fs.copyFileSync(ANSWER_KEY, path.join(root, "answer-key.json"));
  });

  it("o tmpdir realmente não contém nenhum .brd (pré-condição do teste)", () => {
    const brds = listFiles(root).filter((f) => f.endsWith(".brd"));
    expect(brds).toEqual([]);
  });

  it("buildEnvelopeA2 monta o envelope completo só com _interface/ + answer-key", () => {
    const env = buildEnvelopeA2({
      exerciseId: "01watermelon",
      interfaceDir: path.join(root, "corpus/_interface"),
      answerKeyPath: path.join(root, "answer-key.json"),
    });
    expect(env.schemaVersion).toBe("envelope-a-v2");
    expect(env.id).toBe("01watermelon");
    expect(env.problem).toMatch(/watermelon/i);
    expect(env.correctAnswer).toBe("1/4");
    expect(env.screenshotPath).toBe("_interface/screenshot.png");
    // componentes: campos do HTML + botões + a reta numérica da config
    const names = env.components.map((c) => c.name);
    expect(names).toContain("numline");
    expect(names).toContain("done");
    expect(names).toContain("hint");
    for (const c of env.components) {
      expect(c.name).toBeTruthy();
      expect(c.type).toBeTruthy();
      expect(c.affordance).toBeTruthy();
      // aliases exigidos pelo vocabulário de simulate-students (c.id/c.label)
      expect(c.id).toBe(c.name);
    }
    // SEM knowledgeComponents (decisão registrada no módulo)
    expect(env).not.toHaveProperty("knowledgeComponents");
  });
});

describe("b) METAMÓRFICO — mutar os .brd não muda NENHUM byte dos envelopes", () => {
  it("24 envelopes idênticos byte a byte antes e depois de destruir os .brd", () => {
    const before = buildAllEnvelopesA2(CORPUS);
    expect(before).toHaveLength(24);

    // Cópia do corpus com TODOS os expert.brd sobrescritos (arestas buggy, dicas e
    // mensagens somem — vira um XML mínimo sem nada do grafo original).
    const mutated = copyCorpus("env-a2-metamorfico-");
    const brds = listFiles(mutated).filter((f) => f.endsWith(".brd"));
    expect(brds).toHaveLength(24);
    for (const f of brds) {
      fs.writeFileSync(f, '<stateGraph startStateNodeName="mutado"></stateGraph>\n');
    }

    const after = buildAllEnvelopesA2(mutated);
    expect(after).toHaveLength(24);
    for (let i = 0; i < before.length; i++) {
      expect(JSON.stringify(after[i])).toBe(JSON.stringify(before[i]));
    }
  });
});

describe("c) CANÁRIO — marcador plantado no .brd não aparece no envelope", () => {
  it("CANARIO_XYZZY_2026 escrito no expert.brd não vaza para JSON.stringify(envelope)", () => {
    const corpus = copyCorpus("env-a2-canario-");
    const brd = path.join(corpus, "01watermelon/expert.brd");
    fs.writeFileSync(
      brd,
      fs.readFileSync(brd, "utf8").replace("</stateGraph>", "CANARIO_XYZZY_2026</stateGraph>")
    );
    expect(fs.readFileSync(brd, "utf8")).toContain("CANARIO_XYZZY_2026"); // pré-condição

    const env = buildEnvelopeA2({
      exerciseId: "01watermelon",
      interfaceDir: path.join(corpus, "_interface"),
    });
    expect(JSON.stringify(env)).not.toContain("CANARIO_XYZZY_2026");

    // e nos 24, via buildAllEnvelopesA2 sobre o corpus com canário
    for (const e of buildAllEnvelopesA2(corpus)) {
      expect(JSON.stringify(e)).not.toContain("CANARIO_XYZZY_2026");
    }
  });
});

describe("d) DEPENDÊNCIA — o fonte de interface-input.js não toca o parser do grafo", () => {
  it('não contém "parse-ctat-brd" nem ".brd" fora de comentários', () => {
    const src = fs.readFileSync(path.join(ROOT, "interface-input.js"), "utf8");
    const semComentarios = src
      .replace(/\/\*[\s\S]*?\*\//g, "") // blocos /* ... */
      .replace(/\/\/[^\n]*/g, ""); // linhas // ...
    expect(semComentarios).not.toContain("parse-ctat-brd");
    expect(semComentarios).not.toContain(".brd");
  });
});

describe("e) CAMPOS PROIBIDOS — findLeaksInRobotInput vazio nos 24 envelopes v2", () => {
  it("nenhum envelope v2 contém chaves do envelope de comparação", () => {
    const envelopes = buildAllEnvelopesA2(CORPUS);
    expect(envelopes).toHaveLength(24);
    for (const env of envelopes) {
      expect(findLeaksInRobotInput(env), `vazamento em ${env.id}`).toEqual([]);
    }
  });
});

describe("f) GABARITO CONFERE — fonte independente concorda com o meta.json antigo", () => {
  it("canonAnswer(correctAnswer) do v2 = canonAnswer do meta.json, nos 24", () => {
    const envelopes = buildAllEnvelopesA2(CORPUS);
    expect(envelopes).toHaveLength(24);
    for (const env of envelopes) {
      const meta = JSON.parse(
        fs.readFileSync(path.join(DATASET_PROBLEMS, env.id, "meta.json"), "utf8")
      );
      expect(canonAnswer(env.correctAnswer), `âncora divergente em ${env.id}`).toBe(
        canonAnswer(meta.correctAnswer)
      );
    }
  });
});
