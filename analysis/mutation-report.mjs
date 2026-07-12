/**
 * analysis/mutation-report.mjs — Mutation testing do verificador de invariantes (gate G8).
 *
 * O parecer externo apontou: "encontrar zero violações demonstra principalmente que o
 * construtor respeita as próprias regras". Encontrar zero defeitos só tem valor de
 * evidência se o VERIFICADOR (graph-hallucination.js#intrinsicReport) comprovadamente
 * DETECTA defeitos quando eles existem. Este módulo injeta defeitos deliberados
 * (operadores de mutação determinísticos) em grafos saudáveis e mede:
 *   - SENSIBILIDADE: o mutante dispara o sinal duro correspondente ao defeito?
 *   - ESPECIFICIDADE por mutação: os DEMAIS sinais duros ficam calados (sem espúrios)?
 *   - ESPECIFICIDADE global: os grafos-base intactos passam limpos (0 duros, score 0)?
 *
 * Grafos-base (2026-07-12, W3): o repo standalone TEM o graphforge.js (construtor
 * determinístico com garantias estruturais por construção), então os saudáveis vêm
 * dele — com configs derivadas do Envelope B dos 24 casos do corpus CTAT 6.17, para
 * que a topologia (nº de passos, nº de misconceptions) seja a do corpus real, não
 * inventada. Como o corpus é "mass production" (topologia templatizada: 8 passos ×
 * 8 misconceptions em todos os casos), acrescentamos 2 configs sintéticas com formas
 * diferentes (2 passos/1 misc; 5 passos/misc desbalanceadas) para variar a base.
 *
 * 2026-07-12 (W3): perfis com genericScaffold (pre_literate/early_reader) são
 * deliberadamente EVITADOS na base: o graphforge cria scaffold genérico com
 * targetMisconception="generic_struggle", que NÃO é id de misconception declarada —
 * o intrinsicReport o acusa como scaffold órfão (duro). Incompatibilidade real
 * construtor×verificador, verificada empiricamente e registrada no relatório;
 * resolvê-la é fora do escopo do W3.
 *
 * Uso: node analysis/mutation-report.mjs
 *   → grava analysis/derived/mutation-testing.json + analysis/derived/MUTATION-TESTING.md
 * O arquivo também é a fonte única dos operadores para __tests__/verifier-mutations.test.mjs
 * (evita duplicar a definição dos mutantes entre teste e relatório).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { graphForge } from "../graphforge.js";
import { parseBrdToExpertNeutral } from "../parse-ctat-brd.js";
import { intrinsicReport, hallucinationScore } from "../graph-hallucination.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const DEFAULT_CASES_DIR = path.join(ROOT, "cases", "ctat-6.17");
const DERIVED_DIR = path.join(HERE, "derived");

/** Os 7 sinais DUROS do intrinsicReport, na ordem do próprio relatório. */
export const HARD_SIGNALS = [
  "missingStartGoal",
  "backboneCycles",
  "pathologicalCycles",
  "unreachableNodes",
  "deadEndNodes",
  "scaffoldsWithoutMisc",
  "orphanEdges",
];

// ── Grafos-base saudáveis ─────────────────────────────────────────────────────

/**
 * Config do graphForge derivada do Envelope B de um caso do corpus: passos = arestas
 * corretas do especialista; misconceptions distribuídas round-robin pelos passos
 * (o Envelope B não ancora misconception em passo — stepKey=null — e a distribuição
 * uniforme mantém os graus de saída dos steps a ≤1 de diferença, o que garante, por
 * construção, que o sinal mole de over-branching não dispara na base).
 * Não há preocupação de anti-contaminação aqui: mutation testing avalia o VERIFICADOR,
 * não o robô — o Envelope B pode ser lido à vontade.
 */
function forgeConfigFromExpertNeutral(neutral, caseId) {
  const steps = (neutral.steps || []).map((s, i) => ({
    index: i + 1,
    kc: "kc_fracao_reta",
    action: s.answer ? `Responder ${s.answer}` : `Passo ${i + 1}`,
    result: s.answer || "",
  }));
  const effective = steps.length
    ? steps
    : [{ index: 1, kc: "kc_fracao_reta", action: "Resolver", result: "" }];
  const misconceptions = effective.map(() => []);
  (neutral.misconceptions || []).forEach((m, i) => {
    misconceptions[i % effective.length].push({
      id: `misc_${caseId}_${i + 1}`,
      type: "conceptual_error",
      wrongAnswer: m.wrongAnswer ?? "",
      description: m.feedback || `wrongAnswer=${m.wrongAnswer}`,
      feedback: m.feedback || "",
      severity: "moderate",
    });
  });
  return {
    steps: effective,
    misconceptions,
    hints: effective.map(() => []),
    // kcs com o id usado nos passos → o graphforge também emite skip-edges (perfil
    // reader), exercitando o verificador sobre arestas default paralelas ao backbone.
    kcs: [{ id: "kc_fracao_reta", name: "Frações na reta numérica", masteryThreshold: 0.85 }],
    profile: "reader",
    difficulty: "medium",
  };
}

