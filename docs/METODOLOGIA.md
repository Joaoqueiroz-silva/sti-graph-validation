# Metodologia de Validação de Grafos de Comportamento Gerados por Pipeline Multiagente

> [!WARNING]
> **HISTÓRICO / SUPERADO.** Este é um rascunho de planejamento de 2026-06-03. Ele mistura
> propostas, estudos futuros e caminhos de um monorepo externo; portanto, não demonstra que todos
> os níveis ou instrumentos descritos foram executados. Não o cite como método realizado nem como
> resultado do estudo. A fonte científica vigente é o [manuscrito v6.1](manuscript/v6.1/README.md),
> que trata a Campanha 4 como avaliação principal e as Campanhas 1–3 como desenvolvimento
> histórico/evidência secundária.
>
> Os caminhos `backend/...` e `frontend/...` abaixo identificam o monorepo histórico; são mantidos
> como texto de auditoria e não correspondem a arquivos deste depósito.

**Projeto:** STI Unplugged / EducaOFF
**Status:** rascunho de metodologia para artigo científico (v1 — 2026-06-03)
**Escopo:** validar, cientificamente, se os _behavior graphs_ produzidos pela arquitetura multiagente são construídos corretamente.

> Este documento é o aterramento da metodologia no **código real** do repositório. Toda afirmação sobre o pipeline está ancorada em arquivo:linha. Toda escolha de instrumento/limiar está ancorada em literatura verificada (ver §8).

---

## 0. Objeto, tese e postura epistemológica

**O que é validado.** O artefato central é o _behavior graph_ (paradigma _example-tracing_ / CTAT — Aleven, McLaren, Sewall & Koedinger, _IJAIED_ 2009, 2016): grafo dirigido com caminho de resolução correto, ramos de remediação (_scaffolds_) ancorados a _misconceptions_, e dicas progressivas. Validamos **dois objetos distintos**:

1. **O grafo-template (Fase 1)** — o esqueleto genérico com _slots_ (`{A}`, `{B}`), antes de instanciar números. É o que o sintetizador determinístico produz.
2. **O tutor instanciado em uso (runtime)** — o grafo preenchido, rodando com alunos reais.

Essa distinção é **central** e o código a impõe: os simuladores operam sobre problemas com variáveis genéricas (`backend/agents/nodes/agents3-students.js:34`), e o _matcher_ de resposta só existe no grafo instanciado (`frontend/src/lib/graphEngine.js`). Validação estrutural recai sobre o template; validação de fidelidade comportamental recai sobre o instanciado.

**A tese metodológica.** Não existe "o grafo correto" único — para um mesmo exercício há vários grafos pedagogicamente razoáveis. Logo, _"o grafo foi construído corretamente?"_ **não é diretamente observável**. Operacionalizamos em proxies e validamos por **triangulação / validade convergente**: três níveis independentes, cada um sensível a um tipo distinto de falha. Um grafo ruim teria de enganar os três simultaneamente. O resultado não é um carimbo de correção absoluta, e sim um **caso convergente e difícil de refutar** — postura adequada em _Design Science Research_.

**As duas espinhas possíveis do artigo** (decisão a tomar — muda o protagonista):

- **Espinha A — "geramos grafos válidos automaticamente":** ênfase em método de geração + validação. Protagonista = **Nível 2** (especialmente 2c, comparação com especialista).
- **Espinha B — "grafos automáticos ensinam tão bem quanto os de especialista":** ênfase no desfecho. Protagonista = **Nível 3** (quase-experimento auto vs. especialista).

A metodologia abaixo serve às duas; o que muda é onde está o _claim_ central e o tamanho de amostra prioritário.

**Síntese do argumento de validade (triangulação).** Como não há grafo-gabarito único, a correção é defendida pela convergência de três evidências independentes, cada uma com instrumento próprio:

1. **Conformância estrutural** à especificação _example-tracing_/CTAT — caminho(s) correto(s), links de ação incorreta com feedback dirigido, sequências de dica, KCs anotados (Aleven et al. 2009, 2016) → **Nível 1 + 2a estrutural**.
2. **Validade de conteúdo por especialista** via CTA, checando que passos/ramos batem com a decomposição elicitada e com os fatores de dificuldade (Clark et al. 2008; Lovett 1998; Koedinger & Nathan 2004) → **Nível 2a/2c**.
3. **Ajuste empírico a dados de aluno** — rotear traces pelos KCs do grafo e verificar **curvas de aprendizagem lisas** + _fit_ competitivo (AIC/BIC/CV-RMSE) vs. baseline de especialista, com _closing-the-loop_ opcional (Cen et al. 2006; Martin et al. 2005; Koedinger et al. 2012) → **Nível 2b/3**.
   Um grafo ruim teria de passar nos três simultaneamente.

---

## 1. O artefato e como ele é construído (aterrado no código)

O grafo nasce de uma **linha de montagem de três sinais independentes**, cada simulador LLM alimentando uma parte distinta, seguida de montagem determinística.

