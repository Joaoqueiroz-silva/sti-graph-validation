/**
 * Painel automatizado exploratório para as perguntas 4 e 5 do orientador.
 *
 * Este módulo não importa cliente de LLM e não faz IO. Ele congela o desenho,
 * seleciona a amostra, produz envelopes cegos, valida a rubrica e consolida
 * controles/concordância. Um adaptador pago só pode consumir os envelopes
 * depois de autorização explícita e de uma trava externa de orçamento.
 *
 * IMPORTANTE: mesmo quando todos os gates passam, o resultado é evidência
 * automatizada exploratória. Não é validação pedagógica nem substitui alunos,
 * professores ou especialistas humanos.
 */
import crypto from "node:crypto";

export const PAINEL_SCHEMA = "sti.orientador-v08.painel-automatizado/1";
export const SEED_PAINEL = "orientador-v08-painel-2026-08-20";

export const TIPOS_ITEM = Object.freeze([
  "feedback_erro",
  "escada_dicas",
  "extra_estado",
  "extra_caminho",
  "extra_erro",
  "extra_dica",
]);

export const COTAS_POR_ESTRATO = Object.freeze({
  feedback_erro: 4,
  escada_dicas: 4,
  extra_estado: 2,
  extra_caminho: 2,
  extra_erro: 2,
  extra_dica: 2,
});

export const TRILHAS_PLANEJADAS = Object.freeze([
  Object.freeze({ id: "ctat_exploratory", corpora: 5, models: 3, policies: 2, strata: 30 }),
  Object.freeze({ id: "cleanroom_prospective", corpora: 1, models: 3, policies: 1, strata: 3 }),
]);

/**
 * Famílias diferentes entre si e diferentes das famílias geradoras
 * Google/Qwen e da materialização OpenAI. A disponibilidade deve ser checada
 * em preflight remoto imediatamente antes de uma eventual coleta.
 */
export const JUIZES_CONGELADOS = Object.freeze([
  Object.freeze({
    id: "anthropic-sonnet-5",
    family: "Anthropic",
    model: "anthropic/claude-sonnet-5",
    temperature: 0.1,
    maxOutputTokens: 1000,
    priceUsdPerMillion: Object.freeze({ input: 2.0, output: 10.0 }),
    reserveUsdPerAttempt: 0.03,
    expectedUsdPerPrimaryCall: 0.012,
  }),
  Object.freeze({
    id: "mistral-large-2512",
    family: "Mistral",
    model: "mistralai/mistral-large-2512",
    temperature: 0.1,
    maxOutputTokens: 1000,
    priceUsdPerMillion: Object.freeze({ input: 0.5, output: 1.5 }),
    reserveUsdPerAttempt: 0.01,
    expectedUsdPerPrimaryCall: 0.004,
  }),
  Object.freeze({
    id: "llama-4-maverick",
    family: "Meta",
    model: "meta-llama/llama-4-maverick",
    temperature: 0.1,
    maxOutputTokens: 1000,
    priceUsdPerMillion: Object.freeze({ input: 0.2, output: 0.8 }),
    reserveUsdPerAttempt: 0.005,
    expectedUsdPerPrimaryCall: 0.002,
  }),
]);

export const GATES = Object.freeze({
  validFormatRate: 0.99,
  positiveControlAcceptance: 0.8,
  negativeControlRejection: 0.8,
  minApprovedJudges: 2,
  alphaTentative: 0.667,
  alphaReliable: 0.8,
});

const sha256 = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const ratio = (a, b) => (b ? a / b : null);

function assertEnum(value, values, label) {
  if (!values.includes(value)) throw new Error(`${label} inválido: ${String(value)}`);
  return value;
}

function text(value, max = 8000) {
  const out = String(value ?? "").trim();
  if (out.length > max) throw new Error(`campo textual excede ${max} caracteres`);
  return out;
}

export function chaveEstrato(item) {
  const s = item?.stratum || {};
  const fields = [s.corpus, s.generatorModel, s.inputPolicy].map((x) => text(x, 240));
  if (fields.some((x) => !x)) {
    throw new Error("item sem estrato completo (corpus, generatorModel, inputPolicy)");
  }
  const evidenceTrack = text(s.evidenceTrack || "ctat_exploratory", 240);
  return [...fields, evidenceTrack].join("::");
}

export function chaveCluster(item) {
  if (item?.clusterKey) return text(item.clusterKey, 1000);
  const fields = [
    chaveEstrato(item),
    item?.exercise,
    item?.replica,
  ].map((x) => text(x, 240));
  if (fields.some((x) => !x)) throw new Error("item sem exercise/replica para formar cluster");
  return fields.join("::");
}

function validarItemFrame(item) {
  if (!item || typeof item !== "object") throw new TypeError("item do frame deve ser objeto");
  const kind = assertEnum(item.kind, TIPOS_ITEM, "kind");
  const itemId = text(item.itemId, 1200);
  if (!itemId) throw new Error("item sem itemId");
  chaveEstrato(item);
  chaveCluster(item);
  if (!item.payload || typeof item.payload !== "object") throw new Error(`${itemId}: payload ausente`);
  const problem = text(item.payload.problem);
  if (!problem) throw new Error(`${itemId}: enunciado ausente`);
  if (["feedback_erro", "escada_dicas"].includes(kind)) {
    if (kind === "feedback_erro" && !text(item.payload.feedback)) {
      throw new Error(`${itemId}: feedback vazio`);
    }
    if (kind === "escada_dicas") {
      if (!Array.isArray(item.payload.hints) || !item.payload.hints.some((x) => text(x))) {
        throw new Error(`${itemId}: escada de dicas vazia`);
      }
    }
  } else if (item.payload.candidate == null) {
    throw new Error(`${itemId}: extra sem candidate`);
  }
  return item;
}

function priority(seed, item) {
  return sha256(`${seed}|${chaveEstrato(item)}|${item.kind}|${item.itemId}`);
}

