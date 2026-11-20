<!-- PL: Ticket R-015 etapu 2 przebudowy (delegated): jeden moduł konfiguracji src/config.ts jest jedynym miejscem,
które czyta zmienne LIMEN_* ze środowiska, a rejestr nadaje każdej nazwie rodzaj (ustawienie, transport, przełącznik
testowy). Ustawienia przychodzą tylko z plików właściciela (limits.json, start-gate.json seata) lub ze stałych; zmienna
środowiskowa ich nie nadpisuje, poza wyjątkami z ticketem końcowym (D-052). limen status wypisuje ignorowane zmienne
ustawień, a środowisko wrappera i silnika buduje się z rejestru, co zamyka dwa wycieki. Stan: zamknięty po trzech
recenzjach PASS i dwóch rundach poprawek (zapisanych w Decisions), w commicie R-015. -->

# R-015 One configuration reader; settings come only from owner files

## Problem

At `9f247a5` Limen reads 48 `LIMEN_*` environment names in about 38 files of `src/`, `hook/` and `bin/`, with no
module that owns them and no list of their kinds (inventory by the main session, 2026-11-20; the table is in
`## Decisions` below). Three faults follow:
- An environment variable overrides the owner's file: `limitMs` in `src/project/limits.ts:12-19` ("a positive env
  var wins, then the plant's file, then `fallback`") for `prepare` and `toolStall`, and `startGate` in
  `src/runtime/start-queue.ts:46-54` (`LIMEN_START_GATE` "wins over `<seat>/start-gate.json`").
- Settings that affect agents exist only in the environment, so a job's or a coordinator's shell decides them:
  `LIMEN_MAX_TOOL_CALLS` (`src/runtime/wrapper.ts:38`), `LIMEN_PREPARE` (`src/commands/spawn.ts:361`),
  `LIMEN_PREFLIGHT` (`src/runtime/engine.ts:86`), `LIMEN_VIEW` (`src/commands/show.ts:14`), `LIMEN_WAKE`
  (`hook/wake.ts:821`), `LIMEN_PI` (`src/runtime/engine.ts:63`), and three waits with no setter anywhere
  (`LIMEN_HANDSHAKE_MS` `src/commands/spawn.ts:107`, `LIMEN_SEAT_RING_MS` `src/commands/sweep.ts:44`,
  `LIMEN_SEAT_NOTIFY_TIMEOUT_MS` `src/integrations/herdr.ts:102`).
- Transport names leak between processes, because the wrapper starts from the spawner's whole environment
  (`env: { ...process.env, ...environment }`, `src/runtime/wrapper.ts:47`) and the lists of names removed before the
  engine (`src/runtime/wrapper.ts:178-179`) and before a group advance (`JOB_ENVIRONMENT`,
  `src/job/group-cabinet.ts:301-318`) are hand-written:
  - a `LIMEN_TIMEOUT_MS` exported in a coordinator's shell becomes the time limit of every spawn without `--timeout`
    (spawn sets the variable only for `--timeout` or a group, `src/commands/spawn.ts:465-477`; the wrapper reads it at
    `src/runtime/wrapper.ts:124`);
  - `LIMEN_CONTINUE` is in neither list, so the engine of a continued job keeps `LIMEN_CONTINUE=1`, and a `limen
    spawn` started by that engine (a team member with a worker allowance) launches a wrapper that reads it
    (`src/runtime/wrapper.ts:168`) and passes the task text as the engine's continue value; found by reading, not
    reproduced.

Relied on:
- T-03 (`taste.md`): "Limen's names fall into three kinds. **Settings** (anything that affects agents or limits) come
  only from the owner files of the published copy (`limits.json`, `routes.json`) and from root-owned seat files; an
  environment variable never overrides them (z. 16). A setting that `limen init` asks for and that has no value makes
  the command refuse, naming the file and the field; there is no silent default. **Transport** between Limen's
  processes is environment set by Limen only, read as a location hint, never as a permission (A-061). **Test knobs**
  are read only in test mode; T1 and the coordinator start script do not pass them. Code constants serve only
  mechanics that Adrian does not configure, and they are generated into the docs (A-084)." Check: "one configuration
  module is the only reader of `process.env.LIMEN_*` (a script in `npm run check`); a registry lists every name with
  its kind; a test asserts that no name of the 'settings' kind is read from the environment, and a test asserts that
  a variable does not override a file."
