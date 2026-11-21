// The one check of a system error's code (T-25 (2)). It lives in a module that imports nothing, because the platform
// adapter (src/platform/) cannot import src/outcome.ts, the error module: its imports lead back to the adapter through
// src/lock.ts before the adapter has its value.

/** Whether `error` is a system error with the code `code`, such as `ENOENT` for a missing file. */
export function hasCode(error: unknown, code: string): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
