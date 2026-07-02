# Metodologia detalhada — Validação de Grafos de Comportamento (CTAT × EducaOFF)

Este documento descreve, de ponta a ponta, o protocolo de validação que mede se um pipeline multi-agente (EducaOFF) é capaz de redescobrir, **a partir apenas da interface de um problema**, o mesmo grafo de comportamento que um especialista humano construiu no CTAT (_Example-tracing Tutor_, Carnegie Learning). O experimento opera sob uma regra central de **isolamento cego**: o robô recebe somente o **Envelope A** (enunciado, componentes interativos e _Knowledge Components_) e nunca o **Envelope B** (caminho correto, _misconceptions_, dicas e transições do especialista), que entra exclusivamente no comparador. A partir dessa separação, normalizamos os dois grafos a um **esquema neutro** com **ancoragem semântica** (`canonAnswer`) e os comparamos por quatro métricas complementares — F1 estrutural/conceitual, não-inferioridade por _bootstrap_ de cluster, equivalência funcional (κ de Cohen) e um juiz cego cross-family de validade pedagógica. Todo o protocolo é determinístico onde possível (sementes fixas), pré-registrado, e auditável contra contaminação.

A implementação de referência vive em `backend/evaluation/` (`parse-ctat-brd.js`, `schema.js`, `simulate-students.js`, `author-from-ctat.js`, `author-graph.js`, `metrics.js`, `functional-equivalence.js`, `stats.js`, `judge-misconceptions.js`, `run-ctat-eval.mjs`), com o corpus em `backend/evaluation/cases/ctat-6.17/` (24 problemas de frações em reta numérica, cada um com `expert.brd`).

![Pipeline de validação ponta-a-ponta](diagrams/01-pipeline.svg)

## Índice

