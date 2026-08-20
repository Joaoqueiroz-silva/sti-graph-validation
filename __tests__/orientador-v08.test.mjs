import { describe, expect, it } from "vitest";
import {
  analisarRegistro,
  alinharAtomos,
  alinharReguas,
  coberturaFamiliasAcao,
  extrairAtomosCtat,
  extrairAtomosMaterializados,
  extrairErrosCtat,
  extrairErrosMaterializados,
  familiaDeAcao,
  familiaDeInteracaoEstruturada,
  FAMILIAS_ACAO,
  medirDicasAncoradas,
  parearErrosUmParaUm,
} from "../analysis/orientador-v08/index.mjs";

const refBase = () => ({
  caminho: [
    {
      ordem: 1, selecao: "F1", acao: "UpdateTextField", bruto: "3", valor: "3",
      ator: "Student", sistema: false, mecanico: false, dicasTexto: ["Pense na parte"],
    },
    {
      ordem: 2, selecao: "setup", acao: "set_maximum", bruto: "10", valor: "10",
      ator: "Tutor", sistema: true, mecanico: false, dicasTexto: [],
    },
    {
      ordem: 3, selecao: "F2", acao: "UpdateTextField", bruto: "5", valor: "5",
      ator: "Student", sistema: false, mecanico: false, dicasTexto: ["Ache o todo", "Digite 5"],
    },
    {
      ordem: 4, selecao: "done", acao: "ButtonPressed", bruto: "-1", valor: "-1",
      ator: "Student", sistema: false, mecanico: true, dicasTexto: [],
    },
  ],
  items: [
    { passo: 0, componente: "F1", acao: "UpdateTextField", bruto: "5", valor: "5", devolutiva: "Inverteu." },
    { passo: 0, componente: "F1", acao: "UpdateTextField", bruto: "5", valor: "5", devolutiva: "Inverteu novamente." },
    { passo: 1, componente: "setup", acao: "set_maximum", bruto: "7", valor: "7", devolutiva: "Sem âncora avaliável." },
  ],
});

function node(id, value, expected = {}, over = {}) {
  return {
    id,
    type: "step",
    description: `Passo ${id}`,
    expectedInput: { value, componentId: "dynamic_spec", ...expected },
    knowledgeComponents: [],
    hints: [],
    misconceptions: [],
    scaffoldNodes: [],
    ...over,
  };
}

function runCom(nodes, edges = []) {
  return {
    exercicio: "ex",
    replica: 2,
    modelos: { perfil: "braco-a" },
    interfaceCtat: { componentes: [{ id: "F1" }, { id: "F2" }] },
    materializado: { behaviorGraph: { nodes, edges } },
  };
}

describe("átomos orientador v0.8", () => {
  it("preserva sourceIndex e remove sistema e sentinela sem perder a âncora CTAT", () => {
    const ref = refBase();
    const atoms = extrairAtomosCtat(ref);
    expect(atoms.map((a) => [a.sourceIndex, a.component, a.action, a.value])).toEqual([
      [0, "f1", "updatetextfield", "3"],
      [2, "f2", "updatetextfield", "5"],
    ]);
    const errors = extrairErrosCtat(ref, atoms);
    expect(errors[0].parentRefIndex).toBe(0);
    expect(errors[2].anchored).toBe(false);
  });

  it("classifica alvo exato, ação desconhecida, alvo ambíguo e composto não resolvido", () => {
    const refs = [
      { id: "r1", index: 0, component: "f1", action: "updatetextfield", value: "3" },
      { id: "r2", index: 1, component: "f2", action: "updatetextfield", value: "5" },
      { id: "r3", index: 2, component: "multi", action: "update", value: "1" },
      { id: "r4", index: 3, component: "multi", action: "buttonpressed", value: "2" },
    ];
    const nodes = [
      node("exact", "3", { componentProps: { composition: { elements: [{ targetField: "F1" }] } } }),
      node("unknown-action", "1", { config: { targetComponent: "multi" } }),
      node("ambiguous", "3", { config: { targetComponent: "F1", target: "F2" } }),
      node("composite", "5000,5000,25", { config: { targetComponent: ["F1", "F2"] } }),
    ];
    const atoms = extrairAtomosMaterializados(runCom(nodes), refs);
    expect(atoms[0]).toMatchObject({ status: "unknown_action", component: "f1", action: "" });
    expect(atoms[0].statuses).toEqual(expect.arrayContaining(["exact_target", "unknown_action"]));
    expect(atoms[0].actionResolution).toBe("unknown_action");
    expect(atoms[1].status).toBe("unknown_action");
    expect(atoms[1].statuses).toEqual(expect.arrayContaining(["exact_target", "unknown_action"]));
    expect(atoms[2]).toMatchObject({ status: "ambiguous_target", component: "" });
    expect(atoms[3]).toMatchObject({ status: "composite_unresolved", compositeUnresolved: true });
  });
});

