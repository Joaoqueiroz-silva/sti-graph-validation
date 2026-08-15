/**
 * agent6-catalogo-renderas.js — o catálogo de componentes que o Agente 6 lê.
 *
 * 2026-08-05 (Alavanca 2). Antes disto o catálogo era um bloco de texto fixo
 * dentro de `agent6-story.js`, com três problemas medidos:
 *
 *  1. TODAS as seções iam para TODA disciplina. O texto já vinha organizado por
 *     matéria ("MATEMATICA — visuais ricos", "LINGUAS / PORTUGUES"), mas um STI
 *     de Artes recebia a lista inteira, incluindo parabola_plotter e abacus.
 *  2. Oferecia DOIS componentes que não existem: `map_outline` e
 *     `memory_game_lab`. Escolher um deles é pior que escolher errado — o
 *     validador de contrato devolve "renderAs não está no registry (legacy)" e
 *     deixa passar sem checar NADA, então o passo chega quebrado na tela.
 *  3. Nunca oferecia 13 componentes que existem — entre eles `long_division`
 *     (numa geração de divisão!), `decimal_grid`, `area_model_fraction`,
 *     `fraction_input` e `moon_phases`.
 *
 * Gerar a partir do registro resolve os três de uma vez: só id real entra, e
 * nenhum componente fica órfão. O teste-sentinela garante que continue assim.
 *
 * O QUE FOI PRESERVADO: as descrições pedagógicas escritas à mão (ex.: "USE
 * SEMPRE que KC mencionar fracao, mesmo que expectedAnswer seja numerico") são
 * melhores que as `description` técnicas do registro e valem mais que a
 * consistência — elas vieram de auditoria de geração real. Ficam aqui, verbatim.
 */

import { serveDisciplina } from "../component-registry/component-disciplines.js";
import { detectDisciplineArea } from "../discipline-config.js";
import { loadRegistry } from "../component-registry/index.js";

/**
 * Componentes que o sistema usa mas o Agente 6 NÃO deve escolher.
 *
 * - dynamic_spec: é o DESTINO da recuperação genérica. Oferecê-lo como opção
 *   convida o agente a pedir cena genérica em vez de componente específico —
 *   exatamente o achatamento de modalidade que já derrubou gerações.
 * - drag_order: duplicata legada de drag_to_order. Duas ordenações no catálogo
 *   só criam chance de escolher a versão sem contrato moderno.
 */
export const NAO_OFERECER = new Set(["dynamic_spec", "drag_order"]);

// Títulos por FUNÇÃO, não por matéria. Depois do filtro o rótulo de disciplina
// vira mentira: num STI de Artes o `hot_spot` aparecia sob o cabeçalho
// "CIENCIAS / BIOLOGIA / FISICA", sugerindo ao modelo que a opção é de outra
// matéria. O que o agente precisa saber é o que o componente FAZ.
const GRUPOS = [
  {
    chave: "matematica",
    titulo:
      "QUANTIDADE E GRANDEZA — visuais ricos (PREFIRA ESTES quando o KC envolve fracao/numero/geometria)",
  },
  {
    chave: "ciencias",
    titulo: "DIAGRAMAS E ROTULAGEM (partes de uma figura, areas de uma imagem)",
  },
  { chave: "linguas", titulo: "TEXTO E LINGUAGEM" },
  { chave: "humanas", titulo: "SEQUENCIA E CRONOLOGIA" },
  { chave: "organizacao", titulo: "CLASSIFICAR, PAREAR E ORGANIZAR" },
  { chave: "fallback", titulo: "FALLBACKS (usar SO se nada acima casar)" },
];

/**
 * id → { grupo, linha }. `linha` é a descrição que vai no prompt, sem o id
 * (ele é emitido em volta, alinhado).
 */
