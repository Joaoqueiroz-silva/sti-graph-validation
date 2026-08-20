# Índice dos resultados

Uma pasta por rodada. As do experimento do artigo estão marcadas como
**vigentes**; as demais ficam por serem referência citada ou fixture da suíte de
testes. O ponto de entrada do repositório é o [`README.md`](../README.md) da raiz.

## Vigentes — o experimento do artigo (5 corpora, 105 problemas, 630 grafos)

| Pasta | O que contém |
|---|---|
| [`rodada4-interface-fixa-2026-08-15/`](rodada4-interface-fixa-2026-08-15/) | Corpus 6.17 (24 problemas) **com** a interface do CTAT entregue aos agentes; traz também as comparações pareadas de interface e de versão do espelho |
| [`rodada3-passos-livres-2026-08-15/`](rodada3-passos-livres-2026-08-15/) | O mesmo corpus **sem** a interface — o braço de contraste que mede o efeito dela |
| [`bloco1-mathtutor-2026-08-16/`](bloco1-mathtutor-2026-08-16/) | Corpora 6.18, 6.19, 6.20 e 8.12, um subdiretório por corpus; e `7.12/`, preparado e congelado fora de todas as tabelas |
| [`EXPERIMENTO-CONSOLIDADO-2026-08/`](EXPERIMENTO-CONSOLIDADO-2026-08/) | Os 5 corpora sob a mesma régua: a tabela-mestra e os agregados por braço |
| [`juizo-2026-08-19/`](juizo-2026-08-19/) | Comparação de dicas (régua determinística e juiz cego), reparo de simetria da régua de estados e os incidentes de execução; `reprovados-no-gate/` guarda os juízes que falharam a calibração e `descartado/` o que foi descartado por contaminação |

## Referência e fixtures

| Pasta | Papel |
|---|---|
| [`bancada-v2-2026-08-14/`](bancada-v2-2026-08-14/) | A rodada de juízo anterior, sobre **outro objeto** (grafos crus do estágio 3, um corpus, antes da interface fixa). O artigo a cita apenas como referência, nunca como resultado deste experimento |
| [`avaliacao-plataforma-2026-08-14/`](avaliacao-plataforma-2026-08-14/) · [`validacao-preditiva-2026-08-14/`](validacao-preditiva-2026-08-14/) | Análises de apoio, citadas no histórico metodológico de `docs/GUIA-DO-ARTIGO.md` |
| [`campanha3-2026-07-13/`](campanha3-2026-07-13/) | Fixture lida pela suíte de testes — não é resultado do artigo |

## Como cada pasta de rodada é organizada

Dentro de uma rodada vigente você encontra, por braço (`custo-beneficio` =
flash-lite; `estudantes-qwen`):

| Arquivo | O que é |
|---|---|
| `materializado-v3-fixa-<braço>/runs/*.json` | Um registro por exercício × réplica: o grafo do agente, o traço e a materialização |
| `materializado-v3-fixa-<braço>.analise.json` | As métricas da régua por registro, os gates e os agregados |
| `linha-de-base-v3-fixa-<braço>.json` | Régua simétrica vigente: controle pareado por ocorrências comparáveis, cobertura ajustada, precisão e F1 com TP=LCS 1:1 |
| `contrafactual-v3-fixa-<braço>.json` | Contrafactual vigente: grafos v3 sob R0–R3, com nRef, recall e contenção do caminho |
| `contrafactual-v2-fixa-<braço>.json` | Artefato histórico renomeado sem reprocessamento; a própria chave `dir` comprova a fonte v2 |
| `comparacao-bracos.json` | A diferença pareada qwen − flash-lite, mesmo exercício × réplica |
| `RESULTADOS.md` | A leitura daquele corpus, com custos e gates |
| `PRE-REGISTRO.md` | O que foi decidido **antes** de ver os dados, com as emendas datadas |

`v3` é a versão vigente do espelho de produção; `v1` e `v2` ficam para a
comparação de versão descrita no artigo.

## Material histórico

Rodadas exploratórias que o artigo não usa foram removidas da árvore em 19 e
20/08/2026 e **permanecem no histórico git** — nenhuma reescrita foi feita, e
qualquer commit anterior recupera o conteúdo íntegro.
