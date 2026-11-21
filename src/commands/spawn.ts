import { startSpawn } from "../job/spawning.ts";
import type { CommandText, Success } from "../outcome.ts";
import type { Parsed } from "../parser.ts";

/** `limen spawn`: starts one job from the command line. */
export function spawnCommand(values: Parsed, cwd: string, out: CommandText): Promise<Success> {
	return startSpawn(
		{
			task: values.list("task"),
			engine: values.get("engine") ?? "",
			provider: values.get("provider") ?? "",
			model: values.get("model") ?? "",
			thinking: values.get("thinking") ?? "",
			label: values.get("label"),
			branch: values.get("branch"),
			repo: values.get("repo"),
			role: values.get("role"),
			review: values.has("review"),
			base: values.get("base"),
			head: values.get("head"),
			timeout: values.get("timeout"),
			taskFile: values.get("task-file"),
			prepare: values.get("prepare"),
			priority: values.get("priority"),
			extensions: values.list("extension"),
		},
		cwd,
		out,
	);
}
