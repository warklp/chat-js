import {
	type Expression,
	Node,
	Project,
	ScriptKind,
	SyntaxKind,
	ts,
	type VariableStatement,
} from "ts-morph";

export type StaticEnvRequirement = {
	description: string;
	options: string[][];
};

export type StaticToolMetadata = {
	envRequirements: StaticEnvRequirement[];
};

function isExportedConst(node: VariableStatement): boolean {
	return node.isExported();
}

function unwrapExpression(node: Expression): Expression {
	if (Node.isAsExpression(node) || Node.isSatisfiesExpression(node)) {
		return unwrapExpression(node.getExpression());
	}
	return node;
}

function readString(node: Expression): string | null {
	const expr = unwrapExpression(node);
	if (
		Node.isStringLiteral(expr) ||
		expr.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral
	) {
		return expr.getText().replace(/^['"`]|['"`]$/g, "");
	}
	return null;
}

function readStringArray(node: Expression): string[] | null {
	const expr = unwrapExpression(node);
	if (!Node.isArrayLiteralExpression(expr)) {
		return null;
	}

	const values: string[] = [];
	for (const element of expr.getElements()) {
		if (!Node.isExpression(element)) return null;
		const value = readString(element);
		if (value === null) return null;
		values.push(value);
	}

	return values;
}

function readEnvRequirement(node: Expression): StaticEnvRequirement | null {
	const expr = unwrapExpression(node);
	if (!Node.isObjectLiteralExpression(expr)) {
		return null;
	}

	let description: string | null = null;
	let options: string[][] | null = null;

	for (const property of expr.getProperties()) {
		if (!Node.isPropertyAssignment(property)) {
			return null;
		}

		const nameNode = property.getNameNode();
		const name =
			Node.isIdentifier(nameNode) || Node.isStringLiteral(nameNode)
				? nameNode.getText().replace(/^['"]|['"]$/g, "")
				: null;

		if (name === "description") {
			description = readString(property.getInitializerOrThrow());
		} else if (name === "options") {
			const outer = unwrapExpression(property.getInitializerOrThrow());
			if (!Node.isArrayLiteralExpression(outer)) {
				return null;
			}

			const groups: string[][] = [];
			for (const element of outer.getElements()) {
				if (!Node.isExpression(element)) return null;
				const group = readStringArray(element);
				if (group === null) return null;
				groups.push(group);
			}
			options = groups;
		}
	}

	return description && options ? { description, options } : null;
}

function readEnvRequirements(node: Expression): StaticEnvRequirement[] {
	const expr = unwrapExpression(node);
	if (!Node.isArrayLiteralExpression(expr)) {
		return [];
	}

	const requirements: StaticEnvRequirement[] = [];
	for (const element of expr.getElements()) {
		if (!Node.isExpression(element)) return [];
		const requirement = readEnvRequirement(element);
		if (!requirement) return [];
		requirements.push(requirement);
	}

	return requirements;
}

export function readStaticToolMetadata(sourceText: string): StaticToolMetadata {
	const project = new Project({
		compilerOptions: {
			allowJs: false,
			target: ts.ScriptTarget.ESNext,
		},
		useInMemoryFileSystem: true,
	});
	const sourceFile = project.createSourceFile("tool.ts", sourceText, {
		overwrite: true,
		scriptKind: ScriptKind.TS,
	});

	const envRequirements: StaticEnvRequirement[] = [];

	sourceFile.forEachDescendant((node) => {
		if (Node.isVariableStatement(node) && isExportedConst(node)) {
			for (const declaration of node.getDeclarations()) {
				if (declaration.getName() === "envRequirements") {
					const initializer = declaration.getInitializer();
					if (initializer && Node.isExpression(initializer)) {
						envRequirements.push(...readEnvRequirements(initializer));
					}
				}
			}
		}
	});

	return {
		envRequirements,
	};
}
