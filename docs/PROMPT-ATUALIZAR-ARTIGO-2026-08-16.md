# Prompt — atualizar o artigo da bancada CTAT com as rodadas 3–4 (16/08/2026)

Cole o bloco abaixo no Claude (Cowork) com acesso ao repositório
`sti-graph-validation` (commit 44a12b0 ou posterior) e ao manuscrito.

---

Você vai **revisar o manuscrito do Artigo 1** (validação dos grafos de
comportamento gerados por agentes contra o especialista do CTAT, corpus
frac-numberline-6.17) para incorporar as mudanças metodológicas e os resultados
novos das rodadas 3 e 4. Trabalhe **só com o que está no repositório**; não
invente número, IC ou afirmação. Toda cifra que você escrever deve ter uma
fonte primária citada em comentário/nota (arquivo do repo). Se o manuscrito
tiver um número que o repositório hoje contradiz, **corrija e anote a origem
da correção** — não deixe os dois convivendo.

## 0. Leia primeiro (nesta ordem)

1. `docs/GUIA-DO-ARTIGO.md` — §7 e **§8** (o que mudou e por quê).
2. `resultados/rodada4-interface-fixa-2026-08-15/RESULTADOS.md` e `PRE-REGISTRO.md`.
3. `resultados/rodada3-passos-livres-2026-08-15/RESULTADOS.md` (tabela
   corrigida + **adendo "MATERIALIZAÇÃO COMPLETA"**), `DECLARACAO-PRE-REGISTRO.md`,
   `PRE-REGISTRO-MATERIALIZACAO.md` (com adendo).
4. Código que define as métricas (para descrever nos Métodos com precisão):
   `analysis/bancada-v2/comparar-caminho.mjs` (cabeçalho + `casarEstados`,
   `caminhoDeReferencia`, `pontuarCaminho`), `materializar-registro.js`
   (`verificarProblemaFixo`, `materializarRegistro`), `interface-ctat.js`
   (cabeçalho: fontes e lista branca), `analysis/bancada-v2/analisar-materializado.mjs`,
   `analysis/bancada-v2/comparar-rodadas.mjs`.
5. JSONs de resultado: `resultados/rodada4-interface-fixa-2026-08-15/materializado-*.analise.json`,
   `comparacao-r4-vs-r3-*.json`, `caminho-*.json`; os equivalentes em
   `rodada3-passos-livres-2026-08-15/`.
6. `README.md` §"Experimento vigente" (item 1b) e `resultados/LEIA-ME.md`.

## 1. O que mudou na METODOLOGIA (reescrever nos Métodos)

a) **Insumo dos agentes = insumo do especialista.** Envelope A agora contém,
   além de enunciado (literal), resposta correta e KCs, a **interface do CTAT**
   (descrição textual neutra da tela: reta 0–1 ou 0–2, caixas F1/F2 da fração,
   "Number of parts", Done; 7 componentes com id/tipo/papel; parâmetros por
   problema pela lista branca do `massproduction.txt`). Fontes exclusivamente
   da interface compartilhada e do `envelope-a.components`; nunca dicas,
   feedback, contagens ou valores; teste anti-vazamento nos 24 problemas
   (`__tests__/interface-fixa.test.mjs`). Canais de entrada **sem editar
   agente**: `seedProblems[].interface` (agents 3 serializam o problema-semente
   inteiro no prompt) e `state.description` (bloco "REQUISITOS DO PROFESSOR" do
   agent 6). Declarar a glosa interpretativa (papel de cada componente vem da
   tela). Deixar explícito: **mesma informação, modo de autoria diferente**
   (especialista demonstra na tela viva; agentes simulam por texto) — isso é a
   pergunta de pesquisa, não um viés a esconder.

b) **Cadeia completa de produção na bancada**: agents 3a/3b/3c → GraphForge →
   **agent 6 (planner + workers) → agent 7 (reexecuta GraphForge)** — 28 módulos
   espelhados byte a byte, um adaptador no-op; regime "passos-livres" (sem teto
   de passos por perfil). O grafo comparado é o `behaviorGraph` que a
   plataforma entregaria (valores concretos por passo).

c) **Problema fixo com gate objetivo**: requisito "use EXATAMENTE este
   problema" pelo canal de produção; obediência verificada por registro
   (`verificarProblemaFixo`): resposta correta entre os estados + nenhum número
   estranho ao enunciado. Gate **estrito** pré-registrado; **sensibilidade 1**
   (libera 0 e 1 — constantes da reta que o próprio especialista usa; declarada
   antes da análise); **sensibilidade 2** (equivalência canônica: 1,25 ≡ 5/4;
   declarada **depois** de ver os motivos de reprovação da rodada 4 — rotular
   como post hoc). Reportar as três taxas e dizer que as métricas em todos os
   registros ficam a ≤0,01 das dos aprovados.

d) **Régua de estados (instruções do orientador)**: estado = valor da resposta
   correta do passo (canonizado; nunca texto); cobertura de estados =
   **subsequência comum mais longa (LCS)** entre o caminho do especialista e o
   do agente (a versão gulosa anterior sub-contava — declarar a correção);
   **cobertura sem ordem** como métrica secundária; caminho íntegro binário;
   erros no estado certo = mesmo valor errado **ancorado no estado casado**;
   dicas no estado certo = presença por estado (texto nunca comparado); extras
   por tipo; unidade = grafo; BCa 95 % em cluster de exercício; DP entre
   réplicas; diferenças **pareadas** por exercício × réplica.
   **Sentinelas do CTAT** (`-1` do Done, SetVisible vazio) e erros mecânicos
   ficam fora dos estados/erros de valor (mesma regra para os dois lados) —
   declarar.

