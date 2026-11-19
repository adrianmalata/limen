<!-- PL: Wynik ticketu R-013 (nocny przebieg 19.11): nowy moduł `src/outcome.ts` z jednym typem
błędu `LimenError`, klasami i kodami wyjścia 0–5, końcową linią JSON i jedyną funkcją klienta `readOutcome`; `main` jako
jedyne miejsce, które ustawia kod wyjścia i drukuje dokładnie jedną końcową linię; `ticket check`, `picture build
--strict`, `github poll` i `group wait` rzucają błędy z klasą, a `spawn`, `continue`, `keeper`, `github review|work` i
`ticket new` zwracają `ids`. Runda poprawek po recenzji 1: złota linia spawn porównywana dosłownie, 403 z limitem jako
klasa 3, brak pliku projektów jako GITHUB_CONFIG, starsze formaty identyfikatorów zadań, poprawione zdania w
podręczniku i dokumentacji. Bramka 198/198 (191 po rundzie 1, 149 przed ticketem). Stan: zamknięty (recenzja PASS
w rundach 1 i 2). -->

# Outcome: R-013 One error type, exit codes as failure classes, a final JSON line

## Done

- Item 1, new `src/outcome.ts`, the only module that writes or parses the final line:
  - `EXIT_CODES` (`ok` 0, `refused` 1, `usage` 2, `transient` 3, `environment` 4, `internal` 5), the types
    `OutcomeClass`, `FailureClass`, `Ids`, `Success`, `Outcome` and `Output`, and the constants `UNTYPED` and
    `JOB_STARTED` (D-022's `next` of `spawn`).
  - `LimenError extends Error` with `class`, `code`, `message`, `next` and an optional `cause`. The constructor throws a
    `TypeError` for a class that is not a failure class, a code that does not match `^[A-Z][A-Z0-9_]*$`, and an empty
    `next` of a `refused` or `usage` error, except for the code `UNTYPED` (deviation 3).
  - `finalLine(outcome)`: `class`, `code`, `next`, then `ids` only when given. It checks the outcome with the same
    validator as `readOutcome`, so `main` cannot print a malformed line.
  - `failureOf(error)`: a `LimenError` as it is; an `Error` whose prototype is `Error.prototype` becomes `refused`,
    `UNTYPED`, `next` `""`; any other value becomes `internal`, `INTERNAL`. Both keep the value as `cause`.
  - `readOutcome({ status, stdout, stderr })`: the last non-empty line of stdout when `status` is 0, of stderr
    otherwise. It throws a `LimenError` `internal`/`INTERNAL` that names the fault for: no line, a line that is not JSON
    or not an object, an unknown key, an unknown class, `code` not `0` for `ok` or not an identifier for a failure, a
    `next` that is not a string, `ids` that are not an object, an unknown `ids` key, an id not in its format (job id
    `^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]{0,31}-(?:[0-9a-f]{4}|[0-9a-f]{8})$`, every form `makeJobId` has written,
    since the fix round; `^F\d{3,}$`; `^Q-\d{3}$`), and a class whose exit code differs from `status`.
  - `outputText(output)`: the text for people on the stream that carries the final line, without that line; it calls
    `readOutcome` first (deviation 1).
  - No casts: type guards and a field map instead (T-27).
- Item 2, `src/main.ts`: `main` runs the internal job run first (`internalRun`: no final line, exit 1 on a failure as
  before). Otherwise `runCommand` returns `Success | undefined`. On success `main` prints the success line on stdout
  after the command's own lines and sets `process.exitCode = 0`. On a failure it prints the message on stderr, the stack
  of the thrown value for `internal`, then the failure line, and sets the class's exit code. The help (`limen`,
  `--help`, `-h`, `help`, `limen <command> --help`) returns `undefined`, so it ends with
  `{"class":"ok","code":0,"next":""}`. An unknown command is `usage`, `UNKNOWN_COMMAND`, `next` `limen --help`, with
  today's message; the lookup uses `Object.hasOwn` (deviation 9). The `Command` type is `(args, cwd) =>
  Promise<Success | undefined>`; the commands that never return a result are typed `Promise<undefined>` (deviation 4).
  No command prints a final line, so an in-process call (`keeper` → `spawnCommand`, `group` → `spawnCommand`,
  `group-rounds` → `continueCommand`, `group` → `stopCommand`) prints none.
- Item 3, `src/commands/flags.ts`: the four throws of `parseFlags` and `checkedFlag` throw `badFlag(message)`, a
  `LimenError` `usage`, `BAD_FLAG`, `next` `limen --help`, with the command's own message.
- Item 4, `ids` and `next`: the commands whose success creates exactly one job, found by reading every command:
  `spawn` (`spawnCommand` now returns the id from `recordSpawnedJob`, also under the group launch lock), `continue`
  (`continueJob` returns the id, also through the lock), `keeper` (returns `spawnCommand`'s result), `github review` and
  `github work` (`handOffClaim` returns the id of `startGithubJob`). Each returns `{ next: JOB_STARTED, ids: { job } }`.
  `ticket new` returns `{ next: "", ids: { ticket: <FNNN> } }` (the callback of `withNextTicketCode` returns the code
  with the path). `group start` creates one job per team, so it returns nothing. Every text line stays.
- Item 5, callers: the ten callers of `## Problem` read the id through the new helper `startedJob(run)` in
  `test/plant.ts` (`readOutcome(run).ids?.job`, a thrown error without it), `spawnJob` among them. The group ids of
  `test/s8-groups.test.ts` and `test/group-extensions.test.ts` come from `.limen/groups/` (`groupsOn(feature)`,
  `onlyGroup(root)`). The `--extension` without a value in `test/group-extensions.test.ts` asserts 2. The tests that
  compared a stream with text for people compare `outputText(run)` now (deviation 11).
