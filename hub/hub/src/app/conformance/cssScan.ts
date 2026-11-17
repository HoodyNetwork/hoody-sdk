// Readers shared by the conformance tests that judge page styling (spacing, textarea): CSS rules with their own
// declarations, the classes a selector styles, and the CSS-module classes a TSX expression names. Test-only.
import { dirname, join, sep } from 'node:path';
import ts from 'typescript';

/** Comments blanked out, line breaks kept (so offsets still give the right line). */
export const stripCssComments = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
export const lineOf = (t: string, i: number) => t.slice(0, i).split('\n').length;

export interface Decl { prop: string; value: string; at: number }
export interface Rule { sel: string; decls: Decl[] }
/** Each style rule with its own declarations. A nested rule's selector is resolved against its parent (& replaced, or
 *  a descendant), and an at-rule (@media, @supports, @container) adds its declarations to the rule it sits in. */
export function cssRules(text: string): Rule[] {
  const s = stripCssComments(text);
  const out: Rule[] = [];
  const stack: { rule: Rule | null }[] = [];
  const owner = () => { for (let k = stack.length - 1; k >= 0; k--) { const r = stack[k]?.rule; if (r) return r; } return null; };
  const decl = (from: number, to: number) => {
    const d = s.slice(from, to);
    const c = d.indexOf(':');
    const r = owner();
    if (!r || c < 0 || !d.trim()) return;
    const lead = d.length - d.trimStart().length;
    r.decls.push({ prop: d.slice(0, c).trim().toLowerCase(), value: d.slice(c + 1).trim(), at: from + lead });
  };
  let start = 0, paren = 0, quote = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) { if (ch === quote && s[i - 1] !== '\\') quote = ''; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '(') { paren++; continue; }
    if (ch === ')') { paren = Math.max(0, paren - 1); continue; }
    if (paren) continue;
    if (ch === '{') {
      const head = s.slice(start, i).trim();
      if (head.startsWith('@')) stack.push({ rule: null });
      else {
        const parent = owner();
        // Each alternative of the parent with each alternative of the nested selector (.a, .b { & .c } = .a .c, .b .c).
        const sel = !parent ? head : splitTop(parent.sel).flatMap((p) => splitTop(head).map((h) => (h.includes('&') ? h.replace(/&/g, p.trim()) : `${p.trim()} ${h.trim()}`))).join(', ');
        const rule: Rule = { sel, decls: [] };
        out.push(rule);
        stack.push({ rule });
      }
      start = i + 1;
    } else if (ch === ';') { decl(start, i); start = i + 1; }
    else if (ch === '}') { decl(start, i); stack.pop(); start = i + 1; }
  }
  return out;
}
/** A selector list split at its top-level commas (not those inside :is(), :not() or [attr]). */
export function splitTop(sel: string): string[] {
  const parts: string[] = [];
  let depth = 0, cur = '';
  for (const ch of sel) {
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
  }
  parts.push(cur);
  return parts;
}

/** The classes of the element a selector styles: those in the last compound of each comma part, outside :not() etc.
 *  :is(.x) and :where(.x) with one argument style .x itself, so their argument stays. */
export function styledClasses(sel: string): string[] {
  return splitTop(sel).flatMap((p) => {
    let q = p;
    for (let prev = ''; prev !== q;) { prev = q; q = q.replace(/:(?:is|where)\(([^(),]*)\)/g, '$1'); }
    for (let prev = ''; prev !== q;) { prev = q; q = q.replace(/\([^()]*\)/g, ''); } // pseudo-class arguments name other elements
    q = q.replace(/\[[^\]]*\]/g, '');
    const last = q.trim().split(/\s*[>+~]\s*|\s+/).pop() ?? '';
    return [...last.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((m) => m[1] ?? '');
  });
}

export const parseTsx = (file: string, text: string) => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

/** The CSS modules a TSX file imports (default or namespace import of a relative *.module.css): local name -> its hub/src path. */
export function cssModules(sf: ts.SourceFile, file: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const n of sf.statements) {
    if (!ts.isImportDeclaration(n) || !ts.isStringLiteral(n.moduleSpecifier) || !/^\..*\.module\.css$/.test(n.moduleSpecifier.text)) continue;
    const cssFile = join(dirname(file), n.moduleSpecifier.text).split(sep).join('/');
    const c = n.importClause;
    if (c?.name) out.set(c.name.text, cssFile);
    if (c?.namedBindings && ts.isNamespaceImport(c.namedBindings)) out.set(c.namedBindings.name.text, cssFile);
  }
  return out;
}

/** The initializer of the variable a name refers to where it is used: the nearest enclosing block (or the file) that
 *  declares it. A parameter, a destructured name or a declaration without an initializer gives undefined. */
export function initializerOf(id: ts.Identifier): ts.Expression | undefined {
  for (let n: ts.Node | undefined = id.parent; n; n = n.parent) {
    if (ts.isFunctionLike(n) && n.parameters.some((p) => binds(p.name, id.text))) return undefined;
    const statements = ts.isBlock(n) || ts.isSourceFile(n) || ts.isModuleBlock(n) ? n.statements : ts.isCaseClause(n) || ts.isDefaultClause(n) ? n.statements : null;
    if (!statements) continue;
    for (const s of statements) {
      if (!ts.isVariableStatement(s)) continue;
      for (const d of s.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.name.text === id.text) return d.initializer;
        if (binds(d.name, id.text)) return undefined; // const { box } = props: declared here, value unknown
      }
    }
  }
  return undefined;
}

/** Whether a binding name (an identifier or a destructuring pattern, nested) declares `name`. */
function binds(b: ts.BindingName, name: string): boolean {
  if (ts.isIdentifier(b)) return b.text === name;
  return b.elements.some((e) => !ts.isOmittedExpression(e) && binds(e.name, name));
}

/** Every module class named anywhere in an expression (s.x, s['x']), however it is combined (cx, ternaries, templates),
 *  through the variables it names (className={inputClass}) when `follow` is set. */
export function moduleClassesIn(n: ts.Node, modules: ReadonlyMap<string, string>, found: (cssFile: string, cls: string) => void, follow = false, depth = 0): void {
  if (depth > 8) return;
  if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && modules.has(n.expression.text)) { found(modules.get(n.expression.text) ?? '', n.name.text); return; }
  if (ts.isElementAccessExpression(n) && ts.isIdentifier(n.expression) && modules.has(n.expression.text) && ts.isStringLiteralLike(n.argumentExpression)) { found(modules.get(n.expression.text) ?? '', n.argumentExpression.text); return; }
  if (ts.isPropertyAccessExpression(n)) { moduleClassesIn(n.expression, modules, found, follow, depth + 1); return; } // x.name: the name is no variable
  if (ts.isIdentifier(n)) { const init = follow ? initializerOf(n) : undefined; if (init) moduleClassesIn(init, modules, found, follow, depth + 1); return; }
  ts.forEachChild(n, (k) => moduleClassesIn(k, modules, found, follow, depth + 1));
}
