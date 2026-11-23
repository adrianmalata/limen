<!-- PL: Ticket R-100 (T-25, D-080): jedna definicja czasu ISO (z kontrolą zakresów), reguły 429, sprawdzenia kodu
błędu i listy folderów jobów, każda ze skanem w `npm run check` i testem, który pada przed zmianą. Siedem pozostałych
z ośmiu sprawdzeń kodu D-080 idzie przez `hasCode`, a pozostałe
miejsca `NodeJS.ErrnoException` stają się zapadką do zera w R-082. Stan:
napisany 22.11 przy `9da2fde` z inwentarza `evidence/inventories/R-100.md`; sprawdzony ponownie przy `9a370ae`
(R-033 przeniósł `absent` do `seat/registries.ts` już przez `hasCode`, więc zostaje siedem sprawdzeń, a `seat/alerts.ts`
dołącza do skanu listowania jobów); w nocy 23.11 sprawdzony przy `017a228` (te same wzorce, przesunięte linie),
wdrożony i zamknięty po recenzji PASS w rundzie 1. -->

# R-100 One definition of the ISO time, the 429 rule, the error-code check and the jobs listing

## Problem

Adrian's decision D-080 (gate 5.2, "Q29 rekomendacja"), quoted from `plan.md` → `## Decisions`: "a new fix ticket
R-100 (S, stage 3, delegated, night, before R-029; T-25 (2)): one definition of the ISO-time pattern of
`src/job/record.ts`, `src/lock.ts`, `src/job/migration.ts` and `src/job/usage.ts`, which also checks the ranges; the
older copy of the 429 rule in `src/job/listing.ts` through `isRateLimit`; the eight inline error-code checks of
R-093's open point through `hasCode`; `seat/deploy.ts`'s own `jobFolders` through the resolver's listing; each with a
test that fails before."

T-25 (1), quoted: "Code with a guarantee or a policy […] has exactly one module from its first use, named after its
responsibility; its primitive is banned outside it by a scan in `npm run check` (the pattern of A-022)." The plan's
convention (`## Stages`): "A scan that cannot hold at once over the author's code […] starts as a ratchet: a baseline
count in the repo that may only fall; R-082 and R-083 bring the counts to zero (T-27)."

Facts at `9a370ae` (the read-only inventory `adrian-rebuild/evidence/inventories/R-100.md`, taken at `9da2fde`; the
main session checked every fact it quotes again at `9a370ae`, after R-026, R-030 and R-033, and ran each scan pattern
of `## Change` there with `git grep`):
1. Four identical copies of `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/`: `src/job/record.ts:218` (through its
   `isoTime`, `:660-662`), `src/lock.ts:39` (`:379`), `src/job/migration.ts:89` (its own `isoTime(value): string |
   undefined`, `:461-463`, and `ISO_TIME.test(…)` at `:494`), `src/job/usage.ts:32` (`:153`). None checks a range:
   `2026-13-01T00:00:00.000Z` and `2026-02-30T00:00:00.000Z` pass the form. `Date.parse` gives NaN for a month 13 but
   rolls `2026-02-30` and hour 24 over to a valid time. `src/commands/rule.ts:206` is a looser form for `--until`
   (user input, offsets allowed); R-034 cuts `limen rule`.
2. `src/boundary.ts` (the validators of R-016; `matching` at `:225`) has no time validator;
   `test/structure.test.ts:328` forbids every other file of `src/`, `hook/`, `bin/`, `seat/` to declare a function name
   that `boundary.ts` declares; `lock.ts` and `usage.ts` already import it; `record.ts` imports `lock.ts`, so `lock.ts`
   cannot import `record.ts`.
3. The 429 rule: `isRateLimit` (`src/job/record.ts:637-640`, not exported; `/\b429\b/` and `rate_limit_error|rate
   limit`) and its older copy in `stopSummary` (`src/job/listing.ts:298`), the same predicate negated; no test covers
   the listing's copy.
