# Emenda tecnica pos-falha: schema portavel e reinicio integral do painel

Data: 15 de julho de 2026, 16:03 UTC. Status: congelada depois da interrupcao
do primeiro lancamento do painel e antes da primeira chamada do painel analitico
v2.

## 1. Evento que motivou a emenda

O primeiro lancamento usou a rubrica e as unidades pre-registradas, mas seu JSON
Schema continha palavras-chave que nao sao aceitas de modo uniforme pelos tres
provedores. Entre 15:56:39 e 15:57:05 UTC foram iniciadas 70 tentativas relativas
a 41 pares unidade--juiz. Cinquenta e oito tentativas terminaram: 54 com HTTP 400,
duas com HTTP 200 sem conteudo e duas com respostas validas do DeepSeek. Doze
tentativas estavam em voo quando o lancamento foi interrompido para impedir que a
falha mecanica se propagasse.

O journal e imutavel e tem SHA-256
`109b2f77aceed7a1849e5370a3f490f88abaae3faf9ce9091c11206b93b99760`.
O preflight e o manifesto financeiro desse lancamento tem, respectivamente,
SHA-256 `8fdc17079b4be34b32c9b3adc8ec5a020a0a84e7d22e41139a8b0388d39500ed`
e `f58fedc390f49e654ab6d3dcd02ea581105dfa8c69ca71933f83bfd10cabcd5e`.

As duas notas validas foram vistas durante a auditoria tecnica, mas ficam
**excluidas integralmente**, junto com todas as demais tentativas do lancamento.
Nenhuma nota, justificativa, custo ou sucesso individual foi usado para selecionar
itens ou alterar a rubrica. A regra de exclusao e por lancamento completo, nao por
resultado.

## 2. Diagnostico isolado

Chamadas diagnosticas fora do painel, com conteudo sintetico sem saidas dos agentes,
confirmaram que o endpoint Anthropic/Amazon Bedrock rejeitava `minimum` e `maximum`
em inteiros do schema. Um schema portavel, composto por tipos, `required`,
`additionalProperties:false` e enumeracoes, foi aceito por GPT-5.4, Claude Sonnet 5
e DeepSeek V4 Pro. O registro publico indica raciocinio padrao alto para o DeepSeek;
com o teto congelado de 2.000 tokens ele podia terminar sem JSON. Como o raciocinio
nao e obrigatorio, `reasoning.effort=none` produziu conteudo estruturado mantendo
modelo, temperatura e teto de saida. As respostas diagnosticas nao entram em
nenhum desfecho.

## 3. Mudancas permitidas no painel v2

Permanecem identicos: 204 unidades principais observadas, 18 mutacoes, codigos
opacos, conteudo, cegamento, ordem por juiz, tres modelos, rubricas, ancoras 0--4,
validacao manual estrita, maximo de um reparo, ausencia de imputacao e criterios de
concordancia/calibracao.

Mudam somente os seguintes elementos de transporte:

1. notas 0--4 usam `enum:[0,1,2,3,4]`, e os limites de tamanho/faixa ficam na
   validacao local ja existente, fora do JSON Schema enviado ao provedor;
2. `provider.require_parameters=true` e `allow_fallbacks=false` exigem suporte aos
   parametros e impedem troca automatica de rota por fallback;
3. apenas para `deepseek/deepseek-v4-pro`, o raciocinio e desativado
   (`effort=none`, `exclude=true`) para preservar o teto pre-registrado de 2.000
   tokens para a resposta avaliativa;
4. erros do provedor e usage passam a ser registrados antes da tentativa de ler o
   conteudo.

O codigo v1 tinha SHA-256
`e96209f62f99dd206eca8eb8a6b49e1f4eac06ffbdde03cf6917c4d3bc54fc91`.
O runner v2 portavel tem SHA-256
`fcaca6972fd466c35129f46cd5b31a2168f1f9e72ba84aaefc407ec088f50f91`.

## 4. Regra de reinicio e relato

O painel analitico v2 reinicia todas as 666 unidades--juiz em diretorio novo; nao
reaproveita nem completa o journal v1. Isso garante que cada familia use uma unica
configuracao dentro do conjunto analisado. O custo e o numero de chamadas do
lancamento abortado e dos diagnosticos serao relatados separadamente como overhead
de integracao, nunca misturados aos 666 julgamentos analiticos.

Esta e uma correcao pos-resultado e sera identificada como tal no artigo. O painel
continua auxiliar: nenhuma alegacao depende dele sem as metricas deterministicas e
nenhuma concordancia entre LLMs e tratada como validacao humana.
