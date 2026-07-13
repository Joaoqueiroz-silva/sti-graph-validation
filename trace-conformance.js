/**
 * trace-conformance.js — Conformidade COMPORTAMENTAL robô×especialista sobre a
 * bateria congelada de traços (Onda 2, gate G6).
 *
 * Executa cada traço da bateria nos DOIS grafos v2 com o trace-executor e compara
 * as sequências de vereditos passo a passo. Diferente da functional-equivalence v1
 * (bateria = união das respostas dos dois grafos, autorreferente), aqui a bateria é
 * EXTERNA e congelada — e as probes de domínio (família C) introduzem VERDADEIROS
 * NEGATIVOS: pares no-match×no-match entram na matriz de confusão.
 *
 * 2026-07-13 (Onda 2, W4): decisões registradas —
 *   - kappa REUSA cohenKappa de functional-equivalence.js (exigência do plano). Como o
 *     cohenKappa calcula o acordo esperado sobre o vocabulário fixo CATS
 *     ["correto","erro-previsto","surpresa"], mapeamos os vereditos do executor:
 *     correct→"correto", buggy→"erro-previsto", no-match→"surpresa". Sem o mapa, pe
 *     seria 0 e o kappa degeneraria no acordo bruto (sem correção de acaso).
 *   - Eventos hintRequest ficam FORA dos pares de veredito: o executor devolve "hint"
 *     incondicionalmente para qualquer grafo, então o par hint×hint inflaria a
 *     concordância sem informação (a comparação do CONTEÚDO das dicas é outra métrica,
 *     fora deste gate).
 *   - Coberturas usam a proveniência declarada no item (family="referencia" +
 *     kind="correta"/"buggy") — a bateria congelada carrega esses campos; sem itens da
 *     categoria, a cobertura sai null (não estimável — nunca número fabricado, mesma
 *     política do stats.js).
 *   - "Reconhecido como buggy NO CONTEXTO" = o ÚLTIMO passo do traço de referência
 *     (o SAI buggy, aplicado após o prefixo correto) recebe veredito "buggy" do robô.
 *     Se o robô diverge no prefixo, o contexto se perde e o passo tende a no-match —
 *     é exatamente o que a métrica deve punir.
 */

import { executeTrace } from "./trace-executor.js";
import { canonAnswer } from "./schema.js";
import { cohenKappa } from "./functional-equivalence.js";

/** Vereditos de passo SAI do executor (hint fica fora — ver cabeçalho). */
const VERDICTS = ["correct", "buggy", "no-match"];

const VERDICT_TO_CAT = { correct: "correto", buggy: "erro-previsto", "no-match": "surpresa" };

const round = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : x);

/**
 * traceConformance(expertV2, robotV2, batteryItems, opts)
 * @param {object} expertV2  grafo neutro v2 do especialista
 * @param {object} robotV2   grafo neutro v2 do robô
 * @param {Array}  batteryItems  itens da bateria congelada ({ id, family, kind, trace, ... })
 * @param {{followRemediation?:boolean}} opts  repassado ao executor (default false nos dois)
 * @returns {{
 *   coverageCorrectTraces:number|null,   // traços corretos da referência aceitos E completados pelo robô
 *   coverageBuggyRecognized:number|null, // ações buggy da referência reconhecidas como buggy pelo robô no contexto
 *   agreement:number, kappa:number,
 *   confusion:object,                    // veredito-expert × veredito-robô (inclui no-match×no-match)
 *   n:number,                            // nº de pares de veredito comparados (passos SAI)
 *   items:Array                          // detalhe por item (vereditos e conclusão nos dois grafos)
 * }}
 */
