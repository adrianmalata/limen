<!-- PL: Wynik ticketu R-012: nowy skrypt roota `seat/deploy.ts`, który wdraża commit o pełnym SHA
z `origin/adrian-rebuild` do checkoutu nad swoim folderem, odmawia, gdy działa jakiekolwiek zadanie zarejestrowanego
projektu, a po każdym błędzie po checkoucie wraca do poprzedniego commita z kodem 4. Do tego `seat/` w `tsconfig.json`,
dwa skany w `test/structure.test.ts` i jedno zdanie w `docs/seat/agent-setup.md`. Runda poprawek po recenzji dodała
cztery zmiany: poprawiony komentarz skanu D3, klasę 4 dla gita, który się nie uruchamia, escapowanie znaków
sterujących w tekście wypisywanym rootowi i git bez zmiennych wskazujących inne repozytorium; trzy nowe testy padały
przed poprawką. Bramka 149/149. Stan: zamknięty (19.11, nocny przebieg; recenzja PASS w rundach 1 i 2). -->

# Outcome: R-012 A root deployment script for a pinned SHA

## Review round 1 fixes (round 2)

The four fixes of `ticket.md` → `## Decisions` ("review round 1"), each in `seat/deploy.ts` or
`test/structure.test.ts`, and three new tests at the end of `test/seat/deploy.test.ts` (tests 12–14; tests 1–11 keep
their numbers, so "test 11" in `ticket.md` still names the entry-point test).

1. Finding 1 (T-30), comment only, no test. The comment above the dynamic-import scan in `test/structure.test.ts` now
   says three things. With static imports only, a process loads all of its code when it starts, so one process runs one
   version of the code. A job's finalize path can start a new `bin/limen` (`src/job/record.ts:66`,
   `src/job/group-cabinet.ts:325-326`), which loads what `/opt/limen` holds then. So the guard against a job that runs
   across a deployment is the running-job refusal of `seat/deploy.ts`, not the scan. "Can start": `record.ts:65`
   starts it only for a group's coordinator member.
2. Finding 2 (T-02): a git that does not run to an exit status is class 4 in every step. The new function `ran()` runs
   git and throws a class-4 `DeployFailure` when git has no exit status: the spawn failed (for example `ENOENT`), or a
   signal ended it. Its line is `cannot run git in <repo> for git <args>: <cause>`, with `next: check that root's PATH
   has a working git (command -v git), then run <the same command>`. Every step calls it: `fetchBranch`,
   `requireOnBranch`, and through `gitText` the status check, `rev-parse`, the checkout and the tag. So only a
   `git fetch` that ran and exited non-zero is class 3. `git()` itself still never throws, so `returned()` can use it
   after any failure; when git cannot start there, the line says that the return failed and names both SHAs.
   Test 13: "a git that cannot start fails the deployment with exit 4, not the network's 3, and HEAD stays". The
   script's environment has `PATH` set to an empty folder of the fixture. Result: exit 4, HEAD `older`, no tag,
   `origin/adrian-rebuild` still `older`, and stderr matches `cannot run git`.
3. Finding 5 (trust boundary): `printable(text, newlines)` writes each control character (`\p{Cc}`: C0, DEL and C1)
   except tab as `\xNN`. Newlines are kept as line breaks only when `newlines` is `"keep"`. `runDeploy` passes the whole
   stdout and stderr through it with newlines kept. That covers every printed text from a job folder, a registry, the
   password file, git (status lines, error messages) or a verification's output, and the stack of exit 5. Each part of
   a running job's line (root, id, label) also goes through it with newlines escaped, so a newline in a folder name or
   a label cannot forge a line of the refusal. Running the function twice changes nothing more, because its output
   holds no control character.
   Test 12: "a job label with control characters is printed escaped, and the refusal holds no raw control character".
   A starting job's label is `demo \u001b]0;owned\u0007 job`, a terminal title sequence. Result: exit 1, stderr without
   its newlines does not match `/\p{Cc}/u`, and stderr holds the line `<project>  <id>  demo \x1b]0;owned\x07 job`.
