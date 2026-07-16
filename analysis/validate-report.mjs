#!/usr/bin/env node
/**
 * Valida a consistência dos resultados centrais entre o HTML v3.4 e as saídas
 * derivadas. Não pretende verificar cada número histórico; trava os estimandos,
 * as correções adversariais e a ausência de placeholders editoriais silenciosos.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "node-html-parser";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPORT = path.join(ROOT, "docs", "RELATORIO-CAMPANHA-1.html");
const DERIVED = path.join(ROOT, "analysis", "derived", "reanalise-c3.json");

const pt3 = (value) => Number(value).toFixed(3).replace(".", ",");

export function validateReport({
  html = fs.readFileSync(REPORT, "utf8"),
  derived = JSON.parse(fs.readFileSync(DERIVED, "utf8")),
} = {}) {
  const errors = [];
  const root = parse(html);
  const requireText = (needle, label) => {
    if (!html.includes(needle)) errors.push(`${label}: não encontrado: ${needle}`);
  };

  const baseline = derived.sumario?.["base-gemini"];
  const limit6 = derived.sumario?.["limite-6"];
  if (!baseline || !limit6) errors.push("reanalise-c3.json não contém baseline/limite-6");
  else {
    requireText(
      `R_bug=${pt3(baseline.rBug.mean)} [${pt3(baseline.rBug.lower)}; ${pt3(baseline.rBug.upper)}]`,
      "R_bug principal do baseline"
    );
    requireText(
      `${pt3(baseline.rBugAnchorable.mean)} [${pt3(baseline.rBugAnchorable.lower)}; ${pt3(baseline.rBugAnchorable.upper)}]`,
      "R_bug ancorável do baseline"
    );
    requireText(
      `${pt3(limit6.rBug.mean)} [${pt3(limit6.rBug.lower)}; ${pt3(limit6.rBug.upper)}]`,
      "R_bug principal do limite-6"
    );
  }

  const structural = derived.estruturaPorCondicao;
  if (!structural) errors.push("reanálise sem bloco estruturaPorCondicao");
  else {
    const total = Object.values(structural).reduce(
      (acc, row) => ({
        grafos: acc.grafos + row.grafos,
        grafosComSinalMole: acc.grafosComSinalMole + row.grafosComSinalMole,
        violacoesDuras: acc.violacoesDuras + row.violacoesDuras,
      }),
      { grafos: 0, grafosComSinalMole: 0, violacoesDuras: 0 }
    );
    requireText(`${total.grafosComSinalMole}/${total.grafos}`, "total de sinais moles");
    requireText("61/72 (84,7%)", "sinais moles do limite-6");
    if (total.violacoesDuras !== 0) errors.push("esperava zero violações duras na C3");
  }

  const panel = derived.painel?.composicao;
  if (!panel) errors.push("reanálise sem composição do painel");
  else {
    requireText("83 da referência e 96 distratores", "composição histórica do painel");
    requireText("zero excedente do sistema", "ausência de extras no painel histórico");
    if (panel.roboExtra !== 0) errors.push("painel histórico deveria ter zero extras do robô");
  }

  if (root.querySelector("html")?.getAttribute("lang") !== "pt-BR") errors.push("HTML sem lang=pt-BR");
  if (!root.querySelector("main")) errors.push("HTML sem elemento main");
  if ((root.querySelectorAll("h2") ?? []).length < 10) errors.push("estrutura de seções incompleta");
  if ((root.querySelectorAll("table") ?? []).length < 12) errors.push("quantidade inesperada de tabelas");

  for (const forbidden of ["[A preencher", "[completar:", "[Credenciais do especialista"]) {
    if (html.includes(forbidden)) errors.push(`placeholder editorial remanescente: ${forbidden}`);
  }
  if (/painel de três famílias de juízes apresentou concordância/i.test(html)) {
    errors.push("alegação antiga do painel multijuiz ainda presente");
  }
  if (/R_bug=0,065; R_ok=0/.test(html)) errors.push("R_bug ancorável ainda rotulado como principal");

  return errors;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = validateReport();
  if (errors.length) {
    console.error(`Falha na validação do relatório (${errors.length}):`);
    for (const error of errors) console.error(` - ${error}`);
    process.exit(1);
  }
  console.log("✓ relatório v3.4 consistente com os resultados centrais derivados");
}
