/**
 * evaluation/interface-reconstruction.js — reconstrução DETERMINÍSTICA da
 * interface RENDERIZADA a partir do template mass-production do CTAT.
 *
 * 2026-07-19 (Fase B — campanha-interface): as faltas não-mecânicas que restaram
 * (whole_number_bias 31, fracao/inversao 44) são em 59% VALORES QUE SÓ EXISTEM NA
 * INTERFACE RENDERIZADA (valores das marcas da reta desenhada por JS, rótulo "0"
 * dos extremos, conteúdo da caixa de número misto). O `interface.html` cru não
 * contém esses números — eles nascem de template + tabela de parâmetros
 * (`_interface/massproduction.txt`). Este módulo reconstrói esses fatos por
 * problema, deterministicamente, para o inventário do simulador.
 *
 * REGRAS DE OURO (anti-vazamento):
 *  - PURO: sem IO (recebe o TEXTO da tabela — nunca um caminho), sem LLM, e
 *    JAMAIS lê envelope-b; a fonte é só o que aluno/especialista VIAM
 *    (template + parâmetros + enunciado).
 *  - Campos com nomes NEUTROS: a saída passa por findLeaksInRobotInput
 *    (parse-ctat-brd.js), que barra por NOME de campo (wronganswer, hints,
 *    steps, feedback, ...). Testado em interface-reconstruction.test.mjs.
 *  - Fatos de PARTIDA, não limite: daqui saem contagens/valores que a tela
 *    mostra; o robô continua DERIVANDO os erros (nunca recebemos erros prontos).
 *
 * FIDELIDADE AO TEMPLATE (achado 17pencils): a tabela traz mfNum="5/7" onde a
 * aritmética diria 5/12 — e o envelope-b do especialista traz "5/7", porque o
 * .brd foi MASS-PRODUZIDO desta tabela. O parâmetro é a verdade da interface:
 * usar os valores AS-IS; "corrigir" o typo QUEBRA o casamento com a tela real.
 */

import { canonAnswer } from "./schema.js";

// ───────────────────── parse da tabela mass-production ─────────────────────

/**
 * parseMassProductionTable(tsvText) → { problems, paramsByProblem }.
 *
 * A tabela é um TSV TRANSPOSTO: linha 1 = "Problem Name" + os nomes dos
 * problemas (um por coluna); cada linha seguinte = uma variável `%(var)%` do
 * template com um valor por problema; linhas em branco são ignoradas.
 *
 * @param {string} tsvText  conteúdo de `_interface/massproduction.txt` (TEXTO,
 *   nunca caminho — o chamador faz o IO; este módulo permanece puro).
 * @returns {{ problems: string[], paramsByProblem: Record<string, Record<string,string>> }}
 */
export function parseMassProductionTable(tsvText) {
  const rows = String(tsvText ?? "")
    .split(/\r?\n/)
    .map((l) => l.split("\t"));
  const header = rows[0] || [];
  const problems = header
    .slice(1)
    .map((s) => String(s).trim())
    .filter(Boolean);
  const table = {};
  for (const r of rows.slice(1)) {
    const rawVar = String(r[0] ?? "").trim();
    if (!rawVar) continue; // linha em branco da tabela
    const varName = rawVar.replace(/^%\(/, "").replace(/\)%$/, "");
    table[varName] = r.slice(1);
  }
  const paramsByProblem = {};
  problems.forEach((pid, i) => {
    const p = {};
    for (const [varName, vals] of Object.entries(table)) {
      p[varName] = String(vals[i] ?? "").trim();
    }
    paramsByProblem[pid] = p;
  });
  return { problems, paramsByProblem };
}

// ───────────────────── números do enunciado renderizado ─────────────────────

// Palavras-número EN/PT (o dataset original é EN; os envelope-a são PT-BR).
const WORD_NUMBERS = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  dozen: 12,
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  duzia: 12,
  duzias: 12,
};
const WORD_FRACTIONS = { half: "1/2", metade: "1/2", quarter: "1/4", quarto: "1/4" };