export const CATALOGO = {
  // --- MATEMATICA ---------------------------------------------------------
  fraction_bar: {
    grupo: "matematica",
    linha:
      'fracao visual (numerador/denominador, MMC, equivalencia, simplificacao, soma de fracoes). USE SEMPRE que KC mencionar fracao, mesmo que expectedAnswer seja numerico ("12", "3").',
  },
  area_model_fraction: {
    grupo: "matematica",
    linha: "multiplicacao de fracoes por area — aluno pinta a intersecao das duas fracoes.",
  },
  fraction_input: {
    grupo: "matematica",
    linha: "aluno digita numerador e denominador de uma fracao simples.",
  },
  number_line: {
    grupo: "matematica",
    linha: "reta numerica (ordenacao, comparacao, intervalos, distancia entre numeros).",
  },
  numeric_keypad: {
    grupo: "matematica",
    linha: "input numerico puro (apenas quando NAO houver contexto visual aplicavel).",
  },
  abacus: { grupo: "matematica", linha: "valor posicional, dezenas/centenas/milhares." },
  place_value_blocks: {
    grupo: "matematica",
    linha: "decomposicao em unidades/dezenas/centenas.",
  },
  decimal_grid: {
    grupo: "matematica",
    linha: "grade para alinhar algarismos em operacoes com decimais.",
  },
  long_division: {
    grupo: "matematica",
    linha: "divisao armada: mostra dividendo/divisor e o aluno digita o quociente.",
  },
  clock_face: { grupo: "matematica", linha: "horas, minutos, intervalos de tempo (HH:MM)." },
  coordinate_plane: {
    grupo: "matematica",
    linha: "pontos, vetores, retas no plano cartesiano.",
  },
  balance_scale: {
    grupo: "matematica",
    linha: "equacoes em equilibrio (x + 5 = 10 visualizado).",
  },
  parabola_plotter: { grupo: "matematica", linha: "funcoes quadraticas, vertice, raizes." },
  geometry_shape: {
    grupo: "matematica",
    linha: "classificacao de figuras, lados, vertices, area.",
  },
  vector_diagram: { grupo: "matematica", linha: "vetores, soma vetorial, decomposicao." },
  venn_diagram: {
    grupo: "matematica",
    linha: "intersecoes, uniao, complementar (probabilidade, conjuntos).",
  },
  equation_builder: {
    grupo: "matematica",
    linha: 'aluno MONTA a equacao arrastando tokens (KC "construa", "monte").',
  },
  composition: {
    grupo: "matematica",
    linha: "combina 1-4 componentes visuais de matematica com um input unico.",
  },

  // --- CIENCIAS -----------------------------------------------------------
  cell_diagram: { grupo: "ciencias", linha: "estruturas celulares, organelas (rotular partes)." },
  diagram_labeler: {
    grupo: "ciencias",
    linha: "rotular partes de uma figura (anatomia, plantas, circuitos).",
  },
  moon_phases: {
    grupo: "ciencias",
    linha: "simulador Sol/Terra/Lua — aluno seleciona a fase observada da Terra.",
  },
  hot_spot: {
    grupo: "ciencias",
    linha: "clicar em area especifica de imagem (geografia, mapa, anatomia).",
  },

  // --- LINGUAS ------------------------------------------------------------
  highlight_in_text: {
    grupo: "linguas",
    linha: "destacar palavra/trecho (sujeito, verbo, predicado).",
  },
  word_matcher: {
    grupo: "linguas",
    linha: "ligar palavras correlatas (sinonimo, antonimo, traducao).",
  },
  sentence_builder: {
    grupo: "linguas",
    linha: "arrastar palavras pra formar frase (sintaxe).",
  },
  cloze_test: { grupo: "linguas", linha: "preencher lacunas em paragrafo (typed-text)." },

  // --- HUMANAS ------------------------------------------------------------
  timeline_constructor: { grupo: "humanas", linha: "ordenar eventos em linha do tempo." },
  image_sequence: { grupo: "humanas", linha: "ordenar imagens (ciclo, processo, fases)." },

  // --- ORGANIZACAO --------------------------------------------------------
  card_sort: { grupo: "organizacao", linha: "arrastar cards em categorias." },
  card_sort_lab: {
    grupo: "organizacao",
    linha: "classificacao visual: arrastar N items entre 2-6 categorias coloridas.",
  },
  drag_to_order: { grupo: "organizacao", linha: "ordenar itens em sequencia." },
  matching_pairs: { grupo: "organizacao", linha: "conectar pares em duas colunas." },
  concept_map: { grupo: "organizacao", linha: "construir mapa conceitual ligando conceitos." },
  memory_game: { grupo: "organizacao", linha: "pareamento 1:1 entre 3-8 pares, virando cards." },
  table: { grupo: "organizacao", linha: "tabela com 1-8 celulas editaveis (dados, comparacao)." },

  // --- FALLBACKS ----------------------------------------------------------
  multiple_choice: {
    grupo: "fallback",
    linha: "V/F, definicoes binarias, escolha entre 4 alternativas claras.",
  },
  image_choice: { grupo: "fallback", linha: "escolha entre 4 imagens (pre_literate)." },
  true_false: { grupo: "fallback", linha: "verdadeiro/falso simples." },
  true_false_lab: { grupo: "fallback", linha: "verdadeiro/falso com justificativa." },
  dropdown: { grupo: "fallback", linha: "escolher uma resposta entre alternativas textuais." },
  fill_blanks: { grupo: "fallback", linha: "completar lacuna curta." },
  text: { grupo: "fallback", linha: "resposta livre quando outras opcoes nao se aplicam." },
};

