// Resumes a Limen coordinator session after a Claude quota limit.
//
// When a run settles on the error "You've hit your ... limit · resets <time>
// (<zone>)", the session sends itself one user message a few minutes after
// that reset. When that turn meets the limit again, its error schedules the
// next wake, so the chain goes on from reset to reset until a turn succeeds.
// Nothing polls: the error is the only trigger.
//
// The timer lives in memory, and /reload, a restart or a resume ends it. So on
// every session_start the session reads its own branch: when the last assistant
// message is a quota-limit error, the wake is armed again from that error.
//
// Only sessions with LIMEN_COORDINATOR=1 take part. A job session ends on the
// error, and its coordinator resumes it with `limen continue`.

import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const LIMIT = /hit your (?:[\w-]+ )?limit/i;
const RESET =
  /resets\s+(?:([A-Z][a-z]{2})\s+(\d{1,2}),\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*\(([^)]+)\)/i;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** How long after the named reset the wake comes. */
const MARGIN = 5 * MINUTE;
/** The wait when no reset can be read, or when the named reset has passed. */
const RETRY = 15 * MINUTE;
const logFile = join(homedir(), ".local", "state", "quota-resume.log");

function log(line: string): void {
  try {
    mkdirSync(join(homedir(), ".local", "state"), { recursive: true });
    appendFileSync(logFile, `${new Date().toISOString()} ${String(process.pid)} ${line}\n`);
  } catch {
    // A log that cannot be written must not stop the session.
  }
}

/** The offset of `zone` from UTC at the instant `t`, in milliseconds. */
function offset(t: number, zone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    })
      .formatToParts(t)
      .map((part) => [part.type, Number(part.value)]),
  );
  return (
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) -
    Math.floor(t / 1000) * 1000
  );
}

/** The instant of a wall-clock time in `zone`. */
function instant(year: number, month: number, day: number, hour: number, minute: number, zone: string): number {
  const guess = Date.UTC(year, month, day, hour, minute);
  const first = guess - offset(guess, zone);
  return guess - offset(first, zone);
}

/** The reset that the error names, after the instant `said`; undefined when none can be read. */
export function resetOf(text: string, said: number): number | undefined {
  const found = RESET.exec(text);
  if (found === null) return undefined;
  const [, month, day, hourText, minuteText, half, zoneText] = found;
  const zone = zoneText.trim().toUpperCase() === "UTC" ? "UTC" : zoneText.trim();
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
  } catch {
    return undefined;
  }
  const hour = (Number(hourText) % 12) + (half.toLowerCase() === "pm" ? 12 : 0);
  const minute = Number(minuteText ?? 0);
  const local = new Date(said + offset(said, zone));
  if (month !== undefined) {
    const index = MONTHS.indexOf(month.toLowerCase());
    if (index < 0) return undefined;
    let moment = instant(local.getUTCFullYear(), index, Number(day), hour, minute, zone);
    if (moment < said - 180 * DAY)
      moment = instant(local.getUTCFullYear() + 1, index, Number(day), hour, minute, zone);
    return moment;
  }
  let moment = instant(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hour, minute, zone);
  if (moment <= said) moment += DAY;
  // A reset without a date lies within the 5-hour window; a later one is a
  // misreading, and the short retry is safer than a wait of a day.
  return moment - said <= 6 * HOUR ? moment : undefined;
}

/** A wake armed again on load waits for this when its time has passed. */
const SETTLE = MINUTE;
/** A wake whose time passed longer ago than this belongs to an old session, and is not armed again. */
const STALE = 12 * HOUR;

/** The instant of the wake after an error said at `said`. */
export function wakeAt(text: string, said: number): number {
  const reset = resetOf(text, said);
  return reset !== undefined && reset + MARGIN > said ? reset + MARGIN : said + RETRY;
}

/** The delay of the wake after an error said at `now`. */
export function delayOf(text: string, now: number): number {
  return wakeAt(text, now) - now;
}

