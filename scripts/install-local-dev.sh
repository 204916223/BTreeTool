#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
extensions_dir=${VSCODE_EXTENSIONS_DIR:-"$HOME/.vscode/extensions"}

extension_dir_name=$(
  node -e 'const fs = require("fs"); const path = require("path"); const pkg = JSON.parse(fs.readFileSync(path.join(process.argv[1], "package.json"), "utf8")); process.stdout.write(`${pkg.publisher}.${pkg.name}-${pkg.version}`);' \
    "$repo_root"
)

target_path="$extensions_dir/$extension_dir_name"

mkdir -p "$extensions_dir"

if [ -L "$target_path" ]; then
  current_target=$(readlink "$target_path")
  if [ "$current_target" = "$repo_root" ]; then
    echo "Already linked: $target_path -> $repo_root"
    echo "Run 'npm run compile' and then 'Developer: Reload Window' after code changes."
    exit 0
  fi

  rm "$target_path"
elif [ -e "$target_path" ]; then
  echo "Refusing to replace existing path: $target_path" >&2
  exit 1
fi

ln -s "$repo_root" "$target_path"

echo "Linked: $target_path -> $repo_root"
echo "Next step: restart VS Code once, then use 'Developer: Reload Window' after rebuilds."
