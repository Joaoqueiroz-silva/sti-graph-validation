# 6.19 Fractions and Estimates — resultados (16/08/2026)

Corpus: `datasets/frac-estimates-6.19` (23 problemas; Mathtutor/CMU, pacote
"6.19 HTML"; frações próprias e impróprias na reta 0–N, com conversão a número
misto — f1/f2, Convert, m1/m2/m3, numline, Done). Pré-registro e adendo de
interface/piloto: `../PRE-REGISTRO.md`. Desenho idêntico à rodada 4 do 6.17.

- 23 × 3 réplicas × 2 braços = 138 grafos coletados, 138 materializados, 0
  falhas. Custo: US$ 0,45 + 2,20 (alunos) + 0,36 + 0,45 (materialização) =
  **US$ 3,46**.
- Referência do especialista (régua vigente, Actor): 4 estados de valor por
  problema (f1, f2, m1, numline) — 6 nos 4 problemas com número misto (m2, m3);
  2–3 erros não mecânicos por problema (troca numerador/denominador).
- Análises: `caminho-*.json` (cru/mínima), `materializado-*.analise.json`
  (gates + régua + Δ pareado materializado − mínima).

> **Atualização 17/08 (tarde) — versão dos agentes.** Os números desta pasta
> foram recalculados com o espelho re-sincronizado com a PRODUÇÃO (commit
> 132c645; antes b7ae8780): pastas `materializado-v2-*` e análises
> `materializado-v2-*.analise.json`. O efeito de versão é desprezível
> (|Δ| ≤ 0,072, ICs cruzando zero em quase todas as métricas; ver
> `comparacao-versao-v2-vs-v1-*.json` e docs/GUIA-DO-ARTIGO.md §11). O
> consolidado usa a versão de produção; as tabelas abaixo, salvo indicação,
> referem-se à versão anterior e ficam para rastreabilidade.

## 1. Gate de problema fixo — a grafia do número misto

| Braço | estrito | sens. 1 (0/1) | sens. 2 (+ equiv. canônica) | **sens. 3 (+ números mistos)** |
|---|---|---|---|---|
| flash-lite | 5/69 = 7 % | 29/69 = 42 % | 43/69 = 62 % | **63/69 = 91 %** |
| qwen | 10/69 = 14 % | 23/69 = 33 % | 43/69 = 62 % | **64/69 = 93 %** |

O gate estrito reprova quase tudo aqui por motivos que a **interface impõe**:
`0` (parte inteira do número misto — estado `m1=0` do próprio especialista),
decimais iguais à resposta e o número misto escrito como "2 3/4" (que o gate
lia como 23/4). A sensibilidade 3 (declarada ao ver isso; post hoc para o 6.19,
a priori daqui em diante) trata "W N/D" como fração imprópria. Nenhuma
reprovação restante é por problema inventado. Métricas em "todos os 69" ficam
a ≤0,02 das do recorte sens. 3 — **as conclusões não dependem do gate**.

## 2. Régua de estados — grafo MATERIALIZADO, aprovados na sensibilidade 3

(unidade = grafo; BCa 95 % em cluster de exercício; entre parênteses, todos os 69)

| Métrica | flash-lite (n=63, 23 ex.) | qwen (n=64, 23 ex.) |
|---|---|---|
| **cobertura de estados em ordem (LCS)** | **0,730 [0,658; 0,788]** (0,725) | **0,723 [0,671; 0,754]** (0,719) |
| cobertura sem ordem | 0,872 [0,816; 0,918] (0,862) | 0,812 [0,770; 0,854] (0,813) |
| caminho íntegro em ordem | 0,190 [0,092; 0,339] (0,174) | 0,063 [0,016; 0,132] (0,058) |
| **erros no estado certo** | **0,421 [0,324; 0,525]** (0,399) | **0,727 [0,611; 0,815]** (0,708) |
| estados/grafo (ref = 4,35) | 5,35 | 8,25 |
| erros extras/grafo | 3,2 | 11,0 |
| DP entre réplicas (cobertura) | 0,052 | 0,039 |

Estágio 3 (mínima, 69 grafos): cobertura 0,268 / 0,599; erros no estado certo 0,034 / 0,007.

## 3. Leitura honesta (e comparação com o 6.17)

1. **Generaliza no essencial**: cobertura de estados em ordem 0,73/0,72 (6.17:
   0,78/0,94) e erros no estado certo 0,42/0,73 (6.17: 0,29/0,64) — no 6.19 os
   agentes acertam **mais** erros no estado exato que no 6.17.
2. **Caminho íntegro cai** (0,19 / 0,06 vs 0,13 / 0,77 no 6.17): o que falta é
   quase sempre **um** estado — o `m1 = 0` da conversão a número misto para
   frações < 1 (o especialista preenche "0" e "-"; o agente pula a conversão
   ou preenche m2 = "-" antes) — e, no qwen, a decomposição em 8,3 estados com
   ordem diferente. É um estado de convenção de interface, não de matemática.
3. **qwen mais rico e mais barulhento**: 11 erros extras/grafo (flash-lite 3,2)
   — cobre 73 % dos erros do especialista, mas gera muito material fora da
   referência (juízo do juiz cego, não desta régua).
4. Réplicas: DP 0,04–0,05 na cobertura — a variação está no exercício.
5. Sem vazamento: interface descrita só a partir do HTML e do estado inicial do
   `.brd`; teste nos 23 problemas.

## 4. Consolidado (2 corpora, 47 problemas, 282 grafos)

Ver `resultados/EXPERIMENTO-CONSOLIDADO-2026-08/RESULTADOS.md` (regerado):
pool flash-lite — cobertura em ordem 0,756 [0,722; 0,789], erros no estado
certo 0,351 [0,300; 0,404]; pool qwen — 0,836 [0,806; 0,863] e 0,680 [0,616; 0,741].
