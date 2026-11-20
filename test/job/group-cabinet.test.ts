// src/job/group-cabinet.ts: the group registry, here the lead registrations under .limen/group-leads/.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { leadSession } from "../../src/job/group-cabinet.ts";

// A temp of src/atomic-write.ts sits beside its target until the rename; a leftover one, after a crash, stays.
test("leadSession does not take the temp of a lead registration write for a lead session", async (t) => {
	const root = mkdtempSync(join(tmpdir(), "limen-group-leads-"));
	const declared = process.env.PI_SESSION_ID;
	delete process.env.PI_SESSION_ID;
	t.after(() => {
		if (declared !== undefined) {
			process.env.PI_SESSION_ID = declared;
		}
		rmSync(root, { recursive: true, force: true });
	});
	mkdirSync(join(root, ".limen", "group-leads"), { recursive: true });
	// The temp names this process's parent, so a reader that takes it finds the lead at once.
	writeFileSync(join(root, ".limen", "group-leads", "lead-a.4242.9f3c.tmp"), `${process.ppid}\n`);
	assert.equal(await leadSession(root), undefined);
});
