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

/** The model of the map in `dir` with the tickets and board of `root`; written to `json` only when that is given. */
export async function buildPicture(dir: string, json: string | undefined, root: string): Promise<PictureModel> {
	const model = await readPicture(dir, root);
	if (json !== undefined) {
		await mkdir(dirname(json), { recursive: true });
		await atomicWrite(json, `${JSON.stringify(model, null, 2)}\n`);
	}
	return model;
}