/** Configs sintéticas com formas que o corpus templatizado não cobre. */
function syntheticConfigs() {
  return [
    {
      id: "sintetico-minimo",
      config: {
        steps: [
          { index: 1, kc: "kc_a", action: "Passo 1", result: "3" },
          { index: 2, kc: "kc_a", action: "Passo 2", result: "7" },
        ],
        misconceptions: [
          [
            {
              id: "misc_min_1",
              type: "conceptual_error",
              wrongAnswer: "5",
              description: "soma sem reagrupar",
              feedback: "revise o reagrupamento",
              severity: "moderate",
            },
          ],
          [],
        ],
        hints: [[], []],
        kcs: [],
        profile: "reader",
        difficulty: "easy",
      },
    },
    {
      id: "sintetico-avancado",
      config: {
        steps: [1, 2, 3, 4, 5].map((i) => ({
          index: i,
          kc: "kc_b",
          action: `Passo ${i}`,
          result: String(i),
        })),
        misconceptions: [
          [
            {
              id: "misc_av_1",
              type: "conceptual_error",
              wrongAnswer: "9",
              description: "a",
              feedback: "f",
              severity: "high",
            },
            {
              id: "misc_av_2",
              type: "procedural_error",
              wrongAnswer: "0",
              description: "b",
              feedback: "f",
              severity: "moderate",
            },
          ],
          [
            {
              id: "misc_av_3",
              type: "conceptual_error",
              wrongAnswer: "13",
              description: "c",
              feedback: "f",
              severity: "moderate",
            },
          ],
          [],
          [
            {
              id: "misc_av_4",
              type: "conceptual_error",
              wrongAnswer: "2/3",
              description: "d",
              feedback: "f",
              severity: "moderate",
            },
          ],
          [],
        ],
        hints: [[], [], [], [], []],
        kcs: [{ id: "kc_b", name: "KC B", masteryThreshold: 0.85 }],
        profile: "advanced",
        difficulty: "hard",
      },
    },
  ];
}

/**
 * Constrói o conjunto de grafos-base: 24 do corpus (via graphForge sobre config
 * derivada do Envelope B) + 2 sintéticos. Determinístico (ordem alfabética dos casos).
 * @returns {Array<{id:string, source:"corpus"|"sintetico", graph:object}>}
 */
export function buildBaseGraphs({ casesDir = DEFAULT_CASES_DIR } = {}) {
  const bases = [];
  const caseIds = fs
    .readdirSync(casesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(casesDir, d.name, "expert.brd")))
    .map((d) => d.name)
    .sort();
  for (const id of caseIds) {
    const xml = fs.readFileSync(path.join(casesDir, id, "expert.brd"), "utf8");
    const neutral = parseBrdToExpertNeutral(xml);
    const { graph } = graphForge(forgeConfigFromExpertNeutral(neutral, id));
    bases.push({ id, source: "corpus", graph });
  }
  for (const s of syntheticConfigs()) {
    bases.push({ id: s.id, source: "sintetico", graph: graphForge(s.config).graph });
  }
  return bases;
}

// ── Operadores de mutação ─────────────────────────────────────────────────────
// Cada operador é uma FUNÇÃO PURA: recebe um grafo saudável ({nodes,edges} EducaOFF)
// e devolve um grafo NOVO com exatamente UM defeito injetado (o original não é tocado
// — clonamos com structuredClone). Devolve null quando inaplicável ao grafo dado.

const clone = (g) => structuredClone(g);
const stepsOf = (g) => g.nodes.filter((n) => n.type === "step");

/**
 * Operadores determinísticos m1–m10. `expectedHard` é o conjunto EXATO de sinais
 * duros que o mutante deve disparar — nem mais (espúrio) nem menos (falso negativo).
 * Onde o conjunto tem 2 sinais, é implicação POR DEFINIÇÃO, não espúrio (ver notas).
 */
