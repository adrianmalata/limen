<!-- PL: Wynik R-106 (noc 28.11, przy `c4aed10`; recenzja FAIL w rundzie 1, PASS w rundzie 2; decyzja 8 i wybory
techniczne z `## Night defaults` są domyślnymi nocnymi do potwierdzenia):
nowy moduł `seat/main-watch.ts` jest krokiem przebiegu alertów: dla każdego wpisu roota (płaskie poświadczenia
`watch_<projekt>.address`, `watch_<projekt>.key`, `watch_known_hosts` z decyzji 8) trzyma gołą kopię `main` w folderze
stanu, rozstrzyga kodami wyjścia gita i zachowuje stare czubki pod `refs/watch/forced/`; alerty `main:forced`,
`main:deleted` i `main:unwatched` idą jedną listą, jednym nadawcą i jednym zapisem wysłanych. Runda poprawek 1
(decyzja 9): klucz zapisu to czas zdarzenia (czas zachowanego refa, początek usunięcia w `<projekt>.deleted`), więc
każde wymuszenie i usunięcie dzwoni, także na znanym czubku; README, rozdzielone testy i komentarze; bramka 1551/1551. -->

# R-106 outcome

Status: done; the main session's gates 1544/1544 and 1551/1551, review FAIL then PASS (`review.md`).

## Done

1. `seat/main-watch.ts` (new, Change 1), called by `seat/alerts.ts run` after the record events:
   - The entries (Decision 8 (1)): `entryFolder` (`:149`) lists `$CREDENTIALS_DIRECTORY` for names that start with
     `watch_` (the credential id `WATCH_CREDENTIAL` of `seat/units.ts` and `_`, `PREFIX`, `:61`); `entryName`
     (`:170`) reads `<project>.address`, `<project>.key` and `known_hosts`, the project a name of
     `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`. No `.address` or `.key`, no watch, and no program runs.
   - Run-time checks (Decision 8 (4)): `completeEntries` (`:208`) and `entryText` (`:232`): present, a regular file
     (`lstat`, so no link), well formed by `malformed` (`:184`): the address one line of one word that does not start
     with `-`, the key's first line `-----BEGIN … PRIVATE KEY-----`, the known hosts with a host key line. A missing or
     malformed file of a project is a problem and that project is not watched; with no `watch_known_hosts` none is; a
     `watch_` file that is no entry file is a problem, and the complete entries are still watched (z. 10).
   - The registry cross-check (D-117 (3)): one output line `main of <name>: registered, but no watch entry (…)` for each
     registered base name with no entry; the registries decide nothing else.
   - Tools (T-12): `toolsRun` (`:266`) runs `git --version` and `ssh -V` once per run when an entry exists; one that
     cannot run is a problem, and no remote is reached.
   - The copy: `$STATE_DIRECTORY/main/<project>.git`, made by `git init --bare --quiet --template=` (`makeCopy`, `:414`);
     the held tip `refs/watch/main` (`HELD`, `:67`), each kept tip `refs/watch/forced/<UTC time>` (`KEPT`, `:68`), the
     time in the ISO basic form `YYYYMMDDTHHMMSS.mmmZ`, since `:` cannot stand in a ref name. Every git call names the
     copy with `--git-dir=`, so no repository of the process's working folder is read.
   - One check per run (`reach`, `:463`, Decision 1): `ls-remote --exit-code <address> refs/heads/main`: exit 2 is
     gone, exit 0 with the exact `refs/heads/main` line is the tip, any other end is out of reach. A tip other than the
     held one is fetched as an object: `fetch --quiet --no-tags --no-write-fetch-head --no-auto-gc --refmap= <address>
     <tip>`; a failed fetch is out of reach too. `follow` (`:493`): no held tip → `update-ref refs/watch/main <tip> ""`
     (create only), nothing raised; the same tip → nothing; `merge-base --is-ancestor` exit 0 → `update-ref` with the
     old value; exit 1 → the old tip to a new kept ref (create only), then the held ref with its old value; any other
     exit is a problem. A gone `main` keeps the held tip and raises `deleted` with it.
   - Events (Decision 8 (3), Decision 9): each run raises `forced` for every kept ref, under the ref's time, and
     `deleted` and `unwatched` from the current state, under the deletion's start and the first failed run; the
     alerts' record of what was sent sends each occurrence once (Done 6).
   - Failed runs (D-117 (2), Decision 8 (2)): `$STATE_DIRECTORY/main/<project>.failures` holds `<runs> <ISO time of the
     first>`, written with `atomicWrite` mode 0600 (`countFailure`, `:572`, through `writeState`, `:537`), read with
     `isIsoTime` of `src/boundary.ts` (`readStreak`, `:558`); a damaged file is a problem that names it. Each
     out-of-reach run is named (`main of <project>: the remote cannot be reached, <n> runs in a row (<git's last
     line>)`); from 15 (`UNWATCHED_AFTER`, `:59`) it raises `unwatched` with the streak's start as its time; a run that
     reaches the remote removes the file (`removeState`, `:546`). Out of reach is no problem, so it does not fail the
     alerts' run.
   - Git's environment (`gitEnvironment`, `:367`): only `PATH`, `GIT_CONFIG_NOSYSTEM=1`, `GIT_CONFIG_GLOBAL=/dev/null`,
     `GIT_TERMINAL_PROMPT=0` and `GIT_SSH_COMMAND` (`sshCommand`, `:382`): `ssh -F /dev/null -i '<key>' -o
     IdentitiesOnly=yes -o IdentityAgent=none -o 'UserKnownHostsFile=<known hosts>' -o GlobalKnownHostsFile=/dev/null
     -o StrictHostKeyChecking=yes -o UpdateHostKeys=no -o BatchMode=yes -o ConnectTimeout=10`, each path one quoted
     shell word. Each call has its own bound (Decision 8 (5)): `ls-remote` 20 s, `fetch` 60 s, a call on the copy 10 s
     (`:71-73`).
   - A local failure (`WatchFailure`, caught per project by `asProblem`, `:136`) is a line of the run's problems, which
     end the run with exit 4 after every other project (T-01, T-02).
   - The install's side: `checkWatchFolder` (`:608`) and `checkEntries` (`:640`): when `/etc/limen/watch` is there, a
     folder of root's with mode 0700; each file a regular file of root's with mode 0600, no link and no subfolder
     (Decision 8 (1)); no file of no entry; each project with both files; `known_hosts` beside them; each text well
     formed by the same `malformed`. A refusal exits 1, a failed read 4. `makeWatchFolder` (`:696`) makes the folder
     with mode 0700 when it is absent.
