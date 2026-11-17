<!-- PL: Ticket R-001 etapu 1 przebudowy: jeden moduł z rejestrem plików pozostałych po wyciętych funkcjach, ich lista
w `limen status` i usuwanie przez `limen init --drop-leftovers` (decyzja A-042). Kolejne tickety wycinające funkcje
dopisują do rejestru swoje ścieżki; cięcie śledzenia dryfu i porady w prompcie należy do R-040. Stan: zablokowany
w nocy 17.11 limitem 3500 linii w `test/` (pytanie Q-1); 18.11 Adrian zdecydował, że R-001 zależy od R-010 (D-020),
a R-010 limit już usunął, więc ticket czeka na wznowienie; nic jeszcze nie zaimplementowano. -->

# R-001 Leftover files of cut features are listed and can be dropped

## Problem

Stage 1 cuts features whose files stay behind in the projects (configuration, state, prompt copies). Nothing lists
them today. `limen init --drop-leftovers` (`src/commands/init.ts:11-31`) removes only the old per-file hook copies and
the byte-identical copies of four packaged templates; `limen status` (`src/commands/status.ts:110-127`) lists no
leftovers; the only place that names leftover template copies is the drift advisory added to every coordinator prompt
(`hook/communication.ts:245-249`, `src/project/inherit.ts:89-112`).

Relied on:
- A-042, Decision (excerpt): "Drift tracking and its prompt advisory are cut; `limen status` lists leftover template
  copies once; `limen init --drop-leftovers` removes them." The cut of drift tracking, of the overrides and of the
  prompt advisory is R-040 (stage 4, the same finding); R-001 builds only the listing and the drop.
- `plan.md` → `## Tickets`, notes, R-001: "A-042's decision defines the mechanism (…); R-001 builds it once, and every
  cut ticket registers the leftover paths of its feature."
- `plan.md` → `## Stages`, stage 1: "cut commands refuse with a pointer, and `limen status` lists the leftover files of
  cut features"; stages 1–3 change no standing instruction that reaches the model on the seat, so the per-turn cue
  keeps its drift block until R-040.
- `plan.md` → `## Deployment` 1.1: "In each project, `limen status` lists the leftover files of cut features
  (R-001–R-007, R-009); check the list, then run `limen init --drop-leftovers`." The snapshot of 0.1 comes first.
- T-04: `status` is a read command; it never writes and never waits.
- T-25 (1): code with a policy has exactly one module from its first use, named after its responsibility.
- T-29: test files named after their subject (`test/<area>/<module>.test.ts`, `test/cli/<command>.test.ts`); one
  test, one mechanism; a test name is a full sentence.

## Change

1. New module `src/project/leftovers.ts`, the only owner of leftover files:
   - `LEFTOVERS`: the registry, a readonly list of `{ path, feature }`. `path` is relative to the project root and
     names a file or a directory; `feature` names the cut feature in plain words with the ticket that cut it, e.g.
     `finish webhooks (R-002)`. The list is empty in R-001; every cut ticket appends its entries.
   - `listLeftovers(root, registry = LEFTOVERS)`: the registry entries whose path exists (checked with `lstat`, so a
     file, a directory and a symlink all count), plus every byte-identical project copy of a packaged template that
     `src/project/inherit.ts` tracks (`TRACKED`), with the feature `identical copy of the package's <source>`; sorted
     by path. It reads no git history (unlike `listDrift`, which computes revisions for overlays) and writes nothing.
   - `dropLeftovers(root, registry = LEFTOVERS)`: removes every entry `listLeftovers` returns (a directory
     recursively; a symlink itself, never its target) and returns the removed entries.
   - The tracked template list stays one list shared with `src/project/inherit.ts`, not a copy (T-25); exporting it or
     moving it is the implementer's choice.
2. `limen status` (`src/commands/status.ts`): when `listLeftovers` finds at least one leftover under the root that
   status reports on its first line, it prints, after `Unconfirmed jobs` and before `Older:`:
   ```
   Leftover files (N); check them, then run limen init --drop-leftovers:
     <path> (<feature>)
   ```
   With no leftover it prints no such section.
3. `limen init --drop-leftovers` (`src/commands/init.ts`): `removeHookCopies` and its `removed <path>` lines stay; the
   template-copy loop is replaced by `dropLeftovers`, with one `dropped <path> (<feature>)` line per removed entry, and
   `no leftover files` when it removed none. A second run prints `no leftover files` and exits 0.