- `plan.md` → `## Tickets` → notes → R-015: "from a0.2.0 the settings live in the project's
  `.agents/limen/limits.json`, which exists at `rebuild-base` with `prepare` and `toolStall` (`src/project/limits.ts:7`),
  and the environment no longer overrides them. `LIMEN_WORKER_MODEL` and `LIMEN_REVIEWER_MODEL` stay readable, as the
  only listed exceptions, until R-062 brings `routes.json`". `LIMEN_REVIEWER_MODEL` has no read site at `9f247a5`
  (`git grep` finds none), so only `LIMEN_WORKER_MODEL` is that exception.
- D-052 (Adrian, 2026-11-20; `plan.md` → `## Decisions`): the further exceptions, the place of each setting, and the
  seat fact that no `LIMEN_*` is set there. Quoted in `## Decisions` below.
- `plan.md` → `## Deployment` 2.4: "`limen status` lists the `LIMEN_*` settings variables it finds in the
  environment (R-015); remove them from the coordinator's environment, except the two route variables, which stay
  until 6.1."
- `## Stages` → conventions: from R-021 `record.json` changes additively; a scan that cannot hold at once starts as a
  ratchet (this one holds at once, so it is a plain scan); role prompt text changes in the ticket whose mechanism it
  describes (A-085).
- T-02: only the wrapper (`main`) sets the exit code; T-27: boundary data is parsed by validators (R-016 brings the
  shared module; this ticket parses `limits.json` and the seat gate file as today).

## Change

1. New `src/config.ts`, the only module of `src/`, `hook/`, `bin/` and `seat/` that reads `process.env` by a
   `LIMEN_*` name:
   - `ENVIRONMENT`: one entry per name in the table of `## Decisions`, with its kind (`transport`, `test`,
     `exception`) and one line saying what it carries; an `exception` entry names the ticket that ends it (`until`).
     For `transport`, the entry also says who reads it: `wrapper` (removed before the engine starts) or `engine` (kept
     for the hooks). Settings that are no longer read are listed with kind `removed` and the place that replaces them
     (`limits.json` → field, the seat file, a flag, a constant, or nothing), so that `limen status` can name them.
   - Typed readers: `transport(name)`, `testKnob(name)`, `exception(name)`; each accepts only names of its kind (a
     TypeScript union derived from `ENVIRONMENT`) and throws a plain `Error` for any other name at run time.
     No reader returns a `removed` name's value.
   - `wrapperEnvironment(values)`: the environment of a new wrapper, built as `process.env` without every
     `transport` and `removed` name, plus the `values` the spawner passes (each key must be a `transport` name).
   - `engineEnvironment(base, values)`: the engine's environment, built from the wrapper's without every `transport`
     name whose reader is `wrapper` (and without the non-`LIMEN_` names that `src/runtime/wrapper.ts:179` and `:184-188`
     remove today), plus `values`.
   - `groupAdvanceEnvironment()`: `process.env` without every `transport` name (and the non-`LIMEN_` names of
     `JOB_ENVIRONMENT` today), replacing the hand-written list in `src/job/group-cabinet.ts:301-318`.
   - `ignoredSettings(env = process.env)`: every `LIMEN_*` name present in `env` whose kind is `removed`, or that is
     not in `ENVIRONMENT` at all, each with its replacement; and every `exception` name present, with its `until`.
2. Every read of `process.env.LIMEN_*` in `src/`, `hook/` and `bin/` goes through `src/config.ts`; every place that
   writes a `LIMEN_*` name into a child's environment uses the builders of item 1 (spawn, continue, the wrapper's
   engine environment, the group advance). `LIMEN_ROLE` leaves `JOB_ENVIRONMENT` (nothing sets or reads it), and the
   wrapper stops exporting `LIMEN_JOB_LABEL` (no reader in code, docs or tests).
