/* PL: Zapis atomowy narzędzi przebudowy według wzorca A-022 (D-018): plik tymczasowy w katalogu docelowym, fsync,
   rename i fsync katalogu, z utworzeniem katalogu, gdy go nie ma; do tego odczyt opcji `--out <plik>` z argumentów.
   Narzędzia piszą wyniki przez `--out`, więc żadne polecenie protokołu nie potrzebuje przekierowania `>`.
   Stan: działa; testowany przez tools/test-review-guard.mjs. */
import { randomUUID } from "node:crypto";
import { closeSync, fsyncSync, mkdirSync, openSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

/** Writes `data` to `path` so that a reader sees the old file or the whole new one, never a part. */
export function writeAtomic(path, data) {
	const dir = dirname(path);
	mkdirSync(dir, { recursive: true });
	const temp = join(dir, `.${basename(path)}.${randomUUID()}.tmp`);
	try {
		const fd = openSync(temp, "wx", 0o644);
		try {
			writeFileSync(fd, data);
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
