/**
 * battery-gen.mjs — Bateria INDEPENDENTE e CONGELADA de traços (Onda 2, gate G6).
 *
 * Problema que resolve: a bateria da "concordância de classificação" (functional-equivalence)
 * é a UNIÃO das respostas dos dois grafos — autorreferente e sem verdadeiros negativos.
 * Este gerador congela, ANTES da próxima geração de grafos, uma bateria de TRAÇOS por
 * exercício, com três famílias e integridade verificável (versão + MANIFEST.sha256):
 *
 *   FAMÍLIA A ("referencia") — traços extraídos do BRD LACRADO do especialista
 *     (permitido: a bateria congela antes da geração; o robô nunca vê estes arquivos):
 *     o traço correto completo, um traço por transição buggy (setup correto até o
 *     estado de origem + o SAI buggy) e um hintRequest no estado inicial.
 *   FAMÍLIA B ("mutado") — transformações DETERMINÍSTICAS pré-especificadas dos traços
 *     da família A: seleção errada, input equivalente (fração 2·num/2·den e decimal
 *     exata quando existir), ordem alternativa, repetição do 1º passo, ação após objetivo.
 *   FAMÍLIA C ("probe") — gerador de DOMÍNIO PURO: dado só numerador/denominador/rBound
 *     do answer key (nunca o BRD), produz sondas clássicas de fração na reta numérica
 *     (0, 1, num/num, den/den, invertida, ±1 no num/den, negativa, decimais). São elas
 *     que introduzem VERDADEIROS NEGATIVOS (no-match × no-match) na matriz de confusão.
 *
 * Determinismo TOTAL: sem Math.random, sem Date em conteúdo gerado, aritmética de
 * decimais em inteiros (sem float), ordem de itens fixada pela ordem do grafo/answer key.
 * Rodar duas vezes produz bytes idênticos (é o que o teste de congelamento trava).
 *
 * 2026-07-13 (Onda 2, W4): decisões registradas —
 *   - O prefixo de setup dos probes (showAnswer→writeFractionStep→set_maximum→F1→F2→denom)
 *     é o TEMPLATE da interface compartilhada do dataset (mass production), derivável só de
 *     num/den/rBound — não é lido do BRD. O gerador APENAS VALIDA (sanity, fail-fast) que o
 *     template executa como correto no grafo lacrado; o conteúdo dos probes não depende disso.
 *   - Política para ciclos: nenhum construtor de traço visita o mesmo estado mais de
 *     MAX_STATE_VISITS (2) vezes, e traço nenhum passa de MAX_TRACE_DEPTH (64) eventos.
 *     O corpus 6.17 é acíclico no caminho correto; os guards são defesa-em-profundidade.
 *   - expectedNote explica o PORQUÊ do item SEM prescrever veredito (a bateria sonda
 *     comportamento; o juízo é do trace-conformance, por comparação entre grafos).
 *   - Dedupe LITERAL dentro da família C (ex.: num+1 = den faz (num+1)/den == den/den):
 *     mantém-se a primeira ocorrência na ordem fixa do catálogo de probes.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { canonAnswer } from "./schema.js";
import { parseBrdToNeutralV2 } from "./schema-v2.js";
import { executeTrace } from "./trace-executor.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const BATTERY_VERSION = "frac-numberline-6.17-v1";
export const MAX_TRACE_DEPTH = 64;
export const MAX_STATE_VISITS = 2;

const DEFAULTS = {
  casesDir: path.join(HERE, "cases/ctat-6.17"),
  answerKeyPath: path.join(HERE, "answer-key/frac-numberline-6.17.json"),
  outDir: path.join(HERE, "battery", BATTERY_VERSION),
};

// ───────────────────────── aritmética exata de frações/decimais ─────────────────────────
// Tudo em inteiros: float introduziria dependência de plataforma no texto congelado.

function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

function reduzida(num, den) {
  const g = gcd(num, den);
  return [num / g, den / g];
}

/** Nº de casas da expansão decimal EXATA de 1/den (den = 2^a·5^b), ou null se dízima. */
function casasDecimaisExatas(den) {
  let d = den;
  let a = 0;
  let b = 0;
  while (d % 2 === 0) {
    d /= 2;
    a++;
  }
  while (d % 5 === 0) {
    d /= 5;
    b++;
  }
  return d === 1 ? Math.max(a, b) : null;
}