- Item 6, `bin/limen`: on a Node older than 24 it prints the message, then the literal
  `{"class":"environment","code":"NODE_VERSION","next":"install Node.js 24 or newer"}` on stderr, and exits 4.
- Item 7, `test/structure.test.ts`, with two helpers, `sources(folders)` and `occurrences(folders, literal, only)`:
  - "T-02: process.exitCode and process.exit appear in src/, hook/ and bin/ only in src/main.ts and bin/limen, with
    literal codes 0-5";
  - "T-26 (4): only src/outcome.ts builds the final line in src/, hook/ and bin/" (`/JSON\.stringify\(\{ ?class/`);
  - "T-01: the catch-all sites in src/ and hook/ stay at most their count at R-013's parent, and src/outcome.ts has
    none": `catch {` ≤ 81 and `.catch(() => {})` ≤ 27, the exact counts at `b8babe2` (read by running the test on the
    unchanged source), with a comment that names R-082;
  - "T-01: the untyped throw new Error( sites in src/ and hook/ stay at most their count at R-013's parent, less the
    typed ones": ≤ 275 − 14 = 261. The comment names the 14 sites: the four of `src/commands/flags.ts` and ten of
    `src/integrations/github-poller.ts` (six checks before the loop, two in `appJwt`, one in `privatePath`, one in
    `installationToken`). After the change the count is exactly 261 (flags.ts 0 of 4, github-poller.ts 6 of 16; the
    removed-command throw of `main.ts` stays one site).
