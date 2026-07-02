#!/bin/bash
# Campanha empírica: réplicas eval (real×3 + shim×3) + juiz real×3. RESUMÍVEL (pula reports já feitos).
cd /root/sti-unplugged/backend || exit 1
export DOTENV_CONFIG_PATH=../.env STI_LOG=warn
D=/tmp/campaign
mkdir -p "$D"

run() {            # $1=outfile ; resto=comando (recebe --out automaticamente)
  local out="$1"; shift
  if [ -f "$out" ]; then echo "SKIP  $out"; return; fi
  echo "RUN   $out @ $(date +%H:%M:%S)"
  if "$@" --out "$out" > "$out.log" 2>&1; then echo "OK    $out @ $(date +%H:%M:%S)"; else echo "FAIL  $out"; fi
}

for r in 1 2 3; do
  run "$D/report-eval-real-$r.json" node -r dotenv/config evaluation/run-ctat-eval.mjs cases/ctat-6.17 --real
  run "$D/report-eval-shim-$r.json" node -r dotenv/config evaluation/run-ctat-eval.mjs cases/ctat-6.17
done
for r in 1 2 3; do
  run "$D/report-judge-real-$r.json" node -r dotenv/config evaluation/run-judge.mjs cases/ctat-6.17 --real
done
echo "CAMPANHA DONE @ $(date +%H:%M:%S)"
ls -1 "$D"/report-*.json | wc -l
