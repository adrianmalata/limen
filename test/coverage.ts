// The readers behind the coverage scans of T-28 in test/registry.test.ts: the codes the code throws, read through the
// TypeScript syntax tree, and the names of the tests, with how many times each takes the shared snapshot (T-38 (4)).
import ts from "typescript";

/** A file of code by its path from the repository root. */
export type Code = { readonly path: string; readonly text: string };

/** One code a failure the code makes can carry: where it is made, the code, and whether it is a refusal or usage error. */
export type Thrown = { readonly at: string; readonly code: string; readonly refusal: boolean };

/** A registry entry as the declaration scan reads it: its name and the codes it declares (D-075). */
export type Declaring = { readonly name: string; readonly refuses: readonly string[] };

/** A registry entry as the snapshot scan reads it: its kind as well (T-04). */
export type Kinded = Declaring & { readonly kind: "read" | "change" };

/**
 * One test of a test file: its file, its name, and how many times its body takes the shared snapshot of
 * test/snapshot.ts, as written, itself or through the file's functions.
 */
export type Case = { readonly file: string; readonly name: string; readonly snapshots: number };

/** The classes T-28 (1) declares in the registry: a refusal (exit code 1) and a usage error (exit code 2). */
const DECLARED_CLASSES: ReadonlySet<string> = new Set(["refused", "usage"]);
/** The failure factories of src/outcome.ts, each with whether its failure is a refusal or a usage error. */
const FACTORIES: ReadonlyMap<string, boolean> = new Map([
	["refused", true],
	["usageError", true],
	["environmentError", false],
]);
/** How many steps deep a code is followed from a name to the calls or the function of the file that give its value. */
const DEPTH = 5;

/** What a file holds that a code can be read from: its calls by the name they call, and its functions by name. */
type Scope = {
	readonly calls: ReadonlyMap<string, readonly ts.CallExpression[]>;
	readonly functions: ReadonlyMap<string, readonly ts.SignatureDeclaration[]>;
};
/**
 * The declaration a name means: a parameter (with its function's name, undefined for a function with none, and its
 * place), a `const` of a string literal, a `const` destructured from a call of a function by name (with the property
 * it takes), or any other binding, from which no code is read.
 */
type Binding =
	| { readonly kind: "parameter"; readonly function: string | undefined; readonly index: number }
	| { readonly kind: "constant"; readonly value: string }
	| { readonly kind: "property"; readonly function: string; readonly property: string }
	| { readonly kind: "other" };
const OTHER: Binding = { kind: "other" };
/**
 * A place that makes a failure: the expression of its code, and whether its class is a refusal or usage error, or
 * undefined when its class is no literal.
 */
type Site = { readonly code: ts.Expression | undefined; readonly refusal: boolean | undefined };

/** What `thrownCodes` reads; `unknownClass` and `unreadable` are where it could not read all it needs. */
export type Codes = {
	readonly thrown: Thrown[];
	/** Each code a `new LimenError` makes whose class is no literal, so the scan cannot tell a refusal from it. */
	readonly unknownClass: Omit<Thrown, "refusal">[];
	/** Each place whose failure may be a refusal or usage error and whose code none of the rules reads. */
	readonly unreadable: string[];
};

/**
 * Every code a failure that `files` make can carry, from each call of a factory of src/outcome.ts and each
 * `new LimenError({…})`. A code is read from a literal or from both branches of a conditional. A name means its
 * innermost declaration around it, as the language's scopes resolve it: a parameter of a function gives the arguments
 * of each call of that function in the file (none for a function with no name), a `const` of a block, a function or
 * the file gives its string literal, and a `const` destructured from a call of the file's own function (`const { code
 * } = problemOf(…)`) gives the literals that property has in that function; any other binding (a `let`, an import, a
 * `const` of another value, a name declared nowhere) gives none. A `new LimenError` whose class and code are those of
 * one other failure (`class: failure.class, code: failure.code`) keeps that failure's, so it makes no new code; one
 * whose class is any other expression that is no literal gives its codes as `unknownClass`. The factories' own bodies
 * are read at their calls. So no failure passes unread: each refusal or usage error, and each failure of an unknown
 * class, whose code none of the rules finds is named in `unreadable`.
 */
