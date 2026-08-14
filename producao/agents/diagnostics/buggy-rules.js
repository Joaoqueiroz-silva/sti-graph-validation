/**
 * buggy-rules.js — respostas erradas CALCULADAS a partir dos dados do passo.
 *
 * Por que existe (medição de 2026-08-09 sobre 605 erros reais de aluno em
 * passos de gabarito numérico):
 *
 *   modelo de erro dos agentes, ~2 respostas erradas por passo ....  6,3%
 *   este motor, 3 candidatos por passo ...........................  22,6%
 *   este motor, 5 candidatos por passo ...........................  28,3%
 *
 * A causa da diferença é mecânica, não de prompt. O gerador de distratores
 * atual (`_numericDistractors` em lib/tutor-normalization.js) deriva candidatos
 * PERTURBANDO O GABARITO: `n+1, n-1, n*2, n/2`. O aluno não perturba a resposta
 * — ele OPERA SOBRE OS DADOS e chega em outro lugar. Olhando os erros reais:
 *
 *   "quantas vezes 4 cabe em 8?"        gabarito 2   aluno 8   (o dividendo)
 *   "quantos grupos?" (4 caixas, 6 maçãs) gabarito 4 aluno 6   (o outro operando)
 *   "qual o coeficiente de x em 3x+7=19?" gabarito 3 aluno 4   (a solução final)
 *   "quantos centavos tem R$ 2,35?"     gabarito 35  aluno 235 (os dígitos juntos)
 *
 * Nenhum é função da resposta. Todos são função dos números do enunciado. Daí a
 * ordem das regras aqui: ela NÃO veio da literatura, veio da contagem de quais
 * regras explicam os erros que os alunos do EducaOFF de fato cometeram.
 *
 * O motor é determinístico de propósito: uma resposta errada calculada não pode
 * ser alucinada. O que ele NÃO faz bem é escrever o texto pedagógico — para
 * isso o feedback aqui é um piso honesto, e quem tiver um LLM à mão (geração,
 * colheita) deve sobrescrever.
 */

/** Número "de verdade" no texto: não pode estar colado a uma letra.
 *
 *  2026-08-09: sem essa guarda, "P1" (id do problema), "step_1" e "x2" viravam
 *  operandos. O gate de qualidade pegou o caso real: um passo "Calcule 2+2."
 *  com enunciado de problema "P1" ganhou o candidato "1", que não é erro de
 *  aluno nenhum — é o identificador do problema. Ruído vira rota morta e
 *  empurra a proporção de distrator sintético para cima sem ganho nenhum. */
const NUMERO_RE = /(?<![A-Za-zÀ-ÿ_])-?\d+(?:[.,]\d+)?/g;

