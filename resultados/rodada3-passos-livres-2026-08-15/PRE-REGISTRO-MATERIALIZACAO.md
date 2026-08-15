# Pré-registro — etapa de MATERIALIZAÇÃO da rodada 3 (2026-08-15)

Registrado antes do lote (piloto de 3 registros já feito só para provar
obediência do agent 6: 2 aprovados, 1 reprovado pelo gate — ver abaixo).

**O quê:** reprocessar os 144 registros da rodada 3 (72 flash-lite + 72 qwen,
regime passos-livres) pela materialização de PRODUÇÃO — agent6-story (planner
+ workers) e agent7-adapter (reexecuta o GraphForge sobre o artefato concreto),
byte a byte da plataforma (28 módulos espelhados + 1 adaptador no-op) — SEM
regenerar os alunos (traces em bruto.tracos). Modelo do papel materializacao:
gpt-5.6-luna (perfil custo-beneficio). Fallback dos workers mapeado ao mesmo
papel (nunca troca de modelo).

**Problema fixo:** o requisito "use EXATAMENTE este problema" entra pelo canal
de produção `state.description` (REQUISITOS DO PROFESSOR). Obediência NÃO
presumida: GATE objetivo (`verificarProblemaFixo`): (1) a resposta correta do
CTAT aparece entre os valores dos passos; (2) nenhum número estranho ao
enunciado/resposta nos valores dos passos. Registro reprovado NÃO entra na
comparação de estados; a taxa de reprovação é reportada. Regra conservadora
por design (ex.: "0/5" reprova mesmo sendo o marco inicial da reta).

**Métricas pré-declaradas (só registros APROVADOS no gate; unidade = grafo;
BCa por exercício; DP entre réplicas):** cobertura de estados (subsequência
ordenada), caminho íntegro, erros no estado certo, dicas no estado certo,
extras por tipo — `comparar-caminho.mjs` SEM --materializar (rótulos já são
concretos). Comparação com o estágio 3 (mesmos registros, cru e materialização
mínima) pareada por registro.

**Custo estimado:** ~US$ 3 (planner + worker × 144). Autorização: 2026-08-15
("pode seguir desde que prove de fato e siga todos os parâmetros rígidos").

## Adendo (2026-08-15, tarde — registrado ANTES da análise dos registros materializados; lote em andamento, 17/144)

1. **Casamento exato.** A "subsequência ordenada" passa a ser calculada como
   subsequência comum mais longa (LCS) — a definição declarada; a versão
   anterior era um guloso que sub-contava. Recalculado offline para o estágio
   3 (cru e mínima; ver correção em RESULTADOS.md). Vale igualmente para o
   materializado.
2. **Métrica secundária:** cobertura de estados SEM ordem (estado presente em
   qualquer posição). Reportada ao lado da primária; não a substitui.
3. **Análise de sensibilidade do gate (não substitui o gate primário):** além
   do gate estrito pré-registrado, reportar a mesma análise com o gate que
   libera as constantes do domínio reta numérica 0–1 (números 0 e 1 —
   logo 0/d e 1/d). Motivo objetivo, visto nos primeiros 17 registros: o gate
   estrito reprova grafos por conterem "1/5", "0/4", "1" — estados que o
   PRÓPRIO especialista do CTAT usa (ex.: 03summerBooks tem o estado "1"). O
   gate estrito é conservador contra o agente; a sensibilidade mostra quanto
   isso pesa. Ambas as taxas de aprovação serão reportadas.