export const MUTATION_OPERATORS = [
  {
    id: "m1_removeStart",
    label: "remove o nó start (e suas arestas incidentes)",
    defectClass: "grafo sem estado inicial",
    expectedHard: ["missingStartGoal"],
    // Remove TAMBÉM as arestas incidentes: o operador injeta UM defeito (start ausente);
    // deixar arestas soltas apontando pro id removido injetaria um SEGUNDO defeito
    // (aresta órfã) e o mutante deixaria de ser diagnóstico do sinal missingStartGoal.
    apply(graph) {
      const g = clone(graph);
      const startIds = new Set(g.nodes.filter((n) => n.type === "start").map((n) => n.id));
      if (!startIds.size) return null;
      g.nodes = g.nodes.filter((n) => !startIds.has(n.id));
      g.edges = g.edges.filter((e) => !startIds.has(e.from) && !startIds.has(e.to));
      return g;
    },
  },
  {
    id: "m2_removeGoal",
    label: "remove o nó goal (e suas arestas incidentes)",
    defectClass: "grafo sem estado final",
    expectedHard: ["missingStartGoal"],
    apply(graph) {
      const g = clone(graph);
      const goalIds = new Set(g.nodes.filter((n) => n.type === "goal").map((n) => n.id));
      if (!goalIds.size) return null;
      g.nodes = g.nodes.filter((n) => !goalIds.has(n.id));
      g.edges = g.edges.filter((e) => !goalIds.has(e.from) && !goalIds.has(e.to));
      return g;
    },
  },
  {
    id: "m3_noIlha",
    label: "adiciona nó sem nenhuma aresta",
    defectClass: "nó-ilha (desconectado)",
    // POR DEFINIÇÃO um nó sem arestas é AO MESMO TEMPO inalcançável de start E incapaz
    // de co-alcançar goal — os dois sinais são o diagnóstico correto do defeito, não
    // disparo espúrio (o verificador não tem, nem precisa ter, um sinal "ilha" próprio).
    expectedHard: ["unreachableNodes", "deadEndNodes"],
    apply(graph) {
      const g = clone(graph);
      g.nodes.push({ id: "mut_ilha", type: "step", description: "nó-ilha injetado (m3)" });
      return g;
    },
  },
  {
    id: "m4_becoSemSaida",
    label: "remove as arestas de saída de um nó intermediário (1º scaffold)",
    defectClass: "beco sem saída",
    expectedHard: ["deadEndNodes"],
    // Alvo = o primeiro SCAFFOLD (nó intermediário fora do backbone): remover a saída
    // de um STEP do backbone desconectaria todo o resto do grafo e o mutante dispararia
    // unreachableNodes em cascata — deixaria de ser um defeito ÚNICO e diagnóstico.
    apply(graph) {
      const g = clone(graph);
      const scaf = g.nodes.find(
        (n) => n.type === "scaffold" && g.edges.some((e) => e.from === n.id)
      );
      if (!scaf) return null;
      g.edges = g.edges.filter((e) => e.from !== scaf.id);
      return g;
    },
  },
  {
    id: "m5_cicloPatologico",
    label: "aresta default de volta (step_2→step_1) sem passar por remediação",
    defectClass: "ciclo patológico",
    expectedHard: ["pathologicalCycles"],
    // Condition "default" (não "correct") de propósito: o ciclo NÃO entra no backbone,
    // isolando o sinal pathologicalCycles — o m8 cobre a variante em arestas correct.
    apply(graph) {
      const g = clone(graph);
      const steps = stepsOf(g);
      if (steps.length < 2) return null;
      g.edges.push({ from: steps[1].id, to: steps[0].id, condition: "default", priority: 0 });
      return g;
    },
  },
  {
    id: "m6_scaffoldOrfao",
    label: "scaffold cujo targetMisconception não existe em nenhum step",
    defectClass: "scaffold órfão",
    expectedHard: ["scaffoldsWithoutMisc"],
    // O scaffold fantasma entra CONECTADO (step→scaffold→step) para não disparar
    // alcançabilidade junto — o único defeito é a referência à misconception inexistente.
    apply(graph) {
      const g = clone(graph);
      const step = stepsOf(g)[0];
      if (!step) return null;
      g.nodes.push({
        id: "mut_scaffold_fantasma",
        type: "scaffold",
        targetMisconception: "mut_misc_inexistente",
      });
      g.edges.push(
        {
          from: step.id,
          to: "mut_scaffold_fantasma",
          condition: "misconception(mut_misc_inexistente)",
          priority: 2,
        },
        { from: "mut_scaffold_fantasma", to: step.id, condition: "correct", priority: 1 }
      );
      return g;
    },
  },
  {
    id: "m7_arestaFantasma",
    label: "aresta apontando para nó inexistente",
    defectClass: "aresta órfã",
    expectedHard: ["orphanEdges"],
    apply(graph) {
      const g = clone(graph);
      const step = stepsOf(g)[0];
      if (!step) return null;
      g.edges.push({ from: step.id, to: "mut_no_inexistente", condition: "correct", priority: 1 });
      return g;
    },
  },
  {
    id: "m8_backboneCiclico",
    label: "ciclo só com arestas correct (step_2→step_1 correct)",
    defectClass: "backbone cíclico (raciocínio circular)",
    // Todo ciclo de backbone É um ciclo sem remediação — pathologicalCycles dispara por
    // IMPLICAÇÃO LÓGICA (o conjunto de checagem do patológico contém o do backbone).
    // Exigir os dois é o que distingue m8 de m5 (que só dispara o patológico).
    expectedHard: ["backboneCycles", "pathologicalCycles"],
    apply(graph) {
      const g = clone(graph);
      const steps = stepsOf(g);
      if (steps.length < 2) return null;
      g.edges.push({ from: steps[1].id, to: steps[0].id, condition: "correct", priority: 1 });
      return g;
    },
  },
  {
    id: "m9_multiplosInicios",
    label: "segundo nó start apontando para o 1º step",
    defectClass: "múltiplos inícios",
    // O verificador NÃO tem sinal dedicado a "mais de um start" (toWorkGraph elege o
    // primeiro); a detecção acontece via alcançabilidade: o segundo start não tem
    // aresta de entrada → unreachableNodes. O mutante ganha saída para o 1º step de
    // propósito, senão também seria beco sem saída (vide m3) e o sinal ficaria ambíguo.
    expectedHard: ["unreachableNodes"],
    apply(graph) {
      const g = clone(graph);
      const step = stepsOf(g)[0];
      if (!step) return null;
      g.nodes.push({ id: "mut_start_2", type: "start", description: "segundo início (m9)" });
      g.edges.push({ from: "mut_start_2", to: step.id, condition: "default", priority: 0 });
      return g;
    },
  },
  {
    id: "m10_transicaoDuplicada",
    label: "duplica uma aresta existente (mesma rota e mesmo papel)",
    defectClass: "transição duplicada (ruído de geração)",
    // Sinal MOLE por design do verificador: aresta paralela não barra o grafo (flag
    // continua false), mas alimenta o hallucinationScore (peso 0.5) → score > 0.
    expectedHard: [],
    expectSoftScore: true,
    apply(graph) {
      const g = clone(graph);
      const e = g.edges.find((x) => x.condition === "correct") || g.edges[0];
      if (!e) return null;
      g.edges.push({ ...e });
      return g;
    },
  },
];

