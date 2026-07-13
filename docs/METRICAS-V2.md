# Dicionário formal de métricas — protocolo v2 (gate G7)

Congelado em 2026-07-13 (Onda 2), ANTES de qualquer execução da campanha 3.
Este documento define cada estimando com fórmula, denominador, unidade e
agregação. Nenhuma métrica nova pode ser adicionada à campanha 3 depois da
primeira chamada de API; mudanças exigem emenda datada no plano de análise.

## Princípios herdados da reanálise (Emenda 3)

- Unidade inferencial: o exercício (n=24). Réplicas são agregadas por média
  dentro do exercício antes de qualquer comparação.
- Testes pareados: permutação exata por troca de sinais; Holm por família.
- Nenhum escore composto único: os desfechos coprimários representam falhas
  independentes.

## Métricas coprimárias (família primária, Holm m = nº de comparações)

### CP1. Cobertura das ações buggy da referência (comportamental)

```
R_bug(i) = ações buggy do grafo de referência do exercício i reconhecidas como
           buggy pelo grafo gerado, no estado correspondente (via trace-executor
           sobre os traços da FAMÍLIA A da bateria congelada)
           ÷ ações buggy registradas no exercício i
```

Agregação: média macro de R_bug(i) nos 24 exercícios, IC por bootstrap de
exercício. Substitui a "completude por valor" como coprimária comportamental:
mede reconhecimento NO CONTEXTO, não coincidência de valores.

### CP2. Cobertura dos traços corretos da referência

```
R_ok(i) = traços corretos da referência aceitos E completados pelo grafo gerado
          ÷ traços corretos do exercício i
```

Mesma agregação. Um grafo pode cobrir todos os erros e falhar o caminho, e
vice-versa; por isso são coprimárias, não um escore.

## Métricas secundárias (família exploratória, Holm m = nº de comparações)

- Cobertura por VALOR canônico (a "completude conceitual" das campanhas 1 e 2),
  mantida para comparabilidade histórica.
- Concordância de classificação sobre a bateria INDEPENDENTE
  (battery/frac-numberline-6.17-v1): concordância bruta, κ de Cohen, matriz de
  confusão com verdadeiros negativos (célula no-match×no-match agora possível
  pelas sondas da família C).
- Comportamentos adicionais: contagem e taxa por exercício ("não presentes na
  referência"; nunca "falsos positivos").
- Executabilidade: taxa de parse, taxa de grafos barrados pelo verificador,
  taxa de falha operacional (com retries e fallbacks no manifesto).
- Estabilidade: desvio entre réplicas por exercício.
- Custo: US$ e latência por grafo, por condição.

## O que cada direção significa (fixado)

- referência → gerado: cobertura da referência (recall direcional).
- gerado → referência: concordância com a referência. NÃO mede validade
  absoluta; itens só do gerado são "comportamentos adicionais não registrados".

## Instrumentos congelados

| Instrumento | Versão | Hash/local |
| --- | --- | --- |
| Bateria de traços | frac-numberline-6.17-v1 | `battery/frac-numberline-6.17-v1/MANIFEST.sha256` |
| Envelope A | v2 (fonte independente) | `answer-key/PROVENIENCIA.md` + `interface-input.js` |
| Executor | trace-executor.js | semântica documentada no módulo |
| Verificador | graph-hallucination.js | sensibilidade/especificidade em `analysis/derived/MUTATION-TESTING.md` |

## Julgamento automatizado (exploratório, sempre "segundo o modelo-juiz")

Itens únicos (exercício + âncora), decisão por maioria, empates excluídos e
declarados, IC por bootstrap de exercício, autoconsistência reportada. Painel
de ≥3 famílias de juízes na campanha 3, com concordância entre juízes; nenhuma
conclusão pode depender de um único juiz.
