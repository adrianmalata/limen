<!-- PL: Recenzje ticketu R-021 (jeden record.json na job, zapis tylko przez funkcję przejścia, polecenie limen
migrate). Runda 1 (noc 20/21.11): FAIL z czterema znaleziskami blokującymi (podwójne foldery w raporcie migracji,
utracone wartości activity i last-tool, usunięty test liczenia steerów, karencja startowa dla nieznanej tożsamości)
i dziewięcioma uwagami; wszystkie blokujące i osiem uwag poprawione, jedna odrzucona (night default). Runda 2: FAIL
z jednym blokującym (uszkodzony rekord zatrzymywał przegląd wybudzeń w hooku) i siedmioma uwagami; pięć poprawionych
w drugiej, ostatniej rundzie, trzy odrzucone z powodem. Runda 3: PASS z pięcioma uwagami; dwie linie dokumentacji
poprawiła sesja główna, cztery uwagi w kodzie i prompcie czekają na decyzję Adriana (pytanie nocne Q-10). Stan:
zamknięta. -->

# R-021 review

## Round 1 (2026-11-21, night run)

- Before: two implementer runs (the first cut off by the 5-hour limit at 02:06, the second fresh one from 03:40 on the
  partial tree); `review-guard.mjs compare --git` after each → "the implementer's run is within its limits", exit 0;
  the main session's `gate.mjs` → exit 0, 468/468; `fails-before.mjs` → exit 0 (30 files), recorded in `outcome.md`
  before the review.
- Reviewer: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-021.diff` and `taste.md`;
  `review-verdict.mjs` → "consistent", exit 0; `review-guard.mjs compare` → "unchanged", exit 0.
- Verdict: **FAIL**. AC-1–AC-12 met; AC-13 not met (findings 2 and 4).

| # | Finding (short) | Decision |
|---|---|---|
| 1 | blocking · proven: a real migration lists every folder it moved twice, so the report shows a false token collision and a duplicate older-id line for each moved folder (`src/job/migration.ts`) | fix |
| 2 | blocking · proven: the migration removes `activity` and `last-tool` without keeping their values when `tool-calls` is missing or not a count, which HEAD's wrapper allowed (`src/job/migration.ts`) | fix |
| 3 | blocking · proven: HEAD's test "finalizeJob counts each steer left in the inbox in its log line, but not the temp of a steer write" was deleted, not moved; the mechanism lives on in `src/job/finalize.ts` | fix |
| 4 | blocking · proven: a `running` record with an unknown identity counts as live for the 10-minute startup grace, against Change 1 ("nothing keeps a job running on it"), though the identity is written in the same transition as `running` (`src/runtime/reap.ts`) | fix |
| 5 | note · proven: `limen stop` on a starting job finalizes from `starting` or `running`, so a wrapper that moved to `running` between the read and the finalize is ended as `stopped` without a signal and runs its engine (`src/commands/stop.ts`, `src/job/finalize.ts`) | fix |
| 6 | note · proven: `transition`'s comment says the next change writes a dead claim's record, but only a terminal change claims; and the loser's `prepare` (its log line) runs before the claim check (`src/job/record.ts`) | fix |
| 7 | note · proven: `finishFolder` completes an interrupted migration without writing a missing `progress.json`, so it loses the progress values (`src/job/migration.ts`) | fix |
| 8 | note · observed: the record read accepts `nlink` 0 where the ticket says 1 | rejected |
| 9 | note · observed: `docs/seat/bell.ts` runs only when `process.argv[1]` equals its own path, so a start through a symlinked path exits without ringing; `seat/deploy.ts` compares real paths | fix |
| 10 | note · observed: two new catch-alls in the migration swallow every error, not only an absent file (T-01) (`src/job/migration.ts`) | fix |
| 11 | note · observed: the refusal tests of `MIGRATE_JOBS_RUNNING` and `NOT_MIGRATED` do not start with their refusal ID (T-29 (2)) (`test/cli/migrate.test.ts`) | fix |
| 12 | note · observed: the coordinator manual's list of pulse words leaves out the new `unknown` pulse (`templates/agents.md`) | fix |
| 13 | note · guessed: the 40-character cut can separate the two escapes of one character beyond U+FFFF in category Cf (`src/boundary.ts`) | fix |
| T-29 | taste answer: three new tests check two mechanisms each (the claim and the dead-claim recovery; `ownerState` and the reaper's grace; `ownerState` and the reaper for another boot id) | fix |

Fixes (for a fresh implementer, `ticket.md` → `## Decisions`): 1–7, 9–13 and the T-29 answer.

