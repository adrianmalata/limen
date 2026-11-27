<!-- PL: Recenzja ticketu R-041 (wskazówka tury: linia odbiorcy, części zmienne i kotwica ramy pod tagiem
`limen-turn-cue`). Runda 1 (27.11, w dzień): PASS przy wszystkich kryteriach spełnionych, z czterema uwagami; dwie
idą do rundy poprawek F1–F2 (sformułowania komentarza i dokumentacji; `ticket.md` → `## Decisions`), jedną sesja
główna wpisuje do punktów otwartych `outcome.md`, jedna bez zmiany z powodem. Runda 2: FAIL z jednym znaleziskiem
blokującym (dokumentacja i komentarz twierdziły, że wskazówka nie powtarza niczego z wiadomości kontekstowej, a linia
odbiorcy celowo niesie regułę języka) i dwiema uwagami; ostatnia runda poprawek G1–G3. Runda 3: PASS z jedną uwagą
(nieaktualne streszczenia PL), poprawioną przez sesję główną. Stan: recenzja zamknięta. -->

# R-041 review

## Round 1 (2026-11-27, by day, `limen-rebuild-43`)

- Before: the implementer's run → `review-guard.mjs compare --git` → "within its limits", exit 0; the main session's
  `gate.mjs --out node_modules/.rebuild-review/R-041.gate` → exit 1, 1438/1439, on `test/hook/wake.test.ts:318`
  (`ENOTEMPTY` in cleanup) → Q-100 → D-135: an occurrence of A-092 in `outcome.md`, and the gate once more → exit 0,
  1439/1439 (352.3 s); `fails-before.mjs` on AC-4's two files → exit 0.
- Reply: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-041.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-11 met; four notes, no blocking finding.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · observed: `CONTRIBUTING.md:29` and the hook's header comment (`hook/communication.ts:74-75`) say the cue holds "what changed since the last turn", which the ticket and board-advisory lines are not | fix (F1): "the lines that apply" (T-30) |
| 2 | note · observed: `docs/setup.md:187` says the note "repeats nothing the context message holds" and gives "the capability frame in one sentence", which reads as a contradiction | fix (F2): the sentence says the anchor is the capability file's own one-sentence `## Cue` section, apart from the `## Frame` the message holds (T-30) |
| 3 | note · observed: two tests check properties `HEAD` already had (the A-039 test, the bridge-contract fixture) | no change: `outcome.md` → Deviations 5 records it, and AC-4's two files fail at `HEAD` as a whole |
| 4 | note · observed: a job's vision line is fixed when the job is published, so a vision file made later is not pointed at during that job | no change in code (D-134 (3): the line rides the frozen message, z. 3); the main session names the case in `outcome.md` → Open points |

## Round 2 (2026-11-27, by day, `limen-rebuild-43`)

- Before: F1 and F2, then the round's `BLOCKED` (`check.mjs` refused the main session's `:318` in D-135; dropped) and
  the three "since the last turn" phrases; `compare --git` → "within its limits"; the main session's gate → exit 0,
  1439/1439 (345.6 s); `fails-before.mjs` on AC-4's two files → exit 0.
- Reply: `review-guard.mjs compare` → "unchanged"; `review-verdict.mjs` → "consistent". Verdict **FAIL**: AC-11 not
  met (its third clause); one blocking finding, two notes. The fixes below are the last round of fixes.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | blocking · proven: `docs/setup.md:187` and the hook's header comment (`hook/communication.ts:74-75`) say the cue repeats nothing the context message holds, but the audience line repeats the registers' language rule by design (T-13) | fix (G1): both say the cue repeats no register section and that its audience line carries the language the registers' rule names (T-13), so neither copy looks removable |
| 2 | note · observed: the `VISION_LINE` comment says the job loads the file "only when its work needs it", while the line says "Load it before choosing or starting work." | fix (G2): the comment says why the line rides the frozen message, without describing when the job reads the file (T-30) |
| 3 | note · observed: `outcome.md` → Done 7 still quotes the old `CONTRIBUTING.md:29` wording | fix (G3): Done 7 quotes the new wording |

## Round 3 (2026-11-27, by day, `limen-rebuild-43`)

- Before: G1–G3 by the resumed implementer; `compare --git` → "within its limits"; the main session's gate → exit 0,
  1439/1439 (362.0 s); `fails-before.mjs` on AC-4's two files → exit 0.
- Reply: `review-guard.mjs compare` → "unchanged"; `review-verdict.mjs` → "consistent". Verdict **PASS**; AC-1–AC-11
  met; one note.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · observed: the Polish summaries of `outcome.md` and `review.md` miss round 2 | fixed by the main session (D-053 (2)): both summaries name rounds 2 and 3 |
