// Playwright guardrail: on every page with a tab strip, the first tab starts at the
// inset of the header it sits under, at 1440 and at 390, and a stuck strip never covers that header's actions. Since the
// folder tabs a tab is a drawn box with its label inside: the box's start edge is what lines up
// with the header (it was the label's text while tabs were bare labels over an underline).
// Nothing is listed by hand except the exceptions below. At collection time the spec reads each page folder whose code
// draws a strip (<Tabs>, or a DetailPage with tabs): its path from page.ts and, through the TypeScript parser, the
// paths of the exported shots that take no action. A shot path the spec cannot read fails the collection test.
// In the browser it opens each URL as written and measures the first drawn strip in the main area against the
// header before it: the title's text, or a control the header puts before the title (none today: "Show list" sits at
// the end of the header actions, so a ?list=0 URL lines up with the title too).
// Every page must complete a comparison at both widths, unless EXCEPTIONS states exactly what it shows instead.
import fs from 'node:fs';
import path from 'node:path';
import { type Page, expect, test } from '@playwright/test';
import ts from 'typescript';
import { gotoHub } from '@app/e2e';

const SRC = [path.resolve('hub/src'), path.resolve('src')].find((d) => fs.existsSync(path.join(d, 'pages'))) ?? path.resolve('hub/src');

/** What a page shows at a width instead of a strip under a drawn title, checked as stated. */
const EXCEPTIONS: Record<string, Partial<Record<number, 'strip-no-title' | 'no-strip'>>> = {
  // The Board's [Main] [Board 2] strip sits under a title only screen readers get; on a phone the boards are a picker.
  board: { 1440: 'strip-no-title', 390: 'no-strip' },
  // The AI tab: at m and wider the pane index is its only sub-navigation, so its screens draw
  // no page tabs under a title. The URLs read here are /ai (the tab, from page.ts) and the ai shots, which all open
  // Models & keys; none opens a folder's page (whose tabs belong to that one object) or a phone
  // Automations/Knowledge screen (tabs return on phones).
  ai: { 1440: 'no-strip', 390: 'no-strip' },
};

/** Fixture states that show a loading placeholder on purpose (kit Skeleton): the only ones a placeholder still drawn
 *  after open() is not reported for. */
const LOADING_STATE = /(^|-)loading$/;

/** One URL's bounded waits in open() (heading 15 s, strip 2.5 s, placeholder 10 s) plus load, measure and scroll. */
const PER_URL_MS = 45_000;

/** Shot fields that only say what to open: a shot with any other field acts first, and is not a plain view. */
const PASSIVE = new Set(['name', 'state', 'path', 'waitForText', 'noOutcome', 'extra']);

interface Url {
  url: string;
  state: string | undefined;
  /** The shot (or page path) it came from, for messages. */
  from: string;
}

interface Target {
  id: string;
  urls: Url[];
}

// ── Reading shots.ts ──────────────────────────────────────────────────────────────────────────────────────────────

type Value = string | number | boolean | null | undefined | Value[] | { [k: string]: Value } | Fn;
interface Fn {
  fn: ts.ArrowFunction | ts.FunctionExpression;
  scope: Scope;
}
type Scope = Map<string, Value>;

class Unresolved extends Error {}

const isFn = (v: Value): v is Fn => typeof v === 'object' && v !== null && !Array.isArray(v) && 'fn' in v && 'scope' in v;

function unwrap(node: ts.Expression): ts.Expression {
  let n = node;
  while (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isSatisfiesExpression(n) || ts.isTypeAssertionExpression(n) || ts.isNonNullExpression(n)) n = n.expression;
  return n;
}

const propName = (name: ts.PropertyName): string | undefined => (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name) ? name.text : undefined);

/** Evaluates the small part of TypeScript a shots.ts writes paths in: literals, templates, `+`, top-level consts,
 *  arrow helpers (defaults included), arrays, objects, property reads, encodeURIComponent, `===`/`!==` on plain values,
 *  text `.replace(a, b)` and array `.map(arrow)`. Anything else throws. */
