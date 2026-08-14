# Protocolo: validação dos grafos de comportamento SEM referência CTAT

**Data:** 2026-08-14 · **Status:** desenho completo; estudo retrospectivo já
executado (primeiro corte); prospectivo e causal aguardando início formal.

## 1. O que este protocolo valida e por quê

Os STIs criados direto na plataforma EducaOFF não têm grafo de especialista
para comparação. Este protocolo estabelece a validação **a partir dos dados
dos próprios estudantes** — o critério externo mais forte que existe (Brown &
Burton 1978; VanLehn 1990): um catálogo de erros vale pelo que **antecipa** do
comportamento real e pelo que **ensina** quando acerta.

São três estudos complementares, em ordem de força de prova:

| Estudo | Pergunta | Tipo | Status |
|---|---|---|---|
| A — Censo intrínseco | o grafo é bem construído? | observacional, contínuo | RODANDO (`analysis/avaliacao-plataforma.mjs`) |
| B — Validade preditiva | o grafo antecipa erros reais? | retrospectivo feito; PROSPECTIVO pré-registrado a iniciar | protótipo em `analysis/validacao-preditiva-alunos.mjs` |
| C — Ablação randomizada | o grafo faz o aluno aprender? | experimental (causal) | desenho pronto; requer flag no runtime |

## 2. Estudo A — censo intrínseco contínuo

Toda geração publicada passa pela régua computável (mesmas peças de produção
portadas): executabilidade (nível 0), % de passos com misconception ESPECÍFICA
(régua PR#27, mínimo 50%), aterramento da resposta errada nos dados
(`isGroundedWrongAnswer`), template não resolvido, devolutiva (fala com o
aluno / não revela resposta / não instrui professor), escada de dicas e
entrega catálogo→grafo. Saída mensal segmentada por geração — funciona como
carta de controle de qualidade e como quase-experimento das correções de
pipeline (o degrau abr→ago já é visível nos 868 grafos avaliados).

## 3. Estudo B — validade preditiva PROSPECTIVA (o coração do protocolo)

### 3.1 Sequência obrigatória

1. **Pré-registro público** (OSF ou depósito no repositório com hash): braço
   principal (geração vigente), métricas, limiares e análises — ANTES do
   tráfego contar (Nosek et al. 2018).
2. **Congelamento**: sha-256 do `behaviorGraph` de cada tutor publicado no
   instante do pré-registro. Grafo alterado depois = nova versão, avaliada
   separadamente. Prova criptográfica de que a previsão antecede o erro.
3. **Quarentena da colheita** (anti-circularidade): diagnóstico nascido de
   erro real observado (ciclo colheita) recebe marca de origem e NÃO conta
   como antecipação; entra na métrica separada "aprendizado do sistema".
   Requisito de engenharia: a marca `source: "colheita"` no branch (pendência
   aberta no repositório da plataforma).
4. **Coleta passiva**: uso normal da plataforma; nenhuma intervenção.
5. **Análise pré-declarada** ao atingir o n do pré-registro.

### 3.2 Métricas (definições operacionais)

- **Antecipação no passo** = erros reais (com `answer_given` e `node_id`)
  cujo valor canônico casa com um branch de misconception do nó onde o erro
  ocorreu ÷ erros reais avaliáveis. Filtro primário: 1ª tentativa (separa
  misconception sistemática de slip — Norman 1981); todas as tentativas como
  sensibilidade.
- **Utilização** = branches de misconception acionados por ≥1 aluno ÷
  branches previstos (por tutor com ≥5 erros; análogo de precisão).
- **Recuperação** = após cair numa remediação específica, acerto na tentativa
  seguinte ÷ quedas em remediação (liga o B ao C; já mensurável com
  `attempt_number`).
- **Diagnóstico entregue** = erros reais que receberam `misconception_id`
  específico do motor ÷ erros antecipados no grafo (mede a camada de matching
  do runtime — a lacuna 34,6% vs 26,1% já detectada no retrospectivo).

### 3.3 Estatística

Proporções com IC de **Wilson** (1927); agregados com **bootstrap em cluster
duplo** (aluno e tutor; respostas do mesmo aluno/tutor não são independentes),
B = 10.000, semente 42, intervalos BCa (Efron 1987). Comparações entre
gerações de tutores: **diferença pareada por tutor**, nunca sobreposição de
intervalos. Régua de leitura externa: catálogos de especialistas humanos
antecipam historicamente ⅓–½ dos erros observados (VanLehn 1990; Payne &
Squibb 1990) — o retrospectivo de 2026-08-14 mediu 34,6% [n=476].

### 3.4 Ameaças à validade (declaradas)

Circularidade da colheita (mitigada em 3.1.3); slips (3.2); seleção de
tráfego (relatar cobertura por coorte); grafos heterogêneos por geração
(estratificar por `sharedAt` e por hash congelado); mudança de runtime durante
a janela (registrar versão do motor por interação).

## 4. Estudo C — ablação randomizada (efeito causal)

- **Unidade de randomização**: aluno (nunca sessão — evita contaminação).
- **Braço A**: STI íntegro. **Braço B**: mesmos STI, dicas e apoio genérico
  de 3 tentativas/90 s; SEM os desvios específicos de misconception. Ninguém
  fica sem ajuda — compara-se ajuda diagnóstica com ajuda genérica (padrão
  ético da área; efeitos de tutoria: VanLehn 2011).
- **Desfechos pré-declarados**: primário = taxa de recuperação após erro;
  secundários = ganho pré/pós por KC e tempo/tentativas até maestria na
  trajetória BKT (Corbett & Anderson 1995); curvas de aprendizagem por KC
  como validação do modelo cognitivo (tradição DataShop, Koedinger et al.
  2010).
- **Análise**: diferença entre braços com IC por cluster de aluno; poder:
  com a recuperação como unidade (cada erro é uma observação), centenas de
  erros por braço detectam efeitos moderados — semanas de tráfego.
- **Engenharia pendente**: flag de ablação no runtime + registro do braço na
  interação.

## 5. Papel dos juízes LLM neste protocolo

Para qualidade pedagógica dos diagnósticos em escala (sem referência),
aplica-se o protocolo de juiz do repositório (`analysis/bancada-v2/juiz-cego.mjs`):
julgamento CEGO, juiz cross-family do gerador (Panickssery et al. 2024;
prática: Zheng et al. 2023), calibração com itens de especialista misturados e
controles negativos, GATE pré-declarado (aprovar ≥80% do especialista E
rejeitar ≥80% dos distratores — juiz reprovado tem números descartados),
painel duplo com kappa de Cohen e desacordos encaminhados a desempate humano
amostral. Temperatura 0,1; rubrica fixa.

## 6. O que o artigo pode alegar com cada peça

| Peça | Alegação suportada |
|---|---|
| A (censo) | os grafos são bem construídos e a qualidade melhora entre gerações |
| B retrospectivo | antecipação na faixa dos catálogos humanos (com ressalva de circularidade residual) |
| B prospectivo | antecipação SEM circularidade possível — previsão provada anterior ao erro |
| C | o componente diagnóstico CAUSA aprendizagem melhor que apoio genérico |
| Juízes | validade pedagógica dos erros previstos, com calibração verificável |

Referencial completo comentado: `docs/DOSSIE-VALIDACAO-2026-08-14.html` (Parte IX).