4. Finding 6 (reliability): `deploy()` builds one `Checkout` (`repo`, `env`, `retry`). Its `env` is the input
   environment without `REPOSITORY_LOCATION`: `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, `GIT_OBJECT_DIRECTORY`,
   `GIT_ALTERNATE_OBJECT_DIRECTORIES`, `GIT_COMMON_DIR` and `GIT_NAMESPACE`. Every git call and every verification gets
   that environment. To make the environment testable, `DeployInput` has a new field `env`, and the entry point passes
   `process.env` (the ticket offered "a `PATH` that the test controls, or a parameter"). The test helper `deployTo`
   passes `process.env` by default.
   Test 14: "a GIT_DIR in the script's environment does not move the deployment to another repository". The fixture
   gets a second repository `other` with one commit, and the script's environment holds
   `GIT_DIR=<other>/.git`. Result: exit 0, the fixture checkout's HEAD is `newer`, and `other`'s HEAD is unchanged.

### Fails before (round 2)

Order of work: I wrote tests 12–14 first and ran them on the round-1 script. Then I added only the plumbing:
`DeployInput.env` and `Checkout`, passed unchanged to git and the verifications, with no change in behaviour. Then I
ran them again, and then made the fixes. Without the plumbing, tests 13 and 14 could not reach the mechanism, because
the round-1 script took no environment input. All runs: `node --test test/seat/deploy.test.ts` from the repository
root. Output shortened: no stack frames.

- On the round-1 script: exit 1; tests 14, pass 12, fail 2. Test 12 failed for its reason (the raw ESC and BEL, below).
  Test 13 failed for another reason: the test's `PATH` did not reach git, the deployment succeeded, and the assertion
  saw `0`. Test 14 passed, because its `GIT_DIR` did not reach git either.
- After the plumbing: exit 1; tests 14, pass 11, fail 3, each for the reason of its fix:
  ```
  ✖ a job label with control characters is printed escaped, and the refusal holds no raw control character
    AssertionError [ERR_ASSERTION]: The input was expected to not match the regular expression /\p{Cc}/u. Input:
    'refused: 1 job runs, … one job:/tmp/limen-deploy-AoPN5h/project  2026-11-19-demo-1a2b3c4d  demo \x1B]0;owned\x07 jobnext: …'
  ✖ a git that cannot start fails the deployment with exit 4, not the network's 3, and HEAD stays
    AssertionError [ERR_ASSERTION]: git fetch origin adrian-rebuild failed in /tmp/limen-deploy-COloL6/repo: spawnSync git ENOENT
    next: the usual cause is the network, and the command is safe to run again: node …/repo/seat/deploy.ts 6ce1022…
    + actual - expected
    +   3,
    -   4,
  ✖ a GIT_DIR in the script's environment does not move the deployment to another repository
    AssertionError [ERR_ASSERTION]: git fetch origin adrian-rebuild failed in /tmp/limen-deploy-wAeAXm/repo: fatal: 'origin' does not appear to be a git repository
    + actual - expected
    +   3,
    +   '118190c…',   (HEAD still older)
    -   0,
    -   '6ce1022…',   (HEAD newer)
  ```
  In test 12, `\x1B` and `\x07` are how the assertion prints the raw characters. In test 14, git ran in `other`, which
  has no `origin`.
- After the fixes: exit 0; tests 14, pass 14, fail 0.
- At `HEAD`, `seat/deploy.ts` does not exist, so the whole file still fails at its import (`## Fails before` below);
  `fails-before.mjs` is the main session's run.

### Proof (round 2)

From the repository root, Node 26.13.1, git 2.34.1:
- `node --test test/seat/deploy.test.ts`: exit 0; tests 14, pass 14, fail 0.
- `node --test test/structure.test.ts`: exit 0; tests 4, pass 4, fail 0.
- `npx tsc --noEmit`: exit 0, no output.
- `npx biome format --write seat test/seat test/structure.test.ts`: "Formatted 3 files … Fixed 1 file." (the line
  break in `printable`). Then `npx biome check --error-on-warnings seat test/seat test/structure.test.ts`: exit 0,
  "Checked 3 files … No fixes applied."
