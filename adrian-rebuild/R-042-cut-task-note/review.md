<!-- PL: Recenzja ticketu R-042 (wycięcie mechanizmu notatki zadania: instrukcja na starcie, dopisek do steera, tura
sprawdzenia przed `finish`, stan „done with open checks” i przypomnienia projektu; steer przy 80 % czasu według roli,
D-121). Runda 1 (noc 26/27.11, przebieg 4): PASS przy wszystkich kryteriach spełnionych, z trzema uwagami; dwie idą do
rundy poprawek F1–F2 (dwa fałszywe komentarze narzędzi przebudowy, nazwane w `## Change` nocną decyzją 9, i dowód
end-to-end, że wrapper bierze tekst steera z roli joba; `ticket.md` → `## Decisions` 10), jedna bez zmiany z powodem.
Runda 2: PASS z dwiema uwagami; jedna do ostatniej rundy poprawek G1 (decyzja 11), druga zostaje przy R-082. Runda 3
(27.11, w dzień, po D-130): PASS z jedną uwagą do `outcome.md`, poprawioną przez sesję główną. Stan: recenzja zamknięta. -->

# R-042 review

## Round 1 (2026-11-27, night run 4)

- Before: the implementer's run → `review-guard.mjs compare --git` → "within its limits", exit 0; the main session's
  `gate.mjs` → exit 0, 1365 tests, 1365 pass (302.9 s), no `gate:` line; `fails-before.mjs` on the seven files of
  AC-17 → exit 0.
- Reply: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-042.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-20 met; three notes, no blocking finding.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven: two rebuild tool comments from inventory section 5 still name `src/job/session-commands.ts` as a reader of Pi session files (`adrian-rebuild/tools/fake-pi-rpc.mjs:63`, `adrian-rebuild/tools/same-task-session.mjs:2`) | fix (F1): item 9 asks for them; `## Change` now names both files (night default, `ticket.md` → `## Decisions` 9) |
| 2 | note · observed: only a worker shows end to end that the wrapper reads the steer's role from `record.role`, and a worker's text is also the fallback, so dropping `record.role` passes every test (`src/runtime/wrapper.ts:65`, `:350`; `test/s3-finish-wake.test.ts:153`) | fix (F2): a timeout job whose role's text differs from the fallback (T-29 (3), T-38) |
| 3 | note · observed: at HEAD the s3 timeout test's new steer-text assertion is hidden behind the file's first failing test and the shared project's `UNLANDED_WORK` (`test/s3-finish-wake.test.ts:151-155`) | no change: the old text ("commit your work or write your verdict now; mark checks you did not run as unverified.") cannot match `commit your work now\.\n`, which the reviewer confirms by reading; F2's new case gives the role mechanism its own failing assertion; the shared run folders of the `s<N>-` files are R-083's rewrite |

## Round 2 (2026-11-27, night run 4)

- Before: a fresh implementer's fixes F1–F2 (`ticket.md` → `## Decisions` 10; D-026; F2's test shown to fail with the
  wrapper's `record?.role` replaced by `undefined`, `outcome.md` → `## Review fixes`) → `review-guard.mjs compare
  --git` → "within its limits", exit 0; the main session's `gate.mjs` → exit 0, 1365 tests, 1365 pass (306.3 s), no
  `gate:` line; `fails-before.mjs test/s3-finish-wake.test.ts` → exit 0.
- Reply: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-042-2.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-20 met; two notes, no blocking finding.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven: F1's comments call `src/job/usage.ts` Limen's one reader of Pi's session files, but `src/picture/activity.ts` also reads a job's newest session file (`adrian-rebuild/tools/fake-pi-rpc.mjs:63`, `adrian-rebuild/tools/same-task-session.mjs:1-2`) | fix (G1): T-30 (1); the last round of fixes, by a fresh implementer (`ticket.md` → `## Decisions` 11) |
| 2 | note · proven: two changed functions keep their "split pending" suppressions (`runInternalJob` in `src/runtime/wrapper.ts`, `limenWake` in `hook/wake.ts`; T-27 (1)) | no change: the plan leaves such suppressions to R-082's ratchet, and `outcome.md` → Open points 3 names them |

## Round 3 (2026-11-27, by day, `limen-rebuild-41`)

- Before: Q-91 → D-130 (`ticket.md` → `## Decisions` 13); the main session's `gate.mjs --out
  node_modules/.rebuild-review/R-042.gate` → exit 0, 1365 tests, 1365 pass (348.0 s); `compare --git` after the night →
  exit 0.
- Reply: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-042.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0 (the saved reply
  abbreviates the taste answers).
- Verdict: **PASS**. AC-1–AC-20 met; one note, no blocking finding.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven: `outcome.md` → `## Proof` ends with the night's failed gate; the passing D-130 run is only in Open points 5 | fixed by the main session: `## Proof` names the run (D-053 (2): `outcome.md` only, no further round) |
