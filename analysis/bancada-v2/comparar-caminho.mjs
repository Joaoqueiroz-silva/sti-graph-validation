/**
 * analysis/bancada-v2/comparar-caminho.mjs — COMPARAÇÃO POR ESTADO/CAMINHO
 * (rodada 3, 2026-08-15; instruções do orientador).
 *
 * Substitui a leitura por índice de passo (e a tolerância ±20% de posição
 * relativa) por uma leitura estrutural: o caminho de referência do
 * especialista é um SUBCAMINHO do grafo do agente? Cada elemento (estado,
 * erro, dica) está no ESTADO certo? Match binário, sem tolerância.
 *
 * O QUE É "ESTADO": no CTAT o estado de um passo é identificado pela resposta
 * correta daquele passo (steps[].key = answer canonizada; quando o passo não
 * tem resposta, o nome do componente). No grafo do agente, o estado é o passo
 * cuja resposta esperada (grafo.passos[].valor) canoniza para o mesmo valor.
 * A comparação é de VALORES DE ESTADO, nunca de semântica de ação/texto.
 *
 * MÉTRICAS (todas por registro; agregadas por exercício e por grafo):
 *  - coberturaEstados: estados da referência encontrados no grafo do agente NA
 *    MESMA ORDEM (subsequência ordenada; extras entre eles são permitidos);
 *  - caminhoIntegro: 1 se TODOS os estados da referência estão presentes em
 *    ordem (o caminho de referência é subcaminho do grafo do agente);
 *  - errosNoEstadoCerto: erros do especialista cujo valor aparece no grafo do
 *    agente ANCORADO no mesmo estado (o passo do erro casa com o estado casado);
 *  - dicasNoEstadoCerto: estados do especialista que têm dica E cujo estado
 *    casado no agente também tem dica (presença por estado; texto NUNCA é
 *    comparado — item 7);
 *  - extras por tipo: estados a mais, erros a mais, dicas a mais (contagens e
 *    proporções) — o material para o juízo de valor dos extras (item 6);
 *  - canonização SÓ em valores (canonAnswer: 0.2 ≡ 1/5 ≡ 2/10). Dicas e
 *    descrições são texto livre e ficam fora de qualquer canonização.
 *
 * AGREGAÇÃO (item 9): a unidade de instância é o GRAFO gerado (registro); os
 * intervalos por exercício continuam por bootstrap BCa em cluster; o desvio
 * padrão ENTRE RÉPLICAS do mesmo exercício é reportado (item 8).
 *
 * A tolerância ±20% da bancada v2 NÃO é apagada: continua disponível em
 * comparar-justo.mjs como leitura descritiva; aqui a métrica primária é o
 * match binário por estado.
 */

import fs from "node:fs";
import path from "node:path";
import { carregarReferencia, intervalo, media, fmt, canonAnswer, ehMecanico } from "../validacao-v2/lib.mjs";

import { problemsDirRelativo } from "../../dataset-config.js";
// resolvido em tempo de chamada (multi-corpus no mesmo processo)
const DATASET = () => problemsDirRelativo();

/** canonização de VALORES gerados pelos agentes (nunca de texto livre). */
export const canonizarValor = (v) => canonAnswer(String(v ?? "").trim());

/**
 * MATERIALIZAÇÃO MÍNIMA do rótulo de estado (2026-08-15, declarada):
 * no estágio graphforge, o agente 3a de produção rotula estados com o
 * vocabulário do prompt ("Denominador = {5}", "Posição marcada em {3/5}",
 * "Numerador = {A}") — na plataforma, a materialização troca placeholders
 * pelos números do problema. Aqui NÃO inventamos nada: extraímos o valor
 * numérico/fração que o PRÓPRIO agente escreveu no rótulo. Regras, na ordem:
 *   1. valor já concreto (número ou fração) → ele mesmo;
 *   2. placeholder com número dentro ({5}, {3/5}) → o conteúdo do placeholder;
 *   3. rótulo com um único número/fração no texto → esse número;
 *   4. senão → "" (não casável; contado como estado sem valor concreto).
 * O modo é opcional (--materializar) e o relatório declara a taxa de
 * recuperação; a comparação com rótulos crus continua sendo a de referência
 * para o estágio graphforge.
 */
