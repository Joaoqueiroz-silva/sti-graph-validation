#!/bin/bash
# Executor DESACOPLADO do juiz cego da bancada v2 (2026-08-14).
# Roda os três braços em sequência, sobrevive à queda da sessão/SSH
# (lançar com: setsid nohup bash analysis/bancada-v2/rodar-juiz-completo.sh &).
# Saídas: resultados/bancada-v2-2026-08-14/juiz-*.json + log-juiz.txt (com EXIT por braço).
cd /root/sti-graph-validation || exit 1
B=resultados/bancada-v2-2026-08-14
export STI_RUNS_DIR=$B
# 2026-08-14: juiz trocado do GLM-4.5 histórico para gpt-5.6-luna POR LATÊNCIA
# (~33s→rápido), decisão tomada ANTES de qualquer braço completo. Cross-family
# preservado (conteúdo julgado é Gemini/Qwen; Luna nunca julga produção
# própria). O gate de calibração pré-declarado do juiz-cego.mjs continua sendo
# o critério de validade do juiz; o parcial do GLM (2 exercícios) foi
# descartado, nunca misturado.
export JUDGE_MODEL=openai/gpt-5.6-luna
LOG=$B/log-juiz.txt

rodar() { # rotulo dir
  export STI_RUN_ID="juiz-$1"
  echo "════ $1 — início $(date -Is)" >> $LOG
  node -r dotenv/config analysis/bancada-v2/juiz-cego.mjs \
    --runs "$2/runs" --rotulo "$1" --json "$B/juiz-$1.json" --yes >> $LOG 2>&1
  echo "EXIT-$1=$?" >> $LOG
}

rodar r1-campanha5-final  resultados/comparacao-modelos-2026-08-14/campanha5-final
rodar r1-custo-beneficio  resultados/comparacao-modelos-2026-08-14/custo-beneficio
rodar r1-turbo            resultados/comparacao-modelos-2026-08-14/turbo
echo "JUIZ-COMPLETO-FIM $(date -Is)" >> $LOG
