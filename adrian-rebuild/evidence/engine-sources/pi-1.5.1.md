<!-- PL: Ten plik zbiera ustalenia z opublikowanych źródeł npm Pi 1.5.1 (pi-coding-agent, pi-agent-core, pi-ai) na potrzeby planu przebudowy Limena, który uruchamia Pi jako silnik zadań i koordynatora. Odpowiada na osiem pytań: zaufanie projektu i --approve, zasoby wczytywane z katalogu roboczego i z ~/.pi oraz flagi, które je wyłączają, umiejętności, narzędzia, API rozszerzeń, okno kontekstu i kompakcję, --append-system-prompt oraz miejsca zapisywalne przez zadanie, z których Pi może wczytać kod lub instrukcje. Każde twierdzenie ma odnośnik do konkretnej linii w plikach pakietu. Większość odpowiedzi rozstrzyga kod; punkty nierozstrzygnięte mają opisany eksperyment do wykonania na stanowisku. -->

# Pi 1.5.1 engine facts for the Limen rebuild

Sources: the published npm tarballs, read as data (nothing executed).

| Package | Version | Integrity |
|---|---|---|
| `@earendil-works/pi-coding-agent` | 1.5.1 | `sha512-rdu4pRvpQba2ep83nqHaN8L1pvY1OQ3i/2FucogA/eyRxwoUXMUXdk1Z9JnZFJR+9ck9Gs1ajuSb9m7Hz7ejYw==` (from `npm view`) |
| `@earendil-works/pi-agent-core` | 1.5.1 | not in its `package.json`; not recorded |
| `@earendil-works/pi-ai` | 1.5.1 | not in its `package.json`; not recorded |

Reference form: `pi-coding-agent@1.5.1/<path>#L<line>` (likewise `pi-ai@1.5.1/...`, `pi-agent-core@1.5.1/...`).

How to read the citations: the `pi` bin is the esbuild bundle `dist/bundle/cli.js` (`pi-coding-agent@1.5.1/package.json#L10`). The citations point at the unbundled `dist/` tsc output, which is built from the same sources. Spot checks show the bundle carries the same code: the `--approve` parsing, the context-file candidate list and the trust-requiring resource list all appear verbatim in `dist/bundle/chunks/`. "Docs only" marks a claim that rests on `docs/` because no code was found for it.

Limen's job invocation, for reference in the answers below: headless JSON/print mode, `--no-extensions`, explicit `--extension <path>` (Limen hooks; plus `@vanillagreen/pi-claude-bridge` on the `pi-claude` route), `--approve`, `--append-system-prompt <text>`, `--provider/--model`, cwd = job worktree. The coordinator is an interactive session in the project checkout.

---

## 1. `--approve`

**Answer.** `--approve` (short form `-a`) sets one thing: a project-trust override of `true` for this process. Pi then treats the cwd as a trusted project. It loads the project's `.pi/` settings and resources and the project `.agents/skills`, installs missing packages configured in project settings, and runs project-local extensions unless `--no-extensions` is also given. It has nothing to do with tool calls. Pi has no per-tool-call approval system, so no flag turns tool approvals on or off. `--no-approve` (`-na`) forces the project to be untrusted.

Without either flag, trust is resolved per cwd:
- If the cwd has no trust-requiring resources, the cwd counts as trusted unless a saved decision in `~/.pi/agent/trust.json` (for the cwd or a parent) says otherwise.
- If it does have them, Pi asks, in order: user-level and CLI `-e` extensions through the `project_trust` event; then the nearest saved decision for the cwd or a parent directory in `~/.pi/agent/trust.json`; then the global setting `defaultProjectTrust` (default `"ask"`).
- `"ask"` without a UI resolves to untrusted. That is the case in print, JSON and RPC modes.

There is no `--auto-approve` or similar flag. An unrecognised `--flag` is kept as a possible extension flag. If no loaded extension registers it, startup fails with `Unknown option: --<name>` and exit code 1.

The override is applied again whenever the runtime is rebuilt (`/new`, `/resume`, fork), because the same parsed arguments are reused. It also takes precedence over a saved "Do not trust" decision.

Evidence:
- `else if (arg === "--approve" || arg === "-a") { result.projectTrustOverride = true; }`: `pi-coding-agent@1.5.1/dist/cli/args.js#L229-L231`; `--no-approve`/`-na` sets `false`: `#L232-L234`.
- Help text: `--approve, -a  Trust project-local files for this run`: `pi-coding-agent@1.5.1/dist/cli/args.js#L334-L335`.
- The override wins first: `if (options.trustOverride !== undefined) { return options.trustOverride; }`: `pi-coding-agent@1.5.1/dist/core/project-trust.js#L19-L21`. Then come the extension event (`#L25-L37`), the saved decision (`#L38-L41`), `defaultProjectTrust` (`#L42-L49`), and "no UI → false" (`#L50-L52`).
- Trust used when building each runtime: `(cachedProjectTrust ?? parsed.projectTrustOverride ?? trustStore.get(cwd) ?? !hasTrustRequiringResources)`: `pi-coding-agent@1.5.1/dist/main.js#L650-L653`.
- Trust-requiring resources are `settings.json`, `mcp.json`, `extensions`, `skills`, `prompts`, `themes`, `SYSTEM.md` and `APPEND_SYSTEM.md` under `<cwd>/.pi`, plus `.agents/skills` in the cwd or any ancestor: `pi-coding-agent@1.5.1/dist/core/trust-manager.js#L8-L17`, `#L157-L176`.
- Saved decisions live in `trust.json` in the agent dir and are matched against the nearest parent: `pi-coding-agent@1.5.1/dist/core/trust-manager.js#L180`, `#L25-L40`.
- `defaultProjectTrust` is read from global settings only: `const value = this.globalSettings.defaultProjectTrust;`: `pi-coding-agent@1.5.1/dist/core/settings-manager.js#L789-L792`. Its default is `"ask"`: `pi-coding-agent@1.5.1/dist/core/settings-defaults.js#L29`.
- Trust prompt wording: "allows pi to load .pi settings and resources, install missing project packages, and execute project extensions": `pi-coding-agent@1.5.1/dist/core/project-trust.js#L6`.
- No tool approvals: "it does not ask for approval before every tool call" (docs only): `pi-coding-agent@1.5.1/docs/security.md#L3`.
- Unknown flags: they are collected at `pi-coding-agent@1.5.1/dist/cli/args.js#L241-L257`, reported as an error `Unknown option…` at `pi-coding-agent@1.5.1/dist/core/agent-session-services.js#L40-L44`, and runtime errors end in `process.exit(1)` at `pi-coding-agent@1.5.1/dist/main.js#L801-L806`.

