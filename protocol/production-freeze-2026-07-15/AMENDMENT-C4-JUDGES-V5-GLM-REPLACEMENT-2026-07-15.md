# Emenda pos-registro: substituicao do GPT-5.4 por GLM-5.2

Data: 15 de julho de 2026, 16:32 UTC. Status: congelada depois da interrupcao
solicitada do painel v4 e antes da primeira chamada do painel analitico v5.

## 1. Decisao e composicao definitiva

Por decisao explicita do responsavel pelo estudo, `openai/gpt-5.4` foi retirado
para reduzir custo. O painel v5 passa a usar exclusivamente:

1. `z-ai/glm-5.2` (familia Z.ai);
2. `qwen/qwen3.7-plus` (familia Qwen/Alibaba);
3. `deepseek/deepseek-v4-pro` (familia DeepSeek).

Nao havera novas chamadas a GPT-5.4 ou Claude. O gerador avaliado permanece
`google/gemini-3.5-flash`, de familia diferente das tres familias de juizes.

## 2. Exclusao universal do painel v4

O painel v4 foi interrompido imediatamente apos a solicitacao. Seu journal
registra 133 tentativas iniciadas, 124 concluidas e nove ambiguas em voo. Todas
as 124 respostas concluidas eram validas: 42 de GPT-5.4, 42 de DeepSeek V4 Pro
e 40 de Qwen 3.7 Plus. O custo contabilizado das tentativas concluidas foi
US$ 0,40896461.

Esses 124 escores sao excluidos em bloco. Qwen e DeepSeek tambem serao
reexecutados desde o inicio no v5, em vez de reutilizados, para que as tres
familias tenham a mesma cobertura, o mesmo congelamento e um painel completo
sem selecao baseada em resultados parciais. O v4 permanece apenas como overhead
tecnico auditavel.

## 3. Verificacao do GLM-5.2 e custo

Antes desta emenda, o registro publico do OpenRouter informou para
`z-ai/glm-5.2`: contexto de 1.048.576 tokens; suporte a `max_tokens`,
`response_format`, `structured_outputs`, `temperature` e `reasoning`; raciocinio
nao obrigatorio; preco observado de US$ 0,8596 por milhao de tokens de entrada e
US$ 2,7016 por milhao de tokens de saida.

O runner usa travas conservadoras ligeiramente maiores: US$ 0,93/M de entrada e
US$ 3,00/M de saida. GLM, Qwen e DeepSeek usam temperatura zero e raciocinio
desativado. O preflight bloqueia se o modelo desaparecer, perder os parametros
necessarios ou exceder os precos congelados.

Reprecificando a amostra observada do v4, o custo esperado das 222 unidades do
GLM e aproximadamente US$ 0,52. Somadas as projecoes de Qwen e DeepSeek, o
painel v5 completo e estimado em aproximadamente US$ 0,96, antes de eventuais
reparos. A execucao possui uma trava de custo contabilizado de US$ 3,00.

O envelope de pior caso de US$ 28 e apenas uma verificacao de projeto: supoe
1.332 chamadas, todas com 30 mil tokens de entrada e 2 mil de saida. Ele nao e
uma reserva, uma cobranca prevista nem autorizacao para gasto. A execucao para
ao atingir a trava observada de US$ 3,00.

## 4. Elementos preservados

Nao mudam: as 204 unidades principais observadas, as 18 mutacoes de controle,
os codigos cegos, os textos apresentados, as rubricas, as cinco dimensoes por
papel, a escala 0--4, a ordem deterministica por modelo, os tres schemas
estaveis por papel, a validacao local exata, a ausencia de fallback, o maximo de
um reparo e as estatisticas planejadas. Nao mudam saidas dos agentes, resultados
deterministicos ou transformacoes do GraphForge.

## 5. Transparencia metodologica

A composicao do painel foi modificada depois do registro original, por custo e
antes do painel v5. O artigo declarara a mudanca, os tres lancamentos excluidos
e seus custos. O painel continua auxiliar: concordancia entre juizes LLM nao
substitui especialistas humanos nem demonstra validade pedagogica externa.

O runner v4 tinha SHA-256
`aa63f533b75cb7483d415e07d6d121ed1e165830b1d526efaf7ae91a1e36ca15`.
O runner v5, sem GPT e sem Claude, tem SHA-256
`eca324bb990170baf771e6331b752c169566f0ce6cd2014c42c85fda75180b86`.

O preflight v5 congela os hashes desta emenda, das unidades, das mensagens, dos
schemas e do manifesto financeiro antes da primeira chamada paga.