/**
 * buildCatalogoRenderAs — monta o bloco do prompt, filtrado pela disciplina.
 *
 * O grupo FALLBACK entra sempre: são os primitivos universais, e uma matéria
 * sem rota de fallback é pior que uma matéria com catálogo grande demais.
 */
export function buildCatalogoRenderAs(discipline) {
  // Interruptor de emergencia: STI_CATALOGO_SEM_FILTRO=1 devolve o catalogo
  // inteiro para qualquer disciplina. Serve para (a) isolar o filtro numa
  // investigacao — mesma geracao, so o catalogo muda — e (b) desligar em
  // producao sem redeploy de codigo se ele algum dia se mostrar nocivo.
  const semFiltro = process.env.STI_CATALOGO_SEM_FILTRO === "1";
  const area = semFiltro ? "geral" : detectDisciplineArea(discipline || "");
  const linhas = ["CATALOGO DE renderAs (escolha o que melhor casa com o step):", ""];

  for (const grupo of GRUPOS) {
    const doGrupo = Object.entries(CATALOGO)
      .filter(([id, def]) => def.grupo === grupo.chave)
      .filter(([id]) => grupo.chave === "fallback" || serveDisciplina(id, area));
    if (doGrupo.length === 0) continue;

    linhas.push(`${grupo.titulo}:`);
    const larguraId = Math.max(...doGrupo.map(([id]) => id.length + 2));
    for (const [id, def] of doGrupo) {
      linhas.push(`- ${`"${id}"`.padEnd(larguraId)} → ${def.linha}`);
    }
    linhas.push("");
  }

  return linhas.join("\n").trimEnd();
}

/**
 * idsOferecidos — quais componentes o Agente 6 pode escolher nesta disciplina.
 * Existe para o teste-sentinela e para diagnóstico.
 */
export function idsOferecidos(discipline) {
  const area =
    process.env.STI_CATALOGO_SEM_FILTRO === "1" ? "geral" : detectDisciplineArea(discipline || "");
  return Object.entries(CATALOGO)
    .filter(([id, def]) => def.grupo === "fallback" || serveDisciplina(id, area))
    .map(([id]) => id);
}

/**
 * auditarCatalogo — confronta o catálogo com o registro real.
 * Usado pelo teste-sentinela; devolve fantasmas e órfãos.
 */
