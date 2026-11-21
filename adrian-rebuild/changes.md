<!-- PL: Dziennik zmian przebudowy Limena: jeden wpis na zamknięty ticket R-NNN, tylko dopisywany, najnowszy na dole.
Każdy wpis wskazuje pliki, źródła (A-NNN, T-NN), dowód, status pomiaru, commit (po temacie „R-NNN:”, D-009) i sposób
wycofania; wpis wchodzi do commitu swojego ticketu. Stan: etap 5 w toku; wpisy: R-008, R-010, R-011, R-001, R-088, R-002,
R-003, R-004, R-005, R-006, R-007, R-009, R-012, R-013, R-014, R-090, R-091, R-015, R-016, R-018, R-017, R-020,
R-019. -->

# Changes

Append-only log of the rebuild, newest entry last. One entry per closed ticket, committed in that ticket's own commit
(D-009), in this format:

```
## YYYY-MM-DD R-NNN <title>
- What: <files, modules>
- Why: <A-NNN, T-NN>
- Proof: <command → exit 0>
- Measurement: measured | unmeasured (plan.md → Measurement: M-NN)
- Commit: R-NNN
- Rollback: git revert $(git log --format=%H --grep='^R-NNN:' adrian-rebuild --) (+ reverse migration, if any)
```

`Commit` names the ticket, whose commit is the only one on `adrian-rebuild` with the subject `R-NNN:`; the SHA is
computed when it is read. `check.mjs` checks both (`tools/changes-entries.mjs`).

## 2026-11-17 R-008 Cut the macOS branches
- What: `src/runtime/contain.ts`, `src/runtime/proc-pidinfo.rb` (deleted), `src/runtime/start-queue.ts`, `src/integrations/herdr.ts`, `src/runtime/reap.ts`, `src/job/group-cabinet.ts`, `test/u9-process-identity.test.ts`, `package.json`, `.github/workflows/check.yml`, `README.md`, `docs/setup.md`, `CONTRIBUTING.md`, `SECURITY.md`, `docs/jobs.md`, `docs/remote.md`, `docs/seat/README.md`
- Why: A-083 (the LaunchAgent installer stays for R-032, ticket → `## Decisions`)
- Proof: `node adrian-rebuild/tools/gate.mjs` → exit 0 (83/83); `git grep -n -i -E 'darwin|osascript|memory_pressure|pidinfo|/usr/bin/ruby' -- src hook bin package.json .github` → no output
- Measurement: measured
- Commit: R-008
- Rollback: git revert $(git log --format=%H --grep='^R-008:' adrian-rebuild --)

