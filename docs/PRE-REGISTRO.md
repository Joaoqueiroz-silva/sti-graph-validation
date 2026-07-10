# Pré-registro — Validação dos Grafos de Comportamento (CTAT × EducaOFF)

> **Status:** rascunho para revisão do pesquisador (João). Pré-registrar **antes** de coletar
> grafos de especialistas humanos adicionais. Evidência do objetivo **OE-A** da dissertação / §5.3
> do artigo. Implementação: `backend/evaluation/` (ver `docs/HANDOFF-VALIDACAO-GRAFOS.md`).

## 1. Pergunta e hipótese

**Pergunta.** Dado uma interface fixa, o grafo de comportamento que os agentes da EducaOFF
autoram **sozinhos** é tão bom quanto o que um especialista autora no CTAT para a mesma interface?

**Hipótese de não-inferioridade (H1).** A semelhança robô↔especialista (RH) não é inferior à
semelhança especialista↔especialista (HH), dentro de uma margem δ pré-registrada:
`média(RH) − média(HH) > −δ`.

A comparação é por **não-inferioridade** (não por igualdade) porque não existe um "grafo certo"
único: dois especialistas competentes divergem entre si. A régua é o próprio desacordo humano (HH).

## 2. Desenho

- **Estímulo fixo:** a interface 6.17 (identificação de frações na reta numérica), 24 questões
  "mass production" sobre a MESMA interface (`backend/evaluation/cases/ctat-6.17/`).
- **Unidade de análise:** o problema (exercício). N = 24 (alvo metodológico ≥20).
- **Condições comparadas por problema:**
  - **B (especialista):** grafo extraído do `.brd` do CTAT.
  - **Robô:** grafo autorado pelos agentes da EducaOFF a partir **apenas** da interface (cego).
- **Pareamento:** quando houver ≥2 `expert*.brd` por interface, computa-se HH (todos os pares
  de especialistas) e RH (robô × cada especialista). Hoje há 1 especialista/interface → só RH.

## 3. As duas salvaguardas (não-negociáveis)

### 3.1 Anti-contaminação — o robô autora CEGO

O `.brd` é dividido por `parse-ctat-brd.js` em dois envelopes disjuntos:

|          | **Envelope A** (→ agentes)                                                                                                           | **Envelope B** (→ só comparação)                                      |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Conteúdo | `problem`, `components[]`, `correctAnswer`, `knowledgeComponents[]`                                                                  | `steps`, `misconceptions` (com `wrongAnswer`), `transitions`, `hints` |
| Origem   | `startNodeMessages` (enunciado), `Selection`s distintas (componentes), inputs corretos (resposta), `productionRule`/`ruleName` (KCs) | arestas corretas / arestas-erro / dicas do especialista               |

Garantia **no código:** funções separadas (`parseBrdToRobotInput` vs `parseBrdToExpertNeutral`);
`author-from-ctat.js` só chama a primeira; `findLeaksInRobotInput()` + teste com **controle
negativo** falham se o Envelope A contiver qualquer campo de B. Validado nos 24 problemas: 0 vazamentos.

### 3.2 Comparação sempre no esquema NEUTRO

Nunca se compara XML (CTAT) com JSON (EducaOFF) diretamente. Ambos passam por `schema.js`
(`normalizeNeutral`/`normalizeEducaoff`) e a comparação ocorre lá (`metrics.js`).

## 4. Ancoragem (como os nós casam) — dissolve a subjetividade do pareamento

- **Passo (step):** chave = `canonAnswer(answer)` ou, na falta, o KC, ou a ordem.
- **Misconception:** chave = `canonAnswer(wrongAnswer)` ← **âncora objetiva primária**.
- **Aresta:** `(chaveDe → chavePara, papel)`; só o backbone correto entra (a estrutura de erro
  é capturada nos nós-misconception, não nas arestas).

