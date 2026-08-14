/**
 * producao/agents/patterns/quality-gate.js — ADAPTADOR do port 2026-08
 * (docs/PLANO-PORT-AGENTES-2026-08.md §3).
 *
 * O quality-gate completo de produção (1530 linhas) puxa meia dúzia de
 * subsistemas do backend (affordance-policies, request-context, dynamic-spec,
 * hint-answer-guard...). O graphforge.js portado importa UMA função dele:
 * `inferRequestedStepMinimum`. Este adaptador carrega essa função e suas duas
 * dependências privadas, copiadas VERBATIM (por script, sem retranscrição) de
 * `backend/agents/patterns/quality-gate.js` (sti-unplugged, origin/main,
 * commit b7ae8780cf20de9550bc7b3e6d9f0e0f72259b00, linhas 62-131) — elas não
 * dependem de nada além da stdlib, então o comportamento é idêntico byte a
 * byte ao de produção. Se a régua mudar lá, este excerto muda junto.
 */

const REQUESTED_STEP_WORDS = new Map([
  ["um", 1],
  ["uma", 1],
  ["dois", 2],
  ["duas", 2],
  ["tres", 3],
  ["quatro", 4],
  ["cinco", 5],
  ["seis", 6],
  ["sete", 7],
  ["oito", 8],
  ["nove", 9],
  ["dez", 10],
  ["three", 3],
  ["four", 4],
  ["five", 5],
  ["six", 6],
  ["seven", 7],
  ["eight", 8],
  ["tres", 3],
  ["cuatro", 4],
  ["cinco", 5],
  ["seis", 6],
  ["siete", 7],
  ["ocho", 8],
]);

function normalizeRequestText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function inferRequestedStepMinimum(value) {
  let text = normalizeRequestText(value);
  if (!text) return { minimum: 0, perProblem: false };
  const countToken =
    "(\\d{1,2}|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|three|four|five|six|seven|eight|cuatro|siete|ocho)";
  const excludedClause = new RegExp(
    `(?:no maximo|ate|maximum(?: of)?|at most|como maximo|nao (?:crie|use|gere|inclua)|do not (?:create|use|generate|include)|no (?:cree|use|genere|incluya))\\s*${countToken}\\s*(?:passos?|steps?|pasos?)\\b`,
    "gi"
  );
  text = text.replace(excludedClause, " ");
  const patterns = [
    new RegExp(
      `(?:>=|≥|pelo menos|ao menos|minimo(?: de)?|at least|minimum(?: of)?|al menos|como minimo)\\s*${countToken}\\s*(?:passos?|steps?|pasos?)\\b`,
      "i"
    ),
    new RegExp(`\\b${countToken}\\s*(?:passos?|steps?|pasos?)\\b`, "i"),
  ];
  let token = "";
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      token = match[1];
      break;
    }
  }
  if (!token) return { minimum: 0, perProblem: false };
  const numeric = Number(token);
  const minimum = Number.isFinite(numeric) ? numeric : REQUESTED_STEP_WORDS.get(token) || 0;
  const perProblem =
    /(?:cada|por) (?:problema|questao|atividade)|(?:passos?|steps?|pasos?) (?:em )?cada|per problem|each problem/.test(
      text
    );
  return { minimum: Math.min(Math.max(minimum, 0), 40), perProblem };
}
