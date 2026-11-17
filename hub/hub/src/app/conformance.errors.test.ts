// Error details: every error a person sees has mapped words for its code and a Details
// disclosure with "Copy details for support". The kit surfaces take one `error=` prop (kit/states/ErrorDetails,
// kit/states/errorWords); core keeps the facts (core/errors.ts).
//   E1  every error surface in pages/** passes `error=` (or showErrorToast), or says why not with a
//       `noDetails: <why>` comment inside the tag or call.
//   E2  no raw API text in JSX: a rejection's `.message` shown as text or passed as a prop. Text comes from
//       the map; the API's own words appear only inside Details.
//   E3  no page string restates a sentence of the map (one map, never forked).
//   E4  no source matches the realm-mismatch text (core keeps no API message, and the API has no code of its own for
//       it), and Details shows every fact core keeps except the message and the retry wait.
// E1 and E2 started with offenders: BASELINE holds today's count per file, and the counts only go down: a file's
// count must equal its row, so a change wiring a page lowers that page's row in the same change (a failure names each
// file's count). A new file, or a count above or below its row, fails. The scans read the TypeScript syntax tree
// (spacing, conditionals, nested access and spreads included), not the text.
// Known limits (a static scan cannot be complete, it aims at the shapes pages use):
//   - E1 follows renamed imports from '@kit' (`Band as KitBand`) and a member by its last name (`Kit.ErrorState`),
//     but not a page's own wrapper component with another name that renders a surface.
//   - E2 knows a rejection by its binding (catch, `.catch(fn)`, `.then(ok, fn)`, a const alias of one) or by the
//     usual names (e, err, error, ...); a value passed into a translation (`t('k', { m: e.message })`) is not followed.
//   - E3 reads the page strings files, not text written directly in TSX.
import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { errorInfo, type ErrorInfo } from '@core';
import { errorLines, errorText } from '../kit/states/ErrorDetails';
import { makeT } from '@kit';
import { ERROR_WORD_KEYS } from '../kit/states/errorWords';
import kitStateStrings from '../kit/states/strings.en.json';

const SRC = join(import.meta.dirname, '..');
const ALL = readdirSync(SRC, { recursive: true, encoding: 'utf8' }).map((f) => f.split(sep).join('/'));
const isSource = (f: string) => /\.tsx?$/.test(f) && !/\.(test|spec)\.tsx?$/.test(f) && !f.endsWith('/conformance.allow.ts') && !f.endsWith('/fixtures.ts') && !f.endsWith('/shots.ts');
const read = (keep: (f: string) => boolean): Record<string, string> => Object.fromEntries(ALL.filter(keep).map((f) => [f, readFileSync(join(SRC, f), 'utf8')]));
const pages = read((f) => isSource(f) && /^pages\/[^/]+\//.test(f));
const only = process.env.HUB_CHECK_PAGE;
const inScope = (file: string): boolean => !only || file.startsWith(`pages/${only}/`);

const SURFACES = new Set(['ErrorState', 'OutcomeBanner', 'OutcomeSlot', 'Outcome', 'FormFooter', 'Band']);
const parse = (text: string, file: string): ts.SourceFile =>
  ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

function walk(node: ts.Node, visit: (n: ts.Node) => void): void {
  visit(node);
  node.forEachChild((c) => walk(c, visit));
}

/** A JSX attribute's or object property's value when it is a plain string ("done", 'danger', "done" as const), else
 *  null. */
function literal(e: ts.Expression | ts.JsxAttributeValue | undefined): string | null {
  if (!e) return null;
  if (ts.isJsxExpression(e)) return e.expression ? literal(e.expression) : null;
  if (ts.isJsxElement(e) || ts.isJsxSelfClosingElement(e) || ts.isJsxFragment(e)) return null;
  const b = bare(e);
  return ts.isStringLiteral(b) || ts.isNoSubstitutionTemplateLiteral(b) ? b.text : null;
}

/** A property's or attribute's name when it is written out (`tone`, `'tone'`, `['tone']`), else null. */
function nameOf(n: ts.PropertyName | ts.JsxAttributeName): string | null {
  if (ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
  if (ts.isComputedPropertyName(n)) return ts.isStringLiteralLike(n.expression) ? n.expression.text : null;
  if (ts.isJsxNamespacedName(n)) return null;
  return n.getText();
}

type Value = ts.Expression | ts.JsxAttributeValue | null;
/** Props in the order they apply. `open`: something unread (a spread, a computed key) came after every name not in
 *  `known`, so such a name may hold anything. */
interface Props {
  known: Map<string, Value>;
  open: boolean;
}
/** A spread's or value's expression without parentheses, casts and `!`. */
function bare(e: ts.Expression): ts.Expression {
  while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e) || ts.isNonNullExpression(e) || ts.isTypeAssertionExpression(e)) e = e.expression;
  return e;
}

const unread = (props: Props) => {
  props.known.clear();
  props.open = true;
};

