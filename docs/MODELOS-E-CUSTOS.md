# Modelos e custos registrados

Valores desta página são contábeis: somam o custo devolvido ou calculado nos
journals preservados. Não são promessa de preço futuro. Uma mesma identificação
comercial pode mudar de preço, provedor ou pesos ao longo do tempo.

## Campanha 4 — geração principal

Os três agentes usaram `google/gemini-3.5-flash` via OpenRouter. Temperaturas e
limites pertenciam à configuração implantada, não eram fatores experimentais.

| Agente | Temperatura | Chamadas | Tokens de entrada | Tokens de saída | Custo (US$) |
| --- | ---: | ---: | ---: | ---: | ---: |
| 3a | 0,2 | 18 | 42.540 | 36.254 | 0,3900960 |
| 3b | 0,7 | 18 | 53.268 | 87.248 | 0,8651340 |
| 3c | 0,4 | 17 | 49.607 | 69.372 | 0,6987585 |
| **Total** | — | **53** | **145.415** | **192.874** | **1,9539885** |

Foram planejadas 54 chamadas. A falha atômica no último estado da réplica 3
ocorreu após respostas de 3a e 3b; o 3c não foi chamado, não houve retry e o
estado permaneceu no estimando ITT.

## Campanha 4 — painel auxiliar final v5

| Modelo | Primárias | Reparos | Chamadas | Julgamentos finais válidos | Custo (US$) |
| --- | ---: | ---: | ---: | ---: | ---: |
| `z-ai/glm-5.2` | 222 | 102 | 324 | 157 | 0,796398510 |
| `qwen/qwen3.7-plus` | 222 | 0 | 222 | 222 | 0,190116480 |
| `deepseek/deepseek-v4-pro` | 222 | 0 | 222 | 222 | 0,256716555 |
| **Total** | **666** | **102** | **768** | **601** | **1,243231545** |

O GLM deixou 65 julgamentos finais ausentes. Qwen e DeepSeek garantiram pelo
menos dois julgamentos válidos para todas as 204 saídas observadas. O painel
mostrou efeito teto e é evidência auxiliar, não validação humana.

## Lançamentos técnicos excluídos integralmente

| Lançamento | Chamadas concluídas | Escores válidos observados, mas excluídos | Custo (US$) | Motivo |
| --- | ---: | ---: | ---: | --- |
| v1 | 58 | 2 | 0,002448615 | schema não portável |
| v2 | 329 | 240 | 1,809651410 | gramáticas remotas por unidade |
| v4 | 124 | 124 | 0,408964610 | retirada do GPT por custo e reinício universal |
| **Total excluído** | **511** | **366** | **2,221064635** | nenhum escore reutilizado |

Esse total é overhead técnico conhecido, não o saldo da conta nem uma fatura
completa: tentativas diagnósticas ou em voo podem não estar integralmente
reconciliadas. Claude e GPT aparecem somente em campanhas/lançamentos históricos
e não fazem parte do painel final v5.

## Campanha 5 (2026-07-19) — simulador iterado

Seis braços × 72 chamadas de simulação (24 problemas × 3 réplicas), sem juízes
LLM (comparação 100% offline via `metrics.js`).

| Braços | Modelo do simulador (3b) | Provedor | Custo aproximado |
| --- | --- | --- | ---: |
| 1–5 | `google/gemini-3.5-flash` (temp. 0,7) | OpenRouter | ~US$ 4 por braço |
| 6 | `qwen/qwen3-max` | OpenRouter | ~US$ 4 |

Total aproximado da campanha: **~US$ 24**. Estes valores são narrativos: os
journals por chamada da C5 não foram consolidados neste pacote, então — pela
mesma regra aplicada a C1/C2 abaixo — não devem ser apresentados como totais
contábeis exatos. A previsão teórica do braço 6
(`resultados/campanha5-2026-07-19/previsao-teorica/`) custou US$ 0,00: é 100%
determinística, sem chamadas de LLM.

**Confounder declarado:** o braço 6 troca prompt E modelo ao mesmo tempo
(`qwen/qwen3-max` era a recomendação pré-existente de `tiers.js` no repositório
EducaOFF); o efeito modelo×prompt não está isolado. Detalhes em
[PROTOCOLO-CAMPANHA-5.md](PROTOCOLO-CAMPANHA-5.md) §5.

## Campanhas históricas

- C3: 1.970 registros reconciliados, US$ 16,71870027. Dois erros primários
  acionaram fallback bem-sucedido; a formulação correta é “zero falhas finais de
  autoria”, não “zero falhas de chamada”.
- C1 e C2: valores narrativos aproximados não têm journal suficiente para
  reconciliação independente e não devem ser apresentados como totais exatos.

Conferir esses valores não requer chamada paga. Os journals em
`resultados/campanha4-2026-07-15/` e a análise principal são as fontes canônicas.
