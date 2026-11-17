<!-- PL: Ten plik to wynik lektury źródeł pakietu `@vanillagreen/pi-claude-bridge` 5.0.3 (wraz z typami Claude Agent SDK 0.3.326 i potrzebnymi fragmentami Pi 1.5.1), przygotowany jako materiał dowodowy do planu przebudowy Limena. Opisuje, jak most mapuje kontekst Pi na wywołania Claude Code, co robi z cache promptów, narzędziami, ustawieniami, oknem kontekstu, limitami subskrypcji, uwierzytelnianiem i poziomem effort, a także co dzieje się z wznawianą sesją Claude Code przy kompakcji Pi (i jak hook powinien ponownie wysłać wiadomość kontekstową Limena) oraz czy wiadomości użytkownika docierają do Claude bez zmian. Każde twierdzenie ma odnośnik do linii źródła; rzeczy rozstrzygane wewnątrz samego Claude Code oznaczono jako nierozstrzygnięte, z eksperymentem na stanowisku, który je rozstrzygnie. Stan: lektura źródeł zakończona, eksperymenty na stanowisku jeszcze niewykonane. -->

# Engine source read: `@vanillagreen/pi-claude-bridge` 5.0.3

## Package facts

- Package: `@vanillagreen/pi-claude-bridge` 5.0.3, integrity `sha512-px2GBWKnB84VD4XLIZAsja32Zu4DJ5E/yInfERti0ENFCfmXvhWSAGYuUO2QH82nQd3s/KhsHXsjqV2rRetMWQ==` (from `npm view`).
- Declared dependencies (`bridge@5.0.3/package.json#L136-L140`): `@anthropic-ai/claude-agent-sdk ^0.3.261`, `@anthropic-ai/sdk ^0.112.4`, `@modelcontextprotocol/sdk ^1.32.1`, `cc-session-io ^0.3.2`, `change-case ^5.4.4`.
- Peer dependencies, both marked optional (`bridge@5.0.3/package.json#L143-L144`, `#L187-L194`): `@earendil-works/pi-ai >=0.86.0`, `@earendil-works/pi-coding-agent >=0.86.0`. Dev: both `^0.87.1` (`#L147-L148`). Engine: node `>=22.19.0` (`#L185`).
- Agent SDK read: `@anthropic-ai/claude-agent-sdk` 0.3.326, used as a stand-in (newest version in `^0.3.261`). Its `sdk.d.ts` is cited as `agent-sdk@0.3.326/sdk.d.ts#L…`.

## Source notes (read these first)

- **Pi runs the bundle, and the bundle carries its own SDK.** The package declares `"pi": {"extensions": ["./bundle/index.js"]}` (`bridge@5.0.3/package.json#L14-L16`), and Pi resolves a directory's `pi.extensions` entry (`pi-coding-agent@1.5.1/dist/core/extensions/loader.js#L602-L617`). The build marks only pi-ai and pi-coding-agent as external (`bridge@5.0.3/package.json#L155`), so the Agent SDK's JavaScript is inlined (`bridge@5.0.3/bundle/index.js#L40003`). The inlined copy identifies itself as 0.3.261: `process.env.CLAUDE_AGENT_SDK_VERSION = "0.3.261"` (`bridge@5.0.3/bundle/index.js#L73277`, `#L73293`). As a result, the SDK in use is 0.3.261 whatever `npm ls` reports. The 0.3.326 docs quoted below are the closest available documentation, not proof of how 0.3.261 behaves. Where it matters, the bundled 0.3.261 flag-mapping code is cited directly.
- `src/` is the primary source. Spot checks show the bundle matches it, for example `bridge@5.0.3/bundle/index.js#L75258` and `#L75269-L75280` against `bridge@5.0.3/src/query-options.ts#L135` and `#L158-L170`.
- The **Claude Code executable** is chosen at runtime. The order is: the configured path, then the first `claude` or `claude-code` on `PATH`, then the SDK's optional native package next to the bundle (`bridge@5.0.3/src/claude-executable.ts#L22-L30`, `bridge@5.0.3/bundle/index.js#L73285-L73290`, `#L65805-L65806`). The Claude Code version on the seat is unknown, and that version decides everything marked "engine" below.
- `@earendil-works/pi-ai` resolves to the host Pi's pi-ai through Pi's extension alias (`pi-coding-agent@1.5.1/dist/core/extensions/loader.js#L73`). Model metadata therefore comes from pi-ai 1.5.1.
- "Legacy path" below means no companion account router is registered on `globalThis` (`bridge@5.0.3/src/account-router.ts#L76-L80`). Nothing in Limen's described setup installs one.

---

## 1. Request mapping

**Answer.** The bridge is a Pi provider (`streamSimple`). It starts **one Agent SDK `query()` per Pi user prompt**: each query spawns a Claude Code child, and the bridge closes the child when the query ends. Within that prompt, Pi's tool-result callbacks do not start new queries. Each one resolves the in-process MCP tool handler the child is blocked on, so the same Claude Code turn continues.

Continuity across Pi prompts uses Claude Code's own session files. The bridge keeps a record `{sessionId, cursor}` and passes `resume: <sessionId>` (CLI flag `--resume=`). There are two paths:
- **REUSE:** only the new trailing run of Pi user messages is sent as the prompt, and Claude Code loads the rest of the conversation from its session file.
- **REBUILD:** used when Pi's history has diverged. Triggers are a first turn that already has history, Pi compaction or tree navigation, an abort, an account change, or any non-user entry after the cursor (including a Pi 1.5.1 `system` transcript entry). The bridge deletes the Claude Code session JSONL, rewrites it from Pi's history through `cc-session-io`, and resumes it.

**System prompt.** The bridge uses Claude Code's `claude_code` preset with an `append`. It never replaces the preset, and **it does not forward Pi's system prompt**. The append contains only:
1. the nearest `AGENTS.override.md`, `AGENTS.md` or `AGENTS.MD`, found by walking up from the process cwd, re-headed `# CLAUDE.md`, with the word "pi" rewritten;
2. Pi's skills block, cut out of Pi's prompt;
3. opt-in blocks: `APPEND_SYSTEM.md` files and three recognised hook blocks, all off by default.

Text that Limen adds with `--append-system-prompt`, or through a hook that returns `systemPrompt`, therefore does not reach Claude Code.

**Custom messages.** Pi turns extension custom messages into `user` messages before the provider sees them. The bridge then handles them by position:
- a trailing run is joined into the prompt with `\n\n`;
- earlier ones become separate user records on a rebuild;
- ones that arrive while a query is running (steer or follow-up) are held until the Claude Code turn ends, then sent as a continuation `query()` with `resume`.

**Tools** are Pi's current tool set, exposed through an in-process MCP server (see §3).

