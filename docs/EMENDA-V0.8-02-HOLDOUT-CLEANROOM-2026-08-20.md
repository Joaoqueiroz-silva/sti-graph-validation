# Emenda v0.8-02 — holdout *clean-room* confirmatório

**Data de congelamento:** 20 de agosto de 2026
**Status no congelamento:** escrita antes de qualquer chamada de modelo para este holdout
**Relação com o protocolo:** esta emenda é aditiva ao protocolo v0.8 e à Emenda v0.8-01. Em caso de conflito, ela prevalece somente para o corpus `holdout-cleanroom-v08`.

## 1. Motivo e independência

O conjunto principal usa exercícios de terceiros e tem natureza exploratória. Para acrescentar uma verificação confirmatória, auditável e redistribuível, será criado por código um holdout original, posterior ao corte analítico, sem copiar ou adaptar enunciados, interfaces, arquivos ou soluções do CTAT/Mathtutor/CMU. Os dados originais serão dedicados ao domínio público sob CC0-1.0; o gerador permanece sob a licença MIT do repositório.

O holdout conterá exatamente **50 problemas**, dez em cada uma de cinco famílias matemáticas geradas por fórmulas: proporcionalidade, porcentagem, média aritmética, equação linear e simplificação de fração. A semente, os parâmetros, os algoritmos de cálculo, os hashes e a referência ficarão congelados em manifesto. O gerador não fará chamada de rede.

## 2. Desenho congelado

- condição única de entrada: `somente-enunciado-v1`;
- 50 problemas × 3 modelos × 10 réplicas = **1.500 unidades de geração**;
- uma execução GraphForge bruta e uma materializada para cada unidade = **3.000 grafos pareados**;
- modelos: `google/gemini-3.1-flash-lite`, `qwen/qwen3-max` e `google/gemini-3.5-flash`;
- temperaturas: 0,2 (3a), 0,7 (3b), 0,4 (3c), 0,5 (planejador 6) e 0,35 (worker 6);
- política de raciocínio compatível e congelada por modelo: Gemini 3.1 Flash Lite `minimal+exclude`; Qwen3 Max sem enviar o campo `reasoning`; Gemini 3.5 Flash `minimal+exclude`; GPT-5.6 Luna `none+exclude`;
- topologia livre; nenhuma interface especialista e nenhum teto artificial de passos;
- fragmentos de no máximo 5 problemas × 10 réplicas, com checkpoint, retomada idempotente, manifesto por chamada e trava global de orçamento.

O `envelope-a.json` do holdout terá somente `id` e `problem`. Respostas, parâmetros, papéis semânticos, ações, erros previsíveis e dicas existirão apenas no `envelope-b.json`/`reference-v08.json`, lidos depois da geração. O gate de entrada deve confirmar que somente o enunciado chegou aos agentes. Falha de gate interrompe a célula antes de gravar um resultado válido.

## 3. Referência e réguas

Cada caminho especialista terá ocorrências ordenadas e uma correspondência 1:1 explicitamente registrada entre:

1. valor esperado;
2. componente semântico (`targetRole` estruturado);
3. família de ação fechada;
4. erros previsíveis ligados a um estado;
5. escada programática de dicas ligada ao mesmo estado.

`targetRole` é evidência estruturada válida do lado candidato. Não será inferido de descrição, instrução, dica, texto livre ou referência. Ausência, conflito ou rótulo diferente permanece desconhecido/não casado. A ação segue o vocabulário fechado da Emenda v0.8-01. O pareamento é LCS 1:1, com desempate lexicográfico determinístico; não há tolerância de ±20%, *fuzzy matching* nem preenchimento do candidato com o gabarito.

## 4. Hipótese, desfecho e análise confirmatória

### Hipótese primária

Para a mesma unidade problema × modelo × réplica, a materialização altera a fidelidade SAI em relação ao GraphForge bruto. A expectativa direcional é melhora, mas o teste confirmatório será bicaudal:

- H0: a média populacional da diferença pareada `F1_SAI(final) − F1_SAI(bruto)` é zero;
- H1: essa média é diferente de zero.

### Desfecho primário

`F1_SAI` conservador por grafo, com componente, família de ação e valor simultaneamente iguais sob alinhamento 1:1. As dez réplicas serão primeiro promediadas dentro de cada problema × modelo; em seguida, os três modelos serão promediados dentro de cada problema. A unidade inferencial primária será o **problema (n=50)**. Assim, nem as chamadas repetidas nem os três modelos que compartilham o mesmo item são tratados como observações independentes.

### Estatística primária

- estimando: média das 50 diferenças por problema, cada uma já agregada sobre réplicas e modelos;
- teste de permutação pareada por inversão de sinal no nível do problema, 100.000 permutações, semente `8042026`, bicaudal, α=0,05;
- intervalo de confiança de 95% por *bootstrap* de cluster, reamostrando os 50 problemas; 10.000 reamostragens, semente `8042027`;
- análise por intenção de coletar: run previsto sem artefato válido após encerramento definitivo recebe `F1_SAI=0`; falhas são também reportadas separadamente. Nenhum run será excluído por desempenho.

### Desfechos secundários, sem promoção pós-hoc

- precisão, revocação e F1 das réguas de valor e operacional;
- precisão, revocação e F1 SAI por modelo;
- recuperação 1:1 de erros e presença/estrutura de dicas;
- proporção de nós com `targetRole` e família de ação resolvidos;
- desvio-padrão dentro de problema e ICC entre problemas;
- comparações de modelos sobre médias por problema, bicaudais, com ajuste de Holm nas três comparações;
- inventário de estados, erros e dicas extras por ocorrência;
- taxa de integridade estrutural, vazamento de entrada, placeholders, fallback de modelo e falhas de execução.

Esses desfechos são secundários; os intervalos e valores-p serão identificados como tais. Julgamentos automáticos sobre adequação pedagógica do feedback, se executados, permanecerão exploratórios e não substituirão validação humana.

## 5. Regras de parada e imutabilidade

Não haverá parada por resultado. A execução para somente por: trava de custo, credencial/modelo inválido, quebra de integridade, vazamento, arquivo órfão, falha técnica com `fail-fast` ou solicitação explícita do pesquisador. Uma retomada exige o mesmo manifesto byte a byte; chamada com recibo e sem JSON final não pode ser repetida sem autorização específica.

Após a primeira chamada, enunciados, referências, hipóteses, seeds, modelos, réplicas, estatística e código de pontuação ficam congelados. Correção indispensável será uma nova emenda, com análise antiga preservada e nova versão explicitamente rotulada.

## 6. Custo e autorização

Usando os mesmos perfis de tokens e preços congelados do plano v0.8 (tokens mínimos de raciocínio, quando cobrados pelo provedor, entram em `completion_tokens` e no ledger real):

- holdout adicional: custo esperado de aproximadamente **US$ 51,52**; teto recomendado de **US$ 60**;
- experimento principal + holdout: custo esperado de aproximadamente **US$ 267,92**;
- teto duro global combinado: **US$ 310**.

Esses valores são estimativas; o `usage` efetivo do provedor prevalece. O teto é limite máximo, não autorização implícita. **Nenhuma chamada paga poderá começar sem autorização expressa do pesquisador para o teto global combinado.**
