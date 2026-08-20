# Protocolo operacional do painel automatizado exploratório v0.8

**Data de congelamento operacional:** 20 de agosto de 2026
**Escopo:** perguntas 4 e 5 do orientador
**Rótulo obrigatório em todo resultado:** **evidência automatizada exploratória; não é validação pedagógica**

Este suplemento operacionaliza a Seção 16 do
[`PROTOCOLO-REANALISE-ORIENTADOR-V0.8-2026-08-20.md`](PROTOCOLO-REANALISE-ORIENTADOR-V0.8-2026-08-20.md).
Ele foi escrito antes de qualquer chamada do novo painel. Não altera resultados
históricos nem converte juízes de linguagem em especialistas, professores ou
alunos humanos.

## 1. Perguntas respondidas — e fronteira da evidência

O painel examina, de modo exploratório:

1. se o feedback de erro e as escadas de dicas parecem específicos,
   progressivos, acionáveis, matematicamente consistentes e sem entrega precoce
   da resposta;
2. se elementos estruturalmente classificados como extras parecem alvos
   intermediários legítimos, erros plausíveis, caminhos alternativos ou ajuda
   contextual — em vez de conteúdo fora de contexto, irrelevante ou contraditório.

O painel **não** mede aprendizagem, usabilidade, adequação a uma turma real,
efeito causal nem concordância com especialistas humanos. Se todos os gates
passarem, a formulação permitida é apenas “segundo o painel automatizado
exploratório”. Se qualquer gate decisivo falhar, não será publicada estimativa
semântica agregada; serão reportadas a falha e a discordância.

## 2. População, unidade e amostra pré-fixada

A população de amostragem são as ocorrências materializadas do experimento
prospectivo: 5 corpora × 3 modelos geradores × 2 políticas de entrada. Os 30
estratos são definidos por `(corpus, modelo gerador, política de entrada)`.

A unidade primária é o **run-cluster** `(estrato, exercício, réplica)`. Dentro
de cada combinação estrato/subtipo entra no máximo uma ocorrência por cluster,
evitando tratar várias mensagens do mesmo grafo como replicações independentes.
As prioridades são o SHA-256 de uma semente pública, estrato, subtipo e ID da
ocorrência; conteúdo, nota e modelo não entram na prioridade.

| subtipo | cota por estrato | máximo nos 30 estratos |
|---|---:|---:|
| feedback de erro | 4 | 120 |
| escada de dicas | 4 | 120 |
| extra de estado | 2 | 60 |
| extra de caminho | 2 | 60 |
| extra de erro | 2 | 60 |
| extra de dica | 2 | 60 |
| **total** | **16** | **480** |

Uma célula com menos ocorrências elegíveis usa todas as disponíveis e conserva
o déficit. Não se transfere cota entre estratos ou subtipos. Essa regra impede
que a escassez de um braço seja escondida por outro. A prevalência de ausência
de feedback, dicas ou extras continua sendo medida no inventário estrutural;
condicionar o painel a itens existentes não transforma ausência em sucesso.

## 3. Extração e tipos

O frame é construído somente a partir da saída de `analisarRegistro`:

- feedback de erro: `atoms.materialized[].errors[].feedback` não vazio;
- escada: sequência não vazia de `atoms.materialized[].hints` em um mesmo estado;
- extras: ocorrências `extrasLedger` com `isExtra=true` e tipo `state`, `edge`,
  `error` ou `hint`.

Não há deduplicação entre réplicas. O alinhamento e a decisão de que algo é
“extra” não são recalculados pelo painel. Assim, a seleção não ganha uma segunda
régua silenciosa.

## 4. Cegamento e ordem

Cada envelope apresenta apenas:

- enunciado, resposta correta e estado local quando disponível;
- o feedback, a escada ou o elemento extra candidato;
- tarefa e subtipo da rubrica.

São removidos origem, braço, modelo, política, réplica, resultado estrutural e
rótulo do controle. Cada envelope recebe ID cego por hash. Os três juízes veem
o mesmo conjunto em ordens próprias, determinísticas e embaralhadas por hash.

## 5. Juízes congelados

| família | modelo congelado | temperatura | saída máxima |
|---|---|---:|---:|
| Anthropic | `anthropic/claude-sonnet-5` | 0,1 | 1.000 tokens |
| Mistral | `mistralai/mistral-large-2512` | 0,1 | 1.000 tokens |
| Meta | `meta-llama/llama-4-maverick` | 0,1 | 1.000 tokens |

As famílias são distintas entre si e das famílias Google/Qwen usadas na
geração e OpenAI usada na materialização. A disponibilidade e os preços devem
ser verificados em preflight imediatamente antes da coleta. Modelo indisponível
não pode ser substituído após olhar resultados: a substituição exige emenda
datada, justificativa e novo congelamento antes da primeira chamada daquele
painel.