3. Settings by D-052:
   - `src/project/limits.ts`: `limitMs` reads only `.agents/limen/limits.json` and the fallback; the environment no
     longer wins. `limits.json` gains the optional field `toolCalls` (a positive integer, the tool-start cap of a job;
     no file or no field keeps 900); its ignored-entry messages name it among the limits. The wrapper's cap comes from
     it (`src/runtime/wrapper.ts:37-38`).
   - `src/runtime/start-queue.ts`: `startGate` reads only `<seat>/start-gate.json` and the defaults; the file must be
     able to say everything the variable could, so it also accepts `"off"` (the JSON string) for a gate that is off.
   - `LIMEN_PREPARE`, `LIMEN_PREFLIGHT`, `LIMEN_VIEW`, `LIMEN_WAKE` and `LIMEN_PI` are no longer read: a spawn without
     `--prepare` runs no prepare command; spawn and continue run no `pi auth check`; `limen show` picks the view from
     the terminal (`src/job/view.ts:39-44`); the wake hook always sets up; the engine binary is `pi` on `PATH`
     (`binaryEnv` leaves the engine profile).
   - `LIMEN_HANDSHAKE_MS`, `LIMEN_SEAT_RING_MS` and `LIMEN_SEAT_NOTIFY_TIMEOUT_MS` become constants with today's
     defaults (10 s, 5 min, 2 s); a test that needs a shorter handshake uses a `test` knob only if one is needed, and
     then the knob is registered.
4. `limen status` prints, after the leftover lines, one section when `ignoredSettings()` is not empty:
   `Environment settings Limen no longer reads (<n>); remove them:` with one line per name and its replacement, and
   `Environment variables read until a ticket replaces them (<n>):` with one line per exception present and its
   `until`. Nothing is printed when neither is present.
5. Tests, written first (each fails before its change, except where `outcome.md` says why not):
   - new `test/config.test.ts`:
     - the static scan: no file of `src/`, `hook/`, `bin/` or `seat/` other than `src/config.ts` contains
       `process.env.LIMEN_`, `process.env[` (a computed read), or a destructuring of `process.env`; and every
       `LIMEN_[A-Z0-9_]+` token in those folders is a name of `ENVIRONMENT`; the scan reads only the files git knows
       that exist in the working tree (as `knownFiles` in `test/structure.test.ts`), and a fixture shows that it
       catches each of the three read forms and an unregistered name;
     - every `removed` name, set in the environment, changes nothing a reader returns (each reader refuses it);
     - `ignoredSettings` lists a `removed` name, an unknown `LIMEN_*` name and an `exception` name, and nothing for
       `transport` or `test` names;
     - `wrapperEnvironment` drops a `LIMEN_TIMEOUT_MS` and a `LIMEN_CONTINUE` of the spawner's environment, and keeps
       a value the spawner passes; `engineEnvironment` drops every `wrapper` transport name, `LIMEN_CONTINUE` included,
       and keeps `LIMEN_JOB_ID` and `LIMEN_CONTEXT_ROOT`;
   - a test (in the test file of the module that reads it) that `LIMEN_TOOL_STALL_MS`, `LIMEN_PREPARE_MS` and
     `LIMEN_MAX_TOOL_CALLS` set in the environment do not override `limits.json` (`toolStall`, `prepare`, `toolCalls`),
     and that `LIMEN_START_GATE` does not override `start-gate.json`;
   - a fake-engine test: a spawn without `--timeout`, from an environment that holds `LIMEN_TIMEOUT_MS=1000`, starts
     a job whose limit is the default (the record or the log shows it), and a job continued with `limen continue`
     starts an engine whose environment holds no `LIMEN_CONTINUE`;
   - `test/cli/status.test.ts`: `limen status` with `LIMEN_PREPARE` and `LIMEN_WORKER_MODEL` in its environment prints
     both sections; with neither, prints neither.
   - Every test that sets a `removed` name today sets the file instead: `test/plant.ts` writes `{"settle":"1ms"}` to
     `<LIMEN_HOME>/.limen/start-gate.json` in place of `LIMEN_START_GATE`; `test/s3-finish-wake.test.ts` writes
     `limits.json` in place of `LIMEN_MAX_TOOL_CALLS` and `LIMEN_PREPARE_MS`.
