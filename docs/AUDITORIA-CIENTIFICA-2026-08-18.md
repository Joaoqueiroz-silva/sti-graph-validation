# Auditoria científica do experimento — achados, correções e limitações (18/08/2026)

Auditoria adversarial em seis dimensões (vazamento, estatística, aderência ao
pré-registro, fidelidade do instrumento, validade de construto das métricas,
reprodutibilidade), com verificação cética independente de cada achado. Este
documento é a lista do que foi **corrigido**, do que fica **declarado como
limitação** e do que foi **refutado** — para ir junto ao artigo.

## A. Corrigido no código e nos números (commit 411186f e seguintes)

| # | Achado | Correção | Efeito nos resultados |
|---|---|---|---|
| A1 | **A cobertura é recall puro**: nada penaliza gerar estados a mais. Um controle determinístico "papagaio", que só repete os números do enunciado, atinge 0,52 de cobertura no 6.17 sem conhecer a decomposição. | `analysis/bancada-v2/linha-de-base.mjs`: controle negativo por registro, **cobertura ajustada** (obs−controle)/(1−controle), **precisão de estados** e **F1**. | Nova leitura obrigatória (tabela B). O caminho íntegro quase não é atingido pelo controle (base ≈0). |
| A2 | IC de largura ZERO quando a métrica satura (`[1,000; 1,000]`), declarando certeza que k exercícios não sustentam. | `lib.mjs: intervalo` detecta saturação e reporta Clopper-Pearson unilateral por **cluster**. | 6.18 qwen passa de `[1;1]` para **1,000 [0,832; 1,000]**. |
| A3 | `comparar-rodadas.mjs` subtraía métricas N/A sem guarda (`null − 0,5 = −0,5` em JS) → efeito fabricado. | Guarda de N/A, igual à do irmão. | Nenhum número publicado estava corrompido; o 6.18 agora reporta N/A corretamente. |
| A4 | `dpEntreReplicas` promediava DPs em vez de agrupar variâncias (subestima o ruído). | DP agrupado por graus de liberdade: √(Σ SSᵢ / Σ (nᵢ−1)). | DP sobe ~3 %; não muda nenhuma inferência. |
| A5 | O consolidador chamava de "BCa" um bootstrap **percentílico**. | Rótulo corrigido no código e no cabeçalho da tabela. | Só nomenclatura. |
| A6 | ✅ **RESOLVIDO** — **Espelho defasado e incompleto**: produção avançou 15 commits; e o registro de componentes tinha **6 de 44** componentes, porque o fecho só seguia imports estáticos (o registro descobre por varredura de diretório). O catálogo no prompt do worker do agent 6 tinha 4702 chars contra 8936 em produção. | `espelhar-producao.mjs` passa a incluir diretórios varridos em runtime; espelho subiu para produção 5263488. | Os 516 grafos foram **re-materializados** (v3, US$ 3,16, 0 falhas). Efeito pareado v3−v2: \|Δ\| ≤ 0,07 em cobertura e caminho íntegro, ICs cruzando zero — o catálogo maior muda o `renderAs`, não o valor do estado. Fontes: `comparacao-espelho-v3-vs-v2-*.json`. |
| A7 | O Δ pareado **entre braços** (desfecho declarado em JUSTIFICATIVA-REPLICAS) nunca era calculado: a comparação era lida da sobreposição de ICs marginais. | `comparacao-bracos.json` por corpus. | Ver tabela C: "qwen melhor em tudo" **não se sustenta** no 6.19. |
| A8 | Nenhuma tabela mostrava o efeito das redefinições do denominador. | `contrafactual-regua.mjs`: os mesmos grafos sob 4 definições encaixadas (R0 ingênua → R3 vigente). | Ver tabela D. |

## B. Controle determinístico, precisão e F1 — VERSÃO CORRIGIDA (v3, 5 corpora, 630 grafos)

Números vigentes, com os agentes espelhados da produção **5263488** (registro de
componentes completo) e recorte = gate por enunciado (100 %, sem exclusão):