/** String decimal de (escalado / 10^casas), só com aritmética inteira. */
function decimalDeEscalado(escalado, casas) {
  if (casas === 0) return String(escalado);
  const neg = escalado < 0;
  const s = String(Math.abs(escalado)).padStart(casas + 1, "0");
  return (neg ? "-" : "") + s.slice(0, -casas) + "." + s.slice(-casas);
}

/** Forma decimal exata de num/den ("1/4"→"0.25"), ou null quando é dízima. */
export function decimalExata(num, den) {
  const [n, d] = reduzida(num, den);
  const casas = casasDecimaisExatas(d);
  if (casas == null) return null;
  return decimalDeEscalado((n * 10 ** casas) / d, casas);
}

/**
 * Decimal PRÓXIMA e NÃO equivalente a num/den — distratora de precisão, determinística:
 *   exata      → soma 1 na última casa (mínimo 2 casas): 1/4→"0.26", 13/10→"1.31";
 *   dízima     → truncamento em 2 casas (nunca é igual à fração): 2/7→"0.28".
 */
export function decimalProximaNaoEquivalente(num, den) {
  const [n, d] = reduzida(num, den);
  const casas = casasDecimaisExatas(d);
  if (casas == null) return decimalDeEscalado(Math.floor((n * 100) / d), 2);
  const c = Math.max(casas, 2);
  return decimalDeEscalado((n * 10 ** c) / d + 1, c);
}

// ───────────────────────── travessia do grafo v2 (família A) ─────────────────────────

/** Índice from → transições corretas, na ordem do grafo (determinismo do desempate). */
function correctOutgoing(v2) {
  const byFrom = new Map();
  for (const t of v2.transitions) {
    if (t.type !== "correct") continue;
    if (!byFrom.has(t.from)) byFrom.set(t.from, []);
    byFrom.get(t.from).push(t);
  }
  return byFrom;
}

const copySai = (sai) => ({ selection: sai.selection, action: sai.action, input: sai.input });

/**
 * Traço correto completo: segue a 1ª transição correta de cada estado até um estado final.
 * Aplica a política de ciclos (≤ MAX_STATE_VISITS por estado) e o teto de profundidade.
 */
export function buildCorrectTrace(v2) {
  const finals = new Set(v2.finalStates);
  const byFrom = correctOutgoing(v2);
  const visits = new Map();
  const trace = [];
  let cur = v2.startState;
  while (!finals.has(cur) && trace.length < MAX_TRACE_DEPTH) {
    const seen = (visits.get(cur) || 0) + 1;
    if (seen > MAX_STATE_VISITS) break; // política para ciclos
    visits.set(cur, seen);
    const outs = byFrom.get(cur) || [];
    if (!outs.length) break;
    trace.push(copySai(outs[0].sai));
    cur = outs[0].to;
  }
  return { trace, endState: cur };
}

/** BFS pelas transições corretas: MENOR traço do start até `target` (ou null). */
export function tracePathTo(v2, target) {
  const byFrom = correctOutgoing(v2);
  const queue = [[v2.startState, []]];
  const seen = new Set([v2.startState]);
  while (queue.length) {
    const [state, trace] = queue.shift();
    if (state === target) return trace;
    if (trace.length >= MAX_TRACE_DEPTH) continue;
    for (const t of byFrom.get(state) || []) {
      if (seen.has(t.to)) continue;
      seen.add(t.to);
      queue.push([t.to, [...trace, copySai(t.sai)]]);
    }
  }
  return null;
}

// ───────────────────────── FAMÍLIA A — referência (do BRD lacrado) ─────────────────────────

