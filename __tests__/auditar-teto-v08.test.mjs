import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  AJUDA,
  CELULAS_630,
  PADROES_TETO_ESTATICO,
  TOTAL_ESPERADO_630,
  auditarTetosEstaticos,
  consolidarTopologia,
  executarCli,
  extrairTopologia,
  parseArgs,
} from "../analysis/orientador-v08/auditar-teto.mjs";

const item = ({
  corpus = "6.17",
  braco = "custo-beneficio",
  ex = "p1",
  replica = 1,
  regime = "livre",
  gerados = 7,
  aplicaria = 4,
  teto = 4,
  passosReferencia,
} = {}) => ({
  corpus,
  braco,
  dataset: `dataset-${corpus}`,
  arquivo: `${corpus}/${braco}/${ex}_rep${replica}.json`,
  passosReferencia,
  registro: {
    exercicio: ex,
    replica,
    topologia: {
      regime,
      passosGeradosPeloAgente: gerados,
      passosQueProducaoAplicaria: aplicaria,
      tetoDinamicoProducao: teto,
    },
  },
});

describe("telemetria de topologia v0.8", () => {
  it("declara exatamente as dez células e o denominador de 630 registros", () => {
    expect(CELULAS_630).toHaveLength(10);
    expect(TOTAL_ESPERADO_630).toBe(630);
    expect(new Set(CELULAS_630.map((c) => `${c.corpus}/${c.braco}`)).size).toBe(10);
  });

  it("calcula perda potencial apenas no contrafactual de passos livres", () => {
    const livre = extrairTopologia(item({ gerados: 9, aplicaria: 4, teto: 4, passosReferencia: 10 }));
    expect(livre).toMatchObject({
      status: "ok",
      contrafactualMensuravel: true,
      truncamentoPotencial: true,
      passosPotencialmentePerdidos: 5,
      tetoAtivado: true,
      perdaSobreReferencia: 0.5,
    });

    const producao = extrairTopologia(item({ regime: "producao", gerados: 4, aplicaria: 4, teto: 4 }));
    expect(producao).toMatchObject({
      status: "ok",
      contrafactualMensuravel: false,
      censurado: true,
      truncamentoPotencial: null,
      passosPotencialmentePerdidos: null,
    });
  });

  it("mantém telemetria ausente ou inválida no denominador e explicita o motivo", () => {
    const ausente = extrairTopologia({ corpus: "6.17", braco: "x", registro: { exercicio: "p" } });
    expect(ausente.status).toBe("ausente");
    const invalida = extrairTopologia(item({ gerados: 1.5 }));
    expect(invalida.status).toBe("invalida");

    const resumo = consolidarTopologia([
      { corpus: "6.17", braco: "x", registro: { exercicio: "p" } },
      item({ gerados: 1.5, ex: "q" }),
    ]).geral;
    expect(resumo.registros).toBe(2);
    expect(resumo.analisaveis).toBe(0);
    expect(resumo.telemetriaAusente).toBe(1);
    expect(resumo.telemetriaInvalida).toBe(1);
  });

  it("conserva contagens e perdas nas tabelas por corpus e braço", () => {
    const itens = [
      item({ corpus: "6.17", braco: "a", ex: "p1", gerados: 7, aplicaria: 4, teto: 4 }),
      item({ corpus: "6.17", braco: "b", ex: "p1", gerados: 4, aplicaria: 4, teto: 4 }),
      item({ corpus: "6.18", braco: "a", ex: "p2", gerados: 10, aplicaria: 5, teto: 5 }),
      item({ corpus: "6.18", braco: "b", ex: "p2", regime: "producao", gerados: 4, aplicaria: 4, teto: 4 }),
    ];
    const r = consolidarTopologia(itens);
    expect(r.geral.registros).toBe(4);
    expect(r.geral.contrafactual.mensuraveis).toBe(3);
    expect(r.geral.contrafactual.censurados).toBe(1);
    expect(r.geral.contrafactual.grafosComTruncamentoPotencial).toBe(2);
    expect(r.geral.contrafactual.passosPotencialmentePerdidos).toBe(8);
    expect(r.porCorpusEBraco).toHaveLength(4);
    const perdasCelulas = r.porCorpusEBraco.reduce(
      (soma, celula) => soma + celula.contrafactual.passosPotencialmentePerdidos,
      0,
    );
    expect(perdasCelulas).toBe(8);
  });
});