export function thrownCodes(files: readonly Code[]): Codes {
	const thrown: Thrown[] = [];
	const unknownClass: Omit<Thrown, "refusal">[] = [];
	const unreadable: string[] = [];
	for (const file of files) {
		const source = ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
		const scope = scopeOf(source);
		const visit = (node: ts.Node): void => {
			const site = siteOf(node);
			if (site !== undefined) {
				const at = `${file.path}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`;
				const codes = site.code === undefined ? undefined : codesOf(site.code, scope, 0);
				if (codes === undefined && site.refusal !== false) {
					unreadable.push(`${at}: ${node.getText(source)}`);
				}
				const { refusal } = site;
				if (refusal === undefined) {
					unknownClass.push(...(codes ?? []).map((code) => ({ at, code })));
				} else {
					thrown.push(...(codes ?? []).map((code) => ({ at, code, refusal })));
				}
			}
			ts.forEachChild(node, visit);
		};
		visit(source);
	}
	return { thrown, unknownClass, unreadable };
}

/**
 * What breaks the declarations of D-075, one line each: a refusal or usage code the code makes that no entry and not
 * the shared list declares; a code an entry declares that the code makes as no refusal or usage error, or not at all;
 * a shared code the code makes nowhere; a shared code an entry declares again; and a code an entry declares twice.
 */
export function declarationProblems(
	thrown: readonly Thrown[],
	entries: readonly Declaring[],
	shared: readonly string[],
): string[] {
	const refusals = new Set(thrown.filter((site) => site.refusal).map((site) => site.code));
	const made = new Set(thrown.map((site) => site.code));
	const declared = new Set([...shared, ...entries.flatMap((entry) => entry.refuses)]);
	const problems = [...refusals]
		.filter((code) => !declared.has(code))
		.map((code) => `${code} is undeclared: ${thrown.find((site) => site.code === code)?.at}`);
	for (const entry of entries) {
		for (const [index, code] of entry.refuses.entries()) {
			if (!refusals.has(code)) {
				problems.push(`${entry.name} declares ${code}, which no refusal or usage error of the code carries`);
			}
			if (shared.includes(code)) {
				problems.push(`${entry.name} declares the shared ${code} again`);
			}
			if (entry.refuses.indexOf(code) !== index) {
				problems.push(`${entry.name} declares ${code} twice`);
			}
		}
	}
	problems.push(...shared.filter((code) => !made.has(code)).map((code) => `the shared ${code} is made nowhere`));
	return problems.sort();
}

/**
 * Every test that `files` hold: each call of `test` with its name as written, `${…}` parts included, and how many
 * calls of `snapshot`, which the file imports from test/snapshot.ts, its body makes as written: each of its own, and
 * at each call of a function of the file as many as that function makes (a function that takes it twice counts twice).
 * A call inside a loop counts once, and a recursive call adds none.
 */
export function testCases(files: readonly Code[]): Case[] {
	const cases: Case[] = [];
	for (const file of files) {
		const source = ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
		const countOf = snapshotCounts(source);
		const visit = (node: ts.Node): void => {
			const named = testName(node, source);
			if (named !== undefined && ts.isCallExpression(node)) {
				const body = node.arguments.at(-1);
				cases.push({ file: file.path, name: named, snapshots: body === undefined ? 0 : taken(body, countOf) });
			}
			ts.forEachChild(node, visit);
		};
		visit(source);
	}
	return cases;
}

/**
 * Each of `sites` as `<file> <code>`, sorted, a site that repeats another's file and code kept as often as it occurs;
 * the line is left out, so a list of them changes when a site is added or removed and not when a line above moves.
 */
export function sitesOf(sites: readonly Omit<Thrown, "refusal">[]): string[] {
	return sites.map((site) => `${site.at.slice(0, site.at.lastIndexOf(":"))} ${site.code}`).sort();
}