4. `hasCode` (`src/system-error.ts:6-8`) checks the `code` of any object. Of the eight inline checks of R-093's open
   point, seven remain at `9a370ae`: `src/job/migration.ts:226`, `src/job/watching.ts:129`,
   `src/platform/requirements.ts:41`, `src/project/git.ts:494` and `:512`, `src/runtime/recovery.ts:26`,
   `src/integrations/herdr.ts:38-46` (`errorCode`, used at `:81` for Herdr's `tab_not_found`). The eighth,
   `seat/deploy.ts`'s `absent`, moved with R-033 to `seat/registries.ts:34-36` and already calls `hasCode` twice.
   Beyond them, 17 lines type an error as `NodeJS.ErrnoException` (9 casts, 8 typed callback parameters; the same set
   as the inventory's § 3, in `src/commands/sweep.ts`, `src/integrations/coordinator-wake.ts` (two),
   `src/integrations/github-poller.ts` (two), `src/integrations/github-review.ts`, `src/job/group-cabinet.ts`,
   `src/picture/board.ts`, `src/picture/dataset.ts`, `src/picture/picture-serve.ts`, `src/picture/tickets.ts` (two),
   `src/project/board-jobs.ts`, `src/project/seat-rules.ts`, `src/project/series.ts` (two),
   `src/project/ticket-folders.ts`).
5. `seat/deploy.ts:298-309` lists `.limen/jobs/` itself (`readdir`, directories only, hidden names kept, unsorted; no
   jobs when `absent(error)`, other errors wrapped as its `unreadable` failure, exit 4); its caller `runningJobs`
   (`:278-296`) must read unmigrated folders (`test/seat/deploy.test.ts:149`), so of the record module's listings
   only `jobFolderNames` (`src/job/record.ts:258-266`) fits; it already imports `src/job/record.ts`. `seat/alerts.ts`
   (R-033) lists through `jobFolderNames` already (`:342`). The scan `JOB_FOLDER_READERS`
   (`test/structure.test.ts:1121-1134`) covers `reference.ts` and `migration.ts` only, and its import pattern matches
   only `from "./record.ts"`.
6. No scan holds the ISO pattern, the 429 rule or the code checks today; no test holds a refused or out-of-range ISO
   time. The seat modules added since `9da2fde` (`seat/alerts.ts`, `seat/registries.ts`, `seat/tool-outcome.ts`,
   `seat/units.ts`) hold none of the patterns of (a)–(c) (`git grep` at `9a370ae`).

## Change

(a) ISO time (D-080; settled by the documents, `## Decisions` 1): `src/boundary.ts` gets `isIsoTime(value: string):
boolean` (the form of fact 1 and a round trip, `new Date(value).toISOString() === value`, so a month 13, a day 0,
`2026-02-30`, a `2026-02-29` and hour 24 are refused, and `2028-02-29` passes) and the validator `isoTime` built on it
("an ISO time"). `src/job/record.ts`, `src/lock.ts`, `src/job/migration.ts` and `src/job/usage.ts` use them and drop
their own `ISO_TIME` constants and `isoTime` functions. A scan in `test/structure.test.ts`: outside `src/boundary.ts`
no file of `src/`, `hook/`, `bin/`, `seat/` holds the pattern's text `\d{4}-\d{2}-\d{2}T`, with one exception,
`src/commands/rule.ts`, whose comment names R-034.

(b) The 429 rule: `isRateLimit` is exported from `src/job/record.ts`, and `stopSummary` in `src/job/listing.ts` calls
it; its output is unchanged. A scan: outside `src/job/record.ts` no file of `src/`, `hook/`, `bin/`, `seat/` holds
the text `\b429\b`.

(c) The error-code check: the seven checks of fact 4 go through `hasCode`, two codes by two calls (as
`seat/registries.ts`'s `absent` already does); `errorCode` in `src/integrations/herdr.ts` goes; the comment of
`hasCode` says it checks the `code` of any thrown
object, a system error or a tool's coded error. A scan: outside `src/system-error.ts` no file of `src/`, `hook/`,
`bin/`, `seat/` holds `"code" in` or `NodeJS.ErrnoException`; the 17 lines of fact 4 that type an error as
`NodeJS.ErrnoException` are a ratchet list, one entry per line (its file and the line's text), compared both ways, whose
comment names R-082.

(d) The jobs listing: `seat/deploy.ts` drops its own `jobFolders` and lists through `jobFolderNames` of
`src/job/record.ts`, wrapping every error but a missing folder as its `unreadable` failure (exit 4) as today; a hidden
folder is then skipped and a `jobs` path that is a file fails with exit 4 rather than reading as no jobs (both named
in `outcome.md`). `JOB_FOLDER_READERS` gains `seat/deploy.ts` and `seat/alerts.ts`, and its import
pattern also accepts the import of the record module from `seat/` (`from "../src/job/record.ts"`).

(e) Tests (T-29 (1), the tests of a module in its mirror file): `test/boundary.test.ts` holds the ISO cases of (a),
each refused value by name; a new `test/system-error.test.ts` holds `hasCode` on a Node error, on an error with a
tool's code and on a value that is no object; `test/seat/deploy.test.ts` holds a hidden folder and a file at the
`jobs` path; each scan of (a)–(d) has a fixture case that fails when a copy is added outside its module. The ISO
cases, the three scans and the grown `JOB_FOLDER_READERS` fail at `HEAD`.

## Out of scope

- The 17 `NodeJS.ErrnoException` lines (R-082 brings the ratchet to zero); the eight checks of a Limen code by
  `error instanceof LimenError && error.code === …` (typed by `instanceof`, the error module's own form).
- The wake's own listings of `.limen/jobs/` (R-051, D-080); the 37 `Date.parse` reads of stored times; a general scan
  of duplicate function names (T-25's Check, a later ticket).
- `src/commands/rule.ts`'s time forms (R-034 cuts the command).

## Acceptance

- AC-1: `node --test test/boundary.test.ts` → exit 0.
- AC-2: `node --test test/system-error.test.ts` → exit 0.
- AC-3: `node --test test/structure.test.ts` → exit 0.
- AC-4: `node --test test/seat/deploy.test.ts` → exit 0.
- AC-5: `node --test test/job/record.test.ts` → exit 0; `node --test test/lock.test.ts` → exit 0.
- AC-6: `node --test test/job/usage.test.ts` → exit 0; `node --test test/cli/migrate.test.ts` → exit 0.
- AC-7: `node adrian-rebuild/tools/fails-before.mjs` → exit 0, its output in `outcome.md` → `## Fails before`.
- AC-8: `node adrian-rebuild/tools/gate.mjs` → exit 0.
- AC-9: `npx biome check --error-on-warnings .` → exit 0; `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-10 (judgment): each of the four rules has one definition, every former copy uses it, and the ratchet list of (c)
  holds exactly the lines of fact 4 that remain (its size in `outcome.md`).

## Migration

None. Every stored time is written by `toISOString()`, so no stored record or lock holds an out-of-range time.

## Risk

- A hand-edited record or lock with an out-of-range time now reads as `BAD_DATA` (record, lock) or "not an ISO time"
  (migration) rather than passing; that is the point of the range check.
- `seat/deploy.ts` reads a file at the `jobs` path as unreadable (exit 4) instead of as no jobs; the deployment then
  stops rather than going on blind (z. 10).

## Rollback

`git revert $(git log --format=%H --grep='^R-100:' adrian-rebuild --)`.

## Decisions

Settled by the documents when the ticket was written (2026-11-22, the main session's reading, not a night default):
1. The ISO time lives in `src/boundary.ts`, the module of validated boundary data (R-016): `lock.ts` and `usage.ts`
   already import it, it imports neither `record.ts` nor `lock.ts`, and its name scan (fact 2) then forbids a copy of
   `isoTime`. The round trip is the range check with the fewest moving parts: it refuses every value that `Date.parse`
   would roll over, leap days included.
2. The code-check scan follows the plan's ratchet convention for the 17 lines beyond D-080's eight, rather than
   widening the ticket; D-080 names the eight.
3. Two codes by two calls, not a list parameter (KISS); `hasCode`'s one module holds Herdr's coded error too, since
   it checks the same property the same way.
4. `seat/deploy.ts` takes `jobFolderNames`, not `jobFolders`, because it must read the unmigrated folders that
   `jobFolders` refuses (`test/seat/deploy.test.ts:149`).
5. Checked again at `9a370ae` for the night of D-091 (2026-11-22, the main session's reading, not a night default):
   R-033 moved `absent` into `seat/registries.ts`, already through `hasCode`, so D-080's eight checks are seven at
   `HEAD`, and `## Change` (c) keeps the rest of D-080's text. `seat/alerts.ts` (R-033) is a second seat reader of job
   folders and already lists through `jobFolderNames`, so `JOB_FOLDER_READERS` names it with `seat/deploy.ts`: the
   scan then holds what the code already does (T-25 (1)), and a seat file's import path needs the pattern widened.

- 2026-11-23, night, before the implementation (the main session; what R-027 `ddea3ef`, R-028 `fe092f9`, R-031
  `34a40d0` and R-035 `017a228` changed since the facts above were read at `9a370ae`; not a decision): every scan
  pattern of `## Change` was run again at `017a228` with `git grep` over `src`, `hook`, `bin`, `seat` and matches the
  same set, at moved lines. Of the files this ticket names only `src/job/migration.ts`, `src/job/record.ts`,
  `src/project/git.ts` and `test/structure.test.ts` changed. Fact 1: the ISO pattern is at `src/job/record.ts:243` and
  `src/job/migration.ts:97`. Fact 3: `isRateLimit` is at `src/job/record.ts:767-769`, `stopSummary`'s copy still at
  `src/job/listing.ts:298`. Fact 4: the seven checks are at `src/job/migration.ts:339`, `src/job/watching.ts:129`,
  `src/platform/requirements.ts:41`, `src/project/git.ts:572` and `:590`, `src/runtime/recovery.ts:26`,
  `src/integrations/herdr.ts:38-46`; the 17 `NodeJS.ErrnoException` lines are the same set; R-035's new code
  (`src/platform/linux.ts`) already calls `hasCode`. Fact 5: `jobFolderNames` is at `src/job/record.ts:290`;
  `JOB_FOLDER_READERS` (`test/structure.test.ts:1125-1130`) now also names `src/job/statistics.ts` and
  `src/integrations/github-review.ts` with `archivedJobs` (R-031), and its import pattern already accepts
  `../job/record.ts`, so (d) adds the form `../src/job/record.ts` of `seat/`; `seat/deploy.ts` and `seat/alerts.ts`
  did not change their listings (`seat/deploy.ts:298` holds the only `readdir` of the two).
