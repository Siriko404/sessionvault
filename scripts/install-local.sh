#!/usr/bin/env bash
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT="${SESSIONVAULT_HOME:-$HOME/.local/share/sessionvault}"
BIN_DIR="${SESSIONVAULT_BIN_DIR:-$HOME/.local/bin}"
APP="$ROOT/app"
STAGE="$ROOT/.app.staging.$$"
BACKUP="$ROOT/.app.backup.$$"
DESKTOP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
DESKTOP="$DESKTOP_DIR/sessionvault.desktop"

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing required command: $1" >&2; exit 1; }; }
need node; need npm; need tar; need flock
node -e 'const n=Number(process.versions.node.split(".")[0]); if(n<24){console.error("SessionVault requires Node 24+");process.exit(1)}'

mkdir -p "$ROOT" "$BIN_DIR" "$DESKTOP_DIR"
chmod 700 "$ROOT" 2>/dev/null || true
rm -rf "$STAGE" "$BACKUP"
mkdir -p "$STAGE"
cleanup() { rm -rf "$STAGE" "$BACKUP"; }
trap cleanup EXIT

# Copy the verified checkout without generated or VCS state.
tar -C "$SRC" --exclude='.git' --exclude='node_modules' --exclude='dist' --exclude='.DS_Store' -cf - . | tar -C "$STAGE" -xf -
(
  cd "$STAGE"
  npm ci
  npm run build
  npm run verify:release
)

if [[ -d "$APP" ]]; then mv "$APP" "$BACKUP"; fi
mv "$STAGE" "$APP"
rm -rf "$BACKUP"

install -m 755 "$APP/packaging/sessionvault-control.sh" "$ROOT/sessionvault-control.sh"
install -m 755 "$APP/packaging/sessionvault-app.sh" "$ROOT/sessionvault-app.sh"
install -m 755 "$APP/packaging/sessionvault-window.py" "$ROOT/sessionvault-window.py"
install -m 755 "$APP/packaging/sessionvault-verify.mjs" "$ROOT/sessionvault-verify.mjs"
ln -sfn "$ROOT/sessionvault-control.sh" "$BIN_DIR/sessionvault"
ln -sfn "$ROOT/sessionvault-app.sh" "$BIN_DIR/sessionvault-app"

cat > "$DESKTOP" <<DESKTOP_EOF
[Desktop Entry]
Type=Application
Name=SessionVault
Comment=Local AI coding-session history
Exec=$ROOT/sessionvault-app.sh
Icon=$APP/public/icon.svg
Terminal=false
Categories=Development;Utility;
StartupNotify=true
DESKTOP_EOF
chmod 644 "$DESKTOP"

printf 'SessionVault installed.\nCommand: %s/sessionvault\nData: %s\n' "$BIN_DIR" "$ROOT"
printf 'The installer did not start a server or open a browser. Run: sessionvault verify\n'
