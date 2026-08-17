/**
 * comparar-caminho.test.mjs — rodada 3 (2026-08-15): comparação por
 * ESTADO/CAMINHO, conforme instruções do orientador.
 *
 * Trava: (1) o caminho de referência é reconhecido como SUBCAMINHO mesmo com
 * estados extras do agente no meio; (2) a ORDEM é obrigatória (match binário,
 * sem tolerância); (3) erro no estado certo exige valor E estado casado; (4)
 * dica é presença por estado — texto nunca é comparado; (5) extras contados
 * por tipo; (6) canonização só em valores (0.2 ≡ 1/5); (7) DP entre réplicas;
 * (8) o contrato v2 agora exige grafo.passos[].valor.
 */
import { describe, it, expect } from "vitest";
import {
  caminhoDeReferencia,
  casarEstados,
  pontuarCaminho,
  dpEntreReplicas,
  canonizarValor,
} from "../analysis/bancada-v2/comparar-caminho.mjs";
import { validarRegistro, CAMPOS_PASSO } from "../scripts/registro-run-v2.mjs";

const envB = () => ({
  steps: [
    { key: "5", answer: "5", order: 1 },
    { key: "1/5", answer: "1/5", order: 2 },
    { key: "writefractionstep", answer: "", order: 3 }, // sem resposta: fora do denominador
    { key: "1", answer: "1", order: 4 },
  ],
  hintsPerCorrectStep: [["h"], [], [], ["h1", "h2"]],
});
// itens de erro da referência no formato da lib (passo = idx do estado ANTES, 0-based)
const refItens = () => [
  { valor: canonizarValor("4/9"), passo: 1 }, // erro no estado "1/5" (ordem 2)
  { valor: canonizarValor("40"), passo: 0 }, // erro no estado "5" (ordem 1)
];

const runAgente = (over = {}) => ({
  exercicio: "00bubble",
  replica: 1,
  grafo: {
    passos: [
      { indice: 1, acao: "a", kc: "k", valor: "5" },
      { indice: 2, acao: "extra", kc: "k", valor: "10" }, // estado EXTRA no meio
      { indice: 3, acao: "b", kc: "k", valor: "0.2" }, // ≡ 1/5 por canonização
      { indice: 4, acao: "c", kc: "k", valor: "1" },
    ],
    erros: [
      { valor: "4/9", passo: 3 }, // no estado 1/5 (passo 3 do agente) ✓
      { valor: "40", passo: 4 }, // valor certo, estado ERRADO (deveria ser passo 1)
      { valor: "7", passo: 2 }, // extra
    ],
    dicas: [
      { passo: 1, nivel: 1, texto: "qualquer texto" },
      { passo: 2, nivel: 1, texto: "dica em estado extra" },
    ],
  },
  ...over,
});

