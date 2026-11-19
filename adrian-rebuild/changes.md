<!-- PL: Dziennik zmian przebudowy Limena: jeden wpis na zamknięty ticket R-NNN, tylko dopisywany, najnowszy na dole.
Każdy wpis wskazuje pliki, źródła (A-NNN, T-NN), dowód, status pomiaru, commit (po temacie „R-NNN:”, D-009) i sposób
wycofania; wpis wchodzi do commitu swojego ticketu. Stan: etap 5 w toku; wpisy: R-008, R-010, R-011, R-001, R-088, R-002,
R-003, R-004, R-005, R-006, R-007, R-009, R-012, R-013. -->

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
