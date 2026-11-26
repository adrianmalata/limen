<!-- PL: Specyfikacja sprawdzenia check.mjs według D-105 (2), w kształcie ticket.md dla recenzji rebuild-reviewer;
zmiana nie ma numeru R-NNN, bo dotyczy narzędzi przebudowy, jak D-026. Każdy plik, który uruchamia test kryterium
ticketu `ready` albo `active` (`node --test`, `fails-before.mjs`, `sh`) albo który nazywa pathspec `git grep`, musi
istnieć w checkoucie albo stać we własnym spanie w `## Change` jako plik, który ticket tworzy; inaczej check.mjs kończy
się błędem z nazwą pliku. Stan: napisany 26.11 przez sesję główną `limen-rebuild-35`; przebieg recenzji w review.md,
wynik w outcome.md. -->

# check.mjs: every test file a criterion names exists (D-105 (2))

## Problem

R-103's AC-6 named `test/cli/prune.test.ts`, which R-101 had removed with `limen prune`; protocol step 2 ran the scan
criteria but nothing checked that the named test file exists, and the miss surfaced only in the implementer's run
(R-103 `ticket.md` → Decision 24). `check.mjs` checks a `ready` or `active` ticket's criteria for a command with its
exit code and for the allow-list (`criterionErrors`, `adrian-rebuild/tools/ticket-rules.mjs`), not for the files the
commands run.

Relied on (quoted):
- D-105 (2): "`check.mjs` checks that every test file a `ready` or `active` criterion names exists (R-103 `ticket.md` →
  Decision 24)".
- R-103 `ticket.md` → Decision 24: "AC-6 named `test/cli/prune.test.ts`, which R-101 removed with `limen prune`;
  protocol step 2 at `4f8dea1` ran the scan criteria but did not check that every test file a criterion names exists".
- D-089, D-099 (2): one path per backtick span in `## Change`.
- D-054 (1): the rules of `ticket-rules.mjs` read `ready` and `active` tickets only, "so a blocked ticket keeps the
  criterion that blocked it, and a done one its history" (its `checkReady` comment).
- T-25 (1): one rule has one definition; T-29 (3): one test, one mechanism.

The session's reading (no source settles it): a criterion often names a test file its own ticket creates (R-024's
`test/cli/stats.test.ts`, R-034's `test/runtime/resuming.test.ts`), which does not exist while the ticket is `ready`. So
a test file counts when it exists in the checkout or when `## Change` names it alone in a backtick span, as D-089 asks
of every path there, read as `review-guard.mjs` reads it (`changePaths`, `covered`: a span without spaces, a directory
ending in `/` covering the files under it). R-103's `## Change` at `f81c548` did not name `test/cli/prune.test.ts`, so
the rule finds its miss. The files checked are those a criterion's test runs and grep pathspecs name: a word after
`node --test`, after `node …/fails-before.mjs`, after `sh`, or after the `--` of a `git grep`, in each part the
allow-list rule reads (`splitCommand`), that is no option (`-…`), no pathspec magic (`:…`) and no glob (`*`, `?`, `[`).
A grep's pathspec counts because one that matches no file makes the grep exit 1 whatever the text, so a criterion
`→ exit 1` on a removed test file would pass silently (review round 2); it counts for every path, not only for test
files, since a shape of "test file" would be a second definition (round 1, note 6) and the hazard is the same. A
grep's pattern is no file.

## Change

- `adrian-rebuild/tools/ticket-rules.mjs`: a new rule beside `criterionErrors`: for a `ready` or `active` ticket, each
  file its criteria's test runs and grep pathspecs name must exist (`exists(path)`) or be named by `## Change` as
  `review-guard.mjs` reads it;
  otherwise `<ticket.md>: AC-N: names the file <path>, which does not exist; a file the ticket creates is named in
  ## Change in its own backticks (D-105)`. `checkReady` takes `exists`; without it (the string tests of the
  other rules) the rule is not run, as the allow-list rule is not without `permissions`.
- `adrian-rebuild/tools/check.mjs`: passes `existsSync` as `exists`.
- `adrian-rebuild/tools/review-guard.mjs`: exports `covered` beside `changePaths`, unchanged.
- `adrian-rebuild/tools/test-ticket-rules.mjs`: tests of the rule.
- `adrian-rebuild/plan.md` → `## Agents` (protocol step 2 names the check) and `## State`;
  `adrian-rebuild/evidence/check-test-files/` (this folder).

## Out of scope

- Other files a criterion names outside a test run and a grep's pathspecs (the path of `git ls-files
  --error-unmatch`, an argument of `node bin/limen`): such a criterion checks the path itself, or fails when it runs.
- An option of a test run whose value stands as its own word: criteria write `--name=value`.
- `planned`, `blocked` and `done` tickets.

## Acceptance

- AC-1: `node --test adrian-rebuild/tools/test-ticket-rules.mjs` → exit 0.
- AC-2: `node adrian-rebuild/tools/check.mjs` → exit 0; `npx biome check --error-on-warnings adrian-rebuild` → exit 0.
- AC-3 (judgment): a test file of a `ready` or `active` criterion that neither exists nor stands alone in a backtick
  span of `## Change` is an error naming the ticket, the criterion and the file, and so is a grep pathspec that does
  not exist; a grep's pattern, pathspec magic, an option and a glob are not looked up; other statuses are not
  checked; the rule has one definition in `ticket-rules.mjs`, and `## Change` is read as `review-guard.mjs` reads it.

## Migration

None: no format on disk changes.

## Risk

1. A file a dependency creates (not the ticket itself) fails the check until the ticket's `## Change` names it;
   naming it there is the fix the error message gives, and it also widens what `compare --git` lets the implementer
   delete, move or, under `tools/`, change, since the guard reads the same `covered` (review round 3, note 3).
2. A ticket that names a file in `## Change` without creating it passes the check; its criterion then fails in the
   gate, as before.

## Rollback

`git revert` of the commit `Tools: …` of this change.

## Decisions

Review round 1 (2026-11-26, `review.md` → Round 1; PASS with seven notes), the findings to fix, by the main session:
1. Notes 3 and 4: the test files are the words of a criterion's test runs (`node --test`, `fails-before.mjs`, `sh`)
   in the parts `splitCommand` reads, less options and globs, so a `git grep` pattern is never looked up and an
   operator without a space still splits; the shape regex `TEST_FILE` goes (and with it notes 6 and 7).
2. Note 5 (T-25 (2)): `## Change` is read by `review-guard.mjs`'s `changePaths` and `covered` (now exported), the
   reader D-089 is about: a span with spaces does not count, a directory ending in `/` covers its files.

Review round 2 (2026-11-26, `review.md` → Round 2; FAIL with one blocking finding and one note), the finding to fix,
by the main session (the second and last round of fixes):
3. Blocking finding 1: the pathspecs after a `git grep`'s `--` are looked up too, less pathspec magic (`:…`) and
   globs, since a pathspec that matches no file makes a `→ exit 1` criterion pass silently; every path counts, not
   only test files (`## Problem` → the session's reading). The message says "names the file". The functions are
   `namedFiles` and `namedFileErrors`, the list `FILE_LISTS`.
