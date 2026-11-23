<!-- PL: Ticket R-087 (T1 z A-004, A-061, E-4, D-017, notatki D-092 i R-026): środowisko joba staje się allow-listą
zamiast listy odrzucanych nazw; git w jobie nie ma helpera poświadczeń z żadnego pliku konfiguracji i nie pyta o
hasło, gh czyta pusty folder konfiguracji, `DISABLE_UPDATES=1`; przełączniki testowe działają tylko w trybie testowym
(`LIMEN_TEST_MODE=1`); spawner zapisuje w logu joba nazwy, które odrzucił. Stan: napisany 23.11 przy `ab36464` z
inwentarza `evidence/inventories/R-087.md`; pytania inwentarza rozstrzygnięte dokumentami w `## Decisions`; gotowy na
noc. -->

# R-087 The job environment is an allow-list; git and gh in a job hold no credential (T1)

## Problem

Finding A-004 (critical), its Decision quoted from `audit.md`: "fix — T1: the job environment is an allow-list, not a
deny-list; no `LIMEN_COORDINATOR`; `gh` and git in a job have no logged-in credential helper. Limen supports B2c: the
researcher role starts through an external launcher on another account; its result is accepted from a results
directory as data. Seat side: G2." This ticket is T1; B2c and G2 are seat work (R-055, R-056, stage 5). Finding A-061
(low), its Decision: "fix — `LIMEN_COORDINATOR` is outside the job allow-list (T1). The registered-coordinator function
(§2) replaces every environment-variable check for coordinator-only commands. … `accepted-risk` (G2): a process
deliberately moved to another cgroup." The registered coordinator is R-050's.

Plan decisions and facts the change relies on:
- E-4 (`## Engine facts`): "The whole Pi environment is forwarded to Claude Code." `## Engine facts` → consequences:
  "the T1 allow-list is the only environment filter, because the bridge forwards everything (A-004, E-4)".
- D-017: "`DISABLE_UPDATES=1` is set in the environment of the coordinator and of every job, but the boundary is the
  file's owner (z. 14). … Tickets: … R-087 (`DISABLE_UPDATES` in the job allow-list), R-050 (the start script sets it
  for the coordinator); steps 3.10, 5.3, 5.9 and 5.20."
- D-012: T1 "moves to stage 3 as R-087, split from R-048 without a change of scope"; until a0.5.0 the agents' account
  holds the GitHub token (fine-grained, Contents read and write on the two projects) as an accepted risk with a
  deadline.
- D-052 (1): the exceptions and their end tickets: `LIMEN_WORKER_MODEL` (R-062), `LIMEN_COORDINATOR` (R-050), the six
  `LIMEN_GITHUB_*` of the poller (R-059), `LIMEN_PACKAGE` (R-049). (3): "`LIMEN_HOME` and the six other knobs of the
  tests are test knobs".
