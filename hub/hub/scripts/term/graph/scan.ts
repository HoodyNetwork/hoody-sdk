// Per-file syntax facts for the terminal module graph (scripts/term/graph.ts): imports and exports (runtime vs type),
// the direct reasons a module is WEB-ONLY (each with its line), raw intrinsic JSX elements ("debt"), OpenTUI intrinsic
// tags and imports (rule R5), and which top-level exports are pure helpers (no web-only site, no JSX, no web binding).
// Syntax only (ts.createSourceFile), no checker: fast enough to re-read the whole tree on every run.
import ts from 'typescript';
import { isWebOnlyPackage } from '../resolve';

export type ImportKind = 'named' | 'namespace' | 'side' | 'dynamic' | 'require' | 'glob';

export interface ImportRec {
  spec: string;
  line: number;
  kind: ImportKind;
  /** Runtime names asked for ('default' for a default import). Empty for namespace/side/dynamic/require/glob. */
  names: string[];
  /** Names imported as types only (erased). */
  typeNames: string[];
  /** Local binding of each runtime name (for purity analysis). */
  locals: string[];
  /** `import { type A } from 'x'`: every specifier inline-type. Erased here (no runtime edge), but under
   *  verbatimModuleSyntax TypeScript keeps `import {} from 'x'`, so a bundler still evaluates x. */
  emptyKept?: boolean;
  /** import.meta.glob patterns (kind 'glob'). */
  patterns?: string[];
}

export interface ReexportRec {
  /** Exported name. */
  name: string;
  /** Specifier it comes from. */
  spec: string;
  /** Name in the source module ('*' = `export * as name`). */
  imported: string;
  type: boolean;
  line: number;
}

export type Reason = {
  kind: 'css' | 'css-module' | 'package' | 'global' | 'dom-member' | 'canvas';
  detail: string;
  line: number;
  /** Runs when the module is evaluated (not inside a function body). */
  moduleScope: boolean;
  /** Character position (purity analysis). */
  pos: number;
};

export interface LocalExport {
  name: string;
  type: boolean;
  line: number;
  /** Declaration contains JSX. */
  jsx: boolean;
  /** Declaration is a function / arrow / function-valued (memo/forwardRef) initializer. */
  fn: boolean;
  /** No web-only site, no JSX, no web-only binding, transitively over top-level declarations. */
  pure: boolean;
  /** Import bindings (local names) the declaration uses, transitively over top-level declarations. */
  importRefs: string[];
}

export interface FileFacts {
  imports: ImportRec[];
  reexports: ReexportRec[];
  /** `export * from 'x'` (type-only ones dropped). */
  stars: { spec: string; line: number }[];
  locals: LocalExport[];
  reasons: Reason[];
  raw: Record<string, number>;
  rawTotal: number;
  opentuiTags: { tag: string; line: number }[];
  opentuiImports: { spec: string; line: number }[];
  /** Code the graph cannot follow or must refuse (R7): `new Function`/`Function()`/`eval()`, `import()` or `require()`
   *  of a computed specifier. */
  forbidden: { what: string; line: number }[];
  /** Sites of strict-mode browser globals (subset of reasons: kind global). */
  globalSites: number;
  /** `typeof window` style guards: they still throw under the terminal's strict globals. */
  typeofGuards: { name: string; line: number }[];
  /** Top-level statements other than imports, exports-from, declarations and types: evaluated on load. */
  sideEffectStatements: number;
  lines: number;
  /** Runtime import bindings: local name -> where it comes from. */
  bindings: Record<string, { spec: string; imported: string }>;
  /** Runtime import bindings used ONLY inside the children of a `<Handoff>` element (the web part a hand-off wraps):
   *  the terminal Handoff never draws its children, yet the import still loads the module. */
  handoffOnly?: { local: string; spec: string; line: number }[];
  /** The file draws the kit Handoff somewhere (a JSX element whose tag is an imported `Handoff`). */
  drawsHandoff?: boolean;
  /** Value exports whose own declaration draws `<Handoff>`, directly or through another top-level declaration of the
   *  file it uses: in a .term sibling, what makes that export a hand-off (graph analyse derives the list from it). */
  handoffExports?: string[];
  /** The `reason` of every `<Handoff>` drawn here: a literal, a strings key (`t('k')`, `tt('k')`), absent, or computed. */
  handoffReasons?: { line: number; literal?: string; key?: string; missing?: boolean }[];
}

export interface ScanConfig {
  /** Globals that are not in the terminal (strict-globals.ts STRICT_GLOBALS + window/self). */
  globals: ReadonlySet<string>;
  /** A package list (an entry ending in '/' is a prefix); default: scripts/term/resolve.ts WEB_ONLY_PACKAGES, the one
   *  definition the loader and the ship build use too. */
  webPackages?: readonly string[];
}

/** The terminal resolver's own test (resolve.ts isWebOnlyPackage) over a given list, or resolve.ts's list itself. */
export function webPackageTest(list: readonly string[] | undefined): (spec: string) => boolean {
  if (!list || list.length === 0) return isWebOnlyPackage;
  return (spec) => list.some((p) => (p.endsWith('/') ? spec.startsWith(p) : spec === p || spec.startsWith(p + '/')));
}

