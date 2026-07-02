/**
 * evaluation/schema.js — Esquema NEUTRO de grafo + normalizadores.
 *
 * O comparador NÃO compara o formato bruto. Ele normaliza qualquer grafo
 * (um behaviorGraph do EducaOFF, ou um grafo de especialista) para um esquema
 * NEUTRO de "itens com chave canônica", e então alinha por essas chaves.
 *
 * Ancoragem objetiva (é o que dissolve a subjetividade do pareamento):
 *   - passo (step)        → chave = resposta esperada canônica, ou o KC, ou a ordem
 *   - erro (misconception)→ chave = wrongAnswer canônico   ← ÂNCORA OBJETIVA
 *   - aresta (transition) → (chaveDe→chavePara, papel)
 *
 * Esquema neutro:
 *   {
 *     meta: { source, problem? },
 *     steps:          [{ key, answer, kc, order }],
 *     misconceptions: [{ key, wrongAnswer, stepKey }],
 *     transitions:    [{ from, to, role }]   // role ∈ correct|default|back (backbone)
 *   }
 */

/** Canonicaliza um rótulo: tira acento, espaço, caixa e pontuação final. "42 " → "42". */
export function canon(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[.,;:!?]+$/g, "");
}

function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

/** Fração reduzida em string canônica: (0,4)→"0", (2,8)→"1/4", (-1,4)→"-1/4". */
function reduceFraction(num, den) {
  if (den < 0) {
    num = -num;
    den = -den;
  }
  const g = gcd(num, den);
  const n = num / g;
  const d = den / g;
  return d === 1 ? String(n) : `${n}/${d}`;
}

/** Decimal → fração canônica de denominador pequeno (≤100), se houver: 0.25→"1/4". */
function decimalToFractionKey(x) {
  for (let d = 2; d <= 100; d++) {
    const n = Math.round(x * d);
    if (Math.abs(n / d - x) < 1e-9) return reduceFraction(n, d);
  }
  return String(parseFloat(x.toFixed(6)));
}

/**
 * Âncora SEMÂNTICA de resposta: normaliza frações/decimais para uma forma canônica
 * comparável, de modo que valores conceitualmente iguais casem (independente da grafia):
 *   "0/4"≡"0", "2/8"≡"1/4"≡"0.25", "1,5"≡"3/2". Valores não-numéricos caem em canon().
 *
 * 2026-06-26 (refino de âncora): sem isso, o F1 penalizava o robô por escrever a MESMA
 * resposta de forma diferente do especialista (ex.: "0/4" vs "0"), inflando a diferença
 * estrutural com um artefato de grafia. Aqui medimos CONCEITO. Para inteiros e texto o
 * resultado é idêntico a canon() — os casos não-fracionários existentes não mudam.
 */
export function canonAnswer(s) {
  const raw = String(s ?? "").trim();
  if (raw === "") return "";
  const fr = raw.match(/^(-?\d+)\s*\/\s*(-?\d+)$/);
  if (fr) {
    const den = parseInt(fr[2], 10);
    if (den !== 0) return reduceFraction(parseInt(fr[1], 10), den);
  }
  const dec = raw.replace(",", ".");
  if (/^-?\d+(\.\d+)?$/.test(dec)) {
    const n = parseFloat(dec);
    return Number.isInteger(n) ? String(n) : decimalToFractionKey(n);
  }
  return canon(raw);
}

/**
 * Chave canônica de uma MISCONCEPTION — a MESMA cadeia de fallback em todos os fluxos
 * (metrics.js via normalize* e run-judge.mjs). 2026-07-02 (verificação adversarial):
 * run-judge usava só canonAnswer(wrongAnswer) enquanto o normalizador cai para
 * description/id quando wrongAnswer é vazio → completudes DIFERENTES para o mesmo
 * grafo (repro: 0.5 vs 1.0). Uma fonte de verdade única elimina a classe de bug.
 */
export function miscKey(m) {
  return (
    canonAnswer(m?.wrongAnswer ?? "") ||
    canon(m?.description ?? "") ||
    canon(m?.id ?? m?.misconceptionId ?? "")
  );
}

/** Classifica a condição de uma aresta em um papel canônico. */
export function bucketRole(condition) {
  const c = canon(condition);
  if (/misconception/.test(c)) return "misconception";
  if (/struggle/.test(c)) return "struggle";
  if (/correct/.test(c)) return "correct";
  if (/back|retry|return|voltar/.test(c)) return "back";
  return "default";
}

/**
 * behaviorGraph do EducaOFF ({nodes,edges}) → esquema neutro.
 * Só considera o "backbone" (arestas para frente) nas transições — a estrutura
 * de erro é capturada nos itens de misconception (node-F1), não nas arestas.
 */
