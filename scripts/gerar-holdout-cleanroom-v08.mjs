#!/usr/bin/env node
/**
 * Gera o holdout confirmatório v0.8 sem rede e sem fonte de terceiros.
 *
 * O dataset é uma função pura de SEED + deste arquivo. `--write` materializa;
 * `--check` compara byte a byte o conteúdo esperado com o disco.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, "..");
export const DATASET_NAME = "holdout-cleanroom-v08";
export const DATASET_ROOT = path.join(REPO, "datasets", DATASET_NAME);
export const SEED = 8042026;
export const SCHEMA = "sti.holdout-cleanroom-v08/1";
export const LICENSE = "CC0-1.0";

const json = (value) => JSON.stringify(value, null, 2) + "\n";
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

/** PRNG inteiro estável; não depende da implementação de Math.random. */
export function criarPrng(seed = SEED) {
  let state = Number(seed) >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

const inteiro = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));
const escolher = (rng, values) => values[inteiro(rng, 0, values.length - 1)];

export function mdc(a, b) {
  let x = Math.abs(Number(a));
  let y = Math.abs(Number(b));
  while (y) [x, y] = [y, x % y];
  return x;
}

const slugId = (family, index) => `${family}-${String(index).padStart(2, "0")}`;

const action = Object.freeze({
  name: "UpdateTextField",
  family: "entrada_texto_numero",
  interactionFamily: "input_value",
});

function step({ order, role, value, kc, hints, wrongValue, misconception, feedback }) {
  return {
    id: `s${order}-${role}`,
    order,
    componentSemantic: role,
    targetRole: role,
    action: action.name,
    actionFamily: action.family,
    interactionFamily: action.interactionFamily,
    value: String(value),
    knowledgeComponent: kc,
    hints: hints.map((text, index) => ({ level: index + 1, type: index === hints.length - 1 ? "bottom_out" : "progressive", text })),
    predictableErrors: [
      {
        id: `${role}-${misconception}`,
        wrongValue: String(wrongValue),
        misconception,
        feedback,
      },
    ],
  };
}

const contextos = Object.freeze([
  "laboratório de cerâmica",
  "centro de encadernação",
  "depósito de sementes",
  "estúdio de animação",
  "observatório comunitário",
  "ateliê de mosaicos",
  "acervo comunitário",
  "viveiro experimental",
  "clube de robótica",
  "arquivo fotográfico",
]);

function proportionality(rng, index) {
  const baseGroups = inteiro(rng, 2, 5);
  const perGroup = inteiro(rng, 4, 13);
  const scale = inteiro(rng, 2, 5);
  const targetGroups = baseGroups * scale;
  const baseTotal = baseGroups * perGroup;
  const total = targetGroups * perGroup;
  const context = contextos[index - 1];
  const statement = `No ${context}, ${baseGroups} conjuntos idênticos consomem ${baseTotal} peças. Mantendo exatamente a mesma quantidade de peças por conjunto, quantas peças serão necessárias para montar ${targetGroups} conjuntos? Apresente o cálculo da taxa por conjunto, do fator de escala e do total.`;
  return {
    family: "proporcionalidade",
    statement,
    parameters: { baseGroups, perGroup, scale, targetGroups, baseTotal },
    answer: total,
    steps: [
      step({ order: 1, role: "taxa_por_conjunto", value: perGroup, kc: "divisao_exata", wrongValue: baseTotal - baseGroups, misconception: "subtrai_em_vez_de_dividir", feedback: "A taxa compara peças com conjuntos; divida o total inicial pela quantidade inicial de conjuntos.", hints: ["Descubra primeiro quantas peças cabem em um único conjunto.", `Divida ${baseTotal} por ${baseGroups}.`, `A taxa é ${perGroup} peças por conjunto.`] }),
      step({ order: 2, role: "fator_de_escala", value: scale, kc: "razao_multiplicativa", wrongValue: targetGroups - baseGroups, misconception: "usa_diferenca_aditiva", feedback: "O fator é multiplicativo: compare a quantidade final de conjuntos com a inicial por divisão.", hints: ["Compare o número final de conjuntos com o número inicial.", `Calcule ${targetGroups} dividido por ${baseGroups}.`, `O fator de escala é ${scale}.`] }),
      step({ order: 3, role: "quantidade_total", value: total, kc: "multiplicacao_proporcional", wrongValue: baseTotal + targetGroups, misconception: "soma_grandezas_incompativeis", feedback: "Multiplique a taxa por conjunto pela quantidade desejada de conjuntos.", hints: ["Use a taxa unitária em todos os conjuntos desejados.", `Multiplique ${perGroup} por ${targetGroups}.`, `O total necessário é ${total} peças.`] }),
    ],
  };
}