4. Tests (each written first and failing at HEAD):
   - `test/project/leftovers.test.ts`, on a temporary directory with a fixture registry: an existing file, directory
     and symlink entry are listed and a missing one is not; a byte-identical template copy is listed and a changed one
     is not; `dropLeftovers` removes a directory with its content and a symlink without its target, and a second call
     removes nothing; every entry of `LEFTOVERS` has a relative, normalised path inside the root (not absolute, no
     `..` segment, not under `.git/`) and a non-empty feature.
   - `test/cli/status.test.ts`, on a plant (`test/plant.ts`): with `AGENTS.md` identical to `templates/agents.md`,
     `limen status` prints the section with the line `  AGENTS.md (identical copy of the package's templates/agents.md)`;
     with no leftover it prints no `Leftover files` line.
   - `test/cli/init.test.ts`, on a plant: `limen init --drop-leftovers` removes an identical `AGENTS.md`, keeps a
     changed `.agents/limen/worker.md`, and prints the `dropped` line; a second run prints `no leftover files` and
     exits 0.
   - `package.json`: the `test` and `check` scripts also run test files in subdirectories of `test/` (for example the
     quoted Node glob `'test/**/*.test.ts'`), and every file of `test/*.test.ts` still runs.
5. Docs: `docs/commands.md` (the parts of `status`; `init --drop-leftovers`) and `docs/setup.md` (the "Leftover
   prompts" line) say what status lists and what the drop removes.

## Out of scope

- The drift advisory in the per-turn cue (`hook/communication.ts:245-249`), drift tracking (`listDrift`,
  `formatDrift`, the drift lines of a plain `limen init`), and the cut of the prompt overrides: R-040.
- The leftover paths of any cut feature: R-002–R-007 and R-009 register their own.
- The hook-copy list and its removal by a plain `limen init` (unchanged behaviour).
- The housekeeping `limen status` runs today (`confirmDeadJobs`): R-032 (T-04).
- The error type, exit codes and the final JSON line (R-013); refusals keep today's form.
- Renaming existing test files (R-083).

## Acceptance

- AC-1: `node --test test/project/leftovers.test.ts` → exit 0.
- AC-2: `node --test test/cli/status.test.ts` → exit 0.
- AC-3: `node --test test/cli/init.test.ts` → exit 0.
- AC-4: `node adrian-rebuild/tools/fails-before.mjs` → exit 0: the three new test files fail at HEAD.
- AC-5: `node adrian-rebuild/tools/gate.mjs` → exit 0 with `fail 0`; the reported test count is at least the 83 of
  `evidence/baseline.md` plus the new tests, so every file of `test/*.test.ts` still runs.
- AC-6: `git grep -n '"templates/agents.md"' -- src hook` → exactly one line: the tracked template list is not copied.
- AC-7: `node adrian-rebuild/tools/check.mjs` → exit 0; `npx biome check --error-on-warnings adrian-rebuild` → exit 0.
- AC-8 (judgment): the listing in `limen status` writes nothing and waits for nothing (T-04), and `listLeftovers` reads
  no git history.
- AC-9 (judgment): the docs of item 5 describe what the code of items 2 and 3 prints and removes.

## Migration

none: no on-disk format changes. The output of `init --drop-leftovers` changes wording (`no leftover copies` →
`no leftover files`; `dropped <path>` gains its feature); no caller parses it (`git grep -n 'no leftover copies'` finds
only `src/commands/init.ts`).

## Risk

- A wrong registry entry of a later ticket could delete live files of a project. Bounds: the registry test rejects
  absolute paths, `..` and `.git/`; each cut ticket's review checks its entries; on the seat Adrian reads the list in
  `limen status` before he drops (1.1), after the snapshot of 0.1.
- A leftover tracked by the project's git becomes a deletion in that project's working tree, which the owner commits;
  the content stays in the project's history.

## Rollback

`git revert $(git log --format=%H --grep='^R-001:' adrian-rebuild --)`; no reverse migration.

## Decisions

- 2026-11-17 (night run, `rebuild-implementer`): `BLOCKED` before any change: AC-5 cannot hold, because
  `test/structure.test.ts:48-57` caps `test/` at the 3,500 lines of `spec/vision.md:13`, and `test/` has 3,499 (checked
  by the main session with `wc -l`); R-010 removes the cap (T-11). `review-guard.mjs compare --git` → exit 0. The
  question of the order is Q-1 of the night's `adrian-rebuild/.night/questions.md` (recommended: R-001 depends on
  R-010); the answer goes here.
- 2026-11-18 (Adrian, Q-1 → `plan.md` D-020): R-001 depends on R-010, an exposed dependency like R-067 on R-069 in
  D-011; no scope changes. R-010 is done (`e444106`) and removed the cap with its test, so R-001 runs as written.
