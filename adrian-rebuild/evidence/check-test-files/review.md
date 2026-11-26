<!-- PL: Recenzja sprawdzenia plików testów w kryteriach (D-105 (2)) przez rebuild-reviewer. Runda 1 (26.11): PASS
z siedmioma uwagami; trzy (słowa wzorca `git grep` brane za ścieżki, operator bez spacji, drugi odczyt `## Change`)
poprawia sesja główna, przez co znikają też dwie o wzorcu kształtu pliku testu. Runda 2: FAIL, bo pathspec `git grep`
usuniętego testu przestał być sprawdzany, a kryterium `→ exit 1` przechodziło wtedy po cichu; poprawione w ostatniej
rundzie poprawek, uwaga o wartości opcji odrzucona z powodem. Runda 3: PASS z czterema uwagami; trzy w ticket.md
i outcome.md zamyka sesja główna bez kolejnej rundy (D-053 (2)), a komentarz dłuższy niż 120 kolumn trafia do punktów
otwartych, bo rundy poprawek są wyczerpane (D-092). Stan: zamknięte. -->

# Review: check.mjs, every test file a criterion names exists (D-105 (2))

## Round 1 (2026-11-26, day session `limen-rebuild-35`)

- Inputs: `adrian-rebuild/evidence/check-test-files/ticket.md`, the diff from `review-guard.mjs diff --out
  node_modules/.rebuild-review/D-105-2.diff`, `adrian-rebuild/taste.md`. The main session implemented the change.
- Main session before the review: `node --test adrian-rebuild/tools/test-ticket-rules.mjs` → 36/36 (with the tests
  alone, before the change of `ticket-rules.mjs`: 33/36, the new tests 27–29 failing); `npx biome check
  --error-on-warnings adrian-rebuild` and `node adrian-rebuild/tools/check.mjs` → exit 0; a probe of `checkReady`
  with `existsSync` on R-103's `ticket.md` at `f81c548` printed one D-105 error, AC-6's `test/cli/prune.test.ts`.
- Guard: `review-guard.mjs compare node_modules/.rebuild-review/D-105-2.before` → `unchanged`, exit 0.
- Parser: `review-verdict.mjs node_modules/.rebuild-review/D-105-2.reply <ticket.md>` → `consistent`, exit 0.
- Verdict: PASS. AC-1–AC-3 met; seven notes, none blocking.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | `## Change` names `plan.md` → `## State`, which the diff does not change yet | note · observed | no change: it goes into the commit `Tools: …`, as in `31d102e` |
| 2 | No `outcome.md` yet records the fails-before run | note · observed | no change: `outcome.md` goes into the commit, with the run on a copy of HEAD's `ticket-rules.mjs` under `## Proof` |
| 3 | A test-shaped word of a `git grep` pattern is looked up as a path: `git grep -n land.test.ts -- docs` errs although the test exists | note · proven | fixed: `ticket.md` → Decisions 1 |
| 4 | A test file followed by an operator without a space (`test/a.test.ts&&`) is never looked up, though `splitCommand` splits there | note · proven | fixed: Decisions 1 |
| 5 | A second reading of "a path `## Change` names" beside `review-guard.mjs`'s `changePaths`: a spaced span counts, a directory does not (T-25 (2)) | note · proven | fixed: Decisions 2 |
| 6 | Two definitions of "a test file": `TEST_FILE` here and `fails-before.mjs`'s (T-25 (1)) | note · guessed | gone with Decisions 1: the rule reads a test run's words, no shape |
| 7 | The comment on `TEST_FILE` says what, not why | note · observed | gone with Decisions 1: the constant is cut; `TEST_RUNS`'s comment says why a grep's words are none |

Taste questions answered by the reviewer: T-29 (each new test fails for one reason; the extended status test is a
guard), T-30 (the JSDoc says why; D-105, D-089 and R-103 Decision 24 resolve), T-40 (no step waits for the owner).

## Round 2 (2026-11-26, day session `limen-rebuild-35`)

