# Plano de port dos agentes de produção para o repositório do experimento

**Data:** 2026-08-12
**Destino:** este repositório

## 0. Fontes

Duas, nesta ordem de preferência:

1. **`Joaoqueiroz-silva/sti-unplugged`**, branch `main` — fonte primária.
2. **O projeto em produção na VPS** — consultável quando o repositório não basta:
   para conferir qual versão está de fato rodando, ler configuração efetiva de
   modelos, ou inspecionar um comportamento que o código sozinho não explica.

**Regra sobre a VPS: somente leitura.** Nada de escrever, reiniciar serviço,
aplicar migração ou alterar configuração. O port é uma operação de cópia para
fora da produção, nunca para dentro.

**Se o repositório e a produção divergirem, pare e pergunte qual vale.** Portar a
versão errada faz o experimento medir um sistema que ninguém usa — que é
exatamente o problema que este port existe para corrigir.

## 1. Por que portar

Os agentes em produção mudaram e as mudanças atacam exatamente os defeitos que a
validação profunda mediu (ver `docs/VALIDACAO-QUALIDADE-GRAFOS-V2.md`):

| Defeito medido na Campanha 4 | Mudança no agente |
|---|---|
| um grafo genérico para 4 exercícios, cobertura 0,197 | fan-out por problema: uma chamada por exercício |
| erro no passo certo: 0 de 59 pares | `stepDiagnostics` com `step` e `kcUsed` explícitos |
| 50,4% das devolutivas instruíam o professor | regra de devolutiva dirigida ao aluno |
| 23,1% dos valores eram prosa | `buggyRule` obrigatória, receita mecânica computável |
| `mistakeLocation` descartado | agora obrigatório, com `diagnosticQuestion` |

Sem o port, o experimento continua avaliando um sistema que não existe mais.

## 2. Arquivos

| Origem em `sti-unplugged` | Destino aqui | Situação |
|---|---|---|
| `backend/agents/nodes/agents3-students.js` | `agents3-students.js` | substituir |
| `backend/agents/diagnostics/error-taxonomy.js` | `diagnostics/error-taxonomy.js` | **novo** |
| `backend/agents/diagnostics/step-error-catalog.js` | `step-error-catalog.js` | substituir |
| `backend/agents/diagnostics/buggy-rules.js` | `diagnostics/buggy-rules.js` | **novo** |
| `backend/agents/graphforge.js` | `graphforge.js` | **conferir o diff antes** |
| `backend/agents/misconceptions-db.js` | `misconceptions-db.js` | conferir o diff |

## 3. Religação de imports

O código de produção importa de módulos que aqui têm outro nome. **Não reescrever
os agentes**: criar um adaptador fino, para que o arquivo portado fique byte a
byte igual ao de produção e o diff futuro seja legível.

| Import no código de produção | Aqui |
|---|---|
| `../pipeline-core.js` → `createLLM`, `callLLM`, `extractJson`, `getAgentConfig` | criar `pipeline-core.js` que reexporta de `llm.js` |
| `../../lib/logger.js` | criar `lib/logger.js` que reexporta de `logger.js` |
| `../misconceptions-db.js` | já existe na raiz |
| `../diagnostics/step-error-catalog.js` | mover para `diagnostics/` e deixar um reexport na raiz |

Se alguma assinatura não bater, o adaptador implementa a diferença. Nunca
alterar o agente.

## 4. Configuração de modelos — parte do port, não melhoria posterior

O `getAgentConfig` do adaptador é o ponto onde o modelo de cada agente é
resolvido. Implementar conforme `docs/CONFIGURACAO-MODELOS.md`:

- `config/modelos.json` com perfis nomeados (partir de `config/modelos.exemplo.json`);
- `--perfil <nome>` e `PERFIL_MODELOS` trocam todos os modelos;
- `--modelo <agente>=<id>` e `MODELO_<AGENTE>` trocam um agente só;
- o mapa **resolvido** vai para o registro de execução.

Perfil padrão **custo-benefício**: GPT-5.6 Luna em domínio e materialização,
Gemini 3.1 Flash-Lite em estudantes, revisão e checagem, via OpenRouter.

Conferir os identificadores exatos contra a lista de modelos do OpenRouter antes
de rodar. Não assumir que o identificador escrito aqui existe com esse nome.

## 5. Mudança no coletor

`scripts/reproduce-collect.mjs` grava hoje apenas métricas agregadas e a lista de
valores. Precisa passar a gravar o registro completo conforme
`docs/CONTRATO-RUN-V2.md`, incluindo `modelos.porAgente` e `custo`.

Essa é a parte que não pode ser esquecida: sem ela, a próxima campanha ficará
tão inauditavel quanto a Campanha 5.

## 6. Critérios de aceitação

1. `npm test` verde, sem reduzir a contagem de testes.
2. `npm run verify:offline` verde.
3. `node analysis/validacao-v2/validar.mjs --legado resultados/campanha5-2026-07-19/6-final-megabrain/runs`
   continua reproduzindo cobertura 0,9079, precisão 0,4043, F1 0,5521 e Jaccard 0,3862.
4. `--perfil turbo` muda o mapa resolvido, e a mudança aparece no registro gravado.
5. `--modelo estudantes=<x>` troca só aquele agente, deixando os demais no perfil.
6. Um piloto de 1 exercício produz um JSON que passa em `validar.mjs --runs`, com
   os níveis 2, 3 e 5 calculados em vez de declarados indisponíveis.
7. Teste novo garantindo que o coletor grava todos os campos obrigatórios do
   contrato v2, incluindo `modelos.porAgente`.

## 7. O que não fazer

- Não mexer em `metrics.js`, `schema.js` nem no comparador. A comparação precisa
  ficar intocada para que os números novos sejam comparáveis com os antigos.
- Não apagar as campanhas anteriores nem seus resultados.
- Não alterar os prompts durante o port. Port é port; ajuste de prompt é outra
  mudança, com outra medição.
- Não escrever nada na VPS.
