<!-- PL: Recenzje poprawki fails-before.mjs (punkt otwarty 3 R-018) przez rebuild-reviewer. Runda 1: PASS z czterema
uwagami, wszystkie poprawione (zapis przebiegu przed zmianą w outcome.md, katalog kopii wypełniany wewnątrz `try`,
porównanie realpath z TMPDIR zamiast prefiksu, komentarz nazywa `privatePath` pollera). Runda 2: PASS z dwiema
uwagami, poprawione (test sprzątania nieudanej kopii, komentarz w 120 znakach). Runda 3: PASS z jedną uwagą
o streszczeniu PL outcome.md, poprawioną bez czwartej rundy (D-053 (2)). Stan: zamknięta. -->

# Review: `fails-before.mjs` makes its copy of HEAD under the gate's private TMPDIR

The same `rebuild-reviewer` in all three rounds (resumed with its context), given only the paths of `ticket.md`, the
diff (`review-guard.mjs diff`) and `taste.md`; `review-guard.mjs compare` printed `unchanged` after each round, and
`review-verdict.mjs` found each reply `consistent`.

## Round 1 (2026-11-23, day session)

Verdict: PASS. AC-1–AC-3 met; the reviewer ran the test file against HEAD's tool loaded in memory: only the new test
failed (`the copy ran in /tmp/fails-before-xZtSsG`).

| # | Finding | Resolution |
|---|---|---|
| 1 | note · proven: `outcome.md`, which AC-3 names for the before-change run, did not exist, and `fails-before.mjs` cannot select its own test file (`TEST_FILE`, the `test/` prefix) | fixed: `outcome.md` → `## Fails before` records the run against HEAD's tool copied beside the new test |
| 2 | note · observed: a run that fails in `headWith` after `mkdtempSync`, or is killed, leaves a copy of about 10 MB in the user's cache folder, which no reboot clears | fixed: the folder is made before the `try` and filled inside it (`fillWithHead`), so a failed fill is removed; a killed run is named in `## Risk` |
| 3 | note · guessed: the test compared a physical cwd with an unresolved, hard-coded prefix of gate-env's folder name | fixed: the fixture records its cwd and `TMPDIR`; the test compares the real path of the copy's parent with the real path of that `TMPDIR` |
| 4 | note · proven: the doc comment said "a test may refuse"; the code under test refuses (the poller's `privatePath`) | fixed: the comment at the copy names the poller's `privatePath` |

## Round 2

Verdict: PASS. AC-1–AC-3 met; at HEAD only the new test failed (`actual '/tmp'`).

| # | Finding | Resolution |
|---|---|---|
| 1 | note · proven: no test covered the new cleanup path | fixed: "a copy that cannot be made is removed, so the private folder keeps no leftover" (a listed test path missing from the working tree; `TMPDIR` set to the gate's folder); it fails at HEAD with the leftover `fails-before-IRTJek` |
| 2 | note · proven: the doc comment of `fillWithHead` was 123 characters, over `lineWidth` 120 | fixed: shortened |

## Round 3

Verdict: PASS. AC-1–AC-3 met; at HEAD both new tests failed, each on its last assertion only.

| # | Finding | Resolution |
|---|---|---|
| 1 | note · proven: the Polish summary of `outcome.md` named one new test | fixed without a fourth review (a text fix, D-053 (2)) |
