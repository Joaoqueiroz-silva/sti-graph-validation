# Prompt para reescrever o artigo com os resultados de 19/08/2026

Cole isto no Claude, com o repositório `sti-graph-validation` e o arquivo do
artigo em mãos.

---

## O que eu quero

O artigo já existe e está escrito. **Não recomece do zero.** A tarefa é
reescrevê-lo incorporando resultados novos que não estavam nele, corrigir dois
números que mudaram, e escrever com detalhe a metodologia que produziu esses
dados — hoje ela não está documentada no texto.

Fonte da verdade, nesta ordem de precedência:

1. `resultados/juizo-2026-08-19/RESULTADOS.md` — os resultados novos
2. `resultados/juizo-2026-08-19/consolidado-simetrico.json` — precisão e F1
3. `resultados/juizo-2026-08-19/dicas-consolidado.json` — dicas, determinístico
4. `resultados/juizo-2026-08-19/juiz-dicas-z-ai-glm-4-5.json` — dicas, juiz cego
5. `docs/PRE-REGISTRO-JUIZ-E-DICAS-2026-08-19.md` — pré-registro e 3 emendas
6. `analysis/bancada-v2/comparar-dicas.mjs`, `juiz-dicas.mjs`, `regua-simetrica.mjs`

**Regra de ouro: nenhum número no texto sem que você tenha aberto o arquivo de
origem.** Se um número que eu escrevi aqui não bater com o arquivo, o arquivo
vence e você me avisa.

---

## PARTE 1 — Correção obrigatória de dois números já publicados

O texto atual traz precisão de estados **0,7173** e F1 **0,7081**. Esses valores
vêm de uma régua com defeito de simetria, corrigido em 19/08 (commit `75e696a`).

Substituir por:

| | régua congelada | **régua simétrica (a correta)** |
|---|---|---|
| precisão de estados | 0,7173 [0,6977; 0,7362] | **0,8205 [0,8038; 0,8363]** |
| F1 de estados | 0,7081 [0,6932; 0,7228] | **0,7620 [0,7476; 0,7764]** |

**Nada mais muda.** Cobertura de estados (0,7439 [0,7299; 0,7569]), linha de
base do papagaio (0,3962), cobertura ajustada (0,5931), caminho íntegro, erros
no estado certo e dicas no estado certo saem **idênticos** nas duas leituras —
isso é invariante garantido por teste, não coincidência. Todo texto sobre
cobertura, ordem e integridade de caminho fica como está.

Reportar as duas leituras lado a lado, e explicar por que a correção não
favorece o agente (ver Parte 4).

---

## PARTE 2 — SEÇÃO NOVA: comparação de dicas

O artigo não tem nada sobre dicas. Esta seção é inteira nova. Ela precisa de
metodologia detalhada **antes** dos resultados, porque a credibilidade está no
desenho.

### 2.1 Metodologia — régua determinística

**O problema que ela resolve.** Até 18/08 a única métrica de dica era
`dicasNoEstadoCerto`: presença de dica no estado casado, texto nunca comparado.
Ela saturou em 1,000 em 9 das 10 células do experimento (única exceção:
flash-lite no 8.12, 0,754), porque o agent 6 escreve escada de dicas em todo
passo. Métrica saturada não separa braço nenhum e não diz se a dica ensina.

**Unidade de análise.** O par (estado do especialista, passo do agente casado
com ele), usando o **mesmo casamento por subsequência comum mais longa (LCS)**
da régua de estados — função `casarEstados`. Estados do especialista que o
agente não criou ficam fora: comparar dica com o vazio não mede nada. Estados
extras do agente também ficam fora e são contados à parte.

**Métricas, calculadas identicamente para os dois lados sobre os mesmos pares:**

- `temDica` — o lado escreveu ≥1 dica naquele estado
- `niveis` — tamanho da escada (dicas por estado)
- `chars` — comprimento médio da dica
- `bottomOutValor` — a **última** dica da escada contém o valor esperado do
  passo (o *bottom-out* clássico do CTAT: a dica que diz o que digitar)
- `algumNivelValor` — qualquer dica da escada contém o valor
- `escadaCompleta` — escada com ≥2 níveis em que a última entrega o valor e a
  primeira não (a forma canônica: orientação → bottom-out)