describe("alinhamento hierárquico determinístico", () => {
  it("prefere a tripla exata posterior a um match apenas por valor e não reutiliza ocorrência", () => {
    const refs = [{ id: "r", index: 0, component: "f1", action: "update", value: "3" }];
    const agents = [
      { id: "a-value", index: 0, component: "", action: "", value: "3" },
      { id: "a-exact", index: 1, component: "f1", action: "update", value: "3" },
    ];
    const aligned = alinharAtomos(refs, agents);
    expect(aligned.matches).toEqual([
      expect.objectContaining({ refIndex: 0, agentIndex: 1, tier: 3 }),
    ]);
    expect(aligned.unmatchedMaterialized).toEqual([0]);
  });

  it("em empate exato escolhe a ocorrência materializada mais à esquerda", () => {
    const refs = [{ id: "r", index: 0, component: "f1", action: "update", value: "3" }];
    const agents = [0, 1].map((index) => ({ id: `a${index}`, index, component: "f1", action: "update", value: "3" }));
    expect(alinharAtomos(refs, agents).matches[0].agentIndex).toBe(0);
  });
});

describe("três réguas LCS independentes", () => {
  it("a régua operacional não sacrifica dois matches por um SAI específico posterior", () => {
    const refs = [
      { id: "r0", index: 0, component: "a", action: "UpdateTextField", actionFamily: "entrada_texto_numero", value: "1" },
      { id: "r1", index: 1, component: "b", action: "UpdateTextField", actionFamily: "entrada_texto_numero", value: "2" },
    ];
    const agents = [
      { id: "a0", index: 0, component: "a", action: "mystery", actionFamily: "unknown", value: "1" },
      { id: "a1", index: 1, component: "b", action: "mystery", actionFamily: "unknown", value: "2" },
      { id: "a2", index: 2, component: "a", action: "UpdateTextField", actionFamily: "entrada_texto_numero", value: "1" },
    ];
    const mixed = alinharAtomos(refs, agents);
    const rulers = alinharReguas(refs, agents);
    expect(mixed.matches).toHaveLength(1); // compatibilidade antiga: prioriza o SAI exato tardio
    expect(rulers.operational.matches.map((p) => [p.refIndex, p.agentIndex])).toEqual([[0, 0], [1, 1]]);
    expect(rulers.sai.matches.map((p) => [p.refIndex, p.agentIndex])).toEqual([[0, 2]]);
    expect(rulers.valueOnly.matches.map((p) => [p.refIndex, p.agentIndex])).toEqual([[0, 0], [1, 1]]);
    expect(rulers.sai.metrics.materializedEligibilityRate).toBeCloseTo(1 / 3);
  });

  it("desempata LCS máxima pela menor sequência lexicográfica de pares", () => {
    const refs = [0, 1].map((index) => ({ id: `r${index}`, index, component: "f", action: "Update", value: "5" }));
    const oneAgent = [{ id: "a0", index: 0, component: "f", action: "Update", value: "5" }];
    expect(alinharReguas(refs, oneAgent).valueOnly.matches.map((p) => [p.refIndex, p.agentIndex])).toEqual([[0, 0]]);

    const oneRef = [refs[0]];
    const agents = [0, 1].map((index) => ({ id: `a${index}`, index, component: "f", action: "Update", value: "5" }));
    expect(alinharReguas(oneRef, agents).valueOnly.matches.map((p) => [p.refIndex, p.agentIndex])).toEqual([[0, 0]]);
  });
});

