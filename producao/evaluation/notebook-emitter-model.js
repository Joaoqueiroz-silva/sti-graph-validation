/**
 * Modelo do que cada INSTRUMENTO do caderno consegue EMITIR.
 *
 * 2026-08-16 (caderno F0', stream G): no modo worksheet uma celula de papel C
 * nao tem campo proprio; ela aponta um alvo (target) de um instrumento
 * compartilhado (problem.notebook.instrument). A pergunta que a auditoria
 * precisa responder para essa celula nao e "o gabarito e digitavel?" (regua de
 * entrada digitada de interface-audit.js), e sim "o componente do frontend, ao
 * ser acionado naquele alvo, consegue produzir uma string que o matcher aceita
 * como este gabarito?". Este modulo e a resposta, escrita a partir do que os
 * renderers reais emitem hoje (lidos em 2026-08-16):
 *
 *   number_line       NumberLine.jsx           onSelect(String(placedAt))   inteiro em [min,max]
 *   fraction_bar      FractionBar.jsx          onSelect(`${k}/${den}`)      k partes pintadas de den
 *   highlight_in_text HighlightInText.jsx      onSelect(option.value)       token do texto que casa com uma option
 *   table             VisualInputs.TableInput  onSubmit(valores.join(", ")) valor digitado na celula editavel
 *   cell_diagram      CellDiagram.jsx          onSelect(organelle.id)       id de organela do cellType
 *
 * Modulo PURO (sem imports do registro nem do frontend): a lista de instrumentos
 * v1 e FECHADA (NOTEBOOK_C_V1 em shared/component-sets.js) e cada entrada aqui
 * espelha o renderer citado. Se um renderer mudar o que emite, este arquivo e o
 * unico lugar a atualizar, e o teste caderno-f0p-notebook-emitter-model trava o
 * contrato.
 *
 * Contrato: canTargetEmit({ instrument, target, expectedAnswer, spec }) ->
 *   { ok: true,  reason: null, canonical: <string que o componente emitiria> }
 *   { ok: false, reason: <codigo>, detail?: <texto curto> }
 * `spec` (opcional) e a spec do registro (components/*.js) para cruzar
 * notebook.targets.kinds; sem ela vale o modelo interno.
 */

/** Tipo de alvo que cada instrumento v1 sabe resolver (espelho das specs). */
export const NOTEBOOK_INSTRUMENT_TARGET_KIND = Object.freeze({
  number_line: "marker",
  fraction_bar: "bar",
  highlight_in_text: "span",
  table: "cell",
  cell_diagram: "organelle",
});

/**
 * Ids de organela que CellDiagram.jsx emite por cellType (base, sem os sufixos
 * numericos das copias visuais "mitocondria2", "ribossomo3": a copia emite o id
 * com sufixo, entao um gabarito so e seguro quando aponta o id base, que e o
 * unico presente tambem na lista acessivel do componente e no registro).
 */
export const CELL_DIAGRAM_ORGANELLES = Object.freeze({
  animal: Object.freeze([
    "membrana_plasmatica",
    "citoplasma",
    "nucleo",
    "nucleolo",
    "mitocondria",
    "reticulo",
    "ribossomo",
    "golgi",
    "lisossomo",
  ]),
  plant: Object.freeze([
    "parede_celular",
    "membrana_plasmatica",
    "citoplasma",
    "nucleo",
    "cloroplasto",
    "vacuolo",
    "mitocondria",
    "reticulo",
    "ribossomo",
  ]),
});

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function fail(reason, detail) {
  return { ok: false, reason, ...(detail ? { detail } : {}) };
}

function pass(canonical) {
  return { ok: true, reason: null, canonical: String(canonical) };
}

