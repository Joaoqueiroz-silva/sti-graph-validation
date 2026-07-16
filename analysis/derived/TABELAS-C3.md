# Tabelas geradas — campanha 3 (2026-07-13)

Protocolo congelado (Emenda 4). Unidade = exercício; permutação exata; Holm por família. Gerado por `analysis/reanalyze-c3.mjs`.

## Sumário por condição (média por exercício, IC95%)

| Condição | Modelo | Conceitual | R_bug (denominador congelado) | R_bug ancorável (sensibilidade) | R_ok | rOkCompleted (explorat.) | Concordância | Falhas | Custo |
|---|---|---|---|---|---|---|---|---|---|
| base-gemini | google/gemini-3.5-flash | 0.243 [0.163; 0.324] | 0.054 [0.016; 0.095] | 0.065 [0.02; 0.113] | 0 [0; 0] | 0.069 [0; 0.167] | 0.275 [0.254; 0.296] | 0 | US$ 1.599 |
| base-glm52 | z-ai/glm-5.2 | 0.178 [0.122; 0.236] | 0.04 [0.016; 0.068] | 0.048 [0.019; 0.08] | 0 [0; 0] | 0.042 [0; 0.111] | 0.299 [0.257; 0.343] | 0 | US$ 0.868 |
| base-dsv4pro | deepseek/deepseek-v4-pro | 0.199 [0.143; 0.26] | 0.023 [0.01; 0.036] | 0.027 [0.013; 0.044] | 0 [0; 0] | 0.097 [0.042; 0.167] | 0.284 [0.255; 0.311] | 0 | US$ 0.566 |
| miscdb-on | google/gemini-3.5-flash | 0.215 [0.152; 0.282] | 0.021 [0.005; 0.04] | 0.025 [0.006; 0.049] | 0 [0; 0] | 0.097 [0; 0.222] | 0.281 [0.254; 0.305] | 0 | US$ 1.695 |
| limite-6 | google/gemini-3.5-flash | 0.419 [0.342; 0.495] | 0.078 [0.028; 0.134] | 0.094 [0.037; 0.157] | 0 [0; 0] | 0.125 [0.042; 0.236] | 0.276 [0.253; 0.297] | 0 | US$ 2.285 |
| saturacao | google/gemini-3.5-flash | 0.238 [0.171; 0.307] | 0.042 [0.01; 0.082] | 0.05 [0.014; 0.096] | 0 [0; 0] | 0.083 [0; 0.194] | 0.278 [0.257; 0.299] | 0 | US$ 1.454 |
| repr-dom | google/gemini-3.5-flash | 0.207 [0.134; 0.279] | 0.028 [0.005; 0.056] | 0.033 [0.007; 0.066] | 0 [0; 0] | 0.292 [0.125; 0.472] | 0.294 [0.269; 0.323] | 0 | US$ 1.858 |
| repr-screenshot | google/gemini-3.5-flash | 0.251 [0.18; 0.324] | 0.023 [0.009; 0.036] | 0.03 [0.012; 0.049] | 0 [0; 0] | 0.014 [0; 0.042] | 0.331 [0.311; 0.353] | 0 | US$ 1.854 |
| chamada-unica | google/gemini-3.5-flash | 0.203 [0.147; 0.264] | 0.01 [0; 0.024] | 0.014 [0; 0.032] | 0 [0; 0] | 0 [0; 0] | 0.298 [0.291; 0.304] | 0 | US$ 0.556 |

**Denominador de R_bug.** O estimando congelado inclui 8 ações buggy por exercício: 192 ações únicas por réplica e 576 avaliações por condição nas três réplicas. A coluna ancorável preserva, como sensibilidade, o filtro implementado no runner (150 ações únicas por réplica; 450 avaliações por condição). O numerador reconhecido permanece o mesmo; as ações anteriormente excluídas voltam ao denominador como não reconhecidas sob a regra executada. O numerador foi reconstruído da taxa ancorável armazenada, com erro máximo de arredondamento de 0.003 ação.

