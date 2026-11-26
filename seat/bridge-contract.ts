/**
 * The bridge contract of T-31 (2) on the seat (D-119): the first user record of the Claude Code session file that the
 * bridge writes for a new session, against the prompt that src/runtime/bridge-view.ts declares for the first model
 * call of the Pi session of the same run, read through src/job/usage.ts. Both sides come from one run, so the
 * comparison needs no rule for ids, times or paths, and the fake engine cannot drift from what is compared. A line of
 * either file that it cannot read ends it with BAD_DATA, never a pass. Plan step 4.1 runs it; no seat path is here.
 *
 *   node seat/bridge-contract.ts <pi session file> <claude code session file>
 */
import { existsSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { arrayOf, at, either, object, optional, parseJson, string } from "../src/boundary.ts";
import { firstCallOf } from "../src/job/usage.ts";
import { LimenError } from "../src/outcome.ts";
import { bridgeView } from "../src/runtime/bridge-view.ts";
import { counted, printable, requiredText, SeatFailure, type SeatOutcome } from "./tool-outcome.ts";

const USAGE = "node seat/bridge-contract.ts <pi session file> <claude code session file>";
/** The record types whose `message.content` the contract reads: the two that the bridge's `cc-session-io` writes. */
const MESSAGE_TYPES = ["user", "assistant"];
/** How many bytes of each side a mismatch shows from the first one that differs. */
const EXCERPT_BYTES = 60;

/** What the contract needs: its two arguments, the Pi session file and the Claude Code session file. */
export type ContractInput = { readonly args: readonly string[] };
/** One record of the Claude Code session file: its type, and the text of a user or assistant record's content. */
type CodeRecord = { readonly type: string; readonly text?: string };

/** The contract's exit code and its text; only the entry point sets the code. */
export async function runBridgeContract(input: ContractInput): Promise<SeatOutcome> {
	try {
		return { code: 0, stdout: `${printable(await compare(input), "escape")}\n`, stderr: "" };
	} catch (error) {
		if (error instanceof SeatFailure) {
			const stderr = `${printable(error.message, "keep")}\nnext: ${printable(error.next, "keep")}\n`;
			return { code: error.exitCode, stdout: "", stderr };
		}
		return { code: 5, stdout: "", stderr: `internal error: ${printable(String(error), "keep")}\n` };
	}
}

async function compare(input: ContractInput): Promise<string> {
	const [piFile, codeFile, ...extra] = input.args;
	if (piFile === undefined || codeFile === undefined || extra.length > 0) {
		throw new SeatFailure(2, `bridge contract: expected two files, got ${input.args.length} arguments`, USAGE);
	}
	const again = `node seat/bridge-contract.ts ${piFile} ${codeFile}`;
	const expected = viewPrompt(piFile, await requiredText(piFile, again), again);
	const records = codeRecords(codeFile, await requiredText(codeFile, again), again);
	const first = records.find((record) => record.type === "user");
	const skipped = skippedTypes(records);
	const found = Buffer.from(first?.text ?? "", "utf8");
	const wanted = Buffer.from(expected, "utf8");
	const offset = firstDifference(found, wanted);
	if (first !== undefined && offset === undefined) {
		return `bridge contract: the first user record of ${codeFile} equals the view of ${piFile}, ${counted(wanted.length, "byte")} compared; skipped ${skipped}`;
	}
	const byte = offset ?? 0;
	const record = first === undefined ? "none" : excerpt(found, byte);
	throw new SeatFailure(
		1,
		`bridge contract: the first user record of ${codeFile} differs from the view of ${piFile} at byte ${byte}: record ${record}, view ${excerpt(wanted, byte)}`,
		`record the mismatch as a finding and fix it before the further steps of the tag (plan.md D-119), then run ${again}`,
	);
}

/**
 * The text the model gets in the first user record of a new Claude Code session: the first user record of the view of
 * the Pi session's first call, which for a new session's first call is its prompt (E-14).
 */
function viewPrompt(file: string, text: string, again: string): string {
	const call = firstCallOf(file, text);
	const [unread] = call.unread;
	if (unread !== undefined) {
		throw new SeatFailure(
			4,
			`bridge contract: ${unread.message}`,
			`check that ${file} is a whole Pi session, then run ${again}`,
		);
	}
	const piCall = { systemPrompt: "", messages: call.messages, agents: undefined, isolated: true, tools: [] };
	const first = bridgeView(piCall, undefined).view.messages.find((record) => record.role === "user");
	return first?.text.join("") ?? "";
}

/** Each record of the Claude Code session file, in its order; the first line it cannot read ends the contract. */
function codeRecords(file: string, text: string, again: string): CodeRecord[] {
	const records: CodeRecord[] = [];
	for (const [index, line] of text.split("\n").entries()) {
		if (!line.trim()) {
			continue;
		}
		const record = parseJson(`${file}:${index + 1}`, line, codeRecordOf);
		if (record instanceof LimenError) {
			throw new SeatFailure(
				4,
				`bridge contract: ${record.message}`,
				`check that ${file} is a whole Claude Code session file, then run ${again}`,
			);
		}
		records.push(record);
	}
	return records;
}

/**
 * One line of the Claude Code session file: an object with a string `type`; a `user` or `assistant` record has a
 * `message.content` that is a string or an array of blocks, as `cc-session-io` writes it and the Agent SDK sends a
 * prompt (D-119; `evidence/engine-sources/bridge-5.0.3.md` §10, `bundle/index.js#L39811-L39838`, `#L73344`).
 */
function codeRecordOf(value: unknown, field: string): CodeRecord {
	const fields = object()(value, field);
	const type = string(fields.get("type"), at(field, "type"));
	if (!MESSAGE_TYPES.includes(type)) {
		return { type };
	}
	const place = at(field, "message");
	const content = blocksOrText(object()(fields.get("message"), place).get("content"), at(place, "content"));
	return { type, text: typeof content === "string" ? content : content.join("") };
}

/** A content as its text: a string, or the texts of its text blocks in order, every other block giving none. */
const blocksOrText = either(string, arrayOf(blockText));

function blockText(value: unknown, field: string): string {
	const block = object()(value, field);
	const type = string(block.get("type"), at(field, "type"));
	const text = optional(string)(block.get("text"), at(field, "text"));
	return type === "text" ? (text ?? "") : "";
}

/** The records of types the contract does not read, by type: `2 summary, 1 system`, or `no record`. */
function skippedTypes(records: readonly CodeRecord[]): string {
	const counts = new Map<string, number>();
	for (const { type } of records.filter((record) => !MESSAGE_TYPES.includes(record.type))) {
		counts.set(type, (counts.get(type) ?? 0) + 1);
	}
	const listed = [...counts].map(([type, count]) => `${count} ${type}`);
	return listed.length > 0
		? `${counted(
				[...counts.values()].reduce((sum, count) => sum + count, 0),
				"record",
			)}: ${listed.join(", ")}`
		: "no record";
}

/** The first byte at which `one` and `other` differ, or undefined when they are equal. */
function firstDifference(one: Buffer, other: Buffer): number | undefined {
	const length = Math.min(one.length, other.length);
	for (let index = 0; index < length; index += 1) {
		if (one[index] !== other[index]) {
			return index;
		}
	}
	return one.length === other.length ? undefined : length;
}

/** The bytes of `text` from `offset` on, at most `EXCERPT_BYTES` of them, as a JSON string. */
function excerpt(text: Buffer, offset: number): string {
	return JSON.stringify(text.subarray(offset, offset + EXCERPT_BYTES).toString("utf8"));
}

// As in seat/deploy.ts: the entry point compares the real path of the script Node started, so a start through a
// symlinked path runs the tool too, and an import by a test runs nothing.
const started = process.argv[1];
if (started !== undefined && existsSync(started) && realpathSync(started) === fileURLToPath(import.meta.url)) {
	const outcome = await runBridgeContract({ args: process.argv.slice(2) });
	process.stdout.write(outcome.stdout);
	process.stderr.write(outcome.stderr);
	process.exitCode = outcome.code;
}
