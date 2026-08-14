/**
 * scripts/registro-run-v2.mjs — montagem e validação do registro de execução
 * conforme docs/CONTRATO-RUN-V2.md (port 2026-08, plano §5).
 *
 * As Campanhas 1-5 gravaram só o formato flat (agregados + lista de valores),
 * o que tornou os níveis 2, 3 e 5 incalculáveis depois do fato. O registro
 * novo é um SUPERSET: mantém byte a byte os campos flat (compatibilidade com
 * readRuns/aggregateRuns e com `validar.mjs --legado`) e adiciona o contrato
 * v2 (grafo preservado + modelos resolvidos + custo), que `validar.mjs --runs`
 * consome.
 *
 * Módulo PURO (sem IO): o coletor injeta tudo; o teste
 * __tests__/contrato-run-v2.test.mjs falha se qualquer campo obrigatório
 * deixar de ser gravado.
 */

/**
 * Caminhos obrigatórios do contrato (docs/CONTRATO-RUN-V2.md, tabela "Campos
 * obrigatórios e por quê"). "a.b" = registro.a.b precisa existir (não
 * undefined e não null; arrays podem ser vazios, mas precisam ser arrays).
 */
export const CAMPOS_OBRIGATORIOS = [
  "exercicio",
  "replica",
  "geradoEm",
  "promptSha256",
  "modelos.perfil",
  "modelos.porAgente",
  "modelos.temperatura",
  "modelos.provedor",
  "custo.tokensEntrada",
  "custo.tokensSaida",
  "custo.usd",
  "auditoria.ok",
  "auditoria.passos",
  "grafo.passos",
  "grafo.erros",
  "grafo.dicas",
  "bruto.respostaDoModelo",
  "bruto.tracos",
];

/** Campos que cada erro do grafo precisa carregar (níveis 1, 2, 3 e 5). */
export const CAMPOS_ERRO = [
  "valor",
  "passo",
  "componente",
  "acao",
  "devolutiva",
  "buggyRule",
  "misconceptionId",
];

