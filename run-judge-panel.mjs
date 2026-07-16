#!/usr/bin/env node
/**
 * run-judge-panel.mjs — PAINEL DE JUÍZES (3 famílias) sobre itens CONGELADOS (G12).
 *
 * Diferença para o run-judge.mjs legado: aquele RE-AUTORA o grafo do robô a cada
 * réplica, então cada corrida julga itens DIFERENTES e as taxas entre juízes não são
 * comparáveis item a item. Aqui o conjunto de itens é EXTRAÍDO dos relatórios de
 * avaliação já produzidos (report-c3-*.json da campanha 3) e fica CONGELADO: os 3
 * juízes veem EXATAMENTE os mesmos itens; só a ORDEM muda (embaralhada com semente
 * fixa POR JUIZ, mulberry32 — mitiga efeito de ordem sem quebrar a reprodutibilidade).
 * Isso permite medir CONCORDÂNCIA entre juízes (κ de Cohen par a par) sobre o MESMO
 * material, além da taxa de validade por origem.
 *
 * Itens por exercício (montagem cega REUSA buildJudgeItems/makeDistractors, e o
 * julgamento REUSA judgeMisconception — mesmos prompts e mesma guarda P0-3):
 *   - extras do robô: `cases[].extra` nos reports C3 (ou pares RH/formas legadas),
 *     deduplicados por canonAnswer ENTRE réplicas (1ª grafia vence);
 *   - erros CONCEITUAIS do especialista: parseBrdToExpertNeutral(expert.brd),
 *     únicos por chave (calibração — a régua do "válido");
 *   - 4 distratores por exercício: makeDistractors (controles negativos fáceis+difíceis).
 *
 * 2026-07-13 (Onda 3, B3): o modelo de cada juiz entra POR CHAMADA via config
 * (getAgentConfig + chave temporária no AGENTS), nunca por env global — os 3 juízes
 * rodam no MESMO processo com STI_RUN_ID=painel-<slug> cada (manifesto separado por
 * juiz no exec-manifest; a trava de orçamento STI_BUDGET_USD vale para todos).
 *
 * Política de falhas: por item, tenta o juiz 2x (cada tentativa já inclui o fallback
 * interno do llm.js, registrado no manifesto com fallbackUsed=true); se todas falharem,
 * o veredito fica null e o item entra no sumário como PENDÊNCIA — nunca some em silêncio.
 *
 * Uso:
 *   DOTENV_CONFIG_PATH=.env node -r dotenv/config run-judge-panel.mjs \
 *     --eval-reports "resultados/campanha-3/report-c3-*.json" \
 *     --judges "mistralai/mistral-large-2512,qwen/qwen3.7-plus,meta-llama/llama-4-maverick" \
 *     --out resultados/painel-2026-07-13 \
 *     [--limit N] [--corpus cases/ctat-6.17] [--answer-key answer-key/frac-numberline-6.17.json]
 *
 * Saídas: <out>/panel-<slugjuiz>.json (vereditos por item, na ordem canônica; `position`
 * guarda a posição embaralhada vista pelo juiz) + <out>/panel-summary.json (por item:
 * vereditos dos 3/maioria/unanimidade; por grupo: taxa por juiz/maioria/unanimidade;
 * κ par a par; top-10 discordâncias; pendências).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AGENTS } from "./llm.js";
import { sha256 } from "./exec-manifest.js";
import { mulberry32 } from "./stats.js";
import { canonAnswer } from "./schema.js";
import { cohenKappa } from "./functional-equivalence.js";
import { parseBrdToExpertNeutral, parseBrdToRobotInput } from "./parse-ctat-brd.js";
import { buildJudgeItems, makeDistractors, judgeMisconception } from "./judge-misconceptions.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const DEFAULT_JUDGES =
  "mistralai/mistral-large-2512,qwen/qwen3.7-plus,meta-llama/llama-4-maverick";
const DEFAULT_CORPUS = "cases/ctat-6.17";
const DEFAULT_ANSWER_KEY = "answer-key/frac-numberline-6.17.json";
const MAX_ATTEMPTS = 2; // 1ª chamada + 1 retry (cada uma com o fallback interno do llm.js)

const r3 = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);
const isBool = (v) => v === true || v === false;

// ───────────────────────── entrada: reports, answer-key, corpus ─────────────────────────

const escapeRx = (s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");

/**
 * Expande "--eval-reports": lista separada por vírgula, cada token podendo conter `*`
 * (glob simples no basename — Node 20 não tem fs.glob; suficiente p/ report-c3-*.json).
 */
