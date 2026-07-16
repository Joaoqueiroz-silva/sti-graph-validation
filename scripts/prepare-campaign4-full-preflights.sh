#!/usr/bin/env bash
set -Eeuo pipefail
set +x
umask 077

ROOT='/Users/joaocarlosherculanodasilvaqueiroz/Documents/Codex/2026-07-12/que'
REPO="$ROOT/tmp/pdfs/relatorio_atual/repo"
RUNTIME="$ROOT/tmp/tools/campaign4-runtime"

export PATH="$RUNTIME/bin:$RUNTIME/lima/bin:$PATH"
export COLIMA_HOME=/private/tmp/c4-colima
export LIMA_HOME=/private/tmp/c4-lima
export DOCKER_CONFIG=/private/tmp/c4-docker
export DOCKER_HOST=unix:///private/tmp/c4-colima/c4/docker.sock

IMAGE='sha256:15b29e8063099d40fc62899da2795db6e97d3e252e486315428a0690bb9abf5b'
INPUT="$REPO/production-fidelity/fixtures"
RUNNER="$REPO/production-fidelity/real-pilot-runner.mjs"
BASE="$REPO/resultados/campanha4-2026-07-15"

RUN_GROUPS=(
  'full-real-r1-batches-04-06|ctat-production-state-batch-04.json,ctat-production-state-batch-05.json,ctat-production-state-batch-06.json'
  'full-real-r2-batches-01-03|ctat-production-state-batch-01.json,ctat-production-state-batch-02.json,ctat-production-state-batch-03.json'
  'full-real-r2-batches-04-06|ctat-production-state-batch-04.json,ctat-production-state-batch-05.json,ctat-production-state-batch-06.json'
  'full-real-r3-batches-01-03|ctat-production-state-batch-01.json,ctat-production-state-batch-02.json,ctat-production-state-batch-03.json'
  'full-real-r3-batches-04-06|ctat-production-state-batch-04.json,ctat-production-state-batch-05.json,ctat-production-state-batch-06.json'
)

[[ "$(shasum -a 256 "$RUNNER" | awk '{print $1}')" == 'f3b8c76aa7eab6bde7cd9ef65f59aba15cca389eae2b509459fdebc412229285' ]]
[[ "$(shasum -a 256 "$INPUT/manifest.json" | awk '{print $1}')" == 'f839ddff6963da0da48c2644562c32362faad74c4b29dee7ccf7256c02ac6e5b' ]]
[[ "$(docker image inspect "$IMAGE" --format '{{.Id}} {{.Os}}/{{.Architecture}}')" == "$IMAGE linux/amd64" ]]

for spec in "${RUN_GROUPS[@]}"; do
  name="${spec%%|*}"
  files="${spec#*|}"
  out="$BASE/$name"
  preflight="$out/campaign4-real-pilot-preflight.json"
  mkdir -p "$out"
  [[ ! -e "$preflight" ]]
  [[ ! -e "$out/campaign4-real-pilot.json" ]]
  [[ ! -e "$out/safety/checkpoint.json" ]]

  docker run --rm \
    --name "c4-preflight-$name" \
    --pull never \
    --network none \
    --platform linux/amd64 \
    --read-only \
    --user node \
    --workdir /app \
    --cap-drop ALL \
    --security-opt no-new-privileges=true \
    --pids-limit 128 \
    --memory 1g \
    --cpus 1 \
    --ulimit core=0:0 \
    --tmpfs /tmp:rw,noexec,nosuid,size=128m \
    -e C4_PREFLIGHT_ONLY=1 \
    -e C4_EXPECTED_IMAGE="$IMAGE" \
    -e C4_STATE_FILES="$files" \
    -e C4_INPUT_DIR=/pilot/input \
    -e C4_OUTPUT_DIR=/pilot/out \
    -e LLM_MAX_RETRIES=0 \
    -e STI_DISABLE_GENERATION_CACHE=1 \
    -e NODE_ENV=production \
    -e LOG_LEVEL=error \
    --mount "type=bind,src=$INPUT,dst=/pilot/input,readonly" \
    --mount "type=bind,src=$out,dst=/pilot/out" \
    --mount "type=bind,src=$RUNNER,dst=/app/campaign4-real-pilot-runner.mjs,readonly" \
    "$IMAGE" node /app/campaign4-real-pilot-runner.mjs >/dev/null

  jq -e '
    .schemaVersion == "educaoff-campaign4-offline-preflight-v2"
    and .status == "passed"
    and .guarantees.networkAttempted == false
    and .guarantees.realLlmInvocationCount == 0
    and .guarantees.paidCallCount == 0
    and .promptManifest.invocationCount == 9
  ' "$preflight" >/dev/null

  printf '%s %s %s\n' \
    "$name" \
    "$(shasum -a 256 "$preflight" | awk '{print $1}')" \
    "$(jq -r '.promptManifest.entriesSha256' "$preflight")"
done