- Item 8, tests, written before the change:
  - new `test/outcome.test.ts` (31 tests): `finalLine` (2), `failureOf` (4), the `LimenError` checks (1), `readOutcome`
    returns (2) and refuses (15, one per fault), `outputText` (1), and through `bin/limen` on one plant: `--help`,
    `UNKNOWN_COMMAND` (exit 2), `BAD_FLAG` of `spawn --nosuch` (exit 2, no job folder), `UNTYPED` of `limen jobs
    <unknown id>` (exit 1), `limen status`, and `ticket new` with `ids.ticket` equal to the folder it wrote;
  - `test/s1-spawn.test.ts`: "a detached spawn ends with the golden final line, whose ids.job names the job folder it
    made": `readOutcome(run).ids.job` equals the one new job folder, and the raw last line of stdout equals the golden
    text, so the key order counts (since the fix round; in round 1 the test compared `JSON.stringify(readOutcome(run))`,
    which re-serialised the parsed object and could not see the order);
  - new `test/cli/ticket.test.ts`, `test/cli/picture.test.ts`, `test/cli/github.test.ts` (`GITHUB_NETWORK` with the
    plant's fetch sink answering 503, `GITHUB_CONFIG` without `LIMEN_GITHUB_PROJECTS_FILE`) and `test/cli/group.test.ts`
    (through `bin/limen` with `--timeout 500ms`, one line starting `{"class"` in both streams; and `waitCapped(20, …)`
    in-process on a promise that never settles).
- Item 9, docs: `docs/commands.md` has a section "Exit codes and the final line" (the six classes with what gives each
  today, the fields, `ids`, the streams, an example, `readOutcome`); its spawn sentence says the final line carries the
  id in `ids.job`, and its `limen init` sentence says the text ends with `next:` and the final line follows.
  `docs/jobs.md` (Job ID) and `docs/seat/agent-setup.md` (phase 13: the last text line on stderr, then
  `{"class":"refused","code":"UNTYPED","next":""}`) say the same.
- Item 10:
  - `ticket check`: the failing lines on stderr as today, then `LimenError` `refused`, `TICKET_CHECK_FAILED`, message
    `ticket check: changed tickets on <branch> fail against <target>`, `next` `fix the tickets listed above, then run
    limen ticket check <branch>`.
  - `picture build --strict`: the diagnostics on stderr and the counts on stdout as today, then `refused`,
    `PICTURE_INVALID`, message `picture build --strict: N error(s) in the map, its tickets or its board`, `next` `fix the
    errors listed above, then run limen picture build --strict`.
  - `github poll`: `api()` turns a rejected `fetch` (the 15-second abort included), HTTP 429 or 5xx, and (fix round)
    an HTTP 403 that is a rate limit into `networkFailure` (`transient`, `GITHUB_NETWORK`), HTTP 401 and any other 403
    into `configFailure` (`environment`, `GITHUB_CONFIG`), both with `next` `limen github doctor`; other statuses stay a
    plain `Error` with today's text, so `found()` still sees `HTTP 404` (deviation 8). The checks before the loop,
    `appJwt`, `privatePath` and the token that GitHub does not issue throw `configFailure`; so do a `stat` of the state
    directory or of the App key that fails (deviation 7), and (fix round) a read of the projects file that fails. The
    loop prints each project's failure on its own line, as today, and goes on; then it throws a `LimenError` with the
    class, code and `next` of the most severe failure (highest exit code, by `failureOf`), the message `github poll
    failed for N of M projects, each on its line above`, and the thrown value as `cause`, so an internal error prints
    its own stack.
- Item 11, `group wait`: no `process.exit`. `waitGroup` throws `GROUP_WAIT_TIMEOUT` (`transient`, `next` `limen group
  status <id>`, or `limen group status` for a member) when its requested limit passes before the group finishes. The
  new exported `waitCapped(boundMs, next, operation)` races the operation with a cap promise that rejects with the same
  code; it passes an `AbortSignal`, which `waitGroup` and `printGroupWait` check, so a stalled operation prints nothing
  after the final line and acknowledges no delivery (deviation 6). `groupCommand` runs `group wait` under
  `waitCapped(WAIT_CAP_MS, …)`.
- `src/old-names.ts`: the comment of `removedCommand` no longer says that R-013 gives a removed name exit code 2; it says
  what the code does and, since the fix round, why (deviation 5, open point 1).

## Fix round (review round 1, `ticket.md` → `## Decisions`, items 1–10)

Each item with its test, where a test can show it; the failing runs are in `## Fails before`.

1. Finding 1: the golden test of `spawn` (`test/s1-spawn.test.ts`) keeps `readOutcome(run).ids.job` against the job
   folder and now compares the raw last line of stdout, `run.stdout.slice(run.stdout.trimEnd().lastIndexOf("\n") + 1)`,
   with the golden string plus its newline, so a change of key order fails it. No source change; the item 8 sentence
   above says what the test checks.
2. Finding 5: `templates/agents.md:166` says "`spawn` prints the durable job ID as soon as the job exists, and its final
   JSON line carries it in `ids.job`." `templates/.history/agents.md` gets the new first line
   `3f40bf1f566c5b9435967e0fc4b89b76699421cb38dd8467976aaeb10141f2c7 2026-11-19`, the hash that the failing template
   history test printed for the new template (the date is the commit date it gets tonight; the earlier lines stay).
   `docs/groups.md:69` says that a wait that times out exits 3 with `GROUP_WAIT_TIMEOUT` and `limen group status` in
   `next` (with the group ID for the lead), that both the `--timeout` and the 20-second cap end a call that way, and
   that there is no process watchdog: after the cap the call prints no events after its final line, and the process
   ends when the operation returns.
3. Finding 4: `docs/commands.md:30` says that a program reads the final line through one client function, with one
   exception: when `limen github deliver` fails, the GitHub poller tells an unavailable coordinator from an unconfirmed
   delivery by the text on its stderr (`src/integrations/github-poller.ts:621-625`). No code change.
4. Finding 7: `rateLimit403(response)` (`src/integrations/github-poller.ts:98`) is true for a 403 with
   `x-ratelimit-remaining: 0` or a `retry-after` header; `api()` then throws `networkFailure` (`transient`,
   `GITHUB_NETWORK`) with the text `… returned HTTP 403 (rate limit)`, and any other 403 stays `configFailure`. The
   plant's fetch sink (`test/plant.ts`) gives a `respond` row's `headers` beside the content type. Tests in
   `test/cli/github.test.ts`: "GITHUB_NETWORK: … HTTP 403 with x-ratelimit-remaining 0", "GITHUB_NETWORK: … HTTP 403
   with a retry-after header" (both fail before), and "GITHUB_CONFIG: … HTTP 403 that is not a rate limit" (a guard
   that passes before and after; it also asserts the project's `HTTP 403` line, so it cannot pass on another cause of
   exit code 4). The table rows 3 and 4 of `docs/commands.md` say the same.
