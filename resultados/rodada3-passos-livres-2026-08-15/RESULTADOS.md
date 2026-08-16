# Rodada 3 — regime passos-livres e comparação por estado/caminho (2026-08-15)

Pré-registro: [DECLARACAO-PRE-REGISTRO.md](DECLARACAO-PRE-REGISTRO.md).
Fluxo-plataforma (agents 3a/3b/3c de produção byte a byte + GraphForge), 24×3
por braço, **sem o corte de topologia** do GraphForge (`--passos-livres`),
contrato v2 estendido com `grafo.passos[].valor`. Custo: US$ 2,19 (flash-lite
0,39 + qwen 1,80).

> ## ⚠️ Números VIGENTES (correção de 16/08/2026 — ações do TUTOR fora do caminho de referência)
>
> Ver a nota equivalente em `rodada4-interface-fixa-2026-08-15/RESULTADOS.md`
> (regra por `<Actor>` do .brd). Referência do 6.17 passa a ter 4 estados de
> valor (`3 → 5 → 5 → 3/5`). **Rodada 3, materializado, gate estrito (regra
> vigente):** cobertura em ordem 0,689 [0,586; 0,769] (flash-lite, n=37) /
> 0,756 [0,605; 0,858] (qwen, n=42); sem ordem 0,865 / 0,821; caminho íntegro
> 0,162 [0,051; 0,350] / 0,476 [0,286; 0,658]; erros no estado certo 0,079 / 0,348.
> Mínima (72 grafos): cobertura 0,392 / 0,357. As tabelas abaixo mostram a
> regra anterior (rastreabilidade).

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

---

## Adendo (15/08, noite) — MATERIALIZAÇÃO COMPLETA (agent 6 + agent 7 de produção)

Pré-registro: `PRE-REGISTRO-MATERIALIZACAO.md` (+ adendo LCS/sem ordem/sensibilidade).
144 registros reprocessados sem regenerar alunos (72 flash-lite + 72 qwen;
materialização gpt-5.6-luna; US$ 0,34 + 0,38). Análise:
`analysis/bancada-v2/analisar-materializado.mjs` → `materializado-*.analise.json`.

**Gate de problema fixo (obediência do agent 6, provada por registro):**

| Braço | gate ESTRITO (pré-registrado) | gate SENSIBILIDADE (libera 0 e 1) |
|---|---|---|
| flash-lite | 37/72 = 51,4 % | 69/72 = 95,8 % |
| qwen | 42/72 = 58,3 % | 70/72 = 97,2 % |

Leitura: quase todas as reprovações do gate estrito são por `0/d`, `1/d` ou
`1` — constantes da reta 0–1 que o **próprio especialista** usa como estado. O
gate estrito é conservador contra o agente; a sensibilidade mostra que a
obediência real ao problema fixo é ~96–97 % (2–3 registros/braço com número
estranho de verdade).

**Régua de estados no grafo MATERIALIZADO (unidade = grafo; BCa 95 % em
cluster de exercício; Δ = materializado − mínima, pareado por registro):**

| Métrica | flash-lite · estrito (n=37) | flash-lite · sensib. (n=69) | qwen · estrito (n=42) | qwen · sensib. (n=70) |
|---|---|---|---|---|
| **cobertura de estados (LCS)** | **0,509 [0,462; 0,554]** (Δ +0,243 [0,176; 0,360]) | 0,435 [0,398; 0,481] (Δ +0,196) | **0,635 [0,554; 0,692]** (Δ +0,298 [0,170; 0,402]) | 0,562 [0,515; 0,609] (Δ +0,255) |
| cobertura sem ordem | 0,775 [0,683; 0,838] | 0,611 [0,529; 0,699] | 0,738 [0,621; 0,802] | 0,648 [0,581; 0,701] |
| caminho íntegro | 0 | 0 | 0 | 0 |
| **erros no estado certo** | 0,072 [0,028; 0,143] (Δ +0,045 [−0,002; 0,113]) | 0,045 [0,020; 0,086] | **0,344 [0,232; 0,485]** (Δ +0,334 [0,222; 0,469]) | 0,266 [0,194; 0,366] |
| dicas no estado certo | 1,000 (saturada — ver nota) | 1,000 | 1,000 | 1,000 |
| estados/grafo (ref = 6) | 4,68 | 4,80 | 5,31 | 5,43 |
| extras: estados · erros · dicas | 0,51 · 1,95 · 1,62 | 1,14 · 2,62 · 2,19 | 0,43 · 6,62 · 1,50 | 0,89 · 6,77 · 2,06 |
| DP entre réplicas (cobertura) | 0,035 | 0,048 | 0,038 | 0,128 |

**Leitura honesta:**

1. **A materialização é o que dá o valor de estado — e o efeito é grande e
   pareado**: cobertura de estados dobra em relação à mínima (Δ +0,20 a +0,30,
   ICs longe de zero) nos dois braços; qwen chega a **0,63 dos estados do
   especialista na ordem certa** e 0,74 sem ordem.
2. **Erros no estado certo saíram do ≈0**: qwen 0,34 (IC [0,23; 0,48]) — um em
   cada três erros do especialista está previsto **no mesmo estado** pelo
   grafo materializado; flash-lite 0,07. O agent 6 (worker) reancora e
   concretiza as opções erradas; o braço com alunos mais fortes entrega
   catálogo mais rico (6,6 erros extras/grafo) e por isso casa mais.
3. **Dicas no estado certo = 1,000 é SATURAÇÃO, não mérito**: o worker do
   agent 6 escreve dicas por nível em **todos** os passos (16–24 por grafo);
   presença por estado vira trivial. A métrica só é informativa no estágio 3
   (dicas do aluno 3c). Comparar QUALIDADE de dica exigiria juízo de texto —
   fora do escopo (item 7 do orientador).
4. **Caminho íntegro continua 0**: com 4,7–5,4 estados de valor contra 6 do
   especialista, e ordem pedagógica ≠ ordem de clique, nenhum grafo contém o
   caminho inteiro em ordem. Sem ordem, 61–78 % dos estados estão lá.
5. Regra dos 3 réplicas se confirma: DP entre réplicas 0,03–0,05 na cobertura
   (o que varia é o exercício, não a réplica).

Limite estrutural desta rodada: os agentes NÃO receberam a interface do CTAT
(reta, F1/F2, Number of parts, Done) — parte do déficit de estados é isso.
A rodada 4 (`resultados/rodada4-interface-fixa-2026-08-15/`) fecha essa lacuna.
