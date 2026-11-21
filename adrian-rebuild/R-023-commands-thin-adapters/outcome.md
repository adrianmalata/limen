<!-- PL: Wynik R-023 (szkic implementera, 21.11, w dzień): komendy są cienkimi adapterami. Logika komend bez `movedBy`
przeszła do modułów domeny (src/job/, src/project/, src/runtime/, src/integrations/, src/picture/), a dwa pliki
przeniesiono `git mv`; żadna komenda nie importuje innej, a wrapper w src/main.ts trzyma tekst komendy i drukuje go
na końcu, więc zniknęła wczesna linia id po `spawn`. Jeden moduł src/runtime/launcher.ts uruchamia CLI Limena, słowa
komend czyta tylko src/parser.ts, cykl parser ↔ old-names zniknął, a `jobs` z flagą wskazuje `limen status --all`.
Pierwsza bramka miała jeden raz nieudany test s3-finish-wake, zmierzony według D-067 (1) (przyczyna należy do R-096);
poprawki rundy 1 dały pytanie `land` po notatkach, test `dropsDashes`, `gitText` w src/project/git.ts i dwa zdania
dokumentacji, a bramka przeszła 588/588; poprawki rundy 2 dopisały w `## Fails before` test `dropsDashes`, który
przechodzi przy HEAD, z powodem, oraz zdanie docs/commands.md o pytaniu `land` z notatkami. Stan: zamknięty; runda 3
recenzji PASS bez uwag, bramka sesji głównej 588/588. -->

# R-023 outcome

## Done

1. **Logic moves out of `src/commands`** (Change 1). Every command without `movedBy` is now a thin adapter: it reads
   its values from the shared parser, calls one domain operation and returns its result (`Success`, or nothing).
   - Moved with `git mv` (named by the ticket): `src/commands/group-rounds.ts` → `src/job/group-rounds.ts` (it now
     takes `out` and calls `startContinue` of `src/job/continuation.ts`), `src/commands/github-doctor.ts` →
     `src/integrations/github-doctor.ts` (its report lines go to `out`; imports from `./`).
   - New domain modules (each command's logic, moved as it was): `src/job/spawning.ts` (spawn, `resolvePreamble`,
     `recordVersions`, `waitForHandshake`, `normalizeLabel`), `src/job/continuation.ts` (continue),
     `src/job/stopping.ts` (stop; `stopJob` returns its line), `src/job/watching.ts` (the wake routes
     `currentNotificationSession`, `herdrWakePane`, `coordinatorWakeRoute`, `watches`, and watch/unwatch),
     `src/job/steer-delivery.ts` (steer), `src/job/landing.ts` (land and its test-line cap), `src/job/detail.ts`
     (show), `src/job/group-control.ts` (group start, status, publish, stop, close, `selectedGroup`),
     `src/project/ticket-check.ts` (`landTicketCheck`, `TICKET_PATH`, `limen ticket check`),
     `src/project/ticket-folders.ts` (ticket new, ticket done), `src/project/summary.ts` (status),
     `src/project/board-jobs.ts` (board), `src/project/setup.ts` (init, workspace init), `src/runtime/pruning.ts`
     (`pruneForJob`, `pruneFinishedWorktrees`, `deleteLandedBranches`, `pruneLine`), `src/integrations/hunk.ts`
     (`hunkBinary`, diff), `src/integrations/github-claims.ts` (the GitHub commands but doctor and poll),
     `src/picture/picture-check.ts` (picture build). Added to existing modules: `openJob` in
     `src/integrations/herdr.ts`, `serveActivity` in `src/picture/picture-serve.ts`, `migrateProjectAt` in
     `src/job/migration.ts`.
   - Commands with `movedBy` keep their own logic (out of scope); what other modules used moved out: `prune.ts`
     keeps `--retire` and imports `src/runtime/pruning.ts`; `keeper.ts` imports the ticket check and spawn from the
     domain; `group wait` moved whole into its own command file `src/commands/group-wait.ts`, unchanged, so that
     `group.ts` holds only commands without `movedBy`; `rule.ts` starts its timer through the launcher; `sweep.ts`
     prints what `installSeatSweep` and `uninstallSeatSweep` (`src/project/seat.ts`) now return.
   - `bin/limen-group-fixture.mjs` calls `initProject` (`src/project/setup.ts`) with a printing `CommandText`.
