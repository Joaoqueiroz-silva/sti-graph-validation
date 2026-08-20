# Experimento consolidado — validação de grafos de comportamento contra especialistas do CTAT/Mathtutor

Gerado em 2026-08-20T14:53 por `analysis/bancada-v2/consolidar-corpora.mjs`. Um único desenho
(problema + interface do especialista → agents 3 → GraphForge passos-livres → agent 6/7 espelhados da PRODUÇÃO
atual, commit 5263488 com registro de componentes completo; régua de estados por Actor/LCS) aplicado a **5 corpus/corpora**: 6.17 Fraction Identification (frac-numberline-6.17); 6.19 Fractions and Estimates (frac-estimates-6.19); 6.18 Equivalent Fractions (equiv-fractions-6.18); 6.20 Fraction Ordering (fraction-ordering-6.20); 8.12 Factors, Scaling, and Percents (8.12).

## Por corpus × braço (grafo materializado; recorte = aprovados no gate por ENUNCIADO; IC 95 % em cluster de exercício; entre parênteses, o valor em TODOS os grafos)

| corpus | braço | n grafos (ex.) / todos | gate enunciado · estrito (valores) | cobertura em ordem (LCS) | sem ordem | caminho íntegro | erros no estado certo | estados/grafo |
|---|---|---|---|---|---|---|---|---|
| 6.17 Fraction Identification (frac-numberline-6.17) | flash-lite (alunos) | 72 (24) / 72 | 100 % · 85 % | 0.778 [0.753; 0.816] (0.778) | 0.986 [0.951; 0.993] (0.986) | 0.125 [0.028; 0.278] (0.125) | 0.299 [0.252; 0.350] (0.299) | 5.72 |
| 6.17 Fraction Identification (frac-numberline-6.17) | qwen (alunos) | 72 (24) / 72 | 100 % · 82 % | 0.941 [0.896; 0.969] (0.941) | 0.997 [0.976; 1.000] (0.997) | 0.764 [0.583; 0.875] (0.764) | 0.629 [0.553; 0.704] (0.629) | 6.96 |
| 6.19 Fractions and Estimates (frac-estimates-6.19) | flash-lite (alunos) | 69 (23) / 69 | 100 % · 9 % | 0.725 [0.659; 0.768] (0.725) | 0.841 [0.750; 0.902] (0.841) | 0.145 [0.072; 0.217] (0.145) | 0.442 [0.343; 0.543] (0.442) | 5.41 |
| 6.19 Fractions and Estimates (frac-estimates-6.19) | qwen (alunos) | 69 (23) / 69 | 100 % · 16 % | 0.728 [0.679; 0.760] (0.728) | 0.814 [0.746; 0.861] (0.814) | 0.072 [0.014; 0.130] (0.072) | 0.693 [0.568; 0.797] (0.693) | 8.32 |
| 6.18 Equivalent Fractions (equiv-fractions-6.18) | flash-lite (alunos) | 60 (20) / 60 | 100 % · 85 % | 0.961 [0.906; 0.983] (0.961) | 0.967 [0.911; 0.989] (0.967) | 0.883 [0.717; 0.950] (0.883) | N/A (não avaliável) | 5.52 |
| 6.18 Equivalent Fractions (equiv-fractions-6.18) | qwen (alunos) | 60 (20) / 60 | 100 % · 68 % | 0.989 [0.967; 1.000] (0.989) | 0.989 [0.967; 1.000] (0.989) | 0.967 [0.874; 0.983] (0.967) | N/A (não avaliável) | 8.10 |
| 6.20 Fraction Ordering (fraction-ordering-6.20) | flash-lite (alunos) | 57 (19) / 57 | 100 % · 100 % | 0.919 [0.877; 0.954] (0.919) | 0.919 [0.877; 0.954] (0.919) | 0.596 [0.386; 0.754] (0.596) | 0.306 [0.235; 0.376] (0.306) | 6.09 |
| 6.20 Fraction Ordering (fraction-ordering-6.20) | qwen (alunos) | 57 (19) / 57 | 100 % · 88 % | 0.933 [0.891; 0.961] (0.933) | 0.933 [0.891; 0.961] (0.933) | 0.667 [0.456; 0.807] (0.667) | 0.598 [0.525; 0.667] (0.598) | 8.12 |
| 8.12 Factors, Scaling, and Percents (8.12) | flash-lite (alunos) | 57 (19) / 57 | 100 % · 11 % | 0.087 [0.064; 0.107] (0.087) | 0.094 [0.069; 0.115] (0.094) | 0.000 [0.000; 0.176] (0.000) | 0.000 [0.000; 0.176] (0.000) | 5.11 |
| 8.12 Factors, Scaling, and Percents (8.12) | qwen (alunos) | 57 (19) / 57 | 100 % · 0 % | 0.300 [0.283; 0.320] (0.300) | 0.375 [0.347; 0.398] (0.375) | 0.000 [0.000; 0.176] (0.000) | 0.033 [0.017; 0.061] (0.033) | 12.12 |

## Agregado por braço (pool de todos os grafos aprovados; bootstrap estratificado por corpus, cluster = exercício, 10k, seed 42; percentil)

| braço | métrica | pool [IC 95 %] | n grafos | média entre corpora | amplitude entre corpora | corpora |
|---|---|---|---|---|---|---|
| flash-lite (alunos) | coberturaEstados | 0.702 [0.684; 0.719] | 315 | 0.694 | 0.087 – 0.961 | 5 |
| flash-lite (alunos) | coberturaSemOrdem | 0.777 [0.757; 0.796] | 315 | 0.761 | 0.094 – 0.986 | 5 |
| flash-lite (alunos) | caminhoIntegro | 0.337 [0.286; 0.387] | 315 | 0.350 | 0.000 – 0.883 | 5 |
| flash-lite (alunos) | errosNoEstadoCerto | 0.272 [0.239; 0.307] | 255 | 0.262 | 0.000 – 0.442 | 4 |
| qwen (alunos) | coberturaEstados | 0.786 [0.771; 0.800] | 315 | 0.778 | 0.300 – 0.989 | 5 |
| qwen (alunos) | coberturaSemOrdem | 0.831 [0.816; 0.845] | 315 | 0.822 | 0.375 – 0.997 | 5 |
| qwen (alunos) | caminhoIntegro | 0.495 [0.444; 0.543] | 315 | 0.494 | 0.000 – 0.967 | 5 |
| qwen (alunos) | errosNoEstadoCerto | 0.506 [0.464; 0.547] | 255 | 0.488 | 0.033 – 0.693 | 4 |

Fontes primárias: `materializado-*.analise.json` de cada pasta listada em `CORPORA` (consolidar-corpora.mjs). Corpora ainda não concluídos não aparecem; a tabela é regenerada a cada corpus fechado.
