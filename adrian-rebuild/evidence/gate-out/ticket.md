<!-- PL: Specyfikacja zmiany bramki według D-130, w kształcie ticket.md dla recenzji rebuild-reviewer; bez numeru R-NNN,
bo dotyczy narzędzi przebudowy, jak D-105 (1). `gate.mjs --out <plik>` zapisuje całe wyjście `npm run check` (stdout
i stderr w kolejności) i własne linie bramki atomowo do pliku, z niezmienionym kodem wyjścia, żeby test, który padł,
dało się nazwać (D-029). Stan: napisany 27.11 przez sesję główną `limen-rebuild-41`; przebieg recenzji w review.md,
wynik w outcome.md; dwie rundy poprawek (F1–F3, G1–G5). -->

# The gate writes its whole output to a file with `--out` (D-130)

## Problem

In the night of 2026-11-26/27 the main session's gate on R-042's tree exited 1, and its failing test is unknown: the
Bash tool cut the output before the failing test and the summary and kept no copy, and no allowed command saves the
gate's output (no redirection, D-016; `gate.mjs` has no `--out`). R-042 `ticket.md` → Decision 12; `.night/questions.md`
→ Q-91.

Relied on (quoted):
- D-130: "`gate.mjs` gains `--out <file>`: the whole output of `npm run check` and the gate's own lines, written
  atomically (D-018), with its exit code unchanged; built by the main session with its test and reviewed by
  `rebuild-reviewer` (a `Tools:` commit, as D-105 (1)); Adrian adds `node adrian-rebuild/tools/gate.mjs --out <file>`
  to `.claude/settings.local.json`."
- D-018: "the tools of `tools/` that wrote their result through `>` take `--out <file>` and write it atomically"
  (`adrian-rebuild/tools/atomic-write.mjs`: `writeAtomic`, `takeOut`).
- D-029: a test that failed once without a change of the code it runs is a finding, and nobody runs it again to get a
  green gate; a finding needs the test's name.
- D-105 (1): the gate fails on a new ignored file that its run leaves in the checkout, naming each.
- Protocol step 4 (`## Agents`): "The main session runs `node adrian-rebuild/tools/gate.mjs` itself; its run counts".
- T-01: an error never vanishes; T-25 (1): one rule has one definition; T-29 (3): one test, one mechanism.

## Change

- `adrian-rebuild/tools/atomic-write.mjs`: `writeAtomicWith(path, fill)`, the atomic write of `writeAtomic` with the
  content written by `fill(fd, temp)` into the open temporary file (a child process's output), returning `fill`'s
  value; `writeAtomic` becomes `writeAtomicWith` with `writeFileSync`, so the pattern has one definition (T-25 (1)).
- `adrian-rebuild/tools/gate.mjs`: `--out <file>` (read by `takeOut`). With it, `npm run check` writes its stdout and
  stderr into the temporary file of `<file>` (one descriptor, so their order is kept), the gate appends its own lines
  (the signal that ended the check, each new ignored file) and a last line `gate: exit <code>`, and the file appears
  whole by the rename; the gate prints its own lines to stderr as today and ends with `gate: exit <code>; the whole
  output is in <file>`. The exit code is the same as without `--out`. The temporary file is not a new ignored file of
  the run. Without `--out` only the failed listing after the check changes (Decision 2, F1): it is a gate line and
  exit 1, or the check's code when that is not 0. `--out` without a file, or any other argument, refuses before the
  check runs; an earlier run's file at `<file>` is removed first, so a run that ends before its rename leaves none.
- `adrian-rebuild/tools/test-gate.mjs`: the fixture's check also prints given lines to stdout and stderr; three tests:
  the file holds the check's output in order, the gate's lines and the exit line, with the exit code kept; `--out`
  into an ignored folder of the checkout leaves no new ignored file; `--out` without a file refuses and runs nothing.
- `plan.md` → `## Commands`: `node adrian-rebuild/tools/gate.mjs --out <file>` in the rows of the main session and the
  implementer; `## Agents` → protocol step 4 names the form for a gate whose output the session must read.

## Out of scope

- The allow-list entry in `.claude/settings.local.json`: Adrian's (the sessions never change their own permissions).
- `fails-before.mjs`'s 40-line tail (R-111 `outcome.md` → Open point 8): a later `Tools:` change if Adrian wants it.
- R-042's gate run itself: after this commit and Adrian's entry (D-130).

## Acceptance

- AC-1: `node --test adrian-rebuild/tools/test-gate.mjs` → exit 0.
- AC-2: `node --test adrian-rebuild/tools/test-review-guard.mjs` → exit 0 (the atomic writer's tests).
- AC-3: the three new tests fail with the `gate.mjs` and `atomic-write.mjs` of `HEAD` (run by the main session on a
  copy of `HEAD` with the new test file, recorded in `outcome.md`).
- AC-4: `npx biome check --error-on-warnings adrian-rebuild` → exit 0; `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-5 (judgment): the file holds everything the check printed, in order, and the gate's lines; the exit code with
  `--out` equals the one without; a failure inside the write (a listing that fails) still fails the gate and leaves no
  temporary file.

## Migration

None: no file format changes. The run without `--out` changes only where `## Change` says (a failed listing after
the check is a gate line that keeps the check's code; another argument refuses with exit 2).

## Risk

- A run cut by a signal leaves the temporary file in the target's folder (no rename); the next run is unaffected, and
  in `node_modules/.rebuild-review/` it is ignored by the gate's listing.

## Rollback

`git revert` of this `Tools:` commit; nothing on disk changes.

## Decisions

1. 2026-11-27 D-130 (Adrian: "dla Q-91 wybieram rekomendację").
2. 2026-11-27 review round 1 (`review.md`; void by the guard, its findings checked by the main session), fixed by the
   main session, each with a test that a mutation fails:
   - F1: a listing that fails after the check no longer throws inside the write: `verdict` says git's message as a gate
     line and returns 1 (or the check's code when that is not 0), so the `--out` file keeps the check's whole output;
     a test removes `.git` during the check and finds the output, the message and `gate: exit 1` in the file and no
     temporary file beside it.
   - F2: the order test prints stdout, stderr, stdout, so a capture that joins stdout before stderr fails it.
   - F3: the lines over 120 columns are wrapped (T-27).
3. 2026-11-27 review round 2 (`review.md`), the last round of fixes, by the main session, each new test failing at
   `HEAD` and under a mutation of the changed `gate.mjs`:
   - G1: the two lines over 120 columns (a tab as two) are wrapped.
   - G2: the fixture's comment says that it prints the given lines.
   - G3: a test that a failing check's code wins over a listing that fails after it, in the form without `--out`.
   - G4: any argument but `--out <file>` refuses with exit 2 and the usage, before the check runs.
   - G5: with `--out`, an earlier run's file at `<file>` is removed first, so a run that ends before its rename leaves
     no file to be read as its own.
