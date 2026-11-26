<!-- PL: Wynik sprawdzenia według D-105 (2): check.mjs przez ticket-rules.mjs wymaga, żeby każdy plik, który uruchamia
test kryterium ticketu `ready` albo `active` albo który nazywa pathspec `git grep`, istniał w checkoucie albo stał
w `## Change` czytanym tak jak review-guard.mjs. Dowód: testy reguł 36/36 (na kopii HEAD 33/36), check.mjs i Biome
z kodem 0, sonda na R-103 z `f81c548` znajduje dokładnie błąd z Decision 24; recenzja FAIL w rundzie 2, PASS w 1 i 3.
Stan: zamknięte commitem `Tools: …` 26.11. -->

# Outcome: check.mjs, every test file a criterion names exists (D-105 (2))

## Done

- `adrian-rebuild/tools/ticket-rules.mjs`: `FILE_LISTS` (the starts of `node --test`, `node …/fails-before.mjs`, `sh`
  and the pathspecs after a `git grep`'s `--`), `namedFiles` (the words of those lists in the parts `splitCommand`
  reads, less options, pathspec magic and globs) and `namedFileErrors`, run by `checkReady` for each `ready` or
  `active` ticket when `exists` is given: a file that does not exist and that `## Change` does not name (`changePaths`
  and `covered` of `review-guard.mjs`) is `<ticket.md>: AC-N: names the file <path>, which does not exist; a file the
  ticket creates is named in ## Change in its own backticks (D-105)`.
- `adrian-rebuild/tools/check.mjs`: passes `existsSync` as `exists`.
- `adrian-rebuild/tools/review-guard.mjs`: `covered` exported with a JSDoc, unchanged otherwise.
- `adrian-rebuild/tools/test-ticket-rules.mjs`: tests 27–29 (a missing file is an error for `ready` and `active`; a
  file `## Change` names alone, or through its directory, counts, and a span with a line number or with spaces does
  not; exactly the files of the test runs and the grep pathspecs are looked up), and test 30 extended with `exists`.
- `adrian-rebuild/plan.md` → `## Agents`, protocol step 2: the check named; `## State`.

## Proof

- Tests first, `ticket-rules.mjs` unchanged: `node --test adrian-rebuild/tools/test-ticket-rules.mjs` → 33/36, tests 27,
  28 and 29 failing. After round 2's fix, the same test file against a copy of HEAD's `ticket-rules.mjs` in a scratch
  directory → 33/36: `not ok 27 - D-105: a file that a ready or active criterion names must exist`, `not ok 28 - A test
  file the ticket creates counts once ## Change names it alone in backticks`, `not ok 29 - Only the files of a
  criterion's test runs and grep pathspecs are looked up, not a pattern, magic, option or glob`; test 30 passes there,
  a guard. `fails-before.mjs` reads only `test/`, so this copy stands in for it.
- After the change: `node --test adrian-rebuild/tools/test-ticket-rules.mjs` → exit 0, 36/36; `node --test
  adrian-rebuild/tools/test-review-guard.mjs` → exit 0, 23/23; `node adrian-rebuild/tools/check.mjs` → exit 0 (no ticket
  is `ready` or `active` today); `npx biome check --error-on-warnings adrian-rebuild` → exit 0.
- Probes of `checkReady` with `existsSync`, outside the repository: R-103's `ticket.md` at `f81c548` as `active` → one
  error, `AC-6: names the file test/cli/prune.test.ts`, R-103 Decision 24's miss; ``git grep -q describe --
  test/cli/prune.test.ts` → exit 1`` → one error (round 2's blocking case); all 54 `ticket.md` files as `active` → one
  error, R-037 AC-3's `test/s5-land.test.ts`, a done ticket's history that no rule reads.
- Review: `review.md` → Round 1 PASS, Round 2 FAIL (one blocking finding, fixed), Round 3 PASS.

## Deviations

- The check covers every file a criterion's test runs and `git grep` pathspecs name, not only test files: a grep on a
  removed file of any kind passes silently in the same way, and a shape of "test file" would be a second definition
  (`ticket.md` → Problem, the session's reading; Decision 3). D-105 (2)'s test files are a part of it.

## Open points

1. Round 2, note 2 (rejected): an option of a test run whose value stands as its own word, or a quoted argument with
   a space, is read as a file and gives a loud false error; no criterion writes one, criteria write `--name=value`.
2. Round 3, note 4: the JSDoc line of `namedFiles` in `ticket-rules.mjs` is 122 columns (with lines 17 and 62 over
   before); the rounds are spent, so it waits for the next change of the file (D-092).
3. Round 3, note 3: naming in `## Change` a file a dependency creates also lets the implementer's run change it under
   `compare --git`, the price of one reading of `## Change` (`ticket.md` → Risk 1).

## Measurement

Unmeasured here: the check meets its first case when stage 4's `ticket.md` files make tickets `ready`.