export const OPENTUI_PACKAGE = /^@opentui\//;
/** OpenTUI intrinsic tags that are not HTML: R5. (span/b/i/u/strong/em/br/a/code/input/select/textarea are shared
 *  with HTML and count as raw-element debt instead; `text`/`image` inside an <svg> are SVG.) */
export const OPENTUI_ONLY_TAGS = new Set(['box', 'text', 'scrollbox', 'ascii-font', 'tab-select', 'line-number', 'diff', 'markdown', 'image', 'video']);
const SVG_SHARED = new Set(['text', 'image']);
/** Names R7 judges (scope-tracked so a local `eval` or `require` parameter is not the global). */
const R7_NAMES = new Set(['eval', 'Function', 'require']);
/** src/term/prim/otui(.ts), by any relative or aliased path. */
const PRIM_OTUI = /(^|\/)term\/prim\/otui(\.tsx?)?$|^\.\.?\/(\.\.\/)*otui(\.tsx?)?$|(^|\/)prim\/otui(\.tsx?)?$/;
const HTML_MEDIA = new Set(['video']);
/** DOM element members with no common non-DOM meaning: any receiver. */
export const DOM_MEMBERS = new Set([
  'getBoundingClientRect', 'scrollIntoView', 'scrollIntoViewIfNeeded', 'scrollTop', 'scrollLeft', 'scrollHeight', 'scrollWidth',
  'clientWidth', 'clientHeight', 'offsetWidth', 'offsetHeight', 'offsetTop', 'offsetLeft', 'offsetParent', 'getClientRects',
  'querySelector', 'querySelectorAll', 'closest', 'setPointerCapture', 'releasePointerCapture', 'hasPointerCapture',
  'setSelectionRange', 'selectionStart', 'selectionEnd', 'activeElement', 'parentElement', 'ownerDocument',
  'nextElementSibling', 'previousElementSibling', 'firstElementChild', 'lastElementChild', 'classList', 'showModal',
  'requestFullscreen', 'isContentEditable', 'insertAdjacentElement', 'getElementById', 'elementFromPoint', 'createElement',
  'appendChild', 'removeChild', 'contentWindow', 'contentDocument', 'getAttribute', 'setAttribute', 'removeAttribute',
  'hasAttribute', 'dataset', 'scrollBy',
]);
/** DOM members with common non-DOM meanings: counted only on a ref / event-target receiver. */
export const DOM_MEMBERS_ON_ELEMENT = new Set(['focus', 'blur', 'click', 'select', 'contains', 'matches', 'style', 'scrollTo', 'animate', 'children', 'hidden', 'remove', 'value']);
const ELEMENT_RECEIVER = /(^|\.)(current|currentTarget|target|relatedTarget|activeElement)$/;
const CANVAS_GLOBALS = new Set(['HTMLCanvasElement', 'OffscreenCanvas', 'Path2D', 'createImageBitmap', 'ImageData']);
/** window/self members the terminal really defines (strict-globals.ts). */
const WINDOW_OK = new Set(['origin', '__TSR_ROUTER__']);

const lineOf = (sf: ts.SourceFile, pos: number) => sf.getLineAndCharacterOfPosition(pos).line + 1;
const isScopeNode = (n: ts.Node) =>
  ts.isSourceFile(n) || ts.isBlock(n) || ts.isFunctionLike(n) || ts.isForStatement(n) || ts.isForInStatement(n) || ts.isForOfStatement(n)
  || ts.isCatchClause(n) || ts.isClassLike(n) || ts.isCaseBlock(n) || ts.isModuleBlock(n);

function bindingNames(name: ts.BindingName, out: string[]): void {
  if (ts.isIdentifier(name)) out.push(name.text);
  else for (const el of name.elements) if (!ts.isOmittedExpression(el)) bindingNames(el.name, out);
}

function inTypePosition(n: ts.Node): boolean {
  for (let q: ts.Node | undefined = n.parent; q; q = q.parent) {
    if (ts.isExpressionWithTypeArguments(q)) {
      const clause = q.parent;
      if (ts.isHeritageClause(clause) && clause.token === ts.SyntaxKind.ExtendsKeyword && ts.isClassLike(clause.parent)) return false;
      return true;
    }
    if (ts.isTypeNode(q)) return true;
    if (ts.isTypeAliasDeclaration(q) || ts.isInterfaceDeclaration(q)) return true;
    if (ts.canHaveModifiers(q) && ts.getModifiers(q)?.some((m) => m.kind === ts.SyntaxKind.DeclareKeyword)) return true;
    if (ts.isStatement(q) || ts.isSourceFile(q)) return false;
  }
  return false;
}

