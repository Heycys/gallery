import path from "node:path";
import { ts } from "./typescript.mjs";
import { attr, hasClass, walk } from "../shared/html-tree.mjs";
import { sdkDirectory, typeRoots } from "../shared/paths.mjs";
import { lineAt, parseReport } from "./report-tree.mjs";

// The types a browser runs a classic script of (the HTML standard's JavaScript MIME type essences),
// besides none at all and "module".
const JAVASCRIPT_TYPES = new Set([
  "application/ecmascript", "application/javascript", "application/x-ecmascript", "application/x-javascript", "text/ecmascript", "text/javascript",
  "text/javascript1.0", "text/javascript1.1", "text/javascript1.2", "text/javascript1.3", "text/javascript1.4", "text/javascript1.5",
  "text/jscript", "text/livescript", "text/x-ecmascript", "text/x-javascript",
]);

// Parse real script elements (not script-looking text in comments/templates). With `diffs`, also
// the options (JSON) of declared diffs, each checked as the argument of a call of the SDK's (`call`:
// __declaredDiff(options)).
function inlineScripts(html, {diffs = false, tree = parseReport(html)} = {}) {
  const scripts = [];
  walk(tree, (node) => {
    if (node.tagName !== "script" || attr(node, "src") !== undefined) return;
    const type = (attr(node, "type") || "").trim().toLowerCase();
    const host = diffs && type === "application/json" && node.parentNode?.tagName ? node.parentNode : null;
    const call = host && hasClass(host, "doc-diff") ? "__declaredDiff(" : undefined;
    if (!call && type && type !== "module" && !JAVASCRIPT_TYPES.has(type)) return;
    const { startTag, endTag } = node.sourceCodeLocation ?? {};
    if (!startTag) return;
    scripts.push({start: startTag.endOffset, end: endTag?.startOffset ?? html.length, module: type === "module", ...(call ? {call} : {})});
  }, {inTemplates: false});
  return scripts;
}

// Everything but the scripts becomes spaces, so offsets and lines stay those of the HTML. A declared
// diff's options become the argument of its call: the call is written over the blanked start tag,
// ending where the options begin (or at the end of the nearest line above with room for it), and
// ");" over the end tag. One with no room before it at all is left out and its start offset added
// to `unchecked`, which the checks report.
function maskedSource(html, scripts, unchecked = []) {
  const parts = [];
  let cursor = 0;
  let close = "";
  const blank = (text) => text.replace(/[^\r\n]/g, " ");
  for (const {start, end, call} of scripts) {
    let gap = close + blank(html.slice(cursor + close.length, start));
    if (call) {
      const written = withCall(gap, call, close.length);
      if (written === null) {
        unchecked.push(start);
        continue;
      }
      gap = written;
    }
    parts.push(gap, html.slice(start, end));
    cursor = end;
    close = call ? ");" : "";
  }
  parts.push(close + blank(html.slice(cursor + close.length)), "\nexport {};\n");
  return parts.join("");
}

// A blanked gap with the call written over the end of the last of its lines it fits on (past the
// first `reserved` characters), or null.
function withCall(gap, call, reserved) {
  let end = gap.length;
  for (;;) {
    const lineStart = Math.max(gap.lastIndexOf("\n", end - 1) + 1, reserved);
    const usable = gap[end - 1] === "\r" ? end - 1 : end;
    if (usable - lineStart >= call.length) return gap.slice(0, usable - call.length) + call + gap.slice(usable);
    if (lineStart <= reserved) return null;
    end = lineStart - 1;
  }
}

// Keep HTML offsets so diagnostics map directly back to the editable report. `tree`: the report
// parsed (read only), when the caller has it.
export function reportScriptSource(html, tree = parseReport(html)) {
  return maskedSource(html, inlineScripts(html, {tree}));
}

// The attributes whose javascript: address a browser runs.
const LINKS = new Set(["href", "src", "action", "formaction"]);
const decoded = (text) => {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
};

// The code of a report a browser runs, piece by piece: each inline script (at its offset in the
// HTML: `start`), each handler of an on* attribute (onclick="…") and each javascript: address (on
// their attribute's `line`), with what holds it (`where`). An address is read as a browser's URL
// parser reads it: tabs and line breaks anywhere in it gone, control characters and spaces before it.
function executableCode(html, tree) {
  const pieces = inlineScripts(html, {tree}).map(({start, end}) => ({code: html.slice(start, end), start, where: "the document's script"}));
  walk(tree, (node) => {
    for (const {name, value} of node.attrs) {
      const line = node.sourceCodeLocation?.attrs?.[name]?.startLine ?? node.sourceCodeLocation?.startLine;
      const address = LINKS.has(name) ? value.replace(/[\t\n\r]/g, "").replace(/^[\u0000-\u0020]+/, "") : "";
      if (/^on[a-z]+$/.test(name)) pieces.push({code: value, line, where: `the ${name} attribute of <${node.tagName}>`});
      else if (/^javascript:/i.test(address)) pieces.push({code: decoded(address.slice("javascript:".length)), line, where: `the javascript: address of <${node.tagName} ${name}>`});
    }
  }, {inTemplates: false});
  return pieces;
}