describe("comparar-caminho — estados como subcaminho ordenado", () => {
  it("caminho de referência: estados canonizados; sem-resposta marcado como não avaliável", () => {
    const c = caminhoDeReferencia(envB());
    expect(c.map((x) => x.estado)).toEqual(["5", "1/5", "writefractionstep", "1"]);
    expect(c[2].comResposta).toBe(false);
    expect(c[3].dicas).toBe(2);
  });

  it("subcaminho com extras no meio: cobertura de estados = 1 e caminho íntegro", () => {
    const p = pontuarCaminho(runAgente(), envB(), refItens());
    expect(p.nEstadosRef).toBe(3); // 5, 1/5, 1 (writefractionstep fora)
    expect(p.coberturaEstados).toBe(1);
    expect(p.caminhoIntegro).toBe(1);
    expect(p.nEstadosAgente).toBe(4);
    expect(p.extras.estados).toBe(1); // o "10"
  });

  it("ordem é obrigatória: referência 5→1/5→1 NÃO casa com agente 1/5→5→1 (match binário)", () => {
    const run = runAgente();
    run.grafo.passos = [
      { indice: 1, acao: "", kc: "", valor: "1/5" },
      { indice: 2, acao: "", kc: "", valor: "5" },
      { indice: 3, acao: "", kc: "", valor: "1" },
    ];
    const cas = casarEstados(caminhoDeReferencia(envB()), run.grafo.passos);
    // "5" casa em idx 1; depois "1/5" só pode casar APÓS idx 1 → não há → falha
    const avaliaveis = cas.filter((c) => c.avaliavel);
    expect(avaliaveis.filter((c) => c.agenteIdx !== null)).toHaveLength(2); // 5 e 1
    const p = pontuarCaminho(run, envB(), refItens());
    expect(p.coberturaEstados).toBeCloseTo(2 / 3);
    expect(p.caminhoIntegro).toBe(0);
  });

  it("erro no estado certo exige valor E estado casado; valor no estado errado não conta", () => {
    const p = pontuarCaminho(runAgente(), envB(), refItens());
    expect(p.errosValorSomente).toBe(1); // 4/9 e 40 existem por valor
    expect(p.errosNoEstadoCerto).toBeCloseTo(1 / 2); // só 4/9 está no estado certo
    expect(p.extras.erros).toBe(1); // o "7"
  });

  it("dicas: presença por estado casado; texto NUNCA é comparado", () => {
    const p = pontuarCaminho(runAgente(), envB(), refItens());
    // ref com dica: estado "5" (ordem 1) e "1" (ordem 4); agente tem dica só no passo 1 (=estado 5)
    expect(p.dicasNoEstadoCerto).toBeCloseTo(1 / 2);
    expect(p.extras.dicas).toBe(1); // dica no passo 2 (estado extra)
  });

  it("canonização só em valores: 0.2 ≡ 1/5 ≡ 2/10", () => {
    expect(canonizarValor("0.2")).toBe(canonizarValor("1/5"));
    expect(canonizarValor("2/10")).toBe(canonizarValor("1/5"));
  });

  it("DP entre réplicas do mesmo exercício", () => {
    const linhas = [
      { ex: "a", m: 0.5 },
      { ex: "a", m: 0.7 },
      { ex: "a", m: 0.9 },
      { ex: "b", m: 1 },
    ];
    expect(dpEntreReplicas(linhas, "m")).toBeCloseTo(0.2, 6);
  });
});

describe("contrato v2 — grafo.passos[].valor passa a ser obrigatório", () => {
  it("CAMPOS_PASSO inclui valor e validarRegistro reprova passo sem valor", () => {
    expect(CAMPOS_PASSO).toContain("valor");
    const reg = {
      exercicio: "x", replica: 1, geradoEm: "t", promptSha256: "s",
      modelos: { perfil: "p", porAgente: {}, temperatura: 0.7, provedor: "openrouter" },
      custo: { tokensEntrada: 0, tokensSaida: 0, usd: 0 },
      auditoria: { ok: true, passos: 1 },
      grafo: { passos: [{ indice: 1, acao: "a", kc: "k" }], erros: [], dicas: [] },
      bruto: { respostaDoModelo: "r", tracos: {} },
    };
    expect(validarRegistro(reg)).toContain("grafo.passos[0].valor");
  });
});

// ── materialização mínima do rótulo de estado (2026-08-15) ──
import { materializarRotulo } from "../analysis/bancada-v2/comparar-caminho.mjs";
describe("comparar-caminho — materialização mínima do rótulo (só o que o agente escreveu)", () => {
  it("extrai o número do placeholder ou do texto; nunca inventa; ambíguo vira vazio", () => {
    expect(materializarRotulo("5")).toBe("5");
    expect(materializarRotulo("Denominador = {5}")).toBe("5");
    expect(materializarRotulo("Posição marcada em {3/5}")).toBe("3/5");
    expect(materializarRotulo("Reta dividida em 5 intervalos")).toBe("5");
    expect(materializarRotulo("Numerador = {A}")).toBe(""); // template puro
    expect(materializarRotulo("Comparação: {B}/{A} > 1/2")).toBe("1/2"); // placeholders vazios; um só número solto
    expect(materializarRotulo("Entre {2} e {3}")).toBe(""); // dois placeholders numéricos → ambíguo
    expect(materializarRotulo("De 3 para 5 partes")).toBe(""); // dois números soltos → ambíguo
    expect(materializarRotulo("Fração validada como {N}/{D} < 1")).toBe("1"); // um número solto
  });

  it("com --materializar, 'Denominador = {5}' → 'Posição = {1/5}' casa o caminho 5 → 1/5", () => {
    const run = runAgente();
    run.grafo.passos = [
      { indice: 1, acao: "", kc: "", valor: "Denominador = {5}" },
      { indice: 2, acao: "", kc: "", valor: "Posição na reta = {1/5}" },
      { indice: 3, acao: "", kc: "", valor: "Resultado final: {1}" },
    ];
    const cru = pontuarCaminho(run, envB(), refItens());
    const mat = pontuarCaminho(run, envB(), refItens(), { materializar: true });
    expect(cru.coberturaEstados).toBe(0);
    expect(mat.coberturaEstados).toBe(1);
    expect(mat.caminhoIntegro).toBe(1);
    expect(mat.rotulosConcretos).toBe(3);
  });
});

