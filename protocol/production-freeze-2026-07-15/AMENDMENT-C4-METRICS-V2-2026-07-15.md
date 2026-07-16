# Emenda pre-execucao: metricas C4 v2 por problema e transporte

Data: 2026-07-15. Status: congelada antes da primeira chamada real da Campanha 4.
Esta emenda foi escrita sem ler resultados C4 (ainda inexistentes) e nao altera
prompts, modelos, fixtures, codigo implantado ou politica de execucao.

## Motivo

Cada requisicao contem quatro `seedProblems`, e cada agente devolve `solutions[]`
com `problemId`. A metrica anterior achatava essas solucoes. Alem disso, os prompts
pedem resultados com `{A}`, `{B}` e `{C}`, enquanto o BRD contem SAI concretas; e o
`step` do agente 3b nao e um state ID CTAT. O GraphForge concatena solucoes, corta um
prefixo global e nao transporta `problemId`.

## Estimandos congelados

1. **Identidade e schema.** Unidade = exercicio. Reportar cobertura de `problemId`
   exato, cobertura recuperavel apenas por proxy ordinal 1..N, ambiguidades e
   completude campo a campo do contrato JSON de 3a/3b/3c. Nao inferir identidade
   pela posicao do array quando `problemId` estiver ausente.
2. **3a.** `R3a_exact_concrete = LCS(E,Gc)/|E|`, onde `E` sao as quatro acoes
   corretas de conteudo Student do CTAT e `Gc` contem somente resultados concretos.
   Placeholders entre chaves sao `generic` e recebem zero credito nesse estimando;
   vazios/nao escalares sao `unscorable`. Frequencias generic/unscorable e resposta
   final exata sao reportadas separadamente. Este desfecho e diagnostico da
   instanciacao, pois o proprio prompt solicita generalidade.
3. **3b.** Primario descritivo nesta emenda: recall por **valor concreto unico** nas
   acoes buggy comparaveis. `R3b_state_SAI = null`: o output nao fornece o conjunto
   state ID + Selection + Action necessario. O pareamento `(step, valor)` fica apenas
   como `ordinalProxy`, analise de sensibilidade explicitamente nao interpretada como
   concordancia de estado.
4. **3c.** Calcular por `problemId`, sem fundir passos homonimos entre solucoes.
   Reportar cadeia completa 1--4 e cadeia estrita: exatamente quatro dicas, niveis e
   textos distintos, tipos conceptual/procedural/specific/bottom_out, texto nao vazio
   e ausencia da resposta final. O denominador condicional sao passos emitidos com
   `hesitation=true` ou dicas; o sucesso por problema ITT exige ao menos um passo
   elegivel e todas as cadeias validas. Trata-se de proxy operacional, nao eficacia.
5. **Transporte.** Reportar contagens e taxas por campo em `raw -> config ->
   GraphForge`, sem escore composto: 3a (step/action/result/KC/problemId), 3b
   (id/tipo/wrongAnswer/descricao/severidade/howToFix/feedback/diagnostico/localizacao)
   e 3c (texto/nivel/tipo/problemId). Perdas por truncamento, deduplicacao e fusao de
   problemas ficam explicitas. `result` do 3a nao existe no genericGraph; dicas do 3c
   aparecem em `slotManifest.existingHints`, nao nos nos do genericGraph.

## Referencia e filtros CTAT

O parser `ctat-reference-v2` preserva estados e SAI originais. A politica primaria
`ctat-6.17-content-filter-v2` inclui somente ator Student; exclui o clique correto
`done/ButtonPressed/-1` e, entre acoes buggy, somente as sentinelas **exatas** `""`,
`"-"` e `"-1"`. No corpus: 384 transicoes; 96 acoes corretas comparaveis; 192 buggy,
das quais 82 mecanicas e 110 comparaveis. O unico `-/D` (`-/5`) permanece comparavel.
Uma sensibilidade predeclarada `compound_missing_numerator_v1` pode exclui-lo, sem
alterar o estimando primario.

## Limites de interpretacao

- BRD e referencia de autor, nao verdade pedagogica universal.
- Conteudo generico nao sera instanciado post hoc usando o gabarito.
- Proxy ordinal nao identifica estado CTAT.
- Preservacao de campo nao mede qualidade pedagogica.
- Todas as metricas devem ser recalculaveis dos artefatos brutos fechados; o parser
  de referencia so pode ser aplicado depois desse fechamento.

Implementacao: `production-fidelity/campaign4-metrics-v2.mjs` e
`production-fidelity/ctat-reference-v2.mjs`.
