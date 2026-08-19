# Alterações no artigo pela rodada de julgamento de 19/08 · número a número, com arquivo de origem

Todos os números abaixo foram lidos programaticamente nos arquivos antes de entrar no texto (81 comparações de igualdade; 1 correção contra o próprio prompt, ver "Avisos").

## Avisos (a regra de ouro aplicada ao próprio prompt)

**A1.** O prompt afirma que "o texto atual traz precisão 0,7173 e F1 0,7081". O artigo não trazia esses agregados: trazia precisão e F1 por corpus × braço (régua congelada) na Tabela 2. A correção foi aplicada onde os números de fato moram: as 20 células da Tabela 2 foram trocadas pelas simétricas de `consolidado-simetrico.json`, e os agregados 0,7173→0,8205 e 0,7081→0,7620 entraram como a nota de leitura do §5.2 e no §4.3.

**A2.** O prompt (Parte 3, Achado 2) diz que o juiz de estados "aceitou 69%" dos `wrongAnswer`. Esse número não existe nos arquivos. O real, em `reprovados-no-gate/juiz-estados-z-ai-glm-4-5.json`: aceitou **35,3%** dos `distrator-erro-do-especialista` (204/578), derrubando a rejeição total para **0,741** (< 0,80 do gate). O artigo usa 35,3% e 0,741. O argumento conceitual permanece o mesmo.

**A3.** O RESULTADOS.md do juízo arredonda a queda do controle estrangeiro para "1,47 ponto"; o JSON dá 1,9676 − 0,5048 = 1,4628 → o artigo usa **1,46** (arquivo vence o resumo).

**A4.** A temperatura do juiz (0,1, citada no prompt) não está registrada nos arquivos e por isso **não** é afirmada no artigo.

## Parte 1 · Correção de precisão/F1 (régua simétrica)

| Onde no artigo | Alteração | Origem |
|---|---|---|
| Tabela 2 (10 células de precisão) | 0,866→0,997 · 0,790→0,972 · 0,779→0,872 · 0,740→0,839 · 0,619→0,704 · 0,546→0,638 · 0,803→0,908 · 0,748→0,866 · 0,449→0,499 · 0,772→0,819 | `consolidado-simetrico.json` (tabela, `precisaoSimetrica`) |
| Tabela 2 (10 células de F1) | 0,813→0,871 · 0,852→0,952 · 0,738→0,780 · 0,726→0,774 · 0,748→0,809 · 0,700→0,770 · 0,855→0,913 · 0,827→0,895 · 0,191→0,193 · 0,427→0,435 | idem (`f1Simetrico`) |
| §5.2 nota de leitura | agregados congelada→simétrica: precisão 0,7173 [0,6977; 0,7362] → 0,8205 [0,8038; 0,8363]; F1 0,7081 [0,6932; 0,7228] → 0,7620 [0,7476; 0,7764]; ICs sem sobreposição | idem (`agregado`) |
| §5.2 terceira leitura | 6.18 qw: precisão 0,546→0,638 ("mais de um terço" em vez de "metade"); F1 0,700×0,748→0,770×0,809; faixa de F1 dos corpora de frações 0,70–0,86→0,77–0,95 | idem |
| §5.6 | F1 que inverte: 6.18 0,770×0,809 e 6.20 0,895×0,913 (a inversão sobrevive à correção) | idem |
| Resumo | precisão 0,72→0,82 e F1 0,71→0,76 no agregado, "sem mover nenhuma cobertura, por invariante testado" | idem |
| Invariantes citados | cobertura 0,7439 · base 0,3962 · ajustada 0,5931 idênticas nas duas réguas | idem (`agregado.congelada` = `simetrica`) |

## Parte 4 · §4.3 novo (metodologia do reparo)

| Número no texto | Origem |
|---|---|
| 439 de 4.469 estados de agente = 9,8%; presente nos 5 corpora (7,6% a 11,6%) | `consolidado-simetrico.json` (`reparo`) + S24 §4.1 |
| Teste de simetria: 0 de 807 estados do especialista atingidos | S24 §4.2 + `regua-simetrica.mjs` (teste no suíte) |
| 8.12 quase não se move: F1 0,191→0,193 e 0,427→0,435 | `consolidado-simetrico.json` |
| Regra rejeitada: 14,1% suspeita; 132 dos 209 erros do 8.12 são "*"; dos 850 valores, 73,9% combo, 0,2% (2) lixo | S24 §4.4 |

## Parte 2 · §§4.4–4.5 e §5.7 novos (dicas) + Tabelas 5 e 6

