#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="${TMPDIR:-/tmp}/chatjs-ai-post-codegen"
LOCK_DIR="$STATE_DIR/runner.lock"
LOCK_PID_FILE="$LOCK_DIR/pid"
LOG_FILE="$STATE_DIR/last-run.log"
LOG_ROTATED_FILE="$STATE_DIR/last-run.log.1"
SOURCE_NAME="${1:-unknown}"
RUN_TIMEOUT_SECONDS="${AI_POST_CODEGEN_TIMEOUT_SECONDS:-600}"
MAX_LOG_BYTES="${AI_POST_CODEGEN_MAX_LOG_BYTES:-1048576}"

mkdir -p "$STATE_DIR"

rotate_log() {
  if [ ! -f "$LOG_FILE" ]; then
    return
  fi

  local log_size
  log_size="$(wc -c < "$LOG_FILE" | tr -d '[:space:]')"
  if [ "${log_size:-0}" -lt "$MAX_LOG_BYTES" ]; then
    return
  fi

  mv -f "$LOG_FILE" "$LOG_ROTATED_FILE"
}

run_with_timeout() {
  python3 - "$RUN_TIMEOUT_SECONDS" "$@" <<'PY'
import subprocess
import sys

timeout_seconds = int(sys.argv[1])
command = sys.argv[2:]

try:
    completed = subprocess.run(command, timeout=timeout_seconds)
except subprocess.TimeoutExpired:
    print(f"command timed out after {timeout_seconds}s: {' '.join(command)}", file=sys.stderr)
    sys.exit(124)

sys.exit(completed.returncode)
PY
}

acquire_lock() {
  if mkdir "$LOCK_DIR" 2>/dev/null; then
    printf '%s\n' "${BASHPID:-$$}" > "$LOCK_PID_FILE"
    return 0
  fi

  local existing_pid=""
  if [ -f "$LOCK_PID_FILE" ]; then
    existing_pid="$(cat "$LOCK_PID_FILE" 2>/dev/null || true)"
  fi

  if [ -n "$existing_pid" ] && kill -0 "$existing_pid" 2>/dev/null; then
    return 1
  fi

  rm -f "$LOCK_PID_FILE"
  rmdir "$LOCK_DIR" 2>/dev/null || return 1
  mkdir "$LOCK_DIR" 2>/dev/null || return 1
  printf '%s\n' "${BASHPID:-$$}" > "$LOCK_PID_FILE"
}

(
  if ! acquire_lock; then
    exit 0
  fi

  trap 'rm -f "$LOCK_PID_FILE"; rmdir "$LOCK_DIR"' EXIT
  rotate_log

  {
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] source=$SOURCE_NAME start"
    cd "$ROOT_DIR"

    if run_with_timeout bun run format &&
      run_with_timeout bun run test:types; then
      echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] source=$SOURCE_NAME success"
    else
      status=$?
      echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] source=$SOURCE_NAME failure exit_code=$status log=$LOG_FILE"
    fi
  } >>"$LOG_FILE" 2>&1
) >/dev/null 2>&1 &