- `node adrian-rebuild/tools/gate.mjs`: exit 0; tests 149, pass 149, fail 0, cancelled 0, skipped 0 (59.6 s), with the
  shim line for git 2.34.1. Round 1 had 146; this round adds 3. After that run I changed only the wording of the
  structure-test comment, then ran the gate again on the final tree: exit 0; tests 149, pass 149, fail 0, cancelled 0,
  skipped 0 (61.6 s).
- `node adrian-rebuild/tools/check.mjs`: exit 0, "0 errors" (103 PL summaries, 14 ticket folders, 12 `changes.md`
  entries). `npx biome check --error-on-warnings adrian-rebuild`: exit 0, "Checked 28 files … No fixes applied." Both
  were run after this file was written and again after this line; the reply gives the last result.

### Deviations (round 2)

7. The verifications get the same environment as git, without `REPOSITORY_LOCATION`. The fix names git, and its reason
   is "so every step acts on the checkout above `seat/`". A verification is one of those steps and runs with `cwd` in
   the checkout, so a `GIT_DIR` would move any git call it makes as well. At stage 1 the list is empty.
8. A git that a signal ends also counts as class 4, not 3. The fix says "a git that cannot start (the spawn fails, no
   exit status)". A git killed by a signal has no exit status either and says nothing about the network, so `ran()`
   uses the missing exit status as its condition. No test covers the signal case.
9. Escaping happens once, at the output of `runDeploy`, and not at each source. So no text can reach root's terminal
   unescaped, whatever its source. The parts of a job line are escaped once more, with newlines, at their source.
10. `fetchBranch`, `requireOnBranch`, `requireClean` and `switchTo` lost their `repo` and `retry` parameters to
   `Checkout`. This is a mechanical change, so that `ran()` can name the command to run again in every step.

## Done

Round 1's work. Where round 2 changed it, the text says so; the section above gives the detail.

