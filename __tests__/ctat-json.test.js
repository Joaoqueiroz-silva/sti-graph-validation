import { describe, it, expect } from "vitest";
import { editorJsonToHtml, looksLikeEditorJson } from "../ctat-json-to-html.js";

const tree = [
  { tagName: "meta", void: true, attributes: { charset: "utf-8" } },
  { tagName: "title", type: "text", components: [{ type: "textnode", content: "6.17" }] },
  { tagName: "link", void: true, attributes: { rel: "stylesheet", href: "Assets/6.17.css" } },
  {
    tagName: "main",
    classes: [{ name: "CTATTutor" }],
    components: [
      {
        tagName: "section",
        classes: [{ name: "CTATProblem" }],
        attributes: { id: "iiflk" },
        components: [
          {
            type: "text",
            content: "<span>Quanto é 2/4?</span>",
            classes: [{ name: "CTATTextField" }],
            attributes: { id: "io6uy" },
          },
        ],
      },
      { type: "CTATDoneButton", classes: [{ name: "CTATDoneButton" }] },
    ],
  },
];

describe("editorJsonToHtml", () => {
  it("reconstrói o HTML da árvore do editor", () => {
    const html = editorJsonToHtml(tree);
    expect(html).toContain("<title>6.17</title>");
    expect(html).toContain('class="CTATTutor"');
    expect(html).toContain(
      '<div class="CTATTextField" id="io6uy"><span>Quanto é 2/4?</span></div>'
    );
    expect(html).toContain('class="CTATDoneButton"');
    expect(html).toMatch(/<link[^>]*Assets\/6\.17\.css/);
  });

  it("separa head (meta/title/link) do body", () => {
    const head = editorJsonToHtml(tree).split("<body>")[0];
    expect(head).toContain("<title>");
    expect(head).toContain("<meta");
  });
});

describe("looksLikeEditorJson", () => {
  it("detecta a árvore do editor", () => {
    expect(looksLikeEditorJson(tree)).toBe(true);
  });
  it("rejeita o que não é árvore do editor", () => {
    expect(looksLikeEditorJson([{ foo: 1 }])).toBe(false);
    expect(looksLikeEditorJson({ steps: [] })).toBe(false); // grafo neutro
    expect(looksLikeEditorJson("nope")).toBe(false);
    expect(looksLikeEditorJson([])).toBe(false);
  });
});
