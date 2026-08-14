# Medir a cadeia de produção, e não a bancada reduzida

**Data:** 2026-08-14
**Motivo:** auditoria do coletor, resumida abaixo.

## 1. O achado que motiva este plano

`scripts/reproduce-collect.mjs` faz **uma** chamada de LLM por execução, a um
único agente. A descrição dele no próprio `llm.js`:

> `eval_student_sim` — "modo simplificado (os 3 alunos numa chamada; **só para
> iteração rápida**)"

Confirmação nos dados: 72 execuções, 72 linhas de manifesto, todas com
`agentKey: eval_student_sim`. Nenhuma chamada a domínio, materialização,
revisão ou checagem — os arquivos desses quatro papéis não existem no
repositório do experimento.

**Consequência direta.** Os passos do caminho correto saem dessa mesma chamada
única: pede-se a um modelo que invente, de uma vez, a decomposição do problema
**e** os erros dos alunos. Em produção existe um agente de domínio dedicado à
decomposição, e existe `completeDeterministicStepPlan`, que sintetiza passos
faltantes a partir das componentes de conhecimento — e que o coletor **não
chama**, porque entra por `buildGraphForgeConfig`, que repassa os passos do LLM
1 para 1.

Daí a granularidade de 4,7 a 6,6 passos contra os 9 do especialista. E daí o
colapso dos níveis 2 e 3: não se estava medindo "o sistema erra o passo", e sim
"esta bancada não tem quem decomponha o problema".

**Simetria obrigatória.** A cobertura de 0,89 que sustenta o manuscrito veio da
mesma bancada. Não é legítimo manter o número bom e descartar o ruim: ou a
bancada mede o sistema, ou não mede.

## 2. Desenho em quatro fases

### Fase 1 — instrumentação por etapa

Preservar o grafo **depois de cada agente da cadeia**, conforme
`docs/CONTRATO-RUN-ETAPAS.md`. Sem isso o estudo responde apenas "a produção é
boa"; com isso responde **em qual etapa a qualidade aparece** — e se a revisão
de fato conserta alguma coisa.

### Fase 2 — medição de referência contra o container

Rodar a cadeia importando de dentro do container de produção, pelo caminho que
já existe em `production-fidelity/real-pilot-runner.mjs`.

- **Congelar por hash** todo arquivo de agente carregado de `/app/agents/`,
  gravando os SHA-256 no manifesto da coleta. Sem isso a medição não está
  ancorada em nada: o container muda e o resultado deixa de significar algo.
- **Somente leitura.** Nada de escrever, reiniciar serviço, rodar migração ou
  gravar artefato dentro da produção. As saídas vão para o diretório do
  experimento.
- **Conferir efeitos colaterais de importação antes de rodar.** Módulos de
  produção podem abrir conexão de banco, emitir telemetria ou gravar em disco
  só de serem importados. Ler os imports antes; se houver efeito colateral,
  parar e relatar em vez de contornar.
- Piloto de 1 exercício, custo real medido e extrapolado, autorização explícita,
  aí 24 exercícios × 3 réplicas.

Esta é a medição válida da pergunta "os grafos têm qualidade?".

### Fase 3 — port dos quatro agentes faltantes

Trazer domínio, materialização, revisão e checagem para o repositório, pelas
mesmas regras de `docs/PLANO-PORT-AGENTES-2026-08.md`: byte a byte, adaptador
para os imports, nunca editar o agente.

Os hashes congelados na Fase 2 são o critério de aceitação do port.

### Fase 4 — prova de fidelidade

Demonstrar que a versão portada mede a mesma coisa que a de produção.

## 3. Escada de aceitação da fidelidade

Do mais forte para o mais fraco. Subir o máximo possível; só descer um degrau
quando o de cima for impossível, e registrar por quê.

| Degrau | Evidência | Força |
|---|---|---|
| 1 | SHA-256 de cada arquivo de agente portado bate com o do container | conclusivo |
| 2 | Mesma sequência de chamadas, com `promptSha256` idêntico chamada a chamada | forte |
| 3 | Equivalência estatística das saídas nos seis níveis | fraco |

Com os degraus 1 e 2 satisfeitos, a única diferença restante é a amostragem do
próprio modelo, e o degrau 3 vira formalidade.

### Sobre o degrau 3, uma ressalva que precisa estar escrita

**"O intervalo cruza zero" NÃO é evidência de equivalência.** Ausência de
evidência de diferença não é evidência de ausência de diferença — um teste sem
potência cruza zero por falta de dados, não por semelhança.

Para afirmar equivalência é preciso **declarar antes uma margem** e exigir que o
intervalo pareado caiba inteiro dentro dela (lógica TOST). Margem sugerida, a
ser fixada por escrito antes de olhar qualquer resultado: **±0,02 de cobertura**
e **±0,02 de precisão**.

## 4. Custo

A cadeia completa faz da ordem de 5 a 7 chamadas por execução, contra 1 da
bancada. Para 24 × 3, isso vai de 72 para algo entre 360 e 504 chamadas, com
dois dos papéis em modelo caro no perfil de produção.

Não estimar por analogia: rodar 1 exercício, medir o custo real por etapa,
extrapolar e só então autorizar.

## 5. O que este estudo pode concluir

A hipótese é falsificável e a previsão é específica: se a bancada reduzida
subestimava a produção, **a granularidade tem que subir de ~5 para ~9 passos e o
nível 2 tem que sair da faixa de 0,07 a 0,16**.

- Se subir: a bancada subestimava, e o estudo ganha um resultado forte sobre o
  papel da decomposição de domínio na ancoragem dos erros.
- Se não subir: o defeito é do sistema, não do instrumento, e isso só apareceria
  num piloto com aluno real — tarde demais.

Os dois desfechos são publicáveis. O que não é publicável é continuar sem saber.

## 6. O que continua fora de alcance

Nada disso diz se o erro previsto é pedagogicamente válido, nem se o tutor
ensina. Continuam necessários julgamento humano cego sobre os erros excedentes e
uma banda humano–humano: sem saber o quanto dois especialistas concordam entre
si, nenhum número destes tem escala absoluta de leitura.