| corpus · braço | cobertura | controle (papagaio) | **ajustada** | precisão | **F1** | íntegro obs/controle |
|---|---|---|---|---|---|---|
| 6.17 · flash-lite | 0,778 | 0,500 | 0,462 | 0,607 | 0,680 | 0,125 / 0,014 |
| 6.17 · qwen | 0,941 | 0,535 | **0,871** | 0,651 | 0,761 | 0,764 / 0,083 |
| 6.19 · flash-lite | 0,725 | 0,359 | 0,531 | 0,662 | 0,684 | 0,145 / 0,000 |
| 6.19 · qwen | 0,728 | 0,406 | 0,463 | 0,413 | 0,522 | 0,072 / 0,000 |
| 6.18 · flash-lite | 0,961 | 0,417 | 0,933 | 0,592 | 0,731 | 0,883 / 0,000 |
| 6.18 · qwen | 0,989 | 0,417 | **0,975** | 0,415 | 0,581 | 0,967 / 0,000 |
| 6.20 · flash-lite | 0,919 | 0,411 | 0,860 | 0,853 | 0,883 | 0,596 / 0,000 |
| 6.20 · qwen | 0,933 | 0,442 | 0,877 | 0,643 | 0,761 | 0,667 / 0,000 |
| 8.12 · flash-lite | 0,087 | 0,103 | **−0,019** | 0,452 | 0,144 | 0,000 / 0,000 |
| 8.12 · qwen | 0,300 | 0,186 | 0,139 | 0,624 | 0,402 | 0,000 / 0,000 |

**O caso que justifica a métrica**: no 8.12, o flash-lite tem cobertura ajustada
**negativa** — fica abaixo do controle papagaio. Sem a coluna de controle,
"0,087 de cobertura" pareceria apenas um resultado positivo pequeno. Como o
papagaio é determinístico, essa comparação **não** é um teste de acaso e não
autoriza dizer "indistinguível do acaso"; ela mostra somente que o agente não
superou esse controle negativo específico.

Precisão e F1 acima usam a régua simétrica corrigida em 20/08: o verdadeiro
positivo é sempre a LCS 1:1, repetições preservam multiplicidade e o denominador
da precisão contém todas as ocorrências comparáveis do agente. Os valores
anteriores deduplicavam estados com `Set` e estavam inflados.

### Tabela anterior (v2, 4 corpora) — registro histórico, não usar em inferências

| corpus · braço | cobertura obs. | **base (papagaio)** | **ajustada** | **precisão antiga (inválida)** | **F1 antigo (inválido)** | íntegro obs./base |
|---|---|---|---|---|---|---|
| 6.17 · flash-lite | 0,781 | 0,521 | 0,439 | 0,832 | 0,800 | 0,139 / 0,056 |
| 6.17 · qwen | 0,938 | 0,563 | **0,856** | 0,828 | 0,868 | 0,750 / 0,167 |
| 6.19 · flash-lite | 0,707 | 0,380 | 0,447 | 0,760 | 0,720 | 0,101 / 0,000 |
| 6.19 · qwen | 0,730 | 0,406 | 0,448 | 0,755 | 0,735 | 0,087 / 0,000 |
| 6.18 · flash-lite | 0,939 | 0,417 | 0,892 | 0,613 | 0,737 | 0,817 / 0,000 |
| 6.18 · qwen | 1,000 | 0,417 | **1,000** | 0,551 | 0,707 | 1,000 / 0,000 |
| 6.20 · flash-lite | 0,926 | 0,421 | 0,874 | 0,808 | 0,861 | 0,632 / 0,000 |
| 6.20 · qwen | 0,947 | 0,442 | 0,901 | 0,761 | 0,840 | 0,737 / 0,000 |

Os números de precisão/F1 desta tabela v2 foram produzidos pelo método com
deduplicação por `Set`; são mantidos apenas para explicar documentos e commits
antigos e **não são comparáveis** aos valores corrigidos da tabela vigente.

Leituras que a tabela vigente impõe ao artigo:
1. **A cobertura bruta precisa do controle ao lado**: o papagaio alcança
   0,103–0,535 conforme a célula. Reportar cobertura, controle, ajustada e F1,
   sem interpretar o controle determinístico como distribuição de acaso.
