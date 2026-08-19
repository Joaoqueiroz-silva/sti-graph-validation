# Pré-registro — juízo dos EXTRAS e comparação de DICAS (19/08/2026)

Escrito **antes** de qualquer execução paga desta rodada. Fecha as duas lacunas
que a auditoria de 18/08 deixou em aberto no experimento consolidado
(5 corpora, 105 problemas de especialista, 630 grafos de agente):

1. os **extras** dos agentes (erros que o especialista não catalogou) nunca
   foram julgados **neste** experimento;
2. as **dicas** nunca foram comparadas por conteúdo — só por presença.

Nada aqui reprocessa grafo: os dois estudos consomem registros já coletados.

---

## Parte 0 — o que já existia, e por que não serve

**Juiz.** Rodou em 14/08 (`resultados/bancada-v2-2026-08-14/`), com protocolo
cego, calibração e controles negativos: juiz `openai/gpt-5.6-luna` calibrado
(aprova 95,2 % dos itens do especialista, rejeita 83,3 % dos distratores);
`deepseek/deepseek-v4-flash` REPROVADO no gate e descartado. Veredito: ~50 %
dos extras válidos; precisão 0,471 → 0,753 (flash-lite) e 0,312 → 0,653 (qwen).

Não serve para o experimento vigente porque o objeto era outro: **corpus 6.17
apenas**, **grafos crus do estágio 3**, **antes** da interface fixa e **antes**
da materialização por agent 6 + agent 7.

**Dicas.** A régua tem `dicasNoEstadoCerto`, mas é presença por estado, com o
texto explicitamente não comparado (`comparar-caminho.mjs`). Saturou em 1,000
em 9 das 10 células (exceção: flash-lite no 8.12, 0,754). Métrica saturada não
distingue braço nenhum.

---

## Parte 1 — juízo cego dos EXTRAS (misconceptions) nos 5 corpora

**Pergunta.** Dos erros que os agentes preveem **além** dos que o especialista
catalogou, quantos são misconceptions pedagogicamente válidas, e quantos são
ruído?

**Objeto.** `materializado.grafo.erros` dos registros v3 (agentes espelhados da
produção 5263488) dos 5 corpora × 2 braços. Candidatos deduplicados por valor
canônico, união das 3 réplicas, por exercício × braço. **Extra** = candidato
cujo valor canônico não está em `REF[ex].values` (erros do `.brd`).
Volume medido antes de julgar: **3.753 extras únicos** contra **958 itens do
especialista**.

**Protocolo.** Reuso byte a byte de `judge-misconceptions.js` (mesmo SYSTEM,
mesma guarda determinística de equivalência, mesmos distratores de
`makeDistractors`): o juiz recebe apenas `{problema, resposta correta,
candidato}` e **nunca** a origem.

**Juízes — e por que o de 14/08 não pode ser o primário aqui.** O grafo
materializado é escrito pelo **agent 6, que roda em `openai/gpt-5.6-luna`**
(campo `modelos.materializacao` dos registros). Julgar com Luna seria
auto-avaliação. Portanto:

| Papel | Modelo | Justificativa |
|---|---|---|
| **primário** | `z-ai/glm-4.5` | cross-family a OpenAI (materializador), Google (flash-lite) e Qwen — as três famílias que produziram o conteúdo. É o `JUDGE` default do repo (`llm.js`). |
| secundário (sensibilidade) | `openai/gpt-5.6-luna` | o juiz calibrado de 14/08; **não é independente** deste objeto. Entra só para concordância (kappa) e sensibilidade, **nunca** como veredito. |

**Gates pré-declarados** (idênticos aos de 14/08, `juiz-cego.mjs`):
- calibração: validade dos itens do especialista **≥ 0,80** E rejeição dos
  distratores **≥ 0,80**. Juiz que falhar produz "**descalibrado**" — não
  produz veredito, exatamente como o DeepSeek em 14/08;
- riqueza: a amplitude só é **RIQUEZA** se validade dos extras ≥ validade do
  especialista − 0,10.

**Sonda operacional.** Antes do lote, uma chamada por modelo candidato apenas
para verificar que ele responde e medir latência/custo. Os vereditos da sonda
são **descartados** e não entram em contagem alguma — a escolha do juiz
primário está fixada acima por família, não por desempenho.

**Se o primário falhar o gate**, o resultado publicado é "extras não julgados,
juiz descalibrado", e a limitação permanece declarada. Não haverá troca de
juiz para obter número.

**O que este juízo NÃO cobre (declarado):** ele julga **erros**. A precisão e o
F1 de **estados** (`linha-de-base.mjs`) continuam estruturais — estado extra do
agente segue contando como não casado, porque a rubrica de "passo de
decomposição aceitável" não existe e não será improvisada aqui.

---

## Parte 2 — comparação de DICAS

**Unidade.** O par (estado do especialista, passo do agente casado com ele),
pelo mesmo casamento LCS da régua (`casarEstados`). Estado não casado não entra:
comparar dica com o vazio não mede nada.

### 2a. Régua determinística (`comparar-dicas.mjs`, sem custo)

