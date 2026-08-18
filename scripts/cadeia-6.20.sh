#!/bin/bash
set -u
cd /root/sti-graph-validation
export STI_DATASET=fraction-ordering-6.20
B=/root/sti-graph-validation/resultados/bloco1-mathtutor-2026-08-16/6.20
node -r dotenv/config scripts/reproduce-collect.mjs --fluxo plataforma --passos-livres --interface-fixa --modelo estudantes=qwen/qwen3-max --yes --out $B/fixa-estudantes-qwen > $B/log-fixa-estudantes-qwen.txt 2>&1; echo "EXIT=$?" >> $B/log-fixa-estudantes-qwen.txt
node -r dotenv/config scripts/materializar-lote.mjs --runs $B/fixa-custo-beneficio/runs --out $B/materializado-v2-fixa-custo-beneficio --yes > $B/log-mat-flashlite.txt 2>&1; echo "EXIT=$?" >> $B/log-mat-flashlite.txt
node -r dotenv/config scripts/materializar-lote.mjs --runs $B/fixa-estudantes-qwen/runs --out $B/materializado-v2-fixa-estudantes-qwen --yes > $B/log-mat-qwen.txt 2>&1; echo "EXIT=$?" >> $B/log-mat-qwen.txt