`canonAnswer` é uma **âncora semântica**: normaliza frações/decimais para forma reduzida, de modo
que valores conceitualmente iguais casem independentemente da grafia (`0/4`≡`0`, `2/8`≡`1/4`≡`0.25`).
Para inteiros e texto é idêntico a `canon()`. **Pré-registrado:** a âncora é semântica, fixada antes
da coleta humana; sua confiabilidade (κ entre 2 codificadores) será medida quando entrarem grafos
humanos reais.

## 5. Métricas

- **Primária:** `nodeF1` (F1 sobre o conjunto de nós: passos ∪ misconceptions), simétrico → o mesmo
  número serve para pares HH e RH. Secundárias: `edgeF1`, precisão/recall, Jaccard, GED.
- **Secundária (Tarefa 7, fase 2):** **equivalência funcional** — rodar uma bateria de respostas de
  aluno pelos dois grafos (player de example-tracing) e comparar os veredictos (certo/errado/qual
  dica) → concordância (%) + **κ**. É a métrica que mede _comportamento_, robusta à granularidade.

## 6. Inferência

- `nonInferiority(pairs, {margin: δ})` — IC 95% da diferença `média(RH) − média(HH)` por **bootstrap
  de cluster** (reamostra problemas, RNG semeado). Veredito vs δ: `não-inferior` / `superior` /
  `inferior` / `inconclusivo`.
- **Margem δ (pré-registrada):** derivar da **banda HH** (ex.: δ = desvio-padrão das semelhanças HH,
  ou metade da banda) quando houver ≥2 especialistas. Provisório: δ = 0,10.
- **Confiabilidade:** `reliable` exige ≥10 problemas **E** banda HH presente. Sem HH, o veredito é
  **inconclusivo por construção** — o sinal disponível é o F1 RH por problema.

## 7. Tamanho de amostra

N ≥ 20 problemas (o 6.17 já entrega 24). Especialistas: ≥2 grafos `expert*.brd` por interface para
estabelecer a banda HH (recrutamento externo; o código já suporta múltiplos).

## 8. Achados preliminares (transparência — corrida-piloto 2026-06-26, robô cego, N=24)

> Resultados de **uma** corrida (LLM estocástico, sem banda HH) — ilustrativos, não confirmatórios.

- Integridade: 24/24 grafos do robô íntegros. **média(RH) nodeF1 ≈ 0,17** (faixa ~0,00–0,30).
- **Achado metodológico (motiva refino antes da coleta humana):** os grafos "mass production" do
  CTAT contêm **misconceptions mecânicas de interface** — em quase todo problema o especialista lista
  `-1` (clicar no ponto errado da reta) e `-` (campo em branco), que são **artefatos da interação com
  o widget**, não erros conceituais sobre frações. O robô, raciocinando conceitualmente, não os prevê.
  Soma-se a **diferença de granularidade** (≈8 micro-passos de widget no especialista vs ≈4 passos
  conceituais no robô). Parte relevante do F1 baixo é, portanto, **descasamento de representação**,
  não qualidade pedagógica.

### Decisões de análise pré-registradas em resposta ao achado

1. **Classificar misconceptions** em _conceituais_ vs _mecânicas-de-interface_ e reportar o F1 nas
   duas formas (com e sem as mecânicas), declarando a regra **antes** da coleta humana.
2. Tratar a **equivalência funcional (§5)** como a métrica de decisão quando a granularidade divergir,
   já que compara comportamento, não topologia.
3. Só emitir veredito de não-inferioridade **com ≥2 especialistas** (banda HH) — até lá, reportar
   apenas o F1 descritivo por problema.

## 9. Fora de escopo (deste pré-registro)

- Coleta de dados de alunos reais; alterações em produção/Supabase; mudanças no pipeline de geração.

## 10. Materiais

- Código: `backend/evaluation/{parse-ctat-brd,author-from-ctat,run-ctat-eval,simulate-students,schema,metrics,stats}.js`.
- Corpus: `backend/evaluation/cases/ctat-6.17/` (24 `.brd` + `_interface/`).
- Reprodução: `DOTENV_CONFIG_PATH=../.env node -r dotenv/config evaluation/run-ctat-eval.mjs cases/ctat-6.17`.

---

## EMENDA 1 — 2026-07-02 (antes da coleta de dados humanos)

