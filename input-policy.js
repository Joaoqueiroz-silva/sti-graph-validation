/**
 * Política explícita para separar o insumo entregue aos agentes do envelope
 * completo usado, depois da geração, pela avaliação offline.
 *
 * O default histórico preserva o comportamento das campanhas depositadas.
 * `somente-enunciado-v1` é opt-in e deixa entrar somente o texto do problema;
 * todo gabarito e metadado do pacote CTAT fica fora do estado dos agentes.
 */
import crypto from "node:crypto";

export const INPUT_POLICY_HISTORICA = "historico-v1";
export const INPUT_POLICY_SOMENTE_ENUNCIADO = "somente-enunciado-v1";
export const INPUT_POLICIES = Object.freeze([
  INPUT_POLICY_HISTORICA,
  INPUT_POLICY_SOMENTE_ENUNCIADO,
]);

// Chaves que nunca podem chegar aos agentes no braço estrito. A comparação
// canônica também cobre grafias como `kc_id`, `correct-answer` e `KCId`.
const CHAVES_RESTRITAS = new Set([
  "correctAnswer",
  "correctAnswers",
  "knowledgeComponents",
  "knowledgeComponent",
  "knowledgeComponentId",
  "knowledgeComponentName",
  "kcs",
  "kc",
  "kcId",
  "kcName",
  "kcUsed",
  "components",
  "component",
  "componentId",
  "componentType",
  "componentLabel",
  "selection",
  "interface",
  "interfaceCtat",
  "interfaceInventory",
  "discipline",
  "disciplineArea",
  "topic",
  "ageGroup",
  "difficulty",
  "profile",
  "interfaceSpec",
  "dataset",
  "ctat",
  "expert",
  "brd",
  "sourceFile",
  "sourcePath",
  "renderedFacts",
  "screenshotPath",
  "metadata",
].map((chave) => chave.toLowerCase().replace(/[^a-z0-9]/g, "")));

