# Execução discente pré-compilada e desacoplada do modelo

Este diretório contém a prova executável de que os grafos finais pré-compilados
podem ser percorridos sem consultar LLM nem rede. O relatório vigente,
[`execucao-desacoplada.json`](execucao-desacoplada.json), separa os artefatos
finais executáveis (630 grafos gerados) da referência especialista (105 BRDs CTAT).

## Artefatos executáveis — 630 grafos finais gerados

- 630 `materializado.behaviorGraph`, cobrindo 105 problemas × 2 braços × 3
  réplicas;
- 4.469 contratos `expectedInput`, todos não vazios e com validador `exact`;
- 4.469 passos corretos aceitos e todos os 630 caminhos concluídos;
- 17.876 dicas presentes e 5.099 pedidos de dica sem mudança indevida de estado;
- 6.021 misconceptions materializadas; as 6.021 rotas
  `erro → scaffold → mesmo passo` foram validadas e exercidas com a devolutiva
  correspondente;
- 630 entradas sem correspondência testadas, todas sem avanço de estado;
- 1.476 passos não possuem misconception e 11 grafos não possuem nenhuma; o
  executor não inventa erros nesses casos;
- 10.490 nós de scaffold, 4.469 arestas `struggles` e 3.839 arestas
  `skip_if_mastered(...)` inventariados;
- 6.300 execuções de trajetórias repetidas com saída byte a byte idêntica;
- zero tentativa de rede e zero chamada LLM.

As políticas `struggles` e `skip_if_mastered(...)` não são acionadas nesta
prova: o JSON não materializa o contador de tentativas nem o modelo de domínio
necessários para decidir essas condições. A execução testada é precisamente a
semântica que os artefatos finais fornecem: entrada exata, dica, erro explícito,
scaffold com retorno, acerto e `no-match`.

## Referência especialista — 105 grafos CTAT

- 105 grafos dos cinco corpora do protocolo v0.8;
- 1.154 passos do caminho correto aceitos e concluídos;
- 746 de 747 transições buggy alcançáveis observáveis e reconhecidas;
- 1 regra buggy sombreada pela precedência documentada `correct > buggy`
  (`ctat-6.20/12charity`);
- 745 mensagens de erro conferidas; uma aresta de
  `ctat-6.17/02watermelon` não possui mensagem no BRD;
- 1.259 pedidos de dica, sem alteração indevida do estado;
- 1.050 execuções de trajetórias repetidas, com saída byte a byte idêntica;
- zero tentativa de rede e zero chamada LLM.

Em 42 grafos, o BRD não declara um estado final alcançável. Nesses casos, a
compilação usa somente a regra determinística “nó-sumidouro alcançável por
transições corretas”. Todos os 105 grafos inventariam ao menos um construto
`EdgesGroups` ainda fora do schema neutro v2. Assim, a evidência sustenta a
execução local da semântica **representada**, e não equivalência integral com
todo o mecanismo de grupos do CTAT.

## Reprodução

```bash
node analysis/orientador-v08/executar-tutoria-desacoplada.mjs \
  --repeticoes 10 \
  --saida resultados/orientador-v08/execucao-desacoplada.json

npx vitest run \
  __tests__/execucao-desacoplada.test.mjs \
  __tests__/trace-executor.test.mjs
```

Os hashes congelados desta execução são:

- artefatos gerados completos: `50d238c55a4c1621675415138c60f437895b88b63cf22b4146eb11c6a3111f61`;
- `behaviorGraph` gerados: `a2ba95dafcfe69d13462ad837bcf0770a7328b71cf1b82761ecf04c80d4cc129`;
- trajetórias geradas: `a6ea1b8daa606656dfc2435b41c2c2e1b3a080398ddced4d499cbff579e370ab`;
- entradas CTAT: `23ad2f80f064c38d908bcae6b714b65fbff002032ca04c13e9372dca33cee4d7`;
- trajetórias CTAT: `3c094915b5d06f1cd3ff76fd49619b04444765110bb1b1405a5c24639bb85720`.
