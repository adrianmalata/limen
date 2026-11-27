<!-- PL: Recenzja zmiany narzędzia `tools/changes-entries.mjs` (D-138). Runda 1 (27.11): FAIL z jednym znaleziskiem
blokującym (formatowanie Biome) i sześcioma uwagami; poprawki F1–F5 sesji głównej w ticket.md → Decisions. Runda 2:
PASS z trzema uwagami, bez zmiany, do punktów otwartych outcome.md. Stan: recenzja zamknięta. -->

# Review of the change of `tools/changes-entries.mjs` (D-138)

## Round 1 (2026-11-27, by day, `limen-rebuild-44`)

- Before: the main session built the change test first (the new tests failed at import); `node --test
  adrian-rebuild/tools/test-changes-entries.mjs` → exit 0, 8/8; `check.mjs` → exit 0. Its Biome run was read by the
  last line of the output only, which hid the error the reviewer found.
- Reply: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/changes-subject.diff` (the two tool files;
  R-045's uncommitted change stays out of it) and `taste.md`; `review-guard.mjs compare` → "unchanged";
  `review-verdict.mjs` → "consistent". Verdict **FAIL**: AC-4 not met; one blocking finding, six notes.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | blocking · proven: Biome's formatting fails on `expectedRollback` (AC-4) | fix (F1) |
| 2 | note · proven: no `outcome.md`, so AC-2's run is not on record | fix (F5): `outcome.md` with the main session's run |
| 3 | note · proven: two new tests fail for two reasons before the change, and the last one joins the count and the `awk` selection (T-29 (3)) | fix (F3): the last test split in two; the two reasons of the others are one mechanism (a body line counted as the ticket's commit) |
| 4 | note · observed: `commitsFor` (subject starts with `<id>:`) and the `awk` form (first field is `<id>:`) disagree for `R-045:x` or a leading space | fix (F2): `commitsFor` splits as `awk` does |
| 5 | note · proven: `## Change` item 2 names R-001, the tests R-002 | fix (F4) |
| 6 | note · proven: the comments cite D-138, not yet in HEAD; the test comment holds a SHA (T-30 (3)) | fix (F4, F5): the comment names no SHA; the `Tools:` commit follows R-045's, which carries D-138 |
| 7 | note · guessed: a later commit body that starts a line with an older entry's ID makes that entry collide | no change in code: D-138 records that the main session's commit bodies start no line with `R-NNN:`; `outcome.md` → Open points 1 |

## Round 2 (2026-11-27, by day, `limen-rebuild-44`)

- Before: F1–F5; `node --test adrian-rebuild/tools/test-changes-entries.mjs` → exit 0, 9/9; `check.mjs` → exit 0; Biome
  on `adrian-rebuild` → exit 0 (read by its exit code).
- Reply: `review-guard.mjs compare` → "unchanged"; `review-verdict.mjs` → "consistent". Verdict **PASS**: AC-1–AC-5
  met; three notes, none fixed (each needs code, and none is blocking): `outcome.md` → Open points 2–4.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven: no test tells `commitsFor`'s first-word match from a prefix match (`R-002:x`, a leading blank) | no change: no subject of that shape exists or is written; Open points 2 |
| 2 | note · proven: `check.mjs` takes 5.4 s instead of 1.8 s, since `commitsFor` reads the whole log twice per entry | no change: a tool of the main session, run once per commit; reading the log once per run is Open points 3 |
| 3 | note · guessed: D-009's form is kept when `--grep`'s commits are among the counted ones, not the other way round (a subject with a leading blank) | no change: as D-138 (2) words it; Open points 4 |

