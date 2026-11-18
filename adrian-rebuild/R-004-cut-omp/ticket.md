<!-- PL: Ticket R-004 etapu 1 przebudowy: wycięcie silnika OMP (Oh My Pi, `--engine omp`) zgodnie z decyzją bramki 2
G1.7 i A-049. Zostaje jeden silnik, Pi; `--engine omp` i `LIMEN_ENGINE=omp` odmawiają jednym wierszem z tabeli
starych nazw, plik `.omp/extensions/limen.ts` w projektach trafia do rejestru plików pozostałych, a dokumentacja,
w tym runbook seata, mówi tylko o Pi (decyzja Adriana z 18.11: wariant a). Stan: zamknięty (18.11). -->

# R-004 Cut the OMP engine

## Problem

Gate 2 cut OMP (Oh My Pi), the second engine beside Pi. It still runs through the engine table
(`src/runtime/engine.ts`: the `omp` profile, OMP's skill configuration with `omp config get`, its bridge route and
bridge path), the launch paths (`wrapper.ts`, `supervisor.ts`), the bash-call counter (OMP's persistent shell in
`src/job/session-commands.ts`), the two job hooks (OMP's multi-file edit, its `path:N-M` read selector and its
`session_stop` event in `hook/communication.ts` and `hook/finish.ts`), the activity model parse, `limen init` (which
copies the extension stub into `.omp/extensions/limen.ts`), the docs and the seat runbook, which still installs OMP
and sets `LIMEN_ENGINE=omp`. The seat runs Pi.

Relied on:
- G1.7 (gate 2): "OMP | cut".
- A-049, Decision: "fix (via G1) — Devin, OMP, finish webhooks, Linear cut; doorbell and groups deliberately kept as
  modules off by default".
- D-004 (gate 2, §8): "Pi on the seat is 1.5.1, not 1.2.0 (bridge `@vanillagreen/pi-claude-bridge` 5.0.3)."
- `plan.md` → `## Stages`, stage 1: "cut commands refuse with a pointer, and `limen status` lists the leftover files of
  cut features"; conventions: "a CLI change makes the old form exit with code 2 and name the new form in `next` (…;
  before R-013, a non-zero exit with the replacement in the message)".
- T-18, Migration: "an old name exits with code 2 (T-02) and names the new one in `next`; a ticket in the last stage of
  the plan removes the table of old names" (R-085). R-003 → `ticket.md` → `## Decisions`: "the refusal of a removed
  engine value lives in the old-name table beside the removed commands (`OLD_ENGINES`, `removedEngine`), so R-085
  removes one file and R-004 adds `omp` in the same place". `engineProfile` and `resolveSpawnEngine` already throw
  `removedEngine`'s line before their generic error (`src/runtime/engine.ts:57-69`), and `limen continue` checks the
  recorded engine through `engineProfile` before the transcript (`src/commands/continue.ts:349-350`).
- `plan.md` → `## Tickets`, notes, R-001: "every cut ticket registers the leftover paths of its feature";
  `src/project/leftovers.ts`: `LEFTOVERS` entries are relative, normalised, outside `.git/`, and overlap no other entry
  and no `TRACKED` path (`test/project/leftovers.test.ts`).
- D-025: a criterion checks only the ticket's scope, as an exit code; a scan over the tree is this ticket's own only
  when every match it finds at the parent is one the ticket removes (checked at `HEAD` = `77cc40b` for AC-2: 42 files,
  each named in items 1–9 below; `src/project/inherit.ts` is excluded, see Out of scope).
- D-029: a test that fails even once without a change of the code it runs is a finding; nobody runs it again for a
  green gate.
- The seat runbook (Adrian, 2026-11-18, `## Decisions`): variant (a), Pi equivalents only where the repo or the
  vendor's docs already state them.

## Change

1. Delete with `git rm`: `.omp/extensions/limen.ts` (the repository's own copy of the stub, 26 lines, the same bytes
   as `templates/limen-extension.ts`).
