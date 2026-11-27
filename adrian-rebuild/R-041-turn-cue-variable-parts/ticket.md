<!-- PL: Ticket R-041 (A-077, T-13, D-134): wskazówka tury trzyma tylko linię odbiorcy, części zmienne (porażka
poprzedniej tury, ticket, ostatnia edycja, długość tablicy) i kotwicę ramy, pod tagiem `limen-turn-cue`. Sekcje
Shared, Human, Agent i Wake znikają razem z `templates/communication.md`; reguła języka trafia do rejestru właściciela,
akapit ASD-STE100 do rejestru agenta, a linia wizji joba do jego wiadomości kontekstowej. Stan: napisany 27.11 przy
`511fafd` z arkusza wariantów (D-134); tryb `pair`, `Run` `night`, implementuje `rebuild-implementer`. -->

# R-041 The turn cue holds only variable parts and the audience line

## Problem

A-077 (`audit.md`), Decision quoted: "fix — The turn cue holds only variable parts (failure of the last turn, last
touched area, ticket), one audience line ("Audience: owner" or "Audience: agent") instead of repeated register
sections, and the one-sentence frame anchor (A-043); target ≈40–60 tokens per prompt. The cut removes the cue
sentences that produce today's closing overview and outcome-first opening (§1); their replacements are stage 3
(taste) decisions." Its evidence: each prompt adds ≈221 tokens (coordinator; ≈262 on a wake) or ≈237 (jobs) that stay
in history.

T-13 (`taste.md`), quoted: "The owner register (A-038) answers in the language of the owner's last message, with no
setting and no per-project override (A-039). … The agent and specs registers use plain technical English, about 80 %
ASD-STE100, as the author wrote … The audience line of the cue carries the language ("Audience: owner. Answer in the
language of the owner's last message." / "Audience: agent. Plain technical English."); the fixed "English" on every
turn goes." Check: "a golden test: the owner register holds the language rule, and the owner cue does not contain
"English"; a seat check (`plan.md` → `## Deployment` item 12)", which is step 4.4.

A-043 (`audit.md`), Decision, the part R-041 relies on: "Its one-sentence anchor stays in the turn cue." Its words are
R-046's (A-043 is R-046's source).

T-15 (1) (`taste.md`): "(1) is one rule with its reason in the owner register; it takes over "the result first" from
`## Cue: Shared` and `## Cue: Wake`, whose sentences A-077 cuts from the per-turn cue." T-15, footer note 1: "The source
of today's model-written overview is `## Cue: Human` … A-077 cuts it and code takes the footer over". Both rules stand
in the owner register, which reaches the coordinator in its context message since R-039 and R-040.

D-134 (`plan.md` → `## Decisions`, Adrian, 2026-11-27, "rekomendacje", Q-94–Q-99), quoted: "(1) Q-94: the turn cue's tag
pair and custom type are `limen-turn-cue`, the plan's term (T-18). (2) Q-95: the failure line is `Last turn failed
(<reason>).`, the fact alone; what to do after a failed turn stays in the owner register. (3) Q-96: the job's vision
line moves, as one line, into the job's context message; the board line goes, since every job role's text already
forbids board edits, and the keeper's sentence about the per-turn cue (`templates/keeper.md:14`) goes with it. (4)
Q-97: the owner register's first line becomes "Use the register the audience line names, and answer in the language of
the owner's last message. Switch to plain technical English only for text another agent will execute or a file will
keep (a ticket, a job task, a steer, a commit), because agents read it and the records keep one language."; it names
no `limen ask` (T-13 and T-15 differ on its fields' language; R-068). (5) Q-98: the ASD-STE100 paragraph of `## Cue:
Shared` moves unchanged under `## Agent` of the agent register. (6) Q-99: `templates/communication.md` is cut; the
audience lines and the failure line are constants in `hook/communication.ts` beside the touch, ticket and board lines."

