# Dataset `frac-numberline-6.17` — Grafos de comportamento (CTAT × EducaOFF)

Dataset para validação de grafos de comportamento autorados automaticamente. Cada STI traz a
interface fixa de um problema, o grafo do especialista (autorado no CTAT, *Example-tracing Tutor*)
e a sua forma dividida em **dois envelopes**.

## Estrutura

```
frac-numberline-6.17/
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

## Problemas (24)

| id | resposta | passos | misconceptions | KCs |
| -- | -------- | ------ | -------------- | --- |
| `00bubble` | 1/5 | 8 | 8 | 5 |
| `01watermelon` | 1/4 | 8 | 8 | 5 |
| `02watermelon` | 3/4 | 8 | 8 | 5 |
| `03summerBooks` | 3/5 | 8 | 8 | 5 |
| `04soccerSeason` | 3/4 | 8 | 8 | 5 |
| `05flu` | 3/5 | 8 | 8 | 5 |
| `06lemonade` | 2/7 | 8 | 8 | 5 |
| `07pizza` | 5/8 | 8 | 8 | 5 |
| `08dentists` | 4/5 | 8 | 8 | 5 |
| `09mathCompetition` | 9/14 | 8 | 8 | 5 |
| `10children` | 2/3 | 8 | 8 | 5 |
| `11project` | 5/7 | 8 | 8 | 5 |
| `12apples` | 15/12 | 8 | 8 | 5 |
| `13cleanRoom` | 5/4 | 8 | 8 | 5 |
| `14centimeter` | 13/10 | 8 | 8 | 5 |
| `15fishStick` | 10/7 | 8 | 8 | 5 |
| `16bonusQuestion` | 7/6 | 8 | 8 | 5 |
| `17pencils` | 17/12 | 8 | 8 | 5 |
| `18gum` | 11/6 | 8 | 8 | 5 |
| `19Painting` | 5/4 | 8 | 8 | 5 |
| `20birthday` | 15/8 | 8 | 8 | 5 |
| `21mnm` | 4/3 | 8 | 8 | 5 |
| `22biscuit` | 3/2 | 8 | 8 | 5 |
| `23textbookPack` | 13/8 | 8 | 8 | 5 |

## Procedência e citação

Os `expert.brd` são exports do CTAT (Carnegie Learning / Carnegie Mellon). Dataset organizado pela
equipe EducaOFF. Ao usar, cite o artigo correspondente (referência a preencher).
