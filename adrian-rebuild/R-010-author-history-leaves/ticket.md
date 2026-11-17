<!-- PL: Ticket R-010 etapu 1 przebudowy: historia pracy autora (spec/ z 865 plikami, docs/reviews/, docs/vps.md,
diagram context-injection, .pi/settings.json autora) wychodzi z drzewa z odsyłaczem w README, a limit 3500 linii
w test/ i jego test znikają (T-39, T-11, gate 2 §6). Po nim tickety etapu 1 mogą dodawać testy. Stan: zamknięty
w nocy 17.11 (recenzja PASS, review.md, outcome.md). -->

# R-010 The author's working history leaves the tree; Limen's own test-line cap goes

## Problem

The repository carries the original author's working history next to the product: `spec/` (865 tracked files,
38 MB: tickets, research, reviews of Limen's own development), `docs/reviews/` (a dated review),
`docs/vps.md` (an old record of one setup pass), `docs/diagrams/context-injection.html`, and the author's own Pi
settings `.pi/settings.json` (`"defaultProvider": "openai-codex"`). Limen's own `test/` is capped at 3,500 lines by a
sentence in that `spec/vision.md` (`spec/vision.md:13`), read by a test (`test/structure.test.ts:48-57`); `test/` has
3,499 lines, so every ticket that adds a test fails the gate (R-001 is blocked on it, Q-1 of the night run).

Relied on:
- T-39: "The author's `spec/` (865 files, 38 MB) leaves the tree in one ticket, with a pointer in the docs: 'working
  history of the original author up to 3b5edd7: git history of this branch at that commit, and the upstream
  overment/limen' (z. 23). The content stays in git history and upstream; the `path:line` references of `audit.md`
  stay valid, because `check.mjs` resolves them at `rebuild-base` (…). The same rule applies to `templates/.history/`
  after stage 3. The ticket checks whether code or tests read the Limen repo's `spec/`; if they do, they move to
  synthetic fixtures." Check: "`npm run check` green after the removal; (…) `check.mjs` still resolves the references
  of `audit.md` at `rebuild-base`; the docs hold the pointer."
- T-11: "In Limen's own repo the 3,500-line cap and its test go, because they contradict the tests of gate 2 and of
  T-NN." The run time of the gate replaces the count (R-011, not this ticket).
- Gate 2 §6 (`audit.md` → `### §6 Decisions from the audit tables`): "**Cut:** `docs/vps.md`, `docs/reviews/*`,
  `docs/diagrams/context-injection.html`, `.pi/settings.json`."
- `plan.md` → `## Tickets` notes, R-010: "the cap it removes is the 3,500-line cap on Limen's own `test/`, a sentence in
  Limen's `spec/vision.md` read by a test (T-11); the projects' optional `testLineCap` in `limits.json` is a different
  setting, built by R-062."
- Checked by the main session: the only reader of the Limen repo's `spec/` in `src/`, `hook/`, `bin/` and `test/` is
  that cap test; `bin/limen-group-fixture.mjs` and the plants write their own `spec/` in temporary projects.

## Change

1. Delete with `git rm -r`: `spec/` (the whole folder), `docs/reviews/`, `docs/diagrams/`, and with `git rm`:
   `docs/vps.md`, `.pi/settings.json`.
2. `test/structure.test.ts`: the test "test/ stays within the line cap that spec/vision.md sets" and its import of
   `testLineCap` go; the other two tests stay as they are.
3. `README.md`: one short paragraph (for example under a heading "History") with the pointer of T-39, worded as
   there: the working history of the original author up to `3b5edd7` is in the git history of this branch at that
   commit and in the upstream `overment/limen`.
4. Links into the removed files: `docs/remote.md:7` and `docs/seat/README.md:5` drop the sentence about `vps.md`;
   `docs/seat/README.md:27` keeps its Moshi steps without the link to `vps.md`; `docs/remote.md:181-182` and
   `docs/finish-webhooks.md:641` drop or unlink the references into `spec/` (no link may point into a removed path).
5. `biome.jsonc`: the `!spec/**` exclusion goes with the folder (Biome still checks the same files).

## Out of scope

- `templates/.history/`: drift tracking still reads it; R-040 cuts drift tracking, and T-39 applies to it then.
- The projects' test-line cap read by `limen land` (`testLineCap` in `src/commands/land.ts`, the land test "a branch
  that adds test lines past the cap is refused"): R-062 moves it to `limits.json`.
- The gate-time record that replaces the line count: R-011.
- References to the author's ticket numbers (`F…`) in test names and comments: R-084 (comments) and R-083 (test names).
- `.gitignore`'s `spec/linear.md*` line: R-003 cuts the Linear mirror.
- `.agents/limen/styleguide.md`, `.pi/extensions/limen.ts`, `.omp/extensions/limen.ts` of this repo.
- `docs/finish-webhooks.md` beyond its one link: R-002 cuts the feature.

## Acceptance

- AC-1: `git ls-files spec docs/reviews docs/diagrams docs/vps.md .pi/settings.json` → no output.
- AC-2: `git grep -n -E 'spec/vision\.md caps|testLineCap' -- test` → no output.
- AC-3: `git grep -n -E '\]\((\.\./)*(spec/|vps\.md|reviews/|diagrams/)' -- docs README.md CONTRIBUTING.md SECURITY.md templates`
  → no output.
- AC-4: `git grep -n -e 'overment/limen' -- README.md` → a line of the pointer paragraph, which names `3b5edd7`.
- AC-5: `node adrian-rebuild/tools/gate.mjs` → exit 0 with `fail 0`; the test count is the 83 of
  `evidence/baseline.md` minus the one removed cap test (82).
- AC-6: `node adrian-rebuild/tools/check.mjs` → exit 0 (the `audit.md` references still resolve at `rebuild-base`);
  `npx biome check --error-on-warnings adrian-rebuild` → exit 0.
- AC-7 (judgment): no file in `src/`, `hook/`, `bin/` or `test/` reads the Limen repo's `spec/`, and the README pointer
  says where the history is.

## Migration

none: these files belong to Limen's own repository, not to a project's on-disk format.

## Risk

- A doc link into a removed file is left behind: AC-3 scans the link forms in use.
- A reader of the repo's `spec/` that the main session missed would fail in the gate; AC-5 runs it.

## Rollback

`git revert $(git log --format=%H --grep='^R-010:' adrian-rebuild --)`; no reverse migration.

## Decisions

none yet.
