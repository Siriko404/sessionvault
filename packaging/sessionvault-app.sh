#!/usr/bin/env bash
# SessionVault desktop-app entry point (Omarchy launcher).
# Starts only the loopback server + in-process GTK/WebKit window and guarantees
# shutdown when the window or wrapper exits. It never launches a terminal or a
# browser.
set -euo pipefail

ROOT="${SESSIONVAULT_HOME:-$HOME/.local/share/sessionvault}"
CTL="$ROOT/sessionvault-control.sh"
URL="${SESSIONVAULT_URL:-http://127.0.0.1:5191}"
RUN="$ROOT/run"
LOCK="$RUN/app.lock"
mkdir -p "$RUN"

command -v python3 >/dev/null 2>&1 || { echo "python3 is required." >&2; exit 1; }
command -v flock >/dev/null 2>&1 || { echo "flock is required." >&2; exit 1; }
[[ -x "$CTL" ]] || { echo "sessionvault-control.sh is missing or not executable." >&2; exit 1; }
[[ -f "$ROOT/sessionvault-window.py" ]] || { echo "sessionvault-window.py is missing." >&2; exit 1; }

# Single instance: a repeated launcher activation while SessionVault is already open
# does not create a second window or interfere with the live instance.
exec 9>"$LOCK"
if ! flock -n 9; then
  exit 0
fi

cleanup() {
  "$CTL" stop >/dev/null 2>&1 || true
  if pgrep -f "[p]vhist/app/node_modules/vite.*preview" >/dev/null 2>&1; then
    pkill -f "[p]vhist/app/node_modules/vite.*preview" 2>/dev/null || true
  fi
  rm -f "$ROOT/run/server.pid"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP

"$CTL" start >/dev/null

echo "$(date -Is) launcher: starting app window" >>"$ROOT/app-launch.log"
set +e
python3 "$ROOT/sessionvault-window.py" "$URL"
window_status=$?
set -e
echo "$(date -Is) launcher: window closed, stopping server" >>"$ROOT/app-launch.log"

exit "$window_status"
