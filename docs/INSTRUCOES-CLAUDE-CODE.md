# Instruções para executar o port e a coleta com o Claude Code

Este arquivo contém o prompt a enviar ao Claude Code, rodando com os dois
repositórios disponíveis localmente e com as chaves de API configuradas.

## Pré-requisitos

- `sti-graph-validation` e `sti-unplugged` clonados lado a lado.
- `.env` do experimento preenchido a partir de `.env.example`.
- Node 20.19 ou superior.

## Etapa 1 — port

```
Você vai portar os agentes de produção para o repositório do experimento.

Leia primeiro, e siga à risca:
  sti-graph-validation/docs/PLANO-PORT-AGENTES-2026-08.md
  sti-graph-validation/docs/CONTRATO-RUN-V2.md
  sti-graph-validation/docs/VALIDACAO-QUALIDADE-GRAFOS-V2.md

Regras inegociáveis:
1. Os arquivos de agente vêm de sti-unplugged byte a byte. Se um import não
   resolver, crie um adaptador no experimento. Nunca edite o agente.
2. Não toque em metrics.js, schema.js, schema-v2.js nem no comparador.
3. Não altere prompts.
4. Antes de começar, rode `git diff` entre a versão de graphforge.js e
   misconceptions-db.js dos dois repositórios e me diga se mudaram; só porte se
   tiverem mudado.

Depois do port, altere scripts/reproduce-collect.mjs para gravar o registro
completo conforme docs/CONTRATO-RUN-V2.md, e escreva um teste que falhe se
qualquer campo obrigatório do contrato deixar de ser gravado.

Critérios de aceitação, todos obrigatórios:
  npm test  → verde, sem reduzir a contagem de testes
  npm run verify:offline  → verde
  node analysis/validacao-v2/validar.mjs --legado resultados/campanha5-2026-07-19/6-final-megabrain/runs
     → cobertura 0,9079, precisão 0,4043, F1 0,5521, Jaccard 0,3862

Ao terminar, me mostre o diff completo e a saída dos três comandos. Não faça
nenhuma chamada paga de API nesta etapa.
```

## Etapa 2 — piloto de 1 exercício

```
Rode um piloto de UM exercício, uma réplica, com trava de orçamento.
Antes da primeira chamada, imprima o custo estimado e espere minha confirmação.

Depois, rode:
  node analysis/validacao-v2/validar.mjs --runs <dir do piloto>

Quero ver os níveis 2, 3 e 5 CALCULADOS, não declarados indisponíveis. Se algum
aparecer como indisponível, o coletor não está gravando o contrato v2 direito —
conserte antes de seguir.
```

## Etapa 3 — coleta completa

```
Rode a coleta completa: 24 exercícios, 3 réplicas, preservando os grafos.
Trava de orçamento ligada, custo estimado impresso antes de começar.

Ao final:
  node analysis/validacao-v2/validar.mjs --runs <dir> --json resultados/<data>/validacao-v2.json

Commite os runs, o JSON do relatório e a saída do terminal. Não edite nenhum
número.
```
