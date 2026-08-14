/**
 * text-normalize.js — fonte única das normalizações de texto do backend.
 *
 * 2026-06-11 (auditoria de organização): existiam 7 implementações locais em
 * 6 arquivos (final-gate, agent9-review, contracts/compiler, component-adapters,
 * dispatcher, sti-cache) com 4 semânticas distintas — dev novo não sabia qual
 * usar e criava a 8ª. As 4 semânticas são DELIBERADAS e continuam distintas;
 * o que muda é que agora têm nome, teste e um lugar só.
 *
 * Guia rápido:
 *  - normalizeAnswerKey → comparar respostas/opções como o aluno VÊ
 *    (preserva acento de propósito: "pé" ≠ "pe").
 *  - normalizeMatchKey  → casar identificadores/títulos com tolerância
 *    (ignora acento, hífen, underscore). É também a CHAVE DE CACHE da
 *    geração (sti-cache) — mudar a semântica invalida o cache inteiro.
 *  - normalizeAccentKey → chave minúscula sem acento (lookup de dicionário).
 *  - canonicalStudentKey → identidade de aluno pra agregação cross-aluno.
 *  - slugify            → ids seguros [a-z0-9-].
 *  - stripAccents       → primitivo NFD usado pelos demais.
 */

/** Remove diacríticos via NFD ("Matemática" → "Matematica"). */
export function stripAccents(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Normaliza resposta/opção pra comparação como o aluno vê: case-insensitive,
 * espaços colapsados, vírgula sem espaços em volta. PRESERVA acentos —
 * em resposta visível, "pé" e "pe" são respostas diferentes.
 * (ex-normalizeGateText do final-gate; ex-normalizeKey do agent9-review.)
 */
export function normalizeAnswerKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s*,\s*/g, ",")
    .replace(/\s+/g, " ");
}

/**
 * Casamento tolerante de identificadores/títulos: minúsculo, sem acento,
 * hífen/underscore viram espaço, espaços colapsados.
 * (ex-normalizeText do dispatcher; ex-normalize do sti-cache — onde é a
 * chave do cache de geração: NÃO mude a semântica sem assumir a invalidação.)
 */
export function normalizeMatchKey(value) {
  return stripAccents(String(value ?? "").toLowerCase())
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Chave minúscula sem acento, espaçamento interno preservado.
 * (ex-normalizeKey do contracts/compiler.)
 */
export function normalizeAccentKey(value) {
  return stripAccents(
    String(value ?? "")
      .trim()
      .toLowerCase()
  );
}

/**
 * Identidade de aluno para agregação CROSS-ALUNO ("quantos alunos distintos
 * cometeram este erro?").
 *
 * 2026-08-09 (colheita): `interactions.student_id` é o nome que a pessoa
 * digitou, e a mesma pessoa aparece grafada de formas diferentes conforme a
 * origem — `/join` salva slug (`teste_-_fisica`), `/interaction` grava o nome
 * bruto (`Teste - Fisica`), e o próprio aluno digita `Joao carlos` num dia e
 * `joaocarlos` no outro. Medido no corpus: 42 `student_id` distintos para
 * menos gente que isso.
 *
 * Isso não é cosmético. Todo critério de significância do sistema conta alunos
 * distintos: a colheita exige >=2 antes de propor diagnóstico, e o alerta de
 * `collective_misconception` exige >=3 antes de avisar o professor. Contar a
 * mesma pessoa duas vezes dispara alerta de turma para um aluno só; contar
 * duas grafias como duas pessoas esconde um erro que já é coletivo.
 *
 * A regra é agressiva de propósito (só [a-z0-9]): duas pessoas cujos nomes
 * diferem apenas em espaço, pontuação, acento ou caixa são, na prática, a
 * mesma. E o risco de fusão indevida não é NOVO — dois alunos homônimos já
 * colidiam antes desta função, porque a identidade sempre foi o nome digitado.
 * O que se conserta aqui é a sub-fusão, não a super-fusão.
 */
export function canonicalStudentKey(value) {
  return stripAccents(String(value ?? "").toLowerCase()).replace(/[^a-z0-9]+/g, "");
}

/**
 * Slug [a-z0-9-]. maxLength/fallback variam por chamador — compiler usa
 * 32/"id" (via wrapper local), component-adapters usa 24/"" (idem).
 */
export function slugify(value, { maxLength = 32, fallback = "" } = {}) {
  const slug = stripAccents(
    String(value ?? "")
      .trim()
      .toLowerCase()
  )
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, maxLength);
  return slug || fallback;
}