function percentage(rng, index) {
  const percent = escolher(rng, [10, 20, 25, 30, 40]);
  const unit = 100 / mdc(100, percent);
  const price = inteiro(rng, 4, 18) * unit * 5;
  const discount = (price * percent) / 100;
  const finalPrice = price - discount;
  const context = contextos[(index + 2) % contextos.length];
  const statement = `O ${context} anunciou uma redução de ${percent}% no preço de um kit que custava R$ ${price}. Calcule, em reais, o valor da redução e o novo preço do kit.`;
  return {
    family: "porcentagem",
    statement,
    parameters: { percent, price },
    answer: finalPrice,
    steps: [
      step({ order: 1, role: "valor_da_reducao", value: discount, kc: "porcentagem_de_quantidade", wrongValue: percent, misconception: "confunde_percentual_com_valor", feedback: "O percentual não é automaticamente um valor em reais; calcule essa fração do preço original.", hints: ["Transforme a porcentagem em uma parte do preço original.", `Calcule ${percent} de cada 100 sobre ${price}.`, `A redução vale R$ ${discount}.`] }),
      step({ order: 2, role: "preco_final", value: finalPrice, kc: "subtracao_monetaria", wrongValue: price + discount, misconception: "soma_desconto", feedback: "Uma redução deve ser subtraída do preço original, não adicionada.", hints: ["Retire do preço original o valor já calculado.", `Subtraia ${discount} de ${price}.`, `O novo preço é R$ ${finalPrice}.`] }),
    ],
  };
}

function average(rng, index) {
  const count = escolher(rng, [4, 5]);
  const targetAverage = inteiro(rng, 8, 24);
  const offsets = count === 4 ? [-3, -1, 1, 3] : [-4, -2, 0, 2, 4];
  const values = offsets.map((offset) => targetAverage + offset);
  const sum = targetAverage * count;
  const context = contextos[(index + 4) % contextos.length];
  const statement = `Durante ${count} sessões do ${context}, foram concluídas respectivamente ${values.join(", ")} tarefas. Qual foi a média de tarefas concluídas por sessão? Mostre a soma, a quantidade de sessões e a média.`;
  return {
    family: "media-aritmetica",
    statement,
    parameters: { values, count },
    answer: targetAverage,
    steps: [
      step({ order: 1, role: "soma_das_observacoes", value: sum, kc: "adicao_de_dados", wrongValue: sum - values.at(-1), misconception: "omite_ultima_observacao", feedback: "A soma precisa incluir todas as observações informadas.", hints: ["Reúna os valores de todas as sessões.", `Some ${values.join(" + ")}.`, `A soma das observações é ${sum}.`] }),
      step({ order: 2, role: "numero_de_observacoes", value: count, kc: "contagem_de_dados", wrongValue: count - 1, misconception: "contagem_incompleta", feedback: "Conte cada sessão apresentada, inclusive a última.", hints: ["O divisor da média é a quantidade de observações.", `Conte os ${count} valores listados.`, `Há ${count} observações.`] }),
      step({ order: 3, role: "media_final", value: targetAverage, kc: "media_aritmetica", wrongValue: sum, misconception: "nao_divide_a_soma", feedback: "A média não é apenas a soma; divida a soma pela quantidade de observações.", hints: ["Use a soma e a quantidade já obtidas.", `Divida ${sum} por ${count}.`, `A média é ${targetAverage} tarefas por sessão.`] }),
    ],
  };
}

