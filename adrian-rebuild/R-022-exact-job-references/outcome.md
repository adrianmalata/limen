<!-- PL: Wynik R-022 (z poprawkami rund 1 i 2; zamknięty 21.11 recenzją PASS w rundzie 3): jeden resolver `src/job/reference.ts` przyjmuje
tylko pełne id albo końcowy token 8 hex; etykieta, prefiks etykiety, krótszy sufiks, wspólny token i puste słowo kończą
się kodem 2 z listą kandydatów i gotowym `next`, a uszkodzony rekord jest kandydatem tylko wtedy, gdy słowo pasuje do
jego id. Spawn i continue losują token pod blokadą `.limen/jobs.lock` aż do powstania folderu joba; forma id i tokenu
ma jeden moduł `src/job/id.ts`, a nowy test `test/job/id.test.ts` (runda 2) sprawdza, że `makeJobId` i `jobToken`
tworzą id i tokeny tej formy. Resolver i migracja listują foldery jobów przez `jobFolderNames` z `src/job/record.ts`,
a komentarz tej funkcji mówi już tylko, kto jej używa (runda 2). Bramka implementera po rundzie 2 padła raz na
niezmienionym teście kolejki (BLOCKED, D-029); po decyzji D-063 (pomiar bez różnicy względem HEAD, zatrzymane osierocone
wrappery) bramka sesji głównej przeszła 504/504. -->

# R-022 outcome

## Done

- `src/job/reference.ts` (new): the one resolver. `resolveJob(cwd, reference, access)` accepts exactly the full id of
  a folder in `.limen/jobs/` or the 8-hex token that exactly one id ends with as `-<token>`, from the folder names
  alone (`jobFolders`), so a record that reads as `BAD_DATA` never stops another job's resolution. Every other form is
  class `usage`, exit 2: `JOB_NOT_FOUND` (a well-formed id or token that names no job, D-061 (1)), `JOB_TOKEN_SHARED`
  (a token several ids share), `JOB_NOT_EXACT` (a label, a label prefix, a shorter suffix, an empty word, anything
  else). The message lists the candidates an approximate match would have found (token, or the full id without a
  unique token, then label and state; newest first; at most 10, the rest counted; a record that cannot be read is a
  candidate only when the word matches its id, listed as `damaged record`; round 1, fix 1). `next` is the same command
  line with the one candidate's reference, or `limen status --all` for several or none. The group member's control
  check is `JOB_OTHER_TEAM`, class `refused`, `next` `limen show <ref>`. `withNewJobId(root, label, create)` draws the
  token under `withLock({ file: <root>/.limen/jobs })` against the folders of `.limen/jobs/` and `.limen/unmigrated/`,
  draws again on a collision, and holds the lock until `create` (publication) has made the job's folder.
- `src/job/id.ts` (new, round 1, fix 3): the one definition of the job id's form: `TOKEN`, `JOB_ID`, `tokenOf`,
  `hexEndOf`, built from one spelling of the token form and one of the older 4-hex form.
- `src/parser.ts`: `Parsed` keeps its command; `commandWith(name, from, to)` rebuilds the command line from the schema
  with one value replaced, shell-quoted, so a hint's `next` parses to the same values.
- `src/job/job.ts`: `resolveJobId` removed; `makeJobId(label, token = jobToken())`, `jobToken()` added.
- `src/job/lookup.ts` removed (`git rm`).
- Callers: `continue`, `diff`, `keeper` (`--job`, repeatable, and group members), `land`, `open`, `show`, `steer`,
  `stop`, `watch`, `unwatch` call `resolveJob` from `src/job/reference.ts` with `jobArgument(values)`; `spawn`
  (`recordSpawnedJob` → `publishNewJob`) and `continue` name the new job through `withNewJobId`.
