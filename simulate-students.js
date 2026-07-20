/**
 * evaluation/simulate-students.js — os agentes-aluno resolvem a interface DADA.
 *
 * Reusa a infraestrutura REAL do pipeline (createLLM + getAgentConfig + callLLM +
 * extractJson). Diferente da geração normal, aqui a interface é EXTERNA e fixa, e
 * pedimos valores CONCRETOS (não genéricos), para casar com o grafo de um
 * especialista feito para a mesma interface.
 *
 * 2026-06-26 (Tarefa 2 do handoff de validação): RESTRIÇÃO DURA aos componentes.
 *   Os agentes só podem agir sobre `iface.components` (vocabulário SAI: cada ação tem
 *   um `selection` que DEVE ser um componente da interface). Isso vai (a) como regra
 *   forte no prompt E (b) como filtro programático pós-parse (defesa em profundidade —
 *   ver CLAUDE.md "compliance de prompt é estocástica"). Sem isso, o robô inventaria
 *   campos que o especialista (preso à mesma interface do CTAT) jamais usaria,
 *   inflando artificialmente a diferença entre os grafos.
 *
 * 2026-07-19 (Fase B — interface reconstruída + eliciação focada): as faltas
 *   restantes da campanha-interface são valores da interface RENDERIZADA (marcas
 *   da reta, rótulo "0", caixa de número misto) — invisíveis no HTML cru. O
 *   inventário agora aceita `opts.renderedFacts` (interface-reconstruction.js:
 *   template + massproduction.txt, jamais envelope-b) e a eliciação vira UM bloco
 *   focado em 3 causas nomeadas (INVERSÃO / MARCA VIZINHA / INTEIRO NU) + passo de
 *   CONFIGURAÇÃO da reta, com autochecagem corrige-não-corta. Lição da taxonomia
 *   (0.504/0.490): checklist paralelo DILUI a atenção — a eliciação fica DENTRO do
 *   bloco do inventário, como função dos fatos. Guarda-chuva de medição: se a média
 *   de misconceptions por run cair vs campanha-interface (9,0 medido), a autochecagem
 *   virou poda e deve sair.
 *
 * 2026-07-19 (Trilha A — filosofia do 3b sem teto): a campanha mediu completude
 *   0.400 [0.366,0.436] contra os envelopes CTAT e o teto explícito do prompt
 *   ("2 a 8 misconceptions no total") era o suspeito óbvio de limitador. O 3b de
 *   produção (agents/nodes/agents3-students.js) já abandonou tetos: produção
 *   dirigida por cobertura POR PASSO, sem máximo, com buggyRule mecânica. Este
 *   prompt segue a mesma filosofia — "quantos erros forem necessários, como
 *   especialista CTAT". Trade-off esperado e ACEITO: sem teto, a precision pode
 *   cair (erros reais fora do envelope contam como "a mais"); completude é a
 *   métrica primária. O protocolo de comparação (compare/metrics) NÃO muda.
 *
 * Saída: o contrato `traces` que `authorGraphForInterface` consome:
 *   { correctPath:[{kc,action,result,selection?}],
 *     misconceptions:[{step,id,type,wrongAnswer,buggyRule?,description,feedback,selection?}],
 *     hints:[{step,text}] }
 */

// 2026-07-19 (adaptação standalone): no backend estes imports vêm de
// agents/pipeline-core.js, agents/diagnostics/step-error-catalog.js e
// lib/logger.js; aqui o pacote usa os equivalentes locais (llm.js,
// step-error-catalog.js excerto, logger.js) — mesma API, mesmos valores.
import { createLLM, callLLM, extractJson, getAgentConfig } from "./llm.js";
import { GENERIC_MISC_ID_RE, MISC_ID_GRAMMAR_RE } from "./step-error-catalog.js";
import { buildInterfaceInventory, formatInterfaceInventory } from "./interface-inventory.js";
import { canon, canonAnswer } from "./schema.js";
import { logger } from "./logger.js";

