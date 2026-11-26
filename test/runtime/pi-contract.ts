// The type contract of the Pi adapter (T-32 (2), D-055 (1)): a file that assigns Pi's own types to the declarations of
// src/runtime/pi-api.ts, compiled with the repository's TypeScript against Pi's type packages at a path the caller
// gives, so no seat path is in the repository. Pi's types import packages that are not vendored (provider SDKs, the
// TUI, typebox), so the contract compiles with skipLibCheck, under which a type from an unresolved package becomes
// `any` and passes every assignment; the contract therefore also proves that each type it compares checks something.
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

/** The three packages of Pi whose types the contract reads, each as `<root>/<name>/package`. */
export const PI_PACKAGES = ["pi-coding-agent", "pi-ai", "pi-agent-core"] as const;

const ADAPTER = fileURLToPath(new URL("../../src/runtime/pi-api.ts", import.meta.url));
const REPO_CONFIG = fileURLToPath(new URL("../../tsconfig.json", import.meta.url));
const TYPE_ROOTS = fileURLToPath(new URL("../../node_modules/@types", import.meta.url));

/** The contract file. Its diagnostics name the line, so each check is one statement. */
const CONTRACT = `import type { ExtensionAPI, ExtensionContext, ExtensionEvent } from "@earendil-works/pi-coding-agent";
import type { PiApi, PiContext, PiContextEntry, PiEvents, PiMessage } from "ADAPTER";

declare const unrelated: unique symbol;
/** True when T checks nothing: any (also a type whose package did not resolve) or never. */
type Vacuous<T> = [T] extends [typeof unrelated] ? true : false;
/** The payload Pi passes to the handlers of event K. */
type Payload<K> = Extract<ExtensionEvent, { type: K }>;
/** The type of field F in any member of the union T, or never when no member has it. */
type Field<T, F> = T extends unknown ? (F extends keyof T ? T[F] : never) : never;
/** The element type of an array, or the type itself. */
type Element<T> = T extends readonly (infer E)[] ? E : T;
/** Each field of Ours that checks nothing in Theirs, itself or as its element type, named with Prefix. */
type Unchecked<Ours, Theirs, Prefix extends string> = {
	[F in keyof Ours & string]-?: Vacuous<Field<Theirs, F>> extends true
		? \`\${Prefix}\${F}\`
		: Vacuous<Element<Field<Theirs, F>>> extends true
			? \`\${Prefix}\${F}\`
			: never;
}[keyof Ours & string];
/** "none" when Names is never; otherwise a sentence that names each of them. */
type None<Names> = [Names] extends [never] ? "none" : \`\${Names & string} checks nothing: it is any, never or not in Pi\`;

declare const api: ExtensionAPI;
declare const context: ExtensionContext;
declare const payloads: { readonly [K in keyof PiEvents]: Payload<K> };
declare const message: Field<Payload<"message_end">, "message">;
/** The custom message entry among the entries of the context's compaction-aware session (R-039). */
declare const customEntry: Extract<
	Element<ReturnType<Field<Field<ExtensionContext, "sessionManager">, "buildContextEntries">>>,
	{ type: "custom_message" }
>;

// Each type the contract compares checks something: Pi's API and context, each event the adapter reads, each field
// of them that the adapter declares, the fields of a message, and those of a custom message entry.
export const piTypes: None<(Vacuous<ExtensionAPI> extends true ? "ExtensionAPI" : never) | (Vacuous<ExtensionContext> extends true ? "ExtensionContext" : never)> = "none";
export const apiMembers: None<Unchecked<PiApi, ExtensionAPI, "ExtensionAPI.">> = "none";
export const contextFields: None<Unchecked<PiContext, ExtensionContext, "ExtensionContext.">> = "none";
export const events: None<{ [K in keyof PiEvents & string]: Vacuous<Payload<K>> extends true ? K : never }[keyof PiEvents & string]> = "none";
export const eventFields: None<{ [K in keyof PiEvents & string]: Unchecked<PiEvents[K], Payload<K>, \`\${K}.\`> }[keyof PiEvents & string]> = "none";
export const messageFields: None<Unchecked<PiMessage, typeof message, "message.">> = "none";
export const entryFields: None<Unchecked<PiContextEntry, typeof customEntry, "custom_message.">> = "none";

// Pi's own values fit the adapter's declarations.
export const apiFits: PiApi = api;
export const contextFits: PiContext = context;
export const eventsFit: PiEvents = payloads;
`;

/**
 * The declaration file of the package `name` below `types`: the `types` field of its manifest, or `index.d.ts`. In ES
 * module resolution a path that names a folder does not resolve, so the contract maps each package to this file; a
 * package that is missing maps to a file that does not exist, and its types become `any`.
 */
async function declarations(types: string, name: string): Promise<string> {
	const folder = join(types, name, "package");
	const manifest = join(folder, "package.json");
	const fields: unknown = existsSync(manifest) ? JSON.parse(await readFile(manifest, "utf8")) : {};
	const entry = typeof fields === "object" && fields !== null ? Reflect.get(fields, "types") : undefined;
	return join(folder, typeof entry === "string" ? entry : "index.d.ts");
}

/** The contract's compiler settings: the repository's, with Pi's three packages at `types` and Node's own types. */
async function contractConfig(types: string): Promise<object> {
	const entries = await Promise.all(
		PI_PACKAGES.map(async (name) => [`@earendil-works/${name}`, [await declarations(types, name)]] as const),
	);
	const paths = Object.fromEntries(entries);
	return {
		extends: REPO_CONFIG,
		compilerOptions: { skipLibCheck: true, types: ["node"], typeRoots: [TYPE_ROOTS], paths },
		files: ["contract.mts"],
		include: [],
	};
}

/** One diagnostic as `<file>:<line>: TS<code>: <message>`, the message's chain joined by line breaks. */
function described(diagnostic: ts.Diagnostic): string {
	const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
	if (diagnostic.file === undefined || diagnostic.start === undefined) {
		return `TS${diagnostic.code}: ${message}`;
	}
	const { line } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
	return `${basename(diagnostic.file.fileName)}:${line + 1}: TS${diagnostic.code}: ${message}`;
}

/** The diagnostics of the project whose `tsconfig.json` is `config`. */
function compiled(config: string): string[] {
	const read = ts.readConfigFile(config, ts.sys.readFile);
	const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, dirname(config));
	const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options });
	const diagnostics = [...(read.error ? [read.error] : []), ...parsed.errors, ...ts.getPreEmitDiagnostics(program)];
	return diagnostics.map(described);
}

/**
 * The diagnostics of the contract against the Pi type packages below `types`, a folder that holds
 * `pi-coding-agent/package`, `pi-ai/package` and `pi-agent-core/package`: empty when Pi's types fit the adapter.
 */
export async function piContract(types: string): Promise<readonly string[]> {
	const work = await mkdtemp(join(tmpdir(), "limen-pi-contract-"));
	try {
		await writeFile(
			join(work, "contract.mts"),
			CONTRACT.replace('"ADAPTER"', () => JSON.stringify(ADAPTER)),
		);
		await writeFile(join(work, "tsconfig.json"), `${JSON.stringify(await contractConfig(types), null, "\t")}\n`);
		return compiled(join(work, "tsconfig.json"));
	} finally {
		await rm(work, { recursive: true, force: true });
	}
}