Evidence:
- Preset and append: `systemPrompt: { type: "preset", preset: "claude_code", append: … }` (`bridge@5.0.3/src/query-options.ts#L167-L170`). The append is built from `[agentsAppend, skillsAppend, promptContextAppend.text]` (`#L109-L113`).
- Pi's prompt is read only as a source for those extracts: `getCurrentSystemPrompt(context.messages ?? [])` (`bridge@5.0.3/src/index.ts#L1086`). The skills block lies between the markers `"The following skills provide specialized instructions…"` and `</available_skills>` (`bridge@5.0.3/src/skills.ts#L8-L17`). The read-tool hint is rewritten to `mcp__custom-tools__read` (`#L19-L24`).
- AGENTS file: candidates `["AGENTS.override.md", "AGENTS.md", "AGENTS.MD"]` (`bridge@5.0.3/src/agents-md.ts#L41`). The search starts from `findAgentsMdInParents(process.cwd())` (`#L74-L80`) and walks up to the filesystem root (`#L82-L92`). The file is wrapped as `` `# CLAUDE.md\n\n${sanitized}` `` (`#L94-L101`), and `\bpi\b` becomes `environment` (`#L110-L117`).
- Opt-in blocks: `APPEND_SYSTEM.md`, `## Project Agents`, `Task workflow reminder:` and caveman (`bridge@5.0.3/src/prompt-context.ts#L97-L130`). All are off by default (`bridge@5.0.3/README.md#L64`).
- Pi side: `--append-system-prompt` is merged into Pi's own prompt (`pi-coding-agent@1.5.1/dist/core/resource-loader.js#L495-L505`, `pi-coding-agent@1.5.1/dist/cli/args.js#L75-L77`). A hook's `systemPrompt` becomes `currentOptions.forceSystemPrompt` (`pi-coding-agent@1.5.1/dist/core/extensions/runner.js#L1154-L1156`) and is projected as the leading system message (`pi-coding-agent@1.5.1/dist/core/agent-session.js#L1430-L1445`). Neither path feeds the bridge's append.
- One query per prompt: `sdkQueryFactory({ prompt, options: queryOptions })` (`bridge@5.0.3/src/index.ts#L1196`). Teardown calls `closeSdkQuery(sdkQuery)` (`#L1612-L1613`), and `close()` kills the CLI (`bridge@5.0.3/src/query-teardown.ts#L21-L27`).
- Tool results go to the blocked handler: `pending.resolve(result)` (`bridge@5.0.3/src/index.ts#L800-L808`). Handlers `return new Promise<McpResult>(…)` until Pi delivers (`#L442-L452`).
- Resume: `...(resumeSessionId ? { resume: resumeSessionId } : {})` (`bridge@5.0.3/src/query-options.ts#L178`), mapped to `` Y.push(`--resume=${w}`) `` (`bridge@5.0.3/bundle/index.js#L65558`). SDK doc: "Loads the conversation history from the specified session" (`agent-sdk@0.3.326/sdk.d.ts#L2256-L2259`).
- REUSE/REBUILD design: `bridge@5.0.3/src/session-persistence.ts#L519-L552`. REUSE requires the tail after the cursor (after one optional assistant message) to be all `user` (`#L447-L457`). `system` entries are dropped on conversion: "a first turn arrives as [system, user], and `system` entries are dropped" (`#L646-L653`). Rebuild runs `deleteSession` + `createSession` + `importMessages` + `save` (`#L671-L683`).
- The prompt is the trailing user run: `context.messages.slice(promptStart)` → `extractUserPrompt` (`bridge@5.0.3/src/index.ts#L1123-L1125`), joined with `"\n\n"` (`#L202-L207`). On rebuild each Pi user message is its own record (`bridge@5.0.3/src/convert.ts#L143-L148`).
- Custom → user, Pi side: `case "custom": … return { role: "user", content, … }` (`pi-coding-agent@1.5.1/dist/core/messages.js#L89-L96`). Run order is: system patch (if the prompt changed), then the user prompt, then next-turn messages, then hook custom messages (`pi-coding-agent@1.5.1/dist/core/agent-session.js#L1561-L1593`).
- Mid-query user messages are deferred and replayed: `ctx().deferredUserMessages.push(…)` (`bridge@5.0.3/src/index.ts#L874-L879`), then replayed with `const contOptions = { ...queryOptions, resume: resumeId, … }` (`#L1488-L1513`).
- Rebuild conversion: assistant text, thinking (kept only with a signature and only from pi-claude/anthropic), and `tool_use` (`bridge@5.0.3/src/convert.ts#L149-L169`). Other providers' turns get the prefix `[Prior Pi assistant response from …]` (`#L87-L95`). Tool results are grouped right after their `tool_use` (`#L176-L191`).
- Pi compaction or tree navigation forces a rebuild. A query still running is restarted with a bridge-authored notice `HISTORY_REPLACED_PROMPT` added as a user message (`bridge@5.0.3/src/index.ts#L590`, `#L612-L625`, `#L637-L661`, `#L1777-L1778`).
- Pi one-shots (compaction and branch summaries) are recognised by `options?.cacheRetention === "none"` (`bridge@5.0.3/src/index.ts#L669-L671`).
- The bridge's session marker is stored in the Pi session as custom entry `claude-bridge-session` (`bridge@5.0.3/src/session-persistence.ts#L20`, `#L301`), written on each pi-claude `message_end` (`bridge@5.0.3/src/index.ts#L1770-L1773`).

Open:
- Does each Limen turn reach the bridge with a mid-transcript `system` entry? Pi emits one whenever the prompt sections change (`pi-coding-agent@1.5.1/dist/core/agent-session.js#L1387-L1393`). If it does, every turn takes REBUILD instead of REUSE. Not settled by the sources. Experiment: run a job with `CLAUDE_BRIDGE_DEBUG=1` for three prompts and grep the bridge log (`<pi agent dir>/claude-bridge.log`) for `syncResult: path=`.

## 2. Prompt cache

**Answer.** The bridge sets no `cache_control`, no breakpoints, no TTL and no prompt-caching environment variables. A search of `src/` for `cache_control`, `ephemeral`, `ttl`, `1h` and `PROMPT_CACHING` finds no such setting. Pi's `cacheRetention` is read only as a marker for Pi one-shots and is never mapped to a TTL.

Caching is left entirely to Claude Code. The bridge forwards the whole Pi process environment, so any caching variable already set there reaches Claude Code unchanged.

What the bridge passes that shapes the cached prefix:
- **System prompt:** the preset plus an append rebuilt for every query from the cwd-ancestor AGENTS file (re-read each query), Pi's skills block and opt-in blocks. Limen's own per-turn prompt text is not in the append, so it cannot change it.
- **Tools:** Pi's current tools as MCP tools. These change when Pi's tool loadout changes.
- **Per-query flags:** `--effort` and, whenever an effort is set, `--thinking-display summarized`.
- **History:** REUSE resumes Claude Code's own transcript ("Keeps CC's prompt cache warm"). REBUILD rewrites that transcript from Pi history.
- **`DISABLE_AUTO_COMPACT=1`:** Claude Code never compacts. Pi compaction forces a rebuild.

Usage reported to Pi, per Pi assistant message:
- `usage.input` ← `input_tokens`
- `usage.output` ← `output_tokens`
- `usage.cacheRead` ← `cache_read_input_tokens`
- `usage.cacheWrite` ← `cache_creation_input_tokens`
- `usage.totalTokens` = the sum of all four

Usage is summed across the child API calls of one Pi turn. Cost is always 0. There is no 5m/1h split: the SDK result's `modelUsage` is not read.

Evidence:
- The only `cacheRetention` use is `return options?.cacheRetention === "none";` (`bridge@5.0.3/src/index.ts#L664-L671`).
- Child environment: `...(account ? subscriberProfileEnv(account) : process.env), ENABLE_CLAUDEAI_MCP_SERVERS: …, DISABLE_AUTO_COMPACT: "1"` (`bridge@5.0.3/src/query-options.ts#L148-L152`). Rationale: "Letting CC also autocompact would double-flush the prompt cache" (`#L141-L145`).
- At load the bridge sets `process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = "1"` on the Pi process (`bridge@5.0.3/src/index.ts#L1707`).
- REUSE: "Returns the existing sessionId. Keeps CC's prompt cache warm." (`bridge@5.0.3/src/session-persistence.ts#L529-L530`).
- Flags: `if (effort) extraArgs["thinking-display"] = "summarized";` (`bridge@5.0.3/src/query-options.ts#L135`). `if (this.options.effort) Y.push("--effort", …)` (`bridge@5.0.3/bundle/index.js#L65538`).
- Usage mapping: `if (usage.cache_read_input_tokens != null) current.cacheRead = …` and `cache_creation_input_tokens` → `cacheWrite` (`bridge@5.0.3/src/assistant-stream.ts#L19-L27`). Summed across child messages (`bridge@5.0.3/src/query-state.ts#L424-L438`, `#L457-L466`).
- Cost zeroed: `cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }` (`bridge@5.0.3/src/models.ts#L17-L20`).
- `result` handling reads only `subtype`, `result` and `errors` (`bridge@5.0.3/src/consume-query.ts#L154-L211`). It does not read `ModelUsage.cacheCreationEphemeral5mInputTokens` or `…1hInputTokens` (`agent-sdk@0.3.326/sdk.d.ts#L1556-L1576`).
- The bridge passes no `systemPrompt.snapshot` and no `excludeDynamicSections` (`bridge@5.0.3/src/query-options.ts#L167-L170`). The SDK documents that when `snapshot` is omitted, the first request's rendered prompt is recorded and reused on `resume`, and that the feature "is rolling out" (`agent-sdk@0.3.326/sdk.d.ts#L2562-L2589`).

Open:
- TTL (5m or 1h), breakpoint placement and cache scope are Claude Code's decisions. Not settled by the sources. Experiment: from a job worktree, with the job's environment, run `claude -p "ping" --model claude-opus-5-5 --output-format json` twice and compare `modelUsage["claude-opus-5-5"].cacheCreationEphemeral1hInputTokens` with `…5mInputTokens`.
- Does a REBUILD (rewritten JSONL) still hit the cache? Not settled. Experiment: with `CLAUDE_BRIDGE_DEBUG=1`, compare the `usage: … cacheRead=… cachePct=` debug line (`bridge@5.0.3/src/assistant-stream.ts#L29-L31`) on the turn right after `syncResult: path=rebuild` with a REUSE turn.
- Does the recorded system-prompt snapshot apply to the seat CLI, and survive a rebuild? Engine; not settled.

