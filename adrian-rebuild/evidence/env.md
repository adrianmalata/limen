<!-- PL: Środowisko, w którym prowadzona jest przebudowa (etap 0, krok 1–3): stan repo, końce linii i wersje narzędzi
na laptopie (WSL2), wraz z różnicami względem seata, które wpływają na testy. Ścieżki domowe i tożsamości są
pominięte, bo repo jest publiczne. Stan: zebrane 2026-11-16; 20.11 git 2.56.1 z Linuxbrew na PATH (D-060), a
/usr/bin/git nadal 2.34.1. -->

# Environment (stage 0)

Collected 2026-11-16 on the laptop, in the session that runs the rebuild.

## Repository

| Check | Result |
|---|---|
| `git remote -v` | `origin` = `https://github.com/adrianmalata/limen` (fetch and push); no remote points at `overment/limen`, so there is no push URL to disable |
| `git rev-parse HEAD` | `3b5edd7c80105723eae9ac0729076d362deb3feb`, the expected HEAD (`overment/limen` `f1e3a54` + `2b8006f` seat extensions + merge) |
| `git status --porcelain` | only `?? adrian-rebuild/`, which then held only `input/` |
| Branch and tag | `adrian-rebuild` created on `3b5edd7`; local tag `rebuild-base` → `3b5edd7` |
| Commit identity | repo-local `user.name`/`user.email` set to the GitHub noreply identity of commit `2b8006f`, because the laptop's global identity is a work identity and the repo is public |

## Line endings

| Check | Result |
|---|---|
| `git config core.autocrlf` | `false` (repo-local) |
| `git ls-files --eol` | 973 `i/lf w/lf`, 95 `-text` (binary), 8 `none` (empty files), 0 CRLF in index or working tree |

No CRLF anywhere, so no re-clone is needed.

## Tools

| Tool | Laptop | Seat (from the prompt, not verified here) | Effect |
|---|---|---|---|
| Platform | Windows + WSL2 (`wsl.exe -l -v`: `Ubuntu`, running, version 2), kernel `6.18.58.1-microsoft-standard-WSL2`, x86_64 | Ubuntu 26.04 LTS VPS | Linux in both; the tests' `process.platform === "linux"` paths run |
| Distribution | Ubuntu 22.04.4 LTS | Ubuntu 26.04 LTS | older system packages on the laptop, see git |
| Filesystem of the clone | ext4 inside WSL (not `/mnt/c`) | — | no Windows path or permission translation |
| Shell | zsh 5.9 interactive; `/bin/sh` → dash; bash 5.1.16 | — | hooks and tools are POSIX `sh` |
| Node | v26.13.1 (nvm, user-local) | root 24, worker 26 | satisfies `engines.node >=24`; the root's Node 24 is not exercised here |
| npm | 11.20.0 | — | `npm ci` adds 6 packages in 4.7 s, 0 vulnerabilities |
| git | 2.34.1 | newer (Ubuntu 26.04 package) | **lacks `git worktree list -z` (added in 2.36)**; see `baseline.md` |
| Herdr, Pi | not installed | Herdr 0.9.3, Pi 1.2.0 + bridge 5.0.3 | tests use `test/fake-engine.mjs` and fake Herdr scripts |
| `/tmp` | `root:root 1777`, `TMPDIR` unset | not known | breaks S10, see `baseline.md` |
| CPU / RAM | 12 / 15 GiB | 6 vCPU / 11 GiB | — |
| GitHub credentials | HTTPS via the `gh` credential helper (global git config) | — | used only for `git push origin adrian-rebuild` |

Update of 2026-11-20 (D-060): git 2.56.1 from Linuxbrew is the first `git` on PATH, so `git worktree list -z` works
in the session's shell; `/usr/bin/git` is still 2.34.1, which a test plant's fixed PATH reaches unless the plant links
the runner's git (R-020).
