<!-- PL: Ticket R-012 etapu 1 przebudowy: skrypt wdrożenia roota `seat/deploy.ts`, który wdraża na seacie commit
o przypiętym pełnym SHA (D-008, D-010, §7 D3). Skrypt odmawia, gdy działa jakiekolwiek zadanie, pobiera
`origin adrian-rebuild`, sprawdza, że SHA jest przodkiem gałęzi, przełącza checkout, porównuje HEAD z SHA, uruchamia
weryfikacje i przy błędzie wraca do poprzedniego SHA z kodem 4, a po sukcesie zakłada lokalny tag. Do tego testy
skanu: brak plików `.sh` w `seat/` i `bin/` oraz brak dynamicznego `import(` w `src/` i `hook/`. Stan: zamknięty
(19.11, nocny przebieg; recenzja PASS w rundach 1 i 2, jedna runda poprawek). -->

# R-012 A root deployment script for a pinned SHA

## Problem

A commit reaches `/opt/limen` on the seat only by hand today (`docs/seat/agent-setup.md:251-254`): root fetches and
checks out a revision, with nothing that checks whether a job is running on the old code, whether the commit is the
one that passed the gate, or that the checkout holds it afterwards. A job that runs across a checkout mixes two
versions of Limen's code in one process tree.

Relied on:
- D-008 (gate 4, Q1): "`/opt/limen` gets a stage's commit by its pinned full SHA, through a root deployment script that
  the rebuild writes as seat tooling with tests (S, §7 D3; R-012). The script (1) refuses, listing the running jobs,
  while any job runs (D3); (2) runs `git fetch origin adrian-rebuild`; (3) checks that the SHA is an ancestor of
  `origin/adrian-rebuild`; (4) checks it out detached and creates a local tag on the seat for readability; (5) compares
  `git rev-parse HEAD` with the SHA; (6) runs the Pi type contract (T-32, AU-220) and on a mismatch returns to the
  previous SHA and exits with code 4. … Check: tests of the script on a fixture repo (refusal while a job runs, refusal
  of a SHA off the branch, a checkout whose `rev-parse HEAD` equals the SHA, return to the previous SHA when the
  contract fails); `check.mjs`: every stage in `## Deployment` calls the script with a SHA."
- D-010 (gate 4, Q3): "the seat tools are TypeScript, not shell … Node on the seat runs `.ts` directly
  (`erasableSyntaxOnly`, `allowImportingTsExtensions`); systemd units, the owner channel's forced command and the
  deployment script of D-008 call `node /opt/limen/seat/<tool>.ts` by absolute path (A-025). No `.sh` files in `seat/`
  and `bin/`; the only exception is the stage-0 pre-push hook in `adrian-rebuild/tools/` with its own test. … on an
  error returns to the previous SHA with code 4 (no test is skipped silently when a tool is missing). … Check: a scan
  finds no `.sh` file in `seat/` and `bin/` beyond the exception list; … a test of the deployment script: a failed
  verification returns to the previous SHA with code 4."
- Gate 2 §7 D3 (`audit.md`): "**D3 — fix:** deployment of a new tag (seat tooling, S) waits until no job runs, or
  refuses with the list of running jobs; a test asserts that `src/` and `hook/` have no dynamic `import(` on the
  job-finalize path (no mixed versions inside one job)." Gate 2 D4: "both projects in one seat registry is the
  expected state".
- `plan.md` → `## Tickets`, notes: "R-012: the script is `seat/deploy.ts` (TypeScript, D-010), which also puts `seat/`
  under `tsconfig.json` and the scan for `.sh` files in `seat/` and `bin/`; it reads job state through the record
  module once R-021 exists. R-017, R-032 and R-056 add the type contract, the unit verification and the nftables check
  to it. The D3 test that `src/` and `hook/` have no dynamic `import(` on the job-finalize path lives here (none at
  `rebuild-base`)."
- `plan.md` → `## Deployment`, step 0.2: "As root: `node /opt/limen/seat/deploy.ts <sha>` with the full SHA. The script
  refuses, listing the running jobs, while any job runs (§7 D3); fetches `origin adrian-rebuild`; refuses a SHA that
  is not an ancestor of `origin/adrian-rebuild`; checks it out detached and tags it locally; compares `git rev-parse
  HEAD` with the SHA; from a0.2.0 runs the Pi type contract (T-32, R-017), from a0.3.0 verifies the generated systemd
  units … (R-032), and from a0.5.0 the nftables rules … (R-056). On any failure after the checkout it returns to the
  previous SHA and exits with code 4 (D-010)." Step 1.0 (bootstrap): root checks out the SHA by hand, "and run[s] `node
  /opt/limen/seat/deploy.ts <sha>`, which repeats every check and tags the commit (R-012)." Step 0.7 (rollback) runs
  the script with the previous SHA.
