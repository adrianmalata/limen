#!/bin/sh
# PL: Test strażnika recenzji bez sieci: buduje tymczasowe repo z jednym commitem i zmienionym plikiem, robi snapshot
# PL: i sprawdza, że `compare` wykrywa drugą edycję już zmienionego pliku, nowy plik nieśledzony, zmianę indeksu
# PL: i nowy commit (kod 1), a przepuszcza drzewo bez zmian (kod 0). Sprawdza też, że `diff` zawiera plik nieśledzony.
# PL: Stan: działa.
set -eu
GIT_CONFIG_GLOBAL=/dev/null
GIT_CONFIG_NOSYSTEM=1
export GIT_CONFIG_GLOBAL GIT_CONFIG_NOSYSTEM

guard=$(cd "$(dirname "$0")" && pwd)/review-guard.mjs
work=$(mktemp -d)
snap=$(mktemp)
trap 'rm -rf "$work" "$snap"' EXIT
cd "$work"
g() {
	git -c user.name=test -c user.email=test@example.invalid "$@"
}
g init -q
printf 'one\n' >tracked.txt
g add tracked.txt
g commit -q -m base
printf 'two\n' >tracked.txt
failed=0

expect() {
	want=$1
	name=$2
	set +e
	node "$guard" compare "$snap" >/dev/null 2>&1
	got=$?
	set -e
	if [ "$got" -eq "$want" ]; then
		echo "ok   $name (exit $got)"
	else
		echo "FAIL $name (exit $got, want $want)"
		failed=1
	fi
}

node "$guard" snapshot >"$snap"
expect 0 "unchanged tree"

printf 'three\n' >tracked.txt
expect 1 "second edit of an already modified file"
printf 'two\n' >tracked.txt
expect 0 "edit reverted"

printf 'new\n' >untracked.txt
expect 1 "new untracked file"
node "$guard" diff | grep -q '^+++ b/untracked.txt$' && echo "ok   diff carries the untracked file" || {
	echo "FAIL diff misses the untracked file"
	failed=1
}
rm untracked.txt
expect 0 "untracked file removed"

g add tracked.txt
expect 1 "index change"
g reset -q tracked.txt
expect 0 "index restored"

g commit -q -am change
expect 1 "new commit"

exit "$failed"