/** The refusal ID a test's name starts with as `CODE: …` (T-29 (2)), or undefined. */
export function codeOf(name: string): string | undefined {
	return /^([A-Z][A-Z0-9_]*): /.exec(name)?.[1];
}

/** The codes of `codes` that no test's name starts with as `CODE: …`, in order. */
export function codesWithoutTest(codes: Iterable<string>, cases: readonly Case[]): string[] {
	const named = new Set(cases.map((test) => codeOf(test.name)));
	return [...new Set(codes)].filter((code) => !named.has(code)).sort();
}

/**
 * The tests named `CODE: …` that T-38's Check holds to the shared snapshot and that do not compare it, as `<file>:
 * <name>`: the tests of each code a `change` entry declares and of each shared code, since every command, a change
 * command too, can end with a shared one (D-075). A test compares "the snapshots before and after" when it takes the
 * snapshot at least twice; one that takes it once or never is named.
 */
export function codeTestsWithoutSnapshot(
	entries: readonly Kinded[],
	shared: readonly string[],
	cases: readonly Case[],
): string[] {
	const changes = entries.filter((entry) => entry.kind === "change");
	const wanted = new Set([...shared, ...changes.flatMap((entry) => entry.refuses)]);
	return cases
		.filter((test) => test.snapshots < 2 && wanted.has(codeOf(test.name) ?? ""))
		.map((test) => `${test.file}: ${test.name}`)
		.sort();
}

/** The commands of `commands` that no test's name starts with as `limen <command words>: …` (D-076), in order. */
export function commandsWithoutSuccessTest(commands: Iterable<string>, cases: readonly Case[]): string[] {
	return [...new Set(commands)]
		.filter((command) => !cases.some((test) => test.name.startsWith(`limen ${command}: `)))
		.sort();
}

