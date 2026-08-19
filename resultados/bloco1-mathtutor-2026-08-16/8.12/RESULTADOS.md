# 8.12 Factors, Scaling, and Percents — resultados (18/08/2026)

Corpus: `datasets/factors-scaling-8.12` (19 problemas; Mathtutor/CMU). Tarefa:
uma TABELA de razões com 3 linhas (Total, Part 1, Part 2) × 8 células — razão
original, operação (× ou ÷), fator de escala e resultado sobre 100 (a
porcentagem). Pré-registro e adendo: `../PRE-REGISTRO.md`.

- 19 × 3 × 2 = 114 grafos coletados, 114 materializados, **0 falhas**.
  Custo: US$ 0,41 + 2,69 (alunos) + 0,36 + 0,46 (materialização) = **US$ 3,92**.
- **Referência: 24 estados de valor por problema** (uma célula por vez) e 11
  erros — contra 3–5 estados nos corpora de frações. É a granularidade mais
  fina do bloco.
- A materialização usou o espelho da produção **5263488** (registro de
  componentes completo); os demais corpora foram re-materializados na mesma
  versão para comparabilidade.

## 1. Obediência: por que o gate por VALORES não se aplica aqui

| Braço | gate por valores (estrito) | ... com todas as sensibilidades | **gate por ENUNCIADO** |
|---|---|---|---|
| flash-lite | 6/57 = 10,5 % | 6/57 | **57/57 = 100 %** |
| qwen | **0/57 = 0 %** | 0/57 | **57/57 = 100 %** |

O gate por valores pressupõe que todo valor de passo venha do enunciado — o que
vale para frações (numerador, denominador, a fração), mas **não** para uma
tarefa de cálculo em etapas. Aqui os passos trazem valores **derivados
legítimos**: `50` (fator de escala 5000/100), `100` (o denominador da
porcentagem, que é a tarefa), `0,5` e `0,08` (as porcentagens calculadas). O
gate os marca como "números estranhos" e reprova 57/57 do qwen — embora
**57/57 dos enunciados gerados estejam limpos**, isto é, o agent 6 usou o
problema do CTAT em todos os casos.

Consequência metodológica, aplicada a TODO o experimento: a obediência passa a
ser lida pelo **enunciado** que o agent 6 escreveu — a evidência direta de "usou
o problema do CTAT ou inventou outro?". Por esse critério a aprovação é
**100 % nos 630 grafos dos 5 corpora**, e o consolidado deixa de ter recorte
(usa todos os grafos). Os gates por valor seguem publicados como sensibilidade.

## 2. Régua de estados (todos os 57 grafos por braço)

| Métrica | flash-lite | qwen |
|---|---|---|
| cobertura de estados em ordem (LCS) | 0,087 [0,064; 0,107] | **0,300 [0,283; 0,320]** |
| cobertura sem ordem | 0,292 [0,224; 0,344] | 0,694 [0,664; 0,716] |
| caminho íntegro | 0,000 [0; 0,176] | 0,000 [0; 0,176] |
| erros no estado certo | 0,000 [0; 0,176] | 0,033 [0,017; 0,061] |
| estados/grafo (**referência = 24**) | 5,11 | 12,12 |

Linha de base de acaso (qwen): base 0,192 · **ajustada 0,134** · precisão 0,772 ·
**F1 0,427**. A cobertura de 0,300 está acima do acaso (IC da ajustada não toca
zero), mas é a mais baixa do experimento por larga margem.

## 3. Leitura honesta — o limite do método

1. **Os agentes AGREGAM.** O especialista trata cada célula da tabela como um
   passo (24); os agentes produzem 5,1 (flash-lite) e 12,1 (qwen) passos que
   cobrem a tabela em blocos ("preencher as razões originais", "identificar os
   fatores de escala"). Não é falta de compreensão da tarefa — os traces citam a
   tabela 45–52 vezes e o enunciado é obedecido em 100 % —, é **granularidade**.
2. **Mais decomposição, mais cobertura**: o qwen, com 2,4× mais estados que o
   flash-lite, cobre 3,4× mais (0,300 vs 0,087). A relação é direta e o
   contraste entre braços é o mais forte do bloco.
3. **Caminho íntegro = 0 nos dois braços**: reproduzir 24 estados na ordem exata
   está fora do alcance de ambos.
4. **Contraste com os demais corpora**: onde a interface impõe a sequência e a
   referência tem 3–5 estados (6.18, 6.20), a cobertura vai a 0,93–1,00 e o
   caminho íntegro a 0,63–1,00. O 8.12 mostra onde isso deixa de valer: **a
   concordância estado a estado cai com a granularidade da referência**. Essa é
   a fronteira que o artigo precisa declarar, e o motivo de o corpus ter sido
   mantido mesmo com expectativa de resultado baixo (declarada no pré-registro
   antes da coleta).
