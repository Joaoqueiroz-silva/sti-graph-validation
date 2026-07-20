# Campanha 2026-07-19 — seis braços, uma previsão teórica e o resultado final

Protocolo idêntico à campanha 2026-07-02 (dataset congelado `frac-numberline-6.17`,
24 problemas × 3 réplicas, comparação contra envelopes B do especialista CTAT,
bootstrap por cluster com 10k reamostragens, seed 42). Cada braço mudou UMA coisa
em relação ao anterior; toda mudança de autoria está commitada e a comparação
(`metrics.js`/`schema.js`) permaneceu intocada o dia inteiro.

## Resultados (recall conceitual de misconceptions — métrica primária do pré-registro)

| Braço | recall conceitual | F1 conceitual | estrita | precisão |
|---|---|---|---|---|
| Baseline 2026-07-02 | 0,376* | 0,376 | 0,234 | — |
| 1. Compilador endurecido (PRs #27/#28) | 0,543 | 0,541 | 0,400 | 0,619 |
| 2. Robô sem teto | 0,673 | 0,537 | 0,442 | 0,543 |
| 3. Taxonomia 12 classes (NEGATIVO) | 0,740 | 0,504 | 0,418 | 0,508 |
| 4. + materialização (NEGATIVO) | 0,751 | 0,490 | 0,400 | 0,506 |
| 5. Aterramento de interface v1 | 0,704 | 0,534 | 0,455 | 0,524 |
| **6. FINAL (megabrain)** | **0,913 [0,86–0,96]** | **0,626 [0,61–0,64]** | **0,618 [0,60–0,63]** | **0,548** |

*\* na campanha 2026-07-02 o recall conceitual reportado foi `recallMisconceptionsConceptual`=0,376.*

## O braço final (6) em detalhe

Motivado pela exigência do orientador do projeto de parar de iterar medições e
resolver de uma vez: três análises determinísticas offline PREVIRAM o resultado
antes da medição (artefatos em `previsao-teorica/`):

1. **Reconstrução mass-production**: `massproduction.txt` (TSV transposto, 24
   problemas × 22 variáveis) + template CTAT reconstroem a interface RENDERIZADA
   por problema — marcas da reta com valores canônicos, rótulos, contagens.
   96% das faltas não-mecânicas eram deriváveis desses fatos; 59% eram
   invisíveis ao robô sem a reconstrução.
2. **Passos**: recallSteps 0,51 era um gap determinístico (especialista sempre
   com a mesma estrutura de 8 steps; o robô casava exatamente 3).
3. **"Inversões"**: as 44 faltas rotuladas como inversão eram, na verdade,
   a MARCA VIZINHA da escala em forma reduzida (2/4→1/2) — leitura de escala.

Previsão teórica verificada por agente independente (back-out exato dos 72 runs,
erro 0,000): recall conceitual alcançável 0,992. Medido: **0,913** — o simulador
capturou ~74% do headroom novo; o resíduo é gap de exploração de fatos
disponíveis (fronteira aberta).

## Registro de integridade (o que foi RECUSADO)

- `mfNum`, `badCount`, `doubleDiv`: parâmetros do mass-production que só se
  materializam nas buggy edges do `.brd` do especialista (não são renderizados
  na interface). Um verificador adversarial independente detectou seu uso como
  "fato de interface" = vazamento de gabarito; foram BANIDOS dos fatos e a
  proibição está travada por teste. Consequência: o typo legado `17pencils`
  (mfNum="5/7") fica estruturalmente descoberto — teto honesto 99,2%.
- Passo `done` (constante CTAT `-1`): recusado por ser trivia de protocolo,
  não conhecimento pedagógico (teto honesto de recallSteps 0,66, não 0,83).
- Braços 3 e 4 são resultados NEGATIVOS mantidos no registro: o checklist de
  classes elicia classe-a-classe mas não soma líquido (diluição de atenção),
  e a materialização explícita não move o whole number bias (que era, na
  verdade, dependência de interface).

## Emendas e limitações a declarar no artigo

- A taxonomia (braços 3-4) e a reconstrução (braço 6) são emendas exploratórias
  formuladas após inspeção de faltas do próprio dataset congelado (leakage de
  desenho declarado; classes ancoradas em literatura e fatos derivados apenas
  do que aluno/especialista viam na tela).
- O braço 6 também troca o modelo do simulador (gemini-3.5-flash →
  qwen/qwen3-max, recomendação pré-existente do próprio repositório) — o efeito
  modelo×prompt não está isolado neste braço.
- κ funcional: abandonado como métrica (paradoxo do κ + desenho da bateria;
  ver `docs/INVESTIGACAO-KAPPA-2026-07-19.md`); usar agreement bruto + PABAK.