/** The calls of a file by the name they call, and its named functions by name. */
function scopeOf(source: ts.SourceFile): Scope {
	const calls = new Map<string, ts.CallExpression[]>();
	const functions = new Map<string, ts.SignatureDeclaration[]>();
	const visit = (node: ts.Node): void => {
		if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
			calls.set(node.expression.text, [...(calls.get(node.expression.text) ?? []), node]);
		}
		const named = ts.isFunctionLike(node) ? functionName(node) : undefined;
		if (ts.isFunctionLike(node) && named !== undefined) {
			functions.set(named, [...(functions.get(named) ?? []), node]);
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	return { calls, functions };
}

/** The text of a string literal, or undefined for any other expression. */
function literalOf(node: ts.Expression): string | undefined {
	return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text : undefined;
}

/**
 * The failure `node` makes, when it calls a factory or builds a `LimenError` outside a factory's body and other than
 * as a rewrap of one failure.
 */
function siteOf(node: ts.Node): Site | undefined {
	if (ts.isCallExpression(node)) {
		const name = calledName(node.expression);
		const refusal = name === undefined ? undefined : FACTORIES.get(name);
		return refusal === undefined ? undefined : { code: node.arguments[0], refusal };
	}
	if (!(ts.isNewExpression(node) && calledName(node.expression) === "LimenError")) {
		return undefined;
	}
	if (FACTORIES.has(enclosingName(node) ?? "")) {
		return undefined;
	}
	const fields = node.arguments?.[0];
	if (!(fields && ts.isObjectLiteralExpression(fields))) {
		return { code: undefined, refusal: true };
	}
	const [kind, code] = [propertyOf(fields, "class"), propertyOf(fields, "code")];
	if (rewraps(kind, code)) {
		return undefined;
	}
	const classes = branchLiterals(kind);
	return { code, refusal: classes?.some((name) => DECLARED_CLASSES.has(name)) };
}

/** Whether a class and a code are those of one other failure: `x.class` and `x.code` of the same `x`. */
function rewraps(kind: ts.Expression | undefined, code: ts.Expression | undefined): boolean {
	return (
		kind !== undefined &&
		code !== undefined &&
		ts.isPropertyAccessExpression(kind) &&
		ts.isPropertyAccessExpression(code) &&
		kind.name.text === "class" &&
		code.name.text === "code" &&
		kind.expression.getText() === code.expression.getText()
	);
}

/** The name a call or `new` calls: `name(…)` or `object.name(…)`. */
function calledName(callee: ts.Expression): string | undefined {
	if (ts.isIdentifier(callee)) {
		return callee.text;
	}
	return ts.isPropertyAccessExpression(callee) ? callee.name.text : undefined;
}

/** The value of the property `name` of an object literal: its initializer, or the name of a shorthand property. */
function propertyOf(fields: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined {
	for (const property of fields.properties) {
		if (ts.isPropertyAssignment(property) && ts.isIdentifier(property.name) && property.name.text === name) {
			return property.initializer;
		}
		if (ts.isShorthandPropertyAssignment(property) && property.name.text === name) {
			return property.name;
		}
	}
	return undefined;
}

/** The literals of a literal or of a conditional's branches; undefined when any branch is no literal. */
function branchLiterals(node: ts.Expression | undefined): string[] | undefined {
	if (node === undefined) {
		return undefined;
	}
	if (ts.isParenthesizedExpression(node)) {
		return branchLiterals(node.expression);
	}
	if (ts.isConditionalExpression(node)) {
		const [yes, no] = [branchLiterals(node.whenTrue), branchLiterals(node.whenFalse)];
		return yes && no ? [...yes, ...no] : undefined;
	}
	const value = literalOf(node);
	return value === undefined ? undefined : [value];
}

/**
 * The codes `node` can give, by the rules of `thrownCodes`; undefined when one way it can go gives none. A name is
 * read from the declaration it means (`bindingOf`), never from another declaration of the same name.
 */
function codesOf(node: ts.Expression, scope: Scope, depth: number): string[] | undefined {
	const literals = branchLiterals(node);
	if (literals !== undefined || !ts.isIdentifier(node)) {
		return literals ?? (ts.isConditionalExpression(node) ? bothBranches(node, scope, depth) : undefined);
	}
	const binding = bindingOf(node);
	switch (binding?.kind) {
		case "parameter":
			return binding.function === undefined
				? undefined
				: argumentsAt({ function: binding.function, index: binding.index }, scope, depth);
		case "constant":
			return [binding.value];
		case "property":
			return propertyCodes(binding, scope, depth);
		default:
			return undefined;
	}
}

/** The declaration `name` means: the innermost one of its name in a scope around it, or undefined when none is. */
function bindingOf(name: ts.Identifier): Binding | undefined {
	for (let current: ts.Node | undefined = name.parent; current; current = current.parent) {
		const found = declaredIn(current, name.text);
		if (found !== undefined) {
			return found;
		}
	}
	return undefined;
}

/** The declaration of `text` that `node` makes for the names inside it: a function's parameters, a block's statements. */
function declaredIn(node: ts.Node, text: string): Binding | undefined {
	if (ts.isFunctionLike(node)) {
		const index = node.parameters.findIndex((parameter) => binds(parameter.name, text));
		const parameter = node.parameters[index];
		if (parameter === undefined) {
			return undefined;
		}
		return ts.isIdentifier(parameter.name) ? { kind: "parameter", function: functionName(node), index } : OTHER;
	}
	if (ts.isCatchClause(node)) {
		return node.variableDeclaration && binds(node.variableDeclaration.name, text) ? OTHER : undefined;
	}
	if (ts.isForStatement(node) || ts.isForOfStatement(node) || ts.isForInStatement(node)) {
		const list = node.initializer;
		const bound = list && ts.isVariableDeclarationList(list) && list.declarations.some((one) => binds(one.name, text));
		return bound ? OTHER : undefined;
	}
	const statements =
		ts.isSourceFile(node) || ts.isBlock(node) || ts.isModuleBlock(node)
			? node.statements
			: ts.isCaseBlock(node)
				? node.clauses.flatMap((clause) => [...clause.statements])
				: [];
	for (const statement of statements) {
		const found = statementBinding(statement, text);
		if (found !== undefined) {
			return found;
		}
	}
	return undefined;
}

/** The declaration of `text` that one statement of a block makes, or undefined when it declares no such name. */
function statementBinding(statement: ts.Statement, text: string): Binding | undefined {
	if (ts.isVariableStatement(statement)) {
		const list = statement.declarationList;
		const declaration = list.declarations.find((one) => binds(one.name, text));
		return declaration && variableBinding(declaration, (list.flags & ts.NodeFlags.Const) !== 0, text);
	}
	if (ts.isImportDeclaration(statement)) {
		const clause = statement.importClause;
		const named = clause?.namedBindings;
		const imports =
			clause?.name?.text === text ||
			(named !== undefined &&
				(ts.isNamespaceImport(named)
					? named.name.text === text
					: named.elements.some((element) => element.name.text === text)));
		return imports ? OTHER : undefined;
	}
	const declares =
		(ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement)) &&
		statement.name?.text === text;
	return declares ? OTHER : undefined;
}

/**
 * The binding of `text` in one variable declaration: a `const` of a string literal, a `const` that takes `text` as a
 * property (`{ code }` or `{ code: text }`, with no default) of a call of a function by name, or any other binding.
 */
function variableBinding(declaration: ts.VariableDeclaration, constant: boolean, text: string): Binding {
	const value = declaration.initializer;
	if (!constant || value === undefined) {
		return OTHER;
	}
	if (ts.isIdentifier(declaration.name)) {
		const literal = literalOf(value);
		return literal === undefined ? OTHER : { kind: "constant", value: literal };
	}
	const element = ts.isObjectBindingPattern(declaration.name)
		? declaration.name.elements.find((one) => ts.isIdentifier(one.name) && one.name.text === text)
		: undefined;
	const property = element?.propertyName ?? element?.name;
	const taken =
		element !== undefined &&
		!element.dotDotDotToken &&
		element.initializer === undefined &&
		property !== undefined &&
		(ts.isIdentifier(property) || ts.isStringLiteral(property));
	if (taken && ts.isCallExpression(value) && ts.isIdentifier(value.expression)) {
		return { kind: "property", function: value.expression.text, property: property.text };
	}
	return OTHER;
}

/** Whether a binding name, a plain name or a destructuring pattern at any depth, binds `text`. */
function binds(name: ts.BindingName, text: string): boolean {
	if (ts.isIdentifier(name)) {
		return name.text === text;
	}
	return name.elements.some((element) => !ts.isOmittedExpression(element) && binds(element.name, text));
}

/**
 * The codes a property gives in the one function of the file with its name: each value the function gives that
 * property in an object literal, read by the same rules; undefined when the file has no such function or several,
 * when the function gives the property no value, or when one value gives none.
 */
function propertyCodes(
	binding: { readonly function: string; readonly property: string },
	scope: Scope,
	depth: number,
): string[] | undefined {
	const [owner, ...others] = scope.functions.get(binding.function) ?? [];
	if (owner === undefined || others.length > 0 || depth >= DEPTH) {
		return undefined;
	}
	const values: ts.Expression[] = [];
	const visit = (node: ts.Node): void => {
		if (ts.isPropertyAssignment(node) && literalName(node.name) === binding.property) {
			values.push(node.initializer);
		}
		if (ts.isShorthandPropertyAssignment(node) && node.name.text === binding.property) {
			values.push(node.name);
		}
		ts.forEachChild(node, visit);
	};
	visit(owner);
	const codes: string[] = [];
	for (const value of values) {
		const found = codesOf(value, scope, depth + 1);
		if (found === undefined) {
			return undefined;
		}
		codes.push(...found);
	}
	return codes.length > 0 ? codes : undefined;
}

/** The text of a property's name when it is a plain name or a string, or undefined. */
function literalName(name: ts.PropertyName): string | undefined {
	return ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : undefined;
}

/** The codes of both branches of a conditional whose branches are not literals. */
function bothBranches(node: ts.ConditionalExpression, scope: Scope, depth: number): string[] | undefined {
	const [yes, no] = [codesOf(node.whenTrue, scope, depth), codesOf(node.whenFalse, scope, depth)];
	return yes && no ? [...yes, ...no] : undefined;
}

/** The codes of the argument at `index` of every call of the file's function, followed `DEPTH` calls deep. */
function argumentsAt(
	parameter: { readonly function: string; readonly index: number },
	scope: Scope,
	depth: number,
): string[] | undefined {
	const calls = scope.calls.get(parameter.function) ?? [];
	if (depth >= DEPTH || calls.length === 0) {
		return undefined;
	}
	const codes: string[] = [];
	for (const call of calls) {
		const argument = call.arguments[parameter.index];
		const found = argument === undefined ? undefined : codesOf(argument, scope, depth + 1);
		if (found === undefined) {
			return undefined;
		}
		codes.push(...found);
	}
	return codes;
}

/** The name of a function: its own, or that of the variable it is the value of. */
function functionName(node: ts.SignatureDeclaration): string | undefined {
	if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) && node.name && ts.isIdentifier(node.name)) {
		return node.name.text;
	}
	const holder = node.parent;
	return holder && ts.isVariableDeclaration(holder) && ts.isIdentifier(holder.name) ? holder.name.text : undefined;
}

