# Investigação: por que o κ funcional colapsa (agreement 0.485 → κ 0.125) — 2026-07-19

**Trilha C da rodada pós-campanha da branch `feat/experimento-3b-ordenacao-kappa`.**
Dados: 72 runs de hoje (`/root/pr27-qa/campanha-branch/*.json`, 24 clusters × 3 reps) e
baseline da campanha 2026-07-02 (`backend/evaluation/results/campanha-2026-07-02/`).
Código sob análise: `backend/evaluation/functional-equivalence.js` (lido inteiro; cálculo
reproduzido com Node em fixtures — ver §4).

## TL;DR

O κ baixo **não é bug e não é regressão da branch** — é o **paradoxo do κ** (Feinstein &
Cicchetti, 1990) **agravado por um vício estrutural do desenho da bateria**: os "itens" que os
dois avaliadores julgam são a UNIÃO das predições dos próprios avaliadores. Isso torna as
marginais endógenas, infla o acaso esperado (pe médio **0.441**) e torna a célula
surpresa×surpresa **estruturalmente impossível**. Com bateria mediana de **7 itens** (5–12),
o κ vira uma reescala quase determinística do agreement através de um modelo de acaso
inválido. **Recomendação: reportar agreement bruto com IC (já feito) como métrica primária
e, se precisar de correção de acaso, PABAK — nunca κ de Cohen neste desenho.**

## 1. Como a métrica é computada (leitura do código)

`functionalEquivalence(expert, robot, {correctAnswers, excludeMechanical:true})` em
`functional-equivalence.js`, chamada única em `run-ctat-eval.mjs:101` (nunca passa
`opts.battery` externa; `correctAnswers` = 1 resposta do Envelope A):

1. **Bateria** (`buildBattery`): união {resposta correta} ∪ {wrongAnswers do especialista,
   sem mecânicos} ∪ {wrongAnswers do robô}, deduplicada por `canonAnswer`.
   **Nos 72 runs de hoje: n mediano = 7, min 5, max 12.**
2. **Veredito por grafo** (`verdictFor`): misconception tem prioridade → "erro-previsto";
   senão correta → "correto"; senão "surpresa".
3. **agreement** = fração de itens com mesmo veredito; **κ** = Cohen padrão sobre as 3
   categorias, marginais estimadas das linhas do próprio problema (n≈7).

Consequência estrutural do desenho: todo item da bateria vem da predição de pelo menos um
dos grafos, logo:

- item da correta → quase sempre correto/correto (1 acordo "de graça");
- wrongAnswer compartilhada → erro-previsto/erro-previsto;
- wrongAnswer só do especialista → **forçosamente** erro-previsto/surpresa;
- wrongAnswer só do robô → **forçosamente** surpresa/erro-previsto;
- **surpresa/surpresa é impossível** (verificado nas matrizes de confusão: sempre 0).

## 2. Os números (evidência, não hipótese)

| Campanha | agreement médio | κ médio | κ negativos | PABAK |
|---|---|---|---|---|
| **Hoje (branch, 72 runs)** | **0.485** | **0.125** | 24/72 | 0.227 |
| Baseline 2026-07-02 real (72 pares RH) | 0.396 | **0.007** | 38/72 | 0.093 |
| Baseline 2026-07-02 shim | 0.433 | 0.041 | — | 0.150 |

O baseline **nunca agregou** κ no `campaign-summary.json` (só `functionalAgreement`), mas os
per-run reports (`report-eval-real-*.json`, campo `pairs[].functionalKappa`) mostram κ médio
**0.007** — ou seja, **o κ de hoje (0.125) é 18× MAIOR que o da produção**. A branch melhorou
agreement (+0.089) E κ (+0.118). Hipótese (d) — "mudança real de comportamento" — refutada
como causa do colapso: o nível absoluto baixo é herdado, não introduzido.

**Distribuição de κ hoje**: <0: 24 runs; [0,0.2): 24; [0.2,0.4): 15; [0.4,0.6): 5; ≥0.6: 4.
Por cluster, κ é função quase determinística do agreement (nenhum run tem agreement alto com
κ anomalamente baixo — filtro agreement≥0.5 & κ≤0.1 retorna vazio):

| agreement (cluster) | κ (cluster) |
|---|---|
| 0.214 (01watermelon) | −0.265 |
| 0.444 (02watermelon, 04soccer) | 0.086 |
| 0.500 (07pizza, 20birthday) | 0.143 |
| 0.600 (18gum) | 0.290 |
| 0.690 (21mnm) | 0.375 |
| 1.000 (22biscuit) | 1.000 |

Isso é a assinatura de **pe aproximadamente constante**: reconstruindo as marginais de cada
run a partir de `missing`/`extra`/`robotMisconceptions` + 1 correta, **pe médio = 0.441**
(min 0.306, max 0.680). A reconstrução reproduz o κ reportado **exatamente em 46/72 runs**
(os 26 restantes divergem <0.1 por exclusão de erros mecânicos, dedup canônica e múltiplas
formas da correta — composição, não bug). Com pe≈0.44: agreement 0.485 → κ≈0.08;
agreement 0.60 → κ≈0.29. O colapso está integralmente explicado.