**Casamento de valor por token, não por substring.** Fronteira que exclui
dígito, letra, ponto e barra: `"5"` não casa dentro de `"1/5"`, `"15"` ou
`"0.5"`. Aceita a forma bruta do `.brd` e a forma canônica (`canonAnswer`).

**Sensibilidade declarada.** Toda métrica de valor é recalculada restrita a
valores com ≥2 caracteres (sufixo `Val2`), porque valor de 1 dígito casa com
facilidade.

**Status pré-registro (declarar no texto).** `bottomOutValor` é **post hoc** —
nasceu de sondagem exploratória em 19/08, antes do pré-registro. As demais
métricas foram fixadas antes de qualquer leitura.

**Limite conhecido, que deve ser declarado:** a régua é **léxica** — vê o valor
escrito com dígitos. Uma dica que entregue a resposta por extenso não é contada.
E é exatamente essa a forma que o prompt de produção manda usar. Por isso a
régua sozinha mede a *política*, não a qualidade; quem julga conteúdo é §2.2.

**Agregação.** Bootstrap percentílico (não BCa) estratificado por corpus, com
cluster = exercício. 10.000 reamostragens, semente fixa 42.

### 2.2 Metodologia — juiz cego das escadas

**Pontuação absoluta, não preferência pareada.** Cada escada é julgada sozinha,
cega à origem, numa rubrica fixa. Perguntar "qual é melhor?" seria contaminado:
a escada do CTAT termina entregando o valor e a do agente é proibida de fazê-lo
por gate de produção — a pergunta viraria um referendo sobre essa política.

**Juiz:** `z-ai/glm-4.5`, cross-family a OpenAI (que materializa os grafos),
Google e Qwen (que geram os alunos simulados). Temperatura 0,1 (`llm.js`, `agent9_review`; não consta nos arquivos de resultado).

**Dimensões (0–3):** `especificidade` (fala DESTE problema e DESTE passo, não
conselho genérico), `escalonamento` (cada nível acrescenta informação em vez de
repetir), `acionabilidade` (depois da última dica, um aluno travado sabe o que
fazer). **Booleanos:** `correcao` e `entregaResposta` — este último descritivo,
não pontuado.

**Controles negativos, no mesmo lote e cegos:**
- **escada estrangeira** — a escada de OUTRO problema do mesmo corpus servida
  para este passo; deve cair em `especificidade`;
- **escada embaralhada** — a escada real com os níveis fora de ordem; deve cair
  em `escalonamento` e **só** nele.

**Gate pré-declarado:** `especificidade` do estrangeiro ≥0,5 abaixo da média dos
reais **E** `escalonamento` do embaralhado abaixo do ordenado. Falhando
qualquer um: juiz descalibrado, sem veredito.

**Amostragem declarada:** uma réplica por exercício × braço (a primeira em ordem
de arquivo, determinístico), todos os estados casados dela. A escada do
especialista é julgada **uma vez** por (corpus, exercício, estado).

**Volume:** 1.452 escadas, **0 sem veredito**.

### 2.3 O gate passou — e o modo como passou valida o instrumento

| pilha | especificidade | escalonamento | acionabilidade |
|---|---|---|---|
| real (especialista e agentes) | ~1,97 | ~1,88 | 2,09–2,81 |
| controle **estrangeiro** | **0,50** | 0,45 | 0,81 |
| controle **embaralhado** | 2,34 | **0,45** | 2,86 |

**Fazer este argumento explicitamente no texto:** o embaralhado manteve
especificidade alta (2,34) e acionabilidade alta (2,86), derrubando apenas o
escalonamento (0,45). Embaralhar não muda o conteúdo, só a ordem — e o juiz
isolou exatamente a dimensão da ordem, sem saber que aquilo era um controle. Um
juiz que carimbasse não produziria esse padrão.

### 2.4 Resultados

**Determinístico** (pool, bootstrap estratificado, cluster = exercício):

| | especialista | flash-lite | qwen |
|---|---|---|---|
| última dica entrega o valor | **0,849 [0,842; 0,856]** | 0,019 [0,010; 0,032] | 0,026 [0,016; 0,037] |
| escada completa | 0,807 [0,788; 0,825] | 0,019 | 0,025 |
| algum nível entrega o valor | 0,933 | 0,048 | 0,068 |
| níveis por passo | 2,97 [2,91; 3,03] | 4,00 (sem variância) | 4,00 |
| caracteres por dica | 71,7 | 81,7 | 75,8 |

