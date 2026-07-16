#!/usr/bin/env bash
set -Eeuo pipefail
set +x
umask 077
ulimit -c 0

ROOT='/Users/joaocarlosherculanodasilvaqueiroz/Documents/Codex/2026-07-12/que'
REPO="$ROOT/tmp/pdfs/relatorio_atual/repo"
RUNTIME="$ROOT/tmp/tools/campaign4-runtime"

export PATH="$RUNTIME/bin:$RUNTIME/lima/bin:$PATH"
export COLIMA_HOME=/private/tmp/c4-colima
export LIMA_HOME=/private/tmp/c4-lima
export DOCKER_CONFIG=/private/tmp/c4-docker
export DOCKER_HOST=unix:///private/tmp/c4-colima/c4/docker.sock

IMAGE='sha256:15b29e8063099d40fc62899da2795db6e97d3e252e486315428a0690bb9abf5b'
MODEL='google/gemini-3.5-flash'
NET='c4-pilot-real-net'
STUB_NAME='c4-ontology-pilot'
RUNNER_NAME='c4-pilot-real-r1'
RUN_ID='c4-pilot-real-20260715-batches-01-03-r1'

INPUT="$REPO/production-fidelity/fixtures"
OUT="$REPO/resultados/campanha4-2026-07-15/pilot-real-batches-01-03-r1"
RUNNER="$REPO/production-fidelity/real-pilot-runner.mjs"
SAFETY="$REPO/production-fidelity/real-run-safety.mjs"
STUB="$REPO/production-fidelity/ontology-empty-bridge.mjs"
PREFLIGHT="$OUT/campaign4-real-pilot-preflight.json"
FREEZE="$REPO/protocol/production-freeze-2026-07-15/pilot-execution-freeze.json"

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

cleanup() {
  set +e
  docker stop --time 20 "$RUNNER_NAME" >/dev/null 2>&1
  docker rm -f "$RUNNER_NAME" >/dev/null 2>&1
  docker stop --time 10 "$STUB_NAME" >/dev/null 2>&1
  docker rm -f "$STUB_NAME" >/dev/null 2>&1
  docker network rm "$NET" >/dev/null 2>&1
  unset key_line secret_value
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

check_sha 'f3b8c76aa7eab6bde7cd9ef65f59aba15cca389eae2b509459fdebc412229285' "$RUNNER"
check_sha 'a48497962a8bfbc3c33de01f9ba7621ffc69fd1823dbaf9ed9c94b48794e1928' "$SAFETY"
check_sha '2a19138e1d86e7b57c60b03eb7f99fdcc9658ca018993e106e765274492b3172' "$STUB"
check_sha 'f839ddff6963da0da48c2644562c32362faad74c4b29dee7ccf7256c02ac6e5b' "$INPUT/manifest.json"
check_sha '07b033161a2add1ad1ef79afa4209c7c5f0010e57e359ef1b62465eba4ce7ba8' "$PREFLIGHT"
check_sha '35c45152da45c5c3d57536ccd5ae0c9f573316c06486f83edec4951ff1eb0ff9' "$FREEZE"

[[ "$(docker image inspect "$IMAGE" --format '{{.Id}}')" == "$IMAGE" ]]
[[ "$(docker image inspect "$IMAGE" --format '{{.Os}}/{{.Architecture}}')" == 'linux/amd64' ]]

[[ ! -e "$OUT/campaign4-real-pilot.json" ]]
[[ ! -e "$OUT/campaign4-real-pilot-key-readiness.json" ]]
[[ ! -e "$OUT/safety/checkpoint.json" ]]
[[ ! -e "$OUT/safety/calls.jsonl" ]]

if docker container inspect "$RUNNER_NAME" >/dev/null 2>&1 ||
   docker container inspect "$STUB_NAME" >/dev/null 2>&1 ||
   docker network inspect "$NET" >/dev/null 2>&1; then
  printf 'Conteiner ou rede conflitante ja existe.\n' >&2
  exit 1
fi

# O registro publico e verificado novamente antes de qualquer credencial.
price_payload="$(
  curl --fail --silent --show-error \
    --retry 0 --connect-timeout 10 --max-time 20 \
    --proto '=https' --tlsv1.2 \
    -H 'Cache-Control: no-cache' \
    'https://openrouter.ai/api/v1/models'
)"