/** Is identifier `n` a value reference (not a property name, declaration name, label, specifier, JSX tag/attribute)? */
function isValueReference(n: ts.Identifier): boolean {
  const p = n.parent;
  if (!p) return false;
  if ((ts.isPropertyAccessExpression(p) || ts.isQualifiedName(p)) && (p as ts.PropertyAccessExpression).name === n) return false;
  if (ts.isQualifiedName(p)) return false;
  if ((ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p) || ts.isMethodDeclaration(p) || ts.isPropertySignature(p)
    || ts.isMethodSignature(p) || ts.isGetAccessor(p) || ts.isSetAccessor(p) || ts.isEnumMember(p)) && p.name === n) return false;
  if (ts.isBindingElement(p) && (p.propertyName === n || p.name === n)) return false;
  if ((ts.isVariableDeclaration(p) || ts.isParameter(p) || ts.isFunctionDeclaration(p) || ts.isFunctionExpression(p) || ts.isClassDeclaration(p)
    || ts.isClassExpression(p) || ts.isTypeAliasDeclaration(p) || ts.isInterfaceDeclaration(p) || ts.isEnumDeclaration(p)) && (p as ts.NamedDeclaration).name === n) return false;
  if (ts.isImportSpecifier(p) || ts.isExportSpecifier(p) || ts.isImportClause(p) || ts.isNamespaceImport(p) || ts.isNamespaceExport(p)) return false;
  if (ts.isLabeledStatement(p) || ts.isBreakStatement(p) || ts.isContinueStatement(p)) return false;
  if (ts.isJsxAttribute(p)) return false;
  if ((ts.isJsxOpeningElement(p) || ts.isJsxSelfClosingElement(p) || ts.isJsxClosingElement(p)) && p.tagName === n) return false;
  if (ts.isMetaProperty(p)) return false;
  return !inTypePosition(n);
}

function inFunctionBody(n: ts.Node): boolean {
  for (let q: ts.Node | undefined = n.parent; q; q = q.parent) {
    if (ts.isFunctionLike(q) && !ts.isClassStaticBlockDeclaration(q)) return true;
    if (ts.isPropertyDeclaration(q) && !q.modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword)) return true;
  }
  return false;
}

const hasModifier = (n: ts.Node, k: ts.SyntaxKind) => ts.canHaveModifiers(n) && !!ts.getModifiers(n)?.some((m) => m.kind === k);
const isFnInit = (e: ts.Expression | undefined): boolean => {
  if (!e) return false;
  while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e)) e = e.expression;
  if (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) return true;
  if (ts.isCallExpression(e)) {
    const callee = e.expression.getText();
    if (/(^|\.)(memo|forwardRef|lazy)$/.test(callee)) return true;
  }
  return false;
};

