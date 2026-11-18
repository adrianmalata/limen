<!-- PL: Ticket R-003 etapu 1 przebudowy: wycięcie silnika Devin (zadania w chmurze Devina, `--engine devin`) i lustra
Lineara (polecenie `limen linear`, szablon templates/linear.md), zgodnie z decyzjami bramki 2 G1.5 i G1.6 oraz A-049.
Wycięte polecenie i wycięta wartość `--engine` odmawiają jednym wierszem z tabeli starych nazw (T-18), a pliki
Lineara w projektach trafiają do rejestru plików pozostałych (R-001). Stan: zamknięty (18.11). -->

# R-003 Cut Devin and the Linear mirror

## Problem

Gate 2 cut two integrations the seat does not use. Devin runs a job as a Devin cloud session through Devin's API
(`src/runtime/devin.ts`, 303 lines, `--engine devin`); the seat runs Pi on one Claude subscription. The Linear mirror
is a toggle (`limen linear`, `src/commands/linear.ts`) that renames `spec/linear.md`, plus a prose manual
(`templates/linear.md`) that tells the coordinator to mirror feature state to Linear; the seat has no Linear.

Relied on:
- G1.5 (gate 2): "Linear mirror | cut". G1.6: "Devin | cut".
- A-049, Decision: "fix (via G1) — Devin, OMP, finish webhooks, Linear cut; doorbell and groups deliberately kept as
  modules off by default".
- `plan.md` → `## Stages`, stage 1: "cut commands refuse with a pointer, and `limen status` lists the leftover files of
  cut features"; conventions: "a CLI change makes the old form exit with code 2 and name the new form in `next` (…;
  before R-013, a non-zero exit with the replacement in the message)".
- T-18, Migration: "an old name exits with code 2 (T-02) and names the new one in `next`; a ticket in the last stage of
  the plan removes the table of old names" (R-085). `src/old-names.ts` (R-002) is that table; today it holds commands
  only (`OLD_NAMES`, `removedCommand`), and `src/main.ts` looks a command up there before it reports an unknown one.
- `plan.md` → `## Tickets`, notes, R-001: "every cut ticket registers the leftover paths of its feature";
  `src/project/leftovers.ts` (R-001): `LEFTOVERS` entries are relative, normalised, outside `.git/`, and overlap no
  other entry and no `TRACKED` path (`test/project/leftovers.test.ts`).
- A job record's engine is read back from its `engine` file by `engineProfile` (`src/runtime/engine.ts:68-73`,
  through `jobProfile` in the wrapper, the supervisor and recovery, and directly in `src/commands/continue.ts:211`), so
  a record written by a Devin job must get a clear refusal, not `unknown engine devin`.
- R-004 cuts the OMP engine after this ticket, so `pi` and `omp` stay the engines here.
- D-025: a criterion checks only the ticket's scope, as an exit code; a scan over the tree is this ticket's own only
  when every match it finds at the parent is one the ticket removes (checked at `HEAD` for AC-2: the main session's
  run matches 18 files, all in items 1–4 below).
- D-029: a test that fails even once without a change of the code it runs is a finding; nobody runs it again for a
  green gate.

## Change

1. Delete with `git rm`: `src/runtime/devin.ts`, `test/s11-devin.test.ts`, `src/commands/linear.ts`,
   `templates/linear.md`.
2. Devin's other uses go (the inventory of the main session, at `HEAD`):
   - `src/runtime/engine.ts`: the `devin` profile, `"devin"` in `EngineId`, `LIMEN_DEVIN` in `binaryEnv`, the comment
     at `:55`; `engineProfile` and `resolveSpawnEngine` accept `pi` and `omp`, and the generic error reads
     `--engine must be pi or omp`.
   - `src/commands/spawn.ts`: the `preflightDevin` import and call, the Devin branch of the default model (`:177-178`)
     and of `preflightEngine` (`:180`); every spawn runs `preflightEngine` and gets `defaultModel` when `--model` is
     absent, as a Pi or OMP spawn does at `HEAD`.
   - `src/runtime/wrapper.ts`: the `runDevinJob` import and branch (`:131-…`), and the Devin half of the start-queue
     condition and its comment (`:96-97`).
   - `src/commands/stop.ts`: the Devin half of `childless` and of its comment (`:41-43`).
   - `src/commands/continue.ts`: the Devin refusal (`:349-354`), which `engineProfile` now precedes.
   - `src/commands/group.ts`: the Devin refusal in `teamRouteFlag` (`:109-111`).
   - `src/main.ts`: the `spawn --engine devin` help line (`:117`).
   - `test/s1-spawn.test.ts`: the four Devin refusal cases (`:52-55`).
   - Every helper, constant or type that only the removed code used, in the files above.
