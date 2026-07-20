# Interface de benchmark: adaptadores de simulador

O caminho de coleta deste pacote (`npm run reproduce:collect`) pontua QUALQUER
simulador de alunos na mesma régua do experimento final da Campanha 5. O
simulador default é o `simulate-students.js` do pacote (configuração final,
`qwen/qwen3-max`). Um adaptador substitui somente o simulador; a autoria do
grafo, o comparador e a agregação permanecem idênticos, byte a byte, para
todos os participantes.

## O contrato

Um adaptador é um módulo ES (`.mjs`) que exporta uma função assíncrona
`simulate` (export nomeado ou default):

```js
export async function simulate({ envelopeA, renderedFacts, interfaceInventory }) {
  // ... qualquer lógica: LLM próprio, modelo local, regras, humano no loop ...
  return { correctPath, misconceptions, hints };
}
```

O harness chama essa função uma vez por run (problema x réplica) e pontua o
retorno exatamente como pontuaria o simulador default.

Execução:

```bash
npm run reproduce:collect -- --adapter benchmark/adapter-exemplo.mjs --problems 2 --replicas 1
npm run reproduce:collect -- --adapter caminho/do/seu-adaptador.mjs
```

O exemplo `benchmark/adapter-exemplo.mjs` é determinístico e offline (custo
zero): serve para testar o harness e como esqueleto do seu adaptador.

## O que o adaptador PODE ver (e só isso)

1. `envelopeA`: o Envelope A do problema, com os campos `id`, `problem`
   (enunciado), `correctAnswer`, `components` (vocabulário fechado de
   componentes da interface: `id`, `type`, `label`), `knowledgeComponents`,
   `profile` e `difficulty`. É a mesma entrada CEGA do robô do experimento.
2. `renderedFacts`: a interface RENDERIZADA reconstruída da tabela
   mass-production (`interface-reconstruction.js`): limites e marcas da reta
   com valores canônicos, caixas de entrada, inteiros e frações do enunciado.
   Os parâmetros `mfNum`, `badCount` e `doubleDiv` estão BANIDOS desses fatos
   (materializam apenas nas buggy edges do especialista; a proibição está
   travada por teste em `__tests__/interface-reconstruction.test.mjs`).
3. `interfaceInventory`: o inventário determinístico de
   `interface-inventory.js` calculado sobre os itens acima, mais o campo
   `texto` com a mesma formatação que o simulador default recebe no prompt.

REGRA DE OURO: o adaptador NUNCA vê o `envelope-b` (grafo do especialista:
passos, misconceptions, wrongAnswers, dicas, feedback). O envelope-b entra no
fluxo apenas DEPOIS da autoria, dentro do comparador.

## Como o harness bloqueia vazamento

1. Antes de chamar o adaptador, o harness roda `findLeaksInRobotInput`
   (`parse-ctat-brd.js`) sobre o objeto exato entregue ao adaptador. Qualquer
   chave da lista proibida (misconceptions, wrongAnswer, hints, feedback,
   steps, transitions, entre outras) aborta a coleta com erro.
2. O dataset materializado já nasce com essa mesma trava
   (`materialize-dataset.mjs` registra `leaks: []` por problema) e o teste
   `__tests__/envelope-independence.test.mjs` cobre os 24 envelopes.
3. O envelope-b é lido somente pelo comparador (`compareGraphs` e
   `functionalEquivalence`), depois que o grafo do robô já existe.

Auditoria social: adaptadores sérios devem publicar o código e, quando usarem
LLM, o manifesto de chamadas. O hash SHA-256 do arquivo do adaptador entra no
`meta.json` e no `summary.json` da coleta.

## O que o adaptador deve retornar

O contrato de saída é o mesmo `traces` que `authorGraphForInterface` consome
(o schema do pacote, descrito no cabeçalho de `simulate-students.js`):

```json
{
  "correctPath": [
    { "kc": "kc_configurar_reta", "selection": "numline", "action": "o que o aluno faz", "result": "1" }
  ],
  "misconceptions": [
    {
      "step": 1,
      "id": "misc_inversao_num_den",
      "selection": "numline",
      "type": "procedural|conceptual|factual",
      "wrongAnswer": "5/1",
      "buggyRule": "receita mecânica que produz a wrongAnswer",
      "description": "...",
      "feedback": "..."
    }
  ],
  "hints": [{ "step": 1, "text": "dica curta" }]
}
```

Pontos que valem nota:

- `wrongAnswer` é a ÂNCORA da avaliação: valores concretos, no formato que o
  componente aceitaria. A comparação usa a chave canônica (`canonAnswer`:
  `2/8` equivale a `1/4`, `0/4` equivale a `0`).
- `selection` deve ser o id (ou label) de um componente listado em
  `envelopeA.components`. Entradas com `selection` fora do vocabulário são
  descartadas pelo harness.
- `id` de misconception segue a gramática `^[A-Za-z0-9_.:-]+$` e não pode usar
  os prefixos genéricos reservados (`misc_generic`, `misc_unclassified`,
  `misc_numeric_near`, `misc_text_confusion`). Ids inválidos são descartados.
- Duplicatas por (id, wrongAnswer canônica) são deduplicadas.

Esses filtros (`restrictToComponents` + `sanitizeMisconceptions`) são os
MESMOS aplicados ao simulador default: nenhum adaptador é pontuado com uma
régua mais frouxa nem mais dura.

## Como a pontuação funciona

1. `authorGraphForInterface(envelopeA, traces)` monta o grafo de comportamento
   do robô e `normalizeEducaoff` o converte para o esquema neutro.
2. `compareGraphs(envelopeB, robo)` produz completude, F1 e as listas
   `missing`/`extra`; `functionalEquivalence` produz a concordância funcional.
3. Cada run vira um JSON flat no mesmo formato de
   `resultados/campanha5-2026-07-19/<braço>/runs/`.
4. A agregação usa bootstrap por cluster (exercício como unidade, 10.000
   reamostragens, seed 42) e imprime a comparação com o braço final
   depositado. Critério de replicação: sobreposição dos IC95% por cluster,
   nunca igualdade pontual (ver `docs/REPRODUCAO-V7.md`).

A métrica primária do manuscrito v7 é a completude conceitual de
misconceptions. Na coluna recomputada ela é a reconstrução por chaves
canônicas do pacote (`analysis/reproduce-lib.mjs`), que na série depositada
fica de 0,003 a 0,006 abaixo do valor preservado; a comparação imprime as duas
com essa nota.

## Limites declarados

- O benchmark cobre um domínio (frações em reta numérica, 24 problemas de um
  autor único) e um alvo (envelopes CTAT). Pontuações altas aqui não provam
  qualidade pedagógica geral; ver as Limitações do manuscrito v7.
- Identificadores comerciais de modelos não congelam pesos remotos: a mesma
  configuração pode pontuar diferente com o tempo. Registre data, modelo e
  manifesto de chamadas junto do resultado.
- A licença MIT cobre o código; a situação do corpus BRD segue documentada em
  `DATA-LICENSE.md` e `PROVENANCE.md`.
