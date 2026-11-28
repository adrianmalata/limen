// src/runtime/stalled-tool.ts: the stall rule over planted samples of the job scope's CPU time and the pending calls'
// progress key, the pending tool calls after each stream event with that key, and the peak CPU share of the whole
// machine between two samples (A-059, M-09); no clock runs.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	type CpuSample,
	type PendingCall,
	peakAfter,
	pendingAfter,
	pendingProgress,
	type StallWatch,
	stallStep,
} from "../../src/runtime/stalled-tool.ts";
import type { StreamEvent } from "../../src/runtime/stream.ts";

/** The window of the tests: the default `toolStall`, 3 minutes. */
const WINDOW_MS = 180_000;
/** The tick of the tests, in seconds: the wrapper's 3 s. */
const TICK_S = 3;
/** The shortest interval between two samples whose rate counts toward the peak: half of a 1 s tick. */
const MINIMUM_MS = 500;
/** The progress key of one pending call, as `pendingProgress` builds it: the tool count, its id, the output count. */
const KEY = "1:call-1:0";

/** One tick: the sample the wrapper read (undefined: a failed read) and the pending tool's key (undefined: none). */
type Step = readonly [CpuSample | undefined, string | undefined];

/**
 * A tick every 3 s from 0 s to `seconds` s, the scope's CPU time growing by `perTick` microseconds at each, with the
 * key `key(at)` of the tick at `at` seconds, and a failed read where `read(at)` is false.
 */
function ticks(
	seconds: number,
	perTick: number,
	key: (at: number) => string | undefined = () => KEY,
	read: (at: number) => boolean = () => true,
): Step[] {
	const steps: Step[] = [];
	for (let at = 0; at <= seconds; at += TICK_S) {
		const sample = { at: at * 1_000, usage: 2_500_000 + (at / TICK_S) * perTick };
		steps.push([read(at) ? sample : undefined, key(at)]);
	}
	return steps;
}

/** The second of the first tick at which the rule stalls over `steps`, or undefined when it never does. */
function firstStall(steps: readonly Step[], windowMs = WINDOW_MS): number | undefined {
	let watch: StallWatch | undefined;
	for (const [index, [sample, key]] of steps.entries()) {
		const step = stallStep(watch, key, sample, windowMs);
		if (step.stalled) {
			return index * TICK_S;
		}
		watch = step.watch;
	}
	return undefined;
}

// A-059: a lone `sleep` stalls: the scope's idle Node processes add a little CPU time, far below 2 % of the wall time.
test("a pending tool whose scope's CPU time grows by less than 2 % of the wall time stalls once the window has passed, not before", () => {
	assert.equal(firstStall(ticks(300, 1_000)), 180);
});

// A-059: a background build in the job's scope holds the job, whatever process tree it runs in.
test("a pending tool whose scope works, as a background build's does, never stalls", () => {
	assert.equal(firstStall(ticks(900, 3_000_000)), undefined);
});

test("a scope whose CPU time grows by exactly 2 % of the wall time does not stall, and one just below it does", () => {
	const twoPercentOfATick = (TICK_S * 1_000 * 1_000 * 2) / 100;
	assert.deepEqual(
		[firstStall(ticks(300, twoPercentOfATick)), firstStall(ticks(300, twoPercentOfATick - 1))],
		[undefined, 180],
	);
});

// Fact 3 of R-036: a new tool, its output or a new stderr chunk is progress, and the window starts again with it; so is
// a tool's end (R-108).
test("a changed progress key restarts the window", () => {
	const key = (at: number) => (at < 93 ? KEY : "1:call-1:1");
	assert.equal(firstStall(ticks(600, 1_000, key)), 93 + 180);
});

// The rule's name: an engine that waits on the model is no tool, so it is never stalled.
test("no pending tool never stalls, however long the scope is idle", () => {
	assert.equal(firstStall(ticks(900, 0, () => undefined)), undefined);
});

// T-01, (d) of R-036: a failed read is the uncertainty note, never evidence of a stall, so the window starts again.
test("a failed read of the scope's CPU time restarts the window", () => {
	const read = (at: number) => at !== 90;
	assert.equal(firstStall(ticks(600, 1_000, () => KEY, read)), 93 + 180);
});

/** Pi's start of a call of `name` with its `detail`, as src/runtime/stream.ts gives it, with the call's `id` if any. */
function started(name: string, detail: string, id?: string): StreamEvent {
	return { kind: "tool", name, detail, ...(id === undefined ? {} : { id }) };
}

/** Pi's end of a call, as src/runtime/stream.ts gives it, with the call's `id` if any. */
function ended(id?: string): StreamEvent {
	return { kind: "activity", name: "wait", ...(id === undefined ? {} : { id }) };
}

