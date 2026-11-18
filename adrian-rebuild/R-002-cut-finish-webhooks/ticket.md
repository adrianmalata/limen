<!-- PL: Ticket R-002 etapu 1 przebudowy: wycięcie webhooków po zakończeniu zadania (z kolejką, plikiem tokenów
i poleceniem `limen webhook`), zdarzeń koordynatora (idle, blocked, goal-done, exited) i skryptu
bin/tony-finish-ping.sh (decyzja G1.3, A-027). Rejestracja koordynatora w .limen/coordinators/ zostaje, bo czyta ją
`limen rule` aż do R-034. Ticket buduje raz tabelę starych nazw poleceń (T-18), w której wycięte polecenie odmawia
ze wskazówką, i rejestruje pliki pozostałe po funkcji w rejestrze R-001. Stan: zamknięty commitem R-002 (18.11). -->

# R-002 Cut finish webhooks, coordinator signals and the finish ping

## Problem

Gate 2 cut three features the seat does not use, which run on one pipeline: finish webhooks (job, stall and
lead-step events through `src/integrations/finish-webhook.ts` and the queue `src/integrations/webhook-queue.ts`),
coordinator signals (the events `coordinator.idle`, `coordinator.blocked`, `coordinator.goal-done` and
`coordinator.exited` of `src/integrations/coordinator-signal.ts`, sent through the same queue), and the finish ping
(`bin/tony-finish-ping.sh`, the queue's only sender, which the role prompts tell a model to run).

Relied on:
- G1.3 (gate 2): "Finish webhooks, coordinator signals, `bin/tony-finish-ping.sh` | cut".
- A-027, Decision: "fix (via G1.3) — Webhook token file goes with the webhooks." A-060 and A-076: "rejected (not
  applicable) — Webhook queue cut (G1.3)" and "— Webhooks cut".
- A-085, Decision (excerpt): "the finish-ping paragraph goes (G1.3)".
- `plan.md` → `## Stages`, stage 1: "cut commands refuse with a pointer, and `limen status` lists the leftover files of
  cut features"; conventions: "a CLI change makes the old form exit with code 2 and name the new form in `next` (…;
  before R-013, a non-zero exit with the replacement in the message)".
- T-18, Migration: "an old name exits with code 2 (T-02) and names the new one in `next`; a ticket in the last stage of
  the plan removes the table of old names" (R-085).
- `plan.md` → `## Tickets`, notes, R-001: "every cut ticket registers the leftover paths of its feature";
  `src/project/leftovers.ts` (R-001): `LEFTOVERS` entries are relative, normalised, outside `.git/`, and overlap no
  other entry and no `TRACKED` path (`test/project/leftovers.test.ts`).
- `limen rule` uses the coordinator registration under `.limen/coordinators/` (`src/commands/rule.ts:189-199` →
  `liveCoordinators` in `coordinator-signal.ts:385-422`), and R-034 cuts `limen rule` in stage 3 (`## Deployment`
  3.5), so the registration stays until then.
- `limen ticket-author` imports `GITHUB_NOREPLY` and `GITHUB_LOGIN` from `src/integrations/finish-receipt.ts:9-11`;
  R-006 cuts `ticket-author`.
- D-025: a criterion checks only the ticket's scope, as an exit code; a scan over the tree is this ticket's own only
  when every match it finds at the parent is one the ticket removes (checked at `HEAD` for AC-2).
- D-029: a test that fails even once without a change of the code it runs is a finding; nobody runs it again for a
  green gate.

## Change

1. Delete with `git rm`: `src/integrations/finish-webhook.ts`, `src/integrations/webhook-queue.ts`,
   `src/integrations/finish-receipt.ts`, `src/integrations/finish-turn.ts`, `src/commands/webhook.ts`,
   `bin/tony-finish-ping.sh`, `docs/finish-webhooks.md`, `test/s7-webhooks.test.ts`, `test/u2-webhook-trust.test.ts`.
2. Coordinator signals: `src/integrations/coordinator-signal.ts` keeps only the registration that `limen rule` reads
   (`start` and `shutdown` writing `pid`, `pane`, `started-at`, `born` and `shutdown`; `liveCoordinators`,
   `registeredProcess`, `readOptional`; the removal of dead registrations that `sweepCoordinators` does today) and
   moves with `git mv` to `src/integrations/coordinator-registration.ts` (T-25: named after what remains). The events,
   the `coordinator-events/` claims, `session-file`, `title`, `tool`, `turnSignal` and every send go. `hook/wake.ts`
   keeps the registration's start and shutdown and drops the event handlers (`agent_end`, the four `pi.on` lines of
   tool and goal events, `messageEnd`, `settled`) and the resend in `stampSweep`; `src/commands/sweep.ts` keeps the
   removal of dead registrations and drops the resend of queued pings.
