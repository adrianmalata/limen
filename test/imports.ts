// The imports of a code file, read through the TypeScript syntax tree for the tests' import scans, so that a comment,
// a string name or a line break inside an import cannot hide it from a scan as it can from a text pattern.
import ts from "typescript";

/**
 * How a file imports a module: by names (a default import counts as the name `default`), as a namespace (`import * as`,
 * `export * as`), as a star re-export (`export *`), for its side effects only (`import "…"`), or by an `import(…)` call.
 */
export type ImportForm = "named" | "namespace" | "star" | "side-effect" | "call";

/** One import of a module: an `import` declaration, an `export … from` re-export, or an `import(…)` call. */
export type Import = {
	readonly form: ImportForm;
	/** The module's path as the code gives it, or undefined when the code computes it as it runs. */
	readonly module: string | undefined;
	/** The names a named import or re-export takes from the module, each before its `as`. */
	readonly names: readonly string[];
	/** True for `import type` and `export type`, which are erased before the code runs. */
	readonly typeOnly: boolean;
	/** The code of the import, for a message. */
	readonly code: string;
};

/**
 * The imports of the code `text` of the file `path`, in their order. The path chooses how the text is read: a `.ts`,
 * `.mts` or `.cts` file as TypeScript, any other as JavaScript.
 */
export function importsOf(path: string, text: string): Import[] {
	const kind = /\.[cm]?ts$/.test(path) ? ts.ScriptKind.TS : ts.ScriptKind.JS;
	const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind);
	const found: Import[] = [];
	const visit = (node: ts.Node): void => {
		const read = importAt(node);
		if (read !== undefined) {
			found.push({ ...read, code: node.getText(source) });
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	return found;
}

/** The import that `node` is, without its code, or undefined when it is none. */
function importAt(node: ts.Node): Omit<Import, "code"> | undefined {
	if (ts.isImportDeclaration(node)) {
		const clause = node.importClause;
		const module = literalText(node.moduleSpecifier);
		if (clause === undefined) {
			return { form: "side-effect", module, names: [], typeOnly: false };
		}
		const bindings = clause.namedBindings;
		const named = bindings !== undefined && ts.isNamedImports(bindings) ? bindings.elements.map(takenName) : [];
		const names = clause.name === undefined ? named : ["default", ...named];
		const form = bindings !== undefined && ts.isNamespaceImport(bindings) ? "namespace" : "named";
		return { form, module, names, typeOnly: clause.isTypeOnly };
	}
	if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined) {
		const clause = node.exportClause;
		const form = clause === undefined ? "star" : ts.isNamespaceExport(clause) ? "namespace" : "named";
		const names = clause !== undefined && ts.isNamedExports(clause) ? clause.elements.map(takenName) : [];
		return { form, module: literalText(node.moduleSpecifier), names, typeOnly: node.isTypeOnly };
	}
	if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
		return { form: "call", module: calledModule(node.arguments[0]), names: [], typeOnly: false };
	}
	return undefined;
}

/** The name an element of a named import or re-export takes from the module: `b` in `b as c`, also as a string. */
function takenName(element: ts.ImportSpecifier | ts.ExportSpecifier): string {
	return (element.propertyName ?? element.name).text;
}

/** The text of a string or of a template with no substitution, or undefined for any other expression. */
function literalText(node: ts.Expression | undefined): string | undefined {
	return node !== undefined && ts.isStringLiteralLike(node) ? node.text : undefined;
}

/**
 * The module path that the argument of an `import(…)` call gives as a literal: a string, or a URL built from a string
 * against `import.meta.url` or from an absolute one alone, also through its `href`. Against `import.meta.url` the
 * string names the file it would name as the path of the import itself, so a scan that resolves paths reads both alike.
 */
function calledModule(argument: ts.Expression | undefined): string | undefined {
	const href = argument !== undefined && ts.isPropertyAccessExpression(argument) && argument.name.text === "href";
	const url = href ? argument.expression : argument;
	if (url === undefined || !isNewUrl(url)) {
		return literalText(argument);
	}
	const [path, base] = url.arguments ?? [];
	return base === undefined || isImportMetaUrl(base) ? literalText(path) : undefined;
}

/** Whether `node` is `new URL(…)`. */
function isNewUrl(node: ts.Expression): node is ts.NewExpression {
	return ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "URL";
}

/** Whether `node` is `import.meta.url`. */
function isImportMetaUrl(node: ts.Expression): boolean {
	return (
		ts.isPropertyAccessExpression(node) &&
		node.name.text === "url" &&
		ts.isMetaProperty(node.expression) &&
		node.expression.keywordToken === ts.SyntaxKind.ImportKeyword
	);
}