export async function auditarCatalogo() {
  const registry = await loadRegistry();
  const idsRegistro = new Set(Object.keys(registry));
  const idsCatalogo = new Set(Object.keys(CATALOGO));
  return {
    // No catálogo mas não no registro: o agente escolheria algo que não existe.
    fantasmas: [...idsCatalogo].filter((id) => !idsRegistro.has(id)),
    // No registro, não deliberadamente excluído, e nunca oferecido.
    orfaos: [...idsRegistro].filter((id) => !idsCatalogo.has(id) && !NAO_OFERECER.has(id)),
  };
}

/**
 * Estágios da progressão CRA (Bruner/NCTM) por grupo do catálogo.
 * CONCRETE = manipular objeto; REPRESENTATIONAL = conectar visual e símbolo;
 * ABSTRACT = operar só com símbolo.
 */
const ESTAGIO_CRA = {
  concreto: ["matematica", "ciencias"],
  representacional: ["organizacao", "humanas", "linguas"],
};
const ABSTRATOS = ["numeric_keypad", "equation_builder", "text", "fill_blanks", "dropdown"];

/**
 * buildRegrasDeComponente — as regras do prompt que CITAM componente por nome.
 *
 * 2026-08-05: com o catálogo filtrado, estas regras viraram risco de
 * contradição. O bloco CRA mandava "use fraction_bar, abacus, number_line no
 * step 1" — num STI de Artes, nenhum deles está no catálogo, ou seja, o prompt
 * mandava usar o que ele mesmo não oferecia. Agora os exemplos saem do conjunto
 * REALMENTE oferecido, e as duas regras críticas só aparecem quando o
 * componente que elas exigem existe para a disciplina.
 */
export function buildRegrasDeComponente(discipline) {
  const area = detectDisciplineArea(discipline || "");
  const oferecidos = new Set(idsOferecidos(discipline));
  const doEstagio = (grupos) =>
    Object.entries(CATALOGO)
      .filter(([id, def]) => grupos.includes(def.grupo) && oferecidos.has(id))
      .map(([id]) => id);

  const partes = [];

  if (oferecidos.has("fraction_bar")) {
    partes.push(
      'REGRA CRITICA PARA FRACOES:\nSe o topico/KC envolve fracao (soma, equivalencia, simplificacao, conversao), USE "fraction_bar" em TODOS os steps, mesmo que a resposta intermediaria seja numerica (MMC=12, novo numerador=3). O aluno PRECISA visualizar a fracao em cada etapa pra construir intuicao.'
    );
  }
  if (oferecidos.has("equation_builder")) {
    partes.push(
      'REGRA CRITICA PARA EQUACOES:\nSe o KC envolve "montar", "construir", "escrever" equacao/expressao, USE "equation_builder" (drag-build), nao multiple_choice.'
    );
  }

  const concretos = doEstagio(ESTAGIO_CRA.concreto);
  const representacionais = doEstagio(ESTAGIO_CRA.representacional);
  const abstratos = ABSTRATOS.filter((id) => oferecidos.has(id));
  const lista = (ids) => ids.slice(0, 5).join(", ");

  if (concretos.length && representacionais.length) {
    partes.push(
      [
        "🪜 CRA PROGRESSION OBRIGATORIA (Bruner / NCTM):",
        "Em problemas com 3+ steps, organize-os em progressao CONCRETE-REPRESENTATIONAL-ABSTRACT:",
        `- Step 1 (CONCRETE): use componente VISUAL/manipulativo (${lista(concretos)}) - aluno ve/manipula objeto`,
        `- Step 2 (REPRESENTATIONAL): use diagrama/organizacao (${lista(representacionais)}) - aluno conecta visual com simbolico`,
        `- Step 3+ (ABSTRACT): use simbolico puro (${lista(abstratos)}) - aluno opera com simbolos`,
        "Quando aluno passa por CRA, o conceito fica MAIS DURADOURO (Bruner 1966; National Math Panel 2008).",
      ].join("\n")
    );
  }

  return partes.join("\n\n");
}
