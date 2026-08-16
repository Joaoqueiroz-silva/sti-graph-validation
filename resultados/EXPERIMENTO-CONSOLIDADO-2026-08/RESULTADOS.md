# Experimento consolidado — validação de grafos de comportamento contra especialistas do CTAT/Mathtutor

Gerado em 2026-08-16T20:51 por `analysis/bancada-v2/consolidar-corpora.mjs`. Um único desenho
(problema + interface do especialista → agents 3 → GraphForge passos-livres → agent 6/7; régua de estados por
Actor/LCS; gate estrito) aplicado a **2 corpus/corpora**: 6.17 Fraction Identification (frac-numberline-6.17); 6.19 Fractions and Estimates (frac-estimates-6.19).

## Por corpus × braço (grafo materializado; recorte = aprovados na sensibilidade 3 do gate; BCa 95 % em cluster de exercício; entre parênteses, o valor em TODOS os grafos)

| corpus | braço | n grafos (ex.) / todos | gate estrito · sens. 3 | cobertura em ordem (LCS) | sem ordem | caminho íntegro | erros no estado certo | estados/grafo |
|---|---|---|---|---|---|---|---|---|
| 6.17 Fraction Identification (frac-numberline-6.17) | flash-lite (alunos) | 71 (24) / 72 | 83 % · 99 % | 0.778 [0.754; 0.820] (0.778) | 0.986 [0.958; 0.996] (0.986) | 0.127 [0.042; 0.296] (0.125) | 0.289 [0.244; 0.325] (0.289) | 5.72 |
| 6.17 Fraction Identification (frac-numberline-6.17) | qwen (alunos) | 70 (24) / 72 | 76 % · 97 % | 0.939 [0.888; 0.971] (0.941) | 1.000 [1.000; 1.000] (1.000) | 0.771 [0.592; 0.887] (0.778) | 0.638 [0.561; 0.714] (0.645) | 6.91 |
| 6.19 Fractions and Estimates (frac-estimates-6.19) | flash-lite (alunos) | 63 (23) / 69 | 7 % · 91 % | 0.730 [0.658; 0.788] (0.725) | 0.872 [0.816; 0.918] (0.862) | 0.190 [0.092; 0.339] (0.174) | 0.421 [0.324; 0.525] (0.399) | 5.35 |
| 6.19 Fractions and Estimates (frac-estimates-6.19) | qwen (alunos) | 64 (23) / 69 | 14 % · 93 % | 0.723 [0.671; 0.754] (0.719) | 0.812 [0.770; 0.854] (0.813) | 0.063 [0.016; 0.132] (0.058) | 0.727 [0.611; 0.815] (0.708) | 8.25 |

## Agregado por braço (pool de todos os grafos aprovados; bootstrap estratificado por corpus, cluster = exercício, 10k, seed 42; percentil)

| braço | métrica | pool [IC 95 %] | n grafos | média entre corpora | amplitude entre corpora | corpora |
|---|---|---|---|---|---|---|
| flash-lite (alunos) | coberturaEstados | 0.756 [0.722; 0.789] | 134 | 0.754 | 0.730 – 0.778 | 2 |
| flash-lite (alunos) | coberturaSemOrdem | 0.932 [0.907; 0.956] | 134 | 0.929 | 0.872 – 0.986 | 2 |
| flash-lite (alunos) | caminhoIntegro | 0.157 [0.079; 0.248] | 134 | 0.159 | 0.127 – 0.190 | 2 |
| flash-lite (alunos) | errosNoEstadoCerto | 0.351 [0.300; 0.404] | 134 | 0.355 | 0.289 – 0.421 | 2 |
| qwen (alunos) | coberturaEstados | 0.836 [0.806; 0.863] | 134 | 0.831 | 0.723 – 0.939 | 2 |
| qwen (alunos) | coberturaSemOrdem | 0.910 [0.891; 0.930] | 134 | 0.906 | 0.812 – 1.000 | 2 |
| qwen (alunos) | caminhoIntegro | 0.433 [0.351; 0.511] | 134 | 0.417 | 0.063 – 0.771 | 2 |
| qwen (alunos) | errosNoEstadoCerto | 0.680 [0.616; 0.741] | 134 | 0.682 | 0.638 – 0.727 | 2 |

Fontes primárias: `materializado-*.analise.json` de cada pasta listada em `CORPORA` (consolidar-corpora.mjs). Corpora ainda não concluídos não aparecem; a tabela é regenerada a cada corpus fechado.
