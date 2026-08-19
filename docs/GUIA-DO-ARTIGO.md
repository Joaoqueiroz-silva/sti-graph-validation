# Guia do artigo — onde está cada coisa que a escrita vai precisar

**Para quem vai escrever o manuscrito da validação (2026-08-14 em diante).**
Mapa de: seção do artigo → fontes primárias no repositório. O que não está
listado como VIGENTE é histórico preservado (ver `resultados/LEIA-ME.md`).

## 1. Métodos

| Subseção sugerida | Fonte |
|---|---|
| Arquitetura de validade (3 fontes) | `docs/DOSSIE-VALIDACAO-2026-08-14.html` Parte I; `docs/VALIDACAO-QUALIDADE-GRAFOS-V2.md` |
| Instrumentação (port byte a byte, modelos por agente) | `docs/PLANO-PORT-AGENTES-2026-08.md`, `docs/CONFIGURACAO-MODELOS.md`, `producao/COMMIT-FONTE.txt` |
| Registro de execução (o que cada run grava) | `docs/CONTRATO-RUN-V2.md` (+ `docs/CONTRATO-RUN-ETAPAS.md` para a extensão por etapa) |
| Corpus e quarentena A/B | `PROVENANCE.md`, `docs/EXTRACAO-ENUNCIADO-INTERFACE.md` |
| Comparação justa (v2): pareamento, produto, precision@k, TOST | `analysis/bancada-v2/comparar-justo.mjs` (regras pré-declaradas no cabeçalho) |
| Juízes LLM (protocolo, gate, painel) | `analysis/bancada-v2/juiz-cego.mjs`, `analysis/bancada-v2/concordancia-juizes.mjs`; fundamentos no dossiê Parte VI |
| Validação sem CTAT (alunos reais) | `docs/PROTOCOLO-VALIDACAO-ALUNOS-2026-08.md` |
| Fidelidade da cadeia completa (trilha futura) | `docs/PLANO-FIDELIDADE-PRODUCAO-2026-08.md` |
| Estatística (BCa, pareada, TOST, Wilson, kappa) | dossiê Partes III–IV; implementações em `analysis/validacao-v2/lib.mjs` e `analysis/bancada-v2/` |

## 2. Resultados — números primários e onde recomputá-los

| Resultado | Valor | Fonte primária |
|---|---|---|
| Réplica da C5 (validação do instrumento) | 7/7 ICs sobrepostos | `resultados/comparacao-modelos-2026-08-14/log-campanha5-final.txt` |
| Efeito do modelo (bancada, pareado) | qwen +0,275; turbo +0,362 | `.../comparacao-cobertura.json` |
| Efeito do fluxo (estágio × produto) | −0,481, perde 24/24 | `resultados/comparacao-fluxo-2026-08-14/comparacao-efeito-fluxo-cobertura.json` |
| Cobertura JUSTA (valor+posição) | qwen 0,501 [0,432; 0,555] | `resultados/bancada-v2-2026-08-14/r1-campanha5-final.json` |
| Equivalência TOST flash-lite × especialista | Δ −0,038 IC90 [−0,073; −0,007] | `resultados/bancada-v2-2026-08-14/r1-custo-beneficio.json` |
| Precisão julgada | 0,75 / 0,68 / 0,65 | `resultados/bancada-v2-2026-08-14/juiz-r1-*.json` + `RESULTADOS.md` (adendo) |
| Kappa entre juízes | 0,656 (705 itens) | `.../juiz*-r1-*.json` via `concordancia-juizes.mjs` |
| Censo da plataforma (868 grafos) | tabela + linha do tempo | `resultados/avaliacao-plataforma-2026-08-14/metricas.json` + `RESULTADOS.md` |
| Antecipação de erros reais | 34,6% (n=476; 1ª tent. 33,5%) | `resultados/validacao-preditiva-2026-08-14/metricas.json` |
| Utilização de branches | 23,7% (34 tutores) | idem |
| Custos por braço/chamada | manifestos | `resultados/*/manifests/*.jsonl` |

Comandos de recomputação estão no fim de cada `RESULTADOS.md`.

## 3. Figuras prontas

