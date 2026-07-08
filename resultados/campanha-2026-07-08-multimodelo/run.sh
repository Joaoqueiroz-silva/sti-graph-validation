#!/bin/bash
# CAMPANHA 2 (multi-modelo): 3 braços geradores × (3 evals + 3 judges), juiz neutro único.
# Resumível: pula reports já concluídos. Roda no pacote standalone (infra idêntica p/ os 3 braços).
cd /root/sti-graph-validation || exit 1
export STI_LOG=warn
D=/tmp/campanha2
JUDGE=mistralai/mistral-large-2512
JFALL=mistralai/mistral-medium-3.1

declare -A GEN=( [gemini]="google/gemini-3.5-flash" [glm52]="z-ai/glm-5.2" [dsv4pro]="deepseek/deepseek-v4-pro" )

run() { local out="$1"; shift
  if [ -f "$out" ]; then echo "SKIP  $out"; return; fi
  echo "RUN   $out @ $(date +%H:%M:%S)"
  if "$@" --out "$out" > "$out.log" 2>&1; then echo "OK    $out @ $(date +%H:%M:%S)"; else echo "FAIL  $out"; fi
}

for arm in gemini glm52 dsv4pro; do
  g="${GEN[$arm]}"
  for r in 1 2 3; do
    GEN_MODEL="$g" FALLBACK_MODEL="$g" \
      run "$D/report-eval-$arm-$r.json" node -r dotenv/config run-ctat-eval.mjs cases/ctat-6.17 --real
  done
done
for arm in gemini glm52 dsv4pro; do
  g="${GEN[$arm]}"
  for r in 1 2 3; do
    GEN_MODEL="$g" FALLBACK_MODEL="$JFALL" JUDGE_MODEL="$JUDGE" \
      run "$D/report-judge-$arm-$r.json" node -r dotenv/config run-judge.mjs cases/ctat-6.17 --real
  done
done
echo "CAMPANHA 2 DONE @ $(date +%H:%M:%S)"; ls "$D"/report-*.json | wc -l
