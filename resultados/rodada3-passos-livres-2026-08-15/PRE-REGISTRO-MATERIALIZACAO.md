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
