# Rodada 2 — efeito do FLUXO da plataforma no grafo autorado (2026-08-14)

**Pergunta pré-registrada** ([DECLARACAO-PRE-REGISTRO.md](DECLARACAO-PRE-REGISTRO.md)):
a bancada de 1 chamada da rodada 1 mede o mesmo que o fluxo que a plataforma
usa? Coletor `--fluxo plataforma`: agents 3a/3b/3c DE PRODUÇÃO (byte a byte,
fan-out do 3b, stepDiagnostics, catálogo) + `extractGraphForgeConfig` +
`graphForge` de produção. 24×3 por braço; contrato v2; 216 chamadas/braço.
Custo total: US$ 2,19. Gate do piloto: descarte por template = **0/280 no
total** (nenhuma injustiça de bancada detectada).

## Resultados (nível 1, conjunto comum, pareado por exercício)

| Comparação pré-registrada | Δ cobertura (BCa 95%; comparador corrigido, 72 réplicas) | Veredito |
|---|---|---|
| **PRIMÁRIA**: custo-beneficio FLUXO vs custo-beneficio 1-chamada (mesmo modelo) | **−0,481 [−0,563; −0,407]**, perde 24/24 | o fluxo real, no estágio graphforge, carrega MUITO menos erros que a bancada |
| Secundária: estudantes-qwen vs custo-beneficio (ambos no fluxo) | **+0,138 [+0,075; +0,200]**, vence 18/24 | o efeito do modelo TRANSPORTA para o fluxo real |

| Braço (fluxo-plataforma) | Cobertura | Precisão | 2b ±20% | Granularidade | Devolutiva menciona valor | Erros/grafo | Custo |
|---|---|---|---|---|---|---|---|
| custo-beneficio (flash-lite) | 0,132 | 0,257 | 53,3% | 2,26× | 6,7% | 1,44 | US$ 0,39 |
| estudantes-qwen | 0,270 | 0,446 | 63,6% | 2,27× | 27,8% | 2,44 | US$ 1,80 |

## Leitura

1. **O −0,447 explica a contradição C4×C5**: o braço fluxo-plataforma reproduz
   quase exatamente o padrão da Campanha 4 (cobertura 0,13~0,20, granularidade
   ~2,3×, devolutiva ~7%), que rodou o pipeline real; a bancada de 1 chamada
   (saturação) inflava para 0,90. As campanhas antigas mediam ESTÁGIOS
   diferentes — agora com prova pareada.
2. **O gargalo é o estágio, não o agente**: o 3b põe a riqueza no catálogo
   stepDiagnostics (~2,6+/run) e o grafo do estágio graphforge só herda as
   attempts (~1,4–2,4/run). O grafo ENTREGUE pela plataforma (após
   materialização) tem 7,9 erros/grafo (ver
   resultados/avaliacao-plataforma-2026-08-14/) — nenhum harness da bancada
   media esse artefato final.
3. **Modelo importa nos dois mundos**: qwen3-max ~2× a cobertura do flash-lite
   dentro do fluxo real (e melhora devolutiva 6,7%→27,8%), coerente com a
   rodada 1. A escolha de modelo do papel estudantes é uma alavanca real.
4. **Limites**: mede o estágio graphforgeNode (pré-materialização, sem
   agent6/7, sem quality gate com regeneração); nível 3 NÃO SE APLICA (os
   agentes de produção não veem componentes — a interface nasce depois);
   interface CTAT fixa por premissa do desenho.

Artefatos: runs completos (contrato v2 com fidelidadeEstagio), manifests,
validacao-*.json, comparacao-*.json, logs e pilotos, nesta pasta.