## 3. Tools

**Answer.** The bridge **disables Claude Code's built-ins and exposes Pi's tools instead**:
- Pi's current tools (replayed from the transcript's `system` entries) are registered on an in-process SDK MCP server named `custom-tools`. Claude sees them as `mcp__custom-tools__<piName>`.
- Query options:
  - `tools: []` (CLI `--tools ""`);
  - `disallowedTools`: the substituted built-ins (`Read`, `Write`, `Edit`, `MultiEdit`, `Glob`, `Grep`, `Bash`, `NotebookEdit`, `WebFetch`, `WebSearch`) plus an always-denied list (`Agent`, `Task`, `EnterWorktree`, `ExitWorktree`, `Cron*`, `Team*`, `TaskOutput`, `TaskStop`, `SendMessage`, `Skill`, `TodoRead`, `TodoWrite`, `ListMcpResources`, `ReadMcpResource`, `AskUserQuestion`, `EnterPlanMode`, `ExitPlanMode`, `ToolSearch`, `ScheduleWakeup`);
  - `allowedTools: ["mcp__custom-tools__*"]`;
  - `permissionMode: "bypassPermissions"`;
  - `strictMcpConfig: true`;
  - no `canUseTool`, and no SDK hooks while connectors are off.

How a call runs:
1. The bridge mirrors the `tool_use` into Pi's stream as a `toolCall` under the **Pi tool name** (prefix stripped) and ends the Pi turn with stop reason `toolUse`.
2. Pi runs the tool itself, so its own tool events and hooks fire.
3. The result goes back to the waiting handler.

A restricted Pi tool list (`--tools`, `--exclude-tools`, or runtime loadout changes) therefore reaches Claude Code exactly: the child sees only what Pi declares.

**Caveat (fail-soft).** This applies when Pi declares **zero** tools (for example `--no-tools`) and the request is not a Pi one-shot. The bridge then drops `tools: []` and the substituted denylist and keeps only the always-denied list. Claude Code's own `Read`, `Write`, `Edit`, `Bash`, `WebFetch`, `WebSearch` and so on become available, run inside Claude Code under `bypassPermissions`, and the bridge raises a one-time warning.

**Subagent tool.** Claude Code's `Agent` and `Task` are always denied. Claude Code's internal calls are never mirrored to Pi; this covers claude.ai connector tools, `ToolSearch`, `ScheduleWakeup` and foreign MCP names. Pi's `tool_call` event sees only Pi tool names, so a Pi-side subagent tool appears under its Pi name.

Evidence:
- Tool source: `for (const tool of getCurrentTools(context.messages ?? []))` with `` const sdkName = `${MCP_TOOL_PREFIX}${tool.name}` `` (`bridge@5.0.3/src/index.ts#L316-L343`). `getCurrentTools` replays `toolsAdded` and `toolsRemoved` of `system` entries (`pi-ai@1.5.1/dist/utils/transcript.js#L41-L52`).
- MCP server: `new McpServer({ name: MCP_SERVER_NAME, … })` and `{ type: "sdk", name: MCP_SERVER_NAME, instance }` (`bridge@5.0.3/src/index.ts#L455-L459`). `MCP_SERVER_NAME = "custom-tools"` (`bridge@5.0.3/src/skills.ts#L4-L5`).
- Lists: `bridge@5.0.3/src/connectors.ts#L18-L46`, including `tools: [] as string[]` and `` allowedTools: [`mcp__${MCP_SERVER_NAME}__*`] `` (`#L42-L46`).
- Options: `permissionMode: "bypassPermissions"` and `strictMcpConfig: true` (`bridge@5.0.3/src/query-options.ts#L157-L158`, `#L172`).
- CLI mapping in the bundled 0.3.261 SDK: `--allowedTools`, `--disallowedTools`, `--tools ""`, `--mcp-config`, `--strict-mcp-config` and `--permission-mode` (`bridge@5.0.3/bundle/index.js#L65560-L65568`).
- SDK docs: `allowedTools` means "auto-allowed without prompting… To restrict which tools are available, use the `tools` option" (`agent-sdk@0.3.326/sdk.d.ts#L1709-L1716`). `[]` means "Disable all built-in tools" (`#L1764-L1776`). Disallowed tools are "removed from the model's context" (`#L1731-L1736`).
- Fail-soft: `return applyBuiltinIsolation ? CLAUDE_BRIDGE_TOOL_ISOLATION : { disallowedTools: ALWAYS_DENIED_BUILTIN_TOOLS };` (`bridge@5.0.3/src/connectors.ts#L675-L677`), where `builtinIsolationApplied = bridgedToolsPresent || piOneShot === true || enableCloudMcp` (`bridge@5.0.3/src/query-options.ts#L93-L98`). The warning reads "…this session uses Claude Code's own file and shell tools instead" (`bridge@5.0.3/src/index.ts#L360-L372`, `#L1178`).
- Not mirrored: `isChildExecutedTool` → `return;` and `!isPiDispatchable` → suppressed (`bridge@5.0.3/src/assistant-stream.ts#L340-L353`). Mirrored calls use `mapToolName(…)` to build the `toolCall` block (`#L380-L388`). The prefix is stripped by `bridgedToolSuffix` (`bridge@5.0.3/src/tool-mapping.ts#L46-L59`).
- Argument mapping: `file_path→path` and `old_string→oldText` renames; Pi `bash` gets `timeout = 120` when none is given (`bridge@5.0.3/src/tool-mapping.ts#L63-L85`).
- Pi flags: `--no-tools`, `--tools` and `--exclude-tools` (`pi-coding-agent@1.5.1/dist/cli/args.js#L311-L317`).
- Schema conversion from JSON Schema to zod is lossy for unsupported shapes (`default: base = z.unknown()`) (`bridge@5.0.3/src/typebox-to-zod.ts#L9-L44`).

Open:
- Does the seat CLI still put any built-in or deferred-tool definitions into the model context despite `--tools ""`? Engine; not settled. Experiment: run one turn with `CLAUDE_BRIDGE_DEBUG=1` and read that query's CLI debug log under `<pi agent dir>/cc-cli-logs/` (`bridge@5.0.3/src/debug.ts#L118-L134`) for the tool list. The `tools` array of the SDK `system/init` message also shows it.

## 4. Settings and memory files

**Answer.** In the default configuration (connectors off, `appendSystemPrompt` on), the bridge **omits `settingSources`**. No `--setting-sources` flag is sent, so Claude Code's own default applies. The SDK documents that default (0.3.326): "When omitted, all sources are loaded (matches CLI defaults)", and "Must include 'project' to load CLAUDE.md files". By default Claude Code is therefore expected to load:
- user `~/.claude/settings.json`;
- project `.claude/settings.json`;
- local `.claude/settings.local.json`;
- CLAUDE.md files.

Other modes:
- `appendSystemPrompt: false` → `["user","project"]`.
- Connectors on → `["user"]`.
- An explicit `provider.settingSources` always wins.

MCP: with connectors off, `strictMcpConfig: true` is always passed, so only the bridge's `custom-tools` server loads. Per the SDK doc, strict mode ignores `.mcp.json`, MCP in user settings and plugin MCP. The bridge also pins `ENABLE_CLAUDEAI_MCP_SERVERS=0` in the child environment and in `--settings`.

Skills: the bridge passes no SDK `skills` option, so the CLI defaults apply, and it denies the `Skill` tool. Pi's skills list reaches the model only through the append.

Hooks: the bridge registers no SDK hooks while connectors are off. Whether filesystem hooks in the loaded settings files run is up to Claude Code.

The bridge also reads AGENTS files itself (§1). When no cwd-ancestor file exists, it falls back to the Pi agent directory's AGENTS file, and it skips that fallback only when `settingSources` explicitly includes `"user"`. With the default (omitted), the fallback is therefore applied even though the SDK says user settings load.

