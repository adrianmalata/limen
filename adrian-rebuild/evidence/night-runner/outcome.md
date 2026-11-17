<!-- PL: Wynik budowy tools/night.mjs (D-019): co powstało, dowody (polecenia z kodem 0), dowód, że test pada przed
zmianą, wynik mutacji narzędzia i odstępstwa od wymagań Adriana z 17.11.2026. Plik należy do specyfikacji
z ticket.md i do recenzji z review.md w tym samym katalogu. Stan: zamknięty commitem „D-019”. -->

# Outcome: `tools/night.mjs`

## Done

- `adrian-rebuild/tools/night.mjs`: the night runner of D-019 (refusals, lock, runs, the decision by `status.json`,
  retries, exit codes 0, 1, 3 and 4).
- `adrian-rebuild/tools/test-night.mjs`: 22 tests, one mechanism each, a fake `claude` written into a temporary
  directory and an artificial clock whose `sleep` moves the time on without waiting (and can oversleep).
- `.gitignore`: `adrian-rebuild/.night/`.
- `adrian-rebuild/plan.md`: D-019 in `## Decisions`; `## Commands` (the runner is Adrian's, not on the list;
  `test-night.mjs` among the checks); `## State`; the Polish summary.

## Proof

- `node --test adrian-rebuild/tools/test-night.mjs` → 22/22, exit 0.
- `node adrian-rebuild/tools/gate.mjs` → 83/83, exit 0 (78 s, run again after the fixes of review round 1).
- `node adrian-rebuild/tools/check.mjs` → 0 errors, exit 0.
- `npx biome check --error-on-warnings adrian-rebuild` → exit 0.
- `adrian-rebuild/input/prompt.md` (local) contains `FIRST_MESSAGE`, and line 5 holds it between „ and ” (checked by
  importing the constant on the laptop, 2026-11-17).
- By hand, for review round 2 (a script in the session scratchpad, a fixture outside the repository): with a fake
  `claude` first on PATH and no `--claude`, the fake is called and the night exits 0; afterwards `.night/` holds only
  the run log and `status.json`, and after a held-lock refusal (exit 1) only those and the held `lock`, so no
  `.lock-*.tmp` is left.

## Fails before

`fails-before.mjs` keeps only files named `*.test.(ts|mts|mjs|js)`, and `test-night.mjs` is not one, so the main
session checked by hand: at HEAD (`e60e595`) there is no `night.mjs`, and `node --test
adrian-rebuild/tools/test-night.mjs` exits 1 (`test failed`, the import fails).
Each mechanism was also mutated in a copy of the tool outside the repository, with the same test file (after review
round 1); every mutation fails the test of its mechanism:

| Mutation | Failing tests |
|---|---|
| stdin a pipe instead of `/dev/null` | stdin on `/dev/null` |
| `acceptEdits` instead of `dontAsk` | the `claude` arguments |
| `--dangerously-skip-permissions` added | the `claude` arguments |
| working directory `/` instead of the root | the repository root, and 5 tests whose status the fake writes below the root |
| the modification time of `status.json` ignored | a status from before the run |
| any non-empty reason counts | a reason outside the list |
| no boot-id comparison | A-017 takeover |
| no start-time comparison | A-017 takeover |
| a retry allowed at `--until` (`>` for `>=`) | no retry at `--until` |
| no check of the end after a wait | a wait that wakes up after `--until` |
| the 18-hour horizon ignored | `--until` passed; the next HH:MM within 18 h |
| `prompt.md` not checked | a different first message |
| the lock not released at the end | the lock released |
| no lock taken | a held lock; A-017 takeover |
| a failure of the runner as exit 1 | exit 4 |
| no retries | the 6 tests that retry |

## Deviations from the requirements

- `--until` across midnight: the literal "the hour has passed" would refuse 22:00 → 06:00. Adrian chose the next
  HH:MM with an 18-hour horizon (2026-11-17).
- The time of the status is the file's modification time, not a field: no session has a clock command on the
  allow-list (D-019). The field `reason` alone decides.
- One more refusal with exit 1: a `claude` command that is not an executable file, so a wrong `--claude` does not spend
  the night on three retries.
- One more exit code, 4: a failure of the runner itself (review round 1), so a crash never reads as a refusal.
- The runner's own lines (start, end of each run, retry, the end of the night) go to the run's log next to the output
  of `claude`, and to the terminal.

## Measurement

unmeasured: the first real night run on the laptop is the measurement (a run that ends with `status.json`, and a
retry after a usage-window limit).
