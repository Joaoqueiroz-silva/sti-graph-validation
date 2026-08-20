# Agentes de IA na autoria de tutores inteligentes

Repositório v0.7 de código, registros experimentais e materiais de
reprodutibilidade do artigo **Agentes de IA na autoria de tutores inteligentes**. O
estudo retrospectivo e exploratório pergunta: **qual é a concordância entre as
sequências canonizadas de valores produzidas pelo pipeline e as sequências
extraídas do caminho correto de casos CTAT?** Em termos simples, a análise mede
quanto do caminho de respostas intermediárias reaparece, na ordem esperada,
nos artefatos gerados. Ela não mede equivalência do grafo completo, qualidade
pedagógica ou aprendizagem.

Os artefatos vigentes do manuscrito estão em
[`artigo/artigo1-aits-v0.7-revisado.pdf`](artigo/artigo1-aits-v0.7-revisado.pdf)
e [`artigo/artigo1-aits-v0.7-revisado.docx`](artigo/artigo1-aits-v0.7-revisado.docx).
As versões v0.5 e v0.6 permanecem apenas como histórico. Cada número publicado tem
arquivo de origem: o Apêndice A mapeia as fontes S1 a S33, e a tabela **Onde
está cada afirmação do artigo**, mais abaixo, aponta o caminho de cada uma. A
versão corrigida da análise que ancora o manuscrito é o commit
`f33ea51080c2e2191a191b1484181068f52b5e44`.

**Escala materializada:** 6 conjuntos CTAT · 123 problemas. **Análise
principal:** 5 conjuntos · 105 problemas de referência · 2 configurações ·
3 réplicas · 630 grafos de agente · 0 falhas de coleta · custo marginal das
chamadas ≈ US$ 22. O conjunto 7.12, com 18 problemas, foi materializado e
preservado, mas ficou fora da análise principal.

> [!CAUTION]
> A presença técnica do corpus neste repositório não concede licença para
> reutilizá-lo. A MIT cobre somente o código original. Leia
> [`DATA-LICENSE.md`](DATA-LICENSE.md) e
> [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) antes de copiar ou
> redistribuir qualquer material CTAT/Mathtutor.

---

## Reproduzir em três comandos

Nenhum deles exige chave de API: todas as análises consomem dados já coletados.

```bash
npm ci
npm run verify:offline                            # testes + resultados + hashes + privacidade
node analysis/bancada-v2/consolidar-corpora.mjs   # imprime a tabela-mestra sem alterar arquivos
```

Os comandos de análise são **somente leitura**: não alteram nada no repositório.
Para regravar um arquivo de resultado, use `--escrever`.

**As demais tabelas** saem dos consolidadores, que também rodam sem argumento:

```bash
node analysis/bancada-v2/consolidar-simetrico.mjs  # precisão/F1 1:1, régua congelada x simétrica
node analysis/bancada-v2/consolidar-dicas.mjs      # Tabela 5: comparação de dicas, pool por braço
node scripts/espelhar-producao.mjs --verify        # espelho da produção: 85 arquivos hasheados
```

**As análises por corpus** exigem `--mat <diretório materializado>`. Elas alimentam
os consolidadores acima; use-as para conferir uma célula específica das tabelas:

```bash
DIR=resultados/rodada4-interface-fixa-2026-08-15/materializado-v3-fixa-estudantes-qwen

node analysis/bancada-v2/linha-de-base.mjs       --mat $DIR   # controle, precisão e F1; régua simétrica por padrão
node analysis/bancada-v2/contrafactual-regua.mjs --mat $DIR   # Tabela 3: efeito de cada exclusão da régua
node analysis/bancada-v2/comparar-dicas.mjs      --mat $DIR   # dicas daquele corpus x braço
node analysis/bancada-v2/analisar-materializado.mjs --mat $DIR  # métricas da régua e gates
```

Os diretórios materializados seguem o padrão
`resultados/<rodada>/materializado-v3-fixa-<braço>`, com `<braço>` em
`custo-beneficio` (flash-lite) ou `estudantes-qwen`; no bloco 1 há um nível a
mais para o corpus (`.../bloco1-mathtutor-2026-08-16/6.18/materializado-v3-fixa-...`).
A versão `v3` é a vigente — `v1` e `v2` ficam para a comparação de versão do espelho.

> `analysis/bancada-v2/regua-simetrica.mjs` e `comparar-caminho.mjs` são
> **bibliotecas**, não comandos: contêm a régua que os scripts acima importam.
> Rodá-los diretamente não produz saída.

