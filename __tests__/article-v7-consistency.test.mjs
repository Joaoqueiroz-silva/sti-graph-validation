import { describe, expect, it } from "vitest";
import { validateArticleV7 } from "../analysis/validate-article-v7.mjs";

describe("consistência do artigo v7", () => {
  it("confere os números da Campanha 5 e as afirmações centrais com os derivados canônicos sem rede", () => {
    expect(validateArticleV7()).toMatchObject({
      status: "ok",
      externalCalls: 0,
    });
  });
});