- Item 1, new `seat/deploy.ts`:
  - `runDeploy(input)` turns the result or a failure into `{ code, stdout, stderr }`. A `DeployFailure` (exit class
    1–4, message, next command) gives its code. Any other exception gives 5, with `util.inspect` of the error (stack
    and `cause`) on stderr. The entry point at the end of the file calls `runDeploy` with the real values
    (`process.argv.slice(2)`, the folder above `seat/`, `/etc/passwd`, `Date.now`, the empty list `VERIFICATIONS`, and
    from round 2 `process.env`). It writes the two texts and is the only place that sets `process.exitCode` (T-02).
    From round 2, `runDeploy` escapes the control characters of both texts.
  - `deploy(input)` runs the steps in the ticket's order:
    1. `requestedSha`: exactly one argument matching `^[0-9a-f]{40}$`; otherwise exit 2 with the usage line ("takes
       one argument, the full 40-character commit SHA") and, in `next`, the command with "<the full SHA from the
       stage's gate summary>".
    2. `refuseRunningJobs`: the homes are field 6 of each line of the password file, kept when absolute. For each
       home, `<home>/.limen/projects` is read when it exists; ENOENT and ENOTDIR mean no registry. Every absolute line
       of a registry is a root. `<root>/.limen/jobs/` is read; ENOENT and ENOTDIR skip the root (a junk line). A job
       folder counts as running when `liveJob(dir, now)` or `startingJob(dir)` holds (`src/runtime/reap.ts`). The
       label comes from `textFile(<dir>/label)` (`src/job/record.ts`). No registry at all gives exit 4 ("no project
       registry under any home directory of <passwd>; the running jobs cannot be checked"). Running jobs give exit 1:
       a line with the count, one line `<root>  <id>  <label>` per job (no label part when the label is empty), and
       `next: wait until it ends|they end, then run the same command again: node <repo>/seat/deploy.ts <sha>`. Any
       other read error gives exit 4 and names the path.
    3. `fetchBranch`: `git fetch origin adrian-rebuild`; a failure gives exit 3 with git's message, and `next` says
       the command is safe to run again. From round 2 that holds only for a fetch that ran and exited non-zero; a git
       with no exit status gives exit 4, in this step and in every other.
    4. `requireOnBranch`: `git merge-base --is-ancestor <sha> origin/adrian-rebuild`. Exit 1 of git means "not an
       ancestor of the branch". Any other failure, as for a commit the checkout lacks, adds git's message. Both give
       exit 1 with a line that names `origin/adrian-rebuild`.
    5. `requireClean`: `git status --porcelain`; any line gives exit 1 with the lines as git prints them.
    6. The previous commit is `git rev-parse HEAD`. Then `switchTo` runs `git checkout --detach <sha>` and checks that
       `git rev-parse HEAD` equals the SHA.
    7. The verifications run in order. Each is `{ name, argv, timeoutMs }` and runs with `spawnSync` with `cwd` set to
       the checkout, so it runs the new commit's code, never this script's. A non-zero exit, a signal, a spawn error
       or the time bound fails it. The message names the verification and its cause, with at most the last 20 lines
       of its output; a cut output says how many lines it had.
    8. A failure in 6–7, or in the tag of 9, makes `returned` run `git checkout --detach <previous>` and then `git
       rev-parse HEAD`. The checkout counts as back only when the checkout succeeded and HEAD is the previous commit.
       Then the exit is 4: the failure's message, then "the checkout is back at the previous commit <previous>", and
       the failure's `next`. When the return fails, the line says so, names the previous commit, the commit the
       checkout holds and the SHA, and `next` gives the command to return by hand.
    9. Success: `git tag deployed-<YYYY-MM-DD-HHMMSS UTC>` on the SHA (a lightweight tag), then exit 0 with
       `deployed <sha> in <repo> (previous <previous>), tag <tag>` and `next: /reload every coordinator session
       (adrian-rebuild/plan.md, ## Deployment, step 0.3)`. Deploying the commit HEAD already holds runs every step.
  - The script imports `src/runtime/reap.ts` and `src/job/record.ts` statically. Node loads and links them before the
    script's code runs, so before the checkout; the D3 scan of item 3 keeps `src/` free of dynamic imports.
- Item 2: `tsconfig.json` `include` is `["src/**/*.ts", "hook/**/*.ts", "seat/**/*.ts", "test/**/*.ts"]`.
- Item 3, `test/structure.test.ts`, with a helper `filesIn(folders)` that reads the files below each folder of the
  repository root that exists:
  - "D-010: no file in seat/ or bin/ is a shell script ending in .sh";
  - "no TypeScript file in src/ or hook/ loads a module with a dynamic import" (regex `\bimport\s*\(` over every
    `.ts` file), with a comment that cites gate 2 §7 D3 and says why `bin/limen` is outside (rewritten in round 2).
- Item 4, new `test/seat/deploy.test.ts`, written before `seat/deploy.ts` (11 tests in round 1; round 2 adds tests
  12–14). Each test builds a fixture in
  a new folder under the OS temporary folder and removes it in `t.after`:
  - a work repository with `adrian-rebuild` at `older`, and a branch `side` with one more commit;
  - a bare origin cloned from it;
  - a clone of origin as the checkout, detached at `older`;
  - then `newer` committed and pushed to origin's `adrian-rebuild`, so only the script's fetch brings it;
  - a password file with two homes. One has no registry. The other holds `.limen/projects`, which lists the project
    and a junk line (a folder with no `.limen/jobs/`). The project has one finished job (`state` = `done`).

  The test process sets `GIT_CONFIG_GLOBAL=/dev/null` and `GIT_CONFIG_NOSYSTEM=1` for itself, because the script runs
  git in that process. Every wait is bounded:
  - git runs synchronously;
  - a verification and the run of the real entry point have a bound of 60 s;
  - the wrapper child of test 2 ends after 60 s by itself and gets `SIGKILL` in `finally`.

  The tests:
  1. "a job its spawner still sets up refuses the deployment before the fetch, naming the job and its label":
     `starting` holds the test's pid. Result: exit 1, HEAD `older`, no tag, `origin/adrian-rebuild` still `older`, and
     the line `<project>  <id>  demo job`.
  2. "a job whose wrapper's process group is alive refuses the deployment before the fetch": `state` = `running`, and
     `pid` is a detached child, which leads its own process group. Same result as test 1.
  3. "a commit of another branch of origin is refused, naming the branch, and HEAD and the tags stay": exit 1.
  4. "a commit the checkout does not have is refused, naming the branch, and HEAD and the tags stay": exit 1.
  5. "a newer commit of the branch is fetched, checked out detached and tagged once": exit 0, HEAD `newer`,
     `rev-parse --abbrev-ref HEAD` = `HEAD`, the only tag is `deployed-2026-11-19-063000` and it points at `newer`,
     and stdout names `newer`, `older`, the tag and `/reload`.
  6. "a failed verification returns the checkout to the previous commit and exits 4 with no tag": exit 4, HEAD
     `older`, no tag, and the messages.
  7. "a verification runs as its own process in the new checkout": the verification passes only where `newer.txt`
     exists. Result: exit 0, HEAD `newer`, and the tag.
  8. "deploying the commit the checkout already holds runs every step and tags it": exit 0, HEAD `older`, the fetch
     happened (`origin/adrian-rebuild` = `newer`), and the tag on `older`.
  9. "a changed tracked file in the checkout refuses the deployment and lists the file": exit 1, HEAD unchanged, and
     the line ` M README.md`.
  10. "no project registry under any home directory refuses the deployment with exit 4 before the fetch".
  11. "the entry point exits 2 and asks for the full SHA without an argument and with a short SHA": `node
      seat/deploy.ts` and `node seat/deploy.ts abc1234`, through `spawnSync` with a bound.
- Item 5: `docs/seat/agent-setup.md` `## Upgrade` item 1, the variant without the doorbell. It now reads: root$ `node
  /opt/limen/seat/deploy.ts <full sha>`, followed by one sentence: the script refuses while any job of a project
  registered on the seat runs, checks that the commit is on `origin/adrian-rebuild` and that the checkout is clean
  before it checks the commit out detached, and returns `/opt/limen` to the previous commit when anything fails after
  that. The doorbell variant is unchanged.

## Proof

Round 1. For round 2, see `### Proof (round 2)` above.

My runs, from the repository root (Node 26.13.1, git 2.34.1 on the laptop):

- `node --test test/seat/deploy.test.ts test/structure.test.ts` (absolute paths): exit 0. Tests 15, pass 15, fail 0
  (deploy 11 of 11, structure 4 of 4).
- `npx tsc --noEmit`: exit 0, no output.
- `npx biome check --error-on-warnings seat test/seat test/structure.test.ts tsconfig.json`: exit 0 ("Checked 4
  files … No fixes applied."), after `npx biome format --write` on the same paths.
- `node adrian-rebuild/tools/gate.mjs`: exit 0. Tests 146, pass 146, fail 0, cancelled 0, skipped 0 (59.6 s). It
  printed "gate: git version 2.34.1 lacks 'worktree list -z'; the shim in …/node_modules/.rebuild-gate emulates
  it". R-009's gate had 133 tests; this ticket adds 13 (11 + 2).
- AC-1 and AC-2: in the run above, and in the gate.
- AC-3: `git grep -n 'seat/\*\*/\*.ts' -- tsconfig.json` prints `tsconfig.json:21` with the new `include`, so `-q`
  exits 0.
- AC-4: `git ls-files -- 'seat/*.sh' 'bin/*.sh'` prints nothing, so `… | grep -q .` exits 1.
- AC-5: `git grep -n -E '\bimport\(' -- src hook` prints nothing (no match, exit 1). In this harness a `grep` exit 1
  shows the same as a silent exit 0 (R-009 recorded the same), so I ran the grep criteria without `-q`.
- AC-6: I could not run `node seat/deploy.ts` myself, because it is not on the allow-list (refused in `dontAsk`
  mode). Test 11 runs exactly that command through `spawnSync` and asserts exit 2.
- AC-7 is the main session's run of `fails-before.mjs`; see `## Fails before` for mine.
- `node adrian-rebuild/tools/check.mjs` and `npx biome check --error-on-warnings adrian-rebuild`: see `## Final runs`.

## Final runs

Round 1. They were run after the first draft of this file was written, without a pipe:

- `node adrian-rebuild/tools/check.mjs`: exit 0, "0 errors" (102 PL summaries, 14 ticket folders, 12 `changes.md`
  entries).
- `npx biome check --error-on-warnings adrian-rebuild`: exit 0 ("Checked 28 files … No fixes applied.").

Both were run again after this section was filled in; the reply gives their result.

Main session's runs (they count, `## Agents` step 4):
- `node adrian-rebuild/tools/review-guard.mjs compare --git node_modules/.rebuild-review/R-012.git
  adrian-rebuild/R-012-root-deploy-script/ticket.md`: "the implementer's run is within its limits", exit 0.
- `node adrian-rebuild/tools/gate.mjs`: exit 0; tests 146, pass 146, fail 0, cancelled 0, skipped 0 (58.6 s).
- `node seat/deploy.ts` (AC-6): refused by the permissions, as for the implementer; AC-6 is judged by test 11
  (`ticket.md` → `## Decisions`, Q-8).
- After the fix round (round 2): `review-guard.mjs compare --git` with a new snapshot taken before the fresh
  implementer → "within its limits", exit 0; `node adrian-rebuild/tools/gate.mjs` → exit 0, tests 149, pass 149, fail
  0 (59.6 s); `node adrian-rebuild/tools/fails-before.mjs` → exit 0, "test/structure.test.ts, test/seat/deploy.test.ts
  fail at HEAD (exit 1)".

## Fails before

Round 1. For tests 12–14, see `### Fails before (round 2)` above.

Main session's run of `node adrian-rebuild/tools/fails-before.mjs`: exit 0, with the line "fails-before:
test/structure.test.ts, test/seat/deploy.test.ts fail at HEAD (exit 1)". At `HEAD` the deploy test fails at its import
(`ERR_MODULE_NOT_FOUND` for `seat/deploy.ts`), and the four tests of `test/structure.test.ts` pass, the two new scans
among them (below).

I wrote `test/seat/deploy.test.ts` before `seat/deploy.ts` existed and ran it on the unchanged source, outside the
gate's environment. It runs no `git worktree list -z` (D-034). The output is shortened: no stack frames.

- `node --test /home/…/limen/test/seat/deploy.test.ts`: exit 1; tests 1, pass 0, fail 1.
  ```
  Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/home/…/limen/seat/deploy.ts' imported from /home/…/limen/test/seat/deploy.test.ts
  ✖ /home/…/limen/test/seat/deploy.test.ts (76.099714ms)
    'test failed'
  ```
  At `HEAD`, `seat/deploy.ts` does not exist, so the file fails at its import (ticket item 4).
- New tests that pass at `HEAD` by design (AC-7): the two scans in `test/structure.test.ts`. `node --test
  test/structure.test.ts` on the unchanged source: exit 0, tests 4, pass 4, with both new scans passing. They are
  guards: at `HEAD` there is no `.sh` file in `bin/` and no `seat/` (the helper reads only folders that exist), and no
  dynamic `import(` in `src/` or `hook/`. They fail only when a later change adds one. The changed file passes at
  `HEAD`, but `fails-before.mjs` runs it together with `test/seat/deploy.test.ts`, which fails there.
- I did not run a positive control of the two scans (a `.sh` file in `seat/`, a dynamic import in `src/`): I could
  not remove such a file afterwards, because `rm` is denied and `git rm` covers only tracked paths.

## Deviations from the ticket

Round 1 (accepted for review in `ticket.md` → `## Decisions`); deviations 7–10 of round 2 are above.

1. A verification also has a time bound (`timeoutMs`), which the ticket does not name. A verification that hangs then
   ends as a failure, so the return to the previous commit runs (z. 1). At stage 1 the list is empty, so R-017, R-032
   and R-056 set the bound of theirs.
2. The tag step (9) is in the guarded part, so a failed `git tag` also returns to the previous commit and exits 4.
   The ticket's item 8 names steps 6–7. D-010 and `## Deployment` 0.2 say "on any failure after the checkout", and so
   does AC-10. An unexpected exception after the checkout also returns the checkout first, then exits 5 with the
   stack and the line on the state of the checkout.
3. The entry point compares `realpathSync(process.argv[1])` with the module's own path instead of using
   `import.meta.main`, which `adrian-rebuild/tools/*.mjs` use. Node has `import.meta.main` only from 24.2, and the
   seat's root runs Node 24 of a minor I do not know (`## System requirements`). There, a missed entry point would
   exit 0 having done nothing. The comment above the check says so.
4. Two shapes are skipped: a registry line that is not an absolute path and a password-file home that is not
   absolute. `limen init` registers `resolve(root)` (`src/project/seat.ts:37`), so such a line can only be junk, and a
   relative path would resolve against root's working folder.
5. The running-jobs case has two tests, one for `startingJob` and one for `liveJob`. Test 7 is added for AC-10 (a
   verification runs in the new checkout). The fixture pushes `newer` after the clone, so test 5 also shows the fetch.
6. Docs: the new line has no `chmod -R go-w /opt/limen`, which ended the old command. The ticket gives the new line
   without it, and the permissions of `/opt/limen` are A-025's (R-049). See open point 3.

## Measurement

- `measured` (the main session, for `changes.md`): every step of the script is checked by the fixture tests. Its run
  as root on the seat is not a metric of `## Measurement` but the check of `## Deployment` step 1.0 (the bootstrap)
  and then of every step 0.2.
- M-10 (gate run time): 59.6 s in the run after the change; after round 2 (149 tests), 59.6 s and 61.6 s; recorded
  at the close of the stage.

## Open points

1. `observed` (read in the code, no run): Ctrl-C in root's terminal during a verification ends the script with the new
   commit checked out and no return, because the signal reaches the whole foreground process group and the script
   has no handler. A verification's time bound covers a hang, not an interrupt. R-017 adds the first long
   verification and may want a handler.
2. `observed`: `git fetch origin adrian-rebuild` moves `origin/adrian-rebuild` only when the checkout's fetch refspec
   covers that branch, as the default `+refs/heads/*:refs/remotes/origin/*` of a clone does. A clone made with
   `--single-branch` of another branch would leave `origin/adrian-rebuild` stale or missing. The script then refuses
   with exit 1 and never checks out an unchecked commit. The manual step 1.0 relies on the same refspec.
3. The new line in `## Upgrade` drops the old `chmod -R go-w /opt/limen` (deviation 6). A checkout by root with umask
   022 creates no group- or world-writable file. Whether the docs keep the `chmod` until R-049 is the main session's
   call.
4. Out of scope and unchanged: other manual checkouts in the docs, namely phase 4's install
   (`docs/seat/agent-setup.md:108`), the doorbell block (`:223`, `docs/seat/github-setup.sh:75`, rewritten by R-059)
   and `docs/remote.md:115`. `package.json` → `files` does not list `seat/`. `/opt/limen` is a git checkout, not an
   npm package, so the script does not need it there.
5. The D3 scan is stricter than AC-5. It also matches `import (` with a space, an `import(` in a comment or a string,
   and the type form `import("x").T`. There are none today.
