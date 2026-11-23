<!-- PL: Wynik R-100 (T-25, D-080) z nocy 22/23.11, szkic implementera. Czas ISO ma jedną definicję w `src/boundary.ts`
(`isIsoTime` z kontrolą zakresów przez obieg przez `Date` i walidator `isoTime`), reguła 429 jedną w `isRateLimit`
(`src/job/record.ts`, teraz też dla podsumowania w `src/job/listing.ts`), sprawdzenie kodu błędu jedną w `hasCode`
(siedem miejsc przeniesionych, `errorCode` Herdra usunięty), a `seat/deploy.ts` listuje joby przez `jobFolderNames`.
Trzy nowe skany i poszerzony `JOB_FOLDER_READERS` mają przypadki na fiksturach; 17 linii `NodeJS.ErrnoException` to
zapadka dla R-082. Bramka 946/946, recenzja PASS w rundzie 1; domyślne decyzje nocne do potwierdzenia rano. -->

# R-100 outcome

## What was done

(a) ISO time. `src/boundary.ts` holds the form `ISO_TIME` (`/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/`), the
predicate `isIsoTime(value: string): boolean` (the form, then `Date.parse` finite and `new Date(time).toISOString() ===
value`, so a month 13, a day 0, `2026-02-30`, `2026-02-29` and hour 24 are refused and `2028-02-29` passes) and the
validator `isoTime(value, field)` ("an ISO time"). Both are function declarations, so the load order of the boundary and
its readers does not matter (the reason `src/job/record.ts` already gives for its validators). The four copies are gone:
`src/job/record.ts` (its `ISO_TIME` and `isoTime`; every field now uses the boundary's `isoTime`), `src/lock.ts` (the
lock record's `since`), `src/job/usage.ts` (`writtenAt`; its `matching` import went with it) and `src/job/migration.ts`
(its `ISO_TIME` and its `isoTime(value): string | undefined`; `started-at` and `finished-at` go through a local
`timeOf` that calls `isIsoTime`, and `queuedOf` calls `isIsoTime`). The name scan of `test/structure.test.ts:328` now
also forbids a copy of `isIsoTime` and `isoTime`.

(b) The 429 rule. `isRateLimit` in `src/job/record.ts` is exported, with a comment that it is the one rule the failure
kind and a job view's stop summary share; `stopSummary` in `src/job/listing.ts` calls it (`!isRateLimit(reason)` for
`!A || !B`, the same predicate), so its output is unchanged.

(c) The error-code check. The seven checks go through `hasCode` (`src/system-error.ts`): `whenAbsent` in
`src/job/migration.ts`, `exclusiveWrite` in `src/job/watching.ts`, `gitStartFailure` in `src/platform/requirements.ts`,
`miss` and the start failure in `git()` of `src/project/git.ts` (`ENOENT` or `EACCES`: two calls), `claimRecovery` in
`src/runtime/recovery.ts` (`EEXIST` or `ENOTEMPTY`: two calls), and `closeJobTab` in `src/integrations/herdr.ts`
(`hasCode(error, "tab_not_found")`), whose `errorCode` is removed. The comment of `hasCode` says it checks the `code` of
any object, a system error or a tool's coded error such as Herdr's `tab_not_found`, and that two codes are two calls; the
module comment names the scan and R-082.

(d) The jobs listing. `seat/deploy.ts` drops its own `jobFolders` and its `readdir` import; `runningJobs` lists through
`jobFolderNames` of `src/job/record.ts` and wraps every error the listing throws as its `unreadable` failure (exit 4).
Two behaviours change, as the ticket says:
- a hidden folder below `.limen/jobs/` is skipped, so it can no longer refuse a deployment as a running job;
- a file at the `jobs` path (`ENOTDIR`) fails the deployment with exit 4 (`cannot read <path>: ENOTDIR: …`) before the
  fetch, instead of reading as no jobs. `jobFolderNames` returns no jobs only for `ENOENT`.

A third difference, found by the review (round 1, note 2): `jobFolderNames` sorts the names, so the running jobs a
refused deployment lists come in the order of their ids rather than in the folder's order; only the order changes.

(e) Tests.
- `test/boundary.test.ts`: `isIsoTime` accepts three times (`2028-02-29` among them) and refuses four other forms; one
  test per out-of-range value, each named by what it is and the value (a month 13, a day 0, `2026-02-30`, `2026-02-29`,
  hour 24); `isoTime` returns the value, gives `BAD_DATA` "expected an ISO time" for `2026-02-30`, and refuses a date, a
  number and null.
- `test/system-error.test.ts` (new): `hasCode` on a Node error (`ENOENT` of a read in a fresh temporary folder), on an
  error with Herdr's code, and on a string, a number, null and undefined.
- `test/seat/deploy.test.ts`: a hidden job folder whose `starting` names this live process leaves the deployment at exit
  0 with "0 running jobs"; a file at `.limen/jobs` refuses with exit 4 before the fetch, naming the path and `ENOTDIR`.
