<!-- PL: Recenzje ticketu R-097 (awaria na limicie subskrypcji jako `quota`). Runda 1 (noc 22.11): PASS z trzema
uwagami; fałszywy powód braku czasu resetu w komentarzach kodu i testu idzie do jednej rundy poprawek, druga kopia
reguły 429 w `src/job/listing.ts` jest poza zakresem ticketu (otwarty punkt na bramkę 5.2), a odwołanie do pliku,
który usunie R-034, zostaje. Runda 2: PASS bez uwag. Stan: zamknięta. -->

# R-097 review

## Round 1 (2026-11-22, night, run 2 of `night.mjs`)

- Before: the implementer's run → `review-guard.mjs compare --git` "within its limits", exit 0; the main session's
  `gate.mjs` → 714 tests, 714 pass, 0 fail (tsc and Biome first, in `npm run check`); `fails-before.mjs` → exit 0
  (three files fail at `HEAD` `399dc4f`), recorded in `outcome.md` → `## Fails before` before the review.
- Reviewer: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-097.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-7 met; no blocking finding.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven: the comments give "the text names a reset hour without a date" as the reason for the `null` reset time (`src/job/record.ts:601-602`, `test/cli/migrate.test.ts:400-401`), but the weekly text "resets Nov 23, 5pm" names a date; the reason is D-057 (4) for the migration and R-029 (the provider's field) for finalize | fix: both comments give that reason (T-30); a comment of code and a test, so a round (D-053 (2)) |
| 2 | note · proven: `isRateLimit` leaves the older copy of the same 429 rule in `src/job/listing.ts:280` (T-25 (2)), already at `HEAD` | no change: `src/job/listing.ts` is outside `## Change`; an open point for gate 5.2 (`outcome.md`), beside R-024's copy of the ISO-time pattern |
| 3 | note · observed: the comment names `docs/seat/quota-resume.ts`, which R-034 cuts | no change: `## Change` (a) asks the comment to name the source of the pattern; `outcome.md` → Open points records that R-034's search finds it |

Taste answers: T-29 yes (each mechanism test fails at `HEAD` only on the kind; the boundary test passes before and
after). T-30 yes, but for finding 1.

Fixes (for a fresh implementer, `ticket.md` → `## Decisions`; the first round of fixes): 1.

## Round 2 (2026-11-22, night, run 2 of `night.mjs`)

- The first round of fixes: a fresh implementer (`DONE`; the two comments only); `compare --git` → "within its
  limits", exit 0.
- Before: the main session's `gate.mjs` → 714 tests, 714 pass, 0 fail; `fails-before.mjs` → exit 0 (the same three
  files fail at `HEAD` `399dc4f`), recorded in `outcome.md` → `## Fails before`.
- Reviewer: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-097.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-7 met; no findings.

Taste answers: T-29 yes. T-30 yes (both comments give D-057 (4) and R-029 as the reason; the false reason is gone).