function linearEquation(rng, index) {
  const coefficient = inteiro(rng, 2, 9);
  const solution = inteiro(rng, 3, 18);
  const constant = inteiro(rng, 2, 15);
  const rhs = coefficient * solution + constant;
  const isolated = rhs - constant;
  const context = contextos[(index + 6) % contextos.length];
  const statement = `Para calibrar um equipamento do ${context}, usa-se a equação ${coefficient}x + ${constant} = ${rhs}. Determine o valor de x, registrando primeiro o termo que resta depois de isolar ${coefficient}x e depois a solução.`;
  return {
    family: "equacao-linear",
    statement,
    parameters: { coefficient, solution, constant, rhs },
    answer: solution,
    steps: [
      step({ order: 1, role: "termo_isolado", value: isolated, kc: "operacao_inversa_aditiva", wrongValue: rhs + constant, misconception: "soma_ao_isolar", feedback: "Para remover uma soma, aplique a subtração do mesmo termo aos dois lados.", hints: ["Desfaça primeiro a adição ao lado de x.", `Calcule ${rhs} menos ${constant}.`, `O termo isolado é ${coefficient}x = ${isolated}.`] }),
      step({ order: 2, role: "solucao_de_x", value: solution, kc: "operacao_inversa_multiplicativa", wrongValue: isolated - coefficient, misconception: "subtrai_coeficiente", feedback: "O coeficiente multiplica x; desfaça essa operação por divisão.", hints: ["Agora desfaça a multiplicação pelo coeficiente.", `Divida ${isolated} por ${coefficient}.`, `A solução é x = ${solution}.`] }),
    ],
  };
}

function fraction(rng, index) {
  const simplifiedNumerator = inteiro(rng, 2, 8);
  let simplifiedDenominator = inteiro(rng, simplifiedNumerator + 1, 14);
  while (mdc(simplifiedNumerator, simplifiedDenominator) !== 1) simplifiedDenominator++;
  const factor = inteiro(rng, 2, 7);
  const numerator = simplifiedNumerator * factor;
  const denominator = simplifiedDenominator * factor;
  const context = contextos[(index + 8) % contextos.length];
  const statement = `Em um inventário do ${context}, ${numerator} de ${denominator} registros pertencem à categoria analisada. Escreva essa parte como fração irredutível, mostrando o máximo divisor comum, o novo numerador e o novo denominador.`;
  return {
    family: "simplificacao-de-fracao",
    statement,
    parameters: { numerator, denominator, factor },
    answer: `${simplifiedNumerator}/${simplifiedDenominator}`,
    steps: [
      step({ order: 1, role: "maximo_divisor_comum", value: factor, kc: "mdc", wrongValue: factor + 1, misconception: "divisor_nao_comum", feedback: "O número escolhido precisa dividir exatamente o numerador e o denominador.", hints: ["Procure o maior fator compartilhado pelos dois termos.", `Compare os divisores de ${numerator} e ${denominator}.`, `O máximo divisor comum é ${factor}.`] }),
      step({ order: 2, role: "numerador_reduzido", value: simplifiedNumerator, kc: "divisao_de_fracao", wrongValue: numerator, misconception: "mantem_numerador_original", feedback: "Divida o numerador pelo máximo divisor comum encontrado.", hints: ["Reduza o termo de cima pelo divisor comum.", `Divida ${numerator} por ${factor}.`, `O novo numerador é ${simplifiedNumerator}.`] }),
      step({ order: 3, role: "denominador_reduzido", value: simplifiedDenominator, kc: "divisao_de_fracao", wrongValue: denominator, misconception: "mantem_denominador_original", feedback: "O mesmo divisor deve ser aplicado também ao denominador.", hints: ["Reduza o termo de baixo pelo mesmo divisor.", `Divida ${denominator} por ${factor}.`, `O novo denominador é ${simplifiedDenominator}.`] }),
      step({ order: 4, role: "fracao_irredutivel", value: `${simplifiedNumerator}/${simplifiedDenominator}`, kc: "representacao_fracionaria", wrongValue: `${simplifiedDenominator}/${simplifiedNumerator}`, misconception: "inverte_termos", feedback: "Conserve a posição dos termos: parte no numerador e total no denominador.", hints: ["Monte a fração com os dois termos reduzidos na ordem original.", `Use ${simplifiedNumerator} sobre ${simplifiedDenominator}.`, `A fração irredutível é ${simplifiedNumerator}/${simplifiedDenominator}.`] }),
    ],
  };
}

const FAMILY_BUILDERS = Object.freeze([
  ["proporcionalidade", proportionality],
  ["porcentagem", percentage],
  ["media-aritmetica", average],
  ["equacao-linear", linearEquation],
  ["simplificacao-de-fracao", fraction],
]);