- `test/structure.test.ts`: a line scan `linesHolding(files, literals, module)` over the files git knows below `src/`,
  `hook/`, `bin/` and `seat/`, and on it three scans, each with a fixture case that finds a copy outside its module:
  the ISO pattern's text `\d{4}-\d{2}-\d{2}T` outside `src/boundary.ts`, with the one exception `src/commands/rule.ts`
  (its comment names R-034); the text `\b429\b` outside `src/job/record.ts`; `"code" in` and `NodeJS.ErrnoException`
  outside `src/system-error.ts`, against the ratchet list `ERRNO_TYPED`, compared both ways (an unlisted line and a
  listed line no file holds both fail; equal lines count once each), whose comment names R-082. `JOB_FOLDER_READERS`
  gains `seat/deploy.ts` and `seat/alerts.ts` (`jobFolderNames`), its import pattern also takes
  `from "../src/job/record.ts"`, and its check is a function `ownListings(files, readers)` with a fixture case (a seat
  reader with its own `readdir`, one with `readdirSync`, and the accepted imports from `src/job/`, `src/` and `seat/`).

AC-10: each rule has one definition (`isIsoTime`/`isoTime` in `src/boundary.ts`, `isRateLimit` in `src/job/record.ts`,
`hasCode` in `src/system-error.ts`, `jobFolderNames` in `src/job/record.ts`), and `git grep` over `src`, `hook`, `bin`,
`seat` finds the ISO pattern only in `src/boundary.ts:26` and `src/commands/rule.ts:206`, `\b429\b` only in
`src/job/record.ts:771`, `"code" in` only in `src/system-error.ts:12`. The ratchet list holds 17 entries, exactly the
17 lines of fact 4 (13 files; two equal lines in `src/project/series.ts`); its scan's first run reported `gone: []`.

Files: `src/boundary.ts`, `src/system-error.ts`, `src/job/record.ts`, `src/job/listing.ts`, `src/job/migration.ts`,
`src/job/usage.ts`, `src/job/watching.ts`, `src/lock.ts`, `src/platform/requirements.ts`, `src/project/git.ts`,
`src/runtime/recovery.ts`, `src/integrations/herdr.ts`, `seat/deploy.ts`; tests `test/boundary.test.ts`,
`test/system-error.test.ts` (new), `test/seat/deploy.test.ts`, `test/structure.test.ts`.

## Proof

- `node adrian-rebuild/tools/gate.mjs` → exit 0: tests 946, pass 946, fail 0, cancelled 0 (926 at `HEAD` `017a228` +
  20 new: 8 in `test/boundary.test.ts`, 3 in `test/system-error.test.ts`, 7 in `test/structure.test.ts`, 2 in
  `test/seat/deploy.test.ts`), 214.8 s. The run was read through `tail`, so the status comes from `npm run check`'s
  chain: `tsc --noEmit && biome check --error-on-warnings . && node --test …` reached the tests, which ended with no
  failure. A first gate run before two comment edits (the comment of `isIsoTime` and one test comment) gave the same
  946/946.
- AC-1 `node --test test/boundary.test.ts` → exit 0, 41/41.
- AC-2 `node --test test/system-error.test.ts` → exit 0, 3/3.
- AC-3 `node --test test/structure.test.ts` → exit 0, 49/49.
- AC-4 `node --test test/seat/deploy.test.ts` → exit 0, 28/28.
- AC-5 `node --test test/job/record.test.ts` → exit 0, 28/28; `node --test test/lock.test.ts` → exit 0, 21/21.
- AC-6 `node --test test/job/usage.test.ts` → exit 0, 7/7; `node --test test/cli/migrate.test.ts` → exit 0, 28/28.
- `npx tsc --noEmit` → exit 0; `npx biome check --error-on-warnings src seat test` → exit 0 (221 files).
- AC-9 `npx biome check --error-on-warnings .` ran inside the gate, clean; `node adrian-rebuild/tools/check.mjs` → `0
  errors` (226 PL summaries, 44 ticket folders), read through `tail`; `npx biome check --error-on-warnings
  adrian-rebuild` → exit 0 (34 files).

## Fails before

The implementer's runs at the working tree with the tests written and no source change (AC-7, the main session's
`fails-before.mjs`, goes here too):

- `node --test test/boundary.test.ts` → the file fails (tests 1, fail 1): `SyntaxError: The requested module
  '../src/boundary.ts' does not provide an export named 'isIsoTime'`.
- `node --test test/structure.test.ts` → 4 of 49 fail:
  - the ISO scan: `src/job/migration.ts:97`, `src/job/record.ts:243`, `src/job/usage.ts:32` and `src/lock.ts:39`, each
    `const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;`;
  - the 429 scan: `src/job/listing.ts:298: if (!/\b429\b/.test(reason) || !/rate_limit_error|rate limit/i.test(reason)) {`;
  - the code-check scan: `added` holds the seven checks (`src/integrations/herdr.ts:42`, `src/job/migration.ts:339`,
    `src/job/watching.ts:129`, `src/platform/requirements.ts:41`, `src/project/git.ts:572` and `:590`,
    `src/runtime/recovery.ts:26`), `gone: []`;
  - the listing scan: `seat/deploy.ts: jobFolderNames`.
