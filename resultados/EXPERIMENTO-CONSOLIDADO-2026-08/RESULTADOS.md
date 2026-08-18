# Experimento consolidado — validação de grafos de comportamento contra especialistas do CTAT/Mathtutor

Gerado em 2026-08-18T14:16 por `analysis/bancada-v2/consolidar-corpora.mjs`. Um único desenho
(problema + interface do especialista → agents 3 → GraphForge passos-livres → agent 6/7 espelhados da PRODUÇÃO
atual, commit 132c645; régua de estados por Actor/LCS) aplicado a **3 corpus/corpora**: 6.17 Fraction Identification (frac-numberline-6.17); 6.19 Fractions and Estimates (frac-estimates-6.19); 6.18 Equivalent Fractions (equiv-fractions-6.18).

## Por corpus × braço (grafo materializado; recorte = aprovados na sensibilidade 3 do gate; BCa 95 % em cluster de exercício; entre parênteses, o valor em TODOS os grafos)

| corpus | braço | n grafos (ex.) / todos | gate estrito · sens. 3 | cobertura em ordem (LCS) | sem ordem | caminho íntegro | erros no estado certo | estados/grafo |
|---|---|---|---|---|---|---|---|---|
| 6.17 Fraction Identification (frac-numberline-6.17) | flash-lite (alunos) | 71 (24) / 72 | 89 % · 99 % | 0.782 [0.757; 0.824] (0.781) | 0.979 [0.938; 0.996] (0.979) | 0.141 [0.043; 0.306] (0.139) | 0.274 [0.234; 0.319] (0.273) | 5.70 |
| 6.17 Fraction Identification (frac-numberline-6.17) | qwen (alunos) | 70 (24) / 72 | 83 % · 97 % | 0.936 [0.893; 0.965] (0.938) | 1.000 [1.000; 1.000] (1.000) | 0.743 [0.571; 0.859] (0.750) | 0.640 [0.558; 0.716] (0.650) | 6.96 |
| 6.19 Fractions and Estimates (frac-estimates-6.19) | flash-lite (alunos) | 65 (23) / 69 | 13 % · 94 % | 0.712 [0.647; 0.754] (0.707) | 0.860 [0.808; 0.907] (0.855) | 0.108 [0.046; 0.179] (0.101) | 0.405 [0.321; 0.498] (0.396) | 5.37 |
| 6.19 Fractions and Estimates (frac-estimates-6.19) | qwen (alunos) | 61 (23) / 69 | 20 % · 88 % | 0.742 [0.697; 0.778] (0.729) | 0.846 [0.808; 0.882] (0.843) | 0.098 [0.032; 0.224] (0.087) | 0.716 [0.611; 0.804] (0.691) | 8.30 |
| 6.18 Equivalent Fractions (equiv-fractions-6.18) | flash-lite (alunos) | 57 (20) / 60 | 88 % · 95 % | 0.953 [0.917; 0.977] (0.939) | 0.971 [0.930; 0.989] (0.956) | 0.860 [0.749; 0.930] (0.817) | N/A (não avaliável) | 5.51 |
| 6.18 Equivalent Fractions (equiv-fractions-6.18) | qwen (alunos) | 55 (20) / 60 | 68 % · 92 % | 1.000 [1.000; 1.000] (1.000) | 1.000 [1.000; 1.000] (1.000) | 1.000 [1.000; 1.000] (1.000) | N/A (não avaliável) | 8.02 |

## Agregado por braço (pool de todos os grafos aprovados; bootstrap estratificado por corpus, cluster = exercício, 10k, seed 42; percentil)

| braço | métrica | pool [IC 95 %] | n grafos | média entre corpora | amplitude entre corpora | corpora |
|---|---|---|---|---|---|---|
| flash-lite (alunos) | coberturaEstados | 0.809 [0.786; 0.831] | 193 | 0.815 | 0.712 – 0.953 | 3 |
| flash-lite (alunos) | coberturaSemOrdem | 0.937 [0.916; 0.956] | 193 | 0.937 | 0.860 – 0.979 | 3 |
| flash-lite (alunos) | caminhoIntegro | 0.342 [0.288; 0.401] | 193 | 0.369 | 0.108 – 0.860 | 3 |
| flash-lite (alunos) | errosNoEstadoCerto | 0.337 [0.290; 0.386] | 136 | 0.339 | 0.274 – 0.405 | 2 |
| qwen (alunos) | coberturaEstados | 0.891 [0.873; 0.909] | 186 | 0.893 | 0.742 – 1.000 | 3 |
| qwen (alunos) | coberturaSemOrdem | 0.949 [0.938; 0.961] | 186 | 0.949 | 0.846 – 1.000 | 3 |
| qwen (alunos) | caminhoIntegro | 0.608 [0.543; 0.670] | 186 | 0.614 | 0.098 – 1.000 | 3 |
| qwen (alunos) | errosNoEstadoCerto | 0.675 [0.612; 0.737] | 131 | 0.678 | 0.640 – 0.716 | 2 |

Fontes primárias: `materializado-*.analise.json` de cada pasta listada em `CORPORA` (consolidar-corpora.mjs). Corpora ainda não concluídos não aparecem; a tabela é regenerada a cada corpus fechado.
