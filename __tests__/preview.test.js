import { describe, it, expect } from "vitest";
import { buildPreviewHtml, assetKey } from "../preview-html.js";

describe("assetKey", () => {
  it("basename minúsculo sem query/pasta", () => {
    expect(assetKey("Assets/6.17.CSS?v=2")).toBe("6.17.css");
  });
});

describe("buildPreviewHtml", () => {
  it("remove scripts (pro conteúdo estático aparecer)", () => {
    const out = buildPreviewHtml("<div>enunciado</div><script>document.body.innerHTML=''</script>");
    expect(out).not.toMatch(/<script/i);
    expect(out).toContain("enunciado");
  });

  it("mantém scripts quando keepScripts=true", () => {
    const out = buildPreviewHtml("<div>x</div><script>var a=1</script>", {}, { keepScripts: true });
    expect(out).toMatch(/<script/i);
  });

  it("mantém link de CDN (http) intacto", () => {
    const out = buildPreviewHtml('<link rel="stylesheet" href="https://cdn.x/CTAT.css">');
    expect(out).toContain("https://cdn.x/CTAT.css");
  });

  it("inline link de CSS local como <style>", () => {
    const out = buildPreviewHtml('<link rel="stylesheet" href="Assets/6.17.css">', {
      "6.17.css": { content: Buffer.from(".x{color:red}") },
    });
    expect(out).toContain("<style>.x{color:red}</style>");
    expect(out).not.toMatch(/<link/i);
  });

  it("inline imagem local como data URI", () => {
    const out = buildPreviewHtml('<img src="Assets/figura.png">', {
      "figura.png": { content: Buffer.from([1, 2, 3]) },
    });
    expect(out).toMatch(/src="data:image\/png;base64,/);
  });

  it("sem o asset, deixa o caminho local como está (não quebra)", () => {
    const out = buildPreviewHtml('<img src="Assets/sem.png">');
    expect(out).toContain('src="Assets/sem.png"');
  });
});
