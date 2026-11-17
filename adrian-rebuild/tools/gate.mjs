/* PL: Bramka testów przebudowy (D-001, od D-015 w Node zamiast w powłoce): uruchamia `npm run check` w środowisku
   z gate-env.mjs (prywatny TMPDIR, shim gita tylko przy git < 2.36), żeby laptop dał ten sam wynik co seat.
   Kończy się kodem wyjścia `npm run check`. Niczego nie instaluje. Stan: przyjęta jako bramka przebudowy. */
// Usage: node adrian-rebuild/tools/gate.mjs   (from anywhere inside the repository)
import { spawnSync } from "node:child_process";
import { gateEnv, repoRoot } from "./gate-env.mjs";

const repo = repoRoot();
const result = spawnSync("npm", ["run", "check"], { cwd: repo, env: gateEnv(repo), stdio: "inherit" });
if (result.status === null) {
	console.error(`gate: npm run check ended by ${result.signal ?? result.error?.message}`);
}
process.exitCode = result.status ?? 1;
