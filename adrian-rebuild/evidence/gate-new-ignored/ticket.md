<!-- PL: Specyfikacja sprawdzenia bramki według D-105 (1), w kształcie ticket.md dla recenzji rebuild-reviewer; zmiana
nie ma numeru R-NNN, bo dotyczy narzędzi przebudowy, jak D-026. `gate.mjs` spisuje ignorowane pliki checkoutu poza
`node_modules/` (i bez plików wymiany edytora, D-032) przed i po `npm run check` i kończy się porażką, gdy bieg
zostawił nowy, z nazwą każdego takiego pliku. Stan: napisany 26.11 przez sesję główną `limen-rebuild-35`; przebieg
recenzji w review.md, wynik w outcome.md. -->

# The gate fails on a new ignored file in the checkout (D-105 (1))

## Problem

R-102's first tree had a test that wrote refusal files into `.limen/refusals/` at the repository root, a folder that
`.gitignore` ignores (`/.limen/`), so neither `git status`, the review guard nor any check of the suite saw them; the
gate stayed green and the files were found by a listing (R-102 `outcome.md` → Open points 5 and 6). `gate.mjs` runs
`npm run check` and exits with its code (`adrian-rebuild/tools/gate.mjs`); nothing compares the checkout before and
after the run.

Relied on (quoted):
- D-105 (1): "the gate checks that it leaves no new ignored file in the checkout (R-102 `outcome.md` → Open point 6)".
- R-102 `outcome.md` → Open point 6, option (b), the one D-105 takes: "`gate.mjs` compares the checkout's ignored
  files outside `node_modules/` before and after its run and fails on a new one, a `Tools:` commit with its test
  (recommended: a guarantee in code, z. 14, which finds the next such test in any ticket)".
- D-032: editor swap files (`.*.swp`) are ignored "so an open editor in `adrian-rebuild/` no longer fails `check.mjs`
  … or the review guard".
- Protocol step 4 (`## Agents`): "The main session runs `node adrian-rebuild/tools/gate.mjs` itself; its run counts".
- T-01: an error never vanishes; T-25 (1): one rule has one definition; T-29 (3): one test, one mechanism.

The session's reading (no source settles it): `node_modules/` is excluded at any depth, as the `.gitignore` pattern
`node_modules/` matches; editor swap files are excluded too, so that D-032's "an open editor must not fail" holds for
the gate as for `check.mjs`.

## Change

- `adrian-rebuild/tools/gate.mjs`: before `npm run check` it lists the checkout's ignored files (`git ls-files
  --others --ignored --exclude-standard`) outside `node_modules/` and without `.*.swp`; after the run it lists them
  again and prints `gate: the run left a new ignored file in the checkout: <path> (D-105)` for each path that is new.
  The exit code is `npm run check`'s when that is not 0, otherwise 1 when a new file is left, otherwise 0. A failed
  listing ends the gate with exit 1 and git's message. A file that existed before and changed is not new.
- `adrian-rebuild/tools/test-gate.mjs` (new): the gate on a fixture repository whose `check` script writes a given
  file: a new ignored file fails the gate and is named; a file in `node_modules/` (at the root and nested), a swap
  file and a changed ignored file that existed before do not; a failing `check` keeps its exit code.
- `adrian-rebuild/plan.md` → `## Commands` (the new test file in the main session's checks) and `## State`;
  `adrian-rebuild/evidence/gate-new-ignored/` (this folder).

## Out of scope

- New untracked files that are not ignored: `git status`, the review guard and the commit show them.
- An empty ignored directory a run leaves: git lists files, not directories.
- `fails-before.mjs`, which runs the tests on a copy of HEAD in the gate's private TMPDIR, not in the checkout.

## Acceptance

- AC-1: `node --test adrian-rebuild/tools/test-gate.mjs` → exit 0.
- AC-2: `node adrian-rebuild/tools/gate.mjs` → exit 0 (the suite leaves no new ignored file in this checkout).
- AC-3: `npx biome check --error-on-warnings adrian-rebuild` → exit 0; `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-4 (judgment): the gate fails, naming every new ignored file, whatever `npm run check`'s result; a failing check
  keeps its own exit code; the listing that decides is defined once in `gate.mjs`; a file in `node_modules/` or an
  editor swap file never fails the gate.

## Migration

None: no format on disk changes.

## Risk

1. A process outside the gate that creates an ignored file in the checkout during a run fails the gate. By day the
   session runs nothing beside its gate; a night's `night.mjs` creates its run log in `.night/` only before it starts
   `claude -p`, so not during the session's gate.
2. A test that writes an ignored file and removes it before the run ends is not seen; nothing is left, which is the
   property.

## Rollback

`git revert` of the commit `Tools: …` of this change.

## Decisions

Review round 1 (2026-11-26, `review.md` → Round 1; PASS with seven notes), the findings to fix, by the main session:
1. Note 1 (T-29 (3)): test 2 splits into one test for `node_modules/` and one for swap files; test 4 splits into one
   test that names the file when the check fails and one whose exit code is the check's.
2. Note 2: the listing gets `maxBuffer: 1 << 30`, as `fails-before.mjs` has, so a growing vendored tree cannot fail the
   gate with `ENOBUFS`.
3. Note 3: a git that cannot start (`result.error`) is checked before the exit status, so its message is shown.
4. Note 7: the test's environment sets `GIT_CEILING_DIRECTORIES` to the fixtures' root.

Review round 2 (2026-11-26, `review.md` → Round 2; PASS with two notes), the finding to fix, by the main session:
5. Note 1 (T-30): the comment on `maxBuffer` says the listing grows with the vendored sources and would one day
   outgrow the default buffer, not that it outgrows it today (186444 bytes).