2. `seat/alerts.ts` (Change 2):
   - The one list (`EVENTS`, `:120`) holds the record events (`from: "record"`, unchanged) and the three `main` events
     (`from: "main"`, `main:forced` and `main:deleted` with the tip, `main:unwatched` without); `RECORD_EVENTS`
     (`:152`) is the record part, which the summary line and `projectAlerts` read, so the summary line is as before.
   - The run (`alertRun`, `:247`): the record events as before, then `watchMain` with the registered base names, then
     `sendMainEvents` (`:303`) through `sendNew` (`:281`), the one sender of both, which skips a key the record holds
     and records a key after a 2xx. `mainAlert` (`:316`) builds the key `<project>/main/<time of the occurrence>/<kind>`
     (Decision 9) and the line through `alertLine`, its tip cut to `TIP_CHARACTERS` (12). Main events pass no first
     read of A-054.
   - A run that reads no project still watches `main` and sends its lines, then exits 4 with the no-project line as
     before (Deviations, 2). When no run has read a project yet (`reported` absent), the empty list `projects` is
     written before a main send writes `reported`, so a run that then reads projects takes each as a first read.
   - `alertLine` (`:577`) takes an optional subject: `<project> main:unwatched` has none.
   - `credentialsFolder` (`:402`) is split out of `credentialTopic`, so the run hands the same folder to the watcher.
   - The install (`:613`): after the topic file, `checkWatchFolder`; `SEAT_TOOLS` (`:72`) gains `git --version` and
     `ssh -V`; before the units, `watchFolder` (`:657`) makes the folder when absent. The `units` step
     (`refreshUnits`, `:648`) makes it too, so `seat/deploy.ts`'s units step needs no change.
   - `AlertsInput` gains `watchFolder` and `now`; the entry point passes `WATCH_FOLDER` and `() => new Date()`.
3. `seat/units.ts` (Change 3): `WATCH_FOLDER = "/etc/limen/watch"` and `WATCH_CREDENTIAL = "watch"`; the service gets
   `LoadCredential=watch:/etc/limen/watch` after the topic's line. `TimeoutStartSec=120` stays (Open points, 1).
