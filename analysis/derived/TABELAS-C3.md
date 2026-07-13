# Tabelas geradas — campanha 3 (2026-07-13)

Protocolo congelado (Emenda 4). Unidade = exercício; permutação exata; Holm por família. Gerado por `analysis/reanalyze-c3.mjs`.

## Sumário por condição (média por exercício, IC95%)

| Condição | Modelo | Conceitual | R_bug | R_ok | Concordância | Falhas | Custo |
|---|---|---|---|---|---|---|---|
| base-gemini | google/gemini-3.5-flash | 0.243 [0.163; 0.324] | 0.065 [0.02; 0.113] | 0 [0; 0] | 0.275 [0.254; 0.296] | 0 | US$ 1.599 |
| base-glm52 | z-ai/glm-5.2 | 0.178 [0.122; 0.236] | 0.048 [0.019; 0.08] | 0 [0; 0] | 0.299 [0.257; 0.343] | 0 | US$ 0.868 |
| base-dsv4pro | deepseek/deepseek-v4-pro | 0.199 [0.143; 0.26] | 0.027 [0.013; 0.044] | 0 [0; 0] | 0.284 [0.255; 0.311] | 0 | US$ 0.566 |
| miscdb-on | google/gemini-3.5-flash | 0.215 [0.152; 0.282] | 0.025 [0.006; 0.049] | 0 [0; 0] | 0.281 [0.254; 0.305] | 0 | US$ 1.695 |
| limite-6 | google/gemini-3.5-flash | 0.419 [0.342; 0.495] | 0.094 [0.037; 0.157] | 0 [0; 0] | 0.276 [0.253; 0.297] | 0 | US$ 2.285 |
| saturacao | google/gemini-3.5-flash | 0.238 [0.171; 0.307] | 0.05 [0.014; 0.096] | 0 [0; 0] | 0.278 [0.257; 0.299] | 0 | US$ 1.454 |
| repr-dom | google/gemini-3.5-flash | 0.207 [0.134; 0.279] | 0.033 [0.007; 0.066] | 0 [0; 0] | 0.294 [0.269; 0.323] | 0 | US$ 1.858 |
| repr-screenshot | google/gemini-3.5-flash | 0.251 [0.18; 0.324] | 0.03 [0.012; 0.049] | 0 [0; 0] | 0.331 [0.311; 0.353] | 0 | US$ 1.854 |
| chamada-unica | google/gemini-3.5-flash | 0.203 [0.147; 0.264] | 0.014 [0; 0.032] | 0 [0; 0] | 0.298 [0.291; 0.304] | 0 | US$ 0.556 |

## F1 — coprimárias comportamentais, braços × baseline (Holm m=4)

| Comparação | Δ | IC95% | p exato | p-Holm | Rejeita |
|---|---|---|---|---|---|
| base-glm52 vs base-gemini · rBug | -0.017 | [-0.048; 0.012] | 0.3362 | 1.0000 | não |
| base-dsv4pro vs base-gemini · rBug | -0.037 | [-0.081; 0.003] | 0.1104 | 0.4414 | não |
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
| miscdb-on vs base-gemini · rBug | -0.039 | [-0.071; -0.012] | 0.0156 | 0.1719 | não |
| limite-6 vs base-gemini · rBug | 0.029 | [0.001; 0.062] | 0.0742 | 0.6680 | não |
| saturacao vs base-gemini · rBug | -0.015 | [-0.039; 0.007] | 0.2813 | 1.0000 | não |
| repr-dom vs base-gemini · rBug | -0.031 | [-0.073; 0.003] | 0.1484 | 1.0000 | não |
| repr-screenshot vs base-gemini · rBug | -0.034 | [-0.09; 0.014] | 0.2598 | 1.0000 | não |
| chamada-unica vs base-gemini · rBug | -0.051 | [-0.101; -0.005] | 0.0859 | 0.6875 | não |
| miscdb-on vs base-gemini · concordancia | 0.005 | [-0.003; 0.017] | 0.3853 | 1.0000 | não |
| limite-6 vs base-gemini · concordancia | 0 | [-0.002; 0.003] | 0.7612 | 1.0000 | não |
| saturacao vs base-gemini · concordancia | 0.003 | [-0.001; 0.009] | 0.3398 | 1.0000 | não |
| repr-dom vs base-gemini · concordancia | 0.019 | [-0.005; 0.047] | 0.1795 | 1.0000 | não |
| repr-screenshot vs base-gemini · concordancia | 0.056 | [0.033; 0.079] | 7.96e-5 | 9.56e-4 | sim |
| chamada-unica vs base-gemini · concordancia | 0.023 | [0.001; 0.045] | 0.0665 | 0.6647 | não |

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

κ par a par: [{"a":"mistral-large-2512","b":"qwen3-7-plus","n":179,"agreement":0.866,"kappa":0.723},{"a":"mistral-large-2512","b":"llama-4-maverick","n":179,"agreement":0.86,"kappa":0.704},{"a":"qwen3-7-plus","b":"llama-4-maverick","n":179,"agreement":0.782,"kappa":0.547}]

Pendências (itens sem veredito de algum juiz): {"totalVereditosNulos":0,"itensComPendencia":0,"porJuiz":{"mistral-large-2512":0,"qwen3-7-plus":0,"llama-4-maverick":0}}