export function expandReportPaths(spec, baseDir = process.cwd()) {
  const out = new Set();
  const tokens = String(spec || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const token of tokens) {
    const abs = path.isAbsolute(token) ? token : path.join(baseDir, token);
    if (path.basename(abs).includes("*")) {
      const dir = path.dirname(abs);
      if (!fs.existsSync(dir)) continue;
      const rx = new RegExp("^" + escapeRx(path.basename(abs)).split("*").join(".*") + "$");
      for (const f of fs.readdirSync(dir).filter((f) => rx.test(f)).sort())
        out.add(path.join(dir, f));
    } else if (fs.existsSync(abs)) {
      out.add(abs);
    }
  }
  return [...out].sort();
}

/** Slug de arquivo/manifesto a partir do id de modelo: "qwen/qwen3.7-plus" → "qwen3-7-plus". */
export function slugOfModel(model) {
  const base = String(model).split("/").pop() || String(model);
  return base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Gabarito independente (answer-key da mass production): Map id → exercício. */
export function loadAnswerKey(p) {
  const map = new Map();
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    for (const ex of j.exercises || []) if (ex?.id) map.set(ex.id, ex);
  } catch {
    /* answer-key opcional: o fallback é o Envelope A derivado do .brd */
  }
  return map;
}

/**
 * Extrai o conjunto CONGELADO de itens a julgar a partir dos reports + corpus.
 *
 * 2026-07-13 (Onda 3, B3): os extras do robô vêm de `cases[].extra` no runner da
 * campanha 3 e dos pares RH (`pairs[].extra`) no formato legado; são chaves canônicas
 * relativas ao especialista, deduplicadas por canonAnswer ENTRE réplicas. Por
 * compatibilidade, também são aceitos `robotExtras`/`extras` no nível do caso.
 * Pares HH são IGNORADOS (extras de especialista×especialista não são do robô).
 */
