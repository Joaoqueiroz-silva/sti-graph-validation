import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  COTAS_POR_ESTRATO,
  GATES,
  JUIZES_CONGELADOS,
  construirControlesFixos,
  construirFrameDeResultados,
  criarEnvelopeCego,
  selecionarAmostraEstratificada,
  prepararPlanoPainel,
  validarJulgamento,
  avaliarGateJuiz,
  krippendorffAlphaNominal,
  consolidarPainel,
  estimarOrcamentoPainel,
} from "../analysis/orientador-v08/painel-automatizado.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const item = ({
  id,
  kind = "feedback_erro",
  corpus = "6.17",
  model = "google/model-a",
  policy = "somente-enunciado-v1",
  exercise = `ex-${id}`,
  replica = 1,
} = {}) => ({
  itemId: id,
  kind,
  stratum: { corpus, generatorModel: model, inputPolicy: policy },
  clusterKey: `${corpus}:${model}:${policy}:${exercise}:r${replica}`,
  exercise,
  replica,
  payload: kind === "feedback_erro"
    ? { problem: "Calcule 2+3.", correctAnswer: "5", state: "somar", wrongAnswer: "4", feedback: "Revise a soma." }
    : kind === "escada_dicas"
      ? { problem: "Calcule 2+3.", correctAnswer: "5", state: "somar", hints: ["Qual operação?", "Some 2 e 3."] }
      : { problem: "Calcule 2+3.", correctAnswer: "5", state: "somar", candidate: { value: "4" } },
});

describe("amostragem prospectiva, estratificada e sem seleção por resultado", () => {
  it("é determinística, respeita cota e admite no máximo um item por cluster/subtipo", () => {
    const frame = [];
    for (let i = 0; i < 8; i++) frame.push(item({ id: `f${i}`, exercise: `ex${Math.floor(i / 2)}` }));
    const a = selecionarAmostraEstratificada(frame);
    const b = selecionarAmostraEstratificada(frame.slice().reverse());
    expect(a.sampled.map((x) => x.itemId)).toEqual(b.sampled.map((x) => x.itemId));
    expect(a.sampled).toHaveLength(COTAS_POR_ESTRATO.feedback_erro);
    expect(new Set(a.sampled.map((x) => x.clusterKey)).size).toBe(a.sampled.length);
    expect(a.cells[0]).toMatchObject({ availableItems: 8, availableClusters: 4, target: 4, selected: 4, shortfall: 0 });
  });

  it("não toma itens de outro estrato para esconder célula escassa", () => {
    const frame = [
      item({ id: "a", corpus: "6.17" }),
      ...Array.from({ length: 6 }, (_, i) => item({ id: `b${i}`, corpus: "6.18" })),
    ];
    const out = selecionarAmostraEstratificada(frame);
    const scarce = out.cells.find((x) => x.stratum.startsWith("6.17::"));
    expect(scarce).toMatchObject({ selected: 1, target: 4, shortfall: 3 });
    expect(out.shortfallCells).toHaveLength(1);
  });

  it("rejeita item duplicado ou incompleto", () => {
    const x = item({ id: "dup" });
    expect(() => selecionarAmostraEstratificada([x, x])).toThrow(/duplicado/);
    expect(() => selecionarAmostraEstratificada([{ ...x, payload: { problem: "P" } }])).toThrow(/feedback vazio/);
  });
});