- Inputs: the same `ticket.md` (with round 1's Decisions 1 and 2), the diff
  `node_modules/.rebuild-review/D-105-2r2.diff`, `adrian-rebuild/taste.md`.
- Main session before the round: `node --test adrian-rebuild/tools/test-ticket-rules.mjs` → 36/36; the same file
  against a copy of HEAD's `ticket-rules.mjs` → 33/36 (tests 27–29 failing); `node --test
  adrian-rebuild/tools/test-review-guard.mjs` → 23/23; Biome and `check.mjs` → exit 0; the R-103 probe → one D-105
  error, AC-6's `test/cli/prune.test.ts`.
- Guard: `review-guard.mjs compare node_modules/.rebuild-review/D-105-2r2.before` → `unchanged`, exit 0.
- Parser: `review-verdict.mjs node_modules/.rebuild-review/D-105-2r2.reply <ticket.md>` → `consistent`, exit 0.
- Verdict: FAIL. AC-1–AC-3 met; Decisions 1 and 2 checked as fixed; one blocking finding, one note. The reviewer's
  probe of all 54 `ticket.md` files as `active` found one error, R-037 AC-3's `test/s5-land.test.ts` (a done ticket).

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | Decision 1 also stopped the lookup of a test file in a `git grep` pathspec; git grep exits 1 when a pathspec matches no file, so a criterion `→ exit 1` on a removed test passes silently, R-103 Decision 24's failure made silent; `## Out of scope`'s reason was false | blocking · proven | fixed: `ticket.md` → Decisions 3 (the reviewer's first way, which keeps D-105 (2) as decided) |
| 2 | An option's value written as its own word, and a quoted argument with a space, are looked up as files (`--test-reporter spec`) | note · proven | rejected: no criterion of the 54 tickets passes an option so, criteria write `--name=value`, and the false error is loud and names the word; the JSDoc of `namedFiles` and `## Out of scope` state the limit; `outcome.md` → Open points 1 |

Taste questions answered by the reviewer: T-29 (each new test fails for one reason; test 27's name also named the
`## Change` exemption, which test 28 checks, so test 27 is renamed), T-30 (the comments say why; the `testFiles` JSDoc
was inexact for an option's value, note 2), T-40 (no step waits for the owner).

## Round 3 (2026-11-26, day session `limen-rebuild-35`; after the last round of fixes)

- Inputs: the same `ticket.md` (with Decisions 1–3), the diff `node_modules/.rebuild-review/D-105-2r3.diff`,
  `adrian-rebuild/taste.md`.
- Main session before the round: `node --test adrian-rebuild/tools/test-ticket-rules.mjs` → 36/36; the same file
  against a copy of HEAD's `ticket-rules.mjs` → 33/36 (tests 27–29 failing); `node --test
  adrian-rebuild/tools/test-review-guard.mjs` → 23/23; Biome and `check.mjs` → exit 0; probes with `existsSync`: R-103
  at `f81c548` → one D-105 error (AC-6, `test/cli/prune.test.ts`); ``git grep -q describe -- test/cli/prune.test.ts` →
  exit 1`` → one error; all 54 `ticket.md` files as `active` → one error, R-037 AC-3's `test/s5-land.test.ts`.
- Guard: `review-guard.mjs compare node_modules/.rebuild-review/D-105-2r3.before` → `unchanged`, exit 0.
- Parser: `review-verdict.mjs node_modules/.rebuild-review/D-105-2r3.reply <ticket.md>` → `consistent`, exit 0.
- Verdict: PASS. AC-1–AC-3 met; Decisions 1–3 checked as fixed; four notes, none blocking. The reviewer's own run of
  `check.mjs` was refused by its permissions (the command is the main session's), so AC-2 rests on the main session's
  runs.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | AC-3 was left unwrapped by Decision 3's edit (173 columns) | note · proven | fixed by the main session without a further round (`ticket.md` only, D-053 (2)) |
| 2 | No `outcome.md` yet, which round 2's row 2 points at | note · observed | no change: `outcome.md` goes into the commit |
| 3 | `## Risk` 1 still said "a test file"; naming a dependency's file in `## Change` also widens what `compare --git` lets the implementer change, since the guard reads the same `covered` | note · guessed | fixed in `ticket.md` → Risk 1 (D-053 (2)); the widening is the price of one reading of `## Change` (T-25 (2)) |
| 4 | A new JSDoc line of `ticket-rules.mjs` is 122 columns (lines 17 and 62 were over before) | note · proven | the rounds are spent and it needs code, so it goes to `outcome.md` → Open points 2 (D-092) |

Taste questions answered by the reviewer: T-29 (each new test fails before the change for one reason; test 29 holds
several cases of one mechanism), T-30 (the comments say why; every identifier resolves), T-40 (no step waits for the
owner).
