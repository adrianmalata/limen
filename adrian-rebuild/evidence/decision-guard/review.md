<!-- PL: Recenzje hooka tools/decision-guard.mjs (D-083) przez rebuild-reviewer. Runda 1: PASS z jedenastoma uwagami
bez blokujących; dziewięć poprawionych (wzorzec grepa, ciało heredoca, późniejsza flaga `sed -i`, linia spoza JSON jako
granica, testy separatorów i escape'ów, plan, rozbity test form Bash, wejście bez pól, komunikat bez ścieżek), każda
nowa reguła z testem, który pada na wersji z rundy 1; uwaga 8 zapisana jako niesprawdzony fakt, uwaga 11 trafia do
bloku `hooks`. Runda 2: PASS z pięcioma uwagami; cztery poprawione (tabela opcji grep i sed, test `--in-place`, linia
JSON niebędąca obiektem jako granica, liczba testów), jedna odrzucona (gałąź błędu wewnętrznego nieosiągalna z wejścia).
Runda 3: PASS z dwiema uwagami (długa opcja z argumentem w następnym słowie, za szeroka linia ticketu), obie
poprawione przez sesję główną bez czwartej rundy (D-086). Stan: zamknięta. -->

# Decision guard review

## Round 1 (2026-11-22, day session)

- Inputs: `adrian-rebuild/evidence/decision-guard/ticket.md`, the diff from `review-guard.mjs diff --out
  node_modules/.rebuild-review/decision-guard.diff`, `adrian-rebuild/taste.md`. The main session implemented the
  tool; the reviewer was told to run it only through its test file or a fixture on stdin.
- Main session before the review: `node --test adrian-rebuild/tools/test-decision-guard.mjs` → exit 0, 29/29, and
  exit 1, 0/24, before the tool existed; `check.mjs` and Biome → exit 0.
- Guard: `review-guard.mjs compare node_modules/.rebuild-review/decision-guard.before` → `unchanged`, exit 0.
- Parser: `review-verdict.mjs node_modules/.rebuild-review/decision-guard.reply <ticket.md>` → `consistent`, exit 0.
- Verdict: PASS. AC-1–AC-4 met. Taste questions: T-29 yes except the test of the Bash forms (note 7); T-30 mostly
  yes, the `SEPARATORS` comment says what and the doc of `entry()` names only a torn last line; T-40 and T-41 no owner
  step and no command.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | A grep whose pattern is a source path counts that source as searched, since every word after the program is tested | note · proven | fix: for grep and sed the first word after the flags is the pattern or script, never a file (`fileWords`) |
| 2 | Lines of a heredoc body are read as commands, so a body line `cat <source>` counts | note · proven | fix: after `<<` the lexer stops at the next newline; stopping can only miss a search |
| 3 | `sed -n -i …` counts: only the first flag group is checked | note · proven | fix: sed counts only with a flag group holding `n` and none holding `i`, and no `--in-place` (`sedPrints`) |
| 4 | Any line that is not JSON is skipped, so a damaged result line of the previous question makes the earlier searches count | note · proven | fix: the part after the final newline is left out; any other line that is not a JSON object is a boundary like a question (none in the 53,393 lines of the project's 40 transcripts) |
| 5 | The split at `(`, `)` and newline, the `\\` escape in double quotes and the first occurrence per id have no test | note · proven | fix: one test each, also for `;`, `\|` and `&`; 30 one-at-a-time mutations each fail a test |
| 6 | `## Change` item 3 is not in the diff (`## Commands`, `## State`) | note · proven | fix: the test in `## Commands`; the note in `## State` comes with the commit |
| 7 | The test of the Bash forms can fail for several reasons (T-29 (3)) | note · proven | fix: one form per test, each on the Reads of the other three sources (`shell`) |
| 8 | No checked fact says that a call blocked by a hook gets `is_error: true` | note · guessed | accepted: recorded under the ticket's facts as not checked; without the flag the guard blocks more, never less |
| 9 | A hook input with other field names passes every call | note · proven | fix: no string `tool_name` or no object `tool_input` → exit 2 for every call |
| 10 | Block reasons carry `transcript_path` and a stack, home paths the session could copy into a tracked file | note · observed | fix: the error's code for the transcript, the message for an internal error, no path |
| 11 | The guard fails closed only when node runs it; a relative hook path after a change of directory exits 1 | note · guessed | fix outside the tool: the `hooks` block names it through `"$CLAUDE_PROJECT_DIR"`; the ticket's `## Risk` says so |

## Round 2 (2026-11-22, day session; the last round of fixes)

- Inputs: `ticket.md` (its `## Decisions` lists round 1's fixes), the diff from `review-guard.mjs diff --out
  node_modules/.rebuild-review/decision-guard-2.diff`, `taste.md` and round 1 above; a re-review (T-06).
- Main session before the review: the test file → exit 0, 50/50; `check.mjs` and Biome → exit 0.
- Guard: `review-guard.mjs compare node_modules/.rebuild-review/decision-guard-2.before` → `unchanged`, exit 0.
- Parser: `review-verdict.mjs node_modules/.rebuild-review/decision-guard-2.reply <ticket.md>` → `consistent`, exit 0.
- Verdict: PASS. AC-1–AC-4 met; round 1's fixes 1–7, 9–11 checked against their decisions (the round-1 tool fails 8
  of the 50 tests). Taste questions: T-29 yes; T-30 yes for the new comments, except the `sedPrints` doc (no
  `--in-place`) and the `entry()` doc (arrays); T-40 and T-41 no owner step and no command.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | `fileWords` takes the first non-flag word as the pattern, so an option's separate argument (`-C 3`, `-m 1`) or a second `-e` makes a source path pattern count as a file | note · proven | fix: an option table (grep and git grep `e f m A B C d D`, sed `e f l`), `-e`, `-f` and the long pattern options give the pattern, `--` ends the options (`option`, `fileWords`); five tests fail on the round-2 tool |
| 2 | The `--in-place` check has no test | note · proven | fix: a test; the `sedPrints` doc names `--in-place` |
| 3 | A blank line and a JSON array line are skipped, not boundaries; the `entry()` doc is wrong for arrays | note · proven | fix: an array line is a boundary (its test fails on the round-2 tool); a blank line cannot have held a question and stays skipped, pinned by a test; `## Change` and the docs say so |
| 4 | 8 new tests fail on the round-1 tool, not 7 | note · proven | fix: `ticket.md` → `## Decisions` |
| 5 | The internal-error branch has no test; no fixture input reaches it | note · observed | rejected: no input reaches it; a test would need fault injection in the tool, a moving part for a branch that only keeps a defect fail-closed |

After the fixes: 62/62; 41 one-at-a-time mutations each fail at least one test.

## Round 3 (2026-11-22, day session)

- Inputs: `ticket.md` (its `## Decisions` lists the fixes of rounds 1 and 2), the diff from `review-guard.mjs diff
  --out node_modules/.rebuild-review/decision-guard-3.diff`, `taste.md` and rounds 1 and 2 above; a re-review (T-06).
- Main session before the review: the test file → exit 0, 62/62; the round-2 tool, rebuilt from its review diff,
  fails 6 of the 62; `check.mjs` and Biome → exit 0.
- Guard: `review-guard.mjs compare node_modules/.rebuild-review/decision-guard-3.before` → `unchanged`, exit 0.
- Parser: `review-verdict.mjs node_modules/.rebuild-review/decision-guard-3.reply <ticket.md>` → `consistent`, exit 0.
- Verdict: PASS. AC-1–AC-4 met (AC-2: the test source run where the root has no tool fails 61 of 62). Taste
  questions: T-29 yes, each of the 12 new tests fails for one reason; T-30 yes; T-40 and T-41 no owner step and no
  command.
- Two rounds of fixes were spent, so Adrian decided (Q-36, Q-37 → D-086: "zgodnie z rekomendacjami").

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | A long option that takes its argument as the next word (`--include '*.mjs'`, `--max-count 1`, git grep `--max-depth 1`) is read as taking none, so a source path that is grep's pattern counts as a searched file | note · proven | fix without a fourth round (D-086, Q-36 a): any long option without `=` takes the next word, a reading that can only miss a search; its test fails on the round-3 tool; the `--color` pin becomes `--color=auto` and the `--in-place` test uses `--in-place=.bak` |
| 2 | Line 43 of `ticket.md` is 150 characters wide | note · proven | fix without a fourth round (D-086, Q-37 a): wrapped at 120 |

After the fixes: 63/63; the round-3 tool fails only the new test; 42 one-at-a-time mutations each fail a test.