export function extractPanelItems(reports, opts = {}) {
  const { corpusDir, answerKey = new Map(), limit = Infinity } = opts;
  const warnings = [];

  const ids = new Set();
  const extrasByEx = new Map(); // id → Map(canonAnswer → 1ª grafia vista)
  for (const rep of reports) {
    for (const c of rep?.cases || []) {
      if (!c?.id) continue;
      ids.add(c.id);
      let bag = extrasByEx.get(c.id);
      if (!bag) {
        bag = new Map();
        extrasByEx.set(c.id, bag);
      }
      const push = (w) => {
        const k = canonAnswer(w);
        if (k !== "" && !bag.has(k)) bag.set(k, String(w));
      };
      for (const p of c.pairs || [])
        if (p?.pairType === "RH") for (const w of p.extra || []) push(w);
      for (const w of c.extra || []) push(w);
      for (const w of c.robotExtras || []) push(w);
      for (const w of c.extras || []) push(w);
    }
  }

  const exercises = [...ids].sort().slice(0, Number.isFinite(limit) ? limit : ids.size);
  const items = [];
  const included = [];
  for (const id of exercises) {
    const brdPath = corpusDir ? path.join(corpusDir, id, "expert.brd") : null;
    const brd = brdPath && fs.existsSync(brdPath) ? fs.readFileSync(brdPath, "utf8") : null;

    // Enunciado + resposta correta: answer-key (fonte independente e ANTERIOR ao grafo,
    // ver answer-key/PROVENIENCIA.md) → fallback Envelope A do próprio .brd.
    const ak = answerKey.get(id);
    let problem = ak ? [ak.statement, ak.statement2].filter(Boolean).join("\n") : null;
    let correctAnswer = ak?.correctAnswer != null ? String(ak.correctAnswer) : null;

    // Erros CONCEITUAIS do especialista (calibração), únicos pela MESMA chave do
    // esquema neutro (m.key) usada no metrics.js — coerência com o run-judge legado.
    const expertConceptual = [];
    if (brd) {
      try {
        const neutral = parseBrdToExpertNeutral(brd);
        const seen = new Set();
        for (const m of neutral.misconceptions || []) {
          if (m.mechanical) continue;
          const k = m.key;
          if (!k || seen.has(k)) continue;
          seen.add(k);
          expertConceptual.push(m.wrongAnswer);
        }
        if (problem == null || correctAnswer == null) {
          const A = parseBrdToRobotInput(brd); // só Envelope A — sem contaminação
          if (problem == null) problem = A.problem || "";
          if (correctAnswer == null && A.correctAnswer != null)
            correctAnswer = String(A.correctAnswer);
        }
      } catch (e) {
        warnings.push(`${id}: falha ao parsear expert.brd (${e.message})`);
      }
    } else {
      warnings.push(`${id}: expert.brd ausente no corpus — sem itens de calibração do especialista`);
    }

    if (correctAnswer == null || String(correctAnswer).trim() === "") {
      warnings.push(`${id}: sem resposta correta (nem answer-key nem .brd) — exercício PULADO`);
      continue;
    }

    const robotExtras = [...(extrasByEx.get(id) || new Map()).values()];
    const blind = buildJudgeItems({
      robotExtras,
      expertConceptual,
      distractors: makeDistractors(correctAnswer),
    });
    for (const it of blind) {
      items.push({
        itemId: `${id}|${it.source}|${it.candidate}`,
        exercise: id,
        source: it.source,
        candidate: it.candidate,
        problem: problem || "",
        correctAnswer: String(correctAnswer),
      });
    }
    included.push(id);
  }
  return { exercises: included, items, warnings };
}

// ───────────────────────── juízes: config por chamada + ordem por juiz ─────────────────────────

/** Semente inteira determinística por juiz (hash do slug — reprodutível, difere entre juízes). */
export function seedFor(slug) {
  return parseInt(sha256(`painel|${slug}`).slice(0, 8), 16) >>> 0;
}