Evidence:
- `const settingSources = settingSourcesForQuery(enableCloudMcp, appendSystemPrompt, providerSettings.settingSources)` and `...(settingSources ? { settingSources } : {})` (`bridge@5.0.3/src/query-options.ts#L103-L108`, `#L174`).
- `if (connectorsEnabled) return configured ?? ["user"];` and `return configured ?? (appendSystemPrompt ? undefined : ["user", "project"]);` (`bridge@5.0.3/src/connectors.ts#L86-L95`). The bridge's own warning that project/local settings can inject `env` and `apiKeyHelper` is at `#L70-L85`.
- Bundled 0.3.261 SDK: `` if (U !== void 0) Y.push(`--setting-sources=${U.join(",")}`) `` (`bridge@5.0.3/bundle/index.js#L65566`).
- SDK doc: `'user'` = `~/.claude/settings.json`, `'project'` = `.claude/settings.json`, `'local'` = `.claude/settings.local.json`, "When omitted, all sources are loaded" (`agent-sdk@0.3.326/sdk.d.ts#L2445-L2455`).
- Strict MCP: `const strictMcpConfigEnabled = !enableCloudMcp || (…)` (`bridge@5.0.3/src/query-options.ts#L115-L118`). SDK: "ignoring all other MCP configurations: project `.mcp.json`, user settings, plugins…" (`agent-sdk@0.3.326/sdk.d.ts#L2497-L2504`).
- `settings: { env: { ENABLE_CLAUDEAI_MCP_SERVERS: "0" } }` is sent as `--settings`, which the bridge comment places above user/project/local (`bridge@5.0.3/src/query-options.ts#L160-L166`; README `#L54`).
- No hooks when connectors are off: `if (!connectorsEnabled) return isolation;` (`bridge@5.0.3/src/connectors.ts#L634-L636`).
- Skills option omitted: "omitted (default): no SDK auto-configuration. The CLI's own defaults still apply" (`agent-sdk@0.3.326/sdk.d.ts#L2456-L2462`).
- AGENTS fallback rule: `if (settingSources?.includes("user")) return undefined; return contextFileInDir(piUserDir());` (`bridge@5.0.3/src/agents-md.ts#L74-L80`). README: "Claude Code loads its own CLAUDE.md files" (`bridge@5.0.3/README.md#L44`).

Open:
- Does the seat CLI, driven by SDK 0.3.261 with no `--setting-sources`, really load user + project + local settings and CLAUDE.md, and does it run project hooks without a trust prompt? Engine; not settled. Experiment: in a scratch repository (not a real job), add a `CLAUDE.md` containing a unique harmless sentinel sentence, run one bridge turn and ask the model to quote its instructions. Repeat with a harmless `.claude/settings.json` hook that only writes a marker file.

## 5. Context window

**Answer.** The bridge registers pi-ai's Anthropic model list unchanged ("Pi owns model membership, ordering and metadata"). It re-homes each model under provider `pi-claude` with api `claude-bridge` and zeroes costs. For `claude-opus-5-5`, pi-ai 1.5.1 gives:
- `contextWindow: 1000000`
- `maxTokens: 128000`
- `reasoning: true`
- input text and image
- a `thinkingLevelMap` (§8)

Neither value is passed to Claude Code. The bridge sends no max-token, context or turn option, only `model: "claude-opus-5-5"`. Claude Code alone decides the effective window and output cap.

Usage reported to Pi comes from the SDK stream's `message_start`/`message_delta` usage and the completed assistant message, summed over the child API calls in one Pi turn. The fields are `input`, `output`, `cacheRead`, `cacheWrite` and `totalTokens` (the sum of the four), as listed in §2.

Evidence:
- `export const MODELS = buildModels(getModels("anthropic"));`, which copies `contextWindow` and `maxTokens` (`bridge@5.0.3/src/models.ts#L14-L23`).
- Re-homing: `({ ...model, api: "claude-bridge", baseUrl: "claude-bridge", provider: PROVIDER_ID })` (`bridge@5.0.3/src/native-provider.ts#L80`), registered through `createProvider` (`#L87-L104`).
- pi-ai 1.5.1 entry `chat:claude-opus-5-5`: `"contextWindow":1000000,"maxTokens":128000` (`pi-ai@1.5.1/dist/providers/data/anthropic.json#L1`, a single-line JSON file).
- Only `model: queryModel.id` is passed (`bridge@5.0.3/src/query-options.ts#L155`). A search of `src/` finds no `maxTokens`, `max_tokens` or `maxTurns` passed to the provider query; the only `maxTurns` is the account probe (`bridge@5.0.3/src/account-host.ts#L44`).
- Stop reason: `case "max_tokens": return "length";` (`bridge@5.0.3/src/assistant-stream.ts#L36-L42`).
- Usage: `bridge@5.0.3/src/assistant-stream.ts#L12-L28`, applied at `message_start` (`#L325-L327`) and `message_delta` (`#L465`).

Open:
- Claude Code's effective context window and output cap for `claude-opus-5-5` on this Max login. Engine; not settled. This matters because Claude Code auto-compaction is off and Pi plans compaction against 1M. Experiment: `claude -p "ping" --model claude-opus-5-5 --output-format json` from the job environment, then read `modelUsage["claude-opus-5-5"].contextWindow` and `.maxOutputTokens` (fields documented at `agent-sdk@0.3.326/sdk.d.ts#L1575-L1576`).

## 6. Limits and errors

**Answer (legacy path).** The bridge handles a subscription limit in four ways.

**1. A `rate_limit_event` with `status: "rejected"`.** The bridge emits a Pi event-bus event `kendex:rate-limit` and a UI warning, and does **not** fail the turn, because the SDK may still recover. The event payload is:
- `model`, `provider`;
- `rateLimitType`: the SDK value, for example `five_hour`, `seven_day` or `seven_day_opus`;
- `reason: "<type> rate limit"`;
- `resetAt`: the raw SDK `resetsAt`;
- `resetAtMs`: epoch ms, converted from SDK seconds by magnitude;
- `source: "claude-bridge"`, `status: "rejected"`.

This only happens while a Pi stream is live. `allowed_warning` at ≥80% utilisation produces only a UI warning.

**2. A terminal SDK `result` with a non-success subtype.** If the joined `errors` text matches the SDK's `USAGE_LIMIT_ERROR_PREFIXES` (for example `"You've hit your"`), the Pi message gets `stopReason: "error"` and `errorMessage` = that CLI text, and an `error` event is pushed at once. Other failures are surfaced the same way when the query completes. In the legacy path the CLI's synthetic limit text can also appear as assistant text content.

**3. SDK throws and aborts.** An SDK throw goes through the same `surfaceFailure` path. An abort gives `stopReason: "aborted"` with `errorMessage: "Operation aborted"`.

**4. A stalled stream.** After the idle watchdog's default 90 s with no output, the turn gets `stopReason: "error"`, an `errorMessage` framed as a "retryable 529 overloaded/rate limit condition", and the extra fields `rateLimitType: "stream_idle"`, `retryAfterMs: 60000` and `streamIdleTimeoutMs`.

**Structured reset time.** On the Pi assistant message, structured reset fields (`resetAtMs`, `rateLimitType`) are set **only** in the account-router path, plus the stream-idle fields. In the legacy path the reset time is carried only by the `kendex:rate-limit` event and the warning text.