/** Aceita o menos tipográfico que o LLM escreve e a vírgula decimal pt-BR. */
export function escalar(valor) {
  if (valor == null) return null;
  const bruto = String(valor).trim().replace(/[−–—]/g, "-");
  if (!/^-?\d+(?:[.,]\d+)?$/.test(bruto)) return null;
  const n = Number(bruto.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function numerosDe(texto) {
  const achados =
    String(texto ?? "")
      .replace(/[−–—]/g, "-")
      .match(NUMERO_RE) || [];
  const out = [];
  for (const bruto of achados) {
    const n = Number(bruto.replace(",", "."));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

/** Formata como o gabarito está escrito: se ele usa vírgula, o candidato usa. */
function formatar(valor, gabaritoBruto) {
  const usaVirgula = String(gabaritoBruto ?? "").includes(",");
  if (Number.isInteger(valor)) return String(valor);
  const texto = String(Math.round(valor * 100) / 100);
  return usaVirgula ? texto.replace(".", ",") : texto;
}

/** Um candidato só vale se for escrevível por um aluno: nada de 2.3333333. */
function representavel(valor) {
  if (!Number.isFinite(valor)) return false;
  if (Number.isInteger(valor)) return true;
  return Math.abs(valor * 100 - Math.round(valor * 100)) < 1e-9;
}

/** id operacional, específico e único dentro do passo.
 *
 *  2026-08-09: o sinal FAZ parte da identidade. Sem ele, `-2` e `2` da mesma
 *  regra colapsavam no mesmo id, duas rotas do grafo disputavam o mesmo
 *  `misconception(...)` e o dedup do compilador matava uma delas em silêncio. */
function idDaRegra(regra, valor) {
  const sufixo = String(valor)
    .replace(/-/g, "neg")
    .replace(/[^0-9a-z]/gi, "_")
    .replace(/_+/g, "_")
    .replace(/(^_|_$)/g, "");
  return `misc_${regra}${sufixo ? `_${sufixo}` : ""}`;
}

/**
 * Catálogo de regras, EM ORDEM DE PODER EXPLICATIVO MEDIDO.
 *
 * A ordem vale mais que o conteúdo. Sobre os mesmos 500 erros reais:
 *
 *   ordem                                        top-3   top-5   top-8
 *   combinações antes dos números do enunciado   24,8%   31,4%   41,6%
 *   números do enunciado antes das combinações   27,4%   33,4%   40,0%
 *   ESTA (enunciado, depois off-by-one)          30,8%   37,4%   42,4%
 *
 * A primeira ordem era a minha intuição, e ela perdia 6 pontos no top-3. Mudar
 * esta lista sem rodar `scripts/medir-modelo-de-erro.mjs` é trocar evidência
 * por palpite — o mesmo erro, de novo.
 */
const REGRAS = [
  {
    chave: "numero_do_passo",
    aterrada: true,
    descricao: "responde com outro número que aparece no próprio enunciado do passo",
    feedback: (v) =>
      `O número ${v} aparece no enunciado, mas ele responde a outra coisa. Releia com calma o que ESTE passo está pedindo.`,
  },
  {
    chave: "numero_do_problema",
    aterrada: true,
    descricao: "responde com um número da história do problema, não do passo",
    feedback: (v) =>
      `O ${v} apareceu na história do problema, mas não é o que este passo pergunta. Volte à pergunta do passo.`,
  },
  {
    chave: "off_by_one",
    aterrada: false,
    descricao: "erra a contagem por um, pulando ou repetindo um item",
    feedback: () =>
      "Você chegou pertinho! Faça a contagem mais uma vez, devagar — é muito fácil pular ou contar um item duas vezes.",
  },
  {
    chave: "subtracao_dos_operandos",
    aterrada: true,
    descricao: "subtrai dois números do enunciado quando o passo não pede subtração",
    feedback: () =>
      "Parece que você subtraiu dois números do enunciado. Confira se é uma subtração que este passo está pedindo.",
  },
  {
    chave: "soma_dos_operandos",
    aterrada: true,
    descricao: "soma dois números do enunciado quando o passo não pede soma",
    feedback: () =>
      "Parece que você juntou dois números do enunciado. Confira se este passo pede para somar.",
  },
  {
    chave: "divisao_dos_operandos",
    aterrada: true,
    descricao: "divide um número do enunciado pelo outro quando o passo não pede divisão",
    feedback: () =>
      "Parece que você dividiu um número pelo outro. Confira se é isso que este passo pede.",
  },
  {
    chave: "dobro_do_gabarito",
    aterrada: false,
    descricao: "conta cada item duas vezes",
    feedback: () =>
      "Parece que cada item foi contado duas vezes. Refaça marcando um de cada vez para não repetir.",
  },
  {
    chave: "produto_dos_operandos",
    aterrada: true,
    descricao: "multiplica dois números do enunciado quando o passo não pede multiplicação",
    feedback: () =>
      "Parece que você multiplicou dois números do enunciado. Confira se este passo pede uma multiplicação.",
  },
  {
    chave: "resposta_final_do_problema",
    aterrada: true,
    descricao: "responde com a solução do problema inteiro em vez da do passo atual",
    feedback: () =>
      "Essa é a resposta do problema todo — mas aqui ainda estamos numa etapa do caminho. O que ESTE passo pergunta?",
  },
];

const PORTA_DE_REGRA = new Map(REGRAS.map((r) => [r.chave, r]));

/**
 * Gera respostas erradas CALCULADAS para um passo, ordenadas por poder
 * explicativo. Não emite nada quando não há dado numérico — melhor devolver
 * vazio do que inventar.
 *
 * @param {object} step     passo do tutor (instruction, expectedAnswer)
 * @param {object} problem  problema (statement, steps) — opcional
 * @param {object} opts     {limite = 3, maxPorRegra = 4}
 * @returns {Array<{value,valor,regra,misconceptionId,misconceptionType,buggyRule,description,feedback}>}
 */
export function buggyAnswerCandidates(step, problem = {}, opts = {}) {
  const limite = Number.isFinite(opts.limite) ? opts.limite : 3;
  const maxPorRegra = Number.isFinite(opts.maxPorRegra) ? opts.maxPorRegra : 4;
  const somenteAterradas = opts.somenteAterradas === true;
  const gabaritoBruto = step?.expectedAnswer;
  const alvo = escalar(gabaritoBruto);
  if (alvo === null) return [];

  const doPasso = numerosDe(step?.instruction);
  const doProblema = numerosDe(problem?.statement);
  const operandos = [...new Set([...doPasso, ...doProblema])];
  const finalDoProblema = escalar((problem?.steps || []).at(-1)?.expectedAnswer);

  const saida = [];
  const vistos = new Set([alvo]);
  const porRegra = {};

  const propor = (valor, chave, buggyRule) => {
    if (saida.length >= limite) return;
    if (!representavel(valor) || vistos.has(valor)) return;
    if ((porRegra[chave] || 0) >= maxPorRegra) return;
    const regra = PORTA_DE_REGRA.get(chave);
    if (somenteAterradas && !regra.aterrada) return;
    const texto = formatar(valor, gabaritoBruto);
    vistos.add(valor);
    porRegra[chave] = (porRegra[chave] || 0) + 1;
    saida.push({
      value: texto,
      valor,
      regra: chave,
      misconceptionId: idDaRegra(chave, texto),
      misconceptionType: chave === "off_by_one" ? "off_by_one" : "procedural_error",
      // A buggyRule é MECÂNICA e traz os números de verdade: outra pessoa (ou um
      // programa) consegue refazer a conta. É o contrato que o agent3b declara
      // no prompt e que nunca foi verificado por ninguém.
      buggyRule,
      description: regra.descricao,
      feedback: regra.feedback(texto),
      source: "regra_falsa_aterrada",
    });
  };

  // A ordem abaixo é a ordem medida. Não reordene sem re-medir.
  for (const n of doPasso)
    propor(n, "numero_do_passo", `responder com o ${n}, que já aparece no enunciado do passo`);

  for (const n of doProblema)
    propor(n, "numero_do_problema", `responder com o ${n}, que aparece na história do problema`);

  propor(alvo + 1, "off_by_one", "contar um item a mais que o correto");
  propor(alvo - 1, "off_by_one", "contar um item a menos que o correto");

  for (let i = 0; i < operandos.length; i++) {
    for (let j = 0; j < operandos.length; j++) {
      if (i === j) continue;
      propor(
        operandos[i] - operandos[j],
        "subtracao_dos_operandos",
        `calcular ${operandos[i]} - ${operandos[j]}`
      );
    }
  }

  for (let i = 0; i < operandos.length; i++) {
    for (let j = i + 1; j < operandos.length; j++) {
      propor(
        operandos[i] + operandos[j],
        "soma_dos_operandos",
        `calcular ${operandos[i]} + ${operandos[j]}`
      );
    }
  }

  for (let i = 0; i < operandos.length; i++) {
    for (let j = 0; j < operandos.length; j++) {
      if (i === j || operandos[j] === 0) continue;
      propor(
        operandos[i] / operandos[j],
        "divisao_dos_operandos",
        `calcular ${operandos[i]} / ${operandos[j]}`
      );
    }
  }

  propor(alvo * 2, "dobro_do_gabarito", "contar cada item duas vezes");

  for (let i = 0; i < operandos.length; i++) {
    for (let j = i + 1; j < operandos.length; j++) {
      propor(
        operandos[i] * operandos[j],
        "produto_dos_operandos",
        `calcular ${operandos[i]} x ${operandos[j]}`
      );
    }
  }

  if (finalDoProblema !== null) {
    propor(
      finalDoProblema,
      "resposta_final_do_problema",
      "responder com a solução do problema inteiro"
    );
  }

  return saida;
}

/** Só os valores, para quem só quer preencher distratores. */
export function buggyDistractorValues(step, problem, opts) {
  return buggyAnswerCandidates(step, problem, opts).map((c) => c.value);
}

/** Teto do varredor de aterramento. Alto de propósito: aqui a pergunta não é
 *  "o que eu proporia?" e sim "isso é derivável dos dados por ALGUMA regra?". */
const LIMITE_DE_VARREDURA = 80;

/**
 * A resposta errada declarada pelo agente tem FORMA DE ERRO DE ALUNO?
 *
 * 2026-08-09: esta é a parte verificável do contrato que o prompt do agent3b
 * sempre exigiu e que nada checava — "a buggyRule tem que ser uma receita
 * mecânica que outra pessoa (ou um programa) consegue calcular". Executar texto
 * livre é inviável; perguntar se o VALOR declarado é alcançável por alguma
 * regra conhecida é viável e mede a mesma coisa que interessa.
 *
 * ATENÇÃO à diferença entre esta pergunta e a do enriquecimento. São duas:
 *
 *   - "esta resposta merece diagnóstico PRÓPRIO no grafo?" → só regra ATERRADA
 *     nos dados (`somenteAterradas`), porque vizinho numérico com feedback
 *     genérico não é diagnóstico (ver behavior-misconception-preservation).
 *   - "esta resposta é PLAUSÍVEL como erro de aluno?" → catálogo INTEIRO, aqui.
 *     Medido no corpus: "Começando no 5, conte mais 3 passos" com resposta 7 é
 *     off-by-one, que numericamente sai do gabarito mas é exatamente o erro que
 *     a criança comete contando. Cobrar aterramento estrito nesses casos encheria
 *     o gate de aviso falso — e aviso falso é aviso ignorado.
 *
 * O que este medidor procura é o terceiro caso: número que não é nem derivável
 * dos dados nem forma conhecida de erro. Esse é invenção.
 *
 * Devolve `null` (fora de escopo, não conta em métrica) quando o passo ou a
 * resposta não são escalares, ou quando não há número nenhum de onde derivar.
 *
 * @returns {boolean|null}
 */
export function isGroundedWrongAnswer(step, problem, valor) {
  if (escalar(step?.expectedAnswer) === null) return null;
  const alvo = escalar(valor);
  if (alvo === null) return null;
  // 2026-08-09: só é justo cobrar aterramento de quem TINHA de onde derivar.
  // Medido no corpus: "Divida CAVALO em sílabas. Quantas sílabas?" não traz
  // número nenhum, e ali errar por um é o erro CERTO — não perturbação
  // preguiçosa. Cobrar isso encheria o gate de aviso falso, e aviso falso é
  // aviso ignorado.
  if (numerosDe(step?.instruction).length + numerosDe(problem?.statement).length === 0) return null;
  const candidatos = buggyAnswerCandidates(step, problem, {
    limite: LIMITE_DE_VARREDURA,
    maxPorRegra: 24,
  });
  return candidatos.some((c) => Math.abs(c.valor - alvo) < 1e-9);
}

/** Chave de casamento do runtime, para não propor o que o passo já cobre. */
function chaveDeResposta(valor) {
  return String(valor ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

/** Superfícies em que o aluno SÓ consegue emitir o que está na tela. */
const SELECAO_PASSIVA = new Set([
  "multiple_choice",
  "true_false",
  "image_choice",
  "true_false_lab",
]);

/** Quantos diagnósticos deste tutor foram escritos pelos AGENTES (não pela
 *  máquina). É a base do orçamento: a rede de segurança cresce com o que o
 *  gerador produziu, nunca no lugar dele. */
function contarDiagnosticosAutorais(tutor) {
  let total = 0;
  for (const problema of tutor?.problems || []) {
    for (const passo of problema?.steps || []) {
      for (const m of passo?.behaviorMisconceptions || []) {
        if (String(m?.source ?? "") !== "regra_falsa_aterrada") total++;
      }
      for (const o of passo?.options || []) {
        if (o?.misconceptionId && o.isCorrect !== true) total++;
      }
    }
  }
  return total;
}

/**
 * Completa `step.behaviorMisconceptions` com regras falsas calculadas.
 *
 * Três restrições que não são negociáveis, cada uma custou uma medição:
 *
 *  1. SÓ superfície aberta. Em interface enumerada o aluno só emite o que está
 *     na tela; um diagnóstico cuja resposta não é opção vira rota morta, e o
 *     compilador semântico o descarta de propósito (ver `sourceMisconceptions`).
 *     Para cobrir enumeradas seria preciso mexer nas alternativas — mudança de
 *     interface, que não cabe num gate de integridade.
 *  2. SÓ gabarito escalar. Sem número, o motor não tem de onde derivar.
 *  3. TETO por passo. Cada misconception vira um nó de scaffold; encher um
 *     passo com dez rotas incha o artefato sem ganho pedagógico.
 *
 * Não mexe em gabarito, enunciado, alternativas nem no caminho correto —
 * só ACRESCENTA rota de erro, igual à colheita.
 *
 * @returns {string[]} descrições dos reparos, para o log do gate
 */
export function enrichStepsWithBuggyRules(tutor, opts = {}) {
  const limitePorPasso = Number.isFinite(opts.limitePorPasso) ? opts.limitePorPasso : 3;
  const tetoDeclarado = Number.isFinite(opts.tetoDeclarado) ? opts.tetoDeclarado : 4;
  const fracaoDoAutoral = Number.isFinite(opts.fracaoDoAutoral) ? opts.fracaoDoAutoral : 0.5;
  const reparos = [];

  // 2026-08-09: ORÇAMENTO GLOBAL, proporcional ao que os agentes escreveram.
  //
  // O quality-gate reprova o STI quando a proporção de distrator sintético
  // passa de 40% da superfície diagnóstica. Isso é deliberado e está certo: um
  // tutor cujo tratamento de erro é majoritariamente máquina não deve ser
  // publicado — ele deve ser REGERADO. A rede de segurança não pode salvar uma
  // geração ruim, senão o gate perde a capacidade de reprovar.
  //
  // Consequência aceita: passo sem nenhum diagnóstico autoral não é socorrido
  // aqui. O caminho certo para ele é o retry do gerador, não o remendo.
  let orcamento = Math.floor(contarDiagnosticosAutorais(tutor) * fracaoDoAutoral);
  if (orcamento <= 0) return reparos;

  // 2026-08-09: o orçamento é gasto por NECESSIDADE, não por ordem de array.
  // Na primeira versão ele ia embora nos primeiros passos do primeiro problema,
  // que não são necessariamente os que estão descobertos. Ordenar por cobertura
  // crescente concentra as mesmas rotas onde o aluno hoje recebe genérico.
  const elegiveis = [];
  for (const problema of tutor?.problems || []) {
    for (const passo of problema?.steps || []) {
      if (SELECAO_PASSIVA.has(String(passo?.renderAs ?? "").trim())) continue;
      if (escalar(passo?.expectedAnswer) === null) continue;
      elegiveis.push({ problema, passo });
    }
  }
  const cobertura = ({ passo }) =>
    (passo.behaviorMisconceptions || []).length +
    (passo.options || []).filter((o) => o?.misconceptionId && o.isCorrect !== true).length;
  elegiveis.sort((a, b) => cobertura(a) - cobertura(b));

  {
    for (const { problema, passo } of elegiveis) {
      const declaradas = new Set();
      const idsUsados = new Set();
      for (const m of passo.behaviorMisconceptions || []) {
        declaradas.add(chaveDeResposta(m?.wrongAnswer));
        idsUsados.add(String(m?.misconceptionId ?? m?.id ?? "").trim());
      }
      for (const o of passo.options || []) {
        if (o?.misconceptionId && o.isCorrect !== true) {
          declaradas.add(chaveDeResposta(o.value ?? o.label));
          idsUsados.add(String(o.misconceptionId).trim());
        }
      }
      declaradas.delete("");
      if (declaradas.size >= tetoDeclarado) continue;

      const vagas = Math.min(limitePorPasso, tetoDeclarado - declaradas.size, orcamento);
      if (vagas <= 0) break;
      // Pede folga ao motor porque parte dos candidatos vai colidir com o que o
      // passo já declara — e o que já está declarado veio do LLM, que teve a
      // primeira palavra de propósito.
      const candidatos = buggyAnswerCandidates(passo, problema, {
        limite: vagas + 4,
        somenteAterradas: true,
      })
        .filter(
          (c) => !declaradas.has(chaveDeResposta(c.value)) && !idsUsados.has(c.misconceptionId)
        )
        .slice(0, vagas);
      if (!candidatos.length) continue;

      passo.behaviorMisconceptions = [
        ...(passo.behaviorMisconceptions || []),
        ...candidatos.map((c) => ({
          id: c.misconceptionId,
          misconceptionId: c.misconceptionId,
          type: c.misconceptionType,
          misconceptionType: c.misconceptionType,
          wrongAnswer: c.value,
          matcher: "exact",
          feedback: c.feedback,
          description: c.description,
          buggyRule: c.buggyRule,
          severity: "moderate",
          source: c.source,
        })),
      ];
      orcamento -= candidatos.length;
      reparos.push(
        `P${problema.id ?? "?"}/${passo.id}: ${candidatos.length} regra(s) falsa(s) aterrada(s) — ${candidatos
          .map((c) => `${c.regra}="${c.value}"`)
          .join(", ")}`
      );
    }
  }

  return reparos;
}

export const REGRAS_FALSAS = REGRAS;
