<!-- PL: Ticket R-102 (A-010, T-42, D-094 (2), D-097 (3), (6)): reguły seata znikają w całości: `limen rule` i jego
podpolecenia, timer reguły, `endDueRules` przed każdym poleceniem, wstrzymanie startu przez regułę, blok reguł w turze
koordynatora i nagłówek tablicy; odmowa to wpis `OLD_NAMES`, który wskazuje automatyczne wznowienie. Rejestracja
koordynatora znika razem z nimi, a odmowa hooka w sesji koordynatora (R-029) trafia do pliku na proces
`.limen/refusals/<pid>-<born>.json`, który sweep usuwa po śmierci procesu. Stan: napisany 24.11 przy drzewie R-034 (przed
jego commitem) z inwentarza agenta tylko do odczytu; decyzje w `## Decisions`; sprawdzony ponownie przy `b489760` w
nocy 24/25.11 (Decyzje 6–8: kryteria bez zmian, przesunięte miejsca). Zamknięty 25.11 w dzień po rundzie 3 recenzji. -->

# R-102 Seat rules are cut

## Problem

Finding A-010 (high, security), its Decision quoted from `audit.md`: "fix — Cut seat rules (`limen rule`, start
priority). Standing condition: automatic resume after the limit renews stays permanently in code (A-016), for both
projects, 5 minutes after the reset." Its evidence: `rule set` has no caller check, the rule goes to `<home>/.limen/rules`
shared by every project, it is typed into every live coordinator pane with "Follow it until it ends." and injected into
each coordinator turn, and a start priority holds other jobs in the start queue. R-034 (done) is the automatic resume.

Plan decisions the change relies on:
- D-094 (2): "the new R-102 cuts the seat rules (A-010, T-42 (1), step 3.5) and depends on R-034, since A-010 cuts them
  only once the resume holds; R-034's note on `limen rule`'s timer path is R-102's".
- D-097 (3): "the seat's old `~/.limen/rules/` on the agents' account lies outside every project, so it is no LEFTOVERS
  entry: step 3.5 has Adrian check it and delete it by hand if he wants (no code reads it)".
