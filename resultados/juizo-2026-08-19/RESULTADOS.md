# Juízo dos extras e comparação de dicas — 19/08/2026

Pré-registro: `docs/PRE-REGISTRO-JUIZ-E-DICAS-2026-08-19.md` (escrito e commitado
antes de qualquer execução paga, commit `d024408`).

Fecha as duas lacunas que a auditoria de 18/08 deixou no experimento
consolidado (5 corpora, 105 problemas de especialista, 630 grafos de agente):
os **extras** nunca tinham sido julgados neste experimento, e as **dicas**
nunca tinham sido comparadas por conteúdo. Nenhum grafo foi gerado de novo.

---

## 1. Dicas — régua determinística (`comparar-dicas.mjs`)

Unidade: o par (estado do especialista, passo do agente casado com ele), pelo
mesmo casamento LCS da régua de estados. Pool com bootstrap percentílico
estratificado por corpus, cluster = exercício.

| Métrica (pares casados) | especialista | agente flash-lite | agente qwen |
|---|---|---|---|
| tem dica | 1,000 / 0,997 | **1,000** | **1,000** |
| níveis por passo | 2,970 [2,912; 3,030] | **4,000** (sem variância) | **4,000** |
| caracteres por dica | 71,7 / 68,1 | 81,7 [80,9; 82,5] | 75,8 [75,0; 76,6] |
| **última dica entrega o valor** | **0,849 [0,842; 0,856]** | **0,019 [0,010; 0,032]** | **0,026 [0,016; 0,037]** |
| algum nível entrega o valor | 0,933 [0,926; 0,942] | 0,048 [0,032; 0,065] | 0,068 [0,052; 0,084] |
| **escada completa** (≥2 níveis, última entrega, primeira não) | **0,807 [0,788; 0,825]** | **0,019 [0,010; 0,032]** | **0,025 [0,015; 0,036]** |

(as duas colunas do especialista diferem porque o conjunto de pares casados
muda com o braço; os valores são os do pool de cada braço)

Por corpus, a diferença aparece nas dez células sem exceção:

| corpus | última dica entrega o valor — especialista | flash-lite | qwen |
|---|---|---|---|
| 6.17 | 1,000 | 0,013 | 0,045 |
| 6.19 | 1,000 | 0,000 | 0,005 |
| 6.18 | 0,647 | 0,047 | 0,011 |
| 6.20 | 0,573 | 0,019 | 0,053 |
| 8.12 | 1,000 | 0,023 | 0,016 |

### O que isso NÃO é

**Não é falha dos agentes.** É política de produto, documentada e datada no
código de produção espelhado, anterior a esta análise:

`producao/agents/prompts/agent6-worker-prompt.js:556`
> "Nivel 4 (bottom_out): Guie ate MUITO PERTO sem revelar o valor final.
> Explicite a operacao final de forma descritiva e acionavel em palavras."

`producao/agents/patterns/quality-gate.js:1353-1357`
> "(2) NENHUMA pista revela a resposta — decisão do usuário em 2026-08-02. A
> versão anterior isentava a última pista, tratando-a como bottom-out do CTAT
> (o tutor entrega a resposta depois do scaffolding). O produto seguiu o
> caminho oposto: a dica orienta até o fim, e quem conclui o passo é o aluno.
> Portanto fiscalizamos TODOS os níveis, sem exceção de posição."

Logo, os números acima têm **duas leituras, que devem ser reportadas juntas**:

1. **conformidade da política** — o pipeline cumpre o que promete: em 97,4–98,1 %
   dos passos a última dica não entrega o valor, e em 93,2–95,2 % nenhum nível
   entrega. O gate funciona no material real, não só no papel.
2. **distância ao CTAT** — é exatamente aí que o material dos agentes se afasta
   mais do corpus de referência. O especialista fecha a escada com o valor em
   ~85 % dos passos; o agente, em ~2 %.

### Limite declarado da régua