describe("frame e cegamento", () => {
  it("extrai feedback, escada e quatro classes de extras sem deduplicar ocorrências", () => {
    const registro = {
      exercicio: "ex1",
      replica: 2,
      politicaInput: { id: "somente-enunciado-v1" },
      modelos: { porAgente: { estudantes: "google/gemini" } },
    };
    const atom = {
      id: "n1",
      description: "somar",
      errors: [{ rawValue: "4", feedback: "Revise a soma." }],
      hints: [{ texto: "Qual operação?" }, { texto: "Some os termos." }],
    };
    const extrasLedger = ["state", "edge", "error", "hint"].map((type, i) => ({
      occurrenceId: `o${i}`, type, isExtra: true, value: String(i), text: `t${i}`,
    }));
    const frame = construirFrameDeResultados([{
      registro,
      analise: { metadata: { corpus: "6.17", exercise: "ex1", replica: 2 }, atoms: { materialized: [atom] }, extrasLedger },
      problem: "Calcule 2+3.",
      correctAnswer: "5",
    }]);
    expect(frame.map((x) => x.kind).sort()).toEqual([
      "escada_dicas", "extra_caminho", "extra_dica", "extra_erro", "extra_estado", "feedback_erro",
    ]);
    expect(new Set(frame.map((x) => x.clusterKey))).toHaveLength(1);
  });

  it("envelope não expõe braço, modelo, réplica, origem nem rótulo do controle", () => {
    const source = {
      ...item({ id: "blind" }),
      source: "agent6",
      control: { expectedAccept: true },
      secret: "modelo-secreto",
    };
    const envelope = criarEnvelopeCego(source);
    const serialized = JSON.stringify(envelope);
    expect(serialized).not.toContain("google/model-a");
    expect(serialized).not.toContain("somente-enunciado-v1");
    expect(serialized).not.toContain("agent6");
    expect(serialized).not.toContain("expectedAccept");
    expect(envelope.blindId).toMatch(/^[a-f0-9]{24}$/);

    const extra = item({ id: "blind-extra", kind: "extra_erro" });
    extra.payload.candidate = {
      wrongAnswer: "4",
      explanation: "somou errado",
      source: "agent6",
      nested: { generatorModel: "segredo" },
    };
    const extraSerialized = JSON.stringify(criarEnvelopeCego(extra));
    expect(extraSerialized).toContain("somou errado");
    expect(extraSerialized).not.toContain("agent6");
    expect(extraSerialized).not.toContain("segredo");
  });
});

describe("controles e rubricas fechadas", () => {
  it("congela 60 controles balanceados nos dois domínios", () => {
    const controls = construirControlesFixos();
    expect(controls).toHaveLength(60);
    const count = (domain, expected) => controls.filter((x) =>
      x.control.domain === domain && x.control.expectedAccept === expected,
    ).length;
    expect(count("feedback", true)).toBe(10);
    expect(count("feedback", false)).toBe(10);
    expect(count("extras", true)).toBe(20);
    expect(count("extras", false)).toBe(20);
  });

  it("feedback é decidido pela regra e campo accept fornecido pelo juiz invalida o schema", () => {
    const envelope = criarEnvelopeCego(item({ id: "rubrica" }));
    const ok = validarJulgamento(envelope, {
      scores: { specificity: 2, progression: 1, actionability: 2, mathematicalCorrectness: 2, prematureAnswerReveal: 0 },
      primaryFailure: "none",
      rationale: "adequado",
    });
    expect(ok.accept).toBe(true);
    const fail = validarJulgamento(envelope, {
      scores: { specificity: 2, progression: 1, actionability: 2, mathematicalCorrectness: 0, prematureAnswerReveal: 0 },
      primaryFailure: "mathematical_error",
      rationale: "contraditório",
    });
    expect(fail.accept).toBe(false);
    expect(() => validarJulgamento(envelope, {
      scores: { specificity: 2, progression: 1, actionability: 2, mathematicalCorrectness: 2, prematureAnswerReveal: 0 },
      primaryFailure: "none",
      rationale: "adequado",
      accept: true,
    })).toThrow(/exatamente/);
    expect(() => validarJulgamento(envelope, {
      scores: { specificity: 3, progression: 1, actionability: 2, mathematicalCorrectness: 2, prematureAnswerReveal: 0 },
      primaryFailure: "none",
      rationale: "valor inválido",
    })).toThrow(/0, 1 ou 2/);
  });

  it("extra só é aceito em categoria fechada, contextual e matematicamente consistente", () => {
    const envelope = criarEnvelopeCego(item({ id: "extra", kind: "extra_erro" }));
    expect(validarJulgamento(envelope, {
      category: "plausible_student_error", contextual: true, mathematicallyConsistent: true, rationale: "plausível",
    }).accept).toBe(true);
    expect(validarJulgamento(envelope, {
      category: "plausible_student_error", contextual: false, mathematicallyConsistent: true, rationale: "fora",
    }).accept).toBe(false);
    expect(() => validarJulgamento(envelope, {
      category: "inventada", contextual: true, mathematicallyConsistent: true,
      rationale: "categoria inválida",
    })).toThrow(/category inválido/);
  });
});

