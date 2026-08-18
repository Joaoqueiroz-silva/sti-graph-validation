# Auditoria científica do experimento — achados, correções e limitações (18/08/2026)

Auditoria adversarial em seis dimensões (vazamento, estatística, aderência ao
pré-registro, fidelidade do instrumento, validade de construto das métricas,
reprodutibilidade), com verificação cética independente de cada achado. Este
documento é a lista do que foi **corrigido**, do que fica **declarado como
limitação** e do que foi **refutado** — para ir junto ao artigo.

## A. Corrigido no código e nos números (commit 411186f e seguintes)

| # | Achado | Correção | Efeito nos resultados |
|---|---|---|---|
| A1 | **A cobertura é recall puro**: nada penaliza gerar estados a mais. Um grafo "papagaio", que só repete os números do enunciado, atinge 0,52 de cobertura no 6.17 sem conhecer a decomposição. | `analysis/bancada-v2/linha-de-base.mjs`: linha de base de acaso por registro, **cobertura ajustada** (obs−base)/(1−base), **precisão de estados** e **F1**. | Nova leitura obrigatória (tabela B). O caminho íntegro é imune (base ≈0). |
| A2 | IC de largura ZERO quando a métrica satura (`[1,000; 1,000]`), declarando certeza que k exercícios não sustentam. | `lib.mjs: intervalo` detecta saturação e reporta Clopper-Pearson unilateral por **cluster**. | 6.18 qwen passa de `[1;1]` para **1,000 [0,832; 1,000]**. |
| A3 | `comparar-rodadas.mjs` subtraía métricas N/A sem guarda (`null − 0,5 = −0,5` em JS) → efeito fabricado. | Guarda de N/A, igual à do irmão. | Nenhum número publicado estava corrompido; o 6.18 agora reporta N/A corretamente. |
| A4 | `dpEntreReplicas` promediava DPs em vez de agrupar variâncias (subestima o ruído). | DP agrupado por graus de liberdade: √(Σ SSᵢ / Σ (nᵢ−1)). | DP sobe ~3 %; não muda nenhuma inferência. |
| A5 | O consolidador chamava de "BCa" um bootstrap **percentílico**. | Rótulo corrigido no código e no cabeçalho da tabela. | Só nomenclatura. |
| A6 | **Espelho defasado e incompleto**: produção avançou 15 commits; e o registro de componentes tinha **6 de 44** componentes, porque o fecho só seguia imports estáticos (o registro descobre por varredura de diretório). O catálogo no prompt do worker do agent 6 tinha 4702 chars contra 8936 em produção. | `espelhar-producao.mjs` passa a incluir diretórios varridos em runtime; espelho subiu para produção 5263488. | **Exige re-materialização** dos corpora (em andamento) e comparação pareada de versão. |
| A7 | O Δ pareado **entre braços** (desfecho declarado em JUSTIFICATIVA-REPLICAS) nunca era calculado: a comparação era lida da sobreposição de ICs marginais. | `comparacao-bracos.json` por corpus. | Ver tabela C: "qwen melhor em tudo" **não se sustenta** no 6.19. |
| A8 | Nenhuma tabela mostrava o efeito das redefinições do denominador. | `contrafactual-regua.mjs`: os mesmos grafos sob 4 definições encaixadas (R0 ingênua → R3 vigente). | Ver tabela D. |

## B. Linha de base de acaso, precisão e F1 (grafo materializado, todos os grafos)

| corpus · braço | cobertura obs. | **base (papagaio)** | **ajustada** | **precisão** | **F1** | íntegro obs./base |
|---|---|---|---|---|---|---|
| 6.17 · flash-lite | 0,781 | 0,521 | 0,439 | 0,832 | 0,800 | 0,139 / 0,056 |
| 6.17 · qwen | 0,938 | 0,563 | **0,856** | 0,828 | 0,868 | 0,750 / 0,167 |
| 6.19 · flash-lite | 0,707 | 0,380 | 0,447 | 0,760 | 0,720 | 0,101 / 0,000 |
| 6.19 · qwen | 0,730 | 0,406 | 0,448 | 0,755 | 0,735 | 0,087 / 0,000 |
| 6.18 · flash-lite | 0,939 | 0,417 | 0,892 | 0,613 | 0,737 | 0,817 / 0,000 |
| 6.18 · qwen | 1,000 | 0,417 | **1,000** | 0,551 | 0,707 | 1,000 / 0,000 |
| 6.20 · flash-lite | 0,926 | 0,421 | 0,874 | 0,808 | 0,861 | 0,632 / 0,000 |
| 6.20 · qwen | 0,947 | 0,442 | 0,901 | 0,761 | 0,840 | 0,737 / 0,000 |

Leituras que isto impõe ao artigo:
1. **A cobertura bruta superestima**: 38–56 % dela é atingível sem decompor. A
   métrica a reportar como principal passa a ser a **ajustada** (0,44–1,00) ou
   o **F1** (0,71–0,87), com a bruta ao lado.
2. **O caminho íntegro é a métrica robusta**: a base é 0,000 em 3 dos 4 corpora
   (0,056–0,167 no 6.17). Um agente que o atinge não pode tê-lo feito por acaso.
3. **A precisão revela o custo da verbosidade**: o qwen no 6.18 tem cobertura
   1,000 e precisão 0,551 — metade dos estados que ele cria não existe na
   referência. O F1 o coloca **abaixo** do flash-lite no 6.18 (0,707 vs 0,737),
   invertendo a leitura que a cobertura sozinha sugeria.

## C. Δ pareado ENTRE BRAÇOS (qwen − flash-lite; mesmo exercício × réplica)

| corpus | cobertura | sem ordem | caminho íntegro | erros no estado certo |
|---|---|---|---|---|
| 6.17 | +0,156 [0,108; 0,194] | +0,021 [0,000; 0,052] | **+0,611 [0,417; 0,750]** | +0,377 [0,292; 0,455] |
| 6.19 | +0,023 [−0,016; 0,088] | −0,012 [−0,054; 0,029] | −0,014 [−0,130; 0,101] | +0,295 [0,184; 0,413] |
| 6.18 | +0,061 [0,028; 0,094] | +0,044 [0,017; 0,078] | +0,183 [0,083; 0,283] | N/A |
| 6.20 | +0,021 [0,007; 0,039] | +0,021 [0,007; 0,039] | +0,105 [0,035; 0,193] | +0,327 [0,219; 0,428] |

**Correção de afirmação anterior**: "o braço qwen é melhor em tudo" vale para o
6.17; nos demais o ganho estrutural é pequeno (+0,02 a +0,06) e no **6.19 a
cobertura e o caminho íntegro NÃO diferem** (ICs cruzam zero, com o qwen
nominalmente pior no íntegro). O que se sustenta em todos os corpora avaliáveis
é a vantagem em **erros no estado certo** (+0,30 a +0,38).

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
