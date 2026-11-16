<!-- PL: Plan przebudowy Limena i punkt wznowienia każdej sesji: wizja, decyzje Adriana, etapy, tickety R-NNN, kroki
wdrożenia na seat, pomiary, definicje subagentów i sekcja State. Nowa sesja zaczyna od State i ostatnich wpisów
changes.md. Stan: szkielet z etapu 0; sekcje planu wypełni etap 4, State opisuje bramkę 0. -->

# Rebuild plan

## Vision

Pending (stage 4, derived from `taste.md`).

## Decisions

Adrian's decisions, dated. The hard constraints of `input/prompt.md` hold until a decision here changes them.

None yet.

## Stages

Pending (stage 4).

## Tickets

Pending (stage 4).

## Deployment

Pending (stage 4).

## Measurement

Pending (stage 4).

## Agents

Pending (stage 4).

## State

Updated 2026-11-16, stage 0 (preflight), waiting at gate 0.

Done:
- Repo, line endings, tools: checked; results in `evidence/env.md`. Repo matches expectations; no CRLF; WSL2 Ubuntu 22.04 on ext4.
- Branch `adrian-rebuild` and local tag `rebuild-base` (`3b5edd7`) created. Repo-local commit identity set to the GitHub
  noreply identity of `2b8006f` (the laptop's global identity is a work one; the repo is public).
- Baseline gate: plain `npm run check` is red on this laptop for two platform causes (git 2.34 lacks
  `worktree list -z`; `/tmp` is mode 1777). `tools/gate.sh` applies both workarounds and is green. Details and the
  failure classification in `evidence/baseline.md`.
- Push guard: `tools/pre-push` (POSIX sh) installed in `.git/hooks/pre-push` by `tools/install-hooks.sh`;
  `tools/test-pre-push.sh` passes 11/11 cases offline on the source and the installed copy, and fails 8 cases against a
  permissive hook.
- Skeleton: `plan.md`, `changes.md`, `audit.md`, `taste.md`, `evidence/`, `tools/`; `adrian-rebuild/input/` ignored.

Next: gate 0 — Adrian decides on the test gate (open question 1). After that, stage 1 (system map) in a new or the
same session.

Open questions for Adrian:
1. Accept `tools/gate.sh` (private `TMPDIR` + the `worktree list -z` shim on git < 2.36) as the rebuild's test gate,
   or upgrade git in WSL yourself and keep only the private `TMPDIR`?
2. Confirm the repo-local noreply commit identity.

Notes for the next session:
- The Claude Code task list tool is not available in this session; progress lives in this section.
- After moving or re-cloning the repo, run `sh adrian-rebuild/tools/install-hooks.sh` again.
