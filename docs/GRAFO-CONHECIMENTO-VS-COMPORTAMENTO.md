# Complemento metodológico — Grafo de conhecimento × grafo de comportamento, e o escopo da validação

> **O que é este arquivo.** Complemento ao documento `docs/METODOLOGIA-VALIDACAO-DETALHADA.md`.
> Ele torna **explícito** (a) a diferença entre o _grafo de conhecimento_ e o _grafo de
> comportamento_, (b) como o sistema trata o grafo de conhecimento hoje — com evidência de
> código —, e (c) por que isso **não afeta** a validação do primeiro artigo (que é do grafo de
> comportamento). Escrito a partir de uma dúvida de arquitetura levantada pelo orientador.
>
> **Para o cowork (integração):** este texto pode ser absorvido como uma subseção de "Escopo"
> na metodologia (sugestão de local na §6 deste arquivo). Os fatos têm `file:line` para auditoria.

---

## 1. São dois grafos diferentes (a base de tudo)

O sistema lida com **dois** grafos que costumam ser confundidos:

|                   | **Grafo de conhecimento**                      | **Grafo de comportamento**                                        |
| ----------------- | ---------------------------------------------- | ----------------------------------------------------------------- |
| Responde          | "o que o aluno precisa **saber**?"             | "o que o **tutor faz**?"                                          |
| Nós               | habilidades (_Knowledge Components_, KCs)      | passos, remediações (_scaffolds_), dicas                          |
| Arestas           | pré-requisitos entre habilidades               | transições certo / erro / struggle                                |
| Exemplo (frações) | `IdenDenominator → IdenNumerator → DivNumLine` | `start → denom=4 → ponto 1/4 → goal` (+ remediação do erro `3/4`) |

**A ponte entre eles:** cada **passo** do grafo de comportamento aponta para um KC do grafo de
conhecimento (no código, o nó-passo tem o campo `knowledgeComponents: [kcId]`, em
`backend/agents/graphforge.js:350`).

![Grafo de conhecimento vs grafo de comportamento](diagrams/07-dois-grafos.svg)

---

## 2. Como o grafo de conhecimento é tratado HOJE (com evidência de código)

Resumo: o grafo de conhecimento é **majoritariamente lido** (entrada), e os KCs **originais**
são, no fim, mesclados de volta ao supergrafo de forma assíncrona. **Descobertas feitas pelos
agentes durante a resolução não retornam a ele**, e **não sai uma versão atualizada** como
artefato separado.

### 2.1 Origem dos KCs (a entrada)

- O **Agent 1** (`backend/agents/nodes/agent1-domain.js`) gera os KCs por LLM (estilo _Cognitive
  Task Analysis_), **consultando** um supergrafo/ontologia global para **reutilizar** KCs existentes:
  - `queryMasterGraphVector()` busca KCs similares por similaridade vetorial
    (`backend/agents/tools/query-master-graph-vector.js`, RPC `match_kcs`);
  - a ontologia (Fuseki/SPARQL) é lida via `backend/agents/ontology-client.js` (prerequisites,
    relationships, misconceptions).
- Esses KCs são a entrada de todo o resto.

### 2.2 Durante a resolução: o KC novo é descartado (silenciosamente)

- Os agentes-aluno (3a/3b/3c, `backend/agents/nodes/agents3-students.js`) marcam um `kcUsed` por
  passo, **referenciando a lista inicial** de KCs.
- Quando o `graphForge` monta a "receita", ele lê esse `kcUsed`:

  ```js
  // backend/agents/graphforge.js:91
  kc: t.kcUsed || kcs[0]?.id || "kc_default",
  ```

  - Se o `kcUsed` vier **vazio**, cai no **fallback** (primeiro KC, ou `"kc_default"`).
  - Se o `kcUsed` for um **KC novo** (string não-vazia que **não existe** na lista), ele até é
    usado no passo, **mas nunca é adicionado à lista de KCs** — vira uma **referência órfã**.
  - Em nenhum dos casos há detecção, aviso ou **reconciliação**: o KC novo **não entra** no grafo
    de conhecimento.

### 2.3 A saída final: só os KCs originais

```js
// backend/agents/pipeline-v8.js:296–311 (assembleTutorV8)
knowledgeComponents: state.knowledgeComponents,         // os KCs ORIGINAIS
knowledgeGraph: {                                       // derivado dos MESMOS originais...
  nodes: state.knowledgeComponents.map(...),            // ...para dashboards/visualizadores
  edges: ...prerequisites...,
},
```

- A saída **já contém um `knowledgeGraph`** (nós = KCs, arestas = pré-requisitos), mas ele é
  construído a partir dos **KCs originais**, não de uma versão atualizada.
- Não existem campos `updatedKnowledgeComponents` / `discoveredKCs` (verificado por busca no
  código: nenhuma ocorrência).

### 2.4 Write-back ao supergrafo: só os originais, "fire-and-forget"

- Após a validação, o **Agent 5** dispara `fireMasterGraphMerge`
  (`backend/agents/nodes/agent5-validator.js`), que chama
  `backend/agents/tools/merge-into-master-graph.js` para fazer _upsert_ dos **KCs originais** e do
  grafo no supergrafo. É **assíncrono e não-bloqueante** (`async: true`), e **não** grava
  descobertas dos agentes-aluno.

