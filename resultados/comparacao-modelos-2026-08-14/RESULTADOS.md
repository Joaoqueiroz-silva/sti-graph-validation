# Comparação de modelos por agente — resultados (2026-08-14)

Primeira campanha coletada com o **registro completo do contrato v2**
([docs/CONTRATO-RUN-V2.md](../../docs/CONTRATO-RUN-V2.md)): grafo preservado,
modelos resolvidos por agente e custo por run. É a primeira vez que os níveis
2, 3 e 5 da régua de qualidade
([docs/VALIDACAO-QUALIDADE-GRAFOS-V2.md](../../docs/VALIDACAO-QUALIDADE-GRAFOS-V2.md))
são CALCULÁVEIS em vez de "indisponíveis".

**Desenho pré-registrado** em [DECLARACAO-PRE-REGISTRO.md](DECLARACAO-PRE-REGISTRO.md)
(braço principal declarado ANTES de olhar qualquer resultado: `custo-beneficio`).
24 exercícios × 3 réplicas por braço; mesmo corpus, mesmos prompts, mesma
temperatura (0,7); só o modelo do agente muda. Coletor:
`scripts/reproduce-collect.mjs` (`--perfil <nome>`; sem flags = réplica da
configuração final da Campanha 5).

## Braços e custo real (manifests/, 216 chamadas auditadas, zero fallback de modelo)

| Braço | Modelo (agente de estudantes) | Custo (72 runs) |
|---|---|---|
| `custo-beneficio` (**principal**; = tier BALANCED de produção) | google/gemini-3.1-flash-lite | US$ 0,12 |
| `campanha5-final` (âncora de replicação) | qwen/qwen3-max | US$ 0,73 |
| `turbo` (idêntico a `qualidade-maxima` neste harness) | google/gemini-3.5-flash | US$ 5,13 |

## Replicação (sanidade do instrumento)

O braço `campanha5-final` reproduziu o braço depositado
`campanha5-2026-07-19/6-final-megabrain` com **7/7 métricas com sobreposição de
IC por cluster** (ver `log-campanha5-final.txt`). O coletor novo mede o mesmo
que o antigo — e agora preserva o que o antigo descartava.

## Métrica primária (cobertura, pareada por exercício contra o principal)

| Braço | Cobertura (conjunto comum, BCa) | Δ pareado vs principal (BCa 95%) | Veredito |
|---|---|---|---|
| `custo-beneficio` | 0,565 [0,476; 0,655] | — | referência |
| `campanha5-final` | 0,892 [0,817; 0,949] | **+0,328 [+0,246; +0,413]** | supera (20 vitórias, 0 derrotas em 24) |
| `turbo` | 0,967 [0,910; 0,992] | **+0,403 [+0,304; +0,495]** | supera (20 vitórias, 0 derrotas em 24) |

Em **F1** nenhum braço se distingue (ambos os Δ cruzam zero): o ganho de
cobertura é pago em precisão. Detalhes: `comparacao-cobertura.json`,
`comparacao-f1.json` (gerados por `analysis/validacao-v2/comparar-modelos.mjs`).

## Qualidade dos grafos — os seis níveis (validacao-*.json)

| Nível | Pergunta | custo-beneficio | campanha5-final | turbo | Especialista / C4 |
|---|---|---|---|---|---|
| 0 | executável? | 72/72 | 72/72 | 72/72 | — |
| 1 | valor coincide? (cobertura) | 0,612 | 0,887 | 0,974 | — |
| 2 | passo certo (índice bruto) | 0,071 | 0,155 | 0,116 | C4: **zero** |
| 2b | dentro de ±20% do caminho | 74,6% | **87,4%** | 54,5% | C4: 52% |
| 2b | desvio mediano de posição | 15,6% | **9,5%** | 19,0% | C4: 16,7% |
| — | granularidade (compressão) | 1,91× | 1,58× | 1,37× | C4: 2,6× |
| 3 | componente e ação certos | 0,036 | 0,072 | 0,015 | — |
| 4 | concordância funcional (κ) | 0,523 (0,18) | 0,450 (0,14) | 0,506 (0,22) | C5: 0,452 |
| 5 | devolutiva menciona o valor errado | 18,3% | **48,2%** | 32,0% | especialista: 75,5% |
| 5 | devolutiva instrui o professor | **0%** | **0%** | **0%** | C4: 50,4% |
| — | valores de erro inutilizáveis (prosa) | ~0,01% | ~0,05% | ~0,10% | C4: 23,1% |

### Leitura

1. **Os cinco defeitos medidos na Campanha 4 se moveram** com os agentes
   portados: devolutiva ao professor 50,4%→0%; valores em prosa 23,1%→~0,1%;
   passo certo 0→7–15% (bruto) e 52%→até 87% (±20%); compressão 2,6×→1,4–1,9×;
   menção ao valor errado 7,7%→até 48%.
2. **O perfil de produção (`custo-beneficio`) não supera o enumerador tímido**
   (cobertura 0,612/precisão 0,562 contra 0,599/0,694 sem nenhuma IA) — pela
   régua da linha de base, o modelo de estudantes atual não se justifica nesta
   tarefa.
3. **Cobertura bruta é comprável por força bruta; posição e devolutiva não.**
   O `turbo` chega a 0,974 (o enumerador amplo grátis faz 0,957) custando 43×
   o flash-lite, e é o pior em posição. O `qwen3-max` é o único que melhora
   simultaneamente posição (87,4% em ±20%) e devolutiva específica (48,2%).
4. **Teto real**: concordância funcional ~0,45–0,52 com κ 0,14–0,22 em todos
   os braços — pouco acima do acaso. Nenhuma configuração se comporta como o
   especialista diante do mesmo aluno simulado.
5. **Ressalvas**: sem banda humano–humano os números não têm escala absoluta;
   2 comparações contra a referência (o aviso de comparações múltiplas do
   `comparar-modelos.mjs` se aplica); os níveis 2/3/5 desta campanha são
   descritivos (primeira coleta que os preserva).

## Próximo passo recomendado (protocolo §4.2 da doc de configuração)

Troca isolada — `--modelo estudantes=qwen/qwen3-max` por cima do perfil
`custo-beneficio` (~US$ 0,75) — para atribuir o ganho de ancoragem ao agente de
estudantes antes de mexer no perfil de produção.

## Mapa dos artefatos

- `DECLARACAO-PRE-REGISTRO.md` — desenho e braço principal, gravados antes da coleta
- `piloto/<braço>/` — pilotos de 1 exercício (gate de custo/qualidade)
- `<braço>/runs/*.json` — 72 registros por braço no contrato v2 (grafo completo, modelos resolvidos, custo, resposta bruta)
- `<braço>/manifests/*.jsonl` — toda chamada de LLM (modelo, tokens, custo, hash do prompt)
- `<braço>/summary.json`, `<braço>/meta.json` — agregados e configuração da coleta
- `validacao-<braço>.json` — relatório dos seis níveis (`validar.mjs --runs --json`)
- `comparacao-cobertura.json`, `comparacao-f1.json` — comparação pareada
- `log-<braço>.txt` — transcrição da coleta (inclui a auditoria do manifesto)
