# Dataset `fraction-ordering-6.20` — Grafos de comportamento (CTAT × EducaOFF)

Dataset para validação de grafos de comportamento autorados automaticamente. Cada STI traz a
interface fixa de um problema, o grafo do especialista (autorado no CTAT, *Example-tracing Tutor*)
e a sua forma dividida em **dois envelopes**.

## Estrutura

```
fraction-ordering-6.20/
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
| `01book` | 1/4 | 8 | 6 | 4 |
| `02cheese` | 2/5 | 8 | 6 | 4 |
| `03chain` | 5/6 | 8 | 6 | 4 |
| `04school` | 4/10 | 8 | 6 | 4 |
| `05height` | 5/12 | 8 | 6 | 4 |
| `06fence` | 2/3 | 8 | 6 | 4 |
| `07sandwich` | 2/3 | 8 | 6 | 4 |
| `08swimming` | 3/10 | 8 | 6 | 4 |
| `09pie` | 3/4 | 8 | 6 | 4 |
| `10homework` | 1/3 | 8 | 6 | 4 |
| `11pizza` | 2/8 | 8 | 6 | 4 |
| `12charity` | 8/7 | 8 | 6 | 4 |
| `13school` | 13/10 | 8 | 6 | 4 |
| `14candy` | 9/8 | 8 | 6 | 4 |
| `15sauce` | 10/9 | 8 | 6 | 4 |
| `16chemistry` | 15/8 | 8 | 6 | 4 |
| `17salad` | 11/6 | 8 | 6 | 4 |
| `18prize` | 3/2 | 8 | 6 | 4 |
| `19history` | 5/4 | 8 | 6 | 4 |

## Procedência e citação

Os `expert.brd` são exports do CTAT (Carnegie Learning / Carnegie Mellon). Dataset organizado pela
equipe EducaOFF. Ao usar, cite o artigo correspondente (referência a preencher).
