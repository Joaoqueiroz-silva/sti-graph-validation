# Emenda pos-registro: substituicao do Claude por Qwen no painel auxiliar

Data: 15 de julho de 2026, 16:12 UTC. Status: congelada depois da interrupcao
dos lancamentos tecnicos v1 e v2 e antes da primeira chamada do painel
analitico definitivo v4.

## 1. Decisao e escopo

Por decisao explicita do responsavel pelo estudo, o modelo Claude Sonnet foi
retirado para evitar seu custo elevado. Nenhuma chamada do painel analitico v4
havia sido iniciada quando a decisao foi tomada. O painel definitivo passa a
usar tres familias independentes:

1. `openai/gpt-5.4` (OpenAI);
2. `qwen/qwen3.7-plus` (Qwen/Alibaba);
3. `deepseek/deepseek-v4-pro` (DeepSeek).

O gerador avaliado usa `google/gemini-3.5-flash`; portanto, nenhuma familia de
juiz coincide com a familia do gerador.

Os lancamentos tecnicos v1 e v2, ja interrompidos antes desta decisao, continham
algumas chamadas ao Claude. Eles continuam preservados apenas como registro de
overhead de integracao. Todos os seus escores, inclusive respostas validas, sao
excluidos em bloco e nao entram em qualquer resultado, estatistica, calibracao
ou conclusao do artigo. Nao sera feita nova chamada ao Claude.

## 2. Justificativa e travas

O registro publico do OpenRouter, consultado no preflight, deve confirmar que
`qwen/qwen3.7-plus` existe sem duplicidade, aceita `response_format` e
`max_tokens` e nao excede os precos congelados de US$ 0,32 por milhao de tokens
de entrada e US$ 1,28 por milhao de tokens de saida. Se qualquer uma dessas
condicoes falhar, o painel bloqueia antes de chamada paga.

Para Qwen e DeepSeek, o runner fixa temperatura zero e desativa raciocinio
oculto (`effort: none`, com exclusao desses tokens da resposta) para reduzir
variacao e custo. GPT-5.4 conserva sua configuracao compativel registrada. Nao
ha fallback de modelo ou provedor, e cada unidade admite no maximo um reparo do
mesmo modelo.

O pior caso financeiro, calculado antes da execucao para todas as chamadas
primarias e todos os reparos possiveis, deve permanecer abaixo do teto tecnico
de US$ 60. O custo observado sera relatado separadamente do custo de geracao e
do overhead dos lancamentos excluidos.

## 3. Elementos que nao mudam

Permanecem congelados: as 204 unidades principais observadas, as 18 mutacoes de
controle, os codigos cegos, o conteudo apresentado, as cinco dimensoes de cada
papel, a escala 0--4, as ancoras, a ordem deterministica por juiz, o schema
estavel por papel, a validacao local do `unitCode`, o limite de uma reparacao,
as estatisticas de concordancia e a regra de nao imputar julgamentos ausentes.

A troca nao altera saidas dos agentes nem metricas deterministicas. O painel de
LLMs permanece uma evidencia auxiliar de validade de conteudo, sem substituir
avaliacao humana e sem demonstrar validade pedagogica externa.

## 4. Transparencia metodologica

Esta alteracao de composicao ocorreu depois do registro original do painel e
sera declarada como desvio pos-registro motivado por custo, anterior a qualquer
chamada analitica v4. Por isso, as analises do painel devem ser tratadas como
auxiliares e nao confirmatorias em sentido estrito.

O runner v3 congelado antes da substituicao tinha SHA-256
`a62b951ec2c746827c9c203f4647a04ac93df3bbaa3d3d559b77818678e8b296`.
O runner v4, com Qwen e sem Claude, tem SHA-256
`aa63f533b75cb7483d415e07d6d121ed1e165830b1d526efaf7ae91a1e36ca15`.

O preflight v4 materializa os hashes desta emenda, dos schemas, das mensagens e
das unidades antes da primeira chamada paga; o launcher recusa execucao se
qualquer um deles mudar.
