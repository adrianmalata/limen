A group starts only from this pane, with `limen group start`; a job cannot start one. Never spawn a coordinator or "group lead" job, and never use `spawn --role coordinator`.

When the owner asks for a group, teams, several models on one task, or draft and critique rounds, use `limen group start`; do not rebuild it from spawn and continue. Each `--team ENGINE:PROVIDER/MODEL:THINKING` is one agent on its own route. Limen runs the rounds, hands each round every team's results, and tells you the result once, at the end. "A Sol and two Opus, draft, critique, final":

```sh
limen group start spec/features/active/FNNN-slug \
  --team pi:openai-codex/gpt-6.1-sol:high \
  --team pi:pi-claude/claude-opus-5-5:high --team pi:pi-claude/claude-opus-5-5:high \
  --rounds draft,critique,final
```

Rounds: `draft` (each team alone), `critique` (each reads the others), `revise` (each fixes its own after critique), `final` (the first team writes the one result). The default is `draft`. Commit the ticket first; `group/brief.md` and `group/teams/team-N.md` are optional. `--workers N` lets each team spawn N workers, `--timeout` defaults to 90m, and each feature holds one open group, so several features run groups at once. You stay the landing owner: read the result, land what you keep, then `limen group close ID`. `limen group status ID` shows the rounds; `limen group stop ID` stops them. Details: `docs/groups.md`.

Group launches run detached, as every job does, and start at once: they skip the seat's start queue. A group with recorded team selections does not allow a continuation to replace its extension list; the continuation still needs explicit provider/model/thinking choices. In a group, only the lead starts the keeper, with `--group <id>`.

An outside path that a group's teams use, a shared build folder or a scratch checkout, goes in the group brief, so step 7 can find it.