const SYSTEM = `Você simula TRÊS alunos resolvendo um exercício numa INTERFACE JÁ DADA. NÃO invente outra interface nem outros campos: aja SOMENTE sobre os componentes listados.

- Aluno AVANÇADO → o caminho de solução CORRETO, passo a passo.
- Aluno EM RISCO → os ERROS típicos (misconceptions), cada um com a RESPOSTA ERRADA concreta que ele digitaria/clicaria.
- Aluno MEDIANO → onde ele hesita (vira dica).

REGRAS DURAS:
- VOCABULÁRIO FECHADO: cada passo e cada erro tem um campo "selection" que é o ID EXATO de um componente da lista. É PROIBIDO usar um componente fora da lista.
- Use VALORES CONCRETOS no "result"/"wrongAnswer" (ex.: "1/4", "0/4"), nunca variáveis genéricas.
- "wrongAnswer" é a resposta concreta do erro — é a ÂNCORA da avaliação, capriche e use o formato que o componente aceitaria.
- O caminho correto percorre a INTERFACE: crie um passo para CADA componente interativo que o aluno usa, na ordem — inclua os passos de CONFIGURAÇÃO da interface e o de FINALIZAÇÃO (tipicamente 5 a 8 passos); numere "step" a partir de 1.
- Cada passo tem um "kc" curto em snake_case que você nomeia.

PRODUÇÃO DE ERROS DIRIGIDA POR COBERTURA (SEM teto de quantidade):
- Para CADA passo do caminho correto, liste TODOS os erros plausíveis e DISTINTOS que um aluno real cometeria naquele passo — no MÍNIMO 2 por passo quando existirem, SEM máximo. Crie quantos forem necessários, como um especialista CTAT criaria buggy paths.
- Erros DISTINTOS = causas diferentes (não o mesmo erro com números diferentes).
- Cada erro tem "buggyRule": receita MECÂNICA de como produzir a wrongAnswer a partir da interface — outra pessoa (ou um programa) deve conseguir CALCULAR/REPRODUZIR o valor errado seguindo a receita, sem adivinhar.
  BOM: "somar numeradores e somar denominadores diretamente: 1+1 sobre 2+4 → 2/6"
  RUIM: "o aluno se confunde com frações" (não é computável)
- REGRAS DE "id" do erro (ids inválidos são DESCARTADOS pelo sistema): deve casar a gramática ^[A-Za-z0-9_.:-]+$ (letras, números, _ . : - ; SEM espaços, SEM acentos) e ser DESCRITIVO da causa (ex.: "misc_soma_denominadores_direto"). PROIBIDO começar com os prefixos genéricos reservados: misc_generic, misc_unclassified, misc_numeric_near, misc_text_confusion.

Retorne SOMENTE JSON puro:
{
  "correctPath": [{ "kc": "kc_...", "selection": "<id de componente>", "action": "o que o aluno faz", "result": "resultado concreto" }],
  "misconceptions": [{ "step": 1, "id": "misc_...", "selection": "<id de componente>", "type": "procedural|conceptual|factual", "wrongAnswer": "resposta errada concreta", "buggyRule": "receita mecânica que produz a wrongAnswer", "description": "...", "feedback": "..." }],
  "hints": [{ "step": 1, "text": "dica curta" }]
}`;

export function buildUserMessage(iface, opts = {}) {
  const comps = (iface.components || [])
    .map((c) => `- ${c.id} (${c.type})${c.label && c.label !== c.id ? ": " + c.label : ""}`)
    .join("\n");
  const ids = (iface.components || []).map((c) => c.id).join(", ");
  const screenshotNote = iface.screenshotPath
    ? "\n(Existe uma captura da interface; baseie-se na lista de componentes abaixo, que é a fonte da verdade.)"
    : "";
  // 2026-07-19 (Melhoria #1 — aterramento de interface): as faltas de
  // whole_number_bias das campanhas do dia são VALORES DA INTERFACE ('12' =
  // contagem de marcas daquela reta). O inventário abaixo é 100% determinístico
  // (interface-inventory.js: contagens/labels/escalas extraídas por código do
  // Envelope A + HTML compartilhado + interface RENDERIZADA reconstruída do
  // template mass-production) — NUNCA gabarito nem wrongAnswers prontas;
  // o robô continua DERIVANDO os erros, agora com os números da tela à mão.
  //
  // 2026-07-19 (Fase B — eliciação FOCADA, Analista 3): substitui a eliciação
  // difusa por 3 causas NOMEADAS dentro do MESMO bloco (sem checklist paralelo —
  // a taxonomia de 12 classes diluiu: 0.504/0.490). Exemplos usam den=9, ausente
  // do dataset frac-numberline-6.17 — nenhum exemplo coincide com falta real
  // (regra de ouro preservada). A AUTOCHECAGEM é corrige-não-corta: plausibilidade
  // ancorada no FORMATO do componente (verificável), jamais remoção por dúvida —
  // precision protegida sem virar teto de recall.
  const inventoryText = formatInterfaceInventory(
    buildInterfaceInventory(iface, {
      html: opts.html,
      dom: opts.dom,
      renderedFacts: opts.renderedFacts,
    })
  );
  const inventoryBlock = inventoryText
    ? `
INVENTÁRIO DA INTERFACE (fatos extraídos por código — o que a interface MOSTRA; contagens e labels NÃO são respostas; são fatos de PARTIDA, não um limite):
${inventoryText}

Se a interface tem reta numérica, o primeiro gesto do aluno é configurá-la: crie um passo cujo result é o MAIOR INTEIRO que a reta cobre (o limite direito visível da escala).

ERROS DE LEITURA DESTA INTERFACE — para CADA fato do inventário acima, decida: um aluno real digitaria/clicaria esse valor no lugar do pedido? Se sim, crie o erro, com a buggyRule citando o fato que produz a wrongAnswer. Três causas OBRIGATÓRIAS de avaliar em cada fato:
- INVERSÃO: para cada fração pedida ou visível, o aluno TROCA numerador e denominador — crie o erro com a fração invertida concreta (pede 4/9 → digita 9/4).
- MARCA VIZINHA: na reta/escala, o aluno clica UMA marca antes ou depois do alvo — a wrongAnswer é o VALOR dessa marca vizinha (numa reta de 9 divisões, a marca antes de 4/9 vale 3/9); caixa de fração meio-preenchida registra o literal "-/9" ou "9/-".
- INTEIRO NU: cada inteiro que a tela mostra (labels da reta, contagem de marcas/divisões) vira uma wrongAnswer digitada SOZINHA — materialize o número exato ("0", "9"), nunca uma descrição.

AUTOCHECAGEM DE FORMA (corrigir, NUNCA cortar): releia cada wrongAnswer — um aluno DESTA interface digitaria/clicaria exatamente isso neste componente? Se o formato não bate, CORRIJA o valor para o que a interface registraria; não remova nenhum erro por dúvida.
`
    : "";
  return `PROBLEMA (enunciado da interface):
${iface.problem}
${screenshotNote}
RESPOSTA CORRETA: ${iface.correctAnswer || "(deduza a partir do enunciado)"}

COMPONENTES DA INTERFACE — VOCABULÁRIO PERMITIDO para "selection" (use SOMENTE estes IDs):
${comps || "(nenhum componente detectado — trate como resposta única)"}
${ids ? `\nIDs válidos: [${ids}]` : ""}
${inventoryBlock}
Simule os três alunos e gere o JSON, com "selection" ∈ IDs válidos em cada passo e cada erro.`;
}

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

