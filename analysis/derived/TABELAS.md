# Tabelas geradas — reanálise de 2026-07-12

Fonte: dados brutos da tag `legacy-campaigns-2026-07`. Unidade = exercício (n=24; réplicas agregadas por média). Testes pareados por permutação exata de troca de sinais; Holm por família. Gerado por `analysis/reanalyze.mjs` — NÃO editar à mão.

## Sumário campanha 1 (agentes reais, 3 réplicas)

| Métrica | Média | IC 95% |
|---|---|---|
| completude conceitual (PRIMÁRIA) | 0.376 | [0.309; 0.442] |
| completude bruta (sensibilidade) | 0.234 | [0.195; 0.273] |
| completude de passos | 0.51 | [0.497; 0.525] |
| inclusão de traços | 0.461 | [0.433; 0.49] |
| F1 (auditável) | 0.485 | [0.459; 0.511] |
| concordância de classificação (bruta) | 0.396 | [0.345; 0.449] |
| concordância de classificação (κ) | 0.007 | [-0.069; 0.089] |

## Concordância de classificação de respostas (ex-"equivalência funcional")

Campanha 1: concordância bruta média 0.396, κ médio 0.007 (faixa -0.436 a 0.583; κ pooled da matriz agregada -0.033), 72 pares. κ recomputado e validado contra os relatórios gravados; verificação independente V3 de 2026-07-12 reproduziu matriz e médias exatamente.

Matriz de confusão agregada (linhas = especialista, colunas = robô):

| | correto | erro-previsto | surpresa |
|---|---|---|---|
| **correto** | 72 | 0 | 0 |
| **erro-previsto** | 0 | 91 | 158 |
| **surpresa** | 0 | 116 | 0 |

κ por braço (campanha 2): Gemini 3.5 Flash 0.051 · GLM-5.2 -0.027 · DeepSeek V4 Pro -0.074 · Claude Sonnet 5 -0.033

## Campanha 2 — família primária (completude conceitual vs baseline; Holm m=3)

| Comparação | Δ médio | IC 95% | p exato | p-Holm | rejeita H0 |
|---|---|---|---|---|---|
| glm52 vs gemini · completude conceitual | 0.047 | [-0.048; 0.143] | 0.3808 | 0.9883 | não |
| dsv4pro vs gemini · completude conceitual | 0.003 | [-0.089; 0.091] | 0.9566 | 0.9883 | não |
| sonnet5 vs gemini · completude conceitual | 0.047 | [-0.038; 0.142] | 0.3294 | 0.9883 | não |

## Campanha 2 — família secundária/exploratória (Holm m=12)

| Comparação | Δ médio | IC 95% | p exato | p-Holm | rejeita H0 |
|---|---|---|---|---|---|
| glm52 vs gemini · recallMisconceptions | 0.026 | [-0.035; 0.087] | 0.4347 | 1.0000 | não |
| dsv4pro vs gemini · recallMisconceptions | -0.002 | [-0.06; 0.052] | 0.9497 | 1.0000 | não |
| sonnet5 vs gemini · recallMisconceptions | 0.027 | [-0.027; 0.086] | 0.3743 | 1.0000 | não |
| glm52 vs gemini · recallSteps | -0.007 | [-0.023; 0.005] | 0.7500 | 1.0000 | não |
| dsv4pro vs gemini · recallSteps | -0.031 | [-0.047; -0.015] | 0.0029 | 0.0348 | sim |
| sonnet5 vs gemini · recallSteps | -0.008 | [-0.024; 0.006] | 0.5000 | 1.0000 | não |
| glm52 vs gemini · stepInclusion | 0.031 | [-0.006; 0.063] | 0.0908 | 0.8170 | não |
| dsv4pro vs gemini · stepInclusion | 0.014 | [-0.014; 0.042] | 0.3525 | 1.0000 | não |
| sonnet5 vs gemini · stepInclusion | 0.059 | [0.017; 0.101] | 0.0114 | 0.1144 | não |
| glm52 vs gemini · f1 | -0.017 | [-0.054; 0.017] | 0.3782 | 1.0000 | não |
| dsv4pro vs gemini · f1 | -0.056 | [-0.092; -0.023] | 0.0047 | 0.0522 | não |
| sonnet5 vs gemini · f1 | -0.025 | [-0.054; 0.005] | 0.1171 | 0.9367 | não |

