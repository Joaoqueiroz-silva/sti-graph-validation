# Emenda pre-execucao: painel auxiliar cego de juizes LLM da Campanha 4

Data: 15 de julho de 2026. Status: congelada antes da primeira chamada real dos
geradores e, portanto, antes da observacao de qualquer saida da Campanha 4.

O painel e um desfecho **auxiliar** de validade de conteudo. Ele nao substitui as
metricas diretas pre-registradas, nao transforma consenso de modelos em verdade
pedagogica e nao sera usado para omitir resultados desfavoraveis.

## 1. Unidade, isolamento e universo

A unidade e `exerciseId x replica x agente`. Cada requisicao avalia exatamente uma
saida de um agente para um problema. Saidas de 3a, 3b e 3c nunca aparecem na mesma
requisicao; artefatos do GraphForge nunca sao mostrados. O universo maximo e:

```text
24 exercicios x 3 replicas x 3 agentes x 3 juizes = 648 julgamentos principais
```

Falha de geracao continua no denominador ITT das metricas diretas. Ela nao recebe
uma avaliacao pedagogica inventada: fica ausente no painel, com motivo e denominador
reportados. Nenhuma saida sera escolhida ou descartada pelo seu conteudo.

## 2. Painel congelado

Tres familias diferentes, nenhuma delas pertencente a familia geradora Google:

1. `openai/gpt-5.4`;
2. `anthropic/claude-sonnet-5`;
3. `deepseek/deepseek-v4-pro`.

Todos usam OpenRouter, `max_tokens=2000` e `response_format` estruturado. Temperatura
e omitida para GPT-5.4 e Claude Sonnet 5, pois o registro publico nao a declara como
parametro suportado; para DeepSeek V4 Pro, `temperature=0`. Nao ha fallback de
modelo. Uma falha de transporte ou JSON invalido pode receber no maximo uma chamada
de reparo, que preserva o mesmo conteudo, modelo e rubrica e fica contabilizada como
tentativa adicional. Nao ha terceiro chamado nem substituicao por outro juiz.

Antes do painel, um manifesto financeiro deve congelar numero maximo de chamadas,
tetos de tokens, precos publicos observados e limite total em USD. Nenhuma elevacao
automatica de limite e permitida.

## 3. Cegamento e ordem

O juiz recebe apenas: enunciado, resposta esperada, KCs e passos de solucao da
fixture independente necessarios para interpretar a saida; a saida bruta recortada
pelo `problemId`; a funcao comportamental avaliada; e a rubrica correspondente.
Ficam ocultos modelo gerador, temperatura, nome `Agent3*`, batch, replica, run ID,
custo, latencia, resultados de outros juizes, metricas CTAT/BRD e GraphForge.

Cada unidade recebe um codigo opaco derivado de SHA-256 do hash do congelamento e da
identidade da unidade. A ordem das unidades e permutada deterministamente pelo mesmo
hash e cada juiz recebe uma permutacao distinta. O mapa de reidentificacao fica em
artefato separado. O runner registra os prompts e seus hashes antes das respostas.

## 4. Regras interpretativas obrigatorias

- **3a:** `{A}`, `{B}` e `{C}` sao placeholders intencionais solicitados pelo prompt.
  A mera genericidade nao reduz a nota. Penaliza-se somente relacao generica
  incoerente, nao vinculada, incompleta ou matematicamente incorreta.
- **3b:** um erro plausivel ausente do BRD nao e falso positivo por esse motivo. O
  juiz avalia plausibilidade cognitiva, diagnostico, feedback e remediacao; nao
  avalia coincidencia com o inventario de um autor.
- **3c:** o gabarito e mostrado apenas para detectar revelacao prematura. O juiz
  diferencia dica progressiva de entrega antecipada da resposta.
- Nao se pede comparacao entre agentes nem um escore global de "qualidade do grafo".

## 5. Rubrica ordinal 0--4

Ancora comum a todas as dimensoes: `0` = ausente, contraditorio ou inutilizavel;
`1` = deficiencia grave; `2` = parcial/misto; `3` = adequado com falha menor;
`4` = plenamente correto, especifico e utilizavel. Cada nota exige justificativa
curta ancorada no conteudo observado. Nao se calcula media entre dimensoes como
desfecho principal.