Evidence (mapping code):
- Rejected event, legacy branch: `emitRateLimitEvent({ model: model.id, provider: model.provider, rateLimitType, reason, resetAt, ...(Number.isFinite(resetAtMs) ? { resetAtMs } : {}), source: "claude-bridge", status: "rejected" });` (`bridge@5.0.3/src/consume-query.ts#L271-L303`). Comment: "Legacy: notify once and set NO failure state" (`#L287-L290`). Guard: `if (!streamLive) break;` (`#L272`).
- Event bus: `extensionApi?.events?.emit?.(RATE_LIMIT_AUTO_RESUME_EVENT, payload)` (`bridge@5.0.3/src/consume-query.ts#L26-L32`), with `RATE_LIMIT_AUTO_RESUME_EVENT = "kendex:rate-limit"` (`bridge@5.0.3/src/rate-limit.ts#L3`). Pi's `ExtensionAPI.events: EventBus` (`pi-coding-agent@1.5.1/dist/core/extensions/types.d.ts#L1451`).
- Field extraction: `info?.rateLimitType ?? info?.rate_limit_type ?? info?.type` and `info?.resetsAt ?? info?.resets_at ?? …` (`bridge@5.0.3/src/account-router.ts#L199-L211`). Seconds→ms: `Math.abs(value) < 1e12 ? value * 1000 : value` (`bridge@5.0.3/src/rate-limit.ts#L47-L56`).
- SDK type: `status: 'allowed' | 'allowed_warning' | 'rejected'; resetsAt?: number; rateLimitType?: 'five_hour' | 'seven_day' | …` (`agent-sdk@0.3.326/sdk.d.ts#L6180-L6184`).
- Usage-limit result: `const usageLimit = isUsageLimitMessage(message);` then `queryCtx.turnOutput.stopReason = "error"; queryCtx.turnOutput.errorMessage = errors;` (`bridge@5.0.3/src/consume-query.ts#L185-L205`). Prefix match: `USAGE_LIMIT_PREFIXES.some((prefix) => text.includes(prefix))` (`bridge@5.0.3/src/rate-limit.ts#L23-L26`). Prefix list: `agent-sdk@0.3.326/sdk.d.ts#L10696` (the bundle carries its own 0.3.261 copy).
- Surfacing: `abortCtx.turnOutput.stopReason = aborted ? "aborted" : "error"; abortCtx.turnOutput.errorMessage = failure.message;` (`bridge@5.0.3/src/index.ts#L1401-L1405`). Completion path: `#L1449-L1462`. Throw path: `#L1571-L1605`.
- Router-only structured fields: `Object.assign(ctx().turnOutput …, { resetAtMs, rateLimitType })` (`bridge@5.0.3/src/index.ts#L1016-L1021`). In `surfaceFailure`, event and toast are emitted only `if (failure.rateLimitInfo)` (`#L1387-L1400`), and `rateLimitInfo` is set only on the router branch (`bridge@5.0.3/src/consume-query.ts#L280-L286`).
- Stream idle: `DEFAULT_STREAM_IDLE_TIMEOUT_MS = 90_000` and `STREAM_IDLE_BACKOFF_HINT_MS = 60_000` (`bridge@5.0.3/src/stream-idle-watchdog.ts#L4-L5`). The message text is at `#L66-L67`. Fields: `rateLimitType: "stream_idle", retryAfterMs: …, streamIdleTimeoutMs: timeoutMs` (`bridge@5.0.3/src/index.ts#L1339-L1346`). Configured by `CLAUDE_BRIDGE_STREAM_IDLE_TIMEOUT` (`bridge@5.0.3/README.md#L70`).
- Synthetic limit text rendered as assistant text and deduplicated: "a rejected turn's synthesized error message (\"You've hit your weekly limit\")" (`bridge@5.0.3/src/assistant-stream.ts#L642-L659`). The legacy branch renders assistant messages that carry `error` (`bridge@5.0.3/src/consume-query.ts#L145-L151`).
- No credentials: `"Claude account not connected — connect an account (or run \`claude login\`) and retry."` (`bridge@5.0.3/src/index.ts#L943-L953`).

Open:
- Does the seat CLI emit a `rate_limit_event` before the terminal result for the 5-hour and weekly limits, and what is the exact copy? Engine; not settled. Experiment: keep `CLAUDE_BRIDGE_DEBUG=1` on in jobs and add a Limen hook that logs `pi.events.on("kendex:rate-limit", …)` payloads. On the next real limit hit, grep the bridge log for `consumeQuery: rate_limit_event`.
- Whether Pi auto-retries the resulting error turn depends on pi-ai's text patterns (`pi-ai@1.5.1/dist/utils/retry.js#L29-L39`) matching the CLI copy. Not settled without the exact text; the same experiment settles it.

## 7. Authentication and environment

**Answer.** In the legacy path the child environment is the **entire Pi process environment** plus `ENABLE_CLAUDEAI_MCP_SERVERS=0` and `DISABLE_AUTO_COMPACT=1`. Any `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `CLAUDE_CODE_OAUTH_TOKEN` or `CLAUDE_CONFIG_DIR` present in the Pi process is forwarded. Scrubbing of credential and endpoint variables happens only for router-managed profiles.

Other environment changes:
- At extension load the bridge sets `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` on the Pi process itself, so every child inherits it.
- The bundled SDK adds `CLAUDE_CODE_ENTRYPOINT=sdk-ts` and `CLAUDE_AGENT_SDK_VERSION=0.3.261` and deletes `NODE_OPTIONS`.

Credentials: the bridge never reads credential contents. For model availability it only checks for the presence of credentials: auth environment variables, `<CLAUDE_CONFIG_DIR or ~/.claude>/.credentials.json`, or a non-empty `apiKeyHelper` in that directory's `settings.json`. Actual authentication (the Max login) is Claude Code's.

**Mechanisms that pull instructions, configuration or code from places a job can write.** These are described by mechanism only.
1. **AGENTS files in the cwd and its ancestors** (default on). The nearest `AGENTS.override.md`, `AGENTS.md` or `AGENTS.MD`, found by walking up from the process cwd to the filesystem root, is appended to Claude Code's system prompt. A file written in the worktree, or in any ancestor directory, becomes system-prompt text on the next query.
2. **Project bridge configuration under Pi project trust.** Limen passes `--approve`, which Pi documents as "Trust project-local files for this run". The bridge then reads the cwd's `.pi/settings.json` (package config) and `.pi/claude-bridge.json`. These can set bridge provider options, including `pathToClaudeCodeExecutable` (which program is spawned as Claude Code) and, through the legacy file's raw `provider` merge, `settingSources`, prompt-append switches and effort. Only the two connector keys are excluded.
3. **Claude Code's own project files.** With `settingSources` omitted, Claude Code is expected to load `.claude/settings.json`, `.claude/settings.local.json` and CLAUDE.md from the cwd (§4). The bridge's own comment names the risk: these files can carry an `env` map (for example an endpoint override) and an `apiKeyHelper`. Hooks configured there are executed by Claude Code (engine). `.mcp.json` servers are blocked by strict MCP.
4. **`~/.claude`** (user settings, hooks, CLAUDE.md, credentials) is loaded by Claude Code by default. A job can influence it only if the job can write the home directory or `CLAUDE_CONFIG_DIR` the seat uses.
5. **`PATH` lookup.** The bridge spawns the first executable `claude` or `claude-code` found on `PATH`. A relative `PATH` entry resolves against the process cwd (the worktree), and a job-writable `PATH` directory would also be searched.
6. **Optional and off by default:** `.pi/APPEND_SYSTEM.md` in the cwd's ancestors (only with `includeAppendSystemPromptMd`).
7. **Session state:** the bridge writes Claude Code JSONL transcripts into the Claude config directory's project folder for the cwd, and its marker into the Pi session file. The marker is restored only when the Pi session id, the cwd and a history fingerprint all match.
8. **No `node_modules` resolution from the cwd** was found. The SDK is inlined, the native-binary fallback resolves relative to the bundle file (`import.meta.url`), not the cwd, and pi-ai is aliased to the host Pi.

`CLAUDE_BRIDGE_ISOLATED=1` disables mechanisms 1, 2, 5 and 6. It does not change Claude Code's own `settingSources` default; only `provider.settingSources` in the user-scope `claude-bridge.json` does that.

Evidence:
- Environment: `bridge@5.0.3/src/query-options.ts#L148-L152`. Process mutation: `bridge@5.0.3/src/index.ts#L1707`.
- SDK environment handling: `rn = J ? { ...J } : { ...process.env }`, adding `CLAUDE_CODE_ENTRYPOINT` and `CLAUDE_AGENT_SDK_VERSION` (`bridge@5.0.3/bundle/index.js#L73291-L73293`), and `delete c.NODE_OPTIONS` (`#L65593`). SDK doc: `env` "REPLACES the subprocess environment entirely" (`agent-sdk@0.3.326/sdk.d.ts#L1777-L1795`).
- Scrubbing only in `subscriberProfileEnv` (managed profiles): it deletes `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, … (`bridge@5.0.3/src/account-router.ts#L93-L113`), and is used only `account ? subscriberProfileEnv(account) : process.env` (`bridge@5.0.3/src/query-options.ts#L149`).
- Presence-only checks: `bridge@5.0.3/src/auth-presence.ts#L93-L108` ("It NEVER opens or logs `.credentials.json`", `#L16-L21`).
- AGENTS walk: `bridge@5.0.3/src/agents-md.ts#L74-L92`.
- Trust and config: `--approve, -a  Trust project-local files for this run` (`pi-coding-agent@1.5.1/dist/cli/args.js#L334`). Project files are read only when trusted (`bridge@5.0.3/src/package-config.ts#L192-L195`, `#L364-L370`; `bridge@5.0.3/src/config.ts#L325-L334`). Project manager config is stripped only of connector keys (`bridge@5.0.3/src/config.ts#L150-L165`, `#L177`). `pathToClaudeCodeExecutable` is accepted from it (`#L282-L283`). The legacy file merges raw `provider` (`#L307-L316`).
- Executable: `if (trimmed) return trimmed; … return executableFromPath("claude") ?? executableFromPath("claude-code");` (`bridge@5.0.3/src/claude-executable.ts#L22-L30`). PATH walk: `join(dir, name)` for each entry (`#L8-L20`).
- Bridge warning about project settings: "would let a repo's checked-in `.claude/settings.json` / reintroduce exactly the provider-override env the bridge scrubs" (`bridge@5.0.3/src/connectors.ts#L75-L79`).
- Session files: `createSession({ projectPath: cwd, claudeDir, … })` with `claudeDir = scopeConfigDir ?? process.env.CLAUDE_CONFIG_DIR` (`bridge@5.0.3/src/session-persistence.ts#L568`, `#L675-L682`). Restore guard: `bridge@5.0.3/src/session-persistence.ts#L183-L196`, `#L198-L215`.
- Native binary fallback relative to the bundle: `let vn = nnt(import.meta.url), to = Qtt(vn), Yi = NK(…)` (`bridge@5.0.3/bundle/index.js#L73286-L73289`).
- Isolated mode: "Disables every cwd/home discovery fallback — all AGENTS.md discovery, … project `.pi/` settings + claude-bridge.json, project APPEND_SYSTEM.md, and the `$PATH` claude executable search" (`bridge@5.0.3/src/config.ts#L101-L113`).
- Debug logs (prompt descriptions, usage, CLI logs) are written only with `CLAUDE_BRIDGE_DEBUG=1` (`bridge@5.0.3/README.md#L71`, `bridge@5.0.3/src/debug.ts#L9-L10`).