- `src/registry.ts`: the `JOB` about text is "the job's full id or its 8-character token".
- Tests: `test/job/reference.test.ts` (new, 11 tests after round 1); `test/cli/land.test.ts` (new) and
  `test/cli/stop.test.ts` (one test added): land and stop with a label exit 2 and leave `record.json` byte-identical;
  `test/structure.test.ts`: the job-matcher scan with its fixture self-test, a registry-derived scan that the module of
  every handler with an argument of type job resolves it through `src/job/reference.ts`, and (round 1) the two scans
  of fix 3 and the lowered `UNTYPED_THROWS` ratchet; `test/u7-job-ids.test.ts` keeps `makeJobId` and `parseDuration`;
  `test/outcome.test.ts` expects `JOB_NOT_FOUND` and exit 2 for `show` of an unknown id; `test/help.test.ts` the new
  about text.
- Docs and manual: `docs/commands.md` (`:7` explains the forms, the three codes and what `next` holds; every
  `<id|suffix|label>` is `<id|token>`; the unknown-id sentence names `JOB_NOT_FOUND`), `docs/jobs.md:77`, `:93`,
  `templates/agents.md:96-101`, `:166`, and the new first line of `templates/.history/agents.md`.

## Round 1 fixes

The four fixes of `ticket.md` → `## Decisions` → "2026-11-21 (main session, review round 1, `review.md`)". The rest of
the change stays as it was; the staged deletion of `src/job/lookup.ts` stays staged.

1. **A damaged record is a candidate only when the reference matches its id.** `hints` in `src/job/reference.ts` no
   longer adds every record that reads as `BAD_DATA`: such a record is a candidate only when the word is a token its id
   owns or, for 3 or more characters, ends its id, the one fact the resolver has for it. It never counts toward several
   candidates for a word it does not match, so a word that matches one readable job gets `next` with that job's token.
   The candidate's `matched` field went, because every candidate now matches. Tests in `test/job/reference.test.ts`:
   the earlier test "a record that cannot be read stops no other job's resolution and is listed as damaged" is split
   into "a record that cannot be read stops no other job's resolution" and "a record that cannot be read is listed as
   damaged when the reference matches its id" (`1e3f` with REVIEW's record damaged → the one line
   `  d4821e3f  damaged record`, `next` `limen land d4821e3f --yes`); new: "a record that cannot be read is no candidate
   for a label it may not hold, so the one readable match gets its token in next" (`F001 implementation` with REVIEW's
   record damaged → only IMPL's line, `next` `limen land 7a2f0b1c --yes`).
2. **`docs/commands.md:7` says what `next` holds**: "When a reference is refused, `next` is the same command with the
   token of the one job the reference may mean (its full ID when the job takes only that), or `limen status --all`
   when it may mean several jobs or none." The words "and the exact command in `next`" went.
3. **One owner of the id's form and of the folder listing** (T-25 (1), (2)).
   - The form: `src/job/id.ts` imports nothing, so `src/outcome.ts`, which `src/boundary.ts` loads, can read it while
     it loads (a definition in `src/job/job.ts` would close an import cycle through `src/boundary.ts`, which imports
     `parseDuration` from it). `src/outcome.ts` takes `ID_FORMATS.job` from `JOB_ID`; `src/job/reference.ts` lost
     `TOKEN`, `ID_TOKEN`, `JOB_ID` and `tokenOf`; `src/job/migration.ts` lost `TOKEN` and its inline 4-hex pattern, and
     `tokenReport` uses `tokenOf` and `hexEndOf`.
   - The listing: `jobFolderNames(folder)` in `src/job/record.ts`, the module that already listed job folders: the
     folder names, sorted, without hidden names, none when the folder does not exist (`ENOENT`), reading no record.
     `jobFolders` is it plus the `NOT_MIGRATED` check; `jobFoldersSync` shares its filter (`visibleFolders`). The
     resolver's `folderNames` and the migration's `folders` went; the token draw and the migration call
     `jobFolderNames`.
   - Tests in `test/structure.test.ts`: "T-25: outside src/job/id.ts no file of src/, hook/, bin/ or seat/ writes a
     pattern of a job id or its token, except the boot id" (a line scan for the date-and-slug pattern and for 8- or
     4-hex runs; the boot id's UUID pattern in `src/platform/linux.ts` is the one exception), and "T-25:
     src/job/reference.ts and src/job/migration.ts list job folders only through src/job/record.ts" (no `readdir`, and
     an import of `jobFolderNames` from `./record.ts`).