export function scanFile(fileName: string, text: string, cfg: ScanConfig): FileFacts {
  const kind = /\.[cm]?tsx$|\.jsx$/.test(fileName) ? ts.ScriptKind.TSX : /\.[cm]?js$/.test(fileName) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);
  const facts: FileFacts = {
    imports: [], reexports: [], stars: [], locals: [], reasons: [], raw: {}, rawTotal: 0, opentuiTags: [], opentuiImports: [], forbidden: [],
    globalSites: 0, typeofGuards: [], sideEffectStatements: 0, lines: text.split('\n').length, bindings: {},
  };
  // Bindings that make a declaration impure (web packages, CSS bindings).
  const webBindings = new Set<string>();
  const isWebPackage = webPackageTest(cfg.webPackages);
  const importBindings = new Map<string, { spec: string; imported: string; type: boolean }>();
  const addReason = (r: Omit<Reason, 'line' | 'moduleScope' | 'pos'>, node: ts.Node, moduleScope?: boolean) => {
    const pos = node.getStart(sf);
    facts.reasons.push({ ...r, line: lineOf(sf, pos), pos, moduleScope: moduleScope ?? !inFunctionBody(node) });
  };
  const specReason = (spec: string, node: ts.Node, moduleScope: boolean): void => {
    const bare = spec.replace(/[?#].*$/s, '');
    if (/\.css$/.test(bare)) addReason({ kind: /\.module\.css$/.test(bare) ? 'css-module' : 'css', detail: spec }, node, moduleScope);
    else if (isWebPackage(bare)) addReason({ kind: 'package', detail: spec }, node, moduleScope);
    if (OPENTUI_PACKAGE.test(bare)) facts.opentuiImports.push({ spec, line: lineOf(sf, node.getStart(sf)) });
    // The prim layer's OpenTUI door (el(), renderables): a RUNTIME import of it outside src/term/prim is the same as
    // importing OpenTUI (type-only imports never reach here).
    else if (PRIM_OTUI.test(bare)) facts.opentuiImports.push({ spec, line: lineOf(sf, node.getStart(sf)) });
  };

  // ---- top level: imports, exports, local declarations ----
  type TopDecl = { names: string[]; node: ts.Node; exported: boolean; type: boolean; jsx: boolean; fn: boolean };
  const tops: TopDecl[] = [];
  const localExportNames = new Map<string, string>(); // exported name -> local name (export { a as b } of a local)
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st)) {
      if (!ts.isStringLiteral(st.moduleSpecifier)) continue;
      const spec = st.moduleSpecifier.text;
      const cl = st.importClause;
      const line = lineOf(sf, st.getStart(sf));
      if (!cl) { facts.imports.push({ spec, line, kind: 'side', names: [], typeNames: [], locals: [] }); specReason(spec, st, true); continue; }
      const allType = cl.isTypeOnly;
      const rec: ImportRec = { spec, line, kind: 'named', names: [], typeNames: [], locals: [] };
      if (cl.name) {
        (allType ? rec.typeNames : rec.names).push('default');
        if (!allType) rec.locals.push(cl.name.text);
        importBindings.set(cl.name.text, { spec, imported: 'default', type: allType });
      }
      if (cl.namedBindings) {
        if (ts.isNamespaceImport(cl.namedBindings)) {
          importBindings.set(cl.namedBindings.name.text, { spec, imported: '*', type: allType });
          if (!allType) { rec.kind = 'namespace'; rec.locals.push(cl.namedBindings.name.text); }
          else rec.typeNames.push('*');
        } else {
          for (const el of cl.namedBindings.elements) {
            const imported = (el.propertyName ?? el.name).text;
            const t = allType || el.isTypeOnly;
            (t ? rec.typeNames : rec.names).push(imported);
            if (!t) rec.locals.push(el.name.text);
            importBindings.set(el.name.text, { spec, imported, type: t });
          }
          if (!allType && cl.namedBindings.elements.length > 0 && cl.namedBindings.elements.every((e) => e.isTypeOnly) && !cl.name) rec.emptyKept = true;
        }
      }
      const runtime = rec.kind === 'namespace' || rec.names.length > 0;
      if (runtime) {
        specReason(spec, st, true);
        const bare = spec.replace(/[?#].*$/s, '');
        if (/\.css$/.test(bare) || isWebPackage(bare)) for (const l of rec.locals) webBindings.add(l);
      }
      if (runtime || rec.typeNames.length > 0 || rec.emptyKept) facts.imports.push(rec);
      continue;
    }
    if (ts.isExportDeclaration(st)) {
      const line = lineOf(sf, st.getStart(sf));
      if (st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)) {
        const spec = st.moduleSpecifier.text;
        // A runtime re-export of a web-only package (`export { createPortal } from 'react-dom'`) makes this module
        // web-only exactly as an import would; a type-only one does not.
        const runtime = !st.isTypeOnly && (!st.exportClause || ts.isNamespaceExport(st.exportClause) || st.exportClause.elements.some((e) => !e.isTypeOnly));
        if (runtime) specReason(spec, st, true);
        if (!st.exportClause) { if (!st.isTypeOnly) facts.stars.push({ spec, line }); continue; }
        if (ts.isNamespaceExport(st.exportClause)) {
          facts.reexports.push({ name: st.exportClause.name.text, spec, imported: '*', type: st.isTypeOnly, line });
          continue;
        }
        for (const el of st.exportClause.elements) {
          facts.reexports.push({ name: el.name.text, spec, imported: (el.propertyName ?? el.name).text, type: st.isTypeOnly || el.isTypeOnly, line });
        }
      } else if (st.exportClause && ts.isNamedExports(st.exportClause)) {
        for (const el of st.exportClause.elements) {
          const local = (el.propertyName ?? el.name).text;
          const ib = importBindings.get(local);
          if (ib) facts.reexports.push({ name: el.name.text, spec: ib.spec, imported: ib.imported, type: st.isTypeOnly || el.isTypeOnly || ib.type, line });
          else localExportNames.set(el.name.text, local + (st.isTypeOnly || el.isTypeOnly ? '\0type' : ''));
        }
      }
      continue;
    }
    if (ts.isExportAssignment(st)) {
      tops.push({ names: ['default'], node: st, exported: true, type: false, jsx: false, fn: isFnInit(st.expression) });
      continue;
    }
    const exported = hasModifier(st, ts.SyntaxKind.ExportKeyword);
    const isDefault = hasModifier(st, ts.SyntaxKind.DefaultKeyword);
    if (ts.isTypeAliasDeclaration(st) || ts.isInterfaceDeclaration(st)) { tops.push({ names: [st.name.text], node: st, exported, type: true, jsx: false, fn: false }); continue; }
    if (ts.isModuleDeclaration(st) || hasModifier(st, ts.SyntaxKind.DeclareKeyword)) continue;
    if (ts.isFunctionDeclaration(st) && !st.body) continue; // an overload signature
    if (ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) {
      const nm = st.name?.text ?? 'default';
      tops.push({ names: isDefault ? ['default', ...(st.name ? [st.name.text] : [])] : [nm], node: st, exported, type: false, jsx: false, fn: ts.isFunctionDeclaration(st) });
      continue;
    }
    if (ts.isEnumDeclaration(st)) { tops.push({ names: [st.name.text], node: st, exported, type: false, jsx: false, fn: false }); continue; }
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        const names: string[] = [];
        bindingNames(d.name, names);
        tops.push({ names, node: d, exported, type: false, jsx: false, fn: isFnInit(d.initializer) });
        if (d.initializer && !isPureInitializer(d.initializer)) facts.sideEffectStatements++;
      }
      continue;
    }
    if (!ts.isEmptyStatement(st)) facts.sideEffectStatements++;
  }

  // ---- scopes: where each global-named binding is declared ----
  const declared = new Map<ts.Node, Set<string>>();
  const declareIn = (n: ts.Node, name: string) => {
    if (!cfg.globals.has(name) && !CANVAS_GLOBALS.has(name) && !R7_NAMES.has(name)) return;
    let q: ts.Node | undefined = n.parent;
    // A function/class declaration's name belongs to the enclosing scope; parameters to the function.
    if (ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n)) q = n.parent;
    while (q && !isScopeNode(q)) q = q.parent;
    if (!q) return;
    let s = declared.get(q);
    if (!s) declared.set(q, (s = new Set()));
    s.add(name);
  };
  const declareTop = (name: string) => {
    if (!cfg.globals.has(name) && !CANVAS_GLOBALS.has(name) && !R7_NAMES.has(name)) return;
    let s = declared.get(sf);
    if (!s) declared.set(sf, (s = new Set()));
    s.add(name);
  };
  const collect = (n: ts.Node): void => {
    if ((ts.isVariableDeclaration(n) || ts.isParameter(n)) && n.name) {
      const names: string[] = [];
      bindingNames(n.name, names);
      for (const nm of names) declareIn(n, nm);
    } else if ((ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n)) && n.name) declareIn(n, n.name.text);
    else if (ts.isImportSpecifier(n) || ts.isNamespaceImport(n)) declareTop(n.name.text);
    else if (ts.isImportClause(n) && n.name) declareTop(n.name.text);
    ts.forEachChild(n, collect);
  };
  let collected = false;
  const shadowed = (n: ts.Node, name: string): boolean => {
    if (!collected) { collected = true; collect(sf); }
    for (let q: ts.Node | undefined = n; q; q = q.parent) if (declared.get(q)?.has(name)) return true;
    return false;
  };

  // ---- body walk ----
  /** `createElement` imported from react (any local name), or `<react namespace>.createElement` (never document.createElement). */
  const fromReact = (local: string): boolean => importBindings.get(local)?.spec === 'react';
  const isReactCreateElement = (c: ts.Expression): boolean =>
    (ts.isIdentifier(c) && fromReact(c.text) && importBindings.get(c.text)?.imported === 'createElement')
    || (ts.isPropertyAccessExpression(c) && c.name.text === 'createElement' && ts.isIdentifier(c.expression) && fromReact(c.expression.text));
  const visit = (n: ts.Node, inSvg: boolean): void => {
    let childSvg = inSvg;
    if (ts.isCallExpression(n)) {
      const callee = n.expression;
      if (callee.kind === ts.SyntaxKind.ImportKeyword) {
        const a = n.arguments[0];
        if (a && ts.isStringLiteralLike(a)) {
          facts.imports.push({ spec: a.text, line: lineOf(sf, n.getStart(sf)), kind: 'dynamic', names: [], typeNames: [], locals: [] });
          specReason(a.text, n, false);
        } else facts.forbidden.push({ what: 'import() of a computed specifier (the graph and the ship build cannot follow it)', line: lineOf(sf, n.getStart(sf)) });
      } else if (ts.isIdentifier(callee) && callee.text === 'require' && !(n.arguments[0] && ts.isStringLiteralLike(n.arguments[0])) && !shadowed(n, 'require')) {
        facts.forbidden.push({ what: 'require() of a computed specifier (the graph and the ship build cannot follow it)', line: lineOf(sf, n.getStart(sf)) });
      } else if (ts.isIdentifier(callee) && (callee.text === 'eval' || callee.text === 'Function') && !shadowed(n, callee.text)) {
        facts.forbidden.push({ what: `${callee.text}() (code from a string)`, line: lineOf(sf, n.getStart(sf)) });
      } else if (isReactCreateElement(callee) && n.arguments[0] && ts.isStringLiteralLike(n.arguments[0]) && OPENTUI_ONLY_TAGS.has(n.arguments[0].text) && !HTML_MEDIA.has(n.arguments[0].text)) {
        // createElement('box') is <box> written without JSX: the same R5 refusal.
        facts.opentuiTags.push({ tag: n.arguments[0].text, line: lineOf(sf, n.getStart(sf)) });
      } else if (ts.isIdentifier(callee) && callee.text === 'require' && n.arguments[0] && ts.isStringLiteralLike(n.arguments[0])) {
        facts.imports.push({ spec: n.arguments[0].text, line: lineOf(sf, n.getStart(sf)), kind: 'require', names: [], typeNames: [], locals: [] });
        specReason(n.arguments[0].text, n, !inFunctionBody(n));
      } else if (ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'glob' && ts.isMetaProperty(n.expression.expression)) {
        const a = n.arguments[0];
        const patterns: string[] = [];
        if (a && ts.isStringLiteralLike(a)) patterns.push(a.text);
        else if (a && ts.isArrayLiteralExpression(a)) for (const e of a.elements) if (ts.isStringLiteralLike(e)) patterns.push(e.text);
        facts.imports.push({ spec: patterns.join(','), line: lineOf(sf, n.getStart(sf)), kind: 'glob', names: [], typeNames: [], locals: [], patterns });
      }
    }
    if (ts.isNewExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'Function' && !shadowed(n, 'Function')) {
      facts.forbidden.push({ what: 'new Function() (code from a string)', line: lineOf(sf, n.getStart(sf)) });
    }
    if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
      const tn = n.tagName;
      const tag = ts.isIdentifier(tn) ? tn.text : ts.isJsxNamespacedName(tn) ? tn.namespace.text + ':' + tn.name.text : '';
      if (tag && /^[a-z]/.test(tag)) {
        if (tag === 'svg') childSvg = true;
        const svgShared = inSvg && SVG_SHARED.has(tag);
        if (OPENTUI_ONLY_TAGS.has(tag) && !svgShared && !HTML_MEDIA.has(tag)) facts.opentuiTags.push({ tag, line: lineOf(sf, n.getStart(sf)) });
        else {
          facts.raw[tag] = (facts.raw[tag] ?? 0) + 1;
          facts.rawTotal++;
        }
        if (tag === 'canvas') addReason({ kind: 'canvas', detail: '<canvas>' }, n);
      }
      if (ts.isJsxOpeningElement(n)) {
        // children of an <svg> opening element are inside the svg
        const el = n.parent;
        for (const c of [n.attributes]) visit(c, inSvg);
        ts.forEachChild(el, (c) => { if (c !== n && !ts.isJsxClosingElement(c)) visit(c, childSvg); });
        return;
      }
    }
    if (ts.isJsxElement(n)) { visit(n.openingElement, inSvg); return; }
    if (ts.isIdentifier(n)) {
      const name = n.text;
      if ((cfg.globals.has(name) || CANVAS_GLOBALS.has(name)) && isValueReference(n) && !shadowed(n, name)) {
        const p = n.parent;
        const member = ts.isPropertyAccessExpression(p) && p.expression === n ? p.name.text : '';
        const isWin = name === 'window' || name === 'self';
        if (!(isWin && WINDOW_OK.has(member))) {
          const detail = isWin && member ? name + '.' + member : name;
          addReason({ kind: CANVAS_GLOBALS.has(name) ? 'canvas' : 'global', detail }, n);
          if (!CANVAS_GLOBALS.has(name)) facts.globalSites++;
          if (ts.isTypeOfExpression(p)) facts.typeofGuards.push({ name, line: lineOf(sf, n.getStart(sf)) });
        }
      }
    }
    if (ts.isPropertyAccessExpression(n)) {
      const m = n.name.text;
      const recv = n.expression;
      if (ts.isIdentifier(recv) && recv.text === 'globalThis' && cfg.globals.has(m) && !(m === 'window' || m === 'self')) {
        addReason({ kind: 'global', detail: 'globalThis.' + m }, n);
        facts.globalSites++;
      } else if (m === 'getContext' && ts.isCallExpression(n.parent) && n.parent.expression === n && n.parent.arguments[0] && ts.isStringLiteralLike(n.parent.arguments[0])) {
        addReason({ kind: 'canvas', detail: `.getContext('${n.parent.arguments[0].text}')` }, n.name);
      }
      else if ((DOM_MEMBERS.has(m) || DOM_MEMBERS_ON_ELEMENT.has(m)) && !(ts.isIdentifier(recv) && webBindings.has(recv.text))) {
        if (DOM_MEMBERS.has(m)) addReason({ kind: 'dom-member', detail: '.' + m }, n.name);
        else {
          const rtext = recv.getText(sf).replace(/[?!]/g, '');
          if (ELEMENT_RECEIVER.test(rtext)) addReason({ kind: 'dom-member', detail: rtext.replace(/^.*\./, '') + '.' + m }, n.name);
        }
      }
    }
    ts.forEachChild(n, (c) => visit(c, childSvg));
  };
  visit(sf, false);

  // ---- imports used only as <Handoff> children ----
  const handoffLocals = new Set([...importBindings].filter(([, b]) => !b.type && b.imported === 'Handoff').map(([l]) => l));
  if (handoffLocals.size) {
    const uses = new Map<string, { inside: number; outside: number }>();
    const insideHandoffChildren = (n: ts.Node): boolean => {
      for (let q: ts.Node = n; q.parent; q = q.parent) {
        const p = q.parent;
        if (ts.isJsxElement(p) && q !== p.openingElement && q !== p.closingElement) {
          const tn = p.openingElement.tagName;
          if (ts.isIdentifier(tn) && handoffLocals.has(tn.text)) return true;
        }
      }
      return false;
    };
    const walk = (n: ts.Node): void => {
      if (ts.isImportDeclaration(n)) return;
      if (ts.isIdentifier(n) && importBindings.has(n.text) && !handoffLocals.has(n.text) && !importBindings.get(n.text)!.type) {
        const p = n.parent;
        const tagUse = (ts.isJsxOpeningElement(p) || ts.isJsxSelfClosingElement(p)) && p.tagName === n;
        if ((tagUse || isValueReference(n)) && !(ts.isJsxClosingElement(p)) && !shadowed(n, n.text)) {
          const u = uses.get(n.text) ?? { inside: 0, outside: 0 };
          if (insideHandoffChildren(n)) u.inside++; else u.outside++;
          uses.set(n.text, u);
        }
      }
      ts.forEachChild(n, walk);
    };
    walk(sf);
    facts.handoffOnly = [...uses].filter(([, u]) => u.inside > 0 && u.outside === 0).map(([local]) => {
      const b = importBindings.get(local)!;
      const decl = sf.statements.find((st) => ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier) && st.moduleSpecifier.text === b.spec);
      return { local, spec: b.spec, line: decl ? lineOf(sf, decl.getStart(sf)) : 0 };
    });
  }

  // ---- purity of top-level declarations ----
  const topByName = new Map<string, TopDecl>();
  for (const t of tops) for (const nm of t.names) topByName.set(nm, t);
  const reasonPos = facts.reasons.map((r) => r.pos).sort((a, b) => a - b);
  const directImpure = new Map<TopDecl, boolean>();
  const importRefsOf = new Map<TopDecl, Set<string>>();
  const runtimeBinding = new Set<string>();
  for (const [local, b] of importBindings) if (!b.type) { runtimeBinding.add(local); facts.bindings[local] = { spec: b.spec, imported: b.imported }; }
  const refs = new Map<TopDecl, Set<TopDecl>>();
  // Purity only matters for a web-only file (what a split would free); elsewhere every value export is left unmarked.
  const analysePurity = facts.reasons.length > 0;
  for (const t of tops) {
    if (t.type || !analysePurity) continue;
    const start = t.node.getStart(sf), end = t.node.getEnd();
    let impure = reasonPos.some((p) => p >= start && p < end);
    const r = new Set<TopDecl>();
    const ir = new Set<string>();
    importRefsOf.set(t, ir);
    const walk = (n: ts.Node) => {
      if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) { t.jsx = true; impure = true; }
      if (ts.isIdentifier(n) && (webBindings.has(n.text) || topByName.has(n.text) || runtimeBinding.has(n.text)) && isValueReference(n)) {
        if (runtimeBinding.has(n.text) && !topByName.has(n.text)) ir.add(n.text);
        if (webBindings.has(n.text)) impure = true;
        const other = topByName.get(n.text);
        if (other && other !== t) r.add(other);
      }
      ts.forEachChild(n, walk);
    };
    walk(t.node);
    directImpure.set(t, impure);
    refs.set(t, r);
  }
  // propagate impurity along references (fixpoint)
  let changed = true;
  while (changed) {
    changed = false;
    for (const t of tops) {
      if (t.type || directImpure.get(t)) continue;
      for (const o of refs.get(t) ?? []) if (directImpure.get(o)) { directImpure.set(t, true); changed = true; break; }
    }
  }
  const transImports = (t: TopDecl): string[] => {
    const seen = new Set<TopDecl>([t]);
    const out = new Set<string>();
    const stack = [t];
    while (stack.length) {
      const x = stack.pop()!;
      for (const b of importRefsOf.get(x) ?? []) out.add(b);
      for (const o of refs.get(x) ?? []) if (!seen.has(o)) { seen.add(o); stack.push(o); }
    }
    return [...out];
  };
  for (const t of tops) {
    if (!t.exported) continue;
    const importRefs = t.type ? [] : transImports(t);
    for (const nm of t.names) facts.locals.push({ name: nm, type: t.type, line: lineOf(sf, t.node.getStart(sf)), jsx: t.jsx, fn: t.fn, pure: !t.type && !directImpure.get(t), importRefs });
  }
  for (const [exp, localRaw] of localExportNames) {
    const isType = localRaw.endsWith('\0type');
    const local = localRaw.replace('\0type', '');
    const t = topByName.get(local);
    facts.locals.push({ name: exp, type: isType || !!t?.type, line: t ? lineOf(sf, t.node.getStart(sf)) : 0, jsx: !!t?.jsx, fn: !!t?.fn, pure: !!t && !t.type && !directImpure.get(t), importRefs: t && !t.type ? transImports(t) : [] });
  }

  // ---- hand-off exports: declarations that draw <Handoff> (directly or through a top-level helper of this file) ----
  if (handoffLocals.size) {
    const drawsIn = (root: ts.Node): boolean => {
      let hit = false;
      const w = (x: ts.Node): void => {
        if (hit) return;
        if ((ts.isJsxOpeningElement(x) || ts.isJsxSelfClosingElement(x)) && ts.isIdentifier(x.tagName) && handoffLocals.has(x.tagName.text) && !shadowed(x, x.tagName.text)) { hit = true; return; }
        ts.forEachChild(x, w);
      };
      w(root);
      return hit;
    };
    facts.drawsHandoff = drawsIn(sf);
    const reasons: NonNullable<FileFacts['handoffReasons']> = [];
    const rw = (x: ts.Node): void => {
      if ((ts.isJsxOpeningElement(x) || ts.isJsxSelfClosingElement(x)) && ts.isIdentifier(x.tagName) && handoffLocals.has(x.tagName.text) && !shadowed(x, x.tagName.text)) {
        const line = lineOf(sf, x.getStart(sf));
        const spread = x.attributes.properties.some((a) => ts.isJsxSpreadAttribute(a));
        const at = x.attributes.properties.find((a): a is ts.JsxAttribute => ts.isJsxAttribute(a) && ts.isIdentifier(a.name) && a.name.text === 'reason');
        if (!at) { if (!spread) reasons.push({ line, missing: true }); }
        else if (!at.initializer) reasons.push({ line, literal: 'true' });
        else if (ts.isStringLiteral(at.initializer)) reasons.push({ line, literal: at.initializer.text });
        else if (ts.isJsxExpression(at.initializer) && at.initializer.expression) {
          let e = at.initializer.expression;
          while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e)) e = e.expression;
          if (ts.isStringLiteralLike(e)) reasons.push({ line, literal: e.text });
          else if (ts.isCallExpression(e) && e.arguments[0] && ts.isStringLiteralLike(e.arguments[0])) reasons.push({ line, key: e.arguments[0].text });
          else reasons.push({ line });
        }
      }
      ts.forEachChild(x, rw);
    };
    rw(sf);
    facts.handoffReasons = reasons;
    const idsOf = (root: ts.Node): Set<string> => {
      const out = new Set<string>();
      const w = (x: ts.Node): void => { if (ts.isIdentifier(x) && topByName.has(x.text)) out.add(x.text); ts.forEachChild(x, w); };
      w(root);
      return out;
    };
    const values = tops.filter((t) => !t.type);
    const drawing = new Set(values.filter((t) => drawsIn(t.node)));
    for (let grew = true; grew;) {
      grew = false;
      for (const t of values) {
        if (drawing.has(t)) continue;
        if ([...idsOf(t.node)].some((id) => { const o = topByName.get(id); return !!o && o !== t && drawing.has(o); })) { drawing.add(t); grew = true; }
      }
    }
    const out = new Set<string>();
    for (const t of drawing) if (t.exported) for (const nm of t.names) out.add(nm);
    for (const [exp, localRaw] of localExportNames) {
      if (localRaw.endsWith('\0type')) continue;
      const t = topByName.get(localRaw);
      if (t && drawing.has(t)) out.add(exp);
    }
    facts.handoffExports = [...out].sort();
  }
  return facts;
}