_Pré-registros não se reescrevem em silêncio: esta emenda registra, datada e justificada, a revisão
da métrica primária decidida na análise de 2026-06-28/30 (verificação adversarial + handoff de
metodologia). Nenhum dado de especialista humano foi coletado até aqui — a emenda antecede a coleta._

### E1.1 Métrica primária: `nodeF1` → **completude (recall direcional de misconceptions)**

O F1 simétrico (§6 original) foi rebaixado a **linha auditável**. Motivo: para uma ferramenta
**generativa**, cujo valor é enriquecer a cobertura de erros, a precision pune o candidato por
misconceptions a mais — conflando "extra válido não-catalogado" com "extra errado". É a função de
perda errada para a pergunta do experimento. A primária passa a ser:

- **Completude** = recall direcional (Tversky 1977; α=0, β=1) das misconceptions da referência
  cobertas pelo candidato, por âncora `canonAnswer` (inalterada). Cru e conceitual (§8 mantido).
- **Recall de passos reportado SEPARADO** da completude de misconceptions (falhas independentes;
  um robô pode cobrir todos os erros e perder um passo, e vice-versa).
- **Veredito 2D** = (completude, validade-dos-extras), onde a validade dos extras vem do juiz cego
  cross-family (cada extra julgado individualmente; extra ≠ alucinação por definição — é candidato).
  Canto bom = (alto, alto). Agregação da validade SEMPRE pooled com IC de Wilson sobre o corpus,
  nunca por exercício (n≈3/exercício é ruído).
- **Definição oficial do eixo X** _(fixada 2026-07-02, pós-verificação adversarial)_: a completude
  do veredito 2D é a **CONCEITUAL** (exclui misconceptions mecânicas de interface do denominador),
  idêntica nos dois runners; a crua é reportada ao lado como linha auditável. A âncora de
  misconception é **uma só** em todos os fluxos (`miscKey` em `schema.js`:
  `canonAnswer(wrongAnswer)` com fallback para descrição/id).

### E1.2 Banda HH direcional e margem δ

Recall é assimétrico (recall(Ei→Ej) ≠ recall(Ej→Ei)): a banda humano–humano será computada nas
**duas direções de cada par** de especialistas. A margem δ **será derivada da banda HH direcional**
(ex.: δ = desvio-padrão da banda) quando houver **≥3 especialistas por exercício** (G-theory,
Shavelson & Webb 1991 — com 2 há uma só medida de discordância por direção, insuficiente).
O δ provisório 0,10 segue valendo apenas como placeholder de smoke test; **o δ definitivo será
fixado a partir da banda HH ANTES de qualquer veredito confirmatório**.

### E1.3 Gate estrutural prévio (Nível 1)

Antes de qualquer comparação, cada grafo do robô passa pelo detector de alucinação estrutural
(`graph-hallucination.js`): sinais DUROS (ciclo patológico, nó inalcançável, beco sem saída,
scaffold/aresta órfã, backbone cíclico) **barram o grafo** — grafo barrado conta como falha do
robô no exercício, não é silenciosamente excluído. Sinais MOLES (over-branching, self-loop,
aresta paralela, misconception sem scaffold) são reportados como `hallucination_score`.

### E1.4 O que NÃO muda

Anti-contaminação (Envelopes A/B; teste de leak), âncora `canonAnswer`, corpus 6.17, a regra
conceitual-vs-mecânica (§8/1), o bootstrap de cluster semeado e a equivalência funcional (§5 —
que ganha a inclusão de traços _stutter-insensitive_ como sub-métrica, colapsando nós no-op antes
de medir inclusão, para não medir granularidade).

---

## EMENDA 2 — 2026-07-10 (pós-parecer interno, antes da coleta humana)

### E2.1 Cronologia completa das decisões (blindagem do pré-registro)