function evaluator(sf: ts.SourceFile) {
  const decls = new Map<string, ts.Expression>();
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st) || !(st.declarationList.flags & ts.NodeFlags.Const)) continue;
    for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && d.initializer) decls.set(d.name.text, d.initializer);
  }
  const top: Scope = new Map();
  const where = (n: ts.Node) => `${ts.SyntaxKind[n.kind]} \`${n.getText(sf).slice(0, 60)}\``;

  const call = (f: Fn, args: readonly Value[]): Value => {
    const scope: Scope = new Map(f.scope);
    f.fn.parameters.forEach((p, i) => {
      if (!ts.isIdentifier(p.name)) throw new Unresolved(where(p));
      const given = args[i];
      scope.set(p.name.text, given === undefined && p.initializer ? ev(p.initializer, scope) : given);
    });
    const body = f.fn.body;
    if (!ts.isBlock(body)) return ev(body, scope);
    const [only] = body.statements;
    if (body.statements.length !== 1 || !only || !ts.isReturnStatement(only) || !only.expression) throw new Unresolved(where(body));
    return ev(only.expression, scope);
  };

  const ev = (node: ts.Expression, scope: Scope): Value => {
    const n = unwrap(node);
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
    if (ts.isNumericLiteral(n)) return Number(n.text);
    if (n.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (n.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (n.kind === ts.SyntaxKind.NullKeyword) return null;
    if (ts.isTemplateExpression(n)) {
      let s = n.head.text;
      for (const span of n.templateSpans) {
        const v = ev(span.expression, scope);
        if (typeof v !== 'string' && typeof v !== 'number') throw new Unresolved(where(span.expression));
        s += String(v) + span.literal.text;
      }
      return s;
    }
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const a = ev(n.left, scope);
      const b = ev(n.right, scope);
      if (typeof a === 'string' && (typeof b === 'string' || typeof b === 'number')) return a + String(b);
      if (typeof a === 'number' && typeof b === 'string') return String(a) + b;
      if (typeof a === 'number' && typeof b === 'number') return a + b;
      throw new Unresolved(where(n));
    }
    if (ts.isIdentifier(n)) {
      if (n.text === 'undefined') return undefined;
      if (scope.has(n.text)) return scope.get(n.text);
      if (top.has(n.text)) return top.get(n.text);
      const init = decls.get(n.text);
      if (!init) throw new Unresolved(where(n));
      const v = ev(init, top);
      top.set(n.text, v);
      return v;
    }
    if (ts.isBinaryExpression(n) && (n.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken || n.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken)) {
      const a = ev(n.left, scope);
      const b = ev(n.right, scope);
      // Text, numbers, booleans and null only: an array, object or helper never compares.
      const plain = (v: Value) => v === null || v === undefined || ['string', 'number', 'boolean'].includes(typeof v);
      if (!plain(a) || !plain(b)) throw new Unresolved(where(n));
      return n.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken ? a === b : a !== b;
    }
    if (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) return { fn: n, scope };
    if (ts.isCallExpression(n)) {
      const args = n.arguments.map((a) => ev(a, scope));
      // Two methods only: `text.replace('a', 'b')` (both text: the first match, as JavaScript does) and
      // `[...].map(arrow)` (each element through the arrow). Any other method stays unreadable.
      if (ts.isPropertyAccessExpression(n.expression) && (n.expression.name.text === 'replace' || n.expression.name.text === 'map')) {
        const recv = ev(n.expression.expression, scope);
        const [a, b] = args;
        if (n.expression.name.text === 'replace' && typeof recv === 'string' && typeof a === 'string' && typeof b === 'string' && args.length === 2) return recv.replace(a, () => b);
        if (n.expression.name.text === 'map' && Array.isArray(recv) && isFn(a) && args.length === 1) return recv.map((v) => call(a, [v]));
        throw new Unresolved(where(n));
      }
      if (ts.isIdentifier(n.expression) && n.expression.text === 'encodeURIComponent' && !scope.has('encodeURIComponent') && !decls.has('encodeURIComponent')) {
        const [a] = args;
        if (typeof a !== 'string' && typeof a !== 'number') throw new Unresolved(where(n));
        return encodeURIComponent(a);
      }
      const f = ev(n.expression, scope);
      if (!isFn(f)) throw new Unresolved(where(n));
      return call(f, args);
    }
    if (ts.isArrayLiteralExpression(n)) {
      const out: Value[] = [];
      for (const e of n.elements) {
        if (ts.isSpreadElement(e)) {
          const v = ev(e.expression, scope);
          if (!Array.isArray(v)) throw new Unresolved(where(e));
          out.push(...v);
        } else out.push(ev(e, scope));
      }
      return out;
    }
    if (ts.isObjectLiteralExpression(n)) {
      const out: { [k: string]: Value } = {};
      for (const p of n.properties) {
        if (ts.isPropertyAssignment(p)) {
          const k = propName(p.name);
          if (k === undefined) throw new Unresolved(where(p));
          out[k] = ev(p.initializer, scope);
        } else if (ts.isShorthandPropertyAssignment(p)) out[p.name.text] = ev(p.name, scope);
        else if (ts.isSpreadAssignment(p)) {
          const v = ev(p.expression, scope);
          if (typeof v !== 'object' || v === null || Array.isArray(v) || isFn(v)) throw new Unresolved(where(p));
          Object.assign(out, v);
        } else throw new Unresolved(where(p));
      }
      return out;
    }
    if (ts.isPropertyAccessExpression(n)) {
      const o = ev(n.expression, scope);
      if (typeof o !== 'object' || o === null || Array.isArray(o) || isFn(o)) throw new Unresolved(where(n));
      return o[n.name.text];
    }
    if (ts.isConditionalExpression(n)) return ev(n.condition, scope) ? ev(n.whenTrue, scope) : ev(n.whenFalse, scope);
    throw new Unresolved(where(n));
  };
  return { ev: (n: ts.Expression) => ev(n, top), where };
}

