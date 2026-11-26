<!-- PL: Ticket R-110 (A-079, A-037, A-051, D-114, D-120): kontynuacja zachowuje wiadomość kontekstową rodzica i dostaje
jedno powiadomienie o plikach zmienionych od jej zbudowania; w trakcie sesji (koordynator i joby) jedno powiadomienie
„changed <plik>” na zmieniony plik; skrót tablicy (NOW i NEXT) na końcu kontekstu koordynatora tylko po zmianie; golden
trybu kontynuacji. Powiadomienia i skrót jadą z biegiem jak cue (D-120), a stan „co już dostarczono” czytany jest z
kontekstu sesji, bez nowego pliku. Stan: napisany 26.11 przy `8b3cc59` z inwentarza `evidence/inventories/R-110.md`;
`planned` do odpowiedzi na Q-87 (zależności od R-042, R-043 i R-044). -->

# R-110 A continuation reuses its parent's context message; change notices and the board digest come only on a change

## Problem

Findings, each Decision quoted:
- A-037 (`audit.md:1023`): "The Limen context message (A-086) is assembled once at `session_start` and never changes
  during the session (coordinator and jobs). The board digest (NOW, NEXT) is not part of it: the hook appends a compact
  version at the end of the context only when it differs from the last delivered one. A change to vision, styleguide or
  the manual during a session: one appended notice "changed <file>, new text from the next session" with the path. …
  Measurement: cache-write tokens in the turn after a land, before and after (with A-078)."
- A-079 (`audit.md:1615`): "The Limen context message of a session (A-037, A-086) is saved in the job directory;
  `continue`, `resume --quota` and later group rounds reuse the parent's saved message, with one appended notice for
  files changed since." (`continue --review` was cut by R-006.)
- A-051 (`audit.md:1219`): "A golden test per role and mode (detached, continuation): the exact Limen context message
  (A-086) and the first task message against a reference file. A second test: with unchanged files the context message
  is byte-identical across two prompts, it is re-sent after a compaction, and the board digest appears at the end of the
  context only after a change."

Plan decisions:
- D-114 (2): "a new ticket R-110 (M, delegated, night, stage 4, after R-039) takes the continuation's reuse of the
  parent's message with one notice of the files changed since (A-079), the in-session `changed <file>` notices (A-037),
  and the board digest at the end of the context only when it changed (A-037, A-051)." D-114 (1): the context message is
  a `limen-*` custom message "never a user message", sent with no trigger.
- D-120 (quoted): "the board digest and the change notices of R-110 ride the run as the cue does: each is a `limen-*`
  custom message that a `before_agent_start` handler returns, so it ends that run's prompt and adds no request and no
  turn; this departs from T-16's `followUp` with `triggerTurn: true` for them too, as D-114 (1) did for the context
  message, and the wakes keep A-034's options."
- R-039 `ticket.md` → Decision 5 (the line): "R-039 carries the parent's `context.md` into a continuation, because a
  newly built message beside the copied transcript would give the child two context messages; R-110 adds the one notice
  of the files changed since, the in-session notices, the digest and the continuation golden." R-039 → Decision 4: the
  frozen bytes are those of the `limen-context` entry in `ctx.sessionManager.buildContextEntries()`.

Engine facts (quoted from `plan.md` → `## Engine facts`):
- E-1: "Pi custom messages (the per-turn cue, reminders) all arrive as `user`."
- E-11: "`before_agent_start` runs once per run (each prompt sent while idle), not per LLM turn …; `sendMessage` custom
  messages reach the model as `user`."
