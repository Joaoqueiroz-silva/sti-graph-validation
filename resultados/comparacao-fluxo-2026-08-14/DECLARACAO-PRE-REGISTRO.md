# Declaração prévia — rodada 2: efeito do FLUXO da plataforma (2026-08-14)

Registrada ANTES de qualquer coleta desta rodada. Motivação: a rodada 1
(resultados/comparacao-modelos-2026-08-14/) usou o simulador de UMA chamada da
Campanha 5; esta rodada autora o grafo pelo FLUXO DA PLATAFORMA — os agents
3a/3b/3c de produção (byte a byte, fan-out do 3b, stepDiagnostics, catálogo
misconceptionsFor, checklist de taxonomia) + extractGraphForgeConfig +
graphForge de produção (`--fluxo plataforma` no coletor).

## Braços (24 exercícios × 3 réplicas; mesmo corpus e réplicas da rodada 1)

| Braço | Configuração | Papel |
|---|---|---|
| **`custo-beneficio` (fluxo-plataforma)** | perfil custo-beneficio (estudantes = gemini-3.1-flash-lite) | **PRINCIPAL** |
| `estudantes-qwen` (fluxo-plataforma) | custo-beneficio + `--modelo estudantes=qwen/qwen3-max` | troca isolada recomendada pela doc §4.2 |

## Comparações declaradas (pareadas por exercício, métrica primária: cobertura)

1. **PRIMÁRIA — efeito do fluxo**: `custo-beneficio` fluxo-plataforma vs
   `custo-beneficio` rodada 1 (mesma configuração de modelo, muda só o fluxo).
2. Secundária — efeito do modelo dentro do fluxo real: `estudantes-qwen` vs
   `custo-beneficio`, ambos fluxo-plataforma.
3. Descritivo: níveis 0–5 por braço. O nível 3 (componente/ação) NÃO SE APLICA
   a este fluxo (os agentes de produção não recebem inventário de componentes;
   na plataforma a interface nasce depois) — será reportado como
   não-aplicável, nunca como zero de desempenho.

## Gates do piloto (1 exercício × 1 réplica por braço, ANTES da campanha)

- registro passa no contrato v2 e no validar --runs;
- custo real por run na ordem de US$ 0,01–0,15;
- **taxa de descarte por template ≤ 20%** dos erros específicos do 3b
  (`fidelidadeEstagio.descartadosPorTemplate / errosEspecificos`): os prompts
  de produção permitem variáveis {A}/{B} que a materialização concretizaria;
  taxa alta = a bancada estaria sendo INJUSTA com o fluxo da plataforma →
  PARAR e reavaliar em vez de coletar.

## Limites conhecidos, declarados de antemão

- Mede o grafo no estágio graphforgeNode do pipeline-v8 — antes de
  materialização (agent6/7), revisão (agent9), fact-check e quality gate com
  regeneração (a plataforma pode regenerar um grafo ruim até 2×; aqui é
  primeira passada).
- agent1_domain fora do circuito (KCs vêm do pacote CTAT — controle e
  comparabilidade com a rodada 1); agent2_seed não roda (o problema é fixo por
  premissa do experimento).
- Interface CTAT ≠ distribuição de interfaces do EducaOFF.
- Orçamento: trava STI_BUDGET_USD default (US$ 50); estimativa ≈ US$ 0,5–3.
- Autorização do usuário: 2026-08-14 ("pode seguir e depois já pode seguir com
  a rodada de validação"), chave da conta de produção.
