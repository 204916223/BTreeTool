#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
extensions_dir=${VSCODE_EXTENSIONS_DIR:-"$HOME/.vscode/extensions"}

extension_dir_name=$(
  node -e 'const fs = require("fs"); const path = require("path"); const pkg = JSON.parse(fs.readFileSync(path.join(process.argv[1], "package.json"), "utf8")); process.stdout.write(`${pkg.publisher}.${pkg.name}-${pkg.version}`);' \
    "$repo_root"
)

target_path="$extensions_dir/$extension_dir_name"
obsolete_file="$extensions_dir/.obsolete"

clear_obsolete_marker() {
  if [ ! -f "$obsolete_file" ]; then
    return
  fi

  node -e '
const fs = require("fs");
const file = process.argv[1];
const key = process.argv[2];
const raw = fs.readFileSync(file, "utf8").trim();
if (!raw) {
  process.exit(0);
}
const data = JSON.parse(raw);
if (Object.prototype.hasOwnProperty.call(data, key)) {
  delete data[key];
  fs.writeFileSync(file, JSON.stringify(data));
}
' "$obsolete_file" "$extension_dir_name"
}

mkdir -p "$extensions_dir"

if [ -L "$target_path" ]; then
  current_target=$(readlink "$target_path")
  if [ "$current_target" = "$repo_root" ]; then
    clear_obsolete_marker
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
clear_obsolete_marker

echo "Linked: $target_path -> $repo_root"
echo "Next step: restart VS Code once, then use 'Developer: Reload Window' after rebuilds."