- `node --test test/seat/deploy.test.ts` → 2 of 28 fail: the hidden folder (`refused: 1 job runs, and a deployment now
  would mix two versions of Limen in one job`, `actual: [ 1, <older>, '' ]`) and the file at the `jobs` path (`actual:
  [ 0, <newer>, 'deployed-2026-11-19-063000', <newer> ]`, deployed as if the project had no jobs).
- `node --test test/system-error.test.ts` → 3/3 pass: `hasCode`'s behaviour does not change, and `## Change` (e) does
  not count this file among the tests that fail at `HEAD`; `fails-before.mjs` runs it with the other three files.

AC-7, the main session's `node adrian-rebuild/tools/fails-before.mjs` (every new or changed file under `test/`, over a
copy of `HEAD` `017a228`, in one run) → exit 0, first line:

```
fails-before: test/boundary.test.ts, test/seat/deploy.test.ts, test/structure.test.ts, test/system-error.test.ts fail at HEAD (exit 1)
```

Its tail showed the code-check scan's `added` with the seven checks and the listing scan's `seat/deploy.ts:
jobFolderNames`. The tool runs every changed test file in one `node --test` call and reports that call's exit, so its
line names `test/system-error.test.ts` too, which passes at `HEAD` on its own (above; review round 1, note 3). The
main session's gate on that tree: exit 0, 946/946 (215.4 s).

## Night defaults

Technical choices inside `## Change` that `taste.md` does not settle, for Adrian to confirm (D-054 (2) (b)):
1. The scans of (a)–(c) are text scans by line, as the job-id scan of `test/structure.test.ts` is: a finding is
   `<path>:<line>: <line text>`, and the ISO exception is the whole file `src/commands/rule.ts`, not one line of it.
2. The ratchet `ERRNO_TYPED` keys each entry by the file and the trimmed line text, and compares as a multiset: the two
   equal lines of `src/project/series.ts` are two entries, and a line that leaves the code is reported under `gone`.
3. The listing scan reads its readers from the files git knows below `src/`, `hook/`, `bin/` and `seat/` instead of
   reading each path itself, so a reader missing from the tree is a finding, not an `ENOENT` crash of the test.
4. In `seat/deploy.ts` the error mapping is a `.catch` inside `runningJobs`, with no function of its own.
5. In `src/job/migration.ts` the reader of `started-at` and `finished-at` is a local arrow `timeOf` that calls
   `isIsoTime`; in `src/project/git.ts` the two calls are one local `unstarted` boolean.
6. The out-of-range ISO cases are one test each, from a table, with the value in the test's name.

## Deviations from the ticket

1. `claimRecovery` (`src/runtime/recovery.ts`) used to keep only an `Error` with `EEXIST` or `ENOTEMPTY`; `hasCode` keeps
   any object with that code. The rename that throws there is Node's (`atomicRename`), so no case changes in practice.
2. The header of `src/system-error.ts` cited T-25 (2) (a pure function moved to the module that owns it, R-093); it now
   cites T-25 (1), since a scan in `npm run check` bans the primitive outside the module.

## Unmeasured

None: every change is checked by a test here; the deployment's two new behaviours by fixture tests of
`seat/deploy.ts` (D-036).

## Open points

1. T-27 (1): `claimRecovery` keeps its "split pending" suppression; this ticket changes one condition in it and splits
   nothing, and Biome reports the suppression as still needed. R-082's ratchet, as R-020 kept the same one.
2. The ratchet `ERRNO_TYPED` (17 lines) is R-082's to bring to zero. The `error.code === …` reads inside those callbacks
   (`src/picture/board.ts:15`, `src/picture/dataset.ts:32`, `src/picture/picture-serve.ts:146`, `src/picture/tickets.ts:51`
   and `:103`, `src/project/board-jobs.ts:31`) hold neither text of the scan; they are held by their parameter's line in
   the list, since without the type `tsc` refuses the read of `code` on `unknown`.
3. The text scans find a copy written as the module writes it; another spelling of the same rule (`[0-9]{4}-`, `/429/`
   with no word boundary, a cast to `{ code?: string }`) passes them. The judgment stays with the reviewer.
4. `JOB_FOLDER_READERS` checks only the readers it names, so a new module that lists `.limen/jobs/` itself passes until it
   is named; the wake's three listings and `src/job/wake-delivery.ts`'s are R-051's (D-080).
5. The gate's exit code was read from the end of its output through `tail` (see `## Proof`); the main session's own run
   counts (exit 0, 946/946, `## Fails before`).
