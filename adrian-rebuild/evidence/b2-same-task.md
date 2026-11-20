<!-- PL: Raport pomiaru B.2 (stan „przed” M-05 na rebuild-base), wykonanego przez Adriana na seacie 19–20.11.2026
krok po kroku z sesją główną: seat check R-011 zaliczony, kandydat F013 synchronizera, cztery próby, z których dwie
ważne (obie bez kandydata, bo koordynator zrobił ticket sam) i dwie unieważnione przez odczyt produkcyjnego checkoutu.
Wynik: passed 0 of 2, pass^2 no, void 2; brak trzeciej ważnej próby (D-050). Stan: zamknięty; pliki prób zostają na
seacie poza repo. -->

# B.2: the same-task baseline at `rebuild-base`

Run on the seat by Adrian on 2026-11-19 evening and 2026-11-20 night, each step guided by the main session
(`limen-rebuild-8`), which read the outputs Adrian pasted (D-048). The attempts' folders stay in a scratch folder of
the agents' account, outside the projects; this report holds no seat path.

## Verdict

pass^k: **no**. Two valid attempts of the planned three (k = 3), both without a candidate, so neither passed (D-049);
two attempts void, both `void-contaminated`. B.2 closes with K = 2 and the shortfall recorded (D-050): pass^3 would be
"no" whatever a third valid attempt gave, since two have failed. Report line of the runner over the four attempts:
`passed 0 of 2; pass^2: no; void: 2`.

At `rebuild-base` the coordinator, under the fixed input of D-021, usually does not delegate: in three of the four
attempts it implemented the ticket in its own session and started no job. Limen's coordinator instructions do not
reach the model there (A-086); that is the gap stage 4 closes, and the fixed owner message keeps it visible (D-049
(3)).

## Set-up

- Limen under test: `/opt/limen`, at `f1e3a54`, whose code equals `rebuild-base` (`git diff --stat f1e3a54
  rebuild-base` touches only five files of `docs/seat/`). The seat's coordinators load Limen from the extra checkout in
  the agents' home (gate 2 §9 item 6), which is at `rebuild-base` and clean.
- Runner: `adrian-rebuild/tools/same-task.mjs` at `91cc2e4` (the tag `a0.1.1`), from a separate checkout; its 57 tests
  passed on the seat's Node 26.
- Engine args: `--approve --provider pi-claude --model claude-opus-5-5 --thinking xhigh`. The route and the level are
  the ones Adrian starts coordinators with; Pi clamps `xhigh` to `high` for this model (the session records `thinking
  high`). `--approve` because Pi 1.5.1 skips project-local extensions in RPC mode without a trust decision (Pi
  `docs/security.md`), and the seat has none for a new folder.
- Candidate: synchronizer F013 ("the command line sends secrets only to its own background process"): one completed
  review that found issues, one fix, two failed reviewer jobs. `--commit 1fe9df6` (its start, the first worker's base),
  `--reference 948dfda` (its last commit; the range holds the seven F013 commits only), `--ticket
  spec/features/active/F013-…/ticket.md`, `--time-limit 180` (102 min from the first job's start to the last job's
  end, 1.5 times is below the floor of D-021 (2)).
- Hidden tests: the four files the reference changed under `test/` (one integration test, its two helpers, one unit
  test). Evaluation commands: `npm ci --silent`, `npm run verify`.
- Controls: the reference with the hidden tests passes the project gate (9 checks, 116.8 s); the start commit with
  them fails it (from `tsc` on).

## Seat check of R-011 (D-021)

Passed, by the second of two smoke attempts in a copy of the project with a one-line ticket:

- the headless coordinator loaded Limen's hooks (`limen-project-context` in its session);
- its worker ended `done`, and the wake reached it as a user turn;
- no `protocol-error.json`, no extension error (R-091), `stops` empty (R-088).

The first smoke ticket did not ask for a job, and the coordinator did it in its own session in 61 s. Both smoke
coordinators landed without an owner "land"; the second said that this breaks the project's rule, slept once and read
`status` four times.

## Attempts

| Attempt | Outcome | Time | Jobs | Touchpoints | `sleep` | `status` reads | Footer replies / replies |
|---|---|---|---|---|---|---|---|
| 1 | `void-contaminated` | 44 min | none | 1 | 2 | 0 | 0 / 23 |
| 2 | `finished`, no candidate | 52 min | none | 1 | 1 | 0 | 0 / 31 |
| 3 | `finished`, no candidate | 37 min | none | 1 | 1 | 0 | 0 / 34 |
| 4 (rerun of 1) | `void-contaminated` | not read | a worker; its candidate failed the gate with the hidden tests | not read | not read | not read | not read |

The valid attempts are 2 and 3. Not read in B.2: the tokens by class, the reply language, the T-14 metaphors and the
owner commands outside owner-channel actions (T-41); they stay in each attempt's `result.json` and session files on the
seat, for the comparison at 4.8.

Both void attempts have the same cause: a bash call of the coordinator read job evidence (of F002 and F003 in attempt
1) in the production checkout of the project, whose absolute paths are written in the project's committed notes. The
production checkout also holds F013's own job records, so the void is right (D-021 (4)). The agents' account can read
its own home until stage 5 separates the accounts.

## Diagnostic of the coordinators' own branches (D-049 (1)), outside pass^k

`evaluate` takes its candidate only from `result.json`, so the main session's procedure repeated its steps by hand in
a separate clone: the hidden tests laid over the tip of the coordinator's branch, then `npm ci --silent` and `npm run
verify`.

| Attempt | Branch | Gate with the hidden tests | Gate without them |
|---|---|---|---|
| 2 | three commits on a branch of its own, `main` untouched | fails from `tsc` on | passes, 9 checks |
| 3 | two commits on a branch of its own, `main` untouched | fails from `tsc` on | passes, 9 checks |

The hidden tests failed at `tsc` on names of the reference's API: the unit test imports `isNonce` and
`parseProofAnswer`, which neither branch has. The behaviour of the coordinators' code is therefore **not verified**:
the integration test never ran against it.

## For the "after" runs (4.8, 9.1)

By D-050, before 4.8 the main session proposes together a name-independent evaluator and a way to keep the attempts
out of the production checkout. Every change of the task after B.2 must leave B.2's result unchanged (z. 40): a new
evaluator does, because no valid attempt of B.2 has a candidate; a change of the input, such as the project's notes,
needs its own justification.

## Errors of the main session during B.2

- The loop of the three attempts logged false exit codes: `$(date -Is)` in the same line reset `$?`. The report reads
  `result.json` and `evaluation.json`, which the error did not touch; the rerun captured the code first.
- `tail -3` with several files is refused by the seat's coreutils; `tail -n 3` works.
- The first count of F013's review rounds (three) was wrong: two of the three reviewer jobs had failed.