/** The exported shots of a shots.ts that only open a view: [name, path, state]. A shot whose fields cannot be read,
 *  or a passive shot whose path or state cannot, is a problem: the spec must not skip a view it cannot see. */
function passiveShots(file: string, problems: string[]): { name: string; path: string; state: string | undefined }[] {
  const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const { ev, where } = evaluator(sf);
  const exported = sf.statements.find((s): s is ts.ExportAssignment => ts.isExportAssignment(s) && !s.isExportEquals);
  let arr = exported && unwrap(exported.expression);
  if (arr && ts.isIdentifier(arr)) {
    const name = arr.text;
    const decl = sf.statements.flatMap((s) => (ts.isVariableStatement(s) ? [...s.declarationList.declarations] : [])).find((d) => ts.isIdentifier(d.name) && d.name.text === name);
    arr = decl?.initializer && unwrap(decl.initializer);
  }
  if (!arr || !ts.isArrayLiteralExpression(arr)) {
    problems.push(`${file}: no exported array of shots`);
    return [];
  }
  const out: { name: string; path: string; state: string | undefined }[] = [];
  const take = (shot: { [k: string]: Value }, at: string) => {
    if (!Object.keys(shot).every((k) => PASSIVE.has(k))) return;
    const { name, path: p = '', state } = shot;
    if (typeof name !== 'string' || typeof p !== 'string' || (state !== undefined && typeof state !== 'string')) problems.push(`${file}: shot ${at} has a name, path or state that is not text`);
    else out.push({ name, path: p, state });
  };
  for (const el of arr.elements) {
    try {
      const n = ts.isSpreadElement(el) ? el : unwrap(el);
      if (ts.isObjectLiteralExpression(n)) {
        // Fields first: a shot that acts is left alone, so its act steps need not be readable.
        const keys = n.properties.map((p) => (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p) ? propName(p.name) : undefined));
        if (keys.every((k) => k !== undefined) && keys.some((k) => !PASSIVE.has(k))) continue;
        const v = ev(n);
        if (typeof v === 'object' && v !== null && !Array.isArray(v) && !isFn(v)) take(v, where(n));
        continue;
      }
      const v = ts.isSpreadElement(n) ? ev(n.expression) : ev(n);
      for (const s of Array.isArray(v) ? v : [v]) {
        if (typeof s !== 'object' || s === null || Array.isArray(s) || isFn(s)) throw new Unresolved(where(n));
        take(s, where(n));
      }
    } catch (e) {
      if (!(e instanceof Unresolved)) throw e;
      problems.push(`${file}: cannot read ${e.message}`);
    }
  }
  return out;
}

