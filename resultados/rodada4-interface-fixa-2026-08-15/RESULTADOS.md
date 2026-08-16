# Rodada 4 — braço "INTERFACE FIXA" — resultados (coleta 15/08, análise 16/08/2026)

Pré-registro: `PRE-REGISTRO.md` (motivo, canais, lista branca, piloto, métricas).
Pergunta: quando os agentes recebem **a mesma interface** que o especialista
(além do mesmo problema, resposta e KCs), o grafo deles se aproxima do grafo
do especialista **estado a estado**?

- 24 exercícios × 3 réplicas × 2 braços (custo-beneficio: flash-lite nos alunos;
  estudantes-qwen), regime passos-livres, materialização de produção
  (agent 6 + agent 7, gpt-5.6-luna) com problema fixo + interface fixa.
- 144 coletados, 144 materializados, 0 falhas. Custo: US$ 0,46 + 2,36 (alunos)
  + 0,36 + 0,42 (materialização) = **US$ 3,60**.
- Análises: `caminho-*.json` (cru/mínima), `materializado-*.analise.json`
  (gates + régua + Δ pareado materializado − mínima),
  `comparacao-r4-vs-r3-*.json` (Δ pareado rodada 4 − rodada 3, mesmo
  exercício × réplica).

## 1. Obediência (gate de problema fixo)

| Braço | estrito (pré-registrado) | sensib. 1 (0/1) | sensib. 2 (+ equivalência canônica, **post hoc**) |
|---|---|---|---|
| flash-lite | 60/72 = 83,3 % | 60/72 | 71/72 = 98,6 % |
| qwen | 55/72 = 76,4 % | 57/72 | 68/72 = 94,4 % |

Motivo das reprovações estritas na rodada 4: quase todas por **decimal igual à
resposta** (`1.25` para 5/4, `0.25` para 1/4, `1.3` para 13/10) ou número
misto (`1 3/7` para 10/7) — a interface (reta 0–2, caixa de número misto)
convida essas grafias; é o mesmo estado escrito de outro jeito, não um problema
inventado. A sensibilidade 2 (canonAnswer: 1,25 ≡ 5/4) foi declarada **depois**
de ver isso, e por isso é rotulada post hoc. Importante: as métricas em
"todos os 72" ficam a ≤0,01 das métricas nos aprovados — **as conclusões não
dependem do gate**.

## 2. Régua de estados — grafo MATERIALIZADO, aprovados no gate estrito

(unidade = grafo; BCa 95 % em cluster de exercício; Δ = materializado − mínima
pareado por registro; DP = entre réplicas)

| Métrica | flash-lite (n=60, 22 ex.) | qwen (n=55, 23 ex.) |
|---|---|---|
| **cobertura de estados, em ordem (LCS)** | **0,519 [0,503; 0,553]** (Δ +0,181 [0,102; 0,283]; DP 0,005) | **0,700 [0,667; 0,729]** (Δ +0,255 [0,172; 0,336]; DP 0,050) |
| **cobertura de estados, sem ordem** | **0,839 [0,820; 0,868]** (Δ +0,292) | **0,858 [0,839; 0,894]** (Δ +0,194) |
| caminho íntegro em ordem (0/1) | 0 | 0 (1/72 no conjunto completo) |
| **erros no estado certo** | **0,302 [0,256; 0,343]** (Δ +0,217 [0,149; 0,278]) | **0,643 [0,559; 0,733]** (Δ +0,580 [0,490; 0,675]) |
| dicas no estado certo | 1,000 (saturada — agent 6 põe dica em todo passo) | 1,000 (idem) |
| estados/grafo (referência = 6) | 5,72 | 6,91 |
| extras/grafo: estados · erros · dicas | 0,68 · 2,55 · 2,60 | 0,87 · 6,89 · 2,71 |

Estágio 3 (mínima, 72 grafos, para referência): cobertura 0,336 / 0,447;
sem ordem 0,542 / 0,655; erros no estado certo 0,081 / 0,076; dicas 0,341 / 0,548.

