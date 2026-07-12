/**
 * interface-input.js — Envelope A **v2**: entrada dos agentes INDEPENDENTE do grafo.
 *
 * 2026-07-12 (W1/G4): o parecer externo exigiu que a entrada do robô não derive do
 * mesmo arquivo que contém o grafo do especialista. Este módulo constrói o envelope
 * SOMENTE a partir de duas fontes anteriores/externas ao grafo:
 *
 *   1. `_interface/interface.html` — a interface CTAT compartilhada (componentes
 *      CTATTextField / CTATDoneButton / CTATHintButton), lida com node-html-parser;
 *   2. `answer-key/frac-numberline-6.17.json` — gabarito extraído da tabela de
 *      mass production do CTAT (ver build-answer-key.mjs e answer-key/PROVENIENCIA.md),
 *      preenchida pelo autor humano ANTES da exemplificação do grafo.
 *
 * PROIBIÇÕES (verificadas por __tests__/envelope-independence.test.mjs):
 *   - não importa o parser do grafo do especialista;
 *   - não lê nenhum arquivo XML do grafo do especialista;
 *   - não referencia o envelope de comparação (gold) em lugar nenhum.
 *
 * SEM knowledgeComponents — decisão registrada: os KCs (skillName/skillLabel) só
 * existem no grafo do especialista (bloco <productionRule>); incluí-los recriaria a
 * dependência que o parecer mandou eliminar. Ficam FORA do Envelope A v2; uma
 * ablação futura medirá o impacto de fornecê-los.
 *
 * O envelope sai no MESMO formato que `authorFromEnvelopeA` (author-from-ctat.js)
 * já consome: { id, problem, components[], correctAnswer, ... } — cada componente
 * com name/type/affordance (+ id/label como aliases, porque simulate-students.js
 * monta o vocabulário permitido a partir de `c.id`/`c.label`).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "node-html-parser";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_INTERFACE_DIR = path.join(HERE, "cases/ctat-6.17/_interface");
const DEFAULT_ANSWER_KEY = path.join(HERE, "answer-key/frac-numberline-6.17.json");

export const ENVELOPE_A2_SCHEMA_VERSION = "envelope-a-v2";

// ───────────────────────── gabarito ─────────────────────────

function readAnswerKey(answerKeyPath) {
  const p = answerKeyPath || DEFAULT_ANSWER_KEY;
  const key = JSON.parse(fs.readFileSync(p, "utf8"));
  if (!Array.isArray(key.exercises)) {
    throw new Error(`answer-key inválido (sem "exercises"): ${p}`);
  }
  return key;
}

// ───────────────────────── componentes ─────────────────────────

/** Componente no formato do envelope; id/label = aliases de name (ver cabeçalho). */
function component(name, type, affordance) {
  return { name, id: name, label: name, type, affordance };
}

/**
 * Extrai os componentes CTAT do interface.html (fonte: o HTML compartilhado da
 * interface, NÃO o grafo). Cobertura deliberadamente restrita ao que a interface
 * declara: campos de texto, botão de concluir e botão de ajuda.
 */
export function extractHtmlComponents(html) {
  const root = parse(html);
  const comps = [];

  for (const el of root.querySelectorAll(".CTATTextField")) {
    comps.push(
      component(
        el.getAttribute("id") || "textField",
        "text",
        "área de texto da interface que exibe o enunciado do problema"
      )
    );
  }
  if (root.querySelector(".CTATDoneButton")) {
    comps.push(component("done", "button", "botão que o aluno pressiona ao concluir o problema"));
  }
  if (root.querySelector(".CTATHintButton")) {
    comps.push(component("hint", "button", "botão que o aluno pressiona para pedir ajuda"));
  }
  return comps;
}

/** A reta numérica não está no HTML (é widget de runtime): vem da config da mass production. */
function numberlineComponent(interfaceConfig = {}) {
  const name = interfaceConfig.line_name || "numline";
  const rBound = interfaceConfig.rBound ?? 1;
  const labelAid =
    interfaceConfig.label_aid && interfaceConfig.label_aid !== 0
      ? ", com rótulos de fração como apoio nas marcas"
      : "";
  return component(
    name,
    "numberline",
    `reta numérica de 0 a ${rBound}; o aluno cria divisões e marca o ponto correspondente à fração${labelAid}`
  );
}

// ───────────────────────── envelope ─────────────────────────

/**
 * buildEnvelopeA2({ exerciseId, interfaceDir, answerKeyPath }) → Envelope A v2,
 * no formato que `authorFromEnvelopeA` consome. 100% determinístico (sem LLM).
 *
 * `screenshotPath` é RELATIVO ao corpus ("_interface/screenshot.png") de propósito:
 * o envelope precisa ser byte a byte idêntico independentemente de onde o corpus
 * está montado (teste metamórfico de independência), e o consumidor só o repassa.
 */
export function buildEnvelopeA2({ exerciseId, interfaceDir, answerKeyPath } = {}) {
  if (!exerciseId) throw new Error("buildEnvelopeA2: exerciseId é obrigatório");
  const dir = interfaceDir || DEFAULT_INTERFACE_DIR;

  const key = readAnswerKey(answerKeyPath);
  const ex = key.exercises.find((e) => e.id === exerciseId);
  if (!ex) throw new Error(`buildEnvelopeA2: exercício "${exerciseId}" não está no answer-key`);

  const html = fs.readFileSync(path.join(dir, "interface.html"), "utf8");
  const htmlComponents = extractHtmlComponents(html);

  const problem = ex.statement2 ? `${ex.statement}\n${ex.statement2}` : ex.statement;

  return {
    id: ex.id,
    problem,
    components: [...htmlComponents, numberlineComponent(ex.interfaceConfig)],
    correctAnswer: ex.correctAnswer,
    interfaceConfig: ex.interfaceConfig,
    screenshotPath: "_interface/screenshot.png",
    schemaVersion: ENVELOPE_A2_SCHEMA_VERSION,
  };
}

/**
 * buildAllEnvelopesA2(corpusDir, opts?) → os 24 envelopes v2, na ordem do gabarito.
 * Enumera pelos exercícios do answer-key (não pelos subdiretórios do corpus): o
 * corpus só precisa conter `_interface/` — nada do grafo do especialista.
 */
export function buildAllEnvelopesA2(corpusDir, opts = {}) {
  const interfaceDir = path.join(
    corpusDir || path.join(HERE, "cases/ctat-6.17"),
    "_interface"
  );
  const answerKeyPath = opts.answerKeyPath || DEFAULT_ANSWER_KEY;
  const key = readAnswerKey(answerKeyPath);
  return key.exercises.map((ex) =>
    buildEnvelopeA2({ exerciseId: ex.id, interfaceDir, answerKeyPath })
  );
}
