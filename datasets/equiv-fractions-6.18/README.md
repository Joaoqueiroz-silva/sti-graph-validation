# Dataset `equiv-fractions-6.18` — Grafos de comportamento (CTAT × EducaOFF)

Dataset para validação de grafos de comportamento autorados automaticamente. Cada STI traz a
interface fixa de um problema, o grafo do especialista (autorado no CTAT, *Example-tracing Tutor*)
e a sua forma dividida em **dois envelopes**.

## Estrutura

```
equiv-fractions-6.18/
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

## Problemas (20)

| id | resposta | passos | misconceptions | KCs |
| -- | -------- | ------ | -------------- | --- |
| `01_1` | 2/8 | 22 | 7 | 5 |
| `02_2` | 4/12 | 22 | 7 | 5 |
| `03_1` | 1/3 | 22 | 7 | 5 |
| `04_2` | 3/6 | 22 | 7 | 5 |
| `05_1` | 5/5 | 22 | 7 | 5 |
| `06_1` | 2/4 | 22 | 7 | 5 |
| `07_2` | 4/9 | 22 | 7 | 5 |
| `08_2` | 4/5 | 22 | 7 | 5 |
| `09_1` | 4/12 | 22 | 7 | 5 |
| `10_2` | 2/6 | 22 | 7 | 5 |
| `11_1` | 14/7 | 22 | 7 | 5 |
| `12_1` | 9/6 | 22 | 7 | 5 |
| `13_2` | 12/16 | 22 | 7 | 5 |
| `14_2` | 7/4 | 22 | 7 | 5 |
| `15_1` | 4/3 | 22 | 7 | 5 |
| `16_1` | 12/9 | 22 | 7 | 5 |
| `17_2` | 3/2 | 22 | 7 | 5 |
| `18_2` | 21/12 | 22 | 7 | 5 |
| `19_1` | 6/4 | 22 | 7 | 5 |
| `20_2` | 10/6 | 22 | 7 | 5 |

## Procedência e citação

Os `expert.brd` são exports do CTAT (Carnegie Learning / Carnegie Mellon). Dataset organizado pela
equipe EducaOFF. Ao usar, cite o artigo correspondente (referência a preencher).