2. `src/runtime/engine.ts`:
   - `EngineId` is `"pi"`, `binaryEnv` is `"LIMEN_PI"`; the `omp` profile (`:45-55`) goes.
   - `engineProfile` and `resolveSpawnEngine` accept `pi`; for any other value they throw `removedEngine`'s line when
     the table holds it, else their generic error, which reads `--engine must be pi` (`:58`, `:65`, `:68`).
   - The OMP `pi-claude` provider refusal (`:82-87`) goes; the bridge-home text keeps only Pi's (`:89-92`); the
     missing-binary error reads `pi is not on PATH; install it` (`:97`, no more `or pass --engine omp`).
   - OMP's skill configuration goes: `LegacySkill`, `legacySkill` (with its `.omp/skills` check), `prepareSkillConfig`
     (which runs `omp config get`), the `skillConfig` slot and its `--config` argument (`:22`, `:118-214`, `:234-236`).
   - The `profile.id === "pi" &&` guards of the realpath dedupe (`:247-248`) become unconditional; `engineRoute`
     (`:273-291`) loses its OMP rewrite and comment; `bridgePath` (`:293-304`) loses the `~/.omp/local/…` candidate.
   - Every import, helper, constant or type that only the removed code used.
3. Launch paths: `src/runtime/wrapper.ts` (`:23`, `:156`, `:160`) and `src/runtime/supervisor.ts` (`:29`, `:355`,
   `:367`) lose the `prepareSkillConfig` import and the `skillConfig` lines; `src/runtime/worker-extensions.ts` loses
   the "supported only for Pi workers" refusal (`:12-14`) and its `engine` parameter, and every caller drops the
   argument (`spawn.ts:174`, `continue.ts:212` and `:381`, `group.ts:313`, `worker-extensions.ts:43`,
   `supervisor.ts:378`, `wrapper.ts:168`).
4. `src/job/session-commands.ts`: OMP's persistent shell goes (`KEPT` `:25-26`, the `omp` flag and `held` `:47-54`,
   `keptWord` `:146-152`); `firstWord` stays (`chainWhy` uses it); the comment at `:43` names Pi only.
5. Hooks:
   - `hook/communication.ts`: the multi-file `paths` edit form (`:381-388`) goes, so an edit names one `path`; the
     `:selector` capture of the read regex (`:448`), the OMP selector comment and parse (`:466-469`, `:482-487`) and
     `lineRange` (`:489-504`) go. Pi's `offset`/`limit` (`:477-481`) and the `file_path` shape (`:409`) stay.
   - `hook/finish.ts`: the `session_stop` overload, its handler (`:93-96`), `StopEvent` and the
     `assistantStopReason` import go; the comment (`:27-35`) names Pi's `agent_before_settle` only and drops
     `xd://finish`.
6. Other code:
   - `src/picture/activity.ts:411-427`: the OMP `model: "provider/id"` form goes; Pi's `provider`/`modelId` stays.
   - `src/project/picture-watch.ts:12`: `KEEP` drops `OMP|`.
   - `src/commands/init.ts`: the copy into `.omp/extensions/limen.ts` (`:77`) and the two legacy
     `.omp/extensions/control-*.ts` refusals (`:41-42`) go; the `.pi` ones stay.
   - `src/main.ts`: help lines name `--engine pi` (`:114`) and drop "Pi only" qualifiers that contrasted Pi with OMP.
   - Comments that give OMP as the reason for generic code are reworded to the reason that remains, a coordinator or
     lead without a Pi session (`PI_SESSION_ID` unset), without changing the code: `src/commands/spawn.ts:804-806`,
     `src/commands/watch.ts:7`, `src/job/group-cabinet.ts:206`, `src/job/wake-text.ts:51` and `:95`,
     `src/integrations/github-review.ts:79` (Herdr can omit `interactive_ready`), `src/runtime/hosted-binding.ts:35`.
7. `src/old-names.ts`: `OLD_ENGINES` gets `{ name: "omp", feature: "the OMP engine", ticket: "R-004", instead: "use
   --engine pi" }`. `src/project/leftovers.ts`: `LEFTOVERS` gets `.omp/extensions/limen.ts` with the feature `the OMP
   engine (R-004)` (not `.omp/` or `.omp/extensions/`: a project may keep its own files there).
