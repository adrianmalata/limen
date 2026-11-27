<!-- PL: Recenzja zmiany `gate.mjs --out` (D-130). Runda 1 (27.11): werdykt PASS, ale strażnik review-guard ją
unieważnił, bo w jej trakcie zmienił się `.claude/settings.local.json` (dopisek Adriana do allow-listy, zgłoszony
w rozmowie); jej uwagi sprawdziła sesja główna: trzy poprawione (F1–F3), cztery bez zmian z powodem. Runda 2: PASS
z pięcioma uwagami, wszystkie poprawione w ostatniej rundzie poprawek (G1–G5). Runda 3: PASS z czterema uwagami: trzy do punktów otwartych
`outcome.md` (D-092), jedna poprawiona w tekście ticketu. Stan: recenzja zamknięta. -->

# Review of `gate.mjs --out` (D-130)

## Round 1 (2026-11-27, by day, `limen-rebuild-41`) — void

- Before: `node --test adrian-rebuild/tools/test-gate.mjs` → exit 0 (10/10); the three new tests failed before the
  change (10 tests, 7 pass, 3 fail); `test-review-guard.mjs` → exit 0 (23/23); Biome and `check.mjs` exit 0.
- Reply: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/gate-out.diff` (the three tool files and
  this change's `plan.md` hunks; the tree also holds R-042's uncommitted change) and `taste.md`; verdict PASS,
  AC-1–AC-5 met, seven notes.
- `review-guard.mjs compare` → exit 1: `.claude/settings.local.json` changed during the review. Adrian added the
  allow-list entry of D-130 (`Bash(node adrian-rebuild/tools/gate.mjs *)`) at that time and said so in the
  conversation; the reviewer has no Write or Edit tool, and its note 6 saw the file before the entry. The guard cannot
  tell the two apart, so the review is void and runs again (protocol step 5); the file is Adrian's and is not restored.
  The notes are facts the main session checked itself:

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven: with `--out`, a listing that fails after the check loses the check's whole output, since the throw removes the temporary file | fix (F1): that is the loss D-130 ends |
| 2 | note · proven: the order test prints all stdout before all stderr, so it cannot tell one descriptor from a stdout-first join | fix (F2) |
| 3 | note · proven: gate-env's shim notice goes only to the terminal, not into the `--out` file | no change: it describes the environment (git < 2.36) and prints before the check, at the start of the output, which the tool keeps; it names no test |
| 4 | note · proven: three new lines are wider than 120 columns (T-27) | fix (F3) |
| 5 | note · observed: `outcome.md` does not exist yet | no change: the main session writes it before the commit (protocol step 7) |
| 6 | note · observed: the allow-list holds only the bare gate command | no change: Adrian added `Bash(node adrian-rebuild/tools/gate.mjs *)` during the review (see above) |
| 7 | note · observed: `plan.md` also holds D-131 and the night's State, which this change does not name | no change to the files: they are committed apart from this `Tools:` commit, in the commit of D-130 and D-131 before it |

## Round 2 (2026-11-27, by day, `limen-rebuild-41`)

- Before: fixes F1–F3 (`ticket.md` → `## Decisions` 2); `test-gate.mjs` → exit 0 (11/11); two mutations each fail one
  test (`outcome.md` → `## Fails before`); Biome and `check.mjs` exit 0.
- Reply: `rebuild-reviewer` with the ticket, the new `node_modules/.rebuild-review/gate-out.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0 (the saved reply keeps
  the criteria and findings verbatim and abbreviates the taste answers).
- Verdict: **PASS**. AC-1–AC-5 met; five notes, no blocking finding. All five are fixed in the last round of fixes
  (`ticket.md` → `## Decisions` 3), so round 3 reviews them.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven: two lines of `test-gate.mjs` are wider than 120 columns with a tab as two (`:5`, `:144`) | fix (G1) |
| 2 | note · proven: the fixture's comment does not say that it prints the given lines (`test-gate.mjs:26`) | fix (G2) |
| 3 | note · proven: the failed listing changes the form without `--out` too, and no test covers a failing check with a failing listing | fix (G3): a test, and `## Change` says it |
| 4 | note · proven: any other argument is dropped silently, so `--output <file>` runs the whole check and keeps nothing | fix (G4): exit 2 with the usage |
| 5 | note · observed: a run that ends before its rename leaves an earlier run's file at `<file>` to be read as its own | fix (G5): the earlier file is removed first |

## Round 3 (2026-11-27, by day, `limen-rebuild-41`)

- Before: fixes G1–G5 (`ticket.md` → `## Decisions` 3); `test-gate.mjs` → exit 0 (14/14); at `HEAD` 7 of 14 fail,
  exactly the new tests; two more mutations each fail one test; Biome and `check.mjs` exit 0.
- Reply: `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0 (the saved
  reply abbreviates the taste answers).
- Verdict: **PASS**. AC-1–AC-5 met; four notes, no blocking finding. The two rounds of fixes are spent, so a note that
  needs code or tests goes to the open points (D-092).

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven: `--out` with no file exits 1 with a stack, not exit 2 with the usage | to `outcome.md` → Open points 3 |
| 2 | note · observed: no mutation run removes the `own` exclusion | to `outcome.md` → Open points 4 |
| 3 | note · observed: the implementer's definition still runs the bare gate | to `outcome.md` → Open points 5, for Adrian (his path) |
| 4 | note · proven: `## Migration` says the default run is unchanged | fixed by the main session in `ticket.md` (a text of the ticket, no code) |
