# Avaliação intrínseca — grafos de comportamento dos STIs publicados no EducaOFF (2026-08-14)

**Pergunta**: os STIs criados DIRETO na plataforma (não na bancada) carregam
grafos de comportamento bem construídos? Sem grafo de especialista para esses
STIs, os níveis 1–4 contra referência não se aplicam; esta é a régua
INTRÍNSECA, usando as mesmas peças portadas de produção
(`analysis/avaliacao-plataforma.mjs`; fonte: `shared_tutors.json` da produção,
somente leitura, sha256 em `metricas.json`; PII jamais entra na saída).

**Censo**: 274 tutores publicados, 868 grafos de problema (156 tutores de
matemática). Segmentação por mês de publicação (`sharedAt`).

## Resultado geral e tendência

| Métrica | Geral | abr/2026 | ago/2026 |
|---|---|---|---|
| Grafos executáveis (nível 0) | 98,3% | 99,5% | **100%** |
| Misconceptions por grafo | 7,89 | 7,65 | 8,87 |
| Passos com misconception ESPECÍFICA (régua PR#27, mín. 50%) | 74,5% | 66,1% | **86,2%** (jul: 92,7%) |
| Grafos sem NENHUMA misconception | 11,2% | 17,4% | **0,0%** (jul e ago) |
| Resposta errada aterrada nos dados (isGroundedWrongAnswer) | 68,9% | 71,2% | 63,7% |
| Devolutiva instruindo o professor | 11,7% | 10,4% | **2,7%** |
| Devolutiva revelando a resposta | 6,3% | 5,4% | 8,2% |
| Entrega catálogo→grafo (ids específicos) | 73,6% | 85,7% | 58,6% |

## Leitura

1. **A linha do tempo mostra as correções de produção funcionando**: depois do
   PR #27 (jul/2026), passos com diagnóstico específico saltam de ~66% para
   86–93%, grafos sem misconception desaparecem e a devolutiva ao professor
   despenca para 2,7%.
2. **O produto final é muito mais rico que o estágio graphforge**: ~7,9 erros
   por grafo entregue contra ~1,4 no estágio medido na bancada
   (resultados/comparacao-fluxo-2026-08-14/) — a materialização multiplica a
   riqueza por ~5,6× e entrega a maior parte do catálogo ao grafo.
3. **Pontos de atenção**: devolutivas revelando a resposta (~6–8%, estável);
   aterramento e entrega recuaram em agosto (catálogos crescendo mais rápido
   que a entrega — era da colheita); nota: esta "entrega" (ids do catálogo
   presentes no grafo) é mais frouxa que a métrica de entrega por passo em
   runtime da auditoria de conformidade do EducaOFF — não comparar os números
   diretamente.
4. **Limite declarado**: régua intrínseca não diz se os erros previstos são os
   que alunos reais cometem — ver resultados/validacao-preditiva-2026-08-14/.

Reproduzir: `node analysis/avaliacao-plataforma.mjs --tutores <shared_tutors.json> --json metricas.json`
