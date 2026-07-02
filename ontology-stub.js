/**
 * ontology-stub.js — substitui o ontology-client do backend (Fuseki/SPARQL).
 *
 * O `graphForge(config)` usado na AVALIAÇÃO é determinístico e NÃO consulta a ontologia —
 * essas funções só são chamadas pelo caminho de PRODUÇÃO (extractGraphForgeConfig), que não
 * roda aqui. Os stubs existem apenas para o import resolver. Retornam vazio.
 */
export async function getPrerequisites() {
  return [];
}
export async function getRelationships() {
  return [];
}
export async function getMisconceptions() {
  return [];
}