Open:
- If both an API key in the environment and the Max login are present, which one Claude Code uses is engine-decided. Not settled. Experiment: in the job launcher, list only the variable names, `env | cut -d= -f1 | grep -E '^(ANTHROPIC|CLAUDE)_'`, and confirm that no key or endpoint variable is set for jobs.
- Whether project `.claude/settings.json` hooks and `env` apply in SDK mode without a trust prompt: same scratch-repository experiment as §4.

## 8. Effort and reasoning

**Answer.** Pi's `reasoning` level in the stream options is mapped in this order:
1. the model's own `thinkingLevelMap` from pi-ai;
2. if that gives no value, the bridge's fallback table `{ minimal: low, low: low, medium: medium, high: high, xhigh: max, max: max }`;
3. then overrides: `modelEffortOverrides` (per model id, `pi-claude/<id>` or `*`) beats `forceEffort`, which beats the mapped level.

For `claude-opus-5-5`, pi-ai 1.5.1 maps `low→low`, `medium→medium`, `high→high`, `xhigh→xhigh` and `max→max`. `off` and `minimal` map to `null`, so a received `minimal` falls through to the fallback `low`. When Pi sends no reasoning level, no effort is passed and Claude Code's default applies.

The result goes to the SDK `effort` option (CLI `--effort <level>`). The raw flag `--thinking-display summarized` is always added when an effort is set. No `thinking` or `maxThinkingTokens` option is passed. So `high` becomes `--effort high`, and `xhigh` becomes `--effort xhigh` (not `max`) for this model.

Evidence:
- Fallback table: `minimal: "low", low: "low", medium: "medium", high: "high", xhigh: "max", max: "max"` (`bridge@5.0.3/src/query-options.ts#L21-L23`).
- Model map first: `(queryModel as any).thinkingLevelMap?.[reasoning] … ?? REASONING_TO_EFFORT[reasoning]` (`bridge@5.0.3/src/query-options.ts#L119-L126`). Overrides: `#L30-L43`. Passed as `...(effort ? { effort } : {})` (`#L173`).
- Display flag: `if (effort) extraArgs["thinking-display"] = "summarized";`. The comment explains the typed `thinking` option is avoided because it "also emits `--thinking adaptive` or `--max-thinking-tokens`" (`bridge@5.0.3/src/query-options.ts#L128-L135`).
- Bundled 0.3.261 SDK: `if (this.options.effort) Y.push("--effort", this.options.effort);` (`bridge@5.0.3/bundle/index.js#L65538`). The `thinking` flags are emitted only when `thinkingConfig` is set (`#L65523-L65537`), and the bridge never sets it.
- pi-ai 1.5.1 `chat:claude-opus-5-5`: `"thinkingLevelMap":{"off":null,"minimal":null,"low":"low","medium":"medium","high":"high","xhigh":"xhigh","max":"max"}` (`pi-ai@1.5.1/dist/providers/data/anthropic.json#L1`). The map is carried onto the bridge model (`bridge@5.0.3/src/models.ts#L17-L18`).
- Pi's `reasoning` values: `"high" | "low" | "max" | "medium" | "minimal" | "xhigh"` (`pi-ai@1.5.1/dist/providers/model-schema.d.ts#L7`; `pi-ai@1.5.1/dist/types.d.ts#L240-L243`).
- SDK: `EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max'` (`agent-sdk@0.3.326/sdk.d.ts#L755`, `#L2040-L2046`).

Open:
- Which effort Claude Code uses when the bridge passes none, and whether the seat CLI accepts `xhigh` for this model. Engine; not settled. Experiment: one turn at each Pi level with `CLAUDE_BRIDGE_DEBUG=1`, then read the `effort=` field of the bridge's `provider: fresh query` debug line (`bridge@5.0.3/src/index.ts#L1180-L1186`) and the per-query CLI debug log.

## 9. Compaction and the resumed session

**Answer.** Every Pi compaction path writes the compaction entry, rebuilds Pi's context and emits `session_compact` before the next model call. The bridge listens to that event (and to `session_tree`). What it does depends on whether one of its queries is still running.

**No bridge query running.** This covers compaction before a new prompt, after a run, overflow compaction, and manual `/compact` (which aborts the run first). The bridge only marks its session record `needsRebuild`, so the next query takes the REBUILD path and rewrites the session in place under the same session id.

**A bridge query running.** This is compaction between turns inside a run, while Claude Code is blocked waiting for Pi's tool results. The bridge marks that query stale and the record `needsRebuild` + `forceRotate`. On Pi's next provider call it kills the child and restarts. The replacement call contains, in order:
- Pi's post-compaction messages;
- the user request(s) the killed query was answering, re-sent unless they sit in Pi's trailing user run (they can therefore appear twice if Pi's kept range still holds them);
- Pi's trailing user run;
- the bridge's notice `HISTORY_REPLACED_PROMPT` as a final user message.

That call goes through REBUILD under a **new** session id. The bridge refuses to restart only when the child ran calls Pi cannot see (connectors or foreign MCP), which strict MCP with connectors off rules out.

**What the rewritten Claude Code session contains.** It is the conversion of Pi's post-compaction messages before the trailing user run. After a compaction, Pi's projection is `[compaction's system snapshot, compaction summary, kept entries from firstKeptEntryId (system entries skipped), entries after the compaction]`.
- The system snapshot is dropped, because the bridge drops every `system` message.
- The summary arrives as a `user` message, `"The conversation history before this point was compacted into the following summary: <summary>…</summary>"`, and becomes one user record.
- Kept entries are imported as in §1.
- The old JSONL, including anything Claude Code itself recorded in it, is deleted. `cc-session-io` writes only user and assistant records.

**Which event to use.** `session_compact` is the right hook. It is awaited, it fires after the compaction entry exists and Pi's context has been rebuilt, and in every path it fires before the next model call. `session_before_compact` fires before the compaction exists: the cut point has already been computed, and most messages sent then are only queued.

**Which `sendMessage` options.** Every automatic trigger runs while Pi counts the run as active (`isStreaming`), so the right option depends on where the trigger sits:

| Pi trigger | `reason` / `willRetry` | Next model call | default (`steer`) | `triggerTurn: false` | `deliverAs: "nextTurn"` |
|---|---|---|---|---|---|
| Before a new prompt | threshold or overflow / any | first request of the new run | lands, after the prompt | lands, before the prompt | lands, after the prompt |
| Between turns inside a run | threshold / false | next request of the same run | **lands** | one request late | late (next user prompt) |
| After a run (threshold, or overflow with a completed reply) | threshold or overflow / false | next user prompt | **starts an extra turn** | **lands** (appended when the run ends) | lands |
| Overflow, retry the failed turn | overflow / true | the retry request | **lands** | late | late |
| Manual `/compact` | manual / false | next user prompt | appended at once, no turn | appended at once | lands |

No single option fits every row, and the "after a run" and "between turns" rows carry identical event fields. A hook must therefore track the agent lifecycle. Use `triggerTurn: false` when `agent_end` has fired for the current run and `agent_settled` has not, unless `willRetry` is true. Otherwise use the default steer. A plain call during manual `/compact` appends the message at once.

In none of these rows does the bridge hold the message until a Claude Code turn ends. That deferral applies only to user messages arriving during a running query that is *not* being restarted, and the restart check runs first.