Open: none.

---

## 2. What Pi loads from the cwd, its parents and `~/.pi/agent`, and what turns each source off

**Answer.** Project config is read only from `<cwd>/.pi/`; parent directories' `.pi/` folders are never used. Two sources walk upwards:
- **Context files** walk from the cwd all the way to the filesystem root. They are *not* gated by trust, and only `--no-context-files` disables them.
- **`.agents/skills`** walks from the cwd up to the git root. The walk stops at the worktree root, because a linked worktree's `.git` file counts as a git root.

Everything else under `<cwd>/.pi` needs trust. `~/.pi/agent` (the agent dir, relocatable with `PI_CODING_AGENT_DIR`) is always read.

`--no-extensions` drops discovered, settings-listed and package extensions, and the built-in extensions (`mcp`, `codemode`, `tool-search`, `llama.cpp`). It does *not* stop packages from being installed, and it does not stop their skills, prompts or themes from loading. The `--no-skills`, `--no-prompt-templates` and `--no-themes` switches likewise leave explicit CLI paths loaded, along with resources from `-e` package directories. `SYSTEM.md` and `APPEND_SYSTEM.md` have no `--no-*` flag. Passing `--system-prompt` or `--append-system-prompt` (any value) suppresses discovery of the matching file.

| Source | Where (order) | Needs trust? | Turned off by |
|---|---|---|---|
| Context files | The first existing name per directory among `AGENTS.override.md`, `AGENTS.md`, `AGENTS.MD`, `CLAUDE.md`, `CLAUDE.MD`. The agent dir comes first, then every ancestor from the filesystem root down to the cwd. In a linked worktree nested inside the main checkout, the main repo's file is skipped when the worktree has its own copy. | No | `--no-context-files` / `-nc` only |
| Project settings `<cwd>/.pi/settings.json` | cwd only, merged over global settings | Yes. Exception: `sessionDir` is read before trust is decided (see Q8). | `--no-approve`, or not trusted |
| Global settings `~/.pi/agent/settings.json` | always | No | — |
| Project extensions `<cwd>/.pi/extensions/` | `*.ts`/`*.js`, `*/index.ts|js`, `*/package.json` `pi.extensions` (one level) | Yes | `--no-extensions` |
| Global extensions `~/.pi/agent/extensions/` | same layouts | No | `--no-extensions` |
| `extensions` entries in settings, and extensions inside `packages` | settings (project entries only when trusted) | project: Yes | `--no-extensions` |
| Built-in extensions (`mcp`, `codemode`, `tool-search`, `llama.cpp`) | always available | No | `--no-extensions`; `mcp` also `--no-mcp`; settings `-builtin:<name>`. `-e builtin:<name>` loads one explicitly. |
| MCP servers: `~/.pi/agent/mcp.json`, `<cwd>/.pi/mcp.json` | read by the built-in `mcp` extension | project file: Yes | `--no-mcp`, `--no-extensions` |
| Skills | `~/.pi/agent/skills`, `~/.agents/skills`, `<cwd>/.pi/skills`, `.agents/skills` in the cwd and its ancestors up to the git root, settings `skills` entries, package skills, `-e` package skills, `--skill` paths, extension `resources_discover` | project ones: Yes | `--no-skills` removes discovered, settings and package skills, but not `--skill` paths, `-e` package skills or `resources_discover` results |
| Prompt templates (`/name` commands; not in the system prompt) | `~/.pi/agent/prompts/*.md`, `<cwd>/.pi/prompts/*.md`, settings/packages, `--prompt-template` | project: Yes | `--no-prompt-templates` / `-np` (same exceptions) |
| Themes (TUI only) | `~/.pi/agent/themes/*.json`, `<cwd>/.pi/themes/*.json`, settings/packages, `--theme` | project: Yes | `--no-themes` (same exceptions) |
| Packages (`packages` in settings) | Resolved on every startup and reload. Missing npm/git packages are **installed** (`npm install` / `git clone` + `npm install`) into `~/.pi/agent/npm` or, for project scope, `<cwd>/.pi/npm`. | project list: Yes | `--offline` / `PI_OFFLINE=1` skips installs. `--no-extensions` only drops their extensions. |
| `SYSTEM.md` (replaces the default preamble) | `<cwd>/.pi/SYSTEM.md` if trusted, else `~/.pi/agent/SYSTEM.md` | project: Yes | giving `--system-prompt` |
| `APPEND_SYSTEM.md` | `<cwd>/.pi/APPEND_SYSTEM.md` if trusted, else `~/.pi/agent/APPEND_SYSTEM.md` | project: Yes | giving `--append-system-prompt` |
| `models.json`, `auth.json`, `trust.json`, `models-store.json` | agent dir only | No | — |

What this means for Limen jobs, which pass `--approve --no-extensions -e … --append-system-prompt`:
- **Loaded:** worktree, ancestor and global context files; project and global settings; project and global skills, prompts and themes; the resources of settings-listed packages (missing ones are installed first); `SYSTEM.md` (project first, else global).
- **Not loaded:** `APPEND_SYSTEM.md`; any global or project extension, including the project stub `.pi/extensions/limen.ts`; built-ins, so no MCP. Limen's hooks reach the job only through `-e`.
- **Coordinator** (interactive, presumably without these flags): the stub and all other project resources load only after the project is trusted.

