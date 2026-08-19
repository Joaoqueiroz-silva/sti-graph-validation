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

## 2. Juízo cego das escadas de dicas — EM EXECUÇÃO

## 3. Juízo cego dos extras (misconceptions) — EM EXECUÇÃO
