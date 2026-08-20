# Protocolo v0.8 — reanálise automatizada e plano prospectivo

**Projeto:** validação de grafos de comportamento CTAT × EducaOFF  
**Data:** 20 de agosto de 2026  
**Escopo imediato:** análises sem participantes humanos  
**Estatuto:** reanálise exploratória dos 630 grafos existentes; plano prospectivo separado para qualquer nova coleta

> Emenda vinculada: `EMENDA-V0.8-01-ANCORAGEM-E-COLETA-2026-08-20.md`.
> Ela remove qualquer resolução por texto livre e fecha o desenho prospectivo;
> a reanálise existente permanece exploratória.

## 1. Por que este documento existe

Este protocolo transforma as orientações da última reunião com o orientador em regras executáveis e auditáveis. Ele foi escrito antes da geração dos novos artefatos derivados da v0.8, mas depois de os dados originais terem sido observados. Por isso, nenhuma análise dos 630 grafos existentes será apresentada como confirmatória.

O protocolo separa duas trilhas:

1. **Trilha E — reanálise existente:** usa somente os 630 registros já coletados. Pode recalcular métricas, auditar o compilador, comparar estágios e produzir figuras. Seus resultados são exploratórios.
2. **Trilha P — execução prospectiva:** inclui novos braços, novas réplicas ou novos juízes. Só começa depois de um manifesto imutável, orçamento, autorização do autor e congelamento público do código. Quando reutilizar os mesmos corpora já inspecionados, continuará exploratória; apenas um corpus novo, não inspecionado e selecionado antes das gerações poderá sustentar testes confirmatórios.

Nenhuma mudança deste documento depois da inspeção dos novos resultados poderá ser silenciosa. Toda mudança será uma emenda datada e reclassificará como exploratória a análise afetada.

## 2. O que a etapa sem humanos pode e não pode demonstrar

Ela pode demonstrar:

- integridade estrutural e executabilidade do artefato;
- aderência ao problema fornecido;
- concordância com estados, caminhos, erros e dicas representados no CTAT;
- diferenças descritivas entre modelos e entre estágios do pipeline;
- execução do tutor compilado sem chamadas posteriores a modelos;
- reprodutibilidade dos resultados derivados a partir dos registros congelados.

Ela não pode demonstrar:

- aprendizagem de estudantes;
- adequação pedagógica definitiva;
- aceitabilidade por professores;
- economia real de tempo docente;
- equivalência entre o grafo CTAT e um consenso de especialistas;
- segurança para publicação automática de um tutor sem revisão.

O grafo CTAT será chamado de **melhor régua disponível neste estudo**, e não de verdade final. O manuscrito discutirá o *expert blind spot*: especialistas podem omitir passos que são difíceis para iniciantes. Julgamentos de LLMs serão rotulados como evidência automatizada exploratória, nunca como substitutos de avaliadores humanos.

## 3. Perguntas de qualidade

A análise seguirá as cinco perguntas solicitadas pelo orientador.

1. **O grafo funciona?** O arquivo é íntegro, executável, completo e aderente ao problema?
2. **Ele recupera o que a referência prevê?** Qual proporção dos estados e erros comparáveis do especialista reaparece?
3. **Cada elemento está no estado correto?** Estados-chave aparecem na mesma ordem relativa? Erros e dicas estão ancorados ao estado equivalente?
4. **O feedback é adequado?** Quais propriedades verificáveis possuem o feedback de erro e as escadas de dicas? O texto é específico, progressivo, acionável e matematicamente consistente segundo avaliação automatizada calibrada?
5. **O que fazer com os extras?** Quantos estados, segmentos de caminho, erros e níveis de dica aparecem além da referência? Quais parecem plausíveis em uma avaliação automatizada cega e exploratória?

Perguntas adicionais:

6. O resultado depende do modelo de linguagem usado para simular os perfis de estudante?
7. A materialização/enriquecimento muda o resultado em relação ao estágio bruto do mesmo registro?
8. O tutor final funciona em modo **IA unplugged**, sem inferência de LLM durante o uso?