/**
 * Números RENDERIZADOS num texto de enunciado: dígitos (fora de frações),
 * frações N/D e palavras-número EN/PT (incl. half/quarter/metade/dúzia).
 * @returns {{ inteiros: string[], fracoes: string[] }}
 */
export function statementNumbers(text) {
  const t = String(text ?? "");
  const fracoes = new Set((t.match(/\d+\s*\/\s*\d+/g) || []).map((f) => f.replace(/\s+/g, "")));
  const inteiros = new Set(t.match(/(?<![\d/])\d+(?![\d/])/g) || []);
  const low = t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  for (const w of low.replace(/[^a-z]+/g, " ").split(/\s+/)) {
    if (WORD_NUMBERS[w] != null) inteiros.add(String(WORD_NUMBERS[w]));
    if (WORD_FRACTIONS[w]) fracoes.add(WORD_FRACTIONS[w]);
  }
  return {
    inteiros: [...inteiros].sort((a, b) => parseFloat(a) - parseFloat(b)),
    fracoes: [...fracoes].sort(),
  };
}

// ───────────────────── fatos renderizados por problema ─────────────────────

const toInt = (s) => (/^-?\d+$/.test(String(s ?? "").trim()) ? parseInt(s, 10) : null);
const EMPTY_PARAM = new Set(["", "-", "0"]);

/** Resolve UM nível de placeholder aninhado (ex.: label_aid = "%(frac)%"). */
function resolveParam(value, params) {
  const m = /^%\((.+)\)%$/.exec(String(value ?? "").trim());
  return m ? String(params[m[1]] ?? "").trim() : String(value ?? "").trim();
}

/**
 * renderedFactsFromParams(params) → fatos que a interface instanciada MOSTRA.
 *
 * O shell CTAT (interface.html) desenha a reta por JS a partir dos parâmetros:
 * rBound define a reta 0..1 ou 0..2 com rótulos INTEIROS; den = divisões
 * corretas por unidade (stepper "Number of parts" inicia em 1); fracBox liga a
 * caixa numerador/denominador; mfNum_box/mfNum a caixa de número misto;
 * label_aid o rótulo de ajuda da fração na reta.
 *
 * @param {Record<string,string>} params  coluna do problema na tabela mass-production.
 * @returns {object|null} fatos com nomes NEUTROS (ver docblock), ou null se os
 *   parâmetros nucleares (rBound/den) não existirem (fallback silencioso).
 */
export function renderedFactsFromParams(params) {
  if (!params || typeof params !== "object") return null;
  const rBound = toInt(params.rBound);
  const den = toInt(params.den);
  const num = toInt(params.num);
  if (rBound == null || rBound < 1 || den == null || den < 1) return null;

  const intervalosTotais = rBound * den;
  const marcasTotais = intervalosTotais + 1;
  // Valores das marcas em fração CANÔNICA k/den — a MESMA redução do canonAnswer
  // de schema.js ("14/12" ≡ "7/6"), para que o valor proposto case a âncora.
  const valoresDasMarcas = Array.from({ length: marcasTotais }, (_, k) =>
    canonAnswer(`${k}/${den}`)
  );

  const labelAidRaw = String(params.label_aid ?? "").trim();
  const labelAidVisivel = !EMPTY_PARAM.has(labelAidRaw);
  const mfNumBoxRaw = String(params.mfNum_box ?? "").trim();
  const numeroMisto = !EMPTY_PARAM.has(mfNumBoxRaw);
  // 2026-07-19 (FISCAL, bloqueante): mfNum NÃO entra nos fatos — a "caixa de
  // número misto" não existe na interface renderizada (ausente do
  // interface.json, do envelope-a e do screenshot); o parâmetro só materializa
  // nas buggy edges do expert.brd = gabarito. Imprimi-lo seria vazamento
  // (o 17pencils "5/7" só era coberto por essa via — número honesto: 99,2%).

  return {
    linha: {
      rBound,
      labelsInteiros: Array.from({ length: rBound + 1 }, (_, i) => i),
      intervalosPorUnidade: den,
      intervalosTotais,
      marcasTotais,
      marcasInternas: marcasTotais - 2,
      valoresDasMarcas,
      labelAidVisivel,
      labelAidValor: labelAidVisivel ? resolveParam(labelAidRaw, params) : null,
    },
    caixas: {
      fracaoNumDen: String(params.fracBox ?? "").trim() === "1",
      numeroMisto,
      mfNumBox: numeroMisto ? toInt(mfNumBoxRaw) : null,
      stepperInicial: 1, // screenshot do dataset: "Number of parts: 1"
    },
    template: {
      // 2026-07-19 (FISCAL, importante): badCount/doubleDiv REMOVIDOS — são
      // parâmetros exclusivos de buggy edges do .brd (interface.html/json não
      // os referenciam; jamais renderizados). Mantê-los no objeto seria
      // contrabando de gabarito latente, mesmo sem imprimir.
    },
    enunciado: statementNumbers(`${params.statement ?? ""} ${params.statement2 ?? ""}`),
    // Fração-alvo COMO RENDERIZADA (AS-IS, sem reduzir: 12apples mostra "15/12").
    fracaoDoProblema: String(params.frac ?? "").trim() || null,
    alvoNum: num,
    alvoDen: den,
  };
}

