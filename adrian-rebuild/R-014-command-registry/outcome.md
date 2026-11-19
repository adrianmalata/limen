<!-- PL: Wynik ticketu R-014 (19.11; szkic implementera, uzupełniony przez sesję główną): jeden rejestr poleceń `src/registry.ts` (45 wpisów z
obiektem, rodzajem, widocznością, opisem, schematem, kluczami ids, przykładem, `movedBy` i handlerem), jeden parser
`src/parser.ts` w miejsce `src/commands/flags.ts`, generowana pomoc `src/help.ts` ze złotymi tekstami Change 4 i dwie
generowane sekcje `docs/commands.md`. Nowe nazwy `status --all`, `show <job>` i `seat queue`, odmowy starych nazw kodem
`REMOVED`, `spawn` wymaga czterech flag trasy (D-043), a `group wait` odmawia wywołującemu spoza teamu (D-042). Stan:
zamknięty po rundach poprawek 1, 2 i 3 (uwagi z `review.md`, D-044) i recenzji 4 (PASS); bramka sesji głównej
244/244 (198 na HEAD), `check.mjs` i Biome z kodem 0; trzy uwagi recenzji 4 przeszły do bramki 5.1, R-023 i R-081. -->


# Outcome: R-014 One command registry, a shared parser and generated help

## Done

- Change 1, the registry, new `src/registry.ts`:
  - `Entry`: `name`, `object` (`job`, `owner`, `project`, `ticket`, `seat`, `github`, `group`, `picture`,
    `workspace`), `kind` (`read` | `change`), `visibility` (`public` | `internal`) with `caller` for an internal entry,
    `summary`, `schema`, `abbreviated` (the six entries of Change 3 whose line drops optional flags, and ends with ` …`
    only when that hides a flag, review finding 8), `ids`, `example`,
    `movedBy` and `handler` (`(values: Parsed, cwd) => Promise<Success | undefined>`).
  - 45 entries: 36 public, 9 internal (`rule timer`, `github ensure|poll|deliver|review|work|resolve`, `group wait`,
    `group advance`). `ids`: `job` for `spawn`, `continue`, `keeper`, `github review`, `github work`; `ticket` for
    `ticket new`; none elsewhere. `movedBy`: `prune` and `sweep` R-032, `close` R-037, `keeper` R-066, `rule`,
    `rule set`, `rule end`, `rule timer` R-034, `group wait` R-077.
  - `GROUPS`, the group table: a header for `job`, `project`, `ticket`, `seat`; a module summary for `github`,
    `group`, `picture`, `workspace`; `MODULES_HEADER` is "Modules" (D-040). `COMMAND_NAMES` and `lookup` (the longest
    registered name that the first words match) come from the registry.
  - `src/main.ts` dispatches through it: `limen`, `--help`, `-h`, `help` print the general help; a removed name refuses
    first (`removedWords`); `limen <name> --help` (before `--`) prints the entry's help, internal entries included;
    `limen <group>` alone exits 2, `BAD_ARGUMENT`, with the group's lines in the message and `limen <group> --help` in
    `next`, an unknown subcommand the same with `UNKNOWN_COMMAND`, and `limen <group> --help` prints the group's lines.
    `main` takes the registry as a third parameter, so a test runs the real wrapper on its own entry.
  - The wrapper refuses a success whose `ids` holds a key the entry does not declare: `internal`, `UNDECLARED_IDS`,
    exit 5.
