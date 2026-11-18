<!-- PL: Wynik ticketu R-002 (szkic implementera): wycięte webhooki po zakończeniu zadania (kolejka, plik tokenów,
polecenie `limen webhook`, skrypt bin/tony-finish-ping.sh), zdarzenia koordynatora i webhook kroków lidera grupy;
rejestracja koordynatora zostaje w src/integrations/coordinator-registration.ts dla `limen rule`. Powstała tabela
starych nazw poleceń (src/old-names.ts), a rejestr pozostałości dostał cztery ścieżki. Plik podaje dowody (bramka 92/92,
wcześniej 96/96), testy padające przed zmianą, usunięte testy, odstępstwa i poprawkę po rundzie 1 recenzji (powód
sprzątania martwych rejestracji). Stan: zamknięty commitem R-002; recenzja PASS w rundach 1 i 2, bramka sesji głównej
92/92 także po poprawce rundy 1. -->

# Outcome: R-002 Cut finish webhooks, coordinator signals and the finish ping

## Done

- Deleted with `git rm` (item 1): `src/integrations/finish-webhook.ts`, `src/integrations/webhook-queue.ts`,
  `src/integrations/finish-receipt.ts`, `src/integrations/finish-turn.ts`, `src/commands/webhook.ts`,
  `bin/tony-finish-ping.sh`, `docs/finish-webhooks.md`, `test/s7-webhooks.test.ts`, `test/u2-webhook-trust.test.ts`.
- Moved with `git mv` (item 2): `src/integrations/coordinator-signal.ts` → `src/integrations/coordinator-registration.ts`,
  then cut to the registration. `coordinatorRegistration()` returns `start` and `shutdown`. `start` keeps every guard
  and the clean-up of `HEAD` (job and subagent sessions, the pane or `LIMEN_COORDINATOR`, the session id, a resumed
  session in a new process, one registration per process) and writes `pid`, `pane`, `started-at` and `born`;
  `shutdown` writes `shutdown`. `removeDeadCoordinators(root)` replaces `sweepCoordinators` and removes every
  registration whose process `registeredProcess` judges dead. `liveCoordinators`, `registeredProcess` and
  `readOptional` stay. Gone: the four event kinds, `turnSignal`, `HANDOFF`, the `coordinator-events/` claims, the
  `session-file`, `title` and `tool` files, `sessionExit`, `ownedRunning`, `fields`, the `ask` timer, and the factory's
  debt suppression (the function is now short).
- `hook/wake.ts`: imports `coordinatorRegistration`; keeps `coordinator.start` in `session_start` and
  `coordinator.shutdown` in `session_shutdown`. Gone: the `agent_end` handler, the four `pi.on` lines of tool and goal
  events, `coordinator.messageEnd` in `message_end`, `coordinator.settled` in `agent_settled`, the resend of queued
  pings in `stampSweep`, and the five event names from the local `PiApi` type.
- `src/commands/sweep.ts`: calls `removeDeadCoordinators` every pass (same error line as before), as housekeeping
  that keeps `.limen/coordinators/` from growing (`liveCoordinators` already skips a registration whose process is
  dead); the resend of queued pings is gone.
- `src/commands/rule.ts`: imports `liveCoordinators` from the moved module (see Deviations 2).
- `src/main.ts`: the `webhook` command, its two help lines and the resend before every command are gone. An unknown
  name is looked up in the table of old names first; a removed one throws its refusal line (exit 1 through the existing
  `catch`; R-013 gives it code 2 and `next`). The lookup comes before `--help`, `endDueRules` and the command, so a
  refusal writes nothing. New export `COMMAND_NAMES` (the keys of `COMMANDS`) for the table test.
- New `src/old-names.ts`: `OldName` (`name`, `feature`, `ticket`, `instead`), `OLD_NAMES` with R-002's entry, and
  `removedCommand(name)`, which returns `limen webhook was removed with finish webhooks (R-002); the coordinator gets a
  wake when a job ends`.
- `src/job/record.ts`: `finalizeJob` awaits only `promptCoordinator` (same log line on failure); the finish delivery
  and its comment are gone.
