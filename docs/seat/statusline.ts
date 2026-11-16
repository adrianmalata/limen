/**
 * Polski statusline w stylu Claude Code:
 * "Opus 5.5 (xhigh), Czas: 47h 47min 29s, Koszt: $47.43, Sesja: 33% ███░░░░░░░, 5h (23:40): 32% ███░░░░░░░, 7d: 12% █░░░░░░░░░"
 *
 * Limity 5h/7d pochodzą z https://api.anthropic.com/api/oauth/usage (token z ~/.claude/.credentials.json).
 * Wszystkie karty pi dzielą jeden plik z wynikiem (SHARED) i razem pytają API najwyżej raz na 60 s.
 * Reszta (model, koszt, kontekst) z API rozszerzeń pi.
 * Koszt to równowartość cen API, jak w statusline Claude Code (patrz messageCost).
 */

import { open, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { type AssistantMessage, calculateCost, getModels } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";

const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const CREDENTIALS = path.join(homedir(), ".claude", ".credentials.json");
const POLL_MS = 60_000;

/**
 * API przepuszcza około jednego zapytania na 2 min na konto, resztę odrzuca z 429. Gdy każda karta
 * pytała sama, wygrywała zawsze karta, która pytała pierwsza po otwarciu okna, a reszta nie
 * pokazywała limitów wcale. Dlatego jedna karta pyta za wszystkie, a każda czyta ten plik.
 */
const SHARED = path.join(homedir(), ".pi", "agent", "statusline-limits.json");
const LOCK = `${SHARED}.lock`;
/** Blokada starsza niż to należy do karty, która padła w trakcie zapytania. */
const LOCK_STALE_MS = 30_000;
const READ_MS = 5_000;

const ANTHROPIC_MODELS = new Map(getModels("anthropic").map((m) => [m.id, m]));

/**
 * Most pi-claude (api "claude-bridge") zapisuje koszt każdej odpowiedzi jako 0, bo subskrypcja
 * nie ma ceny za token. Dla jego odpowiedzi liczymy koszt z tokenów po cenniku Anthropic z pi-ai.
 * Most nie podaje podziału zapisów cache na 5 min i 1 h. Claude Code na tej maszynie pisze tylko
 * cache 1 h (transkrypty w ~/.claude/projects: 0 zapisów 5 min), a ten kosztuje 2x cenę input.
 */
function messageCost(m: AssistantMessage): number {
	if (m.api !== "claude-bridge") return m.usage.cost.total;
	const model = ANTHROPIC_MODELS.get(m.model);
	if (!model) return 0;
	// calculateCost nadpisuje usage.cost, więc dostaje kopię.
	const usage = { ...m.usage, cost: { ...m.usage.cost }, cacheWrite1h: m.usage.cacheWrite };
	return calculateCost(model, usage).total;
}

type Limits = {
	fiveHourPct: number | null;
	fiveHourResetsAt: Date | null;
	sevenDayPct: number | null;
};

function bar(pct: number): string {
	const filled = Math.min(10, Math.max(0, Math.round(pct / 10)));
	return "█".repeat(filled) + "░".repeat(10 - filled);
}

function formatDuration(ms: number): string {
	const total = Math.floor(ms / 1000);
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	if (h > 0) return `${h}h ${m}min ${s}s`;
	if (m > 0) return `${m}min ${s}s`;
	return `${s}s`;
}

// Godzina resetu w czasie polskim: system działa w UTC, więc getHours() dałoby UTC.
const CLOCK = new Intl.DateTimeFormat("pl-PL", {
	timeZone: "Europe/Warsaw",
	hour: "2-digit",
	minute: "2-digit",
	hourCycle: "h23",
});

function formatClock(d: Date): string {
	return CLOCK.format(d);
}

type Shared = {
	attemptedAt: number;
	limits: Limits | null;
};

async function readShared(): Promise<Shared | null> {
	try {
		const data = JSON.parse(await readFile(SHARED, "utf8"));
		const l = data?.limits;
		return {
			attemptedAt: Number(data?.attemptedAt) || 0,
			limits: l
				? {
						fiveHourPct: l.fiveHourPct ?? null,
						fiveHourResetsAt: l.fiveHourResetsAt ? new Date(l.fiveHourResetsAt) : null,
						sevenDayPct: l.sevenDayPct ?? null,
					}
				: null,
		};
	} catch {
		return null;
	}
}

async function writeShared(shared: Shared): Promise<void> {
	const tmp = `${SHARED}.${process.pid}.tmp`;
	await writeFile(tmp, JSON.stringify(shared));
	await rename(tmp, SHARED);
}

/** Bierze blokadę zapytania; false, gdy inna karta już pyta. */
async function takeLock(): Promise<boolean> {
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			await (await open(LOCK, "wx")).close();
			return true;
		} catch {
			try {
				if (Date.now() - (await stat(LOCK)).mtimeMs < LOCK_STALE_MS) return false;
				await unlink(LOCK);
			} catch {
				// blokada zniknęła między open i stat: następna próba
			}
		}
	}
	return false;
}