## Juiz (itens únicos, decisão por maioria, IC por exercício)

| Campanha/braço | Grupo | Itens únicos | Julgamentos | Empates | Validade (maioria, sem empates) | IC 95% | Autoconsistência |
|---|---|---|---|---|---|---|---|
| C1 (juiz GLM-4.5) | robo-extra | 68 | 105 | 2 | 0.833 | [0.738; 0.914] | 0.926 |
| C1 (juiz GLM-4.5) | especialista | 83 | 249 | 0 | 0.988 | [0.962; 1] | 0.988 |
| C1 (juiz GLM-4.5) | distrator-correta | 24 | 72 | 0 | 0 | [0; 0] | 1 |
| C1 (juiz GLM-4.5) | distrator-absurdo | 24 | 72 | 0 | 0 | [0; 0] | 1 |
| C2 Gemini 3.5 Flash (juiz Mistral) | robo-extra | 67 | 103 | 1 | 0.742 | [0.621; 0.857] | 0.913 |
| C2 Gemini 3.5 Flash (juiz Mistral) | especialista | 83 | 249 | 0 | 0.831 | [0.744; 0.909] | 0.928 |
| C2 Gemini 3.5 Flash (juiz Mistral) | distrator-correta | 24 | 71 | 0 | 0 | [0; 0] | 1 |
| C2 Gemini 3.5 Flash (juiz Mistral) | distrator-absurdo | 24 | 72 | 0 | 0 | [0; 0] | 1 |
| C2 GLM-5.2 (juiz Mistral) | robo-extra | 96 | 145 | 2 | 0.777 | [0.699; 0.853] | 0.868 |
| C2 GLM-5.2 (juiz Mistral) | especialista | 83 | 249 | 0 | 0.843 | [0.774; 0.914] | 0.904 |
| C2 GLM-5.2 (juiz Mistral) | distrator-correta | 24 | 69 | 0 | 0 | [0; 0] | 1 |
| C2 GLM-5.2 (juiz Mistral) | distrator-absurdo | 24 | 72 | 0 | 0 | [0; 0] | 1 |
| C2 DeepSeek V4 Pro (juiz Mistral) | robo-extra | 127 | 162 | 1 | 0.73 | [0.648; 0.806] | 0.929 |
| C2 DeepSeek V4 Pro (juiz Mistral) | especialista | 83 | 249 | 0 | 0.831 | [0.762; 0.904] | 0.916 |
| C2 DeepSeek V4 Pro (juiz Mistral) | distrator-correta | 24 | 71 | 0 | 0 | [0; 0] | 1 |
| C2 DeepSeek V4 Pro (juiz Mistral) | distrator-absurdo | 24 | 72 | 0 | 0 | [0; 0] | 1 |
| C2 Claude Sonnet 5 (juiz Mistral) | robo-extra | 103 | 154 | 2 | 0.733 | [0.667; 0.807] | 0.902 |
| C2 Claude Sonnet 5 (juiz Mistral) | especialista | 83 | 249 | 0 | 0.819 | [0.75; 0.89] | 0.916 |
| C2 Claude Sonnet 5 (juiz Mistral) | distrator-correta | 24 | 71 | 0 | 0 | [0; 0] | 1 |
| C2 Claude Sonnet 5 (juiz Mistral) | distrator-absurdo | 24 | 72 | 0 | 0 | [0; 0] | 1 |

## Importância dos erros perdidos (média entre réplicas, por exercício)

| Campanha/braço | Perdidos | Centrais | Periféricos | Mecânicos | Taxa central |
|---|---|---|---|---|---|
| C1 (juiz GLM-4.5) | 50.333 | 28.333 | 21 | 1 | 0.563 |
| C2 Gemini 3.5 Flash (juiz Mistral) | 50.667 | 49.333 | 1 | 0.333 | 0.974 |
| C2 GLM-5.2 (juiz Mistral) | 50.333 | 49.333 | 1 | 0 | 0.98 |
| C2 DeepSeek V4 Pro (juiz Mistral) | 57.333 | 56.667 | 0.667 | 0 | 0.988 |
| C2 Claude Sonnet 5 (juiz Mistral) | 48.333 | 47.333 | 0.667 | 0.333 | 0.979 |

## Nota estrutural sobre a bateria (motivação da bateria independente)

