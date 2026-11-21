<!-- PL: Ticket R-023 (T-26, D-044, D-045 (2), D-046, D-061): komendy są cienkimi adapterami nad operacjami
domenowymi; logika, której używają inne komendy i moduły, przechodzi z src/commands do src/job/, src/project/,
src/runtime/ i src/integrations/, żadna komenda nie importuje innej, a domena, hooki i bin nic z src/commands. Wrapper
drukuje cały tekst komendy na końcu (bez wczesnej linii id po `spawn`), jeden moduł uruchamia własne CLI Limena,
słowa komend czyta tylko parser, a `jobs` dostaje poprawne `next`. Stan: napisany 21.11 w dzień przy drzewie R-089;
gotowy (ready), także do nocy. -->

# R-023 Commands are thin adapters over domain operations

## Problem

T-26 (`taste.md`): "Commands are thin adapters; the logic lives in domain modules as typed functions; within a
process no command calls another, neither through argv nor through an import. (1) A registry command (T-19): parse
with the shared parser, call a domain operation, pass the result to the shared wrapper, which turns a typed result or
error (T-01, T-03) into the exit code, the text and the final JSON line (T-02) […] (3) Dependencies point one way:
commands → domain; the domain imports nothing from `src/commands`, and no command imports another. (4) At a process
boundary […] only the final JSON line is read, through one client function". Its Check: "an import scan: a file in
`src/commands` imports nothing from `src/commands` (except the registry's types), and domain modules import nothing
from `src/commands` or `bin/`; a scan finds no launch of Limen's own CLI (spawn or exec of `limen`) in `src/`".

Adrian's decisions, quoted from `plan.md` → `## Decisions` and `## Tickets`:

- D-061 (2): "R-023 keeps T-26 and the notes of D-044 and D-045 (2), size M; the new R-092 takes T-38 (the
  `validate`/`apply` shape, the type test, the race test, the shared snapshot)". (3): "The shared wrapper prints all of
  a command's text at its end (T-26 (1)); `spawn`'s early id line goes, the id stays in `ids.job` and in `limen
  status`; `picture serve` is the one streaming command." (4): "Limen starts its own CLI from one launcher module with
  the client function of the final line (T-25 (1), T-26 (4), T-37 (2)); a scan bans launches elsewhere; the rule timer
  and `group advance` use it until R-034 and R-077." Settled readings recorded with it: "commands with `movedBy`
  (including `group wait`) are exempt from the T-26 scans by that field (D-039, R-018's exception-list precedent),
  while the logic other commands use moves to domain modules; ticket operations stay in `src/project/` until R-061
  creates `src/spec/`; a converted refusal carries its own code (T-01, T-28 (1))."
- The R-023 note of D-044 (`## Tickets`): "the static scan that no command words are read outside `src/parser.ts`
  (R-014 moved the `--help` lookup and the `jobs` refusal's words into the parser); the test of `--help` as a flag's
  value (R-014's parser test) asserts the command's own exit 1, so a parser refusal no longer passes it; the import
  cycle between `src/parser.ts` and `src/old-names.ts`".
- The R-023 note of D-045 (2) and D-046: "the `jobs` refusal (R-014 review round 4, note 1): a flag present names
  `limen status --all`, and only `limen jobs <ref>` names `limen show <ref>` (D-038); a test that every non-empty
  `next` of a refusal, for the mixed forms `limen jobs --all a1b2c3d4` and `limen jobs -- --all` included, passes the
  shared parser and is not itself a usage error." R-089's review round 1 (note 4) adds that `jobs <ref>` writes the
  ref unquoted into `limen show <ref>`.

Facts at R-089's tree (`evidence/inventories/R-022-R-023.md`, of `6ef1840`, checked again on 2026-11-21):

1. Commands importing commands, 14 lines (`git grep -n -E 'from "\./[a-z-]+\.ts"' -- src/commands`): `continue.ts`
   (from `spawn.ts`), `github.ts` (`github-doctor.ts`, `spawn.ts`), `group-rounds.ts` (`continue.ts`), `group.ts`
   (`group-rounds.ts`, `spawn.ts`, `stop.ts`), `keeper.ts` (`land.ts`, `spawn.ts`), `land.ts` (`prune.ts`),
   `spawn.ts` (`diff.ts`), `steer.ts` (`watch.ts`), `ticket.ts` (`land.ts`), `watch.ts` (`spawn.ts`).
   `group-rounds.ts` and `github-doctor.ts` are not commands.
2. Imports of `src/commands` from outside it: `src/runtime/job-setup.ts` (`pruneForJob`), `bin/limen-group-fixture.mjs`
   (`initCommand`), and `src/main.ts` (`endDueRules`, the wrapper's own call).
3. Limen starting its own CLI: `src/runtime/wrapper.ts` (`launchWrapper`, the job's internal run, which prints no
   final line), `src/job/group-cabinet.ts`, `src/commands/rule.ts` (the rule timer), `src/integrations/github-poller.ts`.
   The client function `readOutcome` of `src/outcome.ts` has no caller in `src/`.
4. Command words read outside the parser: `src/main.ts`, `src/registry.ts`, `src/old-names.ts`; the import cycle
   `src/parser.ts` ↔ `src/old-names.ts`.
5. `spawn` prints its id line before the worktree exists; `picture serve` streams.
6. The `jobs` refusal (`src/old-names.ts`): its `next` is computed from the call; `test/parser.test.ts` asserts only a
   non-zero exit for its mixed forms.

## Change

1. The logic that another command or module uses moves out of `src/commands` into the domain modules of T-26 (2):
   `src/job/` (spawn, continue, stop, the watch routes, the group rounds), `src/project/` (the ticket check and the
   other ticket operations, until R-061), `src/runtime/` (prune), `src/integrations/` (the GitHub doctor, Hunk). The
   implementer picks the module for each function and keeps its behaviour; a refusal it converts from a plain `Error`
   carries its own code (T-01, T-28 (1)). The two non-command files move whole: `git mv src/commands/group-rounds.ts
   src/job/group-rounds.ts` and `git mv src/commands/github-doctor.ts src/integrations/github-doctor.ts`.
2. No file in `src/commands` imports another file of `src/commands` (the registry's types aside), and no file in
   `src/` outside `src/commands` (but `src/main.ts` and `src/registry.ts`), `hook/` or `bin/` imports `src/commands`; a
   scan in `test/structure.test.ts` asserts both, with the commands that carry `movedBy` exempt by that field
   (D-061), and a fixture case for each direction.
3. Each registry handler without `movedBy` parses through the shared parser, calls one domain operation and returns its
   typed result; the wrapper prints all of a command's text at its end (D-061 (3)), so `spawn`'s early id line goes
   (the id stays in `ids.job` and `limen status`); `picture serve` is the one streaming command, by name in the scan.
4. One launcher module starts Limen's own CLI and reads its final line through the client function `readOutcome`
   (D-061 (4)); every site of fact 3 goes through it (the job's internal run through its own entry of the same module,
   since it prints no final line); a scan in `test/structure.test.ts` finds no other spawn or exec of Limen's CLI in
   `src/`.
5. Command words are read only in `src/parser.ts`, by a scan in `test/structure.test.ts`; the import cycle
   `src/parser.ts` ↔ `src/old-names.ts` goes (D-044).
6. The test of `--help` as a flag's value asserts the command's own exit 1 (`continue`), not a parser refusal (D-044).
7. `jobs` (D-045 (2), D-046): a flag present names `limen status --all`; only `limen jobs <ref>` names `limen show
   <ref>`, with the ref shell-quoted by `limenCommand`; a table test that every non-empty `next` of the `jobs` forms
   (`limen jobs --all a1b2c3d4` and `limen jobs -- --all` included) passes the shared parser and is not a usage error.
8. Docs and the coordinator manual that name `spawn`'s early id line or a moved module follow the change
   (`templates/agents.md` with its history line, if it changes).

## Out of scope

- T-38 (`validate` then `apply`, writes before a refusal): R-092.
- The logic of the commands that carry `movedBy` (R-032, R-034, R-037, R-066, R-077).
- `src/spec/` (R-061); typed errors everywhere (R-082); the stderr wording of any refusal.

## Acceptance

- AC-1: `node --test test/structure.test.ts` → exit 0 (the scans of changes 2, 4 and 5).
- AC-2: `node --test test/cli/old-names.test.ts` → exit 0 (the `jobs` forms of change 7).
- AC-3: `node --test test/parser.test.ts` → exit 0 (change 6).
- AC-4: `node --test test/s1-spawn.test.ts` → exit 0 (change 3).
- AC-5: `git grep -n -E 'from "\./[a-z-]+\.ts"' -- src/commands` → exit 1 (14 lines at R-089's tree).
- AC-6: `git grep -n 'commands/' -- src/runtime src/job src/project src/integrations hook bin` → exit 1 (two lines at
  R-089's tree).
- AC-7: `node adrian-rebuild/tools/fails-before.mjs` → exit 0, its output in `outcome.md` → `## Fails before`, which
  names every new or changed test that passes at `HEAD`, with the reason.
- AC-8: `node adrian-rebuild/tools/gate.mjs` → exit 0.
- AC-9: `npx tsc --noEmit` → exit 0; `npx biome check --error-on-warnings .` → exit 0;
  `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-10 (judgment): each registry handler without `movedBy` parses, calls one domain operation and returns its typed
  result; no logic that another module uses stays in `src/commands`; all text of a command is printed at its end; the
  moved functions keep their behaviour (the existing tests pass unchanged, apart from `spawn`'s early line).

## Migration

None on disk. The text of `spawn`'s output loses its early id line (D-061 (3)); a reader takes the id from the final
line's `ids.job`, as the coordinator manual and the tests' reader already do.

## Risk

- Moving functions can close an import cycle (R-093 met one through `src/lock.ts`); the gate's load of every test file
  shows it.
- R-092 changes the same handlers next; this ticket keeps behaviour, so its moves are the base R-092 builds on.

## Rollback

`git revert $(git log --format=%H --grep='^R-023:' adrian-rebuild --)`.

## Decisions

- 2026-11-20 D-061 and the notes of D-044, D-045 (2) and D-046 (Adrian): quoted in `## Problem`.