D-114 (3): the context message "starts with a neutral fixed marker (a tag pair, as the cue's, with the role name)", so
the cue keeps a tag pair.

Engine facts (quoted from `plan.md` → `## Engine facts`): E-1: custom messages become the `user` role, and only tool
results get another role; E-11: a custom message with `display: false` still reaches the model; E-14: "When the session
is reused, consecutive user messages are joined in order with a blank line", so the task (or a wake) and the cue reach
the model as one prompt.

Rules: z. 3 (stable text first, variable text last; the prefix does not change in a session), A-085 (one copy of each
fact), T-14 (a rule and its reason, literally), T-18 (one word per thing), T-29 (a test mirrors its module), T-30 (docs
and comments follow the code).

Facts at `511fafd`:
1. `turnCue` (`hook/communication.ts:239`) joins with blank lines, inside `<limen-project-context>`: the capability
   frame's `## Cue` anchor, `## Cue: Shared`, `## Cue: Human` or `## Cue: Agent`, `## Cue: Failure` after a failed turn,
   `## Cue: Wake` on a wake prompt (`isWakePrompt`, a prompt that starts with "Limen job "), and for a job the ticket
   line, the vision line and the board line; then the touch line, and for the coordinator the board advisory.
   `CUE_TYPE` is `"limen-project-context"` (`:45`); `registerCue` (`:278`) reads `templates/communication.md` (`CUE_FILE`,
   `src/runtime/context-message.ts:23`).
2. Sizes measured at `511fafd` from the package texts (bytes / 4): coordinator 882 bytes ≈ 221 tokens, on a wake 1046 ≈
   262, a job with a ticket line 949 ≈ 237. The anchor alone is 164 bytes ≈ 41 tokens.
3. The owner register's first line: "Use the register the audience cue names. Switch only when this reply, or part of
   it, will be executed by another agent." (`templates/registers/owner.md:1`). The owner register already holds "When
   the previous turn failed, the first line says it failed and what is being redone" (`:25`), "A reply that a job's
   completion triggered opens with what the job did" (`:26`) and the closing overview (`:43`).
4. The board rule in each job role's text: `templates/worker.md:18`, `templates/researcher.md:3`, `:10`,
   `templates/judge.md:3`, `:10`, `templates/quality.md:12`, `templates/group-member.md:5`, `templates/reviewer.md:16`;
   the keeper's exception names the cue (`templates/keeper.md:13`; D-134 (3) cites `:14`, its place before R-044).
5. A job's context message holds no vision (`src/runtime/context-message.ts:80`, `coordinator ? boundFile(root,
   VISION_FILE, "Vision") : ""`); `VISION_FILE`'s comment says a job gets it "by a pointer in its cue".
6. Text that describes the cue: `CONTRIBUTING.md:29`, `:33-39` (`## Registers and cues`), `docs/setup.md:187` ("A short
   note on each turn recalls the capability frame in one sentence and names the audience and the reply rules. The wake
   cue is in that note, not in the context message.") and the `### Hooks` paragraph's list of a job's parts.
7. Tests that name the cue's tag or file: `test/hook/communication.test.ts` (the `<limen-project-context>` checks at
   `:347`, `:621`, `:642`, `:655`, and the A-039 test that reads `templates/communication.md` at `:357`),
   `test/seat/bridge-contract.test.ts:11`, `:30` (a synthetic
   fixture), and the reference message `test/runtime/context-message/owner-facing-coordinator.md` (the owner register's
   first line).

## Change