function readObject(o: ts.ObjectLiteralExpression, props: Props): void {
  for (const p of o.properties) {
    if (ts.isSpreadAssignment(p)) {
      const e = bare(p.expression);
      if (ts.isObjectLiteralExpression(e)) readObject(e, props);
      else unread(props);
      continue;
    }
    const name = p.name ? nameOf(p.name) : null;
    if (name === null) unread(props);
    else props.known.set(name, ts.isPropertyAssignment(p) ? p.initializer : ts.isShorthandPropertyAssignment(p) ? p.name : null);
  }
}

function readTag(tag: ts.JsxOpeningElement | ts.JsxSelfClosingElement): Props {
  const props: Props = { known: new Map(), open: false };
  for (const a of tag.attributes.properties) {
    if (ts.isJsxSpreadAttribute(a)) {
      const e = bare(a.expression);
      if (ts.isObjectLiteralExpression(e)) readObject(e, props);
      else unread(props);
    } else {
      const name = nameOf(a.name);
      if (name === null) unread(props);
      else props.known.set(name, a.initializer ?? null);
    }
  }
  return props;
}

/** 'absent', 'unknown' (an unread spread may set it), or the value as written. */
function prop(props: Props, name: string): 'absent' | 'unknown' | { value: Value } {
  if (props.known.has(name)) return { value: props.known.get(name) ?? null };
  return props.open ? 'unknown' : 'absent';
}

/** Whether a prop holds something: written and not `null`/`undefined` (`error={undefined}` wires nothing). */
function present(v: ReturnType<typeof prop>): boolean {
  if (typeof v === 'string') return false;
  let e: Value = v.value;
  if (e && ts.isJsxExpression(e)) e = e.expression ?? null;
  if (e === null) return true; // a bare attribute (`<X error />`)
  return holdsValue(e as ts.Expression);
}

/** Every way the expression can come out holds something: `a ? e : undefined` and `ok && e` can come out empty;
 *  `a ?? b` and `a || b` hold something when `b` does. */
function holdsValue(e: ts.Expression): boolean {
  const b = bare(e);
  if (b.kind === ts.SyntaxKind.NullKeyword || (ts.isIdentifier(b) && b.text === 'undefined') || ts.isVoidExpression(b)) return false;
  if (ts.isConditionalExpression(b)) return holdsValue(b.whenTrue) && holdsValue(b.whenFalse);
  if (ts.isBinaryExpression(b)) {
    const op = b.operatorToken.kind;
    if (op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.BarBarToken) return holdsValue(b.right);
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) return false;
  }
  return true;
}

/** A `noDetails: <why>` comment written on this surface itself (in its own tag or call, not inside a nested element). */
function exempt(node: ts.Node, sf: ts.SourceFile): boolean {
  const start = node.getStart(sf);
  let text = sf.text.slice(start, node.getEnd());
  // Blank nested JSX: a reason there belongs to that element.
  walk(node, (n) => {
    if (n !== node && (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n))) {
      const a = n.getStart(sf) - start;
      const z = n.getEnd() - start;
      text = text.slice(0, a) + ' '.repeat(z - a) + text.slice(z);
    }
  });
  const comments = text.match(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g) ?? [];
  return comments.some((c) => /noDetails:\s*[^\s*/]/.test(c));
}

/** The names a file gives the kit's surfaces: `import { ErrorState as Failure } from '@kit'` (Failure → ErrorState)
 *  and `import * as Kit from '@kit'` (Kit.ErrorState). A same-named page wrapper (billing's own `Band`) still counts
 *  at each use: it passes no Details unless it takes `error=` too. */
interface KitNames {
  alias: Map<string, string>;
}
const isKit = (spec: string) => spec === '@kit' || /(^|\/)kit(\/|$)/.test(spec);
function kitNames(sf: ts.SourceFile): KitNames {
  const out: KitNames = { alias: new Map() };
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier) || !isKit(st.moduleSpecifier.text)) continue;
    const b = st.importClause?.namedBindings;
    if (b && ts.isNamedImports(b)) for (const el of b.elements) out.alias.set(el.name.text, (el.propertyName ?? el.name).text);
  }
  return out;
}
/** The surface name a tag or callee stands for (`Kit.ErrorState` and `x.showToast` by their last name), or null. */
function kitName(e: ts.Node, k: KitNames): string | null {
  if (ts.isIdentifier(e)) return k.alias.get(e.text) ?? e.text;
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  return null;
}

/** A written value that is one of `safe` (a literal "done", 'neutral', 'ok'): only then is the surface not an error. */
function safeValue(v: ReturnType<typeof prop>, safe: readonly string[]): boolean {
  if (typeof v === 'string') return false;
  const lit = literal(v.value ?? undefined);
  return lit !== null && safe.includes(lit);
}

