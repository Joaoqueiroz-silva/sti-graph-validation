# Experimento consolidado — validação de grafos de comportamento contra especialistas do CTAT/Mathtutor

Gerado em 2026-08-19T00:24 por `analysis/bancada-v2/consolidar-corpora.mjs`. Um único desenho
(problema + interface do especialista → agents 3 → GraphForge passos-livres → agent 6/7 espelhados da PRODUÇÃO
atual, commit 132c645; régua de estados por Actor/LCS) aplicado a **5 corpus/corpora**: 6.17 Fraction Identification (frac-numberline-6.17); 6.19 Fractions and Estimates (frac-estimates-6.19); 6.18 Equivalent Fractions (equiv-fractions-6.18); 6.20 Fraction Ordering (fraction-ordering-6.20); 8.12 Factors, Scaling, and Percents (8.12).

## Por corpus × braço (grafo materializado; recorte = aprovados no gate por ENUNCIADO; BCa 95 % em cluster de exercício; entre parênteses, o valor em TODOS os grafos)

| corpus | braço | n grafos (ex.) / todos | gate enunciado · estrito (valores) | cobertura em ordem (LCS) | sem ordem | caminho íntegro | erros no estado certo | estados/grafo |
|---|---|---|---|---|---|---|---|---|
| 6.17 Fraction Identification (frac-numberline-6.17) | flash-lite (alunos) | 72 (24) / 72 | 100 % · 89 % | 0.781 [0.753; 0.819] (0.781) | 0.979 [0.934; 0.993] (0.979) | 0.139 [0.042; 0.292] (0.139) | 0.273 [0.234; 0.319] (0.273) | 5.71 |
| 6.17 Fraction Identification (frac-numberline-6.17) | qwen (alunos) | 72 (24) / 72 | 100 % · 83 % | 0.938 [0.892; 0.965] (0.938) | 1.000 [0.858; 1.000] (1.000) | 0.750 [0.569; 0.861] (0.750) | 0.650 [0.567; 0.729] (0.650) | 6.97 |
| 6.19 Fractions and Estimates (frac-estimates-6.19) | flash-lite (alunos) | 69 (23) / 69 | 100 % · 13 % | 0.707 [0.638; 0.750] (0.707) | 0.855 [0.801; 0.899] (0.855) | 0.101 [0.029; 0.159] (0.101) | 0.396 [0.314; 0.486] (0.396) | 5.41 |
| 6.19 Fractions and Estimates (frac-estimates-6.19) | qwen (alunos) | 69 (23) / 69 | 100 % · 20 % | 0.729 [0.678; 0.767] (0.729) | 0.843 [0.803; 0.878] (0.843) | 0.087 [0.014; 0.188] (0.087) | 0.691 [0.583; 0.785] (0.691) | 8.32 |
| 6.18 Equivalent Fractions (equiv-fractions-6.18) | flash-lite (alunos) | 60 (20) / 60 | 100 % · 88 % | 0.939 [0.894; 0.961] (0.939) | 0.956 [0.906; 0.978] (0.956) | 0.817 [0.683; 0.883] (0.817) | N/A (não avaliável) | 5.52 |
| 6.18 Equivalent Fractions (equiv-fractions-6.18) | qwen (alunos) | 60 (20) / 60 | 100 % · 68 % | 1.000 [0.832; 1.000] (1.000) | 1.000 [0.832; 1.000] (1.000) | 1.000 [0.832; 1.000] (1.000) | N/A (não avaliável) | 8.10 |
| 6.20 Fraction Ordering (fraction-ordering-6.20) | flash-lite (alunos) | 57 (19) / 57 | 100 % · 98 % | 0.926 [0.888; 0.958] (0.926) | 0.926 [0.888; 0.958] (0.926) | 0.632 [0.421; 0.789] (0.632) | 0.297 [0.219; 0.373] (0.297) | 6.09 |
| 6.20 Fraction Ordering (fraction-ordering-6.20) | qwen (alunos) | 57 (19) / 57 | 100 % · 88 % | 0.947 [0.909; 0.972] (0.947) | 0.947 [0.909; 0.972] (0.947) | 0.737 [0.526; 0.860] (0.737) | 0.624 [0.545; 0.697] (0.624) | 8.12 |
| 8.12 Factors, Scaling, and Percents (8.12) | flash-lite (alunos) | 57 (19) / 57 | 100 % · 11 % | 0.087 [0.064; 0.107] (0.087) | 0.292 [0.224; 0.344] (0.292) | 0.000 [0.000; 0.176] (0.000) | 0.000 [0.000; 0.176] (0.000) | 5.11 |
| 8.12 Factors, Scaling, and Percents (8.12) | qwen (alunos) | 57 (19) / 57 | 100 % · 0 % | 0.300 [0.283; 0.320] (0.300) | 0.694 [0.664; 0.716] (0.694) | 0.000 [0.000; 0.176] (0.000) | 0.033 [0.017; 0.061] (0.033) | 12.12 |

## Agregado por braço (pool de todos os grafos aprovados; bootstrap estratificado por corpus, cluster = exercício, 10k, seed 42; percentil)

| braço | métrica | pool [IC 95 %] | n grafos | média entre corpora | amplitude entre corpora | corpora |
|---|---|---|---|---|---|---|
| flash-lite (alunos) | coberturaEstados | 0.696 [0.679; 0.712] | 315 | 0.688 | 0.087 – 0.939 | 5 |
| flash-lite (alunos) | coberturaSemOrdem | 0.814 [0.795; 0.831] | 315 | 0.802 | 0.292 – 0.979 | 5 |
| flash-lite (alunos) | caminhoIntegro | 0.324 [0.276; 0.371] | 315 | 0.338 | 0.000 – 0.817 | 5 |
| flash-lite (alunos) | errosNoEstadoCerto | 0.251 [0.220; 0.282] | 255 | 0.242 | 0.000 – 0.396 | 4 |
| qwen (alunos) | coberturaEstados | 0.790 [0.776; 0.804] | 315 | 0.783 | 0.300 – 1.000 | 5 |
| qwen (alunos) | coberturaSemOrdem | 0.901 [0.890; 0.911] | 315 | 0.897 | 0.694 – 1.000 | 5 |
| qwen (alunos) | caminhoIntegro | 0.514 [0.467; 0.559] | 315 | 0.515 | 0.000 – 1.000 | 5 |
| qwen (alunos) | errosNoEstadoCerto | 0.517 [0.478; 0.557] | 255 | 0.500 | 0.033 – 0.691 | 4 |

Fontes primárias: `materializado-*.analise.json` de cada pasta listada em `CORPORA` (consolidar-corpora.mjs). Corpora ainda não concluídos não aparecem; a tabela é regenerada a cada corpus fechado.
