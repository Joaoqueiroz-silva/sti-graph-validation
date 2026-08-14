/**
 * analysis/avaliacao-plataforma.mjs — avaliação INTRÍNSECA dos grafos de
 * comportamento de STIs criados DIRETO na plataforma EducaOFF (2026-08-14).
 *
 * Por que intrínseca: STIs criados na plataforma não têm grafo de especialista
 * de referência (ao contrário do corpus CTAT), então os níveis 1-4 contra
 * referência NÃO se aplicam. O que dá para medir com régua igual à do
 * experimento — usando as MESMAS peças portadas de produção:
 *
 *   nível 0   auditBehaviorGraph (behavior-graph-integrity.js)
 *   régua PR#27  isSpecificMisconceptionId (portado byte a byte)
 *   templates    hasUnresolvedGraphTemplate (portado byte a byte)
 *   aterramento  isGroundedWrongAnswer (buggy-rules.js portado; null = não cobrável)
 *   nível 5      MESMAS heurísticas do validar.mjs (mencionaValor/falaComAluno/
 *                instruiProfessor/vazia) + revelaResposta
 *   entrega      ids específicos do catálogo (misconceptionMap) presentes em
 *                algum grafo / ids específicos do catálogo — o gargalo
 *                catálogo→grafo apontado pelas rodadas 1 e 2
 *
 * LEITURA SOMENTE: o arquivo de tutores é aberto para leitura e NADA é
 * escrito fora de --json. PII (creatorEmail) NUNCA entra na saída.
 *
 * Uso:
 *   node analysis/avaliacao-plataforma.mjs --tutores <shared_tutors.json> \
 *        [--json saida.json] [--disciplina matematica]
 */

import fs from "node:fs";
import crypto from "node:crypto";
import { auditBehaviorGraph } from "../behavior-graph-integrity.js";
import { isSpecificMisconceptionId } from "../step-error-catalog.js";
import { hasUnresolvedGraphTemplate } from "../producao/agents/behavior-graph-semantics.js";
import { isGroundedWrongAnswer } from "../producao/agents/diagnostics/buggy-rules.js";

const argv = process.argv.slice(2);
const opt = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : d;
};
const TUTORES = opt("--tutores", null);
const SAIDA = opt("--json", null);
const FILTRO_DISC = opt("--disciplina", null);

if (!TUTORES || !fs.existsSync(TUTORES)) {
  console.error("uso: node analysis/avaliacao-plataforma.mjs --tutores <shared_tutors.json> [--json out]");
  process.exit(2);
}

const bruto = fs.readFileSync(TUTORES);
const fonteSha256 = crypto.createHash("sha256").update(bruto).digest("hex");
const dados = JSON.parse(bruto.toString("utf8"));
const tutores = Array.isArray(dados) ? dados : Object.values(dados);

const semAcento = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

// MESMAS heurísticas do nível 5 do validar.mjs (byte a byte nos regexes).
const analisaFeedback = (fb, valor) => {
  const t = String(fb || "").toLowerCase();
  return {
    vazia: !String(fb || "").trim(),
    mencionaValor: valor ? t.includes(String(valor).toLowerCase()) : false,
    falaComAluno: /\bvoc[eê]\b|\bsua\b|\bseu\b|tente|observe|note|lembre|verifique|clique|conte|vamos/.test(t),
    instruiProfessor: /^\s*(utilizar|usar|revisar|explicar|mostrar|apresentar|reforçar|trabalhar|propor|aplicar)/i.test(
      String(fb || "").trim()
    ),
  };
};