Rejected, with reasons:
- 8: a night default of `outcome.md` (`## Night defaults`, "A read accepts `nlink` 0"), for Adrian to confirm in the
  morning (D-054 (2)); a record renamed over after it was opened has 0 names, the text read is a whole earlier record,
  and the poller's `readJobFile` still requires exactly one name, as the reviewer notes. Refusing 0 names made spawns
  fail under load in the gate (`outcome.md` → `## Done`, the first fix).

## Round 2 (2026-11-21, night run)

- Before: a fresh `rebuild-implementer` made the round 1 fixes, each mechanism with a test that failed on the tree
  before its fix (`outcome.md` → `## Fails before`); `review-guard.mjs compare --git` → "within its limits", exit 0;
  the main session's `gate.mjs` → exit 0, 479/479; `fails-before.mjs` → exit 0 (32 files).
- Reviewer: a fresh `rebuild-reviewer` with the same three paths; `review-verdict.mjs` → "consistent", exit 0;
  `review-guard.mjs compare` → "unchanged", exit 0.
- Verdict: **FAIL**. AC-1–AC-13 met; one blocking finding.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | blocking · proven: in the coordinator hook one damaged record throws `BAD_DATA` out of `deliveryLeft` (and `refreshSettled`, `fallbackDueAt`'s default) on every tick, so the sweep stops at that job, later jobs get no wakes and `damagedRecords` never reports it (`hook/wake.ts`, `src/job/wake-delivery.ts`) | fix |
| 2 | note · proven: the migration sets a `born` that is not in clock ticks to `null` and removes its file with no `kept` line, unlike every other value its field cannot hold (`src/job/migration.ts`) | fix |
| 3 | note · observed: one damaged record makes `resolveJob` and plain `limen status` fail with `BAD_DATA` (exit 4); only `status --all` shows it as INVALID (`src/job/lookup.ts`, `src/commands/status.ts`) | rejected |
| 4 | note · observed: `object(RECORD_FIELDS)` refuses an unknown field, so an older reader (a hook loaded before an upgrade) reads a record with a later additive field as `BAD_DATA` (`src/job/record.ts`) | rejected |
| 5 | note · observed: the hook checks for an unmigrated project only at session start, and its warning does not say that a running coordinator session needs a reload after `limen migrate` (`hook/wake.ts`) | fix |
| 6 | note · observed: a spawn in an unmigrated project creates the worktree root and, in a group, claims the member slot before `NOT_MIGRATED` refuses it (T-38) (`src/commands/spawn.ts`) | fix |
| 7 | note · observed: two comments state a read rule the code does not have: the record module's header ("one name"; the read accepts 0) and `readJobFile`'s ("the same rule") (T-30) (`src/job/record.ts`) | fix |
| 8 | note · observed: `test/seat/bell.test.ts` tests `docs/seat/bell.ts`, whose mirror would be `test/docs/seat/bell.test.ts` (T-29 (1)) | rejected |
| T-29 | taste answer: two tests still check two mechanisms ("publishRecord writes a starting record once, …": the contents and the `EEXIST` refusal; "the read refuses a record that is a symlink or has a second name": `O_NOFOLLOW` and `nlink`) (`test/job/record.test.ts`) | fix |

Fixes (for a fresh implementer, `ticket.md` → `## Decisions`): 1, 2, 5, 6, 7 and the T-29 answer. This is the second
and last round of fixes (`## Agents`, step 6).

Rejected, with reasons:
- 3: a damaged record is a loud `BAD_DATA` naming its file and field (T-01, T-27 (2)); every write is atomic, so a
  damaged record comes from tampering on the agents' account (gate 2 G2's accepted risk) or the disk, not from Limen;
  the hook's tolerance, which keeps the other jobs' wakes, is finding 1; how the resolver treats a record it cannot
  read is R-022's (one resolver for every reference, D-061), noted for its `ticket.md`.
