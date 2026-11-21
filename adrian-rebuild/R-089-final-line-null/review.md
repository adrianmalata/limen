<!-- PL: Recenzje ticketu R-089 (w linii końcowej `code` i `next` są wartością albo null, a `next` jest zawsze
poleceniem Limena). Runda 1 (21.11 w dzień, po autopilocie D-063 (4)): PASS z ośmioma uwagami; trzy idą do poprawki
przez świeżego implementera (skan importów czytnika linii końcowej, „run null” w hooku, test mapowania limitu 20 s
w `group wait`), dwa odchylenia są przyjęte w ticket.md, a trzy uwagi nie są poprawiane (z powodem). Runda 2: PASS
z dwiema uwagami; skan importów przechodzi na drzewo składni TypeScript (druga i ostatnia runda poprawek), a uwaga
o ręcznym porównaniu linii końcowej jest odrzucona. Runda 3: pierwsza odpowiedź odrzucona przez review-verdict
(PASS przy AC-7 `unknown`), druga po dopisaniu przebiegu bramki sesji głównej: PASS; dwie uwagi o rozwiązywaniu
ścieżek w skanie czekają na pytanie Q-14. Stan: zamknięta. -->

# R-089 review

## Round 1 (2026-11-21, by day)

- Before: `review-guard.mjs compare --git` after the implementer → "the implementer's run is within its limits",
  exit 0; the main session's `gate.mjs` → 555/555, fail 0; `fails-before.mjs` printed that 22 test files "fail at
  HEAD (exit 1)", recorded in `outcome.md` before the review. The implementer's first gate run had failed three tests
  and cancelled one; each read a value this change replaces (`code: 0` in two `init` tests, spawn's text order in the
  queue test, which left the next test of its plant queued), so none is a D-029 finding.
- Reviewer: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-089.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-10 met.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven: `fails-before.mjs` cannot show any test's own reason, since every listed file fails at load on the missing `commandOf` export | rejected: `outcome.md` holds the intermediate run with each test's reason, and the reviewer reproduced them on a copy of HEAD with only the `commandOf` split |
| 2 | note · proven: several new tests fail at HEAD at the reader's `next` check or the earlier `code` check before their own assertion | rejected: each still fails for one reason (the reviewer's T-29 answer), the reader's check is the mechanism of D-046 (3), and each assertion still catches a regression of its own mechanism |
| 3 | note · proven: the scan that ties test files to the reader matches only named imports of `src/outcome.ts`; `import * as` or a dynamic `import()` would pass it | fix: AC-10's guarantee is code, so the scan must not be passable by another import form (z. 14) |
| 4 | note · proven: `jobs <ref>` puts the ref unquoted into `limen show <ref>` | rejected here: out of scope, R-023 (D-045 (2)), as `ticket.md` → `## Out of scope` says |
| 5 | note · observed: with no branch given, `TICKET_CHECK_FAILED` names the current branch it resolved, not "the branch given" | accepted: the branch the check ran on is a concrete value and is HEAD's behaviour; recorded in `ticket.md` → `## Decisions` |
| 6 | note · observed: `x-ratelimit-reset` is used only when `x-ratelimit-remaining` is `0`, and `retry-after` wins | accepted: it gives "the limit's reset time" of D-045 (5.2) and no misleading time on a 5xx; recorded in `ticket.md` → `## Decisions` |
| 7 | note · proven: if `NOT_MIGRATED` lost its `next`, the hook would write "run null", since the type now admits `null` (`hook/wake.ts`) | fix: the type change of this ticket makes the template unsafe |
| 8 | note · observed: no CLI test covers the text line of `github review` or `keeper`, or the 20 s cap mapping in `groupWaitCommand` | fix for the cap mapping, which D-046 (5) names; not fixed for `github review` and `keeper`, whose text line comes from the shared paths that `github work` and `spawn` test |

Fixes (for a fresh implementer, `ticket.md` → `## Decisions`; the first round of fixes): 3, 7 and the cap part of 8.
They change code and tests, so they get a round (D-053 (2)).

## Round 2 (2026-11-21, by day)

- Before: the implementer's `BLOCKED` on Fix 3's scope was settled by the main session (`ticket.md` → `## Decisions`),
  and the same implementer, resumed, made fixes 3, 7 and 8 → `review-guard.mjs compare --git` "within its limits",
  exit 0; the main session's `gate.mjs` → 566/566, fail 0; `fails-before.mjs` → the changed test files fail at HEAD
  (23, `test/hook/wake.test.ts` among them), recorded in `outcome.md` before the review.
- Reviewer: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-089.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-10 met.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven: the regex import scan refuses every form the decision names, but a comment inside the braces or after `import`, a string-named import, a `./` segment or a query in the path, and an `import()` of a `new URL(…)` pass it; the repository already scans imports with the TypeScript AST (`runtimeImports` in `test/boundary.test.ts`) | fix: the scan reads imports through the TypeScript AST, as the repository's other import scans do, with the path resolved, so AC-10's guarantee is not a regex (z. 14, T-25 (2)) |
| 2 | note · observed: a test that compares a raw final line by hand (`test/parser.test.ts`) bypasses the reader, which an import scan cannot see; harmless today, since that `next` is in the reader's RUNS table | rejected: D-046 (3) and Change 7 tie the check to the tests' reader, and a by-hand comparison asserts a literal `next` that the RUNS table already parses |

Fixes (for a fresh implementer, `ticket.md` → `## Decisions`; the second and last round of fixes): 1. It changes a
test, so it gets a round (D-053 (2)).

## Round 3 (2026-11-21, by day)

- Before: the round-2 implementer's run of Fix R2-1 → `review-guard.mjs compare --git` "within its limits", exit 0;
  the main session's `gate.mjs` → 572/572, fail 0; `fails-before.mjs` → 24 test files fail at HEAD
  (`test/boundary.test.ts` among them), recorded in `outcome.md` before the review.
- First reply: `PASS` with AC-7 `unknown` (the reviewer runs no gate); `review-guard.mjs compare` → "unchanged",
  exit 0; `review-verdict.mjs` → "PASS with 1 criteria not met or unknown", rejected, exit 1 (AU-126). The main
  session added its own gate run to `outcome.md` → `## Proof` and ran the review again (the first rejected reply of
  this round; a second would go to Adrian). The rejected reply's two notes are kept below as evidence (A and B).
- Second reply: `rebuild-reviewer` with the ticket, the new `node_modules/.rebuild-review/R-089.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-10 met.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven: `fileOf` (`test/final-line.test.ts`) resolves a `file:` URL with no `//` against the test file, while Node resolves it from the filesystem root, so its comment is wrong for that form and such an import of an absolute path passes the scan | not fixed here: the two rounds of fixes are used; a question to Adrian (Q-14), with A |
| A | (first reply) note · proven: `fileOf` keeps an empty path segment, so `../src//outcome.ts` passes the scan while Node loads `src/outcome.ts` from it | not fixed here: Q-14, with 1 |
| B | (first reply) note · observed: `test/final-line.ts` defines `readOutcome` and `outputText`, the names of the `src/outcome.ts` functions they wrap; T-25's function-name scan, when it lands, needs an entry or a rename | not fixed here: the scan ticket of T-25 settles the names, as for `progressOf` in `R-093-round-3-notes-r019-r021/review.md`, finding 3 |

The review is closed: round 3 is PASS; findings 1 and A wait for Adrian's answer to Q-14, and no ticket is blocked.
