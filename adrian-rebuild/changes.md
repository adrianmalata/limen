<!-- PL: Dziennik zmian przebudowy Limena: jeden wpis na zamknięty ticket R-NNN, tylko dopisywany, najnowszy na dole.
Każdy wpis wskazuje pliki, źródła (A-NNN, T-NN), dowód, status pomiaru, commit (po temacie „R-NNN:”, D-009) i sposób
wycofania; wpis wchodzi do commitu swojego ticketu. Stan: etap 5 w toku; wpisy: R-008, R-010. -->

# Changes

Append-only log of the rebuild, newest entry last. One entry per closed ticket, committed in that ticket's own commit
(D-009), in this format:

```
## YYYY-MM-DD R-NNN <title>
- What: <files, modules>
- Why: <A-NNN, T-NN>
- Proof: <command → exit 0>
- Measurement: measured | unmeasured (plan.md → Measurement: M-NN)
- Commit: R-NNN
- Rollback: git revert $(git log --format=%H --grep='^R-NNN:' adrian-rebuild --) (+ reverse migration, if any)
```

`Commit` names the ticket, whose commit is the only one on `adrian-rebuild` with the subject `R-NNN:`; the SHA is
computed when it is read. `check.mjs` checks both (`tools/changes-entries.mjs`).

## 2026-11-17 R-008 Cut the macOS branches
- What: `src/runtime/contain.ts`, `src/runtime/proc-pidinfo.rb` (deleted), `src/runtime/start-queue.ts`, `src/integrations/herdr.ts`, `src/runtime/reap.ts`, `src/job/group-cabinet.ts`, `test/u9-process-identity.test.ts`, `package.json`, `.github/workflows/check.yml`, `README.md`, `docs/setup.md`, `CONTRIBUTING.md`, `SECURITY.md`, `docs/jobs.md`, `docs/remote.md`, `docs/seat/README.md`
- Why: A-083 (the LaunchAgent installer stays for R-032, ticket → `## Decisions`)
- Proof: `node adrian-rebuild/tools/gate.mjs` → exit 0 (83/83); `git grep -n -i -E 'darwin|osascript|memory_pressure|pidinfo|/usr/bin/ruby' -- src hook bin package.json .github` → no output
- Measurement: measured
- Commit: R-008
- Rollback: git revert $(git log --format=%H --grep='^R-008:' adrian-rebuild --)

## 2026-11-17 R-010 The author's working history leaves the tree; Limen's own test-line cap goes
- What: `spec/` (865 files), `docs/reviews/`, `docs/diagrams/`, `docs/vps.md` and `.pi/settings.json` deleted; `test/structure.test.ts` (the cap test); `README.md` (`## History` pointer); `docs/remote.md`, `docs/seat/README.md`, `docs/finish-webhooks.md` (links); `biome.jsonc`
- Why: T-39, T-11, gate 2 §6
- Proof: `node adrian-rebuild/tools/gate.mjs` → exit 0 (82/82: the baseline's 83 minus the cap test); `git ls-files spec docs/reviews docs/diagrams docs/vps.md .pi/settings.json` → no output; `node adrian-rebuild/tools/check.mjs` → exit 0
- Measurement: measured
- Commit: R-010
- Rollback: git revert $(git log --format=%H --grep='^R-010:' adrian-rebuild --)