- Change 2, the parser, new `src/parser.ts`; `src/commands/flags.ts` removed:
  - The schema is an ordered list of parts, so the usage line keeps the order of `rule set <name> --until <time>
    [--start-priority 1|2|3] "text"`. A positional has a name, a type (`job`, `ticket`, `text`, `path`, `branch`,
    `word`), `shown`, `optional`, `repeated` and `replacedBy` (a flag that stands in its place). A flag has a value
    name or `choices`, `repeatable`, `required` and `dashValue`. A removed flag of `OLD_FLAGS` is a `{ removed }` part.
  - Rules kept from `parseFlags`: only a word that starts with `--` is a flag, so `-x` and `-` are positionals; `--`
    ends the flags; a separate value may start with `--` only when the flag allows it; a removed flag refuses as a flag
    and reads as a value after a flag that takes one. Choices 2 of `## Decisions`: `--` ends the flags of every
    command, and empty words are dropped everywhere. Choice 1: a final `text` takes the remaining words.
  - Every error is `usage`, `BAD_ARGUMENT`, `next` `limen <name> --help`, message `limen <name>: <what is wrong>` and
    `usage: limen <usage line>`: an unknown flag, a switch with a value, a missing value, a choice not listed, a flag
    given twice, missing positionals and required flags (named together, e.g. `limen spawn: missing --model,
    --thinking`), an extra argument, a ticket number that is not `FNNN`.
  - Handlers read `Parsed` (`get`, `list`, `has`); reading a name the schema does not declare throws a `TypeError`.
    `get` joins the words of a text or a repeated positional, and the values of a repeatable flag, with a space;
    handlers read a repeatable flag with `list` (finding 5).
- Change 3 and 4, the help, new `src/help.ts`, the renderer of `evidence/taste/help-registry.mjs` ported (column cap 35,
  width 100, summary indent 6): `generalHelp`, `entryHelp`, `groupHelp`, `docsSections`. The exit-code line comes from
  `EXIT_CODES` and the JSON line from `FINAL_LINE_KEYS`, newly exported from `src/outcome.ts` with `ids` optional, the
  list `checkedOutcome` reads. `limen <name> --help` shows the usage line, the summary, `internal: run by <caller>` for
  an internal entry, one line per positional and flag, and `Example: …`; no kind (D-041 (6)). The general help, `limen
  land --help` and the parser error of Change 4 equal their golden texts, the `ticket done` line as D-043 (2) gives it.
