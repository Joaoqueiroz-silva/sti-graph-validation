import { canonAnswer } from "../schema.js";

/**
 * A mesma regra usada pelo executor da campanha 3 para a análise de sensibilidade
 * por âncora de input. O estimando congelado NÃO usa este filtro: seu denominador
 * inclui todas as ações buggy registradas na referência.
 */
export function isAnchorableBugEvent(event) {
  return (
    !event?.hintRequest &&
    canonAnswer(event?.input) !== "" &&
    String(event?.input ?? "").trim() !== "-"
  );
}

/** Resume os denominadores de R_bug presentes em um arquivo da bateria. */
export function bugDenominators(items = []) {
  const buggy = items.filter((item) => item?.family === "referencia" && item?.kind === "buggy");
  const anchorable = buggy.filter((item) => isAnchorableBugEvent(item?.trace?.at(-1)));
  return { all: buggy.length, anchorable: anchorable.length };
}

/**
 * Reconstrói o numerador inteiro a partir da taxa ancorável armazenada nos
 * relatórios C3. O runner gravou a taxa arredondada a três casas, por isso a
 * reconstrução só é aceita quando o produto fica a no máximo `tolerance` de um
 * inteiro. Assim não se inventa reconhecimento para as ações excluídas: elas
 * permanecem falhas sob a regra de correspondência executada na campanha.
 */
export function reconstructFrozenRBug(
  anchorableRate,
  { all, anchorable },
  { tolerance = 0.005 } = {}
) {
  if (!Number.isFinite(anchorableRate) || !Number.isFinite(all) || all <= 0)
    return { rate: NaN, hits: null, reconstructionError: NaN };
  if (!Number.isFinite(anchorable) || anchorable < 0 || anchorable > all)
    throw new Error(`denominadores R_bug inválidos: all=${all}, anchorable=${anchorable}`);

  const impliedHits = anchorableRate * anchorable;
  const hits = Math.round(impliedHits);
  const reconstructionError = Math.abs(impliedHits - hits);
  if (reconstructionError > tolerance) {
    throw new Error(
      `não foi possível reconstruir o numerador de R_bug: ` +
        `taxa=${anchorableRate}, denominador ancorável=${anchorable}, ` +
        `erro=${reconstructionError}`
    );
  }
  return { rate: hits / all, hits, reconstructionError };
}
