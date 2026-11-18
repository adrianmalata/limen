<!-- PL: Recenzja ticketu R-009 przez rebuild-reviewer. Runda 1 (19.11, nocny przebieg): PASS, kryteria AC-1–AC-11
spełnione, pięć uwag bez znalezisk blokujących. Sesja główna poprawiła nazwę nowego pliku testu (T-29 (1)) i dopisała
do outcome.md własne przebiegi bramki i fails-before; resztę uwag odrzuciła albo przyjęła z powodem. Runda 2: PASS
z jedną uwagą (nazwy w fiksturze), odrzuconą z powodem. Stan: zamknięty. -->

# Review: R-009 Cut the scout role and the `jg` cue

## Round 1 (2026-11-19, night run)

- Inputs: `adrian-rebuild/R-009-cut-scout-jg-cue/ticket.md`, the diff from `review-guard.mjs diff --out
  node_modules/.rebuild-review/R-009.diff`, `adrian-rebuild/taste.md`.
- Main session before the review: `review-guard.mjs compare --git node_modules/.rebuild-review/R-009.git <ticket.md>`
  → "within its limits", exit 0; `node adrian-rebuild/tools/gate.mjs` → exit 0, 133/133; `fails-before.mjs` → exit 0.
- Guard: `review-guard.mjs compare node_modules/.rebuild-review/R-009.before` → `unchanged`, exit 0.
- Parser: `review-verdict.mjs node_modules/.rebuild-review/R-009.reply <ticket.md>` → `consistent`, exit 0.
- Verdict: PASS. AC-1 to AC-11 met; five notes, none blocking.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | `outcome.md` has no output of the main session's `fails-before.mjs` and gate runs (`## Agents` step 4) | note · proven | fixed by the main session: `## Final runs` and `## Fails before` hold its runs |
| 2 | Item 3's "building the context message starts no process" is too wide: the coordinator's cue can still start `git` through `listDrift` (`src/project/inherit.ts`) | note · proven | accepted as a wording fix: `ticket.md` → `## Decisions` and the outcome say "no process that detects a tool"; the drift call is outside T-36's tool detection, and R-039 (T-36 among its sources) meets it |
| 3 | The refusal says "a survey job", where T-34 says "a survey ticket" | note · observed | rejected: the survey job shape is what exists today; survey tickets come with R-065, which can change the line and its test together; the wording is for Adrian at gate 5.1 |
| 4 | The u3 test name and task text were reworded, not only shortened | note · observed | accepted: the remaining text stays true, the file passes at `HEAD`, and the outcome records the deviation |
| 5 | `test/hook/context-tools.test.ts` does not mirror the module it tests (T-29 (1)); the mirror is `test/hook/communication.test.ts` | note · observed | fixed by the main session: `git add` and `git mv` to `test/hook/communication.test.ts`, content unchanged (the implementer cannot rename an untracked file); the ticket's item 5 and AC-5 name the new path |

Taste questions (T-14, T-18, T-29, T-30, T-40, T-41): answered; T-18 points to finding 3, T-29 to finding 5 (each
test fails at `HEAD` for one reason; the project-file guard passes there by design), T-40 and T-41 do not apply.

## Round 2 (2026-11-19, night run)

- Inputs: the same three paths; the new diff from `review-guard.mjs diff --out node_modules/.rebuild-review/R-009.diff`
  (the rename of finding 5 and the outcome edits of finding 1); a fresh reviewer.
- Main session before the review: `node adrian-rebuild/tools/gate.mjs` → exit 0, 133/133; `fails-before.mjs` →
  exit 0, with `test/hook/communication.test.ts` among the files that fail at `HEAD`.
- Guard: `review-guard.mjs compare node_modules/.rebuild-review/R-009.before` → `unchanged`, exit 0.
- Parser: `review-verdict.mjs node_modules/.rebuild-review/R-009.reply <ticket.md>` → `consistent`, exit 0.
- Verdict: PASS. AC-1 to AC-11 met; one note, not blocking.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | The renamed test still uses `context-tools` in its fixture job id and temporary folder prefix (`test/hook/communication.test.ts:10`, `:30`) | note · proven | rejected: they are fixture labels that no reader resolves to a file, and the reviewer calls them harmless; changing them would need a third review for no change of behaviour |

Taste questions (T-14, T-18, T-29, T-30, T-38, T-40, T-41): answered; T-29 confirms the mirror name and one reason
per failing test; T-30 notes that the reason for the empty `LIMEN_HOME` is in the outcome, not in the code, which the
reviewer accepts for a test helper.