## 2026-11-17 R-010 The author's working history leaves the tree; Limen's own test-line cap goes
- What: `spec/` (865 files), `docs/reviews/`, `docs/diagrams/`, `docs/vps.md` and `.pi/settings.json` deleted; `test/structure.test.ts` (the cap test); `README.md` (`## History` pointer); `docs/remote.md`, `docs/seat/README.md`, `docs/finish-webhooks.md` (links); `biome.jsonc`
- Why: T-39, T-11, gate 2 §6
- Proof: `node adrian-rebuild/tools/gate.mjs` → exit 0 (82/82: the baseline's 83 minus the cap test); `git ls-files spec docs/reviews docs/diagrams docs/vps.md .pi/settings.json` → no output; `node adrian-rebuild/tools/check.mjs` → exit 0
- Measurement: measured
- Commit: R-010
- Rollback: git revert $(git log --format=%H --grep='^R-010:' adrian-rebuild --)

## 2026-11-18 R-011 The same-task runner and the gate-time tool
- What: new in `adrian-rebuild/tools/`: `same-task.mjs` (run, evaluate, report), `same-task-session.mjs`, `pi-rpc.mjs` (the only module of Pi's RPC protocol), `fake-pi-rpc.mjs`, `test-same-task.mjs`, `gate-time.mjs`, `test-gate-time.mjs`
- Why: H-21, T-11, T-41, §2, D-021
- Proof: `node --test adrian-rebuild/tools/test-same-task.mjs` → exit 0 (35/35); `node --test adrian-rebuild/tools/test-gate-time.mjs` → exit 0 (4/4); `node adrian-rebuild/tools/gate.mjs` → exit 0 (82/82)
- Measurement: unmeasured (plan.md → Measurement: M-05)
- Commit: R-011
- Rollback: git revert $(git log --format=%H --grep='^R-011:' adrian-rebuild --)

## 2026-11-18 R-001 Leftover files of cut features are listed and can be dropped
- What: new `src/project/leftovers.ts` (the registry `LEFTOVERS`, `listLeftovers`, `dropLeftovers`); `src/project/inherit.ts` (`TRACKED` exported); `src/commands/status.ts` (the `Leftover files` section); `src/commands/init.ts` (`--drop-leftovers` through the module); `package.json` (the test glob `'test/**/*.test.ts'`); new `test/project/leftovers.test.ts`, `test/cli/status.test.ts`, `test/cli/init.test.ts`; `docs/commands.md`, `docs/setup.md`
- Why: A-042, D-025
- Proof: `node adrian-rebuild/tools/gate.mjs` → exit 0 (96/96); `node adrian-rebuild/tools/fails-before.mjs` → exit 0; `git grep -q '"templates/agents.md"' -- src/project/leftovers.ts src/commands/status.ts src/commands/init.ts` → exit 1 (no match)
- Measurement: measured
- Commit: R-001
- Rollback: git revert $(git log --format=%H --grep='^R-001:' adrian-rebuild --)

## 2026-11-18 R-088 The same-task runner leaves no job running after an attempt
- What: `adrian-rebuild/tools/same-task.mjs` (Pi stopped before the jobs; a second stop once a job has `state` and `pid`; comments), `adrian-rebuild/tools/fake-pi-rpc.mjs`, `adrian-rebuild/tools/test-same-task.mjs`
- Why: D-027, D-021
- Proof: `node --test adrian-rebuild/tools/test-same-task.mjs` → exit 0 (39/39); `node adrian-rebuild/tools/gate.mjs` → exit 0 (96/96)
- Measurement: unmeasured (plan.md → Measurement: M-05)
- Commit: R-088
- Rollback: git revert $(git log --format=%H --grep='^R-088:' adrian-rebuild --)

## 2026-11-18 R-002 Cut finish webhooks, coordinator signals and the finish ping
- What: deleted `src/integrations/finish-webhook.ts`, `webhook-queue.ts`, `finish-receipt.ts`, `finish-turn.ts`, `src/commands/webhook.ts`, `bin/tony-finish-ping.sh`, `docs/finish-webhooks.md`, `test/s7-webhooks.test.ts`, `test/u2-webhook-trust.test.ts`; `src/integrations/coordinator-signal.ts` → `coordinator-registration.ts` (the registration `limen rule` reads); new `src/old-names.ts` (the table of old command names, T-18); `LEFTOVERS` gets four paths; call sites in `src/`, `hook/`, templates, tests and docs; `.gitignore` ignores `.*.swp` (D-032)
- Why: G1.3, A-027, A-060, A-076, A-085, D-031, D-032
- Proof: `node adrian-rebuild/tools/gate.mjs` → exit 0 (92/92: 96 − 9 removed with the cut + 5 new); `node adrian-rebuild/tools/fails-before.mjs` → exit 0; the ticket's `git grep -q -E '…'` → exit 1 (no match)
- Measurement: measured
- Commit: R-002
- Rollback: git revert $(git log --format=%H --grep='^R-002:' adrian-rebuild --) (the leftover files stay until `limen init --drop-leftovers`)

## 2026-11-18 R-003 Cut Devin and the Linear mirror
- What: deleted `src/runtime/devin.ts`, `test/s11-devin.test.ts`, `src/commands/linear.ts`, `templates/linear.md`; `src/runtime/engine.ts` (engines `pi` and `omp` only), `src/commands/spawn.ts`, `src/runtime/wrapper.ts`, `src/commands/stop.ts`, `src/commands/continue.ts` (the recorded engine checked before the transcript), `src/commands/group.ts`, `src/main.ts`; `src/old-names.ts` (the `linear` entry, `OLD_ENGINES` and `removedEngine`); `LEFTOVERS` gets three Linear paths; `templates/agents.md` and its history, `.gitignore`, `README.md`, `docs/commands.md`, `docs/jobs.md`, `docs/setup.md`; tests in `test/s1-spawn.test.ts`, `test/cli/old-names.test.ts`, `test/cli/continue.test.ts`, `test/cli/status.test.ts`
- Why: G1.5, G1.6, A-049, T-18
- Proof: `node adrian-rebuild/tools/gate.mjs` → exit 0 (95/95: 92 − 2 removed with the cut + 5 new); `node adrian-rebuild/tools/fails-before.mjs` → exit 0; the ticket's `git grep -q -i -E 'devin|linear' -- …` → exit 1 (no match)
- Measurement: measured
- Commit: R-003
- Rollback: git revert $(git log --format=%H --grep='^R-003:' adrian-rebuild --) (the leftover files stay until `limen init --drop-leftovers`)

## 2026-11-18 R-004 Cut the OMP engine
- What: deleted `.omp/extensions/limen.ts`; `src/runtime/engine.ts` (Pi only; OMP's skill configuration, bridge route and bridge path go), `src/runtime/wrapper.ts`, `src/runtime/supervisor.ts`, `src/runtime/worker-extensions.ts` and its callers in `src/commands/spawn.ts`, `continue.ts`, `group.ts`; `src/job/session-commands.ts` (OMP's persistent shell); `hook/communication.ts` (multi-file edit, read selector), `hook/finish.ts` (`session_stop`); `src/picture/activity.ts`, `src/project/picture-watch.ts`, `src/commands/init.ts`, `src/main.ts`; comments in `spawn.ts`, `watch.ts`, `group-cabinet.ts`, `wake-text.ts`, `github-review.ts`, `hosted-binding.ts`; `src/old-names.ts` (`omp` in `OLD_ENGINES`); `LEFTOVERS` gets `.omp/extensions/limen.ts`; templates and their history; `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `docs/` (with the seat runbook, variant a); tests and fixtures
- Why: G1.7, A-049, T-18
- Proof: `node adrian-rebuild/tools/gate.mjs` → exit 0 (96/96: 95 − 2 removed with the cut + 3 new); `node adrian-rebuild/tools/fails-before.mjs` → exit 0; the ticket's `git grep -q -i -E '\bomp\b|oh-my-pi|LIMEN_OMP|\.omp/' -- …` → exit 1 (no match)
- Measurement: measured
- Commit: R-004
- Rollback: git revert $(git log --format=%H --grep='^R-004:' adrian-rebuild --) (the leftover file stays until `limen init --drop-leftovers`)

## 2026-11-18 R-005 Cut hosted `--tab` jobs; the GitHub module and groups run detached
- What: deleted `src/runtime/supervisor.ts`, `src/runtime/hosted-binding.ts`, `src/runtime/hosted-uncertainty.ts`, `hook/hosted.ts`; renamed `test/s2-hosted.test.ts` → `test/s2-herdr.test.ts`; `src/integrations/herdr.ts` (the hosted Herdr calls), `src/commands/spawn.ts`, `continue.ts`, `stop.ts`, `jobs.ts`, `status.ts`, `sweep.ts`, `rule.ts`, `group.ts`, `group-rounds.ts`, `github.ts`; `src/runtime/engine.ts`, `reap.ts`, `recovery.ts`, `wrapper.ts`; `src/job/job.ts`, `group-cabinet.ts`, `publication.ts`, `record.ts`, `view.ts` (`noteKind` goes; the note is `advisory`), `wake-delivery.ts`; `src/integrations/github-review.ts` and `github-poller.ts` (a GitHub job is detached; no `hosted` or `started` check); `src/picture/activity.ts`; `hook/finish.ts`, `hook/wake.ts`; `src/main.ts`; `src/old-names.ts` (`OLD_FLAGS`, `removedFlag`, `refuseRemovedFlags`: `--tab` on `spawn`, `continue`, `group start`); templates and their history, `README.md`, `CONTRIBUTING.md`, `docs/`; tests, with the new `test/cli/old-hosted.test.ts`
- Why: G1.8, A-023, T-18
- Proof: `node adrian-rebuild/tools/gate.mjs` → exit 0 (102/102: 96 − 4 removed with the cut + 10 new); `node adrian-rebuild/tools/fails-before.mjs` → exit 0; the ticket's `git grep -q -i -E 'hosted|--tab\b|…|noteKind' -- …` → exit 1 (no match)
- Measurement: unmeasured (plan.md → Measurement: M-01 at the close of stage 1; seat steps 1.2 and 1.3)
- Commit: R-005
- Rollback: git revert $(git log --format=%H --grep='^R-005:' adrian-rebuild --)

## 2026-11-18 R-006 Cut private planning, `highlight`, `ticket-author`, `wait`, `ticket series`, `continue --review` and `group status --json`
- What: deleted `src/commands/planning-source.ts`, `highlight.ts`, `ticket-author.ts`, `wait.ts`; `src/project/planning.ts` (committed mode only), `src/project/series.ts` (no series), `src/project/git.ts` (`ticketAuthor`), `src/project/lanes.ts`; `src/commands/spawn.ts`, `continue.ts` (no `--review`), `group.ts` (no `--json`), `ticket.ts`, `land.ts`; `src/job/group-packet.ts`, `group-cabinet.ts`, `publication.ts`; `src/integrations/herdr.ts` (highlight helpers); `hook/wake.ts` (the `/limen` refusal of removed words), `hook/communication.ts`; `src/main.ts`; `src/old-names.ts` (five `OLD_NAMES`, two `OLD_FLAGS`, `refuseRemovedWords`); `LEFTOVERS` gets `.limen/planning-source`; templates and their history, `README.md`, `docs/`; `test/plant.ts` (`waitJob` watches `state` in a child process) and tests
- Why: G1.12, T-18, T-37, A-079
- Proof: `node adrian-rebuild/tools/gate.mjs` → exit 0 (108/108: 102 − 1 removed with the cut + 7 new); `node adrian-rebuild/tools/fails-before.mjs` → exit 0; the ticket's `git grep -q -i -E 'highlight|ticket-author|…|continue --review' -- …` → exit 1 (no match)
- Measurement: unmeasured (plan.md → Measurement: M-01 at the close of stage 1)
- Commit: R-006
- Rollback: git revert $(git log --format=%H --grep='^R-006:' adrian-rebuild --) (the leftover file stays until `limen init --drop-leftovers`)

## 2026-11-19 R-007 Cut the Picture viewer and the map jobs
- What: deleted `picture/viewer/*`, `src/picture/html.ts`, `src/project/picture-tick.ts`, `src/project/picture-watch.ts`, `templates/picture.md` and its history; `src/picture/picture-build.ts` (no page; the model only with `--json`), `src/picture/picture-serve.ts` (only `/activity.json` and `/events`, no map), `src/commands/picture.ts` (build and serve; the jobs of the primary checkout); `src/old-names.ts` (`picture tick`, `picture watch`, `picture build --out`, `picture serve --dir`, the new `OLD_ROLES` with `removedRole`), `src/commands/spawn.ts` (`resolvePreamble` refuses a removed role); `src/project/leftovers.ts` (entries with a `marker`, the watch hook under `.git/hooks/`, four `.limen` paths); `src/main.ts`, `src/runtime/wrapper.ts`, `package.json`, `biome.jsonc`; templates and their history, `templates/picture/CONTRACT.md`, `README.md`, `docs/`; `test/plant.ts` (`waitJob` waits for `pid` to go, A-088) and tests
- Why: G1.4, §6, A-048, A-088, D-034
- Proof: `node adrian-rebuild/tools/gate.mjs` → exit 0 (127/127: 108 − 1 removed with the cut + 20 new); `node adrian-rebuild/tools/fails-before.mjs` → exit 0; the ticket's `git grep -q -i -E 'pictureTick|pictureWatch|…|tick\.lock' -- …` → exit 1 (no match)
- Measurement: unmeasured (plan.md → Measurement: M-01 at the close of stage 1)
- Commit: R-007
- Rollback: git revert $(git log --format=%H --grep='^R-007:' adrian-rebuild --) (the leftover files stay until `limen init --drop-leftovers`)

## 2026-11-19 R-009 Cut the scout role and the `jg` cue
- What: deleted `templates/scout.md`; `src/job/wake-text.ts` (no scout wake), `src/old-names.ts` (`OLD_ROLES` gets `scout`); `hook/communication.ts` (no `jg --help` probe, no Search cue, no `node:child_process`); `templates/agents.md` (no scout shape, table or escalation line), `templates/communication.md` (no `## Cue: Search`) and their history; `CONTRIBUTING.md`; new `test/hook/communication.test.ts` (T-36: the same context with and without a `jg` on PATH, which never runs), `test/cli/old-names.test.ts` (four scout refusals), `test/u3-turn-signal.test.ts`
- Why: T-33, T-36, A-081
- Proof: `node adrian-rebuild/tools/gate.mjs` → exit 0 (133/133: 127 − 0 removed with the cut + 6 new); `node adrian-rebuild/tools/fails-before.mjs` → exit 0; the ticket's `git grep -q -I -i scout -- …` and `git grep -q -I -i -E '\bjg\b|jevgrep|Cue: Search' -- …` → exit 1 (no match)
- Measurement: unmeasured (plan.md → Measurement: M-01 at the close of stage 1)
- Commit: R-009
- Rollback: git revert $(git log --format=%H --grep='^R-009:' adrian-rebuild --)

## 2026-11-19 R-012 A root deployment script for a pinned SHA
- What: new `seat/deploy.ts` (refuses while a job of any registered project runs, fetches `origin adrian-rebuild`, refuses a SHA off the branch and a changed checkout, checks out detached, compares HEAD, runs the verifications from the new checkout, returns to the previous SHA with exit 4 on any failure after the checkout, tags `deployed-<UTC time>` last; control characters escaped in its output; git without the repository-location variables); `tsconfig.json` (`seat/**/*.ts`); `test/structure.test.ts` (no `.sh` in `seat/` and `bin/`, no dynamic `import(` in `src/` and `hook/`); new `test/seat/deploy.test.ts` (14 tests on fixture repositories); `docs/seat/agent-setup.md` (`## Upgrade`)
- Why: D-008, D-010, §7 (D3)
- Proof: `node adrian-rebuild/tools/gate.mjs` → exit 0 (149/149: 133 + 16 new); `node adrian-rebuild/tools/fails-before.mjs` → exit 0; `git grep -q -E '\bimport\(' -- src hook` → exit 1 (no match)
- Measurement: measured
- Commit: R-012
- Rollback: git revert $(git log --format=%H --grep='^R-012:' adrian-rebuild --)

## 2026-11-19 R-013 One error type, exit codes as failure classes, a final JSON line
- What: new `src/outcome.ts` (`LimenError`, the six classes with exit codes 0–5, `finalLine`, `failureOf`, the client `readOutcome`, one job-id pattern for every form Limen wrote); `src/main.ts` (the only place that sets the exit code; one final line per command process; unknown command `usage`); `src/commands/flags.ts` (`BAD_FLAG`, exit 2); commands return their result (`ids.job` for `spawn`, `continue`, `keeper`, `github review`, `github work`; `ids.ticket` for `ticket new`); `ticket check`, `picture build --strict`, `github poll` (by cause, a rate-limited 403 is class 3) and `group wait` (no `process.exit` from a timer) throw typed errors; `bin/limen` (exit 4 on an old Node); scans in `test/structure.test.ts` (T-02, T-26 (4), the T-01 ratchets); new `test/outcome.test.ts`, `test/cli/{ticket,picture,github,group}.test.ts`; every test caller reads the final line through `readOutcome`; `docs/commands.md`, `docs/jobs.md`, `docs/groups.md`, `docs/seat/agent-setup.md`, `templates/agents.md` and its history
- Why: T-01, T-02, D-022, D-028
- Proof: `node adrian-rebuild/tools/gate.mjs` → exit 0 (198/198: 149 + 49 new); `node adrian-rebuild/tools/fails-before.mjs` → exit 0; `git grep -q -E 'stdout\.trim\(\)\.split\(' -- src test` → exit 1 (no match)
- Measurement: unmeasured (plan.md → Measurement: M-05)
- Commit: R-013
- Rollback: git revert $(git log --format=%H --grep='^R-013:' adrian-rebuild --)

## 2026-11-19 R-014 One command registry, a shared parser and generated help
- What: new `src/registry.ts` (45 entries: object, kind, visibility, summary, schema, `ids` keys, example, `movedBy`, handler), `src/parser.ts` (one schema-driven parser, `BAD_ARGUMENT` with the usage line; replaces `src/commands/flags.ts`, removed), `src/help.ts` (the golden `limen --help`, `limen <cmd> --help`, the two generated sections of `docs/commands.md`), `src/commands/show.ts`; `src/commands/queue.ts` → `src/commands/seat-queue.ts`, `src/commands/jobs.ts` → `src/job/listing.ts`; `src/main.ts` dispatches through the registry and refuses undeclared `ids`; `src/old-names.ts` (old names exit 2 `REMOVED`, `jobs` and `queue` added); `spawn` requires its four route flags (D-043); `status --all` lists every job (D-038); `group wait` member-only (D-042); every command file takes parsed values; docs, `templates/agents.md` and the tests on the new forms; new `test/registry.test.ts`, `test/parser.test.ts`, `test/help.test.ts`
- Why: T-19, T-18, T-26, T-37, D-028, D-037–D-044
- Proof: `node adrian-rebuild/tools/gate.mjs` → exit 0 (244/244; 198 at the parent); `node adrian-rebuild/tools/fails-before.mjs` → exit 0; `git grep -n -E 'limen (jobs|queue)\b' -- src hook templates docs` → exit 1
- Measurement: unmeasured (plan.md → Measurement: M-05, M-01)
- Commit: R-014
- Rollback: git revert $(git log --format=%H --grep='^R-014:' adrian-rebuild --)

## 2026-11-19 R-090 The deployment script names what it checked; a registry without a project refuses
- What: `seat/deploy.ts` (stdout opens with the list of every registry and registry line it checked, each project root with its running jobs; registries that hold no project refuse with exit 4 before the fetch); `test/seat/deploy.test.ts` (seven new tests, ELOOP included); `test/structure.test.ts` (the basename test counts only the files git knows that exist in the working tree, so the ignored `adrian-rebuild/input/vendor/` cannot fail the gate)
- Why: D-045, D-046, §7 D3, D-008
- Proof: `node adrian-rebuild/tools/gate.mjs` → exit 0 (253/253; 244 at the parent); `node adrian-rebuild/tools/fails-before.mjs` → exit 0; `node --test test/seat/deploy.test.ts` → exit 0
- Measurement: measured
- Commit: R-090
- Rollback: git revert $(git log --format=%H --grep='^R-090:' adrian-rebuild --)

## 2026-11-19 R-091 The same-task runner refuses an unmarked Pi event and states its touchpoint definition
- What: `adrian-rebuild/tools/pi-rpc.mjs` (the header cites the Pi 1.5.1 sources; `MARKS` marks each of the 26 types Pi writes in RPC mode `handled` or `skipped`, `UI_METHODS` the extension requests by method, `RESPONSES` the responses by command; a waiting request, an unmarked type, method or command, an unknown disposition or a line that is not JSON raise a `PiError` that carries the raw line; the run ends at `agent_settled`); `adrian-rebuild/tools/same-task.mjs` (a prompt answered `handled` waits for no run; `extensionErrors`, `touchpointsDefinition` and `transcript` in `result.json`; `protocol-error.json` on a protocol error, exit 4; the report prints the definition); `adrian-rebuild/tools/fake-pi-rpc.mjs` (Pi's vocabulary: `agent_settled`, `willRetry`, `data.disposition`, the steps `write`, `extensionError`, `retry`); `adrian-rebuild/tools/test-same-task.mjs` (18 new tests)
- Why: D-045, D-046, D-021, H-21
- Proof: `node adrian-rebuild/tools/gate.mjs` → exit 0 (253/253); `node --test adrian-rebuild/tools/test-same-task.mjs` → exit 0 (57/57; at HEAD's runner exit 1, 15 failing)
- Measurement: unmeasured (plan.md → Measurement: M-05)
- Commit: R-091
- Rollback: git revert $(git log --format=%H --grep='^R-091:' adrian-rebuild --)

## 2026-11-20 R-015 One configuration reader; settings come only from owner files
- What: new `src/config.ts` (`ENVIRONMENT`, the 48 `LIMEN_*` names with their kinds `transport`, `test`, `exception`, `removed`; the readers `transport`, `testKnob`, `exception`, `setTestKnob`; the builders `wrapperEnvironment`, `engineEnvironment`, `groupAdvanceEnvironment`; `ignoredSettings`); every `process.env.LIMEN_*` read of `src/`, `hook/` and `bin/` goes through it (27 files and `bin/limen-group-fixture.mjs`); `src/project/limits.ts` (the file only, the new `toolCalls`); `src/runtime/start-queue.ts` (`start-gate.json` only, `"off"`); `src/runtime/wrapper.ts`, `src/commands/spawn.ts`, `src/commands/continue.ts`, `src/job/group-cabinet.ts` (environments from the registry, which closes the leaks of `LIMEN_TIMEOUT_MS` and `LIMEN_CONTINUE`); `src/commands/status.ts` (the two environment sections); `docs/jobs.md`, `docs/commands.md`, `docs/setup.md`, `templates/agents.md`; tests `test/config.test.ts`, `test/project/limits.test.ts`, `test/runtime/start-queue.test.ts`, `test/cli/spawn.test.ts` and the helpers `test/known-files.ts`, `test/environment.ts` (new), `test/cli/continue.test.ts`, `test/cli/status.test.ts`, `test/plant.ts`, `test/s3-finish-wake.test.ts`, `test/structure.test.ts`; `plan.md` (D-052, the stage-2 row and step 2.4)
- Why: T-03, D-052
- Proof: `node adrian-rebuild/tools/gate.mjs` → exit 0 (277/277); `node adrian-rebuild/tools/fails-before.mjs` → exit 0 (eight test files fail at HEAD); `node --test test/config.test.ts` → exit 0 (11/11)
- Measurement: measured
- Commit: R-015
- Rollback: git revert $(git log --format=%H --grep='^R-015:' adrian-rebuild --)

## 2026-11-20 R-016 One boundary parsing module with validators; the cast ratchet
- What: new `src/boundary.ts` (hand-written validators, `parseJson`, `checkValue`, `eachField`, the typed `BAD_DATA` error with `file`, `field` and `expected`, escaping of control characters and line terminators); `src/outcome.ts` (`readOutcome` and `finalLine` through the module); `src/project/limits.ts` and `src/runtime/start-queue.ts` (`plantLimits` and `startGate` through the module, `ignored` as typed errors); `src/runtime/job-setup.ts` (the log line); tests `test/boundary.test.ts` (new), `test/structure.test.ts` (the `JSON.parse` and cast ratchets, the `as unknown as` ban, the T-25 name scan), `test/outcome.test.ts`, `test/project/limits.test.ts`, `test/runtime/start-queue.test.ts`, `test/s3-finish-wake.test.ts`; `plan.md` (the R-021 note)
- Why: T-27
- Proof: `node adrian-rebuild/tools/gate.mjs` → exit 0 (310/310); `node adrian-rebuild/tools/fails-before.mjs` → exit 0 (six test files fail at HEAD); `node --test test/boundary.test.ts` → exit 0 (24/24)
- Measurement: measured
- Commit: R-016
- Rollback: git revert $(git log --format=%H --grep='^R-016:' adrian-rebuild --)

## 2026-11-20 R-018 One atomic-write module
- What: new `src/atomic-write.ts` (`atomicWrite` and `atomicWriteSync` with `mode` and `exclusive`, `atomicRename` and `atomicRenameSync`, the temp-name pattern `TEMPORARY_NAME`, `temporaryWriter`, `temporaryPath`); every write and rename of `src/`, `hook/` and `seat/` through it (the eight copies of the temp-and-rename policy and about 60 direct writes; `writeAtomic` of Picture removed; `github resolve` writes its outcome with a plain `atomicWrite` behind its gate; the transcript copy keeps the source's mode); the five folder readers skip the module's temps (`deliveredSlots`, `seatEvent`, `leadSession`, `jobEnding`, `finalizeJob`); tests `test/atomic-write.test.ts` (new), `test/structure.test.ts` (the write scan with its exception list, fixture self-test and staleness test), `test/job/{wake-delivery,group-cabinet,wake-text,record}.test.ts` (new), `test/cli/sweep.test.ts` (new), `test/cli/continue.test.ts`, `test/cli/github.test.ts`; `plan.md` (notes for R-021 and R-025)
- Why: A-022, T-25
- Proof: `node adrian-rebuild/tools/gate.mjs` → exit 0 (340/340); `node adrian-rebuild/tools/fails-before.mjs` → exit 0 (nine test files fail at HEAD); `node --test test/atomic-write.test.ts` → exit 0 (20/20)
- Measurement: unmeasured (plan.md → Measurement: M-10)
- Commit: R-018
- Rollback: git revert $(git log --format=%H --grep='^R-018:' adrian-rebuild --)

## 2026-11-20 R-017 One Pi API adapter with type guards, checked against Pi's real types
- What: new `src/runtime/pi-api.ts` (`PiApi`, `PiEvents`, `PiContext`, the handler results; the guards `piEvent`, `piSettleEvent`, `piContext`, `piToolInput`, `piCommandArgs`, each returning the value itself or throwing BAD_DATA that names the event and the field); `src/boundary.ts` (`refusedValue`); the five hooks `hook/{communication,finish,group-peer,steering,wake}.ts` declare no Pi types and read every payload, context field, tool parameter and command argument through a guard; the `tool_call` guard of `group-peer` runs only inside a group, since Pi 1.5.1 rethrows a `tool_call` handler's error; the dead code Pi 1.5.1 lacks removed (`before_subagent_spawn`, the three `context.agent?.kind` checks; `CoordinatorSession` in `src/integrations/coordinator-registration.ts` is a `Pick` of the adapter's context, D-058); `attribution` and the `await` of `sendMessage` dropped, the command handler `async`; tests `test/runtime/pi-api.test.ts`, `test/runtime/pi-contract.ts` with `test/runtime/pi-contract.test.ts` (the type contract on fixtures and on the vendor copy of Pi 1.5.1, D-055 (1)), `test/hook/group-peer.test.ts`, `test/hook/wake.test.ts` (new), `test/structure.test.ts` (the T-32 scan and its self-test), `test/boundary.test.ts`, the doubles `test/fake-engine.mjs`, `test/u14-task-note.test.ts`, `test/integrations/coordinator-registration.test.ts`; `plan.md` (D-058, a note for R-029)
- Why: T-32, D-055, D-058
- Proof: `node adrian-rebuild/tools/gate.mjs` → exit 0 (377/377, skipped 0); `node adrian-rebuild/tools/fails-before.mjs` → exit 0 (eight test files fail at HEAD); `node --test test/runtime/pi-contract.test.ts` → exit 0 (7/7, the vendor test ran)
- Measurement: unmeasured (plan.md → Measurement: M-10)
- Commit: R-017
- Rollback: git revert $(git log --format=%H --grep='^R-017:' adrian-rebuild --)

## 2026-11-20 R-020 A Linux platform adapter and declared system requirements
- What: new `src/platform/platform.ts` (the interface `Platform`: process identity and table, command name, liveness and signals of a process and a group, CPU times, memory), `src/platform/linux.ts` (its one implementation, with the code moved from `src/runtime/contain.ts`, `stalled-tool.ts`, `start-queue.ts`, `src/job/publication.ts` and `src/project/seat.ts`; one `ps` process table), `src/platform/requirements.ts` (Node ≥ 24, git with `worktree list --porcelain -z` probed through `--git-dir`, `tar`, `ps`, `pi`, Herdr inside a pane; Pi 1.5.1, bridge 5.0.3 and Herdr 0.9.3 as data; refusals of class `environment`, exit 4, naming the tool); `limen init` and `limen workspace init` run the check first; the central `git()` types only start errors and drops the `/opt/homebrew` fallback; `bin/limen` prints the adapter's Node message; callers moved to `platform`; `docs/setup.md`; tests `test/platform/{linux,requirements}.test.ts`, `test/project/git.test.ts`, `test/cli/workspace.test.ts` (new), `test/cli/init.test.ts`, `test/structure.test.ts` (the A-083 scan and its self-test), `test/plant.ts` and `test/plant.test.ts` (a plant links the runner's git, D-060), `test/u9-process-identity.test.ts`
- Why: A-083, T-12, T-32, D-060
- Proof: `node adrian-rebuild/tools/gate.mjs` → exit 0 (401/401); `node adrian-rebuild/tools/fails-before.mjs` → exit 0 (eight test files fail at HEAD); `node --test test/cli/init.test.ts` → exit 0 (10/10, outside the gate)
- Measurement: unmeasured (plan.md → Measurement: M-10)
- Commit: R-020
- Rollback: git revert $(git log --format=%H --grep='^R-020:' adrian-rebuild --)

## 2026-11-21 R-019 One lock module with process identity and a bounded wait
- What: new `src/lock.ts` (the one lock module: a lock is one file holding its owner's record, pid, start time, boot id, token and time, created through `atomicWrite` with `exclusive`; the owner is gone on another boot id, another start time or no process; the takeover of a dead lock runs under a claim on the dead record and re-reads it before the rename, A-087; a 60 s bounded wait ending in `LOCK_TIMEOUT`, class `transient`; `LOCK_LOST` on a release that finds its lock replaced; the old pid-only forms read as D-056 (3) says); `src/platform/platform.ts` and `src/platform/linux.ts` (`bootId()`, `parseBootId`, `BOOT_ID`); every lock through the module: `src/job/group-cabinet.ts` (`groupLock`, with the launch, prune and start-queue locks), `src/project/seat.ts` (the seat registry, async, under the module's lock through `atomicWrite`), `src/integrations/github-poller.ts` (`withPollLock`, also used by `src/commands/github.ts` for `disconnect`), `src/project/series.ts` (ticket numbers under a lock, A-055), `src/commands/sweep.ts`, `src/commands/ticket.ts`; `src/config.ts` (the test knob `LIMEN_LOCK_WAIT_MS`); `docs/groups.md`, `docs/remote.md`, `docs/commands.md`; tests `test/lock.test.ts` and `test/project/seat.test.ts` (new), `test/platform/linux.test.ts`, `test/cli/ticket.test.ts`, `test/cli/github.test.ts`, `test/config.test.ts`, `test/structure.test.ts` (the R-019 write exceptions gone, the T-25 lock-name scan and its self-test), `test/s9-housekeeping.test.ts` (the barrier follows the new first touch); `plan.md` → `## Agents` step 4 (D-031's exception gone)
- Why: A-017, A-018, A-055, A-058, A-087, T-25, D-029, D-056
- Proof: `node adrian-rebuild/tools/gate.mjs` → exit 0 (429/429); `node adrian-rebuild/tools/fails-before.mjs` → exit 0 (eight test files fail at HEAD); `node --test test/lock.test.ts` → exit 0 (21/21)
- Measurement: unmeasured (plan.md → Measurement: M-10)
- Commit: R-019
- Rollback: git revert $(git log --format=%H --grep='^R-019:' adrian-rebuild --)
