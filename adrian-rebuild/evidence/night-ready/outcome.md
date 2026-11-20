<!-- PL: Wynik zmiany check.mjs według D-054 (1) i (3): nowy moduł tools/ticket-rules.mjs (status `ready`, `Run` =
`night` ticketu pair z zapisanymi wyborami, polecenia kryteriów ticketów `ready` i `active` dopasowane do allow-listy)
z 32 testami, które padają przed modułem i łapią każdą z dziesięciu mutacji; review-verdict.mjs bierze kryteria
z tego modułu. check.mjs i Biome kończą się kodem 0. Stan: zrealizowane; recenzja PASS w trzech rundach. -->

# Outcome: night-ready checks in `check.mjs` (D-054)

## Done

- `adrian-rebuild/tools/ticket-rules.mjs` (new): `STATUS` with `ready` and `ready (D-NNN, …)`; `section`,
  `dependencyClosure` and `checkRuns` moved from `check.mjs`, `checkRuns` taking the ticket files and accepting `Run`
  `night` for a pair ticket whose `## Decisions` holds a dated entry, which then counts as a night ticket of its stage;
  `criteria`, `loadPermissions` (`allow`, `deny` and `ask`, a bare `Bash` as `Bash(*)`), `refusal` and `checkReady`.
- `adrian-rebuild/tools/check.mjs`: imports the module; reads the ticket folders and their `ticket.md` before the plan;
  reads `.claude/settings.local.json` when it exists (an unreadable file is an error); the summary line says
  `91 tickets (0 ready, criteria against .claude/settings.local.json)`.
- `adrian-rebuild/tools/test-ticket-rules.mjs` (new): 32 tests, one mechanism each, on strings.
- `adrian-rebuild/tools/review-verdict.mjs`: `acceptanceIds` returns the IDs of `criteria()` (review round 1, note 8).
- `adrian-rebuild/plan.md`: `## Tickets` → the `Run` and `Status` columns; `## Commands` → the new test; `## State`.

## Proof

| Criterion | Command | Exit | Result |
|---|---|---|---|
| AC-1 | `node --test adrian-rebuild/tools/test-ticket-rules.mjs` | 0 | tests 32, pass 32, fail 0 |
| AC-2 | the first 21 tests, written before `ticket-rules.mjs` existed | 1 | tests 1, fail 1: `ERR_MODULE_NOT_FOUND` |
| AC-2 | the 31 tests of review round 1 against the round-1 module | 1 | tests 31, pass 28, fail 3 (the three new rules) |
| AC-2 | the 32 tests of review round 2 against the round-2 module | 1 | tests 32, pass 31, fail 1 (a criterion without its colon) |
| AC-3 | `node adrian-rebuild/tools/check.mjs` | 0 | `… 0 errors` |
| AC-3 | `npx biome check --error-on-warnings adrian-rebuild` | 0 | `Checked 32 files … No fixes applied.` |
| AC-4 | `node --test adrian-rebuild/tools/test-changes-entries.mjs` | 0 | tests 5, pass 5, fail 0 |
| AC-4 | `node --test adrian-rebuild/tools/test-review-verdict.mjs` | 0 | tests 9, pass 9, fail 0 |

## Fails before

The test file was written before the module, so its first run failed on the import (exit 1, `ERR_MODULE_NOT_FOUND`).
To show that each rule's test checks its rule, the main session ran the test file against copies of the module, each
with one rule broken (in the session's scratchpad, never in the tree); every copy failed. Before review round 1, the 21
tests against seven copies:

| Mutation | fail |
|---|---|
| a trailing ` *` no longer matches the bare command | 1 |
| quotes are ignored when the command is split | 3 |
| deny rules are ignored | 1 |
| a pair ticket's `Run` `night` is never accepted | 1 |
| every backticked span counts as a command, not only those followed by `→ exit` | 1 |
| the criteria of every status are checked | 1 |
| wrapped criterion lines are not joined | 1 |

After review round 1, the 31 tests against nine copies of the fixed module: a trailing ` *` as a bare prefix (the
reviewer's mutant 1) 1, `&` no operator (mutant 2) 1, no bare match 1, quotes ignored 3, `ask` rules ignored 1, a night
pair ticket not counted as a night ticket 1, every span a command 1, no wrapped lines 1, no judgment mark 2.
The three new rules' tests also fail on the round-1 module (tests 31, pass 28, fail 3); the two pins of note 2 pass
there, as pins of behaviour the round-1 module already had. After review round 2, a judgment mark that is never read
fails 2 tests, and the new test of a criterion line without its colon fails on the round-2 module.

## The check on the existing tickets

All 19 ticket folders are `done`, so no criterion is checked today. Run as if each were `active` (a scratch script
over the same functions), the check names 11 criteria: ten of R-008, R-010, R-011 and R-088 whose expected result is
no exit code (they predate D-025, e.g. R-008's AC-1 "→ no output (exit 1)" on a second line, AC-2 "→ only lines of
…"), and R-012's AC-6 `node seat/deploy.ts`, which no allow rule matches: the refusal that became Q-8 on the night of
2026-11-19, now caught by day.

## Deviations

- `splitCommand` became three functions (`closingQuote`, `token`, `splitCommand`), because Biome's cognitive
  complexity limit (25) refused the first version (28).
- The summary counts the `ready` tickets rather than the checked commands (`ticket.md` → `## Change`, item 2, amended).
- Review round 1 widened the change: `ask` rules and a bare `Bash`, the night pair ticket as a night ticket of its
  stage, and `review-verdict.mjs` on `criteria()` (`ticket.md` → `## Decisions`); review round 2 made a criterion line
  without its colon count.

## Measurement

`unmeasured` until the first night with `ready` tickets: that no criterion command of a `ready` ticket is refused by
the permissions in a night run (the night log's refusals of criterion commands, before: the runs of 2026-11-17 to
2026-11-19).
