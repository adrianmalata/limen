#!/bin/sh
# PL: Bramka testów przebudowy: uruchamia `npm run check` tak, żeby laptop (WSL2 Ubuntu 22.04) dał ten sam wynik co seat.
# PL: Ustawia prywatny TMPDIR, bo test S10 trzyma klucz GitHub App w katalogu testu, a poller słusznie odrzuca klucz
# PL: pod /tmp z prawami 1777. Gdy lokalny git nie zna `worktree list -z` (git < 2.36), podkłada shim z tego katalogu.
# PL: Niczego nie instaluje; stan: propozycja bramki do akceptacji na bramce 0 (evidence/baseline.md).
#
# The rebuild's test gate: `npm run check` plus two platform workarounds, each applied only when needed.
#  - TMPDIR: test plants hold a GitHub App key, and the poller refuses a key below a group- or world-writable
#    directory. Linux /tmp is mode 1777; macOS tmpdir is private, which is what the tests assume.
#  - git < 2.36 lacks `git worktree list -z`. Test plants put the node binary's directory before /usr/bin on PATH,
#    so the shim sits next to a hard link of node in node_modules/ (ignored by git, biome and the tests).
set -eu

repo=$(git rev-parse --show-toplevel)
tmp=${XDG_CACHE_HOME:-$HOME/.cache}/limen-rebuild-gate
mkdir -p "$tmp"
chmod 700 "$tmp"
TMPDIR=$tmp
export TMPDIR

if ! git -C "$repo" worktree list --porcelain -z >/dev/null 2>&1; then
	bin=$repo/node_modules/.rebuild-gate
	mkdir -p "$bin"
	node=$(command -v node)
	ln -f "$node" "$bin/node" 2>/dev/null || cp "$node" "$bin/node"
	cp "$repo/adrian-rebuild/tools/git-worktree-z-shim.sh" "$bin/git"
	chmod 755 "$bin/git"
	echo "gate: $(git --version) lacks 'worktree list -z'; the shim in $bin emulates it" >&2
	PATH=$bin:$PATH
	export PATH
fi

cd "$repo"
exec npm run check
