/**
 * dataset-config.js — QUAL corpus está em uso (multi-corpus, 2026-08-16).
 *
 * Até a rodada 4 o repositório assumia um único corpus (frac-numberline-6.17).
 * Para os pacotes públicos do Mathtutor (docs/CATALOGO-PACOTES-MATHTUTOR-2026-08-16.md)
 * cada dataset carrega um `corpus.json` na sua raiz com o que é ESPECÍFICO
 * dele — casesDir (onde estão os expert.brd), estado de corpus dos agentes
 * (disciplina/tópico/faixa), e a descrição da interface para o braço
 * "interface fixa". Tudo o mais (parsers, régua, coletor, materialização) é
 * comum.
 *
 * Seleção: env STI_DATASET=<nome> (default frac-numberline-6.17 — mantém
 * bit a bit o comportamento das rodadas 1–4). Nunca se lê dois datasets ao
 * mesmo tempo num processo.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DATASET_PADRAO = "frac-numberline-6.17";

/** Config congelada do 6.17 (o corpus.json dele é este objeto; ver datasets/frac-numberline-6.17/corpus.json). */
const PADRAO_617 = Object.freeze({
  nome: "frac-numberline-6.17",
  casesDir: "cases/ctat-6.17",
  corpusState: { discipline: "matematica", topic: "frações na reta numérica", ageGroup: "11" },
  interface: { tipo: "mathtutor-6.17" },
});

export function nomeDatasetAtual() {
  return process.env.STI_DATASET || DATASET_PADRAO;
}

/** Diretório do dataset (datasets/<nome>). */
export function dirDataset(nome = nomeDatasetAtual(), raiz = HERE) {
  return path.join(raiz, "datasets", nome);
}

/** Config do dataset atual (corpus.json; para o 6.17, o objeto congelado se o arquivo faltar). */
export function configDataset(nome = nomeDatasetAtual(), raiz = HERE) {
  const p = path.join(dirDataset(nome, raiz), "corpus.json");
  if (fs.existsSync(p)) return { ...JSON.parse(fs.readFileSync(p, "utf8")), nome };
  if (nome === DATASET_PADRAO) return { ...PADRAO_617 };
  throw new Error(`dataset ${nome}: falta ${p}`);
}

/** cases/<…> do dataset atual, relativo à raiz do repo. */
export function casesDirDataset(nome = nomeDatasetAtual(), raiz = HERE) {
  return configDataset(nome, raiz).casesDir;
}

/** datasets/<nome>/problems relativo à raiz do repo (string, para os scripts que montam caminhos). */
export function problemsDirRelativo(nome = nomeDatasetAtual()) {
  return path.join("datasets", nome, "problems");
}
