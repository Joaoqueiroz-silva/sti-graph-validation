import { describe, expect, it } from "vitest";
import { validateArticleV6 } from "../analysis/validate-article-v6.mjs";

describe("consistência do artigo v6", () => {
  it("confere as afirmações centrais com os derivados canônicos sem rede", () => {
    expect(validateArticleV6()).toMatchObject({
      status: "ok",
      externalCalls: 0,
    });
  });
});