- E-13: re-send on `session_compact`, with an option per trigger (R-039's rule for the context message).
- E-14: "When the session is reused, consecutive user messages are joined in order with a blank line into one prompt …;
  on a rewrite each message is its own record."
- E-16: "The message is stored with role `custom`, so the session's `user` entries stay Adrian's own."
Pi 1.5.1 (inventory section 3, from the tarball): each `before_agent_start` handler may return one message, collected
in load order after the prompt (`core/extensions/runner.js:1137-1153`, `core/agent-session.js:1560-1587`), with no extra
request; a run's custom messages are stored as `custom_message` entries with `customType` and `content`
(`core/session-manager.d.ts:109-115`); `buildContextEntries()` keeps the compaction entry and what follows it
(`core/session-manager.js:201-229`). The bridge sends a reused session's trailing user run as one prompt, joined with a
blank line (`evidence/engine-sources/bridge-5.0.3.md`, lines 27, 38).

Rules: T-15 ("only when the rendered footer differs from the last appended one (a text comparison, as for the board
digest in A-037)"), T-16 (Limen's messages are `limen-*` custom messages, never `sendUserMessage`; options by D-114 (1)
and D-120), T-23 ("the coordinator's board digest (A-037)"), T-37 (3) ("the footer and the board digest come from the
same function as `limen status`", R-073's), T-25 (1), T-29, T-30, T-32 (1) and (4) (Pi's API only through
`src/runtime/pi-api.ts`, with guards), T-36 (no process starts while the context message is built), A-085, z. 3
("zmienne … dokładane na końcu. Nie edytować prefiksu w trakcie sesji"), z. 4 (rules re-injected from a file after
compaction). Seat step 4.2; M-04.

