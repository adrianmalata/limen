<!-- PL: Wynik R-097 (noc 22.11, zamknięty po dwóch rundach recenzji z PASS): `failureKind` w `src/job/record.ts` nazywa teraz `quota` każdy
powód zatrzymania silnika (`error: …`, `aborted: …`) z tekstem limitu subskrypcji („hit your … limit”, sesyjny,
tygodniowy albo inny nazwany), obok dotychczasowej reguły 429; `resetAt` zostaje `null` (D-057 (4)). Trzy nowe testy
padały przed zmianą z `engine-error` zamiast `quota` (migracja, `finalizeJob`, `failureFrom`), a czwarty pilnuje
granicy: błąd silnika bez tekstu limitu zostaje `engine-error`. Runda poprawek 1: dwa komentarze (`src/job/record.ts`,
test migracji) podają prawdziwy powód braku czasu resetu, D-057 (4) dla migracji i R-029 dla `finalize`, bez zmiany
asercji. Bramka: 714 z 714 testów. -->

# R-097 outcome

## Done

(a) `failureKind` (`src/job/record.ts`), which `failureFrom` calls for both the migration (`src/job/migration.ts`,
`oldFailure`) and `finalizeJob` (`src/job/finalize.ts`):
- A new constant `SUBSCRIPTION_LIMIT = /hit your (?:[\w-]+ )?limit/i`, the pattern of `docs/seat/quota-resume.ts:20`
  and `adrian-rebuild/tools/same-task-session.mjs:13` (fact 6). Its doc comment names the source: D-071, the 5-hour
  limit's text of `audit.md` gate 2 §1, Q1, the weekly limit's text, the seat extension that matches it, and why the
  reset time stays `null` even where the text names one: D-057 (4) for the migration, R-029 for finalize (round 1).
- In the branch of the engine's own stop reasons (`/^(?:error|aborted)(?::|$)/`), a text that matches
  `SUBSCRIPTION_LIMIT` or the 429 rule is `quota`; every other engine stop reason stays `engine-error`. The 429 rule is
  unchanged and now sits in a small function `isRateLimit` (the same two tests as before).
- The kinds of Limen's own details (`FAILURE_PATTERNS`: timeout, tool-cap, stall, reaped, exit, signal) are checked
  first, as before. A detail without the `error`/`aborted` prefix is not an engine stop reason, so the limit pattern
  does not apply to it and it keeps the kind it had (read from the code, not tested).
- `resetAt` stays `null` in `failureFrom` for every kind.

Texts the pattern matches (AC-7), each in a test, in an engine stop reason:
- `error: You've hit your session limit · resets 3pm (UTC)` (the 5-hour limit, `audit.md` gate 2 §1, Q1, with an hour
  filled in);
- `error: You've hit your weekly limit · resets Nov 23, 5pm` (the weekly limit as the night of 2026-11-21 recorded it,
  `plan.md` → `## State`);
