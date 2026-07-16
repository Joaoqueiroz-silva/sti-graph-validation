# Protocolo da Campanha 4: agentes comportamentais e fidelidade de execucao

> **DOCUMENTO HISTÓRICO CONGELADO.** Este texto registra o protocolo enquanto a
> Campanha 4 ainda estava em preparação e conserva, de propósito, verbos no futuro
> e hipóteses depois emendadas. Não é a descrição final do estudo. Consulte o
> [manuscrito v6.0](manuscript/v6.0/README.md), os manifestos em
> `protocol/production-freeze-2026-07-15/` e a
> [trilha de versões](VERSOES.md). As nove chamadas do piloto foram incorporadas;
> o plano das 45 restantes foi congelado depois do piloto. Por isso C4 é
> exploratória e auditável, não um pré-registro integral anterior a toda coleta.

Status: pre-registro tecnico em construcao. Nenhuma chamada real de LLM faz parte da
etapa de implementacao e validacao deste protocolo. Em 15 de julho de 2026, as
fixtures, o preflight, as metricas diretas e o plano financeiro foram executados
somente em modo offline, com zero chamadas de rede e zero chamadas pagas.

## 1. Objetivo

A Campanha 4 avaliara diretamente os agentes comportamentais 3a, 3b e 3c da rota
legada da EducaOFF, separando a qualidade de suas saidas da estrutura deterministica
produzida pelo GraphForge.

O estudo atual permanece preservado como **Experimento A: bancada controlada CTAT**.
A nova execucao constitui o **Experimento B: fidelidade ao runtime implantado**.

O objeto principal nao e o tutor final entregue ao estudante. O escopo termina em:

```text
estado de autoria
  -> agente 3a: traco correto
  -> agente 3b: erros e remediacoes
  -> agente 3c: hesitacoes e dicas
  -> GraphForge: genericGraph, slotManifest e topologia
```

Os agentes 6 e 7 e a adaptacao do grafo a novos exercicios ficam fora do escopo. O
artigo nao atribuira a Campanha 4 conclusoes sobre o grafo final servido ao aluno.
A rota mais recente tool-first, que nao usa os agentes 3a, 3b e 3c, tambem fica fora
do escopo. Toda alegacao sera limitada a rota legada que contem esses agentes.

## 2. Perguntas de pesquisa

1. **QP1 - agente 3a:** em que medida a sequencia de resultados corretos produzida
   pelo agente recupera, na ordem, as acoes corretas ancoraveis do BRD de referencia?
2. **QP2 - agente 3b:** em que medida as respostas erradas produzidas pelo agente sao
   reconhecidas no passo ou estado em que o BRD as registra?
3. **QP3 - agente 3c:** em que medida o agente produz cadeias completas de quatro
   niveis de dica, distintas, progressivas e sem revelacao prematura da resposta?
4. **QP4 - transporte:** que proporcao do conteudo produzido por cada agente e
   preservada pelo extrator de configuracao e pelo GraphForge?
5. **QP5 - fidelidade:** as requisicoes efetivas, configuracoes e artefatos do braço B
   correspondem ao codigo e ao runtime congelados da EducaOFF?

As propriedades de conectividade, alcancabilidade e integridade referencial sao
verificacoes do GraphForge. Elas nao serao apresentadas como qualidade isolada dos
agentes de LLM.

## 3. Desenho

### 3.1 Experimento A: bancada controlada CTAT

O Experimento A preserva a Campanha 3 e suas saidas historicas. Ele usa uma instancia
concreta por exercicio, resposta correta e vocabulario simplificado de componentes.
Seus resultados estimam desempenho condicionado a essa bancada adaptada.

Os braços DOM e screenshot nao serao usados como evidencia principal ate que cada
exercicio possua uma representacao semanticamente correspondente. O braço textual e
o baseline primario do Experimento A.

### 3.2 Experimento B: fidelidade ao runtime implantado

O Experimento B sera executado em copia descartavel da imagem implantada, identificada
por digest. Ele importara diretamente os agentes 3a, 3b e 3c, o cliente LLM, o
`extractGraphForgeConfig` e o `graphForge` dessa imagem.

O Experimento B nao utilizara:

- `simulate-students-real.js::buildState`;
- `author-graph.js::buildGraphForgeConfig`;
- `author-graph.js::injectStepAnswers`;
- qualquer leitura do BRD antes de as saidas dos agentes serem congeladas.

Serao reportadas duas politicas para o agente 3c:

- **B-operacional:** preserva a condicao real que pode pular o 3c;
- **B-3c-capacidade:** chama diretamente o mesmo agente em todos os exercicios, para
  estimar sua capacidade condicional, sem atribuir essa politica a producao.

