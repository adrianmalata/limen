#!/bin/sh
# PL: Test hooka pre-push bez sieci: buduje tymczasowe repo z trzema commitami i podaje hookowi na stdin linie
# PL: dla każdego przypadku, sprawdzając kod wyjścia. Obejmuje cztery przypadki z promptu (push main, usunięcie
# PL: gałęzi, push nie fast-forward, poprawny push adrian-rebuild) i kilka dodatkowych (tag, nowa gałąź, obcy URL).
# PL: Domyślnie testuje źródło tools/pre-push; ścieżka w argumencie pozwala sprawdzić zainstalowaną kopię.
set -eu
GIT_CONFIG_GLOBAL=/dev/null
GIT_CONFIG_NOSYSTEM=1
export GIT_CONFIG_GLOBAL GIT_CONFIG_NOSYSTEM

hook=${1:-$(cd "$(dirname "$0")" && pwd)/pre-push}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

g() {
	git -C "$work" -c user.name=test -c user.email=test@example.invalid "$@"
}
g init -q
g commit -q --allow-empty -m base
base=$(g rev-parse HEAD)
g commit -q --allow-empty -m next
next=$(g rev-parse HEAD)
g checkout -q -b side "$base"
g commit -q --allow-empty -m side
side=$(g rev-parse HEAD)
zero=0000000000000000000000000000000000000000
unknown=1111111111111111111111111111111111111111
ok_url=https://github.com/adrianmalata/limen.git
branch=refs/heads/adrian-rebuild
failed=0

# check <expected exit: 0 | nonzero> <name> <url> <stdin lines>
check() {
	if printf '%s\n' "$4" | (cd "$work" && "$hook" origin "$3") >/dev/null 2>&1; then
		got=0
	else
		got=nonzero
	fi
	if [ "$got" = "$1" ]; then
		echo "ok   $2 (exit $got)"
	else
		echo "FAIL $2: expected exit $1, got $got"
		failed=1
	fi
}

check nonzero "push to main" "$ok_url" "refs/heads/main $next refs/heads/main $base"
check nonzero "delete adrian-rebuild" "$ok_url" "(delete) $zero $branch $base"
check nonzero "non-fast-forward adrian-rebuild" "$ok_url" "$branch $side $branch $next"
check 0 "fast-forward adrian-rebuild" "$ok_url" "$branch $next $branch $base"
check 0 "create adrian-rebuild" "$ok_url" "$branch $base $branch $zero"
check 0 "HEAD:adrian-rebuild over ssh" "git@github.com:adrianmalata/limen.git" "HEAD $next $branch $base"
check nonzero "push a tag" "$ok_url" "refs/tags/rebuild-base $base refs/tags/rebuild-base $zero"
check nonzero "upstream URL" "https://github.com/overment/limen.git" "$branch $next $branch $base"
check nonzero "remote tip unknown locally" "$ok_url" "$branch $next $branch $unknown"
check nonzero "valid line plus main" "$ok_url" "$branch $next $branch $base
refs/heads/main $next refs/heads/main $base"
check nonzero "malformed line" "$ok_url" "$branch $next $branch"

exit "$failed"
