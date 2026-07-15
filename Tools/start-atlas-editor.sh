#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="${0:A:h}"
REPO_ROOT="${SCRIPT_DIR:h}"
ENTRYPOINT="$REPO_ROOT/Tools/atlas-editor/electron-main.cjs"
ELECTRON_BIN="$REPO_ROOT/node_modules/.bin/electron"
ELECTRON_APP="$REPO_ROOT/node_modules/electron/dist/Electron.app"
LOG_FILE="${TMPDIR:-/tmp}/btree-tool-atlas-editor.log"

cd "$REPO_ROOT"

if [[ ! -x "$ELECTRON_BIN" ]]; then
  echo "Electron dependency is missing; installing project dependencies..."
  npm install
fi

echo "Stopping previously running Atlas Editor instances..."
pkill -f "[E]lectron.*${ENTRYPOINT}" 2>/dev/null || true
pkill -f "[E]lectron.*Tools/atlas-editor/electron-main\.cjs" 2>/dev/null || true

echo "Building BTreeTool..."
npm run compile

echo "Testing and packaging BTreeTool..."
npm run package:vsix

echo "Starting Atlas Editor..."
: >"$LOG_FILE"

if [[ -d "$ELECTRON_APP" ]]; then
  open -na "$ELECTRON_APP" --args "$ENTRYPOINT"
else
  nohup "$ELECTRON_BIN" "$ENTRYPOINT" >"$LOG_FILE" 2>&1 &
fi

sleep 2
EDITOR_PID="$(pgrep -f "[E]lectron.*${ENTRYPOINT}" | head -n 1 || true)"
if [[ -z "$EDITOR_PID" ]]; then
  echo "Atlas Editor failed to start. See $LOG_FILE" >&2
  exit 1
fi

echo "Atlas Editor is running (PID $EDITOR_PID)."
echo "Log: $LOG_FILE"