- 4: the strict schema is T-27's boundary rule, and `## Stages`' convention covers newer code reading older records;
  an older reader of a newer record exists only between a deployment and the `/reload` that `## Deployment` runs right
  after it, and with finding 1 fixed such a hook reports the records instead of stopping. Whether records should
  accept unknown fields is a format question beyond this ticket: listed in `outcome.md` → `## Open points` for Adrian.
- 8: T-29 (1) speaks of mirrors of `src/` and of `test/cli/`; `docs/seat/bell.ts` is a seat tool, placed in
  `docs/seat/` only to keep the drop-in's path (night default 2 of `ticket.md`), and its test sits beside the other
  seat tool's (`test/seat/deploy.test.ts`); the file is new, so moving it needs a deletion that neither the implementer
  nor the session may make (`rm` is denied, `git rm` takes only tracked paths). T-29 (6)'s stage-6 scan is where the
  place of seat-tool tests gets its rule.

## Round 3 (2026-11-21, night run)

- Before: a fresh `rebuild-implementer` made the round 2 fixes, each mechanism with a test that failed on the tree
  before its fix (`outcome.md` → `## Fails before`); `review-guard.mjs compare --git` → "within its limits", exit 0;
  the main session's `gate.mjs` → exit 0, 484/484; `fails-before.mjs` → exit 0 (the same 32 files).
- Reviewer: a fresh `rebuild-reviewer` with the same three paths; `review-verdict.mjs` → "consistent", exit 0;
  `review-guard.mjs compare` → "unchanged", exit 0.
- Verdict: **PASS**. AC-1–AC-13 met; five notes, none blocking.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven: the migration drops a `born` value when the folder has no usable `pid` (`identityOf` gives the group owner's identity or `null`), and removes its file with no `kept born` line; HEAD's `finalizeJob` removed `pid` before `born`, so such folders exist (`src/job/migration.ts`) | Adrian (Q-10) |
| 2 | note · proven: two docs lines still name old job files: `docs/jobs.md:168` ("the recorded `origin-pane`") and `README.md:87` ("it writes `open-checks`") | fixed by the main session |
| 3 | note · proven: the hook's module-level `damaged` map only grows, so after a new session start the hook reports again every record it ever found damaged in that process, keyed by the bare job id across projects (`hook/wake.ts`) | Adrian (Q-10) |
| 4 | note · proven: `readProgressSync` in `jobDisplay` and `pulseOf` runs on every tick outside `undamaged`, so a damaged `progress.json` stops the status line and hides the damage report (wakes still come); `advisoryWake` → `jobEnding` → `readRecordSync` is unguarded too (`hook/wake.ts`, `src/job/wake-text.ts`) | Adrian (Q-10) |
| 5 | note · proven: the coordinator manual still says the pulse `starting` means "spawn still preparing it, or no pid yet", while a running record without a pid now shows `unknown` (`templates/agents.md:142`) | Adrian (Q-10) |

The two rounds of fixes are used (`## Agents`, step 6). Note 2 touches only documentation, so the main session fixed
it with no further round (D-053 (2); `README.md` is read as documentation alongside `docs/`, as R-019's round 3 fixed
a sentence of `plan.md`): `docs/jobs.md:168` now names "the origin pane in the job's record", and `README.md:87` says
Limen "records the open checks in the job's record (`limen show <id>`)" and that a requested done "records no open
checks"; no test reads either file (`git grep -n -E 'README|docs/jobs' -- test` finds only fixture files). Notes 1, 3
and 4 change code and tests, and note 5 a role prompt with its history hash, so they wait for Adrian's decision:
`.night/questions.md` → Q-10. R-021 is closed with the round-3 PASS, as R-019 was with Q-9.