e) **Réplicas**: 24 exercícios × 3 réplicas; justificar com a decomposição de
   variância (DP entre réplicas 0,005–0,05 na cobertura; a variação está no
   exercício) — `docs/JUSTIFICATIVA-REPLICAS.md`.

## 2. RESULTADOS a inserir/atualizar (números do repositório; conferir nos JSONs)

**Rodada 3 (interface livre) — materializado, gate estrito**: cobertura de
estados em ordem 0,509 (flash-lite, n=37) / 0,635 (qwen, n=42); sem ordem
0,775 / 0,738; erros no estado certo 0,072 / 0,344; caminho íntegro 0; gate
estrito 51,4 % / 58,3 %, sensibilidade 95,8 % / 97,2 %.

**Rodada 4 (interface fixa) — materializado, gate estrito**:
- cobertura em ordem (LCS): **0,519 [0,503; 0,553]** (flash-lite, n=60) /
  **0,700 [0,667; 0,729]** (qwen, n=55);
- sem ordem: **0,839 [0,820; 0,868]** / **0,858 [0,839; 0,894]**;
- erros no estado certo: **0,302 [0,256; 0,343]** / **0,643 [0,559; 0,733]**;
- caminho íntegro em ordem: 0 / 0 (1 grafo em 72 no conjunto completo);
- estados/grafo 5,72 / 6,91 (referência = 6); extras erros/grafo 2,55 / 6,89;
- gate estrito 83,3 % / 76,4 %; sensibilidade 2: 98,6 % / 94,4 %;
- dicas no estado certo = 1,000 nos dois braços — **saturação** (agent 6 põe
  dica em todo passo); reportar como não informativa no materializado;
  informativa só no estágio 3 (0,341 / 0,548).

**Efeito da interface — Δ pareado rodada 4 − rodada 3, 72 pares (materializado)**:
cobertura em ordem **+0,095 [0,042; 0,144]** / **+0,144 [0,090; 0,194]**; sem
ordem **+0,236 [0,153; 0,317]** / **+0,211 [0,150; 0,275]**; erros no estado
certo **+0,249 [0,196; 0,296]** / **+0,383 [0,275; 0,485]**.

**Efeito da materialização — Δ pareado materializado − mínima (rodada 4)**:
cobertura +0,181 [0,102; 0,283] / +0,255 [0,172; 0,336]; erros no estado certo
+0,217 [0,149; 0,278] / +0,580 [0,490; 0,675].

Custos: rodada 4 US$ 3,60 (0,46 + 2,36 alunos; 0,36 + 0,42 materialização).

Mantenha os resultados já existentes da bancada v2 (cobertura justa 0,501,
TOST flash-lite equivalente, precisão julgada 0,65–0,75, kappa 0,66) e da
validade preditiva (34,6 %) — eles não mudaram; só reposicione: a bancada v2
responde "cobre os erros do especialista?", a régua de estados responde
"reproduz a estrutura de estados dele?".

## 3. DISCUSSÃO / LIMITAÇÕES (ajustar o texto)

- Veredito em duas réguas: no **catálogo de erros** o melhor braço é
  equivalente ao especialista; na **estrutura de estados**, com o mesmo insumo,
  84–86 % dos estados presentes, 52–70 % na ordem exata, 30–64 % dos erros no
  estado exato, **nunca o caminho inteiro na ordem exata**.
- O déficit restante é sobretudo de **ordem** (ordem pedagógica × ordem do
  clique do especialista) — decisão do orientador se a ordem é exigível;
  reportar as duas leituras.
- Limitações a declarar: interface entregue por texto (não a tela viva);
  identidade de estado por valor+ordem (sem seleção/componente); especialista
  autorou 1 molde × 24 (mass production) enquanto os agentes autoram cada
  problema; gate sensibilidade 2 é post hoc; "dicas no estado certo" satura no
  materializado; braço qwen custa 5× e gera 2,7× mais erros extras (o juízo dos
  extras é do juiz cego, não desta régua).
- Corrigir onde o manuscrito diga que "estados ≈0" ou "0,13/0,24": esses eram
  do estágio 3 (vocabulário com placeholder / guloso) — hoje: mínima 0,241 /
  0,310 (rodada 3, LCS, sentinelas fora), materializado como acima.

## 4. FIGURAS/TABELAS

- Tabela nova: rodada 3 × rodada 4 (materializado, gate estrito) com as 5
  métricas + Δ pareado (fonte: `comparacao-r4-vs-r3-*.json`).
- Tabela de gates (estrito / sens.1 / sens.2) por rodada e braço.
- Se houver espaço, figura de fluxo "o que entra nos agentes" (envelope A com
  interface → state) e "como autoram" (3a/3b/3c → GraphForge → agent 6/7);
  descrições em `docs/GUIA-DO-ARTIGO.md` §8.

## 5. Regras

- Não altere números de campanhas históricas (v6/v7, C1–C5) nem misture com os
  novos. Não cite `resultados/rodada3-…/materializado-livre-custo-beneficio.descartado-sem-dicas/`
  (lote descartado, arquivado).
- Toda mudança de texto que dependa de um número: cite o arquivo-fonte.
- Ao final, produza um sumário "o que mudou no manuscrito e por quê", seção
  por seção, com a lista de números substituídos (antigo → novo → fonte).