1. [O arquivo `.brd` e a divisão em envelopes](#1-o-arquivo-brd-e-a-divisão-em-envelopes)
2. [Autoria automática do grafo pelos agentes](#2-autoria-automática-do-grafo-pelos-agentes)
3. [Esquema neutro e ancoragem semântica](#3-esquema-neutro-e-ancoragem-semântica)
4. [As quatro métricas de validação](#4-as-quatro-métricas-de-validação)
5. [Dataset estruturado, ameaças à validade e reprodutibilidade](#5-dataset-estruturado-ameaças-à-validade-e-reprodutibilidade)
6. [Checklist para o artigo](#checklist-para-o-artigo)
7. [Reprodução](#reprodução)

---

## 1. O arquivo `.brd` e a divisão em envelopes

### 1.1 Anatomia do arquivo `.brd`

O arquivo `.brd` é um XML em formato CTAT (_Example-tracing Tutor_ v4.0) que codifica simultaneamente a **interface do problema** (componentes interativos) e o **grafo de comportamento do especialista** (caminho correto, _misconceptions_, dicas e transições):

```
<stateGraph startStateNodeName="..." tutorType="Example-tracing Tutor">
  <startNodeMessages>
    <message><properties>
      <Selection><value>statement</value></Selection>
      <Action><value>UpdateTextArea</value></Action>
      <Input><value>Enunciado do problema</value></Input>
    </properties></message>
  </startNodeMessages>

  <node>
    <uniqueID>id_nó</uniqueID>
    <text>Descrição do estado</text>
    <doneState>true/false</doneState>
  </node>

  <edge>
    <sourceID>nó_origem</sourceID>
    <destID>nó_destino</destID>
    <actionLabel>
      <uniqueID>id_aresta</uniqueID>
      <properties>
        <Selection><value>componente_interativo</value></Selection>
        <Action><value>tipo_de_ação</value></Action>
        <Input><value>resposta_do_usuário</value></Input>
      </properties>
      <buggyMessage>Feedback de erro conceitual (misconception)</buggyMessage>
      <successMessage>Feedback de sucesso</successMessage>
      <hintMessage>Dica 1</hintMessage>
      <hintMessage>Dica 2</hintMessage>
    </actionLabel>
    <actionType>Ação Correta / Ação com erro</actionType>
  </edge>

  <productionRule>
    <ruleName>KC_identificador</ruleName>
    <label>Nome legível do KC (Knowledge Component)</label>
    <hintMessage>Dica global do KC</hintMessage>
  </productionRule>
</stateGraph>
```

A tripla **SAI** (`Selection`, `Action`, `Input`) é a unidade semântica de cada transição:

- **Selection** — qual componente interativo (ex.: `numline`, `F1`, `statement`, `denom`) o usuário toca;
- **Action** — que operação (ex.: `AddPoint`, `UpdateTextArea`, `ButtonPressed`);
- **Input** — o valor enviado (ex.: `1/4`, `5`, `-1`).

**Gotcha crítico — `actionType`, não `buggyMessage`.** A classificação de cada aresta em **certa** ou **errada** é determinada pelo campo `<actionType>` ("Ação com erro" vs. "Ação Correta"; em corpora EN, `incorrect`/`correct`), **não pela presença de `<buggyMessage>`**. Arestas corretas também carregam `buggyMessage` de template — em 01watermelon, 15/16 arestas têm `buggyMessage` mas só 8 são erro. Usar `buggyMessage` como critério contaminaria o Envelope B com passos corretos. O classificador real (`isMisconceptionEdge`, `parse-ctat-brd.js:80–86`) usa `/erro|incorrect|buggy|bug/i` sobre `actionType`, com _fallback_ `buggy && !success`. O comentário das linhas 21–25 documenta esse perigo.

### 1.2 A divisão anti-contaminação (Envelope A e Envelope B)

O parser separa o `.brd` em dois "envelopes" disjuntos, garantindo que **nenhuma informação do grafo do especialista vaze para o agente autor**.

**Envelope A (entrada do robô — CEGO):** contém exclusivamente enunciado, interface (lista de componentes interativos e seus tipos), resposta correta e catálogo de KCs. Nada de _misconceptions_, dicas, transições, caminho correto ou arestas.

```json
{
  "id": "01watermelon",
  "problem": "Localize 1/4 na reta numérica",
  "profile": "reader",
  "difficulty": "medium",
  "correctAnswer": "1/4",
  "knowledgeComponents": [
    { "id": "DivNumLine", "name": "Divisões na Reta" },
    { "id": "FindValueNumLine", "name": "Busca na Reta" }
  ],
  "components": [
    { "id": "numline", "type": "numberline", "label": "numline" },
    { "id": "F1", "type": "numeric", "label": "F1" },
    { "id": "denom", "type": "numeric", "label": "denom" }
  ]
}
```

**Envelope B (grafo do especialista — esquema neutro):** contém o caminho correto (`steps`, em ordem), as _misconceptions_ com suas âncoras (`wrongAnswer` canônico), as transições (backbone `START → steps → GOAL`) e os hints por passo (em `hintsPerCorrectStep`, fora do esquema de comparação).

```json
{
  "meta": { "source": "ctat", "problem": "Localize 1/4 na reta numérica" },
  "steps": [
    { "key": "1/4", "answer": "1/4", "kc": null, "order": 1 },
    { "key": "1", "answer": "1", "kc": null, "order": 2 }
  ],
  "misconceptions": [
    { "key": "-1", "wrongAnswer": "-1", "stepKey": null, "mechanical": true },
    { "key": "0", "wrongAnswer": "0", "stepKey": null, "mechanical": false },
    { "key": "1/2", "wrongAnswer": "1/2", "stepKey": null, "mechanical": false }
  ],
  "transitions": [
    { "from": "START", "to": "1/4", "role": "correct" },
    { "from": "1/4", "to": "1", "role": "correct" },
    { "from": "1", "to": "GOAL", "role": "correct" }
  ]
}
```

![Divisão do .brd em Envelope A (cego) e Envelope B (especialista)](diagrams/02-divisao-brd.svg)

### 1.3 Garantias anti-contaminação

**Sentinela de palavras-chave (`findLeaksInRobotInput`).** A função `findLeaksInRobotInput(envelopeA)` (`parse-ctat-brd.js:357–368`) percorre toda a árvore JSON do Envelope A em profundidade (DFS) procurando por nomes de chave que casem (case-insensitive) com tokens do Envelope B. O conjunto `FORBIDDEN_IN_A` (linhas 334–354) contém 19 palavras-chave proibidas: `misconception`, `misconceptions`, `wronganswer`, `wronganswers`, `hint`, `hints`, `hintmessage`, `hintspercorrectstep`, `buggy`, `buggymessage`, `transition`, `transitions`, `edge`, `edges`, `steps`, `correctpath`, `success`, `successmessage`, `feedback`. Em qualquer casamento, a função retorna a lista dos caminhos onde vazou; no CLI (linhas 407–414), a presença de vazamento causa _exit-code_ 2 ("❌ VAZAMENTO no Envelope A"). Testes afirmam `leaks === []` em todo o dataset.

**Controle negativo de erro mecânico.** O campo `mechanical` (linha 229) marca _misconceptions_ que são artefatos de interação com o widget (inputs `""`, `"-"`, `"-1"` — erros de interface, não conceituais), via `isMechanicalMisconception(wrongAnswer)` (linhas 98–100) consultando a sentinela `MECHANICAL_SENTINELS = {"", "-", "-1"}`. Isso permite calcular o F1 **conceitual** sem penalizar o robô cego, que raciocina sobre frações e não reproduz esses bugs de widget. A lista é v1 ciente-do-corpus 6.17 e será refinada com regras de domínio quando outras interfaces entrarem (pré-registro §8, `docs/PRE-REGISTRO-VALIDACAO-GRAFOS.md:86–107`).

### 1.4 Algoritmos de extração

O fluxograma abaixo mostra o algoritmo de extração ponta a ponta: o `parseBrd` (passos 1–5, com o nó de decisão que classifica cada aresta por `actionType`) produz a matéria-prima `raw`, que então se ramifica nos dois construtores de envelope.

![Fluxograma detalhado da extração: parseBrd e a divisão em envelopes](diagrams/05-algoritmo-extracao.svg)

**Algoritmo 1 — `parseBrd` (extração bruta, `parse-ctat-brd.js:110–177`).** Usa `parse()` de `node-html-parser` (case-sensitive via `rawTagName`, pois CTAT preserva maiúsculas) e devolve `{ startState, statement, nodes[], edges[], skills[] }` com `isCorrect` já calculado por aresta.

```
Algoritmo 1: PARSE-BRD(xml) → { startState, statement, nodes, edges, skills }
  1. sg ← findFirst(parse(xml), "stateGraph");  SE NULL: LANCE erro
  2. startState ← sg.atributo("startStateNodeName")
  3. statement ← concatena Input de cada message com Selection ∈ {statement, statement2}
  4. nodes  ← [{ id: uniqueID, text, done: (doneState=="true") } por node ∈ sg]
  5. edges  ← por edge ∈ sg:
       { id, from: sourceID, to: destID, selection, action, input,
         hints[], buggy, success, actionType }
       e.isCorrect ← NÃO isMisconceptionEdge(e)   // por actionType, não buggy
  6. skills ← [{ ruleName, productionSet, label, hints[] } por productionRule]
  7. RETORNE { startState, statement, nodes, edges, skills }
```

**Algoritmo 2 — divisão em envelopes.** Duas funções consomem `parseBrd`:

- **`parseBrdToExpertNeutral`** (linhas 214–250) constrói o Envelope B: encadeia as arestas corretas por `orderCorrectPath` (linhas 182–204; topologia `sourceID → destID`, _fallback_ = ordem de arquivo), gera `steps` (com `key = canonAnswer(input)`), `misconceptions` (com `mechanical` marcado, linha 226) e `transitions` (`START → s₁ → … → sₙ → GOAL`), e normaliza via `normalizeNeutral()`.
- **`parseBrdToRobotInput`** (linhas 290–328) constrói o Envelope A: infere `components` pela primeira ocorrência de cada `Selection` (tipo via regex de `Action`/`Input`, linhas 254–274), deriva `correctAnswer` (prioridade: ponto na reta com `addpoint` > fração com denominador > último input não-vazio), e monta `knowledgeComponents` a partir de `skills`. A função **não lê** nenhuma aresta de erro, dica ou transição — a separação é garantida **por construção**. A verificação anti-vazamento (`findLeaksInRobotInput`, §1.3) é uma função **separada**, exercida pela CLI e pelos testes (com controle negativo), não chamada dentro do parser.

```
Algoritmo 2: ENVELOPE-B(brdXml) e ENVELOPE-A(brdXml, opts)

ENVELOPE B (especialista, neutro):
  raw ← parseBrd(brdXml)
  ordered ← orderCorrectPath([e ∈ raw.edges | e.isCorrect])
  steps          ← [{ answer: e.input, key: canonAnswer(e.input), order: i+1 } por (e,i) ∈ ordered]
  misconceptions ← [{ wrongAnswer: e.input, key: canonAnswer(e.input),
                      mechanical: isMechanicalMisconception(e.input), feedback: e.buggy }
                    por e ∈ raw.edges se NÃO e.isCorrect]
  transitions    ← backbone START → steps.key → GOAL (role="correct")
  RETORNE normalizeNeutral({ meta, steps, misconceptions, transitions })
          + hintsPerCorrectStep + skills

ENVELOPE A (robô cego):
  raw ← parseBrd(brdXml)
  components ← infere por 1ª ocorrência de cada Selection (tipo por Action/Input)
  correctAnswer ← deriveCorrectAnswer([e ∈ raw.edges | e.isCorrect])
  envelopeA ← { id, problem: raw.statement, profile, difficulty, correctAnswer,
                knowledgeComponents, components }   // por construção, NUNCA toca erros/dicas/arestas
  RETORNE envelopeA
  // verificação externa (CLI/testes): findLeaksInRobotInput(envelopeA) deve dar []
```

Essa arquitetura (duas funções + verificação anti-contaminação + esquema neutro de ancoragem) garante que o robô autore **de verdade cego**, sem acesso ao raciocínio ou aos erros do especialista, permitindo medir se ele redescobre o mesmo grafo por indução a partir de pura interface mais exemplos simulados.

---

## 2. Autoria automática do grafo pelos agentes

### 2.1 Fluxo `authorFromBrd`

A construção do grafo a partir do Envelope A segue um pipeline determinístico e resistente à contaminação. A função `authorFromBrd` (`author-from-ctat.js:28–40`) orquestra quatro etapas:

1. **Extração do Envelope A** via `parseBrdToRobotInput()` — isolamento garantido: nunca lê o Envelope B;
2. **Simulação de três alunos-modelo** via `simulateStudents()` — gera _traces_ (caminho correto, erros típicos, hesitações);
3. **Autoria do grafo** via `authorGraphForInterface()` (GraphForge) — converte _traces_ em grafo comportamental;
4. **Normalização** via `normalizeEducaoff()` — converte para esquema neutro, pronto para comparação.

A regra anti-contaminação é explícita (comentários linhas 10–11): a função jamais chama `parseBrdToExpertNeutral`; o grafo do especialista entra apenas no comparador (`run-ctat-eval.mjs`), não durante a autoria.

![Autoria do grafo pelos agentes (Envelope A → alunos simulados → GraphForge)](diagrams/03-autoria-agentes.svg)

### 2.2 Simulação de alunos-modelo: vocabulário fechado

Os três agentes-aluno resolvem a interface de forma cega, **confinados aos componentes que nela figuram**. A função `simulateStudents` (`simulate-students.js:90–137`) aplica defesa em profundidade contra alucinações:

**Nível 1 — instrução no prompt (linhas 27–45):** "VOCABULÁRIO FECHADO — cada passo tem um campo `selection` que é o ID EXATO de um componente da lista. É PROIBIDO usar um componente fora da lista." Exige valores concretos (ex.: `1/4`), 1–6 passos no caminho correto e 2–8 _misconceptions_ totais.

**Nível 2 — filtragem programática (linhas 76–87):**

```javascript
function restrictToComponents(entries, allowed) {
  if (!allowed.size) return { kept: entries, dropped: 0 };
  let dropped = 0;
  const kept = entries.filter((e) => {
    const sel = e && e.selection != null ? canon(e.selection) : null;
    if (!sel) return true; // sem selection → mantém
    if (allowed.has(sel)) return true;
    dropped++;
    return false;
  });
  return { kept, dropped };
}
```

Entradas sem `selection` são preservadas (não-superpodador); ações com `selection` inválido são removidas. O conjunto `allowed` é construído de IDs **e** labels canônicos dos componentes (linhas 101–105). O log de saída (linhas 115–128) registra quantos passos/_misconceptions_ foram descartados, tornando o comportamento do LLM auditável.

### 2.3 Configuração do GraphForge

`buildGraphForgeConfig` (`author-graph.js:24–62`) transforma interface e _traces_ em config estruturada, indexada por posição de passo:

```javascript
const steps = (traces.correctPath || []).map((s, i) => ({
  index: i + 1,
  kc: s.kc || kcs[Math.min(i, kcs.length - 1)]?.id || "kc_default",
  action: s.action || "",
  result: s.result || "",
}));

const misconceptions = {}; // { [stepIndex0based]: [...] }
for (const m of traces.misconceptions || []) {
  const idx = Math.max(0, (m.step || 1) - 1);
  (misconceptions[idx] ||= []).push({
    id: m.id,
    type: m.type || "conceptual_error",
    wrongAnswer: m.wrongAnswer ?? "",
    description: m.description || "",
    feedback: m.feedback || m.howToFix || "",
    severity: m.severity || "moderate",
  });
}
```

Cada _misconception_ e hint é associado ao passo em que ocorre; os KCs herdam perfil e dificuldade da interface.

### 2.4 GraphForge: algoritmo determinístico

O GraphForge (`backend/agents/graphforge.js:285–539`) é **puro e síncrono** — estrutura válida por construção, sem LLM na topologia (LLM preenche apenas conteúdo de slots). Três fases:

- **Fase A — nós (linhas 322–415):** `start`, `goal`, nós de passo (`step_1`, `step_2`, …) com `expectedInput` de estrutura fixa (`value: null` inicialmente — ver §2.5), `knowledgeComponents`, `scaffoldTrigger` e `scaffoldNodes`; e nós de _scaffold_ (`scaffold_misc_s{i}_{j}`) por _misconception_, com referência ao passo pai.
- **Fase B — arestas (linhas 418–467):** backbone linear `start → step_1 → … → goal`; loops de remediação `step_i → scaffold → step_i`; _skip edges_ (se o perfil permite) ativados quando a competência é dominada.
- **Fase C — validação (linhas 469–502):** toda aresta aponta para nó existente; `goal` é alcançável de `start` via BFS (linhas 594–609); senão injeta arestas de emergência.

### 2.5 Injeção de respostas esperadas (A1)

O GraphForge **não preenche `expectedInput.value`** (linhas 343–344): em produção esse campo é preenchido **após a UI**, no _lock_ pós-interface. Na avaliação **não há esse lock**. Se `value` ficasse `null`, o comparador não teria âncora para validar passos (o esquema neutro chaveia por resposta/KC), zerando artificialmente o recall de passos. A função `injectStepAnswers` (`author-graph.js:81–95`) resolve isso, **localmente ao grafo de avaliação** (não altera o GraphForge de produção):

```javascript
function injectStepAnswers(graph, config) {
  const byId = new Map((graph.nodes || []).map((n) => [n.id, n]));
  (config.steps || []).forEach((step, i) => {
    const node = byId.get("step_" + (i + 1));
    if (!node || node.type !== "step" || !node.expectedInput) return;
    const r = step.result;
    if (
      (node.expectedInput.value == null || node.expectedInput.value === "") &&
      r != null &&
      String(r).trim() !== ""
    ) {
      node.expectedInput.value = String(r); // ← injeção
    }
  });
}
```

A mutação preserva a semântica: a resposta injetada é a que o aluno-simulado produziu — a mesma que o especialista veria ao resolver a mesma interface.

### 2.6 Algoritmo completo de autoria

```
Algoritmo 3: authorFromBrd(brdXml, opts) → { neutral, graph, envelopeA, traces }
  1. envelopeA ← parseBrdToRobotInput(brdXml, opts)        // SOMENTE Envelope A
  2. traces    ← simulateStudents(envelopeA, …)            // 3 agentes-aluno
       allowed ← componentes de envelopeA.components
       correctPath    ← restrictToComponents(correctPath, allowed)
       misconceptions ← restrictToComponents(misconceptions, allowed)
  3. config ← buildGraphForgeConfig(envelopeA, traces)     // indexa por passo
  4. { graph, … } ← graphForge(config)                     // determinístico, puro
  5. injectStepAnswers(graph, config)                       // A1: âncora de validação
  6. neutral ← normalizeEducaoff(graph, { source: "robo" })
  7. RETORNE { neutral, graph, envelopeA, traces }
```

O sistema garante então: **isolamento** (anti-contaminação), **restrição vocabular** (defesa em profundidade) e **completude estrutural** (GraphForge determinístico).

---

## 3. Esquema neutro e ancoragem semântica

### 3.1 Por que não se compara XML × JSON diretamente

O grafo do especialista é XML (CTAT `.brd`); o grafo do robô nasce JSON (behaviorGraph EducaOFF). Ambos representam a mesma máquina de estados, mas em estruturas incompatíveis. Comparar formatos brutos sofre de (i) **heterogeneidade sintática** (mesma ação como atributo, tag aninhada ou campo) e (ii) **subjetividade semântica** (é "0/4" do especialista equivalente a "0" do robô?). Para dissolver a ambiguidade, **normaliza-se ambos ao mesmo esquema neutro** (`schema.js:14–19`), e a comparação ocorre **apenas no esquema neutro** — métrica ortogonal à representação de origem:

```
{
  meta:           { source, problem? },
  steps:          [{ key, answer, kc, order }],
  misconceptions: [{ key, wrongAnswer, stepKey }],
  transitions:    [{ from, to, role }]
}
```

### 3.2 A âncora semântica: `canonAnswer`

O cerne do esquema é a **chave canônica**: cada passo e cada erro recebe uma chave derivada de sua semântica, não de sua grafia. `canonAnswer` (`schema.js:70–84`) unifica respostas numéricas/textuais:

1. **Frações explícitas** (`/^(-?\d+)\s*\/\s*(-?\d+)$/`): reduz por MDC, denominador positivo;
2. **Decimais** (vírgula → ponto): converte para fração de denominador ≤ 100 quando possível (0.25 → `1/4`), senão decimal com ≤ 6 casas;
3. **Texto**: aplica `canon()` — remove acentos, minúsculas, remove espaços e pontuação final.

```
canonAnswer("0/4")   → "0"      // 0/1, simplificado a inteiro
canonAnswer("2/8")   → "1/4"    // reduzido por MDC
canonAnswer("1,5")   → "3/2"    // decimal PT-BR → fração
canonAnswer("0.25")  → "1/4"    // decimal EN → fração
```

Passos e erros com grafia diferente mas mesmo valor **recebem a mesma chave** e casam automaticamente. Sem isso, o robô seria penalizado por escrever "0" enquanto o especialista escreveu "0/4" — um artefato de grafia, não de competência conceitual.

### 3.3 Normalização dos dois lados

- **Lado EducaOFF (JSON):** `normalizeEducaoff(graph, meta)` (`schema.js:101–157`). Passos (nós `type:"step"`) chaveados por `canonAnswer(expectedInput)` ou `canon(KC)` (linhas 106–115); _misconceptions_ extraídas de `node.misconceptions[]` com `key = canonAnswer(wrongAnswer)` e flag `mechanical` (linhas 126–139); transições com `role` via `bucketRole(condition)` (linhas 86–94: `misconception`/`correct`/`back`/`default`).
- **Lado CTAT (XML):** `parseBrdToExpertNeutral(xml, meta)` (`parse-ctat-brd.js:214–250`), conforme §1.4, classificando arestas por `actionType` e ordenando o caminho por `orderCorrectPath` (linhas 182–204).

### 3.4 Classificação de _misconception_ mecânica

Distinguir **erro conceitual** de **artefato de interface** rende **duas métricas paralelas**: F1 **estrutural (cru)** (todos os erros) e F1 **conceitual** (omitindo mecânicos — reportado ao lado, nunca substituindo o cru; auditável, anti-gaming). `isMechanicalMisconception(wrongAnswer)` (`parse-ctat-brd.js:98–100`) classifica como mecânico quando a resposta canônica bate `MECHANICAL_SENTINELS = {"", "-", "-1"}`: campo em branco, hífen de placeholder, ou `-1` (sentinela técnica do widget de reta numérica — nunca uma fração válida no currículo). É refinamento corpus-aware do 6.17 (pré-registro §8).

### 3.5 Algoritmo de normalização e ancoragem

```
Algoritmo 4: NORMALIZA_E_ANCORA(grafo, formato ∈ {ctat, educaoff}) → grafo_NEUTRO
  1. parse bruto (formato-específico): nós, arestas, [skills]
  2. classificação:
       ctat:     correto ⇔ NÃO isMisconceptionEdge (por actionType)
       educaoff: erro    ⇔ bucketRole(condition) == "misconception"
  3. steps:          key ← canonAnswer(input) | canon(kc) | "step#n"
  4. misconceptions: key ← canonAnswer(wrongAnswer) | canon(description)
                     mechanical ← isMechanicalMisconception(wrongAnswer)
  5. transitions:    backbone START → steps.key → GOAL (role="correct")
  6. RETORNE { meta, steps, misconceptions, transitions }

Invariantes:
  - chaves canônicas (valores equivalentes ⇒ mesma chave);
  - sem acentos/espaços/pontuação final;
  - ordem de passos determinística (topologia CTAT | ordem de nós EducaOFF);
  - erros mecânicos MARCADOS, não omitidos (auditáveis, reportáveis à parte).
```

O **casamento de nós** é então determinístico e sem ambiguidade: tokens `step|{key}` e `misc|{key}` em ambos os grafos; TP = interseção, FN = só-referência (faltou no robô), FP = só-candidato (robô inventou).

---

## 4. As quatro métricas de validação

As quatro métricas comparam o grafo autorado cego (Envelope A → robô) contra o grafo do especialista (Envelope B), cada uma respondendo uma pergunta distinta. O protocolo é determinístico nas simulações com sementes fixas; os números abaixo refletem **uma corrida estocástica única** (ilustrativa) sobre o corpus CTAT 6.17 (24 problemas). Para inferência final, executam-se múltiplas replicações com reamostragem (§4.2).

![As quatro métricas de validação sobre os grafos neutros](diagrams/04-validacao.svg)

### 4.1 Métrica 1 — F1 estrutural de nós + F1 conceitual

**Pergunta:** os grafos têm a mesma topologia, ignorando quanto cada um granulariza?

`metrics.js` tokeniza cada grafo (`tokens()`, linhas 21–31) em nós (`step|{key}`, `misc|{key}`) e arestas (`{origem}>{destino}|{tipo}`); `confusion()` (linhas 34–48) monta TP/FP/FN; `prf()` (linhas 51–57) calcula Precisão, Recall e F1 (média harmônica). **F1 é simétrico** — usa a mesma escala para pares humano–humano e robô–humano. O **F1 conceitual** (`compareGraphs`, linhas 70–106) recalcula sobre o mesmo alinhamento omitindo _misconceptions_ `mechanical: true`; é sempre ≥ F1 cru, e um Δ grande (> 0.1) sinaliza muito peso mecânico no especialista.

**Exemplo (00bubble, corrida única):** F1 estrutural = 0.588, F1 conceitual = 0.667 (Δ ≈ +0.079, devido a erros mecânicos `-`, `-/5`, `-1` que o robô não cataloga); Precisão = 0.714, Recall = 0.5.

```
Algoritmo 5: F1-ESTRUTURAL+CONCEITUAL(ref, cand, opts)
  tokens_ref, tokens_cand ← tokens(·, exclude=false)
  (tp,fp,fn)              ← confusion(tokens_ref.nodes, tokens_cand.nodes)
  precision ← tp/(tp+fp) | 1;  recall ← tp/(tp+fn) | 1
  f1        ← 2·precision·recall/(precision+recall) | 0
  // conceitual: repete com exclude=true (omite mechanical)
  f1_conc   ← prf(confusion(tokens(ref,exclude=true).nodes,
                            tokens(cand,exclude=true).nodes))
  // arestas em separado
  f1_edges  ← prf(confusion(tokens_ref.edges, tokens_cand.edges))
  RETORNE { nodeF1, nodeF1Conceptual, edgeF1, precision, recall,
            missingMisconceptions, extraMisconceptions }
```

### 4.2 Métrica 2 — Não-inferioridade via _bootstrap_ de cluster

**Pergunta:** a qualidade do robô é estatisticamente não-inferior à variabilidade inter-especialista (a régua natural)?

`stats.js` (`nonInferiority`, linhas 47–93) testa não-inferioridade com margem pré-registrada δ. Entrada: pares `{value: F1, exercise, pairType ∈ {HH, RH}}` (HH = humano–humano; RH = robô–humano). Estima `μ_RH − μ_HH` e seu IC95% por **bootstrap de cluster**: reamostra **exercícios inteiros** (não pares individuais), porque pares do mesmo exercício compartilham variância (com E exercícios e V avaliadores há E·C(V,2) pares correlacionados; Davison & Hinkley, 1997). RNG determinístico `mulberry32(seed)` (linhas 23–31), 2000 iterações, percentis 2.5%/97.5%.

**Veredito:** IC_lower ≥ 0 → "superior"; IC_lower > −δ → "não-inferior"; IC_upper < −δ → "inferior"; senão "inconclusivo". O campo `reliable` (linha 91) ativa quando nExercises ≥ 10.

**Exemplo (CTAT 6.17, corrida única):** com 24 exercícios mas n_HH = 0 (especialista único por exercício), o veredito é "inconclusivo" — limite do corpus atual; o experimento completo prevê ≥ 3 especialistas/problema.

```
Algoritmo 6: NÃO-INFERIORIDADE(data, δ, iterações, semente)
  HH, RH ← split por pairType;  diff ← mean(RH) − mean(HH)
  byExercise ← agrupa data por exercise
  rng ← mulberry32(semente)
  PARA b = 1..iterações:
    amostra ← ∪ byExercise[ exercises[ floor(rng()·|exercises|) ] ]   // reposição
    SE amostra tem HH e RH: diffs ← diffs ∪ { mean(RH_boot) − mean(HH_boot) }
  ci ← [percentil(diffs,0.025), percentil(diffs,0.975)]
  veredito ← superior | não-inferior | inferior | inconclusivo  (vs. 0 e −δ)
  reliable ← |exercises| ≥ 10
  RETORNE { meanHH, meanRH, diff, ci, verdict, reliable }
```

### 4.3 Métrica 3 — Equivalência funcional (veredito + κ de Cohen)

**Pergunta (robusta à granularidade):** diante da mesma resposta de aluno, os dois tutores reagem igual?

`functional-equivalence.js` (`functionalEquivalence`, linhas 76–103) constrói uma **bateria** = união das respostas corretas + `wrongAnswers` de ambos os grafos, deduplicada por `canonAnswer` (linhas 41–52). Para cada resposta, `verdictFor()` (linhas 31–38) classifica em cada grafo: `erro-previsto` (bate _misconception_, prioridade) > `correto` (bate resposta correta) > `surpresa`. Gera matriz de confusão 3×3 (especialista × robô), e calcula **agreement** (% de linhas concordantes) e **κ de Cohen** (linhas 55–67):

$$\kappa = \frac{p_o - p_e}{1 - p_e}, \quad p_e = \sum_{c}\,p_{\text{esp}}(c)\cdot p_{\text{rob}}(c)$$

κ = 1 perfeito; 0 ao acaso; < 0 pior que acaso. Robusto à granularidade: se o especialista decompõe um passo em três e o robô em um, mas ambos marcam "32" como `surpresa`, concordam funcionalmente. Referência: κ ≥ 0.6 "substancial" (Landis & Koch).

**Exemplo (00bubble):** agreement = 0.6, κ = 0.286 (moderada; acaso ≈ 0.34).

```
Algoritmo 7: EQUIVALÊNCIA-FUNCIONAL(ref, cand, opts)
  bateria ← dedup_canon( correctAnswers ∪ wrongAnswers(ref) ∪ wrongAnswers(cand) )
  rows    ← [{ answer, ref: verdictFor(ref,·), cand: verdictFor(cand,·) } por answer]
  agreement ← #(ref==cand)/|rows|
  p_e ← Σ_c  p_ref(c)·p_cand(c)   sobre c ∈ {correto, erro-previsto, surpresa}
  kappa ← (agreement − p_e)/(1 − p_e)  | 0
  RETORNE { n, agreement, kappa, confusion, rows }
```

### 4.4 Métrica 4 — Juiz cego de validade pedagógica (GLM cross-family + calibração)

**Pergunta:** os erros que o robô prevê mas o especialista não (robô-extra) são _misconceptions_ pedagogicamente válidas ou invenções fora do alvo?

Desenho anti-viés (`judge-misconceptions.js:1–22`):

1. **Cego:** o juiz recebe só `{problema, resposta_correta, resposta_errada_candidata}` — **nunca a origem** (robô / especialista / distrator). Sem viés de autoridade.
2. **Calibração:** junto dos robô-extra julgam-se também (a) erros conceituais do **próprio especialista** (`mechanical:false`, linha 89; régua = "válido") e (b) **distratores óbvios** (linhas 66–73): a própria resposta correta (esperado `na_verdade_correta`, nunca "válida") e um valor absurdo `"987654"` (esperado "implausível"). Controle negativo: se o juiz não flagra os distratores, o resultado é um carimbo.
3. **Cross-family:** o juiz usa `agent9_review` (GLM-4.5 via Z.ai), **família diferente** da que gerou os erros (agentes-aluno). Evita auto-avaliação.

Leitura (`summarizeBySource`, linhas 107–118): se `taxa(robô-extra) ≈ taxa(especialista) ≫ taxa(distrator)` → robô cobre erros válidos complementares; se `≈ taxa(distrator)` → robô gera ruído; se `> taxa(especialista)` → robô criativo (possivelmente fora de escopo).

**Exemplo (CTAT 6.17, agregado):** especialista 82/83 = 0.988; distrator-correta 0/24 = 0; distrator-absurdo 0/24 = 0; **robô-extra 36/38 = 0.947**. O robô não inventa ruído — descobre _misconceptions_ não catalogadas; o Δ pequeno (0.947 vs. 0.988) indica o mesmo universo pedagógico.

```
Algoritmo 8: JUIZ-CEGO(problema, resp_correta, ref, cand, opts)
  robo_extra        ← misconceptions(cand) \ misconceptions(ref)      // dif. de conjuntos
  expert_conceitual ← [m ∈ ref.misconceptions | NÃO m.mechanical]
  distratores       ← { resp_correta → "distrator-correta", "987654" → "distrator-absurdo" }
  itens ← buildJudgeItems(robo_extra, expert_conceitual, distratores)  // CEGOS, dedup canon
  llm   ← getAgentConfig(opts.configKey || "agent9_review")            // GLM-4.5, Z.ai
  julgados ← PARALELO judgeMisconception(problema, resp_correta, item.candidate) por item
  agrupa por source; validRate ← valid/n por grupo
  RETORNE { pooled: { especialista, distrator-correta, distrator-absurdo, robo-extra }, cases }
```

### 4.5 Integração e leitura dos resultados

| Métrica                        | Foco                     | Resultado típico (CTAT 6.17) | Interpretação                                       |
| ------------------------------ | ------------------------ | ---------------------------- | --------------------------------------------------- |
| **F1 estrutural**              | Topologia (nós/arestas)  | ~0.45–0.60                   | Grafo similar, com gaps (recall ~40–50%)            |
| **F1 conceitual**              | Omite mecânico           | ~0.51–0.67 (Δ ≈ +0.07)       | Robô não inventa mecanismos espúrios                |
| **NI (bootstrap cluster)**     | Vs. inter-especialista   | Inconclusivo (n_HH = 0)      | Exige ≥ 3 especialistas; atual = 1/exercício        |
| **Equivalência funcional (κ)** | Comportamento observável | κ ≈ 0.14–0.33                | Concordância moderada; tratam "surpresas" diferente |
| **Juiz cego (validez)**        | Qualidade dos extras     | Robô 0.947, Expert 0.988     | Robô descobriu ~95% de erros válidos; ~2% ruído     |

**Transparência:** o "inconclusivo" em NI reflete o corpus atual (1 especialista/exercício). O experimento em escala (pré-registrado) inclui ≥ 3 especialistas para construir a régua inter-especialista confiável.

---

## 5. Dataset estruturado, ameaças à validade e reprodutibilidade

### 5.1 Estrutura do dataset materializado

A separação rigorosa de envelopes e a captura de múltiplos especialistas motivam a estrutura:

```
dataset/
├── schema.json                       # versão do schema (v1.0)
├── manifest.json                     # índice de problemas + estatísticas
├── problema_001/
│   ├── meta.json                     # id, domínio, KCs, fonte, autores especialistas
│   ├── envelope_a.json               # interface CEGO (problema + componentes + KCs)
│   ├── envelope_b_expert_01.json     # grafo especialista 1 (esquema neutro)
│   ├── envelope_b_expert_02.json     # grafo especialista 2
│   ├── envelope_b_expert_03.json     # grafo especialista 3
│   └── sources/
│       ├── expert_01.brd             # XML bruto CTAT (auditoria)
│       └── problem_screenshot.png    # captura da UI (documentação)
└── problema_002/ …
```

Vantagens: **reprodutibilidade** (agentes consomem `envelope_a.json` direto, sem re-parsear `.brd`); **auditoria anti-contaminação** (`findLeaksInRobotInput()` em CI/CD sobre todo `envelope_a.json`); **escalabilidade** (adicionar especialista = copiar um `envelope_b_expert_NN.json`, sem tocar no robô); **versionamento** (`schema.json` rastreia quebras de formato). O `manifest.json` indexa cada problema com `meta`, `envelope_a`, lista de `envelope_b`, `source_brd` e `status`, mais estatísticas de cobertura (perfil, especialistas, domínio).

> **Nota.** No repositório de referência, o corpus 6.17 está materializado em `backend/evaluation/cases/ctat-6.17/<problema>/expert.brd` (24 problemas, um especialista cada); a estrutura multi-especialista acima é o alvo do experimento em escala.

### 5.2 Ameaças à validade e mitigações

| Ameaça                                 | Causa                                   | Mitigação                                                                            |
| -------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------ |
| **Contaminação (B vaza para A)**       | Campo proibido não filtrado             | `findLeaksInRobotInput()` (19 chaves) em CI/CD; validação de schema                  |
| **Subjetividade do casamento de nós**  | Mesmo erro casado por formas diferentes | Âncora objetiva `canonAnswer(wrongAnswer)` (frações/decimais); KC como _fallback_    |
| **Viés do juiz**                       | Favorecer robô/especialista             | CEGO + CALIBRAÇÃO (distratores) + CROSS-FAMILY (GLM ≠ gerador)                       |
| **Granularidade confunde topologia**   | Robô decompõe em mais passos            | F1 conceitual (`excludeMechanical`) + equivalência funcional (vereditos, não passos) |
| **Robô prevê erro válido não listado** | KC interpretado de forma estreita       | Juiz LLM avalia validez do robô-extra (taxa vs. distrator)                           |
| **Baixo poder estatístico**            | Poucos exercícios / 1 especialista      | Benchmark ≥ 20 exercícios; flag `reliable` (≥ 10); ≥ 3 especialistas no NI           |

### 5.3 Parâmetros pré-registrados

- RNG: `mulberry32(seed: 12345)` (`stats.js:23–31`)
- Bootstrap: 2000 iterações; IC 95% (percentis 2.5%/97.5%)
- Margem de não-inferioridade: δ = 0.10 (provisório; refinar com banda HH)
- F1 conceitual: exclui `{mechanical: true}` (sentinelas `{"", "-", "-1"}`, pré-registro §8)
- `reliable` quando nExercises ≥ 10

---

## Checklist para o artigo

Reportar, na seção de Métodos/Resultados:

- **Corpus:** N de problemas (24 no 6.17), domínio (frações em reta numérica), fonte (CTAT v4.0 _mass production_ 6.17), N de especialistas por problema e total de grafos HH.
- **Separação de envelopes:** definição de Envelope A (cego) vs. B (especialista); confirmar **zero vazamentos** via `findLeaksInRobotInput` (19 chaves proibidas) sobre todo o dataset.
- **Classificador de aresta:** declarar que erro vs. correto vem de `<actionType>`, **não** de `<buggyMessage>` (citar o caso 01watermelon: 15/16 com `buggyMessage`, só 8 são erro).
- **Esquema neutro e ancoragem:** descrever `canonAnswer` (redução de fração por MDC, decimal→fração ≤ 100, normalização de texto) e dar exemplos (`0/4→0`, `2/8→1/4`, `1,5→3/2`).
- **Erros mecânicos:** lista de sentinelas `{"", "-", "-1"}`, marca como ciente-do-corpus 6.17; reportar **F1 cru e conceitual lado a lado** (nunca só o conceitual).
- **Autoria cega:** três alunos-modelo, vocabulário fechado (prompt + `restrictToComponents`), log de descartes; GraphForge determinístico (puro/síncrono); patch A1 (`injectStepAnswers`) e por que é local à avaliação.
- **Métrica 1 (F1):** Precisão, Recall, F1 de nós e arestas; F1 cru vs. conceitual com Δ; notar simetria do F1.
- **Métrica 2 (NI):** margem δ, _bootstrap_ de cluster (semente, iterações, IC), por que cluster por exercício; veredito de 4 vias; flag `reliable`; reportar honestamente "inconclusivo" quando n_HH = 0.
- **Métrica 3 (equivalência funcional):** definição da bateria, vereditos (`correto`/`erro-previsto`/`surpresa`), agreement e κ de Cohen + matriz de confusão 3×3; faixa de Landis & Koch.
- **Métrica 4 (juiz cego):** desenho cego + calibração (especialista, distrator-correta, distrator-absurdo) + cross-family (GLM-4.5/Z.ai); `validRate` por origem; mostrar que distratores recebem 0.
- **Reprodutibilidade:** sementes, versões de parser/modelos, hashes dos arquivos de referência, comandos exatos (abaixo).
- **Limitações:** 1 especialista/exercício no corpus atual; sentinelas mecânicas v1; corrida única ilustrativa vs. replicações para inferência.

---

## Reprodução

Pré-requisitos: dependências instaladas e `.env` com as chaves de LLM (os agentes-aluno e o juiz fazem chamadas reais).

```bash
# 1) Suíte de testes da avaliação (determinística; ~24 testes)
cd backend && npx vitest run evaluation

# 2) Avaliação CTAT × EducaOFF — corpus completo (24 problemas)
#    Para cada cases/ctat-6.17/<problema>/expert.brd: Envelope A → robô → comparação
cd backend && node evaluation/run-ctat-eval.mjs cases/ctat-6.17

# 3) Smoke test (só o 1º problema)
cd backend && node evaluation/run-ctat-eval.mjs cases/ctat-6.17 --limit 1

# 4) Um problema específico
cd backend && node evaluation/run-ctat-eval.mjs cases/ctat-6.17/00bubble

# 5) Juiz cego de validade pedagógica (Métrica 4), isolado
cd backend && node evaluation/run-judge.mjs cases/ctat-6.17

# 6) Harness genérico de avaliação (casos não-CTAT; agrega vários casos)
cd backend && npm run eval        # caso único (run-evaluation.mjs cases/soma-27-mais-15)
cd backend && npm run eval:all    # todos os casos sob cases/

# 7) Verificar integridade dos arquivos de referência do corpus
find backend/evaluation/cases/ctat-6.17 -name 'expert.brd' | sort | \
  xargs shasum -a 256 > checksums.txt
```

Parâmetros fixos (já embutidos): `mulberry32(seed: 12345)`, 2000 iterações de _bootstrap_, IC 95%, margem δ = 0.10, exclusão de `{mechanical: true}` para o F1 conceitual. A saída inclui F1 (cru e conceitual), Precisão/Recall, matriz de confusão, equivalência funcional (agreement + κ), veredito de não-inferioridade e taxas do juiz cego por origem.