/** The name of the innermost named function around `node`. */
function enclosingName(node: ts.Node): string | undefined {
	for (let current = node.parent; current; current = current.parent) {
		const named = ts.isFunctionLike(current) ? functionName(current) : undefined;
		if (named !== undefined) {
			return named;
		}
	}
	return undefined;
}

/** The name of the test `node` declares, a call of `test` whose first argument is its name, or undefined. */
function testName(node: ts.Node, source: ts.SourceFile): string | undefined {
	if (!(ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "test")) {
		return undefined;
	}
	const [name] = node.arguments;
	if (name === undefined) {
		return undefined;
	}
	const plain = literalOf(name);
	return plain ?? (ts.isTemplateExpression(name) ? name.getText(source).slice(1, -1) : undefined);
}

/**
 * How many times a call of a name takes the shared snapshot in a test file: once for `snapshot`, when the file imports
 * it from test/snapshot.ts; for a named function of the file, as many times as its body does (`taken`); none for any
 * other name, and none for a call of a function whose count is still being taken, a recursive one.
 */
function snapshotCounts(source: ts.SourceFile): (name: string) => number {
	const imported = source.statements.some(
		(statement) =>
			ts.isImportDeclaration(statement) &&
			ts.isStringLiteral(statement.moduleSpecifier) &&
			/(?:^|\/)snapshot\.ts$/.test(statement.moduleSpecifier.text) &&
			statement.importClause?.namedBindings !== undefined &&
			ts.isNamedImports(statement.importClause.namedBindings) &&
			statement.importClause.namedBindings.elements.some((element) => element.name.text === "snapshot"),
	);
	const counts = new Map<string, number>(imported ? [["snapshot", 1]] : []);
	const functions = new Map<string, ts.Node>();
	const visit = (node: ts.Node): void => {
		const named = ts.isFunctionLike(node) ? functionName(node) : undefined;
		if (named !== undefined && named !== "snapshot") {
			functions.set(named, node);
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	const pending = new Set<string>();
	const countOf = (name: string): number => {
		const known = counts.get(name);
		const body = functions.get(name);
		if (known !== undefined || body === undefined || pending.has(name)) {
			return known ?? 0;
		}
		pending.add(name);
		const count = taken(body, countOf);
		pending.delete(name);
		counts.set(name, count);
		return count;
	};
	return countOf;
}

/**
 * How many times `node` takes the shared snapshot as written: at each call, the count of the name it calls; a named
 * function inside `node` adds only at its calls, so a function defined and called once counts once.
 */
function taken(node: ts.Node, countOf: (name: string) => number): number {
	let count = ts.isCallExpression(node) && ts.isIdentifier(node.expression) ? countOf(node.expression.text) : 0;
	ts.forEachChild(node, (child) => {
		if (!(ts.isFunctionLike(child) && functionName(child) !== undefined)) {
			count += taken(child, countOf);
		}
	});
	return count;
}