Ela é **léxica**: vê o valor escrito com dígitos. Uma dica que entregue a
resposta por extenso não é contada — que é justamente a forma que o prompt de
produção manda usar ("de forma descritiva e acionavel em palavras"). Por isso a
régua sozinha não decide se a escada do agente ajuda ou não o aluno travado; ela
mede a política. Quem julga o conteúdo é a §2.

`bottomOutValor` é **post hoc** (nasceu de sondagem exploratória em 19/08, antes
do pré-registro). As demais métricas foram fixadas antes de qualquer leitura.

---

## 2. Juízo cego das escadas de dicas — GATE APROVADO

Juiz `z-ai/glm-4.5`, cego à origem, rubrica absoluta (não preferência pareada —
ver pré-registro §2b para o motivo). 1.452 escadas julgadas, **0 sem veredito**.

### 2.1 Os controles funcionaram — e a forma como funcionaram valida o juiz

| pilha | especificidade | escalonamento | acionabilidade |
|---|---|---|---|
| real (especialista e agentes) | ~1,97 | ~1,88 | 2,09–2,81 |
| **controle estrangeiro** (escada de outro problema) | **0,50** | 0,45 | 0,81 |
| **controle embaralhado** (mesma escada fora de ordem) | 2,34 | **0,45** | 2,86 |

O embaralhado é a evidência mais forte: especificidade **alta** (2,34) e
acionabilidade **alta** (2,86), com escalonamento **no chão** (0,45). Embaralhar
não muda o conteúdo, só a ordem — e o juiz derrubou exatamente a dimensão da
ordem, sem saber que aquilo era um controle. Um carimbo não faria isso.

**GATE: APROVADO** (estrangeiro cai 1,46 ponto abaixo dos reais, contra margem
pré-declarada de 0,5; embaralhado abaixo do ordenado).

### 2.2 Resultado (1.254 escadas reais)

| dimensão | especialista | flash-lite | qwen |
|---|---|---|---|
| especificidade | 1,96 | **1,97** | **1,97** |
| escalonamento | 1,88 | **1,89** | 1,88 |
| **acionabilidade** | **2,81** | 2,09 | 2,13 |
| entrega a resposta final | **79 %** | 3 % | 10 % |
| ~~nada matematicamente errado~~ | ~~83 %~~ | ~~92 %~~ | ~~89 %~~ |

**Três leituras:**

1. **Empate onde importa para a autoria.** Os agentes escrevem escadas tão
   ancoradas no problema (1,97 vs 1,96) e tão bem escalonadas (1,89 vs 1,88)
   quanto o autor humano do CTAT. Não era resultado esperado.
2. **A perda está na acionabilidade: 2,81 contra 2,09/2,13.** E a causa é a
   política de produto: o agente não fecha a escada.
3. **VALIDAÇÃO CONVERGENTE.** A régua determinística (§1), que só conta dígitos,
   mediu 0,85 contra 0,02. O juiz cego, julgando semanticamente e sem saber
   disso, mediu 79 % contra 3–10 %. Dois instrumentos de premissas diferentes,
   mesma conclusão. A pequena folga (3–10 % em vez de 2 %) é exatamente a
   limitação léxica declarada: resposta entregue por extenso.

### 2.3 Dimensão RETIRADA: `correcao`

A dimensão "nada matematicamente errado" **não é interpretável e não é
reportada**. Investigação das 79 escadas de especialista marcadas incorretas:
parte é crítica legítima ao texto, mas parte é o juiz errando por julgar um
passo **fora do contexto da decomposição** — em `6.19/06boyschool` ele alega que
"a resposta correta é 3/5, não 5", quando `5` é o valor do campo do denominador.
A contaminação é sistemática: **8.12 tem 32 % de escadas de especialista
marcadas incorretas, contra 5–16 % nos demais** — justamente o corpus mais
profundo. As outras três dimensões não sofrem disso: avaliam a escada como
escada, não a matemática do passo.

---

## 3. Juízo cego dos EXTRAS (misconceptions) — SEM VEREDITO