6. Docs and role text, in the same change (A-085): `docs/jobs.md` (the limits table, "Plant limits", the start-gate
   values), `docs/commands.md:187` (`LIMEN_VIEW`), `docs/setup.md` (`LIMEN_PREFLIGHT`, the package fallbacks sentence
   at `:90`), `templates/agents.md:105` (`LIMEN_PREPARE`), and the comments of the changed functions say what reads
   the setting now; `src/commands/show.ts:10` drops `LIMEN_VIEW`.

No file is deleted or moved; no file of `adrian-rebuild/tools/` changes.

## Out of scope

- `routes.json`, `limen init` asking for settings, and a refusal when a setting has no value (R-062); until then the
  defaults stay.
- The job environment as an allow-list and the credentials of git and gh in a job (R-087, T1); the coordinator start
  script (R-050). This ticket changes only which `LIMEN_*` names cross between Limen's processes.
- The exceptions' replacements: the registered coordinator (R-050), root-owned code and the package path (R-049), the
  seat tooling of the GitHub poller (R-059), routes (R-062).
- `templates/limen-extension.ts`, the project stub copied into projects, keeps reading `LIMEN_PACKAGE` to find the
  package before any of its code is loaded (R-049); the scan does not cover `templates/`.
- `docs/seat/*.ts` (the seat extensions, moved and checked by R-059) and non-`LIMEN_` names (`HERDR_*`, `PI_*`,
  `PATH`, `NO_COLOR`, `TERM`, `USER`).
- The shared boundary parsing module (R-016); `limits.json` and `start-gate.json` keep their parsers.

## Acceptance

- AC-1: `node --test test/config.test.ts` → exit 0.
- AC-2: `node --test test/cli/status.test.ts` → exit 0.
- AC-3: `git grep --untracked -l -E 'process\.env(\.LIMEN_|\[)' -- src hook bin seat` → exit 0, and its only line
  is `src/config.ts` (36 files at `9f247a5`).
- AC-4: `node adrian-rebuild/tools/fails-before.mjs` → exit 0; `outcome.md` → `## Fails before` holds its output.
- AC-5: `node adrian-rebuild/tools/gate.mjs` → exit 0 with `fail 0`.
- AC-6: `npx tsc --noEmit` → exit 0; `npx biome check --error-on-warnings .` → exit 0.
- AC-7: `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-8 (judgment): every name of the inventory table in `## Decisions` is in `ENVIRONMENT` with the kind that table
  gives; no `transport` name is read as a permission that it did not already grant at `9f247a5` (the exceptions keep
  their uses until their tickets); every doc and role-text sentence that named a `removed` name says what replaces it.

## Migration

- The environment: no `LIMEN_*` setting is set on the seat (D-052 (2)); a variable set anywhere else is ignored and
  named by `limen status` with its replacement (step 2.4), tested on a fixture (Change 5, `test/cli/status.test.ts`).
- `limits.json` gains one optional field; an existing file with `prepare` and `toolStall` reads the same (a test on a
  fixture file of the `rebuild-base` form). `start-gate.json` gains the value `"off"`; existing files read the same.
- No CLI form changes; no record, `spec/` or hook-loading change.

## Risk

