# Saídas DESCARTADAS por incidente de execução (19/08/2026)

Ficam aqui para auditoria. **Nenhum número destes arquivos entra em análise
alguma.** Foram descartados, não corrigidos a posteriori.

## `juiz-dicas-parcial-GEMINI-DESCARTADO.json` — 904 escadas

Julgadas por `google/gemini-3.5-flash`, não pelo juiz declarado
(`z-ai/glm-4.5`). Causa: `createLLM(cfg = {})` devolve
`cfg.model ? cfg : getAgentConfig()`; passar a STRING `"agent9_review"` em vez
do objeto de configuração não lança erro — cai no agente default. Duas
violações de uma vez: não é o juiz pré-registrado, e é a MESMA FAMÍLIA do braço
flash-lite (auto-avaliação).

Detectado no manifesto de execução (`runs/manifests/adhoc.jsonl`,
`agentKey=agent3b_atrisk | model=google/gemini-3.5-flash`, 904 chamadas), antes
de qualquer consolidação. Barreira permanente: `juiz-infra.mjs → juizAtivo()`,
que aborta a execução se o modelo resolvido não for o declarado, com teste que
exercita justamente a forma errada.

## `juiz-extras-parcial-14celulas-com-1-fallback.json` — 14 de 210 células

Duas razões:
1. **1 chamada saiu por `deepseek/deepseek-chat`** (fallback silencioso de
   `callLLM` em falha da primária). DeepSeek é a família que REPROVOU no gate
   de calibração em 14/08 — um juiz não pode ter fallback de modelo.
2. O lote morreu na célula 14 com `ECONNRESET`: `Promise.all` rejeita no
   primeiro erro e derrubava tudo.

Barreiras: `FALLBACK_MODEL` pinado no próprio juiz (contingência = nova
tentativa no MESMO modelo) e retentativa com espera exponencial por ITEM;
item que esgota as tentativas fica SEM veredito e é contado em `falhas`,
nunca somado como inválido.