5. Finding 9: the two T-01 scans are named "T-01: the catch-all sites in src/ and hook/ stay at most their baseline
   count, and src/outcome.ts has none" and "T-01: the untyped throw new Error( sites in src/ and hook/ stay at most
   their baseline count, less the typed ones"; their comments still name the baseline, R-013's parent commit.
6. Finding r1-a: the job id format of `ids` (`src/outcome.ts:36`, the one pattern that `finalLine` and `readOutcome`
   share through `checkedOutcome`) is `^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]{0,31}-(?:[0-9a-f]{4}|[0-9a-f]{8})$`. The
   forms, read from `git log -L :makeJobId:src/job/job.ts` and, before the function moved there on 2026-10-06, `git
   log -L :makeJobId:src/commands/spawn.ts` back to the root commit: until 2026-08-14 a 2-byte suffix (4 hex); until
   2026-10-06 a slug cut at 32 characters after the dashes were trimmed, so it can end in a dash (`…-ends--0a1b2c3d`);
   from 2026-09-04 to 2026-10-06 a feature number moved to the front leaves a run of dashes (`f031-wake-retry---in-…`);
   since 2026-10-06 the form of round 1. No other function made job ids (`git grep 'randomBytes([0-9]'` at the commits
   that changed it). One test per older form in `test/outcome.test.ts` ("finalLine writes and readOutcome reads a job
   id with …", 3 tests, each with the label the id came from); the current form is the `JOB` of the other tests.
7. Finding r1-b: `src/commands/group.ts:401-402` names the condition, `const named = !process.env.LIMEN_GROUP_ID &&
   !args[1]?.startsWith("--");`, then `const id = named ? args[1] : undefined;` (deviation 13: the ticket says
   parentheses, which Biome's formatter removes). Same result for each case: the variable set, no `args[1]`, a flag in
   `args[1]`, a group id in `args[1]`.
8. Finding r1-c: the comment above the T-26 (4) scan (`test/structure.test.ts:95-96`) says "one module writes the final
   line, so its shape cannot drift between commands; the scan finds a writer elsewhere by the start of the object it
   serialises". `src/old-names.ts:146-148` gives the reason: T-18's exit code 2 with `instead` in `next` needs a refusal
   that its command's registry entry declares (T-28 (1)), which the command registry brings (R-014).
9. Finding r1-d: `pollGithub` reads the projects file with a `.catch` that throws `configFailure` ("the projects file
   LIMEN_GITHUB_PROJECTS_FILE is not readable: …", `src/integrations/github-poller.ts:789-791`), as for the state
   directory. Test: "GITHUB_CONFIG: github poll exits 4 and names the setting when its projects file is missing" (fails
   before with exit 1, `UNTYPED`).
10. Finding 6: deviation 12 below.

## Proof

From the repository root, Node 26.13.1, git 2.34.1:

- `node adrian-rebuild/tools/gate.mjs` (AC-2): first run exit 1 at Biome, before any test ran:
  `src/commands/ticket.ts:22:8 lint/complexity/noExcessiveLinesPerFunction … too many lines (72). Maximum allowed is
  70.` I restored the two `return ticketCheck(…)`/`return ticketDone(…)` lines and typed both helpers
  `Promise<undefined>`; `npx tsc --noEmit` exit 0 and `npx biome check --error-on-warnings .` exit 0 ("Checked 157
  files"). Second run: exit 0; tests 191, pass 191, fail 0, cancelled 0, skipped 0 (62.2 s), with the shim line for git
  2.34.1. Before: 149 (R-012's gate, `plan.md` → `## State`); this ticket adds 42 (31 + 4 + 1 + 1 + 1 + 2 + 2).
  After that run I changed only text in `docs/commands.md` (the `usage`, `transient` and `environment` rows and the
  sentence under the table) and this file; no test or source reads either.
- AC-1: `node --test test/outcome.test.ts`: exit 0; tests 31, pass 31, fail 0.
- AC-5: `node --test test/structure.test.ts test/outcome.test.ts`: exit 0; tests 39, pass 39 (structure 8 of 8).
- AC-4: `git grep -n --untracked -E 'stdout\.trim\(\)\.split\(' -- src test` prints nothing: no match. I ran it
  without `-q`, because in this harness a grep exit 1 shows like a silent exit 0 (as R-009 and R-012 recorded).
- `npx tsc --noEmit`: exit 0, no output.
- `npx biome format --write src test bin docs`: "Formatted 116 files … Fixed 6 files." (line breaks only).
- AC-3 is the main session's `fails-before.mjs`; mine is in `## Fails before`.
- AC-6: `node adrian-rebuild/tools/check.mjs` and `npx biome check --error-on-warnings adrian-rebuild`: see the reply;
  both are run after this file.

Main session's runs (they count, `## Agents` step 4):
- `node adrian-rebuild/tools/review-guard.mjs compare --git node_modules/.rebuild-review/R-013.git
  adrian-rebuild/R-013-error-type-final-line/ticket.md`: "the implementer's run is within its limits", exit 0.
- `node adrian-rebuild/tools/gate.mjs`: exit 0; tests 191, pass 191, fail 0, cancelled 0, skipped 0 (62.8 s).
- After the fix round (round 2): `review-guard.mjs compare --git` with a new snapshot taken before the fresh
  implementer → "within its limits", exit 0; `node adrian-rebuild/tools/gate.mjs` → exit 0, tests 198, pass 198, fail
  0 (66.2 s); `node adrian-rebuild/tools/fails-before.mjs` → exit 0, the same 17 files failing at `HEAD`.

Fix round (same environment):
- `node adrian-rebuild/tools/gate.mjs` after the change (AC-2): "Checked 157 files in 275ms. No fixes applied.";
  tests 198, pass 198, fail 0, cancelled 0, skipped 0 (64.0 s). That run went through a `grep` filter, which hides the
  exit code, so after this file and the AC-6 checks I ran it once more unfiltered: exit 0, "Checked 157 files in
  255ms. No fixes applied.", tests 198, pass 198, fail 0, cancelled 0, skipped 0 (65.1 s). Before the fix round: 191;
  it adds 7 (3 job id forms, 2 rate-limit 403s, 1 other 403, 1 missing projects file).
- AC-1 and AC-5: `node --test test/outcome.test.ts test/structure.test.ts`: exit 0; tests 42, pass 42, fail 0 (34 +
  8).
- AC-4: `git grep -n --untracked -E 'stdout\.trim\(\)\.split\(' -- src test` prints nothing (no match).
- `npx tsc --noEmit`: exit 0, no output. `npx biome check --error-on-warnings src/commands/group.ts
  src/integrations/github-poller.ts src/outcome.ts`: first exit 1 on the parentheses of item 7 ("Formatter would have
  printed the following content: … const·id·=·(process.env.LIMEN_GROUP_ID·||·args[1]?.startsWith("--"))·?·…", with the
  two parentheses marked for removal), then exit 0 after deviation 13.
- AC-6: `node adrian-rebuild/tools/check.mjs`: exit 0, "… PL summaries: 105 files; ticket folders: 14; changes: 13
  entries; 0 errors"; `npx biome check --error-on-warnings adrian-rebuild`: exit 0, "Checked 28 files … No fixes
  applied." Both ran on this file before its last edits, which change only proof lines, and again after them.

## Fails before

Main session's run of `node adrian-rebuild/tools/fails-before.mjs`: exit 0, with the line "fails-before:
test/cli/continue.test.ts, test/cli/init.test.ts, test/cli/old-names.test.ts, test/group-extensions.test.ts,
test/s1-spawn.test.ts, test/s10-doorbell.test.ts, test/s2-herdr.test.ts, test/s3-finish-wake.test.ts,
test/s4-steering.test.ts, test/s6-keeper.test.ts, test/s8-groups.test.ts, test/structure.test.ts,
test/cli/github.test.ts, test/cli/group.test.ts, test/cli/picture.test.ts, test/cli/ticket.test.ts,
test/outcome.test.ts fail at HEAD (exit 1)"; at `HEAD` the T-02 scan names `src/commands/group.ts`,
`src/commands/picture.ts`, `src/commands/ticket.ts` and `src/integrations/github-poller.ts`, and the untyped-throw
ratchet counts 275 sites against at most 261.

I wrote the tests of item 8 and every caller change of item 5 before any source change, then ran them on the unchanged
source (output shortened, no stack frames):

- `node --test test/outcome.test.ts`: exit 1; tests 1, pass 0, fail 1.
  ```
  Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/home/…/limen/src/outcome.ts' imported from /home/…/limen/test/outcome.test.ts
  ✖ test/outcome.test.ts (75.815392ms)
  ```
  Every other new or changed test file but `test/structure.test.ts` imports `src/outcome.ts` directly or through
  `test/plant.ts`, so at `HEAD` each fails at the same import; the structure test fails on its own scans (next item).
- `node --test test/structure.test.ts` with the final constants: exit 1; tests 8, pass 6, fail 2.
  ```
  ✖ T-02: process.exitCode and process.exit appear in src/, hook/ and bin/ only in src/main.ts and bin/limen, with literal codes 0-5
    + elsewhere: [ 'src/commands/group.ts', 'src/commands/picture.ts', 'src/commands/ticket.ts', 'src/integrations/github-poller.ts' ]
    - elsewhere: []
  ✖ T-01: the untyped throw new Error( sites in src/ and hook/ stay at most their count at R-013's parent, less the typed ones
    AssertionError [ERR_ASSERTION]: 275 sites of throw new Error(, at most 261
  ```
  The T-26 (4) scan and the catch ratchet pass at `HEAD` by design: they are guards, and at `HEAD` no file builds the
  line and the counts equal the baseline. A run with the constants set below the counts gave "81 sites of catch {" and
  "27 sites of .catch(() => {})".

Fix round: I wrote the tests of items 4, 6 and 9 and the sink's `headers` before any source change. The GitHub tests
need the gate's environment (outside it the poller rightly refuses the plant under `/tmp`, so every GitHub test exits 4
there, finding 2), so the failing run is the gate itself, on the round-1 source with the new tests:

- `node adrian-rebuild/tools/gate.mjs`: exit 1; tests 198, pass 192, fail 6, cancelled 0, skipped 0 (64.6 s). Every
  failure is a new test, on its mechanism (output shortened):
  ```
  ✖ GITHUB_NETWORK: github poll exits 3 when GitHub answers HTTP 403 with x-ratelimit-remaining 0
    AssertionError [ERR_ASSERTION]: /home/…/.cache/limen-rebuild-gate/limen-plant-WKWTrE/repo: GitHub GET /repos/acme/widget/installation returned HTTP 403
    4 !== 3
  ✖ GITHUB_NETWORK: github poll exits 3 when GitHub answers HTTP 403 with a retry-after header
    … returned HTTP 403
    4 !== 3
  ✖ GITHUB_CONFIG: github poll exits 4 and names the setting when its projects file is missing
    AssertionError [ERR_ASSERTION]: ENOENT: no such file or directory, open '/home/…/limen-plant-OjSfXu/no-projects'
    1 !== 4
  ✖ finalLine writes and readOutcome reads a job id with a 4-hex suffix, as before 2026-08-14 (label: say hi)
    Error [LimenError]: the final line has ids.job "2026-08-13-say-hi-1a2b", not in the format /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*-[0-9a-f]{8}$/
  ✖ finalLine writes and readOutcome reads a job id with a slug cut at 32 characters that ends in a dash, …
    Error [LimenError]: the final line has ids.job "2026-08-20-fix-the-wake-when-the-jobs-ends--0a1b2c3d", not in the format …
  ✖ finalLine writes and readOutcome reads a job id with a run of dashes where the feature number left the label, …
    Error [LimenError]: the final line has ids.job "2026-09-10-f031-wake-retry---in-hosted-jobs-0a1b2c3d", not in the format …
  ```
  The other 192 passed, the new golden comparison of item 1 and the 403 guard of item 4 among them.
- `node --test test/outcome.test.ts` on the same source: exit 1; tests 34, pass 31, fail 3 (the three job id forms).
- Item 2: after the template sentence changed, `node --test test/structure.test.ts`: exit 1; tests 8, pass 7, fail 1:
  "shipped template history starts at the current template", `+ 'e1e412cd…6b359'` (the first line of the history) `-
  '3f40bf1f…1f2c7'` (the new template); after the new first line: pass 8 of 8.
- Items 1, 3, 5, 7, 8 and 10 change a test's comparison, a test name, a comment or text, or keep behaviour (item 7), so
  no test fails before them; item 7's equivalence is in `## Fix round`.

## Deviations from the ticket

1. `outputText` in `src/outcome.ts` is not named in the ticket. The tests that compare the text for people need the
   stream without the final line; with the helper there, no test splits off the last line itself, and the module stays
   the only one that knows where the line stands. It calls `readOutcome`, so each such assertion also checks a valid
   final line.
2. `readOutcome` also refuses a line that is not an object, an unknown top-level key, and `ids` that are not an object;
   the ticket lists the other checks. `finalLine` checks with the same validator.
3. The `LimenError` constructor allows an empty `next` for `refused` only with the code `UNTYPED`. `failureOf` gives
   the author's plain errors that code with `next` `""` (item 1), and `github poll` throws the most severe project
   failure with its `failureOf` mapping, which can be `UNTYPED`.
4. Commands that never return a result are typed `Promise<undefined>`, not `Promise<Success | undefined>`: TypeScript
   requires a `return` statement in a function typed with the union (TS2355), and `Promise<undefined>` is assignable to
   `main`'s `Command` type. `ticketCheck` and `ticketDone` are `Promise<undefined>` too, which keeps `ticketCommand` at
   70 lines.
5. Removed command names (`OLD_NAMES`) stay a plain `Error` in `main`, so they end as `refused`, `UNTYPED`, exit 1, as
   the ticket's `## Migration` lists no change for them and `## Out of scope` keeps the cut commands. See open point 1.
6. `waitCapped` passes an `AbortSignal`, and its cap timer is not `unref()`'d. Without the signal, an operation that
   outlives the cap would print its batch after `main`'s final line and acknowledge a delivery; an unref'd timer
   would let a process whose operation waits on nothing exit with Node's code 13 and no final line.
7. `github poll` also turns a failed `stat` of `LIMEN_GITHUB_STATE_DIR` and of `LIMEN_GITHUB_KEY_FILE` (a missing path)
   into `GITHUB_CONFIG`: the state directory's check is within `:716-741`, and the key is `appJwt`'s. Before, a missing
   state directory exited 1 as an untyped error.
8. HTTP statuses other than 429, 5xx, 401 and 403 keep the plain `Error` of `api()` (`UNTYPED`), so that site stays one
   `throw new Error(` and the ratchet's 14 counts only typed sites.
9. `main` finds a command with `Object.hasOwn(COMMANDS, name)` instead of `name in COMMANDS`, so `limen toString` is an
   unknown command (exit 2) instead of calling `Object.prototype.toString`.
10. `docs/commands.md`: the `limen init` sentence ("ends with a `next:` line") also changes, because the final line now
    follows it; the table rows 3 and 4 name the commands that give those classes today, and one sentence says that a
    failure with no class of its own, a missing git among them, exits 1 with `UNTYPED`.
11. Changed tests beyond the callers of `## Problem`: the text assertions of `test/cli/continue.test.ts`,
    `test/cli/init.test.ts`, `test/cli/old-names.test.ts` (14), `test/s2-herdr.test.ts` (the `rule` helper),
    `test/s3-finish-wake.test.ts` (2) and `test/s6-keeper.test.ts` (3) compare `outputText(run)`, because the final line
    now ends the stream they compared whole; `test/s6-keeper.test.ts` also checks `ids.ticket` of `ticket new`.
12. (Fix round, finding 6.) A member's `GROUP_WAIT_TIMEOUT` has `next` `limen group status`, without a group ID, not
    item 11's `limen group status <group>`: a member runs `group status` without an ID (its membership names the group,
    `docs/groups.md`), and `printGroupStatus` refuses one from a member. The lead's `next` names the group.
13. (Fix round, item 7.) The `||`/`?:` order at `src/commands/group.ts:401` is made explicit with a named condition, not
    with parentheses: Biome's formatter removes the parentheses (`npx biome check` exit 1, `## Proof`), so they cannot
    pass the gate, and a `biome-ignore` would add a suppression against T-27's ratchet.
14. (Fix round, item 4.) The text line of a 403 rate limit ends with ` (rate limit)`, so a person reading `… returned
    HTTP 403` next to exit code 3 sees why it is transient; the text of every other status is unchanged. The test of an
    other 403 is a guard that passes before and after, beside the two tests that fail before.

## Measurement

- `unmeasured`, M-05: the coordinator reads one more JSON line at the end of every tool result. The same-task runs at
  4.8 and 9.1 measure the coordinator's behaviour.
- M-10 (gate run time): 62.2 s for 191 tests in the run after the change; 64.0 s for 198 tests after the fix round.

## Open points

1. T-18 → Migration and `plan.md` → `## Stages` (conventions) say that an old name exits with code 2 and names its
   replacement in `next`; the comment in `src/old-names.ts` said R-013 would do it. The ticket does not, so removed
   commands, subcommands, flags, engines and roles still exit 1 (`UNTYPED`, `next` `""`). The review kept them out of
   this ticket (finding r1-e): R-014 types the refusals with the registry.
2. Closed in the fix round (item 2): `templates/agents.md:166` and its history line. The history line was written by
   hand from the hash the failing test printed, not with `LIMEN_WRITE_HISTORY=1` (an assignment before a command is
   off the allow-list, D-016); its date assumes the commit is made on 2026-11-19, as git's history would give it.
3. Closed in the fix round (item 2): `docs/groups.md:69`.
4. When `group wait` runs without `--timeout`, its own 20-second limit and the 20-second cap end at almost the same
   moment, and the cap usually wins, so the message speaks of an uncertain receipt; the code and the exit code are the
   same. This race existed before.
5. `src/integrations/github-poller.ts:621-625` still reads the text of `limen github deliver`'s stderr with a regex for
   the receipt (`handoff`); `docs/commands.md` now names this exception (fix round, item 3), and R-014 converts the
   caller when `deliver` has typed failures (T-26 (4)).
6. (Fix round.) The discussion fetch of a claim (`src/integrations/github-poller.ts:532`) reads any error whose text
   holds `HTTP 403` or `HTTP 404` on the pull comments and reviews as "unavailable via App" and goes on; a 403 rate
   limit still matches there (its text holds `HTTP 403`), as before the fix round. Only the poll's final class changed.
