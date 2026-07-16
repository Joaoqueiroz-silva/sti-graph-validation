# Emenda tecnica pos-falha: gramatica estavel por papel

Data: 15 de julho de 2026, 16:09 UTC. Status: congelada depois da interrupcao
do painel v2 e antes da primeira chamada do painel analitico v3.

## 1. Segunda falha de integracao

O schema portavel do v2 foi aceito pelos tres modelos, mas ainda fixava o
`unitCode` por `enum` dentro do schema remoto. Assim, cada uma das 666 unidades--
juiz produzia uma gramatica formal diferente. O provedor Anthropic/Amazon Bedrock
aplica limite de 20 compilacoes de gramatica por minuto e passou a devolver HTTP
400, embora GPT-5.4 e DeepSeek V4 Pro continuassem validos.

O lancamento v2 foi interrompido quando esse padrao se tornou claro. Seu journal,
SHA-256 `e5530a8f81d1759eb01c387b00d63249927a9971fdb99a888abf3de6665d80bb`,
registra 341 tentativas iniciadas em 286 pares unidade--juiz, 329 concluidas, 240
respostas validas, 83 HTTP 400 e 12 tentativas ambiguas em voo. O custo recuperavel
por usage foi US$ 1,80965141. O preflight v2 tem SHA-256
`38a9a404ed7d82bb89651fcfbb3a0677da7bbf9711b2c288fd8779739ba9a191`.

Todos os 240 escores validos do v2 sao excluidos em bloco. Nenhum valor foi usado
para escolher itens, dimensoes, modelos ou criterios. O motivo de exclusao e uma
restricao de infraestrutura verificavel e especifica ao lancamento.

## 2. Correcao v3

O `unitCode` permanece obrigatorio na resposta e continua sendo comparado com o
codigo opaco esperado pelo validador local. Apenas sua restricao remota muda de
`enum:[codigo_da_unidade]` para `type:string`. O `agentRole` e as cinco dimensoes
continuam fixados por papel. Consequentemente, o painel inteiro usa exatamente
tres schemas remotos estaveis, um para cada papel, em vez de 666 schemas.

Tambem se atribui um nome de schema estavel por papel. Nao mudam: mensagens,
conteudo mostrado, respostas dos agentes, ordem, cegamento, rubricas, notas,
validacao local, modelos, configuracoes, teto de tokens, politica de reparo,
mutacoes, analises ou limites interpretativos.

O runner v2 tinha SHA-256
`fcaca6972fd466c35129f46cd5b31a2168f1f9e72ba84aaefc407ec088f50f91`.
O runner v3 tem SHA-256
`a62b951ec2c746827c9c203f4647a04ac93df3bbaa3d3d559b77818678e8b296`.

## 3. Reinicio e relato

Para que nenhuma familia seja analisada sob cobertura ou schema diferentes, o
painel v3 reinicia universalmente as 666 unidades--juiz em novo diretorio. Os
lancamentos v1 e v2 permanecem auditaveis, mas nenhum de seus escores entra na
analise. Chamadas e custos excluidos serao relatados como overhead de integracao.

Esta emenda e pos-resultado e sera declarada no artigo. A correcao e puramente de
gramatica/identidade de transporte: a verificacao substantiva do codigo opaco nao
foi relaxada, pois permanece fail-closed no validador local.