## 4. Dados existentes e unidades

A Trilha E contém 105 exercícios de cinco corpora, dois braços e três réplicas:

`105 exercícios × 2 braços × 3 réplicas = 630 grafos`.

- **Unidade de geração:** um grafo para um exercício, braço e réplica.
- **Unidade inferencial:** o exercício.
- **Réplicas:** medições aninhadas no exercício, nunca observações independentes.
- **Contraste de estágio:** o mesmo registro antes e depois da materialização.
- **Unidade de estado:** uma ocorrência em uma sequência; valores repetidos em posições diferentes são ocorrências diferentes.
- **Unidade de erro:** uma ocorrência de resposta incorreta ancorada em um estado.
- **Unidade de dica:** uma escada de dicas ancorada em um estado.

Os 630 arquivos de `runs/` são imutáveis. A v0.8 só acrescentará scripts, testes e resultados derivados.

## 5. Integridade e aderência ao problema

Todo grafo permanece no denominador operacional. Falhas estruturais, ausência de campos obrigatórios ou falha permanente de materialização não serão excluídas por conveniência.

Serão reportados:

- número total esperado, encontrado e analisável;
- taxa de integridade estrutural com intervalo exato de 95%;
- hashes, modelo, custo, prompt e registros brutos presentes;
- aprovação do gate por enunciado;
- aprovação dos gates conservadores por valores, apenas como sensibilidade;
- falhas por tipo e por estágio.

O gate por enunciado demonstra apenas que o pipeline permaneceu no problema recebido. Ele não demonstra correção matemática ou qualidade pedagógica.

## 6. Estados e três níveis de comparação

O artigo deixará de usar “grafo equivalente” como sinônimo de uma sequência parecida. Serão distinguidos três níveis.

### 6.1 Estado operacional — análise principal nova

A assinatura é:

`(componente canonizado, valor canonizado)`.

O componente do especialista vem da `selection` da ação CTAT. O componente do agente só será aceito quando for identificável deterministicamente no `behaviorGraph` materializado:

- alvo declarado em `expectedInput`/`componentProps`;
- ou identificador único da interface explicitamente mencionado na instrução do passo.

Não será usado um LLM para inferir componentes. Se houver zero ou mais de um alvo possível, o passo será marcado como **componente ausente/ambíguo**. Na análise conservadora, ele não casa com a referência e continua no denominador da precisão.

### 6.2 Ação SAI estrita — análise de especificidade

Quando os dois lados possuírem informação suficiente, será usada a tripla:

`(componente canonizado, família de ação, valor canonizado)`.

As famílias de ação serão uma lista fechada e testada, por exemplo: entrada de texto/número, seleção de opção, marcação em reta e acionamento de botão. A cobertura dessa análise será reportada. Ação desconhecida nunca será inventada.

### 6.3 Valor — sensibilidade histórica

A sequência de valores canonizados será mantida para comparação com a v0.7. Ela mede fidelidade da sequência de respostas, não identidade do estado completo nem topologia do grafo.

## 7. Canonização

A canonização aplica-se aos elementos comparáveis dos dois lados e nunca ao texto livre das dicas.

- frações são reduzidas;
- decimais equivalentes são convertidos para a mesma chave;
- números mistos e percentuais seguem regras explícitas e testadas;
- multiplicidade é preservada;
- tokens simétricos de conclusão são neutralizados sem remover sua posição física;
- não existe margem de ±20% nem tolerância arbitrária de posição.

Casos de teste obrigatórios incluem `0,2 = 1/5 = 2/10`, valores repetidos e tokens de conclusão nos dois lados.

## 8. Pareamento um-a-um dos estados

O pareamento será a maior subsequência comum (LCS) entre a referência e o agente. Cada ocorrência pode casar no máximo uma ocorrência.