/** Mesma normalizacao de HighlightInText.jsx (acento, caixa, pontuacao). */
export function normalizeHighlightToken(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[.,!?;:¿¡"'“”‘’]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Resolve o alvo: aceita o objeto do alvo, ou o id (string) que sera procurado
 * em instrument.targets. Devolve null quando nao encontra.
 */
export function resolveNotebookTarget(instrument, target) {
  if (target && typeof target === "object") return target;
  const id = String(target ?? "").trim();
  if (!id) return null;
  return asArray(instrument?.targets).find((item) => String(item?.id ?? "") === id) ?? null;
}

function emitNumberLine({ props, expected }) {
  const min = Number(props.min);
  const max = Number(props.max);
  if (!Number.isFinite(min) || !Number.isFinite(max) || !(min < max)) {
    return fail("RANGE_INVALID", `min=${props.min} max=${props.max}`);
  }
  // NumberLine.jsx: fromPx faz Math.round e o <input type=range step=1> so anda
  // em inteiros; onSelect(String(placedAt)). Nao existe emissao decimal.
  const numero = Number(expected.replace(",", "."));
  if (!/^[+-]?\d+([.,]0+)?$/.test(expected) || !Number.isInteger(numero)) {
    return fail("EA_NOT_INTEGER", expected);
  }
  if (numero < min || numero > max) {
    return fail("EA_OUT_OF_RANGE", `${numero} fora de [${min}, ${max}]`);
  }
  return pass(String(numero));
}

function emitFractionBar({ instrument, props, expected }) {
  // FractionBar.jsx so e interativo sem options, sem mode e com denominator
  // finito > 0; fora disso vira visual (identify/equivalence/sum) ou MC.
  if (asArray(props.options).length || asArray(instrument?.options).length) {
    return fail("NOT_INTERACTIVE", "fraction_bar com options vira multipla escolha");
  }
  if (props.mode) {
    return fail("NOT_INTERACTIVE", `fraction_bar em mode=${props.mode} e so visualizacao`);
  }
  const den = Number(props.denominator);
  if (!Number.isInteger(den) || den <= 0) {
    return fail("DENOMINATOR_INVALID", `denominator=${props.denominator}`);
  }
  const match = expected.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!match) return fail("EA_NOT_FRACTION", expected);
  const k = Number(match[1]);
  const d = Number(match[2]);
  if (d !== den) return fail("DENOMINATOR_MISMATCH", `${expected} vs denominator=${den}`);
  if (k > den) return fail("NUMERATOR_OUT_OF_RANGE", `${k} > ${den} partes`);
  return pass(`${k}/${den}`);
}

function emitHighlightInText({ instrument, props, targetObj, expected }) {
  const text = String(props.text ?? "");
  if (!text.trim()) return fail("TEXT_MISSING");
  const alvo = normalizeHighlightToken(expected);
  if (!alvo) return fail("EA_EMPTY");
  // Instrumento v1: alvo 'span' de UMA palavra. HighlightInText.jsx ate aceita
  // uma unica frase clicavel (a option mais longa com espaco), mas o contrato do
  // caderno e um token; frase e regua de outra versao.
  if (alvo.includes(" ")) return fail("EA_NOT_SINGLE_WORD", expected);
  const tokens = text.split(/\s+/).map(normalizeHighlightToken).filter(Boolean);
  if (!tokens.includes(alvo)) return fail("EA_NOT_IN_TEXT", expected);
  // O componente so torna clicavel o token que casa com uma option. Quando o
  // instrumento (ou o alvo) declara options/spans, o gabarito precisa estar la;
  // sem declaracao, o caderno monta as options a partir dos alvos (stream E,
  // notebook-fallback), entao a ausencia nao reprova aqui.
  const declaradas = [
    ...asArray(props.options),
    ...asArray(instrument?.options),
    ...asArray(props.spans),
    ...asArray(targetObj?.options),
  ]
    .map((opt) => normalizeHighlightToken(opt?.value ?? opt?.label ?? opt))
    .filter(Boolean);
  if (declaradas.length && !declaradas.includes(alvo)) {
    return fail("EA_NOT_IN_OPTIONS", expected);
  }
  return pass(expected.trim());
}

function emitTable({ props, targetObj, expected }) {
  // TableInput junta as celulas editaveis com ", ": um gabarito com virgula
  // vira duas celulas e nunca casa com UMA celula do caderno.
  if (/,\s/.test(expected)) return fail("EA_NOT_SCALAR", expected);
  if (expected.length > 160) return fail("EA_TOO_LONG", `${expected.length} chars`);
  const rows = asArray(props.rows);
  const row = Number(targetObj?.row);
  const col = Number(targetObj?.col);
  const temCoordenada = Number.isInteger(row) && Number.isInteger(col);
  if (temCoordenada && rows.length) {
    const linha = rows[row];
    if (!Array.isArray(linha) || col < 0 || col >= linha.length || row < 0) {
      return fail("TARGET_OUT_OF_BOUNDS", `row=${row} col=${col}`);
    }
    const editaveis = asArray(props.editableCells);
    if (
      editaveis.length &&
      !editaveis.some((cell) => Number(cell?.row) === row && Number(cell?.col) === col)
    ) {
      return fail("TARGET_NOT_EDITABLE", `row=${row} col=${col}`);
    }
  }
  return pass(expected.trim());
}

function emitCellDiagram({ props, expected }) {
  const cellType = String(props.cellType || "animal");
  const organelas = CELL_DIAGRAM_ORGANELLES[cellType];
  if (!organelas) return fail("CELL_TYPE_UNKNOWN", cellType);
  // CellDiagram.jsx emite o id (nao o rotulo): "nucleo", nunca "Nucleo".
  if (!organelas.includes(expected))
    return fail("EA_NOT_ORGANELLE_ID", `${expected} (${cellType})`);
  return pass(expected);
}

const EMITTERS = Object.freeze({
  number_line: emitNumberLine,
  fraction_bar: emitFractionBar,
  highlight_in_text: emitHighlightInText,
  table: emitTable,
  cell_diagram: emitCellDiagram,
});

/** Instrumentos que este modelo conhece (espelho de NOTEBOOK_C_V1). */
export const NOTEBOOK_EMITTER_INSTRUMENTS = Object.freeze(Object.keys(EMITTERS));

/**
 * O componente do instrumento, acionado neste alvo, consegue emitir o gabarito?
 *
 * @param {object} args
 * @param {object} args.instrument   problem.notebook.instrument
 * @param {object|string} args.target alvo (objeto {id,kind,...}) ou id em instrument.targets
 * @param {*} args.expectedAnswer     gabarito da celula
 * @param {object} [args.spec]        spec do registro (cruza notebook.targets.kinds)
 */
export function canTargetEmit({ instrument, target, expectedAnswer, spec } = {}) {
  if (!instrument || typeof instrument !== "object") return fail("INSTRUMENT_MISSING");
  if (instrument.readOnly === true) return fail("INSTRUMENT_READ_ONLY", "figura nao emite");
  const renderAs = String(instrument.renderAs ?? "").trim();
  const emitter = EMITTERS[renderAs];
  if (!emitter) return fail("INSTRUMENT_UNKNOWN", renderAs || "(sem renderAs)");

  const targetObj = resolveNotebookTarget(instrument, target);
  if (!targetObj) return fail("TARGET_NOT_FOUND", String(target ?? ""));
  const kind = String(targetObj.kind ?? "").trim();
  const kindEsperado = NOTEBOOK_INSTRUMENT_TARGET_KIND[renderAs];
  const kindsDaSpec = asArray(spec?.notebook?.targets?.kinds).map(String);
  const kindsAceitos = kindsDaSpec.length ? kindsDaSpec : [kindEsperado];
  if (!kindsAceitos.includes(kind)) {
    return fail("TARGET_KIND_MISMATCH", `${kind || "(vazio)"} nao e ${kindsAceitos.join("|")}`);
  }

  const expected = String(expectedAnswer ?? "").trim();
  if (!expected) return fail("EA_EMPTY");
  const props =
    instrument.componentProps && typeof instrument.componentProps === "object"
      ? instrument.componentProps
      : {};
  return emitter({ instrument, props, targetObj, expected });
}