3. The Linear mirror's other uses go:
   - `src/main.ts`: the `linearCommand` import, the `linear` entry, the `"linear"` member of the command union and its
     help line (`:12`, `:60`, `:90`, `:146`).
   - `templates/agents.md:57`: the Linear paragraph, with `templates/.history/agents.md` brought in line as
     `test/structure.test.ts` requires; the history file is written with Edit or Write, since a command with a
     variable assignment in front breaks the allow-list (D-016).
   - `.gitignore:8-9`: the comment and the `spec/linear.md*` line (the author's `spec/` left the tree in R-010).
4. Docs say nothing of Devin or the Linear mirror and nothing the code does not do: `README.md` (`:25`, `:97`, `:130`),
   `docs/commands.md` (`:22`, `:37`, the `### Linear` section at `:206-211`), `docs/jobs.md` (`:157`, `:164`),
   `docs/setup.md` (the engine list at `:104-121`, the `### Devin cloud jobs` section at `:165-178` and every link to
   it), `templates/agents.md:88` if it names Devin.
5. `src/old-names.ts`, the table of old names (T-18):
   - `OLD_NAMES` gets `{ name: "linear", feature: "the Linear mirror", ticket: "R-003", instead: "spec/features/ is
     the only record of ticket state" }`.
   - A second list `OLD_ENGINES` of the same type, with `{ name: "devin", feature: "Devin cloud jobs", ticket:
     "R-003", instead: "use --engine pi" }`, and `removedEngine(name)`, which returns `engine <name> was removed with
     <feature> (<ticket>); <instead>` or `undefined`. R-004 adds its `omp` entry there.
   - `engineProfile` and `resolveSpawnEngine` (so also `LIMEN_ENGINE=devin`) throw `removedEngine`'s line before
     their generic error. `limen continue` of a job record whose `engine` file holds `devin` therefore refuses with
     that line before it writes anything.
   - The file's header comment and `removedCommand`'s doc say the table holds removed commands and removed engine
     values.
6. `src/project/leftovers.ts`: `LEFTOVERS` gets `spec/linear.md`, `spec/linear.md.off` and `.agents/limen/linear.md`
   (the project's override of `templates/linear.md`, named in `templates/agents.md:57`), each with the feature
   `the Linear mirror (R-003)`.
7. Tests, written first and failing at `HEAD`:
   - `test/cli/old-names.test.ts`: on a plant, `limen linear status` and `limen linear off` exit non-zero, their
     stderr is the one line `limen linear was removed with the Linear mirror (R-003); spec/features/ is the only
     record of ticket state`, and `.limen/` and `spec/` are unchanged; `limen spawn --engine devin work` and `limen
     spawn work` with `LIMEN_ENGINE=devin` exit non-zero with `engine devin was removed with Devin cloud jobs (R-003);
     use --engine pi` on stderr, and `.limen/` is unchanged (no job folder); every entry of `OLD_ENGINES` has a
     non-empty feature, ticket and pointer, and `engineProfile` accepts none of their names.
   - `test/cli/continue.test.ts`: `limen continue` of a finished job whose `engine` file is rewritten to `devin`
     refuses with the same line and starts no job.
   - `test/cli/status.test.ts`: a project with `spec/linear.md` lists it under `Leftover files` with
     `(the Linear mirror (R-003))`.

## Out of scope

- The job files under `.limen/jobs/<id>/` that a Devin job wrote (`devin-session`, `devin-url`): part of a job's
  record, which R-021 migrates; they are not registry entries.
- Files outside the projects: the Devin CLI login (`~/.local/share/devin/`) and seat environment variables
  (`DEVIN_API_KEY`, `DEVIN_ORG_ID`, `DEVIN_API_URL`, `LIMEN_DEVIN`, `LIMEN_DEVIN_ACU_LIMIT`) are not Limen's files; the
  outcome names them for Adrian.
- The OMP engine and `--provider` (R-004 and later); typing the refusals (`LimenError`, code 2, `next`): R-013.
- Issues already in Linear: Limen never owned them.

## Acceptance

- AC-1: `git ls-files -- src/runtime/devin.ts test/s11-devin.test.ts src/commands/linear.ts templates/linear.md |
  grep -q .` → exit 1 (none is tracked).
- AC-2: `git grep -q -i -E 'devin|linear' -- src hook bin templates test docs README.md CONTRIBUTING.md package.json
  .gitignore ':!src/old-names.ts' ':!src/project/leftovers.ts' ':!test/cli/old-names.test.ts'
  ':!test/cli/continue.test.ts' ':!test/cli/status.test.ts'` → exit 1 (no match). At `HEAD` every file it matches is
  one this ticket deletes or changes (D-025).
- AC-3: `node --test test/cli/old-names.test.ts` → exit 0.
- AC-4: `node --test test/project/leftovers.test.ts` → exit 0 (the new entries satisfy the registry's rules).
- AC-5: `node adrian-rebuild/tools/fails-before.mjs` → exit 0: the new and changed test files fail at `HEAD`.
- AC-6: `node adrian-rebuild/tools/gate.mjs` → exit 0 with `fail 0`; the outcome names every test removed with the
  cut and the count before and after.
- AC-7: `node adrian-rebuild/tools/check.mjs` → exit 0; `npx biome check --error-on-warnings adrian-rebuild` → exit 0.
- AC-8 (judgment): a Pi or OMP spawn, continue, stop and group launch behave as at `HEAD`: the removed branches were
  taken only for `devin`, and no remaining branch changed its condition otherwise.
- AC-9 (judgment): the docs and templates of items 3 and 4 say nothing of the cut features and nothing the code does
  not do.

## Migration

- On disk: the three project paths of item 6 become leftover files; `limen status` lists them and `limen init
  --drop-leftovers` removes them (R-001's mechanism, tested in AC-4 and the status test of item 7). On the seat:
  `## Deployment` 1.1. A job record with `engine` = `devin` stays readable as a record; acting on it as a job refuses
  with the line of item 5 (tested in item 7).
- CLI: `limen linear` and `--engine devin` refuse with the pointers of item 5 (tested in AC-3).

## Risk

- A removed import or helper that another module still needs breaks the build; the gate's `tsc --noEmit` catches it.
- Simplifying a condition that had a Devin half (`wrapper.ts:97`, `stop.ts:43`, `spawn.ts:178-180`) could change the
  Pi or OMP path; AC-8 and the spawn, stop and queue tests of the gate cover it.
- A running Devin job during deployment keeps its old wrapper process until it ends; nothing on the seat runs Devin
  (G1.6).

## Rollback

`git revert $(git log --format=%H --grep='^R-003:' adrian-rebuild --)`; the leftover files are not removed until
Adrian runs `limen init --drop-leftovers`.

## Decisions

- 2026-11-18 (main session): the refusal of a removed engine value lives in the old-name table beside the removed
  commands (`OLD_ENGINES`, `removedEngine`), so R-085 removes one file and R-004 adds `omp` in the same place; the
  wording of both refusals is the main session's, for Adrian to confirm at gate 5.1 (R-014 sets refusal texts with
  him). `.agents/limen/linear.md` is a leftover as well, because `templates/agents.md:57` names it as the project's
  override of the cut template.
- 2026-11-18 (main session, review round 1, `review.md`): fix two notes. (a) T-29 (5): `test/cli/old-names.test.ts`
  opens with one line on what it tests; its two-line opening comment becomes one line. (b) `outcome.md` → `## Done`:
  the commit that brought Devin into `src/commands/spawn.ts` is `a016428`; `dce9449` is the commit that added
  `SpawnLaunch.model` as `string | undefined`, which is older. The notes on `test/s1-spawn.test.ts` in AC-5 and on
  T-27 need no change (reasons in `review.md`).
- 2026-11-18 (main session): the first implementer run was killed after about two minutes when WSL shut down at
  16:22:59; `review-guard.mjs compare --git` against the same snapshot exited 0, and a fresh `rebuild-implementer` ran
  the ticket from the start.
