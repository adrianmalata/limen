<!-- PL: Recenzja ticketu R-012 przez rebuild-reviewer. Runda 1 (19.11, nocny przebieg): PASS, kryteria AC-1–AC-10
spełnione (AC-6 oceniane testem 11, bo polecenie jest poza allow-listą), sześć uwag bez znalezisk blokujących. Cztery
uwagi idą do poprawki przez świeżego implementera (fałszywy komentarz skanu D3, brak programu git jako klasa 4,
znaki sterujące z folderów zadań na terminalu roota, zmienne git wskazujące inne repozytorium), dwie są odrzucone
z powodem. Runda 2: PASS z jedną uwagą (akceptacja odstępstw 7–10), poprawioną w ticket.md. Stan: zamknięty. -->

# Review: R-012 A root deployment script for a pinned SHA

## Round 1 (2026-11-19, night run)

- Inputs: `adrian-rebuild/R-012-root-deploy-script/ticket.md`, the diff from `review-guard.mjs diff --out
  node_modules/.rebuild-review/R-012.diff`, `adrian-rebuild/taste.md`; the prompt added one fact: `node seat/deploy.ts`
  is not on the reviewer's list either, and `ticket.md` → `## Decisions` says how AC-6 is judged.
- Main session before the review: `review-guard.mjs compare --git node_modules/.rebuild-review/R-012.git <ticket.md>`
  → "within its limits", exit 0; `node adrian-rebuild/tools/gate.mjs` → exit 0, 146/146; `fails-before.mjs` → exit 0.
- Guard: `review-guard.mjs compare node_modules/.rebuild-review/R-012.before` → `unchanged`, exit 0.
- Parser: `review-verdict.mjs node_modules/.rebuild-review/R-012.reply <ticket.md>` → `consistent`, exit 0.
- Verdict: PASS. AC-1 to AC-10 met; six notes, none blocking.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | The comment above the dynamic-import scan says a deployment during a job cannot give it a second version, but the finalize path starts a new `bin/limen` process (`src/job/record.ts:66` → `src/job/group-cabinet.ts:325-326`), which loads what `/opt/limen` holds then; the guard is the running-job refusal | note · proven | fix (T-30): the comment says what the scan keeps (one process, one version) and that the refusal of running jobs is the guard |
| 2 | A missing `git` binary exits 3 ("the network, safe to retry"), where T-02 puts a missing tool in class 4 | note · proven | fix (T-02): a git that cannot start is class 4 in every step, `git fetch` included |
| 3 | The refusals of steps 4 and 5 come after the fetch and leave the fetched objects and the moved `origin/adrian-rebuild` | note · proven | rejected: D-008's order (fetch, then the ancestor check); a fetch changes no checkout, tag or work tree |
| 4 | No signal handler: an interrupt between the checkout and the tag leaves the new commit checked out | note · observed | rejected for this ticket: at stage 1 the window is three git calls; R-017 adds the first long verification and owns the handler (`## State`) |
| 5 | The job label and id (written by the agents' account) and git's output reach root's terminal unfiltered, control sequences included | note · observed | fix (trust boundary, priority 1): text from job folders and from git is printed with control characters escaped |
| 6 | `git()` passes root's whole environment, so an exported `GIT_DIR` or `GIT_WORK_TREE` would redirect every step to another repository | note · guessed | fix (cheap, reliability): git runs without the variables that locate a repository |

Taste questions (T-29, T-30, T-40, T-41): answered; T-30 points to finding 1; T-41: root-only seat tooling, not a
registry command.

## Round 2 (2026-11-19, night run)

- Inputs: the same three paths; the new diff after the fix round of a fresh `rebuild-implementer` (findings 1, 2, 5
  and 6; tests 12–14 of `test/seat/deploy.test.ts`); a fresh reviewer.
- Main session before the review: `review-guard.mjs compare --git` (a new snapshot before the fix round) → "within its
  limits", exit 0; `node adrian-rebuild/tools/gate.mjs` → exit 0, 149/149; `fails-before.mjs` → exit 0.
- Guard: `review-guard.mjs compare node_modules/.rebuild-review/R-012.before` → `unchanged`, exit 0.
- Parser: `review-verdict.mjs node_modules/.rebuild-review/R-012.reply <ticket.md>` → `consistent`, exit 0.
- Verdict: PASS. AC-1 to AC-10 met; one note, not blocking.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | The fix round's deviations 7–10 of `outcome.md` are not accepted in `ticket.md` → `## Decisions`, while 1–6 are | note · observed | fixed by the main session: `ticket.md` → `## Decisions` accepts them; each serves its fix, as the reviewer found |

Taste questions (T-29, T-30, T-40, T-41): answered; tests 12–14 each fail before their fix for one reason; the D3
comment now gives the true reason and its citations resolve.