O dossiê (`docs/DOSSIE-VALIDACAO-2026-08-14.html`) contém as 7 figuras
(arquitetura, quarentena, injustiças→antídotos, leitura do TOST, apostas,
jornada das réguas, desenho causal) em SVG tema-claro/escuro — copiáveis para
o manuscrito.

## 4. Limitações e pendências a declarar no artigo

1. Banda humano–humano ausente (teto de leitura) — desenho: 2º especialista
   em ~5 exercícios.
2. Desempate humano dos ~17% de desacordos entre juízes (lista item a item
   nos `juiz*-r1-*.json`).
3. Estudo B prospectivo e Estudo C (ablação) ainda não executados — protocolo
   completo em `docs/PROTOCOLO-VALIDACAO-ALUNOS-2026-08.md`.
4. Fluxo-plataforma medido no estágio graphforge (pré-materialização);
   cadeia completa é a trilha do `docs/PLANO-FIDELIDADE-PRODUCAO-2026-08.md`.
5. Lacuna de matching do runtime (34,6% antecipado vs 26,1% diagnosticado) —
   investigação aberta no repositório da plataforma.

## 5. Histórico: como citá-lo sem confundir

Os manuscritos v6.0/v7.0 e as campanhas 1–5 são o desenvolvimento do
instrumento. No artigo novo, entram em DOIS papéis: (a) a réplica da C5 como
validação do instrumento; (b) a contradição C4×C5 como o problema que a
rodada 2 resolveu (estágio × produto). Nunca combinar estimativas entre
campanhas de instrumentos diferentes.

## 6. Adendo 2026-08-14 — limites de topologia do GraphForge e o regime "passos-livres"

**Achado de instrumentação (verificado no código de produção, `graphforge.js`
commit b7ae8780):** o GraphForge corta a espinha dorsal do grafo pela tabela
`TOPOLOGY` do perfil — `reader/medium` (o default do corpus) = **4 passos**
(mín 2, máx 7 em *hard*); `advanced` até 10; teto absoluto 12 mesmo com pedido
explícito do professor. O corte vive em `extractGraphForgeConfig`
(`resolveGraphForgeStepPlan`); o `graphForge(config)` em si NÃO limita passos.
Misconceptions por passo não têm teto (só o fallback do master graph, 2).

**Consequência para a leitura dos resultados:** a granularidade "4,0 passos do
agente × 9,0 do especialista" nos braços do fluxo-plataforma é o corte de
topologia, não incapacidade de decomposição dos agentes — é uma decisão de
produto (adequação à faixa etária). A bancada v2 já neutraliza o efeito pelo
pareamento por posição relativa; e isso deve ser dito explicitamente em
Métodos e Discussão.

**Decisão do pesquisador (14/08):** o experimento precisa medir quantos passos e
estados os agentes geram DE FATO. Implementado o regime **passos-livres** no
harness do fluxo-plataforma (`--passos-livres` ou `STI_PASSOS_LIVRES=1`): o
config do forge recebe TODOS os passos do trace representativo do agente 3a
(mesma regra de escolha de produção), sem corte de topologia; forge de produção
segue byte a byte intocado (ele não limita); erros e dicas realinhados por
passo. Cada registro grava `topologia.regime` ("producao"|"livre"),
`passosGeradosPeloAgente` e `passosQueProducaoAplicaria` — o efeito do teto
vira braço comparável (produção × livre), medido em vez de assumido. Testes:
`__tests__/fluxo-plataforma.test.mjs` (mesmo trace de 7 passos → 4 em
produção, 7 em livre). Braço sugerido para a próxima campanha:
`--fluxo plataforma --passos-livres` nos mesmos 24×3, comparado pareado com o
braço de produção da rodada 2.

## 7. Adendo 2026-08-15 — métrica de ESTADOS: por que o estágio graphforge não basta (verificado no código de produção)