// ── Avaliação de um mutante ───────────────────────────────────────────────────

/**
 * Compara o relatório intrínseco de um mutante com o conjunto esperado do operador.
 * detected = todos os sinais esperados dispararam (p/ m10: score mole > 0);
 * spurious = sinais DUROS que dispararam sem estar no conjunto esperado.
 */
export function evaluateMutant(operator, report) {
  const fired = HARD_SIGNALS.filter((k) => report.hard[k].length > 0);
  const missing = operator.expectedHard.filter((k) => !fired.includes(k));
  const spurious = fired.filter((k) => !operator.expectedHard.includes(k));
  const score = hallucinationScore(report).score;
  const detected = operator.expectSoftScore ? score > 0 : missing.length === 0;
  return { fired, missing, spurious, score, detected };
}

// ── Campanha completa (usada pelo main e reutilizável nos testes) ─────────────

export function runMutationCampaign({ casesDir = DEFAULT_CASES_DIR } = {}) {
  const all = buildBaseGraphs({ casesDir });

  // Especificidade global: base intacta tem que passar limpa (0 duros, score 0).
  // Grafo que não passa é EXCLUÍDO da campanha e registrado (requisito do handoff).
  const excluded = [];
  const bases = [];
  for (const b of all) {
    const r = intrinsicReport(b.graph);
    const s = hallucinationScore(r);
    if (r.hardViolations === 0 && s.score === 0) bases.push(b);
    else excluded.push({ id: b.id, source: b.source, hard: r.hard, soft: r.soft, score: s.score });
  }

  const operators = MUTATION_OPERATORS.map((op) => {
    let applicable = 0;
    let detected = 0;
    const spuriousMutants = [];
    const missedMutants = [];
    for (const b of bases) {
      const mutant = op.apply(b.graph);
      if (mutant === null) continue;
      applicable++;
      const ev = evaluateMutant(op, intrinsicReport(mutant));
      if (ev.detected) detected++;
      else missedMutants.push({ base: b.id, fired: ev.fired, missing: ev.missing });
      if (ev.spurious.length) spuriousMutants.push({ base: b.id, spurious: ev.spurious });
    }
    return {
      id: op.id,
      label: op.label,
      defectClass: op.defectClass,
      signalKind: op.expectSoftScore ? "mole (hallucinationScore)" : "duro",
      expectedSignals: op.expectSoftScore ? ["hallucinationScore>0"] : op.expectedHard,
      applicable,
      detected,
      sensitivity: applicable ? round3(detected / applicable) : null,
      spuriousHardMutants: spuriousMutants.length,
      spuriousMutants,
      missedMutants,
    };
  });

  const mutantsTotal = operators.reduce((s, o) => s + o.applicable, 0);
  const mutantsDetected = operators.reduce((s, o) => s + o.detected, 0);
  const spuriousTotal = operators.reduce((s, o) => s + o.spuriousHardMutants, 0);

  return {
    generatedAt: new Date().toISOString(),
    verifier: "graph-hallucination.js#intrinsicReport (7 sinais duros + score mole)",
    baseGraphs: {
      total: all.length,
      clean: bases.length,
      corpus: all.filter((b) => b.source === "corpus").length,
      synthetic: all.filter((b) => b.source === "sintetico").length,
      excluded,
    },
    operators,
    overall: {
      mutantsTotal,
      mutantsDetected,
      sensitivity: mutantsTotal ? round3(mutantsDetected / mutantsTotal) : null,
      spuriousHardMutants: spuriousTotal,
      // Especificidade em duas facetas: (a) global = bases intactas limpas/total;
      // (b) por mutação = mutantes SEM sinal duro espúrio / mutantes aplicáveis.
      intactClean: bases.length,
      intactTotal: all.length,
      specificityIntact: all.length ? round3(bases.length / all.length) : null,
      specificityPerMutation: mutantsTotal
        ? round3((mutantsTotal - spuriousTotal) / mutantsTotal)
        : null,
    },
    scope:
      "a conclusão vale para as classes de defeito cobertas pela suíte — sensibilidade/especificidade fora dessas 10 classes não foi medida",
  };
}