- T-02 (Rule): "0 success, also \"nothing to do\"; 1 refusal: a code-checked condition is not met, with the reason and
  the next command; 2 usage error: flags, arguments, unknown command; 3 transient failure: … the network …; safe to
  retry; 4 environment failure: git, the file system, permissions, a missing tool; 5 internal error". "`process.exitCode`
  and `process.exit` appear only in the wrapper and in the entry point `bin/limen`".
- T-03 (Rule): "**Settings** … come only from the owner files of the published copy … and from root-owned seat files;
  an environment variable never overrides them (z. 16)."
- Facts: `limen init` registers a project in the project registry `~/.limen/projects` of the account that runs it, one
  absolute root per line (`src/commands/github-doctor.ts:28`, `docs/seat/agent-setup.md:140`); on the seat that is the
  agents' account, and root has no registry of its own. A job runs Limen's code while `liveJob` or `startingJob`
  (`src/runtime/reap.ts:7`, `:26`) holds for its folder `<root>/.limen/jobs/<id>/`: a recorded wrapper (also one that
  waits in the start queue) whose process group is alive with its recorded birth, or a spawner still setting it up.
- D-025: a criterion checks only the ticket's scope, as an exit code. D-029 and D-031: a test that fails once without
  a change of the code it runs is a finding; until R-019 a gate that fails only on
  `test/s9-housekeeping.test.ts:135` is recorded as an occurrence of A-087 and run once more.

## Change

