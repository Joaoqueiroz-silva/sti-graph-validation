# Declaração prévia — comparação de modelos, 2026-08-14

Registrada ANTES de qualquer resultado ser coletado ou olhado
(docs/CONFIGURACAO-MODELOS.md §4.4: declarar o braço principal antes de olhar).

## Braços (mesmo corpus, mesmas réplicas, mesmos prompts, mesma temperatura)

| Braço | Modelo do agente de estudantes | Papel |
|---|---|---|
| `campanha5-final` | `qwen/qwen3-max` | âncora: réplica da configuração final da Campanha 5 |
| **`custo-beneficio`** | `google/gemini-3.1-flash-lite` | **BRAÇO PRINCIPAL** — é o perfil BALANCED que a produção roda hoje |
| `turbo` | `google/gemini-3.5-flash` | comparação (idêntico a `qualidade-maxima` neste harness, que só chama o agente de estudantes — por isso `qualidade-maxima` não é um braço) |

## Protocolo

- Piloto: 1 exercício × 1 réplica por braço; segue para a campanha se os três
  registros passarem em `validar.mjs --runs` com níveis 2, 3 e 5 calculados e
  o custo real por run ficar na ordem da estimativa (~US$ 0,01–0,05).
- Campanha: 24 exercícios × 3 réplicas por braço, coletor
  `scripts/reproduce-collect.mjs` com registro completo do
  docs/CONTRATO-RUN-V2.md (grafo preservado + modelos resolvidos + custo).
- Comparação: pareada por exercício (`analysis/validacao-v2/comparar-modelos.mjs`),
  braços secundários lidos contra o principal; sobreposição de ICs marginais
  NÃO será usada como critério (doc §4.3).
- Métrica primária: cobertura (nível 1) do validar-v2; os níveis 2/2b/3/5 são
  descritivos nesta rodada (primeira coleta que os preserva).
- Orçamento: trava STI_BUDGET_USD default (US$ 50); estimativa total ~US$ 2,50.
- Autorização do usuário: 2026-08-14, "piloto + campanha direto", chave da
  conta de produção.