describe("família fechada de ação", () => {
  it.each([
    ["UpdateTextField", FAMILIAS_ACAO.ENTRADA_TEXTO_NUMERO],
    ["UpdateTextArea", FAMILIAS_ACAO.ENTRADA_TEXTO_NUMERO],
    ["Update", FAMILIAS_ACAO.ENTRADA_TEXTO_NUMERO],
    ["enter_value", FAMILIAS_ACAO.ENTRADA_TEXTO_NUMERO],
    ["UpdateComboBox", FAMILIAS_ACAO.SELECAO],
    ["select_marked_value", FAMILIAS_ACAO.SELECAO],
    ["AddPoint", FAMILIAS_ACAO.MARCACAO_RETA],
    ["mark_point", FAMILIAS_ACAO.MARCACAO_RETA],
    ["ButtonPressed", FAMILIAS_ACAO.BOTAO],
    ["button-click", FAMILIAS_ACAO.BOTAO],
    ["submit", FAMILIAS_ACAO.BOTAO],
    ["ação inventada", FAMILIAS_ACAO.UNKNOWN],
    ["", FAMILIAS_ACAO.UNKNOWN],
  ])("classifica %s como %s", (action, expected) => {
    expect(familiaDeAcao(action)).toBe(expected);
  });

  it("reporta cobertura e mantém unknown no denominador", () => {
    const coverage = coberturaFamiliasAcao([
      { action: "Update" },
      { action: "AddPoint" },
      { action: "não catalogada" },
    ]);
    expect(coverage).toMatchObject({ total: 3, known: 2, unknown: 1, rate: 2 / 3 });
    expect(coverage.counts.unknown).toBe(1);
  });

  it.each([
    [{ expectedInput: { renderAs: "numeric_keypad" } }, FAMILIAS_ACAO.ENTRADA_TEXTO_NUMERO],
    [{ expectedInput: { renderAs: "multiple_choice" } }, FAMILIAS_ACAO.SELECAO],
    [{ expectedInput: { renderAs: "number_line" } }, FAMILIAS_ACAO.MARCACAO_RETA],
    [{ expectedInput: { renderAs: "done" } }, FAMILIAS_ACAO.BOTAO],
    [{ expectedInput: { config: { inputType: "numeric" } } }, FAMILIAS_ACAO.ENTRADA_TEXTO_NUMERO],
    [{ expectedInput: { componentProps: { composition: { elements: [{ component: "fraction_input" }] } } } }, FAMILIAS_ACAO.ENTRADA_TEXTO_NUMERO],
  ])("usa somente modalidade estruturada explícita: %j", (node, expected) => {
    expect(familiaDeInteracaoEstruturada(node).family).toBe(expected);
  });

  it("não força uma família quando modalidades estruturadas entram em conflito", () => {
    const resolved = familiaDeInteracaoEstruturada({
      expectedInput: {
        renderAs: "number_line",
        componentProps: { composition: { elements: [{ component: "fraction_input" }] } },
      },
    });
    expect(resolved.family).toBe(FAMILIAS_ACAO.UNKNOWN);
    expect(resolved.source).toBe("structured_conflict");
  });

  it("não infere família de ação a partir da referência", () => {
    const refs = [
      { id: "r1", index: 0, component: "campo", action: "Update", actionFamily: "entrada_texto_numero", value: "1" },
      { id: "r2", index: 1, component: "campo", action: "UpdateTextField", actionFamily: "entrada_texto_numero", value: "2" },
    ];
    const atom = extrairAtomosMaterializados(
      runCom([node("step", "1", { config: { targetComponent: "campo" } })]),
      refs,
    )[0];
    expect(atom.action).toBe("");
    expect(atom.actionResolution).toBe("unknown_action");
    expect(atom.actionFamily).toBe(FAMILIAS_ACAO.UNKNOWN);
    expect(atom.actionFamilyResolution).toBe("unknown_action");
    expect(atom.status).toBe("unknown_action");
  });
});

