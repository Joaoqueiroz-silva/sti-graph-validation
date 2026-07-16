#!/usr/bin/env bash
set -Eeuo pipefail
set +x
umask 077

ROOT='/Users/joaocarlosherculanodasilvaqueiroz/Documents/Codex/2026-07-12/que'
REPO="$ROOT/tmp/pdfs/relatorio_atual/repo"
PLAN="$REPO/protocol/production-freeze-2026-07-15/campaign4-full-execution-plan.json"
GROUP_RUNNER="$REPO/scripts/run-campaign4-real-group.sh"
PLAN_SHA='77de38a7bfe25f6dcfb34527081e9b5f73de4b1316ebd414f6129677aae3a074'
GROUP_RUNNER_SHA='9302539b1580b45651c6cc74220d48ff3e22cd5f9e62b7e681a10bcfc5e7624f'
AGGREGATE_CAP_USD='10.8'
GROUP_WORST_USD='1.782'

[[ "$(shasum -a 256 "$PLAN" | awk '{print $1}')" == "$PLAN_SHA" ]]
[[ "$(shasum -a 256 "$GROUP_RUNNER" | awk '{print $1}')" == "$GROUP_RUNNER_SHA" ]]

group_result_path() {
  local order="$1"
  local rel
  rel="$(jq -r --argjson order "$order" '.groups[] | select(.order == $order) | .outputDir' "$PLAN")"
  printf '%s/%s/campaign4-real-pilot.json' "$REPO" "$rel"
}

group_metrics_path() {
  local order="$1"
  local rel
  rel="$(jq -r --argjson order "$order" '.groups[] | select(.order == $order) | .outputDir' "$PLAN")"
  printf '%s/%s/campaign4-real-pilot-metrics-v2.json' "$REPO" "$rel"
}

validate_completed_group() {
  local result="$1"
  local metrics="$2"
  jq -e '
    .status == "completed"
    and (.cases | length) == 3
    and (.invocations | length) == 9
    and .safety.status == "completed"
    and .safety.spentUsd <= 2
    and all(.invocations[]; .status == "ok" and .attempt == 1 and .fallbackUsed == false)
  ' "$result" >/dev/null
  jq -e '
    (.cases | length) == 3
    and all(.cases[];
      .metrics.agent3a.problemIdCoverage.exactCoverage == 1
      and .metrics.agent3b.problemIdCoverage.exactCoverage == 1
      and .metrics.agent3c.problemIdCoverage.exactCoverage == 1
    )
  ' "$metrics" >/dev/null
}

for order in 2 3 4 5 6; do
  result="$(group_result_path "$order")"
  metrics="$(group_metrics_path "$order")"
  if [[ -e "$result" ]]; then
    [[ -e "$metrics" ]]
    validate_completed_group "$result" "$metrics"
    continue
  fi

  out="$(dirname "$result")"
  [[ ! -e "$out/safety/checkpoint.json" ]]
  [[ ! -e "$out/safety/calls.jsonl" ]]
  [[ ! -e "$out/campaign4-real-pilot-key-readiness.json" ]]

  prior_files=()
  pending=0
  for candidate in 1 2 3 4 5 6; do
    candidate_result="$(group_result_path "$candidate")"
    if [[ -e "$candidate_result" ]]; then
      prior_files+=("$candidate_result")
    else
      pending=$((pending + 1))
    fi
  done
  spent="$(jq -s 'map(.safety.spentUsd) | add' "${prior_files[@]}")"
  jq -en \
    --argjson spent "$spent" \
    --argjson pending "$pending" \
    --argjson groupWorst "$GROUP_WORST_USD" \
    --argjson cap "$AGGREGATE_CAP_USD" \
    '$spent >= 0 and ($spent + ($pending * $groupWorst) <= $cap)' >/dev/null

  bash "$GROUP_RUNNER" "$order"
  validate_completed_group "$result" "$metrics"
done

all_results=()
for order in 1 2 3 4 5 6; do
  all_results+=("$(group_result_path "$order")")
done

jq -s -c '{
  status:"completed",
  groups:length,
  states:(map(.cases|length)|add),
  invocations:(map(.invocations|length)|add),
  accountedCostUsd:(map(.safety.spentUsd)|add)
}' "${all_results[@]}"