function buildFamiliaReferencia(v2, exId) {
  const stateName = new Map(v2.states.map((s) => [s.id, s.name]));
  const items = [];

  const { trace: correta, endState } = buildCorrectTrace(v2);
  if (!correta.length || !v2.finalStates.includes(endState)) {
    throw new Error(`battery-gen: ${exId}: caminho correto não alcança estado final (fim=${endState})`);
  }
  items.push({
    id: `${exId}:referencia-correta`,
    family: "referencia",
    kind: "correta",
    trace: correta,
    expectedNote:
      "Caminho correto completo extraído do grafo lacrado do especialista: setup da interface, " +
      "numerador, denominador, divisões, ponto na reta e conclusão.",
  });

  const buggies = v2.transitions.filter((t) => t.type === "buggy");
  buggies.forEach((b, i) => {
    const prefix = tracePathTo(v2, b.from);
    if (prefix == null) {
      throw new Error(`battery-gen: ${exId}: estado ${b.from} (origem do buggy ${b.id}) inalcançável`);
    }
    items.push({
      id: `${exId}:referencia-buggy-${String(i + 1).padStart(2, "0")}-${b.sai.selection}`,
      family: "referencia",
      kind: "buggy",
      trace: [...prefix, copySai(b.sai)],
      expectedNote:
        `Erro catalogado pelo especialista: ${b.sai.selection}/${b.sai.action} com input ` +
        `"${b.sai.input}" no estado "${stateName.get(b.from) ?? b.from}", alcançado pelo caminho ` +
        "correto. Sonda o tratamento deste erro em contexto.",
    });
  });

  items.push({
    id: `${exId}:referencia-hint-inicial`,
    family: "referencia",
    kind: "hint",
    trace: [{ hintRequest: true }],
    expectedNote: "Pedido de dica no estado inicial, antes de qualquer ação do aluno.",
  });

  return items;
}

// ───────────────────────── FAMÍLIA B — mutações determinísticas ─────────────────────────

/**
 * Passo-alvo das mutações de resposta: o ÚLTIMO passo do traço correto cujo input é
 * semanticamente igual à resposta do exercício (no corpus, o AddPoint da reta numérica —
 * o showAnswer do setup também carrega a fração, mas vem antes).
 */
function indiceDoPassoDeResposta(correta, correctAnswer) {
  const alvo = canonAnswer(correctAnswer);
  for (let i = correta.length - 1; i >= 0; i--) {
    if (canonAnswer(correta[i].input) === alvo) return i;
  }
  throw new Error(`battery-gen: nenhum passo do traço correto casa a resposta "${correctAnswer}"`);
}