const RE_CONCRETO = /^\s*-?\d+(?:[.,]\d+)?(?:\s*\/\s*-?\d+)?\s*$/;
export function materializarRotulo(v) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if (RE_CONCRETO.test(s)) return s;
  const dentro = [...s.matchAll(/\{\s*(-?\d+(?:[.,]\d+)?(?:\s*\/\s*-?\d+)?)\s*\}/g)].map((m) => m[1]);
  if (dentro.length === 1) return dentro[0];
  if (dentro.length > 1) return ""; // ambíguo: não escolhemos
  const soltos = [...s.replace(/\{[^}]*\}/g, " ").matchAll(/-?\d+(?:[.,]\d+)?(?:\s*\/\s*-?\d+)?/g)].map((m) => m[0]);
  const unicos = [...new Set(soltos.map((x) => x.replace(/\s+/g, "")))];
  return unicos.length === 1 ? unicos[0] : "";
}

/**
 * Caminho de referência do especialista: sequência de estados (valor
 * canonizado) do envelope B. Estados cuja "resposta" é SENTINELA de interface
 * do CTAT (ehMecanico: "", "-", "-1" — o SetVisible sem entrada e o clique em
 * Done, que o CTAT registra como input "-1") NÃO são estados de valor: ficam
 * fora do denominador da cobertura, exatamente como os erros mecânicos já
 * ficam fora dos itens de erro (regra congelada em lib.mjs). Corrigido em
 * 2026-08-15 (tarde): antes o "-1" do Done contava como estado de valor e era
 * incasável por construção (nos 24 problemas é o último estado) — teto
 * artificial de 6/7 na cobertura e caminho íntegro impossível.
 */
