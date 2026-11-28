<!-- PL: Wynik R-107 (28.11 w nocy, przy `12679b4`), szkic implementera: `scopeState` czyta kody wyjścia 3 i 4
`systemctl --user is-active` jedną regułą, w której decyduje wypisane słowo (E-18), a każdy inny kod poza 0 zostaje
błędem wywołania ze szczegółem. Fałszywy `systemctl` planta odpowiada jak systemd 259: kod 4, gdy folderu scope'u nie
ma. Trzy testy padały przed zmianą (ścieżka końca joba i ścieżka sweepa); bramka 1553/1553, `check.mjs` i Biome
przechodzą. Stan: zamknięty; bramka sesji głównej 1553/1553, recenzja PASS w rundzie 1 bez znalezisk. -->

# R-107 outcome

## Done

1. `src/platform/linux.ts` (Change 1):
   - `NOT_ACTIVE` (`:51-56`) is now the set `{3, 4}` (`ReadonlySet<number>`). Its comment names both exits, 3 (LSB
     "program is not running") and 4 (LSB "status is unknown"), which the seat's systemd 259 gives for a unit it does not
     hold, and cites E-18.
   - `scopeState` (`:250`): `active.status !== null && NOT_ACTIVE.has(active.status)` replaces
     `active.status === NOT_ACTIVE`. For either exit the printed word decides, as before for exit 3: `inactive` or
     `failed` is `gone`, any other word is `active`. Every other exit still goes through `callFailure`: exit 0 is
     `active`, any other exit is `failed` with its detail (T-01).
   - The comments that said "exits 3" follow (T-30): `ENDED_STATES` (`:57-62`) says "exits `NOT_ACTIVE`", and the doc
     comment of `scopeState` (`:237-244`) says "exits 3 or 4 (`NOT_ACTIVE`)", "every other state printed with either
     exit", and that exit 0 is `active` and any other exit a failed call.
   - `unitAnswer`, `callFailure` and every other function are unchanged.
2. `test/platform/linux.test.ts` (Change 2):
   - `answeringSystemctl` (`:264-280`) names its folder `systemctl-<word>-<status>`, so one test can use one word with
     two exits.
   - New test (`:299-313`), "scopeState of a scope with no recorded cgroup reads exits 3 and 4 of is-active alike, by
     the printed word": `scopeState(UNIT, undefined)` under fakes answering `inactive`, `failed` and `deactivating`, each
     with exit 3 and with exit 4, gives `gone`, `gone`, `active` for both exits. The comment above it cites E-18.
   - The test of a failing call ("scopeState gives the user manager's first line of error …", exit 1) is unchanged.
3. `test/plant.ts` (Change 3): the fake `systemctl`'s `is-active` (`:213-218`) prints `inactive` with no member, then
   exits 4 when the scope's cgroup folder is missing (`[ -d "$root$cgroup" ] || exit 4`) and 3 when the folder is
   there. Its comment (`:183-194`) says so and cites E-18; the rest of that comment was rewrapped, with no change of
   words.
4. `test/runtime/reap.test.ts` (Change 4): new test (`:393-412`), "endLeftoverScopes clears the stuck of a finished job
   whose scope never started, and logs no failed end". The planted record is `failed` with kind `launch`, no `scope`,
   no identity, and `stuck` with one attempt. `endLeftoverScopes(jobs, new Set())` runs under the plant's `systemctl`,
   which exits 4 for that unit. The test expects no failure, no `stuck` and no `reap:` line. The file imports
   `endLeftoverScopes`, and its opening comment names the new mechanism (T-29 (5)).

## Proof

All from the repository root at `12679b4`, with the change in the working tree.

| Command | Exit | Tests |
|---|---|---|
| `node --test test/platform/linux.test.ts` (AC-1) | 0 | 28/28 (27 at HEAD, plus the new test) |
| `node --test test/job/finalize.test.ts` (AC-2) | 0 | 17/17 |
| `node --test test/runtime/reap.test.ts` (AC-3) | 0 | 14/14 (13 at HEAD, plus the new test) |
| `node --test test/cli/sweep.test.ts` (AC-3) | 0 | 44/44 |
| `git grep -q 'E-18' -- src/platform/linux.ts test/plant.ts` (AC-4) | 0 | — (exit 1 at HEAD, Decision 4) |
| `node adrian-rebuild/tools/fails-before.mjs test/plant.ts test/platform/linux.test.ts test/job/finalize.test.ts test/runtime/reap.test.ts` (AC-5) | 0 | the three test files fail at HEAD (below) |
| `node adrian-rebuild/tools/gate.mjs --out node_modules/.rebuild-review/R-107.gate` (AC-6) | 0 | 1553/1553, `fail 0`, `duration_ms 358480` |
| `npx biome check --error-on-warnings .` (AC-7) | 0 | 310 files |
| `node adrian-rebuild/tools/check.mjs` (AC-7) | 0 | "0 errors" |
| `npx biome check --error-on-warnings adrian-rebuild` | 0 | 36 files |

