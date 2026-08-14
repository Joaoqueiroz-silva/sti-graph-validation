# Registro por etapa da cadeia (extensão do contrato v2)

Estende `docs/CONTRATO-RUN-V2.md`. Tudo o que está lá continua valendo; este
documento acrescenta o bloco `etapas`.

**Por que existe.** Guardar só o grafo final responde "a produção é boa?".
Guardar o grafo depois de cada agente responde **em qual etapa a qualidade
aparece** — e permite testar se a revisão e a checagem melhoram alguma coisa,
que hoje ninguém sabe.

## Formato

```json
{
  "exercicio": "00bubble",
  "replica": 1,
  "origem": "container-producao",
  "agentesSha256": {
    "agents3-students.js": "...",
    "graphforge.js": "...",
    "agent1-domain.js": "...",
    "agent9-review.js": "...",
    "factchecker-l2.js": "..."
  },

  "etapas": [
    {
      "nome": "dominio",
      "ordem": 1,
      "modelo": "openai/gpt-5.6-luna",
      "promptSha256": "...",
      "chamadas": 1,
      "tokensEntrada": 0, "tokensSaida": 0, "usd": 0,
      "grafo": { "passos": [], "erros": [], "dicas": [] }
    },
    { "nome": "materializacao", "ordem": 2, "...": "..." },
    { "nome": "estudantes",     "ordem": 3, "chamadas": 3, "...": "..." },
    { "nome": "revisao",        "ordem": 4, "...": "..." },
    { "nome": "checagem",       "ordem": 5, "...": "..." }
  ],

  "grafo": { "passos": [], "erros": [], "dicas": [] },
  "custo": { "tokensEntrada": 0, "tokensSaida": 0, "usd": 0 },
  "auditoria": { "ok": true },
  "bruto": { "porEtapa": {} }
}
```

`grafo` na raiz continua sendo o grafo **final**, depois da última etapa. É o que
`validar.mjs --runs` lê por padrão, e por isso nada quebra.

## Regras

1. **Uma entrada por etapa que roda**, na ordem de execução. Etapa que não roda
   não aparece — ausência é informação, e melhor que um bloco de metadado que
   descreve um agente que nunca foi chamado.
2. **`grafo` de cada etapa é o estado ACUMULADO após aquela etapa**, não o delta.
   Assim cada etapa pode ser medida pelos mesmos seis níveis, sem tratamento
   especial.
3. **`agentesSha256` é obrigatório** quando a origem é o container. Sem hash a
   medição não está ancorada: o container muda e o número deixa de significar
   alguma coisa.
4. **`origem`** distingue `container-producao` de `port-local`. É o que permite a
   comparação de fidelidade entre os dois.
5. **Custo por etapa**, não só total. É o que responde se a etapa cara paga.

## Mudança necessária no validador

`validar.mjs` ganha `--etapa <nome>`, que faz os seis níveis lerem
`etapas[].grafo` daquela etapa em vez do grafo final. Sem `--etapa`, comporta-se
exatamente como hoje.

Com isso a leitura interessante vira uma série:

```
nível 2 (ancoragem)   domínio -> materialização -> estudantes -> revisão -> checagem
```

Se a curva for plana da terceira etapa em diante, revisão e checagem não estão
agregando — e isso é um achado, não um detalhe de implementação.
