<!-- PL: Recenzja ticketu R-087 (allow-lista środowiska joba, git i gh bez poświadczeń, tryb testowy), noc 24/25.11.
Runda 1: FAIL na jednym znalezisku blokującym (fixture grup drukuje `LIMEN_HOME` bez `LIMEN_TEST_MODE`) i sześć uwag;
poprawki F1–F4 (F2 to domyślna decyzja nocy: pusty `GIT_ASKPASS`), trzy uwagi odrzucone z powodem. Runda 2: PASS z
trzema uwagami; dwie tekstowe poprawione przez sesję główną (krok 3.10, sprawdzenie loginu gh), test `--prepare` przez
wrapper to poprawka G1. Runda 3: PASS z dwiema uwagami tekstowymi (`~/.netrc`, to streszczenie), poprawionymi przez
sesję główną. Stan: recenzja zamknięta. -->

# R-087 review

## Round 1 (2026-11-24/25, the night of D-102, run 1)

- Before: the implementer's run → `review-guard.mjs compare --git` → "within its limits", exit 0; the main session's
  `gate.mjs` → exit 0, 1121 tests, 1121 pass, 0 fail (265.6 s); `fails-before.mjs` → exit 0 at `HEAD` `b21bd45` (nine
  files).
- Reply: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-087.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **FAIL**. AC-1–AC-5 met (run in the review), AC-6–AC-8 on the records, AC-9 judged met; one blocking
  finding, six notes.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | blocking · proven: `bin/limen-group-fixture.mjs:75` prints `export LIMEN_HOME=…` for the interactive lead but no `LIMEN_TEST_MODE=1`, so with knobs read only in test mode the lead's `limen` and its wake hook use `~/.limen`: the throwaway fixture lands in the account's real registry and its jobs in the real start queue, against the fixture's comment at `:28`, `docs/jobs.md:236` and `outcome.md` (b) | fix (F1) |
