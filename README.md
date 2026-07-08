# Validação de grafos de comportamento: agentes de IA × especialista humano (CTAT)

Repositório oficial do experimento de validação dos grafos de comportamento gerados pelos agentes da plataforma **EducaOFF / STI Unplugged**. Ele contém tudo o que é necessário para **reproduzir fielmente** a avaliação: o código completo, o corpus, a base de dados com os dois envelopes, a metodologia, o pré-registro com emenda, os resultados brutos da primeira campanha e o relatório final.

> **Contexto.** A plataforma EducaOFF gera Sistemas Tutores Inteligentes por um pipeline de agentes de IA. O coração de cada tutor é o *grafo de comportamento* (paradigma example-tracing, Aleven et al. 2009/2016): o mapa com o caminho de resolução correto, os erros típicos de aluno (misconceptions) e as remediações. Este experimento responde: **os grafos gerados automaticamente estão corretos?** A comparação é feita contra grafos autorados por um especialista humano na ferramenta CTAT (Carnegie Mellon), sobre os mesmos 24 exercícios de frações na reta numérica.

## A ideia do experimento em um diagrama

Cada arquivo `.brd` exportado do CTAT contém a interface do exercício **e** o grafo do especialista. O parser separa esses dois conteúdos em envelopes disjuntos, e o sistema autora **às cegas**:

```mermaid
flowchart TB
    BRD[".brd do CTAT<br/>(24 exercícios de frações)"] --> P["parser<br/>parse-ctat-brd.js"]
    P --> A["ENVELOPE A: só a interface<br/>enunciado + campos + resposta correta + KCs"]
    P --> B["ENVELOPE B: o grafo do especialista<br/>caminho + erros + dicas (LACRADO)"]
    A --> R["agentes autoram o grafo ÀS CEGAS<br/>(nunca veem o Envelope B)"]
    B --> C["comparador (esquema neutro)"]
    R --> C
    C --> M["completude direcional + juiz cego<br/>+ detecção de alucinação estrutural"]
    style A fill:#E6F1FB,stroke:#378ADD
    style B fill:#E1F5EE,stroke:#1D9E75
    style R fill:#E6F1FB,stroke:#378ADD
```

A anti-contaminação é garantida por código: existe uma lista de campos proibidos no Envelope A, a função `findLeaksInRobotInput` varre o envelope procurando qualquer um deles, e um teste automatizado quebra a build se encontrar (incluindo um controle negativo com envelope contaminado de propósito, que o teste precisa acusar).

## Como o sistema autora o grafo

```mermaid
flowchart LR
    A["Envelope A"] --> S1["agente 3a<br/>aluno avançado"]
    A --> S2["agente 3b<br/>aluno com dificuldades"]
    A --> S3["agente 3c<br/>aluno mediano"]
    S1 -->|caminho correto| GF["GraphForge<br/>montador determinístico<br/>(sem IA)"]
    S2 -->|misconceptions| GF
    S3 -->|dicas em 4 níveis| GF
    GF --> G["grafo de comportamento"]
    style S2 fill:#FCEBEB,stroke:#E24B4A
    style GF fill:#EEEDFE,stroke:#7F77DD
```

A parte criativa (que erros um aluno cometeria, que dica ajudaria) fica com os agentes de IA, os mesmos que rodam em produção na plataforma, sem modificação. A montagem da estrutura é um algoritmo determinístico, e por isso a estrutura é válida por construção (propriedade verificada com 10.000 grafos aleatórios nos testes).

## O que se mede

| Camada | Pergunta | Instrumento |
| --- | --- | --- |
| Nível 1, estrutural | O grafo é bem-formado? | `graph-hallucination.js`: sinais DUROS barram (ciclo patológico, nó órfão, beco sem saída, scaffold órfão); MOLES somam um score com limiar µ+λσ |
| Nível 2, comparativo | Bate com o especialista? | **Veredito 2D**: eixo X = completude conceitual (recall direcional, Tversky 1977); eixo Y = validade dos extras segundo **juiz cego** de família de IA diferente, com calibração e distratores |
| Complementares | | recall de passos separado, equivalência funcional (κ de Cohen), inclusão de traços, F1 auditável, distâncias de edição |

O julgamento do que o sistema **perde** também é medido: um segundo juiz classifica cada erro do especialista não coberto como central, periférico ou mecânico. É isso que separa "a diferença é complementar" de "a lacuna importa".

## Resultados da primeira campanha (2026-07-02)

24 exercícios, 3 réplicas de cada medição, intervalos de confiança de 95%:

| Resultado | Valor |
| --- | --- |
| Grafos com defeito estrutural | **0 de 72** (e 0 em 10.000 grafos de teste) |
| Validade dos extras (juiz cego) | **87%** [79, 92], contra 99% do especialista e 0% dos distratores |
| Completude conceitual | **0,376** [0,310, 0,440] |
| Erros perdidos que são centrais | **56%** [48, 64] |