/** Some non-test source file of the page folder matches. */
function sourceHas(dir: string, re: RegExp): boolean {
  const walk = (d: string): boolean =>
    fs.readdirSync(d, { withFileTypes: true }).some((e) => {
      const f = path.join(d, e.name);
      if (e.isDirectory()) return walk(f);
      if (!/\.tsx$/.test(e.name) || /\.(test|spec)\.tsx$/.test(e.name)) return false;
      return re.test(fs.readFileSync(f, 'utf8'));
    });
  return walk(dir);
}

function collect(): { targets: Target[]; problems: string[] } {
  const pages = path.join(SRC, 'pages');
  const targets: Target[] = [];
  const problems: string[] = [];
  for (const id of fs.readdirSync(pages).sort()) {
    const dir = path.join(pages, id);
    const manifest = path.join(dir, 'page.ts');
    if (!fs.existsSync(manifest) || !sourceHas(dir, /<Tabs\b|\btabs=\{/)) continue;
    const base = /\bpath:\s*(['"])(.*?)\1/.exec(fs.readFileSync(manifest, 'utf8'))?.[2];
    if (!base) {
      problems.push(`${manifest}: no path`);
      continue;
    }
    // Every URL as written (tab= picks a branch: Programs' apps tab is another layout), each once; a fixture state
    // only for a URL no stateless shot opens, the first state named for it.
    const urls = new Map<string, Url>([[base, { url: base, state: undefined, from: 'page.ts' }]]);
    const shotsFile = path.join(dir, 'shots.ts');
    const shots = fs.existsSync(shotsFile) ? passiveShots(shotsFile, problems) : [];
    for (const s of shots) if (!s.state && !urls.has(base + s.path)) urls.set(base + s.path, { url: base + s.path, state: undefined, from: s.name });
    for (const s of shots) if (s.state && !urls.has(base + s.path)) urls.set(base + s.path, { url: base + s.path, state: s.state, from: s.name });
    // A fill-mode detail with its list hidden, one such URL per page: its title must start at the inset as well.
    const sel = [...urls.values()].find((u) => /[?&]sel=/.test(u.url) && !/[?&]list=/.test(u.url));
    if (sel) urls.set(`${sel.url}&list=0`, { ...sel, url: `${sel.url}&list=0`, from: `${sel.from} + list=0` });
    targets.push({ id, urls: [...urls.values()] });
  }
  return { targets, problems };
}

// ── In the browser ────────────────────────────────────────────────────────────────────────────────────────────────

interface Measured {
  strip: boolean;
  settled?: boolean;
  /** A strip was seen, then went and did not come back within the settle budget. */
  lost?: boolean;
  tab?: string;
  tabLeft?: number;
  /** The header item the strip lines up with: the title's text, or a control before the title. */
  head?: string | null;
  headLeft?: number;
}

/** The first drawn strip's first tab text, against the header before it, with the strip at its start. */
const measure = (page: Page): Promise<Measured> =>
  page.evaluate(async () => {
    const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
    // Drawn on screen: a visually hidden heading (1 px, clipped) is not a title a strip lines up with.
    const drawn = (el: Element) => {
      const r = el.getBoundingClientRect();
      return (el as HTMLElement).offsetParent !== null && r.width > 2 && r.height > 2 && getComputedStyle(el).visibility !== 'hidden';
    };
    const main = document.getElementById('hub-main');
    if (!main) return { strip: false };
    const textStart = (el: Element) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP) });
      const node = walker.nextNode();
      if (!node) return el.getBoundingClientRect().left;
      const range = document.createRange();
      range.selectNodeContents(node);
      return range.getBoundingClientRect().left;
    };
    // The strip and its title, found afresh at every reading: a page can swap the subtree that drew them (Programs'
    // apps branch draws a strip and a heading in its loading fallback, then replaces both).
    const find = () => {
      const list = Array.from(main.querySelectorAll('[role=tablist]')).find(drawn);
      const tab = list?.querySelector('[role=tab]');
      if (!list || !tab) return undefined;
      // The title is the first drawn heading of the nearest box around the strip that has one before it: the pane's
      // DetailHeader, or the page header. A card between the title and the strip (a pinned gate) is not the title.
      let head: Element | undefined;
      for (let el = list.parentElement; el && !head; el = el === main ? null : el.parentElement)
        head = Array.from(el.querySelectorAll('h1, h2')).find((h) => drawn(h) && h.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING);
      return { list, tab, head };
    };
    // Where the first tab's box starts with the strip at its start. A narrow strip keeps its open tab in view (Tabs
    // scrolls it back whenever its edges change), so nothing is scrolled: the strip's scroll offset is added back,
    // and the start chevron it shows while scrolled is taken off (it sits before the scroller in the strip's flow).
    const atStart = (tab: Element) => {
      const scroller = tab.closest('[role=tablist]')?.parentElement;
      const edge = (t: Element) => t.getBoundingClientRect().left;
      if (!scroller || !/auto|scroll/.test(getComputedStyle(scroller).overflowX)) return edge(tab);
      const strip = scroller.parentElement ?? scroller;
      return edge(tab) + scroller.scrollLeft - (scroller.getBoundingClientRect().left - strip.getBoundingClientRect().left);
    };
    // The route stays as written. Read until two readings two frames apart agree on the same strip, tab and title
    // nodes (still in the document) and on where the tab and the title start: the open-tab frame has run, and a
    // subtree swapped meanwhile starts the count again. A strip that goes for a reading (a subtree swapped out before
    // its replacement drew) is read again within the same budget; one that never comes back is reported, not skipped.
    let at = find();
    if (!at) return { strip: false };
    let last = Number.NaN;
    let lastHead = Number.NaN;
    let settled = false;
    let gone = false;
    for (let i = 0; i < 20 && !settled; i++) {
      await frame();
      await frame();
      const now = find();
      gone = !now;
      if (!now) {
        last = Number.NaN;
        lastHead = Number.NaN;
        continue;
      }
      const same = now.list === at.list && now.tab === at.tab && now.head === at.head && now.list.isConnected;
      at = now;
      const tabNow = atStart(now.tab);
      const headNow = now.head ? textStart(now.head) : 0;
      settled = same && Math.abs(tabNow - last) < 0.01 && Math.abs(headNow - lastHead) < 0.01;
      last = tabNow;
      lastHead = headNow;
    }
    const { tab, head } = at;
    if (gone) return { strip: true, settled: false, lost: true, tab: tab.textContent?.trim() ?? '' };
    if (!head) return { strip: true, settled, tab: tab.textContent?.trim() ?? '', tabLeft: last, head: null };
    // The header starts where its first item does: a control drawn before the title in the same header leads it.
    const box = head.closest('header') ?? head.parentElement;
    const lead = box && Array.from(box.querySelectorAll('button, a[href], [role=button]')).find((c) => drawn(c) && !c.contains(head) && c.compareDocumentPosition(head) & Node.DOCUMENT_POSITION_FOLLOWING);
    const headLeft = lead ? Math.min(lead.getBoundingClientRect().left, textStart(head)) : textStart(head);
    const name = lead ? `${lead.getAttribute('aria-label') ?? lead.textContent?.trim()} (before "${head.textContent?.trim().slice(0, 30)}")` : head.textContent?.trim().slice(0, 40);
    return { strip: true, settled, tab: tab.textContent?.trim() ?? '', tabLeft: last, head: name ?? '', headLeft };
  });