function buildFamiliaMutado(correta, ex) {
  const { id: exId, numerator: num, denominator: den } = ex;
  if (correta.length < 2) {
    throw new Error(`battery-gen: ${exId}: traço correto curto demais para mutações (${correta.length})`);
  }
  const items = [];
  const clone = () => correta.map(copySai);
  const idxResp = indiceDoPassoDeResposta(correta, `${num}/${den}`);

  // 1. seleção errada: o passo de resposta aplicado no componente do passo ANTERIOR
  //    com selection diferente (determinístico; existe porque o setup precede a resposta).
  let idxPrev = idxResp - 1;
  while (idxPrev >= 0 && correta[idxPrev].selection === correta[idxResp].selection) idxPrev--;
  if (idxPrev >= 0) {
    const t = clone();
    t[idxResp] = { ...t[idxResp], selection: correta[idxPrev].selection };
    items.push({
      id: `${exId}:mutado-selecao-errada`,
      family: "mutado",
      kind: "selecao-errada",
      trace: t,
      expectedNote:
        `Passo de resposta aplicado no componente errado ("${correta[idxPrev].selection}" em vez ` +
        `de "${correta[idxResp].selection}"). Sonda a sensibilidade à selection da tripla SAI.`,
    });
  }

  // 2a. input equivalente — fração k·num/k·den com k=2 (mesma quantidade, outra grafia).
  {
    const t = clone();
    t[idxResp] = { ...t[idxResp], input: `${2 * num}/${2 * den}` };
    items.push({
      id: `${exId}:mutado-input-equivalente-fracao`,
      family: "mutado",
      kind: "input-equivalente-fracao",
      trace: t,
      expectedNote:
        `Resposta escrita como ${2 * num}/${2 * den} — a mesma quantidade que ${num}/${den} em ` +
        "grafia não reduzida. Sonda a equivalência semântica do casamento de input.",
    });
  }

  // 2b. input equivalente — forma decimal, SÓ quando a expansão é exata (den = 2^a·5^b).
  const dec = decimalExata(num, den);
  if (dec != null) {
    const t = clone();
    t[idxResp] = { ...t[idxResp], input: dec };
    items.push({
      id: `${exId}:mutado-input-equivalente-decimal`,
      family: "mutado",
      kind: "input-equivalente-decimal",
      trace: t,
      expectedNote:
        `Resposta na forma decimal exata ${dec} (mesma quantidade que ${num}/${den}). ` +
        "Sonda a aceitação de grafia decimal no lugar da fração.",
    });
  }

  // 3. ordem alternativa: os dois primeiros passos trocados.
  {
    const t = clone();
    [t[0], t[1]] = [t[1], t[0]];
    items.push({
      id: `${exId}:mutado-ordem-alternativa`,
      family: "mutado",
      kind: "ordem-alternativa",
      trace: t,
      expectedNote:
        "Dois primeiros passos do caminho correto em ordem trocada. Sonda se o grafo exige a " +
        "ordem de setup ou tolera permutação.",
    });
  }

  // 4. repetição do primeiro passo.
  {
    const t = clone();
    t.unshift(copySai(t[0]));
    items.push({
      id: `${exId}:mutado-repeticao-primeiro-passo`,
      family: "mutado",
      kind: "repeticao-primeiro-passo",
      trace: t,
      expectedNote:
        "Primeiro passo do caminho correto executado duas vezes seguidas. Sonda o tratamento " +
        "de repetição de um passo já consumido.",
    });
  }

  // 5. ação após o objetivo: repete o último passo depois de concluir.
  {
    const t = clone();
    t.push(copySai(t[t.length - 1]));
    items.push({
      id: `${exId}:mutado-acao-apos-objetivo`,
      family: "mutado",
      kind: "acao-apos-objetivo",
      trace: t,
      expectedNote:
        "Ação extra (repetição do último passo) após o traço completo alcançar o objetivo. " +
        "Sonda o comportamento pós-conclusão.",
    });
  }

  return items;
}

// ───────────────────────── FAMÍLIA C — probes de domínio puro ─────────────────────────

/**
 * Prefixo de setup do TEMPLATE da interface compartilhada (mass production 6.17),
 * derivável só de num/den/rBound do answer key — NÃO é lido do BRD (ver cabeçalho).
 */
export function domainSetupTrace({ numerator, denominator, rBound, lineName = "numline" }) {
  return [
    { selection: "showAnswer", action: "ButtonPressed", input: `${numerator}/${denominator}` },
    { selection: "writeFractionStep", action: "SetVisible", input: "" },
    { selection: lineName, action: "set_maximum", input: String(rBound) },
    { selection: "F1", action: "UpdateTextField", input: String(numerator) },
    { selection: "F2", action: "UpdateTextField", input: String(denominator) },
    { selection: "denom", action: "Update", input: String(denominator) },
  ];
}

/**
 * generateProbes(exercicioDoAnswerKey) → itens da família C.
 * DOMÍNIO PURO: usa apenas id, numerator, denominator e interfaceConfig.rBound/line_name
 * do answer key — nunca o BRD. É o que o teste de independência regenera e compara.
 */