describe("busca estática explícita de tetos", () => {
  it("lista padrões revisáveis e informa arquivo, linha e natureza código/comentário", () => {
    expect(PADROES_TETO_ESTATICO.length).toBeGreaterThanOrEqual(10);
    const resultado = auditarTetosEstaticos([
      {
        arquivo: "pipeline.js",
        conteudo: [
          "// .slice(0, teto) documentado",
          "const maxSteps = 4;",
          "const prefixo = passos.slice(0, maxSteps);",
          "const cfg = { maxTokens: 1000, timeout: 2000 };",
        ].join("\n"),
      },
    ]);
    expect(resultado.arquivosAuditados).toEqual(["pipeline.js"]);
    expect(resultado.achados).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ padrao: "limite-passos", linha: 2, tipoLinha: "codigo" }),
        expect.objectContaining({ padrao: "slice-prefixo", linha: 3, tipoLinha: "codigo" }),
        expect.objectContaining({ padrao: "teto-tokens", linha: 4, tipoLinha: "codigo" }),
        expect.objectContaining({ padrao: "timeout", linha: 4, tipoLinha: "codigo" }),
        expect.objectContaining({ padrao: "slice-prefixo", linha: 1, tipoLinha: "comentario" }),
      ]),
    );
    expect(resultado.ocorrenciasEmCodigo).toBeGreaterThan(0);
    expect(resultado.ocorrenciasEmComentarios).toBeGreaterThan(0);
  });

  it("é determinística e não compartilha lastIndex entre chamadas", () => {
    const fontes = [{ arquivo: "x.js", conteudo: "a.slice(0, 2);\nb.slice(0, 3);" }];
    expect(auditarTetosEstaticos(fontes)).toEqual(auditarTetosEstaticos(fontes));
  });
});

describe("CLI da auditoria", () => {
  it("faz parse estrito e --help não lê runs nem grava arquivos", () => {
    expect(parseArgs(["--raiz", "/tmp/repo", "--sem-detalhes", "--json", "out.json"])).toEqual({
      raiz: "/tmp/repo",
      json: "out.json",
      incluirRegistros: false,
      ajuda: false,
    });
    expect(() => parseArgs(["--desconhecida"])).toThrow(/opção desconhecida/);
    const saida = [];
    const execucao = executarCli(["--help"], { stdout: (texto) => saida.push(texto) });
    expect(execucao).toEqual({ codigo: 0, resultado: null });
    expect(saida.join("")).toBe(AJUDA);
  });
});

describe("propriedades seguras da consolidação pura", () => {
  const RUNS = Number(process.env.STI_TETO_PROPTEST_RUNS || 300);
  const baseArb = fc.record({
    corpus: fc.constantFrom("6.17", "6.18", "6.19", "6.20", "8.12"),
    braco: fc.constantFrom("a", "b"),
    regime: fc.constantFrom("livre", "producao"),
    gerados: fc.integer({ min: 0, max: 40 }),
    aplicaria: fc.integer({ min: 0, max: 12 }),
    tetoExtra: fc.integer({ min: 0, max: 12 }),
  });

  it("é invariante à ordem e conserva a perda entre partições", () => {
    fc.assert(
      fc.property(fc.array(baseArb, { minLength: 0, maxLength: 60 }), (bases) => {
        const itens = bases.map((base, i) =>
          item({
            ...base,
            ex: `p${i}`,
            replica: 1,
            teto: Math.max(base.aplicaria, base.tetoExtra),
          }),
        );
        const direto = consolidarTopologia(itens);
        const reverso = consolidarTopologia([...itens].reverse());
        expect(reverso).toEqual(direto);
        const somaCelulas = direto.porCorpusEBraco.reduce(
          (soma, celula) => soma + celula.contrafactual.passosPotencialmentePerdidos,
          0,
        );
        expect(somaCelulas).toBe(direto.geral.contrafactual.passosPotencialmentePerdidos);
        expect(direto.geral.contrafactual.passosPotencialmentePerdidos).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: RUNS },
    );
  });

  it("a perda de cada registro livre é max(0, gerados − aplicaria)", () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 100 }),
        fc.nat({ max: 100 }),
        (gerados, aplicaria) => {
          const linha = extrairTopologia(
            item({ gerados, aplicaria, teto: Math.max(aplicaria, 1), regime: "livre" }),
          );
          expect(linha.passosPotencialmentePerdidos).toBe(Math.max(0, gerados - aplicaria));
          expect(linha.truncamentoPotencial).toBe(gerados > aplicaria);
        },
      ),
      { numRuns: RUNS },
    );
  });
});
