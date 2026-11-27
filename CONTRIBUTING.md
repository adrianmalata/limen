# Contributing

Mechanism stays small. Judgment stays in templates.

## Before a patch

```bash
npm run check
```

That is typecheck, Biome format and lint check, and the real-Git test suite. Each test has a 30s timeout so a leaked watcher fails instead of hanging. CI runs the same command on Linux.

## What belongs in source

Runtime dependencies must stay empty, and TypeScript basenames stay unique across the tree (`test/structure.test.ts`). Do not add `index.ts`, `types.ts`, `utils.ts`, barrels, enums, or a shared helper bag.

Where code lives:

- `src/main.ts` — CLI entry and the shared wrapper, which prints a command's text when it ends; `src/commands/` — one file per verb, each a thin adapter that reads its values and calls one domain operation; no command imports another. The commands whose registry entry names a later ticket in `movedBy` (`keeper`, `group wait`) keep their own logic and print as they go until those tickets move them
- `src/job/` — the job record: its model, lookup, rendering, and `record.ts`, which owns state files and finalization; the operations on jobs: spawn, continue, stop, steer, watch, land, and the group's rounds
- `src/runtime/` — starting and supervising an engine: launch profiles, stream parsing, the detached runner, stall detection, reaping, recovery, the prune of finished worktrees, and `launcher.ts`, the one module that starts Limen's own CLI and names the systemd user scopes jobs run in
- `src/project/` — the project around jobs: Git and worktrees, the leftover files of cut features, the seat registry
- `src/integrations/` — systems outside files and Git: Herdr, the GitHub doorbell, and the coordinator sessions that Limen wakes and registers
- `hook/` — only the extensions Pi loads by path (`wake`, `communication`, `steering`, `finish`, `group-peer`). Installed project stubs and job launches name these paths; do not move them

- Capability — start, wait, stop, observe — belongs in `src/`
- Operating advice belongs in `templates/`
- Behavior incidents should normally change templates, not add guards
- Project context belongs in the package: stable guidance (capability frame, coordinator manual or role prompt, the registers of the role's audience, vision, styleguide) rides the context message that `src/runtime/context-message.ts` builds and the communication hook sends once per session, never Pi's system prompt, which the Claude bridge drops; a short per-turn cue recalls the capability frame and names the audience; a tool result carries the text of the rule that applies, and the vision once a planned ticket is created or edited; every Limen text comes from the package, no project file replaces one, and a missing one fails loudly; bound injected text; `limen status` lists a leftover copy once and `limen init --drop-leftovers` removes it

Only impossible mechanics should error. Everything else informs. Migration is the exception where safety requires a complete read-only preflight: any legacy live job, handshake, type mismatch, or old/new path conflict must fail before the first write.

## Registers and cues

The speech register is three package files, one per audience, and `src/runtime/context-message.ts` puts each whole into the context message of the roles it serves, headed by its path: `templates/registers/agent.md` (Shared, Agent, Before you send) for every role, `templates/registers/specs.md` (Specs) for the coordinator and the keeper, and `templates/registers/owner.md` (the audience switch, the cold reader, Human with Reporting work) for the coordinator alone. The message carries each register once per session; keep each file at or below 1000 lines, since the injected copy is capped at 1000 lines.

An optional module's text for a part lives in `templates/modules/<module>/<the part's file name>`, for example `templates/modules/group/manual.md` for the coordinator manual or `templates/modules/picture/worker.md` for the worker's role. `src/runtime/context-message.ts` puts that file, headed `<Name> module` and its path, right after its part, for each module the project switches on in `.agents/limen/limits.json`, in the order of `src/project/modules.ts`; a module that is off adds nothing. A sentence whose subject is a module's command, data, role or behaviour belongs in that module's file, so that the text it leaves reads whole without it.

`templates/communication.md` holds only the `## Cue: <name>` sections of the short per-turn cue. The communication hook selects the bodies of these plain Markdown sections, without their headings. Shared applies to every reply; Human or Agent selects the audience. Wake applies to a job notification. Failure applies once after an unsuccessful assistant turn and replaces `{{failure}}` with its recorded reason. An omitted section adds no cue. After a write or an edit under `spec/`, the hook appends the `## Specs` section of `templates/registers/specs.md` to that tool result, in the sessions whose context message holds the specs register; after an edit of code it appends the styleguide sections that apply, and when a ticket in `spec/features/planned/` is created or edited, the vision. Each section comes once until a compaction or a new session start, such as `/reload`.

## Formatter and linter

Biome formats and lints. The linter runs Biome's recommended rules plus the rules `biome.jsonc` names, each with its reason; `npm run check` passes `--error-on-warnings`, so a warning fails it too. A rule turned off names its reason and only the files it is true for. Fix a diagnostic in the code: a non-null assertion becomes a check, a narrowed type or an early return, not a cast. A `biome-ignore` comment marks a site where the code is right and the rule is wrong, with that reason. Lines are at most 120 columns and every control-flow body has braces. Every function holds cognitive complexity at most 25 and at most 70 lines, blank lines not counted; a function over a limit carries a `biome-ignore` comment with its reason. The override in `biome.jsonc` holds the files it lists to the target style (no nested ternary, cognitive complexity at most 20). After `biome lint --write --unsafe`, run `npm run typecheck`: an unsafe fix can drop a needed `?.`. `limen init` never overwrites existing project files and refuses leftover Control paths (rename or remove them by hand). Change `templates/` and `hook/` in this package; every project gets them as they are.