| 2 | note · guessed: "never asks" covers the terminal only: git's prompt runs `GIT_ASKPASS`, else `core.askPass` from any configuration file, else `SSH_ASKPASS`, before it reads `GIT_TERMINAL_PROMPT`; the two variables are dropped, a `core.askPass` in a file would still run (`src/config.ts:351-370`) | fix (F2, a night default): AC-9 and (a) promise that git in a job never asks and holds no credential from a configuration file, and an askpass program named in a file is such a source (z. 14); an empty `GIT_ASKPASS` is non-null, so git skips the other two and goes to `GIT_TERMINAL_PROMPT=0` |
| 3 | note · guessed: gh can read a login from the system keyring through the user bus, which passes, so "gh finds no login" holds only where the seat's gh keeps its login in a file; step 3.10's `gh auth status` covers it (`adrian-rebuild/plan.md:2275`) | fix (F3), text only: the user bus must pass (R-026), so the docs and the registry line say what `GH_CONFIG_DIR` hides (a login in gh's configuration files) and that a keyring login would still be found, which step 3.10 shows; `outcome.md` → `## Open points` names it for gate 5.3 |
| 4 | note · observed · T-27 (1): `runInternalJob` changed and keeps its "split pending" suppression (`src/runtime/wrapper.ts:45-46`) | rejected for this ticket: left to R-082's ratchet, as in R-020, R-028, R-035 and R-036 (`R-036-stall-over-job-scope/review.md`, round 2, finding 2); the change moved one line inside the function, and splitting it is not this ticket's (`outcome.md` → `## Open points` 1) |
| 5 | note · observed: the log line says "1 name" for one dropped name, against (d)'s form `dropped <n> names` (`src/runtime/launcher.ts:129`) | rejected: recorded as Deviation 1 for gate 5.3 with the ticket's other wordings; the singular is plain English and no code parses the line |
| 6 | note · observed: two added comment lines run past 120 columns and one comment breaks mid-sentence (`test/fake-engine.mjs:19`, `test/plant.ts:2`, `test/plant.ts:443`) | fix (F4) |
| 7 | note · observed · T-29: two s1 tests each check two names in one assert (`[names, dropped]`; `[status, signal, password, "terminal prompts disabled"]`) | rejected: ticket (e) prescribes both, and each checks one mechanism: the list applied at one launch, seen in the engine's names and in the line that names what it dropped; git's credential lookup in a job, which yields no password and does not ask |

## Round 2 (2026-11-25, the night of D-102, run 1)

- Before: a fresh `rebuild-implementer` made F1–F4 → `review-guard.mjs compare --git` → "within its limits", exit 0;
  the main session's text edit of `outcome.md` → Open point 6 (`SECURITY.md:5`, `docs/seat/agent-setup.md:137`); its
  `gate.mjs` → exit 0, 1123 tests, 1123 pass, 0 fail (265.3 s); `fails-before.mjs` → exit 0 at `HEAD` `b21bd45` (ten
  files).
- Reply: a fresh `rebuild-reviewer` with the same three paths; `compare` → "unchanged", exit 0; `review-verdict.mjs` →
  "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-5 met (run in the review), AC-6–AC-8 on the records, AC-9 judged met; no blocking
  finding, three notes; the taste answer on T-18 names the spelling "allowlist" in `test/plant.ts:2` and `:511`.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven: step 3.10 lists Limen's own names for a trial job's `env` without `GIT_ASKPASS`, which F2 sets in every job (`adrian-rebuild/plan.md:2271-2273`) | fixed by the main session (text of `## Deployment`, D-053 (2)): step 3.10 names the empty `GIT_ASKPASS` |
| 2 | note · guessed: a job's `gh auth status` may not reveal a keyring login: gh lists its hosts from `hosts.yml`, which `GH_CONFIG_DIR` hides, while a request still falls back to the keyring; `gh api user --silent` failing in a job, or `gh auth status` outside a job, would show it (`docs/jobs.md:233`, `docs/seat/agent-setup.md:137`, `adrian-rebuild/plan.md:2275`) | fixed by the main session (text only, D-053 (2)): step 3.10 runs `gh api user --silent` in the trial job (must fail) and `gh auth status` outside it (where the token is stored); `docs/jobs.md`, `docs/seat/agent-setup.md:137` and `outcome.md` (F3, `## Unmeasured`, Open points 4 and 6) say the same |
| 3 | note · observed: no test covers the wrapper handing the engine's environment to `--prepare`: the new test calls `setUpJob` with an environment it builds, and no plant test records a prepare command's names, so a wrapper that passed `process.env` again would fail no test (`test/runtime/job-setup.test.ts:36`, `src/runtime/wrapper.ts:171-174`) | fix (G1): (c) and AC-9 are the wrapper's guarantee, which only a test through the wrapper holds (z. 17); the second and last round of fixes |

## Round 3 (2026-11-25, the night of D-102, run 1)

- Before: a fresh `rebuild-implementer` made G1–G2 (the G1 test passed on the tree, so no code changed; its failure
  shown with the wrapper's old line put back for one run) → `review-guard.mjs compare --git` → "within its limits",
  exit 0; the main session's text fixes of round 2's findings 1 and 2; its `gate.mjs` → exit 0, 1124 tests, 1124 pass,
  0 fail (270.2 s); `fails-before.mjs` → exit 0 at `HEAD` `b21bd45` (ten files).
- Reply: a fresh `rebuild-reviewer` with the same three paths; `compare` → "unchanged", exit 0; `review-verdict.mjs` →
  "consistent", exit 0. The reviewer's own Biome run was refused by the permissions (it is not on the reviewer's
  list); AC-8 is judged from the records.
- Verdict: **PASS**. AC-1–AC-5 met (run in the review), AC-6–AC-8 on the records (`check.mjs` run in the review), AC-9
  judged met; no blocking finding, two notes. The rounds of fixes are spent; both notes are text, closed by the main
  session (D-053 (2)).

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · guessed: git's HTTP transport reads `~/.netrc` through libcurl (`CURLOPT_NETRC` optional) and `HOME` passes, so a netrc entry for github.com would give git in a job a credential with no helper and no prompt, which step 3.10's `git credential fill` would not show (`docs/jobs.md:237`, `adrian-rebuild/plan.md:2273-2274`) | fixed as text by the main session: `docs/jobs.md`'s boundary item names `~/.netrc` among the account's files (git gets no credential helper, the account holds no netrc), step 3.10 checks that the account has none, `outcome.md` → Open point 7 for gate 5.3; no code: no name turns libcurl's netrc off without moving `HOME`, which E-4 needs |
| 2 | note · proven: `review.md`'s Polish summary describes round 1 only and ends "Stan: czeka na rundę 2." (`review.md:1-5`) | fixed: the summary covers the three rounds |