4. Tests (Change 4):
   - `test/seat/main-watch.test.ts` (new, 18 tests), through `runAlerts` with a local bare remote (its path as the
     address), real git, a recording runner (`ssh -V` answered by the runner), a local ntfy server and a clock one
     minute per run: the first hold (bare copy, no tags, nothing sent); a fast-forward; a forced update sent once over
     two runs with the old tip kept (T-28 (3)); a second forced update on another tip; a deletion sent once with the
     held tip kept; a re-created `main` on a descendant sends nothing more; the four tests of Done 6 (F1); out of reach
     named in each of 16 runs and `main:unwatched` sent once at the 15th; a reached remote ends the count (the file
     goes, and 14 further failed runs say "14 runs in a row" and send nothing); no git call holds `+`, `--force`, `-f`,
     `--prune`, `-p`, `--prune-tags`, `-P`, `--mirror`, `-d` or `--delete`, and every `update-ref` has four words (the
     old value given); every git call's environment is exactly the five names above with the exact ssh command and a
     bound, though the service's environment held `SSH_AUTH_SOCK` and `GIT_DIR`; a missing key, address or known hosts
     and a malformed address or key exit 4, name the file and send nothing of the project; a credential file of no
     entry exits 4 and the complete entry still sends its forced line; a missing git or ssh exits 4 and reaches no
     remote; a registered project with no entry is named and the run starts no program.
   - `test/seat/alerts.test.ts` (+14 tests, 64): a forced main line after the job lines of the same run; a main line
     ntfy took is recorded under its kept ref's time, and a second run sends nothing more; a refused main send exits 3
     and goes out on the next run; a seat with no entries sends the job lines as before, names both registered
     projects, and starts no program (three tests); a run that reads no project still sends the main line and exits 4;
     A-054: a main line sent before any run read a project leaves both projects for their first read; a line with no
     subject; the install and the units step make the folder (root's, 0700); the install accepts a complete folder;
     the install refuses eight shapes (folder mode 0755, entry 0644, an entry that is a link, a subfolder, a file of no
     entry, no key, no known hosts, an address of two lines) with exit 1 and no program run; the install exits 4
     naming `ssh` before any change. `installCommands` and two probe filters take the five probes (`PROBES`).
   - `test/seat/units.test.ts`: the golden service text with `LoadCredential=watch:/etc/limen/watch`.
   - Helpers: `test/seat/ntfy.ts` (the local ntfy server, moved out of `test/seat/alerts.test.ts` since both files
     need it) and `test/seat/watched-remote.ts` (the bare remote, its commits and `main` moves, the entry files, the
     copy's refs and its kept refs' times, the recording runner). The fixture key's first and last lines are joined in
     code, so the source holds no private-key header.
5. Docs (Change 5): `docs/seat/README.md` → `## Alerts`: the first paragraph names the main events, the state folder
   names `main/`, install step 4 names the watch folder's check, `git` and `ssh`, the deployment makes the folder, and
   a new `### The watch of main` gives the three lines, the copy and its refs, the sends and the failure classes, the
   entries and their credential names, and how to watch a project and stop. `docs/seat/agent-setup.md` phase 6: the
   alerts' tools line checks `git` and `ssh`; a block for the deploy key (generated as root outside the watch folder,
   its public half added on GitHub with write access off), the entry files, `known_hosts` with its fingerprint compared
   by the human, the install again, a check in the journal, and how to stop. No address, host or key name of the seat.
