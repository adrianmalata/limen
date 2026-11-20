<!-- PL: Recenzje zmiany check.mjs według D-054 (moduł tools/ticket-rules.mjs) przez rebuild-reviewer. Runda 1:
PASS z ośmioma uwagami bez blokujących; wszystkie poprawione (nocny ticket pair liczy się jako nocny dla następnych,
testy przypinające spację po regule i `&`, reguły `ask` i gołe `Bash`, rozdzielone testy, kryteria w review-verdict.mjs
z criteria(), komentarze i liczba odmów). Runda 2: PASS z dwiema uwagami i jedną nieaktualnością w komentarzu;
wszystkie poprawione (kryterium bez dwukropka, `## State` w diffie, komentarz o regułach `ask`). Runda 3: PASS z jedną
uwagą o tekście ticket.md, poprawioną bez czwartej rundy (D-053 (2)). Stan: zamknięta. -->

# Night-ready checks review

## Round 1 (2026-11-20, day session)

- Inputs: `adrian-rebuild/evidence/night-ready/ticket.md`, the diff from `review-guard.mjs diff --out
  node_modules/.rebuild-review/night-ready.diff`, `adrian-rebuild/taste.md`. The main session implemented the change.
- Main session before the review: `node --test adrian-rebuild/tools/test-ticket-rules.mjs` → exit 0, 21/21, and
  exit 1 (`ERR_MODULE_NOT_FOUND`) before the module existed; seven mutations each failed the file; `check.mjs` and
  Biome → exit 0.
- Guard: `review-guard.mjs compare node_modules/.rebuild-review/night-ready.before` → `unchanged`, exit 0.
- Parser: `review-verdict.mjs node_modules/.rebuild-review/night-ready.reply <ticket.md>` → `consistent`, exit 0.
- Verdict: PASS. AC-1–AC-5 met; for AC-5 the reviewer replayed the 756 Bash calls of the night logs through `refusal`:
  of the 53 that Claude Code refused, `refusal` lets through 2, both `ls -ld` outside the repository (out of scope).
  Taste questions: T-29 three tests combine mechanisms (note 7), T-30 two comments (notes 3 and 5's comment), T-40 no
  owner step.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | A pair ticket after a pair ticket whose `Run` is `night` is forced to `day`, while the new `## Tickets` text makes it `day-after` | note · proven | fix: a pair ticket with `Run` `night` and recorded choices counts as a night ticket of its stage; test "A pair ticket after a night pair ticket of its stage runs day-after" |
| 2 | No test pins that a trailing ` *` needs a space (`git statusx` under `git status *`) or that `&` splits | note · proven | fix: a test for each; both fail on the reviewer's two mutants |
| 3 | The doc comment of `checkTicketFolders` sits above `ticketFolders` | note · proven | fix: moved |
| 4 | `## Change` item 4 names `## State`, which the diff does not change | note · proven | fix: `## State` is updated before the commit, with the rest of the protocol's step 7 |
| 5 | `## Problem` says 159 refusals; that is the count of the refusal text, the logs hold 53 refused calls among 756 | note · proven | fix: `## Problem` gives both counts; the comment on `OPERATORS` now claims only what `## Problem` records (a `|` inside single quotes) |
| 6 | `ask` rules and a bare `Bash` rule are ignored, though `dontAsk` mode refuses both | note · observed | fix: `loadPermissions` reads `ask` as refusing and a bare `Bash` as `Bash(*)`; a test each |
| 7 | T-29 (3): the tests of the settings reader, of `criteria()` and of `checkRuns` each combine mechanisms | note · observed | fix: split into two, three and three tests |
| 8 | T-25 (2): `review-verdict.mjs` keeps its own parser of the `## Acceptance` IDs | note · observed | fix: `acceptanceIds` returns the IDs of `criteria()`; `test-review-verdict.mjs` 9/9 |

The main session's runs after the fixes: the new test file (31 tests) against the round-1 module → tests 31, pass 28,
fail 3 (the bare `Bash`, `ask` and night-pair tests; the two pins of note 2 pass there, as pins should); against the
fixed module → 31/31; nine mutations of the fixed module, the reviewer's two among them, each fail the file;
`test-review-verdict.mjs` 9/9, `test-changes-entries.mjs` 5/5, `check.mjs` 0 errors, Biome clean.

## Round 2 (2026-11-20, day session)

- Inputs as in round 1, on the new diff (the same reviewer, resumed); the main session's runs before it: 31/31,
  9/9, 5/5, `check.mjs` and Biome → exit 0.
- Guard: `compare` → `unchanged`, exit 0. Parser: `consistent`, exit 0.
- Verdict: PASS. AC-1–AC-5 met; the reviewer replayed the 756 night calls through the round-2 `refusal` (the same 2 of
  53 let through, both out of scope) and ran four mutants, each failing exactly one test. Taste questions: T-29 yes for
  all 31 tests, T-30 yes but for one stale comment, T-40 no owner step.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | Since round 2 a criterion line without the colon (`- AC-2 …`) is dropped: `criteria()` skips it, so its command escapes the allow-list, and `acceptanceIds` no longer requires its line in a reply | note · proven | fix: such a line still opens a criterion; test "A criterion line without its colon still counts" |
| 2 | `## Change` item 4's `## State` is not in the reviewed diff, though `outcome.md` lists it | note · proven | fix: `## State` is written before round 3 |
| — | T-30: the comment of `readPermissions` (`check.mjs`) names only allow and deny rules | taste answer | fix: it names the `ask` rules |

The main session's runs after the fixes: the new test against the round-2 module → tests 32, pass 31, fail 1 (the new
test); against the fixed module → 32/32; the "no judgment mark" mutant fails 2; the 19 existing tickets checked as if
`active` give the same 11 criteria as before; `test-review-verdict.mjs` 9/9, `test-changes-entries.mjs` 5/5,
`check.mjs` 0 errors.

## Round 3 (2026-11-20, day session)

- Inputs as in round 1, on the new diff, which includes `plan.md` → `## State` and the plan's Polish summary (the same
  reviewer, resumed); the main session's runs before it: 32/32, 9/9, 5/5, `check.mjs` and Biome → exit 0.
- Guard: `compare` → `unchanged`, exit 0. Parser: `consistent`, exit 0.
- Verdict: PASS. AC-1–AC-5 met; five mutants each fail exactly one test; the old and new `acceptanceIds` agree on all
  24 `ticket.md` files and on a line without its colon, and the old and new judgment marks on all 184 criterion lines.
  Taste questions: T-29 yes for all 32 tests, T-30 yes, T-40 no owner step.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | `## Change` item 1 still says `criteria()` takes one criterion per `- AC-N…:` line, the round-1 parser | note · proven | fix: the text names a line with or without the colon; text only, so no fourth round (D-053 (2)) |
