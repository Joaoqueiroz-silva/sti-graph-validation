# Quantas réplicas por exercício? — justificativa empírica (2026-08-15)

**Pergunta do orientador:** por que 24 exercícios × 3 réplicas (72 gerações por
braço), e não mais? **Resposta honesta:** as 3 réplicas foram herdadas da
Campanha 5, não derivadas de análise de potência. Com 288 grafos coletados nas
rodadas 1–2 (5 braços), agora dá para dimensionar pelo dado — que é o que a
metodologia manda (o n de réplicas se escolhe pela variância OBSERVADA entre
réplicas, não por convenção).

## 1. Decomposição da variância (cobertura, nível 1; fontes: validacao-*.json)

| Braço | σ entre exercícios | σ entre réplicas (intra) | ICC | réplicas p/ EP intra ≤ 0,05 |
|---|---|---|---|---|
| r1 flash-lite | 0,163 | 0,151 | 0,54 | 10 |
| r1 qwen3-max | 0,149 | 0,072 | 0,81 | 3 |
| r1 gemini-3.5-flash | 0,077 | 0,024 | 0,91 | 1 |
| r2 fluxo flash-lite | 0,130 | 0,129 | 0,50 | 7 |
| r2 fluxo qwen3-max | 0,098 | 0,124 | 0,38 | 7 |

Leitura: a variabilidade **entre réplicas depende do modelo** — modelos fortes
(qwen, 3.5-flash) são quase determinísticos por exercício (ICC 0,81–0,91; 1–3
réplicas bastam), o flash-lite é ruidoso (ICC ~0,5; 7–10 réplicas para
estabilizar a média POR exercício).

## 2. O que as réplicas compram — e o que não compram

A quantidade de interesse do artigo é a **média do braço sobre os 24
exercícios** e a **diferença pareada entre braços**. O erro-padrão da média
tem dois componentes: entre exercícios (σ_b²/24) e intra (σ_w²/(24·r)). Com os
números do flash-lite (o pior caso):

| réplicas r | meia-largura IC95 da média do braço |
|---|---|
| 1 | ±0,089 |
| **3** | **±0,074** |
| 5 | ±0,070 |
| 10 | ±0,068 |
| 20 | ±0,066 |

Ou seja: **a incerteza é dominada pela variação ENTRE EXERCÍCIOS** (24 é o
número que aperta o intervalo, não r). Passar de 3 para 10 réplicas estreita o
IC em ~8% a 3,3× o custo; de 3 para 20, ~11% a 6,7× o custo. Para o desfecho
primário (Δ pareado entre braços), o EP com r=3 já fica na casa de 0,01–0,02 —
uma ordem de grandeza abaixo dos efeitos medidos (Δ 0,14–0,48). O bootstrap por
cluster de exercício (BCa) já incorpora as réplicas corretamente (reamostra
exercícios inteiros; réplicas não são tratadas como independentes).

## 3. Decisão fundamentada

- **Mantém-se r = 3 como padrão** para todos os braços pareados
  (comparabilidade entre rodadas + o custo marginal de mais réplicas compra
  pouca precisão onde importa);
- **reporta-se sempre o DP entre réplicas** por métrica (implementado em
  `analysis/bancada-v2/comparar-caminho.mjs`; item do orientador);
- **braço de sensibilidade com r = 10 no flash-lite** (o modelo ruidoso; ICC
  ~0,5) para mostrar empiricamente a convergência da média por exercício —
  custo ~US$ 0,4 no fluxo-plataforma;
- **para ampliar precisão, o investimento correto é em MAIS EXERCÍCIOS, não em
  mais réplicas** — extensão do corpus (outros pacotes CTAT) é o que estreita o
  IC da média do braço.

## 4. Base

- Dimensionamento por componentes de variância / ICC: Snijders & Bosker
  (2012), *Multilevel Analysis*, cap. 11 (poder em desenhos hierárquicos);
  Hox, Moerbeek & van de Schoot (2017), *Multilevel Analysis*, cap. 12.
- Bootstrap por cluster e BCa: Efron (1987); Davison & Hinkley (1997),
  *Bootstrap Methods and their Application*, §3.8.
- Réplicas de LLM como amostragem de saída estocástica (temperatura > 0):
  variância intra é propriedade do modelo, não do desenho — por isso o ICC
  difere por braço.

Reproduzir a tabela 1: script inline no commit desta nota (decomposição
σ_b/σ_w a partir de `porExercicio` dos `validacao-*.json`).
