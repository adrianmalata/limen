// The stall rule (A-059): while a tool is pending, a job is stalled when, for the whole window, the CPU time of its
// systemd user scope grew by less than 2 % of the window's wall time and no tool made progress. The scope holds every
// process of the job (R-026), a build detached with `setsid` included, so a tool that waits on a build that works keeps
// its job, and a lone `sleep` does not; the wrapper, Pi and the bridge's `claude` run in it too, so idle is a
// threshold, not no change at all (R-036 Decision 1). Pi runs the tools of one message at once (E-19), so the pending
// tools are a set of calls kept by Pi's `toolCallId`, and a tool is pending while one call is left (R-108). A job's
// wrapper (src/runtime/wrapper.ts) samples the scope's CPU time at every tick from its engine's start to its end, also
// while no tool runs, for the peak CPU share its record keeps (M-09). The pending calls, the rule and the peak are pure
// functions over the stream's events and those samples; the clock and the window are the caller's.
import { testKnob } from "../config.ts";
import { limitMs } from "../project/limits.ts";
import { machineShare } from "./queue-diagnosis.ts";
import { type StreamEvent, toolCallText } from "./stream.ts";

const DEFAULT_TOOL_STALL_MS = 3 * 60_000;
const DEFAULT_TICK_MS = 3_000;
/**
 * The share of the window's wall time, in percent, below which the scope's CPU time is idle: far below a build and
 * above an idle Node process (R-036 Decision 1); `## Deployment` 3.8 measures the seat's idle rate. A mechanic the
 * owner does not configure (T-03).
 */
const IDLE_PERCENT = 2;
/** The largest peak, in percent: all of the machine. Only the times of two reads can give a rate above it. */
const WHOLE_MACHINE = 100;

/** The window of the stall rule: `toolStall` of the project's limits file, else 3 minutes (R-015). */
export function toolStallMs(): number {
	return limitMs("toolStall", DEFAULT_TOOL_STALL_MS);
}

/** How often a job's wrapper samples its scope's CPU time: 3 s; the test knob LIMEN_STALL_TICK_MS shortens it. */
export function stallTickMs(): number {
	const knob = Number(testKnob("LIMEN_STALL_TICK_MS"));
	return knob > 0 ? knob : DEFAULT_TICK_MS;
}

/** One reading of the scope's CPU time: when, in milliseconds of the caller's clock, and its `usage_usec`. */
export type CpuSample = { readonly at: number; readonly usage: number };

/**
 * A tool call that started and has not ended: Pi's `toolCallId`, null for a start that carried none; `count`, the job's
 * tool count at its start; and its tool with the detail, as the stall's detail names it.
 */
export type PendingCall = { readonly id: string | null; readonly count: number; readonly tool: string };

/** The pending tool, as the stall's detail names it, and the progress key of the pending calls. */
export type PendingProgress = { readonly tool: string; readonly key: string };

/**
 * The pending calls, in start order, after one event of the engine's stream; `count` is the job's tool count after the
 * event, so a start's own number. A start adds its call. An end removes the call its id names; an end with no id ends
 * every pending call, as the one activity of R-036 did, and the job's time limit bounds a call whose end is lost
 * (R-108 Decision 4). A `think` event empties the set, so the rule never acts while the engine waits on the model
 * (Decision 5). Any other event leaves the set.
 */
export function pendingAfter(
	pending: readonly PendingCall[],
	event: StreamEvent,
	count: number,
): readonly PendingCall[] {
	if (event.kind === "tool") {
		return [...pending, { id: event.id ?? null, count, tool: toolCallText(event) }];
	}
	if (event.kind !== "activity" || event.name === "tool") {
		return pending;
	}
	if (event.name === "think" || event.id === undefined) {
		return [];
	}
	return pending.filter((call) => call.id !== event.id);
}

/**
 * The stall's pending tool and progress key, undefined when no call is pending. The tool is the last started of the
 * pending calls (R-108 Decision 3). The key is the job's tool count `tools`, the pending calls' ids in start order (a
 * call with no id by its `count`) and `output`, the wrapper's count of stderr chunks and non-JSON stdout lines, so each
 * start, each end and each output is progress (R-036 fact 3, R-108 Decision 2).
 */
export function pendingProgress(
	pending: readonly PendingCall[],
	tools: number,
	output: number,
): PendingProgress | undefined {
	const last = pending.at(-1);
	if (last === undefined) {
		return undefined;
	}
	const calls = pending.map((call) => call.id ?? String(call.count)).join(",");
	return { tool: last.tool, key: `${tools}:${calls}:${output}` };
}

/**
 * What the rule keeps while a tool is pending: the progress key, and the samples since that key holds, oldest first,
 * from the newest one that lies a whole window before the last.
 */
export type StallWatch = { readonly key: string; readonly samples: readonly CpuSample[] };

/** The watch after one tick, and whether the job is stalled at that tick. */
export type StallStep = { readonly watch: StallWatch | undefined; readonly stalled: boolean };

/**
 * One tick of the stall rule: `sample` is the scope's CPU time read now, undefined when the read failed, and `key` the
 * pending calls' progress key (`pendingProgress`), undefined when no tool is pending. No pending tool and a failed read
 * keep no watch, so the window starts again at the next sample, as it does for a changed key; a failed read is never
 * evidence of a stall (T-01). The job is stalled once a sample under the same key lies a whole window before `sample`
 * and the CPU time grew since then by less than `IDLE_PERCENT` of the wall time between them.
 */
export function stallStep(
	watch: StallWatch | undefined,
	key: string | undefined,
	sample: CpuSample | undefined,
	windowMs: number,
): StallStep {
	if (key === undefined || sample === undefined) {
		return { watch: undefined, stalled: false };
	}
	const samples = watch?.key === key ? [...watch.samples, sample] : [sample];
	const start = samples.findLastIndex((earlier) => sample.at - earlier.at >= windowMs);
	const first = samples[start];
	// In microseconds on both sides, so the 2 % is exact for whole numbers.
	const stalled =
		first !== undefined && 100 * (sample.usage - first.usage) < IDLE_PERCENT * (sample.at - first.at) * 1_000;
	return { watch: { key, samples: start > 0 ? samples.slice(start) : samples }, stalled };
}

/**
 * The peak after `sample`: the larger of `peak` and the rate from `previous` to `sample` on `cores` cores, as an
 * integer percentage of the whole machine, the start queue's unit (src/runtime/queue-diagnosis.ts, T-18), at most all
 * of it. With no earlier sample, or one less than `minimumMs` before `sample`, there is no rate, and the peak stays:
 * over a few milliseconds the timing of the two reads, not the scope's work, sets the rate (R-036 review round 2, G1).
 * The wrapper's minimum is half its tick.
 */
export function peakAfter(
	peak: number | null,
	previous: CpuSample | undefined,
	sample: CpuSample,
	cores: number,
	minimumMs: number,
): number | null {
	if (previous === undefined || sample.at - previous.at < minimumMs || sample.at <= previous.at || cores < 1) {
		return peak;
	}
	const share = machineShare(Math.max(0, sample.usage - previous.usage), sample.at - previous.at, cores);
	const rate = Math.min(WHOLE_MACHINE, Math.round(share));
	return peak === null ? rate : Math.max(peak, rate);
}
