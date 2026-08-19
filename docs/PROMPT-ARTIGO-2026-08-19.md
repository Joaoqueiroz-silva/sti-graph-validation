# Prompt — escrever o artigo com o experimento consolidado (5 corpora)

Cole no Claude (Cowork) com acesso ao repositório `sti-graph-validation`
(commit atual da branch principal). Substitui os prompts anteriores.

---

Você vai **escrever o manuscrito** de um artigo empírico sobre validação
automática de grafos de comportamento gerados por agentes de IA, comparados
com grafos autorados por especialistas humanos no CTAT. Todo o material está no
repositório `sti-graph-validation`. **Regra absoluta: nenhum número sem fonte
primária no repositório.** Não invente, não arredonde para "melhorar", não
suavize limitação. Se um número que você quer usar não estiver nos arquivos,
não use.

## 0. Leia primeiro, nesta ordem

1. `resultados/EXPERIMENTO-CONSOLIDADO-2026-08/RESULTADOS.md` e `LEIA-ME.md` — a tabela-mestra.
2. `docs/AUDITORIA-CIENTIFICA-2026-08-18.md` — **leia inteiro**. Traz achados,
   correções, limitações obrigatórias e o que foi refutado. Este documento
   define o que pode e o que não pode ser afirmado.
3. `docs/GUIA-DO-ARTIGO.md` §§7–14 — o histórico metodológico, em ordem.
4. `docs/CATALOGO-PACOTES-MATHTUTOR-2026-08-16.md` — origem e licença dos corpora.
5. Pré-registros: `resultados/bloco1-mathtutor-2026-08-16/PRE-REGISTRO.md` (com
   todos os adendos datados) e `resultados/rodada4-interface-fixa-2026-08-15/PRE-REGISTRO.md`.
6. RESULTADOS.md de cada corpus: `rodada4-interface-fixa-2026-08-15/` (6.17) e
   `bloco1-mathtutor-2026-08-16/{6.19,6.18,6.20,8.12}/`.
7. Código que define as métricas: `analysis/bancada-v2/comparar-caminho.mjs`,
   `linha-de-base.mjs`, `contrafactual-regua.mjs`, `analisar-materializado.mjs`,
   `consolidar-corpora.mjs`, `analysis/validacao-v2/lib.mjs`,
   `materializar-registro.js`, `interface-ctat.js`, `scripts/espelhar-producao.mjs`.

## 1. O que foi feito (Métodos)

**Objeto.** Um pipeline de agentes de LLM em produção (plataforma EducaOFF)
que autora grafos de comportamento para tutores inteligentes: três agentes
simulam alunos (avançado, em risco, médio), um componente determinístico
(GraphForge) monta o grafo, e dois agentes materializam o exercício concreto
(agent 6 planner+workers, agent 7 que reexecuta o GraphForge).

**Referência.** Tutores públicos do Mathtutor (CMU), autorados por demonstração
no CTAT pela equipe do projeto (Aleven, McLaren & Sewall, IEEE TLT 2009). O
`.brd` de cada problema é o grafo do especialista.

**Desenho.** Para cada problema, o agente recebe o **envelope A** — enunciado
literal, resposta correta, KCs e uma descrição textual neutra da **interface**
(a mesma tela que o especialista tinha) — e nunca o **envelope B** (o grafo do
especialista), que só é lido na comparação. 3 réplicas × 2 braços de modelo nos
alunos simulados (gemini-3.1-flash-lite; qwen3-max), materialização com
gpt-5.6-luna. Agentes espelhados **byte a byte** do commit de produção 5263488,
com hash verificado contra o container em execução.

**Régua de estados.** Estado = valor da resposta canonizada de um passo. Do
caminho do especialista são excluídas, por regras lidas do próprio `.brd`:
ações executadas pelo TUTOR (marca `<Actor>`), sentinelas de interface
(`Done = −1`), seletores de variante do problema e arestas de configuração que
não agem sobre componente da tela. Métricas por grafo: cobertura em ordem
(subsequência comum mais longa), cobertura sem ordem, caminho íntegro (0/1),
erros no estado certo (mesmo valor errado ancorado no mesmo estado), **precisão
de estados**, **F1**, e **linha de base de acaso** (grafo "papagaio" de mesmo
tamanho, feito só com os números do enunciado) com **cobertura ajustada**
(obs−base)/(1−base). Unidade = grafo; ICs por bootstrap com cluster no
exercício; agregação entre corpora por bootstrap estratificado.

