# Errata pos-resultado: indice de preservacao por campo do 3a

Data: 15 de julho de 2026, 15:40 UTC. Status: registrada depois do fechamento
das saidas brutas e antes da agregacao final e da redacao dos resultados.

## 1. Natureza e alcance

Uma auditoria dos calculos deterministas encontrou um erro de indexacao em quatro
submetricas descritivas de transporte do agente 3a. O vetor correto de itens
pareados `rows` ja continha os indicadores `preservedRawToConfig`, mas a funcao
que calculava as taxas por campo recebia por engano o vetor de origem `raw`, no
qual esse indicador nao existe. Por isso, as taxas por campo `step`, `action`,
`result` e `kcUsed` em `raw -> config` eram apresentadas como zero mesmo quando
os itens tinham sido preservados.

A correcao troca somente o argumento dessas quatro chamadas, de `raw` para
`rows`. Nao ha mudanca em saidas dos agentes, prompts, fixtures, referencia BRD,
GraphForge, denominadores, regras de pareamento, estimandos pre-registrados,
contagem exata de itens preservados, taxas diretas de 3a/3b/3c ou resultados de
schema. Nenhuma chamada de LLM e feita no recálculo.

## 2. Proveniencia

Versao congelada antes da geracao:

- `production-fidelity/campaign4-metrics-v2.mjs`: SHA-256
  `4f8ae7d374bb08fe9ac59cedc622fde92f40379f635b47a05fc69d9044dfd6fa`;
- `__tests__/campaign4-metrics-v2.test.mjs`: SHA-256
  `eb9be4ff5f651b858e6b6d0038796bf930e67bab849132ad4af139803340b335`.

Versao corrigida `educaoff-campaign4-metrics-v2.1-erratum`:

- `production-fidelity/campaign4-metrics-v2.mjs`: SHA-256
  `a228f60e8838055c69e90e91e671ca0653339c8c3af5e2b6b582e98eedec9be2`;
- `__tests__/campaign4-metrics-v2.test.mjs`: SHA-256
  `2d627fcb3f9dd1545d933875cd61be60844c98929826ecce60b2ebb09dc66039`.

O teste de regressao agora exige que as quatro taxas por campo coincidam com a
proporcao de itens pareados preservados no cenario sintetico. A suite direcionada
passou com 6/6 testes antes do recálculo dos artefatos derivados.

## 3. Regra de relato

Todos os resultados agregados e tabelas do artigo usam v2.1. Os artefatos brutos
permanecem imutaveis. A versao v2 original e esta errata devem ser citadas juntas
na trilha de auditoria. Como a correcao ocorreu apos observar as saidas, as quatro
taxas afetadas serao identificadas no artigo como submetricas descritivas
corrigidas pos-resultado, e nao como novos desfechos confirmatorios.
