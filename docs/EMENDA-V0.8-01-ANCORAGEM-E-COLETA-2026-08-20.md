# Emenda v0.8-01 — ancoragem estruturada e coleta prospectiva

**Data:** 20 de agosto de 2026
**Vinculada a:** `PROTOCOLO-REANALISE-ORIENTADOR-V0.8-2026-08-20.md`
**Motivo:** tornar mais conservadoras as regras de componente/ação e fechar o
desenho da coleta prospectiva antes de qualquer chamada paga.

Esta emenda não transforma a reanálise dos 630 registros já conhecidos em
análise confirmatória. Ela continua exploratória. Nenhum registro existente é
alterado.

## 1. Componente do candidato

A Seção 6.1 do protocolo admitia resolver um alvo por identificador único
mencionado na instrução textual. Essa possibilidade foi removida. A v0.8 não
usa descrição, instrução, dica, *thinking* ou outro texto livre para descobrir
o componente de um passo.

O componente do candidato só é aceito quando aparece em um campo estruturado
do próprio `behaviorGraph`, como `targetComponent`, `target`, `cellId` ou outro
campo enumerado e testado. Zero candidatos reconhecidos significa alvo ausente;
mais de um significa alvo ambíguo. Ambos permanecem no denominador conservador.

## 2. Família de ação do candidato

A família de ação nunca é copiada da referência. Ela só é resolvida a partir
de evidência explícita do artefato candidato:

- ação estruturada do nó;
- `actionFamily`/`interactionFamily` declarada;
- `interactionMode`;
- `renderAs`, `inputType` ou componente de uma composição, quando pertencerem
  a um vocabulário fechado e testado.

As famílias fechadas são entrada de texto/número, seleção, marcação de reta e
botão. Evidências conflitantes produzem `unknown`; texto livre não desempata.
A análise reporta separadamente a cobertura dessa resolução. Na régua SAI,
passos sem família explícita não casam e continuam no denominador conservador.

## 3. Saída concreta na condição somente-enunciado

Na coleta prospectiva, o braço `somente-enunciado-v1` recebe apenas o texto do
problema. Os agentes devem calcular e registrar valores concretos a partir
desse texto; não podem depender de `{A}`, `{B}` ou do gabarito para preencher o
estágio bruto. O gabarito e o grafo CTAT só entram depois do término das
chamadas, na avaliação offline.

## 4. Desenho prospectivo

O manifesto executável congela cinco corpora, três modelos, duas políticas de
entrada e dez réplicas por exercício:

`105 exercícios × 3 modelos × 2 políticas × 10 réplicas = 6.300 gerações`.

Cada geração é observada em dois estágios pareados: GraphForge bruto e grafo
materializado. A condição somente-enunciado é a análise principal para a
salvaguarda solicitada pelo orientador; a condição histórica, que contém
resposta/KCs/metadados, é um comparador explícito e nunca será descrita como
cega.

Modelos congelados:

1. `google/gemini-3.1-flash-lite` — braço econômico;
2. `qwen/qwen3-max`;
3. `google/gemini-3.5-flash`.

Parâmetros congelados: temperatura 0,2 para `agent3a_advanced`, 0,7 para
`agent3b_atrisk`, 0,4 para `agent3c_average`, 0,5 para `agent6_story` e 0,35
para `agent6_worker`. Todas as chamadas usam `reasoning: { effort: "none",
exclude: true }` (`STI_SEM_RACIOCINIO=1`), inclusive no Gemini 3.5 Flash. Essa
decisão evita que o raciocínio padrão do provedor varie entre braços ou
infle custo e latência sem aparecer como fator do experimento. O orquestrador
remove overrides herdados de `.env` e reinsere somente esses valores.

Nenhuma chamada paga pode começar sem manifesto determinístico, preflight,
retomada idempotente, modelo sem fallback cruzado, autorização expressa do
autor e teto global em dólares.

## 5. Terminologia arquitetural

O manuscrito pode mencionar “IA unplugged” como formulação usada na reunião,
mas adotará como termo técnico principal **tutoria pré-compilada com execução
desacoplada do modelo**. Isso evita confusão com a literatura que usa “AI
Unplugged” para atividades de ensino de IA sem computador. A propriedade será
demonstrada por teste de execução com rede bloqueada; não será apresentada como
prova de superioridade pedagógica.
