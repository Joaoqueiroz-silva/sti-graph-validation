# Instruções para executar o port, a coleta e a comparação de modelos

Prompts para enviar ao Claude Code, com os dois repositórios disponíveis
localmente e as chaves de API configuradas.

## Pré-requisitos

- `sti-graph-validation` e `sti-unplugged` clonados lado a lado.
- `.env` preenchido a partir de `.env.example`, com a chave do OpenRouter.
- Acesso de leitura à VPS de produção, se for preciso consultar.
- Node 20.19 ou superior.

---

## Etapa 1 — port e camada de modelos

```
Você vai portar os agentes de produção para o repositório do experimento e
tornar o modelo de cada agente configurável.

Leia primeiro, e siga à risca:
  sti-graph-validation/docs/PLANO-PORT-AGENTES-2026-08.md
  sti-graph-validation/docs/CONFIGURACAO-MODELOS.md
  sti-graph-validation/docs/CONTRATO-RUN-V2.md
  sti-graph-validation/docs/VALIDACAO-QUALIDADE-GRAFOS-V2.md

FONTES
A fonte primária é o repositório sti-unplugged. Se ele não bastar, você pode
consultar o projeto em produção na VPS — para conferir qual versão está de fato
rodando, ler a configuração efetiva de modelos ou entender um comportamento que
o código sozinho não explica. Me peça os dados de acesso quando precisar.

A VPS é SOMENTE LEITURA. Não escreva, não reinicie serviço, não rode migração,
não altere configuração. Se o repositório e a produção divergirem, PARE e me
pergunte qual vale antes de portar qualquer coisa.

REGRAS INEGOCIÁVEIS
1. Os arquivos de agente vêm byte a byte da fonte. Se um import não resolver,
   crie um adaptador no experimento. Nunca edite o agente.
2. Não toque em metrics.js, schema.js, schema-v2.js nem no comparador.
3. Não altere prompts.
4. Antes de começar, compare graphforge.js e misconceptions-db.js entre os dois
   repositórios e me diga se mudaram; só porte se tiverem mudado.

CONFIGURAÇÃO DE MODELOS
Implemente a resolução de modelo por agente conforme docs/CONFIGURACAO-MODELOS.md,
dentro do getAgentConfig do adaptador — sem tocar nos agentes.

Perfil padrão "custo-beneficio", via OpenRouter:
  dominio         GPT-5.6 Luna
  materializacao  GPT-5.6 Luna
  estudantes      Gemini 3.1 Flash-Lite
  revisao         Gemini 3.1 Flash-Lite
  checagem        Gemini 3.1 Flash-Lite

Perfis "turbo" e "qualidade-maxima" também, partindo de
config/modelos.exemplo.json.

Preciso poder trocar de modelo SEM editar código, de duas formas:
  --perfil turbo               ou PERFIL_MODELOS=turbo    (troca todos)
  --modelo estudantes=<id>     ou MODELO_ESTUDANTES=<id>  (troca um só)

CONFIRA os identificadores exatos contra a lista de modelos do OpenRouter antes
de qualquer chamada. Não assuma que os nomes que escrevi existem com essa grafia;
se algum não existir, me avise em vez de escolher um parecido por conta própria.

COLETOR
Altere scripts/reproduce-collect.mjs para gravar o registro completo do
docs/CONTRATO-RUN-V2.md, incluindo modelos.porAgente com o identificador
RESOLVIDO e o bloco custo. Escreva um teste que falhe se qualquer campo
obrigatório deixar de ser gravado.

CRITÉRIOS DE ACEITAÇÃO, todos obrigatórios
  npm test → verde, sem reduzir a contagem de testes
  npm run verify:offline → verde
  node analysis/validacao-v2/validar.mjs --legado resultados/campanha5-2026-07-19/6-final-megabrain/runs
     → cobertura 0,9079, precisão 0,4043, F1 0,5521, Jaccard 0,3862
  --perfil turbo muda o mapa resolvido e a mudança aparece no registro gravado
  --modelo estudantes=<x> troca só aquele agente

Ao terminar, me mostre o diff completo e a saída dos comandos. NENHUMA chamada
paga de API nesta etapa.
```

---

## Etapa 2 — piloto de 1 exercício

```
Rode um piloto: UM exercício, uma réplica, perfil custo-beneficio.
Trava de orçamento ligada. Imprima o custo estimado e espere minha confirmação
antes da primeira chamada.

Depois:
  node analysis/validacao-v2/validar.mjs --runs <dir> --rotulo piloto

Dois critérios, os dois obrigatórios:
  1. os níveis 2, 3 e 5 aparecem CALCULADOS, não "indisponíveis";
  2. o cabeçalho mostra os modelos por agente lidos do próprio registro.

Se algum falhar, o coletor não está gravando o contrato v2 direito. Conserte
antes de seguir — rodar a campanha inteira com o coletor errado reproduz
exatamente o problema que travou a Campanha 5.
```

---

## Etapa 3 — campanha do braço de referência

```
Rode a campanha completa no perfil custo-beneficio: 24 exercícios, 3 réplicas,
preservando os grafos. Trava de orçamento ligada, custo estimado antes.

Ao final:
  node analysis/validacao-v2/validar.mjs --runs <dir> \
    --rotulo custo-beneficio --json resultados/<data>/custo-beneficio.json

Commite os runs, o JSON e a saída do terminal. Não edite nenhum número.
```

---

## Etapa 4 — comparação entre modelos

```
Agora os braços de comparação. Mesmo corpus, mesmas réplicas, mesmos prompts,
mesma temperatura — só o modelo muda.

Antes de rodar, me diga qual braço você considera o principal e por quê. Quero
isso registrado ANTES dos resultados, para que a escolha não seja feita depois
de olhar os números.

Ordem:
  1. perfil turbo
  2. perfil qualidade-maxima
  3. troca isolada no agente de estudantes, mantendo o resto em custo-beneficio
     (é o agente que produz as transições de erro que a métrica mede)

Um JSON por braço, com --rotulo descritivo. Depois:

  node analysis/validacao-v2/comparar-modelos.mjs \
    resultados/<data>/custo-beneficio.json \
    resultados/<data>/turbo.json \
    resultados/<data>/qualidade-maxima.json \
    --metrica f1 --ref 0

Repita com --metrica cobertura e --metrica precisao.

Na leitura: use a diferença PAREADA, não a sobreposição dos intervalos
marginais. Dois intervalos sobrepostos não autorizam concluir ausência de
diferença. E reporte TODOS os braços, não só o vencedor.

Traga também o custo total por braço: um ganho de qualidade que triplica o custo
é uma decisão diferente de um ganho que sai de graça.
```