export function generateProbes(ex) {
  const num = ex.numerator;
  const den = ex.denominator;
  const rBound = ex.interfaceConfig?.rBound ?? 1;
  const lineName = ex.interfaceConfig?.line_name || "numline";
  if (!Number.isInteger(num) || !Number.isInteger(den) || den <= 0) {
    throw new Error(`generateProbes: ${ex.id}: numerador/denominador inválidos (${num}/${den})`);
  }

  const setup = () => domainSetupTrace({ numerator: num, denominator: den, rBound, lineName });

  // Catálogo FIXO de sondas (ordem = ordem dos itens; dedupe literal preserva a 1ª).
  const sondas = [
    ["zero", "0", "Origem da reta: distratora clássica de 'nenhuma parte'."],
    ["um", "1", "A unidade inteira: confusão parte-todo."],
    ["num-sobre-num", `${num}/${num}`, "Numerador repetido: fração igual a 1 escrita com o numerador."],
    ["den-sobre-den", `${den}/${den}`, "Denominador repetido: fração igual a 1 escrita com o denominador."],
    ["invertida", `${den}/${num}`, `Fração invertida (den/num) — com rBound=${rBound}, pode cair fora da reta.`],
    ["num-mais-1", `${num + 1}/${den}`, "Erro de contagem de uma unidade a mais no numerador."],
    ["num-menos-1", `${num - 1}/${den}`, "Erro de contagem de uma unidade a menos no numerador."],
    ["den-mais-1", `${num}/${den + 1}`, "Erro de contagem de uma divisão a mais no denominador."],
    den - 1 !== 0
      ? ["den-menos-1", `${num}/${den - 1}`, "Erro de contagem de uma divisão a menos no denominador."]
      : null,
    ["negativa", `-${num}/${den}`, `Fração negativa: fora do intervalo [0, ${rBound}] da reta.`],
    decimalExata(num, den) != null
      ? ["decimal-equivalente", decimalExata(num, den), `Mesma quantidade que ${num}/${den} em forma decimal exata.`]
      : null,
    [
      "decimal-proxima",
      decimalProximaNaoEquivalente(num, den),
      `Decimal vizinha de ${num}/${den} porém NÃO equivalente (distratora de precisão).`,
    ],
  ].filter(Boolean);

  const vistos = new Set();
  const items = [];
  for (const [slug, valor, motivo] of sondas) {
    if (vistos.has(valor)) continue; // dedupe literal (ex.: num+1 === den)
    vistos.add(valor);
    items.push({
      id: `${ex.id}:probe-${slug}`,
      family: "probe",
      kind: slug,
      trace: [...setup(), { selection: lineName, action: "AddPoint", input: valor }],
      expectedNote: `Probe de domínio (independente do especialista): ${motivo}`,
    });
  }
  return items;
}

// ───────────────────────── montagem por exercício + sanidade ─────────────────────────

export function buildExerciseBattery(v2, ex) {
  const referencia = buildFamiliaReferencia(v2, ex.id);
  const correta = referencia.find((i) => i.kind === "correta").trace;
  const mutado = buildFamiliaMutado(correta, ex);
  const probe = generateProbes(ex);
  const items = [...referencia, ...mutado, ...probe];

  // Sanidade fail-fast (NÃO entra no conteúdo — a bateria não prescreve vereditos):
  // todo item executa sem travar (1 veredito por evento), a referência correta completa,
  // toda referência buggy termina em buggy, e o setup de domínio casa o template do grafo.
  for (const item of items) {
    const res = executeTrace(v2, item.trace);
    if (res.steps.length !== item.trace.length) {
      throw new Error(`battery-gen: ${item.id}: executor devolveu ${res.steps.length}/${item.trace.length} passos`);
    }
    if (item.kind === "correta" && !(res.completed && res.steps.every((s) => s.verdict === "correct"))) {
      throw new Error(`battery-gen: ${item.id}: traço correto não completa no grafo lacrado`);
    }
    if (item.kind === "buggy" && res.steps.at(-1)?.verdict !== "buggy") {
      throw new Error(`battery-gen: ${item.id}: SAI buggy não reconhecido no grafo lacrado`);
    }
  }
  const setupCheck = executeTrace(v2, domainSetupTrace({
    numerator: ex.numerator,
    denominator: ex.denominator,
    rBound: ex.interfaceConfig?.rBound ?? 1,
    lineName: ex.interfaceConfig?.line_name || "numline",
  }));
  if (!setupCheck.steps.every((s) => s.verdict === "correct")) {
    throw new Error(`battery-gen: ${ex.id}: template de setup de domínio divergiu do grafo lacrado`);
  }

  return {
    battery: BATTERY_VERSION,
    exercise: ex.id,
    domain: {
      numerator: ex.numerator,
      denominator: ex.denominator,
      correctAnswer: `${ex.numerator}/${ex.denominator}`,
      rBound: ex.interfaceConfig?.rBound ?? 1,
    },
    items,
  };
}