2. **O caminho íntegro é mais resistente ao controle**: a base é 0,000 em
   quatro corpora e 0,014–0,083 no 6.17.
3. **A precisão revela o custo da verbosidade**: com a régua simétrica, o F1 do
   qwen fica abaixo do flash-lite no 6.19 (0,522 vs 0,684), 6.18 (0,581 vs
   0,731) e 6.20 (0,761 vs 0,883). No agregado por braço, os ICs de F1 se
   sobrepõem: flash-lite 0,630 [0,615; 0,646] e qwen 0,609 [0,596; 0,623]; não
   há base para declarar superioridade global de um braço por F1.

## C. Δ pareado ENTRE BRAÇOS (qwen − flash-lite; mesmo exercício × réplica)

| corpus | cobertura | sem ordem | caminho íntegro | erros no estado certo |
|---|---|---|---|---|
| 6.17 | +0,163 [0,115; 0,198] | +0,010 [−0,007; 0,035] | **+0,639 [0,444; 0,764]** | +0,330 [0,250; 0,409] |
| 6.19 | +0,004 [−0,025; 0,043] | −0,027 [−0,059; 0,004] | **−0,072 [−0,159; −0,003]** | +0,251 [0,135; 0,357] |
| 6.18 | +0,028 [−0,011; 0,067] | +0,022 [−0,011; 0,061] | +0,083 [−0,033; 0,200] | N/A |
| 6.20 | +0,014 [−0,018; 0,039] | +0,014 [−0,018; 0,039] | +0,070 [−0,088; 0,193] | +0,292 [0,192; 0,387] |
| 8.12 | +0,213 [0,188; 0,241] | +0,281 [0,254; 0,308] | 0,000 [0,000; 0,176] | +0,033 [0,017; 0,061] |

**Correção de afirmação anterior**: "o braço qwen é melhor em tudo" não é
sustentável. Há ganho claro de cobertura no 6.17 e 8.12; no 6.19, 6.18 e 6.20
o IC de cobertura cruza zero. No 6.19, o caminho íntegro é menor para o qwen.
Erros no estado certo favorecem o qwen nos quatro corpora avaliáveis, com
efeito grande em 6.17/6.19/6.20 e pequeno no 8.12.

## D. Contrafactual da régua — o que cada exclusão moveu (mesmos grafos)

Cobertura / caminho íntegro sob definições encaixadas do estado de valor:

| corpus · braço | R0 tudo | R1 +mecânicas | R2 +ações do tutor | **R3 +variante (VIGENTE)** |
|---|---|---|---|---|
| 6.17 · flash-lite | 0,452 / 0,000 | — | — | 0,781 / 0,139 |
| 6.17 · qwen | 0,605 / 0,000 | 0,706 / 0,014 | 0,938 / 0,750 | 0,938 / 0,750 |
| 6.19 · flash-lite | 0,306 / 0,000 | — | — | 0,707 / 0,101 |
| 6.18 · qwen | 0,382 / 0,000 | — | — | 1,000 / 1,000 |
| 6.20 · qwen | 0,599 / 0,000 | — | — | 0,947 / 0,737 |

(estados de referência por problema: R0 7–11 → R3 3–5.) A maior parte do efeito
vem de **R1→R2** (excluir arestas que o `<Actor>` do `.brd` atribui ao TUTOR, e
não ao aluno). A justificativa é conceitual e verificável no próprio arquivo —
o aluno não executa `set_maximum` nem `setDisplay` —, mas a magnitude precisa
estar publicada: **sob a régua ingênua, o caminho íntegro é 0,000 em todos os
corpora**. Arquivos: `contrafactual-*.json` por corpus e braço.

## E. Declarações obrigatórias no artigo (limitações)

1. **Decisões pós-dados.** Quatro decisões que definem o denominador foram
   tomadas depois de ver dados: sentinelas (15/08), ações do tutor (16/08),
   seletor de variante (17/08) e as duas exclusões da régua de erros (18/08).
   Todas devem ser rotuladas **post hoc**, com data, e acompanhadas da tabela D.
   Atenuante verificável: a política de ator/sentinela já estava congelada em
   `production-fidelity/ctat-reference-v2.mjs` desde **16/07/2026**, antes do
   bloco de agosto — o que a torna correção de inconsistência inicial, não
   conveniência. Nenhuma decisão pós-dados andou contra os agentes: isso é uma
   assimetria a declarar.