**Obediência.** Um gate objetivo verifica se o agent 6 usou o problema do CTAT,
lendo o **enunciado** que ele escreveu: aprovação de **100 % nos 615 grafos**.
Não há recorte — todas as análises usam todos os grafos. Gates alternativos (por
valores dos passos, com quatro níveis de sensibilidade) são reportados como
análise de robustez.

## 2. Corpora e números (fonte: consolidado.json)

**5 tutores, 105 problemas de especialista, 630 grafos de agente**, 0 falhas.

| tutor | tarefa | problemas | estados de ref. | cobertura fl/qwen | íntegro fl/qwen | erros fl/qwen |
|---|---|---|---|---|---|---|
| 6.18 | frações equivalentes (2 retas) | 20 | 3 | 0,961 / 0,989 | 0,883 / 0,967 | N/A |
| 6.17 | marcar fração na reta | 24 | 4 | 0,778 / 0,941 | 0,125 / 0,764 | 0,299 / 0,629 |
| 6.19 | frações e número misto | 23 | 4,3 | 0,725 / 0,728 | 0,145 / 0,072 | 0,442 / 0,693 |
| 6.20 | comparar frações (2 retas) | 19 | 5 | 0,919 / 0,933 | 0,596 / 0,667 | 0,306 / 0,598 |
| 8.12 | tabela razão→porcentagem | 19 | 24 | 0,087 / 0,300 | 0,000 / 0,000 | 0,000 / 0,033 |

Agregado (pool, IC 95 %): flash-lite cobertura 0,702 [0,684; 0,719], caminho
íntegro 0,337 [0,286; 0,387], erros 0,272 (4 corpora); qwen 0,786 [0,771; 0,800],
0,495 [0,444; 0,543], 0,506 (4 corpora).

Linha de base, precisão e F1 por corpus: tabela §B de
`docs/AUDITORIA-CIENTIFICA-2026-08-18.md` — **use-a; não reporte cobertura bruta
sozinha em lugar nenhum do artigo.**

## 3. Os três achados que estruturam a Discussão

1. **A interface é insumo, não detalhe.** Quando o agente recebe a mesma tela
   que o especialista, a concordância salta: Δ pareado (mesmo exercício ×
   réplica) de +0,095/+0,144 em cobertura e +0,249/+0,383 em erros no estado
   certo. Fonte: `rodada4-.../comparacao-r4-vs-r3-*.json`.
2. **A concordância cai com a granularidade da referência.** Medido em cinco
   pontos: 3 estados → 0,99; 4 → 0,94; 4,3 → 0,73; 5 → 0,93; 24 → 0,30. Onde o
   especialista trata cada célula como um passo, os agentes **agregam** (5,1 e
   12,1 passos contra 24). É a fronteira do método, e o resultado mais
   informativo do trabalho.
3. **A régua exige linha de base.** Um grafo "papagaio" atinge 0,12–0,56 de
   cobertura. No 8.12 o braço fraco fica **abaixo dela** (ajustada −0,042). O
   caminho íntegro, ao contrário, tem base ≈0 e é a métrica robusta.

**Correção de afirmação** que você não deve repetir de versões antigas: "o
braço qwen é melhor em tudo" é falso. Vale para 6.17 e 8.12; no 6.19 os ICs
cruzam zero, e pelo **F1** o qwen fica ABAIXO do flash-lite em 6.18 (0,700 vs
0,748) e 6.20 (0,827 vs 0,855) — cobre mais, mas perde precisão. Fonte:
`comparacao-bracos.json` por corpus.

## 4. Limitações OBRIGATÓRIAS (seção própria, sem eufemismo)

1. **Um único autor de referência** (equipe Mathtutor/CMU): não há banda
   humano–humano, logo não se sabe o teto de concordância entre especialistas.
   Nenhuma afirmação do tipo "tão bom quanto um humano" é sustentável.
2. **Quatro decisões pós-dados** definiram o que conta como estado (sentinelas,
   ações do tutor, seletor de variante, configuração). Rotule como post hoc, com
   data, e **publique a tabela contrafactual** (`contrafactual-*.json`): sob a
   régua ingênua, o caminho íntegro é 0,000 em todos os corpora.
