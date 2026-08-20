#!/usr/bin/env bash
# Alias histórico do retomador: hoje executa a cadeia portável completa.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/cadeia-712.sh"
