# Seleção e auditoria do juiz da campanha 2 (P1-5)

## Por que o juiz precisou trocar

O juiz da campanha 1 (GLM-4.5) pertence à família de um dos braços testados na
campanha 2 (GLM-5.2), o que violaria a exigência de neutralidade familiar
(viés de autopreferência; Panickssery et al., 2024). O juiz da campanha 2 deve
ser de família alheia às quatro geradoras (Google, Z.ai, DeepSeek, Anthropic).

## Comparativo de candidatos (2026-07-08)

Cada candidato julgou o mesmo item de teste ("4/4" como candidata para o
exercício de resposta 3/4), com o prompt oficial do juiz:

| Candidato | Família | Latência por julgamento | Veredito | Custo (in/out por M) |
| --- | --- | --- | --- | --- |
| **mistralai/mistral-large-2512 (escolhido)** | Mistral | **1,9 s** | correto (válida, parte-todo) | US$ 0,50 / 1,50 |
| mistralai/mistral-medium-3.1 | Mistral | 1,3 s | correto | US$ 0,40 / 2,00 |
| qwen/qwen3.7-max | Qwen | 14,4 s | correto | US$ 1,25 / 3,75 |
| qwen/qwen3.7-plus | Qwen | 28,1 s | correto | US$ 0,32 / 1,28 |

Critérios: neutralidade familiar (todos atendem), adequação do veredito (todos
atendem no item de teste), latência e custo (os Qwen usam raciocínio interno
longo: inviável para ~500 julgamentos por corrida). Escolha: o Mistral Large
(tier mais alto da família com latência de 1,9 s); o Medium ficou como
contingência das corridas de julgamento.

## Equivalência entre candidatos (bancada de 2026-07-10)

Para verificar se a escolha do juiz enviesa o instrumento, três candidatos julgaram
a mesma amostra estratificada de 45 itens (18 excedentes do sistema, 18 erros do
especialista, 9 distratores; semente fixa 77), e a concordância foi medida par a par:

| Par de juízes | Concordância bruta | κ de Cohen | Interpretação (Landis e Koch) |
| --- | --- | --- | --- |
| Mistral Large × Mistral Medium | 0,867 | **0,700** | substancial |
| Mistral Large × Qwen3.7-plus | 0,844 | **0,644** | substancial |
| Mistral Medium × Qwen3.7-plus | 0,844 | **0,644** | substancial |

As taxas de aprovação são quase idênticas (67%, 67% e 69%): não há juiz
sistematicamente mais severo entre os candidatos. A concordância substancial
inclusive entre famílias distintas (Mistral × Qwen) indica que a escolha do
Mistral Large, feita por latência e custo, não introduz viés detectável de
veredito nesta amostra. A âncora definitiva de validade segue sendo a anotação
humana em curso.

## Auditoria com distratores difíceis (2026-07-10)

Endurecimento dos controles (P0-3): além da resposta correta e do valor absurdo,
cada exercício passou a incluir a forma não-canônica da resposta correta
(equivalente, ex.: 6/8 para 3/4) e o valor impossível no contexto (ex.: -3/4 de
um pão). Resultado nos 24 exercícios:

| Distrator | Aprovado como misconception (falha) | Comportamento esperado |
| --- | --- | --- |
| Resposta correta | 0/24 | rejeitar ("na_verdade_correta") |
| Valor absurdo (987654) | 0/24 | rejeitar ("implausível") |
| Impossível no contexto (negativo) | 1/24 | rejeitar ("impossível") |
| **Equivalente (não-canônico)** | **24/24** | rejeitar ("na_verdade_correta") |

O juiz de LLM não reconhece equivalência matemática na fronteira fina.
Verificação retrospectiva: a falha não contaminou os resultados publicados
(0 dos 669 excedentes julgados nas duas campanhas eram equivalentes aprovados).
Mitigação: guarda determinística pela âncora semântica do experimento
(`judge-misconceptions.js`), que resolve a classe por construção e é coberta
por teste. Lição registrada no relatório: controles negativos triviais provam
discriminação grosseira; a fronteira fina exige distratores difíceis, e o
instrumento final combina LLM (julgamento pedagógico) com guardas
determinísticas (equivalência matemática).
