#!/usr/bin/env bash
set -Eeuo pipefail
set +x
umask 077
ulimit -c 0

ROOT='/Users/joaocarlosherculanodasilvaqueiroz/Documents/Codex/2026-07-12/que'
REPO="$ROOT/tmp/pdfs/relatorio_atual/repo"
OUT="$REPO/resultados/campanha4-2026-07-15/judge-panel-v5"
RUNNER="$REPO/production-fidelity/campaign4-judge-runner.mjs"

cleanup() {
  unset key_line secret_value OPENROUTER_API_KEY
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

check_sha() {
  local expected="$1"
  local file="$2"
  local observed
  observed="$(shasum -a 256 "$file" | awk '{print $1}')"
  [[ "$observed" == "$expected" ]] || {
    printf 'Hash divergente: %s\n' "$file" >&2
    exit 1
  }
}

check_sha 'eca324bb990170baf771e6331b752c169566f0ce6cd2014c42c85fda75180b86' "$RUNNER"
check_sha 'd465e7ae91b4e8a1daa780d9ed12c4b38c8b9ba1f0012a5afd0376bd2e375d25' "$REPO/protocol/production-freeze-2026-07-15/AMENDMENT-C4-JUDGES-V2-PORTABLE-SCHEMA-2026-07-15.md"
check_sha 'd0479ce346aaafbc4418b4f1596a0b9b8b45b5c0456226f2b9acc57210609f73' "$REPO/protocol/production-freeze-2026-07-15/AMENDMENT-C4-JUDGES-V3-STABLE-GRAMMAR-2026-07-15.md"
check_sha '8bb40f42c87e0718edfc346dfb99151e98b776e88d39c73aa1e002314db1924b' "$REPO/protocol/production-freeze-2026-07-15/AMENDMENT-C4-JUDGES-V4-QWEN-REPLACEMENT-2026-07-15.md"
check_sha '5dd70b158d8f11304ed35a09badeb9a852e0a9a78b037af7e7d20937096fa896' "$REPO/protocol/production-freeze-2026-07-15/AMENDMENT-C4-JUDGES-V5-GLM-REPLACEMENT-2026-07-15.md"
check_sha 'aab2b8a887280f306ef00d58d42181c4c898b0ebdcf9decf0dd914d39ba68bf2' "$OUT/judge-preflight.json"
check_sha '803c3ab756a46a6272440577c6dfeff02bdf577c6d7d6bb0bbe511126b50033e' "$OUT/judge-finance-manifest.json"
check_sha '26cbf28d9a6f8572b36a9412bb82a3795580e0623dc83b368684869fdcb37d1b' "$OUT/judge-unit-snapshot.json"
check_sha '257ea773f4df9b658e36ce2787f1da9dca07ad79eb9f20e8bec464f4d1911335' "$OUT/judge-reidentification-map.json"

jq -e '
  [.observedModels[].id] == [
    "z-ai/glm-5.2",
    "qwen/qwen3.7-plus",
    "deepseek/deepseek-v4-pro"
  ]
  and ([.observedModels[].family] | index("anthropic") | not)
  and ([.observedModels[].family] | index("openai") | not)
  and .design.requestPolicy.remoteGrammarCount == 3
' "$OUT/judge-preflight.json" >/dev/null

[[ ! -e "$OUT/calls.jsonl" ]]
[[ ! -e "$OUT/judge-panel-results.json" ]]
[[ ! -e "$OUT/judge-panel-analysis.json" ]]

key_line="$(
  ssh -T minha-vps \
    'docker exec sti-backend sh -c '\''test -n "$OPENROUTER_API_KEY_GOOGLE" && printf "OPENROUTER_API_KEY=%s\n" "$OPENROUTER_API_KEY_GOOGLE"'\'''
)"
[[ "$key_line" == OPENROUTER_API_KEY=* ]]
[[ "$key_line" != *$'\n'* ]]
secret_value="${key_line#*=}"
[[ -n "$secret_value" ]]
export OPENROUTER_API_KEY="$secret_value"
unset key_line

cd "$REPO"
node "$RUNNER" --execute --out "$OUT" --concurrency 9

if printf '%s\n' "$secret_value" | grep -R -F -q -f - "$OUT"; then
  printf 'BLOQUEIO: possivel credencial encontrada nos artefatos do painel.\n' >&2
  exit 1
fi

jq -e '
  .status == "completed"
  and .primaryUnits == 666
  and .networkCalls >= 666
  and .networkCalls <= 1332
  and .fallbacks == 0
  and .accountedCostUsd <= .executionCostStopUsd
' "$OUT/judge-panel-results.json" >/dev/null

printf '%s\n' "$(jq -c '{status,primaryUnits,networkCalls,repairs,validJudgments,invalidJudgments,accountedCostUsd}' "$OUT/judge-panel-results.json")"