// ───────────────────────── RULES.md (conteúdo ESTÁTICO — determinismo do hash) ─────────────────────────

const RULES_MD = `# Bateria congelada de traços — ${BATTERY_VERSION}

- **Versão**: v1 (congelada; qualquer mudança de regra exige v2 em novo diretório)
- **Data de congelamento**: 2026-07-13
- **Escopo**: 24 exercícios do corpus CTAT 6.17 (frações na reta numérica), 1 arquivo
  \`<exercicio>.json\` por exercício
- **Integridade**: \`MANIFEST.sha256\` lista o sha256 de cada arquivo (formato \`sha256sum -c\`)
- **Gerador**: \`battery-gen.mjs\` (determinístico: sem aleatoriedade, sem datas em conteúdo,
  decimais por aritmética inteira; rodar 2x produz bytes idênticos)

## Regras de geração

### Família A — "referencia" (extraída do BRD lacrado do especialista)
Permitido porque a bateria congela ANTES da próxima geração de grafos; o robô nunca lê
estes arquivos. Por exercício:
1. o traço correto completo (1ª transição correta de cada estado, do start ao estado final);
2. um traço por transição buggy: menor caminho correto (BFS) até o estado de origem + o SAI buggy;
3. um \`hintRequest\` no estado inicial.

### Família B — "mutado" (transformações determinísticas dos traços da família A)
Passo-alvo de resposta = o ÚLTIMO passo do traço correto com input semanticamente igual à
resposta do exercício (o AddPoint da reta). Mutações, nesta ordem:
1. **selecao-errada** — selection do passo de resposta trocada pela do passo anterior com
   selection diferente (outra selection EXISTENTE no traço);
2. **input-equivalente-fracao** — input do passo de resposta vira \`2·num/2·den\` (k=2);
3. **input-equivalente-decimal** — forma decimal exata, SÓ quando o denominador reduzido
   é da forma 2^a·5^b (senão o item não existe);
4. **ordem-alternativa** — os dois primeiros passos trocados;
5. **repeticao-primeiro-passo** — o primeiro passo duplicado;
6. **acao-apos-objetivo** — o último passo repetido após a conclusão.

### Família C — "probe" (gerador de domínio puro)
Entrada: SOMENTE numerador, denominador e rBound/line_name do answer key
(\`answer-key/frac-numberline-6.17.json\`) — nunca o BRD. O prefixo de setup é o template
fixo da interface compartilhada do dataset (showAnswer → writeFractionStep → set_maximum
→ F1 → F2 → denom), seguido de um AddPoint com o valor da sonda:
\`0\`, \`1\`, \`num/num\`, \`den/den\`, \`den/num\` (invertida), \`(num±1)/den\`, \`num/(den±1)\`
(omitida quando den−1=0), \`-num/den\`, decimal equivalente (só quando exata) e decimal
próxima NÃO equivalente (exata: +1 na última casa, mínimo 2 casas; dízima: truncamento em
2 casas). Dedupe LITERAL dentro da família (1ª ocorrência vence).

Nota de honestidade metodológica: algumas sondas COINCIDEM semanticamente com distratores
templatizados do especialista (ex.: \`(num−1)/den\` é o distrator "badCount" do corpus).
A independência da família C é de PROVENIÊNCIA (derivável do answer key sozinho), não de
disjunção de valores — é isso que o teste de regeneração trava.

## Limites
- **Profundidade máxima**: ${MAX_TRACE_DEPTH} eventos por traço.
- **Política para ciclos**: nenhum traço visita o mesmo estado mais de ${MAX_STATE_VISITS} vezes
  (guard nos construtores; o corpus 6.17 é acíclico no caminho correto).

## Formato do item
\`{ id, family: "referencia"|"mutado"|"probe", kind, trace[], expectedNote }\` — \`expectedNote\`
explica o porquê do item SEM prescrever veredito; \`trace[]\` são eventos
\`{ selection, action, input }\` ou \`{ hintRequest: true }\` executáveis pelo \`trace-executor.js\`.
`;