/**
 * Filtra entradas cujo `selection` não é um componente da interface (defesa em profundidade).
 * Entradas SEM `selection` são mantidas (não super-podar; o prompt é a barreira primária).
 * @returns {{kept:Array, dropped:number}}
 */
export function restrictToComponents(entries, allowed) {
  if (!allowed.size) return { kept: entries, dropped: 0 };
  let dropped = 0;
  const kept = entries.filter((e) => {
    const sel = e && e.selection != null ? canon(e.selection) : null;
    if (!sel) return true; // sem selection declarado → mantém
    if (allowed.has(sel)) return true;
    dropped++;
    return false;
  });
  return { kept, dropped };
}

/**
 * 2026-07-19: mesma receita de normalizeWorkerMisconceptionId (agent6-story.js) —
 * replicada aqui (a função vive num módulo com a cadeia de imports pesada do
 * Agent 6, que a avaliação não deve puxar). A RÉGUA em si (gramática + prefixos
 * genéricos reservados) é IMPORTADA de step-error-catalog.js (excerto local da
 * fonte única diagnostics/step-error-catalog.js), para nunca divergir da PR #27.
 */
function normalizeMiscId(raw) {
  const id = String(raw ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_.:-]/g, "");
  return MISC_ID_GRAMMAR_RE.test(id) ? id : "";
}

/**
 * 2026-07-19 (Trilha A): defesa em profundidade sobre os erros do robô —
 * compliance de prompt é estocástica (CLAUDE.md gotcha 4), então o contrato de
 * id/dedup é garantido aqui, além do filtro de selection:
 *  - id presente é normalizado para a gramática ^[A-Za-z0-9_.:-]+$;
 *    id que não normaliza (ou com prefixo genérico reservado) é DESCARTADO —
 *    a régua da PR #27 nunca afrouxa: genérico jamais passa por específico;
 *  - entradas SEM id são mantidas (não super-podar; a âncora da avaliação é a
 *    wrongAnswer — mesmo espírito de restrictToComponents com selection ausente);
 *  - dedup por (id, wrongAnswer canônica via canonAnswer: "2/8" ≡ "1/4") —
 *    sem teto, o mesmo erro repetido inflaria completude sem cobrir nada novo.
 * @returns {{kept:Array, droppedInvalidId:number, droppedDup:number}}
 */
