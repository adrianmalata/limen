<!-- PL: Wynik ticketu R-008 (szkic implementera): wycięte gałęzie macOS (pomocnik Ruby, memory_pressure, osascript,
opóźnione ponowne sprawdzenie startu procesu, darwin w package.json i macos-latest w CI) oraz ich opisy w siedmiu
miejscach dokumentacji. Plik podaje dowody (gate 83/83, check.mjs, Biome), brak testu padającego przed zmianą (cięcie
bez nowego testu) i odstępstwa: parametr deadline funkcji processInfo i znacznik czasu w reap.ts odpadły razem
z gałęzią, co dotknęło group-cabinet.ts i testu u9. Stan: zamknięty; bramka sesji głównej zielona, recenzja PASS
w jednej rundzie (review.md). -->

# Outcome: R-008 Cut the macOS branches

## Done

- `src/runtime/contain.ts`: `processInfo(pid)` reads `/proc/<pid>/stat` unconditionally. The non-Linux branch, the
  `PIDINFO_HELPER` constant, the `fileURLToPath` import, `isProcessInfo` and the `deadline` parameter (used only by the
  helper call) are gone. `runBounded` stays: `processTable` (`ps`) still calls it. `processAlive` stays: other modules
  import it. The Linux body is unchanged apart from indentation (`git diff -w` shows only the removed `if` line).
- `src/runtime/proc-pidinfo.rb`: deleted with `git rm`.
- `src/runtime/start-queue.ts`: `memoryFree` reads `/proc/meminfo` only; the `memory_pressure` branch, its comment and
  the `execFile` import are gone. The Linux body is unchanged apart from indentation.
- `src/integrations/herdr.ts`: `showSeatNotification` returns the result of the Herdr notification, or `false` when
  there is no Herdr binary; the `osascript` fallback is gone and the doc comment says only that.
- `src/runtime/reap.ts`: `BIRTH_RECHECK_MS`, its macOS comment and the recheck it guarded are gone. The map `births`
  (match time or `DEAD`) is now the set `gone`, because only the removed recheck read a match time; `sameBirth` and
  `ownerAlive` lose their `now` parameter for the same reason (see Deviations 2).
- `src/job/group-cabinet.ts`: `MEMBER_QUERY_MS` and the `deadline` it built are gone; `memberLive` calls
  `processInfo(pid)` (see Deviations 1).
- `test/u9-process-identity.test.ts`: the 60 s `query` wrapper and its comment are gone; the tests call `processInfo`,
  `containEscapedDescendants` and `ownerAlive` with their default query. Same tests, same assertions; the message
  "a gone pid needs no helper and no time" is now "a gone pid is absent". 6 lines added, 9 removed (`test/` 3,499 →
  3,496 lines).
- `package.json`: `os` is `["linux"]`. `.github/workflows/check.yml`: `os: [ubuntu-latest]`.
- Docs: `README.md:22`, `docs/setup.md:9`, `CONTRIBUTING.md:11`, `SECURITY.md:9`, `docs/jobs.md:159`,
  `docs/remote.md:77`, `docs/seat/README.md:78` describe Linux only.
- The LaunchAgent installer (`limen sweep --install`, `--uninstall`) stays for R-032, as `## Decisions` records.

## Proof

- Main session (the run that counts, protocol step 4): `node adrian-rebuild/tools/gate.mjs` → exit 0; tests 83, pass
  83, fail 0 (74.7 s). Review: PASS in round 1 (`review.md`).
- Implementer's runs:
- `npx tsc --noEmit` → exit 0.
- `npx biome check --error-on-warnings .` → exit 0 (181 files).
- `node adrian-rebuild/tools/gate.mjs` → exit 0; tests 83, pass 83, fail 0, cancelled 0, skipped 0 (74 s). The scenarios
  named under Risk pass: `s1-spawn`, `s2-hosted`, `s3-finish-wake`, `s9-housekeeping`, `u9-process-identity`.
- `node adrian-rebuild/tools/check.mjs` → exit 0, "0 errors".
- `npx biome check --error-on-warnings adrian-rebuild` → exit 0.
- AC-1: `git grep -n -i -E 'darwin|osascript|memory_pressure|pidinfo|/usr/bin/ruby' -- src hook bin package.json .github`
  → no output. The Bash tool does not show the exit status of a command with no output. As a control, the same command
  with `docs/vps.md` added prints only the two `docs/vps.md` lines, so the pattern works and the AC-1 paths have no
  match.
