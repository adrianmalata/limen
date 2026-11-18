<!-- PL: Recenzja ticketu R-007 przez rebuild-reviewer. Runda 1 (19.11, tuż po północy): PASS, wszystkie kryteria
AC-1–AC-12 spełnione, dziewięć uwag bez znalezisk blokujących. Sesja główna poprawiła sprzeczność w outcome.md, a
pozostałe uwagi odrzuciła z powodem i wskazaniem ticketu, który je obejmie (R-014, R-016, R-080, R-083) albo decyzji
Adriana (D-034). Stan: zamknięty. -->

# Review: R-007 Cut the Picture viewer and the map jobs

## Round 1 (2026-11-19, day session)

- Inputs: `adrian-rebuild/R-007-cut-picture-viewer-map-jobs/ticket.md`, the diff from `review-guard.mjs diff --out
  node_modules/.rebuild-review/R-007.diff` (8,062 lines), `adrian-rebuild/taste.md`; the prompt added one fact: a
  direct `node --test` of a test that runs `git worktree list` fails on this laptop without the gate's shim (D-001).
- Main session before the review: `review-guard.mjs compare --git node_modules/.rebuild-review/R-007.git <ticket.md>`
  → exit 1, the three reserved paths the main session changed during `BLOCKED` (accepted by Adrian, D-035);
  `node adrian-rebuild/tools/gate.mjs` → exit 0, 127/127; `fails-before.mjs` → exit 0.
- Guard: `review-guard.mjs compare node_modules/.rebuild-review/R-007.before` → `unchanged`, exit 0.
- Parser: `review-verdict.mjs node_modules/.rebuild-review/R-007.reply <ticket.md>` → `consistent`, exit 0.
- Verdict: PASS. AC-1 to AC-12 met; nine notes, none blocking.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | `limen picture tick --help` and `picture watch on -h` print the usage and exit 0, because `main` handles `--help` first (`src/main.ts:147-150`) | note · proven | rejected: nothing is written, R-006's `ticket series` behaves the same, and the registry of R-014 owns help and subcommand refusals |
| 2 | `src/picture/picture-serve.ts:62` still says "the page sees it" | note · proven | rejected for this ticket: R-080 rewrites `picture-serve.ts` to serve record data only and owns its comments; the line is a comment, not behaviour |
| 3 | `docs/picture.md:38` gives the base address `http://127.0.0.1:4747/`, where `/` answers 404 | note · observed | rejected for this ticket: the table below names both paths and the 404; R-080 changes what serve serves and its doc |
| 4 | `test/plant.test.ts` fails at `HEAD` only if HEAD's waiter returns within the 1,000 ms tail | note · guessed | rejected: the main session's `fails-before.mjs test/plant.test.ts` failed at `HEAD`, as did the implementer's two runs; the delay is the one item 10 asks for |
| 5 | `settled` in `test/cli/old-names.test.ts` still waits for `born`, which `recordBorn` can leave behind | note · guessed | rejected for this ticket: item 10 keeps `settled` by Adrian's decision (D-034); `outcome.md` → `## Open points` records it for the lock and record tickets |
| 6 | Two help lines exceed T-10's 100 characters (`src/main.ts:130-131`) | note · proven | rejected: other help lines already do, and R-014 generates the help in groups |
| 7 | `outcome.md` contradicts itself on whether `test/plant.test.ts` fails in the path-less `fails-before.mjs` run, and the tool reports one exit code for all files | note · proven | fixed by the main session: `## Proof` and `## Fails before` say what each run shows; the per-file failures rest on the per-file runs |
| 8 | `test/picture/serve.test.ts:106`, `:117` cast `JSON.parse` results with `as` (T-27) | note · proven | rejected: the cast scan and its ratchet come with R-016; test code with the ratchet in R-082 |
| 9 | `test/picture/serve.test.ts` and `test/plant.test.ts` do not mirror a `src/` path (T-29 (1)) | note · observed | rejected: the ticket names the serve file; R-083 renames test files after their subject |

Taste questions (T-14, T-18, T-29, T-30, T-40, T-41): answered; T-18 points to finding 6, T-29 qualifies the five
serve tests (they fail at `HEAD` for one shared reason, `options.tip is not a function`, and guard kept behaviour
otherwise), T-30 points to finding 2.
