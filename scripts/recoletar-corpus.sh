#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "uso: STI_RECOLLECT_ROOT=/diretorio/novo $0 <dataset> <rotulo-saida>" >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DATASET="$1"
LABEL="$2"
: "${STI_RECOLLECT_ROOT:?defina STI_RECOLLECT_ROOT para um diretório novo fora dos resultados depositados}"

mkdir -p "$STI_RECOLLECT_ROOT"
RECOLLECT_ROOT="$(cd "$STI_RECOLLECT_ROOT" && pwd)"
BASE="$RECOLLECT_ROOT/$LABEL"
mkdir -p "$BASE"
cd "$REPO_ROOT"
export STI_DATASET="$DATASET"

run_logged() {
  local log="$1"
  shift
  "$@" >"$log" 2>&1
}

for arm in custo-beneficio estudantes-qwen; do
  out="$BASE/fixa-$arm"
  log="$BASE/log-fixa-$arm.txt"
  model_args=()
  if [[ "$arm" == "estudantes-qwen" ]]; then
    model_args=(--modelo estudantes=qwen/qwen3-max)
  fi
  run_logged "$log" node -r dotenv/config scripts/reproduce-collect.mjs \
    --fluxo plataforma --passos-livres --interface-fixa \
    "${model_args[@]}" --yes --out "$out"
done

for arm in custo-beneficio estudantes-qwen; do
  run_logged "$BASE/log-materializar-$arm.txt" node -r dotenv/config scripts/materializar-lote.mjs \
    --runs "$BASE/fixa-$arm/runs" \
    --out "$BASE/materializado-v3-fixa-$arm" \
    --yes
done

echo "Recoleta concluída em $BASE"
