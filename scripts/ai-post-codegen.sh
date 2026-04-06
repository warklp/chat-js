#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="${TMPDIR:-/tmp}/chatjs-ai-post-codegen"
LOCK_DIR="$STATE_DIR/runner.lock"
LOG_FILE="$STATE_DIR/last-run.log"
SOURCE_NAME="${1:-unknown}"

mkdir -p "$STATE_DIR"

(
  if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    exit 0
  fi

  trap 'rmdir "$LOCK_DIR"' EXIT

  {
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] source=$SOURCE_NAME start"
    cd "$ROOT_DIR"
    bun run format
    bun run test:types
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] source=$SOURCE_NAME success"
  } >>"$LOG_FILE" 2>&1
) >/dev/null 2>&1 &