4. **The `UNTYPED_THROWS` ratchet falls to the count measured after the change**: 218 (`grep -ro 'throw new Error('
   src hook | wc -l` → 218 on the tree after the fixes; `git grep -o 'throw new Error(' HEAD -- src hook | wc -l` →
   222 at `HEAD`). The four sites the change removed: three in `resolveJobId` (`src/job/job.ts` 8 → 5) and the control
   check of `src/job/lookup.ts` (1 → 0). Its comment says the count is the one measured at R-022.

## Round 2 fixes

The two fixes of `ticket.md` → `## Decisions` → "2026-11-21 (main session, review round 2, `review.md`; the second
and last round of fixes)", items (2) and (3). Finding 1 of round 2 is not part of them: `test/cli/stop.test.ts`,
`test/plant.ts` and `src/job/finalize.ts` are unchanged by this round. The rest of the change stays as it was; the
staged deletion of `src/job/lookup.ts` stays staged.

2. **The id's form and its makers are tied by a test.** `test/job/id.test.ts` (new; T-29 (1), the module whose form it
   checks) has two tests: "every id makeJobId makes from a label and a drawn token is a JOB_ID that ends in that token"
   (ten labels at the edges of the slug: a feature number to hoist, other characters, nothing left, and a cut at 32
   that lands on a dash; `tokenOf(id)` must give back the drawn token, so an id of the older 4-hex form fails too) and
   "every token jobToken draws is a TOKEN" (64 draws). The comment at `src/job/id.ts:1-6` now says only what is true:
   the one module of `src/`, `hook/`, `bin/` and `seat/` that writes the form as a pattern (the scan of
   `test/structure.test.ts`); `makeJobId` and `jobToken` build ids and tokens without reading it, so
   `test/job/id.test.ts` checks them. The docs of `jobToken` and `makeJobId` (`src/job/job.ts`) point at the test.
   Choice (decision (2): "the implementer picks"): the test, not makers that take their form from `src/job/id.ts`;
   reason: the test checks what the makers really produce, whatever they compute, while constants shared from
   `src/job/id.ts` would still leave the slug's characters and the date to two spellings.
3. **The comment of `jobFolderNames` says what is true** (`src/job/record.ts:11-14`): it lists a folder of job folders
   with its rule for a folder that does not exist; `jobFolders` and its callers list through it, and
   `test/structure.test.ts` requires `src/job/reference.ts` and `src/job/migration.ts` to use it; `jobFoldersSync`
   reads the folder with its own `readdirSync` and `ENOENT` rule and shares only the filter of names with it. No claim
   that it is the only listing; the other listings stay where they are (Open points).

## Proof

### After the round-2 fixes

The main session, after D-063 (2) (Adrian's decision on the implementer's `BLOCKED`, `ticket.md` → `## Decisions`):

- The failed test measured, not rerun for a green result: `node --test test/s3-finish-wake.test.ts` → exit 0 in 10 of
  10 runs on this tree (7/7 each), and `node adrian-rebuild/tools/fails-before.mjs test/s3-finish-wake.test.ts` →
  exit 1 ("pass at HEAD") in 10 of 10 runs, so the file passes alone on both trees. Five orphaned wrappers from the
  night's gate runs (queued since 03:55 in deleted plants, polling every 50 ms) were loading the machine; the session
  stopped them with Adrian's consent, and R-094 makes a queued wrapper end when its job folder is gone.
- The main session's own gate run, which counts for review round 3: `node adrian-rebuild/tools/gate.mjs` → exit 0;
  `tests 504`, `pass 504`, `fail 0`, `cancelled 0`, `skipped 0`, duration 100.7 s.
- `node adrian-rebuild/tools/fails-before.mjs` → exit 0 (eight files; its output is in `## Fails before` → Round 2
  fixes).

The implementer's runs, from the repository root:

- `node adrian-rebuild/tools/gate.mjs` → **exit 1**. The tail of its output: `pass 503`, `fail 1`, `cancelled 0`,
  `skipped 0`, `duration_ms 112318`; the `tests` line was above the tail I kept (502 before this round plus the 2
  new tests). The one failing test is unchanged by R-022 and by this round:

  ```
  test at test/s3-finish-wake.test.ts:200:1
  ✖ a held gate queues jobs by priority and a rule's start priority holds the rest; a queued job tells its session once that it started, then its finish wakes it once (12780.068959ms)
    AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:

    'failed' !== 'done'

        at TestContext.<anonymous> (file:///…/test/s3-finish-wake.test.ts:234:9)
    …
    actual: 'failed',
    expected: 'done',
  ```

  Line 234 is `assert.equal(waitJob(p, timed), "done")`: the queued job spawned with `--timeout 2s` ended `failed`.
  By D-029 and the implementer's definition I ran neither the gate nor that test again, and stopped with `BLOCKED`.
  What this round changed in the code that test runs: comments only (`src/job/id.ts`, `src/job/job.ts`,
  `src/job/record.ts`); `test/job/id.test.ts` is a separate file. What R-022's whole change touches in the code that
  test runs: `spawn` (`src/commands/spawn.ts`: the id drawn by `withNewJobId` under `.limen/jobs.lock`, held through
  `publishNewJob`), and `stop` and `show` (`src/commands/stop.ts`, `src/commands/show.ts`: the resolver), which the
  test calls with full ids.
- `node --test test/job/id.test.ts test/u7-job-ids.test.ts test/job/reference.test.ts test/structure.test.ts` → exit 0,
  `tests 47`, `pass 47`, `fail 0` (run before the gate).
- After the gate, the checks that do not run the failing test: `npx tsc --noEmit` → exit 0; `npx biome check
  --error-on-warnings .` → exit 0 ("Checked 212 files … No fixes applied."); `npx biome check --error-on-warnings
  adrian-rebuild` → exit 0 ("Checked 32 files … No fixes applied."); `node adrian-rebuild/tools/check.mjs` → exit 0
  ("… PL summaries: 154 files; ticket folders: 26; changes: 24 entries; 0 errors").

### After the round-1 fixes