8. Docs and templates say nothing of OMP and nothing the code does not do: `README.md`, `CONTRIBUTING.md`,
   `SECURITY.md`, `docs/commands.md`, `docs/groups.md`, `docs/herdr-status.md`, `docs/jobs.md`, `docs/picture.md`,
   `docs/remote.md`, `docs/setup.md` (with `herdr integration install omp` and the OMP skill view),
   `docs/seat/README.md`, `templates/agents.md` (`:95`, `:105`, `:188`) and `templates/worker.md:9`, with
   `templates/.history/agents.md` and `templates/.history/worker.md` brought in line as `test/structure.test.ts` requires (written with Edit or Write,
   D-016). The seat runbook `docs/seat/agent-setup.md`, variant (a):
   - the worker-owned OMP install with its checksums, the `LIMEN_ENGINE=omp` line and "Do not install omp as root"
     (`:109`, `:133-148`) become one check: worker$ `pi --version` prints `1.5.1`, **STOP** if not; no install
     procedure is added, because the repository has none;
   - `MODEL_FLAGS` (`:35`) names Pi's flags; the login step (`:149`) starts `pi`; `limen init`'s list (`:161`) drops
     `.omp/extensions/limen.ts`; `moshi-hook install --target omp` (`:181`) becomes `moshi-hook install` (Moshi's
     docs: one install covers Pi; the hook lands in `~/.pi/agent/extensions/moshi-hooks.ts`); `herdr integration
     install omp` (`:189`) becomes `herdr integration install pi` (as `docs/setup.md` has it); the coordinator starts
     with `pi $MODEL_FLAGS` (`:190`, `:247`); the live-coordinator rule (`:192`) says Herdr can omit
     `interactive_ready`, without OMP; the smoke test (`:215`) spawns without `--engine`.