function round3(x) {
  return Math.round(x * 1000) / 1000;
}

// ── Relatório em Markdown ─────────────────────────────────────────────────────

function toMarkdown(res) {
  const pct = (x) => (x == null ? "—" : `${(x * 100).toFixed(1)}%`);
  const rows = res.operators
    .map(
      (o) =>
        `| ${o.id} | ${o.defectClass} | ${o.expectedSignals.join(" + ")} | ${o.detected}/${o.applicable} | ${pct(
          o.sensitivity
        )} | ${o.spuriousHardMutants} |`
    )
    .join("\n");
  const excluded = res.baseGraphs.excluded.length
    ? res.baseGraphs.excluded.map((e) => `- \`${e.id}\` (${e.source}): duros=${JSON.stringify(e.hard)} score=${e.score}`).join("\n")
    : "Nenhum — todos os grafos-base intactos passaram limpos (0 violações duras, score mole 0).";

  return `# Mutation testing do verificador de invariantes (gate G8)

Gerado por \`analysis/mutation-report.mjs\` em ${res.generatedAt}.

## Por quê

O parecer externo observou que "encontrar zero violações demonstra principalmente que o
construtor respeita as próprias regras". Este relatório fecha essa lacuna: injeta defeitos
deliberados em grafos saudáveis e mede se o verificador (\`graph-hallucination.js#intrinsicReport\`)
os DETECTA (sensibilidade) sem acusar sinais que não correspondem ao defeito (especificidade).

## Método

- **Grafos-base saudáveis**: ${res.baseGraphs.total} (${res.baseGraphs.corpus} construídos pelo
  \`graphforge.js\` com topologia derivada do Envelope B dos casos do corpus CTAT 6.17 +
  ${res.baseGraphs.synthetic} sintéticos com formas que o corpus templatizado não cobre).
- **Operadores de mutação**: 10 funções puras e determinísticas, cada uma injetando UM defeito.
- **Detectado**: o mutante dispara TODOS os sinais esperados do operador (para o m10, sinal
  mole: \`hallucinationScore > 0\` com \`hallucinationFlag = false\`).
- **Espúrio**: o mutante dispara algum sinal DURO fora do conjunto esperado.

## Resultado: operador × sensibilidade × espúrios

| Operador | Classe de defeito | Sinal esperado | Detectados/Total | Sensibilidade | Falsos positivos (sinais duros espúrios) |
|---|---|---|---|---|---|
${rows}

**Agregado**: ${res.overall.mutantsDetected}/${res.overall.mutantsTotal} mutantes detectados
(sensibilidade ${pct(res.overall.sensitivity)}) · ${res.overall.spuriousHardMutants} mutantes com
sinal duro espúrio (especificidade por mutação ${pct(res.overall.specificityPerMutation)}).

**Especificidade global (controle negativo)**: ${res.overall.intactClean}/${res.overall.intactTotal}
grafos-base intactos passaram limpos (${pct(res.overall.specificityIntact)}) — 0 violações duras e
score mole 0 em cada um.

### Grafos-base excluídos

${excluded}

## Notas de desenho (o que NÃO é espúrio)

- **m3 (nó-ilha)** espera \`unreachableNodes\` **e** \`deadEndNodes\`: um nó sem arestas é, por
  definição, inalcançável de start E incapaz de co-alcançar goal — os dois sinais são o
  diagnóstico correto do mesmo defeito.
- **m8 (backbone cíclico)** espera \`backboneCycles\` **e** \`pathologicalCycles\`: todo ciclo de
  backbone é um ciclo sem remediação (implicação lógica). É o que o distingue do m5, que forma o
  ciclo com aresta \`default\` e dispara apenas o patológico.
- **m9 (múltiplos inícios)**: o verificador não tem sinal dedicado a "mais de um start"
  (\`toWorkGraph\` elege o primeiro); a detecção se dá via alcançabilidade (\`unreachableNodes\`).
- **m4 (beco sem saída)** remove as saídas de um SCAFFOLD (nó intermediário fora do backbone):
  remover as saídas de um step do backbone desconectaria todo o resto e dispararia
  \`unreachableNodes\` em cascata — o mutante deixaria de ter defeito único.

## Observação registrada (fora do escopo do W3)

O \`graphforge.js\` com perfis \`pre_literate\`/\`early_reader\` cria scaffold genérico com
\`targetMisconception="generic_struggle"\` para passos sem misconceptions — e o verificador o
acusa como scaffold órfão (sinal duro), verificado empiricamente. Incompatibilidade real
construtor×verificador; por isso a base usa os perfis \`reader\`/\`advanced\`.

## Escopo

**A conclusão vale para as classes de defeito cobertas pela suíte** — sensibilidade e
especificidade fora dessas 10 classes não foram medidas.
`;
}

