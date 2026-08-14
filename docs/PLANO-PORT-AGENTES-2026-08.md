# Plano de port dos agentes de produção para o repositório do experimento

**Data:** 2026-08-12
**Origem:** `Joaoqueiroz-silva/sti-unplugged` (privado), branch `main`
**Destino:** este repositório

## 1. Por que portar

Os agentes em produção mudaram e as mudanças atacam exatamente os defeitos que a
validação profunda mediu (ver `docs/VALIDACAO-QUALIDADE-GRAFOS-V2.md`):

| Defeito medido na Campanha 4 | Mudança no agente |
|---|---|
| um grafo genérico para 4 exercícios, cobertura 0,197 | fan-out por problema: uma chamada por exercício (2026-07-19) |
| erro no passo certo: 0 de 59 pares | `stepDiagnostics` com `step` e `kcUsed` explícitos (2026-07-18) |
| 50,4% das devolutivas instruíam o professor | regra de devolutiva encorajadora dirigida ao aluno |
| 23,1% dos valores eram prosa | `buggyRule` obrigatória, receita mecânica computável |
| `mistakeLocation` descartado | agora obrigatório, com `diagnosticQuestion` |

Sem o port, o experimento continua avaliando um sistema que não existe mais.

## 2. Arquivos

| Origem em `sti-unplugged` | Destino aqui | Situação |
|---|---|---|
| `backend/agents/nodes/agents3-students.js` | `agents3-students.js` | substituir |
| `backend/agents/diagnostics/error-taxonomy.js` | `diagnostics/error-taxonomy.js` | **novo**, ~13 KB |
| `backend/agents/diagnostics/step-error-catalog.js` | `step-error-catalog.js` | substituir (1,5 KB aqui, ~20 KB lá) |
| `backend/agents/diagnostics/buggy-rules.js` | `diagnostics/buggy-rules.js` | **novo**, ~20 KB |
| `backend/agents/graphforge.js` | `graphforge.js` | **conferir o diff antes**; só portar se mudou |
| `backend/agents/misconceptions-db.js` | `misconceptions-db.js` | conferir o diff (normalização de acento em 2026-08-09) |

## 3. Religação de imports

O código de produção importa de módulos que aqui têm outro nome. **Não reescrever
os agentes**: criar um adaptador fino, para que o arquivo portado fique byte a
byte igual ao de produção e o diff futuro seja legível.

| Import no código de produção | Aqui |
|---|---|
| `../pipeline-core.js` → `createLLM`, `callLLM`, `extractJson`, `getAgentConfig` | criar `pipeline-core.js` que reexporta de `llm.js` |
| `../../lib/logger.js` | criar `lib/logger.js` que reexporta de `logger.js` |
| `../misconceptions-db.js` | já existe na raiz |
| `../diagnostics/step-error-catalog.js` | mover o arquivo para `diagnostics/` e deixar um reexport na raiz para não quebrar quem já importa |

Se alguma assinatura não bater (por exemplo `callLLM` com `hardTimeoutMs`), o
adaptador deve implementar a diferença. Nunca alterar o agente.

## 4. Mudança no coletor

`scripts/reproduce-collect.mjs` grava hoje apenas métricas agregadas e a lista de
valores. Precisa passar a gravar o registro completo conforme
`docs/CONTRATO-RUN-V2.md`: `grafo.passos`, `grafo.erros` com `passo`,
`componente`, `acao`, `devolutiva` e `buggyRule`, `grafo.dicas`, `auditoria` e o
bloco `bruto` com a resposta original do modelo.

Essa é a parte que não pode ser esquecida: sem ela, a próxima campanha ficará
tão inauditavel quanto a Campanha 5.

## 5. Critérios de aceitação

1. `npm test` verde, sem reduzir a contagem de testes.
2. `npm run verify:offline` verde.
3. `node analysis/validacao-v2/validar.mjs --legado resultados/campanha5-2026-07-19/6-final-megabrain/runs`
   continua reproduzindo cobertura 0,9079, precisão 0,4043, F1 0,5521 e Jaccard 0,3862.
4. Um piloto de 1 exercício produz um JSON que passa na leitura de
   `validar.mjs --runs`, com os níveis 2, 3 e 5 calculados em vez de declarados
   indisponíveis.
5. Teste novo garantindo que o coletor grava todos os campos obrigatórios do
   contrato v2.

## 6. Coleta

Depois do port: 24 exercícios × 3 réplicas, preservando os grafos. Trava de
orçamento obrigatória e custo estimado impresso antes da primeira chamada.
Rodar um piloto de 1 exercício antes da coleta completa.

## 7. O que não fazer

- Não mexer em `metrics.js`, `schema.js` nem no comparador. A comparação precisa
  ficar intocada para que os números novos sejam comparáveis com os antigos.
- Não apagar as campanhas anteriores nem seus resultados.
- Não alterar os prompts dos agentes durante o port. Port é port; qualquer
  ajuste de prompt é outra mudança, com outra medição.