/** Fisher–Yates semeado (mulberry32): mesma semente ⇒ mesma ordem, sempre. */
export function seededShuffle(arr, seed) {
  const rng = mulberry32(seed >>> 0);
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Descreve os juízes do painel (puro — não toca em config global). */
export function panelJudges(models) {
  const judges = [];
  const seen = new Set();
  for (const model of models) {
    const slug = slugOfModel(model);
    if (!slug) throw new Error(`modelo de juiz inválido: "${model}"`);
    if (seen.has(slug)) throw new Error(`juízes com slug duplicado ("${slug}") — use modelos distintos`);
    seen.add(slug);
    judges.push({
      model,
      slug,
      configKey: `panel_judge_${slug}`,
      runId: `painel-${slug}`,
      seed: seedFor(slug),
    });
  }
  return judges;
}

/**
 * Registra os juízes como agentes temporários no AGENTS do llm.js.
 * 2026-07-13 (Onda 3, B3): é o "JUDGE_MODEL trocado por chamada via config" — o
 * judgeMisconception resolve o modelo por getAgentConfig(configKey), então basta uma
 * chave própria por juiz (config idêntica ao agent9_review; SÓ o modelo muda). Não
 * mexe no JUDGE_MODEL global nem reimplementa prompt algum.
 */
export function registerPanelJudges(judges) {
  for (const j of judges) {
    AGENTS[j.configKey] = {
      papel: "judge",
      descricao: `juiz do painel G12 (${j.model})`,
      model: j.model,
      temperature: 0.1,
      maxTokens: 32000,
    };
  }
  return judges;
}

// ───────────────────────── julgamento com política de falhas ─────────────────────────

/**
 * Julga UM item com a política do painel:
 *   0. guarda determinística (mesma regra P0-3 do judgeMisconception): candidato com a
 *      MESMA âncora semântica da resposta correta NUNCA vai ao modelo — curto-circuito
 *      idêntico nos 3 juízes, por construção;
 *   1..MAX_ATTEMPTS. chama o juiz (cada chamada já inclui o fallback interno do llm.js,
 *      registrado no manifesto); falharam todas → veredito null (pendência).
 */
export async function judgeItemWithPolicy(item, judgeFn, opts = {}) {
  const maxAttempts = opts.maxAttempts ?? MAX_ATTEMPTS;
  if (
    canonAnswer(item.candidate) !== "" &&
    canonAnswer(item.candidate) === canonAnswer(item.correctAnswer)
  ) {
    return {
      valid: false,
      category: "na_verdade_correta",
      misconceptionName: "",
      reason: "equivalente à resposta correta (guarda determinística por âncora semântica)",
      attempts: 0,
      deterministic: true,
    };
  }
  let lastErr = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const r = await judgeFn(item.problem, item.correctAnswer, item.candidate);
      return {
        valid: r?.valid === true,
        category: r?.category || "indefinido",
        misconceptionName: r?.misconceptionName || "",
        reason: r?.reason || "",
        attempts: attempt,
        deterministic: false,
      };
    } catch (err) {
      lastErr = err;
    }
  }
  return {
    valid: null,
    category: null,
    misconceptionName: "",
    reason: "",
    attempts: maxAttempts,
    deterministic: false,
    error: String(lastErr?.message || lastErr),
  };
}

/**
 * Passa UM juiz por TODOS os itens, na ordem embaralhada dele (semente própria).
 * Sequencial de propósito: ordem de julgamento = ordem de chamada (o embaralhamento
 * só faz sentido se as chamadas respeitarem a permutação), e o custo fica previsível.
 * Devolve os resultados na ORDEM CANÔNICA dos itens; `position` = posição vista pelo juiz.
 */
export async function judgePass(items, judge, judgeFn, opts = {}) {
  const shuffled = seededShuffle(items, judge.seed);
  const byId = new Map();
  for (let pos = 0; pos < shuffled.length; pos++) {
    const it = shuffled[pos];
    const res = await judgeItemWithPolicy(it, judgeFn, opts);
    byId.set(it.itemId, { ...res, position: pos });
    opts.onProgress?.(judge, it, res, pos, shuffled.length);
  }
  return items.map((it) => ({
    itemId: it.itemId,
    exercise: it.exercise,
    source: it.source,
    candidate: it.candidate,
    ...byId.get(it.itemId),
  }));
}

// ───────────────────────── agregação: maioria, unanimidade, κ par a par ─────────────────────────

/** Maioria dos vereditos não-nulos; empate (ou tudo nulo) → null (indeterminado). */
export function majorityOf(verdicts) {
  const vs = verdicts.filter(isBool);
  const t = vs.filter(Boolean).length;
  const f = vs.length - t;
  return t > f ? true : f > t ? false : null;
}

const groupOf = (source) => (String(source).startsWith("distrator") ? "distratores" : source);

/**
 * Sumário do painel: por item (vereditos/maioria/unanimidade), por grupo
 * (robo-extra / especialista / distratores: taxa por juiz, por maioria e por
 * unanimidade), κ de Cohen PAR A PAR e top-10 discordâncias. Pendências (vereditos
 * null) são CONTADAS, nunca descartadas — política de falhas do painel.
 */
