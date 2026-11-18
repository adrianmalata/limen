<!-- PL: Recenzje ticketu R-002 przez rebuild-reviewer. Runda 1 (18.11): PASS, wszystkie kryteria spełnione, sześć
uwag bez blokujących; implementer poprawia nieprawdziwy powód sprzątania martwych rejestracji (dokumentacja i dwa
komentarze), sesja główna poprawia swoje zapisy (tabela rozmiarów etapu 1, D-031 w ticket.md, zastrzeżenia AC-5),
a uwagi o długu T-27 i o nazwie pliku testu (do R-083) są odrzucone z powodem. Runda 2: PASS, bez poprawek.
Stan: zamknięty. -->

# Review: R-002 Cut finish webhooks, coordinator signals and the finish ping

## Round 1 (2026-11-18, day session)

- Inputs: `adrian-rebuild/R-002-cut-finish-webhooks/ticket.md`, the diff from `review-guard.mjs diff --out
  node_modules/.rebuild-review/R-002.diff`, `adrian-rebuild/taste.md`.
- Main session before the review: `review-guard.mjs compare --git node_modules/.rebuild-review/R-002.git <ticket.md>`
  → within its limits; `node adrian-rebuild/tools/gate.mjs` → exit 0, 92/92; `fails-before.mjs` → exit 0;
  `check.mjs` → exit 0 after Adrian closed his editor of `plan.md` (the implementer's `BLOCKED`, D-032).
- Guard: `review-guard.mjs compare node_modules/.rebuild-review/R-002.before` → `unchanged`, exit 0.
- Parser: `review-verdict.mjs node_modules/.rebuild-review/R-002.reply <ticket.md>` → `consistent`, exit 0.
- Verdict: PASS. AC-1 to AC-9 met; six notes, none blocking.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | The docs and two comments say that removing a dead registration makes `limen rule` stop counting its pane; `liveCoordinators` already skips every registration its judge finds dead, so the removal is housekeeping (`docs/commands.md:190`, `src/commands/sweep.ts:44`, `src/integrations/coordinator-registration.ts:88`) | note · proven | fix: the three places say it keeps `.limen/coordinators/` from growing, and nothing about `limen rule` (T-30) |
| 2 | T-27: three changed functions keep their "split pending" suppressions (`hook/group-peer.ts:42`, `:170`, `hook/wake.ts:110`) | note · proven | rejected: the ticket's Change does not split them, and the plan leaves the ratchet to R-082 and R-083 (`## Stages` → conventions); the outcome names all three |
| 3 | AC-5 excepts only the moved test of item 4; s8, u3 and the moved registration test also do not show a change at `HEAD` on their own | note · observed | fix in the outcome (main session): it names the four files and why |
| 4 | The stage 1 size summary does not match the rows (S 4 / M 5 / L 6), off by one already at `HEAD` (R-011 became L by D-021) | note · proven | fix in `plan.md` (main session) |
| 5 | D-031 and its protocol sentence are in the diff but not named in `ticket.md` | note · observed | fix: `ticket.md` → `## Decisions` names D-031 and D-032 as Adrian's decisions committed with R-002 |
| 6 | T-29: `test/cli/old-names.test.ts` mirrors no command; the test of `src/old-names.ts` is `test/old-names.test.ts` | note · proven | rejected: the file is new and untracked, so `git mv` cannot move it and `rm` is denied to the sessions; R-083 renames test files after their subject (T-29) and its scan covers this one |

Taste questions answered by the reviewer: T-14 (no prompt text added), T-18 (no help line added), T-29 (each test
fails for one reason; the file name, note 6), T-30 (one reason does not hold, note 1), T-40 (no owner step), T-41
(no command added).

## Round 2 (2026-11-18, day session)

- Inputs: the same `ticket.md` (with the round-1 decision), the diff from `review-guard.mjs diff --out
  node_modules/.rebuild-review/R-002.diff2`, `taste.md`.
- Main session before the review: `review-guard.mjs compare --git node_modules/.rebuild-review/R-002-fix1.git
  <ticket.md>` → within its limits; `gate.mjs` → exit 0, 92/92; `check.mjs` and Biome → exit 0.
- Guard: `review-guard.mjs compare node_modules/.rebuild-review/R-002.before2` → `unchanged`, exit 0.
- Parser: `review-verdict.mjs node_modules/.rebuild-review/R-002.reply2 <ticket.md>` → `consistent`, exit 0.
- Verdict: PASS. AC-1 to AC-9 met; two notes, none blocking: the delta since round 1 is comments, docs and records
  only, and the four round-1 fixes are in place. No change follows.

Taste questions answered by the reviewer: T-14, T-18 (the refusal line in plain words; its wording goes to Adrian at
gate 5.1), T-29, T-30, T-40, T-41: no finding.