// ── 2026-08-15 (tarde): casamento exato (LCS) e cobertura sem ordem ──
describe("casarEstados — subsequência ordenada MÁXIMA (LCS), não gulosa", () => {
  const envB = {
    steps: [
      { key: "3/5", answer: "3/5", order: 1 },
      { key: "1", answer: "1", order: 2 },
      { key: "3", answer: "3", order: 3 },
      { key: "5", answer: "5", order: 4 },
      { key: "5", answer: "5", order: 5 },
      { key: "3/5", answer: "3/5", order: 6 },
    ],
    hintsPerCorrectStep: [[], [], [], [], [], []],
  };
  const passos = ["5", "5", "3", "3/5", "3/5"].map((v, i) => ({ indice: i + 1, acao: "", kc: "k", valor: v }));
  it("o guloso casaria 2 (3/5 no idx 3 consome 5,5,3); o máximo em ordem é 3", () => {
    const cas = casarEstados(caminhoDeReferencia(envB), passos).filter((c) => c.agenteIdx !== null);
    expect(cas.length).toBe(3);
    // ancoragem determinística: 5→idx0, 5→idx1, 3/5→idx3 (ou 3→idx2… qualquer LCS de tamanho 3, mas em ordem)
    const idxs = cas.map((c) => c.agenteIdx);
    expect(idxs).toEqual([...idxs].sort((a, b) => a - b));
  });
  it("cobertura sem ordem conta o estado presente em qualquer posição (secundária, separada da ordenada)", () => {
    const p = pontuarCaminho({ exercicio: "x", grafo: { passos, erros: [], dicas: [] } }, envB, []);
    expect(p.coberturaEstados).toBeCloseTo(3 / 6);
    expect(p.coberturaSemOrdem).toBeCloseTo(5 / 6); // 3/5,3,5,5,3/5 presentes; "1" ausente
    expect(p.caminhoIntegro).toBe(0);
  });
});

describe("caminhoDeReferencia — sentinelas de interface não são estados de valor", () => {
  it('o clique em Done ("-1") e o SetVisible ("") ficam fora do denominador; os valores continuam', () => {
    const envB = {
      steps: [
        { key: "3/5", answer: "3/5", order: 1 },
        { key: "step#2", answer: "", order: 2 },
        { key: "5", answer: "5", order: 3 },
        { key: "-1", answer: "-1", order: 4 },
      ],
      hintsPerCorrectStep: [[], [], [], []],
    };
    const ref = caminhoDeReferencia(envB);
    expect(ref.map((r) => r.comResposta)).toEqual([true, false, true, false]);
    const p = pontuarCaminho({ exercicio: "x", grafo: { passos: [{ valor: "3/5" }, { valor: "5" }, { valor: "ok" }], erros: [], dicas: [] } }, envB, []);
    expect(p.nEstadosRef).toBe(2);
    expect(p.coberturaEstados).toBe(1);
    expect(p.caminhoIntegro).toBe(1);
  });
});

describe("caminho de referência — seletor de variante fora dos estados de valor (2026-08-17)", () => {
  it("no 6.18 o `shield` é bifurcação de variante nos 20 problemas; 6.17 e 6.19 não têm nenhum", async () => {
    const { carregarReferencia } = await import("../analysis/validacao-v2/lib.mjs");
    const antes = process.env.STI_DATASET;
    try {
      for (const [ds, esperadoVariantes] of [["frac-numberline-6.17", 0], ["frac-estimates-6.19", 0], ["equiv-fractions-6.18", 20]]) {
        process.env.STI_DATASET = ds;
        const REF = carregarReferencia(".");
        const comVariante = Object.values(REF).filter((r) => r.caminho.some((c) => c.variante)).length;
        expect(comVariante).toBe(esperadoVariantes);
        for (const r of Object.values(REF)) for (const c of r.caminho) if (c.variante) expect(c.sistema).toBe(true);
      }
    } finally {
      if (antes === undefined) delete process.env.STI_DATASET; else process.env.STI_DATASET = antes;
    }
  });
});