Uma falha admite uma nova tentativa **no mesmo modelo**. Troca silenciosa de
modelo é proibida. Item que continuar falhando recebe veredito ausente e
permanece no denominador de validade de formato.

## 6. Rubrica fechada de feedback

Cada dimensão recebe 0, 1 ou 2:

- especificidade ao estado/erro;
- progressão da ajuda;
- acionabilidade do próximo passo;
- correção matemática;
- revelação precoce da resposta (0 = não revela, 1 = apenas no último nível,
  2 = revela cedo).

O juiz também escolhe uma falha primária de lista fechada: `none`, `generic`,
`not_actionable`, `not_progressive`, `mathematical_error`,
`premature_answer` ou `outside_context`. A regra computacional, e não um campo
“aceitar” escrito pelo modelo, aprova apenas quando as três primeiras
dimensões são pelo menos 1, **a correção matemática é 2**, a revelação é no
máximo 1 e a falha é `none`.

## 7. Rubrica fechada de extras

O juiz escolhe exatamente uma categoria:

- alvo intermediário legítimo;
- erro plausível de aluno;
- caminho alternativo válido;
- dica/feedback contextual;
- redundante, mas válido;
- fora de contexto;
- irrelevante;
- contradição;
- resposta correta rotulada como erro.

As cinco primeiras podem ser aceitas, desde que os campos booleanos
`contextual` e `mathematicallyConsistent` também sejam verdadeiros. A regra é
calculada pelo código e qualquer categoria fora da lista invalida o formato.

## 8. Controles cegos e gates

O banco fixo contém 60 itens sintéticos, construídos sobre cinco problemas
elementares e independentes dos braços:

- feedback: 10 positivos e 10 negativos;
- extras: 20 positivos e 20 negativos;
- negativos incluem contradição, conteúdo de outro domínio, resposta correta
  rotulada como erro e transição aleatória;
- positivos incluem devolutiva específica, escada progressiva, estado
  intermediário, caminho, erro sistemático e dica contextual.

Um juiz só entra na consolidação se, **em cada domínio**, atender a todos:

- formato válido em pelo menos 99% dos itens;
- aceitar pelo menos 80% dos controles positivos;
- rejeitar pelo menos 80% dos negativos.

O painel exige no mínimo dois juízes aprovados. Não se escolhe o juiz com a
resposta mais favorável.

## 9. Concordância e decisão

É calculado o alfa nominal de Krippendorff sobre a decisão derivada
aceitar/rejeitar, com ausências tratadas como ausências — não como rejeições.
São reportados alfa geral, por domínio e por subtipo, além de cada juiz e da
maioria. Empate permanece indeterminado.

- alfa ≥ 0,80: confiabilidade automatizada forte;
- 0,667 ≤ alfa < 0,80: evidência automatizada apenas tentativa;
- alfa < 0,667 ou indefinido: nenhuma estimativa semântica agregada.

O gate do painel exige alfa ≥ 0,667 separadamente para feedback e extras. ICs e
comparações posteriores devem reamostrar clusters de exercício/run e preservar
estratos; julgamentos individuais de uma mesma escada não são tratados como
observações independentes.

## 10. Orçamento separado — nenhuma chamada feita

O plano máximo contém 480 itens de estudo + 60 controles = 540 itens por juiz.
Com três juízes:

- 1.620 chamadas primárias;
- no máximo 3.240 tentativas, se toda chamada usar uma retentativa;
- custo esperado de planejamento: aproximadamente **US$ 9,72**;
- reserva conservadora de pior caso: **US$ 48,60**;
- teto máximo separado sugerido, incluindo margem: **US$ 55**.

Esse teto **não** pertence ao orçamento da geração/materialização dos grafos.
Não houve chamada de rede nem paga para produzir este protocolo. A coleta do
painel só poderá começar após autorização explícita do teto, preflight de
modelos/preços, worktree limpa e ledger global fail-closed.

## 11. Dry-run reproduzível

```bash
npm run panel:v08
```

O comando imprime `chamadas de rede: 0 · chamadas pagas: 0`, o tamanho máximo e
o orçamento. Depois de construir offline um `frame.json`, o plano e as ordens
cegas podem ser congelados sem consultar provedor:

```bash
node scripts/painel-automatizado-v08.mjs \
  --frame frame.json \
  --json plano-painel-v08.json
```

O módulo de análise é
[`analysis/orientador-v08/painel-automatizado.mjs`](../analysis/orientador-v08/painel-automatizado.mjs)
e os contratos são cobertos por
[`__tests__/painel-automatizado-v08.test.mjs`](../__tests__/painel-automatizado-v08.test.mjs).