9. Tests:
   - `test/s2-hosted.test.ts`: the tests at `:121` (a live OMP job, `--kind omp`) and `:138` (competing sweeps, which
     reuses that OMP job) go: both are hosted, which R-005 cuts next, and no deployment happens between the two
     tickets (a0.1.0 is deployed at the close of stage 1).
   - Cases go: `test/s1-spawn.test.ts:49-50`; `test/group-extensions.test.ts:158-161` (the test at `:144` is renamed);
     `test/u5-engine-stream.test.ts:19-21` (the test at `:10` is renamed); `test/u11-live-activity.test.ts:97-99`, and
     the default `engine` at `:26` becomes `pi`; `test/s4-steering.test.ts:47` and `:95`; the `session_stop` half of
     `test/u14-task-note.test.ts:59`. `test/u13-guidance-reminder.test.ts:26-27` uses Pi's forms (one `path`; `offset:
     1, limit: 10`), so the assertions after them keep their meaning.
   - `--engine omp` becomes Pi where a test only passed through it: `test/s6-keeper.test.ts:12`,
     `test/s8-groups.test.ts:31-32` and `:193` (`ROUTE` and `TEAM` together), `test/s10-doorbell.test.ts:150`.
   - Fixtures: `test/plant.ts` (`:2`, the `omp` symlink at `:58`), `test/fake-engine.mjs` (`:2`, the `config`
     subcommand at `:17-19`), `test/structure.test.ts:14` (the `.omp` exclusion).
   - New tests, written first and failing at `HEAD`: `test/cli/old-names.test.ts`: `limen spawn --engine omp work` and
     `limen spawn work` with `LIMEN_ENGINE=omp` exit non-zero with `engine omp was removed with the OMP engine (R-004);
     use --engine pi` on stderr and no job folder (the existing Devin test may run over every `OLD_ENGINES` entry);
     `test/cli/continue.test.ts`: `limen continue` of a finished job whose `engine` file holds `omp` refuses with that
     line and starts no job; `test/cli/status.test.ts`: a project with `.omp/extensions/limen.ts` lists it under
     `Leftover files` with `(the OMP engine (R-004))`; `test/cli/init.test.ts`: `limen init` writes
     `.pi/extensions/limen.ts` and no `.omp/`.

## Out of scope

- `HOOK_COPIES` in `src/project/inherit.ts:27-29` (old `.omp/extensions/limen-{wake,communication,steering}.ts` hook
  copies that `limen init` already removes): unchanged, so `limen init` keeps removing them; AC-2 excludes the file.
- Hosted jobs (R-005): the hosted code keeps its Pi path; only the lines items 3 and 6 name change there. A hosted OMP
  job still running at deployment would hit `removedEngine` in recovery and the supervisor; nothing on the seat runs
  OMP (D-004).
- The Herdr pane wake route (`herdrWakePane`, `coordinator-wake.ts`) and the lead's ancestor walk
  (`group-cabinet.ts:206-229`): generic routes for a coordinator or lead without `PI_SESSION_ID`; every group lead and
  a plain Herdr shell take the first today (`group.ts:323`, `test/s2-hosted.test.ts:157`). Only their comments change.
- `hook/group-peer.ts:123-132` (blocks `task` and `before_subagent_spawn`): it also guards extension-added subagents.
- Job records an OMP job wrote (`skills/`, `skills-config.yml` in its job folder): part of a job's record (R-021).
- `adrian-rebuild/tools/context-size.mjs:20` (the `.omp` area, for measuring old refs).
- Typing the refusals (`LimenError`, code 2, `next`): R-013. Removing `--engine` itself: R-014 sets the CLI with Adrian.

## Acceptance

- AC-1: `git ls-files -- .omp/extensions/limen.ts | grep -q .` → exit 1.
- AC-2: `git grep -q -i -E '\bomp\b|oh-my-pi|LIMEN_OMP|\.omp/' -- src hook bin templates test docs README.md
  CONTRIBUTING.md SECURITY.md package.json .gitignore ':!src/old-names.ts' ':!src/project/leftovers.ts'
  ':!src/project/inherit.ts' ':!test/cli/old-names.test.ts' ':!test/cli/continue.test.ts' ':!test/cli/status.test.ts'
  ':!test/cli/init.test.ts'` → exit 1. At `HEAD` every file it matches is one this ticket changes (D-025).
- AC-3: `git grep -q -E 'prepareSkillConfig|legacySkill|skillConfig|keptWord|lineRange|session_stop' -- src hook test
  bin` → exit 1. At `HEAD` it matches only files of items 2–5 and 9.
- AC-4: `node --test test/cli/old-names.test.ts` → exit 0.
- AC-5: `node --test test/project/leftovers.test.ts` → exit 0.
- AC-6: `node adrian-rebuild/tools/fails-before.mjs` → exit 0: the new and changed test files fail at `HEAD`; the
  outcome names each changed file that passes at `HEAD` alone and why.
- AC-7: `node adrian-rebuild/tools/gate.mjs` → exit 0 with `fail 0`; the outcome names every test removed with the cut
  and the count before and after.
- AC-8: `node adrian-rebuild/tools/check.mjs` → exit 0; `npx biome check --error-on-warnings adrian-rebuild` → exit 0.
- AC-9 (judgment): a Pi spawn, continue, steer, stop, group launch, `--extension`, the guidance reminders and the
  task-note check behave as at `HEAD`: every removed branch was taken only for `omp`, and no remaining condition
  changed for `pi`.
- AC-10 (judgment): the docs and templates of item 8 say nothing of OMP and nothing the code does not do; the seat
  runbook adds no step that the repository or the vendor's docs do not state.

## Migration

- On disk: `.omp/extensions/limen.ts` in each project becomes a leftover file; `limen status` lists it and `limen init
  --drop-leftovers` removes it (R-001's mechanism; the status test of item 9). An empty `.omp/extensions/` stays.
- CLI: `--engine omp` and `LIMEN_ENGINE=omp` refuse with the line of item 7; `limen continue` of an OMP record refuses
  with it (tests of item 9). Picture-watch hooks installed with `--engine omp` in their flags would refuse at each tick.
- On the seat (Adrian, before a0.1.0 is deployed): `grep -n LIMEN_ENGINE ~/.bashrc` on the worker account; a line
  `export LIMEN_ENGINE=omp` (which the runbook at `HEAD` writes, `docs/seat/agent-setup.md:146`) is removed, or every
  spawn without `--engine` refuses. The outcome names it.

## Risk

- `hook/finish.ts`: if Pi 1.5.1 also fired `session_stop`, removing the handler drops only a second route to the same
  check, which is asked once per job (`check`), and `agent_before_settle` stays. The repository's only source for
  Pi's events is the hook's own comment (`hook/finish.ts:33-34`); `evidence/engine-sources/pi-1.5.1.md` does not list
  them. B.2's seat check can confirm.
- `hook/communication.ts`: if Pi's edit tool ever sent `paths` or a read sent `path:N-M`, a reminder would name one file
  or miss a range; the hook's comments (`:381`, `:467`) are the source that Pi uses `path`, `offset` and `limit`.
- A removed import or helper that another module still needs breaks the build; the gate's `tsc --noEmit` catches it
  (`tsc` checks `test/` too, with `noUnusedParameters`).
- Moving s6, s8 and s10 from `--engine omp` to Pi brings Pi's argv (`--approve`, `--name`) into them; the gate runs
  them.
- The seat runbook's engine install is now a check without a procedure; Pi's root-owned install is deployment step 5.3
  (D-017).

## Rollback

`git revert $(git log --format=%H --grep='^R-004:' adrian-rebuild --)`; the leftover file is not removed until Adrian
runs `limen init --drop-leftovers`.

## Decisions

- 2026-11-18 (Adrian): the seat runbook follows variant (a): every OMP step goes, Pi equivalents only where the
  repository or the vendor's docs state them (`herdr integration install pi`, `pi $MODEL_FLAGS`, `moshi-hook
  install` without `--target`), and the OMP install becomes the check `pi --version`. Whether the seat's `~/.bashrc`
  sets `LIMEN_ENGINE=omp` and which Moshi target the seat uses, Adrian checks on the seat (Migration).
- 2026-11-18 (main session): the hosted tests at `test/s2-hosted.test.ts:121` and `:138` go here rather than move to
  Pi, because a hosted Pi job switches on pane binding they never ran with, and R-005 cuts hosted jobs before any
  deployment. The Herdr pane wake route and the lead's ancestor walk stay as generic routes. The refusal wording is the
  main session's, for Adrian at gate 5.1.
- 2026-11-18 (main session): the implementer's Deviations 1 (`test/u11-live-activity.test.ts` keeps the hosted
  folder's `tool-detail` and expects no model for it) is accepted: the detached row of the same test reads Pi's
  `provider`/`modelId` form.
- 2026-11-18 (main session, review round 1, `review.md`): fix five findings. (a) `templates/agents.md:188`: the
  sentence "On a job that already ended, `watch` says no wake will follow" holds only on a Herdr pane route
  (`src/commands/watch.ts:33-41`); drop it or scope it to a coordinator without a Pi session, and bring
  `templates/.history/agents.md` in line. (b) `docs/jobs.md:122`: "Both engines write the transcript" names Pi only.
  (c) `docs/setup.md:92`: `LIMEN_ENGINE` is read only by `limen spawn`; say that `spawn` refuses any other value of
  `--engine` or `LIMEN_ENGINE` before a job exists, and that a continuation keeps its parent's engine and refuses a
  removed one. (d) `src/runtime/supervisor.ts:99`: the comment gives no second engine as a reason (T-30). (e)
  `docs/seat/agent-setup.md:202`: the reference for `--no-extensions` names `src/runtime/engine.ts` without a line
  number, which went stale twice. Rejected with reasons in `review.md`: the known-good versions of
  `docs/setup.md:12`, the file-wide tab count of `test/s2-hosted.test.ts`, and T-27.