| Etapa                      | Função                                  | Produz                                                                                                       | Arquivo                                                                                                                        |
| -------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Simulador **3a Avançado**  | `agent3a_advancedStudent`               | trace perfeito, 1 KC/passo, variáveis genéricas                                                              | `backend/agents/nodes/agents3-students.js:10`                            |
| Simulador **3b Em risco**  | `agent3b_atRiskStudent`                 | 2–3 tentativas, cada erro com `misconceptionId/type/wrongAnswer/mistakeLocation/diagnosticQuestion/feedback` | `backend/agents/nodes/agents3-students.js:96`                            |
| Simulador **3c Mediano**   | `agent3c_averageStudent`                | acerta hesitando + 4 níveis de dica + rotas alternativas                                                     | `backend/agents/nodes/agents3-students.js:221`                           |
| **Extração**               | `extractGraphForgeConfig`               | funde traces + Master Graph + ontologia em `config`                                                          | `backend/agents/graphforge.js:70`                                        |
| **Síntese determinística** | `graphForge`                            | grafo (nós + arestas) com invariantes por construção                                                         | `backend/agents/graphforge.js:282`                                       |
| **Validação + retry**      | `agent5_modelValidator` / `routePhase1` | gate estrutural; re-roda simuladores 1× se crítico                                                           | `backend/agents/nodes/agent5-validator.js:92` / `backend/agents/pipeline-v8.js:244` |

**Mecânica de montagem** (`graphForge`): cria `start`/`goal`, nós de passo a partir do trace do 3a, nós de _scaffold_ a partir das _misconceptions_ do 3b (1 por misconception), e _backbone_ linear `start → step_1 → … → goal`. Arestas: lineares (`correct`), de misconception (`step → scaffold`), de retorno (`scaffold → step`), e de _skip_ (`skip_if_mastered`, por perfil). Os invariantes (conectividade, IDs únicos, integridade referencial) são garantidos por construção via `createNode`/`addEdge`.

**Precedente CTAT (legitima o desenho).** A estratégia "template genérico + montagem determinística" tem precedente direto: o recurso _Mass Production_ do CTAT transforma um behavior graph em template substituindo valores específicos por variáveis e gera um grafo por problema (Aleven et al. 2016) — exatamente o que o pipeline faz com `{A}{B}` + `graphForge`. E o behavior graph é tratado na literatura como **especificação executável**: rodar traces (reais ou retidos) através do grafo e medir _cobertura de caminho_ / _taxa de mis-trace_ é, por si, um teste de correção (CTAT usa isso como teste de regressão semi-automatizado). Isso conecta diretamente ao Nível 1 (§2) e ao Nível 2b (§3b).

### 1.1 As 7 fragilidades de construção (o que a metodologia precisa detectar)

Identificadas por leitura do código. Não são "bugs" — são os **pontos onde o grafo pode divergir da realidade**, e portanto a razão de ser de cada instrumento de validação.

| #   | Fragilidade                                                                                                                                                            | Evidência                                                      | Nível que detecta                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------- |
| F1  | **Ancoragem misconception↔passo por índice inteiro** (`stepIdx = t.step − 1`); 3a e 3b são chamadas LLM independentes → scaffold pode pousar no passo errado           | `backend/agents/graphforge.js:107`           | 2a (especialista), 2b (fall-off)            |
| F2  | **Truncamento silencioso de passos:** `steps.slice(0, stepCount)` corta passos acima do limite do perfil; misconceptions/dicas dos passos cortados **somem sem aviso** | `backend/agents/graphforge.js:158`           | 1 (property test deve contar descartes)     |
| F3  | **`mistakeLocation` e `diagnosticQuestion` descartados** na extração — ouro diagnóstico do 3b nunca chega ao grafo                                                     | `backend/agents/graphforge.js:113`           | 3 (qualidade/DAMR)                          |
| F4  | **4 níveis de dica achatados em strings** — `level`/`type` do 3c são perdidos e re-derivados por posição                                                               | `backend/agents/graphforge.js:137`           | 1 (schema), 3 (qualidade)                   |
| F5  | **`matcher: "exact"` gravado na construção** (embora schema suporte tolerância) — mas o runtime aplica matching tolerante por cima (ver §3b)                           | `backend/agents/graphforge.js:392`           | 2b (validar matcher: precisão **e** recall) |
| F6  | **Determinismo frágil:** config depende de estado mutável externo (Master Graph cresce; ontologia) → mesmo problema, dias diferentes, grafos diferentes                | `backend/agents/graphforge.js:178`           | 1 (escopo de P6)                            |
| F7  | **`frequency: "common"` hardcoded** para toda misconception — campo de frequência não tem valor informativo                                                            | catálogo em `backend/agents/pipeline-v8.js`  | 2a/2b (frequência só de dado real)          |

E uma observação de **circularidade**: o 3b é primado com `MISC_DB[disciplina:idade]` (`backend/agents/nodes/agents3-students.js:109`). Isso ancora os erros em algo curado, mas se o `MISC_DB` não foi validado contra dado de aluno, o Nível 2a fica auto-confirmatório. **A perna que quebra a circularidade é o pré-teste real (Nível 2a, Frente B).**

---

## 2. Nível 1 — Correção estrutural do algoritmo (verificação de software)

**Pergunta:** o sintetizador produz, para qualquer entrada admissível, um grafo que satisfaz os invariantes — e é determinístico?

**Natureza:** verificação ("testar, não medir"). Garantia _por construção_ → o objetivo é provar que ela se sustenta.

**O que pode e o que NÃO pode reivindicar.** Pode provar validade estrutural do `graphForge`. **Não** pode dizer nada sobre correção de conteúdo (um grafo estruturalmente perfeito pode ser pedagogicamente errado — isso é o Nível 2).