3. Every other use of the cut modules goes (the inventory of the main session, at `HEAD`):
   - `src/main.ts`: the `webhook` command, its two help lines, and the resend before every command (`:185-188`).
   - `src/job/record.ts`: the finish delivery in `finalizeJob` (`:89-91`) and its comment.
   - `src/commands/spawn.ts`, `src/commands/continue.ts`, `src/job/publication.ts`: the webhook environment and author
     (`finishWebhookEnv`, `captureFinishAuthor`, `finishConfig`, `finishAuthor`, the job files `finish-webhook-env` and
     `finish-webhook-author`).
   - `src/runtime/supervisor.ts`: `deliverJobStall` and its imports, `noteKind` included when it has no other use.
   - `src/commands/jobs.ts` and `src/job/view.ts`: the `finish-webhook` evidence, section and label.
   - `src/commands/status.ts`: the "Finish webhook rejects" line.
   - `hook/group-peer.ts`: the lead-step webhook (`leadSteps`, its seen state, the delivery loop) and the imports that
     become unused.
   - `src/commands/ticket-author.ts`: takes `GITHUB_NOREPLY` and `GITHUB_LOGIN` as its own constants (R-006 deletes
     the file).
   - `templates/agents.md:228` and `templates/worker.md:38`: the finish-ping paragraph (A-085), with
     `templates/.history/` brought in line as `test/structure.test.ts` requires; the history files are written with
     Edit or Write, since a command with a variable assignment in front breaks the allow-list (D-016).
   - `test/plant.ts`: `LIMEN_WEBHOOK_RETRY_MS`; `test/s8-groups.test.ts`: the `.limen/finish-webhook.env` fixture, the
     ping assertions and the lead-step titles, with a wait on the group's or the job's own state where a test waited
     for the webhook receipt; `test/u3-turn-signal.test.ts`: its first test (the turn signal), keeping the second.
   - Docs: `README.md`, `CONTRIBUTING.md`, `docs/commands.md`, `docs/herdr-status.md`, `docs/jobs.md`,
     `docs/groups.md` say nothing of the cut features; `bin/limen-group-fixture.mjs:45` likewise.
4. Coverage that leaves with `test/s7-webhooks.test.ts` and stays a mechanism of Limen: the continuation started from
   a subdirectory (`test/s7-webhooks.test.ts:81-89` at `HEAD`) moves to `test/cli/continue.test.ts`. The check that
   `limen wait` prints the whole final message (`:71`) goes, since R-006 cuts `wait`.
5. New module `src/old-names.ts`, the table of old command names (T-18; R-085 removes it): a readonly list of
   `{ name, feature, ticket, instead }`. `src/main.ts` looks a command up there before it reports an unknown command,
   and refuses: the message `limen <name> was removed with <feature> (<ticket>); <instead>` and a non-zero exit
   (R-013 gives it code 2 with `instead` in `next`). R-002's entry: `webhook`, "finish webhooks", R-002, "the
   coordinator gets a wake when a job ends". A refusal writes nothing, so an old hook or supervisor that still runs
   `limen webhook deliver <dir>` gets one line and no retry from Limen's side. Every cut ticket after R-002 that
   removes a command adds its entry.
6. `src/project/leftovers.ts`: `LEFTOVERS` gets `.limen/finish-webhook.env` (holds a credential), `.limen/outbox`,
   `.limen/webhook-rejected` and `.limen/coordinator-events`, each with the feature `finish webhooks (R-002)` or
   `coordinator signals (R-002)`.
7. Tests, written first and failing at `HEAD`:
   - `test/cli/old-names.test.ts`: on a plant, `limen webhook test` and `limen webhook deliver /tmp/x` exit non-zero,
     their stderr holds `limen webhook was removed with finish webhooks (R-002)` and the pointer, and the project's
     `.limen/` is unchanged; every entry of the table has a non-empty feature, ticket and pointer, and no entry names
     a command that `src/main.ts` still registers.
   - `test/cli/status.test.ts`: a project with `.limen/finish-webhook.env` lists it under `Leftover files` with
     `(finish webhooks (R-002))`.
   - `test/cli/continue.test.ts`: the moved test of item 4 (it passes at `HEAD` too, as a moved test; the outcome says
     so).

## Out of scope

- The job files under `.limen/jobs/<id>/` that the cut code wrote (`finish-webhook*`, `events/`): they are part of a
  job's record, which R-021 migrates; they are not registry entries.
- `limen rule` and the coordinator registration it reads (R-034); the coordinator's registered start (R-050).
- Seat-level files named only in the removed docs (`~/.overment/…`, a systemd `Environment=LIMEN_FINISH_WEBHOOK_ENV=`,
  an `info/exclude` line): outside the projects; the outcome names them for Adrian.
- Typing the refusal (`LimenError`, code 2, `next`): R-013. Cutting `wait`, `ticket-author` and the other commands of
  R-006.

## Acceptance

