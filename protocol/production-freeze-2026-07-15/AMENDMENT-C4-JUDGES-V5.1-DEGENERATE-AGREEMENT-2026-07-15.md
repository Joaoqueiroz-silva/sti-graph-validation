# Errata analitica do painel v5: coeficientes degenerados

Data: 15 de julho de 2026. Status: registrada depois da execucao v5 e de
auditoria estatistica independente. Nenhuma nova chamada de modelo foi feita.

## Problema

O runner representou como alfa=1 e kappa=1 o caso em que desacordo observado e
esperado eram ambos zero. Em dez das quinze dimensoes, todas as notas validas
eram 4. Sem variacao marginal, a confiabilidade corrigida pelo acaso nao e
estimavel; unanimidade bruta nao equivale a evidencia de discriminacao.

Trinta e tres dos 45 kappas pareados apresentavam a mesma degenerescencia. Nas
cinco dimensoes com alguma variacao, o alfa ordinal variou de -0,005495 a
0,329407 e foi fraco.

## Correcao

O artefato original foi preservado com SHA-256
`5cf5b5ddd74d4a6376836b35da19e6bf90ccec3410e2c58102df76a51dd4c5b2`.
O pos-processamento `analysis/correct-campaign4-judge-degeneracy.mjs` altera
somente a representacao desses coeficientes: `null`, `nao_estimavel` e motivo
explicito quando ha uma unica categoria observada. Escores, contagens, consenso,
concordancia bruta, calibracao, custos e cobertura permanecem inalterados.

O artefato corrigido
`resultados/campanha4-2026-07-15/judge-panel-v5/judge-panel-analysis-v5.1.json`
tem SHA-256
`e7d1c37d55a95036c1ffc626052e59e79846f198e988709211c682d453a815a3`.

## Interpretacao

O artigo deve declarar efeito-teto: 2.746/2.755 notas dimensionais principais
validas foram 4. Dez dimensoes tem concordancia corrigida pelo acaso nao
estimavel; as cinco restantes tem alfa fraco. O painel continua auxiliar e nao
fornece validacao pedagogica.
