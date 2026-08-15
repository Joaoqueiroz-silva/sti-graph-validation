/**
 * interface-ctat.js — descrição NEUTRA da interface fixa do tutor CTAT
 * (dataset frac-numberline-6.17) para entrar no envelope A dos agentes
 * (braço "interface fixa", rodada 4, 2026-08-15).
 *
 * Premissa do experimento (do orientador/autor): os agentes devem receber
 * EXATAMENTE o que o especialista teve — o problema E a interface — e, a
 * partir disso, autorar o grafo. Até a rodada 3 os agentes recebiam só
 * enunciado + resposta + KCs; a interface (componentes) não entrava porque os
 * agentes de produção não têm um campo de inventário. Aqui a interface entra
 * pelos DOIS canais que o código de produção já lê sem edição de agente:
 *   - agents 3: `state.seedProblems` é serializado (JSON.stringify) inteiro
 *     nos prompts → o campo `interface` do problema-semente é visto;
 *   - agent 6: `state.description` → bloco "REQUISITOS DO PROFESSOR".
 *
 * FONTES (todas do lado da interface, nunca do grafo do especialista):
 *   - `_interface/screenshot.png` + `_interface/interface.html`: layout
 *     compartilhado (enunciado; pergunta da fração com duas caixas; reta
 *     numérica; "Number of parts" + OK; botões Hint e Done);
 *   - `_interface/massproduction.txt`: parâmetros por problema — LISTA
 *     BRANCA: statement2 (pergunta exibida), rBound (extremo direito da
 *     reta), fracBox (caixas da fração exibidas), mfNum_box (há caixa de
 *     número misto), label_aid (rótulo da fração exibido na reta), line_name;
 *   - `envelope-a.json`.components: ids e tipos dos componentes.
 * NUNCA lidos: hints (div-h1, div-h2, line-h, num-h), goodjob (feedback),
 * badCount, doubleDiv, mfNum (valor), num/den/frac (já estão na resposta do
 * envelope A; aqui não se repetem). Teste trava a lista branca.
 */
import fs from "node:fs";
import path from "node:path";

const RAIZ_DATASET = "datasets/frac-numberline-6.17";
export const CAMPOS_PERMITIDOS = Object.freeze([
  "%(statement2)%",
  "%(rBound)%",
  "%(fracBox)%",
  "%(mfNum_box)%",
  "%(label_aid)%",
  "%(line_name)%",
]);
export const CAMPOS_PROIBIDOS = Object.freeze([
  "%(div-h1)%",
  "%(div-h2)%",
  "%(line-h)%",
  "%(num-h)%",
  "%(goodjob)%",
  "%(badCount)%",
  "%(doubleDiv)%",
  "%(mfNum)%",
  "%(num)%",
  "%(den)%",
  "%(frac)%",
]);

let _tabela = null;
function tabela(raiz = ".") {
  if (_tabela) return _tabela;
  const linhas = fs
    .readFileSync(path.join(raiz, RAIZ_DATASET, "_interface", "massproduction.txt"), "utf8")
    .split("\n")
    .map((l) => l.replace(/\r$/, "").split("\t"));
  const cab = linhas[0];
  const porCampo = {};
  for (const l of linhas.slice(1)) if (l[0]) porCampo[l[0]] = l;
  _tabela = { cab, porCampo };
  return _tabela;
}

/** Parâmetros de interface de UM problema — só os campos da lista branca. */
export function lerParametrosInterface(exercicioId, raiz = ".") {
  const { cab, porCampo } = tabela(raiz);
  const col = cab.indexOf(exercicioId);
  if (col < 0) throw new Error(`exercício ${exercicioId} não está em massproduction.txt`);
  const val = (campo) => {
    const l = porCampo[campo];
    const v = l && col < l.length ? String(l[col]).trim() : "";
    return v === "-" ? "" : v;
  };
  const semAspas = (s) => s.replace(/^"|"$/g, "");
  return {
    pergunta: semAspas(val("%(statement2)%")),
    retaAte: Number(val("%(rBound)%")) || 1,
    caixaFracaoExibida: val("%(fracBox)%") === "1",
    caixaNumeroMisto: val("%(mfNum_box)%") !== "" && val("%(mfNum_box)%") !== "0",
    rotuloFracaoNaReta: val("%(label_aid)%") !== "" && val("%(label_aid)%") !== "0",
    nomeDaReta: val("%(line_name)%") || "numline",
  };
}

const PAPEL_COMPONENTE = Object.freeze({
  numline: "reta numérica; o aluno adiciona um ponto (marca a posição da fração)",
  F1: "campo numérico da caixa de cima da fração (numerador)",
  F2: "campo numérico da caixa de baixo da fração (denominador)",
  denom: 'campo numérico "Number of parts" + botão OK: divide a reta em partes iguais',
  showAnswer: "botão que registra a fração informada",
  writeFractionStep: "controle que exibe a etapa de escrever a fração",
  done: "botão Done (concluir o problema)",
});

/**
 * Objeto de interface que vai no problema-semente dos agents 3 e (em texto)
 * no requisito do agent 6. Determinístico; sem nada do grafo do especialista.
 */
export function descreverInterface(envelopeA, params) {
  const p = params || lerParametrosInterface(envelopeA.id);
  const componentes = (envelopeA.components || []).map((c) => ({
    id: c.id,
    tipo: c.type,
    papel: PAPEL_COMPONENTE[c.id] || c.label || c.id,
  }));
  return {
    descricao:
      "Interface FIXA do tutor (a mesma tela para todos os problemas): enunciado; " +
      (p.caixaFracaoExibida
        ? `pergunta "${p.pergunta || "Qual é a fração presente no problema?"}" com duas caixas numéricas (F1 em cima = numerador, F2 embaixo = denominador); `
        : "as caixas da fração (F1/F2) existem mas a pergunta da fração não é exibida (a fração já está no enunciado); ") +
      `reta numérica de 0 a ${p.retaAte} (${p.nomeDaReta}) onde o aluno marca um ponto; ` +
      'campo "Number of parts" (denom) + OK que divide a reta em partes iguais (começa em 1); ' +
      (p.caixaNumeroMisto ? "caixa de número misto exibida; " : "") +
      (p.rotuloFracaoNaReta ? "o rótulo da fração aparece como apoio na reta; " : "") +
      "botão Hint; botão Done. Os passos do aluno são ações NESSES componentes (digitar nos campos, dividir a reta, marcar o ponto, concluir).",
    retaNumerica: { de: 0, ate: p.retaAte, partesIniciais: 1 },
    caixaFracaoExibida: p.caixaFracaoExibida,
    caixaNumeroMisto: p.caixaNumeroMisto,
    componentes,
  };
}

/** Texto do requisito de interface para o agent 6 (REQUISITOS DO PROFESSOR). */
export function textoRequisitoInterface(desc) {
  const comps = desc.componentes.map((c) => `- ${c.id} (${c.tipo}): ${c.papel}`).join("\n");
  return `A interface é FIXA e deve ser respeitada: ${desc.descricao}
Componentes disponíveis (use apenas estes; cada passo do exercício deve corresponder a uma ação num deles, com a resposta esperada sendo o valor digitado/marcado):
${comps}`;
}