**Can the message survive compaction instead?** Not simply:
- A `session_before_compact` handler may return its own `{ compaction: { summary, firstKeptEntryId, … } }`. Pi, however, keeps one contiguous range from `firstKeptEntryId` to the compaction entry. Keeping a session-start message therefore means keeping everything after it, which is no compaction at all.
- The only other carrier is the summary text. The hook would have to generate the summary itself (Pi exports `compact` and `generateSummary`) and prepend the context. Claude would then receive it inside the `<summary>` wrapper as one user record, and the next compaction feeds that summary back to the model as `<previous-summary>` to be rewritten.
- Re-sending after `session_compact` is simpler.
- A `context`-event injection is not a substitute with this bridge either. On REUSE only the trailing user run is sent, so content injected earlier in the array reaches Claude only on a REBUILD.

**Does Claude Code compact on its own?**
- The bridge sets `DISABLE_AUTO_COMPACT=1` and never sends `/compact`.
- Other possible paths are engine-side and not settled by the sources: `autoCompactEnabled` or `autoCompactWindow` in settings files Claude Code loads (precedence against the env var is unknown), a user text that Claude Code parses as its `/compact` command (see §10), or reactive compaction on an over-long request.
- The bridge would not notice any of these. A Claude Code compaction leaves Pi's history full, but the bridge's REUSE path keeps resuming Claude Code's compacted session.

Evidence:
- Bridge listeners: `pi.on("session_compact", … onPiHistoryReplaced("session_compact"))` (`bridge@5.0.3/src/index.ts#L1777-L1778`).
- Running versus idle: `const running = queryCtx.activeQuery !== null;` → `queryCtx.piHistoryReplaced = true`, then `markSessionForRebuild({ forceRotate: restarts })` (`bridge@5.0.3/src/index.ts#L645-L661`). `markSessionForRebuild` sets `needsRebuild: true` (`bridge@5.0.3/src/bridge-state.ts#L142-L146`). Rebuild in place unless `forceRotate`: `const preserveId = previousSessionId !== undefined && !sharedSession?.forceRotate;` (`bridge@5.0.3/src/session-persistence.ts#L670`).
- Restart on the next callback: `queryCtx.restartRequest = { model, context, options, stream }; … abortSdkQuery(queryCtx.activeQuery);` (`bridge@5.0.3/src/index.ts#L742-L779`). The refusal for child-side calls is at `#L761-L767`. Re-entry after teardown is at `#L1617-L1645`.
- Replacement context: `messages: [...piMessages.slice(0, runStart), ...request, { role: "user", content: HISTORY_REPLACED_PROMPT, … }]`, where `request` is pending messages not held by the trailing run, followed by the trailing run (`bridge@5.0.3/src/index.ts#L612-L625`). Notice text: `#L590`.
- The foreign-conversation guard is skipped when `needsRebuild` is set, so a moved first message after compaction does not turn into a historyless one-shot (`bridge@5.0.3/src/session-persistence.ts#L599-L604`).
- Pi triggers:
  - before prompt: `await this._checkCompaction(lastAssistant, false);` (`pi-coding-agent@1.5.1/dist/core/agent-session.js#L1547-L1550`);
  - after a run: `if (await this._checkCompaction(message))` (`#L1623-L1624`);
  - between turns: `const context = await this._compactBeforeNextAssistantResponse(turn.context);` (`#L594-L595`), which calls `_runAutoCompaction("threshold", false)` (`#L478-L487`);
  - overflow and threshold dispatch: `#L2534-L2569`, `#L2602-L2603`;
  - manual: `await this.abort();` first (`#L2326-L2329`), and `abort()` waits for idle (`#L2073-L2084`).
- Event order: `appendCompaction(…)` → `_refreshFinalizedContext()` → `await this._extensionRunner.emit({ type: "session_compact", … })` → `compaction_end` (`pi-coding-agent@1.5.1/dist/core/agent-session.js#L2682-L2705`; manual `#L2393-L2424`). After an auto compaction: `if (willRetry) return true; … return this.agent.hasQueuedMessages();` (`#L2706-L2710`). Event fields: `reason: "manual" | "threshold" | "overflow"` and `willRetry` (`pi-coding-agent@1.5.1/dist/core/extensions/types.d.ts#L633-L641`).
- `sendMessage` options: `triggerTurn?: boolean; deliverAs?: "steer" | "followUp" | "nextTurn"` (`pi-coding-agent@1.5.1/dist/core/extensions/types.d.ts#L350-L353`). Dispatch:
  - `nextTurn` → `_pendingNextTurnMessages`;
  - streaming + `triggerTurn !== false` → `agent.steer` or `followUp`;
  - streaming + `triggerTurn: false` → `_pendingCustomMessages`;
  - idle → appended at once (`pi-coding-agent@1.5.1/dist/core/agent-session.js#L1946-L1984`).
  - `isStreaming` returns `this._isAgentRunActive` (`#L1127-L1129`), which is set at run start (`#L1487-L1488`) and cleared in the run's `finally` (`#L1528-L1535`).
- Queue drain points:
  - pending custom messages are flushed at `turn_end` (`pi-coding-agent@1.5.1/dist/core/agent-session.js#L849-L856`), before `agent.prompt` (`#L1501-L1504`) and at run end (`#L1533-L1534`);
  - next-turn messages are consumed in `_prepareRun` after its compaction check (`#L1575-L1577`);
  - steering is polled at loop start (`pi-agent-core@1.5.1/dist/agent-loop.js#L89-L90`), again after `prepareNextTurn` ("Pick up steering queued while it ran", `#L112-L117`), and pushed before the request (`#L120-L127`). The re-poll runs only if the `turn_end` poll (`#L191`) returned nothing. So if another steer was already queued at that boundary, the context message moves one turn later;
  - `continue()` from an assistant tail turns queued steering into a new run (`pi-agent-core@1.5.1/dist/agent.js#L262-L267`), which is the extra turn;
  - queued custom messages are persisted at `message_end` (`pi-coding-agent@1.5.1/dist/core/agent-session.js#L814-L820`), and each request is built from the session projection (`#L494-L500`).
- Lifecycle markers: `agent_start` and `agent_end` (`pi-coding-agent@1.5.1/dist/core/extensions/types.d.ts#L764-L771`), and `agent_settled` "after an agent run has fully settled" (`#L820-L825`). `agent_end` is emitted at loop end (`pi-agent-core@1.5.1/dist/agent-loop.js#L212`), before Pi's post-run compaction check (`pi-coding-agent@1.5.1/dist/core/agent-session.js#L1513-L1515`).
- Post-compaction projection: a compaction entry becomes `[entry.systemMessage, summary]` (`pi-coding-agent@1.5.1/dist/core/session-manager.js#L187-L190`). The kept range runs contiguously from `firstKeptEntryId` and skips system entries (`#L216-L227`). Summary → user: `case "compactionSummary": return { role: "user", … COMPACTION_SUMMARY_PREFIX + m.summary + … }` (`pi-coding-agent@1.5.1/dist/core/messages.js#L103-L110`). The prefix text is at `#L7-L12`.
- Bridge conversion has no branch for `system`, so those messages are dropped (`bridge@5.0.3/src/convert.ts#L141-L202`). The comment states "`system` entries are dropped by convertPiMessages" (`bridge@5.0.3/src/session-persistence.ts#L646-L653`). `cc-session-io` writes only `type: "user"` and `type: "assistant"` records (`bridge@5.0.3/bundle/index.js#L39727-L39763`), and `deleteSession` removes the JSONL plus its companion directory (`#L39869-L39878`).
- Custom compaction: `SessionBeforeCompactResult { cancel?; compaction?: CompactionResult }` (`pi-coding-agent@1.5.1/dist/core/extensions/types.d.ts#L1157-L1160`), whose fields are `summary` and `firstKeptEntryId: string` (`pi-coding-agent@1.5.1/dist/core/compaction/compaction.d.ts#L18-L27`). Pi exports `compact` and `generateSummary` (`pi-coding-agent@1.5.1/dist/index.d.ts#L6`). The previous summary is fed back as `<previous-summary>` (`pi-coding-agent@1.5.1/dist/core/compaction/compaction.js#L517-L530`).
- Pi's summary request also goes through the bridge, as a one-shot: `cacheRetention: "none", sessionId: options.sessionId ?? uuidv7()` (`pi-coding-agent@1.5.1/dist/core/compaction/compaction.js#L477-L484`), run by the bridge in its own lane with no tools (`bridge@5.0.3/src/index.ts#L684-L689`; `bridge@5.0.3/src/query-options.ts#L93-L98`). Its `SUMMARIZATION_SYSTEM_PROMPT` (`compaction.js#L500-L508`) is not forwarded (§1); the instructions that sit in the user text are.
- Auto threshold: `contextTokens > contextWindow - settings.reserveTokens`, with defaults `reserveTokens: 16384` and `keepRecentTokens: 20000` (`pi-coding-agent@1.5.1/dist/core/compaction/compaction.js#L53-L57`, `#L173-L177`). Against the registered 1,000,000 window this fires near 983,616 tokens, which assumes Claude Code really has 1M (§5).
- Claude Code compaction: `DISABLE_AUTO_COMPACT: "1"` and "Manual /compact in CC still works (we never invoke it)" (`bridge@5.0.3/src/query-options.ts#L141-L152`). The bridge's `system` case handles only `init` and `model_refusal_fallback` (`bridge@5.0.3/src/consume-query.ts#L212-L262`), so `compact_boundary` (`agent-sdk@0.3.326/sdk.d.ts#L4032-L4038`) is ignored. Settings keys: `autoCompactEnabled` (`agent-sdk@0.3.326/sdk.d.ts#L10040-L10043`) and `autoCompactWindow` (`#L9800-L9802`).