export function summarizePanel(items, passes) {
  const slugs = passes.map((p) => p.judge.slug);
  const byJudge = new Map(
    passes.map((p) => [p.judge.slug, new Map(p.results.map((r) => [r.itemId, r]))])
  );

  const perItem = items.map((it) => {
    const verdicts = {};
    const categories = {};
    for (const s of slugs) {
      const r = byJudge.get(s).get(it.itemId);
      verdicts[s] = r && isBool(r.valid) ? r.valid : null;
      categories[s] = r ? r.category : null;
    }
    const vs = slugs.map((s) => verdicts[s]);
    const pendentes = vs.filter((v) => !isBool(v)).length;
    let pairsDisagree = 0;
    for (let i = 0; i < vs.length; i++)
      for (let j = i + 1; j < vs.length; j++)
        if (isBool(vs[i]) && isBool(vs[j]) && vs[i] !== vs[j]) pairsDisagree++;
    return {
      itemId: it.itemId,
      exercise: it.exercise,
      source: it.source,
      candidate: it.candidate,
      verdicts,
      categories,
      majority: majorityOf(vs),
      unanimity: pendentes === 0 && vs.every((v) => v === vs[0]),
      pendentes,
      pairsDisagree,
    };
  });

  const groups = {};
  for (const row of perItem) {
    const g = (groups[groupOf(row.source)] ||= {
      nItems: 0,
      porJuiz: {},
      porMaioria: { definidos: 0, validos: 0, indeterminados: 0, taxa: null },
      porUnanimidade: {
        completos: 0,
        unanimes: 0,
        validosUnanimes: 0,
        taxaUnanimidade: null,
        taxaValidos: null,
      },
    });
    g.nItems++;
    for (const s of slugs) {
      const pj = (g.porJuiz[s] ||= { julgados: 0, validos: 0, pendentes: 0, taxa: null });
      const v = row.verdicts[s];
      if (isBool(v)) {
        pj.julgados++;
        if (v) pj.validos++;
      } else {
        pj.pendentes++;
      }
    }
    if (row.majority === null) g.porMaioria.indeterminados++;
    else {
      g.porMaioria.definidos++;
      if (row.majority) g.porMaioria.validos++;
    }
    if (row.pendentes === 0) {
      g.porUnanimidade.completos++;
      if (row.unanimity) {
        g.porUnanimidade.unanimes++;
        if (row.verdicts[slugs[0]] === true) g.porUnanimidade.validosUnanimes++;
      }
    }
  }
  for (const g of Object.values(groups)) {
    for (const pj of Object.values(g.porJuiz))
      pj.taxa = pj.julgados ? r3(pj.validos / pj.julgados) : null;
    g.porMaioria.taxa = g.porMaioria.definidos
      ? r3(g.porMaioria.validos / g.porMaioria.definidos)
      : null;
    g.porUnanimidade.taxaUnanimidade = g.porUnanimidade.completos
      ? r3(g.porUnanimidade.unanimes / g.porUnanimidade.completos)
      : null;
    g.porUnanimidade.taxaValidos = g.porUnanimidade.completos
      ? r3(g.porUnanimidade.validosUnanimes / g.porUnanimidade.completos)
      : null;
  }

  // κ de Cohen PAR A PAR — REUSA cohenKappa (functional-equivalence.js) sobre os
  // vereditos válido/inválido. A função computa p_esperado sobre as categorias CATS
  // do domínio dela, então mapeamos o booleano em DUAS dessas categorias (para o κ só
  // a IDENTIDADE da categoria importa, não o rótulo). Itens com veredito null em
  // qualquer um dos dois juízes ficam FORA do par (e contados como pendência).
  const CAT = (v) => (v ? "erro-previsto" : "correto");
  const kappaPairwise = [];
  for (let i = 0; i < slugs.length; i++) {
    for (let j = i + 1; j < slugs.length; j++) {
      const rows = perItem
        .filter((r) => isBool(r.verdicts[slugs[i]]) && isBool(r.verdicts[slugs[j]]))
        .map((r) => ({ expert: CAT(r.verdicts[slugs[i]]), robot: CAT(r.verdicts[slugs[j]]) }));
      const agreement = rows.length
        ? rows.filter((r) => r.expert === r.robot).length / rows.length
        : null;
      kappaPairwise.push({
        a: slugs[i],
        b: slugs[j],
        n: rows.length,
        agreement: r3(agreement),
        kappa: rows.length ? r3(cohenKappa(rows)) : null,
      });
    }
  }

  const topDiscordancia = perItem
    .filter((r) => r.pairsDisagree > 0 || r.pendentes > 0)
    .sort(
      (x, y) =>
        y.pairsDisagree - x.pairsDisagree ||
        y.pendentes - x.pendentes ||
        x.itemId.localeCompare(y.itemId)
    )
    .slice(0, 10)
    .map((r) => ({
      itemId: r.itemId,
      source: r.source,
      candidate: r.candidate,
      verdicts: r.verdicts,
      categories: r.categories,
      pairsDisagree: r.pairsDisagree,
      pendentes: r.pendentes,
    }));

  const pendencias = {
    totalVereditosNulos: perItem.reduce((s, r) => s + r.pendentes, 0),
    itensComPendencia: perItem.filter((r) => r.pendentes > 0).length,
    porJuiz: Object.fromEntries(
      slugs.map((s) => [s, perItem.filter((r) => !isBool(r.verdicts[s])).length])
    ),
  };

  return { items: perItem, groups, kappaPairwise, topDiscordancia, pendencias };
}