Por corpus, sem exceção nas 10 células: especialista 0,573–1,000; agente
0,000–0,053.

**Juiz cego** (1.254 escadas reais):

| | especialista | flash-lite | qwen |
|---|---|---|---|
| especificidade | 1,96 | **1,97** | **1,97** |
| escalonamento | 1,88 | **1,89** | 1,88 |
| **acionabilidade** | **2,81** | 2,09 | 2,13 |
| entrega a resposta | **79 %** | 3 % | 10 % |

### 2.5 A tese da seção — escrever nesta ordem

1. **Empate onde importa para a autoria.** Os agentes escrevem escadas tão
   ancoradas no problema (1,97 vs 1,96) e tão bem escalonadas (1,89 vs 1,88)
   quanto o autor humano do CTAT.
2. **A perda é única e localizada: acionabilidade, 2,81 contra 2,09/2,13.**
3. **A causa é política de produto, documentada e datada, anterior à análise.**
   Citar literalmente:
   - `producao/agents/prompts/agent6-worker-prompt.js:556` — *"Nivel 4
     (bottom_out): Guie ate MUITO PERTO sem revelar o valor final. Explicite a
     operacao final de forma descritiva e acionavel em palavras."*
   - `producao/agents/patterns/quality-gate.js:1353-1357` — *"NENHUMA pista
     revela a resposta — decisão do usuário em 2026-08-02. A versão anterior
     isentava a última pista, tratando-a como bottom-out do CTAT. O produto
     seguiu o caminho oposto: a dica orienta até o fim, e quem conclui o passo é
     o aluno."*
4. **Duas leituras, reportadas juntas:** (a) **conformidade** — o pipeline
   cumpre a própria política em 97–98 % dos passos, e o gate funciona no
   material real; (b) **distância ao CTAT** — é aqui que o material se afasta
   mais do corpus de referência.
5. **Validação convergente.** A régua léxica (0,85 vs 0,02) e o juiz semântico
   (79 % vs 3–10 %) são instrumentos sem premissa em comum e chegaram à mesma
   conclusão. A folga (3–10 % em vez de 2 %) é exatamente a limitação léxica
   declarada: resposta entregue por extenso.

### 2.6 NÃO reportar — e dizer por quê

A dimensão `correcao` do juiz (especialista 83 %, agentes 92 % e 89 %) foi
**retirada**. Investigação das 79 escadas de especialista marcadas incorretas:
parte é crítica legítima, mas parte é o juiz errando por julgar passo **fora do
contexto da decomposição** — em `6.19/06boyschool` ele alega que "a resposta
correta é 3/5, não 5", quando `5` é o valor do campo do denominador. A
contaminação é sistemática: **8.12 tem 32 % contra 5–16 % nos demais**,
justamente o corpus mais profundo. As outras três dimensões não sofrem disso:
avaliam a escada como escada, não a matemática do passo.

---

## PARTE 3 — SEÇÃO NOVA: dois achados metodológicos sobre juiz LLM

Provavelmente o conteúdo mais transferível do artigo. Não enterrar em apêndice.

**Achado 1 — suprimir raciocínio degrada a calibração, e o controle usual é
cego a isso.** Comparação controlada: mesmos 42 itens de gabarito humano, mesmo
modelo `z-ai/glm-4.5`, única diferença o raciocínio.

| | com raciocínio | sem raciocínio |
|---|---|---|
| aprova erros do especialista | 0,929 | 0,714 |
| aprova extras dos agentes | 0,565 | 0,419 |
| **rejeita distratores** | **0,982** | **0,982** |

A prática corrente de validar juiz LLM por "ele rejeita distratores?" não vê
essa falha. Só o **controle positivo** — gabarito humano misturado na pilha,
cego — a detecta.

**Achado 2 — controle negativo mal construído reprova juiz bom.** No juiz de
estados usei os `wrongAnswer` do `.brd` como controle negativo, assumindo "valor
que o aluno erra" = "não é alvo de passo". Falso em problema multi-passo: o
mesmo valor é erro num passo e intermediário legítimo noutro. O juiz aceitou
**35,3 %** desses itens (204 de 578) — corretamente —, e a rejeição total de
distratores ficou em 0,741, abaixo do gate de 0,80. Fonte:
`resultados/juizo-2026-08-19/reprovados-no-gate/juiz-estados-z-ai-glm-4-5.json`,
`geral.calibracao.porDistrator`. (Correção de 19/08: uma versão anterior deste
prompt dizia "69 %", número lido de uma execução PARCIAL e não do lote completo;
ver F8 em `artigo/lista-de-conferencia-v0.5.md` *(não versionada: o repositório mantém só o PDF do manuscrito em `artigo/`)*.)