Calculadas **iguais para os dois lados**: `temDica`, `niveis`, `chars`,
`bottomOutValor` (a última dica contém o valor esperado do passo),
`algumNivelValor`, `escadaCompleta` (≥2 níveis, a última entrega o valor e a
primeira não). Casamento de valor por **token**, com fronteira que exclui
dígito, letra, ponto e barra ("5" não casa dentro de "1/5", "15" ou "0.5").
Sensibilidade declarada: tudo repetido só para valores com ≥2 caracteres
(sufixo `Val2`), porque valor de 1 dígito casa com facilidade.

**Status das métricas.** `bottomOutValor` é **POST HOC**: nasceu de uma sondagem
exploratória feita em 19/08, antes deste documento. Está rotulada como tal e
assim entra no artigo. As demais foram fixadas antes de qualquer leitura.

**Limite conhecido.** A régua é léxica: vê o valor escrito com dígitos. Uma dica
que entregue a resposta por extenso não é contada. É para isso que existe a
parte 2b.

### 2b. Juiz cego de dicas (`juiz-dicas.mjs`)

**Desenho: pontuação absoluta, não preferência pareada.** Cada escada é julgada
sozinha, cega à origem, numa rubrica fixa. Preferência pareada ("qual é
melhor?") seria contaminada pela divergência de política descrita abaixo: a
escada do CTAT termina entregando o valor e a do agente não, por decisão de
produto — a pergunta "qual é melhor" viraria um referendo sobre essa política,
não uma medida de qualidade.

**Dimensões** (0–3, exceto onde indicado):
- `especificidade` — a escada fala DESTE problema e DESTE passo, não conselho genérico;
- `escalonamento` — cada nível acrescenta informação em vez de repetir o anterior;
- `acionabilidade` — depois do último nível, um aluno travado sabe o que fazer em seguida;
- `correcao` (booleano) — nada na escada está matematicamente errado para o passo;
- `entregaResposta` (booleano) — a escada declara o valor final. **Descritivo, não pontuado**: não entra em nota, existe para medir a política dos dois lados sem julgá-la.

**Controles negativos, no mesmo lote e cegos:**
- **escada estrangeira** — a escada de OUTRO problema do mesmo corpus apresentada para este passo. Deve pontuar baixo em `especificidade`;
- **escada embaralhada** — a escada real com os níveis fora de ordem. Deve pontuar baixo em `escalonamento`.

**Gate pré-declarado do juiz de dicas:** `especificidade` média da escada
estrangeira deve ficar **≥ 0,5 ponto abaixo** da média das duas origens reais,
E `escalonamento` da embaralhada deve ficar **abaixo** da versão ordenada da
mesma escada. Falhando qualquer um: "**juiz de dicas descalibrado**", sem
veredito.

**Amostragem** (declarada para evitar pseudo-replicação e limitar custo): uma
réplica por exercício × braço (a primeira em ordem de arquivo — determinístico),
todos os estados casados dela. A escada do especialista é julgada **uma vez** por
(corpus, exercício, estado), não repetida por braço.

**Juiz:** `z-ai/glm-4.5`, mesma justificativa de família da Parte 1.

---

## Parte 3 — o achado que precisa entrar declarado (mecanismo, não suposição)

A divergência de dicas **não é falha dos agentes: é política de produto,
documentada e datada no código de produção espelhado.**

`producao/agents/prompts/agent6-worker-prompt.js:556`:
> "Nivel 4 (bottom_out): Guie ate MUITO PERTO sem revelar o valor final.
> Explicite a operacao final de forma descritiva e acionavel em palavras."

`producao/agents/patterns/quality-gate.js:1353-1357`:
> "(2) NENHUMA pista revela a resposta — decisão do usuário em 2026-08-02. A
> versão anterior isentava a última pista, tratando-a como bottom-out do CTAT
> (o tutor entrega a resposta depois do scaffolding). O produto seguiu o
> caminho oposto: a dica orienta até o fim, e quem conclui o passo é o aluno.
> Portanto fiscalizamos TODOS os níveis, sem exceção de posição."

Ou seja: a plataforma **proíbe por gate** o bottom-out no sentido do CTAT, e a
proibição é anterior a esta análise. A medição da parte 2a serve, então, a duas
leituras que devem ser reportadas juntas:
1. **conformidade da política**: o pipeline cumpre o que promete?
2. **distância ao CTAT**: quanto essa escolha afasta o material do padrão do
   corpus de referência?

Nenhuma métrica de dica pode ser lida como "os agentes erraram" sem essa nota.

---

## Regras gerais desta rodada

- Nenhuma geração nova de grafo. Só julgamento sobre dados já coletados.
- Chaves de API nunca entram no repositório (`.env` continua ignorado).
- Sem PII nas saídas (nenhum `student_id`, `session_id` ou e-mail).
- Execuções longas sob `systemd-run --unit=...`, para sobreviver à sessão.
- Custo estimado antes de cada lote e registrado no log.
- Resultados vão para `resultados/juizo-2026-08-19/`, com o item a item
  preservado para auditoria e para o desempate humano amostral.
