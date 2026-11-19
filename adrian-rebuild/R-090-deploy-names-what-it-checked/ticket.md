<!-- PL: Ticket R-090 etapu 1 przebudowy (poprawka po bramce 5.1, delegated, D-045 (4), D-046): skrypt wdrożenia
seat/deploy.ts wypisuje, które rejestry i projekty sprawdził przed wdrożeniem, i odmawia, gdy nie znajdzie żadnego
projektu, zamiast uznać, że nic nie działa. Odmowa przy nieczytelnym rejestrze dostaje test. Stan: napisany,
do implementacji przez rebuild-implementer; po nim R-091 i tag a0.1.1. -->

# R-090 The deployment script names what it checked; a registry without a project refuses

## Problem

`seat/deploy.ts` (R-012) refuses a deployment while any job of a registered project runs (§7 D3: "deployment of a new
tag … waits until no job runs, or refuses with the list of running jobs"). At `d0c9a2d`:
- It prints nothing about what it checked. On success it prints only `deployed <sha> in <repo> (previous <sha>), tag
  <tag>` and the `next` line (`seat/deploy.ts:94-96`), so root cannot see which registries and projects the
  running-job check covered.
- Zero registries refuse with exit 4 (`seat/deploy.ts:182-188`, test `test/seat/deploy.test.ts:185`), and a registry
  that cannot be read refuses with exit 4 (`optionalText` → `unreadable`, `seat/deploy.ts:226-245`), but the second
  has no test.
- A registry that holds no project passes as "nothing runs": an empty registry, one whose lines are all not absolute
  (they are skipped, `seat/deploy.ts:189`), or one whose roots hold no `.limen/` (a root without `.limen/jobs/` counts
  as a project with no jobs, `seat/deploy.ts:207-212`). The deployment then goes ahead although nothing was checked:
  the gap of §7 D3.

Relied on:
- D-045 (4) (Adrian, gate 5.1): "zero registries found, or a home whose registry cannot be read, refuses instead of
  assuming that nothing runs, and the script prints the registries and projects it checked".
- D-046 (4): "R-090 carries D-045 (4), and a registry that holds no project refuses too: that is the gap of §7 D3, and
  the condition is one line"; the deployment of `a0.1.1` waits for R-090.
- R-012 → `ticket.md` → `## Decisions`: the registries are found through the homes of `/etc/passwd`; every text from
  a job folder, the registry or the password file is printed with its control characters escaped (round 1, fix 3).
- T-02: the exit code is the failure class (4: the environment).

## Change

1. `seat/deploy.ts`:
   - The registry discovery returns, besides the roots, what it read: each registry's path, and for each of its lines
     the root and its kind: `project` (an absolute path whose folder holds `.limen/`), `not a project` (an absolute
     path with no `.limen/`, or a folder that does not exist) or `skipped` (not an absolute path).
   - A project is a registered root that holds `.limen/`. When the registries hold no project, the deployment
     refuses with exit 4 before the fetch, with a message that names each registry it read and a `next` that says what
     to check (the agents' account's `~/.limen/projects` and its project roots) and the command to run again.
   - Every run that gets past reading the registries prints the list first, on stdout: one line per registry
     (`checked registry <path>: <n> projects`), then one indented line per registry line (`<root>: <n> running jobs`,
     `<root>: not a project (no .limen/)`, `<root>: skipped (not an absolute path)`). A refusal for running jobs, a
     refusal for no project and every later failure print the same list on stdout too, since the check ran. Each
     path and each registry line in the list is escaped like the parts of a running-job line (`printable(…,
     "escape")`), so a newline in a registry cannot forge a line of the list.
   - The success output is the list, then the `deployed …` line and the `next` line, as today.
2. `test/seat/deploy.test.ts`, written first; each test fails before the change except the one marked:
   - "a deployment prints each registry and each project it checked before the deployed line" (the fixture's
     registry with the project and a second line for a folder with no `.limen/`);
   - "a registry that holds no project refuses the deployment with exit 4 before the fetch, naming the registry"
     (three fixtures: an empty registry, a registry of a non-absolute line only, a registry of a root with no
     `.limen/`; HEAD, the tags and `origin/adrian-rebuild` unchanged);
   - "a registry that cannot be read refuses the deployment with exit 4 before the fetch, naming its path" (the
     registry path is a folder, so the read fails with `EISDIR` for any user, root included; this one passes before
     the change, and guards the refusal D-045 (4) asks for);
   - "a refusal for a running job also prints the list of what was checked";
   - "a registry line with a control character is printed escaped in the list".
3. `plan.md` is not changed by this ticket; `## Deployment` 1.0 already says that the output names every registry
   and project (D-046).

## Out of scope

- The running-job test itself (`liveJob`, `startingJob` from `src/runtime/reap.ts`), the fetch, the checkout, the tag
  and the verifications.
- Where the registries are found (`/etc/passwd`, R-012's decision) and the shared seat error type (R-059).
- The final JSON line of Limen's CLI: `seat/deploy.ts` is root's tool and keeps its own text output (R-059).

## Acceptance

- AC-1: `node --test test/seat/deploy.test.ts` → exit 0.
- AC-2: `node adrian-rebuild/tools/fails-before.mjs` → exit 0: the changed test file fails at `HEAD`; the outcome names
  the new test that passes at `HEAD` (the unreadable registry) and why.
- AC-3: `node adrian-rebuild/tools/gate.mjs` → exit 0 with `fail 0`.
- AC-4: `node adrian-rebuild/tools/check.mjs` → exit 0; `npx biome check --error-on-warnings adrian-rebuild` → exit 0.
- AC-5 (judgment): no path lets a deployment proceed when the running-job check covered no project; every line of the
  list that carries text from a registry is escaped; the list comes before any other line of the output.

## Migration

none: no on-disk format changes; the output of a root tool gains lines before its last two.

## Risk

- A seat whose registry holds a stale root (a project moved away) now prints it as `not a project`; while at least
  one project remains, the deployment proceeds, so a stale line never blocks it, and root sees it in the list.
- A fresh project that `limen init` registered but that never ran a job holds `.limen/` (`limen init` creates
  `.limen/jobs`, `src/commands/init.ts:83`), so it counts as a project.

## Rollback

`git revert $(git log --format=%H --grep='^R-090:' adrian-rebuild --)`; no migration.

## Decisions
- 2026-11-19 (main session, after the implementer's `BLOCKED`): the gate exited 1 on one test outside this ticket,
  `test/structure.test.ts:24` ("TypeScript basenames must be unique", `650 !== 709`): `filesBelow` skips only
  `node_modules`, `.git` and `.pi` (`test/structure.test.ts:15`), so it counts the 579 `.ts` files of Pi 1.5.1's
  packages in the ignored `adrian-rebuild/input/vendor/` (D-046), 16 of them `index.d.ts`. Nobody ran the test again
  (D-029).
- 2026-11-19 (Adrian, option (a) of that `BLOCKED`): this ticket also makes the whole-tree listing of
  `test/structure.test.ts` count only the files git knows, tracked and untracked but not ignored (`git ls-files
  --cached --others --exclude-standard`), so that an ignored local input never fails the gate; the Pi sources stay in
  `adrian-rebuild/input/vendor/`. A test written first shows it on a fixture (an ignored `.ts` that repeats a tracked
  basename is not counted; it fails before the change). The outcome records this as a deviation from `## Change`.
- 2026-11-19 (Adrian): the implementer's first run is accepted although `review-guard.mjs compare --git` exited 1:
  each of its 2,239 differences is a file in `adrian-rebuild/input/vendor/`, the Pi sources Adrian fetched with his
  own command during the run; HEAD, the refs, the index and every other reserved path were unchanged. The main
  session takes a new `snapshot --git` before it resumes the implementer (D-035).
- 2026-11-19 (main session, review round 1, PASS with four notes; `review.md` → Round 1). Fixes for the resumed
  implementer, each with a test that fails before the fix:
  1. Finding 1 (T-02): a test with a symlink loop `<root>/.limen -> .limen` (ELOOP for any user): the deployment
     exits 4 before the fetch, names the path, and HEAD, the tags and `origin/adrian-rebuild` stay.
  2. Finding 3 (T-29 (3)): "a registry that holds no project refuses …" keeps the refusal's assertions only; a new
     test "a refusal for no project also prints the list" checks the list (no fail-before needed for a split; the
     outcome says so).
  3. Finding 4: `knownFiles` in `test/structure.test.ts` keeps only paths that exist in the working tree; a fixture
     test: a tracked `.ts` deleted from the working tree and an untracked `.ts` of the same basename count once.
  Finding 2 is rejected (`review.md`); the outcome's deviation 3 stands. `outcome.md` records the fixes and their
  tests.