### 2.1 Stack (decisão de planejamento)

O repositório é **Node.js/JavaScript**, não Python. O doc original assumia Hypothesis/pytest/networkx/coverage.py/pyBKT. Equivalências:

| Doc (Python)               | Realidade (Node)                                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Hypothesis                 | **fast-check** (property-based em JS)                                                                            |
| pytest                     | **node:test** (já é o runner do projeto)                                                                         |
| `networkx.has_path` / BFS  | `graphForge` já tem `isReachable` próprio; ou `graphology`                                                       |
| `graph_edit_distance` (2c) | sem equivalente JS maduro → implementar (grafos ≤20 nós) ou sidecar Python                                       |
| pyBKT (N3)                 | análise offline em Python; os parâmetros BKT já vivem no código (`backend/agents/schemas.js:106`) |

**Nível 1 e 2b: 100% JS, sem Python.** Só 2c (GED) e a _análise_ BKT do N3 forçam a decisão sidecar-vs-JS.

### 2.2 Os invariantes P1–P7 (como asserções reutilizáveis)

Extrair de `backend/agents/graphforge.js` uma função-asserção por propriedade (hoje os checks existem só como `logger.error`):

- **P1 — Conectividade:** existe caminho `start → goal` só por arestas corretas (BFS).
- **P2 — Unicidade de IDs:** nenhum ID repetido.
- **P3 — Integridade referencial:** toda aresta liga dois nós existentes (sem aresta órfã).
- **P4 — Correspondência misconception↔scaffold:** cada misconception declarada → exatamente 1 scaffold alcançável; nenhum scaffold sem misconception.
- **P5 — Dicas:** cada dica referencia nó-pai existente e respeita os 4 níveis. **(Atenção F4: hoje os níveis são posicionais, não preservados da fonte — o teste deve verificar a re-derivação.)**
- **P6 — Determinismo:** `graphForge(config)` idêntico byte-a-byte em execuções repetidas, **dado `config` fixo** (serialização canônica + hash). **Escopo (F6):** não se reivindica determinismo end-to-end — os simuladores são LLMs estocásticos e a config depende de estado mutável (Master Graph, ontologia). O claim é: _dado o mesmo `config`, o sintetizador é determinístico._
- **P7 — Topologia por perfil:** nº de passos ≤ limite do perfil; scaffolds genéricos vs. específicos conforme perfil.

### 2.3 Correção crítica: o auto-reparo silencioso

`graphForge` **não falha** quando P1 é violado — ele **conserta** forçando arestas lineares (`backend/agents/graphforge.js:480`). Hoje a afirmação não é "P1 vale por construção", e sim "P1 vale _após reparo_", sem telemetria de quantas vezes o reparo dispara.

**Ação:** (a) em modo teste, o reparo deve **lançar exceção** em vez de remendar, para que o property test exponha a violação; (b) em produção, **contar e telemetrar** cada disparo de reparo (taxa de reparo = métrica de saúde do gerador). Sem isso, a tese não pode afirmar garantia por construção.

### 2.4 Procedimento e critérios

- _Generators_ (fast-check) de traces válidos arbitrários: nº de passos variável, 0..k misconceptions/passo, hesitações, KCs repetidos, perfis distintos.
- Casos de borda explícitos: trace vazio, 1 passo, máximo de passos, **misconception apontando passo inexistente / truncado (F1, F2)**, todos os passos com hesitação, KC duplicado.
- Rodar **N ≥ 10⁴** casos asserindo P1–P7; _shrinking_ → menor trace que quebra vira teste de regressão.
- _Fuzzing_ dos traces reais (remover/duplicar passos, embaralhar misconceptions).
- Integrar ao CI; reaproveitar `agent5_modelValidator` como _runtime gate_ (P1–P4) — **mas ampliá-lo**: hoje ele checa presença de start/nodes/edges, mas **não** checa conectividade BFS, unicidade nem integridade referencial (`backend/agents/nodes/agent5-validator.js:92`).

**Critério de aceitação:** 0 violações em 10⁴ casos + determinismo confirmado (P6, escopo §2.2) + cobertura ≥ 90% + **taxa de auto-reparo reportada**.

---

## 3. Nível 2 — Fidelidade do grafo à realidade

A única avaliação que é, de fato, _do grafo_. Três frentes.

### 3a. Validação pré-implantação

**Frente A — Revisão por especialistas (validade de conteúdo).**

- Painel de **6–8 professores** experientes da faixa-alvo; amostra ≥ 30 exercícios/tópico; rubrica.
- Cada juiz avalia, passo a passo, se cada misconception é plausível/frequente/adequada e se caminho e dicas estão corretos.
- **Métricas e limiares (verificados):**
  - **I-CVI** (Item-level Content Validity Index) ≥ **0.78** para 6+ juízes; = 1.00 para ≤5 — Lynn (1986).
  - **S-CVI/Ave** ≥ **0.90** (nível de escala) — Polit & Beck (2006). Reportar também o _range_ de I-CVIs e qual S-CVI (UA vs Ave).
  - **CVR** (Content Validity Ratio) = (nₑ − N/2)/(N/2), com valor crítico por tamanho de painel da **tabela corrigida de Ayre & Scally (2014)** — _não_ o Lawshe secundário (que erra os valores de painel pequeno).
  - **κ\* modificado** (corrige acaso): ≥0.74 excelente, 0.60–0.74 bom — Polit & Beck (2006).
  - Concordância inter-juízes: **kappa de Cohen ≥ 0.61** ("substancial", Landis & Koch 1977) ou **Krippendorff α ≥ 0.667** (tentativo) / ≥0.80 (confiável).