interface Scrolled {
  /** The strip sticks at all. */
  sticky: boolean;
  /** It reached its stuck place while the content scrolled under it. */
  stuck: boolean;
  /** Header controls the strip covered (it took a point of theirs), at the scroll offset it did. */
  covered: string[];
  /** Scroll offsets where the stuck strip was itself under something else (a header, a table head). */
  hidden: string[];
  /** Header controls not reachable at the start, before any scroll (something covers their centre). */
  blocked: string[];
}

/** Scrolls the strip's scroll box from where it is to past the strip's stuck place, a frame per step, and checks at
 *  each step by hit-testing what a pointer reaches: no point of a header control still on screen lands in the strip,
 *  and the stuck strip's open tab is not under anything. Then it scrolls back. A URL with a dialog or drawer open is
 *  not scrolled: the overlay covers the pane on purpose. */
const scrollCheck = (page: Page): Promise<Scrolled> =>
  page.evaluate(async () => {
    const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
    const drawn = (el: Element) => {
      const r = el.getBoundingClientRect();
      return (el as HTMLElement).offsetParent !== null && r.width > 2 && r.height > 2 && getComputedStyle(el).visibility !== 'hidden';
    };
    const none: Scrolled = { sticky: false, stuck: false, covered: [], hidden: [], blocked: [] };
    const main = document.getElementById('hub-main');
    const list = main && Array.from(main.querySelectorAll('[role=tablist]')).find(drawn);
    if (!main || !list) return none;
    if (Array.from(document.querySelectorAll('[role=dialog], [role=alertdialog]')).some(drawn)) return none;
    let bar: HTMLElement | null = null;
    for (let el: HTMLElement | null = list as HTMLElement; el && el !== main && !bar; el = el.parentElement) if (getComputedStyle(el).position === 'sticky') bar = el;
    if (!bar) return none;
    let head: Element | undefined;
    for (let el = list.parentElement; el && !head; el = el === main ? null : el.parentElement)
      head = Array.from(el.querySelectorAll('h1, h2')).find((h) => drawn(h) && h.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING);
    const box = head?.closest('header') ?? head?.parentElement;
    const controls = box ? Array.from(box.querySelectorAll('button, a[href], [role=button], input, select, textarea')).filter(drawn) : [];
    const label = (c: Element) => c.getAttribute('aria-label') ?? (c.textContent?.trim() || c.tagName.toLowerCase());
    let scroller: Element = document.scrollingElement ?? document.documentElement;
    for (let el = bar.parentElement; el; el = el.parentElement) {
      if (/auto|scroll|overlay/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1) {
        scroller = el;
        break;
      }
    }
    const isDoc = scroller === document.scrollingElement || scroller === document.documentElement;
    const view = () => {
      const r = isDoc ? { top: 0, bottom: window.innerHeight } : scroller.getBoundingClientRect();
      return { top: Math.max(0, r.top), bottom: Math.min(window.innerHeight, r.bottom) };
    };
    const reach = (c: Element) => {
      const r = c.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return hit !== null && (c === hit || c.contains(hit));
    };
    const blocked = controls.filter((c) => {
      const r = c.getBoundingClientRect();
      const v = view();
      return r.top >= v.top && r.bottom <= v.bottom && !reach(c);
    }).map(label);
    const from = scroller.scrollTop;
    const stuckAt = Number.parseFloat(getComputedStyle(bar).top) || 0;
    const natural = bar.getBoundingClientRect().top - view().top - stuckAt;
    const to = Math.min(from + Math.max(0, natural) + 160, scroller.scrollHeight - scroller.clientHeight);
    const covered: string[] = [];
    const hidden: string[] = [];
    const tab = list.querySelector('[role=tab][aria-selected=true]') ?? list.querySelector('[role=tab]');
    let stuck = false;
    for (let y = from; y <= to; y = y === to ? to + 1 : Math.min(to, y + 16)) {
      scroller.scrollTop = y;
      await frame();
      const s = bar.getBoundingClientRect();
      const v = view();
      const at = Math.round(scroller.scrollTop);
      if (scroller.scrollTop > from + natural + 1 && Math.abs(s.top - (v.top + stuckAt)) < 1) stuck = true;
      for (const c of controls) {
        const r = c.getBoundingClientRect();
        // The centre and four points 2px inside the corners, those on screen.
        const points = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 2, r.top + 2], [r.right - 2, r.top + 2], [r.left + 2, r.bottom - 2], [r.right - 2, r.bottom - 2]].filter(([, py = 0]) => py > v.top + 1 && py < v.bottom - 1);
        const under = points.some(([px = 0, py = 0]) => {
          const hit = document.elementFromPoint(px, py);
          return hit !== null && bar.contains(hit) && !c.contains(hit);
        });
        if (under && !covered.some((x) => x.startsWith(`${label(c)} at`))) covered.push(`${label(c)} at scroll ${at}`);
      }
      // Only while stuck: a strip whose box scrolls away passes under the header, as it should.
      const tr = tab?.getBoundingClientRect();
      if (tab && tr && Math.abs(s.top - (v.top + stuckAt)) < 1 && tr.top >= v.top && tr.bottom <= v.bottom) {
        const hit = document.elementFromPoint(tr.left + tr.width / 2, tr.top + tr.height / 2);
        if (hit !== null && !bar.contains(hit) && hidden.length < 3) hidden.push(`scroll ${at} (under ${hit.closest('header') ? 'the header' : hit.tagName.toLowerCase()})`);
      }
    }
    scroller.scrollTop = from;
    await frame();
    await frame();
    return { sticky: true, stuck, covered, hidden, blocked };
  });

