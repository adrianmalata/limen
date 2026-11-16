#!/bin/sh
# PL: Instaluje śledzony hook tools/pre-push do katalogu hooków bieżącego klonu (z uwzględnieniem core.hooksPath)
# PL: i sprawdza, że zainstalowana kopia jest identyczna ze źródłem. Uruchamiasz go po każdym nowym klonie albo
# PL: przeniesieniu repo, bo .git/hooks/ nie jest śledzony. Stan: działający.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
target=$(git -C "$here" rev-parse --path-format=absolute --git-path hooks/pre-push)
mkdir -p "$(dirname "$target")"
cp "$here/pre-push" "$target"
chmod 755 "$target"
cmp -s "$here/pre-push" "$target"
echo "installed $target"
