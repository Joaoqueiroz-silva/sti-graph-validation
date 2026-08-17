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

## Adendo geral (16/08, 20:45) — sensibilidade 3 do gate e recorte do consolidado

Vista no 6.19: a interface pede NÚMERO MISTO ("2 3/4"); o gate lia como
"23/4". Sensibilidade 3 = sens. 2 + números mistos ("W N/D" → fração
imprópria). Post hoc para o 6.19; a priori para 6.18/6.20/8.12/7.12. O
consolidado usa como recorte principal os aprovados na sens. 3 (com o gate
estrito e "todos" reportados ao lado); as métricas diferem ≤0,02 entre recortes.

## Adendo 6.18 — interface, variantes e piloto (17/08, 20:10)

**Interface** (`interface-ctat.js: descreverInterface618`): duas retas numéricas
(Linha 1 com a fração dada já marcada pelo tutor; Linha 2 onde o aluno divide e
marca), campos de denominador com confirmação, caixas da igualdade (as da
esquerda preenchidas; na direita o aluno digita o NUMERADOR), seletor de
comparação ≟/=/≠, Hint, Done. **Nenhum valor de campo entra na descrição**:
verificado que o estado inicial preenche `R1` com o numerador da RESPOSTA em
**20/20** problemas; L1/L2/R2 também ficam fora. Lista branca: `set_maximum`
das retas, `addClass hidden` (qual variante da Linha 2 aparece) e `statement2`
(pergunta exibida, que é enunciado). Teste anti-vazamento problema a problema.

**Variantes do problema (declarado).** Cada `.brd` do 6.18 traz DUAS variantes
selecionadas por um componente de controle (`shield`, que sequer existe no HTML
da tela): (A) preencher a fração equivalente — usa a Linha 2 sem rótulos e o
campo do numerador; (B) comparar as duas frações no seletor ≟/=/≠. A referência
usa a variante **A**, que é a que corresponde ao enunciado dos 20 problemas
("Find another fraction that equals the same amount in eighths"); a variante B
não entra. Regra geral implementada e testada (`lib.mjs`): duas ou mais arestas
corretas saindo do mesmo estado pelo mesmo componente, com entradas diferentes,
são **seletor de variante** e não contam como estado de valor — marca 20/20 no
6.18 e **nada** no 6.17 e no 6.19. Referência do 6.18: **3 estados de valor**
(denominador da Linha 2 → ponto na Linha 2 → numerador) e 2–3 erros por problema.

**Piloto** (2 exercícios × 1 réplica, custo-beneficio, agentes da produção
132c645): agents 3 citam a interface (14–18 menções a Linha 2 / R1_user /
equals_combo); agent 6 ancora os passos nos componentes; gate de problema fixo
**2/2 APROVADO**; régua no materializado (n=2, ilustrativo): cobertura em ordem
**1,00**, caminho íntegro **1,00**, erros no estado certo 0,00. Critério de
parada não acionado → coleta autorizada.
