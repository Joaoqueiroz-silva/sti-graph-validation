# Dataset `frac-estimates-6.19` — Grafos de comportamento (CTAT × EducaOFF)

Dataset para validação de grafos de comportamento autorados automaticamente. Cada STI traz a
interface fixa de um problema, o grafo do especialista (autorado no CTAT, *Example-tracing Tutor*)
e a sua forma dividida em **dois envelopes**.

## Estrutura

```
frac-estimates-6.19/
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

## Problemas (23)

| id | resposta | passos | misconceptions | KCs |
| -- | -------- | ------ | -------------- | --- |
| `00bubble` | 5/7 | 11 | 4 | 5 |
| `01tv` | 1/4 | 11 | 4 | 5 |
| `02tv` | 3/4 | 11 | 4 | 5 |
| `03football` | 3/6 | 11 | 4 | 5 |
| `04president` | 7/10 | 11 | 4 | 5 |
| `05music` | 5/6 | 11 | 4 | 5 |
| `06boyschool` | 3/5 | 11 | 4 | 5 |
| `07tomato` | 6/8 | 11 | 4 | 5 |
| `08bowl` | 5/10 | 11 | 4 | 5 |
| `09fence` | 5/7 | 11 | 4 | 5 |
| `10highlighters` | 9/10 | 11 | 4 | 5 |
| `11park` | 2/4 | 11 | 4 | 5 |
| `12park` | 6/4 | 11 | 4 | 5 |
| `13pizza` | 9/6 | 11 | 4 | 5 |
| `14ex` | 13/8 | 11 | 4 | 5 |
| `15baseball` | 10/9 | 11 | 4 | 5 |
| `16muffin` | 23/12 | 11 | 4 | 5 |
| `17juice` | 11/4 | 11 | 4 | 5 |
| `18dozen` | 33/12 | 11 | 4 | 5 |
| `19gum` | 6/5 | 11 | 4 | 5 |
| `20gum` | 12/5 | 11 | 4 | 5 |
| `21project` | 9/7 | 11 | 4 | 5 |
| `22water` | 9/4 | 11 | 4 | 5 |

## Procedência e citação

Os `expert.brd` são exports do CTAT (Carnegie Learning / Carnegie Mellon). Dataset organizado pela
equipe EducaOFF. Ao usar, cite o artigo correspondente (referência a preencher).