Open:
- End-to-end ordering on the seat (the table above is derived from code). Experiment: a scratch session with `CLAUDE_BRIDGE_DEBUG=1` and a Pi `compaction.reserveTokens` setting large enough to force auto compaction. Run one manual `/compact` and one auto compaction during a tool loop, then grep the bridge log for `session_compact: marking needsRebuild`, `restarting query on replaced history` and `syncResult: path=rebuild`, and check that the context message appears in the next Claude Code JSONL user record.
- Whether Claude Code ever compacts on its own despite `DISABLE_AUTO_COMPACT=1`. Not settled. Experiment: after a long job, grep that job's Claude Code session JSONL (Claude config directory, `projects/<cwd>/`) for `compact_boundary`.

## 10. Message integrity

**Answer.** The bridge passes Pi user-message text through **verbatim**: no truncation, no length cap, no escaping and no rewriting. Markdown and XML-like tags are untouched. The bridge does have rewrites, but none of them touch user text:
- the AGENTS file's `pi`→`environment` and `.pi`→`.claude`;
- the skills block's read-tool hint;
- tool names (`mcp__custom-tools__` prefix) and tool argument keys;
- XML escaping inside the opt-in prompt-context blocks only.

Pi itself turns a string custom message into one text block.

**REUSE, text-only run.** Content changes shape, not text. Each message is flattened: its text blocks are joined with `"\n"`, a non-text, non-image block becomes `"[type]"`, and a message with no text block contributes `""`. The messages are then joined **in Pi order with `"\n\n"`**, and the SDK sends that string as one text block of one user message. Two consecutive custom messages A and B become `A + "\n\n" + B`; with the user prompt after them, `A\n\nB\n\nPrompt`. Nothing is trimmed (the text is only tested for emptiness), and an entirely empty prompt is replaced by `"[continue]"`.

**REUSE, run containing an image.** The bridge sends a content-block array instead: every non-empty text block stays its own block, images are base64 blocks, and a `{type:"text", text:"\n\n"}` block separates messages. Other block types are dropped.

**REBUILD.** **Each Pi user or custom message is its own record.** String content is kept as-is (`"[empty]"` if empty). For array content, non-empty text and image blocks are kept unjoined, other types are dropped, and `"[image]"` stands in when nothing remains. `cc-session-io` stores string content unchanged. For array content it moves `tool_result` blocks into a separate record and puts the remaining blocks in one user record. It serialises with `JSON.stringify`, and its pairing repair only touches messages next to an unpaired `tool_use`.

Deferred steers use the same join, and the restart notice is joined on as one more `"\n\n"` part.

**Size.** The bridge has no limit. pi-ai's model metadata carries `maxRequestBytes: 33554432`, but the bridge never consults it. A Claude Code CLI or SDK limit on one prompt is not settled by the sources. How Claude Code itself treats the text is also engine-side, for example whether a leading `/` is parsed as a slash command and what context Claude Code adds around the turn.

Evidence:
- Pi: `case "custom": { const content = typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content; return { role: "user", … } }` (`pi-coding-agent@1.5.1/dist/core/messages.js#L89-L96`).
- REUSE string path: `messages.map((message) => typeof message.content === "string" ? message.content : messageContentToText(message.content) || "").join("\n\n")` (`bridge@5.0.3/src/index.ts#L202-L207`). Flattening: `parts.push(block.text)` / `` parts.push(`[${block.type}]`) `` / `return hasText ? parts.join("\n") : ""` (`bridge@5.0.3/src/convert.ts#L47-L59`).
- REUSE block path: `if (messageIndex > 0) blocks.push({ type: "text", text: "\n\n" });`, with text blocks kept and images as base64 (`bridge@5.0.3/src/index.ts#L212-L247`), sent through `wrapPromptStream` (`#L284-L290`) when there are images (`#L1158-L1160`).
- SDK send: a string prompt is written as `{ type: "user", … message: { role: "user", content: [{ type: "text", text: n }] } }` (`bridge@5.0.3/bundle/index.js#L73344`), over `--input-format stream-json` (`#L65522`).
- Empty-only substitution: `promptText = "[continue]"` (`bridge@5.0.3/src/index.ts#L1138-L1156`). Deferred replay keeps the untrimmed text: `prompt: prompt?.trim() ? prompt : null` (`#L276-L281`).
- REBUILD: "Rebuild imports each pi user message as its OWN record" (`bridge@5.0.3/src/convert.ts#L143-L148`), using `userMessageToAnthropic` (`#L97-L109`).
- `cc-session-io`: `if (typeof msg.content === "string") { this.addUserMessage(msg.content); }`, and otherwise `tool_result` blocks go to `addToolResults` and the rest to `addUserMessage(rest)` (`bridge@5.0.3/bundle/index.js#L39811-L39838`). Serialisation is `JSON.stringify(record2)` (`#L39489-L39491`). Repair touches only messages after an assistant with unpaired `tool_use` ids (`#L39517-L39576`). The bridge inserts its own placeholders first (`bridge@5.0.3/src/session-persistence.ts#L363-L370`).
- Rewrites live elsewhere: AGENTS (`bridge@5.0.3/src/agents-md.ts#L110-L117`), skills hint (`bridge@5.0.3/src/skills.ts#L19-L24`), tool names and keys (`bridge@5.0.3/src/tool-mapping.ts#L46-L85`), escaping only in opt-in blocks (`bridge@5.0.3/src/prompt-context.ts#L147-L168`).
- Size metadata: `"maxRequestBytes":33554432` in the `chat:claude-opus-5-5` entry (`pi-ai@1.5.1/dist/providers/data/anthropic.json#L1`). The bridge's model re-homing (`bridge@5.0.3/src/native-provider.ts#L80`) does not use it.

Open:
- The end-to-end size limit and verbatim delivery. Not settled. Experiment: in a scratch session, send one custom message of about 100 KB of Markdown with unique sentinels at its start, middle and end plus XML-like tags. Ask the model to quote the three sentinels, then compare the text of the Claude Code JSONL user record with the Pi session entry.
- Slash-command parsing of a leading `/`. Engine; not settled. Same scratch session: send a message whose first line starts with `/` and check the CLI debug log (`CLAUDE_BRIDGE_DEBUG=1`) for command handling. Until then, Limen's context message should not start with `/`.

---

## Summary

| Question | Answer (≤ 15 words) | Settled |
|---|---|---|
| 1. Request mapping | One `query()` per prompt, resumed session; preset append; Pi prompt not forwarded; custom→user. | yes |
| 2. Prompt cache | No cache settings in bridge; Claude Code decides; reports `cacheRead`/`cacheWrite` from stream usage. | partly |
| 3. Tools | Built-ins off; Pi tools via MCP `custom-tools`; `Agent`/`Task` denied; zero Pi tools re-enables built-ins. | yes |
| 4. Settings/memory | `settingSources` omitted by default (SDK doc: all sources); strict MCP; no SDK hooks. | partly |
| 5. Context window | Registers pi-ai values 1,000,000 / 128,000; neither passed to Claude Code. | partly |
| 6. Limits/errors | `stopReason "error"` + CLI text; reset time only on `kendex:rate-limit` event (legacy). | partly |
| 7. Auth/env | Whole `process.env` forwarded; cwd AGENTS, trusted `.pi` config, Claude Code project settings. | partly |
| 8. Effort | Model map then fallback; `xhigh→xhigh` for Opus 5.5; `--effort` plus summarized display. | yes |
| 9. Compaction | REBUILD (mid-run: restart, notice, new id); re-send on `session_compact`, option per trigger. | partly |
| 10. Message integrity | User text verbatim, no cap; REUSE joins run with `"\n\n"`; REBUILD per-message records. | partly |
