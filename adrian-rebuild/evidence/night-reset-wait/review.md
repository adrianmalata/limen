<!-- PL: Recenzja zmiany nocnego runnera według D-131 (czekanie do resetu limitu subskrypcji bez zużycia
ponowienia). Runda 1 (27.11): PASS, AC-1–AC-4 spełnione, siedem uwag: pięć poprawionych przez sesję główną (F1–F5:
tekst ticketu, nieprawidłowa data resetu, typ limitu tylko jako zwykłe słowo, linie bez obietnicy ponowienia, test
resetu przy każdej linii `result`), jedna bez zmian z powodem. Runda 2: PASS z trzema uwagami, poprawionymi
w ostatniej rundzie poprawek (G1–G3: liczba testów w tickecie, streszczenie pliku testów, reset dalej niż siedem dni
jako brak czasu resetu). Runda 3: PASS z jedną uwagą do tekstu ticketu, poprawioną przez sesję główną. Stan:
recenzja zamknięta. -->

# Review of the night runner's wait for the limit's reset (D-131)

## Round 1 (2026-11-27, by day, `limen-rebuild-42`)

- Before: `node --test adrian-rebuild/tools/test-night.mjs` → exit 0 (39/39); with `HEAD`'s `night.mjs` 8 of the 10 new
  tests failed (1–7 and 10), and six mutations each failed their test (`outcome.md` → `## Fails before`); Biome and
  `check.mjs` exit 0.
- `review-guard.mjs snapshot` and `diff` into `node_modules/.rebuild-review/night-reset-wait.{before,diff}` (the two
  tool files and the ticket); `rebuild-reviewer` with the ticket, the diff and `taste.md`; `compare` → "unchanged";
  `review-verdict.mjs` → "consistent".
- Verdict PASS; AC-1–AC-4 met (the reviewer ran `HEAD`'s runner in memory: the same 8 failures; and `usageLimit` over
  the real `.night/` logs: five_hour 22:30 for 2026-11-26 runs 1–3, 03:00 for 2026-11-20 runs 1–2, none for a
  completed run). Seven notes:

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven: `## Change` lists a `## State` entry that the change lacks | no change to the tool files: the main session writes the entry into `plan.md` before the commit, and it goes into the same `Tools:` commit |
| 2 | note · proven: a non-string `rateLimitType` gives "subscription", not `undefined` as `## Change` says | fix (F1): the ticket says "subscription", the word the log line reads well with |
| 3 | note · proven: the wait line differs from the format quoted in `## Change` | fix (F1): the ticket quotes the line as the code writes it |
| 4 | note · proven: a safe-integer `resetsAt` above 8.64e12 makes an Invalid Date and a "NaN" line | fix (F2): an invalid date is the "no reset time" case, with a test |
| 5 | note · observed: `rateLimitType` goes unescaped into the log, so a newline could forge a `night:` line | fix (F3): only a plain word (`[a-z_]+`) is taken, otherwise "subscription", with a test |
| 6 | note · proven: "a counted retry" is logged when no retry follows | fix (F4): the line states the fact; the next line says whether a retry or the end follows |
| 7 | note · proven: no test covers resetting the limit message at each `result` line | fix (F5): a test of a run whose second limit `result` has no message of its own |

## Round 2 (2026-11-27, by day, `limen-rebuild-42`)

- Before: F1–F5 made by the main session; `node --test adrian-rebuild/tools/test-night.mjs` → exit 0 (42/42); with
  `HEAD`'s `night.mjs` 11 of the 13 new tests failed (1–7, 10–13); nine mutations each failed their test; Biome and
  `check.mjs` exit 0. Snapshot and diff taken again (the two tool files, the ticket and this file).
- `compare` → "unchanged"; `review-verdict.mjs` → "consistent". Verdict PASS; AC-1–AC-4 met (the reviewer's own run of
  `HEAD`'s runner in memory: the same 11 failures). Three notes, all fixed in the last round of fixes:

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven: `## Change` says "Ten new tests" and lists 13; one ticket line is 183 characters wide | fix (G1): the count and the wrap |
| 2 | note · proven: the test file's Polish summary says a subagent's limit gives an ordinary retry (test 7 waits for the main session's reset) and leaves out the F3 test | fix (G2): the summary says what the tests check |
| 3 | note · proven: a `resetsAt` in milliseconds passes the checks and ends the night at once with exit 3, against the ticket's fallback | fix (G3): a reset more than seven days (the longest window) after the run's end is no usable reset time, with a test |

## Round 3 (2026-11-27, by day, `limen-rebuild-42`)

- Before: G1–G3 made by the main session; `node --test adrian-rebuild/tools/test-night.mjs` → exit 0 (43/43); with
  `HEAD`'s `night.mjs` 12 of the 14 new tests failed (1–7, 10–14); ten mutations each failed their test; Biome and
  `check.mjs` exit 0. Snapshot and diff taken again.
- `compare` → "unchanged"; `review-verdict.mjs` → "consistent". Verdict PASS; AC-1–AC-4 met (the reviewer's own run of
  `HEAD`'s runner in memory: the same 12 failures, each at one assertion; six mutations of the guards, each failing
  one test; `usageLimit` over the real logs also gives `seven_day` for 2026-11-20 run 3). One note:

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven: `## Change` names `usageLimit(text)` and a positive-integer `resetsAt`; the code takes `ended` and bounds the reset by the longest window | fixed by the main session in the ticket's text (D-053 (2): ticket text only, no further round) |