## 4. Contrato de entrada do Experimento B

O estado devera obedecer ao esquema versionado da Campanha 4. Os campos diretamente
consumidos pelos agentes sao:

O trecho abaixo mostra um dos quatro problemas-semente; o arquivo executável contém
exatamente quatro objetos no vetor `seedProblems`.

```json
{
  "discipline": "Matemática",
  "topic": "Frações na reta numérica",
  "difficulty": "easy",
  "ageGroup": "11–14 anos",
  "knowledgeComponents": [
    {
      "id": "kc_id",
      "name": "nome",
      "description": "descricao",
      "difficulty": "medium",
      "prerequisites": []
    }
  ],
  "seedProblems": [
    {
      "id": "00bubble",
      "strategy": "polya",
      "statement": "enunciado",
      "expectedAnswer": "resposta",
      "kcsInvolved": ["kc_id"],
      "solutionSteps": [
        {"step": 1, "action": "acao", "result": "resultado", "kc": "kc_id"}
      ],
      "difficulty": "medium",
      "context": "contexto"
    }
  ],
  "sessionId": "c4-id"
}
```

Campos necessarios ao extrator e ao GraphForge, como `interfaceSpec` e
`masterGraphContext`, serao retidos separadamente no estado completo, embora nao
entrem diretamente nos prompts dos agentes 3.

As fixtures comparaveis ao CTAT serao produzidas apenas da interface, do answer key e
de regras do dominio declaradas antes da comparacao. O codigo de autoria nao podera
abrir `expert.brd`, envelopes de referencia, baterias ou relatorios historicos.

### 4.1 Materializacao congelada dos 24 exercicios

Os 24 exercicios de `frac-numberline-6.17` foram materializados em seis estados de
quatro problemas-semente. Em cada estado, as quatro estrategias aceitas pelo runtime
(`polya`, `exemplo_trabalhado`, `problema_invertido` e `descoberta_guiada`) aparecem
uma vez. Enunciado e resposta esperada provem da chave independente; KCs e passos de
solucao sao gerados por regras de fracao na reta numerica declaradas no construtor.

O agrupamento reproduz a cardinalidade de entrada da producao e evita multiplicar
artificialmente o numero de requisicoes. A unidade de pontuacao continua sendo o
`exerciseId`: cada solucao da saida multi-problema deve ser separada antes do calculo
das metricas. O manifesto registra os 24 IDs, os seis hashes de estado e os hashes dos
arquivos. O BRD somente podera ser aberto depois de as saidas brutas dos agentes terem
sido persistidas e fechadas para autoria.

Artefatos executaveis:

- `production-fidelity/build-ctat-fixtures.mjs`;
- `production-fidelity/fixtures/manifest.json`;
- `production-fidelity/fixtures/ctat-production-state-batch-01.json` a
  `ctat-production-state-batch-06.json`.

## 5. Gates obrigatorios antes de chamadas reais

A execucao deve abortar se qualquer gate falhar:

1. digest da imagem diferente do manifesto congelado;
2. hash de agente, cliente LLM, extrator ou GraphForge diferente do esperado;
3. hash do catalogo de misconceptions diferente do esperado;
4. modelo, provedor, temperatura, `maxTokens`, tier ou fallback divergente;
5. estado fora do esquema ou com campos proibidos;
6. fixture sem KCs, resposta esperada ou passos de solucao;
7. hash do prompt efetivo diferente do preflight mockado;
8. acesso a qualquer arquivo do envelope de referencia durante a autoria;
9. GraphForge nao deterministico para a mesma configuracao;
10. ausencia de um limite monetario explicito para a corrida.

O preflight substitui somente a chamada de rede por respostas simuladas e registra o
system prompt, o user prompt, a configuracao efetiva e seus hashes. Ele nao produz
evidencia de qualidade; apenas verifica identidade e encanamento.

## 6. Desfechos primarios

### 6.1 Agente 3a

Sejam `E` os inputs corretos ancoraveis do BRD e `G` os resultados do 3a, ambos
canonizados e ordenados:

```text
R3a_ord = LCS(E, G) / |E|
```

A LCS, maior subsequencia comum, preserva a exigencia de ordem. Resposta final,
recall sem ordem, validade de esquema, atomicidade, KCs, custo e latencia sao
desfechos secundarios.

### 6.2 Agente 3b

O desfecho principal e o recall de erros condicionado ao estado:

```text
R3b_estado = |E_(estado,valor) intersecao G_(estado,valor)| / |E_(estado,valor)|
```

O recall apenas por valor sera secundario. Excedentes nao registrados no BRD nao serao
considerados falsos automaticamente. Duplicacao, resposta igual ao gabarito,
atomicidade e completude de descricao, pergunta diagnostica, feedback e remediacao
serao reportadas separadamente.