const chaveRestrita = (chave) =>
  CHAVES_RESTRITAS.has(
    String(chave || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
  );

export function resolverInputPolicy(valor = process.env.STI_INPUT_POLICY) {
  const v = String(valor || INPUT_POLICY_HISTORICA).trim();
  if (!INPUT_POLICIES.includes(v)) {
    throw new Error(
      `política de input desconhecida: "${v}"; use ${INPUT_POLICIES.join(" ou ")}`
    );
  }
  return v;
}

export const ehSomenteEnunciado = (politica) =>
  resolverInputPolicy(politica) === INPUT_POLICY_SOMENTE_ENUNCIADO;

export function validarCompatibilidadeInputPolicy(
  politica,
  { interfaceFixa = false } = {}
) {
  const id = resolverInputPolicy(politica);
  if (id === INPUT_POLICY_SOMENTE_ENUNCIADO && interfaceFixa) {
    throw new Error(
      `${INPUT_POLICY_SOMENTE_ENUNCIADO} é incompatível com interface fixa: ` +
        "a interface revelaria componentes e metadados retirados pelo braço estrito"
    );
  }
  return id;
}

/** Projeta o envelope que pode entrar na geração. Nunca altera o original. */
export function projetarEnvelopeParaAgentes(envelopeA, politica) {
  const id = resolverInputPolicy(politica);
  if (id === INPUT_POLICY_HISTORICA) return envelopeA;
  return { problem: String(envelopeA?.problem ?? "") };
}

/**
 * Defesa em profundidade para estados compostos (especialmente agent 6).
 * Remove recursivamente chaves restritas; IDs de problema são substituídos
 * por um identificador neutro, sem carregar o nome do arquivo/pacote CTAT.
 */
export function sanitizarEstadoParaAgentes(valor, politica) {
  const id = resolverInputPolicy(politica);
  if (id === INPUT_POLICY_HISTORICA) return valor;

  const visitar = (v) => {
    if (Array.isArray(v)) return v.map(visitar);
    if (!v || typeof v !== "object") return v;
    const out = {};
    for (const [chave, conteudo] of Object.entries(v)) {
      if (chaveRestrita(chave)) continue;
      if (chave === "problemId") {
        out.problemId = 1;
        continue;
      }
      out[chave] = visitar(conteudo);
    }
    return out;
  };
  return visitar(valor);
}

function jsonCanonico(valor) {
  if (Array.isArray(valor)) return `[${valor.map(jsonCanonico).join(",")}]`;
  if (valor && typeof valor === "object") {
    return `{${Object.keys(valor)
      .sort()
      .filter((k) => valor[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${jsonCanonico(valor[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(valor);
}

function listarChaves(valor) {
  const caminhos = new Set();
  const visitar = (v, prefixo) => {
    if (Array.isArray(v)) {
      if (!v.length && prefixo) caminhos.add(`${prefixo}[]`);
      for (const item of v) visitar(item, `${prefixo}[]`);
      return;
    }
    if (!v || typeof v !== "object") {
      if (prefixo) caminhos.add(prefixo);
      return;
    }
    const entradas = Object.entries(v);
    if (!entradas.length && prefixo) caminhos.add(prefixo);
    for (const [k, x] of entradas) visitar(x, prefixo ? `${prefixo}.${k}` : k);
  };
  visitar(valor, "");
  return [...caminhos].sort();
}

function caminhosRestritos(valor) {
  const encontrados = [];
  const visitar = (v, prefixo) => {
    if (Array.isArray(v)) {
      v.forEach((x) => visitar(x, `${prefixo}[]`));
      return;
    }
    if (!v || typeof v !== "object") return;
    for (const [k, x] of Object.entries(v)) {
      const p = prefixo ? `${prefixo}.${k}` : k;
      if (chaveRestrita(k)) encontrados.push(p);
      visitar(x, p);
    }
  };
  visitar(valor, "");
  return encontrados.sort();
}

function localizarStrings(valor, predicado) {
  const encontrados = [];
  const visitar = (v, prefixo) => {
    if (Array.isArray(v)) {
      v.forEach((x, i) => visitar(x, `${prefixo}[${i}]`));
      return;
    }
    if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) visitar(x, prefixo ? `${prefixo}.${k}` : k);
      return;
    }
    if (typeof v === "string" && predicado(v)) encontrados.push(prefixo || "$");
  };
  visitar(valor, "");
  return encontrados;
}

function listarProblemIds(valor) {
  const ids = [];
  const visitar = (v, prefixo) => {
    if (Array.isArray(v)) return v.forEach((x, i) => visitar(x, `${prefixo}[${i}]`));
    if (!v || typeof v !== "object") return;
    for (const [k, x] of Object.entries(v)) {
      const caminho = prefixo ? `${prefixo}.${k}` : k;
      if (k === "problemId") ids.push({ caminho, valor: x });
      visitar(x, caminho);
    }
  };
  visitar(valor, "");
  return ids;
}

/** Auditoria compacta e determinística do objeto efetivamente enviado. */
export function auditarInputAgentes(input, { politica, etapa } = {}) {
  const id = resolverInputPolicy(politica);
  const restritas = caminhosRestritos(input);
  if (id === INPUT_POLICY_SOMENTE_ENUNCIADO && restritas.length) {
    throw new Error(
      `input viola ${id}; chaves restritas presentes: ${restritas.join(", ")}`
    );
  }
  return {
    politica: id,
    etapa: String(etapa || "geracao"),
    sha256: crypto.createHash("sha256").update(jsonCanonico(input)).digest("hex"),
    chaves: listarChaves(input),
    chavesRestritas: restritas,
  };
}

/**
 * Confirma que a condição estrita não voltou a depender de templates que só
 * poderiam ser concretizados com o gabarito. A auditoria ocorre imediatamente
 * após as chamadas e antes de qualquer contato com a referência.
 */
export function auditarSaidaAgentes(output, { politica, etapa } = {}) {
  const id = resolverInputPolicy(politica);
  const placeholders = localizarStrings(
    output,
    // A bancada histórica usa exatamente estes símbolos. Restringir a busca
    // evita classificar notação matemática legítima, como o conjunto {x},
    // como vazamento do template.
    (texto) => /\{(?:A|B|C)(?:_(?:num|den))?\}/i.test(texto)
  );
  const saidasGenericas = localizarStrings(
    output,
    (texto) => {
      const t = texto.trim();
      // Literais usados apenas para documentar o schema dos prompts. Se um
      // modelo os repetir, produziu um molde, não um estado observável.
      return /^(?:resultado|valor esperado|acao concreta(?: e curta)?|papel_semantico_do_alvo|kc_inferido_descritivo|resumo observavel(?: e)? curto|pergunta conceitual|procedimento|pista forte sem resposta|ultimo passo sem revelar a resposta|causa|estado e operacao|orientacao sem resposta)$/i.test(t) ||
        /\b(?:valor concreto calculado|resposta concreta calculada|resposta errada concreta|resultado calculado)\b/i.test(t);
    }
  );
  const problemIds = listarProblemIds(output);
  const problemIdsInvalidos = id === INPUT_POLICY_SOMENTE_ENUNCIADO
    ? problemIds.filter(({ valor }) => Number(valor) !== 1)
    : [];
  const violacoes = [
    ...placeholders.map((caminho) => `placeholder:${caminho}`),
    ...saidasGenericas.map((caminho) => `saida-generica:${caminho}`),
    ...problemIdsInvalidos.map(({ caminho, valor }) => `problemId:${caminho}=${String(valor)}`),
  ];
  if (id === INPUT_POLICY_SOMENTE_ENUNCIADO && violacoes.length) {
    throw new Error(
      `saída viola ${id}; ${violacoes.slice(0, 12).join(", ")}` +
      (violacoes.length > 12 ? ` (+${violacoes.length - 12})` : "")
    );
  }
  return {
    politica: id,
    etapa: String(etapa || "geracao"),
    sha256: crypto.createHash("sha256").update(jsonCanonico(output)).digest("hex"),
    placeholders,
    saidasGenericas,
    problemIds: problemIds.map(({ caminho, valor }) => ({ caminho, valor })),
    problemIdsInvalidos,
    violacoes,
  };
}
