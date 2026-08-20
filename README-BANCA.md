# Guia para a banca

Este repositório contém tudo o que o artigo *Agentic Intelligent Tutoring
Systems* afirma: os dados de referência dos tutores CTAT, os 630 grafos gerados
pelos agentes, a régua de comparação em código com testes, os pré-registros
datados com suas emendas, e as análises que produzem cada tabela. Material
histórico de rodadas exploratórias que o artigo não cita foi **removido da
árvore em 19/08/2026 e permanece integralmente no histórico git** — nenhuma
reescrita de histórico foi feita, então qualquer commit anterior recupera tudo.

## Ordem de leitura sugerida

1. **`resultados/EXPERIMENTO-CONSOLIDADO-2026-08/RESULTADOS.md`** (fonte S1) —
   a tabela-mestra: 5 corpora, 105 problemas de especialista, 630 grafos de
   agente, com as métricas e intervalos de confiança.
2. **`docs/AUDITORIA-CIENTIFICA-2026-08-18.md`** (S2) — a auditoria adversarial
   que introduziu linha de base de acaso, precisão e F1, e o contrafactual das
   decisões de régua.
3. **`resultados/juizo-2026-08-19/RESULTADOS.md`** (S24) — a comparação de
   dicas (régua determinística e juiz cego), o reparo de simetria da régua de
   estados, e os incidentes de execução com as barreiras criadas.
4. **Os pré-registros, com emendas datadas:**
   `resultados/rodada4-interface-fixa-2026-08-15/PRE-REGISTRO.md`,
   `resultados/bloco1-mathtutor-2026-08-16/PRE-REGISTRO.md`,
   `docs/PRE-REGISTRO-JUIZ-E-DICAS-2026-08-19.md`.
5. **`docs/GUIA-DO-ARTIGO.md` §§6–14** — o histórico metodológico: cada decisão
   de régua, quando foi tomada, contra qual evidência, e o que ela mudou.

## Mapa do repositório

| Caminho | O que é |
|---|---|
| `datasets/` | Os 5 corpora Mathtutor: `expert.brd` de cada problema e os envelopes A (entrada dos agentes) e B (gabarito, nunca visto pelos agentes) |
| `resultados/rodada4-interface-fixa-2026-08-15/` | Corpus 6.17, 24 problemas — a rodada que introduziu a interface fixa |
| `resultados/rodada3-passos-livres-2026-08-15/` | Corpus 6.17 sem interface — o braço de contraste que mede o efeito da interface |
| `resultados/bloco1-mathtutor-2026-08-16/` | Corpora 6.18, 6.19, 6.20, 8.12 (e 7.12, congelado fora da análise) |
| `resultados/EXPERIMENTO-CONSOLIDADO-2026-08/` | A tabela-mestra que junta os 5 corpora sob a mesma régua |
| `resultados/juizo-2026-08-19/` | Comparação de dicas, juízes cegos, reparo de simetria; `reprovados-no-gate/` guarda os juízes que falharam a calibração |
| `resultados/bancada-v2-2026-08-14/` | O juiz cego da rodada anterior (objeto diferente: grafos crus, um corpus) |
| `producao/` | Espelho byte a byte dos agentes de produção que geraram os grafos, com manifesto SHA-256 e o commit de origem |
| `analysis/` | A régua e as análises em código |
| `__tests__/` | 527 testes que exercitam a régua, os invariantes e os testes de simetria |
| `docs/` | Pré-registros, auditoria, guia metodológico, catálogo dos pacotes |
| `cases/`, `battery/`, `protocol/`, `production-fidelity/` | Fixtures e protocolos da suíte de testes, citados nos pré-registros; **não são resultados do artigo** |

## Como reproduzir cada resultado do artigo

Tudo abaixo roda **sem chave de API** — as análises consomem dados já coletados.

```bash
npm install
node analysis/bancada-v2/consolidar-corpora.mjs     # tabela-mestra (5 corpora)
node analysis/bancada-v2/linha-de-base.mjs          # linha de base, precisão, F1
node analysis/bancada-v2/regua-simetrica.mjs        # reparo de simetria (Tabela 2)
node analysis/bancada-v2/contrafactual-regua.mjs    # efeito de cada exclusão (Tabela 3)
node analysis/bancada-v2/comparar-dicas.mjs         # comparação de dicas (Tabela 5)
node scripts/espelhar-producao.mjs --verify         # confere o espelho da produção
npm test                                            # a suíte inteira
```

Os **1.452 julgamentos do juiz cego de dicas** estão item a item em
`resultados/juizo-2026-08-19/juiz-dicas-z-ai-glm-4-5.json` — auditáveis sem
rodar nada. Reexecutar o julgamento exige chave de API.

## O que saiu da árvore, e por quê

Removidas em 19/08/2026 (commit de organização) por não serem citadas pelo
artigo, não serem lidas por nenhum teste da suíte e não serem necessárias à
reprodução: as campanhas exploratórias de julho (`campanha-2026-07-02`,
`campanha-2026-07-08-multimodelo`, `campanha4-2026-07-15`,
`campanha5-2026-07-19`), as comparações de 14/08 que não entraram no
consolidado (`comparacao-fluxo`, `comparacao-modelos`), a curva de saturação, os
scripts que só serviam a essas rodadas e os 8 testes que validavam exatamente
esses artefatos.

**Permanecem na árvore, apesar de históricos:** `resultados/campanha3-2026-07-13/`
e `analysis/derived/`, porque são **fixtures lidas pela suíte de testes**.

Removido numa segunda passada, em 19/08/2026: **código morto** — 14 scripts que
liam exclusivamente os dados acima e que, sem eles, quebravam na primeira linha
de leitura (análises da campanha 4, verificadores dos manifestos v6/v7, e o
redator de artefatos públicos da campanha 4). Nenhum era exercitado por teste ou
citado por documento.

Nada foi apagado do histórico: `git log --diff-filter=D --name-only` lista o que
saiu, e qualquer commit anterior a este recupera o conteúdo íntegro.

## Terceira passada (19/08/2026): só o experimento

Removidos por não pertencerem a este experimento nem à sua reprodução: os
protocolos e o relatório das campanhas de julho; as versões antigas do
manuscrito (`docs/manuscript/v6.0` e `v7.0`) e o guia de reprodução do v6; o
dossiê e a investigação de kappa daquelas rodadas; as instruções internas de
trabalho e os dois prompts de redação já superados; a bancada de juízes de
10/07; e as pastas `samples/` e `benchmark/`, que nenhum código lê. Os scripts
de raiz `run-judge.mjs`, `models.mjs` e `aggregate-campaign.mjs` saíram com os
seus alvos de `npm run`. O teste `report-consistency` e o seu validador saíram
junto com o relatório que validavam, pelo mesmo critério do bloco 1.

**Nenhuma fonte S1 a S33 foi tocada** — a presença das 33 é verificada a cada
passada. A suíte fica em 49 arquivos e 526 testes.

## Duas observações de proveniência

`scripts/reproduce-collect.mjs` — o script que coletou os 630 grafos — cita em
comentário e num campo de metadados o caminho `resultados/campanha5-2026-07-19/`,
que saiu da árvore. A citação é cosmética (descreve o formato de saída herdado) e
o arquivo foi **deliberadamente não alterado**: ele produziu os dados publicados,
e mantê-lo byte-estável vale mais do que corrigir uma string.

`runs/` guarda os manifestos de execução com custo por chamada, mas **não é
versionado** — quem clonar não o recebe. Os manifestos citados no artigo estão
reproduzidos dentro dos próprios arquivos de resultado.
