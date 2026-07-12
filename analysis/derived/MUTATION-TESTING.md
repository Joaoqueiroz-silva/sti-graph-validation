# Mutation testing do verificador de invariantes (gate G8)

Gerado por `analysis/mutation-report.mjs` em 2026-07-12T23:54:01.922Z.

## Por quê

O parecer externo observou que "encontrar zero violações demonstra principalmente que o
construtor respeita as próprias regras". Este relatório fecha essa lacuna: injeta defeitos
deliberados em grafos saudáveis e mede se o verificador (`graph-hallucination.js#intrinsicReport`)
os DETECTA (sensibilidade) sem acusar sinais que não correspondem ao defeito (especificidade).

## Método

- **Grafos-base saudáveis**: 26 (24 construídos pelo
  `graphforge.js` com topologia derivada do Envelope B dos casos do corpus CTAT 6.17 +
  2 sintéticos com formas que o corpus templatizado não cobre).
- **Operadores de mutação**: 10 funções puras e determinísticas, cada uma injetando UM defeito.
- **Detectado**: o mutante dispara TODOS os sinais esperados do operador (para o m10, sinal
  mole: `hallucinationScore > 0` com `hallucinationFlag = false`).
- **Espúrio**: o mutante dispara algum sinal DURO fora do conjunto esperado.

## Resultado: operador × sensibilidade × espúrios

| Operador | Classe de defeito | Sinal esperado | Detectados/Total | Sensibilidade | Falsos positivos (sinais duros espúrios) |
|---|---|---|---|---|---|
| m1_removeStart | grafo sem estado inicial | missingStartGoal | 26/26 | 100.0% | 0 |
| m2_removeGoal | grafo sem estado final | missingStartGoal | 26/26 | 100.0% | 0 |
| m3_noIlha | nó-ilha (desconectado) | unreachableNodes + deadEndNodes | 26/26 | 100.0% | 0 |
| m4_becoSemSaida | beco sem saída | deadEndNodes | 26/26 | 100.0% | 0 |
| m5_cicloPatologico | ciclo patológico | pathologicalCycles | 26/26 | 100.0% | 0 |
| m6_scaffoldOrfao | scaffold órfão | scaffoldsWithoutMisc | 26/26 | 100.0% | 0 |
| m7_arestaFantasma | aresta órfã | orphanEdges | 26/26 | 100.0% | 0 |
| m8_backboneCiclico | backbone cíclico (raciocínio circular) | backboneCycles + pathologicalCycles | 26/26 | 100.0% | 0 |
| m9_multiplosInicios | múltiplos inícios | unreachableNodes | 26/26 | 100.0% | 0 |
| m10_transicaoDuplicada | transição duplicada (ruído de geração) | hallucinationScore>0 | 26/26 | 100.0% | 0 |

**Agregado**: 260/260 mutantes detectados
(sensibilidade 100.0%) · 0 mutantes com
sinal duro espúrio (especificidade por mutação 100.0%).

**Especificidade global (controle negativo)**: 26/26
grafos-base intactos passaram limpos (100.0%) — 0 violações duras e
score mole 0 em cada um.

### Grafos-base excluídos

Nenhum — todos os grafos-base intactos passaram limpos (0 violações duras, score mole 0).

## Notas de desenho (o que NÃO é espúrio)

- **m3 (nó-ilha)** espera `unreachableNodes` **e** `deadEndNodes`: um nó sem arestas é, por
  definição, inalcançável de start E incapaz de co-alcançar goal — os dois sinais são o
  diagnóstico correto do mesmo defeito.
- **m8 (backbone cíclico)** espera `backboneCycles` **e** `pathologicalCycles`: todo ciclo de
  backbone é um ciclo sem remediação (implicação lógica). É o que o distingue do m5, que forma o
  ciclo com aresta `default` e dispara apenas o patológico.
- **m9 (múltiplos inícios)**: o verificador não tem sinal dedicado a "mais de um start"
  (`toWorkGraph` elege o primeiro); a detecção se dá via alcançabilidade (`unreachableNodes`).
- **m4 (beco sem saída)** remove as saídas de um SCAFFOLD (nó intermediário fora do backbone):
  remover as saídas de um step do backbone desconectaria todo o resto e dispararia
  `unreachableNodes` em cascata — o mutante deixaria de ter defeito único.

## Observação registrada (fora do escopo do W3)

O `graphforge.js` com perfis `pre_literate`/`early_reader` cria scaffold genérico com
`targetMisconception="generic_struggle"` para passos sem misconceptions — e o verificador o
acusa como scaffold órfão (sinal duro), verificado empiricamente. Incompatibilidade real
construtor×verificador; por isso a base usa os perfis `reader`/`advanced`.

## Escopo

**A conclusão vale para as classes de defeito cobertas pela suíte** — sensibilidade e
especificidade fora dessas 10 classes não foram medidas.