**A conclusão que junta os dois:** juiz LLM só é confiável se **os dois lados**
forem medidos e se **ambos os controles** forem válidos.

---

## PARTE 4 — Metodologia do reparo de simetria (explicar, não só citar)

**O defeito.** O `.brd` grava o clique em Done como `done | ButtonPressed |
"-1"`, e a função `ehMecanico` já o retirava do lado do **especialista**. O
agente escreve o mesmo clique como `"ok"`, `"done"`, `"concluído"`, `"convert"`
— e isso entrava no **denominador da precisão** como falso positivo garantido,
porque o alvo correspondente havia sido removido. Medido: **439 de 4.469 estados
de agente = 9,8 %**, presente nos 5 corpora (7,6 % a 11,6 %).

**Por que a correção não favorece o agente.** Teste de simetria obrigatório no
suíte: a regra roda contra o caminho de valor do **especialista** e conta
quantos estados atingiria. Resultado nos 5 corpora: **0 de 807**. A regra remove
do agente exatamente o que a régua já removia do humano, e nada além.

**Neutralizar, não remover.** O passo não é apagado: o seu valor é zerado. Erros
e dicas são ancorados por número de passo, e remover deslocaria a numeração.
Invariante testado: cobertura, cobertura sem ordem, caminho íntegro, erros e
dicas no estado certo saem idênticos.

**Uma regra REJEITADA pelo próprio teste — vale contar.** Suspeitei que 14,1 %
dos valores de erro do agente fossem prosa. As duas premissas eram falsas:
`ehValorUtilizavel` não é usada no carregamento da referência, e no 8.12 **132
dos 209 erros do especialista são `"*"`** (o operador, entrada legítima do
combo). Dos 850 valores do agente, 628 são opções de combo box do 6.20, 220 são
símbolos curtos, e apenas 2 são lixo. A regra foi descartada e o teste que prova
a sua assimetria permanece no suíte para impedir que volte.

---

## PARTE 5 — Lacuna que fica, sem atenuação

**Os extras de erro (misconceptions) não têm veredito.** Dois juízes, duas
reprovações no gate pré-declarado (`glm-4.5` sem raciocínio: 0,479;
`deepseek-v4-flash`: 0,501; ambos precisavam de 0,80). Pela regra, não há
número, e não houve terceira tentativa. O único juiz calibrado barato
(`gpt-5.6-luna`) **escreve 43,8 % dos erros julgados** — é o agent 6 —, logo
seria auto-avaliação.

Citar a rodada de 14/08 (~50 % dos extras válidos, juiz Luna calibrado) **apenas
como referência de outro objeto**: corpus 6.17, grafos crus do estágio 3, antes
da interface fixa. Nunca como resultado deste experimento.

---

## PARTE 6 — Nota de honestidade de execução

Quatro incidentes, todos detectados antes de publicar, todos com barreira
permanente e teste: juiz resolvendo para o modelo errado sem lançar erro (904
julgamentos descartados, US$ 10,65); fallback silencioso para modelo reprovado
no gate; `ECONNRESET` derrubando lote inteiro; estimativa de custo errada por
4×. Detalhe em `resultados/juizo-2026-08-19/RESULTADOS.md` §5.

**O argumento a fazer:** eles foram encontrados **porque o desenho tem
controles**, não por sorte. Um experimento sem gabarito humano na pilha e sem
teste de simetria teria os mesmos erros, invisíveis, dentro do texto.

---

## Tom e restrições

- Escrever como quem relata o que fez, não como quem vende resultado.
- Toda decisão pós-dados vem rotulada como pós-dados.
- Onde há empate, dizer empate — não transformar em vitória.
- Não usar "os agentes superam o especialista" em lugar nenhum.
- Não reportar cobertura bruta sem a linha de base ao lado.
- Cada afirmação forte precisa de um número com arquivo de origem.
- Ao terminar, listar toda alteração feita no artigo, número a número, com o
  arquivo de onde cada um saiu.