/**
 * Wynik z pliku. Gdy ostatnia próba w pliku jest starsza niż POLL_MS, ta karta pyta API za
 * wszystkie i zapisuje próbę. Nieudane zapytanie zostawia w pliku ostatnie dobre limity.
 */
async function sharedLimits(): Promise<Limits | null> {
	const seen = await readShared();
	if (seen && Date.now() - seen.attemptedAt < POLL_MS) return seen.limits;
	if (!(await takeLock())) return seen?.limits ?? null;
	try {
		// inna karta mogła zapisać próbę między odczytem a blokadą
		const current = await readShared();
		if (current && Date.now() - current.attemptedAt < POLL_MS) return current.limits;
		const attemptedAt = Date.now();
		const limits = (await fetchLimits()) ?? current?.limits ?? null;
		await writeShared({ attemptedAt, limits });
		return limits;
	} catch {
		return seen?.limits ?? null;
	} finally {
		await unlink(LOCK).catch(() => {});
	}
}

async function fetchLimits(): Promise<Limits | null> {
	let token: string;
	try {
		const creds = JSON.parse(await readFile(CREDENTIALS, "utf8"));
		token = creds?.claudeAiOauth?.accessToken;
		const expiresAt = creds?.claudeAiOauth?.expiresAt;
		if (!token || (typeof expiresAt === "number" && expiresAt < Date.now())) return null;
	} catch {
		return null;
	}
	try {
		const res = await fetch(USAGE_URL, {
			headers: { Authorization: `Bearer ${token}`, "anthropic-beta": "oauth-2025-04-20" },
			signal: AbortSignal.timeout(10_000),
		});
		if (!res.ok) return null;
		const data = (await res.json()) as any;
		return {
			fiveHourPct: data?.five_hour?.utilization ?? null,
			fiveHourResetsAt: data?.five_hour?.resets_at ? new Date(data.five_hour.resets_at) : null,
			sevenDayPct: data?.seven_day?.utilization ?? null,
		};
	} catch {
		return null;
	}
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		if (!ctx.ui.setFooter) return;

		let limits: Limits | null = null;

		ctx.ui.setFooter((tui, theme) => {
			const poll = async () => {
				const next = await sharedLimits();
				if (next) {
					limits = next;
					tui.requestRender();
				}
			};
			void poll();
			// czyta plik co 5 s, więc nowa karta i każda inna widzą wynik zaraz po zapisie
			const pollTimer = setInterval(poll, READ_MS);
			pollTimer.unref?.();
			// tyka co sekundę, żeby licznik czasu był żywy
			const tick = setInterval(() => tui.requestRender(), 1000);
			tick.unref?.();

			return {
				dispose() {
					clearInterval(pollTimer);
					clearInterval(tick);
				},
				invalidate() {},
				render(width: number): string[] {
					const parts: string[] = [];

					let model = ctx.model?.name ?? ctx.model?.id ?? "brak modelu";
					model = model.replace(/^Claude\s+/, "");
					const level = ctx.thinkingLevel;
					parts.push(level && level !== "off" ? `${model} (${level})` : model);

					let cost = 0;
					let startedAt: number | null = null;
					for (const e of ctx.sessionManager.getBranch()) {
						const ts = (e as any).timestamp;
						if (startedAt === null && ts) startedAt = Date.parse(ts);
						if (e.type === "message" && e.message.role === "assistant") {
							cost += messageCost(e.message as AssistantMessage);
						}
					}
					if (startedAt !== null) {
						parts.push(`Czas: ${formatDuration(Date.now() - startedAt)}`);
					}
					parts.push(`Koszt: $${cost.toFixed(2)}`);

					const usage = ctx.getContextUsage();
					if (usage?.percent != null) {
						const pct = Math.round(usage.percent);
						parts.push(`Sesja: ${pct}% ${bar(pct)}`);
					}

					if (limits?.fiveHourPct != null) {
						const pct = Math.round(limits.fiveHourPct);
						const label = limits.fiveHourResetsAt
							? `5h (${formatClock(limits.fiveHourResetsAt)})`
							: "5h";
						parts.push(`${label}: ${pct}% ${bar(pct)}`);
					}
					if (limits?.sevenDayPct != null) {
						const pct = Math.round(limits.sevenDayPct);
						parts.push(`7d: ${pct}% ${bar(pct)}`);
					}

					return [truncateToWidth(theme.fg("dim", parts.join(", ")), width)];
				},
			};
		});
	});
}