**Duas tentativas, duas reprovações no gate pré-declarado.** Pela regra, não há
número publicável, e não houve terceira tentativa.

| juiz | aprova especialista (≥0,80) | rejeita distratores (≥0,80) | gate |
|---|---|---|---|
| `z-ai/glm-4.5` com raciocínio suprimido | 0,479 (n=676) | 0,984 (n=820) | REPROVADO |
| `deepseek/deepseek-v4-flash` | 0,501 (n=676) | 0,957 (n=820) | REPROVADO |
| *(referência 14/08)* `gpt-5.6-luna` | 0,952 | 0,833 | aprovou |
| *(diagnóstico)* `glm-4.5` COM raciocínio | 0,929 (n=42) | 0,982 | passaria |

Os dois reprovados **erram na mesma direção**: acordo bruto 78,3 %, kappa 0,534,
ambos aprovando ~37 % dos itens. Não é ruído de modelo, é rigor sistemático.

### 3.1 Achado metodológico: suprimir raciocínio degrada a calibração — e o controle usual não detecta

Comparação controlada: mesmos 42 itens de especialista, mesmo modelo
`z-ai/glm-4.5`, única diferença o raciocínio.

| | com raciocínio | sem raciocínio |
|---|---|---|
| aprova erros do especialista | 0,929 | 0,714 |
| aprova extras dos agentes | 0,565 | 0,419 |
| **rejeita distratores** | **0,982** | **0,982** |

Suprimir raciocínio **não degradou a rejeição de lixo — degradou o
reconhecimento do legítimo**. A métrica de controle mais usada para validar juiz
LLM (ele rejeita distratores?) é **cega** a essa falha; só o controle POSITIVO
(gabarito humano misturado na pilha) a detecta.

### 3.2 Por que a lacuna permanece declarada

Restaurar `glm-4.5` com raciocínio no lote inteiro custaria ~US$ 28. `gpt-5.6-luna`
é o único juiz calibrado barato, mas **escreve 43,8 % dos erros do grafo
materializado** (medido: 2.637 de 6.021 aparecem só depois do agent 6) — seria
auto-avaliação. Restringi-lo aos 56,2 % herdados dos alunos simulados é
possível, mas muda o estimando. Fica como trabalho declarado.

---

## 4. Régua de estados: CORREÇÃO 1:1 E REPARO DE SIMETRIA

O juiz de estados foi **interrompido e não será retomado**. O motivo não é
custo: é que a pergunta que ele arbitraria estava mal posta, porque boa parte do
"resíduo" era artefato da régua.

### 4.1 O defeito

A auditoria de 20/08 encontrou primeiro um erro mais básico: a precisão
deduplicava os valores com `Set`, enquanto a cobertura usava uma LCS 1:1. Assim,
uma única ocorrência podia justificar repetições e o F1 combinava numeradores
incompatíveis. A correção vigente preserva multiplicidade e usa o **mesmo
TP = comprimento da LCS** no recall e na precisão; o denominador da precisão é
o número de ocorrências comparáveis do agente. Se o agente não produz nenhuma
ocorrência comparável diante de uma referência não vazia, precisão e F1 valem
zero. A cobertura sem ordem passou, analogamente, a usar interseção de
multiconjuntos 1:1.

Depois dessa correção, permaneceu o defeito de simetria:

O `.brd` grava o clique em Done como `done | ButtonPressed | "-1"`, e
`ehMecanico` já o retirava do lado do **especialista**. O agente escreve o mesmo
clique como `"ok"`, `"done"`, `"concluído"`, `"convert"` — e isso **entrava no
denominador da precisão como falso positivo garantido**, porque o alvo
correspondente havia sido removido. Medido: **439 de 4.469 estados de agente =
9,8 %**, presente nos 5 corpora (7,6 % a 11,6 %).

### 4.2 Por que a correção não favorece o agente

Teste de simetria, obrigatório no suíte: a regra roda contra o caminho de valor
do **especialista** e conta quantos estados atingiria. Resultado nos 5 corpora:
**0 de 807**. A regra remove do agente exatamente o que a régua já removia do
humano, e nada além.