/** A write and a `sleep` in one message, the calls of seat step 4.12, with Pi's ids. */
const WRITE = started("write", "note.md", "call-1");
const SLEEP = started("bash", "sleep 600", "call-2");

/**
 * The stall's pending tool and progress key after `events`, from no pending call, with `output` lines of output: each
 * start numbered by the job's tool count, as the wrapper counts it.
 */
function progressAfter(events: readonly StreamEvent[], output = 0) {
	let pending: readonly PendingCall[] = [];
	let tools = 0;
	for (const event of events) {
		tools += event.kind === "tool" ? 1 : 0;
		pending = pendingAfter(pending, event, tools);
	}
	return pendingProgress(pending, tools, output);
}

// E-19: Pi runs the tools of one message at once, so the write ends while the `sleep` still runs; the one activity the
// wrapper kept read that end as no tool pending (R-108).
test("each start adds its call and each end removes it, so a tool is pending while one call of its message is left", () => {
	assert.deepEqual(
		[
			progressAfter([WRITE, SLEEP, ended("call-1")])?.tool,
			progressAfter([WRITE, SLEEP, ended("call-1"), ended("call-2")]),
		],
		["bash sleep 600", undefined],
	);
});

// R-108 Decision 3: the detail keeps naming the last tool with its detail, as before, among the calls still pending.
test("the stall names the last started of the pending calls", () => {
	assert.deepEqual(
		[progressAfter([SLEEP, WRITE])?.tool, progressAfter([SLEEP, WRITE, ended("call-1")])?.tool],
		["write note.md", "bash sleep 600"],
	);
});

// R-108 Decision 5: a lost end never lets the rule act while the engine waits on the model.
test("a think event ends every pending call", () => {
	assert.equal(progressAfter([WRITE, SLEEP, { kind: "activity", name: "think" }]), undefined);
});

// R-108 Decision 4: Pi always sends the id; a start without one stays pending, under its own tool count.
test("a start with no id is pending under its tool count, and an end with an id leaves it pending", () => {
	assert.deepEqual(progressAfter([started("bash", "sleep 600"), started("bash", "true"), ended("call-1")]), {
		tool: "bash true",
		key: "2:1,2:0",
	});
});

// R-108 Decision 4: an end without an id ends every call, as the one activity did; the time limit bounds the rest.
test("an end with no id ends every pending call", () => {
	assert.equal(progressAfter([WRITE, SLEEP, ended()]), undefined);
});

// R-108: the key covers the pending calls, so each start and each end restarts the window, as the output count does.
test("the progress key is the tool count, the pending calls' ids in start order and the output count", () => {
	const events = [WRITE, SLEEP, ended("call-1")];
	assert.deepEqual(
		[...events.map((_, count) => progressAfter(events.slice(0, count + 1))?.key), progressAfter(events, 4)?.key],
		["1:call-1:0", "2:call-1,call-2:0", "2:call-2:0", "2:call-2:4"],
	);
});

// M-09, T-43: the queue diagnosis's unit, a share of the whole machine (src/runtime/queue-diagnosis.ts).
test("the peak is the largest CPU rate between two consecutive samples, as an integer percentage of the whole machine", () => {
	const samples = [
		{ at: 0, usage: 0 },
		{ at: 1_000, usage: 1_000_000 },
		{ at: 2_000, usage: 1_000_000 },
		{ at: 3_000, usage: 3_000_000 },
		{ at: 4_000, usage: 3_100_000 },
	];
	const peaks: (number | null)[] = [];
	let peak: number | null = null;
	let previous: CpuSample | undefined;
	for (const sample of samples) {
		peak = peakAfter(peak, previous, sample, 4, MINIMUM_MS);
		peaks.push(peak);
		previous = sample;
	}
	assert.deepEqual(peaks, [null, 25, 25, 50, 50]);
});

test("one sample gives no peak", () => {
	assert.equal(peakAfter(null, undefined, { at: 0, usage: 0 }, 4, MINIMUM_MS), null);
});

test("a rate above the whole machine counts as all of it", () => {
	assert.equal(peakAfter(null, { at: 0, usage: 0 }, { at: 1_000, usage: 8_000_000 }, 4, MINIMUM_MS), 100);
});

// R-036 review round 2, G1: over a few milliseconds the timing of two reads, not the scope's work, sets the rate.
test("a pair of samples closer than the minimum interval gives no rate and leaves the peak, and a pair at it does", () => {
	const start = { at: 0, usage: 0 };
	assert.deepEqual(
		[
			peakAfter(null, start, { at: MINIMUM_MS - 1, usage: 8_000_000 }, 4, MINIMUM_MS),
			peakAfter(10, start, { at: MINIMUM_MS - 1, usage: 8_000_000 }, 4, MINIMUM_MS),
			peakAfter(null, start, { at: MINIMUM_MS, usage: 500_000 }, 4, MINIMUM_MS),
		],
		[null, 10, 25],
	);
});