interface Entry {
  readonly type?: string;
  readonly timestamp?: string;
  readonly message?: Message;
}

/**
 * The wake that a loaded session still owes: the branch ends on a quota-limit
 * error, with no assistant message after it. Undefined when nothing is owed or
 * the wake is stale.
 */
export function owedWake(
  branch: readonly Entry[],
  now: number,
): { readonly error: string; readonly delay: number } | undefined {
  for (let index = branch.length - 1; index >= 0; index -= 1) {
    const entry = branch[index];
    if (entry.type !== "message" || entry.message?.role !== "assistant") continue;
    const error = limitError(entry.message);
    const said = Date.parse(entry.timestamp ?? "");
    if (error === undefined || Number.isNaN(said)) return undefined;
    const at = wakeAt(error, said);
    if (now - at > STALE) return undefined;
    return { error, delay: Math.max(at - now, SETTLE) };
  }
  return undefined;
}

interface Message {
  readonly role?: string;
  readonly stopReason?: string;
  readonly errorMessage?: string;
  readonly content?: readonly { readonly type?: string; readonly text?: string }[] | string;
}

/** The text of a quota-limit error, when the message is one. */
export function limitError(message: Message): string | undefined {
  if (message.role !== "assistant" || message.stopReason !== "error") return undefined;
  const texts = [message.errorMessage ?? ""];
  if (Array.isArray(message.content)) for (const part of message.content) texts.push(part.text ?? "");
  return texts.find((text) => LIMIT.test(text));
}

function wakeText(error: string): string {
  return (
    `Automatic resume after a Claude quota limit (extension quota-resume). This session stopped on ` +
    `the error "${error.trim()}", and the quota has reset since. Run \`limen status\` in your project; ` +
    "resume each job that failed on the limit with `limen continue <id>` and its full original route " +
    "(--engine, --provider, --model, --thinking; without them limen starts a seat default model); act " +
    "on every wake that failed or got no answer during the limit; then report to the owner. If nothing " +
    "waits, answer in one line and do nothing more."
  );
}

export default function quotaResume(pi: any): void {
  if (process.env.LIMEN_COORDINATOR !== "1") return;
  // Proves that a coordinator session loaded this file, for example after /reload.
  log(`loaded in ${process.cwd()}, pane ${process.env.HERDR_PANE_ID ?? "none"}`);
  let stopped: string | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  pi.on("message_end", (event: { message: Message }) => {
    if (event.message.role !== "assistant") return;
    stopped = limitError(event.message);
  });

  function arm(error: string, delay: number, ctx: { isIdle(): boolean }): void {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      // A turn that succeeded since, or a turn that runs now, needs no wake.
      if (stopped !== error || !ctx.isIdle()) {
        log("wake skipped: the session went on");
        return;
      }
      log("wake sent");
      pi.sendUserMessage(wakeText(error));
    }, delay);
    timer.unref?.();
  }

  pi.on(
    "session_start",
    (
      event: { reason?: string },
      ctx: { isIdle(): boolean; sessionManager: { getBranch(): readonly Entry[] } },
    ) => {
      const owed = owedWake(ctx.sessionManager.getBranch(), Date.now());
      if (owed === undefined) return;
      stopped = owed.error;
      log(
        `${event.reason ?? "start"}: the branch ends on "${owed.error.trim()}"; wake armed again, in ${String(Math.round(owed.delay / MINUTE))} min`,
      );
      arm(owed.error, owed.delay, ctx);
    },
  );

  pi.on("agent_settled", (_event: unknown, ctx: { isIdle(): boolean }) => {
    if (stopped === undefined) return;
    const error = stopped;
    const delay = delayOf(error, Date.now());
    log(`stopped on "${error.trim()}"; wake in ${String(Math.round(delay / MINUTE))} min`);
    arm(error, delay, ctx);
  });

  pi.on("session_shutdown", () => {
    clearTimeout(timer);
  });
}