**Conclusão técnica:** o grafo de conhecimento é _read-mostly_ na geração; descobertas **não**
voltam a ele; e **não** sai um grafo de conhecimento _atualizado_ como segundo artefato.

---

## 3. A observação do orientador — e por que está correta

> "Os agentes recebem o grafo de conhecimento inicial. Se durante a resolução um agente descobrir
> uma micro-habilidade que não existe nesse grafo, ela não é adicionada. Deveria haver **duas
> saídas**: o grafo de comportamento **e** uma versão **atualizada** do grafo de conhecimento."

A observação está **correta**. Com a evidência da §2:

- Hoje o `knowledgeGraph` emitido é o **original** (§2.3); descobertas são **descartadas/órfãs**
  (§2.2); e **não há** a "2ª saída atualizada" nem um _feedback loop_ que costure o KC novo de volta.
- Portanto, a "saída dupla com grafo de conhecimento atualizado" que ele descreve **ainda não
  existe** — é um acréscimo real (e desejável) ao sistema.

![A pergunta do orientador e o escopo da validação](diagrams/08-escopo-kc.svg)

---

## 4. Relação com o escopo da validação (o ponto central)

A fala do orientador **encaixa exatamente** no recorte da validação já feita:

1. **"O primeiro artigo foca no grafo de comportamento."** É precisamente o experimento deste
   repositório: comparar o grafo de **comportamento** autorado pelo robô com o do CTAT
   (`docs/METODOLOGIA-VALIDACAO-DETALHADA.md`).
2. **"O grafo de comportamento deve ser o do CTAT, só que maior."** É o resultado obtido: o
   **juiz cego** mostrou que os erros que o robô prevê _a mais_ (que o especialista não catalogou)
   são **~95% pedagogicamente válidos** — i.e., o grafo do robô é **válido e mais rico** ("maior")
   que o grafo _mass-production_ do CTAT.
3. **"A validação do grafo de conhecimento fica para depois."** No experimento, o grafo de
   conhecimento é **entrada, não saída**: os KCs vêm prontos no **Envelope A** (dos
   `productionRule` do `.brd`), iguais para os dois lados. O robô **não** descobre nem atualiza
   KCs aqui — logo, **nada de conhecimento está sendo validado** neste artigo. Escopo correto.
4. **Detalhe que isola os números:** a métrica de comportamento ancora em **respostas**
   (`wrongAnswer` e passos), **não** em KCs. Então a questão do "KC novo" é **ortogonal** aos
   resultados atuais — não muda nenhuma métrica do primeiro artigo.

### O que é entrada / saída / validado, por grafo

|                             | Grafo de **conhecimento**        | Grafo de **comportamento**                                |
| --------------------------- | -------------------------------- | --------------------------------------------------------- |
| No experimento              | **entrada** (dado no Envelope A) | **saída** (autorada pelo robô)                            |
| É validado no 1º artigo?    | **não** (fixo, dado)             | **sim** (robô vs CTAT)                                    |
| Atualizado com descobertas? | não (hoje)                       | n/a                                                       |
| Validação                   | trabalho futuro (2º artigo)      | feita (F1, conceitual, equivalência funcional, juiz cego) |

---

## 5. Trabalho futuro — esboço da "segunda saída" (não implementar agora)

Para realizar a proposta do orientador, sem mudar o primeiro artigo:

1. **Detectar** `kcUsed` que não está na lista inicial (em `extractGraphForgeConfig`, perto de
   `graphforge.js:91`), em vez do fallback silencioso.
2. **Reconciliar**: criar um nó KC novo (id + nome + pré-requisitos inferidos) e ligá-lo ao grafo
   de conhecimento.
3. **Emitir** um segundo artefato — ex.: `knowledgeGraphAtualizado` — ao lado do grafo de
   comportamento (e, opcionalmente, propor a inclusão ao supergrafo via o caminho que já existe em
   `merge-into-master-graph.js`).
4. **Validar** esse grafo de conhecimento atualizado no **2º artigo** (métrica a definir — ex.:
   concordância com a ontologia/especialista, ou cobertura/qualidade dos KCs descobertos).

---

## 6. Nota para integração no documento metodológico

Sugestão para o cowork: inserir uma subseção curta de **"Escopo: dois grafos"** logo após a visão
geral da `METODOLOGIA-VALIDACAO-DETALHADA.md` (ou como §5.x), reusando:

- a **tabela da §1** (conhecimento × comportamento) e o **diagrama `07-dois-grafos.svg`**;
- o parágrafo de **escopo da §4** (1º artigo = comportamento; conhecimento = entrada/futuro) e o
  **diagrama `08-escopo-kc.svg`**;
- uma frase em "Ameaças à validade / Limitações" registrando que o grafo de conhecimento é tratado
  como entrada fixa e que sua atualização/validação é trabalho futuro (com a evidência de
  `graphforge.js:91` e `pipeline-v8.js:296–311`).

**Frase-resumo para o artigo:** _"Este trabalho valida o grafo de comportamento autorado
automaticamente; o grafo de conhecimento é tratado como entrada fixa (derivada da interface), e a
detecção/validação de habilidades descobertas durante a autoria é deixada como trabalho futuro."_
