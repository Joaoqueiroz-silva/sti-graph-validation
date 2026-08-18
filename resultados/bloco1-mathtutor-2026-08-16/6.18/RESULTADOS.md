# 6.18 Equivalent Fractions — resultados (coleta 17–18/08, análise 18/08/2026)

Corpus: `datasets/equiv-fractions-6.18` (20 problemas; Mathtutor/CMU, pacote
"6.18 HTML"; duas retas numéricas — a fração dada já marcada na Linha 1; o aluno
divide a Linha 2, marca a fração equivalente e informa o numerador).
Pré-registro e adendo de interface/variantes/piloto: `../PRE-REGISTRO.md`.
Agentes: espelho da **produção 132c645**. Desenho idêntico aos demais corpora.

- 20 × 3 réplicas × 2 braços = 120 grafos coletados, 120 materializados,
  0 falhas. Custo: US$ 0,41 + 2,17 (alunos) + 0,32 + 0,39 (materialização) =
  **US$ 3,29**. (Uma primeira coleta do braço qwen caiu por falha de rede em
  14/60 e foi refeita do zero; a parcial está arquivada como
  `fixa-estudantes-qwen.interrompida-17-08` e não entra em nada.)
- Referência do especialista: **3 estados de valor** por problema (denominador
  da Linha 2 → ponto na Linha 2 → numerador) — o `shield` (seletor de variante)
  e as ações do tutor ficam fora, ver adendo do pré-registro.

## 1. Gate de problema fixo

| Braço | estrito | sens. 1 (0/1) | sens. 2 (+ equiv. canônica) | **sens. 3 (+ nº mistos)** |
|---|---|---|---|---|
| flash-lite | 53/60 = **88 %** | 53/60 | 57/60 | **57/60 = 95 %** |
| qwen | 41/60 = 68 % | 41/60 | 54/60 | **55/60 = 92 %** |

Melhor taxa estrita de todos os corpora até aqui (88 %), coerente com um
enunciado que fixa os dois denominadores.

## 2. Régua de estados — grafo MATERIALIZADO (recorte sens. 3; entre parênteses, todos os 60)

| Métrica | flash-lite (n=57, 20 ex.) | qwen (n=55, 20 ex.) |
|---|---|---|
| **cobertura de estados em ordem (LCS)** | **0,953 [0,917; 0,977]** (0,939) | **1,000 [1,000; 1,000]** (1,000) |
| cobertura sem ordem | 0,971 [0,930; 0,989] (0,956) | 1,000 (1,000) |
| **caminho íntegro em ordem** | **0,860 [0,749; 0,930]** (0,817) | **1,000 [1,000; 1,000]** (1,000) |
| erros no estado certo | **N/A** (ver §3) | **N/A** (ver §3) |
| estados/grafo (ref = 3) | 5,51 | 8,02 |
| erros extras/grafo | 5,1 | 10,4 |

Estágio 3 (mínima, 60 grafos): cobertura 0,404 / 0,370; caminho íntegro 0,105 / 0,018.
Δ pareado materializado − mínima: **+0,550 / +0,630** na cobertura;
**+0,754 / +0,982** no caminho íntegro.

## 3. Por que "erros no estado certo" é N/A neste corpus (achado metodológico)

Dos 50 erros que o especialista modelou nos 20 problemas:

- **30 (60 %) não são ancoráveis**: a aresta de erro sai de um estado que não
  pertence ao caminho de referência — pertence à **outra variante** do problema
  (o ramo do seletor `shield` que não é usado). Antes da correção de 18/08 eles
  eram ancorados no primeiro estado e só podiam falhar; agora ficam fora do
  denominador e são contados (`errosNaoAncoraveis`).
- **20 (100 % dos ancoráveis) são indistinguíveis por valor**: o `wrongAnswer`
  do especialista é **exatamente a resposta correta daquele estado**
  (ex.: erro `2/8` ancorado no estado cuja resposta é `2/8`). São erros de
  COMPONENTE/ORDEM — "marcar a fração certa na Linha 1 em vez da Linha 2" —, e
  uma régua que compara VALOR não pode distingui-los de acerto. Ficam fora do
  denominador (`errosIndistinguiveis`) e, como todos caem, a métrica é **N/A**,
  não 0.

Verificação nos outros corpora: 6.17 → 0/110 não ancoráveis e 0/110
indistinguíveis; 6.19 → 0/54 e 0/54. O fenômeno é específico do desenho do 6.18.
Consequência para o artigo: a métrica de erros pressupõe erro com valor
diferente da resposta; corpora cujo especialista modela erros de componente
exigem uma régua com seleção/ação (nível 3), fora do escopo declarado.

## 4. Leitura honesta

1. **Melhor resultado estrutural do experimento**: com a interface e o problema
   do especialista, o braço qwen reproduz o caminho **inteiro, na ordem exata,
   em 100 % dos grafos** (55/55) e o flash-lite em 86 %. Ambos com cobertura de
   estados ≥0,95.
2. A tarefa do 6.18 tem **3 estados de valor** (contra 4 no 6.17 e 4,35 no 6.19)
   e uma ordem muito determinada pela tela (dividir → marcar → escrever), o que
   explica o teto: quanto mais a interface impõe a sequência, mais o agente
   coincide com o especialista.
3. Os agentes continuam **mais longos que a referência** (5,5 e 8,0 estados
   contra 3) e geram 5–10 erros extras por grafo — material fora da referência
   cujo juízo cabe ao juiz cego, não a esta régua.
4. Réplicas: DP 0,00–0,21; qwen sem variação (todos os grafos íntegros).