// ───────────────────────── orquestração ─────────────────────────

/**
 * Roda o painel completo. Opções:
 *   reports        glob/lista (string) OU array de caminhos já expandidos
 *   judges         "modelo1,modelo2,modelo3" (default DEFAULT_JUDGES) OU array
 *   outDir         pasta de saída (criada se preciso)
 *   corpusDir      pasta dos exercícios com expert.brd (default cases/ctat-6.17)
 *   answerKeyPath  gabarito independente (default answer-key/frac-numberline-6.17.json)
 *   limit          nº máximo de exercícios
 *   makeJudgeFn    (judge) => async (problem, correctAnswer, candidate) => veredito —
 *                  INJEÇÃO para testes (sem rede); default = judgeMisconception com a
 *                  config do juiz. Quando injetado, o AGENTS NÃO é tocado.
 *   quiet          silencia o console (testes)
 */
export async function runPanel(opts = {}) {
  const {
    reports: reportsSpec,
    judges: judgesSpec = DEFAULT_JUDGES,
    outDir,
    corpusDir = path.join(HERE, DEFAULT_CORPUS),
    answerKeyPath = path.join(HERE, DEFAULT_ANSWER_KEY),
    limit = Infinity,
    makeJudgeFn = null,
    quiet = false,
  } = opts;
  const log = quiet ? () => {} : (...a) => console.log(...a);
  if (!outDir) throw new Error("runPanel: outDir é obrigatório (--out <dir>)");

  const reportPaths = Array.isArray(reportsSpec) ? reportsSpec : expandReportPaths(reportsSpec);
  if (!reportPaths.length)
    throw new Error(`--eval-reports não casou nenhum arquivo: ${reportsSpec}`);
  const reports = reportPaths.map((p) => JSON.parse(fs.readFileSync(p, "utf8")));

  const answerKey = loadAnswerKey(answerKeyPath);
  const { exercises, items, warnings } = extractPanelItems(reports, {
    corpusDir,
    answerKey,
    limit,
  });
  for (const w of warnings) log(`⚠️  ${w}`);
  if (!items.length)
    throw new Error(
      "nenhum item extraído dos reports (shape inesperado? exercícios sem resposta correta?)"
    );

  const models = Array.isArray(judgesSpec)
    ? judgesSpec
    : String(judgesSpec).split(",").map((s) => s.trim()).filter(Boolean);
  const judges = panelJudges(models);
  if (!makeJudgeFn) registerPanelJudges(judges); // só toca no AGENTS quando o juiz é real

  log(
    `Painel de ${judges.length} juízes sobre ${items.length} itens CONGELADOS ` +
      `(${exercises.length} exercícios · ${reportPaths.length} reports)`
  );

  fs.mkdirSync(outDir, { recursive: true });
  const passes = [];
  const files = { judges: {}, summary: null };
  const prevRunId = process.env.STI_RUN_ID;
  try {
    for (const judge of judges) {
      // Manifesto separado por juiz: runs/manifests/painel-<slug>.jsonl (exec-manifest).
      process.env.STI_RUN_ID = judge.runId;
      const judgeFn = makeJudgeFn
        ? makeJudgeFn(judge)
        : (problem, correctAnswer, candidate) =>
            judgeMisconception(problem, correctAnswer, candidate, { configKey: judge.configKey });
      log(`\n■ juiz ${judge.slug} (${judge.model}) — mesmo conjunto, ordem própria (seed=${judge.seed})`);
      const results = await judgePass(items, judge, judgeFn);
      passes.push({ judge, results });

      const file = path.join(outDir, `panel-${judge.slug}.json`);
      fs.writeFileSync(
        file,
        JSON.stringify(
          {
            schemaVersion: "panel-judge-v1",
            judge: { slug: judge.slug, model: judge.model, configKey: judge.configKey, runId: judge.runId },
            seed: judge.seed,
            generatedAt: new Date().toISOString(),
            nItems: results.length,
            // ordem CANÔNICA dos itens; `position` = posição na ordem embaralhada do juiz
            items: results,
          },
          null,
          2
        )
      );
      files.judges[judge.slug] = file;
      const judged = results.filter((r) => isBool(r.valid)).length;
      log(
        `   vereditos: ${judged}/${results.length}` +
          (judged < results.length ? `  (pendentes=${results.length - judged})` : "") +
          `  → ${path.relative(process.cwd(), file)}`
      );
    }
  } finally {
    if (prevRunId === undefined) delete process.env.STI_RUN_ID;
    else process.env.STI_RUN_ID = prevRunId;
  }

  const summary = {
    schemaVersion: "panel-summary-v1",
    generatedAt: new Date().toISOString(),
    reports: reportPaths.map((p) => path.relative(process.cwd(), p)),
    judges: judges.map(({ model, slug, runId, seed }) => ({ model, slug, runId, seed })),
    nExercises: exercises.length,
    nItems: items.length,
    ...summarizePanel(items, passes),
  };
  const summaryFile = path.join(outDir, "panel-summary.json");
  fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
  files.summary = summaryFile;

  printSummary(summary, log);
  log(`\nSumário salvo em: ${path.relative(process.cwd(), summaryFile)}\n`);
  return { exercises, items, passes, summary, files };
}