- `src/commands/spawn.ts`, `src/commands/continue.ts`, `src/job/publication.ts`: `finishWebhookEnv`,
  `captureFinishAuthor`, `finishConfig`, `finishAuthor` and the job files `finish-webhook-env` and
  `finish-webhook-author` are gone (`cwd` left `publishSpawnedJob`'s destructuring, its only use).
- `src/runtime/supervisor.ts`: `deliverJobStall`, its import, the read of the previous advisory that only fed the
  webhook's same-kind check, and the `noteKind` import (no other use there) are gone.
- `src/commands/jobs.ts`, `src/job/view.ts`: the `finish-webhook` evidence, section and `finish-hook` label are gone.
- `src/commands/status.ts`: the "Finish webhook rejects" line and its read of `.limen/webhook-rejected` are gone.
- `hook/group-peer.ts`: `leadSteps`, `seenSynthesis`, `seenClosed`, the call at session start, the delivery loop at
  the end of `message_end` and the imports that became unused (`createHash`, `readFile`, `stat`, `GroupRun`,
  `groupPath`) are gone.
- `src/commands/ticket-author.ts`: `GITHUB_LOGIN` and `GITHUB_NOREPLY` are its own module constants, unchanged.
- `src/project/leftovers.ts`: `LEFTOVERS` holds `.limen/finish-webhook.env`, `.limen/outbox` and
  `.limen/webhook-rejected` (feature `finish webhooks (R-002)`) and `.limen/coordinator-events` (feature
  `coordinator signals (R-002)`); a comment on the first names A-027.
- Templates (A-085): the finish-ping paragraph left `templates/agents.md` (the bullet at `:228`) and
  `templates/worker.md` (the paragraph at `:38`). `templates/.history/agents.md` and `templates/.history/worker.md` got
  the new hashes as their first lines (`b78df33a…`, `c359ab1c…`, dated 2026-11-18), written with Edit (D-016).
- Tests: `test/plant.ts` loses `LIMEN_WEBHOOK_RETRY_MS`. `test/s8-groups.test.ts` loses the
  `.limen/finish-webhook.env` fixture, `requests`, `pings`, the synthesis write and both ping assertions; two titles
  drop their lead-step clause; "a member's finish completes while another process holds the cabinet" waits for the
  job's `pid` file to go (finalize removes it right after the group lifecycle step) instead of the webhook receipt.
  `test/u3-turn-signal.test.ts` keeps only its second test, with a header for it.
- Docs (item 3): `README.md` (the guide row and the "finish webhook's handoff" in the open-checks paragraph),
  `CONTRIBUTING.md:23`, `docs/commands.md` (the rejects paragraph, the sweep sentence, which now says each pass removes
  the registration of a coordinator whose process died so that `.limen/coordinators/` does not grow, and the "Finish
  webhook test" section),
  `docs/herdr-status.md` (the rejects lines and the finish-delivery paragraph, table and follow-up),
  `docs/jobs.md:37`, `:46`, `:48`, `:202`, `docs/groups.md:69`, `:111`, and `bin/limen-group-fixture.mjs:45`.

## Proof

The main session's runs (protocol step 4), after the implementer's process ended: `node adrian-rebuild/tools/gate.mjs`
→ exit 0, tests 92, pass 92, fail 0 (73.1 s); `node adrian-rebuild/tools/fails-before.mjs` → exit 0 ("test/cli/status.test.ts,
test/s8-groups.test.ts, test/u3-turn-signal.test.ts, test/cli/continue.test.ts, test/cli/old-names.test.ts,
test/integrations/coordinator-registration.test.ts fail at HEAD (exit 1)", the six files run together); after Adrian
closed the editor of `plan.md`, `node adrian-rebuild/tools/check.mjs` → exit 0, 0 errors. `.gitignore` ignores
`.*.swp` from this ticket on (D-032). After the fix of review round 1 (comments and docs only): `gate.mjs` → exit 0,
tests 92, pass 92, fail 0 (73.2 s); `check.mjs` → exit 0; Biome on `adrian-rebuild` → exit 0.

Implementer's runs, from the repository root:

- `node adrian-rebuild/tools/gate.mjs` → exit 0; tests 92, pass 92, fail 0, cancelled 0, skipped 0 (71.8 s). Before
  the change, on the same tree without the edits: exit 0; tests 96, pass 96 (79.6 s).
- `npx tsc --noEmit` → exit 0. `npx biome check --error-on-warnings .` → exit 0 (167 files).
- `npx biome check --error-on-warnings adrian-rebuild` → exit 0 (28 files).
- `node adrian-rebuild/tools/check.mjs` → exit 1 with one error, `adrian-rebuild/.plan.md.swp: does not open with the
  Polish summary "# PL: …"`: an editor swap file of `plan.md` that appeared during this run (15:35), not part of this
  change and not removed by it (see Open points 1).
- AC-1: `git ls-files -- <the ten paths>` piped to `grep -q .` → exit 1.
- AC-2: the `git grep -q -E '…'` of the ticket over `src hook bin templates test docs README.md CONTRIBUTING.md
  package.json` → exit 1.
- AC-3: `test/cli/old-names.test.ts` → 2 of 2 pass. AC-4: `test/project/leftovers.test.ts` → 10 of 10 pass. Both in
  the gate run and in a single run of the new and changed files (20 of 20 pass, together with `test/cli/status.test.ts`,
  `test/cli/continue.test.ts`, `test/integrations/coordinator-registration.test.ts`, `test/u3-turn-signal.test.ts` and
  `test/structure.test.ts`).
- AC-5: `node adrian-rebuild/tools/fails-before.mjs` → exit 0 ("… fail at HEAD (exit 1)"), over every new and changed
  test file. Per file, see the next section. Four files show no change at `HEAD` on their own, beyond the one moved
  test that AC-5 excepts (review round 1, note 3): `test/cli/continue.test.ts` (the moved test of item 4),
  `test/integrations/coordinator-registration.test.ts` (moved coverage; it fails at `HEAD` only on the missing module),
  and `test/s8-groups.test.ts` and `test/u3-turn-signal.test.ts` (their changes only remove assertions on the cut
  features). The new mechanisms are shown by `test/cli/old-names.test.ts` and the new test of `test/cli/status.test.ts`.
- By hand, outside any project: `limen webhook --help` and `limen webhook deliver /tmp/x` print the refusal line and
  exit 1, and `/tmp/x` does not exist afterwards; `limen --help` names no webhook; `limen nosuch` still prints
  `unknown command "nosuch"`.

Single test files run in the gate's environment (private `TMPDIR`, git shim), because the laptop's git 2.34 lacks
`git worktree list -z`.

## Fails before

`node adrian-rebuild/tools/fails-before.mjs test/plant.ts <file>`, one file at a time:

- `test/cli/old-names.test.ts` → exit 0 (fails at HEAD). The CLI test fails at its own assertion:
  ```
  AssertionError [ERR_ASSERTION]: webhook test
  + 'no finish webhook config for …/limen-plant-…/repo: create .limen/finish-webhook.env or set LIMEN_FINISH_WEBHOOK_ENV\n'
  - 'limen webhook was removed with finish webhooks (R-002); the coordinator gets a wake when a job ends\n'
  ```
  The table test fails with `ERR_MODULE_NOT_FOUND … src/old-names.ts`; it imports the table inside the test, so the
  CLI test above is not masked by the missing module.
- `test/cli/status.test.ts` → exit 0. The new test fails: `limen status` at HEAD prints no `Leftover files` section
  for `.limen/finish-webhook.env` (`assert.ok(lines.includes(HEADER))` on the full status output); the two old tests
  pass.
- `test/cli/continue.test.ts` → exit 1 ("pass at HEAD"): the moved test of item 4, as the ticket expects.
- `test/integrations/coordinator-registration.test.ts` → exit 0, only because the module path does not exist at HEAD
  (`ERR_MODULE_NOT_FOUND … coordinator-registration.ts`). It is moved coverage (Deviations 1): a copy with the import
  pointed at `coordinator-signal.ts` and the names `coordinatorSignals` and `sweepCoordinators` passes at HEAD (1 of 1).
- `test/s8-groups.test.ts` and `test/u3-turn-signal.test.ts` → exit 1 ("pass at HEAD"): their changes only remove
  assertions on the cut features (item 3), so they show no new mechanism (see Open points 3).

## Tests removed with the cut

Before 96 tests, after 92: 9 removed, 5 added.

Removed:
1. `test/s7-webhooks.test.ts`: "a done job pings only its author's target, with open checks and its whole final
   message in the handoff and wait" (its `limen wait` check at `:71` goes, item 4).
2. `test/s7-webhooks.test.ts`: "a continuation from a subdirectory keeps the parent's config and author route" (the
   subdirectory part moved to `test/cli/continue.test.ts`).
3. `test/s7-webhooks.test.ts`: "a failed job's ping reaches each target until it answers for good, and never twice
   after it accepted".
4. `test/s7-webhooks.test.ts`: "a ping whose deliverer was killed mid-send goes out with the next limen command".
5. `test/s7-webhooks.test.ts`: "no secret or target URL leaves the request header, and nothing names the quiet job".
6. `test/s7-webhooks.test.ts`: "each coordinator turn end pings once with its last message and ticket, also after a
   normal exit" (the sweep's removal of the dead registration moved to
   `test/integrations/coordinator-registration.test.ts`).
7. `test/u2-webhook-trust.test.ts`: "the sender sends nothing for a bad credential, destination, target list or author
   map, and prints no secret".
8. `test/u2-webhook-trust.test.ts`: "the private receipt channel drops malformed and secret-bearing sender lines".
9. `test/u3-turn-signal.test.ts`: "an ended turn signals what its todos, goal, stop and owned jobs call for, naming the
   blocker or next todo".

Added: the two tests of `test/cli/old-names.test.ts`, one in `test/cli/status.test.ts`, the moved test in
`test/cli/continue.test.ts`, and the moved test in `test/integrations/coordinator-registration.test.ts`.

Changed, not removed: in `test/s8-groups.test.ts`, "each recipient reads a finding once, the lead hears it as a
followUp, and a synthesis write sends a lead-step ping" is now "each recipient reads a finding once, and the lead hears
it as a followUp", and "close refuses a member with uncommitted work until it is clean; each lead step pings once" is
now "close refuses a member with uncommitted work until it is clean".

## Deviations from the ticket

1. One more moved test, `test/integrations/coordinator-registration.test.ts` ("the sweep removes a registration whose
   process died, also after a normal exit, and keeps a live one"). Item 4 moves coverage that leaves with `s7` and
   stays a mechanism of Limen, and its list names only the continuation. The last `s7` test was the only test of the
   sweep removing a dead registration (`start`, `shutdown`, a dead pid, `sweepCoordinators`, the folder gone), which
   AC-8 requires to keep working. The moved test does the same steps on a temporary directory and adds a live
   registration that must stay, so a removal of every registration fails it. The path mirrors `src/` (T-29).
2. `src/commands/rule.ts` is outside item 3's list; its import of `liveCoordinators` has to follow the move of item 2.
3. The old-names test passes `join(p.parent, "receipt")`, a folder that does not exist under the plant's temporary
   parent, instead of `/tmp/x`. At HEAD `limen webhook deliver` writes a lease file into the folder it is given, so a
   fixed shared path could be written by the run that `fails-before.mjs` makes at HEAD. The argument is still an
   absolute receipt folder, as an old hook passes it.
4. The retry of `born` at the end of a turn goes with `settled`. Its reason ("a loaded machine can miss the 1s query")
   no longer holds since R-008: `processInfo` reads `/proc/<pid>/stat` with no time limit. `start` still writes `born`
   once, as at HEAD.
5. `registeredProcess` returns only the state; the pid it also returned was read only for the reason of the cut
   `coordinator.exited` event.
6. In `test/s8-groups.test.ts` the last test keeps `release(lead)` and the wait for the lead session's exit, with no
   assertion after them, so the story still ends the lead session it opened in `before`.

## Review round 1 fix

Note 1 of `review.md` → Round 1 (`ticket.md` → `## Decisions`, the entry "review round 1"): three places gave a reason
that does not hold, namely that removing a dead registration makes `limen rule` stop counting its pane.
`liveCoordinators` already skips every registration that `registeredProcess` judges dead, so the removal is
housekeeping. Comments and docs only, no code:

- `docs/commands.md:190`: "Each pass also removes the registration under `.limen/coordinators/` of a coordinator
  whose process died, so that folder does not grow." The link to "Seat-wide rules" went with the old reason.
- `src/commands/sweep.ts:44`: "Housekeeping every pass, not after the seat ring threshold: dead registrations go, so
  `.limen/coordinators/` does not grow."
- `src/integrations/coordinator-registration.ts:88`, the doc comment of `removeDeadCoordinators`: "… so
  `.limen/coordinators/` does not grow."

Runs after the fix, from the repository root (the full gate is the main session's):
- `npx biome check --error-on-warnings docs/commands.md src/commands/sweep.ts
  src/integrations/coordinator-registration.ts` → exit 0 (2 files; Biome does not check Markdown).
- `npx tsc --noEmit` → exit 0.
- `node adrian-rebuild/tools/check.mjs` → exit 0, 0 errors.
- `npx biome check --error-on-warnings adrian-rebuild` → exit 0.

## Measurement

- unmeasured: on the seat, a coordinator pane or hosted supervisor on old code that still runs `limen webhook deliver`
  gets the refusal line once and retries in its own process until it reloads (`plan.md` → `## Deployment` 0.3). AC-3
  shows the refusal on a plant. No M-NN covers it.
- unmeasured: the listing and drop of the four leftover paths in the two projects (`## Deployment` 1.1). The status
  test and AC-4 show them on a plant. No M-NN covers it.
- unmeasured, M-01: the fixed context of the worker preamble and the coordinator manual shrinks by the finish-ping
  paragraph: `templates/worker.md` 7,908 → 7,093 bytes, `templates/agents.md` 47,359 → 46,362 bytes. M-01 is measured
  by the main session when it closes the stage.
- M-10 (gate run time): 71.8 s in this run; recorded at the close of the stage.

## Open points

1. Closed: `node adrian-rebuild/tools/check.mjs` failed only on `adrian-rebuild/.plan.md.swp`, an editor swap file of
   the reserved `plan.md` that appeared during the first run. Adrian closed the editor, and `.gitignore` ignores
   `.*.swp` from this ticket on (D-032); `check.mjs` exits 0 after the round 1 fix.
2. For Adrian, outside the projects (named only in the removed `docs/finish-webhooks.md` at `HEAD`): a sender wrapper
   and a dotenv under `~/.overment/` (`tony-finish-ping.sh`, `tony-finish-webhook.env`, `:205-234`), a systemd
   `Environment=LIMEN_FINISH_WEBHOOK_ENV=` line (`:97`), and a `/.limen/finish-webhook.env` line in a repository's
   `info/exclude` (`:49`). Nothing in Limen reads them now.
3. AC-5 says the new and changed test files fail at HEAD except the moved test of item 4. The command of AC-5 exits 0,
   but `test/s8-groups.test.ts` and `test/u3-turn-signal.test.ts` alone pass at HEAD: they are changed only by item 3's
   removals. The moved registration test fails at HEAD only on its module path (Deviations 1).
4. Leftovers that no registry entry can name: the job files of the cut code (`finish-webhook*`, `events/`; R-021,
   out of scope) and the lead-step receipts under `.limen/groups/<group>/lead-steps/`, which sit inside each group's
   own folder rather than at a fixed project path. Nothing reads either now.
5. `test/u3-turn-signal.test.ts` keeps its name, though it now tests only the completion wake; T-29 renames a test file
   in the ticket that rewrites its module.
6. T-27: three changed functions keep their "split pending" suppressions: `hook/group-peer.ts:42` (lines per function,
   `groupPeer`), `hook/group-peer.ts:170` (cognitive complexity, the `message_end` handler) and `hook/wake.ts:110`
   (lines per function, `limenWake`). Biome still accepts them; the ticket's Change does not split them, and the plan
   leaves the ratchet to R-082 and R-083 (review round 1, note 2: rejected).
