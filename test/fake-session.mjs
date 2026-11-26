// The Pi session of the fake engine (test/fake-engine.mjs): its entries as Pi 1.5.1's session manager writes them, one
// JSON line each in the transcript below --session-dir (`core/session-manager.d.ts`: a `session` header when the file
// is new, then `message`, `custom_message` and `compaction` entries), and the conversation they hold, compaction-aware
// as Pi's `buildContextEntries` gives it (`core/session-manager.js:201-229`). A continuation opens the copied file and
// reads its entries back, so its first call holds the parent's conversation, as Pi's `--continue` does.
import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";

/** A Pi `Usage` of no tokens: the fake answers without a model. */
const NO_USAGE = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

export class FakeSession {
	/**
	 * The session of `file` (undefined: kept in memory only, as without --session-dir), named `id` in a new file's header,
	 * whose assistant messages carry the route `provider` and `model`.
	 */
	constructor({ file, id, cwd, provider, model }) {
		this.file = file;
		this.provider = provider;
		this.model = model;
		this.entries = [];
		if (file && existsSync(file)) {
			this.entries = readFileSync(file, "utf8")
				.split("\n")
				.filter((line) => line.trim())
				.map((line) => JSON.parse(line))
				.filter((entry) => entry.type !== "session");
		} else {
			this.write({ type: "session", version: 3, id, timestamp: new Date().toISOString(), cwd });
		}
	}

	/** The conversation of the next model call in Pi's form: the latest compaction's summary, its kept entries, then the rest. */
	messages() {
		return this.buildContextEntries().flatMap(messageOf);
	}

	/**
	 * The active, compaction-aware entries, as Pi's `buildContextEntries` gives them (`core/session-manager.js:201-229`):
	 * the latest compaction, the entries it kept, then every entry after it; every entry when there is none.
	 */
	buildContextEntries() {
		const compaction = this.entries.findLast((entry) => entry.type === "compaction");
		return [...(compaction ? [compaction] : []), ...this.contextEntries()];
	}

	/** Appends `message` as Pi persists it at its `message_end`: a custom message as its own entry type. */
	append(message) {
		if (message.role === "custom") {
			const { customType, content, display, details } = message;
			this.add({ type: "custom_message", customType, content, display, ...(details === undefined ? {} : { details }) });
		} else {
			this.add({ type: "message", message });
		}
	}

	/** An assistant message of this session's route: a text reply, or one tool call. */
	assistant(content, stopReason, errorMessage) {
		const { provider, model } = this;
		const error = errorMessage === undefined ? {} : { errorMessage };
		return {
			role: "assistant",
			content,
			api: "fake",
			provider,
			model,
			usage: NO_USAGE,
			stopReason,
			...error,
			timestamp: Date.now(),
		};
	}

	/**
	 * Writes a compaction entry with `summary` and returns it. It keeps the entries from the session's last assistant
	 * message on, a cut Pi makes inside a turn, with that message's tool results after it
	 * (`core/compaction/compaction.js:318-334`), or none when there is no such message, so that what came before, the
	 * turn's user message included, is in the summary alone.
	 */
	compact(summary) {
		const context = this.contextEntries();
		const last = context.findLast((entry) => entry.type === "message" && entry.message.role === "assistant");
		const id = this.newId();
		return this.add({ type: "compaction", summary, firstKeptEntryId: last?.id ?? id, tokensBefore: 0 }, id);
	}

	/** The entries of the conversation, compaction-aware, without the compaction itself. */
	contextEntries() {
		const compaction = this.entries.findLast((entry) => entry.type === "compaction");
		const at = this.entries.indexOf(compaction);
		if (at < 0) {
			return this.entries;
		}
		const first = this.entries.slice(0, at).findIndex((entry) => entry.id === compaction.firstKeptEntryId);
		return [...(first < 0 ? [] : this.entries.slice(first, at)), ...this.entries.slice(at + 1)];
	}

	/** Appends an entry of `fields` after the last one, with its id and the time, as Pi's `_appendEntry` does. */
	add(fields, id = this.newId()) {
		const { type, ...rest } = fields;
		const parentId = this.entries.at(-1)?.id ?? null;
		const entry = { type, id, parentId, timestamp: new Date().toISOString(), ...rest };
		this.entries.push(entry);
		this.write(entry);
		return entry;
	}

	write(entry) {
		if (this.file) {
			appendFileSync(this.file, `${JSON.stringify(entry)}\n`);
		}
	}

	/** An id of 8 hex characters no entry holds, as Pi's `generateId` makes one (`core/session-manager.js:21-29`). */
	newId() {
		for (;;) {
			const id = randomUUID().slice(0, 8);
			if (!this.entries.some((entry) => entry.id === id)) {
				return id;
			}
		}
	}
}

/**
 * The messages one entry adds to the conversation (`core/session-manager.js:165-191`): a message as it is, a custom
 * message of role `custom`, a compaction as Pi's summary message; the header and other entries add none.
 */
function messageOf(entry) {
	if (entry.type === "message") {
		return [entry.message];
	}
	if (entry.type === "custom_message") {
		const { customType, content, display, details } = entry;
		return [{ role: "custom", customType, content, display, details, timestamp: Date.parse(entry.timestamp) }];
	}
	if (entry.type === "compaction") {
		const { summary, tokensBefore } = entry;
		return [{ role: "compactionSummary", summary, tokensBefore, timestamp: Date.parse(entry.timestamp) }];
	}
	return [];
}
