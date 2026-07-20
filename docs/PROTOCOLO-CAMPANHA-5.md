# Protocolo da Campanha 5: iteração sequencial do simulador de alunos (2026-07-19)

> **DOCUMENTO HISTÓRICO.** Diferente do [PROTOCOLO-CAMPANHA-4.md](PROTOCOLO-CAMPANHA-4.md),
> que foi escrito antes da coleta, este texto registra RETROSPECTIVAMENTE uma campanha
> executada em um único dia (2026-07-19), com seis braços formulados sequencialmente —
> cada braço foi desenhado depois de inspecionar as faltas do braço anterior. A Campanha 5
> é, portanto, **exploratória e auditável, não confirmatória**: as emendas de desenho são
> declaradas na seção 8 e o leakage de desenho (não de dados) é assumido explicitamente.
> A fonte primária de auditoria é `resultados/campanha5-2026-07-19/` (72 runs por braço +
> `summary.json` com bootstrap por cluster) e o README dessa pasta.

## 1. Objetivo

Depois de a Campanha 4 ter medido os agentes 3a/3b/3c congelados de produção, a
Campanha 5 pergunta o inverso: **até onde a completude conceitual de misconceptions
do simulador de alunos consegue chegar sobre a mesma bancada CTAT**, mudando UMA
coisa por braço no lado da autoria e mantendo o protocolo de comparação intocado.

O objeto é o shim consolidado de avaliação (`simulate-students.js` +
`author-graph.js` + `author-from-ctat.js`), não o runtime implantado da EducaOFF.
Nenhuma conclusão desta campanha se aplica ao tutor servido a estudantes.

## 2. Protocolo fixo (idêntico em todos os braços)

- Dataset congelado `frac-numberline-6.17`: 24 problemas × 3 réplicas = 72 runs por braço.
- Comparação contra os envelopes B do especialista CTAT (autor único), via
  `metrics.js`/`schema.js` — **intocados durante toda a campanha** (qualquer mudança
  no comparador invalidaria a comparação entre braços).
- Bootstrap por cluster (exercício como unidade), 10.000 reamostragens, seed 42.
- Métrica primária: `recallMisconceptionsConceptual` (completude conceitual de
  misconceptions, excluindo erros mecânicos de interface — EMENDA 1 do plano de
  análise, herdada das campanhas anteriores).
- Secundárias: F1 conceitual, recall estrito, precisão, agreement funcional.
- O robô permanece CEGO: só Envelope A + interface compartilhada; o Envelope B
  entra apenas no comparador (`findLeaksInRobotInput` como trava programática).

## 3. Braços e a mudança única de cada um

| Braço | Mudança única em relação ao anterior | recall conceitual | F1 conceitual | estrita | precisão |
|---|---|---|---|---|---|
| Baseline 2026-07-02 | — | 0,376 | 0,376 | 0,234 | — |
| 1. Compilador endurecido | PRs #27/#28 do repositório EducaOFF (régua de ids específicos; diagnóstico por passo) | 0,543 | 0,541 | 0,400 | 0,619 |
| 2. Robô sem teto | remove o teto "2 a 8 misconceptions" do prompt; produção por cobertura POR PASSO com `buggyRule` mecânica + `sanitizeMisconceptions` pós-parse | 0,673 | 0,537 | 0,442 | 0,543 |
| 3. Taxonomia 12 classes (**NEGATIVO**) | checklist paralelo de classes de erro da literatura | 0,740 | 0,504 | 0,418 | 0,508 |
| 4. + materialização (**NEGATIVO**) | materialização explícita dos valores de cada classe | 0,751 | 0,490 | 0,400 | 0,506 |
| 5. Aterramento de interface v1 | inventário determinístico da interface (`interface-inventory.js`) no prompt | 0,704 | 0,534 | 0,455 | 0,524 |
| **6. FINAL (megabrain)** | reconstrução mass-production + eliciação focada em 3 causas + passos de interface + **troca de modelo (ver §5)** | **0,913 [0,86–0,96]** | **0,626 [0,61–0,64]** | **0,618 [0,60–0,63]** | **0,548** |

Leituras obrigatórias da tabela:

- **Os braços 3 e 4 são resultados negativos MANTIDOS no registro**: o checklist
  de classes elicia recall bruto classe-a-classe mas NÃO soma líquido em F1 e
  precisão (diluição de atenção), e a materialização explícita não move o whole
  number bias — que era, na verdade, dependência de interface. Removê-los da
  série daria uma curva monotônica falsa.
- O recall conceitual sobe monotonicamente entre 1→4 enquanto F1/precisão CAEM:
  o robô produz mais erros e acerta proporcionalmente menos. Só o braço 6 sobe
  os dois eixos ao mesmo tempo.
- 0,913 **não é "quase perfeito"**: o resíduo tem nome — gap de exploração de
  fatos disponíveis no prompt (fronteira aberta) + o caso `17pencils`,
  estruturalmente descoberto por decisão de integridade (ver §7).

## 4. O braço 6 em detalhe: previsão teórica antes da medição

Três análises determinísticas offline (zero LLM) PREVIRAM o resultado antes da
medição — artefatos em `resultados/campanha5-2026-07-19/previsao-teorica/`:

1. **Reconstrução mass-production** (`interface-reconstruction.js`): o
   `massproduction.txt` (TSV transposto, 24 problemas × 22 variáveis) + o template
   CTAT determinam a interface RENDERIZADA por problema (valores das marcas da
   reta, rótulos, contagens) — a reta é desenhada por JS e o HTML cru tem 0 ticks.
   96% das faltas não-mecânicas eram deriváveis desses fatos; 59% eram invisíveis
   ao robô sem a reconstrução.