/** E1: one error surface without `error=`: false for a wired one, a literal done one, a neutral Band, or a noDetails: reason. */
function tagUnwired(tag: ts.JsxOpeningElement | ts.JsxSelfClosingElement, sf: ts.SourceFile, k: KitNames): boolean {
  const name = kitName(tag.tagName, k);
  if (name === null || !SURFACES.has(name)) return false;
  if (exempt(tag, sf)) return false;
  const props = readTag(tag);
  if (present(prop(props, 'error'))) return false;
  // Not error surfaces: a literal done banner/line, and a Band that is not warn/danger (no tone at all is neutral).
  if (name === 'Band') {
    const tone = prop(props, 'tone');
    if (tone === 'absent') return false;
    const lit = typeof tone === 'object' ? literal(tone.value ?? undefined) : null;
    return lit === null || lit === 'warn' || lit === 'danger';
  }
  const kind = prop(props, name === 'OutcomeBanner' ? 'kind' : 'outcome');
  // Not error surfaces either: a literal done outcome, or none at all (`outcome={null}`, an idle slot).
  if (name !== 'ErrorState' && (safeValue(kind, ['done', 'idle']) || doneObject(kind) || nullValue(kind))) return false;
  return true;
}

/** `outcome={null}`: written as no outcome. */
function nullValue(v: ReturnType<typeof prop>): boolean {
  if (typeof v === 'string' || !v.value) return false;
  const e = ts.isJsxExpression(v.value) ? v.value.expression : v.value;
  return !!e && ts.isExpression(e) && bare(e).kind === ts.SyntaxKind.NullKeyword;
}

/** `outcome={{ kind: 'done', … }}`: a written done outcome object. */
function doneObject(v: ReturnType<typeof prop>): boolean {
  if (typeof v === 'string' || !v.value) return false;
  const e = ts.isJsxExpression(v.value) ? v.value.expression : v.value;
  if (!e || !ts.isExpression(e) || !ts.isObjectLiteralExpression(bare(e))) return false;
  const props: Props = { known: new Map(), open: false };
  readObject(bare(e) as ts.ObjectLiteralExpression, props);
  return safeValue(prop(props, 'kind'), ['done']);
}

/** E1: one showToast call that is an error/warn/unknown toast (or may be: a tone not written out) without details. */
function toastUnwired(call: ts.CallExpression, sf: ts.SourceFile, k: KitNames): boolean {
  if (kitName(call.expression, k) !== 'showToast') return false;
  if (exempt(call, sf)) return false;
  return contentUnwired(call.arguments[0]);
}

/** A toast's content: an object literal is read in order; `a ? {…} : {…}` is read on both sides; anything else may be
 *  an error toast without details (counted). */
function contentUnwired(raw: ts.Expression | undefined): boolean {
  const arg = raw && bare(raw);
  if (arg && ts.isConditionalExpression(arg)) return contentUnwired(arg.whenTrue) || contentUnwired(arg.whenFalse);
  if (!arg || !ts.isObjectLiteralExpression(arg)) return true;
  const props: Props = { known: new Map(), open: false };
  readObject(arg, props);
  if (present(prop(props, 'details'))) return false;
  const tone = prop(props, 'tone');
  return tone !== 'absent' && !safeValue(tone, ['ok', 'info']);
}

/** E1: the error surfaces of one file that pass no `error=` and give no `noDetails:` reason. */
export function surfacesWithoutDetails(text: string, file = 'x.tsx'): number {
  const sf = parse(text, file);
  const k = kitNames(sf);
  let n = 0;
  walk(sf, (node) => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && tagUnwired(node, sf, k)) n++;
    else if (ts.isCallExpression(node) && toastUnwired(node, sf, k)) n++;
  });
  return n;
}

// E2: a rejection's message shown as JSX text or handed to a prop/field. A rejection is a `catch (x)` binding, the
// parameter of a `.catch(fn)` or `.then(ok, fn)` handler, a name that holds rejections in pages, or a property that
// does (`result.error`, `r.failure`); a cast counts too: `{(e as Error).message}`. A message kept in a local const
// (`const msg = e.message`) counts where that const is shown.
const REJECTION = /^(?:e|err|error|ex|caught|failure|problem|reason|rej|rejection)$/;
const REJECTION_FIELD = /^(?:error|err|failure|rejection|problem|reason|cause)$/;
const SHOWN_FIELDS = new Set(['body', 'detail', 'message', 'text', 'title']);

function holdsRejection(e: ts.Expression, bound: ReadonlySet<string>): boolean {
  if (ts.isParenthesizedExpression(e) || ts.isNonNullExpression(e) || ts.isAsExpression(e) || ts.isTypeAssertionExpression(e) || ts.isSatisfiesExpression(e))
    return holdsRejection(e.expression, bound);
  if (ts.isIdentifier(e)) return REJECTION.test(e.text) || bound.has(e.text);
  if (ts.isPropertyAccessExpression(e)) return REJECTION_FIELD.test(e.name.text);
  if (ts.isElementAccessExpression(e)) return ts.isStringLiteralLike(e.argumentExpression) && REJECTION_FIELD.test(e.argumentExpression.text);
  return false;
}

// String methods that keep the text (`e.message.trim()` still shows the API's words).
const KEEPS_TEXT = new Set(['trim', 'trimStart', 'trimEnd', 'slice', 'substring', 'toString', 'replace', 'replaceAll', 'padEnd', 'padStart', 'concat', 'toLowerCase', 'toUpperCase', 'at']);

/** Whether the value flows, through ?:, &&, ||, ??, +, String(…), a text-keeping string method, a template, parentheses
 *  or casts, into JSX text, a JSX prop or a shown field. */