/** Waits for the page's code and title, gives a strip time to draw (a URL may show none), then waits for the route's
 *  own content: a drawn loading placeholder (kit Skeleton) in the main area means a branch is still pending, and a
 *  Suspense fallback can draw the same header and strip as the content it stands for (Programs' apps tab). Answers
 *  false when one is still drawn after the wait. */
async function open(page: Page, u: Url): Promise<boolean> {
  // A real load of every URL: from the previous URL, a goto that changes only the hash would be an in-app move that
  // keeps the previous view's state (kit/data/dataview-pages.spec.ts fresh()).
  await page.goto('about:blank');
  await gotoHub(page, u.url, { state: u.state });
  await expect(page.locator('#hub-main').locator('h1:visible, h2:visible').first(), `${u.url}: no heading drew`).toBeVisible({ timeout: 15_000 });
  await page
    .waitForFunction(
      () =>
        Array.from(document.querySelectorAll('#hub-main [role=tablist]')).some((e) => {
          const r = e.getBoundingClientRect();
          return r.width > 2 && r.height > 2;
        }),
      null,
      { timeout: 2_500 },
    )
    .catch(() => undefined);
  return page
    .waitForFunction(
      () =>
        !Array.from(document.querySelectorAll('#hub-main [data-skeleton]')).some((e) => {
          const r = e.getBoundingClientRect();
          return r.width > 2 && r.height > 2;
        }),
      null,
      { timeout: 10_000 },
    )
    .then(() => true, () => false);
}

