<!-- PL: Recenzja ticketu R-043 (przypomnienia „just in time” niosą tekst sekcji w wyniku narzędzia; wizja przy
tickecie w `spec/features/planned/`, nie po `limen spawn` ani `git merge`). Runda 1 (27.11, w dzień): PASS przy
wszystkich kryteriach spełnionych, z dziewięcioma uwagami; siedem idzie do rundy poprawek F1–F7 (rozdzielenie dwóch
testów, wzorzec tworzenia nie działa na polecenie `limen`, test zapisu w jobie, dokumentacja o `session_start`,
szerokość komentarzy, jedna linia nagłówka pliku testów; `ticket.md` → `## Decisions` 14), dwie bez zmiany z powodem.
Runda 2: PASS z trzema uwagami, poprawionymi w ostatniej rundzie (G1–G3). Runda 3: PASS z dwiema uwagami do punktów
otwartych `outcome.md` (D-092). Stan: recenzja zamknięta. -->

# R-043 review

## Round 1 (2026-11-27, by day, `limen-rebuild-42`)

- Before: the implementer's run (after `BLOCKED` → Decisions 12 and 13) → `review-guard.mjs compare --git` → "within its
  limits", exit 0; the main session's `gate.mjs --out node_modules/.rebuild-review/R-043.gate` → exit 0, 1382 tests,
  1382 pass (336.3 s); `fails-before.mjs` on the four files of AC-5 → exit 0; AC-6–AC-10 exit 1 as expected; Biome and
  `check.mjs` exit 0.
- Reply: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-043.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-13 met; nine notes, no blocking finding.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · observed: the structuredContent test also asserts the new reminder text, so it fails at `HEAD` for two reasons | fix (F1): it asserts the kept `structuredContent` alone (T-29 (3)) |
| 2 | note · observed: the A-038 test combines the Specs text and the audience gate | fix (F2): two tests (T-29 (3)) |
| 3 | note · proven: the kept creation pattern fires on a `limen spawn` whose task text holds `touch` and a planned path, and on a `git mv` out of `planned/` | fix (F3) for the spawn case: AC-13 says never on `limen spawn`, so a `limen` command is matched only by the `limen ticket new` rule; no change for the move: `## Change` 1 keeps today's pattern, and the move goes to `outcome.md` → Open points |
| 4 | note · observed: the vision on a job's `write` is untested | fix (F4): a test (`## Change` 4 names both tools in both sessions) |
| 5 | note · observed: the docs say "once until a compaction", but every `session_start` (also `/reload`) starts over | fix (F5): `docs/setup.md` and `CONTRIBUTING.md` name both, as `## Change` 1 does |
| 6 | note · observed: `hook/group-peer.ts` still drops `structuredContent` in a group member | no change: outside `## Change`; `outcome.md` → Open points (the implementer's point 1) |
| 7 | note · guessed: the `json` guard refuses an object with a property set to `undefined` | no change: Pi declares `JsonValue`, which has no `undefined`, and no Pi 1.5.1 tool builds one; T-32 (4) refuses an unexpected shape (Decision 12) |
| 8 | note · observed: two rewritten comment lines exceed 120 columns | fix (F6): wrapped (T-27) |
| 9 | note · observed: the hook test file's opening comment grew to six lines | fix (F7): one opening line (T-29 (5)), since this ticket rewrites the file's header |

## Round 2 (2026-11-27, by day, `limen-rebuild-42`)

- Before: F1–F7 by the resumed implementer, whose gate failed once on an unrelated wake test → `BLOCKED` → Q-93 →
  D-133 (measured 10/10 on this tree and 10/10 at `HEAD`; A-092, R-112; `ticket.md` → Decision 15); `compare --git` →
  "within its limits"; the main session's gate once more → exit 0, 1385/1385 (350.2 s); `fails-before.mjs` on AC-5's
  four files → exit 0.
- Reply: `review-guard.mjs compare` → "unchanged"; `review-verdict.mjs` → "consistent". Verdict **PASS**; AC-1–AC-13
  met; three notes, the last round of fixes:

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven: `outcome.md` → `## Fails before`, `## Proof` and its summary still show the state before round 1 and the failed gate | fix (G3), by the main session at protocol step 7, from the last gate and `fails-before.mjs` runs |
| 2 | note · proven: F3's pattern also takes a path segment such as `git -C /home/u/limen mv …` for a `limen` command, so that creation gets no vision | fix (G1): a `limen` command is `limen` in command position (the start, or after `;`, `&`, `|` or `(`), possibly by its path; a test. The compound case (`cp … && limen board`) follows F3's wording: no change |
| 3 | note · observed: the F2 test of the Specs text is named "A-038", which is the next test's subject; its comment says A-041 | fix (G2): the test is named after A-041 |

## Round 3 (2026-11-27, by day, `limen-rebuild-42`)

- Before: G1 and G2 by the resumed implementer (`compare --git` → "within its limits"); G3 by the main session
  (`outcome.md` → `## Proof` and `## Fails before`); the main session's gate → exit 0, 1386/1386 (334.7 s);
  `fails-before.mjs` on AC-5's four files → exit 0.
- Reply: `review-guard.mjs compare` → "unchanged"; `review-verdict.mjs` → "consistent". Verdict **PASS**; AC-1–AC-13
  met; two notes. The rounds of fixes are spent, so both go to `outcome.md` → Open points (D-092):

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven: G1's command-position class leaves out a newline, so a multi-line Bash `limen spawn` whose note holds `touch` and a planned path brings the vision, and a multi-line `limen ticket new` none | no change in this ticket: `outcome.md` → Open points 6, for Adrian at gate 5.4 |
| 2 | note · proven: the `limen ticket new` and `--lane active` tests read the whole command, not their own `limen` call | no change in this ticket: `outcome.md` → Open points 7 |