**Pooling não salva**: agregando as células reconstruídas dos 72 runs
(correto/correto=72, compartilhadas=162, só-especialista=150, só-robô=121; N=505),
po=0.463, pe=0.438 → **κ pooled = 0.046**. A inflação de pe é estrutural, não é só
instabilidade de n pequeno.

## 3. Mecanismo confirmado (síntese das hipóteses)

- **(a) Paradoxo do κ — CONFIRMADO como mecanismo principal.** "Erro-previsto" domina as
  duas marginais (~60% de cada lado), então pe≈0.44 e o teto prático do κ despenca. Pior:
  as marginais são **endógenas** — cada desacordo cria simultaneamente um "erro-previsto"
  numa marginal e um "surpresa" na outra, e o pe credita acaso na célula
  surpresa×surpresa (termo E·X/n²) que **nunca pode ser realizada como acordo**. O modelo
  de acaso de Cohen pressupõe avaliadores independentes classificando itens amostrados
  independentemente deles; aqui os itens SÃO as predições dos avaliadores. Pressuposto
  violado por construção.
- **(b) n minúsculo — CONFIRMADO como amplificador.** Bateria mediana de 7 itens: κ salta
  em degraus discretos e fica com sd 0.296 entre reps do mesmo cluster.
- **(c) Bug de implementação — DESCARTADO.** `cohenKappa` reproduz exatamente o exemplo de
  livro-texto (κ=0.1304 para po=0.6, pe=0.54), trata o caso degenerado pe≥1 corretamente,
  e a reprodução ponta-a-ponta do run `00bubble_rep1` com o módulo real dá exatamente os
  valores reportados (n=5, agreement=0.6, κ=0.286). A matriz de confusão bate com a teoria
  (célula surpresa×surpresa = 0).
- **(d) Regressão da branch — DESCARTADO.** κ da branch (0.125) > κ do baseline (0.007).

## 4. Como reproduzir (fixtures usadas)

```js
// node, a partir de backend/
import("./evaluation/functional-equivalence.js").then(({functionalEquivalence, cohenKappa}) => {
  // livro-texto: po=0.6, pe=0.54 → κ=0.1304 ✓
  // 00bubble_rep1: expert wrongs {-,−1 mecânicos, -/5, 5/5, 5}, robot {5/5, 5, 4}, correta 1/5
  const expert={misconceptions:[{wrongAnswer:"-",mechanical:true},{wrongAnswer:"-1",mechanical:true},
    {wrongAnswer:"-/5"},{wrongAnswer:"5/5"},{wrongAnswer:"5"}]};
  const robot={misconceptions:[{wrongAnswer:"5/5"},{wrongAnswer:"5"},{wrongAnswer:"4"}]};
  const r=functionalEquivalence(expert,robot,{correctAnswers:["1/5"],excludeMechanical:true});
  // → n=5, agreement=0.6, kappa=0.286 — idêntico ao run real ✓
});
```

## 5. O κ de Cohen é apropriado aqui? Não.

Três razões, todas com número em §2–§3: (i) marginais endógenas (itens = predições dos
avaliadores) violam o modelo de acaso; (ii) célula surpresa×surpresa impossível mas creditada
no pe; (iii) prevalência desbalanceada com n≈7 gera o paradoxo clássico (agreement alto,
κ perto de zero ou negativo). O κ aqui não mede nada que o agreement + a decomposição
missing/extra já não meçam — é uma reescala com denominador inválido.

## 6. Recomendação para o artigo

1. **Métrica primária de equivalência funcional: agreement bruto com IC bootstrap por
   cluster** — exatamente o que `campaign-summary.json` já reporta
   (`functionalAgreement`: baseline 0.396 [0.345, 0.45]; branch 0.485). Nada a re-rodar.
2. **Não reportar κ de Cohen.** Se algum texto anterior o cita, remover/substituir. Nenhuma
   reagregação de campanha é necessária por bug (não há bug); os per-run reports antigos que
   contêm `functionalKappa` simplesmente deixam de ser citados.
3. **Se um revisor exigir correção de acaso**: reportar **PABAK** (Byrt, Bishop & Carley,
   1993) — para 3 categorias, PABAK = (3·po − 1)/2, computável direto do
   `functionalAgreement` já salvo em TODAS as campanhas, sem re-rodar nada:
   baseline 0.093 → branch 0.227. Alternativa: AC1 de Gwet (2008), robusto a prevalência,
   mas exige as linhas por item (os `rows` são retornados por `functionalEquivalence`, então
   dá para recomputar das saídas brutas se necessário). Citar Feinstein & Cicchetti (1990)
   para justificar o abandono do κ.
4. **Complemento interpretável**: reportar a decomposição agregada da bateria
   (hoje: 162 wrongAnswers compartilhadas, 150 só-especialista, 121 só-robô, 72 corretas em
   N=505) — diz MAIS que qualquer coeficiente único: onde os tutores divergem e em que
   direção.
5. **Sem mudança de código de produção nesta trilha** (2026-07-19: implementação verificada
   correta; a decisão é editorial/metodológica, não de engenharia). Se o artigo adotar
   PABAK, o lugar natural é a agregação (`aggregate-campaign.mjs`), em trilha própria.