export function normalizeEducaoff(graph, meta = {}) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  const idToKey = new Map();

  const stepNodes = nodes.filter((n) => n.type === "step");
  const steps = stepNodes.map((n, i) => {
    const answer = n.expectedInput?.value ?? null;
    const kc = Array.isArray(n.knowledgeComponents)
      ? n.knowledgeComponents[0]
      : (n.knowledgeComponents ?? null);
    const key = canonAnswer(answer) || canon(kc) || `step#${i + 1}`;
    idToKey.set(n.id, key);
    return { key, answer, kc, order: i + 1 };
  });

  const startNode = nodes.find((n) => n.type === "start");
  const goalNode = nodes.find((n) => n.type === "goal");
  idToKey.set(startNode?.id ?? "start", "START");
  idToKey.set(goalNode?.id ?? "goal", "GOAL");
  for (const n of nodes.filter((n) => n.type === "scaffold")) {
    idToKey.set(n.id, "SCAF:" + canon(n.targetMisconception));
  }

  const misconceptions = [];
  for (const n of stepNodes) {
    for (const m of n.misconceptions || []) {
      const wrongAnswer = m.wrongAnswer ?? "";
      const key = miscKey(m);
      if (!key) continue;
      misconceptions.push({
        key,
        wrongAnswer: String(wrongAnswer),
        stepKey: idToKey.get(n.id),
        mechanical: !!m.mechanical,
      });
    }
  }

  const transitions = [];
  for (const e of edges) {
    const role = bucketRole(e.condition);
    if (role === "misconception" || role === "struggle") continue; // só backbone
    const from = idToKey.get(e.from);
    const to = idToKey.get(e.to);
    if (!from || !to) continue;
    transitions.push({ from, to, role });
  }

  return {
    meta: { source: "educaoff", ...meta },
    steps,
    misconceptions,
    transitions,
  };
}

/** Valida/completa um grafo já em esquema neutro (recalcula chaves ausentes). */
export function normalizeNeutral(obj, meta = {}) {
  const steps = (obj.steps || []).map((s, i) => ({
    key: s.key || canonAnswer(s.answer) || canon(s.kc) || `step#${i + 1}`,
    answer: s.answer ?? null,
    kc: s.kc ?? null,
    order: s.order ?? i + 1,
  }));
  const misconceptions = (obj.misconceptions || []).map((m) => ({
    key: m.key || miscKey(m),
    wrongAnswer: String(m.wrongAnswer ?? ""),
    stepKey: m.stepKey ?? null,
    mechanical: !!m.mechanical,
  }));
  const transitions = (obj.transitions || []).map((t) => ({
    from: t.from,
    to: t.to,
    role: t.role || "correct",
  }));
  return {
    meta: { source: "neutral", ...(obj.meta || {}), ...meta },
    steps,
    misconceptions,
    transitions,
  };
}

/** Detecta o formato de entrada e retorna o grafo neutro. */
export function toNeutral(input, meta = {}) {
  if (input && Array.isArray(input.nodes) && Array.isArray(input.edges)) {
    return normalizeEducaoff(input, meta);
  }
  if (input && Array.isArray(input.steps)) {
    return normalizeNeutral(input, meta);
  }
  throw new Error(
    "toNeutral: formato não reconhecido (esperado {nodes,edges} do EducaOFF ou {steps,...} neutro)"
  );
}

/**
 * ADAPTADOR CTAT (.brd) — esboço documentado.
 *
 * O grafo do CTAT é um XML (.brd) cujas arestas carregam triplas SAI
 * (Selection, Action, Input). Para comparar, mapeie:
 *   - cada <edge>/<actionLabel> SAI → uma transição (e o erro vira misconception
 *     quando a aresta é marcada como "bug"/"incorrect");
 *   - o Input do passo correto → answer do step;
 *   - o Input de uma aresta-bug → wrongAnswer da misconception (a ÂNCORA).
 *
 * Como o dialeto exato de .brd varia por versão do CTAT, deixe este parser
 * para ajustar quando você tiver um .brd real em mãos. Por ora ele aceita um
 * JSON já intermediário {sai:[{selection,action,input,correct,step}]}.
 */
export function ctatIntermediateToNeutral(intermediate, meta = {}) {
  const steps = [];
  const misconceptions = [];
  const seenStep = new Map();
  for (const a of intermediate.sai || []) {
    const stepKey = canon(a.step) || canon(a.selection) || `step#${steps.length + 1}`;
    if (a.correct !== false) {
      if (!seenStep.has(stepKey)) {
        seenStep.set(stepKey, true);
        steps.push({
          key: stepKey,
          answer: a.input ?? null,
          kc: a.kc ?? null,
          order: steps.length + 1,
        });
      }
    } else {
      misconceptions.push({
        key: canonAnswer(a.input) || canon(a.bugMessage),
        wrongAnswer: String(a.input ?? ""),
        stepKey,
      });
    }
  }
  const transitions = steps.map((s, i) => ({
    from: i === 0 ? "START" : steps[i - 1].key,
    to: s.key,
    role: i === 0 ? "default" : "correct",
  }));
  if (steps.length)
    transitions.push({ from: steps[steps.length - 1].key, to: "GOAL", role: "correct" });
  return { meta: { source: "ctat", ...meta }, steps, misconceptions, transitions };
}