### 6.3 Agente 3c

O desfecho principal sera:

```text
C3c_4L = passos elegiveis com quatro niveis completos, distintos e sem vazamento
         / passos elegiveis
```

Taxa de acionamento, sucesso condicional, duplicacao, alinhamento ao passo e possivel
revelacao da resposta serao reportados separadamente. Sem avaliadores humanos, esses
itens sao proxies operacionais e nao demonstram eficacia pedagogica.

## 7. Transporte e GraphForge

Para cada campo sera calculada a taxa de preservacao entre a saida bruta, a
configuracao extraida e os artefatos do GraphForge:

- passos e resultados do 3a;
- misconception ID, resposta errada, diagnostico, feedback e remediacao do 3b;
- nivel, tipo e texto das dicas do 3c.

Integridade estrutural, alcancabilidade, scaffold, retorno e determinismo ficarao em
uma secao propria. `R_ok`, `R_bug` e execucao de tracos no grafo montado serao
rotulados como metricas integradas do subsistema, nao como metricas individuais.

## 8. Retencao sem perdas

Cada caso devera preservar:

```text
rawAgentOutputs.agent3a.advancedTrace
rawAgentOutputs.agent3b.atRiskTrace
rawAgentOutputs.agent3c.averageTrace
rawAgentOutputs.agent3c.skipReason
normalizedAgentOutputs
graphForgeConfig
genericGraph
slotManifest
graphTopology
executionManifest
gateResults
```

O manifesto incluira estado anonimizado e hash, hashes de codigo e prompts, modelo,
temperatura, tokens, custo retornado pelo provedor, fallback, tentativas, latencia e
motivo de falha.

## 9. Plano estatistico

- Unidade inferencial: exercicio.
- Tres replicas independentes por condicao.
- Media das replicas calculada dentro do exercicio antes da inferencia.
- Contrastes pareados por exercicio.
- Intervalos de confianca por bootstrap no nivel do exercicio.
- Falha de chamada, parse vazio ou fallback invalido entra como zero no estimando
  principal; analise condicional aos sucessos e secundaria.
- Tres desfechos primarios: `R3a_ord`, `R3b_estado` e `C3c_4L`.
- Nao sera criado um escore unico de qualidade do grafo.
- O BRD e referencia de um autor, nao verdade pedagogica universal.

## 10. Gate financeiro

Por padrao, todo runner da Campanha 4 opera em modo `dry-run` e nao aceita rede. Uma
execucao real exigira simultaneamente:

1. flag explicita de execucao real;
2. chave do OpenRouter presente;
3. teto da corrida informado em USD;
4. preflight e testes aprovados;
5. manifesto de custo estimado gerado antes da primeira chamada.

O smoke test real usara um unico estado de quatro exercicios e teto proprio. O piloto
pre-registrado usara tres estados, uma replica, sem juizes LLM, com teto duro de
US$ 1,00. A campanha completa tera teto separado de US$ 10,00 sem juizes ou US$ 12,00
com o painel economico. Esses valores sao limites de seguranca, nao previsoes de
gasto. A extrapolacao principal a partir da Campanha 3 estima US$ 0,27--0,36 para o
piloto e US$ 1,60--2,15 para as seis fixtures em tres replicas, antes de juizes; ela
supoe crescimento aproximadamente linear com os quatro seeds dentro de cada chamada
e sera substituida pelo uso medido no piloto. Nenhuma etapa aumentara automaticamente
o limite apos atingi-lo.

## 11. Alegacoes permitidas

Se o Experimento A for reportado isoladamente, a alegacao fica limitada a desempenho
sob uma bancada controlada e adaptada. Se os gates e o Experimento B forem concluidos,
o artigo podera afirmar que o mesmo codigo e runtime implantados foram avaliados sob o
contrato declarado.

Mesmo apos a Campanha 4, o estudo nao demonstrara:

- equivalencia a especialistas em geral;
- validade pedagogica universal dos erros e dicas;
- efeito sobre aprendizagem;
- qualidade do grafo final adaptado pelos agentes 6 e 7;
- generalizacao para outros dominios ou interfaces.

## 12. Criterios de encerramento

A Campanha 4 so sera considerada completa quando:

- todos os testes e gates passarem;
- nenhum arquivo de referencia tiver sido acessado durante a autoria;
- as saidas brutas puderem recalcular todas as metricas por agente;
- custos e falhas estiverem integralmente reportados;
- o LaTeX distinguir Experimento A, Experimento B, agentes e GraphForge;
- o PDF final tiver sido compilado, renderizado e inspecionado visualmente.