Facts at `8b3cc59` (the product code is `aa721d7`'s, the inventory's; R-038–R-044 rewrite these files first, so the
lines are pointers to today's code):
1. The board digest is `boardDigest` (`hook/communication.ts:294-304`): `## Board digest (spec/build.md)` with the
   `## NOW` and `## NEXT` sections of `spec/build.md`, bounded at 1,000 lines; it is the last part of the coordinator's
   `systemPrompt` at every `before_agent_start` (`:172-177`, `:87-90`), which the bridge drops (E-1). R-039 removes it
   from Limen's text, so until R-110 it reaches no model (R-039 → Out of scope).
2. No code compares a session's instructions with the files they came from, and none emits a `changed <file>` line;
   the reminder memory is cleared at `session_start` and `session_compact` (`hook/communication.ts:40-41`, `:103-109`).
3. One entry point serves every continuation (`startContinue`, `src/job/continuation.ts:85`): `limen continue`, the
   resume after a quota (`src/runtime/resuming.ts`) and group rounds (`src/job/group-rounds.ts:162`); the record holds
   the job's `role` (`src/job/publication.ts:143`).
4. The communication hook reads the project at `LIMEN_CONTEXT_ROOT`, else its cwd, and knows a job by `LIMEN_JOB` and
   `LIMEN_JOB_ID` (`hook/communication.ts:65-67`, `:141-143`).
5. `test/hook/communication.test.ts` keeps one handler per event (`:46-47`), which a second `before_agent_start`
   handler would overwrite.
6. Text: `docs/setup.md:179` ("The board digest comes last, so a change to NOW or NEXT does not break the cached
   prefix") and `docs/jobs.md:161` ("Limen copies the saved session into a new linked job"), which R-039 rewrites and
   R-110 completes.

## Change

1. `src/runtime/context-message.ts` (R-039's, with R-040's and R-044's parts): one exported function that names the
   paths whose part changed since a frozen message was built, with in-process file reads only (T-36):
   - it builds the parts the role would get now, with the inputs its publication used (the role, the project root, and
     for a job the bridge-isolation value of its route, R-040);
   - a current part whose exact text (its `## <Label> (<path>)` heading and body) is not in the frozen bytes names its
     path; a part the role can have whose heading is in the frozen bytes but which has no current text names its path
     too (a removed file). It finds headings by the ones the module itself writes, with no parser of other text;
   - an edit outside every part, for example below the register's first `## Cue:`, names nothing.
2. `hook/communication.ts`: two `before_agent_start` handlers registered after the cue's, so a run's prompt ends with
   the cue, then the notice, then the digest (D-120). Each returns a `limen-*` custom message with `display: false`, as
   the cue, and neither keeps state in the hook's memory: what was delivered is read from
   `ctx.sessionManager.buildContextEntries()`, so a `/reload` and a compaction act on the context the model holds.
   - Notice (`limen-notice`), in the coordinator session and in jobs (A-037 "(coordinator and jobs)"): the frozen bytes
     are the content of the `limen-context` entry in that context; the paths of item 1, minus every path a
     `limen-notice` entry in that context already names; when any remain, one message, one line per path:
     `changed <path>, new text from the next session` (A-037's form; R-046 sets the final words), in a neutral tag pair
     as the cue's. A job's role is its record's `role` (fact 3), read from its folder (fact 4).
   - Digest (`limen-board`), in the coordinator session only (T-23): today's text of fact 1 in a neutral tag pair (T-37
     (3): until R-073 gives it `limen status`'s function); returned when the context holds no `limen-board` entry or
     its last one's content differs (T-15's text comparison), so a session's first run gets it, an unchanged board
     sends nothing, and after a compaction it comes again.
   - Neither handler changes or re-sends the `limen-context` entry or `context.md`.
3. A continuation (A-079) needs no code of its own: its copied transcript holds the parent's `limen-context` entry
   (R-039), so the child's first run compares the parent's frozen bytes with the files now and sends one notice of every
   path changed since; the parent's notices are in the copied context and are not repeated. `limen continue`,
   `resume --quota` and group rounds pass the same hook (fact 3).
4. `src/runtime/pi-api.ts` and `test/runtime/pi-contract.test.ts`: only if R-039's declaration of a custom message entry
   lacks a field these handlers read (T-32 (1), (4)).
5. `test/fake-engine.mjs`: if R-038's fake keeps one handler message per run, or has no second prompt within one
   session, it is extended (a helper beside it allowed), named in `outcome.md`.
6. Goldens of the continuation mode (A-051): one committed reference file per job role of R-039's list (worker,
   reviewer, judge, keeper, researcher, quality, group team) beside R-039's in `test/runtime/context-message/`, each the
   child's first model call in `fake-view.jsonl` after a parent job and one changed styleguide: the context message once
   and equal to the role's detached reference, then the task, then the notice; the cue is left out, since R-041 rewrites
   it. The plant switches on each module role's module (R-044).
7. Docs (T-30, A-085): `docs/setup.md` (Hooks: the digest at the end of the coordinator's context only when it changed;
   one notice per changed path, also in jobs); `docs/jobs.md` (continue: the child keeps the parent's context message
   and gets one notice of the files changed since); `CONTRIBUTING.md` where it names the digest; the hook's comments.
8. Tests, each failing at HEAD with R-039 done (T-29):
   - `test/runtime/context-message.test.ts`: item 1 on fixtures: no change names nothing; a changed styleguide names
     `.agents/limen/styleguide.md`; an edit below `## Cue:` names nothing; a removed vision and a new module part are
     named.
   - `test/hook/communication.test.ts` (the handlers kept as a list): the coordinator's first run returns a
     `limen-board` message after the cue, last; a second run with the same board returns none; after a change of NOW the
     next run returns the new digest; after a compaction that summarised it, it returns again; a job gets none; a changed
     styleguide gives one `limen-notice` with the path, in the coordinator and in a job, once per context, and again
     after a compaction removed it; the `limen-context` entry keeps its bytes and no second one is sent; no process
     starts during a run.
   - `test/cli/continue.test.ts`: item 6's goldens, and one case with no change and no notice.
   - `test/s4-steering.test.ts`: in the fake's model view the coordinator's first call ends with the digest.

Files the criteria name that this ticket or R-039 creates: `src/runtime/context-message.ts`,
`test/runtime/context-message.test.ts`.

## Out of scope

- The words of the marker, the notice and the digest's heading (R-046); the digest from `limen status`'s function
  (R-073, T-37 (3)); the generated board (R-066, T-23).
- Owner decisions in the context (R-072, A-034); wakes as custom messages and the owner-message function (R-051): the
  digest and the notices are `limen-*` custom messages, so they are no owner message.
- The cue (R-041); reminders in the tool result (R-043), which may name the same file as a notice.
- Whether the start script resumes the coordinator's Pi session after a deployment (R-050), which decides between a
  notice and a fresh message from a0.5.0.

## Acceptance

- AC-1: `node --test test/runtime/context-message.test.ts` → exit 0.
- AC-2: `node --test test/hook/communication.test.ts` → exit 0.
- AC-3: `node --test test/cli/continue.test.ts` → exit 0; `node --test test/s4-steering.test.ts` → exit 0.
- AC-4: `node --test test/fake-engine.test.ts` → exit 0; `node --test test/runtime/pi-api.test.ts` → exit 0;
  `node --test test/runtime/pi-contract.test.ts` → exit 0.
- AC-5: `node adrian-rebuild/tools/fails-before.mjs test/runtime/context-message.test.ts test/hook/communication.test.ts
  test/cli/continue.test.ts test/s4-steering.test.ts` → exit 0, its output in `outcome.md` → `## Fails before`.
- AC-6: `git grep -q 'limen-board' -- hook/communication.ts` → exit 0.
- AC-7: `git grep -q 'limen-notice' -- hook/communication.ts` → exit 0.
- AC-8: `git grep -q 'new text from the next session' -- hook/communication.ts src/runtime/context-message.ts` →
  exit 0.
- AC-9: `node adrian-rebuild/tools/gate.mjs` → exit 0.
- AC-10: `npx biome check --error-on-warnings .` → exit 0; `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-11 (judgment): the frozen message's bytes never change in a session; the notice and the digest are `limen-*`
  custom messages returned with the run after the cue (D-120), the digest last and only on a change of its text, in the
  coordinator only; one notice per changed path per context, jobs included; every doc sentence describes behaviour
  present in the commit (T-30).

## Migration

None: no file, record field or format changes (the comparison reads the bytes the session holds). A parent published
before R-039 gets a `context.md` built at the child's publication (R-039), so its child gets no notice, which is true
to what that parent's session held under the bridge (nothing, E-1). A coordinator session that holds R-039's
`limen-context` entry but no `limen-board` entry gets the digest at its first run after the deployment. The projects'
hook stub does not change.

## Risk

- After a deployment that changes a package text, every open session names that file once: true, since its frozen
  text is the old one; the coordinator's next session holds the new text.
- The digest at the end of a run's prompt may change the cached prefix differently than measured (E-2: Claude Code
  decides breakpoints); M-04 on the seat at 9.1.
- A large NEXT section costs its tokens in every run after a change; today's 1,000-line bound holds until R-073.
- The child's first query takes the bridge's rewrite path (a first turn with history), read from the evidence file and
  not run; step 4.2 shows it.

## Rollback

`git revert $(git log --format=%H --grep='^R-110:' adrian-rebuild --)`. Nothing is written to disk, so no reverse
migration; the `limen-notice` and `limen-board` entries already in a session stay as history and are read by no older
code.

## Decisions

Settled by the documents when the ticket was written (2026-11-26, the main session's reading, not a night default; the
inventory's questions in `evidence/inventories/R-110.md` → section 11):
1. The digest is no part of the frozen message and is compared as text with the last delivered one (S1): A-037, T-15.
2. Every message is a `limen-*` custom message, never `sendUserMessage` (S2): A-034, T-16, D-114 (1).
3. The continuation keeps the parent's message byte for byte (S3): R-039 Decision 5.
4. The notice's words (S4): A-037's form; R-046 sets the final words, as D-114 (3) does for the marker.
5. Jobs get the in-session notice, the digest stays the coordinator's (S5): A-037 "(coordinator and jobs)"; T-23.
6. A golden per job role in the continuation mode (S6): A-051 "per role and mode".
7. No record field and no new job-folder file (S7): R-039 → Out of scope; the row's `Mig. —`.
8. "Since" is decided by rebuilding and comparing parts (Q1 (A)): no stored state, no process (T-36); a sidecar of
   digests would be an on-disk format (Mig. yes) and mtimes change with a checkout.
9. The continuation's notice comes from the child's hook at its first run (Q2 (ii)): one rule for A-079 and A-037, no
   change at publication (T-38).
10. The check runs per run at `before_agent_start` (Q3 (a)): E-11's point, no extra request; a file watcher would
    deliver mid-run, which the bridge holds for a query of its own.
11. What was delivered is read from `buildContextEntries()` (Q4 (a)), so a `/reload` repeats nothing and a compaction
    repeats what it removed.
12. Two message types, `limen-notice` and `limen-board`, each from its own handler, notice before digest (Q5): each
    presence check stays exact, and the digest ends the prompt.
13. A job's role comes from its record (Q6 (a)); a transport variable would re-add what `src/config.ts` removed.
14. The fake is extended only where R-038's lacks a second handler message or a second prompt (Q7), named in
    `outcome.md`.
15. Delivery (O1): D-120, option 1.
16. The digest's text (O2): today's NOW and NEXT text until R-073 (T-37 (3)); no text change in a delegated ticket.
17. One notice form for a session and a continuation (O3): A-037's form and T-18 (one word per thing); R-046 sets the
    words. "New text from the next session" stays true for a continuation, which keeps its parent's text by design.
18. The plan's gaps (inventory section 11) are fixed in this ticket's commit of the plan: step 4.2 also checks the
    digest and an in-session notice, and M-04's Tickets column names R-110.
