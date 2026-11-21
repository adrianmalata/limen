// The form of a job id (T-20 (1), (6)): the date, a slug of the label, and the token, the 8 hex characters that end an
// id now; an id that Limen wrote before the token ends in 4 hex characters instead, and takes only its full id. This is
// the one module of src/, hook/, bin/ and seat/ that writes the form as a pattern (T-25 (2), a scan in
// test/structure.test.ts). `makeJobId` and `jobToken` (src/job/job.ts) build ids and tokens without reading it, so
// test/job/id.test.ts checks that what they build has this form. This module imports nothing, so src/outcome.ts can
// read it while it loads.

/** The token: the 8 hex characters that end a job id now. */
const TOKEN_FORM = "[0-9a-f]{8}";
/** What ended a job id before the token: 4 hex characters. */
const OLDER_FORM = "[0-9a-f]{4}";

/** A token as a reference gives it. */
export const TOKEN = new RegExp(`^${TOKEN_FORM}$`);
/**
 * A job id of a form Limen has written. `github review` and `github work` can name a job an earlier `makeJobId` made, so
 * it takes every such form: the token or the older 4 hex characters, and a slug of at most 32 characters that may hold
 * a run of dashes or end in one.
 */
export const JOB_ID = new RegExp(`^\\d{4}-\\d{2}-\\d{2}-[a-z0-9][a-z0-9-]{0,31}-(?:${OLDER_FORM}|${TOKEN_FORM})$`);
/** The hex characters after the last dash of an id of either form. */
const END = new RegExp(`-(${TOKEN_FORM}|${OLDER_FORM})$`);

/** The token that ends `id`; none for an id of the older form or a name of neither form. */
export function tokenOf(id: string): string | undefined {
	const end = hexEndOf(id);
	return end !== undefined && TOKEN.test(end) ? end : undefined;
}

/** The hex characters that end `id`: its token, or the 4 of an id of the older form; none for a name of neither form. */
export function hexEndOf(id: string): string | undefined {
	return END.exec(id)?.[1];
}