### 5.1 Traco correto (3a)

1. `correctness_coherence`: consistencia matematica interna e com a resposta.
2. `procedural_coverage_order`: cobertura e ordem dos passos essenciais.
3. `kc_alignment`: aderencia aos componentes de conhecimento declarados.
4. `generic_transfer`: placeholders bem definidos e relacoes transferiveis.
5. `actionability`: acoes atomicas e executaveis por um estudante simulado.

### 5.2 Erros e remediacao (3b)

1. `error_plausibility`: resposta errada distinta do gabarito e cognitivamente
   plausivel; novidade em relacao ao BRD nao e penalizada.
2. `causal_diagnosis`: descricao e pergunta diagnostica identificam o mecanismo.
3. `feedback_quality`: feedback correto, seguro, especifico e nao humilhante.
4. `remediation_actionability`: `howToFix` oferece acao concreta e apropriada.
5. `step_alignment`: erro e intervencao correspondem ao conteudo/passo declarado.

### 5.3 Hesitacao e dicas (3c)

1. `step_alignment`: cadeia corresponde ao problema e ao ponto de hesitacao.
2. `scaffold_progression`: apoio cresce de conceitual a `bottom_out`.
3. `distinctness`: niveis nao sao repeticoes parafraseadas.
4. `non_leakage`: 4 significa nenhuma revelacao prematura; 0, entrega imediata.
5. `clarity_actionability`: linguagem clara e proximo passo executavel.

## 6. Contrato de resposta

JSON estrito, sem texto externo, contendo: `unitCode`, `agentRole`, cinco inteiros
0--4 com os nomes acima, `rationale` de no maximo 80 palavras, ate duas evidencias
curtas, `confidence` entre 0 e 1 e `flags` de um vocabulario fechado. O runner deve
rejeitar dimensoes ausentes, extras ou fora da faixa; a camada de analise nunca
extrai notas de prosa livre.

## 7. Concordancia, sintese e ausencias

Para cada agente e dimensao serao reportados: distribuicao por juiz, mediana entre
juizes por unidade, intervalo interquartil, percentual de diferenca maior que um
ponto, alfa de Krippendorff ordinal e kappa ponderado quadratico por par. Alfa abaixo
de 0,667 sera rotulado concordancia fraca; 0,667--0,799, provisoria; e pelo menos
0,800, forte. Os valores brutos permanecem visiveis independentemente da faixa.

Consenso exige pelo menos dois julgamentos validos; do contrario a unidade fica
ausente. Nao ha imputacao. Resultados de um unico modelo nunca sao descritos como
consenso. As comparacoes entre replicas usam o exercicio como cluster e nao tratam
os tres juizes como novas observacoes independentes.

## 8. Calibracao por mutacoes

Antes de julgar as mutacoes, sao selecionados deterministamente os exercicios nas
posicoes 1, 5, 9, 13, 17 e 21 do manifesto ordenado, sempre na replica 1. Reutilizam-
se as notas originais do painel principal e cria-se uma degradacao por agente:

- 3a: contradicao matematica e remocao de um passo essencial;
- 3b: `wrongAnswer` igual ao gabarito e remocao do diagnostico/remediacao;
- 3c: duplicacao dos niveis e revelacao do gabarito na primeira dica.

Cada juiz avalia a versao mutada sem saber que e mutacao: no maximo 54 chamadas
adicionais, mais os eventuais reparos ja limitados. Por dimensao afetada, reportam-se
delta pareado, proporcao de degradacoes detectadas e empates. Menos de 80% de deltas
negativos sinaliza a dimensao como nao calibrada; ela continua reportada, mas nao
sustenta alegacao positiva.

## 9. Alegacao permitida

O painel pode sustentar apenas que tres modelos de familias distintas julgaram as
saidas segundo a rubrica congelada, com a concordancia e a calibracao observadas.
Nao demonstra equivalencia a especialistas humanos, validade clinica/cognitiva dos
erros, eficacia das dicas, aprendizagem nem generalizacao para outros dominios.
