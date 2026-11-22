<!-- PL: Ticket R-033 (A-066, A-054, T-18, D-084, D-085): powiadomienia na telefon z własnego konta, tylko o awariach.
Narzędzie `seat/alerts.ts` działa jako usługa i timer systemowe (`User=` konto powiadomień, temat ntfy przez
`LoadCredential=`), czyta rekordy wszystkich zarejestrowanych projektów tylko do odczytu, wysyła jedną linię
`<projekt> failed:<rodzaj> <id joba>` i pamięta wysłane we własnym katalogu stanu; pierwsze uruchomienie niczego nie
wysyła. Instaluje je root jednym poleceniem, deploy odświeża jednostki, `limen status` ostrzega; stary dzwonek znika.
Stan: napisany 22.11 przy `e39ccd0` z inwentarza `evidence/inventories/R-033.md`, gotowy na noc. -->

# R-033 Alerts from their own account: failures and escalations only

## Problem

Finding A-066 (low), its Decision quoted from `audit.md`: "fix — The bell runs on its own account, reads job records
read-only, and sends only fixed fields: project, event kind, job id. It sends **only failures and escalations**
(`failed:<kind>`, `escalation`, `no-coordinator`, `queue`, `unattributed-engine`), no plain `done`, no labels, no job
text; details come from `limen status` over SSH. The topic is a systemd credential (`LoadCredential=`) or an
`EnvironmentFile=` with mode 0600 owned by the bell account. The public `ntfy.sh` relay stays […]. The bell is part of
the seat core, not a module, because it is the only escalation path to me […]; `limen status` warns when it is not
configured; the deployment describes its first installation."

Finding A-054 (low), its Decision: "The bell iterates all registered projects (like `limen-sweep`); installing the bell
marks existing terminal jobs as already reported. Other bell rules: A-066."

T-18, quoted: "bell → alerts (A-066)"; T-13: bell fields are plain technical English; T-10: "Every generated view […]
has lines of at most 100 characters"; T-04: "the owner channel and the bell read records read-only". Gate 2 §0.5 keeps
account names out of tracked files; G2: "**Bell:** runs on its own account, outside the agents' account"; D-010: seat
tools are TypeScript, units "are generated from typed definitions, with golden tests in `npm run check`; the
deployment script runs `systemd-analyze verify` […] before it enables them, and on an error returns to the previous
SHA with code 4". A plan note (D-080): "since R-021 the bell needs `node` on its service's `PATH`; the alerts that
replace it, and seat step 3.3, name what their service runs."

Adrian's decisions, quoted from `plan.md` → `## Decisions`:
- D-084: "an alert is one line with no ntfy title, `<project's folder base name> failed:<kind> <job id>`, e.g.
  `synchronizer failed:quota 2026-11-16-f001-work-a-37c02ed6`; plain English (T-13), at most 100 characters (T-10), no
  path, label or job text (A-066)."
- D-085: "the alerts run as a system service and timer on their own account (`User=` that account), installed by root
  with `node /opt/limen/seat/alerts.ts install --account <name>`, so the account name stays on the seat (gate 2 §0.5);
  the units are generated from typed definitions and verified with `systemd-analyze verify` before they are enabled
  (D-010); the ntfy topic reaches the service by `LoadCredential=` from a root-owned 0600 file; `limen status` warns
  when the timer is not active or the service failed (A-066); `seat/deploy.ts` re-renders installed units at each tag
  with the account they hold, and returns to the previous SHA with exit 4 when the verification fails."

Facts at `e39ccd0` (the read-only inventory `adrian-rebuild/evidence/inventories/R-033.md`, taken at `9da2fde`, which
`e39ccd0` changes only in `adrian-rebuild/`):
1. The bell today: `docs/seat/bell.sh` (a shim, `exec node …/bell.ts`) and `docs/seat/bell.ts` (52 lines): one project
   per run from argv; every terminal state, `done` included; the message carries the label; it marks a job by writing
   `notify/bell` into the job folder (`:31`), so it needs write access; `NTFY_TOPIC` and `NTFY_URL` from the
   environment. Units `docs/seat/limen-bell.service` and `.timer` (every 15 s); `docs/seat/agent-setup.md:170` runs it
   as the agents' account with the topic in plain `Environment=`. Gate 2 §1: the bell was never installed on the seat.
2. `seat/` holds only `deploy.ts`, which imports `src/` modules by relative path, finds the registries from passwd homes
   (`registries`, `seat/deploy.ts:235`) and takes injected inputs in tests (`DeployInput`: a passwd fixture, `now`,
   `verifications` as argv processes, `env`); `VERIFICATIONS` (`:63`) is empty. No unit generator exists; no test fakes
   `systemctl`; the only systemd code is the system-unit probes of `src/integrations/github-doctor.ts:259-318`.