| Número no texto | Origem |
|---|---|
| Saturação da métrica antiga: 1,000 em 9 de 10 células; exceção fl 8.12 = 0,754 | S24/S31 (Parte 0) |
| Tabela 5 completa (bottom-out 0,849/0,859 vs 0,019/0,026; escada completa 0,807/0,830 vs 0,019/0,025; algum nível 0,933/0,939 vs 0,048/0,068; níveis 2,970/2,933 vs 4,000; chars 71,7/68,1 vs 81,7/75,8, com todos os ICs) | `dicas-consolidado.json` (`agregado`) |
| Por corpus: especialista 0,573–1,000; agentes 0,000–0,053, nas 10 células | `dicas-consolidado.json` (`tabela`) |
| Conformidade: 97,4%–98,1% (última sem valor) e 93,2%–95,2% (nenhum nível) | derivado de `dicas-consolidado.json` (1 − métricas do agente) |
| Citações da política (prompt do agente 6, linha 556; quality-gate, linhas 1353–1357; decisão de 02/08/2026) | `producao/agents/prompts/agent6-worker-prompt.js` + `producao/agents/patterns/quality-gate.js` (verificadas no espelho) |
| Gate do juiz: estrangeiro 0,50 de especificidade (queda de 1,46; margem 0,5); embaralhado 2,34 especificidade, 2,86 acionabilidade, 0,45 escalonamento | `juiz-dicas-z-ai-glm-4-5.json` (`controles`, `porOrigem`) |
| Tabela 6 (1,96/1,97/1,97 · 1,88/1,89/1,88 · 2,81/2,09/2,13 · 79%/3%/10%) | idem (`porOrigem`) |
| Volume: 1.452 escadas, 0 sem veredito; 1.254 reais | idem (`julgamentos`, `falhas`, soma dos n) |
| Dimensão `correcao` retirada: 83%/92%/89%; 79 escadas; exemplo do 6.19 ("3/5, não 5"); 32% no 8.12 vs 5–16% | idem (`taxaCorrecao`; 473−394=79) + S24 §2.3 |
| Amostragem, rubrica, controles, gate, agregação (10.000 reamostragens, semente 42) | S31 (pré-registro) + `lib.mjs` (`intervalo`, seed 42, B=10000) + S28/S29 |

## Parte 3 · Discussão: dois achados sobre juízes de LLM

| Número no texto | Origem |
|---|---|
| Com × sem raciocínio (n=42): 0,929×0,714 (especialista), 0,565×0,419 (extras), 0,982×0,982 (distratores) | S24 §3.1 + S31 (emenda 3) |
| "Teríamos publicado 13%": extras aceitos pelo juiz descalibrado = 0,132 | `reprovados-no-gate/juiz-estados-z-ai-glm-4-5.json` (`geral.extras.rate`) |
| Juiz de estados: aceitou 35,3% dos distratores-erro; rejeição total 0,741 < 0,80 | idem (`porDistrator`, `rejeicaoDistratores`) — corrige o "69%" do prompt (aviso A2) |
| Fraqueza do controle declarada antes de rodar | S31 (emenda 1, "LIMITAÇÃO DECLARADA") |

## Parte 5 · Limitação 11 nova (extras sem veredito)

| Número no texto | Origem |
|---|---|
| glm-4.5 sem raciocínio 0,479 (n=676), rejeição 0,984 (n=820); deepseek-v4-flash 0,501, rejeição 0,957; gate 0,80; acordo 78,3%, kappa 0,534 | `reprovados-no-gate/juiz-extras-*.json` + S24 §3 |
| Luna escreve 43,8% dos erros julgados (2.637 de 6.021) | S24 §3.2 |
| Rodada de 14/08 (~50% válidos) citada só como outro objeto | S31 (Parte 0) |

## Parte 6 · Reprodutibilidade

| Número no texto | Origem |
|---|---|
| 4 incidentes; 904 escadas descartadas; US$ 12,75 gastos, US$ 10,65 descartados | S24 §5 + `descartado/LEIA-ME.md` |

## Figuras novas (a pedido do autor, 19/08 à noite)

Figura 13 (metodologia da régua de dicas com um par real: escadas literais do envelope B do `00bubble` e do run `00bubble_rep1`, as seis medidas aplicadas ao par, a regra de token com fronteira); Figura 14 (o desenho do juiz cego: pilha de 1.452 sem identificação com 473+329+452 reais, 105 estrangeiras e 93 embaralhadas; rubrica; os números do gate); Gráfico 2 (painel A: as notas do juiz por dimensão e origem; painel B: a convergência régua léxica × juiz). Linguagem das Seções 4.3 a 4.5 e 5.7 revisada para acessibilidade (escada e bottom-out definidos antes do uso; "quem julga não é parente de quem fez"; controles como "pegadinhas"; kappa glosado).

## Demais mudanças editoriais

Resumo estendido (simetria + dicas + extras sem veredito); §3.2 e Figura 3 regeneradas (pergunta 4 respondida para dicas; pergunta 5 parcial); §5 passa a sete tempos; Discussão ganha o 4º achado (política, não incapacidade) e a leitura prática do professor; limitações 3 e 8 reescritas; Apêndice A ganha S24–S33. Total: 35 páginas, zero travessões, 81 comparações de igualdade contra os arquivos (80 exatas; 1 corrigida a favor do arquivo, aviso A3).