Em caso de múltiplos alinhamentos ótimos, o desempate será determinístico: menor sequência lexicográfica de pares de índices. Para erros e dicas, será feita análise de sensibilidade com os limites mínimo e máximo entre alinhamentos ótimos quando isso for computacionalmente viável.

Para referência `R`, agente `A` e `TP = |LCS(R,A)|`:

- `recall = TP / |R|`;
- `precisão = TP / |A|`;
- `F1 = 2TP / (|R| + |A|)`;
- cobertura sem ordem = interseção de multiconjuntos, com casamento 1:1;
- contenção integral = 1 quando toda a referência aparece em ordem, mesmo com extras;
- igualdade estrita = 1 somente quando as duas sequências comparáveis são idênticas.

O controle papagaio será determinístico, terá o mesmo comprimento comparável do agente e será descrito como piso mecânico informado, nunca como acaso.

## 9. Erros no estado correto

O procedimento respeita uma ordem fixa:

1. casar estados;
2. dentro de cada par de estados, casar erros por valor incorreto canonizado;
3. quando disponíveis, exigir também componente e família de ação;
4. usar casamento bipartido máximo, sem reutilização.

Serão reportados separadamente:

- recall de erros do especialista no estado correto;
- precisão estrutural dos erros do agente;
- erro presente, mas ancorado no estado incorreto;
- erro não avaliável por valor ausente ou ambiguidade;
- erro extra;
- feedback ausente, presente ou vazio em cada erro.

Um erro com o mesmo valor da resposta correta, mas em componente diferente, só é distinguível na régua de estado operacional/SAI. Na régua de valor, será rotulado como não identificável, e não como falha automática.

## 10. Dicas e feedback

O manuscrito usará **feedback** como construto geral. “Dica” designa a sequência de ajuda solicitada; “feedback de erro” designa a devolutiva apresentada após uma resposta incorreta.

Deterministicamente serão medidos:

- presença no estado casado;
- quantidade de níveis;
- comprimento por nível;
- progressão de comprimento;
- presença do valor esperado;
- entrega explícita do valor no último nível;
- dicas em estados não casados;
- feedback de erro vazio/não vazio e sua ancoragem.

Texto de dicas não será canonizado. Qualidade semântica será avaliada apenas na etapa exploratória de juízes.

## 11. Estados, caminhos, erros e dicas extras

Os quatro tipos pedidos pelo orientador serão contados separadamente.

- **Estado extra:** ocorrência do agente não casada pela LCS.
- **Caminho extra:** segmento contíguo de estados extras entre dois casamentos, antes do primeiro ou depois do último.
- **Erro extra:** erro do agente sem par dentro do estado correspondente.
- **Dica extra:** dica em estado extra ou nível excedente em estado casado.

Para caminhos extras serão reportados número de segmentos, comprimento total, comprimento médio e posição relativa. A contagem e a penalização pela precisão são determinísticas. A afirmação de que um extra possui valor pedagógico será sempre exploratória sem avaliação humana.

## 12. Auditoria do teto de passos

A auditoria terá três partes.

### 12.1 Código

Será feita busca estática por `slice`, `maxSteps`, `maxNodes`, limites de erros/dicas, timeouts e qualquer truncamento herdado da produção.

### 12.2 Telemetria dos 630 grafos

Os campos `passosGeradosPeloAgente`, `passosQueProducaoAplicaria` e `tetoDinamicoProducao` serão consolidados. Serão reportados:

- quantos grafos seriam truncados no regime de produção;
- quantos passos seriam perdidos;
- distribuição por corpus e braço;
- relação entre perda potencial e tamanho da referência.

### 12.3 Testes de propriedade

Serão adicionados testes para caminho correto, erros por estado, dicas, nós/arestas e materialização. Cada teste injetará pelo menos duas vezes o maior tamanho observado e verificará preservação integral. Qualquer limite exclusivamente técnico será documentado e toda ativação será tratada como censura, nunca ignorada.

## 13. Estágio bruto versus materializado

O “quarto braço” será implementado como contraste pareado, que é mais informativo que grupos independentes:

- mesma execução;
- mesmo exercício, braço e réplica;
- estágio bruto do GraphForge versus grafo final materializado/enriquecido;
- diferença calculada por registro e agregada primeiro dentro do exercício.

Serão comparados recall, precisão, F1, estados avaliáveis, erros, dicas e integridade. O contraste mede a associação com o estágio do pipeline; ele não isola causalmente cada agente interno da materialização.

## 14. Três réplicas: análise de estabilidade

As três réplicas existentes não serão justificadas por uma análise de potência retrospectiva. Serão reportados:

- desvio-padrão intraproblema;
- componentes de variância e ICC quando identificáveis;
- estabilidade de estimativas com `k = 1, 2, 3` réplicas;
- análise *leave-one-replica-out*;
- estabilidade da ordenação dos braços;
- ganho esperado de precisão com cinco e dez réplicas, rotulado como projeção.

Se a análise indicar instabilidade material, a conclusão será que três réplicas são insuficientes para aquele desfecho. Réplicas adicionais exigem nova coleta e orçamento.

## 15. Estatística

- As réplicas serão agregadas dentro do exercício antes dos testes.
- Intervalos de 95% usarão bootstrap de 10.000 reamostragens de exercícios, estratificado por corpus e com semente publicada.
- Taxas estruturais usarão intervalo exato binomial.
- Contrastes pareados usarão permutação por troca de sinais sobre as médias por exercício.
- Será executada sensibilidade *leave-one-corpus-out*.
- Famílias de comparações de modelo e de estágio terão correção de Holm separada.
- Corpora foram escolhidos de forma intencional; os intervalos não justificam extrapolação para todos os tutores, domínios ou interfaces.

Resultados semanticamente julgados por LLMs não serão incluídos nas famílias confirmatórias.

## 16. Painel cego de LLMs — somente etapa exploratória

Antes de qualquer chamada, serão congelados os modelos, preços, prompts, parâmetros, itens, semente e orçamento. Nenhuma chamada será feita sem autorização do autor.

O painel terá três juízes de famílias diferentes das que produziram o conteúdo, quando tecnicamente disponível. Cada item será apresentado sem origem, braço, modelo ou réplica.

Rubrica de feedback:

- especificidade;
- progressão;
- acionabilidade;
- correção matemática;
- entrega explícita da resposta.

Rubrica de extras:

- alvo intermediário legítimo;
- erro plausível de aluno;
- fora de contexto;
- irrelevante;
- redundante.

Controles cegos incluirão itens CTAT, item de outro problema, dica embaralhada, valor absurdo, erro conhecido como falso estado correto e contradição construída deterministicamente.

Um juiz só será interpretado se aceitar pelo menos 80% dos controles positivos, rejeitar pelo menos 80% dos negativos e devolver formato válido em pelo menos 99% das chamadas. O painel exige pelo menos dois juízes aprovados. Serão reportados maioria, resultados individuais, kappa e Gwet AC1. Desacordos não serão resolvidos escolhendo o resultado mais favorável.

Mesmo aprovado, o painel constitui evidência automatizada exploratória.

## 17. IA unplugged

O teste técnico seguirá este roteiro:

1. carregar um tutor já compilado e materializado;
2. bloquear chamadas externas;
3. executar respostas corretas, erros previstos e pedidos de dica;
4. registrar tentativas de rede;
5. verificar decisões e feedback localmente.

O resultado será uma taxa de execução offline. O artigo comparará arquiteturas: um tutor por grafo pré-computa o comportamento; um tutor conversacional em tempo real precisa inferir durante o uso. Não haverá afirmação de superioridade pedagógica ou de custo total sem um experimento próprio.

## 18. Controle contra cópia e dependência da referência

O artigo distinguirá três situações:

- **sem caminho/erros/dicas:** condição usada nos 630 grafos, mas com resposta e componentes derivados do arquivo CTAT;
- **somente enunciado e interface neutra:** condição prospectiva necessária para o controle forte solicitado pelo orientador;
- **referência completa:** usada exclusivamente pela avaliação, nunca pela geração.

