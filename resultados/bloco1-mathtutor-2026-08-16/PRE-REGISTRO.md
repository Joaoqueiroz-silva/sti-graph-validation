# Pré-registro — BLOCO 1 dos corpora públicos do Mathtutor (2026-08-16)

Registrado antes de qualquer coleta do bloco. Catálogo e fonte:
`docs/CATALOGO-PACOTES-MATHTUTOR-2026-08-16.md` (54 pacotes / 710 grafos,
`mathtutor.web.cmu.edu/tutors/packages/<pacote>/`, mesma origem do 6.17).

## Pergunta

Os resultados da rodada 4 (6.17: mesmo problema + mesma interface → cobertura de
estados em ordem 0,62/0,84, erros no estado certo 0,30/0,65) **generalizam** para
outros tutores da mesma família (outros tópicos, interfaces, moldes)?

## Corpora do bloco 1 (ordem de execução)

1. **6.19 Fractions and Estimates** — 23 problemas; frações próprias e
   impróprias na reta 0–N, conversão a número misto (f1/f2, Convert, m1/m2/m3,
   numline, Done). Mesmos enunciados-base do 6.17 em parte, tarefa diferente.
2. 6.18 Equivalent Fractions (20) · 3. 6.20 Fraction Ordering (19) ·
   4. 8.12 Factors, Scaling, and Percents (19) · 5. 7.12 Conversion Factors (18).
   Cada um recebe seu próprio adendo (interface descrita, piloto) ANTES da coleta.

## Desenho (idêntico à rodada 4, por corpus)

- Envelope A: enunciado literal (statement + statement2 do estado inicial),
  resposta, KCs, **interface** (descrição neutra: HTML do pacote + mensagens de
  ESTADO INICIAL do `.brd` — extremo da reta, encaixe, ticks, botões visíveis,
  textos exibidos; lista branca de ações; teste anti-vazamento por problema).
  Envelope B jamais entra.
- Cadeia de produção completa (agents 3a/3b/3c → GraphForge passos-livres →
  agent 6 + agent 7), problema fixo + interface fixa, 2 braços (custo-beneficio:
  flash-lite nos alunos; estudantes-qwen), 3 réplicas, materialização
  gpt-5.6-luna, gate estrito + sensibilidades 1 e 2 (declaradas).
- Régua de estados: caminho de referência lido do `.brd` (estado de valor =
  ação de ALUNO com entrada não mecânica; ações de sistema fora), LCS,
  cobertura sem ordem, caminho íntegro, erros no estado certo, dicas no estado
  certo (informativa só no estágio 3), extras; unidade = grafo; BCa em cluster
  de exercício; DP entre réplicas.
- Comparação entre corpora: descritiva (mesmas métricas lado a lado) +
  heterogeneidade por corpus; nenhuma hipótese direcional pré-declarada além
  de "os ICs de 6.19 se sobrepõem aos de 6.17 na cobertura em ordem".
- Piloto por corpus: 2 exercícios × 1 réplica (custo-beneficio); critério de
  parada: agentes ignoram a interface (0 menções aos componentes nos traces) ou
  gate de problema fixo 0/2 → parar e reportar.
- Custo estimado por corpus: ~US$ 0,17/problema (≈ US$ 4 para 23).

## Métricas pré-declaradas

As da rodada 4, sem alteração. Sensibilidade 2 do gate (equivalência canônica)
agora é declarada A PRIORI para o bloco 1 (deixou de ser post hoc).

## Adendo 6.19 — interface descrita e piloto (16/08, 16:55)

Interface: `interface-ctat.js` (`descreverInterface619`) a partir do HTML do
pacote + `problems/<id>/interface-params.json` (11 mensagens de estado inicial
por problema; lista branca de ações; teste anti-vazamento nos 23 problemas).
Piloto 2×1 (custo-beneficio): agents 3 citam f1/f2/numline/Done (10–14 menções
no 3b); agent 6 ancora os passos nos componentes ("Enter the numerator … f1",
"Mark 5/7 on the number line", "Select Done"); gate estrito 1/2 (o reprovado é
por `0` = parte inteira do número misto, que o próprio especialista usa como
estado `m1=0` → sensibilidade 1); LCS 0,75 no aprovado. Critério de parada não
acionado → coleta autorizada. Referência do 6.19: 4 estados de valor
(f1, f2, m1, numline) + Done/Convert/setDisplay fora.