Rodada 3 mostrou cobertura de estados ≈0 nos rótulos crus e 0,13 com
materialização mínima (flash-lite). Verificado em `backend/agents/nodes/agent7-adapter.js`
(produção, b7ae8780): a plataforma NÃO usa o grafo dos Agents 3 como matcher
de valores — o agent 6 (materialização, LLM) produz o `expectedAnswer`
concreto de cada passo e o agent 7 REEXECUTA o GraphForge sobre esse artefato
(`buildConcreteGraphWithGraphForge`; docstring: "o grafo genérico dos Agents 3
… não pode ser o matcher operacional de valores que só existem depois da
materialização"). Conclusão: a métrica de estados do orientador é aplicável ao
grafo materializado (produto), e medi-la no estágio 3 mede vocabulário.
Caminho: portar agent6-story (+agent7) para a bancada — trilha do
`docs/PLANO-FIDELIDADE-PRODUCAO-2026-08.md` — e reprocessar os registros da
rodada 3 (os traces dos 3 agentes estão preservados em `bruto.tracos`, então a
materialização pode rodar sem regenerar os alunos).

## 8. Adendo 2026-08-16 — materialização portada e braço "interface fixa" (rodada 4)

Feito o que o §7 pedia: agent6-story + agent7-adapter portados byte a byte
(28 módulos espelhados; `materializar-registro.js`, `scripts/materializar-lote.mjs`),
problema fixo pelo canal de produção (`state.description` → REQUISITOS DO
PROFESSOR) com **gate objetivo** de obediência (`verificarProblemaFixo`, estrito
pré-registrado + duas sensibilidades declaradas). Régua de estados corrigida:
subsequência ordenada **exata (LCS)** em vez de gulosa; cobertura **sem ordem**
como secundária; sentinelas do CTAT (`-1` do Done, SetVisible vazio) fora dos
estados de valor — mesma regra dos erros mecânicos.

Descoberta metodológica: até a rodada 3 os agentes NÃO recebiam a interface do
CTAT (só enunciado/resposta/KCs). Como o especialista autorou por demonstração
NA tela, parte dos estados dele nasce da interface. A rodada 4
(`resultados/rodada4-interface-fixa-2026-08-15/`) entrega a interface por texto
neutro (`interface-ctat.js`: tela + lista branca do `massproduction.txt` +
`envelope-a.components`; teste anti-vazamento nos 24 problemas) pelos canais
que os agentes de produção já leem (`seedProblems[].interface` → agents 3;
`description` → agent 6). Resultado (materializado, gate estrito): cobertura de
estados em ordem 0,52 / 0,70, sem ordem 0,84 / 0,86, erros no estado certo
0,30 / 0,64; Δ pareado da interface +0,10/+0,14 (ordem), +0,24/+0,21 (sem
ordem), +0,25/+0,38 (erros no estado certo). Caminho íntegro em ordem segue ≈0.
Para o artigo: (i) declarar que "mesmo insumo" = problema + interface, e que o
modo de autoria (demonstração × simulação) é a pergunta; (ii) reportar ordem e
sem ordem; (iii) dicas no estado certo satura no materializado (agent 6 põe
dica em todo passo) — informativa só no estágio 3.

## 9. Adendo 2026-08-16 — corpora públicos do Mathtutor e experimento CONSOLIDADO

- **Fonte dos tutores**: Mathtutor (CMU/TutorShop), `https://mathtutor.web.cmu.edu/`
  — 54 tutores example-tracing / 710 grafos públicos, mesma origem do 6.17;
  catálogo com perfil por pacote em `docs/CATALOGO-PACOTES-MATHTUTOR-2026-08-16.md`
  (+ `.json`). Autoria: equipe Mathtutor/CTAT (Aleven, McLaren, Sewall — IEEE
  TLT 2009), por demonstração no CTAT; sem autor individual nos arquivos.
- **Régua corrigida (Actor)**: o `.brd` marca quem executa cada aresta;
  ações do tutor (`showAnswer`, `SetVisible`, `set_maximum`, `setDisplay`…)
  saem do caminho de referência. 6.17 → 4 estados de valor. Rodadas 3–4
  recalculadas (notas "Números VIGENTES" nos RESULTADOS.md); rodada 4 vigente:
  cobertura em ordem 0,77 / 0,93; caminho íntegro 0,10 / 0,75; erros no estado
  certo 0,30 / 0,65.
- **Multi-corpus**: `STI_DATASET=<nome>`; `datasets/<nome>/corpus.json`;
  `dataset-config.js`; interface por tipo em `interface-ctat.js`;
  `problems/<id>/interface-params.json` (estado inicial da tela lido do `.brd`).
- **Bloco 1** (`resultados/bloco1-mathtutor-2026-08-16/`, `PRE-REGISTRO.md`):
  6.19 → 6.18 → 6.20 → 8.12 → 7.12, cada um com adendo de interface + piloto.
- **Consolidado**: `resultados/EXPERIMENTO-CONSOLIDADO-2026-08/` (tabela por
  corpus × braço + agregado por braço com bootstrap estratificado por corpus),
  regerado por `analysis/bancada-v2/consolidar-corpora.mjs`. É a tabela-mestra
  do artigo: o 6.17 (rodada 4) e os novos corpora sob a mesma régua.

## 10. Adendo 2026-08-17 — produção mudou (release "caderno"): o que a bancada ainda mede

Verificado contra o **container em produção** (`sti-backend`, imagem de
17/08 03:07 = release `/root/releases/sti-unplugged-caderno-1629ef4`, commit
fac32bc, 10 commits após b7ae8780): 25 dos 38 módulos espelhados são
byte-idênticos; 13 diferem — todos da MATERIALIZAÇÃO (agent6-story,
agent7-adapter, agent6-worker-prompt, quality-gate, component-sets,
behavior-graph-semantics, response-modality-planner, component-registry…),
introduzidos pelo modo "caderno/worksheet". **agents3-students, graphforge,
misconceptions-db e diagnostics são idênticos** — os alunos simulados e o grafo
genérico não mudaram.

Teste de equivalência offline (`__tests__/equivalencia-producao-caderno.test.mjs`,
LLM mockado, registros do piloto 6.19, modo padrão — não worksheet):
- planner do agent 6: system e user prompts **idênticos**;
- worker do agent 6: user prompt idêntico; **system prompt diferente** — a
  produção acrescentou o bloco "CATÁLOGO DE COMPONENTES — CONSTRAINTS RÍGIDOS"
  (~70 linhas: fraction_bar, number_line… com regras de expectedAnswer/props,
  exemplos ✓/✗) também fora do modo caderno;
- agent 7 + quality gate (determinísticos): **mesmo grafo** dado o mesmo
  retorno do LLM.

Consequência: a bancada mede a versão b7ae8780 dos agentes de forma
consistente em todos os corpora; a produção atual difere só na etapa
"worker do agent 6" (formato/props de componentes ricos), com efeito
provável pequeno sobre valores de estado (pode reduzir decimais → gate
estrito melhora). Caminho recomendado se o artigo deve descrever a versão
atual: re-espelhar em fac32bc (13 módulos + fecho: agents/notebook,
evaluation/notebook-emitter-model, 5 componentes, zod ^4) e **re-materializar
os mesmos registros** (alunos idênticos → sem nova coleta): ~US$ 1,6 para os
282 grafos atuais, comparação pareada versão-antiga × versão-nova como
"efeito de versão". Decisão do autor.

## 11. Adendo 2026-08-17 (tarde) — espelho RE-SINCRONIZADO com a produção e efeito de versão

**O espelho agora é a produção atual.** `scripts/espelhar-producao.mjs` calcula o
fecho de imports estáticos a partir do repositório de produção, copia byte a
byte (nunca edita agente), grava `producao/COMMIT-FONTE.txt` e
`producao/ESPELHO.sha256`, e `--verify --fonte <repo>` confere hash a hash.
Espelho vigente: **47 módulos do commit 132c645** (release "caderno"), com **0
diferenças contra o container `sti-backend` em execução**. Dois módulos
OPCIONAIS que o agent 6 carrega por import dinâmico em produção — guarda de
payload e sanitizer de consistência — passaram a integrar o espelho (antes o
agente rodava sem eles na bancada, com aviso no log); `component-router` fica
fora por ser exclusivo do modo caderno. zod atualizado para ^4 (como produção).

**Efeito de versão, medido e não presumido.** Os 282 registros já coletados
foram **re-materializados** com a versão de produção (alunos e GraphForge são
idênticos entre as versões, logo não houve nova coleta): US$ 1,63, 0 falhas.
Δ pareado (versão nova − antiga, mesmo exercício × réplica, grafo materializado):

| Corpus · braço | cobertura em ordem | sem ordem | caminho íntegro | erros no estado certo |
|---|---|---|---|---|
| 6.17 · flash-lite | +0,003 [0,000; 0,010] | −0,007 [−0,042; 0,000] | +0,014 [0,000; 0,042] | −0,015 [−0,048; 0,010] |
| 6.17 · qwen | −0,003 [−0,021; 0,003] | 0,000 | −0,028 [−0,111; −0,014] | +0,005 [−0,038; 0,033] |
| 6.19 · flash-lite | −0,018 [−0,047; −0,004] | −0,007 [−0,036; 0,014] | −0,072 [−0,188; −0,014] | −0,002 [−0,065; 0,068] |
| 6.19 · qwen | +0,011 [−0,006; 0,034] | +0,030 [−0,013; 0,074] | +0,029 [−0,029; 0,101] | −0,017 [−0,082; 0,041] |

Todos os |Δ| ≤ 0,072, a maioria com IC cruzando zero: **a mudança de versão dos
agentes não altera as conclusões**. O gate estrito melhora um pouco na versão
nova no 6.17 (60→64 e 55→60 de 72 aprovados), coerente com o worker novo
preferindo frações a decimais. Fontes: `comparacao-versao-v2-vs-v1-*.json`.

**Consolidado**: passa a usar as materializações da versão de produção
(`materializado-v2-*`), com as da versão anterior preservadas para a
comparação. Para o artigo: descrever a versão 132c645 como a medida, citando o
Δ de versão como análise de robustez.

## 12. Adendo 2026-08-18 — 6.18 concluído e a régua de erros ganha duas exclusões

**6.18 Equivalent Fractions** (20 problemas, 120 grafos, US$ 3,29, agentes da
produção 132c645): cobertura de estados em ordem **0,953 / 1,000** e **caminho
íntegro 0,860 / 1,000** (flash-lite / qwen) — o melhor resultado estrutural do
experimento. Gate estrito 88 % / 68 %; sens. 3 95 % / 92 %.

**Duas exclusões declaradas na métrica "erros no estado certo"** (aplicadas a
todos os corpora e recalculadas):
1. *não ancorável* — a aresta de erro sai de estado fora do caminho de
   referência (no 6.18, do ramo de variante não seguido): 30/50 no 6.18, 0 nos
   demais. Antes eram ancorados no primeiro estado e só podiam falhar;
2. *indistinguível por valor* — o `wrongAnswer` do especialista é a própria
   resposta correta daquele estado (erro de COMPONENTE/ORDEM: "marcar a fração
   certa na Linha 1 em vez da Linha 2"): 20/20 dos ancoráveis no 6.18, 0/110 no
   6.17, 0/54 no 6.19. Quando todos caem, a métrica é **N/A**, nunca 0.

Para o artigo: declarar que a régua de erros pressupõe erro com valor diferente
da resposta; corpora cujo especialista modela erros de componente exigiriam uma
régua com seleção/ação (nível 3), fora do escopo. O consolidado reporta N/A e
exclui esses corpora do pool dessa métrica (as demais métricas seguem inteiras).

**Consolidado, 3 corpora (67 problemas de especialista, 379 grafos analisados):**
pool flash-lite — cobertura em ordem 0,809 [0,786; 0,831], sem ordem 0,937,
caminho íntegro 0,342, erros no estado certo 0,337 (2 corpora);
pool qwen — 0,891 [0,873; 0,909], 0,949, 0,608, 0,476 (2 corpora).


## 13. Adendo 2026-08-18 (noite) — 6.20 concluído; bloco 1 com 4 corpora

**6.20 Fraction Ordering** (19 problemas, 114 grafos, US$ 3,43, produção
132c645): cobertura em ordem **0,926 / 0,946**, caminho íntegro **0,632 / 0,731**,
erros no estado certo **0,297 / 0,619**; gate estrito 98 % / 88 %. Aqui cobertura
com e sem ordem coincidem — a tarefa impõe a sequência. Primeiro corpus com um
estado de valor **textual** (alternativa do seletor): casou em 45/57 no qwen, e
parte das falhas é escolha errada da alternativa (erro real de conteúdo),
mostrando que estados textuais são avaliáveis quando as alternativas estão na
tela e entram na descrição da interface.

Dois pontos de método fixados neste corpus:
- **campos de enunciado declaráveis por corpus** (`campos-enunciado.json`): no
  6.20 os dados do problema estão em `var1`/`var2`/`question`, não em
  `statement`; sem eles o enunciado é insolúvel. Default (statement/statement2)
  inalterado para 6.17/6.18/6.19;
- **execução como serviço transitório do systemd**: as cadeias longas passaram
  a rodar fora da sessão (duas cadeias haviam sido interrompidas ao fim da
  sessão, com perda de runs e recoleta).

**Consolidado — 4 corpora, 86 problemas de especialista, 488 grafos analisados:**

| braço | cobertura em ordem | sem ordem | caminho íntegro | erros no estado certo |
|---|---|---|---|---|
| flash-lite | 0,836 [0,816; 0,855] | 0,934 | 0,408 [0,348; 0,469] | 0,325 (3 corpora) |
| qwen | 0,903 [0,887; 0,919] | 0,949 | 0,634 [0,573; 0,695] | 0,659 (3 corpora) |

Heterogeneidade entre corpora (amplitude): cobertura 0,712–0,953 (flash-lite) e
0,742–1,000 (qwen); caminho íntegro 0,108–0,860 e 0,098–1,000 — a variação é
explicada pelo grau em que a interface impõe a sequência (6.18/6.20 alto,
6.19 baixo por causa da conversão a número misto).

## 14. Adendo 2026-08-19 — BLOCO 1 FECHADO (5 corpora) e auditoria incorporada

**Estado do experimento.** 5 corpora públicos do Mathtutor (6.17, 6.19, 6.18,
6.20, 8.12), **105 problemas de especialista**, **615 grafos de agente**
coletados e materializados com os agentes espelhados da produção **5263488**,
0 falhas. Custo total do bloco ≈ US$ 22.

**Números para o artigo** (grafo materializado; todos os grafos — o gate por
enunciado aprova 100 %; BCa 95 % em cluster de exercício):

| braço | cobertura em ordem | sem ordem | caminho íntegro | erros no estado certo |
|---|---|---|---|---|
| flash-lite | 0,702 [0,684; 0,719] | 0,820 | 0,337 [0,286; 0,387] | 0,272 (4 corpora) |
| qwen | 0,786 [0,771; 0,800] | 0,895 | 0,495 [0,444; 0,543] | 0,562 (4 corpora) |

**Mas a leitura primária mudou** (auditoria de 18/08): a cobertura é recall puro
e um grafo "papagaio" atinge 0,12–0,56 dela. As colunas obrigatórias passam a
ser **cobertura ajustada** ((obs−base)/(1−base)) e **F1** (com precisão) — ver
`docs/AUDITORIA-CIENTIFICA-2026-08-18.md` §B, que traz a tabela completa por
corpus. Fatos que só aparecem com elas: (i) no 8.12 o flash-lite fica **abaixo
do papagaio** (ajustada −0,042); (ii) pelo F1, o qwen fica **abaixo** do
flash-lite em 6.18 e 6.20, porque paga cobertura com precisão.

**Estrutura da tese empírica, em três níveis:**
1. *Insumo* — dar ao agente o mesmo que o especialista teve (problema +
   interface) é o que produz o salto: Δ pareado +0,10/+0,14 em cobertura,
   +0,25/+0,38 em erros no estado certo (rodada 4 vs 3).
2. *Granularidade da referência* — a concordância cai monotonicamente com o
   número de estados do especialista: 3–5 estados (6.18, 6.20) → cobertura
   0,92–0,99 e caminho íntegro 0,60–0,97; 24 estados (8.12) → 0,09–0,30 e
   caminho íntegro 0. É a fronteira do método.
3. *Modelo dos alunos simulados* — o braço mais forte cobre mais e acerta mais
   erros no estado certo, ao custo de precisão; o balanço depende do corpus.

**Seções obrigatórias de método/limitação** (todas com fonte no repositório):
linha de base e F1; tabela contrafactual da régua (`contrafactual-*.json`);
rótulo post hoc datado das quatro redefinições do denominador; gate por
enunciado × por valores; envelope A derivado do `.brd`; ausência de banda
humano–humano; multiplicidade descritiva; `maxTokens` do adaptador.