// ───────────────────────── geração + manifest ─────────────────────────

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

/**
 * generateBattery(opts) → gera a bateria completa em opts.outDir e devolve
 * { files: {nome→conteúdo}, manifest } (o manifest cobre todo arquivo, exceto ele próprio).
 */
export function generateBattery(opts = {}) {
  const casesDir = opts.casesDir || DEFAULTS.casesDir;
  const answerKeyPath = opts.answerKeyPath || DEFAULTS.answerKeyPath;
  const outDir = opts.outDir || DEFAULTS.outDir;

  if (!fs.existsSync(answerKeyPath)) {
    throw new Error(
      `battery-gen: answer key não encontrado em ${answerKeyPath} — gere-o com build-answer-key.mjs (W1)`
    );
  }
  const key = JSON.parse(fs.readFileSync(answerKeyPath, "utf8"));
  const exercises = [...key.exercises].sort((a, b) => a.id.localeCompare(b.id));

  const files = new Map(); // nome → conteúdo (ordem de inserção = ordem determinística)
  for (const ex of exercises) {
    const brdPath = path.join(casesDir, ex.id, "expert.brd");
    if (!fs.existsSync(brdPath)) throw new Error(`battery-gen: BRD ausente para ${ex.id} (${brdPath})`);
    const v2 = parseBrdToNeutralV2(fs.readFileSync(brdPath, "utf8"), { case: ex.id });
    const battery = buildExerciseBattery(v2, ex);
    files.set(`${ex.id}.json`, JSON.stringify(battery, null, 2) + "\n");
  }
  files.set("RULES.md", RULES_MD);

  const manifest =
    [...files.keys()]
      .sort()
      .map((name) => `${sha256(files.get(name))}  ${name}`)
      .join("\n") + "\n";

  fs.mkdirSync(outDir, { recursive: true });
  for (const [name, content] of files) fs.writeFileSync(path.join(outDir, name), content);
  fs.writeFileSync(path.join(outDir, "MANIFEST.sha256"), manifest);

  return { files, manifest, outDir };
}

// ───────────────────────── CLI ─────────────────────────

function main() {
  const args = process.argv.slice(2);
  const flag = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const { files, outDir } = generateBattery({
    outDir: flag("--out"),
    casesDir: flag("--cases"),
    answerKeyPath: flag("--key"),
  });

  const exerciseFiles = [...files.keys()].filter((n) => n.endsWith(".json"));
  let porFamilia = { referencia: 0, mutado: 0, probe: 0 };
  for (const name of exerciseFiles) {
    const b = JSON.parse(files.get(name));
    for (const item of b.items) porFamilia[item.family]++;
  }
  console.log(`Bateria ${BATTERY_VERSION} congelada em ${outDir}`);
  console.log(`  exercícios : ${exerciseFiles.length}`);
  console.log(
    `  itens      : ${porFamilia.referencia + porFamilia.mutado + porFamilia.probe} ` +
      `(referencia=${porFamilia.referencia}, mutado=${porFamilia.mutado}, probe=${porFamilia.probe})`
  );
  console.log(`  manifest   : ${path.join(outDir, "MANIFEST.sha256")}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