3. Records are written with mode 0666 before the umask (`src/atomic-write.ts:45`), so 0644 under umask 022, and job
   folders 0755; another account reads them when it can traverse their parents. The GitHub poller's setup grants such
   traverse rights by ACL (`docs/seat/github-setup.sh:90-98`) and sets `.limen` to `0o2750` (`github-claims.ts:620`).
   `readRecord` (`src/job/record.ts:284`) only reads; `jobFolderNames` (`:239-247`) lists folders without refusing
   older ones.
4. Records show a failure as state `failed` with `failure.kind` (A-016's kinds, `record.ts:65-78`), which may be
   `null`. No record shows `escalation` (R-069), `no-coordinator` (R-050), `unattributed-engine` (R-060) or `queue`
   (R-035) yet; R-034, R-035 and R-050 depend on R-033.
5. `limen status` (`src/project/summary.ts:78-132`) renders warning blocks beside `leftoverLines` (`:146`) and
   `environmentLines` (`:161`).
6. Text about the bell: `docs/seat/README.md:25-35`, `docs/seat/agent-setup.md:150-170`, `docs/remote.md:58`, `:81`,
   `:172`, `docs/jobs.md:54`; `test/structure.test.ts:819`, `:828` use `docs/seat/bell.sh` as a fixture path of a T-25
   scan; `test/seat/bell.test.ts` tests the old bell with a local `node:http` server (`:48-66`).

## Change

(a) `seat/alerts.ts run` (the alerts tool, T-18's name): for every project in every registry it can read, found by the
function `seat/deploy.ts` uses (moved into one shared seat module, T-25), it lists the job folders and reads each record
read-only; a record in state `failed` is the event `failed:<kind>` (`unknown` when the kind is `null`), keyed
`<project path>/<job id>/failed`. It sends each new event as one line by D-084 (the body of a POST to
`https://ntfy.sh/<topic>`, no title), and records the key as reported only after a 2xx answer. The reported keys live
in one file in the service's state folder (`StateDirectory=`, mode 0700), written by `atomicWrite`. The first run, with
no such file, records every current key and sends nothing (A-054). The topic is read only from
`$CREDENTIALS_DIRECTORY/topic`. A project or record it cannot read, and a send that fails, are named in the run's
output and make the run exit non-zero after every other project is done, so one damaged record never stops the alerts
for the rest (z. 10). The event kinds live in one list, which R-034, R-035, R-050, R-060 and R-069 extend.

(b) Units from typed definitions (D-010): a seat module renders `limen-alerts.service` (`Type=oneshot`, `User=<account>`,
`ExecStart=/usr/bin/node /opt/limen/seat/alerts.ts run`, `LoadCredential=topic:/etc/limen/alerts-topic`,
`StateDirectory=limen-alerts`, `StateDirectoryMode=0700`, `TimeoutStartSec=120`, `NoNewPrivileges=yes`,
`ProtectSystem=strict`, `ProtectHome=read-only`, `PrivateTmp=yes`) and `limen-alerts.timer` (every minute, from boot),
with golden tests of both texts. The unit names what its service runs, `/usr/bin/node` by absolute path (the D-080
note).

(c) `seat/alerts.ts install --account <name>`, run by root (D-085): it refuses with exit 1 and a message when it does
not run as root, when the account does not exist, or when `/etc/limen/alerts-topic` is missing or not a root-owned 0600
file; it grants the account traverse rights (`--x`) by ACL on each parent folder of every registered project's
`.limen/jobs`, read and traverse (`r-x`) on `.limen/jobs`, and read on each registry file; it writes both units under
`/etc/systemd/system/` atomically, runs `systemd-analyze verify` on them, then `systemctl daemon-reload` and `systemctl
enable --now limen-alerts.timer`. A failed step exits non-zero and names it; running it again changes nothing that is
already in place. `setfacl` joins the declared system tools of the seat (T-12), checked by the install.

(d) `seat/deploy.ts` (D-085): after it switches to the new SHA and before it reports success, when
`/etc/systemd/system/limen-alerts.service` exists it reads the account from its `User=`, renders the units of the new
tag with it, and when they differ writes them, verifies them and reloads; a failed verification returns to the previous
SHA with exit 4, as D-010 says. When the alerts are not installed it says so and names the install command.

(e) `limen status` warns, beside the other warning blocks, when `systemctl is-active limen-alerts.timer` is not
`active` or `systemctl is-failed limen-alerts.service` prints `failed`, naming which; the probe of a system unit lives in
the platform adapter (fact 2; if R-026 has landed, its scan of `systemctl` outside `src/platform/` holds it).

(f) The old bell goes: `git rm docs/seat/bell.sh docs/seat/bell.ts docs/seat/limen-bell.service
docs/seat/limen-bell.timer test/seat/bell.test.ts`; the fixture of `test/structure.test.ts:819`, `:828` takes another
path; `docs/seat/README.md`, `docs/seat/agent-setup.md`, `docs/remote.md` and `docs/jobs.md` describe the alerts.

(g) Tests (T-29: `test/seat/alerts.test.ts`, `test/seat/units.test.ts`, `test/seat/deploy.test.ts`,
`test/cli/status.test.ts`), each failing at `HEAD` where it tests a mechanism: a failed job sends one line and a second
run sends nothing more; a done or stopped job sends nothing; the first run sends nothing (the migration fixture below);
a failed send leaves the key unreported, the run exits non-zero and the next run sends it; an unreadable project is
named and another project still alerts; the line is D-084's (≤ 100 characters, the base name, the kind `unknown` for a
null kind); the topic comes from a fake credentials folder; the install's refusals and the commands it would run (an
injected runner and user id, as `DeployInput` is); deploy re-renders an installed unit and returns to the previous SHA
on a failed verification; status warns on an inactive timer and on a failed service (a fake `systemctl`). HTTP goes to a
local `node:http` server through a test knob of kind `test` for the URL (T-03).

