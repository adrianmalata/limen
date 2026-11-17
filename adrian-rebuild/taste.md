<!-- PL: Rubryka taste przebudowy: część A to jawny inwentarz opinii autora Limena wbudowanych w system, część B to
zasady Adriana (T-NN) z regułą, uzasadnieniem i sposobem sprawdzenia. Po bramce 3 plik jest rubryką obok zasad
z input/, a nowe decyzje taste dopisuje się tu z datą i źródłem. Stan: część A gotowa (80 opinii autora, 40 już
rozstrzygniętych bramką 2, 40 otwartych do wywiadu); część B powstaje w wywiadzie z Adrianem (rundy 1–5: T-01–T-21). -->

# Taste

## Part A: Author's taste

The opinions that Limen's author (Adam Gospodarczyk, overment) built into the system, explicit and implicit, read at
`rebuild-base` on 2026-11-17 by two subagents (prompts, process and communication; code, CLI, tests, docs and
defaults) and merged here. Every `path:line` points at `rebuild-base` and is checked by `tools/check.mjs`. Each item
gives the opinion in one sentence, where it lives, what it gives, what it costs, its fit with Adrian's harness
principles (`z. N`, local rubric) and the audit findings it touches (`A-NNN`), and whether a gate-2 decision already
settles it. Quotes, verbatim repo fragments and the interview question of each open item stay in the source files.
A-086 applies throughout: on Adrian's seat none of the author's prompt text reached the model.

Counts: 80 items; 40 settled by gate 2, 40 open (AU-105, AU-110, AU-111, AU-112, AU-115, AU-119, AU-122, AU-123, AU-124, AU-125, AU-126, AU-127, AU-128, AU-129, AU-131, AU-133, AU-139, AU-140, AU-205, AU-206, AU-207, AU-209, AU-210, AU-211, AU-212, AU-214, AU-215, AU-216, AU-217, AU-218, AU-219, AU-220, AU-223, AU-224, AU-225, AU-226, AU-227, AU-229, AU-230, AU-236).

### Prompts, process and communication

Source with quotes, examples and interview questions: `evidence/taste/part-a-prompts.md`.

#### 1. What code decides vs what prose decides

- **AU-101 Prose carries judgment; machinery only where prose cannot reach**
  - Opinion: Wanted agent behaviour comes from prose that rides the prompt and is recalled at the moment of use; code is added only when prose cannot do the job.
  - Where: `spec/vision.md:11`, `templates/agents.md:69`, `templates/agents.md:56`, `hook/communication.ts:70-73`
  - Gives: one place to change behaviour (a sentence), no parser, no schema migration, small code.
  - Costs: the manual is ≈11.8k tokens per coordinator request and guarantees nothing; on the seat none of it reached the model (A-086), so M1 ran without it. The retro the author kept says the opposite for machinery failures: "This is not a problem another “please stay focused” sentence solves." (`spec/research/limen-ops-retro-2026-09-10.md:111`).
  - Fit: conflicts z. 14 (guarantees in code, not in the prompt) and z. 21 (deterministic and checkable → script); related findings A-012, A-031, A-086.
  - Gate 2: settled by §5 #1, G3, G4, A-031: change (checkable rules move to code; prose keeps judgment only).
