#!/bin/bash
# run-onda3.sh — Orquestração da campanha 3 (Onda 3, 2026-07-13).
# Sequencial de propósito: trava de orçamento (STI_BUDGET_USD) e rate limits.
# Descoberta registrada: a disciplina default acentuada zerava o MISC_DB também
# nas campanhas 1 e 2 (gotcha de acento) — portanto o BASELINE fiel ao histórico
# roda SEM --discipline (catálogo efetivamente vazio) e a ablação "miscdb-on"
# liga o catálogo com --discipline matematica.
set -uo pipefail
cd "$(dirname "$0")"
export DOTENV_CONFIG_PATH=/root/sti-unplugged/.env
export STI_BUDGET_USD=50
OUT=resultados/campanha3-2026-07-13
mkdir -p "$OUT"
LOG="$OUT/onda3.log"

run() {
  echo "════ $(date +%H:%M:%S) → $*" | tee -a "$LOG"
  node -r dotenv/config "$@" >> "$LOG" 2>&1
  local rc=$?
  echo "──── rc=$rc · orçamento: $(cat runs/budget.json 2>/dev/null | tr -d '\n')" | tee -a "$LOG"
  if grep -q BudgetExceeded "$LOG"; then echo "ORÇAMENTO ESTOURADO — parando" | tee -a "$LOG"; exit 9; fi
  return 0
}

# ── Bloco 1: recampanha multimodelo (3 braços × 3 réplicas) ──
run run-campaign3.mjs --model google/gemini-3.5-flash   --replicas 3 --condition base-gemini  --out "$OUT"
run run-campaign3.mjs --model z-ai/glm-5.2              --replicas 3 --condition base-glm52   --out "$OUT"
run run-campaign3.mjs --model deepseek/deepseek-v4-pro  --replicas 3 --condition base-dsv4pro --out "$OUT"

# ── Bloco 2: ablações (baseline gemini, 3 réplicas cada) ──
run run-campaign3.mjs --model google/gemini-3.5-flash --replicas 3 --condition miscdb-on    --out "$OUT" --discipline matematica
run run-campaign3.mjs --model google/gemini-3.5-flash --replicas 3 --condition limite-6     --out "$OUT" --misc-limit 6
run run-campaign3.mjs --model google/gemini-3.5-flash --replicas 3 --condition saturacao    --out "$OUT" --misc-limit saturate
run run-campaign3.mjs --model google/gemini-3.5-flash --replicas 3 --condition repr-dom     --out "$OUT" --repr dom
run run-campaign3.mjs --model google/gemini-3.5-flash --replicas 3 --condition repr-screenshot --out "$OUT" --repr screenshot
run run-campaign3.mjs --model google/gemini-3.5-flash --replicas 3 --condition chamada-unica --out "$OUT" --single-call

# ── Bloco 3: curva de ensemble K=1..10 (só agente 3b) ──
run run-ensemble-v2.mjs cases/ctat-6.17 --k 10 --out "$OUT/ensemble-v2-k10.json"

# ── Bloco 4: painel de 3 juízes sobre os braços multimodelo ──
run run-judge-panel.mjs --eval-reports "$OUT/report-c3-base-*.json" --out "$OUT/painel"

# ── Fecho: manifestos viram artefato versionável ──
mkdir -p "$OUT/manifests" && cp runs/manifests/*.jsonl "$OUT/manifests/" 2>/dev/null
cp runs/budget.json "$OUT/budget-final.json" 2>/dev/null
echo "════ ONDA 3 COMPLETA $(date) · orçamento final: $(cat runs/budget.json | tr -d '\n')" | tee -a "$LOG"
