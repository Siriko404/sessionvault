#!/usr/bin/env bash
set -euo pipefail
ROOT="${SESSIONVAULT_HOME:-$HOME/.local/share/sessionvault}"
BIN_DIR="${SESSIONVAULT_BIN_DIR:-$HOME/.local/bin}"
DESKTOP="${XDG_DATA_HOME:-$HOME/.local/share}/applications/sessionvault.desktop"

if [[ -x "$ROOT/sessionvault-control.sh" ]]; then "$ROOT/sessionvault-control.sh" stop >/dev/null 2>&1 || true; fi
for link in "$BIN_DIR/sessionvault" "$BIN_DIR/sessionvault-app"; do
  if [[ -L "$link" ]]; then
    target="$(readlink "$link" || true)"
    [[ "$target" == "$ROOT/"* ]] && rm -f "$link"
  fi
done
if [[ -f "$DESKTOP" ]] && grep -Fq "$ROOT/sessionvault-app.sh" "$DESKTOP"; then rm -f "$DESKTOP"; fi
rm -rf "$ROOT"
echo "SessionVault removed. AI-agent transcript stores and source checkouts were not touched."