- **Critério:** I-CVI ≥ 0.78; reprovados voltam ao refinamento de prompt do simulador 3b.
- **Cuidado (circularidade):** juízes avaliam _plausibilidade_; o 3b foi instruído a gerar erros plausíveis a partir do `MISC_DB`. Se ambos bebem da mesma fonte de "erros de livro", alta concordância pode refletir **estereótipo compartilhado**, não comportamento real. Por isso a Frente B é a perna mais forte.

**Frente B — Comparação com erros reais de pré-teste.**

- Pré-teste diagnóstico em turmas-piloto **fora da intervenção**, cobrindo os mesmos KCs, com distratores mapeados a misconceptions.
- Codificar erros observados e cruzar com o catálogo dos simuladores.
- **Fundamento (verificado):** uma misconception é "real" quando **reproduz um padrão sistemático de erro em dados de aluno** (Brown & Burton 1978, BUGGY; VanLehn 1990, _Mind Bugs_) — não um _slip_ isolado. É o que distingue ramo legítimo de ruído.
- **Métricas:** _cobertura_ (misconceptions reais previstas / observadas) e _inveracidade_ (previstas que não aparecem / previstas).
- **Critério (pré-registrar):** cobertura > 50%, inveracidade < 30%.

### 3b. Validação in-situ por _example-tracing_ (instrumento novo — CBE)

**Objetivo:** medir quanto o grafo antecipa o comportamento real durante o uso.

**Achado-chave (viabilidade):** a telemetria **já existe e é rica**. A tabela `interactions` (`backend/migrations/0001_initial_schema.sql`) grava `node_id, kc_id, correct, answer_given, misconception_id, misconception_type, hints_used, attempt_number, time_spent_ms`; o engine emite eventos tipados (`correct_answer / incorrect_answer / misconception_detected / hint_requested / scaffold_activated / step_skipped / tutor_completed`). O _tracer_ **não precisa ser construído do zero** — é uma camada de análise sobre dado de produção.

**Operacionalização direta:**

> **Coberta** = `correct_answer` (aresta correta) ∪ `misconception_detected` (aresta de misconception) ∪ `hint_requested` (dica existente) ∪ `scaffold_activated`.
> **Fall-off** ≈ **`incorrect_answer` com `misconception_id IS NULL`** — o aluno errou de um jeito que o grafo não previu.

- **TCE** (Taxa de Cobertura por Example-tracing) = coberta / total de ações.
- **TF** (Taxa de Fall-off) = 1 − TCE.
- **TCT** = traces rastreáveis fim-a-fim sem fall-off.
- **Recall de misconception in-situ** = erros reais distintos com scaffold / erros reais distintos.
- **Scaffolds mortos** = % de scaffolds nunca acionados.

**Pré-condição — validar o matcher (corrige minha leitura inicial).** A construção grava `matcher:"exact"`, mas o runtime (`frontend/src/lib/graphEngine.js`) aplica matching **tolerante**: normalização, tolerância numérica (±0.01), palavra→número, equação canônica e — para misconception — **fuzzy numérico (`|dif|<0.5`) + substring**. Logo a ameaça de validade é **bidirecional**:

- _Sub_-casar → fall-off inflado (erro real catalogado não reconhecido).
- _Super_-casar → o fuzzy/substring atribui misconception errada a um _slip_.

Portanto a TCE **só é interpretável após medir precisão E recall do matcher** contra uma amostra de respostas anotada à mão. (Isso é um ponto metodológico mais forte do que tratar o matcher só como fonte de fall-off.)

**Separar lacuna-do-grafo de ruído.** Codificar cada fall-off em 3 categorias com **dupla codificação cega** (kappa ≥ 0.7): (a) erro novo plausível → realimenta 3b; (b) hesitação/estratégia nova → realimenta 3c/3a; (c) ruído (chute, _slip_, usabilidade, off-task) → descarte. Esse laço torna a validação **generativa** (o grafo melhora a cada rodada).

- **Coleta:** ~30+ traces de uso por exercício; IC por _bootstrap_; comparar TCE entre modos de geração (Turbo vs. Qualidade Máxima).
- **Critério (pré-registrar):** TCE ≥ 85% (alvo) / ≥ 70% (mínimo); recall in-situ ≥ 50%; scaffolds mortos ≤ 30%; kappa de codificação ≥ 0.7.

### 3c. Comparação com grafo de especialista (experimento de referência)

**Objetivo:** testar diretamente se grafo automático ≈ grafo humano, sabendo que não há gabarito único.

