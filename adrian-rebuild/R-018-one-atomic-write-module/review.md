<!-- PL: Recenzje ticketu R-018 (jeden moduł zapisu atomowego src/atomic-write.ts i skan prymitywów zapisu). Runda 1:
PASS z siedmioma uwagami; sześć idzie do poprawek wznowionego implementera (okno dwóch nazw przy zapisie wyłącznym
pliku odpowiedzi GitHub, prawa kopiowanego transkryptu, fałszywy komentarz wzorca plików tymczasowych, testy EACCES,
brakujące testy dwóch filtrów i formy synchronicznej), jedna odrzucona z powodem. Runda 2: PASS z pięcioma uwagami: dwie poprawione przez sesję główną (liczba testów, D-057
w osobnym commicie), trzy do R-021 i R-025. Stan: zamknięta. -->

# R-018 review

## Round 1 (2026-11-20, day session `limen-rebuild-11`)

- Before: `review-guard.mjs compare --git` after the implementer → "the implementer's run is within its limits", exit
  0; the main session's `node adrian-rebuild/tools/gate.mjs` → exit 0, 333/333; `node
  adrian-rebuild/tools/fails-before.mjs` → exit 0 (five files "fail at HEAD (exit 1)"), recorded in `outcome.md`
  before the review.
- Reviewer: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-018.diff` and `taste.md`;
  `review-verdict.mjs` → "consistent", exit 0; `review-guard.mjs compare` → "unchanged", exit 0.
- Verdict: **PASS**. AC-1–AC-8 met.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | An `exclusive` write gives the target a second name between `link` and `unlink`; the poller's `readJobFile` refuses `nlink` ≠ 1, so a crash there leaves `github resolve`'s `outcomes/<id>.json` unreadable for ever (`src/atomic-write.ts:49-50`, `src/commands/github.ts:190-194`) | fix |
| 2 | A folder `fsync` or temp `unlink` that fails after the commit point is rethrown, so callers that read any error as "not done" misjudge a done effect (`src/atomic-write.ts:49-58`) | rejected |
| 3 | The transcript copy of publication no longer keeps the source file's permission bits (`src/job/publication.ts:154`) | fix |
| 4 | The doc comment of `TEMPORARY_NAME` says it covers the temps of the copies it replaced, which is false for `saveJson`, Picture and the poller (`src/atomic-write.ts:18`; T-30) | fix |
| 5 | The two EACCES tests assert only the error code, so they do not pin that the folder is synced after the rename (`test/atomic-write.test.ts:86-99`, `:163-178`) | fix |
| 6 | Two of the five temp filters have no test (`src/commands/sweep.ts:77`, `src/job/record.ts:39`), and `outcome.md:149` names the tested ones wrongly | fix |
| 7 | The sync form has fewer tests: `atomicWriteSync` with `exclusive` creating a missing file, with `mode`, and `atomicRenameSync` syncing the source folder | fix |

Fixes (for the resumed implementer, `ticket.md` → `## Decisions`): 1, 3, 4, 5, 6, 7.

Rejected, with reasons:
- 2: a failure after the rename or link is an I/O error of the folder (`EIO`) or a folder mode Limen never sets on its
  own folders (write without read); the write's durability is then not known, and T-01 requires the error to
  propagate rather than be read as success. A caller cannot recover from a failing disk either way, and before this
  change the same callers already read every error of their `wx` create as "not done".

## Round 2 (2026-11-20, day session `limen-rebuild-11`)

- Before: `review-guard.mjs compare --git` after the resumed implementer (a new snapshot after the main session's
  edit of `ticket.md`, D-035) → "within its limits", exit 0; the main session's `gate.mjs` → exit 0, 340/340;
  `fails-before.mjs` → exit 0 (nine files "fail at HEAD (exit 1)"), recorded in `outcome.md` before the review.
- Reviewer: a fresh `rebuild-reviewer` with the same three paths; `review-verdict.mjs` → "consistent", exit 0;
  `review-guard.mjs compare` → "unchanged", exit 0.
- Verdict: **PASS**. AC-1–AC-8 met.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | The comment at `src/job/record.ts:12` says every job file is written by `atomicWrite`; `log` is appended to (T-30) | to R-021 (`## Tickets` → notes) |
| 2 | `outcome.md` counts 5 tests in `test/job/`; there are 4 | fixed by the main session (D-053 (2)) |
| 3 | The transcript copy passes the mode through the umask, so the copy can be narrower than with `copyFile`; the comment "as `copyFile` did" holds only for the usual umasks (`src/job/publication.ts:154-159`) | to R-021 (`## Tickets` → notes) |
| 4 | `plan.md` in the diff carries D-057 and R-021's row; under `R-018:` a revert of R-018 would revert D-057 | fixed: D-057 committed on its own (`d27a2c7`) before R-018 |
| 5 | The headers of `test/cli/github.test.ts` (two lines) and `test/cli/continue.test.ts` (does not name the new test) drift from T-29 (5) | to R-025 (`## Tickets` → notes) |

No second round of fixes: the notes that touch code or tests are a false or incomplete comment and two test headers,
and each goes to the ticket that rewrites the place (R-021 rewrites `record.ts` and the publication, R-025 has T-29 as
a source), the pattern of R-014's round 4 (D-044) and R-016's round 3.
