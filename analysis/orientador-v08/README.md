# Núcleo de análise orientador v0.8

Implementação offline e determinística para comparar estados CTAT com o
`behaviorGraph` materializado sem alterar a bancada v2 ou os registros da
campanha.

O núcleo expõe, em `index.mjs`:

- extração de átomos CTAT e materializados;
- resolução estruturada de alvo e ação, com os estados
  `exact_target`, `ambiguous_target`, `unknown_action` e
  `composite_unresolved`;
- três alinhamentos LCS independentes e um-para-um: operacional
  `componente+valor`, especificidade SAI
  `componente+família-de-ação+valor` e sensibilidade `valor`;
- família de ação em vocabulário fechado: entrada de texto/número, seleção,
  marcação de reta, botão e `unknown` explícito. No candidato, a evidência vem
  apenas de ação/modalidade estruturada (`actionFamily`, `interactionMode`,
  `renderAs`, `inputType` ou componente de composição), nunca da referência;
- pareamento de erros um-para-um dentro do estado alinhado;
- métricas de presença, tamanho e vazamento lexical das escadas de dicas;
- ledger de extras no nível de ocorrência, sem deduplicar réplicas.

O painel semântico não humano das perguntas 4 e 5 permanece separado dessas
métricas estruturais. Seu protocolo está em
[`../../docs/PROTOCOLO-PAINEL-AUTOMATIZADO-V08.md`](../../docs/PROTOCOLO-PAINEL-AUTOMATIZADO-V08.md).
O módulo `painel-automatizado.mjs` prepara e consolida envelopes cegos; o
dry-run não importa cliente de LLM e faz zero chamadas de rede.

## Prova de execução sem modelo e sem rede

`executar-tutoria-desacoplada.mjs` mantém dois objetos de prova separados:

1. os 105 grafos CTAT de referência, exercidos pelo executor de transições do
   schema neutro v2;
2. os 630 `materializado.behaviorGraph` finais usados no artigo, exercidos por
   `executor-grafo-gerado.mjs` segundo o contrato que esses JSONs realmente
   materializam: `expectedInput` exato, dicas, erro explícito,
   `misconception → scaffold → retorno`, avanço `correct` e `no-match`.

O bloqueio de rede é instalado antes da importação de ambos os executores e
intercepta `fetch`, HTTP(S), HTTP/2, TCP, TLS, UDP, DNS e WebSocket. Para cada
grafo, o ensaio cobre caminho correto completo, cada erro observável presente,
dicas presentes, uma resposta sem correspondência e dez repetições da mesma
trajetória mista. Recursos ausentes não são sintetizados. O fecho de imports
locais dos executores também é enumerado e hashado; a auditoria falha se nele
aparecer adaptador ou provedor de LLM.

```bash
node analysis/orientador-v08/executar-tutoria-desacoplada.mjs \
  --repeticoes 10 \
  --saida resultados/orientador-v08/execucao-desacoplada.json
```

O relatório é determinístico: contém hashes das entradas e trajetórias, totais
por corpus/braço, a contagem observada de chamadas LLM/rede (ambas devem ser
zero) e inventários explícitos. Nos grafos finais, `skip_if_mastered(...)` e
`struggles` são contados, mas não acionados, pois exigem respectivamente um
modelo de domínio e uma política de tentativas externos ao artefato. Nos BRDs,
estados finais ausentes só são inferidos pela regra fechada “sumidouro
alcançável apenas por transições corretas”; regras buggy que compartilham o
mesmo SAI de uma regra correta são contadas como sombreadas por `correct > buggy`.

## Limites deliberados

- Texto de descrição nunca resolve componente ou ação.
- O desempate de cada LCS é a menor sequência lexicográfica de pares
  `[índice CTAT, índice materializado]` entre as soluções máximas.
- Valor composto não é decomposto sem mapeamento estruturado um-para-um.
- Dicas extras são definidas por estado e cardinalidade da escada, não por
  equivalência semântica do texto.
- Arestas e scaffolds só entram quando `incluirInventarioEstrutural=true` e
  recebem `judgment: inventory_only`, pois os `EdgesGroups` CTAT ainda não têm
  equivalência topológica suportada.
- O módulo não lê diretórios, não chama modelos e não grava consolidados.