2. **Envelope A é derivado do próprio `.brd`.** A lista de componentes é o
   conjunto de `Selection` das arestas do especialista e os KCs vêm dos
   `<productionRule>` do mesmo arquivo. Não é vazamento do caminho nem dos
   erros (verificado), mas é uma dependência da referência que deve ser dita.
3. **Transcritibilidade da referência.** Parte dos estados do especialista é
   derivável do enunciado + resposta que o agente recebe. O 8.12 (50,7 % de
   transcritibilidade, 24 estados por problema) é o teste decisivo e precisa
   ser publicado mesmo com cobertura baixa.
4. **Multiplicidade.** ~800 ICs calculados, ~40 publicados, sem correção
   formal. Declarar que os ICs são **descritivos**, não testes confirmatórios;
   a única hipótese direcional pré-declarada é o efeito da interface.
5. **Um único autor de referência.** Todos os tutores vêm da equipe
   Mathtutor/CMU: não há banda humano–humano; "quão longe do teto humano"
   permanece em aberto.
6. **Adaptador `pipeline-core`**: temperaturas conferem com produção, mas os
   `maxTokens` são os defaults crus do registry — produção aplica por cima o
   tier BALANCED (4 de 9 divergem). Declarar; medir o efeito é trabalho futuro.
7. **Métrica de dicas satura** (1,000 em 100 % dos registros materializados):
   não informativa no materializado; usar só no estágio 3.

## F. Refutados pela verificação cética (não são problemas)

- Envelope B contaminando a geração: é lido **só depois**, verificado com hook
  em `fs.readFileSync`.
- `expert.brd` empacotado junto do envelope A: o harness nunca o abre.
- Gate anti-vazamento por nome de chave: já declarado na metodologia; a
  varredura por valor não encontrou vazamento nos 105 problemas.
- Exclusão de N/A enviesando por braço: a marcação é 100 % determinada pela
  referência, idêntica entre braços.
- `media([])` devolvendo 0: nenhum caminho publicado passa por lista vazia.


## G. Fechamento (19/08/2026) — o que mudou depois da auditoria

1. **Espelho corrigido e uniformizado**: todos os 5 corpora (630 grafos) usam os
   agentes da produção **5263488**, com o registro de componentes completo. O
   efeito da correção foi medido e é desprezível (tabela A6).
2. **Gate de obediência refeito**: o gate por valores reprovava a *resolução* em
   corpora com cálculo intermediário (0/57 no 8.12/qwen, com 57/57 dos
   enunciados limpos). O critério vigente é o **enunciado** escrito pelo agent 6
   — evidência direta de "usou o problema do CTAT?" —, com **100 % de aprovação
   nos 630 grafos dos 5 corpora**. Consequência: **o consolidado deixa de ter
   recorte** e usa todos os grafos; some a objeção de "recorte escolhido depois
   de olhar os dados". Os gates por valor viram análise de sensibilidade.
3. **Métrica principal passa a ser reportada em quatro colunas**: cobertura
   bruta, controle determinístico, **ajustada** e **F1** (com precisão). O caminho íntegro
   permanece a métrica mais robusta (base ≈0 em 4 dos 5 corpora).
4. **Correção de afirmação**: "o braço qwen é melhor em tudo" não se sustenta.
   Pelo **F1** corrigido, o qwen fica abaixo do flash-lite em 6.19 (0,522 vs
   0,684), 6.18 (0,581 vs 0,731) e 6.20 (0,761 vs 0,883), e os ICs agregados de
   F1 por braço se sobrepõem. A afirmação sustentável é: *o braço com alunos
   mais fortes cobre mais estados em alguns corpora e acerta mais erros no
   estado certo nos quatro corpora avaliáveis, ao custo de precisão; o balanço
   (F1) é heterogêneo e não demonstra superioridade global.*