- `error: You've hit your limit · resets 3pm (UTC)` (no named limit);
- `aborted: You've hit your session limit · resets 3pm (UTC)` (the `aborted:` form of `## Change` (a)).
By its form the pattern also matches any other one-word limit name (letters, digits, `_` or `-`, e.g. "hit your
5-hour limit"), as `docs/seat/quota-resume.ts` does; two words or a word with an apostrophe between "your" and
"limit" do not match.

Engine errors of the tests that stay `engine-error`: `error`, `error: 500 Internal server error`, `error: 529
overloaded_error: Overloaded`, `error: prompt is too long: 1048576 tokens > 1000000 maximum`, `error: the tool output
hit the size limit`, `error: Claude Code process exited with code 1`, `aborted: Request was aborted.`. The 429 rule's
`error: 429 rate_limit_error` stays `quota` (the existing migration test).

(b) Tests:
- `test/cli/migrate.test.ts`: "a failed job that hit the session or the weekly subscription limit migrates with the
  failure kind quota". Two folders of an older Limen, each `failed` with the limit text in `stop-reason` and in the
  last `failed:` log line (after the `assistant …` line the wrapper wrote at `rebuild-base`); `limen migrate` → exit
  0, and each record's `failure` is `{ kind: "quota", detail: <the text>, resetAt: null }`.
- `test/job/finalize.test.ts`: "finalizeJob records the failure kind quota for a job whose engine stopped on the
  subscription limit". A running record; `finalizeJob(job, "failed", "error: You've hit your session limit · resets
  3pm (UTC)")`, the detail the wrapper passes for a failed stop reason (`src/runtime/wrapper.ts:340-341`); the record
  is `failed` with `{ kind: "quota", detail, resetAt: null }`. A unit test of the module, by T-29 (1).
- `test/job/record.test.ts`: "failureFrom names an engine stop reason that says a subscription limit was hit quota,
  with no reset time" (the four texts above) and "failureFrom keeps an engine stop reason that names no subscription
  limit engine-error" (the seven texts above, the boundary of `## Risk`).
- The opening lines of `test/job/record.test.ts` and `test/job/finalize.test.ts` name the new mechanism (T-29 (5)).

No doc changes, as `## Change` says.

## Round 1

`review.md` → Round 1 (PASS with three notes) and `ticket.md` → `## Decisions`, "review round 1": finding 1 is fixed;
findings 2 and 3 are not, with their reasons in `review.md` (finding 2 is under `## Open points`).
- `src/job/record.ts`, the doc comment of `SUBSCRIPTION_LIMIT`: the reason "the text names a reset hour without a
  date" was false for the weekly text, which names a date ("resets Nov 23, 5pm"). The comment now says: "The reset
  time stays null even where the text names one: the migration fills in only the kind (D-057 (4)), and finalize will
  take it from the provider's field, not from this text (R-029)."
- `test/cli/migrate.test.ts`, the comment above "a failed job that hit the session or the weekly subscription limit
  migrates with the failure kind quota": the same false reason is replaced by "The reset time stays null even where
  the text names one, as the weekly limit's date: the migration fills in only the kind (D-057 (4))." The test covers
  only the migration, so the comment names only D-057 (4).
- No code, no test name and no assertion changed. Before the fix, `grep -rn -i 'without a date\|hour without' src test
  hook bin` found only these two comments.

## Proof

From the repository root, on the working tree at `399dc4f` with this change and the fix of round 1:
- AC-1: `node --test test/cli/migrate.test.ts` → exit 0, tests 23, pass 23, fail 0.
- AC-2: `node --test test/job/record.test.ts` → exit 0, tests 16, pass 16, fail 0.
- AC-3: `node --test test/job/finalize.test.ts` → exit 0, tests 2, pass 2, fail 0.
- AC-5: `node adrian-rebuild/tools/gate.mjs` → exit 0: `tsc --noEmit` passes, `biome check --error-on-warnings .`
  checks 251 files with no fixes, and `node --test`: tests 714, pass 714, fail 0, cancelled 0, skipped 0 (138 s).
- AC-6: `npx biome check --error-on-warnings .` → exit 0 (inside the gate run above);
  `node adrian-rebuild/tools/check.mjs` → exit 0, "0 errors"; `npx biome check --error-on-warnings adrian-rebuild` →
  exit 0, 32 files with no fixes.
- Round 1: after the fix the same search, `grep -rn -i 'without a date\|hour without' src test hook bin`, finds
  nothing (exit 1, no output).

## Fails before

AC-4, the main session: `node adrian-rebuild/tools/fails-before.mjs` (`HEAD` `399dc4f`) → exit 0. Its first line, as
printed (the tail is the record test's diff, the four texts `kind: 'engine-error'` against `kind: 'quota'`, as in the
block below): `fails-before: test/cli/migrate.test.ts, test/job/finalize.test.ts, test/job/record.test.ts fail at
HEAD (exit 1)`. The main session's gate after the implementer's run: `node adrian-rebuild/tools/gate.mjs` → exit 0,
tests 714, pass 714, fail 0. After the round of fixes both ran again with the same results (`fails-before.mjs` exit 0,
the same first line; the gate 714/714).

The implementer's runs before the change (a), with the tests of (b) in place, at `399dc4f`:
- `node --test test/job/record.test.ts` → exit 1, tests 16, pass 15, fail 1: "failureFrom names an engine stop reason
  that says a subscription limit was hit quota, with no reset time", each of the four texts `kind: 'engine-error'`
  where `kind: 'quota'` was expected. The boundary test passed, as it must before and after.
- `node --test test/job/finalize.test.ts` → exit 1, tests 2, pass 1, fail 1: the new test, `[ 'failed', { kind:
  'engine-error', detail: "error: You've hit your session limit · resets 3pm (UTC)", resetAt: null } ]` against
  `kind: 'quota'`.
- `node --test --test-name-pattern="subscription limit" test/cli/migrate.test.ts` → exit 1, tests 1, fail 1: both
  records' `kind: 'engine-error'` against `kind: 'quota'`.

```
✖ failureFrom names an engine stop reason that says a subscription limit was hit quota, with no reset time
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
    [
      {
        detail: "error: You've hit your session limit · resets 3pm (UTC)",
  +     kind: 'engine-error',
  -     kind: 'quota',
        resetAt: null
      },
  …
```

## Deviations

None from `## Change`. Two additions inside it: the test of `failureFrom` also covers the `aborted:` form and a limit
with no name, which (a) names ("an engine stop reason (`error: …` or `aborted: …`)", "the session, weekly or another
named limit"); and the 429 rule moved into `isRateLimit` with no change of its tests. Round 1: none from the round's
decision.

## Unmeasured

- `unmeasured` M-11 (failure kinds per ticket, before: gate 2 §1's 18 failed jobs, 12 of them the limit) and
  `## Deployment` 2.3: that the 12 limit failures of the M1 history migrate as `quota` on the seat. The fixtures here
  use the text of `audit.md` gate 2 §1, Q1 with an hour filled in; the seat's real records show it at a0.2.0.

## Open points

- `docs/seat/quota-resume.ts`, which the comment names as the place of the same pattern, is cut by R-034 (A-016 (6));
  that ticket's search for the file name finds the comment in `src/job/record.ts`.
- `src/job/listing.ts:280` keeps the older copy of the 429 rule that `isRateLimit` in `src/job/record.ts` now holds
  (T-25 (2); review round 1, finding 2; the copy is already at `HEAD`). `src/job/listing.ts` is outside `## Change`,
  so this is an open point for gate 5.2, beside R-024's copy of the ISO-time pattern.