/**
 * What reaches the network and an export's policy refuses, by a global (`codeUses`, `usesIn`): a request
 * of any kind, navigator.sendBeacon(…), and import(…), code loaded from elsewhere.
 */
export const NETWORK = new Set(["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "sendBeacon", "import"]);

const GLOBAL_OBJECTS = new Set(["window", "globalThis", "self"]);
// Whether an expression is the navigator: its name, or a global object's property.
const isNavigator = (node) => (ts.isIdentifier(node) ? node.text === "navigator" : ts.isPropertyAccessExpression(node) && node.name.text === "navigator" && ts.isIdentifier(node.expression) && GLOBAL_OBJECTS.has(node.expression.text));
// Whether a destructuring takes this element from a global object: const { fetch } = window.
function takenFromGlobal(element) {
  const { initializer } = ts.walkUpBindingElementsAndPatterns(element);
  return Boolean(initializer) && ts.isIdentifier(initializer) && GLOBAL_OBJECTS.has(initializer.text);
}
// Whether an identifier stands for the global of its name: not another object's property (window.fetch
// is the global, data.fetch is not), nor the name of an object's or a class's own member.
function namesGlobal(node) {
  const parent = node.parent;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return ts.isIdentifier(parent.expression) && GLOBAL_OBJECTS.has(parent.expression.text);
  if (ts.isBindingElement(parent) && parent.propertyName === node) return takenFromGlobal(parent);
  const member = ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent) || ts.isPropertyDeclaration(parent) || ts.isGetAccessorDeclaration(parent) || ts.isSetAccessorDeclaration(parent);
  return !(member && parent.name === node);
}

// The global of `names` a node of the code names, and the expression that stands for it: the name
// itself (fetch), the global object's property (window.fetch) or its element by a literal
// (window["fetch"]); or null.
function globalReference(node, names) {
  if (ts.isIdentifier(node) && names.has(node.text) && namesGlobal(node)) {
    return {name: node.text, reference: ts.isPropertyAccessExpression(node.parent) && node.parent.name === node ? node.parent : node};
  }
  if (ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression) && GLOBAL_OBJECTS.has(node.expression.text)
    && ts.isStringLiteralLike(node.argumentExpression) && names.has(node.argumentExpression.text)) {
    return {name: node.argumentExpression.text, reference: node};
  }
  if (ts.isPropertyAccessExpression(node) && names.has(node.name.text) && node.name.text === "sendBeacon" && isNavigator(node.expression)) return {name: "sendBeacon", reference: node};
  if (names.has("import") && ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) return {name: "import", reference: node.expression};
  return null;
}

