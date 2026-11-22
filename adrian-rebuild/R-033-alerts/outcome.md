<!-- PL: Wynik R-033 (22.11, za dnia, szkic implementera): powiadomienia `seat/alerts.ts` zastępują dzwonek. `run`
czyta rekordy zarejestrowanych projektów tylko do odczytu i wysyła jedną linię `<projekt> failed:<rodzaj> <id joba>` na
ntfy, z tematem tylko z poświadczenia systemd; pierwsze uruchomienie nic nie wysyła, a przebieg bez żadnego projektu
kończy się błędem. `install` (root, konto własne alertów, nie root ani konto agentów) nadaje prawa przez ACL, pisze i
weryfikuje jednostki i włącza timer; deploy uruchamia krok `units` nowej wersji, `limen status` ostrzega. Po rundzie
recenzji 1 poprawki F1–F6, po rundzie 2 poprawka G1 (właściwa przyczyna w linii podsumowania), każda z testami, które
padają przed nią. Stan: zamknięty po trzech rundach recenzji (PASS, PASS, PASS); dwie uwagi rundy 3 przeszły do R-035
(D-090). -->

# R-033 outcome

## Done

(a) `seat/alerts.ts run`, the service's run, on the alerts account:
- It finds the registries with the shared seat module `seat/registries.ts` (`registryPaths`, `readRegistry`, `absent`),
  which `seat/deploy.ts` now uses too (T-25): `<home>/.limen/projects` of each home of the password file, each line
  as `project`, `not a project`, `skipped` or `unreadable`. A registry read refused with `EACCES` is `closed` when the
  account cannot even stat it (another account's private home, such as `/root`), which the run skips, and
  `unreadable` when the file is there but its read right is not (for example after `limen init` rewrote the registry
  and dropped its ACL), which the run names.
- For each project it lists `.limen/jobs/` with `jobFolderNames` (which refuses no older folder) and reads each record
  with `readRecord`, read-only. It skips a folder an older Limen wrote (`unmigratedFolder`) and a record with the
  `migrated` marker, which D-057 (4) makes history that no alert answers. A record in state `failed` is the event
  `failed:<kind>` (`unknown` for a null kind), keyed `<project path>/<job id>/failed`. The kinds live in one list,
  `EVENTS`, which R-034, R-035, R-050, R-060 and R-069 extend.
- The line is D-084's, built by `alertLine`: `<base name of the project folder> <event> <job id>`, plain English, with
  control characters escaped, at most 100 characters (T-10): a longer line cuts the base name with a visible `…`
  (the pattern of T-24's label); an id too long for one line, which no Limen makes, keeps its end, where the token is.
- It posts the line as the body of `POST https://ntfy.sh/<topic>`, with no title, and records the key only after a 2xx
  answer (`response.ok`), rewriting the state file after each send, so a crash after a send repeats at most that one.
  The URL's base is the test knob `LIMEN_ALERTS_URL` (kind `test`, `src/config.ts`) when set (T-03).
- The reported keys live in `$STATE_DIRECTORY/reported`, one key per line, sorted, written by `atomicWrite` with mode
  0600. The first run, with no such file, records every current key and sends nothing (A-054).
- The topic is read only from `$CREDENTIALS_DIRECTORY/topic` and must be an ntfy topic name (1–64 letters, digits, `-`
  or `_`); without the variable or the file the run exits 4 and sends nothing. No output names the topic: every text
  of a run replaces it with `<topic>`.
- A registry, project or record it cannot read, and a send that fails, are named on stderr once every other project
  is done (z. 10): exit 4 when something could not be read, otherwise 3 when only sends failed (T-02: the next run
  sends them again). stdout says how many projects and failed jobs it read, what it sent, and the first run.
- A run that reads no project at all exits 4 before it records or sends anything, with one line that says why: no
  home of the password file holds a registry, every registry is in a home the account cannot enter (naming them), or
  the registries it read name no project (review round 1, F1). What it could not read comes first (review round 2,
  G1): `read no project: could not read <n> registry and <m> registered projects (named above)`, with each count only
  when it is not zero, before a closed home and before an empty registry, so on the seat, where
  `/root/.limen/projects` is always closed, an unreadable agents' registry is named as unreadable.

(b) `seat/units.ts`: units as typed data (`UnitDefinition`: sections of `[key, value]` directives) and one renderer,
`renderUnit`, which refuses a key of another form, an empty value or a control character in a value, so no value can
add a line. `alertsUnits(account)` (it refuses a name that is not a system account name) gives `limen-alerts.service`
(`Type=oneshot`, `User=<account>`, `ExecStart=/usr/bin/node /opt/limen/seat/alerts.ts run`,
`LoadCredential=topic:/etc/limen/alerts-topic`, `StateDirectory=limen-alerts`, `StateDirectoryMode=0700`,
`TimeoutStartSec=120`, `NoNewPrivileges=yes`, `ProtectSystem=strict`, `ProtectHome=read-only`, `PrivateTmp=yes`) and
`limen-alerts.timer` (`OnBootSec=1min`, `OnUnitActiveSec=1min`, `AccuracySec=1s`, `Unit=limen-alerts.service`,
`WantedBy=timers.target`). Both start with one comment line of 94 characters that names the install and the
deployment as their writers (at most 100, T-10; review round 1, F6). `unitUser(text)` reads the last `User=` of
`[Service]`. The service names what it runs by absolute path (the D-080 note).

(c) `seat/alerts.ts install --account <name>`, as root (D-085). In order: it refuses with exit 1 and runs nothing
unless it runs as root (the injected `uid` equals `rootUid`, 0 on the seat), the account has a line in the password
file and is one of the alerts' own (not uid 0, and its home holds no Limen registry, as an agents' account's does;
G2, review round 1, F4), and the topic file (`/etc/limen/alerts-topic`) is a regular file, not a link, of root's with
mode 0600. Then it checks the declared seat tools `setfacl`, `systemd-analyze` and `systemctl` (`SEAT_TOOLS`, T-12)
with `--version`; one that cannot run exits 4 naming it, before any change. Then it reads the registries as root and
refuses with exit 1 when none names a project, before any grant (F1); otherwise it runs `setfacl -m u:<account>:--x`
on every folder above each registry and above each registered project's `.limen/jobs` (not `/`), `setfacl -m
u:<account>:r-x` on each `.limen/jobs`, and `setfacl -m u:<account>:r--` on each registry; it writes each unit whose
text differs into the unit folder with `atomicWrite` (mode 0644) and then runs `systemd-analyze verify` on both; it
runs `systemctl daemon-reload` every time, also when no unit changed, so a reload that failed before is done by the
next run (F3); then `systemctl enable --now limen-alerts.timer`. A failed step exits 4 and names the step and what the
program said; a failed verification first puts the earlier units back (or removes units that were not there). Run
again, it writes and verifies no unit, and its `setfacl -m`, reload and `enable --now` leave what is in place as it
is. `units --account <name>` is the unit part alone (root, the account exists, write what differs, verify when
something changed, reload; no grant, no enable), the step that the deployment runs.

(d) `seat/deploy.ts` (D-085): after the checkout is clean and before it checks the new commit out, it reads
`/etc/systemd/system/limen-alerts.service` (the new input `alertsService`). When the file exists, it takes the
account from `User=`; a service that names no valid account refuses with exit 4 before the checkout. After the
checkout and every verification, and before the tag, it runs the new version's step (the new input `alertsUnits`:
`node seat/alerts.ts units --account <account>` in the new checkout, 120 s bound) as a verification is run, so the
units of the new tag come from the new tag's code. A failed step returns to the previous SHA with exit 4, as D-010
says; its stdout lines follow the `deployed` line as `alerts: …`. When the alerts are not installed, the output says
`alerts: not installed; to install them, as root: node <checkout>/seat/alerts.ts install --account <account>`. The
private `DeployFailure` and `printable` moved into `seat/tool-outcome.ts` (`SeatFailure`, `SeatOutcome`), which both
seat tools share, and with review round 1, F5, also the one `requiredText`, `counted` and `reason` of both tools (the
registry path rule is `registryOf` in `seat/registries.ts`); `verify` now returns the stdout lines of a check that
passed.

(e) `limen status`: `src/project/summary.ts` adds the block `Alerts not working (<n>); no failed job reaches the phone
until each is fixed:` after the unconfirmed jobs and before the leftover files, with `limen-alerts.timer is not active;
as root, install the alerts:` and the install command, and `limen-alerts.service failed; as root, read why:` with
`journalctl -u limen-alerts.service`. The probes go through the platform adapter: `systemUnitState`'s query union
gains `is-failed` (`src/platform/platform.ts`), so no `systemctl` literal enters `src/` outside `src/platform/` (the
scan of R-026).

(f) The old bell is gone: `git rm docs/seat/bell.sh docs/seat/bell.ts docs/seat/limen-bell.service
docs/seat/limen-bell.timer test/seat/bell.test.ts`. The fixture of the job-file scan in `test/structure.test.ts` uses
`docs/seat/reader.sh`. `docs/seat/README.md` (the section `## Alerts`, the install in five steps, the units list, the
proof), `docs/seat/agent-setup.md` (phase 6 for Moshi and the alerts, the fill-in `MOSHI` and `ALERTS` in place of
`BELL`, phase 0, the upgrade step), `docs/remote.md` (the bring-up, the trap "A wake is not an alert", the return
checklist) and `docs/jobs.md` ("no wake or alert answers") describe the alerts. With review round 1, the install's
description in `docs/seat/README.md` and `docs/seat/agent-setup.md` names its refusals of root's and the agents'
account and of no registered project, and the reload every time; `docs/seat/README.md` says a run that reads no
project fails.

