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
