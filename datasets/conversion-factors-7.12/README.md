# Dataset `conversion-factors-7.12` — Grafos de comportamento (CTAT × EducaOFF)

Dataset para validação de grafos de comportamento autorados automaticamente. Cada STI traz a
interface fixa de um problema, o grafo do especialista (autorado no CTAT, *Example-tracing Tutor*)
e a sua forma dividida em **dois envelopes**.

## Estrutura

```
conversion-factors-7.12/
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

## Problemas (18)

| id | resposta | passos | misconceptions | KCs |
| -- | -------- | ------ | -------------- | --- |
| `00Bubble` | 39 | 11 | 6 | 6 |
| `01Garden` | 3 | 11 | 6 | 6 |
| `02Water` | 12 | 11 | 6 | 6 |
| `03Cookies` | 120 | 11 | 6 | 6 |
| `04Bicyclist` | 50 | 11 | 6 | 6 |
| `05Map` | 50.5 | 11 | 6 | 6 |
| `06Lemonade` | 25 | 11 | 6 | 6 |
| `07Driving` | 50 | 11 | 6 | 6 |
| `08Saturn` | 24 | 11 | 6 | 6 |
| `09Donation` | 2 | 11 | 6 | 6 |
| `10Haircuts` | 6 | 11 | 6 | 6 |
| `11Lemonade-2` | 5 | 11 | 6 | 6 |
| `12Eggs` | 10 | 11 | 6 | 6 |
| `13Running` | 12.5 | 11 | 6 | 6 |
| `14Snail` | 6 | 11 | 6 | 6 |
| `15Lemonade-3` | 9 | 11 | 6 | 6 |
| `16Clock` | 20 | 11 | 6 | 6 |
| `17Balloons` | 12 | 11 | 6 | 6 |

## Procedência e citação

Os `expert.brd` são exports do CTAT (Carnegie Learning / Carnegie Mellon). Dataset organizado pela
equipe EducaOFF. Ao usar, cite o artigo correspondente (referência a preencher).
