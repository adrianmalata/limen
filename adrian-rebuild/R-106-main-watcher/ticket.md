<!-- PL: Ticket R-106 (D-110 (1), D-117, A-006, §7 D1): w każdym projekcie obserwator poza kontem agentów trzyma
własną kopię `main` i co minutę pobiera ją bez wymuszonej aktualizacji, a na wymuszoną aktualizację albo usunięcie
`main` na GitHubie wysyła alert na telefon i zachowuje historię, którą trzymał. Według D-117 to krok przebiegu alertów
na koncie alertów, z adresami i kluczami tylko z plików roota (credentials), z liniami `main:forced`, `main:deleted`
i `main:unwatched`. Stan: napisany 26.11 przy `87906e1` z inwentarza `evidence/inventories/R-106.md`; `ready` na noc. -->

# R-106 A watcher outside the agents' account keeps a copy of `main` and alerts on its forced update or deletion

## Problem

D-110 (1), quoted: "in every project a watcher outside the agents' account keeps its own clone, fetches `main` with no
forced update every minute, and alerts the phone on a forced update or a deletion of `main` on GitHub, keeping the
history it held (R-106, stage 4, deployed with a0.4.0, with a read-only deploy key per repository as seat step 4.10)".
D-117 (Q-72–Q-77), quoted in parts: "(1) […] the watcher runs on the alerts account. (2) […] it is a step of the alerts'
run, with the alerts' one sender, list of events and record of what was sent (T-25), so R-106 stays S; a network
failure of the watcher does not fail the alerts' run: it is counted, and it alerts once 15 runs in a row failed (D-100's
grace). (3) […] the watch list and each repository's address and key are root-owned entries that Adrian writes at step
4.10, read as credentials; the agents' registry serves only a check that names a registered project with no entry,
since a job could otherwise drop a project or redirect its address (A-006, z. 14). (4) […] after a forced update the
old tip goes to a kept ref with its time, the watch follows the new `main`, and each further forced update alerts
again. (5) […] the lines are `<project> main:forced <tip>`, `<project> main:deleted <tip>` and `<project>
main:unwatched`, the tip as 12 hex characters (D-084's shape). (6) […] step 4.10 proves the alert on a scratch private
repository". D-084: an alert is one line `<project> <event> <subject>`, at most 100 characters, the project as its
folder's base name, no path. D-085: the topic is a root-owned 0600 file handed to the service by `LoadCredential=`.
D-010: seat tools in TypeScript, units from typed definitions, `systemd-analyze verify` before enabling. T-01: no
failure is silent; T-02: exit codes are failure classes; T-12: declared system tools; T-28 (3): a test that running
again loses nothing.

Facts at `c3bbc5c` (the read-only inventory `evidence/inventories/R-106.md`, sections 1–4):
1. `seat/alerts.ts` (793 lines): `send` posts the line with `fetch` and a 10 s bound (`:475-487`); the topic is read only
   from `$CREDENTIALS_DIRECTORY/topic` (`:293-323`); `alertLine(root, event, id)` builds `<base name> <event> <id>`,
   ≤ 100 characters (`:461-472`); every event kind is in one list `EVENTS` (`:90-117`); a sent key
   (`<project path>/<job id>/<kind>`, `:450`) is recorded in `$STATE_DIRECTORY/reported` only after a 2xx
   (`:214-218`, `:352-360`); a send happens only for an alert whose `root` the run read before
   (`read.has(root)`, `:213`), which a source with no registry root would never pass; failures are named after every
   project is done (`:190-195`); a run that reads nothing exits 4, unsent lines exit 3 (`:279-290`).
2. The install (root, `:495-526`) refuses unless root, checks the account is the alerts' own (`:565-583`), checks the
   topic file is a regular root-owned 0600 file and no link (`:586-608`), probes `SEAT_TOOLS` (`:53-57`), grants the
   ACLs, places and verifies the units (`:720-744`). `units --account` (`:529-533`) is the step `seat/deploy.ts` runs at
   each deployment (`seat/deploy.ts:396`, `:501-505`).
3. `alertsUnits(account)` (`seat/units.ts:30-79`): `LoadCredential=topic:/etc/limen/alerts-topic` (`:49`),
   `StateDirectory=limen-alerts` with mode 0700 (`:50-51`), `ProtectSystem=strict`, `ProtectHome=read-only`.
4. Git helpers: `isAncestor` reads `merge-base --is-ancestor` exits 0 and 1 and throws on any other
   (`src/project/git.ts:484-491`), with no timeout in its runner (`:701-730`); a fetch that writes no ref is used at
   `src/integrations/github-claims.ts:663` (`--no-tags --no-write-fetch-head --refmap=`).
5. Tests of the alerts run against a local `node:http` server through the test knob `LIMEN_ALERTS_URL`
   (`test/seat/alerts.test.ts:84-106`) with a fake credentials and state folder (`:45-76`, `:123`); `test/seat/deploy.test.ts`
   uses real git on a bare repository with `GIT_CONFIG_GLOBAL=/dev/null` and `GIT_CONFIG_NOSYSTEM=1` (`:18-22`,
   `:57-84`).

## Change

1. A new module `seat/main-watch.ts`, called by `seat/alerts.ts run` after the record events, for each watch entry:
   - The entries: the credential `watch` is a root-owned folder (`/etc/limen/watch/`, mode 0700) holding, per project,
     `<project>.address` (the repository's SSH address, one line) and `<project>.key` (the read-only deploy key's
     private half, mode 0600), and one `known_hosts` (the pinned host keys); `<project>` is the project folder's base
     name. The module reads them only from `$CREDENTIALS_DIRECTORY/watch/`. No entry, no watch.
   - The copy: a bare repository `$STATE_DIRECTORY/main/<project>.git`; the held tip under `refs/watch/main`; each old
     tip after a forced update under `refs/watch/forced/<UTC time>`. No working tree, no tags.
   - One check per run, decided by exit codes only: `git ls-remote --exit-code <address> refs/heads/main` (exit 2: the
     remote `main` is gone; exit 0: its tip; any other: unreachable); for a tip, a fetch of that object that writes no
     ref (`--no-tags --no-write-fetch-head --refmap=`), then `merge-base --is-ancestor <held> <tip>`: exit 0 moves
     `refs/watch/main` by `update-ref` with the old value given; exit 1 keeps the old tip under a kept ref, moves the
     held ref the same way, and raises `forced`; a gone `main` raises `deleted` and the held ref stays; the first run
     holds the tip and raises nothing. No git call holds a `+` refspec, `--force`, `--prune` or `--mirror`.
   - Git runs with the key from the credentials folder through `GIT_SSH_COMMAND` (that key only, no agent, no user
     configuration, the pinned `known_hosts`, no prompt, a connection timeout), with `GIT_CONFIG_NOSYSTEM=1` and an
     empty global configuration, and each call has a time bound.
   - An unreachable remote is no event: the module counts the runs in a row in `$STATE_DIRECTORY/main/<project>.failures`
     and names it in the run's output each time; at 15 in a row it raises `unwatched` once per streak; a success resets
     the count. It does not fail the alerts' run (D-117 (2)). A local failure (an entry file missing or not root's 0600,
     no `known_hosts`, git or ssh missing) exits 4 after the other projects are done, naming it (T-01, T-02).
   - A project of the agents' registry with no entry gets one line in the run's output (D-117 (3)); nothing the agents
     can write decides what is watched or where.
