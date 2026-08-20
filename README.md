# Validação de grafos de comportamento gerados por agentes de IA

Repositório de dados, código e resultados do artigo **Agentic Intelligent Tutoring
Systems** (v0.5). Ele responde a uma pergunta: **quando agentes de IA recebem o
mesmo problema e a mesma interface que um autor humano do CTAT, quanto do grafo
de comportamento do especialista eles reconstroem?**

O manuscrito é o PDF `artigo1-aits-v0.5.pdf`, em `artigo/`, com as figuras
embutidas. Cada número publicado nele tem arquivo de origem neste repositório: o
Apêndice A do próprio artigo mapeia as fontes S1 a S33, e a tabela **Onde está
cada afirmação do artigo**, mais abaixo, aponta o caminho de cada uma.

**Escala:** 5 corpora públicos do Mathtutor · 105 problemas de especialista ·
630 grafos de agente · 0 falhas de coleta · custo total ≈ US$ 22.

---

## Reproduzir em três comandos

Nenhum deles exige chave de API: todas as análises consomem dados já coletados.

```bash
npm install
npm test                                          # 526 testes: a régua, os invariantes, a simetria
node analysis/bancada-v2/consolidar-corpora.mjs   # a tabela-mestra do artigo
```

Demais tabelas:

```bash
node analysis/bancada-v2/linha-de-base.mjs        # linha de base de acaso, precisão, F1
node analysis/bancada-v2/regua-simetrica.mjs      # o reparo de simetria (Tabela 2)
node analysis/bancada-v2/contrafactual-regua.mjs  # efeito de cada exclusão da régua (Tabela 3)
node analysis/bancada-v2/comparar-dicas.mjs       # comparação de dicas (Tabela 5)
node scripts/espelhar-producao.mjs --verify       # espelho da produção: 85 arquivos hasheados
```

**Recoletar os grafos do zero** (exige `OPENROUTER_API_KEY` e custa dinheiro):
`scripts/reproduce-collect.mjs` e as cadeias em `scripts/cadeia-*.sh`.

---

## Onde está cada afirmação do artigo

| Se você quer conferir… | Comece por |
|---|---|
| os resultados principais, por corpus e agregados | [`resultados/EXPERIMENTO-CONSOLIDADO-2026-08/RESULTADOS.md`](resultados/EXPERIMENTO-CONSOLIDADO-2026-08/RESULTADOS.md) |
| se a metodologia resiste a crítica | [`docs/AUDITORIA-CIENTIFICA-2026-08-18.md`](docs/AUDITORIA-CIENTIFICA-2026-08-18.md) |
| a comparação de dicas e os juízes cegos | [`resultados/juizo-2026-08-19/RESULTADOS.md`](resultados/juizo-2026-08-19/RESULTADOS.md) |
| o que foi decidido **antes** de ver os dados | os pré-registros: [rodada 4](resultados/rodada4-interface-fixa-2026-08-15/PRE-REGISTRO.md) · [bloco 1](resultados/bloco1-mathtutor-2026-08-16/PRE-REGISTRO.md) · [juízo](docs/PRE-REGISTRO-JUIZ-E-DICAS-2026-08-19.md) |
| por que cada decisão de régua foi tomada | [`docs/GUIA-DO-ARTIGO.md`](docs/GUIA-DO-ARTIGO.md) §§6–14 |
| a régua em código, com testes | [`analysis/bancada-v2/comparar-caminho.mjs`](analysis/bancada-v2/comparar-caminho.mjs) + [`analysis/validacao-v2/lib.mjs`](analysis/validacao-v2/lib.mjs) |

---

## Estrutura

| Pasta | O que é |
|---|---|
| `artigo/` | O manuscrito em PDF (versão oficial, com figuras) |
| `datasets/` | Os 5 corpora: `expert.brd` de cada problema, envelope A (o que os agentes veem) e envelope B (o gabarito, que eles nunca veem) |
| `resultados/` | Os grafos coletados e as análises, uma pasta por rodada |
| `analysis/bancada-v2/` | A régua de comparação e as análises que geram as tabelas |
| `analysis/validacao-v2/` | A leitura do `.brd` e a carga da referência |
| `producao/` | Espelho byte a byte dos agentes que geraram os grafos, com manifesto SHA-256 |
| `docs/` | Pré-registros, auditoria, guia metodológico e catálogo dos pacotes |
| `__tests__/` | 526 testes: régua, invariantes, anti-vazamento e simetria |
| `scripts/` | Coleta, materialização e verificação do espelho |
| `cases/`, `battery/`, `protocol/`, `production-fidelity/`, `config/`, `answer-key/` | Fixtures e protocolos da suíte de testes — **não são resultados do artigo** |