// ── Tests ─────────────────────────────────────────────────────────────────────────────────────────────────────────

const { targets: all, problems } = collect();

test('the spec reads every page that draws a strip and every shot path that opens a view', () => {
  expect(problems).toEqual([]);
  expect(all.map((t) => t.id)).toEqual(expect.arrayContaining(['board', 'bots', 'computers', 'keys', 'programs', 'scripts']));
  const urls = (id: string) => all.find((t) => t.id === id)?.urls.map((u) => u.url) ?? [];
  // A constant path, literal subroutes, a helper call with a default, tab= kept, and a passive shot after acting ones.
  expect(urls('keys')).toEqual(expect.arrayContaining(['/keys?sel=hdy_9e37.3779b1', '/keys/ssh', '/keys/shared']));
  expect(urls('board')).toEqual(expect.arrayContaining(['/board', '/board/open/nowhere.0000/terminal-1']));
  expect(urls('bots')).toEqual(expect.arrayContaining(['/bots?sel=c-atlas~a1b2c3d4e5f60718293a4b5c~chief', '/bots?sel=c-atlas~a1b2c3d4e5f60718293a4b5c~chief&tab=link']));
  expect(urls('programs')).toEqual(expect.arrayContaining(['/programs?tab=apps', '/programs?tab=apps&appsel=a1b2c3']));
  expect(urls('scripts')).toEqual(expect.arrayContaining(['/scripts?sel=atlas.00a1~weather.ts&tab=code', '/scripts?sel=atlas.00a1~weather.ts&list=0']));
});