- AC-1: `git ls-files -- src/integrations/finish-webhook.ts src/integrations/webhook-queue.ts
  src/integrations/finish-receipt.ts src/integrations/finish-turn.ts src/commands/webhook.ts bin/tony-finish-ping.sh
  docs/finish-webhooks.md test/s7-webhooks.test.ts test/u2-webhook-trust.test.ts src/integrations/coordinator-signal.ts
  | grep -q .` → exit 1 (none is tracked).
- AC-2: `git grep -q -E 'finishWebhook|FinishWebhook|finish-webhook-|webhook-queue|webhookQueue|tony-finish-ping|deliverEventWebhook|deliverLeadStepWebhook|deliverJobStall|captureFinishAuthor|coordinatorSignals|turnSignal|sweepCoordinators|LIMEN_FINISH_|LIMEN_WEBHOOK_|resendNearbyPings|resendQueuedPings|inspectFinishWebhook|Finish webhook rejects' -- src hook bin templates test docs README.md CONTRIBUTING.md package.json`
  → exit 1 (no match). At `HEAD` every file it matches is one this ticket deletes or changes (D-025; the main
  session's run matches 29 files, all in items 1–3). The pattern leaves out the paths of item 6
  (`.limen/finish-webhook.env`, `.limen/webhook-rejected`, `.limen/coordinator-events`), which the registry names on
  purpose.
- AC-3: `node --test test/cli/old-names.test.ts` → exit 0.
- AC-4: `node --test test/project/leftovers.test.ts` → exit 0 (the new entries satisfy the registry's rules).
- AC-5: `node adrian-rebuild/tools/fails-before.mjs` → exit 0: the new and changed test files fail at `HEAD`, except
  the moved test of item 4, which the outcome names.
- AC-6: `node adrian-rebuild/tools/gate.mjs` → exit 0 with `fail 0`; the outcome names every test removed with the
  cut and the count before and after.
- AC-7: `node adrian-rebuild/tools/check.mjs` → exit 0; `npx biome check --error-on-warnings adrian-rebuild` → exit 0.
- AC-8 (judgment): `limen rule` still finds live coordinators: the registration's files are written and read as at
  `HEAD`, and dead registrations are still removed by the sweep.
- AC-9 (judgment): the docs and templates of item 3 say nothing of the cut features and nothing the code does not do.

## Migration

- On disk: the four project paths of item 6 become leftover files; `limen status` lists them and `limen init
  --drop-leftovers` removes them (R-001's mechanism, tested in AC-4 and the status test of item 7). On the seat:
  `## Deployment` 1.1.
- CLI: `limen webhook` refuses with the pointer of item 5 (tested in AC-3); old hooks in coordinator panes stop
  calling it after `/reload` (`## Deployment` 0.x).

## Risk

- A removed import that another module still needs breaks the build; the gate's `tsc --noEmit` catches it.
- Cutting part of `coordinator-signal.ts` could break `limen rule`'s pane list; AC-8 and `test/s2-hosted.test.ts`
  (the rule test that builds `.limen/coordinators/` by hand) cover it.
- A hosted supervisor or a coordinator pane on old code keeps queuing pings until it ends or reloads; the queue then
  fails to start the sender and retries in its own process. Nothing on the seat depends on the pings (G1.3).

## Rollback

`git revert $(git log --format=%H --grep='^R-002:' adrian-rebuild --)`; the leftover files are not removed until
Adrian runs `limen init --drop-leftovers`.

## Decisions

- 2026-11-18 (main session): size L instead of M (`plan.md` → `## Tickets`): the inventory found 9 files to delete
  and about 20 to change, and the coordinator registration must stay for `limen rule`. The old-name table is built
  here once, as R-001 built the leftover registry once; its message wording is the main session's, for Adrian to
  confirm at gate 5.1 (R-014 sets refusal texts with him).
- 2026-11-18 (implementer, `BLOCKED`): `check.mjs` failed twice on `adrian-rebuild/.plan.md.swp`, a vim swap file of
  Adrian's open `plan.md`, outside the ticket; everything else was green. Adrian closed the editor (the error is gone)
  and decided D-032: `.gitignore` ignores `.*.swp`, added in this ticket's commit by the main session, outside
  `## Change`. Adrian's D-031 (until R-019 a gate that fails only on A-087's test runs once more, with the occurrence
  in the outcome) is committed with this ticket as well; it changes `## Agents`, not this ticket's code.
- 2026-11-18 (main session, review round 1, `review.md`): fix (resumed implementer) the reason of the dead
  registration's removal in `docs/commands.md:190`, `src/commands/sweep.ts:44` and
  `src/integrations/coordinator-registration.ts:88` (housekeeping that keeps `.limen/coordinators/` from growing,
  nothing about `limen rule`). The main session fixes its records (the stage 1 sizes, this entry, AC-5's exceptions
  in the outcome). Rejected: removing the T-27 suppressions of the three changed functions (the ratchet belongs to
  R-082 and R-083), and renaming `test/cli/old-names.test.ts` now (a new, untracked file cannot be moved with
  `git mv`, and `rm` is denied; R-083 renames test files after their subject, T-29).
