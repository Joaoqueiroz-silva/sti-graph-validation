#!/usr/bin/env bash
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"

node analysis/reanalyze-campaign4-public.mjs --write
node analysis/aggregate-campaign4.mjs --write
node analysis/campaign4-batch-cluster-sensitivity.mjs --write
node analysis/correct-campaign4-judge-degeneracy.mjs --write
node analysis/build-campaign4-completion-manifest.mjs --write
node analysis/validate-article-v6.mjs
