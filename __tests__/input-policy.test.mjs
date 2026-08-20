import { describe, expect, it } from "vitest";
import {
  INPUT_POLICY_HISTORICA,
  INPUT_POLICY_SOMENTE_ENUNCIADO,
  auditarInputAgentes,
  auditarSaidaAgentes,
  projetarEnvelopeParaAgentes,
  resolverInputPolicy,
  sanitizarEstadoParaAgentes,
  validarCompatibilidadeInputPolicy,
} from "../input-policy.js";
import { buildStateFromEnvelopeA } from "../simulate-fluxo-plataforma.js";

const envelope = {
  id: "ctat-00bubble",
  problem: "Calcule a quantidade pedida no enunciado.",
  correctAnswer: "SEGREDO_1_5",
  difficulty: "hard",
  profile: "expert",
  components: [{ id: "COMPONENTE_SECRETO" }],
  knowledgeComponents: [{ id: "KC_SECRETO", name: "KC derivado do BRD" }],
  metadata: { sourceFile: "expert.brd" },
};

describe("input-policy — seleção e projeção", () => {
  it("preserva historico-v1 como default e rejeita nomes desconhecidos", () => {
    expect(resolverInputPolicy(undefined)).toBe(INPUT_POLICY_HISTORICA);
    expect(() => resolverInputPolicy("inexistente")).toThrow(/desconhecida/i);
  });

  it("somente-enunciado-v1 projeta uma cópia contendo apenas problem", () => {
    const projetado = projetarEnvelopeParaAgentes(
      envelope,
      INPUT_POLICY_SOMENTE_ENUNCIADO
    );
    expect(projetado).toEqual({ problem: envelope.problem });
    expect(projetado).not.toBe(envelope);
    expect(envelope.correctAnswer).toBe("SEGREDO_1_5");
  });

  it("rejeita estrito + interface fixa antes de qualquer agente", () => {
    expect(() =>
      validarCompatibilidadeInputPolicy(INPUT_POLICY_SOMENTE_ENUNCIADO, {
        interfaceFixa: true,
      })
    ).toThrow(/incompatível com interface fixa/i);
  });
});

describe("input-policy — state e auditoria", () => {
  it("state estrito contém o enunciado e nenhum gabarito/KC/interface/metadado CTAT", () => {
    const state = buildStateFromEnvelopeA(envelope, {
      exerciseId: envelope.id,
      inputPolicy: INPUT_POLICY_SOMENTE_ENUNCIADO,
    });
    expect(state).toEqual({
      seedProblems: [{ problemId: 1, statement: envelope.problem }],
      inputPolicyId: INPUT_POLICY_SOMENTE_ENUNCIADO,
      sessionId: null,
      numProblems: 1,
      description: "",
    });
    const texto = JSON.stringify(state);
    for (const segredo of [
      "SEGREDO_1_5",
      "KC_SECRETO",
      "COMPONENTE_SECRETO",
      "ctat-00bubble",
      "expert.brd",
    ]) {
      expect(texto).not.toContain(segredo);
    }
  });

  it("sanitiza recursivamente artefatos compostos antes da materialização", () => {
    const state = sanitizarEstadoParaAgentes(
      {
        discipline: "matematica",
        seedProblems: [
          {
            problemId: "ctat-00bubble",
            statement: envelope.problem,
            correctAnswer: "SEGREDO_1_5",
            interface: { components: ["COMPONENTE_SECRETO"] },
          },
        ],
        advancedTrace: {
          solutions: [
            {
              problemId: "ctat-00bubble",
              solutionTrace: [
                {
                  kcUsed: "KC_SECRETO",
                  kc_id: "KC_SECRETO_VARIANTE",
                  selection: "COMPONENTE_SECRETO",
                  result: "resultado do agente",
                },
              ],
            },
          ],
        },
        misconceptionCatalog: [{ kcId: "KC_SECRETO_CATALOGO", id: "misc_1" }],
        genericGraph: {
          nodes: [{ id: "step_1", knowledgeComponents: ["KC_SECRETO"] }],
        },
      },
      INPUT_POLICY_SOMENTE_ENUNCIADO
    );
    expect(state.seedProblems[0]).toEqual({ problemId: 1, statement: envelope.problem });
    expect(state.advancedTrace.solutions[0].problemId).toBe(1);
    expect(state.advancedTrace.solutions[0].solutionTrace[0]).toEqual({
      result: "resultado do agente",
    });
    expect(state.misconceptionCatalog[0]).toEqual({ id: "misc_1" });
    expect(state.genericGraph.nodes[0]).toEqual({ id: "step_1" });
    expect(JSON.stringify(state)).not.toMatch(/SEGREDO|knowledgeComponents|kcUsed/);
  });

  it("rejeita placeholders e identificadores CTAT reintroduzidos na saída estrita", () => {
    expect(() => auditarSaidaAgentes({
      solutions: [{ problemId: "ctat-00bubble", solutionTrace: [{ result: "{A}/5" }] }],
    }, { politica: INPUT_POLICY_SOMENTE_ENUNCIADO })).toThrow(/placeholder|problemId/i);

    const ok = auditarSaidaAgentes({
      solutions: [{ problemId: 1, solutionTrace: [{ result: "1/5", note: "conjunto {x}" }] }],
    }, { politica: INPUT_POLICY_SOMENTE_ENUNCIADO });
    expect(ok).toMatchObject({ placeholders: [], saidasGenericas: [], problemIdsInvalidos: [], violacoes: [] });
  });

  it("rejeita texto copiado do schema no lugar de um valor concreto", () => {
    expect(() => auditarSaidaAgentes({
      solutions: [{
        problemId: 1,
        solutionTrace: [{ result: "valor concreto calculado" }],
        finalAnswer: "resposta concreta calculada",
      }],
    }, { politica: INPUT_POLICY_SOMENTE_ENUNCIADO })).toThrow(/saida-generica/i);

    expect(() => auditarSaidaAgentes({
      solutions: [{
        problemId: 1,
        solutionTrace: [{
          action: "acao concreta e curta",
          targetRole: "papel_semantico_do_alvo",
          kcUsed: "kc_inferido_descritivo",
          result: "3/5",
        }],
      }],
    }, { politica: INPUT_POLICY_SOMENTE_ENUNCIADO })).toThrow(/saida-generica/i);
  });

  it("hash e lista de chaves são determinísticos e auditáveis", () => {
    const a = auditarInputAgentes(
      { z: 1, a: { y: 2 } },
      { politica: INPUT_POLICY_SOMENTE_ENUNCIADO, etapa: "geracao" }
    );
    const b = auditarInputAgentes(
      { a: { y: 2 }, z: 1 },
      { politica: INPUT_POLICY_SOMENTE_ENUNCIADO, etapa: "geracao" }
    );
    expect(a.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(a.sha256).toBe(b.sha256);
    expect(a.chaves).toEqual(["a.y", "z"]);
    expect(a.chavesRestritas).toEqual([]);
  });
});