The gate ran once, on the final tree: `ℹ tests 1553`, `ℹ pass 1553`, `ℹ fail 0`, which is R-106's 1551 plus the two new
tests. No test failed in any run of this ticket, except the new and changed tests at HEAD.

## Fails before

The tests were written first, with `src/platform/linux.ts` not yet changed. AC-5 on the final tree, `node
adrian-rebuild/tools/fails-before.mjs test/plant.ts test/platform/linux.test.ts test/job/finalize.test.ts
test/runtime/reap.test.ts` → exit 0, again in the main session's run of protocol step 4 after its gate (1553/1553,
348.7 s), with the same first line. The tool prints the last 40 lines; the gate's private TMPDIR is shown as
`<gate TMPDIR>`:

```
fails-before: test/platform/linux.test.ts, test/job/finalize.test.ts, test/runtime/reap.test.ts fail at HEAD (exit 1)
      at TestContext.<anonymous> (file://<gate TMPDIR>/fails-before-94yncg/test/platform/linux.test.ts:311:9)
  …
test at test/runtime/reap.test.ts:395:1
✖ endLeftoverScopes clears the stuck of a finished job whose scope never started, and logs no failed end (44.964073ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected

    {
      failed: [],
  +   lines: [
  +     'reap: limen-job-2026-11-28-unheld-1a2b3c4d.scope not ended: exit code 4'
  +   ],
  +   stuck: {
  +     attempts: 2,
  +     detail: 'limen-job-2026-11-28-unheld-1a2b3c4d.scope not ended: exit code 4',
  +     since: '2026-11-28T02:25:46.228Z'
  +   }
  -   lines: [],
  -   stuck: undefined
    }
```

Since the tail shows only the last failures, each file also ran alone with the changed plant before
`src/platform/linux.ts` changed. Each run exited 0 and named its file as failing at HEAD. After these runs only
comment lines of the test files changed.

`node adrian-rebuild/tools/fails-before.mjs test/plant.ts test/platform/linux.test.ts` (path of the rule):

```
test at test/platform/linux.test.ts:301:1
✖ scopeState of a scope with no recorded cgroup reads exits 3 and 4 of is-active alike, by the printed word (13.171673ms)
  …
        {
  +       detail: 'exit code 4',
  +       kind: 'failed'
  -       kind: 'gone'
        },
        {
  +       detail: 'exit code 4',
  +       kind: 'failed'
  -       kind: 'gone'
        },
        {
  +       detail: 'exit code 4',
  +       kind: 'failed'
  -       kind: 'active'
        }
```

`node adrian-rebuild/tools/fails-before.mjs test/plant.ts test/job/finalize.test.ts` (path 1, the end; the
unchanged test of Change 3):

```
test at test/job/finalize.test.ts:226:1
✖ finalizeJob of a job whose scope never started sends no kill and logs no failed end of its scope (69.625814ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected

    [
      'failed',
      [],
  +   [
  +     '[limen 2026-11-28T02:17:23.623Z] scope limen-job-job.scope was not ended: exit code 4'
  +   ]
  -   []
    ]
```

That run's tail also shows a second unchanged test failing at HEAD for the same cause: "finalizeJob counts each steer
left in the inbox in its log line, …" (`:68`). Its job also has no scope, so at HEAD its log ends with `scope
limen-job-job.scope was not ended: exit code 4` after the `stopped:` line, and its `\n$` match fails.

## Deviations from the ticket

None in substance. Change 2 asks for a test with `inactive` and exit 4. The new test also covers `failed` and
`deactivating` with exit 4, and the three words with exit 3 beside them. This shows that the printed word decides for
exit 4 too, which Change 1 and AC-8 require. Without these cases, a rule that read every exit 4 as `gone` would also
pass.

## Unmeasured

- `unmeasured`, with no M-NN in `plan.md` → `## Measurement` that covers it: on the seat, an end or a sweep of a job
  whose record has no cgroup no longer logs `not ended: exit code 4`, and no `stuck` alert comes for such a job.
  `## Deployment` 4.13 checks it in the job logs (D-118 (1)). The fake answers as E-18 describes the seat. Whether
  systemd 259 exits 4 for a scope that it still holds in `deactivating` or `failed` was not seen (Out of scope); the
  word rule covers it as for exit 3.

## Open points

1. The Risk stands as the ticket names it: an exit 4 with `inactive` on stdout that is in fact a call failure reads as
   `gone`. An exit 3 or 4 with no word (an empty stdout) reads as `active`, as an exit 3 with no word did before. The
   reaper then sends TERM and KILL and, if the state still does not read `gone`, writes a `not ended` line, so the case
   stays visible (T-01). A bus failure exits 1 with its words on stderr and stays a failure.
2. `src/runtime/reap.ts` and `src/job/finalize.ts` are unchanged. Both paths read the one rule through
   `platform.scopeState` and `platform.endScope` (T-25 (1)).
