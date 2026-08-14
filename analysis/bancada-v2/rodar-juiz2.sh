#!/bin/bash
# Painel duplo da bancada v2 (2026-08-14), fase 2 — DESACOPLADO da sessão.
# (a) refaz o braço qwen com o juiz 1 (luna) para gravar o detalhe item a item
#     (o run original rodou antes da instrumentação do kappa);
# (b) roda o juiz 2 (deepseek/deepseek-v4-flash, classe de velocidade do luna,
#     família independente do juiz 1 E dos geradores) nos MESMOS itens dos três braços.
# Lançar com: setsid nohup bash analysis/bancada-v2/rodar-juiz2.sh &
cd /root/sti-graph-validation || exit 1
B=resultados/bancada-v2-2026-08-14
export STI_RUNS_DIR=$B
LOG=$B/log-juiz2.txt

rodar() { # juiz modelo rotulo dir prefixo
  export JUDGE_MODEL=$2 STI_RUN_ID="$5-$3"
  echo "════ $5-$3 ($2) — início $(date -Is)" >> $LOG
  node -r dotenv/config analysis/bancada-v2/juiz-cego.mjs \
    --runs "$4/runs" --rotulo "$3" --json "$B/$5-$3.json" --yes >> $LOG 2>&1
  echo "EXIT-$5-$3=$?" >> $LOG
}

R1=resultados/comparacao-modelos-2026-08-14
rodar juiz1 openai/gpt-5.6-luna        r1-campanha5-final $R1/campanha5-final juiz
rodar juiz2 deepseek/deepseek-v4-flash r1-campanha5-final $R1/campanha5-final juiz2
rodar juiz2 deepseek/deepseek-v4-flash r1-custo-beneficio $R1/custo-beneficio juiz2
rodar juiz2 deepseek/deepseek-v4-flash r1-turbo           $R1/turbo           juiz2
echo "JUIZ2-COMPLETO-FIM $(date -Is)" >> $LOG