After the round-1 fixes, the main session's own gate run, which counts for review round 2: `node
adrian-rebuild/tools/gate.mjs` → exit 0; `tests 502`, `pass 502`, `fail 0`, `cancelled 0`, `skipped 0`, duration
123.5 s.

After the round-1 fixes (the implementer's runs, from the repository root):

- `node adrian-rebuild/tools/gate.mjs` → exit 0; `tests 502`, `pass 502`, `fail 0`, `cancelled 0`, `skipped 0`,
  duration 111.1 s (498 before the fixes, plus 2 resolver tests from the split and the new damaged-record test, plus
  the 2 scans of fix 3).
- `node adrian-rebuild/tools/check.mjs` → exit 0 ("… PL summaries: 154 files; ticket folders: 26; changes: 24 entries;
  0 errors").
- `npx biome check --error-on-warnings adrian-rebuild` → exit 0 ("Checked 32 files … No fixes applied.").
- `npx biome check --error-on-warnings .` → exit 0 ("Checked 211 files … No fixes applied.").
- `npx tsc --noEmit` → exit 0.
- AC-1 `node --test test/job/reference.test.ts` → exit 0, 11/11.
- AC-2 `node --test test/u7-job-ids.test.ts` → exit 0, 2/2.
- AC-3 `node --test test/s5-land.test.ts` → exit 0, 6/6; `node --test test/s3-finish-wake.test.ts` → exit 0, 7/7.
- AC-4 `node --test test/registry.test.ts` → exit 0, 12/12; `node --test test/help.test.ts` → exit 0, 10/10;
  `node --test test/outcome.test.ts` → exit 0, 36/36.
- AC-5 `node --test test/structure.test.ts` → exit 0, 32/32.
- AC-6 `git grep -n -E 'resolveJobId|job/lookup\.ts' -- src hook bin seat test` → no line (exit 1); the same pattern
  with a plain `grep -rn`, which also reads the untracked files, → no line (exit 1).
- AC-7 the docs grep of the ticket → no line (exit 1).
- `node --test test/cli/land.test.ts` → exit 0, 1/1; `node --test test/cli/stop.test.ts` → exit 0, 2/2;
  `node --test test/cli/migrate.test.ts` (the migration whose listing and token report fix 3 changed) → exit 0, 18/18.

Before the fixes: the main session's own gate run, which counted for review round 1: exit 0, tests 498, pass 498,
fail 0, cancelled 0, duration 112.9 s; `npx tsc --noEmit`, `npx biome check --error-on-warnings .` ("Checked 210
files") and `node adrian-rebuild/tools/check.mjs` (153 PL summaries) → exit 0.

## Fails before

### Round 2 fixes

`node adrian-rebuild/tools/fails-before.mjs` (main session, after its gate of 504/504, before round 3; `HEAD`
`4fbf8f3`, whose `src/` and `test/` equal R-021's `0e4e588`) → exit 0:

```
fails-before: test/cli/stop.test.ts, test/help.test.ts, test/outcome.test.ts, test/structure.test.ts, test/u7-job-ids.test.ts, test/cli/land.test.ts, test/job/id.test.ts, test/job/reference.test.ts fail at HEAD (exit 1)
```

`test/job/id.test.ts` was written before the comments changed. On the tree it passes (`node --test
test/job/id.test.ts` → exit 0, `tests 2`, `pass 2`), because the link it checks holds there; at `HEAD` it fails at
the import of `src/job/id.ts`, which `HEAD` lacks. To show that it fails when the link breaks, I ran it against two
copies in the operating system's temporary directory (`<tmp>` below), each with one side of the link changed and the
other side the repository's own file (`cp` and `sed -i` are off the allow-list, so the copies were written with the
Write tool; `diff` against the repository's files shows only the named change and comments):

- **The token form has 10 hex characters** (`<tmp>/id-broken-token/src/job/id.ts`, `TOKEN_FORM =
  "[0-9a-f]{10}"`; the repository's `src/job/job.ts`): `node --test <tmp>/id-broken-token/test/job/id.test.ts` →
  exit 1, `tests 2`, `pass 0`, `fail 2`, the expected reason, the 8-hex ids and tokens the makers build:

  ```
  ✖ every id makeJobId makes from a label and a drawn token is a JOB_ID that ends in that token
    AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
    + [
    +   {
    +     id: '2026-11-21-f001-implementation-c8b083fd',
    +     label: 'F001 implementation'
    +   },
    …  (all ten labels)
    + ]
    - []
  ✖ every token jobToken draws is a TOKEN
    AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
    + [
    +   '7b214a4c',
    +   'b159ac50',
    …  (all 64 draws)
    + ]
    - []
  ```

- **`makeJobId` cuts the slug at 40 characters instead of 32** (`<tmp>/id-broken-slug/src/job/job.ts`, a copy of
  `makeJobId` with `.slice(0, 40)` and the repository's `jobToken`; the repository's `src/job/id.ts`): `node --test
  <tmp>/id-broken-slug/test/job/id.test.ts` → exit 1, `tests 2`, `pass 1`, `fail 1`: only the id test fails, on the
  two labels whose slug passes 32 characters, so each test fails for its own reason:

  ```
  ✖ every id makeJobId makes from a label and a drawn token is a JOB_ID that ends in that token
    AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
    + [
    +   {
    +     id: '2026-11-21-abcdefghij-abcdefghij-abcdefghi-abc-b7d353c4',
    +     label: 'abcdefghij abcdefghij abcdefghi abc'
    +   },
    +   {
    +     id: '2026-11-21-an-extremely-long-label-that-keeps-going-fd1c9f1e',
    +     label: 'an extremely long label that keeps going well past the slug bound'
    +   }
    + ]
    - []
  ✔ every token jobToken draws is a TOKEN
  ```

Fix 3 changes a comment only, so it has no test.

### Round 1 fixes

Each test of fixes 1, 3 and 4 was written or changed before the code, and run against the tree as I found it (the
change of the night run, before the fixes):

- Fix 1: `node --test test/job/reference.test.ts` → exit 1, `tests 11`, `pass 10`, `fail 1`, the expected reason:

  ```
  ✖ a record that cannot be read is no candidate for a label it may not hold, so the one readable match gets its token in next
    AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
    + actual - expected
      [
        [
    +     '  d4821e3f  damaged record',
          '  7a2f0b1c  F001 implementation  done'
        ],
    +   'limen status --all'
    -   'limen land 7a2f0b1c --yes'
      ]
  ```

  The two tests split from the earlier damaged-record test pass on that tree: they keep mechanisms it already had
  (another job resolves; a record matched by its id is listed as damaged). At `HEAD` every test of the file fails at
  the import of the missing `src/job/reference.ts`.
- Fix 3: `node --test --test-name-pattern='T-25: outside src/job/id.ts|T-25: src/job/reference.ts and'
  test/structure.test.ts` → exit 1, `tests 2`, `fail 2`, the expected reasons:

  ```
  ✖ T-25: outside src/job/id.ts no file of src/, hook/, bin/ or seat/ writes a pattern of a job id or its token, except the boot id
    + [
    +   'src/job/reference.ts:20: [0-9a-f]{8}',
    +   'src/job/reference.ts:22: [0-9a-f]{8}',
    +   'src/job/reference.ts:24: \\d{4}-\\d{2}-\\d{2}-',
    +   'src/job/reference.ts:24: [0-9a-f]{4}',
    +   'src/job/reference.ts:24: [0-9a-f]{8}',
    +   'src/job/migration.ts:88: [0-9a-f]{8}',
    +   'src/job/migration.ts:478: [0-9a-f]{4}',
    +   'src/outcome.ts:40: \\d{4}-\\d{2}-\\d{2}-',
    +   'src/outcome.ts:40: [0-9a-f]{4}',
    +   'src/outcome.ts:40: [0-9a-f]{8}'
    + ]
    - []
  ✖ T-25: src/job/reference.ts and src/job/migration.ts list job folders only through src/job/record.ts
    + [
    +   'src/job/reference.ts',
    +   'src/job/migration.ts'
    + ]
    - []
  ```

  At `HEAD` the copies are those of `src/outcome.ts:40` and `src/job/migration.ts:88`, `:478` (`git grep -n -E
  '\\d\{4\}-\\d\{2\}-\\d\{2\}-|\[0-9a-f\]\{[48]\}' HEAD -- src hook bin seat` → those three lines and the boot id at
  `src/platform/linux.ts:78`), and the listing scan fails on reading `src/job/reference.ts`, which `HEAD` lacks.
- Fix 4: the ratchet passes on the tree as I found it, because that tree had already removed the four sites (218 ≤
  218); lowering it is what makes their return fail. Against `HEAD`'s sources (`git archive HEAD` extracted to a
  temporary folder, with the new `test/structure.test.ts` laid over it), `node --test --test-name-pattern='untyped
  throw new Error' test/structure.test.ts` → exit 1: `AssertionError [ERR_ASSERTION]: 222 sites of throw new Error(,
  at most 218`. That copy had no git repository (I may not run `git init`, `add` or `commit`), so there the format
  scan of fix 3 stopped at `git ls-files` instead of its assertion; `fails-before.mjs`, which builds a repository, is
  the check for it at `HEAD`.

### The change before round 1

My own runs before each change:

- `node --test test/job/reference.test.ts` before `src/job/reference.ts` existed → exit 1: `Error
  [ERR_MODULE_NOT_FOUND]: Cannot find module '/home/…/src/job/reference.ts' imported from …/test/job/reference.test.ts`
  (`tests 1`, `fail 1`), the expected reason.
- `node --test test/cli/land.test.ts test/cli/stop.test.ts`, run after `resolveJobId` had left `src/job/job.ts` but
  while the commands still imported `src/job/lookup.ts` → exit 1, both failing on `SyntaxError: The requested module
  './job.ts' does not provide an export named 'resolveJobId'` (land's in `limen init`, stop's at import). That is not
  the expected reason; at `HEAD` they fail because land and stop resolve the label and act on the job (exit 1 or 0,
  not 2), which `fails-before.mjs` shows.

New or changed tests that pass at `HEAD`, and why:

- `test/structure.test.ts` → "the job-matcher scan finds …": it tests the scan function on a fixture, not the code
  this ticket changes.
- `test/outcome.test.ts` → "UNTYPED: a refusal that carries no type of its own exits 1 with code UNTYPED": kept
  mechanism, moved from `show` (now `JOB_NOT_FOUND`) to a group member's `land`, which is still untyped.
- `test/u7-job-ids.test.ts`: only the `resolveJobId` test left; the two kept tests are unchanged.
- `test/cli/stop.test.ts` → the race test: unchanged.

`node adrian-rebuild/tools/fails-before.mjs` (main session, after its gate of 498/498, before round 1) → exit 0:

```
fails-before: test/cli/stop.test.ts, test/help.test.ts, test/outcome.test.ts, test/structure.test.ts, test/u7-job-ids.test.ts, test/cli/land.test.ts, test/job/reference.test.ts fail at HEAD (exit 1)
```

The tail it printed holds the registry check of `test/structure.test.ts` at `HEAD`'s copy: "T-20 (4): the module of
every handler that takes an argument of type job resolves it through src/job/reference.ts" with `unresolved:
['continue', 'steer', 'stop', 'land', 'diff', 'show', 'open', 'watch', 'unwatch', 'keeper']` against `unresolved: []`.
The round-1 fixes changed only `test/job/reference.test.ts` and `test/structure.test.ts` among the tests, both already
in that list; the main session runs `fails-before.mjs` again after its gate.

`node adrian-rebuild/tools/fails-before.mjs` (main session, after its gate of 502/502, before round 2; `HEAD`
`472d94a`, whose `src/` equals R-021's `0e4e588`) → exit 0:

```
fails-before: test/cli/stop.test.ts, test/help.test.ts, test/outcome.test.ts, test/structure.test.ts, test/u7-job-ids.test.ts, test/cli/land.test.ts, test/job/reference.test.ts fail at HEAD (exit 1)
```

Its tail shows fix 3's format scan failing at `HEAD` on its assertion, with `actual` `src/job/migration.ts:88`,
`src/job/migration.ts:478` and three patterns of `src/outcome.ts:40` against `expected: []`, and the listing scan on
reading `src/job/reference.ts`, which `HEAD` lacks.

## Night defaults

- Each handler calls the resolver with `jobArgument(values)`, not the wrapper before the handler; alternative: the
  wrapper; reason: `continue` and `keeper` resolve in their own canonical root (inherited planning, a group's root),
  which the wrapper does not know, and the registry scan checks every job-typed entry.
- A hint's `next` is the command line rebuilt by `Parsed.commandWith` from the schema with the one candidate's
  reference; alternatives: swapping the word in the raw arguments (wrong when another argument has the same text) or
  `limen show <token>` (not the command); reason: D-061's "the command with the one candidate's token", and it
  passes the parser (D-045 (2)), also for `steer` and `stop` with their text.
- Codes: `JOB_NOT_EXACT` (label, label prefix, shorter suffix, empty, other forms), `JOB_TOKEN_SHARED`,
  `JOB_OTHER_TEAM` (`refused`, `next` `limen show <ref>`, which a member may run); alternative: one code for every
  non-exact form; reason: a shared token asks for the full id, the others for any exact form.
- Candidate line `  <ref>  <label>  <state>`, a damaged one `  <ref>  damaged record`. The night run listed a damaged
  record in every hint list; review round 1 replaced that default (fix 1): a damaged record is a candidate only when
  the word matches its id.
- Hint rules as the old matcher (an exact label; for 3 or more characters an id suffix or a case-insensitive label
  prefix); newest first by the record's first transition, an unreadable record by its id (which starts with the date).
- The token's lock is `withLock({ file: <root>/.limen/jobs })`, the file `.limen/jobs.lock`; alternative: `{ folder:
  jobsRoot }` (`.limen/jobs/.lock`); reason: `hook/wake.ts` lists `.limen/jobs` with `readdirSync` and no filter.
- The lock spans spawn's worktree plan, member claim and publication (`publishNewJob`) and continue's member claim and
  publication; alternative: a reservation file; reason: the ticket's "held until the job's folder exists", with no new
  on-disk format.
- `makeJobId` stays in `src/job/job.ts` with a `token` parameter; the scan allows its call only there and in the
  resolver; alternative: move it into the resolver; reason: fewer moved lines, `test/u7-job-ids.test.ts` keeps it.
- Test places by T-29: `test/job/reference.test.ts`, `test/cli/land.test.ts`, `test/cli/stop.test.ts` (not
  `test/s5-land.test.ts` or `test/s3-finish-wake.test.ts`).
- The matcher scan is a line scan with an exception list of three label comparisons that name no job (spawn's
  live-label warning, two Herdr tab labels); the resolver scan reads each job-typed entry's handler module from the
  imports of `src/registry.ts`.

## Round 1 choices

- The owner of the id's form is a new module, `src/job/id.ts` (decision (3): "the implementer picks it");
  alternatives: `src/job/job.ts`, which makes the ids (an import cycle through `src/boundary.ts` would make
  `src/outcome.ts` read the form before it exists, depending on which module loads first), or `src/outcome.ts`, which
  owns the final line, not the id. `makeJobId` and `jobToken` stay in `src/job/job.ts`, as the night run left them.
- The owner of the listing is `src/job/record.ts`, which already listed job folders (`jobFolders`); the listing
  `jobFolderNames` drops hidden names, as the migration's and `jobFolders` already did, so the token draw now ignores
  a hidden folder in `.limen/jobs/` or `.limen/unmigrated/`. Publication stages a job in `.limen/.publishing-<id>`
  (`src/job/publication.ts`), outside `.limen/jobs/`, so no hidden job folder holds a job's token.

## Deviations from the ticket

- `templates/agents.md:96-101` (`<id|label>` → `<id|token>`) changed besides `:166`: AC-7's pattern covers them.
- `src/commands/continue.ts`'s usage sentence `<id|suffix|label>` → `<id|token>`.
- `test/outcome.test.ts`: besides the change at `:225`, the UNTYPED CLI test now uses a group member's `land`, so the
  UNTYPED mechanism keeps a CLI test.
- `src/parser.ts` changed (`Parsed.commandWith`), which `## Change` does not name; it carries D-061's `next`.
- Round 1: `src/job/id.ts` (new) and `src/job/record.ts` (`jobFolderNames`, `visibleFolders`) are files `## Change`
  does not name; decision (3) of review round 1 asks for one owner of each and leaves the module to the implementer.
