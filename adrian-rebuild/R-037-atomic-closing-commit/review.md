<!-- PL: Recenzja ticketu R-037 (atomowy commit zamknięcia ticketów, wspólny dla `limen land` i `limen ticket done`).
Runda 1 (24.11, w dzień): FAIL na jednym znalezisku blokującym (odmowa landu przed merge'em wskazuje `limen ticket
done` zamiast `limen land <id>`) przy wszystkich kryteriach spełnionych; z pięciu uwag dwie idą do poprawki F1–F3
(`ticket.md` → `## Decisions`), jedna do otwartych punktów, jedna do notatek R-103, a jedna odpowiada na pytanie
o czas bramki. Runda 2: PASS z sześcioma uwagami; komentarze, słowa linii o pozostawionym folderze, miesiąc w teście
i zapis `outcome.md` idą do ostatniej rundy poprawek G1–G5, uwaga o wyjściu hooka nie jest regresją. Runda 3: PASS z trzema
uwagami: wskaźniki w teście landu do notatek R-103, zapis `fails-before.mjs` poprawiony w `outcome.md`, import w teście
przyjęty. Stan: recenzja zamknięta. -->

# R-037 review

## Round 1 (2026-11-24, by day, `limen-rebuild-30`)

- Before: the implementer's run (after its `BLOCKED`, answered by Decisions 17–19) → `review-guard.mjs compare --git`
  → "within its limits", exit 0; the main session's `gate.mjs` → exit 1 on `test/group-extensions.test.ts:92` alone
  under load, the diagnosis Adrian chose (D-029; the file alone 4 of 4), then `gate.mjs` → exit 0, 1106 tests, 1106
  pass (568.1 s); `fails-before.mjs` → exit 0 at `HEAD` `bb0ae2b` (five files).
- Reply: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-037.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **FAIL**. AC-1–AC-10 met (AC-8 and AC-9 on the records), AC-11 judged met; one blocking finding, five notes.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | blocking · proven: land's refusals before the merge (`TICKETS_UNCOMMITTED`, the destination-folder refusal) carry the close's `next` `limen ticket done F001` and "commit them, then run limen ticket done F001", while nothing has merged; following it closes the ticket with the job's work unmerged (`src/job/landing.ts:133`, `src/project/lanes.ts:197-199`, `:205-207`, `test/cli/land.test.ts:162`) | fix (F1): the refused call's successor is `limen land <id>` (D-046 (1), Decision 18) |
| 2 | note · observed: the `CHECKOUT_BEHIND` message says "once the files there are committed or moved", but a commit in that state reverts the close (Risk 3) and the named read-tree then no longer finishes it (`src/project/lanes.ts:424`) | fix (F2): the message says to move the changed files aside, never to commit them |
| 3 | note · observed: Decision 20's question: no fixed wait, sleep or delayed retry; about 15 more git processes per close; the change does not explain the gate's time | no change: the answer goes to `outcome.md` → `## Proof`; M-10 measures the gate at the close of the stage |
| 4 | note · observed · T-25: `ticketDoneOperation` builds a second operation from `closeOperation`'s parts, so a later change to `closeOperation` would not reach `ticket done` (`src/project/ticket-folders.ts:138-171`) | fix (F3): (c) wants one close operation; `ticket done` runs `closeOperation` with its job reads |
| 5 | note · guessed: `git commit-tree` does not read `commit.gpgSign`, so a project that signs commits gets an unsigned closing commit (`src/project/git.ts:487-489`) | fix (F4) in `outcome.md` → `## Open points` only: for gate 5.3, with a deployment check of `commit.gpgSign` in both projects; no code change while no project is known to sign |
| 6 | note · guessed: a failed lock release after a close that succeeded makes land say that nothing of the close was written, with a `next` that would refuse (`src/operation.ts` `validated`, `src/job/landing.ts:161`) | to R-103's notes in `plan.md` → `## Tickets`: its recorded `closed` step reads the closing commit from Git, which settles a land that ends after its commit (D-092) |

Taste questions: T-29 (lanes and git tests fail before at import alone, as their files are new; accepted), T-30 and
T-19 answered with no further finding.

## Round 2 (2026-11-24, by day, `limen-rebuild-30`)

- Before: the implementer's fixes F1–F4 → `review-guard.mjs compare --git` → "within its limits", exit 0; the main
  session's `gate.mjs` → exit 0, 1109 tests, 1109 pass (281.8 s); `fails-before.mjs` → exit 0 (six files at `HEAD`
  `bb0ae2b`).
