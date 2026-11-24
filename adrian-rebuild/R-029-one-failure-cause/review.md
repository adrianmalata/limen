<!-- PL: Recenzja ticketu R-029 (jeden zapisany rodzaj porażki joba, godzina resetu limitu, odmowa strażnika zdarzeń
Pi). Runda 1 (24.11, w dzień): PASS bez znalezisk blokujących, dziesięć uwag i jedna uwaga do komentarza (T-30). Sesja
główna kieruje do poprawki pięć rzeczy (F1–F5): ucieczkę niezaufanego tekstu w `limen status`, deterministyczny
test odmowy przed timeoutem, podział dwóch testów (T-29 (3)), listę hooków z katalogu w teście T-32 i komentarz;
pozostałe uwagi odrzuca z powodem albo przenosi do ticketów, które przepisują te miejsca. Rundy 2 i 3: PASS;
poprawki G1–G2 (folder sesji dopasowany po pid i `born`, test `limen show`), a dwie uwagi rundy 3 idą do notatki
R-102 (D-092). Stan: recenzja zamknięta. -->

# R-029 review

## Round 1 (2026-11-24, by day, `limen-rebuild-27`)

- Before: the implementer's run → `review-guard.mjs compare --git` "within its limits", exit 0; the main session's
  `gate.mjs` → exit 0, 967 tests, 967 pass, 0 fail (263.6 s); `fails-before.mjs` → exit 0, its first line the same as
  the one `outcome.md` → `## Fails before` records (eleven files in one run at `HEAD` `3a9e48c`).
- Reply: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-029.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-10 met (AC-7–AC-8 on the records); ten notes and one T-30 remark; no blocking finding.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven · T-10: the coordinator's warning line in `limen status` exceeds 100 characters by construction (`src/project/summary.ts:217`) | rejected for R-029: `limen status` lines already exceed 100, and R-073 carries T-10 for `limen status` (its row in `## Tickets`); `outcome.md` → Open point 3 |
| 2 | note · proven · T-32 (4): a coordinator session with no registration folder, and a refusal in the wake hook's own `session_start` guard before `coordinator.start`, write no refusal file, so Pi's chat is the only trace (`src/integrations/coordinator-registration.ts:176-185`, `hook/wake.ts:853`) | rejected for R-029: the ticket's Decision 8 ties the warning to the session's folder, and the chat shows the error, so the refusal is not silent; recorded as Deviation 3. R-102, which removes the registration (D-097 (6) (b)), gets a note in `## Tickets` to keep a place for the refusal file |
| 3 | note · proven: the new kind assertions of `test/s3-finish-wake.test.ts` pass at `HEAD`, against (h)'s "each failing before" | rejected: AC-7 is met, the change of who sets the kind fails before through the finalize test "records the kind … whatever a pattern reads in the detail", and Deviation 7 records it |
| 4 | note · observed · T-29 (3): two tests combine two mechanisms (`test/cli/status.test.ts:395`, the warning line and the T-04 snapshot; `test/job/record.test.ts:241`, the two kinds and the two optional fields) | fix (F3): T-29 (3) says tests that combine several mechanisms are split |
| 5 | note · guessed: "a hook's refusal recorded before the job's timeout …" races the engine's start and the locked refusal write against a 1 s timeout (`test/runtime/wrapper.test.ts:259`) | fix (F2): a test whose result can depend on timing is a future gate failure (z. 17, D-029); the order is made deterministic |
| 6 | note · observed · untrusted text: `limen status` prints `refusal.json`'s `message` and the session folder's name unescaped, so a planted file with a newline adds lines to what the coordinator reads (`src/project/summary.ts:217`) | fix (F1): the text goes through `shownField`, as R-030's prune lines do (priority 1; untrusted text reaching the coordinator) |
| 7 | note · observed: when the record write of a job's refusal fails, Pi gets BAD_DATA with both messages and the job log shows it, but the job can still end `done` (`src/runtime/pi-api.ts:444`) | rejected: the record's own writer failing leaves no durable place to record the cause; the line in the job log is the trace, and reading it back would be a pattern on text (z. 2) |
| 8 | note · proven · T-27 (1): the rewrapped `groupPeer` keeps its two "split pending" suppressions (`hook/group-peer.ts:12`, `:158`) | rejected for R-029: left to R-082's ratchet, as in R-020, R-028, R-035 and R-100 |
| 9 | note · observed · T-18: "refusal" names a command's exit-1 refusal (T-02, T-38) and a guard's BAD_DATA of a Pi event, recorded now (`src/runtime/pi-api.ts:171`, `src/job/record.ts:100`) | rejected for R-029: the guard's wording is that of T-32 (4) and D-055, and R-017's `refuse`; a new name for it is a naming decision for Adrian, named in `outcome.md` → Open points for gate 5.3 |
| 10 | note · observed: the T-32 coverage test lists the hooks by hand, so a new file in `hook/` is not checked for `recorded` (`test/runtime/pi-api.test.ts:302`) | fix (F4): the test reads the list from `hook/`, so the guarantee covers every hook (z. 14) |
| T-30 | `src/runtime/wrapper.ts:200` says "a failed write of it is logged too", but `failLog` swallows its own failure (`:74-77`) | fix (F5): the comment states what the code does |

