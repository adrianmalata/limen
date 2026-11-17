#!/bin/bash
# PL: Shim gita używany wyłącznie przez bramkę (gate-env.mjs), gdy lokalny git jest starszy niż 2.36 i nie zna
# PL: `git worktree list --porcelain -z`. Emuluje tę jedną flagę (zamienia znaki nowej linii na NUL),
# PL: a każde inne wywołanie przekazuje bez zmian do prawdziwego gita. Seat ma nowszego gita i shima nie potrzebuje.
#
# Emulates `git worktree list --porcelain -z` (git >= 2.36) on an older git; every other call execs the real git.
# The -z form ends each line with NUL instead of a newline, and the blank line between records becomes an extra NUL,
# so translating newlines is exact for paths without a newline in them.
self_dir=$(cd "$(dirname "$0")" && pwd)
real=
IFS=: read -r -a dirs <<<"$PATH"
for dir in "${dirs[@]}"; do
	if [[ $dir != "$self_dir" && -x $dir/git ]]; then
		real=$dir/git
		break
	fi
done
if [[ -z $real ]]; then
	echo "git shim: no real git on PATH outside $self_dir" >&2
	exit 127
fi
if [[ " $* " == *" worktree list "* && " $* " == *" -z "* ]]; then
	args=()
	for arg in "$@"; do
		[[ $arg == -z ]] || args+=("$arg")
	done
	"$real" "${args[@]}" | tr '\n' '\0'
	exit "${PIPESTATUS[0]}"
fi
exec "$real" "$@"