Evidence:
- Context-file names: `const candidates = ["AGENTS.override.md", "AGENTS.md", "AGENTS.MD", "CLAUDE.md", "CLAUDE.MD"];`: `pi-coding-agent@1.5.1/dist/core/resource-loader.js#L130`. The agent dir is read first and then ancestors up to the root, unshifted so the root-most file comes first: `#L184-L208`. Worktree shadowing: `#L159-L178`.
- Context files are not trust-gated: `agentsFiles: this.noContextFiles ? [] : loadProjectContextFiles({...})`: `pi-coding-agent@1.5.1/dist/core/resource-loader.js#L480-L487`. The docs say the same: "load regardless of project trust unless you disable context loading": `pi-coding-agent@1.5.1/docs/security.md#L57`.
- Untrusted project settings load as empty: `if (scope === "project" && !projectTrusted) { return {}; }`: `pi-coding-agent@1.5.1/dist/core/settings-manager.js#L257-L260`. The path is `<cwd>/.pi/settings.json`: `#L229`.
- Project dirs are added only when trusted: `if (projectTrusted) { addResources("extensions", … projectDirs.extensions …` at `pi-coding-agent@1.5.1/dist/core/package-manager.js#L2194-L2199` and `#L2209-L2212`. User dirs are always added: `#L2213-L2225`.
- `.agents/skills` dirs are collected only when trusted: `pi-coding-agent@1.5.1/dist/core/package-manager.js#L2184-L2186`. The walk stops at the git root (`existsSync(join(dir, ".git"))`): `#L279-L309`.
- Extension discovery layouts: `pi-coding-agent@1.5.1/dist/core/package-manager.js#L382-L460`.
- `--no-extensions` keeps only CLI extensions: `(this.noExtensions ? cliEnabledExtensions : this.mergePaths(cliEnabledExtensions, enabledExtensions))`: `pi-coding-agent@1.5.1/dist/core/resource-loader.js#L424-L425`. Built-ins are added as `builtin:<name>` paths in `resolve()`: `pi-coding-agent@1.5.1/dist/core/package-manager.js#L765-L771`. The built-in list: `pi-coding-agent@1.5.1/dist/extensions/index.js#L5-L12`. `--no-mcp` → `disabledBuiltinExtensions: ["mcp"]`: `pi-coding-agent@1.5.1/dist/main.js#L689`.
- MCP config: `readConfigFile(join(options.agentDir, "mcp.json"), "global", state); const projectConfig = options.projectTrusted ? …`: `pi-coding-agent@1.5.1/dist/extensions/mcp/config.js#L105-L108`.
- Package resolution runs on every reload, whatever `--no-extensions` says: `const resolvedPaths = await this.packageManager.resolve();`: `pi-coding-agent@1.5.1/dist/core/resource-loader.js#L383`. Project packages are listed first: `pi-coding-agent@1.5.1/dist/core/package-manager.js#L738-L743`.
- Missing packages are installed, except offline: `if (isOfflineModeEnabled()) return false; … await this.installParsedSource(parsed, resolvedScope);`: `pi-coding-agent@1.5.1/dist/core/package-manager.js#L1113-L1128`.
- Install locations: project → `join(this.cwd, CONFIG_DIR_NAME, "npm", "node_modules", source.name)`: `pi-coding-agent@1.5.1/dist/core/package-manager.js#L1925-L1929`. A git install runs `npm install` when `package.json` exists: `#L1696-L1703`.
- Skills, prompts and themes ignore `noExtensions`, and `--no-skills` keeps CLI and package-CLI paths: `this.noSkills ? this.mergePaths(cliEnabledSkills, this.additionalSkillPaths) : …`: `pi-coding-agent@1.5.1/dist/core/resource-loader.js#L439-L441`. Prompts: `#L452-L454`. Themes: `#L469-L471`.
- A `-e <dir>` package contributes all of its declared resources: `pi-coding-agent@1.5.1/dist/core/package-manager.js#L1204-L1210`.
- `SYSTEM.md` and `APPEND_SYSTEM.md` discovery, project file only when trusted: `pi-coding-agent@1.5.1/dist/core/resource-loader.js#L959-L980`. Discovery happens only when no CLI value is given: `this.systemPromptSource ?? this.discoverSystemPromptFile()` (`#L490`) and `if (!appendSources) { … discoverAppendSystemPromptFile()` (`#L495-L499`).
- `models.json` comes only from the agent dir: `join(getAgentDir(), "models.json")`: `pi-coding-agent@1.5.1/dist/core/model-runtime.js#L81`. The agent dir env var is `PI_CODING_AGENT_DIR`: `pi-coding-agent@1.5.1/dist/config.js#L495`, `#L510-L514`.
- Flags: `--no-skills`/`-ns`, `--no-prompt-templates`/`-np`, `--no-themes`, `--no-context-files`/`-nc`, `--no-mcp`, `--no-extensions`/`-ne`, `--offline`: `pi-coding-agent@1.5.1/dist/cli/args.js#L160-L165`, `#L188-L199`, `#L235-L236`.

Open: none for the listing. A corollary not run on a seat: `--system-prompt ""` should suppress `SYSTEM.md` discovery and still keep Pi's default preamble, because `""` is not nullish at `pi-coding-agent@1.5.1/dist/core/resource-loader.js#L490` and `resolvePromptInput` maps it to `undefined` at `#L115-L117`. Seat check: put a sentinel line in `~/.pi/agent/SYSTEM.md`, run `pi -p --no-session --system-prompt "" -e <ext that prints ctx.getSystemPrompt() in before_agent_start> "hi"`, and confirm the sentinel is absent and the default preamble is present.

---

## 3. Skills in the system prompt

**Answer.** Yes. Every loaded skill is listed in a `<skills>` section of each session's system prompt. Each entry has `<name>`, `<description>` and `<location>`; the location is the absolute path of the skill file. Two conditions apply:
- **A reading tool must be selected.** The list appears only when `read` or `bash` is among the selected tools.
- **`disable-model-invocation` hides a skill.** `disable-model-invocation: true` (it must be the boolean `true`) removes the skill from the list. The skill is still loaded and can still be invoked as `/skill:<name>`.