// ───────────────────────── impressão ─────────────────────────

const pct = (x) => (x == null ? "n/a" : (x * 100).toFixed(0) + "%");

function printSummary(summary, log) {
  const ln = "═".repeat(70);
  log(`\n${ln}\nPAINEL DE JUÍZES — ${summary.nItems} itens congelados, ${summary.nExercises} exercícios\n${ln}`);
  for (const [name, g] of Object.entries(summary.groups)) {
    log(`\n▸ grupo ${name} (${g.nItems} itens)`);
    for (const [slug, pj] of Object.entries(g.porJuiz))
      log(
        `   ${slug.padEnd(24)} válidos=${pct(pj.taxa)} (${pj.validos}/${pj.julgados})` +
          (pj.pendentes ? `  pendentes=${pj.pendentes}` : "")
      );
    log(
      `   ${"MAIORIA".padEnd(24)} válidos=${pct(g.porMaioria.taxa)} (${g.porMaioria.validos}/${g.porMaioria.definidos})` +
        (g.porMaioria.indeterminados ? `  indeterminados=${g.porMaioria.indeterminados}` : "")
    );
    log(
      `   ${"UNANIMIDADE".padEnd(24)} válidos=${pct(g.porUnanimidade.taxaValidos)} ` +
        `(${g.porUnanimidade.validosUnanimes}/${g.porUnanimidade.completos})  unânimes=${pct(g.porUnanimidade.taxaUnanimidade)}`
    );
  }
  if (summary.groups.distratores)
    log(
      `\n  ⚠️  Os distratores DEVEM ter taxa baixa em TODO juiz; juiz com taxa alta é carimbo ` +
        `e derruba a confiança do painel.`
    );

  log(`\n▸ concordância PAR A PAR (κ de Cohen sobre válido/inválido)`);
  for (const k of summary.kappaPairwise)
    log(
      `   ${k.a} × ${k.b}: κ=${k.kappa == null ? "n/a" : k.kappa} ` +
        `(concordância=${pct(k.agreement)}, n=${k.n})`
    );

  const p = summary.pendencias;
  log(
    `\n▸ pendências: ${p.totalVereditosNulos} veredito(s) nulo(s) em ${p.itensComPendencia} item(ns)` +
      (p.totalVereditosNulos
        ? `  — ${Object.entries(p.porJuiz)
            .filter(([, n]) => n)
            .map(([s, n]) => `${s}:${n}`)
            .join("  ")}`
        : "")
  );

  if (summary.topDiscordancia.length) {
    log(`\n▸ maiores discordâncias (até 10; V=válido X=inválido ·=pendente):`);
    for (const t of summary.topDiscordancia)
      log(
        `   ${t.itemId}  [${Object.values(t.verdicts)
          .map((v) => (v === true ? "V" : v === false ? "X" : "·"))
          .join("")}]  pares-discordantes=${t.pairsDisagree}` +
          (t.pendentes ? `  pendentes=${t.pendentes}` : "")
      );
  }
}

