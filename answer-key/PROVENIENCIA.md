# Proveniência — `frac-numberline-6.17.json`

## Fonte

- **Arquivo**: `cases/ctat-6.17/_interface/massproduction.txt` — tabela de *mass production* do CTAT
  (TSV: variáveis × 24 exercícios), preenchida pelo autor humano ANTES da
  exemplificação do grafo no *Example-tracing Tutor*. É, portanto, uma fonte
  INDEPENDENTE e ANTERIOR ao grafo do especialista (`expert.brd`).
- **sha256 do arquivo-fonte**: `18626e8402b088d7330c79f329b2dda9ef9595b84bf0cac58a7166c798cbd920`
- **Data da extração**: 2026-07-12
- **Gerado por**: `build-answer-key.mjs` (determinístico; rodar de novo reproduz o JSON byte a byte)

## Regra de exclusão

Variáveis da mass production que NÃO entram no gabarito, porque pertencem ao
grafo do especialista (Envelope B) e contaminariam a entrada dos agentes:

| variável | motivo |
| -------- | ------ |
| `%(startStateNodeName)%` | referencia estado do grafo do especialista |
| `%(div-h1)%` | dica (material do Envelope B) |
| `%(div-h2)%` | dica (material do Envelope B) |
| `%(line-h)%` | dica (material do Envelope B) |
| `%(num-h)%` | dica (material do Envelope B) |
| `%(goodjob)%` | feedback de sucesso (material do Envelope B) |
| `%(skillName)%` | KC — só existe no grafo; fora do Envelope A v2 (ablação futura) |
| `%(skillLabel)%` | KC — só existe no grafo; fora do Envelope A v2 (ablação futura) |

Os KCs (`skillName`/`skillLabel`) ficam fora do Envelope A **v2** por decisão
registrada: só existem no grafo do especialista; uma ablação futura medirá o
impacto de fornecê-los.

## Regra de normalização de células

- `"-"` (célula vazia da planilha) → `null`
- inteiro puro (`/^-?\d+$/`) → número
- resto → string (frações como `"1/4"` permanecem strings; `statement`/`statement2` idem)
- células com quoting CSV (aspas externas, `""` internas) são desfeitas e aparadas