- D-097 (6), settled for R-102 (items marked (A) were named for Adrian's attention and stand):
  (a) "the cut: the four `rule` entries, `src/commands/rule.ts`, `src/project/seat-rules.ts`, `endDueRules`, the start
  queue's rule hold, the cue's block, the board's header, the rule lines of `seat queue`, the decision kind `rules`,
  the subcommand branch of `src/help.ts` whose only case is `rule`, the ISO exception and the `ERRNO_TYPED` entry";
  (b) "the coordinator registration (`.limen/coordinators/`, `liveCoordinators`, the sweep's `removeDeadCoordinators`)
  goes, since only `rule` reads it (R-002 kept it "for `limen rule` until R-034"); R-050 builds its own registered
  coordinator; the folder is a LEFTOVERS entry";
  (c) "(A) the refusal is an `OLD_NAMES` entry with `next` `null` (D-046 (1); `limen decide` comes at a0.7.0), its
  sentence naming the automatic resume; its words for gate 5.3";
  (d) "the start priority goes with no replacement (A-010), and D-013's weekly threshold stays manual; step 3.5 checks
  that no `limen rule timer` process runs".
- Notes in `## Tickets` for R-102: (1) R-026 review round 2, note 9: a rule's timer that cannot start writes to stderr
  after the final line (T-02); the cut removes the path. (2) R-029 review round 1, note 2, and its open point 1: R-029
  writes a coordinator session's newest guard refusal as `refusal.json` into its registration folder, which
  `limen status` reads (T-32 (4), R-029 Decision 8); "when R-102 removes that registration (D-097 (6) (b)), it keeps a
  per-session place for the file or moves it, with `limen status`'s warning and its test, and it closes the gap of a
  session that never registered"; from R-029's round 3: "(1) a registration folder with no recorded `born` still takes
  the refusal on the pid alone …, so a folder matches only on the whole identity; (2) `coordinatorRefusals` reads
  `refusal.json` through the guarded read of the record (no symlink followed, a size bound), and a directory or an
  unreadable file is shown as its BAD_DATA line instead of failing the whole `limen status`". (3) R-032 Decision 16:
  the T-04 import scan's exception for `rule` names R-102 and goes with it.
- Rules: T-42 (1) (no agent-made timers), T-18 (old names refuse with their line), T-02 (exit classes), T-01 (no silent
  failure), T-04 (read commands write nothing), T-29 (one mechanism per test), D-046 (1) (`next` `null` while no
  command replaces it), D-079 (optional fields), z. 14, z. 16, z. 30.

Facts at the working tree of R-034 (before its commit; located by a read-only agent, the main session checked the ones
it quotes):
1. Registry: `RULE` (`src/registry.ts:717-721`), the import of the four handlers (`:38`), `rule` (`:752-764`, kind
   `read`), `rule set` (`:765-792`, `--until`, `--start-priority`), `rule end` (`:793-809`), `rule timer` (`:810-826`,
   internal), each `movedBy: "R-102"` (`:762`, `:790`, `:807`, `:824`). Tests: `MOVED` (`test/registry.test.ts:39-49`),
   the D-045 test naming `rule: "read"` (`:280-286`), `WITHOUT_SUCCESS_TEST` (`:700-703`), the `LIMEN_HERDR=0` note for
   `endDueRules` (`:216`).
2. `src/commands/rule.ts` (218 lines) and `src/project/seat-rules.ts` (89 lines); `rule.ts` is imported by
   `src/registry.ts:38` and `src/main.ts:1` only; `seat-rules.ts` by `rule.ts`, `src/project/board-jobs.ts:13`,
   `hook/communication.ts:7` and `src/runtime/start-queue.ts:35`.
3. `endDueRules` (`src/commands/rule.ts:51-64`) runs before every handler (`src/main.ts:118-123`, in a `try` whose
   `catch` swallows).
4. The start-queue hold: `holdingRules`, `heldText`, `heldDecision` (`src/runtime/start-queue.ts:214-229`), used in
   `enterStartQueue` (`:240`), `decide` (`:510-515`), the re-check under the lock (`:538-546`), the `queued:` log on a
   kind `rules …` (`:332`, the kind made at `:226`); the header comment `:42-44`, `startGate`'s doc `:99`.
5. The cue: `RULE_TEXT_CHARS` (`hook/communication.ts:22`) and the block in `turnCue` (`:224-233`, coordinators only);
   the typed prompt `ruleText` and `broadcast` (`src/commands/rule.ts:150-193`); the board's `## RULES` header
   (`src/project/board-jobs.ts:44-47`, comment `:1`); `seat queue`'s rule lines (`src/runtime/queue-report.ts:9-10`,
   `:33`, `:41-43`, header `:1-2`).