2. `seat/alerts.ts`: the three `main` events join the one list of event kinds and go through the one sender and the
   record of what was sent, with the key `<project>/main/<held tip>/<kind>` (so a second forced update on another tip
   rings again and the same state never twice); the filter of fact 1 lets them pass (they have no registry root); the
   line is `<project> main:forced <tip>`, `<project> main:deleted <tip>` or `<project> main:unwatched`, the tip as its
   first 12 hex characters, through `alertLine`'s cut. The install and the `units` step (which `seat/deploy.ts` runs at
   each deployment, fact 2) make the watch folder (root's, 0700) when it is absent, so the new unit's credential
   source exists from 4.0's deployment on and a seat with no entries runs as before; the install checks each entry
   file as it checks the topic file and probes `git` and `ssh` with the other seat tools.
3. `seat/units.ts`: the alerts' service gets `LoadCredential=watch:/etc/limen/watch` beside the topic's; R-109's
   `NODE_OPTIONS` line covers the watcher's sends, since they run in the same service.
4. Tests: the new file `test/seat/main-watch.test.ts` on a local bare repository as the remote (its path as the
   address, real git, isolated configuration, a recording runner around it): the first run holds the tip and raises
   nothing; a fast-forward raises nothing and the held ref follows; a forced update (`git update-ref` in the bare
   repository) raises `forced` once and keeps the old tip; a second run raises nothing more (T-28 (3)); a deletion
   raises `deleted` and keeps the held ref, and a re-created `main` that holds the tip raises nothing; an unreachable
   remote is named each run and raises `unwatched` once at the 15th run in a row, and a success resets it; no git call
   holds `+`, `--force`, `--prune` or `--mirror`; a missing entry file exits 4 and sends nothing. Each "minute" is one
   direct call (no waiting, T-31). `test/seat/alerts.test.ts`: a run with entries sends a `main` line once through the
   local server, a refused send is sent again next run, a seat with no entries alerts as before, and the install's
   checks. `test/seat/units.test.ts`: the golden service text with the credential line.
5. Docs: `docs/seat/README.md` `## Alerts` (the three lines, the watch folder, its entries and the install) and
   `docs/seat/agent-setup.md` phase 6 (the deploy keys and entries of step 4.10); no address, host or key name.

## Out of scope

- A ruleset on `main` where an owner's plan enforces one (D-110 (2)): Adrian's, per project.
- `SECURITY.md`: R-081.
- What publishes `main` (the owner channel, R-055) and B1″'s removal of the coordinator's write token (step 5.1).
- A forced update undone within the minute: a poll every minute cannot see it (the inventory's Unverified 11).

## Acceptance

- AC-1: `node --test test/seat/main-watch.test.ts` → exit 0.
- AC-2: `node --test test/seat/alerts.test.ts` → exit 0.
- AC-3: `node --test test/seat/units.test.ts` → exit 0.
- AC-4: `git grep -q 'main:forced' -- seat/main-watch.ts seat/alerts.ts` → exit 0.
- AC-5: `git grep -q 'main:forced' -- docs/seat/README.md` → exit 0.
- AC-6: `node adrian-rebuild/tools/fails-before.mjs` → exit 0, its output in `outcome.md` → `## Fails before`.
- AC-7: `node adrian-rebuild/tools/gate.mjs` → exit 0.
- AC-8: `npx biome check --error-on-warnings .` → exit 0; `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-9 (judgment): no git call of the watcher can force-update or remove its held copy; the address, the key and the
  host keys come only from root-owned credentials; nothing the agents' account can write decides what is watched or
  where; an alert carries no path; no failure of the watcher is silent (its output, its exit class, the alert at the
  threshold).

## Migration

None for the projects. On the seat, step 4.10 (Adrian's): the deploy keys, the root-owned entries and `known_hosts`, then
the alerts' install again as root, which makes the folder and checks the entries. The alerts' `reported` file keeps its
form (one key per line); the new keys only add lines.

## Risk

- A missing credential source would stop the alerts' service; the install and the deployment's `units` step make the
  folder always, and seat step 4.10 checks that systemd 259 loads a folder as a credential (the inventory's Unverified
  5); if it does not, a fix ticket renders one line per project.
- ssh's checks of the key file's owner and mode inside the credentials folder, and a system account with no home, are
  seat facts (step 4.10).

## Rollback

`git revert $(git log --format=%H --grep='^R-106:' adrian-rebuild --)`; before deploying the revert, root removes the
watch folder's entries (the old unit has no `watch` credential), and Adrian removes the deploy keys on GitHub. The copy
in the state folder holds no secret.

## Decisions

Settled when the ticket was written (2026-11-26): D-117 (Q-72–Q-77, Adrian) for the account, the shape, the entries,
the kept ref, the wording and seat step 4.10; the main session's reading of the inventory's technical questions
(`evidence/inventories/R-106.md` → section 7), not night defaults:
1. Detection by `ls-remote --exit-code`, a fetch that writes no ref, and `merge-base --is-ancestor` (Q5 (b)): decisions
   by exit codes only, git ≥ 2.36 suffices (`## System requirements`), and no fetch can move the held ref by force.
2. The threshold of `unwatched` is 15 runs in a row, the forced and deleted lines ring at once (Q6 (b), D-117 (2)).
3. A bare repository in the service's state folder, refs under `refs/watch/` (Q9 (a)).
4. One `LoadCredential=` of a root-owned folder (Q10 (a)), so the unit text holds no seat data and the deployment's
   `units` step needs no entry; seat step 4.10 checks it.
5. No dependency on R-109 (Q11): the watcher runs in the alerts' service, which R-109's line covers whichever lands
   first.
6. The main session adds `ssh` (the OpenSSH client, for the alerts account) to `## System requirements` in the ticket's
   commit, as R-033 added its tools.