function avaliaProblema(problem) {
  const bg = problem.behaviorGraph || {};
  const nodes = Array.isArray(bg.nodes) ? bg.nodes : [];
  const stepNodes = nodes.filter((n) => n.type === "step");
  const stepsMat = Array.isArray(problem.steps) ? problem.steps : [];

  let audit;
  try {
    const a = auditBehaviorGraph(bg);
    audit = { ok: !!a.ok, stepCount: a.stepCount ?? stepNodes.length };
  } catch {
    audit = { ok: false, stepCount: stepNodes.length };
  }

  const miscs = [];
  stepNodes.forEach((n, i) => {
    const stepMat = stepsMat[i] || null;
    for (const m of n.misconceptions || []) {
      const valor = String(m.wrongAnswer ?? "");
      const fb = m.feedback ?? "";
      const esperado = String(stepMat?.expectedAnswer ?? n.expectedInput?.value ?? "");
      let grounded = null;
      try {
        grounded = stepMat ? isGroundedWrongAnswer(stepMat, problem, valor) : null;
      } catch {
        grounded = null;
      }
      miscs.push({
        especifico: isSpecificMisconceptionId(m.id),
        template: hasUnresolvedGraphTemplate(m.id) || hasUnresolvedGraphTemplate(valor),
        valorVazio: !valor.trim(),
        grounded, // true | false | null (não cobrável)
        ...analisaFeedback(fb, valor),
        revelaResposta:
          !!esperado.trim() && String(fb || "").toLowerCase().includes(esperado.toLowerCase()),
        id: String(m.id || ""),
      });
    }
  });

  const passosComEspecifica = stepNodes.filter((n, i) =>
    (n.misconceptions || []).some((m) => isSpecificMisconceptionId(m.id))
  ).length;

  return {
    audit,
    nPassos: stepNodes.length,
    nMiscs: miscs.length,
    passosComEspecifica,
    passosComDica: stepNodes.filter((n) => (n.hints || []).length > 0).length,
    scaffolds: nodes.filter((n) => n.type === "scaffold").length,
    miscs,
  };
}

const porTutor = [];
for (const t of tutores) {
  const disc = semAcento(t.discipline);
  if (FILTRO_DISC && disc !== semAcento(FILTRO_DISC)) continue;
  const problemas = (t.problems || []).map(avaliaProblema);
  if (!problemas.length) continue;

  const catalogo = [];
  for (const kc of t.misconceptionMap || []) {
    for (const e of kc.errors || []) catalogo.push(String(e.id || ""));
  }
  const catalogoEspecifico = new Set(catalogo.filter((id) => isSpecificMisconceptionId(id)));
  const noGrafo = new Set(
    problemas.flatMap((p) => p.miscs.filter((m) => m.especifico).map((m) => m.id))
  );
  const entregues = [...catalogoEspecifico].filter((id) => noGrafo.has(id));

  porTutor.push({
    id: t.id,
    titulo: t.title || null,
    disciplina: disc,
    topico: t.topic || null,
    publicadoEm: t.sharedAt || null,
    problemas: problemas.map(({ miscs, ...resto }) => resto),
    miscsDetalhe: problemas.flatMap((p) => p.miscs),
    catalogo: {
      total: catalogo.length,
      especificos: catalogoEspecifico.size,
      entreguesAoGrafo: entregues.length,
    },
  });
}

// ── agregação ───────────────────────────────────────────────────────────────
const pct = (num, den) => (den ? (num / den) * 100 : null);
function agrega(subset, rotulo) {
  const probs = subset.flatMap((t) => t.problemas);
  const miscs = subset.flatMap((t) => t.miscsDetalhe);
  const cobraveis = miscs.filter((m) => m.grounded !== null);
  const comCatalogo = subset.filter((t) => t.catalogo.especificos > 0);
  const r = {
    rotulo,
    tutores: subset.length,
    problemas: probs.length,
    grafosExecutaveis: pct(probs.filter((p) => p.audit.ok).length, probs.length),
    passosPorGrafo: probs.length
      ? probs.reduce((s, p) => s + p.nPassos, 0) / probs.length
      : null,
    miscsPorGrafo: probs.length ? miscs.length / probs.length : null,
    passosComMiscEspecifica: pct(
      probs.reduce((s, p) => s + p.passosComEspecifica, 0),
      probs.reduce((s, p) => s + p.nPassos, 0)
    ),
    grafosSemNenhumaMisc: pct(probs.filter((p) => p.nMiscs === 0).length, probs.length),
    idsEspecificos: pct(miscs.filter((m) => m.especifico).length, miscs.length),
    templatesNaoResolvidos: pct(miscs.filter((m) => m.template).length, miscs.length),
    valoresVazios: pct(miscs.filter((m) => m.valorVazio).length, miscs.length),
    aterradas: pct(cobraveis.filter((m) => m.grounded === true).length, cobraveis.length),
    aterraveisAvaliadas: cobraveis.length,
    devolutiva: {
      vazia: pct(miscs.filter((m) => m.vazia).length, miscs.length),
      mencionaValor: pct(miscs.filter((m) => m.mencionaValor).length, miscs.length),
      falaComAluno: pct(miscs.filter((m) => m.falaComAluno).length, miscs.length),
      instruiProfessor: pct(miscs.filter((m) => m.instruiProfessor).length, miscs.length),
      revelaResposta: pct(miscs.filter((m) => m.revelaResposta).length, miscs.length),
    },
    entregaCatalogoGrafo: comCatalogo.length
      ? pct(
          comCatalogo.reduce((s, t) => s + t.catalogo.entreguesAoGrafo, 0),
          comCatalogo.reduce((s, t) => s + t.catalogo.especificos, 0)
        )
      : null,
    passosComDica: pct(
      probs.reduce((s, p) => s + p.passosComDica, 0),
      probs.reduce((s, p) => s + p.nPassos, 0)
    ),
  };
  return r;
}

