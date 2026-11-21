import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { atomicWrite } from "../atomic-write.ts";
import { readBoard } from "./board.ts";
import { readDataset } from "./dataset.ts";
import { buildModel, type PictureModel } from "./picture-model.ts";
import { readTickets } from "./tickets.ts";

/** With `root`, every cited source is checked against the project root and a missing path warns. */
export async function readPicture(dir: string, root?: string): Promise<PictureModel> {
	const dataset = await readDataset(dir);
	if (root === undefined) {
		return buildModel({ files: dataset.files, diagnostics: dataset.diagnostics });
	}
	const [tickets, board] = await Promise.all([readTickets(root), readBoard(root)]);
	return buildModel({
		files: dataset.files,
		diagnostics: [...dataset.diagnostics, ...tickets.diagnostics],
		tickets: tickets.tickets,
		board,
		exists: (path) => existsSync(join(root, path)),
	});
}

/** Writes `model` to the file `json`, whole or not at all (src/atomic-write.ts), with its folder. */
export async function writePictureModel(json: string, model: PictureModel): Promise<void> {
	await mkdir(dirname(json), { recursive: true });
	await atomicWrite(json, `${JSON.stringify(model, null, 2)}\n`);
}