6. The subcommand branch of `commandHelp` (`src/help.ts:121-132`; `rule` is the only entry whose name starts other
   entries' names; `groupEntries` stays for `groupHelp` and `src/main.ts:145`); its test `test/help.test.ts:197-208`.
7. Scans of `test/structure.test.ts`: `ISO_TIME_EXCEPTIONS` (`:1198-1202`, tests `:1213`, `:1217`, fixture `:1221`);
   the `ERRNO_TYPED` entry for `src/project/seat-rules.ts` (`:1295`, checked both ways `:1323`); `READS_WITH_TRANSITIONS`
   `rule: "R-102"` (`:1099-1103`); `movedCommandFiles()` (`:1426-1440`) exempts `rule.ts` from the T-26 scans;
   `UNTYPED_THROWS = 106` (`:161`, four in `rule.ts`); `SWALLOWED` (`:146-150`, whose comment names "a rule's timer").
8. The coordinator registration (`src/integrations/coordinator-registration.ts`, 233 lines): `coordinatorRegistration`
   (`:41-109`, `start` writes `pid`, `pane`, `started-at`, `born` under `<project>/.limen/coordinators/<session>/`,
   `shutdown` writes `shutdown`), called from `hook/wake.ts:134`, `:893` and `:1031`; `liveCoordinators` (`:128-140`,
   read only by `rule.ts`); `removeDeadCoordinators` (`:111-120`, a step of `sweepProject`,
   `src/runtime/sweeping.ts:232-235`); `writeCoordinatorRefusal` (`:167-192`: the folder whose `pid` is this process's
   and whose `born`, when recorded, matches; "a session that registered no folder … gets none"), called by
   `keepRefusal` (`src/runtime/pi-api.ts:466-471`) when `LIMEN_JOB` is not `1`; `coordinatorRefusals` (`:197-223`,
   plain `readFile`), shown by `refusalLines` (`src/project/summary.ts:250-261`, wired at `:138`) as `Coordinator
   session <session>, <at|time unknown>: <detail>`. Tests: `test/integrations/coordinator-registration.test.ts` (`:17`,
   `:49`), `test/cli/status.test.ts:396-434`, `test/runtime/pi-api.test.ts:334-352`, `test/s2-herdr.test.ts:139-145`,
   `JOB_NAME_EXCEPTIONS` (`test/structure.test.ts:710-716`, fixture `:811`). Docs: `docs/commands.md:196`, `:273`,
   `:329`; `docs/seat/README.md:45`.
9. The rule timer: `startTimer` (`src/commands/rule.ts:131-143`, fire-and-forget, its stderr line) through
   `startLimen` (`src/runtime/launcher.ts:103-115`, a detached `systemd-run --user --scope`); `ruleTimer` sleeps at most
   60 s per loop; at a rule's end it writes `ended.<version>` and also `pings/<version>.end/` receipts and types
   `herdr agent prompt` into each live pane (`src/commands/rule.ts:124-129`, `:156-169`), more than D-097 (6) (d)'s
   "writes only `ended.<version>`".
10. `OLD_NAMES` (`src/old-names.ts:59`, an entry with `next: null` at `:60-66`); the parser matches an old name as a
    word prefix (`src/parser.ts:398-405`, `:427-431`), so one `rule` entry refuses `rule set|end|timer` too.
    `LEFTOVERS` (`src/project/leftovers.ts:23-47`, paths relative to the project root, example `:25`).
11. Tests of the mechanism: `test/s2-herdr.test.ts:136` (the rule pings, the board's `## RULES`, a dead timer's end);
    `test/s3-finish-wake.test.ts:234` (a held gate queues by priority and a rule's start priority holds the rest);
    `test/s4-steering.test.ts` (`RULE` `:33`, `rule.json` `:53-55`, the assertions `:94`, `:126-127`); comments in
    `test/cli/group.test.ts:102`, `test/job/group-control.test.ts:92`, `test/hook/communication.test.ts:26`.
12. Docs: `docs/commands.md` (`:11`, the generated `:83-86` and `:105-107`, `:101`, `:210`, the section
    `### Seat-wide rules` `:263-273`); `docs/jobs.md:186-193` (the priority budget and its rule); `templates/agents.md:64`
    and `:66`; `CONTRIBUTING.md:19`; comments in `src/atomic-write.ts:20-21` and `src/runtime/launcher.ts:103-115`.
13. On disk: `~/.limen/rules/<name>/` (`rule.json`, `ended.<version>`, `pings/`) under the seat folder
    (`src/project/seat.ts:8-10`); `<project>/.limen/coordinators/<session>/` (`pid`, `pane`, `started-at`, `born`,
    `shutdown`, `refusal.json`).

## Change

(a) Cut, each path removed with `git rm`: `src/commands/rule.ts`, `src/project/seat-rules.ts`. With them: the four
`rule` entries and `RULE` in `src/registry.ts`; `endDueRules` and its call in `src/main.ts`; the start queue's rule hold
(`holdingRules`, `heldText`, `heldDecision`, the kind `rules`, the hold in `enterStartQueue`, `decide` and the re-check)
in `src/runtime/start-queue.ts`, so a detached job waits only for the gate and the jobs ahead; the cue's block and
`RULE_TEXT_CHARS` in `hook/communication.ts`; the board's `## RULES` header in `src/project/board-jobs.ts`; the rule
lines of `src/runtime/queue-report.ts`; the subcommand branch of `commandHelp` in `src/help.ts`.

(b) The refusal (D-097 (6) (c)): one `OLD_NAMES` entry `rule` with `next: null`, whose sentence names the automatic
resume (Decision 1), so `limen rule`, `limen rule set …`, `limen rule end …` and `limen rule timer …` exit 2 with that
line and write nothing.

(c) The coordinator registration goes (D-097 (6) (b)): `coordinatorRegistration`, `liveCoordinators`,
`registeredProcess` and the sweep's step `removeDeadCoordinators`, with the calls in `hook/wake.ts` at `session_start`
and `session_shutdown`. `.limen/coordinators` becomes a `LEFTOVERS` entry (feature "seat rules (R-102)").

(d) A coordinator session's guard refusal (R-029, T-32 (4)) moves to one file per hook process,
`<project>/.limen/refusals/<pid>-<born>.json` (Decision 2), written atomically by the process that refused, so every
coordinator session's refusal reaches `limen status`, registered or not:
- `born` is the process's own start time read through the platform adapter; a process whose start time cannot be read
  writes no file, and Pi's message in its chat stays the trace (as today for a session with no registration).
- `limen status` reads every file of `.limen/refusals/` through the guarded read of a record (no symlink followed, a
  size bound) and shows each as `Coordinator process <pid>, <at|time unknown>: <detail>` (Decision 3); a directory, a
  link or an unreadable or malformed file is its own `BAD_DATA` line and the rest of `limen status` prints (R-029 round
  3, note (2)).
- A sweep step `removeDeadRefusals`, in the place of `removeDeadCoordinators`, removes the file of a process that is
  no longer alive with that start time.
- The module is renamed: `src/integrations/coordinator-registration.ts` moved with `git mv` to
  `src/integrations/coordinator-refusals.ts`, and its test `test/integrations/coordinator-registration.test.ts` moved
  with `git mv` to `test/integrations/coordinator-refusals.test.ts`; it keeps `coordinatorProject`.

(e) The scans and ratchets of `test/structure.test.ts` and `test/registry.test.ts` follow: no `ISO_TIME_EXCEPTIONS`
entry, no `ERRNO_TYPED` entry for `seat-rules.ts`, no `READS_WITH_TRANSITIONS` key `rule`, `UNTYPED_THROWS` and
`SWALLOWED` lowered by the sites removed, the `JOB_NAME_EXCEPTIONS` of the registration replaced by the new file's, no
`MOVED` or `WITHOUT_SUCCESS_TEST` entries for `rule`, the D-045 test without `rule`.

(f) Tests: `test/s2-herdr.test.ts` loses the rule test; `test/s3-finish-wake.test.ts:234` keeps only the gate's
priority order (T-29); `test/s4-steering.test.ts` loses the `RULE` marker and its assertions; the comments that name
`endDueRules` go. New or changed, each failing at `HEAD` on its mechanism where the file loads there:
- `test/cli/old-names.test.ts`: `limen rule` and `limen rule set x --until 1h text` exit 2 with the line and leave the
  seat folder without `rules/`.
- `test/integrations/coordinator-refusals.test.ts`: a refusal goes to the file of this process's pid and start time,
  with no registration; the sweep's step removes the file of a dead process and keeps a live one's.
- `test/cli/status.test.ts`: the refusal line from `.limen/refusals/`; a directory and a malformed file each give a
  `BAD_DATA` line while the rest prints.
- `test/runtime/pi-api.test.ts`: a coordinator session's refusal with no registration folder lands in
  `.limen/refusals/`.
- `test/project/leftovers.test.ts`: `.limen/coordinators` is named as a leftover.
- `test/hook/communication.test.ts`: a coordinator's turn cue holds no seat-rules block when a `rules/` folder exists
  in the seat folder.
- `test/runtime/start-queue.test.ts`: a detached job queues only behind the gate and the jobs ahead, whatever the seat
  folder holds.

(g) Docs: `docs/commands.md` (the moved list, the generated sections, the internal commands' intro, the queued reason,
`### Seat-wide rules` removed, the status refusal line, the sweep's step); `docs/jobs.md` (the priority budget without
a rule; D-013's weekly threshold stays the owner's); `docs/seat/README.md`; `CONTRIBUTING.md`; `templates/agents.md:64`
and `:66`, with its new first hash in `templates/.history/agents.md`; the comments of `src/atomic-write.ts` and
`src/runtime/launcher.ts`.

## Out of scope

- R-050's registered coordinator (the root-owned start script, A-033).
- Deleting the seat's old `~/.limen/rules/` (Adrian by hand, step 3.5, D-097 (3)).
- `limen decide` (a0.7.0), which would give the refusal a `next`.
- Any replacement of the start priority (D-097 (6) (d)).

## Acceptance

- AC-1: `node --test test/cli/old-names.test.ts` → exit 0; `node --test test/registry.test.ts` → exit 0.
- AC-2: `node --test test/help.test.ts` → exit 0; `node --test test/structure.test.ts` → exit 0.
- AC-3: `node --test test/integrations/coordinator-refusals.test.ts` → exit 0; `node --test test/cli/status.test.ts` →
  exit 0.
- AC-4: `node --test test/runtime/pi-api.test.ts` → exit 0; `node --test test/project/leftovers.test.ts` → exit 0.
- AC-5: `node --test test/hook/communication.test.ts` → exit 0; `node --test test/runtime/start-queue.test.ts` → exit 0.
- AC-6: `node --test test/s3-finish-wake.test.ts` → exit 0; `node --test test/s4-steering.test.ts` → exit 0;
  `node --test test/s2-herdr.test.ts` → exit 0.
- AC-7: `git ls-files --error-unmatch src/commands/rule.ts` → exit 1; `git ls-files --error-unmatch
  src/project/seat-rules.ts` → exit 1.
- AC-8: `git grep -q 'movedBy: "R-102"' -- src/registry.ts` → exit 1.
- AC-9: `git grep -q -e endDueRules -e activeRules -e liveCoordinators -e holdingRules -- src hook seat` → exit 1.
- AC-10: `node adrian-rebuild/tools/fails-before.mjs` → exit 0, its output in `outcome.md` → `## Fails before`.
- AC-11: `node adrian-rebuild/tools/gate.mjs` → exit 0.
- AC-12: `npx biome check --error-on-warnings .` → exit 0; `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-13 (judgment): no process can set text that Limen hands to every coordinator, or hold the start of other jobs; a
  coordinator session's guard refusal reaches `limen status` whether or not the session registered, and a dead
  process's refusal leaves within a sweep minute.

## Migration

- `limen rule …` exits 2 with its line (`test/cli/old-names.test.ts`); nothing reads `~/.limen/rules/`, which step 3.5
  lets Adrian delete by hand (D-097 (3)).
- `<project>/.limen/coordinators/` is a `LEFTOVERS` entry, which `limen status` names (`test/project/leftovers.test.ts`);
  its old `refusal.json` files are past sessions' warnings and are not moved.
- `.limen/refusals/` is new; absent means no refusal.
- A `limen rule timer` still running at deployment runs the old code for at most 60 s more and may type one end prompt
  into a pane; step 3.5 checks that none runs.

## Risk

- A coordinator that followed a seat rule's text loses it; A-010's standing condition, the automatic resume after the
  limit (R-034), replaces the one use (2026-11-10, `claude-quota-reset`).
- The start priority goes with no replacement (D-097 (6) (d)); the weekly threshold of D-013 stays the owner's.
- A refusal file is named by pid and start time, not by session, so `limen status` names the process, not the session
  (Decision 3).

## Rollback

`git revert $(git log --format=%H --grep='^R-102:' adrian-rebuild --)`. After a revert the hook registers coordinators
again and `limen rule` returns; the files of `.limen/refusals/` are ignored by the old code and stay until removed by
hand.

## Decisions

Settled by the documents when the ticket was written (2026-11-24, `limen-rebuild-29`, the main session's reading;
D-097 (6) settles the cut; items 1–3 are named for Adrian's attention at gate 5.3):
1. The refusal's sentence (D-097 (6) (c)): `instead` names the automatic resume, for example "Limen resumes a job
   after the subscription limit by itself (limen seat sweep)"; the implementer proposes the words in `outcome.md`.
2. The refusal file's place (the `## Tickets` note from R-029): one file per hook process,
   `.limen/refusals/<pid>-<born>.json`, because the registration goes (D-097 (6) (b)) and R-029 keyed the refusal by
   the process, since the context that would name the session may be the refused value
   (`src/integrations/coordinator-registration.ts:167-175`); this closes the gap of a session that never registered,
   and R-029's round-3 note (1) (a folder without `born`) has no counterpart, since the name holds both.
3. The status line names the process (`Coordinator process <pid>`) instead of the session; the implementer proposes the
   words in `outcome.md`.
4. The `rule` tests that cover only rules go with the cut; a test that also covers a mechanism that stays (the gate's
   priority order in `test/s3-finish-wake.test.ts:234`) keeps that part (T-29).
5. Fact 9 corrects D-097 (6) (d)'s parenthesis: a live rule timer also writes ping receipts and types an end prompt;
   step 3.5's check that none runs is unchanged.

Checked again at `HEAD` `b489760` (2026-11-25, the night of D-102, run 2, protocol step 2, D-025; R-036, R-037, R-087,
R-098 and R-101 came after R-034's tree):
6. AC-7–AC-9 at `HEAD`: AC-7's two files are tracked; AC-8's grep matches `src/registry.ts:730`, `:758`, `:775`, `:792`,
   the four `rule` entries the change removes; AC-9's grep matches only lines the change removes: `hook/communication.ts:7`,
   `:225` (the cue's block), `src/commands/rule.ts` (removed), `src/integrations/coordinator-registration.ts:128`
   (`liveCoordinators`), `src/main.ts:1`, `:120` (`endDueRules`), `src/project/board-jobs.ts:13`, `:45` (the header),
   `src/project/seat-rules.ts` (removed), `src/runtime/queue-report.ts:10`, `:41` (the rule lines) and
   `src/runtime/start-queue.ts:35`, `:215-216`, `:240`, `:513`, `:544` (the hold). No criterion needs narrowing.
7. Places that moved since R-034's tree (the facts above keep their old lines): `src/registry.ts` imports the handlers at
   `:36`, `RULE` at `:685`, the entries at `:721`, `:734`, `:762`, `:779`; `hook/wake.ts` imports the registration at
   `:6`, makes it at `:137` and calls its `start` at `:903` and its `shutdown` at `:1041`; `src/runtime/sweeping.ts` imports
   `removeDeadCoordinators` at `:18` and calls it at `:259` (R-101 added the daily steps after the minute steps and keys
   a failure by project, `runFailure`); `src/integrations/coordinator-registration.ts`: `coordinatorRegistration` `:41`,
   `removeDeadCoordinators` `:112`, `registeredProcess` `:146`, `writeCoordinatorRefusal` `:176`,
   `coordinatorRefusals` `:201`; `src/project/summary.ts:12`, `:257`; `src/runtime/pi-api.ts:14`, `:470`;
   `test/structure.test.ts`: `SWALLOWED` `:150`, `UNTYPED_THROWS = 106` `:162`, `READS_WITH_TRANSITIONS` `:1102`,
   `ISO_TIME_EXCEPTIONS` `:1204`, the `ERRNO_TYPED` entry of `seat-rules.ts` `:1297`; `CONTRIBUTING.md:19` now lists
   `rule`, `keeper` and `group wait` (R-101 removed `prune` and `close`). `localTime` (`seat-rules.ts`) is used outside
   `rule.ts` only by the hold's text (`src/runtime/start-queue.ts:221`), so it goes with the hold. The test places of fact
   11 are unchanged (`test/s3-finish-wake.test.ts:234`, `test/s4-steering.test.ts:33`, `:55`, `test/s2-herdr.test.ts:136`).
8. R-101's archive moves read only `.limen/jobs/`, `.limen/.publishing-*` and the worktree root, so the new
   `.limen/refusals/` meets none of them.

Review round 1 (2026-11-25, the night of D-102, run 2; `review.md` → Round 1), the findings to fix:
- F1 (finding 1, blocking): no test writes into the checkout. `test/hook/wake.test.ts`, `test/hook/group-peer.test.ts`
  and every other test whose hook call reaches `keepRefusal` outside a job run with a working directory in a
  temporary folder of their own (outside any project, or a temporary project), and one of them asserts that its
  refusal lands there; after the gate, the checkout's `.limen/refusals/` holds no file newer than 07:21 of 2026-11-25
  (the six earlier ones stay until Adrian removes them, `outcome.md` → Open points 5; the main session checks it with
  `ls`).
- F2 (finding 2): `removeDeadRefusals` takes only regular files of `.limen/refusals/`; a directory or a link there is
  left to `limen status`'s `BAD_DATA` line. A test: a directory named `<dead pid>-<n>.json` leaves the step successful.
- F3 (finding 3): a `.limen/refusals` that is not a directory or cannot be read is one `BAD_DATA` line of `limen status`,
  and the rest prints; a test with `.limen/refusals` as a regular file.
- F4 (finding 4, T-29 (3)): `test/s3-finish-wake.test.ts:234` checks the gate's priority order; the start notice, the
  timeout counted from the engine's start and the queued stop finalized once get a test each, or go where a test of
  that mechanism already checks them (named in `outcome.md`).
- F5 (finding 5): the header comment of `src/runtime/sweeping.ts` is wrapped at the file's width.

Review round 2 (2026-11-25, the night of D-102, run 2; `review.md` → Round 2; PASS with five notes), the findings to
fix, the ticket's second and last round of fixes:
- G1 (note 1, T-30): the comment of `test/hook/wake.test.ts:56` names no coordinator registration, which is gone.
- G2 (note 3, T-29 (3)): the first wake-hook test checks the guard's `BAD_DATA` refusal of the command's arguments, and
  F1's check that the refusal's file lands in the test's temporary project is a test of its own.