- Round 2: `test/job/id.test.ts` (new) is a file `## Change` does not name; decision (2) of review round 2 asks for the
  test. Besides the comment at `src/job/id.ts:3` that decision (2) names, the docs of `jobToken` and `makeJobId` in
  `src/job/job.ts` point at the test, so a reader who changes a maker finds the check.

## Measurement

- unmeasured: a coordinator's retry after a refused label on the seat (M-05).
- unmeasured: the coordinator manual's size after the edit at `:166` (M-01).

## Open points

- Listings of `.limen/jobs/` of their own stay outside the three modules of decision (3): `hook/wake.ts` (three
  `readdirSync(jobs)`, at `:323`, `:885` and `:1169`), `src/job/wake-delivery.ts:306` and `seat/deploy.ts` (its own
  `jobFolders`, `:310`). The listing scan of fix 3 covers only `src/job/reference.ts` and `src/job/migration.ts`.
- The token lock serialises spawns in one project across git worktree planning; a lock wait beyond 60 s ends in
  `LOCK_TIMEOUT` (exit 3).
- Round 2: the gate failed once on the unchanged test "a held gate queues jobs by priority …"
  (`test/s3-finish-wake.test.ts:200`, the `--timeout 2s` job ended `failed`, not `done`); not run again (D-029).
  Settled by D-063 (2): measured alone with no difference between this tree and `HEAD`, one more gate run passed
  (504/504), and the test's dependence on the machine's load goes to R-094 (Proof → After the round-2 fixes).