// ───────────────────────── CLI ─────────────────────────

function parseArgs(argv) {
  const out = {
    evalReports: null,
    judges: DEFAULT_JUDGES,
    out: null,
    limit: Infinity,
    corpus: null,
    answerKey: null,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--eval-reports") out.evalReports = argv[++i];
    else if (argv[i] === "--judges") out.judges = argv[++i];
    else if (argv[i] === "--out") out.out = argv[++i];
    else if (argv[i] === "--limit") out.limit = parseInt(argv[++i], 10) || Infinity;
    else if (argv[i] === "--corpus") out.corpus = argv[++i];
    else if (argv[i] === "--answer-key") out.answerKey = argv[++i];
  }
  return out;
}

const resolveFrom = (base, p) => (path.isAbsolute(p) ? p : path.join(base, p));

async function main() {
  const a = parseArgs(process.argv.slice(2));
  if (!a.evalReports || !a.out) {
    console.error(
      'uso: node run-judge-panel.mjs --eval-reports "<glob ou lista de report-c3-*.json>" ' +
        '--out <dir> [--judges "m1,m2,m3"] [--limit N] [--corpus <dir>] [--answer-key <json>]'
    );
    process.exit(1);
  }
  // reports relativos: tenta o cwd; se nada casar, tenta a raiz do repo (padrão dos runners).
  let reportPaths = expandReportPaths(a.evalReports, process.cwd());
  if (!reportPaths.length) reportPaths = expandReportPaths(a.evalReports, HERE);
  await runPanel({
    reports: reportPaths.length ? reportPaths : a.evalReports,
    judges: a.judges,
    outDir: resolveFrom(process.cwd(), a.out),
    corpusDir: a.corpus ? resolveFrom(HERE, a.corpus) : undefined,
    answerKeyPath: a.answerKey ? resolveFrom(HERE, a.answerKey) : undefined,
    limit: a.limit,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => {
    console.error(`ERRO: ${e.message}`);
    process.exit(1);
  });
}