- `docs/commands.md`: the sections `<!-- registry:public:… -->` (the general help's command lines) and
  `<!-- registry:internal:… -->` (each internal entry's usage line, summary and caller), and prose corrected where it
  named a renamed or cut form: the exit-code rows for `BAD_ARGUMENT`, `REMOVED` and `UNDECLARED_IDS`, `show` for
  `jobs`, `status --all`, `seat queue`, spawn's four required flags, and `group wait` out of the coordinator's block.
- Change 5, the new names:
  - `limen show <job>` (new `src/commands/show.ts`) prints what `limen jobs <ref>` printed, human or compact view as
    before.
  - `limen status --all` prints today's summary without the 7-day window, then `Jobs (N):` and one row per job, the
    row of the old `limen jobs` (`renderJobDirectory` "row"), running first, then the newest.
  - `limen seat queue` prints what `limen queue` printed.
  - The renderers of `src/commands/jobs.ts` moved to `src/job/listing.ts` (`RECENT_MS`, `orderedJobs`,
    `renderJobDirectory`, `shownState`); its list views of the cut command went. `src/commands/queue.ts` became
    `src/commands/seat-queue.ts` (deviation 1).
  - `src/old-names.ts`: every refusal is a `LimenError`, code `REMOVED`, `next` the entry's `instead` (choice 5);
    class `usage` for a name on the command line, `refused` for an engine or role read from a job record
    (`NameSource`, `refuseRemovedEngine`, `refuseRemovedRole`, `removedFlagRefusal`, `removedWords`). New entries
    `jobs` (`next` `limen show <ref>` for `jobs <ref>`, `limen status --all` otherwise) and `queue` (`limen seat
    queue`). `refuseRemovedFlags` and `refuseRemovedWords` went; the parser refuses removed flags.
  - Fix round 3 (note 3): a renamed or split name says what happened, by its `happened` (the line is built from the name and the ticket,
    as the default line is, so AC-7's grep finds no old form in `src/`): "limen queue was renamed to
    limen seat queue (R-014)" and "limen jobs was split into limen status --all, which lists every job, and limen
    show <job>, which shows one (R-014)"; each `next` is as before. `docs/commands.md`'s two sentences on these
    refusals say "split" and "renamed" too. (Note 5) the `jobs` refusal reads the words after `jobs` with the shared
    parser (`tryParse` with the old words `[--running|--active|--all|--label <prefix>|<job>]`), so `limen jobs --
    a1b2c3d4` names `limen show a1b2c3d4`; words that do not parse name `limen status --all`.
  - `group wait` (D-042): internal, `movedBy: "R-077"`. A caller without `LIMEN_GROUP_ID` gets `refused`,
    `GROUP_WAIT_MEMBERS_ONLY`, "group wait is for team members, which keep their turn open while their workers run;
    the lead gets the group's result once, when the group ends", `next` `limen group status <id>` (`<group id>` when
    none was given, choice 4). The comment at the check and `docs/groups.md` call it a guard against mistakes keyed on
    the job's environment, not a security boundary; `docs/groups.md` lists it as member-only. A member's wait is
    unchanged.
  - Every mention of `limen jobs` and `limen queue` in `src`, `hook`, `templates` and `docs` names the new form;
    `templates/.history/agents.md` got the hash of the new `templates/agents.md`, as R-013 did.
- D-043: `--engine`, `--provider`, `--model` and `--thinking` are required flags of `spawn`; spawn's `model ??
  defaultModel` went, and `resolveSpawnEngine` takes the flag only (no `LIMEN_ENGINE`; `docs/setup.md` says so).
  `continue` keeps its optional route flags and `defaultModel`, which now takes no role: only `continue` calls it, so
  `LIMEN_REVIEWER_MODEL` went (finding 3). `templates/agents.md`, `docs/setup.md`, `docs/seat/README.md` and
  `docs/seat/agent-setup.md` say that spawn requires the four flags and that only `continue` falls back (findings 2,
  3); `docs/jobs.md` names `limen show <id>` (finding 4).
- Review round 1, also: `--role` names `.agents/limen/<role>.md` and the package's `templates/<role>.md` (finding
  6); `picture build` is `change`, by the rule of `board` (finding 7); `group wait`'s `<group>` says that every caller
  outside a team is refused, with or without it, and a member who gives one (finding 9); `humanSnapshot`,
  `tallyStates`, `humanRow`, `StateTally`, `terminalFacts`, `jobSuffix` and `cabinetLine` left `src/job/view.ts`
  with their last caller (finding 12).
- Review round 2: `templates/agents.md:88` says `--engine pi` is required on every spawn, with the other three route
  flags (finding 1; a new first line in `templates/.history/agents.md`). `limen <name> --help` of an entry whose name
  also starts other entries' names prints the entry's help and then the lines of those public entries
  (`commandHelp` in `src/help.ts`): `limen rule --help` lists `rule set` and `rule end` again, as at HEAD (finding 2,
  a regression of round 0). `group start` requires `--team` in its schema, so a missing one exits 2 with
  `BAD_ARGUMENT`, `limen group start: missing --team` and the usage line `limen group start <folder> --team <route> …`
  (finding 3); no test asserted the old exit 1, and the generated sections of `docs/commands.md` do not change,
  because they show `group start` only in the module line.
- Review round 3 (D-044): `continue --label` is an ordinary value flag, so a second `--label` exits 2 (note 2; no
  other `--label` was repeatable). The `--help`/`-h` lookup moved from `src/main.ts` into `src/parser.ts`
  (`asksHelp(command, args)`): `--help` or `-h` asks for help only as a word of its own, before a lone `--` and not
  as the value of a flag that takes one, so `limen continue <job> "x" --label --help` runs with the label `--help`
  (note 5). The prose above the internal section of `docs/commands.md` names every caller, the coordinator for
  `github review`, `work` and `resolve` among them (note 4).
- Handlers: every command file takes parsed values. Keeper, group start and the GitHub jobs call
  `startSpawn(request)`; the group round driver calls `startContinue(request)`; group stop calls `stopJob` (choice 7).
  `endDueRules` takes the entry's name.
- Tests: new `test/parser.test.ts`, `test/help.test.ts`, `test/registry.test.ts`; extended
  `test/cli/old-names.test.ts` (one `REMOVED` test each for commands and subcommands, flags, engine values and roles,
  each asserting the exit status and the code, finding 10), `test/cli/status.test.ts`, `test/cli/group.test.ts`, `test/cli/continue.test.ts`
  (`refused`/`REMOVED` from a record); moved to the new forms: `test/outcome.test.ts`, `test/s1-spawn.test.ts`,
  `test/s2-herdr.test.ts`, `test/s3-finish-wake.test.ts`, `test/s9-housekeeping.test.ts`,
  `test/cli/old-hosted.test.ts`; `test/plant.ts` adds the test route to a spawn that gives none (`routed`).

## Index operations

- `git mv src/commands/queue.ts src/commands/seat.ts`, then `git mv src/commands/seat.ts src/commands/seat-queue.ts`
  (index: `R100 src/commands/queue.ts → src/commands/seat-queue.ts`).
- `git mv src/commands/jobs.ts src/job/listing.ts` (index: `R100`).
- `git rm -q src/commands/flags.ts` (index: `D`).

## Proof

All from the repository root, at the final tree. Test files in the gate's environment (`gate-env.mjs`, D-034).

- `node adrian-rebuild/tools/gate.mjs` → exit 0; `tsc --noEmit` and `biome check --error-on-warnings .` clean;
  tests 244, pass 244, fail 0, cancelled 0, skipped 0; 73.3 s (198 at HEAD, R-013's count; 234 before fix round
  1, 238 before fix round 2, 240 before fix round 3).
- `node adrian-rebuild/tools/check.mjs` → exit 0 ("0 errors").
- `npx biome check --error-on-warnings adrian-rebuild` → exit 0.
- AC-2 `node --test test/registry.test.ts` → exit 0, 11/11.
- AC-3 `node --test test/help.test.ts` → exit 0, 10/10.
- AC-4 `node --test test/parser.test.ts` → exit 0, 14/14.
- AC-5 `node --test test/cli/old-names.test.ts` → exit 0, 31/31.
- AC-6 `node --test test/cli/status.test.ts` → exit 0, 10/10.
- AC-11 `node --test test/cli/group.test.ts` → exit 0, 4/4.
- `node --test test/cli/continue.test.ts` → exit 0, 4/4 (fix round 3's `--label` test).
- AC-7 `git grep -n -E 'limen (jobs|queue)\b' -- src hook templates docs` → exit 1.
- AC-8 `git grep -n -E 'parseFlags|commands/flags' -- src hook` → exit 1.
- The three golden texts by hand: `limen --help`, `limen land --help` and the stderr of `limen land a1b2c3d4
  --ontoo main` (exit 2) diffed against Change 4 → no difference.
- AC-9 and AC-10 are judgments: every help line and docs line was read against the code it names (the internal
  callers against `src/integrations/github-poller.ts:594` and `:614`, `src/commands/rule.ts:132`,
  `src/job/group-cabinet.ts:326`; `stop`'s `done:` against `requestedTerminal`; `close` against
  `closeFeatureTabs`); for the reviewer.

Main session's own runs (they count, not the implementer's; `## Agents`, step 4), after each round:
- `review-guard.mjs compare --git node_modules/.rebuild-review/R-014.git <ticket.md>` → "within its limits", exit 0,
  after the implementer's run and after each fix round (a new `snapshot --git` before each resumption, D-035).
- `node adrian-rebuild/tools/gate.mjs` → exit 0: 234/234 (round 0), 238/238 (fix round 1), 240/240 (fix round 2),
  244/244 (fix round 3), each run once, started after the implementer's completion notification; no test failed in
  any run, so D-029 and D-031 did not apply.
- `node adrian-rebuild/tools/fails-before.mjs` → exit 0 after each round: 13 new or changed test files fail at `HEAD`
  (`test/cli/continue.test.ts`, `test/cli/group.test.ts`, `test/cli/old-hosted.test.ts`, `test/cli/old-names.test.ts`,
  `test/cli/status.test.ts`, `test/outcome.test.ts`, `test/s1-spawn.test.ts`, `test/s2-herdr.test.ts`,
  `test/s3-finish-wake.test.ts`, `test/s9-housekeeping.test.ts`, `test/help.test.ts`, `test/parser.test.ts`,
  `test/registry.test.ts`).
- Review rounds 1–4: `review-guard.mjs compare <before>` → `unchanged` and `review-verdict.mjs` → `consistent`, exit 0
  each; verdicts PASS, PASS, PASS, PASS (`review.md`).

## Review round 4 notes, moved by D-044

Review round 4 found three new notes, none blocking, so the ticket is committed and each note goes to the ticket that
D-044 names (`plan.md` → `## Tickets` → notes):
- The old-words schema of `jobs` accepts the job word together with a flag, so `limen jobs --all a1b2c3d4` names
  `limen show a1b2c3d4` and `limen jobs -- --all` names `limen show --all` (D-038 says only `jobs <ref>` names `show`):
  gate 5.1, with the other refusal wordings.
- The test of `--help` as a flag's value (`test/parser.test.ts:139-142`) asserts only "no success, no help", so a
  parser refusal would pass it: R-023, with the scan of words outside the parser.
- The prose above the internal section of `docs/commands.md:94` lists fewer callers than the generated lines (a rule
  command after its timer died, `limen group status`): R-081.

## Measurement

Unmeasured (`plan.md` → `## Measurement`): M-05, the coordinator on the seat with spawn's four required route flags
and the generated help (B.2 and 4.8); M-01, the fixed context of the changed `templates/agents.md` lines (from stage
4, E-1).

## Failed before the change

The new and changed tests at HEAD, before any source change (the tree's `src/` was HEAD's; run in the gate's
environment):

- `node adrian-rebuild/tools/fails-before.mjs test/parser.test.ts test/help.test.ts test/registry.test.ts
  test/cli/old-names.test.ts test/cli/status.test.ts test/cli/group.test.ts` → exit 0 ("fail at HEAD (exit 1)").
- Per test (`node --test` in the gate's environment): `test/parser.test.ts`, `test/help.test.ts`,
  `test/registry.test.ts`: `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '…/src/parser.ts'` (and `src/help.ts`,
  `src/registry.ts`).
- `GROUP_WAIT_MEMBERS_ONLY: the lead's group wait …`: `3 !== 1` (the lead's wait timed out with
  `GROUP_WAIT_TIMEOUT`).
- The four `REMOVED: every removed …` tests (command and subcommand, flag, engine value, role), run per test over an
  extract of HEAD after the split: each failed with exit `1` and `class: 'refused'`, `code: 'UNTYPED'`, `next: ''`
  where it expects `2`, `usage`, `REMOVED` and the entry's `instead` (first: `webhook`, "the coordinator gets a wake
  when a job ends").
- `REMOVED: limen jobs <ref> names limen show <ref> …` and `REMOVED: limen queue …`: `limen queue` gave `[0, { class:
  'ok' … }]`, not `[2, { class: 'usage', code: 'REMOVED', next: 'limen seat queue' }]`.
- `every old name … the command registry holds none of them`: `Cannot find module '…/src/registry.ts'`.
- `limen status --all prints the summary … one row for each job`: `[true, false, false]` for `[true, false, true]` (no
  `Jobs (2):` line).
- `GROUP_WAIT_TIMEOUT: a member's group wait …` passed at HEAD: it holds a member's wait unchanged (AC-11, second half).
- Added after that run, in files that fail at HEAD on the missing module: the two group-word tests of
  `test/help.test.ts`, and the two replaced-positional tests and the abbreviated-line test of `test/parser.test.ts`.
- Fix round 2, run before each fix in the gate's environment:
  - `T-19: limen rule --help prints the help of rule, then the lines of rule set and rule end …`
    (`test/help.test.ts`): `+ []` for the two usage lines of `rule set` and `rule end`; at HEAD its file fails on the
    missing `src/help.ts`, and HEAD's own help began with `usage:` and the old forms (`limen rule set NAME …`).
  - `BAD_ARGUMENT: group start without --team exits 2 …` (`test/cli/group.test.ts`): `1 !== 2`, with the refusal
    "group start requires the interactive Herdr coordinator pane …" and `{"class":"refused","code":"UNTYPED"}`:
    without the required flag the command ran on to the lead check. At HEAD it fails the same way.
- Fix round 3, run before each fix in the gate's environment, and over an extract of HEAD where the file loads:
  - `BAD_ARGUMENT: continue with --label given twice exits 2 …` (`test/cli/continue.test.ts`): `1 !== 2` with
    `no job matches "2026-11-18-none-1a2b3c4d"`: the repeatable `--label` parsed, and the command ran on. Fails at
    HEAD too.
  - `REMOVED: limen jobs <ref> names limen show <ref> …`: the first line was "limen jobs was removed with the job
    list in status and show (R-014); …", not the line of a split. At HEAD: exit 1, `UNTYPED`.
  - `REMOVED: limen queue exits 2, says it was renamed …`: the first line was "limen queue was removed with the seat
    group (R-014); limen seat queue". At HEAD: exit 0 (`limen queue` ran).
  - `REMOVED: the shared parser reads the words of limen jobs, so limen jobs -- a1b2c3d4 names limen show
    a1b2c3d4`: `next: 'limen status --all'` (from `rest[0]`, which was `--`). At HEAD: exit 1, `UNTYPED`.
  - `a --help that is the value of a flag asks for no help …` (`test/parser.test.ts`): exit 0 with the help
    printed (`[0, true]` in its first form). At HEAD, run against an extract of HEAD's `bin/limen`: `limen continue
    2026-11-18-none-1a2b3c4d x --label --help` → exit 0, stdout `usage:`.
  - `a --help after a lone -- asks for no help …` (`test/parser.test.ts`) is a regression test: it passed before
    the fix, and the case holds at HEAD (`limen land -- --help` → exit 2, `unknown land option --`, no help). Its
    file fails at HEAD only on the missing `src/parser.ts`.

## Deviations

1. `src/commands/queue.ts` became `src/commands/seat-queue.ts`, not `src/commands/seat.ts` as choice 7 says:
   `src/project/seat.ts` exists, and `test/structure.test.ts` requires unique TypeScript basenames ("129 !== 130").
2. A usage line wider than 100 characters is laid out at term boundaries with continuation lines indented by 6: in a
   parser error (with `usage: ` before it) for `spawn`, `keeper`, `github review` and `github work`, and in `--help`
   and the internal docs section for `github review` and `github work`. An example wider than one line goes on with a
   shell continuation (` \`). Change 3 has no rule for either; the strings stay one line in the registry.
3. A final text replaced by its flag still takes the remaining words: `limen spawn "title" --task-file F` names the job
   by its words, as before; a non-final replaced positional (`steer <job>|--running`) takes none.
4. `close <FNNN>` keeps a positional of type `word` shown as `<FNNN>`, because `close` also takes a ticket path and
   reads the number from it (`src/integrations/herdr.ts:178`); type `ticket` would refuse that.
5. Messages owned by the handlers that quoted the old hand-written usage strings (`ticket new`, `ticket done`, `ticket
   check`, `rule set`, `picture serve`, `github deliver|work`) now name the one fault; they stay untyped refusals
   (exit 1) as before.
6. D-043 says `LIMEN_ENGINE` no longer chooses a spawn's engine; `resolveSpawnEngine` reads it no more at all (its
   other callers always pass a value), and `docs/setup.md`'s sentence on it now names the four required flags.
7. `endDueRules` runs after the parser, so a usage error starts no rule timer.
8. A usage line does not mark a repeatable flag with ` …` (fix round 2, accepted by Adrian): a required repeatable `--team` in the
   abbreviated `group start` line would end with two. The flag's description says it repeats ("repeat it for each
   team"); a repeated positional keeps its ` …` (`ticket done <FNNN> …`). No other line showed a repeatable flag.
9. Change 2 lists the rules of `parseFlags` it keeps, but not this one (D-044, note 1): a value flag given twice exits
   2 with `BAD_ARGUMENT` (`--<flag> given twice`) on every command. At HEAD `continue`, `keeper` and `rule set` let
   the last use win, and `continue --label` took every use and kept the last; it is an ordinary value flag now, so a
   second `--label` exits 2 too. A switch given twice is still accepted.

## Open points

- `kind`: `status`, `diff`, `show`, `open`, `seat queue`, `ticket check`, `github status|doctor|ensure`, `rule`,
  `picture serve` are `read`; `board`, `picture build` and `group status` are `change`, because `board --write` and
  `picture build --json` write a file and `group status` publishes lifecycle events and can start a round. `status` and `show` still reap (T-04, R-032).
- `src/parser.ts` and `src/old-names.ts` import each other since fix round 3: the parser refuses a removed flag with
  its line, and the `jobs` refusal reads its words with `tryParse`. Each side calls only the other's exported functions
  at run time, so the cycle loads in either order; R-023 can break it if its module rules want that.
- Unmeasured: the coordinator on the seat with spawn's required route flags and the generated help (M-05, seat runs
  B.2 and 4.8); the fixed context of the changed `templates/agents.md` lines (M-01, from stage 4).