// ───────────────────── formatação para o prompt ─────────────────────

/**
 * formatRenderedFacts(facts, { scaleId? }) → linhas de FATOS no estilo do
 * formatInterfaceInventory (interface-inventory.js), prontas para a seção extra
 * do inventário. "" quando não há fatos.
 *
 * Nota de arquitetura (2026-07-19, lição da diluição das 12 classes): as linhas
 * carregam apenas os fatos + a pista de FORMATO por tipo (marca vizinha = valor
 * adjacente da lista; entrada parcial = "N/-"/"-/D"). As 3 causas de erro
 * nomeadas (INVERSÃO/MARCA VIZINHA/INTEIRO NU) vivem UMA única vez no bloco de
 * eliciação de simulate-students.js — nada de checklist paralelo competindo com
 * o inventário. Os números do ENUNCIADO não são impressos (o robô já vê o
 * enunciado inteiro no prompt); ficam no objeto para diagnóstico/cobertura.
 */
export function formatRenderedFacts(facts, opts = {}) {
  if (!facts || !facts.linha) return "";
  const L = facts.linha;
  const C = facts.caixas || {};
  const scaleLabel = opts.scaleId ? `escala "${opts.scaleId}"` : "escala da reta numérica";
  const lines = [];
  lines.push(
    `- ${scaleLabel} RECONSTRUÍDA do template: reta de 0 a ${L.rBound} — limite direito visível da escala = ${L.rBound}; ` +
      `rótulos inteiros visíveis: ${L.labelsInteiros.join(", ")}; ${L.intervalosPorUnidade} divisões por unidade → ` +
      `${L.intervalosTotais} intervalos e ${L.marcasTotais} marcas no total; stepper "Number of parts" começa em 1`
  );
  lines.push(
    `- valores das marcas da reta, em ordem: ${L.valoresDasMarcas.join(", ")} ` +
      `(a marca VIZINHA do alvo é o valor imediatamente antes/depois nesta lista)`
  );
  const rendered = [];
  if (facts.fracaoDoProblema) rendered.push(`fração do problema "${facts.fracaoDoProblema}"`);
  if (L.labelAidVisivel && L.labelAidValor) {
    rendered.push(`rótulo de ajuda na reta mostra "${L.labelAidValor}"`);
  }

  if (C.fracaoNumDen || C.numeroMisto) {
    rendered.push(
      'caixa de fração com campos separados numerador/denominador (entrada parcial registra "N/-" ou "-/D")'
    );
  }
  if (rendered.length) lines.push(`- valores renderizados na tela: ${rendered.join("; ")}`);
  return lines.join("\n");
}