### Os módulos na raiz, por papel

Ficam na raiz porque a suíte e as análises os importam por caminho relativo.

| Papel | Módulos |
|---|---|
| **Leitura do CTAT** | `parse-ctat-brd.js` · `ingest-ctat-html.js` · `ctat-json-to-html.js` · `interface-ctat.js` · `interface-input.js` · `interface-inventory.js` · `interface-reconstruction.js` |
| **Contrato e esquema** | `schema.js` · `schema-v2.js` · `neutral-v1-to-v2.js` · `dataset-config.js` |
| **Autoria e montagem do grafo** | `graphforge.js` · `author-graph.js` · `author-from-ctat.js` · `materializar-registro.js` · `materialize-dataset.mjs` |
| **Alunos simulados** | `agents3-students.js` · `simulate-students.js` · `simulate-students-real.js` · `simulate-fluxo-plataforma.js` |
| **Métricas e juízes** | `metrics.js` · `metrics-agent3.mjs` · `stats.js` · `functional-equivalence.js` · `graph-hallucination.js` · `judge-misconceptions.js` · `run-judge-panel.mjs` |
| **Traço e conformidade** | `trace-executor.js` · `trace-answer.js` · `trace-conformance.js` · `step-error-catalog.js` · `misconceptions-db.js` |
| **Infraestrutura** | `llm.js` (chamadas e fallback) · `exec-manifest.js` (custo por chamada e trava de orçamento) · `logger.js` |

### As rodadas em `resultados/`

| Pasta | Papel |
|---|---|
| `rodada4-interface-fixa-2026-08-15/` | Corpus 6.17 **com** a interface do CTAT entregue aos agentes |
| `rodada3-passos-livres-2026-08-15/` | O mesmo corpus **sem** a interface — o contraste que mede o efeito dela |
| `bloco1-mathtutor-2026-08-16/` | Corpora 6.18, 6.19, 6.20, 8.12 (e 7.12, congelado fora da análise) |
| `EXPERIMENTO-CONSOLIDADO-2026-08/` | Os 5 corpora sob a mesma régua: a tabela-mestra |
| `juizo-2026-08-19/` | Dicas, juízes cegos e o reparo de simetria; `reprovados-no-gate/` guarda os juízes que falharam a calibração |
| `bancada-v2-2026-08-14/` | A rodada de juízo anterior, sobre outro objeto — citada no artigo apenas como referência |

---

## Como ler os números com honestidade

Três coisas que o artigo declara e que valem para quem for conferir:

**Cobertura nunca aparece sozinha.** Um grafo "papagaio", que só repete os números
do enunciado, já atinge 12% a 56% de cobertura conforme o corpus. Por isso toda
cobertura vem acompanhada de linha de base, cobertura ajustada, precisão ou F1.

**As decisões pós-dados estão rotuladas como tais**, e a Tabela 3 mostra o efeito
de cada exclusão da régua sobre o resultado.

**O que ficou sem resposta está dito.** A validade pedagógica dos erros que os
agentes criam a mais não tem veredito: dois juízes cegos reprovaram o gate de
calibração pré-declarado e, pela regra, não houve terceira tentativa.

---

## Licença e proveniência

Código sob [`LICENSE`](LICENSE); dados sob [`DATA-LICENSE.md`](DATA-LICENSE.md).
A origem dos pacotes públicos do Mathtutor está em
[`docs/CATALOGO-PACOTES-MATHTUTOR-2026-08-16.md`](docs/CATALOGO-PACOTES-MATHTUTOR-2026-08-16.md)
e a proveniência do corpus em [`PROVENANCE.md`](PROVENANCE.md).

Material das rodadas exploratórias que o artigo não usa foi removido da árvore em
19 e 20/08/2026 e **permanece integralmente no histórico git** — nenhuma
reescrita de histórico foi feita.