// The scopes of a script (its tree, `file`) in which it binds one of `names` itself, by name: a
// parameter, a variable, a function's or a class's own name, what a destructuring takes (but from a
// global object, const { fetch } = window, which is the global under a name of its own). Where one
// stands, an identifier of that name is the script's own.
function boundScopes(file, names) {
  const scopes = new Map();
  const around = (node, holds) => {
    let at = node.parent;
    while (at && !holds(at)) at = at.parent;
    return at ?? file;
  };
  const inBlock = (node) => ts.isFunctionLike(node) || ts.isBlock(node) || ts.isCaseBlock(node) || ts.isForStatement(node) || ts.isForInStatement(node) || ts.isForOfStatement(node);
  const scopeOf = (node) => {
    if (ts.isFunctionExpression(node) || ts.isClassExpression(node)) return node;
    if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) return around(node, inBlock);
    if (ts.isCatchClause(node.parent)) return node.parent;
    return around(node, ts.getCombinedNodeFlags(node) & ts.NodeFlags.BlockScoped ? inBlock : ts.isFunctionLike);
  };
  const visit = (node) => {
    const binds = ts.isParameter(node) || ts.isVariableDeclaration(node) || ts.isBindingElement(node) || ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isFunctionExpression(node) || ts.isClassExpression(node);
    if (binds && node.name && ts.isIdentifier(node.name) && names.has(node.name.text) && !(ts.isBindingElement(node) && takenFromGlobal(node))) {
      scopes.set(node.name.text, [...(scopes.get(node.name.text) ?? []), scopeOf(node)]);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return scopes;
}

// Whether `node`, an identifier, stands in one of `scopes`, those binding its name.
function inScope(node, scopes = []) {
  for (let at = node; at; at = at.parent) if (scopes.includes(at)) return true;
  return false;
}

/**
 * Where the report's code uses one of the globals `names` (fetch, localStorage …): its inline scripts,
 * its on* attributes and its javascript: addresses, read as code, so a comment, a string, a code
 * sample, prose or a chart's JSON that spells a name is none, nor is a name the code binds itself (a
 * parameter, a variable); `typeof name` (asking whether there is one) is no use either. Each use, in
 * line order: { name, how ("call": name(…), "new": new name(…),
 * "use": anything else, as fetch.call(…) or const f = fetch), line, where (what holds the code: "the
 * report's script", "the onclick attribute of <button>" …) }.
 */
export function codeUses(html, names, {tree = parseReport(html)} = {}) {
  const uses = [];
  for (const {code, start, line, where} of executableCode(html, tree)) {
    for (const {name, how, at} of usesIn(code, names)) uses.push({name, how, line: line ?? lineAt(html, start + at), where});
  }
  return uses.sort((a, b) => a.line - b.line);
}

/** Where a script's `code` uses one of the globals `names`, as codeUses reads it: { name, how, at (its offset) }. */
export function usesIn(code, names) {
  if (![...names].some((name) => code.includes(name))) return [];
  const uses = [];
  const file = ts.createSourceFile("code.js", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const bound = boundScopes(file, names);
  const visit = (node) => {
    const found = globalReference(node, names);
    const user = found?.reference.parent;
    if (found && !ts.isTypeOfExpression(user) && !(ts.isIdentifier(found.reference) && inScope(node, bound.get(found.name)))) {
      const how = (ts.isCallExpression(user) || ts.isNewExpression(user)) && user.expression === found.reference ? (ts.isNewExpression(user) ? "new" : "call") : "use";
      uses.push({name: found.name, how, at: node.getStart(file)});
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return uses;
}

export function typecheckReports(reports) {
  return diagnoseReports(reports).map((diagnostic) => diagnostic.text);
}

// What a browser cannot run of a report's own script though TypeScript's checker, not its parser,
// says it: a name nothing defines ("Cannot find name", and its "Did you mean …?"), which throws where
// it runs; a name declared twice (2300 "Duplicate identifier", 2451 "Cannot redeclare block-scoped
// variable": two classic <script>s share one global scope, and a browser refuses the second's
// `const data` as a SyntaxError); a name used before its declaration (2448 a let or const, 2449 a
// class, 2450 an enum: a ReferenceError where it runs). TypeScript's grammar errors (1000 to 1999,
// an `await` in a function that is not async, a top-level `await` in a classic script) are syntax
// errors a browser refuses too, though the checker reports some of them. "Used before being
// assigned" (2454) is a type's: the browser reads undefined there.
const UNDEFINED_NAME = new Set([2304, 2552]);
const EARLY_ERROR = new Set([2300, 2451, 2448, 2449, 2450]);
const browserRefuses = (code) => UNDEFINED_NAME.has(code) || EARLY_ERROR.has(code) || (code >= 1000 && code < 2000);
// Whether the diagnostic `diagnostic` (of the masked source of `scripts`) is a type's alone in a report's
// own script: strict TypeScript's word on code a browser runs as written (a value possibly null, an
// argument of another type, a property a DOM type does not declare), which may well be what the page
// means, not a syntax error (`syntax`: the program's syntactic diagnostics, a JS file's TypeScript-only
// syntax among them, which a browser refuses), not what a browser refuses or throws on though the
// checker says it (browserRefuses), and not in a declared diff's options, which the kit reads and
// draws by (what it cannot run).
function typeOnly(diagnostic, scripts, syntax) {
  if (!diagnostic.file || syntax.has(diagnostic) || browserRefuses(diagnostic.code)) return false;
  const start = diagnostic.start ?? -1;
  return scripts.some((script) => !script.call && script.start <= start && start < script.end);
}

// What a type's note adds when d3 took numbers for something else (its message names d3's
// NumberValue, or its line, `line`, takes d3.min, d3.max or d3.extent): most often a drawing's data,
// which DocCharts.define gives untyped (any), so that d3.min and d3.max of values read from it are
// taken for strings and the arithmetic on them fails too (found testing the skill with Agents,
// 2026-10-26: an Agent changed correct code three times to quiet four such notes). Its fix is a type,
// not a guard.
const untypedNumbers = (message, line) => (/\bNumberValue\b/.test(message) || /\bd3\.(?:min|max|extent)\(/.test(line)
  ? "; here d3 reads values of no type as strings: give the data its shape once with JSDoc, /** @type {Array<{ label: string, value: number }>} */ const rows = data;, and d3.min or d3.max may give undefined (?? 0)"
  : "");

// The virtual folder of the documents (and a package's script) checked: a reports/ folder beside the SDK's
// (the package's own folder in the release, skills/gallery/ in the checkout), so that a script's JSDoc
// imports of ../../sdk/ reach the SDK wherever the document's workspace is.
const virtualReports = path.join(path.dirname(sdkDirectory), "reports");

// A program of the SDK and `files` (a full path -> the text it holds, in memory alone), its scripts
// read as a browser's: strict, but for a helper's parameter, which may stay of no type.
function programOf(files) {
  const options = {
    allowJs: true, checkJs: true, noEmit: true, allowUmdGlobalAccess: true,
    strict: true, noImplicitAny: false,
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
    // d3's types from the package's own folder, whatever folder the command runs in (gallery check in
    // a workspace far from the package: the type library is not looked for up from there): its
    // node_modules/@types, or the release's vendor/types/@types (paths.mjs typeRoots).
    types: ["d3"], typeRoots, skipLibCheck: false,
  };
  const host = ts.createCompilerHost(options);
  const readFile = host.readFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  host.readFile = (file) => files.get(path.resolve(file)) ?? readFile(file);
  host.fileExists = (file) => files.has(path.resolve(file)) || fileExists(file);
  return ts.createProgram([path.join(sdkDirectory, "index.d.ts"), ...files.keys()], options, host);
}

// What getPreEmitDiagnostics says of `program` (sorted and deduplicated: the program's own diagnostic
// objects), but for the semantic diagnostics of the libraries it reads: TypeScript's own lib files and
// the type packages (d3's), the same files from the same package each time, which the checker spent
// most of a check on (checkInterfaceDeclaration over lib.dom.d.ts: about 600 ms of a gallery check).
// Their syntax is still read, and every file the `checked` set names (a document's scripts, a block's)
// and the SDK's declarations are checked in full, as before.
function diagnosticsOf(program, checked) {
  const own = program.getSourceFiles().filter((file) => {
    const name = path.resolve(file.fileName);
    return checked.has(name) || name.startsWith(sdkDirectory + path.sep);
  });
  return ts.sortAndDeduplicateDiagnostics([
    ...program.getConfigFileParsingDiagnostics(),
    ...program.getOptionsDiagnostics(),
    ...program.getSyntacticDiagnostics(),
    ...program.getGlobalDiagnostics(),
    ...own.flatMap((file) => program.getSemanticDiagnostics(file)),
  ]);
}

// A name of the SDK's own types, none of the DOM's (Document, DocumentFragment).
const SDK_TYPE = /\bDoc[A-Z]\w*/;
// Whether a diagnostic is about what the SDK says: it names one of its types, or points at its declaration.
const ofSdk = (diagnostic, message) => SDK_TYPE.test(message) || (diagnostic.relatedInformation ?? []).some(({ file }) => file && path.resolve(file.fileName).startsWith(sdkDirectory + path.sep));

// What of a package's `assets` puts a name on its page that the SDK does not declare: a document's script
// has no such name, and only the package that asks for the asset does.
const ASSET_GLOBALS = { katex: "katex", "katex-auto-render": "renderMathInElement" };

/**
 * What strict TypeScript says of a component package's script `code`, read against the SDK, [{ line,
 * code, message, refused }]. A package's script runs in a function of its own, so what it
 * declares meets no global: it is read as a module, its lines the file's, and the comments only a
 * classic script has (a line that starts <!-- or -->) as comments. `assets`: what its manifest asks
 * for, the names those put on the page being of no type. `refused`: what fails it, a syntax error,
 * what a browser refuses or throws on (browserRefuses) and what the SDK does not say (a field
 * `context` has not, an `on` no signal is); the rest is a type's word on code a browser runs as
 * written, a note, as in a document's own script. One word on a line, however many times it stands there.
 */
export function diagnoseScript(code, { assets = [] } = {}) {
  const name = path.join(virtualReports, "__package__", "kit.js");
  const read = code.replace(/^([ \t]*)(?:<!--|-->)/gm, "$1//");
  const given = assets.filter((asset) => Object.hasOwn(ASSET_GLOBALS, asset)).map((asset) => `declare const ${ASSET_GLOBALS[asset]}: any;\n`);
  const program = programOf(new Map([[name, `${read}\nexport {};\n`], ...(given.length ? [[path.join(path.dirname(name), "assets.d.ts"), given.join("")]] : [])]));
  const syntax = new Set(program.getSyntacticDiagnostics());
  const said = new Map();
  for (const diagnostic of diagnosticsOf(program, new Set([name]))) {
    if (!diagnostic.file || path.resolve(diagnostic.file.fileName) !== name) continue;
    const { line } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");
    const key = `${line} ${message}`;
    if (!said.has(key)) said.set(key, { line: line + 1, code: diagnostic.code, message, refused: syntax.has(diagnostic) || browserRefuses(diagnostic.code) || ofSdk(diagnostic, message) });
  }
  return [...said.values()];
}

/**
 * One TypeScript program for all reports; each diagnostic names its owning report.html, or null for
 * shared SDK/library errors, and says whether it is a type's alone in the report's own script
 * (`typeOnly`, typeOnly(): gallery check says it as a note, `note`, "line 12: TS18047 in the
 * report's script: 'box' is possibly 'null'. (…)", never a failure: the Agent's own drawing code runs
 * as a browser runs it; a syntax error, a name nothing defines and what a diff's options say still
 * fail).
 */
export function diagnoseReports(reports) {
  const files = new Map();
  const owners = new Map();
  const checked = new Map(); // filename -> the scripts its masked source holds (typeOnly)
  const unchecked = [];
  for (const report of reports) {
    const scripts = inlineScripts(report.html, {diffs: true});
    const groups = [scripts.filter((script) => !script.module), ...scripts.filter((script) => script.module).map((script) => [script])];
    // Checked as if the document were in a reports/ folder beside the SDK's (a virtual home, wherever
    // its workspace is: virtualReports), so JSDoc imports of ../../sdk/ always reach the SDK.
    const home = path.join(virtualReports, path.basename(path.dirname(report.htmlPath)), path.basename(report.htmlPath));
    const skipped = [];
    groups.forEach((group, index) => {
      const filename = `${home}.${index}.js`;
      files.set(filename, maskedSource(report.html, group, skipped));
      owners.set(filename, path.resolve(report.htmlPath));
      checked.set(filename, group);
    });
    for (const offset of skipped) {
      const lines = report.html.slice(0, offset).split("\n");
      const where = path.resolve(report.htmlPath); // as the system writes it: an Agent uses it as it is
      unchecked.push({
        htmlPath: path.resolve(report.htmlPath),
        text: `${where}:${lines.length}:${lines.at(-1).length + 1} a declared diff's options could not be checked: write its <script type="application/json"> tag on a line of its own`,
      });
    }
  }
  // No document holds a script (nor a declared diff's options): nothing of theirs to check, and no
  // program is made (a second or more of reading and checking the libraries, for a check of prose).
  if (![...checked.values()].some((group) => group.length)) return unchecked;
  const program = programOf(files);
  // diagnosticsOf gives the program's own diagnostic objects (sorted, the same ones), so the
  // syntactic ones are known by identity.
  const syntax = new Set(program.getSyntacticDiagnostics());
  return [...unchecked, ...diagnosticsOf(program, new Set(files.keys())).map((diagnostic) => {
    const location = diagnostic.file?.getLineAndCharacterOfPosition(diagnostic.start || 0);
    // TypeScript reports forward-slash paths; resolve them so Windows lookups match the owner keys.
    const owner = diagnostic.file ? owners.get(path.resolve(diagnostic.file.fileName)) ?? null : null;
    const filename = owner || diagnostic.file?.fileName;
    const where = filename ? path.resolve(filename) : "SDK";
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");
    const typed = owner !== null && typeOnly(diagnostic, checked.get(path.resolve(diagnostic.file.fileName)) ?? [], syntax);
    return {
      htmlPath: owner,
      text: `${where}${location ? `:${location.line + 1}:${location.character + 1}` : ""} TS${diagnostic.code}: ${message}`,
      typeOnly: typed,
      ...(typed ? { note: `line ${location.line + 1}: TS${diagnostic.code} in the document's script (column ${location.character + 1}): ${message} (strict TypeScript's word on a type: a note, not a failure; the browser runs the script as written: guard the value where it can really be null or of another type${untypedNumbers(message, diagnostic.file.text.split("\n")[location.line] ?? "")})` } : {}),
    };
  })];
}
