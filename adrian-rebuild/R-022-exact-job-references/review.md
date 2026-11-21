<!-- PL: Recenzje ticketu R-022 (dokładne odwołania do jobów przez jeden resolver, T-20). Runda 1 (noc 21.11): PASS
z czterema uwagami, wszystkie poprawione przez świeżego implementera rano. Runda 2 (21.11 rano): PASS z trzema
uwagami: dwa komentarze, które mówią więcej niż kod (id.ts i record.ts), idą do drugiej i ostatniej rundy poprawek,
a niestabilny test wyścigu w test/cli/stop.test.ts leży poza zmianą R-022 (zapis rekordu w test/plant.ts z R-021)
i poszedł do R-093 (D-063). Runda 3 (21.11, autopilot): PASS z czterema uwagami; dwie w outcome.md poprawiła sesja
główna, dwie w kodzie (raport migracji o wspólnym tokenie, komentarz w keeper.ts) czekają na pytanie Q-11. Stan:
zamknięta. -->

# R-022 review

## Round 1 (2026-11-21, night run)

- Before: `review-guard.mjs compare --git` after the implementer → "the implementer's run is within its limits",
  exit 0; the main session's `gate.mjs` → exit 0, 498/498; `fails-before.mjs` → exit 0 (seven files), recorded in
  `outcome.md` before the review.
- Reviewer: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-022.diff` and `taste.md`;
  `review-verdict.mjs` → "consistent", exit 0; `review-guard.mjs compare` → "unchanged", exit 0.
- Verdict: **PASS**. AC-1–AC-12 met.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven: a damaged record joins every candidate list and counts toward "several", so with one damaged record in the project a reference that matches exactly one job gets `next` `limen status --all`, and the damaged record is listed for words it does not match (`src/job/reference.ts`) | fix |
| 2 | note · proven: `docs/commands.md:7` says every other form gets "the exact command in `next`", while several or no candidates give `limen status --all` | fix |
| 3 | note · proven: the job id and token formats have three copies and the folder listing two (`src/job/reference.ts`, `src/outcome.ts`, `src/job/migration.ts`), against T-25 (1) and (2) | fix |
| 4 | note · proven: the `UNTYPED_THROWS` ratchet stays at 275 − 14, though the change removes four `throw new Error(` sites (`test/structure.test.ts`) | fix |

Fixes (for a fresh implementer, `ticket.md` → `## Decisions`): 1–4. Notes 1, 3 and 4 change code and tests, so they
get a round (D-053 (2)); note 2 goes with them.

## Round 2 (2026-11-21, by day)

- Before: the fresh implementer's run of fixes 1–4 → `review-guard.mjs compare --git` "within its limits", exit 0; the
  main session's `gate.mjs` → exit 0, 502/502; `fails-before.mjs` → exit 0 (the same seven files), recorded in
  `outcome.md` before the review.
- Reviewer: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-022.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-12 met.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven: the unchanged race test "a stop that read a starting job, whose wrapper then won the race to running, …" in `test/cli/stop.test.ts` fails in two of six runs, because the test's plant rewrites `record.json` with a plain `writeFile` (`test/plant.ts`, `writeRecord`) while `finalizeJob` reads it (`src/job/finalize.ts:42`) | not fixed here: none of its lines is in R-022's change (R-021 added the test and the plant writer); a question to Adrian (D-029) |
| 2 | note · proven: `src/job/id.ts:3` says `makeJobId` makes ids of the form, while `makeJobId` and `jobToken` (`src/job/job.ts`) import nothing from `id.ts`, so a change to one side is caught only indirectly | fix |
| 3 | note · proven: `src/job/record.ts:11-12` calls `jobFolderNames` "the one listing of a folder of job folders", while `jobFoldersSync` keeps its own `readdirSync` and four other modules list `.limen/jobs` themselves | fix |

Fixes (for a fresh implementer, `ticket.md` → `## Decisions`; the second and last round of fixes): 2 and 3. They
change code and a test, so they get a round (D-053 (2)).

## Round 3 (2026-11-21, by day, autopilot of D-063 (4))

- Before: the round-2 implementer's run → `review-guard.mjs compare --git` "within its limits", exit 0; its gate failed
  once on the unchanged queue test and it replied `BLOCKED` (D-029), settled by D-063 (2); the main session's
  `gate.mjs` → exit 0, 504/504; `fails-before.mjs` → exit 0 (eight files), recorded in `outcome.md` before the review.
- Reviewer: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-022.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-12 met.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven: the `fails-before.mjs` output of the round-2 tree sits under `## Proof`, while AC-8 places it under `## Fails before` (`outcome.md`) | fixed by the main session (D-053 (2)) |
| 2 | note · proven: the Polish summary of `outcome.md` ends at the implementer's failed gate and `BLOCKED`, without the main session's 504/504 run | fixed by the main session (D-053 (2)) |
| 3 | note · proven: the migration reports a token shared by a job in `.limen/jobs/` and a folder in `.limen/unmigrated/` as one that only full ids name, as `## Migration` says, while `resolveJob` counts owners only among `.limen/jobs/`, so that job's token still resolves; no wrong job can be named (`src/job/migration.ts`, `src/job/reference.ts`) | not fixed: the two rounds of fixes are used; `.night/questions.md` → Q-11 (no ticket blocked) |
| 4 | note · proven: the new comment in `src/commands/keeper.ts` says "A job named twice is read once", while the de-duplication is by word, so a job given by its token and as a member of `--group` is resolved twice (T-30) | not fixed: as finding 3, Q-11 |

R-022 is closed with the round-3 PASS, as R-019 and R-021 were (Q-9, Q-10).
