import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { validateArticleV7 } from "../analysis/validate-article-v7.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEX = path.resolve(
  HERE,
  "..",
  "docs",
  "manuscript",
  "v7.0",
  "artigo-validacao-agentes-comportamentais-v7.0.tex"
);

const tmpFiles = [];
/** Grava uma cópia mutada do .tex no mesmo diretório (figuras resolvem igual). */
function mutatedCopy(mutate, name) {
  const texPath = path.join(path.dirname(TEX), `.mutation-${name}.tex`);
  fs.writeFileSync(texPath, mutate(fs.readFileSync(TEX, "utf8")));
  tmpFiles.push(texPath);
  return texPath;
}

afterEach(() => {
  while (tmpFiles.length) fs.rmSync(tmpFiles.pop(), { force: true });
});

describe("consistência do artigo v7 (experimento final)", () => {
  it("confere os números do experimento final, a previsão offline e o baseline citado contra os artefatos canônicos, sem rede", () => {
    expect(validateArticleV7()).toMatchObject({
      status: "ok",
      externalCalls: 0,
    });
  });

  it("mutation: corromper a completude conceitual 0,913 derruba a validação", () => {
    const texPath = mutatedCopy(
      (tex) => tex.replaceAll("0,913", "0,914"),
      "completude"
    );
    expect(() => validateArticleV7({ texPath })).toThrowError(
      /Completude conceitual|completude conceitual/
    );
  });

  it("mutation: corromper o F1 previsto 0,609 derruba a validação", () => {
    const texPath = mutatedCopy((tex) => tex.replaceAll("0,609", "0,619"), "previsao");
    expect(() => validateArticleV7({ texPath })).toThrowError(/F1 previsto|previsão/);
  });

  it("mutation: um travessão inserido em linha de prosa derruba a validação", () => {
    const texPath = mutatedCopy(
      (tex) =>
        tex.replace(
          "O compromisso metodológico central do estudo é prever antes de medir.",
          "O compromisso metodológico central do estudo — prever antes de medir."
        ),
      "travessao"
    );
    expect(() => validateArticleV7({ texPath })).toThrowError(/travessão proibido/);
  });

  it('mutation: o ligature "---" também é rejeitado', () => {
    const texPath = mutatedCopy(
      (tex) =>
        tex.replace(
          "com o comparador congelado, e o desfecho",
          "com o comparador congelado --- e o desfecho"
        ),
      "ligature"
    );
    expect(() => validateArticleV7({ texPath })).toThrowError(/travessão proibido/);
  });
});