3. **A régua mede valor, não pedagogia**: não julga se um estado extra do agente
   é bom (isso exigiria juízo humano ou o juiz cego, outra trilha), nem compara
   componente/ação (nível 3).
4. **Envelope A derivado do próprio `.brd`** (componentes das arestas, KCs das
   regras): não vaza caminho nem erros — verificado —, mas é dependência a declarar.
5. **Multiplicidade**: ~800 ICs calculados, ~40 publicados, sem correção formal.
   Declare os ICs como descritivos; a única hipótese direcional pré-declarada é
   o efeito da interface.
6. **Modo de autoria difere**: o especialista demonstra na tela viva; o agente
   simula por texto. Mesma informação, processo diferente — é a pergunta de
   pesquisa, não um defeito.
7. **Métrica de dicas satura** (1,000 no materializado): não use como evidência.
8. **7.12 Conversion Factors**: corpus preparado e coleta interrompida por
   decisão do autor; **não entra em nenhuma tabela** (ver o LEIA-ME da pasta).

## 5. Estrutura sugerida

Introdução (autoria de STI é gargalo; o que existe hoje) · Trabalhos
relacionados (example-tracing tutors, CTAT, autoria assistida por LLM) ·
Métodos (§1, com a figura do fluxo da comparação) · Resultados (§2 e §3, com a
tabela-mestra, a tabela de linha de base/F1 e o gráfico do gradiente de
granularidade) · Discussão (os três achados; o que a validação sustenta e o que
não) · Limitações (§4) · Reprodutibilidade (código aberto, pré-registros,
dados brutos, hashes) · Conclusão.

## 6. Tom

Sóbrio e verificável. Prefira "reproduz 78 % dos estados do especialista, com
linha de base de 52 %" a "desempenho excelente". Toda tabela cita o arquivo de
origem. Onde a evidência for fraca, diga que é fraca.

Ao final, entregue: o manuscrito e uma **lista de conferência** número-a-número,
com o arquivo de origem de cada valor citado.

---
---

# ATUALIZAÇÃO DE 19/08 (noite) — LEIA ISTO ANTES DE USAR OS NÚMEROS ACIMA

Tudo o que está acima continua válido para **cobertura, ordem e integridade de
caminho**. Três coisas mudam, e uma seção nova entra.

## A. CORREÇÃO OBRIGATÓRIA: precisão e F1 de estados

Os valores de precisão/F1 do texto acima vêm de uma régua com um **defeito de
simetria**, corrigido em 19/08 (commit `75e696a`).

**O defeito:** o `.brd` grava o clique em Done como `"-1"`, que `ehMecanico` já
excluía do lado do especialista; o agente escreve o mesmo clique como
`"ok"`/`"done"`/`"convert"`, e isso entrava no denominador da precisão como
falso positivo garantido — **439 de 4.469 estados, 9,8 %, nos 5 corpora**.

| | régua congelada (não usar) | **régua simétrica (usar)** |
|---|---|---|
| precisão de estados | 0,7173 [0,6977; 0,7362] | **0,8205 [0,8038; 0,8363]** |
| F1 de estados | 0,7081 [0,6932; 0,7228] | **0,7620 [0,7476; 0,7764]** |

**Cobertura (0,7439), linha de base (0,3962), cobertura ajustada (0,5931),
caminho íntegro, erros e dicas no estado certo são IDÊNTICOS nas duas leituras**
— invariante garantido por teste. Nenhum número de cobertura precisa mudar.

Reportar as duas leituras lado a lado, com a nota de que a correção é
**simétrica por teste**: rodada contra o gabarito humano, atinge **0 de 807**
estados. Fonte: `resultados/juizo-2026-08-19/consolidado-simetrico.json`.

## B. SEÇÃO NOVA: dicas (o que o artigo ainda não tinha)

Duas medições independentes, e elas convergem.

**Determinística** (`comparar-dicas.mjs`, 5 corpora, pares de estados casados):

