<!-- PL: Ticket R-097 (D-071, A-016, D-057 (4)): awaria joba na limicie subskrypcji („You've hit your … limit”) dostaje
rodzaj `quota`, a nie `engine-error`. Poprawka jednej funkcji `failureKind`, wspólnej dla migracji rekordów i
`finalize`, z testem na tekście z audytu, który pada przed zmianą; bez tego krok 2.3 na seacie (12 awarii na limicie)
się nie zgodzi, a jednorazowa migracja zapisze błędną historię. Stan: napisany 21.11 w dzień; gotowy (ready). -->

# R-097 A failure on the subscription limit is `quota`, in the migration and at finalize

## Problem

Adrian's decision, quoted from `plan.md` → `## Decisions`:

- D-071 (Q-21, option 1): "a new ticket R-097 (S, stage 2, delegated, night, depending on R-021): an engine error that
  says the subscription limit was hit (\"hit your … limit\") is the failure kind `quota` in `failureKind`
  (`src/job/record.ts`), the one function the migration and `finalize` share; `resetAt` stays `null`, because the
  text gives an hour without a date (D-057 (4)); a fixture with the text of `audit.md` gate 2 §1 Q1; a test that fails
  before the change."

The sources:
- A-016, Decision (1): "Limen records one structured failure cause, whoever detected it: kind (`quota`, `timeout`,
  `tool-cap`, `stall`, `reaped`, `engine-error`, `exit`, `signal`, `oom`, `queue`, `read-only-violation`,
  `quota-exhausted`), detail, and for `quota` the reset time."
- D-057 (4): "The migration fills in only the failure kind, in A-016's vocabulary, from today's patterns
  (`stop-reason`, the last `failed:` log line), with the original text as the detail and the reset time `null`".
- `audit.md` gate 2 §1, Q1: "18 failed jobs in both projects. 12 are the 5-hour limit (`stop-reason`: \"You've hit
  your session limit · resets <hour> (UTC)\", hour without date)."
- `## Deployment` 2.3: "`limen stats` over the migrated history of both projects matches the counts known from gate 2:
  142 jobs (84 worker, 58 reviewer; T-33) and 18 failed (12 limit, 3 timeout, 2 stall, 1 exit …)".

Facts at `6556e38` (the main session checked each):
1. `failureKind` (`src/job/record.ts:597-607` at `972c782`) maps an engine stop reason (`error: …`, `aborted: …`) to
   `quota` only when the text has `429` and "rate limit"; every other engine error is `engine-error`.
2. The engine stop reason is `error: <errorMessage>` (`src/runtime/stream.ts`, `assistantStopReason`); at
   `rebuild-base` the wrapper finalized such a job with that text as the detail (`src/runtime/wrapper.ts:382-383`), so
   the job's last `failed:` log line and its `stop-reason` both read `error: You've hit your session limit · resets
   <hour> (UTC)`. The migration reads the last `failed:` line, else the stop reason (`src/job/migration.ts:448-452`),
   and passes it to `failureFrom`.
3. So the 12 limit failures of the M1 history migrate as `engine-error`, and a job that hits the limit now is
   finalized as `engine-error` too (`src/job/finalize.ts:67`). The migration runs once, at the deployment of a0.2.0.
4. The only test of the mapping is `test/cli/migrate.test.ts:380-397`, with `error: 429 rate_limit_error`.
5. No code acts on the kind `quota` yet (`git grep -n '"quota"' -- src hook bin seat` names only `FAILURE_KINDS` and
   `failureKind`); resume after the limit is R-034's, the reset time from the provider's field R-029's.
6. The same limit text is matched today by `/hit your (?:[\w-]+ )?limit/i` in `docs/seat/quota-resume.ts:20` and
   `adrian-rebuild/tools/same-task-session.mjs:13`; the weekly limit reads "You've hit your weekly limit".

## Change

(a) `failureKind` in `src/job/record.ts`: an engine stop reason (`error: …` or `aborted: …`) that says the
subscription limit was hit (the session, weekly or another named limit, as fact 6) is `quota`; the 429 rate-limit
rule stays; any other engine error stays `engine-error`; `resetAt` stays `null` (D-057 (4)). The comment names the
source of the pattern.

(b) Tests that fail before (a): the migration of an old failed job whose `stop-reason` and last `failed:` log line hold
the text of fact 2 gives `{ kind: "quota", detail: <that text>, resetAt: null }` (`test/cli/migrate.test.ts`); the
same for the weekly-limit text; `finalize` of a job whose engine stopped on that text records kind `quota` (the place
of this test by T-29, the implementer's choice); an engine error with no limit text is still `engine-error`.

No doc changes: `docs/jobs.md:52` and `:54` name "the failure with its kind" and the migration without listing the
kinds or their patterns.

## Out of scope

- The reset time from the provider's error field (R-029, A-016 (1)); resume after the limit and `quota-exhausted`
  (R-034).
- `docs/seat/quota-resume.ts` and its pattern (cut by A-016 (6), R-034).
- `limen stats` (R-024).

## Acceptance

- AC-1: `node --test test/cli/migrate.test.ts` → exit 0.
- AC-2: `node --test test/job/record.test.ts` → exit 0.
- AC-3: `node --test test/job/finalize.test.ts` → exit 0.
- AC-4: `node adrian-rebuild/tools/fails-before.mjs` → exit 0, its output in `outcome.md` → `## Fails before`.
- AC-5: `node adrian-rebuild/tools/gate.mjs` → exit 0.
- AC-6: `npx biome check --error-on-warnings .` → exit 0; `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-7 (judgment): the pattern matches the limit texts of fact 6 and no other engine error of the tests; `outcome.md`
  names the texts it matches.

## Migration

None: the migration of R-021 has not run on the seat (a0.2.0 is not deployed), so it migrates with (a) once. Records
written on the laptop's fixtures only.

## Risk

- A pattern too broad would call another engine error `quota`, and from R-034 on resume it; the tests of (b) hold the
  boundary.

## Rollback

`git revert $(git log --format=%H --grep='^R-097:' adrian-rebuild --)`.

## Decisions

- 2026-11-21 D-071 (Adrian): quoted in `## Problem`.