function shown(node: ts.Node): boolean {
  let cur = node;
  for (let p = cur.parent; p; cur = p, p = p.parent) {
    if (ts.isJsxExpression(p)) return true;
    if (ts.isPropertyAccessExpression(p) && p.expression === cur && KEEPS_TEXT.has(p.name.text) && p.parent && ts.isCallExpression(p.parent) && p.parent.expression === p) continue;
    if (ts.isCallExpression(p)) {
      const callee = p.expression;
      if (ts.isPropertyAccessExpression(callee) && callee === cur && KEEPS_TEXT.has(callee.name.text)) continue;
      if (ts.isIdentifier(callee) && callee.text === 'String' && p.arguments[0] === cur) continue;
      // An argument that becomes part of the text: `"Oops: ".concat(e.message)`, `.replace(x, e.message)`.
      if (ts.isPropertyAccessExpression(callee) && (callee.name.text === 'concat' ? p.arguments.includes(cur as ts.Expression) : /^replace(?:All)?$/.test(callee.name.text) && p.arguments[1] === cur)) continue;
      return false;
    }
    if (ts.isPropertyAssignment(p)) {
      const field = nameOf(p.name);
      return p.initializer === cur && field !== null && SHOWN_FIELDS.has(field) && !consoleOnly(p.parent);
    }
    if (ts.isConditionalExpression(p)) {
      if (p.condition === cur) return false;
      continue;
    }
    if (ts.isBinaryExpression(p)) {
      const op = p.operatorToken.kind;
      if (op === ts.SyntaxKind.AmpersandAmpersandToken || op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) {
        // `e && e.message`: the right side is what shows; a left side is only tested (or shows only when falsy).
        if (op === ts.SyntaxKind.AmpersandAmpersandToken && p.left === cur) return false;
        continue;
      }
      if (op === ts.SyntaxKind.PlusToken) continue;
      return false;
    }
    if (ts.isParenthesizedExpression(p) || ts.isAsExpression(p) || ts.isNonNullExpression(p) || ts.isSatisfiesExpression(p)) continue;
    if (ts.isTemplateSpan(p) || ts.isTemplateExpression(p)) continue;
    return false;
  }
  return false;
}

const unwrap = (n: ts.Node): ts.Node => {
  let cur = n;
  while (cur.parent && (ts.isParenthesizedExpression(cur.parent) || ts.isAsExpression(cur.parent) || ts.isNonNullExpression(cur.parent) || ts.isSatisfiesExpression(cur.parent))) cur = cur.parent;
  return cur;
};
const isConsoleCall = (n: ts.Node): boolean =>
  ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && ts.isIdentifier(n.expression.expression) && n.expression.expression.text === 'console';
/** The references of a local const (same name, anywhere in the file but its own declaration). */
function refsOf(decl: ts.VariableDeclaration): ts.Identifier[] {
  if (!ts.isIdentifier(decl.name)) return [];
  const name = decl.name.text;
  const out: ts.Identifier[] = [];
  walk(decl.getSourceFile(), (n) => {
    if (ts.isIdentifier(n) && n.text === name && n !== decl.name && !(ts.isPropertyAccessExpression(n.parent) && n.parent.name === n) && !(ts.isPropertyAssignment(n.parent) && n.parent.name === n)) out.push(n);
  });
  return out;
}
/** An object literal that only ever reaches console.*: written as its argument, or kept in a const used only there. */
function consoleOnly(obj: ts.Node): boolean {
  const top = unwrap(obj);
  if (top.parent && isConsoleCall(top.parent)) return true;
  if (top.parent && ts.isVariableDeclaration(top.parent) && top.parent.initializer === top) {
    const refs = refsOf(top.parent);
    return refs.length > 0 && refs.every((r) => { const u = unwrap(r); return !!u.parent && isConsoleCall(u.parent); });
  }
  return false;
}
/** Names bound to a rejection in this file: `catch (x)`, `.catch((x) => …)`, `.then(ok, (x) => …)`. */
function rejectionBindings(sf: ts.SourceFile): Set<string> {
  const out = new Set<string>();
  const param = (f: ts.Expression | undefined) => {
    const fn = f && bare(f);
    if (fn && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) && fn.parameters[0] && ts.isIdentifier(fn.parameters[0].name)) out.add(fn.parameters[0].name.text);
  };
  walk(sf, (n) => {
    if (ts.isCatchClause(n) && n.variableDeclaration && ts.isIdentifier(n.variableDeclaration.name)) out.add(n.variableDeclaration.name.text);
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      if (n.expression.name.text === 'catch') param(n.arguments[0]);
      if (n.expression.name.text === 'then') param(n.arguments[1]);
    }
  });
  return out;
}