export function getCampo(obj, caminho) {
  return caminho.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/**
 * Valida um registro contra o contrato. Devolve a lista de campos faltantes
 * (vazia = registro conforme). `usd` pode ser null APENAS se declarado via
 * custoDesconhecido (modelo fora da tabela de preços congelada) — o campo
 * continua presente.
 */
export function validarRegistro(registro) {
  const faltando = [];
  for (const caminho of CAMPOS_OBRIGATORIOS) {
    const v = getCampo(registro, caminho);
    const usdDesconhecido =
      caminho === "custo.usd" && v === null && registro?.custo?.desconhecido === true;
    if (v === undefined || (v === null && !usdDesconhecido)) faltando.push(caminho);
  }
  for (const [i, erro] of (registro?.grafo?.erros ?? []).entries()) {
    for (const campo of CAMPOS_ERRO) {
      if (erro[campo] === undefined || erro[campo] === null) {
        faltando.push(`grafo.erros[${i}].${campo}`);
      }
    }
  }
  return faltando;
}

/**
 * Monta o bloco grafo{passos, erros, dicas} a partir do grafo AUTORADO
 * (formato EducaOFF) e dos traces do simulador.
 *
 * - passos: os nós "step" do grafo, na ordem (o grafo é o artefato preservado;
 *   nPassos alimenta o nível 2b do validador);
 * - erros: as misconceptions QUE ENTRARAM no grafo (mesma população que o
 *   campo legado robotMisconceptions), com passo = índice 1-based do nó, e
 *   componente/acao/buggyRule enriquecidos do trace correspondente (o grafo
 *   EducaOFF não carrega componente de interface; o trace do simulador sim);
 * - dicas: as dicas do trace do mediano, com nível sequencial por passo.
 */
export function montarGrafo(graph, traces = {}) {
  const stepNodes = (graph?.nodes ?? []).filter((n) => n.type === "step");
  const passos = stepNodes.map((n, i) => ({
    indice: i + 1,
    acao: String(n.description ?? ""),
    kc: String(
      Array.isArray(n.knowledgeComponents) ? (n.knowledgeComponents[0] ?? "") : (n.knowledgeComponents ?? "")
    ),
  }));

  const porId = new Map();
  for (const m of traces.misconceptions ?? []) {
    const chave = String(m.id ?? "");
    if (chave && !porId.has(chave)) porId.set(chave, m);
  }

  const erros = [];
  stepNodes.forEach((n, i) => {
    for (const m of n.misconceptions ?? []) {
      const trace = porId.get(String(m.id ?? "")) ?? null;
      erros.push({
        valor: String(m.wrongAnswer ?? ""),
        passo: i + 1,
        componente: String(trace?.selection ?? trace?.componente ?? ""),
        acao: String(trace?.action ?? ""),
        devolutiva: String(m.feedback ?? trace?.feedback ?? ""),
        buggyRule: String(trace?.buggyRule ?? m.buggyRule ?? ""),
        misconceptionId: String(m.id ?? ""),
      });
    }
  });

  const nivelPorPasso = new Map();
  const dicas = (traces.hints ?? []).map((h) => {
    const passo = Number(h.step) || 1;
    const nivel = (nivelPorPasso.get(passo) ?? 0) + 1;
    nivelPorPasso.set(passo, nivel);
    return { passo, nivel, texto: String(typeof h === "string" ? h : (h.text ?? "")) };
  });

  return { passos, erros, dicas };
}

/**
 * Soma tokens e custo das chamadas do manifesto atribuídas a este run.
 * costUsd null (modelo fora da tabela congelada) marca custo.desconhecido.
 */
export function montarCusto(chamadas = []) {
  let tokensEntrada = 0;
  let tokensSaida = 0;
  let usd = 0;
  let desconhecido = false;
  for (const c of chamadas) {
    tokensEntrada += Number.isFinite(c.tokensIn) ? c.tokensIn : 0;
    tokensSaida += Number.isFinite(c.tokensOut) ? c.tokensOut : 0;
    if (Number.isFinite(c.costUsd)) usd += c.costUsd;
    else desconhecido = true;
  }
  const custo = { tokensEntrada, tokensSaida, usd: desconhecido && usd === 0 ? null : usd };
  if (desconhecido) custo.desconhecido = true;
  return custo;
}

/**
 * Monta o registro COMPLETO de um run: formato flat legado (intocado) +
 * contrato v2. Ver docs/CONTRATO-RUN-V2.md para o porquê de cada campo.
 *
 * @param {object} p
 *   exercicio, replica     par exercício-réplica
 *   envelopeA              entrada do robô (correctAnswer)
 *   robot                  { graph, neutral, traces } de authorFromEnvelopeA
 *   audit                  auditBehaviorGraph(robot.graph)
 *   cmp                    compareGraphs(...) — comparador INTOCADO
 *   fe                     functionalEquivalence(...)
 *   modelos                bloco resolvido { perfil, porAgente, temperatura, provedor, resolvidoEm }
 *   chamadas               entradas do manifesto atribuídas a este run
 *   respostaDoModelo       texto bruto devolvido pelo LLM (capturado via opts.captureRaw)
 *   geradoEm               ISO-8601 (default: agora)
 */
export function buildRunRecord(p) {
  const {
    exercicio,
    replica,
    envelopeA,
    robot,
    audit,
    cmp,
    fe,
    modelos,
    chamadas = [],
    respostaDoModelo = null,
    promptSha256 = null,
    geradoEm = new Date().toISOString(),
  } = p;

  return {
    // ── formato flat legado, byte a byte (readRuns/aggregateRuns/--legado) ──
    id: exercicio,
    correctAnswer: envelopeA.correctAnswer,
    audit: { ok: audit.ok, stepCount: audit.stepCount },
    f1: cmp.similarity,
    conceptual: cmp.nodeF1Conceptual,
    precision: cmp.precision,
    recall: cmp.recall,
    functionalAgreement: fe.agreement,
    functionalKappa: fe.kappa,
    missing: cmp.detail.missingMisconceptions,
    extra: cmp.detail.extraMisconceptions,
    robotMisconceptions: (robot.neutral.misconceptions || []).map((m) => m.wrongAnswer),

    // ── contrato v2 (docs/CONTRATO-RUN-V2.md) ──
    exercicio,
    replica,
    geradoEm,
    promptSha256: promptSha256 ?? chamadas[0]?.promptSha256 ?? null,
    modelos,
    custo: montarCusto(chamadas),
    auditoria: { ok: audit.ok, passos: audit.stepCount },
    grafo: montarGrafo(robot.graph, robot.traces),
    bruto: {
      respostaDoModelo,
      tracos: robot.traces ?? {},
    },
  };
}