A bateria atual é a união das respostas dos dois grafos: todo item pertence ao catálogo de pelo menos um lado, então a célula surpresa×surpresa é IMPOSSÍVEL por construção (verificável na matriz acima). Sem verdadeiros negativos, a concordância esperada por acaso é alta e o κ fica estruturalmente deprimido. Este é o achado negativo que motiva a bateria independente congelada (G6 do plano mestre).

## Real × shim (campanha 1, completude conceitual)

Δ médio -0.073, IC 95% [-0.165; 0.031], p exato 0.1731 (n=24).

## Tabela 7 reconstruída — cobertura micro por tipo de erro (baseline C2)

Instâncias conceituais do especialista (pooled); "1 execução" = média das 3 execuções isoladas; "união de 3" = coberta por qualquer réplica.

| Tipo de erro | Ocorrências | Cobertura (1 exec) | Cobertura (união de 3) |
|---|---|---|---|
| Fração incorreta | 30 | 39% | 73% |
| Numerador isolado | 24 | 50% | 79% |
| Denominador isolado | 24 | 14% | 33% |
| Outros inteiros | 5 | 73% | 80% |
| Total | 83 | 37% | 64% |

## Reconciliação dos números públicos

| Número no relatório | Definição formal | Recomputado |
|---|---|---|
| 0,368 (v2.1, campanha 1) | completude CONCEITUAL, média MICRO sobre os 72 pares robô-especialista (24 exercícios × 3 réplicas SEM agregação prévia por exercício) — era a agregação da v2.1 | 0.376 |
| 0,376 (v2.1, campanha 2 baseline) | idem, braço gemini da campanha 2 (mesma configuração, infra nova) | 0.368 |
| completude BRUTA (sensibilidade) | completude incluindo erros mecânicos de interface, macro por exercício, campanha 1 real (micro entre parênteses) | 0.234 (micro 0.234) |
| união de 3 réplicas (K=3 do pipeline completo) | por exercício: misconceptions conceituais do especialista cobertas por QUALQUER uma das 3 réplicas reais ÷ total; média macro (campanha 1) | 0.645 |
| união de 3 réplicas BRUTA | idem incluindo misconceptions mecânicas de interface | 0.404 |
| curva de saturação 31,3%…55,6% | cobertura por K (rotação de uniões) do agente 3b amostrado 5× por exercício — experimento separado, arquivo resultados/saturation-curve-2026-07-10.json | ver arquivo fonte (não recalculado aqui; K e amostrador distintos das réplicas) |
| 72 vs 144 grafos | 72 = grafos autorados nas 3 réplicas de AVALIAÇÃO reais (3×24, campanha 1). 144 = 72 + 72 autorados nas 3 réplicas do JULGAMENTO (que autoram de novo para julgar a MESMA autoria no 2D). Os 72 do shim são a variante simplificada e ficam fora dos resultados principais. | {"evalReal":72,"evalMaisJuiz":144,"shim":72} |
| 6 corridas vs 9 relatórios | 9 arquivos = 3 avaliações reais + 3 avaliações shim + 3 julgamentos. As '6 corridas' do texto eram 3 reais + 3 julgamentos (o shim é baseline interno). | {"evalReal":3,"evalShim":3,"judge":3} |
| 83 (+1 outro) vs soma 82 | 83 = itens de calibração do especialista julgados por réplica (denominador da Tabela 7; confere). A alocação da v2.1 (29 fração + 24 + 24 + 5 + 1 'outro' = 83) diferia da taxonomia auditada, que classifica o item atípico '-/5' na classe fração pela regra sintática (contém '/'), fechando 30 + 24 + 24 + 5 = 83 SEM residual. Mesmo denominador; a diferença era a alocação manual de um item. A Tabela 7 auditada substitui a da v2.1. | {"itensJulgadosPorReplica":83,"taxonomiaAuditada":"30+24+24+5=83, residual 0"} |
| 47% (total '1 execução' da Tabela 7 na v2.1) — NÃO REPRODUZÍVEL | nenhuma definição testada (micro/macro, por réplica, união parcial) reproduz 47% a partir dos dados brutos. O valor auditado da cobertura micro em execução única (média das 3 réplicas, baseline C2) é o desta reanálise; a união de 3 réplicas (64%) confere. Registrado como inconsistência da v2.1, resolvida pela geração automática da tabela. | ver Tabela 7 reconstruída |
