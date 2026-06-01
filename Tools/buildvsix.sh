#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd "$script_dir/.." && pwd)"
cd "$project_root"

name=""

while getopts ":n:h" opt; do
  case "$opt" in
    n)
      name="$OPTARG"
      ;;
    h)
      cat <<'EOF'
Usage: Tools/buildvsix.sh -n output-name
EOF
      exit 0
      ;;
    \?)
      echo "Unknown option: -$OPTARG" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$name" ]]; then
  name="btree-tool-v$(node -p "require('./package.json').version")"
fi

out="${name}.vsix"

npm test
rm -f "$out"
npx @vscode/vsce package --allow-missing-repository --out "$out"