export function caminhoDeReferencia(envelopeB, refEx = null) {
  // 2026-08-16 (multi-corpus): quando a referência traz o caminho lido do
  // .brd com SAI (lib.mjs carregarReferencia → caminho), usa-se ELE: estado de
  // valor = ação de ALUNO (não de sistema: setDisplay, set_maximum, No_Action…)
  // com entrada não mecânica. O envelope B (sem ação) fica como fallback.
  if (refEx && Array.isArray(refEx.caminho) && refEx.caminho.length) {
    return refEx.caminho.map((c) => ({
      ordem: c.ordem,
      estado: c.valor,
      comResposta: !c.mecanico && !c.sistema,
      dicas: c.dicas || 0,
    }));
  }
  const steps = (envelopeB?.steps || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return steps.map((s, i) => ({
    ordem: i + 1,
    estado: canonizarValor(s.key ?? s.answer),
    comResposta: !ehMecanico(s.answer),
    dicas: (envelopeB?.hintsPerCorrectStep?.[i] || []).length,
  }));
}

/**
 * Casa a sequência de estados da referência com os passos do agente como
 * SUBSEQUÊNCIA ORDENADA: extras do agente no meio são permitidos; a ordem da
 * referência é obrigatória. O casamento é o MÁXIMO possível (subsequência
 * comum mais longa, LCS, por programação dinâmica) — 2026-08-15 (tarde):
 * substitui o guloso esquerda→direita, que sub-contava (ex.: referência
 * [3/5, 1, 3, 5, 5, 3/5], agente [5, 5, 3, 3/5, 3/5]: guloso casa 2, o
 * máximo em ordem é 3). Determinístico: na reconstrução, sempre que casar o
 * estado corrente é compatível com o máximo, ele é casado ali (o mais à
 * esquerda possível).
 * Estados da referência SEM resposta (key = nome de componente) não são
 * casáveis por valor e ficam fora do denominador (declarado).
 */
export function casarEstados(refCaminho, passosAgente, { materializar = false } = {}) {
  const agente = passosAgente.map((p, i) => ({
    idx: i,
    estado: canonizarValor(materializar ? materializarRotulo(p.valor) : p.valor),
  }));
  const avaliaveis = refCaminho.filter((r) => r.comResposta && r.estado);
  const n = avaliaveis.length;
  const k = agente.length;
  // dp[i][j] = tamanho da maior subsequência comum entre avaliaveis[i..] e agente[j..]
  const dp = Array.from({ length: n + 1 }, () => new Array(k + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = k - 1; j >= 0; j--) {
      const igual = agente[j].estado && agente[j].estado === avaliaveis[i].estado;
      dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1], igual ? dp[i + 1][j + 1] + 1 : 0);
    }
  }
  // reconstrução: para cada estado da referência, o passo mais à esquerda que preserva o máximo
  const casadoEm = new Map(); // ordem da referência → idx do agente
  let i = 0;
  let j = 0;
  while (i < n && j < k) {
    const igual = agente[j].estado && agente[j].estado === avaliaveis[i].estado;
    if (igual && dp[i][j] === dp[i + 1][j + 1] + 1) {
      casadoEm.set(avaliaveis[i].ordem, j);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return refCaminho.map((r) => {
    if (!r.comResposta || !r.estado) return { ref: r, agenteIdx: null, avaliavel: false };
    const idx = casadoEm.has(r.ordem) ? casadoEm.get(r.ordem) : null;
    return { ref: r, agenteIdx: idx, avaliavel: true };
  });
}

/** Pontua UM registro (contrato v2) contra a referência (envelope B + itens de erro). */
export function pontuarCaminho(run, envelopeB, refItens, { materializar = false } = {}) {
  // refItens: array de itens de erro (legado) OU o objeto REF[ex] { items, caminho } (multi-corpus)
  const refEx = refItens && !Array.isArray(refItens) ? refItens : null;
  if (refEx) refItens = refEx.items || [];
  const refCaminho = caminhoDeReferencia(envelopeB, refEx);
  const passos = run.grafo?.passos || [];
  const cas = casarEstados(refCaminho, passos, { materializar });
  const rotulosConcretos = passos.filter((p) =>
    canonizarValor(materializar ? materializarRotulo(p.valor) : p.valor)
  ).length;
  const avaliaveis = cas.filter((c) => c.avaliavel);
  const casados = avaliaveis.filter((c) => c.agenteIdx !== null);
  // cobertura SEM ORDEM (secundária, declarada 2026-08-15): o estado existe no
  // grafo do agente, em qualquer posição. Separa "falta o estado" de "o estado
  // está, mas noutra ordem" — a decisão de exigir a ordem do especialista é
  // metodológica (do orientador); as duas leituras são reportadas.
  const estadosAgenteSet = new Set(
    passos.map((p) => canonizarValor(materializar ? materializarRotulo(p.valor) : p.valor)).filter(Boolean)
  );
  const presentesSemOrdem = avaliaveis.filter((c) => estadosAgenteSet.has(c.ref.estado)).length;

  // Erros do especialista: valor + estado (passo da referência, 0-based na lib).
  // 2026-08-18: erro cuja aresta sai de um estado FORA do caminho de referência
  // não tem passo (`idx[t.from]` indefinido) — acontece quando o .brd traz
  // variantes do problema e o erro pertence ao ramo não seguido (6.18: 60 % dos
  // erros; 6.17 e 6.19: 0 %). Antes viravam `passo 0` e eram ancorados no
  // PRIMEIRO estado, o que só podia falhar. Agora ficam FORA do denominador e
  // são contados em `errosNaoAncoraveis` (reportado).
  const errosRefTodos = refItens || [];
  const ancoraveis = errosRefTodos.filter((it) => Number.isInteger(it.passo));
  const errosNaoAncoraveis = errosRefTodos.length - ancoraveis.length;
  // 2026-08-18 (2ª exclusão): erro cujo VALOR é igual à resposta correta do
  // estado onde ele está ancorado é INDISTINGUÍVEL de acerto por uma régua de
  // valor — o especialista modelou um erro de COMPONENTE/ORDEM ("marcar a
  // coisa certa no lugar errado"), não de valor. No 6.18 são 20/20 dos erros
  // ancoráveis (o `.brd` prevê marcar a fração na Linha 1 em vez da Linha 2);
  // no 6.17 e no 6.19, 0/110 e 0/54. Ficam fora do denominador e são contados
  // em `errosIndistinguiveis`; quando TODOS caem, a métrica é N/A (null), não 0.
  const valorDoEstado = new Map(refCaminho.map((r) => [r.ordem, r.estado]));
  const errosRef = ancoraveis
    .filter((it) => valorDoEstado.get(it.passo + 1) !== it.valor)
    .map((it) => ({ valor: it.valor, estadoOrdem: it.passo + 1 }));
  const errosIndistinguiveis = ancoraveis.length - errosRef.length;
  const mapaRefParaAgente = new Map(
    casados.map((c) => [c.ref.ordem, c.agenteIdx + 1]) // ordem ref → passo agente (1-based)
  );
  const errosAgente = (run.grafo?.erros || []).map((e) => ({
    valor: canonizarValor(e.valor),
    passo: Number(e.passo),
  }));
  let errosNoEstadoCerto = 0;
  let errosValorSomente = 0;
  for (const er of errosRef) {
    const passoAg = mapaRefParaAgente.get(er.estadoOrdem);
    const mesmoValor = errosAgente.filter((ea) => ea.valor === er.valor);
    if (mesmoValor.length) errosValorSomente++;
    if (passoAg && mesmoValor.some((ea) => ea.passo === passoAg)) errosNoEstadoCerto++;
  }

  // dicas: presença por estado casado
  const dicasAgentePorPasso = new Map();
  for (const d of run.grafo?.dicas || []) {
    dicasAgentePorPasso.set(d.passo, (dicasAgentePorPasso.get(d.passo) || 0) + 1);
  }
  const estadosRefComDica = casados.filter((c) => c.ref.dicas > 0);
  const dicasNoEstadoCerto = estadosRefComDica.filter(
    (c) => (dicasAgentePorPasso.get(c.agenteIdx + 1) || 0) > 0
  ).length;

  // extras por tipo (o que o agente cria além do previsto)
  const estadosRefSet = new Set(refCaminho.filter((r) => r.comResposta).map((r) => r.estado));
  const estadosExtras = passos.filter((p) => {
    const v = canonizarValor(materializar ? materializarRotulo(p.valor) : p.valor);
    return v && !estadosRefSet.has(v);
  }).length;
  const valoresRefErros = new Set(errosRef.map((e) => e.valor));
  const errosExtras = errosAgente.filter((e) => e.valor && !valoresRefErros.has(e.valor)).length;
  const dicasExtras = [...dicasAgentePorPasso.entries()].filter(([passo]) => {
    // dica num passo do agente que NÃO corresponde a estado da referência com dica
    const refOrdem = [...mapaRefParaAgente.entries()].find(([, ag]) => ag === passo)?.[0];
    const refEstado = refCaminho.find((r) => r.ordem === refOrdem);
    return !refEstado || refEstado.dicas === 0;
  }).length;

  return {
    ex: run.exercicio ?? run.id,
    replica: run.replica ?? null,
    nEstadosRef: avaliaveis.length,
    nEstadosAgente: passos.length,
    rotulosConcretos, // quantos estados do agente têm valor comparável (declara a taxa de recuperação)
    coberturaEstados: avaliaveis.length ? casados.length / avaliaveis.length : 0,
    coberturaSemOrdem: avaliaveis.length ? presentesSemOrdem / avaliaveis.length : 0,
    caminhoIntegro: avaliaveis.length && casados.length === avaliaveis.length ? 1 : 0,
    errosNoEstadoCerto: errosRef.length ? errosNoEstadoCerto / errosRef.length : null,
    errosValorSomente: errosRef.length ? errosValorSomente / errosRef.length : null,
    nErrosRef: errosRef.length,
    errosNaoAncoraveis,
    errosIndistinguiveis,
    dicasNoEstadoCerto: estadosRefComDica.length ? dicasNoEstadoCerto / estadosRefComDica.length : 0,
    extras: {
      estados: estadosExtras,
      erros: errosExtras,
      dicas: dicasExtras,
      caminhosBifurcacoes: (run.grafo?.erros || []).length, // cada erro é uma bifurcação (scaffold) a mais no caminho
    },
  };
}

/** desvio padrão amostral entre réplicas do mesmo exercício (item 8). */
export function dpEntreReplicas(linhas, campo) {
  const porEx = {};
  for (const l of linhas) if (l[campo] !== null && l[campo] !== undefined) (porEx[l.ex] ||= []).push(l[campo]);
  // DP AGRUPADO (2026-08-18, auditoria): antes era a média dos DPs por
  // exercício, que subestima o ruído. Agora √(Σ SSᵢ / Σ (nᵢ−1)).
  let ss = 0;
  let gl = 0;
  for (const v of Object.values(porEx)) {
    if (v.length < 2) continue;
    const m = media(v);
    ss += v.reduce((s, x) => s + (x - m) ** 2, 0);
    gl += v.length - 1;
  }
  return gl > 0 ? Math.sqrt(ss / gl) : null;
}

// ── CLI ─────────────────────────────────────────────────────────────────────
const ehMain = process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (ehMain) {
  const argv = process.argv.slice(2);
  const opt = (k, d) => {
    const i = argv.indexOf(k);
    return i >= 0 ? argv[i + 1] : d;
  };
  const dir = opt("--runs", null);
  const raiz = opt("--raiz", ".");
  const saida = opt("--json", null);
  const rotulo = opt("--rotulo", path.basename(path.dirname(dir || ".")));
  const materializar = argv.includes("--materializar");
  if (!dir) {
    console.error("uso: node analysis/bancada-v2/comparar-caminho.mjs --runs <dir> [--rotulo x] [--json out] [--materializar]");
    process.exit(2);
  }
  const REF = carregarReferencia(raiz);
  const linhas = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
    const run = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const ex = run.exercicio ?? run.id;
    if (!REF[ex] || !run.grafo) continue;
    const envB = JSON.parse(fs.readFileSync(path.join(raiz, DATASET(), ex, "envelope-b.json"), "utf8"));
    linhas.push(pontuarCaminho(run, envB, REF[ex], { materializar }));
  }
  if (!linhas.length) {
    console.error("nenhum registro casou com o corpus");
    process.exit(2);
  }
  const semValor = linhas.filter((l) => l.nEstadosAgente > 0 && (l.coberturaEstados === 0));
  const L = (t, campo) =>
    console.log(
      `  ${t.padEnd(44)} ${fmt(intervalo(linhas, campo))}  DP entre réplicas ${(dpEntreReplicas(linhas, campo) ?? 0).toFixed(3)}`
    );
  console.log("═".repeat(96));
  console.log(`COMPARAÇÃO POR ESTADO/CAMINHO — ${rotulo}${materializar ? " · rótulos MATERIALIZADOS (valor extraído do próprio rótulo do agente)" : " · rótulos CRUS do estágio graphforge"}`);
  const totPassos = linhas.reduce((s, l) => s + l.nEstadosAgente, 0);
  const totConc = linhas.reduce((s, l) => s + l.rotulosConcretos, 0);
  console.log(`  estados do agente com valor comparável: ${totConc}/${totPassos} = ${totPassos ? ((totConc / totPassos) * 100).toFixed(1) : 0}%`);
  console.log(
    `  unidade: ${linhas.length} grafos gerados (${new Set(linhas.map((l) => l.ex)).size} exercícios × réplicas) | ` +
      `estados/grafo: agente ${media(linhas.map((l) => l.nEstadosAgente)).toFixed(2)} vs referência ${media(linhas.map((l) => l.nEstadosRef)).toFixed(2)}`
  );
  console.log("═".repeat(96));
  L("cobertura de ESTADOS (subsequência ordenada, LCS)", "coberturaEstados");
  L("cobertura de ESTADOS sem ordem (secundária)", "coberturaSemOrdem");
  L("caminho de referência ÍNTEGRO no grafo (0/1)", "caminhoIntegro");
  L("ERROS no estado certo (match binário)", "errosNoEstadoCerto");
  L("erros por valor apenas (sem posição, p/ contraste)", "errosValorSomente");
  L("DICAS no estado certo (presença por estado)", "dicasNoEstadoCerto");
  console.log(
    `  extras por grafo (média): estados ${media(linhas.map((l) => l.extras.estados)).toFixed(2)} | ` +
      `erros ${media(linhas.map((l) => l.extras.erros)).toFixed(2)} | dicas ${media(linhas.map((l) => l.extras.dicas)).toFixed(2)}`
  );
  if (semValor.length) {
    console.log(
      `  aviso: ${semValor.length} grafos sem nenhum estado casado — verifique se grafo.passos[].valor está preenchido (registros anteriores à rodada 3 não têm o campo).`
    );
  }
  if (saida) {
    fs.writeFileSync(
      saida,
      JSON.stringify(
        {
          gerado: new Date().toISOString(),
          rotulo,
          materializar,
          rotulosConcretos: { comparaveis: totConc, total: totPassos },
          unidade: { grafos: linhas.length, exercicios: new Set(linhas.map((l) => l.ex)).size },
          metricas: Object.fromEntries(
            ["coberturaEstados", "coberturaSemOrdem", "caminhoIntegro", "errosNoEstadoCerto", "errosValorSomente", "dicasNoEstadoCerto"].map(
              (c) => [c, { ...intervalo(linhas, c), dpEntreReplicas: dpEntreReplicas(linhas, c) }]
            )
          ),
          extrasMedios: {
            estados: media(linhas.map((l) => l.extras.estados)),
            erros: media(linhas.map((l) => l.extras.erros)),
            dicas: media(linhas.map((l) => l.extras.dicas)),
          },
          porGrafo: linhas,
        },
        null,
        1
      )
    );
    console.log(`  salvo em ${saida}`);
  }
}
