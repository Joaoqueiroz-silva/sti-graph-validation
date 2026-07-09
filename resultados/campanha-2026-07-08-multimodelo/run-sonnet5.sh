#!/bin/bash
# Braço 4 da campanha 2: anthropic/claude-sonnet-5 (mesmo protocolo, mesmo juiz neutro).
cd /root/sti-graph-validation || exit 1
export STI_LOG=warn
D=/tmp/campanha2
G=anthropic/claude-sonnet-5
run() { local out="$1"; shift
  if [ -f "$out" ]; then echo "SKIP  $out"; return; fi
  echo "RUN   $out @ $(date +%H:%M:%S)"
  if "$@" --out "$out" > "$out.log" 2>&1; then echo "OK    $out @ $(date +%H:%M:%S)"; else echo "FAIL  $out"; fi
}
for r in 1 2 3; do
  GEN_MODEL="$G" FALLBACK_MODEL="$G" \
    run "$D/report-eval-sonnet5-$r.json" node -r dotenv/config run-ctat-eval.mjs cases/ctat-6.17 --real
done
for r in 1 2 3; do
  GEN_MODEL="$G" FALLBACK_MODEL="mistralai/mistral-medium-3.1" JUDGE_MODEL="mistralai/mistral-large-2512" \
    run "$D/report-judge-sonnet5-$r.json" node -r dotenv/config run-judge.mjs cases/ctat-6.17 --real
done
echo "BRACO SONNET5 DONE @ $(date +%H:%M:%S)"
