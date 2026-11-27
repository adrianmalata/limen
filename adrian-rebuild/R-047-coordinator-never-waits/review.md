<!-- PL: Recenzja ticketu R-047 (koordynator nigdy nie czeka: hook odmawia w Bash `sleep` 30 s lub dłuższego).
Runda 1 (27.11, w nocy): PASS, kryteria AC-1–AC-11 spełnione, pięć uwag bez znaleziska blokującego; główna sesja
poprawiła sama punkt otwarty 2 w `outcome.md` (forma T-17), uwagę o teście importów przeniosła do R-060, a pozostałe
zostają bez zmiany z podanym powodem. Stan: recenzja zamknięta po jednej rundzie. -->

# R-047 review

## Round 1 (2026-11-27, night run)

- Before: the first implementer run ended with `BLOCKED` (the Pi type contract over Pi's `tool_call` union),
  `review-guard.mjs compare --git` → "within its limits", exit 0; Decision 11 (night default) answered it, a new
  `snapshot --git` followed the edit of `ticket.md` (D-035), and a fresh implementer finished from the working tree
  (D-026); `compare --git` → "within its limits", exit 0. The main session's `gate.mjs --out
  node_modules/.rebuild-review/R-047.gate` → exit 0, 1487/1487 (348.7 s); `fails-before.mjs
  test/runtime/mistake-guard.test.ts test/hook/wake.test.ts test/runtime/pi-api.test.ts` → exit 0.
- Reply: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-047.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-11 met; five notes, no blocking finding. Taste questions: T-14, the manual line and the
  refusal are literal; T-29, each test fails for one reason, except the spawn test (a regression guard that cannot fail
  at `HEAD`) and the import test (note 3); T-30, the comments say why.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven: a short `sleep` followed by a redirection or a comment (`sleep 5 >/dev/null`, `sleep 5 2>&1`, `sleep 5 # wait`) is refused as a length the guard cannot read | no change: the guard fails closed by Decision 4; `outcome.md` → Open points 2 now names the comment form as well and records the idea as `rejected` with its revisit signal (note 5) |
| 2 | note · proven: `limenWake` gains the handler and keeps its `biome-ignore … split pending` (T-27 (1)) | no change: R-082's ratchet takes it, as for R-043, R-044, R-111 and R-112; `outcome.md` → Open points 1 |
| 3 | note · proven: the test "the mistake guard's module imports no module, so it starts no process, reads no file and writes nothing" matches only lines that start with `import`, so its name claims more than it checks | no change in this ticket (AC-11 is the reviewer's judgment, met by reading the module): R-060, which extends the module and its tests with T-42's timers, makes the test check what its name says; the note is in `plan.md` → `## Tickets` under R-060 |
| 4 | note · proven: the new test of `test/cli/spawn.test.ts` cannot fail at `HEAD` | no change: it guards that a job registers no handler (Change 2); `outcome.md` → Deviations 1 records it, and AC-5 leaves the file out |
| 5 | note · observed: `outcome.md` → Open points 2 hands the idea to "a later ticket" instead of T-17's form | fixed by the main session (D-053 (2): a `PASS` round whose fix touches only `outcome.md`): the idea is `rejected` with `Revisit when:` the transcripts show such a refusal at least twice (M-05 at seat step 4.8) |

No round of fixes; the review is closed.