function problemFiles(problem) {
  const reference = {
    schema: SCHEMA,
    id: problem.id,
    family: problem.family,
    license: LICENSE,
    generatedBy: "scripts/gerar-holdout-cleanroom-v08.mjs",
    seed: SEED,
    parameters: problem.parameters,
    correctAnswer: String(problem.answer),
    correctPath: problem.steps,
  };
  const envelopeA = { id: problem.id, problem: problem.statement };
  const envelopeB = {
    schema: `${SCHEMA}:neutral-envelope-b`,
    meta: { source: "clean-room-deterministic", problem: problem.statement, family: problem.family, license: LICENSE },
    steps: problem.steps.map((s) => ({
      key: s.value,
      answer: s.value,
      kc: s.knowledgeComponent,
      order: s.order,
      component: s.componentSemantic,
      selection: s.componentSemantic,
      targetRole: s.targetRole,
      action: s.action,
      actionFamily: s.actionFamily,
      interactionFamily: s.interactionFamily,
    })),
    misconceptions: problem.steps.flatMap((s) => s.predictableErrors.map((e) => ({
      key: e.wrongValue,
      wrongAnswer: e.wrongValue,
      stepKey: s.value,
      stepOrder: s.order,
      component: s.componentSemantic,
      selection: s.componentSemantic,
      targetRole: s.targetRole,
      action: s.action,
      actionFamily: s.actionFamily,
      misconceptionId: e.id,
      feedback: e.feedback,
      mechanical: false,
    }))),
    hintsPerCorrectStep: problem.steps.map((s) => s.hints.map((h) => h.text)),
  };
  return { envelopeA, envelopeB, reference };
}

export function gerarProblemas(seed = SEED) {
  const rng = criarPrng(seed);
  const problems = [];
  for (const [family, builder] of FAMILY_BUILDERS) {
    for (let index = 1; index <= 10; index++) {
      const generated = builder(rng, index);
      if (generated.family !== family) throw new Error(`gerador inconsistente: ${family}`);
      problems.push({ ...generated, id: slugId(family, index) });
    }
  }
  return problems;
}

function staticFiles() {
  return {
    "LICENSE-DATA.md": `# CC0 1.0 Universal\n\nOs arquivos de dados originais deste diretório são dedicados ao domínio público sob **CC0 1.0 Universal** (SPDX: \`CC0-1.0\`).\n\nTexto legal e resumo: https://creativecommons.org/publicdomain/zero/1.0/\n\nA dedicação cobre os enunciados, parâmetros, referências, erros, dicas e manifestos gerados especificamente para \`holdout-cleanroom-v08\`. O código gerador permanece sob MIT. Materiais de terceiros de outros diretórios não são relicenciados.\n`,
    "README.md": `# Holdout clean-room v0.8\n\nCorpus sintético original de 50 problemas (cinco famílias × dez), gerado offline e deterministicamente por \`scripts/gerar-holdout-cleanroom-v08.mjs\`. Nenhum enunciado ou gabarito foi derivado do CTAT/Mathtutor/CMU.\n\n- entrada dos agentes: somente \`envelope-a.json\`, que contém apenas \`id\` e \`problem\`;\n- referência pós-geração: \`envelope-b.json\` e \`reference-v08.json\`;\n- licença dos dados: CC0-1.0; código: MIT;\n- semente: \`${SEED}\`;\n- protocolo: \`docs/EMENDA-V0.8-02-HOLDOUT-CLEANROOM-2026-08-20.md\`.\n\nReproduza com \`node scripts/gerar-holdout-cleanroom-v08.mjs --check\`. Para materializar novamente os arquivos a partir do gerador, use \`--write\`.\n`,
    "DATA-CARD.md": `# Data card — holdout-cleanroom-v08\n\n## Finalidade\n\nAvaliar, fora do corpus exploratório de terceiros, a recuperação de caminhos de resolução, alvos semânticos, famílias de ação, erros e dicas sob a política somente-enunciado. O conjunto não mede aprendizagem humana nem demonstra eficácia pedagógica.\n\n## Composição\n\n50 problemas em português, dez por família: proporcionalidade, porcentagem, média aritmética, equação linear e simplificação de fração. Cada referência inclui matemática exata, caminho ordenado 1:1, \`targetRole\`, ação, erro previsível e três dicas programáticas por estado.\n\n## Criação e proveniência\n\nConteúdo produzido por templates e fórmulas originais no gerador local, com PRNG xorshift32 e semente ${SEED}. O processo é offline, não consulta corpora externos e não usa arquivos CTAT como insumo. O teste de independência bloqueia frases extensas compartilhadas com os enunciados de terceiros presentes no repositório.\n\n## Separação de informação\n\n\`envelope-a.json\` contém exclusivamente identificador e enunciado. Resposta, parâmetros e referência ficam em arquivos separados e são lidos somente após a geração. A condição confirmatória aceita apenas \`somente-enunciado-v1\`.\n\n## Limitações\n\nÉ um holdout sintético de matemática escolar, com linguagem e decomposições programáticas. Ele fortalece validade interna, licenciamento e auditoria, mas não substitui amostragem de tarefas autênticas, julgamento de professores ou estudo com estudantes.\n\n## Licença e manutenção\n\nDados dedicados por CC0-1.0; gerador sob MIT. Qualquer alteração após a coleta exige nova versão, nova emenda e preservação dos hashes anteriores.\n`,
    "corpus.json": json({
      nome: DATASET_NAME,
      casesDir: "cases/holdout-cleanroom-v08-not-used",
      corpusState: { discipline: "matematica", topic: "resolucao multietapas", ageGroup: "12" },
      interface: { tipo: "sem-interface-especialista" },
      license: LICENSE,
      origin: "clean-room-deterministic",
    }),
  };
}