O passo é **neutralizado, não removido** — erros e dicas são ancorados por
número de passo, e remover deslocaria a numeração. Invariante testado: cobertura
em ordem, cobertura sem ordem, caminho íntegro, erros e dicas no estado certo
saem **idênticos**.

### 4.3 Efeito, sem uma única chamada de API

| | régua congelada | régua simétrica |
|---|---|---|
| cobertura de estados | 0,7439 [0,7299; 0,7569] | **idêntica** |
| controle (papagaio) | 0,3962 [0,3640; 0,4298] | **0,3847 [0,3553; 0,4152]** |
| cobertura ajustada | 0,5931 [0,5548; 0,6277] | **0,6088 [0,5744; 0,6405]** |
| **precisão de estados** | 0,5269 [0,5152; 0,5389] | **0,5901 [0,5768; 0,6038]** |
| **F1 de estados** | 0,5811 [0,5705; 0,5915] | **0,6198 [0,6088; 0,6307]** |

Neutralizar tokens de conclusão reduz também a capacidade comparável do
papagaio; por isso controle e cobertura ajustada mudam ligeiramente, enquanto
a cobertura observada permanece idêntica. Os ICs de precisão e F1 não se
sobrepõem entre réguas. Por corpus × braço, ver
`consolidado-simetrico.json`. Na régua simétrica corrigida, o flash-lite tem
precisão 0,6326 [0,6103; 0,6551] e F1 0,6303 [0,6148; 0,6456]; o Qwen,
precisão 0,5477 [0,5322; 0,5639] e F1 0,6093 [0,5960; 0,6229]. Os ICs de F1
se sobrepõem, portanto esses dados não demonstram superioridade entre braços.
O 8.12 quase não se move (F1 0,1421→0,1437 e 0,3965→0,4022): lá o gargalo é
**recall** — 24 campos do especialista contra ~8
passos do agente — e nenhum reparo de precisão toca nisso.

### 4.4 Uma regra REJEITADA pelo próprio teste (fica registrada)

Suspeitei que 14,1 % dos valores de erro do agente fossem prosa e que a régua já
filtrasse prosa do lado humano. **As duas premissas eram falsas:**
`ehValorUtilizavel` não é usada em `carregarReferencia`; e no 8.12 **132 dos 209
erros do especialista são `"*"`** — o operador, entrada legítima do combo. Dos
850 valores do agente, 628 (73,9 %) são opções de combo box do 6.20
("Miranda lives closer to the school."), 220 (25,9 %) são símbolos curtos, e
apenas **2 (0,2 %) são lixo de serialização**. A regra foi descartada; o teste
que prova a sua assimetria permanece no suíte para impedir que volte.

---

## 5. Incidentes de execução (todos detectados antes de qualquer publicação)

Ver `descartado/LEIA-ME.md` e `reprovados-no-gate/`. Em resumo:

1. **juiz errado sem erro nenhum** — `createLLM("agent9_review")` recebe string
   onde espera objeto, cai no modelo default; 904 escadas julgadas por
   `google/gemini-3.5-flash`, a MESMA família do braço flash-lite. Descartadas
   (US$ 10,65). Barreira: `juizAtivo()` aborta se o modelo resolvido divergir do
   declarado, com teste que exercita a forma errada;
2. **fallback silencioso** para `deepseek/deepseek-chat`, família reprovada no
   gate de 14/08. Barreira: `FALLBACK_MODEL` pinado no próprio juiz;
3. **`ECONNRESET` derrubava o lote inteiro** (`Promise.all` rejeita no primeiro
   erro). Barreira: retentativa por item; item sem veredito é contado e
   reportado, nunca somado como inválido;
4. **estimativa de custo errada por 4×**, duas vezes, por não medir tokens de
   saída. Barreira: sonda de custo/latência antes de qualquer lote.

Custo total do dia: US$ 12,75 gastos, dos quais **US$ 10,65 descartados**.