/** A top-level initializer with no load-time effect: literals, functions, object/array/template of those, `as const`,
 *  calls to the React helpers that only wrap (memo/forwardRef/lazy/createContext). Anything else counts as a load-time
 *  statement (sideEffectStatements). */
function isPureInitializer(e: ts.Expression): boolean {
  while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e) || ts.isTypeAssertionExpression(e)) e = e.expression;
  if (ts.isLiteralExpression(e) || ts.isNoSubstitutionTemplateLiteral(e) || e.kind === ts.SyntaxKind.TrueKeyword || e.kind === ts.SyntaxKind.FalseKeyword
    || e.kind === ts.SyntaxKind.NullKeyword || ts.isIdentifier(e) || ts.isArrowFunction(e) || ts.isFunctionExpression(e) || ts.isClassExpression(e)) return true;
  if (ts.isPrefixUnaryExpression(e)) return isPureInitializer(e.operand);
  if (ts.isArrayLiteralExpression(e)) return e.elements.every((x) => ts.isSpreadElement(x) ? isPureInitializer(x.expression) : isPureInitializer(x));
  if (ts.isObjectLiteralExpression(e)) return e.properties.every((p) => ts.isPropertyAssignment(p) ? isPureInitializer(p.initializer) : !ts.isSpreadAssignment(p) || isPureInitializer(p.expression));
  if (ts.isTemplateExpression(e)) return e.templateSpans.every((s) => isPureInitializer(s.expression));
  if (ts.isPropertyAccessExpression(e)) return isPureInitializer(e.expression);
  if (ts.isCallExpression(e)) return /(^|\.)(memo|forwardRef|lazy|createContext)$/.test(e.expression.getText()) && e.arguments.every((a) => isPureInitializer(a));
  return false;
}