describe("gates, maioria e confiabilidade", () => {
  const frame = [
    item({ id: "f-study" }),
    item({ id: "h-study", kind: "escada_dicas", exercise: "h" }),
    item({ id: "e-study", kind: "extra_erro", exercise: "e" }),
    item({ id: "s-study", kind: "extra_estado", exercise: "s" }),
  ];

  function perfect(plan, flipControls = false) {
    return plan.items.map((entry) => ({
      blindId: entry.envelope.blindId,
      valid: true,
      result: {
        accept: entry.control
          ? (flipControls ? !entry.control.expectedAccept : entry.control.expectedAccept)
          : ["feedback_erro", "extra_erro"].includes(entry.kind),
      },
    }));
  }

  it("Krippendorff alpha nominal trata acordo perfeito e valores ausentes", () => {
    expect(krippendorffAlphaNominal([[true, true, true], [false, false, false]])).toBe(1);
    expect(krippendorffAlphaNominal([[true, true, null], [false, false, false]])).toBe(1);
    expect(krippendorffAlphaNominal([[true, true, true], [true, true, true]])).toBeNull();
    const discordant = krippendorffAlphaNominal([[true, false, true], [false, true, false]]);
    expect(discordant).toBeLessThan(0);
  });

  it("aprova somente juiz que passa formato e controles por domínio", () => {
    const plan = prepararPlanoPainel(frame);
    const good = perfect(plan);
    const gate = avaliarGateJuiz(plan, good, "good");
    expect(gate.approved).toBe(true);
    expect(gate.validFormatRate).toBe(1);
    expect(gate.domains.feedback.positiveAcceptance).toBe(1);
    expect(gate.domains.extras.negativeRejection).toBe(1);
    const bad = avaliarGateJuiz(plan, perfect(plan, true), "bad");
    expect(bad.approved).toBe(false);
    expect(() => avaliarGateJuiz(plan, [...good, good[0]], "duplicado")).toThrow(/duplicado/);
  });

  it("exige dois juízes aprovados e alpha >= 0,667 em feedback e extras", () => {
    const plan = prepararPlanoPainel(frame);
    const judgments = Object.fromEntries(JUIZES_CONGELADOS.map((j, i) => [
      j.id,
      perfect(plan, i === 2),
    ]));
    const summary = consolidarPainel(plan, judgments);
    expect(summary.approvedJudges).toHaveLength(2);
    expect(summary.reliability.feedback).toBe(1);
    expect(summary.reliability.extras).toBe(1);
    expect(summary.panelGate).toBe(true);
    expect(summary.interpretation).toBe("exploratory_automated_evidence_only");
    expect(summary.evidenceLabel).toMatch(/não é validação pedagógica/);
  });

  it("limiares mínimos permanecem congelados", () => {
    expect(GATES).toMatchObject({
      validFormatRate: 0.99,
      positiveControlAcceptance: 0.8,
      negativeControlRejection: 0.8,
      minApprovedJudges: 2,
      alphaTentative: 0.667,
      alphaReliable: 0.8,
    });
  });
});

describe("orçamento separado e dry-run", () => {
  it("dimensiona 33 estratos (CTAT + clean-room), 528 itens de estudo e teto separado", () => {
    const budget = estimarOrcamentoPainel();
    expect(budget).toMatchObject({
      studyItems: 528,
      controlItems: 60,
      totalItemsPerJudge: 588,
      judges: 3,
      primaryCalls: 1764,
      maxCalls: 3528,
      attempts: 2,
      expectedUsd: 10.58,
      reservedWorstCaseUsd: 52.92,
      recommendedHardCapUsd: 60,
    });
  });

  it("congela três famílias distintas e ordens próprias sobre o mesmo conjunto", () => {
    expect(new Set(JUIZES_CONGELADOS.map((x) => x.family)).size).toBe(3);
    const frame = Array.from({ length: 5 }, (_, i) => item({ id: `ordem-${i}` }));
    const a = prepararPlanoPainel(frame);
    const b = prepararPlanoPainel(frame.slice().reverse());
    expect(a.planSha256).toBe(b.planSha256);
    const orders = Object.values(a.orders);
    expect(orders[1].slice().sort()).toEqual(orders[0].slice().sort());
    expect(orders[2].slice().sort()).toEqual(orders[0].slice().sort());
    expect(orders[1]).not.toEqual(orders[0]);
  });

  it("CLI padrão faz apenas plano e recusa flag de execução paga", () => {
    const cli = path.join(repo, "scripts/painel-automatizado-v08.mjs");
    const dry = spawnSync(process.execPath, [cli, "--plano"], { cwd: repo, encoding: "utf8" });
    expect(dry.status).toBe(0);
    expect(dry.stdout).toContain("chamadas de rede: 0 · chamadas pagas: 0");
    const paid = spawnSync(process.execPath, [cli, "--executar"], { cwd: repo, encoding: "utf8" });
    expect(paid.status).toBe(1);
    expect(paid.stderr).toMatch(/somente offline/);
  });
});