1. New `seat/deploy.ts`, run as `node /opt/limen/seat/deploy.ts <sha>`; the repository it deploys is the folder above
   the script's own folder (`/opt/limen`). The work is a function that takes its inputs as parameters (the repository
   path, the password file, the clock, the list of verifications), so the tests run it on fixtures; the entry point
   calls it with the real values and is the only place that sets the exit code (T-02). In this order:
   1. Usage: exactly one argument, a full SHA (40 lowercase hexadecimal characters); otherwise exit 2 with a line
      that asks for the full SHA from the gate.
   2. Running jobs: the project registries are `<home>/.limen/projects` for every home directory named in the password
      file (`/etc/passwd`), where that file exists; every listed root that has a `.limen/jobs/` folder is read, and a
      job counts as running when `liveJob` or `startingJob` holds for its folder. A root without `.limen/jobs/` is
      skipped (a junk line of the registry). No registry found at all is exit 4 ("no project registry under any home
      directory; the running jobs cannot be checked"). Any running job is exit 1: one line per job (project root, job
      id, label when it has one), then a line that says to wait until they end and run the same command again.
   3. `git fetch origin adrian-rebuild` in the repository; a failure is exit 3 (the network, safe to retry), with git's
      message.
   4. The SHA must be an ancestor of `origin/adrian-rebuild` (`git merge-base --is-ancestor`); otherwise, also for a
      SHA the repository does not have, exit 1 with a line that names the branch.
   5. The checkout must have no changes (`git status --porcelain` empty); otherwise exit 1 that lists them.
   6. The previous SHA is `git rev-parse HEAD`; then `git checkout --detach <sha>`, then `git rev-parse HEAD` must
      equal the SHA.
   7. The verifications run in order; at stage 1 the list is empty, and R-017, R-032 and R-056 add theirs. A
      verification runs as a separate process from the new checkout (its code is not imported into the running
      script), so it checks the new version.
   8. A failure in steps 6–7 (git's checkout, a different HEAD, a failed verification) returns the checkout to the
      previous SHA with `git checkout --detach <previous>` and exits 4, naming the failure and the SHA the checkout
      holds now; when the return itself fails, the line says so and names both SHAs.
   9. Success: a local tag `deployed-<UTC date and time>` (e.g. `deployed-2026-11-19-063000`) on the SHA, and exit 0
      with a line naming the SHA, the previous SHA and the tag, and the next step (`/reload` every coordinator session,
      `## Deployment` step 0.3). Deploying the SHA the checkout already holds (the bootstrap of step 1.0) runs every
      step and also exits 0 with a tag.
   An unexpected exception is exit 5 with its stack on stderr.
2. `tsconfig.json`: `include` gets `seat/**/*.ts`, so `npm run check` type-checks `seat/` (Biome already checks `.`).
3. Scans in `test/structure.test.ts`: no file ending in `.sh` in `seat/` or `bin/` (D-010; the pre-push hook lives in
   `adrian-rebuild/tools/`, outside both); no dynamic `import(` in a `.ts` file of `src/` or `hook/` (D3: the whole
   tree, which includes the job-finalize path; `bin/limen` loads `src/main.ts` with a dynamic import at start, before
   any job code runs, and is outside the scan).
4. New `test/seat/deploy.test.ts`, written first (it fails at `HEAD`, where `seat/deploy.ts` does not exist). Each test
   builds a bare origin with a branch `adrian-rebuild` of at least two commits, a clone of it as the repository at the
   older commit, and a password file whose one home holds `.limen/projects` that lists a fixture project:
   - a running job in the project (its folder satisfies `startingJob` or `liveJob` for a live process of the test) →
     exit 1, the job id in the output, HEAD unchanged, no tag;
   - a SHA of a commit that is not on `origin/adrian-rebuild` (on another branch of origin), and a SHA the repository
     does not have → exit 1, HEAD unchanged, no tag;
   - a newer SHA of the branch → exit 0, `git rev-parse HEAD` equals the SHA, HEAD is detached, one tag
     `deployed-…` points at the SHA;
   - a verification that fails → exit 4, HEAD is the previous SHA again, no tag on the new SHA;
   - the SHA the checkout already holds → exit 0 and a tag;
   - a changed tracked file in the checkout → exit 1, HEAD unchanged;
   - no registry in any home → exit 4, HEAD unchanged;
   - `node seat/deploy.ts` with no argument and with a short SHA → exit 2 (this runs the real entry point).
   Every wait is bounded; the fixtures live in a temporary folder that the test removes.
5. `docs/seat/agent-setup.md` `## Upgrade` item 1 (`:253`): the variant without the doorbell becomes root$ `node
   /opt/limen/seat/deploy.ts <full sha>`, with one sentence on what it checks and that it refuses while a job runs; the
   doorbell variant stays as it is (R-059 rewrites `github-setup.sh`).

## Out of scope

- The Pi type contract (R-017), the systemd unit verification (R-032) and the nftables check (R-056): they add their
  verifications to the list of item 1.7.
- Reading job state through the record module: R-021 changes the reader when `record.json` exists.
- The final JSON line `{class, code, next}` and the shared error type (R-013 for `src`, `hook` and `bin`; seat code
  follows with R-059).
- Ownership and permissions of `/opt/limen` (root-owned, no group or world write): A-025, R-049.
- A lock that a spawn honours during a deployment: the deployment is done in a quiet window (`## Deployment`,
  condition 5); see `## Risk`.
- `adrian-rebuild/tools/check.mjs` already checks that every stage calls the script (D-008); it does not change.

## Acceptance

- AC-1: `node --test test/seat/deploy.test.ts` → exit 0.
- AC-2: `node --test test/structure.test.ts` → exit 0.
- AC-3: `git grep -q 'seat/\*\*/\*.ts' -- tsconfig.json` → exit 0.
- AC-4: `git ls-files -- 'seat/*.sh' 'bin/*.sh' | grep -q .` → exit 1.
- AC-5: `git grep -q -E '\bimport\(' -- src hook` → exit 1.
- AC-6: `node seat/deploy.ts` → exit 2.
- AC-7: `node adrian-rebuild/tools/fails-before.mjs` → exit 0: the new and changed test files fail at `HEAD`; the
  outcome names each new test that passes at `HEAD` and why (the two scans of item 3 hold at `HEAD` and guard it).
- AC-8: `node adrian-rebuild/tools/gate.mjs` → exit 0 with `fail 0`.
- AC-9: `node adrian-rebuild/tools/check.mjs` → exit 0; `npx biome check --error-on-warnings adrian-rebuild` → exit 0.
- AC-10 (judgment): the script checks out nothing before steps 1–5 pass, every failure after the checkout returns to
  the previous SHA, and no code of the new checkout is imported into the running script.

## Migration

None: the script is new seat tooling and changes no format on disk. Step 1.0 of `## Deployment` is its bootstrap on
the seat.

## Risk

- A job started between the running-job check and the checkout runs on mixed code. Deployment condition 5 (Adrian stops
  spawning, the running jobs end, then he deploys) keeps that window empty; a lock is out of scope.
- An agents' account whose home is not in `/etc/passwd` has no registry the script finds; if no registry is found at
  all, the script refuses (exit 4) rather than deploy unchecked.
- The script runs as root and reads every registered project's job folders; it writes only in `/opt/limen` (the
  checkout and one tag).

## Rollback

`git revert $(git log --format=%H --grep='^R-012:' adrian-rebuild --)`; on the seat, a deployed SHA is left by running
the script (or, before a0.1.0, `git checkout --detach`) with the previous SHA (step 0.7).