2. **No command imports another** (Change 2): AC-5 and AC-6 match nothing. Two scans in `test/structure.test.ts`
   ("T-26: no command file imports another or a value of the registry, and outside src/commands only the wrapper and
   the registry import one", with the fixture test of both directions) read imports through `test/imports.ts`; a
   command file whose every registry entry carries `movedBy` is left out (D-061), and the scan also refuses a file of
   `src/` that imports `bin/` (T-26's Check).
3. **The wrapper prints all of a command's text at its end** (Change 3, D-061 (3)). `CommandText` (`src/outcome.ts`):
   `line` for stdout, `diagnostic` for stderr. `main` holds both in their order and prints them when the command ends,
   before the result's `text` or the failure's message, so a failure keeps the report before it (picture build's
   counts and diagnostics, ticket done's closed tickets, github poll's project lines, land's notes). `Handler` takes
   `out` as its third argument. A view returns its text in `Success.text` (status, show, board, open, diff, seat
   queue, migrate, the GitHub status lines); an operation that reports as it goes writes to `out`. `spawn` no longer
   prints its id before the worktree exists; its text is its notes, the start or queued line, the id, then the
   sentence. The print scan ("T-26: no file of src/ prints but the wrapper, the module of the streaming picture serve
   and the moved commands") names `picture serve` and its module `src/picture/picture-serve.ts`.
4. **One launcher module** (Change 4, D-061 (4)): `src/runtime/launcher.ts` holds `launchWrapper` (moved from
   `src/runtime/wrapper.ts`: the job's internal run, no final line), `startLimen` (detached: `group advance` from
   `src/job/group-cabinet.ts`, the rule timer of `src/commands/rule.ts`), and `runLimen` (waits and reads the final
   line through `readOutcome`; a run with no valid final line is the internal failure the reader names). The GitHub
   poller's `github ensure` and `github deliver` go through `runLimen` with `cli` and `user` (sudo), and decide by
   `outcome.class`; the receipt still keeps Herdr's words from stderr (see Open points). The scan ("T-26: outside
   src/runtime/launcher.ts no file of src/ starts Limen's own CLI") reads every call of a `node:child_process` starter
   through the TypeScript syntax tree, with a fixture test.
5. **Command words only in `src/parser.ts`** (Change 5, D-044). `readCommandLine` (the general help, a removed name's
   refusal, the command the first words name with `asksHelp`, or another first word) replaces `main`'s word checks,
   `lookup` of `src/registry.ts` and `removedWords`; `oldNext` and the removed-flag refusal moved into the parser.
   `src/old-names.ts` keeps the tables and the lines and imports nothing from the parser: its old words and values are
   structural types, and a `next` it builds is a `NextCommand` the parser writes with `limenCommand`. Spawn's filter of
   lone `--` words moved into the parser as the schema field `dropsDashes` of spawn's task. The scan ("T-19: outside
   src/parser.ts no file of src/ reads command words") finds a comparison of a word with `--help`, `-h`, `--` or
   `help`, and a name matched word by word; the parser's reading kind is `general-help`, not `help`, so it does not
   read as a word.
6. **`--help` as a flag's value** (Change 6): the test now runs `continue <running job> x --label --help` in a plant
   and asserts exit 1, `UNTYPED` and "is running; continue needs a finished job", so a parser refusal (exit 2) fails it.
7. **`jobs`** (Change 7, D-045 (2), D-046): any flag among the old words names `limen status --all`; only a job word
   alone names `limen show <ref>`, written by `limenCommand` (`limen jobs -- --all` names `limen show -- --all`,
   `limen jobs 'a b'` names `limen show 'a b'`). The table test in `test/cli/old-names.test.ts` runs 12 forms through
   `commandOf` and `checkNext`.
8. **Docs** (Change 8): `docs/commands.md` (text at the end, the launcher, spawn's ID, `--drop-leftovers` lines),
   `docs/jobs.md` (Job ID), `docs/seat/agent-setup.md` (`src/project/setup.ts:39,91`), `CONTRIBUTING.md` (where code
   lives), `templates/agents.md` line 166 with its history line (`templates/.history/agents.md`).

## Proof

- `npx tsc --noEmit` → exit 0.
- `npx biome check --error-on-warnings .` → exit 0 (237 files).
- `git grep -n -E 'from "\./[a-z-]+\.ts"' -- src/commands` → exit 1 (AC-5); `git grep -n 'commands/' -- src/runtime
  src/job src/project src/integrations hook bin` → exit 1 (AC-6); the same patterns with `grep -rn` over the working
  tree, untracked new files included → exit 1.
- `node --test test/structure.test.ts` → exit 0, 40/40 (AC-1).
- `node --test test/cli/old-names.test.ts` → exit 0, 35/35 (AC-2).
- `node --test test/parser.test.ts` → exit 0, 17/17 (AC-3).
- `node --test test/s1-spawn.test.ts` → exit 0, 5/5 (AC-4).
- `node --test test/registry.test.ts` → exit 0, 13/13; `node --test test/runtime/launcher.test.ts` → exit 0, 3/3.
- First `node adrian-rebuild/tools/gate.mjs` → exit 1, 586 tests, 584 pass, 2 fail:
  - `test/s2-herdr.test.ts` "in Herdr a spawn with no mode flag runs detached …": its pattern required a line
    before `queued flagless: …`, the early id line this ticket removes. Fixed (`^` instead of `\n`, comment D-061 (3));
    `node --test test/s2-herdr.test.ts` → exit 0, 2/2.
  - `test/s3-finish-wake.test.ts:216` "a held gate queues jobs by priority and a rule's start priority holds the
    rest; …": the assertion at line 273 on the "started after" marks of the wakes of `later`, `urgent` and `timed`
    got `[true, false, false, true, false, true]`, expected `[true, false, true, false, true]` (one wake too many).
    Measured, not rerun for a green result (D-067 (1)): the main session ran the file 10 times alone on this tree
    (10 of 10 pass) and 10 times at `HEAD` through `fails-before.mjs` (10 of 10 pass), so the trees do not differ;
    the cause of the extra wake is R-096's.
- Second `node adrian-rebuild/tools/gate.mjs` (D-067 (1)) → exit 0, 586 tests, 586 pass, 0 fail, 0 cancelled,
  113.5 s; it also holds the pattern fix of `test/s2-herdr.test.ts` in a full run.

## Fixes of review round 1

`review.md` → Round 1 (PASS, five notes), `ticket.md` → `## Decisions` → review round 1, Fix 1–Fix 5.

1. **Land's lines before its question** (Fix 1, AC-10 within D-061 (3)). `landJob` (`src/job/landing.ts`) takes an
   `ask` (`Ask`), by default its terminal question when stdin is a terminal, none otherwise, and none with `--yes`.
   When it asks, the lines the owner reads to decide (the uncommitted-files note, the ticket check's warn lines, the
   test-line cap line) go into the question, before `Land … onto …? [y/N] `, and not to `out`, so they come once and
   before the answer, as at `HEAD`; a refusal before the question gives them to `out`, which the wrapper prints before
   the refusal's message. Without a question they go to `out` as before. New test `test/job/landing.test.ts`
   ("in a terminal, land asks after the uncommitted-files note, which it holds for no later print"), with an injected
   `ask` that answers no. Before the fix: `node --test test/job/landing.test.ts` → exit 1, `AssertionError
   [ERR_ASSERTION]: Missing expected rejection.` (no question was asked, so the land went through); after: exit 0, 1/1.
2. **Docs of the commands with `movedBy`** (Fix 2). `docs/commands.md` (the streaming clause) and `CONTRIBUTING.md`
   (thin adapters) say that `prune`, `sweep`, `rule`, `close`, `keeper` and `group wait` still print as they go and keep
   their own logic until the tickets in their `movedBy` move them.
3. **`dropsDashes`** (Fix 3). New CLI test in `test/cli/spawn.test.ts` ("a spawn drops each lone -- from its task
   words, so the job's task holds the other words alone"): `limen spawn … -- say -- kept --` gives the task `say kept`.
   Without the field (removed from spawn's task in `src/registry.ts` for one run, then put back): `node --test
   test/cli/spawn.test.ts` → exit 1, `+ 'say -- kept --'` `- 'say kept'`; with it: exit 0, 2/2. The comment in
   `src/job/spawning.ts` says that the drop happens in the shared parser, on the command line only, so an in-process
   caller of `startSpawn` passes a task without those words.
4. **`gitText` into `src/project/git.ts`** (Fix 4, T-25 (2)), unchanged; `src/project/ticket-check.ts` and
   `src/job/landing.ts` import it from there.
5. **The reason in `## Fails before`** (Fix 5): the four new fixture tests of `test/structure.test.ts`, below.

Proof after the fixes: `npx tsc --noEmit` → exit 0; `npx biome check --error-on-warnings .` → exit 0 (238 files);
`node --test test/job/landing.test.ts` → 1/1, `test/cli/spawn.test.ts` → 2/2, `test/cli/land.test.ts` → 1/1,
`test/s5-land.test.ts` → 6/6, `test/structure.test.ts` → 40/40; `node adrian-rebuild/tools/gate.mjs` → exit 0, 588
tests, 588 pass, 0 fail, 0 cancelled, 112.4 s; `node adrian-rebuild/tools/check.mjs` → exit 0; `npx biome check
--error-on-warnings adrian-rebuild` → exit 0.

## Fixes of review round 2

`review.md` → Round 2 (FAIL, AC-7), `ticket.md` → `## Decisions` → review round 2; no code or test changes.

1. Fix R2-1: `## Fails before` names the new test of Fix 3 as passing at `HEAD`, with its reason and the main
   session's check, and says how to read the tool's line.
2. Fix R2-2: the sentence of `docs/commands.md` on when a command prints says that in a terminal `limen land`'s
   confirm question carries its notes, written before the answer.

Proof: `node adrian-rebuild/tools/check.mjs` → exit 0; `npx biome check --error-on-warnings .` → exit 0. The main
session's gate after this round (AC-8): `node adrian-rebuild/tools/gate.mjs` → exit 0, 588 tests, 588 pass, 0 fail,
0 cancelled (113.8 s); `review-guard.mjs compare --git` → exit 0. The tests are unchanged since the first round of
fixes, so its `fails-before.mjs` run (`## Fails before`) stands.

## Fails before

The main session's run after the first round of fixes (AC-7, 2026-11-21; its gate 588/588):
`node adrian-rebuild/tools/fails-before.mjs` → exit 0, "fails-before: test/cli/group.test.ts,
test/cli/old-names.test.ts, test/cli/spawn.test.ts, test/cli/stop.test.ts, test/parser.test.ts,
test/registry.test.ts, test/s1-spawn.test.ts, test/s2-herdr.test.ts, test/structure.test.ts,
test/job/landing.test.ts, test/runtime/launcher.test.ts fail at HEAD (exit 1)". The tool's line names the files of
one run at `HEAD` that exits 1, not each file failing on its own: a file in it can hold a new test that passes at
`HEAD`, and the bullets below name each such test with its reason.

The main session's earlier run (AC-7, after the second gate, 2026-11-21): `node adrian-rebuild/tools/fails-before.mjs` →
exit 0, "fails-before: test/cli/group.test.ts, test/cli/old-names.test.ts, test/cli/stop.test.ts,
test/parser.test.ts, test/registry.test.ts, test/s1-spawn.test.ts, test/s2-herdr.test.ts, test/structure.test.ts,
test/runtime/launcher.test.ts fail at HEAD (exit 1)". The files of the changed tests named as passing at HEAD below
fail there as files because of the moved modules they import (`test/cli/group.test.ts`, `test/cli/stop.test.ts`), the
new tests beside them (`test/parser.test.ts`, `test/cli/old-names.test.ts`, `test/structure.test.ts`) or `spawn`'s
early line (`test/s2-herdr.test.ts`).

Run before the change, at HEAD `dfcb4ba`'s code with the new tests laid over it (my own runs; AC-7's
`fails-before.mjs` is the main session's):

- `node --test test/structure.test.ts` → exit 1: the four real scans fail and their fixture tests pass. The findings
  were the 14 lines of AC-5, `bin/limen-group-fixture.mjs` and `src/runtime/job-setup.ts` (imports); 83 print sites, 80 in
  `src/commands` and `src/integrations/github-poller.ts:832`, `src/project/seat.ts:48,55` (prints);
  `src/commands/rule.ts:134`, `src/integrations/github-poller.ts:621,639`, `src/job/group-cabinet.ts:262`,
  `src/runtime/wrapper.ts:36` (launches); `src/commands/spawn.ts:598`, `src/main.ts:74` (three),
  `src/old-names.ts:250`, `src/registry.ts:956` (words).
- `node --test test/cli/old-names.test.ts` → exit 1, the jobs table test: `--all a1b2c3d4` and `a1b2c3d4 --running`
  named `limen show a1b2c3d4`, `-- --all` named `limen show --all`, `a b` named `limen show a b`.
- `node --test test/registry.test.ts` → exit 1, the wrapper test: "Cannot read properties of undefined (reading
  'line')", exit 5.
- `node --test test/runtime/launcher.test.ts` → exit 1: `ERR_MODULE_NOT_FOUND` for `src/runtime/launcher.ts`.
- `node --test test/s1-spawn.test.ts` → exit 1, the new test: the id line appeared twice (`[2, 'started say once',
  id]`, expected `[1, …]`).
- Passes at HEAD, with the reason: `test/parser.test.ts`'s changed `--help` test (D-044 makes the assertion exact;
  continue already refused the running job with exit 1); the changed path keys of the job-matcher and job-file scans,
  the T-20 (4) scan that now follows a handler into the domain module it calls, and the import-path changes of
  `test/cli/stop.test.ts`, `test/cli/group.test.ts` and `test/cli/old-names.test.ts` (they follow moved functions).
- Pass at HEAD, with the reason (Fix 5): the four new fixture tests of `test/structure.test.ts` ("the command-import
  scan finds both directions …", "the print scan finds console output …", "the launch scan finds a start of bin/limen
  …", "the word scan finds a flag or help comparison …") run the test file's own scan functions on synthetic text, so
  they do not depend on `src/`; the four scans that read `src/` fail at HEAD, as listed above.
- Passes at HEAD, with the reason (Fix R2-1): the new test of Fix 3 in `test/cli/spawn.test.ts`, "a spawn drops each
  lone -- from its task words, so the job's task holds the other words alone". The drop moved from `spawn`'s own
  filter (`src/commands/spawn.ts:598` at `HEAD`) into the parser's `dropsDashes` with its behaviour kept, so `HEAD`
  drops the words too; my run of this tree without the field (`## Fixes of review round 1`, item 3: `+ 'say -- kept
  --'` `- 'say kept'`) shows that the test checks the moved drop. The main session's check: `node
  adrian-rebuild/tools/fails-before.mjs test/cli/spawn.test.ts` → exit 1, "pass at HEAD", 2/2.

## Deviations

- Tests changed beyond the new ones, each forced by a moved function or by the early line: import paths of
  `stopJob`, `resolvePreamble`, `groupWaitCommand`/`waitCapped` and `oldNext`; `group.test.ts`'s in-process handler
  passes `undefined` as the new third argument before its 50 ms cap; `s2-herdr.test.ts`'s pattern (the early line);
  the path keys of `MATCHER_EXCEPTIONS`, `JOB_NAME_EXCEPTIONS` and the job-matcher fixture; the T-20 (4) scan reads the
  handler's module and the domain modules it imports, since the resolver call moved with the logic.
- `group wait` moved to `src/commands/group-wait.ts` without a change of its logic, so the print scan can leave out
  a file whose only entry has `movedBy`; it prints its batch itself, before it acknowledges the transport.
- `promptCoordinator` printed a found job object with `console.log`; it now gives `inspect(found)`, the same text
  without a terminal's colours.

## Open points

1. **`test/s3-finish-wake.test.ts:216` failed once in the first gate** ("a held gate queues jobs by priority and a
   rule's start priority holds the rest; a queued job tells its session once that it started, then its finish wakes
   it once"), settled by D-067 (1) as above: the trees do not differ, and R-096 takes the extra wake. Output:
   `AssertionError … at test/s3-finish-wake.test.ts:273:9`, actual `[true, false, false, true, false, true]`,
   expected `[true, false, true, false, true]`. Run alone once afterwards, for diagnosis: `node --test
   test/s3-finish-wake.test.ts` → exit 0, 7/7. The code the assertion reads (the wake hook `hook/wake.ts`, `src/job/wake-delivery.ts`,
   `src/job/wake-text.ts`, `src/job/finalize.ts`, `src/runtime/start-queue.ts`) is unchanged; the files the test runs
   that this change touches are `src/main.ts`, `src/parser.ts`, `src/outcome.ts`, `src/old-names.ts`,
   `src/registry.ts`, `src/commands/{spawn,stop,rule,show,seat-queue}.ts`, `src/job/{spawning,stopping,detail,
   watching}.ts`, `src/runtime/launcher.ts` (the rule timer, the wrapper's start), `src/runtime/wrapper.ts`,
   `src/runtime/job-setup.ts`, `src/runtime/pruning.ts`. The same test failed once in R-022's round-2 gate (D-063 (2)).
2. The GitHub poller still classifies a failed `github deliver` by Herdr's words on stderr for the claim's receipt,
   as `docs/commands.md` already says; reading only the final line there needs a typed code for "Herdr refused before
   acceptance" (R-082, R-059).
3. `hook/wake.ts` reads the first word of its own `/limen` slash command (`request.split(/\s+/)[0]`); it is a Pi
   command of the hook, not the CLI, and the word scan covers `src/` only.
4. `bin/limen-group-fixture.mjs` called `initCommand([], root)`, which since R-014 takes parsed values and failed on
   `values.has`; it now calls the domain operation.

## Unmeasured

- `unmeasured` M-01: the fixed context of the changed `templates/agents.md` line (166), measured at the close of the
  stage.
- `unmeasured` M-05: the coordinator on the seat reading the job from `ids.job` without the early id line.
