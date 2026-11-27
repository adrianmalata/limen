/* PL: Zapis atomowy narzędzi przebudowy według wzorca A-022 (D-018): plik tymczasowy w katalogu docelowym, fsync,
   rename i fsync katalogu, z utworzeniem katalogu, gdy go nie ma; do tego odczyt opcji `--out <plik>` z argumentów.
   Narzędzia piszą wyniki przez `--out`, więc żadne polecenie protokołu nie potrzebuje przekierowania `>`; od D-130
   treść może też zapisać funkcja na otwartym pliku tymczasowym (wyjście procesu potomnego bramki).
   Stan: działa; testowany przez tools/test-review-guard.mjs i tools/test-gate.mjs. */
import { randomUUID } from "node:crypto";
import { closeSync, fsyncSync, mkdirSync, openSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

/** Writes `data` to `path` so that a reader sees the old file or the whole new one, never a part. */
export function writeAtomic(path, data) {
	writeAtomicWith(path, (fd) => writeFileSync(fd, data));
}

/**
 * The atomic write of `writeAtomic`, with the content written by `fill(fd, temp)` into the open temporary file, so a
 * child process can write into it directly (D-130); returns what `fill` returns. A throw leaves no temporary file.
 */
export function writeAtomicWith(path, fill) {
	const dir = dirname(path);
	mkdirSync(dir, { recursive: true });
	const temp = join(dir, `.${basename(path)}.${randomUUID()}.tmp`);
	let value;
	try {
		const fd = openSync(temp, "wx", 0o644);
		try {
			value = fill(fd, temp);
			fsyncSync(fd);
		} finally {
			closeSync(fd);
		}
		renameSync(temp, path);
	} catch (error) {
		rmSync(temp, { force: true });
		throw error;
	}
	const dirFd = openSync(dir, "r");
	try {
		fsyncSync(dirFd);
	} finally {
		closeSync(dirFd);
	}
	return value;
}

/** Splits `--out <file>` from the arguments; `file` is undefined without `--out`, and `--out` without a file throws. */
export function takeOut(args) {
	const at = args.indexOf("--out");
	if (at < 0) {
		return { file: undefined, rest: args };
	}
	const file = args[at + 1];
	if (file === undefined || file.startsWith("--")) {
		throw new Error("--out needs a file");
	}
	return { file, rest: [...args.slice(0, at), ...args.slice(at + 2)] };
}