## Decisions

- 2026-11-19 (main session, for Adrian at gate 5.1): the registries are found through the home directories of
  `/etc/passwd`, because the call `node /opt/limen/seat/deploy.ts <sha>` (D-008, checked by `check.mjs`) carries only
  the SHA, root has no registry, and T-03 forbids taking the location from the environment; this needs no new seat
  file and no new deployment step, and it reads every registration on the host, so it can only refuse more often.
  The alternative, a root-owned seat file that names the agents' account, adds a file and a step 1.0 action.
- 2026-11-19 (main session, for Adrian at gate 5.1): the tag is created last, after every check passed, not in D-008's
  step (4): a failed deployment then leaves no tag on a SHA that is not deployed, with the same purpose (a readable
  mark of what was deployed) and no tag to remove on the way back. The tag name `deployed-<UTC date and time>` is the
  main session's: the stage tags stay on the laptop (D-008), so the seat cannot name `a0.1.0`.
- 2026-11-19 (main session): the check for local changes (item 1.5) and the exit-code classes of each step follow T-02;
  `git fetch` failing is class 3 because its usual cause is the network.
- 2026-11-19 (main session, after the implementer's `DONE`): AC-6's command `node seat/deploy.ts` is not in `plan.md`
  → `## Commands`, so the permissions refused it to the implementer and to the main session; the error is the ticket's.
  Test 11 of `test/seat/deploy.test.ts` (in AC-1 and the gate) runs exactly that command and a short SHA through
  `spawnSync` and asserts exit 2, so AC-6 is judged by that test. Whether the command goes on the list is Q-8 in
  `.night/questions.md` (recommended: no; the script runs only as root on the seat).
- 2026-11-19 (main session): the implementer's deviations 1–6 of `outcome.md` are accepted for review: the time bound
  of a verification, the tag step and an unexpected exception inside the guarded part (D-010: "any failure after the
  checkout"), the entry-point check by real path instead of `import.meta.main` (root's Node 24 minor is unknown), the
  skipped non-absolute lines, the extra tests, and the upgrade line without `chmod -R go-w` (root's umask 022 writes no
  group- or world-writable file; the permissions of `/opt/limen` are R-049's).
- 2026-11-19 (main session, review round 1, PASS with six notes; `review.md` → Round 1). Fixes for the fresh
  implementer, each with a test that fails before the fix where a test can show it:
  1. Finding 1 (T-30): the comment above the dynamic-import scan in `test/structure.test.ts` says what the scan keeps,
     that one process runs one version of the code, and that the guard against a job that runs across a deployment is
     the running-job refusal of `seat/deploy.ts`, because the finalize path starts new `bin/limen` processes
     (`src/job/record.ts:66`, `src/job/group-cabinet.ts:325-326`). No test.
  2. Finding 2 (T-02): a git that cannot start (the spawn fails, no exit status) is class 4 in every step, `git fetch`
     included, with a line that names the missing or failing program; only a git fetch that ran and failed is class 3.
     Test: with `git` absent from `PATH` (the script's `git` call resolved through a `PATH` that the test controls, or
     a parameter for the git program), the deployment exits 4 and HEAD is unchanged.
  3. Finding 5 (trust boundary): every text the script prints that comes from a job folder (the job id, the label),
     from the registry or the password file (a project root), or from git (status lines, error messages, a
     verification's output) has its control characters (C0 except tab and newline where a line break is intended, DEL,
     C1) escaped before it is printed, so it cannot act on root's terminal. Test: a running job whose label holds an
     escape character → the refusal's output holds no raw control character and shows the label escaped.
  4. Finding 6 (reliability): git runs with root's environment minus the variables that locate a repository
     (`GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, `GIT_OBJECT_DIRECTORY`, `GIT_ALTERNATE_OBJECT_DIRECTORIES`,
     `GIT_COMMON_DIR`, `GIT_NAMESPACE`), so every step acts on the checkout above `seat/`. Test: with `GIT_DIR` set to
     another repository in the script's environment, a deployment of a newer SHA checks out that SHA in the fixture
     checkout and leaves the other repository's HEAD unchanged.
  Findings 3 and 4 are rejected (`review.md`). `outcome.md` records the fixes and their tests.
- 2026-11-19 (main session, review round 2, PASS with one note): the fix round's deviations 7–10 of `outcome.md` are
  accepted: the verifications get the same environment without the repository-location variables as git, a git ended
  by a signal is class 4 like one that cannot start, the escaping runs once over all output (and once more over the
  parts of a job line, with their newlines), and the internal functions take one checkout value. Each serves the fix
  it belongs to.