## Out of scope

- The events with no job record or of later tickets: `quota-exhausted` (R-034), `queue` (R-035), `no-coordinator`
  (R-050), `unattributed-engine` (R-060), `uncovered-commit` (R-055), `escalation` (R-069), timer failures (T-02); each
  extends the list of (a).
- The account itself, the topic file and the phone app (`## Deployment` 3.3, Adrian's); a self-hosted ntfy (A-066
  keeps ntfy.sh); an uninstall command (YAGNI).
- The sweep's units (R-032), which reuse the unit module of (b).

## Acceptance

- AC-1: `node --test test/seat/alerts.test.ts` → exit 0.
- AC-2: `node --test test/seat/units.test.ts` → exit 0.
- AC-3: `node --test test/seat/deploy.test.ts` → exit 0.
- AC-4: `node --test test/cli/status.test.ts` → exit 0.
- AC-5: `node --test test/structure.test.ts` → exit 0.
- AC-6: `node adrian-rebuild/tools/fails-before.mjs` → exit 0, its output in `outcome.md` → `## Fails before`.
- AC-7: `node adrian-rebuild/tools/gate.mjs` → exit 0.
- AC-8: `npx biome check --error-on-warnings .` → exit 0; `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-9 (judgment): an alert carries only the project's base name, the event kind and the job id, nothing a job wrote;
  the topic is read only from the credential; the alerts account gets no write right on any agents' file.

## Migration

The old bell was never installed on the seat (gate 2 §1), so no unit is removed; the `notify/bell` markers that may sit
in job folders stay (D-057 (3) keeps `notify/`) and nothing reads them. Existing failed jobs are covered by the first
run, which records them and sends nothing: the fixture test is a plant with migrated failed records, a first run (no
line sent), a new failed job, and a second run (one line). The installation is `## Deployment` 3.3.

## Risk

- A project registered after the install has no ACLs yet, so the alerts cannot read it; the run names it and fails,
  `limen status` warns, and running the install again grants the rights.
- The units are proved only by golden tests and fakes here; `systemd-analyze verify` and the first real run are seat
  steps (3.3, T-28 (5)).
- ntfy.sh may refuse or limit a send; the key stays unreported and the next run retries.

## Rollback

`git revert $(git log --format=%H --grep='^R-033:' adrian-rebuild --)`; on the seat, `systemctl disable --now
limen-alerts.timer` (Adrian, as root).

## Decisions

- 2026-11-22 D-084 and D-085 (Adrian, "wszystko zgodnie z rekomendacjami"), quoted in `## Problem`.
- Settled by the documents when the ticket was written (2026-11-22, the main session's reading, not a night default):
  1. The project in an alert is its folder's base name, because the line leaves the seat through a public relay and a
     path holds a home path (gate 2 §0.5, A-066).
  2. The reported keys live in the alerts account's own state folder, because it may not write the agents' files (T-04,
     G2), and a key per event survives a clock change, which a time watermark would not.
  3. The timer runs every minute, as the sweep does (A-024); a failure needs no faster alert.
  4. Rights are traverse-only ACLs plus read on the registries and the jobs folders, the narrowest access that reads
     the records (priority 1); the install grants them because it already runs as root.