- **Amostra:** 20–30 exercícios; **≥3 especialistas** (ver justificativa abaixo) que autoram o behavior graph no CTAT para os mesmos problemas-semente, **cegos** ao grafo automático; normalizar para o mesmo schema.
- **Referência de decomposição (CTA):** antes/junto da autoria, conduzir _Cognitive Task Analysis_ com os especialistas (Clark et al. 2008; Lovett 1998) para elicitar a decomposição em KCs e os fatores de dificuldade (DFA; Koedinger & Nathan 2004). Checar se passos/ramos do grafo automático batem com a decomposição elicitada — **se um fator de dificuldade real não tem ramo correspondente, o grafo está subespecificado** (liga direto a F1/F2).
- **Métricas (recomendação da literatura):**
  - **PRIMÁRIA — COMPLETUDE (recall direcional) + VALIDADE-DOS-EXTRAS (veredito 2D).** _(Revisão 2026-06-30: o F1 simétrico foi rebaixado a linha auditável.)_ Para uma ferramenta **generativa** — cujo valor é enriquecer a cobertura de erros — a simetria do F1 é o defeito: a precision pune o robô por misconceptions a mais, conflando "extra válido não-catalogado" com "extra errado" (função de perda errada). Medimos: (X) **completude** = recall direcional (Tversky 1977, α=0, β=1) das misconceptions do especialista cobertas pelo robô, com **recall de passos reportado em separado** (falhas independentes); (Y) **validade dos extras** = fração dos erros "a-mais" julgados pedagogicamente válidos pelo **juiz cego cross-family** (cada extra é um _triple_ julgado individualmente, à la GraphEval — um extra **não** é alucinação por definição, é candidato). O canto bom é (alto, alto). O **F1 continua calculado e reportado ao lado** (auditável, comparável com a literatura de P/R/F1 em grafos educacionais pequenos).
  - **COMPLEMENTAR — GED** (Graph Edit Distance; Sanfeliu & Fu 1983). NP-difícil, mas **exata é viável** para ≤20 nós; _fallback_ = aproximação bipartida/Hungarian (Riesen & Bunke 2009). **Divulgar a função de custo** (unitária vs. custo de substituição semântica) como _análise de sensibilidade_ — a arbitrariedade do custo é o pitfall conhecido da GED.
  - **Tree Edit Distance** (Zhang & Shasha 1989) se o grafo for efetivamente uma árvore (caminho + ramos) — exata, polinomial, com bibliotecas prontas; "amplamente aplicada em ITS".
  - **Jaccard** de misconceptions/scaffolds.
  - _Não recomendado como primário:_ graph kernels (WL, Shervashidze 2011) — dão score sem alinhamento interpretável; super-dimensionados para grafos pequenos.
- **Framing "sem gabarito" (não-inferioridade) — verificado:**
  1. Calcular d(G_auto, E_i) para cada especialista i.
  2. Calcular d(E_i, E_j) entre especialistas → **banda de variação humano-humano**.
  3. Declarar o automático **não-inferior** (TOST / margem de não-inferioridade; Lakens 2017; Lakens, Scheel & Isager 2018) **se sua distância média aos especialistas cair dentro da banda inter-especialista**. A margem deve ser **derivada empiricamente da variação inter-especialista**, não arbitrária.
  - **Por que ≥3 especialistas:** _não_ é regra fixa; é argumento de **estimação de variância** — com 2 juízes há **uma** distância humano-humano (1 grau de liberdade, variância instável). Estimar uma _banda_ exige ≥3 medidas independentes. Justificar via **Teoria da Generalizabilidade** (Shavelson & Webb; D-study para nº de juízes).
  - **Caveat honesto (Amidei, Piwek & Willis, COLING 2018):** concordância inter-juízes **não** é um teto rígido — discordância legítima reflete ambiguidade genuína da tarefa, não só ruído. Usar a banda humano-humano como _referência_, reconhecendo isso.
- **Contribuição:** a literatura de ITS compara modelos cognitivos alternativos por **ajuste a dados** (LFA/AFM — Cen, Koedinger & Junker 2006; Koedinger et al. 2012), não por **distância estrutural de grafos**. Nossa abordagem estrutural é, portanto, **contribuição metodológica**, não duplicação. Como rota _complementar_ (não substituta), pode-se comparar os dois grafos por **ajuste preditivo a dados** (AFM/LFA) — mais barata e robusta quando há logs suficientes. E vale a postura honesta de que o **modelo do especialista não é gabarito**: modelos data-driven já superaram modelos de especialista em generalização (dAFM; Barnes 2005) — o que reforça o framing de não-inferioridade.

---

## 4. Nível 3 — Eficácia pedagógica (estudo de campo)

**Desenho-mestre que isola o grafo.** Quase-experimento: tratamento (tutor do pipeline) vs. comparação (tutor equivalente de especialista, ou condição usual), turmas pareadas por escola/ano/professor/desempenho prévio. **É o contraste auto vs. especialista — mantendo o resto do pipeline constante — que credita o resultado ao método de geração**, não à escrita dos exercícios ou às ilustrações.

**Instrumentos:**

