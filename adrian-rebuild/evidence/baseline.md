<!-- PL: Wynik bramki bazowej na tagu rebuild-base (etap 0, krok 4): czas i wynik `npm run check`, klasyfikacja każdego
błędu jako platformowy albo defekt oraz proponowana bramka `tools/gate.sh`. Wszystkie 37 czerwonych testów mają dwie
przyczyny platformowe (git 2.34 bez `worktree list -z` i /tmp z prawami 1777); defektów produktu nie znaleziono.
Stan: bramka z obejściami jest zielona w dwóch przebiegach (83/83); jej przyjęcie czeka na decyzję Adriana. -->

# Baseline gate at `rebuild-base` (stage 0)

Laptop: WSL2 Ubuntu 22.04, Node 26.13.1, git 2.34.1 (see `env.md`). `npm ci`: exit 0 in 4.7 s.

## Runs

| # | Command | Exit | Wall | Tests (pass / fail / cancelled of total) |
|---|---|---|---|---|
| 1 | `npm run check` | 1 | 553 s | 37 / 34 / 3 of 74; `tsc` and `biome` green (biome checked 162 files) |
| 2 | test step of `check` with the `worktree list -z` shim on PATH | 1 | 73 s | 82 / 1 / 0 of 83 |
| 3 | `test/s10-doorbell.test.ts` alone, shim, default `TMPDIR` | 1 | <1 s | 0 / 1 |
| 4 | `test/s10-doorbell.test.ts` alone, shim, private `TMPDIR` (mode 700 under `$HOME`) | 0 | 7 s | 1 / 0 |
| 5 | `sh adrian-rebuild/tools/gate.sh` (`tsc` + `biome` + tests) | 0 | 79 s | 83 / 0 / 0 of 83; biome checked 162 files |
| 6 | `sh adrian-rebuild/tools/gate.sh` (repeat, rule 17) | 0 | 88 s | 83 / 0 / 0 of 83 |

Run 1 counts 74 tests, run 2 counts 83: in run 1, `s6-keeper` and `s7-webhooks` fail at file level, so their tests are
not counted. The three cancelled tests in run 1 are the three `s8-groups` tests that hit the 180 s timeout; they cost
most of the 553 s.

## Classification

Each run differs from the previous one by one change, so each class is shown by a differential run.

| Class | Cause | Evidence | Tests | Verdict |
|---|---|---|---|---|
| P1 | git 2.34.1 has no `git worktree list --porcelain -z` (added in git 2.36); Limen calls it at `src/project/git.ts:174` | run 1: `error: unknown switch 'z'` in 22 failures, the rest are its cascades (no worktree → spawn, land, group and keeper steps fail or time out); run 2 differs only by the shim and 36 of the 37 failures pass | 36 of the 37 red entries of run 1 (33 failed + 3 cancelled) | platform: the seat's git (Ubuntu 26.04) is newer |
| P2 | `limen github poll` refuses an App key or state directory below a group- or world-writable directory (`src/integrations/github-poller.ts:125-136`, ancestor walk with `mode & 0o022`); test plants live in `os.tmpdir()`, which is `/tmp` (mode 1777) on Linux with `TMPDIR` unset | the poller's stderr in run 3: `unsafe owner or permissions on /tmp`; run 4 differs only by `TMPDIR` and passes | S10 (`test/s10-doorbell.test.ts:99`) | platform: the test assumes a private tmpdir, as macOS has; the poller's refusal is intended behaviour |

No failure is a product defect. Two observations go to the stage 2 audit as questions, not findings:
- the S10 test only passes where `os.tmpdir()` has no group- or world-writable ancestor, so on a stock Linux host it
  fails unless `TMPDIR` is set;
- Limen needs git ≥ 2.36 but neither `package.json` nor a runtime check says so; on an older git, `limen spawn` fails
  with git's usage text.

## Proposed gate

`sh adrian-rebuild/tools/gate.sh` runs `npm run check` with:
- `TMPDIR` set to a private directory (mode 700) in the user cache directory (fixes P2);
- only when `git worktree list -z` fails: `tools/git-worktree-z-shim.sh` as `git`, next to a hard link of `node` in
  `node_modules/.rebuild-gate/`, because test plants put the node binary's directory before `/usr/bin` on `PATH`
  (fixes P1). The shim rewrites newlines to NUL for that one call and passes every other call to the real git.

Nothing is installed; the helper directory is under `node_modules/`, which `npm ci` recreates and git, biome and the
tests ignore. The alternative is upgrading git in WSL (a system package), which removes the shim but is Adrian's call
on a work laptop.