1. `hook/communication.ts`, `turnCue`: the cue is `<limen-turn-cue>`, its lines joined by one newline, then
   `</limen-turn-cue>`; the custom type `CUE_TYPE` is `"limen-turn-cue"` (D-134 (1)). Its lines, in this order, each
   only when it applies:
   - the audience line, a constant: `Audience: owner. Answer in the language of the owner's last message.` in the
     coordinator, `Audience: agent. Plain technical English.` in a job (T-13);
   - after a failed turn, `Last turn failed (<reason>).`, `<reason>` as `assistantStopReason` records it today
     (D-134 (2));
   - in a job, `Ticket: <path>` (today's line);
   - the touch line (today's `Last turn edited|wrote <paths>.`);
   - in the coordinator, the board advisory (today's line);
   - the anchor, the capability frame's `## Cue` section (A-043; R-046 sets its words).
   `registerCue`, `isWakePrompt`, the `wake` parameter, the job's vision and board lines and the `CUE_FILE` import go.
   Every other handler of the hook is unchanged.
2. `templates/communication.md` is deleted (`git rm`, D-134 (6)); `CUE_FILE` goes from
   `src/runtime/context-message.ts`.
3. `src/runtime/context-message.ts`: a job's message holds, when the project at `root` holds `spec/vision.md`, one part
   that is the line "Vision (read-only): `spec/vision.md` — durable intent. Load it before choosing or starting work."
   (today's cue line, `hook/communication.ts:259`, unchanged; D-134 (3)), in the place of the coordinator's vision part
   (after the registers, before the styleguide, with the vision file's module parts after it as for any part); without
   the file, no part. `VISION_FILE`'s comment follows.
4. `templates/registers/owner.md`: line 1 becomes the two sentences of D-134 (4), verbatim.
5. `templates/registers/agent.md`: under `## Agent`, before its first line, the paragraph "Write in plain technical
   English (about 80% of ASD-STE100). Short sentences. One idea each. Active voice. Simple exact words. One word for one
   thing. No slang, idioms, or filler." (from `## Cue: Shared`, unchanged; D-134 (5)).
6. `templates/keeper.md`: the sentence "A per-turn project cue says the board is read-only; that rule is for workers,
   and this line is your exception." goes (D-134 (3)).
7. Text (T-30, A-085): `CONTRIBUTING.md` (`:29`, and `## Registers and cues` without the cue file's paragraph, with
   one sentence on what the cue holds) and `docs/setup.md` (the note on each turn: the audience line, the variable lines
   and the anchor; no wake cue; a job's parts include the vision line) describe the commit's behaviour.
8. Tests, each failing at `511fafd` (T-29):
   - `test/hook/communication.test.ts`: a golden of the coordinator's cue with no variable line (the anchor read from
     `templates/capability.md` → `## Cue`); a golden of a job's cue with a ticket line; after a `message_end` with
     `stopReason` `"error"` the next cue holds `Last turn failed (error…).` and the one after it none; a wake prompt
     ("Limen job …") gets the same cue as an owner prompt; the owner cue holds no "English" and the agent cue holds
     "Plain technical English." (T-13); the result's `customType` is `limen-turn-cue`; a job's cue holds no
     `spec/vision.md` and no `spec/build.md`; the four `<limen-project-context>` checks name `<limen-turn-cue>`; the A-039
     test checks that a project's register leaves the cue unchanged, with no read of the cut file.
   - `test/runtime/context-message.test.ts`: the coordinator's message holds the owner register's language rule
     (T-13's golden); a worker's message in a project with `spec/vision.md` holds the vision line once, between the
     agent register and the styleguide, and one without the file holds none; every role's message holds the
     ASD-STE100 paragraph under `## Agent`. The reference messages under `test/runtime/context-message/` follow.
   - `test/seat/bridge-contract.test.ts`: its synthetic cue and custom type use `limen-turn-cue`.

Files the criteria name that this ticket creates: none.

## Out of scope

- The anchor's words and the capability frame (A-043, R-046); the rest of the owner, agent and specs registers'
  wording, the glossary and budgets (R-046, T-09, T-14).
- The closing overview: it stays in the owner register until the footer of R-073 takes it over (T-15 (5)); R-046 keeps
  it until then (Risk).
- The wake's own text and a computed wake header (R-051); the board digest and the change notices (R-110).
- The language of `limen ask` fields (R-068; T-13 and T-15 differ).
- The provider text inside the failure reason (`assistantStopReason`), unchanged.

## Acceptance

- AC-1: `node --test test/hook/communication.test.ts` → exit 0.
- AC-2: `node --test test/runtime/context-message.test.ts` → exit 0; `node --test test/seat/bridge-contract.test.ts` →
  exit 0.
- AC-3: `node --test test/cli/spawn.test.ts` → exit 0; `node --test test/s4-steering.test.ts` → exit 0.
- AC-4: `node adrian-rebuild/tools/fails-before.mjs test/hook/communication.test.ts test/runtime/context-message.test.ts`
  → exit 0, its output in `outcome.md` → `## Fails before`.
- AC-5: `git grep -q 'limen-project-context' -- hook src test` → exit 1.
- AC-6: `git grep -q 'CUE_FILE\|templates/communication\.md' -- hook src test CONTRIBUTING.md docs` → exit 1.
- AC-7: `git grep -q 'audience cue' -- templates` → exit 1.
- AC-8: `git grep -q 'per-turn project cue' -- templates/keeper.md` → exit 1.
- AC-9: `node adrian-rebuild/tools/gate.mjs` → exit 0.
- AC-10: `npx biome check --error-on-warnings .` → exit 0; `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-11 (judgment): the cue holds only the audience line, the lines of item 1 that apply and the anchor; the owner
  register's first line, the agent register's paragraph and the vision line read as D-134 (3)–(5) give them; every doc
  and comment sentence on the cue describes behaviour present in the commit.

## Migration

None. The cue is built per prompt and its custom type is read back by no code (the hook reads back only
`limen-context`); a session's old cue entries stay in its history as they are. `templates/communication.md` is a
package file; a project's copy `.agents/limen/communication.md` is already a leftover of R-040 that `limen status`
lists. A job folder's saved `context.md` from before the deployment lacks the vision line (Risk).

## Risk

- The outcome-first opening and the closing overview come once per session from the owner register instead of on every
  turn, which may weaken them; M-05 measures it at 4.8 against the baseline caveat of `## Measurement` ("cue only"
  before). R-046 keeps the owner register's overview sentence until R-073's footer (T-15 note 1 applies only then).
- `## Deployment` 0.2 refuses while a job runs, but a job published before the deployment and resumed after it (a
  limit's resume, R-034) keeps its saved `context.md`, without the vision line, while its cue no longer carries one;
  the vision stays readable at `spec/vision.md`, and its reminder still comes with an edit of a planned ticket (R-043).
- The cue's size with today's anchor is ≈67 tokens in the coordinator and ≈73 in a job with a ticket line, above
  A-077's ≈40–60; the anchor (≈41) is R-046's (M-01 at the close of stage 4).
- Seat step 4.4 shows the language rule with the real model (API `pi`).

## Rollback

`git revert $(git log --format=%H --grep='^R-041:' adrian-rebuild --)`; no reverse migration.

## Decisions

- 2026-11-27 D-134 (Adrian: "rekomendacje", Q-94–Q-99, the variants sheet of D-054 (3)): the six choices of items 1–6
  of `## Change`, each option (a); quoted in `## Problem`. The ticket keeps the mode `pair`; its `Run` is `night`, and
  `rebuild-implementer` implements it.
- 2026-11-27, settled by the sources when the ticket was written (the main session's reading, not asked): the audience
  lines' words (T-13); the cut of `## Cue: Shared`, `## Cue: Human`, `## Cue: Agent` and `## Cue: Wake` (A-077, T-15
  (1)); the anchor (A-043); the ticket, touch and board-advisory lines (A-077; the touch line's form, R-043); the tag
  pair (D-114 (3)); the order of the lines (the audience first, since it governs the reply; the anchor last); one
  newline between lines (no blank line, a few bytes per prompt; category A (b) of D-054 (2)); size M, not S (three
  modules and the role texts).
