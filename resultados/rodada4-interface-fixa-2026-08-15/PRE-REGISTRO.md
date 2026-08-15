# Pré-registro — rodada 4: braço "INTERFACE FIXA" (2026-08-15)

Registrado ANTES do piloto e da coleta.

## Motivo

Premissa do experimento (orientador/autor, reafirmada em 15/08): os agentes
devem receber **exatamente o que o especialista teve** — o problema **e a
interface** — e, com base nisso, autorar o grafo; só assim os dois grafos são
comparáveis estado a estado. Até a rodada 3 os agentes recebiam enunciado +
resposta + KCs; a interface do CTAT (7 componentes) **não** entrava, porque os
agentes de produção não têm campo de inventário (decisão declarada no
pré-registro da rodada 2). Parte do déficit de cobertura de estados (0,21–0,27)
e do caminho nunca íntegro pode vir daí (estados do especialista como `1` —
extremo da reta — e `-1` — clique em Done — são impostos pela interface).

## O que muda (e só isso)

- A interface entra por canais que o código de produção **já lê**, sem editar
  agente: (a) `seedProblems[0].interface` — os agents 3a/3b/3c serializam
  `seedProblems` inteiro no prompt; (b) `state.description` do agent 6
  (REQUISITOS DO PROFESSOR), junto com o problema fixo.
- Fonte da descrição: **só a interface** (`_interface/screenshot.png`,
  `interface.html`, e a lista branca de `massproduction.txt`: statement2,
  rBound, fracBox, mfNum_box, label_aid, line_name) + `envelope-a.components`.
  Nunca dicas, feedback, badCount, doubleDiv, valores. Travado por teste
  (`__tests__/interface-fixa.test.mjs`) para os 24 problemas.
- Uma glosa interpretativa declarada: o papel de cada componente
  (F1 = numerador/caixa de cima, F2 = denominador/caixa de baixo, denom =
  "Number of parts", numline = marcar ponto, done = concluir) vem da tela
  compartilhada, não do grafo do especialista.
- Todo o resto igual à rodada 3: regime passos-livres, mesmos 24 exercícios ×
  3 réplicas, mesmos dois braços de modelo (custo-beneficio: flash-lite nos
  alunos; estudantes-qwen), mesmas temperaturas, materialização com problema
  fixo (agent 6 + agent 7) e gate estrito + sensibilidade (0/1), régua de
  estados com LCS + sem ordem.

## Piloto (antes do lote)

2 exercícios × 1 réplica, custo-beneficio: verificar (i) os traces dos agents 3
citam os componentes (F1/F2/denom/numline/done) nos passos; (ii) o agent 6
mantém o enunciado e usa os componentes; (iii) gate de problema fixo. Se os
agentes ignorarem a interface (0 menções), parar e reportar — não coletar.

## Métricas pré-declaradas (idênticas à rodada 3)

Cobertura de estados (LCS), cobertura sem ordem, caminho íntegro, erros no
estado certo, dicas no estado certo, extras por tipo; unidade = grafo; BCa por
exercício; DP entre réplicas; comparação **pareada por exercício×réplica** com
a rodada 3 (interface livre) — cru, mínima e materializado.

## Custo estimado

Alunos: ~US$ 0,4 (flash-lite) + ~US$ 1,8 (qwen); materialização ~US$ 0,7.
Total ~US$ 3. Autorização: 15/08 ("os agentes deveriam receber exatamente a
mesma coisa para que o experimento fosse realmente válido").

## Piloto — resultado (2 exercícios × 1 réplica, custo-beneficio; 15/08 20:40)

- Agents 3 citam os componentes nos passos ("Dividir a reta numérica no
  componente 'denom'", "Preencher os campos F1 e F2", "Clicar no botão Done";
  5 e 1 menções no 3a; 23 e 5 no 3b). Estrutura do caminho ficou com 6 passos
  (denominador, numerador, dividir, fração, ponto, concluir).
- Agent 6: enunciado idêntico ao CTAT nos 2; passos ancorados nos componentes
  ("digite-o no campo F2", "Digite 5 em Number of parts", "Marque na reta",
  "Clique em Done"); gate de problema fixo APROVADO 2/2.
- Régua (materializado, n=2 — ilustrativo): cobertura ordenada 0,50, sem ordem
  1,00, erros no estado certo 0,50, dicas 1,00. Critério de parada não
  acionado → coleta autorizada.

## Correção declarada antes da coleta (vale para TODAS as rodadas, recalculado)

Estados do especialista cuja resposta é sentinela de interface do CTAT
(`""`, `"-"`, `"-1"`: o SetVisible sem entrada e o clique em Done, que o CTAT
grava como input "-1", último estado nos 24 problemas) deixam de contar como
estado de valor — mesma regra `ehMecanico` já usada para os erros. Antes o Done
era incasável por construção (teto 6/7; caminho íntegro impossível). Rodada 3
recalculada: mínima 0,241 / 0,310 (era 0,206 / 0,266); referência 6 estados.