export function rawMessages(text: string, file = 'x.tsx'): number {
  const sf = parse(text, file);
  const bound = rejectionBindings(sf);
  let n = 0;
  walk(sf, (node) => {
    const message =
      (ts.isPropertyAccessExpression(node) && node.name.text === 'message') ||
      (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression) && node.argumentExpression.text === 'message');
    if (!message || !holdsRejection(node.expression, bound)) return;
    if (shown(node)) n++;
    else {
      // `const msg = e.message`: counted once if that const is shown anywhere.
      const top = unwrap(node);
      if (top.parent && ts.isVariableDeclaration(top.parent) && top.parent.initializer === top && refsOf(top.parent).some((r) => shown(r))) n++;
    }
  });
  return n;
}

// E4: the realm phrase in the usual spellings: plain, a regex's \s, \x20 or a class of them ([ ], [\x20]) with ?, *, + or
// {n,m}, or a string split around +.
const REALM_PHRASE = /requested(?:\s|\\s|\\x20|\[(?:\s|\\s|\\x20)+\]|[+*?]|\{\d*,?\d*\}|['"`]\s*\+\s*['"`])*realm/i;

function counts(fn: (text: string, file: string) => number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [file, text] of Object.entries(pages)) {
    const n = fn(text, file);
    if (n > 0) out[file] = n;
  }
  return out;
}

/** Exactly the baseline: a count above its row fails, and so does one below it (lower the row in the same change), so
 *  a site wired in a file never makes room for a new raw one there. A file not listed may have none. */
function offRowsIn(found: Record<string, number>, baseline: Readonly<Record<string, number>>, fix: string, keep: (file: string) => boolean): string[] {
  const files = new Set([...Object.keys(found), ...Object.keys(baseline)]);
  return [...files]
    .filter((file) => keep(file) && (found[file] ?? 0) !== (baseline[file] ?? 0))
    .sort()
    .map((file) => {
      const n = found[file] ?? 0;
      const row = baseline[file] ?? 0;
      return n > row ? `${file}: ${n} (allowed ${row}): ${fix}` : `${file}: ${n}, below its row ${row}: wiring error= on a page: lower that page's row to ${n} in the same change`;
    });
}
const ratchet = (found: Record<string, number>, baseline: Readonly<Record<string, number>>, fix: string) => expect(offRowsIn(found, baseline, fix, inScope)).toEqual([]);

// Today's offenders (syntax-tree scan). Counts only go
// down, and each file's count equals its row.
const E1_BASELINE: Readonly<Record<string, number>> = {
  'pages/account/parts/CodeSheet.tsx': 3,
  'pages/account/parts/PasswordSheet.tsx': 2,
  'pages/account/parts/ProfileSection.tsx': 1,
  'pages/account/parts/SessionsSection.tsx': 1,
  'pages/account/parts/SetupSheet.tsx': 2,
  'pages/account/parts/TwoFactorSection.tsx': 2,
  'pages/account/view.tsx': 4,
  'pages/ai/parts/Accounts.tsx': 1,
  'pages/ai/parts/Advanced.tsx': 1,
  'pages/ai/parts/Claude.tsx': 2,
  'pages/ai/parts/Default.tsx': 1,
  'pages/ai/parts/EndpointStep.tsx': 4,
  'pages/ai/parts/GptStep.tsx': 1,
  'pages/ai/parts/KeyStep.tsx': 1,
  'pages/ai/parts/Summary.tsx': 1,
  'pages/apps/launch/AppLauncher.tsx': 3,
  'pages/apps/launch/LaunchHold.tsx': 1,
  'pages/apps/parts/Inspector.tsx': 1,
  'pages/apps/parts/OptionsDrawer.tsx': 2,
  'pages/billing/parts/Bands.tsx': 2,
  'pages/billing/parts/CheckoutDrawer.tsx': 1,
  'pages/billing/parts/Funds.tsx': 2,
  'pages/billing/parts/SubscriptionsSection.tsx': 4,
  'pages/billing/parts/WalletRail.tsx': 2,
  'pages/billing/widget.tsx': 3,
  'pages/board/broadcast/Broadcast.tsx': 9,
  'pages/board/options/Panel.tsx': 2,
  'pages/board/parts/BoardView.tsx': 3,
  'pages/board/parts/NotesNew.tsx': 1,
  'pages/board/parts/Picker.tsx': 4,
  'pages/board/parts/ProgramView.tsx': 2,
  'pages/board/parts/SshForm.tsx': 2,
  'pages/board/parts/SshGate.tsx': 1,
  'pages/board/parts/Tile.tsx': 2,
  'pages/bots/parts/ActivityTab.tsx': 2,
  'pages/bots/parts/BotPane.tsx': 3,
  'pages/bots/parts/ChatAppsTab.tsx': 4,
  'pages/bots/parts/ChatSettings.tsx': 1,
  'pages/bots/parts/GateCard.tsx': 1,
  'pages/bots/parts/LinkDrawers.tsx': 7,
  'pages/bots/parts/LinkTab.tsx': 6,
  'pages/bots/parts/NewBotDrawer.tsx': 4,
  'pages/bots/parts/SettingsDrawer.tsx': 4,
  'pages/bots/parts/WorkTab.tsx': 1,
  'pages/bots/view.tsx': 1,
  'pages/bots/widget.tsx': 1,
  'pages/computers/parts/AccessDrawer.tsx': 2,
  'pages/computers/parts/ExitIp.tsx': 2,
  'pages/computers/parts/Held.tsx': 1,
  'pages/computers/parts/Overview.tsx': 1,
  'pages/computers/parts/Run.tsx': 3,
  'pages/computers/parts/ServerDetail.commands.tsx': 7,
  'pages/computers/parts/ZeroState.tsx': 1,
  'pages/computers/widget.tsx': 1,
  'pages/demo/view.tsx': 1,
  'pages/files/storage/StorageTab.tsx': 4,
  'pages/guide/parts/FactsRail.tsx': 1,
  'pages/guide/parts/Sections.tsx': 1,
  'pages/home/parts/Bands.tsx': 2,
  'pages/home/parts/SetupPanel.tsx': 6,
  'pages/home/parts/WidgetFrame.tsx': 1,
  'pages/home/view.tsx': 1,
  'pages/keys/parts/CopyKeyDrawer.tsx': 1,
  'pages/keys/parts/EditKeyDrawer.tsx': 1,
  'pages/keys/parts/Elsewhere.tsx': 1,
  'pages/keys/parts/KeyInspector.tsx': 1,
  'pages/keys/parts/KeysTab.tsx': 8,
  'pages/keys/parts/MintPanels.tsx': 2,
  'pages/keys/parts/NewKeyDrawer.tsx': 1,
  'pages/keys/parts/ShareDrawer.tsx': 4,
  'pages/keys/parts/SharedTab.tsx': 8,
  'pages/keys/parts/SshTab.tsx': 4,
  'pages/keys/parts/mint-flow.ts': 2,
  'pages/logs/parts/Bands.tsx': 1,
  'pages/logs/parts/Dialogs.tsx': 1,
  'pages/logs/parts/ExplainDrawer.tsx': 3,
  'pages/logs/parts/Inspector.tsx': 1,
  'pages/notes/holds.ts': 1,
  'pages/notes/view.tsx': 1,
  'pages/notifications/parts/Inbox.tsx': 4,
  'pages/notifications/widget.tsx': 2,
  'pages/programs/parts/OpNote.tsx': 8,
  'pages/programs/sandbox/SandboxEditor.tsx': 7,
  'pages/programs/sandbox/SandboxPanel.tsx': 13,
  'pages/programs/view.tsx': 1,
  'pages/schedules/parts/Detail.tsx': 2,
  'pages/schedules/parts/Editor.tsx': 2,
  'pages/schedules/parts/OpNote.tsx': 7,
  'pages/schedules/view.tsx': 2,
  'pages/scripts/parts/Bits.tsx': 4,
  'pages/scripts/parts/CodeTab.tsx': 3,
  'pages/scripts/parts/MagicPanel.tsx': 1,
  'pages/scripts/parts/SettingsTab.tsx': 4,
  'pages/scripts/parts/VersionPreview.tsx': 1,
  'pages/scripts/parts/opcheck.ts': 0,
  'pages/scripts/view.tsx': 1,
  'pages/vault/parts/EditDrawer.tsx': 2,
  'pages/vault/parts/Holds.tsx': 2,
};
const E2_BASELINE: Readonly<Record<string, number>> = {
  'pages/board/parts/lifecycle.ts': 1,
  'pages/scripts/parts/AiDrawer.tsx': 1,
  'pages/scripts/parts/CodeTab.tsx': 1,
};
const E3_BASELINE: readonly string[] = ['pages/account/strings.en.json suspended.lead', 'pages/ai/strings.en.json err.rateSoon'];

describe('error details', () => {
  it('every error surface passes error= (or a noDetails: reason)', () => {
    ratchet(
      counts(surfacesWithoutDetails),
      E1_BASELINE,
      'pass the rejection as error={e} (ErrorState, OutcomeBanner, Outcome, OutcomeSlot, FormFooter, Band warn/danger), use showErrorToast for an error/warn/unknown toast, or say why not in a `noDetails: <why>` comment inside the tag',
    );
  });

  it('no raw API message in JSX or props', () => {
    ratchet(counts(rawMessages), E2_BASELINE, "the words come from the map (error={e}); the API's own message shows only inside Details");
  });

  it('no page string restates a sentence of the map', () => {
    // The map's sentences only (its labels, such as Details or Close, are ordinary words).
    const table = kitStateStrings as Record<string, string>;
    const mapped = new Map(ERROR_WORD_KEYS.map((k) => [(table[k] ?? '').trim().toLowerCase(), k]));
    const restated: string[] = [];
    // Today's restatements: each goes when its page passes error= instead. Only shrinks.
    const known = new Set(E3_BASELINE);
    for (const f of ALL.filter((x) => /^pages\/[^/]+\/.*strings[^/]*\.en\.json$/.test(x) && inScope(x))) {
      const page = JSON.parse(readFileSync(join(SRC, f), 'utf8')) as Record<string, unknown>;
      for (const [k, v] of Object.entries(page)) {
        const hit = typeof v === 'string' ? mapped.get(v.trim().toLowerCase()) : undefined;
        if (hit && !known.has(`${f} ${k}`)) restated.push(`${f} ${k} = ${hit}`);
      }
    }
    expect(restated, 'use error={e} (the map says it) or a words={{ CODE: key }} override, never a copy').toEqual([]);
  });

  it('no source matches the realm-mismatch text', () => {
    const elsewhere = Object.entries(read(isSource))
      .filter(([, text]) => REALM_PHRASE.test(text))
      .map(([f]) => f);
    expect(elsewhere, 'core keeps no API message, so nothing can match it: the realm mismatch reads as the general 403 (the API has no code of its own for it)').toEqual([]);
  });

  it("core's facts are exactly these, and Details shows each of them but the message and the retry wait", () => {
    const info = errorInfo({ status: 500, data: { x: 1 }, details: 1, body: 'b', headers: {}, url: 'u' }, { page: 'keys' });
    const SHOWN = ['at', 'code', 'outcome', 'page', 'route', 'status', 'traceId'] as const;
    // perm: the sentence says it as words (what the shared link can't do, the right to ask for).
    const HIDDEN = ['message', 'perm', 'retryAfterMs'];
    expect(Object.keys(info).sort()).toEqual([...SHOWN, ...HIDDEN].sort());
    expect(errorLines(info, makeT(kitStateStrings))).toHaveLength(SHOWN.length);
    const other: Record<(typeof SHOWN)[number], unknown> = { at: '2001-02-03 04:05:06', code: 'ZZ_CODE', outcome: info.outcome === 'pending' ? 'failed' : 'pending', page: 'scripts', route: 'zz.route', status: 418, traceId: 'zz-trace' };
    // Each shown fact changes what Details shows and copies.
    for (const f of SHOWN) expect(errorText({ ...info, [f]: other[f] } as ErrorInfo), f).not.toBe(errorText(info));
  });

  describe('the scanners', () => {
    it.each([
      ["import { ErrorState as Failure } from '@kit';\nconst v = <Failure title=\"Oops\" />;", 1],
      ["import * as Kit from '@kit';\nconst v = <Kit.ErrorState title=\"Oops\" />;", 1],
      ["import { showToast as toast } from '@kit';\ntoast({ tone: 'error', title: 'Oops' });", 1],
      ["import { ErrorState as Failure } from '@kit';\nconst v = <Failure error={e} />;", 0],
      ["import { Band } from './Bits';\nconst v = <Band tone=\"danger\">Oops</Band>;", 1],
    ])('E1 (whole file) %s → %i', (code, n) => {
      expect(surfacesWithoutDetails(code)).toBe(n);
    });
    it.each([
      ['try { await send(); } catch (failureError) { v = <p>{(failureError as Error).message}</p>; }', 1],
      ['try { await send(); } catch (e) { const msg = (e as Error).message; v = <p>{msg}</p>; }', 1],
      ['send().catch((why) => setText(<p>{why.message}</p>));', 1],
      ['const msg = note.message; v = <p>{msg}</p>;', 0],
      ['const diagnostics = { message: error.message }; console.debug(diagnostics);', 0],
      ['const entry = { message: String(r.msg || r.message || "") };', 0],
    ])('E2 (whole file) %s → %i', (code, n) => {
      expect(rawMessages(code)).toBe(n);
    });
    it('the ratchet is exact: a count above its row fails, and one below it says to lower the row', () => {
      // Every file in scope, whatever HUB_CHECK_PAGE selects for the real scan.
      const offRows = (f: Record<string, number>, b: Readonly<Record<string, number>>, fix: string) => offRowsIn(f, b, fix, () => true);
      const base = { 'pages/a/x.tsx': 2 };
      expect(offRows({ 'pages/a/x.tsx': 3 }, base, 'fix')).toEqual(['pages/a/x.tsx: 3 (allowed 2): fix']);
      expect(offRows({ 'pages/a/x.tsx': 1 }, base, 'fix')).toEqual(["pages/a/x.tsx: 1, below its row 2: wiring error= on a page: lower that page's row to 1 in the same change"]);
      expect(offRows({}, base, 'fix')).toHaveLength(1);
      expect(offRows({ 'pages/a/new.tsx': 1 }, {}, 'fix')).toEqual(['pages/a/new.tsx: 1 (allowed 0): fix']);
      expect(offRows({ 'pages/a/x.tsx': 2 }, base, 'fix')).toEqual([]);
    });
    it.each(['/requested realm/', '/requested\\s+realm/i', '/requested[ ]realm/', '/requested\\x20realm/', '/requested\\s{1,}realm/i', '/requested[\\x20]realm/', "'requested' + ' realm'"])('sees %s', (code) => {
      expect(REALM_PHRASE.test(code)).toBe(true);
    });
    it.each([
      ['<Band tone = "danger">Oops</Band>', 1],
      ['<Band {...p}>Oops</Band>', 1],
      ['<Band tone="neutral">Fine</Band>', 0],
      ['<Band>Fine</Band>', 0],
      ['<ErrorState error = {err} />', 0],
      ['<ErrorState title="x" />', 1],
      ['<Outcome outcome="done" />', 0],
      ['<OutcomeBanner kind={"done"} />', 0],
      ['<OutcomeBanner kind="failed" /* noDetails: shown in the toast */ />', 0],
      ["showToast ({ tone: 'error', title: 'Oops' })", 1],
      ["showToast({ tone: 'ok', title: 'Saved' })", 0],
      ["showToast({ tone: t, title: 'x' })", 1],
      ["showToast({ tone: 'error', title: 'x', details: info })", 0],
      ['showToast(content)', 1],
      ['<Band tone="neutral" {...props}>Oops</Band>', 1],
      ['<Band tone="neutral" {...{ tone: "danger" }}>Oops</Band>', 1],
      ['<Band {...props} tone="neutral">Fine</Band>', 0],
      ['<OutcomeBanner kind="done" {...props} />', 1],
      ['<OutcomeBanner error={e} {...props} />', 1],
      ["showToast({ tone: 'info', ...props })", 1],
      ["showToast({ tone: 'ok', ...{ tone: 'error', title: 'x' } })", 1],
      ["showToast({ tone: 'error', ['details']: info })", 0],
      ['<OutcomeBanner kind="failed" error={e} {...{ error: undefined }} />', 1],
      ['<ErrorState error={null} />', 1],
      ['<ErrorState error={undefined} {...{ error: e }} />', 0],
      ["showToast({ tone: 'error', details: info, ...{ details: undefined } })", 1],
      ['<Outcome outcome={{ kind: "done" }} />', 0],
      ['<Outcome outcome={{ kind: "failed" }} />', 1],
      ['<Band {...({ tone: "neutral" } as const)}>Fine</Band>', 0],
      ["showToast(ok ? { tone: 'ok', title: 'a' } : { tone: 'info', title: 'b' })", 0],
      ["showToast(ok ? { tone: 'ok', title: 'a' } : { tone: 'warn', title: 'b' })", 1],
      ['<Band tone={"neutral" as const}>Fine</Band>', 0],
      ['<OutcomeBanner kind={"done" as const} />', 0],
      ['<Band tone={"danger" as const}>Oops</Band>', 1],
      // A branch that drops the wiring counts; casts around toast content are read.
      ['<ErrorState error={ok ? err : undefined} />', 1],
      ['<ErrorState error={null ?? undefined} />', 1],
      ['<ErrorState error={ok && err} />', 1],
      ['<ErrorState error={ok ? err : other} />', 0],
      ['<ErrorState error={err ?? fallback} />', 0],
      ['<ErrorState error={e} {...{ error: reveal ? e : undefined }} />', 1],
      ["showToast({ tone: 'error', details: reveal ? info : undefined })", 1],
      ["showToast({ tone: 'info', title: 'Saved' } as const)", 0],
      ["showToast(({ tone: 'error', details: info }) satisfies ToastContent)", 0],
      ["showToast({ tone: 'warn', title: 'x' } as const)", 1],
      // A noDetails: reason is a comment with words, on its own surface only.
      ['<ErrorState /* noDetails: */ title="Oops" />', 1],
      ['<ErrorState title="noDetails: shown" />', 1],
      ['<ErrorState title="x" secondary={<OutcomeBanner kind="failed" /* noDetails: shown in the toast */ />} />', 1],
      ['<ErrorState title="x" // noDetails: the page says it above\n />', 0],
      // Outcomes that cannot show an error.
      ['<Outcome outcome={null} />', 0],
      ['<OutcomeSlot outcome="idle"><b /></OutcomeSlot>', 0],
    ])('E1 %s → %i', (code, n) => {
      expect(surfacesWithoutDetails(`const v = () => ${code};`)).toBe(n);
    });
    it.each([
      ['<p>{error && error.message}</p>', 1],
      ["<p>{error instanceof Error ? error.message : 'Unknown'}</p>", 1],
      ['<ErrorState error={result.error} body={result.error?.message} />', 1],
      ['<p>{mutation.error.message}</p>', 1],
      ['<p>{(e as Error).message}</p>', 1],
      ['({ kind: "failed", message: r.error.message })', 1],
      ['<p>{`Failed: ${err.message}`}</p>', 1],
      ['<p>{isRealmMismatch(e.message) ? "a" : "b"}</p>', 0],
      ['<p>{e.message ? "a" : "b"}</p>', 0],
      ['<p>{note.message}</p>', 0],
      ['<p>{(note as Note).message}</p>', 0],
      ['<p>{error["message"]}</p>', 1],
      ['<p>{"Oops: " + error.message}</p>', 1],
      ['<ErrorState error={err} body={"Failed: " + err.message} />', 1],
      ['<p>{String(error.message)}</p>', 1],
      ['<p>{error.message.trim()}</p>', 1],
      ['<p>{error.message.length}</p>', 0],
      ['<p>{mutation["error"].message}</p>', 1],
      ['<p>{"Oops: ".concat(error.message)}</p>', 1],
      ['<p>{t("x").replace("{m}", err.message)}</p>', 1],
      ['<p>{note["text"].message}</p>', 0],
      ['console.debug({ message: error.message })', 0],
    ])('E2 %s → %i', (code, n) => {
      expect(rawMessages(`const v = () => ${code};`)).toBe(n);
    });
  });
});