2. **Passos**: recallSteps 0,51 era um gap determinístico de identidade de passos
   (o especialista sempre usa a mesma estrutura de 8 steps; o robô casava 3).
3. **"Inversões"**: as 44 faltas rotuladas como inversão eram a MARCA VIZINHA da
   escala em forma reduzida (2/4→1/2) — erro de leitura de escala, não de conceito.

A previsão (recall conceitual alcançável 0,992) foi verificada por um agente
independente com back-out exato dos 72 runs (`previsao-recheck.mjs`, erro 0,000).
Medido: **0,913** — o simulador capturou ~74% do headroom novo.

## 5. Modelos e confounder declarado

| Braço | Modelo do simulador (3b) | Provedor |
|---|---|---|
| 1–5 | `google/gemini-3.5-flash` (temperatura 0,7) | OpenRouter |
| 6 | `qwen/qwen3-max` | OpenRouter |

**CONFOUNDER DECLARADO:** o braço 6 muda o prompt (reconstrução + eliciação
focada) E o modelo ao mesmo tempo. O efeito modelo×prompt **não está isolado**;
nenhuma alegação da campanha pode atribuir o salto 0,704→0,913 só ao prompt ou
só ao modelo. A troca seguiu recomendação pré-existente do próprio repositório
EducaOFF (`tiers.js` → `agent3b_atrisk.recommended = qwen/qwen3-max`), não foi
escolhida após olhar resultados do braço 6. No pacote, o override vive em
`resolveEvalStudentConfig` (`simulate-students.js`); os braços 1–5 são
reproduzíveis com `STI_EVAL_3B_MODEL=google/gemini-3.5-flash`.

## 6. Custos

Aproximadamente **US$ 4 por braço** (~US$ 24 na campanha, 6 × 72 chamadas de
simulação + comparação offline). Estes são valores narrativos aproximados: os
journals por chamada desta campanha não foram consolidados neste pacote, então —
pela mesma regra aplicada a C1/C2 em [MODELOS-E-CUSTOS.md](MODELOS-E-CUSTOS.md) —
eles não devem ser citados como totais contábeis exatos.

## 7. Decisões de integridade (o que foi RECUSADO)

1. **`mfNum`, `badCount`, `doubleDiv` banidos dos fatos.** São parâmetros da
   tabela mass-production que só se materializam nas buggy edges do `.brd` do
   especialista — não são renderizados na interface. Um verificador adversarial
   independente detectou seu uso como "fato de interface" = vazamento de
   gabarito; foram removidos de `interface-reconstruction.js` e a proibição está
   travada por teste (`__tests__/interface-reconstruction.test.mjs`).
   Consequência aceita: o typo legado do `17pencils` (mfNum="5/7" onde a
   aritmética diria 5/12) fica estruturalmente descoberto — o teto honesto da
   previsão é 99,2%, não 100%.
2. **Passo `done` (constante CTAT `-1`) recusado.** Eliciar a convenção interna
   de runtime seria trivia de protocolo, não conhecimento pedagógico. O teto
   honesto de recallSteps é 0,66, não 0,83.
3. **Braços negativos mantidos** (3 e 4) — ver §3.
4. **κ funcional abandonado como métrica.** Paradoxo do κ (Feinstein &
   Cicchetti, 1990) agravado pelo desenho da bateria (itens = união das
   predições dos próprios avaliadores; marginais endógenas; célula
   surpresa×surpresa impossível). Reportar agreement bruto com IC e, se precisar
   de correção de acaso, PABAK — nunca κ de Cohen neste desenho. Investigação
   completa: [INVESTIGACAO-KAPPA-2026-07-19.md](INVESTIGACAO-KAPPA-2026-07-19.md).

## 8. Emendas e limitações a declarar em qualquer publicação

- A taxonomia (braços 3–4) e a reconstrução (braço 6) são **emendas
  exploratórias** formuladas após inspeção de faltas do próprio dataset
  congelado. É leakage de desenho, declarado: as classes são ancoradas em
  literatura e os fatos derivados apenas do que aluno/especialista viam na tela,
  mas a sequência braço-a-braço foi guiada pelos erros observados.
- O confounder modelo×prompt do braço 6 (§5).
- Os mesmos 24 exercícios das campanhas 1–4: os braços não são amostras
  independentes do domínio, e níveis absolutos não são comparáveis entre
  campanhas com desenhos diferentes (regra 5 de [VERSOES.md](VERSOES.md)).
- O BRD é referência de um autor, não verdade pedagógica universal; nada aqui
  demonstra efeito sobre aprendizagem.

## 9. Reprodução no pacote

O código que produziu o braço 6 está espelhado neste pacote standalone
(`simulate-students.js`, `interface-inventory.js`, `interface-reconstruction.js`,
`author-graph.js`, `run-ctat-eval.mjs`, `step-error-catalog.js` — este último é
um excerto da fonte única `backend/agents/diagnostics/step-error-catalog.js` do
monorepo). Os testes offline correspondentes (`__tests__/interface-*.test.mjs`,
`__tests__/simulate-*.test.mjs`) travam prompt, régua de ids, anti-vazamento e
determinismo sem nenhuma chamada de LLM. Uma repetição PAGA da coleta usaria
`npm run eval` com `OPENROUTER_API_KEY` e os overrides de modelo do §5.