- Gate 2 §2, G2 → accepted risk (same account): "deliberate tampering by a job with Limen's own files on the agents'
  account (records, markers, another job's `result`, inbox, transcripts, cgroup moves, shell start-up files). Typical
  injections lose their point because there is no push credential and no open network".
- T-03: "**Transport** between Limen's processes is environment set by Limen only, read as a location hint, never as a
  permission (A-061). **Test knobs** are read only in test mode; T1 and the coordinator start script do not pass
  them." Check: "one configuration module is the only reader of `process.env.LIMEN_*`; a registry lists every name
  with its kind".
- T-25: one module per policy. T-28 (4): a bug fix comes with a test that fails before it; (5): behaviour that depends
  on Pi or the bridge gets a fake-engine test and a `## Deployment` step (3.10). T-31: the fake engine shows what the
  model sees. T-01: a failure is never silent.
- Notes in `## Tickets`: (R-028 round 3, note 1) "the test knob `LIMEN_END_GATE` … holds a wrapper's end with no bound
  of its own, so a spawner's environment that held it would hold every job's end until `limen stop`; it is one of the
  test knobs that R-087 makes read only in test mode (T-03)"; (R-026) "R-087's allow-list keeps the user-bus variables
  (`XDG_RUNTIME_DIR`, `DBUS_SESSION_BUS_ADDRESS`), which a job that spawns jobs needs for its children's scopes, and the
  fake scope's marker in tests"; (R-026 note 6) `src/platform/linux.ts` reads `LIMEN_CGROUP` and `LIMEN_CGROUP_ROOT`
  in production paths; "the guarantee is that the knobs are read only in test mode (T-03), which R-087 makes true".

Facts at `ab36464` (the read-only inventory `adrian-rebuild/evidence/inventories/R-087.md`, made at `6d17130`; `git
diff 6d17130 HEAD -- src hook bin seat test templates docs` is empty; the main session checked the ones it quotes):
1. `wrapperEnvironment` (`src/config.ts:237-244`) is the spawner's whole `process.env` without the 18 transport and 14
   removed names, plus the passed transport values; `launchWrapper` (`src/runtime/launcher.ts:123-139`) hands it to
   `systemd-run`, which runs the wrapper with it. `engineEnvironment` (`src/config.ts:249-264`) is the wrapper's
   environment without the wrapper's transport names, five `PI_*` session names and every `HERDR_*` name; the wrapper
   starts Pi with it (`src/runtime/wrapper.ts:221`, `:259-263`). Every other name of the spawner reaches the engine,
   every tool Pi runs (Pi's bash tool passes `process.env`, `pi-coding-agent@1.5.1/dist/utils/shell.js#L147-L157`) and
   Claude Code: token names, `GIT_*`, `SSH_AUTH_SOCK`, the exceptions (`LIMEN_COORDINATOR`, `LIMEN_GITHUB_KEY_FILE`, …)
   and all 13 test knobs.
2. The project's prepare command (`src/runtime/job-setup.ts:48`) runs with the wrapper's environment, so with its
   `HERDR_*` names and wrapper transport names.
3. git in a job reads the account's global configuration through `HOME`, where the seat's setup put gh's credential
   helper (`docs/seat/agent-setup.md:135`, `gh auth setup-git`), and the repository's `.git/config`, which every job
   worktree shares. No product code sets a git configuration name for a job (`git grep -n GIT_CONFIG -- src hook bin
   seat` → no line). gh in a job finds the account's login through its config folder. No job role uses gh (`git grep
   -c -i -E 'credential|token|gh ' -- templates/worker.md templates/reviewer.md templates/keeper.md` → no line).
4. `testKnob` (`src/config.ts:202-205`) reads a knob wherever it is set; 14 call sites in `src`, `hook` and `seat`, all
   on paths that run on the seat, none behind a switch; no "test mode" exists (`git grep -n -i -E
   'NODE_ENV|LIMEN_TEST|test mode' -- src hook bin seat` → no line). `ownCgroup` (`src/platform/linux.ts:382`) and
   `cgroupFolder` (`:301`) take `LIMEN_CGROUP` and `LIMEN_CGROUP_ROOT` in the wrapper's in-scope check and the scope's
   end; `endGate` (`src/runtime/wrapper.ts:474-490`) waits for a file with no bound while `LIMEN_END_GATE` is set.
5. The tests need knobs in every process of a test job: the fake `systemctl` finds a scope's members by
   `LIMEN_CGROUP` and `LIMEN_CGROUP_ROOT` in `/proc/*/environ` (`test/plant.ts:192`), the plant's cleanup finds its
   processes by `LIMEN_HOME` (`:438-446`), and `NODE_OPTIONS` loads the network sink in every Node process of the plant
   (`:379`); the plant also sets `GIT_CONFIG_GLOBAL` and `GIT_CONFIG_NOSYSTEM` (`:371-372`). The fake engine records
   only the names that match `/^(LIMEN|HERDR|PI)_/` (`test/fake-engine.mjs:30-31`), so no test shows a non-`LIMEN_`
   name dropped. `test/config.test.ts:300-369` pins today's deny-list (a test knob and an exception pass).
6. Pi picks `/bin/bash`, then `bash` on `PATH`, then `sh` (`pi-coding-agent@1.5.1/dist/utils/shell.js#L74-L113`), not
   `SHELL`. The bridge's path comes from `homedir()` (`src/runtime/engine.ts:145-151`); Pi's auth store and the Claude
   login are found under `HOME` (E-4; bridge evidence `evidence/engine-sources/bridge-5.0.3.md:247`, `:253`).
7. Callers outside `test/` that set knobs: `bin/limen-group-fixture.mjs:29` (`setTestKnob("LIMEN_HOME", …)`) and
   `adrian-rebuild/tools/role-context.mjs:44`, `:137` (`LIMEN_HOME`, `LIMEN_HERDR`). No `## Deployment` step sets one.

## Change

(a) One allow-list in `src/config.ts` (T-25), applied where a job's process tree starts (`wrapperEnvironment`, so
`launchWrapper`, `systemd-run` and the wrapper): the new environment is built from the list, never from a copy of the
spawner's. It holds, each with one line on what it carries (as the registry's entries):
- from the spawner, unchanged: `HOME`, `PATH`, `USER`, `LOGNAME`, `LANG`, every `LC_*` name, `TZ`, `TMPDIR` (until
  R-048 sets a private one), `XDG_RUNTIME_DIR` and `DBUS_SESSION_BUS_ADDRESS` (the user bus that `systemd-run --user`
  and `systemctl --user` of a job's own spawns and of its finisher need, R-026);
- for the wrapper only, never for the engine: every `HERDR_*` name, as today (the wrapper's end wake runs `herdr
  status`, which resolves its server from its environment);
- the `LIMEN_` names: the transport values the spawner passes, as today; the exceptions whose readers run inside a
  job, `LIMEN_PACKAGE` (until R-049; a team job's spawns use its coordinator's package) and `LIMEN_WORKER_MODEL`
  (until R-062; a team job's `limen continue` without `--model`), each `exception` entry of the registry declaring
  whether it crosses into a job; never `LIMEN_COORDINATOR` (A-061) or the six `LIMEN_GITHUB_*` (the poller's own);
- set by Limen for every job: `DISABLE_UPDATES=1` (D-017); `GIT_CONFIG_COUNT=1`, `GIT_CONFIG_KEY_0=credential.helper`,
  `GIT_CONFIG_VALUE_0=` (empty), which git reads after every configuration file, so the empty helper resets every
  helper a system, global, repository or URL-scoped entry names; `GIT_TERMINAL_PROMPT=0`, so git fails instead of
  asking; `GH_CONFIG_DIR=<job folder>/gh-config`, a folder Limen does not create, so gh finds no login;
- in test mode only, (b): every test knob, the marker `LIMEN_TEST_MODE`, and the test harness's `NODE_OPTIONS`,
  `NODE_NO_WARNINGS`, `GIT_CONFIG_GLOBAL` and `GIT_CONFIG_NOSYSTEM`.
`engineEnvironment` stays the wrapper's environment without the wrapper's transport names and every `HERDR_*` name
(the five `PI_*` session names are no longer in it). `groupAdvanceEnvironment` and the tab closer are unchanged: they
run Limen's own code in the finisher's process, and every job the group advance starts passes through (a) again.

(b) Test mode. `LIMEN_TEST_MODE`, a registered name of kind `test`; test mode is on when it is `1` in the process's
own environment. `testKnob` returns `undefined` outside test mode, so every knob, among them `LIMEN_CGROUP`,
`LIMEN_CGROUP_ROOT`, `LIMEN_END_GATE` and `LIMEN_HOME`, is read only in test mode; `setTestKnob` turns test mode on
for its process. The tests turn it on through their helpers (`test/plant.ts`'s environment, `test/environment.ts`,
`fakeSystemd`), never through the gate's environment, so a single `node --test <file>` runs as in the gate;
`adrian-rebuild/tools/role-context.mjs` sets `LIMEN_TEST_MODE=1` beside its `LIMEN_HOME` and `LIMEN_HERDR`.
`limen status` is unchanged: a knob and the marker are not listed (`docs/commands.md:200` stays true).

(c) The prepare command (`src/runtime/job-setup.ts:48`) runs with the engine's environment: it is the project's code,
as the engine's tools are.

(d) What the list drops is written down: before the wrapper starts, the spawner appends one line to the job's log,
`environment: dropped <n> names of the spawner: <names>` (names sorted, never a value; no line when none is dropped),
so a project tool that needs a dropped name shows its cause, and step 3.10 has its evidence.

(e) Tests, each failing before the change:
- `test/config.test.ts`: the builders over a planted spawner environment that holds a token-shaped dummy name, an
  `SSH_AUTH_SOCK`, a `GIT_CONFIG_COUNT` of its own, a `PI_SESSION_ID`, `LIMEN_COORDINATOR`, `LIMEN_GITHUB_KEY_FILE`,
  `LIMEN_PACKAGE`, a knob and the user-bus names: the exact set of names the wrapper and the engine get, in and out of
  test mode; Limen's own values; the list applied to an engine's environment (a nested spawn) keeps `PATH`, `HOME`, the
  user bus and the crossing exceptions and drops the parent's transport; `testKnob` outside test mode returns nothing
  for a set knob. The tests that pinned the deny-list (`:300-369`) are rewritten.
- `test/fake-engine.mjs` records every name of its environment (names only, never values).
- `test/s1-spawn.test.ts`: a spawn from an environment that holds a dummy token name and `LIMEN_COORDINATOR` starts an
  engine whose names are exactly the list's (in the plant's test mode) and Limen's; the job's log names the dropped
  names; a repository whose own `.git/config` names a URL-scoped credential helper for `https://github.com` gives the
  engine's `git credential fill` no password, and it fails without asking.
- `test/runtime/job-setup.test.ts` (new, after its module, T-29 (1)): the prepare command gets no `HERDR_*` name and
  no wrapper transport name.
- `test/platform/linux.test.ts`: `ownCgroup` and `cgroupFolder` ignore `LIMEN_CGROUP` and `LIMEN_CGROUP_ROOT` outside
  test mode; `test/runtime/wrapper.test.ts`: `endGate` does not wait outside test mode.

(f) Text that becomes false: `SECURITY.md:5` ("read the same environment": a worker gets the allow-listed
environment, git and gh in a job hold no credential helper or login, and the account's credential files stay
readable by a job's process, G2's same-account accepted risk until stage 5); `docs/seat/agent-setup.md:135-137` (the
account's gh login and git helper serve the coordinator's `github review` fetch; a job does not see them); a new
paragraph in `docs/jobs.md` on a job's environment (the list, what Limen sets, the dropped-names line, test mode); the
comments `src/config.ts:5`, `:202`, `:237-240`, `:249-252`, `src/runtime/launcher.ts:117-122`,
`src/runtime/wrapper.ts:470-473`. Seat step 3.10 in `plan.md` → `## Deployment` already names the new checks (the
main session wrote it with this ticket).

## Out of scope

- `--approve`, `--offline` or `PI_OFFLINE`, a private `TMPDIR`, the bridge's isolated mode and the explicit Claude
  Code path (R-048), which add their names to the list; the B2c proxy's names (R-056, step 5.16).
- Root-owned code and the end of `LIMEN_PACKAGE` (R-049); the registered coordinator, its start script
  (`DISABLE_UPDATES` for the coordinator, no knob passed) and the end of `LIMEN_COORDINATOR`'s reading (R-050); the
  six `LIMEN_GITHUB_*` (R-059); `LIMEN_WORKER_MODEL` (R-062); `SECURITY.md` as a whole (R-081).
- The account's credential files (gh's, git's helper, Claude's, Pi's) stay readable by a job's process: an
  environment hides names and redirects git and gh, it does not change which files a process can open (G2's
  same-account accepted risk; D-012's window until a0.5.0, when R-055 moves the write token to the owner channel).
  `audit.md` → `## To verify` Q4 stays open.
- What the repository's own `.git/config` holds besides a helper (a remote URL with a credential in it is a seat
  fact, which step 3.10 does not print).
- A project setting for more names: none is known to be needed (`PATH` reaches the toolchains, fact 6), so a name a
  project's tool needs is a ticket that adds it to the list.
- A D-051 "after" run of B.2 that gives each attempt its own `LIMEN_HOME` sets `LIMEN_TEST_MODE=1` beside it; no tool
  sets that `LIMEN_HOME` today (`adrian-rebuild/tools/same-task.mjs` sets only exceptions, which it keeps).

## Acceptance

- AC-1: `node --test test/config.test.ts` → exit 0.
- AC-2: `node --test test/s1-spawn.test.ts` → exit 0; `node --test test/cli/continue.test.ts` → exit 0.
- AC-3: `node --test test/runtime/job-setup.test.ts` → exit 0; `node --test test/runtime/launcher.test.ts` → exit 0.
- AC-4: `node --test test/platform/linux.test.ts` → exit 0; `node --test test/runtime/wrapper.test.ts` → exit 0.
- AC-5: `node --test test/fake-engine.test.ts` → exit 0; `node --test test/structure.test.ts` → exit 0.
- AC-6: `node adrian-rebuild/tools/fails-before.mjs` → exit 0, its output in `outcome.md` → `## Fails before`.
- AC-7: `node adrian-rebuild/tools/gate.mjs` → exit 0.
- AC-8: `npx biome check --error-on-warnings .` → exit 0; `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-9 (judgment): a job's environment is built from the list alone, with no copy of the spawner's environment; the
  engine and the prepare command get no `HERDR_*` name, no wrapper transport name, no `LIMEN_COORDINATOR` and no poller
  name; git in a job has no credential helper from any configuration file and never asks; gh in a job reads an empty
  configuration folder; a test knob is read only in test mode; the docs state the boundary (the account's credential
  files stay readable by a job's process).

## Migration

None: no record, file, `spec/` or CLI format changes. A deployment runs with no job running (`## Deployment` 0.2), so
no live job meets the new list.

## Risk

- A name a project's tool reads (a toolchain or proxy name) is dropped and its check fails in a job; the dropped-names
  line names it, and step 3.10 runs each project's checks in a trial job before the projects resume (D-012).
- If the seat sets `CLAUDE_CONFIG_DIR` or `PI_CODING_AGENT_DIR`, Claude Code or Pi looks in the default folder and the
  trial job of step 3.10 fails at once, with the name in its dropped-names line.
- If `herdr status` needs a name outside `HERDR_*` to find its server, the end wake of a job stops; step 3.10 checks
  that the trial job's end wakes its coordinator.
- The user bus lets a job start user units (`systemd-run --user`), as today; T-42's guard is R-060's.

## Rollback

`git revert $(git log --format=%H --grep='^R-087:' adrian-rebuild --)`. No data to restore.

## Decisions

Settled by the documents when the ticket was written (2026-11-23, the main session's reading, not a night default;
the inventory's questions in `evidence/inventories/R-087.md` → section 8). Items 1, 2, 4 and 10 are named for
Adrian's attention at gate 5.3.
1. Where the list applies (question 1): at the job's start, once, so every process of the job's scope descends from
   it; the engine's step drops the wrapper's own names on top. The wrapper keeps `HERDR_*` because its end wake runs
   `herdr`, whose server resolution from the environment is a seat fact (step 3.10); the engine never had them
   (today's rule, kept). The group advance and the tab closer run Limen's own code outside the job (T1 is the job's
   environment), and the jobs the advance starts pass through the list.
2. The names (question 2): the fewest a job needs (KISS): Pi needs `PATH` and `HOME` (fact 6), the bridge and Claude
   Code `HOME` (E-4), a nested spawn the user bus (the R-026 note), the locale names change only tools' text, `TMPDIR`
   stays the spawner's until R-048 (D-005). `SHELL`, `TERM`, `NO_COLOR`, `XDG_CONFIG_HOME` and every token, `GIT_*`,
   `SSH_*` and `PI_*` name are dropped. Values pass unchanged; a declared `PATH` is R-049's (T-12). The list is a
   constant beside the registry in `src/config.ts` (T-25; T-03's check covers `LIMEN_*` names only, so the list's
   test is (e)).
3. The `LIMEN_` names (question 3): A-061 rules out `LIMEN_COORDINATOR`; the poller's six names have no reader in a
   job; the two exceptions a job's own commands read cross until their end tickets (D-052 (1)), since dropping them
   would change a team job's package or model, which D-012 ("without a change of scope") does not ask.
4. Test mode (questions 4, 5): T-03 requires that knobs are "read only in test mode" and the plan's notes ask R-087 to
   make it true; R-015's reading ("where a knob is passed") cannot hold once the list must pass knobs in tests and drop
   them on the seat. A marker is the one switch that needs no other ticket: option "ignored in the root-owned release"
   waits for R-049 (stage 5), and a `limen status` warning alone leaves the knobs read. Every knob is covered (T-03
   names no exception). Setting the marker on purpose is deliberate tampering (G2's accepted risk); by accident it
   takes two names, and a trial job's `env` in step 3.10 would show it. The name is T-03's words (T-18).
5. `ownCgroup`'s reading of `LIMEN_CGROUP` (question 5) closes here through (b); R-050 keeps the coordinator out of
   every job scope.
6. git (question 6): git's own configuration names, read after every file, with an empty `credential.helper`, which
   git documents as resetting the helper list; this keeps the account's identity and settings that workers' commits
   need (fact 3), covers a helper in the repository's `.git/config` too, and needs no file (KISS). A job's own git
   needs no remote (the coordinator fetches, `src/integrations/github-claims.ts:649-664`). `GIT_TERMINAL_PROMPT=0`
   makes the failure immediate (T-01).
7. gh (question 7): `GH_CONFIG_DIR` at a folder that does not exist, and the token names are not on the list; no job
   role uses gh (fact 3). Q4 stays To verify; the boundary is item 8.
8. The boundary (question 8): written in `SECURITY.md:5` and `docs/` in this change, because those sentences become
   false here; the rest of `SECURITY.md` is R-081's.
9. Step 3.10 (question 9): `git config --get credential.helper` misses a URL-scoped helper, so the step runs `git
   credential fill` for `https://github.com` and expects a failure with no password; `env` is compared with the list
   plus Limen's own names and those Pi and the bridge set on Pi's process (`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`,
   bridge evidence `:244`).
10. Dropped names (question 10): a log line with names only, not a refusal (a coordinator's pane may hold a token for
    its own use) and not silence (T-01: a tool that fails for a dropped name would otherwise show no cause); no record
    field (question 15: R-087 takes from R-021 only the job folder's layout; T-16's evidence is step 3.10's).
11. Nested jobs (question 11): (a) applies at every spawn, so a job's spawn goes through the list again; the unit test
    of (e) and step 3.10's `systemctl --user` check cover it (no real nested engine in the tests, T-31 (4)).
12. The fake engine (question 12) records every name, never a value.
13. The pinned tests (question 13) are rewritten in (e).
14. The neighbours (question 14) are `## Out of scope`; the docs of question 14 are (f).
15. Seat facts (question 16) are step 3.10: the trial job in each project reaches Claude and runs the project's
    checks, its end wakes its coordinator, `systemctl --user` answers inside it, and its log names what was dropped.
