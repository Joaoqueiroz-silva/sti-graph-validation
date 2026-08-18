# Dataset `factors-scaling-8.12` — Grafos de comportamento (CTAT × EducaOFF)

Dataset para validação de grafos de comportamento autorados automaticamente. Cada STI traz a
interface fixa de um problema, o grafo do especialista (autorado no CTAT, *Example-tracing Tutor*)
e a sua forma dividida em **dois envelopes**.

## Estrutura

```
factors-scaling-8.12/
├── manifest.json          índice do dataset (lista de STIs + contagens)
├── _interface/            a interface compartilhada (screenshot, HTML, assets)
└── problems/<id>/
    ├── expert.brd         grafo do especialista (XML original do CTAT)
    ├── envelope-a.json    ENTRADA (interface CEGA): enunciado, componentes, resposta, KCs
    ├── envelope-b.json    GOLD (grafo do especialista, esquema neutro): passos, misconceptions, transições
    └── meta.json          id, hash do .brd, resposta, KCs, contagens
```

## Os dois envelopes (a ideia central)

- **`envelope-a.json`** é o que um agente/sistema recebe para autorar o grafo — **só a interface**,
  sem o caminho correto nem os erros do especialista (autoria CEGA, anti-contaminação).
- **`envelope-b.json`** é o **gold**: o grafo do especialista normalizado, usado **apenas na
  comparação** (F1 de nós, equivalência funcional, etc.). A âncora dos erros é o `wrongAnswer`.

## Como usar

1. Dê o `envelope-a.json` ao seu sistema → ele autora um grafo de comportamento.
2. Normalize-o ao mesmo esquema neutro do `envelope-b.json`.
3. Compare (F1 de nós, equivalência funcional, validade pedagógica por juiz).

## Problemas (19)

| id | resposta | passos | misconceptions | KCs |
| -- | -------- | ------ | -------------- | --- |
| `CD sales` | 50 | 25 | 11 | 5 |
| `animal shelter` | 2 | 25 | 11 | 5 |
| `bands collection` | 1.75 | 25 | 11 | 5 |
| `bracelets` | 2.5 | 25 | 11 | 5 |
| `chemical solution` | 8.7 | 25 | 11 | 5 |
| `concert` | 60 | 25 | 11 | 5 |
| `cookies` | 2 | 25 | 11 | 5 |
| `deer in garden` | 4 | 25 | 11 | 5 |
| `double-booked plane` | 1.5 | 25 | 11 | 5 |
| `kennel` | 4 | 25 | 11 | 5 |
| `mileage` | 50 | 25 | 11 | 5 |
| `office picnic` | 4 | 25 | 11 | 5 |
| `pizza party` | 5 | 25 | 11 | 5 |
| `shed` | 4 | 25 | 11 | 5 |
| `stick house` | 40 | 25 | 11 | 5 |
| `texting` | 61 | 25 | 11 | 5 |
| `toy robot` | 2.3 | 25 | 11 | 5 |
| `tree height` | 10 | 25 | 11 | 5 |
| `widgets` | 200 | 25 | 11 | 5 |

## Procedência e citação

Os `expert.brd` são exports do CTAT (Carnegie Learning / Carnegie Mellon). Dataset organizado pela
equipe EducaOFF. Ao usar, cite o artigo correspondente (referência a preencher).