describe("erros: matching um-para-um dentro do estado", () => {
  it("uma ocorrência gerada não satisfaz dois erros CTAT iguais", () => {
    const ref = refBase();
    const refAtoms = extrairAtomosCtat(ref);
    const run = runCom([
      node("step_1", "3", { config: { targetComponent: "F1" } }, {
        misconceptions: [{ id: "m1", wrongAnswer: "5", feedback: "Revise.", source: "agent6" }],
      }),
      node("step_2", "5", { config: { targetComponent: "F2" } }),
    ]);
    const agentAtoms = extrairAtomosMaterializados(run, refAtoms);
    const aligned = alinharAtomos(refAtoms, agentAtoms);
    const pairing = parearErrosUmParaUm(
      extrairErrosCtat(ref, refAtoms),
      extrairErrosMaterializados(agentAtoms),
      aligned,
    );
    expect(pairing.pairs).toHaveLength(1);
    expect(pairing.unmatchedReference).toHaveLength(1);
    expect(pairing.unanchoredReference).toHaveLength(1);
    expect(new Set(pairing.pairs.map((p) => p.agentErrorIndex)).size).toBe(1);
  });
});

describe("dicas e ledger por ocorrência", () => {
  it("conta dica além da escada e dicas/erros de estado extra individualmente", () => {
    const ref = refBase();
    const nodes = [
      node("step_1", "3", { config: { targetComponent: "F1" } }, {
        hints: [
          { level: 1, type: "conceptual", message: "Pense na parte" },
          { level: 2, type: "bottom_out", message: "Digite 3" },
        ],
        misconceptions: [
          { id: "m-ok", wrongAnswer: "5", feedback: "Inverteu.", source: "agent6" },
          { id: "m-extra", wrongAnswer: "9", feedback: "Outro erro.", source: "agent6" },
        ],
      }),
      node("step_extra", "99", {}, {
        hints: [{ level: 1, type: "conceptual", message: "Dica extra" }],
        misconceptions: [{ id: "m-state", wrongAnswer: "98", feedback: "Quase.", source: null }],
      }),
      node("step_2", "5", { config: { targetComponent: "F2" } }, {
        hints: [
          { level: 1, type: "conceptual", message: "Ache o todo" },
          { level: 2, type: "bottom_out", message: "Digite 5" },
        ],
      }),
    ];
    const result = analisarRegistro(runCom(nodes), ref, { metadata: { corpus: "6.17" } });
    expect(result.hints.metrics.extraMaterializedMessages).toBe(1);
    expect(result.hints.metrics.unresolvedMaterializedMessages).toBe(1);
    expect(result.hints.pairs[0]).toMatchObject({ bottomOutContainsValue: true, completeLadder: true });
    expect(result.errors.matching.pairs).toHaveLength(1);
    expect(result.extrasLedger.filter((r) => r.type === "state")).toHaveLength(1);
    expect(result.extrasLedger.filter((r) => r.type === "error")).toHaveLength(2);
    expect(result.extrasLedger.filter((r) => r.type === "hint")).toHaveLength(2);
    expect(result.extrasLedger.filter((r) => r.isExtra)).toHaveLength(2); // erro no estado alinhado + dica além da escada
    expect(result.extrasLedger.filter((r) => !r.isExtra)).toHaveLength(3); // estado, erro e dica sem componente resolvido
    expect(new Set(result.extrasLedger.map((r) => r.occurrenceId)).size).toBe(result.extrasLedger.length);
    expect(result.extrasLedger.every((r) => r.exercise === "ex" && r.replica === 2)).toBe(true);
  });

  it("métrica de dicas não compara texto e mantém presença ancorada", () => {
    const refs = [{ id: "r", index: 0, value: "3", rawValue: "3", component: "f1", action: "update", hints: [{ indice: 0, nivel: 1, texto: "texto CTAT" }] }];
    const agents = [{ id: "a", index: 0, value: "3", component: "f1", action: "update", hints: [{ indice: 0, nivel: 1, texto: "texto inteiramente diferente" }] }];
    const hints = medirDicasAncoradas(refs, agents, alinharAtomos(refs, agents));
    expect(hints.metrics.alignedStatesWithHintsOnBothSides).toBe(1);
    expect(hints.metrics.extraMaterializedMessages).toBe(0);
  });
});