**Recoletar os grafos do zero** exige `OPENROUTER_API_KEY`, custa dinheiro e
sempre grava em diretório novo. O preflight valida envelopes A/B, JSONs,
referência opcional e saída antes da primeira chamada:

```bash
npm run reproduce:collect -- --plano --problems 1 --replicas 1
npm run reproduce:collect -- --problems 1 --replicas 1 --yes --out /tmp/sti-smoke
```

Para uma cadeia multicorpus portável, defina um destino novo, por exemplo
`STI_RECOLLECT_ROOT=/tmp/sti-recoleta scripts/cadeia-812.sh`. Os scripts não
escrevem sobre os resultados depositados. Uma comparação externa só é feita
quando `--reference-summary <arquivo>` é informado explicitamente.

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
| `artigo/` | Manuscrito em DOCX/PDF e PDF v0.5 preservado como histórico; licença editorial separada da MIT |
| `datasets/` | Seis conjuntos materializados: `expert.brd`, envelope A e envelope B; cinco conjuntos entram na análise principal e 7.12 fica fora dela |
| `resultados/` | Os grafos coletados e as análises, uma pasta por rodada |
| `analysis/bancada-v2/` | A régua de comparação e as análises que geram as tabelas |
| `analysis/validacao-v2/` | A leitura do `.brd` e a carga da referência |
| `producao/` | Espelho byte a byte dos agentes que geraram os grafos, com manifesto SHA-256 |
| `docs/` | Pré-registros, auditoria, guia metodológico e catálogo dos pacotes |
| `__tests__/` | 540 testes: régua, multiplicidade, coerência algébrica, contrafactual R0–R3, invariantes, preflight de recoleta, anti-vazamento e simetria |
| `scripts/` | Coleta, materialização e verificação do espelho |
| `cases/`, `battery/`, `protocol/`, `production-fidelity/`, `config/`, `answer-key/` | Fontes de referência, derivados, fixtures e protocolos; não confundir com resultados nem com código MIT |

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

**Cobertura nunca aparece sozinha.** O controle determinístico "papagaio", que
só repete os números do enunciado, com a mesma quantidade de ocorrências
comparáveis do agente, atinge 10% a 54% de cobertura conforme a célula. Por isso toda
cobertura vem acompanhada de linha de base, cobertura ajustada, precisão ou F1.

**Precisão e cobertura compartilham o mesmo numerador.** O TP é a LCS 1:1;
repetições mantêm multiplicidade, e a cobertura sem ordem é a interseção de
multiconjuntos. Isso impede reutilizar uma única ocorrência para justificar
vários estados da referência.

**As decisões pós-dados estão rotuladas como tais**, e a Tabela 3 mostra o efeito
de cada exclusão da régua sobre o resultado.

**O que ficou sem resposta está dito.** A validade pedagógica dos erros que os
agentes criam a mais não tem veredito: dois juízes cegos reprovaram o gate de
calibração pré-declarado e, pela regra, não houve terceira tentativa.

---

## Licença e proveniência

O código original está sob [`LICENSE`](LICENSE) MIT. Essa licença **não** cobre
automaticamente BRDs, interfaces, enunciados, imagens, gabaritos, derivados,
registros que reproduzam conteúdo externo nem o manuscrito. O estado dos
direitos está em [`DATA-LICENSE.md`](DATA-LICENSE.md), e o inventário de fontes,
restrições e caminhos está em
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md). Nenhum desses avisos cria
uma sublicença para materiais CTAT/Mathtutor.

O pedido bilíngue de autorização explícita está pronto em
[`docs/PEDIDO-AUTORIZACAO-CMU.md`](docs/PEDIDO-AUTORIZACAO-CMU.md). Enquanto não
houver resposta escrita do titular, acesso sem login e presença no histórico
Git não devem ser interpretados como abertura, consentimento ou direito de
redistribuição.

A origem dos pacotes Mathtutor tecnicamente acessíveis está em
[`docs/CATALOGO-PACOTES-MATHTUTOR-2026-08-16.md`](docs/CATALOGO-PACOTES-MATHTUTOR-2026-08-16.md)
e a proveniência do corpus em [`PROVENANCE.md`](PROVENANCE.md).

Material das rodadas exploratórias que o artigo não usa foi removido da árvore em
19 e 20/08/2026 e **permanece integralmente no histórico git** — nenhuma
reescrita de histórico foi feita.

O manifesto da árvore auditada v0.7 é
[`protocol/MANIFEST-v0.7.sha256`](protocol/MANIFEST-v0.7.sha256); `npm run
manifest:verify` exige hashes e cobertura exatos. Os manifestos `v6.0` e `v7.0`
em `protocol/frozen/` são exclusivamente históricos.