const mes = (t) => (t.publicadoEm ? String(t.publicadoEm).slice(0, 7) : "sem-data");
const meses = [...new Set(porTutor.map(mes))].sort();
const agregados = {
  fonte: { arquivo: TUTORES, sha256: fonteSha256, tutoresNoArquivo: tutores.length },
  geral: agrega(porTutor, "geral"),
  matematica: agrega(porTutor.filter((t) => t.disciplina.startsWith("matematic")), "matematica"),
  porMes: meses.map((m) => agrega(porTutor.filter((t) => mes(t) === m), m)),
};

const f1 = (x) => (x === null ? "  —" : x.toFixed(1).padStart(5));
function imprime(a) {
  console.log(
    `  ${a.rotulo.padEnd(12)} ${String(a.tutores).padStart(4)} tutores ${String(a.problemas).padStart(5)} grafos | ` +
      `exec ${f1(a.grafosExecutaveis)}% | miscs/grafo ${a.miscsPorGrafo?.toFixed(2) ?? "—"} | ` +
      `passos c/ específica ${f1(a.passosComMiscEspecifica)}% | sem misc ${f1(a.grafosSemNenhumaMisc)}% | ` +
      `aterradas ${f1(a.aterradas)}% | entrega ${f1(a.entregaCatalogoGrafo)}% | ` +
      `prof ${f1(a.devolutiva.instruiProfessor)}% | revela ${f1(a.devolutiva.revelaResposta)}%`
  );
}

console.log("═".repeat(100));
console.log(`AVALIAÇÃO INTRÍNSECA — grafos de comportamento de STIs criados na plataforma EducaOFF`);
console.log(`fonte: ${TUTORES} (sha256 ${fonteSha256.slice(0, 12)}…) | ${porTutor.length} tutores avaliados`);
console.log("═".repeat(100));
imprime(agregados.geral);
imprime(agregados.matematica);
console.log("─".repeat(100));
console.log("POR MÊS DE PUBLICAÇÃO (sharedAt):");
for (const a of agregados.porMes) if (a.tutores >= 3) imprime(a);
console.log("─".repeat(100));
const d = agregados.geral.devolutiva;
console.log(
  `DEVOLUTIVA (geral): vazia ${f1(d.vazia)}% | menciona o valor ${f1(d.mencionaValor)}% | ` +
    `fala com o aluno ${f1(d.falaComAluno)}% | instrui o professor ${f1(d.instruiProfessor)}% | revela a resposta ${f1(d.revelaResposta)}%`
);

if (SAIDA) {
  const saida = {
    geradoEm: new Date().toISOString(),
    ...agregados,
    // por tutor SEM o detalhe por misconception (tamanho) e SEM PII
    porTutor: porTutor.map(({ miscsDetalhe, ...t }) => t),
  };
  fs.writeFileSync(SAIDA, JSON.stringify(saida, null, 1));
  console.log(`\nsalvo em ${SAIDA} (sem PII: creatorEmail nunca entra na saída)`);
}