- Reply: a fresh `rebuild-reviewer` with the same three paths; `compare` → "unchanged", exit 0; `review-verdict.mjs` →
  "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-10 met (AC-8 and AC-9 on the records), AC-11 judged met; no blocking finding, six notes.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · observed: the comment `src/registry.ts:446-447` still says a close that fails after the merge ends with `limen ticket done <codes>`, while a refusal there is `STATE_CHANGED` and `CHECKOUT_BEHIND` has `next` null | fix (G1) |
| 2 | note · observed · T-30: "(review round 1, F1)" and "(the ticket's Risk 3; review round 1, F2)" name no ticket (`src/job/landing.ts:132`, `src/project/lanes.ts:419`) | fix (G2): "R-037, review round 1, F1" |
| 3 | note · observed: `outcome.md` → `## Fails before` starts with the run before round 1; the run after it is only in `## Proof` | fix (G4) |
| 4 | note · observed: `outcome.md` → `## Deviations from the ticket` is numbered 1, 2, 3, 5, 4 | fix (G4) |
| 5 | note · guessed: `stayedLine` says "holds files git ignores" also for an untracked file a hook created (`src/project/lanes.ts:231-233`) | fix (G3): words true for both, files git does not track |
| 6 | note · guessed · security: `HOOK_REJECTED` passes up to 20 lines of a project hook's output to land's reader, after a merge of the job's files | no change: the same exposure as before (git commit's stderr in land's line), not a regression; no finding of `audit.md` covers a project hook's output, so it stays an observation for the gate 5.3 summary |
| T-29 | (taste answer) the land destination-folder test computes the month itself, so a run across a month boundary could fail for another reason | fix (G5): the test reads the month the close used, or fixes the close's date |

G1–G5 are the last round of fixes (`## Agents`, step 6).

## Round 3 (2026-11-24, by day, `limen-rebuild-30`)

- Before: the implementer's fixes G1–G5 → `review-guard.mjs compare --git` → "within its limits", exit 0; the main
  session's `gate.mjs` → exit 0, 1109 tests, 1109 pass (278.0 s); `fails-before.mjs` → exit 0 (the same six files).
- Reply: a fresh `rebuild-reviewer` with the same three paths; `compare` → "unchanged", exit 0; `review-verdict.mjs` →
  "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-10 met (AC-8 and AC-9 on the records), AC-11 judged met; no blocking finding, three notes.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · observed · T-30: two R-037 pointers in `test/cli/land.test.ts` (`:174`, `:179`) name no ticket, beside older pointers of other tickets with the same names | the rounds are spent and it needs a test change: to R-103's notes in `plan.md` → `## Tickets`, since R-103 rewrites land and its tests (D-092) |
| 2 | note · observed: since G5, `test/cli/land.test.ts` fails at `HEAD` on its imports as a whole file, so `fails-before.mjs` no longer shows each land test's own reason | accepted (Deviation 6): the reasons are in the implementer's runs; `outcome.md` → `## Fails before` says so |
| 3 | note · observed: the last `fails-before.mjs` run was only in `## Proof` | fixed by the main session in `outcome.md` → `## Fails before` (D-053 (2)) |

Taste questions: T-29 (the import note above), T-30 (note 1) and T-40 answered with no further finding.
