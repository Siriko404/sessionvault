#!/usr/bin/env bash
set -euo pipefail

ROOT="${SESSIONVAULT_HOME:-$HOME/.local/share/sessionvault}"
APP="$ROOT/app"
RUN="$ROOT/run"
PIDFILE="$RUN/server.pid"
LOG="$ROOT/sessionvault.log"
URL="${SESSIONVAULT_URL:-http://127.0.0.1:5191}"
mkdir -p "$RUN"
chmod 700 "$ROOT" "$RUN" 2>/dev/null || true

pid_value() {
  [[ -f "$PIDFILE" ]] || return 1
  local pid
  pid="$(cat "$PIDFILE" 2>/dev/null || true)"
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  printf '%s' "$pid"
}

alive() {
  local pid cwd cmd
  pid="$(pid_value)" || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  if [[ -e "/proc/$pid/cwd" ]]; then
    cwd="$(readlink -f "/proc/$pid/cwd" 2>/dev/null || true)"
    [[ "$cwd" == "$(readlink -f "$APP")" ]] || return 1
  fi
  if [[ -r "/proc/$pid/cmdline" ]]; then
    cmd="$(tr '\0' ' ' <"/proc/$pid/cmdline" 2>/dev/null || true)"
    [[ "$cmd" == *"vite"*"preview"* ]] || return 1
  fi
  return 0
}

wait_ready() {
  for _ in $(seq 1 150); do
    if ! alive; then
      echo "SessionVault server exited during startup. See $LOG" >&2
      return 1
    fi
    if node -e "fetch('$URL/api/sources').then(async r=>{if(!r.ok)process.exit(1);const j=await r.json();process.exit(j.claude&&j.codex&&j.opencode&&j.cline?0:1)}).catch(()=>process.exit(1))" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.2
  done
  echo "SessionVault did not become ready. See $LOG" >&2
  return 1
}

start_server() {
  if alive; then
    echo "SessionVault already running at $URL"
    return 0
  fi

  [[ -d "$APP/dist" ]] || { echo "SessionVault is not built. Run sessionvault-install.sh first." >&2; exit 1; }
  [[ -x "$APP/node_modules/.bin/vite" ]] || { echo "SessionVault dependencies are missing. Run sessionvault-install.sh first." >&2; exit 1; }
  rm -f "$PIDFILE"
  (
    cd "$APP"
    # The config also sets preview.open=false. No lifecycle command relies on
    # a browser opener; only the explicit `sessionvault open` action below does.
    nohup ./node_modules/.bin/vite preview --host 127.0.0.1 --port 5191 --strictPort >"$LOG" 2>&1 &
    echo $! >"$PIDFILE"
  )
  if ! wait_ready; then
    rm -f "$PIDFILE"
    return 1
  fi
  echo "SessionVault running at $URL"
}

stop_server() {
  if alive; then
    local pid
    pid="$(pid_value)"
    kill "$pid" 2>/dev/null || true
    for _ in $(seq 1 40); do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.1
    done
    kill -9 "$pid" 2>/dev/null || true
  fi
  rm -f "$PIDFILE"

  # Kill only residual Vite preview processes rooted in this SessionVault install.
  if pgrep -f "[p]vhist/app/node_modules/vite.*preview" >/dev/null 2>&1; then
    pkill -f "[p]vhist/app/node_modules/vite.*preview" 2>/dev/null || true
    sleep 0.2
  fi

  echo "SessionVault stopped."
}

case "${1:-start}" in
  start)
    start_server
    ;;
  stop)
    stop_server
    ;;
  restart)
    stop_server >/dev/null || true
    start_server
    ;;
  status)
    if alive; then echo "running $(pid_value) $URL"; else echo "stopped"; fi
    ;;
  open)
    # This is the ONLY lifecycle command that intentionally touches the user's
    # default browser, because the user explicitly asked for `sessionvault open`.
    alive || start_server >/dev/null
    if command -v xdg-open >/dev/null 2>&1; then
      xdg-open "$URL" >/dev/null 2>&1 || true
    else
      echo "$URL"
    fi
    ;;
  verify)
    alive || start_server >/dev/null
    node "$ROOT/sessionvault-verify.mjs"
    ;;
  reindex)
    stop_server >/dev/null || true
    INDEX_DIR="${SESSIONVAULT_INDEX_DIR:-$HOME/.cache/sessionvault}"
    rm -f "$INDEX_DIR/search.sqlite" "$INDEX_DIR/search.sqlite-wal" "$INDEX_DIR/search.sqlite-shm"
    start_server
    echo "Search index reset; a fresh background index has started."
    ;;
  log)
    tail -n 200 "$LOG"
    ;;
  *)
    echo "usage: sessionvault {start|stop|restart|status|open|verify|reindex|log}" >&2
    exit 2
    ;;
esac