export function traceConformance(expertV2, robotV2, batteryItems, opts = {}) {
  // 2026-07-13 (Onda 3): nível de correspondência POR LADO, declarado no resultado
  // (plano mestre §4.2). A referência casa no vocabulário exato da bateria (que
  // deriva dela); o lado gerado pode casar no nível 3 (âncora de input), porque
  // seu vocabulário SAI é conceitual. No nível "input", passos NÃO ANCORÁVEIS
  // (input vazio ou marcador mecânico "-": setup de interface, ações de tutor,
  // erros mecânicos) ficam FORA dos pares e dos denominadores — o grafo gerado
  // não fala esse vocabulário por construção, e contá-los mediria o vocabulário,
  // não o comportamento. Contagem de excluídos reportada.
  const expertMatchLevel = opts.expertMatchLevel || "exact";
  const robotMatchLevel = opts.robotMatchLevel || "exact";
  const execOptsE = { followRemediation: !!opts.followRemediation, matchLevel: expertMatchLevel };
  const execOptsR = { followRemediation: !!opts.followRemediation, matchLevel: robotMatchLevel };
  const anchorable = (ev) =>
    !ev?.hintRequest && canonAnswer(ev?.input) !== "" && String(ev?.input ?? "").trim() !== "-";
  const filterPairs = robotMatchLevel === "input";
  let skippedNonAnchorable = 0;

  const confusion = {};
  for (const a of VERDICTS) {
    confusion[a] = {};
    for (const b of VERDICTS) confusion[a][b] = 0;
  }

  const rows = []; // pares {expert, robot} por passo SAI (entrada do agreement/kappa)
  let corrTot = 0;
  let corrOk = 0;
  let corrCompleted = 0; // leniente: chegou ao estado final, mesmo com passos não reconhecidos
  let bugTot = 0;
  let bugOk = 0;
  const items = [];

  for (const item of batteryItems || []) {
    const trace = item.trace || [];
    const e = executeTrace(expertV2, trace, execOptsE);
    const r = executeTrace(robotV2, trace, execOptsR);

    for (let i = 0; i < trace.length; i++) {
      if (trace[i] && trace[i].hintRequest) continue; // hint é incondicional — fora dos pares
      if (filterPairs && !anchorable(trace[i])) {
        skippedNonAnchorable++;
        continue;
      }
      const ev = e.steps[i].verdict;
      const rv = r.steps[i].verdict;
      rows.push({ expert: ev, robot: rv });
      if (confusion[ev] && confusion[ev][rv] != null) confusion[ev][rv]++;
    }

    const stepsForCompletion = filterPairs
      ? r.steps.filter((_, i) => anchorable(trace[i]))
      : r.steps.filter((_, i) => !trace[i]?.hintRequest);
    if (item.family === "referencia" && item.kind === "correta") {
      corrTot++;
      if (r.completed && stepsForCompletion.every((s) => s.verdict === "correct")) corrOk++;
      // 2026-07-13: variante LENIENTE reportada ao lado da estrita — com granularidade
      // diferente (8 micropassos da referência vs ~4 conceituais do gerado), a estrita
      // mede aceitação passo a passo e a leniente mede se o aluno que segue o caminho
      // da referência TERMINA o exercício no grafo gerado. As duas são publicadas.
      if (r.completed) corrCompleted++;
    }
    if (item.family === "referencia" && item.kind === "buggy") {
      // no nível "input", só ações buggy ancoráveis entram no denominador
      const lastEv = trace.at(-1);
      if (!filterPairs || anchorable(lastEv)) {
        bugTot++;
        if (r.steps.at(-1)?.verdict === "buggy") bugOk++;
      } else {
        skippedNonAnchorable++;
      }
    }

    items.push({
      id: item.id,
      family: item.family,
      kind: item.kind ?? null,
      expert: e.steps.map((s) => s.verdict),
      robot: r.steps.map((s) => s.verdict),
      expertCompleted: e.completed,
      robotCompleted: r.completed,
    });
  }

  const n = rows.length;
  const agreement = n ? rows.filter((p) => p.expert === p.robot).length / n : 1;
  const kappa = cohenKappa(
    rows.map((p) => ({
      expert: VERDICT_TO_CAT[p.expert] ?? p.expert,
      robot: VERDICT_TO_CAT[p.robot] ?? p.robot,
    }))
  );

  return {
    matchLevels: { expert: expertMatchLevel, robot: robotMatchLevel },
    skippedNonAnchorable,
    coverageCorrectTraces: corrTot ? round(corrOk / corrTot) : null,
    coverageCorrectTracesCompleted: corrTot ? round(corrCompleted / corrTot) : null,
    coverageBuggyRecognized: bugTot ? round(bugOk / bugTot) : null,
    agreement: round(agreement),
    kappa: round(kappa),
    confusion,
    n,
    items,
  };
}