model_attestation="$(
  jq -ce --arg id "$MODEL" '
    [.data[] | select(.id == $id)] as $matches
    | if ($matches | length) != 1
      then error("modelo ausente ou duplicado")
      else $matches[0]
      end
    | {
        id,
        promptUsdPerToken: (.pricing.prompt | tonumber),
        completionUsdPerToken: (.pricing.completion | tonumber),
        contextLength: .context_length,
        maxTokensSupported:
          (((.supported_parameters // []) | index("max_tokens")) != null)
      }
  ' <<<"$price_payload"
)"

jq -e '
  .id == "google/gemini-3.5-flash"
  and .promptUsdPerToken <= 0.0000015
  and .completionUsdPerToken <= 0.000009
  and .contextLength >= 1048576
  and .maxTokensSupported == true
' <<<"$model_attestation" >/dev/null

jq -n \
  --arg checkedAt "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
  --arg freezeSha256 '35c45152da45c5c3d57536ccd5ae0c9f573316c06486f83edec4951ff1eb0ff9' \
  --argjson model "$model_attestation" \
  '{
    schemaVersion:"campaign4-pilot-launch-attestation-v1",
    checkedAt:$checkedAt,
    executionFreezeSha256:$freezeSha256,
    model:$model,
    paidCallsBeforeLaunch:0
  }' > "$OUT/campaign4-pilot-launch-attestation.json"

unset price_payload model_attestation

docker network create "$NET" >/dev/null

docker run -d --rm \
  --name "$STUB_NAME" \
  --pull never \
  --network "$NET" \
  --network-alias sti-ontology-bridge \
  --platform linux/amd64 \
  --read-only \
  --user node \
  --cap-drop ALL \
  --security-opt no-new-privileges=true \
  --pids-limit 64 \
  --memory 256m \
  --cpus 0.5 \
  --ulimit core=0:0 \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  -e HOST=0.0.0.0 \
  -e PORT=3040 \
  -e C4_ALLOWED_KC_IDS=kc_identificar_partes_fracao,kc_particionar_reta,kc_localizar_fracao_reta \
  --mount "type=bind,src=$STUB,dst=/app/c4-ontology-empty-bridge.mjs,readonly" \
  "$IMAGE" node /app/c4-ontology-empty-bridge.mjs >/dev/null

ready=0
for _ in $(seq 1 40); do
  if docker exec "$STUB_NAME" node -e '
    fetch("http://127.0.0.1:3040/api/ontology/health")
      .then(async response => {
        const body = await response.json();
        process.exit(
          response.ok && body.source === "campaign4-empty-snapshot" ? 0 : 1
        );
      })
      .catch(() => process.exit(1));
  ' >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 0.25
done
[[ "$ready" == 1 ]] || {
  printf 'Snapshot de ontologia nao ficou saudavel.\n' >&2
  exit 1
}

# A credencial existe somente em memoria; nao vai para arquivo nem argumento.
key_line="$(
  ssh -T minha-vps \
    'docker exec sti-backend sh -c '\''test -n "$OPENROUTER_API_KEY_GOOGLE" && printf "OPENROUTER_API_KEY_GOOGLE=%s\n" "$OPENROUTER_API_KEY_GOOGLE"'\'''
)"

[[ "$key_line" == OPENROUTER_API_KEY_GOOGLE=* ]]
[[ "$key_line" != *$'\n'* ]]
secret_value="${key_line#*=}"
[[ -n "$secret_value" ]]

printf '%s\n' "$key_line" |
docker run --rm \
  --name "$RUNNER_NAME" \
  --env-file /dev/stdin \
  --pull never \
  --network "$NET" \
  --platform linux/amd64 \
  --read-only \
  --user node \
  --workdir /app \
  --cap-drop ALL \
  --security-opt no-new-privileges=true \
  --pids-limit 256 \
  --memory 2g \
  --cpus 2 \
  --ulimit core=0:0 \
  --tmpfs /tmp:rw,noexec,nosuid,size=256m \
  -e C4_EXPECTED_IMAGE="$IMAGE" \
  -e C4_STATE_FILES=ctat-production-state-batch-01.json,ctat-production-state-batch-02.json,ctat-production-state-batch-03.json \
  -e C4_INPUT_DIR=/pilot/input \
  -e C4_OUTPUT_DIR=/pilot/out \
  -e C4_PROMPT_MANIFEST=/pilot/out/campaign4-real-pilot-preflight.json \
  -e C4_PROMPT_MANIFEST_SHA256=07b033161a2add1ad1ef79afa4209c7c5f0010e57e359ef1b62465eba4ce7ba8 \
  -e C4_SAFETY_MODULE=/app/c4-real-run-safety.mjs \
  -e C4_CONFIRMATION=EXECUTAR_PILOTO_REAL_3_ESTADOS_USD_2 \
  -e C4_BUDGET_USD=2 \
  -e C4_RUN_ID="$RUN_ID" \
  -e LLM_MAX_RETRIES=0 \
  -e STI_DISABLE_GENERATION_CACHE=1 \
  -e NODE_ENV=production \
  -e LOG_LEVEL=error \
  --mount "type=bind,src=$INPUT,dst=/pilot/input,readonly" \
  --mount "type=bind,src=$OUT,dst=/pilot/out" \
  --mount "type=bind,src=$RUNNER,dst=/app/campaign4-real-pilot-runner.mjs,readonly" \
  --mount "type=bind,src=$SAFETY,dst=/app/c4-real-run-safety.mjs,readonly" \
  "$IMAGE" node /app/campaign4-real-pilot-runner.mjs

if printf '%s\n' "$secret_value" | grep -R -F -q -f - "$OUT"; then
  printf 'BLOQUEIO: possivel credencial encontrada nos artefatos.\n' >&2
  exit 1
fi
unset key_line secret_value

RESULT="$OUT/campaign4-real-pilot.json"

jq -e '
  .schemaVersion == "educaoff-campaign4-real-runner-v2"
  and .status == "completed"
  and (.cases | length) == 3
  and (.invocations | length) == 9
  and .keyReadiness.status == "ready"
  and .safety.status == "completed"
  and .safety.planWorstCaseUsd == 1.782
  and .safety.spentUsd <= 2
  and .safety.reservedUsd == 0
  and (.safety.callPlan | length) == 9
  and all(.safety.callPlan[]; .status == "completed")
  and all(.invocations[];
      .status == "ok"
      and .attempt == 1
      and .fallbackUsed == false
      and .clientConfig.maxRetries == 0
      and ([.retryAttestation.after[] | select(. != null)] | all(. == 0))
      and .usage.estimated == false
      and .usage.promptTokens <= 20000
      and .usage.completionTokens <= .maxTokens
      and .costUsd >= 0
      and (.rawResponseSha256 | test("^[a-f0-9]{64}$"))
  )
  and all(.cases[];
      .graphForge.operational.runHashes[0]
        == .graphForge.operational.runHashes[1]
      and .graphForge.capacity3c.runHashes[0]
        == .graphForge.capacity3c.runHashes[1]
  )
' "$RESULT" >/dev/null

printf 'Piloto concluido e validado: %s\n' "$RESULT"
