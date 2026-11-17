<!-- PL: Wynik ticketu R-010 (szkic implementera): z drzewa wyszły spec/ autora (865 plików), docs/reviews/,
docs/diagrams/, docs/vps.md i .pi/settings.json, test limitu 3500 linii w test/structure.test.ts razem z importem
testLineCap, linki do usuniętych plików w trzech plikach docs/ oraz wykluczenie !spec/** w biome.jsonc; README ma
sekcję History z odsyłaczem do 3b5edd7 i upstreamu overment/limen. Dowody: gate 82/82, check.mjs i Biome z kodem 0,
skany AC z kontrolą na HEAD. Brak testu padającego przed zmianą (usunięcie bez nowego testu). Stan: zamknięty;
bramka sesji głównej zielona (82/82), recenzja PASS w jednej rundzie (review.md). -->

# Outcome: R-010 The author's working history leaves the tree; Limen's own test-line cap goes

## Done

- Item 1: `git rm -r -q spec`, `git rm -r docs/reviews`, `git rm -r docs/diagrams`, `git rm docs/vps.md`,
  `git rm .pi/settings.json`. The index holds 870 deletions (`git diff --cached --shortstat` → `870 files changed,
  34287 deletions(-)`): 865 files under `spec/`, plus the 5 other files. No untracked leftovers remain on disk: `spec/`
  is gone, and `.pi/` holds only `extensions/`.
- Item 2: `test/structure.test.ts`: the test "test/ stays within the line cap that spec/vision.md sets" and the import
  of `testLineCap` are gone (12 lines removed). The other two tests are unchanged.
- Item 3: `README.md`: a new last section `## History` with one paragraph: the working history of the original author
  up to `3b5edd7` (its tickets, research and reviews, which were in `spec/`) is in the git history of this branch at that
  commit, for example `git show 3b5edd7:spec/vision.md`, and in the upstream `overment/limen` (linked). `3b5edd7` is
  `rebuild-base` (`git rev-parse rebuild-base` → `3b5edd7c80105723eae9ac0729076d362deb3feb`).
- Item 4:
  - `docs/remote.md:7`: the sentence about `vps.md` is gone. `docs/remote.md:181-182`: the two "Related" entries that
    linked into `spec/` (the author's vision and ticket F013) are dropped. `SECURITY.md` stays as the only entry.
  - `docs/seat/README.md:5`: the sentence about `vps.md` is gone. `docs/seat/README.md:27`: the Moshi steps stay, and
    "Steps: [vps.md](../vps.md)." is gone.
  - `docs/finish-webhooks.md:641`: unlinked. The sentence keeps the record's path as plain text "at `3b5edd7`, in the
    original author's working history (see [History](../README.md#history))", because it is the only evidence for
    "The receiver-owned proof is finished." (see Deviations 1).
- Item 5: `biome.jsonc`: the linter's `"includes": ["**", "!spec/**"]` and its comment are gone. Without the
  exclusion, the key would only repeat Biome's default `["**"]`, so the key goes as well.
- AC-7 check: the only reader of the Limen repo's `spec/` in `src/`, `hook/`, `bin/` and `test/` was the cap test.
  The `spec/` paths in `src/` and `hook/` are relative to a project root or a `cwd`. `src/commands/init.ts:71-77`
  reads `templates/spec/`, and the tests write their own `spec/` in temporary projects
  (`git grep -n -E 'spec/' -- src hook bin test`, read case by case). The basename test in `test/structure.test.ts`
  walks the whole tree, `spec/` included. It does not depend on `spec/`, and with `spec/` gone it only checks 3 fewer
  `.ts` files.

## Proof

- Main session (the run that counts, protocol step 4): `node adrian-rebuild/tools/gate.mjs` → exit 0; tests 82, pass
  82, fail 0 (73.6 s). Review: PASS in round 1 (`review.md`).
- Implementer: `node adrian-rebuild/tools/gate.mjs` → exit 0; tests 82, pass 82, fail 0, cancelled 0, skipped 0 (74.7 s). This is
  the 83 of `evidence/baseline.md` minus the removed cap test (AC-5). The run includes `tsc --noEmit` and
  `biome check --error-on-warnings .` ("Checked 157 files").
- `node adrian-rebuild/tools/check.mjs` → exit 0: "941 references (…); ticket folders: 3; changes: 1 entries; 0
  errors". The `audit.md` references still resolve at `rebuild-base` (AC-6).
- `npx biome check --error-on-warnings adrian-rebuild` → exit 0 (run after this file was written).
- AC-1: `git ls-files spec docs/reviews docs/diagrams docs/vps.md .pi/settings.json` → no output.
- AC-2: `git grep -n -E 'spec/vision\.md caps|testLineCap' -- test` → no output. Control: the same command with `HEAD`
  before `--` prints `test/structure.test.ts:6`, `:49` and `:56`.
- AC-3: `git grep -n -E '\]\((\.\./)*(spec/|vps\.md|reviews/|diagrams/)' -- docs README.md CONTRIBUTING.md SECURITY.md
  templates` → no output. Control: the same command with `HEAD` before `--` prints the six lines the ticket names
  (`docs/finish-webhooks.md:641`, `docs/remote.md:7`, `:181`, `:182`, `docs/seat/README.md:5`, `:27`). A wider scan
  of every tracked file outside `adrian-rebuild/` (links and `href="` into the removed paths, and any mention of
  `vps.md`) also prints nothing.
- AC-4: `git grep -n -e 'overment/limen' -- README.md` → `README.md:34` (the existing `git clone` line) and
  `README.md:137`, the pointer paragraph, which names `3b5edd7`.
- Biome's file set (item 5): before the change, `npx biome check --error-on-warnings .` → "Checked 181 files"; after
  it, "Checked 157 files". The difference of 24 is exactly the removed files of types Biome handles: in `spec/`, 11
  `.html`, 4 `.json`, 3 `.ts` and 3 `.mjs` (listed by `git ls-files` with path patterns, contents not read), plus the
  two removed `.html` files of `docs/` and `.pi/settings.json`. The exclusion matched only `spec/**`, so every other
  file is checked as before.

## Fails before

not applicable: a removal with no new test.

## Tests removed with the cut

- `test/structure.test.ts`: "test/ stays within the line cap that spec/vision.md sets" (Change item 2, T-11). The
  projects' cap test in land ("a branch that adds test lines past the cap is refused and names the numbers") stays and
  passes (out of scope, R-062).

## Deviations from the ticket

1. `docs/finish-webhooks.md:641`: the ticket allows "drop or unlink". I unlinked instead of dropping, because the
   sentence is the only evidence for the claim before it. The path stays as inline code, with the commit and a link to
   the README pointer (z. 23: what is there and how to get it). No link points into a removed path (AC-3). R-002 cuts
   the file later.
2. `docs/remote.md:181-182`: dropped, not unlinked. These are navigation entries ("Related"). The README pointer covers
   the author's vision and tickets.
3. `biome.jsonc`: the whole `includes` key goes, not only `!spec/**`, because `["**"]` alone is Biome's default.
4. `README.md`: the pointer paragraph adds one example command (`git show 3b5edd7:spec/vision.md`) to the wording of
   T-39, so the reader also knows how to read a file from the history (z. 23).

## Measurement

- M-10 (gate run time, T-11) is recorded at the close of the stage. This run took 74.7 s (baseline 79–88 s).
- unmeasured: less noise from search in this repo (T-39's reason: 865 files of decisions that no longer bind). No M-NN
  covers it.

## Open points

- Left as they are because `## Out of scope` names them: `templates/.history/` (R-040); `testLineCap` in
  `src/commands/land.ts` and its comment "The cap on `test/` lines that `spec/vision.md` names", which is about the
  projects' cap (R-062); `.gitignore`'s `spec/linear.md*` line (R-003); `.agents/limen/styleguide.md` and
  `.pi/extensions/limen.ts`; the rest of `docs/finish-webhooks.md` (R-002).
- `docs/remote.md:7` still says "The current checklist is [docs/seat/](seat/README.md)." The word "current" no longer
  stands in contrast to `vps.md`. I kept it because item 4 asks only to drop the `vps.md` sentence.
- T-39's check "the T-30 comment scan finds no references to the removed tickets" has no scan yet. References to the
  author's ticket numbers in comments and test names are R-084 and R-083.