Ways to restrict skills per session:
- **CLI:** `--no-skills` plus one or more `--skill <path>`. Explicit paths still load.
- **Settings:** `skills` override patterns (`!glob` exclude, `-path` force-exclude, `+path` force-include), global or project-level.
- **Per run:** a `before_agent_start` handler can filter `event.systemPromptOptions.skills`. That array is mutable, and the edited options are the ones rendered into the prompt. It has to be done on every run, because each run starts again from the base options.

Evidence:
- Front-matter parsing: `disableModelInvocation: frontmatter["disable-model-invocation"] === true`: `pi-coding-agent@1.5.1/dist/core/skills.js#L262`.
- The list leaves those skills out: `const visibleSkills = skills.filter((s) => !s.disableModelInvocation);`: `pi-coding-agent@1.5.1/dist/core/skills.js#L278-L279`. Entry fields: `#L296-L298`.
- Gated on a reading tool: `const readers = ["read", "bash"]; … if (skillFileReadTool && skills.length > 0) {`: `pi-coding-agent@1.5.1/dist/core/system-prompt.js#L101-L108`.
- Skills are fed from the resource loader into the base options: `const loadedSkills = this._resourceLoader.getSkills().skills;`: `pi-coding-agent@1.5.1/dist/core/agent-session.js#L1363-L1367`.
- Handlers get the live options object (`systemPromptOptions: currentOptions`): `pi-coding-agent@1.5.1/dist/core/extensions/runner.js#L1130`, `#L1147`. The result is what gets rendered: `this._preparePromptAndToolLoadout(result.systemPromptOptions)`: `pi-coding-agent@1.5.1/dist/core/agent-session.js#L1589-L1590`.
- `/skill:<name>` commands are registered for every loaded skill: `pi-coding-agent@1.5.1/dist/core/agent-session.js#L2852-L2853`.
- Override-pattern semantics: `pi-coding-agent@1.5.1/dist/core/package-manager.js#L551-L567`.

Open: none.

---

## 4. Tools

