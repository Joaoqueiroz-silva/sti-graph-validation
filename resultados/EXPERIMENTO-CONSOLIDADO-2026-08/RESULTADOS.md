# Experimento consolidado — validação de grafos de comportamento contra especialistas do CTAT/Mathtutor

Gerado em 2026-08-18T19:42 por `analysis/bancada-v2/consolidar-corpora.mjs`. Um único desenho
(problema + interface do especialista → agents 3 → GraphForge passos-livres → agent 6/7 espelhados da PRODUÇÃO
atual, commit 132c645; régua de estados por Actor/LCS) aplicado a **4 corpus/corpora**: 6.17 Fraction Identification (frac-numberline-6.17); 6.19 Fractions and Estimates (frac-estimates-6.19); 6.18 Equivalent Fractions (equiv-fractions-6.18); 6.20 Fraction Ordering (fraction-ordering-6.20).

## Por corpus × braço (grafo materializado; recorte = aprovados na sensibilidade 3 do gate; BCa 95 % em cluster de exercício; entre parênteses, o valor em TODOS os grafos)

| corpus | braço | n grafos (ex.) / todos | gate estrito · sens. 3 | cobertura em ordem (LCS) | sem ordem | caminho íntegro | erros no estado certo | estados/grafo |
|---|---|---|---|---|---|---|---|---|
| 6.17 Fraction Identification (frac-numberline-6.17) | flash-lite (alunos) | 71 (24) / 72 | 89 % · 99 % | 0.782 [0.757; 0.824] (0.781) | 0.979 [0.938; 0.996] (0.979) | 0.141 [0.043; 0.306] (0.139) | 0.274 [0.234; 0.319] (0.273) | 5.70 |
| 6.17 Fraction Identification (frac-numberline-6.17) | qwen (alunos) | 70 (24) / 72 | 83 % · 97 % | 0.936 [0.893; 0.965] (0.938) | 1.000 [1.000; 1.000] (1.000) | 0.743 [0.571; 0.859] (0.750) | 0.640 [0.558; 0.716] (0.650) | 6.96 |
| 6.19 Fractions and Estimates (frac-estimates-6.19) | flash-lite (alunos) | 65 (23) / 69 | 13 % · 94 % | 0.712 [0.647; 0.754] (0.707) | 0.860 [0.808; 0.907] (0.855) | 0.108 [0.046; 0.179] (0.101) | 0.405 [0.321; 0.498] (0.396) | 5.37 |
| 6.19 Fractions and Estimates (frac-estimates-6.19) | qwen (alunos) | 61 (23) / 69 | 20 % · 88 % | 0.742 [0.697; 0.778] (0.729) | 0.846 [0.808; 0.882] (0.843) | 0.098 [0.032; 0.224] (0.087) | 0.716 [0.611; 0.804] (0.691) | 8.30 |
| 6.18 Equivalent Fractions (equiv-fractions-6.18) | flash-lite (alunos) | 57 (20) / 60 | 88 % · 95 % | 0.953 [0.917; 0.977] (0.939) | 0.971 [0.930; 0.989] (0.956) | 0.860 [0.749; 0.930] (0.817) | N/A (não avaliável) | 5.51 |
| 6.18 Equivalent Fractions (equiv-fractions-6.18) | qwen (alunos) | 55 (20) / 60 | 68 % · 92 % | 1.000 [1.000; 1.000] (1.000) | 1.000 [1.000; 1.000] (1.000) | 1.000 [1.000; 1.000] (1.000) | N/A (não avaliável) | 8.02 |
| 6.20 Fraction Ordering (fraction-ordering-6.20) | flash-lite (alunos) | 57 (19) / 57 | 98 % · 100 % | 0.926 [0.888; 0.958] (0.926) | 0.926 [0.888; 0.958] (0.926) | 0.632 [0.421; 0.789] (0.632) | 0.297 [0.219; 0.373] (0.297) | 6.09 |
| 6.20 Fraction Ordering (fraction-ordering-6.20) | qwen (alunos) | 52 (19) / 57 | 88 % · 91 % | 0.946 [0.907; 0.973] (0.947) | 0.946 [0.907; 0.973] (0.947) | 0.731 [0.534; 0.865] (0.737) | 0.619 [0.538; 0.696] (0.624) | 8.13 |

## Agregado por braço (pool de todos os grafos aprovados; bootstrap estratificado por corpus, cluster = exercício, 10k, seed 42; percentil)

| braço | métrica | pool [IC 95 %] | n grafos | média entre corpora | amplitude entre corpora | corpora |
|---|---|---|---|---|---|---|
| flash-lite (alunos) | coberturaEstados | 0.836 [0.816; 0.855] | 250 | 0.843 | 0.712 – 0.953 | 4 |
| flash-lite (alunos) | coberturaSemOrdem | 0.934 [0.916; 0.951] | 250 | 0.934 | 0.860 – 0.979 | 4 |
| flash-lite (alunos) | caminhoIntegro | 0.408 [0.348; 0.469] | 250 | 0.435 | 0.108 – 0.860 | 4 |
| flash-lite (alunos) | errosNoEstadoCerto | 0.325 [0.284; 0.367] | 193 | 0.325 | 0.274 – 0.405 | 3 |
| qwen (alunos) | coberturaEstados | 0.903 [0.887; 0.919] | 238 | 0.906 | 0.742 – 1.000 | 4 |
| qwen (alunos) | coberturaSemOrdem | 0.949 [0.937; 0.960] | 238 | 0.948 | 0.846 – 1.000 | 4 |
| qwen (alunos) | caminhoIntegro | 0.634 [0.573; 0.695] | 238 | 0.643 | 0.098 – 1.000 | 4 |
| qwen (alunos) | errosNoEstadoCerto | 0.659 [0.610; 0.709] | 183 | 0.658 | 0.619 – 0.716 | 3 |

Fontes primárias: `materializado-*.analise.json` de cada pasta listada em `CORPORA` (consolidar-corpora.mjs). Corpora ainda não concluídos não aparecem; a tabela é regenerada a cada corpus fechado.