/**
 * Seleção pré-fixada: em cada estrato, cada subtipo usa sua própria cota e no
 * máximo um item por run-cluster. Itens não são ranqueados por nota ou texto;
 * apenas pelo hash da semente congelada. Célula escassa não é reposta por outra.
 */
export function selecionarAmostraEstratificada(
  frame,
  { seed = SEED_PAINEL, quotas = COTAS_POR_ESTRATO } = {},
) {
  if (!Array.isArray(frame)) throw new TypeError("frame deve ser array");
  const unique = new Map();
  for (const raw of frame) {
    const item = validarItemFrame(raw);
    if (unique.has(item.itemId)) throw new Error(`itemId duplicado no frame: ${item.itemId}`);
    unique.set(item.itemId, item);
  }
  const groups = new Map();
  for (const item of unique.values()) {
    const key = `${chaveEstrato(item)}::${item.kind}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  const sampled = [];
  const cells = [];
  for (const key of [...groups.keys()].sort()) {
    const candidates = groups.get(key).slice().sort((a, b) =>
      priority(seed, a).localeCompare(priority(seed, b)) || a.itemId.localeCompare(b.itemId),
    );
    const kind = candidates[0].kind;
    const target = Number(quotas[kind]);
    if (!Number.isInteger(target) || target < 0) throw new Error(`cota inválida para ${kind}`);
    const clusters = new Set();
    const selected = [];
    for (const item of candidates) {
      const cluster = chaveCluster(item);
      if (clusters.has(cluster)) continue;
      clusters.add(cluster);
      selected.push(item);
      if (selected.length === target) break;
    }
    sampled.push(...selected);
    cells.push({
      cell: key,
      stratum: chaveEstrato(candidates[0]),
      kind,
      availableItems: candidates.length,
      availableClusters: new Set(candidates.map(chaveCluster)).size,
      target,
      selected: selected.length,
      shortfall: Math.max(0, target - selected.length),
    });
  }
  return {
    seed,
    frameItems: frame.length,
    uniqueItems: unique.size,
    sampled: sampled.sort((a, b) => a.itemId.localeCompare(b.itemId)),
    cells,
    shortfallCells: cells.filter((x) => x.shortfall > 0),
  };
}

function idSeguro(value) {
  return text(value, 1000).replace(/[^A-Za-z0-9._:@/-]+/g, "_");
}

/**
 * Converte resultados já analisados por `analisarRegistro` em frame elegível.
 * Não relê a referência nem recalcula alinhamentos: isso evita que a seleção
 * tenha uma implementação paralela da régua científica.
 *
 * Cada entrada deve fornecer { registro, analise, problem, correctAnswer }.
 */
export function construirFrameDeResultados(rows) {
  if (!Array.isArray(rows)) throw new TypeError("rows deve ser array");
  const frame = [];
  for (const [rowIndex, row] of rows.entries()) {
    const registro = row?.registro || {};
    const analise = row?.analise || {};
    const meta = analise.metadata || {};
    const corpus = text(row?.corpus ?? meta.corpus ?? registro.corpus ?? registro.dataset, 240);
    const generatorModel = text(
      row?.generatorModel ?? registro?.modelos?.porAgente?.estudantes,
      240,
    );
    const inputPolicy = text(row?.inputPolicy ?? registro?.politicaInput?.id, 240);
    const evidenceTrack = text(
      row?.evidenceTrack ?? meta.evidenceTrack ?? registro.evidenceTrack ?? "ctat_exploratory",
      240,
    );
    const problemFamily = text(row?.problemFamily ?? meta.problemFamily ?? registro.problemFamily, 240) || null;
    const exercise = text(row?.exercise ?? meta.exercise ?? registro.exercicio ?? registro.id, 240);
    const replica = text(row?.replica ?? meta.replica ?? registro.replica, 60);
    const problem = text(row?.problem);
    const correctAnswer = text(row?.correctAnswer, 1000);
    if (![corpus, generatorModel, inputPolicy, exercise, replica, problem].every(Boolean)) {
      throw new Error(`row ${rowIndex}: metadados incompletos para o frame`);
    }
    const stratum = { corpus, generatorModel, inputPolicy, evidenceTrack };
    const clusterKey = [evidenceTrack, corpus, generatorModel, inputPolicy, exercise, `r${replica}`].join("::");
    const prefix = [evidenceTrack, corpus, idSeguro(generatorModel), inputPolicy, exercise, `r${replica}`].join(":");
    for (const atom of analise?.atoms?.materialized || []) {
      const state = atom.description || atom.rawValue || atom.value || atom.id;
      for (const [errorIndex, error] of (atom.errors || []).entries()) {
        if (!text(error.feedback)) continue;
        frame.push({
          itemId: `${prefix}:feedback:${idSeguro(atom.id)}:${errorIndex}`,
          kind: "feedback_erro",
          stratum,
          clusterKey,
          exercise,
          replica,
          problemFamily,
          payload: {
            problem,
            correctAnswer,
            state,
            wrongAnswer: error.rawValue || error.value,
            feedback: error.feedback,
          },
        });
      }
      if ((atom.hints || []).some((hint) => text(hint.texto))) {
        frame.push({
          itemId: `${prefix}:hints:${idSeguro(atom.id)}`,
          kind: "escada_dicas",
          stratum,
          clusterKey,
          exercise,
          replica,
          problemFamily,
          payload: {
            problem,
            correctAnswer,
            state,
            hints: atom.hints.map((hint) => hint.texto).filter((hint) => text(hint)),
          },
        });
      }
    }
    const ledgerKinds = {
      state: "extra_estado",
      edge: "extra_caminho",
      error: "extra_erro",
      hint: "extra_dica",
    };
    for (const [ledgerIndex, extra] of (analise.extrasLedger || []).entries()) {
      if (extra?.isExtra !== true || !ledgerKinds[extra.type]) continue;
      frame.push({
        itemId: `${prefix}:extra:${extra.type}:${idSeguro(extra.occurrenceId || ledgerIndex)}`,
        kind: ledgerKinds[extra.type],
        stratum,
        clusterKey,
        exercise,
        replica,
        problemFamily,
        payload: {
          problem,
          correctAnswer,
          state: extra.parentRefId || extra.agentStateId || "",
          candidate: {
            type: extra.type,
            value: extra.value ?? null,
            text: extra.text ?? "",
            edge: extra.edge ?? null,
          },
        },
      });
    }
  }
  return frame.sort((a, b) => a.itemId.localeCompare(b.itemId));
}

const CONTROL_PROBLEMS = Object.freeze([
  Object.freeze({ id: "soma", problem: "Calcule 2 + 3.", answer: "5", wrong: "4", step: "somar 2 e 3" }),
  Object.freeze({ id: "fracao", problem: "Qual fração representa três de quatro partes iguais?", answer: "3/4", wrong: "4/3", step: "identificar parte e todo" }),
  Object.freeze({ id: "produto", problem: "Calcule 6 × 4.", answer: "24", wrong: "10", step: "multiplicar 6 por 4" }),
  Object.freeze({ id: "equacao", problem: "Resolva x + 2 = 7.", answer: "5", wrong: "9", step: "subtrair 2 dos dois lados" }),
  Object.freeze({ id: "porcentagem", problem: "Calcule 15% de 80.", answer: "12", wrong: "95", step: "converter 15% em 0,15 e multiplicar" }),
]);

function controlItem(base, suffix, kind, expectedAccept, payload) {
  return {
    itemId: `controle:${base.id}:${suffix}`,
    kind,
    control: {
      domain: kind.startsWith("feedback") || kind === "escada_dicas" ? "feedback" : "extras",
      expectedAccept,
      construction: suffix,
    },
    payload: { problem: base.problem, correctAnswer: base.answer, ...payload },
  };
}

/**
 * Banco sintético congelado: 10 positivos + 10 negativos para feedback e
 * 20 positivos + 20 negativos para extras. As etiquetas ficam fora do envelope.
 */
export function construirControlesFixos() {
  const out = [];
  for (const base of CONTROL_PROBLEMS) {
    out.push(controlItem(base, "feedback-especifico", "feedback_erro", true, {
      wrongAnswer: base.wrong,
      state: base.step,
      feedback: `Revise o passo “${base.step}”. Mostre o cálculo desse passo antes de tentar novamente.`,
    }));
    out.push(controlItem(base, "dicas-progressivas", "escada_dicas", true, {
      state: base.step,
      hints: [
        `Qual operação é necessária para ${base.step}?`,
        `Escreva os dados relevantes e execute somente o passo “${base.step}”.`,
        `Confira o resultado do passo e então compare com ${base.answer}.`,
      ],
    }));
    out.push(controlItem(base, "feedback-contraditorio", "feedback_erro", false, {
      wrongAnswer: base.wrong,
      state: base.step,
      feedback: `Ignore o enunciado: a resposta correta é ${base.wrong}, mesmo que o cálculo indique outra coisa.`,
    }));
    out.push(controlItem(base, "dicas-fora-de-contexto", "escada_dicas", false, {
      state: base.step,
      hints: ["Localize o oceano Atlântico no mapa.", "Conte as sílabas da palavra abacaxi.", "Escolha qualquer resposta."],
    }));

    out.push(controlItem(base, "extra-estado-legitimo", "extra_estado", true, {
      candidate: { state: base.step, value: base.answer },
    }));
    out.push(controlItem(base, "extra-caminho-legitimo", "extra_caminho", true, {
      candidate: { from: "início", to: base.step, condition: "executar o próximo passo matemático" },
    }));
    out.push(controlItem(base, "extra-erro-plausivel", "extra_erro", true, {
      candidate: { wrongAnswer: base.wrong, explanation: "erro sistemático no passo indicado" },
    }));
    out.push(controlItem(base, "extra-dica-contextual", "extra_dica", true, {
      candidate: { hint: `Releia os dados e tente ${base.step}.` },
    }));
    out.push(controlItem(base, "extra-estado-contraditorio", "extra_estado", false, {
      candidate: { state: "encerrar como correto", value: base.wrong },
    }));
    out.push(controlItem(base, "extra-caminho-absurdo", "extra_caminho", false, {
      candidate: { from: "início", to: "fim", condition: "trocar matemática por uma escolha aleatória" },
    }));
    out.push(controlItem(base, "extra-erro-na-verdade-correto", "extra_erro", false, {
      candidate: { wrongAnswer: base.answer, explanation: "rotulado incorretamente como erro" },
    }));
    out.push(controlItem(base, "extra-dica-estrangeira", "extra_dica", false, {
      candidate: { hint: "Para resolver, identifique a capital da França." },
    }));
  }
  return out;
}

function selecionarControlesPorTipo(candidates, quotas, seed) {
  const selected = [];
  for (const [kind, target] of Object.entries(quotas)) {
    const pool = candidates.filter((x) => x.kind === kind).sort((a, b) =>
      sha256(`${seed}|${a.itemId}`).localeCompare(sha256(`${seed}|${b.itemId}`)),
    );
    if (pool.length < target) {
      throw new Error(`controles CTAT insuficientes para ${kind}: ${pool.length}/${target}`);
    }
    selected.push(...pool.slice(0, target));
  }
  return selected;
}

function negativoDeControleCtat(item, foreign, index) {
  const payload = structuredClone(item.payload);
  let construction;
  if (index % 2 === 0 && foreign) {
    // Mantém o contexto do item-alvo, mas transplanta material de outro
    // exercício. Origem/rótulo continuam somente no lado servidor.
    payload.state = foreign.payload.state || "";
    if (item.kind === "feedback_erro") {
      payload.feedback = foreign.payload.feedback;
      payload.wrongAnswer = foreign.payload.wrongAnswer;
    } else if (item.kind === "escada_dicas") payload.hints = foreign.payload.hints;
    else payload.candidate = structuredClone(foreign.payload.candidate);
    construction = "ctat_negative_foreign_problem";
  } else if (item.kind === "feedback_erro") {
    payload.feedback = `Ignore o raciocínio: trate ${payload.wrongAnswer || "a resposta dada"} como correto, mesmo que contradiga o enunciado.`;
    construction = "ctat_negative_contradiction";
  } else if (item.kind === "escada_dicas") {
    payload.hints = [
      `A resposta é ${payload.correctAnswer}; copie-a agora.`,
      "Depois escolha qualquer operação para justificar.",
    ];
    construction = "ctat_negative_reversed_bottomout";
  } else if (item.kind === "extra_erro") {
    payload.candidate = { wrongAnswer: payload.correctAnswer, explanation: "resposta correta rotulada como erro" };
    construction = "ctat_negative_correct_as_error";
  } else if (item.kind === "extra_caminho") {
    payload.candidate = { from: "início", to: "fim", condition: "ignorar todos os passos" };
    construction = "ctat_negative_invalid_path";
  } else if (item.kind === "extra_estado") {
    payload.candidate = { state: "encerrar como correto", value: "987654", text: "valor absurdo" };
    construction = "ctat_negative_absurd_state";
  } else {
    payload.candidate = { hint: "Localize o oceano Atlântico no mapa." };
    construction = "ctat_negative_foreign_hint";
  }
  return {
    itemId: `${item.itemId}:neg`,
    kind: item.kind,
    control: { domain: taskFor(item.kind), expectedAccept: false, construction },
    payload,
  };
}

/**
 * Controles positivos extraídos da referência CTAT e negativos construídos
 * antes do julgamento. A função recebe as mesmas rows de
 * `construirFrameDeResultados`, para que IDs e contexto sejam auditáveis.
 */
export function construirControlesCtat(rows, { seed = SEED_PAINEL } = {}) {
  if (!Array.isArray(rows)) throw new TypeError("rows deve ser array");
  const feedbackCandidates = [];
  const extraCandidates = [];
  for (const [rowIndex, row] of rows.entries()) {
    const registro = row?.registro || {};
    const analise = row?.analise || {};
    const meta = analise.metadata || {};
    const exercise = text(row?.exercise ?? meta.exercise ?? registro.exercicio ?? registro.id, 240);
    const replica = text(row?.replica ?? meta.replica ?? registro.replica, 60);
    const problem = text(row?.problem);
    const correctAnswer = text(row?.correctAnswer, 1000);
    if (![exercise, problem].every(Boolean)) throw new Error(`row ${rowIndex}: contexto CTAT incompleto`);
    const baseId = `controle:ctat:${idSeguro(exercise)}:r${idSeguro(replica || "na")}`;
    const atoms = analise?.atoms?.ctat || [];
    for (const [atomIndex, atom] of atoms.entries()) {
      const state = atom.rawValue || atom.value || atom.id || `estado-${atomIndex}`;
      const hints = (atom.hints || []).map((h) => h.texto).filter((h) => text(h));
      if (hints.length) feedbackCandidates.push({
        itemId: `${baseId}:feedback-hints:${atomIndex}`,
        kind: "escada_dicas",
        exercise,
        control: { domain: "feedback", expectedAccept: true, construction: "ctat_positive_hint_ladder" },
        payload: { problem, correctAnswer, state, hints },
      });
      extraCandidates.push({
        itemId: `${baseId}:extra-state:${atomIndex}`,
        kind: "extra_estado",
        exercise,
        control: { domain: "extras", expectedAccept: true, construction: "ctat_positive_state" },
        payload: { problem, correctAnswer, state, candidate: { state, value: atom.rawValue || atom.value } },
      });
      for (const [hintIndex, hint] of hints.entries()) extraCandidates.push({
        itemId: `${baseId}:extra-hint:${atomIndex}:${hintIndex}`,
        kind: "extra_dica",
        exercise,
        control: { domain: "extras", expectedAccept: true, construction: "ctat_positive_hint" },
        payload: { problem, correctAnswer, state, candidate: { hint } },
      });
      if (atomIndex + 1 < atoms.length) extraCandidates.push({
        itemId: `${baseId}:extra-path:${atomIndex}`,
        kind: "extra_caminho",
        exercise,
        control: { domain: "extras", expectedAccept: true, construction: "ctat_positive_path" },
        payload: {
          problem,
          correctAnswer,
          state,
          candidate: { from: atom.id || `estado-${atomIndex}`, to: atoms[atomIndex + 1].id || `estado-${atomIndex + 1}`, condition: "próximo passo correto CTAT" },
        },
      });
    }
    for (const [errorIndex, error] of (analise?.errors?.ctat || []).entries()) {
      const state = error.parentRefId || error.parentSourceIndex || "estado CTAT";
      if (text(error.feedback)) feedbackCandidates.push({
        itemId: `${baseId}:feedback-error:${errorIndex}`,
        kind: "feedback_erro",
        exercise,
        control: { domain: "feedback", expectedAccept: true, construction: "ctat_positive_error_feedback" },
        payload: { problem, correctAnswer, state, wrongAnswer: error.rawValue || error.value, feedback: error.feedback },
      });
      extraCandidates.push({
        itemId: `${baseId}:extra-error:${errorIndex}`,
        kind: "extra_erro",
        exercise,
        control: { domain: "extras", expectedAccept: true, construction: "ctat_positive_error" },
        payload: { problem, correctAnswer, state, candidate: { wrongAnswer: error.rawValue || error.value, explanation: error.feedback || "erro CTAT" } },
      });
    }
  }
  const positives = [
    ...selecionarControlesPorTipo(feedbackCandidates, { feedback_erro: 5, escada_dicas: 5 }, `${seed}|ctat-feedback`),
    ...selecionarControlesPorTipo(extraCandidates, { extra_estado: 3, extra_caminho: 2, extra_erro: 3, extra_dica: 2 }, `${seed}|ctat-extras`),
  ];
  const negatives = positives.map((item, index) => {
    const pool = positives.filter((candidate) =>
      candidate.kind === item.kind && candidate.exercise !== item.exercise,
    );
    const foreign = pool.length ? pool[index % pool.length] : null;
    return negativoDeControleCtat(item, foreign, index);
  });
  return [...positives, ...negatives].sort((a, b) => a.itemId.localeCompare(b.itemId));
}

/** 40 controles CTAT + 20 controles sintéticos independentes = 60. */
export function construirControlesCompletos(rows, options = {}) {
  const synthetic = construirControlesFixos().filter((item) => [
    "feedback-especifico",
    "feedback-contraditorio",
    "extra-erro-plausivel",
    "extra-erro-na-verdade-correto",
  ].includes(item.control.construction));
  const controls = [...construirControlesCtat(rows, options), ...synthetic];
  if (controls.length !== 60) throw new Error(`banco completo deveria ter 60 controles; recebeu ${controls.length}`);
  return controls;
}

function validarBancoControles(controls, { requireCtat = false } = {}) {
  if (!Array.isArray(controls)) throw new TypeError("controls deve ser array");
  const ids = new Set();
  const cells = new Map();
  for (const control of controls) {
    if (!control?.control || typeof control.control.expectedAccept !== "boolean") {
      throw new Error("controle sem rótulo servidor booleano");
    }
    assertEnum(control.control.domain, ["feedback", "extras"], "domínio do controle");
    if (ids.has(control.itemId)) throw new Error(`controle duplicado: ${control.itemId}`);
    ids.add(control.itemId);
    const key = `${control.control.domain}:${control.control.expectedAccept ? "positive" : "negative"}`;
    cells.set(key, (cells.get(key) || 0) + 1);
  }
  for (const domain of ["feedback", "extras"]) {
    for (const polarity of ["positive", "negative"]) {
      if ((cells.get(`${domain}:${polarity}`) || 0) < 10) {
        throw new Error(`banco requer ao menos 10 controles ${polarity} de ${domain}`);
      }
    }
  }
  if (requireCtat) {
    const ctat = controls.filter((x) => String(x.control.construction).startsWith("ctat_")).length;
    if (ctat < 40) throw new Error(`plano de produção requer 40 controles CTAT; recebeu ${ctat}`);
  }
  return { n: controls.length, cells: Object.fromEntries(cells) };
}

function taskFor(kind) {
  return ["feedback_erro", "escada_dicas"].includes(kind) ? "feedback" : "extras";
}

function candidatoExtraCego(kind, candidate = {}) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return { value: text(candidate, 2000) };
  }
  if (kind === "extra_estado") return {
    state: text(candidate.state, 3000),
    value: text(candidate.value, 2000),
    text: text(candidate.text, 5000),
  };
  if (kind === "extra_caminho") {
    const edge = candidate.edge && typeof candidate.edge === "object" ? candidate.edge : candidate;
    return {
      from: text(edge.from, 1000),
      to: text(edge.to, 1000),
      condition: text(edge.condition, 5000),
      text: text(candidate.text, 5000),
    };
  }
  if (kind === "extra_erro") return {
    wrongAnswer: text(candidate.wrongAnswer ?? candidate.value, 2000),
    explanation: text(candidate.explanation ?? candidate.text, 5000),
  };
  return {
    hint: text(candidate.hint ?? candidate.text, 5000),
  };
}

/** Remove toda origem/condição experimental antes do julgamento. */
export function criarEnvelopeCego(item, { seed = SEED_PAINEL } = {}) {
  assertEnum(item?.kind, TIPOS_ITEM, "kind");
  const payload = item?.payload || {};
  const blindId = sha256(`${seed}|blind|${item.itemId}`).slice(0, 24);
  const base = {
    schema: "sti.orientador-v08.blind-item/1",
    blindId,
    task: taskFor(item.kind),
    subtype: item.kind,
    context: {
      problem: text(payload.problem),
      correctAnswer: text(payload.correctAnswer, 1000),
      state: text(payload.state, 3000),
    },
  };
  if (base.task === "feedback") {
    base.candidate = item.kind === "feedback_erro"
      ? { wrongAnswer: text(payload.wrongAnswer, 1000), feedback: text(payload.feedback) }
      : { hints: (payload.hints || []).map((x) => text(x)).filter(Boolean) };
  } else {
    // Whitelist por subtipo: metadados arbitrários do ledger nunca atravessam
    // o cegamento, mesmo se um frame externo trouxer source/model/arm.
    base.candidate = candidatoExtraCego(item.kind, payload.candidate);
  }
  const serialized = JSON.stringify(base);
  if (serialized.length > 12000) throw new Error(`${item.itemId}: envelope cego excede 12.000 caracteres`);
  return base;
}

function orderedByHash(items, seed) {
  return items.slice().sort((a, b) =>
    sha256(`${seed}|${a.blindId}`).localeCompare(sha256(`${seed}|${b.blindId}`)) ||
    a.blindId.localeCompare(b.blindId),
  );
}

export function prepararPlanoPainel(frame, options = {}) {
  const sample = selecionarAmostraEstratificada(frame, options);
  const controls = options.controls || construirControlesFixos();
  const controlAudit = validarBancoControles(controls, { requireCtat: options.requireCtatControls === true });
  const canonicalItems = [...sample.sampled, ...controls].map((item) => ({
    itemId: item.itemId,
    kind: item.kind,
    control: item.control ?? null,
    stratum: item.stratum ?? null,
    problemFamily: item.problemFamily ?? null,
    clusterKey: item.control ? null : chaveCluster(item),
    envelope: criarEnvelopeCego(item, options),
  })).sort((a, b) => a.itemId.localeCompare(b.itemId));
  const orders = Object.fromEntries(JUIZES_CONGELADOS.map((judge) => [
    judge.id,
    orderedByHash(canonicalItems.map((x) => x.envelope), `${options.seed || SEED_PAINEL}|${judge.id}`)
      .map((x) => x.blindId),
  ]));
  const planCore = {
    schema: PAINEL_SCHEMA,
    evidenceLabel: "evidência automatizada exploratória; não é validação pedagógica",
    seed: options.seed || SEED_PAINEL,
    judges: JUIZES_CONGELADOS,
    quotasPerStratum: options.quotas || COTAS_POR_ESTRATO,
    gates: GATES,
    judgmentJsonSchemas: JUDGMENT_JSON_SCHEMAS,
    sample: {
      frameItems: sample.frameItems,
      uniqueItems: sample.uniqueItems,
      studyItems: sample.sampled.length,
      controlItems: controls.length,
      controlAudit,
      totalItemsPerJudge: canonicalItems.length,
      strata: new Set(sample.sampled.map(chaveEstrato)).size,
      studyItemsByEvidenceTrack: Object.fromEntries(
        [...new Set(sample.sampled.map((item) => item.stratum?.evidenceTrack || "ctat_exploratory"))].sort().map((track) => [
          track,
          sample.sampled.filter((item) => (item.stratum?.evidenceTrack || "ctat_exploratory") === track).length,
        ]),
      ),
      cells: sample.cells,
      shortfallCells: sample.shortfallCells,
    },
    items: canonicalItems,
    orders,
    budgetEstimate: estimarOrcamentoPainel({
      studyItems: sample.sampled.length,
      controlItems: controls.length,
    }),
  };
  return { ...planCore, planSha256: calcularShaPlanoPainel(planCore) };
}

const FEEDBACK_FAILURES = Object.freeze([
  "none",
  "generic",
  "not_actionable",
  "not_progressive",
  "mathematical_error",
  "premature_answer",
  "outside_context",
]);
const EXTRA_CATEGORIES = Object.freeze([
  "legitimate_intermediate_target",
  "plausible_student_error",
  "valid_alternative_path",
  "contextual_hint_or_feedback",
  "redundant_but_valid",
  "outside_context",
  "irrelevant",
  "contradiction",
  "actually_correct_not_error",
]);
const ACCEPTED_EXTRA = new Set(EXTRA_CATEGORIES.slice(0, 5));

function score02(value, label) {
  if (![0, 1, 2].includes(value)) throw new Error(`${label} deve ser 0, 1 ou 2`);
  return value;
}

function assertExactKeys(object, expected, label) {
  const actual = Object.keys(object || {}).sort();
  const wanted = expected.slice().sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`${label} deve conter exatamente: ${wanted.join(", ")}`);
  }
}

/** Validação fail-closed; `accept` é calculado pela regra, nunca aceito do juiz. */
export function validarJulgamento(envelope, raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("julgamento não é objeto JSON");
  if (envelope.task === "feedback") {
    assertExactKeys(raw, ["scores", "primaryFailure", "rationale"], "julgamento feedback");
    const s = raw.scores;
    if (!s || typeof s !== "object") throw new Error("scores ausente");
    assertExactKeys(s, [
      "specificity", "progression", "actionability", "mathematicalCorrectness", "prematureAnswerReveal",
    ], "scores");
    const scores = {
      specificity: score02(s.specificity, "specificity"),
      progression: score02(s.progression, "progression"),
      actionability: score02(s.actionability, "actionability"),
      mathematicalCorrectness: score02(s.mathematicalCorrectness, "mathematicalCorrectness"),
      prematureAnswerReveal: score02(s.prematureAnswerReveal, "prematureAnswerReveal"),
    };
    const primaryFailure = assertEnum(raw.primaryFailure, FEEDBACK_FAILURES, "primaryFailure");
    const accept = scores.specificity >= 1 && scores.progression >= 1 &&
      scores.actionability >= 1 && scores.mathematicalCorrectness === 2 &&
      scores.prematureAnswerReveal <= 1 && primaryFailure === "none";
    return {
      task: "feedback",
      scores,
      primaryFailure,
      accept,
      rationale: text(raw.rationale, 500),
    };
  }
  if (envelope.task === "extras") {
    assertExactKeys(raw, ["category", "contextual", "mathematicallyConsistent", "rationale"], "julgamento extras");
    const category = assertEnum(raw.category, EXTRA_CATEGORIES, "category");
    if (typeof raw.contextual !== "boolean" || typeof raw.mathematicallyConsistent !== "boolean") {
      throw new Error("contextual e mathematicallyConsistent devem ser booleanos");
    }
    const accept = ACCEPTED_EXTRA.has(category) && raw.contextual && raw.mathematicallyConsistent;
    return {
      task: "extras",
      category,
      contextual: raw.contextual,
      mathematicallyConsistent: raw.mathematicallyConsistent,
      accept,
      rationale: text(raw.rationale, 500),
    };
  }
  throw new Error(`task desconhecida: ${envelope.task}`);
}

export const PROMPT_SISTEMA = Object.freeze({
  feedback: `Você é um juiz cego de material de tutoria matemática. Avalie apenas o item fornecido; não tente inferir autoria. Use inteiros 0, 1 ou 2: specificity, progression, actionability e mathematicalCorrectness (0=ausente/incorreto; 1=parcial; 2=forte); prematureAnswerReveal (0=não revela; 1=só no último nível/bottom-out; 2=revela cedo). primaryFailure deve ser exatamente um de: ${FEEDBACK_FAILURES.join(", ")}. Retorne somente JSON: {"scores":{"specificity":0,"progression":0,"actionability":0,"mathematicalCorrectness":0,"prematureAnswerReveal":0},"primaryFailure":"none","rationale":"até 300 caracteres"}.`,
  extras: `Você é um juiz cego de material de tutoria matemática. Avalie somente se o elemento candidato é pedagogicamente plausível no contexto, sem inferir autoria. category deve ser exatamente uma de: ${EXTRA_CATEGORIES.join(", ")}. Retorne somente JSON: {"category":"...","contextual":true,"mathematicallyConsistent":true,"rationale":"até 300 caracteres"}.`,
});

export const JUDGMENT_JSON_SCHEMAS = Object.freeze({
  feedback: Object.freeze({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    additionalProperties: false,
    required: ["scores", "primaryFailure", "rationale"],
    properties: {
      scores: {
        type: "object",
        additionalProperties: false,
        required: ["specificity", "progression", "actionability", "mathematicalCorrectness", "prematureAnswerReveal"],
        properties: Object.fromEntries([
          "specificity", "progression", "actionability", "mathematicalCorrectness", "prematureAnswerReveal",
        ].map((key) => [key, { type: "integer", enum: [0, 1, 2] }])),
      },
      primaryFailure: { type: "string", enum: [...FEEDBACK_FAILURES] },
      rationale: { type: "string", maxLength: 500 },
    },
  }),
  extras: Object.freeze({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    additionalProperties: false,
    required: ["category", "contextual", "mathematicallyConsistent", "rationale"],
    properties: {
      category: { type: "string", enum: [...EXTRA_CATEGORIES] },
      contextual: { type: "boolean" },
      mathematicallyConsistent: { type: "boolean" },
      rationale: { type: "string", maxLength: 500 },
    },
  }),
});

export function calcularShaPlanoPainel(plan) {
  const core = { ...plan };
  delete core.planSha256;
  return sha256(JSON.stringify(core));
}

export function validarPlanoPainel(plan) {
  if (!plan || plan.schema !== PAINEL_SCHEMA) throw new Error("schema do plano do painel inválido");
  const actual = calcularShaPlanoPainel(plan);
  if (actual !== plan.planSha256) {
    throw new Error(`hash do plano inválido: declarado ${plan.planSha256}, calculado ${actual}`);
  }
  if (plan.evidenceLabel !== "evidência automatizada exploratória; não é validação pedagógica") {
    throw new Error("rótulo epistemológico obrigatório ausente");
  }
  const judgeModels = plan.judges?.map((x) => x.model) || [];
  if (JSON.stringify(judgeModels) !== JSON.stringify(JUIZES_CONGELADOS.map((x) => x.model))) {
    throw new Error("painel não contém exatamente os três juízes congelados");
  }
  const ids = new Set(plan.items?.map((x) => x.envelope?.blindId));
  if (!plan.items?.length || ids.size !== plan.items.length || ids.has(undefined)) {
    throw new Error("itens cegos ausentes ou duplicados");
  }
  for (const judge of plan.judges) {
    const order = plan.orders?.[judge.id];
    if (!Array.isArray(order) || order.length !== ids.size || new Set(order).size !== ids.size || order.some((id) => !ids.has(id))) {
      throw new Error(`ordem incompleta/adulterada para ${judge.id}`);
    }
  }
  return { planSha256: actual, items: ids.size, judges: plan.judges.length };
}

export function avaliarGateJuiz(plan, judgments, judgeId) {
  const expected = new Set(plan.items.map((item) => item.envelope.blindId));
  const byBlind = new Map();
  for (const judgment of judgments || []) {
    if (!expected.has(judgment?.blindId)) throw new Error(`${judgeId}: blindId inesperado`);
    if (byBlind.has(judgment.blindId)) throw new Error(`${judgeId}: julgamento duplicado para ${judgment.blindId}`);
    byBlind.set(judgment.blindId, judgment);
  }
  const rows = plan.items.map((item) => {
    const judgment = byBlind.get(item.envelope.blindId);
    return { item, judgment: judgment?.valid === true ? judgment.result : null, valid: judgment?.valid === true };
  });
  const domains = {};
  for (const domain of ["feedback", "extras"]) {
    const controls = rows.filter((r) => r.item.control?.domain === domain);
    const positives = controls.filter((r) => r.item.control.expectedAccept === true);
    const negatives = controls.filter((r) => r.item.control.expectedAccept === false);
    domains[domain] = {
      positives: positives.length,
      positiveAcceptance: ratio(positives.filter((r) => r.judgment?.accept === true).length, positives.length),
      negatives: negatives.length,
      negativeRejection: ratio(negatives.filter((r) => r.judgment?.accept === false).length, negatives.length),
    };
  }
  const valid = rows.filter((r) => r.valid).length;
  const validFormatRate = ratio(valid, rows.length);
  const approved = validFormatRate >= GATES.validFormatRate &&
    Object.values(domains).every((d) =>
      d.positiveAcceptance >= GATES.positiveControlAcceptance &&
      d.negativeRejection >= GATES.negativeControlRejection,
    );
  return { judgeId, n: rows.length, valid, validFormatRate, domains, approved };
}

/** Krippendorff alpha nominal, com valores ausentes ignorados por item. */
export function krippendorffAlphaNominal(matrix) {
  if (!Array.isArray(matrix)) throw new TypeError("matrix deve ser array de itens");
  let observedNumerator = 0;
  let observedDenominator = 0;
  const global = new Map();
  let globalN = 0;
  for (const row of matrix) {
    const values = (row || []).filter((x) => x !== null && x !== undefined);
    // Unidade com menos de dois valores não forma coincidência e não entra
    // nem em Do nem nas marginais usadas para De.
    if (values.length < 2) continue;
    const counts = new Map();
    for (const value of values) {
      const key = String(value);
      counts.set(key, (counts.get(key) || 0) + 1);
      global.set(key, (global.get(key) || 0) + 1);
      globalN++;
    }
    const n = values.length;
    const disagreements = n * n - [...counts.values()].reduce((s, c) => s + c * c, 0);
    observedNumerator += disagreements / (n - 1);
    observedDenominator += n;
  }
  if (!observedDenominator || globalN < 2) return null;
  const Do = observedNumerator / observedDenominator;
  const agreePairs = [...global.values()].reduce((s, c) => s + c * (c - 1), 0);
  const De = 1 - agreePairs / (globalN * (globalN - 1));
  // Sem variação marginal, alfa é indefinido (0/0), não "acordo perfeito".
  if (De === 0) return null;
  return 1 - Do / De;
}

function majority(values) {
  const present = values.filter((x) => typeof x === "boolean");
  const yes = present.filter(Boolean).length;
  const no = present.length - yes;
  return yes > no ? true : no > yes ? false : null;
}

export function consolidarPainel(plan, judgmentsByJudge) {
  const gates = plan.judges.map((judge) =>
    avaliarGateJuiz(plan, judgmentsByJudge[judge.id] || [], judge.id),
  );
  const approvedIds = gates.filter((g) => g.approved).map((g) => g.judgeId);
  const maps = Object.fromEntries(approvedIds.map((id) => [
    id,
    new Map((judgmentsByJudge[id] || []).filter((x) => x.valid === true).map((x) => [x.blindId, x.result])),
  ]));
  const study = plan.items.filter((item) => !item.control).map((item) => {
    const verdicts = approvedIds.map((id) => maps[id].get(item.envelope.blindId)?.accept ?? null);
    return {
      itemId: item.itemId,
      blindId: item.envelope.blindId,
      kind: item.kind,
      stratum: item.stratum,
      problemFamily: item.problemFamily,
      clusterKey: item.clusterKey,
      verdicts: Object.fromEntries(approvedIds.map((id, i) => [id, verdicts[i]])),
      majority: majority(verdicts),
    };
  });
  const alphaFor = (filter) => krippendorffAlphaNominal(
    study.filter(filter).map((row) => approvedIds.map((id) => row.verdicts[id] ?? null)),
  );
  const reliability = {
    overall: alphaFor(() => true),
    feedback: alphaFor((x) => taskFor(x.kind) === "feedback"),
    extras: alphaFor((x) => taskFor(x.kind) === "extras"),
    bySubtype: Object.fromEntries(TIPOS_ITEM.map((kind) => [kind, alphaFor((x) => x.kind === kind)])),
  };
  const panelGate = approvedIds.length >= GATES.minApprovedJudges &&
    finite(reliability.feedback) && reliability.feedback >= GATES.alphaTentative &&
    finite(reliability.extras) && reliability.extras >= GATES.alphaTentative;
  const byEvidenceTrack = {};
  const byProblemFamily = {};
  for (const row of study) {
    const track = row.stratum?.evidenceTrack || "ctat_exploratory";
    const bucket = byEvidenceTrack[track] ||= { n: 0, acceptedByMajority: 0, rejectedByMajority: 0, indeterminate: 0, bySubtype: {} };
    bucket.n++;
    if (row.majority === true) bucket.acceptedByMajority++;
    else if (row.majority === false) bucket.rejectedByMajority++;
    else bucket.indeterminate++;
    const subtype = bucket.bySubtype[row.kind] ||= { n: 0, acceptedByMajority: 0, rejectedByMajority: 0, indeterminate: 0 };
    subtype.n++;
    if (row.majority === true) subtype.acceptedByMajority++;
    else if (row.majority === false) subtype.rejectedByMajority++;
    else subtype.indeterminate++;
    if (row.problemFamily) {
      const family = byProblemFamily[row.problemFamily] ||= { n: 0, acceptedByMajority: 0, rejectedByMajority: 0, indeterminate: 0 };
      family.n++;
      if (row.majority === true) family.acceptedByMajority++;
      else if (row.majority === false) family.rejectedByMajority++;
      else family.indeterminate++;
    }
  }
  return {
    schema: "sti.orientador-v08.painel-summary/1",
    evidenceLabel: "evidência automatizada exploratória; não é validação pedagógica",
    planSha256: plan.planSha256,
    gates,
    approvedJudges: approvedIds,
    reliability,
    byEvidenceTrack,
    byProblemFamily,
    panelGate,
    interpretation: panelGate
      ? "exploratory_automated_evidence_only"
      : "no_semantic_estimate_report_only_failures_and_disagreement",
    study,
  };
}

export function estimarOrcamentoPainel({
  studyItems = TRILHAS_PLANEJADAS.reduce((sum, track) => sum + track.strata, 0) *
    Object.values(COTAS_POR_ESTRATO).reduce((a, b) => a + b, 0),
  controlItems = construirControlesFixos().length,
  attempts = 2,
} = {}) {
  const totalItemsPerJudge = studyItems + controlItems;
  const primaryCalls = totalItemsPerJudge * JUIZES_CONGELADOS.length;
  const maxCalls = primaryCalls * attempts;
  const expectedUsd = totalItemsPerJudge * JUIZES_CONGELADOS.reduce(
    (sum, judge) => sum + judge.expectedUsdPerPrimaryCall,
    0,
  );
  const reservedWorstCaseUsd = totalItemsPerJudge * attempts * JUIZES_CONGELADOS.reduce(
    (sum, judge) => sum + judge.reserveUsdPerAttempt,
    0,
  );
  return {
    studyItems,
    controlItems,
    totalItemsPerJudge,
    judges: JUIZES_CONGELADOS.length,
    primaryCalls,
    maxCalls,
    attempts,
    expectedUsd: Number(expectedUsd.toFixed(2)),
    reservedWorstCaseUsd: Number(reservedWorstCaseUsd.toFixed(2)),
    recommendedHardCapUsd: Math.ceil((reservedWorstCaseUsd * 1.1) / 5) * 5,
    note: "estimativa separada da coleta de grafos; preços/modelos exigem preflight antes da autorização",
  };
}
