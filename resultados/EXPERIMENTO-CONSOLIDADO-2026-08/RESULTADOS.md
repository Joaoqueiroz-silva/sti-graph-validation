# Experimento consolidado — validação de grafos de comportamento contra especialistas do CTAT/Mathtutor

Gerado em 2026-08-16T17:07 por `analysis/bancada-v2/consolidar-corpora.mjs`. Um único desenho
(problema + interface do especialista → agents 3 → GraphForge passos-livres → agent 6/7; régua de estados por
Actor/LCS; gate estrito) aplicado a **1 corpus/corpora**: 6.17 Fraction Identification (frac-numberline-6.17).

## Por corpus × braço (grafo materializado, aprovados no gate estrito; BCa 95 % em cluster de exercício)

| corpus | braço | n grafos (ex.) | gate estrito | cobertura em ordem (LCS) | sem ordem | caminho íntegro | erros no estado certo | estados/grafo |
|---|---|---|---|---|---|---|---|---|
| 6.17 Fraction Identification (frac-numberline-6.17) | flash-lite (alunos) | 60 (22) | 83 % | 0.771 [0.746; 0.823] | 0.988 [0.955; 1.000] | 0.100 [0.000; 0.299] | 0.302 [0.256; 0.343] | 5.72 |
| 6.17 Fraction Identification (frac-numberline-6.17) | qwen (alunos) | 55 (23) | 76 % | 0.932 [0.875; 0.968] | 1.000 [1.000; 1.000] | 0.745 [0.541; 0.878] | 0.647 [0.567; 0.737] | 6.91 |

## Agregado por braço (pool de todos os grafos aprovados; bootstrap estratificado por corpus, cluster = exercício, 10k, seed 42; percentil)

| braço | métrica | pool [IC 95 %] | n grafos | média entre corpora | amplitude entre corpora | corpora |
|---|---|---|---|---|---|---|
| flash-lite (alunos) | coberturaEstados | 0.771 [0.742; 0.810] | 60 | 0.771 | 0.771 – 0.771 | 1 |
| flash-lite (alunos) | coberturaSemOrdem | 0.988 [0.967; 1.000] | 60 | 0.988 | 0.988 – 0.988 | 1 |
| flash-lite (alunos) | caminhoIntegro | 0.100 [0.000; 0.250] | 60 | 0.100 | 0.100 – 0.100 | 1 |
| flash-lite (alunos) | errosNoEstadoCerto | 0.302 [0.258; 0.345] | 60 | 0.302 | 0.302 – 0.302 | 1 |
| qwen (alunos) | coberturaEstados | 0.932 [0.884; 0.973] | 55 | 0.932 | 0.932 – 0.932 | 1 |
| qwen (alunos) | coberturaSemOrdem | 1.000 [1.000; 1.000] | 55 | 1.000 | 1.000 – 1.000 | 1 |
| qwen (alunos) | caminhoIntegro | 0.745 [0.569; 0.895] | 55 | 0.745 | 0.745 – 0.745 | 1 |
| qwen (alunos) | errosNoEstadoCerto | 0.647 [0.562; 0.732] | 55 | 0.647 | 0.647 – 0.647 | 1 |

Fontes primárias: `materializado-*.analise.json` de cada pasta listada em `CORPORA` (consolidar-corpora.mjs). Corpora ainda não concluídos não aparecem; a tabela é regenerada a cada corpus fechado.