(g) Tests:
- `test/seat/alerts.test.ts` (25 tests): a failed job sends one line to the topic and a second run nothing more; done,
  stopped, running and starting jobs send nothing; the first run records and sends nothing (A-054); the migration
  fixture (migrated failed records, a first run with no line, a new failed job, one line); a refused send exits 3 and
  the next run sends it; a failed send never names the topic; a project whose jobs cannot be listed is named, exit 4,
  and the next project still alerts; a damaged record is named and its project's other jobs still alert; a null kind
  is `unknown`; D-084's line, the cut at 100 characters, an over-long id, an escaped control character; no credentials
  folder exits 4 whatever `NTFY_TOPIC` says; the entry point exits 2 without a subcommand; the install's commands, its
  rerun, its refusals (not root, no account, the topic file missing, not root's, mode 0644, a link), a missing
  `setfacl`, a failed verification with and without earlier units, a registered project reached through a link; and
  the `units` step with one changed unit and with none. HTTP goes to a local `node:http` server through
  `LIMEN_ALERTS_URL`; the install gets an injected runner and user ids.
- Review round 1 added to `test/seat/alerts.test.ts` (now 35 tests): F1, a run that reads no project (no registry; a
  registry with no project) exits 4 naming why and records nothing, a run whose every registry is in a home it cannot
  enter exits 4 naming them, and the install refuses with no registered project; F2, migrated records and an older
  folder written after the first run send nothing, a registry in a home the account cannot enter is skipped while the
  other projects alert, and a registry it can see but not read fails the run; F3, a reload that failed is done by the
  next install (and the rerun and unchanged-`units` tests now expect the reload); F4, the refusals of `root` (uid 0)
  and of `agents` (whose home holds the registry). The three permission tests change modes with `chmod` and skip,
  visibly, when run as root, as `test/atomic-write.test.ts` does.
- Review round 2 added two tests to `test/seat/alerts.test.ts` (now 37 tests), one for each mixed case of G1: an
  unreadable registry beside a closed one (a `chmod` test, skipped as root) says `read no project: could not read 1
  registry (named above)`; a read registry whose only line is a project it cannot read (its `.limen` a symlink to
  itself, which fails every stat with `ELOOP`, for root too) says `read no project: could not read 1 registered project
  (named above)`.
- `test/seat/units.test.ts` (6 tests): golden texts of both units, every line at most 100 characters (F6), the refusal
  of a value with a line break, the refusal of an account name, `unitUser`.
- `test/seat/deploy.test.ts` (4 new tests): the units step runs in the new checkout for the account in `User=`; a
  failed step returns to the previous commit with exit 4 and no tag; without the service the output names the install
  command; a service with no account refuses with exit 4 before the checkout. `deployTo` passes the two new inputs.
- `test/cli/status.test.ts` (3 new tests, with a fake `systemctl` first on PATH that passes other calls to the plant's):
  the warning for an inactive timer, the warning for a failed service, and no warning for a healthy pair.
- `test/config.test.ts`: the inventory names `LIMEN_ALERTS_URL`.

## Proof

The main session's own runs on the final tree (they count): `node adrian-rebuild/tools/gate.mjs` → exit 0, 834/834;
`node adrian-rebuild/tools/fails-before.mjs` → exit 0 (six files, below); `npx biome check --error-on-warnings .` →
exit 0; `node adrian-rebuild/tools/check.mjs` → exit 0. `compare --git` exit 1 once, on the form of `## Change` (f),
accepted by Adrian (D-089), then exit 0 after each round. Review: PASS in rounds 1–3 (`review.md`). After round 3 the
main session fixed one text note (`docs/seat/README.md:29`). The implementer's runs:

- `node adrian-rebuild/tools/gate.mjs` → exit 0: `tsc --noEmit` clean, `biome check --error-on-warnings .` "Checked 262
  files … No fixes applied.", tests 821, pass 821, fail 0 (179.8 s).
- `node --test test/seat/alerts.test.ts test/seat/units.test.ts` → exit 0, tests 30, pass 30 (before the deploy change);
  `node --test --test-force-exit test/seat/deploy.test.ts test/seat/alerts.test.ts test/seat/units.test.ts` → exit 0,
  tests 56, pass 56.
- `node --test --test-force-exit test/cli/status.test.ts` → exit 0, tests 17, pass 17.
- `node --test --test-force-exit test/structure.test.ts test/config.test.ts` → exit 0, tests 53, pass 53.
- `node adrian-rebuild/tools/check.mjs` → exit 0 ("… PL summaries: 208 files; ticket folders: 40; changes: 38 entries;
  0 errors"); `npx biome check --error-on-warnings adrian-rebuild` → exit 0 ("Checked 34 files … No fixes applied.").
- After the last edit (the one-line headers of three test files), `node adrian-rebuild/tools/gate.mjs` ran once more
  on the final tree → exit 0, biome "Checked 262 files … No fixes applied.", tests 821, pass 821, fail 0 (182.0 s).

Review round 1 (F1–F6):
- `node --test test/seat/units.test.ts test/seat/alerts.test.ts` → exit 0, tests 41, pass 41, skipped 0;
  `node --test --test-force-exit test/seat/units.test.ts test/seat/alerts.test.ts test/seat/deploy.test.ts` → exit 0,
  tests 67, pass 67, skipped 0.
- `node adrian-rebuild/tools/gate.mjs` → exit 0: `tsc --noEmit` clean, biome "Checked 262 files … No fixes applied.",
  tests 832, pass 832, fail 0, skipped 0 (180.8 s).
- `node adrian-rebuild/tools/check.mjs` → exit 0; `npx biome check --error-on-warnings adrian-rebuild` → exit 0.

Review round 2 (G1):
- `node --test --test-force-exit test/seat/units.test.ts test/seat/alerts.test.ts test/seat/deploy.test.ts` → exit 0,
  tests 69, pass 69, skipped 0.
- `node adrian-rebuild/tools/gate.mjs` → exit 0: `tsc --noEmit` clean, biome "Checked 262 files … No fixes applied.",
  tests 834, pass 834, fail 0, skipped 0 (180.5 s).
- `node adrian-rebuild/tools/check.mjs` → exit 0; `npx biome check --error-on-warnings adrian-rebuild` → exit 0.

## Fails before

The main session's run on the tree under review, `node adrian-rebuild/tools/fails-before.mjs` → exit 0:

```
fails-before: test/cli/status.test.ts, test/config.test.ts, test/seat/deploy.test.ts, test/structure.test.ts,
test/seat/alerts.test.ts, test/seat/units.test.ts fail at HEAD (exit 1)
```

My runs before the change of mechanism, with the new tests in place and no implementation:
- `node --test test/seat/units.test.ts test/seat/alerts.test.ts` → both files fail at load:
  `code: 'ERR_MODULE_NOT_FOUND', url: 'file:///…/seat/units.ts'`; tests 2, pass 0, fail 2.
- `node --test --test-force-exit test/seat/deploy.test.ts` → tests 26, pass 22, fail 4: the four new D-085 tests
  ("an installed alerts service makes the deployment run the new checkout's units step …", "a failed alerts units step
  returns the checkout …", "without an installed alerts service the deployment says …", "an installed alerts service
  with no account in User= refuses …").
- `node --test --test-force-exit --test-name-pattern=alerts test/cli/status.test.ts` → tests 3, pass 1, fail 2: both
  warnings are missing (`+ actual: []`, `- expected: ['Alerts not working (1); …', …]`). The third test, no warning for
  a healthy pair, passes before the change by its nature, as the other "prints no … section" tests of the file do.
- The fixture rename in `test/structure.test.ts` passes before the change (no mechanism); the inventory line of
  `test/config.test.ts` fails before it, since the registry had no `LIMEN_ALERTS_URL`.

### Review round 1

`HEAD` has no `seat/alerts.ts`, so `fails-before.mjs` shows nothing of the round's fixes. I ran the round's tests
against the round-0 code instead: `seat/alerts.ts` and `seat/units.ts` taken from the reviewer's diff
(`node_modules/.rebuild-review/R-033.diff`; `git hash-object` gives `d64abc7` and `7681d57`, the blob ids the diff names),
copied over the fixed files for the run and copied back after it (`cmp` with the saved fixed copies: equal).
- `node --test test/seat/units.test.ts test/seat/alerts.test.ts` on the round-0 code → exit 1, tests 41, pass 30,
  fail 11:
  - F1: "a run that reads no project exits 4 …" (`no registry: actual: 0, expected: 4`); "a run whose every registry
    is in a home its account cannot enter exits 4 …" (`actual: 0, expected: 4`); "install refuses with exit 1 when no
    registry names a project …" (`actual: 0, expected: 1`).
  - F3: "a reload that failed is done by the next install, though no unit changed" (`actual: ['systemctl enable --now
    limen-alerts.timer']`, `expected: ['systemctl daemon-reload', 'systemctl enable --now limen-alerts.timer']`); the
    changed rerun test and the changed unchanged-`units` test (`actual: [0, []]`, `expected: [0, ['systemctl
    daemon-reload']]`).
  - F4: "install refuses … for an account of uid 0 …" and "… for an account whose home holds a Limen registry …"
    (`actual: 0, expected: 1` each).
  - F6: "T-10: every line of both alerts units is at most 100 characters" and the two golden texts (the old header,
    103 characters).
- F2's four tests pass on the round-0 code, which already had the behaviours. Each fails when its behaviour is removed
  from the fixed code: a mutant made with `sed` from the saved fixed file and copied in for one run of
  `node --test --test-name-pattern=<the test> test/seat/alerts.test.ts`, then the fixed file copied back (`cmp`: equal):
  - without the skip of migrated records (`record === undefined || record.migrated !== undefined` → `record ===
    undefined`): "D-057: migrated failed records written after the first run send nothing" → exit 1, fail 1;
  - without the skip of older folders (`if (unmigratedFolder(dir))` → `if (false && unmigratedFolder(dir))`): "D-057: a
    folder an older Limen wrote after the first run sends nothing and fails nothing" → exit 1, fail 1;
  - with a closed registry read as unreadable (`seat/registries.ts`, `kind: "closed"` → `kind: "unreadable"`): "a
    registry in a home the alerts account cannot enter is skipped …" → exit 1, fail 1;
  - with every `EACCES` read as closed (the `closedTo` check removed): "a registry the alerts account can see but not
    read is named and fails the run with exit 4" → exit 1, fail 1.

### Review round 2

The two G1 tests were written first and run against the round-1 code before the fix:
`node --test --test-name-pattern='unreadable registry beside a closed|names only projects it cannot read'
test/seat/alerts.test.ts` → exit 1, tests 2, pass 0, fail 2, each with the false cause the review names:
- "a run with an unreadable registry beside a closed one says it could not read the registry": `actual: 'read no
  project: every registry is in a home this account cannot enter (/tmp/limen-alerts-…/closed/.limen/projects)'`,
  `expected: 'read no project: could not read 1 registry (named above)'`;
- "a run whose read registry names only projects it cannot read says it could not read them": `actual: 'read no
  project: no line of the registries /tmp/limen-alerts-…/agents/.limen/projects names a folder with .limen/'`,
  `expected: 'read no project: could not read 1 registered project (named above)'`.

## Deviations

1. (d) The deployment runs the new tag's `seat/alerts.ts units --account <account>` as its own process in the new
   checkout, instead of rendering the units in its own process: the running `deploy.ts` is the previous version's
   code, so only a process started in the checkout can render the units of the new tag (as `Verification` already
   says). The deployment itself reads the account from `User=`.
2. (c) Two refusals beyond the ticket's list, both exit 1 before any grant: a registry or a project's `.limen/jobs`
   whose real path differs from its path, since root's `setfacl` follows a link and would grant the right on what an
   agent's link names (the pattern of `docs/seat/github-setup.sh`'s "invalid registered project").
3. (c) The install also grants `--x` on the folders above each registry file, without which the registry's `r--`
   reads nothing; it grants nothing on `/`, and nothing on a project without `.limen/jobs/`, which holds no job.
4. (c) The install verifies only when a unit changed; it grants, reloads (F3) and runs `enable --now` each time,
   which leaves what is in place unchanged.
5. (a) Migrated records and older folders send nothing (D-057 (4), `docs/jobs.md`); a registry in a home the alerts
   account cannot enter is skipped, one it can see but cannot read fails the run, and a run that reads no project at
   all fails (F1).
6. (a) Exit 4 when something could not be read, 3 when only sends failed (T-02's classes; the ticket says
   "non-zero").
7. (b) The timer has `AccuracySec=1s`, so that "every minute" holds (systemd's default accuracy is one minute), and
   both units open with a comment line; neither is named in the ticket.
8. T-25: besides the registries, `DeployFailure` and `printable` moved from `seat/deploy.ts` into
   `seat/tool-outcome.ts` (`SeatFailure`), so the two seat tools share one failure type and one escape.
9. Files not named in `## Change`: `src/config.ts` (the test knob) and `test/config.test.ts` (its inventory).

## Unmeasured

- The real systemd side (the units under `systemd-analyze verify`, `LoadCredential=`, `StateDirectory=`, the
  protections), the ACLs on the seat's folders, the first real run and a phone that buzzes: `unmeasured` here, no
  `## Measurement` metric covers them; `## Deployment` 3.3 checks them (T-28 (5)).

## Open points

1. Closed: the main session added the rows of `setfacl`, `systemd-analyze` and `systemctl` to `plan.md` →
   `## System requirements` (review round 1, note 7).
2. Closed by F4: the install refuses an account of uid 0 and an account whose home holds a Limen registry.
3. The real-path check and `setfacl` are two steps, so an agent that swaps a folder for a link between them could still
   move a right (setfacl follows a link argument; `-P` works only with `-R`); root runs the install by hand, rarely.
4. The alerts read job folders and records through their "other" mode bits (0755 and 0644 under umask 022, inventory
   fact 3); a seat umask of 027 or 077 would hide them, and the run would name each record it cannot read.
5. `limen init` rewrites the registry with `atomicWrite`, which drops its ACL, so a new project makes the alerts fail
   until root runs the install again (the docs say so; the Risk of the ticket). A registry writer that keeps the
   file's ACL would remove that step.
6. The rollback part is closed by the ticket's `## Rollback` (review round 1, note 2): before the revert's
   deployment, root disables the timer, removes both units and reloads, so the deployment finds no installed service
   and runs no units step. Still open: when the units step succeeds and the tag that follows fails, the checkout
   returns to the previous commit but the new units stay loaded.
7. To R-035 (D-090; review round 3, notes 2 and 3): a project the alerts first read after their first run, and an
   install run again after `limen init`, send that project's existing failures; the summary counts an unreadable
   project once per registry that lists it.
