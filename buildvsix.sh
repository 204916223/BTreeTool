#!/usr/bin/env bash
set -euo pipefail

name=""

while getopts ":n:h" opt; do
  case "$opt" in
    n)
      name="$OPTARG"
      ;;
    h)
      cat <<'EOF'
Usage: ./buildvsix.sh -n output-name
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