| | especialista | flash-lite | qwen |
|---|---|---|---|
| a última dica entrega o valor do passo | **0,849 [0,842; 0,856]** | 0,019 [0,010; 0,032] | 0,026 [0,016; 0,037] |
| escada completa (orientação → bottom-out) | 0,807 [0,788; 0,825] | 0,019 | 0,025 |
| níveis por passo | 2,97 | 4,00 (sem variância) | 4,00 |

**Juiz cego** (`glm-4.5`, gate APROVADO, 1.452 escadas):

| | especialista | flash-lite | qwen |
|---|---|---|---|
| especificidade (0–3) | 1,96 | 1,97 | 1,97 |
| escalonamento (0–3) | 1,88 | 1,89 | 1,88 |
| acionabilidade (0–3) | **2,81** | 2,09 | 2,13 |
| entrega a resposta | 79 % | 3 % | 10 % |

**A tese da seção:** os agentes escrevem escadas tão específicas e tão bem
escalonadas quanto o autor humano do CTAT — empate nas duas dimensões — e perdem
0,7 ponto em acionabilidade por **uma razão documentada**: a plataforma proíbe
por gate que a dica entregue a resposta (decisão de produto de 02/08/2026,
`producao/agents/patterns/quality-gate.js:1353-1357`). Não é falha do agente; é
divergência deliberada da convenção do CTAT, e o pipeline cumpre a própria
política em 97–98 % dos passos.

**NÃO reportar** a dimensão `correcao` do juiz (83 % vs 92 %): retirada por
contaminação — o juiz penaliza o especialista por julgar passo fora do contexto
da decomposição, e a taxa é 3× maior no corpus mais profundo (8.12: 32 %).

## C. SEÇÃO NOVA: dois achados metodológicos sobre juiz LLM

Publicáveis por si, e provavelmente o que o artigo tem de mais transferível.

**1. Suprimir raciocínio degrada a calibração, e o controle usual não vê.**
Comparação controlada, mesmos 42 itens, mesmo `glm-4.5`: aprovação do gabarito
humano cai de 0,929 para 0,714, enquanto a **rejeição de distratores fica
idêntica em 0,982**. A prática corrente de validar juiz LLM só por "ele rejeita
distratores?" é cega a essa falha. Só o controle POSITIVO — gabarito humano
misturado na pilha, cego — a detecta.

**2. Controle negativo mal construído reprova juiz bom.** No juiz de estados,
usei os `wrongAnswer` do `.brd` como controle negativo, assumindo "valor que o
aluno erra" = "não é alvo de passo". Falso em problema multi-passo: o mesmo
valor é erro num passo e intermediário legítimo noutro. O juiz aceitou 69 % —
corretamente — e o gate o reprovaria por isso.

Os dois juntos: **juiz LLM só é confiável se os dois lados forem medidos, e se
ambos os controles forem válidos.**

## D. LACUNA QUE PERMANECE, e tem de ser declarada sem atenuação

**Os extras de erro (misconceptions) não têm veredito.** Dois juízes,
duas reprovações no gate pré-declarado (`glm-4.5` sem raciocínio: 0,479;
`deepseek-v4-flash`: 0,501; ambos precisavam de 0,80). Pela regra, não há número
— e não houve terceira tentativa. O único juiz calibrado barato (`gpt-5.6-luna`)
**escreve 43,8 % dos erros julgados** (é o agent 6), logo seria auto-avaliação.

Consequência para o texto: a precisão de estados agora é julgada por régua
determinística e auditável, mas a **validade pedagógica dos erros a mais**
continua aberta. Citar a rodada de 14/08 (~50 % dos extras válidos, juiz Luna
calibrado) apenas como **referência de outro objeto** — corpus 6.17, grafos
crus do estágio 3, antes da interface fixa —, nunca como resultado deste
experimento.

## E. Honestidade de execução (vai numa nota, não escondido)

Quatro incidentes, todos detectados antes de publicar, todos com barreira
permanente e teste: juiz resolvendo para o modelo errado sem lançar erro (904
julgamentos descartados, US$ 10,65); fallback silencioso para modelo reprovado;
`ECONNRESET` derrubando lote inteiro; estimativa de custo errada por 4×.
Detalhe em `resultados/juizo-2026-08-19/RESULTADOS.md` §5. O ponto a fazer no
artigo: **eles foram encontrados porque o desenho tem controles**, não por
sorte — e um experimento sem esses controles teria os mesmos erros, invisíveis.