| Condição | Reconhecidas | Denominador congelado | R_bug micro | Denominador ancorável | Sensibilidade micro |
|---|---:|---:|---:|---:|---:|
| base-gemini | 31 | 576 | 0.054 | 450 | 0.069 |
| base-glm52 | 23 | 576 | 0.04 | 450 | 0.051 |
| base-dsv4pro | 13 | 576 | 0.023 | 450 | 0.029 |
| miscdb-on | 12 | 576 | 0.021 | 450 | 0.027 |
| limite-6 | 45 | 576 | 0.078 | 450 | 0.1 |
| saturacao | 24 | 576 | 0.042 | 450 | 0.053 |
| repr-dom | 16 | 576 | 0.028 | 450 | 0.036 |
| repr-screenshot | 13 | 576 | 0.023 | 450 | 0.029 |
| chamada-unica | 6 | 576 | 0.01 | 450 | 0.013 |

## Integridade estrutural observada na campanha 3

| Condição | Grafos | Grafos com violação dura | Violações duras | Grafos com sinal mole | Sinais moles | Barrados |
|---|---:|---:|---:|---:|---:|---:|
| base-gemini | 72 | 0 | 0 | 0 | 0 | 0 |
| base-glm52 | 72 | 0 | 0 | 0 | 0 | 0 |
| base-dsv4pro | 72 | 0 | 0 | 0 | 0 | 0 |
| miscdb-on | 72 | 0 | 0 | 0 | 0 | 0 |
| limite-6 | 72 | 0 | 0 | 61 | 61 | 0 |
| saturacao | 72 | 0 | 0 | 0 | 0 | 0 |
| repr-dom | 72 | 0 | 0 | 0 | 0 | 0 |
| repr-screenshot | 72 | 0 | 0 | 0 | 0 | 0 |
| chamada-unica | 72 | 0 | 0 | 1 | 1 | 0 |
| **Total** | **648** | **0** | **0** | **62** | **62** | **0** |

Os relatórios C3 preservam a contagem, mas não a classe de cada sinal mole; portanto não é possível distinguir retrospectivamente over-branching, ausência de scaffold, self-loop ou aresta paralela sem reter o grafo autorado.

## F1 — coprimárias comportamentais, braços × baseline (Holm m=4)

| Comparação | Δ | IC95% | p exato | p-Holm | Rejeita |
|---|---|---|---|---|---|
| base-glm52 vs base-gemini · rBug | -0.014 | [-0.038; 0.009] | 0.3516 | 1.0000 | não |
| base-dsv4pro vs base-gemini · rBug | -0.031 | [-0.069; 0.003] | 0.1436 | 0.5742 | não |
| base-glm52 vs base-gemini · rOk | 0 | [0; 0] | 1.0000 | 1.0000 | não |
| base-dsv4pro vs base-gemini · rOk | 0 | [0; 0] | 1.0000 | 1.0000 | não |

## F2 — ablações × baseline, completude conceitual (Holm m=6)

| Comparação | Δ | IC95% | p exato | p-Holm | Rejeita |
|---|---|---|---|---|---|
| miscdb-on vs base-gemini · conceitual | -0.028 | [-0.079; 0.021] | 0.2844 | 1.0000 | não |
| limite-6 vs base-gemini · conceitual | 0.177 | [0.123; 0.233] | 4.05e-6 | 2.43e-5 | sim |
| saturacao vs base-gemini · conceitual | -0.005 | [-0.057; 0.048] | 0.8572 | 1.0000 | não |
| repr-dom vs base-gemini · conceitual | -0.036 | [-0.087; 0.009] | 0.1875 | 0.9375 | não |
| repr-screenshot vs base-gemini · conceitual | 0.008 | [-0.046; 0.065] | 0.7858 | 1.0000 | não |
| chamada-unica vs base-gemini · conceitual | -0.04 | [-0.111; 0.032] | 0.2903 | 1.0000 | não |

