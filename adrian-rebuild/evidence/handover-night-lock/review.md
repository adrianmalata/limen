<!-- PL: Recenzja strażnika blokady nocy (D-102 (5)) przez rebuild-reviewer. Runda 1 (24.11): PASS z trzema uwagami;
żadna nie blokuje. Pierwsza znika z commitem (plan.md, review.md i outcome.md wchodzą do niego), drugą sesja główna
odrzuca z powodem (przypadek martwego właściciela trafia w tę samą gałąź, a niezgodność startu i boot id mają własne
przypadki), trzecia (zombie liczy się jako żywy) to świadomie zachowana reguła przejmowania, zapisana w outcome.md.
Stan: zamknięte jedną rundą. -->

# Review: handover refuses while a night holds its lock (D-102 (5))

## Round 1 (2026-11-24, day session `limen-rebuild-31`)

- Inputs: `adrian-rebuild/evidence/handover-night-lock/ticket.md`, the diff from `review-guard.mjs diff --out
  node_modules/.rebuild-review/D-102.diff`, `adrian-rebuild/taste.md`. The main session implemented the change.
- Main session before the review: `node --test adrian-rebuild/tools/test-handover.mjs` → 24/24 (with the tests alone,
  before the code change: 22/24, tests 9 and 10 failing); `node --test adrian-rebuild/tools/test-night.mjs` → 29/29;
  `npx biome check --error-on-warnings adrian-rebuild` and `node adrian-rebuild/tools/check.mjs` → exit 0.
- Guard: `review-guard.mjs compare node_modules/.rebuild-review/D-102.before` → `unchanged`, exit 0.
- Parser: `review-verdict.mjs node_modules/.rebuild-review/D-102.reply <ticket.md>` → `consistent`, exit 0 (accepted
  at once).
- Verdict: PASS. AC-1–AC-4 met; three notes, none blocking.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | `## Change` names `plan.md` → `## State`, and the header names `review.md` and `outcome.md`, none of them in the diff yet | note · observed | no change: they go into the commit `Tools: …` with the code, as in `1c51bfa` |
| 2 | Test 11's "owner gone" text has no `start` or `boot` (`ownerRecord` of a reaped pid), unlike a lock a SIGKILLed runner leaves; `test-night.mjs:400` builds it as `{ ...live, pid: <dead pid> }` | note · proven | rejected: the case reaches the same branch (`identity === undefined`, `night.mjs:185`), the record with a start and a boot id is covered by the start and boot mismatches of the same test, and `test-night.mjs:400` covers the realistic record for the same function |
| 3 | A zombie `night.mjs` (exited, not yet reaped) counts as live: `processIdentity` checks only that `/proc/<pid>/stat` exists, while `handover.mjs` treats a zombie as gone | note · guessed | accepted: the takeover's rule, which D-102 (5) keeps as the one rule; under D-102 (2) the launching shell reaps the runner at once; `outcome.md` → Open points 1 |

Taste questions answered by the reviewer: T-29 (tests 9 and 10 fail before the change for one reason each; test 11 is
a guard of one mechanism over four lock texts), T-30 (the two comments say why and resolve D-102).