export function sanitizeMisconceptions(entries) {
  const seen = new Set();
  const kept = [];
  let droppedInvalidId = 0;
  let droppedDup = 0;
  for (const m of entries || []) {
    if (!m || typeof m !== "object") continue;
    const rawId = m.id != null && String(m.id).trim() !== "" ? m.id : null;
    let id = "";
    if (rawId != null) {
      id = normalizeMiscId(rawId);
      if (!id || GENERIC_MISC_ID_RE.test(id)) {
        droppedInvalidId++;
        continue;
      }
    }
    const key = `${id}\u0000${canonAnswer(m.wrongAnswer ?? "")}`;
    if (seen.has(key)) {
      droppedDup++;
      continue;
    }
    seen.add(key);
    kept.push(id && id !== m.id ? { ...m, id } : m);
  }
  return { kept, droppedInvalidId, droppedDup };
}

/**
 * 2026-07-19 (Fase B, item 5): o 3b do EXPERIMENTO roda no premium recomendado
 * pelo repo EducaOFF (tiers.js → agent3b_atrisk.recommended = qwen/qwen3-max),
 * SEM tocar a configuração base. Precedência: opts.modelOverride/providerOverride
 * > env STI_EVAL_3B_MODEL/_PROVIDER > premium recomendado. Um configKey
 * customizado NÃO é o 3b do experimento — sai intocado da tabela AGENTS.
 *
 * Adaptação standalone: o getAgentConfig deste pacote (llm.js) não aceita
 * stateOverrides como o pipeline-core do backend; o override entra por spread
 * sobre a config herdada — MESMA precedência, mesmo resultado. Para reproduzir
 * os braços 1–5 da Campanha 5 (gemini-3.5-flash), use
 * STI_EVAL_3B_MODEL=google/gemini-3.5-flash.
 */
const EVAL_3B_PREMIUM = { provider: "openrouter", model: "qwen/qwen3-max" };

export function resolveEvalStudentConfig(opts = {}) {
  const configKey = opts.configKey || "agent3b_atrisk";
  const cfg = getAgentConfig(configKey);
  if (configKey !== "agent3b_atrisk") return cfg;
  return {
    ...cfg,
    provider: opts.providerOverride || process.env.STI_EVAL_3B_PROVIDER || EVAL_3B_PREMIUM.provider,
    model: opts.modelOverride || process.env.STI_EVAL_3B_MODEL || EVAL_3B_PREMIUM.model,
  };
}

/** Roda a simulação e devolve os traces (restritos aos componentes). Lança se o LLM falhar de todo. */
export async function simulateStudents(iface, opts = {}) {
  const cfg = resolveEvalStudentConfig(opts);
  const llm = createLLM(cfg);
  const t0 = Date.now();
  // opts.html/opts.dom: interface compartilhada (run-ctat-eval passa `html`);
  // opts.renderedFacts: interface RENDERIZADA reconstruída do template
  // mass-production (run-ctat-eval) → alimentam o inventário determinístico
  // do prompt (Melhoria #1 + Fase B, 2026-07-19).
  const raw = await callLLM(
    llm,
    SYSTEM,
    buildUserMessage(iface, { html: opts.html, dom: opts.dom, renderedFacts: opts.renderedFacts }),
    {
      agent: "eval_student_sim",
      sessionId: opts.sessionId || null,
    }
  );
  const parsed = extractJson(raw) || {};

  // Conjunto de componentes permitidos (id e label, canônicos).
  const allowed = new Set();
  for (const c of iface.components || []) {
    if (c.id) allowed.add(canon(c.id));
    if (c.label) allowed.add(canon(c.label));
  }

  const cp = restrictToComponents(asArray(parsed.correctPath), allowed);
  const mc = restrictToComponents(asArray(parsed.misconceptions), allowed);
  // 2026-07-19 (Trilha A): sem teto no prompt, o pós-parse ganha a 2ª camada —
  // gramática/prefixos de id + dedup por (id, wrongAnswer canônica).
  const sane = sanitizeMisconceptions(mc.kept);
  const traces = {
    correctPath: cp.kept,
    misconceptions: sane.kept,
    hints: asArray(parsed.hints),
  };

  logger.info(
    {
      module: "eval-simulate",
      elapsedMs: Date.now() - t0,
      steps: traces.correctPath.length,
      miscs: traces.misconceptions.length,
      droppedSteps: cp.dropped,
      droppedMiscs: mc.dropped,
      droppedInvalidId: sane.droppedInvalidId,
      droppedDupMiscs: sane.droppedDup,
      nComponents: allowed.size,
      provider: cfg.provider,
      model: cfg.model,
    },
    "Student simulation done (restrito aos componentes)"
  );

  if (!traces.correctPath.length) {
    // fallback mínimo: 1 passo, sem erros, para o grafo ainda sair válido
    traces.correctPath = [
      { kc: "kc_solve", action: "Resolver o problema", result: iface.correctAnswer || "" },
    ];
  }
  return traces;
}
