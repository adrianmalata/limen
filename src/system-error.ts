// The one check of the code of a thrown object (T-25 (1)): a scan in test/structure.test.ts bans every other check of
// an error's code by hand in src/, hook/, bin/ and seat/, beyond the listed lines that R-082 moves onto this one. It
// lives in a module that imports nothing, because the platform adapter (src/platform/) cannot import src/outcome.ts,
// the error module: its imports lead back to the adapter through src/lock.ts before the adapter has its value.

/**
 * Whether `error` is an object whose `code` is `code`: a system error, such as `ENOENT` for a missing file, or a tool's
 * coded error, such as Herdr's `tab_not_found`. A value that is no object has no code. A check of two codes is two
 * calls.
 */
export function hasCode(error: unknown, code: string): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