- A setting that some environment did set (a Herdr pane's environment, a systemd unit) silently stops applying until
  step 2.4 lists it: `limen status` names it, and the seat had none in the login shell (D-052 (2)).
- Building the engine's environment from the registry could drop a name a hook still needs: the `engine` readers in
  the table are the names the hooks read at `9f247a5`, and the fake-engine tests of the hooks run through the gate.
- A wide mechanical change (about 38 files): the gate and the static scan carry it.

## Rollback

`git revert $(git log --format=%H --grep='^R-015:' adrian-rebuild --)`; no reverse migration (`limits.json` with
`toolCalls` is ignored by the old code, which reports the key as not a limit).

## Decisions

- 2026-11-20 D-052 (Adrian, the answers "1. A" and "3. A" to the main session's questions, and the seat output of
  "2."; recorded in `plan.md` → `## Decisions`):
  1. Exceptions besides `LIMEN_WORKER_MODEL` (until R-062): `LIMEN_COORDINATOR` (until R-050, the registered
     coordinator), `LIMEN_GITHUB_APP_ID`, `LIMEN_GITHUB_KEY_FILE`, `LIMEN_GITHUB_LIMEN_BIN`,
     `LIMEN_GITHUB_PROJECTS_FILE`, `LIMEN_GITHUB_STATE_DIR`, `LIMEN_GITHUB_WORKER_UID` (until R-059, which rewrites
     `docs/seat/github-setup.sh`, the writer of the poller's root-owned environment file; the seat runs no poller),
     and `LIMEN_PACKAGE` (until R-049). `limen status` shows each as read until its ticket.
  2. On the seat, neither `~/.bashrc` nor `~/.profile` of the agents' account sets a `LIMEN_*` name, and a login
     shell's environment holds none (Adrian's output, 2026-11-20). The Herdr pane's environment was not checked;
     step 2.4 covers it.
  3. The place of each setting: `limits.json` for `prepare` and `toolStall` (as today, without the environment) and
     the new `toolCalls`; the seat's `start-gate.json` alone for the start gate; `LIMEN_PREPARE`, `LIMEN_PREFLIGHT`,
     `LIMEN_VIEW`, `LIMEN_WAKE` and `LIMEN_PI` are no longer read; `LIMEN_HANDSHAKE_MS`, `LIMEN_SEAT_RING_MS` and
     `LIMEN_SEAT_NOTIFY_TIMEOUT_MS` become constants; `LIMEN_HOME`, `LIMEN_HERDR`, `LIMEN_HUNK`,
     `LIMEN_REAP_CONFIRM_MS`, `LIMEN_START_POLL_MS`, `LIMEN_START_READING` and `LIMEN_WAKE_FALLBACK_MS` are test
     knobs.
- 2026-11-20 (main session, open to change at gate 5.2): "test mode" in T-03 is read as "where a knob is passed":
  `testKnob` reads a knob wherever it is set, and the guarantee is that T1 (R-087) and the coordinator start script
  (R-050) do not pass them; no `LIMEN_TEST` variable is added. The leak of `LIMEN_TIMEOUT_MS` and `LIMEN_CONTINUE` is
  closed here because it is the "set by Limen only" half of T-03.
- The inventory (main session, 2026-11-20, at `9f247a5`; `R` = read in the wrapper, `E` = read by the engine's hooks
  or the CLI inside a job):

  | Kind | Names |
  |---|---|
  | transport, wrapper | `LIMEN_INTERNAL_RUN`, `LIMEN_JOB_DIR`, `LIMEN_WORKTREE`, `LIMEN_TASK_FILE`, `LIMEN_PREAMBLE`, `LIMEN_TIMEOUT_MS`, `LIMEN_MODEL`, `LIMEN_PROVIDER`, `LIMEN_THINKING`, `LIMEN_LABEL`, `LIMEN_SETUP_KEEP`, `LIMEN_SETUP_PREPARE`, `LIMEN_CONTINUE` |
  | transport, engine | `LIMEN_JOB`, `LIMEN_JOB_ID`, `LIMEN_CONTEXT_ROOT`, `LIMEN_GROUP_ID`, `LIMEN_TEAM_ID` |
  | test | `LIMEN_HOME`, `LIMEN_HERDR`, `LIMEN_HUNK`, `LIMEN_REAP_CONFIRM_MS`, `LIMEN_START_POLL_MS`, `LIMEN_START_READING`, `LIMEN_WAKE_FALLBACK_MS` |
  | exception | `LIMEN_WORKER_MODEL` (R-062), `LIMEN_COORDINATOR` (R-050), the six `LIMEN_GITHUB_*` (R-059), `LIMEN_PACKAGE` (R-049) |
  | removed | `LIMEN_PREPARE_MS` → `limits.json` `prepare`; `LIMEN_TOOL_STALL_MS` → `toolStall`; `LIMEN_MAX_TOOL_CALLS` → `toolCalls`; `LIMEN_START_GATE` → `<seat>/start-gate.json`; `LIMEN_PREPARE` → `--prepare`; `LIMEN_PREFLIGHT` → nothing; `LIMEN_VIEW` → the terminal; `LIMEN_WAKE` → nothing; `LIMEN_PI` → `pi` on `PATH`; `LIMEN_HANDSHAKE_MS`, `LIMEN_SEAT_RING_MS`, `LIMEN_SEAT_NOTIFY_TIMEOUT_MS` → constants; `LIMEN_JOB_LABEL`, `LIMEN_ROLE` → nothing (never read) |

  The implementer checks each `engine` name against the hooks and the commands a job runs; a name the table puts in
  the wrong row is a `BLOCKED` question, not a silent move.
- 2026-11-20 (main session, review round 1, PASS with eight notes; `review.md` → Round 1). Fixes for the resumed
  implementer; each fix of a test makes it fail at `HEAD` for the reason its name states:
  1. Finding 1: the s3 test checks one mechanism, the tool cap of `limits.json` (`toolCalls`); its prepare half goes,
     and its name says only the cap (the file's `prepare` is shown by the first s3 test and by
     `test/project/limits.test.ts`).
  2. Finding 2: `test/cli/spawn.test.ts` shows the leak itself: a job spawned without `--timeout` from an environment
     holding `LIMEN_TIMEOUT_MS=1000` is still running after a wait longer than 1 s (bounded by T-28's short waits),
     then is stopped; at `HEAD` it fails because the job ends `failed` with `timeout after 1000ms`. The start line's
     time limit (deviation 3) may stay, but no test depends on it alone.
  3. Finding 3: `outcome.md` → `## Fails before` names each new test that passes at `HEAD` and why (a guard of the
     migration or of a case that `HEAD` already got right: the `rebuild-base` form of `limits.json`, the defaults and
     the object form of `start-gate.json`, `limen status` with neither section, and any other).
  4. Finding 4: one `withEnvironment` test helper, in one module that both test files import, which restores each
     name to the value it held before (or deletes it when it held none).
  5. Finding 5: `docs/jobs.md:161` names the seat folder as `~/.limen` of the agents' account, as the registry's
     replacement text does (`src/config.ts:107`); the same for open point 3 of the outcome, which then goes.
  6. Finding 7 (rejected) leaves the code as it is; the outcome's open point 1 cites `src/commands/rule.ts:136`.
  Findings 6 (fixed by the main session in `plan.md`) and 8 (rejected) need nothing from the implementer.
- 2026-11-20 (main session, review round 2, PASS with four notes; `review.md` → Round 2). The second and last round of
  fixes, for the resumed implementer:
  1. Finding 1: every sentence of `docs/` that names the seat folder as `$LIMEN_HOME/.limen/…` (at least
     `docs/jobs.md:154` and `docs/commands.md:253`) names it as `~/.limen/…` of the agents' account, as
     `docs/jobs.md:161` does now.
  2. Finding 2: a test of `setTestKnob` in `test/config.test.ts`: it sets a test knob that `testKnob` then reads, and
     it throws for a name of any other kind, leaving the environment unchanged.
  3. Finding 3: `outcome.md` → `## Fails before` shows the current tests first; the first draft's runs, if kept, sit
     under a heading that says they were superseded by review round 1 and name the tests they belonged to.
  4. Finding 4: the deviations are numbered in order.