**Answer.**
- **Default set:** `read`, `bash`, `edit`, `write`. `grep`, `find`, `ls` and (on Windows) `powershell` exist but start inactive. The `defaultTools` setting can change the defaults (global, or project when trusted).
- **`--tools a,b,…` (`-t`)** is an allowlist of names or globs. A tool not on it, built-in or extension, is never registered, so a later `setActiveTools()` cannot bring it back. MCP tools are the one exception, unless an entry starts with `mcp__`. A list made only of `+name`/`-name` entries modifies the defaults instead of replacing them.
- **`--exclude-tools` (`-xt`)** is a denylist that covers every tool.
- **`--no-tools` (`-nt`)** yields an empty allowlist: no tools at all, extension tools included.
- **`--no-builtin-tools` (`-nbt`)** leaves built-ins inactive and keeps extension tools.
- **Read-only session:** `--tools read,grep,find,ls` (the help's own example). An extension tool must be named in the allowlist to exist.

**`tool_call` event.** Extensions receive `{ type: "tool_call", toolName, toolCallId, parentToolCallId?, input }`. `parentToolCallId` is set when another tool, such as codemode, made the call. `input` holds the schema-validated arguments and can be mutated in place.

A handler blocks a call by returning `{ block: true, reason?, terminate? }`. Pi then skips the tool and records an error tool result carrying `reason` (default "Tool execution was blocked"). The first blocking handler ends the chain. A handler that throws also blocks: its error message becomes the tool result. Commands the user runs with `!` go through `user_bash`, not `tool_call`.

Evidence:
- `export const DEFAULT_TOOL_NAMES = ["read", "bash", "edit", "write"];`: `pi-coding-agent@1.5.1/dist/core/settings-manager.js#L35`. All built-ins: `pi-coding-agent@1.5.1/dist/core/tools/index.js#L19-L28`.
- Selection logic, with `--no-tools` giving `[]` as the allowlist: `pi-coding-agent@1.5.1/dist/core/sdk.js#L148-L160`. CLI mapping: `pi-coding-agent@1.5.1/dist/main.js#L472-L483`. Flag parsing: `pi-coding-agent@1.5.1/dist/cli/args.js#L108-L132`.
- The registry is filtered by the allowlist and denylist (`.filter((tool) => this._isAllowedTool(tool.definition.name))`): `pi-coding-agent@1.5.1/dist/core/agent-session.js#L2979-L2981`. Activation is filtered too: `#L3023`. The rule itself: `#L1197-L1203`.
- Help: "Read-only mode … `--tools read,grep,find,ls`": `pi-coding-agent@1.5.1/dist/cli/args.js#L395-L396`. Default-off tools: `#L469-L471`.
- Event shape: `type: "tool_call", toolName: toolCall.name, toolCallId: toolCall.id, …(parentToolCallId…), input: args`: `pi-coding-agent@1.5.1/dist/core/agent-session.js#L387-L393`.
- The chain stops on the first block: `if (result.block) { return result; }`: `pi-coding-agent@1.5.1/dist/core/extensions/runner.js#L965-L980`. That function has no per-handler catch, so a throw propagates.
- A block becomes an error result without execution: `createErrorToolResult(beforeResult.reason || "Tool execution was blocked")`: `pi-agent-core@1.5.1/dist/agent-loop.js#L513-L523`. A thrown error becomes an error result: `#L539-L545`.
- Nested calls carry the parent id: `beforeToolCall: (context) => this._beforeToolCall(context, parentId)`: `pi-coding-agent@1.5.1/dist/core/agent-session.js#L459`.
- Mutating `input` and the `terminate` semantics (docs only): `pi-coding-agent@1.5.1/docs/extensions.md#L975-L991`.

Open: none.

---

## 5. Extension API facts

**(a) Changing the system prompt.** `before_agent_start` fires **once per run**. A run starts on each prompt sent while idle (typed, or from `pi.sendUserMessage`) and on `pi.sendMessage(…, { triggerTurn: true })` while idle. The event does not fire per LLM turn inside a run, nor for steer or follow-up messages that join a run already active. So the prompt can change between user prompts during a session, through two mechanisms:
- **Returning `{ systemPrompt }`** forces the whole prompt for that run only. It is not recorded, and it is reset when the run ends.
- **Mutating `event.systemPromptOptions`** (`sections`, `promptGuidelines`, `appendSystemPrompt`, `skills`, `contextFiles`, `selectedTools`, …) changes the structured prompt. The result is diffed against the system state already in the transcript and appended as a `role: "system"` patch message.

Between turns of a single run, Pi re-applies that run's options with the current active tools, but does not re-run the handlers. For edits on every LLM call there are the `context` and `context_with_system` hooks.

**(b) Adding messages.**
- **`pi.sendMessage({ customType, content, display, details }, { deliverAs, triggerTurn })`** stores a `role: "custom"` message. It reaches the LLM as `role: "user"`.
  - `display: false` keeps it out of the TUI chat. The LLM still receives it, and it is still emitted as `message_start`/`message_end`, so JSON-mode consumers see it.
  - `deliverAs` is one of `"steer"` (the default), `"followUp"` or `"nextTurn"`. `triggerTurn: true` starts a run when the session is idle.
- **`pi.appendEntry(customType, data)`** writes a `custom` entry that is **not** part of the LLM context.
- **`before_agent_start` returning `{ message }`** adds one custom message to the run.

**(c) `pi.registerTool(def)`.** Fields: `name`, `label`, `description`, `parameters` (an object schema, TypeBox; anything else throws), and `execute(toolCallId, params, signal, onUpdate, ctx)`. Optional: `promptSnippet`, `promptGuidelines`, `defaultActive`, `exposure`, `renderCall`, `renderResult`. The tool can be registered during load or later, the registry refreshes immediately, and the tool is active unless `defaultActive: false` or exposure says otherwise. It is still subject to `--tools`/`--exclude-tools` (Q4).

**(d) `session_start`, `/new` and `ctx.newSession()`.** `session_start` fires when a session runtime is bound, with `reason` one of `"startup" | "reload" | "new" | "resume" | "fork"` and `previousSessionFile` for new, resume and fork.

`/new`, and `ctx.newSession()` (available on command contexts), run these steps:
1. Emit a cancellable `session_before_switch`.
2. Emit `session_shutdown` (reason `"new"`) and dispose the old runtime.
3. Create a fresh `SessionManager`, which brings a **new session ID** (a UUIDv7) and a new session file.
4. Rebuild the runtime. Extension factories run again, and the new instance receives `session_start` with reason `"new"`.

The CLI options (`--approve`, `-e`, `--no-extensions`, `--append-system-prompt`, …) carry over to the new runtime. `--session-id` does not: it applies only to the initial session.

Evidence:
- The run entry points: `await this._startRun(trigger, …)` at `pi-coding-agent@1.5.1/dist/core/agent-session.js#L1726` and `await this._startRun({ messageType: "custom", message: appMessage })` at `#L1972`.
- `before_agent_start` is emitted in `_prepareRun`: `pi-coding-agent@1.5.1/dist/core/agent-session.js#L1552`. Steer and follow-up messages go to `this.agent.steer/followUp` instead (`#L1959-L1966`, `#L1879-L1904`).
- The handler result: `if (result.systemPrompt !== undefined) { currentOptions.forceSystemPrompt = result.systemPrompt; }`: `pi-coding-agent@1.5.1/dist/core/extensions/runner.js#L1150-L1156`.
- The patch message: `return sections ? { role: "system", content: "", sections, … }`: `pi-coding-agent@1.5.1/dist/core/agent-session.js#L1387-L1393`. Prepended to the run: `#L1589-L1592`. Reset at the end of the run: `this._runSystemPromptOptions = undefined;` (`#L1532`).
- Between-turn re-application: `pi-coding-agent@1.5.1/dist/core/agent-session.js#L594-L607`. `context_with_system`: `pi-coding-agent@1.5.1/dist/core/extensions/runner.js#L1043-L1047`.
- Docs: "Pi diffs the resulting prompt sections … and appends one system message patching only the changed sections" (docs only): `pi-coding-agent@1.5.1/docs/extensions.md#L657`.
- `sendCustomMessage` delivery modes: `pi-coding-agent@1.5.1/dist/core/agent-session.js#L1946-L1984`. Events are emitted on append: `#L1985-L1990`.
- Custom messages become user messages: `case "custom": { … return { role: "user", content, …`: `pi-coding-agent@1.5.1/dist/core/messages.js#L89-L96`.
- Hidden in the TUI: `case "custom": { if (message.display) {`: `pi-coding-agent@1.5.1/dist/modes/interactive/interactive-mode.js#L3271-L3277`.
- `appendEntry` → `appendCustomEntry`: `pi-coding-agent@1.5.1/dist/core/agent-session.js#L2879-L2885`. "Plain custom entries … do not participate in context": `pi-coding-agent@1.5.1/dist/core/session-manager.js#L162-L183`.
- `registerTool` and its schema check: `pi-coding-agent@1.5.1/dist/core/extensions/loader.js#L237-L247`. Execute signature: `pi-coding-agent@1.5.1/dist/core/tools/tool-definition-wrapper.js#L12`. Activation on registration: `pi-coding-agent@1.5.1/dist/core/agent-session.js#L3056-L3058`.
- `session_start` default: `{ type: "session_start", reason: "startup" }`: `pi-coding-agent@1.5.1/dist/core/agent-session.js#L226`. Emitted at `#L2776`.
- `newSession` flow: `pi-coding-agent@1.5.1/dist/core/agent-session-runtime.js#L147-L173`. New ID: `this.sessionId = options?.id ?? createSessionId();` (`pi-coding-agent@1.5.1/dist/core/session-manager.js#L696`), with `createSessionId() { return uuidv7(); }` (`#L12-L14`).
- The factory runs on every load: `await factory(load.api);`: `pi-coding-agent@1.5.1/dist/core/extensions/loader.js#L519-L524`. The same parsed CLI options are reused: `pi-coding-agent@1.5.1/dist/main.js#L644-L697`.
- Stale old `pi`/`ctx` after replacement (docs only): `pi-coding-agent@1.5.1/docs/extensions.md#L1473-L1480`.

Open: none.

---

## 6. Context window and compaction

**Answer.** **Where the context window comes from.** A model's `contextWindow` comes from layers, in this order:
1. pi-ai's bundled catalog JSON. For example, `claude-opus-4-8` is listed with 1,000,000 in `pi-ai@1.5.1/dist/providers/data/anthropic.json#L1`.
2. An overlay from the pi.dev catalog, persisted to `models-store.json` and refreshed at most every 4 h unless offline.
3. `~/.pi/agent/models.json`: custom models default to 128,000, and `modelOverrides` can set the value per model.
4. A provider extension's `pi.registerProvider` model definitions, passed through as given. The type requires `contextWindow: number`.

For Limen's `pi-claude` route, the bridge copies `contextWindow` from pi-ai's anthropic catalog (`pi-claude-bridge@5.0.3/src/models.ts#L17-L23`; outside this brief's three packages).

**`ctx.getContextUsage()`.** It uses the routed model, falling back to the selected one. If the context window is ≤ 0, it returns `undefined`. Otherwise, tokens = the last valid assistant `usage` (`totalTokens`, or `input + output + cacheRead + cacheWrite`) plus a chars/4 estimate of the messages after it. Right after a compaction it returns `tokens: null` until the next response. `percent = tokens / contextWindow × 100`.

**When auto-compaction triggers.** The condition is `compaction.enabled` (default true) and `contextTokens > contextWindow − reserveTokens`, with `reserveTokens` 16384 by default. Pi checks it at four points:
- after a run;
- before a new prompt;
- between turns, before the next assistant response;
- on a provider overflow error or an early `length` stop, which leads to one compact-and-retry.

Settings keys: `compaction.enabled`, `compaction.reserveTokens`, `compaction.keepRecentTokens` (default 20000), and `compaction.modelOverrides["<provider>/<id>"].{reserveTokens,keepRecentTokens}`. They can be set globally, or in project settings when trusted.

**What compaction keeps.** After a compaction, the LLM sees:
- a snapshot of the system-prompt state, kept on the compaction entry;
- an LLM-generated summary, sent as a `user` message;
- the entries from `firstKeptEntryId` onwards, about the last `keepRecentTokens` of conversation. The cut lands on user, assistant, bash or custom messages, never on a tool result;
- everything appended after the compaction.

Older messages, including earlier custom messages, survive only inside the summary. Extensions can cancel the compaction or supply their own through `session_before_compact`.

Evidence:
- Catalog wiring: `import values from "./data/anthropic.json" … flattenChatModelCatalog("anthropic", values)`: `pi-ai@1.5.1/dist/providers/anthropic.models.js#L3-L5`.
- Remote overlay: `const DEFAULT_CATALOG_BASE_URL = "https://pi.dev";` and the refresh interval of `4 * 60 * 60 * 1000`: `pi-coding-agent@1.5.1/dist/core/remote-catalog-provider.js#L5-L7`. It is applied to built-ins at `pi-coding-agent@1.5.1/dist/core/model-runtime.js#L88-L96`.
- `models.json` defaults and overrides: `contextWindow: definition.contextWindow ?? 128000` (`pi-coding-agent@1.5.1/dist/core/provider-composer.js#L109`) and `contextWindow: override.contextWindow ?? model.contextWindow` (`#L74`).
- Extension model passthrough: `return { ...definition, api: api, provider: providerId, baseUrl, headers: undefined };`: `pi-coding-agent@1.5.1/dist/core/provider-composer.js#L148`. The type is `contextWindow: number;`: `pi-coding-agent@1.5.1/dist/core/extensions/types.d.ts#L1541`.
- `getContextUsage`: `pi-coding-agent@1.5.1/dist/core/agent-session.js#L3607-L3641`. `_limitsModel()` returns `this.routedModel?.model ?? this.model` (`#L365-L367`).
- Token math: `calculateContextTokens` at `pi-coding-agent@1.5.1/dist/core/compaction/compaction.js#L65-L67`, `estimateContextTokens` at `#L110-L135`, chars/4 at `#L201-L219`.
- Threshold: `return contextTokens > contextWindow - settings.reserveTokens;`: `pi-coding-agent@1.5.1/dist/core/compaction/compaction.js#L173-L177`. Defaults at `#L53-L57` and `pi-coding-agent@1.5.1/dist/core/settings-defaults.js#L8-L12`.
- Check sites: after a run, `pi-coding-agent@1.5.1/dist/core/agent-session.js#L1623`; before a prompt, `#L1547-L1550`; between turns, `#L478-L487` and `#L595`; overflow, `#L2529-L2569`; threshold, `#L2602-L2603`.
- Settings keys and per-model overrides: `pi-coding-agent@1.5.1/dist/core/settings-manager.js#L643-L683`.
- What the LLM sees: the compaction entry projects as `[entry.systemMessage, summary]` (`pi-coding-agent@1.5.1/dist/core/session-manager.js#L187-L190`), followed by the kept entries from `firstKeptEntryId` and the later ones (`#L201-L229`). The summary is sent as `role: "user"` with a `<summary>` wrapper: `pi-coding-agent@1.5.1/dist/core/messages.js#L103-L110`.
- Cut-point rules and the structure of the summary (docs only for the prose): `pi-coding-agent@1.5.1/docs/compaction.md#L36-L42`, `#L130-L139`. Extension interception: `pi-coding-agent@1.5.1/dist/core/agent-session.js#L2639-L2657`.

Open:
- What happens when a provider extension omits `contextWindow` is not settled. `_checkCompaction` substitutes `?? 0` (`pi-coding-agent@1.5.1/dist/core/agent-session.js#L2501`), which would make the threshold test true after every run, while `getContextUsage` returns `undefined`. Seat check: register a scratch provider model without `contextWindow`, run `pi --mode json --no-session -e <scratch-ext> --model <scratch>/<id> "hi"`, and look for a `compaction_start` event.
- The bridge's own Claude Code process may compact or count context independently. Settle that in the bridge study, not here.

---

## 7. `--append-system-prompt`

**Answer.** Either text or a path. If the value names an existing file (checked with `existsSync` relative to the process cwd, which for jobs is the worktree), Pi uses the file's contents; otherwise the literal text. The flag can be repeated; the parts are joined with blank lines into the `<addendum>` section, and any use of the flag suppresses `APPEND_SYSTEM.md`.

Evidence: `if (existsSync(input)) { … return stripBom(readFileSync(input, "utf-8"));` (`pi-coding-agent@1.5.1/dist/core/resource-loader.js#L114-L128`); the parts are pushed in `pi-coding-agent@1.5.1/dist/cli/args.js#L75-L78`, joined in `pi-coding-agent@1.5.1/dist/core/agent-session.js#L1362`, and placed by `promptSections.addendum = appendSystemPrompt` (`pi-coding-agent@1.5.1/dist/core/system-prompt.js#L96-L97`).

Open: none.

---

## 8. Code or instructions loaded from places a job can write, even with `--no-extensions` and explicit `-e`

**Answer.** Several mechanisms exist. Each is listed by place and how it works.

**Context files (instructions)**
- `AGENTS.override.md`, `AGENTS.md` and `CLAUDE.md` (and the case variants) are read from the worktree, every ancestor directory and the agent dir.
- They are always loaded without trust, and only `--no-context-files` stops them.
- A job can create or change them in its worktree. They take effect in its next session, in any resumed session, and in any other Pi session whose cwd is at or below that directory.

**What `--approve` adds: the worktree's `.pi/` and `.agents/skills`**
- *Settings.* `<worktree>/.pi/settings.json` is merged over the global settings. Several keys run commands or change how they run:
  - `packages`: missing ones are installed on startup by running the package manager, or by `git clone` followed by the package manager. Package-manager installs normally run the package's lifecycle scripts; this is standard npm/pnpm/bun behaviour, not shown in Pi's code. Packages already present under `<worktree>/.pi/npm/` are used as they are.
  - `npmCommand`: replaces the command used for those installs.
  - `shellPath` and `shellCommandPrefix`: change how the `bash` tool runs.
  - `defaultTools`, `compaction.*`, `sessionDir` and the resource lists are also honoured.
- *System prompt files.* `<worktree>/.pi/SYSTEM.md` replaces Pi's default preamble, because Limen passes no `--system-prompt`. `<worktree>/.pi/APPEND_SYSTEM.md` is suppressed by Limen's `--append-system-prompt`.
- *Skills, prompts and themes.* `<worktree>/.pi/{skills,prompts,themes}` and `<worktree>/.agents/skills` load; skills are listed in the system prompt.
- *Not loaded under `--no-extensions`:* `<worktree>/.pi/extensions`, the extensions inside packages, and `.pi/mcp.json`. The MCP built-in is off with `--no-extensions`.

**Without `--approve`**
- The project `sessionDir` is still read before trust is decided. This affects only where session files are kept.

**`~/.pi/agent`, if the job runs as the same OS user and can write there**
- `settings.json`: same keys as above, always applied.
- `SYSTEM.md` and `APPEND_SYSTEM.md`.
- `skills/`, `prompts/`, `themes/`, plus `~/.agents/skills`.
- `models.json`: config values that start with `!` are run as shell commands.
- `trust.json`: can pre-trust a parent directory.
- `extensions/` is ignored under `--no-extensions`.

**Explicit `-e` paths**
- A relative `-e` path is resolved against the cwd, i.e. inside the worktree.
- A `-e npm:` or `-e git:` source is installed into the agent dir's temporary area. Unless it is pinned, it is refreshed to the latest version on each start.
- A `-e <directory>` loads every resource its `package.json` `pi` manifest declares. The bridge package (5.0.3) declares only `./bundle/index.js`.

**Transpile cache (jiti)**
- Extensions loaded with `-e` are compiled by jiti with its filesystem cache enabled; Pi does not set `fsCache`.
- In the bundled CLI the cache directory resolves to `os.tmpdir()/jiti`. A `node_modules/.cache/jiti` next to the loader is used instead when one exists, which is not the case in the published layout.
- A cached file is reused whenever it ends with a marker derived from a hash of the source text. Anyone who can write that directory can therefore change the code that runs for an extension whose source they can read.
- `JITI_FS_CACHE=0` turns the cache off. A private `TMPDIR` relocates it. jiti ignores `TMPDIR` when it equals the cwd.

**Node compile cache**
- The bin calls `module.enableCompileCache()` before loading Pi.
- Where that V8 code cache lives, and how it is validated, is Node behaviour, not Pi code. See Open.

**Interactive implicit trust (coordinator only)**
- A cwd with no trust-requiring resources at startup is implicitly trusted.
- A later `/reload` loads any `.pi/` resources created in the meantime, including extensions, and then saves trust to `trust.json`.
- This does not apply to the coordinator as described, because the project already ships `.pi/extensions/limen.ts`. It also does not apply to jobs: print and JSON mode have no `/reload` command, and `--approve` makes the question moot.

Evidence:
- Context files have no trust check: `pi-coding-agent@1.5.1/dist/core/resource-loader.js#L179-L210`, `#L480-L487`.
- Startup settings are created without `projectTrusted: false`: `const startupSettingsManager = SettingsManager.create(cwd, agentDir);` at `pi-coding-agent@1.5.1/dist/main.js#L589`, with the default `options.projectTrusted ?? true` at `pi-coding-agent@1.5.1/dist/core/settings-manager.js#L238`. They are used for `sessionDir` at `pi-coding-agent@1.5.1/dist/main.js#L605-L609`. The docs say the same (docs): `pi-coding-agent@1.5.1/docs/security.md#L31`.
- Merged `npmCommand` replaces the installer: `return this.settings.npmCommand ? [...this.settings.npmCommand] : undefined;` (`pi-coding-agent@1.5.1/dist/core/settings-manager.js#L806-L808`), used at `pi-coding-agent@1.5.1/dist/core/package-manager.js#L1573-L1583` and `#L1604-L1607`.
- Install-on-startup: `pi-coding-agent@1.5.1/dist/core/package-manager.js#L1113-L1161`. The project install root is `<cwd>/.pi/npm/node_modules`: `#L1925-L1927`.
- Shell settings feed the bash tool: `const shellCommandPrefix = this.settingsManager.getShellCommandPrefix(); const shellPath = this.settingsManager.getShellPath();`: `pi-coding-agent@1.5.1/dist/core/agent-session.js#L3061-L3062`. Both read merged settings: `pi-coding-agent@1.5.1/dist/core/settings-manager.js#L771-L774`, `#L798-L800`.
- Project `SYSTEM.md` when trusted: `pi-coding-agent@1.5.1/dist/core/resource-loader.js#L959-L963`.
- `!` config values are run as commands: `if (config.startsWith("!")) {`: `pi-coding-agent@1.5.1/dist/core/resolve-config-value.js#L66`, with `execSync` at `#L161`.
- Relative `-e` paths: `paths?.map((value) => (isLocalPath(value) ? resolvePath(value, cwd) : value))`: `pi-coding-agent@1.5.1/dist/main.js#L486-L488`. The temporary refresh to latest: `pi-coding-agent@1.5.1/dist/core/package-manager.js#L1141-L1155`. The temporary dir is `join(agentDir, "tmp", "extensions")` with mode `0o700`: `#L86-L88`.
- The bundled CLI uses jiti without `fsCache`: `createJitiImpl(import.meta.url, { moduleCache: false, ...resolutionOptions })`, where `resolutionOptions` is `{ virtualModules, tryNative: false }` in bundled mode: `pi-coding-agent@1.5.1/dist/core/extensions/loader.js#L481-L490`. Bundled mode is on: `usesEmbeddedModules = … || isBundledNode` at `#L22`. The static loader `require`s the installed `jiti` package: `pi-coding-agent@1.5.1/dist/bundle/chunks/jiti-static-loader-2RCDI6B4.js#L2`. The pinned version is `"jiti": "2.7.0"`: `pi-coding-agent@1.5.1/package.json#L57`.
- jiti 2.7.0 cache behaviour, as bundled in `pi-coding-agent@1.5.1/dist/bundle/chunks/jiti-loader-GL4HJFAD.js`:
  - `fsCache` defaults from `JITI_FS_CACHE`, falling back to `true`: `#L21`.
  - Cache dir is `../node_modules/.cache/jiti` if present, else `tmpdir()/jiti`: `#L19`.
  - A hit requires `existsSync(l2)` and `i3.endsWith(n2)`, where `n2` is `/* v9-${utils_hash(t3.source,16)} */`: `#L18`.
- The compile cache is enabled: `enableCompileCache();`: `pi-coding-agent@1.5.1/dist/bundle/cli.js#L4`.
- Implicit trust on reload: `pi-coding-agent@1.5.1/dist/modes/interactive/interactive-mode.js#L4543-L4559`. `reload()` keeps the current trust state (`await this._resourceLoader.reload();` with no trust re-resolution): `pi-coding-agent@1.5.1/dist/core/agent-session.js#L3109-L3112`.

Open:
- **jiti cache path in practice.** Partly settled. The runtime `require("jiti")` resolves the installed dependency, which is not part of these sources; the bundled copy is the evidence. Seat check: run `JITI_DEBUG=1 pi --mode json --no-session --no-extensions -e <limen-hook.ts> "hi" 2>&1 | grep '\[cache\]'` and read the `[store]`/`[hit]` paths. Then repeat with `JITI_FS_CACHE=0` and confirm no `[cache]` lines appear.
- **Module resolution for `-e` extensions.** Not settled by the sources: whether bare imports inside a `-e` extension can resolve from the worktree's `node_modules`. Pi aliases its own packages and `typebox` through virtual modules; other bare specifiers follow jiti/Node resolution from the extension file's directory. Seat check: run the same `JITI_DEBUG=1` command and inspect which file each non-Pi import resolves to when the hook lives outside the worktree.
- **Node compile cache.** Not settled by the sources: where Node puts the cache and how it validates it. Seat check: `node -e "const m=require('module'); console.log(m.getCompileCacheDir?.())"` after `NODE_COMPILE_CACHE` is unset, and `ls` that directory before and after one `pi --version`.

---

## Summary

| # | Question | Answer (≤ 15 words) | Settled |
|---|---|---|---|
| 1 | `--approve` | Forces project trust for this run; no tool approvals exist; no `--auto-approve`. | yes |
| 2 | What loads, and off-switches | `.pi` from cwd if trusted; context files always; per-type `--no-*` flags. | yes |
| 3 | Skills in prompt | Listed with name/description/path; `disable-model-invocation: true` hides; `--no-skills`+`--skill` restricts. | yes |
| 4 | Tools | Default read/bash/edit/write; `--tools` allowlist; `tool_call` can mutate or block. | yes |
| 5 | Extension API | Prompt changes per run; custom messages become user role; `/new` gets new ID. | yes |
| 6 | Context window / compaction | Catalog/models.json/extension; compacts above window−16384; keeps summary plus recent 20k tokens. | partly |
| 7 | `--append-system-prompt` | Text, or file contents when the value is an existing path. | yes |
| 8 | Job-writable load paths | Context files; trusted `.pi` settings/packages/SYSTEM.md/skills; `~/.pi`; jiti tmp cache. | partly |