| Data          | Evento                                                                                  | Natureza                                                        |
| ------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 2026-06-26    | Pré-registro original (F1 primário, δ provisório 0,10)                                  | pré-dados                                                       |
| 2026-06-27    | Âncora semântica `canonAnswer` fixada; equivalência funcional definida                  | pré-dados humanos                                               |
| 2026-07-02    | EMENDA 1: primária F1 → completude direcional; veredito 2D; banda HH direcional         | antes da campanha 1 oficial                                     |
| 2026-07-02    | Campanha 1 executada (3 réplicas eval + 3 juiz)                                         | coleta automatizada                                             |
| 2026-07-08/09 | Campanha 2 multimodelo (4 braços × 6 corridas, juiz neutro único)                       | coleta automatizada                                             |
| 2026-07-10    | EMENDA 2 (esta): correção de Holm adotada; distratores difíceis; guarda de equivalência | pós-parecer, ANTES de qualquer coleta com especialistas humanos |

Nenhum dado de especialista humano (banda HH) ou de anotador humano (kappa do juiz)
foi coletado até a data desta emenda.

### E2.2 Correção para comparações múltiplas (adotada a partir da campanha 2)

Toda família de comparações pareadas entre braços de modelo é corrigida por
Holm (step-down) sobre p-valores bootstrap bicaudais, com α=0,05. Reanálise da
campanha 2 sob esta regra: sobrevivem apenas as três inferioridades do braço
DeepSeek (passos, F1 estrutural e F1 conceitual, todas p-Holm=0,0105); a melhora
de inclusão de traços do braço Sonnet 5, significativa sem correção (p=0,003),
não sobrevive (p-Holm=0,054) e passa a ser reportada como sugestiva.

### E2.3 Controles negativos endurecidos e guarda de equivalência

Aos dois distratores originais somam-se dois DIFÍCEIS por exercício: a forma
não-canônica da resposta correta (ex.: 6/8 quando a resposta é 3/4) e o valor
impossível no contexto (fração negativa de grandeza física). Auditoria de
2026-07-10 (juiz Mistral, 24 exercícios): correta 0/24 aprovados, absurdo 0/24,
impossível 1/24, e **equivalente 24/24 aprovados (falha total na fronteira
fina)**. Verificação retrospectiva: a falha não contaminou as campanhas (dos 669
excedentes julgados, 6 eram equivalentes à resposta correta e nenhum foi
aprovado). Mitigação por construção: guarda determinística pela âncora semântica
(candidato com a mesma âncora da resposta correta → "na_verdade_correta", sem
consultar o LLM), coberta por teste. O relatório de validade do juiz passa a
reportar a taxa de rejeição dos quatro distratores por rodada.

### E2.4 Pacote de anotação humana congelado

O conjunto de 370 itens únicos para a anotação humana (kappa juiz-humano) foi
gerado e congelado nesta data a partir dos julgamentos das duas campanhas,
embaralhado com semente fixa (20260710) e deduplicado por âncora; o anotador
não tem acesso aos vereditos do juiz antes de concluir (`anotacao-humana/` no
repositório do experimento).

### E2.5 Estatuto exploratório versus confirmatório (esclarecimento de cronologia)

Para eliminar ambiguidade apontada em revisão: a troca da métrica primária
(F1 → completude, Emenda 1) foi decidida APÓS corridas exploratórias de junho de
2026 (nas quais resultados de agentes já haviam sido observados) e ANTES das
campanhas confirmatórias de julho. As campanhas 1 e 2 são confirmatórias sob a
métrica vigente; a escolha da métrica, porém, não foi cega aos dados
exploratórios, e o relatório declara isso textualmente (Seção 3.8). A única
decisão integralmente cega remanescente é o teste de não-inferioridade, cuja
margem será derivada da banda interespecialistas ainda não coletada.

### E2.6 Equivalência entre juízes candidatos

Bancada de 2026-07-10 (45 itens estratificados, semente 77): κ de Cohen par a
par entre Mistral Large, Mistral Medium e Qwen3.7-plus entre 0,644 e 0,700
(concordância substancial), com taxas de aprovação de 67 a 69%. A escolha do
juiz por latência/custo não introduz viés de veredito detectável na amostra.
Dados em `resultados/bancada-juizes-2026-07-10/` no repositório.