- **Qualidade das intervenções — DAMR/Maurya.** Agente avaliador pontua dimensões pedagógicas. **Aterramento na literatura (verificado):** o _BEA 2025 Shared Task on Pedagogical Ability Assessment of AI Tutors_ (Kochmar, Maurya, Petukhova et al.) define exatamente as dimensões — **identificação do erro, localização precisa, orientação, acionabilidade do feedback** — contra anotação humana de referência. Isso conecta o DAMR a um benchmark da comunidade. _(Nota F3: `mistakeLocation`/`diagnosticQuestion` são descartados hoje; recuperá-los melhora diretamente a "localização precisa".)_
- **Calibração do avaliador automático (anti LLM-judge ingênuo) — verificado:** calibrar o avaliador contra anotação humana (kappa). **Não** usar um LLM da mesma família como juiz primário: há **viés de auto-preferência** (Panickssery, Bowman & Feng, _NeurIPS_ 2024) e a preferência humana de número único subestima factualidade e é confundida por assertividade (Hosking, Blunsom & Bartolo, _ICLR_ 2024). Usar rubrica multidimensional + juízes humanos e/ou _cross-family_.
- **Motivação — IMMS-BRV** (25 itens, Likert 5; ou RIMMS 12 itens). Pré-piloto de compreensibilidade ≥30 alunos; alfa de Cronbach por dimensão; **preferir comparação entre grupos a cortes normativos** (instrumento validado em outra população).
- **Qualidade da decomposição em KCs — LFA/AFM + curvas de aprendizagem (o instrumento mais forte e padrão).** Rotear os traces (reais ou simulados) pelos KCs do grafo e ajustar o _Additive Factor Model_ (Cen, Koedinger & Junker 2006): um grafo bem construído produz **curvas de aprendizagem power-law lisas, sem "blips"**, e _fit_ competitivo (AIC/BIC/**RMSE com validação cruzada 10-fold**, padrão DataShop) frente a um baseline de especialista. KC com curva "quebrada" denuncia decomposição errada (exatamente F1/F2). Vocabulário formal de KC em KLI (Koedinger, Corbett & Perfetti 2012). _Closing-the-loop_ — realimentar melhorias de modelo descobertas por LFA e medir ganho — é a validação última (Koedinger, McLaughlin & Stamper 2012). **Caveat (Martin et al. 2005):** curvas são _extremamente sensíveis ao setup_ — não comparar curvas entre tutores de estrutura diferente sem controlar o setup.
- **Consistência do modelo de aluno — BKT** (Corbett & Anderson 1995). Estimar parâmetros (prior/learn/slip/guess) e curvas por KC. **Sinal indireto de qualidade do grafo, com critério numérico citável:** parâmetros "atípicos" sinalizam decomposição/grafo mal feitos — concretamente, **slip > 0.5 ou guess > 0.5 (ou P(G)+P(S) ≥ 1)** são "sem sentido" (van de Sande 2013; Baker, Corbett & Aleven 2008). Lembrar identificabilidade: bom _fit_ ≠ parâmetro interpretável (Beck & Chang 2007). _Caveat:_ AUC/RMSE são convenções da EDM posterior, **não** do paper de 1995 — citar métricas a fontes posteriores.
- **Impacto na aprendizagem — quase-experimento.** Pré/pós-teste alinhados aos KCs; ANCOVA com pré-teste como covariável; tamanho de efeito (Cohen's d / Hedges' g).
  - **Atenção ao poder (crítico):** o "~64/grupo para d=0.5" assume alunos independentes. **Se a randomização é por turma**, o _design effect_ (ICC) infla muito o N necessário — o N efetivo aproxima-se do nº de turmas, exigindo **modelo multinível e mais clusters**. Além disso, o controle é **ativo** (tutor de especialista), e diferença vs. controle ativo costuma ser **menor** que d=0.5 → amostra maior. Recalcular potência com ICC plausível.

**Validade dos simuladores (suporte ao desenho).** O uso de alunos-LLM cujo estado é definido sobre KCs/misconceptions tem precedente direto: _Generative Students_ (Lu & Wang, _L@S_ 2024), validado por **sobreposição com alunos reais**. Surveys recentes notam que a maioria dos sistemas **não testa** se a distribuição dos aprendizes sintéticos bate com a dos reais — **é justamente a lacuna que nossa validação preenche.**

**Cuidado de atribuição.** Todos esses instrumentos medem o _tutor inteiro_; só o contraste auto vs. especialista credita o resultado ao grafo.

---

## 5. Sequenciamento

- **Antes do campo:** Nível 1 (testes + CI) e Nível 2a (gates de qualidade + pré-teste); início do Nível 2c (autoria dos grafos de especialista).
- **Em campo:** Nível 2b (_example-tracing_ sobre telemetria) e Nível 3; os logs alimentam simultaneamente o BKT (N3) e o tracer (2b).
- **Costura:** o experimento auto vs. especialista (2c + desenho-mestre do N3) une os três níveis.

---

## 6. Resumo: métricas, limiares e fontes

| Nível | Instrumento                                          | Métrica                                                                                                                                                                  | Limiar (pré-registrar)                                                                     | Fonte                                                                                                        |
| ----- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| 1     | Property tests (fast-check)                          | violação por P1–P7; determinismo; cobertura; **taxa de auto-reparo**                                                                                                     | 0 violações/10⁴; cobertura ≥90%                                                            | —                                                                                                            |
| 1     | **Alucinação estrutural** (`graph-hallucination.js`) | DUROS (ciclo patológico, órfão, beco, scaffold/aresta órfã) barram; MOLES → `hallucination_score`                                                                        | DUROS = 0; score ≤ µ+λσ da banda histórica                                                 | Survey 2601.17717 (VR); Continuous Monitoring 2509.03857 (µ+λσ); SentinelAgent 2505.24201                    |
| 2a-A  | Painel de especialistas                              | I-CVI; S-CVI/Ave; CVR; κ\*                                                                                                                                               | I-CVI ≥0.78 (6+); S-CVI/Ave ≥0.90; κ\* ≥0.74                                               | Lynn 1986; Polit & Beck 2006; Ayre & Scally 2014                                                             |
| 2a-A  | Concordância                                         | kappa / α                                                                                                                                                                | κ ≥0.61; α ≥0.667                                                                          | Landis & Koch 1977; Krippendorff 2004                                                                        |
| 2a-B  | Pré-teste real                                       | cobertura; inveracidade                                                                                                                                                  | >50%; <30%                                                                                 | Brown & Burton 1978; VanLehn 1990                                                                            |
| 2b    | Example-tracing (telemetria)                         | TCE/TF/TCT; recall; scaffolds mortos; **precisão+recall do matcher**                                                                                                     | TCE ≥85%/70%; recall ≥50%; mortos ≤30%; kappa ≥0.7                                         | (instrumento novo)                                                                                           |
| 2c    | Comparação c/ especialista                           | **Completude (recall direcional, 2 direções na banda HH) + validade-dos-extras (juiz cego) — veredito 2D**; recall de passos separado; F1/GED/Jaccard auditáveis ao lado | (alto, alto); completude RH ⊂ banda HH direcional (não-inferioridade, δ derivado da banda) | Tversky 1977; GraphEval 2407.10793; Sanfeliu & Fu 1983; Zhang & Shasha 1989; Lakens 2017; Amidei et al. 2018 |
| 3     | DAMR/Maurya                                          | dimensões pedagógicas vs. humano                                                                                                                                         | calibração κ; sem inferioridade                                                            | Kochmar/Maurya 2025 (BEA); Panickssery 2024; Hosking 2024                                                    |
| 3     | **LFA/AFM (DataShop)**                               | AIC/BIC/CV-RMSE 10-fold; curva power-law lisa                                                                                                                            | _fit_ competitivo vs. especialista; sem "blips"                                            | Cen et al. 2006; Martin et al. 2005; Koedinger et al. 2012                                                   |
| 3     | BKT                                                  | forma da curva; parâmetros                                                                                                                                               | slip/guess ≤0.5; curva decrescente                                                         | Corbett & Anderson 1995; van de Sande 2013; Baker et al. 2008; Beck & Chang 2007                             |
| 3     | Quase-experimento                                    | d / g (ANCOVA, multinível)                                                                                                                                               | sem inferioridade vs. especialista                                                         | Lu & Wang 2024 (validade dos simuladores)                                                                    |

---

## 7. Decisões a calibrar / questões em aberto

1. **Espinha do artigo:** A ("geramos grafos válidos") ou B ("ensina como especialista")? — decide o protagonista (2c vs. 3).
2. **Limiares** (TCE, cobertura, inveracidade, scaffolds mortos): pré-registrar após piloto.
3. **Tamanho de amostra do N3:** análise de potência **com ICC** (randomização por turma).
4. **GED em JS vs. sidecar Python** para o 2c.
5. **Nº de especialistas (2c):** ≥3 (argumento de variância, G-theory).
6. **Definição operacional de "ação"** para alunos pré-alfabetizados (toque, escolha, áudio).
7. **Recuperar `mistakeLocation`/`diagnosticQuestion`** (F3) antes do N3 — melhora a dimensão "localização" do DAMR.

---

## 8. Referências (verificadas; ver caveats)

**BKT / modelo de aluno**

- Corbett, A. T., & Anderson, J. R. (1995). Knowledge Tracing: Modeling the Acquisition of Procedural Knowledge. _UMUAI_, 4(4), 253–278.
- Beck, J., & Chang, K.-m. (2007). Identifiability: A Fundamental Problem of Student Modeling. _UM 2007_, LNCS 4511, 137–146.
- van de Sande, B. (2013). Properties of the Bayesian Knowledge Tracing Model. _JEDM_, 5(2), 1–10.
- Baker, R. S. J. d., Corbett, A. T., & Aleven, V. (2008). More Accurate Student Modeling through Contextual Estimation of Slip and Guess. _ITS 2008_, LNCS 5091, 406–415.

**Validade de conteúdo / concordância**

- Lawshe, C. H. (1975). A Quantitative Approach to Content Validity. _Personnel Psychology_, 28(4), 563–575.
- Lynn, M. R. (1986). Determination and Quantification of Content Validity. _Nursing Research_, 35(6), 382–385.
- Polit, D. F., & Beck, C. T. (2006). The Content Validity Index... _Research in Nursing & Health_, 29(5), 489–497.
- Ayre, C., & Scally, A. J. (2014). Critical Values for Lawshe's CVR. _Measurement and Evaluation in Counseling and Development_, 47(1), 79–86.
- Landis, J. R., & Koch, G. G. (1977). The Measurement of Observer Agreement for Categorical Data. _Biometrics_, 33(1), 159–174.
- Krippendorff, K. (2004). _Content Analysis: An Introduction to Its Methodology_ (2nd ed.). Sage.

**Misconceptions / erros**

- Brown, J. S., & Burton, R. R. (1978). Diagnostic Models for Procedural Bugs in Basic Mathematical Skills. _Cognitive Science_, 2(2), 155–192.
- Brown, J. S., & VanLehn, K. (1980). Repair Theory. _Cognitive Science_, 4(4), 379–426.
- VanLehn, K. (1990). _Mind Bugs: The Origins of Procedural Misconceptions_. MIT Press.

**Example-tracing / CTAT / modelos cognitivos em ITS**

- Aleven, V., McLaren, B. M., Sewall, J., & Koedinger, K. R. (2009). A New Paradigm for Intelligent Tutoring Systems: Example-Tracing Tutors. _IJAIED_, 19(2), 105–154. _(DOI não localizado.)_
- Aleven, V., McLaren, B. M., Sewall, J., van Velsen, M., Popescu, O., Demi, S., Ringenberg, M., & Koedinger, K. R. (2016). Example-Tracing Tutors: Intelligent Tutor Development for Non-programmers. _IJAIED_, 26(1), 224–269. DOI 10.1007/s40593-015-0088-2.
- Aleven, V., McLaren, B. M., Sewall, J., & Koedinger, K. R. (2006). The Cognitive Tutor Authoring Tools (CTAT): Preliminary Evaluation of Efficiency Gains. _ITS 2006_, LNCS 4053, 61–70. DOI 10.1007/11774303_7.
- Cen, H., Koedinger, K., & Junker, B. (2006). Learning Factors Analysis — A General Method for Cognitive Model Evaluation and Improvement. _ITS 2006_, LNCS 4053, 164–175. DOI 10.1007/11774303_17.
- Koedinger, K. R., Corbett, A. T., & Perfetti, C. (2012). The Knowledge-Learning-Instruction (KLI) Framework. _Cognitive Science_, 36(5), 757–798. DOI 10.1111/j.1551-6709.2012.01245.x.
- Martin, B., Koedinger, K. R., Mitrovic, A., & Mathan, S. (2005). On Using Learning Curves to Evaluate ITS. _AIED 2005_. (Versão estendida: _UMUAI_ 21(3), 249–283, 2011.)
- Koedinger, K. R., McLaughlin, E. A., & Stamper, J. C. (2012). Automated Student Model Improvement. _EDM 2012_, 17–24.
- Barnes, T. (2005). The Q-matrix Method: Mining Student Response Data for Knowledge. _AAAI 2005 EDM Workshop_.

**Análise cognitiva da tarefa (CTA)**

- Clark, R. E., Feldon, D. F., van Merriënboer, J. J. G., Yates, K. A., & Early, S. (2008). Cognitive Task Analysis. In _Handbook of Research on Educational Communications and Technology_ (3rd ed.), 577–593.
- Lovett, M. C. (1998). Cognitive Task Analysis in Service of ITS Design: A Case Study in Statistics. _ITS 1998_, LNCS 1452, 234–243. DOI 10.1007/3-540-68716-5_29.
- Koedinger, K. R., & Nathan, M. J. (2004). The Real Story Behind Story Problems. _Journal of the Learning Sciences_, 13(2), 129–164.

**Similaridade de grafos**

- Sanfeliu, A., & Fu, K.-S. (1983). A distance measure between attributed relational graphs. _IEEE TSMC_, 13(3), 353–362.
- Riesen, K., & Bunke, H. (2009). Approximate GED computation by bipartite graph matching. _Image and Vision Computing_, 27(7), 950–959.
- Zhang, K., & Shasha, D. (1989). Simple Fast Algorithms for the Editing Distance Between Trees. _SIAM J. Computing_, 18(6), 1245–1262.
- Shervashidze, N., et al. (2011). Weisfeiler-Lehman Graph Kernels. _JMLR_, 12, 2539–2561.

**Conteúdo gerado por LLM / juiz LLM**

- Lu, X., & Wang, X. (2024). Generative Students. _L@S 2024_. arXiv:2405.11591.
- Kochmar, E., Maurya, K. K., Petukhova, K., et al. (2025). Findings of the BEA 2025 Shared Task on Pedagogical Ability Assessment. _BEA 2025_. arXiv:2507.10579.
- Panickssery, A., Bowman, S. R., & Feng, S. (2024). LLM Evaluators Recognize and Favor Their Own Generations. _NeurIPS 2024_. arXiv:2404.13076.
- Hosking, T., Blunsom, P., & Bartolo, M. (2024). Human Feedback is not Gold Standard. _ICLR 2024_. arXiv:2309.16349.

**Framing "sem gabarito" / não-inferioridade**

- Lakens, D. (2017). Equivalence Tests. _Social Psychological and Personality Science_, 8(4), 355–362.
- Lakens, D., Scheel, A. M., & Isager, P. M. (2018). Equivalence Testing for Psychological Research: A Tutorial. _AMPPS_, 1(2), 259–269.
- Amidei, J., Piwek, P., & Willis, A. (2018). Rethinking the Agreement in Human Evaluation Tasks. _COLING 2018_.
- Shavelson, R. J., & Webb, N. M. (1991). _Generalizability Theory: A Primer_. Sage.

> **Caveats de citação** (do levantamento): não atribuir AUC/RMSE a Corbett & Anderson 1995 (convenção posterior); citar Ayre & Scally para valores exatos de CVR; "≥3 juízes" é argumento de variância (G-theory), não regra fixa; a regra "0.83/0.78/0.75 por painel" é má-leitura de Polit & Beck — usar 1.00 (3–5) / ≥0.78 (6+); Aleven et al. 2016 tem **8 autores** (não 4) e o DOI da versão 2009 não foi localizado; "Difficulty Factors Assessment" é **nome de metodologia** (citar os estudos específicos, ex. Koedinger & Nathan 2004), não um paper único; o survey de simulação de alunos por LLM (arXiv:2511.06078) é **preprint** — não citar como peer-reviewed; conferir páginas exatas de DataShop e do CTAT-2006 antes da submissão.