- AC-2: `git grep -n 'process.platform' -- src hook bin` → only `src/runtime/hosted-binding.ts:26`, `:85` and `:264`.
- AC-3: `git ls-files src/runtime/proc-pidinfo.rb` → no output.
- AC-4: no test file removed and no test added: `git diff --numstat -- test` → `6 9 test/u9-process-identity.test.ts`,
  and the gate still counts 83 tests.
- Before the change: `tsc` with the branch removed but `deadline` kept →
  `src/runtime/contain.ts(183,2): error TS6133: 'deadline' is declared but its value is never read.` (exit 2), so the
  parameter has to go with the branch.

## Fails before

not applicable: a cut with no new test.

## Tests removed with the cut

None. `test/u9-process-identity.test.ts` changed as listed under Done; no test was removed.

## Deviations from the ticket

1. Files outside `## Change`: removing `processInfo`'s `deadline` (required, see the TS6133 line under Proof) means the
   callers that passed one must stop: `src/job/group-cabinet.ts` (its `MEMBER_QUERY_MS` existed only for that value,
   "the default second is missed under heavy load", which was about the helper) and `test/u9-process-identity.test.ts`
   (its wrapper gave the helper 60 s, and one assertion passed `0`). On Linux the deadline was never read, so both
   behave as before.
2. `src/runtime/reap.ts` beyond item 4: once the recheck is gone, nothing reads the match time stored in `births`, so
   the map is a set of identities found gone, and `now` leaves `sameBirth` and `ownerAlive`. `ownerAlive(jobDir, now,
   query)` becomes `ownerAlive(jobDir, query)`; every caller outside `reap.ts` already passed only `jobDir`, and the two
   calls in u9 are updated.
3. One edge of AC-6 in `reap.ts`. With `BIRTH_RECHECK_MS = 0` the old guard `now - matched < BIRTH_RECHECK_MS` could still
   be true when a caller's `now` was earlier than a recorded match: after the wall clock stepped back, or in a
   `reapDeadJobs` pass whose `now` was fixed at its start while another call in the same process recorded a later
   match. There the old code returned `true` without reading `/proc`; the new code reads `/proc/<pid>/stat` once and
   returns what it finds. Production callers pass `Date.now()` or no `now` at all. The result differs only when the
   process ended between the two reads, and then the new answer is the correct one.
4. `SECURITY.md:9` said that on Linux containment never signals because "identity verification is macOS-only". That
   was the opposite of the code: on Linux `processInfo` reads the start time from `/proc`, and
   `containEscapedDescendants` signals a process whose pid and start time match. The new text says what `stop.ts` and
   `contain.ts` do (TERM to the job's process group, KILL after the grace period; an escaped descendant only while its
   identity matches; one whose identity cannot be read never).
5. `showSeatNotification`: when Herdr is missing or fails, it now returns `false` at once. Before, it first started
   `/usr/bin/osascript`, which fails with `ENOENT` on Linux and so also gave `false`. The result is the same; only that
   failed process start is gone.
6. `docs/remote.md:77` also says "OMP attribution" instead of "OMP and Darwin attribution", because item 6 removes macOS
   from that line. The platform check in `src/runtime/hosted-binding.ts:26` stays in the code (R-005).

## Measurement

- unmeasured: the CI matrix with only `ubuntu-latest`. The workflow runs on a push to `main` or on a pull request, and
  the rebuild pushes only `adrian-rebuild`. No M-NN covers it.
- unmeasured: npm refusing to install the package on another OS because of `os: ["linux"]`. That cannot be shown on
  Linux. No M-NN covers it.
- The Linux paths (`/proc/<pid>/stat`, `/proc/meminfo`, the Herdr notice) run on the seat as on the laptop; this
  change alters none of them. M-10 (gate run time) is recorded when the stage closes; this run took 74 s.

## Open points

- `ContainmentDependencies.query` and `ownerAlive`'s `query` parameter now have no caller that passes them. u9 was the
  only caller, and it passed the default function with a longer deadline. Both are left as they are.
- Left as they are because they are outside item 6 or named in `## Out of scope`: `docs/vps.md`; the Devin `macos`
  provider (R-003); `docs/jobs.md:194` and `hosted-binding.ts` (R-005); `docs/finish-webhooks.md` and
  `bin/tony-finish-ping.sh` (R-002); the symlinked-temp comments in `test/plant.ts` and `src/project/git.ts:332` (R-084);
  `SECURITY.md:7` ("Windows is unsupported"; R-081 rewrites `SECURITY.md`). Also left: "the Mac" as the owner's window
  in `docs/remote.md` and `docs/seat/README.md`, and the "Mac-wide cargo wrapper" in `docs/jobs.md:179`, because these
  name the owner's laptop, not a platform Limen supports.
