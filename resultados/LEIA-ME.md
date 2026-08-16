# Índice dos resultados — o que é vigente e o que é histórico

Regra do repositório: **nenhuma campanha é apagada** (dados depositados,
ancorados por hash e lidos pelos verificadores). Este índice diz o papel de
cada pasta para quem vai escrever ou revisar o artigo novo.

## VIGENTES — a validação de 2026-08-14 (usar como resultados primários)

| Pasta | O que contém |
|---|---|
| `comparacao-modelos-2026-08-14/` | Rodada 1: 3 braços 24×3 com contrato v2 (grafo preservado); réplica 7/7 da C5; pré-registro próprio |
| `comparacao-fluxo-2026-08-14/` | Rodada 2: fluxo-plataforma (agents 3a/3b/3c de produção); o achado estágio ≠ produto (Δ −0,481) |
| `bancada-v2-2026-08-14/` | Comparação JUSTA com o especialista (posição relativa, produto, precision@k, TOST) + precisão julgada pelo painel de juízes com gate |
| `avaliacao-plataforma-2026-08-14/` | Censo intrínseco dos 868 grafos publicados no EducaOFF (sem CTAT); linha do tempo abr→ago |
| `validacao-preditiva-2026-08-14/` | Validade preditiva contra 476 erros REAIS de alunos (sem CTAT); antecipação 34,6% |
| `rodada3-passos-livres-2026-08-15/` | Rodada 3: regime passos-livres (agentes geram 4,8–5,4 passos vs corte de 4) + comparação por ESTADO/CAMINHO do orientador (cru, mínima e MATERIALIZADO com agent 6/7 de produção — adendo em RESULTADOS.md) |
| `EXPERIMENTO-CONSOLIDADO-2026-08/` | **Tabela-mestra**: todos os corpora (6.17 rodada 4 + bloco 1 do Mathtutor) sob a mesma régua; regerada por `consolidar-corpora.mjs` |
| `bloco1-mathtutor-2026-08-16/` | Corpora públicos do Mathtutor (6.19, 6.18, 6.20, 8.12, 7.12): pré-registro, pilotos, coleta, materialização, análises por corpus |
| `rodada4-interface-fixa-2026-08-15/` | Rodada 4: os agentes recebem também a INTERFACE do CTAT (mesmo insumo do especialista); coleta + materialização + Δ pareado contra a rodada 3 — o experimento vigente para a métrica de estados |

Cada pasta vigente tem `RESULTADOS.md` (síntese e leitura), runs completos,
manifestos de chamada e, quando aplicável, `DECLARACAO-PRE-REGISTRO.md`.

## HISTÓRICOS — desenvolvimento do instrumento e dados depositados (contexto)

| Pasta | Papel |
|---|---|
| `campanha-2026-07-02/`, `campanha-2026-07-08-multimodelo/` | Primeiras campanhas; desenvolvimento do instrumento |
| `campanha3-2026-07-13/` | Campanha 3 (ablação de flags); congelada por manifesto próprio |
| `campanha4-2026-07-15/` | Campanha 4 — pipeline de produção da época; base do manuscrito v6.0 |
| `campanha5-2026-07-19/` | Campanha 5 — base do manuscrito v7.0; a réplica de 2026-08-14 validou o instrumento novo contra ela |
| `bancada-juizes-2026-07-10/`, `saturation-curve-*.json` | Estudos auxiliares históricos |

Por que ficam: os verificadores (`verify:offline`) recomputam esses números a
cada commit; os manuscritos v6/v7 os citam; e a CONTRADIÇÃO entre C4 (0,20) e
C5 (0,90) é parte do resultado novo — a rodada 2 explicou-a com comparação
pareada (estágio × produto). Apagar histórico quebraria a reprodutibilidade e
empobreceria o artigo.