/** STRICT_GLOBALS read from src/term/env/strict-globals.ts (the terminal's own list), plus window and self. */
export function readStrictGlobals(text: string | null): Set<string> {
  const out = new Set<string>(['window', 'self']);
  const fallback = ['document', 'localStorage', 'sessionStorage', 'indexedDB', 'navigator', 'matchMedia', 'requestAnimationFrame',
    'cancelAnimationFrame', 'getComputedStyle', 'ResizeObserver', 'IntersectionObserver', 'MutationObserver', 'location', 'history'];
  if (!text) { for (const g of fallback) out.add(g); return out; }
  const sf = ts.createSourceFile('strict-globals.ts', text, ts.ScriptTarget.Latest, true);
  let found = false;
  const visit = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === 'STRICT_GLOBALS' && n.initializer) {
      const scan = (m: ts.Node) => { if (ts.isStringLiteral(m)) { out.add(m.text); found = true; } ts.forEachChild(m, scan); };
      scan(n.initializer);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (!found) for (const g of fallback) out.add(g);
  return out;
}

/** A string-array constant from a source file (KIT_IMPURE in vite.config.mts; WEB_HOOKS etc. in contract.names.gen.ts). */
export function readStringArray(text: string | null, name: string): string[] | null {
  if (!text) return null;
  const sf = ts.createSourceFile('x.ts', text, ts.ScriptTarget.Latest, true);
  let out: string[] | null = null;
  const visit = (n: ts.Node) => {
    if (out) return;
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === name && n.initializer) {
      const arr: string[] = [];
      const scan = (m: ts.Node) => { if (ts.isStringLiteral(m)) arr.push(m.text); ts.forEachChild(m, scan); };
      scan(n.initializer);
      out = arr;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}
