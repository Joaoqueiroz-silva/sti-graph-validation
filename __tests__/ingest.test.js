import { describe, it, expect } from "vitest";
import { ingestCtatHtml } from "../ingest-ctat-html.js";

const HTML = `<!doctype html><html><body>
  <div id="problem-statement">Resolva: 27 + 15 = ?</div>
  <label for="ans_units">Unidades</label><input id="ans_units" type="text">
  <label for="ans_final">Resultado</label><input id="ans_final" type="text">
  <input type="hidden" id="pid" value="x">
  <button id="done" type="submit">Conferir</button>
</body></html>`;

describe("ingestCtatHtml", () => {
  it("extrai o enunciado pelo elemento com id de problema", () => {
    const iface = ingestCtatHtml(HTML);
    expect(iface.problem).toContain("27 + 15");
  });

  it("extrai os componentes interativos com id e tipo", () => {
    const iface = ingestCtatHtml(HTML);
    const ids = iface.components.map((c) => c.id);
    expect(ids).toContain("ans_units");
    expect(ids).toContain("ans_final");
    expect(ids).toContain("done");
  });

  it("ignora inputs hidden/submit", () => {
    const iface = ingestCtatHtml(HTML);
    expect(iface.components.map((c) => c.id)).not.toContain("pid");
  });

  it("pega o rótulo via <label for>", () => {
    const iface = ingestCtatHtml(HTML);
    const u = iface.components.find((c) => c.id === "ans_units");
    expect(u.label).toBe("Unidades");
  });

  it("overrides sobrescrevem o detectado", () => {
    const iface = ingestCtatHtml(HTML, {
      problem: "Outro",
      correctAnswer: "42",
      difficulty: "hard",
    });
    expect(iface.problem).toBe("Outro");
    expect(iface.correctAnswer).toBe("42");
    expect(iface.difficulty).toBe("hard");
  });

  it("lança em HTML vazio", () => {
    expect(() => ingestCtatHtml("")).toThrow();
  });

  it("reconhece componentes CTAT (divs com classe CTATxxx) e o enunciado da seção CTATProblem", () => {
    const ctat = `<main class="CTATTutor">
      <section class="CTATProblem"><div class="CTATTextField" id="io1"><span>Quanto é 2/4 simplificado?</span></div></section>
      <div class="CTATDoneButton"></div><div class="CTATHintButton"></div>
      <div class="CTATHintWindow"></div></main>`;
    const iface = ingestCtatHtml(ctat);
    expect(iface.components.map((c) => c.id)).toContain("io1");
    expect(iface.components.map((c) => c.type)).toContain("button"); // Done/Hint
    expect(iface.components.find((c) => /hintwindow/i.test(c.id))).toBeUndefined(); // layout, não é componente
    expect(iface.problem).toContain("2/4");
  });
});
