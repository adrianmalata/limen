<!-- PL: Wynik zmiany `gate.mjs --out` (D-130), zrobionej przez sesję główną `limen-rebuild-41` 27.11: bramka z `--out
<plik>` zapisuje całe wyjście `npm run check` w kolejności, własne linie i kod wyjścia atomowo do pliku, także gdy
lista plików po biegu się nie uda; kod wyjścia bez zmian; nieznany argument odmawia, a stary plik znika. Nowe
testy padały przed zmianą, a cztery mutacje wywracają po jednym teście. Stan: zamknięty po trzech rundach recenzji (runda 1 unieważniona). -->

# Outcome: `gate.mjs --out` (D-130)

## Done

1. `adrian-rebuild/tools/atomic-write.mjs`: `writeAtomicWith(path, fill)`, the one definition of the atomic write
   (temporary file, fsync, rename, directory fsync), with the content written by `fill(fd, temp)`; `writeAtomic`
   calls it with `writeFileSync`.
2. `adrian-rebuild/tools/gate.mjs`: `--out <file>` read by `takeOut` before anything runs. With it, `npm run check`
   writes stdout and stderr into the temporary file through one descriptor, the gate adds its own lines and `gate: exit
   <code>`, and the file appears by the rename; stderr ends with `gate: exit <code>; the whole output is in <file>`.
   `verdict` is the one exit rule for both forms; a listing that fails after the check is a gate line and exit 1 (the
   check's code when that is not 0), so the file keeps the output (review round 1, F1). The temporary file is never a
   new ignored file of the run.
3. `adrian-rebuild/tools/test-gate.mjs`: the fixture's check prints given lines to stdout or stderr in order; six
   D-130 tests (the output in order with the gate's lines and the exit code; the file in an ignored folder; `--out`
   without a file; a failed listing with `--out`; an unknown argument; an earlier run's file) and one test of the
   form without `--out` (a failing check's code wins over a failed listing).
4. `plan.md`: `## Commands` names `node adrian-rebuild/tools/gate.mjs --out <file>`; `## Agents` → protocol step 4
   runs the gate with `--out node_modules/.rebuild-review/R-NNN.gate`.

## Proof

| Command | Exit | Result |
|---|---|---|
| `node --test adrian-rebuild/tools/test-gate.mjs` (AC-1) | 0 | 14/14 |
| `node --test adrian-rebuild/tools/test-review-guard.mjs` (AC-2) | 0 | 23/23 |
| `npx biome check --error-on-warnings adrian-rebuild` (AC-4) | 0 | 36 files |
| `node adrian-rebuild/tools/check.mjs` (AC-4) | 0 | "0 errors" |

## Fails before (AC-3)

- Before the change, with `HEAD`'s `gate.mjs` and `atomic-write.mjs` and the new test file: `node --test
  adrian-rebuild/tools/test-gate.mjs` → exit 1, 10 tests, 7 pass, 3 fail, exactly the three D-130 tests of the first
  draft. The second of them first passed at `HEAD` (no file means no temporary file); it gained the assertion that the
  file is written, and then failed.
- After review round 1, two mutations of the changed `gate.mjs`, each in a copy of the four tool files in the session's
  scratchpad: without the `try` around the listing in `verdict` → 11 tests, 10 pass, 1 fail: "D-130: with --out, a
  listing that fails after the run keeps the check's output in the file and fails the gate"; with stdout and stderr
  captured apart and joined stdout first → 1 fail: "D-130: --out writes the check's output in order, the gate's lines
  and its exit code, which it keeps".
- After review round 2, with `HEAD`'s `gate.mjs` and `atomic-write.mjs`: 14 tests, 7 pass, 7 fail, exactly the seven
  tests this change adds. Two mutations of the changed `gate.mjs`: without the refusal of other arguments → 1 fail,
  "D-130: an unknown argument refuses before the check runs"; without the removal of the earlier file → 1 fail,
  "D-130: an earlier run's --out file is gone when this run ends before its own file is written".

## Deviations from the ticket

1. A listing that fails after the check is no longer an uncaught throw in either form: the gate says git's message as
   its line and exits 1 (the check's code when that is not 0). The existing test of D-105 ("A listing that fails after
   the run fails the gate") passes unchanged; AC-5's "leaves no temporary file" holds, since the write now completes.

## Open points

1. gate-env's shim notice (git < 2.36) goes to the terminal only, not into the `--out` file (review round 1, note 3,
   no change).
2. A run ended by a signal to the gate itself leaves its temporary file beside the target; in
   `node_modules/.rebuild-review/` the listing ignores it.
3. `--out` with no file (or `--out --x`) ends through `takeOut`'s uncaught error with exit 1 and a stack, not exit 2
   with the usage as another argument does (review round 3, note 1; the rounds are spent, D-092); `gate-time.mjs`
   turns the same error into exit 2.
4. No mutation run removes the `own` exclusion of the temporary file; by reading, the test "the --out file in an
   ignored folder … is no new ignored file" then fails on its status (review round 3, note 2).
5. For Adrian: `.claude/agents/rebuild-implementer.md` still runs the bare gate, so an implementer's `BLOCKED:` on a
   failed gate can lose the failing test's name as the main session did (review round 3, note 3); the form with
   `--out node_modules/.rebuild-review/R-NNN.gate` would keep it.