// ── CLI ───────────────────────────────────────────────────────────────────────

function main() {
  const res = runMutationCampaign();
  fs.mkdirSync(DERIVED_DIR, { recursive: true });
  const jsonPath = path.join(DERIVED_DIR, "mutation-testing.json");
  const mdPath = path.join(DERIVED_DIR, "MUTATION-TESTING.md");
  fs.writeFileSync(jsonPath, JSON.stringify(res, null, 2) + "\n");
  fs.writeFileSync(mdPath, toMarkdown(res));

  console.log(`grafos-base: ${res.baseGraphs.clean}/${res.baseGraphs.total} limpos`);
  for (const o of res.operators) {
    console.log(
      `${o.id.padEnd(24)} ${o.detected}/${o.applicable} detectados · espúrios=${o.spuriousHardMutants}`
    );
  }
  console.log(
    `agregado: sensibilidade=${res.overall.sensitivity} · especificidade(intactos)=${res.overall.specificityIntact} · especificidade(por mutação)=${res.overall.specificityPerMutation}`
  );
  console.log(`→ ${jsonPath}\n→ ${mdPath}`);

  const perfect =
    res.overall.sensitivity === 1 &&
    res.overall.specificityIntact === 1 &&
    res.overall.spuriousHardMutants === 0;
  if (!perfect) {
    console.error("ATENÇÃO: sensibilidade/especificidade abaixo de 100% — ver relatório.");
    process.exitCode = 2;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