Leitura honesta: o sistema constrói grafos estruturalmente impecáveis e o que ele adiciona é válido, mas cobre cerca de um terço do catálogo do especialista, e mais da metade do que perde é importante. O veredito formal de não-inferioridade permanece em aberto até existir a banda humano-humano (2 a 3 especialistas por exercício), conforme o pré-registro. O relatório completo, com 10 diagramas e a comparação exercício por exercício, está em [`docs/RELATORIO-CAMPANHA-1.html`](docs/RELATORIO-CAMPANHA-1.html).

## Como reproduzir

Requisitos: Node.js 18+ e uma chave da OpenRouter (https://openrouter.ai/keys). Um único provedor cobre o gerador e o juiz, que são de famílias diferentes de modelo.

```bash
npm install
cp .env.example .env        # cole sua OPENROUTER_API_KEY
npm run models              # mostra a configuração de modelos e valida a chave

npm test                    # 108 testes determinísticos, sem custo de API
npm run materialize         # regenera o dataset a partir dos .brd
npm run eval:real           # avaliação completa: agentes reais × especialista (24 exercícios)
npm run judge:real          # juiz cego: validade dos extras + importância dos perdidos
npm run aggregate           # agrega réplicas em média com IC95%
```

Para replicar a campanha inteira (3 réplicas de cada), rode os comandos de avaliação e juiz três vezes com `--out report-eval-real-N.json` / `--out report-judge-real-N.json` e agregue. O script usado na campanha original está em [`resultados/campanha-2026-07-02/run.sh`](resultados/campanha-2026-07-02/run.sh). A aleatoriedade da parte estatística usa semente fixa: os mesmos dados produzem os mesmos números em qualquer máquina.

## Campanha 2: comparação entre modelos geradores (2026-07-08)

A pedido da orientação, o experimento foi repetido trocando o modelo dos três agentes, com protocolo idêntico e juiz único neutro às três famílias (`mistralai/mistral-large-2512`): baseline Gemini 3.5 Flash contra `z-ai/glm-5.2` e `deepseek/deepseek-v4-pro`, 3 réplicas de avaliação e de julgamento por braço. Resultado em resumo: nenhum modelo altera o quadro geral ("válido, porém incompleto"); a completude conceitual ficou estatisticamente indistinguível entre os três (Gemini 0,368, DeepSeek 0,371, GLM-5.2 0,415, com os intervalos se sobrepondo), o Gemini foi significativamente melhor que o DeepSeek em passos, equivalência funcional e F1, e o GLM-5.2 obteve a maior validade dos extras no juiz comum (80% contra 71% do baseline), ao custo de ~10× o tempo de geração. Dados brutos em [`resultados/campanha-2026-07-08-multimodelo/`](resultados/campanha-2026-07-08-multimodelo/). Observação metodológica relevante: o juiz Mistral mostrou-se mais rígido que o GLM-4.5 da campanha 1 (validade dos extras 71-80% contra 87%; importância "central" 97-99% contra 56%), o que confirma que níveis absolutos de julgamento não são comparáveis entre juízes diferentes e reforça a necessidade da calibração humana em curso.

## Grau de dificuldade e custo

O experimento foi desenhado para ser reproduzível por qualquer pessoa com experiência básica de terminal. Não há banco de dados, não há Docker, não há dependência de GPU: é Node.js puro com duas bibliotecas pequenas.

| Etapa | Exige | Tempo | Custo de API |
| --- | --- | --- | --- |
| Entender (ler docs e dataset) | um navegador | livre | nenhum |
| Verificar (testes + reagregação dos dados publicados) | Node 18+ | ~2 min | nenhum |
| Replicar 1 corrida (avaliação + juiz nos 24 exercícios) | chave OpenRouter | ~20 min | por volta de US$ 1 |
| Replicar a campanha completa (3 réplicas de cada) | chave OpenRouter | ~1h30 (sem supervisão) | tipicamente abaixo de US$ 5 |

## Transparência dos modelos

A tabela abaixo é a configuração oficial da campanha, idêntica à da produção da EducaOFF. Cada agente tem o seu modelo e a sua temperatura, e as temperaturas diferem de propósito: o aluno avançado precisa ser quase determinístico, o aluno com dificuldades precisa de diversidade para os erros emergirem, e o juiz precisa de julgamento estável.

| Passo do experimento | Agente | Modelo | Temperatura | Máx. tokens |
| --- | --- | --- | --- | --- |
| Caminho de resolução correto | 3a, aluno avançado | `google/gemini-3.5-flash` | 0,2 | 16.000 |
| Misconceptions (erros previstos) | 3b, aluno com dificuldades | `google/gemini-3.5-flash` | 0,7 | 24.000 |
| Dicas em 4 níveis | 3c, aluno mediano | `google/gemini-3.5-flash` | 0,4 | 16.000 |
| Julgamento de validade e importância | juiz cego | `z-ai/glm-4.5` | 0,1 | 32.000 |
| Contingência (1 retentativa em falha) | fallback | `deepseek/deepseek-chat` | 0,3 | 16.000 |

Três decisões merecem justificativa. Primeira: o juiz é de **família diferente** do gerador (GLM contra Gemini), porque modelos de linguagem tendem a avaliar melhor a produção da própria família (Panickssery et al. 2024); um juiz da mesma família seria uma câmara de eco. Segunda: a montagem do grafo (GraphForge) **não usa modelo nenhum**, é um algoritmo determinístico, então nenhuma parte da estrutura depende de IA. Terceira: todos os modelos são acessados pela OpenRouter, o que permite reproduzir com **uma única chave** e trocar qualquer modelo sem tocar em código.

Para ver a configuração ativa na sua máquina e validar a chave: `npm run models`. Para trocar modelos ou temperaturas, edite o `.env` (o `.env.example` documenta cada variável). A definição está centralizada na tabela `AGENTS` de [`llm.js`](llm.js).

## A arquitetura do juiz cego

O juiz é a peça que separa "o sistema inventou bobagem" de "o sistema enxergou um erro real que o especialista não catalogou". Ele são duas funções sobre o mesmo modelo (GLM-4.5, temperatura 0,1), cada uma com um prompt fixo e saída em JSON estruturado:

```mermaid
flowchart TB
    subgraph entrada [" itens julgados às cegas, um por vez "]
        E1["extras do sistema<br/>(erros que só ele previu)"]
        E2["erros do próprio especialista<br/>(calibração positiva)"]
        E3["distratores: a resposta certa<br/>+ um valor absurdo (controle)"]
    end
    entrada --> J1["JUIZ DE VALIDADE<br/>recebe só: enunciado + resposta correta + resposta errada candidata<br/>NUNCA sabe a origem do item"]
    J1 --> V["veredito por item:<br/>válido / implausível / é a resposta certa / impossível<br/>+ nome do erro + 1 frase de justificativa"]
    P["erros do especialista que o<br/>sistema NÃO cobriu (perdidos)"] --> J2["JUIZ DE IMPORTÂNCIA<br/>cego à cobertura: julga só o quanto<br/>o erro importa pedagogicamente"]
    J2 --> I["central / periférico / mecânico"]
    style J1 fill:#EEEDFE,stroke:#7F77DD
    style J2 fill:#EEEDFE,stroke:#7F77DD
```

O que valida o próprio juiz, dentro de cada rodada: os erros do especialista funcionam como régua positiva (devem pontuar alto; pontuaram 99%) e os distratores como régua negativa (devem pontuar zero; pontuaram 0%). Se os distratores passassem, o juiz seria um carimbo e nenhum número dele valeria. Os prompts completos das duas funções estão em [`judge-misconceptions.js`](judge-misconceptions.js), e o repositório também prevê calibração contra rótulos humanos (κ de Cohen) quando existir um arquivo `human-judge-labels.json` no corpus.

## Como os agentes e o GraphForge são invocados

O fluxo de ponta a ponta, no código, é este:

```
run-ctat-eval.mjs
  └── authorFromBrd(brdXml)                          [author-from-ctat.js]
        ├── parseBrdToRobotInput(brd)  → Envelope A  [parse-ctat-brd.js]
        └── authorFromEnvelopeA(envelopeA)
              ├── simulateStudentsReal(envelopeA)    [simulate-students-real.js]
              │     ├── agent3a_advancedStudent(state)   ┐
              │     ├── agent3b_atRiskStudent(state)     ├ [agents3-students.js,
              │     └── agent3c_averageStudent(state)    ┘  código de produção]
              ├── buildGraphForgeConfig(iface, traces)   [author-graph.js]
              ├── graphForge(config)  → o grafo          [graphforge.js, determinístico]
              └── normalizeEducaoff(graph) → esquema neutro para comparação
```

Quem quiser usar as peças como biblioteca (por exemplo, para autorar um grafo de um único exercício e inspecioná-lo) precisa de meia dúzia de linhas:

```js
import "dotenv/config";
import fs from "node:fs";
import { authorFromEnvelopeA } from "./author-from-ctat.js";
import { simulateStudentsReal } from "./simulate-students-real.js";

const envelopeA = JSON.parse(fs.readFileSync(
  "datasets/frac-numberline-6.17/problems/00bubble/envelope-a.json", "utf8"));

const { graph, neutral, traces } = await authorFromEnvelopeA(envelopeA, {
  simulate: simulateStudentsReal,   // os 3 agentes reais; omita para usar o modo simplificado
});
console.log(JSON.stringify(graph, null, 2));   // o grafo de comportamento completo
```

E para comparar esse grafo com o do especialista do mesmo exercício:

```js
import { compareGraphs } from "./metrics.js";
const expert = JSON.parse(fs.readFileSync(
  "datasets/frac-numberline-6.17/problems/00bubble/envelope-b.json", "utf8"));
const cmp = compareGraphs(expert, neutral);
console.log(cmp.recallMisconceptionsConceptual, cmp.detail.missingMisconceptions, cmp.detail.extraMisconceptions);
```

## Estrutura do repositório

```
├── docs/
│   ├── RELATORIO-CAMPANHA-1.html      relatório completo da 1ª avaliação (didático, 10 diagramas)
│   ├── METODOLOGIA.md                 desenho metodológico completo (3 níveis, fundamentação, limiares)
│   ├── METODOLOGIA-DETALHADA.md       algoritmos passo a passo, prontos para o artigo
│   ├── PRE-REGISTRO.md                métricas e análises fixadas ANTES dos resultados + EMENDA 1 datada
│   ├── GRAFO-CONHECIMENTO-VS-COMPORTAMENTO.md   a distinção entre os dois grafos
│   └── diagramas/                     8 diagramas SVG da metodologia
├── cases/ctat-6.17/                   CORPUS: 24 exercícios, cada um com expert.brd + interface
├── datasets/frac-numberline-6.17/     BASE DE DADOS: por exercício, envelope-a.json (interface,
│                                      entrada cega dos agentes), envelope-b.json (grafo do
│                                      especialista) e meta.json; manifest com verificação de leaks
├── resultados/campanha-2026-07-02/    dados brutos da campanha: 9 relatórios + agregado + banda
├── parse-ctat-brd.js                  o parser que separa o .brd nos DOIS ENVELOPES
├── simulate-students-real.js          os 3 agentes de produção autorando sobre a interface fixa
├── graphforge.js                      o montador determinístico (idêntico ao de produção)
├── author-from-ctat.js                a autoria cega de ponta a ponta
├── schema.js                          esquema neutro + âncora semântica (canonAnswer, miscKey)
├── metrics.js                         completude direcional (primária) + F1 auditável
├── functional-equivalence.js          equivalência funcional + inclusão de traços
├── graph-hallucination.js             detector de alucinação estrutural (DUROS/MOLES)
├── judge-misconceptions.js            juiz cego (validade) + juiz de importância dos perdidos
├── stats.js                           não-inferioridade, bootstrap de cluster, IC de Wilson
├── run-ctat-eval.mjs / run-judge.mjs  os runners do experimento
├── aggregate-campaign.mjs             agregação de réplicas com IC95%
└── __tests__/                         108 testes, incluindo property tests com 10.000 grafos
```

## A base de dados e os dois envelopes

Cada exercício em `datasets/frac-numberline-6.17/problems/<id>/` tem três arquivos:

- **`envelope-a.json`**: a interface pura (enunciado, componentes de resposta, resposta correta, habilidades). É a única entrada que os agentes recebem.
- **`envelope-b.json`**: o grafo do especialista no esquema neutro (passos, misconceptions com a marcação de mecânicas de interface, transições). Entra apenas no comparador.
- **`meta.json`**: contagens e metadados do exercício.

O `manifest.json` do dataset registra a verificação de vazamento (`leaks: []` para todos). Para gerar a base a partir dos `.brd` originais: `npm run materialize`.

## Fundamentação e fontes

O desenho metodológico combina: example-tracing e CTAT (Aleven et al. 2009/2016), erros sistemáticos de alunos (Brown e Burton 1978; VanLehn 1990), similaridade assimétrica (Tversky 1977), inclusão de traços (van Glabbeek), não-inferioridade (Lakens 2017/2018), Teoria da Generalizabilidade para a banda de especialistas (Shavelson e Webb 1991), viés de autopreferência em juízes de IA (Panickssery et al. 2024), julgamento item a item (GraphEval), e detecção de alucinação estrutural com limiar dinâmico (arXiv 2601.17717, 2509.03857, 2505.24201, 2512.22396). A seção 12 do relatório explica como cada fonte foi usada, técnica por técnica.

## Citação

Se você usar este experimento, o dataset ou o código, cite o repositório (ver `CITATION.cff`) e o artigo correspondente (referência a ser adicionada após a publicação).

## Licença

MIT para o código (ver `LICENSE`). Os arquivos `expert.brd` são exports da ferramenta CTAT (Carnegie Learning / Carnegie Mellon University) autorados para esta pesquisa.