## 3. Efeito da INTERFACE — Δ pareado rodada 4 − rodada 3 (mesmo exercício × réplica, 72 pares)

| Métrica (grafo materializado) | flash-lite | qwen |
|---|---|---|
| cobertura de estados (LCS) | **+0,095 [0,042; 0,144]** | **+0,144 [0,090; 0,194]** |
| cobertura sem ordem | **+0,236 [0,153; 0,317]** | **+0,211 [0,150; 0,275]** |
| erros no estado certo | **+0,249 [0,196; 0,296]** | **+0,383 [0,275; 0,485]** |
| caminho íntegro | 0 | +0,014 [0; 0,042] |

Mesmo sinal na mínima (estágio 3): cobertura +0,095 / +0,137; erros +0,060 / +0,064.
Nos 32/34 pares aprovados nos dois gates estritos, o Δ de erros no estado certo
segue positivo (+0,190 [0,099; 0,271]; +0,295 [0,129; 0,463]); o Δ de cobertura
em ordem encolhe (+0,016; +0,069) porque esse subconjunto exclui justamente os
exercícios de reta 0–2 onde a interface mais pesa.

## 4. Leitura honesta

1. **A premissa do experimento estava certa: a interface é insumo.** Com ela,
   os agentes decompõem do tamanho do especialista (5,7–6,9 estados vs 6),
   param de inventar estados fora da tela e passam a prever os erros **no
   estado em que o especialista os previu**: qwen 0,64 (IC [0,56; 0,73]) — quase
   dois em cada três; flash-lite 0,30. Isso partiu de ≈0 no estágio 3 e de
   0,34 / 0,07 na rodada 3.
2. **Estados: 84–86 % dos estados de valor do especialista estão no grafo do
   agente** (sem ordem); em ordem, 52 % / 70 %. O que separa as duas leituras
   é a **ordem pedagógica** (o agente ensina denominador → dividir → numerador →
   ponto; o especialista clicou a fração primeiro) — decisão do orientador se
   a ordem do clique é exigível.
3. **Caminho íntegro em ordem continua ≈0** (1 grafo em 144): o teto binário
   "todo o caminho, na mesma ordem" não é atingido, mesmo com a interface. Se a
   ordem for relaxada, 84–86 % dos estados presentes já é o dado.
4. **O braço com alunos mais fortes (qwen) é melhor em tudo** e paga em custo
   (US$ 2,36 vs 0,46) e em erros extras (6,9/grafo, contra 2,6): catálogo maior
   casa mais **e** cria mais material fora da referência — o juízo desses
   extras é o do juiz cego (bancada v2), não desta régua.
5. **Dicas no estado certo saturou (1,0)** em todo grafo materializado: o
   worker do agent 6 escreve dicas por nível em todos os passos. Informativa
   só no estágio 3 (0,34 / 0,55, subiu com a interface). Qualidade de dica
   exigiria juízo de texto, fora do escopo (item 7).
6. **Réplicas**: DP entre réplicas 0,005–0,05 na cobertura — a variação está no
   exercício, não na réplica; 3 réplicas seguem justificadas.
7. **Sem vazamento**: a interface entrou por texto derivado só da tela e da
   lista branca do `massproduction.txt`; teste nos 24 problemas garante que
   nenhum texto de dica/feedback do pacote está no que os agentes veem. O
   especialista continua tendo algo que o agente não tem — a tela viva e a
   experiência de autoria por demonstração —, o que só pode pesar contra o
   agente.

## 5. Veredito curto para o orientador

Com **o mesmo insumo do especialista** (problema + interface, sem o grafo), os
agentes de produção reproduzem **84–86 % dos estados** do especialista (52–70 %
na ordem exata) e preveem **30–64 % dos erros dele no mesmo estado**; nunca o
caminho inteiro na ordem exata. A interface responde por +0,10/+0,14 de
cobertura em ordem, +0,21/+0,24 sem ordem e +0,25/+0,38 de erros no estado
certo, com ICs longe de zero.
