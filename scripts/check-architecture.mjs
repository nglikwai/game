import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

const root = resolve('src');
const entryFiles = new Set(['main.ts', 'vite-env.d.ts']);
const errors = [];
const graph = new Map();

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : path.endsWith('.ts') ? [path] : [];
  });
}

function localModule(specifier, file) {
  if (!specifier.startsWith('@/')) return null;
  const target = resolve(root, specifier.slice(2));
  const withinSource = relative(root, target);
  if (withinSource === '..' || withinSource.startsWith('..' + sep) || isAbsolute(withinSource)) {
    errors.push(`${relative(root, file)}: alias leaves src: ${specifier}`);
    return null;
  }
  const found = [`${target}.ts`, `${target}/index.ts`].find(existsSync);
  if (!found) errors.push(`${relative(root, file)}: unresolved module ${specifier}`);
  return found;
}

for (const file of sourceFiles(root)) {
  if (dirname(file) === root && !entryFiles.has(relative(root, file))) {
    errors.push(`${relative(root, file)}: place domain modules in their owning folder`);
  }
  const source = readFileSync(file, 'utf8');
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  function inspect(node) {
    const specifier = (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      ? node.moduleSpecifier
      : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword ? node.arguments[0] : null;
    if (specifier && ts.isStringLiteral(specifier)) {
      if (specifier.text.startsWith('.')) errors.push(`${relative(root, file)}: use @/ imports instead of ${specifier.text}`);
      localModule(specifier.text, file);
      const typeOnly = ts.isImportDeclaration(node) && (node.importClause?.isTypeOnly
        || node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)
        && node.importClause.namedBindings.elements.every((binding) => binding.isTypeOnly));
      if (specifier.text.startsWith('@/scenes/') && dirname(file) !== resolve(root, 'scenes')
        && relative(root, file) !== 'main.ts' && !typeOnly) {
        errors.push(`${relative(root, file)}: systems may import scene contracts only as types`);
      }
    }
    ts.forEachChild(node, inspect);
  }
  inspect(tree);

  // Inspect emitted imports so inferred type-only references do not create false cycles.
  const emitted = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const runtime = ts.createSourceFile(file + '.js', emitted, ts.ScriptTarget.Latest, true);
  graph.set(file, runtime.statements.flatMap((node) => {
    if (!(ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) || !node.moduleSpecifier) return [];
    const target = localModule(node.moduleSpecifier.text, file);
    return target ? [target] : [];
  }));
}

const visited = new Set();
const active = new Set();
function visit(file, chain = []) {
  if (active.has(file)) {
    errors.push(`Runtime import cycle: ${[...chain.slice(chain.indexOf(file)), file].map((p) => relative(root, p)).join(' → ')}`);
    return;
  }
  if (visited.has(file)) return;
  visited.add(file);
  active.add(file);
  for (const dependency of graph.get(file) ?? []) visit(dependency, [...chain, file]);
  active.delete(file);
}
for (const file of graph.keys()) visit(file);

if (errors.length) {
  console.error([...new Set(errors)].join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Architecture checks passed: ${graph.size} source files, @/ imports, domain roots and no runtime import cycles.`);
}