- **AU-102 The harness informs; it never gates and never owns state**
  - Opinion: Limen reports facts and the coordinator decides; no state, verdict or check blocks a land, and runtime files are plain files anyone may fix by hand.
  - Where: `spec/vision.md:10`, `templates/agents.md:111`, `templates/reviewer.md:20`, `templates/agents.md:100`, `templates/agents.md:224`, `templates/agents.md:231`, `src/job/wake-text.ts:82`, `src/job/wake-text.ts:98`
  - Gives: the coordinator is never stuck behind a gate; recovery is `cat` and an editor; the author could land F953 despite a FAIL when he judged it right.
  - Costs: the wake says "Job done. Next step: land it" and "After it lands, continue with the next item on the board" (`src/job/wake-text.ts:82`, `:98`), so with no gate a weak candidate lands on one turn; hand-edited state races with the finalizer (A-019). The "No harness rule owns these files" sentence is already in the first manual (commit `6743d9e`) and never changed.
  - Fit: conflicts z. 1 (success = deterministic criterion, not the agent's word) and z. 14; related findings A-012, A-013, A-019, A-032.
  - Gate 2: settled by G3, G4, A-012, A-032, S1+: change (land conditions in code; state written only through the transition function).
- **AU-103 Project policy lives on the board and in the owner's words, applied by the coordinator**
  - Opinion: Engine, models, reasoning, timeouts, review lane, proof rules and quota policy are prose choices on `spec/build.md` or in a newer owner message, and the coordinator re-reads and applies them before each launch.
  - Where: `templates/agents.md:63`, `templates/agents.md:69`, `templates/agents.md:94`, `templates/agents.md:65`
  - Gives: the owner changes policy by editing one Markdown file or saying one sentence; no config format.
  - Costs: the model must copy flags right on every spawn; the author's own retro saw two coordinators run Grok when their briefs asked for Astra; owner decisions live only in the thread (A-034); the coordinator can rewrite its own policy (z. 16).
  - Fit: conflicts z. 14 and z. 16 (self-configuration needs limits); related findings A-030, A-034, A-010, A-015.
  - Gate 2: settled by A-030 (`routes.json`), A-015 (`limits.json`), A-034 (`limen decide`), A-010 (seat rules cut): change.
- **AU-104 Job boundaries are written as prose prohibitions**
  - Opinion: A job is kept off the board, off filing and away from injected instructions by telling it so in its preamble and its turn cue.
  - Where: `templates/worker.md:21`, `hook/communication.ts:238-240`, `templates/keeper.md:14`, `templates/scout.md:6`, `templates/agents.md:40`, `templates/group-member.md:5`
  - Gives: short, readable rules; no permission machinery; roles can be bent by one sentence (the keeper's "this line is your exception").
  - Costs: every boundary is probabilistic; a job can write the canonical checkout and the prompt files (A-011); untrusted GitHub text arrives as a user prompt (A-007); read-only roles still hold write tools (A-081).
  - Fit: conflicts z. 14 and z. 15 (tool result = data; boundary must be structural); related findings A-007, A-011, A-028, A-081.
  - Gate 2: settled by §2 owner files, A-011, A-007, A-081, A-028: change (land refuses branches touching owner files or `spec/build.md`; effect check for read-only roles; untrusted text only as tool results).
- **AU-105 Prompts grow one sentence per incident, and the wording is owner-approved**
  - Opinion: When a run goes wrong, the fix is a new or sharper sentence in the role prompt, and important prompt text is approved word for word by the owner.
  - Where: `templates/.history/agents.md:1`, `templates/.history/agents.md:128`, `src/job/task-note.ts:8`, `templates/agents.md:157`
  - Gives: fast reaction to a real failure; prompts stay close to observed behaviour; the owner controls the voice.
  - Costs: 128 versions of the manual between 2026-08-13 and 2026-10-24; it grew from 462 to 7,597 words (16×); shrinks were incidental. Each sentence is paid on every request. No before/after measurement reached the repo (the task-note experiment, A-044, was never closed).
  - Fit: conflicts z. 38 (a permanent rule only after a second occurrence), z. 31 and z. 40 (change the harness only with a fixed before/after task); related findings A-040, A-044, A-051, A-085.
  - Gate 2: open (§5 #4 agrees on a per-role budget, and A-051 adds golden tests of the assembled message, but how a sentence earns its place is not decided).

#### 2. Roles and division of labour

- **AU-106 The coordinator is the single owner and single point of conversation, with full hands**
  - Opinion: One coordinator per project owns tickets, the board, spawn and merge, talks to the owner alone, and may edit, merge, revert and clean up without asking.
  - Where: `templates/agents.md:7`, `templates/agents.md:193`, `templates/agents.md:191`
  - Gives: one writer for the board and `main` (the retro's fix for board collisions); the owner talks to one session; small fixes need no job (`templates/agents.md:191`).
  - Costs: the coordinator's context is ≈15.9k tokens fixed per request and carries every wake; inline edits skip review and isolation; one session can change its own rules (z. 16).
  - Fit: z. 7 compliant (jobs return only results to the main thread); partial with z. 16; related findings A-006, A-012, A-033, A-070.
  - Gate 2: settled by §2 registered coordinator (single owner: keep) and G3, A-006, A-070 (full hands: change; land by code; uncovered commits are not published; every code change needs a ticket).
- **AU-107 Many narrow roles, each a short preamble with its mode, limits and report shape**
  - Opinion: Work is split into named shapes (slice, repair, survey, finish, review, scout) and roles (worker, reviewer, scout, keeper, judge, researcher, quality, picture, group team), each with a short preamble that says how it runs, what it must not do and how its last message looks.
  - Where: `templates/agents.md:166-173`, `templates/keeper.md:5`, `templates/picture.md:3`, `templates/quality.md:3`, `templates/judge.md:3`
  - Gives: fresh context per task; preambles of 312–1,977 tokens; a role can get its own route (z. 20).
  - Costs: nine role preambles and a group contract, plus a 131-line picture contract; each job still carries ≈3.8k tokens of shared block; spec hygiene (keeper) and the architecture map (picture) each cost a model session.
  - Fit: z. 20 compliant (different configuration → separate agent); related findings A-045, A-048, A-081.
  - Gate 2: settled by G1 (groups, research, quality as modules), G1.4 and §6 (picture model jobs cut), A-045 (keeper becomes `limen spec fix`): change.
- **AU-108 Read-only roles report; the coordinator files their output**
  - Opinion: Reviewer, scout, researcher and judge never write their own record; their final message is filed verbatim by the coordinator.
  - Where: `templates/judge.md:3`, `templates/researcher.md:3`, `templates/reviewer.md:7`, `templates/agents.md:157`, `templates/agents.md:208`, `templates/agents.md:214`
  - Gives: read-only roles stay read-only; one writer for feature folders.
  - Costs: filing is a prose step, so it is skipped (ledger has no review files, A-035); every report is re-emitted by the coordinator, so its tokens are paid twice; read-only holds only in prose (A-081).
  - Fit: conflicts z. 14; z. 6 compliant in spirit (results go to files); related findings A-035, A-046, A-081.
  - Gate 2: settled by A-035, A-046 (Limen files `review-<n>.md`, `report-<n>.md`, `judgment.md`) and A-081 (effect check): change.
- **AU-109 The owner's attention is the scarcest resource**
  - Opinion: Agents should decide engineering questions themselves, choose the proper design over the patch, prove it, and ask the owner only for product ambiguity, a real trade-off, credentials or an irreversible step, because engineering time is abundant.
  - Where: `templates/capability.md:3`, `templates/capability.md:7`, `templates/agents.md:193`
  - Gives: fewer interruptions; agents own their decisions; a one-line anchor in every turn cue.
  - Costs: "time is abundant" is false on one shared Max subscription (12 of 18 failed jobs hit the 5-hour limit, gate 2 §1); it invites redoing work and broad exploration.
  - Fit: partial; z. 37 values fewer human decisions, but the cost frame contradicts the seat; related finding A-043.
  - Gate 2: settled by A-043: change (keep the attention rule; replace the abundant-time sentence with the real token constraint).
- **AU-110 The coordinator stays free and runs disjoint work in parallel**
  - Opinion: The coordinator never blocks the conversation (no waiting, no polling, a long dig becomes a job) and proposes parallel workers for tickets on disjoint seams without being asked.
  - Where: `templates/agents.md:153`, `templates/agents.md:154`, `templates/agents.md:191`, `templates/communication.md:97`, `templates/agents.md:152`, `templates/agents.md:67`
  - Gives: the owner can always talk to the coordinator; throughput across tickets.
  - Costs: it depends on wakes arriving (A-033 lost wakes); each delegation costs a cold context, a worktree and a wake turn; parallel work contradicts one job at a time on the seat.
  - Fit: z. 7 and z. 19 compliant (delegate, hand over through files); the parallel part conflicts with the seat (A-014); related findings A-014, A-033, A-036.
  - Gate 2: open (the parallel part is settled by A-014: change, `maxJobs` default 1, lines `:67` and `:152` removed; the "stay free" rules are not decided).
- **AU-111 Scout use is limited to what a pilot proved**
  - Opinion: A cheap read-only scout may map a seam before a worker spawn, but it must not pre-digest a review of record (a pilot showed a packet hiding a blocking defect), and failure triage is "not yet" its job.
  - Where: `templates/agents.md:173-183`, `templates/scout.md:3`, `templates/scout.md:10`
  - Gives: a role whose scope comes from measured use, not from hope; a cheaper model for orientation.
  - Costs: one more session and one more wake per use; under `maxJobs` 1 a scout blocks the slot; the table must be maintained by hand.
  - Fit: z. 37 compliant in method (decided by observed outcome); z. 20 compliant; related finding A-081.
  - Gate 2: open (A-081 keeps scout as a read-only role; its use rules are not decided).
- **AU-112 A worker with a product question writes a plain file and finishes**
  - Opinion: A worker that hits a real product decision commits what is useful, writes the precise question to a plain file in its worktree, reports the path and ends; it never waits for an answer.
  - Where: `templates/worker.md:27-28`, `templates/agents.md:223`, `templates/worker.md:32`
  - Gives: no idle jobs; the question survives the session; the bias is toward editing, not asking.
  - Costs: the question is only as visible as the final message; with header-only wakes (A-008) a question file is easy to miss; an uncommitted question file is lost at prune (A-001).
  - Fit: z. 1 partial (escalation to a human exists, but not as a typed exit); z. 10 compliant (a legal way to say "not known"); related findings A-001, A-008, A-015.
  - Gate 2: open (A-008 changes the wake, but not where a job's question goes).

#### 3. Ceremony

- **AU-113 Review is a purchase: bought by blast radius, and at most one repair and one re-review**
  - Opinion: An independent review is bought only when a mistake would be expensive or hard to see, and each round is a fresh spend, so one repair and one re-review settle an ordinary ticket.
  - Where: `templates/agents.md:156`, `templates/agents.md:157`, `templates/agents.md:193`, `spec/vision.md:8`, `templates/agents.md:195`
  - Gives: no review on typo-sized work; a bounded loop after the F368 day of wasted compute; independence by fresh session, not identity ("A reviewer is independent because it is a fresh session", `templates/agents.md:195`).
  - Costs: the coordinator judges its own candidate; Adrian's analysis (via `adrian-rebuild/evidence/audit-pass2/history.md`) counts a reviewer-planted bug that passed in at least 6 tickets, and a clean first review in only 3–4 of 19 synchronizer tickets. History: the first manual said the opposite ("substantive work normally earns fresh eyes", commit `6743d9e`); commit `dabc571` (2026-08-14) made review opt-in.
  - Fit: z. 1 partial; z. 34 partial (a model judge needs written criteria); related findings A-013, A-015, A-046.
  - Gate 2: settled by A-013 V2 (review required for every diff outside `spec/`), A-046 (opt-in by ticket class rejected), A-015 (round limit in `limits.json`, default 3, then escalation): change.
- **AU-114 Blocking is narrow; unverified never blocks; a FAIL with only notes is a merge**
  - Opinion: Only a proven break of an acceptance bullet blocks; plausible and unverified findings are notes, and the coordinator merges when every finding is non-blocking.
  - Where: `templates/reviewer.md:11`, `templates/reviewer.md:13-14`, `templates/agents.md:157`
  - Gives: the loop cannot be driven by lint reach or hardening ideas; a broken environment never fails a candidate.
  - Costs: an unchecked risk passes by default; a FAIL can be overruled (F953 landed despite a FAIL after four rounds, by the author's decision).
  - Fit: z. 10 compliant (a legal "unverified" path); conflicts z. 1 when an unknown passes as success; related findings A-013, A-031.
  - Gate 2: settled by A-031 (4) (`unknown` blocks like `not met`) and A-013 ("The coordinator cannot override a FAIL"): change.
- **AU-115 A re-review is bounded by the prior findings file**
  - Opinion: A re-review reads the earlier findings, checks each blocking one against the new commit, inspects the delta and does not re-prosecute what was settled; the re-review task names the findings file and the commit and nothing else.
  - Where: `templates/reviewer.md:18`, `templates/agents.md:157`
  - Gives: cheap follow-up rounds; no drift into a new review of the whole design; no coordinator bias in the brief.
  - Costs: a regression outside the delta can pass; with A-031 the reviewer must answer every acceptance ID anyway, which a bounded review may answer from stale evidence.
  - Fit: z. 34 partial; related findings A-015, A-031, A-013.
  - Gate 2: open (A-013 V3 requires a new review after a new commit; its scope is not decided).
- **AU-116 The verdict is the first line: `PASS <sha>` or `FAIL <sha>`**
  - Opinion: A review's first line is one word and the reviewed commit, with nothing before it, and the rest of the message stands alone with blocking findings first.
  - Where: `templates/reviewer.md:20`
  - Gives: a verdict a script can read; the reviewed commit is explicit.
  - Costs: almost none; at `rebuild-base` nothing parses it (A-013).
  - Fit: z. 21 compliant once code parses it; related finding A-013.
  - Gate 2: settled by G4 V1: keep (code parses the first line; unreadable = no verdict).
- **AU-117 Every job writes a task note and answers a note check before it finishes**
  - Opinion: A job first writes a six-line plan (done-means checks, the one easy-to-miss rule, what is not proven yet) and is held at the end to mark each item proven, not proven, changed or dropped with evidence.
  - Where: `src/job/task-note.ts:8`, `src/job/task-note.ts:18-32`, `src/job/task-note.ts:35-52`, `src/job/task-note.ts:70-105`, `hook/finish.ts:85-92`
  - Gives: the author's hypothesis of less forgetting (relayed in Adrian's analysis); open items surface as "done with open checks".
  - Costs: ≈397 tokens per session, ≈405 tokens and one extra turn at the end; read-only roles must write a note; the before/after result never reached the repo; a proven line can be closed by naming any file (A-031).
  - Fit: conflicts z. 37 and z. 40 (an experiment without its measurement); related findings A-031, A-044.
  - Gate 2: settled by A-044: cut (criteria from the record go into the task; Limen runs the checks).
- **AU-118 Quality and research are report-only phases**
  - Opinion: A quality pass judges landed work for subtraction and unification and writes one findings file; research asks two models from named sources and a judge names where they diverge; neither merges, opens tickets or edits the board.
  - Where: `templates/quality.md:9`, `templates/quality.md:11-12`, `templates/researcher.md:7-9`, `templates/judge.md:8-9`, `spec/vision.md:29`, `templates/agents.md:201`
  - Gives: improvement proposals without risky rewrites; answers that cite fetched sources.
  - Costs: research is three sessions per question; the quality trigger (ten landings) was prose; neither research nor the quality pass was ever used on the seat (gate 2 §1); the coordinator re-files every report.
  - Fit: z. 33 compliant (domain knowledge before a design decision); z. 29 compliant (simple maintenance with a bar); the prose trigger conflicted with z. 14; related findings A-046, A-071.
  - Gate 2: settled by G1.11, G1.13 and §6 (modules, off by default; the quality trigger and the judge spawn move to code; research starts without Adrian's approval): keep (content of the role prompts).
- **AU-119 Two synthesis styles: the group's final team decides; the judge keeps disagreement visible**
  - Opinion: In a group the final round's team checks the code, decides each disagreement and merges the best parts into one answer; in research the judge must not blend or pick a winner and keeps the divergence as the body.
  - Where: `templates/group-member.md:21`, `templates/judge.md:8-9`, `templates/coordinator.md:7`, `templates/group-member.md:5`
  - Gives: groups end with one usable result; research keeps real trade-offs in view for the spec; peers must answer "with a check, not agreement by default" (`templates/coordinator.md:7`).
  - Costs: two rules for the same act; the final team grades its own and its peers' work (z. 34); a visible disagreement goes back to the coordinator or the owner.
  - Fit: z. 34 partial (a model evaluator without written criteria); related findings A-075, A-080.
  - Gate 2: open (G1.2 and G1.11 keep both as modules; the consolidation style is not decided).

#### 4. Register and tone of communication

- **AU-120 Two audiences in one register; a cue names the audience each turn**
  - Opinion: One register file holds both a Human (owner) register and an Agent register, and a hidden per-turn cue tells the model which one this reply uses, switching only for the part another agent will execute.
  - Where: `templates/communication.md:5`, `templates/communication.md:134-142`, `hook/communication.ts:219`
  - Gives: one style for every reader; the audience is explicit on every turn.
  - Costs: every job carries the whole register, including the Human section (≈1,739 tokens) and Specs (≈855 tokens) it never uses; a hosted job always gets the Agent cue even when the owner types into it.
  - Fit: z. 3 partial (stable text first, but the cue repeats fixed text); related findings A-038, A-039, A-077.
  - Gate 2: settled by A-038 (three registers by audience: owner, agent, specs; package only), A-039 (project override cut), A-077 (one audience line): change.
- **AU-121 Every reply is read cold: an identifier is an address, and the reader's clock stopped**
  - Opinion: The owner did not see the tool calls or the wake, so every feature number, hash, path or coined word must travel with a plain meaning, and a reply opens with what changed since their last message.
  - Where: `templates/communication.md:7`, `templates/communication.md:48-58`, `templates/communication.md:60-70`, `spec/vision.md:15`
  - Gives: replies an owner can act on after a break; no "Already handled" or "as discussed" (`templates/communication.md:66`); failures said out loud.
  - Costs: longer replies (a clause per identifier); the Not/Say examples name Limen's own features (F048, `hook/wake.ts`), not Adrian's projects.
  - Fit: no z. rule applies; consistent with the author's vision (`spec/vision.md:15`); related finding A-038.
  - Gate 2: settled by A-038: keep (the Human section becomes the owner register, coordinator only).
- **AU-122 The reply is as big as the question, in a form that survives a terminal**
  - Opinion: The size and form of a reply come from the question (answer, update, report, explanation, where-we-are), one form per reply, with the answer on the first line and terminal-safe formatting.
  - Where: `templates/communication.md:72-82`, `templates/communication.md:13`, `templates/communication.md:130`
  - Gives: short answers to short questions; readable output in a terminal pane.
  - Costs: ≈1.7k tokens of rules in the owner register; very specific rules (table of two to four narrow columns, bold only on the first words) may not fit Adrian's client.
  - Fit: no z. rule applies; related finding A-038.
  - Gate 2: open (A-038 places this text in the owner register; its content is not decided).
- **AU-123 Reporting to the owner: four parts in order, a closing overview, one question with a pick**
  - Opinion: A report on finished work says what it does now, what was run (apart from what was not), what it touches or costs, and what happens next; a turn that leaves work in flight ends with a short overview; a decision is one question with the option the coordinator would pick.
  - Where: `templates/communication.md:84-95`, `templates/communication.md:82`, `templates/communication.md:138`
  - Gives: a stable report the owner can scan; run vs not-run is never mixed; decisions are cheap to answer.
  - Costs: the closing overview repeats on every wake turn while jobs run; the overview is written by the model, not taken from records.
  - Fit: z. 39 compliant ("done" is not evidence; name what ran); related findings A-008, A-015.
  - Gate 2: open (A-015 fixes the four parts of an escalation; ordinary reports are not decided).
- **AU-124 Plain technical English, about 80% ASD-STE100, for every role on every turn**
  - Opinion: All agents write short sentences, one idea each, active voice, one word for one thing, no idioms, close to Simplified Technical English.
  - Where: `templates/communication.md:132`, `templates/communication.md:11`
  - Gives: text that non-native readers and other models parse well; consistent terms.
  - Costs: the rule rides every turn cue; Adrian talks to the coordinator in Polish (gate 2 §8), and the cue says "English" on every one of those turns.
  - Fit: no z. rule applies; related findings A-038, A-039, A-077.
  - Gate 2: open (A-039 cuts the Polish override; the language of owner-facing replies is not decided).
- **AU-125 The prompts are written in aphorisms and metaphors, against their own rule**
  - Opinion: Role prompts teach by memorable slogans and images ("one mortal turn", "a museum to tour", "repository archaeology", "money burned twice").
  - Where: `templates/worker.md:3`, `templates/worker.md:5`, `templates/worker.md:29`, `templates/worker.md:31-32`, `templates/communication.md:132`
  - Gives: named anti-patterns the model can recognise; short memorable rules.
  - Costs: the same prompt forbids "slang, idioms, or filler" (`templates/communication.md:132`); models tend to copy the style they are given; images can be read in more than one way.
  - Fit: no z. rule applies; internal inconsistency with AU-124; related finding A-085.
  - Gate 2: open.
- **AU-126 Honesty conventions: gaps first, and every claim labelled with its certainty**
  - Opinion: A final message starts with what is not done, not proven or blocked; a cause is named only when verified and says how; each finding carries a certainty label.
  - Where: `templates/worker.md:40`, `templates/scout.md:8-9`, `templates/scout.md:12`, `templates/reviewer.md:13`, `templates/agents.md:187`, `templates/communication.md:15`, `src/job/task-note.ts:16`
  - Gives: bad news cannot hide at the end; the coordinator can weigh each claim.
  - Costs: four label sets for one idea: reviewer proven/plausible/unverified, scout observed/guessed, note proven/not proven/changed/dropped/followed/broken, and A-031's met/not met/unknown; only some are parsed.
  - Fit: z. 10 compliant (a legal way to say "not known"); z. 39 compliant; related findings A-031, A-008.
  - Gate 2: open (A-031 fixes the reviewer's per-ID vocabulary; the others are not decided).
- **AU-127 A handoff is a short pointer: outcome, `Ticket:` path, a seam as a lead, one constraint per line**
  - Opinion: The coordinator starts a job with a short instruction and a pointer to the ticket, never the ticket itself, under about two hundred words, with the shape named and the boundary left on the board line.
  - Where: `templates/agents.md:153`, `templates/agents.md:185`, `templates/agents.md:187`, `templates/agents.md:166-173`
  - Gives: small first messages; one copy of the ticket; the worker keeps its judgment ("Direction belongs to the handoff; depth of investigation belongs to the worker").
  - Costs: the worker must read the ticket in a tool call; a wrong pointer sends it hunting; the handoff is written by the model each time, so its quality varies.
  - Fit: z. 19 compliant (short thread plus files); z. 6 compliant; related findings A-044, A-085, A-073.
  - Gate 2: open (A-044 puts the record's criteria into the task verbatim; the rest of the handoff is not decided).
- **AU-128 Labels and tab titles in plain words: the work first, the feature number last**
  - Opinion: A job label says what a person will see change when it lands, in about forty characters with the feature number last; the coordinator's own tab has a one-to-three-word stem it sets once, and Limen owns the count tail.
  - Where: `templates/agents.md:90`, `templates/agents.md:117-127`
  - Gives: readable tab rows and job IDs; the same rule as the register: the meaning before the identifier.
  - Costs: the "Jobs and Herdr" section is ≈2.8k tokens per coordinator request; tab stem, tail and agent-rename rules serve Herdr only; hosted jobs are cut (G1.8).
  - Fit: no z. rule applies; related findings A-040, A-061.
  - Gate 2: open (G1.8 cuts hosted jobs; labels and the coordinator tab are not decided).

#### 5. Spec layout and ticket shape

- **AU-129 A ticket is five sections in about three hundred words, written for two strangers**
  - Opinion: A ticket has picture front matter, a `FNNN · what becomes true` title, then Outcome (2–4 sentences), Scope (3–6 bullets), Out of scope (2–4), Acceptance (3–6) and optional Notes, about 300 words and at most 500, for a cold worker and an owner deciding if it is worth doing.
  - Where: `templates/communication.md:21-31`, `templates/spec/features/_template/ticket.md:1-27`, `templates/agents.md:59`
  - Gives: tickets fit one screen; scope is a lead, not an edit list ("a scope that enumerates files and functions is stale before the first commit"); a ticket past 500 words becomes two tickets or a survey job.
  - Costs: budgets are prose-only; the front matter serves the picture module, which is now optional (A-048); one field is named after the author (`needs-adam`, `templates/communication.md:31`), although commit `5915846` set out to name roles, not people.
  - Fit: partial with z. 32 (templates as hints for the shape, not rigid sections); related findings A-031, A-048.
  - Gate 2: open (A-031 changes Acceptance; A-048 makes `touches` optional; the rest of the shape is not decided).
- **AU-130 Acceptance is one observable check per line**
  - Opinion: Each acceptance line is one behaviour or check a reviewer can verify with a command or a look and cite whole; "tests pass" is not acceptance.
  - Where: `templates/communication.md:29`, `templates/spec/features/_template/ticket.md:21-23`
  - Gives: criteria a reviewer can answer one by one; the base for a typed format.
  - Costs: free prose lines cannot be run or parsed; a reviewer can still pass a line it did not check.
  - Fit: z. 1 and z. 34 compliant in direction (criteria written before the work); related finding A-031.
  - Gate 2: settled by A-031: change (each line gets an ID and a type, `Check:` run by Limen or `Judgment:` answered by the reviewer; validated by `limen ticket check`).
- **AU-131 What never goes in a ticket: the body is not a progress log**
  - Opinion: A ticket has no status line, date, author tag, badge, bare feature number, phase or progress marker, no implementation shape and nothing the worker learns faster by editing; its body is never edited to track progress.
  - Where: `templates/communication.md:33-40`, `templates/communication.md:42`
  - Gives: one place for each kind of truth (lane, board, Git, outcome); tickets that do not go stale.
  - Costs: prose-only (≈855 tokens of Specs rules); rationale has no home except Notes or a worker's notes file.
  - Fit: z. 36 compliant (state apart from rationale); z. 22 compliant (one source of truth); related findings A-070, A-085.
  - Gate 2: open.
- **AU-132 Feature folders are a filing cabinet: lanes, numbers for life, an outcome at the end**
  - Opinion: Tickets live in `planned/`, `active/`, `done/YYYY-MM/` and `dropped/YYYY-MM/`; a number is never reused; the folder holds ticket, notes, numbered reviews and a 3–6 sentence outcome; a file that stops being true is deleted; nothing validates the moves.
  - Where: `templates/agents.md:49-56`, `templates/agents.md:158`, `templates/spec/features/_template/outcome.md:3`, `templates/communication.md:42`
  - Gives: a readable history in plain folders; dropped work is archived, not deleted.
  - Costs: moves, the drop mark and `outcome.md` are model steps; a ticket left in `planned/` is silently not closed at land (A-070).
  - Fit: z. 27 compliant (status of work next to the task); z. 29 compliant (archive instead of delete); related findings A-055, A-070.
  - Gate 2: settled by A-070 (`limen ticket start`/`drop`, spawn moves `planned/` to `active/`, Limen writes `outcome.md` from the record) and A-055: change (layout kept).
- **AU-133 The board is narrative prose with generated sections and emoji marks**
  - Opinion: `spec/build.md` mixes coordinator prose (TRACK at most three bullets, NEXT one clause per ticket, PARKED, DROPPED) with sections Limen generates (NOW, PROVEN with the last ten), and its status marks (🟠 🔴 🟢 ⚪) are prose only.
  - Where: `templates/spec/build.md:3-7`, `templates/agents.md:48`, `hook/communication.ts:329-339`
  - Gives: one page that says where the project stands; generated parts cannot drift; the coordinator holds NOW and NEXT in its prompt.
  - Costs: the hand-kept sections drift; a size advisory fires past 120 lines; the emoji are the only emoji the register allows.
  - Fit: z. 22 compliant for generated views; z. 27 compliant; related findings A-037, A-070, A-072.
  - Gate 2: open (A-037 changes how the digest is delivered; A-070 and A-045 write board lines by script; `limen highlight` is cut; the layout itself is not decided).
- **AU-134 Durable intent: a human-owned vision and a project styleguide, both apart from speech**
  - Opinion: `spec/vision.md` holds compact product principles that only the human rewrites; `.agents/limen/styleguide.md` holds coding practice and never product scope or speech; the coordinator holds the vision whole, jobs get a pointer.
  - Where: `templates/spec/vision.md:3`, `templates/styleguide.md:3`, `templates/agents.md:45-46`, `hook/communication.ts:177-186`, `hook/communication.ts:232-237`
  - Gives: intent outside any one conversation; style rules scoped by section headings that name a path or a language (`hook/communication.ts:568-588`).
  - Costs: vision and styleguide ride every coordinator request; the author's retro found vision bodies in at least 166 of 192 job transcripts of one project; "human-owned" was prose while jobs could write the file (A-011).
  - Fit: z. 16 compliant once enforced; z. 24 compliant (routes to the note); related findings A-011, A-041.
  - Gate 2: settled by §2 owner files, A-011, A-039 (styleguide stays), A-086 and H-12 (vision reminder at ticket editing): keep.

#### 6. What is default vs optional

- **AU-135 Everything rides along by default**
  - Opinion: Every role gets the capability frame, the whole register and the styleguide; the coordinator also gets the whole manual, including text for groups, the GitHub doorbell, Linear, research, private planning and finish pings, whether or not the project uses them.
  - Where: `hook/communication.ts:155-194`, `templates/agents.md:21-40`, `templates/agents.md:57`, `templates/agents.md:150`, `templates/agents.md:199-214`, `templates/agents.md:228`, `templates/worker.md:38`
  - Gives: no load-on-demand mechanism; every agent knows every feature.
  - Costs: ≈15.9k tokens fixed per coordinator request and ≈3.8k per job request at `rebuild-base`; on the seat research and the quality pass were never used.
  - Fit: partial with z. 8 (all up front vs on demand, by count and frequency of use); related findings A-038, A-040, A-085.
  - Gate 2: settled by G1.10 (a disabled module contributes no prompt text), A-040 and A-038 (registers by audience): change.
- **AU-136 A project file at the same path replaces the package default**
  - Opinion: The package ships defaults for the manual, each role and the register, and a project overrides any of them by putting a file at the same path (`AGENTS.md`, `.agents/limen/<role>.md`, `.agents/limen/communication.md`).
  - Where: `templates/agents.md:3`, `templates/communication.md:3`, `templates/agents.md:47`, `templates/agents.md:92`, `hook/communication.ts:303-309`
  - Gives: a project can tune Limen with no code change.
  - Costs: a root `AGENTS.md` silently drops the whole manual; overrides drift from the package (a drift advisory repeated in every coordinator prompt while an override existed); the files sit where jobs can write them.
  - Fit: conflicts z. 16 (agents can rewrite their own instructions); related findings A-039, A-042, A-011.
  - Gate 2: settled by A-039 and A-042: cut (instructions always come from the package; `CLAUDE.md` and `AGENTS.md` reach roles only as project context).
- **AU-137 Guidance is re-sent with every prompt, plus a fixed per-turn cue**
  - Opinion: Stable guidance is rebuilt from files and re-sent before every prompt so it survives long runs and compaction, and a short hidden cue on every turn restates the audience, the frame anchor and the next obligations.
  - Where: `hook/communication.ts:70-73`, `hook/communication.ts:99-105`, `hook/communication.ts:209-265`, `templates/capability.md:5-7`, `templates/communication.md:3`
  - Gives: rules that do not fade after compaction (z. 4); a cue that keeps work on the board.
  - Costs: any change to vision, styleguide or the board rewrites text in front of the whole history, so every land invalidates the cache; the cue adds ≈221–237 tokens per prompt and stays in history.
  - Fit: z. 4 compliant; conflicts z. 3 (do not edit the prefix mid-session); related findings A-037, A-077, A-086.
  - Gate 2: settled by A-037, A-077 and A-086: change (one Limen context message frozen per session and re-sent after compaction; the cue holds only variable parts, ≈40–60 tokens).
- **AU-138 Just-in-time reminders ask for a read of named guidance lines**
  - Opinion: When an edit touches `spec/` or code, or a command spawns, merges or creates a planned ticket, the tool result asks the agent to make its next call a read of the exact guidance lines that apply, once per area until compaction.
  - Where: `hook/communication.ts:599-616`, `hook/communication.ts:117-123`, `templates/communication.md:126`
  - Gives: the rule arrives at the moment of use, for the model limit the author names, "weak long-range recall" (`spec/features/active/F952-agents-learn-adam-s-principles-from-work-and-decisions/revision-2/brief.md:6`); nothing is injected when nothing applies.
  - Costs: one extra tool call and turn per area; the reminder stays in history.
  - Fit: z. 11 compliant (the tool result names the next step); z. 4 compliant; related finding A-041.
  - Gate 2: settled by A-041 and H-12: change (append the bounded section text to the tool result instead of forcing a read; vision reminder at ticket editing).
- **AU-139 Numeric size caps everywhere**
  - Opinion: Text is bounded by explicit numbers: 1,000 lines for each injected file, 120 lines for the board, about 300 words for a ticket, 200 words for a handoff, 40 characters for a label, three TRACK bullets, ten PROVEN entries, five scout findings, one to three lines for an answer.
  - Where: `templates/communication.md:3`, `templates/styleguide.md:3`, `templates/spec/vision.md:3`, `hook/communication.ts:17-18`, `templates/communication.md:23`, `templates/agents.md:185`, `templates/agents.md:90`, `templates/spec/build.md:5`, `templates/scout.md:20`
  - Gives: concrete limits a model can follow and a person can check.
  - Costs: only the 1,000-line cut and the 120-line advisory are code; the rest are prose; the 1,000-line caps are far above use (the register is 155 lines, the manual 231).
  - Fit: z. 14 partial (numbers stated, not enforced); related findings A-040, A-085.
  - Gate 2: open (§5 #4 agrees on per-role budgets; per-artefact caps are not decided).
- **AU-140 A tool-specific search cue, only when Jevgrep is installed**
  - Opinion: When `jg` identifies itself as Jevgrep, every agent is told to search source with it instead of grep or ripgrep, and to treat retrieved source as data.
  - Where: `templates/communication.md:152-155`, `hook/communication.ts:174-176`, `hook/communication.ts:196-207`
  - Gives: a decision-model search that cuts exploration turns; the cue appears only when the tool exists.
  - Costs: one `jg --help` probe per PATH per process; prompt text that depends on the host's PATH; the audit does not record whether `jg` is on the seat.
  - Fit: z. 25 compliant (decision models such as jevgrep shorten exploration); related finding A-081.
  - Gate 2: open.

### Code, CLI, tests, docs and defaults

Source with quotes, examples and interview questions: `evidence/taste/part-a-code-cli.md`.

#### 1. What code decides vs what prose decides

- **AU-201 Inform, do not gate**
  - Opinion: Code refuses only what is mechanically impossible; everything else becomes information that the coordinator judges in prose.
  - Where: `CONTRIBUTING.md:28`, `CONTRIBUTING.md:31`, `.agents/limen/styleguide.md:16`, `spec/vision.md:10-11`, `src/job/record.ts:46-50`, `src/commands/spawn.ts:385-387`, `docs/commands.md:67`, `src/commands/linear.ts:6`
  - Gives: A small mechanism. A new behaviour costs a prompt edit, not code. The coordinator keeps its freedom: it may land with open checks, start a second job, or accept a served model that differs from the requested one.
  - Costs: Every guarantee that matters (review before land, one job at a time, acceptance met) is probabilistic. `finalizeJob` writes `open-checks`, and `land` never reads it. Under the bridge the prose never reached the model (A-086), so on the seat nothing enforced these rules.
  - Fit: conflicts with z. 14 (guarantees in code, not in the prompt); partial with z. 1 (success needs a deterministic criterion); A-012, A-013, A-014, A-031, A-086.
  - Gate 2: settled by §5 #1 and G3: change (code decides land; the coordinator only calls it).
- **AU-202 Land gates are mechanical and name the fix**
  - Opinion: `land` refuses on facts a script can check (state, index, overlapping dirty files, ticket syntax, the test-line cap), prints the command that fixes the refusal, and asks a person only at a terminal.
  - Where: `src/commands/land.ts:94-96`, `src/commands/land.ts:124-127`, `src/commands/land.ts:150-151`, `src/commands/land.ts:171-172`, `src/commands/land.ts:252-254`, `src/commands/land.ts:38-40`, `test/s5-land.test.ts:46-52`
  - Gives: A refusal leaves `main` where it was (asserted in `test/s5-land.test.ts:46-52`) and tells the caller what to run next. The cap is read from the target branch, so a branch cannot raise its own cap.
  - Costs: The gates check form, not outcome: no review verdict, no acceptance check. The TTY-only confirm makes `land` behave one way for a person and another way for an agent.
  - Fit: partial with z. 1 (deterministic but incomplete criterion); compliant with z. 11 and z. 12; A-012, A-013, A-021.
  - Gate 2: settled by G3: keep the mechanical gates and extend them (PASS on the exact tip, checks, judgments, round limit); D2: cut the TTY confirm.
- **AU-203 Role guards read environment variables**
  - Opinion: Whether a caller may run a command is decided by environment variables its process carries (`LIMEN_GROUP_ID`, `LIMEN_COORDINATOR`, `LIMEN_JOB`).
  - Where: `src/commands/land.ts:27-29`, `src/commands/steer.ts:11-13`, `src/commands/keeper.ts:47-51`, `src/commands/wait.ts:14-18`, `src/commands/planning-source.ts:15-17`
  - Gives: Cheap checks with clear messages and no process inspection. The author chose this on purpose: "The switch alone decides who counts as a coordinator" (F958, quoted in `evidence/audit-pass2/history.md`).
  - Costs: A job's own shell can set or unset the variable. `LIMEN_COORDINATOR` is inherited by every job (A-061). The guard stops mistakes, not a job that tries.
  - Fit: conflicts with z. 14 (the guarded process controls the guard); A-029, A-061.
  - Gate 2: settled by §2 "Registered coordinator" and A-029: change (process ancestry and record state decide; env checks stay only as mistake guards).
- **AU-204 Control data travels inside free text**
  - Opinion: What a command does can depend on prose the model writes: a `done:` prefix in a stop reason, a `Ticket:` pointer in the task, an F-number in a label or a commit subject.
  - Where: `src/job/record.ts:34-35`, `src/job/job.ts:204-209`, `src/commands/spawn.ts:365-371`, `src/main.ts:161`
  - Gives: No extra flags or fields. The model writes one natural sentence and Limen reads what it needs.
  - Costs: A second F-number in a label changes which tickets `land` closes. `limen stop <id> "done: …"` turns a stop into a landable `done` with no flag and no help line (A-032). Each free-text parser grows edge cases.
  - Fit: conflicts with z. 2 (state decided by text content, not by a typed element); A-032, A-070, A-073.
  - Gate 2: settled by A-032 (`stop --done "<reason>"`) and A-073, A-070 (exactly one required `Ticket:` pointer): change.
- **AU-205 Maintenance rides on every command**
  - Opinion: No daemon runs Limen; each `limen` call first does seat housekeeping, and read commands may finalize dead jobs.
  - Where: `src/main.ts:185-194`, `src/commands/jobs.ts:36`, `src/runtime/reap.ts:154-166`, `src/runtime/start-queue.ts:15-16`
  - Gives: Nothing to install or keep alive. Recovery happens wherever someone works.
  - Costs: `limen jobs` and `limen status` are not read-only, and they can wait 10 s to confirm a dead job (`src/runtime/reap.ts:160-165`). A dead job stays `running` while nobody runs a command (A-024). Any command can start a detached rule timer.
  - Fit: partial with z. 1 (a hard failure is seen only when someone looks); A-005, A-024.
  - Gate 2: open (A-024 adds a seat timer for the reaper and G1.3 cuts webhook resends; whether read commands stay free of side effects is not decided).

#### 2. Naming and CLI UX

- **AU-206 Flat verbs and a private vocabulary**
  - Opinion: One flat table of 30 commands, named with the author's metaphors: plant (project), seat (machine), land, keeper, pulse, wake, cabinet, doorbell, bell.
  - Where: `src/main.ts:34-64`, `src/main.ts:128`, `src/main.ts:138-139`, `src/commands/close.ts:7`, `spec/vision.md:17`, `.agents/limen/styleguide.md:14`
  - Gives: Short names. One word per concept, used the same way in code, docs and prompts.
  - Costs: A newcomer learns the vocabulary first. Some names mislead: `close FNNN` closes Herdr tabs, while `ticket done` closes a ticket; `ticket-author` is a top-level verb beside the `ticket` group; `jobs` and `status` overlap.
  - Fit: partial with z. 13 (names and help are what the model chooses by); A-084.
  - Gate 2: open.
- **AU-207 One help string, written for the agent**
  - Opinion: All usage lives in one string of wide lines with defaults in brackets and a `#` comment; `limen <cmd> --help` is cut from it; it lists internal commands and ends with advice to the coordinator.
  - Where: `src/main.ts:98-161`, `src/main.ts:205-220`, `src/main.ts:134`, `src/main.ts:153`, `src/commands/flags.ts:20-21`
  - Gives: One source for usage, so the two help views cannot disagree. Defaults are visible in place. The model learns the intended use from help.
  - Costs: Lines are too wide for a terminal. Internal commands (`rule timer`, `webhook deliver`, `github deliver`) sit beside user commands. Help and `docs/commands.md` still drift (`ticket done --on` is only in the docs, A-084). One strict parser exists (`flags.ts`), but 21 of the 31 files in `src/commands` read `args` by hand, so rules and wording differ by command.
  - Fit: partial with z. 13 (help is a selection criterion, and some semantics, such as `stop "done: …"`, are missing); A-032, A-084.
  - Gate 2: open (A-084 generates facts into docs; the help format is not decided).
- **AU-208 Messages: cause, then the next step**
  - Opinion: A refusal is one lowercase line: what is wrong, a semicolon, what to do. Diagnostics use a compiler format with `fix:`. Info lines carry a prefix (`land:`, `note:`, `warning:`, `next:`).
  - Where: `src/commands/land.ts:124-127`, `src/commands/land.ts:136-138`, `src/commands/keeper.ts:78`, `src/commands/spawn.ts:257`, `src/commands/init.ts:35`, `src/picture/tickets.ts:126`, `src/commands/wait.ts:16`, `src/commands/spawn.ts:639`
  - Gives: The model acts on a refusal without reading docs. Messages are easy to grep.
  - Costs: Some refusals become paragraphs (`src/commands/spawn.ts:639` is one sentence of about 400 characters). Messages name the author's tools (Herdr) where the cause is generic.
  - Fit: compliant with z. 11 and z. 12; A-021.
  - Gate 2: settled by G3 and A-021 ("refuses with an actionable reason", "a message and the exact next command"): keep.
- **AU-209 Two exit codes**
  - Opinion: A command exits 0 or 1. Every failure, refusal and usage error is 1; a no-op on an ended job is 0.
  - Where: `src/main.ts:196-202`, `src/commands/stop.ts:21-24`, `src/commands/steer.ts:20-23`, `src/commands/ticket.ts:175-176`, `bin/limen:4-6`
  - Gives: Simple scripting. `stop` is idempotent.
  - Costs: A caller cannot tell "refused by a gate" from "crashed" or "bad flag" without parsing text. `steer --running` that reached no job exits 0.
  - Fit: partial with z. 12 (the message is actionable, the code is not) and with z. 2 (the caller must read text to know the outcome); A-021.
  - Gate 2: open.
- **AU-210 Plain text for both readers**
  - Opinion: Output is plain text lines for the model and the person alike; only `jobs` switches to an aligned table on a terminal; spawn prints the job id as soon as the record exists and again as its last line.
  - Where: `src/commands/jobs.ts:31-33`, `src/job/view.ts:50-58`, `src/commands/spawn.ts:350-351`, `src/commands/spawn.ts:522-523`, `src/commands/spawn.ts:385-392`, `src/project/picture-tick.ts:134`, `src/commands/status.ts:110-127`, `docs/commands.md:63`
  - Gives: No second format to maintain. Sections with counts and `none` read well in a wake or a tool result. `NO_COLOR`, `TERM=dumb` and `LIMEN_VIEW` are respected.
  - Costs: Warnings (`note:`, `warning:`) go to stdout too, so a script must know which line holds the id. Only `group status` and `picture build` offer JSON. Internal callers parse prose.
  - Fit: partial with z. 6 (`wait` and wakes print the whole final message); compliant with z. 11 (`status` names the next command); A-008, A-078.
  - Gate 2: open (A-008 moves job text out of wakes into a fetch command; the format of read commands is not decided).
- **AU-211 Jobs by id, suffix or label**
  - Opinion: Every job command takes the full id, a unique id suffix, an exact label, or a unique label prefix of 3 or more characters; an id reads as date, feature, slug and random hex.
  - Where: `src/job/job.ts:99-126`, `src/job/job.ts:127-137`, `docs/commands.md:7`
  - Gives: Little typing for a person; ids that sort by date and name the feature.
  - Costs: A label prefix can match another job once new jobs exist, and it works the same for `land` and `stop` as for `jobs`. The id hoists the first F-number it finds in the label.
  - Fit: none applies directly; an ambiguous match refuses, which fits z. 12.
  - Gate 2: open.
- **AU-212 Refuse before the first write**
  - Opinion: Spawn checks everything before it creates anything; once the record exists it prints the id; a failure after that marks the job `failed` instead of leaving debris.
  - Where: `src/commands/spawn.ts:350-351`, `src/commands/spawn.ts:360-363`, `src/commands/init.ts:39-50`, `test/s1-spawn.test.ts:37-62`
  - Gives: A refused command can be retried as it is. A killed caller still names its job.
  - Costs: The preflight grows with every engine and mode (12 refusal cases in one test). Not every command follows it: land's ticket close renames folders before its commit and keeps them on failure (A-021).
  - Fit: compliant with z. 12, and with z. 29 in spirit (no half-done state); A-021, A-057.
  - Gate 2: open (A-021 applies the idea to `land`; a rule for every command is not decided).
- **AU-213 init is idempotent and asks nothing**
  - Opinion: `limen init` never overwrites a file, prints `created` or `kept` for each, refuses legacy paths, ends with one `next:` line, and asks no questions.
  - Where: `src/commands/init.ts:82-89`, `src/commands/init.ts:39-50`, `src/commands/init.ts:52-57`, `docs/commands.md:175`
  - Gives: Safe to rerun after an upgrade. Project files belong to the project.
  - Costs: The settings that matter (job limit, routes, modules) have no place at init; they come from env vars or from edits after init.
  - Fit: partial with z. 16 (init sets nothing about what agents may change); A-014, A-030.
  - Gate 2: settled by A-014 and A-030: change (init asks for `maxJobs`, module switches, round limit, routes and the gate command; without a terminal it requires flags).

#### 3. Code style

- **AU-214 Zero runtime dependencies, no build step**
  - Opinion: The package has no runtime dependency and no build: Node 24 runs the TypeScript sources by type stripping, as ESM with `.ts` imports, and system tools (git, tar, ps, Ruby on macOS) fill the gaps.
  - Where: `package.json:5`, `package.json:30`, `package.json:51`, `bin/limen:9`, `bin/limen:21`, `tsconfig.json:15-17`, `test/structure.test.ts:28`, `src/commands/land.ts:314`, `src/runtime/contain.ts:223`
  - Gives: Nothing to audit or update from npm. The source is the release. `npm ci` takes seconds.
  - Costs: Hand-written parsers instead of libraries: front matter (`src/picture/frontmatter.ts`, 399 lines), Markdown (`src/picture/markdown.ts`, 316 lines), flag rules. Hidden system needs: git 2.36 or newer for `worktree list -z` (`evidence/baseline.md`), `tar`, `ps`; nothing declares or checks them.
  - Fit: none applies; gate 2 named it the author's taste (H-15).
  - Gate 2: open (gate 2 §4, H-15).
- **AU-215 Lint rules with reasons, debt kept visible**
  - Opinion: Biome's recommended rules plus a few named rules, each with a one-line reason in the config; tabs and 120 columns; any warning fails; functions stay under cognitive complexity 25 and 70 lines; a stricter "target style" binds one sample file; code over a limit carries a `biome-ignore` that says so.
  - Where: `biome.jsonc:10-12`, `biome.jsonc:14-15`, `biome.jsonc:28-30`, `biome.jsonc:34-37`, `biome.jsonc:68-84`, `CONTRIBUTING.md:35`, `src/runtime/wrapper.ts:62-63`, `.agents/limen/styleguide.md:25`
  - Gives: Each rule is argued, so Adrian can keep or drop it one by one. The suppressions form a searchable debt list.
  - Costs: Practice lags the rules. CONTRIBUTING says a suppression marks "a site where the code is right and the rule is wrong" (`CONTRIBUTING.md:35`), yet 40 mark pending splits. The styleguide says "never a cast" (`.agents/limen/styleguide.md:25`), yet about 80 `as` casts remain, 18 of them `JSON.parse(…) as T` with no validation. At least 253 lines in `src` and `hook` are wider than 120 characters, because long strings are never split.
  - Fit: compliant with z. 21 (checkable style lives in a tool); A-047.
  - Gate 2: open.
- **AU-216 Small plain modules, no shared helpers**
  - Opinion: Plain functions, union types, early returns and `readonly`; no classes, enums, barrels, `index.ts`, `types.ts` or `utils.ts`; unique TypeScript basenames across the tree; a short helper is copied, not shared.
  - Where: `CONTRIBUTING.md:15`, `.agents/limen/styleguide.md:8-9`, `.agents/limen/styleguide.md:36`, `test/structure.test.ts:29-30`, `src/commands/land.ts:389-394`, `src/commands/stop.ts:103-108`, `src/job/record.ts:14-27`, `src/project/series.ts:229-236`, `src/project/seat-rules.ts:36-46`, `src/job/group-cabinet.ts:101-105`
  - Gives: Each file reads on its own; no web of imports around a helper module. Strict compiler options (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) and no `any` (0 hits) keep types honest; 0 classes and 0 enums.
  - Costs: Copies drift: `atomicWrite` calls `fsync` (`src/job/record.ts:19`), the copies in `series.ts` and `seat-rules.ts` do not. The two lock implementations differ (AU-222). A fix must be found in every copy.
  - Fit: none applies directly; A-018, A-022, A-085.
  - Gate 2: open (A-018 already requires one lock module and A-022 one `atomicWrite` for every write in `spec/` and job files; the general rule is not decided).
- **AU-217 Layout by concern; commands call commands**
  - Opinion: `src/` splits by concern (commands, job, runtime, project, integrations, picture) with one file per CLI verb; `hook/` stays where engines load it; one command reuses another by passing it an argv array, and the last stdout line is an internal contract.
  - Where: `CONTRIBUTING.md:17-24`, `src/commands/keeper.ts:109-116`, `src/project/picture-tick.ts:122-134`, `hook/finish.ts:3`
  - Gives: Every internal path goes through the same flag checks a person meets. Fewer internal APIs.
  - Costs: Internal calls depend on flag spelling and on text output. Commands import each other (`keeper` imports `land` and `spawn`, `land` imports `prune`, `spawn` imports `diff`), so `src/commands` is also a library. `hook/` imports from `src/`, so each engine session loads part of the CLI. Files are large: `hook/wake.ts` 1 336 lines, `src/commands/spawn.ts` 864.
  - Fit: none applies directly; A-082.
  - Gate 2: open.
- **AU-218 Comments say why, and cite the decision**
  - Opinion: Comments explain why, in full sentences; a one-line JSDoc states a function's contract; config files argue each setting; comments and test names cite the ticket, decision or commit behind them.
  - Where: `src/job/record.ts:12-13`, `src/commands/land.ts:171-172`, `src/main.ts:189`, `src/runtime/start-queue.ts:15-16`, `src/job/task-note.ts:8`, `test/s2-hosted.test.ts:121`, `.agents/limen/styleguide.md:39`
  - Gives: The reason sits at the line that needs it. No `TODO` or `FIXME` in `src` and `hook` (0 hits) and no banners.
  - Costs: Rationale is split between comments and 199 ticket folders; a cited decision ("decision 85", "F950") has no index in the repo. About 1 100 comment lines in about 24 400 lines of `src` and `hook`.
  - Fit: partial with z. 36 (the code links to a decision, but there is no decision index with status); A-085.
  - Gate 2: open.
- **AU-219 One catch at the top; side channels swallow**
  - Opinion: Code throws a plain `Error` with a finished message; `main` prints only the message and exits 1; anything called a side channel (webhooks, rules, wakes, logs) swallows its own errors.
  - Where: `src/main.ts:185-202`, `src/job/record.ts:45`, `src/job/record.ts:57`, `hook/finish.ts:75-77`, `src/commands/land.ts:76-78`
  - Gives: The requested command finishes when an optional part fails. Users see no stack traces.
  - Costs: Failures vanish: when the close commit fails, `land` prints "land: tickets stay active: …" and exits 0 (A-021). There are no error kinds, so a caller cannot react to a class of failure. Debugging needs the job log, and some paths fail to write it too.
  - Fit: partial with z. 12; conflicts with z. 1 where a swallowed error ends in a false success; A-021, A-052.
  - Gate 2: open (S1+ adds a failure kind to the record and A-021 requires exit ≠ 0 for land; the general rule is not decided).
- **AU-220 Engine APIs typed by hand in each hook**
  - Opinion: Each hook declares only the parts of the Pi API it uses as local types; the project stub takes `pi: unknown`; Limen never depends on Pi's packages.
  - Where: `hook/finish.ts:9-25`, `templates/limen-extension.ts:6`, `tsconfig.json:21`, `biome.jsonc:106-115`
  - Gives: Zero dependencies hold; hooks typecheck without Pi; one hook serves Pi and OMP.
  - Costs: The local types can drift from Pi with no failing check; an engine change (Pi 1.2.0 to 1.5.1, the bridge) shows only on the seat. The seat's own Pi extensions are outside every check (`biome.jsonc:106-115`, `tsconfig.json:21`).
  - Fit: partial with z. 18 (an engine change needs the same tests again, and none runs against the real API); A-047, A-086.
  - Gate 2: open.
- **AU-221 A job is a folder of one-value files**
  - Opinion: A job record is a directory of small text files, one fact per file with a trailing newline; `state` is the commit point; the record is built in a hidden folder and published by one rename; a person may repair it by editing a file.
  - Where: `src/job/record.ts:12-13`, `src/job/publication.ts:103-123`, `src/job/publication.ts:170-172`, `src/job/publication.ts:185`, `docs/jobs.md:234`
  - Gives: `cat` and `ls` are the debugger. Each writer touches only its file. Publication is atomic (A-057).
  - Costs: About 60 file names per job (`evidence/map/cli-flow.md` §2a), written by many modules, some atomically and some not (A-022). No schema and no version. JSON parts are read with a cast and no validation (AU-215). State changes race (A-019).
  - Fit: compliant with z. 22 (plain text as the source of truth); A-019, A-022, A-053, A-057.
  - Gate 2: settled by S1+: change (one `record.json` with a schema version, written only by the transition function; content files stay separate; publication by rename stays, A-057).
- **AU-222 The file system is the lock service**
  - Opinion: Locks and claims are file-system primitives: `mkdir` with an owner pid file, exclusive `wx` creates and `rename`; waiting is polling.
  - Where: `src/job/group-cabinet.ts:110-125`, `src/project/seat.ts:58-78`, `src/job/publication.ts:185`
  - Gives: No lock server; it works across processes and accounts that share a disk.
  - Costs: Two implementations with different rules (10 s limit vs no deadline). A reused pid keeps a dead lock alive forever (A-017). A stale `poll.lock` disables the doorbell (A-018).
  - Fit: conflicts with z. 1 (a wait with no limit and no escalation); A-017, A-018, A-036.
  - Gate 2: settled by A-017 and A-018: change (one lock module; owner identity with start time and boot id; waits bounded to 60 s).
- **AU-223 The owner is named in the product**
  - Opinion: Limen is written for one owner, and the code names him: refusals, tests, the board and the viewer say "Adam".
  - Where: `src/commands/land.ts:204`, `test/structure.test.ts:55`, `src/project/lanes.ts:21`, `src/picture/tickets.ts:293`, `picture/viewer/viewer.js:8`, `spec/vision.md:13`, `src/runtime/start-queue.ts:16`
  - Gives: Concrete messages for the one person who runs the seat.
  - Costs: Wrong for any other owner: on Adrian's seat a model that reads "ask Adam" gets a false instruction. The ticket schema carries the name.
  - Fit: none applies; A-084.
  - Gate 2: open.
- **AU-224 Config: env var, then file, then constant**
  - Opinion: A setting comes from an environment variable first, then a tracked JSON file, then a constant; files are read again at each use; a bad entry is ignored and named in the log, not refused.
  - Where: `src/project/limits.ts:5-6`, `src/project/limits.ts:12-19`, `src/project/limits.ts:38-48`, `src/runtime/start-queue.ts:46-49`, `src/runtime/engine.ts:87-90`, `docs/jobs.md:161`
  - Gives: Tests and one-off runs override anything without editing files. An edit reaches running jobs.
  - Costs: The 84 names mix three kinds with one prefix: transport between Limen's own processes (`LIMEN_JOB_DIR`, `LIMEN_INTERNAL_RUN`), test knobs (`LIMEN_REAP_CONFIRM_MS`, `LIMEN_START_POLL_MS`) and user settings (`LIMEN_ENGINE`, `LIMEN_WORKER_MODEL`); no list exists. An env var in a job's environment beats the owner's file. A typo in a file stays silent until someone reads the log.
  - Fit: conflicts with z. 16 (an env var bypasses the file that bounds what agents may change); A-011, A-030.
  - Gate 2: open (A-030 cuts the model env vars and refuses missing route fields; G1.10 puts module switches in `limits.json`; the env-over-file order is not decided).

#### 4. Tests

- **AU-225 Scenarios through the real binary, with a scripted fake engine**
  - Opinion: Tests run the real `bin/limen` on a throwaway "plant" repo with real Git and real processes; one fake engine plays `pi` and `omp` from a script in the task text and loads the real hooks; a fetch sink records every request; tests wait on files and FIFOs, not on sleeps.
  - Where: `test/plant.ts:1-3`, `test/plant.ts:53-76`, `test/fake-engine.mjs:2-8`, `test/s8-groups.test.ts:129-130`
  - Gives: Tests prove what a user sees, across process boundaries, with no model and no network. The full gate runs in about 80 s on Adrian's laptop (`evidence/baseline.md`).
  - Costs: A fake engine cannot show what a real engine or the bridge does with Limen's text (A-086 went unseen). Tests depend on the platform (git 2.36 or newer, a private `TMPDIR`; `evidence/baseline.md`). One real 12 s hold remains (`test/s8-groups.test.ts:130`).
  - Fit: compliant with z. 40 (mechanism tests); partial with z. 41 (no end-to-end task with a model and a grader); A-051, A-086.
  - Gate 2: open (A-051 adds golden prompt tests and a seat check, §2 Measurement adds same-task runs; the fake-engine suite itself is not decided).
- **AU-226 Numbered files, sentence names**
  - Opinion: Test files are numbered `sN-` (scenario through the CLI) or `uN-` (unit) and open with a one-paragraph claim; each test name is a full behaviour sentence, often with the commit or ticket that broke it; few tests carry many assertions.
  - Where: `test/s5-land.test.ts:1-2`, `test/s2-hosted.test.ts:121`, `test/s3-finish-wake.test.ts:115`, `test/u3-turn-signal.test.ts:40`
  - Gives: A failing test reads as a broken promise. The commit reference leads to the original bug.
  - Costs: The numbers carry no meaning and go stale. A long test fails as one unit; its first failed assertion hides the rest. A name with several clauses tests several mechanisms at once.
  - Fit: none applies.
  - Gate 2: open.
- **AU-227 A hard cap on test lines**
  - Opinion: `test/` may hold at most 3,500 lines; the number is a sentence in `spec/vision.md` that only the owner changes; a test and `land` enforce it; new tests replace old ones.
  - Where: `spec/vision.md:13`, `test/structure.test.ts:48-56`, `src/commands/land.ts:165-169`, `src/commands/land.ts:171-205`
  - Gives: The suite cannot grow without a choice, and tests stay dense. A branch cannot raise its own cap.
  - Costs: The suite is one line under the cap, while gate 2 adds tests (A-005, A-022, A-031, A-048, A-051, D3, §6). The pressure produces long tests with many claims (AU-226). The cap is read from prose by a regex.
  - Fit: compliant with z. 31 (a complexity budget), but in tension with z. 31's fixed regression suite; A-051.
  - Gate 2: open (G3 keeps the test-line cap among the land conditions; the number and its home are not decided).
- **AU-228 One gate command; repo rules are tests**
  - Opinion: `npm run check` is the one gate: typecheck, Biome with warnings as errors, the whole suite; repository rules (no dependencies, unique basenames, template history) are tests, not review items.
  - Where: `package.json:24`, `package.json:27`, `test/structure.test.ts:24-46`, `.github/workflows/check.yml:10-13`, `CONTRIBUTING.md:11`
  - Gives: One command for a person, CI and an agent. A rule a reviewer would forget fails by itself.
  - Costs: Docs drift: "Each test has a 30s timeout" (`CONTRIBUTING.md:11`) against `--test-timeout=180000` (`package.json:24`). The basename scan walks the whole tree, `spec/` included. CI runs on Linux and macOS.
  - Fit: compliant with z. 21 and z. 31; A-084.
  - Gate 2: settled by D-001, A-022, A-048, D3, A-085 and A-047: keep and extend (more structural tests, `shellcheck`, `systemd-analyze`); A-083 drops macOS.
- **AU-229 Tests follow incidents, not the command list**
  - Opinion: A test exists where a mechanism broke; a command without an incident has no test.
  - Where: `src/commands/diff.ts:8`, `src/commands/open.ts:6`, `src/commands/planning-source.ts:7`, `src/commands/linear.ts:7`, `src/commands/board-view.ts:37`, `src/commands/land.ts:61`, `src/commands/prune.ts:22`
  - Gives: Every test pays for itself, and the cap (AU-227) holds.
  - Costs: Untested paths include ones that commit or delete (`ticket done` commits; `prune --retire` deletes, A-002). No test checks the assembled prompt (A-051).
  - Fit: compliant with z. 38 (structure earned by a second occurrence); partial with z. 31; A-002, A-051.
  - Gate 2: open (§6 and A-051 add named tests; there is no coverage rule).

#### 5. Docs

- **AU-230 Plain technical English, by role, mechanism last**
  - Opinion: Docs use short plain sentences in second person, split the reader by role (coordinator, operator), put "How it works" last, and the repo keeps the author's design history next to the product.
  - Where: `docs/setup.md:18`, `docs/commands.md:5`, `docs/jobs.md:11-17`, `docs/jobs.md:237-239`, `spec/features/active/F952-agents-learn-adam-s-principles-from-work-and-decisions/ticket.md:32`
  - Gives: Readable by a non-native reader and by a model. A user meets the steps first.
  - Costs: Short sentences make long documents: `docs/finish-webhooks.md` has 752 lines for a feature gate 2 cuts. The repo also ships the author's working history: 865 files under `spec/` and dated research under `docs/reviews/`.
  - Fit: none applies directly; A-084.
  - Gate 2: open (§6 cuts `docs/reviews/*`, `docs/vps.md` and the diagram; the register and the `spec/` history are not decided).
- **AU-231 Docs restate code facts**
  - Opinion: Docs repeat exact constants and edge cases from the code (limits, byte sizes, tool versions), and the README holds a dated experiment protocol.
  - Where: `docs/jobs.md:33`, `docs/jobs.md:166-173`, `CONTRIBUTING.md:11`, `CONTRIBUTING.md:24`, `SECURITY.md:9`, `docs/commands.md:110`, `src/main.ts:142`, `README.md:84`, `docs/jobs.md:44`
  - Gives: A reader gets exact numbers without reading code.
  - Costs: Each fact has two copies, and they drift: the test timeout (`CONTRIBUTING.md:11`), the hook list (`CONTRIBUTING.md:24`), Linux containment (`SECURITY.md:9`), `ticket done --on` (`docs/commands.md:110` vs `src/main.ts:142`), failed worktrees (`docs/jobs.md:44`).
  - Fit: conflicts with z. 22 (one source of truth, views generated from it); A-001, A-050, A-084.
  - Gate 2: settled by A-084 and A-050: change (docs rewritten from the code; constants generated into marked sections with a staleness test; `SECURITY.md` rewritten).
- **AU-232 Seat operations are a copy-by-hand checklist**
  - Opinion: Seat setup (systemd units, shell scripts, Pi extensions) lives in `docs/seat/` as files an operator copies; Limen neither installs nor runs them; the Pi extensions are kept byte for byte and outside every check.
  - Where: `docs/seat/README.md:3`, `docs/seat/README.md:39`, `docs/seat/bell.sh:2-3`, `biome.jsonc:106-115`
  - Gives: The seat stays the operator's, and the repo records what runs there.
  - Costs: Code that runs in every coordinator has no typecheck, lint or test (A-047). Units cover one project each (A-054). The shell scripts follow their own style (`set -eu`, marker files).
  - Fit: conflicts with z. 21 (repeatable, checkable steps belong in a script); A-024, A-047, A-054.
  - Gate 2: settled by S, A-047 and A-024: change (seat tooling in the repo under the same checks; `limen sweep --install` writes systemd user units).

#### 6. Defaults vs optional

- **AU-233 Several engines and two launch modes**
  - Opinion: Pi is the default engine; OMP and Devin sit behind a table of capability flags; detached runs are the default, `--tab` hosts a job in a Herdr pane, and a group under Herdr defaults to hosted.
  - Where: `src/runtime/engine.ts:32-67`, `src/runtime/engine.ts:74-80`, `src/commands/spawn.ts:247-260`, `README.md:23-25`, `docs/setup.md:125`
  - Gives: An engine choice per job; a person can type into a hosted job.
  - Costs: Each engine and mode adds branches, flags and refusals (12 refusal cases in `s1`). Hosted jobs have no time or tool bound (A-023). Hosted jobs had no seat use (gate 2 §1), and OMP and Devin had none known (A-049).
  - Fit: partial with z. 18 (each engine multiplies the acceptance runs); A-023, A-049.
  - Gate 2: settled by G1.6, G1.7 and G1.8: cut (Devin, OMP and hosted `--tab`; groups run detached only).
- **AU-234 A built-in model when no route is given**
  - Opinion: A spawn without `--model` runs a package default (`openai-codex/gpt-6-astra:high`) or a model from `LIMEN_WORKER_MODEL` or `LIMEN_REVIEWER_MODEL`, although help and docs show the four route flags as required.
  - Where: `src/runtime/engine.ts:87-90`, `src/commands/spawn.ts:179`, `src/main.ts:110`, `docs/setup.md:102`, `src/commands/keeper.ts:139-143`
  - Gives: A spawn always starts.
  - Costs: A silent model swap, against the author's own intent that launch settings are recorded configuration and a model is never swapped (gate 2 §5 #2). Two commands treat the same flags differently.
  - Fit: conflicts with z. 18 (another model runs without the same tests); A-030.
  - Gate 2: settled by A-030: cut (routes from `.agents/limen/routes.json`; the fallback and the env vars go; route flags are refused).
- **AU-235 Optional features switched by files**
  - Opinion: Each optional feature has its own switch, and the switch is a file: `spec/linear.md` vs `.off`, a webhook env file, `github connect`, `picture watch on`, `highlight on`, `planning private`; a toggle command with no argument shows the state.
  - Where: `src/commands/linear.ts:6`, `src/commands/linear.ts:13-14`, `src/main.ts:103`, `src/main.ts:146`, `src/main.ts:160`, `src/commands/highlight.ts:7-13`, `README.md:59`
  - Gives: Most features are off by default, and `ls` shows the state.
  - Costs: Every feature has its own switch and its own place. A switch file in the checkout is writable by any job (A-011). A feature that is off still ships its prompt text and hooks (A-040, A-082).
  - Fit: partial with z. 16 (agents can flip their own switches); A-011, A-040, A-082.
  - Gate 2: settled by G1.10, G1.12 and G1.5: change (one switch file, modules off by default, a disabled module adds no prompt text and no hook; private planning and Linear cut).
- **AU-236 Optional tools are found on PATH**
  - Opinion: Helper tools (Herdr, hunk, Jevgrep `jg`, the engines) are used when found on `PATH`; `LIMEN_X=<path>` names one and `LIMEN_X=0` turns it off; versions are recorded, never required.
  - Where: `src/integrations/herdr.ts:774-787`, `src/integrations/herdr.ts:56-58`, `src/commands/diff.ts:56-57`, `hook/communication.ts:196-205`, `docs/setup.md:12`
  - Gives: No setup; a feature appears when its tool is installed.
  - Costs: Behaviour depends on the caller's `PATH` and environment (`HERDR_ENV=1`): installing `jg` adds a search rule to every prompt (`hook/communication.ts:174`). A tool found in a writable directory runs in every job (A-025). Only the `versions` file records what a run used.
  - Fit: partial with z. 38 (an environment-dependent tool is an adapter, not core) and with z. 14; A-025.
  - Gate 2: open (A-025 requires absolute paths for `limen` and `jg` in hooks; discovery of optional tools is not decided).
- **AU-237 Parallel by default, held back by machine load**
  - Opinion: Any number of jobs may run; spawn only notes how many already run; a seat-wide start queue holds detached jobs while CPU idle is under 25 % or free memory under 20 %.
  - Where: `src/commands/spawn.ts:385-387`, `src/runtime/start-queue.ts:38`, `docs/jobs.md:159`, `docs/jobs.md:164`
  - Gives: Throughput on a big machine; load, not policy, sets the limit.
  - Costs: On one subscription and one seat, parallel jobs compete for quota. Waits have no limit and no escalation (A-036; the longest seat wait was 48 min, gate 2 §1).
  - Fit: none applies directly; A-014, A-036.
  - Gate 2: settled by A-014 and A-036: change (`maxJobs` default 1; a queued job escalates after 30 min and fails after 2 h).
- **AU-238 macOS and Linux as equals**
  - Opinion: Limen supports macOS and Linux: CI on both, `os: darwin, linux`, macOS-only parts (a LaunchAgent sweep, a Ruby process-identity helper) and Linux-only parts (hosted pane binding) side by side in core files.
  - Where: `package.json:32-35`, `.github/workflows/check.yml:13`, `src/project/seat.ts:41`, `src/runtime/contain.ts:190`, `src/runtime/contain.ts:223`, `src/runtime/hosted-binding.ts:26`, `docs/setup.md:9`
  - Gives: The author's laptop and the seat run the same code.
  - Costs: Platform branches inside core files. The seat-level reaper exists only on macOS (A-024).
  - Fit: partial with z. 38 (platform code belongs in an adapter); A-024, A-083.
  - Gate 2: settled by A-083 and A-024: change (one platform interface with a Linux implementation only; future macOS support as a new implementation).
- **AU-239 The release is a live clone**
  - Opinion: Limen installs as a Git clone with `npm link`; projects never copy hooks or templates; hooks find the package through `limen` on `PATH`; an update is `git pull` and `/reload`.
  - Where: `README.md:31-38`, `README.md:61-62`, `docs/setup.md:34`, `templates/limen-extension.ts:7`, `templates/limen-extension.ts:14-25`
  - Gives: One update reaches every project; projects cannot drift apart in version.
  - Costs: A job that can write the clone, or put another `limen` first on `PATH`, changes code that the next sessions load (A-025). No version is pinned per project, and a pull during a job mixes versions (D3).
  - Fit: conflicts with z. 14 (code loaded from a place agents can write); A-025.
  - Gate 2: settled by A-025 and D3: change (root-owned release directories, absolute paths, deployment waits until no job runs).
- **AU-240 Not a sandbox, said plainly**
  - Opinion: A job runs as the caller, with the caller's whole environment and tool approval on; Limen isolates by worktree only and says so in the docs.
  - Where: `src/runtime/engine.ts:232-237`, `src/runtime/wrapper.ts:50`, `SECURITY.md:3`, `SECURITY.md:5`, `README.md:73-74`
  - Gives: No setup; a job can do anything the owner can, including `gh` and pushes.
  - Costs: Every job holds every credential of the account (A-004, A-006); the docs are the only protection.
  - Fit: conflicts with z. 9 (model-written code needs a sandbox) and z. 14; A-004, A-006.
  - Gate 2: settled by A-004 and G2: change (environment allow-list T1; owner channel, egress allow-list and research account on the seat).

## Part B: Adrian's taste

Adrian's rules for the rebuilt Limen, from the stage 3 interview (2026-11-17). Each rule has an ID, the rule, why it
holds, how it is checked (a tool, a test or a script in `npm run check`; otherwise a question for the reviewer, or
`Check: none`), and its source: the interview round, the Part A item it answers, and whether it keeps or departs from
the author's choice. Taste decisions taken after this interview are added here with their date and source.

### T-01 Errors never vanish
- Rule: An error on the main path always propagates and ends the command with a non-zero exit code (T-02), a message
  and the next command. A side channel may keep the work going only through one best-effort function, which records
  the failure in the job record or log and makes it visible in `limen status`. An expected absence (`ENOENT`, a dead
  process) is an explicit condition, never a catch-all. Limen has one error type: class, code, message, next command.
- Shape of the best-effort function: `bestEffort(sink, channel, work): Promise<T | undefined>`, where `sink` is a
  required `SideFailureSink` interface (`add`); the helper itself writes nothing. In `finalizeJob` the sink collects
  failures in memory, and the transition function writes them atomically together with the terminal state (field
  `sideFailures` of `record.json`, S1+, A-019). Seat channels get a sink that writes to the seat log. A failed write
  of the transition is a main-path failure, exit code 4. Rejected shapes: a helper that writes the record itself
  (bypasses the transition function and ties the helper to the record) and a returned `{ ok }` result (the caller can
  ignore `ok: false`).
- Why: the author's side channels swallow their errors (40 `.catch(() => {})`, 108 `catch {` in `src/` and `hook/`),
  and `limen land` reports success while the ticket close failed (A-021); z. 1, z. 12.
- Check: a script in `npm run check` allows `catch` only in `src/side.ts` and in the transition function; every command
  has an error-path test that asserts its exit code; a test makes `recordCommits` fail and asserts `done`, an entry in
  `sideFailures` and its line in `limen status`; a test makes the transition write fail and asserts exit code 4.
- Source: interview round 1, AU-219 and the follow-up on the best-effort shape (two variants at
  `src/job/record.ts:45`); departs from the author.

### T-02 Exit codes are failure classes
- Rule: 0 success, also "nothing to do"; 1 refusal: a code-checked condition is not met, with the reason and the next
  command; 2 usage error: flags, arguments, unknown command; 3 transient failure: a lock after its wait limit, the
  network, a rate limit; safe to retry; 4 environment failure: git, the file system, permissions, a missing tool;
  5 internal error: an unexpected exception, with the stack in the log. The exit code is the class; the detail is the
  last stderr line, a JSON object with `class`, `code` and `next`, which timers and tests read; on success the same
  line, with `next`, ends stdout. Timers retry 3 at their
  next run and ring only after several in a row; 2, 4 and 5 ring at once; 1 is a normal state.
- Why: under G3 the coordinator, the owner channel's timer and `limen-sweep` must tell a refusal from a failure
  without parsing prose (AU-209: the author has only 0 and 1); z. 2, z. 12.
- Check: a test for every refusal and failure path asserts the exit code and the `code` field; a script forbids exit
  codes 126–255; the code table is generated from the code into the docs (A-084).
- Source: interview round 1, AU-209 (the `next` line on success: round 2); departs from the author; refines the
  classes of T-01.

### T-03 Settings come only from owner files
- Rule: Limen's names fall into three kinds. **Settings** (anything that affects agents or limits) come only from the
  owner files of the published copy (`limits.json`, `routes.json`) and from root-owned seat files; an environment
  variable never overrides them (z. 16). A setting that `limen init` asks for and that has no value makes the command
  refuse, naming the file and the field; there is no silent default. **Transport** between Limen's processes is
  environment set by Limen only, read as a location hint, never as a permission (A-061). **Test knobs** are read only
  in test mode; T1 and the coordinator start script do not pass them. Code constants serve only mechanics that Adrian
  does not configure, and they are generated into the docs (A-084).
- Why: the author reads an environment variable first, then the project file, then a constant, over 84 `LIMEN_*`
  names, so a job's environment beats the owner's file (AU-224); z. 16.
- Check: one configuration module is the only reader of `process.env.LIMEN_*` (a script in `npm run check`); a
  registry lists every name with its kind; a test asserts that no name of the "settings" kind is read from the
  environment, and a test asserts that a variable does not override a file.
- Source: interview round 1, AU-224; departs from the author.

### T-04 Read commands never write and never wait
- Rule: Read commands (`jobs`, `status`, `diff`, `queue`, `stats`, `jobs --result`, `github show`, `handoff show`)
  never write and never wait. They compute a dead job's state and show it without writing it, e.g. "wrapper dead since
  …; limen-sweep will finalize". The housekeeping before every `limen` call goes. Only `limen-sweep` (A-024) and
  explicit state-changing commands, a manual `limen sweep` included, clean up and finalize.
- Why: the author's read commands reap jobs and can wait 10 s (AU-205); the owner channel and the bell read records
  read-only; a read must be predictable.
- Check: a test asserts that every read command leaves `.limen/` byte-identical and returns without waiting; a test
  runs them on a read-only copy of `.limen/`; the command registry marks each command read or change, and read
  commands do not import the state-transition functions.
- Source: interview round 1, AU-205; departs from the author.

### T-05 A product question is a typed exit
- Rule: The author's sense stays: a product decision stops the worker; an engineering decision the worker makes
  itself. The channel and the flow change.
  1. A worker ends with `limen ask`. Code checks four non-empty parts: the question, 2–3 options, a recommendation with
     its reason, and what is done and what blocks. The question lives in `record.json`; the outcome `needs-decision`
     goes through the transition function; no file in the worktree. The wake header names `needs-decision` and the
     question id; the coordinator fetches the content with a command (A-008).
  2. The coordinator may answer from sources only with evidence: `limen answer <qid> --source <path:line> --quote
     "<text>"`. Code checks that the quote stands at that place on `main` (the published copy); otherwise it refuses,
     and the question goes to Adrian (z. 10, z. 14; the pattern of A-034).
  3. An escalation to Adrian is a choice: the bell rings `escalation`, and `limen status` shows the four parts. His
     answer is recorded by `limen decide --answers Q-NNN` (A-034), and the job resumes in the same worktree with the
     decision in its task. `answer` and `decide` stay two commands: `answer` closes a question with a quote checked at
     `path:line` in the published copy; `decide` records the owner's words, checked against an owner message (T-16),
     as an entry with scope and lifetime.
  3a. Escalation after the review rounds are used up (A-015): `limen escalate` creates a question Q-NNN of kind
     `escalation`, and only an action of the owner channel closes it: one more round for FNNN, or `abandon` (A-015,
     z. 16). `decide --answers` on a question of kind `escalation` exits with code 1, with the exact owner-channel
     commands in `next` (z. 12); the footer shows the Q-NNN under "Waiting for you" with that command, and the bell
     sends `escalation` (A-066). After one more round, Limen wakes the coordinator with a computed header, and the
     coordinator continues the job in the same worktree (3) with the reviewer's findings as its brief. Splitting the
     ticket is `abandon` through the owner channel, then new tickets in the normal way; Adrian may record his choice
     "split" with a plain `decide`. Rejected: resuming the job and letting `land` refuse until a round is added
     (against A-015 L3, and it burns tokens on work that may be abandoned); options that `ask` turns into a command
     the owner channel then confirms (variant (a) with a double action and an extra conversion).
  4. After Adrian's answer, Limen itself opens a ticket "record decision Q-NNN in `docs/`" with its criteria written up
     front (`Judgment`: `docs/` describes the decision; `Check`: the decision register contains Q-NNN), through the
     normal review path (z. 34, z. 36).
  5. A question uses no round (A-015). A job in `needs-decision` does not block spawns for other tickets (an exception
     to A-001 (3)), but a project has at most 2 open questions of kind `decision` (`limits.json`); above that a worker
     spawn refuses (exit code 1). Requests (`--kind request`, T-15) do not count toward the limit.
  6. `limen stats` reports questions per ticket, answered from sources vs escalated, and the time to an answer, with
     decisions and requests counted apart (z. 37).
- Why: the author's worker writes the question to a plain file in its worktree and names the path in its final
  message (AU-112), which is easy to miss once wakes carry only a header (A-008).
- Check: tests for an incomplete `ask` (exit code 1), a valid `ask` (record, wake header, bell), an `answer` whose quote
  is not at the given `path:line` in the published copy (refusal), a `decide` whose quote is not in an owner message
  (refusal, T-16), `decide --answers` on an `escalation` question exits with code 1 with the owner-channel commands in
  `next` and leaves the record unchanged, one more round from the owner channel raises the ticket's round limit by 1,
  closes the Q-NNN and wakes the coordinator, the footer with an open `escalation` question, the automatic ticket
  after a decision, the open-question limit, and `stats`.
- Source: interview round 2, AU-112 (the limit by kind: round 4, from a real end-of-milestone message with two
  decisions and one request; `decide --answers` and the escalation flow 3a: round 5 follow-ups, which resolved the
  conflict between (3) and A-015 L3); keeps the author's sense, departs on the channel and the flow; amends A-001 (3).

### T-06 A re-review is bounded for findings and complete for criteria
- Rule: For findings the author's scope stays: a re-review checks the earlier blocking findings at the new tip,
  reports new blocking findings only in the delta, and does not reopen settled matters. For criteria: Limen runs every
  `Check` at every tip (A-031 (7)), and every `Judgment` ID has an answer for the tip being merged. A `Judgment` may
  declare a path scope in the ticket (`Judgment [paths: …]: …`); code carries a `met` over from the previous review
  when the delta touches no path in that scope. A `Judgment` without a scope is judged every time. The fixed
  judgments of A-031 (5) get automatic scopes (tests, `docs/`).
- Why: the author bounds a re-review by the prior findings and the delta (AU-115), which keeps rounds cheap (author's
  intent, gate 2 §5 #3) but leaves criteria outside the delta answered from stale evidence (A-031).
- Check: `limen ticket check` validates the scopes; tests for a carry-over outside the scope, a required answer inside
  it, a judgment with no scope, and a missing answer counted as `not met`.
- Source: interview round 2, AU-115; keeps the author's scope for findings, departs for criteria.

### T-07 Code builds a job's task
- Rule: Code builds a job's task from a fixed template: the ticket's Outcome, Scope and Out of scope sections from the
  base commit on `main`, the criteria from the record verbatim (A-031, A-044), the owner's decisions for the ticket
  (A-034), and the prior-findings path for a repair (A-035). The coordinator gives only an optional `--seam <path>`
  (code checks that it exists at the base commit) and an optional `--note` with a hard limit of 120 words, inserted as
  a section "Lead from the coordinator (a lead, not a fact)". The author's rule on verified causes and labelled
  guesses stays as prose guidance for `--note`.
- Why: the author's coordinator writes every handoff by hand (AU-127), so its quality varies; a deterministic task is
  a script's job (z. 21) and can be tested exactly.
- Check: a golden test of the template (A-051); `--seam` with a missing path and `--note` over the limit refuse (exit
  code 1); a test that the task carries the record's criteria and the ticket sections from the base commit.
- Source: interview round 2, AU-127; departs from the author.

### T-08 Two certainty vocabularies, and a parsed finding line
- Rule: Criteria keep `met | not met | unknown` (A-031). Claims use `proven` (with evidence: a command with its result,
  or `path:line`), `observed` or `guessed`, shared by the reviewer, the scout, the worker and `limen ask`; a claim with
  no label counts as `guessed`; `plausible` and `unverified` go. A reviewer finding has a fixed line format:
  `blocking|note · proven|observed|guessed · text · evidence`. Code checks the findings against the verdict: a FAIL
  needs at least one `blocking proven` finding, a PASS may have none, and `proven` needs evidence; a mismatch counts as
  no verdict (G4 V1). The scout's and the worker's labels stay prose with the shared vocabulary. `limen stats` counts
  findings by label and weight.
- Why: the author has four vocabularies for one idea, and code parses only some of them (AU-126); z. 10, z. 2.
- Check: tests for the three mismatches (each gives no verdict); a script rejects the retired words in `templates/`.
- Source: interview round 2, AU-126; departs from the author.

### T-09 A prompt sentence comes last and must earn its place
- Rule: The order of repair after an incident is: a guarantee in code, then a test or a `Check`, then a tool, and a
  sentence in a prompt last, only for judgment (z. 14, z. 21). A new standing sentence needs a class of friction from
  at least two sources, and a same-task measurement before and after or a mechanism test, recorded in the repo
  (incidents, measurement, sentence) (z. 38, z. 40). Each role's Limen context message (A-086) has a hard token
  budget checked by a test; the budget is set by a measurement at the end of the rebuild, plus 10 %; a sentence over
  the budget enters only when another one leaves (z. 31). Every section in `templates/` carries a maintainer comment
  with its source (incident, A-NNN, T-NN), stripped at injection; when code already guarantees the source, the
  sentence leaves. A `Check` accepts a sentence, not Adrian's approval word for word.
- Why: the author added a sentence after each incident and approved wording word for word; the manual had 128
  versions in ten weeks and grew from 462 to 7,597 words with no recorded before/after (AU-105).
- Check: a budget test per role; a script that requires a source comment with an existing reference in every section
  of `templates/`; the golden test (A-051).
- Source: interview round 3, AU-105; departs from the author.

### T-10 Every checkable limit is enforced where the artefact is made
- Rule: Code enforces every checkable limit where the artefact is created or accepted; everything else is an explicitly
  marked rule of judgment; no limit lives only in prose. One registry of limits in code (value, place of enforcement,
  reason) is generated into the docs (A-084); the author's values are the starting point, except `--note` at 120
  words (T-07). Enforcement: the ticket (prose sections, Acceptance excluded) in `limen ticket check`; the label at 40
  characters in spawn; TRACK ≤ 3, one-line NEXT and PARKED entries and the board ≤ 120 lines in the command that
  changes the board's prose; PROVEN is generated by code. The silent cut at 1,000 lines ends: the per-role budget of
  the context message (T-09) replaces it, and publishing an owner file that is too large refuses. Content fetched by a
  command (A-008) always says, when cut, how much was left out and where the whole is. At most 5 scout findings and
  1–3-line answers stay prose, marked as rules of judgment.
- Why: the author states numbers almost everywhere, but code enforces only the 1,000-line cut and the 120-line
  advisory (AU-139); z. 14, z. 21.
- Check: a test per registry limit (exit code 1 with a message); a script that requires every number in `templates/`
  to come from the registry or carry the judgment-rule mark; a test that nothing is cut silently.
- Source: interview round 3, AU-139; departs from the author.

### T-11 A test-line cap is an optional owner setting
- Rule: For projects, the test-line cap stops being a sentence in `spec/vision.md` and becomes an optional setting
  `testLineCap` (with a path pattern) in `limits.json`, an owner file; unset by default, asked by `limen init`. When set,
  it is a land condition, and the refusal states the excess. Parsing `vision.md` for numbers goes (this amends A-011 (a)
  and A-012). In Limen's own repo the 3,500-line cap and its test go, because they contradict the tests of gate 2 and
  of T-NN. Instead of a line count, the run time of `npm run check` is recorded in `evidence/` at every stage tag and
  compared with the stage 0 baseline, as a metric for gate 5.N. The rule "a new test replaces a weaker one" stays prose
  for the worker and is judged in the fixed judgment on tests (A-031 (5)).
- Why: the author's cap lives in prose, read by a regex, and the suite sits one line under it (3,499 of 3,500) while
  the rebuild adds many tests (AU-227).
- Check: a land test with the cap set (refusal) and unset (pass); a script that forbids reading numbers from
  `vision.md`; a script that records the gate's run time.
- Source: interview round 3, AU-227; departs from the author; amends A-011 (a) and A-012.

### T-12 Zero runtime dependencies, narrow formats, declared system tools
- Rule: The author's choice stays: zero runtime dependencies and no build step. Both costs are solved without
  dependencies. (1) Narrow formats: ticket front matter is a strict subset (`key: value`, block lists, a known key
  list) with a refusal outside it; Markdown is parsed only for section headings and the fixed line format of
  `## Acceptance` (A-031); shorter parsers with tests on synthetic fixtures. (2) System requirements (Node ≥ 24, git ≥
  2.36, tar, ps and any others found) are declared in the platform adapter (A-083), checked at `limen init` and at
  coordinator start (a refusal with exit code 4 that names the missing tool), and installed in pinned versions by the
  seat script (S).
- Why: zero dependencies keep code that agents run free of an npm supply chain and keep the release root-owned (A-025,
  z. 14); the author's cost was hand-written broad parsers and undeclared system tools (AU-214, H-15).
- Check: the empty-`dependencies` test stays; parser tests (valid input, every refusal, edge cases); a test that `init`
  refuses when a tool is missing or too old.
- Source: interview round 3, AU-214; keeps the author's choice.

### T-13 Two languages by audience
- Rule: The owner register (A-038) answers in the language of the owner's last message, with no setting and no
  per-project override (A-039). It covers the conversation with the coordinator, including how `limen ask` questions
  and escalations are put to Adrian. The agent and specs registers use plain technical English, about 80 %
  ASD-STE100, as the author wrote: tickets, job tasks, handoffs, review findings, the text of `limen ask` and
  `limen escalate` in the record, commits, code, CLI messages and bell fields. The audience line of the cue carries
  the language ("Audience: owner. Answer in the language of the owner's last message." / "Audience: agent. Plain
  technical English."); the fixed "English" on every turn goes.
- Why: the author's cue demands English on every turn, also when Adrian writes Polish (AU-124); Adrian wants a normal
  conversation with the coordinator and machine-like text everywhere else.
- Check: a golden test: the owner register holds the language rule, and the owner cue does not contain "English";
  a seat check (`plan.md` → `## Deployment` item 12): a Polish message gets a Polish answer, and a ticket written from
  that conversation is in English.
- Source: interview round 4, AU-124; keeps the author's English for agents, departs for the owner.

### T-14 Role prompts are literal
- Rule: Role prompts are written literally, in the plain technical English of the agent register (T-13). Each rule is
  the rule and its reason in one or two sentences (z. 21). Metaphors and slogans go; where one carries a concept, a
  term defined once in a short glossary at the start of the context message replaces it (e.g. seam, lead, round,
  candidate tip), counted in the budget of T-09. Tickets that change the tone of role prompts run in `pair` mode.
- Why: the author teaches by slogans and metaphors ("repository archaeology", "money burned twice", "uncommitted
  brilliance") against his own no-idiom rule, and models copy the style they are given (AU-125).
- Check: a script rejects the author's known metaphors (list in `tools/`, from the Part A inventory); a script checks
  that every glossary term has a definition and every definition is used; a reviewer question on literal clarity
  (otherwise `Check: none`); the style change is measured in the same-task comparison (H-21).
- Source: interview round 4, AU-125 (two variants on `templates/worker.md:29-32`); departs from the author.

### T-15 An owner message has a fixed shape; code builds its structured parts
- Rule: A coordinator message to Adrian has five parts in this order. (1) First the result with its evidence, where
  it is recorded (file, commit, published or not) and the next step. (2) The fact that triggers a decision and why
  the decision is Adrian's: a reference to a rule (`path#anchor`) or an explicit reason. (3) Each decision: the
  subject, "what I know" (facts with numbers and sources, rejected alternatives with their measurement), options with
  their effects (document changes included), and a recommendation with a one-sentence reason. (4) Each request (e.g.
  for a resource): what is needed, what the coordinator does without it, and the concrete question; no forced options
  (z. 10). (5) A footer: Done / In progress / Waiting for you, with the publication state of `main`. Mechanisms: (1) is
  one rule with its reason in the owner register; it takes over "the result first" from `## Cue: Shared` and
  `## Cue: Wake`, whose sentences A-077 cuts from the per-turn cue. (2), (3) and (4) are built by code: `limen ask --kind
  decision|request` requires the fields of its kind and refuses without them; the hook shows the rendered block as a
  chat entry (`appendEntry` with `registerEntryRenderer`, as the footer), so the coordinator never retypes it (that
  costs tokens, and the model could change the text); the model knows the content because it gave the fields in the
  call. The rule reference of (2) is checked (the file and the anchor exist). (5) is generated by code from the
  records: lands, active jobs and the queue, open `limen ask` items with their numbers, and the published SHA against
  local `main`. After a reply the order is: the model's prose, the `limen ask` blocks, the footer (T-16).
- Language: the labels of the footer and of `limen ask` blocks are code text in literal English, without idioms
  (Done / In progress / Waiting for you; T-13, T-14). The footer is a view of the same records as `limen status`, so
  one renderer and one language serve both (z. 22); the line content is English anyway (ticket titles, SHAs, paths,
  Q-NNN IDs); a language that follows the conversation would need a translation mechanism (YAGNI). The content of the
  `limen ask` fields is written by the coordinator in the language of the owner's last message (T-13); quotes given to
  `limen answer --quote` stay verbatim.
- Shape reference (anonymised skeleton from a real end-of-milestone message; the original stays out of the repo):
  ```
  <Result> is done. <Evidence: what passed and where>. Recorded on the board (<file>, commit <sha>,
  <published | not yet>). Next is <step>.
  <Fact that triggers a decision>. Per <document#section> you decide <what>.
  Decisions:
  1. <Subject>. What I know: <fact with a number and its source>; <rejected alternative with its measurement and
     reason>; <what changes next>. Options: a) <option and effect>; b) <option and effect, a document change
     included>. I recommend <x>, because <one sentence>.
  2. <Subject from a board rule>. <Facts, cause, action already taken>. I recommend <x>.
  3. <Request>. I need: <what>. Without it I do now: <what>. Question: <concrete question>.
  Done: <result>; published <sha>, local main has <n> more commits.
  In progress: <jobs, or "nothing">.
  Waiting for you: <numbers of the decisions and requests>.
  ```
- Why: the author's owner register is about 1.7k tokens of shapes and formatting rules (AU-122), and none of it reaches
  the model on the seat (A-086). What reaches it is the per-turn cue (`hook/communication.ts:94-97`, `turnCue` at
  `hook/communication.ts:209-263`): `## Cue: Shared` (the first line is the answer), `## Cue: Human` (the closing
  overview), `## Cue: Wake` and the frame anchor. Those lines give the outcome-first opening and the overview Adrian
  values; the decision shape he values comes from neither Limen nor `CLAUDE.md` (model behaviour; gate 2 §1, revision
  4). What matters to him is the content and its evidence, not the formatting.
- Check: tests that `limen ask` refuses without the required fields for both kinds; a test that renders the template
  on the skeleton; a test of the rule-reference check; a test that generates the footer from test records; a metrics
  script over the previous message (footer present, decision blocks complete, language matches); for (1) `Check: none`
  apart from the measurement.
- Footer channel: a chat entry (`appendEntry` with `registerEntryRenderer`, Pi 1.5.1), appended by the hook after a
  coordinator reply only when the rendered footer differs from the last appended one (a text comparison, as for the
  board digest in A-037). It is in the session history and, per Pi's API, not in the model's context. A widget below
  the editor is `rejected`: it takes panel space permanently and no friction asks for it. Revisit when: after a break
  Adrian has to ask for the current state because the last footer is stale, in at least two different weeks (z. 38,
  z. 40).
  1. The model writes no footer of its own. The source of today's model-written overview is `## Cue: Human`
     (`templates/communication.md:138`, sent with every turn by `hook/communication.ts:215-219`), which reaches the
     model because the cue is a message (E-1, E-11). A-077 cuts it and code takes the footer over, so the owner
     register needs no sentence about it; the metric below stays.
  2. The footer and the `limen ask` blocks use the same IDs (Q-NNN).
  3. The quote check of A-034 reads only owner messages (T-16), never footer entries.
  4. Engine fact to check on the seat: a footer entry does not reach the model under the bridge (the input tokens of
     the next turn do not grow by the footer's size).
- Footer checks: a test that renders the footer from test records; a test that the hook appends nothing when the
  footer is unchanged; a test that the IDs under "Waiting for you" equal the open `limen ask` items in the records; a
  test that the A-034 check skips footer entries; a metric for `plan.md` → `## Measurement`: the share of model
  replies with their own Done / In progress / Waiting for you lines is 0; a test that the footer and `limen status` use
  the same render function; a test that after a successful `limen ask` the hook appends the block entry before the
  footer; a golden test of the labels on test data.
- Source: interview round 4, AU-122, Adrian's correction of the same day (the cue reaches the model; gate 2 revision
  4) and the round 4 follow-up (labels, `limen ask` blocks shown by the hook); departs from the author.

### T-16 Evidence in a report comes from records, not from the model
- Rule: The order of a report follows from where its parts come from: the model's prose, the `limen ask` blocks, the
  footer. Evidence is not model prose: the footer's "Done" line gives, for every item closed since the owner's last
  message, the ticket title, the result and the path to the `outcome.md` that Limen generates at land from the record
  (A-070), instead of repeating record fields (A-085) (z. 14, z. 39). The model
  writes only what works now and the next step; evidence from outside the records (e.g. Adrian's own check on his
  laptop) comes with its source. A turn with work in flight ends with the footer's "In progress" line from the
  records; the model-written overview goes. A decision is a `limen ask --kind decision` block (T-15 (3)), and one
  message may hold several numbered decisions. "What it touches and what it costs" is not part of a report: no source
  of friction asks for it (T-09), and `limen stats` already counts tokens by class per job and per coordinator turn
  (H-01 + H-20, gate 2 §2 Measurement).
- Owner message: a Pi session entry with role `user`. Every message Limen injects into the coordinator's session
  (wakes, the context message, digests, notices) is a Pi custom message (`pi.sendMessage` with a `limen-*` type,
  `deliverAs: "followUp"`, `triggerTurn: true`; E-16), never `sendUserMessage`, so a wake does not reset the "Done"
  window and a quote from Limen's own text cannot pass A-034. One function decides "owner message" for A-034, T-05
  and T-16 (gate 2 revision 4, A-034).
- Why: the author's report is four parts in a fixed order written by the model, with a model-written overview at the
  end of every turn with work in flight (AU-123). At `rebuild-base` wakes are sent with `pi.sendUserMessage`
  (`hook/wake.ts:444`, `hook/wake.ts:446`, `hook/wake.ts:658`), so in the Pi session they have the same role as
  Adrian's messages.
- Check: a test that the "Done" line carries the ticket title, the result and the `outcome.md` path from a test record;
  a test on a fixture session (an owner message, a wake, the context message, the cue) where only the owner message
  counts as one; a test that A-034 refuses a quote from the context message and from a wake; a test that a wake does
  not reset the "Done" window; a scan of the hooks loaded in the coordinator session finds no `sendUserMessage`; the
  rest as in T-15.
- Source: interview round 4, AU-123, and Adrian's correction of the same day (the "Done" line content, the owner
  message definition; gate 2 revision 4); departs from the author.

### T-17 No parking list: "not now" is a final rejection with a revisit signal
- Rule: The rebuild keeps no list of parked ideas and no postponed status (gate 2 §0.6). An idea that is not done now
  is recorded as a final decision `rejected` with a field `Revisit when:` that names an observable signal, the number
  of occurrences and the source of evidence (the change signal of an ADR, z. 36). Notes on friction after the rebuild
  live outside the repo; the rebuild creates nothing for them.
- Why: twice in round 4 an idea was parked for "its first friction" (a footer widget, usage per job), and a one-time
  rebuild has no place for parked ideas.
- Check: `tools/check.mjs` rejects the filler words of its `FILLER` list (parking-list words, postponement words and
  placeholders, in English and Polish) in `taste.md` and `plan.md`, and requires every `Revisit when:` field to be
  non-empty.
- Source: interview round 4 follow-up.

### T-18 Plain words, one word per thing
- Rule: The criterion of T-14 applies to names: when an ordinary word with the same meaning exists, use it; otherwise
  use one term defined once in the glossary; one word per thing, code identifiers included. Terms: plant → project;
  seat stays in the glossary (the machine with its accounts, timers and queue), and "machine" as its synonym goes
  (`src/runtime/start-queue.ts:15`); land stays (A-021); wake stays in the glossary; keeper goes (A-045: `limen spec
  fix`; a model job under Picture is named after its task); pulse → activity; cabinet → plain names (group registry,
  summary line); doorbell → the GitHub module; bell → alerts (A-066).
- Conflicts resolved: (1) `close FNNN` is cut; closing Herdr tabs is part of the `cleaned` step of `land`, `ticket
  done`, `ticket drop` and `abandon`, and the daily `limen-sweep` closes leftovers (today a prose trigger,
  `templates/agents.md:108`, `templates/agents.md:158`; z. 21). (2) `ticket-author` is cut (`docs/jobs.md:206`, meant
  for collaborators; Adrian works alone; `git log --diff-filter=A --follow` replaces it). (3) `jobs` is cut: `status`
  is the project summary, rendered by the same function as the footer (T-15); `status --all` lists the jobs; `show
  <id>` shows one job, with `--result` (A-008).
- Migration: an old name exits with code 2 (T-02) and names the new one in `next`; a ticket in the last stage of the
  plan removes the table of old names.
- Structure (variant B, corrected): a top-level command acts on one of three objects. (1) One job: `spawn` creates
  it; `continue`, `steer`, `stop`, `abandon`, `land`, `diff`, `show` and `open` take its id. (2) The
  conversation with the owner: `ask`, `answer`, `decide`, `escalate` (the names of A-015, A-034 and T-05, unchanged;
  `decide` takes `--answers Q-NNN`, T-05).
  (3) This project: `init` and the reads `status`, `stats`, `board`. Everything about another or a wider object is a
  group: `ticket`, `spec`, `group`, `github`, `handoff`, and a new group `seat` (`seat queue`, `seat sweep`), because
  those commands act on the whole machine and every project. There is no group `owner`: in gate 2 "owner" names what
  is reserved for Adrian (owner files, the owner channel, `land --owner`), so a coordinator running `limen owner
  decide` would be ambiguous (z. 13). `init` stays at the top, as in `git init` and `npm init`. Prune and retire are
  steps of `seat sweep` (A-024), with no command of their own. The research module is named now: `limen research
  submit "<question>"` (G1.11, the B2c queue). `ticket series` is cut: the projects do not share tickets (Adrian
  confirmed). Built in `pair` mode.
- `wait` is `rejected`, with no new command kind in T-04: Adrian does not use it, the coordinator is refused it, and
  a larger `maxJobs` creates no caller: the coordinator gets a wake after every job (A-033), the order of spawns
  settles dependencies between tickets, and code advances group rounds (A-075). Revisit when: a concrete caller that
  cannot use a wake appears (e.g. a shell script), in at least two different tasks (z. 38).
- Why: the author's 30 flat commands use private metaphors, and some names mislead (`close` closes Herdr tabs,
  `ticket-author` sits beside the `ticket` group, `jobs` and `status` overlap) (AU-206); z. 13.
- Check: in the registry of T-19 every top-level command declares its object `job`, `owner` or `project`; a test that
  object `job` means a required argument of type job (the resolver of T-20), except the one entry that creates the job
  (`spawn`); a golden test of `limen --help` in variant B; the T-14 script rejects plant, pulse, cabinet, doorbell,
  bell and keeper in user-facing text and in identifiers; the glossary holds seat, land and wake; a reviewer question:
  every help line is a usage criterion (z. 13); the same script also scans the generated help text.
- Source: interview round 5, AU-206 and its two follow-ups (variants A and B on the help after the gate-2 cuts; the
  generator's output); departs from the author.

### T-19 One command registry is the only source
- Rule: One registry of commands is the only source (z. 22, A-084). An entry holds the name (T-18), the kind `read` or
  `change` (T-04), the visibility `public` or `internal`, a one-line summary written as a usage criterion (z. 13), the
  schema of arguments and flags, and the handler. Generated from it: (1) `limen --help`: the list in the groups of
  T-18, one line per command, a width limit (e.g. 100 characters), and at the end the exit-code table of T-02,
  generated from its constant; (2) `limen <cmd> --help`: usage from the schema, the kind, one example; (3) parsing:
  every command goes through one schema-driven parser, a bad flag exits with code 2 and a `next` (T-02), and one
  handler wrapper prints the final JSON line; (4) a marked section of `docs/commands.md` with a staleness test
  (A-084); (5) the command list in the coordinator manual, if it stays, also from the registry (A-085). Internal
  commands stay out of `limen --help`, in their own section of the docs. The advice to the coordinator at the end of
  the help goes: code enforces it (T-07).
- Help variant: groups with summaries, with `limen` at the start of every line; no read/change column (it did not
  align and repeats the kind that `limen <cmd> --help` shows). (1) Groups follow T-18; each group header says what its
  commands act on (e.g. "Jobs: one job; spawn creates it, every other command takes its id", "Seat: all projects on
  this machine"). (2) Summaries are usage criteria (z. 13), lines at most 100 characters; Adrian's wording: stop "stop a
  running job; --done "reason" to declare it done", abandon "give up on a job and keep its work on a branch", land
  "merge a finished job; refuses until its conditions hold", status "what runs, what landed, what waits for the
  owner"; open "open the job's log tab in Herdr"; escalate "report a ticket that used all its review rounds, in four
  checked parts"; board "the board, with NOW and NEXT from the ticket folders"; answer "close a question with a quote
  from a file on main"; github "answer @limen mentions on GitHub pull requests" (what it does, not its old name). (3)
  The exit codes take one line, followed by "The last output line is JSON {class, code, next}." (T-02, z. 11). (4) The
  `spawn` line follows the schema of T-07. (5) The Modules header names the mechanism: "Modules: off by default; the
  owner switches them on (limen init, or limits.json via owner channel)" (T-21, z. 16), and every module line shows
  its state from the project's `limits.json`, `[on]` or `[off]` (G1.10). Each group aligns its own summary column,
  capped at 35 characters of usage; a longer usage puts its summary on the next line at the same column, and a summary
  that does not fit there goes to the next line indented by 6. The draft registry and its generator, with the real
  output, are `evidence/taste/help-registry.mjs` (`--on MODULE` stands in for `limits.json`; it exits 1 when a line is
  wider than 100 characters).
- Why: the author's help is one wide string (64 lines, the widest 356 characters) that lists internal commands and
  ends with advice to the coordinator; only 10 of 31 command files use the shared flag parser (AU-207).
- Check: a golden test of the full `limen --help` on a fixture with one module on and the rest off; a test that every
  group has a header naming its object from the
  registry (`job`, `owner`, `project` or the group); a test that every command file is in the registry and has a flag
  schema; a scan finds no hand-made argument
  parsing (`process.argv`, own loops over `args`) outside the shared parser; a test of the help line width; golden
  tests of `limen --help` and of one `limen <cmd> --help`; the staleness test of `docs/commands.md`; a test that an
  internal command does not appear in `limen --help`.
- Source: interview round 5, AU-207 and its follow-up (the generator's real output); departs from the author.

### T-20 A job reference is always exact
- Rule: A reference to a job is always exact; an approximate match appears only as a hint in an error, never in an
  execution. Today an exact label also depends on time (a second review round has the same label), and a 3-character
  suffix matches every id that ends with it (`src/job/job.ts:110-116`). (1) Every command takes only the full id or its
  final token of 8 hex characters (`src/job/job.ts:136`); the token is unique by construction: at job creation it is
  checked against the project's records and archive under the shared lock (A-018) and drawn again on a collision.
  (2) A label is only a list filter (`status --label F012`), never a reference; label prefixes, short suffixes and
  exact labels are cut as references. (3) Any other form exits with code 2 (T-02); the message lists the matching jobs
  (token, label, state) and the ready command in `next` (z. 11, z. 12). (4) One resolver handles every argument of
  type job in the registry of T-19. (5) References in files (records, the handoff note, `decide` entries) use the full
  id. (6) The S1+ migration checks the uniqueness of tokens in existing records; jobs with a collision or an older id
  format accept only the full id.
- Why: the author accepts the full id, a unique suffix, an exact label or a unique label prefix of 3 or more
  characters in every command, `land` and `stop` included (AU-211); a prefix unique today can hit another job tomorrow.
- Check: a resolver test (the full id and the token pass; a shorter suffix, a label and a label prefix exit with code
  2 with the candidate list and `next`); a test that `land` and `stop` with a label exit with code 2 and change no
  state; a test that the token is drawn again on a collision with a record and with the archive; a scan that every
  argument of type job goes through the one resolver.
- Source: interview round 5, AU-211; departs from the author.

### T-21 The owner is a role, not a name
- Rule: The product names a role, never a person: the term `owner` (as in gate 2: owner files, owner channel, owner
  message, owner register) in code, prompts, keys and file labels; "you" only in views that only Adrian reads (the
  footer, T-15); no name in the configuration (YAGNI). (1) A refusal names the mechanism and an actionable step
  instead of a person (z. 12): where the limit lives (an owner file, changed only through the owner channel) and, in
  `next`, a ready `limen ask --kind request` (T-15); this covers, among others, `src/commands/land.ts:204`. (2) The
  keys `needs-adam` and `needs-adam-on` are cut (`src/picture/tickets.ts:20-29`); the state "waiting for the owner" has
  one source, the open `limen ask` records (T-05); the board line (today `src/project/lanes.ts:21`) is generated from
  the records: "waiting for owner since <date>: <question> (Q-NNN)" (z. 22, A-085). Migration: a script turns existing
  keys into open `request` records with their date, tested on a fixture; a deployment step counts the `needs-adam`
  occurrences in both projects before the migration. (3) Comments that cite another person's decisions
  (`src/runtime/start-queue.ts:16-17`, `src/job/task-note.ts:8`) point at the current source (A-, T- or R-) or go
  (T-09). (4) With A-050, `SECURITY.md` offers contact only through a private GitHub report, with no e-mail address.
  `LICENSE` stays unchanged.
- Why: the author wrote himself into the product ("or ask Adam to raise the cap", the key `needs-adam`, the label
  "Needs Adam"), and on Adrian's seat a model reads "ask Adam" as a false instruction (AU-223).
- Check: a scan of `src/`, `hook/`, `templates/` and `docs/` finds no person's name (list in `tools/`) outside
  `LICENSE` and an explicit list of attribution exceptions; a golden test of a refusal with `next`; a test of the board
  line from an open `limen ask` record; a migration test of `needs-adam` on a fixture.
- Source: interview round 5, AU-223; departs from the author.