6. Review round 1 fixes (`review.md` → Round 1, `ticket.md` → Decision 9):
   - F1 (finding 1): a `MainEvent` (`seat/main-watch.ts:34`) carries `at`, the time of its occurrence, beside `tip`,
     and `mainAlert` keys it `<project>/main/<at>/<kind>`, so each forced update and each deletion rings once, a tip
     rung before included; the lines are unchanged (D-117 (5)). `forced`: `keptTips` (`:447`) reads each kept ref's
     time from its name (`for-each-ref --format=%(objectname) %(refname)`), `follow` returns the new kept ref's time,
     and each kept ref is its own event (the old dedup by tip is gone). `deleted`: the start of a deletion is kept in
     `$STATE_DIRECTORY/main/<project>.deleted`, one ISO time (`startDeletion`, `:595`; `readDeletion`, `:582`, a
     damaged file a problem that names its removal), written by the first run that sees `main` gone while a tip is
     held and removed by the first run that sees `main` again (`removeState`). `readStreak`, `countFailure`,
     `readDeletion` and `startDeletion` share `stateText`, `writeState` and `removeState` (`:525-555`), the former
     `endStreak` now `removeState`. The four new tests of `test/seat/main-watch.test.ts`: X→Y, Y→X, X→Z forced send
     three lines; a deletion at X, `main` again at X and a second deletion send two lines; a refused `main:forced` and
     a refused `main:deleted` each go out at the next run under their occurrence's key, and a further run sends
     nothing.
   - F2 (note 1): `docs/seat/README.md` → `### The watch of main` says that the start of a deletion is kept in
     `main/<project>.deleted`, that the record keys each occurrence by its time, that each new forced update or
     deletion sends (a tip sent before included), that a resend is of the same occurrence and a sent one never comes
     again, and what a local failure does: exit 4 once every entry it can watch is done; a missing or malformed entry
     file stops its project only, a credential of no entry stops none, and with no `known_hosts`, `git` or `ssh` no
     entry is watched.
   - F3 (T-29 (3)): "a forced update … sends one line after the job lines, and a second run sends nothing more" is two
     tests (the order; the one send, its key the kept ref's time), and "a seat with no watch entries alerts as before,
     names each registered project, and runs no program" is three (the job lines; the exact two output lines; an empty
     list of programs from a recording runner in place of the default runner's `assert.fail`).
   - F4 (T-30): `reach` (`:482-483`) says why `--no-auto-gc` (a background `gc --auto` would outlive the oneshot run,
     whose processes systemd ends with it), and `makeCopy` (`:422-423`) why `--template=` (no hook of the seat's
     template folder lands in the copy, and `update-ref` runs the `reference-transaction` hook).

## Proof

On the working tree at `c4aed10` with this change and the round 1 fixes:

| Command | Exit | Result |
|---|---|---|
| `node --test test/seat/main-watch.test.ts` (AC-1) | 0 | 18/18 |
| `node --test test/seat/alerts.test.ts test/seat/units.test.ts` (AC-2, AC-3) | 0 | 69/69 (64 and 5) |
| `git grep -q 'main:forced' -- seat/main-watch.ts seat/alerts.ts` (AC-4) | 0 | `seat/alerts.ts:148` (`main-watch.ts` is untracked until the commit; its header holds the word too) |
| `git grep -q 'main:forced' -- docs/seat/README.md` (AC-5) | 0 | `:45` |
| `node adrian-rebuild/tools/fails-before.mjs` (AC-6) | 0 | the main session's run of round 0: the three changed test files fail at HEAD (`## Fails before`); not run again in round 1 |
| `node adrian-rebuild/tools/gate.mjs --out node_modules/.rebuild-review/R-106.gate` (AC-7) | 0 | 1551/1551, `fail 0`, `duration_ms 345106` |
| `npx biome check --error-on-warnings .` (AC-8) | 0 | 310 files, no fixes |
| `node adrian-rebuild/tools/check.mjs` (AC-8) | 0 | 0 errors |
| `npx biome check --error-on-warnings adrian-rebuild` | 0 | after this outcome, no fixes |
| `npx tsc --noEmit` | 0 | no output |

The exit codes of AC-4 and AC-5 are read from `git grep -n` with the same patterns and paths. The gate count is
R-105's 1519 plus this ticket's 32 new tests (18 and 14). The gate ran after every change of code, tests and docs of
round 1; only this file changed after it.

## Fails before

`node adrian-rebuild/tools/fails-before.mjs` → exit 0 (the main session's run of protocol step 4 in round 0 after its
gate, 1544/1544, 353.4 s, with the same first line as the implementer's), first line:

```text
fails-before: test/seat/alerts.test.ts, test/seat/units.test.ts, test/seat/main-watch.test.ts fail at HEAD (exit 1)
```

`test/seat/units.test.ts` fails at HEAD on the golden service text (`- 'LoadCredential=watch:/etc/limen/watch\n'`
missing from HEAD's render). `test/seat/alerts.test.ts` and `test/seat/main-watch.test.ts` fail at HEAD on loading,
since `seat/program.ts` and the helpers' imports do not exist there.

The mechanism, run before the watcher existed:

- `node --test test/seat/main-watch.test.ts` with no `seat/program.ts` (the test written first) → exit 1, 0/1:
  `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '…/seat/program.ts' imported from …/test/seat/watched-remote.ts`.
- With `seat/program.ts` moved out of `seat/alerts.ts` (no behaviour change) and no `seat/main-watch.ts` → exit 1,
  1/14: no copy (`spawnSync git ENOENT` at `heldTip`, the copy's folder absent), no line named
  (`run 1: … 0 !== 1`), no git call (`used: []`, `0 git calls`), exit 0 where 4 was due (`no key: 0 !== 4`,
  `git: 0 !== 4`), no registry line. The one that passed, "a run that reaches the remote ends the count …", sent
  nothing either way; it was strengthened to check the count itself and then failed:

  ```text
  +   before: 'gone',
  +   last: false,
  -   before: 'kept',
  -   last: true,
  ```

- The A-054 step of `sendMainEvents` (no project read yet: the empty list first), which HEAD cannot show: with that
  step made unreachable in the working tree and restored after, `node --test --test-name-pattern="leaves every project
  for its first read" test/seat/alerts.test.ts` → exit 1, 0/1; the old job failure was sent and no first read named:

  ```text
  'read 2 projects: 1 failed job, 0 long start-queue waits, 0 stuck jobs\n' +
    'sent: synchronizer failed:quota 2026-11-16-f001-work-a-37c02ed6\n' +
  ```

Review round 1, F1: the four tests written first, on the working tree of round 0 (the key the held tip), `node --test
--test-name-pattern="though an earlier one sent the same tip|ntfy refused goes out at the next run"
test/seat/main-watch.test.ts` → exit 1, 0/4, each on its mechanism:

```text
✖ D-117: each forced update sends main:forced, though an earlier one sent the same tip: X to Y, Y to X and X to Z send three lines
        'synchronizer main:forced 820cb52cec90',
  -     'synchronizer main:forced 3b0d2c54fb3b'
✖ D-110: each deletion of main sends main:deleted, though an earlier one sent the same tip: two deletions at one tip send two lines
        'synchronizer main:deleted a926d65c185b',
  -     'synchronizer main:deleted a926d65c185b'
✖ a main:forced line ntfy refused goes out at the next run under its kept ref's time, and never again once ntfy took it
  +     'synchronizer/main/f4545b57f00715dfebd5259a99a2fe444f4b0979/forced'
  -     'synchronizer/main/20261128T030200.000Z/forced'
✖ a main:deleted line ntfy refused goes out at the next run under its deletion's start, and never again once ntfy took it
  +     'synchronizer/main/4997ff6528acd696a586e843c1ccff93f34a9024/deleted'
  -     'synchronizer/main/2026-11-28T03:02:00.000Z/deleted'
```

The first two lack the third forced line and the second deleted line. In the last two the posts matched already (a
refused send went out again before the fix too, Decision 8 (3)); they fail on the key the record holds, the held tip
where the occurrence's time is due, which is what keeps a later deletion or forced update of that tip silent. After
the fix the same command → exit 0, 4/4, and the whole file 18/18.

## Deviations from the ticket

1. Files beyond Change's list: `seat/program.ts` (new: `Ran`, `Runner`, `runProgram`, `failed`, `why` moved out of
   `seat/alerts.ts`, the runner gaining an environment and a bound per call), so `seat/main-watch.ts` needs no import
   from `seat/alerts.ts`, which imports it (T-25 (2)); `seat/tool-outcome.ts` (`modeOf` and `shapeOf`, the topic
   file's text of a file's kind, owner and mode, now shared with the watch folder's check; a folder now reads "a
   folder" where it read "no regular file"); `test/seat/ntfy.ts` and `test/seat/watched-remote.ts` (shared helpers).
2. The run order: Change 1 calls the watcher after the record events, which holds; a run that reads no project now
   also runs it, then exits 4 as before, since the registry is the agents' file and emptying it must not stop the
   watch (D-117 (3), AC-9). The empty `projects` list before such a run's first main send follows from it (A-054).
3. Change 1's `$CREDENTIALS_DIRECTORY/watch/` folder is read as the flat names of Decision 8 (1).
4. A remote with no `main` and no held tip is named (`the remote has no main, and no tip is held yet`) with no event,
   so the first-run rule (nothing raised) also covers a remote that has no `main` yet.
5. The install's message for a tool that cannot run says what needs it (`… cannot run (…); the main watcher …`)
   instead of `the install needs it: it …`, since git and ssh are the runs' tools.
6. Round 1: Change 2's key `<project>/main/<held tip>/<kind>` for `forced` and `deleted` is replaced by Decision 9's
   key of the occurrence; besides F1–F4, `follow` gained a one-line comment on the ISO basic form of the kept ref's
   time (night default 3), on a line F1 rewrote.

## Night defaults

For Adrian to confirm in the morning (D-054 (2) (b), technical choices inside `## Change` that `taste.md` does not
settle):

1. The runner's module `seat/program.ts` (Deviations, 1).
2. The bounds: `ls-remote` 20 s, `fetch` 60 s, a call on the copy and each probe 10 s, ssh's `ConnectTimeout` 10 s.
3. The kept ref's time in the ISO basic form (`20261128T030405.123Z`), the extended form's `:` being no ref character;
   the `forced` key carries it in that form, as the ref's name does.
4. `<project>.failures` holds `<runs> <ISO time of the first run>` on one line; a damaged one fails the project with
   exit 4 and names its removal.
5. The well-formed checks of Done 1 (address, key, known hosts, project name).
6. A `watch_` file of no entry fails the run (exit 4) at run time while the complete entries are still watched; the
   install refuses it.
7. `fetch --no-auto-gc`, so no detached `gc` outlives the oneshot service; `init --template=`, so no template file
   lands in the copy (the reasons are in the code since round 1, F4).
8. The summary line counts record events only; the watch says one line per project per run.
9. The `units` step makes the folder and checks no entry; only the install checks them.
10. The probes of `git` and `ssh` run once per run, only when an entry exists, with `PATH` alone.
11. Round 1: the start of a deletion is `<project>.deleted` beside `<project>.failures`, one ISO time (the extended
    form, as the `unwatched` key's), written only while a tip is held; a damaged one fails the project with exit 4 and
    names its removal, after which a deletion still seen rings again under a new start.

## Unmeasured

- The seat facts of the watch, which no M-NN of `plan.md` → `## Measurement` covers and seat step 4.10 checks (T-28
  (5)): systemd 259 loading `/etc/limen/watch` as the flat credentials `watch_<file>`; ssh taking the key from
  `$CREDENTIALS_DIRECTORY` (its owner and mode check) on a system account with no home, under `ProtectSystem=strict`
  and `ProtectHome=read-only`; GitHub serving a commit by its id to a read-only deploy key; the first fetch of each
  project's whole history within 60 s; the alert on the phone. The tests use git's local transport, so the ssh path
  never runs here.
- M-10: the gate's run time on this laptop was 345 s with 1551 tests (round 1); the stage's measurement is taken at its
  tag.

## Open points

1. `TimeoutStartSec=120` stays (Decision 8 (5)): per project one `ls-remote` (20 s), one `fetch` (60 s) and a few
   10 s calls on the copy, so two projects whose remotes hang can reach it, besides the sends' 10 s each.
2. `docs/remote.md:81` says the alerts send failed jobs and long waits "and nothing else", untrue since R-032's `stuck`
   and now the main lines; it is outside Change 5's two files.
3. A forced update or a deletion undone within the minute is not seen (Out of scope; the README says so).
4. If `update-ref` of the held tip fails after a kept ref was made (the run exits 4), the next run keeps the same old
   tip again under a new time: two kept refs of one forced update, and since round 1 two `main:forced` lines for it,
   since each kept ref is an occurrence; nothing is lost. One `update-ref --stdin` transaction for both refs would
   close it, which the runner cannot do today (it passes no input).
5. A watch problem shows in `limen status` only as the alerts' failed run (`Alerts not working`), as every other exit 4
   of the alerts does.
6. Decision 6's `ssh` row of `## System requirements` is the main session's, written in round 1.
7. While a remote cannot be reached, a deletion seen before raises no `deleted` (the state is out of reach); a refused
   `deleted` send goes out at the first run that reaches the remote and still sees `main` gone, under the same start.
8. Review round 2, note 1 (proven): a refused `deleted` send is lost once a run sees `main` again (the `.deleted` file
   is removed), and a refused `unwatched` once a run reaches the remote; the run's exit 3 in the journal is then the
   only trace. The main session corrected `docs/seat/README.md`, which had promised every refused send again (D-053
   (2)). For Adrian at gate 5.4: whether a refused `deleted` or `unwatched` is kept in the state folder until it is
   sent (a change of `seat/main-watch.ts` with its test, beyond Decisions 8 and 9, which clear both states).