## F3 — exploratória (comportamentais das ablações; Holm m=12)

| Comparação | Δ | IC95% | p exato | p-Holm | Rejeita |
|---|---|---|---|---|---|
| miscdb-on vs base-gemini · rBug | -0.033 | [-0.061; -0.009] | 0.0156 | 0.1719 | não |
| limite-6 vs base-gemini · rBug | 0.024 | [0; 0.052] | 0.1289 | 1.0000 | não |
| saturacao vs base-gemini · rBug | -0.012 | [-0.033; 0.007] | 0.3125 | 1.0000 | não |
| repr-dom vs base-gemini · rBug | -0.026 | [-0.062; 0.003] | 0.2109 | 1.0000 | não |
| repr-screenshot vs base-gemini · rBug | -0.031 | [-0.078; 0.01] | 0.2422 | 1.0000 | não |
| chamada-unica vs base-gemini · rBug | -0.043 | [-0.087; -0.003] | 0.0938 | 0.8438 | não |
| miscdb-on vs base-gemini · concordancia | 0.005 | [-0.003; 0.017] | 0.3853 | 1.0000 | não |
| limite-6 vs base-gemini · concordancia | 0 | [-0.002; 0.003] | 0.7612 | 1.0000 | não |
| saturacao vs base-gemini · concordancia | 0.003 | [-0.001; 0.009] | 0.3398 | 1.0000 | não |
| repr-dom vs base-gemini · concordancia | 0.019 | [-0.005; 0.047] | 0.1795 | 1.0000 | não |
| repr-screenshot vs base-gemini · concordancia | 0.056 | [0.033; 0.079] | 7.96e-5 | 9.56e-4 | sim |
| chamada-unica vs base-gemini · concordancia | 0.023 | [0.001; 0.045] | 0.0665 | 0.6647 | não |

## F4 — pós-hoc exploratória, braços × baseline em cobertura conceitual (Holm m=2)

| Comparação | Δ | IC95% não ajustado | p exato | p-Holm | Rejeita |
|---|---|---|---|---|---|
| base-glm52 vs base-gemini · conceitual (post-hoc) | -0.065 | [-0.129; -0.006] | 0.0475 | 0.0950 | não |
| base-dsv4pro vs base-gemini · conceitual (post-hoc) | -0.044 | [-0.103; 0.013] | 0.1704 | 0.1704 | não |

## Curva de ensemble (K=1..10, envelope v2, rotação)

| K | Cobertura conceitual |
|---|---|
| 1 | 23.7% |
| 2 | 31.2% |
| 3 | 35.3% |
| 4 | 38.3% |
| 5 | 40.6% |
| 6 | 42.3% |
| 7 | 43.8% |
| 8 | 44.9% |
| 9 | 46.0% |
| 10 | 46.9% |

## Painel de juízes (179 itens congelados dos braços multimodelo)

Composição efetivamente julgada: 83 itens do especialista, 96 distratores e 0 extras do robô. Como não há extras do robô neste artefato, o painel mede concordância sobre calibração e controles, NÃO sobre as saídas adicionais do sistema; essa avaliação requer nova execução do painel com o extrator corrigido.

κ par a par: [{"a":"mistral-large-2512","b":"qwen3-7-plus","n":179,"agreement":0.866,"kappa":0.723},{"a":"mistral-large-2512","b":"llama-4-maverick","n":179,"agreement":0.86,"kappa":0.704},{"a":"qwen3-7-plus","b":"llama-4-maverick","n":179,"agreement":0.782,"kappa":0.547}]

Pendências (itens sem veredito de algum juiz): {"totalVereditosNulos":0,"itensComPendencia":0,"porJuiz":{"mistral-large-2512":0,"qwen3-7-plus":0,"llama-4-maverick":0}}
