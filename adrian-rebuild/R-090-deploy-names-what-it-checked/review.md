<!-- PL: Recenzje ticketu R-090 (skrypt wdrożenia wypisuje, co sprawdził, i odmawia bez projektu). Runda 1: PASS
z czterema uwagami bez blokujących; trzy idą do poprawki (test ścieżki ELOOP, rozdzielenie testu odmowy i listy,
lista plików gita bez wpisów usuniętych z drzewa), jedna jest odrzucona z powodem. Runda 2: PASS z dwiema uwagami
(poprawione zdanie w outcome.md, odrzucona uwaga o safe.directory). Stan: zamknięta, ticket gotowy do commitu. -->

# R-090 review

## Round 1 (2026-11-19, day session)

- Before: the implementer's resumed run → `review-guard.mjs compare --git` "within its limits", exit 0 (its first
  run was accepted by Adrian, `ticket.md` → `## Decisions`); the main session's `node adrian-rebuild/tools/gate.mjs`
  → exit 0, 250/250; `fails-before.mjs` → exit 0 ("test/seat/deploy.test.ts, test/structure.test.ts fail at HEAD").
- A fresh `rebuild-reviewer` with the three inputs (`ticket.md`, the diff of 808 lines, `taste.md`). After it:
  `review-guard.mjs compare` → `unchanged`, exit 0; `review-verdict.mjs` → `consistent`, exit 0.
- Verdict: PASS. AC-1 to AC-5 met; four notes, none blocking.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | The new failure path of `rootKind` (a `stat` of `<root>/.limen` that fails with anything but ENOENT or ENOTDIR exits 4) has no test; T-02's Check asks for one per failure path, and a symlink loop `<root>/.limen -> .limen` gives ELOOP for any user | note · proven | fix: a test, with the symlink loop, that the deployment exits 4 before the fetch and names the path |
| 2 | A failure inside the running-job check (an unreadable `.limen/jobs/`, an exception of `liveJob` or `startingJob`) prints no list, while `## Change` 1 says every run past reading the registries prints it | note · observed | rejected: the list states what the running-job check covered, and a check that failed covered nothing in full; the failure exits 4 and names the path it could not read, before the fetch, so root learns the cause and nothing is deployed. The outcome's deviation 3 records the narrower reading, which this decision accepts |
| 3 | "a registry that holds no project refuses …" asserts both the refusal and the exact list, two mechanisms (T-29 (3)) | note · observed | fix: split it; the refusal test keeps exit 4, HEAD, tags, fetch and the registry named, and a separate test "a refusal for no project also prints the list" checks the list |
| 4 | `knownFiles` lists with `git ls-files --cached`, which keeps index entries whose file is gone from the working tree, so a file moved with a plain `mv` would count twice under one basename and fail the basename test falsely | note · guessed | fix: the listing keeps only paths that exist in the working tree, with a test on the fixture (a tracked file deleted from the working tree and an untracked file of the same basename count once); cheap, and it closes a false red gate |

Taste questions (T-29, T-30, T-40): answered in the reply; nothing beyond findings 3 and 4.

## Round 2 (2026-11-19, day session)

- Fix round 1 by the resumed implementer: `compare --git` → "within its limits", exit 0; `node
  adrian-rebuild/tools/gate.mjs` → exit 0, 253/253; `fails-before.mjs` → exit 0 ("test/seat/deploy.test.ts,
  test/structure.test.ts fail at HEAD").
- A fresh `rebuild-reviewer` with the three inputs (the new diff, 970 lines). After it: `compare` → `unchanged`, exit
  0; `review-verdict.mjs` → `consistent`, exit 0.
- Verdict: PASS. AC-1 to AC-5 met; the three fixes of round 1 checked; two notes, none blocking.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | Deviation 3 of `outcome.md` still says the new `stat` failure path has no test, which fix 1's ELOOP test made untrue | note · proven | fixed by the main session in `outcome.md` (a text correction; no code changed, so no further review) |
| 2 | With `GIT_CONFIG_GLOBAL=/dev/null` the basename test's `git ls-files` loses any `safe.directory`, so on a checkout owned by another account it would exit 128 and fail the gate | note · guessed | rejected: the gate runs only in the rebuild's clone, owned by the account that runs it (D-001), and no test runs on the seat, where `/opt/limen` is root's; the deployment test already runs git with the same setting |
