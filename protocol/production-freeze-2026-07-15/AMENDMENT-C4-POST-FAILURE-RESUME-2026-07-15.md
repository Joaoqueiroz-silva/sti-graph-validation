# Emenda de auditoria: falha de parse e retomada sem repeticao

Data: 15 de julho de 2026, 15:20 UTC. Status: registrada depois da falha do grupo 5
e antes de qualquer chamada do grupo 6.

## 1. Evento preservado

O grupo `c4-full-real-20260715-r3-batches-01-03` parou no terceiro estado da
replica 3. As chamadas de 3a e 3b chegaram do provedor e tiveram usage contabilizado;
o parser de producao aceitou 3a, mas nao conseguiu recuperar o JSON bruto de 3b.
O erro observado foi `Expected ',' or '}' after property value` na posicao 11637.
O hash da resposta bruta de 3b e
`97a7cf19cd6379a4807e44e0082b0e0f06b5ace8d1e1ce4240ab99f078603207`.

Artefatos imutaveis da falha:

- resultado: SHA-256
  `8ce320c4ba93208fba9ad90e93759f14a5d73a943a86b93d094eb427a293717b`;
- checkpoint: SHA-256
  `16ead67821c0402e5d7dfed2ca4a5c73bd9ff512e9d7288b6ab6ee9b1d90fcee`;
- journal: SHA-256
  `654657cbdd64be8050191d3954e3bb14ed50932405d96bf8dfcc694ceca0482c`;
- metricas ITT pos-fechamento: SHA-256
  `ab64425069fd00163a19ffd4cf3df456fda684e334332cbcd6ebb30c2c1c0744`.

O checkpoint terminou `aborted`, com `reservedUsd=0`, oito chamadas contabilizadas,
nenhuma tentativa desconhecida em voo, nenhum retry e nenhum fallback. O 3c do
estado falho permaneceu `pending` e nao foi chamado. O custo contabilizado do grupo
ate a interrupcao foi US$ 0,2816355.

## 2. Tratamento do estado falho

O estado `campaign4-ctat-batch-03` da replica 3 nao sera repetido, reparado por LLM
nem substituido por uma nova amostra. No estimando ITT do pipeline, seus quatro
exercicios recebem zero/ausencia conforme o contrato congelado para 3a, 3b e 3c e
transporte; a analise condicional a estados completos fica secundaria.

A resposta bruta valida de 3a e a resposta malformada de 3b podem aparecer apenas em
uma analise forense, rotulada post hoc, para distinguir falha do gerador de perda
atomica do runner. Elas nao substituem o resultado ITT. Nao se tentara instanciar,
completar ou corrigir o JSON de 3b.

## 3. Retomada limitada

O fail-stop cumpriu sua funcao e permitiu reconciliar todas as oito chamadas. O
grupo 6 (`replica 3, batches 04--06`) permanece inteiramente nao tentado: seu
diretorio contem somente o preflight offline congelado, sem resultado, chave,
checkpoint ou journal.

Para evitar que uma falha em quatro exercicios produza ausencia artificial nos doze
exercicios independentes seguintes, fica autorizada a execucao **somente** do grupo
6, com a configuracao e a ordem ja congeladas. Isso nao e retry, nao altera uma
unidade observada e nao depende do conteudo das saidas futuras. O grupo 5 continua
intacto e nunca sera reiniciado.

Se o grupo 6 concluir, a campanha tera 53 chamadas efetivamente realizadas, 17 de
18 estados-replica completos e 68 de 72 unidades exercicio-replica completas por
agente. Se ele falhar, a execucao para definitivamente e a nova falha tambem entra
sem repeticao.

O teto agregado de US$ 10,80 e todas as travas de preco, tentativa unica, hash de
prompt, imagem, ontologia e GraphForge permanecem inalterados.