O desenho existente será descrito como cegamento parcial, não como “mesmo insumo do especialista” nem como ausência total de dependência da referência. Um teste recursivo de vazamento continuará impedindo que caminhos, erros, dicas, feedback ou transições entrem no envelope de autoria.

## 19. Visualização e caso ilustrativo

O mesmo exercício de identificação de fração na reta numérica será usado ao longo do artigo. Para evitar escolha por resultado favorável, será selecionado por regra determinística e declarada.

O artigo deverá conter, no mínimo:

1. problema prático e contraste entre tutor conversacional e STI guiado;
2. tela real da interface, com enunciado e componentes anotados;
3. trecho real do log do agente resolvendo o problema;
4. transformação determinística log → GraphForge → nós e arestas;
5. comparação visual entre caminho de referência e caminho do agente;
6. exemplo de LCS com ocorrências repetidas e extras;
7. fluxograma das cinco perguntas de qualidade;
8. gráfico de resultados com intervalos e significado operacional;
9. arquitetura IA unplugged;
10. quadro explícito do que o estudo demonstra e do que não demonstra.

Figuras analíticas serão geradas a partir dos dados; fluxogramas serão vetoriais; capturas reais serão usadas apenas quando sua origem e permissão de publicação forem claras. Toda figura terá legenda autossuficiente, texto legível em impressão e versão ampliada no repositório.

## 20. Saídas obrigatórias da Trilha E

- JSON item a item com assinaturas, pareamentos e motivos de não avaliação;
- JSON e Markdown consolidados por corpus e braço;
- auditoria do teto de passos;
- contraste pareado bruto–materializado;
- análise de estabilidade das réplicas;
- inventário de extras por tipo;
- teste offline;
- testes unitários e de propriedade;
- inclusão de todos os derivados no gate `results:verify`;
- manifesto de hashes atualizado;
- manuscrito v0.8 e PDF renderizado;
- figuras-fonte em SVG/PNG e dados usados em cada gráfico.

## 21. Novas chamadas necessárias e regra de autorização

Não exigem API: reanálise dos 630 grafos, auditoria do teto, inventário de extras, comparação de estágios, estabilidade das réplicas, teste offline, gráficos e figuras documentais.

Exigem API: terceiro braço, condição somente enunciado, novas réplicas, materialização de novas gerações e painel de juízes.

Antes dessas chamadas será entregue um plano contendo:

- número exato de chamadas;
- modelos e identificadores;
- tokens esperados;
- custo esperado e teto máximo;
- política de retentativa;
- arquivos de saída;
- comando de execução em modo plano;
- critérios de interrupção.

Sem autorização explícita, o comando pago não será executado.

## 22. Rastreabilidade com as orientações

- estado equivalente e ordem, não índice proporcional: Seções 6–9;
- remoção de ±20%: Seções 7–8;
- estados separados dos erros: Seções 8–9;
- estado, erro e dica ancorados: Seções 9–10;
- quatro tipos de extras: Seção 11;
- canonização das saídas, não das dicas: Seção 7;
- justificativa/sensibilidade de réplicas: Seção 14;
- escala em grafos: Seção 4;
- teto de passos: Seção 12;
- terminologia feedback: Seção 10;
- IA unplugged: Seção 17;
- exemplo único e figuras reais: Seção 19;
- agentes resolvem e GraphForge constrói: Seções 13 e 19;
- referência como melhor régua e *expert blind spot*: Seção 2;
- três braços e contraste de estágio: Seções 13 e 21;
- controle forte somente enunciado: Seção 18.

## 23. Fronteira científica final

A v0.8 poderá ser uma reanálise automatizada rigorosa, reprodutível e mais completa. Sem avaliadores humanos, ela não será apresentada como validação pedagógica definitiva. O resultado cientificamente defensável será um teste de concordância com uma referência imperfeita e de funcionamento técnico de um pipeline que produz rascunhos auditáveis para revisão docente.
