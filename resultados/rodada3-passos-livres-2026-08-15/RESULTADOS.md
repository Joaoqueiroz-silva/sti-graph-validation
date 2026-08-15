# Rodada 3 — regime passos-livres e comparação por estado/caminho (2026-08-15)

Pré-registro: [DECLARACAO-PRE-REGISTRO.md](DECLARACAO-PRE-REGISTRO.md).
Fluxo-plataforma (agents 3a/3b/3c de produção byte a byte + GraphForge), 24×3
por braço, **sem o corte de topologia** do GraphForge (`--passos-livres`),
contrato v2 estendido com `grafo.passos[].valor`. Custo: US$ 2,19 (flash-lite
0,39 + qwen 1,80).

## Pergunta 1 — sem o teto, os agentes geram mais passos/estados? SIM

| Braço | Passos/grafo LIVRE (DP; máx) | Produção aplicaria | Rodada 2 (produção, medido) | Grafos acima do corte |
|---|---|---|---|---|
| flash-lite | **4,78** (0,45; 5) — 57 grafos com 5 | 3,99 | 3,99 | 57/72 |
| qwen3-max | **5,39** (0,72; 6) — 36 grafos com 6 | 3,97 | 3,97 | 66/72 |

O teto de produção (reader/medium = 4) suprimia ~20% (flash-lite) a ~36%
(qwen) da decomposição dos agentes. Modelo mais forte decompõe mais quando
liberado. Referência do especialista neste corpus: 7 estados avaliáveis.
Erros por grafo também sobem (1,44→1,53 flash-lite; 2,44 qwen).

**Efeito do teto na cobertura de valor (nível 1), pareado com a rodada 2:**
flash-lite Δ +0,003 [−0,032; +0,038]; qwen Δ −0,010 [−0,051; +0,032] — ambos
cruzam zero. Mais passos NÃO mudaram a cobertura de erros por valor: o teto
cortava estados, não erros (os erros ficam ancorados nos passos que sobram).

## Pergunta 2 — métricas por ESTADO/CAMINHO (orientador; `comparar-caminho.mjs`)

| Métrica (unidade = grafo; BCa 95%; DP entre réplicas) | flash-lite cru | flash-lite materializado (mínima) | qwen cru | qwen materializado (mínima) |
|---|---|---|---|---|
| estados do agente com valor comparável | 0/344 | 52,3% | 0/388 | 47,4% |
| **cobertura de estados** (subsequência ordenada, LCS) | 0,002 | 0,206 [0,155; 0,260] (DP 0,088) | 0,000 | **0,266 [0,198; 0,329]** (DP 0,106) |
| cobertura de estados SEM ordem (secundária) | 0,004 | 0,397 [0,292; 0,492] (DP 0,180) | 0,000 | 0,409 [0,308; 0,494] (DP 0,153) |
| caminho de referência íntegro (0/1) | 0 | 0 | 0 | 0 |
| erros no estado certo (binário) | 0 | 0,021 [0,004; 0,045] | 0 | 0,012 [0,004; 0,026] |
| erros por valor (contraste) | 0,148 | — | 0,310 | — |
| dicas no estado certo (presença) | 0 | 0,120 [0,065; 0,194] | 0 | **0,289 [0,193; 0,392]** |
| extras/grafo: estados · erros · dicas | 4,76 · 1,08 · 1,18 | 0,39 · 1,08 · 0,90 | 5,39 · 1,43 · 1,65 | 0,40 · 1,43 · 0,94 |

> **Correção 15/08 (tarde) — casamento exato.** A primeira versão desta tabela
> usava um casamento GULOSO esquerda→direita para a "subsequência ordenada",
> que sub-conta (ex.: referência `[3/5, 1, 3, 5, 5, 3/5]`, agente
> `[5, 5, 3, 3/5, 3/5]`: guloso 2, máximo em ordem 3). O comparador passou a
> calcular a subsequência comum mais longa (LCS, programação dinâmica) — que é
> a definição declarada — e os números acima foram recalculados offline dos
> mesmos registros (guloso: 0,131 / 0,240; exato: 0,206 / 0,266). Foi
> acrescentada a cobertura SEM ordem como métrica secundária: separa "o estado
> falta" de "o estado existe, noutra ordem"; exigir a ordem do especialista é
> decisão metodológica do orientador, e as duas leituras ficam reportadas.
> Travado por teste em `__tests__/comparar-caminho.test.mjs`.

### Leitura honesta

1. **Nos rótulos CRUS a métrica de estados é ≈0 por VOCABULÁRIO, não por
   ausência**: o agent 3a de produção rotula estados com placeholders do
   prompt (`"Denominador = {B}"`); o CTAT identifica estados pela resposta
   concreta (`"5"`). O match binário exato não casa. Verificado no código de
   produção (`agent7-adapter.js`): a própria plataforma NÃO usa o grafo dos
   Agents 3 como matcher de valores — o agent 6 materializa o `expectedAnswer`
   e o agent 7 reexecuta o GraphForge. **A métrica de estados pertence ao
   grafo materializado (produto)**; no estágio 3 ela mede vocabulário.
2. **A materialização MÍNIMA** (extrair o número que o próprio agente escreveu
   no rótulo — nada inventado; regras em `materializarRotulo`) recupera
   ~50% dos rótulos e já mostra o sinal: qwen cobre **26,6%** dos estados do
   especialista na ordem certa (40,9% sem exigir ordem) e tem dica em 28,9%
   dos estados casados; o modelo forte rotula melhor E decompõe mais.
3. **Erros no estado certo ≈0 mesmo materializado**: quando o valor do erro
   casa, ele está ancorado num estado do agente que NÃO casou com o
   especialista (ou o estado do erro do especialista não tem valor concreto no
   agente). É dado real do estágio, não artefato — e é o que a materialização
   completa (agent 6) vai decidir.
4. **Caminho íntegro = 0 em todos**: com 4,8–5,4 estados contra 7 do
   especialista, nenhum grafo contém o caminho inteiro. Decomposição menor é
   real; o teto de produção agravava, mas não explica tudo.
5. **DP entre réplicas** reportado por métrica (0,06–0,22): o flash-lite é
   mais estável nas métricas de estado e mais ruidoso na de valor
   (`docs/JUSTIFICATIVA-REPLICAS.md`).

## O que esta rodada muda no artigo

- O limite de topologia do GraphForge é um achado de instrumentação a declarar
  (produto × experimento) — e o regime livre é braço comparável.
- A métrica de estados do orientador está implementada, testada e pré-declarada;
  sua aplicação válida exige o grafo **materializado**. Próxima etapa: portar
  agent6-story (+agent7) para a bancada e reprocessar ESTES registros (os
  traces dos 3 agentes estão em `bruto.tracos`; só a materialização custa LLM).
- Comparabilidade com a rodada 2 preservada (24×3, mesmos modelos, pareado).

Artefatos: runs (contrato v2 + `topologia`), manifests, `caminho-*.json`
(cru e materializado), `validacao-*.json`, `comparacao-livre-vs-producao-*.json`,
pilotos e logs. Reproduzir: `node analysis/bancada-v2/comparar-caminho.mjs --runs <braço>/runs [--materializar]`.