export function construirArquivos(seed = SEED) {
  const files = new Map(Object.entries(staticFiles()));
  const problems = gerarProblemas(seed);
  for (const problem of problems) {
    const { envelopeA, envelopeB, reference } = problemFiles(problem);
    const base = `problems/${problem.id}`;
    files.set(`${base}/envelope-a.json`, json(envelopeA));
    files.set(`${base}/envelope-b.json`, json(envelopeB));
    files.set(`${base}/reference-v08.json`, json(reference));
  }
  const generatorSha256 = sha256(fs.readFileSync(fileURLToPath(import.meta.url)));
  const entries = [...files.entries()].sort(([a], [b]) => a.localeCompare(b));
  const fileHashes = Object.fromEntries(entries.map(([rel, text]) => [rel, sha256(text)]));
  const familyCounts = Object.fromEntries(FAMILY_BUILDERS.map(([family]) => [family, problems.filter((p) => p.family === family).length]));
  const manifest = {
    schema: `${SCHEMA}:manifest`,
    dataset: DATASET_NAME,
    origin: "clean-room-deterministic",
    license: LICENSE,
    seed,
    generator: "scripts/gerar-holdout-cleanroom-v08.mjs",
    generatorSha256,
    problemCount: problems.length,
    familyCounts,
    envelopeAAllowedKeys: ["id", "problem"],
    files: fileHashes,
    contentSha256: sha256(json(fileHashes)),
  };
  files.set("manifest.json", json(manifest));
  return { files, manifest, problems };
}

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

export function escreverDataset({ root = DATASET_ROOT, seed = SEED } = {}) {
  const { files, manifest } = construirArquivos(seed);
  for (const [rel, text] of files) writeAtomic(path.join(root, rel), text);
  return manifest;
}

export function verificarDataset({ root = DATASET_ROOT, seed = SEED } = {}) {
  const { files, manifest } = construirArquivos(seed);
  const problemsRoot = path.join(root, "problems");
  const actual = [];
  const walk = (dir, rel = "") => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const childRel = path.posix.join(rel, entry.name);
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, childRel);
      else actual.push(childRel);
    }
  };
  walk(root);
  const expected = [...files.keys()].sort();
  const extras = actual.filter((rel) => !files.has(rel));
  const missing = expected.filter((rel) => !fs.existsSync(path.join(root, rel)));
  const changed = expected.filter((rel) => {
    const file = path.join(root, rel);
    return fs.existsSync(file) && fs.readFileSync(file, "utf8") !== files.get(rel);
  });
  if (!fs.existsSync(problemsRoot) || extras.length || missing.length || changed.length) {
    throw new Error(`holdout divergente: extras=${extras.join(",") || "-"}; ausentes=${missing.join(",") || "-"}; alterados=${changed.join(",") || "-"}`);
  }
  return manifest;
}

export function main(argv = process.argv.slice(2)) {
  const write = argv.includes("--write");
  const check = argv.includes("--check") || !write;
  for (const arg of argv) if (!["--write", "--check"].includes(arg)) throw new Error(`flag desconhecida: ${arg}`);
  if (write) {
    const manifest = escreverDataset();
    console.log(`✓ ${manifest.problemCount} problemas materializados em ${DATASET_ROOT}`);
    console.log(`  sha256 do conteúdo: ${manifest.contentSha256}`);
  }
  if (check) {
    const manifest = verificarDataset();
    console.log(`✓ holdout determinístico: ${manifest.problemCount} problemas; ${manifest.contentSha256}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message || error); process.exitCode = 1; }
}