Taste answers: T-29 mostly yes (the two combined tests as note 4); T-30 yes but for the one clause above; T-40 no new
owner touchpoint.

Fixes F1–F5 go to the resumed implementer (`ticket.md` → `## Decisions`, round 1); review round 2 checks them.

## Round 2 (2026-11-24, by day, `limen-rebuild-27`)

- Before: the resumed implementer's fixes F1–F5 → `review-guard.mjs compare --git` (a new `snapshot --git` after the
  main session's edits of round 1, D-035) "within its limits", exit 0; the main session's `gate.mjs` → exit 0, 970
  tests, 970 pass, 0 fail (245.6 s); `fails-before.mjs` → exit 0, the same first line as in round 1.
- Reply: a fresh `rebuild-reviewer` with the same three paths; `review-guard.mjs compare` → "unchanged", exit 0;
  `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-10 met, F1–F5 checked done; three notes, no blocking finding.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · observed · T-29 (3): the new show test's third record has the new kind `launch`, so at `HEAD` it fails on that record's BAD_DATA, not on the missing `failure` line (`test/cli/show.test.ts:57`) | fix (G2): the record takes a kind `HEAD` knows, so the test fails before for the printing alone; the new kinds are proven by the record and alerts tests |
| 2 | note · observed: after F3's split, "T-04: limen status reads a coordinator session's refusal and writes nothing" passes at `HEAD` (`test/cli/status.test.ts:419`) | rejected: it guards T-04 on the new read path, whose behaviour `HEAD` shares; `outcome.md` names it with that reason, and AC-7 holds |
| 3 | note · guessed: `writeCoordinatorRefusal` finds the session's folder by pid alone, though the registration records `born` (`src/integrations/coordinator-registration.ts:181`, `:62`), so a reused pid can write the refusal under a dead session's name | fix (G1): the folder must match the process by pid and `born`, as the registration's own liveness check does (`:155-156`; A-058's identity model) |

Taste answers: T-29 mostly yes (note 1; `test/runtime/pi-api.test.ts:267` checks two kinds of pass-through of one
wrapper, which the main session reads as one mechanism, `recorded`'s pass-through); T-30 yes; T-40 no; T-18 the
naming point stays an open point for gate 5.3.

Fixes G1 and G2 go to the resumed implementer, the second and last round of fixes (`## Agents`, step 6); review round
3 checks them, and a note of round 3 that needs code goes to the notes of the ticket that rewrites that part (D-092).

## Round 3 (2026-11-24, by day, `limen-rebuild-27`)

- Before: the resumed implementer's fixes G1–G2 → `review-guard.mjs compare --git` (a new `snapshot --git` after the
  main session's edits of round 2) "within its limits", exit 0; the main session's `gate.mjs` → exit 0, 971 tests,
  971 pass, 0 fail (247.7 s); `fails-before.mjs` → exit 0, twelve files.
- Reply: a fresh `rebuild-reviewer` with the same three paths; `review-guard.mjs compare` → "unchanged", exit 0;
  `review-verdict.mjs` → "consistent", exit 0. The reviewer wrote only a check folder in the session's scratchpad,
  outside the repository.
- Verdict: **PASS**. AC-1–AC-10 met, G1 and G2 checked done; two notes, no blocking finding.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · observed: G1 still matches a folder by pid alone when the folder records no `born` (written fire-and-forget at registration), so a dead session's folder without `born` can take the refusal (`src/integrations/coordinator-registration.ts:185-186`, `:54-65`) | to R-102's note in `## Tickets` (D-092): the rounds of fixes are spent, and R-102 rewrites the registration |
| 2 | note · proven: `coordinatorRefusals` rethrows any read error but ENOENT and ENOTDIR, so a `refusal.json` that is a directory or unreadable fails the whole `limen status`, and its plain `readFile` follows a symlink, unlike the record's guarded read; a job can write `.limen/coordinators/` (`src/integrations/coordinator-registration.ts:206-211`) | to R-102's note in `## Tickets` (D-092), as note 1; R-102 is in stage 3, so the read is guarded before `a0.3.0` is deployed |

Taste answers: T-29 yes for G1 and G2 (each new test fails before for one reason); T-30 yes; T-40 no; T-41 not
touched; T-18 the naming point stays `outcome.md` → Open point 4.

No round of fixes is left (`## Agents`, step 6); no finding is blocking, so the review is closed.