for (const width of [1440, 390]) {
  for (const t of all) {
    const exception = EXCEPTIONS[t.id]?.[width];
    test(`${t.id} at ${width}: the first tab starts at its header's inset, and a stuck strip covers none of its actions`, async ({ page }) => {
      test.setTimeout(30_000 + t.urls.length * PER_URL_MS);
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      let compared = 0;
      const strips: string[] = [];
      const titleless: string[] = [];
      const off: string[] = [];
      for (const u of t.urls) {
        const loaded = await open(page, u);
        const at = `${u.url}${u.state ? ` (${u.state})` : ''}`;
        // Reported whether or not a strip drew: a view still loading after the wait is a placeholder (a Suspense fallback
        // can draw the same header and strip), not the page. Only the loading fixture states show one on purpose.
        if (!loaded && !(u.state && LOADING_STATE.test(u.state))) off.push(`${at}: still loading 10 s after it opened (a placeholder, not the page, would be measured)`);
        const m = await measure(page);
        if (!m.strip) continue;
        strips.push(at);
        if (m.lost) {
          off.push(`${at}: the strip "${m.tab}" went while it settled and did not come back`);
          continue;
        }
        if (!m.settled) off.push(`${at}: the strip's start did not settle`);
        if (m.headLeft === undefined) {
          titleless.push(at);
          continue;
        }
        compared++;
        if (Math.abs((m.tabLeft ?? 0) - m.headLeft) > 0.5) off.push(`${at}: "${m.tab}" starts at ${m.tabLeft?.toFixed(1)}, the header's "${m.head}" at ${m.headLeft.toFixed(1)}`);
        const sc = await scrollCheck(page);
        for (const c of sc.covered) off.push(`${at}: the strip covers the header's ${c}`);
        for (const h of sc.hidden) off.push(`${at}: the strip's open tab is covered at ${h}`);
      }
      if (exception === 'no-strip') expect(strips, `${t.id} at ${width} draws no strip`).toEqual([]);
      else if (exception === 'strip-no-title') {
        expect(strips.length, `${t.id} at ${width} draws a strip at ${t.urls.map((u) => u.url).join(', ')}`).toBeGreaterThan(0);
        expect(compared, `${t.id} at ${width}: its strip has no drawn title above it`).toBe(0);
      } else {
        expect(titleless, `${t.id} at ${width}: strips with no drawn title above them`).toEqual([]);
        expect(compared, `${t.id} at ${width}: no strip under a drawn title at ${t.urls.map((u) => u.url).join(', ')}`).toBeGreaterThan(0);
      }
      expect(off).toEqual([]);
    });
  }
}

test('scripts at 390: scrolled under the strip, the wrapped header has gone and its actions were reachable until then', async ({ page }) => {
  test.setTimeout(30_000 + PER_URL_MS);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await open(page, { url: '/scripts?sel=atlas.00a1~weather.ts', state: undefined, from: 'detail-overview' }), 'the page loaded').toBe(true);
  const sc = await scrollCheck(page);
  expect(sc.sticky).toBe(true);
  expect(sc.stuck, 'the strip reached its stuck place').toBe(true);
  expect(sc.blocked).toEqual([]);
  expect(sc.covered).toEqual([]);
  expect(sc.hidden).toEqual([]);
  await expect(page.getByRole('button', { name: 'Try it', exact: true })).toBeVisible();
});
